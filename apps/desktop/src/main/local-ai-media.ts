import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  isSeedanceAspectRatio,
  type ByokImageProviderId,
  type ByokVideoProviderId,
  type CloudApiResult,
  type SeedanceAspectRatio,
  type SeedanceVideoResolution,
  type StoryboardCloudDeliveryRetryResponse,
  type StoryboardCloudGenerationTarget,
  type StoryboardCloudVideoGenerationTarget,
  type StoryboardImageBatchResult,
  type StoryboardImageTaskSummary,
  type StoryboardVideoCloudBatchResult,
  type StoryboardVideoFirstFrameInput,
  type StoryboardVideoTaskSummary
} from "../shared";
import { assertSafeRemoteMediaUrl, type ByokStore } from "./byok-store";

const KIE_FILE_BASE64_UPLOAD_URL = "https://kieai.redpandaai.co/api/file-base64-upload";
const KIE_SEEDANCE_2_MODEL = "bytedance/seedance-2";

type PersistedImageTask = StoryboardImageTaskSummary & {
  projectId: string;
  batchId: string;
  provider: ByokImageProviderId;
  prompt: string;
  aspectRatio: string;
};

type PersistedVideoTask = StoryboardVideoTaskSummary & {
  projectId: string;
  batchId: string;
  provider: ByokVideoProviderId;
  prompt: string;
  aspectRatio: SeedanceAspectRatio;
  durationSec: number;
  resolution: SeedanceVideoResolution;
};

type LocalAiTasksFile = {
  version: 1;
  imageTasks: PersistedImageTask[];
  videoTasks: PersistedVideoTask[];
};

export class LocalAiMediaService {
  private readonly tasksPath: string;
  private readonly cacheDir: string;
  private readonly byok: ByokStore;

  constructor(dataDir: string, byok: ByokStore) {
    this.tasksPath = join(dataDir, "local-ai-tasks.json");
    this.cacheDir = join(dataDir, "generated-media-cache");
    this.byok = byok;
  }

