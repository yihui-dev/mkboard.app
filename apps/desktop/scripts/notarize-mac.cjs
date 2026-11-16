const path = require("node:path");
const { existsSync } = require("node:fs");
const { chmod, mkdtemp, rm, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { spawn } = require("node:child_process");

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 15000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const chunks = [];
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.on("data", (chunk) => chunks.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        code,
        output: Buffer.concat(chunks).toString("utf8")
      });
    });
  });
}

function isTransientNotaryError(error) {
  const message = `${error?.message ?? ""}\n${error?.stack ?? ""}`;
  return [
    "abortedUpload",
    "deadlineExceeded",
    "ECONNRESET",
    "ETIMEDOUT",
    "ENOTFOUND",
    "EAI_AGAIN",
    "socket hang up",
    "network connection was lost"
  ].some((marker) => message.includes(marker));
}

async function resolveNotaryAuthArgs(tempDir) {
  const keychainProfile = process.env.APPLE_NOTARY_KEYCHAIN_PROFILE?.trim();
  const keychain = process.env.APPLE_NOTARY_KEYCHAIN?.trim();
  if (keychainProfile) {
    return [
      ...(keychain ? ["--keychain", keychain] : []),
      "--keychain-profile",
      keychainProfile
    ];
  }

  const apiKey = process.env.APPLE_API_KEY?.trim();
  const apiKeyId = process.env.APPLE_API_KEY_ID?.trim();
  const apiIssuer = process.env.APPLE_API_ISSUER?.trim();
  if (apiKey && apiKeyId && apiIssuer) {
    let keyPath = apiKey;
    if (!existsSync(apiKey)) {
      keyPath = path.join(tempDir, "AuthKey.p8");
      const content = apiKey.includes("BEGIN PRIVATE KEY")
        ? apiKey
        : Buffer.from(apiKey, "base64").toString("utf8");
      await writeFile(keyPath, content, { encoding: "utf8", mode: 0o600 });
      await chmod(keyPath, 0o600);
    }
    return ["--key", keyPath, "--key-id", apiKeyId, "--issuer", apiIssuer];
  }

  const appleId = process.env.APPLE_ID?.trim();
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD?.trim();
  const teamId = process.env.APPLE_TEAM_ID?.trim();
  if (appleId && appleIdPassword && teamId) {
    return ["--apple-id", appleId, "--password", appleIdPassword, "--team-id", teamId];
  }

  throw new Error(
    "[notarize-mac] Missing Apple notarization credentials. Provide APPLE_NOTARY_KEYCHAIN_PROFILE, " +
      "(APPLE_API_KEY + APPLE_API_KEY_ID + APPLE_API_ISSUER), or (APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID)."
  );
}

async function submitAndStapleOnce(targetPath, useNoS3Acceleration = false) {
  const tempDir = await mkdtemp(path.join(tmpdir(), "mkboard-notarize-"));
  try {
    const authArgs = await resolveNotaryAuthArgs(tempDir);
    const isAppBundle = targetPath.endsWith(".app");
    let submitPath = targetPath;

    if (isAppBundle) {
      submitPath = path.join(tempDir, `${path.parse(targetPath).name}.zip`);
      console.log(`[notarize-mac] Archiving ${path.basename(targetPath)} for Apple notarization...`);
      const zipResult = await run(
        "ditto",
        ["-c", "-k", "--sequesterRsrc", "--keepParent", path.basename(targetPath), submitPath],
        { cwd: path.dirname(targetPath) }
      );
      if (zipResult.code !== 0) {
        throw new Error(`Failed to zip app for notarization:\n${zipResult.output.trim()}`);
      }
    }

    console.log(`[notarize-mac] Submitting ${path.basename(targetPath)} to Apple notarytool (waiting for ticket)...`);
    const submitResult = await run("xcrun", [
      "notarytool",
      "submit",
      submitPath,
      ...authArgs,
      "--wait",
      "--output-format",
      "json",
      ...(useNoS3Acceleration ? ["--no-s3-acceleration"] : [])
    ]);
    const rawOutput = submitResult.output.trim();
    let parsed;
    try {
      parsed = JSON.parse(rawOutput);
    } catch {
      throw new Error(`notarytool returned non-JSON output (exit ${submitResult.code}):\n${rawOutput}`);
    }

    if (submitResult.code !== 0 || parsed.status !== "Accepted") {
      let logExcerpt = "";
      if (parsed && parsed.id) {
        const logResult = await run("xcrun", ["notarytool", "log", parsed.id, ...authArgs]);
        if (logResult.code === 0 && logResult.output.trim()) {
          logExcerpt = `\nNotary log:\n${logResult.output.trim().slice(0, 4000)}`;
        }
      }
      throw new Error(
        `Apple notarization was not accepted (status=${parsed.status || "unknown"}):\n${JSON.stringify(
          { id: parsed.id, status: parsed.status, statusSummary: parsed.statusSummary },
          null,
          2
        )}${logExcerpt}`
      );
    }

    console.log(`[notarize-mac] Notarization Accepted (submission id: ${parsed.id}). Stapling ticket to ${path.basename(targetPath)}...`);
    const stapleResult = await run("xcrun", ["stapler", "staple", targetPath]);
    if (stapleResult.code !== 0) {
      throw new Error(`Failed to staple notarization ticket:\n${stapleResult.output.trim()}`);
    }
    const validateResult = await run("xcrun", ["stapler", "validate", targetPath]);
    if (validateResult.code !== 0) {
      throw new Error(`Stapled ticket validation failed:\n${validateResult.output.trim()}`);
    }
    console.log(`[notarize-mac] Stapled and validated ${path.basename(targetPath)}.`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function notarizeAndStapleWithRetries(targetPath) {
  const attempts = Number.parseInt(process.env.MKBOARD_NOTARIZE_ATTEMPTS || "", 10) || DEFAULT_ATTEMPTS;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await submitAndStapleOnce(targetPath, attempt > 1);
      return;
    } catch (error) {
      if (attempt < attempts && isTransientNotaryError(error)) {
        console.warn(`[notarize-mac] Transient notarytool error on attempt ${attempt}/${attempts}; retrying in ${DEFAULT_RETRY_DELAY_MS}ms...`);
        await sleep(DEFAULT_RETRY_DELAY_MS);
        continue;
      }
      throw error;
    }
  }
}

async function afterSign(context) {
  if (context.electronPlatformName !== "darwin") return;
  if (process.env.MKBOARD_MAC_NOTARIZE !== "1") return;
  const productFilename = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${productFilename}.app`);
  await notarizeAndStapleWithRetries(appPath);
}

afterSign.notarizeAndStaple = notarizeAndStapleWithRetries;
module.exports = afterSign;

if (require.main === module) {
  const envFile = process.env.MKBOARD_RELEASE_ENV_FILE && process.env.MKBOARD_RELEASE_ENV_FILE.trim();
  if (envFile && existsSync(envFile)) {
    for (const line of require("node:fs").readFileSync(envFile, "utf8").split(/\r?\n/u)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/u);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/gu, "");
    }
  }
  const target = process.argv[2];
  if (!target) { console.error("Usage: node scripts/notarize-mac.cjs <app-or-dmg-path>"); process.exit(1); }
  notarizeAndStapleWithRetries(path.resolve(target)).catch((err) => { console.error(err); process.exit(1); });
}
