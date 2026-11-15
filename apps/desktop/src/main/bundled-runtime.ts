import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { createReadStream, existsSync, mkdirSync, readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import type { App } from "electron";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

type BundledRuntimeManifest = {
  schemaVersion: number;
  runtimeVersion: string;
  target: string;
  platform: string;
  arch: string;
  builtAt: string;
  components: {
    hyperframes?: { version?: string };
    chromeHeadlessShell?: { version?: string };
    node?: { version?: string };
    ffmpeg?: { version?: string; nonfree?: boolean };
  };
  capabilities: string[];
  excludedCapabilities: string[];
  executables: {
    node: string;
    hyperframesCli: string;
    browser: string;
    ffmpeg: string;
    ffprobe: string;
  };
  codeSignatureProtected?: Record<string, string>;
  integrity: Record<string, string>;
};

export type BundledRuntime = {
  root: string;
  manifestPath: string;
  manifest: BundledRuntimeManifest;
  nodeBin: string;
  nodeArgsPrefix: string[];
  hyperframesCli: string;
  browserBin: string;
  ffmpegBin: string;
  ffprobeBin: string;
};

export type BundledRuntimeDiagnostic = {
  state: "passed" | "failed" | "warning";
  label: string;
  detail?: string;
};

const runtimeOverrideEnv = "MKBOARD_BUNDLED_RUNTIME_DIR";
const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);

export function resolveBundledRuntime(): BundledRuntime {
  const root = bundledRuntimeRoot();
  const manifestPath = join(root, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`MkBoard 内置视频运行时缺失：${manifestPath}。请重新安装完整安装包。`);
  }

  let manifest: BundledRuntimeManifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as BundledRuntimeManifest;
  } catch (error) {
    throw new Error(`MkBoard 内置视频运行时清单损坏：${error instanceof Error ? error.message : String(error)}`);
  }

  const expectedTarget = expectedRuntimeTarget();
  if (manifest.schemaVersion !== 1 || manifest.target !== expectedTarget || manifest.platform !== process.platform || manifest.arch !== process.arch) {
    throw new Error(`MkBoard 内置视频运行时架构不匹配：需要 ${expectedTarget}，实际 ${manifest.target || "unknown"}。`);
  }
  if (manifest.components.ffmpeg?.nonfree !== false) {
    throw new Error("MkBoard 内置 FFmpeg 清单未声明可再分发的 GPL 构建。请重新安装完整安装包。");
  }

  const hyperframesCli = resolveRuntimeFile(root, manifest.executables.hyperframesCli);
  const browserBin = resolveRuntimeFile(root, manifest.executables.browser);
  const ffmpegBin = resolveRuntimeFile(root, manifest.executables.ffmpeg);
  const ffprobeBin = resolveRuntimeFile(root, manifest.executables.ffprobe);
  const nodeBin = manifest.executables.node === "__electron__" ? process.execPath : resolveRuntimeFile(root, manifest.executables.node);
  const required = [hyperframesCli, browserBin, ffmpegBin, ffprobeBin, nodeBin];
  const missing = required.find((file) => !existsSync(file));
  if (missing) throw new Error(`MkBoard 内置视频运行时文件缺失：${missing}。请重新安装完整安装包。`);

  return {
    root,
    manifestPath,
    manifest,
    nodeBin,
    nodeArgsPrefix: manifest.executables.node === "__electron__" ? [hyperframesCli] : [hyperframesCli],
    hyperframesCli,
    browserBin,
    ffmpegBin,
    ffprobeBin
  };
}

export function bundledRuntimeSpawnEnv(runtime: BundledRuntime, baseEnv: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const app = optionalElectronApp();
  const userDataDir = app ? app.getPath("userData") : process.env.MKBOARD_DATA_DIR?.trim() || join(homedir(), ".mkboard");
  const cacheRoot = join(userDataDir, "runtime-cache");
  const fontCache = join(cacheRoot, "fonts");
  const browserCache = join(cacheRoot, "browser");
  const extractCache = join(cacheRoot, "extract");
  for (const directory of [cacheRoot, fontCache, browserCache, extractCache]) mkdirSync(directory, { recursive: true });

  return {
    ...baseEnv,
    ...(runtime.manifest.executables.node === "__electron__" && Boolean(process.versions.electron) ? { ELECTRON_RUN_AS_NODE: "1" } : {}),
    HYPERFRAMES_BROWSER_PATH: runtime.browserBin,
    HYPERFRAMES_FFMPEG_PATH: runtime.ffmpegBin,
    HYPERFRAMES_FFPROBE_PATH: runtime.ffprobeBin,
    HYPERFRAMES_NO_UPDATE_CHECK: "1",
    HYPERFRAMES_NO_AUTO_INSTALL: "1",
    HYPERFRAMES_NO_TELEMETRY: "1",
    HYPERFRAMES_SKIP_SKILLS: "1",
    HYPERFRAMES_FONT_CACHE_DIR: fontCache,
    HYPERFRAMES_EXTRACT_CACHE_DIR: extractCache,
    PUPPETEER_CACHE_DIR: browserCache
  };
}

