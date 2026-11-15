// Browser / iPad / Mobile Web Companion Bridge for MkBoard.
// When running outside Electron (window.mkboard is undefined), this module installs a full
// HTTP RPC + SSE + Browser Upload + Asset URL Rewriting implementation of MkboardApi.

import type { MkboardApi } from "../../../shared";

type EventListenerSet = Set<(payload: unknown) => void>;

const droppedFilePathCache = new WeakMap<File, string>();

export async function ensureWebMkboardBridge(): Promise<void> {
  if (typeof window === "undefined" || window.mkboard) return;

  // 1. Exchange #token=<secret> fragment for an HttpOnly session cookie, then scrub URL fragment
  const hash = window.location.hash || "";
  const tokenMatch = /(?:^|[&#])token=([^&]+)/.exec(hash);
  if (tokenMatch?.[1]) {
    const token = decodeURIComponent(tokenMatch[1]);
    try {
      await fetch("/api/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ token })
      });
      const cleanUrl = `${window.location.pathname}${window.location.search}`;
      window.history.replaceState(null, "", cleanUrl);
    } catch (err) {
      console.warn("[MkBoard Companion] Token pairing failed:", err);
    }
  }

  // 2. Connect SSE event stream
  const listeners = new Map<string, EventListenerSet>();
  const subscribe = <T>(channel: string, handler: (payload: T) => void): (() => void) => {
    let set = listeners.get(channel);
    if (!set) {
      set = new Set();
      listeners.set(channel, set);
    }
    const wrapped = (raw: unknown) => handler(rewriteAssetUrlsDeep(raw) as T);
    set.add(wrapped);
    return () => {
      set?.delete(wrapped);
    };
  };

  const connectSse = () => {
    const es = new EventSource("/api/events", { withCredentials: true });
    for (const channel of [
      "desktop-update-state",
      "agent-event",
      "storyboard-video-generation-event",
      "agent-conversation-title",
      "project-changed-externally",
      "mcp-open-project"
    ]) {
      es.addEventListener(channel, (ev) => {
        try {
          const parsed = JSON.parse((ev as MessageEvent).data);
          for (const fn of listeners.get(channel) ?? []) fn(parsed);
        } catch {
          // Ignore malformed frame
        }
      });
    }
    return es;
  };
  connectSse();

  const callRpc = async <T>(method: string, ...args: unknown[]): Promise<T> => {
    const res = await fetch(`/api/rpc/${encodeURIComponent(method)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ args })
    });
    const payload = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: unknown; error?: string };
    if (!res.ok || payload.ok === false) {
      throw new Error(payload.error || `Companion RPC ${method} failed (HTTP ${res.status})`);
    }
    return rewriteAssetUrlsDeep(payload.result) as T;
  };

  // Browser file picker -> /api/upload -> server temp path -> existing import RPC
  const pickAndUploadBrowserFiles = async (accept: string, multiple: boolean): Promise<string[]> => {
    const files = await new Promise<File[]>((resolveFiles) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = accept;
      input.multiple = multiple;
      input.style.display = "none";
      document.body.appendChild(input);
      input.onchange = () => {
        const list = Array.from(input.files ?? []);
        input.remove();
        resolveFiles(list);
      };
      input.oncancel = () => {
        input.remove();
        resolveFiles([]);
      };
      input.click();
    });
    return uploadFilesToCompanion(files);
  };

  const bridge = new Proxy({} as MkboardApi, {
    get(_target, prop: string) {
      if (prop === "onDesktopUpdateStateChanged") return (h: (s: never) => void) => subscribe("desktop-update-state", h);
      if (prop === "onAgentEvent") return (h: (s: never) => void) => subscribe("agent-event", h);
      if (prop === "onStoryboardVideoGenerationEvent") return (h: (s: never) => void) => subscribe("storyboard-video-generation-event", h);
      if (prop === "onAgentConversationTitle") return (h: (s: never) => void) => subscribe("agent-conversation-title", h);
      if (prop === "onProjectChangedExternally") return (h: (s: never) => void) => subscribe("project-changed-externally", h);
      if (prop === "onMcpOpenProjectRequest") return (h: (s: never) => void) => subscribe("mcp-open-project", h);
      if (prop === "openExternal") {
        return async (url: string) => {
          window.open(url, "_blank", "noopener,noreferrer");
        };
      }
      if (prop === "reportActiveView") {
        return (view: unknown) => {
          void callRpc("reportActiveView", view).catch(() => undefined);
        };
      }
      if (prop === "resolveDroppedFilePaths") {
        return (files: File[]) => files.map((f) => droppedFilePathCache.get(f)).filter((p): p is string => Boolean(p));
      }
      if (prop === "chooseAssets") {
        return async (projectId: string) => {
          const paths = await pickAndUploadBrowserFiles("image/*,video/*,audio/*", true);
          if (paths.length === 0) return [];
          return callRpc("importAssetPaths", projectId, paths);
        };
      }
      if (prop === "chooseShotMedia") {
        return async (projectId: string, rowId: string) => {
          const paths = await pickAndUploadBrowserFiles("image/*,video/*", true);
          if (paths.length === 0) return callRpc("getShotMediaUpdate", projectId);
          return callRpc("importShotMediaPaths", projectId, rowId, paths);
        };
      }
      if (prop === "chooseAgentImages") {
        return async (projectId: string) => {
          const paths = await pickAndUploadBrowserFiles("image/*", true);
          if (paths.length === 0) return [];
          return callRpc("importAgentImageAttachmentPaths", projectId, paths);
        };
      }
      return (...args: unknown[]) => callRpc(prop, ...args);
    }
  });

  window.mkboard = bridge;
}

async function uploadFilesToCompanion(files: File[]): Promise<string[]> {
  const uploadedPaths: string[] = [];
  for (const file of files) {
    const base64Data = await fileToBase64(file);
    const res = await fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ fileName: file.name, base64Data })
    });
    const payload = (await res.json().catch(() => ({}))) as { ok?: boolean; filePath?: string };
    if (res.ok && payload.ok && payload.filePath) {
      droppedFilePathCache.set(file, payload.filePath);
      uploadedPaths.push(payload.filePath);
    }
  }
  return uploadedPaths;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolveB64, rejectB64) => {
    const reader = new FileReader();
    reader.onload = () => resolveB64(String(reader.result || ""));
    reader.onerror = () => rejectB64(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function rewriteAssetUrlsDeep(value: unknown): unknown {
  if (typeof value === "string") {
    if (value.startsWith("mkboard-asset://asset/")) {
      return `/api/assets/${value.slice("mkboard-asset://asset/".length)}`;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(rewriteAssetUrlsDeep);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = rewriteAssetUrlsDeep(v);
    }
    return out;
  }
  return value;
}