  async generateStoryboardImages(
    projectId: string,
    payload: { overwriteExisting: boolean; items: StoryboardCloudGenerationTarget[] }
  ): Promise<CloudApiResult<StoryboardImageBatchResult>> {
    const snapshot = this.byok.getSnapshot();
    const providerId = snapshot.activeImageProvider;
    const creds = this.byok.resolveCredentials(providerId);

    if (!creds.apiKey) {
      return {
        ok: false,
        error: {
          code: "BYOK_NOT_CONFIGURED",
          message: `尚未配置图片生成 API Key（当前选择：${providerId.toUpperCase()}）。请在「设置 -> API 密钥 (BYOK)」中填写 ${providerId.toUpperCase()} Key，或切换为离线占位 (Stub) 模式。`
        }
      };
    }

    const batchId = `batch_img_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const createdTasks: PersistedImageTask[] = [];
    let submittedCount = 0;
    let failedCount = 0;

    for (const item of payload.items) {
      const taskId = `img_${randomUUID()}`;
      const aspectRatio = item.aspectRatio || "16:9";
      const baseTask: PersistedImageTask = {
        taskId,
        batchId,
        projectId,
        rowId: item.rowId,
        provider: providerId,
        prompt: item.prompt,
        aspectRatio,
        status: "running",
        providerTaskId: null,
        resultUrl: null,
        resultAssetId: null,
        errorMessage: null,
        creditsReserved: 0,
        createdAt: now,
        updatedAt: now
      };

      try {
        if (providerId === "kie") {
          const submitted = await submitKieImageTask(creds.baseUrl, creds.apiKey, {
            taskId,
            prompt: item.prompt,
            model: creds.model,
            aspectRatio
          });
          if (!submitted.ok) {
            baseTask.status = "failed";
            baseTask.errorMessage = submitted.message;
            failedCount += 1;
          } else {
            baseTask.providerTaskId = submitted.providerTaskId;
            submittedCount += 1;
          }
        } else if (providerId === "openai") {
          const bytes = await generateOpenAiImage(creds.baseUrl, creds.apiKey, creds.model, item.prompt, aspectRatio);
          baseTask.resultUrl = this.writeCachedMediaFile(`${taskId}.png`, bytes);
          baseTask.status = "succeeded";
          submittedCount += 1;
        } else if (providerId === "gemini") {
          const { bytes, ext } = await generateGeminiImage(creds.baseUrl, creds.apiKey, creds.model, item.prompt);
          baseTask.resultUrl = this.writeCachedMediaFile(`${taskId}.${ext}`, bytes);
          baseTask.status = "succeeded";
          submittedCount += 1;
        } else {
          // Offline stub PNG
          const bytes = createStubPngBytes(item.prompt, aspectRatio);
          baseTask.resultUrl = this.writeCachedMediaFile(`${taskId}.png`, bytes);
          baseTask.status = "succeeded";
          submittedCount += 1;
        }
      } catch (error) {
        baseTask.status = "failed";
        baseTask.errorMessage = error instanceof Error ? error.message : String(error);
        failedCount += 1;
      }

      createdTasks.push(baseTask);
    }

    const storeData = this.readTasks();
    storeData.imageTasks.push(...createdTasks);
    this.pruneAndWriteTasks(storeData);

    return {
      ok: true,
      data: {
        batchId,
        cloudProjectId: projectId,
        targetCount: payload.items.length,
        creditsRequired: 0,
        creditsReserved: 0,
        submittedCount,
        failedCount,
        tasks: createdTasks.map(toImageTaskSummary)
      }
    };
  }

  async getStoryboardImageBatch(
    projectId: string,
    batchId: string
  ): Promise<
    CloudApiResult<{
      batchId: string;
      tasks: StoryboardImageTaskSummary[];
      counts: { running: number; succeeded: number; failed: number; deliveryFailed?: number; cancelled: number; total: number };
    }>
  > {
    const storeData = this.readTasks();
    const batchTasks = storeData.imageTasks.filter((t) => t.projectId === projectId && t.batchId === batchId);
    await this.refreshRunningImageTasks(batchTasks);
    this.pruneAndWriteTasks(storeData);

    return {
      ok: true,
      data: {
        batchId,
        tasks: batchTasks.map(toImageTaskSummary),
        counts: summarizeTaskCounts(batchTasks)
      }
    };
  }

  async getActiveStoryboardImageGenerations(
    projectId: string
  ): Promise<
    CloudApiResult<{
      batchId: string;
      tasks: StoryboardImageTaskSummary[];
      counts: { running: number; succeeded: number; failed: number; deliveryFailed?: number; cancelled: number; total: number };
    }>
  > {
    const storeData = this.readTasks();
    const active = storeData.imageTasks.filter(
      (t) => t.projectId === projectId && (t.status === "queued" || t.status === "running")
    );
    if (active.length > 0) {
      await this.refreshRunningImageTasks(active);
      this.pruneAndWriteTasks(storeData);
    }
    return {
      ok: true,
      data: {
        batchId: active[0]?.batchId || "active",
        tasks: active.map(toImageTaskSummary),
        counts: summarizeTaskCounts(active)
      }
    };
  }

  async generateStoryboardVideos(
    projectId: string,
    payload: { overwriteExisting: boolean; items: StoryboardCloudVideoGenerationTarget[] }
  ): Promise<CloudApiResult<StoryboardVideoCloudBatchResult>> {
    const snapshot = this.byok.getSnapshot();
    const providerId = snapshot.activeVideoProvider;
    const creds = this.byok.resolveCredentials(providerId);

    if (!creds.apiKey) {
      return {
        ok: false,
        error: {
          code: "BYOK_NOT_CONFIGURED",
          message: `尚未配置 Seedance 视频生成 API Key（KIE_API_KEY）。请在「设置 -> API 密钥 (BYOK)」中填写 KIE Key。`
        }
      };
    }

    const batchId = `batch_vid_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const createdTasks: PersistedVideoTask[] = [];
    let submittedCount = 0;
    let failedCount = 0;

    for (const item of payload.items) {
      const taskId = `vid_${randomUUID()}`;
      const aspectRatio: SeedanceAspectRatio = isSeedanceAspectRatio(item.aspectRatio) ? item.aspectRatio : "16:9";
      const durationSec = typeof item.durationSec === "number" && Number.isFinite(item.durationSec) ? item.durationSec : 12;
      const resolution: SeedanceVideoResolution = item.resolution === "1080p" ? "1080p" : "720p";

      const baseTask: PersistedVideoTask = {
        taskId,
        batchId,
        projectId,
        rowId: item.rowId,
        method: "Seedance 2.0",
        provider: providerId,
        prompt: item.prompt,
        aspectRatio,
        durationSec,
        resolution,
        status: "running",
        providerTaskId: null,
        resultUrl: null,
        resultAssetId: null,
        errorMessage: undefined,
        creditsReserved: 0,
        createdAt: now,
        updatedAt: now
      };

      try {
        {
          let firstFrameUrl: string | null = null;
          if (item.firstFrame?.dataBase64) {
            firstFrameUrl = await uploadKieReferenceFrame(creds.apiKey, taskId, item.firstFrame);
          }
          const submitted = await submitKieSeedanceVideoTask(creds.baseUrl, creds.apiKey, {
            taskId,
            prompt: item.prompt,
            aspectRatio,
            durationSec,
            resolution,
            firstFrameUrl
          });
          if (!submitted.ok) {
            baseTask.status = "failed";
            baseTask.errorMessage = submitted.message;
            failedCount += 1;
          } else {
            baseTask.providerTaskId = submitted.providerTaskId;
            submittedCount += 1;
          }
        }
      } catch (error) {
        baseTask.status = "failed";
        baseTask.errorMessage = error instanceof Error ? error.message : String(error);
        failedCount += 1;
      }

      createdTasks.push(baseTask);
    }

    const storeData = this.readTasks();
    storeData.videoTasks.push(...createdTasks);
    this.pruneAndWriteTasks(storeData);

    return {
      ok: true,
      data: {
        batchId,
        cloudProjectId: projectId,
        targetCount: payload.items.length,
        creditsRequired: 0,
        creditsReserved: 0,
        submittedCount,
        failedCount,
        tasks: createdTasks
      }
    };
  }

