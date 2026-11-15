import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join } from "node:path";
import {
  ensureStoryboardPromptColumns,
  getSpokenTextFromCell,
  getStoryboardPromptColumnKind,
  hyperframesVideoResolutionValues,
  imageRatioValues,
  isSeedanceAspectRatio,
  normalizeImageRatio,
  seedanceAspectRatioValues,
  seedanceVideoCreditsPerSecond,
  seedanceVideoResolutionValues,
  splitTextIntoSpeechSegments,
  stripScriptHtmlToPlainText
} from "../../shared";
import type {
  AgentCliId,
  AgentOperation,
  AgentRowRef,
  CloudApiResult,
  HyperframesVideoResolution,
  SeedanceVideoResolution,
  StoryboardActiveVideoGenerationTask,
  StoryboardImageBatchInput,
  StoryboardImageBatchResult,
  StoryboardImageBatchSyncInput,
  StoryboardImageBatchSyncResult,
  StoryboardImageTaskSummary,
  StoryboardVideoBatchInput,
  StoryboardVideoBatchResult,
  StoryboardVideoTaskSummary,
  ElevenLabsErrorCode,
  ElevenLabsSpeechInput,
  ElevenLabsStatus,
  ElevenLabsVoicesResult,
  ImageRatio,
  InterfaceLanguage,
  ProjectAsset,
  ProjectDetail,
  ProjectExportKind,
  ProjectSummary,
  ShotMediaUpdateResult,
  Skill,
  StoryboardColumn,
  StoryboardColumnId,
  StoryboardColumnType,
  ProjectTemplate,
  StoryboardRow,
  Taste,
  UpdateProjectInput,
  WorkspaceTab
} from "../../shared";
import { applyConfirmedAgentOperations, resolveAgentRowRef, type AgentOperationStore } from "../agent-operations";
import { normalizeAgentOperation, normalizeRows } from "../agent-response";
import { sanitizeExportFileName, writeProjectExport } from "../project-export";
import {
  applyAgentSeedanceAspectRatioOverrides,
  buildStoryboardImageGenerationCandidates,
  buildStoryboardVideoGenerationCandidates,
  filterStoryboardGenerationTargetsByMode,
  filterStoryboardVideoTargetsByMethod,
  normalizeSeedanceVideoCreditsDuration,
  type StoryboardMediaGenerationMode,
  type StoryboardVideoGenerationMethodFilter
} from "../../storyboard-generation";

// Implements the MkBoard MCP tools inside the Electron main process. Every storyboard write goes
// through the same AgentOperation normalizer/executor the in-app Agent sidebar uses.

export type McpHostStore = AgentOperationStore & {
  // System 拆分镜 skills are localized when read, so pass the window's interface language.
  getProject(projectId: string, interfaceLanguage?: InterfaceLanguage): ProjectDetail;
  listProjects(): ProjectSummary[];
  replaceRowsAfterStoryboardParse(projectId: string, rows: StoryboardRow[]): void;
  importShotMediaPaths(projectId: string, rowId: string, filePaths: string[]): Promise<ShotMediaUpdateResult>;
  importAssetPaths(projectId: string, filePaths: string[]): Promise<ProjectAsset[]>;
  updateShotMedia(projectId: string, rowId: string, assetIds: string[]): ShotMediaUpdateResult;
  // Project lifecycle, columns and asset library: the same store calls the project menu, column menu and 素材库 use.
  listArchivedProjects(): ProjectSummary[];
  listDeletedProjects(): ProjectSummary[];
  updateProject(input: UpdateProjectInput): ProjectSummary[];
  archiveProject(projectId: string): ProjectSummary[];
  unarchiveProject(projectId: string): ProjectSummary[];
  trashProject(projectId: string): ProjectSummary[];
  restoreProject(projectId: string): ProjectSummary[];
  deleteProject(projectId: string): ProjectSummary[];
  saveColumns(projectId: string, columns: StoryboardColumn[]): void;
  renameAsset(projectId: string, assetId: string, nextFileName: string): ShotMediaUpdateResult;
  replaceAssetPath(projectId: string, assetId: string, sourcePath: string): Promise<ShotMediaUpdateResult>;
  deleteAssets(projectId: string, assetIds: string[]): ShotMediaUpdateResult;
  getAssetFilePath(projectId: string, assetId: string): string | null;
};

// MkBoard's own image / video generation: the same main-process entry points the storyboard toolbar uses.
// Seedance videos and images run in MkBoard cloud and spend credits; Hyperframes renders locally with the selected CLI.
export type McpGenerationAccount =
  | { ok: true; signedIn: boolean; creditsAvailable: number | null; isPaid: boolean; canUseImages: boolean; canUseSeedance: boolean; canUseHyperframes: boolean }
  | { ok: false; message: string };

export type McpGenerationService = {
  getAccount(): Promise<McpGenerationAccount>;
  submitImages(input: StoryboardImageBatchInput): Promise<CloudApiResult<StoryboardImageBatchResult>>;
  syncImageBatch(input: StoryboardImageBatchSyncInput): Promise<CloudApiResult<StoryboardImageBatchSyncResult>>;
  syncActiveImages(projectId: string): Promise<CloudApiResult<StoryboardImageBatchSyncResult>>;
  runVideos(input: StoryboardVideoBatchInput): Promise<StoryboardVideoBatchResult>;
  getVideoState(projectId: string): Promise<{ rowIds: string[]; tasks: StoryboardActiveVideoGenerationTask[] }>;
  cancelVideos(projectId: string): boolean;
};

// ElevenLabs 配音 through the user's own key (stored with their MkBoard account); it never spends MkBoard credits.
export type McpSpeechService = {
  getStatus(): Promise<ElevenLabsStatus>;
  listVoices(): Promise<ElevenLabsVoicesResult>;
  synthesize(
    input: ElevenLabsSpeechInput
  ): Promise<{ ok: true; audio: Buffer; cached: boolean } | { ok: false; error: ElevenLabsErrorCode; message?: string }>;
};

export type McpActiveView = {
  projectId: string | null;
  screen?: string;
  tab?: string;
  agentCliId?: AgentCliId;
  interfaceLanguage?: InterfaceLanguage;
  speechVoiceId?: string;
  // Video settings chosen in MkBoard (设置 → 视频生成), used as MCP defaults.
  hyperframesResolution?: HyperframesVideoResolution;
  seedanceResolution?: SeedanceVideoResolution;
  hyperframesConcurrency?: number;
};

export type McpCreateProjectInput = {
  name: string;
  templateId: string;
  imageRatio: ImageRatio;
  interfaceLanguage?: InterfaceLanguage;
};

export type McpStoryboardParseInput = {
  projectId: string;
  agentCliId: AgentCliId;
  instructions?: string;
  interfaceLanguage?: InterfaceLanguage;
};

export type McpHostDeps = {
  store: McpHostStore;
  getActiveView(): McpActiveView;
  openProject(projectId: string, tab: WorkspaceTab): Promise<void>;
  notifyProjectChanged(projectId: string, tool: string): void;
  // Project creation and AI storyboard parsing live in the main process (quota check, CLI runs).
  // Optional so tool handlers can be tested without Electron.
  listTemplates?(interfaceLanguage?: InterfaceLanguage): ProjectTemplate[];
  createProject?(input: McpCreateProjectInput): ProjectDetail;
  runStoryboardParse?(input: McpStoryboardParseInput): Promise<StoryboardRow[]>;
  listSkills?(interfaceLanguage?: InterfaceLanguage): Skill[];
  listTastes?(): Taste[];
  // Runs after a permanent delete (cloud project cleanup). Failures are reported, never thrown.
  afterProjectDeleted?(): Promise<void>;
  speech?: McpSpeechService;
  generation?: McpGenerationService;
  // Injectable for tests; defaults to real timers.
  sleep?(ms: number): Promise<void>;
  downloadsDir: string;
  fetchImpl?: typeof fetch;
};

export const EXTERNAL_STYLE_GUIDANCE =
  "MkBoard 项目风格（Taste）不下发给外部 Agent：在 Claude Code / Codex 中生成 B-ROLL 或其他画面时，按用户自己的 skill 和要求决定风格，不要参考或模仿 MkBoard 项目风格。";

// Mirrors AGENTS.md 分镜生成方式 / 视频提示词 rules for prompts MkBoard's own generators consume later.
const STORYBOARD_GENERATION_RULES = [
  "生成方式 values: ChatGPT Image2 (one normal image), Seedance 2.0 (video), Hyperframes (HTML motion graphics video), 自定义 (user supplies media).",
  "Seedance 2.0 shots get a 2x2 four-panel storyboard reference image first: the image prompt asks for a four-panel storyboard reference and forbids single keyframes, shot numbers, titles, captions, description bars, watermarks, borders and UI marks.",
  "Hyperframes shots have no pre-generated image; leave their image prompt empty.",
  "Video prompts stay short: framing plus what actually happens, then only necessary duration, aspect ratio, on-screen text language and constraints. No metaphors, mood prose or generic quality words.",
  "When a shot has reference media, the video prompt says to follow the references instead of re-describing subjects, wardrobe, sets, colors or style.",
  "Every video prompt forbids BGM / background music; only diegetic sound effects that match the action (silence is fine).",
  "Shots hard-cut: no transitions, transition clips, intros or outros.",
  "Write prompts in the script's main language; fall back to English when unclear."
];

const MAX_DOWNLOAD_BYTES = 500 * 1024 * 1024;
const MAX_INSERT_CHUNK = 20;

