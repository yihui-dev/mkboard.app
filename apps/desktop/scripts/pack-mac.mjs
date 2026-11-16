#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, open, readdir, rename, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(scriptDir, "..");

const args = process.argv.slice(2);
const signed = args.includes("--signed") || process.env.MKBOARD_MAC_SIGN === "1";
const notarize = signed && (args.includes("--notarize") || process.env.MKBOARD_MAC_NOTARIZE === "1");
const skipBuild = args.includes("--skip-build");
const skipDmgNotarize = args.includes("--skip-dmg-notarize");
const prepackaged = args.includes("--prepackaged");

const archFlagIdx = args.indexOf("--arch");
const rawArch = archFlagIdx >= 0 && args[archFlagIdx + 1] ? args[archFlagIdx + 1] : "arm64,x64";
const requestedArchs = rawArch
  .split(",")
  .map((item) => item.trim())
  .filter((item) => item === "arm64" || item === "x64");

if (requestedArchs.length === 0) {
  throw new Error(`Invalid --arch value: ${rawArch}. Expected arm64, x64, or arm64,x64.`);
}

// Optionally load untracked local release env file (never printed, never committed)
const envFile = process.env.MKBOARD_RELEASE_ENV_FILE?.trim();
if (envFile && existsSync(envFile)) {
  const lines = readFileSync(envFile, "utf8").split(/\r?\n/u);
  for (const line of lines) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/u);
    if (!match) continue;
    const [, key, rawVal] = match;
    if (!process.env[key]) {
      process.env[key] = rawVal.replace(/^["']|["']$/gu, "");
    }
  }
}

function redactSigningOutput(text) {
  return text
    .replace(/Developer ID (?:Application|Installer):[^\n\r"]*/gu, "Developer ID Application: [REDACTED]")
    .replace(/identityHash=[0-9A-Fa-f]{16,64}/gu, "identityHash=[REDACTED]")
    .replace(/TeamIdentifier=[A-Z0-9]{6,16}/gu, "TeamIdentifier=[REDACTED]");
}

function loadYamlConfig() {
  const ebPkg = require.resolve("electron-builder/package.json", { paths: [desktopRoot] });
  const yaml = require(require.resolve("js-yaml", { paths: [dirname(ebPkg)] }));
  return yaml.load(readFileSync(join(desktopRoot, "electron-builder.yml"), "utf8"));
}

async function isMachO(file) {
  const handle = await open(file, "r");
  try {
    const header = Buffer.alloc(4);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (bytesRead !== header.length) return false;
    return new Set([
      0xfeedface,
      0xcefaedfe,
      0xfeedfacf,
      0xcffaedfe,
      0xcafebabe,
      0xbebafeca,
      0xcafebabf,
      0xbfbafeca
    ]).has(header.readUInt32BE(0));
  } finally {
    await handle.close();
  }
}

async function collectStagedRuntimeMachOBinaries(runtimeCurrentDir) {
  if (!existsSync(join(runtimeCurrentDir, "manifest.json"))) return [];
  const results = [];
  const queue = [runtimeCurrentDir];
  while (queue.length > 0) {
    const dir = queue.pop();
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!(await isMachO(fullPath))) continue;
      const rel = relative(runtimeCurrentDir, fullPath).replace(/\\/gu, "/");
      if (rel.startsWith("hyperframes/")) {
        results.push(`Contents/Resources/runtime/hyperframes.asar.unpacked/${rel.slice("hyperframes/".length)}`);
      } else {
        results.push(`Contents/Resources/runtime/${rel}`);
      }
    }
  }
  return results.sort();
}

function runCmd(command, cmdArgs, extraEnv = {}) {
  const env = {
    ...process.env,
    PATH: `${join(desktopRoot, "scripts", "dmg-sync-compat")}:${process.env.PATH || ""}`,
    ...extraEnv
  };
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, cmdArgs, {
      cwd: desktopRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    child.stdout.on("data", (chunk) => {
      process.stdout.write(redactSigningOutput(chunk.toString("utf8")));
    });
    child.stderr.on("data", (chunk) => {
      process.stderr.write(redactSigningOutput(chunk.toString("utf8")));
    });
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        rejectPromise(new Error(`Command failed (${code}): ${command} ${cmdArgs.join(" ")}`));
      }
    });
  });
}

if (!skipBuild) {
  console.log("[pack-mac] Building desktop renderer, main process, and MCP server...");
  await runCmd("pnpm", ["run", "build"]);
}

const pkgJson = JSON.parse(readFileSync(join(desktopRoot, "package.json"), "utf8"));
const version = pkgJson.version;
const runtimeCurrentDir = join(desktopRoot, "runtime", "current");
const runtimeStashDir = join(desktopRoot, "runtime", ".current-arm64-stash");
const notarizeHelper = require("./notarize-mac.cjs");