  async getStoryboardVideoBatch(
    projectId: string,
    batchId: string
  ): Promise<
    CloudApiResult<{
      batchId: string;
      tasks: StoryboardVideoTaskSummary[];
      counts: { running: number; succeeded: number; failed: number; deliveryFailed?: number; cancelled: number; total: number };
    }>
  > {
    const storeData = this.readTasks();
    const batchTasks = storeData.videoTasks.filter((t) => t.projectId === projectId && t.batchId === batchId);
    await this.refreshRunningVideoTasks(batchTasks);
    this.pruneAndWriteTasks(storeData);

    return {
      ok: true,
      data: {
        batchId,
        tasks: batchTasks,
        counts: summarizeTaskCounts(batchTasks)
      }
    };
  }

  async getActiveStoryboardVideoGenerations(
    projectId: string
  ): Promise<
    CloudApiResult<{
      batchId: string;
      tasks: StoryboardVideoTaskSummary[];
      counts: { running: number; succeeded: number; failed: number; deliveryFailed?: number; cancelled: number; total: number };
    }>
  > {
    const storeData = this.readTasks();
    const active = storeData.videoTasks.filter(
      (t) => t.projectId === projectId && (t.status === "queued" || t.status === "running")
    );
    if (active.length > 0) {
      await this.refreshRunningVideoTasks(active);
      this.pruneAndWriteTasks(storeData);
    }
    return {
      ok: true,
      data: {
        batchId: active[0]?.batchId || "active",
        tasks: active,
        counts: summarizeTaskCounts(active)
      }
    };
  }

