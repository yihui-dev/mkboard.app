import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, type Dirent } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { defaultTasteId } from "./taste-catalog";
import { findInstalledSkillryPackPaths } from "./style-skill-hub";
import { join, relative } from "node:path";
import crossSpawn from "cross-spawn";
import { buildAgentOutputSchema } from "./agent-output-schema";
import { parseAgentResponse } from "./agent-response";
import { claudeCodeSpawnEnv, codexSpawnEnv, resolveAgentCliExecutable, type AgentCliExecutableProbe } from "./codex-auth";
import { findCliAgentDefinition } from "./agent-registry";
import { buildDreaminaAgentInstruction, type DreaminaAgentGenerationContext } from "./dreamina-agent";
import { registeredCodexMcpServerNames } from "./mcp/integration";
import {
  defaultAgentMessage,
  defaultAgentConversationTitle,
  hyperframesVideoDimensionsFromAspectRatio,
  isCodexChatGptWebsocketForbiddenMessage,
  legacyDefaultAgentConversationTitles,
  isStoryboardGenerationMethodColumn,
  isStoryboardImagePromptColumn,
  isStoryboardVideoPromptColumn,
  type AgentCliId,
  type AgentEffortLevel,
  type AgentEvent,
  type AgentMessage,
  type AgentResponse,
  type HyperframesVideoResolution,
  type InterfaceLanguage,
  type ProjectDetail,
  type StoryboardColumn,
  type StoryboardRow,
  type WorkspaceTab
} from "../shared";

type CodexRunInput = {
  project: ProjectDetail;
  tab: WorkspaceTab;
  message: string;
  userVisibleMessage?: string;
  agentCliId: AgentCliId;
  model?: string;
  effort?: AgentEffortLevel;
  interfaceLanguage?: InterfaceLanguage;
  clientRunId?: string;
  mode?: "chat" | "storyboard-generation";
  attachments?: ProjectDetail["assets"];
  conversationMessages?: AgentMessage[];
  dreaminaGeneration?: DreaminaAgentGenerationContext;
};

type AgentRunLog = (step: string, detail?: Record<string, unknown>) => void;

type CodexRunOptions = {
  signal?: AbortSignal;
  onEvent?: (event: AgentEvent) => void;
  timeoutMs?: number;
  log?: AgentRunLog;
};

export type HyperframesProjectFile = {
  path: string;
  content: string;
};

export type HyperframesReferenceAsset = {
  assetId: string;
  name: string;
  sourcePath: string;
  renderPath: string;
};

type ClaudeContentBlockState = {
  type?: unknown;
  name?: unknown;
  id?: unknown;
  input: string;
  inputValue?: unknown;
};

type StructuredReplyStreamState = {
  raw: string;
  emittedReply: string;
  structured: boolean;
  replyComplete: boolean;
};

const DEFAULT_AGENT_RUN_TIMEOUT_MS = 2 * 60 * 60_000;
const DEFAULT_CODEX_TIMEOUT_MS = DEFAULT_AGENT_RUN_TIMEOUT_MS;
const DEFAULT_CLAUDE_CODE_TIMEOUT_MS = DEFAULT_AGENT_RUN_TIMEOUT_MS;
const STORYBOARD_GENERATION_TIMEOUT_MS = DEFAULT_AGENT_RUN_TIMEOUT_MS;
const DEFAULT_HYPERFRAMES_AGENT_TIMEOUT_MS = DEFAULT_AGENT_RUN_TIMEOUT_MS;
const CONVERSATION_CONTEXT_MAX_CHARS = 12_000;
const CONVERSATION_CONTEXT_MESSAGE_MAX_CHARS = 2_000;
const CONVERSATION_CONTEXT_OMITTED_NOTICE = "更早的对话上下文已因长度限制被省略。";
const HYPERFRAMES_RECOVERED_PROJECT_MAX_DEPTH = 6;
const HYPERFRAMES_RECOVERED_PROJECT_MAX_FILES = 80;
const HYPERFRAMES_RECOVERED_PROJECT_MAX_FILE_BYTES = 2_000_000;
const hyperframesTasteSkillName = "mkboard-hyperframes-taste";
const hyperframesTasteSkillDescription = "Translate the current project Taste into HTML/MG animation visual rules renderable by the official HyperFrames CLI.";
const hyperframesTasteSkill = `---
name: ${hyperframesTasteSkillName}
description: ${hyperframesTasteSkillDescription}
---

# MkBoard HyperFrames Taste Skill

This Skill is only used for MkBoard storyboard video generation. It translates the Taste bound to the current project into the visual contract for a single HyperFrames shot.

## Processing Order

1. First read "Current Project Taste" and extract the visual language, composition tendencies, type hierarchy, color, motion density, and anti-patterns suitable for short-form animation.
2. Then read the storyboard row and video prompt to determine the shot's intended message, rhythm, and duration.
3. Append the Taste as the main design direction for this shot. If the video prompt conflicts with the Taste, follow the Taste's visual language, composition rules, typography and color preferences, and anti-pattern constraints.
4. When outputting the project, record the applied Taste in DESIGN.md or visual-style.md, including the colors, typography, composition, and motion rules actually used.

## HyperFrames Translation Rules

- A Taste is not a website template. Do not copy landing-page structures directly; translate it into a visual language suitable for HTML, motion graphics, text, data, and UI-card animation.
- Use the Taste preview palette as the base CSS variables. If the Taste body gives more specific colors, follow the body.
- Fonts, font sizes, hierarchy, spacing, radii, shadows, and decorative elements should clearly reflect the Taste. Do not fall back to generic black-and-white cards or default AI purple-blue gradients.
- Font names are style references only. Do not copy literal font names from the Taste, such as Inter, Noto Sans SC, Noto Serif SC, PingFang SC, Microsoft YaHei, Helvetica Neue, or Playfair Display, directly into CSS.
- If the project does not provide usable local font files and @font-face declarations, CSS may only use generic local font families: use system-ui, sans-serif for sans; ui-serif, serif for serif; and ui-monospace, monospace for monospace.
- Do not use remote fonts. Do not use undeclared named fonts such as -apple-system, BlinkMacSystemFont, PingFang SC, Microsoft YaHei, or Noto Sans SC to simulate "local fonts".
- Animation should use transform and opacity through a deterministic inline timeline compatible with window.__timelines["main"]. Do not rely on remote GSAP; avoid Math.random(), Date.now(), or asynchronous timelines.
- Text must be short, clear, and readable. Do not spread long prompts directly across the frame.
- All primary content must fit fully inside the canvas. Only explicitly decorative elements may overflow, and they must use data-layout-allow-overflow or data-layout-ignore.
- Do not reference remote images, remote fonts, APIs, fetch, object storage, or empty resource paths.

## Fix Rules

- When fixing lint, validate, inspect, or render issues, preserve the Taste's visual direction.
- Prefer solving overflow by reducing text, adjusting hierarchy, tightening movement, re-layouting, or scaling elements. Do not replace the frame with a generic safe template.
- After fixing, still keep the Taste application note in DESIGN.md or visual-style.md.`;

export async function runStoryboardAgent(input: CodexRunInput, options: CodexRunOptions = {}): Promise<AgentResponse> {
  const tempDir = mkdtempSync(join(tmpdir(), "mkboard-codex-"));
  const outputPath = join(tempDir, "last-message.json");
  const schemaPath = join(tempDir, "mkboard-agent.schema.json");
  writeFileSync(schemaPath, JSON.stringify(buildAgentOutputSchema(input.project.columns, { requireRows: input.mode === "storyboard-generation" }), null, 2));
  options.log?.("temp_dir_created", { tempDir, outputPath, schemaPath });

  try {
    options.log?.("resolve_cli_start", { agentCliId: input.agentCliId });
    const executable = await resolveAgentCliExecutable(input.agentCliId);
    if (!executable) {
      options.log?.("resolve_cli_missing", { agentCliId: input.agentCliId });
      throw new Error(`未找到 ${agentCliDisplayName(input.agentCliId)}。请先安装对应 CLI，或在环境变量中指定可执行文件路径。`);
    }
    options.log?.("resolve_cli_complete", {
      agentCliId: input.agentCliId,
      executableId: executable.id,
      executableName: executable.name,
      launchBin: executable.launchBin
    });
    const projectCwd = ensureAgentWorkingDirectory(input.project);
    const prompt = buildPrompt(input, executable.name);
    const timeoutMs = options.timeoutMs ?? (input.mode === "storyboard-generation" ? STORYBOARD_GENERATION_TIMEOUT_MS : undefined);
    options.log?.("prompt_built", {
      mode: input.mode ?? "chat",
      promptChars: prompt.length,
      cwd: projectCwd,
      timeoutMs: timeoutMs ?? (executable.protocol === "codex-exec" ? DEFAULT_CODEX_TIMEOUT_MS : DEFAULT_CLAUDE_CODE_TIMEOUT_MS)
    });
    const result =
      executable.protocol === "codex-exec"
        ? await runCodex(executable.launchBin, prompt, projectCwd, outputPath, schemaPath, {
            signal: options.signal,
            env: codexSpawnEnv(executable.launchPathPrepend),
            onEvent: options.onEvent,
            reasoningSummaries: input.mode === "storyboard-generation",
            sandboxMode: codexSandboxModeForAgentRun(input.dreaminaGeneration),
            model: input.model,
            effort: input.effort,
            timeoutMs,
            log: options.log
          })
        : executable.protocol === "claude-stream-json"
          ? await runClaudeCode(executable.launchBin, prompt, projectCwd, schemaPath, {
              signal: options.signal,
              env: claudeCodeSpawnEnv(executable.launchPathPrepend),
              onEvent: options.onEvent,
              model: input.model,
              effort: input.effort,
              timeoutMs,
              log: options.log,
              useJsonSchema: input.mode === "storyboard-generation"
            })
          : await runGenericCliAgent(executable, prompt, projectCwd, schemaPath, {
              signal: options.signal,
              env: claudeCodeSpawnEnv(executable.launchPathPrepend),
              onEvent: options.onEvent,
              model: input.model,
              timeoutMs,
              log: options.log
            });
    const rawOutput = result.lastMessage || result.assistantText;
    options.log?.("cli_run_complete", {
      assistantTextChars: result.assistantText.length,
      lastMessageChars: result.lastMessage.length,
      stderrChars: result.stderr.length,
      rawOutputPreview: truncateText(rawOutput, 4000),
      stderrPreview: truncateText(result.stderr, 1200)
    });
    options.log?.("parse_response_start", {
      rawOutputChars: rawOutput.length
    });
    const parsed = parseAgentResponse(result.lastMessage || result.assistantText, executable.name, input.project.columns);
    if (!parsed.reply) {
      parsed.reply = `${executable.name} 已返回结果，但没有提供说明。`;
    }
    options.log?.("parse_response_complete", {
      replyPreview: truncateText(parsed.reply, 1200),
      rowCount: parsed.rows?.length ?? 0,
      operationCount: parsed.operations?.length ?? 0,
      hasScriptHtml: Boolean(parsed.scriptHtml),
      firstRowsPreview: summarizeRowsForAgentLog(parsed.rows)
    });
    return parsed;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
    options.log?.("temp_dir_removed", { tempDir });
  }
}

export function codexSandboxModeForAgentRun(
  dreaminaGeneration?: DreaminaAgentGenerationContext
): "workspace-write" | "danger-full-access" {
  // macOS Seatbelt blocks Dreamina's SecurityServer lookup even when the login
  // Keychain directory is readable. This context exists only after MkBoard's
  // backend membership authorization succeeds for an explicit Dreamina request.
  return dreaminaGeneration ? "danger-full-access" : "workspace-write";
}

