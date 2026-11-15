import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AgentModelPreset, LocalCliAgentRole, LocalCliInstallStep } from "../shared";

export type RuntimeAgentProtocol = "codex-exec" | "claude-stream-json" | "gemini-json" | "generic-prompt";

export type DeclarativeCliAgentDefinition = {
  id: string;
  name: string;
  command: string;
  aliases?: string[];
  role: LocalCliAgentRole;
  protocol: RuntimeAgentProtocol;
  configuredPathEnv?: string;
  versionArgs?: string[];
  versionArgSets?: string[][];
  installCommand?: string;
  loginCommand?: string;
  installSteps?: LocalCliInstallStep[];
  setupHint?: string;
  autoSetup?: string;
  installUrl?: string;
  docsUrl?: string;
  guideUrl?: string;
  models: AgentModelPreset[];
  supportsEffort?: boolean;
  customArgs?: string[];
};

const MKBOARD_CLI_GUIDE_URL = "https://github.com/yihui-dev/mkboard.app#quick-start--%E5%BF%AB%E9%80%9F%E4%B8%8A%E6%89%8B";
const HYPERFRAMES_GUIDE_URL = "https://hyperframes.heygen.com/packages/cli";

export const BUILTIN_CLI_AGENT_DEFINITIONS: readonly DeclarativeCliAgentDefinition[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    command: "claude",
    aliases: ["openclaude"],
    role: "agent",
    protocol: "claude-stream-json",
    configuredPathEnv: "CLAUDE_BIN",
    installCommand: "curl -fsSL https://claude.ai/install.sh | bash",
    loginCommand: "claude auth login",
    installSteps: [
      "安装 Claude Code CLI（或兼容的 openclaude）。",
      "执行 `claude auth login` 登录，或配置 `ANTHROPIC_API_KEY`。",
      "回到 MkBoard 点击「重新扫描」。"
    ],
    setupHint: "支持流式思考、结构化 JSON 分镜操作与 HyperFrames 代码生成。仅复用本机登录态或环境变量。",
    installUrl: "https://docs.anthropic.com/en/docs/claude-code",
    docsUrl: "https://docs.anthropic.com/en/docs/claude-code",
    guideUrl: MKBOARD_CLI_GUIDE_URL,
    supportsEffort: true,
    models: [
      { id: "default", label: "Default (CLI Configured)" },
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
      { id: "claude-opus-4-6", label: "Claude Opus 4.6" },
      { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" }
    ]
  },
  {
    id: "codex",
    name: "Codex CLI",
    command: "codex",
    role: "agent",
    protocol: "codex-exec",
    configuredPathEnv: "CODEX_BIN",
    installCommand: "npm install -g @openai/codex",
    loginCommand: "codex login",
    installSteps: [
      "安装 OpenAI Codex CLI。",
      "在终端执行 `codex login` 或配置 `OPENAI_API_KEY`。",
      "回到 MkBoard 点击「重新扫描」。"
    ],
    setupHint: "支持 JSON Schema 强约束输出、推理强度切换与沙箱控制。仅复用本机登录态。",
    installUrl: "https://developers.openai.com/codex/cli",
    docsUrl: "https://developers.openai.com/codex/cli",
    guideUrl: MKBOARD_CLI_GUIDE_URL,
    supportsEffort: true,
    models: [
      { id: "default", label: "Default (CLI Configured)" },
      { id: "gpt-5.4", label: "GPT-5.4" },
      { id: "gpt-5.3-codex", label: "GPT-5.3 Codex" },
      { id: "o4-mini", label: "o4-mini" }
    ]
  },
  {
    id: "gemini-cli",
    name: "Gemini CLI",
    command: "gemini",
    role: "agent",
    protocol: "gemini-json",
    configuredPathEnv: "GEMINI_CLI_BIN",
    installCommand: "npm install -g @google/gemini-cli",
    loginCommand: "gemini",
    installSteps: [
      "执行 `npm install -g @google/gemini-cli` 安装 Gemini CLI。",
      "运行 `gemini` 完成 Google 账号登录或配置 `GEMINI_API_KEY`。",
      "回到 MkBoard 点击「重新扫描」。"
    ],
    setupHint: "支持本机 Google 账号免费/订阅额度或 GEMINI_API_KEY 直接驱动脚本与分镜编辑。",
    installUrl: "https://github.com/google-gemini/gemini-cli",
    docsUrl: "https://github.com/google-gemini/gemini-cli",
    guideUrl: MKBOARD_CLI_GUIDE_URL,
    supportsEffort: false,
    models: [
      { id: "default", label: "Default (CLI Configured)" },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" }
    ]
  },
  {
    id: "opencode",
    name: "OpenCode",
    command: "opencode",
    role: "agent",
    protocol: "generic-prompt",
    configuredPathEnv: "OPENCODE_BIN",
    installCommand: "curl -fsSL https://opencode.ai/install | bash",
    loginCommand: "opencode auth login",
    installSteps: [
      "安装 OpenCode CLI。",
      "执行 `opencode auth login` 连接任意大模型供应商（OpenRouter / Anthropic / OpenAI / 本地 Ollama）。",
      "回到 MkBoard 点击「重新扫描」。"
    ],
    setupHint: "开源多模型终端 Agent，支持 75+ 模型供应商与本地模型。",
    installUrl: "https://opencode.ai",
    docsUrl: "https://opencode.ai/docs",
    guideUrl: MKBOARD_CLI_GUIDE_URL,
    supportsEffort: false,
    models: [{ id: "default", label: "Default (OpenCode Active Model)" }]
  },
  {
    id: "cursor-agent",
    name: "Cursor Agent",
    command: "cursor-agent",
    role: "agent",
    protocol: "generic-prompt",
    configuredPathEnv: "CURSOR_AGENT_BIN",
    installCommand: "curl https://cursor.com/install -fsS | bash",
    loginCommand: "cursor-agent login",
    installSteps: [
      "安装 Cursor Agent CLI。",
      "执行 `cursor-agent login` 登录你的 Cursor 账号。",
      "回到 MkBoard 点击「重新扫描」。"
    ],
    setupHint: "直接复用本机 Cursor 订阅额度驱动分镜拆解与动画工程编写。",
    installUrl: "https://cursor.com/cli",
    docsUrl: "https://cursor.com/cli",
    guideUrl: MKBOARD_CLI_GUIDE_URL,
    supportsEffort: false,
    models: [{ id: "default", label: "Default (Cursor Auto)" }]
  },
  {
    id: "kimi-cli",
    name: "Kimi CLI",
    command: "kimi",
    role: "agent",
    protocol: "generic-prompt",
    configuredPathEnv: "KIMI_BIN",
    installCommand: "uv tool install --python 3.13 kimi-cli",
    loginCommand: "kimi login",
    installSteps: [
      "安装 Moonshot Kimi CLI。",
      "执行 `kimi login` 完成授权。",
      "回到 MkBoard 点击「重新扫描」。"
    ],
    setupHint: "支持 Kimi K2 系列模型中文长剧本精修与分镜生成。",
    installUrl: "https://github.com/MoonshotAI/kimi-cli",
    docsUrl: "https://github.com/MoonshotAI/kimi-cli",
    guideUrl: MKBOARD_CLI_GUIDE_URL,
    supportsEffort: false,
    models: [{ id: "default", label: "Default (Kimi CLI)" }]
  },
  {
    id: "hyperframes",
    name: "HyperFrames CLI",
    command: "hyperframes",
    role: "dependency",
    protocol: "generic-prompt",
    installSteps: [
      "完整版安装包已内置 HyperFrames、Chrome 与 FFmpeg。",
      "源码或轻量版构建将自动检测内置运行时或本机环境。"
    ],
    setupHint: "用于本地可编程动态图形 (MG) 视频渲染，无需任何云端费用。",
    autoSetup: "连接任意本地 Agent 后，MkBoard 会自动编写并渲染分镜动画。",
    installUrl: HYPERFRAMES_GUIDE_URL,
    docsUrl: HYPERFRAMES_GUIDE_URL,
    guideUrl: MKBOARD_CLI_GUIDE_URL,
    models: []
  }
];