  async retryStoryboardGenerationDelivery(
    projectId: string,
    kind: "image" | "video",
    taskIdOrProviderTaskId: string
  ): Promise<CloudApiResult<StoryboardCloudDeliveryRetryResponse>> {
    const storeData = this.readTasks();
    const kieCreds = this.byok.resolveCredentials("kie");

    if (kind === "image") {
      const task = storeData.imageTasks.find(
        (t) => t.projectId === projectId && (t.taskId === taskIdOrProviderTaskId || t.providerTaskId === taskIdOrProviderTaskId)
      );
      if (task?.providerTaskId && kieCreds.apiKey) {
        const polled = await pollKieTaskStatus(kieCreds.baseUrl, kieCreds.apiKey, task.providerTaskId);
        if (polled.ok && polled.resultUrl) {
          assertSafeRemoteMediaUrl(polled.resultUrl);
          task.resultUrl = polled.resultUrl;
          task.status = "succeeded";
          task.errorMessage = null;
          task.updatedAt = new Date().toISOString();
          this.pruneAndWriteTasks(storeData);
          return { ok: true, data: { kind: "image", recovered: true, imageTask: toImageTaskSummary(task) } };
        }
      }
      if (task) {
        return { ok: true, data: { kind: "image", recovered: Boolean(task.resultUrl), imageTask: toImageTaskSummary(task) } };
      }
      if (kieCreds.apiKey) {
        const polled = await pollKieTaskStatus(kieCreds.baseUrl, kieCreds.apiKey, taskIdOrProviderTaskId);
        if (polled.ok && polled.resultUrl) {
          assertSafeRemoteMediaUrl(polled.resultUrl);
          return {
            ok: true,
            data: {
              kind: "image",
              recovered: true,
              imageTask: {
                taskId: taskIdOrProviderTaskId,
                providerTaskId: taskIdOrProviderTaskId,
                rowId: null,
                status: "succeeded",
                resultUrl: polled.resultUrl,
                creditsReserved: 0
              }
            }
          };
        }
      }
      return { ok: false, error: { code: "NOT_FOUND", message: "未找到可重试恢复的图片任务。" } };
    }

    const videoTask = storeData.videoTasks.find(
      (t) => t.projectId === projectId && (t.taskId === taskIdOrProviderTaskId || t.providerTaskId === taskIdOrProviderTaskId)
    );
    if (videoTask?.providerTaskId && kieCreds.apiKey) {
      const polled = await pollKieTaskStatus(kieCreds.baseUrl, kieCreds.apiKey, videoTask.providerTaskId);
      if (polled.ok && polled.resultUrl) {
        assertSafeRemoteMediaUrl(polled.resultUrl);
        videoTask.resultUrl = polled.resultUrl;
        videoTask.status = "succeeded";
        videoTask.errorMessage = undefined;
        videoTask.updatedAt = new Date().toISOString();
        this.pruneAndWriteTasks(storeData);
        return { ok: true, data: { kind: "video", recovered: true, videoTask } };
      }
    }
    if (videoTask) {
      return { ok: true, data: { kind: "video", recovered: Boolean(videoTask.resultUrl), videoTask } };
    }
    if (kieCreds.apiKey) {
      const polled = await pollKieTaskStatus(kieCreds.baseUrl, kieCreds.apiKey, taskIdOrProviderTaskId);
      if (polled.ok && polled.resultUrl) {
        assertSafeRemoteMediaUrl(polled.resultUrl);
        return {
          ok: true,
          data: {
            kind: "video",
            recovered: true,
            videoTask: {
              taskId: taskIdOrProviderTaskId,
              providerTaskId: taskIdOrProviderTaskId,
              rowId: "",
              method: "Seedance 2.0",
              status: "succeeded",
              resultUrl: polled.resultUrl
            }
          }
        };
      }
    }
    return { ok: false, error: { code: "NOT_FOUND", message: "未找到可重试恢复的视频任务。" } };
  }

