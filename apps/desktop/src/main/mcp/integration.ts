import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { mcpLauncherFileName, mcpServerNameForVariant, mcpStateFileName, MKBOARD_MCP_TOKEN_FILE_NAME, type McpBridgeVariant } from "./protocol";
import { MKBOARD_MCP_SKILL_MARKER, MKBOARD_MCP_SKILL_NAME, mkboardMcpSkillMarkdown } from "./skill-content";

// Registers the MkBoard MCP server with the user's local Claude Code and Codex installs.
// Only MkBoard's own entries are written or removed; everything else in those configs is kept byte-for-byte.

export type McpClientId = "claude_code" | "codex";

export type McpClientIntegrationStatus = {
  id: McpClientId;
  detected: boolean;
  registered: boolean;
  removedByUser: boolean;
  configPath: string;
  skillPath: string;
};

export type McpCommandSnippet = {
  id: string;
  label: string;
  command: string;
};

export type McpIntegrationStatus = {
  enabled: boolean;
  serverName: string;
  launcherPath: string;
  socketPath: string;
  clients: McpClientIntegrationStatus[];
  snippets: McpCommandSnippet[];
  error?: string;
};

type McpIntegrationState = {
  version: 1;
  // Absent in files written before dev/prod states were split (desktop <= 0.2.7).
  variant?: McpBridgeVariant;
  enabled: boolean;
  clients: Partial<Record<McpClientId, { registered?: boolean; removedByUser?: boolean }>>;
};

export type McpIntegrationOptions = {
  variant: McpBridgeVariant;
  userDataDir: string;
  homeDir: string;
  codexHome?: string;
  socketPath: string;
  electronExecPath: string;
  serverScriptPath: string;
  appLaunchPath?: string;
  appVersion: string;
  platform?: NodeJS.Platform;
};

export function syncMcpIntegration(options: McpIntegrationOptions): McpIntegrationStatus {
  const state = readState(options);
  const launcherPath = writeLauncher(options);
  if (state.enabled) {
    for (const client of clientIds) registerClient(options, state, client, launcherPath, false);
    writeState(options, state);
  }
  return getMcpIntegrationStatus(options);
}

export function setMcpIntegrationEnabled(options: McpIntegrationOptions, enabled: boolean): McpIntegrationStatus {
  const state = readState(options);
  state.enabled = enabled;
  const launcherPath = writeLauncher(options);
  for (const client of clientIds) {
    if (enabled) {
      state.clients[client] = { ...state.clients[client], removedByUser: false };
      registerClient(options, state, client, launcherPath, true);
    } else {
      unregisterClient(options, client);
      state.clients[client] = { registered: false, removedByUser: false };
    }
  }
  writeState(options, state);
  return getMcpIntegrationStatus(options);
}

export function getMcpIntegrationStatus(options: McpIntegrationOptions): McpIntegrationStatus {
  const state = readState(options);
  const serverName = mcpServerNameForVariant(options.variant);
  const launcher = launcherPathFor(options);
  const quotedLauncher = launcher.includes(" ") ? `"${launcher}"` : launcher;
  return {
    enabled: state.enabled,
    serverName,
    launcherPath: launcher,
    socketPath: options.socketPath,
    snippets: [
      { id: "claude-code", label: "Claude Code", command: `claude mcp add ${serverName} -- ${quotedLauncher}` },
      { id: "codex", label: "Codex CLI", command: `codex mcp add ${serverName} -- ${quotedLauncher}` },
      { id: "gemini-cli", label: "Gemini CLI", command: `gemini mcp add ${serverName} ${quotedLauncher}` },
      { id: "cursor", label: "Cursor / OpenCode (stdio)", command: quotedLauncher }
    ],
    clients: clientIds.map((client) => {
      const paths = clientPaths(options, client);
      return {
        id: client,
        detected: existsSync(paths.homeDir),
        registered: isRegistered(options, client),
        removedByUser: Boolean(state.clients[client]?.removedByUser),
        configPath: paths.configPath,
        skillPath: paths.skillDir
      };
    })
  };
}

