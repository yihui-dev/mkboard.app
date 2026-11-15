import { spawn, type ChildProcess } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { request } from "node:http";
import { createServer } from "node:net";
import { dirname, extname, isAbsolute, join, resolve as resolvePath } from "node:path";
import { localCliSpawnEnv } from "./codex-auth";
import { bundledRuntimeSpawnEnv, resolveBundledRuntime } from "./bundled-runtime";
import { runManagedProcess, terminateProcessTree } from "./managed-process";
import { runHyperframesProjectAgent, runHyperframesProjectRepairAgent, type HyperframesProjectFile, type HyperframesReferenceAsset } from "./codex-agent";
import { normalizeHyperframesProjectFontsForLint } from "./hyperframes-fonts";
import { extractVideoTailFrame } from "./video-poster";
import type {
  AgentEvent,
  AgentCliId,
  ProjectDetail,
  StoryboardRow,
  StoryboardVideoBatchInput,
  StoryboardVideoGenerationProgress,
  StoryboardVideoGenerationMethod,
  StoryboardVideoGenerationTarget,
  ProjectAsset
} from "../shared";
import { hyperframesVideoDimensionsFromAspectRatio, isAgentNetworkFailureMessage, isCodexChatGptWebsocketForbiddenMessage, normalizeHyperframesVideoResolution } from "../shared";

type GeneratedStoryboardVideo = {
  rowId: string;
  method: StoryboardVideoGenerationMethod;
  outputPath: string | null;
  posterPath?: string | null;
  providerTaskId?: string;
  cancelled?: boolean;
  errorMessage?: string;
};

type GeneratedStoryboardVideoOutput = {
  outputPath: string;
  posterPath?: string | null;
  providerTaskId?: string;
};

type PreparedHyperframesReferenceAsset = HyperframesReferenceAsset & {
  absolutePath: string;
};

type ExecResult = {
  code: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
};

type ExecCliOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  onOutput?: (chunk: string, stream: "stdout" | "stderr") => void;
  signal?: AbortSignal;
};

type HyperframesCliCommand = {
  bin: string;
  argsPrefix: string[];
  label: string;
  env: NodeJS.ProcessEnv;
};

class HyperframesProjectValidationError extends Error {
  override readonly name = "HyperframesProjectValidationError";
}

type LocalStoryboardVideoGenerationCallbacks = {
  signal?: AbortSignal;
  onTaskPrepared?: (target: StoryboardVideoGenerationTarget, meta: { workDir: string }) => void;
  onTaskStart?: (target: StoryboardVideoGenerationTarget) => void;
  onTaskProgress?: (target: StoryboardVideoGenerationTarget, progress: StoryboardVideoGenerationProgress) => void;
  onTaskComplete?: (result: GeneratedStoryboardVideo) => void;
};

type HyperframesStudioPreview = {
  process: ChildProcess;
  projectDir: string;
  studioUrl: string;
  isReady: boolean;
  stop: () => void;
};

type HyperframesStudioProject = {
  id: string;
  dir: string;
};

const defaultVideoDurationSec = 10;
const defaultHyperframesInspectTimeoutMs = 2 * 60 * 60_000;
const defaultHyperframesRenderTimeoutMs = 2 * 60 * 60_000;
const defaultHyperframesRepairAttempts = 2;
const defaultHyperframesStudioTtlMs = 10 * 60_000;
const defaultHyperframesStudioStopTimeoutMs = 10_000;
const defaultVideoGenerationConcurrency = 2;
const maxVideoGenerationConcurrency = 5;
const defaultVideoTaskTimeoutMs = 2 * 60 * 60_000;
const maxVideoTaskErrorChars = 1000;
const activeHyperframesStudioPreviews = new Set<HyperframesStudioPreview>();

export async function runLocalStoryboardVideoGeneration(project: ProjectDetail, input: StoryboardVideoBatchInput, callbacks: LocalStoryboardVideoGenerationCallbacks = {}): Promise<GeneratedStoryboardVideo[]> {
  const targets = normalizeVideoTargets(input.items);
  const results: Array<GeneratedStoryboardVideo | undefined> = new Array(targets.length);
  let nextTargetIndex = 0;

  async function runWorker(): Promise<void> {
    while (!callbacks.signal?.aborted) {
      const targetIndex = nextTargetIndex;
      nextTargetIndex += 1;
      if (targetIndex >= targets.length) return;
      const target = targets[targetIndex];
      results[targetIndex] = await runLocalStoryboardVideoTarget(project, input, target, callbacks);
    }
  }

  const workerCount = Math.min(resolveVideoGenerationConcurrency(input.hyperframesConcurrency), targets.length);
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

  if (callbacks.signal?.aborted) {
    targets.forEach((target, index) => {
      if (results[index]) return;
      const result = cancelledVideoResult(target);
      results[index] = result;
      callbacks.onTaskComplete?.(result);
    });
  }

  return results.filter((result): result is GeneratedStoryboardVideo => Boolean(result));
}

async function runLocalStoryboardVideoTarget(
  project: ProjectDetail,
  input: StoryboardVideoBatchInput,
  target: StoryboardVideoGenerationTarget,
  callbacks: LocalStoryboardVideoGenerationCallbacks
): Promise<GeneratedStoryboardVideo> {
  if (callbacks.signal?.aborted) {
    const result = cancelledVideoResult(target);
    callbacks.onTaskComplete?.(result);
    return result;
  }

  try {
    const row = project.rows.find((item) => item.id === target.rowId);
    if (!row) throw new Error("分镜行不存在。");

    const workDir = join(project.project.localPath, ".mkboard", "generated-videos", `${Date.now()}-${safeSegment(target.rowId)}`);
    mkdirSync(workDir, { recursive: true });
    callbacks.onTaskPrepared?.(target, { workDir });
    callbacks.onTaskStart?.(target);
    callbacks.onTaskProgress?.(target, {
      stage: "agent",
      stageLabel: "正在生成 HyperFrames 项目",
      stageDetail: "MkBoard 正在调用本机 Agent 编写官方 HyperFrames HTML composition。",
      workDir
    });
    throwIfAborted(callbacks.signal);

    if (target.method !== "Hyperframes") {
      throw new Error("Seedance 2.0 视频生成已迁移到服务端 KIE，不再通过本机视频模块执行。");
    }
    const output = await runWithVideoTaskTimeout(callbacks.signal, (taskSignal) =>
      generateHyperframesVideo(project, row, target, input.agentCliId ?? "codex", workDir, taskSignal, (progress) => {
        callbacks.onTaskProgress?.(target, progress);
      })
    );
    const result = { rowId: target.rowId, method: target.method, outputPath: output.outputPath, posterPath: output.posterPath, providerTaskId: output.providerTaskId };
    callbacks.onTaskComplete?.(result);
    return result;
  } catch (error) {
    const cancelled = callbacks.signal?.aborted || isAbortError(error);
    const result = {
      rowId: target.rowId,
      method: target.method,
      outputPath: null,
      cancelled,
      errorMessage: cancelled ? "视频生成已中止。" : sanitizeVideoTaskError(error instanceof Error ? error.message : String(error))
    };
    callbacks.onTaskComplete?.(result);
    return result;
  }
}