  private async refreshRunningImageTasks(tasks: PersistedImageTask[]): Promise<void> {
    const kieCreds = this.byok.resolveCredentials("kie");
    for (const task of tasks) {
      if ((task.status !== "queued" && task.status !== "running") || task.resultUrl) continue;
      if (task.provider === "kie" && task.providerTaskId && kieCreds.apiKey) {
        const snapshot = await pollKieTaskStatus(kieCreds.baseUrl, kieCreds.apiKey, task.providerTaskId);
        task.updatedAt = new Date().toISOString();
        if (!snapshot.ok) {
          task.status = "delivery_failed";
          task.canRetryDelivery = true;
          task.errorMessage = snapshot.message;
        } else if (snapshot.resultUrl) {
          assertSafeRemoteMediaUrl(snapshot.resultUrl);
          task.resultUrl = snapshot.resultUrl;
          task.status = "succeeded";
          task.errorMessage = null;
        } else if (snapshot.status === "failed") {
          task.status = "failed";
          task.errorMessage = snapshot.errorMessage || "KIE image task failed.";
        }
      }
    }
  }

  private async refreshRunningVideoTasks(tasks: PersistedVideoTask[]): Promise<void> {
    const kieCreds = this.byok.resolveCredentials("kie");
    for (const task of tasks) {
      if ((task.status !== "queued" && task.status !== "running") || task.resultUrl) continue;
      if (task.provider === "kie" && task.providerTaskId && kieCreds.apiKey) {
        const snapshot = await pollKieTaskStatus(kieCreds.baseUrl, kieCreds.apiKey, task.providerTaskId);
        task.updatedAt = new Date().toISOString();
        if (!snapshot.ok) {
          task.status = "delivery_failed";
          task.canRetryDelivery = true;
          task.errorMessage = snapshot.message;
        } else if (snapshot.resultUrl) {
          assertSafeRemoteMediaUrl(snapshot.resultUrl);
          task.resultUrl = snapshot.resultUrl;
          task.status = "succeeded";
          task.errorMessage = undefined;
        } else if (snapshot.status === "failed") {
          task.status = "failed";
          task.errorMessage = snapshot.errorMessage || "KIE Seedance video task failed.";
        }
      }
    }
  }

  private writeCachedMediaFile(fileName: string, bytes: Buffer): string {
    mkdirSync(this.cacheDir, { recursive: true });
    const filePath = join(this.cacheDir, fileName);
    writeFileSync(filePath, bytes);
    return pathToFileURL(filePath).toString();
  }

  private readTasks(): LocalAiTasksFile {
    if (!existsSync(this.tasksPath)) return { version: 1, imageTasks: [], videoTasks: [] };
    try {
      const parsed = JSON.parse(readFileSync(this.tasksPath, "utf8")) as Partial<LocalAiTasksFile>;
      return {
        version: 1,
        imageTasks: Array.isArray(parsed.imageTasks) ? parsed.imageTasks : [],
        videoTasks: Array.isArray(parsed.videoTasks) ? parsed.videoTasks : []
      };
    } catch {
      return { version: 1, imageTasks: [], videoTasks: [] };
    }
  }

