export interface Env {
  SYNC_BUCKET: R2Bucket;
  SYNC_TOKEN: string;
  CORS_ORIGIN?: string;
}

export interface SyncedShotMedia {
  kind: "image" | "video";
  hash: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  posterHash?: string | null;
  posterMimeType?: string | null;
  hasEmbeddedAudio?: boolean;
}

export interface SyncedShotAudio {
  source: "elevenlabs-cache" | "project-asset";
  hash: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

export interface SyncedShot {
  id: string;
  position: number;
  shotNumber: string;
  scene: string;
  duration: string;
  content: string;
  note: string;
  generationMethod?: string;
  media: SyncedShotMedia[];
  audio: SyncedShotAudio | null;
}

export interface SyncedProjectManifest {
  schemaVersion: 1;
  projectId: string;
  name: string;
  icon: string;
  imageRatio: string;
  coverHash?: string | null;
  coverMimeType?: string | null;
  updatedAt: string;
  syncedAt: string;
  revision: number;
  shotCount: number;
  shots: SyncedShot[];
}

export interface SyncedProjectSummary {
  projectId: string;
  name: string;
  icon: string;
  imageRatio: string;
  coverHash?: string | null;
  shotCount: number;
  updatedAt: string;
  syncedAt: string;
  revision: number;
}

interface ProjectIndexDocument {
  schemaVersion: 1;
  updatedAt: string;
  projects: SyncedProjectSummary[];
}

const INDEX_KEY = "v1/index.json";
const SHA256_RE = /^[a-f0-9]{64}$/i;
const PROJECT_ID_RE = /^[a-zA-Z0-9._\-\u4e00-\u9fff]{1,160}$/;

function corsHeaders(env: Env, request: Request): Headers {
  const headers = new Headers();
  const origin = env.CORS_ORIGIN || "*";
  const reqOrigin = request.headers.get("Origin");
  headers.set("Access-Control-Allow-Origin", origin === "*" ? "*" : reqOrigin === origin ? origin : origin);
  headers.set("Access-Control-Allow-Methods", "GET, HEAD, PUT, POST, DELETE, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, Range, If-None-Match, X-Mkboard-Mime");
  headers.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges, ETag, Content-Type");
  headers.set("Access-Control-Max-Age", "86400");
  return headers;
}

function jsonResponse(env: Env, request: Request, data: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  const headers = corsHeaders(env, request);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  if (extraHeaders) {
    for (const [k, v] of Object.entries(extraHeaders)) headers.set(k, v);
  }
  return new Response(JSON.stringify(data), { status, headers });
}

function constantTimeEquals(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i += 1) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

function extractToken(request: Request, url: URL): string | null {
  const auth = request.headers.get("Authorization");
  if (auth && auth.startsWith("Bearer ")) {
    return auth.slice("Bearer ".length).trim();
  }
  const queryToken = url.searchParams.get("token");
  if (queryToken && queryToken.trim()) {
    return queryToken.trim();
  }
  return null;
}

function checkAuth(env: Env, request: Request, url: URL): Response | null {
  const expected = (env.SYNC_TOKEN || "").trim();
  if (!expected) {
    return jsonResponse(env, request, { ok: false, error: "server_token_not_configured" }, 500);
  }
  const provided = extractToken(request, url);
  if (!provided || !constantTimeEquals(provided, expected)) {
    return jsonResponse(env, request, { ok: false, error: "unauthorized" }, 401);
  }
  return null;
}

function sanitizeProjectId(raw: string): string | null {
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (!decoded || decoded.includes("/") || decoded.includes("\\") || decoded.includes("..")) return null;
  if (!PROJECT_ID_RE.test(decoded)) return null;
  return decoded;
}

function blobKey(hash: string): string {
  return `v1/blobs/${hash.toLowerCase()}`;
}

function manifestKey(projectId: string): string {
  return `v1/projects/${encodeURIComponent(projectId)}/storyboard.json`;
}

async function readIndex(bucket: R2Bucket): Promise<ProjectIndexDocument> {
  const obj = await bucket.get(INDEX_KEY);
  if (!obj) {
    return { schemaVersion: 1, updatedAt: new Date(0).toISOString(), projects: [] };
  }
  try {
    const parsed = (await obj.json()) as Partial<ProjectIndexDocument>;
    const projects = Array.isArray(parsed.projects) ? parsed.projects : [];
    return {
      schemaVersion: 1,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
      projects
    };
  } catch {
    return { schemaVersion: 1, updatedAt: new Date(0).toISOString(), projects: [] };
  }
}

async function writeIndex(bucket: R2Bucket, doc: ProjectIndexDocument): Promise<void> {
  await bucket.put(INDEX_KEY, JSON.stringify(doc), {
    httpMetadata: { contentType: "application/json; charset=utf-8" }
  });
}

function parseByteRange(rangeHeader: string | null, totalSize: number): { offset: number; length: number; end: number } | "invalid" | null {
  if (!rangeHeader) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!match) return "invalid";
  const [, startStr, endStr] = match;
  if (!startStr && !endStr) return "invalid";