async function runWithVideoTaskTimeout<T>(parentSignal: AbortSignal | undefined, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromParent = () => controller.abort();
  const timeoutMs = resolveVideoTaskTimeoutMs();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  if (parentSignal?.aborted) controller.abort();
  parentSignal?.addEventListener("abort", abortFromParent, { once: true });

  try {
    return await run(controller.signal);
  } catch (error) {
    if (timedOut) {
      throw new Error(`视频生成超时，已停止当前镜头。单个视频最长允许 ${formatVideoTaskTimeout(timeoutMs)}，可在生成历史中重试该镜头。`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener("abort", abortFromParent);
  }
}

function resolveVideoGenerationConcurrency(configuredConcurrency?: unknown): number {
  const configured = normalizeVideoGenerationConcurrency(configuredConcurrency);
  if (configured) return configured;
  const raw = process.env.MKBOARD_VIDEO_GENERATION_CONCURRENCY?.trim() || process.env.MKBOARD_VIDEO_CONCURRENCY?.trim();
  const value = raw ? Number(raw) : defaultVideoGenerationConcurrency;
  if (!Number.isFinite(value)) return defaultVideoGenerationConcurrency;
  return normalizeVideoGenerationConcurrency(value) ?? defaultVideoGenerationConcurrency;
}

function normalizeVideoGenerationConcurrency(value: unknown): number | null {
  const numericValue = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(numericValue)) return null;
  return Math.max(1, Math.min(maxVideoGenerationConcurrency, Math.round(numericValue)));
}

function resolveVideoTaskTimeoutMs(): number {
  const raw = process.env.MKBOARD_VIDEO_TASK_TIMEOUT_MS?.trim();
  const value = raw ? Number(raw) : defaultVideoTaskTimeoutMs;
  if (!Number.isFinite(value)) return defaultVideoTaskTimeoutMs;
  return Math.max(60_000, Math.min(2 * 60 * 60_000, Math.round(value)));
}

function formatVideoTaskTimeout(timeoutMs: number): string {
  if (timeoutMs >= 60_000) return `${Math.round(timeoutMs / 60_000)} 分钟`;
  return `${Math.round(timeoutMs / 1000)} 秒`;
}

function normalizeVideoTargets(items: StoryboardVideoBatchInput["items"]): StoryboardVideoGenerationTarget[] {
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const targets: StoryboardVideoGenerationTarget[] = [];
  for (const item of items) {
    const rowId = typeof item?.rowId === "string" ? item.rowId.trim() : "";
    const method = item?.method;
    const prompt = normalizeVideoPrompt(item?.prompt);
    if (!rowId || !prompt || method !== "Hyperframes" || seen.has(rowId)) continue;
    seen.add(rowId);
    targets.push({
      rowId,
      method,
      prompt,
      durationSec: normalizeDurationSec(item.durationSec),
      aspectRatio: normalizeAspectRatio(item.aspectRatio),
      hyperframesResolution: normalizeHyperframesVideoResolution(item.hyperframesResolution)
    });
  }
  return targets;
}

function normalizeVideoPrompt(value: unknown): string {
  const prompt = typeof value === "string" ? value.trim() : "";
  if (!prompt || prompt === "—" || prompt === "-") return "";
  return prompt;
}

async function generateHyperframesVideo(
  project: ProjectDetail,
  row: StoryboardRow,
  target: StoryboardVideoGenerationTarget,
  agentCliId: AgentCliId,
  workDir: string,
  signal?: AbortSignal,
  onProgress?: (progress: StoryboardVideoGenerationProgress) => void
): Promise<GeneratedStoryboardVideoOutput> {
  const emitProgress = (progress: StoryboardVideoGenerationProgress) => onProgress?.(progress);
  throwIfAborted(signal);
  const durationSec = target.durationSec || defaultVideoDurationSec;
  const hyperframesResolution = normalizeHyperframesVideoResolution(target.hyperframesResolution);
  const dimensions = hyperframesVideoDimensionsFromAspectRatio(target.aspectRatio || project.imageRatio, hyperframesResolution);
  emitProgress({
    stage: "runtime",
    stageLabel: "正在检查 HyperFrames 渲染环境",
    stageDetail: "先确认 MkBoard 内置运行时可用，再调用 Agent 生成项目。",
    workDir
  });
  await assertHyperframesRuntimeReady(signal);
  const agentProjectDir = join(workDir, "agent-hyperframes-project");
  const referenceAssets = collectHyperframesReferenceAssets(project, row);
  copyHyperframesReferenceAssets(agentProjectDir, referenceAssets);
  const onAgentEvent = createHyperframesAgentProgressHandler(agentCliId, workDir, emitProgress, "agent");
  const files = await runHyperframesProjectAgent({
    project,
    row,
    prompt: target.prompt,
    imageRatio: target.aspectRatio || project.imageRatio,
    hyperframesResolution,
    durationSec,
    referenceAssets,
    agentCliId,
    agentProjectDir,
    signal,
    onEvent: onAgentEvent
  });
  emitProgress({
    stage: "project",
    stageLabel: "HyperFrames 项目文件已生成",
    stageDetail: "MkBoard 正在写入 index.html、DESIGN.md 和官方 CLI 项目支撑文件。",
    workDir
  });
  throwIfAborted(signal);
  const projectDir = join(workDir, "hyperframes-project");
  const outputPath = join(workDir, "hyperframes.mp4");
  let currentFiles = applyHyperframesResolutionToProjectFiles(normalizeHyperframesProjectFontsForLint(files), dimensions);
  let lastError: unknown;
  const maxAttempts = resolveHyperframesRepairAttempts() + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    throwIfAborted(signal);
    currentFiles = applyHyperframesResolutionToProjectFiles(currentFiles, dimensions);
    await prepareHyperframesProjectDirectory(projectDir);
    writeHyperframesProjectFiles(projectDir, {
      files: currentFiles,
      projectName: project.project.name,
      rowId: target.rowId,
      durationSec
    });
    copyHyperframesReferenceAssets(projectDir, referenceAssets);
    emitProgress({
      stage: "project",
      stageLabel: attempt > 1 ? `已写入修复后的 HyperFrames 项目` : "已写入 HyperFrames 项目",
      stageDetail: projectDir,
      workDir
    });

    try {
      assertHyperframesProjectIsSelfContained(currentFiles);
      await renderHyperframesProject({
        projectDir,
        outputPath,
        signal,
        onProgress: emitProgress
      });
      const posterPath = await extractVideoTailFrame(outputPath, join(workDir, "hyperframes-tail-frame.jpg"), signal, emitProgress);
      return { outputPath, posterPath };
    } catch (error) {
      throwIfAborted(signal);
      if (!(error instanceof HyperframesProjectValidationError)) throw error;
      lastError = error;
      if (attempt >= maxAttempts) break;
      emitProgress({
        stage: "repair",
        stageLabel: `HyperFrames 项目校验未通过，正在自动修复 ${attempt}/${maxAttempts - 1}`,
        stageDetail: error instanceof Error ? error.message : String(error),
        workDir
      });
      const repairAgentProjectDir = join(workDir, `agent-hyperframes-repair-${attempt}`);
      copyHyperframesReferenceAssets(repairAgentProjectDir, referenceAssets);
      const onRepairAgentEvent = createHyperframesAgentProgressHandler(agentCliId, workDir, emitProgress, "repair");
      currentFiles = normalizeHyperframesProjectFontsForLint(await runHyperframesProjectRepairAgent({
        project,
        row,
        prompt: target.prompt,
        imageRatio: target.aspectRatio || project.imageRatio,
        hyperframesResolution,
        durationSec,
        referenceAssets,
        agentCliId,
        files: currentFiles,
        errorMessage: error instanceof Error ? error.message : String(error),
        agentProjectDir: repairAgentProjectDir,
        signal,
        onEvent: onRepairAgentEvent
      }));
    }
  }

  throw new Error(formatHyperframesFinalError(lastError, maxAttempts - 1));
}