export function createMcpToolHandler(deps: McpHostDeps) {
  return async function handleMcpTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case "get_active_project":
        return getActiveProject(deps);
      case "list_projects":
        return listProjects(deps, args);
      case "update_project":
        return updateProject(deps, args);
      case "archive_project":
      case "unarchive_project":
      case "delete_project":
      case "restore_project":
      case "delete_project_permanently":
        return changeProjectLifecycle(deps, args, name as ProjectLifecycleTool);
      case "export_project":
        return exportProject(deps, args);
      case "list_skills":
        return listSkills(deps);
      case "list_tastes":
        return listTastes(deps);
      case "update_columns":
        return updateColumns(deps, args);
      case "rename_asset":
        return renameAsset(deps, args);
      case "replace_asset":
        return replaceAsset(deps, args);
      case "delete_assets":
        return deleteAssets(deps, args);
      case "list_voices":
        return listVoices(deps);
      case "generate_voiceover":
        return generateVoiceover(deps, args);
      case "get_credits":
        return getCredits(deps);
      case "generate_shot_images":
        return generateShotImages(deps, args);
      case "generate_shot_videos":
        return generateShotVideos(deps, args);
      case "get_generation_status":
        return getGenerationStatus(deps, args);
      case "cancel_video_generation":
        return cancelVideoGeneration(deps, args);
      case "open_project":
        return openProject(deps, args);
      case "list_templates":
        return listTemplates(deps);
      case "create_project":
        return createProject(deps, args);
      case "get_storyboard_guide":
        return getStoryboardGuide(deps, args);
      case "split_storyboard":
        return splitStoryboard(deps, args);
      case "read_project":
        return readProject(deps, args);
      case "update_script":
        return updateScript(deps, args);
      case "replace_storyboard":
        return replaceStoryboard(deps, args);
      case "insert_shots":
        return insertShots(deps, args);
      case "update_shot_cells":
        return updateShotCells(deps, args);
      case "delete_shots":
        return applyRowListOperation(deps, args, "delete_shots");
      case "duplicate_shots":
        return applyRowListOperation(deps, args, "duplicate_shots");
      case "reorder_shot":
        return reorderShot(deps, args);
      case "import_shot_media":
        return importShotMedia(deps, args);
      case "set_shot_media":
        return setShotMedia(deps, args);
      case "import_assets":
        return importAssets(deps, args);
      default:
        throw new Error(`未知的 MkBoard 工具：${name}`);
    }
  };
}

function getActiveProject(deps: McpHostDeps) {
  const view = deps.getActiveView();
  if (!view.projectId) {
    return {
      activeProject: null,
      screen: view.screen ?? null,
      hint: "MkBoard 当前没有打开项目。可以先调用 list_projects，再用 open_project 打开目标项目。"
    };
  }
  const detail = deps.store.getProject(view.projectId);
  return {
    activeProject: { ...summarizeProject(detail.project), shotCount: detail.rows.length, assetCount: detail.assets.length },
    screen: view.screen ?? null,
    tab: view.tab ?? null
  };
}

async function openProject(deps: McpHostDeps, args: Record<string, unknown>) {
  const projectId = requireString(args.projectId, "projectId");
  const project = findUserProject(deps, projectId);
  const tab = readTab(args.tab) ?? "storyboard";
  await deps.openProject(project.id, tab);
  return { opened: summarizeProject(project), tab };
}

type ProjectStatus = "active" | "archived" | "trash";
type ProjectLifecycleTool = "archive_project" | "unarchive_project" | "delete_project" | "restore_project" | "delete_project_permanently";

function listProjects(deps: McpHostDeps, args: Record<string, unknown>) {
  const status = args.status === "archived" || args.status === "trash" || args.status === "all" ? args.status : "active";
  const projects = [
    ...(status === "active" || status === "all" ? deps.store.listProjects() : []),
    ...(status === "archived" || status === "all" ? deps.store.listArchivedProjects() : []),
    ...(status === "trash" || status === "all" ? deps.store.listDeletedProjects() : [])
  ].filter((project) => project.kind === "user");
  return { status, projects: projects.map((project) => ({ ...summarizeProject(project), imageRatio: project.imageRatio ?? null })) };
}

function updateProject(deps: McpHostDeps, args: Record<string, unknown>) {
  const projectId = resolveProjectId(deps, args);
  const project = findUserProject(deps, projectId);
  const view = deps.getActiveView();
  const input: UpdateProjectInput = { id: project.id, name: project.name, interfaceLanguage: view.interfaceLanguage };
  let changed = false;
  if (args.name !== undefined) {
    input.name = requireString(args.name, "name");
    changed = true;
  }
  if (args.imageRatio !== undefined) {
    if (!imageRatioValues.includes(args.imageRatio as ImageRatio)) throw new Error(`imageRatio 只能是 ${imageRatioValues.join(" / ")}。`);
    input.imageRatio = args.imageRatio as ImageRatio;
    changed = true;
  }
  if (args.storyboardSkillId !== undefined) {
    const skillId = requireString(args.storyboardSkillId, "storyboardSkillId");
    const skills = deps.listSkills?.(view.interfaceLanguage);
    if (skills && !skills.some((skill) => skill.id === skillId)) throw new Error(`找不到拆分镜 Skill ${skillId}，请先调用 list_skills。`);
    input.storyboardSkillId = skillId;
    changed = true;
  }
  if (args.tasteId !== undefined) {
    const tasteId = requireString(args.tasteId, "tasteId");
    const tastes = deps.listTastes?.();
    if (tastes && !tastes.some((taste) => taste.id === tasteId)) throw new Error(`找不到视频风格 ${tasteId}，请先调用 list_tastes。`);
    input.tasteId = tasteId;
    changed = true;
  }
  if (!changed) throw new Error("请至少提供 name、imageRatio、storyboardSkillId 或 tasteId 之一。");
  deps.store.updateProject(input);
  deps.notifyProjectChanged(project.id, "update_project");
  const next = deps.store.getProject(project.id, view.interfaceLanguage);
  return {
    project: { ...summarizeProject(next.project), imageRatio: next.imageRatio },
    storyboardSkill: next.storyboardSkill ? { id: next.storyboardSkill.id, name: next.storyboardSkill.name } : null,
    // Only the style's name: its content drives MkBoard's own generation and is not applied by external agents.
    taste: next.taste ? { id: next.taste.id, name: next.taste.name } : null
  };
}

async function changeProjectLifecycle(deps: McpHostDeps, args: Record<string, unknown>, tool: ProjectLifecycleTool) {
  const project = findAnyUserProject(deps, requireString(args.projectId, "projectId"));
  const status = projectStatus(project);
  let note: string | undefined;
  switch (tool) {
    case "archive_project":
      if (status !== "active") throw new Error(`项目「${project.name}」${statusLabel(status)}，不能归档。`);
      deps.store.archiveProject(project.id);
      break;
    case "unarchive_project":
      if (status !== "archived") throw new Error(`项目「${project.name}」不在归档里。`);
      deps.store.unarchiveProject(project.id);
      break;
    case "delete_project":
      if (status === "trash") throw new Error(`项目「${project.name}」已经在回收站。要彻底删除请用 delete_project_permanently。`);
      deps.store.trashProject(project.id);
      break;
    case "restore_project":
      if (status !== "trash") throw new Error(`项目「${project.name}」不在回收站。`);
      deps.store.restoreProject(project.id);
      break;
    case "delete_project_permanently":
      if (status !== "trash") throw new Error(`项目「${project.name}」不在回收站。请先用 delete_project 移入回收站，再永久删除。`);
      deps.store.deleteProject(project.id);
      try {
        await deps.afterProjectDeleted?.();
      } catch (error) {
        note = `本地项目已删除；云端同步稍后会自动重试（${error instanceof Error ? error.message : String(error)}）。`;
      }
      break;
  }
  deps.notifyProjectChanged(project.id, tool);
  if (tool === "delete_project_permanently") {
    return { deleted: true, project: { id: project.id, name: project.name, status: "deleted" }, note, localFolderRemoved: project.localPath };
  }
  const next = findAnyUserProject(deps, project.id);
  return { project: summarizeProject(next), note };
}

const PROJECT_EXPORT_KINDS: Record<ProjectExportKind, { extension: string; suffix: string }> = {
  "storyboard-csv": { extension: "csv", suffix: "storyboard" },
  "storyboard-assets-zip": { extension: "zip", suffix: "storyboard-assets" },
  "all-assets-zip": { extension: "zip", suffix: "all-assets" }
};

async function exportProject(deps: McpHostDeps, args: Record<string, unknown>) {
  const projectId = resolveProjectId(deps, args);
  const kind = typeof args.kind === "string" && args.kind in PROJECT_EXPORT_KINDS ? (args.kind as ProjectExportKind) : null;
  if (!kind) throw new Error(`kind 只能是 ${Object.keys(PROJECT_EXPORT_KINDS).join(" / ")}。`);
  const outputPath = requireString(args.outputPath, "outputPath");
  if (!isAbsolute(outputPath)) throw new Error(`请使用绝对路径：${outputPath}`);
  const detail = deps.store.getProject(projectId, deps.getActiveView().interfaceLanguage);
  const { extension, suffix } = PROJECT_EXPORT_KINDS[kind];
  let destination = outputPath;
  if (existsSync(outputPath) && statSync(outputPath).isDirectory()) {
    destination = join(outputPath, `${sanitizeExportFileName(detail.project.name)}-${suffix}.${extension}`);
  } else if (extname(outputPath).toLowerCase() !== `.${extension}`) {
    destination = `${outputPath}.${extension}`;
  }
  if (existsSync(destination) && args.overwrite !== true) throw new Error(`文件已存在：${destination}。要覆盖请传 overwrite: true。`);
  mkdirSync(dirname(destination), { recursive: true });
  const result = await writeProjectExport({
    kind,
    destinationPath: destination,
    project: detail,
    resolveAssetSource: (asset) => deps.store.getAssetFilePath(projectId, asset.id)
  });
  return { kind, filePath: destination, exportedCount: result.exportedCount };
}

