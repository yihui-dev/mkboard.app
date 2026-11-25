import { createHash } from "node:crypto";
import { chmodSync, createReadStream, existsSync, mkdirSync, openSync, readFileSync, readSync, closeSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import {
  getSpokenTextFromCell,
  type CloudSyncConfigSnapshot,
  type CloudSyncProgressEvent,
  type CloudSyncProjectRecord,
  type CloudSyncProjectResult,
  type CloudSyncSaveInput,
  type CloudSyncTestResult,
  type ProjectAsset,
  type ProjectDetail,
  type StoryboardRow
} from "../shared";
import { maskApiKey } from "./byok-store";
import { renderQrSvg } from "./qr-svg";

const MULTIPART_THRESHOLD_BYTES = 50 * 1024 * 1024; // 50 MB
const MULTIPART_CHUNK_BYTES = 20 * 1024 * 1024; // 20 MB per R2 part (>= 5MB required by R2)
const UPLOAD_CONCURRENCY = 3;
const AUTO_SYNC_DEBOUNCE_MS = 3000;

type StoredCloudSyncConfig = {
  version: 1;
  workerUrl?: string;
  autoSync?: boolean;
  lastSyncedByProject?: Record<string, CloudSyncProjectRecord>;
};

type StoredCloudSyncSecret = {
  version: 1;
  syncToken?: string;
  updatedAt?: string;
};

type BlobUploadItem = {
  hash: string;
  filePath: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
};

type SyncedShotMedia = {
  kind: "image" | "video";
  hash: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  posterHash?: string | null;
  posterMimeType?: string | null;
  hasEmbeddedAudio?: boolean;
};

type SyncedShotAudio = {
  source: "elevenlabs-cache" | "project-asset";
  hash: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
};

type SyncedShot = {
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
};

export interface CloudSyncStoreAdapter {
  getProject(projectId: string): ProjectDetail;
  resolveAssetPreviewPath(assetId: string): string | null;
  resolveAssetPosterPath(assetId: string): string | null;
  resolveProjectCoverPath(projectId: string): string | null;
}

export interface CloudSyncSpeechAdapter {
  getCachedSpeechFilePath(voiceId: string, text: string): string | null;
}

export type CloudSyncFetch = typeof fetch;

export class CloudSyncService {
  private readonly configPath: string;
  private readonly secretsDir: string;
  private readonly secretPath: string;
  private readonly store: CloudSyncStoreAdapter;
  private readonly speech: CloudSyncSpeechAdapter | null;
  private readonly emitProgress: (event: CloudSyncProgressEvent) => void;
  private readonly getDefaultSpeechVoiceId: () => string;
  private readonly fetchImpl: CloudSyncFetch;
  private readonly env: NodeJS.ProcessEnv;

  private readonly hashCache = new Map<string, { mtimeMs: number; size: number; hash: string }>();
  private readonly activeSyncs = new Map<string, Promise<CloudSyncProjectResult>>();
  private readonly pendingAutoSyncTimers = new Map<string, NodeJS.Timeout>();
  private readonly queuedResyncProjects = new Set<string>();

  constructor(options: {
    dataDir: string;
    store: CloudSyncStoreAdapter;
    speech?: CloudSyncSpeechAdapter | null;
    emitProgress?: (event: CloudSyncProgressEvent) => void;
    getDefaultSpeechVoiceId?: () => string;
    fetchImpl?: CloudSyncFetch;
    env?: NodeJS.ProcessEnv;
  }) {
    this.configPath = join(options.dataDir, "cloud-sync-config.json");
    this.secretsDir = join(options.dataDir, "secrets");
    this.secretPath = join(this.secretsDir, "cloud-sync-secret.json");
    this.store = options.store;
    this.speech = options.speech ?? null;
    this.emitProgress = options.emitProgress ?? (() => undefined);
    this.getDefaultSpeechVoiceId = options.getDefaultSpeechVoiceId ?? (() => "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.env = options.env ?? process.env;
  }

  private resolveCredentials(): { workerUrl: string; syncToken: string; source: "stored" | "env" | "none" } {
    const config = this.readConfig();
    const secret = this.readSecret();
    const storedUrl = normalizeWorkerUrl(config.workerUrl || "");
    const storedToken = (secret.syncToken || "").trim();
    if (storedUrl && storedToken) {
      return { workerUrl: storedUrl, syncToken: storedToken, source: "stored" };
    }
    const envUrl = normalizeWorkerUrl(this.env.MKBOARD_SYNC_URL || "");
    const envToken = (this.env.MKBOARD_SYNC_TOKEN || "").trim();
    if (envUrl && envToken) {
      return { workerUrl: envUrl, syncToken: envToken, source: "env" };
    }
    return { workerUrl: storedUrl || envUrl, syncToken: storedToken || envToken, source: "none" };
  }

  getSnapshot(): CloudSyncConfigSnapshot {
    const config = this.readConfig();
    const creds = this.resolveCredentials();
    const configured = Boolean(creds.workerUrl && creds.syncToken);
    const pairingUri = configured
      ? `mkboard-sync://pair?url=${encodeURIComponent(creds.workerUrl)}&token=${encodeURIComponent(creds.syncToken)}`
      : null;
    const qrSvg = pairingUri ? renderQrSvg(pairingUri) : null;
    return {
      configured,
      source: creds.source,
      workerUrl: creds.workerUrl,
      maskedToken: creds.syncToken ? maskApiKey(creds.syncToken) : null,
      autoSync: config.autoSync === true,
      pairingUri,
      qrSvg,
      lastSyncedByProject: config.lastSyncedByProject ?? {}
    };
  }

  saveConfig(input: CloudSyncSaveInput): CloudSyncConfigSnapshot {
    const config = this.readConfig();
    const nextUrl = normalizeWorkerUrl(input.workerUrl);
    config.workerUrl = nextUrl;
    if (typeof input.autoSync === "boolean") {
      config.autoSync = input.autoSync;
    }
    this.writeConfig(config);

    if (typeof input.syncToken === "string" && input.syncToken.trim()) {
      this.writeSecret({
        version: 1,
        syncToken: input.syncToken.trim(),
        updatedAt: new Date().toISOString()
      });
    }
    return this.getSnapshot();
  }

  clearConfig(): CloudSyncConfigSnapshot {
    const config = this.readConfig();
    config.workerUrl = "";
    config.autoSync = false;
    this.writeConfig(config);
    try {
      rmSync(this.secretPath, { force: true });
    } catch {
      // ignore
    }
    return this.getSnapshot();
  }

  async testConnection(candidate?: { workerUrl?: string; syncToken?: string }): Promise<CloudSyncTestResult> {
    const current = this.resolveCredentials();
    const workerUrl = normalizeWorkerUrl(candidate?.workerUrl || current.workerUrl);
    const syncToken = (candidate?.syncToken || current.syncToken).trim();
    if (!workerUrl) return { ok: false, message: "请先填写 Cloudflare Worker 地址。" };
    if (!syncToken) return { ok: false, message: "请先填写同步密钥 (SYNC_TOKEN)。" };

    try {
      const res = await this.fetchImpl(`${workerUrl}/v1/verify`, {
        method: "GET",
        headers: { Authorization: `Bearer ${syncToken}` },
        signal: AbortSignal.timeout(15_000)
      });
      if (res.status === 401) {
        return { ok: false, message: "密钥无效（401），请核对 Worker 的 SYNC_TOKEN。" };
      }
      if (!res.ok) {
        return { ok: false, message: `连接失败（HTTP ${res.status}）` };
      }
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; projectCount?: number };
      if (!data.ok) return { ok: false, message: "服务端响应格式异常。" };
      const count = typeof data.projectCount === "number" ? data.projectCount : 0;
      return {
        ok: true,
        projectCount: count,
        message: `连接成功 · 云端已有 ${count} 个项目`
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? `网络异常：${error.message}` : "网络连接失败"
      };
    }
  }

  scheduleAutoSync(projectId: string): void {
    const config = this.readConfig();
    if (!config.autoSync) return;
    const creds = this.resolveCredentials();
    if (!creds.workerUrl || !creds.syncToken) return;

    const existing = this.pendingAutoSyncTimers.get(projectId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.pendingAutoSyncTimers.delete(projectId);
      void this.syncProject(projectId).catch(() => undefined);
    }, AUTO_SYNC_DEBOUNCE_MS);
    this.pendingAutoSyncTimers.set(projectId, timer);
  }

  dispose(): void {
    for (const timer of this.pendingAutoSyncTimers.values()) clearTimeout(timer);
    this.pendingAutoSyncTimers.clear();
  }

  async syncProject(projectId: string, options?: { speechVoiceId?: string }): Promise<CloudSyncProjectResult> {
    const running = this.activeSyncs.get(projectId);
    if (running) {
      this.queuedResyncProjects.add(projectId);
      return running;
    }

    const task = this.runProjectSync(projectId, options?.speechVoiceId)
      .finally(() => {
        this.activeSyncs.delete(projectId);
        if (this.queuedResyncProjects.delete(projectId)) {
          this.scheduleAutoSync(projectId);
        }
      });
    this.activeSyncs.set(projectId, task);
    return task;
  }

  async deleteProjectFromCloud(projectId: string): Promise<{ ok: boolean; error?: string }> {
    const creds = this.resolveCredentials();
    if (!creds.workerUrl || !creds.syncToken) {
      return { ok: false, error: "云同步尚未配置。" };
    }
    try {
      const res = await this.fetchImpl(`${creds.workerUrl}/v1/projects/${encodeURIComponent(projectId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${creds.syncToken}` },
        signal: AbortSignal.timeout(15_000)
      });
      if (!res.ok) return { ok: false, error: `删除失败（HTTP ${res.status}）` };
      const config = this.readConfig();
      if (config.lastSyncedByProject && config.lastSyncedByProject[projectId]) {
        delete config.lastSyncedByProject[projectId];
        this.writeConfig(config);
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private async runProjectSync(projectId: string, explicitVoiceId?: string): Promise<CloudSyncProjectResult> {
    const creds = this.resolveCredentials();
    if (!creds.workerUrl || !creds.syncToken) {
      const msg = "请先在「设置 → 云同步」中配置 Cloudflare Worker 地址与密钥。";
      this.emitProgress({ projectId, status: "error", message: msg });
      return { ok: false, error: msg };
    }

    this.emitProgress({ projectId, status: "scanning", message: "正在整理分镜素材..." });

    try {
      const detail = this.store.getProject(projectId);
      const voiceId = (explicitVoiceId || this.getDefaultSpeechVoiceId() || "").trim();
      const assetsById = new Map<string, ProjectAsset>();
      const audioAssets: ProjectAsset[] = [];
      for (const asset of detail.assets) {
        assetsById.set(asset.id, asset);
        if (asset.kind === "audio") audioAssets.push(asset);
      }

      const audioByShotNumber = buildAudioLookupByShotNumber(audioAssets);
      const blobsMap = new Map<string, BlobUploadItem>();
      const syncedShots: SyncedShot[] = [];

      const registerBlob = async (filePath: string, fileName: string, fallbackMime?: string): Promise<BlobUploadItem | null> => {
        if (!filePath || !existsSync(filePath)) return null;
        let stats;
        try {
          stats = statSync(filePath);
        } catch {
          return null;
        }
        if (!stats.isFile() || stats.size <= 0) return null;
        const hash = await this.hashFile(filePath, stats.mtimeMs, stats.size);
        const mimeType = inferMimeType(fileName || filePath, fallbackMime);
        const item: BlobUploadItem = {
          hash,
          filePath,
          fileName: fileName || basename(filePath),
          mimeType,
          fileSize: stats.size
        };
        if (!blobsMap.has(hash)) blobsMap.set(hash, item);
        return item;
      };

      let fallbackCoverHash: string | null = null;
      let fallbackCoverMime: string | null = null;

      for (let i = 0; i < detail.rows.length; i += 1) {
        const row = detail.rows[i];
        const shotNumber = (row.shot || String(i + 1)).trim();
        const selectedAssetIds = resolveSelectedShotAssetIds(row);
        const syncedMedia: SyncedShotMedia[] = [];

        for (const assetId of selectedAssetIds) {
          const asset = assetsById.get(assetId);
          if (!asset || (asset.kind !== "image" && asset.kind !== "video")) continue;
          const filePath = this.store.resolveAssetPreviewPath(asset.id) || asset.localPath;
          const mediaBlob = await registerBlob(filePath, asset.name, asset.kind === "video" ? "video/mp4" : "image/jpeg");
          if (!mediaBlob) continue;

          let posterHash: string | null = null;
          let posterMimeType: string | null = null;
          if (asset.kind === "video") {
            const posterPath = this.store.resolveAssetPosterPath(asset.id);
            if (posterPath) {
              const posterBlob = await registerBlob(posterPath, basename(posterPath), "image/jpeg");
              if (posterBlob) {
                posterHash = posterBlob.hash;
                posterMimeType = posterBlob.mimeType;
              }
            }
          }

          if (!fallbackCoverHash) {
            if (asset.kind === "image") {
              fallbackCoverHash = mediaBlob.hash;
              fallbackCoverMime = mediaBlob.mimeType;
            } else if (posterHash) {
              fallbackCoverHash = posterHash;
              fallbackCoverMime = posterMimeType;
            }
          }

          syncedMedia.push({
            kind: asset.kind,
            hash: mediaBlob.hash,
            fileName: mediaBlob.fileName,
            mimeType: mediaBlob.mimeType,
            fileSize: mediaBlob.fileSize,
            posterHash,
            posterMimeType,
            hasEmbeddedAudio: asset.kind === "video" ? inferEmbeddedAudio(asset.name) : false
          });
        }

        // Resolve per-shot voiceover audio (1. project audio asset linked or matched by shot number; 2. ElevenLabs local speech cache)
        let syncedAudio: SyncedShotAudio | null = null;
        const matchedAudioAsset = findAudioAssetForShot(row, shotNumber, audioAssets, audioByShotNumber);
        if (matchedAudioAsset) {
          const audioPath = this.store.resolveAssetPreviewPath(matchedAudioAsset.id) || matchedAudioAsset.localPath;
          const audioBlob = await registerBlob(audioPath, matchedAudioAsset.name, "audio/mpeg");
          if (audioBlob) {
            syncedAudio = {
              source: "project-asset",
              hash: audioBlob.hash,
              fileName: audioBlob.fileName,
              mimeType: audioBlob.mimeType,
              fileSize: audioBlob.fileSize
            };
          }
        }
        if (!syncedAudio && this.speech && voiceId) {
          const spoken = getSpokenTextFromCell(row.content || "");
          if (spoken) {
            const cachedPath = this.speech.getCachedSpeechFilePath(voiceId, spoken);
            if (cachedPath) {
              const audioBlob = await registerBlob(cachedPath, `voiceover-shot-${shotNumber}.mp3`, "audio/mpeg");
              if (audioBlob) {
                syncedAudio = {
                  source: "elevenlabs-cache",
                  hash: audioBlob.hash,
                  fileName: audioBlob.fileName,
                  mimeType: audioBlob.mimeType,
                  fileSize: audioBlob.fileSize
                };
              }
            }
          }
        }

        syncedShots.push({
          id: row.id,
          position: i + 1,
          shotNumber,
          scene: row.scene || "",
          duration: row.duration || "",
          content: row.content || "",
          note: row.note || "",
          generationMethod: extractGenerationMethod(row),
          media: syncedMedia,
          audio: syncedAudio
        });
      }

      // Optional project cover image
      let coverHash: string | null = null;
      let coverMimeType: string | null = null;
      const customCoverPath = this.store.resolveProjectCoverPath(projectId);
      if (customCoverPath) {
        const coverBlob = await registerBlob(customCoverPath, basename(customCoverPath), "image/jpeg");
        if (coverBlob) {
          coverHash = coverBlob.hash;
          coverMimeType = coverBlob.mimeType;
        }
      }
      if (!coverHash) {
        coverHash = fallbackCoverHash;
        coverMimeType = fallbackCoverMime;
      }

      // Step 1: Check missing blobs in batches of 400
      const allHashes = Array.from(blobsMap.keys());
      const missingHashes = await this.checkMissingBlobs(creds.workerUrl, creds.syncToken, allHashes);
      const reusedBlobs = allHashes.length - missingHashes.length;

      // Step 2: Upload missing blobs with bounded concurrency
      let uploadedCount = 0;
      const totalUploads = missingHashes.length;
      if (totalUploads > 0) {
        this.emitProgress({
          projectId,
          status: "uploading",
          current: 0,
          total: totalUploads,
          message: `正在上传增量素材 0/${totalUploads}...`
        });
        await runWithConcurrency(missingHashes, UPLOAD_CONCURRENCY, async (hash) => {
          const blob = blobsMap.get(hash);
          if (!blob) return;
          await this.uploadBlob(creds.workerUrl, creds.syncToken, blob);
          uploadedCount += 1;
          this.emitProgress({
            projectId,
            status: "uploading",
            current: uploadedCount,
            total: totalUploads,
            message: `正在上传增量素材 ${uploadedCount}/${totalUploads}...`
          });
        });
      }

      // Step 3: Commit storyboard manifest
      this.emitProgress({ projectId, status: "finalizing", message: "正在更新云端分镜清单..." });
      const manifestRes = await this.fetchImpl(`${creds.workerUrl}/v1/projects/${encodeURIComponent(projectId)}/storyboard`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${creds.syncToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: detail.project.name,
          icon: detail.project.icon,
          imageRatio: detail.imageRatio,
          coverHash,
          coverMimeType,
          updatedAt: detail.project.updatedAt,
          shots: syncedShots
        }),
        signal: AbortSignal.timeout(30_000)
      });

      if (!manifestRes.ok) {
        const text = await manifestRes.text().catch(() => "");
        throw new Error(`提交分镜清单失败（HTTP ${manifestRes.status}）${text ? `: ${text.slice(0, 120)}` : ""}`);
      }
      const manifestResult = (await manifestRes.json()) as {
        ok?: boolean;
        revision?: number;
        syncedAt?: string;
        shotCount?: number;
      };
      const syncedAt = manifestResult.syncedAt || new Date().toISOString();
      const revision = typeof manifestResult.revision === "number" ? manifestResult.revision : 1;

      const config = this.readConfig();
      config.lastSyncedByProject = {
        ...(config.lastSyncedByProject ?? {}),
        [projectId]: {
          syncedAt,
          revision,
          shotCount: syncedShots.length,
          uploadedBlobs: uploadedCount
        }
      };
      this.writeConfig(config);

      this.emitProgress({
        projectId,
        status: "synced",
        syncedAt,
        revision,
        message: uploadedCount > 0 ? `已同步 ${syncedShots.length} 镜（新传 ${uploadedCount} 个素材）` : `已同步 ${syncedShots.length} 镜（素材无变化）`
      });

      return {
        ok: true,
        projectId,
        revision,
        syncedAt,
        shotCount: syncedShots.length,
        uploadedBlobs: uploadedCount,
        reusedBlobs
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.emitProgress({ projectId, status: "error", message: msg });
      return { ok: false, error: msg };
    }
  }

  private async checkMissingBlobs(workerUrl: string, syncToken: string, hashes: string[]): Promise<string[]> {
    if (hashes.length === 0) return [];
    const missing: string[] = [];
    for (let i = 0; i < hashes.length; i += 400) {
      const batch = hashes.slice(i, i + 400);
      const res = await this.fetchImpl(`${workerUrl}/v1/blobs/check`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${syncToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ hashes: batch }),
        signal: AbortSignal.timeout(20_000)
      });
      if (!res.ok) throw new Error(`校验云端素材失败（HTTP ${res.status}）`);
      const data = (await res.json()) as { missing?: string[] };
      if (Array.isArray(data.missing)) missing.push(...data.missing);
    }
    return missing;
  }

  private async uploadBlob(workerUrl: string, syncToken: string, blob: BlobUploadItem): Promise<void> {
    if (blob.fileSize <= MULTIPART_THRESHOLD_BYTES) {
      const bytes = readFileSync(blob.filePath);
      const res = await this.fetchImpl(`${workerUrl}/v1/blobs/${blob.hash}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${syncToken}`,
          "Content-Type": blob.mimeType,
          "X-Mkboard-Mime": blob.mimeType
        },
        body: bytes,
        signal: AbortSignal.timeout(120_000)
      });
      if (!res.ok) throw new Error(`上传素材 ${blob.fileName} 失败（HTTP ${res.status}）`);
      return;
    }

    // Large file (>= 50MB): R2 multipart upload
    const initRes = await this.fetchImpl(`${workerUrl}/v1/blobs/${blob.hash}/multipart/init`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${syncToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ mimeType: blob.mimeType }),
      signal: AbortSignal.timeout(20_000)
    });
    if (!initRes.ok) throw new Error(`初始化分片上传 ${blob.fileName} 失败（HTTP ${initRes.status}）`);
    const { uploadId } = (await initRes.json()) as { uploadId: string };
    const encodedUploadId = encodeURIComponent(uploadId);
    const parts: Array<{ partNumber: number; etag: string }> = [];

    const fd = openSync(blob.filePath, "r");
    try {
      let offset = 0;
      let partNumber = 1;
      while (offset < blob.fileSize) {
        const chunkLen = Math.min(MULTIPART_CHUNK_BYTES, blob.fileSize - offset);
        const chunk = Buffer.allocUnsafe(chunkLen);
        let bytesReadTotal = 0;
        while (bytesReadTotal < chunkLen) {
          const n = readSync(fd, chunk, bytesReadTotal, chunkLen - bytesReadTotal, offset + bytesReadTotal);
          if (n <= 0) break;
          bytesReadTotal += n;
        }
        const payload = bytesReadTotal === chunkLen ? chunk : chunk.subarray(0, bytesReadTotal);
        const partRes = await this.fetchImpl(`${workerUrl}/v1/blobs/${blob.hash}/multipart/${encodedUploadId}/part/${partNumber}`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${syncToken}`,
            "Content-Type": "application/octet-stream"
          },
          body: payload,
          signal: AbortSignal.timeout(120_000)
        });
        if (!partRes.ok) throw new Error(`分片 ${partNumber} 上传失败（HTTP ${partRes.status}）`);
        const partJson = (await partRes.json()) as { partNumber: number; etag: string };
        parts.push({ partNumber: partJson.partNumber, etag: partJson.etag });
        offset += bytesReadTotal;
        partNumber += 1;
      }

      const completeRes = await this.fetchImpl(`${workerUrl}/v1/blobs/${blob.hash}/multipart/${encodedUploadId}/complete`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${syncToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ parts }),
        signal: AbortSignal.timeout(30_000)
      });
      if (!completeRes.ok) throw new Error(`合并分片失败（HTTP ${completeRes.status}）`);
    } catch (error) {
      await this.fetchImpl(`${workerUrl}/v1/blobs/${blob.hash}/multipart/${encodedUploadId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${syncToken}` }
      }).catch(() => undefined);
      throw error;
    } finally {
      closeSync(fd);
    }
  }

  private async hashFile(filePath: string, mtimeMs: number, size: number): Promise<string> {
    const cached = this.hashCache.get(filePath);
    if (cached && cached.mtimeMs === mtimeMs && cached.size === size) {
      return cached.hash;
    }
    const hash = await new Promise<string>((resolve, reject) => {
      const hasher = createHash("sha256");
      const stream = createReadStream(filePath);
      stream.on("data", (chunk) => hasher.update(chunk));
      stream.on("error", reject);
      stream.on("end", () => resolve(hasher.digest("hex")));
    });
    this.hashCache.set(filePath, { mtimeMs, size, hash });
    return hash;
  }

  private readConfig(): StoredCloudSyncConfig {
    if (!existsSync(this.configPath)) return { version: 1 };
    try {
      const parsed = JSON.parse(readFileSync(this.configPath, "utf8")) as Partial<StoredCloudSyncConfig>;
      return {
        version: 1,
        workerUrl: typeof parsed.workerUrl === "string" ? parsed.workerUrl : "",
        autoSync: parsed.autoSync === true,
        lastSyncedByProject: parsed.lastSyncedByProject && typeof parsed.lastSyncedByProject === "object" ? parsed.lastSyncedByProject : {}
      };
    } catch {
      return { version: 1 };
    }
  }

  private writeConfig(config: StoredCloudSyncConfig): void {
    mkdirSync(dirname(this.configPath), { recursive: true });
    const tmp = `${this.configPath}.tmp`;
    writeFileSync(tmp, JSON.stringify(config, null, 2), "utf8");
    renameSync(tmp, this.configPath);
  }

  private readSecret(): StoredCloudSyncSecret {
    if (!existsSync(this.secretPath)) return { version: 1 };
    try {
      const parsed = JSON.parse(readFileSync(this.secretPath, "utf8")) as Partial<StoredCloudSyncSecret>;
      return {
        version: 1,
        syncToken: typeof parsed.syncToken === "string" ? parsed.syncToken : "",
        updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : undefined
      };
    } catch {
      return { version: 1 };
    }
  }

  private writeSecret(secret: StoredCloudSyncSecret): void {
    mkdirSync(this.secretsDir, { recursive: true });
    try {
      chmodSync(this.secretsDir, 0o700);
    } catch {
      // ignore on Windows
    }
    const tmp = `${this.secretPath}.tmp`;
    writeFileSync(tmp, JSON.stringify(secret, null, 2), { encoding: "utf8", mode: 0o600 });
    renameSync(tmp, this.secretPath);
    try {
      chmodSync(this.secretPath, 0o600);
    } catch {
      // ignore on Windows
    }
  }
}

export function normalizeWorkerUrl(raw: string): string {
  const trimmed = (raw || "").trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

function resolveSelectedShotAssetIds(row: StoryboardRow): string[] {
  if (Array.isArray(row.imageAssetIds) && row.imageAssetIds.length > 0) {
    return Array.from(new Set(row.imageAssetIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)));
  }
  if (typeof row.imageAssetId === "string" && row.imageAssetId.trim()) {
    return [row.imageAssetId.trim()];
  }
  return [];
}

function extractGenerationMethod(row: StoryboardRow): string | undefined {
  const values = row.customValues;
  if (!values) return undefined;
  const candidate = values["custom-3"];
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : undefined;
}

function inferEmbeddedAudio(fileName: string): boolean {
  return /(?:含配音|带配音|with[-_\s]?audio|voiced|dubbed)/i.test(fileName);
}

/**
 * Extract numeric shot number and optional revision suffix from audio asset file names such as:
 *   配音-镜头03.mp3 -> { shotNum: 3, revision: 0 }
 *   配音-镜头15-2.mp3 -> { shotNum: 15, revision: 2 }
 *   shot_07-1.wav -> { shotNum: 7, revision: 1 }
 */
export function parseAudioShotKey(fileName: string): { shotNum: number; revision: number } | null {
  const stem = fileName.replace(/\.[^.]+$/, "");
  // Exclude full-film audio tracks (e.g. 全片配音-...)
  if (/全片|full[-_\s]?(?:audio|voiceover|film)/i.test(stem)) return null;
  const match = /(?:镜头|镜|shot|s|scene)[-_\s#]*0*(\d+)(?:[-_\s]+v?(\d+))?/i.exec(stem);
  if (!match) return null;
  const shotNum = Number.parseInt(match[1], 10);
  const revision = match[2] ? Number.parseInt(match[2], 10) : 0;
  if (!Number.isFinite(shotNum) || shotNum <= 0) return null;
  return { shotNum, revision: Number.isFinite(revision) ? revision : 0 };
}

function buildAudioLookupByShotNumber(audioAssets: ProjectAsset[]): Map<number, ProjectAsset> {
  const bestByShot = new Map<number, { asset: ProjectAsset; revision: number }>();
  for (const asset of audioAssets) {
    const parsed = parseAudioShotKey(asset.name);
    if (!parsed) continue;
    const prev = bestByShot.get(parsed.shotNum);
    if (
      !prev ||
      parsed.revision > prev.revision ||
      (parsed.revision === prev.revision && asset.importedAt.localeCompare(prev.asset.importedAt) > 0)
    ) {
      bestByShot.set(parsed.shotNum, { asset, revision: parsed.revision });
    }
  }
  const map = new Map<number, ProjectAsset>();
  for (const [num, entry] of bestByShot.entries()) map.set(num, entry.asset);
  return map;
}

function findAudioAssetForShot(
  row: StoryboardRow,
  shotNumber: string,
  audioAssets: ProjectAsset[],
  audioByShotNumber: Map<number, ProjectAsset>
): ProjectAsset | null {
  const linked = audioAssets.find((a) => a.linkedShotId === row.id);
  if (linked) return linked;
  const parsedShotNum = Number.parseInt(shotNumber.replace(/[^\d]/g, ""), 10);
  if (Number.isFinite(parsedShotNum) && parsedShotNum > 0) {
    return audioByShotNumber.get(parsedShotNum) ?? null;
  }
  return null;
}

function inferMimeType(fileName: string, fallback = "application/octet-stream"): string {
  const ext = extname(fileName).toLowerCase();
  switch (ext) {
    case ".mp4":
    case ".m4v":
      return "video/mp4";
    case ".mov":
      return "video/quicktime";
    case ".webm":
      return "video/webm";
    case ".mkv":
      return "video/x-matroska";
    case ".mp3":
      return "audio/mpeg";
    case ".wav":
      return "audio/wav";
    case ".m4a":
    case ".aac":
      return "audio/mp4";
    case ".ogg":
      return "audio/ogg";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".avif":
      return "image/avif";
    default:
      return fallback;
  }
}

async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor;
      cursor += 1;
      await worker(items[idx]);
    }
  });
  await Promise.all(runners);
}