function createHyperframesAgentProgressHandler(
  agentCliId: AgentCliId,
  workDir: string,
  emitProgress: (progress: StoryboardVideoGenerationProgress) => void,
  stage: Extract<StoryboardVideoGenerationProgress["stage"], "agent" | "repair">
): (event: AgentEvent) => void {
  const agentName = agentCliDisplayName(agentCliId);
  return (event) => {
    const progress = hyperframesAgentEventToProgress(event, agentName, workDir, stage);
    if (progress) emitProgress(progress);
  };
}

function hyperframesAgentEventToProgress(
  event: AgentEvent,
  agentName: string,
  workDir: string,
  stage: Extract<StoryboardVideoGenerationProgress["stage"], "agent" | "repair">
): StoryboardVideoGenerationProgress | null {
  if (event.kind === "status") {
    return {
      stage,
      stageLabel: formatHyperframesAgentStatusLabel(event.label, agentName, stage),
      stageDetail: truncateProgressText(event.detail ?? ""),
      cliLog: event.detail ? `[${agentName}] ${event.detail}` : undefined,
      workDir
    };
  }
  if (event.kind === "error") {
    const detail = formatHyperframesAgentError(event.message, agentName);
    return {
      stage,
      stageLabel: `${agentName} 连接或生成失败`,
      stageDetail: detail,
      cliLog: truncateProgressText(event.raw || event.message, 1200),
      workDir
    };
  }
  if (event.kind === "tool_use") {
    return {
      stage,
      stageLabel: stage === "repair" ? `${agentName} 正在修复 HyperFrames 项目` : `${agentName} 正在生成 HyperFrames 项目`,
      stageDetail: event.name,
      cliLog: `[${agentName}] tool_use ${event.name}`,
      workDir
    };
  }
  if (event.kind === "tool_result" && event.isError) {
    return {
      stage,
      stageLabel: `${agentName} 工具执行失败`,
      stageDetail: truncateProgressText(event.content),
      cliLog: truncateProgressText(event.content, 1200),
      workDir
    };
  }
  return null;
}

function formatHyperframesAgentStatusLabel(
  label: string,
  agentName: string,
  stage: Extract<StoryboardVideoGenerationProgress["stage"], "agent" | "repair">
): string {
  const normalized = label.trim().toLowerCase();
  if (normalized === "warning") return `${agentName} 输出异常，正在恢复`;
  if (normalized === "writing") return `${agentName} 已返回 HyperFrames 项目`;
  if (normalized === "canceled" || normalized === "cancelled") return `${agentName} 已停止`;
  return stage === "repair" ? `${agentName} 正在修复 HyperFrames 项目` : `${agentName} 正在生成 HyperFrames 项目`;
}

function formatHyperframesAgentError(message: string, agentName: string): string {
  const normalized = message.replace(/\s+/gu, " ").trim();
  if (agentName === "Codex CLI" && isCodexChatGptWebsocketForbiddenMessage(normalized)) {
    return "Codex CLI 已登录，但连接 ChatGPT 服务时被网络网关临时拒绝（HTTP 403）。MkBoard 会等待 CLI 自动重连；如果最终仍失败，请切换网络或代理/VPN 节点后重试。";
  }
  if (isAgentNetworkFailureMessage(normalized)) {
    if (agentName === "Claude Code") return "Claude Code 网络/API 网关连接失败。请检查网络、代理/VPN、ANTHROPIC_BASE_URL 或 API usage 配置后重试。";
    return `${agentName} 网络请求失败。请检查网络、代理/VPN 或模型服务连接后重试。`;
  }
  if (/timed out|timeout|超时/iu.test(normalized)) return `${agentName} 生成 HyperFrames 项目超时，已停止当前镜头。请稍后重试。`;
  return truncateProgressText(normalized || `${agentName} 调用失败。`) ?? `${agentName} 调用失败。`;
}

function agentCliDisplayName(agentCliId: AgentCliId): string {
  if (agentCliId === "claude-code") return "Claude Code";
  if (agentCliId === "antigravity" || agentCliId === "gemini-cli") return "Antigravity";
  if (agentCliId === "opencode") return "OpenCode";
  if (agentCliId === "cursor-agent") return "Cursor Agent";
  if (agentCliId === "kimi-cli") return "Kimi CLI";
  return "Codex CLI";
}