/** True when the sidebar's own Codex runs must switch the MkBoard MCP server off. */
export function registeredCodexMcpServerNames(homeDir: string, codexHome?: string): string[] {
  const configPath = join(codexHome || join(homeDir, ".codex"), "config.toml");
  const text = readTextFile(configPath);
  return (["mkboard", "mkboard_dev"] as const).filter((name) => hasCodexMcpServer(text, name));
}

const clientIds: McpClientId[] = ["claude_code", "codex"];

function registerClient(options: McpIntegrationOptions, state: McpIntegrationState, client: McpClientId, launcherPath: string, force: boolean): void {
  const paths = clientPaths(options, client);
  if (!existsSync(paths.homeDir)) return;
  const clientState = state.clients[client] ?? {};
  const registeredNow = isRegistered(options, client);
  if (!force && clientState.registered && !registeredNow) {
    // MkBoard registered it before and the user removed it: respect that until they re-enable in settings.
    state.clients[client] = { registered: false, removedByUser: true };
    return;
  }
  if (!force && clientState.removedByUser) return;

  const serverName = mcpServerNameForVariant(options.variant);
  if (client === "claude_code") {
    const text = readTextFile(paths.configPath);
    const next = upsertClaudeMcpServer(text, serverName, {
      type: "stdio",
      command: launcherPath,
      args: [],
      env: { MKBOARD_MCP_CLIENT: "claude_code" }
    });
    if (next !== null && next !== text) writeFileAtomic(paths.configPath, next);
  } else {
    const text = readTextFile(paths.configPath);
    const next = upsertCodexMcpServer(text, serverName, launcherPath, { MKBOARD_MCP_CLIENT: "codex" });
    if (next !== text) writeFileAtomic(paths.configPath, next);
  }
  installSkill(paths.skillDir);
  state.clients[client] = { registered: true, removedByUser: false };
}

function unregisterClient(options: McpIntegrationOptions, client: McpClientId): void {
  const paths = clientPaths(options, client);
  const serverName = mcpServerNameForVariant(options.variant);
  const text = readTextFile(paths.configPath);
  if (text) {
    const next = client === "claude_code" ? removeClaudeMcpServer(text, serverName) : removeCodexMcpServer(text, serverName);
    if (next !== null && next !== text) writeFileAtomic(paths.configPath, next);
  }
  removeManagedSkill(paths.skillDir);
}

function isRegistered(options: McpIntegrationOptions, client: McpClientId): boolean {
  const paths = clientPaths(options, client);
  const serverName = mcpServerNameForVariant(options.variant);
  const text = readTextFile(paths.configPath);
  if (!text) return false;
  if (client === "codex") return hasCodexMcpServer(text, serverName);
  try {
    const parsed = JSON.parse(text) as { mcpServers?: Record<string, unknown> };
    return Boolean(parsed.mcpServers && serverName in parsed.mcpServers);
  } catch {
    return false;
  }
}

function clientPaths(options: McpIntegrationOptions, client: McpClientId) {
  if (client === "claude_code") {
    const homeDir = join(options.homeDir, ".claude");
    return { homeDir, configPath: join(options.homeDir, ".claude.json"), skillDir: join(homeDir, "skills", MKBOARD_MCP_SKILL_NAME) };
  }
  const homeDir = options.codexHome || join(options.homeDir, ".codex");
  return { homeDir, configPath: join(homeDir, "config.toml"), skillDir: join(homeDir, "skills", MKBOARD_MCP_SKILL_NAME) };
}

function launcherPathFor(options: McpIntegrationOptions): string {
  return join(options.userDataDir, mcpLauncherFileName(options.variant, options.platform ?? process.platform));
}

