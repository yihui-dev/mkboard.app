import * as SecureStore from "expo-secure-store";
import type { SyncConnection } from "./types";

const KEY_WORKER_URL = "mkboard_sync_worker_url";
const KEY_SYNC_TOKEN = "mkboard_sync_token";

export function normalizeWorkerUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

export function parsePairingInput(raw: string): SyncConnection | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    // Handles mkboard-sync://pair?url=...&token=... or https://.../?url=...&token=...
    const normalized = trimmed.startsWith("mkboard-sync://")
      ? trimmed.replace("mkboard-sync://", "https://mkboard.local/")
      : trimmed;
    const url = new URL(normalized);
    const workerUrl = url.searchParams.get("url");
    const syncToken = url.searchParams.get("token");
    if (workerUrl && syncToken) {
      return {
        workerUrl: normalizeWorkerUrl(workerUrl),
        syncToken: syncToken.trim()
      };
    }
  } catch {
    // ignore
  }
  return null;
}

export async function loadConnection(): Promise<SyncConnection | null> {
  try {
    const [workerUrl, syncToken] = await Promise.all([
      SecureStore.getItemAsync(KEY_WORKER_URL),
      SecureStore.getItemAsync(KEY_SYNC_TOKEN)
    ]);
    if (workerUrl && syncToken) {
      return { workerUrl: normalizeWorkerUrl(workerUrl), syncToken: syncToken.trim() };
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveConnection(conn: SyncConnection): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(KEY_WORKER_URL, normalizeWorkerUrl(conn.workerUrl)),
    SecureStore.setItemAsync(KEY_SYNC_TOKEN, conn.syncToken.trim())
  ]);
}

export async function clearConnection(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(KEY_WORKER_URL),
    SecureStore.deleteItemAsync(KEY_SYNC_TOKEN)
  ]);
}
