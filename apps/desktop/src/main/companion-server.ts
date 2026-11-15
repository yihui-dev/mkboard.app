import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { chmodSync, createReadStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { networkInterfaces } from "node:os";
import { dirname, extname, join, normalize, resolve } from "node:path";
import type { CompanionAccessMode, CompanionEndpoint, CompanionServerStatus } from "../shared";
import { renderQrSvg } from "./qr-svg";

const SESSION_COOKIE_NAME = "mkboard_companion_session";
const DEFAULT_COMPANION_PORT = 3780;
const MAX_UPLOAD_BODY_BYTES = 250 * 1024 * 1024; // 250 MB media upload cap

type StoredCompanionConfig = {
  version: 1;
  mode: CompanionAccessMode;
  port: number;
  token: string;
};

export type CompanionRpcDispatcher = (method: string, args: unknown[]) => Promise<unknown>;

export type CompanionMcpHandler = (jsonRpcMessage: Record<string, unknown>) => Promise<Record<string, unknown> | null>;

export type CompanionServerOptions = {
  dataDir: string;
  rendererDistDir: string;
  resolveAssetPath: (assetId: string, poster: boolean, firstFrame?: boolean) => string | null | Promise<string | null>;
  dispatchRpc: CompanionRpcDispatcher;
  handleMcpRequest?: CompanionMcpHandler;
  defaultMode?: CompanionAccessMode;
  defaultPort?: number;
};

export class CompanionServer {
  private readonly configPath: string;
  private readonly uploadsDir: string;
  private readonly rendererDistDir: string;
  private readonly resolveAssetPath: CompanionServerOptions["resolveAssetPath"];
  private readonly dispatchRpc: CompanionRpcDispatcher;
  private readonly handleMcpRequest?: CompanionMcpHandler;
  private config: StoredCompanionConfig;
  private server: Server | null = null;
  private actualPort: number;
  private lastError: string | undefined;
  private readonly sseClients = new Set<ServerResponse>();
  private keepaliveTimer: NodeJS.Timeout | null = null;

  constructor(options: CompanionServerOptions) {
    this.configPath = join(options.dataDir, "companion-config.json");
    this.uploadsDir = join(options.dataDir, "companion-uploads");
    this.rendererDistDir = options.rendererDistDir;
    this.resolveAssetPath = options.resolveAssetPath;
    this.dispatchRpc = options.dispatchRpc;
    this.handleMcpRequest = options.handleMcpRequest;
    this.config = this.loadOrCreateConfig(options.defaultMode, options.defaultPort);
    this.actualPort = this.config.port;
  }

  async start(): Promise<CompanionServerStatus> {
    if (this.config.mode === "off") {
      await this.stop();
      return this.getStatus();
    }
    await this.rebindServer();
    return this.getStatus();
  }

  async setMode(mode: CompanionAccessMode, port?: number): Promise<CompanionServerStatus> {
    this.config.mode = mode;
    if (typeof port === "number" && Number.isFinite(port) && port >= 1024 && port <= 65535) {
      this.config.port = Math.round(port);
    }
    this.saveConfig();
    return this.start();
  }

  async rotateToken(): Promise<CompanionServerStatus> {
    this.config.token = randomBytes(24).toString("hex");
    this.saveConfig();
    return this.getStatus();
  }

  async stop(): Promise<void> {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
    for (const client of this.sseClients) {
      try {
        client.end();
      } catch {
        // Ignore closed socket
      }
    }
    this.sseClients.clear();
    if (!this.server) return;
    const active = this.server;
    this.server = null;
    await new Promise<void>((res) => active.close(() => res()));
  }

  broadcastEvent(channel: string, payload: unknown): void {
    if (this.sseClients.size === 0) return;
    const frame = `event: ${channel}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(frame);
      } catch {
        this.sseClients.delete(client);
      }
    }
  }

  getStatus(): CompanionServerStatus {
    const running = Boolean(this.server?.listening) && this.config.mode !== "off";
    const endpoints = running ? discoverCompanionEndpoints(this.config.mode, this.actualPort, this.config.token) : [];
    const preferred =
      endpoints.find((e) => e.kind === "tailscale") ??
      endpoints.find((e) => e.kind === "lan") ??
      endpoints[0] ??
      null;
    const primaryPairingUrl = preferred?.pairingUrl ?? null;
    const mcpBase = preferred?.url ?? (running ? `http://127.0.0.1:${this.actualPort}` : null);
    return {
      running,
      mode: this.config.mode,
      port: this.actualPort,
      tokenPreview: `${this.config.token.slice(0, 6)}••••${this.config.token.slice(-4)}`,
      mcpHttpUrl: mcpBase ? `${mcpBase}/mcp` : null,
      endpoints,
      primaryPairingUrl,
      qrSvg: primaryPairingUrl ? renderQrSvg(primaryPairingUrl) : null,
      connectedClients: this.sseClients.size,
      error: this.lastError
    };
  }

  private async rebindServer(): Promise<void> {
    await this.stop();
    this.lastError = undefined;
    const bindHost = this.config.mode === "network-accessible" ? "0.0.0.0" : "127.0.0.1";

    const tryListen = (port: number): Promise<number> =>
      new Promise((resolvePort, rejectPort) => {
        const srv = createServer((req, res) => {
          void this.handleHttpRequest(req, res);
        });
        srv.once("error", (err: NodeJS.ErrnoException) => {
          srv.close();
          rejectPort(err);
        });
        srv.listen(port, bindHost, () => {
          const addr = srv.address();
          const boundPort = typeof addr === "object" && addr ? addr.port : port;
          this.server = srv;
          resolvePort(boundPort);
        });
      });

    try {
      try {
        this.actualPort = await tryListen(this.config.port);
      } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code === "EADDRINUSE") {
          this.actualPort = await tryListen(0);
        } else {
          throw err;
        }
      }
      this.keepaliveTimer = setInterval(() => {
        for (const client of this.sseClients) {
          try {
            client.write(": keepalive\n\n");
          } catch {
            this.sseClients.delete(client);
          }
        }
      }, 25_000);
      this.keepaliveTimer.unref();
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
    }
  }

  private async handleHttpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
      const pathname = url.pathname;

      // Health endpoint
      if (pathname === "/api/health" && req.method === "GET") {
        sendJson(res, 200, { ok: true, mode: this.config.mode });
        return;
      }

      // Token -> HttpOnly Cookie pairing endpoint (reads token from body so URL fragment #token=... never hits server query logs)
      if (pathname === "/api/pair" && req.method === "POST") {
        const body = (await readJsonBody(req, 16 * 1024)) as { token?: string };
        const candidate = typeof body?.token === "string" ? body.token.trim() : "";
        if (!this.verifyToken(candidate)) {
          sendJson(res, 401, { ok: false, error: "Invalid pairing token." });
          return;
        }
        res.setHeader(
          "Set-Cookie",
          `${SESSION_COOKIE_NAME}=${encodeURIComponent(this.config.token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`
        );
        sendJson(res, 200, { ok: true });
        return;
      }

      // Streamable HTTP MCP endpoint (/mcp)
      if (pathname === "/mcp") {
        if (!this.isAuthorized(req)) {
          sendJson(res, 401, { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized. Pass Authorization: Bearer <token>." } });
          return;
        }
        if (req.method !== "POST") {
          sendJson(res, 405, { error: "Use POST /mcp with JSON-RPC 2.0 body." });
          return;
        }
        if (!this.handleMcpRequest) {
          sendJson(res, 503, { jsonrpc: "2.0", id: null, error: { code: -32000, message: "MCP host is not active." } });
          return;
        }
        const rpcMsg = (await readJsonBody(req, 8 * 1024 * 1024)) as Record<string, unknown>;
        const responseMsg = await this.handleMcpRequest(rpcMsg);
        if (!responseMsg) {
          res.writeHead(202).end();
          return;
        }
        sendJson(res, 200, responseMsg);
        return;
      }

      // API & Asset routes require session authorization
      if (pathname.startsWith("/api/")) {
        if (!this.isAuthorized(req)) {
          sendJson(res, 401, { ok: false, error: "Companion pairing required. Scan the QR code or open the #token= pairing link from MkBoard Desktop." });
          return;
        }

        if (pathname === "/api/events" && req.method === "GET") {
          res.writeHead(200, {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no"
          });
          res.write(": connected\n\n");
          this.sseClients.add(res);
          req.on("close", () => {
            this.sseClients.delete(res);
          });
          return;
        }

        if (pathname.startsWith("/api/assets/") && (req.method === "GET" || req.method === "HEAD")) {
          const rawTail = pathname.slice("/api/assets/".length);
          const assetId = decodeURIComponent(rawTail.split("/")[0] || "");
          const poster = url.searchParams.get("poster") === "1";
          const firstFrame = url.searchParams.get("firstFrame") === "1";
          const filePath = assetId ? await this.resolveAssetPath(assetId, poster, firstFrame) : null;
          if (!filePath || !existsSync(filePath)) {
            res.writeHead(404).end("Asset not found");
            return;
          }
          streamFileWithRange(req, res, filePath);
          return;
        }

        if (pathname === "/api/upload" && req.method === "POST") {
          const payload = (await readJsonBody(req, MAX_UPLOAD_BODY_BYTES)) as { fileName?: string; base64Data?: string };
          const rawName = (payload?.fileName || "upload.bin").replace(/[^a-zA-Z0-9._\u4e00-\u9fa5-]+/g, "-");
          const rawB64 = String(payload?.base64Data || "").replace(/^data:[^;]+;base64,/, "");
          if (!rawB64) {
            sendJson(res, 400, { ok: false, error: "Missing base64Data." });
            return;
          }
          mkdirSync(this.uploadsDir, { recursive: true });
          const destPath = join(this.uploadsDir, `${randomUUID().slice(0, 8)}-${rawName}`);
          writeFileSync(destPath, Buffer.from(rawB64, "base64"));
          sendJson(res, 200, { ok: true, filePath: destPath });
          return;
        }

        if (pathname.startsWith("/api/rpc/") && req.method === "POST") {
          const method = decodeURIComponent(pathname.slice("/api/rpc/".length));
          const body = (await readJsonBody(req, 32 * 1024 * 1024)) as { args?: unknown[] };
          const args = Array.isArray(body?.args) ? body.args : [];
          try {
            const result = await this.dispatchRpc(method, args);
            sendJson(res, 200, { ok: true, result });
          } catch (error) {
            sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
          }
          return;
        }

        sendJson(res, 404, { ok: false, error: `Unknown API endpoint: ${pathname}` });
        return;
      }

      // Serve compiled React Storyboard UI static files (SPA fallback to index.html)
      this.serveStaticRenderer(req, res, pathname);
    } catch (error) {
      if (!res.headersSent) {
        sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
      } else {
        res.end();
      }
    }
  }

  private serveStaticRenderer(req: IncomingMessage, res: ServerResponse, pathname: string): void {
    if (!existsSync(this.rendererDistDir)) {
      res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("MkBoard Web Companion renderer bundle not built yet. Run pnpm --filter @mkboard/desktop build first.");
      return;
    }

    const safeRel = normalize(pathname === "/" ? "index.html" : pathname.replace(/^\/+/, ""));
    let candidate = resolve(this.rendererDistDir, safeRel);
    if (!candidate.startsWith(resolve(this.rendererDistDir))) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    if (!existsSync(candidate) || statSync(candidate).isDirectory()) {
      candidate = join(this.rendererDistDir, "index.html");
    }
    if (!existsSync(candidate)) {
      res.writeHead(404).end("Not found");
      return;
    }
    streamFileWithRange(req, res, candidate);
  }

  private isAuthorized(req: IncomingMessage): boolean {
    if (this.config.mode === "local-only" && isLoopbackAddress(req.socket.remoteAddress)) {
      return true;
    }
    const authHeader = req.headers.authorization || "";
    if (authHeader.toLowerCase().startsWith("bearer ")) {
      const bearer = authHeader.slice(7).trim();
      if (this.verifyToken(bearer)) return true;
    }
    const cookies = parseCookies(req.headers.cookie || "");
    const cookieToken = cookies[SESSION_COOKIE_NAME];
    return Boolean(cookieToken && this.verifyToken(cookieToken));
  }

  private verifyToken(candidate: string): boolean {
    const a = Buffer.from(candidate, "utf8");
    const b = Buffer.from(this.config.token, "utf8");
    if (a.length !== b.length || a.length === 0) return false;
    return timingSafeEqual(a, b);
  }

  private loadOrCreateConfig(defaultMode?: CompanionAccessMode, defaultPort?: number): StoredCompanionConfig {
    const envMode = normalizeCompanionMode(process.env.MKBOARD_COMPANION_MODE);
    const envPort = Number.parseInt(process.env.MKBOARD_COMPANION_PORT || "", 10);

    if (existsSync(this.configPath)) {
      try {
        const parsed = JSON.parse(readFileSync(this.configPath, "utf8")) as Partial<StoredCompanionConfig>;
        if (parsed.token && typeof parsed.token === "string" && parsed.token.length >= 24) {
          return {
            version: 1,
            mode: envMode ?? normalizeCompanionMode(parsed.mode) ?? defaultMode ?? "local-only",
            port: Number.isFinite(envPort) && envPort >= 1024 ? envPort : parsed.port && parsed.port >= 1024 ? parsed.port : defaultPort ?? DEFAULT_COMPANION_PORT,
            token: process.env.MKBOARD_COMPANION_TOKEN?.trim() || parsed.token
          };
        }
      } catch {
        // Regenerate below
      }
    }

    const fresh: StoredCompanionConfig = {
      version: 1,
      mode: envMode ?? defaultMode ?? "local-only",
      port: Number.isFinite(envPort) && envPort >= 1024 ? envPort : defaultPort ?? DEFAULT_COMPANION_PORT,
      token: process.env.MKBOARD_COMPANION_TOKEN?.trim() || randomBytes(24).toString("hex")
    };
    this.config = fresh;
    this.saveConfig();
    return fresh;
  }

  private saveConfig(): void {
    mkdirSync(dirname(this.configPath), { recursive: true });
    const temp = `${this.configPath}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(temp, `${JSON.stringify(this.config, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    try {
      if (process.platform !== "win32") chmodSync(temp, 0o600);
      renameSync(temp, this.configPath);
    } catch (error) {
      rmSync(temp, { force: true });
      throw error;
    }
  }
}

function normalizeCompanionMode(raw: unknown): CompanionAccessMode | null {
  if (raw === "off" || raw === "local-only" || raw === "network-accessible") return raw;
  return null;
}

function isLoopbackAddress(addr?: string): boolean {
  if (!addr) return false;
  return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
}

function discoverCompanionEndpoints(mode: CompanionAccessMode, port: number, token: string): CompanionEndpoint[] {
  const endpoints: CompanionEndpoint[] = [
    {
      label: "Localhost",
      kind: "loopback",
      url: `http://127.0.0.1:${port}`,
      pairingUrl: `http://127.0.0.1:${port}/#token=${token}`
    }
  ];
  if (mode !== "network-accessible") return endpoints;

  const nets = networkInterfaces();
  for (const [ifName, addrs] of Object.entries(nets)) {
    for (const info of addrs ?? []) {
      if (info.family !== "IPv4" || info.internal) continue;
      const ip = info.address;
      const kind = isTailscaleIpv4(ip) ? "tailscale" : "lan";
      const url = `http://${ip}:${port}`;
      endpoints.push({
        label: kind === "tailscale" ? `Tailscale (${ifName})` : `LAN (${ifName})`,
        kind,
        url,
        pairingUrl: `${url}/#token=${token}`
      });
    }
  }
  return endpoints;
}

function isTailscaleIpv4(ip: string): boolean {
  const parts = ip.split(".").map((n) => Number.parseInt(n, 10));
  return parts.length === 4 && parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127;
}

function parseCookies(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of header.split(";")) {
    const idx = pair.indexOf("=");
    if (idx <= 0) continue;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": String(Buffer.byteLength(body))
  });
  res.end(body);
}