function writeLauncher(options: McpIntegrationOptions): string {
  const platform = options.platform ?? process.platform;
  const launcherPath = launcherPathFor(options);
  const env: Array<[string, string]> = [
    ["ELECTRON_RUN_AS_NODE", "1"],
    ["MKBOARD_MCP_SOCKET", options.socketPath],
    ["MKBOARD_MCP_TOKEN_FILE", join(options.userDataDir, MKBOARD_MCP_TOKEN_FILE_NAME)],
    ["MKBOARD_MCP_APP_VERSION", options.appVersion]
  ];
  if (options.appLaunchPath) env.push(["MKBOARD_MCP_APP_LAUNCH_PATH", options.appLaunchPath]);
  const content =
    platform === "win32"
      ? [
          "@echo off",
          "rem Managed by MkBoard Desktop. Regenerated on every app launch.",
          ...env.map(([key, value]) => `set "${key}=${value}"`),
          `"${options.electronExecPath}" "${options.serverScriptPath}" %*`,
          ""
        ].join("\r\n")
      : [
          "#!/bin/sh",
          "# Managed by MkBoard Desktop. Regenerated on every app launch.",
          ...env.map(([key, value]) => `export ${key}=${shellQuote(value)}`),
          `exec ${shellQuote(options.electronExecPath)} ${shellQuote(options.serverScriptPath)} "$@"`,
          ""
        ].join("\n");
  mkdirSync(dirname(launcherPath), { recursive: true });
  if (readTextFile(launcherPath) !== content) writeFileAtomic(launcherPath, content);
  if (platform !== "win32") chmodSync(launcherPath, 0o755);
  return launcherPath;
}

function installSkill(skillDir: string): void {
  const markerPath = join(skillDir, MKBOARD_MCP_SKILL_MARKER);
  if (existsSync(skillDir) && !existsSync(markerPath)) return; // a user-owned skill with the same name
  mkdirSync(skillDir, { recursive: true });
  const skillPath = join(skillDir, "SKILL.md");
  const content = mkboardMcpSkillMarkdown();
  if (readTextFile(skillPath) !== content) writeFileSync(skillPath, content);
  if (!existsSync(markerPath)) writeFileSync(markerPath, "This skill is installed and updated by MkBoard Desktop.\n");
}

function removeManagedSkill(skillDir: string): void {
  if (existsSync(join(skillDir, MKBOARD_MCP_SKILL_MARKER))) rmSync(skillDir, { recursive: true, force: true });
}

function readState(options: McpIntegrationOptions): McpIntegrationState {
  const fresh: McpIntegrationState = { version: 1, variant: options.variant, enabled: true, clients: {} };
  let parsed: Partial<McpIntegrationState>;
  try {
    parsed = JSON.parse(readFileSync(join(options.userDataDir, mcpStateFileName(options.variant)), "utf8")) as Partial<McpIntegrationState>;
  } catch {
    return fresh;
  }
  // Before the split, a development build on the same machine wrote its own registration into this
  // shared file, which production then misread as "the user removed mkboard". Such a legacy file can
  // only be trusted when no development entry was ever registered.
  if (parsed.variant !== options.variant && legacyStateMayBeFromDevelopment(options)) return fresh;
  return {
    version: 1,
    variant: options.variant,
    enabled: parsed.enabled !== false,
    clients: parsed.clients && typeof parsed.clients === "object" ? parsed.clients : {}
  };
}

function legacyStateMayBeFromDevelopment(options: McpIntegrationOptions): boolean {
  if (options.variant !== "production") return true;
  const devName = mcpServerNameForVariant("development");
  return clientIds.some((client) => {
    const text = readTextFile(clientPaths(options, client).configPath);
    if (!text) return false;
    if (client === "codex") return hasCodexMcpServer(text, devName);
    try {
      const parsed = JSON.parse(text) as { mcpServers?: Record<string, unknown> };
      return Boolean(parsed.mcpServers && devName in parsed.mcpServers);
    } catch {
      return false;
    }
  });
}

function writeState(options: McpIntegrationOptions, state: McpIntegrationState): void {
  writeFileAtomic(join(options.userDataDir, mcpStateFileName(options.variant)), `${JSON.stringify({ ...state, variant: options.variant }, null, 2)}\n`);
}

