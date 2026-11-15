import { execFile, spawn } from "node:child_process";
import { accessSync, constants, existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, delimiter, dirname, isAbsolute, join, resolve } from "node:path";
import crossSpawn from "cross-spawn";
import type { AgentCliId, AgentModelPreset, CodexCliStatus, LocalCliAgent, LocalCliAgentRole, LocalCliDiagnostic, LocalCliInstallStep } from "../shared";
import { loadCliAgentDefinitions, type DeclarativeCliAgentDefinition, type RuntimeAgentProtocol } from "./agent-registry";
import { bundledRuntimeSpawnEnv, bundledRuntimeVersionSummary, resolveBundledRuntime, verifyBundledRuntimeIntegrity } from "./bundled-runtime";

type ExecResult = {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  error?: Error;
};

export type CodexExecutableProbe = {
  bin: string;
  launchBin: string;
  launchPathPrepend: string[];
  version: string;
  diagnostic?: string;
};

export type AgentCliExecutableProbe = {
  id: AgentCliId;
  name: string;
  protocol: RuntimeAgentProtocol;
  customArgs?: string[];
  bin: string;
  launchBin: string;
  launchPathPrepend: string[];
  version: string;
  diagnostic?: string;
};

type LocalExecutableProbe = {
  bin: string;
  launchPathPrepend: string[];
  version: string;
};

type ExecutableCandidateProbe = {
  bin: string;
  pathPrepend: string[];
};

type VersionedExecutableProbe = ExecutableCandidateProbe & {
  version: string;
};

type LocalCliAgentDefinition = {
  id: string;
  name: string;
  command: string;
  role: LocalCliAgentRole;
  aliases?: string[];
  versionArgs?: string[];
  versionArgSets?: string[][];
  configuredPathEnv?: string;
  installCommand?: string;
  loginCommand?: string;
  installSteps?: LocalCliInstallStep[];
  setupHint?: string;
  autoSetup?: string;
  protocol?: RuntimeAgentProtocol;
  models?: AgentModelPreset[];
  supportsEffort?: boolean;
  customArgs?: string[];
  installUrl?: string;
  docsUrl?: string;
  guideUrl?: string;
};

type ClaudeCodeApiUsageAuth = {
  detail: string;
};

const mkboardLocalCliGuideUrl = "https://mkboard.app/docs/install";
const hyperframesCliGuideUrl = "https://hyperframes.heygen.com/packages/cli";
const claudeCodeApiUsageEnvKeys = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN"];
const claudeCodeDiagnosticEnvKeys = [...claudeCodeApiUsageEnvKeys, "ANTHROPIC_BASE_URL"];

function getLocalCliAgentDefinitions(): DeclarativeCliAgentDefinition[] {
  return loadCliAgentDefinitions();
}

export async function getCodexCliStatus(): Promise<CodexCliStatus> {
  const probe = await resolveCodexExecutable();
  if (!probe) {
    return {
      state: "not_installed",
      label: "未找到 Codex CLI",
      detail: "请先安装 Codex CLI，或通过 CODEX_BIN 指定 codex 可执行文件路径。"
    };
  }

  const status = await execCodex(probe.launchBin, ["login", "status"], 6000, codexSpawnEnv(probe.launchPathPrepend));
  const output = compactOutput(status.stdout, status.stderr);

  if (status.code === 0 && /logged in/i.test(output)) {
    return {
      state: "connected",
      label: "Codex CLI 已连接",
      detail: appendDiagnostic(output || "已检测到 Codex CLI 登录态。", probe.diagnostic),
      path: probe.bin,
      version: probe.version
    };
  }

  if (looksLikeAuthMissing(output) || status.code !== 0) {
    return {
      state: "needs_auth",
      label: "Codex CLI 未授权",
      detail: appendDiagnostic(output || "请连接本机 Codex CLI 登录态。", probe.diagnostic),
      path: probe.bin,
      version: probe.version
    };
  }

  return {
    state: "error",
    label: "无法确认 Codex CLI 状态",
    detail: appendDiagnostic(output || "Codex CLI 已安装，但登录状态无法识别。", probe.diagnostic),
    path: probe.bin,
    version: probe.version
  };
}

export async function startCodexCliLogin(): Promise<CodexCliStatus> {
  const currentStatus = await getCodexCliStatus();
  if (currentStatus.state === "connected" || currentStatus.state === "not_installed") return currentStatus;

  const probe = await resolveCodexExecutable();
  if (!probe) {
    return {
      state: "not_installed",
      label: "未找到 Codex CLI",
      detail: "请先安装 Codex CLI，或通过 CODEX_BIN 指定 codex 可执行文件路径。"
    };
  }

  try {
    await openLoginTerminal(probe.launchBin, ["login", "--device-auth"], "MkBoard Codex Login", "完成后回到 MkBoard 点击刷新状态。");
    return {
      state: "needs_auth",
      label: "已打开 Codex CLI 授权终端",
      detail: appendDiagnostic("请在新打开的终端窗口中完成 `codex login --device-auth`，完成后回到 MkBoard 点击刷新状态。", probe.diagnostic),
      path: probe.bin,
      version: probe.version
    };
  } catch (error) {
    return {
      state: "error",
      label: "无法打开 Codex CLI 授权",
      detail: error instanceof Error ? error.message : String(error),
      path: probe.bin,
      version: probe.version
    };
  }
}

