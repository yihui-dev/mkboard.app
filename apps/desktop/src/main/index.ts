import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, protocol, shell } from "electron";
import type { NativeImage, WebContents } from "electron";
import { randomUUID } from "node:crypto";
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, isAbsolute, join, parse } from "node:path";
import { fileURLToPath } from "node:url";
import { MkboardStore, type StoryboardImageDeliveryRecoveryRecord, type StoryboardVideoTaskRecord } from "./database";
import { runConversationTitleAgent, runStoryboardAgent } from "./codex-agent";
import {
  applyAgentResponseWrites,
  applyConfirmedAgentOperations,
  attachAgentImageAttachmentsToRegeneratedVideoRows,
  completeAgentResponseFromDirectStoryboardIntent,
  resolveAgentRowRef,
  summarizeAgentOperations,
  summarizeAgentResult
} from "./agent-operations";
import { getCodexCliStatus, scanLocalCliAgents, startClaudeCodeLogin, startCodexCliLogin, testHyperframesDoctor } from "./codex-auth";
import { findCliAgentDefinition } from "./agent-registry";
import { assertSafeRemoteMediaUrl, ByokStore } from "./byok-store";
import { CompanionServer } from "./companion-server";
import {
  checkSkillrySkillAccess,
  disconnectSkillryAccount,
  getSkillryCatalogStatus,
  getSkillryCollectionDetail,
  importSkillFromSource,
  importTasteFromSource,
  installSkillryPack,
  pollSkillryDeviceAuth,
  startSkillryDeviceAuth,
  syncSkillryPackToMkboard
} from "./style-skill-hub";
import { ElevenLabsService } from "./elevenlabs";
import { packagedWebBaseUrl } from "./generated-runtime-defaults";
import { LocalAiMediaService } from "./local-ai-media";
import { DesktopUpdater } from "./desktop-updater";
import { resolveBundledRuntime } from "./bundled-runtime";
import {
  assertDreaminaVideoFileAspectRatio,
  countDreaminaOutputFiles,
  discoverDreaminaOutputGroups,
  discoverDreaminaRunDirectories,
  discoverDreaminaSubmittedTasks,
  listDreaminaSubmittedTasks,
  queryDreaminaTaskResult,
  removeDreaminaForbiddenMediaOperations,
  resolveDreaminaVideoAspectRatio,
  type DreaminaOutputGroup,
  type DreaminaSubmittedTask,
  type DreaminaTaskHint
} from "./dreamina-agent";
import { ensureHyperframesStudioPreviewForWorkDir, runLocalStoryboardVideoGeneration, stopActiveHyperframesStudioPreviews, suggestedVideoAssetName } from "./local-video";
import { startDesktopMcpBridge, type DesktopMcpBridge } from "./mcp/desktop-bridge";
import { ProjectExportError, sanitizeExportFileName, writeProjectExport } from "./project-export";
import {
  detectDreaminaCliIntent,
  inferAgentMentionedStoryboardRowIds
} from "../agent-generation-intent";
import {
  defaultAgentConversationTitle,
  isAgentNetworkFailureMessage,
  isSeedanceAspectRatio,
  isStoryboardGenerationMethodColumn,
  isStoryboardVideoPromptColumn,
  normalizeHyperframesVideoResolution,
  normalizeImageRatio,
  normalizeSeedanceVideoResolution,
  seedanceVideoCreditsPerSecond
} from "../shared";
import type {
  McpActiveViewReport,
  StoryboardRow,
  ActiveStoryboardParseRun,
  AgentCliId,
  AgentEvent,
  AgentMessageAttachment,
  AgentOperation,
  AgentOperationConfirmation,
  AgentRequest,
  AgentResponse,
  AgentStreamEvent,
  ApplyAgentOperationsResult,
  ByokImageProviderId,
  ByokProviderId,
  ByokSaveInput,
  ByokVideoProviderId,
  CloudApiResult,
  CompanionAccessMode,
  CreateProjectInput,
  CreateProjectTemplateInput,
  CreateSkillInput,
  CreateTasteInput,
  ExternalSourceImportInput,
  SkillryInstallInput,
  SkillryPackId,
  UpdateTasteInput,
  DreaminaAgentRegenerateMediaOperation,
  DesktopVersionCheckResult,
  ElevenLabsSpeechInput,
  ElevenLabsSpeechStatusInput,
  ExecuteConfirmedDreaminaAgentGenerationInput,
  GenerateStoryboardInput,
  HyperframesStudioOpenInput,
  ImageRatio,
  InterfaceLanguage,
  OnboardingStatePatch,
  ProjectAsset,
  ProjectDetail,
  ProjectExportKind,
  ProjectExportResult,
  SeedanceAspectRatio,
  ShotMediaUpdateResult,
  StoryboardDeliveryRetryInput,
  StoryboardDeliveryRetryResult,
  StoryboardCloudVideoGenerationTarget,
  StoryboardImageTaskSummary,
  StoryboardImageBatchInput,
  StoryboardImageBatchSyncInput,
  StoryboardActiveVideoGenerationTask,
  StoryboardVideoBatchInput,
  StoryboardVideoBatchResult,
  StoryboardVideoGenerationEvent,
  StoryboardVideoGenerationMethod,
  StoryboardVideoGenerationProgress,
  StoryboardVideoGenerationTarget,
  StoryboardVideoTaskSummary,
  TutorialMediaRevealInput,
  TutorialStoryboardRevealInput,
  StoryboardColumn,
  UpdateProjectInput,
  UpdateProjectTemplateInput,
  UpdateSkillInput,
  UpdateShotInput
} from "../shared";

app.setName("MkBoard");

let mainWindow: BrowserWindow | null = null;
let store: MkboardStore;
let byokStore: ByokStore;
let localAiMedia: LocalAiMediaService;
let companionServer: CompanionServer | null = null;
let elevenLabs: ElevenLabsService;
let desktopUpdater: DesktopUpdater;
let mcpBridge: DesktopMcpBridge | null = null;
const activeHyperframesStudioWindows = new Map<string, BrowserWindow>();
const activeAgentRuns = new Map<string, AbortController>();
const activeStoryboardParseRuns = new Map<string, ActiveStoryboardParseRun>();
const activeAgentTitleRuns = new Set<string>();
const activeStoryboardVideoTasks = new Map<string, Map<string, StoryboardActiveVideoGenerationTask>>();
const activeStoryboardVideoRuns = new Map<string, Set<AbortController>>();

const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);
const isReleaseSmokeTest = process.env.MKBOARD_RELEASE_SMOKE_TEST === "1" || process.argv.includes("--mkboard-release-smoke-test");
const releaseSmokeTestUserDataDir = process.env.MKBOARD_RELEASE_SMOKE_USER_DATA_DIR;
const isDesktopUpdateE2eTest = process.env.MKBOARD_UPDATE_E2E_TEST === "1" && process.argv.includes("--mkboard-update-e2e");
const desktopUpdateE2eUserDataDir = process.env.MKBOARD_UPDATE_E2E_USER_DATA_DIR;
if (isReleaseSmokeTest && releaseSmokeTestUserDataDir) app.setPath("userData", releaseSmokeTestUserDataDir);
if (isDesktopUpdateE2eTest && desktopUpdateE2eUserDataDir) app.setPath("userData", desktopUpdateE2eUserDataDir);
if (isDev && process.env.MKBOARD_TEST_USER_DATA_DIR) app.setPath("userData", process.env.MKBOARD_TEST_USER_DATA_DIR);
const lockedZoomFactor = 1;
const assetPreviewScheme = "mkboard-asset";
const maxLocalDeliveryRetries = 3;
const maxLocalDeliveryAttempts = maxLocalDeliveryRetries + 1;
const localDeliveryRetryDelayMs = 500;
const cloudVideoDeliveryFailurePrefix = "视频已经生成，但云端写回失败";
const localDeliveryFailurePrefix = "本地写回失败：";
const singleInstanceLock = app.requestSingleInstanceLock();
const storyboardParseLogPrefix = "[MkBoard][StoryboardParse]";

function emitDesktopUpdateState(state: DesktopVersionCheckResult): void {
  companionServer?.broadcastEvent("desktop-update-state", state);
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("mkboard:desktop-update-state", state);
}

function hasActiveDesktopWork(): boolean {
  if (activeAgentRuns.size > 0 || activeStoryboardParseRuns.size > 0 || activeStoryboardVideoRuns.size > 0) return true;
  for (const tasks of activeStoryboardVideoTasks.values()) {
    for (const task of tasks.values()) {
      if (task.status === "queued" || task.status === "running") return true;
    }
  }
  return false;
}

type StoryboardParseMainLogContext = {
  clientRunId: string;
  projectId: string;
  agentName: string;
  clickedAt: number;
  startedAt: number;
  lastAt: number;
};

function createStoryboardParseMainLogContext(input: {
  clientRunId: string;
  projectId: string;
  agentName: string;
  clickedAt: number;
  startedAt: number;
}): StoryboardParseMainLogContext {
  return { ...input, lastAt: input.startedAt };
}

function logStoryboardParseMainStep(context: StoryboardParseMainLogContext, step: string, detail: Record<string, unknown> = {}): void {
  const now = Date.now();
  console.log(storyboardParseLogPrefix, {
    layer: "main",
    step,
    clientRunId: context.clientRunId,
    projectId: context.projectId,
    agentName: context.agentName,
    elapsedFromClickMs: now - context.clickedAt,
    elapsedMs: now - context.startedAt,
    stepMs: now - context.lastAt,
    ...detail
  });
  context.lastAt = now;
}

function normalizeInterfaceLanguage(input: unknown): InterfaceLanguage | undefined {
  return input === "en" || input === "zh-CN" || input === "zh-TW" ? input : undefined;
}

function storyboardParseAlreadyRunningMessage(interfaceLanguage?: InterfaceLanguage): string {
  if (interfaceLanguage === "en") return "This project is already generating a storyboard. Wait for the current run to finish.";
  if (interfaceLanguage === "zh-TW") return "這個專案正在生成分鏡，請等待目前任務完成。";
  return "这个项目正在生成分镜，请等待当前任务完成。";
}

function summarizeProjectContextForStoryboardParseLog(project: ProjectDetail): Record<string, unknown> {
  return {
    projectName: project.project.name,
    scriptHtmlChars: project.scriptHtml.length,
    currentRowCount: project.rows.length,
    visibleColumns: project.columns.filter((column) => column.visible).map((column) => ({ id: column.id, label: column.label })),
    imageRatio: project.imageRatio,
    assetCount: project.assets.length,
    storyboardSkillId: project.storyboardSkill.id,
    storyboardSkillName: project.storyboardSkill.name,
    storyboardSkillChars: project.storyboardSkill.content.length,
    tasteId: project.taste.id,
    tasteName: project.taste.name
  };
}

function createAgentMessageAttachmentSnapshot(asset: ProjectAsset): AgentMessageAttachment {
  return {
    id: asset.id,
    name: asset.name,
    kind: asset.kind,
    previewUrl: asset.previewUrl
  };
}

type DreaminaImportedVideo = {
  rowIndex: number;
  rowId: string;
  assetId: string;
  fileName: string;
  outputPath: string;
};

type DreaminaAgentImportResult = {
  importedCount: number;
  attachedRowNumbers: number[];
  mediaUpdate: ShotMediaUpdateResult;
  importedVideos: DreaminaImportedVideo[];
};

async function importDreaminaAgentOutputs(projectId: string, groups: DreaminaOutputGroup[]): Promise<DreaminaAgentImportResult> {
  const project = store.getProject(projectId);
  const attachedRowNumbers: number[] = [];
  const importedVideos: DreaminaImportedVideo[] = [];
  let importedCount = 0;
  let mediaUpdate = store.getShotMediaUpdate(projectId);
  for (const group of groups) {
    const row = group.rowIndex ? project.rows[group.rowIndex - 1] : null;
    if (row) {
      const previousAssetIds = new Set(storyboardRowMediaAssetIds(row));
      mediaUpdate = await store.importShotMediaPaths(projectId, row.id, group.filePaths);
      const updatedRow = mediaUpdate.rows.find((candidate) => candidate.id === row.id);
      const assetById = new Map(mediaUpdate.assets.map((asset) => [asset.id, asset]));
      const newlyAttachedAssets = storyboardRowMediaAssetIds(updatedRow)
        .filter((assetId) => !previousAssetIds.has(assetId))
        .map((assetId) => assetById.get(assetId))
        .filter((asset): asset is ProjectAsset => Boolean(asset));
      const outputVideoNames = new Set(group.filePaths.filter(isVideoFilePath).map((filePath) => basename(filePath)));
      const importedVideoAssets = storyboardRowMediaAssetIds(updatedRow)
        .map((assetId) => assetById.get(assetId))
        .filter((asset): asset is ProjectAsset => asset?.kind === "video" && (newlyAttachedAssets.some((candidate) => candidate.id === asset.id) || outputVideoNames.has(asset.name)));
      const outputVideoPaths = group.filePaths.filter(isVideoFilePath);
      importedVideoAssets.forEach((asset, index) => {
        importedVideos.push({
          rowIndex: group.rowIndex as number,
          rowId: row.id,
          assetId: asset.id,
          fileName: asset.name,
          outputPath: outputVideoPaths[index] ?? outputVideoPaths[0] ?? group.filePaths[0] ?? asset.localPath
        });
      });
      attachedRowNumbers.push(group.rowIndex as number);
      importedCount += newlyAttachedAssets.length;
    } else {
      const previousAssetIds = new Set(mediaUpdate.assets.map((asset) => asset.id));
      const nextAssets = await store.importAssetPaths(projectId, group.filePaths);
      mediaUpdate = store.getShotMediaUpdate(projectId);
      importedCount += nextAssets.filter((asset) => !previousAssetIds.has(asset.id)).length;
    }
  }
  return {
    importedCount,
    attachedRowNumbers: [...new Set(attachedRowNumbers)].sort((a, b) => a - b),
    mediaUpdate,
    importedVideos
  };
}

function storyboardRowMediaAssetIds(row: ProjectDetail["rows"][number] | undefined | null): string[] {
  if (!row) return [];
  return row.imageAssetIds?.length ? row.imageAssetIds : row.imageAssetId ? [row.imageAssetId] : [];
}

function isVideoFilePath(filePath: string): boolean {
  return [".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v"].includes(extname(filePath).toLowerCase());
}

function storyboardRowCellValue(columnId: ProjectDetail["columns"][number]["id"], row: ProjectDetail["rows"][number]): string {
  if (columnId === "shot") return row.shot;
  if (columnId === "scene") return row.scene;
  if (columnId === "duration") return row.duration;
  if (columnId === "content") return row.content;
  if (columnId === "note") return row.note;
  if (columnId.startsWith("custom-")) return row.customValues?.[columnId] ?? "";
  return "";
}

function dreaminaAgentVideoPrompt(project: ProjectDetail, row: ProjectDetail["rows"][number], fallback: string): string {
  const promptColumn = project.columns.find(isStoryboardVideoPromptColumn);
  const prompt = promptColumn ? storyboardRowCellValue(promptColumn.id, row).trim() : "";
  return prompt && prompt !== "—" && prompt !== "-" ? prompt : fallback;
}

type DreaminaAgentRecoverySummary = {
  outputDir: string | null;
  discoveredTaskCount: number;
  queriedTaskCount: number;
  succeededCount: number;
  pendingCount: number;
  failedCount: number;
  importedCount: number;
  attachedRowNumbers: number[];
  mediaUpdate: ShotMediaUpdateResult;
};

type DreaminaTaskUpdateCallback = (
  task: StoryboardVideoTaskRecord,
  progress?: StoryboardVideoGenerationProgress,
  mediaUpdate?: ShotMediaUpdateResult
) => void;