function applyHyperframesResolutionToProjectFiles(
  files: HyperframesProjectFile[],
  dimensions: { width: number; height: number }
): HyperframesProjectFile[] {
  return files.map((file) => {
    const projectPath = file.path.replace(/\\/gu, "/").replace(/^\.?\//u, "").trim();
    if (projectPath !== "index.html") return file;
    return {
      ...file,
      content: applyHyperframesRootDimensions(file.content, dimensions)
    };
  });
}

function collectHyperframesReferenceAssets(project: ProjectDetail, row: StoryboardRow): PreparedHyperframesReferenceAsset[] {
  const assetsById = new Map(project.assets.map((asset) => [asset.id, asset]));
  const seenAssetIds = new Set<string>();
  const result: PreparedHyperframesReferenceAsset[] = [];
  const rowAssetIds = row.imageAssetIds ?? (row.imageAssetId ? [row.imageAssetId] : []);

  for (const assetId of rowAssetIds) {
    if (seenAssetIds.has(assetId)) continue;
    seenAssetIds.add(assetId);
    const asset = assetsById.get(assetId);
    if (!asset || asset.kind !== "image") continue;
    const absolutePath = absoluteProjectAssetPath(project, asset);
    if (!existsSync(absolutePath)) continue;
    result.push({
      assetId: asset.id,
      name: asset.name,
      sourcePath: asset.indexedPath || asset.localPath,
      renderPath: hyperframesReferenceAssetRenderPath(asset, result.length),
      absolutePath
    });
  }

  return result;
}

function copyHyperframesReferenceAssets(projectDir: string, referenceAssets: PreparedHyperframesReferenceAsset[]): void {
  if (referenceAssets.length === 0) return;
  for (const asset of referenceAssets) {
    const targetPath = join(projectDir, ...asset.renderPath.split("/"));
    mkdirSync(dirname(targetPath), { recursive: true });
    copyFileSync(asset.absolutePath, targetPath);
  }
}

function hyperframesReferenceAssetRenderPath(asset: ProjectAsset, index: number): string {
  const ext = normalizeReferenceAssetExtension(extname(asset.name) || extname(asset.localPath) || extname(asset.indexedPath || ""));
  return `assets/${String(index + 1).padStart(2, "0")}-${safeSegment(asset.id)}${ext}`;
}

function normalizeReferenceAssetExtension(extension: string): string {
  const normalized = extension.toLowerCase();
  return /^\.[a-z0-9]{1,8}$/u.test(normalized) ? normalized : ".png";
}

function absoluteProjectAssetPath(project: ProjectDetail, asset: ProjectAsset): string {
  if (isAbsolute(asset.localPath)) return asset.localPath;
  if (asset.indexedPath && isAbsolute(asset.indexedPath)) return asset.indexedPath;
  return join(project.project.localPath, asset.indexedPath || asset.localPath);
}

function applyHyperframesRootDimensions(html: string, dimensions: { width: number; height: number }): string {
  return html.replace(/<[A-Za-z][\w:-]*(?=[^>]*\bid=(["'])root\1)[^>]*>/iu, (tag) =>
    upsertHtmlAttribute(upsertHtmlAttribute(tag, "data-width", String(dimensions.width)), "data-height", String(dimensions.height))
  );
}

function upsertHtmlAttribute(tag: string, name: string, value: string): string {
  const attributePattern = new RegExp(`(\\s${escapeRegExp(name)}=)(["'])[^"']*\\2`, "iu");
  if (attributePattern.test(tag)) return tag.replace(attributePattern, `$1"${value}"`);
  const selfClosing = /\/>$/u.test(tag);
  const baseTag = tag.replace(/\s*\/?>$/u, "");
  return `${baseTag} ${name}="${value}"${selfClosing ? " />" : ">"}`;
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export function stopActiveHyperframesStudioPreviews(): void {
  for (const preview of Array.from(activeHyperframesStudioPreviews)) {
    preview.stop();
  }
}

async function prepareHyperframesProjectDirectory(projectDir: string): Promise<void> {
  const previews = Array.from(activeHyperframesStudioPreviews).filter((preview) => preview.projectDir === projectDir);
  for (const preview of previews) preview.stop();
  await Promise.all(previews.map((preview) => waitForChildProcessExit(preview.process, defaultHyperframesStudioStopTimeoutMs)));

  try {
    await rm(projectDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`无法更新 HyperFrames 项目目录。请关闭已打开的 HyperFrames Studio 后重试。${detail ? `\n${detail}` : ""}`);
  }
}

function waitForChildProcessExit(child: ChildProcess, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.removeListener("close", finish);
      child.removeListener("error", finish);
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    timer.unref?.();
    child.once("close", finish);
    child.once("error", finish);
    if (child.exitCode !== null) finish();
  });
}

export async function ensureHyperframesStudioPreviewForWorkDir(workDir: string): Promise<string> {
  const projectDir = resolveHyperframesProjectDir(workDir);
  const activePreview = findActiveHyperframesStudioPreview(projectDir);
  if (activePreview) return activePreview.studioUrl;

  const cli = await resolveHyperframesCli();
  const preview = await startHyperframesStudioPreview(cli, projectDir, undefined);
  return preview.studioUrl;
}

function resolveHyperframesProjectDir(workDir: string): string {
  const normalizedWorkDir = typeof workDir === "string" ? workDir.trim() : "";
  if (!normalizedWorkDir || !isAbsolute(normalizedWorkDir)) {
    throw new Error("无法重新打开 HyperFrames Studio：生成目录无效。");
  }

  const nestedProjectDir = join(normalizedWorkDir, "hyperframes-project");
  if (existsSync(join(nestedProjectDir, "index.html"))) return nestedProjectDir;
  if (existsSync(join(normalizedWorkDir, "index.html"))) return normalizedWorkDir;
  throw new Error("无法重新打开 HyperFrames Studio：未找到已生成的 HyperFrames 项目文件。");
}

function findActiveHyperframesStudioPreview(projectDir: string): HyperframesStudioPreview | null {
  for (const preview of activeHyperframesStudioPreviews) {
    if (preview.projectDir === projectDir && preview.isReady && preview.process.exitCode === null && !preview.process.killed) return preview;
  }
  return null;
}

function writeHyperframesProjectFiles(
  projectDir: string,
  input: { files: HyperframesProjectFile[]; projectName: string; rowId: string; durationSec: number }
): void {
  mkdirSync(projectDir, { recursive: true });
  const written = new Set<string>();

  for (const file of input.files) {
    const projectPath = normalizeHyperframesProjectPath(file.path);
    if (!projectPath) {
      throw new Error(`HyperFrames 项目包含不允许写入的文件路径：${file.path}`);
    }
    const filePath = join(projectDir, ...projectPath.split("/"));
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, file.content, "utf8");
    written.add(projectPath);
  }

  if (!written.has("index.html")) {
    throw new Error("HyperFrames 项目缺少 index.html。");
  }
  if (!written.has("hyperframes.json")) {
    writeFileSync(join(projectDir, "hyperframes.json"), JSON.stringify(defaultHyperframesConfig(), null, 2), "utf8");
  }
  if (!written.has("meta.json")) {
    writeFileSync(
      join(projectDir, "meta.json"),
      JSON.stringify(
        {
          id: `mkboard-${safeSegment(input.rowId)}`,
          name: `${input.projectName} - ${input.rowId}`,
          createdAt: new Date().toISOString()
        },
        null,
        2
      ),
      "utf8"
    );
  }
  if (!written.has("package.json")) {
    writeFileSync(join(projectDir, "package.json"), JSON.stringify(defaultHyperframesPackageJson(input.rowId), null, 2), "utf8");
  }
  if (!written.has("AGENTS.md")) {
    writeFileSync(join(projectDir, "AGENTS.md"), defaultHyperframesAgentsMd(input.durationSec), "utf8");
  }
}

function normalizeHyperframesProjectPath(input: string): string | null {
  const projectPath = input.replace(/\\/gu, "/").replace(/^\.?\//u, "").trim();
  if (!projectPath || projectPath.startsWith("/") || projectPath.split("/").some((part) => part === ".." || part === "")) return null;

  const allowedTopLevelFiles = new Set(["index.html", "DESIGN.md", "visual-style.md", "hyperframes.json", "meta.json", "package.json", "AGENTS.md", "CLAUDE.md"]);
  if (allowedTopLevelFiles.has(projectPath)) return projectPath;
  if (/^(compositions|assets)\/[A-Za-z0-9._/-]+$/u.test(projectPath)) return projectPath;
  return null;
}

function defaultHyperframesConfig(): Record<string, unknown> {
  return {
    $schema: "https://hyperframes.heygen.com/schema/hyperframes.json",
    registry: "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry",
    paths: {
      blocks: "compositions",
      components: "compositions/components",
      assets: "assets"
    }
  };
}

function defaultHyperframesPackageJson(rowId: string): Record<string, unknown> {
  return {
    name: `mkboard-hyperframes-${safeSegment(rowId).toLowerCase()}`,
    private: true,
    type: "module"
  };
}

function defaultHyperframesAgentsMd(durationSec: number): string {
  return `# MkBoard HyperFrames Composition

This temporary project is generated by MkBoard and rendered with the official HyperFrames CLI.

## Runtime

MkBoard runs lint, validate, inspect, Studio, and render with its bundled
HyperFrames runtime. Do not install HyperFrames, Node.js, Chrome, or FFmpeg,
and do not invoke package-manager commands from this temporary project.

## Composition Rules

- The root composition is \`data-composition-id="main"\` and lasts ${durationSec} seconds.
- Timed visible elements need \`class="clip"\`, \`data-start\`, \`data-duration\`, and \`data-track-index\`.
- Timelines are paused and registered on \`window.__timelines\`.
- If no bundled font files are provided, use generic local font families only: \`system-ui, sans-serif\`, \`ui-serif, serif\`, or \`ui-monospace, monospace\`. Do not use undeclared named families such as Noto Sans SC, PingFang SC, Microsoft YaHei, -apple-system, or BlinkMacSystemFont.
`;
}

async function renderHyperframesProject(input: { projectDir: string; outputPath: string; signal?: AbortSignal; onProgress?: (progress: StoryboardVideoGenerationProgress) => void }): Promise<void> {
  throwIfAborted(input.signal);
  input.onProgress?.({
    stage: "runtime",
    stageLabel: "正在检查 HyperFrames 渲染环境",
    stageDetail: "正在验证 MkBoard 内置的 HyperFrames、Chrome 和 FFmpeg。"
  });
  await assertHyperframesRuntimeReady(input.signal);
  input.onProgress?.({
    stage: "cli",
    stageLabel: "正在解析官方 HyperFrames CLI",
    stageDetail: "使用安装包内置的固定版本，不读取系统 PATH。"
  });
  const cli = await resolveHyperframesCli(input.signal);
  input.onProgress?.({
    stage: "cli",
    stageLabel: "已连接官方 HyperFrames CLI",
    stageDetail: cli.label,
    cliLog: `$ ${cli.label} --version`
  });
  try {
    await startHyperframesStudioPreview(cli, input.projectDir, input.signal, input.onProgress);
  } catch (error) {
    input.onProgress?.({
      stage: "studio",
      stageLabel: "HyperFrames Studio 未能自动打开",
      stageDetail: "MkBoard 会继续执行 CLI 渲染；可根据日志检查 preview 失败原因。",
      cliLog: error instanceof Error ? error.message : String(error)
    });
  }
  await runHyperframesCli(cli, ["lint"], input.projectDir, 120_000, input.signal, "HyperFrames lint 失败", input.onProgress, {
    stage: "lint",
    label: "正在运行 hyperframes lint"
  });
  await runHyperframesCli(cli, ["validate"], input.projectDir, 120_000, input.signal, "HyperFrames validate 失败", input.onProgress, {
    stage: "validate",
    label: "正在运行 hyperframes validate"
  });
  await runHyperframesCli(cli, ["inspect"], input.projectDir, resolveHyperframesInspectTimeoutMs(), input.signal, "HyperFrames inspect 失败", input.onProgress, {
    stage: "inspect",
    label: "正在运行 hyperframes inspect"
  });
  await runHyperframesCli(
    cli,
    ["render", "--output", input.outputPath, "--workers", resolveHyperframesWorkers()],
    input.projectDir,
    resolveHyperframesRenderTimeoutMs(),
    input.signal,
    "HyperFrames render 失败",
    input.onProgress,
    {
      stage: "render",
      label: "正在运行 hyperframes render"
    }
  );
  if (!existsSync(input.outputPath)) {
    throw new Error("HyperFrames CLI 渲染完成但没有生成 MP4 文件。");
  }
  input.onProgress?.({
    stage: "done",
    stageLabel: "HyperFrames CLI 渲染完成",
    stageDetail: input.outputPath
  });
}

async function resolveHyperframesCli(signal?: AbortSignal): Promise<HyperframesCliCommand> {
  throwIfAborted(signal);
  const runtime = resolveBundledRuntime();
  const cli: HyperframesCliCommand = {
    bin: runtime.nodeBin,
    argsPrefix: runtime.nodeArgsPrefix,
    label: `MkBoard bundled HyperFrames ${runtime.manifest.components.hyperframes?.version || "unknown"}`,
    env: bundledRuntimeSpawnEnv(runtime, localCliSpawnEnv())
  };
  const result = await execCli(cli.bin, [...cli.argsPrefix, "--version"], 20_000, { signal, env: cli.env });
  throwIfAborted(signal);
  if (result.code !== 0) throw new Error(formatCliFailure("MkBoard 内置 HyperFrames CLI 无法启动，请重新安装完整安装包", result));
  return cli;
}

async function assertHyperframesRuntimeReady(signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  resolveBundledRuntime();
}

async function runHyperframesCli(
  cli: HyperframesCliCommand,
  args: string[],
  cwd: string,
  timeoutMs: number,
  signal: AbortSignal | undefined,
  failurePrefix: string,
  onProgress?: (progress: StoryboardVideoGenerationProgress) => void,
  stage?: { stage: StoryboardVideoGenerationProgress["stage"]; label: string }
): Promise<void> {
  const command = `${cli.label} ${args.join(" ")}`;
  onProgress?.({
    stage: stage?.stage,
    stageLabel: stage?.label,
    stageDetail: command,
    cliLog: `$ ${command}`
  });
  const result = await execCli(cli.bin, [...cli.argsPrefix, ...args], timeoutMs, {
    cwd,
    env: cli.env,
    signal,
    onOutput: (chunk) => {
      onProgress?.({
        stage: stage?.stage,
        stageLabel: stage?.label,
        stageDetail: command,
        cliLog: normalizeCliOutputChunk(chunk)
      });
    }
  });
  throwIfAborted(signal);
  if (result.code !== 0) {
    const message = `${formatCliFailure(failurePrefix, result)}\n命令：${cli.label} ${args.join(" ")}`;
    if (isHyperframesProjectValidationStage(stage?.stage)) throw new HyperframesProjectValidationError(message);
    throw new Error(message);
  }
  onProgress?.({
    stage: stage?.stage,
    stageLabel: stage?.label ? `${stage.label} 完成` : undefined,
    stageDetail: summarizeCliSuccess(result) || command
  });
}

function isHyperframesProjectValidationStage(stage: StoryboardVideoGenerationProgress["stage"] | undefined): boolean {
  return stage === "lint" || stage === "validate" || stage === "inspect";
}

function assertHyperframesProjectIsSelfContained(files: HyperframesProjectFile[]): void {
  const remoteResourcePatterns = [
    /<(?:script|link|img|video|audio|source)\b[^>]*(?:src|href)\s*=\s*["']\s*(?:https?:)?\/\//iu,
    /\b(?:fetch|import)\s*\(\s*["'`]\s*(?:https?:)?\/\//iu,
    /@import\s+(?:url\(\s*)?["']?\s*(?:https?:)?\/\//iu,
    /url\(\s*["']?\s*(?:https?:)?\/\//iu
  ];
  for (const file of files) {
    if (!file.path.toLowerCase().endsWith(".html")) continue;
    if (remoteResourcePatterns.some((pattern) => pattern.test(file.content))) {
      throw new HyperframesProjectValidationError(
        `HyperFrames 项目必须可离线渲染，但 ${file.path} 引用了远程网络资源。请移除 CDN、远程 script/import/stylesheet 和 fetch，并改用项目内联或本地资源。`
      );
    }
  }
}

async function startHyperframesStudioPreview(
  cli: HyperframesCliCommand,
  projectDir: string,
  signal: AbortSignal | undefined,
  onProgress?: (progress: StoryboardVideoGenerationProgress) => void
): Promise<HyperframesStudioPreview> {
  const port = await findAvailablePort();
  throwIfAborted(signal);
  const studioBaseUrl = `http://127.0.0.1:${port}`;
  const args = [...cli.argsPrefix, "preview", "--port", String(port), "--no-open"];
  const command = `${cli.label} preview --port ${port} --no-open`;
  onProgress?.({
    stage: "studio",
    stageLabel: "正在打开 HyperFrames Studio",
    stageDetail: `preview server: localhost:${port}`,
    cliLog: `$ ${command}`
  });

  const child = spawn(cli.bin, args, {
    cwd: projectDir,
    env: cli.env,
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stopped = false;
  let processFailure: Error | null = null;
  let preview: HyperframesStudioPreview | null = null;
  let ttlTimer: NodeJS.Timeout;
  const cleanup = () => {
    if (preview) activeHyperframesStudioPreviews.delete(preview);
    signal?.removeEventListener("abort", stop);
    clearTimeout(ttlTimer);
  };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    terminateProcessTree(child);
    cleanup();
  };
  ttlTimer = setTimeout(stop, resolveHyperframesStudioTtlMs());
  ttlTimer.unref?.();
  preview = { process: child, projectDir, studioUrl: studioBaseUrl, isReady: false, stop };
  activeHyperframesStudioPreviews.add(preview);

  signal?.addEventListener("abort", stop, { once: true });
  child.stdout?.on("data", (chunk) => {
    const studioUrl = preview?.studioUrl ?? studioBaseUrl;
    onProgress?.({
      stage: "studio",
      stageLabel: "HyperFrames Studio 已启动",
      stageDetail: studioUrl,
      studioUrl,
      cliLog: normalizeCliOutputChunk(String(chunk))
    });
  });
  child.stderr?.on("data", (chunk) => {
    const studioUrl = preview?.studioUrl ?? studioBaseUrl;
    onProgress?.({
      stage: "studio",
      stageLabel: "HyperFrames Studio 输出",
      stageDetail: studioUrl,
      studioUrl,
      cliLog: normalizeCliOutputChunk(String(chunk))
    });
  });
  child.once("error", (error) => {
    processFailure = error;
    const studioUrl = preview?.studioUrl ?? studioBaseUrl;
    onProgress?.({
      stage: "studio",
      stageLabel: "HyperFrames Studio 启动失败",
      stageDetail: studioUrl,
      studioUrl,
      cliLog: error.message
    });
    cleanup();
  });
  child.once("exit", (code, signalName) => {
    const studioUrl = preview?.studioUrl ?? studioBaseUrl;
    if (!stopped) {
      processFailure = new Error(`HyperFrames Studio preview exited with code ${code ?? "unknown"}${signalName ? ` (${signalName})` : ""}.`);
    }
    if (!stopped && code !== 0 && code !== null) {
      onProgress?.({
        stage: "studio",
        stageLabel: "HyperFrames Studio 已退出",
        stageDetail: studioUrl,
        studioUrl,
        cliLog: `preview exited with code ${code}${signalName ? ` (${signalName})` : ""}`
      });
    }
    cleanup();
  });

  try {
    const studioUrl = await waitForHyperframesStudioProject(studioBaseUrl, projectDir, 60_000, signal, () => processFailure);
    if (stopped || child.exitCode !== null) {
      throw processFailure ?? new Error("HyperFrames Studio preview exited before it became ready.");
    }
    preview.studioUrl = studioUrl;
    preview.isReady = true;
    onProgress?.({
      stage: "studio",
      stageLabel: "HyperFrames Studio 已打开",
      stageDetail: studioUrl,
      studioUrl,
      autoOpenStudio: true,
      cliLog: `Studio URL: ${studioUrl}`
    });
  } catch (error) {
    stop();
    throw error;
  }

  return preview;
}

function resolveHyperframesWorkers(): string {
  const raw = process.env.HYPERFRAMES_WORKERS?.trim().toLowerCase();
  if (!raw) return "2";
  if (raw === "auto") return "auto";
  const value = Number(raw);
  if (!Number.isFinite(value)) return "2";
  return String(Math.max(1, Math.min(8, Math.round(value))));
}

function resolveHyperframesInspectTimeoutMs(): number {
  const raw = process.env.MKBOARD_HYPERFRAMES_INSPECT_TIMEOUT_MS?.trim();
  const value = raw ? Number(raw) : defaultHyperframesInspectTimeoutMs;
  if (!Number.isFinite(value)) return defaultHyperframesInspectTimeoutMs;
  return Math.max(60_000, Math.min(2 * 60 * 60_000, Math.round(value)));
}

function resolveHyperframesRenderTimeoutMs(): number {
  const raw = process.env.MKBOARD_HYPERFRAMES_RENDER_TIMEOUT_MS?.trim();
  const value = raw ? Number(raw) : defaultHyperframesRenderTimeoutMs;
  if (!Number.isFinite(value)) return defaultHyperframesRenderTimeoutMs;
  return Math.max(120_000, Math.min(2 * 60 * 60_000, Math.round(value)));
}

function resolveHyperframesRepairAttempts(): number {
  const raw = process.env.MKBOARD_HYPERFRAMES_REPAIR_ATTEMPTS?.trim();
  const value = raw ? Number(raw) : defaultHyperframesRepairAttempts;
  if (!Number.isFinite(value)) return defaultHyperframesRepairAttempts;
  return Math.max(0, Math.min(2, Math.round(value)));
}

function resolveHyperframesStudioTtlMs(): number {
  const raw = process.env.MKBOARD_HYPERFRAMES_STUDIO_TTL_MS?.trim();
  const value = raw ? Number(raw) : defaultHyperframesStudioTtlMs;
  if (!Number.isFinite(value)) return defaultHyperframesStudioTtlMs;
  return Math.max(60_000, Math.min(60 * 60_000, Math.round(value)));
}

function findAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => {
        if (error) reject(error);
        else resolve(port || 3002);
      });
    });
  });
}

async function waitForHyperframesStudioProject(
  studioBaseUrl: string,
  projectDir: string,
  timeoutMs: number,
  signal?: AbortSignal,
  getProcessFailure?: () => Error | null
): Promise<string> {
  const startedAt = Date.now();
  let lastError: Error | null = null;

  while (Date.now() - startedAt < timeoutMs) {
    throwIfAborted(signal);
    const processFailure = getProcessFailure?.();
    if (processFailure) throw processFailure;

    try {
      const projectsResponse = await requestLocalHttp(`${studioBaseUrl}/api/projects`);
      if (projectsResponse.statusCode < 200 || projectsResponse.statusCode >= 300) {
        throw new Error(`HyperFrames Studio project registry returned HTTP ${projectsResponse.statusCode}.`);
      }
      const projects = parseHyperframesStudioProjects(projectsResponse.body);
      const project = selectHyperframesStudioProject(projects, projectDir);
      if (!project) {
        throw new Error("HyperFrames Studio project registry does not contain the generated project yet.");
      }

      const projectApiUrl = `${studioBaseUrl}/api/projects/${encodeURIComponent(project.id)}`;
      const storyboardResponse = await requestLocalHttp(`${projectApiUrl}/storyboard`);
      if (storyboardResponse.statusCode < 200 || storyboardResponse.statusCode >= 300) {
        throw new Error(`HyperFrames Studio storyboard endpoint returned HTTP ${storyboardResponse.statusCode}.`);
      }
      return `${studioBaseUrl}/#project/${encodeURIComponent(project.id)}`;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }

    await waitForStudioRetry(signal);
  }

  throw new Error(`HyperFrames Studio project did not become ready within ${Math.round(timeoutMs / 1000)} seconds.${lastError ? ` ${lastError.message}` : ""}`);
}

function parseHyperframesStudioProjects(body: string): HyperframesStudioProject[] {
  const parsed = JSON.parse(body) as { projects?: unknown };
  if (!Array.isArray(parsed.projects)) return [];
  return parsed.projects.flatMap((project) => {
    if (!project || typeof project !== "object") return [];
    const id = "id" in project && typeof project.id === "string" ? project.id.trim() : "";
    const dir = "dir" in project && typeof project.dir === "string" ? project.dir.trim() : "";
    return id && dir ? [{ id, dir }] : [];
  });
}

function selectHyperframesStudioProject(projects: HyperframesStudioProject[], projectDir: string): HyperframesStudioProject | null {
  const expectedDir = normalizeStudioProjectDir(projectDir);
  const exactMatch = projects.find((project) => normalizeStudioProjectDir(project.dir) === expectedDir);
  if (exactMatch) return exactMatch;
  return projects.length === 1 ? projects[0] : null;
}

function normalizeStudioProjectDir(projectDir: string): string {
  const normalized = resolvePath(projectDir);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function requestLocalHttp(urlString: string): Promise<{ statusCode: number; body: string }> {
  const url = new URL(urlString);
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        timeout: 1_000
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += String(chunk);
          if (body.length > 1024 * 1024) req.destroy(new Error("HyperFrames Studio response exceeded 1 MB."));
        });
        res.once("end", () => resolve({ statusCode: res.statusCode ?? 0, body }));
        res.once("error", reject);
      }
    );
    req.once("timeout", () => req.destroy(new Error("Timed out waiting for HyperFrames Studio response.")));
    req.once("error", reject);
    req.end();
  });
}