export async function runConversationTitleAgent(input: { project: ProjectDetail; messages: AgentMessage[]; agentCliId: AgentCliId; interfaceLanguage?: InterfaceLanguage }): Promise<string> {
  const tempDir = mkdtempSync(join(tmpdir(), "mkboard-title-"));
  const outputPath = join(tempDir, "conversation-title.json");
  const schemaPath = join(tempDir, "mkboard-title.schema.json");
  writeFileSync(schemaPath, JSON.stringify(conversationTitleSchema, null, 2));

  try {
    const executable = await resolveAgentCliExecutable(input.agentCliId);
    if (!executable) {
      throw new Error(`未找到 ${agentCliDisplayName(input.agentCliId)}。`);
    }
    const projectCwd = ensureAgentWorkingDirectory(input.project);
    const prompt = buildConversationTitlePrompt(input.messages, input.interfaceLanguage);
    const result =
      executable.protocol === "codex-exec"
        ? await runCodex(executable.launchBin, prompt, projectCwd, outputPath, schemaPath, {
            env: codexSpawnEnv(executable.launchPathPrepend),
            timeoutMs: 30_000
          })
        : executable.protocol === "claude-stream-json"
          ? await runClaudeCode(executable.launchBin, prompt, projectCwd, schemaPath, {
              env: claudeCodeSpawnEnv(executable.launchPathPrepend),
              timeoutMs: 30_000,
              useJsonSchema: true
            })
          : await runGenericCliAgent(executable, prompt, projectCwd, schemaPath, {
              env: claudeCodeSpawnEnv(executable.launchPathPrepend),
              timeoutMs: 30_000
            });
    return parseConversationTitle(result.lastMessage || result.assistantText, input.interfaceLanguage);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

export async function runHyperframesProjectAgent(input: {
  project: ProjectDetail;
  row: StoryboardRow;
  prompt: string;
  imageRatio: string;
  hyperframesResolution?: HyperframesVideoResolution;
  durationSec: number;
  referenceAssets?: HyperframesReferenceAsset[];
  agentCliId: AgentCliId;
  agentProjectDir?: string;
  signal?: AbortSignal;
  onEvent?: (event: AgentEvent) => void;
}): Promise<HyperframesProjectFile[]> {
  const tempDir = mkdtempSync(join(tmpdir(), "mkboard-hyperframes-"));
  const outputPath = join(tempDir, "hyperframes-project.json");
  const schemaPath = join(tempDir, "mkboard-hyperframes.schema.json");
  writeFileSync(schemaPath, JSON.stringify(hyperframesProjectSchema, null, 2));

  try {
    const executable = await resolveAgentCliExecutable(input.agentCliId);
    if (!executable) {
      throw new Error(`未找到 ${agentCliDisplayName(input.agentCliId)}。请先安装对应 CLI，或在环境变量中指定可执行文件路径。`);
    }
    const projectCwd = ensureAgentWorkingDirectory(input.project);
    if (input.agentProjectDir) mkdirSync(input.agentProjectDir, { recursive: true });
    const prompt = buildHyperframesProjectPrompt(input, executable.name, input.agentProjectDir);
    const timeoutMs = resolveHyperframesAgentTimeoutMs();
    const result =
      executable.protocol === "codex-exec"
        ? await runCodex(executable.launchBin, prompt, projectCwd, outputPath, schemaPath, {
            env: codexSpawnEnv(executable.launchPathPrepend),
            signal: input.signal,
            timeoutMs,
            onEvent: input.onEvent,
            isRecoverableResult: isRecoverableHyperframesProjectResult
          })
        : executable.protocol === "claude-stream-json"
          ? await runClaudeCode(executable.launchBin, prompt, projectCwd, schemaPath, {
              env: claudeCodeSpawnEnv(executable.launchPathPrepend),
              signal: input.signal,
              onEvent: input.onEvent,
              timeoutMs,
              useJsonSchema: true,
              isRecoverableResult: isRecoverableHyperframesProjectResult
            })
          : await runGenericCliAgent(executable, prompt, projectCwd, schemaPath, {
              env: claudeCodeSpawnEnv(executable.launchPathPrepend),
              signal: input.signal,
              onEvent: input.onEvent,
              timeoutMs
            });
    return parseOrRecoverHyperframesProjectFiles(result.lastMessage || result.assistantText, executable.name, input.project, input.agentProjectDir);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

export async function runHyperframesProjectRepairAgent(input: {
  project: ProjectDetail;
  row: StoryboardRow;
  prompt: string;
  imageRatio: string;
  hyperframesResolution?: HyperframesVideoResolution;
  durationSec: number;
  referenceAssets?: HyperframesReferenceAsset[];
  agentCliId: AgentCliId;
  files: HyperframesProjectFile[];
  errorMessage: string;
  agentProjectDir?: string;
  signal?: AbortSignal;
  onEvent?: (event: AgentEvent) => void;
}): Promise<HyperframesProjectFile[]> {
  const tempDir = mkdtempSync(join(tmpdir(), "mkboard-hyperframes-repair-"));
  const outputPath = join(tempDir, "hyperframes-project-repair.json");
  const schemaPath = join(tempDir, "mkboard-hyperframes.schema.json");
  writeFileSync(schemaPath, JSON.stringify(hyperframesProjectSchema, null, 2));

  try {
    const executable = await resolveAgentCliExecutable(input.agentCliId);
    if (!executable) {
      throw new Error(`未找到 ${agentCliDisplayName(input.agentCliId)}。请先安装对应 CLI，或在环境变量中指定可执行文件路径。`);
    }
    const projectCwd = ensureAgentWorkingDirectory(input.project);
    if (input.agentProjectDir) mkdirSync(input.agentProjectDir, { recursive: true });
    const prompt = buildHyperframesProjectRepairPrompt(input, executable.name, input.agentProjectDir);
    const timeoutMs = resolveHyperframesAgentTimeoutMs();
    const result =
      executable.protocol === "codex-exec"
        ? await runCodex(executable.launchBin, prompt, projectCwd, outputPath, schemaPath, {
            env: codexSpawnEnv(executable.launchPathPrepend),
            signal: input.signal,
            timeoutMs,
            onEvent: input.onEvent,
            isRecoverableResult: isRecoverableHyperframesProjectResult
          })
        : executable.protocol === "claude-stream-json"
          ? await runClaudeCode(executable.launchBin, prompt, projectCwd, schemaPath, {
              env: claudeCodeSpawnEnv(executable.launchPathPrepend),
              signal: input.signal,
              onEvent: input.onEvent,
              timeoutMs,
              useJsonSchema: true,
              isRecoverableResult: isRecoverableHyperframesProjectResult
            })
          : await runGenericCliAgent(executable, prompt, projectCwd, schemaPath, {
              env: claudeCodeSpawnEnv(executable.launchPathPrepend),
              signal: input.signal,
              onEvent: input.onEvent,
              timeoutMs
            });
    return parseOrRecoverHyperframesProjectFiles(result.lastMessage || result.assistantText, executable.name, input.project, input.agentProjectDir, input.files);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function agentCliDisplayName(agentCliId: AgentCliId): string {
  const def = findCliAgentDefinition(agentCliId);
  if (def) return def.name;
  if (agentCliId === "claude-code") return "Claude Code";
  return "Codex CLI";
}

function ensureAgentWorkingDirectory(project: ProjectDetail): string {
  const cwd = project.project.localPath.trim();
  if (!cwd) {
    throw new Error("项目本地目录不可用：项目路径为空。请重新创建项目或恢复项目本地文件夹后再试。");
  }

  try {
    if (existsSync(cwd)) {
      const stats = statSync(cwd);
      if (!stats.isDirectory()) {
        throw new Error("当前路径不是文件夹。");
      }
      return cwd;
    }

    mkdirSync(cwd, { recursive: true });
    return cwd;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`项目本地目录不可用：${cwd}。MkBoard 无法创建或访问这个文件夹，请检查它是否被移动、删除或没有权限。${detail}`);
  }
}

function summarizeRowsForAgentLog(rows: StoryboardRow[] | undefined): Array<Record<string, unknown>> {
  return (rows ?? []).slice(0, 3).map((row) => ({
    scene: row.scene,
    duration: row.duration,
    contentPreview: truncateText(row.content, 200),
    notePreview: truncateText(row.note, 200),
    customValueKeys: Object.keys(row.customValues ?? {})
  }));
}

function sanitizeAgentSpawnArgs(args: string[]): string[] {
  return args.map((arg, index) => (args[index - 1] === "--json-schema" ? `[schema omitted ${arg.length} chars]` : arg));
}

function runCodex(
  codexBin: string,
  prompt: string,
  cwd: string,
  outputPath: string,
  schemaPath: string,
  options: {
    signal?: AbortSignal;
    env: NodeJS.ProcessEnv;
    onEvent?: (event: AgentEvent) => void;
    timeoutMs?: number;
    sandboxMode?: "workspace-write" | "danger-full-access";
    reasoningSummaries?: boolean;
    model?: string;
    effort?: AgentEffortLevel;
    log?: AgentRunLog;
    isRecoverableResult?: (input: string) => boolean;
  }
): Promise<{ assistantText: string; lastMessage: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const args = buildCodexExecArgs(cwd, outputPath, schemaPath, {
      reasoningSummaries: options.reasoningSummaries,
      sandboxMode: options.sandboxMode,
      model: options.model,
      effort: options.effort
    });
    options.log?.("codex.spawn_start", {
      codexBin,
      cwd,
      args: sanitizeAgentSpawnArgs(args),
      timeoutMs: options.timeoutMs ?? DEFAULT_CODEX_TIMEOUT_MS
    });
    const child = crossSpawn(codexBin, args, {
      cwd,
      env: options.env,
      stdio: ["pipe", "pipe", "pipe"]
    }) as ChildProcessWithoutNullStreams;
    options.log?.("codex.spawned", { pid: child.pid ?? null });

    let stdout = "";
    let stderr = "";
    let assistantText = "";
    let streamError: string | null = null;
    let settled = false;
    const startedAt = Date.now();
    const stream = createCodexEventHandler((event) => {
      options.onEvent?.(event);
      if (event.kind === "text") assistantText += event.text;
      if (event.kind === "error" && !streamError) streamError = event.message;
    });
    const settleReject = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abortRun);
      reject(error);
    };
    const settleResolve = (value: { assistantText: string; lastMessage: string; stderr: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abortRun);
      resolve(value);
    };
    const abortRun = () => {
      options.log?.("codex.abort_requested");
      options.onEvent?.({ kind: "status", label: "canceled", detail: "用户停止了当前 Codex CLI 任务。" });
      child.kill("SIGTERM");
      settleReject(new Error("Codex CLI run canceled"));
    };
    const settleRecoveredResult = () => {
      if (settled || streamError) return false;
      const recovered = readRecoverableCodexResult(outputPath, assistantText, stderr, options.isRecoverableResult);
      if (!recovered) return false;
      options.log?.("codex.recovered_structured_result", {
        assistantTextChars: recovered.assistantText.length,
        lastMessageChars: recovered.lastMessage.length,
        rawOutputPreview: truncateText(recovered.lastMessage || recovered.assistantText, 3000)
      });
      options.onEvent?.({ kind: "status", label: "writing", detail: "已收到结构化结果，正在写入项目。" });
      options.onEvent?.({ kind: "usage", durationMs: Date.now() - startedAt });
      child.kill("SIGTERM");
      settleResolve(recovered);
      return true;
    };
    const timer = setTimeout(() => {
      const recovered = settleRecoveredResult();
      if (recovered) {
        return;
      }
      child.kill("SIGTERM");
      options.log?.("codex.timeout", { timeoutMs: options.timeoutMs ?? DEFAULT_CODEX_TIMEOUT_MS });
      settleReject(new Error(`Codex CLI timed out after ${Math.round((options.timeoutMs ?? DEFAULT_CODEX_TIMEOUT_MS) / 1000)}s`));
    }, options.timeoutMs ?? DEFAULT_CODEX_TIMEOUT_MS);

    if (options.signal?.aborted) {
      abortRun();
      return;
    }
    options.signal?.addEventListener("abort", abortRun, { once: true });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      stream.feed(chunk);
      settleRecoveredResult();
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      options.log?.("codex.spawn_error", { message: error.message });
      settleReject(error);
    });
    child.on("close", (code) => {
      if (settled) {
        options.log?.("codex.close_after_settled", { code });
        return;
      }
      stream.flush();
      let lastMessage = "";
      try {
        lastMessage = readFileSync(outputPath, "utf8");
      } catch {
        // Codex can fail before writing the file; the stderr/stdout below is more useful.
      }
      if (streamError) {
        options.log?.("codex.stream_error", { message: streamError });
        settleReject(new Error(streamError));
        return;
      }
      if (code !== 0) {
        options.log?.("codex.close_failed", {
          code,
          stdoutChars: stdout.length,
          stderrChars: stderr.length,
          stderrPreview: truncateText(stderr, 1200)
        });
        settleReject(new Error(formatCodexCliError(code, stdout, stderr)));
        return;
      }
      options.log?.("codex.close_succeeded", {
        code,
        stdoutChars: stdout.length,
        stderrChars: stderr.length,
        lastMessageChars: lastMessage.length,
        durationMs: Date.now() - startedAt
      });
      options.onEvent?.({ kind: "usage", durationMs: Date.now() - startedAt });
      settleResolve({ assistantText, lastMessage, stderr });
    });
    child.stdin.end(prompt);
  });
}

function runClaudeCode(
  claudeBin: string,
  prompt: string,
  cwd: string,
  schemaPath: string,
  options: {
    signal?: AbortSignal;
    env: NodeJS.ProcessEnv;
    onEvent?: (event: AgentEvent) => void;
    model?: string;
    effort?: AgentEffortLevel;
    timeoutMs?: number;
    log?: AgentRunLog;
    useJsonSchema?: boolean;
    isRecoverableResult?: (input: string) => boolean;
  }
): Promise<{ assistantText: string; lastMessage: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const args = buildClaudeCodeArgs(schemaPath, {
      useJsonSchema: options.useJsonSchema === true,
      model: options.model,
      effort: options.effort
    });
    options.log?.("claude.spawn_start", {
      claudeBin,
      cwd,
      args: sanitizeAgentSpawnArgs(args),
      timeoutMs: options.timeoutMs ?? DEFAULT_CLAUDE_CODE_TIMEOUT_MS
    });
    const child = crossSpawn(claudeBin, args, {
      cwd,
      env: options.env,
      stdio: ["pipe", "pipe", "pipe"]
    }) as ChildProcessWithoutNullStreams;
    options.log?.("claude.spawned", { pid: child.pid ?? null });

    let stdout = "";
    let stderr = "";
    let assistantText = "";
    let structuredToolOutput = "";
    let streamError: string | null = null;
    let settled = false;
    let stdinClosed = false;
    const startedAt = Date.now();
    const stream = createClaudeCodeEventHandler((event) => {
      if (event.kind === "error" && isClaudeStructuredOutputSchemaError(event.message)) {
        if (!streamError) streamError = event.message;
        options.onEvent?.({ kind: "status", label: "warning", detail: "Claude Code 结构化输出通道异常，正在尝试恢复原始结果。" });
        return;
      }
      options.onEvent?.(event);
      if (event.kind === "text") assistantText += event.text;
      if (event.kind === "tool_use") {
        const toolOutput = stringifyClaudeStructuredOutputToolInput(event);
        if (toolOutput) structuredToolOutput = toolOutput;
      }
      if (event.kind === "error" && !streamError) streamError = event.message;
    }, {
      onTurnEnd: (stopReason) => {
        options.log?.("claude.turn_end", { stopReason });
        if (stopReason === "tool_use") return;
        closeClaudeStdin(`turn_end:${stopReason}`);
      }
    });
    const settleReject = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abortRun);
      reject(error);
    };
    const settleResolve = (value: { assistantText: string; lastMessage: string; stderr: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abortRun);
      resolve(value);
    };
    const abortRun = () => {
      options.log?.("claude.abort_requested");
      options.onEvent?.({ kind: "status", label: "canceled", detail: "用户停止了当前 Claude Code 任务。" });
      closeClaudeStdin("abort");
      child.kill("SIGTERM");
      settleReject(new Error("Claude Code run canceled"));
    };
    const settleRecoveredClaudeResult = (reason: "stream_error" | "close_failed", streamErrorMessage?: string) => {
      if (settled) return false;
      const currentLastMessage = extractClaudeCodeResult(stdout);
      const recovered = readRecoverableClaudeResult(currentLastMessage, assistantText, stdout, stderr, structuredToolOutput, options.isRecoverableResult);
      if (!recovered) return false;
      options.log?.(
        reason === "stream_error" ? "claude.recovered_after_stream_error" : "claude.recovered_structured_result_after_close_failed",
        {
          message: streamErrorMessage,
          assistantTextChars: recovered.assistantText.length,
          lastMessageChars: recovered.lastMessage.length,
          rawOutputPreview: truncateText(recovered.lastMessage || recovered.assistantText, 3000)
        }
      );
      const recoveredHasWrites = recoveredAgentResultHasWrites(recovered);
      options.onEvent?.({
        kind: "status",
        label: reason === "stream_error" ? "warning" : recoveredHasWrites ? "writing" : "running",
        detail:
          reason === "stream_error"
            ? "Claude Code 结构化输出通道异常，已从原始 JSON 恢复。"
            : recoveredHasWrites
              ? "已收到 Claude Code 结构化结果，正在写入项目。"
              : "已收到 Claude Code 回复，正在整理结果。"
      });
      options.onEvent?.({ kind: "usage", durationMs: Date.now() - startedAt });
      settleResolve(recovered);
      return true;
    };
    const closeClaudeStdin = (reason: string) => {
      if (stdinClosed) return;
      stdinClosed = true;
      options.log?.("claude.stdin_close", { reason });
      if (!child.stdin.destroyed) {
        try {
          child.stdin.end();
        } catch {
          // Fast-exiting Claude processes route the useful error through stderr/close.
        }
      }
    };
    const timer = setTimeout(() => {
      closeClaudeStdin("timeout");
      child.kill("SIGTERM");
      options.log?.("claude.timeout", { timeoutMs: options.timeoutMs ?? DEFAULT_CLAUDE_CODE_TIMEOUT_MS });
      settleReject(new Error(`Claude Code timed out after ${Math.round((options.timeoutMs ?? DEFAULT_CLAUDE_CODE_TIMEOUT_MS) / 1000)}s`));
    }, options.timeoutMs ?? DEFAULT_CLAUDE_CODE_TIMEOUT_MS);

    if (options.signal?.aborted) {
      abortRun();
      return;
    }
    options.signal?.addEventListener("abort", abortRun, { once: true });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      stream.feed(chunk);
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      options.log?.("claude.spawn_error", { message: error.message });
      settleReject(error);
    });
    child.on("close", (code) => {
      if (settled) {
        options.log?.("claude.close_after_settled", { code });
        return;
      }
      stream.flush();
      const lastMessage = extractClaudeCodeResult(stdout);
      if (streamError) {
        if (settleRecoveredClaudeResult("stream_error", streamError)) {
          return;
        }
        options.log?.("claude.stream_error", { message: streamError });
        settleReject(new Error(streamError));
        return;
      }
      if (code !== 0) {
        if (settleRecoveredClaudeResult("close_failed")) {
          return;
        }
        options.log?.("claude.close_failed", {
          code,
          stdoutChars: stdout.length,
          stderrChars: stderr.length,
          stderrPreview: truncateText(stderr, 1200)
        });
        settleReject(new Error(formatGenericCliError("Claude Code", code, stdout, stderr)));
        return;
      }
      options.log?.("claude.close_succeeded", {
        code,
        stdoutChars: stdout.length,
        stderrChars: stderr.length,
        structuredToolOutputChars: structuredToolOutput.length,
        lastMessageChars: lastMessage.length,
        durationMs: Date.now() - startedAt
      });
      const recovered = readRecoverableClaudeResult(lastMessage, assistantText, stdout, stderr, structuredToolOutput, options.isRecoverableResult);
      options.onEvent?.({ kind: "usage", durationMs: Date.now() - startedAt });
      settleResolve(recovered ?? { assistantText, lastMessage, stderr });
    });
    try {
      child.stdin.write(`${createClaudeStreamJsonUserMessage(prompt)}\n`, "utf8");
    } catch (error) {
      closeClaudeStdin("stdin_write_failed");
      settleReject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

function readRecoverableCodexResult(
  outputPath: string,
  assistantText: string,
  stderr: string,
  isRecoverableResult: (input: string) => boolean = containsCompleteJsonObject
): { assistantText: string; lastMessage: string; stderr: string } | null {
  const lastMessage = readOptionalTextFile(outputPath);
  if (isRecoverableResult(lastMessage)) return { assistantText, lastMessage, stderr };
  if (isRecoverableResult(assistantText)) return { assistantText, lastMessage: "", stderr };
  return null;
}

function readRecoverableClaudeResult(
  lastMessage: string,
  assistantText: string,
  stdout: string,
  stderr: string,
  structuredToolOutput = "",
  isRecoverableResult: (input: string) => boolean = containsCompleteJsonObject
): { assistantText: string; lastMessage: string; stderr: string } | null {
  if (isRecoverableResult(structuredToolOutput)) return { assistantText, lastMessage: structuredToolOutput, stderr };
  if (isRecoverableResult(lastMessage)) return { assistantText, lastMessage, stderr };
  const stdoutResult = extractClaudeCodeResult(stdout);
  if (isRecoverableResult(stdoutResult)) return { assistantText, lastMessage: stdoutResult, stderr };
  if (isRecoverableResult(assistantText)) return { assistantText, lastMessage: "", stderr };
  return null;
}

function recoveredAgentResultHasWrites(result: { assistantText: string; lastMessage: string }): boolean {
  const raw = result.lastMessage || result.assistantText;
  const parsed = safeParseJson(raw);
  const output = isRecord(parsed) && isRecord(parsed.structured_output) ? parsed.structured_output : parsed;
  if (!isRecord(output)) return false;
  if (Array.isArray(output.operations) && output.operations.length > 0) return true;
  if (Array.isArray(output.rows) && output.rows.length > 0) return true;
  return typeof output.scriptHtml === "string" && output.scriptHtml.trim().length > 0;
}

function stringifyClaudeStructuredOutputToolInput(event: Extract<AgentEvent, { kind: "tool_use" }>): string {
  if (event.name !== "StructuredOutput") return "";
  if (!isRecord(event.input)) return "";
  const output = JSON.stringify(event.input);
  return containsCompleteJsonObject(output) ? output : "";
}

function isClaudeStructuredOutputSchemaError(message: string): boolean {
  return /StructuredOutput|Output does not match required schema|required property/i.test(message);
}

function readOptionalTextFile(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

export function buildCodexExecArgs(
  cwd: string,
  outputPath: string,
  schemaPath: string,
  options: {
    sandboxMode?: "workspace-write" | "danger-full-access";
    reasoningSummaries?: boolean;
    model?: string;
    effort?: AgentEffortLevel;
  } = {}
): string[] {
  const useDangerFullAccess = options.sandboxMode === "danger-full-access" || codexNeedsDangerFullAccessSandbox();
  const args = useDangerFullAccess
    ? ["exec", "--json", "--skip-git-repo-check", "--sandbox", "danger-full-access"]
    : [
        "exec",
        "--json",
        "--skip-git-repo-check",
        "--sandbox",
        "workspace-write",
        "-c",
        "sandbox_workspace_write.network_access=true"
      ];
  if (process.env.MKBOARD_CODEX_DISABLE_PLUGINS?.trim() === "1") {
    args.push("--disable", "plugins");
  }
  // The sidebar Agent writes through its JSON operations protocol; keep MkBoard's own MCP server
  // (registered for external Codex sessions) out of these runs, matching --strict-mcp-config for Claude.
  for (const serverName of registeredCodexMcpServerNames(homedir(), process.env.CODEX_HOME?.trim() || undefined)) {
    args.push("-c", `mcp_servers.${serverName}.enabled=false`);
  }
  if (options.model && options.model !== "default") {
    args.push("-m", options.model);
  }
  if (options.effort) {
    args.push("-c", `model_reasoning_effort="${options.effort}"`);
  }
  if (options.reasoningSummaries) {
    args.push(
      "-c",
      'model_reasoning_summary="detailed"',
      "-c",
      "model_supports_reasoning_summaries=true"
    );
  }
  args.push(
    "--ephemeral",
    "-C",
    cwd,
    "--output-schema",
    schemaPath,
    "--output-last-message",
    outputPath
  );
  return args;
}

function buildClaudeCodeArgs(
  schemaPath: string,
  options: { useJsonSchema?: boolean; model?: string; effort?: AgentEffortLevel } = {}
): string[] {
  const includePartialMessages = process.env.MKBOARD_CLAUDE_DISABLE_PARTIAL_MESSAGES?.trim() !== "1";
  const tools = process.env.MKBOARD_CLAUDE_TOOLS ?? "";
  const useJsonSchema = options.useJsonSchema === true && process.env.MKBOARD_CLAUDE_USE_JSON_SCHEMA?.trim() !== "0";
  return [
    "-p",
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--verbose",
    ...(options.model && options.model !== "default" ? ["--model", options.model] : []),
    ...(options.effort ? ["--effort", options.effort] : []),
    ...(includePartialMessages ? ["--include-partial-messages"] : []),
    ...(useJsonSchema ? ["--json-schema", readFileSync(schemaPath, "utf8")] : []),
    "--permission-mode",
    "bypassPermissions",
    "--tools",
    tools,
    "--strict-mcp-config",
    "--no-session-persistence"
  ];
}

function runGenericCliAgent(
  executable: AgentCliExecutableProbe,
  prompt: string,
  cwd: string,
  schemaPath: string,
  options: {
    signal?: AbortSignal;
    env: NodeJS.ProcessEnv;
    onEvent?: (event: AgentEvent) => void;
    model?: string;
    timeoutMs?: number;
    log?: AgentRunLog;
  }
): Promise<{ assistantText: string; lastMessage: string; stderr: string }> {
  return new Promise((resolveRun, rejectRun) => {
    const schemaInstruction = `\n\n[Structured Output Requirement]\nReturn ONLY a single valid JSON object matching this JSON Schema (no markdown fences):\n${readFileSync(schemaPath, "utf8")}`;
    const fullPrompt = `${prompt}${schemaInstruction}`;

    let args: string[] = [];
    let sendViaStdin = false;

    if (executable.protocol === "antigravity-json") {
      args = ["-p", fullPrompt, "--mode", "auto", "--output-format", "json"];
      if (options.model && options.model !== "default") {
        args.push("--model", options.model);
      }
    } else if (executable.protocol === "gemini-json") {
      args = ["-p", fullPrompt, "-o", "json"];
      if (options.model && options.model !== "default") {
        args.push("-m", options.model);
      }
    } else if (executable.customArgs && executable.customArgs.length > 0) {
      let replacedPrompt = false;
      args = executable.customArgs.map((item) => {
        if (item.includes("{{prompt}}")) {
          replacedPrompt = true;
          return item.replaceAll("{{prompt}}", fullPrompt);
        }
        return item;
      });
      if (options.model && options.model !== "default") {
        args.push("--model", options.model);
      }
      if (!replacedPrompt) {
        sendViaStdin = true;
      }
    } else {
      args = ["-p", fullPrompt];
    }

    options.onEvent?.({
      kind: "status",
      label: "running",
      detail: `Running ${executable.name}${options.model && options.model !== "default" ? ` (${options.model})` : ""}...`
    });

    const startedAt = Date.now();
    const child = crossSpawn(executable.launchBin, args, {
      cwd,
      env: options.env,
      stdio: ["pipe", "pipe", "pipe"]
    }) as ChildProcessWithoutNullStreams;

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      rejectRun(new Error(`${executable.name} timed out`));
    }, options.timeoutMs ?? DEFAULT_AGENT_RUN_TIMEOUT_MS);

    const onAbort = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.onEvent?.({ kind: "status", label: "canceled", detail: `Canceled ${executable.name}` });
      child.kill("SIGTERM");
      rejectRun(new Error(`${executable.name} run canceled`));
    };
    if (options.signal?.aborted) {
      onAbort();
      return;
    }
    options.signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      rejectRun(err);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);

      if (code !== 0 && !stdout.trim()) {
        rejectRun(new Error(formatGenericCliError(executable.name, code, stdout, stderr)));
        return;
      }

      let extracted = stdout.trim();
      if (executable.protocol === "antigravity-json" || executable.protocol === "gemini-json") {
        const parsedJson = safeParseJson(extracted);
        if (isRecord(parsedJson)) {
          const candidate =
            typeof parsedJson.result === "string"
              ? parsedJson.result
              : typeof parsedJson.response === "string"
                ? parsedJson.response
                : typeof parsedJson.text === "string"
                  ? parsedJson.text
                  : typeof parsedJson.content === "string"
                    ? parsedJson.content
                    : null;
          if (candidate) {
            extracted = candidate.trim();
          }
        }
      }
      // Strip markdown code fence if CLI wrapped JSON
      const fenceMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(extracted);
      if (fenceMatch?.[1]) {
        extracted = fenceMatch[1].trim();
      }

      options.onEvent?.({ kind: "usage", durationMs: Date.now() - startedAt });
      resolveRun({ assistantText: extracted, lastMessage: extracted, stderr });
    });

    if (sendViaStdin) {
      child.stdin.end(fullPrompt);
    } else {
      child.stdin.end();
    }
  });
}