async function recoverDreaminaAgentRun(input: {
  projectId: string;
  outputDir: string;
  requestedRowIds?: string[];
  signal?: AbortSignal;
  onTaskUpdate?: DreaminaTaskUpdateCallback;
}): Promise<DreaminaAgentRecoverySummary> {
  const project = store.getProject(input.projectId);
  const requestedRowIdSet = new Set(input.requestedRowIds ?? []);
  const acceptsRow = (rowId: string) => requestedRowIdSet.size === 0 || requestedRowIdSet.has(rowId);
  const hints = buildDreaminaTaskHints(project);
  const discoveredTasks = discoverDreaminaSubmittedTasks(input.outputDir, hints);
  const localTasks = store
    .listStoryboardVideoTasks(input.projectId)
    .filter((task) => task.provider === "dreamina_cli" && task.output_dir === input.outputDir)
    .slice()
    .reverse();
  const discoveredRowIndexes = new Set(discoveredTasks.flatMap((task) => task.rowIndex ? [task.rowIndex] : []));
  const missingLocalRowIndexes = new Set(
    localTasks
      .map((task) => project.rows.findIndex((row) => row.id === task.row_id) + 1)
      .filter((rowIndex) => rowIndex > 0 && !discoveredRowIndexes.has(rowIndex))
  );
  let submittedTasks = discoveredTasks;
  if (discoveredTasks.length === 0 || discoveredRowIndexes.size === 0 || missingLocalRowIndexes.size > 0) {
    try {
      const serviceTasks = await listDreaminaSubmittedTasks({
        outputDir: input.outputDir,
        hints,
        signal: input.signal
      });
      const matchedFallbackTasks = serviceTasks.filter((task) => {
        if (!task.rowIndex) return false;
        if (missingLocalRowIndexes.size > 0) return missingLocalRowIndexes.has(task.rowIndex);
        const row = project.rows[task.rowIndex - 1];
        return Boolean(row && acceptsRow(row.id));
      });
      submittedTasks = [...discoveredTasks, ...matchedFallbackTasks];
    } catch (error) {
      if (discoveredTasks.length === 0 || discoveredRowIndexes.size === 0) throw error;
    }
  }
  const latestTaskRecordByRowIndex = latestDreaminaTaskRecordByRowIndex(submittedTasks);
  const taskByRowId = new Map<string, StoryboardVideoTaskRecord>();
  localTasks.forEach((task) => {
    if (!taskByRowId.has(task.row_id)) taskByRowId.set(task.row_id, task);
  });

  const updateTask = (
    rowId: string,
    patch: Parameters<MkboardStore["updateStoryboardVideoTask"]>[2],
    progress?: StoryboardVideoGenerationProgress,
    mediaUpdate?: ShotMediaUpdateResult
  ) => {
    const current = taskByRowId.get(rowId);
    if (!current) return null;
    const updated = store.updateStoryboardVideoTask(input.projectId, current.id, patch);
    if (!updated) return null;
    taskByRowId.set(rowId, updated);
    input.onTaskUpdate?.(updated, progress, mediaUpdate);
    return updated;
  };

  latestTaskRecordByRowIndex.forEach((record, rowIndex) => {
    const row = project.rows[rowIndex - 1];
    if (!row || !acceptsRow(row.id)) return;
    let task = taskByRowId.get(row.id);
    if (!task) {
      const created = store.createStoryboardVideoTask({
        projectId: input.projectId,
        rowId: row.id,
        method: "Seedance 2.0",
        prompt: record.prompt || dreaminaAgentVideoPrompt(project, row, ""),
        durationSec: null,
        aspectRatio: project.imageRatio
      });
      task = store.updateStoryboardVideoTask(input.projectId, created.id, {
        provider: "dreamina_cli",
        providerTaskId: record.submitId,
        outputDir: input.outputDir,
        status: record.status === "fail" ? "failed" : "running",
        errorMessage: record.status === "fail" ? record.failReason || "即梦服务端任务失败。" : null
      }) ?? created;
      taskByRowId.set(row.id, task);
      input.onTaskUpdate?.(task, {
        stage: record.status === "fail" ? "cli" : "import",
        stageLabel: record.status === "fail" ? "即梦服务端任务失败" : "已找到即梦服务端任务",
        stageDetail: record.status === "fail" ? record.failReason : `第 ${rowIndex} 镜 · ${record.submitId}`
      });
      return;
    }
    updateTask(row.id, {
      provider: "dreamina_cli",
      providerTaskId: record.submitId,
      outputDir: input.outputDir,
      status: record.status === "fail" ? "failed" : "running",
      errorMessage: record.status === "fail" ? record.failReason || "即梦服务端任务失败。" : null
    }, {
      stage: record.status === "fail" ? "cli" : "import",
      stageLabel: record.status === "fail" ? "即梦服务端任务失败" : "已找到即梦服务端任务",
      stageDetail: record.status === "fail" ? record.failReason : `第 ${rowIndex} 镜 · ${record.submitId}`
    });
  });

  let queriedTaskCount = 0;
  let failedCount = [...latestTaskRecordByRowIndex.entries()].filter(([rowIndex, record]) => {
    const row = project.rows[rowIndex - 1];
    return record.status === "fail" && Boolean(row && acceptsRow(row.id));
  }).length;
  const groupsBeforeQuery = filterDreaminaOutputGroups(
    discoverDreaminaOutputGroups(input.outputDir),
    project,
    requestedRowIdSet
  );
  const rowsWithDownloadedVideo = new Set(
    groupsBeforeQuery.filter((group) => group.rowIndex && group.filePaths.some(isVideoFilePath)).map((group) => group.rowIndex as number)
  );

  for (const [rowIndex, record] of latestTaskRecordByRowIndex) {
    const row = project.rows[rowIndex - 1];
    if (!row || !acceptsRow(row.id) || record.status === "fail" || rowsWithDownloadedVideo.has(rowIndex)) continue;
    queriedTaskCount += 1;
    updateTask(row.id, { status: "running", errorMessage: null }, {
      stage: "import",
      stageLabel: "正在同步即梦服务端任务",
      stageDetail: `第 ${rowIndex} 镜 · ${record.submitId}`
    });
    try {
      const result = await queryDreaminaTaskResult({
        outputDir: input.outputDir,
        rowIndex,
        submitId: record.submitId,
        signal: input.signal
      });
      if (result.status === "fail") {
        failedCount += 1;
        updateTask(row.id, {
          status: "failed",
          providerTaskId: result.submitId,
          errorMessage: result.failReason || "即梦服务端任务失败。"
        }, {
          stage: "cli",
          stageLabel: "即梦服务端任务失败",
          stageDetail: result.failReason || result.submitId
        });
      } else if (result.status === "querying") {
        updateTask(row.id, {
          status: "running",
          providerTaskId: result.submitId,
          errorMessage: null
        }, {
          stage: "queued",
          stageLabel: "即梦服务端仍在生成",
          stageDetail: `第 ${rowIndex} 镜 · 可稍后继续同步`
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateTask(row.id, {
        status: "running",
        providerTaskId: record.submitId,
        errorMessage: `即梦任务同步暂时失败：${message}`
      }, {
        stage: "queued",
        stageLabel: "即梦任务等待再次同步",
        stageDetail: message
      });
    }
  }

  const outputGroups = filterDreaminaOutputGroups(
    discoverDreaminaOutputGroups(input.outputDir),
    project,
    requestedRowIdSet
  );
  const validatedOutputGroups: DreaminaOutputGroup[] = [];
  const runAspectRatios = new Set<SeedanceAspectRatio>(
    [...taskByRowId.values()]
      .filter((candidate) => acceptsRow(candidate.row_id))
      .map((candidate) => candidate.aspect_ratio)
      .filter((aspectRatio): aspectRatio is SeedanceAspectRatio => isSeedanceAspectRatio(aspectRatio))
  );
  const sharedRunAspectRatio = runAspectRatios.size === 1 ? [...runAspectRatios][0] : null;
  let ffprobeBin: string | null = null;
  for (const group of outputGroups) {
    const videoPaths = group.filePaths.filter(isVideoFilePath);
    if (videoPaths.length === 0) {
      validatedOutputGroups.push(group);
      continue;
    }
    const row = group.rowIndex ? project.rows[group.rowIndex - 1] : null;
    if (group.rowIndex && (!row || !acceptsRow(row.id))) continue;
    const task = row ? taskByRowId.get(row.id) : null;
    const expectedAspectRatio = isSeedanceAspectRatio(task?.aspect_ratio)
      ? task.aspect_ratio
      : sharedRunAspectRatio ?? project.imageRatio;
    try {
      ffprobeBin ??= resolveBundledRuntime().ffprobeBin;
      for (const videoPath of videoPaths) {
        await assertDreaminaVideoFileAspectRatio({
          filePath: videoPath,
          expectedAspectRatio,
          ffprobeBin,
          signal: input.signal
        });
      }
      validatedOutputGroups.push(group);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failedCount += 1;
      if (row) {
        updateTask(row.id, {
          status: "failed",
          outputPath: null,
          assetId: null,
          fileName: null,
          errorMessage: message
        }, {
          stage: "cli",
          stageLabel: "即梦视频比例校验失败",
          stageDetail: message
        });
      }
    }
  }
  const imported = countDreaminaOutputFiles(validatedOutputGroups) > 0
    ? await importDreaminaAgentOutputs(input.projectId, validatedOutputGroups)
    : emptyDreaminaImportResult(input.projectId);
  const importedVideoByRowId = new Map(imported.importedVideos.map((video) => [video.rowId, video]));
  const groupByRowIndex = new Map(validatedOutputGroups.filter((group) => group.rowIndex).map((group) => [group.rowIndex as number, group]));

  taskByRowId.forEach((task, rowId) => {
    if (!acceptsRow(rowId)) return;
    const rowIndex = project.rows.findIndex((row) => row.id === rowId) + 1;
    const group = groupByRowIndex.get(rowIndex);
    const videoPath = group?.filePaths.find(isVideoFilePath);
    if (!videoPath) return;
    const importedVideo = importedVideoByRowId.get(rowId);
    updateTask(rowId, {
      status: "succeeded",
      outputPath: videoPath,
      assetId: importedVideo?.assetId ?? task.asset_id ?? null,
      fileName: importedVideo?.fileName ?? basename(videoPath),
      errorMessage: null
    }, {
      stage: "done",
      stageLabel: "即梦视频已同步并导入",
      stageDetail: `第 ${rowIndex} 镜 · ${basename(videoPath)}`
    }, imported.mediaUpdate);
  });

  taskByRowId.forEach((task, rowId) => {
    if (!acceptsRow(rowId) || task.status !== "running") return;
    const rowIndex = project.rows.findIndex((row) => row.id === rowId) + 1;
    if (rowIndex <= 0 || latestTaskRecordByRowIndex.has(rowIndex)) return;
    updateTask(rowId, {
      status: "running",
      errorMessage: "Agent 已结束，但 MkBoard 尚未捕获该镜头的即梦 submit_id；将继续从本次运行记录中同步。"
    }, {
      stage: "queued",
      stageLabel: "等待发现即梦服务端任务",
      stageDetail: `第 ${rowIndex} 镜`
    });
  });

  const scopedTasks = [...taskByRowId.values()].filter((task) => acceptsRow(task.row_id));
  const scopedDiscoveredTaskCount = [...latestTaskRecordByRowIndex.keys()].filter((rowIndex) => {
    const row = project.rows[rowIndex - 1];
    return Boolean(row && acceptsRow(row.id));
  }).length;
  return {
    outputDir: input.outputDir,
    discoveredTaskCount: scopedDiscoveredTaskCount,
    queriedTaskCount,
    succeededCount: scopedTasks.filter((task) => task.status === "succeeded").length,
    pendingCount: scopedTasks.filter((task) => task.status === "queued" || task.status === "running").length,
    failedCount: Math.max(failedCount, scopedTasks.filter((task) => task.status === "failed").length),
    importedCount: imported.importedCount,
    attachedRowNumbers: imported.attachedRowNumbers,
    mediaUpdate: imported.mediaUpdate
  };
}

async function recoverDreaminaAgentResultsForRequest(input: {
  projectId: string;
  message: string;
  signal?: AbortSignal;
  onTaskUpdate?: DreaminaTaskUpdateCallback;
}): Promise<DreaminaAgentRecoverySummary> {
  const project = store.getProject(input.projectId);
  const requestedRowIds = inferAgentMentionedStoryboardRowIds(input.message, project.rows);
  const requestedRowIdSet = new Set(requestedRowIds);
  const hints = buildDreaminaTaskHints(project);
  const runDirectories = discoverDreaminaRunDirectories(project.project.localPath);
  const selectedRun = runDirectories.find(({ outputDir }) => {
    const records = discoverDreaminaSubmittedTasks(outputDir, hints);
    const groups = discoverDreaminaOutputGroups(outputDir);
    if (requestedRowIdSet.size === 0) return records.length > 0 || countDreaminaOutputFiles(groups) > 0;
    return records.some((record) => {
      const row = record.rowIndex ? project.rows[record.rowIndex - 1] : null;
      return Boolean(row && requestedRowIdSet.has(row.id));
    }) || groups.some((group) => {
      const row = group.rowIndex ? project.rows[group.rowIndex - 1] : null;
      return Boolean(row && requestedRowIdSet.has(row.id));
    });
  }) ?? runDirectories[0];
  if (!selectedRun) return emptyDreaminaRecoverySummary(input.projectId);
  return recoverDreaminaAgentRun({
    projectId: input.projectId,
    outputDir: selectedRun.outputDir,
    requestedRowIds,
    signal: input.signal,
    onTaskUpdate: input.onTaskUpdate
  });
}

function buildDreaminaTaskHints(project: ProjectDetail): DreaminaTaskHint[] {
  const assetById = new Map(project.assets.map((asset) => [asset.id, asset]));
  return project.rows.map((row, index) => ({
    rowIndex: index + 1,
    prompt: dreaminaAgentVideoPrompt(project, row, ""),
    referencePaths: storyboardRowMediaAssetIds(row)
      .map((assetId) => assetById.get(assetId)?.localPath)
      .filter((path): path is string => Boolean(path))
  }));
}

function latestDreaminaTaskRecordByRowIndex(records: DreaminaSubmittedTask[]): Map<number, DreaminaSubmittedTask> {
  const latest = new Map<number, DreaminaSubmittedTask>();
  records.forEach((record) => {
    if (!record.rowIndex) return;
    const previous = latest.get(record.rowIndex);
    if (!previous || record.order >= previous.order) {
      latest.set(record.rowIndex, record);
    }
  });
  return latest;
}

function filterDreaminaOutputGroups(groups: DreaminaOutputGroup[], project: ProjectDetail, requestedRowIdSet: Set<string>): DreaminaOutputGroup[] {
  if (requestedRowIdSet.size === 0) return groups;
  return groups.filter((group) => {
    if (!group.rowIndex) return false;
    const row = project.rows[group.rowIndex - 1];
    return Boolean(row && requestedRowIdSet.has(row.id));
  });
}

function emptyDreaminaImportResult(projectId: string): DreaminaAgentImportResult {
  return {
    importedCount: 0,
    attachedRowNumbers: [],
    mediaUpdate: store.getShotMediaUpdate(projectId),
    importedVideos: []
  };
}

function emptyDreaminaRecoverySummary(projectId: string): DreaminaAgentRecoverySummary {
  return {
    outputDir: null,
    discoveredTaskCount: 0,
    queriedTaskCount: 0,
    succeededCount: 0,
    pendingCount: 0,
    failedCount: 0,
    importedCount: 0,
    attachedRowNumbers: [],
    mediaUpdate: store.getShotMediaUpdate(projectId)
  };
}

function formatDreaminaRecoveryReply(summary: DreaminaAgentRecoverySummary): string {
  if (!summary.outputDir || (summary.discoveredTaskCount === 0 && summary.importedCount === 0 && summary.succeededCount === 0)) {
    return "没有找到可同步的即梦 CLI 任务或下载结果。本次没有提交新的生成任务，也没有调用 KIE。";
  }
  const details = [
    `已查询 ${summary.discoveredTaskCount} 个即梦服务端任务`,
    `已完成并关联 ${summary.succeededCount} 个视频`,
    `本次新增导入 ${summary.importedCount} 个素材`
  ];
  if (summary.attachedRowNumbers.length > 0) details.push(`已回绑镜头 ${summary.attachedRowNumbers.join("、")}`);
  if (summary.pendingCount > 0) details.push(`${summary.pendingCount} 个任务仍在即梦服务端生成，可稍后再次同步`);
  if (summary.failedCount > 0) details.push(`${summary.failedCount} 个任务已明确失败`);
  return `${details.join("；")}。本次只同步已有任务，没有重新生成，也没有调用 KIE。`;
}

async function executeConfirmedDreaminaAgentGeneration(
  sender: WebContents | null,
  input: ExecuteConfirmedDreaminaAgentGenerationInput
): Promise<ProjectDetail> {
  if (!input.operations.length || input.operations.some((operation) => operation.type !== "regenerate_media" || operation.provider !== "dreamina_cli")) {
    throw new Error("缺少已由 Agent 确认的即梦生成操作。");
  }

  const project = store.getProject(input.projectId);
  const videoAspectRatioSelection = resolveDreaminaVideoAspectRatio(input.userMessage, project.imageRatio);
  const imageRowIds = new Set<string>();
  const videoRowIds = new Set<string>();
  input.operations.forEach((operation) => {
    const target = operation.kind === "video" ? videoRowIds : imageRowIds;
    operation.rowRefs.forEach((rowRef) => target.add(resolveAgentRowRef(store, input.projectId, rowRef)));
  });
  if (imageRowIds.size === 0 && videoRowIds.size === 0) throw new Error("即梦生成操作没有有效的目标分镜。");

  const generationKind = imageRowIds.size > 0 && videoRowIds.size > 0 ? "mixed" : videoRowIds.size > 0 ? "video" : "image";
  const runId = `${input.clientRunId}-confirmed-dreamina`;
  const outputDir = join(project.project.localPath, ".mkboard", "dreamina", runId.replace(/[^a-zA-Z0-9._-]/gu, "-"));
  const controller = new AbortController();
  const videoTaskByRowId = new Map<string, StoryboardVideoTaskRecord>();
  let activeRunRegistered = false;
  const rowIndexByRowId = new Map(project.rows.map((row, index) => [row.id, index + 1]));
  const sendVideoTaskEvent = (
    task: StoryboardVideoTaskRecord,
    progress: StoryboardVideoGenerationProgress = {},
    mediaUpdate?: ShotMediaUpdateResult
  ) => {
    const taskEvent = { ...storyboardVideoTaskEvent(task), ...progress, mediaUpdate } satisfies Omit<StoryboardVideoGenerationEvent, "projectId">;
    updateActiveStoryboardVideoTask(input.projectId, taskEvent);
    const fullEvent = { projectId: input.projectId, ...taskEvent } satisfies StoryboardVideoGenerationEvent;
    companionServer?.broadcastEvent("storyboard-video-generation-event", fullEvent);
    const targetSender = sender && !sender.isDestroyed() ? sender : mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : null;
    if (targetSender) {
      targetSender.send("mkboard:storyboard-video-generation-event", fullEvent);
    }
  };

  mkdirSync(outputDir, { recursive: true });

  videoRowIds.forEach((rowId) => {
    const row = project.rows.find((candidate) => candidate.id === rowId);
    if (!row) return;
    const createdTask = store.createStoryboardVideoTask({
      projectId: input.projectId,
      rowId,
      method: "Seedance 2.0",
      prompt: dreaminaAgentVideoPrompt(project, row, input.userMessage),
      durationSec: null,
      aspectRatio: videoAspectRatioSelection.aspectRatio
    });
    const task = store.updateStoryboardVideoTask(input.projectId, createdTask.id, {
      status: "running",
      provider: "dreamina_cli",
      outputDir
    }) ?? createdTask;
    videoTaskByRowId.set(rowId, task);
    sendVideoTaskEvent(task, {
      stage: "cli",
      stageLabel: "即梦 CLI Agent 正在生成",
      stageDetail: `第 ${rowIndexByRowId.get(rowId) ?? "-"} 镜`
    });
  });
  if (videoTaskByRowId.size > 0) {
    addActiveStoryboardVideoRun(input.projectId, controller);
    activeRunRegistered = true;
  }

  const taskInstruction = buildConfirmedDreaminaGenerationInstruction(project, input.operations, videoAspectRatioSelection);
  try {
    const response = removeDreaminaForbiddenMediaOperations(await runStoryboardAgent({
      project: store.getProject(input.projectId),
      tab: "storyboard",
      message: taskInstruction,
      userVisibleMessage: input.userMessage,
      agentCliId: input.agentCliId,
      interfaceLanguage: input.interfaceLanguage,
      dreaminaGeneration: {
        kind: generationKind,
        outputDir,
        projectAspectRatio: project.imageRatio,
        videoAspectRatio: videoAspectRatioSelection.aspectRatio,
        videoAspectRatioSource: videoAspectRatioSelection.source
      }
    }, {
      signal: controller.signal
    }));
    const recovery = await recoverDreaminaAgentRun({
      projectId: input.projectId,
      outputDir,
      signal: controller.signal,
      onTaskUpdate: sendVideoTaskEvent
    });
    if (recovery.importedCount === 0 && recovery.discoveredTaskCount === 0 && recovery.succeededCount === 0) {
      throw new Error(response.reply || "即梦 CLI 没有生成可导入的图片或视频。");
    }
    return store.getProject(input.projectId, input.interfaceLanguage);
  } catch (error) {
    try {
      await recoverDreaminaAgentRun({
        projectId: input.projectId,
        outputDir,
        onTaskUpdate: sendVideoTaskEvent
      });
    } catch (recoveryError) {
      console.warn("Failed to recover confirmed Dreamina Agent generation", recoveryError);
    }
    throw error;
  } finally {
    if (activeRunRegistered) removeActiveStoryboardVideoRun(input.projectId, controller);
  }
}

function buildConfirmedDreaminaGenerationInstruction(
  project: ProjectDetail,
  operations: DreaminaAgentRegenerateMediaOperation[],
  videoAspectRatioSelection: ReturnType<typeof resolveDreaminaVideoAspectRatio>
): string {
  const targets = operations.map((operation) => ({
    kind: operation.kind,
    rows: operation.rowRefs.map((rowRef) => {
      const rowId = resolveAgentRowRef(store, project.project.id, rowRef);
      const rowIndex = project.rows.findIndex((row) => row.id === rowId) + 1;
      return {
        rowId,
        rowIndex,
        ...(operation.kind === "video" ? { aspectRatio: videoAspectRatioSelection.aspectRatio } : {})
      };
    })
  }));
  const ratioInstruction = videoAspectRatioSelection.source === "user"
    ? `用户已明确指定视频比例为 ${videoAspectRatioSelection.aspectRatio}，该比例优先于当前项目比例 ${project.imageRatio}。`
    : `用户未明确指定不同的精确视频比例，视频必须采用当前项目比例 ${project.imageRatio}。`;
  return `用户已经在 MkBoard Agent 对话内的统一确认卡片中确认本次即梦 CLI 生成。\n只执行下列已确认目标，不新增、不替换、不猜测其他镜头：\n${JSON.stringify(targets, null, 2)}\n${ratioInstruction} 每条即梦视频生成命令都必须显式传入 --ratio=${videoAspectRatioSelection.aspectRatio}，不得省略或使用 CLI 默认比例。\n根据每个目标镜头当前的提示词和已绑定参考素材执行生成，并严格按即梦专用指令保存任务 ID、下载结果和输出目录。最终 operations 必须返回空数组。`;
}

function summarizeAgentEventForStoryboardParseLog(event: AgentEvent): Record<string, unknown> {
  if (event.kind === "status") return { kind: event.kind, label: event.label, detail: event.detail };
  if (event.kind === "usage") {
    return {
      kind: event.kind,
      inputTokens: event.inputTokens,
      outputTokens: event.outputTokens,
      cachedInputTokens: event.cachedInputTokens,
      reasoningOutputTokens: event.reasoningOutputTokens,
      durationMs: event.durationMs
    };
  }
  if (event.kind === "tool_use") return { kind: event.kind, name: event.name, input: event.input };
  if (event.kind === "tool_result") return { kind: event.kind, isError: event.isError, contentPreview: truncateStoryboardParseLogText(event.content, 800) };
  if (event.kind === "error") return { kind: event.kind, message: event.message, rawPreview: truncateStoryboardParseLogText(event.raw ?? "", 800) };
  if (event.kind === "raw") return { kind: event.kind, linePreview: truncateStoryboardParseLogText(event.line, 800) };
  if (event.kind === "thinking") return { kind: event.kind, textPreview: truncateStoryboardParseLogText(event.text, 800) };
  return { kind: event.kind, textPreview: truncateStoryboardParseLogText(event.text, 800) };
}

function truncateStoryboardParseLogText(input: string, maxLength: number): string {
  if (input.length <= maxLength) return input;
  return `${input.slice(0, maxLength - 1)}…`;
}

installProcessPipeGuard();
installKnownReadableStreamExceptionGuard();

if (!singleInstanceLock) {
  app.quit();
}

if (singleInstanceLock) {
  app.on("second-instance", () => {
    focusMainWindow();
  });
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: assetPreviewScheme,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true
    }
  }
]);

function createWindow(): void {
  const appIcon = loadAppIcon();

  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1180,
    minHeight: 720,
    title: "MkBoard",
    icon: appIcon,
    backgroundColor: "#f5f6f8",
    show: !isReleaseSmokeTest,
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      zoomFactor: lockedZoomFactor
    }
  });
  mainWindow = window;

  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null;
  });

  lockWindowZoom(window);

  const loadPromise = isDev && process.env.ELECTRON_RENDERER_URL
    ? window.loadURL(process.env.ELECTRON_RENDERER_URL)
    : window.loadFile(join(__dirname, "../renderer/index.html"));

  void loadPromise;
  if (isReleaseSmokeTest) installReleaseSmokeTestHooks(window, loadPromise);
  openDevToolsInDevelopment(window);
}

function installReleaseSmokeTestHooks(window: BrowserWindow, loadPromise: Promise<void>): void {
  let finished = false;
  const timeout = setTimeout(() => {
    console.error("[MkBoard][ReleaseSmokeTest] renderer load timed out");
    app.exit(124);
  }, 15_000);
  timeout.unref?.();

  const finish = (code: number, message: string, error?: unknown) => {
    if (finished) return;
    finished = true;
    clearTimeout(timeout);
    if (error) console.error(message, error);
    else console.log(message);
    app.exit(code);
  };

  window.webContents.once("render-process-gone", (_event, details) => {
    finish(125, "[MkBoard][ReleaseSmokeTest] renderer process gone", details);
  });

  loadPromise
    .then(() => {
      setTimeout(() => finish(0, "[MkBoard][ReleaseSmokeTest] renderer load ok"), 500).unref?.();
    })
    .catch((error: unknown) => {
      finish(126, "[MkBoard][ReleaseSmokeTest] renderer failed to load", error);
    });
}

function loadAppIcon(): Electron.NativeImage | undefined {
  const iconPath = isDev ? join(__dirname, "../../resources/icon.png") : join(process.resourcesPath, "icon.png");
  if (!existsSync(iconPath)) return undefined;

  const icon = nativeImage.createFromPath(iconPath);
  return icon.isEmpty() ? undefined : icon;
}

function openDevToolsInDevelopment(window: BrowserWindow): void {
  if (!isDev || process.env.MKBOARD_OPEN_DEVTOOLS !== "1") return;
  window.webContents.once("dom-ready", () => {
    if (window.isDestroyed() || window.webContents.isDestroyed()) return;
    window.webContents.openDevTools({ mode: "detach" });
  });
}

function installProcessPipeGuard(): void {
  for (const stream of [process.stdout, process.stderr]) {
    stream.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EPIPE") return;
      throw error;
    });
  }
}

function installKnownReadableStreamExceptionGuard(): void {
  process.on("uncaughtException", (error) => {
    if (isReadableStreamAlreadyClosedError(error)) {
      console.warn("Ignored stale readable stream close", error);
      return;
    }
    throw error;
  });
}

function isReadableStreamAlreadyClosedError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    (error as NodeJS.ErrnoException).code === "ERR_INVALID_STATE" &&
    /ReadableStream is already closed/i.test(error.message) &&
    /node:internal\/(?:deps\/undici|webstreams)\//.test(error.stack ?? "")
  );
}

function protocolUrlsFromArgv(argv: string[]): string[] {
  return argv.filter((arg) => /^mkboard:\/\//i.test(arg));
}

function focusMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = null;
    if (app.isReady()) createWindow();
  }
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
}

function sendAgentEventToRenderer(preferredWebContents: WebContents | null, payload: AgentStreamEvent): void {
  companionServer?.broadcastEvent("agent-event", payload);
  const currentWebContents = mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : null;
  for (const targetWebContents of [currentWebContents, preferredWebContents]) {
    if (!targetWebContents || targetWebContents.isDestroyed()) continue;
    try {
      targetWebContents.send("mkboard:agent-event", payload);
      return;
    } catch {
      // The initiating window can close between the isDestroyed check and send.
    }
  }
}

function lockWindowZoom(window: BrowserWindow): void {
  const { webContents } = window;
  const resetZoom = () => {
    webContents.setZoomFactor(lockedZoomFactor);
    webContents.setZoomLevel(0);
  };

  resetZoom();
  void webContents.setVisualZoomLevelLimits(lockedZoomFactor, lockedZoomFactor);
  webContents.on("did-finish-load", resetZoom);
  webContents.on("zoom-changed", (event) => {
    event.preventDefault();
    resetZoom();
  });
  webContents.on("before-input-event", (event, input) => {
    if (!isZoomShortcut(input)) return;
    event.preventDefault();
    resetZoom();
  });
}

function isZoomShortcut(input: Electron.Input): boolean {
  if (input.type !== "keyDown") return false;
  const usesZoomModifier = process.platform === "darwin" ? input.meta : input.control;
  if (!usesZoomModifier || input.alt) return false;

  const key = input.key.toLowerCase();
  const code = input.code.toLowerCase();
  return (
    key === "+" ||
    key === "=" ||
    key === "-" ||
    key === "_" ||
    key === "0" ||
    code === "equal" ||
    code === "minus" ||
    code === "digit0" ||
    code === "numpadadd" ||
    code === "numpadsubtract" ||
    code === "numpad0"
  );
}