function listSkills(deps: McpHostDeps) {
  if (!deps.listSkills) throw new Error("当前 MkBoard 版本不支持读取拆分镜 Skill。");
  return {
    skills: deps.listSkills(deps.getActiveView().interfaceLanguage).map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      scope: skill.scope
    }))
  };
}

function listTastes(deps: McpHostDeps) {
  if (!deps.listTastes) throw new Error("当前 MkBoard 版本不支持读取视频风格。");
  return {
    note: "视频风格（Taste）只影响 MkBoard 自己的生成；外部 Agent 自己生成画面时不要模仿它。",
    tastes: deps.listTastes().map((taste) => ({ id: taste.id, name: taste.name, description: taste.description, scope: taste.scope }))
  };
}

function listTemplates(deps: McpHostDeps) {
  if (!deps.listTemplates) throw new Error("当前 MkBoard 版本不支持读取项目模板。");
  return {
    templates: deps.listTemplates(deps.getActiveView().interfaceLanguage).map((template) => ({
      id: template.id,
      name: template.name,
      description: template.description,
      storyboardSkill: template.storyboardSkillName,
      columns: template.columns.filter((column) => column.id !== "sort").map((column) => column.label)
    }))
  };
}

async function createProject(deps: McpHostDeps, args: Record<string, unknown>) {
  if (!deps.createProject) throw new Error("当前 MkBoard 版本不支持通过 MCP 创建项目。");
  const name = requireString(args.name, "name");
  const scriptHtml =
    typeof args.scriptHtml === "string" && args.scriptHtml.trim() ? args.scriptHtml : typeof args.scriptText === "string" ? plainTextToScriptHtml(args.scriptText) : "";
  const detail = deps.createProject({
    name,
    templateId: typeof args.templateId === "string" ? args.templateId.trim() : "",
    imageRatio: normalizeImageRatio(args.imageRatio),
    interfaceLanguage: deps.getActiveView().interfaceLanguage
  });
  const projectId = detail.project.id;
  if (scriptHtml.trim()) applyOperations(deps, projectId, [{ type: "update_script", scriptHtml }], "create_project");
  else deps.notifyProjectChanged(projectId, "create_project");
  let opened = false;
  if (args.open !== false) {
    await deps.openProject(projectId, scriptHtml.trim() ? "script" : "storyboard");
    opened = true;
  }
  const next = deps.store.getProject(projectId, deps.getActiveView().interfaceLanguage);
  return {
    project: { ...summarizeProject(next.project), imageRatio: next.imageRatio },
    opened,
    template: next.project.templateId ?? null,
    storyboardSkill: next.storyboardSkill?.name ?? null,
    scriptText: htmlToPlainText(next.scriptHtml),
    shotCount: next.rows.length
  };
}

function getStoryboardGuide(deps: McpHostDeps, args: Record<string, unknown>) {
  const projectId = resolveProjectId(deps, args);
  const detail = deps.store.getProject(projectId, deps.getActiveView().interfaceLanguage);
  const skill = detail.storyboardSkill;
  return {
    project: { ...summarizeProject(detail.project), imageRatio: detail.imageRatio },
    // The 拆分镜 skill is MkBoard's splitting rule set; the project Taste stays out of it (see styleGuidance).
    storyboardSkill: skill ? { id: skill.id, name: skill.name, description: skill.description, content: skill.content } : null,
    styleGuidance: EXTERNAL_STYLE_GUIDANCE,
    columns: serializeColumns(detail.columns),
    rowFormat:
      "replace_storyboard rows: { scene: A-ROLL | B-ROLL, duration: seconds as string, content: script text this shot covers, note: visual notes, customValues: { <column id or label>: value } }. Fill the imagePrompt / videoPrompt / generationMethod columns when the skill asks for them.",
    generationRules: STORYBOARD_GENERATION_RULES,
    scriptText: htmlToPlainText(detail.scriptHtml),
    shotCount: detail.rows.length
  };
}

async function splitStoryboard(deps: McpHostDeps, args: Record<string, unknown>) {
  if (!deps.runStoryboardParse) throw new Error("当前 MkBoard 版本不支持通过 MCP 运行 AI 解析分镜。");
  const projectId = resolveProjectId(deps, args);
  if (!htmlToPlainText(deps.store.getProject(projectId).scriptHtml)) throw new Error("项目脚本为空。请先用 update_script 写入脚本，再拆分镜。");
  const view = deps.getActiveView();
  const agentCliId: AgentCliId = args.agent === "codex" || args.agent === "claude-code" ? args.agent : view.agentCliId ?? "codex";
  const instructions = typeof args.instructions === "string" && args.instructions.trim() ? args.instructions.trim() : undefined;
  // The run is registered synchronously, so the window can pick it up before the CLI finishes.
  const run = deps.runStoryboardParse({ projectId, agentCliId, instructions, interfaceLanguage: view.interfaceLanguage });
  deps.notifyProjectChanged(projectId, "split_storyboard_started");
  await run;
  deps.notifyProjectChanged(projectId, "split_storyboard");
  const next = deps.store.getProject(projectId);
  return { agent: agentCliId, shotCount: next.rows.length, rows: next.rows.map((row, index) => serializeRow(row, index, next)) };
}

function readProject(deps: McpHostDeps, args: Record<string, unknown>) {
  const projectId = resolveProjectId(deps, args);
  const detail = deps.store.getProject(projectId);
  const include = new Set(readStringArray(args.include).filter((item) => item === "script" || item === "storyboard" || item === "assets"));
  if (include.size === 0) {
    include.add("script");
    include.add("storyboard");
  }
  return serializeProject(detail, include);
}

function updateScript(deps: McpHostDeps, args: Record<string, unknown>) {
  const projectId = resolveProjectId(deps, args);
  const scriptHtml = typeof args.scriptHtml === "string" && args.scriptHtml.trim() ? args.scriptHtml : typeof args.scriptText === "string" ? plainTextToScriptHtml(args.scriptText) : "";
  if (!scriptHtml.trim()) throw new Error("请提供 scriptHtml 或 scriptText。");
  applyOperations(deps, projectId, [{ type: "update_script", scriptHtml }], "update_script");
  return { updated: true, scriptText: htmlToPlainText(deps.store.getProject(projectId).scriptHtml) };
}

function replaceStoryboard(deps: McpHostDeps, args: Record<string, unknown>) {
  const projectId = resolveProjectId(deps, args);
  const detail = deps.store.getProject(projectId);
  const drafts = readRecordArray(args.rows);
  if (drafts.length === 0) throw new Error("rows 不能为空。");
  if (drafts.length > 300) throw new Error("一次最多写入 300 个分镜。");
  const rows = normalizeRows(drafts.map((draft) => mapDraftCustomValues(draft, detail.columns)), detail.columns);
  deps.store.replaceRowsAfterStoryboardParse(projectId, rows.map((row) => ({ ...row, id: "" })));
  deps.notifyProjectChanged(projectId, "replace_storyboard");
  const next = deps.store.getProject(projectId);
  return { shotCount: next.rows.length, rows: next.rows.map((row, index) => serializeRow(row, index, next)) };
}

function insertShots(deps: McpHostDeps, args: Record<string, unknown>) {
  const projectId = resolveProjectId(deps, args);
  const detail = deps.store.getProject(projectId);
  const drafts = readRecordArray(args.rows).map((draft) => mapDraftCustomValues(draft, detail.columns));
  if (drafts.length === 0) throw new Error("rows 不能为空。");
  if (drafts.length > 100) throw new Error("一次最多插入 100 个分镜。");
  const anchor = args.row === undefined || args.row === null || args.row === "" ? null : toRowRef(args.row);
  const placement = anchor ? (args.placement === "before" ? "before" : args.placement === "end" ? "end" : "after") : "end";
  let anchorIndex = anchor && placement !== "end" ? detail.rows.findIndex((row) => row.id === resolveAgentRowRef(deps.store, projectId, anchor)) + 1 : 0;
  const beforeIds = new Set(detail.rows.map((row) => row.id));

  const operations: AgentOperation[] = [];
  for (let start = 0; start < drafts.length; start += MAX_INSERT_CHUNK) {
    const chunk = drafts.slice(start, start + MAX_INSERT_CHUNK);
    const raw: Record<string, unknown> = { type: "insert_shots", count: chunk.length, rows: chunk, placement };
    if (placement !== "end") raw.rowRef = { kind: "index", value: anchorIndex };
    operations.push(requireOperation(raw, detail.columns));
    // after: next chunk goes after the last inserted row; before: the anchor shifted down by chunk size.
    if (placement !== "end") anchorIndex += chunk.length;
  }
  applyOperations(deps, projectId, operations, "insert_shots");
  const next = deps.store.getProject(projectId);
  const inserted = next.rows.map((row, index) => ({ row, index })).filter(({ row }) => !beforeIds.has(row.id));
  return { insertedCount: inserted.length, shotCount: next.rows.length, inserted: inserted.map(({ row, index }) => serializeRow(row, index, next)) };
}