function createClaudeStreamJsonUserMessage(prompt: string): string {
  return JSON.stringify({
    type: "user",
    message: {
      role: "user",
      content: [{ type: "text", text: prompt }]
    }
  });
}

function codexNeedsDangerFullAccessSandbox(platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.MKBOARD_CODEX_SANDBOX?.trim() === "danger-full-access") return true;
  if (platform === "win32") return true;
  return Boolean(env.WSL_DISTRO_NAME?.trim());
}

function formatCodexCliError(code: number | null, stdout: string, stderr: string): string {
  const streamError = extractCodexStreamErrorMessage(stdout);
  if (streamError) return streamError;

  const combined = compactOutput(stdout, stderr);
  if (!combined) return `Codex CLI 退出失败，退出码：${code ?? "unknown"}。`;

  if (/not (authenticated|logged in)|unauthorized|authentication required|please (sign|log) in|login required|credentials? (missing|required)|401/i.test(combined)) {
    return "Codex CLI 当前未完成授权。请点击“连接 Codex CLI”重新登录，完成后刷新状态再发送。";
  }

  if (isCodexChatGptWebsocketForbiddenMessage(combined)) {
    return "Codex CLI 已登录，但连接 ChatGPT 服务时被网络网关临时拒绝（HTTP 403）。请稍后重试；如果持续发生，请关闭或切换代理/VPN 节点，或更换网络后重试。";
  }

  if (/TokenRefreshFailed|invalid_grant|OAuth token refresh|MCP startup failed|rmcp::transport::worker/i.test(combined)) {
    return [
      "Codex CLI 启动时有全局 MCP/插件授权失效。",
      "MkBoard 的 Agent 已改为隔离全局配置和插件运行；请重新启动应用后再试。",
      "如果仍出现这个错误，请在终端重新执行 `codex login --device-auth`，并检查已安装 MCP/插件的授权。"
    ].join("\n");
  }

  const lines = splitCodexLogLines(combined).filter((line) => line && !isIgnorableCodexLogLine(line));
  const useful = lines.length > 0 ? lines.slice(-8).join("\n") : combined;
  return truncateText(useful, 1200);
}

function formatGenericCliError(agentName: string, code: number | null, stdout: string, stderr: string): string {
  const combined = compactOutput(stdout, stderr);
  if (!combined) return `${agentName} 退出失败，退出码：${code ?? "unknown"}。`;
  if (/not (authenticated|logged in)|unauthorized|authentication required|please (sign|log) in|login required|credentials? (missing|required)|401/i.test(combined)) {
    return `${agentName} 当前未完成授权，请在账号面板重新连接后再试。`;
  }
  return truncateText(combined, 1200);
}

function compactOutput(stdout: string, stderr: string): string {
  return [stderr, stdout]
    .map((value) => value.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function splitCodexLogLines(input: string): string[] {
  return input
    .replace(/\s+(?=\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/gu, "\n")
    .split(/\r?\n/u)
    .map((line) => line.trim());
}

function isIgnorableCodexLogLine(line: string): boolean {
  return (
    line === "Reading prompt from stdin..." ||
    line === "Reading additional input from stdin..." ||
    / WARN .*codex_rollout::list:/i.test(line) ||
    / WARN .*codex_core_plugins::manifest:/i.test(line) ||
    / WARN .*codex_core_skills::loader:/i.test(line) ||
    / WARN .*codex_memories_write::/i.test(line) ||
    / WARN .*codex_file_watcher:/i.test(line) ||
    /ignoring interface\.(defaultPrompt|icon_small|icon_large)/i.test(line) ||
    /no such table: (stage1_outputs|jobs)/i.test(line)
  );
}

function extractCodexStreamErrorMessage(stdout: string): string | null {
  for (const line of stdout.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith("{")) continue;
    const parsed = safeParseJson(trimmed);
    if (!isRecord(parsed)) continue;
    if (parsed.type === "error") {
      const message = extractErrorMessage(parsed.message ?? parsed.error, "Codex error");
      if (isRecoverableCodexReconnect(message)) continue;
      return message;
    }
    if (parsed.type === "turn.failed") return extractErrorMessage(parsed.error ?? parsed.message, "Codex turn failed");
  }
  return null;
}

function truncateText(input: string, maxLength: number): string {
  if (input.length <= maxLength) return input;
  return `${input.slice(0, maxLength - 1)}…`;
}

export function createCodexEventHandler(onEvent: (event: AgentEvent) => void) {
  let buffer = "";
  const commandIds = new Set<string>();
  const agentMessageTextById = new Map<string, string>();
  const thinkingTextById = new Map<string, string>();
  let errorEmitted = false;
  let previousEventWasAgentMessage = false;
  let lastAgentMessageEndedWithNewline = false;
  let currentAgentMessageStreamKey: string | null = null;
  const structuredReplyStreams = new Map<string, StructuredReplyStreamState>();

  function resetAgentMessageBoundary() {
    previousEventWasAgentMessage = false;
    lastAgentMessageEndedWithNewline = false;
    currentAgentMessageStreamKey = null;
  }

  function emitAgentMessageText(text: string, streamKey = "default") {
    if (!text) return;
    const visibleText = visibleTextDeltaFromStructuredTransport(structuredReplyStreams, streamKey, text);
    if (!visibleText) return;
    const isContinuation = currentAgentMessageStreamKey === streamKey;
    const needsBoundary = !isContinuation && previousEventWasAgentMessage && !lastAgentMessageEndedWithNewline && !visibleText.startsWith("\n");
    onEvent({ kind: "text", text: needsBoundary ? `\n${visibleText}` : visibleText });
    previousEventWasAgentMessage = true;
    lastAgentMessageEndedWithNewline = visibleText.endsWith("\n");
    currentAgentMessageStreamKey = streamKey;
  }

  function handleLine(line: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      onEvent({ kind: "raw", line });
      return;
    }
    if (!isRecord(parsed)) return;

    if (parsed.type === "error") {
      const message = extractErrorMessage(parsed.message ?? parsed.error, "Codex error");
      if (isRecoverableCodexReconnect(message)) {
        onEvent({ kind: "status", label: "warning", detail: message });
        return;
      }
      if (!errorEmitted) {
        errorEmitted = true;
        onEvent({ kind: "error", message, raw: stringifyContent(parsed) });
      }
      return;
    }
    if (parsed.type === "thread.started") {
      return;
    }
    if (parsed.type === "turn.started") {
      resetAgentMessageBoundary();
      onEvent({ kind: "status", label: "running" });
      return;
    }
    if (parsed.type === "turn.completed") {
      const usage = isRecord(parsed.usage) ? parsed.usage : {};
      onEvent({
        kind: "usage",
        inputTokens: readNumber(usage.input_tokens),
        outputTokens: readNumber(usage.output_tokens),
        cachedInputTokens: readNumber(usage.cached_input_tokens),
        reasoningOutputTokens: readNumber(usage.reasoning_output_tokens)
      });
      return;
    }
    if (parsed.type === "turn.failed") {
      if (!errorEmitted) {
        errorEmitted = true;
        onEvent({ kind: "error", message: extractErrorMessage(parsed.error ?? parsed.message, "Codex turn failed") });
      }
      return;
    }
    const directAgentTextDelta = extractDirectAgentTextDelta(parsed);
    if (directAgentTextDelta) {
      emitAgentMessageText(directAgentTextDelta.text, directAgentTextDelta.streamKey);
      return;
    }
    const directThinkingDelta = extractDirectThinkingDelta(parsed);
    if (directThinkingDelta) {
      onEvent({ kind: "thinking", text: directThinkingDelta.text });
      resetAgentMessageBoundary();
      return;
    }
    if (isCodexItemEvent(parsed.type) && isRecord(parsed.item)) {
      const item = parsed.item;
      if (item.type === "agent_message" && parsed.type === "item.completed" && typeof item.text === "string" && item.text.length > 0) {
        const streamKey = typeof item.id === "string" ? item.id : "default";
        const text =
          typeof item.id === "string"
            ? readCumulativeTextDelta(agentMessageTextById, item.id, item.text)
            : item.text;
        emitAgentMessageText(text, streamKey);
        return;
      }
      if (item.type === "agent_message" && parsed.type === "item.started") {
        return;
      }
      if (item.type === "agent_message") {
        const streamKey = typeof item.id === "string" ? item.id : "default";
        const text = extractAgentMessageItemDelta(parsed, item, agentMessageTextById);
        if (text) emitAgentMessageText(text, streamKey);
        return;
      }
      if (isThinkingItem(item) && parsed.type === "item.completed") {
        const text =
          typeof item.id === "string"
            ? readCumulativeTextDelta(thinkingTextById, item.id, extractThinkingText(item))
            : extractThinkingText(item);
        if (text) onEvent({ kind: "thinking", text });
        resetAgentMessageBoundary();
        return;
      }
      if (isThinkingItem(item)) {
        const text = extractThinkingItemDelta(parsed, item, thinkingTextById);
        if (text) onEvent({ kind: "thinking", text });
        resetAgentMessageBoundary();
        return;
      }
      if (item.type !== "command_execution" || typeof item.id !== "string") return;
      resetAgentMessageBoundary();
      if (!commandIds.has(item.id)) {
        commandIds.add(item.id);
        onEvent({
          kind: "tool_use",
          id: item.id,
          name: "Bash",
          input: { command: typeof item.command === "string" ? item.command : "" }
        });
      }
      if (parsed.type === "item.completed") {
        onEvent({
          kind: "tool_result",
          toolUseId: item.id,
          content: stringifyContent(item.aggregated_output ?? ""),
          isError: typeof item.exit_code === "number" ? item.exit_code !== 0 : item.status === "failed"
        });
      }
    }
  }

  return {
    feed(chunk: string) {
      buffer += chunk;
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line) handleLine(line);
        newlineIndex = buffer.indexOf("\n");
      }
    },
    flush() {
      const line = buffer.trim();
      buffer = "";
      if (line) handleLine(line);
    }
  };
}