export async function startClaudeCodeLogin(): Promise<LocalCliAgent> {
  const definition = getLocalCliAgentDefinitions().find((agent) => agent.id === "claude-code");
  if (!definition) {
    throw new Error("Claude Code 定义不存在。");
  }

  const currentAgent = await probeLocalCliAgent(definition);
  if (currentAgent.connectionState === "connected" || !currentAgent.installed) return currentAgent;

  const probe = await resolveLocalCliExecutable(definition);
  if (!probe) {
    return {
      id: definition.id,
      name: definition.name,
      command: definition.command,
      role: definition.role,
      installed: false,
      connectionState: "not_installed",
      connectionLabel: "未找到 Claude Code",
      connectionDetail: "请先安装 Claude Code，或通过 CLAUDE_BIN 指定 claude 可执行文件路径。",
      diagnostics: [
        {
          state: "failed",
          label: "Claude Code CLI",
          detail: "没有在 PATH 或 CLAUDE_BIN 中找到 claude。"
        }
      ],
      ...localCliAgentMetadata(definition)
    };
  }

  try {
    await openLoginTerminal(probe.bin, ["auth", "login"], "MkBoard Claude Login", "完成后回到 MkBoard 点击刷新状态。");
    return {
      id: definition.id,
      name: definition.name,
      command: definition.command,
      role: definition.role,
      installed: true,
      version: probe.version,
      path: probe.bin,
      connectionState: "needs_auth",
      connectionLabel: "已打开 Claude Code 登录终端",
      connectionDetail: "请在新打开的终端窗口中完成 `claude auth login`，完成后回到 MkBoard 点击刷新状态。",
      diagnostics: [
        {
          state: "warning",
          label: "Claude Code 登录态",
          detail: "登录终端已打开，完成后重新扫描即可。"
        }
      ],
      ...localCliAgentMetadata(definition)
    };
  } catch (error) {
    return {
      id: definition.id,
      name: definition.name,
      command: definition.command,
      role: definition.role,
      installed: true,
      version: probe.version,
      path: probe.bin,
      connectionState: "error",
      connectionLabel: "无法打开 Claude Code 登录",
      connectionDetail: error instanceof Error ? error.message : String(error),
      diagnostics: [
        {
          state: "failed",
          label: "Claude Code 登录终端",
          detail: "无法自动打开终端，请手动执行登录命令。"
        }
      ],
      ...localCliAgentMetadata(definition)
    };
  }
}

export async function scanLocalCliAgents(): Promise<LocalCliAgent[]> {
  const results = await Promise.all(
    getLocalCliAgentDefinitions().map(async (definition) => {
      try {
        return await probeLocalCliAgent(definition);
      } catch (error) {
        return buildProbeFailedCliAgent(definition, error);
      }
    })
  );
  return results;
}

export async function testHyperframesDoctor(): Promise<LocalCliAgent> {
  const definition = getLocalCliAgentDefinitions().find((agent) => agent.id === "hyperframes");
  if (!definition) throw new Error("HyperFrames 定义不存在。");
  return probeBundledHyperframesRuntime(definition, true);
}

export async function resolveAgentCliExecutable(agentCliId: AgentCliId): Promise<AgentCliExecutableProbe | null> {
  const definition = getLocalCliAgentDefinitions().find((agent) => agent.id === agentCliId && agent.role === "agent");
  if (!definition) return null;

  if (agentCliId === "codex") {
    const probe = await resolveCodexExecutable();
    if (!probe) return null;
    return {
      id: agentCliId,
      name: definition.name,
      protocol: definition.protocol ?? "codex-exec",
      customArgs: definition.customArgs,
      bin: probe.bin,
      launchBin: probe.launchBin,
      launchPathPrepend: probe.launchPathPrepend,
      version: probe.version,
      diagnostic: probe.diagnostic
    };
  }

  const probe = await resolveLocalCliExecutable(definition);
  if (!probe) return null;
  return {
    id: agentCliId,
    name: definition.name,
    protocol: definition.protocol ?? (agentCliId === "claude-code" ? "claude-stream-json" : "generic-prompt"),
    customArgs: definition.customArgs,
    bin: probe.bin,
    launchBin: probe.bin,
    launchPathPrepend: probe.launchPathPrepend,
    version: probe.version
  };
}

export async function resolveCodexExecutable(): Promise<CodexExecutableProbe | null> {
  const resolved = await findVersionedExecutable("codex", process.env.CODEX_BIN, probeCodexVersion);
  if (!resolved) return null;

  const native = resolveCodexNativeBinary(resolved.bin);
  return {
    bin: resolved.bin,
    launchBin: native.path ?? resolved.bin,
    launchPathPrepend: dedupePathEntries([...native.pathPrepend, ...resolved.pathPrepend]),
    version: resolved.version,
    diagnostic: native.diagnostic
  };
}

async function resolveLocalCliExecutable(definition: LocalCliAgentDefinition): Promise<LocalExecutableProbe | null> {
  const commands = [definition.command, ...(definition.aliases || [])];

  for (const command of commands) {
    const resolved = await findVersionedExecutable(command, configuredCliPath(definition), (bin, pathPrepend) =>
      probeLocalCliVersion(bin, definition, pathPrepend)
    );
    if (resolved) return { bin: resolved.bin, launchPathPrepend: resolved.pathPrepend, version: resolved.version };
  }

  return null;
}

async function probeLocalCliAgent(definition: LocalCliAgentDefinition): Promise<LocalCliAgent> {
  if (definition.id === "hyperframes") {
    return probeHyperframesCliAgent(definition);
  }

  const commands = [definition.command, ...(definition.aliases || [])];
  for (const command of commands) {
    const resolved = await findVersionedExecutable(command, configuredCliPath(definition), (bin, pathPrepend) =>
      probeLocalCliVersion(bin, definition, pathPrepend)
    );
    if (resolved) {
      const connection = await probeLocalCliConnection(definition, resolved.bin, resolved.pathPrepend);
      return {
        id: definition.id,
        name: definition.name,
        command: definition.command,
        role: definition.role,
        installed: true,
        version: resolved.version,
        path: resolved.bin,
        ...connection,
        ...localCliAgentMetadata(definition)
      };
    }
  }

  return {
    id: definition.id,
    name: definition.name,
    command: definition.command,
    role: definition.role,
    installed: false,
    connectionState: "not_installed",
    connectionLabel: `未找到 ${definition.name}`,
    connectionDetail: missingCliDetail(definition),
    diagnostics: [
      {
        state: "failed",
        label: `${definition.name} 可执行文件`,
        detail: missingCliDetail(definition)
      }
    ],
    ...localCliAgentMetadata(definition)
  };
}

