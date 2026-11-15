import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const desktopRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repoRoot = resolve(desktopRoot, "../..");

test("runtime sources pin every production component", () => {
  const sources = JSON.parse(readFileSync(join(desktopRoot, "runtime/runtime-sources.json"), "utf8"));
  assert.deepEqual(sources.supportedTargets, ["darwin-arm64", "win32-x64"]);
  assert.equal(sources.components.hyperframes.version, "0.7.48");
  assert.equal(sources.components.chromeHeadlessShell.version, "152.0.7928.2");
  assert.equal(sources.components.node.version, "22.22.1");
  assert.equal(sources.components.ffmpeg.nonfree, false);
  assert.match(sources.components.ffmpeg.version, /^7\.1\.5-/u);
  for (const target of sources.supportedTargets) {
    assert.match(sources.components.chromeHeadlessShell.archives[target].sha256, /^[a-f0-9]{64}$/u);
  }
  assert.match(sources.components.chromeHeadlessShell.archives["win32-x64"].extractedSha256, /^[a-f0-9]{64}$/u);
});

test("production video execution has no PATH or npx fallback", () => {
  const localVideo = readFileSync(join(desktopRoot, "src/main/local-video.ts"), "utf8");
  const poster = readFileSync(join(desktopRoot, "src/main/video-poster.ts"), "utf8");
  const auth = readFileSync(join(desktopRoot, "src/main/codex-auth.ts"), "utf8");
  assert.match(localVideo, /resolveBundledRuntime/u);
  assert.match(localVideo, /bundledRuntimeSpawnEnv/u);
  assert.match(localVideo, /\/api\/projects/u);
  assert.match(localVideo, /\/storyboard/u);
  assert.doesNotMatch(localVideo, /basename\(projectDir\)/u);
  assert.doesNotMatch(localVideo, /resolveNpxExecutable|HYPERFRAMES_BIN|npm install -g hyperframes/u);
  assert.doesNotMatch(poster, /localToolchainExecutableCandidates|resolveLocalExecutableVersion/u);
  assert.doesNotMatch(auth, /resolveNpxExecutable|HYPERFRAMES_BIN|npm install -g hyperframes/u);
});

test("packaging supports DEV platform selection while production stays atomic", () => {
  const builder = readFileSync(join(desktopRoot, "electron-builder.yml"), "utf8");
  const afterPack = readFileSync(join(desktopRoot, "scripts/after-pack.cjs"), "utf8");
  const packageJson = JSON.parse(readFileSync(join(desktopRoot, "package.json"), "utf8"));
  const dmgSyncCompat = readFileSync(join(desktopRoot, "scripts/dmg-sync-compat/sync"), "utf8");
  const release = readFileSync(join(repoRoot, "tools/release-desktop.sh"), "utf8");
  const windowsBuild = readFileSync(join(repoRoot, "tools/build-windows-desktop.ps1"), "utf8");
  const windowsMacBuild = readFileSync(join(repoRoot, "tools/build-windows-desktop-macos.mjs"), "utf8");
  assert.match(builder, /target:\s*nsis/u);
  assert.match(builder, /runtime\/current/u);
  assert.match(afterPack, /codeSignatureProtected/u);
  assert.match(afterPack, /hyperframes\.asar/u);
  assert.match(afterPack, /node_modules\/\{@img,@esbuild\}\/\*\*/u);
  assert.match(afterPack, /manifest\.integrity\["hyperframes\.asar"\]/u);
  assert.match(release, /test -f "\$runtime_path\/hyperframes\.asar"/u);
  assert.match(builder, /deleteAppDataOnUninstall:\s*false/u);
  assert.match(builder, /filesystem:\s*APFS/u);
  assert.match(packageJson.scripts["dist:mac"], /scripts\/dmg-sync-compat/u);
  assert.match(dmgSyncCompat, /macos_major.*-ge 26/u);
  assert.match(dmgSyncCompat, /\/Volumes\/MkBoard/u);
  assert.match(dmgSyncCompat, /exec \/bin\/sync/u);
  assert.match(release, /validate_windows_release_receipt/u);
  assert.match(release, /--allow-cross-built-windows/u);
  assert.match(release, /static-cross-build/u);
  assert.match(release, /Production still requires a native Windows x64 receipt/u);
  assert.match(release, /--platform all\|windows\|macos/u);
  assert.match(release, /Production desktop builds always require --platform all/u);
  assert.match(release, /latest_version_preserved=true/u);
  assert.match(release, /MKBOARD_GPL_H264_REVIEW_APPROVED/u);
  assert.match(release, /git status --porcelain/u);
  assert.match(release, /run pnpm --filter @mkboard\/api run deploy:dev/u);
  assert.match(release, /api\/desktop\/download\/windows/u);
  assert.match(release, /codeSignatureProtected/u);
  assert.match(release, /com\.apple\.provenance/u);
  assert.match(release, /launchctl submit/u);
  assert.match(windowsBuild, /Get-AuthenticodeSignature/u);
  assert.match(windowsBuild, /runtimeManifestSha256/u);
  assert.match(windowsBuild, /userDataPreserved/u);
  assert.match(windowsBuild, /Uninstall MkBoard\.exe/u);
  assert.match(windowsMacBuild, /verificationLevel: "static-cross-build"/u);
  assert.match(windowsMacBuild, /smokePassed: false/u);
  assert.match(windowsMacBuild, /installPassed: false/u);
  assert.match(windowsMacBuild, /assertPe/u);
});