function updateShotCells(deps: McpHostDeps, args: Record<string, unknown>) {
  const projectId = resolveProjectId(deps, args);
  const detail = deps.store.getProject(projectId);
  const updates = readRecordArray(args.updates);
  if (updates.length === 0) throw new Error("updates 不能为空。");
  const operations = updates.map((update) => {
    const cells = readRecordArray(update.cells).map((cell) => ({
      field: mapFieldToColumnId(typeof cell.field === "string" ? cell.field : "", detail.columns),
      value: typeof cell.value === "number" ? String(cell.value) : typeof cell.value === "string" ? cell.value : ""
    }));
    return requireOperation({ type: "update_shot_cells", rowRef: toRowRef(update.row), cells }, detail.columns);
  });
  const touchedRowIds = operations.map((operation) => (operation.type === "update_shot_cells" ? resolveAgentRowRef(deps.store, projectId, operation.rowRef) : ""));
  applyOperations(deps, projectId, operations, "update_shot_cells");
  const next = deps.store.getProject(projectId);
  return {
    updatedCount: operations.length,
    rows: next.rows.map((row, index) => ({ row, index })).filter(({ row }) => touchedRowIds.includes(row.id)).map(({ row, index }) => serializeRow(row, index, next))
  };
}

function applyRowListOperation(deps: McpHostDeps, args: Record<string, unknown>, type: "delete_shots" | "duplicate_shots") {
  const projectId = resolveProjectId(deps, args);
  const detail = deps.store.getProject(projectId);
  const rowRefs = readRowList(args.rows);
  if (rowRefs.length === 0) throw new Error("rows 不能为空。");
  applyOperations(deps, projectId, [requireOperation({ type, rowRefs }, detail.columns)], type);
  const next = deps.store.getProject(projectId);
  return { shotCount: next.rows.length, rows: next.rows.map((row, index) => ({ index: index + 1, id: row.id, content: row.content })) };
}

function reorderShot(deps: McpHostDeps, args: Record<string, unknown>) {
  const projectId = resolveProjectId(deps, args);
  const detail = deps.store.getProject(projectId);
  const operation = requireOperation(
    { type: "reorder_shot", rowRef: toRowRef(args.row), targetRowRef: toRowRef(args.target), placement: args.placement === "before" ? "before" : "after" },
    detail.columns
  );
  applyOperations(deps, projectId, [operation], "reorder_shot");
  const next = deps.store.getProject(projectId);
  return { rows: next.rows.map((row, index) => ({ index: index + 1, id: row.id, content: row.content })) };
}

async function importShotMedia(deps: McpHostDeps, args: Record<string, unknown>) {
  const projectId = resolveProjectId(deps, args);
  const rowId = resolveAgentRowRef(deps.store, projectId, toRowRef(args.row));
  const filePaths = readStringArray(args.filePaths);
  const urls = readStringArray(args.urls);
  if (filePaths.length === 0 && urls.length === 0) throw new Error("请提供 filePaths 或 urls。");
  filePaths.forEach(assertReadableAbsoluteFile);

  const downloadDir = join(deps.downloadsDir, randomUUID());
  try {
    const downloadedPaths = await downloadUrls(urls, downloadDir, deps.fetchImpl ?? fetch);
    const sourcePaths = [...filePaths, ...downloadedPaths];
    const previousIds = currentShotMediaIds(deps.store.getProject(projectId), rowId);
    const replace = args.mode === "replace";
    if (replace) deps.store.updateShotMedia(projectId, rowId, []);
    const result = await deps.store.importShotMediaPaths(projectId, rowId, sourcePaths);
    const nextIds = mediaIdsFromRows(result.rows, rowId);
    const importedIds = replace ? nextIds : nextIds.filter((assetId) => !previousIds.includes(assetId));
    if (replace && nextIds.length === 0) deps.store.updateShotMedia(projectId, rowId, previousIds);
    deps.notifyProjectChanged(projectId, "import_shot_media");
    const next = deps.store.getProject(projectId);
    const rowIndex = next.rows.findIndex((row) => row.id === rowId);
    return {
      importedCount: importedIds.length,
      skippedCount: Math.max(0, sourcePaths.length - importedIds.length),
      note: importedIds.length < sourcePaths.length ? "部分文件未导入：只支持图片/视频，重复文件会复用已有素材，每个分镜最多 10 个素材。" : undefined,
      row: rowIndex >= 0 ? serializeRow(next.rows[rowIndex], rowIndex, next) : null
    };
  } finally {
    rmSync(downloadDir, { recursive: true, force: true });
  }
}

function setShotMedia(deps: McpHostDeps, args: Record<string, unknown>) {
  const projectId = resolveProjectId(deps, args);
  const detail = deps.store.getProject(projectId);
  const operation = requireOperation({ type: "update_shot_media", rowRef: toRowRef(args.row), assetIds: readStringArray(args.assetIds) }, detail.columns);
  applyOperations(deps, projectId, [operation], "set_shot_media");
  const rowId = operation.type === "update_shot_media" ? resolveAgentRowRef(deps.store, projectId, operation.rowRef) : "";
  const next = deps.store.getProject(projectId);
  const rowIndex = next.rows.findIndex((row) => row.id === rowId);
  return { row: rowIndex >= 0 ? serializeRow(next.rows[rowIndex], rowIndex, next) : null };
}

async function importAssets(deps: McpHostDeps, args: Record<string, unknown>) {
  const projectId = resolveProjectId(deps, args);
  const filePaths = readStringArray(args.filePaths);
  if (filePaths.length === 0) throw new Error("filePaths 不能为空。");
  filePaths.forEach(assertReadableAbsoluteFile);
  const beforeIds = new Set(deps.store.getProject(projectId).assets.map((asset) => asset.id));
  const assets = await deps.store.importAssetPaths(projectId, filePaths);
  deps.notifyProjectChanged(projectId, "import_assets");
  const imported = assets.filter((asset) => !beforeIds.has(asset.id));
  return { importedCount: imported.length, assets: imported.map(serializeAsset) };
}

const CUSTOM_COLUMN_TYPES: StoryboardColumnType[] = ["text", "select", "number"];

// Mirrors the storyboard column menu: add custom columns, rename, change type, show/hide, delete and reorder.
// Locked columns (镜号) cannot be hidden, deleted or moved, exactly like in the app.
function updateColumns(deps: McpHostDeps, args: Record<string, unknown>) {
  const projectId = resolveProjectId(deps, args);
  const detail = deps.store.getProject(projectId, deps.getActiveView().interfaceLanguage);
  let columns = detail.columns.map((column) => ({ ...column }));
  const findColumn = (ref: unknown) => {
    const id = mapFieldToColumnId(typeof ref === "string" ? ref : "", columns);
    const column = columns.find((item) => item.id === id && item.id !== "sort");
    if (!column) throw new Error(`找不到列 ${String(ref)}。请先调用 read_project 查看列 id 和名称。`);
    return column;
  };
  const readType = (value: unknown): StoryboardColumnType => {
    if (value === undefined) return "text";
    if (!CUSTOM_COLUMN_TYPES.includes(value as StoryboardColumnType)) throw new Error(`列类型只能是 ${CUSTOM_COLUMN_TYPES.join(" / ")}。`);
    return value as StoryboardColumnType;
  };

  const removals = Array.isArray(args.remove) ? args.remove : [];
  const updates = readRecordArray(args.update);
  const additions = readRecordArray(args.add);
  const order = Array.isArray(args.order) ? args.order : [];
  if (removals.length + updates.length + additions.length + order.length === 0) throw new Error("请提供 add、update、remove 或 order。");

  for (const update of updates) {
    const column = findColumn(update.column);
    if (update.label !== undefined) column.label = requireString(update.label, "label");
    if (update.type !== undefined) {
      if (!column.custom) throw new Error(`只有自定义列能改类型：${column.label}。`);
      column.type = readType(update.type);
    }
    if (update.visible !== undefined) {
      if (column.locked) throw new Error(`锁定列不能隐藏：${column.label}。`);
      column.visible = update.visible === true;
    }
  }

  for (const ref of removals) {
    const column = findColumn(ref);
    if (column.locked) throw new Error(`锁定列不能删除：${column.label}。`);
    columns = columns.filter((item) => item.id !== column.id);
  }

  for (const addition of additions) {
    const index = nextCustomColumnIndex(columns);
    columns.push({ id: `custom-${index}` as StoryboardColumnId, label: requireString(addition.label, "label"), type: readType(addition.type), visible: true, custom: true });
  }

  if (order.length > 0) {
    const ordered = order.map(findColumn);
    if (ordered.some((column) => column.locked)) throw new Error("锁定列不能移动。");
    const orderedIds = new Set(ordered.map((column) => column.id));
    const movable = [...ordered, ...columns.filter((column) => !column.locked && column.id !== "sort" && !orderedIds.has(column.id))];
    let cursor = 0;
    // Locked columns and the sort handle keep their slots; every other slot takes the next column in the new order.
    columns = columns.map((column) => (column.locked || column.id === "sort" ? column : movable[cursor++]));
  }

  deps.store.saveColumns(projectId, columns);
  deps.notifyProjectChanged(projectId, "update_columns");
  return { columns: serializeColumns(deps.store.getProject(projectId, deps.getActiveView().interfaceLanguage).columns) };
}