function configuredCliPath(definition: LocalCliAgentDefinition): string | undefined {
  const key = definition.configuredPathEnv;
  return key ? process.env[key] : undefined;
}

function buildProbeFailedCliAgent(definition: LocalCliAgentDefinition, error: unknown): LocalCliAgent {
  const detail = error instanceof Error ? error.message : String(error);
  return {
    id: definition.id,
    name: definition.name,
    command: definition.command,
    role: definition.role,
    installed: false,
    connectionState: "error",
    connectionLabel: `${definition.name} 检测失败`,
    connectionDetail: detail,
    diagnostics: [
      {
        state: "failed",
        label: `${definition.name} 状态检测`,
        detail
      }
    ],
    ...localCliAgentMetadata(definition)
  };
}

async function probeLocalCliConnection(
  definition: LocalCliAgentDefinition,
  bin: string,
  pathPrepend: string[] = []
): Promise<Pick<LocalCliAgent, "connectionState" | "connectionLabel" | "connectionDetail" | "diagnostics">> {
  if (definition.id === "codex") {
    const status = await execCodex(bin, ["login", "status"], 6000, codexSpawnEnv(pathPrepend));
    const output = compactOutput(status.stdout, status.stderr);
    if (status.code === 0 && /logged in/i.test(output)) {
      return {
        connectionState: "connected",
        connectionLabel: "Codex CLI 已连接",
        connectionDetail: output || "已检测到 Codex CLI 登录态。",
        diagnostics: [
          {
            state: "passed",
            label: "Codex CLI 登录态",
            detail: "已授权，可作为本地 Agent 使用。"
          }
        ]
      };
    }
    if (looksLikeAuthMissing(output) || status.code !== 0) {
      return {
        connectionState: "needs_auth",
        connectionLabel: "Codex CLI 未授权",
        connectionDetail: output || "请连接本机 Codex CLI 登录态。",
        diagnostics: [
          {
            state: "warning",
            label: "Codex CLI 登录态",
            detail: "已安装，但需要执行 `codex login --device-auth`。"
          }
        ]
      };
    }
    return {
      connectionState: "error",
      connectionLabel: "无法确认 Codex CLI 状态",
      connectionDetail: output || "Codex CLI 已安装，但登录状态无法识别。",
      diagnostics: [
        {
          state: "failed",
          label: "Codex CLI 状态",
          detail: output || "登录状态无法识别，请在终端运行 `codex login status`。"
        }
      ]
    };
  }

  if (definition.id === "claude-code") {
    const env = claudeCodeSpawnEnv(pathPrepend);
    const apiUsageAuth = detectClaudeCodeApiUsageAuth(env);
    const configDiagnostics = detectClaudeCodeConfigDiagnostics(env);
    const status = await execCli(bin, ["auth", "status", "--json"], 6000, env);
    const output = compactOutput(status.stdout, status.stderr);
    if (status.code === 0) {
      try {
        const parsed = JSON.parse(output || "{}") as { loggedIn?: boolean; authMethod?: string; subscriptionType?: string };
        if (parsed.loggedIn) {
          const detail = [parsed.authMethod, parsed.subscriptionType].filter(Boolean).join(" · ");
          return {
            connectionState: "connected",
            connectionLabel: "Claude Code 已连接",
            connectionDetail: detail || "已检测到 Claude Code 登录态。",
            diagnostics: [
              {
                state: "passed",
                label: "Claude Code 登录态",
                detail: "已登录，可作为本地 Agent 使用。"
              },
              ...configDiagnostics
            ]
          };
        }
        if (parsed.loggedIn === false) {
          if (apiUsageAuth) return buildClaudeCodeApiUsageConnection(apiUsageAuth, configDiagnostics);
          return {
            connectionState: "needs_auth",
            connectionLabel: "Claude Code 未登录",
            connectionDetail: "请连接本机 Claude Code 登录态，或配置 API key 使用 Claude Code API usage。",
            diagnostics: [
              {
                state: "warning",
                label: "Claude Code 登录态",
                detail: "已安装，但需要执行 `claude auth login` 或配置 `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` / `apiKeyHelper`。"
              },
              ...configDiagnostics
            ]
          };
        }
      } catch {
        if (/logged in|authenticated/i.test(output)) {
          return {
            connectionState: "connected",
            connectionLabel: "Claude Code 已连接",
            connectionDetail: "已检测到 Claude Code 登录态。",
            diagnostics: [
              {
                state: "passed",
                label: "Claude Code 登录态",
                detail: "已登录，可作为本地 Agent 使用。"
              },
              ...configDiagnostics
            ]
          };
        }
        if (apiUsageAuth) return buildClaudeCodeApiUsageConnection(apiUsageAuth, configDiagnostics);
      }
    }
    if (apiUsageAuth) return buildClaudeCodeApiUsageConnection(apiUsageAuth, configDiagnostics);
    if (looksLikeAuthMissing(output) || status.code !== 0) {
      return {
        connectionState: "needs_auth",
        connectionLabel: "Claude Code 未登录",
        connectionDetail: output || "请连接本机 Claude Code 登录态，或配置 API key 使用 Claude Code API usage。",
        diagnostics: [
          {
            state: "warning",
            label: "Claude Code 登录态",
            detail: output || "需要执行 `claude auth login` 或配置 `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` / `apiKeyHelper`。"
          },
          ...configDiagnostics
        ]
      };
    }
    return {
      connectionState: "error",
      connectionLabel: "无法确认 Claude Code 状态",
      connectionDetail: output || "Claude Code 已安装，但登录状态无法识别。",
      diagnostics: [
        {
          state: "failed",
          label: "Claude Code 状态",
          detail: output || "登录状态无法识别，请在终端运行 `claude auth status --json`。"
        },
        ...configDiagnostics
      ]
    };
  }

  return {
    connectionState: "connected",
    connectionLabel: `${definition.name} 已安装`,
    diagnostics: [
      {
        state: "passed",
        label: `${definition.name} 可执行文件`,
        detail: `已检测到 ${bin}。`
      }
    ]
  };
}

