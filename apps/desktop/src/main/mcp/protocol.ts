import { createHash } from "node:crypto";
import { join } from "node:path";

// Shared by the Electron main process (control server) and the stdio MCP server process.
// Keep this file free of Electron imports: the MCP server runs with ELECTRON_RUN_AS_NODE=1.

export const MKBOARD_MCP_BRIDGE_VERSION = 1;
export const MKBOARD_MCP_TOKEN_FILE_NAME = "mcp-token";
export const MKBOARD_MCP_STATE_FILE_NAME = "mcp-integration-state.json";

// Development and production builds share one userData folder (app name "MkBoard"), so each keeps its
// own registration state. Production keeps the original file name for existing installs.
export function mcpStateFileName(variant: McpBridgeVariant): string {
  return variant === "production" ? MKBOARD_MCP_STATE_FILE_NAME : "mcp-integration-state-dev.json";
}

export type McpBridgeVariant = "production" | "development";

export type McpBridgeRequest = {
  id: string;
  version: number;
  token: string;
  method: "call_tool" | "ping";
  params?: {
    name?: string;
    arguments?: Record<string, unknown>;
    client?: string;
  };
};

export type McpBridgeResponse =
  | { id: string; ok: true; result: unknown }
  | { id: string; ok: false; error: { code: string; message: string } };

export function mcpServerNameForVariant(variant: McpBridgeVariant): string {
  return variant === "production" ? "mkboard" : "mkboard_dev";
}

export function mcpLauncherFileName(variant: McpBridgeVariant, platform: NodeJS.Platform = process.platform): string {
  const base = variant === "production" ? "mkboard-mcp" : "mkboard-mcp-dev";
  return platform === "win32" ? `${base}.cmd` : base;
}

export function resolveMcpSocketPath(userDataDir: string, variant: McpBridgeVariant, platform: NodeJS.Platform = process.platform): string {
  const suffix = variant === "production" ? "" : "-dev";
  if (platform === "win32") {
    const hash = createHash("sha256").update(userDataDir.toLowerCase()).digest("hex").slice(0, 16);
    return `\\\\.\\pipe\\mkboard-mcp${suffix}-${hash}`;
  }
  const socketPath = join(userDataDir, `mcp${suffix}.sock`);
  // macOS limits unix socket paths to 104 bytes. Very long home directories fall back to /tmp.
  if (Buffer.byteLength(socketPath) < 100) return socketPath;
  const hash = createHash("sha256").update(userDataDir).digest("hex").slice(0, 16);
  return join("/tmp", `mkboard-mcp${suffix}-${hash}.sock`);
}