export function loadCliAgentDefinitions(): DeclarativeCliAgentDefinition[] {
  const customPath = process.env.MKBOARD_AGENTS_CONFIG?.trim() || join(homedir(), ".mkboard", "agents.local.json");
  const builtins = [...BUILTIN_CLI_AGENT_DEFINITIONS];
  if (!existsSync(customPath)) return builtins;

  try {
    const parsed = JSON.parse(readFileSync(customPath, "utf8")) as unknown;
    const entries = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as { agents?: unknown[] }).agents)
        ? (parsed as { agents: unknown[] }).agents
        : [];
    for (const raw of entries) {
      if (!raw || typeof raw !== "object") continue;
      const item = raw as Record<string, unknown>;
      const id = typeof item.id === "string" ? item.id.trim() : "";
      const name = typeof item.name === "string" ? item.name.trim() : id;
      const command = typeof item.command === "string" ? item.command.trim() : "";
      if (!id || !command || builtins.some((b) => b.id === id)) continue;
      builtins.splice(builtins.length - 1, 0, {
        id,
        name,
        command,
        role: "agent",
        protocol: "generic-prompt",
        customArgs: Array.isArray(item.args) ? item.args.filter((a): a is string => typeof a === "string") : undefined,
        setupHint: typeof item.setupHint === "string" ? item.setupHint : `Custom local CLI agent from ~/.mkboard/agents.local.json (${command}).`,
        models: [{ id: "default", label: "Default" }]
      });
    }
  } catch {
    // Ignore malformed ~/.mkboard/agents.local.json
  }

  return builtins;
}

export function findCliAgentDefinition(agentCliId: string): DeclarativeCliAgentDefinition | undefined {
  return loadCliAgentDefinitions().find((def) => def.id === agentCliId);
}