async function probeHyperframesCliAgent(definition: LocalCliAgentDefinition): Promise<LocalCliAgent> {
  return probeBundledHyperframesRuntime(definition, false);
}

async function probeBundledHyperframesRuntime(definition: LocalCliAgentDefinition, verifyIntegrity: boolean): Promise<LocalCliAgent> {
  try {
    const runtime = resolveBundledRuntime();
    const env = bundledRuntimeSpawnEnv(runtime, localCliSpawnEnv());
    const [cli, ffmpeg, ffprobe, browser, integrityDiagnostics] = await Promise.all([
      execCli(runtime.nodeBin, [...runtime.nodeArgsPrefix, "--version"], 20_000, env),
      execCli(runtime.ffmpegBin, ["-version"], 20_000, env),
      execCli(runtime.ffprobeBin, ["-version"], 20_000, env),
      execCli(runtime.browserBin, ["--version"], 20_000, env),
      verifyIntegrity ? verifyBundledRuntimeIntegrity(runtime) : Promise.resolve([])
    ]);
    const diagnostics: LocalCliDiagnostic[] = [
      componentDiagnostic("HyperFrames CLI", cli, runtime.manifest.components.hyperframes?.version),
      componentDiagnostic("Chrome Headless Shell", browser, runtime.manifest.components.chromeHeadlessShell?.version),
      componentDiagnostic("FFmpeg", ffmpeg, runtime.manifest.components.ffmpeg?.version),
      componentDiagnostic("ffprobe", ffprobe, runtime.manifest.components.ffmpeg?.version),
      {
        state: "passed",
        label: "运行时架构",
        detail: `${runtime.manifest.target} · ${runtime.manifest.capabilities.join(" / ")}`
      },
      ...integrityDiagnostics
    ];
    const failed = diagnostics.filter((diagnostic) => diagnostic.state === "failed");
    return buildHyperframesDoctorAgent(
      definition,
      true,
      runtime.root,
      failed.length === 0 ? "内置视频运行时可用" : "内置视频运行时检查失败",
      failed.length === 0
        ? `${bundledRuntimeVersionSummary(runtime)}。不需要安装 Node.js、FFmpeg 或 HyperFrames。`
        : `发现 ${failed.length} 个运行时问题，请重新安装完整安装包。`,
      diagnostics
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return buildHyperframesDoctorAgent(definition, false, null, "内置视频运行时缺失", detail, [{ state: "failed", label: "MkBoard 视频运行时", detail }]);
  }
}

function componentDiagnostic(label: string, result: ExecResult, expectedVersion?: string): LocalCliDiagnostic {
  const output = compactOutput(result.stdout, result.stderr).split(/\r?\n/u)[0]?.trim();
  if (result.code !== 0) return { state: "failed", label, detail: output || result.error?.message || "无法启动。" };
  return { state: "passed", label, detail: expectedVersion ? `${expectedVersion} · ${output || "可执行"}` : output || "可执行" };
}

function buildHyperframesDoctorAgent(
  definition: LocalCliAgentDefinition,
  installed: boolean,
  path: string | null,
  connectionLabel: string,
  connectionDetail: string,
  diagnostics: LocalCliDiagnostic[]
): LocalCliAgent {
  return {
    id: definition.id,
    name: definition.name,
    command: definition.command,
    role: definition.role,
    installed,
    version: installed ? "无需登录" : undefined,
    path: path ?? undefined,
    connectionState: diagnostics.some((diagnostic) => diagnostic.state === "failed") ? "error" : "connected",
    connectionLabel,
    connectionDetail,
    diagnostics,
    ...localCliAgentMetadata(definition)
  };
}

function localCliAgentMetadata(definition: LocalCliAgentDefinition): Pick<
  LocalCliAgent,
  "installCommand" | "loginCommand" | "installSteps" | "setupHint" | "autoSetup" | "installUrl" | "docsUrl" | "guideUrl" | "models" | "supportsEffort"
> {
  return {
    installCommand: definition.installCommand,
    loginCommand: definition.loginCommand,
    installSteps: definition.installSteps,
    setupHint: definition.setupHint,
    autoSetup: definition.autoSetup,
    installUrl: definition.installUrl,
    docsUrl: definition.docsUrl,
    guideUrl: definition.guideUrl,
    models: definition.models,
    supportsEffort: definition.supportsEffort
  };
}

function buildClaudeCodeApiUsageConnection(
  auth: ClaudeCodeApiUsageAuth,
  configDiagnostics: LocalCliDiagnostic[] = []
): Pick<LocalCliAgent, "connectionState" | "connectionLabel" | "connectionDetail" | "diagnostics"> {
  return {
    connectionState: "connected",
    connectionLabel: "Claude Code 已连接",
    connectionDetail: auth.detail,
    diagnostics: [
      {
        state: "passed",
        label: "Claude Code API usage",
        detail: auth.detail
      },
      ...configDiagnostics
    ]
  };
}

function detectClaudeCodeApiUsageAuth(env: NodeJS.ProcessEnv): ClaudeCodeApiUsageAuth | null {
  const envKey = firstPresentEnvKey(env, claudeCodeApiUsageEnvKeys);
  if (envKey) {
    return {
      detail: `已检测到 ${envKey}，可通过 Claude Code API usage 作为本地 Agent 使用，无需执行 \`claude auth login\`。`
    };
  }

  const settingsKey = detectClaudeCodeSettingsApiUsageAuth();
  if (settingsKey) {
    return {
      detail: `已检测到 Claude Code 用户配置中的 ${settingsKey}，可通过 API usage 作为本地 Agent 使用，无需执行 \`claude auth login\`。`
    };
  }

  return null;
}

function detectClaudeCodeConfigDiagnostics(env: NodeJS.ProcessEnv): LocalCliDiagnostic[] {
  const envKeys = presentEnvKeys(env, claudeCodeDiagnosticEnvKeys);
  const settingsConfig = detectClaudeCodeSettingsConfig();
  const configuredKeys = [...new Set([...envKeys, ...settingsConfig.envKeys])];
  const apiUsageSources = [...configuredKeys, settingsConfig.hasApiKeyHelper ? "apiKeyHelper" : ""].filter(Boolean);
  const diagnostics: LocalCliDiagnostic[] = [];

  if (apiUsageSources.length > 0) {
    diagnostics.push({
      state: "passed",
      label: "Claude Code 配置",
      detail: `检测到配置键：${apiUsageSources.join(", ")}。MkBoard 只读取键名用于诊断，不读取或保存密钥值。`
    });
  }

  if (configuredKeys.includes("ANTHROPIC_BASE_URL")) {
    diagnostics.push({
      state: "warning",
      label: "Claude Code API 网关",
      detail: "检测到 ANTHROPIC_BASE_URL。自定义 API 网关或代理不可用时，Claude Code 可能返回 ConnectionRefused、524 或请求超时；请检查该网关、代理/VPN 或 Claude Code API usage 配置。"
    });
  }

  return diagnostics;
}

function firstPresentEnvKey(env: NodeJS.ProcessEnv, keys: string[]): string | null {
  for (const key of keys) {
    const actualKey = Object.keys(env).find((candidate) => candidate.toUpperCase() === key);
    if (actualKey && env[actualKey]?.trim()) return key;
  }
  return null;
}

function presentEnvKeys(env: NodeJS.ProcessEnv, keys: string[]): string[] {
  const present: string[] = [];
  for (const key of keys) {
    const actualKey = Object.keys(env).find((candidate) => candidate.toUpperCase() === key);
    if (actualKey && env[actualKey]?.trim()) present.push(key);
  }
  return present;
}

function detectClaudeCodeSettingsApiUsageAuth(): string | null {
  const settingsConfig = detectClaudeCodeSettingsConfig();
  if (settingsConfig.hasApiKeyHelper) return "apiKeyHelper";
  return settingsConfig.envKeys.find((key) => claudeCodeApiUsageEnvKeys.includes(key)) ?? null;
}

function detectClaudeCodeSettingsConfig(): { envKeys: string[]; hasApiKeyHelper: boolean } {
  const settingsPath = join(homedir(), ".claude", "settings.json");
  if (!existsSync(settingsPath)) return { envKeys: [], hasApiKeyHelper: false };

  try {
    const parsed = JSON.parse(readFileSync(settingsPath, "utf8")) as { env?: Record<string, unknown>; apiKeyHelper?: unknown };
    const hasApiKeyHelper = typeof parsed.apiKeyHelper === "string" && parsed.apiKeyHelper.trim().length > 0;
    const settingsEnv = parsed.env;
    if (!settingsEnv || typeof settingsEnv !== "object") return { envKeys: [], hasApiKeyHelper };

    const envKeys: string[] = [];
    for (const key of claudeCodeDiagnosticEnvKeys) {
      const actualKey = Object.keys(settingsEnv).find((candidate) => candidate.toUpperCase() === key);
      if (actualKey && typeof settingsEnv[actualKey] === "string" && settingsEnv[actualKey].trim()) envKeys.push(key);
    }
    return { envKeys, hasApiKeyHelper };
  } catch {
    return { envKeys: [], hasApiKeyHelper: false };
  }
}

function missingCliDetail(definition: LocalCliAgentDefinition): string {
  return definition.setupHint || "";
}

async function findVersionedExecutable(
  command: string,
  configuredPath: string | undefined,
  probeVersion: (bin: string, pathPrepend: string[]) => Promise<string | null>
): Promise<VersionedExecutableProbe | null> {
  const seen = new Set<string>();
  const directCandidates = localToolchainExecutableCandidates(command, configuredPath).map((bin) => ({
    bin,
    pathPrepend: isAbsolute(bin) ? [dirname(bin)] : []
  }));

  for (const candidate of directCandidates) {
    const result = await probeVersionedCandidate(candidate, probeVersion, seen);
    if (result) return result;
  }

  const shellCandidate = await resolveLoginShellExecutable(command);
  if (!shellCandidate) return null;
  return probeVersionedCandidate(shellCandidate, probeVersion, seen);
}

async function probeVersionedCandidate(
  candidate: ExecutableCandidateProbe,
  probeVersion: (bin: string, pathPrepend: string[]) => Promise<string | null>,
  seen: Set<string>
): Promise<VersionedExecutableProbe | null> {
  const key = `${candidate.bin}\0${candidate.pathPrepend.join(delimiter)}`;
  if (seen.has(key)) return null;
  seen.add(key);
  if (isAbsolute(candidate.bin) && !existsSync(candidate.bin)) return null;
  try {
    const version = await probeVersion(candidate.bin, candidate.pathPrepend);
    return version ? { ...candidate, version } : null;
  } catch {
    return null;
  }
}

async function resolveLoginShellExecutable(command: string, env: NodeJS.ProcessEnv = process.env): Promise<ExecutableCandidateProbe | null> {
  if (process.platform === "win32" || !/^[a-zA-Z0-9._-]+$/u.test(command)) return null;
  const shell = readEnvValue(env, "SHELL")?.trim() || (process.platform === "darwin" ? "/bin/zsh" : "/bin/sh");
  if (isAbsolute(shell) && !existsSync(shell)) return null;

  const pathMarker = "__MKBOARD_LOGIN_SHELL_PATH__";
  const shellName = basename(shell).toLowerCase();
  const pathExpression = shellName === "fish" ? "(string join : $PATH)" : '"$PATH"';
  const script = `printf '${pathMarker}%s\\n' ${pathExpression}; command -v ${shellQuote(command)} 2>/dev/null || true`;
  const args = shellName === "fish" ? ["-l", "-c", script] : ["-ilc", script];
  const result = await execCli(shell, args, 6000, localCliSpawnEnv([], env));
  const lines = result.stdout.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  let markerIndex = -1;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index]?.startsWith(pathMarker)) {
      markerIndex = index;
      break;
    }
  }
  if (markerIndex < 0) return null;

  const shellPath = lines[markerIndex]?.slice(pathMarker.length) ?? "";
  const bin = lines.slice(markerIndex + 1).find((line) => isAbsolute(line) && isExecutableFile(line));
  if (!bin) return null;
  const pathEntries = shellPath.split(delimiter).map((entry) => entry.trim()).filter(Boolean);
  return { bin: resolve(bin), pathPrepend: dedupePathEntries([dirname(bin), ...pathEntries]) };
}

