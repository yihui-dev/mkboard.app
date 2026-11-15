import { randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server, type Socket } from "node:net";
import { dirname } from "node:path";
import { MKBOARD_MCP_BRIDGE_VERSION, type McpBridgeRequest, type McpBridgeResponse } from "./protocol";

const MAX_REQUEST_BYTES = 8 * 1024 * 1024;

export type McpToolHandler = (name: string, args: Record<string, unknown>, context: { client?: string }) => Promise<unknown>;

export type McpControlServer = {
  socketPath: string;
  close(): Promise<void>;
};

export function ensureMcpToken(tokenFile: string): string {
  try {
    const existing = readFileSync(tokenFile, "utf8").trim();
    if (existing.length >= 32) return existing;
  } catch {
    // create below
  }
  mkdirSync(dirname(tokenFile), { recursive: true });
  const token = randomBytes(32).toString("base64url");
  writeFileSync(tokenFile, `${token}\n`, { mode: 0o600 });
  chmodSync(tokenFile, 0o600);
  return token;
}

export async function startMcpControlServer(options: {
  socketPath: string;
  tokenFile: string;
  handleTool: McpToolHandler;
  log?: (message: string, detail?: unknown) => void;
}): Promise<McpControlServer> {
  const log = options.log ?? (() => undefined);
  const expectedToken = Buffer.from(ensureMcpToken(options.tokenFile));
  const isPipe = options.socketPath.startsWith("\\\\");
  if (!isPipe && existsSync(options.socketPath)) rmSync(options.socketPath, { force: true });

  const server = createServer((socket) => handleConnection(socket, expectedToken, options.handleTool, log));
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.socketPath, () => {
      server.off("error", reject);
      resolve();
    });
  });
  if (!isPipe) chmodSync(options.socketPath, 0o600);
  server.on("error", (error) => log("control server error", error instanceof Error ? error.message : String(error)));

  return {
    socketPath: options.socketPath,
    close: () => closeServer(server, options.socketPath, isPipe)
  };
}

function handleConnection(socket: Socket, expectedToken: Buffer, handleTool: McpToolHandler, log: (message: string, detail?: unknown) => void): void {
  let buffer = "";
  let handled = false;
  socket.setEncoding("utf8");
  socket.on("error", () => undefined);
  socket.on("data", (chunk: string) => {
    if (handled) return;
    buffer += chunk;
    if (Buffer.byteLength(buffer) > MAX_REQUEST_BYTES) {
      handled = true;
      socket.end(`${JSON.stringify(errorResponse("", "request_too_large", "请求过大。"))}\n`);
      return;
    }
    const newlineIndex = buffer.indexOf("\n");
    if (newlineIndex < 0) return;
    handled = true;
    const line = buffer.slice(0, newlineIndex);
    void respond(line, expectedToken, handleTool, log).then((response) => {
      if (!socket.destroyed) socket.end(`${JSON.stringify(response)}\n`);
    });
  });
}

async function respond(
  line: string,
  expectedToken: Buffer,
  handleTool: McpToolHandler,
  log: (message: string, detail?: unknown) => void
): Promise<McpBridgeResponse> {
  let request: McpBridgeRequest;
  try {
    request = JSON.parse(line) as McpBridgeRequest;
  } catch {
    return errorResponse("", "bad_request", "无法解析请求。");
  }
  const id = typeof request.id === "string" ? request.id : "";
  if (!tokenMatches(request.token, expectedToken)) return errorResponse(id, "unauthorized", "MkBoard MCP 令牌无效。请在 MkBoard 设置里重新连接 Claude Code / Codex。");
  if (request.version !== MKBOARD_MCP_BRIDGE_VERSION) {
    return errorResponse(id, "version_mismatch", "MkBoard MCP 版本不匹配。请重启 Claude Code / Codex 会话后重试。");
  }
  if (request.method === "ping") return { id, ok: true, result: { pong: true } };
  if (request.method !== "call_tool") return errorResponse(id, "unknown_method", `未知方法：${String(request.method)}`);
  const name = typeof request.params?.name === "string" ? request.params.name : "";
  const args = request.params?.arguments && typeof request.params.arguments === "object" ? request.params.arguments : {};
  const startedAt = Date.now();
  try {
    const result = await handleTool(name, args, { client: request.params?.client });
    log("tool call succeeded", { name, client: request.params?.client, durationMs: Date.now() - startedAt });
    return { id, ok: true, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log("tool call failed", { name, client: request.params?.client, message });
    return errorResponse(id, "tool_error", message);
  }
}

function tokenMatches(token: unknown, expectedToken: Buffer): boolean {
  if (typeof token !== "string") return false;
  const actual = Buffer.from(token);
  return actual.length === expectedToken.length && timingSafeEqual(actual, expectedToken);
}

function errorResponse(id: string, code: string, message: string): McpBridgeResponse {
  return { id, ok: false, error: { code, message } };
}

function closeServer(server: Server, socketPath: string, isPipe: boolean): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => {
      if (!isPipe) rmSync(socketPath, { force: true });
      resolve();
    });
  });
}