  if (!startStr) {
    const suffixLength = Number.parseInt(endStr, 10);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return "invalid";
    const length = Math.min(suffixLength, totalSize);
    const offset = Math.max(0, totalSize - length);
    return { offset, length, end: offset + length - 1 };
  }

  const start = Number.parseInt(startStr, 10);
  const end = endStr ? Math.min(Number.parseInt(endStr, 10), totalSize - 1) : totalSize - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= totalSize || end < start) {
    return "invalid";
  }
  return { offset: start, length: end - start + 1, end };
}

function buildBlobUrl(baseOrigin: string, hash: string): string {
  return `${baseOrigin}/v1/blobs/${hash.toLowerCase()}`;
}

function enrichManifestUrls(manifest: SyncedProjectManifest, baseOrigin: string) {
  return {
    ...manifest,
    coverUrl: manifest.coverHash ? buildBlobUrl(baseOrigin, manifest.coverHash) : null,
    shots: manifest.shots.map((shot) => ({
      ...shot,
      media: shot.media.map((m) => ({
        ...m,
        url: buildBlobUrl(baseOrigin, m.hash),
        posterUrl: m.posterHash ? buildBlobUrl(baseOrigin, m.posterHash) : null
      })),
      audio: shot.audio
        ? {
            ...shot.audio,
            url: buildBlobUrl(baseOrigin, shot.audio.hash)
          }
        : null
    }))
  };
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(env, request) });
  }

  if (request.method === "GET" && path === "/health") {
    return jsonResponse(env, request, { ok: true, service: "mkboard-sync", version: "1.0.0" });
  }

  // All /v1/* routes require SYNC_TOKEN
  if (!path.startsWith("/v1/")) {
    return jsonResponse(env, request, { ok: false, error: "not_found" }, 404);
  }

  const authError = checkAuth(env, request, url);
  if (authError) return authError;

  // GET /v1/verify
  if (request.method === "GET" && path === "/v1/verify") {
    const index = await readIndex(env.SYNC_BUCKET);
    return jsonResponse(env, request, {
      ok: true,
      service: "mkboard-sync",
      version: "1.0.0",
      projectCount: index.projects.length,
      updatedAt: index.updatedAt
    });
  }

  // GET /v1/projects
  if (request.method === "GET" && path === "/v1/projects") {
    const index = await readIndex(env.SYNC_BUCKET);
    const origin = url.origin;
    const projects = index.projects.map((p) => ({
      ...p,
      coverUrl: p.coverHash ? buildBlobUrl(origin, p.coverHash) : null
    }));
    return jsonResponse(env, request, {
      ok: true,
      updatedAt: index.updatedAt,
      projects
    });
  }

  // POST /v1/blobs/check
  if (request.method === "POST" && path === "/v1/blobs/check") {
    let body: { hashes?: unknown };
    try {
      body = (await request.json()) as { hashes?: unknown };
    } catch {
      return jsonResponse(env, request, { ok: false, error: "invalid_json" }, 400);
    }
    if (!Array.isArray(body.hashes) || body.hashes.length > 500) {
      return jsonResponse(env, request, { ok: false, error: "invalid_hashes" }, 400);
    }
    const normalized: string[] = [];
    const seen = new Set<string>();
    for (const raw of body.hashes) {
      if (typeof raw !== "string" || !SHA256_RE.test(raw)) continue;
      const lower = raw.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        normalized.push(lower);
      }
    }

    const existing: string[] = [];
    const missing: string[] = [];
    await Promise.all(
      normalized.map(async (hash) => {
        const head = await env.SYNC_BUCKET.head(blobKey(hash));
        if (head) existing.push(hash);
        else missing.push(hash);
      })
    );
    return jsonResponse(env, request, { ok: true, existing, missing });
  }

  // Multipart upload routes for large 4K videos:
  // POST /v1/blobs/:hash/multipart/init
  const mpInitMatch = /^\/v1\/blobs\/([a-f0-9]{64})\/multipart\/init$/i.exec(path);
  if (request.method === "POST" && mpInitMatch) {
    const hash = mpInitMatch[1].toLowerCase();
    let contentType = "application/octet-stream";
    try {
      const payload = (await request.json()) as { mimeType?: string };
      if (typeof payload.mimeType === "string" && payload.mimeType.trim()) {
        contentType = payload.mimeType.trim();
      }
    } catch {
      // Optional body
    }
    const upload = await env.SYNC_BUCKET.createMultipartUpload(blobKey(hash), {
      httpMetadata: { contentType }
    });
    return jsonResponse(env, request, { ok: true, hash, uploadId: upload.uploadId });
  }

  // PUT /v1/blobs/:hash/multipart/:uploadId/part/:partNumber
  const mpPartMatch = /^\/v1\/blobs\/([a-f0-9]{64})\/multipart\/([^/]+)\/part\/(\d+)$/i.exec(path);
  if (request.method === "PUT" && mpPartMatch) {
    const hash = mpPartMatch[1].toLowerCase();
    const uploadId = decodeURIComponent(mpPartMatch[2]);
    const partNumber = Number.parseInt(mpPartMatch[3], 10);
    if (!Number.isFinite(partNumber) || partNumber < 1 || partNumber > 10000 || !request.body) {
      return jsonResponse(env, request, { ok: false, error: "invalid_part" }, 400);
    }
    const upload = env.SYNC_BUCKET.resumeMultipartUpload(blobKey(hash), uploadId);
    const part = await upload.uploadPart(partNumber, request.body);
    return jsonResponse(env, request, { ok: true, partNumber: part.partNumber, etag: part.etag });
  }

  // POST /v1/blobs/:hash/multipart/:uploadId/complete
  const mpCompleteMatch = /^\/v1\/blobs\/([a-f0-9]{64})\/multipart\/([^/]+)\/complete$/i.exec(path);
  if (request.method === "POST" && mpCompleteMatch) {
    const hash = mpCompleteMatch[1].toLowerCase();
    const uploadId = decodeURIComponent(mpCompleteMatch[2]);
    let body: { parts?: Array<{ partNumber: number; etag: string }> };
    try {
      body = (await request.json()) as { parts?: Array<{ partNumber: number; etag: string }> };
    } catch {
      return jsonResponse(env, request, { ok: false, error: "invalid_json" }, 400);
    }
    if (!Array.isArray(body.parts) || body.parts.length === 0) {
      return jsonResponse(env, request, { ok: false, error: "missing_parts" }, 400);
    }
    const upload = env.SYNC_BUCKET.resumeMultipartUpload(blobKey(hash), uploadId);
    const obj = await upload.complete(body.parts);
    return jsonResponse(env, request, { ok: true, hash, size: obj.size, etag: obj.httpEtag });
  }

  // DELETE /v1/blobs/:hash/multipart/:uploadId
  const mpAbortMatch = /^\/v1\/blobs\/([a-f0-9]{64})\/multipart\/([^/]+)$/i.exec(path);
  if (request.method === "DELETE" && mpAbortMatch) {
    const hash = mpAbortMatch[1].toLowerCase();
    const uploadId = decodeURIComponent(mpAbortMatch[2]);
    const upload = env.SYNC_BUCKET.resumeMultipartUpload(blobKey(hash), uploadId);
    await upload.abort();
    return jsonResponse(env, request, { ok: true, aborted: true });
  }

  // Single blob routes: GET / HEAD / PUT /v1/blobs/:hash
  const blobMatch = /^\/v1\/blobs\/([a-f0-9]{64})$/i.exec(path);
  if (blobMatch) {
    const hash = blobMatch[1].toLowerCase();
    const key = blobKey(hash);

    if (request.method === "PUT") {
      if (!request.body) {
        return jsonResponse(env, request, { ok: false, error: "empty_body" }, 400);
      }
      const contentType =
        request.headers.get("X-Mkboard-Mime") ||
        request.headers.get("Content-Type") ||
        "application/octet-stream";
      const putResult = await env.SYNC_BUCKET.put(key, request.body, {
        httpMetadata: { contentType }
      });
      return jsonResponse(env, request, {
        ok: true,
        hash,
        size: putResult?.size ?? 0,
        contentType
      });
    }

    if (request.method === "HEAD") {
      const head = await env.SYNC_BUCKET.head(key);
      if (!head) return new Response(null, { status: 404, headers: corsHeaders(env, request) });
      const headers = corsHeaders(env, request);
      headers.set("Content-Type", head.httpMetadata?.contentType || "application/octet-stream");
      headers.set("Content-Length", String(head.size));
      headers.set("Accept-Ranges", "bytes");
      headers.set("ETag", head.httpEtag);
      headers.set("Cache-Control", "private, max-age=31536000, immutable");
      return new Response(null, { status: 200, headers });
    }

    if (request.method === "GET") {
      const rangeHeader = request.headers.get("Range");
      if (rangeHeader) {
        const head = await env.SYNC_BUCKET.head(key);
        if (!head) return jsonResponse(env, request, { ok: false, error: "blob_not_found" }, 404);
        const parsedRange = parseByteRange(rangeHeader, head.size);
        if (parsedRange === "invalid" || !parsedRange) {
          const headers = corsHeaders(env, request);
          headers.set("Content-Range", `bytes */${head.size}`);
          return new Response(null, { status: 416, headers });
        }
        const obj = await env.SYNC_BUCKET.get(key, {
          range: { offset: parsedRange.offset, length: parsedRange.length }
        });
        if (!obj) return jsonResponse(env, request, { ok: false, error: "blob_not_found" }, 404);
        const headers = corsHeaders(env, request);
        headers.set("Content-Type", head.httpMetadata?.contentType || "application/octet-stream");
        headers.set("Content-Length", String(parsedRange.length));
        headers.set("Content-Range", `bytes ${parsedRange.offset}-${parsedRange.end}/${head.size}`);
        headers.set("Accept-Ranges", "bytes");
        headers.set("ETag", head.httpEtag);
        headers.set("Cache-Control", "private, max-age=31536000, immutable");
        return new Response(obj.body, { status: 206, headers });
      }

      const obj = await env.SYNC_BUCKET.get(key);
      if (!obj) return jsonResponse(env, request, { ok: false, error: "blob_not_found" }, 404);
      const headers = corsHeaders(env, request);
      headers.set("Content-Type", obj.httpMetadata?.contentType || "application/octet-stream");
      headers.set("Content-Length", String(obj.size));
      headers.set("Accept-Ranges", "bytes");
      headers.set("ETag", obj.httpEtag);
      headers.set("Cache-Control", "private, max-age=31536000, immutable");
      return new Response(obj.body, { status: 200, headers });
    }

    return jsonResponse(env, request, { ok: false, error: "method_not_allowed" }, 405);
  }

  // Project storyboard routes: GET / PUT /v1/projects/:projectId/storyboard
  const storyboardMatch = /^\/v1\/projects\/([^/]+)\/storyboard$/i.exec(path);
  if (storyboardMatch) {
    const projectId = sanitizeProjectId(storyboardMatch[1]);
    if (!projectId) return jsonResponse(env, request, { ok: false, error: "invalid_project_id" }, 400);

    if (request.method === "GET") {
      const obj = await env.SYNC_BUCKET.get(manifestKey(projectId));
      if (!obj) return jsonResponse(env, request, { ok: false, error: "project_not_found" }, 404);
      const ifNoneMatch = request.headers.get("If-None-Match");
      if (ifNoneMatch && ifNoneMatch === obj.httpEtag) {
        const headers = corsHeaders(env, request);
        headers.set("ETag", obj.httpEtag);
        return new Response(null, { status: 304, headers });
      }
      const manifest = (await obj.json()) as SyncedProjectManifest;
      return jsonResponse(
        env,
        request,
        { ok: true, storyboard: enrichManifestUrls(manifest, url.origin) },
        200,
        { ETag: obj.httpEtag }
      );
    }

    if (request.method === "PUT") {
      let incoming: Partial<SyncedProjectManifest>;
      try {
        incoming = (await request.json()) as Partial<SyncedProjectManifest>;
      } catch {
        return jsonResponse(env, request, { ok: false, error: "invalid_json" }, 400);
      }
      if (!incoming || typeof incoming.name !== "string" || !Array.isArray(incoming.shots)) {
        return jsonResponse(env, request, { ok: false, error: "invalid_manifest" }, 400);
      }

      const now = new Date().toISOString();
      const index = await readIndex(env.SYNC_BUCKET);
      const prevSummary = index.projects.find((p) => p.projectId === projectId);
      const revision = (prevSummary?.revision ?? 0) + 1;

      const manifest: SyncedProjectManifest = {
        schemaVersion: 1,
        projectId,
        name: incoming.name.trim() || projectId,
        icon: typeof incoming.icon === "string" && incoming.icon ? incoming.icon : "film",
        imageRatio: typeof incoming.imageRatio === "string" && incoming.imageRatio ? incoming.imageRatio : "16:9",
        coverHash: typeof incoming.coverHash === "string" && SHA256_RE.test(incoming.coverHash) ? incoming.coverHash.toLowerCase() : null,
        coverMimeType: typeof incoming.coverMimeType === "string" ? incoming.coverMimeType : null,
        updatedAt: typeof incoming.updatedAt === "string" ? incoming.updatedAt : now,
        syncedAt: now,
        revision,
        shotCount: incoming.shots.length,
        shots: incoming.shots as SyncedShot[]
      };

      await env.SYNC_BUCKET.put(manifestKey(projectId), JSON.stringify(manifest), {
        httpMetadata: { contentType: "application/json; charset=utf-8" }
      });

      const summary: SyncedProjectSummary = {
        projectId: manifest.projectId,
        name: manifest.name,
        icon: manifest.icon,
        imageRatio: manifest.imageRatio,
        coverHash: manifest.coverHash ?? null,
        shotCount: manifest.shotCount,
        updatedAt: manifest.updatedAt,
        syncedAt: manifest.syncedAt,
        revision: manifest.revision
      };

      const nextProjects = [
        summary,
        ...index.projects.filter((p) => p.projectId !== projectId)
      ].sort((a, b) => b.syncedAt.localeCompare(a.syncedAt));

      await writeIndex(env.SYNC_BUCKET, {
        schemaVersion: 1,
        updatedAt: now,
        projects: nextProjects
      });

      return jsonResponse(env, request, {
        ok: true,
        projectId,
        revision,
        syncedAt: now,
        shotCount: manifest.shotCount
      });
    }

    return jsonResponse(env, request, { ok: false, error: "method_not_allowed" }, 405);
  }

  // DELETE /v1/projects/:projectId
  const projectMatch = /^\/v1\/projects\/([^/]+)$/i.exec(path);
  if (request.method === "DELETE" && projectMatch) {
    const projectId = sanitizeProjectId(projectMatch[1]);
    if (!projectId) return jsonResponse(env, request, { ok: false, error: "invalid_project_id" }, 400);

    await env.SYNC_BUCKET.delete(manifestKey(projectId));
    const index = await readIndex(env.SYNC_BUCKET);
    const now = new Date().toISOString();
    await writeIndex(env.SYNC_BUCKET, {
      schemaVersion: 1,
      updatedAt: now,
      projects: index.projects.filter((p) => p.projectId !== projectId)
    });
    return jsonResponse(env, request, { ok: true, deleted: true, projectId });
  }

  return jsonResponse(env, request, { ok: false, error: "not_found" }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  }
};