function nextCustomColumnIndex(columns: StoryboardColumn[]): number {
  return (
    columns.reduce((maxIndex, column) => {
      if (!column.id.startsWith("custom-")) return maxIndex;
      const parsed = Number(column.id.replace("custom-", ""));
      return Number.isFinite(parsed) ? Math.max(maxIndex, parsed) : maxIndex;
    }, 0) + 1
  );
}

function renameAsset(deps: McpHostDeps, args: Record<string, unknown>) {
  const projectId = resolveProjectId(deps, args);
  const asset = requireAsset(deps, projectId, args.assetId);
  const result = deps.store.renameAsset(projectId, asset.id, requireString(args.name, "name"));
  deps.notifyProjectChanged(projectId, "rename_asset");
  const next = result.assets.find((item) => item.id === asset.id);
  return { asset: next ? serializeAsset(next) : null };
}

async function replaceAsset(deps: McpHostDeps, args: Record<string, unknown>) {
  const projectId = resolveProjectId(deps, args);
  const asset = requireAsset(deps, projectId, args.assetId);
  const filePath = requireString(args.filePath, "filePath");
  assertReadableAbsoluteFile(filePath);
  const result = await deps.store.replaceAssetPath(projectId, asset.id, filePath);
  deps.notifyProjectChanged(projectId, "replace_asset");
  const next = result.assets.find((item) => item.id === asset.id);
  return {
    asset: next ? serializeAsset(next) : null,
    note: next && next.kind !== "image" && next.kind !== "video" ? "新文件不是图片/视频，已从分镜画面中移除。" : undefined
  };
}

function deleteAssets(deps: McpHostDeps, args: Record<string, unknown>) {
  const projectId = resolveProjectId(deps, args);
  const assetIds = readStringArray(args.assetIds);
  if (assetIds.length === 0) throw new Error("assetIds 不能为空。");
  const existing = new Set(deps.store.getProject(projectId).assets.map((asset) => asset.id));
  const missing = assetIds.filter((assetId) => !existing.has(assetId));
  if (missing.length > 0) throw new Error(`找不到素材：${missing.join("、")}。请先调用 read_project include=assets。`);
  const result = deps.store.deleteAssets(projectId, assetIds);
  deps.notifyProjectChanged(projectId, "delete_assets");
  return { deletedCount: assetIds.length, remainingAssetCount: result.assets.length };
}

function requireAsset(deps: McpHostDeps, projectId: string, assetId: unknown): ProjectAsset {
  const id = requireString(assetId, "assetId");
  const asset = deps.store.getProject(projectId).assets.find((item) => item.id === id);
  if (!asset) throw new Error(`找不到素材 ${id}。请先调用 read_project include=assets。`);
  return asset;
}

const SPEECH_ERROR_MESSAGES: Record<ElevenLabsErrorCode, string> = {
  sign_in_required: "请先在 MkBoard 里登录账号，配音要用账号里保存的 ElevenLabs API Key。",
  not_configured: "还没有配置 ElevenLabs API Key。请在 MkBoard 设置 → 配音里填写。",
  invalid_key: "ElevenLabs API Key 无效，请在 MkBoard 设置 → 配音里更新。",
  quota_exceeded: "ElevenLabs 额度不足，请检查 ElevenLabs 账号。",
  text_too_long: "单段文字太长，ElevenLabs 拒绝了请求。",
  network_error: "连接 ElevenLabs 失败，请检查网络后重试。",
  request_failed: "ElevenLabs 生成失败，请稍后重试。"
};
const MAX_VOICEOVER_CHARACTERS = 30_000;
const MAX_VOICEOVER_SHOTS = 100;
// generate_voiceover asks ElevenLabs for mp3_44100_128, so the byte count gives the duration.
const VOICEOVER_BYTES_PER_SECOND = 128_000 / 8;

async function listVoices(deps: McpHostDeps) {
  if (!deps.speech) throw new Error("当前 MkBoard 版本不支持通过 MCP 配音。");
  const status = await deps.speech.getStatus();
  if (!status.configured) return { configured: false, voices: [], hint: SPEECH_ERROR_MESSAGES.not_configured };
  const result = await deps.speech.listVoices();
  if (!result.ok) throw new Error(SPEECH_ERROR_MESSAGES[result.error]);
  return {
    configured: true,
    defaultVoiceId: deps.getActiveView().speechVoiceId || null,
    voices: result.voices.map((voice) => ({
      voiceId: voice.voiceId,
      name: voice.name,
      category: voice.category,
      personal: voice.isPersonal,
      gender: voice.gender,
      language: voice.language,
      accent: voice.accent,
      description: voice.description,
      useCase: voice.useCase
    }))
  };
}

type VoiceoverItem = { text: string; fileName: string; row?: { index: number; id: string } };

async function generateVoiceover(deps: McpHostDeps, args: Record<string, unknown>) {
  const speech = deps.speech;
  if (!speech) throw new Error("当前 MkBoard 版本不支持通过 MCP 配音。");
  const projectId = resolveProjectId(deps, args);
  const view = deps.getActiveView();
  const english = view.interfaceLanguage === "en";
  const voiceId = (typeof args.voiceId === "string" && args.voiceId.trim()) || view.speechVoiceId || "";
  if (!voiceId) throw new Error("没有可用的配音音色：请传 voiceId（用 list_voices 查），或先在 MkBoard 设置 → 配音里选默认音色。");

  const detail = deps.store.getProject(projectId);
  const source = args.source === "shots" || args.source === "text" || args.source === "script" ? args.source : Array.isArray(args.rows) ? "shots" : "script";
  const customName = typeof args.fileName === "string" ? args.fileName.trim().replace(/\.mp3$/iu, "") : "";
  const items: VoiceoverItem[] = [];
  if (source === "script") {
    const text = stripScriptHtmlToPlainText(detail.scriptHtml);
    if (!text) throw new Error("项目脚本为空，没有可配音的文字。");
    items.push({ text, fileName: customName || (english ? "voiceover-script" : "配音-脚本") });
  } else if (source === "text") {
    const text = typeof args.text === "string" ? args.text.trim() : "";
    if (!text) throw new Error("source=text 时请提供 text。");
    items.push({ text, fileName: customName || (english ? "voiceover" : "配音") });
  } else {
    const rowIds = Array.isArray(args.rows) && args.rows.length > 0 ? readRowList(args.rows).map((ref) => resolveAgentRowRef(deps.store, projectId, ref)) : null;
    detail.rows.forEach((row, index) => {
      if (rowIds && !rowIds.includes(row.id)) return;
      const text = getSpokenTextFromCell(row.content);
      if (!text) return;
      const number = String(index + 1).padStart(2, "0");
      items.push({ text, fileName: english ? `voiceover-shot-${number}` : `配音-镜头${number}`, row: { index: index + 1, id: row.id } });
    });
    if (items.length === 0) throw new Error("选中的分镜没有可配音的内容（内容列为空）。");
    if (items.length > MAX_VOICEOVER_SHOTS) throw new Error(`一次最多给 ${MAX_VOICEOVER_SHOTS} 个分镜配音，请用 rows 分批。`);
  }
  const characters = items.reduce((total, item) => total + item.text.length, 0);
  if (characters > MAX_VOICEOVER_CHARACTERS) throw new Error(`一次最多配音 ${MAX_VOICEOVER_CHARACTERS} 字（这次 ${characters} 字），请分批。`);

  const workDir = join(deps.downloadsDir, randomUUID());
  const outputs = [];
  try {
    for (const item of items) {
      const chunks: Buffer[] = [];
      let cachedSegments = 0;
      // Same segmentation as the in-app 配音 player, so both share ElevenLabs' local cache.
      const segments = splitTextIntoSpeechSegments(item.text);
      for (const segment of segments) {
        const result = await speech.synthesize({ text: segment, voiceId });
        if (!result.ok) {
          const where = item.row ? `第 ${item.row.index} 个分镜` : "配音";
          throw new Error(`${where}生成失败：${SPEECH_ERROR_MESSAGES[result.error]}${result.message ? `（${result.message}）` : ""}${outputs.length ? ` 已完成 ${outputs.length} 段并放进素材库。` : ""}`);
        }
        if (result.cached) cachedSegments += 1;
        chunks.push(result.audio);
      }
      const audio = joinMp3Chunks(chunks);
      mkdirSync(workDir, { recursive: true });
      const filePath = join(workDir, `${sanitizeExportFileName(item.fileName)}.mp3`);
      writeFileSync(filePath, audio);
      const asset = await importAudioAsset(deps, projectId, filePath, audio);
      outputs.push({
        ...(item.row ? { row: item.row } : {}),
        characters: item.text.length,
        segments: segments.length,
        reusedCachedSegments: cachedSegments,
        estimatedDurationSeconds: Math.round((audio.byteLength / VOICEOVER_BYTES_PER_SECOND) * 10) / 10,
        asset: asset ? serializeAsset(asset) : null
      });
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
    if (outputs.length > 0) deps.notifyProjectChanged(projectId, "generate_voiceover");
  }
  return {
    voiceId,
    source,
    characters,
    outputs,
    note: "配音 MP3 已放进项目素材库（音频不会挂到分镜画面格）。用的是用户自己的 ElevenLabs Key，不消耗 MkBoard 积分。"
  };
}

async function importAudioAsset(deps: McpHostDeps, projectId: string, filePath: string, audio: Buffer): Promise<ProjectAsset | null> {
  const beforeIds = new Set(deps.store.getProject(projectId).assets.map((asset) => asset.id));
  const assets = await deps.store.importAssetPaths(projectId, [filePath]);
  const added = assets.find((asset) => !beforeIds.has(asset.id));
  if (added) return added;
  // Identical audio is de-duplicated by content hash; return the asset that already holds it.
  return (
    assets.find((asset) => {
      try {
        return existsSync(asset.localPath) && statSync(asset.localPath).size === audio.byteLength && readFileSync(asset.localPath).equals(audio);
      } catch {
        return false;
      }
    }) ?? null
  );
}

// ElevenLabs returns one MP3 per segment. MP3 frames concatenate cleanly once per-file ID3 tags are dropped
// from the middle of the stream (ID3v2 at the start of later chunks, ID3v1 at the end of earlier ones).
export function joinMp3Chunks(chunks: Buffer[]): Buffer {
  if (chunks.length <= 1) return chunks[0] ?? Buffer.alloc(0);
  return Buffer.concat(
    chunks.map((chunk, index) => {
      let start = 0;
      let end = chunk.byteLength;
      if (index > 0 && chunk.byteLength >= 10 && chunk.toString("latin1", 0, 3) === "ID3") {
        const size = ((chunk[6] & 0x7f) << 21) | ((chunk[7] & 0x7f) << 14) | ((chunk[8] & 0x7f) << 7) | (chunk[9] & 0x7f);
        const footer = (chunk[5] & 0x10) !== 0 ? 10 : 0;
        start = Math.min(chunk.byteLength, 10 + size + footer);
      }
      if (index < chunks.length - 1 && end - start >= 128 && chunk.toString("latin1", end - 128, end - 125) === "TAG") end -= 128;
      return chunk.subarray(start, end);
    })
  );
}

// The storyboard toolbar estimates 8 credits per image; the cloud reserves the exact amount on submit.
const IMAGE_CREDITS_PER_SHOT = 8;
const DEFAULT_GENERATION_WAIT_SECONDS = 300;
// Stays under the stdio server's 10-minute tool timeout.
const MAX_GENERATION_WAIT_SECONDS = 540;
const GENERATION_POLL_INTERVAL_MS = 3000;

const CLOUD_ERROR_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: "请先在 MkBoard 里登录账号。",
  SUBSCRIPTION_REQUIRED: "这项生成需要 MkBoard 会员。",
  INSUFFICIENT_CREDITS: "MkBoard 积分不足。",
  PROJECT_LIMIT_REACHED: "免费版项目数已满，需要升级或永久删除不用的项目后才能生成。"
};

