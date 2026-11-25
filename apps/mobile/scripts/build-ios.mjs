#!/usr/bin/env node
/**
 * Zero-secret iOS build, Apple API Key automatic signing, and TestFlight upload script.
 *
 * Credentials are loaded strictly at runtime from environment variables or --env-file:
 *   APPLE_TEAM_ID      (10-char Apple Developer Team ID)
 *   APPLE_API_KEY_ID   (App Store Connect API Key ID)
 *   APPLE_API_ISSUER   (App Store Connect Issuer UUID)
 *   APPLE_API_KEY      (Path to AuthKey_<ID>.p8 file)
 *
 * Usage:
 *   node scripts/build-ios.mjs --env-file ../../.env.release              # Archive + signed .ipa
 *   node scripts/build-ios.mjs --env-file ../../.env.release --upload     # Archive + .ipa + upload to TestFlight
 *   node scripts/build-ios.mjs --prebuild-only                            # Only generate ios/ and run pod install
 */
import { spawn, execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const mobileRoot = resolve(scriptDir, "..");
const iosDir = join(mobileRoot, "ios");
const releasesDir = join(mobileRoot, "releases");

const args = process.argv.slice(2);
const prebuildOnly = args.includes("--prebuild-only");
const uploadToTestFlight = args.includes("--upload");
const cleanPrebuild = args.includes("--clean");
const skipPrebuild = args.includes("--skip-prebuild");
const envFileIdx = args.indexOf("--env-file");
const envFileArg = envFileIdx >= 0 ? args[envFileIdx + 1] : process.env.MKBOARD_RELEASE_ENV_FILE;

function loadEnvFile(filePath) {
  if (!filePath) return;
  const abs = resolve(mobileRoot, filePath);
  if (!existsSync(abs)) {
    throw new Error(`Env file not found: ${abs}`);
  }
  const lines = readFileSync(abs, "utf8").split(/\r?\n/u);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const rawVal = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/gu, "");
    if (!process.env[key]) {
      process.env[key] = rawVal;
    }
  }
}

function redact(text) {
  return text
    .replace(/Apple (?:Distribution|Development):[^\n\r"]*/gu, "Apple Signing: [REDACTED]")
    .replace(/Developer ID (?:Application|Installer):[^\n\r"]*/gu, "Developer ID: [REDACTED]");
}

function run(cmd, cmdArgs, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(cmd, cmdArgs, {
      cwd: options.cwd ?? mobileRoot,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"]
    });
    child.stdout.on("data", (d) => process.stdout.write(redact(d.toString("utf8"))));
    child.stderr.on("data", (d) => process.stderr.write(redact(d.toString("utf8"))));
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`Command failed (${code}): ${cmd} ${cmdArgs.join(" ")}`));
    });
  });
}

function findWorkspace(dir) {
  const entries = readdirSync(dir);
  const ws = entries.find((e) => e.endsWith(".xcworkspace"));
  if (!ws) throw new Error(`No .xcworkspace found in ${dir}`);
  return join(dir, ws);
}

function findInstalledAppStoreProfile(bundleId, teamId) {
  const dirs = [
    join(homedir(), "Library/MobileDevice/Provisioning Profiles"),
    join(homedir(), "Library/Developer/Xcode/UserData/Provisioning Profiles")
  ];
  const expectedAppId = `${teamId}.${bundleId}`;
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".mobileprovision")) continue;
      const fullPath = join(dir, file);
      try {
        const xml = execFileSync("security", ["cms", "-D", "-i", fullPath], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
        if (!xml.includes(`<string>${expectedAppId}</string>`)) continue;
        // App Store distribution profiles have no ProvisionedDevices array
        if (xml.includes("<key>ProvisionedDevices</key>")) continue;
        const nameMatch = /<key>Name<\/key>\s*<string>([^<]+)<\/string>/u.exec(xml);
        const uuidMatch = /<key>UUID<\/key>\s*<string>([^<]+)<\/string>/u.exec(xml);
        if (nameMatch?.[1]) {
          return { name: nameMatch[1], uuid: uuidMatch?.[1] || "" };
        }
      } catch {
        // skip unreadable profile
      }
    }
  }
  return null;
}