// Build x64 first (if requested) with clean empty runtime/current, then restore arm64 runtime for arm64
const orderedArchs = [...requestedArchs].sort((a, b) => (a === "x64" ? -1 : b === "x64" ? 1 : 0));

for (const arch of orderedArchs) {
  let stashedArm64Runtime = false;
  const tempDir = await mkdtemp(join(tmpdir(), `mkboard-eb-${arch}-`));
  try {
    if (arch === "x64" && existsSync(join(runtimeCurrentDir, "manifest.json"))) {
      await rm(runtimeStashDir, { recursive: true, force: true });
      await rename(runtimeCurrentDir, runtimeStashDir);
      stashedArm64Runtime = true;
    }
    await mkdir(runtimeCurrentDir, { recursive: true });

    if (!prepackaged) {
      console.log(`[pack-mac] Rebuilding native modules for darwin-${arch}...`);
      await runCmd("pnpm", ["exec", "electron-rebuild", "-f", "-w", "better-sqlite3", `--arch=${arch}`]);
      if (!signed) {
        await runCmd("node", ["scripts/sign-native-modules.mjs"]);
      }
    }

    const config = loadYamlConfig();
    if (signed) {
      const runtimeBinaries = await collectStagedRuntimeMachOBinaries(runtimeCurrentDir);
      config.mac = {
        ...config.mac,
        hardenedRuntime: true,
        entitlements: "resources/entitlements.mac.plist",
        entitlementsInherit: "resources/entitlements.mac.inherit.plist",
        gatekeeperAssess: false,
        notarize: false,
        ...(runtimeBinaries.length > 0 ? { binaries: runtimeBinaries } : {})
      };
      // Remove identity: null so electron-builder discovers certificate from CSC_LINK or Keychain without hardcoding any identity
      delete config.mac.identity;
      config.dmg = {
        ...config.dmg,
        sign: true
      };
      if (notarize && !prepackaged) {
        config.afterSign = "scripts/notarize-mac.cjs";
      }
    }

    const tempConfigPath = join(tempDir, "electron-builder.resolved.json");
    await writeFile(tempConfigPath, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });

    const appDirName = arch === "arm64" ? "mac-arm64" : "mac";
    const appOutDir = join(desktopRoot, "release", appDirName);
    console.log(`[pack-mac] Packaging MkBoard ${version} for mac-${arch} (signed=${signed}, notarize=${notarize}, prepackaged=${prepackaged})...`);
    await runCmd(
      "pnpm",
      [
        "exec",
        "electron-builder",
        "--config",
        tempConfigPath,
        ...(prepackaged ? ["--prepackaged", appOutDir] : []),
        "--mac",
        "dmg",
        "zip",
        `--${arch}`,
        "--publish",
        "never"
      ],
      signed
        ? {
            MKBOARD_MAC_SIGN: "1",
            MKBOARD_MAC_NOTARIZE: notarize ? "1" : "0"
          }
        : {
            CSC_IDENTITY_AUTO_DISCOVERY: "false",
            MKBOARD_MAC_SIGN: "0",
            MKBOARD_MAC_NOTARIZE: "0"
          }
    );

    const appPath = join(appOutDir, "MkBoard.app");
    const dmgPath = join(desktopRoot, "release", `MkBoard-${version}-mac-${arch}.dmg`);

    if (signed) {
      console.log(`[pack-mac] Verifying strict code signature on ${appPath}...`);
      await runCmd("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]);

      if (notarize) {
        if (!skipDmgNotarize) {
          await notarizeHelper.notarizeAndStaple(dmgPath);
        }
        console.log(`[pack-mac] Verifying Gatekeeper acceptance & stapled tickets for mac-${arch}...`);
        await runCmd("/usr/sbin/spctl", ["-a", "-vv", "-t", "exec", appPath]);
        await runCmd("xcrun", ["stapler", "validate", appPath]);
        if (!skipDmgNotarize) {
          await runCmd("xcrun", ["stapler", "validate", dmgPath]);
        }
      }
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
    if (stashedArm64Runtime && existsSync(runtimeStashDir)) {
      await rm(runtimeCurrentDir, { recursive: true, force: true });
      await rename(runtimeStashDir, runtimeCurrentDir);
    }
  }
}

// Restore host arm64 native module when cross-building on Apple Silicon so local dev stays ready
if (process.arch === "arm64" && orderedArchs[orderedArchs.length - 1] !== "arm64") {
  await runCmd("pnpm", ["run", "rebuild:native"]);
}

console.log(`[pack-mac] Completed macOS packaging (${requestedArchs.join(", ")}).`);