async function sendAgentMessageInternal(request: AgentRequest, sender: WebContents | null): Promise<AgentResponse> {
  const clientRunId = request.clientRunId || randomUUID();
  const agentCliId = request.agentCliId ?? "codex";
  const interfaceLanguage = normalizeInterfaceLanguage(request.interfaceLanguage);
  const agentName = agentCliDisplayName(agentCliId);
  const controller = new AbortController();
  const project = store.getProject(request.projectId, interfaceLanguage);
  const attachmentIds = new Set(request.attachmentAssetIds ?? []);
  const attachments = project.assets.filter((asset) => attachmentIds.has(asset.id) && asset.kind === "image");
  const attachmentSnapshots = attachments.map(createAgentMessageAttachmentSnapshot);
  const events: AgentEvent[] = [
    { kind: "status", label: "context", detail: "正在读取当前脚本、分镜表、项目素材和 SKILL。" },
    ...(attachments.length > 0
      ? [
          {
            kind: "status" as const,
            label: "context",
            detail: `已附加 ${attachments.length} 张图片，将作为本次对话参考。`
          }
        ]
      : []),
    { kind: "status", label: "running", detail: "正在等待模型分析请求。" }
  ];
  const conversationId = request.conversationId || store.createAgentConversation(request.projectId).activeConversationId;
  activeAgentRuns.set(clientRunId, controller);
  store.appendAgentMessage(request.projectId, "user", request.message, { conversationId, attachments: attachmentSnapshots });
  const conversationMessages = store.getAgentConversation(request.projectId, conversationId).messages;
  const assistantMessage = store.appendAgentMessage(request.projectId, "assistant", "", {
    conversationId,
    events,
    runStatus: "running",
    clientRunId,
    agentCliId
  });
  let streamedAssistantContent = "";
  const emitAgentEvent = (agentEvent: AgentEvent) => {
    events.push(agentEvent);
    if (agentEvent.kind === "text") {
      streamedAssistantContent += agentEvent.text;
    }
    store.updateAgentMessage(request.projectId, assistantMessage.id, {
      content: streamedAssistantContent || assistantMessage.content,
      events,
      runStatus: "running"
    });
    sendAgentEventToRenderer(sender, {
      projectId: request.projectId,
      conversationId,
      clientRunId,
      assistantMessageId: assistantMessage.id,
      event: agentEvent
    });
  };
  const dreaminaIntent = detectDreaminaCliIntent(request.message);
  const dreaminaRecoveryRequest = dreaminaIntent?.action === "recover";
  const sendDreaminaVideoGenerationEvent = (
    task: StoryboardVideoTaskRecord,
    progress: StoryboardVideoGenerationProgress = {},
    mediaUpdate?: ShotMediaUpdateResult
  ) => {
    const taskEvent = {
      ...storyboardVideoTaskEvent(task),
      ...progress,
      mediaUpdate
    } satisfies Omit<StoryboardVideoGenerationEvent, "projectId">;
    updateActiveStoryboardVideoTask(request.projectId, taskEvent);
    const fullEvent = { projectId: request.projectId, ...taskEvent } satisfies StoryboardVideoGenerationEvent;
    companionServer?.broadcastEvent("storyboard-video-generation-event", fullEvent);
    const target = sender && !sender.isDestroyed() ? sender : mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : null;
    if (target) target.send("mkboard:storyboard-video-generation-event", fullEvent);
  };
  try {
    let response: AgentResponse;
    if (dreaminaRecoveryRequest) {
      emitAgentEvent({ kind: "status", label: "dreamina", detail: "正在查询即梦服务端已有任务并同步下载结果；本次不会重新生成。" });
      const recovery = await recoverDreaminaAgentResultsForRequest({
        projectId: request.projectId,
        message: request.message,
        signal: controller.signal,
        onTaskUpdate: sendDreaminaVideoGenerationEvent
      });
      response = {
        reply: formatDreaminaRecoveryReply(recovery),
        operations: []
      };
      emitAgentEvent({
        kind: "status",
        label: "dreamina",
        detail:
          recovery.pendingCount > 0
            ? `即梦任务同步完成，本次导入 ${recovery.importedCount} 个素材，仍有 ${recovery.pendingCount} 个任务在服务端生成。`
            : `即梦任务同步完成，本次导入 ${recovery.importedCount} 个素材。`
      });
    } else {
      response = await runStoryboardAgent(
        {
          project,
          tab: request.tab,
          message: request.message,
          agentCliId,
          model: request.model,
          effort: request.effort,
          interfaceLanguage,
          attachments,
          conversationMessages
        },
        {
          signal: controller.signal,
          onEvent: emitAgentEvent
        }
      );
    }
    const latestProject = store.getProject(request.projectId, interfaceLanguage);
    const completedResponse = dreaminaRecoveryRequest
      ? removeDreaminaForbiddenMediaOperations(response)
      : completeAgentResponseFromDirectStoryboardIntent(response, latestProject, request.message, {
          allowMediaGenerationFallback: dreaminaIntent?.action !== "generate"
        });
    const responseWithAttachmentMedia = attachAgentImageAttachmentsToRegeneratedVideoRows(
      completedResponse,
      latestProject,
      attachments.map((asset) => asset.id)
    );
    const writeResult = applyAgentResponseWrites(store, request.projectId, responseWithAttachmentMedia, emitAgentEvent);
    let appliedOperations = writeResult.appliedOperations;
    let pendingOperations = writeResult.pendingOperations;

    // T3 Code-style Auto-Apply permission mode: automatically commit non-media storyboard operations
    if (request.permissionMode === "auto-apply" && pendingOperations.length > 0) {
      const autoOps = pendingOperations.filter((op) => !(op.type === "regenerate_media" && op.provider === "dreamina_cli"));
      const remainingPending = pendingOperations.filter((op) => op.type === "regenerate_media" && op.provider === "dreamina_cli");
      if (autoOps.length > 0) {
        const newlyApplied = applyConfirmedAgentOperations(store, request.projectId, autoOps);
        appliedOperations = [...appliedOperations, ...newlyApplied];
        pendingOperations = remainingPending;
      }
    }

    const responseWithWrites: AgentResponse = {
      ...responseWithAttachmentMedia,
      appliedOperations,
      pendingOperations
    };
    const succeededEvent: AgentEvent = { kind: "status", label: "succeeded", detail: summarizeAgentResult(responseWithWrites) };
    events.push(succeededEvent);
    store.updateAgentMessage(request.projectId, assistantMessage.id, {
      content: responseWithAttachmentMedia.reply,
      events,
      runStatus: "succeeded"
    });
    sendAgentEventToRenderer(sender, {
      projectId: request.projectId,
      conversationId,
      clientRunId,
      assistantMessageId: assistantMessage.id,
      event: succeededEvent
    });
    scheduleAgentConversationTitle(request.projectId, conversationId, agentCliId, interfaceLanguage, sender);
    return { ...responseWithWrites, runStatus: "succeeded" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const reply = formatAgentFailureReply(message, agentName);
    const canceled = controller.signal.aborted || /canceled/i.test(message);
    const terminalEvent: AgentEvent = {
      kind: "status",
      label: canceled ? "canceled" : "failed",
      detail: canceled ? formatAgentCanceledDetail(agentName) : formatAgentFailureDetail(message, agentName)
    };
    events.push(terminalEvent);
    store.updateAgentMessage(request.projectId, assistantMessage.id, {
      content: canceled ? formatAgentCanceledReply(agentName) : reply,
      events,
      runStatus: canceled ? "canceled" : "failed"
    });
    sendAgentEventToRenderer(sender, {
      projectId: request.projectId,
      conversationId,
      clientRunId,
      assistantMessageId: assistantMessage.id,
      event: terminalEvent
    });
    if (!canceled) scheduleAgentConversationTitle(request.projectId, conversationId, agentCliId, interfaceLanguage, sender);
    return { reply: canceled ? formatAgentCanceledReply(agentName) : reply, error: message, runStatus: canceled ? "canceled" : "failed" };
  } finally {
    activeAgentRuns.delete(clientRunId);
  }
}

function handleReportActiveView(view: McpActiveViewReport): void {
  mcpBridge?.reportActiveView({
    projectId: typeof view?.projectId === "string" && view.projectId ? view.projectId : null,
    screen: typeof view?.screen === "string" ? view.screen : undefined,
    tab: view?.tab,
    agentCliId: typeof view?.agentCliId === "string" && view.agentCliId ? view.agentCliId : undefined,
    interfaceLanguage: normalizeInterfaceLanguage(view?.interfaceLanguage),
    speechVoiceId: typeof view?.speechVoiceId === "string" ? view.speechVoiceId.trim() : undefined,
    hyperframesResolution: view?.hyperframesResolution ? normalizeHyperframesVideoResolution(view.hyperframesResolution) : undefined,
    seedanceResolution: view?.seedanceResolution ? normalizeSeedanceVideoResolution(view.seedanceResolution) : undefined,
    hyperframesConcurrency:
      typeof view?.hyperframesConcurrency === "number" && Number.isInteger(view.hyperframesConcurrency) && view.hyperframesConcurrency > 0
        ? view.hyperframesConcurrency
        : undefined
  });
}

async function dispatchCompanionRpc(method: string, args: unknown[]): Promise<unknown> {
  const defaultSender = mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : null;
  switch (method) {
    case "getCodexStatus":
      return getCodexCliStatus();
    case "connectCodex":
      return startCodexCliLogin();
    case "connectClaudeCode":
      return startClaudeCodeLogin();
    case "scanLocalCliAgents":
      return scanLocalCliAgents();
    case "testHyperframesDoctor":
      return testHyperframesDoctor();
    case "openHyperframesStudio":
      return openHyperframesStudio(args[0] as HyperframesStudioOpenInput);
    case "getByokSettings":
      return byokStore.getSnapshot();
    case "saveByokProvider":
      return byokStore.saveProvider(args[0] as ByokSaveInput);
    case "clearByokProvider":
      return byokStore.clearProviderKey(args[0] as ByokProviderId);
    case "setByokActiveProviders":
      return byokStore.setActiveProviders(args[0] as { activeImageProvider?: ByokImageProviderId; activeVideoProvider?: ByokVideoProviderId });
    case "testByokProvider":
      return byokStore.testProvider(args[0] as ByokProviderId, args[1] as string | undefined);
    case "getCompanionStatus":
      return companionServer?.getStatus() ?? null;
    case "setCompanionMode":
      return companionServer?.setMode(args[0] as CompanionAccessMode, args[1] as number | undefined) ?? null;
    case "rotateCompanionToken":
      return companionServer?.rotateToken() ?? null;
    case "getMcpBridgeStatus":
      return mcpBridge?.getStatus(companionServer?.getStatus().mcpHttpUrl) ?? null;
    case "setMcpBridgeEnabled":
      return mcpBridge?.setEnabled(args[0] === true, companionServer?.getStatus().mcpHttpUrl) ?? null;
    case "reportActiveView":
      handleReportActiveView(args[0] as McpActiveViewReport);
      return null;
    case "getElevenLabsStatus":
      return elevenLabs.getStatus();
    case "saveElevenLabsApiKey":
      return elevenLabs.saveApiKey(String(args[0] ?? ""));
    case "clearElevenLabsApiKey":
      return elevenLabs.clearApiKey();
    case "listElevenLabsVoices":
      return elevenLabs.listVoices();
    case "synthesizeElevenLabsSpeech":
      return elevenLabs.synthesizeSpeech(args[0] as ElevenLabsSpeechInput);
    case "getElevenLabsSpeechStatus":
      return elevenLabs.getSpeechStatus(args[0] as ElevenLabsSpeechStatusInput);
    case "checkDesktopVersion":
      return desktopUpdater.checkForUpdates();
    case "startDesktopUpdate":
      return desktopUpdater.startUpdate();
    case "installDesktopUpdate":
      return desktopUpdater.installUpdate();
    case "generateStoryboardImages":
      return submitStoryboardImageGeneration(args[0] as StoryboardImageBatchInput);
    case "syncStoryboardImageBatch":
      return syncStoryboardImageBatch(args[0] as StoryboardImageBatchSyncInput);
    case "syncActiveStoryboardImageGenerations":
      return syncActiveStoryboardImageGenerations(String(args[0]));
    case "generateStoryboardVideos":
      return runStoryboardVideoGeneration(args[0] as StoryboardVideoBatchInput, defaultSender);
    case "cancelStoryboardVideoGenerations":
      return cancelStoryboardVideoGenerations(String(args[0]));
    case "getActiveStoryboardVideoGenerations":
      return getStoryboardVideoGenerationState(String(args[0]));
    case "retryStoryboardGenerationDelivery":
      return retryStoryboardGenerationDelivery(args[0] as StoryboardDeliveryRetryInput);
    case "ensureTutorialProject":
      return store.ensureTutorialProject(normalizeInterfaceLanguage(args[0]));
    case "getOnboardingState":
      return store.getOnboardingState(app.getVersion(), normalizeInterfaceLanguage(args[0]));
    case "updateOnboardingState":
      return store.updateOnboardingState(args[0] as OnboardingStatePatch, app.getVersion(), normalizeInterfaceLanguage(args[1]));
    case "revealTutorialStoryboard": {
      const input = args[0] as TutorialStoryboardRevealInput;
      return store.revealTutorialStoryboard({ ...input, interfaceLanguage: normalizeInterfaceLanguage(input.interfaceLanguage) });
    }
    case "revealTutorialMedia": {
      const input = args[0] as TutorialMediaRevealInput;
      return store.revealTutorialMedia({ ...input, interfaceLanguage: normalizeInterfaceLanguage(input.interfaceLanguage) });
    }
    case "listProjects":
      return store.listProjects();
    case "listArchivedProjects":
      return store.listArchivedProjects();
    case "listDeletedProjects":
      return store.listDeletedProjects();
    case "countRetainedProjects":
      return store.countRetainedProjects();
    case "createProject": {
      const input = args[0] as CreateProjectInput;
      return store.createProject({ ...input, interfaceLanguage: normalizeInterfaceLanguage(input.interfaceLanguage) });
    }
    case "listTemplates":
      return store.listTemplates(normalizeInterfaceLanguage(args[0]));
    case "createTemplate": {
      const input = args[0] as CreateProjectTemplateInput;
      return store.createTemplate({ ...input, interfaceLanguage: normalizeInterfaceLanguage(input.interfaceLanguage) });
    }
    case "updateTemplate": {
      const input = args[0] as UpdateProjectTemplateInput;
      return store.updateTemplate({ ...input, interfaceLanguage: normalizeInterfaceLanguage(input.interfaceLanguage) });
    }
    case "deleteTemplate":
      return store.deleteTemplate(String(args[0]));
    case "listTastes":
      return store.listTastes();
    case "createTaste":
      return store.createTaste(args[0] as CreateTasteInput);
    case "updateTaste":
      return store.updateTaste(args[0] as UpdateTasteInput);
    case "deleteTaste":
      return store.deleteTaste(String(args[0]));
    case "importTasteFromSource":
      return importTasteFromSource(store, args[0] as ExternalSourceImportInput);
    case "saveProjectTaste":
      return store.saveProjectTaste(String(args[0]), String(args[1]));
    case "updateProject":
      return store.updateProject(args[0] as UpdateProjectInput);
    case "getProject": {
      const projectId = String(args[0]);
      const language = normalizeInterfaceLanguage(args[1]);
      store.getProject(projectId, language);
      await store.ensureProjectVideoTailPosters(projectId);
      return store.getProject(projectId, language);
    }
    case "archiveProject":
      return store.archiveProject(String(args[0]));
    case "unarchiveProject":
      return store.unarchiveProject(String(args[0]));
    case "trashProject":
      return store.trashProject(String(args[0]));
    case "restoreProject":
      return store.restoreProject(String(args[0]));
    case "deleteProject":
      return store.deleteProject(String(args[0]));
    case "updateScript":
      return store.updateScript(String(args[0]), String(args[1] ?? ""));
    case "getActiveStoryboardParseRun": {
      const projectId = String(args[0]);
      const activeRun = activeStoryboardParseRuns.get(projectId) ?? null;
      store.markInterruptedStoryboardParseRuns(projectId, activeRun?.clientRunId);
      return activeRun;
    }
    case "generateStoryboard": {
      const raw = args[0] as GenerateStoryboardInput | string;
      const input: GenerateStoryboardInput = typeof raw === "string" ? { projectId: raw, agentCliId: args[1] as AgentCliId | undefined } : raw;
      return runStoryboardParse(input, defaultSender);
    }
    case "createShots":
      return store.createShots(String(args[0]), Number(args[1]));
    case "insertShot":
      return store.insertShot(String(args[0]), String(args[1]), args[2] as "before" | "after");
    case "duplicateShots":
      return store.duplicateShots(String(args[0]), args[1] as string[]);
    case "deleteShots":
      return store.deleteShots(String(args[0]), args[1] as string[]);
    case "getShotMediaUpdate":
      return store.getShotMediaUpdate(String(args[0]));
    case "importShotMediaPaths":
      return store.importShotMediaPaths(String(args[0]), String(args[1]), args[2] as string[]);
    case "updateShot":
      return store.updateShot(String(args[0]), args[1] as UpdateShotInput);
    case "updateShotMedia":
      return store.updateShotMedia(String(args[0]), String(args[1]), args[2] as string[]);
    case "reorderShots":
      return store.reorderShots(String(args[0]), String(args[1]), String(args[2]));
    case "saveStoryboardColumns":
      return store.saveColumns(String(args[0]), args[1] as StoryboardColumn[]);
    case "saveImageRatio":
      return store.saveImageRatio(String(args[0]), args[1] as ImageRatio);
    case "saveStoryboardSkill":
      return store.saveStoryboardSkill(String(args[0]), String(args[1]));
    case "importAssetPaths":
      return store.importAssetPaths(String(args[0]), args[1] as string[]);
    case "importAgentImageAttachmentPaths":
      return store.importAgentImageAttachmentPaths(String(args[0]), args[1] as string[]);
    case "renameAsset":
      return store.renameAsset(String(args[0]), String(args[1]), String(args[2]));
    case "deleteAssets":
      return store.deleteAssets(String(args[0]), args[1] as string[]);
    case "listSkills":
      return store.listSkills(normalizeInterfaceLanguage(args[0]));
    case "createSkill":
      return store.createSkill(args[0] as CreateSkillInput);
    case "updateSkill":
      return store.updateSkill(args[0] as UpdateSkillInput);
    case "deleteSkill":
      return store.deleteSkill(String(args[0]));
    case "importSkillFromSource":
      return importSkillFromSource(store, args[0] as ExternalSourceImportInput);
    case "getSkillryCatalogStatus":
      return getSkillryCatalogStatus(store, Boolean(args[0]));
    case "getSkillryCollectionDetail":
      return getSkillryCollectionDetail(store, args[0] as { slug: SkillryPackId; locale?: string; forceRefresh?: boolean });
    case "startSkillryDeviceAuth":
      return startSkillryDeviceAuth((url) => shell.openExternal(url));
    case "pollSkillryDeviceAuth":
      return pollSkillryDeviceAuth();
    case "disconnectSkillryAccount":
      return disconnectSkillryAccount(store);
    case "checkSkillrySkillAccess":
      return checkSkillrySkillAccess(args[0] as { slug: string; priceUsdCents?: number });
    case "installSkillryPack":
      return installSkillryPack(store, args[0] as SkillryInstallInput);
    case "syncSkillryPackToMkboard":
      return syncSkillryPackToMkboard(store, String(args[0]));
    case "createAgentConversation":
      return store.createAgentConversation(String(args[0]));
    case "getAgentConversation":
      return store.getAgentConversation(String(args[0]), String(args[1]));
    case "markAgentConversationCompletionSeen":
      return store.markAgentConversationCompletionSeen(String(args[0]), String(args[1]));
    case "updateAgentMessageOperationConfirmation":
      return store.updateAgentMessageOperationConfirmation(String(args[0]), String(args[1]), args[2] as AgentOperationConfirmation);
    case "executeConfirmedDreaminaAgentGeneration":
      return executeConfirmedDreaminaAgentGeneration(defaultSender, args[0] as ExecuteConfirmedDreaminaAgentGenerationInput);
    case "applyAgentOperations": {
      const projectId = String(args[0]);
      const operations = args[1] as AgentOperation[];
      const appliedOperations = applyConfirmedAgentOperations(store, projectId, operations);
      return {
        project: store.getProject(projectId),
        appliedOperations,
        summary: summarizeAgentOperations(appliedOperations)
      };
    }
    case "cancelAgentRun": {
      const controller = activeAgentRuns.get(String(args[0]));
      if (!controller) return false;
      controller.abort();
      return true;
    }
    case "sendAgentMessage":
      return sendAgentMessageInternal(args[0] as AgentRequest, defaultSender);
    default:
      throw new Error(`Unsupported Companion RPC method: ${method}`);
  }
}

function registerIpc(): void {
  ipcMain.handle("mkboard:get-codex-status", () => getCodexCliStatus());
  ipcMain.handle("mkboard:connect-codex", () => startCodexCliLogin());
  ipcMain.handle("mkboard:connect-claude-code", () => startClaudeCodeLogin());
  ipcMain.handle("mkboard:scan-local-cli-agents", () => scanLocalCliAgents());
  ipcMain.handle("mkboard:test-hyperframes-doctor", () => testHyperframesDoctor());
  ipcMain.handle("mkboard:open-external", (_event, url: string) => openExternalUrl(url));
  ipcMain.handle("mkboard:get-byok-settings", () => byokStore.getSnapshot());
  ipcMain.handle("mkboard:save-byok-provider", (_event, input: ByokSaveInput) => byokStore.saveProvider(input));
  ipcMain.handle("mkboard:clear-byok-provider", (_event, providerId: ByokProviderId) => byokStore.clearProviderKey(providerId));
  ipcMain.handle(
    "mkboard:set-byok-active-providers",
    (_event, input: { activeImageProvider?: ByokImageProviderId; activeVideoProvider?: ByokVideoProviderId }) =>
      byokStore.setActiveProviders(input)
  );
  ipcMain.handle("mkboard:test-byok-provider", (_event, providerId: ByokProviderId, candidateKey?: string) =>
    byokStore.testProvider(providerId, candidateKey)
  );
  ipcMain.handle("mkboard:get-companion-status", () => companionServer?.getStatus() ?? null);
  ipcMain.handle("mkboard:set-companion-mode", (_event, mode: CompanionAccessMode, port?: number) =>
    companionServer?.setMode(mode, port) ?? null
  );
  ipcMain.handle("mkboard:rotate-companion-token", () => companionServer?.rotateToken() ?? null);
  ipcMain.handle("mkboard:get-mcp-bridge-status", () => mcpBridge?.getStatus(companionServer?.getStatus().mcpHttpUrl) ?? null);
  ipcMain.handle("mkboard:set-mcp-bridge-enabled", (_event, enabled: boolean) =>
    mcpBridge?.setEnabled(enabled === true, companionServer?.getStatus().mcpHttpUrl) ?? null
  );
  ipcMain.on("mkboard:report-active-view", (_event, view: McpActiveViewReport) => handleReportActiveView(view));
  ipcMain.handle("mkboard:open-hyperframes-studio", async (_event, input: HyperframesStudioOpenInput) => openHyperframesStudio(input));
  ipcMain.handle("mkboard:get-elevenlabs-status", () => elevenLabs.getStatus());
  ipcMain.handle("mkboard:save-elevenlabs-api-key", (_event, apiKey: string) => elevenLabs.saveApiKey(apiKey));
  ipcMain.handle("mkboard:clear-elevenlabs-api-key", () => elevenLabs.clearApiKey());
  ipcMain.handle("mkboard:list-elevenlabs-voices", () => elevenLabs.listVoices());
  ipcMain.handle("mkboard:synthesize-elevenlabs-speech", (_event, input: ElevenLabsSpeechInput) => elevenLabs.synthesizeSpeech(input));
  ipcMain.handle("mkboard:get-elevenlabs-speech-status", (_event, input: ElevenLabsSpeechStatusInput) => elevenLabs.getSpeechStatus(input));
  ipcMain.handle("mkboard:check-desktop-version", () => desktopUpdater.checkForUpdates());
  ipcMain.handle("mkboard:start-desktop-update", () => desktopUpdater.startUpdate());
  ipcMain.handle("mkboard:install-desktop-update", () => desktopUpdater.installUpdate());
  ipcMain.handle("mkboard:generate-storyboard-images", (_event, input: StoryboardImageBatchInput) => submitStoryboardImageGeneration(input));
  ipcMain.handle("mkboard:sync-storyboard-image-batch", (_event, input: StoryboardImageBatchSyncInput) => syncStoryboardImageBatch(input));
  ipcMain.handle("mkboard:sync-active-storyboard-image-generations", (_event, projectId: string) => syncActiveStoryboardImageGenerations(projectId));
  ipcMain.handle("mkboard:generate-storyboard-videos", (event, input: StoryboardVideoBatchInput) => runStoryboardVideoGeneration(input, event.sender));
  ipcMain.handle("mkboard:cancel-storyboard-video-generations", (_event, projectId: string) => cancelStoryboardVideoGenerations(projectId));
  ipcMain.handle("mkboard:get-active-storyboard-video-generations", (_event, projectId: string) => getStoryboardVideoGenerationState(projectId));
  ipcMain.handle("mkboard:retry-storyboard-generation-delivery", (_event, input: StoryboardDeliveryRetryInput) =>
    retryStoryboardGenerationDelivery(input)
  );
  ipcMain.handle("mkboard:ensure-tutorial-project", (_event, interfaceLanguage?: InterfaceLanguage) =>
    store.ensureTutorialProject(normalizeInterfaceLanguage(interfaceLanguage))
  );
  ipcMain.handle("mkboard:get-onboarding-state", (_event, interfaceLanguage?: InterfaceLanguage) =>
    store.getOnboardingState(app.getVersion(), normalizeInterfaceLanguage(interfaceLanguage))
  );
  ipcMain.handle("mkboard:update-onboarding-state", (_event, input: OnboardingStatePatch, interfaceLanguage?: InterfaceLanguage) =>
    store.updateOnboardingState(input, app.getVersion(), normalizeInterfaceLanguage(interfaceLanguage))
  );
  ipcMain.handle("mkboard:reveal-tutorial-storyboard", (_event, input: TutorialStoryboardRevealInput) =>
    store.revealTutorialStoryboard({ ...input, interfaceLanguage: normalizeInterfaceLanguage(input.interfaceLanguage) })
  );
  ipcMain.handle("mkboard:reveal-tutorial-media", (_event, input: TutorialMediaRevealInput) =>
    store.revealTutorialMedia({ ...input, interfaceLanguage: normalizeInterfaceLanguage(input.interfaceLanguage) })
  );
  ipcMain.handle("mkboard:list-projects", () => store.listProjects());
  ipcMain.handle("mkboard:list-archived-projects", () => store.listArchivedProjects());
  ipcMain.handle("mkboard:list-deleted-projects", () => store.listDeletedProjects());
  ipcMain.handle("mkboard:count-retained-projects", () => store.countRetainedProjects());
  ipcMain.handle("mkboard:create-project", (_event, input: CreateProjectInput) =>
    store.createProject({ ...input, interfaceLanguage: normalizeInterfaceLanguage(input.interfaceLanguage) })
  );
  ipcMain.handle("mkboard:list-templates", (_event, interfaceLanguage?: InterfaceLanguage) => store.listTemplates(normalizeInterfaceLanguage(interfaceLanguage)));
  ipcMain.handle("mkboard:create-template", (_event, input: CreateProjectTemplateInput) =>
    store.createTemplate({ ...input, interfaceLanguage: normalizeInterfaceLanguage(input.interfaceLanguage) })
  );
  ipcMain.handle("mkboard:update-template", (_event, input: UpdateProjectTemplateInput) =>
    store.updateTemplate({ ...input, interfaceLanguage: normalizeInterfaceLanguage(input.interfaceLanguage) })
  );
  ipcMain.handle("mkboard:delete-template", (_event, templateId: string) => store.deleteTemplate(templateId));
  ipcMain.handle("mkboard:list-tastes", () => store.listTastes());
  ipcMain.handle("mkboard:create-taste", (_event, input: CreateTasteInput) => store.createTaste(input));
  ipcMain.handle("mkboard:update-taste", (_event, input: UpdateTasteInput) => store.updateTaste(input));
  ipcMain.handle("mkboard:delete-taste", (_event, tasteId: string) => store.deleteTaste(tasteId));
  ipcMain.handle("mkboard:import-taste-from-source", (_event, input: ExternalSourceImportInput) => importTasteFromSource(store, input));
  ipcMain.handle("mkboard:save-project-taste", (_event, projectId: string, tasteId: string) => store.saveProjectTaste(projectId, tasteId));
  ipcMain.handle("mkboard:update-project", (_event, input: UpdateProjectInput) => store.updateProject(input));
  ipcMain.handle("mkboard:get-project", async (_event, projectId: string, interfaceLanguage?: InterfaceLanguage) => {
    const language = normalizeInterfaceLanguage(interfaceLanguage);
    store.getProject(projectId, language);
    await store.ensureProjectVideoTailPosters(projectId);
    return store.getProject(projectId, language);
  });
  ipcMain.handle("mkboard:archive-project", (_event, projectId: string) => store.archiveProject(projectId));
  ipcMain.handle("mkboard:unarchive-project", (_event, projectId: string) => store.unarchiveProject(projectId));
  ipcMain.handle("mkboard:trash-project", (_event, projectId: string) => store.trashProject(projectId));
  ipcMain.handle("mkboard:restore-project", (_event, projectId: string) => store.restoreProject(projectId));
  ipcMain.handle("mkboard:delete-project", (_event, projectId: string) => store.deleteProject(projectId));
  ipcMain.handle("mkboard:update-script", (_event, projectId: string, scriptHtml: string) => store.updateScript(projectId, scriptHtml));
  ipcMain.handle("mkboard:get-active-storyboard-parse-run", (_event, projectId: string) => {
    const activeRun = activeStoryboardParseRuns.get(projectId) ?? null;
    store.markInterruptedStoryboardParseRuns(projectId, activeRun?.clientRunId);
    return activeRun;
  });
  ipcMain.handle("mkboard:generate-storyboard", (event, inputOrProjectId: GenerateStoryboardInput | string, legacyAgentCliId?: AgentCliId) => {
    const input: GenerateStoryboardInput =
      typeof inputOrProjectId === "string" ? { projectId: inputOrProjectId, agentCliId: legacyAgentCliId } : inputOrProjectId;
    return runStoryboardParse(input, event.sender);
  });
  ipcMain.handle("mkboard:create-shots", (_event, projectId: string, count: number) => store.createShots(projectId, count));
  ipcMain.handle("mkboard:insert-shot", (_event, projectId: string, targetRowId: string, placement: "before" | "after") =>
    store.insertShot(projectId, targetRowId, placement)
  );
  ipcMain.handle("mkboard:duplicate-shots", (_event, projectId: string, rowIds: string[]) => store.duplicateShots(projectId, rowIds));
  ipcMain.handle("mkboard:delete-shots", (_event, projectId: string, rowIds: string[]) => store.deleteShots(projectId, rowIds));
  ipcMain.handle("mkboard:get-shot-media-update", (_event, projectId: string) => store.getShotMediaUpdate(projectId));
  ipcMain.handle("mkboard:choose-shot-media", async (_event, projectId: string, rowId: string) => {
    const options = {
      title: "选择画面素材",
      properties: ["openFile", "multiSelections"],
      filters: [
        {
          name: "图片和视频",
          extensions: [
            "png", "jpg", "jpeg", "webp", "gif", "bmp", "tif", "tiff", "svg", "avif", "heic", "heif", "ico",
            "mp4", "mov", "webm", "mkv", "avi", "m4v", "mpg", "mpeg", "3gp", "ogv"
          ]
        },
        { name: "所有文件", extensions: ["*"] }
      ]
    } satisfies Electron.OpenDialogOptions;
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);
    if (result.canceled) return store.getShotMediaUpdate(projectId);
    return store.importShotMediaPaths(projectId, rowId, result.filePaths);
  });
  ipcMain.handle("mkboard:import-shot-media-paths", (_event, projectId: string, rowId: string, filePaths: string[]) =>
    store.importShotMediaPaths(projectId, rowId, filePaths)
  );
  ipcMain.handle("mkboard:import-clipboard-image-as-shot-media", (_event, projectId: string, rowId: string) => {
    const image = clipboard.readImage();
    if (image.isEmpty()) return store.getShotMediaUpdate(projectId);
    return store.importShotMediaBuffer(projectId, rowId, `clipboard-${Date.now()}.png`, image.toPNG());
  });
  ipcMain.handle("mkboard:update-shot", (_event, projectId: string, input: UpdateShotInput) => store.updateShot(projectId, input));
  ipcMain.handle("mkboard:update-shot-media", (_event, projectId: string, rowId: string, assetIds: string[]) => store.updateShotMedia(projectId, rowId, assetIds));
  ipcMain.handle("mkboard:reorder-shots", (_event, projectId: string, sourceRowId: string, targetRowId: string) =>
    store.reorderShots(projectId, sourceRowId, targetRowId)
  );
  ipcMain.handle("mkboard:save-columns", (_event, projectId: string, columns: StoryboardColumn[]) => store.saveColumns(projectId, columns));
  ipcMain.handle("mkboard:save-image-ratio", (_event, projectId: string, imageRatio: ImageRatio) => store.saveImageRatio(projectId, imageRatio));
  ipcMain.handle("mkboard:save-storyboard-skill", (_event, projectId: string, skillId: string) => store.saveStoryboardSkill(projectId, skillId));
  ipcMain.handle("mkboard:choose-assets", async (_event, projectId: string) => {
    const options = {
      title: "选择素材",
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "素材文件", extensions: ["png", "jpg", "jpeg", "webp", "gif", "mp4", "mov", "webm", "mp3", "wav", "pdf", "txt", "md", "zip"] },
        { name: "所有文件", extensions: ["*"] }
      ]
    } satisfies Electron.OpenDialogOptions;
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);
    if (result.canceled) return store.getProject(projectId).assets;
    return store.importAssetPaths(projectId, result.filePaths);
  });
  ipcMain.handle("mkboard:import-asset-paths", (_event, projectId: string, filePaths: string[]) => store.importAssetPaths(projectId, filePaths));
  ipcMain.handle("mkboard:choose-agent-images", async (_event, projectId: string) => {
    const options = {
      title: "选择发送给 Agent 的图片",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "tif", "tiff", "svg", "avif", "heic", "heif"] }]
    } satisfies Electron.OpenDialogOptions;
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) return [];
    return store.importAgentImageAttachmentPaths(projectId, result.filePaths);
  });
  ipcMain.handle("mkboard:import-agent-clipboard-image", (_event, projectId: string) => {
    const image = clipboard.readImage();
    if (image.isEmpty()) return [];
    return store.importAgentImageAttachmentBuffer(projectId, `clipboard-${Date.now()}.png`, image.toPNG());
  });
  ipcMain.handle("mkboard:rename-asset", (_event, projectId: string, assetId: string, fileName: string) => store.renameAsset(projectId, assetId, fileName));
  ipcMain.handle("mkboard:replace-asset", async (_event, projectId: string, assetId: string) => {
    const options = {
      title: "修改素材文件",
      properties: ["openFile"],
      filters: [
        { name: "素材文件", extensions: ["png", "jpg", "jpeg", "webp", "gif", "mp4", "mov", "webm", "mp3", "wav", "pdf", "txt", "md", "zip"] },
        { name: "所有文件", extensions: ["*"] }
      ]
    } satisfies Electron.OpenDialogOptions;
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) return store.getShotMediaUpdate(projectId);
    return store.replaceAssetPath(projectId, assetId, result.filePaths[0]);
  });
  ipcMain.handle("mkboard:reveal-asset", (_event, projectId: string, assetId: string) => {
    const assetPath = store.getAssetFilePath(projectId, assetId);
    if (!assetPath || !existsSync(assetPath)) throw new Error("素材文件不存在，可能已被移动或删除。");
    shell.showItemInFolder(assetPath);
  });
  ipcMain.handle("mkboard:download-assets", async (_event, projectId: string, assetIds: string[]) => {
    const targetIds = Array.from(new Set(assetIds.filter((assetId) => typeof assetId === "string" && assetId.trim().length > 0)));
    if (targetIds.length === 0) return { copiedCount: 0, directory: null };
    const options = {
      title: "选择下载文件夹",
      defaultPath: app.getPath("downloads"),
      properties: ["openDirectory", "createDirectory"]
    } satisfies Electron.OpenDialogOptions;
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) return { copiedCount: 0, directory: null };

    const destinationDir = result.filePaths[0];
    mkdirSync(destinationDir, { recursive: true });
    let copiedCount = 0;
    targetIds.forEach((assetId) => {
      const assetPath = store.getAssetFilePath(projectId, assetId);
      if (!assetPath || !existsSync(assetPath)) return;
      const stats = statSync(assetPath);
      if (!stats.isFile()) return;
      copyFileSync(assetPath, uniqueDownloadFilePath(destinationDir, basename(assetPath)));
      copiedCount += 1;
    });
    return { copiedCount, directory: destinationDir };
  });
  ipcMain.handle(
    "mkboard:export-project",
    async (_event, projectId: string, kind: ProjectExportKind, interfaceLanguage?: InterfaceLanguage): Promise<ProjectExportResult> => {
      if (!isProjectExportKind(kind)) throw new Error(localizeProjectExportMessage("invalid-kind", normalizeInterfaceLanguage(interfaceLanguage)));
      const language = normalizeInterfaceLanguage(interfaceLanguage);
      const project = store.getProject(projectId, language);
      const copy = getProjectExportCopy(kind, language);
      const suggestedFileName = `${sanitizeExportFileName(project.project.name)}-${copy.fileSuffix}.${copy.extension}`;
      const options = {
        title: copy.dialogTitle,
        defaultPath: join(app.getPath("downloads"), suggestedFileName),
        filters: [{ name: copy.filterName, extensions: [copy.extension] }],
        properties: ["createDirectory", "showOverwriteConfirmation"]
      } satisfies Electron.SaveDialogOptions;
      const result = mainWindow ? await dialog.showSaveDialog(mainWindow, options) : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) return { canceled: true, filePath: null, fileName: null, exportedCount: 0 };

      const destinationPath = ensureProjectExportExtension(result.filePath, copy.extension);
      try {
        const exportResult = await writeProjectExport({
          kind,
          destinationPath,
          project,
          resolveAssetSource: (asset) => store.getAssetFilePath(projectId, asset.id)
        });
        return {
          canceled: false,
          filePath: destinationPath,
          fileName: basename(destinationPath),
          exportedCount: exportResult.exportedCount
        };
      } catch (error) {
        throw new Error(localizeProjectExportError(error, language));
      }
    }
  );
  ipcMain.handle("mkboard:show-asset-image-context-menu", (event, projectId: string, assetId: string, copyLabel: string) => {
    const image = readAssetClipboardImage(projectId, assetId);
    const targetWindow = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
    const menu = Menu.buildFromTemplate([
      {
        label: copyLabel || "复制图片",
        click: () => clipboard.writeImage(image)
      }
    ]);
    if (targetWindow) menu.popup({ window: targetWindow });
    else menu.popup();
    return true;
  });
  ipcMain.handle("mkboard:delete-assets", (_event, projectId: string, assetIds: string[]) => store.deleteAssets(projectId, assetIds));
  ipcMain.handle("mkboard:list-skills", (_event, interfaceLanguage?: InterfaceLanguage) => store.listSkills(normalizeInterfaceLanguage(interfaceLanguage)));
  ipcMain.handle("mkboard:create-skill", (_event, input: CreateSkillInput) => store.createSkill(input));
  ipcMain.handle("mkboard:update-skill", (_event, input: UpdateSkillInput) => store.updateSkill(input));
  ipcMain.handle("mkboard:delete-skill", (_event, skillId: string) => store.deleteSkill(skillId));
  ipcMain.handle("mkboard:import-skill-from-source", (_event, input: ExternalSourceImportInput) => importSkillFromSource(store, input));
  ipcMain.handle("mkboard:get-skillry-catalog-status", (_event, forceRefresh?: boolean) => getSkillryCatalogStatus(store, forceRefresh));
  ipcMain.handle("mkboard:get-skillry-collection-detail", (_event, input: { slug: SkillryPackId; locale?: string; forceRefresh?: boolean }) =>
    getSkillryCollectionDetail(store, input)
  );
  ipcMain.handle("mkboard:start-skillry-device-auth", () =>
    startSkillryDeviceAuth((url) => shell.openExternal(url))
  );
  ipcMain.handle("mkboard:poll-skillry-device-auth", () => pollSkillryDeviceAuth());
  ipcMain.handle("mkboard:disconnect-skillry-account", () => disconnectSkillryAccount(store));
  ipcMain.handle("mkboard:check-skillry-skill-access", (_event, input: { slug: string; priceUsdCents?: number }) =>
    checkSkillrySkillAccess(input)
  );
  ipcMain.handle("mkboard:install-skillry-pack", (_event, input: SkillryInstallInput) => installSkillryPack(store, input));
  ipcMain.handle("mkboard:sync-skillry-pack-to-mkboard", (_event, slug: string) => syncSkillryPackToMkboard(store, slug));
  ipcMain.handle("mkboard:choose-import-directory-path", async (event) => {
    const ownerWindow = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
    const result = ownerWindow
      ? await dialog.showOpenDialog(ownerWindow, { properties: ["openDirectory"] })
      : await dialog.showOpenDialog({ properties: ["openDirectory"] });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });
  ipcMain.handle("mkboard:choose-import-archive-or-file-path", async (event) => {
    const options: Electron.OpenDialogOptions = {
      properties: ["openFile"],
      filters: [
        { name: "Skill / Style Package", extensions: ["zip", "tgz", "gz", "md", "css", "json"] }
      ]
    };
    const ownerWindow = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
    const result = ownerWindow ? await dialog.showOpenDialog(ownerWindow, options) : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });
  ipcMain.handle("mkboard:create-agent-conversation", (_event, projectId: string) => store.createAgentConversation(projectId));
  ipcMain.handle("mkboard:get-agent-conversation", (_event, projectId: string, conversationId: string) => store.getAgentConversation(projectId, conversationId));
  ipcMain.handle("mkboard:mark-agent-conversation-completion-seen", (_event, projectId: string, conversationId: string) =>
    store.markAgentConversationCompletionSeen(projectId, conversationId)
  );
  ipcMain.handle("mkboard:update-agent-message-operation-confirmation", (_event, projectId: string, clientRunId: string, confirmation: AgentOperationConfirmation) =>
    store.updateAgentMessageOperationConfirmation(projectId, clientRunId, confirmation)
  );
  ipcMain.handle("mkboard:execute-confirmed-dreamina-agent-generation", (event, input: ExecuteConfirmedDreaminaAgentGenerationInput) =>
    executeConfirmedDreaminaAgentGeneration(event.sender, input)
  );
  ipcMain.handle("mkboard:apply-agent-operations", (_event, projectId: string, operations: AgentOperation[]): ApplyAgentOperationsResult => {
    const appliedOperations = applyConfirmedAgentOperations(store, projectId, operations);
    return {
      project: store.getProject(projectId),
      appliedOperations,
      summary: summarizeAgentOperations(appliedOperations)
    };
  });
  ipcMain.handle("mkboard:cancel-agent-run", (_event, clientRunId: string) => {
    const controller = activeAgentRuns.get(clientRunId);
    if (!controller) return false;
    controller.abort();
    return true;
  });
  ipcMain.handle("mkboard:send-agent-message", (event, request: AgentRequest) => sendAgentMessageInternal(request, event.sender));
}

