// Stdio MCP server for MkBoard Desktop.
//
// Launched by Claude Code / Codex through the `mkboard-mcp` launcher script, which runs the
// MkBoard Electron binary with ELECTRON_RUN_AS_NODE=1. It lists tools without the app running and
// forwards tool calls to the running app's control socket (see control-server.ts).
// stdout carries JSON-RPC only; diagnostics go to stderr.

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { connect } from "node:net";
import { createInterface } from "node:readline";
import { MKBOARD_MCP_BRIDGE_VERSION, type McpBridgeRequest, type McpBridgeResponse } from "./protocol";
import { MKBOARD_MCP_SERVER_INSTRUCTIONS, MKBOARD_MCP_TOOLS } from "./tools";

type JsonRpcId = string | number | null;
type JsonRpcMessage = { jsonrpc?: string; id?: JsonRpcId; method?: string; params?: Record<string, unknown> };

const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const APP_LAUNCH_TIMEOUT_MS = 45_000;
const TOOL_CALL_TIMEOUT_MS = 10 * 60_000;

export type McpServerOptions = {
  socketPath: string;
  tokenFile: string;
  appLaunchPath?: string;
  client?: string;
  version?: string;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  log?: (message: string) => void;
};

export function runMkboardMcpServer(options: McpServerOptions): Promise<void> {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const log = options.log ?? ((message: string) => process.stderr.write(`[mkboard-mcp] ${message}\n`));
  const bridge = createBridgeClient(options, log);
  const pending = new Set<Promise<void>>();

  const write = (message: Record<string, unknown>) => {
    output.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
  };

  const handle = async (message: JsonRpcMessage) => {
    const { id, method } = message;
    const isRequest = id !== undefined && id !== null;
    if (!method) return;
    try {
      const result = await dispatch(method, message.params ?? {}, bridge, options);
      if (isRequest) write({ id, result });
    } catch (error) {
      if (!isRequest) return;
      const rpcError = error instanceof JsonRpcError ? error : new JsonRpcError(-32603, error instanceof Error ? error.message : String(error));
      write({ id, error: { code: rpcError.code, message: rpcError.message } });
    }
  };

  return new Promise((resolve) => {
    const lines = createInterface({ input, crlfDelay: Infinity });
    lines.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let message: JsonRpcMessage;
      try {
        message = JSON.parse(trimmed) as JsonRpcMessage;
      } catch {
        write({ id: null, error: { code: -32700, message: "Parse error" } });
        return;
      }
      const task = handle(message).finally(() => pending.delete(task));
      pending.add(task);
    });
    lines.on("close", () => {
      void Promise.allSettled([...pending]).then(() => resolve());
    });
  });
}

class JsonRpcError extends Error {
  readonly code: number;

  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

async function dispatch(method: string, params: Record<string, unknown>, bridge: BridgeClient, options: McpServerOptions): Promise<unknown> {
  if (method === "initialize") {
    const requested = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
    return {
      protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : SUPPORTED_PROTOCOL_VERSIONS[0],
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "mkboard", title: "MkBoard Desktop", version: options.version || "0.0.0" },
      instructions: MKBOARD_MCP_SERVER_INSTRUCTIONS
    };
  }
  if (method === "ping") return {};
  if (method.startsWith("notifications/")) return {};
  if (method === "tools/list") return { tools: MKBOARD_MCP_TOOLS };
  if (method === "tools/call") {
    const name = typeof params.name === "string" ? params.name : "";
    if (!MKBOARD_MCP_TOOLS.some((tool) => tool.name === name)) throw new JsonRpcError(-32602, `Unknown tool: ${name}`);
    const args = isRecord(params.arguments) ? params.arguments : {};
    try {
      const result = await bridge.callTool(name, args);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (error) {
      return { content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }], isError: true };
    }
  }
  if (method === "resources/list") return { resources: [] };
  if (method === "prompts/list") return { prompts: [] };
  throw new JsonRpcError(-32601, `Method not found: ${method}`);
}

type BridgeClient = {
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
};