function requireGeneration(deps: McpHostDeps): McpGenerationService {
  if (!deps.generation) throw new Error("当前 MkBoard 版本不支持通过 MCP 生成图片/视频。");
  return deps.generation;
}

async function requireSignedInAccount(generation: McpGenerationService) {
  const account = await generation.getAccount();
  if (!account.ok) throw new Error(`读取 MkBoard 账号失败：${account.message}`);
  if (!account.signedIn) throw new Error(CLOUD_ERROR_MESSAGES.UNAUTHORIZED);
  return account;
}

function cloudErrorMessage(error: { code: string; message: string; details?: unknown }): string {
  const known = CLOUD_ERROR_MESSAGES[error.code];
  const shortage = error.code === "INSUFFICIENT_CREDITS" && isRecord(error.details) ? Number(error.details.shortage) : 0;
  if (known) return `${known}${shortage > 0 ? `还差 ${shortage} 积分。` : ""}${error.message && error.message !== known ? `（${error.message}）` : ""}`;
  return error.message || "MkBoard 云端生成提交失败。";
}

function isTransientCloudError(code: string): boolean {
  const normalized = code.trim().toUpperCase();
  if (normalized === "NETWORK_TIMEOUT" || normalized === "NETWORK_ERROR") return true;
  const status = Number(/^HTTP_(\d{3})$/.exec(normalized)?.[1] ?? 0);
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function readGenerationMode(args: Record<string, unknown>, hasRows: boolean): StoryboardMediaGenerationMode {
  if (args.mode === "all" || args.mode === "missing") return args.mode;
  return hasRows || args.overwrite === true ? "all" : "missing";
}

function readWaitMs(args: Record<string, unknown>): number {
  const seconds = typeof args.waitSeconds === "number" && Number.isFinite(args.waitSeconds) ? args.waitSeconds : DEFAULT_GENERATION_WAIT_SECONDS;
  return Math.max(0, Math.min(MAX_GENERATION_WAIT_SECONDS, seconds)) * 1000;
}

function readRequestedRowIds(deps: McpHostDeps, projectId: string, value: unknown): Set<string> | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  return new Set(readRowList(value).map((ref) => resolveAgentRowRef(deps.store, projectId, ref)));
}

function shotLabel(detail: ProjectDetail, rowId: string | null | undefined) {
  const index = rowId ? detail.rows.findIndex((row) => row.id === rowId) : -1;
  return { shot: index >= 0 ? index + 1 : null, rowId: rowId ?? null };
}