function createClaudeCodeEventHandler(onEvent: (event: AgentEvent) => void, options: { onTurnEnd?: (stopReason: string) => void } = {}) {
  let buffer = "";
  let errorEmitted = false;
  let visibleTextEmitted = false;
  let currentMessageId: string | null = null;
  let currentMessageStreamedText = false;
  let currentMessageStreamedThinking = false;
  const blocks = new Map<string, ClaudeContentBlockState>();
  const emittedToolUseIds = new Set<string>();
  const textStreamed = new Set<string>();
  const thinkingStreamed = new Set<string>();
  const structuredReplyStreams = new Map<string, StructuredReplyStreamState>();

  function blockKey(index: unknown): string {
    return `${currentMessageId ?? "anon"}:${String(index ?? "0")}`;
  }

  function emitClaudeText(text: string, streamKey = currentMessageId ?? "default") {
    const visibleText = visibleTextDeltaFromStructuredTransport(structuredReplyStreams, streamKey, text, { suppressPlainJson: true });
    if (!visibleText) return;
    visibleTextEmitted = true;
    onEvent({ kind: "text", text: visibleText });
  }

  function emitClaudeToolUse(id: unknown, name: unknown, input: unknown) {
    if (typeof id !== "string" || !id) return;
    if (emittedToolUseIds.has(id)) return;
    emittedToolUseIds.add(id);
    onEvent({
      kind: "tool_use",
      id,
      name: typeof name === "string" && name ? name : "Tool",
      input: input ?? null
    });
  }

  function emitClaudeToolResult(toolUseId: unknown, content: unknown, isError: unknown) {
    if (typeof toolUseId !== "string" || !toolUseId) return;
    onEvent({
      kind: "tool_result",
      toolUseId,
      content: stringifyClaudeToolResultContent(content),
      isError: Boolean(isError)
    });
  }

  function handleLine(line: string) {
    const parsed = safeParseJson(line);
    if (!isRecord(parsed)) {
      onEvent({ kind: "raw", line });
      return;
    }

    if (parsed.type === "system") {
      if (parsed.subtype === "init") {
        const detail = typeof parsed.model === "string" && parsed.model ? `Model: ${parsed.model}` : undefined;
        onEvent({ kind: "status", label: "initializing", detail });
      } else if (parsed.subtype === "status") {
        const status = typeof parsed.status === "string" ? parsed.status : "running";
        onEvent({ kind: "status", label: status === "requesting" ? "running" : status });
      }
      return;
    }

    if (parsed.type === "stream_event" && isRecord(parsed.event)) {
      handleClaudeStreamEvent(parsed.event);
      return;
    }

    if (parsed.type === "assistant") {
      handleClaudeAssistantMessage(parsed);
      return;
    }

    if (parsed.type === "user") {
      handleClaudeUserMessage(parsed);
      return;
    }

    if (parsed.type === "result") {
      if (parsed.is_error === true && !errorEmitted) {
        errorEmitted = true;
        onEvent({ kind: "error", message: extractErrorMessage(parsed.result ?? parsed.error, "Claude Code run failed") });
        options.onTurnEnd?.("result");
        return;
      }
      const usage = isRecord(parsed.usage) ? parsed.usage : {};
      onEvent({
        kind: "usage",
        inputTokens: readNumber(usage.input_tokens),
        outputTokens: readNumber(usage.output_tokens),
        cachedInputTokens: readNumber(usage.cache_read_input_tokens),
        durationMs: readNumber(parsed.duration_ms)
      });
      const resultText = typeof parsed.result === "string" ? parsed.result : "";
      if (resultText && !visibleTextEmitted) emitClaudeText(resultText, "result");
      options.onTurnEnd?.("result");
      return;
    }

    if (typeof parsed.type === "string" && parsed.type.includes("error") && !errorEmitted) {
      errorEmitted = true;
      onEvent({ kind: "error", message: extractErrorMessage(parsed.error ?? parsed.message, "Claude Code error") });
    }
  }

  function handleClaudeAssistantMessage(parsed: Record<string, unknown>) {
    const message = isRecord(parsed.message) ? parsed.message : parsed;
    const explicitMessageId = typeof message.id === "string" ? message.id : null;
    if (explicitMessageId) currentMessageId = explicitMessageId;
    const textStreamKey = explicitMessageId ?? (currentMessageStreamedText ? currentMessageId : null) ?? "assistant";
    const thinkingStreamKey = explicitMessageId ?? (currentMessageStreamedThinking ? currentMessageId : null) ?? "assistant-thinking";
    const textAlreadyStreamed = textStreamed.has(textStreamKey);
    const thinkingAlreadyStreamed = thinkingStreamed.has(thinkingStreamKey);
    const content = readClaudeContentBlocks(message);

    for (const block of content) {
      if (!isRecord(block)) continue;
      if (block.type === "tool_use") {
        emitClaudeToolUse(block.id, block.name, block.input);
        continue;
      }
      if (!textAlreadyStreamed && block.type === "text" && typeof block.text === "string") {
        emitClaudeText(block.text, textStreamKey);
        continue;
      }
      if (!thinkingAlreadyStreamed && block.type === "thinking" && typeof block.thinking === "string") {
        onEvent({ kind: "thinking", text: block.thinking });
      }
    }

    const stopReason = typeof message.stop_reason === "string" ? message.stop_reason : "";
    if (stopReason) options.onTurnEnd?.(stopReason);
    currentMessageStreamedText = false;
    currentMessageStreamedThinking = false;
  }

  function handleClaudeUserMessage(parsed: Record<string, unknown>) {
    const message = isRecord(parsed.message) ? parsed.message : parsed;
    for (const block of readClaudeContentBlocks(message)) {
      if (!isRecord(block)) continue;
      if (block.type === "tool_result") {
        emitClaudeToolResult(block.tool_use_id, block.content, block.is_error);
      }
    }
  }

  function handleClaudeStreamEvent(event: Record<string, unknown>) {
    if (event.type === "message_delta" && isRecord(event.delta)) {
      const stopReason = typeof event.delta.stop_reason === "string" ? event.delta.stop_reason : "";
      if (stopReason) options.onTurnEnd?.(stopReason);
      return;
    }

    if (event.type === "message_start") {
      currentMessageId = isRecord(event.message) && typeof event.message.id === "string" ? event.message.id : null;
      currentMessageStreamedText = false;
      currentMessageStreamedThinking = false;
      onEvent({ kind: "status", label: "running" });
      return;
    }

    if (event.type === "content_block_start" && isRecord(event.content_block)) {
      const block = event.content_block;
      blocks.set(blockKey(event.index), {
        type: block.type,
        name: block.name,
        id: block.id,
        input: "",
        inputValue: "input" in block ? block.input : undefined
      });
      if (block.type === "thinking") {
        onEvent({ kind: "status", label: "thinking" });
      }
      return;
    }

    if (event.type === "content_block_delta" && isRecord(event.delta)) {
      const state = blocks.get(blockKey(event.index));
      const delta = event.delta;
      if (delta.type === "text_delta" && typeof delta.text === "string") {
        const streamKey = currentMessageId ?? "assistant";
        textStreamed.add(streamKey);
        currentMessageStreamedText = true;
        emitClaudeText(delta.text, streamKey);
        return;
      }
      if (delta.type === "thinking_delta" && typeof delta.thinking === "string") {
        const streamKey = currentMessageId ?? "assistant-thinking";
        thinkingStreamed.add(streamKey);
        currentMessageStreamedThinking = true;
        onEvent({ kind: "thinking", text: delta.thinking });
        return;
      }
      if (delta.type === "input_json_delta" && typeof delta.partial_json === "string" && state?.type === "tool_use") {
        state.input += delta.partial_json;
        return;
      }
    }

    if (event.type === "content_block_stop") {
      const key = blockKey(event.index);
      const state = blocks.get(key);
      if (state?.type === "tool_use" && typeof state.id === "string") {
        if (state.input.trim()) {
          const parsedInput = safeParseJson(state.input);
          if (parsedInput !== null) {
            emitClaudeToolUse(state.id, state.name, parsedInput);
          }
        } else if (state.inputValue !== undefined) {
          emitClaudeToolUse(state.id, state.name, state.inputValue);
        }
      }
      blocks.delete(key);
    }
  }

  return {
    feed(chunk: string) {
      buffer += chunk;
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line) handleLine(line);
        newlineIndex = buffer.indexOf("\n");
      }
    },
    flush() {
      const line = buffer.trim();
      buffer = "";
      if (line) handleLine(line);
    }
  };
}

function readClaudeContentBlocks(message: Record<string, unknown>): unknown[] {
  if (Array.isArray(message.content)) return message.content;
  if (typeof message.content === "string") return [{ type: "text", text: message.content }];
  return [];
}

function stringifyClaudeToolResultContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((entry) => {
        if (typeof entry === "string") return entry;
        if (isRecord(entry) && typeof entry.text === "string") return entry.text;
        return stringifyContent(entry);
      })
      .filter(Boolean)
      .join("\n");
  }
  return stringifyContent(content);
}

function extractClaudeCodeResult(stdout: string): string {
  const lines = stdout.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  for (const line of [...lines].reverse()) {
    const parsed = safeParseJson(line);
    if (!isRecord(parsed)) continue;
    if (parsed.type === "result") {
      if (isNonEmptyRecord(parsed.structured_output)) return JSON.stringify(parsed.structured_output);
      if (typeof parsed.result === "string") return parsed.result;
    }
    const assistantText = extractClaudeMessageText(parsed);
    if (assistantText) return assistantText;
  }
  return "";
}

function extractClaudeMessageText(value: Record<string, unknown>): string {
  const message = isRecord(value.message) ? value.message : value;
  const content = message.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (!isRecord(part)) return "";
      if (typeof part.text === "string") return part.text;
      return "";
    })
    .join("");
}

function looksLikeStructuredJson(input: string): boolean {
  const trimmed = input.trim();
  return trimmed.startsWith("{") && trimmed.endsWith("}");
}