test("a staged runtime excludes optional ML models and foreign binaries", { skip: !existsSync(join(desktopRoot, "runtime/current/manifest.json")) }, () => {
  const manifest = JSON.parse(readFileSync(join(desktopRoot, "runtime/current/manifest.json"), "utf8"));
  assert.ok(["darwin-arm64", "win32-x64"].includes(manifest.target));
  assert.ok(manifest.integrity && Object.keys(manifest.integrity).length >= 8);
  assert.equal(typeof manifest.codeSignatureProtected, "object");
  assert.deepEqual(manifest.excludedCapabilities, ["tts", "transcribe", "musicgen", "remove-background"]);
  assert.equal(existsSync(join(desktopRoot, "runtime/current/hyperframes/node_modules/onnxruntime-node")), false);
  assert.equal(existsSync(join(desktopRoot, "runtime/current/hyperframes/node_modules/onnxruntime-common")), false);
});

test("staged runtime completes the local-only HyperFrames pipeline", { skip: !existsSync(join(desktopRoot, "runtime/current/manifest.json")), timeout: 180_000 }, async () => {
  const runtime = join(desktopRoot, "runtime/current");
  const manifest = JSON.parse(readFileSync(join(runtime, "manifest.json"), "utf8"));
  const isWindows = manifest.target === "win32-x64";
  const require = createRequire(import.meta.url);
  const nodeBin = isWindows ? join(runtime, manifest.executables.node) : require("electron");
  const cli = join(runtime, manifest.executables.hyperframesCli);
  const ffprobe = join(runtime, manifest.executables.ffprobe);
  const fixture = join(desktopRoot, "test-fixtures/hyperframes-offline");
  const output = join(tmpdir(), `mkboard-runtime-smoke-${process.pid}.mp4`);
  const env = {
    ...process.env,
    ...(isWindows ? {} : { ELECTRON_RUN_AS_NODE: "1" }),
    HYPERFRAMES_BROWSER_PATH: join(runtime, manifest.executables.browser),
    HYPERFRAMES_FFMPEG_PATH: join(runtime, manifest.executables.ffmpeg),
    HYPERFRAMES_FFPROBE_PATH: ffprobe,
    HYPERFRAMES_NO_UPDATE_CHECK: "1",
    HYPERFRAMES_NO_AUTO_INSTALL: "1",
    HYPERFRAMES_NO_TELEMETRY: "1",
    HYPERFRAMES_SKIP_SKILLS: "1",
    HYPERFRAMES_FONT_CACHE_DIR: join(tmpdir(), "mkboard-runtime-cache/fonts"),
    HYPERFRAMES_EXTRACT_CACHE_DIR: join(tmpdir(), "mkboard-runtime-cache/extract"),
    PUPPETEER_CACHE_DIR: join(tmpdir(), "mkboard-runtime-cache/browser")
  };
  const prefix = [cli];
  for (const args of [["lint"], ["validate"], ["inspect"], ["render", "--output", output, "--workers", "2"]]) {
    const result = spawnSync(nodeBin, [...prefix, ...args], { cwd: fixture, env, encoding: "utf8", timeout: 170_000, maxBuffer: 30 * 1024 * 1024, windowsHide: true, shell: false });
    assert.equal(result.status, 0, `${args[0]} failed:\n${result.stderr || result.stdout}`);
  }
  assert.ok(existsSync(output));
  const probe = spawnSync(ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", output], { encoding: "utf8", env, windowsHide: true, shell: false });
  assert.equal(probe.status, 0, probe.stderr);
  assert.equal(Number(probe.stdout.trim()), 10);
  await rm(output, { force: true });
});