// ---------- Claude Code (~/.claude.json) ----------

export function upsertClaudeMcpServer(text: string, name: string, entry: Record<string, unknown>): string | null {
  let parsed: Record<string, unknown>;
  try {
    parsed = text.trim() ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    return null; // never rewrite a config we cannot parse
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const servers = parsed.mcpServers && typeof parsed.mcpServers === "object" && !Array.isArray(parsed.mcpServers) ? (parsed.mcpServers as Record<string, unknown>) : {};
  if (JSON.stringify(servers[name]) === JSON.stringify(entry)) return text;
  parsed.mcpServers = { ...servers, [name]: entry };
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

export function removeClaudeMcpServer(text: string, name: string): string | null {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
  const servers = parsed.mcpServers as Record<string, unknown> | undefined;
  if (!servers || !(name in servers)) return text;
  const { [name]: _removed, ...rest } = servers;
  parsed.mcpServers = rest;
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

// ---------- Codex (~/.codex/config.toml) ----------

export function hasCodexMcpServer(text: string, name: string): boolean {
  return text.split(/\r?\n/).some((line) => isCodexServerHeader(line, name));
}

export function upsertCodexMcpServer(text: string, name: string, command: string, env: Record<string, string>): string {
  const block = [
    `[mcp_servers.${name}]`,
    `command = ${tomlString(command)}`,
    "",
    `[mcp_servers.${name}.env]`,
    ...Object.entries(env).map(([key, value]) => `${key} = ${tomlString(value)}`)
  ].join("\n");
  // An inline `name = { ... }` entry under [mcp_servers] would become a duplicate key; leave it alone.
  if (new RegExp(`^\\s*"?${name}"?\\s*=\\s*\\{`, "m").test(text)) return text;
  const existing = extractCodexServerBlock(text, name);
  if (existing !== null && normalizeBlock(existing) === normalizeBlock(block)) return text;
  const withoutServer = removeCodexMcpServer(text, name).replace(/\s+$/, "");
  return `${withoutServer}${withoutServer ? "\n\n" : ""}${block}\n`;
}

export function removeCodexMcpServer(text: string, name: string): string {
  const lines = text.split(/\r?\n/);
  const kept: string[] = [];
  let skipping = false;
  for (const line of lines) {
    if (isTomlHeader(line)) skipping = isCodexServerHeader(line, name);
    if (!skipping) kept.push(line);
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n");
}

function extractCodexServerBlock(text: string, name: string): string | null {
  const lines = text.split(/\r?\n/);
  const block: string[] = [];
  let inside = false;
  for (const line of lines) {
    if (isTomlHeader(line)) inside = isCodexServerHeader(line, name);
    if (inside) block.push(line);
  }
  return block.length > 0 ? block.join("\n") : null;
}

function normalizeBlock(block: string): string {
  return block
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function isTomlHeader(line: string): boolean {
  return /^\s*\[/.test(line);
}

function isCodexServerHeader(line: string, name: string): boolean {
  const match = /^\s*\[\s*mcp_servers\s*\.\s*("?)([A-Za-z0-9_-]+)\1\s*(?:\.[^\]]*)?\]\s*(?:#.*)?$/.exec(line);
  return Boolean(match && match[2] === name);
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function readTextFile(filePath: string): string {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function writeFileAtomic(filePath: string, content: string): void {
  // Follow symlinks (dotfile managers) and keep the original permissions.
  const targetPath = existsSync(filePath) ? realpathSync(filePath) : filePath;
  const mode = existsSync(targetPath) ? statSync(targetPath).mode & 0o777 : 0o600;
  mkdirSync(dirname(targetPath), { recursive: true });
  const tempPath = `${targetPath}.mkboard-${process.pid}-${Date.now()}.tmp`;
  writeFileSync(tempPath, content, { mode });
  try {
    chmodSync(tempPath, mode);
    renameSync(tempPath, targetPath);
  } catch (error) {
    rmSync(tempPath, { force: true });
    throw error;
  }
}