function pause(deps: McpHostDeps, ms: number): Promise<void> {
  return deps.sleep ? deps.sleep(ms) : new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function getCredits(deps: McpHostDeps) {
  const account = await requireGeneration(deps).getAccount();
  if (!account.ok) throw new Error(`读取 MkBoard 账号失败：${account.message}`);
  return {
    signedIn: account.signedIn,
    creditsAvailable: account.creditsAvailable,
    isPaid: account.isPaid,
    features: { images: account.canUseImages, seedance: account.canUseSeedance, hyperframes: account.canUseHyperframes },
    pricing: { imagePerShot: IMAGE_CREDITS_PER_SHOT, seedancePerSecond: { "720p": seedanceVideoCreditsPerSecond("720p"), "1080p": seedanceVideoCreditsPerSecond("1080p") }, hyperframes: 0 }
  };
}

async function generateShotImages(deps: McpHostDeps, args: Record<string, unknown>) {
  const generation = requireGeneration(deps);
  const projectId = resolveProjectId(deps, args);
  const view = deps.getActiveView();
  const detail = deps.store.getProject(projectId, view.interfaceLanguage);
  const requestedRowIds = readRequestedRowIds(deps, projectId, args.rows);
  const mode = readGenerationMode(args, Boolean(requestedRowIds));
  const overwriteExisting = args.overwrite === true;
  const columns = ensureStoryboardPromptColumns(detail.columns, view.interfaceLanguage);
  const candidates = buildStoryboardImageGenerationCandidates(detail.rows, columns, detail.imageRatio).filter(
    (target) => !requestedRowIds || requestedRowIds.has(target.rowId)
  );
  const scoped = filterStoryboardGenerationTargetsByMode(candidates, detail.rows, detail.assets, "image", mode);
  const targets = scoped.filter((target) => target.prompt).map(({ method: _method, ...target }) => target);
  const missingPrompt = scoped.filter((target) => !target.prompt).map((target) => shotLabel(detail, target.rowId).shot);
  const notImageShots = requestedRowIds
    ? [...requestedRowIds].filter((rowId) => !candidates.some((target) => target.rowId === rowId)).map((rowId) => shotLabel(detail, rowId).shot)
    : [];
  const plan = {
    mode,
    shots: targets.map((target) => shotLabel(detail, target.rowId).shot),
    estimatedCredits: targets.length * IMAGE_CREDITS_PER_SHOT,
    skipped: {
      missingPrompt,
      notImageShots,
      alreadyHaveImage: mode === "missing" ? candidates.length - scoped.length : 0
    }
  };
  if (targets.length === 0) {
    throw new Error(
      missingPrompt.length > 0
        ? `第 ${missingPrompt.join("、")} 镜还没有图像提示词。先用 update_shot_cells 写好图像提示词，再生成。`
        : mode === "missing"
          ? "没有缺图的分镜。要重新生成已有图片，传 rows 或 mode: \"all\"。"
          : "没有可生成图片的分镜：A-ROLL 和生成方式为 Hyperframes / 自定义的分镜不生成图片。"
    );
  }
  const account = await requireSignedInAccount(generation);
  if (account.creditsAvailable !== null && account.creditsAvailable < plan.estimatedCredits) {
    throw new Error(`MkBoard 积分不足：本次预计 ${plan.estimatedCredits}，当前可用 ${account.creditsAvailable}。`);
  }
  if (args.dryRun === true) return { dryRun: true, creditsAvailable: account.creditsAvailable, ...plan };

  const submitted = await generation.submitImages({ projectId, overwriteExisting, items: targets });
  if (!submitted.ok) throw new Error(cloudErrorMessage(submitted.error));
  deps.notifyProjectChanged(projectId, "generation_started");

  const deadline = Date.now() + readWaitMs(args);
  let latest: StoryboardImageBatchSyncResult | null = null;
  let importedCount = 0;
  for (;;) {
    const synced = await generation.syncImageBatch({ projectId, cloudProjectId: submitted.data.cloudProjectId, batchId: submitted.data.batchId, overwriteExisting });
    if (synced.ok) {
      latest = synced.data;
      importedCount += synced.data.importedCount;
      if (synced.data.importedCount > 0) deps.notifyProjectChanged(projectId, "generate_shot_images");
      if (synced.data.pendingCount === 0) break;
    } else if (!isTransientCloudError(synced.error.code)) {
      throw new Error(`图片已提交，但同步结果失败：${cloudErrorMessage(synced.error)} 稍后可调用 get_generation_status。`);
    }
    if (Date.now() + GENERATION_POLL_INTERVAL_MS > deadline) break;
    await pause(deps, GENERATION_POLL_INTERVAL_MS);
  }
  const next = deps.store.getProject(projectId);
  const pendingCount = latest ? latest.pendingCount : targets.length;
  return {
    batchId: submitted.data.batchId,
    submittedCount: submitted.data.submittedCount,
    creditsReserved: submitted.data.creditsReserved,
    finished: pendingCount === 0,
    succeededCount: latest?.succeededCount ?? 0,
    failedCount: (latest?.failedCount ?? 0) + (latest?.localImportFailedCount ?? 0),
    pendingCount,
    importedCount,
    shots: (latest?.tasks ?? submitted.data.tasks).map((task) => summarizeImageTask(next, task)),
    hint: pendingCount > 0 ? "还有图片在生成，MkBoard 会继续跑；稍后调用 get_generation_status 把结果导入分镜。" : undefined
  };
}

function summarizeImageTask(detail: ProjectDetail, task: StoryboardImageTaskSummary) {
  const asset = task.resultAssetId ? detail.assets.find((item) => item.id === task.resultAssetId) : detail.assets.find((item) => item.id === task.taskId);
  return {
    ...shotLabel(detail, task.rowId),
    status: task.status,
    ...(asset ? { asset: serializeAsset(asset) } : {}),
    ...(task.errorMessage ? { error: task.errorMessage } : {})
  };
}

async function generateShotVideos(deps: McpHostDeps, args: Record<string, unknown>) {
  const generation = requireGeneration(deps);
  const projectId = resolveProjectId(deps, args);
  const view = deps.getActiveView();
  const detail = deps.store.getProject(projectId, view.interfaceLanguage);
  const requestedRowIds = readRequestedRowIds(deps, projectId, args.rows);
  const mode = readGenerationMode(args, Boolean(requestedRowIds));
  const overwriteExisting = args.overwrite === true;
  const methodFilter: StoryboardVideoGenerationMethodFilter = args.method === "seedance" || args.method === "hyperframes" ? args.method : "all";
  const seedanceResolution = readOption(args.seedanceResolution, seedanceVideoResolutionValues, "seedanceResolution") ?? view.seedanceResolution ?? "720p";
  const hyperframesResolution = readOption(args.hyperframesResolution, hyperframesVideoResolutionValues, "hyperframesResolution") ?? view.hyperframesResolution ?? "1080p";
  const seedanceAspectRatio = readOption(args.seedanceAspectRatio, seedanceAspectRatioValues, "seedanceAspectRatio");
  const columns = ensureStoryboardPromptColumns(detail.columns, view.interfaceLanguage);

  let candidates = buildStoryboardVideoGenerationCandidates(detail.rows, columns, detail.imageRatio, hyperframesResolution, seedanceResolution).filter(
    (target) => !requestedRowIds || requestedRowIds.has(target.rowId)
  );
  if (seedanceAspectRatio && isSeedanceAspectRatio(seedanceAspectRatio)) {
    candidates = applyAgentSeedanceAspectRatioOverrides(candidates, new Map(candidates.map((target) => [target.rowId, seedanceAspectRatio])));
  }
  const byMethod = filterStoryboardVideoTargetsByMethod(candidates, methodFilter);
  const scoped = filterStoryboardGenerationTargetsByMode(byMethod, detail.rows, detail.assets, "video", mode);
  const state = await generation.getVideoState(projectId);
  const runningRowIds = new Set(state.tasks.filter((task) => task.status === "queued" || task.status === "running").map((task) => task.rowId));
  const targets = scoped.filter((target) => target.prompt && !runningRowIds.has(target.rowId));
  const missingPrompt = scoped.filter((target) => !target.prompt).map((target) => shotLabel(detail, target.rowId).shot);
  const alreadyRunning = scoped.filter((target) => runningRowIds.has(target.rowId)).map((target) => shotLabel(detail, target.rowId).shot);
  const notVideoShots = requestedRowIds
    ? [...requestedRowIds].filter((rowId) => !candidates.some((target) => target.rowId === rowId)).map((rowId) => shotLabel(detail, rowId).shot)
    : [];
  const estimatedCredits = targets
    .filter((target) => target.method === "Seedance 2.0")
    .reduce((sum, target) => sum + normalizeSeedanceVideoCreditsDuration(target.durationSec) * seedanceVideoCreditsPerSecond(target.seedanceResolution), 0);
  const plan = {
    mode,
    shots: targets.map((target) => ({
      shot: shotLabel(detail, target.rowId).shot,
      method: target.method,
      durationSec: target.durationSec,
      aspectRatio: target.aspectRatio,
      resolution: target.method === "Seedance 2.0" ? target.seedanceResolution : target.hyperframesResolution
    })),
    estimatedCredits,
    skipped: { missingPrompt, alreadyRunning, notVideoShots, alreadyHaveVideo: mode === "missing" ? byMethod.length - scoped.length : 0 }
  };
  if (targets.length === 0) {
    throw new Error(
      missingPrompt.length > 0
        ? `第 ${missingPrompt.join("、")} 镜还没有视频提示词。先用 update_shot_cells 写好视频提示词，再生成。`
        : alreadyRunning.length > 0
          ? `第 ${alreadyRunning.join("、")} 镜已经在生成视频，用 get_generation_status 查看进度。`
          : mode === "missing"
            ? "没有缺视频的分镜。要重新生成，传 rows 或 mode: \"all\"。"
            : "没有可生成视频的分镜：只有生成方式为 Seedance 2.0 或 Hyperframes 的 B-ROLL 分镜会生成视频。"
    );
  }
  const account = await requireSignedInAccount(generation);
  if (estimatedCredits > 0 && account.creditsAvailable !== null && account.creditsAvailable < estimatedCredits) {
    throw new Error(`MkBoard 积分不足：本次预计 ${estimatedCredits}，当前可用 ${account.creditsAvailable}。`);
  }
  if (args.dryRun === true) return { dryRun: true, creditsAvailable: account.creditsAvailable, ...plan };

  const run = generation.runVideos({
    projectId,
    overwriteExisting,
    agentCliId: view.agentCliId ?? "codex",
    hyperframesConcurrency: view.hyperframesConcurrency,
    items: targets
  });
  deps.notifyProjectChanged(projectId, "generation_started");
  // The run keeps going after this call returns; refresh the window when it ends.
  void run.then(
    () => deps.notifyProjectChanged(projectId, "generate_shot_videos"),
    () => deps.notifyProjectChanged(projectId, "generate_shot_videos")
  );
  const finished = await waitWithTimeout(run, readWaitMs(args));
  const next = deps.store.getProject(projectId);
  if (finished) {
    const targetRowIds = new Set(targets.map((target) => target.rowId));
    return {
      finished: true,
      submittedCount: finished.submittedCount,
      succeededCount: finished.succeededCount,
      failedCount: finished.failedCount,
      estimatedCredits,
      shots: finished.tasks.filter((task) => targetRowIds.has(task.rowId)).map((task) => summarizeVideoTask(next, task))
    };
  }
  const latest = await generation.getVideoState(projectId);
  return {
    finished: false,
    submittedCount: targets.length,
    estimatedCredits,
    shots: latest.tasks.filter((task) => targets.some((target) => target.rowId === task.rowId)).map((task) => summarizeVideoTask(next, task)),
    hint: "视频还在生成（Seedance 一般要几分钟，进度在 MkBoard 分镜表里）。稍后调用 get_generation_status 查看结果。"
  };
}

function summarizeVideoTask(detail: ProjectDetail, task: StoryboardVideoTaskSummary | StoryboardActiveVideoGenerationTask) {
  const assetId = task.assetId ?? ("resultAssetId" in task ? task.resultAssetId ?? undefined : undefined);
  const asset = assetId ? detail.assets.find((item) => item.id === assetId) : undefined;
  return {
    ...shotLabel(detail, task.rowId),
    method: task.method,
    status: task.status,
    ...(task.stageLabel && task.status === "running" ? { stage: task.stageLabel } : {}),
    ...(asset ? { asset: serializeAsset(asset) } : {}),
    ...(task.errorMessage ? { error: task.errorMessage } : {})
  };
}

async function getGenerationStatus(deps: McpHostDeps, args: Record<string, unknown>) {
  const generation = requireGeneration(deps);
  const projectId = resolveProjectId(deps, args);
  const images = await generation.syncActiveImages(projectId);
  if (images.ok && images.data.importedCount > 0) deps.notifyProjectChanged(projectId, "generate_shot_images");
  const videos = await generation.getVideoState(projectId);
  const detail = deps.store.getProject(projectId);
  return {
    images: images.ok
      ? {
          pendingCount: images.data.pendingCount,
          succeededCount: images.data.succeededCount,
          failedCount: images.data.failedCount + images.data.localImportFailedCount,
          importedCount: images.data.importedCount,
          shots: images.data.tasks.map((task) => summarizeImageTask(detail, task))
        }
      : { error: cloudErrorMessage(images.error) },
    videos: {
      runningCount: videos.tasks.filter((task) => task.status === "queued" || task.status === "running").length,
      shots: videos.tasks.map((task) => summarizeVideoTask(detail, task))
    }
  };
}

function cancelVideoGeneration(deps: McpHostDeps, args: Record<string, unknown>) {
  const projectId = resolveProjectId(deps, args);
  const cancelled = requireGeneration(deps).cancelVideos(projectId);
  if (cancelled) deps.notifyProjectChanged(projectId, "cancel_video_generation");
  return { cancelled, note: cancelled ? "已中止本项目正在跑的视频生成；云端已开始的任务可能仍会扣除对应积分。" : "这个项目没有正在生成的视频。" };
}

function readOption<T extends string>(value: unknown, options: readonly T[], name: string): T | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (!options.includes(value as T)) throw new Error(`${name} 只能是 ${options.join(" / ")}。`);
  return value as T;
}