async function main() {
  loadEnvFile(envFileArg);

  const appConfig = JSON.parse(readFileSync(join(mobileRoot, "app.json"), "utf8"));
  const version = appConfig.expo?.version || "0.2.0";
  const bundleId = appConfig.expo?.ios?.bundleIdentifier || "app.mkboard.mobile";
  const scheme = (appConfig.expo?.name || "MkBoard").replace(/\s+/gu, "");

  if (!skipPrebuild || !existsSync(iosDir)) {
    console.log("[ios-build] Running expo prebuild for iOS...");
    const prebuildArgs = ["expo", "prebuild", "--platform", "ios", "--no-install"];
    if (cleanPrebuild) prebuildArgs.push("--clean");
    await run("npx", prebuildArgs, {
      env: { EXPO_NO_GIT_STATUS: "1" }
    });

    console.log("[ios-build] Running pod install...");
    await run("pod", ["install"], {
      cwd: iosDir,
      env: { LANG: "en_US.UTF-8" }
    });
  }

  if (prebuildOnly) {
    console.log("[ios-build] Prebuild & pods ready:", iosDir);
    return;
  }

  const teamId = (process.env.APPLE_TEAM_ID || "").trim();
  const apiKeyId = (process.env.APPLE_API_KEY_ID || "").trim();
  const apiIssuer = (process.env.APPLE_API_ISSUER || "").trim();
  const apiKeyPath = (process.env.APPLE_API_KEY || "").trim();

  if (!teamId || !apiKeyId || !apiIssuer || !apiKeyPath) {
    throw new Error(
      "Missing Apple signing credentials. Set APPLE_TEAM_ID, APPLE_API_KEY_ID, APPLE_API_ISSUER, APPLE_API_KEY (or pass --env-file)."
    );
  }
  if (!existsSync(apiKeyPath)) {
    throw new Error(`APPLE_API_KEY .p8 file does not exist: ${apiKeyPath}`);
  }

  const workspacePath = findWorkspace(iosDir);
  const workTmp = mkdtempSync(join(tmpdir(), "mkboard-ios-build-"));
  const archivePath = join(workTmp, `${scheme}.xcarchive`);
  const exportDir = join(workTmp, "export");
  const exportOptionsPath = join(workTmp, "ExportOptions.plist");

  const authFlags = [
    "-allowProvisioningUpdates",
    "-authenticationKeyPath",
    apiKeyPath,
    "-authenticationKeyID",
    apiKeyId,
    "-authenticationKeyIssuerID",
    apiIssuer
  ];

  try {
    console.log(`[ios-build] Archiving ${scheme} (${version}) with automatic Apple API Key signing...`);
    await run("xcodebuild", [
      "-workspace",
      workspacePath,
      "-scheme",
      scheme,
      "-configuration",
      "Release",
      "-sdk",
      "iphoneos",
      "-destination",
      "generic/platform=iOS",
      "-archivePath",
      archivePath,
      `DEVELOPMENT_TEAM=${teamId}`,
      "CODE_SIGN_STYLE=Automatic",
      ...authFlags,
      "archive"
    ]);

    const explicitProfileName = (process.env.APPLE_PROVISIONING_PROFILE_NAME || "").trim();
    const detectedProfile = explicitProfileName
      ? { name: explicitProfileName, uuid: "" }
      : findInstalledAppStoreProfile(bundleId, teamId);

    const exportPlist = detectedProfile
      ? `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store-connect</string>
  <key>signingStyle</key>
  <string>manual</string>
  <key>signingCertificate</key>
  <string>Apple Distribution</string>
  <key>teamID</key>
  <string>${teamId}</string>
  <key>provisioningProfiles</key>
  <dict>
    <key>${bundleId}</key>
    <string>${detectedProfile.name}</string>
  </dict>
  <key>uploadSymbols</key>
  <true/>
  <key>destination</key>
  <string>export</string>
</dict>
</plist>
`
      : `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store-connect</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>teamID</key>
  <string>${teamId}</string>
  <key>uploadSymbols</key>
  <true/>
  <key>destination</key>
  <string>export</string>
</dict>
</plist>
`;
    writeFileSync(exportOptionsPath, exportPlist, "utf8");

    console.log(
      detectedProfile
        ? `[ios-build] Exporting signed IPA using installed App Store profile "${detectedProfile.name}"...`
        : "[ios-build] Exporting signed IPA with automatic signing..."
    );
    await run("xcodebuild", [
      "-exportArchive",
      "-archivePath",
      archivePath,
      "-exportOptionsPlist",
      exportOptionsPath,
      "-exportPath",
      exportDir,
      ...(detectedProfile ? [] : authFlags)
    ]);

    const ipaName = readdirSync(exportDir).find((f) => f.endsWith(".ipa"));
    if (!ipaName) throw new Error("xcodebuild -exportArchive succeeded but no .ipa was generated.");

    mkdirSync(releasesDir, { recursive: true });
    const outIpa = join(releasesDir, `MkBoard-Mobile-v${version}.ipa`);
    copyFileSync(join(exportDir, ipaName), outIpa);
    console.log(`[ios-build] Signed IPA ready: ${outIpa}`);

    if (uploadToTestFlight) {
      const keysDir = join(workTmp, "private_keys");
      mkdirSync(keysDir, { recursive: true });
      copyFileSync(apiKeyPath, join(keysDir, `AuthKey_${apiKeyId}.p8`));
      console.log("[ios-build] Uploading IPA to App Store Connect / TestFlight...");
      await run(
        "xcrun",
        [
          "altool",
          "--upload-app",
          "--type",
          "ios",
          "--file",
          outIpa,
          "--apiKey",
          apiKeyId,
          "--apiIssuer",
          apiIssuer
        ],
        {
          env: { API_PRIVATE_KEYS_DIR: keysDir }
        }
      );
      console.log("[ios-build] Uploaded to TestFlight successfully!");
    }
  } finally {
    rmSync(workTmp, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error("[ios-build] Failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
