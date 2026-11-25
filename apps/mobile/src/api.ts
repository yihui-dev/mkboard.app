import { normalizeWorkerUrl } from "./storage";
import type { SyncConnection, SyncedProjectSummary, SyncedStoryboard } from "./types";

function authHeaders(conn: SyncConnection): Record<string, string> {
  return {
    Authorization: `Bearer ${conn.syncToken.trim()}`,
    Accept: "application/json"
  };
}

export function withAuthQuery(rawUrl: string | null | undefined, conn: SyncConnection): string | null {
  if (!rawUrl) return null;
  try {
    const parsed = new URL(rawUrl);
    parsed.searchParams.set("token", conn.syncToken.trim());
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

export async function verifyConnection(conn: SyncConnection): Promise<{ ok: true; projectCount: number } | { ok: false; error: string }> {
  const base = normalizeWorkerUrl(conn.workerUrl);
  if (!base) return { ok: false, error: "请输入 Worker 地址" };
  if (!conn.syncToken.trim()) return { ok: false, error: "请输入同步密钥" };

  try {
    const res = await fetch(`${base}/v1/verify`, {
      method: "GET",
      headers: authHeaders(conn)
    });
    if (res.status === 401) return { ok: false, error: "同步密钥不正确（401）" };
    if (!res.ok) return { ok: false, error: `服务端返回 HTTP ${res.status}` };
    const data = (await res.json()) as { ok?: boolean; projectCount?: number };
    if (!data.ok) return { ok: false, error: "服务端响应异常" };
    return { ok: true, projectCount: typeof data.projectCount === "number" ? data.projectCount : 0 };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "网络连接失败" };
  }
}

export async function fetchProjects(conn: SyncConnection): Promise<SyncedProjectSummary[]> {
  const base = normalizeWorkerUrl(conn.workerUrl);
  const res = await fetch(`${base}/v1/projects`, {
    method: "GET",
    headers: authHeaders(conn)
  });
  if (res.status === 401) throw new Error("密钥已失效，请重新配对");
  if (!res.ok) throw new Error(`拉取项目列表失败 (HTTP ${res.status})`);
  const data = (await res.json()) as { projects?: SyncedProjectSummary[] };
  return Array.isArray(data.projects) ? data.projects : [];
}

export async function fetchStoryboard(conn: SyncConnection, projectId: string): Promise<SyncedStoryboard> {
  const base = normalizeWorkerUrl(conn.workerUrl);
  const res = await fetch(`${base}/v1/projects/${encodeURIComponent(projectId)}/storyboard`, {
    method: "GET",
    headers: authHeaders(conn)
  });
  if (res.status === 401) throw new Error("密钥已失效，请重新配对");
  if (res.status === 404) throw new Error("云端暂无该项目分镜");
  if (!res.ok) throw new Error(`拉取分镜失败 (HTTP ${res.status})`);
  const data = (await res.json()) as { storyboard?: SyncedStoryboard };
  if (!data.storyboard) throw new Error("分镜数据为空");
  return data.storyboard;
}

export function formatRelativeTime(iso: string): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "";
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return "刚刚同步";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} 分钟前`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} 小时前`;
  return `${Math.floor(diffSec / 86400)} 天前`;
}

export function formatDurationLabel(raw: string): string {
  const trimmed = (raw || "").trim();
  if (!trimmed || trimmed === "0") return "";
  return trimmed.endsWith("s") || trimmed.endsWith("秒") ? trimmed : `${trimmed}s`;
}

export function parseAspectRatio(ratio: string): number {
  switch (ratio) {
    case "9:16":
      return 9 / 16;
    case "3:4":
      return 3 / 4;
    case "4:3":
      return 4 / 3;
    case "1:1":
      return 1;
    default:
      return 16 / 9;
  }
}