  private pruneAndWriteTasks(data: LocalAiTasksFile): void {
    data.imageTasks = data.imageTasks.slice(-500);
    data.videoTasks = data.videoTasks.slice(-500);
    mkdirSync(dirname(this.tasksPath), { recursive: true });
    const temp = `${this.tasksPath}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(temp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    try {
      renameSync(temp, this.tasksPath);
    } catch (error) {
      rmSync(temp, { force: true });
      throw error;
    }
  }
}

function toImageTaskSummary(task: PersistedImageTask): StoryboardImageTaskSummary {
  return {
    taskId: task.taskId,
    batchId: task.batchId,
    rowId: task.rowId,
    status: task.status,
    providerTaskId: task.providerTaskId,
    resultUrl: task.resultUrl,
    resultAssetId: task.resultAssetId,
    errorMessage: task.errorMessage,
    canRetryDelivery: task.canRetryDelivery,
    creditsReserved: 0,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt
  };
}

function summarizeTaskCounts(tasks: Array<{ status: string }>) {
  let running = 0;
  let succeeded = 0;
  let failed = 0;
  let deliveryFailed = 0;
  let cancelled = 0;
  for (const t of tasks) {
    if (t.status === "queued" || t.status === "running") running += 1;
    else if (t.status === "succeeded") succeeded += 1;
    else if (t.status === "delivery_failed") deliveryFailed += 1;
    else if (t.status === "cancelled") cancelled += 1;
    else failed += 1;
  }
  return { running, succeeded, failed, deliveryFailed, cancelled, total: tasks.length };
}

function normalizeKieImageAspectRatio(aspectRatio?: string): string {
  if (aspectRatio === "9:16" || aspectRatio === "3:4" || aspectRatio === "4:3" || aspectRatio === "1:1" || aspectRatio === "16:9") {
    return aspectRatio;
  }
  return "16:9";
}

async function submitKieImageTask(
  baseUrl: string,
  apiKey: string,
  payload: { taskId: string; prompt: string; model: string; aspectRatio?: string }
): Promise<{ ok: true; providerTaskId: string } | { ok: false; message: string }> {
  try {
    const response = await fetch(`${baseUrl}/api/v1/jobs/createTask`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: payload.model || "gpt-image-2-text-to-image",
        input: {
          prompt: payload.prompt,
          aspect_ratio: normalizeKieImageAspectRatio(payload.aspectRatio),
          resolution: "4K"
        }
      })
    });
    const raw = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) return { ok: false, message: String(raw.message ?? raw.msg ?? response.statusText) };
    const data = isRecord(raw.data) ? raw.data : {};
    const providerTaskId = String(data.taskId ?? raw.taskId ?? raw.id ?? raw.submit_id ?? "");
    if (!providerTaskId) return { ok: false, message: String(raw.msg ?? raw.message ?? "KIE createTask did not return a taskId.") };
    return { ok: true, providerTaskId };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "KIE image request failed" };
  }
}

async function uploadKieReferenceFrame(apiKey: string, taskId: string, input: StoryboardVideoFirstFrameInput): Promise<string> {
  const mimeType = input.mimeType?.trim() || "image/png";
  const rawBase64 = (input.dataBase64 ?? "").replace(/^data:[^;]+;base64,/, "").trim();
  const dataUrl = `data:${mimeType};base64,${rawBase64}`;
  const fileName = (input.fileName || `${taskId}-reference.png`).replace(/[^a-zA-Z0-9._-]+/g, "-");
  const response = await fetch(KIE_FILE_BASE64_UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      base64Data: dataUrl,
      uploadPath: "images/mkboard-seedance-reference-images",
      fileName
    })
  });
  const raw = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new Error(String(raw.message ?? raw.msg ?? response.statusText));
  const data = isRecord(raw.data) ? raw.data : {};
  const url = data.downloadUrl ?? data.fileUrl ?? data.file_url ?? data.url;
  if (typeof url !== "string" || !url.startsWith("http")) {
    throw new Error("KIE 参考首帧上传未返回有效 URL。");
  }
  return url;
}

async function submitKieSeedanceVideoTask(
  baseUrl: string,
  apiKey: string,
  payload: {
    taskId: string;
    prompt: string;
    aspectRatio: SeedanceAspectRatio;
    durationSec: number;
    resolution: SeedanceVideoResolution;
    firstFrameUrl?: string | null;
  }
): Promise<{ ok: true; providerTaskId: string } | { ok: false; message: string }> {
  try {
    const input: Record<string, unknown> = {
      prompt: payload.prompt,
      generate_audio: true,
      resolution: payload.resolution,
      aspect_ratio: payload.aspectRatio,
      duration: payload.durationSec,
      web_search: false
    };
    if (payload.firstFrameUrl) input.reference_image_urls = [payload.firstFrameUrl];
    const response = await fetch(`${baseUrl}/api/v1/jobs/createTask`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: KIE_SEEDANCE_2_MODEL,
        input
      })
    });
    const raw = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) return { ok: false, message: String(raw.message ?? raw.msg ?? response.statusText) };
    const data = isRecord(raw.data) ? raw.data : {};
    const providerTaskId = String(data.taskId ?? raw.taskId ?? raw.id ?? raw.submit_id ?? "");
    if (!providerTaskId) return { ok: false, message: String(raw.msg ?? raw.message ?? "KIE Seedance createTask did not return a taskId.") };
    return { ok: true, providerTaskId };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "KIE Seedance request failed" };
  }
}

async function pollKieTaskStatus(
  baseUrl: string,
  apiKey: string,
  providerTaskId: string
): Promise<{ ok: true; status: "running" | "succeeded" | "failed"; resultUrl: string | null; errorMessage: string | null } | { ok: false; message: string }> {
  try {
    const url = new URL("/api/v1/jobs/recordInfo", baseUrl);
    url.searchParams.set("taskId", providerTaskId);
    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    const raw = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) return { ok: false, message: String(raw.message ?? raw.msg ?? response.statusText) };
    const data = isRecord(raw.data) ? raw.data : raw;
    const stateRaw = String(data.state ?? data.status ?? raw.state ?? raw.status ?? "").trim().toLowerCase();
    const status =
      stateRaw === "success" || stateRaw === "succeeded" || stateRaw === "completed" || stateRaw === "complete"
        ? "succeeded"
        : stateRaw === "fail" || stateRaw === "failed" || stateRaw === "error"
          ? "failed"
          : "running";
    const resultUrl = extractKieResultUrl(data) ?? extractKieResultUrl(raw);
    return {
      ok: true,
      status,
      resultUrl,
      errorMessage: String(data.failMsg ?? data.errorMessage ?? raw.message ?? raw.msg ?? "") || null
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "KIE poll failed" };
  }
}

function extractKieResultUrl(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  const direct = payload.resultUrl ?? payload.image_url ?? payload.imageUrl ?? payload.url;
  if (typeof direct === "string" && direct.startsWith("http")) return direct;
  const resultJson = payload.resultJson;
  let parsed: unknown = resultJson;
  if (typeof resultJson === "string") {
    try {
      parsed = JSON.parse(resultJson);
    } catch {
      parsed = null;
    }
  }
  if (isRecord(parsed)) {
    const urls = parsed.resultUrls ?? parsed.urls ?? parsed.images;
    if (Array.isArray(urls)) {
      const hit = urls.find((u) => typeof u === "string" && u.startsWith("http"));
      if (typeof hit === "string") return hit;
    }
    const nested = parsed.resultUrl ?? parsed.url;
    if (typeof nested === "string" && nested.startsWith("http")) return nested;
  }
  return null;
}

async function generateOpenAiImage(baseUrl: string, apiKey: string, model: string, prompt: string, aspectRatio: string): Promise<Buffer> {
  const size = aspectRatio === "9:16" || aspectRatio === "3:4" ? "1024x1536" : aspectRatio === "1:1" ? "1024x1024" : "1536x1024";
  const response = await fetch(`${baseUrl}/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: model || "gpt-image-1",
      prompt,
      n: 1,
      size
    })
  });
  const body = (await response.json().catch(() => ({}))) as {
    data?: Array<{ b64_json?: string; url?: string }>;
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(body.error?.message || `OpenAI image HTTP ${response.status}`);
  const item = body.data?.[0];
  if (item?.b64_json) return Buffer.from(item.b64_json, "base64");
  if (item?.url) {
    assertSafeRemoteMediaUrl(item.url);
    const dl = await fetch(item.url);
    if (!dl.ok) throw new Error(`OpenAI image download HTTP ${dl.status}`);
    return Buffer.from(await dl.arrayBuffer());
  }
  throw new Error("OpenAI image response did not include image bytes.");
}