export function localToolchainExecutableCandidates(command: string, configuredPath?: string, env: NodeJS.ProcessEnv = process.env): string[] {
  const configured = configuredPath?.trim();
  const pathEntries = (readEnvValue(env, "PATH") || "")
    .split(delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const names = executableNames(command);
  return [
    configured || "",
    ...pathEntries.flatMap((entry) => names.map((name) => join(entry, name))),
    ...localToolchainBinDirs(env).flatMap((entry) => names.map((name) => join(entry, name))),
    ...names
  ]
    .filter(Boolean)
    .map((candidate) => {
      const expanded = candidate.replace(/^~(?=[/\\])/u, homedir());
      return isAbsolute(expanded) || /[/\\]/u.test(expanded) ? resolve(expanded) : expanded;
    });
}

function localToolchainBinDirs(env: NodeJS.ProcessEnv): string[] {
  const home = homedir();
  const miseDataOverride = envBinDirFrom(env, "MISE_DATA_DIR", "");
  const miseDataDir = miseDataOverride || join(home, ".local", "share", "mise");
  const windowsEntries =
    process.platform === "win32"
      ? [
          envBinDirFrom(env, "APPDATA", "npm"),
          envBinDirFrom(env, "NVM_SYMLINK", ""),
          envBinDirFrom(env, "NVM_HOME", ""),
          envBinDirFrom(env, "LOCALAPPDATA", "npm"),
          envBinDirFrom(env, "ProgramFiles", "nodejs"),
          envBinDirFrom(env, "ProgramFiles(x86)", "nodejs"),
          join(home, "AppData", "Roaming", "npm")
        ]
      : [];
  const entries = [
    envBinDirFrom(env, "VP_HOME", "bin"),
    npmPrefixBinDir(env),
    ...windowsEntries,
    join(home, ".local", "bin"),
    join(home, ".vite-plus", "bin"),
    join(home, ".opencode", "bin"),
    join(home, ".bun", "bin"),
    join(home, ".volta", "bin"),
    join(home, ".asdf", "shims"),
    join(home, "Library", "pnpm"),
    join(home, ".cargo", "bin"),
    join(home, ".npm-global", "bin"),
    join(home, ".npm-packages", "bin"),
    join(home, ".deno", "bin"),
    join(home, "go", "bin"),
    join(home, ".pyenv", "shims"),
    join(miseDataDir, "shims"),
    miseDataOverride ? "" : join(home, ".mise", "shims"),
    ...existingChildBinDirs(join(miseDataDir, "installs", "node"), ["bin"]),
    ...existingChildBinDirs(join(home, ".nvm", "versions", "node"), ["bin"]),
    ...existingChildBinDirs(join(home, ".local", "share", "fnm", "node-versions"), ["installation", "bin"]),
    ...existingChildBinDirs(join(home, ".fnm", "node-versions"), ["installation", "bin"]),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin"
  ].filter(Boolean) as string[];
  return dedupePathEntries(entries);
}

export function localCliSpawnEnv(pathPrepend: string[] = [], baseEnv: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env = { ...baseEnv };
  stripNodeHostEnv(env);
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH";
  const existing = typeof env[pathKey] === "string" ? env[pathKey] : "";
  env[pathKey] = mergePath([...pathPrepend, ...localToolchainBinDirs(env), dirname(process.execPath)], existing);
  return env;
}

function executableNames(base: string): string[] {
  return process.platform === "win32" ? [`${base}.cmd`, `${base}.exe`, `${base}.bat`, base] : [base];
}

function envBinDirFrom(env: NodeJS.ProcessEnv, key: string, suffix: string): string | null {
  const value = readEnvValue(env, key)?.trim();
  if (!value) return null;
  const expanded = value.replace(/^~/u, homedir());
  return suffix ? resolve(expanded, suffix) : resolve(expanded);
}

function existingChildBinDirs(root: string, segments: string[]): string[] {
  const out: string[] = [];
  let entries: Array<{ name: string; isDirectory(): boolean; isSymbolicLink(): boolean }>;
  try {
    entries = readdirSync(root, { encoding: "utf8", withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const candidate = join(root, entry.name, ...segments);
    if (existsSync(candidate)) out.push(candidate);
  }
  return out.sort().reverse();
}

function dedupePathEntries(entries: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of entries) {
    const normalized = entry.trim().replace(/[/\\]+$/u, "");
    if (!normalized) continue;
    const key = process.platform === "win32" ? normalized.toLowerCase() : normalized;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function stripNodeHostEnv(env: NodeJS.ProcessEnv): void {
  for (const key of Object.keys(env)) {
    const upper = key.toUpperCase();
    if (upper === "NODE_OPTIONS" || upper === "NODE_PATH" || upper === "ELECTRON_RUN_AS_NODE") {
      delete env[key];
    }
  }
}

async function probeCodexVersion(bin: string, pathPrepend: string[] = []): Promise<string | null> {
  const result = await execCodex(bin, ["--version"], 4000, codexSpawnEnv(pathPrepend));
  if (result.code !== 0) return null;
  const version = compactOutput(result.stdout, result.stderr).split(/\r?\n/u)[0]?.trim();
  return version || "Codex CLI";
}

async function probeLocalCliVersion(bin: string, definition: LocalCliAgentDefinition, pathPrepend: string[] = []): Promise<string | null> {
  const argSets = definition.versionArgSets || [definition.versionArgs || ["--version"]];
  for (const args of argSets) {
    const version = await probeCliVersion(bin, args, pathPrepend);
    if (version) return normalizeCliVersion(definition, version);
  }
  return null;
}

async function probeCliVersion(bin: string, args: string[], pathPrepend: string[] = []): Promise<string | null> {
  const result = await execCli(bin, args, 3500, localCliSpawnEnv(pathPrepend));
  if (result.code !== 0) return null;
  const version = compactOutput(result.stdout, result.stderr).split(/\r?\n/u)[0]?.trim();
  return version || "已安装";
}

function normalizeCliVersion(definition: LocalCliAgentDefinition, version: string): string {
  const compact = version.trim();
  if (!compact) return "已安装";
  return compact;
}

function execCodex(bin: string, args: string[], timeoutMs: number, env: NodeJS.ProcessEnv = codexSpawnEnv()): Promise<ExecResult> {
  return execCli(bin, args, timeoutMs, env);
}

function execCli(bin: string, args: string[], timeoutMs: number, env: NodeJS.ProcessEnv = process.env): Promise<ExecResult> {
  return new Promise((resolveResult) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const finish = (code: number | null, signal: NodeJS.Signals | null, error?: Error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolveResult({
        code,
        signal,
        stdout,
        stderr,
        error
      });
    };

    let child: ReturnType<typeof crossSpawn>;
    try {
      child = crossSpawn(bin, args, {
        env,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"]
      });
    } catch (error) {
      finish(1, null, error instanceof Error ? error : new Error(String(error)));
      return;
    }

    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.once("error", (error) => {
      finish(1, null, error);
    });
    child.once("close", (code, signal) => {
      finish(code, signal);
    });
    timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish(1, null, new Error(`Process timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    timer.unref?.();
  });
}

export function codexSpawnEnv(pathPrepend: string[] = []): NodeJS.ProcessEnv {
  const env = localCliSpawnEnv(pathPrepend);
  const hasCustomBaseUrl = Object.keys(env).some((key) => key.toUpperCase() === "OPENAI_BASE_URL" && env[key]?.trim());
  if (!hasCustomBaseUrl) {
    for (const key of Object.keys(env)) {
      const upper = key.toUpperCase();
      if (upper === "OPENAI_API_KEY" || upper === "CODEX_API_KEY") delete env[key];
    }
  }
  return env;
}

export function claudeCodeSpawnEnv(pathPrepend: string[] = []): NodeJS.ProcessEnv {
  return localCliSpawnEnv(pathPrepend);
}

function npmPrefixBinDir(env: NodeJS.ProcessEnv): string | null {
  const value = readEnvValue(env, "NPM_CONFIG_PREFIX")?.trim();
  if (!value) return null;
  const prefix = resolve(value.replace(/^~/u, homedir()));
  return process.platform === "win32" ? prefix : join(prefix, "bin");
}

function readEnvValue(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const actualKey = Object.keys(env).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
  return actualKey ? env[actualKey] : undefined;
}

function mergePath(prepend: string[], existing: string): string {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const entry of [...prepend, ...existing.split(delimiter)]) {
    const normalized = entry.trim().replace(/[/\\]+$/u, "");
    if (!normalized) continue;
    const key = process.platform === "win32" ? normalized.toLowerCase() : normalized;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(normalized);
  }
  return merged.join(delimiter);
}

function appendDiagnostic(detail: string, diagnostic?: string): string {
  return diagnostic ? `${detail}\n${diagnostic}` : detail;
}

export function resolveCodexNativeBinary(
  wrapperPath: string,
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch
): { path: string | null; pathPrepend: string[]; diagnostic?: string } {
  const suffix = `${platform}-${arch}`;
  const targetTriple = codexNativeTargetTriple(platform, arch);
  for (const root of codexSearchRoots(wrapperPath)) {
    for (const candidate of codexNativeCandidates(root, suffix, targetTriple)) {
      if (isExecutableFile(candidate.path)) {
        return { path: candidate.path, pathPrepend: candidate.pathPrepend.filter(isDirectory) };
      }
    }
  }
  if (!looksLikeCodexNodeWrapper(wrapperPath)) return { path: null, pathPrepend: [] };
  return {
    path: null,
    pathPrepend: [],
    diagnostic: "Codex npm wrapper 背后的 native binary 未找到，已回退到 wrapper；如果 GUI 启动后无法运行，请通过 CODEX_BIN 指向 native codex 可执行文件。"
  };
}

function codexSearchRoots(wrapperPath: string): string[] {
  const roots = new Set<string>();
  roots.add(join(dirname(wrapperPath), "node_modules", "@openai", "codex"));
  for (const seed of [wrapperPath, safeRealpath(wrapperPath)]) {
    if (!seed) continue;
    let current = dirname(seed);
    while (current !== dirname(current)) {
      roots.add(current);
      current = dirname(current);
    }
  }
  return [...roots];
}

function codexNativeCandidates(root: string, packageSuffix: string, targetTriple: string): Array<{ path: string; pathPrepend: string[] }> {
  const scoped = join(root, "node_modules", "@openai");
  const packageDirs = [join(scoped, "codex"), join(scoped, `codex-${packageSuffix}`)];
  try {
    for (const entry of readdirSync(scoped, { encoding: "utf8", withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.startsWith("codex-")) packageDirs.push(join(scoped, entry.name));
    }
  } catch {
    // Optional package layouts vary by installer.
  }
  return [...new Set(packageDirs)].flatMap((dir) => {
    const vendorCodexPathDir = join(dir, "vendor", targetTriple, "codex-path");
    const vendorPathDir = join(dir, "vendor", targetTriple, "path");
    const currentPathPrepend = [vendorCodexPathDir, vendorPathDir];
    const legacyPathPrepend = [vendorPathDir, vendorCodexPathDir];
    return [
      { path: join(dir, "vendor", targetTriple, "bin", "codex"), pathPrepend: currentPathPrepend },
      { path: join(dir, "vendor", targetTriple, "bin", "codex.exe"), pathPrepend: currentPathPrepend },
      { path: join(dir, "vendor", targetTriple, "codex", "codex"), pathPrepend: legacyPathPrepend },
      { path: join(dir, "vendor", targetTriple, "codex", "codex.exe"), pathPrepend: legacyPathPrepend },
      { path: join(dir, "codex"), pathPrepend: currentPathPrepend },
      { path: join(dir, "bin", "codex"), pathPrepend: currentPathPrepend },
      { path: join(dir, "vendor", "codex"), pathPrepend: currentPathPrepend },
      { path: join(dir, "codex.exe"), pathPrepend: currentPathPrepend },
      { path: join(dir, "bin", "codex.exe"), pathPrepend: currentPathPrepend }
    ];
  });
}

function codexNativeTargetTriple(platform: NodeJS.Platform = process.platform, arch: string = process.arch): string {
  if (platform === "darwin" && arch === "arm64") return "aarch64-apple-darwin";
  if (platform === "darwin" && arch === "x64") return "x86_64-apple-darwin";
  if (platform === "linux" && arch === "arm64") return "aarch64-unknown-linux-musl";
  if (platform === "linux" && arch === "x64") return "x86_64-unknown-linux-musl";
  if (platform === "win32" && arch === "arm64") return "aarch64-pc-windows-msvc";
  if (platform === "win32" && arch === "x64") return "x86_64-pc-windows-msvc";
  return `${platform}-${arch}`;
}

function looksLikeCodexNodeWrapper(filePath: string): boolean {
  try {
    const body = readFileSync(filePath, "utf8").slice(0, 64_000);
    return /node|@openai\/codex|codex-/iu.test(body);
  } catch {
    return false;
  }
}

function safeRealpath(filePath: string): string | null {
  try {
    return realpathSync(filePath);
  } catch {
    return null;
  }
}

function isDirectory(filePath: string): boolean {
  try {
    return statSync(filePath).isDirectory();
  } catch {
    return false;
  }
}

function isExecutableFile(filePath: string): boolean {
  try {
    if (!statSync(filePath).isFile()) return false;
    if (process.platform !== "win32") accessSync(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function looksLikeAuthMissing(output: string): boolean {
  return /not (authenticated|logged in)|unauthorized|authentication required|please (sign|log) in|login required|credentials? (missing|required)|401/i.test(
    output
  );
}

function compactOutput(stdout: string, stderr: string): string {
  return [stdout, stderr]
    .map((value) => value.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function openLoginTerminal(bin: string, args: string[], title: string, completionMessage: string): Promise<void> {
  if (process.platform === "darwin") return openMacTerminal(bin, args, completionMessage);
  if (process.platform === "win32") return openWindowsTerminal(bin, args, title);
  return openLinuxTerminal(bin, args, completionMessage);
}

function openMacTerminal(bin: string, args: string[], completionMessage: string): Promise<void> {
  const command = `${shellCommand(bin, args)}; echo ""; echo ${shellQuote(completionMessage)}; read -n 1 -s -r -p "按任意键关闭窗口..."`;
  const script = `tell application "Terminal"\nactivate\ndo script ${appleScriptString(command)}\nend tell`;
  return execSimple("osascript", ["-e", script]);
}

function openWindowsTerminal(bin: string, args: string[], title: string): Promise<void> {
  const command = [cmdQuote(bin), ...args.map(cmdQuote)].join(" ");
  const child = spawn("cmd.exe", ["/c", "start", title, "cmd.exe", "/k", command], {
    detached: true,
    stdio: "ignore"
  });
  child.unref();
  return Promise.resolve();
}

async function openLinuxTerminal(bin: string, args: string[], completionMessage: string): Promise<void> {
  const command = `${shellCommand(bin, args)}; echo ""; echo ${shellQuote(completionMessage)}; read -n 1 -s -r -p "按任意键关闭窗口..."`;
  const terminals = [
    ["x-terminal-emulator", ["-e", "sh", "-lc", command]],
    ["gnome-terminal", ["--", "sh", "-lc", command]],
    ["konsole", ["-e", "sh", "-lc", command]],
    ["xterm", ["-e", "sh", "-lc", command]]
  ] as const;

  for (const [terminal, args] of terminals) {
    try {
      await execSimple(terminal, args);
      return;
    } catch {
      // Try the next common terminal emulator.
    }
  }
  throw new Error(`没有找到可用的终端应用，请在终端中手动运行 \`${shellCommand(bin, args)}\`。`);
}

function execSimple(file: string, args: readonly string[]): Promise<void> {
  return new Promise((resolveResult, reject) => {
    execFile(file, [...args], { timeout: 5000 }, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolveResult();
    });
  });
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function shellCommand(bin: string, args: string[]): string {
  return [bin, ...args].map(shellQuote).join(" ");
}

function cmdQuote(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function appleScriptString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