function createBridgeClient(options: McpServerOptions, log: (message: string) => void): BridgeClient {
  let launchPromise: Promise<void> | null = null;

  const send = (request: Omit<McpBridgeRequest, "token">, timeoutMs: number): Promise<McpBridgeResponse> =>
    new Promise((resolve, reject) => {
      const socket = connect(options.socketPath);
      let buffer = "";
      let settled = false;
      const finish = (error: Error | null, response?: McpBridgeResponse) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        if (error) reject(error);
        else resolve(response as McpBridgeResponse);
      };
      const timer = setTimeout(() => finish(new Error("MkBoard 没有在限定时间内响应。")), timeoutMs);
      socket.setEncoding("utf8");
      socket.on("connect", () => {
        const token = readToken(options.tokenFile);
        socket.write(`${JSON.stringify({ ...request, token })}\n`);
      });
      socket.on("data", (chunk: string) => {
        buffer += chunk;
        const newlineIndex = buffer.indexOf("\n");
        if (newlineIndex < 0) return;
        try {
          finish(null, JSON.parse(buffer.slice(0, newlineIndex)) as McpBridgeResponse);
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)));
        }
      });
      socket.on("error", (error) => finish(error));
      socket.on("close", () => finish(new Error("MkBoard 关闭了连接。")));
    });

  const ensureAppRunning = async () => {
    if (!options.appLaunchPath) {
      throw new Error("MkBoard Desktop 没有运行。请先打开 MkBoard，再重试。");
    }
    if (!launchPromise) {
      launchPromise = (async () => {
        log(`launching MkBoard: ${options.appLaunchPath}`);
        launchApp(options.appLaunchPath as string);
        const deadline = Date.now() + APP_LAUNCH_TIMEOUT_MS;
        while (Date.now() < deadline) {
          await delay(500);
          try {
            const response = await send({ id: randomUUID(), version: MKBOARD_MCP_BRIDGE_VERSION, method: "ping" }, 2_000);
            if (response.ok) return;
          } catch {
            // keep waiting until the control socket is listening
          }
        }
        throw new Error("已尝试启动 MkBoard，但在 45 秒内没有就绪。请手动打开 MkBoard 后重试。");
      })().finally(() => {
        launchPromise = null;
      });
    }
    await launchPromise;
  };

  return {
    async callTool(name, args) {
      const request = {
        id: randomUUID(),
        version: MKBOARD_MCP_BRIDGE_VERSION,
        method: "call_tool" as const,
        params: { name, arguments: args, client: options.client }
      };
      let response: McpBridgeResponse;
      try {
        response = await send(request, TOOL_CALL_TIMEOUT_MS);
      } catch (error) {
        if (!isAppNotRunningError(error)) throw error;
        await ensureAppRunning();
        response = await send({ ...request, id: randomUUID() }, TOOL_CALL_TIMEOUT_MS);
      }
      if (!response.ok) throw new Error(response.error.message);
      return response.result;
    }
  };
}

function readToken(tokenFile: string): string {
  try {
    return readFileSync(tokenFile, "utf8").trim();
  } catch {
    return "";
  }
}

function launchApp(appLaunchPath: string): void {
  const child =
    process.platform === "darwin" && appLaunchPath.endsWith(".app")
      ? spawn("open", ["-a", appLaunchPath], { detached: true, stdio: "ignore" })
      : spawn(appLaunchPath, [], { detached: true, stdio: "ignore", env: withoutRunAsNode(process.env) });
  child.on("error", () => undefined);
  child.unref();
}

function withoutRunAsNode(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const next = { ...env };
  delete next.ELECTRON_RUN_AS_NODE;
  return next;
}

function isAppNotRunningError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === "ENOENT" || code === "ECONNREFUSED";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isMainModule(): boolean {
  return Boolean(process.env.MKBOARD_MCP_SOCKET) && process.env.MKBOARD_MCP_DISABLE_AUTORUN !== "1";
}

if (isMainModule()) {
  void runMkboardMcpServer({
    socketPath: process.env.MKBOARD_MCP_SOCKET as string,
    tokenFile: process.env.MKBOARD_MCP_TOKEN_FILE ?? "",
    appLaunchPath: process.env.MKBOARD_MCP_APP_LAUNCH_PATH || undefined,
    client: process.env.MKBOARD_MCP_CLIENT || undefined,
    version: process.env.MKBOARD_MCP_APP_VERSION || undefined
  }).then(() => process.exit(0));
}