async function waitWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolvePromise) => {
    timer = setTimeout(() => resolvePromise(null), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function applyOperations(deps: McpHostDeps, projectId: string, operations: AgentOperation[], tool: string): void {
  try {
    applyConfirmedAgentOperations(deps.store, projectId, operations);
  } finally {
    // Partial writes are possible when a later operation fails; refresh the window either way.
    deps.notifyProjectChanged(projectId, tool);
  }
}

function requireOperation(raw: Record<string, unknown>, columns: StoryboardColumn[]): AgentOperation {
  const operation = normalizeAgentOperation(raw, columns);
  if (!operation) throw new Error(`参数无效：${String(raw.type)}。请先调用 read_project 确认分镜编号、行 id 和列 id。`);
  return operation;
}

function resolveProjectId(deps: McpHostDeps, args: Record<string, unknown>): string {
  const explicit = typeof args.projectId === "string" ? args.projectId.trim() : "";
  if (explicit) return findUserProject(deps, explicit).id;
  const active = deps.getActiveView().projectId;
  if (!active) throw new Error("MkBoard 当前没有打开项目。请传入 projectId，或先用 list_projects + open_project 打开项目。");
  return active;
}

function findUserProject(deps: McpHostDeps, projectId: string): ProjectSummary {
  const project = deps.store.listProjects().find((item) => item.id === projectId);
  if (!project) {
    const other = findAnyUserProjectOrNull(deps, projectId);
    if (other) throw new Error(`项目「${other.name}」${statusLabel(projectStatus(other))}。需要先用 ${projectStatus(other) === "trash" ? "restore_project" : "unarchive_project"} 恢复。`);
    throw new Error(`找不到项目 ${projectId}。`);
  }
  return project;
}

// Lifecycle tools also reach archived and trashed projects; tutorial projects stay out of MCP.
function findAnyUserProject(deps: McpHostDeps, projectId: string): ProjectSummary {
  const project = findAnyUserProjectOrNull(deps, projectId);
  if (!project) throw new Error(`找不到项目 ${projectId}。请先调用 list_projects（status: "all"）。`);
  return project;
}

function findAnyUserProjectOrNull(deps: McpHostDeps, projectId: string): ProjectSummary | null {
  const lists = [deps.store.listProjects(), deps.store.listArchivedProjects?.() ?? [], deps.store.listDeletedProjects?.() ?? []];
  for (const list of lists) {
    const project = list.find((item) => item.id === projectId && item.kind === "user");
    if (project) return project;
  }
  return null;
}

function projectStatus(project: ProjectSummary): ProjectStatus {
  if (project.deletedAt) return "trash";
  if (project.archivedAt) return "archived";
  return "active";
}

function statusLabel(status: ProjectStatus): string {
  return status === "trash" ? "在回收站中" : status === "archived" ? "已归档" : "正在使用";
}

function serializeProject(detail: ProjectDetail, include: Set<string>) {
  return {
    project: { ...summarizeProject(detail.project), imageRatio: detail.imageRatio },
    // The project Taste only drives MkBoard's in-app generation. External agents use their own skills' style.
    styleGuidance: EXTERNAL_STYLE_GUIDANCE,
    ...(include.has("script") ? { script: { html: detail.scriptHtml, text: htmlToPlainText(detail.scriptHtml) } } : {}),
    ...(include.has("storyboard")
      ? {
          columns: serializeColumns(detail.columns),
          shotCount: detail.rows.length,
          rows: detail.rows.map((row, index) => serializeRow(row, index, detail))
        }
      : {}),
    ...(include.has("assets") ? { assets: detail.assets.map(serializeAsset) } : {})
  };
}

function serializeColumns(columns: StoryboardColumn[]) {
  return columns
    .filter((column) => column.id !== "sort")
    .map((column) => ({
      id: column.id,
      label: column.label,
      type: column.type,
      visible: column.visible,
      custom: Boolean(column.custom),
      semantic: getStoryboardPromptColumnKind(column)
    }));
}

function serializeRow(row: StoryboardRow, index: number, detail: ProjectDetail) {
  const assetsById = new Map(detail.assets.map((asset) => [asset.id, asset]));
  const mediaIds = row.imageAssetIds?.length ? row.imageAssetIds : row.imageAssetId ? [row.imageAssetId] : [];
  return {
    index: index + 1,
    id: row.id,
    scene: row.scene,
    duration: row.duration,
    content: row.content,
    note: row.note,
    customValues: row.customValues ?? {},
    media: mediaIds.map((assetId) => {
      const asset = assetsById.get(assetId);
      return asset ? { assetId, name: asset.name, kind: asset.kind, localPath: asset.localPath } : { assetId, missing: true };
    })
  };
}

function serializeAsset(asset: ProjectAsset) {
  return { assetId: asset.id, name: asset.name, kind: asset.kind, size: asset.sizeLabel, localPath: asset.localPath, linkedShot: asset.linkedShot || null };
}

function summarizeProject(project: ProjectSummary) {
  return { id: project.id, name: project.name, status: projectStatus(project), localPath: project.localPath, updatedAt: project.updatedAt };
}

function currentShotMediaIds(detail: ProjectDetail, rowId: string): string[] {
  return mediaIdsFromRows(detail.rows, rowId);
}

function mediaIdsFromRows(rows: StoryboardRow[], rowId: string): string[] {
  const row = rows.find((item) => item.id === rowId);
  if (!row) return [];
  return row.imageAssetIds?.length ? [...row.imageAssetIds] : row.imageAssetId ? [row.imageAssetId] : [];
}

function mapDraftCustomValues(draft: Record<string, unknown>, columns: StoryboardColumn[]): Record<string, unknown> {
  if (!isRecord(draft.customValues)) return draft;
  const customValues: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(draft.customValues)) customValues[mapFieldToColumnId(key, columns)] = value;
  return { ...draft, customValues };
}

export function mapFieldToColumnId(field: string, columns: StoryboardColumn[]): string {
  const trimmed = field.trim();
  if (columns.some((column) => column.id === trimmed)) return trimmed;
  const normalized = trimmed.toLowerCase();
  const byLabel = columns.find((column) => column.label.trim().toLowerCase() === normalized);
  if (byLabel) return byLabel.id;
  const semanticAliases: Record<string, "imagePrompt" | "videoPrompt" | "generationMethod"> = {
    imageprompt: "imagePrompt",
    image_prompt: "imagePrompt",
    videoprompt: "videoPrompt",
    video_prompt: "videoPrompt",
    generationmethod: "generationMethod",
    generation_method: "generationMethod"
  };
  const semantic = semanticAliases[normalized];
  if (semantic) {
    const column = columns.find((item) => getStoryboardPromptColumnKind(item) === semantic);
    if (column) return column.id;
  }
  return trimmed;
}

function toRowRef(value: unknown): AgentRowRef {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return { kind: "index", value };
  if (typeof value === "string") {
    const trimmed = value.trim().replace(/^#/, "");
    if (/^\d+$/.test(trimmed)) return { kind: "index", value: Number.parseInt(trimmed, 10) };
    if (trimmed) return { kind: "id", value: trimmed };
  }
  throw new Error("row 必须是分镜编号（从 1 开始）或 read_project 返回的行 id。");
}

function readRowList(value: unknown): AgentRowRef[] {
  if (!Array.isArray(value)) return [];
  return value.map(toRowRef);
}

async function downloadUrls(urls: string[], directory: string, fetchImpl: typeof fetch): Promise<string[]> {
  const paths: string[] = [];
  for (const [index, rawUrl] of urls.entries()) {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new Error(`无效的 URL：${rawUrl}`);
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error(`只支持 http(s) URL：${rawUrl}`);
    const response = await fetchImpl(url);
    if (!response.ok) throw new Error(`下载失败（HTTP ${response.status}）：${rawUrl}`);
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_DOWNLOAD_BYTES) throw new Error(`文件过大：${rawUrl}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_DOWNLOAD_BYTES) throw new Error(`文件过大：${rawUrl}`);
    mkdirSync(directory, { recursive: true });
    const fileName = downloadFileName(url, response.headers.get("content-type"), index);
    const filePath = join(directory, fileName);
    writeFileSync(filePath, buffer);
    paths.push(filePath);
  }
  return paths;
}

function downloadFileName(url: URL, contentType: string | null, index: number): string {
  const fromPath = basename(decodeURIComponent(url.pathname)).replace(/[^\w.\-一-鿿]+/g, "_");
  if (fromPath && extname(fromPath)) return fromPath;
  const extension = extensionForContentType(contentType);
  return `${fromPath || `download-${index + 1}`}${extension}`;
}

function extensionForContentType(contentType: string | null): string {
  const type = (contentType ?? "").split(";")[0].trim().toLowerCase();
  const map: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/avif": ".avif",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/webm": ".webm"
  };
  return map[type] ?? ".bin";
}

function assertReadableAbsoluteFile(filePath: string): void {
  if (!isAbsolute(filePath)) throw new Error(`请使用绝对路径：${filePath}`);
  if (!existsSync(filePath) || !statSync(filePath).isFile()) throw new Error(`文件不存在：${filePath}`);
}

export function plainTextToScriptHtml(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h[1-6]|li|blockquote|div)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function readTab(value: unknown): WorkspaceTab | null {
  return value === "script" || value === "storyboard" || value === "assets" ? value : null;
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`缺少参数 ${name}。`);
  return value.trim();
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
}

function readRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