function looksLikeStructuredTransportStart(input: string): boolean {
  const trimmed = input.trimStart();
  if (!trimmed) return false;
  if (/^```json\s*\{/iu.test(trimmed)) return true;
  if (!trimmed.startsWith("{")) return false;
  return trimmed === "{" || /"\s*(reply|scriptHtml|rows)\s*"\s*:/u.test(trimmed);
}

function containsStructuredTransportObject(input: string): boolean {
  const jsonText = extractJsonObject(input);
  if (!jsonText) return false;
  const parsed = safeParseJson(jsonText);
  return isRecord(parsed) && "reply" in parsed && "scriptHtml" in parsed && "rows" in parsed;
}

function visibleTextDeltaFromStructuredTransport(
  streams: Map<string, StructuredReplyStreamState>,
  streamKey: string,
  text: string,
  options: { suppressPlainJson?: boolean } = {}
): string {
  const existing = streams.get(streamKey);
  if (existing?.structured && existing.replyComplete) {
    streams.set(streamKey, { ...existing, raw: truncateText(`${existing.raw}${text}`, 4000) });
    return "";
  }

  const raw = `${existing?.raw ?? ""}${text}`;
  const structured =
    existing?.structured === true ||
    looksLikeStructuredTransportStart(raw) ||
    containsStructuredTransportObject(raw) ||
    (options.suppressPlainJson === true && looksLikeStructuredJson(raw));

  if (!structured) return text;

  const reply = extractJsonStringFieldPrefix(raw, "reply");
  const previousReply = existing?.emittedReply ?? "";
  const emittedReply = reply?.value ?? previousReply;
  streams.set(streamKey, {
    raw: shouldKeepStructuredTransportRaw(reply) ? raw : truncateText(raw, 4000),
    emittedReply,
    structured: true,
    replyComplete: reply?.complete === true
  });

  if (!reply) return "";
  if (!previousReply) return reply.value;
  if (reply.value === previousReply) return "";
  if (reply.value.startsWith(previousReply)) return reply.value.slice(previousReply.length);
  return reply.value;
}

function shouldKeepStructuredTransportRaw(reply: JsonStringFieldPrefix | null): boolean {
  return !reply || !reply.complete;
}

type JsonStringFieldPrefix = {
  value: string;
  complete: boolean;
};

function extractJsonStringFieldPrefix(text: string, fieldName: string): JsonStringFieldPrefix | null {
  const keyPattern = new RegExp(`"${escapeRegExp(fieldName)}"\\s*:\\s*"`, "u");
  const match = keyPattern.exec(text);
  if (!match) return null;

  let value = "";
  let index = match.index + match[0].length;
  while (index < text.length) {
    const char = text[index];
    if (char === "\"") return { value, complete: true };
    if (char !== "\\") {
      value += char;
      index += 1;
      continue;
    }

    const next = text[index + 1];
    if (!next) break;
    if (next === "u") {
      const hex = text.slice(index + 2, index + 6);
      if (!/^[\da-f]{4}$/iu.test(hex)) break;
      value += String.fromCharCode(parseInt(hex, 16));
      index += 6;
      continue;
    }

    value += decodeJsonEscape(next);
    index += 2;
  }

  return { value, complete: false };
}

function decodeJsonEscape(char: string): string {
  if (char === "n") return "\n";
  if (char === "r") return "\r";
  if (char === "t") return "\t";
  if (char === "b") return "\b";
  if (char === "f") return "\f";
  return char;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function isCodexItemEvent(type: unknown): boolean {
  return type === "item.started" || type === "item.delta" || type === "item.updated" || type === "item.completed";
}

function extractDirectAgentTextDelta(parsed: Record<string, unknown>): { text: string; streamKey: string } | null {
  const type = typeof parsed.type === "string" ? parsed.type : "";
  const isTextDelta =
    type === "text_delta" ||
    type === "agent_message_delta" ||
    type === "response.output_text.delta" ||
    type === "assistant.message_delta" ||
    type.endsWith(".message_delta") ||
    type.endsWith(".output_text.delta");
  if (!isTextDelta) return null;
  const text = extractTextFragment(parsed);
  return text ? { text, streamKey: typeof parsed.id === "string" ? parsed.id : "default" } : null;
}

function extractDirectThinkingDelta(parsed: Record<string, unknown>): { text: string } | null {
  const type = typeof parsed.type === "string" ? parsed.type : "";
  const isThinkingDelta =
    type === "thinking_delta" ||
    type === "assistant.reasoning_delta" ||
    type === "response.reasoning_summary_text.delta" ||
    type.endsWith(".reasoning_delta") ||
    type.endsWith(".thinking_delta") ||
    type.endsWith(".reasoning_summary_text.delta");
  if (!isThinkingDelta) return null;
  const text = extractTextFragment(parsed);
  return text ? { text } : null;
}

function extractAgentMessageItemDelta(parsed: Record<string, unknown>, item: Record<string, unknown>, seenTextById: Map<string, string>): string {
  const text = extractTextFragment(parsed.delta) || extractTextFragment(item.delta) || extractTextFragment(parsed) || extractTextFragment(item);
  if (!text) return "";
  if (typeof item.id === "string" && typeof item.text === "string") {
    return readCumulativeTextDelta(seenTextById, item.id, item.text);
  }
  return text;
}

function extractThinkingItemDelta(parsed: Record<string, unknown>, item: Record<string, unknown>, seenTextById: Map<string, string>): string {
  const text = extractTextFragment(parsed.delta) || extractTextFragment(item.delta) || extractTextFragment(parsed) || extractTextFragment(item);
  if (!text) return "";
  if (typeof item.id === "string" && typeof item.text === "string") {
    return readCumulativeTextDelta(seenTextById, item.id, item.text);
  }
  return text;
}

function readCumulativeTextDelta(seenTextById: Map<string, string>, id: string, nextText: string): string {
  const previousText = seenTextById.get(id) ?? "";
  seenTextById.set(id, nextText);
  if (!previousText) return nextText;
  if (nextText === previousText) return "";
  if (nextText.startsWith(previousText)) return nextText.slice(previousText.length);
  return nextText;
}

function extractTextFragment(value: unknown): string {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return "";

  for (const key of ["text", "delta", "deltaContent", "content", "thinking", "summary"]) {
    const directValue = value[key];
    if (typeof directValue === "string") return directValue;
  }

  for (const key of ["delta", "message", "item", "part"]) {
    const nestedValue = value[key];
    if (!isRecord(nestedValue)) continue;
    const nestedText = extractTextFragment(nestedValue);
    if (nestedText) return nestedText;
  }

  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyRecord(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && Object.keys(value).length > 0;
}

function safeParseJson(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function isRecoverableCodexReconnect(message: string): boolean {
  const normalized = message.trim();
  if (!/^Reconnecting\.\.\./iu.test(normalized)) return false;
  return /\b\d+\/\d+\b/u.test(normalized) || /timeout waiting for child process to exit|stream disconnected before completion/iu.test(normalized);
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function stringifyContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function extractErrorMessage(value: unknown, fallback: string): string {
  if (typeof value === "string") {
    const parsed = safeParseJson(value);
    if (parsed && typeof parsed === "object") return extractErrorMessage(parsed, value);
    return value;
  }
  if (isRecord(value)) {
    if (typeof value.detail === "string" && value.detail) return value.detail;
    if (typeof value.message === "string" && value.message) return extractErrorMessage(value.message, value.message);
    if (typeof value.error === "string" && value.error) return value.error;
    if (value.error) return extractErrorMessage(value.error, fallback);
    if (value.data) return extractErrorMessage(value.data, fallback);
    if (typeof value.name === "string" && value.name) return value.name;
  }
  return fallback;
}

function isThinkingItem(item: Record<string, unknown>): boolean {
  return item.type === "reasoning" || item.type === "thinking" || item.type === "reasoning_summary";
}

function extractThinkingText(item: Record<string, unknown>): string {
  for (const key of ["text", "summary", "content"]) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) return value;
    if (Array.isArray(value)) {
      const text = value.map((entry) => (typeof entry === "string" ? entry : isRecord(entry) ? stringifyContent(entry.text ?? entry.summary ?? "") : "")).join("");
      if (text.trim()) return text;
    }
  }
  return "";
}

type ConversationContextPromptMessage = {
  role: "user" | "assistant";
  content: string;
};

type ConversationContextTurn = {
  messages: ConversationContextPromptMessage[];
};

export function buildConversationContext(messages: AgentMessage[] = [], currentMessage: string): string {
  const currentMessageContent = currentMessage.trim();
  let currentUserMessageIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "user" && message.content.trim() === currentMessageContent) {
      currentUserMessageIndex = index;
      break;
    }
  }
  const promptTurns = collectValidConversationContextTurns(
    messages.map((message, index) => ({ message, index })).filter(({ index }) => index !== currentUserMessageIndex)
  );

  if (promptTurns.length === 0) return "这是当前对话窗口的第一条有效用户请求，暂无更早的对话上下文。";

  const selectedTurns: ConversationContextTurn[] = [];
  let selectedChars = 0;
  let omittedEarlierContext = false;
  const maxSelectedChars = CONVERSATION_CONTEXT_MAX_CHARS - CONVERSATION_CONTEXT_OMITTED_NOTICE.length - 2;
  for (let index = promptTurns.length - 1; index >= 0; index -= 1) {
    const turn = promptTurns[index];
    const turnChars = estimateConversationTurnChars(turn);
    const nextChars = selectedChars + turnChars + (selectedTurns.length > 0 ? 2 : 0);
    if (selectedTurns.length === 0 || nextChars <= maxSelectedChars) {
      selectedTurns.unshift(turn);
      selectedChars = nextChars;
      continue;
    }
    omittedEarlierContext = true;
    break;
  }

  const renderedMessages = selectedTurns.flatMap((turn) => turn.messages);
  const renderedContext = renderedMessages.map(renderConversationContextMessage).join("\n\n");
  return omittedEarlierContext ? `${CONVERSATION_CONTEXT_OMITTED_NOTICE}\n\n${renderedContext}` : renderedContext;
}

function collectValidConversationContextTurns(entries: Array<{ message: AgentMessage; index: number }>): ConversationContextTurn[] {
  const turns: ConversationContextTurn[] = [];
  let currentUser: ConversationContextPromptMessage | null = null;
  let assistantMessages: ConversationContextPromptMessage[] = [];
  let currentTurnInvalid = false;

  function flushTurn() {
    if (currentUser && !currentTurnInvalid && assistantMessages.length > 0) {
      turns.push({ messages: [currentUser, ...assistantMessages] });
    }
    currentUser = null;
    assistantMessages = [];
    currentTurnInvalid = false;
  }

  for (const { message } of entries) {
    if (message.role === "user") {
      flushTurn();
      if (shouldIncludeConversationMessage(message)) {
        currentUser = { role: "user", content: message.content.trim() };
      }
      continue;
    }

    if (!currentUser) continue;
    if (isInvalidConversationAssistantMessage(message)) {
      currentTurnInvalid = true;
      continue;
    }
    if (shouldIncludeConversationMessage(message)) {
      assistantMessages.push({ role: "assistant", content: message.content.trim() });
    }
  }
  flushTurn();
  return turns;
}

function estimateConversationTurnChars(turn: ConversationContextTurn): number {
  return turn.messages.reduce((sum, message, index) => sum + renderConversationContextMessage(message, index).length + 2, 0);
}

function renderConversationContextMessage(message: ConversationContextPromptMessage, index: number): string {
  const role = message.role === "user" ? "用户" : "助手";
  return `### ${index + 1}. ${role}\n${truncateForPrompt(message.content.trim(), CONVERSATION_CONTEXT_MESSAGE_MAX_CHARS)}`;
}

function isInvalidConversationAssistantMessage(message: AgentMessage): boolean {
  if (message.role !== "assistant") return false;
  if (message.runStatus === "queued" || message.runStatus === "running" || message.runStatus === "failed" || message.runStatus === "canceled") return true;
  return (message.events ?? []).some((event) => event.kind === "error" || (event.kind === "status" && (event.label === "failed" || event.label === "canceled")));
}

function shouldIncludeConversationMessage(message: AgentMessage): boolean {
  const content = message.content.trim();
  if (!content) return false;
  if (message.role === "user") return true;
  if (content === defaultAgentMessage) return false;
  if (message.runStatus === "queued" || message.runStatus === "running" || message.runStatus === "failed" || message.runStatus === "canceled") return false;
  if (/^正在准备 .+ 任务[.。]*$/u.test(content)) return false;
  if (/^正在等待模型分析请求[.。]*$/u.test(content)) return false;
  if (content.includes("正在读取当前脚本、分镜表")) return false;
  return true;
}

function describeInterfaceLanguage(language?: InterfaceLanguage): string {
  if (language === "en") return "English (en). Use English when the script language is unclear.";
  if (language === "zh-TW") return "Traditional Chinese (zh-TW). Use Chinese when the script language is unclear.";
  if (language === "zh-CN") return "Simplified Chinese (zh-CN). Use Chinese when the script language is unclear.";
  return "Unknown. Infer from the script first; default generated prompts to English only when the script language is unclear.";
}

function describeInterfaceLanguageFallback(language?: InterfaceLanguage): string {
  if (language === "en") return "English.";
  if (language === "zh-TW") return "Traditional Chinese.";
  if (language === "zh-CN") return "Simplified Chinese.";
  return "Unknown.";
}

function inferUserVisibleRequestLanguage(input: string): string {
  const text = input.trim();
  const hanCount = countMatches(text, /[\u3400-\u9FFF\uF900-\uFAFF]/gu);
  const kanaCount = countMatches(text, /[\u3040-\u30FF]/gu);
  const hangulCount = countMatches(text, /[\uAC00-\uD7AF]/gu);
  const latinCount = countMatches(text, /[A-Za-z]/g);

  if (hangulCount >= 2 && hangulCount >= hanCount + kanaCount) return "Korean.";
  if (kanaCount >= 2) return "Japanese.";
  if (hanCount >= 2) return "Chinese.";
  if (latinCount >= 3 && hanCount + kanaCount + hangulCount === 0) return "English.";
  return "Unclear or mixed; infer from the current user-facing request first.";
}

function describeVisibleOutputLanguage(userVisibleMessage: string, interfaceLanguage?: InterfaceLanguage): string {
  const requestLanguage = inferUserVisibleRequestLanguage(userVisibleMessage);
  const interfaceFallback = describeInterfaceLanguageFallback(interfaceLanguage);
  return `Current user-facing request language signal: ${requestLanguage}
Interface language fallback: ${interfaceFallback}

Rules:
- All natural-language text visible in the conversation panel must use the conversation output language, including reply, streamed assistant text, visible thinking, and progress summaries.
- Choose the conversation output language from the current user-facing request first: Chinese request -> Chinese, English request -> English, any other language request -> that same language.
- If the current user-facing request is only a short button label or otherwise unclear, use the interface language fallback.
- Do not choose the conversation output language from the current script language. Script language controls row.content and generated storyboard notes/prompts only.
- Do not switch to English just because the model default, prompt scaffolding, product names, or the current script contains English.`;
}

function buildPrompt({ project, tab, message, userVisibleMessage, mode, interfaceLanguage, attachments = [], conversationMessages = [], dreaminaGeneration }: CodexRunInput, agentName: string): string {
  const visibleStoryboardFieldMapping = describeStoryboardColumns(project.columns);
  const attachmentContext = describeAgentAttachments(attachments);
  const userRequest = userVisibleMessage?.trim() || message.trim();
  const taskInstruction = message.trim();
  const conversationContext = buildConversationContext(conversationMessages, userRequest);
  const interfaceLanguageContext = describeInterfaceLanguage(interfaceLanguage);
  const visibleOutputLanguageContext = describeVisibleOutputLanguage(userRequest, interfaceLanguage);
  const dreaminaGenerationInstruction = dreaminaGeneration ? buildDreaminaAgentInstruction(dreaminaGeneration) : "";
  const internalTaskInstruction = taskInstruction && taskInstruction !== userRequest
    ? `
## MkBoard 内部任务指令

${taskInstruction}
`
    : "";
  const operationInstruction =
    mode === "storyboard-generation"
      ? ""
      : `
## 对话操作协议

普通对话修改分镜面板里的单元格时，默认返回 rows patch，不要为了每个字段构造 update_shot_cells。

rows patch 规则：
- 只修改当前已有分镜行，不新增、不删除、不排序。
- rows 可以只包含被修改的行，也可以包含完整当前分镜行数组；每个 row 必须带当前分镜表 JSON 里的原始 id。
- 每个返回的 row 都必须是该行修改后的完整快照：scene、duration、content、note、imageAssetIds、customValues 都要保留未修改字段的当前值，只改变用户要求修改或生成所必需的字段。
- MkBoard 会自动比较 rows 和当前数据库，并只写入变化的单元格。不要把整张分镜重排、换 id、删行或加行伪装成 rows patch。
- 如果用户要求插入、删除、复制、排序、更新画面素材、重新解析整张分镜、或触发图片/视频生成，再返回对应 operations。

operations 支持：
- update_script：更新完整脚本 HTML。
- sync_script_a_roll_tags：根据当前分镜表给当前脚本 HTML 补充可见文本形式的 A-Roll 标签。用户在脚本里看到和复制出来的内容应该是普通文本 <A>...</A>，不是 HTML 链接、富文本 mark 或高亮样式。这个操作由模型自己理解分镜与原脚本的对应关系；MkBoard 只写入你返回的完整 scriptHtml，不会用代码替你匹配或插入标签。
- parse_storyboard：根据当前脚本和项目上下文重新解析完整分镜表。这个操作会走 MkBoard 的正式 AI 解析分镜入口；不要在普通对话中直接返回 rows 来替代它。
- update_shot_cells：兼容旧格式的单元格修改操作；新逻辑优先使用 rows patch。rowRef 使用 {"kind":"id","value":"行 id"} 或 {"kind":"index","value":1}；index 从当前分镜表第 1 行开始。
- insert_shots：插入分镜。placement 只能是 before、after 或 end；rowRef 为 null 时默认末尾插入。
- delete_shots：删除指定分镜。
- duplicate_shots：复制指定分镜。
- reorder_shot：移动分镜到目标分镜 before 或 after。
- update_shot_media：更新画面列素材 id 数组。
- regenerate_media：重生成指定分镜素材，kind 只能是 image 或 video；重新生成已有内容时 overwriteExisting 必须为 true。只有用户明确要求使用即梦 CLI / Dreamina CLI 新生成时，provider 写 dreamina_cli；其他生成 provider 写 null。标准 Seedance 2.0 视频只有在用户明确点名精确比例时才把 aspectRatio 写为 1:1、4:3、3:4、16:9、9:16 或 21:9；否则写 null。

operations 中每个对象都必须包含 schema 里的所有字段；当前操作不使用的字段填 null。数组字段不使用时填 null，需要空列表时填 []。

字段规则：
- 标准字段只能是 scene、duration、content、note。
- 自定义字段必须先根据当前分镜字段 JSON 的 id、label、type、visible、custom 语义判断目标列，再写入该列的 column id；不要把可见列名当作 field 或 customValues key 返回。
- rows 和 insert_shots.rows 里的 customValues 必须是对象，键只能来自当前分镜字段 JSON 中 visible=true 且 custom=true 的 column id；不要使用“图像提示词”“视频提示词”“Generation method”等可见列名作为 key。
- 没有内容时写空字符串；语义上属于图像提示词或视频提示词的列没有内容时写 —。
- 用户说“图像提示词 / 图片提示词 / 生图提示词”时，在当前分镜字段 JSON 中语义定位最匹配的图像提示词列，然后只修改该列的 column id。
- 用户说“视频提示词 / 动画提示词 / 动态提示词”时，在当前分镜字段 JSON 中语义定位最匹配的视频提示词列，然后只修改该列的 column id。
- 用户说“生成方式 / 生成方法 / Generation method”时，在当前分镜字段 JSON 中语义定位最匹配的生成方式列，然后只修改该列的 column id。
- 用户没有明说提示词类型时，根据意图判断目标语义列：生图、图片、静态画面 -> 图像提示词；视频、动画、动态镜头、Seedance、Hyperframes -> 视频提示词。
- 如果当前分镜字段 JSON 里没有可靠匹配的自定义列，不要猜默认 id；在 reply 里说明无法可靠定位。
- aspectRatio 只用于标准 Seedance 2.0 视频（provider 必须为 null）：用户明确说出 1:1、4:3、3:4、16:9、9:16 或 21:9 时原样填写；用户只说横屏/竖屏、没有指定精确比例时写 null，由 MkBoard 使用当前项目比例。图片、Hyperframes 和 dreamina_cli 操作一律写 null。
- Seedance 2.0 的视频提示词用于全能参考模式，必须明确说明根据该镜头的分镜图生成视频，然后简洁写明景别/构图范围和发生了什么；只有动作确实需要时才补充镜头运动。Seedance 视频时长不能低于 10 秒，常规目标为 12 秒，长内容最多延长到 15 秒。
- Hyperframes 的视频提示词必须简洁描述景别/构图范围、发生的画面变化、必要的 HTML/MG/text/data/process/UI-card 动画结构、阶段节奏、可见文案语言和时长；Hyperframes 视频时长必须在 10 到 20 秒之间，并根据分镜 row.content 字数和动画复杂度延长。
- 所有新生成或补齐的视频提示词优先控制在 1-3 个短句内，不写比喻、情绪渲染、电影感散文、泛泛画质词或重复故事说明；每个 Shot 的核心信息只有景别/构图范围和实际发生的动作或画面变化。
- 当前镜头已经绑定或上传主体、角色、场景、分镜图或其他参考素材时，直接要求沿用参考，不要重复描述外观、服装、场景陈设、配色或风格。
- 视频提示词必须明确“无 BGM / 不生成背景音乐，只保留与画面动作和环境对应的音效”；没有合理音效时允许安静，不得用音乐填充。
- 不要在视频提示词中要求转场动画、转场素材、过渡镜头、片头或片尾式衔接；每个 Shot 独立成立，相邻 Shot 直接硬切。Hyperframes 只保留单个 Shot 内表达内容所必需的元素动画。
- 修改或生成 Seedance 2.0 / Hyperframes 视频行时，如果 row.duration 低于上述下限或与内容长度明显不匹配，必须在 rows patch 中同步更新 duration。
- 图像提示词和视频提示词的语言要按当前脚本主语言和用户选择的界面语言共同判断：脚本语言明确时优先脚本语言；脚本为空、混合或不明确时使用界面语言；没有可用信号时默认英文。
- 单元格更新只改变用户明确要求的字段，或为了完成生成必需补齐的字段；rows patch 中未改字段必须照抄当前值，不要自行改写。
- “用户本次附加图片”里的图片已经是当前项目素材库中的图片素材，每张都带有 assetId。用户要求把这些图片、logo、参考图或附件加入某个分镜时，必须用这些 assetId 更新该分镜画面列，不要只在 reply 里说会参考。
- 用户要求“把附加图片加入第 N 镜并生成/重新生成视频”时，必须返回 regenerate_media(kind="video") 指向目标分镜；如果你能确定目标素材，也同时返回 update_shot_media，把目标分镜已有素材 id 与本次附加图片 assetId 合并。MkBoard 主进程也会在执行前自动把本次附加图片绑定到这些重生成视频的目标分镜，确保后续 HyperFrames 视频能读取到它们。

A 标签同步规则：
- 用户要求“给脚本加 A 标签 / 补 A 标签 / 根据分镜反向标记 A-Roll / 同步 A-Roll 标签 / 标出哪些是 A-Roll”时，返回 sync_script_a_roll_tags 操作，不要返回普通 update_script。
- 只根据“当前分镜表 JSON”判断 A-Roll。scene / 类别 为 A-ROLL、A Roll、A-roll 或同义标注的行，才是需要加 A 标签的来源；B-ROLL 行绝不加 A 标签。
- scriptHtml 必须返回完整的当前脚本 HTML，并且只允许插入可见文本标签。因为 scriptHtml 是 HTML 字符串，所以开标签必须写成 &lt;A&gt;，关标签必须写成 &lt;/A&gt;；不要返回真实 HTML <A>...</A> 元素、不要加 data 属性、不要加 span/a 包裹、不要加样式或高亮。用户在编辑器里看到和复制出来的才会是普通文本 <A> 与 </A>。
- 除了插入这些可见文本标签，不得修改原文，不得改写、翻译、补充、删减、重排、合并或拆散原脚本里的任何文字、标点、空格、段落顺序和已有 HTML 结构。
- 你需要理解分镜行 content 与原脚本的对应关系：如果分镜内容和脚本原文不是完全逐字一致，可以做语义对齐，但包裹时必须包住脚本中已经存在的原始文字片段，不能把脚本文字改成分镜表文字。
- 如果某段 A-Roll 已经在 <A>...</A> 中，不要重复包裹。不要给 B-Roll、画面备注、图像提示词、视频提示词或生成方式加 A 标签。
- 如果无法可靠定位某个 A-Roll 分镜对应的原文片段，宁可不包裹那一段，并在 reply 简短说明有多少段未能可靠匹配；不要为了凑齐标签而改动原文。

生成规则：
- 用户要求“解析分镜 / 重新解析分镜 / 拆分分镜 / 重新拆分 / 生成分镜表 / 从当前脚本生成分镜 / 把脚本转成分镜”，返回 parse_storyboard。当前分镜表已有行、或用户说“重新”时，overwriteExisting 必须为 true。
- 如果用户只是询问如何解析分镜、咨询能力、或要求解释流程，不要返回 parse_storyboard，只用 reply 回答。
- 用户要求“把第 N 镜 / 镜头 N 改成 Broll / Aroll”时，必须返回 rows patch，把该行 scene 改成 B-ROLL 或 A-ROLL；不要只在 reply 里说已修改。
- 用户要求“第 N 镜 / 镜头 N 用 Hyperframe / Hyperframes / Seedance 生成”时，必须先语义定位生成方式列，并在 rows patch 里写入该列的 column id；Hyperframes 写 Hyperframes，Seedance 写 Seedance 2.0。然后返回 regenerate_media，kind 为 video，rowRefs 指向目标分镜，overwriteExisting 为 true。
- 如果目标分镜的视频提示词为空、— 或 -，并且用户要求生成视频，必须同时语义定位视频提示词列，并在 rows patch 里写入该列的 column id；没有视频提示词时不要触发 regenerate_media。
- 用户要求“重新生成第 N 镜图片 / 生图 / 出图”，返回 regenerate_media，kind 为 image，rowRefs 指向目标分镜，overwriteExisting 为 true。
- 用户要求“重新生成第 N 镜视频 / 动画 / 动态画面”，返回 regenerate_media，kind 为 video，rowRefs 指向目标分镜，overwriteExisting 为 true。
- 用户要求“生成全部 / 所有 Hyperframes / Seedance 视频”时，必须返回一个 regenerate_media(kind="video")，rowRefs 覆盖当前分镜表中对应生成方式的全部非 A-ROLL 行；不要只在 reply 里说已经触发。
${dreaminaGeneration ? "" : `- 用户明确要求“使用即梦 CLI / Dreamina CLI 新生成图片或视频”时，必须由你理解目标镜头和素材类型后返回 regenerate_media，并把 provider 写为 dreamina_cli；不要在本轮直接运行即梦 CLI、不要调用 KIE，也不要声称已经开始生成。MkBoard 会先在 Agent 对话内展示统一确认卡片，确认后才启动受控生成。
- 用户说“同步 / 找回 / 下载 / 导入 / 放入分镜”已经由即梦 CLI 生成的结果时，不得返回 regenerate_media，也不得把它理解成重新生成。`}
- 如果目标镜头的生成方式是自定义，默认不要返回 regenerate_media；自定义表示用户会自行准备素材，除非用户明确要求先把生成方式改成 Seedance 2.0 或 Hyperframes 再生成。
- 不要直接调用图片、视频、数据库、文件或项目创建能力；MkBoard 会按 operations 执行并做权限校验。
- Agent 不允许创建新项目，不允许写入密钥，不允许绕过后端权限、订阅和积分校验。
`;
  const storyboardGenerationInstruction =
    mode === "storyboard-generation"
      ? `
## 一键生成分镜任务

这是用户点击「根据脚本拆分镜」触发的任务。必须遵守当前项目绑定的拆分分镜 Skill。

- 只生成 rows，scriptHtml 必须返回 null。
- operations 必须返回空数组。
- rows 必须是完整分镜行数组，核心是区分 A-ROLL / B-ROLL。
- 必须填充用户当前可见的分镜字段。排序和镜号由 MkBoard 根据 rows 顺序生成；画面列通过 imageAssetIds 关联素材，最多 10 个；没有明确素材 id 时返回空数组，并把画面描述写到 note。
- 必须根据当前分镜字段 JSON 语义定位图像提示词、视频提示词和生成方式列，并写入 customValues 中对应的 column id；不要使用可见列名作为 key。图像提示词和视频提示词没有内容时写 —。生成方式没有内容时写空字符串。
- 语言判定必须同时读取“用户选择的界面语言”和“当前脚本主语言”。row.content 必须保留原脚本语言，不要为了匹配界面语言而翻译台词。
- 如果脚本主语言明确是中文，拆分结果里生成的备注、图像提示词、视频提示词和 Hyperframes 可见文案要求必须使用中文；不要默认改成英文。
- 如果脚本主语言明确是英文，生成的备注、图像提示词、视频提示词和 Hyperframes 可见文案要求必须使用英文。
- 如果脚本为空、混合或主语言不明确，则使用用户选择的界面语言：zh-CN / zh-TW 输出中文，en 输出英文；没有可用界面语言时默认英文。
- 如果用户界面语言和脚本主语言冲突，脚本主语言优先用于分镜行、备注和生成提示词；界面语言只作为脚本不明确时的兜底信号。
- Seedance 2.0 行的图像提示词用于生成 ChatGPT Image2 / C-DAIS 2.0 四宫格参考图，必须明确要求只呈现 2x2 四宫格画面，不添加分镜 1、2、3、4 序号、镜头号、面板标题、字幕、旁白、说明文字、分镜图片描述、描述栏、水印或任何 UI 标注。
- Seedance 2.0 行的视频提示词必须明确说明“根据分镜图生成视频”或同义表达，因为后续会使用该镜头分镜图作为全能参考图生成视频。
- Seedance 2.0 和 Hyperframes 行的视频提示词都必须遵守统一规则：优先 1-3 个短句，只写景别/构图范围和发生了什么；有已绑定参考素材时不复述主体或场景；禁止 BGM，只保留匹配画面的动作/环境音效；Shot 之间硬切，不生成转场动画。
- Seedance 2.0 行的 row.duration 必须至少 10 秒，常规目标 12 秒；如果 row.content 较长或连续动作复杂，可延长到 13-15 秒。
- Hyperframes 行的 row.duration 必须在 10 到 20 秒之间；短文字卡/简单 MG 动画用 10 秒，中等旁白或多步骤动画用 12-15 秒，长旁白、密集数据/流程解释或多场景 UI 动画用 18-20 秒。
- 视频行的 duration 必须跟拆分后的 row.content 字数和视频提示词复杂度匹配，内容越长时长越长。
- 不要调用图片或视频生成 API。
- 不要写入文件或数据库；MkBoard 主进程会根据你返回的 JSON 写入项目。
- 不得使用本机或记忆中的其他 storyboard / video-storyboard Skill；下面注入的当前项目 Skill 是唯一业务规则。
`
      : "";

  return `# MkBoard local agent

你是 MkBoard 桌面端的本地分镜 Agent。你运行在用户本机的 ${agentName} 中，只能基于下面给出的项目上下文返回结构化 JSON。${dreaminaGeneration ? "本次存在一个已由用户确认的受控即梦 CLI 生成例外，严格按下方专用指令执行。" : "不要执行文件修改命令，也不要直接调用任何图片或视频生成 CLI/API；先用结构化 operations 表达操作意图，交给 MkBoard 做确认和执行。"}

## 对话可见输出语言

${visibleOutputLanguageContext}

## 输出规则

只返回 JSON，字段必须符合 schema：

- reply: 给用户看的简洁回复，说明你做了什么；必须使用“对话可见输出语言”。
- operations: 对话中需要写入脚本、分镜、素材或触发重生成时返回操作数组；普通问答返回空数组。
- scriptHtml: 兼容旧格式，除一键拆分镜或旧模型兼容外尽量返回 null。
- rows: 一键生成分镜任务返回完整分镜行数组；普通对话修改现有分镜单元格时返回 rows patch，让 MkBoard 自动 diff 写入数据库；普通问答返回 null。

顶层必须始终包含 reply、operations、scriptHtml、rows 四个字段；不使用时 operations 写 []，scriptHtml 写 null，rows 写 null。绝对不要返回空对象 {}。

如果用户只是提问，不需要修改数据，返回 reply，并把 operations 设为空数组，scriptHtml 与 rows 设为 null。

reply 可以包含一两句“可展示的判断依据 / 处理思路摘要”，例如你为什么选择修改单元格、触发重新解析或只回答问题；不要输出冗长的隐藏推理链。

当 operations 包含 regenerate_media 时，reply 必须简短说明已经识别出待执行的图片或视频生成操作。不要声称已经开始或完成生成；需要二次确认的操作会先由 MkBoard 在当前对话中展示确认卡片。

如果用户要求重新解析整张分镜表，返回 parse_storyboard 操作，不要返回 rows，也不要直接重写分镜表。reply 中可以简短说明你的判断依据和下一步会交给 MkBoard 的解析入口执行。

如果用户要求“生成某个镜头的视频 / 视频画面 / 动画 / 生图”，返回 regenerate_media 操作；如果生成前需要补齐类别、生成方式、图像提示词或视频提示词，同时返回 rows patch。不要用 rows 新增、删除或重排分镜。

${operationInstruction}
${dreaminaGenerationInstruction}
${storyboardGenerationInstruction}

## 当前 Tab

${tab}

## 当前对话上下文

下面是同一个 Agent 对话窗口内更早的消息。你必须把这些消息作为连续上下文处理；只有用户新建一个对话窗口时，才应该把上下文视为全新开始。

${conversationContext}

## 用户请求

${userRequest}

${internalTaskInstruction}

## 用户选择的界面语言

${interfaceLanguageContext}

## 用户本次附加图片

${attachmentContext}

## 当前脚本 HTML

${project.scriptHtml}

## 当前分镜表 JSON

${JSON.stringify(project.rows, null, 2)}

## 当前分镜字段 JSON

${JSON.stringify(project.columns, null, 2)}

## 当前项目比例

${project.imageRatio}

## 用户当前可见字段映射

${visibleStoryboardFieldMapping}

## 当前项目素材 JSON

${JSON.stringify(project.assets, null, 2)}

## 当前项目绑定的拆分分镜 Skill

来源：SQLite skills.${project.storyboardSkill.id}
名称：${project.storyboardSkill.name}
说明：${project.storyboardSkill.description}

<active_storyboard_skill>
${project.storyboardSkill.content}
</active_storyboard_skill>
`;
}

function buildHyperframesProjectPrompt(
  {
    project,
    row,
    prompt,
    imageRatio,
    hyperframesResolution,
    durationSec,
    referenceAssets = []
  }: { project: ProjectDetail; row: StoryboardRow; prompt: string; imageRatio: string; hyperframesResolution?: HyperframesVideoResolution; durationSec: number; referenceAssets?: HyperframesReferenceAsset[] },
  agentName: string,
  agentProjectDir?: string
): string {
  const resolution = hyperframesVideoDimensionsFromAspectRatio(imageRatio, hyperframesResolution);
  const tasteAwarePrompt = buildTasteAwareHyperframesPrompt(project, prompt);
  const tasteSkillContext = buildHyperframesTasteSkillContext(project);
  const visualLanguageContext = buildHyperframesVisualLanguageContext(project, row, prompt);
  const referenceAssetContext = describeHyperframesReferenceAssets(referenceAssets);
  return `# MkBoard HyperFrames project task

你运行在用户本机的 ${agentName} 中。请根据 MkBoard 分镜行生成一个可由官方 HyperFrames CLI 本机渲染的视频项目。

## 硬性要求

- 只返回 JSON，字段为 files。
- files 是数组，每项包含 path 和 content。
- 必须包含一个 path 严格等于 "index.html" 的文件，content 必须是非空完整 HTML；可以额外包含 DESIGN.md、visual-style.md 或 compositions/*.html。
- files 只允许包含 index.html、DESIGN.md、visual-style.md、hyperframes.json、meta.json、package.json、AGENTS.md、CLAUDE.md、compositions/* 或 assets/*。不要返回 STATUS、状态说明、日志或其他辅助文件。
- 不要只返回说明、计划、Markdown、文件名列表、空 files 数组或缺少 index.html 的 JSON。即使动画内容复杂，也要退化成更简洁但完整可渲染的 index.html + DESIGN.md。
- index.html 必须是完整 HTML 文档，包含 <!doctype html>、<html>、<head>、<body>。
- 按官方 HyperFrames standalone composition 写法：body 里直接放根节点，不要用 <template> 包住主 composition。
- 根节点必须有 id="root"、data-composition-id="main"、data-start="0"、data-duration="${durationSec}"、data-width="${resolution.width}"、data-height="${resolution.height}"。
- 每个带 data-start 的可见 timed element 都必须有 class="clip"、data-duration 和 data-track-index。
- 每个带 data-start 的可见 timed element 都必须有稳定、可读、唯一的 id，方便 HyperFrames Studio 和 inspect 定位。
- 注册 paused timeline：window.__timelines = window.__timelines || {}; window.__timelines["main"] = tl。该对象必须提供 pause()、seek() 和 duration()，供 HyperFrames 逐帧定位。
- index.html 必须完全自包含并可离线渲染。不要引用 GSAP CDN 或任何远程 script/import；如果项目没有本地 GSAP 文件，使用内联、确定性的 timeline 对象实现 pause()、seek() 和 duration()，并在 seek() 中根据时间更新元素状态。
- 不要引用远程脚本、远程样式、远程图片、远程字体、API、支付、对象存储或其他网络资源；不要 fetch；不要读写临时目录以外的文件。
- 正常交付方式是返回下面格式的 JSON。如果你使用工具实际落盘 HyperFrames 项目文件，只能写入 MkBoard 提供的临时目录：${agentProjectDir || "未提供"}；不要写到项目根目录或其他目录；最终仍必须返回完整 JSON。
- 不要引用远程字体，也不要裸写未声明 @font-face 的具名字体。无字体资产时，CSS font-family 必须使用通用本机字体族：正文/标题用 system-ui, sans-serif；衬线风格用 ui-serif, serif；等宽风格用 ui-monospace, monospace。
- 即使 Taste 提到 Noto Sans SC、Noto Serif SC、PingFang SC、Microsoft YaHei、Helvetica Neue、Inter、Playfair Display 等字体，也只能把它们理解为“无衬线/衬线/层级气质”参考，不得作为 font-family 的字面值输出。
- 不要通过 CSS 变量间接声明 font-family，例如 --font-body: "Noto Sans SC" 或 font-family: var(--font-body)；请直接写 lint 可识别的通用字体族。
- 不要写空资源路径，包括 src=""、href=""、url('')、url("")、data-composition-src=""、<source src="">。如果不需要外部素材，就不要创建 img/video/audio/source/link 标签。
- 如果下方“分镜绑定图片素材”不是“无”，最终视频画面必须实际包含每一张列出的图片。必须使用给定的 renderPath 作为 <img src="..."> 或 CSS background-image 路径，不得改名、不得用远程图替代、不得只把图片当作不可见预加载资源，也不得只用文字或矢量形状重新画一个近似 logo。
- 这些图片会由 MkBoard 在渲染前复制到 HyperFrames 项目根目录下的对应相对路径；你只需要引用 renderPath。
- 画幅：${imageRatio}。
- 输出分辨率档位：${describeHyperframesVideoResolution(hyperframesResolution)}。
- 像素尺寸：${resolution.width}x${resolution.height}。
- 目标时长：${durationSec} 秒。动画应在该时长内完成，末尾保持稳定画面。
- 当前 Animation Prompt 只作为镜头执行说明。提取其中的景别/构图范围和实际发生的画面变化，不要把比喻、情绪渲染、电影感散文、泛泛画质词或重复故事说明扩写进项目。
- 已提供的分镜绑定图片素材就是主体/场景参考。直接使用这些素材，不要再用可见文字或冗长设计说明重复描述它们的外观、场景、配色或风格。
- 不要生成、合成或嵌入 BGM、配乐、旋律或背景音乐。只有在当前提示词或本地素材明确提供可用音效时，才允许使用与画面动作/环境直接对应的音效；否则保持安静。
- 当前项目只负责一个独立 Shot。不要制作连接前后 Shot 的转场动画、转场素材、过渡镜头、片头或片尾式衔接；视频边界由 MkBoard 在后期直接硬切。单个 Shot 内表达内容所必需的元素动画可以保留。
- Visual direction: execute the injected HyperFrames Taste Skill below and prioritize the Taste bound to the current project. The Taste is the main design direction for this HyperFrames video.
- If the animation prompt conflicts with the Taste, follow the Taste's visual language, composition rules, typography and color preferences, and anti-pattern constraints.
- Return DESIGN.md or visual-style.md to record how this shot applies the Taste. Do not return index.html only.
- Keep text concise. Do not spread long prompts directly across the frame.
- Data-heavy, process-heavy, ecosystem-map, or long-duration shots must prefer a robust staged composition over many fragile micro-elements: use 3-5 clear phases, at most 4 prominent stat cards or nodes visible at once, short labels, and one stable final layout. Do not try to render every source phrase as visible text.
- If the prompt asks for many metrics/products/nodes, group them into tiers or rotating cards. It is better to return a simpler valid HyperFrames project than to overbuild and fail schema/lint/render.
- Layout must be inspect-safe: every visible text block needs its own stable zone, with at least 16px visual gap from other visible text at the same timestamp. Prefer CSS grid/flex columns, stacked rows, or staged enter/exit timing over absolute-positioned text clusters.
- Do not let text blocks overlap each other, even briefly during transitions. If two labels need to occupy the same region, show them in separate phases or fade one out before the other fades in.
- Do not use data-layout-allow-overlap to silence overlapping readable text. That attribute is only acceptable for purely decorative non-text layers where overlap is visually intentional.
- 分镜行 JSON 只作为内部语义上下文；不得把镜号、时长、scene、row id、字段名、表格标签或“SHOT 08 · 07秒 / 第 8 镜 / 07秒”这类分镜稿元信息做成可见画面。
- 视频画面只呈现动画提示词要求表达的内容。即使分镜行或视频提示词里带有镜号、时长或分镜标题，也只用于定位镜头和控制节奏，不得可视化；只有用户明确要求把倒计时、时长或镜号作为视频主体内容展示时才例外。
- 不要生成任何分镜标题、分镜编号、拍摄备注、表格边框、时间轴标记或 MkBoard 工作区 UI。
- 画面中所有可见文案必须遵守下方“画面语言”规则，不得默认改成英文。
- 视觉元素不要溢出 canvas 或带 overflow hidden 的容器；如果装饰性光圈、线条等确实需要溢出，给元素或父级添加 data-layout-allow-overflow。
- 只使用确定性逻辑；不要 Math.random()、Date.now() 或异步构建 timeline。

## 返回格式示例

{
  "files": [
    {
      "path": "index.html",
      "content": "<!doctype html>..."
    },
    {
      "path": "DESIGN.md",
      "content": "# Design\\n..."
    }
  ]
}

## 分镜行（仅内部上下文，不得直接渲染为画面文字）

${JSON.stringify(row, null, 2)}

## 分镜绑定图片素材

${referenceAssetContext}

${visualLanguageContext}

## Animation Prompt

${tasteAwarePrompt}

${tasteSkillContext}

## 当前项目名称

${project.project.name}
`;
}

function buildHyperframesProjectRepairPrompt(
  {
    project,
    row,
    prompt,
    imageRatio,
    hyperframesResolution,
    durationSec,
    referenceAssets = [],
    files,
    errorMessage
  }: {
    project: ProjectDetail;
    row: StoryboardRow;
    prompt: string;
    imageRatio: string;
    hyperframesResolution?: HyperframesVideoResolution;
    durationSec: number;
    referenceAssets?: HyperframesReferenceAsset[];
    files: HyperframesProjectFile[];
    errorMessage: string;
  },
  agentName: string,
  agentProjectDir?: string
): string {
  const resolution = hyperframesVideoDimensionsFromAspectRatio(imageRatio, hyperframesResolution);
  const tasteAwarePrompt = buildTasteAwareHyperframesPrompt(project, prompt);
  const tasteSkillContext = buildHyperframesTasteSkillContext(project);
  const visualLanguageContext = buildHyperframesVisualLanguageContext(project, row, prompt);
  const referenceAssetContext = describeHyperframesReferenceAssets(referenceAssets);
  return `# MkBoard HyperFrames project repair task

你运行在用户本机的 ${agentName} 中。MkBoard 已经生成了一个 HyperFrames 项目，但官方 HyperFrames CLI 检查失败。请根据错误输出修复项目文件，并只返回 JSON，字段为 files。

## 修复目标

- 修复 lint、validate 或 inspect 报错，不要绕过关键检查。
- 重点处理 text_overflow、text_clipped、content_overlap、canvas_overflow、container_overflow、元素溢出、空资源路径、缺失 timeline、缺失 composition 属性。
- 对非装饰性内容，优先缩小字体、减少文本、增加容器高度、调整布局或缩短动画位移，不要简单隐藏内容。
- 对 content_overlap，必须给可读文本拆出独立区域、增加间距、减少同屏文本、改成分阶段显示或缩短文案；不要给可读文本添加 data-layout-allow-overlap 来绕过检查。
- 修复后任意时间点同时可见的文字块之间至少保留 16px 视觉间距。避免多个绝对定位文本塞进同一个容器中心。
- 只有装饰性光圈、背景线条、入场/离场时刻确实需要越界时，才使用 data-layout-allow-overflow 或 data-layout-ignore。
- 必须移除已有的远程 script、import、stylesheet 和 CDN 依赖，尤其是 GSAP CDN；项目必须完全自包含并可离线 validate/render。没有本地 GSAP 文件时，改用内联、确定性的 timeline 对象实现 pause()、seek() 和 duration()。
- 不要新增远程脚本、远程样式、远程图片、远程字体、API、fetch、临时目录以外的文件读写或空 src/href/url。
- 正常交付方式是返回下面格式的 JSON。如果你使用工具实际落盘修复后的 HyperFrames 项目文件，只能写入 MkBoard 提供的临时目录：${agentProjectDir || "未提供"}；不要写到项目根目录或其他目录；最终仍必须返回完整 JSON。
- 必须修复 font_family_without_font_face：如果 CSS 里有 Noto Sans SC、Noto Serif SC、PingFang SC、Microsoft YaHei、Hiragino、Helvetica Neue、Inter、Playfair Display、-apple-system、BlinkMacSystemFont 等未声明 @font-face 的字体名，改成通用本机字体族 system-ui, sans-serif、ui-serif, serif 或 ui-monospace, monospace。
- 不要为了修复字体问题新增远程字体、空字体资源、local() @font-face 或不存在的 capture/assets/fonts 文件；无字体资产时只使用通用字体族。
- 根节点仍必须是 data-composition-id="main"，输出分辨率档位 ${describeHyperframesVideoResolution(hyperframesResolution)}，尺寸 ${resolution.width}x${resolution.height}，时长 ${durationSec} 秒。
- During fixes, continue executing the injected HyperFrames Taste Skill below and preserve the current project Taste's visual language. Do not change the frame into a generic default style just to pass checks.
- files 可以只包含本次实际修改的文件，MkBoard 会把它们合并到修复前的完整项目；每个返回文件仍必须提供完整内容，不能只返回 diff。
- 如果修复涉及 index.html，必须返回修复后的完整 index.html；不要在没有修改它时为了凑齐文件清单而原样重复返回。
- files 只允许包含 index.html、DESIGN.md、visual-style.md、hyperframes.json、meta.json、package.json、AGENTS.md、CLAUDE.md、compositions/* 或 assets/*。不要返回 STATUS、状态说明、日志或其他辅助文件。
- When returning files, preserve or add the Taste application note in DESIGN.md / visual-style.md.
- 修复时必须继续遵守“画面语言”规则。如果原项目把中文脚本翻成了英文可见文案，要改回中文。
- 修复时必须移除画面中的分镜稿元信息：镜号、时长、scene、row id、字段名、表格标签、SHOT 标题、拍摄备注、时间轴标记和 MkBoard 工作区 UI 都不能作为可见元素出现。即使原视频提示词里包含这些信息，也只用于定位镜头和控制节奏；只有用户明确要求把倒计时、时长或镜号作为视频主体内容展示时才例外。
- 修复后的最终视频必须是内容画面，不是分镜卡片或分镜表截图。
- 修复时移除 BGM、配乐、旋律和背景音乐。只有提示词或现有本地素材明确提供的动作/环境音效可以保留；没有对应音效时保持安静。
- 修复时移除连接前后 Shot 的转场动画、转场素材、过渡镜头、片头和片尾式衔接；当前视频是独立 Shot，边界由 MkBoard 后期硬切。不要误删 Shot 内表达内容所必需的元素动画。
- 如果下方“分镜绑定图片素材”不是“无”，修复后的最终视频画面必须继续实际包含每一张列出的图片，并继续使用给定的 renderPath；如果原项目遗漏了这些图片，必须补回。

## 官方 CLI 失败输出

\`\`\`text
${truncateForPrompt(errorMessage, 12_000)}
\`\`\`

## 原始分镜行（仅内部上下文，不得直接渲染为画面文字）

\`\`\`json
${JSON.stringify(row, null, 2)}
\`\`\`

## 分镜绑定图片素材

${referenceAssetContext}

${visualLanguageContext}

## Video Prompt

${tasteAwarePrompt}

${tasteSkillContext}

## 当前项目文件

${files
  .map(
    (file) => `### ${file.path}

\`\`\`${file.path.endsWith(".html") ? "html" : file.path.endsWith(".json") ? "json" : "text"}
${truncateForPrompt(file.content, 40_000)}
\`\`\``
  )
  .join("\n\n")}