export async function verifyBundledRuntimeIntegrity(runtime = resolveBundledRuntime()): Promise<BundledRuntimeDiagnostic[]> {
  const diagnostics: BundledRuntimeDiagnostic[] = [];
  const integrityEntries = Object.entries(runtime.manifest.integrity || {});
  if (integrityEntries.length === 0) {
    return [{ state: "failed", label: "运行时完整性", detail: "manifest 没有文件哈希。" }];
  }

  for (const [file, expectedSha] of integrityEntries) {
    try {
      const path = resolveRuntimeFile(runtime.root, file);
      if (!existsSync(path)) {
        diagnostics.push({ state: "failed", label: "运行时完整性", detail: `缺少 ${file}` });
        continue;
      }
      const actualSha = await sha256(path);
      if (actualSha !== expectedSha) diagnostics.push({ state: "failed", label: "运行时完整性", detail: `${file} 的 SHA-256 不匹配。` });
    } catch (error) {
      diagnostics.push({ state: "failed", label: "运行时完整性", detail: error instanceof Error ? error.message : String(error) });
    }
  }

  const requireCodeSigning = process.env.MKBOARD_REQUIRE_CODE_SIGNING?.trim() === "1";
  const codeSignatureEntries = Object.keys(runtime.manifest.codeSignatureProtected || {});
  if (requireCodeSigning) {
    for (const file of codeSignatureEntries) {
      try {
        const path = resolveRuntimeFile(runtime.root, file);
        if (!existsSync(path)) {
          diagnostics.push({ state: "failed", label: "运行时签名", detail: `缺少 ${file}` });
          continue;
        }
        if (process.platform !== "darwin") continue;
        await execFileAsync("/usr/bin/codesign", ["--verify", "--strict", path]);
      } catch (error) {
        diagnostics.push({ state: "failed", label: "运行时签名", detail: `${file} 的签名校验未通过：${error instanceof Error ? error.message : String(error)}` });
      }
    }
  }

  const forbidden = await findForbiddenRuntimeFile(runtime.root);
  if (forbidden) diagnostics.push({ state: "failed", label: "运行时架构", detail: `发现不应打包的文件：${forbidden}` });
  if (diagnostics.length === 0) {
    diagnostics.push({ state: "passed", label: "运行时完整性", detail: `已验证 ${integrityEntries.length} 个文件的 SHA-256 和 ${codeSignatureEntries.length} 个 Mach-O 文件的 Developer ID 签名。` });
  }
  return diagnostics;
}

export function bundledRuntimeVersionSummary(runtime: BundledRuntime): string {
  const components = runtime.manifest.components;
  return [
    `HyperFrames ${components.hyperframes?.version || "unknown"}`,
    `Chrome ${components.chromeHeadlessShell?.version || "unknown"}`,
    `FFmpeg ${components.ffmpeg?.version || "unknown"}`,
    process.platform === "win32" ? `Node ${components.node?.version || "unknown"}` : "Electron Node 22"
  ].join(" · ");
}

function bundledRuntimeRoot(): string {
  const configured = process.env[runtimeOverrideEnv]?.trim();
  if (configured) return resolve(configured);
  const app = optionalElectronApp();
  if (app?.isPackaged) return join(process.resourcesPath, "runtime");
  if (app) return resolve(app.getAppPath(), "runtime", "current");
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  return resolve(moduleDir, "..", "..", "runtime", "current");
}

function optionalElectronApp(): App | null {
  try {
    const electron = require("electron") as { app?: App } | string;
    if (typeof electron === "string" || !electron.app) return null;
    return electron.app;
  } catch {
    return null;
  }
}

function expectedRuntimeTarget(): string {
  if (process.platform === "darwin" && process.arch === "arm64") return "darwin-arm64";
  if (process.platform === "win32" && process.arch === "x64") return "win32-x64";
  return `${process.platform}-${process.arch}`;
}

function resolveRuntimeFile(root: string, file: string): string {
  if (!file || isAbsolute(file)) throw new Error(`运行时清单包含无效路径：${file || "<empty>"}`);
  const normalized = normalize(file);
  const path = resolve(root, normalized);
  const relativePath = relative(root, path);
  if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error(`运行时清单路径越界：${file}`);
  }
  return path;
}

async function sha256(file: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolvePromise, reject) => {
    const stream = createReadStream(file);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("end", resolvePromise);
    stream.once("error", reject);
  });
  return hash.digest("hex");
}

async function findForbiddenRuntimeFile(root: string): Promise<string | null> {
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop();
    if (!directory) break;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        pending.push(path);
        continue;
      }
      const name = entry.name.toLowerCase();
      if (name.includes("onnxruntime")) return relative(root, path);
      if (process.platform === "darwin" && (name.endsWith(".exe") || name.endsWith(".dll"))) return relative(root, path);
      if (process.platform === "win32" && (name.endsWith(".dylib") || name.endsWith(".so"))) return relative(root, path);
    }
  }
  return null;
}
