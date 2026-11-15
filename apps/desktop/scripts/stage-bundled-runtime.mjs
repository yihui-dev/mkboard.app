import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { chmod, cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const desktopRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const runtimeRoot = join(desktopRoot, "runtime");
const sourcesPath = join(runtimeRoot, "runtime-sources.json");
const target = process.argv[2] || hostTarget();
const allowedTargets = new Set(["darwin-arm64", "win32-x64"]);

if (!allowedTargets.has(target)) {
  throw new Error(`Unsupported runtime target: ${target}`);
}

const sources = JSON.parse(await readFile(sourcesPath, "utf8"));
const outputDir = join(runtimeRoot, "current");
const workDir = join(runtimeRoot, ".work", target);
const cacheDir = resolve(process.env.MKBOARD_RUNTIME_CACHE_DIR || join(homedir(), ".cache", "mkboard", "runtime"));
const platform = target.startsWith("win32") ? "win32" : "darwin";
const arch = target.endsWith("x64") ? "x64" : "arm64";

await rm(outputDir, { recursive: true, force: true });
await rm(workDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
await mkdir(workDir, { recursive: true });
await mkdir(cacheDir, { recursive: true });

const chromeSource = sources.components.chromeHeadlessShell.archives[target];
const cachedBrowserDir = join(cacheDir, `browser-${sources.components.chromeHeadlessShell.version}-${target}`);
const prebuiltBrowserDir = process.env.MKBOARD_BROWSER_PREBUILT_DIR?.trim()
  || (existsSync(cachedBrowserDir) ? cachedBrowserDir : "");
if (prebuiltBrowserDir) {
  if (!chromeSource.extractedSha256) {
    throw new Error(`Prebuilt browser runtime is not allowed without a pinned extractedSha256 for ${target}`);
  }
  await cp(resolve(prebuiltBrowserDir), join(outputDir, "browser"), { recursive: true });
} else {
  const chromeArchive = await downloadAndVerify(
    chromeSource,
    join(cacheDir, `chrome-headless-shell-${sources.components.chromeHeadlessShell.version}-${target}.zip`)
  );
  await extractArchive(chromeArchive, join(workDir, "chrome"));
  const chromeExtracted = await firstDirectory(join(workDir, "chrome"));
  await cp(chromeExtracted, join(outputDir, "browser"), { recursive: true });
}
if (chromeSource.extractedSha256) {
  const extractedSha256 = await directoryIntegritySha256(join(outputDir, "browser"));
  if (extractedSha256 !== chromeSource.extractedSha256) {
    throw new Error(`Extracted browser SHA-256 mismatch for ${target}: expected ${chromeSource.extractedSha256}, got ${extractedSha256}`);
  }
}

const ffmpegSource = await downloadAndVerify(
  sources.components.ffmpeg.sourceArchives.ffmpeg,
  join(cacheDir, basename(new URL(sources.components.ffmpeg.sourceArchives.ffmpeg.url).pathname))
);
const x264Source = await downloadAndVerify(
  sources.components.ffmpeg.sourceArchives.x264,
  join(cacheDir, basename(new URL(sources.components.ffmpeg.sourceArchives.x264.url).pathname))
);

const ffmpegDir = join(outputDir, "ffmpeg");
const prebuiltFfmpegDir = process.env.MKBOARD_FFMPEG_PREBUILT_DIR?.trim();
if (prebuiltFfmpegDir) {
  await cp(resolve(prebuiltFfmpegDir), ffmpegDir, { recursive: true });
} else {
  const cachedFfmpegDir = join(cacheDir, `ffmpeg-${sources.components.ffmpeg.version}-${target}`);
  if (existsSync(join(cachedFfmpegDir, platform === "win32" ? "ffmpeg.exe" : "ffmpeg"))) {
    await cp(cachedFfmpegDir, ffmpegDir, { recursive: true });
  } else {
    const script = platform === "darwin" ? "build-ffmpeg-macos.sh" : "build-ffmpeg-windows.sh";
    const buildArgs = [join(desktopRoot, "scripts", script), ffmpegSource, x264Source, ffmpegDir, join(workDir, "ffmpeg-build")];
    run("bash", platform === "win32" ? buildArgs.map(toMsysPath) : buildArgs);
    await rm(cachedFfmpegDir, { recursive: true, force: true });
    await cp(ffmpegDir, cachedFfmpegDir, { recursive: true });
  }
}
await assertRedistributableFfmpeg(ffmpegDir, platform);

const hyperframesDir = join(outputDir, "hyperframes");
await mkdir(hyperframesDir, { recursive: true });
await cp(join(runtimeRoot, "hyperframes-package", "package.json"), join(hyperframesDir, "package.json"));
await cp(join(runtimeRoot, "hyperframes-package", "package-lock.json"), join(hyperframesDir, "package-lock.json"));
const npmTargetArgs = process.platform === platform && process.arch === arch
  ? []
  : [`--os=${platform}`, `--cpu=${arch}`];
const npmArgs = ["ci", "--ignore-scripts", "--include=optional", ...npmTargetArgs, "--workspaces=false", "--no-audit", "--no-fund"];
if (process.platform === "win32") {
  const npmCli = resolve(process.env.MKBOARD_NPM_CLI?.trim() || join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"));
  if (!existsSync(npmCli)) throw new Error(`Unable to locate npm CLI beside Node.js: ${npmCli}`);
  run(process.execPath, [npmCli, ...npmArgs], { cwd: hyperframesDir });
} else {
  run("npm", npmArgs, { cwd: hyperframesDir });
}
await pruneHyperframesRuntime(hyperframesDir, target);

if (platform === "win32") {
  const nodeArchive = await downloadAndVerify(
    sources.components.node.archives[target],
    join(cacheDir, `node-v${sources.components.node.version}-win-x64.zip`)
  );
  const nodeExtractDir = join(workDir, "node");
  await extractArchive(nodeArchive, nodeExtractDir);
  const nodeExtracted = await firstDirectory(nodeExtractDir);
  const nodeDir = join(outputDir, "node");
  await mkdir(nodeDir, { recursive: true });
  await cp(join(nodeExtracted, "node.exe"), join(nodeDir, "node.exe"));
  await cp(join(nodeExtracted, "LICENSE"), join(nodeDir, "LICENSE"));
}

const licensesDir = join(outputDir, "licenses");
const sourceLicensesDir = join(licensesDir, "sources");
await mkdir(sourceLicensesDir, { recursive: true });
await cp(join(runtimeRoot, "licenses", "THIRD-PARTY-NOTICES.md"), join(licensesDir, "THIRD-PARTY-NOTICES.md"));
await cp(join(runtimeRoot, "licenses", "FFMPEG-BUILD-CONFIG.txt"), join(licensesDir, "FFMPEG-BUILD-CONFIG.txt"));
await cp(join(ffmpegDir, "ffmpeg-configure.txt"), join(licensesDir, "ffmpeg-configure.txt"));
await cp(ffmpegSource, join(sourceLicensesDir, basename(ffmpegSource)));
await cp(x264Source, join(sourceLicensesDir, basename(x264Source)));
const hyperframesLicense = await downloadAndVerify(
  { url: sources.components.hyperframes.licenseUrl, sha256: sources.components.hyperframes.licenseSha256 },
  join(cacheDir, `hyperframes-${sources.components.hyperframes.version}-LICENSE`)
);
await cp(hyperframesLicense, join(licensesDir, "HYPERFRAMES-LICENSE"));
await collectNpmLicenses(join(hyperframesDir, "node_modules"), join(licensesDir, "npm"), join(licensesDir, "NPM-THIRD-PARTY-LICENSES.json"));
if (platform === "win32") await cp(join(outputDir, "node", "LICENSE"), join(licensesDir, "NODE-LICENSE"));

const executables = {
  node: platform === "win32" ? "node/node.exe" : "__electron__",
  hyperframesCli: "hyperframes/node_modules/hyperframes/dist/cli.js",
  browser: platform === "win32" ? "browser/chrome-headless-shell.exe" : "browser/chrome-headless-shell",
  ffmpeg: platform === "win32" ? "ffmpeg/ffmpeg.exe" : "ffmpeg/ffmpeg",
  ffprobe: platform === "win32" ? "ffmpeg/ffprobe.exe" : "ffmpeg/ffprobe"
};

if (platform === "darwin") {
  await Promise.all([executables.browser, executables.ffmpeg, executables.ffprobe].map((file) => chmod(join(outputDir, file), 0o755)));
}

for (const [name, file] of Object.entries(executables)) {
  if (file === "__electron__") continue;
  if (!existsSync(join(outputDir, file))) throw new Error(`Staged runtime is missing ${name}: ${file}`);
}

const integrityFiles = new Set([
  executables.hyperframesCli,
  "hyperframes/package.json",
  "hyperframes/package-lock.json",
]);
const integrityRoots = [
  join(outputDir, "browser"),
  join(outputDir, "ffmpeg"),
  join(outputDir, "licenses"),
  join(outputDir, "hyperframes", "node_modules", "hyperframes"),
  join(outputDir, "hyperframes", "node_modules", "@img", "colour"),
  join(outputDir, "hyperframes", "node_modules", "@img", target === "darwin-arm64" ? "sharp-darwin-arm64" : "sharp-win32-x64"),
  join(outputDir, "hyperframes", "node_modules", "@img", target === "darwin-arm64" ? "sharp-libvips-darwin-arm64" : "sharp-libvips-win32-x64"),
  join(outputDir, "hyperframes", "node_modules", "@esbuild", target === "darwin-arm64" ? "darwin-arm64" : "win32-x64")
];
for (const root of integrityRoots) {
  if (!existsSync(root)) continue;
  for (const file of await listFiles(root)) integrityFiles.add(relative(outputDir, file));
}
if (platform === "win32") integrityFiles.add(executables.node);

const integrity = {};
for (const file of [...integrityFiles].sort()) {
  integrity[file] = await sha256(join(outputDir, file));
}

const manifest = {
  schemaVersion: sources.schemaVersion,
  runtimeVersion: sources.runtimeVersion,
  target,
  platform,
  arch,
  builtAt: new Date().toISOString(),
  components: sources.components,
  capabilities: ["preview", "lint", "validate", "inspect", "render", "studio", "tail-frame"],
  excludedCapabilities: ["tts", "transcribe", "musicgen", "remove-background"],
  executables,
  codeSignatureProtected: {},
  integrity
};
await writeFile(join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const runtimeSize = await directorySize(outputDir);
console.log(`Bundled runtime staged: target=${target} bytes=${runtimeSize} output=${outputDir}`);

function hostTarget() {
  if (process.platform === "darwin" && process.arch === "arm64") return "darwin-arm64";
  if (process.platform === "win32" && process.arch === "x64") return "win32-x64";
  return `${process.platform}-${process.arch}`;
}

async function downloadAndVerify(source, destination) {
  if (!source?.url || !source?.sha256) throw new Error(`Invalid runtime source entry for ${destination}`);
  if (!existsSync(destination) || (await sha256(destination)) !== source.sha256) {
    await rm(destination, { force: true });
    await mkdir(dirname(destination), { recursive: true });
    // GitLab's archive endpoint currently rejects Node/undici downloads with
    // HTTP 406 while accepting an ordinary curl client. curl is available on
    // both supported native build runners and remains covered by SHA-256.
    run("curl", [
      "--fail",
      "--location",
      "--retry",
      "3",
      "--silent",
      "--show-error",
      "--user-agent",
      "MkBoard-Runtime-Builder/1.0",
      "--header",
      "Accept: application/octet-stream,*/*",
      "--output",
      destination,
      source.url
    ]);
  }
  const actual = await sha256(destination);
  if (actual !== source.sha256) {
    await rm(destination, { force: true });
    throw new Error(`SHA-256 mismatch for ${source.url}: expected ${source.sha256}, got ${actual}`);
  }
  return destination;
}

async function extractArchive(archive, destination) {
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  const tarCommand = process.platform === "win32"
    ? join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe")
    : "tar";
  run(tarCommand, ["-xf", archive, "-C", destination]);
}

function toMsysPath(file) {
  if (process.platform !== "win32") return file;
  const result = spawnSync("cygpath", ["-u", file], {
    encoding: "utf8",
    windowsHide: true,
    shell: false
  });
  if (result.error) throw result.error;
  if (result.status !== 0 || !result.stdout.trim()) {
    throw new Error(`cygpath failed for ${file}: ${result.stderr || "empty output"}`);
  }
  return result.stdout.trim();
}

async function firstDirectory(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const entry = entries.find((candidate) => candidate.isDirectory());
  if (!entry) throw new Error(`Archive did not contain a directory: ${root}`);
  return join(root, entry.name);
}

async function pruneHyperframesRuntime(root, runtimeTarget) {
  const modules = join(root, "node_modules");
  await Promise.all([
    rm(join(modules, "onnxruntime-node"), { recursive: true, force: true }),
    rm(join(modules, "onnxruntime-common"), { recursive: true, force: true }),
    rm(join(modules, "@google", "genai"), { recursive: true, force: true })
  ]);

  const hyperframesPackagePath = join(modules, "hyperframes", "package.json");
  const hyperframesPackage = JSON.parse(await readFile(hyperframesPackagePath, "utf8"));
  delete hyperframesPackage.dependencies?.["onnxruntime-node"];
  delete hyperframesPackage.optionalDependencies?.["@google/genai"];
  await writeFile(hyperframesPackagePath, `${JSON.stringify(hyperframesPackage, null, 2)}\n`);

  await pruneScopedPlatformPackages(join(modules, "@img"), runtimeTarget === "darwin-arm64" ? ["colour", "sharp-darwin-arm64", "sharp-libvips-darwin-arm64"] : ["colour", "sharp-win32-x64", "sharp-libvips-win32-x64"]);
  await pruneScopedPlatformPackages(join(modules, "@esbuild"), runtimeTarget === "darwin-arm64" ? ["darwin-arm64"] : ["win32-x64"]);

  const required = runtimeTarget === "darwin-arm64"
    ? [join(modules, "@img", "sharp-darwin-arm64"), join(modules, "@esbuild", "darwin-arm64")]
    : [join(modules, "@img", "sharp-win32-x64"), join(modules, "@esbuild", "win32-x64")];
  for (const requiredPath of required) {
    if (!existsSync(requiredPath)) throw new Error(`Missing target-specific HyperFrames dependency: ${requiredPath}`);
  }
}

async function pruneScopedPlatformPackages(scopeDir, keep) {
  if (!existsSync(scopeDir)) return;
  const entries = await readdir(scopeDir, { withFileTypes: true });
  await Promise.all(entries.filter((entry) => entry.isDirectory() && !keep.includes(entry.name)).map((entry) => rm(join(scopeDir, entry.name), { recursive: true, force: true })));
}

async function assertRedistributableFfmpeg(root, targetPlatform) {
  const configurePath = join(root, "ffmpeg-configure.txt");
  if (!existsSync(configurePath)) {
    const executable = join(root, targetPlatform === "win32" ? "ffmpeg.exe" : "ffmpeg");
    const result = run(executable, ["-version"], { capture: true });
    await writeFile(configurePath, result.stdout);
  }
  const config = await readFile(configurePath, "utf8");
  if (!config.includes("--enable-gpl") || !config.includes("--enable-libx264") || config.includes("--enable-nonfree")) {
    throw new Error("FFmpeg must be GPL/libx264 and must not contain --enable-nonfree.");
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env || process.env,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    windowsHide: true,
    shell: false
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}: ${result.stderr || ""}`);
  return result;
}

async function sha256(file) {
  const hash = createHash("sha256");
  await new Promise((resolvePromise, reject) => {
    const input = createReadStream(file);
    input.on("data", (chunk) => hash.update(chunk));
    input.once("end", resolvePromise);
    input.once("error", reject);
  });
  return hash.digest("hex");
}

async function listFiles(root) {
  const result = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) result.push(...(await listFiles(path)));
    else if (entry.isFile()) result.push(path);
  }
  return result;
}

async function directoryIntegritySha256(root) {
  const hash = createHash("sha256");
  for (const file of (await listFiles(root)).sort()) {
    hash.update(relative(root, file).split("\\").join("/"));
    hash.update("\0");
    hash.update(await sha256(file));
    hash.update("\n");
  }
  return hash.digest("hex");
}

async function directorySize(root) {
  let total = 0;
  for (const file of await listFiles(root)) total += (await stat(file)).size;
  return total;
}

async function collectNpmLicenses(nodeModulesDir, destination, inventoryPath) {
  const packageDirs = [];
  for (const entry of await readdir(nodeModulesDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    if (entry.name.startsWith("@")) {
      for (const scopedEntry of await readdir(join(nodeModulesDir, entry.name), { withFileTypes: true })) {
        if (scopedEntry.isDirectory()) packageDirs.push(join(nodeModulesDir, entry.name, scopedEntry.name));
      }
    } else {
      packageDirs.push(join(nodeModulesDir, entry.name));
    }
  }

  const inventory = [];
  await mkdir(destination, { recursive: true });
  for (const packageDir of packageDirs.sort()) {
    const packageJsonPath = join(packageDir, "package.json");
    if (!existsSync(packageJsonPath)) continue;
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
    const licenseFiles = (await readdir(packageDir, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && /^(licen[cs]e|copying|notice)(\.|$)/iu.test(entry.name))
      .map((entry) => entry.name);
    const packageName = String(packageJson.name || basename(packageDir));
    const packageDestination = join(destination, packageName.replace(/^@/u, "").replace(/[^a-z0-9._-]+/giu, "__"));
    if (licenseFiles.length > 0) {
      await mkdir(packageDestination, { recursive: true });
      for (const file of licenseFiles) await cp(join(packageDir, file), join(packageDestination, file));
    }
    inventory.push({
      name: packageName,
      version: String(packageJson.version || "unknown"),
      license: packageJson.license || packageJson.licenses || "SEE PACKAGE FILES",
      homepage: packageJson.homepage || packageJson.repository?.url || null,
      licenseFiles
    });
  }
  await writeFile(inventoryPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), packages: inventory }, null, 2)}\n`);
}