function readJsonBody(req: IncomingMessage, maxBytes: number): Promise<unknown> {
  return new Promise((resolveBody, rejectBody) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        req.destroy();
        rejectBody(new Error("Payload too large."));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) {
        resolveBody({});
        return;
      }
      try {
        resolveBody(JSON.parse(raw));
      } catch (err) {
        rejectBody(err);
      }
    });
    req.on("error", rejectBody);
  });
}

function streamFileWithRange(req: IncomingMessage, res: ServerResponse, filePath: string): void {
  const stat = statSync(filePath);
  const fileSize = stat.size;
  const contentType = mimeForPath(filePath);
  const rangeHeader = req.headers.range;

  if (!rangeHeader) {
    res.writeHead(200, {
      "Accept-Ranges": "bytes",
      "Content-Type": contentType,
      "Content-Length": String(fileSize)
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    createReadStream(filePath).pipe(res);
    return;
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match || fileSize <= 0) {
    res.writeHead(416, { "Content-Range": `bytes */${fileSize}` }).end();
    return;
  }
  const [, rawStart, rawEnd] = match;
  let start = rawStart ? Number.parseInt(rawStart, 10) : Math.max(0, fileSize - Number.parseInt(rawEnd || "0", 10));
  let end = rawStart && rawEnd ? Number.parseInt(rawEnd, 10) : fileSize - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= fileSize) {
    res.writeHead(416, { "Content-Range": `bytes */${fileSize}` }).end();
    return;
  }
  end = Math.min(end, fileSize - 1);
  res.writeHead(206, {
    "Accept-Ranges": "bytes",
    "Content-Type": contentType,
    "Content-Length": String(end - start + 1),
    "Content-Range": `bytes ${start}-${end}/${fileSize}`
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  createReadStream(filePath, { start, end }).pipe(res);
}

function mimeForPath(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js" || ext === ".mjs") return "application/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".woff2") return "font/woff2";
  if (ext === ".woff") return "font/woff";
  if (ext === ".ttf") return "font/ttf";
  if (ext === ".mp4" || ext === ".m4v") return "video/mp4";
  if (ext === ".webm") return "video/webm";
  if (ext === ".mov") return "video/quicktime";
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".wav") return "audio/wav";
  return "application/octet-stream";
}