function waitForStudioRetry(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(new Error("HyperFrames Studio preview aborted."));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, 500);
    timer.unref?.();
    signal?.addEventListener("abort", abort, { once: true });
  });
}

function execCli(bin: string, args: string[], timeoutMs: number, signalOrOptions?: AbortSignal | ExecCliOptions): Promise<ExecResult> {
  const options = normalizeExecCliOptions(signalOrOptions);
  const env = options.env ?? localCliSpawnEnv();
  if (!bin.trim()) {
    return Promise.resolve({
      code: 1,
      stdout: "",
      stderr: "MkBoard 内置 CLI 可执行文件路径为空，请重新安装完整安装包。",
      error: new Error("Local CLI executable is empty")
    });
  }
  return runManagedProcess(bin, args, {
    timeoutMs,
    maxBuffer: 10 * 1024 * 1024,
    signal: options.signal,
    cwd: options.cwd,
    env,
    onOutput: options.onOutput
  });
}

function normalizeCliOutputChunk(chunk: string): string {
  return chunk
    .replace(/\r/gu, "\n")
    .split(/\n/gu)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function summarizeCliSuccess(result: ExecResult): string {
  const output = [result.stderr, result.stdout]
    .map((value) => value.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
  if (!output) return "";
  return output.length > 260 ? `${output.slice(-260)}` : output;
}

function normalizeExecCliOptions(input?: AbortSignal | ExecCliOptions): ExecCliOptions {
  if (!input) return {};
  if (isAbortSignal(input)) return { signal: input };
  return input;
}

function isAbortSignal(input: AbortSignal | ExecCliOptions): input is AbortSignal {
  return "aborted" in input && typeof input.aborted === "boolean" && typeof input.addEventListener === "function";
}

function formatHyperframesFinalError(error: unknown, repairAttempts: number): string {
  const raw = error instanceof Error ? error.message : String(error || "HyperFrames 渲染失败。");
  const normalized = raw.replace(/\s+/gu, " ").trim();
  const stageMatch = normalized.match(/HyperFrames\s+(lint|validate|inspect|render)\s+失败/iu);
  if (stageMatch) {
    const stage = stageMatch[1]?.toLowerCase() ?? "render";
    const counts = extractHyperframesIssueCounts(normalized);
    const repairText = repairAttempts > 0 ? `自动修复 ${repairAttempts} 次后仍未通过` : "未通过";
    const countText = counts ? `${counts.errors} 个错误，${counts.warnings} 个警告` : "检查失败";
    if (stage === "inspect") {
      const issue = normalized.match(/(?:text_box_overflow|text_overflow|text_clipped|container_overflow|canvas_overflow|content_overlap)[^◇命令]{0,220}/iu)?.[0]?.trim();
      return `HyperFrames inspect ${repairText}：${countText}${issue ? `。${issue}` : ""}`;
    }
    if (stage === "lint" || stage === "validate") {
      const issues = extractHyperframesIssueSummaries(normalized);
      return `HyperFrames ${stage} ${repairText}：${countText}${issues.length > 0 ? `。${issues.join("；")}` : ""}`;
    }
  }
  return sanitizeVideoTaskError(raw);
}

function extractHyperframesIssueCounts(message: string): { errors: string; warnings: string } | null {
  const counts = message.match(/◇\s*(\d+)\s*error\(s\),\s*(\d+)\s*warning\(s\)/iu);
  return counts ? { errors: counts[1], warnings: counts[2] } : null;
}

function extractHyperframesIssueSummaries(message: string): string[] {
  const issues: string[] = [];
  for (const match of message.matchAll(/✗\s*([^✗⚠◇]+?)(?=\s+Fix:|\s+✗|\s+⚠|\s+◇|$)/giu)) {
    const issue = match[1]?.trim();
    if (!issue) continue;
    issues.push(issue.length > 180 ? `${issue.slice(0, 180)}...` : issue);
    if (issues.length >= 2) break;
  }
  return issues;
}

function sanitizeVideoTaskError(message: string): string {
  const normalized = message
    .replace(/^npm warn .*$/gimu, "")
    .replace(/\s+/gu, " ")
    .trim();
  if (!normalized) return "视频生成失败。";
  if (isCodexChatGptWebsocketForbiddenMessage(normalized)) {
    return "Codex CLI 已登录，但连接 ChatGPT 服务时被网络网关临时拒绝（HTTP 403）。请稍后重试；如果持续发生，请关闭或切换代理/VPN 节点，或更换网络后重试。";
  }
  if (isAgentNetworkFailureMessage(normalized)) {
    if (/Claude Code|ANTHROPIC|Claude/i.test(normalized)) {
      return "Claude Code 网络/API 网关连接失败。请检查网络、代理/VPN、ANTHROPIC_BASE_URL 或 API usage 配置后重试。";
    }
    return "本机 Agent 网络请求失败。请检查网络、代理/VPN 或模型服务连接后重试。";
  }
  if (/timed out|timeout|超时/iu.test(normalized)) {
    return "视频生成等待已达到 2 小时，已停止当前镜头。可在生成历史中点击重试重新生成。";
  }
  if (normalized.length <= maxVideoTaskErrorChars) return normalized;
  return `${normalized.slice(0, maxVideoTaskErrorChars)}...`;
}

function truncateProgressText(input: string, maxChars = 260): string | undefined {
  const normalized = input.replace(/\s+/gu, " ").trim();
  if (!normalized) return undefined;
  return normalized.length > maxChars ? `${normalized.slice(0, maxChars)}...` : normalized;
}

function normalizeAspectRatio(input?: string): string {
  if (input === "9:16" || input === "4:3" || input === "3:4") return input;
  return "16:9";
}

function normalizeDurationSec(input: unknown): number {
  const value = typeof input === "number" ? input : Number(input);
  if (!Number.isFinite(value)) return defaultVideoDurationSec;
  return Math.max(10, Math.min(20, Math.round(value)));
}

function formatCliFailure(prefix: string, result: ExecResult): string {
  const output = [result.stderr, result.stdout].map((value) => value.trim()).filter(Boolean).join("\n").trim();
  return output ? `${prefix}：${output.slice(-1200)}` : `${prefix}，退出码：${result.code ?? "unknown"}。`;
}

function safeSegment(input: string): string {
  return input.replace(/[^a-z0-9_-]/giu, "-").replace(/-+/gu, "-").slice(0, 48) || "video";
}

function cancelledVideoResult(target: StoryboardVideoGenerationTarget): GeneratedStoryboardVideo {
  return {
    rowId: target.rowId,
    method: target.method,
    outputPath: null,
    cancelled: true,
    errorMessage: "视频生成已中止。"
  };
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw createAbortError();
}

function createAbortError(): Error {
  const error = new Error("视频生成已中止。");
  error.name = "AbortError";
  return error;
}

function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === "AbortError" || /abort|cancel|中止|取消/iu.test(error.message);
}

export function suggestedVideoAssetName(rowId: string, method: StoryboardVideoGenerationMethod, sourcePath: string): string {
  const ext = extname(sourcePath) || ".mp4";
  const methodName = method === "Seedance 2.0" ? "seedance" : "hyperframes";
  return `${methodName}-${safeSegment(rowId)}${ext}`;
}
