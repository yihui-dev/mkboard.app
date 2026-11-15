import { MKBOARD_MCP_TOOLS } from "./tools";
import { app, type BrowserWindow } from "electron";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { McpBridgeStatus, ProjectDetail, ProjectTemplate, Skill, StoryboardRow, Taste, WorkspaceTab } from "../../shared";
import { startMcpControlServer, type McpControlServer } from "./control-server";
import {
  createMcpToolHandler,
  type McpActiveView,
  type McpCreateProjectInput,
  type McpGenerationService,
  type McpHostStore,
  type McpSpeechService,
  type McpStoryboardParseInput
} from "./host";
import { getMcpIntegrationStatus, setMcpIntegrationEnabled, syncMcpIntegration, type McpIntegrationOptions } from "./integration";
import { MKBOARD_MCP_TOKEN_FILE_NAME, resolveMcpSocketPath, type McpBridgeVariant } from "./protocol";

// Wires the MkBoard MCP bridge into the Electron main process: control socket, tool handler,
// renderer notifications and Claude Code / Codex registration.

export type DesktopMcpBridgeDeps = {
  store: McpHostStore;
  listTemplates(interfaceLanguage?: McpActiveView["interfaceLanguage"]): ProjectTemplate[];
  // Must go through the same local project quota check as the 新建项目 button.
  createProject(input: McpCreateProjectInput): ProjectDetail;
  runStoryboardParse(input: McpStoryboardParseInput): Promise<StoryboardRow[]>;
  listSkills(interfaceLanguage?: McpActiveView["interfaceLanguage"]): Skill[];
  listTastes(): Taste[];
  afterProjectDeleted(): Promise<void>;
  speech: McpSpeechService;
  generation: McpGenerationService;
  registerClients: boolean;
  getWindow(): BrowserWindow | null;
  ensureWindow(): BrowserWindow;
  log(message: string, detail?: unknown): void;
};

export type DesktopMcpBridge = {
  reportActiveView(view: McpActiveView): void;
  getStatus(httpMcpUrl?: string | null): McpBridgeStatus;
  setEnabled(enabled: boolean, httpMcpUrl?: string | null): McpBridgeStatus;
  handleHttpJsonRpc(message: Record<string, unknown>): Promise<Record<string, unknown> | null>;
  close(): Promise<void>;
};

const OPEN_PROJECT_TIMEOUT_MS = 15_000;