function uniqueDownloadFilePath(targetDir: string, fileName: string): string {
  const parsed = parse(fileName || "asset");
  const baseName = parsed.name || "asset";
  const extension = parsed.ext;
  let candidate = join(targetDir, `${baseName}${extension}`);
  let index = 1;
  while (existsSync(candidate)) {
    candidate = join(targetDir, `${baseName} ${index}${extension}`);
    index += 1;
  }
  return candidate;
}

function isProjectExportKind(value: unknown): value is ProjectExportKind {
  return value === "storyboard-csv" || value === "storyboard-assets-zip" || value === "all-assets-zip";
}

function getProjectExportCopy(kind: ProjectExportKind, language?: InterfaceLanguage) {
  if (language === "en") {
    if (kind === "storyboard-csv") return { dialogTitle: "Export storyboard table", fileSuffix: "storyboard", extension: "csv", filterName: "CSV file" };
    if (kind === "storyboard-assets-zip") return { dialogTitle: "Export storyboard assets", fileSuffix: "storyboard-assets", extension: "zip", filterName: "ZIP archive" };
    return { dialogTitle: "Export all assets", fileSuffix: "all-assets", extension: "zip", filterName: "ZIP archive" };
  }
  if (language === "zh-TW") {
    if (kind === "storyboard-csv") return { dialogTitle: "匯出分鏡表", fileSuffix: "分鏡表", extension: "csv", filterName: "CSV 檔案" };
    if (kind === "storyboard-assets-zip") return { dialogTitle: "匯出分鏡素材", fileSuffix: "分鏡素材", extension: "zip", filterName: "ZIP 壓縮檔" };
    return { dialogTitle: "匯出所有素材", fileSuffix: "所有素材", extension: "zip", filterName: "ZIP 壓縮檔" };
  }
  if (kind === "storyboard-csv") return { dialogTitle: "导出分镜表", fileSuffix: "分镜表", extension: "csv", filterName: "CSV 文件" };
  if (kind === "storyboard-assets-zip") return { dialogTitle: "导出分镜素材", fileSuffix: "分镜素材", extension: "zip", filterName: "ZIP 压缩包" };
  return { dialogTitle: "导出所有素材", fileSuffix: "所有素材", extension: "zip", filterName: "ZIP 压缩包" };
}

function ensureProjectExportExtension(filePath: string, extension: string): string {
  return extname(filePath).toLocaleLowerCase() === `.${extension}` ? filePath : `${filePath}.${extension}`;
}

function localizeProjectExportMessage(code: "invalid-kind", language?: InterfaceLanguage): string {
  if (code === "invalid-kind") {
    if (language === "en") return "Unsupported project export type.";
    if (language === "zh-TW") return "不支援這種專案匯出類型。";
    return "不支持这种项目导出类型。";
  }
  return "";
}