## 返回格式

{
  "files": [
    {
      "path": "index.html",
      "content": "<!doctype html>..."
    }
  ]
}
`;
}

function buildTasteAwareHyperframesPrompt(project: ProjectDetail, prompt: string): string {
  return `${prompt.trim()}

## Additional Taste Constraints

- Current project Taste: ${project.taste.name}
- Taste description: ${project.taste.description || "None"}
- Preview palette: ${JSON.stringify(project.taste.preview)}
- When generating this HyperFrames shot, merge the Taste above into the animation prompt as the main visual direction.
- If the visual idea in this prompt conflicts with the Taste, preserve the shot's expressive goal but use the Taste's composition, typography and hierarchy, color, spacing, motion rhythm, and anti-pattern constraints.`;
}

function buildHyperframesVisualLanguageContext(project: ProjectDetail, row: StoryboardRow, prompt: string): string {
  const scriptText = stripAgentHtml(project.scriptHtml);
  const fallbackText = [row.content, row.note, prompt].map((value) => value.trim()).filter(Boolean).join("\n");
  const sourceText = scriptText || fallbackText;
  const language = inferStoryboardVisualLanguage(sourceText);
  const excerpt = truncateForPrompt(sourceText, 2_000) || "无可用脚本文本；按分镜行和视频提示词语言执行。";

  return `## 画面语言