export async function startDesktopMcpBridge(deps: DesktopMcpBridgeDeps): Promise<DesktopMcpBridge> {
  const variant: McpBridgeVariant = app.isPackaged ? "production" : "development";
  const userDataDir = app.getPath("userData");
  const socketPath = resolveMcpSocketPath(userDataDir, variant);
  const integrationOptions: McpIntegrationOptions = {
    variant,
    userDataDir,
    homeDir: homedir(),
    codexHome: process.env.CODEX_HOME?.trim() || undefined,
    socketPath,
    electronExecPath: process.execPath,
    serverScriptPath: join(app.getAppPath(), "out", "mcp", "server.cjs"),
    appLaunchPath: resolveAppLaunchPath(),
    appVersion: app.getVersion()
  };

  let activeView: McpActiveView = { projectId: null };
  const viewWaiters = new Set<() => void>();
  let controlServer: McpControlServer | null = null;
  let lastError: string | undefined;

  const notifyProjectChanged = (projectId: string, tool: string) => {
    const window = deps.getWindow();
    if (window && !window.isDestroyed()) window.webContents.send("mkboard:project-changed-externally", { projectId, source: "mcp", tool });
  };

  const openProject = async (projectId: string, tab: WorkspaceTab) => {
    const window = deps.ensureWindow();
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
    const opened = new Promise<void>((resolvePromise, reject) => {
      const timer = setTimeout(() => {
        viewWaiters.delete(check);
        reject(new Error("MkBoard 窗口没有在 15 秒内打开该项目。"));
      }, OPEN_PROJECT_TIMEOUT_MS);
      const check = () => {
        if (activeView.projectId !== projectId) return;
        clearTimeout(timer);
        viewWaiters.delete(check);
        resolvePromise();
      };
      viewWaiters.add(check);
    });
    const send = () => window.webContents.send("mkboard:mcp-open-project", { projectId, tab });
    if (window.webContents.isLoading()) window.webContents.once("did-finish-load", send);
    else send();
    await opened;
  };

  const handleTool = createMcpToolHandler({
        store: deps.store,
        getActiveView: () => activeView,
        openProject,
        notifyProjectChanged,
        listTemplates: deps.listTemplates,
        createProject: deps.createProject,
        runStoryboardParse: deps.runStoryboardParse,
        listSkills: deps.listSkills,
        listTastes: deps.listTastes,
        afterProjectDeleted: deps.afterProjectDeleted,
        speech: deps.speech,
        generation: deps.generation,
        downloadsDir: join(app.getPath("temp"), "mkboard-mcp-downloads")
      });

  try {
    controlServer = await startMcpControlServer({
      socketPath,
      tokenFile: join(userDataDir, MKBOARD_MCP_TOKEN_FILE_NAME),
      handleTool,
      log: (message, detail) => deps.log(`[MCP] ${message}`, detail)
    });
  } catch (error) {
    lastError = `MkBoard MCP 服务启动失败：${error instanceof Error ? error.message : String(error)}`;
    deps.log(`[MCP] ${lastError}`);
  }

  try {
    if (deps.registerClients) syncMcpIntegration(integrationOptions);
  } catch (error) {
    lastError = `注册到 Claude Code / Codex 失败：${error instanceof Error ? error.message : String(error)}`;
    deps.log(`[MCP] ${lastError}`);
  }

  const withRuntime = (status: ReturnType<typeof getMcpIntegrationStatus>, httpMcpUrl?: string | null): McpBridgeStatus => ({
    ...status,
    listening: Boolean(controlServer),
    httpMcpUrl: httpMcpUrl ?? null,
    error: lastError
  });

  return {
    reportActiveView(view) {
      activeView = {
        projectId: view.projectId || null,
        screen: view.screen,
        tab: view.tab,
        agentCliId: view.agentCliId ?? activeView.agentCliId,
        interfaceLanguage: view.interfaceLanguage ?? activeView.interfaceLanguage,
        speechVoiceId: view.speechVoiceId ?? activeView.speechVoiceId,
        hyperframesResolution: view.hyperframesResolution ?? activeView.hyperframesResolution,
        seedanceResolution: view.seedanceResolution ?? activeView.seedanceResolution,
        hyperframesConcurrency: view.hyperframesConcurrency ?? activeView.hyperframesConcurrency
      };
      for (const waiter of [...viewWaiters]) waiter();
    },
    getStatus(httpMcpUrl) {
      return withRuntime(getMcpIntegrationStatus(integrationOptions), httpMcpUrl);
    },
    setEnabled(enabled, httpMcpUrl) {
      try {
        const status = setMcpIntegrationEnabled(integrationOptions, enabled);
        lastError = undefined;
        return withRuntime(status, httpMcpUrl);
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        return withRuntime(getMcpIntegrationStatus(integrationOptions), httpMcpUrl);
      }
    },
    async handleHttpJsonRpc(message) {
      const id = "id" in message ? message.id : undefined;
      const method = typeof message.method === "string" ? message.method : "";
      if (id === undefined) return null;
      if (method === "initialize") {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2025-06-18",
            capabilities: { tools: {} },
            serverInfo: { name: "mkboard", version: app.getVersion() }
          }
        };
      }
      if (method === "ping") {
        return { jsonrpc: "2.0", id, result: {} };
      }
      if (method === "tools/list") {
        return { jsonrpc: "2.0", id, result: { tools: MKBOARD_MCP_TOOLS } };
      }
      if (method === "tools/call") {
        const params = (message.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
        const toolName = typeof params.name === "string" ? params.name : "";
        if (!MKBOARD_MCP_TOOLS.some((t) => t.name === toolName)) {
          return { jsonrpc: "2.0", id, error: { code: -32602, message: `Unknown tool: ${toolName}` } };
        }
        try {
          const outResult = await handleTool(toolName, params.arguments ?? {});
          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [{ type: "text", text: JSON.stringify(outResult, null, 2) }]
            }
          };
        } catch (err) {
          return {
            jsonrpc: "2.0",
            id,
            result: {
              isError: true,
              content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }]
            }
          };
        }
      }
      return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } };
    },
    async close() {
      await controlServer?.close();
      controlServer = null;
    }
  };
}

function resolveAppLaunchPath(): string | undefined {
  if (!app.isPackaged) return undefined;
  if (process.platform === "darwin") {
    const bundlePath = resolve(process.execPath, "..", "..", "..");
    return bundlePath.endsWith(".app") ? bundlePath : undefined;
  }
  return process.execPath;
}