async function generateGeminiImage(baseUrl: string, apiKey: string, model: string, prompt: string): Promise<{ bytes: Buffer; ext: string }> {
  const targetModel = model || "gemini-2.5-flash-image";
  const response = await fetch(`${baseUrl}/models/${encodeURIComponent(targetModel)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["IMAGE", "TEXT"] }
    })
  });
  const body = (await response.json().catch(() => ({}))) as {
    candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> } }>;
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(body.error?.message || `Gemini image HTTP ${response.status}`);
  for (const cand of body.candidates ?? []) {
    for (const part of cand.content?.parts ?? []) {
      if (part.inlineData?.data) {
        const mime = part.inlineData.mimeType || "image/png";
        const ext = mime.includes("jpeg") || mime.includes("jpg") ? "jpg" : mime.includes("webp") ? "webp" : "png";
        return { bytes: Buffer.from(part.inlineData.data, "base64"), ext };
      }
    }
  }
  throw new Error("Gemini response did not include inlineData image bytes.");
}

// Deterministic valid 16x9 / 9x16 solid slate PNG for offline zero-key Stub mode (CRC32 + uncompressed IDAT)
function createStubPngBytes(prompt: string, aspectRatio: string): Buffer {
  const width = aspectRatio === "9:16" || aspectRatio === "3:4" ? 360 : 640;
  const height = aspectRatio === "9:16" || aspectRatio === "3:4" ? 640 : 360;
  // Color hash from prompt so every shot gets a distinct editorial palette block
  let hash = 2166136261;
  for (let i = 0; i < prompt.length; i += 1) {
    hash ^= prompt.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const rBase = 36 + ((hash >>> 0) % 90);
  const gBase = 48 + ((hash >>> 8) % 90);
  const bBase = 72 + ((hash >>> 16) % 110);

  const rawRows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (width * 3 + 1);
    rawRows[rowOffset] = 0; // filter none
    const grad = Math.floor((y / height) * 38);
    const border = y < 8 || y >= height - 8;
    for (let x = 0; x < width; x += 1) {
      const px = rowOffset + 1 + x * 3;
      const frame = border || x < 8 || x >= width - 8;
      rawRows[px] = frame ? 250 : Math.min(255, rBase + grad);
      rawRows[px + 1] = frame ? 215 : Math.min(255, gBase + grad);
      rawRows[px + 2] = frame ? 74 : Math.min(255, bBase + grad);
    }
  }

  const zlibData = zlibStoreUncompressed(rawRows);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlibData),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function zlibStoreUncompressed(raw: Buffer): Buffer {
  const blocks: Buffer[] = [Buffer.from([0x78, 0x01])];
  let offset = 0;
  while (offset < raw.length) {
    const chunkLen = Math.min(65535, raw.length - offset);
    const isFinal = offset + chunkLen >= raw.length ? 1 : 0;
    const header = Buffer.alloc(5);
    header[0] = isFinal;
    header.writeUInt16LE(chunkLen, 1);
    header.writeUInt16LE(~chunkLen & 0xffff, 3);
    blocks.push(header, raw.subarray(offset, offset + chunkLen));
    offset += chunkLen;
  }
  let s1 = 1;
  let s2 = 0;
  for (let i = 0; i < raw.length; i += 1) {
    s1 = (s1 + raw[i]) % 65521;
    s2 = (s2 + s1) % 65521;
  }
  const adler = Buffer.alloc(4);
  adler.writeUInt32BE(((s2 << 16) | s1) >>> 0, 0);
  blocks.push(adler);
  return Buffer.concat(blocks);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function isRecord(val: unknown): val is Record<string, unknown> {
  return Boolean(val) && typeof val === "object" && !Array.isArray(val);
}