- 自动判断来源：${scriptText ? "当前脚本" : "当前分镜行和视频提示词"}
- 自动判断结果：${language.label}
- 执行规则：${language.instruction}
- 所有出现在视频画面里的标题、字幕、标签、按钮、数据说明、步骤名、注释和装饰性文字，都必须使用该画面语言。
- 不得因为 HyperFrames 示例、Taste 文档、CSS 类名、变量名或 Agent 默认习惯，把可见文案改成英文。
- 专有名词、产品名、代码标识、模型名和用户原文中的英文短语可以保留，但不能把整段中文脚本翻译成英文画面。

### 脚本/分镜语言判断文本

\`\`\`text
${excerpt}
\`\`\``;
}

function inferStoryboardVisualLanguage(input: string): { label: string; instruction: string } {
  const text = input.trim();
  const hanCount = countMatches(text, /[\u3400-\u9FFF\uF900-\uFAFF]/gu);
  const kanaCount = countMatches(text, /[\u3040-\u30FF]/gu);
  const hangulCount = countMatches(text, /[\uAC00-\uD7AF]/gu);
  const latinCount = countMatches(text, /[A-Za-z]/g);

  if (hangulCount >= 8 && hangulCount > hanCount + kanaCount) {
    return { label: "韩语", instruction: "视频画面文案使用韩语；不要默认生成英文文案。" };
  }
  if (kanaCount >= 4 && kanaCount + hanCount >= latinCount) {
    return { label: "日语", instruction: "视频画面文案使用日语；不要默认生成英文文案。" };
  }
  if (hanCount >= 4 && hanCount >= Math.max(2, latinCount * 0.25)) {
    return { label: "中文", instruction: "视频画面文案使用中文；如果原脚本是中文，标题、标签、字幕和步骤说明都必须是中文。" };
  }
  if (latinCount >= 12) {
    return { label: "英文", instruction: "视频画面文案使用英文，并保留用户原文中的专有名词。" };
  }
  return { label: "脚本主语言", instruction: "根据当前脚本、分镜行和视频提示词的主语言生成画面文案；不要默认切换成英文。" };
}

function countMatches(input: string, pattern: RegExp): number {
  return Array.from(input.matchAll(pattern)).length;
}

function stripAgentHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/giu, "")
    .replace(/<script[\s\S]*?<\/script>/giu, "")
    .replace(/<[^>]+>/gu, "\n")
    .replace(/&nbsp;/gu, " ")
    .replace(/&amp;/gu, "&")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, "\"")
    .replace(/&#39;/gu, "'")
    .replace(/\s+/gu, " ")
    .trim();
}

function buildHyperframesTasteSkillContext(project: ProjectDetail): string {
  const isAutoAdaptiveTaste = project.taste.id === defaultTasteId || !project.taste.content.trim();
  const activeSkillId = project.storyboardSkill?.id ?? "";
  const skillrySlug =
    activeSkillId === "skill-skillry-bs-creatormotion"
      ? ("bs-creatormotion" as const)
      : activeSkillId === "skill-skillry-bs-launchmotion"
        ? ("bs-launchmotion" as const)
        : null;
  const skillryInfo = skillrySlug ? findInstalledSkillryPackPaths(skillrySlug) : null;

  const skillrySection =
    skillrySlug && skillryInfo?.primarySkillMdPath
      ? `

## Active Skillry Motion Pack (${skillrySlug})

Local Skill Directory: ${skillryInfo.installedPaths[0] ?? ""}
Local SKILL.md: ${skillryInfo.primarySkillMdPath}
Guidance: Prefer reading and following the motion structure, typography, and palette conventions from this installed Skillry pack when building the HyperFrames composition, while ensuring the final returned HyperFrames project is self-contained inside the output JSON / temp directory.`
      : "";

  if (isAutoAdaptiveTaste) {
    return `## HyperFrames Adaptive Visual Direction

The project uses Auto-Adaptive style mode (no hardcoded preset style override).
Design a clean, high-contrast, editorial HyperFrames composition that matches the shot prompt, script context, and active project skill (${project.storyboardSkill?.name || "Default"}).${skillrySection}`;
  }

  return `## HyperFrames Taste Skill Bound to the Current Task

Source: MkBoard built-in Skill
Name: ${hyperframesTasteSkillName}
Description: ${hyperframesTasteSkillDescription}

<active_hyperframes_taste_skill>
${hyperframesTasteSkill}
</active_hyperframes_taste_skill>

## Current Project Custom / Imported Style

Source: ${project.taste.sourceUrl || `SQLite tastes.${project.taste.id}`}
Name: ${project.taste.name}
Description: ${project.taste.description}
Preview palette: ${JSON.stringify(project.taste.preview)}

<active_project_taste>
${truncateForPrompt(project.taste.content, 30_000)}
</active_project_taste>${skillrySection}`;
}

function resolveHyperframesAgentTimeoutMs(): number {
  const raw = process.env.MKBOARD_HYPERFRAMES_AGENT_TIMEOUT_MS?.trim() || process.env.MKBOARD_CODEX_VIDEO_TIMEOUT_MS?.trim();
  const value = raw ? Number(raw) : DEFAULT_HYPERFRAMES_AGENT_TIMEOUT_MS;
  if (!Number.isFinite(value)) return DEFAULT_HYPERFRAMES_AGENT_TIMEOUT_MS;
  return Math.max(180_000, Math.min(2 * 60 * 60_000, Math.round(value)));
}

function truncateForPrompt(input: string, limit: number): string {
  if (input.length <= limit) return input;
  return `${input.slice(0, limit)}\n\n[truncated ${input.length - limit} chars]`;
}

function parseHyperframesProjectJson(input: string): unknown {
  const parsed = safeParseJson(input);
  if (isRecord(parsed) || Array.isArray(parsed)) return parsed;
  const jsonText = extractJsonObject(input);
  return jsonText ? safeParseJson(jsonText) : parsed;
}

function parseOrRecoverHyperframesProjectFiles(
  rawOutput: string,
  agentName: string,
  project: ProjectDetail,
  agentProjectDir?: string,
  baseFiles: HyperframesProjectFile[] = []
): HyperframesProjectFile[] {
  let parseError: unknown;
  try {
    const parsed = parseHyperframesProjectJson(rawOutput);
    const returnedFiles = normalizeHyperframesProjectFileEntries(parsed, agentName);
    const files = baseFiles.length > 0 ? mergeHyperframesProjectFiles(baseFiles, returnedFiles) : returnedFiles;
    return ensureHyperframesTasteDesignFile(requireHyperframesIndexFile(files, agentName), project);
  } catch (error) {
    parseError = error;
  }

  const recoveredFiles = recoverHyperframesProjectFilesFromDirectory(agentProjectDir);
  if (recoveredFiles.length > 0) {
    const files = baseFiles.length > 0 ? mergeHyperframesProjectFiles(baseFiles, recoveredFiles) : recoveredFiles;
    try {
      return ensureHyperframesTasteDesignFile(requireHyperframesIndexFile(files, agentName), project);
    } catch (error) {
      parseError = error;
    }
  }

  if (parseError instanceof Error) throw parseError;
  throw new Error(`${agentName} 没有返回可解析的 HyperFrames 项目 JSON。`);
}

function recoverHyperframesProjectFilesFromDirectory(agentProjectDir?: string): HyperframesProjectFile[] {
  if (!agentProjectDir || !existsSync(agentProjectDir)) return [];

  const rawFiles = collectRecoveredHyperframesProjectFiles(agentProjectDir);
  const filesByPath = new Map<string, HyperframesProjectFile>();

  for (const file of rawFiles) {
    const normalized = normalizeHyperframesProjectFile(file);
    if (!normalized.path || !normalized.content.trim()) continue;
    const current = filesByPath.get(normalized.path);
    if (!current || file.path === normalized.path) {
      filesByPath.set(normalized.path, normalized);
    }
  }

  return Array.from(filesByPath.values());
}

function collectRecoveredHyperframesProjectFiles(rootDir: string, currentDir = rootDir, depth = 0): HyperframesProjectFile[] {
  if (depth > HYPERFRAMES_RECOVERED_PROJECT_MAX_DEPTH) return [];

  const files: HyperframesProjectFile[] = [];
  let entries: Dirent[];
  try {
    entries = readdirSync(currentDir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    if (files.length >= HYPERFRAMES_RECOVERED_PROJECT_MAX_FILES) break;
    if (shouldSkipRecoveredHyperframesEntry(entry.name)) continue;

    const absolutePath = join(currentDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectRecoveredHyperframesProjectFiles(rootDir, absolutePath, depth + 1));
      continue;
    }
    if (!entry.isFile()) continue;

    const projectPath = relative(rootDir, absolutePath).replace(/\\/gu, "/");
    if (!isRecoverableHyperframesTextPath(projectPath)) continue;

    let size = 0;
    try {
      size = statSync(absolutePath).size;
    } catch {
      continue;
    }
    if (size <= 0 || size > HYPERFRAMES_RECOVERED_PROJECT_MAX_FILE_BYTES) continue;

    let content = "";
    try {
      content = readFileSync(absolutePath, "utf8");
    } catch {
      continue;
    }
    if (!content.trim() || content.includes("\u0000")) continue;
    files.push({ path: projectPath, content });
  }

  return files;
}