function localizeProjectExportError(error: unknown, language?: InterfaceLanguage): string {
  const assetName = error instanceof ProjectExportError && error.assetName ? `“${error.assetName}”` : "";
  if (error instanceof ProjectExportError) {
    if (language === "en") {
      if (error.code === "empty-archive") return "There are no assets available to export.";
      if (error.code === "missing-asset-record") return `A storyboard asset record is missing${assetName ? `: ${assetName}` : "."}`;
      if (error.code === "missing-asset-source" || error.code === "invalid-local-asset") return `The asset file is missing or unavailable${assetName ? `: ${assetName}` : "."}`;
      if (error.code === "invalid-project-directory" || error.code === "asset-outside-project") return "The project asset directory is unavailable or unsafe.";
      if (error.code === "unsafe-destination") return "Choose an export destination outside the MkBoard project directory.";
      if (error.code === "remote-download-failed") return `A remote asset could not be downloaded${assetName ? `: ${assetName}` : "."}`;
      if (error.code === "asset-too-large") return `An asset is too large for ZIP export${assetName ? `: ${assetName}` : "."}`;
      if (error.code === "archive-too-large") return "The ZIP archive is too large or contains too many files.";
    } else if (language === "zh-TW") {
      if (error.code === "empty-archive") return "目前沒有可匯出的素材。";
      if (error.code === "missing-asset-record") return `分鏡引用的素材記錄不存在${assetName ? `：${assetName}` : "。"}`;
      if (error.code === "missing-asset-source" || error.code === "invalid-local-asset") return `素材檔案不存在或無法讀取${assetName ? `：${assetName}` : "。"}`;
      if (error.code === "invalid-project-directory" || error.code === "asset-outside-project") return "專案素材目錄不可用或不安全。";
      if (error.code === "unsafe-destination") return "請選擇 MkBoard 專案目錄以外的位置儲存匯出檔案。";
      if (error.code === "remote-download-failed") return `遠端素材下載失敗${assetName ? `：${assetName}` : "。"}`;
      if (error.code === "asset-too-large") return `素材超過 ZIP 可支援的單檔大小${assetName ? `：${assetName}` : "。"}`;
      if (error.code === "archive-too-large") return "ZIP 壓縮檔過大或包含過多檔案。";
    } else {
      if (error.code === "empty-archive") return "当前没有可导出的素材。";
      if (error.code === "missing-asset-record") return `分镜引用的素材记录不存在${assetName ? `：${assetName}` : "。"}`;
      if (error.code === "missing-asset-source" || error.code === "invalid-local-asset") return `素材文件不存在或无法读取${assetName ? `：${assetName}` : "。"}`;
      if (error.code === "invalid-project-directory" || error.code === "asset-outside-project") return "项目素材目录不可用或不安全。";
      if (error.code === "unsafe-destination") return "请选择 MkBoard 项目目录以外的位置保存导出文件。";
      if (error.code === "remote-download-failed") return `远程素材下载失败${assetName ? `：${assetName}` : "。"}`;
      if (error.code === "asset-too-large") return `素材超过 ZIP 支持的单文件大小${assetName ? `：${assetName}` : "。"}`;
      if (error.code === "archive-too-large") return "ZIP 压缩包过大或包含过多文件。";
    }
  }
  const detail = error instanceof Error ? error.message : String(error);
  if (language === "en") return `Export failed: ${detail}`;
  if (language === "zh-TW") return `匯出失敗：${detail}`;
  return `导出失败：${detail}`;
}

function readAssetClipboardImage(projectId: string, assetId: string): NativeImage {
  const assetPath = store.getAssetFilePath(projectId, assetId);
  if (!assetPath || !existsSync(assetPath)) throw new Error("素材文件不存在，可能已被移动或删除。");
  let image = nativeImage.createFromPath(assetPath);
  if (image.isEmpty()) image = nativeImage.createFromBuffer(readFileSync(assetPath));
  if (image.isEmpty()) throw new Error("当前素材不是可复制的图片格式。");
  return image;
}

function registerAssetPreviewProtocol(): void {
  protocol.handle(assetPreviewScheme, async (request) => {
    const previewRequest = getAssetPreviewRequestFromUrl(request.url);
    let assetPath: string | null = null;
    if (previewRequest) {
      if (previewRequest.firstFrame) {
        assetPath = (await store.resolveAssetFirstFramePath(previewRequest.assetId)) ?? store.resolveAssetPosterPath(previewRequest.assetId);
      } else if (previewRequest.poster) {
        assetPath = store.resolveAssetPosterPath(previewRequest.assetId);
      } else {
        assetPath = store.resolveAssetPreviewPath(previewRequest.assetId);
      }
    }
    if (!assetPath) return new Response("Asset not found", { status: 404 });
    return createAssetPreviewResponse(assetPath, request.headers.get("range"));
  });
}

function createAssetPreviewResponse(assetPath: string, rangeHeader: string | null): Response {
  const fileSize = statSync(assetPath).size;
  const contentType = contentTypeForAssetPath(assetPath);
  const baseHeaders = {
    "Accept-Ranges": "bytes",
    "Content-Type": contentType
  };

  if (!rangeHeader) {
    return new Response(createAssetPreviewBody(assetPath), {
      status: 200,
      headers: {
        ...baseHeaders,
        "Content-Length": String(fileSize)
      }
    });
  }

  const range = parseRangeHeader(rangeHeader, fileSize);
  if (!range) {
    return new Response(null, {
      status: 416,
      headers: {
        ...baseHeaders,
        "Content-Range": `bytes */${fileSize}`
      }
    });
  }

  const chunkSize = range.end - range.start + 1;
  return new Response(createAssetPreviewBody(assetPath, range), {
    status: 206,
    headers: {
      ...baseHeaders,
      "Content-Length": String(chunkSize),
      "Content-Range": `bytes ${range.start}-${range.end}/${fileSize}`
    }
  });
}

function createAssetPreviewBody(assetPath: string, range?: { start: number; end: number }): BodyInit {
  let fileStream: ReturnType<typeof createReadStream> | null = null;
  let settled = false;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const close = () => {
        if (settled) return;
        settled = true;
        try {
          controller.close();
        } catch (error) {
          if (!isReadableStreamAlreadyClosedError(error)) console.warn("Failed to close asset preview stream", error);
        }
      };

      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        controller.error(error);
      };

      fileStream = range ? createReadStream(assetPath, { start: range.start, end: range.end }) : createReadStream(assetPath);
      fileStream.on("data", (chunk) => {
        if (settled) return;
        try {
          const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
          controller.enqueue(new Uint8Array(bytes));
          if ((controller.desiredSize ?? 1) <= 0) fileStream?.pause();
        } catch (error) {
          settled = true;
          fileStream?.destroy();
          if (!isReadableStreamAlreadyClosedError(error)) console.warn("Failed to stream asset preview chunk", error);
        }
      });
      fileStream.once("end", close);
      fileStream.once("close", close);
      fileStream.once("error", fail);
    },
    pull() {
      fileStream?.resume();
    },
    cancel() {
      settled = true;
      fileStream?.destroy();
    }
  }) as BodyInit;
}

function parseRangeHeader(rangeHeader: string, fileSize: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match || fileSize <= 0) return null;
  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return null;

  let start: number;
  let end: number;

  if (!rawStart) {
    const suffixLength = Number.parseInt(rawEnd, 10);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(fileSize - suffixLength, 0);
    end = fileSize - 1;
  } else {
    start = Number.parseInt(rawStart, 10);
    end = rawEnd ? Number.parseInt(rawEnd, 10) : fileSize - 1;
  }

  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start < 0 || end < start || start >= fileSize) return null;
  return { start, end: Math.min(end, fileSize - 1) };
}

function contentTypeForAssetPath(assetPath: string): string {
  const extension = extname(assetPath).toLowerCase();
  if (extension === ".mp4" || extension === ".m4v") return "video/mp4";
  if (extension === ".webm") return "video/webm";
  if (extension === ".mov" || extension === ".qt") return "video/quicktime";
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".gif") return "image/gif";
  if (extension === ".webp") return "image/webp";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".mp3") return "audio/mpeg";
  if (extension === ".wav") return "audio/wav";
  if (extension === ".m4a") return "audio/mp4";
  if (extension === ".ogg") return "audio/ogg";
  return "application/octet-stream";
}

function getAssetPreviewRequestFromUrl(rawUrl: string): { assetId: string; poster: boolean; firstFrame: boolean } | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== `${assetPreviewScheme}:` || parsed.hostname !== "asset") return null;
    const [assetId] = parsed.pathname.split("/").filter(Boolean);
    return assetId
      ? {
          assetId: decodeURIComponent(assetId),
          poster: parsed.searchParams.get("poster") === "1",
          firstFrame: parsed.searchParams.get("firstFrame") === "1"
        }
      : null;
  } catch {
    return null;
  }
}

function openExternalUrl(url: string): Promise<void> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("只允许打开 http 或 https 链接。");
  }
  return shell.openExternal(resolveExternalHttpUrl(parsed).toString());
}

async function openHyperframesStudio(input: HyperframesStudioOpenInput): Promise<{ studioUrl: string }> {
  const studioUrl = await resolveHyperframesStudioOpenUrl(input);
  openHyperframesStudioWindow(studioUrl);
  return { studioUrl };
}

async function resolveHyperframesStudioOpenUrl(input: HyperframesStudioOpenInput): Promise<string> {
  const workDir = typeof input?.workDir === "string" ? input.workDir.trim() : "";
  if (workDir) return ensureHyperframesStudioPreviewForWorkDir(workDir);

  const studioUrl = typeof input?.studioUrl === "string" ? input.studioUrl.trim() : "";
  if (studioUrl && isAllowedHyperframesStudioUrl(studioUrl)) return studioUrl;
  throw new Error("HyperFrames Studio 链接无效或已过期。");
}

function openHyperframesStudioWindow(studioUrl: string): BrowserWindow {
  const normalizedStudioUrl = normalizeHyperframesStudioUrl(studioUrl);
  const existingWindow = activeHyperframesStudioWindows.get(normalizedStudioUrl);
  if (existingWindow && !existingWindow.isDestroyed()) {
    if (existingWindow.isMinimized()) existingWindow.restore();
    existingWindow.focus();
    return existingWindow;
  }

  const studioWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    title: "HyperFrames Studio",
    // Keep Studio windows top-level so macOS can freely reorder them.
    backgroundColor: "#101113",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });
  activeHyperframesStudioWindows.set(normalizedStudioUrl, studioWindow);
  studioWindow.setMenu(null);
  studioWindow.on("closed", () => {
    activeHyperframesStudioWindows.delete(normalizedStudioUrl);
  });
  studioWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedHyperframesStudioUrl(url)) openHyperframesStudioWindow(url);
    else void openExternalUrl(url).catch(() => undefined);
    return { action: "deny" };
  });
  studioWindow.webContents.on("will-navigate", (event, url) => {
    if (isAllowedHyperframesStudioUrl(url)) return;
    event.preventDefault();
    void openExternalUrl(url).catch(() => undefined);
  });
  void studioWindow.loadURL(normalizedStudioUrl);
  return studioWindow;
}

function closeHyperframesStudioWindows(): void {
  for (const window of Array.from(activeHyperframesStudioWindows.values())) {
    if (!window.isDestroyed()) window.close();
  }
  activeHyperframesStudioWindows.clear();
}

function normalizeHyperframesStudioUrl(url: string): string {
  const parsed = new URL(url);
  if (!isAllowedHyperframesStudioUrl(parsed)) throw new Error("只允许打开本机 HyperFrames Studio。");
  return parsed.toString();
}

function isAllowedHyperframesStudioUrl(url: string | URL): boolean {
  try {
    const parsed = typeof url === "string" ? new URL(url) : url;
    const host = parsed.hostname.toLowerCase();
    return parsed.protocol === "http:" && Boolean(parsed.port) && (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]");
  } catch {
    return false;
  }
}

function resolveExternalHttpUrl(parsed: URL): URL {
  if (isMkboardWebUrl(parsed) && parsed.pathname.startsWith("/docs/")) {
    return new URL(packagedWebBaseUrl);
  }
  return parsed;
}

function isMkboardWebUrl(parsed: URL): boolean {
  return parsed.hostname === "mkboard.app" || parsed.hostname === "www.mkboard.app" || parsed.hostname === "dev.mkboard.app";
}

async function downloadRemoteAsset(url: string): Promise<{ bytes: Uint8Array; contentType: string | null }> {
  const parsed = new URL(url);
  if (parsed.protocol === "file:") {
    const localPath = fileURLToPath(parsed);
    const bytes = new Uint8Array(readFileSync(localPath));
    return { bytes, contentType: contentTypeForAssetPath(localPath) };
  }
  assertSafeRemoteMediaUrl(url);
  const response = await fetch(parsed.toString());
  if (!response.ok) throw new Error(`下载生成结果失败：HTTP ${response.status}`);
  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() || null;
  return { bytes: new Uint8Array(await response.arrayBuffer()), contentType };
}

type LocalDeliveryStepResult<T> =
  | { ok: true; value: T; attempts: number }
  | { ok: false; error: Error; attempts: number };

type LocalAssetDeliveryResult<T> =
  | { ok: true; value: T; attemptCount: number }
  | { ok: false; error: Error; attemptCount: number };

async function runLocalDeliveryStepWithRetry<T>(operation: () => Promise<T>): Promise<LocalDeliveryStepResult<T>> {
  let lastError = new Error("本地交付失败。");
  for (let attempt = 1; attempt <= maxLocalDeliveryAttempts; attempt += 1) {
    try {
      return { ok: true, value: await operation(), attempts: attempt };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxLocalDeliveryAttempts) await sleepWithVideoAbort(localDeliveryRetryDelayMs * attempt);
    }
  }
  return { ok: false, error: lastError, attempts: maxLocalDeliveryAttempts };
}

async function deliverRemoteAssetLocally<T>(
  sourceUrl: string,
  writeAsset: (asset: { bytes: Uint8Array; contentType: string | null }) => Promise<T> | T
): Promise<LocalAssetDeliveryResult<T>> {
  const downloadResult = await runLocalDeliveryStepWithRetry(() => downloadRemoteAsset(sourceUrl));
  if (!downloadResult.ok) return { ok: false, error: downloadResult.error, attemptCount: downloadResult.attempts };

  const writeResult = await runLocalDeliveryStepWithRetry(() => Promise.resolve(writeAsset(downloadResult.value)));
  if (!writeResult.ok) return { ok: false, error: writeResult.error, attemptCount: writeResult.attempts };
  return { ok: true, value: writeResult.value, attemptCount: Math.max(downloadResult.attempts, writeResult.attempts) };
}

function imageExtensionFromContentType(contentType: string | null): string {
  if (contentType?.includes("webp")) return "webp";
  if (contentType?.includes("jpeg") || contentType?.includes("jpg")) return "jpg";
  if (contentType?.includes("gif")) return "gif";
  return "png";
}

function videoExtensionFromContentType(contentType: string | null, sourceUrl: string): string {
  if (contentType?.includes("quicktime") || contentType?.includes("mov")) return "mov";
  if (contentType?.includes("webm")) return "webm";
  try {
    const extension = new URL(sourceUrl).pathname.split(".").pop()?.toLowerCase();
    if (extension === "mov" || extension === "webm" || extension === "mp4") return extension;
  } catch {
    // Fall through to mp4.
  }
  return "mp4";
}

function throwIfVideoGenerationAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Video generation aborted", "AbortError");
}

function sleepWithVideoAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new DOMException("Video generation aborted", "AbortError"));
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);
    const abort = () => {
      clearTimeout(timeout);
      reject(new DOMException("Video generation aborted", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

function mergePersistedStoryboardImageDeliveryRecoveries(
  projectId: string,
  cloudTasks: StoryboardImageTaskSummary[]
): StoryboardImageTaskSummary[] {
  const recoveries = store.listStoryboardImageDeliveryRecoveries(projectId);
  if (recoveries.length === 0) return cloudTasks;

  const recoveryByTaskId = new Map(recoveries.map((recovery) => [recovery.task_id, recovery]));
  const recoveryByProviderTaskId = new Map(
    recoveries.filter((recovery) => recovery.provider_task_id).map((recovery) => [recovery.provider_task_id as string, recovery])
  );
  const mergedRecoveryTaskIds = new Set<string>();
  const mergedTasks = cloudTasks.map((task) => {
    const recovery = recoveryByTaskId.get(task.taskId) ?? (task.providerTaskId ? recoveryByProviderTaskId.get(task.providerTaskId) : undefined);
    if (!recovery) return task;
    mergedRecoveryTaskIds.add(recovery.task_id);
    return applyStoryboardImageDeliveryRecovery(task, recovery);
  });

  for (const recovery of recoveries) {
    if (mergedRecoveryTaskIds.has(recovery.task_id)) continue;
    mergedTasks.push(
      applyStoryboardImageDeliveryRecovery(
        {
          taskId: recovery.task_id,
          rowId: recovery.row_id,
          status: "failed",
          providerTaskId: recovery.provider_task_id,
          creditsReserved: 0
        },
        recovery
      )
    );
  }
  return mergedTasks;
}

function applyStoryboardImageDeliveryRecovery(
  task: StoryboardImageTaskSummary,
  recovery: StoryboardImageDeliveryRecoveryRecord
): StoryboardImageTaskSummary {
  return {
    ...task,
    rowId: recovery.row_id,
    providerTaskId: task.providerTaskId ?? recovery.provider_task_id,
    errorMessage: recovery.error_message ?? task.errorMessage,
    canRetryDelivery: true,
    localDeliveryFailed: true,
    localDeliveryAttemptCount: recovery.attempt_count
  };
}

function persistStoryboardImageDeliveryRecovery(
  projectId: string,
  task: StoryboardImageTaskSummary,
  errorMessage: string,
  attemptCount: number
): void {
  if (!task.rowId) return;
  store.upsertStoryboardImageDeliveryRecovery({
    projectId,
    taskId: task.taskId,
    rowId: task.rowId,
    providerTaskId: task.providerTaskId,
    errorMessage,
    attemptCount
  });
}

async function importStoryboardImageTasks(
  projectId: string,
  overwriteExisting: boolean,
  batchId: string,
  tasks: StoryboardImageTaskSummary[],
  counts: { running: number; succeeded: number; failed: number; deliveryFailed?: number; cancelled: number; total: number }
) {
  let importedCount = 0;
  let localAvailableCount = 0;
  let localImportFailedCount = 0;
  let mediaUpdate = store.getShotMediaUpdate(projectId);
  const localTasks = tasks.map((task) => ({ ...task }));
  const existingAssetIds = new Set(store.getProject(projectId).assets.map((asset) => asset.id));
  for (const [taskIndex, task] of tasks.entries()) {
    if (task.status !== "succeeded") continue;
    if (!task.resultUrl || !task.rowId) {
      localImportFailedCount += 1;
      localTasks[taskIndex] = {
        ...task,
        canRetryDelivery: task.canRetryDelivery ?? Boolean(task.taskId || task.providerTaskId),
        localDeliveryFailed: false,
        localDeliveryAttemptCount: 0
      };
      continue;
    }
    if (existingAssetIds.has(task.taskId)) {
      const ensureExistingShotMediaAsset = () => {
        if (!task.rowId) throw new Error("没有找到对应的分镜行。");
        return store.ensureShotMediaAsset(projectId, task.rowId, task.taskId);
      };
      const localLink = await runLocalDeliveryStepWithRetry(() => Promise.resolve(ensureExistingShotMediaAsset()));
      if (localLink.ok) {
        mediaUpdate = localLink.value;
        store.deleteStoryboardImageDeliveryRecovery(projectId, task.taskId);
        localAvailableCount += 1;
        localTasks[taskIndex] = {
          ...task,
          canRetryDelivery: false,
          localDeliveryFailed: false,
          localDeliveryAttemptCount: localLink.attempts
        };
      } else {
        localImportFailedCount += 1;
        const message = `${localDeliveryFailurePrefix}${localLink.error.message}`;
        persistStoryboardImageDeliveryRecovery(projectId, task, message, localLink.attempts);
        localTasks[taskIndex] = {
          ...task,
          canRetryDelivery: true,
          localDeliveryFailed: true,
          localDeliveryAttemptCount: localLink.attempts,
          errorMessage: message
        };
      }
      continue;
    }
    const localDelivery = await deliverRemoteAssetLocally(task.resultUrl, (remoteAsset) => {
      const fileName = `${task.taskId}.${imageExtensionFromContentType(remoteAsset.contentType)}`;
      return store.upsertGeneratedShotImage(projectId, task.rowId as string, task.taskId, fileName, remoteAsset.bytes, overwriteExisting);
    });
    if (localDelivery.ok) {
      mediaUpdate = localDelivery.value;
      store.deleteStoryboardImageDeliveryRecovery(projectId, task.taskId);
      existingAssetIds.add(task.taskId);
      importedCount += 1;
      localAvailableCount += 1;
      localTasks[taskIndex] = {
        ...task,
        canRetryDelivery: false,
        localDeliveryFailed: false,
        localDeliveryAttemptCount: localDelivery.attemptCount,
        errorMessage: null
      };
    } else {
      localImportFailedCount += 1;
      const message = `${localDeliveryFailurePrefix}${localDelivery.error.message}`;
      persistStoryboardImageDeliveryRecovery(projectId, task, message, localDelivery.attemptCount);
      localTasks[taskIndex] = {
        ...task,
        canRetryDelivery: true,
        localDeliveryFailed: true,
        localDeliveryAttemptCount: localDelivery.attemptCount,
        errorMessage: message
      };
      console.warn("Failed to import generated image after retries", localDelivery.error);
    }
  }

  return {
    ok: true as const,
    data: {
      ...mediaUpdate,
      batchId,
      importedCount,
      localAvailableCount,
      localImportFailedCount,
      pendingCount: counts.running,
      failedCount: counts.failed + counts.cancelled + (counts.deliveryFailed ?? 0),
      succeededCount: counts.succeeded,
      tasks: localTasks
    }
  };
}

async function runRemoteSeedanceStoryboardVideoGeneration(input: {
  project: ProjectDetail;
  projectId: string;
  items: StoryboardVideoGenerationTarget[];
  overwriteExisting: boolean;
  signal: AbortSignal;
  updateTask: (rowId: string, patch: Parameters<MkboardStore["updateStoryboardVideoTask"]>[2]) => StoryboardVideoTaskRecord | null;
  sendEvent: (event: Omit<StoryboardVideoGenerationEvent, "projectId">) => void;
  setMediaUpdate: (update: ShotMediaUpdateResult) => void;
}): Promise<void> {
  throwIfVideoGenerationAborted(input.signal);

  const cloudItems = prepareSeedanceCloudVideoTargets(input.project, input.items);
  for (const item of input.items) {
    const updatedTask = input.updateTask(item.rowId, { provider: "kie" });
    if (updatedTask) input.sendEvent(storyboardVideoTaskEvent(updatedTask));
  }

  const submitResult = await localAiMedia.generateStoryboardVideos(input.projectId, {
    overwriteExisting: input.overwriteExisting,
    items: cloudItems
  });
  if (!submitResult.ok) throw new Error(submitResult.error.message);

  let syncSummary = await importStoryboardVideoTasks({
    projectId: input.projectId,
    overwriteExisting: input.overwriteExisting,
    tasks: submitResult.data.tasks,
    updateTask: input.updateTask,
    sendEvent: input.sendEvent,
    setMediaUpdate: input.setMediaUpdate
  });

  const maxAttempts = 300;
  for (let attempt = 0; syncSummary.pendingCount > 0 && attempt < maxAttempts; attempt += 1) {
    await sleepWithVideoAbort(3000, input.signal);
    const batchResult = await localAiMedia.getStoryboardVideoBatch(input.projectId, submitResult.data.batchId);
    if (!batchResult.ok) throw new Error(batchResult.error.message);
    syncSummary = await importStoryboardVideoTasks({
      projectId: input.projectId,
      overwriteExisting: input.overwriteExisting,
      tasks: batchResult.data.tasks,
      updateTask: input.updateTask,
      sendEvent: input.sendEvent,
      setMediaUpdate: input.setMediaUpdate
    });
  }
}

function prepareSeedanceCloudVideoTargets(project: ProjectDetail, items: StoryboardVideoGenerationTarget[]): StoryboardCloudVideoGenerationTarget[] {
  const rowsById = new Map(project.rows.map((row) => [row.id, row]));
  return items.map((item) => {
    const row = rowsById.get(item.rowId);
    const firstImage = row ? firstImageAssetForRow(row.imageAssetIds ?? [], project.assets) : null;
    const firstImagePath = firstImage ? absoluteProjectAssetPath(project, firstImage) : null;
    const firstFrame =
      firstImage && firstImagePath && existsSync(firstImagePath)
        ? {
            fileName: firstImage.name,
            mimeType: contentTypeForAssetPath(firstImagePath),
            dataBase64: readFileSync(firstImagePath).toString("base64")
          }
        : null;
    return {
      rowId: item.rowId,
      prompt: item.prompt,
      durationSec: normalizeSeedanceCloudVideoDuration(item.durationSec),
      aspectRatio: resolveStoryboardVideoAspectRatio(item.aspectRatio, project.imageRatio),
      resolution: normalizeSeedanceVideoResolution(item.seedanceResolution),
      firstFrame
    };
  });
}

function normalizeSeedanceCloudVideoDuration(input: unknown): number {
  const value = typeof input === "number" ? input : Number(input);
  if (!Number.isFinite(value)) return 12;
  return Math.max(10, Math.min(15, Math.round(value)));
}

function estimateSeedanceCloudVideoCredits(items: StoryboardVideoGenerationTarget[]): number {
  return items.reduce(
    (sum, item) => sum + normalizeSeedanceCloudVideoDuration(item.durationSec) * seedanceVideoCreditsPerSecond(item.seedanceResolution),
    0
  );
}

function firstImageAssetForRow(assetIds: string[], assets: ProjectAsset[]): ProjectAsset | null {
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  for (const assetId of assetIds) {
    const asset = assetsById.get(assetId);
    if (asset?.kind === "image") return asset;
  }
  return null;
}

function assertGeneratedVideoMediaImported(mediaUpdate: ShotMediaUpdateResult, rowId: string, assetId: string): void {
  const asset = mediaUpdate.assets.find((item) => item.id === assetId);
  if (!asset || asset.kind !== "video") {
    throw new Error("视频已生成，但没有写入本地素材库。");
  }
  const row = mediaUpdate.rows.find((item) => item.id === rowId);
  if (!row) {
    throw new Error("视频已生成，但没有找到对应分镜行。");
  }
  if (!(row.imageAssetIds ?? []).includes(assetId)) {
    throw new Error("视频已写入素材库，但没有追加到对应分镜头的画面列。");
  }
}

function absoluteProjectAssetPath(project: ProjectDetail, asset: ProjectAsset): string {
  if (isAbsolute(asset.localPath)) return asset.localPath;
  if (asset.indexedPath && isAbsolute(asset.indexedPath)) return asset.indexedPath;
  return join(project.project.localPath, asset.indexedPath || asset.localPath);
}

async function importStoryboardVideoTasks(input: {
  projectId: string;
  overwriteExisting: boolean;
  tasks: StoryboardVideoTaskSummary[];
  updateTask: (
    rowId: string,
    patch: Parameters<MkboardStore["updateStoryboardVideoTask"]>[2],
    cloudTask: StoryboardVideoTaskSummary
  ) => StoryboardVideoTaskRecord | null;
  sendEvent: (event: Omit<StoryboardVideoGenerationEvent, "projectId">) => void;
  setMediaUpdate: (update: ShotMediaUpdateResult) => void;
}) {
  let pendingCount = 0;
  let failedCount = 0;
  let succeededCount = 0;

  for (const task of input.tasks) {
    if (!task.rowId) continue;
    const deliveryFailed = task.status === "delivery_failed";
    if (task.status === "queued" || task.status === "running") {
      pendingCount += 1;
      const updatedTask = input.updateTask(task.rowId, {
        status: task.status,
        provider: "kie",
        providerTaskId: task.providerTaskId ?? null
      }, task);
      if (updatedTask) input.sendEvent(storyboardCloudVideoTaskEvent(updatedTask, task));
      continue;
    }
    if (task.status === "failed" || task.status === "cancelled" || deliveryFailed) {
      failedCount += 1;
      const localStatus = task.status === "cancelled" ? "cancelled" : "failed";
      const cloudDeliveryError = deliveryFailed
        ? task.errorMessage
          ? `${cloudVideoDeliveryFailurePrefix}：${task.errorMessage}`
          : `${cloudVideoDeliveryFailurePrefix}。可重试获取同一生成结果。`
        : null;
      const updatedTask = input.updateTask(task.rowId, {
        status: localStatus,
        provider: "kie",
        providerTaskId: task.providerTaskId ?? null,
        errorMessage:
          cloudDeliveryError ||
          task.errorMessage ||
          (task.status === "cancelled"
            ? "视频生成已中止。"
            : "Seedance 2.0 生视频失败。")
      }, task);
      if (updatedTask) input.sendEvent(storyboardCloudVideoTaskEvent(updatedTask, task));
      continue;
    }
    if (task.status !== "succeeded") continue;
    const rowLatestTask = store.getLatestStoryboardVideoTaskByRow(input.projectId, task.rowId);
    const providerMatchedTask = task.providerTaskId
      ? store.getStoryboardVideoTaskByProviderTaskId(input.projectId, task.providerTaskId)
      : null;
    const existingTask =
      providerMatchedTask ??
      (!task.providerTaskId || !rowLatestTask?.provider_task_id ? rowLatestTask : null);
    if (existingTask?.asset_id) {
      const ensureExistingShotMediaAsset = () => {
        if (!existingTask.asset_id) throw new Error("本地视频素材不存在。");
        return store.ensureShotMediaAsset(input.projectId, task.rowId, existingTask.asset_id);
      };
      const localLink = await runLocalDeliveryStepWithRetry(() => Promise.resolve(ensureExistingShotMediaAsset()));
      if (!localLink.ok) {
        failedCount += 1;
        const message = `${localDeliveryFailurePrefix}${localLink.error.message}`;
        const updatedTask = input.updateTask(task.rowId, {
          status: "failed",
          provider: "kie",
          providerTaskId: task.providerTaskId ?? null,
          errorMessage: message
        }, task);
        if (updatedTask) {
          input.sendEvent(
            storyboardCloudVideoTaskEvent(updatedTask, task, {
              canRetryDelivery: true,
              localDeliveryFailed: true,
              localDeliveryAttemptCount: localLink.attempts
            })
          );
        }
        continue;
      }
      const mediaUpdate = localLink.value;
      input.setMediaUpdate(mediaUpdate);
      const updatedTask = input.updateTask(task.rowId, {
        status: "succeeded",
        provider: "kie",
        providerTaskId: task.providerTaskId ?? null,
        assetId: existingTask.asset_id,
        fileName: existingTask.file_name ?? null,
        errorMessage: null
      }, task);
      succeededCount += 1;
      if (updatedTask) input.sendEvent({ ...storyboardCloudVideoTaskEvent(updatedTask, task), canRetryDelivery: false, localDeliveryFailed: false, mediaUpdate });
      continue;
    }
    if (!task.resultUrl) {
      failedCount += 1;
      const message = task.errorMessage
        ? `${cloudVideoDeliveryFailurePrefix}：${task.errorMessage}`
        : `${cloudVideoDeliveryFailurePrefix}：云端暂未返回可下载的视频。可重试获取同一生成结果。`;
      const updatedTask = input.updateTask(task.rowId, {
        status: "failed",
        provider: "kie",
        providerTaskId: task.providerTaskId ?? null,
        errorMessage: message
      }, task);
      if (updatedTask) {
        input.sendEvent(
          storyboardCloudVideoTaskEvent(updatedTask, task, {
            canRetryDelivery: task.canRetryDelivery ?? Boolean(task.taskId || task.providerTaskId),
            localDeliveryFailed: false,
            localDeliveryAttemptCount: 0
          })
        );
      }
      continue;
    }

    const assetId = task.resultAssetId || task.taskId || randomUUID();
    const localDelivery = await deliverRemoteAssetLocally(task.resultUrl, async (remoteAsset) => {
      const fileName = `${assetId}.${videoExtensionFromContentType(remoteAsset.contentType, task.resultUrl as string)}`;
      const mediaUpdate = await store.upsertGeneratedShotVideoBytes(input.projectId, task.rowId, assetId, fileName, remoteAsset.bytes, input.overwriteExisting);
      assertGeneratedVideoMediaImported(mediaUpdate, task.rowId, assetId);
      return { fileName, mediaUpdate };
    });
    if (localDelivery.ok) {
      const { fileName, mediaUpdate } = localDelivery.value;
      input.setMediaUpdate(mediaUpdate);
      const updatedTask = input.updateTask(task.rowId, {
        status: "succeeded",
        provider: "kie",
        providerTaskId: task.providerTaskId ?? null,
        assetId,
        fileName,
        errorMessage: null
      }, task);
      succeededCount += 1;
      if (updatedTask) {
        input.sendEvent({
          ...storyboardCloudVideoTaskEvent(updatedTask, task),
          canRetryDelivery: false,
          localDeliveryFailed: false,
          localDeliveryAttemptCount: localDelivery.attemptCount,
          mediaUpdate
        });
      }
    } else {
      failedCount += 1;
      const message = `${localDeliveryFailurePrefix}${localDelivery.error.message}`;
      const updatedTask = input.updateTask(task.rowId, {
        status: "failed",
        provider: "kie",
        providerTaskId: task.providerTaskId ?? null,
        errorMessage: message
      }, task);
      if (updatedTask) {
        input.sendEvent(
          storyboardCloudVideoTaskEvent(updatedTask, task, {
            canRetryDelivery: true,
            localDeliveryFailed: true,
            localDeliveryAttemptCount: localDelivery.attemptCount
          })
        );
      }
    }
  }

  return { pendingCount, failedCount, succeededCount };
}

async function retryStoryboardGenerationDelivery(
  input: StoryboardDeliveryRetryInput
): Promise<CloudApiResult<StoryboardDeliveryRetryResult>> {
  const projectId = typeof input?.projectId === "string" ? input.projectId.trim() : "";
  const taskId = typeof input?.taskId === "string" ? input.taskId.trim() : "";
  const rowId = typeof input?.rowId === "string" ? input.rowId.trim() : "";
  if (!projectId || !taskId || !rowId || (input.kind !== "image" && input.kind !== "video")) {
    return { ok: false, error: { code: "INVALID_DELIVERY_RETRY", message: "缺少可重试的生成任务信息。" } };
  }

  try {
    const project = store.getProject(projectId);
    if (!project.rows.some((row) => row.id === rowId)) {
      return { ok: false, error: { code: "STORYBOARD_ROW_NOT_FOUND", message: "没有找到对应的分镜行。" } };
    }
    const cloudResult = await localAiMedia.retryStoryboardGenerationDelivery(projectId, input.kind, taskId);
    if (!cloudResult.ok) return cloudResult;

    if (input.kind === "image") {
      const task = resolveImageDeliveryRetryTask(cloudResult.data);
      if (!task) return { ok: false, error: { code: "AI_TASK_NOT_FOUND", message: "没有找到可恢复的生图任务。" } };
      if (task.rowId !== rowId) {
        return { ok: false, error: { code: "DELIVERY_TASK_ROW_MISMATCH", message: "生成任务与当前分镜不匹配。" } };
      }

      let mediaUpdate = store.getShotMediaUpdate(projectId);
      let imageTask: StoryboardImageTaskSummary = {
        ...task,
        canRetryDelivery: task.canRetryDelivery ?? cloudResult.data.canRetryDelivery,
        deliveryAttempts: task.deliveryAttempts ?? cloudResult.data.deliveryAttempts
      };
      let recovered = false;
      if (task.status === "succeeded" && task.resultUrl) {
        const imported = await importStoryboardImageTasks(
          projectId,
          input.overwriteExisting ?? true,
          task.batchId ?? "retry-delivery",
          [task],
          { running: 0, succeeded: 1, failed: 0, cancelled: 0, total: 1 }
        );
        mediaUpdate = { rows: imported.data.rows, assets: imported.data.assets };
        imageTask = imported.data.tasks[0] ?? imageTask;
        recovered = imported.data.localAvailableCount > 0;
      }

      const localDeliveryFailed = imageTask.localDeliveryFailed === true;
      const canRetryDelivery = recovered
        ? false
        : localDeliveryFailed || imageTask.canRetryDelivery === true || cloudResult.data.canRetryDelivery === true || Boolean(imageTask.providerTaskId || imageTask.taskId);
      imageTask = { ...imageTask, canRetryDelivery, localDeliveryFailed };
      return {
        ok: true,
        data: {
          ...mediaUpdate,
          kind: "image",
          recovered,
          taskId: imageTask.taskId || taskId,
          providerTaskId: imageTask.providerTaskId,
          canRetryDelivery,
          localDeliveryFailed,
          localDeliveryAttemptCount: imageTask.localDeliveryAttemptCount ?? 0,
          imageTask
        }
      };
    }

    const task = resolveVideoDeliveryRetryTask(cloudResult.data);
    if (!task) return { ok: false, error: { code: "AI_VIDEO_TASK_NOT_FOUND", message: "没有找到可恢复的生视频任务。" } };
    if (task.rowId !== rowId) {
      return { ok: false, error: { code: "DELIVERY_TASK_ROW_MISMATCH", message: "生成任务与当前分镜不匹配。" } };
    }
    if (task.method !== "Seedance 2.0") {
      return { ok: false, error: { code: "DELIVERY_RETRY_NOT_SUPPORTED", message: "本机 HyperFrames 任务需要重新生成，不能查询 KIE 结果。" } };
    }

    const result = await retryStoryboardVideoTaskLocalDelivery({
      projectId,
      rowId,
      overwriteExisting: input.overwriteExisting ?? true,
      task,
      serverCanRetryDelivery: cloudResult.data.canRetryDelivery,
      serverDeliveryAttempts: cloudResult.data.deliveryAttempts
    });
    emitStoryboardVideoDeliveryRetryEvent(projectId, result.videoTask, result.mediaUpdate);
    return {
      ok: true,
      data: {
        ...result.mediaUpdate,
        kind: "video",
        recovered: result.recovered,
        taskId: task.taskId || taskId,
        providerTaskId: task.providerTaskId,
        canRetryDelivery: result.videoTask.canRetryDelivery === true,
        localDeliveryFailed: result.videoTask.localDeliveryFailed === true,
        localDeliveryAttemptCount: result.videoTask.localDeliveryAttemptCount ?? 0,
        videoTask: result.videoTask
      }
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "DELIVERY_RETRY_FAILED",
        message: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

function resolveImageDeliveryRetryTask(data: {
  task?: StoryboardImageTaskSummary | StoryboardVideoTaskSummary;
  imageTask?: StoryboardImageTaskSummary;
}): StoryboardImageTaskSummary | null {
  const task = data.imageTask ?? data.task;
  return task && !("method" in task) ? task : null;
}

function resolveVideoDeliveryRetryTask(data: {
  task?: StoryboardImageTaskSummary | StoryboardVideoTaskSummary;
  videoTask?: StoryboardVideoTaskSummary;
}): StoryboardVideoTaskSummary | null {
  const task = data.videoTask ?? data.task;
  return task && "method" in task ? task : null;
}

async function retryStoryboardVideoTaskLocalDelivery(input: {
  projectId: string;
  rowId: string;
  overwriteExisting: boolean;
  task: StoryboardVideoTaskSummary;
  serverCanRetryDelivery?: boolean;
  serverDeliveryAttempts?: number;
}): Promise<{ recovered: boolean; mediaUpdate: ShotMediaUpdateResult; videoTask: StoryboardActiveVideoGenerationTask }> {
  const rowLatestLocalTask = store.getLatestStoryboardVideoTaskByRow(input.projectId, input.rowId);
  const providerMatchedLocalTask = input.task.providerTaskId
    ? store.getStoryboardVideoTaskByProviderTaskId(input.projectId, input.task.providerTaskId)
    : null;
  const latestLocalTask =
    providerMatchedLocalTask ??
    (!input.task.providerTaskId || !rowLatestLocalTask?.provider_task_id ? rowLatestLocalTask : null);
  let mediaUpdate = store.getShotMediaUpdate(input.projectId);
  const providerTaskId = input.task.providerTaskId ?? latestLocalTask?.provider_task_id ?? null;
  const deliveryAttempts = input.task.deliveryAttempts ?? input.serverDeliveryAttempts;
  const resultAssetId = input.task.resultAssetId || input.task.taskId || latestLocalTask?.asset_id || randomUUID();
  const existingAssetId = latestLocalTask?.asset_id || resultAssetId;
  const existingAsset = mediaUpdate.assets.find((asset) => asset.id === existingAssetId && asset.kind === "video");

  if (existingAsset) {
    const localLink = await runLocalDeliveryStepWithRetry(() =>
      Promise.resolve(store.ensureShotMediaAsset(input.projectId, input.rowId, existingAsset.id))
    );
    if (!localLink.ok) {
      const message = `${localDeliveryFailurePrefix}${localLink.error.message}`;
      const updatedLocalTask = latestLocalTask
        ? store.updateStoryboardVideoTask(input.projectId, latestLocalTask.id, {
            status: "failed",
            provider: "kie",
            providerTaskId,
            errorMessage: message
          })
        : null;
      return {
        recovered: false,
        mediaUpdate,
        videoTask: withStoryboardVideoDeliveryState(
          updatedLocalTask ? store.mapStoryboardVideoTask(updatedLocalTask) : cloudVideoTaskToActiveTask(input.task, "failed"),
          {
            canRetryDelivery: true,
            localDeliveryFailed: true,
            deliveryAttempts,
            localDeliveryAttemptCount: localLink.attempts
          }
        )
      };
    }
    mediaUpdate = localLink.value;
    const updatedLocalTask = latestLocalTask
      ? store.updateStoryboardVideoTask(input.projectId, latestLocalTask.id, {
          status: "succeeded",
          provider: "kie",
          providerTaskId,
          assetId: existingAsset.id,
          fileName: existingAsset.name,
          errorMessage: null
        })
      : null;
    return {
      recovered: true,
      mediaUpdate,
      videoTask: withStoryboardVideoDeliveryState(
        updatedLocalTask ? store.mapStoryboardVideoTask(updatedLocalTask) : cloudVideoTaskToActiveTask(input.task),
        { canRetryDelivery: false, localDeliveryFailed: false, deliveryAttempts, localDeliveryAttemptCount: localLink.attempts }
      )
    };
  }

  if (input.task.status !== "succeeded" || !input.task.resultUrl) {
    const canRetryDelivery = input.task.canRetryDelivery ?? input.serverCanRetryDelivery ?? Boolean(providerTaskId || input.task.taskId);
    const deliveryFailed = String(input.task.status) === "delivery_failed" || input.task.status === "succeeded";
    const message = deliveryFailed
      ? input.task.errorMessage
        ? `${cloudVideoDeliveryFailurePrefix}：${input.task.errorMessage}`
        : `${cloudVideoDeliveryFailurePrefix}。可重试获取同一生成结果。`
      : input.task.errorMessage || `${cloudVideoDeliveryFailurePrefix}。可重试获取同一生成结果。`;
    const updatedLocalTask = latestLocalTask
      ? store.updateStoryboardVideoTask(input.projectId, latestLocalTask.id, {
          status: "failed",
          provider: "kie",
          providerTaskId,
          errorMessage: message
        })
      : null;
    return {
      recovered: false,
      mediaUpdate,
      videoTask: withStoryboardVideoDeliveryState(
        updatedLocalTask ? store.mapStoryboardVideoTask(updatedLocalTask) : cloudVideoTaskToActiveTask(input.task, "failed"),
        { canRetryDelivery, localDeliveryFailed: false, deliveryAttempts, localDeliveryAttemptCount: 0 }
      )
    };
  }

  const sourceUrl = input.task.resultUrl;
  const localDelivery = await deliverRemoteAssetLocally(sourceUrl, async (remoteAsset) => {
    const fileName = `${resultAssetId}.${videoExtensionFromContentType(remoteAsset.contentType, sourceUrl)}`;
    const nextMediaUpdate = await store.upsertGeneratedShotVideoBytes(
      input.projectId,
      input.rowId,
      resultAssetId,
      fileName,
      remoteAsset.bytes,
      input.overwriteExisting
    );
    assertGeneratedVideoMediaImported(nextMediaUpdate, input.rowId, resultAssetId);
    return { fileName, mediaUpdate: nextMediaUpdate };
  });

  if (localDelivery.ok) {
    mediaUpdate = localDelivery.value.mediaUpdate;
    const updatedLocalTask = latestLocalTask
      ? store.updateStoryboardVideoTask(input.projectId, latestLocalTask.id, {
          status: "succeeded",
          provider: "kie",
          providerTaskId,
          assetId: resultAssetId,
          fileName: localDelivery.value.fileName,
          errorMessage: null
        })
      : null;
    return {
      recovered: true,
      mediaUpdate,
      videoTask: withStoryboardVideoDeliveryState(
        updatedLocalTask ? store.mapStoryboardVideoTask(updatedLocalTask) : cloudVideoTaskToActiveTask(input.task),
        {
          canRetryDelivery: false,
          localDeliveryFailed: false,
          deliveryAttempts,
          localDeliveryAttemptCount: localDelivery.attemptCount
        }
      )
    };
  }

  const message = `${localDeliveryFailurePrefix}${localDelivery.error.message}`;
  const updatedLocalTask = latestLocalTask
    ? store.updateStoryboardVideoTask(input.projectId, latestLocalTask.id, {
        status: "failed",
        provider: "kie",
        providerTaskId,
        errorMessage: message
      })
    : null;
  return {
    recovered: false,
    mediaUpdate,
    videoTask: withStoryboardVideoDeliveryState(
      updatedLocalTask ? store.mapStoryboardVideoTask(updatedLocalTask) : cloudVideoTaskToActiveTask(input.task, "failed"),
      {
        canRetryDelivery: true,
        localDeliveryFailed: true,
        deliveryAttempts,
        localDeliveryAttemptCount: localDelivery.attemptCount
      }
    )
  };
}

function cloudVideoTaskToActiveTask(
  task: StoryboardVideoTaskSummary,
  status: StoryboardActiveVideoGenerationTask["status"] = task.status === "delivery_failed" ? "failed" : task.status
): StoryboardActiveVideoGenerationTask {
  return {
    taskId: task.taskId,
    batchId: task.batchId,
    rowId: task.rowId,
    method: task.method,
    status,
    provider: task.provider,
    providerTaskId: task.providerTaskId,
    assetId: task.assetId,
    fileName: task.fileName,
    errorMessage: task.errorMessage,
    canRetryDelivery: task.canRetryDelivery,
    localDeliveryFailed: task.localDeliveryFailed,
    deliveryAttempts: task.deliveryAttempts,
    localDeliveryAttemptCount: task.localDeliveryAttemptCount,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt
  };
}

function withStoryboardVideoDeliveryState(
  task: StoryboardActiveVideoGenerationTask,
  delivery: Pick<
    StoryboardActiveVideoGenerationTask,
    "canRetryDelivery" | "localDeliveryFailed" | "deliveryAttempts" | "localDeliveryAttemptCount"
  >
): StoryboardActiveVideoGenerationTask {
  return { ...task, ...delivery };
}

function emitStoryboardVideoDeliveryRetryEvent(projectId: string, task: StoryboardActiveVideoGenerationTask, mediaUpdate: ShotMediaUpdateResult): void {
  const event: Omit<StoryboardVideoGenerationEvent, "projectId"> = {
    ...task,
    mediaUpdate: task.status === "succeeded" ? mediaUpdate : undefined
  };
  updateActiveStoryboardVideoTask(projectId, event);
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
  companionServer?.broadcastEvent("storyboard-video-generation-event", { projectId, ...event });
  mainWindow.webContents.send("mkboard:storyboard-video-generation-event", { projectId, ...event } satisfies StoryboardVideoGenerationEvent);
}

async function syncPersistedStoryboardVideoTasks(projectId: string): Promise<StoryboardActiveVideoGenerationTask[]> {
  const hasActiveRun = activeStoryboardVideoRuns.has(projectId);
  const activeRows = new Set(getActiveStoryboardVideoTasks(projectId).filter((task) => task.status === "queued" || task.status === "running").map((task) => task.rowId));

  if (!hasActiveRun) {
    const recoverableTasks = store.listRecoverableStoryboardVideoTasks(projectId);
    const dreaminaOutputDirs = [...new Set(
      recoverableTasks
        .filter((task) => task.provider === "dreamina_cli" && task.output_dir)
        .map((task) => task.output_dir as string)
    )];
    for (const outputDir of dreaminaOutputDirs) {
      try {
        await recoverDreaminaAgentRun({ projectId, outputDir });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        recoverableTasks
          .filter((task) => task.provider === "dreamina_cli" && task.output_dir === outputDir)
          .forEach((task) => {
            store.updateStoryboardVideoTask(projectId, task.id, {
              status: "running",
              errorMessage: `即梦任务自动同步暂时失败：${message}`
            });
          });
      }
    }

    for (const task of recoverableTasks) {
      if (task.provider === "dreamina_cli") continue;
      if (task.method === "Hyperframes") {
        store.updateStoryboardVideoTask(projectId, task.id, {
          status: "failed",
          errorMessage: "应用关闭后，本机 HyperFrames 生成已中断。可在生成历史中点击重试。"
        });
        continue;
      }
      if (isStoryboardVideoTaskOverdue(task)) {
        store.updateStoryboardVideoTask(projectId, task.id, {
          status: "failed",
          errorMessage: "Seedance 2.0 任务等待已超过 2 小时，仍未返回视频。可在生成历史中点击重试。"
        });
      }
    }

    {
      const activeResult = await localAiMedia.getActiveStoryboardVideoGenerations(projectId);
      if (activeResult.ok) {
        const taskByRowId = new Map(
          store.listLatestStoryboardVideoTasks(projectId).filter((task) => task.provider !== "dreamina_cli").map((task) => [task.row_id, task])
        );
        await importStoryboardVideoTasks({
          projectId,
          overwriteExisting: false,
          tasks: activeResult.data.tasks,
          updateTask: (rowId, patch, cloudTask) => {
            const latestTaskCandidate = taskByRowId.get(rowId) ?? store.getLatestStoryboardVideoTaskByRow(projectId, rowId);
            const latestTask = latestTaskCandidate?.provider === "dreamina_cli" ? null : latestTaskCandidate;
            const providerMatchedTask = cloudTask.providerTaskId
              ? store.getStoryboardVideoTaskByProviderTaskId(projectId, cloudTask.providerTaskId)
              : null;
            const task =
              providerMatchedTask ??
              (!cloudTask.providerTaskId || !latestTask?.provider_task_id ? latestTask : null);
            if (!task || task.status === "cancelled") return null;
            const updatedTask = store.updateStoryboardVideoTask(projectId, task.id, patch);
            if (updatedTask) taskByRowId.set(rowId, updatedTask);
            return updatedTask;
          },
          sendEvent: (event) => updateActiveStoryboardVideoTask(projectId, event),
          setMediaUpdate: () => undefined
        });
      }
    }
  } else {
    const recoverableTasks = store.listRecoverableStoryboardVideoTasks(projectId);
    recoverableTasks.forEach((task) => {
      if (activeRows.has(task.row_id)) return;
      updateActiveStoryboardVideoTask(projectId, storyboardVideoTaskEvent(task));
    });
  }

  const latestTaskRecords = store.listLatestStoryboardVideoTasks(projectId);
  const latestTaskIds = new Set(latestTaskRecords.map((task) => task.id));
  const olderDeliveryRecoveryRecords = store
    .listStoryboardVideoTasks(projectId)
    .filter((task) => !latestTaskIds.has(task.id) && persistedStoryboardVideoDeliveryState(task).canRetryDelivery === true);
  const visibleTaskRecords = [...latestTaskRecords, ...olderDeliveryRecoveryRecords].sort((left, right) =>
    left.created_at.localeCompare(right.created_at)
  );
  const visibleTasks = visibleTaskRecords.map((task) => ({
    ...store.mapStoryboardVideoTask(task),
    ...persistedStoryboardVideoDeliveryState(task)
  }));
  replaceActiveStoryboardVideoTasks(projectId, visibleTasks);
  return visibleTasks;
}

function markInterruptedStoryboardVideoTasks(projectId: string, message: string): void {
  store.listRecoverableStoryboardVideoTasks(projectId).forEach((task) => {
    if (task.provider === "dreamina_cli") {
      store.updateStoryboardVideoTask(projectId, task.id, {
        status: "running",
        errorMessage: "MkBoard 已停止本地 Agent，但即梦服务端任务可能仍在生成；稍后会继续同步结果。"
      });
      return;
    }
    store.updateStoryboardVideoTask(projectId, task.id, {
      status: "cancelled",
      errorMessage: message
    });
  });
}

function addActiveStoryboardVideoRun(projectId: string, controller: AbortController): void {
  const controllers = activeStoryboardVideoRuns.get(projectId) ?? new Set<AbortController>();
  controllers.add(controller);
  activeStoryboardVideoRuns.set(projectId, controllers);
}

function removeActiveStoryboardVideoRun(projectId: string, controller: AbortController): void {
  const controllers = activeStoryboardVideoRuns.get(projectId);
  if (!controllers) return;
  controllers.delete(controller);
  if (controllers.size === 0) {
    activeStoryboardVideoRuns.delete(projectId);
  }
}

function normalizeStoryboardVideoGenerationItems(items: StoryboardVideoBatchInput["items"], projectImageRatio: ImageRatio): StoryboardVideoGenerationTarget[] {
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const targets: StoryboardVideoGenerationTarget[] = [];
  for (const item of items) {
    const rowId = typeof item?.rowId === "string" ? item.rowId.trim() : "";
    const prompt = typeof item?.prompt === "string" ? item.prompt.trim() : "";
    if (!rowId || !prompt || prompt === "—" || prompt === "-" || seen.has(rowId)) continue;
    if (item.method !== "Seedance 2.0" && item.method !== "Hyperframes") continue;
    seen.add(rowId);
    targets.push({
      rowId,
      method: item.method,
      prompt,
      durationSec: normalizeStoryboardVideoDuration(item.durationSec, item.method),
      aspectRatio: item.method === "Seedance 2.0"
        ? resolveStoryboardVideoAspectRatio(item.aspectRatio, projectImageRatio)
        : normalizeImageRatio(projectImageRatio),
      hyperframesResolution: item.method === "Hyperframes" ? normalizeHyperframesVideoResolution(item.hyperframesResolution) : undefined,
      seedanceResolution: item.method === "Seedance 2.0" ? normalizeSeedanceVideoResolution(item.seedanceResolution) : undefined
    });
  }
  return targets;
}

function resolveStoryboardVideoAspectRatio(input: unknown, projectImageRatio: ImageRatio): SeedanceAspectRatio {
  return isSeedanceAspectRatio(input)
    ? input
    : normalizeImageRatio(projectImageRatio);
}

function normalizeStoryboardVideoDuration(input: unknown, method: StoryboardVideoGenerationMethod): number {
  const value = typeof input === "number" ? input : Number(input);
  if (method === "Seedance 2.0") {
    if (!Number.isFinite(value)) return 12;
    return Math.max(10, Math.min(15, Math.round(value)));
  }
  if (!Number.isFinite(value)) return 10;
  return Math.max(10, Math.min(20, Math.round(value)));
}

function persistedStoryboardVideoDeliveryState(
  task: StoryboardVideoTaskRecord
): Partial<
  Pick<
    StoryboardActiveVideoGenerationTask,
    "canRetryDelivery" | "localDeliveryFailed" | "deliveryAttempts" | "localDeliveryAttemptCount"
  >
> {
  if (task.provider === "dreamina_cli" || task.method !== "Seedance 2.0" || task.status !== "failed" || !task.provider_task_id) return {};
  const message = task.error_message ?? "";
  const localDeliveryFailed = message.startsWith(localDeliveryFailurePrefix);
  const cloudDeliveryFailed = message.startsWith(cloudVideoDeliveryFailurePrefix);
  if (!localDeliveryFailed && !cloudDeliveryFailed) return {};
  return {
    canRetryDelivery: true,
    localDeliveryFailed,
    deliveryAttempts: cloudDeliveryFailed ? maxLocalDeliveryAttempts : undefined,
    localDeliveryAttemptCount: localDeliveryFailed ? maxLocalDeliveryAttempts : undefined
  };
}

function storyboardVideoTaskEvent(task: StoryboardVideoTaskRecord): Omit<StoryboardVideoGenerationEvent, "projectId"> {
  return {
    taskId: task.id,
    rowId: task.row_id,
    method: task.method,
    status: task.status,
    provider: task.provider ?? undefined,
    providerTaskId: task.provider_task_id ?? undefined,
    assetId: task.asset_id ?? undefined,
    fileName: task.file_name ?? undefined,
    errorMessage: task.error_message ?? undefined,
    startedAt: task.started_at ?? undefined,
    finishedAt: getStoryboardVideoTaskFinishedAt(task),
    createdAt: task.created_at,
    workDir: task.work_dir ?? undefined,
    updatedAt: task.updated_at,
    ...persistedStoryboardVideoDeliveryState(task)
  };
}

function storyboardCloudVideoTaskEvent(
  localTask: StoryboardVideoTaskRecord,
  cloudTask: StoryboardVideoTaskSummary,
  overrides: Partial<Omit<StoryboardVideoGenerationEvent, "projectId" | "rowId" | "method" | "status">> = {}
): Omit<StoryboardVideoGenerationEvent, "projectId"> {
  const localEvent = storyboardVideoTaskEvent(localTask);
  return {
    ...localEvent,
    batchId: cloudTask.batchId,
    providerTaskId: cloudTask.providerTaskId ?? localTask.provider_task_id ?? undefined,
    canRetryDelivery: cloudTask.canRetryDelivery ?? localEvent.canRetryDelivery,
    localDeliveryFailed: cloudTask.localDeliveryFailed ?? localEvent.localDeliveryFailed,
    deliveryAttempts: cloudTask.deliveryAttempts ?? localEvent.deliveryAttempts,
    localDeliveryAttemptCount: cloudTask.localDeliveryAttemptCount ?? localEvent.localDeliveryAttemptCount,
    ...overrides
  };
}

function storyboardVideoTaskSummary(task: StoryboardVideoTaskRecord): StoryboardVideoTaskSummary {
  return {
    taskId: task.id,
    rowId: task.row_id,
    method: task.method,
    status: task.status,
    provider: task.provider ?? undefined,
    providerTaskId: task.provider_task_id ?? undefined,
    assetId: task.asset_id ?? undefined,
    fileName: task.file_name ?? undefined,
    errorMessage: task.error_message ?? undefined,
    startedAt: task.started_at ?? undefined,
    finishedAt: getStoryboardVideoTaskFinishedAt(task),
    createdAt: task.created_at,
    workDir: task.work_dir ?? undefined,
    outputPath: task.output_path ?? undefined,
    updatedAt: task.updated_at,
    ...persistedStoryboardVideoDeliveryState(task)
  };
}

function getStoryboardVideoTaskFinishedAt(task: StoryboardVideoTaskRecord): string | undefined {
  return task.completed_at ?? task.failed_at ?? task.cancelled_at ?? (task.status === "succeeded" || task.status === "failed" || task.status === "cancelled" ? task.updated_at : undefined);
}

function isStoryboardVideoTaskOverdue(task: StoryboardVideoTaskRecord): boolean {
  const createdAtMs = Date.parse(task.created_at);
  if (!Number.isFinite(createdAtMs)) return false;
  return Date.now() - createdAtMs > 2 * 60 * 60_000;
}

function updateActiveStoryboardVideoTask(projectId: string, event: Omit<StoryboardVideoGenerationEvent, "projectId">): void {
  const activeTasks = activeStoryboardVideoTasks.get(projectId) ?? new Map<string, StoryboardActiveVideoGenerationTask>();
  const taskKey = getStoryboardVideoActiveTaskKey(event);
  const existingTask = activeTasks.get(taskKey) ?? activeTasks.get(event.rowId);
  if (taskKey !== event.rowId) activeTasks.delete(event.rowId);
  const preserveExistingError = event.status === "failed" || event.status === "cancelled";
  activeTasks.set(taskKey, {
    taskId: event.taskId ?? existingTask?.taskId,
    batchId: event.batchId ?? existingTask?.batchId,
    rowId: event.rowId,
    method: event.method ?? existingTask?.method,
    status: event.status,
    provider: event.provider ?? existingTask?.provider,
    providerTaskId: event.providerTaskId ?? existingTask?.providerTaskId,
    assetId: event.assetId ?? existingTask?.assetId,
    fileName: event.fileName ?? existingTask?.fileName,
    errorMessage: event.errorMessage ?? (preserveExistingError ? existingTask?.errorMessage : undefined),
    canRetryDelivery: event.canRetryDelivery ?? existingTask?.canRetryDelivery,
    localDeliveryFailed: event.localDeliveryFailed ?? existingTask?.localDeliveryFailed,
    deliveryAttempts: event.deliveryAttempts ?? existingTask?.deliveryAttempts,
    localDeliveryAttemptCount: event.localDeliveryAttemptCount ?? existingTask?.localDeliveryAttemptCount,
    startedAt: event.startedAt ?? existingTask?.startedAt,
    finishedAt: event.finishedAt ?? existingTask?.finishedAt,
    createdAt: event.createdAt ?? existingTask?.createdAt,
    updatedAt: event.updatedAt ?? existingTask?.updatedAt,
    stage: event.stage ?? existingTask?.stage,
    stageLabel: event.stageLabel ?? existingTask?.stageLabel,
    stageDetail: event.stageDetail ?? existingTask?.stageDetail,
    cliLog: mergeStoryboardVideoCliLog(existingTask?.cliLog, event.cliLog),
    studioUrl: event.studioUrl ?? existingTask?.studioUrl,
    workDir: event.workDir ?? existingTask?.workDir
  });
  if (activeTasks.size === 0) {
    activeStoryboardVideoTasks.delete(projectId);
  } else {
    activeStoryboardVideoTasks.set(projectId, activeTasks);
  }
}

function getStoryboardVideoActiveTaskKey(task: Pick<StoryboardActiveVideoGenerationTask, "rowId" | "taskId">): string {
  return task.taskId || task.rowId;
}

function mergeStoryboardVideoCliLog(existing: string | undefined, next: string | undefined): string | undefined {
  if (!next) return existing;
  const merged = [existing, next].filter(Boolean).join("\n");
  return merged.length > 2400 ? merged.slice(-2400) : merged;
}

function replaceActiveStoryboardVideoTasks(projectId: string, tasks: StoryboardActiveVideoGenerationTask[]): void {
  if (tasks.length === 0) {
    activeStoryboardVideoTasks.delete(projectId);
    return;
  }
  const existingTasks = activeStoryboardVideoTasks.get(projectId);
  activeStoryboardVideoTasks.set(
    projectId,
    new Map(
      tasks.map((task) => {
        const taskKey = getStoryboardVideoActiveTaskKey(task);
        const existingTask = existingTasks?.get(taskKey) ?? Array.from(existingTasks?.values() ?? []).find((item) => item.rowId === task.rowId);
        return [
          taskKey,
          {
            ...task,
            batchId: task.batchId ?? existingTask?.batchId,
            provider: task.provider ?? existingTask?.provider,
            providerTaskId: task.providerTaskId ?? existingTask?.providerTaskId,
            canRetryDelivery: task.canRetryDelivery ?? existingTask?.canRetryDelivery,
            localDeliveryFailed: task.localDeliveryFailed ?? existingTask?.localDeliveryFailed,
            deliveryAttempts: task.deliveryAttempts ?? existingTask?.deliveryAttempts,
            localDeliveryAttemptCount: task.localDeliveryAttemptCount ?? existingTask?.localDeliveryAttemptCount
          }
        ];
      })
    )
  );
}

function getActiveStoryboardVideoTasks(projectId: string): StoryboardActiveVideoGenerationTask[] {
  return Array.from(activeStoryboardVideoTasks.get(projectId)?.values() ?? []);
}

async function runStoryboardParse(input: GenerateStoryboardInput, sender: WebContents | null): Promise<StoryboardRow[]> {
  const projectId = input.projectId;
  const clientRunId = input.clientRunId || randomUUID();
  const agentCliId = input.agentCliId ?? "codex";
  const interfaceLanguage = normalizeInterfaceLanguage(input.interfaceLanguage);
  const agentName = agentCliDisplayName(agentCliId);
  const existingRun = activeStoryboardParseRuns.get(projectId);
  if (existingRun) {
    throw new Error(storyboardParseAlreadyRunningMessage(interfaceLanguage));
  }
  const conversationId = input.conversationId || store.createAgentConversation(projectId).activeConversationId;
  const controller = new AbortController();
  const startedAt = Date.now();
  const clickedAt = typeof input.clientStartedAt === "number" && Number.isFinite(input.clientStartedAt) ? input.clientStartedAt : startedAt;
  const parseLog = createStoryboardParseMainLogContext({ clientRunId, projectId, agentName, clickedAt, startedAt });
  logStoryboardParseMainStep(parseLog, "ipc_received", {
    agentCliId,
    interfaceLanguage,
    conversationId,
    hasClientStartedAt: Boolean(input.clientStartedAt)
  });
  const events: AgentEvent[] = [
    { kind: "status", label: "storyboard_parse" },
    { kind: "status", label: "queued", detail: "已收到这个生成请求。" },
    { kind: "status", label: "context", detail: "正在读取当前脚本、分镜表、项目素材和 SKILL。" }
  ];
  activeAgentRuns.set(clientRunId, controller);
  logStoryboardParseMainStep(parseLog, "active_run_registered");
  const userMessage = input.userMessage?.trim() || "AI 解析分镜";
  store.appendAgentMessage(projectId, "user", userMessage, { conversationId });
  const assistantMessage = store.appendAgentMessage(projectId, "assistant", "我来根据当前脚本重新解析分镜。", {
    conversationId,
    events,
    runStatus: "queued",
    clientRunId,
    agentCliId
  });
  activeStoryboardParseRuns.set(projectId, {
    projectId,
    clientRunId,
    conversationId,
    assistantMessageId: assistantMessage.id,
    startedAt
  });
  logStoryboardParseMainStep(parseLog, "agent_messages_created", {
    assistantMessageId: assistantMessage.id,
    initialEventCount: events.length
  });
  const sendAgentEvent = (agentEvent: AgentEvent) => {
    sendAgentEventToRenderer(sender, {
      projectId,
      conversationId,
      clientRunId,
      assistantMessageId: assistantMessage.id,
      event: agentEvent
    });
  };
  const emitAgentEvent = (agentEvent: AgentEvent) => {
    if (agentEvent.kind !== "text" && agentEvent.kind !== "thinking") {
      logStoryboardParseMainStep(parseLog, "agent_event", summarizeAgentEventForStoryboardParseLog(agentEvent));
    }
    events.push(agentEvent);
    store.updateAgentMessage(projectId, assistantMessage.id, {
      content: assistantMessage.content,
      events,
      runStatus: "running"
    });
    sendAgentEvent(agentEvent);
  };
  const emitTerminalEvent = (agentEvent: AgentEvent, content: string, runStatus: "succeeded" | "failed" | "canceled") => {
    logStoryboardParseMainStep(parseLog, "terminal_event", {
      runStatus,
      event: summarizeAgentEventForStoryboardParseLog(agentEvent),
      contentPreview: truncateStoryboardParseLogText(content, 1200)
    });
    events.push(agentEvent);
    store.updateAgentMessage(projectId, assistantMessage.id, {
      content,
      events,
      runStatus
    });
    sendAgentEvent(agentEvent);
  };

  try {
    emitAgentEvent({ kind: "status", label: "running", detail: "正在分析脚本结构和当前可见分镜字段。" });
    const projectContext = store.getProject(projectId, interfaceLanguage);
    logStoryboardParseMainStep(parseLog, "project_context_loaded", summarizeProjectContextForStoryboardParseLog(projectContext));
    logStoryboardParseMainStep(parseLog, "agent_run_start", {
      mode: "storyboard-generation",
      tab: "storyboard"
    });
    const response = await runStoryboardAgent({
      project: projectContext,
      tab: "storyboard",
      message: "根据当前脚本拆成可编辑分镜表。必须使用当前项目绑定的拆分分镜 SKILL 规则，只返回 rows，scriptHtml 返回 null。",
      userVisibleMessage: userMessage,
      agentCliId,
      interfaceLanguage,
      mode: "storyboard-generation",
      clientRunId
    }, {
      signal: controller.signal,
      onEvent: emitAgentEvent,
      log: (step, detail) => logStoryboardParseMainStep(parseLog, `agent.${step}`, detail)
    });
    logStoryboardParseMainStep(parseLog, "agent_run_response", {
      replyPreview: truncateStoryboardParseLogText(response.reply ?? "", 1200),
      rowCount: response.rows?.length ?? 0,
      operationCount: response.operations?.length ?? 0,
      hasScriptHtml: Boolean(response.scriptHtml)
    });
    emitAgentEvent({ kind: "status", label: "running", detail: "正在拆分 A-ROLL / B-ROLL，并整理每条分镜的内容和备注。" });
    if (!response.rows || response.rows.length === 0) {
      logStoryboardParseMainStep(parseLog, "agent_rows_missing", {
        replyPreview: truncateStoryboardParseLogText(response.reply ?? "", 1200)
      });
      throw new Error(response.reply || `${agentName} 没有返回可写入的分镜行。`);
    }
    emitAgentEvent({ kind: "status", label: "running", detail: "正在补齐图像提示词、视频提示词和生成方式等可见字段。" });
    emitAgentEvent({ kind: "status", label: "writing", detail: `正在写回分镜表 ${response.rows.length} 行。` });
    logStoryboardParseMainStep(parseLog, "rows_write_start", {
      rowCount: response.rows.length,
      firstRowsPreview: response.rows.slice(0, 3).map((row) => ({
        scene: row.scene,
        content: truncateStoryboardParseLogText(row.content, 200),
        note: truncateStoryboardParseLogText(row.note, 200),
        customValueKeys: Object.keys(row.customValues ?? {})
      }))
    });
    store.replaceRowsAfterStoryboardParse(projectId, response.rows.map((row) => ({ ...row, id: "" })));
    const rows = store.getProject(projectId, interfaceLanguage).rows;
    logStoryboardParseMainStep(parseLog, "rows_write_complete", {
      persistedRowCount: rows.length
    });
    emitAgentEvent({ kind: "usage", durationMs: Date.now() - startedAt });
    emitTerminalEvent({ kind: "status", label: "succeeded", detail: `已完成分镜解析，写回 ${rows.length} 条分镜。` }, response.reply || `已完成分镜解析，写回 ${rows.length} 条分镜。`, "succeeded");
    logStoryboardParseMainStep(parseLog, "conversation_title_schedule_start");
    scheduleAgentConversationTitle(projectId, conversationId, agentCliId, interfaceLanguage, sender);
    return rows;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const canceled = controller.signal.aborted || /canceled|cancelled|aborted/i.test(message);
    const reply = canceled ? formatAgentCanceledReply(agentName) : formatAgentFailureReply(message, agentName);
    const detail = canceled ? formatAgentCanceledDetail(agentName) : formatAgentFailureDetail(message, agentName);
    logStoryboardParseMainStep(parseLog, canceled ? "canceled" : "failed", {
      message,
      replyPreview: truncateStoryboardParseLogText(reply, 1200),
      detailPreview: truncateStoryboardParseLogText(detail, 1200)
    });
    emitAgentEvent({ kind: "usage", durationMs: Date.now() - startedAt });
    emitTerminalEvent({ kind: "status", label: canceled ? "canceled" : "failed", detail }, reply, canceled ? "canceled" : "failed");
    if (!canceled) scheduleAgentConversationTitle(projectId, conversationId, agentCliId, interfaceLanguage, sender);
    throw new Error(reply);
  } finally {
    activeAgentRuns.delete(clientRunId);
    if (activeStoryboardParseRuns.get(projectId)?.clientRunId === clientRunId) {
      activeStoryboardParseRuns.delete(projectId);
    }
    logStoryboardParseMainStep(parseLog, "active_run_removed");
  }
}

function scheduleAgentConversationTitle(projectId: string, conversationId: string, agentCliId: AgentCliId, interfaceLanguage: InterfaceLanguage | undefined, webContents: WebContents | null): void {
  const runKey = `${projectId}:${conversationId}`;
  if (activeAgentTitleRuns.has(runKey) || !store.shouldGenerateAgentConversationTitle(projectId, conversationId)) return;

  activeAgentTitleRuns.add(runKey);
  void (async () => {
    try {
      const detail = store.getAgentConversation(projectId, conversationId);
      const fallbackTitle = detail.messages.find((message) => message.role === "user")?.content ?? defaultAgentConversationTitle;
      let title = fallbackTitle;

      try {
        title = await runConversationTitleAgent({
          project: store.getProject(projectId, interfaceLanguage),
          messages: detail.messages,
          agentCliId,
          interfaceLanguage
        });
      } catch (error) {
        console.warn("Failed to generate agent conversation title", error);
      }

      if (!store.shouldGenerateAgentConversationTitle(projectId, conversationId)) return;
      const nextDetail = store.renameAgentConversation(projectId, conversationId, title || fallbackTitle);
      const titlePayload = {
        projectId,
        conversationId,
        activeConversationId: nextDetail.activeConversationId,
        conversations: nextDetail.conversations
      };
      companionServer?.broadcastEvent("agent-conversation-title", titlePayload);
      const target = webContents && !webContents.isDestroyed() ? webContents : mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : null;
      if (!target) return;
      target.send("mkboard:agent-conversation-title", titlePayload);
    } finally {
      activeAgentTitleRuns.delete(runKey);
    }
  })();
}

function agentCliDisplayName(agentCliId: AgentCliId): string {
  const def = findCliAgentDefinition(agentCliId);
  if (def) return def.name;
  if (agentCliId === "claude-code") return "Claude Code";
  return "Codex CLI";
}

function formatAgentCanceledReply(agentName: string): string {
  return `已停止当前 ${agentName} 任务。`;
}

function formatAgentCanceledDetail(agentName: string): string {
  return `用户停止了当前 ${agentName} 任务。`;
}

function formatAgentFailureReply(message: string, agentName: string): string {
  if (/canceled|cancelled|aborted/i.test(message)) return formatAgentCanceledReply(agentName);
  if (/普通对话不允许替换整张分镜表|只修改已有分镜单元格/.test(message)) return message;
  if (isAgentWorkspaceUnavailableMessage(message)) return "项目本地目录不可用，请检查项目文件夹是否被移动、删除或没有权限。";
  if (isCliExecutableMissingMessage(message)) return `${agentName} 可执行文件不可用，请在账号面板重新扫描或重新连接后再试。`;
  if (isClaudeToolCallTruncatedMessage(message)) return `${agentName} 生成内容过长，工具调用参数被截断。请重试一次，MkBoard 会要求 Agent 只返回结构化结果。`;
  if (/未完成授权|not (authenticated|logged in)|unauthorized|authentication required|login required|401|TokenRefreshFailed|invalid_grant/i.test(message)) {
    return `${agentName} 未授权或登录态失效，请在账号面板重新连接后再试。`;
  }
  if (isAgentNetworkFailureMessage(message)) return formatAgentNetworkFailureReply(agentName);
  if (/timed out|timeout/i.test(message)) return `${agentName} 响应超时，请稍后重试。`;
  if (/MCP|插件|plugin|rmcp/i.test(message)) return `${agentName} 启动配置异常，请重启应用或重新登录后再试。`;
  return `${agentName} 调用失败，请稍后重试或在账号面板刷新状态。`;
}

function formatAgentFailureDetail(message: string, agentName: string): string {
  if (isAgentWorkspaceUnavailableMessage(message)) return message;
  if (isCliExecutableMissingMessage(message)) return `${agentName} 可执行文件不存在或不可启动。请在账号面板重新扫描本机 CLI，或确认 PATH / 环境变量中的 CLI 路径仍然有效。`;
  if (isClaudeToolCallTruncatedMessage(message)) return `${agentName} 的工具调用内容没有完整传输，常见原因是一次性写入内容过长。请直接重试。`;
  if (isAgentNetworkFailureMessage(message)) return formatAgentNetworkFailureDetail(agentName);
  if (/timed out|timeout/i.test(message)) return `${agentName} 响应超时，请稍后重试。`;
  if (/未完成授权|not (authenticated|logged in)|unauthorized|authentication required|login required|401|TokenRefreshFailed|invalid_grant/i.test(message)) {
    return `${agentName} 未授权或登录态失效，请在账号面板重新连接后再试。`;
  }
  return message;
}

function isAgentWorkspaceUnavailableMessage(message: string): boolean {
  return /项目本地目录不可用/.test(message);
}

function isCliExecutableMissingMessage(message: string): boolean {
  return /spawn .+ ENOENT/i.test(message);
}

function isClaudeToolCallTruncatedMessage(message: string): boolean {
  return /TRUNCATED|stream ended before the tool call completed|Arguments were not fully transmitted/i.test(message);
}

function formatAgentNetworkFailureReply(agentName: string): string {
  if (agentName === "Claude Code") return "Claude Code 网络/API 网关连接失败，请检查网络、代理/VPN 或 Claude Code API usage 配置后重试。";
  return `${agentName} 网络请求失败，请检查网络、代理或模型服务连接后重试。`;
}

function formatAgentNetworkFailureDetail(agentName: string): string {
  if (agentName === "Claude Code") {
    return "Claude Code 无法连接模型 API 或自定义 API 网关。请检查网络连接、代理/VPN 设置，以及 Claude Code 的 ANTHROPIC_BASE_URL / API usage 配置。";
  }
  return `${agentName} 无法完成网络请求。请检查网络连接、代理/VPN 设置，或稍后重试。`;
}

async function submitStoryboardImageGeneration(input: StoryboardImageBatchInput) {
  const project = store.getProject(input.projectId).project;
  return localAiMedia.generateStoryboardImages(project.id, {
    overwriteExisting: input.overwriteExisting,
    items: input.items.map((item) => ({ ...item, aspectRatio: item.aspectRatio || project.imageRatio }))
  });
}

async function syncStoryboardImageBatch(input: StoryboardImageBatchSyncInput) {
  const batchResult = await localAiMedia.getStoryboardImageBatch(input.projectId, input.batchId);
  if (!batchResult.ok) return batchResult;
  return importStoryboardImageTasks(input.projectId, input.overwriteExisting, batchResult.data.batchId, batchResult.data.tasks, batchResult.data.counts);
}

async function syncActiveStoryboardImageGenerations(projectId: string) {
  const activeResult = await localAiMedia.getActiveStoryboardImageGenerations(projectId);
  if (!activeResult.ok) return activeResult;
  const tasks = mergePersistedStoryboardImageDeliveryRecoveries(projectId, activeResult.data.tasks);
  const persistedOnlyCount = Math.max(0, tasks.length - activeResult.data.tasks.length);
  return importStoryboardImageTasks(projectId, false, activeResult.data.batchId, tasks, {
    ...activeResult.data.counts,
    failed: activeResult.data.counts.failed + persistedOnlyCount,
    total: activeResult.data.counts.total + persistedOnlyCount
  });
}

// Progress events go to the window that asked (or the main window for MCP runs) so the storyboard shows live status.
async function runStoryboardVideoGeneration(input: StoryboardVideoBatchInput, sender: Electron.WebContents | null): Promise<StoryboardVideoBatchResult> {
  const project = store.getProject(input.projectId);
  const controller = new AbortController();
  addActiveStoryboardVideoRun(input.projectId, controller);
  const isCurrentRun = () => activeStoryboardVideoRuns.get(input.projectId)?.has(controller) ?? false;
  const sendVideoGenerationEvent = (event: Omit<StoryboardVideoGenerationEvent, "projectId">) => {
    if (!isCurrentRun()) return;
    updateActiveStoryboardVideoTask(input.projectId, event);
    const fullEvent = { projectId: input.projectId, ...event } satisfies StoryboardVideoGenerationEvent;
    companionServer?.broadcastEvent("storyboard-video-generation-event", fullEvent);
    if (!sender || sender.isDestroyed()) return;
    sender.send("mkboard:storyboard-video-generation-event", fullEvent);
  };
  const activeVideoRowIds = new Set(
    getActiveStoryboardVideoTasks(input.projectId)
      .filter((task) => task.status === "queued" || task.status === "running")
      .map((task) => task.rowId)
  );
  const items = normalizeStoryboardVideoGenerationItems(input.items, project.imageRatio).filter((item) => !activeVideoRowIds.has(item.rowId));
  let mediaUpdate = store.getShotMediaUpdate(input.projectId);
  const taskByRowId = new Map<string, StoryboardVideoTaskRecord>();
  for (const item of items) {
    const task = store.createStoryboardVideoTask({
      projectId: input.projectId,
      rowId: item.rowId,
      method: item.method,
      prompt: item.prompt,
      aspectRatio: item.aspectRatio,
      durationSec: item.durationSec ?? null
    });
    taskByRowId.set(item.rowId, task);
    sendVideoGenerationEvent(storyboardVideoTaskEvent(task));
  }
  if (items.length === 0) {
    removeActiveStoryboardVideoRun(input.projectId, controller);
    return {
      ...mediaUpdate,
      submittedCount: 0,
      succeededCount: 0,
      failedCount: 0,
      tasks: []
    };
  }
  const seedanceItems = items.filter((item) => item.method === "Seedance 2.0");
  const hyperframesItems = items.filter((item) => item.method === "Hyperframes");
  const tasks: StoryboardVideoTaskSummary[] = [];
  const updatePersistedVideoTask = (rowId: string, patch: Parameters<MkboardStore["updateStoryboardVideoTask"]>[2]): StoryboardVideoTaskRecord | null => {
    const task = taskByRowId.get(rowId);
    if (!task || !isCurrentRun()) return null;
    const updatedTask = store.updateStoryboardVideoTask(input.projectId, task.id, patch);
    if (updatedTask) taskByRowId.set(rowId, updatedTask);
    return updatedTask;
  };
  const updateLatestVideoTaskForCurrentRow = (rowId: string, patch: Parameters<MkboardStore["updateStoryboardVideoTask"]>[2]): StoryboardVideoTaskRecord | null => {
    const task = taskByRowId.get(rowId);
    if (!task) return null;
    const latestTask = store.getLatestStoryboardVideoTaskByRow(input.projectId, rowId);
    if (!latestTask || latestTask.id !== task.id) return null;
    const updatedTask = store.updateStoryboardVideoTask(input.projectId, task.id, patch);
    if (updatedTask) taskByRowId.set(rowId, updatedTask);
    return updatedTask;
  };
  const currentTaskSummaries = () => Array.from(taskByRowId.values()).map((task) => storyboardVideoTaskSummary(task));
  const pushTaskSummary = (task: StoryboardVideoTaskRecord) => {
    tasks.push(storyboardVideoTaskSummary(task));
  };
  const sendVideoGenerationProgress = (target: StoryboardVideoGenerationTarget, progress: StoryboardVideoGenerationProgress) => {
    const task = taskByRowId.get(target.rowId);
    const baseEvent = task ? storyboardVideoTaskEvent(task) : { rowId: target.rowId, method: target.method, status: "running" as const };
    sendVideoGenerationEvent({
      ...baseEvent,
      status: baseEvent.status === "queued" ? "running" : baseEvent.status,
      updatedAt: new Date().toISOString(),
      ...progress
    });
  };
  try {
    if (seedanceItems.length > 0) {
      await runRemoteSeedanceStoryboardVideoGeneration({
        project,
        projectId: input.projectId,
        items: seedanceItems,
        overwriteExisting: input.overwriteExisting,
        signal: controller.signal,
        updateTask: updatePersistedVideoTask,
        sendEvent: sendVideoGenerationEvent,
        setMediaUpdate: (nextMediaUpdate) => {
          mediaUpdate = nextMediaUpdate;
        }
      });
    }
    if (hyperframesItems.length > 0) {
      await runLocalStoryboardVideoGeneration(project, { ...input, items: hyperframesItems }, {
        signal: controller.signal,
        onTaskPrepared: (target, meta) => {
          updatePersistedVideoTask(target.rowId, { workDir: meta.workDir });
        },
        onTaskStart: (target) => {
          const updatedTask = updatePersistedVideoTask(target.rowId, { status: "running" });
          sendVideoGenerationEvent(updatedTask ? storyboardVideoTaskEvent(updatedTask) : { rowId: target.rowId, method: target.method, status: "running" });
        },
        onTaskProgress: (target, progress) => {
          sendVideoGenerationProgress(target, progress);
        },
        onTaskComplete: (result) => {
          if (!isCurrentRun()) return;
          if (!result.outputPath) {
            const status = result.cancelled ? ("cancelled" as const) : ("failed" as const);
            const updatedTask = updatePersistedVideoTask(result.rowId, {
              status,
              errorMessage: result.errorMessage || (result.cancelled ? "视频生成已中止。" : "视频生成失败。")
            });
            if (updatedTask) {
              pushTaskSummary(updatedTask);
              sendVideoGenerationEvent(storyboardVideoTaskEvent(updatedTask));
              return;
            }
            const task = {
              rowId: result.rowId,
              method: result.method,
              status,
              errorMessage: result.errorMessage || (result.cancelled ? "视频生成已中止。" : "视频生成失败。")
            };
            tasks.push(task);
            sendVideoGenerationEvent({
              rowId: result.rowId,
              method: result.method,
              status,
              errorMessage: task.errorMessage
            });
            return;
          }
          try {
            sendVideoGenerationProgress(
              { rowId: result.rowId, method: result.method, prompt: "", aspectRatio: undefined, durationSec: undefined },
              {
                stage: "import",
                stageLabel: "正在导入 MkBoard 素材库",
                stageDetail: result.outputPath
              }
            );
            const assetId = randomUUID();
            const fileName = suggestedVideoAssetName(result.rowId, result.method, result.outputPath);
            mediaUpdate = store.upsertGeneratedShotVideo(input.projectId, result.rowId, assetId, result.outputPath, fileName, input.overwriteExisting, result.posterPath);
            assertGeneratedVideoMediaImported(mediaUpdate, result.rowId, assetId);
            const updatedTask = updatePersistedVideoTask(result.rowId, {
              status: "succeeded" as const,
              providerTaskId: result.providerTaskId ?? taskByRowId.get(result.rowId)?.provider_task_id ?? null,
              outputPath: result.outputPath,
              assetId,
              fileName,
              errorMessage: null
            }) ?? updateLatestVideoTaskForCurrentRow(result.rowId, {
              status: "succeeded" as const,
              providerTaskId: result.providerTaskId ?? taskByRowId.get(result.rowId)?.provider_task_id ?? null,
              outputPath: result.outputPath,
              assetId,
              fileName,
              errorMessage: null
            });
            const doneProgress: StoryboardVideoGenerationProgress = {
              stage: "done",
              stageLabel: "已导入 MkBoard 素材库",
              stageDetail: fileName
            };
            if (updatedTask) {
              tasks.push({ ...storyboardVideoTaskSummary(updatedTask), ...doneProgress });
              sendVideoGenerationEvent({ ...storyboardVideoTaskEvent(updatedTask), ...doneProgress, mediaUpdate });
              return;
            }
            tasks.push({
              rowId: result.rowId,
              method: result.method,
              status: "succeeded" as const,
              providerTaskId: result.providerTaskId,
              assetId,
              fileName,
              ...doneProgress
            });
            sendVideoGenerationEvent({
              rowId: result.rowId,
              method: result.method,
              status: "succeeded",
              providerTaskId: result.providerTaskId,
              assetId,
              fileName,
              ...doneProgress,
              mediaUpdate
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const updatedTask = updatePersistedVideoTask(result.rowId, {
              status: "failed" as const,
              errorMessage: message
            });
            if (updatedTask) {
              pushTaskSummary(updatedTask);
              sendVideoGenerationEvent(storyboardVideoTaskEvent(updatedTask));
              return;
            }
            tasks.push({
              rowId: result.rowId,
              method: result.method,
              status: "failed" as const,
              errorMessage: message
            });
            sendVideoGenerationEvent({
              rowId: result.rowId,
              method: result.method,
              status: "failed",
              errorMessage: message
            });
          }
        }
      });
    }
    const resultTasks = currentTaskSummaries();
    const succeededCount = resultTasks.filter((task) => task.status === "succeeded").length;
    const failedCount = resultTasks.filter((task) => task.status === "failed" || task.status === "cancelled").length;
    return {
      ...mediaUpdate,
      submittedCount: resultTasks.length,
      succeededCount,
      failedCount,
      tasks: resultTasks
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const completedRowIds = new Set(
      Array.from(taskByRowId.values())
        .filter((task) => task.status === "succeeded" || task.status === "failed" || task.status === "cancelled")
        .map((task) => task.row_id)
    );
    items.forEach((item) => {
      if (completedRowIds.has(item.rowId)) return;
      const updatedTask = updatePersistedVideoTask(item.rowId, {
        status: "failed",
        errorMessage: message
      });
      if (updatedTask) {
        pushTaskSummary(updatedTask);
        sendVideoGenerationEvent(storyboardVideoTaskEvent(updatedTask));
        return;
      }
      const task = {
        rowId: item.rowId,
        method: item.method,
        status: "failed" as const,
        errorMessage: message
      };
      tasks.push(task);
      sendVideoGenerationEvent({
        rowId: item.rowId,
        method: item.method,
        status: "failed",
        errorMessage: message
      });
    });
    const resultTasks = currentTaskSummaries();
    const succeededCount = resultTasks.filter((task) => task.status === "succeeded").length;
    const failedCount = resultTasks.filter((task) => task.status === "failed" || task.status === "cancelled").length;
    return {
      ...mediaUpdate,
      submittedCount: items.length,
      succeededCount,
      failedCount,
      tasks: resultTasks
    };
  } finally {
    if (isCurrentRun()) {
      removeActiveStoryboardVideoRun(input.projectId, controller);
    }
  }
}

function cancelStoryboardVideoGenerations(projectId: string): boolean {
  const controllers = activeStoryboardVideoRuns.get(projectId);
  if (!controllers || controllers.size === 0) return false;
  controllers.forEach((controller) => controller.abort());
  markInterruptedStoryboardVideoTasks(projectId, "视频生成已中止。");
  return true;
}

async function getStoryboardVideoGenerationState(projectId: string) {
  const tasks = await syncPersistedStoryboardVideoTasks(projectId);
  return {
    rowIds: tasks.filter((task) => task.status === "queued" || task.status === "running").map((task) => task.rowId),
    tasks
  };
}

function startMcpBridgeIfEnabled(): void {
  if (isReleaseSmokeTest || isDesktopUpdateE2eTest || process.env.MKBOARD_DISABLE_MCP_BRIDGE === "1") return;
  void startDesktopMcpBridge({
    store,
    listTemplates: (interfaceLanguage) => store.listTemplates(interfaceLanguage),
    listSkills: (interfaceLanguage) => store.listSkills(interfaceLanguage),
    listTastes: () => store.listTastes(),
    afterProjectDeleted: async () => undefined,
    generation: {
      getAccount: async () => {
        const snapshot = byokStore.getSnapshot();
        const activeImg = snapshot.providers.find((p) => p.id === snapshot.activeImageProvider);
        const kie = snapshot.providers.find((p) => p.id === "kie");
        return {
          ok: true,
          signedIn: true,
          creditsAvailable: null,
          isPaid: true,
          canUseImages: Boolean(activeImg?.configured),
          canUseSeedance: Boolean(kie?.configured),
          canUseHyperframes: true
        };
      },
      submitImages: (input) => submitStoryboardImageGeneration(input),
      syncImageBatch: (input) => syncStoryboardImageBatch(input),
      syncActiveImages: (projectId) => syncActiveStoryboardImageGenerations(projectId),
      runVideos: (input) => runStoryboardVideoGeneration(input, mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : null),
      getVideoState: (projectId) => getStoryboardVideoGenerationState(projectId),
      cancelVideos: (projectId) => cancelStoryboardVideoGenerations(projectId)
    },
    speech: {
      getStatus: () => elevenLabs.getStatus(),
      listVoices: () => elevenLabs.listVoices(),
      synthesize: (input) => elevenLabs.synthesizeSpeechAudio(input)
    },
    createProject: (input) => store.createProject({ ...input, icon: "", tasteId: "" }),
    runStoryboardParse: (input) =>
      runStoryboardParse(
        {
          projectId: input.projectId,
          agentCliId: input.agentCliId,
          interfaceLanguage: input.interfaceLanguage,
          userMessage: input.instructions ? `AI 解析分镜：${input.instructions}` : undefined
        },
        null
      ),
    registerClients: !(isDev && process.env.MKBOARD_TEST_USER_DATA_DIR),
    getWindow: () => mainWindow,
    ensureWindow: () => {
      if (!mainWindow || mainWindow.isDestroyed()) createWindow();
      return mainWindow as BrowserWindow;
    },
    log: (message, detail) => (detail === undefined ? console.info(`[MkBoard]${message}`) : console.info(`[MkBoard]${message}`, detail))
  })
    .then((bridge) => {
      mcpBridge = bridge;
    })
    .catch((error: unknown) => {
      console.warn("[MkBoard][MCP] bridge failed to start", error instanceof Error ? error.message : String(error));
    });
}

if (singleInstanceLock) {
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    const appIcon = loadAppIcon();
    if (appIcon && process.platform === "darwin") app.dock?.setIcon(appIcon);

    const dataDir = app.getPath("userData");
    const projectsDir = join(app.getPath("documents"), "MkBoard Projects");
    store = new MkboardStore(join(dataDir, "mkboard.sqlite"), projectsDir);
    byokStore = new ByokStore(dataDir);
    localAiMedia = new LocalAiMediaService(dataDir, byokStore);
    elevenLabs = new ElevenLabsService(dataDir, byokStore);
    desktopUpdater = new DesktopUpdater({
      emit: emitDesktopUpdateState,
      hasActiveWork: hasActiveDesktopWork,
      disabled: isReleaseSmokeTest
    });
    // Multi-device companion disabled in desktop client per product simplification
    companionServer = null;
    registerAssetPreviewProtocol();
    registerIpc();
    createWindow();
    startMcpBridgeIfEnabled();

    app.on("activate", () => {
      if (!mainWindow) createWindow();
    });
  });

  app.on("before-quit", () => {
    void companionServer?.stop();
    void mcpBridge?.close();
    for (const controller of activeAgentRuns.values()) controller.abort();
    closeHyperframesStudioWindows();
    stopActiveHyperframesStudioPreviews();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