function shouldSkipRecoveredHyperframesEntry(name: string): boolean {
  return name === "node_modules" || name === "renders" || name === ".git" || name === ".thumbnails" || name === ".DS_Store";
}

function isRecoverableHyperframesTextPath(path: string): boolean {
  const normalized = normalizeGeneratedHyperframesProjectPath(path);
  if (isAllowedHyperframesTopLevelFile(normalized) || isHyperframesCompositionSubpath(normalized)) return true;
  if (!isHyperframesAssetSubpath(normalized)) return false;
  return /\.(css|html|js|json|md|mjs|svg|txt)$/iu.test(normalized);
}

function normalizeHyperframesProjectFileEntries(parsed: unknown, agentName: string): HyperframesProjectFile[] {
  if (!isRecord(parsed) && !Array.isArray(parsed)) {
    throw new Error(`${agentName} 没有返回可解析的 HyperFrames 项目 JSON。`);
  }

  if (isRecord(parsed) && typeof parsed.html === "string" && parsed.html.trim()) {
    return [{ path: "index.html", content: normalizeHtmlDocument(parsed.html) }];
  }

  const rawFiles = collectHyperframesProjectFileEntries(parsed);
  if (rawFiles.length === 0) {
    throw new Error(`${agentName} 没有返回 HyperFrames 项目文件。`);
  }

  const files = rawFiles
    .map((file) => normalizeHyperframesProjectFile(file))
    .filter((file) => file.path && file.content.trim() && looksLikeHyperframesFilePath(file.path));

  if (files.length === 0) {
    throw new Error(`${agentName} 没有返回有效的 HyperFrames 项目文件。`);
  }

  return files;
}

function requireHyperframesIndexFile(files: HyperframesProjectFile[], agentName: string): HyperframesProjectFile[] {
  if (!files.some((file) => normalizeProjectPathForCheck(file.path) === "index.html")) {
    throw new Error(`${agentName} 返回的 HyperFrames 项目缺少 index.html。`);
  }

  return files;
}

export function mergeHyperframesProjectFiles(baseFiles: HyperframesProjectFile[], returnedFiles: HyperframesProjectFile[]): HyperframesProjectFile[] {
  const filesByPath = new Map<string, HyperframesProjectFile>();
  for (const file of [...baseFiles, ...returnedFiles]) {
    const normalized = normalizeHyperframesProjectFile(file);
    if (!normalized.path || !normalized.content.trim() || !looksLikeHyperframesFilePath(normalized.path)) continue;
    filesByPath.set(normalized.path, normalized);
  }
  return Array.from(filesByPath.values());
}

function collectHyperframesProjectFileEntries(parsed: Record<string, unknown> | unknown[]): HyperframesProjectFile[] {
  if (Array.isArray(parsed)) return parsed.flatMap(readHyperframesProjectFileEntry);

  const filesValue = parsed.files;
  if (Array.isArray(filesValue)) return filesValue.flatMap(readHyperframesProjectFileEntry);
  if (isRecord(filesValue)) return readHyperframesFileMap(filesValue);

  const directFile = readHyperframesProjectFileEntry(parsed);
  if (directFile.length > 0) return directFile;

  return readHyperframesFileMap(parsed);
}

function readHyperframesProjectFileEntry(input: unknown): HyperframesProjectFile[] {
  if (!isRecord(input)) return [];
  const path = readHyperframesFilePath(input);
  const content = readHyperframesFileContent(input);
  return path && content ? [{ path, content }] : [];
}

function readHyperframesFileMap(input: Record<string, unknown>): HyperframesProjectFile[] {
  return Object.entries(input).flatMap(([path, value]) => {
    if (!looksLikeHyperframesFilePath(path)) return [];
    if (typeof value === "string") return [{ path, content: value }];
    if (!isRecord(value)) return [];
    const content = readHyperframesFileContent(value);
    return content ? [{ path: readHyperframesFilePath(value) || path, content }] : [];
  });
}

function readHyperframesFilePath(input: Record<string, unknown>): string {
  for (const key of ["path", "filePath", "filepath", "filename", "name"]) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function readHyperframesFileContent(input: Record<string, unknown>): string {
  for (const key of ["content", "contents", "html", "source", "text", "code"]) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

function normalizeHyperframesProjectFile(file: HyperframesProjectFile): HyperframesProjectFile {
  const path = normalizeGeneratedHyperframesProjectPath(file.path);
  return {
    path,
    content: path === "index.html" ? normalizeHtmlDocument(file.content) : file.content
  };
}

function normalizeGeneratedHyperframesProjectPath(input: string): string {
  const projectPath = normalizeProjectPathForCheck(input);
  if (!projectPath) return "";
  const parts = projectPath.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return "";
  const fileName = parts[parts.length - 1] ?? "";
  if (parts.length > 1 && isAllowedHyperframesTopLevelFile(fileName) && !isHyperframesAssetSubpath(projectPath) && !isHyperframesCompositionSubpath(projectPath)) {
    return fileName;
  }
  const rootIndex = parts.findIndex((part) => part === "compositions" || part === "assets");
  if (rootIndex >= 0) return parts.slice(rootIndex).join("/");
  return projectPath;
}

function looksLikeHyperframesFilePath(path: string): boolean {
  const normalized = normalizeGeneratedHyperframesProjectPath(path);
  return isAllowedHyperframesTopLevelFile(normalized) || isHyperframesCompositionSubpath(normalized) || isHyperframesAssetSubpath(normalized);
}

function isAllowedHyperframesTopLevelFile(path: string): boolean {
  return path === "index.html" || path === "DESIGN.md" || path === "visual-style.md" || path === "hyperframes.json" || path === "meta.json" || path === "package.json" || path === "AGENTS.md" || path === "CLAUDE.md";
}

function isHyperframesCompositionSubpath(path: string): boolean {
  return /^compositions\/[A-Za-z0-9._/-]+$/u.test(path);
}

function isHyperframesAssetSubpath(path: string): boolean {
  return /^assets\/[A-Za-z0-9._/-]+$/u.test(path);
}

function ensureHyperframesTasteDesignFile(files: HyperframesProjectFile[], project: ProjectDetail): HyperframesProjectFile[] {
  const hasTasteDesignFile = files.some((file) => {
    const projectPath = normalizeProjectPathForCheck(file.path).toLowerCase();
    return projectPath === "design.md" || projectPath === "visual-style.md";
  });
  if (hasTasteDesignFile) return files;

  return [
    ...files,
    {
      path: "DESIGN.md",
      content: buildFallbackHyperframesTasteDesignFile(project)
    }
  ];
}

function buildFallbackHyperframesTasteDesignFile(project: ProjectDetail): string {
  return `# MkBoard HyperFrames Taste

This file was added by MkBoard because the generated HyperFrames project did not include a Taste design note.

## Applied Skill

- Skill: ${hyperframesTasteSkillName}
- Purpose: ${hyperframesTasteSkillDescription}

## Project Taste

- Taste: ${project.taste.name}
- Description: ${project.taste.description || "None"}
- Preview palette:

\`\`\`json
${JSON.stringify(project.taste.preview, null, 2)}
\`\`\`

## Generation Contract

- Treat the project Taste as the primary visual direction for this HyperFrames composition.
- Preserve the shot intent from the storyboard row and video prompt.
- If the shot prompt conflicts with Taste, keep the shot goal but use Taste for composition, typography, color, spacing, motion, and anti-pattern constraints.`;
}

function normalizeProjectPathForCheck(input: string): string {
  return input.replace(/\\/gu, "/").trim().replace(/^(\.\/)+/u, "").replace(/^\/+/u, "");
}

function normalizeHtmlDocument(html: string): string {
  const trimmed = html.trim();
  if (/<!doctype html>|<html[\s>]/iu.test(trimmed)) return trimmed;
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MkBoard HyperFrames</title>
</head>
<body>
${trimmed}
</body>
</html>`;
}

function describeHyperframesVideoResolution(resolution?: HyperframesVideoResolution): string {
  if (resolution === "2k") return "2K";
  if (resolution === "4k") return "4K";
  return "1080p";
}

function describeAgentAttachments(attachments: ProjectDetail["assets"]): string {
  const imageAttachments = attachments.filter((asset) => asset.kind === "image");
  if (imageAttachments.length === 0) return "无。";
  return [
    "这些图片是用户点击对话输入框「+」后为本次请求选择的参考图。路径均相对当前项目根目录；当前版本只支持图片附件。",
    ...imageAttachments.map((asset, index) =>
      `- 图片 ${index + 1}: ${asset.name}\n  - assetId: ${asset.id}\n  - path: ${asset.indexedPath || asset.localPath}`
    )
  ].join("\n");
}

function describeHyperframesReferenceAssets(referenceAssets: HyperframesReferenceAsset[]): string {
  if (referenceAssets.length === 0) return "无。";
  return [
    "以下图片来自当前分镜行的画面素材列。它们会在渲染前被 MkBoard 复制到 HyperFrames 项目目录中；renderPath 是必须使用的项目内相对路径。",
    ...referenceAssets.map((asset, index) =>
      `- 图片 ${index + 1}: ${asset.name}\n  - assetId: ${asset.assetId}\n  - sourcePath: ${asset.sourcePath}\n  - renderPath: ${asset.renderPath}`
    )
  ].join("\n");
}

function describeStoryboardColumns(columns: StoryboardColumn[]): string {
  const visibleColumns = columns.filter((column) => column.visible);
  if (visibleColumns.length === 0) return "- 当前没有可见分镜列；仍需返回完整 rows。";

  return visibleColumns.map((column) => `- ${column.label}（${column.id}，${column.type}）：${storyboardColumnAgentMapping(column)}`).join("\n");
}

function storyboardColumnAgentMapping(column: StoryboardColumn): string {
  if (column.id === "sort") return "由 MkBoard 根据 rows 顺序显示，不需要在 row 中额外写入。";
  if (column.id === "shot") return "由 MkBoard 根据 rows 顺序重新编号；row.shot 可写为空字符串或顺序号。";
  if (column.id === "image") return "通过 row.imageAssetIds 关联当前项目素材 id 数组，最多 10 个；没有明确素材时必须返回空数组，画面描述写入 row.note。";
  if (column.id === "scene") return "写入 row.scene，作为镜头类别使用，只填 A-ROLL 或 B-ROLL；不要把中景、近景、全景、特写等景别写到这一列。";
  if (column.id === "duration") return "写入 row.duration；A-ROLL、ChatGPT Image2 和自定义行按内容节奏估算；Seedance 2.0 视频行至少 10 秒、常规目标 12 秒、长内容可到 15 秒；Hyperframes 视频行必须在 10 到 20 秒之间，并按 row.content 字数和动画复杂度延长。";
  if (column.id === "content") return "写入 row.content，保留原台词并按语义拆分。";
  if (column.id === "note") return "写入 row.note；A-ROLL 以“人物口播：”开头，B-ROLL 写素材类型、画面描述和制作建议。";
  if (isStoryboardImagePromptColumn(column)) {
    return `写入 row.customValues["${column.id}"]；A-ROLL 写 —；ChatGPT Image2 镜头填写静态图提示词；Seedance 2.0 镜头必须填写 ChatGPT Image2 / C-DAIS 2.0 四宫格参考图提示词，并明确要求只呈现 2x2 四宫格画面，不添加分镜 1、2、3、4 序号、镜头号、面板标题、字幕、旁白、说明文字、分镜图片描述、描述栏、水印或任何 UI 标注；Hyperframes 和自定义镜头没有明确四格分镜需求时写 —。`;
  }
  if (isStoryboardVideoPromptColumn(column)) {
    return `写入 row.customValues["${column.id}"]；A-ROLL 写 —；只给 Seedance 2.0 或 Hyperframes 镜头填写。ChatGPT Image2 图片镜头和自定义素材镜头不需要视频提示词时写 —。每条视频提示词优先 1-3 个短句，只写景别/构图范围和发生了什么；已绑定参考素材时不复述主体或场景；禁止 BGM，只保留动作/环境音效；Shot 之间硬切，不生成转场动画。Seedance 2.0 视频提示词必须明确 10 秒以上、常规 12 秒，并随长内容延长到 15 秒以内；Hyperframes 动画提示词必须明确 10 到 20 秒，并随 row.content 字数和动画复杂度延长。Hyperframes 动画提示词也写在这里，并且必须写清画面文案语言：脚本语言明确时优先脚本语言；脚本为空、混合或不明确时使用用户选择的界面语言；没有可用信号时默认英文。中文脚本不得默认英文，英文脚本不得默认中文。`;
  }
  if (isStoryboardGenerationMethodColumn(column)) {
    return `写入 row.customValues["${column.id}"]；A-ROLL 写空字符串；B-ROLL 只能从 ChatGPT Image2、Seedance 2.0、Hyperframes、自定义中选择一个，并且要逐条自动判断。静态关键画面选 ChatGPT Image2；真实动态、镜头运动、人物/物体动作选 Seedance 2.0；抽象信息、文字卡片、数据图表、流程解释、UI/MG 动画才选 Hyperframes；用户明确已有或自行准备素材时选自定义，自定义默认不进入自动视频生成。不要把所有 B-ROLL 默认写成 Hyperframes。`;
  }
  return `写入 row.customValues["${column.id}"]；没有内容时写空字符串，由 MkBoard UI 显示 placeholder。`;
}

function buildConversationTitlePrompt(messages: AgentMessage[], interfaceLanguage?: InterfaceLanguage): string {
  const transcript = messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(0, 6)
    .map((message) => {
      const role = message.role === "user" ? "用户" : "Agent";
      return `${role}: ${message.content.replace(/\s+/g, " ").trim().slice(0, 1200)}`;
    })
    .join("\n");
  const titleLanguageInstruction =
    interfaceLanguage === "en"
      ? "Generate the chat title in English."
      : interfaceLanguage === "zh-TW"
        ? "請生成繁體中文會話標題。"
        : "请生成简体中文会话标题。";
  const fallbackTitle = interfaceLanguage === "en" ? "New chat" : interfaceLanguage === "zh-TW" ? "新對話" : "新对话";

  return `# MkBoard conversation title

${titleLanguageInstruction}

规则：
- 只返回 JSON，格式为 {"title":"标题"}。
- 标题必须是一句话式短标题，不超过 10 个汉字或 6 个英文单词。
- 不要使用 icon、emoji、引号、书名号、冒号或解释文字。
- 如果信息不足，返回 "${fallbackTitle}"。

## 对话

${transcript}
`;
}

function parseConversationTitle(input: string, interfaceLanguage?: InterfaceLanguage): string {
  const jsonText = extractJsonObject(input);
  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText) as { title?: unknown };
      if (typeof parsed.title === "string") return normalizeConversationTitle(parsed.title, interfaceLanguage);
    } catch {
      // Fall back to treating the assistant text itself as the title.
    }
  }
  return normalizeConversationTitle(input, interfaceLanguage);
}

function normalizeConversationTitle(input: string, interfaceLanguage?: InterfaceLanguage): string {
  const normalized = input
    .replace(/```[\s\S]*?```/g, "")
    .replace(/["'“”‘’《》`]/g, "")
    .replace(/[。！？!?，,；;：:、|/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized || legacyDefaultAgentConversationTitles.includes(normalized as (typeof legacyDefaultAgentConversationTitles)[number])) return defaultAgentConversationTitle;
  const maxLength = interfaceLanguage === "en" ? 40 : 10;
  return Array.from(normalized).slice(0, maxLength).join("");
}

function extractJsonObject(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (match?.[1]?.trim().startsWith("{")) return match[1].trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return null;
}

function containsCompleteJsonObject(input: string): boolean {
  const jsonText = extractJsonObject(input);
  if (!jsonText) return false;
  return isNonEmptyRecord(safeParseJson(jsonText));
}

function containsStructuredAgentResultObject(input: string): boolean {
  const jsonText = extractJsonObject(input);
  if (!jsonText) return false;
  const parsed = safeParseJson(jsonText);
  return isRecord(parsed) && "reply" in parsed && ("rows" in parsed || "operations" in parsed || "scriptHtml" in parsed);
}

export function isRecoverableHyperframesProjectResult(input: string): boolean {
  const jsonText = extractJsonObject(input);
  if (!jsonText) return false;
  const parsed = safeParseJson(jsonText);
  if (!isRecord(parsed) && !Array.isArray(parsed)) return false;
  if (isRecord(parsed) && typeof parsed.html === "string" && parsed.html.trim()) return true;
  return collectHyperframesProjectFileEntries(parsed).some(
    (file) => Boolean(file.path.trim() && file.content.trim() && looksLikeHyperframesFilePath(file.path))
  );
}

const hyperframesProjectSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    files: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: { type: "string" },
          content: { type: "string" }
        },
        required: ["path", "content"]
      }
    }
  },
  required: ["files"]
};

const conversationTitleSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string", maxLength: 10 }
  },
  required: ["title"]
};
