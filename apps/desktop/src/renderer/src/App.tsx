import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Joyride, type Placement, type Step, type TooltipRenderProps } from "react-joyride";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import ByteDanceIcon from "@lobehub/icons/es/ByteDance/components/Color";
import ClaudeCodeIcon from "@lobehub/icons/es/ClaudeCode/components/Color";
import CodexIcon from "@lobehub/icons/es/Codex/components/Color";
import OpenAIIcon from "@lobehub/icons/es/OpenAI/components/Mono";
import tasteMediaUrlMap from "./data/taste-media.json";
import tastePreviewImageUrlMap from "./data/taste-preview-images.json";
import feishuIconSrc from "./assets/feedback/feishu.svg";
import feishuGroupQrSrc from "./assets/feedback/feishu-group-qr.png";
import xLogoSrc from "./assets/feedback/x-logo.png";
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  AudioLines,
  BookOpen,
  Bot,
  Brain,
  Brush,
  Camera,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Clock,
  CircleCheck,
  CirclePlus,
  Coins,
  Compass,
  Copy,
  Download,
  Ellipsis,
  ExternalLink,
  Eye,
  EyeOff,
  Film,
  Flag,
  File as FileIcon,
  FileArchive,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  FolderOpen,
  Grid2X2,
  GripVertical,
  Hash,
  HelpCircle,
  Image,
  Images,
  KeyRound,
  Languages,
  Layers,
  LayoutGrid,
  List,
  ListChecks,
  Lightbulb,
  LoaderCircle,
  Lock,
  LogIn,
  LogOut,
  Map as MapIcon,
  Megaphone,
  MessageCircle,
  Monitor,
  Moon,
  PackageSearch,
  PanelRight,
  Pause,
  Palette,
  Pencil,
  PenTool,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Rocket,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  SquareKanban,
  StickyNote,
  Sun,
  TableProperties,
  Terminal,
  Trash2,
  Type,
  UploadCloud,
  UserPen,
  Video,
  WandSparkles,
  X
} from "lucide-react";
import type * as React from "react";
import { AlertDialog, Button, Input, ListBox, ListBoxItem, Popover, Select as HeroSelect, Tab, Tabs, TextArea } from "@heroui/react";
import { createTranslator, languageOptions, type I18nKey, type InterfaceLanguage, type Translator } from "./i18n";
import {
  inferAgentMediaGenerationPlaceholder,
  type AgentMediaGenerationPlaceholder
} from "../../agent-generation-intent";
import { cn } from "./lib/utils";

import {
  PROMPT_PREVIEW_IMAGE_ASSET_ID_FIELD,
  PROMPT_PREVIEW_IMAGE_HIDDEN_FIELD,
  PROMPT_PREVIEW_VIDEO_ASSET_ID_FIELD,
  PROMPT_PREVIEW_VIDEO_HIDDEN_FIELD,
  STORYBOARD_MEDIA_SELECTION_TOUCHED_FIELD,
  defaultAgentMessage,
  defaultAgentConversationTitle,
  defaultSkillGradientId,
  defaultSkillIconId,
  defaultSystemSkillGradientId,
  defaultSystemSkillIconId,
  ensureStoryboardPromptColumns,
  getDefaultStoryboardColumns,
  getStoryboardTemplateLanguage,
  getTutorialProjectId,
  getVideoResolutionLabel,
  hyperframesVideoResolutionValues,
  seedanceVideoCreditsPerSecond,
  seedanceVideoResolutionValues,
  isAgentNetworkFailureMessage,
  isSeedanceAspectRatio,
  isStoryboardGenerationMethodColumn,
  isStoryboardImagePromptColumn,
  isStoryboardPromptTextColumn,
  isStoryboardVideoPromptColumn,
  isTutorialProjectId,
  legacyDefaultAgentConversationTitles,
  withMkboardR2ImageQuality,
  withMkboardR2VideoOptimization,
  type ActiveStoryboardParseRun,
  type AgentCliId,
  type AgentConversation,
  type AgentEvent,
  type AgentMessage,
  type AgentMessageAttachment,
  type AgentOperation,
  type AgentOperationConfirmation,
  type AgentRowRef,
  type AgentStreamEvent,
  type AssetKind,
  type AgentEffortLevel,
  type AgentPermissionMode,
  type ByokImageProviderId,
  type ByokProviderId,
  type ByokSettingsSnapshot,
  type ByokTestResult,
  type ByokVideoProviderId,
  type CompanionAccessMode,
  type CompanionServerStatus,
  type CodexCliStatus,
  type CreateProjectTemplateInput,
  type CreateSkillInput,
  type DesktopVersionCheckResult,
  type DreaminaAgentRegenerateMediaOperation,
  type ElevenLabsErrorCode,
  type ElevenLabsStatus,
  type ElevenLabsVoice,
  type HyperframesVideoResolution,
  type ImageRatio,
  type LocalCliAgent,
  type McpBridgeStatus,
  type McpOpenProjectRequest,
  type MkboardApi,
  type OnboardingState,
  type OnboardingStepId,
  type ProjectAsset,
  type ProjectChangedExternallyEvent,
  type ProjectDetail,
  type ProjectExportKind,
  type ProjectSkill,
  type ProjectTaste,
  type ProjectSummary,
  type ProjectTemplate,
  type SeedanceAspectRatio,
  type ShotMediaUpdateResult,
  type Skill,
  type Taste,
  type StoryboardCloudGenerationTarget,
  type StoryboardColumn,
  type StoryboardColumnId,
  type StoryboardColumnType,
  type StoryboardColumnWidths,
  type StoryboardImageTaskSummary,
  type StoryboardActiveVideoGenerationTask,
  type StoryboardVideoGenerationEvent,
  type StoryboardVideoGenerationMethod,
  type StoryboardVideoTaskSummary,
  type StoryboardVideoGenerationTarget,
  type SeedanceVideoResolution,
  type StoryboardRow,
  type UpdateShotInput,
  type UpdateSkillInput,
  type UpdateProjectTemplateInput,
  type VideoDimensions,
  type WorkspaceTab,
  getSpokenTextFromCell,
  splitTextIntoSpeechSegments,
  stripScriptHtmlToPlainText
} from "../../shared";
import {
  applyAgentSeedanceAspectRatioOverrides,
  buildStoryboardImageGenerationCandidates,
  buildStoryboardImageGenerationTargets,
  buildStoryboardVideoGenerationCandidates,
  buildStoryboardVideoGenerationTargets,
  filterStoryboardGenerationTargetsByMode,
  filterStoryboardVideoTargetsByMethod,
  getStoryboardCellValue,
  getStoryboardRowMediaAssetIds,
  isArollStoryboardRow,
  normalizeGenerationPromptValue,
  normalizeSeedanceVideoCreditsDuration,
  normalizeStoryboardGenerationMethod,
  storyboardGenerationMethodOptions,
  withSeedanceReferenceGridPrompt,
  type StoryboardGenerationMethod,
  type StoryboardImageGenerationCandidate,
  type StoryboardImageGenerationMethod,
  type StoryboardMediaGenerationMode,
  type StoryboardVideoGenerationMethodFilter
} from "../../storyboard-generation";

type Screen = "projects" | "workspace" | "assets" | "skills" | "taste" | "templates" | "template-create" | "template-edit" | "trash";
type AssetFilter = "all" | "image" | "video" | "audio";
const STORYBOARD_MEDIA_DRAG_TYPE = "application/x-mkboard-storyboard-media-asset-id";
// MCP tools that change a project's lifecycle (see main/mcp/host.ts); the window refreshes its project lists after them.
const MCP_PROJECT_LIFECYCLE_TOOLS = new Set([
  "update_project",
  "archive_project",
  "unarchive_project",
  "delete_project",
  "restore_project",
  "delete_project_permanently"
]);
type SkillFilter = "all" | "system" | "user";
type TemplateFilter = "all" | "system" | "user";
type ConfirmationDialogStatus = "default" | "accent" | "success" | "warning" | "danger";
type ConfirmationDialogConfirmVariant = "primary" | "danger";
type SelectOption = { value: string; label: string; icon?: React.ReactNode };
type ProjectMarkOptionDefinition = { value: string; labelKey: I18nKey; Icon: React.ComponentType<{ className?: string }> };
type SettingsSectionId = "runtime" | "profile" | "preferences" | "voice" | "feedback" | "about";
type AppearanceMode = "system" | "light" | "dark";
type AssetDropNotice = { kind: "default" } | { kind: "imported"; count: number } | { kind: "missing-local-path" } | { kind: "duplicates-skipped" } | { kind: "import-failed" };
type CliTestResult = {
  state: "success" | "warning" | "error";
  title: string;
  detail: string;
};
type PendingProjectAction =
  | { kind: "move-to-trash"; project: ProjectSummary }
  | { kind: "restore"; project: ProjectSummary }
  | { kind: "delete-forever"; project: ProjectSummary }
  | { kind: "empty-trash"; projects: ProjectSummary[] };
type AgentSubmitHandler = (event: { preventDefault: () => void }, draftMessage: string, onAccepted?: () => void) => void | Promise<void>;
type AgentParseStoryboardOperation = Extract<AgentOperation, { type: "parse_storyboard" }>;
type AgentRegenerateMediaOperation = Extract<AgentOperation, { type: "regenerate_media" }>;
type AgentMediaGenerationPlaceholderRun = AgentMediaGenerationPlaceholder & { projectId: string };
type AppRouteState = { screen: Screen; projectId: string; tab: WorkspaceTab; templateId?: string };
type LocalCliIconComponent = React.ComponentType<{ size?: number | string; style?: React.CSSProperties }>;
type UpdateStoryboardCellHandler = (rowId: string, field: UpdateShotInput["field"], value: string) => void | Promise<void>;
type StoryboardAiAction = "parse" | "images" | "videos";
type StoryboardMediaAiAction = "images" | "videos";
type StoryboardLocalMutationAction =
  | { kind: "create"; count: number }
  | { kind: "insert"; rowId: string; placement: "before" | "after" }
  | { kind: "duplicate" }
  | { kind: "delete" };
type StoryboardGenerationTaskStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
type StoryboardGenerationStatusFilter = "all" | "active" | "succeeded" | "failed";
type StoryboardGenerationContentFilter = "all" | "image" | "video";
const AGENT_MODEL_STORAGE_KEY = "mkboard.selectedAgentModel";
const AGENT_EFFORT_STORAGE_KEY = "mkboard.selectedAgentEffort";
const AGENT_PERMISSION_MODE_STORAGE_KEY = "mkboard.agentPermissionMode";
type SettingsStaticDetailTone = "neutral" | "checking" | "success" | "warning" | "error";
type ProjectArchiveFilter = "active" | "archived";
type ProjectDialogMode = "create" | "edit";
type AssetDateGroup = { key: string; label: string; assets: ProjectAsset[] };
type StoryboardGenerationTaskItem = {
  id: string;
  kind: "image" | "video";
  batchId?: string | null;
  rowId: string;
  method?: string;
  status: StoryboardGenerationTaskStatus;
  provider?: string;
  providerTaskId?: string | null;
  assetId?: string;
  fileName?: string;
  message?: string | null;
  canRetryDelivery?: boolean;
  localDeliveryFailed?: boolean;
  deliveryAttempts?: number;
  localDeliveryAttemptCount?: number;
  createdAt?: string;
  updatedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  stage?: StoryboardVideoGenerationEvent["stage"];
  stageLabel?: string;
  stageDetail?: string;
  cliLog?: string;
  studioUrl?: string;
  workDir?: string;
};
type StoryboardMediaSubmitLock = {
  action: StoryboardMediaAiAction;
  projectId: string;
};
type StoryboardGenerationTaskDisplayItem = {
  task: StoryboardGenerationTaskItem;
  shotLabel: string;
};
type StoryboardAgentWorkflowRun = {
  clientRunId: string;
  conversationId: string;
  projectId: string;
  userMessage: AgentMessage;
  assistantMessage: AgentMessage;
  language: InterfaceLanguage;
};
type ChooseProjectAssetsHandler = () => Promise<ProjectAsset[]>;
type PresentationFrame = {
  id: string;
  shot: string;
  tag: "A-roll" | "B-roll";
  description: string;
  scene: string;
  speechText: string;
  asset?: ProjectAsset;
  sampleSrc?: string;
};

type StoryboardParseClientLogContext = {
  clientRunId: string;
  startedAt: number;
  lastAt: number;
};

const onboardingStepOrder: OnboardingStepId[] = ["settings", "hyperframes", "create_project", "script", "storyboard", "images", "videos", "preview", "export"];
const storyboardParseLogPrefix = "[MkBoard][StoryboardParse]";
const onboardingGuideZIndex = 20000;

function findOnboardingTarget(selectors: string[]): HTMLElement | null {
  if (typeof document === "undefined") return null;
  for (const selector of selectors) {
    const target = document.querySelector<HTMLElement>(selector);
    if (target) return target;
  }
  return null;
}

function isTutorialProject(project: Pick<ProjectSummary, "id" | "kind"> | null | undefined): boolean {
  return Boolean(project && (project.kind === "tutorial" || isTutorialProjectId(project.id)));
}

function filterProjectsForInterfaceLanguage(projects: ProjectSummary[], interfaceLanguage: InterfaceLanguage): ProjectSummary[] {
  const currentTutorialProjectId = getTutorialProjectId(interfaceLanguage);
  return projects.filter((project) => !isTutorialProject(project) || project.id === currentTutorialProjectId);
}

function getOnboardingStepIndex(step: OnboardingStepId): number {
  return onboardingStepOrder.indexOf(step);
}

function getTutorialOnboardingVisibleRows(
  rows: StoryboardRow[],
  state: OnboardingState | null,
  revealAction: StoryboardAiAction | null,
  storyboardRevealCount: number | null
): StoryboardRow[] {
  if (!state || state.completedAt) return rows;
  if (getOnboardingStepIndex(state.currentStep) < getOnboardingStepIndex("storyboard")) return [];
  const storyboardAlreadyCompleted = state.completedStepIds.includes("storyboard");
  if (state.currentStep === "storyboard" && !storyboardAlreadyCompleted && revealAction !== "parse") return [];
  if (state.currentStep === "storyboard" && revealAction === "parse" && storyboardRevealCount !== null) {
    return rows.slice(0, Math.max(0, storyboardRevealCount));
  }
  return rows;
}

function getTutorialOnboardingVisibleAssets(assets: ProjectAsset[], state: OnboardingState | null, revealAction: StoryboardAiAction | null): ProjectAsset[] {
  if (!state || state.completedAt) return assets;
  const imageVisible =
    state.completedStepIds.includes("images") ||
    state.completedStepIds.includes("videos") ||
    state.currentStep === "videos" ||
    state.currentStep === "preview" ||
    state.currentStep === "export" ||
    revealAction === "images" ||
    revealAction === "videos";
  const videoVisible =
    state.completedStepIds.includes("videos") ||
    state.currentStep === "preview" ||
    state.currentStep === "export" ||
    revealAction === "videos";

  return assets.filter((asset) => {
    const guideKind = getTutorialGuideAssetKind(asset);
    if (!guideKind) return true;
    return guideKind === "image" ? imageVisible : videoVisible;
  });
}

function getTutorialGuideAssetKind(asset: Pick<ProjectAsset, "id" | "kind">): "image" | "video" | null {
  if (asset.id.startsWith("mkb-guide-image-")) return "image";
  if (asset.id.startsWith("mkb-guide-video-")) return "video";
  if (/^musk-story-(?:zh|en)-seedance-shot-\d+-(?:image|video)$/i.test(asset.id)) {
    return asset.kind === "image" || asset.kind === "video" ? asset.kind : null;
  }
  if (/^musk-story-[a-z-]+-hyperframes-shot-\d+$/i.test(asset.id)) return "video";
  return null;
}

function isMissingOnboardingIpcHandlerError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /No handler registered for 'mkboard:(?:ensure-tutorial-project|get-onboarding-state|update-onboarding-state|reveal-tutorial-storyboard|reveal-tutorial-media)'/i.test(message);
}

function logMissingOnboardingIpcHandler(action: string, error: unknown): void {
  console.warn(`[MkBoard][Onboarding] ${action} skipped because the running main process has no onboarding IPC handler.`, error);
}

function createStoryboardParseClientLogContext(clientRunId: string, startedAt = Date.now()): StoryboardParseClientLogContext {
  return { clientRunId, startedAt, lastAt: startedAt };
}

function logStoryboardParseClientStep(context: StoryboardParseClientLogContext, step: string, detail: Record<string, unknown> = {}) {
  const now = Date.now();
  console.log(storyboardParseLogPrefix, {
    layer: "renderer",
    step,
    clientRunId: context.clientRunId,
    elapsedMs: now - context.startedAt,
    stepMs: now - context.lastAt,
    ...detail
  });
  context.lastAt = now;
}

function summarizeProjectForStoryboardParseLog(detail: ProjectDetail) {
  return {
    projectId: detail.project.id,
    projectName: detail.project.name,
    scriptHtmlChars: detail.scriptHtml.length,
    currentRowCount: detail.rows.length,
    visibleColumns: detail.columns.filter((column) => column.visible).map((column) => ({ id: column.id, label: column.label })),
    assetCount: detail.assets.length,
    storyboardSkillId: detail.storyboardSkill.id,
    storyboardSkillName: detail.storyboardSkill.name
  };
}

const tabItems: Array<{ value: WorkspaceTab; labelKey: I18nKey; icon: React.ReactNode }> = [
  { value: "script", labelKey: "tab.script", icon: <FileText aria-hidden="true" /> },
  { value: "storyboard", labelKey: "tab.storyboard", icon: <Clapperboard aria-hidden="true" /> },
  { value: "assets", labelKey: "tab.assets", icon: <Images aria-hidden="true" /> }
];

const assetFilterOptions: Array<{ value: AssetFilter; labelKey: I18nKey }> = [
  { value: "all", labelKey: "assets.filter.all" },
  { value: "image", labelKey: "assets.filter.image" },
  { value: "video", labelKey: "assets.filter.video" },
  { value: "audio", labelKey: "assets.filter.audio" }
];

const imageRatioOptions: Array<{ value: ImageRatio; label: string; aspectRatio: string }> = [
  { value: "16:9", label: "16:9", aspectRatio: "16 / 9" },
  { value: "9:16", label: "9:16", aspectRatio: "9 / 16" },
  { value: "3:4", label: "3:4", aspectRatio: "3 / 4" },
  { value: "4:3", label: "4:3", aspectRatio: "4 / 3" }
];

function AspectRatioIcon({ ratio, className }: { ratio: ImageRatio; className?: string }) {
  const aspectRatio = imageRatioOptions.find((option) => option.value === ratio)?.aspectRatio ?? "16 / 9";
  return (
    <span className={cn("aspect-ratio-icon", className)} aria-hidden="true">
      <span style={{ aspectRatio }} />
    </span>
  );
}

const storyboardCreateOptions = [
  { count: 1 },
  { count: 5 },
  { count: 10 }
];

type StoryboardCategory = "A-ROLL" | "B-ROLL";

const storyboardCategoryOptions: StoryboardCategory[] = ["A-ROLL", "B-ROLL"];
const DESKTOP_STATIC_ASSET_BASE_URL = "https://static.mkboard.app/desktop-assets/2026-06-18";
const MKBOARD_ICON_SRC = `${DESKTOP_STATIC_ASSET_BASE_URL}/brands/mkboard-icon.png`;
const HYPERFRAMES_LOGO_SRC = `${DESKTOP_STATIC_ASSET_BASE_URL}/brands/hyperframes-logo.png`;

const projectMarkOptionDefinitions: ProjectMarkOptionDefinition[] = [
  { value: "clapperboard", labelKey: "project.mark.clapperboard", Icon: Clapperboard },
  { value: "film", labelKey: "project.mark.film", Icon: Film },
  { value: "camera", labelKey: "project.mark.camera", Icon: Camera },
  { value: "video", labelKey: "project.mark.video", Icon: Video },
  { value: "book-open", labelKey: "project.mark.bookOpen", Icon: BookOpen },
  { value: "sticky-note", labelKey: "project.mark.stickyNote", Icon: StickyNote },
  { value: "layers", labelKey: "project.mark.layers", Icon: Layers },
  { value: "images", labelKey: "project.mark.images", Icon: Images },
  { value: "palette", labelKey: "project.mark.palette", Icon: Palette },
  { value: "brush", labelKey: "project.mark.brush", Icon: Brush },
  { value: "pen-tool", labelKey: "project.mark.penTool", Icon: PenTool },
  { value: "sparkles", labelKey: "project.mark.sparkles", Icon: Sparkles },
  { value: "wand-sparkles", labelKey: "project.mark.wandSparkles", Icon: WandSparkles },
  { value: "lightbulb", labelKey: "project.mark.lightbulb", Icon: Lightbulb },
  { value: "brain", labelKey: "project.mark.brain", Icon: Brain },
  { value: "map", labelKey: "project.mark.map", Icon: MapIcon },
  { value: "compass", labelKey: "project.mark.compass", Icon: Compass },
  { value: "megaphone", labelKey: "project.mark.megaphone", Icon: Megaphone },
  { value: "rocket", labelKey: "project.mark.rocket", Icon: Rocket },
  { value: "pin", labelKey: "project.mark.pin", Icon: SquareKanban }
];

const storyboardColumnTypeOptions: Array<{ value: StoryboardColumnType; labelKey: I18nKey }> = [
  { value: "text", labelKey: "storyboard.columnType.text" },
  { value: "select", labelKey: "storyboard.columnType.select" },
  { value: "number", labelKey: "storyboard.columnType.number" },
  { value: "image", labelKey: "storyboard.columnType.image" }
];

const settingsSections: Array<{ id: SettingsSectionId; labelKey: I18nKey; icon: React.ReactNode }> = [
  { id: "runtime", labelKey: "settings.section.runtime", icon: <Settings aria-hidden="true" /> },
  { id: "profile", labelKey: "settings.section.profile", icon: <KeyRound aria-hidden="true" /> },
  { id: "preferences", labelKey: "settings.section.preferences", icon: <Eye aria-hidden="true" /> },
  { id: "voice", labelKey: "settings.section.voice", icon: <AudioLines aria-hidden="true" /> },
  { id: "feedback", labelKey: "settings.section.feedback", icon: <MessageCircle aria-hidden="true" /> },
  { id: "about", labelKey: "settings.section.about", icon: <HelpCircle aria-hidden="true" /> }
];

const LANGUAGE_STORAGE_KEY = "mkboard.interfaceLanguage";
const APPEARANCE_STORAGE_KEY = "mkboard.appearanceMode";
const SELECTED_CLI_STORAGE_KEY = "mkboard.selectedAgentCli";
const HYPERFRAMES_VIDEO_RESOLUTION_STORAGE_KEY = "mkboard.hyperframesVideoResolution";
const SEEDANCE_VIDEO_RESOLUTION_STORAGE_KEY = "mkboard.seedanceVideoResolution";
const HYPERFRAMES_VIDEO_CONCURRENCY_STORAGE_KEY = "mkboard.hyperframesVideoConcurrency";
const DEFAULT_TASTE_STORAGE_KEY = "mkboard.defaultTasteId";
const DEFAULT_TASTE_USER_SELECTION_STORAGE_KEY = "mkboard.defaultTasteIdUserSelected";
const DEFAULT_TEMPLATE_STORAGE_KEY = "mkboard.defaultTemplateId";
const ELEVENLABS_DEFAULT_VOICE_STORAGE_KEY = "mkboard.elevenLabsDefaultVoiceId";
const ELEVENLABS_DEFAULT_VOICE_NAME_STORAGE_KEY = "mkboard.elevenLabsDefaultVoiceName";
const PRESENTATION_AUTO_PLAY_FALLBACK_MS = 2400;
const SCRIPT_SPEECH_FLOAT_OFFSET_STORAGE_KEY = "mkboard.scriptSpeechFloatOffset";

function readStoredScriptSpeechFloatOffset(): { x: number; y: number } {
  if (typeof window === "undefined") return { x: 0, y: 0 };
  try {
    const raw = window.localStorage.getItem(SCRIPT_SPEECH_FLOAT_OFFSET_STORAGE_KEY);
    if (!raw) return { x: 0, y: 0 };
    const parsed = JSON.parse(raw) as { x?: unknown; y?: unknown };
    const x = Number(parsed.x);
    const y = Number(parsed.y);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : { x: 0, y: 0 };
  } catch {
    return { x: 0, y: 0 };
  }
}
const LOCAL_CLI_GUIDE_URL = "https://mkboard.app/docs/install";
const CREDIT_LEDGER_PAGE_SIZE = 10;
const STORYBOARD_IMAGE_POLL_INTERVAL_MS = 3000;
const STORYBOARD_IMAGE_POLL_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_CREDIT_LEDGER_IMAGE_UNIT_CREDITS = 8;
const LEGACY_CREDIT_LEDGER_VIDEO_UNIT_CREDITS = 45;

const appearanceOptions: Array<{ value: AppearanceMode; labelKey: I18nKey; detailKey: I18nKey }> = [
  { value: "system", labelKey: "appearance.system", detailKey: "appearance.systemDetail" },
  { value: "light", labelKey: "appearance.light", detailKey: "appearance.lightDetail" },
  { value: "dark", labelKey: "appearance.dark", detailKey: "appearance.darkDetail" }
];

const hyperframesVideoResolutionOptions: Array<{ value: HyperframesVideoResolution; label: string }> = [
  { value: "1080p", label: "1080p" },
  { value: "2k", label: "2K" },
  { value: "4k", label: "4K" }
];
const seedanceVideoResolutionOptions: Array<{ value: SeedanceVideoResolution; label: string }> = [
  { value: "720p", label: "720p" },
  { value: "1080p", label: "1080p" }
];
const hyperframesVideoConcurrencyOptions = [1, 2, 3, 4, 5] as const;

const languageValues = languageOptions.map((option) => option.value);
const appearanceValues = appearanceOptions.map((option) => option.value);
const agentCliValues: AgentCliId[] = ["codex", "claude-code", "gemini-cli", "opencode", "cursor-agent", "kimi-cli"];

function isAgentCliId(value: string): value is AgentCliId {
  return agentCliValues.includes(value as AgentCliId) || value.startsWith("custom:");
}

function isDependencyCliAgent(agent: LocalCliAgent) {
  return agent.role === "dependency" || !isAgentCliId(agent.id);
}

const AGENT_SIDEBAR_MIN_WIDTH = 280;
const AGENT_SIDEBAR_MAX_WIDTH = 580;
const AGENT_SIDEBAR_DEFAULT_WIDTH = 360;
const SAMPLE_PROJECT_ID = "testing-storyboard";
const SAMPLE_PROJECT_NAME = "Apple Growth Story";
const A_ROLL_SAMPLE_IMAGE_SRC = "https://static.mkboard.app/desktop-assets/2026-06-18/storyboard/a-roll-medium-silhouette.png";
const A_ROLL_SAMPLE_HIDDEN_FIELD = "aRollSampleHidden";
const TEMPLATE_PREVIEW_PLACEHOLDER_IMAGE_SRC = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><rect width="320" height="180" rx="18" fill="#f5f6f8"/><rect x="72" y="42" width="176" height="96" rx="14" fill="#ffffff" stroke="#d9dde3" stroke-dasharray="8 8"/><path d="M129 106l25-30 22 24 12-14 31 38H101l28-18z" fill="#d4dae2"/><circle cx="203" cy="67" r="12" fill="#c3cad4"/></svg>')}`;
const TEMPLATE_PREVIEW_ERROR_IMAGE_SRC = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><rect width="320" height="180" rx="18" fill="#fff7ed"/><rect x="72" y="42" width="176" height="96" rx="14" fill="#fffbeb" stroke="#f59e0b" stroke-width="2"/><path d="M160 63l48 82H112l48-82z" fill="#f97316"/><rect x="156" y="92" width="8" height="28" rx="4" fill="#fff7ed"/><circle cx="160" cy="130" r="5" fill="#fff7ed"/></svg>')}`;
const TEMPLATE_PREVIEW_IMAGE_STATE_FIELD = "__templatePreviewImageState";
const X_DIRECT_MESSAGE_URL = "https://x.com/messages/compose?recipient_id=1718896922277314560";
const X_LOGO_SRC = xLogoSrc;
const FEISHU_ICON_SRC = feishuIconSrc;
const FEISHU_GROUP_QR_SRC = feishuGroupQrSrc;
const DEFAULT_ROUTE_STATE: AppRouteState = { screen: "projects", projectId: SAMPLE_PROJECT_ID, tab: "script" };
const DEFAULT_TEMPLATE_ID = "default-template";
const DEFAULT_STORYBOARD_SKILL_ID = "storyboard-split";
const DEFAULT_ZH_STORYBOARD_SKILL_ID = "storyboard-split-zh";
const DEFAULT_TASTE_ID = "taste-codex-paper-cut-studio";
const workspaceTabValues: WorkspaceTab[] = ["script", "storyboard", "assets"];
const fallbackTranslator = createTranslator("zh-CN");

function getDefaultStoryboardSkillId(locale?: InterfaceLanguage) {
  return getStoryboardTemplateLanguage(locale) === "zh" ? DEFAULT_ZH_STORYBOARD_SKILL_ID : DEFAULT_STORYBOARD_SKILL_ID;
}

function isDefaultStoryboardSkillId(skillId: string) {
  return skillId === DEFAULT_STORYBOARD_SKILL_ID || skillId === DEFAULT_ZH_STORYBOARD_SKILL_ID;
}
const localizedTasteNames: Record<string, { en: string; zhCN: string; zhTW: string }> = {
  "taste-guizang-style-b-ikb": {
    en: "International Klein Blue",
    zhCN: "国际克莱因蓝",
    zhTW: "國際克萊因藍"
  },
  "taste-guizang-style-b-lemon-yellow": {
    en: "Lemon Yellow",
    zhCN: "柠檬黄",
    zhTW: "檸檬黃"
  },
  "taste-guizang-style-b-lemon-green": {
    en: "Lemon Green",
    zhCN: "柠檬绿",
    zhTW: "檸檬綠"
  },
  "taste-guizang-style-b-safety-orange": {
    en: "Safety Orange",
    zhCN: "安全橙",
    zhTW: "安全橙"
  },
  "taste-guizang-style-a-monocle-classic": {
    en: "Monocle Classic",
    zhCN: "经典杂志",
    zhTW: "經典雜誌"
  },
  "taste-guizang-style-a-indigo-porcelain": {
    en: "Indigo Porcelain",
    zhCN: "靛蓝瓷白",
    zhTW: "靛藍瓷白"
  },
  "taste-guizang-style-a-forest-ink": {
    en: "Forest Ink",
    zhCN: "森林墨绿",
    zhTW: "森林墨綠"
  },
  "taste-guizang-style-a-kraft-paper": {
    en: "Kraft Paper",
    zhCN: "牛皮纸",
    zhTW: "牛皮紙"
  },
  "taste-guizang-style-a-dune": {
    en: "Dune",
    zhCN: "沙丘",
    zhTW: "沙丘"
  },
  "taste-codex-noir-console": {
    en: "Noir Console",
    zhCN: "黑金控制台",
    zhTW: "黑金控制台"
  },
  "taste-codex-paper-cut-studio": {
    en: "Paper Cut Studio",
    zhCN: "剪纸工作室",
    zhTW: "剪紙工作室"
  },
  "taste-codex-clinical-whiteprint": {
    en: "Clinical Whiteprint",
    zhCN: "冷白蓝图",
    zhTW: "冷白藍圖"
  },
  "taste-codex-candy-pop-grid": {
    en: "Candy Pop Grid",
    zhCN: "糖果网格",
    zhTW: "糖果網格"
  },
  "taste-codex-analog-film-notebook": {
    en: "Analog Film Notebook",
    zhCN: "胶片手记",
    zhTW: "膠片手記"
  },
  "taste-codex-blueprint-motion": {
    en: "Blueprint Motion",
    zhCN: "动态蓝图",
    zhTW: "動態藍圖"
  }
};
type TasteVideoLanguage = "zh" | "en";
type TasteMediaAssets = {
  image?: string;
  posters?: Partial<Record<TasteVideoLanguage, string>>;
  videos?: Partial<Record<TasteVideoLanguage, string>>;
};

const tastePreviewImageUrls: Record<string, string> = tastePreviewImageUrlMap;
const tasteMediaUrls = tasteMediaUrlMap as Record<string, TasteMediaAssets>;

const skillIconDefinitions = [
  { id: defaultSkillIconId, label: "File text", Icon: FileText },
  { id: defaultSystemSkillIconId, label: "Lock", Icon: Lock },
  { id: "book-open", label: "Book open", Icon: BookOpen },
  { id: "clapperboard", label: "Clapperboard", Icon: Clapperboard },
  { id: "film", label: "Film", Icon: Film },
  { id: "camera", label: "Camera", Icon: Camera },
  { id: "video", label: "Video", Icon: Video },
  { id: "image", label: "Image", Icon: Image },
  { id: "images", label: "Images", Icon: Images },
  { id: "layers", label: "Layers", Icon: Layers },
  { id: "list-checks", label: "List checks", Icon: ListChecks },
  { id: "table-properties", label: "Table", Icon: TableProperties },
  { id: "square-kanban", label: "Kanban", Icon: SquareKanban },
  { id: "sticky-note", label: "Sticky note", Icon: StickyNote },
  { id: "pencil", label: "Pencil", Icon: Pencil },
  { id: "pen-tool", label: "Pen tool", Icon: PenTool },
  { id: "brush", label: "Brush", Icon: Brush },
  { id: "palette", label: "Palette", Icon: Palette },
  { id: "sparkles", label: "Sparkles", Icon: Sparkles },
  { id: "wand-sparkles", label: "Wand sparkles", Icon: WandSparkles },
  { id: "brain", label: "Brain", Icon: Brain },
  { id: "lightbulb", label: "Lightbulb", Icon: Lightbulb },
  { id: "message-circle", label: "Message", Icon: MessageCircle },
  { id: "languages", label: "Languages", Icon: Languages },
  { id: "type", label: "Type", Icon: Type },
  { id: "hash", label: "Hash", Icon: Hash },
  { id: "flag", label: "Flag", Icon: Flag },
  { id: "compass", label: "Compass", Icon: Compass },
  { id: "map", label: "Map", Icon: MapIcon },
  { id: "megaphone", label: "Megaphone", Icon: Megaphone },
  { id: "rocket", label: "Rocket", Icon: Rocket },
  { id: "monitor", label: "Monitor", Icon: Monitor },
  { id: "terminal", label: "Terminal", Icon: Terminal },
  { id: "package-search", label: "Package search", Icon: PackageSearch },
  { id: "folder-open", label: "Folder open", Icon: FolderOpen },
  { id: "file-image", label: "File image", Icon: FileImage },
  { id: "file-video", label: "File video", Icon: FileVideo },
  { id: "file-audio", label: "File audio", Icon: FileAudio },
  { id: "file-archive", label: "File archive", Icon: FileArchive },
  { id: "grid-2x2", label: "Grid", Icon: Grid2X2 },
  { id: "clock", label: "Clock", Icon: Clock },
  { id: "eye", label: "Eye", Icon: Eye },
  { id: "shield-check", label: "Shield check", Icon: ShieldCheck },
  { id: "key-round", label: "Key", Icon: KeyRound },
  { id: "user-pen", label: "User pen", Icon: UserPen },
  { id: "settings", label: "Settings", Icon: Settings },
  { id: "copy", label: "Copy", Icon: Copy },
  { id: "upload-cloud", label: "Upload", Icon: UploadCloud }
] as const;

const skillGradientDefinitions = [
  { id: defaultSkillGradientId, label: "Mist slate", background: "linear-gradient(135deg, #f1f3f5, #d5dbe1)", foreground: "#53616f", border: "#d8dee5" },
  { id: defaultSystemSkillGradientId, label: "Mist amber", background: "linear-gradient(135deg, #fff7e6, #ead8ae)", foreground: "#8a6414", border: "#ead8ae" },
  { id: "sage-fog", label: "Sage fog", background: "linear-gradient(135deg, #edf3ed, #cad9cc)", foreground: "#4f6555", border: "#ccd9cf" },
  { id: "moss-haze", label: "Moss haze", background: "linear-gradient(135deg, #eef2e8, #cdd8bd)", foreground: "#5d6848", border: "#d4dcc7" },
  { id: "olive-paper", label: "Olive paper", background: "linear-gradient(135deg, #f3f1e6, #dbd6b8)", foreground: "#69613b", border: "#ded8bb" },
  { id: "clay-wash", label: "Clay wash", background: "linear-gradient(135deg, #f5eee9, #dcc8ba)", foreground: "#715747", border: "#dfcbbd" },
  { id: "sand-drift", label: "Sand drift", background: "linear-gradient(135deg, #f6f1e8, #ded1bd)", foreground: "#705f45", border: "#e2d6c4" },
  { id: "rose-fog", label: "Rose fog", background: "linear-gradient(135deg, #f6edef, #dfc8ce)", foreground: "#76515d", border: "#e3cdd2" },
  { id: "mauve-mist", label: "Mauve mist", background: "linear-gradient(135deg, #f2eef4, #d6c9dd)", foreground: "#66536f", border: "#d9ccdf" },
  { id: "lavender-ash", label: "Lavender ash", background: "linear-gradient(135deg, #f0eff7, #cfcfe3)", foreground: "#5b5d7c", border: "#d4d4e7" },
  { id: "periwinkle-haze", label: "Periwinkle haze", background: "linear-gradient(135deg, #eef1f8, #c9d2e6)", foreground: "#52627f", border: "#ced7ea" },
  { id: "denim-fog", label: "Denim fog", background: "linear-gradient(135deg, #edf2f6, #c6d4de)", foreground: "#4e6474", border: "#cbd8e1" },
  { id: "blue-grey", label: "Blue grey", background: "linear-gradient(135deg, #eef3f4, #c9d9dc)", foreground: "#506971", border: "#cedde0" },
  { id: "glacier", label: "Glacier", background: "linear-gradient(135deg, #edf5f6, #c5dce0)", foreground: "#4b6d76", border: "#cbe1e4" },
  { id: "teal-fog", label: "Teal fog", background: "linear-gradient(135deg, #ebf4f2, #c4dcd6)", foreground: "#4a6c65", border: "#c9dfda" },
  { id: "seafoam", label: "Seafoam", background: "linear-gradient(135deg, #edf5ef, #c7ddcf)", foreground: "#4f6d59", border: "#cde2d4" },
  { id: "mint-grey", label: "Mint grey", background: "linear-gradient(135deg, #eef5f1, #cbded3)", foreground: "#506b5c", border: "#d0e2d8" },
  { id: "eucalyptus", label: "Eucalyptus", background: "linear-gradient(135deg, #edf3ef, #c6d8ce)", foreground: "#52685b", border: "#cbdcd2" },
  { id: "pine-mist", label: "Pine mist", background: "linear-gradient(135deg, #edf2ee, #c5d4c8)", foreground: "#516657", border: "#cad9cd" },
  { id: "oatmeal", label: "Oatmeal", background: "linear-gradient(135deg, #f5f1e8, #ded6c4)", foreground: "#6b604d", border: "#e1d8c8" },
  { id: "blush-stone", label: "Blush stone", background: "linear-gradient(135deg, #f5eeee, #decaca)", foreground: "#735758", border: "#e2cece" },
  { id: "coral-fog", label: "Coral fog", background: "linear-gradient(135deg, #f7eeeb, #e0c7bd)", foreground: "#755546", border: "#e5ccc2" },
  { id: "peach-wool", label: "Peach wool", background: "linear-gradient(135deg, #f7f0e9, #e2ceb9)", foreground: "#745d45", border: "#e6d2be" },
  { id: "apricot-grey", label: "Apricot grey", background: "linear-gradient(135deg, #f5f0e7, #dfd0b6)", foreground: "#705e40", border: "#e3d4bb" },
  { id: "plum-smoke", label: "Plum smoke", background: "linear-gradient(135deg, #f2edf1, #d6c6d2)", foreground: "#6b5363", border: "#dbcbd6" },
  { id: "violet-fog", label: "Violet fog", background: "linear-gradient(135deg, #f0eef6, #d0c7df)", foreground: "#5f5575", border: "#d5cde4" },
  { id: "iris-grey", label: "Iris grey", background: "linear-gradient(135deg, #eef0f7, #c9cfe2)", foreground: "#565f79", border: "#ced4e6" },
  { id: "steel-mist", label: "Steel mist", background: "linear-gradient(135deg, #eff2f4, #cbd4db)", foreground: "#566572", border: "#d0d9df" },
  { id: "rain-cloud", label: "Rain cloud", background: "linear-gradient(135deg, #eef3f5, #c8d7df)", foreground: "#526776", border: "#cedce3" },
  { id: "cloud-paper", label: "Cloud paper", background: "linear-gradient(135deg, #f3f4f3, #d8dedb)", foreground: "#5d6662", border: "#dde2df" },
  { id: "taupe", label: "Taupe", background: "linear-gradient(135deg, #f2efeb, #d9d0c7)", foreground: "#675c54", border: "#ded5cc" },
  { id: "stone-linen", label: "Stone linen", background: "linear-gradient(135deg, #f3f1ed, #d8d2c9)", foreground: "#655f56", border: "#ded8cf" },
  { id: "greige", label: "Greige", background: "linear-gradient(135deg, #f2f0ec, #d6d0c5)", foreground: "#645e52", border: "#dcd5ca" },
  { id: "lilac-grey", label: "Lilac grey", background: "linear-gradient(135deg, #f1eff3, #d4ccd9)", foreground: "#62566a", border: "#d9d1de" },
  { id: "storm-blue", label: "Storm blue", background: "linear-gradient(135deg, #edf1f5, #c6d1dc)", foreground: "#526476", border: "#ccd7e1" },
  { id: "dusk", label: "Dusk", background: "linear-gradient(135deg, #efeff4, #cdccda)", foreground: "#5c5d72", border: "#d2d1df" },
  { id: "arctic", label: "Arctic", background: "linear-gradient(135deg, #eef5f7, #c8dde4)", foreground: "#4f6c79", border: "#cde1e7" },
  { id: "celadon", label: "Celadon", background: "linear-gradient(135deg, #edf5ec, #c9ddc9)", foreground: "#526c52", border: "#cee2ce" },
  { id: "bamboo", label: "Bamboo", background: "linear-gradient(135deg, #f1f4e9, #d4ddb9)", foreground: "#667045", border: "#d9e1c2" },
  { id: "umber-wash", label: "Umber wash", background: "linear-gradient(135deg, #f2ede7, #d8c8b8)", foreground: "#6d5844", border: "#ddcdbc" },
  { id: "terracotta-fog", label: "Terracotta fog", background: "linear-gradient(135deg, #f5ece8, #dec3b6)", foreground: "#74513f", border: "#e3c8bb" },
  { id: "rosewood", label: "Rosewood", background: "linear-gradient(135deg, #f3ecee, #d9c4cb)", foreground: "#70505a", border: "#dec9d0" },
  { id: "wisteria", label: "Wisteria", background: "linear-gradient(135deg, #f0eef5, #d0c7dd)", foreground: "#625673", border: "#d5cce2" },
  { id: "heather", label: "Heather", background: "linear-gradient(135deg, #f0eef2, #d1c9d5)", foreground: "#625865", border: "#d7cfdc" },
  { id: "ocean-grey", label: "Ocean grey", background: "linear-gradient(135deg, #edf3f5, #c5d7de)", foreground: "#506875", border: "#cbdae2" },
  { id: "cyan-grey", label: "Cyan grey", background: "linear-gradient(135deg, #edf5f5, #c6dcdc)", foreground: "#4f6c6d", border: "#cde1e1" },
  { id: "fern-paper", label: "Fern paper", background: "linear-gradient(135deg, #eef4eb, #cbdcbe)", foreground: "#586c48", border: "#d1e1c6" },
  { id: "wheat-grey", label: "Wheat grey", background: "linear-gradient(135deg, #f5f1e6, #dfd6b8)", foreground: "#6c623e", border: "#e3dac0" }
] as const;

const I18nContext = createContext<{ locale: InterfaceLanguage; t: Translator }>({
  locale: "zh-CN",
  t: fallbackTranslator
});

function useI18n() {
  return useContext(I18nContext);
}

function getLocalizedTasteName(taste: Pick<Taste, "id" | "name">, locale: InterfaceLanguage) {
  const localizedName = localizedTasteNames[taste.id];
  if (!localizedName) return taste.name.replace(/^Style\s+[A-Z]\s*[·・.]\s*/, "");
  if (locale === "zh-TW") return localizedName.zhTW;
  if (locale === "zh-CN") return localizedName.zhCN;
  return localizedName.en;
}

function getTastePreviewImageUrl(taste: Pick<Taste, "id">) {
  return getTasteMediaAssets(taste).image || withMkboardR2ImageQuality(tastePreviewImageUrls[taste.id] || "");
}

function getTasteMediaAssets(taste: Pick<Taste, "id">): Required<TasteMediaAssets> {
  const media = tasteMediaUrls[taste.id] ?? {};
  return {
    image: withMkboardR2ImageQuality(media.image || tastePreviewImageUrls[taste.id] || ""),
    posters: {
      zh: withMkboardR2ImageQuality(media.posters?.zh || ""),
      en: withMkboardR2ImageQuality(media.posters?.en || "")
    },
    videos: {
      zh: withMkboardR2VideoOptimization(media.videos?.zh || ""),
      en: withMkboardR2VideoOptimization(media.videos?.en || "")
    }
  };
}

function getTasteVideoLanguageForLocale(locale: InterfaceLanguage): TasteVideoLanguage {
  return locale === "en" ? "en" : "zh";
}

function getSkillIconDefinition(iconId?: string | null) {
  return skillIconDefinitions.find((option) => option.id === iconId) ?? skillIconDefinitions[0];
}

function getSkillGradientDefinition(gradientId?: string | null) {
  return skillGradientDefinitions.find((option) => option.id === gradientId) ?? skillGradientDefinitions[0];
}

function getRandomSkillGradientId() {
  return skillGradientDefinitions[Math.floor(Math.random() * skillGradientDefinitions.length)].id;
}

function getSkillVisualStyle(gradientId?: string | null): React.CSSProperties {
  const gradient = getSkillGradientDefinition(gradientId);
  return {
    background: gradient.background,
    color: gradient.foreground,
    borderColor: gradient.border
  };
}

function SkillVisualIcon({ className, gradientId, iconId }: { className?: string; gradientId?: string | null; iconId?: string | null }) {
  const { Icon } = getSkillIconDefinition(iconId);
  return (
    <span className={className} style={getSkillVisualStyle(gradientId)} aria-hidden="true">
      <Icon />
    </span>
  );
}

function MkboardBrandIcon({ className, decorative = false }: { className?: string; decorative?: boolean }) {
  return (
    <img className={cn("mkboard-brand-icon", className)} src={MKBOARD_ICON_SRC} alt={decorative ? "" : "MkBoard"} aria-hidden={decorative ? true : undefined} draggable={false} />
  );
}

function getProjectMarkDefinition(value: string) {
  return projectMarkOptionDefinitions.find((option) => option.value === value) ?? projectMarkOptionDefinitions[0];
}

function ProjectMarkIcon({ value, className }: { value: string; className?: string }) {
  const { Icon } = getProjectMarkDefinition(value);
  return (
    <span className={cn("project-icon-mark", className)} aria-hidden="true">
      <Icon />
    </span>
  );
}

function localizeSelectOptions(options: Array<{ value: string; labelKey: I18nKey }>, t: Translator): SelectOption[] {
  return options.map((option) => ({ value: option.value, label: t(option.labelKey) }));
}

function localizeProjectMarkOptions(t: Translator): SelectOption[] {
  return projectMarkOptionDefinitions.map((option) => ({
    value: option.value,
    label: t(option.labelKey),
    icon: <ProjectMarkIcon value={option.value} className="create-project-option-icon" />
  }));
}

function localizeProjectTemplates(templates: ProjectTemplate[], t: Translator): SelectOption[] {
  return templates.map((template) => ({
    value: template.id,
    label: template.scope === "system" ? t("common.defaultTemplate") : template.name,
    icon: (
      <span className="create-project-option-icon template" aria-hidden="true">
        {template.scope === "system" ? <Clapperboard /> : <TableProperties />}
      </span>
    )
  }));
}

function getTemplateStoryboardSkillId(templates: ProjectTemplate[], templateId: string, locale?: InterfaceLanguage) {
  const templateList = templates.length > 0 ? templates : [getFallbackDefaultTemplate(locale)];
  return templateList.find((template) => template.id === templateId)?.storyboardSkillId ?? getDefaultStoryboardSkillId(locale);
}

function getDefaultCreateTemplateId(templates: ProjectTemplate[], preferredTemplateId?: string) {
  if (preferredTemplateId && templates.some((template) => template.id === preferredTemplateId)) return preferredTemplateId;
  return templates.find((template) => template.id === DEFAULT_TEMPLATE_ID)?.id ?? templates[0]?.id ?? DEFAULT_TEMPLATE_ID;
}

function orderTemplatesWithPinnedDefault(templates: ProjectTemplate[], defaultTemplateId?: string) {
  if (!defaultTemplateId) return templates;
  const defaultTemplate = templates.find((template) => template.id === defaultTemplateId);
  if (!defaultTemplate) return templates;
  return [defaultTemplate, ...templates.filter((template) => template.id !== defaultTemplateId)];
}

function getDefaultCreateTasteId(tastes: Taste[], preferredTasteId?: string) {
  if (preferredTasteId && tastes.some((taste) => taste.id === preferredTasteId)) return preferredTasteId;
  return tastes.find((taste) => taste.id === DEFAULT_TASTE_ID)?.id ?? tastes[0]?.id ?? DEFAULT_TASTE_ID;
}

function orderTastesWithPinnedDefault(tastes: Taste[], defaultTasteId?: string) {
  if (!defaultTasteId) return tastes;
  const defaultTaste = tastes.find((taste) => taste.id === defaultTasteId);
  if (!defaultTaste) return tastes;
  return [defaultTaste, ...tastes.filter((taste) => taste.id !== defaultTasteId)];
}

function getFallbackProjectSkill(t: Translator, locale?: InterfaceLanguage): Skill {
  return {
    id: getDefaultStoryboardSkillId(locale),
    name: t("project.defaultStoryboardSkill"),
    description: t("project.defaultStoryboardSkillDescription"),
    content: "",
    iconId: defaultSystemSkillIconId,
    gradientId: defaultSystemSkillGradientId,
    scope: "system",
    locked: true,
    createdAt: "",
    updatedAt: ""
  };
}

function localizeProjectSkill(skill: Skill, t: Translator, locale?: InterfaceLanguage): Skill {
  if (!isDefaultStoryboardSkillId(skill.id)) return skill;
  return {
    ...skill,
    id: getDefaultStoryboardSkillId(locale),
    name: t("project.defaultStoryboardSkill"),
    description: t("project.defaultStoryboardSkillDescription")
  };
}

function getSelectableProjectSkills(skills: Skill[], t: Translator, locale?: InterfaceLanguage) {
  const defaultSkillId = getDefaultStoryboardSkillId(locale);
  const localizedSkills = skills.map((skill) => localizeProjectSkill(skill, t, locale));
  if (localizedSkills.some((skill) => skill.id === defaultSkillId)) return localizedSkills;
  return [getFallbackProjectSkill(t, locale), ...localizedSkills];
}

function getTemplateStoryboardSkillName(template: ProjectTemplate, t: Translator) {
  return isDefaultStoryboardSkillId(template.storyboardSkillId) ? t("project.defaultStoryboardSkill") : template.storyboardSkillName;
}

function resolveSelectedProjectSkill(skills: Skill[], selectedSkillId: string, t: Translator, loading = false, locale?: InterfaceLanguage): Skill {
  const selectableSkills = getSelectableProjectSkills(skills, t, locale);
  const normalizedSkillId = isDefaultStoryboardSkillId(selectedSkillId) ? getDefaultStoryboardSkillId(locale) : selectedSkillId;
  const selectedSkill = selectableSkills.find((skill) => skill.id === normalizedSkillId);
  if (selectedSkill) return selectedSkill;
  if (loading) {
    return {
      ...getFallbackProjectSkill(t, locale),
      id: normalizedSkillId || getDefaultStoryboardSkillId(locale),
      name: t("skills.loading"),
      description: t("project.skillLoadingDescription")
    };
  }
  if (normalizedSkillId) {
    return {
      ...getFallbackProjectSkill(t, locale),
      id: normalizedSkillId,
      name: normalizedSkillId,
      description: t("project.skillMissingDescription"),
      locked: false
    };
  }
  return selectableSkills[0];
}

function getFallbackDefaultTemplate(locale?: InterfaceLanguage): ProjectTemplate {
  const t = createTranslator(locale ?? "zh-CN");
  return {
    id: DEFAULT_TEMPLATE_ID,
    name: t("common.defaultTemplate"),
    description: "",
    scope: "system",
    columns: getDefaultStoryboardColumns(locale),
    storyboardSkillId: getDefaultStoryboardSkillId(locale),
    storyboardSkillName: t("project.defaultStoryboardSkill"),
    createdAt: "",
    updatedAt: ""
  };
}

function getFallbackDefaultTaste(): Taste {
  return {
    id: DEFAULT_TASTE_ID,
    name: "Paper Cut Studio",
    description: "Paper craft collage theme. Handmade paper, light shadows, and clean color blocks for courses, approachable brands, educational content, and friendly explainers.",
    content: "",
    sourceUrl: "codex://mkboard/system-taste",
    preview: {
      background: "#fbf3e6",
      foreground: "#243033",
      accent: "#ff6f61"
    },
    scope: "system",
    locked: true,
    createdAt: "",
    updatedAt: ""
  };
}

function getTabLabel(tab: WorkspaceTab, t: Translator) {
  return t(tabItems.find((item) => item.value === tab)?.labelKey ?? "tab.script");
}

function getColumnLabel(column: StoryboardColumn, t: Translator) {
  if (column.label.trim()) return column.label;
  const defaultColumnLabels: Partial<Record<StoryboardColumnId, I18nKey>> = {
    sort: "storyboard.column.sort",
    shot: "storyboard.column.shot",
    image: "storyboard.column.image",
    scene: "storyboard.column.scene",
    duration: "storyboard.column.duration",
    content: "storyboard.column.content",
    note: "storyboard.column.note"
  };
  const labelKey = defaultColumnLabels[column.id];
  if (isStoryboardImagePromptColumn(column)) return t("storyboard.column.imagePrompt");
  if (isStoryboardVideoPromptColumn(column)) return t("storyboard.column.videoPrompt");
  if (isStoryboardGenerationMethodColumn(column)) return t("storyboard.column.generationMethod");
  return labelKey ? t(labelKey) : column.label;
}

function getColumnTypeDisplayLabel(columnType: StoryboardColumnType, t: Translator) {
  const option = storyboardColumnTypeOptions.find((item) => item.value === columnType);
  return t(option?.labelKey ?? "storyboard.columnType.text");
}

function getPresentationFrames(rows: StoryboardRow[], assets: ProjectAsset[]) {
  return rows.map((row): PresentationFrame => {
    const isAroll = isArollStoryboardRow(row);
    const mediaAsset = getStoryboardRowMediaAssets(row, assets)[0];
    const description = row.content.trim() || row.note.trim() || row.scene.trim();

    return {
      id: row.id,
      shot: row.shot,
      tag: isAroll ? "A-roll" : "B-roll",
      description,
      scene: row.scene,
      speechText: getSpokenTextFromCell(row.content),
      asset: mediaAsset,
      sampleSrc: !mediaAsset && isAroll && !isArollSampleHidden(row) ? A_ROLL_SAMPLE_IMAGE_SRC : undefined
    };
  });
}

function formatSpeechDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

type SpeechPlayerState = "idle" | "loading" | "playing";

type SpeechPlaybackResult = {
  completed: boolean;
  durationSeconds: number;
  errorCode?: ElevenLabsErrorCode;
};

function playAudioToEnd(audio: HTMLAudioElement): Promise<{ ended: boolean; durationSeconds: number }> {
  return new Promise((resolvePlayback) => {
    let settled = false;
    const finish = (ended: boolean) => {
      if (settled) return;
      settled = true;
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      resolvePlayback({ ended, durationSeconds: duration });
    };
    audio.addEventListener("ended", () => finish(true));
    audio.addEventListener("error", () => finish(false));
    audio.addEventListener("pause", () => {
      if (!audio.ended) finish(false);
    });
    void audio.play().catch(() => finish(false));
  });
}

function useElevenLabsSpeaker() {
  const [speechState, setSpeechState] = useState<SpeechPlayerState>("idle");
  const [speechError, setSpeechError] = useState<ElevenLabsErrorCode | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const runIdRef = useRef(0);
  const playbackRateRef = useRef(1);

  function setSpeechPlaybackRate(rate: number) {
    playbackRateRef.current = rate;
    if (audioRef.current) audioRef.current.playbackRate = rate;
  }

  function stopSpeech() {
    runIdRef.current += 1;
    const audio = audioRef.current;
    audioRef.current = null;
    if (audio) {
      try {
        audio.pause();
      } catch {
        // Pausing a detached audio element can throw in hardened shells; the run id already invalidates it.
      }
    }
    setSpeechState("idle");
  }

  async function speak(voiceId: string, text: string): Promise<SpeechPlaybackResult> {
    stopSpeech();
    const runId = runIdRef.current;
    setSpeechError(null);
    const segments = splitTextIntoSpeechSegments(text);
    if (!segments.length || !voiceId || !window.mkboard) return { completed: false, durationSeconds: 0 };
    let playedSeconds = 0;
    for (const segment of segments) {
      setSpeechState("loading");
      let result: Awaited<ReturnType<MkboardApi["synthesizeElevenLabsSpeech"]>>;
      try {
        result = await window.mkboard.synthesizeElevenLabsSpeech({ text: segment, voiceId });
      } catch {
        result = { ok: false, error: "request_failed" };
      }
      if (runIdRef.current !== runId) return { completed: false, durationSeconds: playedSeconds };
      if (!result.ok) {
        setSpeechError(result.error);
        setSpeechState("idle");
        return { completed: false, durationSeconds: playedSeconds, errorCode: result.error };
      }
      const audio = new Audio(result.audioDataUrl);
      audio.playbackRate = playbackRateRef.current;
      audioRef.current = audio;
      setSpeechState("playing");
      const playback = await playAudioToEnd(audio);
      if (runIdRef.current !== runId) return { completed: false, durationSeconds: playedSeconds + playback.durationSeconds };
      playedSeconds += playback.durationSeconds;
      if (!playback.ended) {
        setSpeechState("idle");
        return { completed: false, durationSeconds: playedSeconds };
      }
    }
    setSpeechState("idle");
    return { completed: true, durationSeconds: playedSeconds };
  }

  useEffect(() => stopSpeech, []);

  return { speechState, speechError, speak, stopSpeech, setSpeechPlaybackRate, clearSpeechError: () => setSpeechError(null) };
}

const presentationPlaybackRates = [1, 1.25, 1.5, 2] as const;
const PRESENTATION_PLAYBACK_RATE_STORAGE_KEY = "mkboard.presentationPlaybackRate";

function readStoredPresentationPlaybackRate(): number {
  if (typeof window === "undefined") return 1;
  try {
    const rate = Number(window.localStorage.getItem(PRESENTATION_PLAYBACK_RATE_STORAGE_KEY));
    return presentationPlaybackRates.includes(rate as (typeof presentationPlaybackRates)[number]) ? rate : 1;
  } catch {
    return 1;
  }
}

function formatPresentationPlaybackRate(rate: number) {
  return `${String(rate).replace(/\.0+$/u, "")}x`;
}

function getSpeechErrorKey(errorCode: ElevenLabsErrorCode): I18nKey {
  if (errorCode === "sign_in_required") return "speech.error.signInRequired";
  if (errorCode === "not_configured") return "speech.error.notConfigured";
  if (errorCode === "invalid_key") return "speech.error.invalidKey";
  if (errorCode === "quota_exceeded") return "speech.error.quotaExceeded";
  if (errorCode === "text_too_long") return "speech.error.textTooLong";
  if (errorCode === "network_error") return "speech.error.network";
  return "speech.error.requestFailed";
}

function getImageRatioValue(imageRatio: ImageRatio) {
  if (imageRatio === "9:16") return 9 / 16;
  if (imageRatio === "4:3") return 4 / 3;
  if (imageRatio === "3:4") return 3 / 4;
  return 16 / 9;
}

function getPresentationStageContentSize(element: HTMLElement) {
  const style = window.getComputedStyle(element);
  const horizontalPadding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  const verticalPadding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);

  return {
    width: Math.max(0, element.clientWidth - horizontalPadding),
    height: Math.max(0, element.clientHeight - verticalPadding)
  };
}

function fitPresentationFrame(stageSize: { width: number; height: number }, imageRatio: ImageRatio) {
  if (stageSize.width <= 0 || stageSize.height <= 0) return null;

  const ratio = getImageRatioValue(imageRatio);
  let width = stageSize.width;
  let height = width / ratio;

  if (height > stageSize.height) {
    height = stageSize.height;
    width = height * ratio;
  }

  return {
    width: Math.round(width),
    height: Math.round(height)
  };
}

function assetDropNoticeText(notice: AssetDropNotice, t: Translator) {
  if (notice.kind === "imported") return t("assets.importedCount", { count: notice.count });
  if (notice.kind === "missing-local-path") return t("assets.missingLocalPath");
  if (notice.kind === "duplicates-skipped") return t("assets.duplicatesSkipped");
  if (notice.kind === "import-failed") return t("assets.importFailed");
  return t("assets.defaultDropText");
}

function createAgentMessageAttachmentSnapshot(asset: ProjectAsset): AgentMessageAttachment {
  return {
    id: asset.id,
    name: asset.name,
    kind: asset.kind,
    previewUrl: asset.previewUrl
  };
}

function localizeCodexStatusLabel(status: CodexCliStatus, t: Translator) {
  if (status.state === "checking") return t("status.codex.checking");
  if (status.state === "connected") return t("common.connected");
  if (status.state === "needs_auth") return t("codexGate.needsAuth");
  if (status.state === "not_installed") return t("common.notInstalled");
  if (status.state === "error" && (!status.label || status.label === fallbackTranslator("status.codex.checkFailed"))) return t("status.codex.checkFailed");
  return status.label;
}

function localizeConnectionLabel(
  connectionState: LocalCliAgent["connectionState"],
  t: Translator,
  options: { selected?: boolean; selectionScoped?: boolean } = {}
) {
  if (connectionState === "connected") return options.selectionScoped && !options.selected ? t("common.available") : t("common.connected");
  if (connectionState === "needs_auth") return t("common.needsLogin");
  if (connectionState === "error") return t("common.detectionFailed");
  if (connectionState === "not_installed") return t("common.notInstalled");
  if (connectionState === "checking") return t("codexGate.checking");
  return "";
}

function localizeLocalCliConnectionLabel(agent: LocalCliAgent, connectionState: LocalCliAgent["connectionState"], selected: boolean, t: Translator) {
  if (agent.id === "claude-code" && connectionState === "needs_auth") return t("cli.needsLoginOrApiKey");
  return localizeConnectionLabel(connectionState, t, { selected, selectionScoped: true });
}

function parseAppRoute(pathname: string): AppRouteState {
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";
  if (normalizedPath === "/" || normalizedPath === "/projects") return DEFAULT_ROUTE_STATE;
  if (normalizedPath === "/trash") return { screen: "trash", projectId: "", tab: "script" };
  if (normalizedPath === "/skills") return { screen: "skills", projectId: "", tab: "script" };
  if (normalizedPath === "/taste") return { screen: "taste", projectId: "", tab: "script" };
  if (normalizedPath === "/templates/new") return { screen: "template-create", projectId: "", tab: "script" };
  if (normalizedPath === "/templates") return { screen: "templates", projectId: "", tab: "script" };

  const segments = normalizedPath.split("/").filter(Boolean);
  if (segments[0] === "templates" && segments[1] && segments[2] === "edit") {
    return { screen: "template-edit", projectId: "", tab: "script", templateId: decodeURIComponent(segments[1]) };
  }
  if (segments[0] === "assets") {
    return {
      screen: "assets",
      projectId: segments[1] ? decodeURIComponent(segments[1]) : "",
      tab: "script"
    };
  }
  if (segments[0] === "projects" && segments[1]) {
    return {
      screen: "workspace",
      projectId: decodeURIComponent(segments[1]),
      tab: parseWorkspaceTab(segments[2])
    };
  }

  return DEFAULT_ROUTE_STATE;
}

function parseWorkspaceTab(value?: string): WorkspaceTab {
  if (workspaceTabValues.includes(value as WorkspaceTab)) return value as WorkspaceTab;
  return "script";
}

function getProjectsRoute() {
  return "/projects";
}

function getTrashRoute() {
  return "/trash";
}

function getSkillsRoute() {
  return "/skills";
}

function getTasteRoute() {
  return "/taste";
}

function getTemplatesRoute() {
  return "/templates";
}

function getTemplateCreateRoute() {
  return "/templates/new";
}

function getTemplateEditRoute(templateId: string) {
  return `/templates/${encodeURIComponent(templateId)}/edit`;
}

function getWorkspaceRoute(projectId: string, workspaceTab: WorkspaceTab) {
  return `/projects/${encodeURIComponent(projectId)}/${workspaceTab}`;
}

function getAssetsRoute(projectId: string) {
  return projectId ? `/assets/${encodeURIComponent(projectId)}` : "/assets";
}

function getProjectNameFromRoute(projectId: string) {
  if (projectId === SAMPLE_PROJECT_ID) return SAMPLE_PROJECT_NAME;
  return projectId.replace(/-/g, " ");
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isTransientCloudGenerationPollError(code: string, message: string) {
  const normalizedCode = code.trim().toUpperCase();
  if (normalizedCode === "NETWORK_TIMEOUT" || normalizedCode === "NETWORK_ERROR") return true;
  const httpStatus = /^HTTP_(\d{3})$/.exec(normalizedCode)?.[1];
  if (httpStatus) {
    const status = Number(httpStatus);
    return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
  }
  return isAgentNetworkFailureMessage(message);
}

function scrollNearestStoryboardRowsIntoView(rowIds: string[]) {
  if (typeof document === "undefined" || rowIds.length === 0) return;
  const targetRowIds = new Set(rowIds);
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      const rows = Array.from(document.querySelectorAll<HTMLElement>("[data-storyboard-row-id]")).filter((row) => {
        const rowId = row.dataset.storyboardRowId;
        return rowId ? targetRowIds.has(rowId) : false;
      });
      if (rows.length === 0) return;
      const viewportCenter = window.innerHeight / 2;
      const nearestRow = rows.reduce((nearest, row) => {
        const rowRect = row.getBoundingClientRect();
        const nearestRect = nearest.getBoundingClientRect();
        const rowDistance = Math.abs(rowRect.top + rowRect.height / 2 - viewportCenter);
        const nearestDistance = Math.abs(nearestRect.top + nearestRect.height / 2 - viewportCenter);
        return rowDistance < nearestDistance ? row : nearest;
      }, rows[0]);
      nearestRow.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    });
  });
}

function createClientRunId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `run-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readStoredOption<T extends string>(key: string, fallback: T, allowedValues: T[]) {
  if (typeof window === "undefined") return fallback;
  try {
    const storedValue = window.localStorage.getItem(key);
    return allowedValues.includes(storedValue as T) ? (storedValue as T) : fallback;
  } catch {
    return fallback;
  }
}

function readStoredIntegerOption<T extends number>(key: string, fallback: T, allowedValues: readonly T[]) {
  if (typeof window === "undefined") return fallback;
  try {
    const storedValue = Number(window.localStorage.getItem(key));
    return allowedValues.includes(storedValue as T) ? (storedValue as T) : fallback;
  } catch {
    return fallback;
  }
}

function readStoredString(key: string, fallback = "") {
  if (typeof window === "undefined") return fallback;
  try {
    return window.localStorage.getItem(key)?.trim() || fallback;
  } catch {
    return fallback;
  }
}

function readStoredDefaultTasteId() {
  if (typeof window === "undefined") return DEFAULT_TASTE_ID;
  try {
    const storedTasteId = window.localStorage.getItem(DEFAULT_TASTE_STORAGE_KEY)?.trim();
    const userSelectedDefaultTaste = window.localStorage.getItem(DEFAULT_TASTE_USER_SELECTION_STORAGE_KEY) === "1";
    if (!storedTasteId) return DEFAULT_TASTE_ID;
    if (!userSelectedDefaultTaste) return DEFAULT_TASTE_ID;
    return storedTasteId;
  } catch {
    return DEFAULT_TASTE_ID;
  }
}

function readStoredDefaultTemplateId() {
  return readStoredString(DEFAULT_TEMPLATE_STORAGE_KEY, DEFAULT_TEMPLATE_ID);
}

function getLanguageOption(language: InterfaceLanguage) {
  return (
    languageOptions.find((option) => option.value === language) ??
    languageOptions.find((option) => option.value === "zh-CN") ??
    languageOptions[0]
  );
}

function inferConversationMessageLanguage(message: string | null | undefined, fallback: InterfaceLanguage): InterfaceLanguage {
  const text = message?.trim() ?? "";
  if (!text) return fallback;
  if (/[\u3400-\u9fff]/u.test(text)) {
    if (fallback === "zh-TW" || /[這個為與後會張鏡圖訊雲專將體選擇當請進裡還寫讀腳畫欄項態]/u.test(text)) return "zh-TW";
    return "zh-CN";
  }
  if (/[A-Za-z]/u.test(text)) return "en";
  return fallback;
}

function inferAgentMessageLanguage(message: AgentMessage, fallback: InterfaceLanguage): InterfaceLanguage {
  const parts: string[] = [];
  if (message.content) parts.push(message.content);
  for (const event of message.events ?? []) {
    if (event.kind === "status" && event.detail) parts.push(event.detail);
    if ((event.kind === "text" || event.kind === "thinking") && event.text) parts.push(event.text);
    if (event.kind === "error" && event.message) parts.push(event.message);
  }
  return inferConversationMessageLanguage(parts.join("\n"), fallback);
}

function formatAgentConversationTitle(title: string | null | undefined, t: Translator) {
  const normalizedTitle = title?.trim() || defaultAgentConversationTitle;
  return isDefaultAgentConversationTitle(normalizedTitle) ? t("agent.defaultConversationTitle") : normalizedTitle;
}

function isDefaultAgentConversationTitle(title: string) {
  return legacyDefaultAgentConversationTitles.includes(title as (typeof legacyDefaultAgentConversationTitles)[number]);
}



function agentRunStatusFromEvent(event: AgentEvent): AgentMessage["runStatus"] | undefined {
  if (event.kind === "error") return "failed";
  if (event.kind !== "status") return undefined;
  if (event.label === "requesting") return "running";
  if (event.label === "queued" || event.label === "running" || event.label === "succeeded" || event.label === "failed" || event.label === "canceled") return event.label;
  if (event.label === "error") return "failed";
  return undefined;
}

function isTerminalAgentRunStatus(status: AgentMessage["runStatus"] | undefined) {
  return status === "succeeded" || status === "failed" || status === "canceled";
}

function applyAgentStreamEvent(message: AgentMessage, payload: AgentStreamEvent): AgentMessage {
  const nextEvents = appendAgentEventIfMissing(message.events ?? [], payload.event);
  const eventRunStatus = agentRunStatusFromEvent(payload.event);
  const nextRunStatus = eventRunStatus ?? (isTerminalAgentRunStatus(message.runStatus) ? message.runStatus : message.runStatus ?? "running");
  return {
    ...message,
    id: message.id.startsWith("local-assistant-") ? message.id : payload.assistantMessageId,
    content: appendAgentTextDelta(message.content, payload.event),
    events: nextEvents,
    runStatus: nextRunStatus
  };
}

function latestStoppableAgentClientRunId(messages: AgentMessage[], runningClientRunIds: Set<string>) {
  const activeAssistant = [...messages].reverse().find((message) => {
    if (message.role !== "assistant" || !message.clientRunId || !runningClientRunIds.has(message.clientRunId)) return false;
    const status = effectiveAgentRunStatus(message);
    return status === "queued" || status === "running";
  });
  return activeAssistant?.clientRunId ?? null;
}

function appendAgentTextDelta(currentContent: string, event: AgentEvent) {
  if (event.kind !== "text") return currentContent;
  const current = currentContent.trim();
  if (!current || agentStreamingPlaceholders.has(current)) return event.text;
  return `${currentContent}${event.text}`;
}

function appendAgentEventIfMissing(events: AgentEvent[], nextEvent: AgentEvent) {
  const lastEvent = events[events.length - 1];
  if (lastEvent && agentEventsEquivalent(lastEvent, nextEvent)) return events;
  if (lastEvent && isTerminalAgentEvent(lastEvent) && isTerminalAgentEvent(nextEvent)) return [...events.slice(0, -1), nextEvent];
  return [...events, nextEvent];
}

function isTerminalAgentEvent(event: AgentEvent) {
  return event.kind === "error" || (event.kind === "status" && (event.label === "succeeded" || event.label === "failed" || event.label === "canceled"));
}

function agentEventsEquivalent(left: AgentEvent, right: AgentEvent) {
  if (left.kind !== right.kind) return false;
  if (left.kind === "status" && right.kind === "status") return left.label === right.label && left.detail === right.detail;
  if (left.kind === "error" && right.kind === "error") return left.message === right.message;
  return false;
}

function replaceLocalCliAgent(agents: LocalCliAgent[], nextAgent: LocalCliAgent) {
  const nextAgents = agents.map((agent) => (agent.id === nextAgent.id ? nextAgent : agent));
  if (nextAgents.some((agent) => agent.id === nextAgent.id)) return nextAgents;
  return [...nextAgents, nextAgent];
}

function buildMissingClaudeCodeAgent(t: Translator): LocalCliAgent {
  return {
    id: "claude-code",
    name: "Claude Code",
    command: "claude",
    role: "agent",
    installed: false,
    connectionState: "not_installed",
    connectionLabel: t("cli.notFound", { name: "Claude Code" }),
    connectionDetail: t("cli.claudeNotFoundDetail"),
    diagnostics: [
      {
        state: "failed",
        label: "Claude Code CLI",
        detail: t("cli.claudeExecutableMissingDetail")
      }
    ],
    installCommand: "curl -fsSL https://claude.ai/install.sh | bash",
    loginCommand: "claude auth login",
    installSteps: [t("cli.claudeInstallStepInstall"), t("cli.claudeInstallStepLogin"), t("cli.claudeInstallStepRescan")],
    setupHint: t("cli.claudeSetupHint"),
    installUrl: "https://docs.anthropic.com/en/docs/claude-code",
    docsUrl: "https://docs.anthropic.com/en/docs/claude-code",
    guideUrl: LOCAL_CLI_GUIDE_URL
  };
}

function buildCodexCliAgentFromStatus(status: CodexCliStatus, t: Translator): LocalCliAgent {
  const diagnostics =
    status.state === "connected"
      ? [{ state: "passed" as const, label: t("cli.codexLoginStatus"), detail: status.detail || t("cli.codexConnectedDetail") }]
      : status.state === "needs_auth"
        ? [{ state: "warning" as const, label: t("cli.codexLoginStatus"), detail: status.detail || t("cli.codexNeedsAuthDetail") }]
        : [
            {
              state: "failed" as const,
              label: t("cli.codexStatus"),
              detail: status.detail || t("cli.codexUnavailableDetail")
            }
          ];

  return {
    id: "codex",
    name: "Codex CLI",
    command: "codex",
    role: "agent",
    installed: Boolean(status.path),
    version: status.version,
    path: status.path,
    connectionState: status.state,
    connectionLabel: status.label,
    connectionDetail: status.detail,
    diagnostics,
    installCommand: "curl -fsSL https://chatgpt.com/codex/install.sh | sh",
    loginCommand: "codex login --device-auth",
    installSteps: [t("cli.codexInstallStepInstall"), t("cli.codexInstallStepLogin"), t("cli.codexInstallStepRescan")],
    setupHint: t("cli.codexSetupHint"),
    installUrl: "https://developers.openai.com/codex/cli",
    docsUrl: "https://developers.openai.com/codex/cli",
    guideUrl: LOCAL_CLI_GUIDE_URL
  };
}

function buildDefaultAgentCliAgent(agentCliId: AgentCliId, codexStatus: CodexCliStatus, t: Translator): LocalCliAgent {
  if (agentCliId === "codex") return buildCodexCliAgentFromStatus(codexStatus, t);
  if (agentCliId === "claude-code") return buildMissingClaudeCodeAgent(t);
  return {
    id: agentCliId,
    name: agentCliDisplayName(agentCliId),
    command: agentCliId,
    role: "agent",
    installed: false,
    connectionState: "not_installed",
    connectionLabel: t("cli.notFound", { name: agentCliDisplayName(agentCliId) }),
    diagnostics: []
  };
}

function mergeLocalCliAgentsWithDefaults(agents: LocalCliAgent[], codexStatus: CodexCliStatus, t: Translator) {
  const byId = new Map<string, LocalCliAgent>();
  for (const agentCliId of ["codex", "claude-code"] as const) {
    byId.set(agentCliId, buildDefaultAgentCliAgent(agentCliId, codexStatus, t));
  }
  for (const agent of agents) {
    byId.set(agent.id, agent);
  }
  const orderedIds = [
    ...agentCliValues,
    ...agents.map((a) => a.id).filter((id) => !agentCliValues.includes(id as AgentCliId))
  ];
  return orderedIds.map((id) => byId.get(id)).filter((agent): agent is LocalCliAgent => Boolean(agent));
}

function agentCliDisplayName(agentCliId: AgentCliId) {
  if (agentCliId === "claude-code") return "Claude Code";
  if (agentCliId === "gemini-cli") return "Gemini CLI";
  if (agentCliId === "opencode") return "OpenCode";
  if (agentCliId === "cursor-agent") return "Cursor Agent";
  if (agentCliId === "kimi-cli") return "Kimi CLI";
  if (agentCliId.startsWith("custom:")) return agentCliId.slice("custom:".length);
  return "Codex CLI";
}

function getCliConnectionState(agent: LocalCliAgent | undefined, codexStatus: CodexCliStatus): CodexCliStatus["state"] {
  if (agent?.id === "codex") return codexStatus.state;
  return agent?.connectionState ?? "not_installed";
}

function getCliConnectionLabel(agent: LocalCliAgent | undefined, codexStatus: CodexCliStatus, fallbackName: string, t: Translator) {
  if (agent?.id === "codex") return localizeCodexStatusLabel(codexStatus, t);
  return agent?.connectionLabel ?? t("cli.notFound", { name: fallbackName });
}

function buildCliTestResult(agent: LocalCliAgent, t: Translator): CliTestResult {
  if (agent.connectionState === "connected") {
    return {
      state: "success",
      title: t("cliTest.successTitle", { name: agent.name }),
      detail: agent.connectionDetail || t("cliTest.successDetail", { name: agent.name })
    };
  }

  if (agent.connectionState === "needs_auth") {
    return {
      state: "warning",
      title: t("cliTest.warningTitle", { name: agent.name }),
      detail: agent.connectionDetail || t("cliTest.needsAuthDetail", { name: agent.name })
    };
  }

  return {
    state: "error",
    title: t("cliTest.errorTitle", { name: agent.name }),
    detail: agent.connectionDetail || agent.connectionLabel || (agent.installed ? t("cliTest.unknownStateDetail") : t("cliTest.executableMissingDetail"))
  };
}

export default function App({ initialPath = "/" }: { initialPath?: string }) {
  const initialRoute = parseAppRoute(initialPath);
  const [screen, setScreen] = useState<Screen>(initialRoute.screen);
  const [tab, setTab] = useState<WorkspaceTab>(initialRoute.tab);
  const [projectId, setProjectId] = useState(initialRoute.projectId);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [archivedProjects, setArchivedProjects] = useState<ProjectSummary[]>([]);
  const [deletedProjects, setDeletedProjects] = useState<ProjectSummary[]>([]);
  const [projectQuotaUsage, setProjectQuotaUsage] = useState(0);
  const [projectArchiveFilter, setProjectArchiveFilter] = useState<ProjectArchiveFilter>("active");
  const [projectDetail, setProjectDetail] = useState<ProjectDetail | null>(null);
  const [onboardingState, setOnboardingState] = useState<OnboardingState | null>(null);
  const [onboardingActionBusy, setOnboardingActionBusy] = useState(false);
  const [onboardingRevealAction, setOnboardingRevealAction] = useState<StoryboardAiAction | null>(null);
  const [onboardingStoryboardRevealCount, setOnboardingStoryboardRevealCount] = useState<number | null>(null);
  const [onboardingPresentationRequestId, setOnboardingPresentationRequestId] = useState(0);
  const [workspacePresentationOpen, setWorkspacePresentationOpen] = useState(false);
  const [isBooting, setIsBooting] = useState(true);
  const [bootError, setBootError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [projectCreateBusy, setProjectCreateBusy] = useState(false);
  const [pendingProjectAction, setPendingProjectAction] = useState<PendingProjectAction | null>(null);
  const [projectActionBusy, setProjectActionBusy] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectSummary | null>(null);
  const [projectEditBusy, setProjectEditBusy] = useState(false);
  const [accountAuthOpen, setAccountAuthOpen] = useState(false);
  const [accountAuthSection, setAccountAuthSection] = useState<SettingsSectionId>("runtime");
  const [byokSettings, setByokSettings] = useState<ByokSettingsSnapshot | null>(null);
  const [companionStatus, setCompanionStatus] = useState<CompanionServerStatus | null>(null);
  const [mcpBridgeStatus, setMcpBridgeStatus] = useState<McpBridgeStatus | null>(null);
  const [byokNotice, setByokNotice] = useState("");
  const [selectedAgentModel, setSelectedAgentModel] = useState<string>(() => readStoredString(AGENT_MODEL_STORAGE_KEY, "default") || "default");
  const [selectedAgentEffort, setSelectedAgentEffort] = useState<AgentEffortLevel>(() =>
    readStoredOption(AGENT_EFFORT_STORAGE_KEY, "medium", ["low", "medium", "high"] as const)
  );
  const [agentPermissionMode, setAgentPermissionMode] = useState<AgentPermissionMode>(() =>
    readStoredOption(AGENT_PERMISSION_MODE_STORAGE_KEY, "supervised", ["supervised", "auto-apply"] as const)
  );
  const [desktopVersionCheck, setDesktopVersionCheck] = useState<DesktopVersionCheckResult | null>(null);
  const [desktopVersionCheckBusy, setDesktopVersionCheckBusy] = useState(false);
  const [desktopVersionCheckError, setDesktopVersionCheckError] = useState("");
  const [interfaceLanguage, setInterfaceLanguage] = useState<InterfaceLanguage>(() => readStoredOption(LANGUAGE_STORAGE_KEY, "zh-CN", languageValues));
  const [projectNameInput, setProjectNameInput] = useState("");
  const [projectIconInput, setProjectIconInput] = useState("");
  const [projectImageRatioInput, setProjectImageRatioInput] = useState<ImageRatio>("16:9");
  const [templateInput, setTemplateInput] = useState(DEFAULT_TEMPLATE_ID);
  const [defaultTemplateId, setDefaultTemplateId] = useState(readStoredDefaultTemplateId);
  const [templateEditId, setTemplateEditId] = useState("");
  const [tasteInput, setTasteInput] = useState(DEFAULT_TASTE_ID);
  const [defaultTasteId, setDefaultTasteId] = useState(readStoredDefaultTasteId);
  const [projectSkillInput, setProjectSkillInput] = useState(() => getDefaultStoryboardSkillId(interfaceLanguage));
  const [createTasteDrawerOpen, setCreateTasteDrawerOpen] = useState(false);
  const [projectSkillDrawerOpen, setProjectSkillDrawerOpen] = useState(false);
  const [projectName, setProjectName] = useState(SAMPLE_PROJECT_NAME);
  const [agentConversations, setAgentConversations] = useState<AgentConversation[]>([]);
  const [activeAgentConversationId, setActiveAgentConversationId] = useState("");
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([]);
  const [agentOperationConfirmations, setAgentOperationConfirmations] = useState<AgentOperationConfirmation[]>([]);
  const [agentImageAttachments, setAgentImageAttachments] = useState<ProjectAsset[]>([]);
  const [agentBusy, setAgentBusy] = useState(false);
  const [activeAgentClientRunId, setActiveAgentClientRunId] = useState<string | null>(null);
  const [runningAgentClientRunIds, setRunningAgentClientRunIds] = useState<Set<string>>(() => new Set());
  const [runningAgentConversationRuns, setRunningAgentConversationRuns] = useState<Map<string, string>>(() => new Map());
  const [agentMediaGenerationPlaceholderRuns, setAgentMediaGenerationPlaceholderRuns] = useState<Map<string, AgentMediaGenerationPlaceholderRun>>(
    () => new Map()
  );
  const currentScreenRef = useRef(screen);
  const currentProjectIdRef = useRef(projectId);
  const externalProjectChangeHandlerRef = useRef<(event: ProjectChangedExternallyEvent) => void>(() => undefined);
  const externalProjectRefreshTimerRef = useRef<number | null>(null);
  const mcpOpenProjectHandlerRef = useRef<(request: McpOpenProjectRequest) => void>(() => undefined);
  const storyboardRowIdsRef = useRef<Set<string>>(new Set());
  const activeAgentConversationIdRef = useRef("");
  const generationRestoreProjectIdRef = useRef<string | null>(null);
  const storyboardMediaSubmitLockRef = useRef<StoryboardMediaSubmitLock | null>(null);
  const activeStoryboardMediaRunCountsRef = useRef<Map<string, Record<StoryboardMediaAiAction, number>>>(new Map());
  const activeStoryboardParseRunIdRef = useRef<string | null>(null);
  const activeAgentOperationConfirmationIdsRef = useRef<Set<string>>(new Set());
  const terminalAgentClientRunIdsRef = useRef<Set<string>>(new Set());
  const openedHyperframesStudioUrlsRef = useRef<Set<string>>(new Set());
  const onboardingIpcUnavailableRef = useRef(false);
  const onboardingPreviewPresentationPendingRef = useRef(false);
  const [codexStatusBusy, setCodexStatusBusy] = useState(false);
  const [cliAuthPolling, setCliAuthPolling] = useState(false);
  const cliAuthPollingRef = useRef(false);
  const selectedCliAutoConnectPromisesRef = useRef<Map<AgentCliId, Promise<boolean>>>(new Map());
  const selectedCliAutoConnectAttemptKeysRef = useRef<Set<string>>(new Set());
  const selectedCliAutoLoginAttemptedRef = useRef<Set<AgentCliId>>(new Set());
  const [codexStatus, setCodexStatus] = useState<CodexCliStatus>({
    state: "checking",
    label: fallbackTranslator("status.codex.checking")
  });
  const [localCliAgents, setLocalCliAgents] = useState<LocalCliAgent[]>([]);
  const [localCliScanBusy, setLocalCliScanBusy] = useState(false);
  const [selectedCliId, setSelectedCliId] = useState<AgentCliId>(() => readStoredOption(SELECTED_CLI_STORAGE_KEY, "codex", agentCliValues));
  const [cliTestBusy, setCliTestBusy] = useState(false);
  const [cliTestResult, setCliTestResult] = useState<CliTestResult | null>(null);
  const [storyboardBusyAction, setStoryboardBusyAction] = useState<StoryboardAiAction | null>(null);
  const storyboardGenerating = storyboardBusyAction !== null;
  const [storyboardImageGeneratingRowIds, setStoryboardImageGeneratingRowIds] = useState<Set<string>>(() => new Set());
  const [storyboardVideoGeneratingRowIds, setStoryboardVideoGeneratingRowIds] = useState<Set<string>>(() => new Set());
  const [storyboardImagePreflightRowIds, setStoryboardImagePreflightRowIds] = useState<Set<string>>(() => new Set());
  const [storyboardVideoPreflightRowIds, setStoryboardVideoPreflightRowIds] = useState<Set<string>>(() => new Set());
  const [storyboardImageGenerationTasks, setStoryboardImageGenerationTasks] = useState<StoryboardGenerationTaskItem[]>([]);
  const [storyboardVideoGenerationTasks, setStoryboardVideoGenerationTasks] = useState<StoryboardGenerationTaskItem[]>([]);
  const [scriptRichText, setScriptRichText] = useState("<p></p>");
  const [storyboardRows, setStoryboardRows] = useState<StoryboardRow[]>([]);
  const [storyboardColumns, setStoryboardColumns] = useState<StoryboardColumn[]>(() => getDefaultStoryboardColumns(interfaceLanguage));
  const [imageRatio, setImageRatio] = useState<ImageRatio>("16:9");
  const [assets, setAssets] = useState<ProjectAsset[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillsError, setSkillsError] = useState<string | null>(null);
  const [skillsHomeRequestId, setSkillsHomeRequestId] = useState(0);
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [tastes, setTastes] = useState<Taste[]>([]);
  const [tastesLoading, setTastesLoading] = useState(false);
  const [tastesError, setTastesError] = useState<string | null>(null);
  const [assetDropNotice, setAssetDropNotice] = useState<AssetDropNotice>({ kind: "default" });
  const [appearanceMode, setAppearanceMode] = useState<AppearanceMode>(() => readStoredOption(APPEARANCE_STORAGE_KEY, "light", appearanceValues));
  const [hyperframesVideoResolution, setHyperframesVideoResolution] = useState<HyperframesVideoResolution>(() =>
    readStoredOption(HYPERFRAMES_VIDEO_RESOLUTION_STORAGE_KEY, "1080p", [...hyperframesVideoResolutionValues])
  );
  const [seedanceVideoResolution, setSeedanceVideoResolution] = useState<SeedanceVideoResolution>(() =>
    readStoredOption(SEEDANCE_VIDEO_RESOLUTION_STORAGE_KEY, "720p", [...seedanceVideoResolutionValues])
  );
  const [hyperframesVideoConcurrency, setHyperframesVideoConcurrency] = useState<number>(() =>
    readStoredIntegerOption(HYPERFRAMES_VIDEO_CONCURRENCY_STORAGE_KEY, 2, hyperframesVideoConcurrencyOptions)
  );
  const [elevenLabsStatus, setElevenLabsStatus] = useState<ElevenLabsStatus | null>(null);
  const [elevenLabsDefaultVoiceId, setElevenLabsDefaultVoiceId] = useState(() => readStoredString(ELEVENLABS_DEFAULT_VOICE_STORAGE_KEY, ""));
  const [elevenLabsDefaultVoiceName, setElevenLabsDefaultVoiceName] = useState(() => readStoredString(ELEVENLABS_DEFAULT_VOICE_NAME_STORAGE_KEY, ""));
  const [systemPrefersDark, setSystemPrefersDark] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)").matches : false
  );
  const t = useMemo(() => createTranslator(interfaceLanguage), [interfaceLanguage]);
  const i18n = useMemo(() => ({ locale: interfaceLanguage, t }), [interfaceLanguage, t]);
  const visibleLocalCliAgents = useMemo(() => mergeLocalCliAgentsWithDefaults(localCliAgents, codexStatus, t), [codexStatus, localCliAgents, t]);
  const dropText = assetDropNoticeText(assetDropNotice, t);
  const projectMarkOptions = useMemo(() => localizeProjectMarkOptions(t), [t]);
  const orderedTemplates = useMemo(
    () => orderTemplatesWithPinnedDefault(templates.length > 0 ? templates : [getFallbackDefaultTemplate(interfaceLanguage)], defaultTemplateId),
    [defaultTemplateId, interfaceLanguage, templates]
  );
  const editingTemplate = useMemo(
    () => templates.find((template) => template.id === templateEditId && template.scope === "user") ?? null,
    [templateEditId, templates]
  );
  const templateOptions = useMemo(() => localizeProjectTemplates(orderedTemplates, t), [orderedTemplates, t]);
  const localProjectLimitReached = false;
  const projectLimitMessage = "";
  const createReady = Boolean(projectNameInput.trim() && projectIconInput && templateInput && tasteInput && projectSkillInput);
  const editReady = Boolean(editingProject && projectNameInput.trim() && projectIconInput && templateInput && tasteInput && projectSkillInput && !projectEditBusy);
  const runningAgentConversationIds = useMemo(() => new Set(runningAgentConversationRuns.values()), [runningAgentConversationRuns]);
  const selectedCli =
    visibleLocalCliAgents.find((agent) => agent.id === selectedCliId) ||
    (selectedCliId === "codex" ? buildCodexCliAgentFromStatus(codexStatus, t) : undefined);
  const selectedCliName = selectedCli?.name ?? agentCliDisplayName(selectedCliId);
  const selectedCliConnectionState = getCliConnectionState(selectedCli, codexStatus);
  const selectedCliConnectionLabel = getCliConnectionLabel(selectedCli, codexStatus, selectedCliName, t);
  const selectedCliStatusBusy = selectedCliId === "codex" ? codexStatusBusy : localCliScanBusy;
  const agentImageGenerationPlaceholderRowIds = useMemo(
    () => collectAgentMediaGenerationPlaceholderRowIds(agentMediaGenerationPlaceholderRuns, projectId, "image"),
    [agentMediaGenerationPlaceholderRuns, projectId]
  );
  const agentVideoGenerationPlaceholderRowIds = useMemo(
    () => collectAgentMediaGenerationPlaceholderRowIds(agentMediaGenerationPlaceholderRuns, projectId, "video"),
    [agentMediaGenerationPlaceholderRuns, projectId]
  );
  const storyboardImageVisibleGeneratingRowIds = useMemo(
    () => mergeGenerationRowIdSets(storyboardImageGeneratingRowIds, storyboardImagePreflightRowIds, agentImageGenerationPlaceholderRowIds),
    [agentImageGenerationPlaceholderRowIds, storyboardImageGeneratingRowIds, storyboardImagePreflightRowIds]
  );
  const storyboardVideoVisibleGeneratingRowIds = useMemo(
    () => mergeGenerationRowIdSets(storyboardVideoGeneratingRowIds, storyboardVideoPreflightRowIds, agentVideoGenerationPlaceholderRowIds),
    [agentVideoGenerationPlaceholderRowIds, storyboardVideoGeneratingRowIds, storyboardVideoPreflightRowIds]
  );
  const visibleProjectsForInterfaceLanguage = useMemo(
    () => filterProjectsForInterfaceLanguage(projects, interfaceLanguage),
    [interfaceLanguage, projects]
  );
  const visibleArchivedProjectsForInterfaceLanguage = useMemo(
    () => filterProjectsForInterfaceLanguage(archivedProjects, interfaceLanguage),
    [archivedProjects, interfaceLanguage]
  );

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystemPreference = () => setSystemPrefersDark(mediaQuery.matches);
    syncSystemPreference();
    mediaQuery.addEventListener("change", syncSystemPreference);

    return () => mediaQuery.removeEventListener("change", syncSystemPreference);
  }, []);

  useEffect(() => {
    const effectiveTheme = appearanceMode === "system" ? (systemPrefersDark ? "dark" : "light") : appearanceMode;
    const root = document.documentElement;

    root.lang = interfaceLanguage;
    root.dataset.theme = effectiveTheme;
    root.dataset.appearanceMode = appearanceMode;

    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, interfaceLanguage);
      window.localStorage.setItem(APPEARANCE_STORAGE_KEY, appearanceMode);
    } catch {
      // Local storage can be unavailable in hardened shells; keep the in-memory preference.
    }
  }, [appearanceMode, interfaceLanguage, systemPrefersDark]);

  useEffect(() => {
    if (isBooting || !window.mkboard) return;
    async function syncInterfaceLanguageData() {
      setProjectSkillInput((currentSkillId) => (isDefaultStoryboardSkillId(currentSkillId) ? getDefaultStoryboardSkillId(interfaceLanguage) : currentSkillId));
      await ensureTutorialProjectIfAvailable("language sync");
      await Promise.all([refreshTemplates(), refreshProjects(), refreshSkills()]);
      setOnboardingState(await getOnboardingStateIfAvailable());
      if (projectDetail?.project.id) {
        const nextProjectId = isTutorialProject(projectDetail.project) ? getTutorialProjectId(interfaceLanguage) : projectDetail.project.id;
        await loadProject(nextProjectId);
        if (nextProjectId !== projectDetail.project.id && (screen === "workspace" || screen === "assets")) {
          applyRoute({ screen, projectId: nextProjectId, tab }, "replace");
        }
      }
    }
    void syncInterfaceLanguageData();
  }, [interfaceLanguage]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SELECTED_CLI_STORAGE_KEY, selectedCliId);
    } catch {
      // Local storage can be unavailable in hardened shells; keep the in-memory selection.
    }
  }, [selectedCliId]);

  useEffect(() => {
    if (isBooting || !window.mkboard) return;
    const routeKey = screen === "workspace" || screen === "assets" ? `${selectedCliId}:${screen}:${projectId || "none"}` : `${selectedCliId}:app`;
    if (selectedCliAutoConnectAttemptKeysRef.current.has(routeKey)) return;
    selectedCliAutoConnectAttemptKeysRef.current.add(routeKey);
    const openLoginWhenNeeded = !selectedCliAutoLoginAttemptedRef.current.has(selectedCliId);
    if (openLoginWhenNeeded) selectedCliAutoLoginAttemptedRef.current.add(selectedCliId);
    void autoConnectSelectedCli("app-route", { openLoginWhenNeeded });
  }, [isBooting, projectId, screen, selectedCliId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(HYPERFRAMES_VIDEO_RESOLUTION_STORAGE_KEY, hyperframesVideoResolution);
    } catch {
      // Local storage can be unavailable in hardened shells; keep the in-memory selection.
    }
  }, [hyperframesVideoResolution]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SEEDANCE_VIDEO_RESOLUTION_STORAGE_KEY, seedanceVideoResolution);
    } catch {
      // Local storage can be unavailable in hardened shells; keep the in-memory selection.
    }
  }, [seedanceVideoResolution]);

  useEffect(() => {
    try {
      window.localStorage.setItem(HYPERFRAMES_VIDEO_CONCURRENCY_STORAGE_KEY, String(hyperframesVideoConcurrency));
    } catch {
      // Local storage can be unavailable in hardened shells; keep the in-memory selection.
    }
  }, [hyperframesVideoConcurrency]);

  useEffect(() => {
    try {
      window.localStorage.setItem(ELEVENLABS_DEFAULT_VOICE_STORAGE_KEY, elevenLabsDefaultVoiceId);
      window.localStorage.setItem(ELEVENLABS_DEFAULT_VOICE_NAME_STORAGE_KEY, elevenLabsDefaultVoiceName);
    } catch {
      // Local storage can be unavailable in hardened shells; keep the in-memory selection.
    }
  }, [elevenLabsDefaultVoiceId, elevenLabsDefaultVoiceName]);

  useEffect(() => {
    if (!window.mkboard) return;
    window.mkboard
      .getElevenLabsStatus()
      .then(setElevenLabsStatus)
      .catch(() => setElevenLabsStatus(null));
  }, []);

  useEffect(() => {
    if (tastes.length === 0) return;
    const resolvedTasteId = getDefaultCreateTasteId(tastes, defaultTasteId);
    if (resolvedTasteId !== defaultTasteId) setDefaultTasteId(resolvedTasteId);
  }, [defaultTasteId, tastes]);

  useEffect(() => {
    try {
      window.localStorage.setItem(DEFAULT_TASTE_STORAGE_KEY, defaultTasteId);
    } catch {
      // Local storage can be unavailable in hardened shells; keep the in-memory preference.
    }
  }, [defaultTasteId]);

  useEffect(() => {
    if (templates.length === 0) return;
    const resolvedTemplateId = getDefaultCreateTemplateId(templates, defaultTemplateId);
    if (resolvedTemplateId !== defaultTemplateId) setDefaultTemplateId(resolvedTemplateId);
  }, [defaultTemplateId, templates]);

  useEffect(() => {
    try {
      window.localStorage.setItem(DEFAULT_TEMPLATE_STORAGE_KEY, defaultTemplateId);
    } catch {
      // Local storage can be unavailable in hardened shells; keep the in-memory preference.
    }
  }, [defaultTemplateId]);

  useEffect(() => {
    async function syncRouteFromLocation() {
      const nextRoute = parseAppRoute(window.location.pathname);
      setScreen(nextRoute.screen);
      setProjectId(nextRoute.projectId);
      setTab(nextRoute.tab);
      setTemplateEditId(nextRoute.templateId ?? "");
      if (nextRoute.screen === "workspace") {
        await loadProject(nextRoute.projectId);
      } else if (nextRoute.screen === "projects") {
        await Promise.all([refreshProjects(), refreshArchivedProjects()]);
      } else if (nextRoute.screen === "assets") {
        const loadedProjects = await window.mkboard.listProjects();
        setProjects(loadedProjects);
        const nextProjectId = nextRoute.projectId || loadedProjects[0]?.id;
        if (nextProjectId) await loadProject(nextProjectId);
      } else if (nextRoute.screen === "skills") {
        try {
          await refreshSkills();
        } catch {
          // The SKILL page stays visible and shows the load error.
        }
      } else if (nextRoute.screen === "taste") {
        try {
          await refreshTastes();
        } catch {
          // The Taste page stays visible and shows the load error.
        }
      } else if (nextRoute.screen === "templates" || nextRoute.screen === "template-create" || nextRoute.screen === "template-edit") {
        await refreshTemplates();
        if (nextRoute.screen === "template-create" || nextRoute.screen === "template-edit") {
          try {
            await refreshSkills();
          } catch {
            // The template creator can still show a SKILL loading error.
          }
        }
      } else if (nextRoute.screen === "trash") {
        setDeletedProjects(await window.mkboard.listDeletedProjects());
      } else if (nextRoute.screen === "projects") {
        await Promise.all([refreshProjects(), refreshArchivedProjects(), refreshProjectQuotaUsage()]);
      }
    }

    void bootstrap();
    window.addEventListener("popstate", syncRouteFromLocation);

    return () => {
      window.removeEventListener("popstate", syncRouteFromLocation);
    };
  }, []);

  useEffect(() => {
    setCliTestResult(null);
  }, [selectedCliId]);

  useEffect(() => {
    currentProjectIdRef.current = projectId;
  }, [projectId]);

  useEffect(() => {
    currentScreenRef.current = screen;
  }, [screen]);

  useEffect(() => {
    activeAgentConversationIdRef.current = activeAgentConversationId;
  }, [activeAgentConversationId]);

  function setCurrentActiveAgentConversationId(nextConversationId: string | ((currentConversationId: string) => string)) {
    setActiveAgentConversationId((currentConversationId) => {
      const resolvedConversationId = typeof nextConversationId === "function" ? nextConversationId(currentConversationId) : nextConversationId;
      activeAgentConversationIdRef.current = resolvedConversationId;
      return resolvedConversationId;
    });
  }

  function isCurrentProjectId(targetProjectId: string) {
    return currentProjectIdRef.current === targetProjectId;
  }

  function isCurrentWorkspaceProjectId(targetProjectId: string) {
    return currentScreenRef.current === "workspace" && isCurrentProjectId(targetProjectId);
  }

  function getCurrentStoryboardRowIds(): Set<string> {
    return new Set(storyboardRowIdsRef.current);
  }

  function storyboardRowIdSetsEqual(left: Set<string>, right: Set<string>): boolean {
    return left.size === right.size && [...left].every((rowId) => right.has(rowId));
  }

  function trackStoryboardRows(rows: StoryboardRow[]): void {
    storyboardRowIdsRef.current = new Set(rows.map((row) => row.id).filter(Boolean));
    setStoryboardRows(rows);
  }

  function acquireStoryboardMediaSubmitLock(action: StoryboardMediaAiAction, targetProjectId: string) {
    if (storyboardMediaSubmitLockRef.current || storyboardBusyAction === "parse" || getStoryboardMediaRunCount(action, targetProjectId) > 0) return false;
    storyboardMediaSubmitLockRef.current = { action, projectId: targetProjectId };
    const currentRunCounts = activeStoryboardMediaRunCountsRef.current.get(targetProjectId) ?? { images: 0, videos: 0 };
    activeStoryboardMediaRunCountsRef.current.set(targetProjectId, {
      ...currentRunCounts,
      [action]: currentRunCounts[action] + 1
    });
    setStoryboardBusyAction(action);
    return true;
  }

  function releaseStoryboardMediaSubmitLock(action: StoryboardMediaAiAction, targetProjectId: string) {
    const currentLock = storyboardMediaSubmitLockRef.current;
    if (currentLock?.action === action && currentLock.projectId === targetProjectId) {
      storyboardMediaSubmitLockRef.current = null;
    }
  }

  function finishStoryboardMediaRun(action: StoryboardMediaAiAction, targetProjectId: string) {
    releaseStoryboardMediaSubmitLock(action, targetProjectId);
    const currentRunCounts = activeStoryboardMediaRunCountsRef.current.get(targetProjectId) ?? { images: 0, videos: 0 };
    const nextRunCounts = { ...currentRunCounts, [action]: Math.max(0, currentRunCounts[action] - 1) };
    if (nextRunCounts.images === 0 && nextRunCounts.videos === 0) activeStoryboardMediaRunCountsRef.current.delete(targetProjectId);
    else activeStoryboardMediaRunCountsRef.current.set(targetProjectId, nextRunCounts);
    if (isCurrentProjectId(targetProjectId)) {
      setStoryboardBusyAction((currentAction) => (currentAction === action ? getActiveStoryboardMediaRunAction(targetProjectId) : currentAction));
    }
  }

  function clearStoryboardGenerationUiState() {
    storyboardMediaSubmitLockRef.current = null;
    activeStoryboardParseRunIdRef.current = null;
    setStoryboardBusyAction(null);
    setStoryboardImageGeneratingRowIds(new Set());
    setStoryboardVideoGeneratingRowIds(new Set());
    setStoryboardImagePreflightRowIds(new Set());
    setStoryboardVideoPreflightRowIds(new Set());
    setStoryboardImageGenerationTasks([]);
    setStoryboardVideoGenerationTasks([]);
  }

  function getStoryboardMediaRunCount(action: StoryboardMediaAiAction, targetProjectId = currentProjectIdRef.current): number {
    return activeStoryboardMediaRunCountsRef.current.get(targetProjectId)?.[action] ?? 0;
  }

  function getActiveStoryboardMediaRunAction(targetProjectId = currentProjectIdRef.current): StoryboardMediaAiAction | null {
    const runCounts = activeStoryboardMediaRunCountsRef.current.get(targetProjectId) ?? { images: 0, videos: 0 };
    if (runCounts.videos > 0) return "videos";
    if (runCounts.images > 0) return "images";
    return null;
  }

  function finishStoryboardParseRun(clientRunId: string) {
    if (activeStoryboardParseRunIdRef.current !== clientRunId) return;
    activeStoryboardParseRunIdRef.current = null;
    setStoryboardBusyAction((currentAction) => (currentAction === "parse" ? null : currentAction));
  }

  function markAgentConversationRunRunning(clientRunId: string, conversationId: string) {
    setRunningAgentConversationRuns((current) => {
      if (current.get(clientRunId) === conversationId) return current;
      const next = new Map(current);
      next.set(clientRunId, conversationId);
      return next;
    });
  }

  function markAgentConversationRunStopped(clientRunId: string) {
    setRunningAgentConversationRuns((current) => {
      if (!current.has(clientRunId)) return current;
      const next = new Map(current);
      next.delete(clientRunId);
      return next;
    });
  }

  function markAgentClientRunRunning(clientRunId: string, conversationId?: string) {
    terminalAgentClientRunIdsRef.current.delete(clientRunId);
    if (conversationId) markAgentConversationRunRunning(clientRunId, conversationId);
    setRunningAgentClientRunIds((current) => {
      if (current.has(clientRunId)) return current;
      const next = new Set(current);
      next.add(clientRunId);
      return next;
    });
  }

  function hasAgentClientRunTerminalEvent(clientRunId: string): boolean {
    return terminalAgentClientRunIdsRef.current.has(clientRunId);
  }

  function markAgentClientRunTerminal(clientRunId: string) {
    terminalAgentClientRunIdsRef.current.add(clientRunId);
    markAgentClientRunStopped(clientRunId);
  }

  function markAgentClientRunStopped(clientRunId: string) {
    markAgentConversationRunStopped(clientRunId);
    setRunningAgentClientRunIds((current) => {
      if (!current.has(clientRunId)) return current;
      const next = new Set(current);
      next.delete(clientRunId);
      return next;
    });
  }

  function clearByokNotice() {
    setByokNotice("");
  }

  async function refreshByokAndCompanion() {
    try {
      const [nextByok, nextCompanion, nextMcp] = await Promise.all([
        window.mkboard?.getByokSettings ? window.mkboard.getByokSettings() : Promise.resolve(null),
        window.mkboard?.getCompanionStatus ? window.mkboard.getCompanionStatus() : Promise.resolve(null),
        window.mkboard?.getMcpBridgeStatus ? window.mkboard.getMcpBridgeStatus() : Promise.resolve(null)
      ]);
      if (nextByok) setByokSettings(nextByok);
      if (nextCompanion) setCompanionStatus(nextCompanion);
      if (nextMcp) setMcpBridgeStatus(nextMcp);
    } catch (error) {
      console.warn("Failed to load BYOK / Companion status", error);
    }
  }

  useEffect(() => {
    void refreshByokAndCompanion();
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(AGENT_MODEL_STORAGE_KEY, selectedAgentModel);
    } catch {}
  }, [selectedAgentModel]);

  useEffect(() => {
    try {
      window.localStorage.setItem(AGENT_EFFORT_STORAGE_KEY, selectedAgentEffort);
    } catch {}
  }, [selectedAgentEffort]);

  useEffect(() => {
    try {
      window.localStorage.setItem(AGENT_PERMISSION_MODE_STORAGE_KEY, agentPermissionMode);
    } catch {}
  }, [agentPermissionMode]);

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = window.mkboard?.onDesktopUpdateStateChanged?.((state) => {
      if (!cancelled) setDesktopVersionCheck(state);
    });
    async function checkDesktopVersion() {
      if (!window.mkboard?.checkDesktopVersion) return;
      try {
        const result = await window.mkboard.checkDesktopVersion();
        if (!cancelled) setDesktopVersionCheck(result);
      } catch (error) {
        console.warn("Failed to check desktop version", error);
      }
    }

    void checkDesktopVersion();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (!window.mkboard?.onAgentEvent) return undefined;
    return window.mkboard.onAgentEvent((payload) => {
      const nextRunStatus = agentRunStatusFromEvent(payload.event);
      const terminalRun = nextRunStatus === "succeeded" || nextRunStatus === "failed" || nextRunStatus === "canceled";
      const completedStoryboardParse = terminalRun && activeStoryboardParseRunIdRef.current === payload.clientRunId;
      if (terminalRun) {
        finishStoryboardParseRun(payload.clientRunId);
      }
      if (payload.projectId !== currentProjectIdRef.current) {
        if (terminalRun) {
          markAgentClientRunTerminal(payload.clientRunId);
        } else if (!hasAgentClientRunTerminalEvent(payload.clientRunId)) {
          markAgentConversationRunRunning(payload.clientRunId, payload.conversationId);
        }
        return;
      }
      if (nextRunStatus === "succeeded" || nextRunStatus === "failed") {
        setAgentConversations((conversations) =>
          conversations.map((conversation) =>
            conversation.id === payload.conversationId ? { ...conversation, hasUnreadCompletion: true } : conversation
          )
        );
      }
      if (nextRunStatus === "succeeded" || nextRunStatus === "failed" || nextRunStatus === "canceled") {
        markAgentClientRunTerminal(payload.clientRunId);
        setAgentBusy(false);
        setActiveAgentClientRunId((currentRunId) => (currentRunId === payload.clientRunId ? null : currentRunId));
      } else if (!hasAgentClientRunTerminalEvent(payload.clientRunId)) {
        markAgentClientRunRunning(payload.clientRunId, payload.conversationId);
        setAgentBusy(true);
        setActiveAgentClientRunId(payload.clientRunId);
      }
      setAgentMessages((messages) =>
        messages.map((message) => {
          if (message.clientRunId !== payload.clientRunId && message.id !== payload.assistantMessageId) return message;
          return applyAgentStreamEvent(message, payload);
        })
      );
      if (completedStoryboardParse && nextRunStatus === "succeeded") {
        void window.mkboard.getProject(payload.projectId, interfaceLanguage).then((detail) => {
          if (isCurrentProjectId(payload.projectId)) applyProjectDetail(detail);
        }).catch((error) => console.warn("Failed to refresh project after restored storyboard parse", error));
      }
    });
  }, []);

  useEffect(() => {
    if (!window.mkboard?.onStoryboardVideoGenerationEvent) return undefined;
    return window.mkboard.onStoryboardVideoGenerationEvent((payload) => {
      if (payload.projectId !== currentProjectIdRef.current) return;
      const expectedStoryboardRowIds = getCurrentStoryboardRowIds();
      if (expectedStoryboardRowIds.size > 0 && !expectedStoryboardRowIds.has(payload.rowId)) return;
      if (payload.mediaUpdate) applyShotMediaUpdate(payload.mediaUpdate, payload.projectId, expectedStoryboardRowIds);
      setStoryboardVideoGenerationTasks((currentTasks) => upsertVideoGenerationEventTask(currentTasks, payload));
      if (payload.method === "Hyperframes" && payload.studioUrl && payload.autoOpenStudio === true) {
        const openedUrls = openedHyperframesStudioUrlsRef.current;
        const studioOpenKey = payload.workDir || payload.studioUrl;
        if (!openedUrls.has(studioOpenKey)) {
          openedUrls.add(studioOpenKey);
          void window.mkboard.openHyperframesStudio({ studioUrl: payload.studioUrl, workDir: payload.workDir }).catch((error) => {
            console.warn("Failed to open HyperFrames Studio", error);
          });
        }
      }
      setStoryboardVideoGeneratingRowIds((currentRowIds) => {
        const nextRowIds = new Set(currentRowIds);
        if (isActiveGenerationTaskStatus(payload.status)) {
          nextRowIds.add(payload.rowId);
        } else {
          nextRowIds.delete(payload.rowId);
        }
        return nextRowIds;
      });
      if (payload.status === "succeeded") {
        void window.mkboard.getProject(payload.projectId, interfaceLanguage).then((detail) => {
          if (currentProjectIdRef.current === payload.projectId) {
            applyProjectDetail(detail, { expectedStoryboardRowIds });
          }
        }).catch((error) => console.warn("Failed to refresh project after video generation event", error));
      }
    });
  }, []);

  useEffect(() => {
    if (storyboardBusyAction !== "videos" || storyboardVideoGenerationTasks.length === 0) return;
    if (storyboardVideoPreflightRowIds.size > 0 || getStoryboardMediaRunCount("videos") > 0) return;
    if (storyboardVideoGenerationTasks.some((task) => isActiveGenerationTaskStatus(task.status))) return;
    setStoryboardVideoGeneratingRowIds(new Set());
    setStoryboardBusyAction(null);
  }, [storyboardBusyAction, storyboardVideoGenerationTasks, storyboardVideoPreflightRowIds]);

  const activeViewProjectId = screen === "workspace" || screen === "assets" ? projectDetail?.project.id ?? null : null;
  useEffect(() => {
    window.mkboard?.reportActiveView?.({
      projectId: activeViewProjectId,
      screen,
      tab,
      agentCliId: selectedCliId,
      interfaceLanguage,
      speechVoiceId: elevenLabsDefaultVoiceId,
      hyperframesResolution: hyperframesVideoResolution,
      seedanceResolution: seedanceVideoResolution,
      hyperframesConcurrency: hyperframesVideoConcurrency
    });
  }, [
    activeViewProjectId,
    screen,
    tab,
    selectedCliId,
    interfaceLanguage,
    elevenLabsDefaultVoiceId,
    hyperframesVideoResolution,
    seedanceVideoResolution,
    hyperframesVideoConcurrency
  ]);

  function leaveProjectRemovedExternally(nextProjects: ProjectSummary[], keepFallback: boolean) {
    const fallbackProject = keepFallback ? nextProjects[0] : undefined;
    setProjectDetail(null);
    setProjectId(fallbackProject?.id ?? "");
    setProjectName(fallbackProject?.name ?? "");
    setAgentConversations([]);
    setCurrentActiveAgentConversationId("");
    setAgentMessages([]);
    setAgentOperationConfirmations([]);
  }

  externalProjectChangeHandlerRef.current = (event: ProjectChangedExternallyEvent) => {
    if (event.tool === "create_project") {
      void Promise.all([refreshProjects(), refreshProjectQuotaUsage()]).catch((error) => console.warn("Failed to refresh projects after MCP create_project", error));
    }
    if (MCP_PROJECT_LIFECYCLE_TOOLS.has(event.tool)) {
      // MCP renamed, archived, trashed, restored or deleted a project: refresh every list like the project menu does.
      const changedProjectId = event.projectId;
      void Promise.all([refreshProjects(), refreshArchivedProjects(), refreshDeletedProjects(), refreshProjectQuotaUsage()])
        .then(([nextProjects]) => {
          if (projectId === changedProjectId && !nextProjects.some((project) => project.id === changedProjectId)) {
            leaveProjectRemovedExternally(nextProjects, event.tool !== "delete_project_permanently");
          }
        })
        .catch((error) => console.warn(`Failed to refresh projects after MCP ${event.tool}`, error));
      if (event.tool !== "update_project") return;
    }
    if (!isCurrentProjectId(event.projectId)) return;
    if (event.tool === "generation_started") {
      // MCP submitted MkBoard image/video generation: show its progress like a toolbar run.
      void restoreActiveStoryboardGenerationState(event.projectId).catch((error) =>
        console.warn("Failed to restore storyboard generation started by MCP", error)
      );
      return;
    }
    if (event.tool === "split_storyboard_started") {
      // MCP started MkBoard's own AI 解析分镜: reload like opening the project so the run shows as busy.
      void loadProject(event.projectId).catch((error) => console.warn("Failed to restore storyboard parse started by MCP", error));
      return;
    }
    if (externalProjectRefreshTimerRef.current) window.clearTimeout(externalProjectRefreshTimerRef.current);
    externalProjectRefreshTimerRef.current = window.setTimeout(() => {
      externalProjectRefreshTimerRef.current = null;
      void window.mkboard
        .getProject(event.projectId, interfaceLanguage)
        .then((detail) => {
          if (isCurrentProjectId(event.projectId)) applyExternalProjectDetail(detail);
        })
        .catch((error) => console.warn("Failed to refresh project after external MCP change", error));
    }, 120);
  };

  mcpOpenProjectHandlerRef.current = (request: McpOpenProjectRequest) => {
    void (async () => {
      const summaries = await window.mkboard.listProjects();
      const summary = summaries.find((project) => project.id === request.projectId);
      if (!summary) return;
      await openProject(summary.id, summary.name, request.tab);
    })().catch((error) => console.warn("Failed to open project requested by MCP", error));
  };

  useEffect(() => {
    if (!window.mkboard?.onProjectChangedExternally) return undefined;
    return window.mkboard.onProjectChangedExternally((event) => externalProjectChangeHandlerRef.current(event));
  }, []);

  useEffect(() => {
    if (!window.mkboard?.onMcpOpenProjectRequest) return undefined;
    return window.mkboard.onMcpOpenProjectRequest((request) => mcpOpenProjectHandlerRef.current(request));
  }, []);

  useEffect(() => {
    const currentProjectId = projectDetail?.project.id;
    if (!currentProjectId || !window.mkboard?.onAgentConversationTitle) return undefined;
    return window.mkboard.onAgentConversationTitle((payload) => {
      if (payload.projectId !== currentProjectId) return;
      setAgentConversations(payload.conversations);
      setCurrentActiveAgentConversationId((activeId) => activeId || payload.activeConversationId);
    });
  }, [projectDetail?.project.id]);

  useEffect(() => {
    if (screen !== "workspace" || tab !== "storyboard" || !projectDetail?.project.id || storyboardBusyAction === "parse") return;
    if (storyboardImagePreflightRowIds.size > 0 || storyboardVideoPreflightRowIds.size > 0) return;
    void restoreActiveStoryboardGenerationState(projectDetail.project.id);
  }, [projectDetail?.project.id, screen, storyboardBusyAction, storyboardImagePreflightRowIds, storyboardVideoPreflightRowIds, tab]);

  async function ensureTutorialProjectIfAvailable(action: string): Promise<ProjectDetail | null> {
    if (onboardingIpcUnavailableRef.current) return null;
    try {
      return await window.mkboard.ensureTutorialProject(interfaceLanguage);
    } catch (error) {
      if (!isMissingOnboardingIpcHandlerError(error)) throw error;
      onboardingIpcUnavailableRef.current = true;
      setOnboardingState(null);
      logMissingOnboardingIpcHandler(action, error);
      return null;
    }
  }

  async function getOnboardingStateIfAvailable(): Promise<OnboardingState | null> {
    if (onboardingIpcUnavailableRef.current) return null;
    try {
      return await window.mkboard.getOnboardingState(interfaceLanguage);
    } catch (error) {
      if (!isMissingOnboardingIpcHandlerError(error)) throw error;
      onboardingIpcUnavailableRef.current = true;
      logMissingOnboardingIpcHandler("state load", error);
      return null;
    }
  }

  async function bootstrap() {
    setIsBooting(true);
    setBootError("");
    try {
      if (!window.mkboard) {
        throw new Error(t("app.error.preloadMissing"));
      }
      void refreshCodexStatus();
      void refreshLocalCliAgents();
      void refreshTemplates();
      void refreshTastes();
      await ensureTutorialProjectIfAvailable("bootstrap");
      setOnboardingState(await getOnboardingStateIfAvailable());
      const loadedProjects = await window.mkboard.listProjects();
      setProjects(loadedProjects);
      setArchivedProjects(await window.mkboard.listArchivedProjects());
      await refreshProjectQuotaUsage();
      const route = parseAppRoute(window.location.pathname);
      if (route.screen === "workspace") {
        await loadProject(route.projectId);
      } else if (route.screen === "assets") {
        const nextProjectId = route.projectId || loadedProjects[0]?.id;
        if (nextProjectId) {
          await loadProject(nextProjectId);
        } else {
          setProjectId("");
          setProjectName("");
          setAssets([]);
          setAgentConversations([]);
          setCurrentActiveAgentConversationId("");
          setAgentMessages([]);
        }
        setScreen("assets");
      } else if (route.screen === "trash") {
        setDeletedProjects(await window.mkboard.listDeletedProjects());
        setScreen("trash");
      } else if (route.screen === "skills") {
        setScreen("skills");
        try {
          await refreshSkills();
        } catch {
          // Keep booting into the SKILL page so the user can see and retry the error.
        }
      } else if (route.screen === "taste") {
        setScreen("taste");
        try {
          await refreshTastes();
        } catch {
          // Keep booting into the Taste page so the user can see and retry the error.
        }
      } else if (route.screen === "templates") {
        await refreshTemplates();
        setScreen("templates");
      } else if (route.screen === "template-create") {
        await refreshTemplates();
        try {
          await refreshSkills();
        } catch {
          // Keep booting into the template creator so the user can see and retry the error.
        }
        setScreen("template-create");
      } else if (route.screen === "template-edit") {
        await refreshTemplates();
        try {
          await refreshSkills();
        } catch {
          // Keep booting into the template editor so the user can see and retry the error.
        }
        setTemplateEditId(route.templateId ?? "");
        setScreen("template-edit");
      } else {
        setScreen("projects");
        if (loadedProjects[0]) {
          setProjectId(loadedProjects[0].id);
          setProjectName(loadedProjects[0].name);
        }
      }
    } catch (error) {
      setBootError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsBooting(false);
    }
  }

  async function refreshProjects() {
    const loadedProjects = await window.mkboard.listProjects();
    setProjects(loadedProjects);
    return loadedProjects;
  }

  async function refreshArchivedProjects() {
    const loadedArchivedProjects = await window.mkboard.listArchivedProjects();
    setArchivedProjects(loadedArchivedProjects);
    return loadedArchivedProjects;
  }

  async function refreshDeletedProjects() {
    const loadedDeletedProjects = await window.mkboard.listDeletedProjects();
    setDeletedProjects(loadedDeletedProjects);
    return loadedDeletedProjects;
  }

  async function refreshProjectQuotaUsage() {
    const nextProjectQuotaUsage = await window.mkboard.countRetainedProjects();
    setProjectQuotaUsage(nextProjectQuotaUsage);
    return nextProjectQuotaUsage;
  }

  async function refreshTemplates() {
    const loadedTemplates = await window.mkboard.listTemplates(interfaceLanguage);
    setTemplates(loadedTemplates);
    setTemplateInput((currentTemplateId) =>
      loadedTemplates.some((template) => template.id === currentTemplateId)
        ? currentTemplateId
        : getDefaultCreateTemplateId(loadedTemplates, defaultTemplateId)
    );
    return loadedTemplates;
  }

  async function refreshTastes() {
    setTastesLoading(true);
    setTastesError(null);
    try {
      const loadedTastes = await window.mkboard.listTastes();
      setTastes(loadedTastes);
      setTasteInput((currentTasteId) => (loadedTastes.some((taste) => taste.id === currentTasteId) ? currentTasteId : getDefaultCreateTasteId(loadedTastes, defaultTasteId)));
      return loadedTastes;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setTastesError(message);
      throw error;
    } finally {
      setTastesLoading(false);
    }
  }

  async function refreshSkills() {
    setSkillsLoading(true);
    setSkillsError(null);
    try {
      const loadedSkills = await window.mkboard.listSkills(interfaceLanguage);
      setSkills(loadedSkills);
      return loadedSkills;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSkillsError(message);
      throw error;
    } finally {
      setSkillsLoading(false);
    }
  }

  async function refreshCodexStatus(): Promise<CodexCliStatus> {
    setCodexStatusBusy(true);
    try {
      const status = await window.mkboard.getCodexStatus();
      setCodexStatus(status);
      return status;
    } catch (error) {
      const status: CodexCliStatus = {
        state: "error",
        label: t("status.codex.checkFailed"),
        detail: error instanceof Error ? error.message : String(error)
      };
      setCodexStatus(status);
      return status;
    } finally {
      setCodexStatusBusy(false);
    }
  }

  async function refreshLocalCliAgents(): Promise<LocalCliAgent[]> {
    setLocalCliScanBusy(true);
    try {
      const agents = await window.mkboard.scanLocalCliAgents();
      setLocalCliAgents(agents);
      setSelectedCliId((currentId) => {
        if (agents.some((agent) => agent.id === currentId && agent.installed)) return currentId;
        const fallbackAgent = agents.find((agent): agent is LocalCliAgent & { id: AgentCliId } => agent.installed && isAgentCliId(agent.id));
        return fallbackAgent?.id ?? "codex";
      });
      return agents;
    } finally {
      setLocalCliScanBusy(false);
    }
  }

  async function testSelectedCliStatus() {
    setCliTestResult(null);
    setCliTestBusy(true);
    try {
      try {
        setCliTestResult(await testSelectedAgentCliStatus());
      } catch (error) {
        setCliTestResult({
          state: "error",
          title: t("cliTest.genericErrorTitle"),
          detail: error instanceof Error ? error.message : String(error)
        });
      }
    } finally {
      setCliTestBusy(false);
    }
  }

  async function testSelectedAgentCliStatus(): Promise<CliTestResult> {
    if (selectedCliId === "codex") {
      const status = await refreshCodexStatus();
      const codexAgent = buildCodexCliAgentFromStatus(status, t);
      setLocalCliAgents((currentAgents) => replaceLocalCliAgent(currentAgents, codexAgent));
      void refreshLocalCliAgents();
      return buildCliTestResult(codexAgent, t);
    }

    setLocalCliScanBusy(true);
    try {
      const agents = await window.mkboard.scanLocalCliAgents();
      setLocalCliAgents(agents);
      const testedAgent = agents.find((agent) => agent.id === selectedCliId);
      if (!testedAgent) {
        return {
          state: "error",
          title: t("cliTest.genericErrorTitle"),
          detail: t("cliTest.selectedMissingDetail")
        };
      }
      return buildCliTestResult(testedAgent, t);
    } catch (error) {
      return {
        state: "error",
        title: t("cliTest.genericErrorTitle"),
        detail: error instanceof Error ? error.message : String(error)
      };
    } finally {
      setLocalCliScanBusy(false);
    }
  }

  async function refreshSelectedCliConnection(cliId: AgentCliId): Promise<boolean> {
    if (cliId === "codex") {
      const status = await refreshCodexStatus();
      setLocalCliAgents((currentAgents) => replaceLocalCliAgent(currentAgents, buildCodexCliAgentFromStatus(status, t)));
      return status.state === "connected";
    }

    const agents = await refreshLocalCliAgents();
    const agent = agents.find((item) => item.id === cliId);
    return agent?.connectionState === "connected";
  }

  async function connectSelectedCliById(cliId: AgentCliId): Promise<boolean> {
    if (cliId === "claude-code") return await connectClaudeCode();
    return await connectCodexCli();
  }

  async function autoConnectSelectedCli(reason: string, options: { openLoginWhenNeeded?: boolean } = {}): Promise<boolean> {
    const cliId = selectedCliId;
    const existingPromise = selectedCliAutoConnectPromisesRef.current.get(cliId);
    if (existingPromise) {
      const connected = await existingPromise;
      if (connected || !options.openLoginWhenNeeded) return connected;
      if (selectedCliAutoConnectPromisesRef.current.get(cliId) === existingPromise) {
        selectedCliAutoConnectPromisesRef.current.delete(cliId);
      }
    }

    const promise = (async () => {
      try {
        const connected = await refreshSelectedCliConnection(cliId);
        if (connected) return true;
        if (!options.openLoginWhenNeeded) return false;
        return await connectSelectedCliById(cliId);
      } catch (error) {
        console.warn(`Failed to auto-connect selected CLI (${reason})`, error);
        return false;
      }
    })();

    selectedCliAutoConnectPromisesRef.current.set(cliId, promise);
    void promise.finally(() => {
      if (selectedCliAutoConnectPromisesRef.current.get(cliId) === promise) {
        selectedCliAutoConnectPromisesRef.current.delete(cliId);
      }
    });
    return promise;
  }

  async function connectCodexCli(): Promise<boolean> {
    setCodexStatusBusy(true);
    try {
      const status = await window.mkboard.connectCodex();
      setCodexStatus(status);
      setLocalCliAgents((currentAgents) => replaceLocalCliAgent(currentAgents, buildCodexCliAgentFromStatus(status, t)));
      if (status.state === "connected") return true;
      void pollCodexStatusUntilConnected();
      return false;
    } catch (error) {
      setCodexStatus({
        state: "error",
        label: t("status.codex.authFailed"),
        detail: error instanceof Error ? error.message : String(error)
      });
      return false;
    } finally {
      setCodexStatusBusy(false);
    }
  }

  async function connectClaudeCode(): Promise<boolean> {
    setLocalCliScanBusy(true);
    try {
      const agent = await window.mkboard.connectClaudeCode();
      setLocalCliAgents((currentAgents) => replaceLocalCliAgent(currentAgents, agent));
      if (agent.connectionState === "connected") return true;
      void pollLocalCliAgentUntilConnected("claude-code");
      return false;
    } catch (error) {
      const failedAgent: LocalCliAgent = {
        id: "claude-code",
        name: "Claude Code",
        command: "claude",
        installed: false,
        connectionState: "error",
        connectionLabel: t("status.claude.authFailed"),
        connectionDetail: error instanceof Error ? error.message : String(error)
      };
      setLocalCliAgents((currentAgents) => replaceLocalCliAgent(currentAgents, failedAgent));
      return false;
    } finally {
      setLocalCliScanBusy(false);
    }
  }

  function connectSelectedCli() {
    if (selectedCliId === "claude-code") {
      void connectClaudeCode();
      return;
    }
    void connectCodexCli();
  }

  async function ensureSelectedCliReady(): Promise<boolean> {
    const connected = await autoConnectSelectedCli("preflight", { openLoginWhenNeeded: true });
    if (connected) return true;
    setAccountAuthOpen(true);
    return false;
  }

  async function pollCodexStatusUntilConnected() {
    if (cliAuthPollingRef.current) return;
    cliAuthPollingRef.current = true;
    setCliAuthPolling(true);
    const deadline = Date.now() + 90_000;
    try {
      while (Date.now() < deadline) {
        await delay(1800);
        const status = await window.mkboard.getCodexStatus();
        setCodexStatus(status);
        if (status.state === "connected") {
          void refreshLocalCliAgents();
          return;
        }
      }
    } catch (error) {
      setCodexStatus({
        state: "error",
        label: t("status.codex.checkFailed"),
        detail: error instanceof Error ? error.message : String(error)
      });
    } finally {
      cliAuthPollingRef.current = false;
      setCliAuthPolling(false);
    }
  }

  async function pollLocalCliAgentUntilConnected(cliId: string) {
    if (cliAuthPollingRef.current) return;
    cliAuthPollingRef.current = true;
    setCliAuthPolling(true);
    const deadline = Date.now() + 90_000;
    try {
      while (Date.now() < deadline) {
        await delay(1800);
        const agents = await window.mkboard.scanLocalCliAgents();
        setLocalCliAgents(agents);
        const agent = agents.find((item) => item.id === cliId);
        if (agent?.connectionState === "connected") return;
      }
    } finally {
      cliAuthPollingRef.current = false;
      setCliAuthPolling(false);
    }
  }

  function openExternalUrl(url: string) {
    void window.mkboard.openExternal(url).catch((error) => {
      console.error("Failed to open external URL", error);
    });
  }



  async function checkDesktopVersionFromSettings() {
    if (!window.mkboard?.checkDesktopVersion || desktopVersionCheckBusy) return;
    if (desktopVersionCheck?.updateAvailable) {
      await startDesktopUpdate();
      return;
    }
    const startedAt = Date.now();
    setDesktopVersionCheckBusy(true);
    setDesktopVersionCheckError("");
    try {
      const result = await window.mkboard.checkDesktopVersion();
      setDesktopVersionCheck(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDesktopVersionCheckError(message);
      console.warn("Failed to check desktop version", error);
    } finally {
      const remainingLoadingMs = 520 - (Date.now() - startedAt);
      if (remainingLoadingMs > 0) await delay(remainingLoadingMs);
      setDesktopVersionCheckBusy(false);
    }
  }

  async function startDesktopUpdate() {
    if (!window.mkboard?.startDesktopUpdate || desktopVersionCheckBusy) return;
    setDesktopVersionCheckBusy(true);
    setDesktopVersionCheckError("");
    try {
      setDesktopVersionCheck(await window.mkboard.startDesktopUpdate());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDesktopVersionCheckError(message);
      console.warn("Failed to start desktop update", error);
    } finally {
      setDesktopVersionCheckBusy(false);
    }
  }

  function openAccountAuthAtSection(section: SettingsSectionId) {
    clearByokNotice();
    setAccountAuthSection(section);
    setAccountAuthOpen(true);
    void refreshCodexStatus();
    void refreshLocalCliAgents();
    void refreshByokAndCompanion();
  }

  function openAccountAuth() {
    openAccountAuthAtSection("runtime");
  }

  function openAccountProfile() {
    openAccountAuthAtSection("profile");
  }

  function closeAccountAuth() {
    setAccountAuthOpen(false);
  }

  function openAccountAuthWithMessage(message: string) {
    setByokNotice(message);
    setAccountAuthSection("profile");
    setAccountAuthOpen(true);
    void refreshByokAndCompanion();
  }

  function isLocalProjectLimitError(_message: string) {
    return false;
  }

  function openProjectLimitPrompt(message = projectLimitMessage) {
    if (message) window.alert(message);
  }

  function applyProjectDetail(detail: ProjectDetail, options: { expectedStoryboardRowIds?: Set<string> } = {}) {
    const normalizedDetail = normalizeLoadedAgentOperationConfirmations(detail);
    const previousProjectId = currentProjectIdRef.current || projectDetail?.project.id || "";
    if (
      options.expectedStoryboardRowIds &&
      previousProjectId === normalizedDetail.project.id &&
      options.expectedStoryboardRowIds.size > 0 &&
      !storyboardRowIdSetsEqual(new Set(normalizedDetail.rows.map((row) => row.id)), options.expectedStoryboardRowIds)
    ) {
      console.warn("Ignored stale storyboard project refresh after the storyboard rows changed.");
      return;
    }
    currentProjectIdRef.current = normalizedDetail.project.id;
    if (previousProjectId && previousProjectId !== normalizedDetail.project.id) {
      generationRestoreProjectIdRef.current = null;
      openedHyperframesStudioUrlsRef.current.clear();
      clearStoryboardGenerationUiState();
    }
    setProjectDetail(normalizedDetail);
    setProjectId(normalizedDetail.project.id);
    setProjectName(normalizedDetail.project.name);
    setScriptRichText(normalizedDetail.scriptHtml);
    trackStoryboardRows(normalizedDetail.rows);
    setStoryboardColumns(ensureStoryboardPromptColumns(normalizedDetail.columns, interfaceLanguage));
    setImageRatio(normalizedDetail.imageRatio);
    setAssets(normalizedDetail.assets);
    setAgentConversations(normalizedDetail.agentConversations);
    const preservedConversationId = activeAgentConversationIdRef.current;
    const canKeepCurrentConversation =
      previousProjectId === normalizedDetail.project.id &&
      Boolean(preservedConversationId) &&
      normalizedDetail.agentConversations.some((conversation) => conversation.id === preservedConversationId);
    const nextActiveConversationId = canKeepCurrentConversation ? preservedConversationId : normalizedDetail.activeAgentConversationId;
    const shouldUseLoadedMessages = nextActiveConversationId === normalizedDetail.activeAgentConversationId;
    setCurrentActiveAgentConversationId(nextActiveConversationId);
    if (shouldUseLoadedMessages) {
      setAgentMessages(normalizedDetail.agentMessages);
      setAgentOperationConfirmations(getAgentOperationConfirmationsFromMessages(normalizedDetail.agentMessages));
    }
  }

  // Changes written by an external Agent through MCP: refresh document data only, so an in-flight
  // sidebar conversation, selections and generation state stay untouched.
  function applyExternalProjectDetail(detail: ProjectDetail) {
    setProjectDetail((current) =>
      current?.project.id === detail.project.id
        ? {
            ...current,
            project: detail.project,
            scriptHtml: detail.scriptHtml,
            rows: detail.rows,
            columns: detail.columns,
            imageRatio: detail.imageRatio,
            assets: detail.assets,
            storyboardSkill: detail.storyboardSkill,
            taste: detail.taste
          }
        : current
    );
    setProjectName(detail.project.name);
    setScriptRichText(detail.scriptHtml);
    trackStoryboardRows(detail.rows);
    setStoryboardColumns(ensureStoryboardPromptColumns(detail.columns, interfaceLanguage));
    setImageRatio(detail.imageRatio);
    setAssets(detail.assets);
  }

  function normalizeLoadedAgentOperationConfirmations(detail: ProjectDetail): ProjectDetail {
    let changed = false;
    const activeConfirmationIds = activeAgentOperationConfirmationIdsRef.current;
    const agentMessages = detail.agentMessages.map((message) => {
      const confirmation = message.operationConfirmation;
      if (!confirmation || confirmation.status !== "applying" || activeConfirmationIds.has(confirmation.id)) return message;

      changed = true;
      const nextConfirmation: AgentOperationConfirmation = {
        ...confirmation,
        status: "failed",
        error: t("agent.confirmation.failedDetail")
      };
      void persistAgentOperationConfirmation(nextConfirmation);
      return { ...message, operationConfirmation: nextConfirmation };
    });

    return changed ? { ...detail, agentMessages } : detail;
  }

  function getAgentOperationConfirmationsFromMessages(messages: AgentMessage[]) {
    return messages
      .map((message) => message.operationConfirmation)
      .filter((confirmation): confirmation is AgentOperationConfirmation => Boolean(confirmation));
  }

  function restoreActiveStoryboardParseRun(run: ActiveStoryboardParseRun, detail: ProjectDetail) {
    if (!isCurrentProjectId(run.projectId)) return;
    const persistedMessage = detail.agentMessages.find((message) => message.id === run.assistantMessageId || message.clientRunId === run.clientRunId);
    if (hasAgentClientRunTerminalEvent(run.clientRunId) || (persistedMessage && isTerminalAgentRunStatus(effectiveAgentRunStatus(persistedMessage)))) {
      markAgentClientRunTerminal(run.clientRunId);
      return;
    }
    activeStoryboardParseRunIdRef.current = run.clientRunId;
    setStoryboardBusyAction("parse");
    markAgentClientRunRunning(run.clientRunId, run.conversationId);
    setAgentBusy(true);
    setActiveAgentClientRunId(run.clientRunId);

    if (detail.activeAgentConversationId !== run.conversationId) return;
    setAgentMessages((messages) =>
      messages.map((message) =>
        message.id === run.assistantMessageId || message.clientRunId === run.clientRunId
          ? { ...message, runStatus: isTerminalAgentRunStatus(message.runStatus) ? message.runStatus : "running" }
          : message
      )
    );
  }

  async function loadProject(nextProjectId: string) {
    const activeParseRun = await window.mkboard.getActiveStoryboardParseRun(nextProjectId);
    const detail = await window.mkboard.getProject(nextProjectId, interfaceLanguage);
    applyProjectDetail(detail);
    if (!isCurrentProjectId(nextProjectId)) return;
    if (activeParseRun) {
      restoreActiveStoryboardParseRun(activeParseRun, detail);
    }
  }

  function applyRoute(nextRoute: AppRouteState, historyMode: "push" | "replace" = "push") {
    const nextUrl =
      nextRoute.screen === "projects"
        ? getProjectsRoute()
        : nextRoute.screen === "trash"
          ? getTrashRoute()
          : nextRoute.screen === "skills"
            ? getSkillsRoute()
          : nextRoute.screen === "taste"
            ? getTasteRoute()
          : nextRoute.screen === "template-create"
            ? getTemplateCreateRoute()
          : nextRoute.screen === "template-edit"
            ? getTemplateEditRoute(nextRoute.templateId ?? "")
          : nextRoute.screen === "templates"
            ? getTemplatesRoute()
          : nextRoute.screen === "assets"
            ? getAssetsRoute(nextRoute.projectId)
            : getWorkspaceRoute(nextRoute.projectId, nextRoute.tab);
    if (window.location.pathname !== nextUrl) {
      window.history[historyMode === "push" ? "pushState" : "replaceState"]({}, "", nextUrl);
    }
    if (currentProjectIdRef.current !== nextRoute.projectId) {
      storyboardRowIdsRef.current = new Set();
    }
    currentProjectIdRef.current = nextRoute.projectId;
    currentScreenRef.current = nextRoute.screen;
    setScreen(nextRoute.screen);
    setProjectId(nextRoute.projectId);
    setTab(nextRoute.tab);
    setTemplateEditId(nextRoute.templateId ?? "");
  }

  async function openProjects() {
    await Promise.all([refreshProjects(), refreshArchivedProjects(), refreshProjectQuotaUsage()]);
    applyRoute({ screen: "projects", projectId, tab });
  }

  async function openTrash() {
    await Promise.all([refreshDeletedProjects(), refreshProjectQuotaUsage()]);
    applyRoute({ screen: "trash", projectId: "", tab });
  }

  async function openProject(nextProjectId = projectId, nextProjectName = projectName, nextTab: WorkspaceTab = "script") {
    if (isTutorialProjectId(nextProjectId)) {
      await restartTutorialOnboarding();
    }
    await loadProject(nextProjectId);
    setProjectName(nextProjectName);
    applyRoute({ screen: "workspace", projectId: nextProjectId, tab: nextTab });
  }

  async function openAssets(nextProjectId?: string) {
    const loadedProjects = await window.mkboard.listProjects();
    setProjects(loadedProjects);
    void refreshProjectQuotaUsage();
    const visibleProjects = filterProjectsForInterfaceLanguage(loadedProjects, interfaceLanguage);
    const targetProjectId = nextProjectId || visibleProjects[0]?.id;
    if (targetProjectId) {
      await loadProject(targetProjectId);
      applyRoute({ screen: "assets", projectId: targetProjectId, tab });
      return;
    }
    setProjectDetail(null);
    setProjectId("");
    setProjectName("");
    setAssets([]);
    setAgentConversations([]);
    setCurrentActiveAgentConversationId("");
    setAgentMessages([]);
    setAgentOperationConfirmations([]);
    applyRoute({ screen: "assets", projectId: "", tab });
  }

  async function openSkills() {
    setSkillsHomeRequestId((requestId) => requestId + 1);
    applyRoute({ screen: "skills", projectId: "", tab });
    try {
      await refreshSkills();
    } catch {
      // The SKILL page stays visible and shows the load error.
    }
  }

  async function openTaste() {
    applyRoute({ screen: "taste", projectId: "", tab });
    try {
      await refreshTastes();
    } catch {
      // The Taste page stays visible and shows the load error.
    }
  }

  async function openTemplates() {
    applyRoute({ screen: "templates", projectId: "", tab });
    await refreshTemplates();
  }

  async function openTemplateCreator() {
    applyRoute({ screen: "template-create", projectId: "", tab });
    await refreshTemplates();
    try {
      await refreshSkills();
    } catch {
      // The template creator stays visible and can still use already-loaded skills if present.
    }
  }

  async function openTemplateEditor(template: ProjectTemplate) {
    if (template.scope !== "user") return;
    applyRoute({ screen: "template-edit", projectId: "", tab, templateId: template.id });
    await refreshTemplates();
    try {
      await refreshSkills();
    } catch {
      // The template editor stays visible and can still use already-loaded skills if present.
    }
  }

  function startCreateProject(templateId?: string) {
    if (localProjectLimitReached) {
      openProjectLimitPrompt();
      return;
    }
    const nextTemplateId = templateId ?? getDefaultCreateTemplateId(templates, defaultTemplateId);
    setProjectNameInput("");
    setProjectIconInput(projectMarkOptionDefinitions[0].value);
    setProjectImageRatioInput("16:9");
    setTemplateInput(nextTemplateId);
    setTasteInput(getDefaultCreateTasteId(tastes, defaultTasteId));
    setProjectSkillInput(getTemplateStoryboardSkillId(templates, nextTemplateId, interfaceLanguage));
    setEditingProject(null);
    setCreateTasteDrawerOpen(false);
    setProjectSkillDrawerOpen(false);
    if (skills.length === 0 && !skillsLoading) {
      void refreshSkills().catch(() => {
        // The create modal still shows the fallback skill option.
      });
    }
    if (tastes.length === 0 && !tastesLoading) {
      void refreshTastes().catch(() => {
        // The create modal still shows the fallback taste card.
      });
    }
    setShowCreate(true);
  }

  function saveDefaultTaste(nextTasteId: string) {
    const resolvedTasteId = getDefaultCreateTasteId(tastes, nextTasteId);
    setDefaultTasteId(resolvedTasteId);
    try {
      window.localStorage.setItem(DEFAULT_TASTE_USER_SELECTION_STORAGE_KEY, "1");
    } catch {
      // Local storage can be unavailable in hardened shells; keep the in-memory preference.
    }
    if (showCreate && !editingProject) setTasteInput(resolvedTasteId);
  }

  function closeCreateProjectModal() {
    setShowCreate(false);
    setCreateTasteDrawerOpen(false);
    setProjectSkillDrawerOpen(false);
  }

  async function createSkill(input: CreateSkillInput): Promise<Skill> {
    const skill = await window.mkboard.createSkill(input);
    await refreshSkills();
    return skill;
  }

  async function updateSkill(input: UpdateSkillInput): Promise<Skill> {
    const skill = await window.mkboard.updateSkill(input);
    await refreshSkills();
    return skill;
  }

  async function deleteSkill(skillId: string): Promise<Skill[]> {
    await window.mkboard.deleteSkill(skillId);
    return await refreshSkills();
  }

  async function createTemplate(input: CreateProjectTemplateInput): Promise<ProjectTemplate> {
    const template = await window.mkboard.createTemplate(input);
    await refreshTemplates();
    return template;
  }

  async function updateTemplate(input: UpdateProjectTemplateInput): Promise<ProjectTemplate> {
    const template = await window.mkboard.updateTemplate(input);
    await refreshTemplates();
    return template;
  }

  async function deleteTemplate(templateId: string): Promise<ProjectTemplate[]> {
    const nextTemplates = await window.mkboard.deleteTemplate(templateId);
    setTemplates(nextTemplates);
    if (defaultTemplateId === templateId) setDefaultTemplateId(DEFAULT_TEMPLATE_ID);
    setTemplateInput((currentTemplateId) =>
      currentTemplateId === templateId ? getDefaultCreateTemplateId(nextTemplates, DEFAULT_TEMPLATE_ID) : currentTemplateId
    );
    return nextTemplates;
  }

  function saveDefaultTemplate(nextTemplateId: string) {
    const resolvedTemplateId = getDefaultCreateTemplateId(templates, nextTemplateId);
    setDefaultTemplateId(resolvedTemplateId);
    if (showCreate && !editingProject) {
      setTemplateInput(resolvedTemplateId);
      setProjectSkillInput(getTemplateStoryboardSkillId(templates, resolvedTemplateId, interfaceLanguage));
    }
  }

  async function duplicateTemplate(sourceTemplate: ProjectTemplate): Promise<ProjectTemplate> {
    const sourceName = sourceTemplate.scope === "system" ? t("common.defaultTemplate") : sourceTemplate.name;
    const copyNameBase = t("templates.copyName", { name: sourceName });
    const existingNames = new Set(
      templates.filter((template) => template.scope === "user").map((template) => template.name.trim().toLocaleLowerCase())
    );
    let copyName = copyNameBase;
    let copyIndex = 2;
    while (existingNames.has(copyName.toLocaleLowerCase())) {
      copyName = `${copyNameBase} ${copyIndex}`;
      copyIndex += 1;
    }

    return await createTemplate({
      name: copyName,
      description: sourceTemplate.scope === "system" ? t("templates.defaultDescription") : sourceTemplate.description,
      columns: sourceTemplate.columns.map((column) => ({ ...column })),
      storyboardSkillId: sourceTemplate.storyboardSkillId,
      interfaceLanguage
    });
  }

  function moveProjectToTrash(project: ProjectSummary) {
    if (isTutorialProject(project)) return;
    setPendingProjectAction({ kind: "move-to-trash", project });
  }

  async function archiveProject(project: ProjectSummary) {
    if (isTutorialProject(project)) return;
    const nextProjects = await window.mkboard.archiveProject(project.id);
    setProjects(nextProjects);
    await refreshArchivedProjects();
    if (projectId === project.id) {
      const fallbackProject = nextProjects[0];
      setProjectDetail(null);
      setProjectId(fallbackProject?.id ?? "");
      setProjectName(fallbackProject?.name ?? "");
      setAgentConversations([]);
      setCurrentActiveAgentConversationId("");
      setAgentMessages([]);
      setAgentOperationConfirmations([]);
    }
  }

  async function unarchiveProject(project: ProjectSummary) {
    setArchivedProjects(await window.mkboard.unarchiveProject(project.id));
    const nextProjects = await refreshProjects();
    if (!projectId && nextProjects[0]) {
      setProjectId(nextProjects[0].id);
      setProjectName(nextProjects[0].name);
    }
  }

  async function openProjectEditor(project: ProjectSummary) {
    setEditingProject(project);
    setShowCreate(false);
    setCreateTasteDrawerOpen(false);
    setProjectSkillDrawerOpen(false);
    setProjectNameInput(project.name);
    setProjectIconInput(project.icon || projectMarkOptionDefinitions[0].value);
    setProjectImageRatioInput(project.imageRatio);
    setTemplateInput(project.templateId || getDefaultCreateTemplateId(templates, defaultTemplateId));
    setTasteInput(projectDetail?.project.id === project.id ? projectDetail.taste?.id ?? project.tasteId ?? DEFAULT_TASTE_ID : project.tasteId || DEFAULT_TASTE_ID);
    setProjectSkillInput(
      projectDetail?.project.id === project.id
        ? projectDetail.storyboardSkill?.id ?? getTemplateStoryboardSkillId(templates, project.templateId, interfaceLanguage)
        : getTemplateStoryboardSkillId(templates, project.templateId, interfaceLanguage)
    );
    if (skills.length === 0 && !skillsLoading) {
      void refreshSkills().catch(() => {
        // The edit modal still shows the fallback skill option.
      });
    }
    if (tastes.length === 0 && !tastesLoading) {
      void refreshTastes().catch(() => {
        // The edit modal still shows the fallback taste card.
      });
    }
    try {
      const detail = projectDetail?.project.id === project.id ? projectDetail : await window.mkboard.getProject(project.id, interfaceLanguage);
      setProjectNameInput(detail.project.name);
      setProjectIconInput(detail.project.icon || projectMarkOptionDefinitions[0].value);
      setProjectImageRatioInput(detail.imageRatio);
      setTemplateInput(detail.project.templateId || getDefaultCreateTemplateId(templates, defaultTemplateId));
      setTasteInput(detail.taste?.id ?? detail.project.tasteId ?? DEFAULT_TASTE_ID);
      setProjectSkillInput(detail.storyboardSkill?.id ?? getDefaultStoryboardSkillId(interfaceLanguage));
    } catch (error) {
      console.error("Failed to load project settings", error);
      setProjectSkillInput(getTemplateStoryboardSkillId(templates, project.templateId, interfaceLanguage));
    }
  }

  async function saveProjectEdit() {
    if (!editingProject || projectEditBusy) return;
    const nextName = projectNameInput.trim();
    if (!nextName || !projectIconInput || !templateInput || !tasteInput || !projectSkillInput) return;

    setProjectEditBusy(true);
    try {
      const nextProjects = await window.mkboard.updateProject({
        id: editingProject.id,
        name: nextName,
        icon: projectIconInput,
        imageRatio: projectImageRatioInput,
        templateId: templateInput,
        tasteId: tasteInput,
        storyboardSkillId: projectSkillInput,
        interfaceLanguage
      });
      setProjects(nextProjects);
      await refreshArchivedProjects();
      if (projectId === editingProject.id) {
        const detail = await window.mkboard.getProject(editingProject.id, interfaceLanguage);
        applyProjectDetail(detail);
      }
      setEditingProject(null);
      setCreateTasteDrawerOpen(false);
      setProjectSkillDrawerOpen(false);
    } finally {
      setProjectEditBusy(false);
    }
  }

  async function confirmProjectAction() {
    if (!pendingProjectAction || projectActionBusy) return;

    setProjectActionBusy(true);
    try {
      if (pendingProjectAction.kind === "move-to-trash") {
        await executeMoveProjectToTrash(pendingProjectAction.project);
      } else if (pendingProjectAction.kind === "restore") {
        await executeRestoreDeletedProject(pendingProjectAction.project);
      } else if (pendingProjectAction.kind === "delete-forever") {
        await executePermanentProjectDeletion(pendingProjectAction.project);
      } else {
        await executeEmptyTrash(pendingProjectAction.projects);
      }
      setPendingProjectAction(null);
    } finally {
      setProjectActionBusy(false);
    }
  }

  async function executeMoveProjectToTrash(project: ProjectSummary) {
    const nextProjects = await window.mkboard.trashProject(project.id);
    setProjects(nextProjects);
    await Promise.all([refreshArchivedProjects(), refreshDeletedProjects(), refreshProjectQuotaUsage()]);
    if (projectId === project.id) {
      const fallbackProject = nextProjects[0];
      setProjectDetail(null);
      setProjectId(fallbackProject?.id ?? "");
      setProjectName(fallbackProject?.name ?? "");
      setAgentConversations([]);
      setCurrentActiveAgentConversationId("");
      setAgentMessages([]);
      setAgentOperationConfirmations([]);
    }
  }

  function restoreDeletedProject(project: ProjectSummary) {
    setPendingProjectAction({ kind: "restore", project });
  }

  async function executeRestoreDeletedProject(project: ProjectSummary) {
    try {
      setDeletedProjects(await window.mkboard.restoreProject(project.id));
      const [nextProjects] = await Promise.all([refreshProjects(), refreshArchivedProjects(), refreshProjectQuotaUsage()]);
      if (!projectId && nextProjects[0]) {
        setProjectId(nextProjects[0].id);
        setProjectName(nextProjects[0].name);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isLocalProjectLimitError(message)) {
        openProjectLimitPrompt(message);
      } else {
        openAccountAuthWithMessage(message);
      }
    }
  }

  function permanentlyDeleteProject(project: ProjectSummary) {
    setPendingProjectAction({ kind: "delete-forever", project });
  }

  async function executePermanentProjectDeletion(project: ProjectSummary) {
    setDeletedProjects(await window.mkboard.deleteProject(project.id));
    await Promise.all([refreshProjects(), refreshArchivedProjects(), refreshProjectQuotaUsage()]);
    if (projectId === project.id) {
      setProjectDetail(null);
      setProjectId("");
      setProjectName("");
      setAgentConversations([]);
      setCurrentActiveAgentConversationId("");
      setAgentMessages([]);
      setAgentOperationConfirmations([]);
    }
  }

  function emptyTrash(projectsToDelete: ProjectSummary[]) {
    if (projectsToDelete.length === 0) return;
    setPendingProjectAction({ kind: "empty-trash", projects: projectsToDelete });
  }

  async function executeEmptyTrash(projectsToDelete: ProjectSummary[]) {
    for (const project of projectsToDelete) {
      await window.mkboard.deleteProject(project.id);
    }
    setDeletedProjects(await refreshDeletedProjects());
    await Promise.all([refreshProjects(), refreshArchivedProjects(), refreshProjectQuotaUsage()]);
    if (projectsToDelete.some((project) => project.id === projectId)) {
      setProjectDetail(null);
      setProjectId("");
      setProjectName("");
      setAgentConversations([]);
      setCurrentActiveAgentConversationId("");
      setAgentMessages([]);
      setAgentOperationConfirmations([]);
    }
  }

  function openWorkspaceTab(nextTab: WorkspaceTab) {
    applyRoute({ screen: "workspace", projectId, tab: nextTab });
  }

  function getNextOnboardingStep(step: OnboardingStepId): OnboardingStepId | null {
    const index = onboardingStepOrder.indexOf(step);
    return index >= 0 ? onboardingStepOrder[index + 1] ?? null : null;
  }

  function getPreviousOnboardingStep(step: OnboardingStepId): OnboardingStepId | null {
    const index = onboardingStepOrder.indexOf(step);
    return index > 0 ? onboardingStepOrder[index - 1] ?? null : null;
  }

  async function saveOnboardingState(input: Parameters<MkboardApi["updateOnboardingState"]>[0]) {
    if (onboardingIpcUnavailableRef.current) return null;
    try {
      const nextState = await window.mkboard.updateOnboardingState(input, interfaceLanguage);
      setOnboardingState(nextState);
      return nextState;
    } catch (error) {
      if (!isMissingOnboardingIpcHandlerError(error)) throw error;
      onboardingIpcUnavailableRef.current = true;
      setOnboardingState(null);
      logMissingOnboardingIpcHandler("state save", error);
      return null;
    }
  }

  async function completeOnboardingStep(step: OnboardingStepId, nextStep: OnboardingStepId | null = getNextOnboardingStep(step)) {
    if (!onboardingState || onboardingState.completedAt) return onboardingState;
    const completedStepIds = Array.from(new Set([...onboardingState.completedStepIds, step]));
    return saveOnboardingState({
      completedStepIds,
      currentStep: nextStep ?? step,
      completedAt: nextStep ? null : new Date().toISOString()
    });
  }

  async function finishOnboarding() {
    if (!onboardingState || onboardingState.completedAt) return;
    setOnboardingRevealAction(null);
    setOnboardingStoryboardRevealCount(null);
    await saveOnboardingState({
      completedStepIds: onboardingStepOrder,
      currentStep: "export",
      completedAt: new Date().toISOString()
    });
  }

  async function restartTutorialOnboarding() {
    setOnboardingRevealAction(null);
    setOnboardingStoryboardRevealCount(null);
    await saveOnboardingState({
      currentStep: "settings",
      completedStepIds: [],
      dismissedStepIds: [],
      startedAt: new Date().toISOString(),
      completedAt: null
    });
  }

  async function openTutorialProject(nextTab: WorkspaceTab = "script") {
    const detail = await ensureTutorialProjectIfAvailable("open tutorial project");
    if (!detail) throw new Error(t("app.error.onboardingUnavailable"));
    applyProjectDetail(detail);
    await refreshProjects();
    applyRoute({ screen: "workspace", projectId: detail.project.id, tab: nextTab });
    return detail;
  }

  async function revealTutorialStoryboardFromCurrentContent(input: { sourceDetail?: ProjectDetail } = {}) {
    const activeProjectDetail = input.sourceDetail ?? projectDetail;
    if (!activeProjectDetail || !isTutorialProject(activeProjectDetail.project)) return;
    const targetProjectId = activeProjectDetail.project.id;
    if (!isCurrentProjectId(targetProjectId)) return;
    setOnboardingActionBusy(true);
    setOnboardingRevealAction("parse");
    setOnboardingStoryboardRevealCount(0);
    try {
      let previousStoredRowCount = activeProjectDetail.rows.length;
      let visibleRowCount = 0;
      let revealedRows = activeProjectDetail.rows;
      for (let batchIndex = 0; batchIndex < 40; batchIndex += 1) {
        const rows = await window.mkboard.revealTutorialStoryboard({
          projectId: targetProjectId,
          interfaceLanguage,
          revealCount: 4
        });
        if (!isCurrentProjectId(targetProjectId)) return;
        revealedRows = rows;
        trackStoryboardRows(rows);
        setProjectDetail((detail) => (detail?.project.id === targetProjectId ? { ...detail, rows } : detail));
        const storedRowsIncreased = rows.length > previousStoredRowCount;
        const nextVisibleRowCount = Math.min(rows.length, visibleRowCount + 4);
        setOnboardingStoryboardRevealCount(nextVisibleRowCount);
        const revealedRowIds = rows.slice(visibleRowCount, nextVisibleRowCount).map((row) => row.id);
        if (revealedRowIds.length > 0) scrollNearestStoryboardRowsIntoView(revealedRowIds);
        if (!storedRowsIncreased && nextVisibleRowCount >= rows.length) break;
        previousStoredRowCount = rows.length;
        visibleRowCount = nextVisibleRowCount;
        await delay(350);
      }
      const detail = await window.mkboard.getProject(targetProjectId, interfaceLanguage);
      if (!isCurrentProjectId(targetProjectId)) return;
      applyProjectDetail(detail, { expectedStoryboardRowIds: new Set(revealedRows.map((row) => row.id)) });
      applyRoute({ screen: "workspace", projectId: targetProjectId, tab: "storyboard" });
      await completeOnboardingStep("storyboard");
    } catch (error) {
      if (isMissingOnboardingIpcHandlerError(error)) {
        onboardingIpcUnavailableRef.current = true;
        setOnboardingState(null);
        logMissingOnboardingIpcHandler("storyboard reveal", error);
        return;
      }
      window.alert(error instanceof Error ? error.message : String(error));
    } finally {
      setOnboardingActionBusy(false);
      setOnboardingRevealAction(null);
      setOnboardingStoryboardRevealCount(null);
    }
  }

  async function revealTutorialMediaFromCurrentContent(kind: "image" | "video", input: { sourceDetail?: ProjectDetail } = {}) {
    const activeProjectDetail = input.sourceDetail ?? projectDetail;
    if (!activeProjectDetail || !isTutorialProject(activeProjectDetail.project)) return;
    const targetProjectId = activeProjectDetail.project.id;
    if (!isCurrentProjectId(targetProjectId)) return;
    const revealAction: StoryboardAiAction = kind === "image" ? "images" : "videos";
    setOnboardingActionBusy(true);
    setOnboardingRevealAction(revealAction);
    try {
      const result = await window.mkboard.revealTutorialMedia({
        projectId: targetProjectId,
        kind,
        interfaceLanguage
      });
      if (!isCurrentProjectId(targetProjectId)) return;
      applyShotMediaUpdate(result, targetProjectId);
      applyRoute({ screen: "workspace", projectId: targetProjectId, tab: "storyboard" });
      await completeOnboardingStep(kind === "image" ? "images" : "videos");
    } catch (error) {
      if (isMissingOnboardingIpcHandlerError(error)) {
        onboardingIpcUnavailableRef.current = true;
        setOnboardingState(null);
        logMissingOnboardingIpcHandler(`${kind} reveal`, error);
        return;
      }
      window.alert(error instanceof Error ? error.message : String(error));
    } finally {
      setOnboardingActionBusy(false);
      setOnboardingRevealAction(null);
    }
  }

  async function runOnboardingPrimaryAction() {
    if (!onboardingState || onboardingState.completedAt || onboardingActionBusy) return;
    const currentStep = onboardingState.currentStep;
    if (currentStep === "settings") {
      if (accountAuthOpen) {
        await completeOnboardingStep("settings");
        return;
      }
      openAccountAuth();
      return;
    }
    if (currentStep === "hyperframes") {
      if (!accountAuthOpen) {
        openAccountAuth();
        return;
      }
      closeAccountAuth();
      await openProjects();
      await completeOnboardingStep("hyperframes");
      return;
    }
    if (currentStep === "create_project") {
      closeAccountAuth();
      if (showCreate) return;
      if (projectQuotaUsage > 0) {
        await completeOnboardingStep("create_project");
        await openTutorialProject("script");
        return;
      }
      startCreateProject();
      return;
    }
    if (currentStep === "script") {
      await openTutorialProject("storyboard");
      await completeOnboardingStep("script");
      return;
    }
    if (currentStep === "storyboard") {
      const detail = projectDetail && isTutorialProject(projectDetail.project) ? projectDetail : await openTutorialProject("storyboard");
      await revealTutorialStoryboardFromCurrentContent({ sourceDetail: detail });
      return;
    }
    if (currentStep === "images") {
      const detail = projectDetail && isTutorialProject(projectDetail.project) ? projectDetail : await openTutorialProject("storyboard");
      await revealTutorialMediaFromCurrentContent("image", { sourceDetail: detail });
      return;
    }
    if (currentStep === "videos") {
      const detail = projectDetail && isTutorialProject(projectDetail.project) ? projectDetail : await openTutorialProject("storyboard");
      await revealTutorialMediaFromCurrentContent("video", { sourceDetail: detail });
      return;
    }
    if (currentStep === "preview") {
      await openTutorialProject("storyboard");
      onboardingPreviewPresentationPendingRef.current = true;
      setWorkspacePresentationOpen(true);
      setOnboardingPresentationRequestId((currentRequestId) => currentRequestId + 1);
      return;
    }
    await openTutorialProject("assets");
    await completeOnboardingStep("export", null);
  }

  async function runOnboardingPreviousAction() {
    if (!onboardingState || onboardingState.completedAt || onboardingActionBusy) return;
    const previousStep = getPreviousOnboardingStep(onboardingState.currentStep);
    if (!previousStep) return;
    onboardingPreviewPresentationPendingRef.current = false;
    setOnboardingRevealAction(null);
    setOnboardingStoryboardRevealCount(null);
    closeAccountAuth();
    closeCreateProjectModal();
    await saveOnboardingState({
      currentStep: previousStep,
      completedAt: null
    });
  }

  function handleWorkspacePresentationOpenChange(isOpen: boolean) {
    setWorkspacePresentationOpen(isOpen);
    // Consume the one-shot tutorial preview request so Workspace remounts do not replay it.
    setOnboardingPresentationRequestId(0);
    if (isOpen || !onboardingPreviewPresentationPendingRef.current) return;
    onboardingPreviewPresentationPendingRef.current = false;
    void completeOnboardingStep("preview");
  }

  useEffect(() => {
    if (!onboardingState || onboardingState.completedAt) return;
    const currentStep = onboardingState.currentStep;
    if (currentStep === "hyperframes") {
      if (!accountAuthOpen) openAccountAuth();
      return;
    }
    if (currentStep === "create_project") {
      if (accountAuthOpen) {
        closeAccountAuth();
        return;
      }
      if (screen !== "projects") void openProjects();
      return;
    }
    if (accountAuthOpen) return;
    const currentTutorialProjectId = getTutorialProjectId(interfaceLanguage);
    if (currentStep === "script") {
      if (screen !== "workspace" || projectId !== currentTutorialProjectId || tab !== "script") void openTutorialProject("script");
      return;
    }
    if (currentStep === "storyboard" || currentStep === "images" || currentStep === "videos" || currentStep === "preview") {
      if (screen !== "workspace" || projectId !== currentTutorialProjectId || tab !== "storyboard") void openTutorialProject("storyboard");
      return;
    }
    if (currentStep === "export" && (screen !== "workspace" || projectId !== currentTutorialProjectId || tab !== "assets")) {
      void openTutorialProject("assets");
    }
  }, [accountAuthOpen, interfaceLanguage, onboardingState?.completedAt, onboardingState?.currentStep, projectId, screen, tab]);

  async function createProject() {
    if (projectCreateBusy) return;
    if (localProjectLimitReached) {
      openProjectLimitPrompt();
      return;
    }
    if (!createReady) {
      return;
    }
    const nextProjectName = projectNameInput.trim();
    setProjectCreateBusy(true);
    try {
      const detail = await window.mkboard.createProject({
        name: nextProjectName,
        icon: projectIconInput,
        imageRatio: projectImageRatioInput,
        templateId: templateInput,
        tasteId: tasteInput,
        storyboardSkillId: projectSkillInput,
        interfaceLanguage
      });
      applyProjectDetail(detail);
      await Promise.all([refreshProjects(), refreshProjectQuotaUsage()]);
      setProjectNameInput("");
      setProjectIconInput("");
      setProjectImageRatioInput("16:9");
      setTemplateInput(getDefaultCreateTemplateId(templates, defaultTemplateId));
      setTasteInput(getDefaultCreateTasteId(tastes, defaultTasteId));
      setProjectSkillInput(getDefaultStoryboardSkillId(interfaceLanguage));
      closeCreateProjectModal();
      applyRoute({ screen: "workspace", projectId: detail.project.id, tab: "script" });
      if (onboardingState?.currentStep === "create_project") {
        await completeOnboardingStep("create_project");
        await openTutorialProject("script");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isLocalProjectLimitError(message)) {
        openProjectLimitPrompt(message);
      } else {
        openAccountAuthWithMessage(message);
      }
    } finally {
      setProjectCreateBusy(false);
    }
  }

  async function persistScript(nextScriptRichText: string) {
    setScriptRichText(nextScriptRichText);
    if (projectDetail) await window.mkboard.updateScript(projectDetail.project.id, nextScriptRichText);
  }

  async function generateStoryboardFromScript(input: { userContent?: string; sourceDetail?: ProjectDetail } = {}) {
    const clickStartedAt = Date.now();
    const clientRunId = createClientRunId();
    const parseLog = createStoryboardParseClientLogContext(clientRunId, clickStartedAt);
    const activeProjectDetail = input.sourceDetail ?? projectDetail;
    logStoryboardParseClientStep(parseLog, "click_generate_storyboard", {
      hasProject: Boolean(activeProjectDetail),
      storyboardGenerating,
      selectedCliId,
      selectedCliName,
      currentRowCount: activeProjectDetail?.rows.length ?? storyboardRows.length
    });
    if (!activeProjectDetail) {
      logStoryboardParseClientStep(parseLog, "blocked_no_project");
      return;
    }
    const targetProjectId = activeProjectDetail.project.id;
    const targetConversationId = isCurrentProjectId(targetProjectId)
      ? activeAgentConversationIdRef.current
      : activeProjectDetail.activeAgentConversationId;
    if (storyboardGenerating || activeStoryboardParseRunIdRef.current) {
      logStoryboardParseClientStep(parseLog, "blocked_storyboard_busy");
      return;
    }

    activeStoryboardParseRunIdRef.current = clientRunId;
    setStoryboardBusyAction("parse");
    let workflowRun: Awaited<ReturnType<typeof startStoryboardAgentWorkflow>> | null = null;
    let workflowT = createTranslator(interfaceLanguage);
    try {
      logStoryboardParseClientStep(parseLog, "cli_preflight_start", { selectedCliId, selectedCliName });
      const ready = await ensureSelectedCliReady();
      logStoryboardParseClientStep(parseLog, "cli_preflight_complete", { ready });
      if (!ready) return;
      workflowRun = await startStoryboardAgentWorkflow("parse", activeProjectDetail.rows.length, input.userContent, {
        clientRunId,
        conversationId: targetConversationId,
        projectId: targetProjectId
      });
      workflowT = createTranslator(workflowRun.language);
      logStoryboardParseClientStep(parseLog, "workflow_created", {
        conversationId: workflowRun.conversationId,
        ...summarizeProjectForStoryboardParseLog(activeProjectDetail)
      });
      markAgentClientRunRunning(workflowRun.clientRunId, workflowRun.conversationId);
      setAgentBusy(true);
      setActiveAgentClientRunId(workflowRun.clientRunId);
      logStoryboardParseClientStep(parseLog, "ipc_generate_storyboard_start");
      const rows = await window.mkboard.generateStoryboard({
        projectId: targetProjectId,
        agentCliId: selectedCliId,
        interfaceLanguage,
        conversationId: workflowRun.conversationId,
        clientRunId: workflowRun.clientRunId,
        clientStartedAt: clickStartedAt,
        userMessage: input.userContent
      });
      logStoryboardParseClientStep(parseLog, "ipc_generate_storyboard_complete", { returnedRowCount: rows.length });
      updateStoryboardAgentWorkflow(workflowRun, "succeeded", workflowT("agent.workflow.parseSucceeded", { count: rows.length }));
      if (!isCurrentWorkspaceProjectId(targetProjectId)) {
        logStoryboardParseClientStep(parseLog, "ignored_stale_project_completion", {
          currentProjectId: currentProjectIdRef.current,
          currentScreen: currentScreenRef.current,
          targetProjectId
        });
        return;
      }
      trackStoryboardRows(rows);
      logStoryboardParseClientStep(parseLog, "project_refresh_start");
      const detail = await window.mkboard.getProject(targetProjectId, interfaceLanguage);
      if (!isCurrentWorkspaceProjectId(targetProjectId)) {
        logStoryboardParseClientStep(parseLog, "ignored_stale_project_refresh", {
          currentProjectId: currentProjectIdRef.current,
          currentScreen: currentScreenRef.current,
          targetProjectId
        });
        return;
      }
      applyProjectDetail(detail, { expectedStoryboardRowIds: new Set(rows.map((row) => row.id)) });
      logStoryboardParseClientStep(parseLog, "project_refresh_complete", {
        rowCount: detail.rows.length,
        assetCount: detail.assets.length
      });
      applyRoute({ screen: "workspace", projectId: targetProjectId, tab: "storyboard" });
      if (isTutorialProject(activeProjectDetail.project) && onboardingState?.currentStep === "storyboard") {
        await completeOnboardingStep("storyboard");
      }
      logStoryboardParseClientStep(parseLog, "ui_storyboard_tab_opened");
    } catch (error) {
      const message = formatStoryboardParseFailure(error, workflowT);
      logStoryboardParseClientStep(parseLog, "failed", {
        message,
        rawError: error instanceof Error ? error.message : String(error)
      });
      const failedRunId = workflowRun?.clientRunId ?? clientRunId;
      if (!hasAgentClientRunTerminalEvent(failedRunId)) {
        if (workflowRun) updateStoryboardAgentWorkflow(workflowRun, "failed", message);
        if (isCurrentWorkspaceProjectId(targetProjectId)) window.alert(message);
      }
    } finally {
      finishStoryboardParseRun(clientRunId);
      if (workflowRun) {
        const workflowRunId = workflowRun.clientRunId;
        markAgentClientRunStopped(workflowRunId);
        setAgentBusy(false);
        setActiveAgentClientRunId((currentRunId) => (currentRunId === workflowRunId ? null : currentRunId));
      }
      logStoryboardParseClientStep(parseLog, "finished");
    }
  }

  async function ensureMissingStoryboardGenerationPrompts(input: {
    action: StoryboardMediaAiAction;
    excludeRowIds?: Set<string>;
    methodFilter?: StoryboardVideoGenerationMethodFilter;
    mode: StoryboardMediaGenerationMode;
    rowIds?: string[];
    sourceDetail: ProjectDetail;
  }): Promise<ProjectDetail> {
    const targetProjectId = input.sourceDetail.project.id;
    const sourceColumns = ensureStoryboardPromptColumns(input.sourceDetail.columns, interfaceLanguage);
    const promptColumn = input.action === "images"
      ? sourceColumns.find(isStoryboardImagePromptColumn)
      : sourceColumns.find(isStoryboardVideoPromptColumn);
    if (!promptColumn) return input.sourceDetail;

    const requestedRowIds = input.rowIds ? new Set(input.rowIds) : null;
    const excludeRowIds = input.excludeRowIds ?? new Set<string>();
    const candidates =
      input.action === "images"
        ? buildStoryboardImageGenerationCandidates(input.sourceDetail.rows, sourceColumns, input.sourceDetail.imageRatio)
        : filterStoryboardVideoTargetsByMethod(
            buildStoryboardVideoGenerationCandidates(
              input.sourceDetail.rows,
              sourceColumns,
              input.sourceDetail.imageRatio,
              hyperframesVideoResolution,
              seedanceVideoResolution
            ),
            input.methodFilter ?? "all"
          );
    const scopedCandidates = filterStoryboardGenerationTargetsByMode(
      candidates.filter((candidate) => !excludeRowIds.has(candidate.rowId) && (requestedRowIds ? requestedRowIds.has(candidate.rowId) : true)),
      input.sourceDetail.rows,
      input.sourceDetail.assets,
      input.action === "images" ? "image" : "video",
      input.mode
    );
    const rowById = new Map(input.sourceDetail.rows.map((row) => [row.id, row]));
    const updates = scopedCandidates
      .map((candidate) => {
        const row = rowById.get(candidate.rowId);
        if (!row || normalizeGenerationPromptValue(getStoryboardCellValue(promptColumn.id, row))) return null;
        const value =
          input.action === "images"
            ? buildFallbackImagePrompt(row, (candidate as StoryboardImageGenerationCandidate).method, input.sourceDetail.imageRatio)
            : buildFallbackVideoPrompt(row, (candidate as StoryboardVideoGenerationTarget).method, input.sourceDetail.imageRatio);
        return { rowId: candidate.rowId, value };
      })
      .filter((update): update is { rowId: string; value: string } => Boolean(update?.value));

    if (updates.length === 0) return input.sourceDetail;

    let nextRows = input.sourceDetail.rows;
    for (const update of updates) {
      if (!isCurrentProjectId(targetProjectId)) return { ...input.sourceDetail, columns: sourceColumns, rows: nextRows };
      nextRows = await window.mkboard.updateShot(targetProjectId, {
        id: update.rowId,
        field: promptColumn.id,
        value: update.value
      });
    }

    if (!isCurrentProjectId(targetProjectId)) return { ...input.sourceDetail, columns: sourceColumns, rows: nextRows };
    const detail = await window.mkboard.getProject(targetProjectId, interfaceLanguage);
    if (isCurrentProjectId(targetProjectId)) applyProjectDetail(detail);
    return detail;
  }

  async function generateStoryboardImagesFromCloud(input: { mode?: StoryboardMediaGenerationMode; rowIds?: string[]; overwriteExisting?: boolean; userMessage?: string; sourceDetail?: ProjectDetail } = {}) {
    let activeProjectDetail = input.sourceDetail ?? projectDetail;
    if (!activeProjectDetail || storyboardBusyAction === "parse") return;
    const targetProjectId = activeProjectDetail.project.id;
    if (!isCurrentProjectId(targetProjectId)) return;
    if (!acquireStoryboardMediaSubmitLock("images", targetProjectId)) return;
    const requestedRowIds = input.rowIds ? new Set(input.rowIds) : null;
    const generationMode = input.mode ?? (requestedRowIds || input.overwriteExisting ? "all" : "missing");
    const optimisticTargets = filterStoryboardGenerationTargetsByMode(
      buildStoryboardImageGenerationCandidates(
        activeProjectDetail.rows,
        ensureStoryboardPromptColumns(activeProjectDetail.columns, interfaceLanguage),
        activeProjectDetail.imageRatio
      ).filter(
        (target) => !storyboardImageGeneratingRowIds.has(target.rowId) && (requestedRowIds ? requestedRowIds.has(target.rowId) : true)
      ),
      activeProjectDetail.rows,
      activeProjectDetail.assets,
      "image",
      generationMode
    );
    const optimisticRowIds = optimisticTargets.map((target) => target.rowId);
    let preflightScopeRowIds = optimisticRowIds;
    setStoryboardImagePreflightRowIds((currentRowIds) => addGenerationRowIds(currentRowIds, optimisticRowIds));
    let workflowRun: Awaited<ReturnType<typeof startStoryboardAgentWorkflow>> | null = null;
    let targetRowIds: string[] = [];
    try {
      const latestByok = window.mkboard?.getByokSettings ? await window.mkboard.getByokSettings() : byokSettings;
      if (latestByok) setByokSettings(latestByok);
      if (!isCurrentProjectId(targetProjectId)) return;
      if (latestByok) {
        const activeImgProvider = latestByok.providers.find((p) => p.id === latestByok.activeImageProvider);
        if (activeImgProvider && !activeImgProvider.configured) {
          openAccountAuthWithMessage(`尚未配置图片生成密钥（${activeImgProvider.name}）。请在下方填入你自己的 API Key，或切换为免 Key 本地离线占位模式（Offline Stub）。`);
          return;
        }
      }
      activeProjectDetail = await ensureMissingStoryboardGenerationPrompts({
        action: "images",
        excludeRowIds: storyboardImageGeneratingRowIds,
        mode: generationMode,
        rowIds: input.rowIds,
        sourceDetail: activeProjectDetail
      });
      if (!isCurrentProjectId(targetProjectId)) return;
      const sourceRows = activeProjectDetail.rows;
      const sourceColumns = ensureStoryboardPromptColumns(activeProjectDetail.columns, interfaceLanguage);
      const sourceAssets = activeProjectDetail.assets;
      const allTargets = buildStoryboardImageGenerationTargets(sourceRows, sourceColumns, activeProjectDetail.imageRatio).filter(
        (target) => !storyboardImageGeneratingRowIds.has(target.rowId) && (requestedRowIds ? requestedRowIds.has(target.rowId) : true)
      );
      const targets = filterStoryboardGenerationTargetsByMode(allTargets, sourceRows, sourceAssets, "image", generationMode);
      targetRowIds = targets.map((target) => target.rowId);
      preflightScopeRowIds = [...new Set([...preflightScopeRowIds, ...targetRowIds])];
      setStoryboardImagePreflightRowIds((currentRowIds) => replaceGenerationRowIds(currentRowIds, optimisticRowIds, new Set(targetRowIds)));
      if (targets.length === 0) {
        window.alert(
          generationMode === "missing"
            ? t("storyboard.imageNoMissingAlert")
            : t("storyboard.imageNoTargetsAlert")
        );
        return;
      }



      workflowRun = await startStoryboardAgentWorkflow("images", targets.length, input.userMessage, {
        localOnly: true,
        projectId: targetProjectId
      });
      const workflowT = createTranslator(workflowRun.language);
      markAgentClientRunRunning(workflowRun.clientRunId, workflowRun.conversationId);
      setAgentBusy(true);
      setActiveAgentClientRunId(workflowRun.clientRunId);
      setStoryboardImageGeneratingRowIds((currentRowIds) => addGenerationRowIds(currentRowIds, targetRowIds));
      setStoryboardImagePreflightRowIds((currentRowIds) => removeGenerationRowIds(currentRowIds, preflightScopeRowIds));
      setStoryboardImageGenerationTasks((currentTasks) => mergeGenerationTaskItems(currentTasks, mapPendingImageGenerationTargets(targets)));
      scrollNearestStoryboardRowsIntoView(targetRowIds);
      updateStoryboardAgentWorkflow(workflowRun, "running", workflowT("agent.workflow.imagesSubmitting", { count: targets.length }));
      const result = await window.mkboard.generateStoryboardImages({
        projectId: targetProjectId,
        overwriteExisting: input.overwriteExisting ?? false,
        items: targets
      });
      if (!isCurrentProjectId(targetProjectId)) return;
      if (!result.ok) {
        handleCloudGenerationError(result.error.code, result.error.message, result.error.details);
        setStoryboardImageGeneratingRowIds((currentRowIds) => removeGenerationRowIds(currentRowIds, targetRowIds));
        setStoryboardImageGenerationTasks((currentTasks) => markGenerationTasksFailedForRows(currentTasks, targetRowIds, "image", result.error.message || t("agent.workflow.imagesFailed")));
        updateStoryboardAgentWorkflow(workflowRun, "failed", result.error.message || workflowT("agent.workflow.imagesFailed"));
        return;
      }
      updateStoryboardAgentWorkflow(workflowRun, "running", workflowT("agent.workflow.imagesSubmitted", { count: result.data.submittedCount }));
      setStoryboardImageGeneratingRowIds((currentRowIds) =>
        replaceGenerationRowIds(currentRowIds, targetRowIds, getRunningStoryboardImageRowIds(result.data.tasks, targetRowIds))
      );
      setStoryboardImageGenerationTasks((currentTasks) => mergeGenerationTaskItems(currentTasks, mapImageGenerationTasks(result.data.tasks)));
      releaseStoryboardMediaSubmitLock("images", targetProjectId);
      const syncSummary = await pollStoryboardImageBatch({
        projectId: targetProjectId,
        cloudProjectId: result.data.cloudProjectId,
        batchId: result.data.batchId,
        rowIds: targetRowIds,
        overwriteExisting: input.overwriteExisting ?? false
      });
      if (!isCurrentProjectId(targetProjectId)) return;
      if (!isCurrentProjectId(targetProjectId)) return;
      const importedCopy = syncSummary.localAvailableCount > 0 ? t("storyboard.imageLocalAvailableAlert", { available: syncSummary.localAvailableCount, succeeded: syncSummary.succeededCount }) : "";
      const newlyImportedCopy = syncSummary.importedCount > 0 ? t("storyboard.imageNewlyImportedAlert", { count: syncSummary.importedCount }) : "";
      const pendingCopy = syncSummary.pendingCount > 0 ? t("storyboard.imagePendingAlert", { count: syncSummary.pendingCount }) : "";
      const failedCopy = syncSummary.failedCount > 0 ? t("storyboard.imageFailedAlert", { count: syncSummary.failedCount }) : "";
      const localFailedCopy = syncSummary.localImportFailedCount > 0 ? t("storyboard.imageLocalFailedAlert", { count: syncSummary.localImportFailedCount }) : "";
      const imageGenerationFailed = syncSummary.failedCount > 0 || syncSummary.localImportFailedCount > 0;
      updateStoryboardAgentWorkflow(
        workflowRun,
        imageGenerationFailed ? "failed" : "succeeded",
        workflowT(imageGenerationFailed ? "agent.workflow.imagesCompletedWithFailures" : "agent.workflow.imagesSucceeded", {
          imported: syncSummary.localAvailableCount,
          pending: syncSummary.pendingCount,
          failed: syncSummary.failedCount,
          localFailed: syncSummary.localImportFailedCount,
          succeeded: syncSummary.succeededCount
        })
      );
      if (!imageGenerationFailed && isTutorialProject(activeProjectDetail.project) && onboardingState?.currentStep === "images") {
        await completeOnboardingStep("images");
      }
      window.alert([t("storyboard.imageSubmittedAlert", { count: result.data.submittedCount }), t("storyboard.imageCloudCompletedAlert", { count: syncSummary.succeededCount }), importedCopy, newlyImportedCopy, pendingCopy, failedCopy, localFailedCopy].filter(Boolean).join("\n"));
    } catch (error) {
      if (!isCurrentProjectId(targetProjectId)) return;
      if (workflowRun) {
        setStoryboardImageGeneratingRowIds((currentRowIds) => removeGenerationRowIds(currentRowIds, targetRowIds));
        setStoryboardImageGenerationTasks((currentTasks) => markGenerationTasksFailedForRows(currentTasks, targetRowIds, "image", error instanceof Error ? error.message : String(error)));
        updateStoryboardAgentWorkflow(workflowRun, "failed", error instanceof Error ? error.message : String(error));
      }
      window.alert(error instanceof Error ? error.message : String(error));
    } finally {
      if (isCurrentProjectId(targetProjectId)) {
        setStoryboardImagePreflightRowIds((currentRowIds) => removeGenerationRowIds(currentRowIds, preflightScopeRowIds));
      }
      if (workflowRun) markAgentClientRunStopped(workflowRun.clientRunId);
      if (workflowRun && isCurrentProjectId(targetProjectId)) {
        const clientRunId = workflowRun.clientRunId;
        setAgentBusy(false);
        setActiveAgentClientRunId((currentRunId) => (currentRunId === clientRunId ? null : currentRunId));
      }
      finishStoryboardMediaRun("images", targetProjectId);
    }
  }

  async function pollStoryboardImageBatch(input: { projectId: string; cloudProjectId: string; batchId: string; rowIds: string[]; overwriteExisting?: boolean }) {
    let summary = { importedCount: 0, localAvailableCount: 0, localImportFailedCount: 0, pendingCount: input.rowIds.length, failedCount: 0, succeededCount: 0 };
    const maxAttempts = Math.ceil(STORYBOARD_IMAGE_POLL_TIMEOUT_MS / STORYBOARD_IMAGE_POLL_INTERVAL_MS);
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (attempt > 0) await delay(STORYBOARD_IMAGE_POLL_INTERVAL_MS);
      if (!isCurrentProjectId(input.projectId)) return summary;
      const syncResult = await window.mkboard.syncStoryboardImageBatch({
        projectId: input.projectId,
        cloudProjectId: input.cloudProjectId,
        batchId: input.batchId,
        overwriteExisting: input.overwriteExisting ?? false
      });
      if (!isCurrentProjectId(input.projectId)) return summary;
      if (!syncResult.ok) {
        if (isTransientCloudGenerationPollError(syncResult.error.code, syncResult.error.message)) {
          console.warn("Storyboard image generation sync failed temporarily; retrying.", syncResult.error);
          continue;
        }
        handleCloudGenerationError(syncResult.error.code, syncResult.error.message, syncResult.error.details);
        setStoryboardImageGeneratingRowIds((currentRowIds) => removeGenerationRowIds(currentRowIds, input.rowIds));
        setStoryboardImageGenerationTasks((currentTasks) => markGenerationTasksFailedForRows(currentTasks, input.rowIds, "image", syncResult.error.message || t("agent.workflow.imagesFailed")));
        return summary;
      }
      setStoryboardImageGeneratingRowIds((currentRowIds) =>
        replaceGenerationRowIds(currentRowIds, input.rowIds, getRunningStoryboardImageRowIds(syncResult.data.tasks, input.rowIds))
      );
      if (syncResult.data.importedCount > 0 || syncResult.data.localAvailableCount > 0) {
        applyShotMediaUpdate(syncResult.data, input.projectId);
      }
      setStoryboardImageGenerationTasks((currentTasks) => mergeGenerationTaskItems(currentTasks, mapImageGenerationTasks(syncResult.data.tasks)));
      summary = {
        importedCount: summary.importedCount + syncResult.data.importedCount,
        localAvailableCount: syncResult.data.localAvailableCount,
        localImportFailedCount: syncResult.data.localImportFailedCount,
        pendingCount: syncResult.data.pendingCount,
        failedCount: syncResult.data.failedCount,
        succeededCount: syncResult.data.succeededCount
      };
      if (syncResult.data.pendingCount === 0) {
        setStoryboardImageGeneratingRowIds((currentRowIds) => removeGenerationRowIds(currentRowIds, input.rowIds));
        return summary;
      }
    }
    return summary;
  }

  function handleCloudGenerationError(code: string, message: string, _details?: unknown) {
    if (code === "BYOK_NOT_CONFIGURED" || code === "UNAUTHORIZED") {
      openAccountAuthWithMessage(message || "请先在「API 与多端」中配置本地 BYOK API Key。");
      return;
    }
    window.alert(message || t("cloudAuth.generationSubmitFailed"));
  }

  function setStoryboardBusyFromActiveGenerations(hasActiveImages: boolean, hasActiveVideos: boolean) {
    setStoryboardBusyAction((currentAction) => {
      const submitLock = storyboardMediaSubmitLockRef.current;
      if (submitLock) return currentAction ?? submitLock.action;
      if (currentAction === "parse") return currentAction;
      const activeRunAction = getActiveStoryboardMediaRunAction();
      if (activeRunAction) return activeRunAction;
      if (hasActiveImages) return "images";
      if (hasActiveVideos) return "videos";
      return currentAction === "images" || currentAction === "videos" ? null : currentAction;
    });
  }

  async function syncActiveStoryboardGenerationState(targetProjectId: string) {
    const expectedStoryboardRowIds = getCurrentStoryboardRowIds();
    let imageRowIds = new Set<string>();
    let videoRowIds = new Set<string>();
    let activeVideoTaskCount = 0;

    if (window.mkboard?.syncActiveStoryboardImageGenerations) {
      try {
        const imageResult = await window.mkboard.syncActiveStoryboardImageGenerations(targetProjectId);
        if (currentProjectIdRef.current !== targetProjectId) return { active: false, imageRowIds, videoRowIds };
        if (imageResult.ok) {
          if (imageResult.data.importedCount > 0 || imageResult.data.localAvailableCount > 0) {
            applyShotMediaUpdate(imageResult.data, targetProjectId, expectedStoryboardRowIds);
          }
          imageRowIds = new Set(
            [...getRunningStoryboardImageRowIds(imageResult.data.tasks)].filter(
              (rowId) => expectedStoryboardRowIds.size === 0 || expectedStoryboardRowIds.has(rowId)
            )
          );
          if (getStoryboardMediaRunCount("images", targetProjectId) === 0 || storyboardImageGeneratingRowIds.size === 0) {
            setStoryboardImageGeneratingRowIds(imageRowIds);
            setStoryboardImageGenerationTasks(
              mapImageGenerationTasks(
                imageResult.data.tasks.filter(
                  (task) => typeof task.rowId === "string" && (expectedStoryboardRowIds.size === 0 || expectedStoryboardRowIds.has(task.rowId))
                )
              )
            );
          }
        }
      } catch (error) {
        console.warn("Failed to sync active storyboard image generations", error);
      }
    } else {
      if (currentProjectIdRef.current !== targetProjectId) return { active: false, imageRowIds, videoRowIds };
      if (getStoryboardMediaRunCount("images", targetProjectId) === 0 || storyboardImageGeneratingRowIds.size === 0) {
        setStoryboardImageGeneratingRowIds(new Set());
        setStoryboardImageGenerationTasks([]);
      }
    }

    try {
      const videoResult = await window.mkboard.getActiveStoryboardVideoGenerations(targetProjectId);
      if (currentProjectIdRef.current !== targetProjectId) return { active: false, imageRowIds, videoRowIds };
      const videoTasks = videoResult.tasks.length > 0 ? videoResult.tasks : videoResult.rowIds.map((rowId) => ({ rowId, status: "running" as const }));
      const currentVideoTasks = videoTasks.filter(
        (task) => expectedStoryboardRowIds.size === 0 || expectedStoryboardRowIds.has(task.rowId)
      );
      activeVideoTaskCount = currentVideoTasks.filter((task) => task.status === "queued" || task.status === "running").length;
      videoRowIds = new Set(currentVideoTasks.filter((task) => task.status === "queued" || task.status === "running").map((task) => task.rowId));
      if (getStoryboardMediaRunCount("videos", targetProjectId) === 0 || storyboardVideoGeneratingRowIds.size === 0) {
        setStoryboardVideoGeneratingRowIds(videoRowIds);
        setStoryboardVideoGenerationTasks(currentVideoTasks.length > 0 ? mapActiveVideoGenerationTasks(currentVideoTasks) : []);
      }
      if (
        (getStoryboardMediaRunCount("videos", targetProjectId) === 0 || storyboardVideoGeneratingRowIds.size === 0) &&
        currentVideoTasks.some((task) => task.status === "succeeded" && task.assetId)
      ) {
        const detail = await window.mkboard.getProject(targetProjectId, interfaceLanguage);
        if (currentProjectIdRef.current === targetProjectId) {
          applyProjectDetail(detail, { expectedStoryboardRowIds });
        }
      }
    } catch (error) {
      console.warn("Failed to sync active storyboard video generations", error);
    }

    const hasActiveImages = imageRowIds.size > 0 || getStoryboardMediaRunCount("images", targetProjectId) > 0;
    const hasActiveVideos = activeVideoTaskCount > 0 || getStoryboardMediaRunCount("videos", targetProjectId) > 0;
    if (currentProjectIdRef.current !== targetProjectId) return { active: false, imageRowIds, videoRowIds };
    setStoryboardBusyFromActiveGenerations(hasActiveImages, hasActiveVideos);
    return { active: hasActiveImages || hasActiveVideos, imageRowIds, videoRowIds };
  }

  async function restoreActiveStoryboardGenerationState(targetProjectId: string) {
    if (generationRestoreProjectIdRef.current === targetProjectId) return;
    generationRestoreProjectIdRef.current = targetProjectId;
    const expectedStoryboardRowIds = getCurrentStoryboardRowIds();
    let hadActiveVideos = false;
    try {
      for (let attempt = 0; attempt < 600; attempt += 1) {
        if (attempt > 0) await delay(3000);
        if (currentProjectIdRef.current !== targetProjectId) return;
        const state = await syncActiveStoryboardGenerationState(targetProjectId);
        if (currentProjectIdRef.current !== targetProjectId) return;
        hadActiveVideos = hadActiveVideos || state.videoRowIds.size > 0;
        if (attempt === 0) scrollNearestStoryboardRowsIntoView([...state.imageRowIds, ...state.videoRowIds]);
        if (!state.active) {
          if (hadActiveVideos) {
            const detail = await window.mkboard.getProject(targetProjectId, interfaceLanguage);
            if (currentProjectIdRef.current === targetProjectId) {
              applyProjectDetail(detail, { expectedStoryboardRowIds });
            }
          }
          return;
        }
      }
    } finally {
      if (generationRestoreProjectIdRef.current === targetProjectId) generationRestoreProjectIdRef.current = null;
    }
  }

  async function generateStoryboardVideosFromLocal(
    input: {
      rowIds?: string[];
      userMessage?: string;
      mode?: StoryboardMediaGenerationMode;
      methodFilter?: StoryboardVideoGenerationMethodFilter;
      overwriteExisting?: boolean;
      sourceDetail?: ProjectDetail;
      seedanceAspectRatioByRowId?: ReadonlyMap<string, SeedanceAspectRatio>;
    } = {}
  ) {
    let activeProjectDetail = input.sourceDetail ?? projectDetail;
    if (!activeProjectDetail || storyboardBusyAction === "parse") return;
    const targetProjectId = activeProjectDetail.project.id;
    if (!isCurrentProjectId(targetProjectId)) return;
    if (!acquireStoryboardMediaSubmitLock("videos", targetProjectId)) return;
    const requestedRowIds = input.rowIds ? new Set(input.rowIds) : null;
    const generationMode = input.mode ?? (requestedRowIds || input.overwriteExisting ? "all" : "missing");
    const optimisticTargets = filterStoryboardGenerationTargetsByMode(
      filterStoryboardVideoTargetsByMethod(
        applyAgentSeedanceAspectRatioOverrides(
          buildStoryboardVideoGenerationCandidates(
            activeProjectDetail.rows,
            ensureStoryboardPromptColumns(activeProjectDetail.columns, interfaceLanguage),
            activeProjectDetail.imageRatio,
            hyperframesVideoResolution,
            seedanceVideoResolution
          ),
          input.seedanceAspectRatioByRowId
        ).filter(
          (target) => !storyboardVideoGeneratingRowIds.has(target.rowId) && (requestedRowIds ? requestedRowIds.has(target.rowId) : true)
        ),
        input.methodFilter ?? "all"
      ),
      activeProjectDetail.rows,
      activeProjectDetail.assets,
      "video",
      generationMode
    );
    const optimisticRowIds = optimisticTargets.map((target) => target.rowId);
    let preflightScopeRowIds = optimisticRowIds;
    setStoryboardVideoPreflightRowIds((currentRowIds) => addGenerationRowIds(currentRowIds, optimisticRowIds));
    let workflowRun: Awaited<ReturnType<typeof startStoryboardAgentWorkflow>> | null = null;
    let targetRowIds: string[] = [];
    try {
      const latestByok = window.mkboard?.getByokSettings ? await window.mkboard.getByokSettings() : byokSettings;
      if (latestByok) setByokSettings(latestByok);
      if (!isCurrentProjectId(targetProjectId)) return;
      activeProjectDetail = await ensureMissingStoryboardGenerationPrompts({
        action: "videos",
        excludeRowIds: storyboardVideoGeneratingRowIds,
        methodFilter: input.methodFilter,
        mode: generationMode,
        rowIds: input.rowIds,
        sourceDetail: activeProjectDetail
      });
      if (!isCurrentProjectId(targetProjectId)) return;
      const sourceRows = activeProjectDetail.rows;
      const sourceColumns = ensureStoryboardPromptColumns(activeProjectDetail.columns, interfaceLanguage);
      const sourceAssets = activeProjectDetail.assets;
      const allTargets = filterStoryboardVideoTargetsByMethod(
        applyAgentSeedanceAspectRatioOverrides(
          buildStoryboardVideoGenerationTargets(
            sourceRows,
            sourceColumns,
            activeProjectDetail.imageRatio,
            hyperframesVideoResolution,
            seedanceVideoResolution
          ),
          input.seedanceAspectRatioByRowId
        ).filter((target) =>
          !storyboardVideoGeneratingRowIds.has(target.rowId) && (requestedRowIds ? requestedRowIds.has(target.rowId) : true)
        ),
        input.methodFilter ?? "all"
      );
      const targets = filterStoryboardGenerationTargetsByMode(allTargets, sourceRows, sourceAssets, "video", generationMode);
      targetRowIds = targets.map((target) => target.rowId);
      preflightScopeRowIds = [...new Set([...preflightScopeRowIds, ...targetRowIds])];
      setStoryboardVideoPreflightRowIds((currentRowIds) => replaceGenerationRowIds(currentRowIds, optimisticRowIds, new Set(targetRowIds)));
      if (targets.length === 0) {
        window.alert(
          generationMode === "missing"
            ? t("storyboard.videoNoMissingAlert")
            : t("storyboard.videoNoTargetsAlert")
        );
        return;
      }

      if (targets.some((target) => target.method === "Hyperframes")) {
        const ready = await ensureSelectedCliReady();
        if (!isCurrentProjectId(targetProjectId)) return;
        if (!ready) return;
      }

      if (targets.some((target) => target.method === "Seedance 2.0")) {
        const kieProvider = latestByok?.providers.find((p) => p.id === "kie");
        if (kieProvider && !kieProvider.configured) {
          openAccountAuthWithMessage("Seedance 2.0 视频生成需要在本地填入你自己的 KIE_API_KEY；若想免 Key 生成视频，可将镜头生成方式切换为 Hyperframes。");
          return;
        }
      }

      workflowRun = await startStoryboardAgentWorkflow("videos", targets.length, input.userMessage, { projectId: targetProjectId });
      const workflowT = createTranslator(workflowRun.language);
      setStoryboardVideoGeneratingRowIds((currentRowIds) => addGenerationRowIds(currentRowIds, targetRowIds));
      setStoryboardVideoPreflightRowIds((currentRowIds) => removeGenerationRowIds(currentRowIds, preflightScopeRowIds));
      setStoryboardVideoGenerationTasks((currentTasks) => mergeGenerationTaskItems(currentTasks, mapQueuedVideoGenerationTargets(targets, t)));
      scrollNearestStoryboardRowsIntoView(targetRowIds);
      const generationPromise = window.mkboard.generateStoryboardVideos({
        projectId: targetProjectId,
        overwriteExisting: input.overwriteExisting ?? false,
        agentCliId: selectedCliId,
        hyperframesConcurrency: hyperframesVideoConcurrency,
        items: targets
      });
      releaseStoryboardMediaSubmitLock("videos", targetProjectId);
      const result = await generationPromise;
      if (!isCurrentProjectId(targetProjectId)) return;
      applyShotMediaUpdate(result, targetProjectId);
      setStoryboardVideoGenerationTasks((currentTasks) => mergeGenerationTaskItems(currentTasks, mapVideoGenerationTaskResults(result.tasks)));
      setStoryboardVideoGeneratingRowIds((currentRowIds) =>
        replaceGenerationRowIds(
          currentRowIds,
          targetRowIds,
          new Set(result.tasks.filter((task) => isActiveGenerationTaskStatus(normalizeGenerationTaskStatus(task.status))).map((task) => task.rowId))
        )
      );
      const cancelledCount = result.tasks.filter((task) => task.status === "cancelled").length;
      const actualFailedCount = result.tasks.filter((task) => task.status === "failed").length;
      const failedMessages = result.tasks
        .filter((task) => task.status === "failed")
        .map((task) => task.errorMessage)
        .filter(Boolean)
        .slice(0, 2);
      const failedDetails = failedMessages.length > 0 ? (interfaceLanguage === "en" ? `: ${failedMessages.join("; ")}` : `：${failedMessages.join("；")}`) : interfaceLanguage === "en" ? "." : "。";
      const failedCopy = actualFailedCount > 0 ? `\n${t("storyboard.videoFailedAlert", { count: actualFailedCount, details: failedDetails })}` : "";
      const cancelledCopy = cancelledCount > 0 ? `\n${t("storyboard.videoCancelledCountAlert", { count: cancelledCount })}` : "";
      const videoGenerationFailed = result.failedCount > 0 || cancelledCount > 0;
      updateStoryboardAgentWorkflow(
        workflowRun,
        videoGenerationFailed ? "failed" : "succeeded",
        workflowT(videoGenerationFailed ? "agent.workflow.videosCompletedWithFailures" : "agent.workflow.videosSucceeded", {
          succeeded: result.succeededCount,
          total: result.submittedCount,
          failed: result.failedCount
        })
      );
      if (!videoGenerationFailed && isTutorialProject(activeProjectDetail.project) && onboardingState?.currentStep === "videos") {
        await completeOnboardingStep("videos");
      }
      window.alert(`${cancelledCount > 0 ? t("storyboard.videoCancelledAlert") : t("storyboard.videoSucceededAlert", { succeeded: result.succeededCount, total: result.submittedCount })}${failedCopy}${cancelledCopy}`);
    } catch (error) {
      if (!isCurrentProjectId(targetProjectId)) return;
      const rawMessage = error instanceof Error ? error.message : String(error);
      const quotaError = isLocalProjectLimitError(rawMessage);
      const displayMessage = quotaError ? projectLimitMessage : rawMessage;
      if (workflowRun) {
        setStoryboardVideoGeneratingRowIds((currentRowIds) => removeGenerationRowIds(currentRowIds, targetRowIds));
        setStoryboardVideoGenerationTasks((currentTasks) => markGenerationTasksFailedForRows(currentTasks, targetRowIds, "video", displayMessage));
        updateStoryboardAgentWorkflow(workflowRun, "failed", displayMessage);
      }
      if (quotaError) {
        openProjectLimitPrompt(displayMessage);
      } else {
        window.alert(displayMessage);
      }
    } finally {
      if (isCurrentProjectId(targetProjectId)) {
        setStoryboardVideoPreflightRowIds((currentRowIds) => removeGenerationRowIds(currentRowIds, preflightScopeRowIds));
      }
      finishStoryboardMediaRun("videos", targetProjectId);
    }
  }

  async function cancelStoryboardVideoGenerations() {
    if (!projectDetail) return;
    const projectId = projectDetail.project.id;
    const cancelled = await window.mkboard.cancelStoryboardVideoGenerations(projectId);
    if (!cancelled) return;
    setStoryboardVideoGeneratingRowIds(new Set());
    setStoryboardVideoGenerationTasks((currentTasks) => markGenerationTasksCancelled(currentTasks, t("storyboard.generationStatusCancelled")));
  }

  async function retryStoryboardGenerationTask(task: StoryboardGenerationTaskItem) {
    const targetProjectId = projectDetail?.project.id;
    if (!targetProjectId || !isCurrentProjectId(targetProjectId)) return;

    const shouldRecoverExistingCloudResult =
      Boolean(task.canRetryDelivery || task.localDeliveryFailed) &&
      (task.kind === "image" || (task.kind === "video" && task.method === "Seedance 2.0"));
    if (!shouldRecoverExistingCloudResult) {
      if (task.kind === "video") {
        await generateStoryboardVideosFromLocal({
          rowIds: [task.rowId],
          mode: "all",
          overwriteExisting: true,
          userMessage: t("storyboard.retryFailedShotVideo")
        });
      }
      return;
    }

    const result = await window.mkboard.retryStoryboardGenerationDelivery({
      projectId: targetProjectId,
      kind: task.kind,
      taskId: task.kind === "video" ? task.providerTaskId || task.id : task.id,
      rowId: task.rowId,
      overwriteExisting: true
    });
    if (!result.ok) throw new Error(result.error.message);
    if (!isCurrentProjectId(targetProjectId)) return;

    if (result.data.rows.length > 0 || result.data.assets.length > 0) {
      applyShotMediaUpdate(result.data, targetProjectId);
    }
    if (result.data.imageTask) {
      setStoryboardImageGenerationTasks((currentTasks) =>
        mergeGenerationTaskItems(currentTasks, mapImageGenerationTasks([result.data.imageTask!]))
      );
    }
    if (result.data.videoTask) {
      setStoryboardVideoGenerationTasks((currentTasks) =>
        mergeGenerationTaskItems(currentTasks, mapActiveVideoGenerationTasks([result.data.videoTask!]))
      );
    }
    if (result.data.recovered) {
      const detail = await window.mkboard.getProject(targetProjectId, interfaceLanguage);
      if (isCurrentProjectId(targetProjectId)) applyProjectDetail(detail);
    }
  }

  async function createStoryboardRows(count: number) {
    if (!projectDetail) return;
    trackStoryboardRows(await window.mkboard.createShots(projectDetail.project.id, count));
  }

  async function insertStoryboardRow(rowId: string, placement: "before" | "after") {
    if (!projectDetail) return;
    trackStoryboardRows(await window.mkboard.insertShot(projectDetail.project.id, rowId, placement));
  }

  async function duplicateStoryboardRows(rowIds: string[]) {
    if (!projectDetail || rowIds.length === 0) return;
    trackStoryboardRows(await window.mkboard.duplicateShots(projectDetail.project.id, rowIds));
  }

  async function deleteStoryboardRows(rowIds: string[]) {
    if (!projectDetail || rowIds.length === 0) return;
    trackStoryboardRows(await window.mkboard.deleteShots(projectDetail.project.id, rowIds));
  }

  async function updateStoryboardCell(rowId: string, field: UpdateShotInput["field"], value: string) {
    if (!projectDetail) return;
    trackStoryboardRows(await window.mkboard.updateShot(projectDetail.project.id, { id: rowId, field, value }));
  }

  async function reorderStoryboardRows(sourceRowId: string, targetRowId: string) {
    if (!projectDetail) return;
    trackStoryboardRows(await window.mkboard.reorderShots(projectDetail.project.id, sourceRowId, targetRowId));
  }

  async function saveStoryboardColumns(nextColumns: StoryboardColumn[]) {
    if (!projectDetail) return;
    const columns = ensureStoryboardPromptColumns(nextColumns, interfaceLanguage);
    setStoryboardColumns(columns);
    await window.mkboard.saveStoryboardColumns(projectDetail.project.id, columns);
  }

  async function saveImageRatio(nextImageRatio: ImageRatio) {
    if (!projectDetail) return;
    setImageRatio(nextImageRatio);
    await window.mkboard.saveImageRatio(projectDetail.project.id, nextImageRatio);
  }

  async function saveProjectStoryboardSkill(skillId: string): Promise<ProjectSkill> {
    if (!projectDetail) throw new Error(t("project.noOpenProject"));
    const targetProjectId = projectDetail.project.id;
    const skill = await window.mkboard.saveStoryboardSkill(targetProjectId, skillId);
    setProjectDetail((currentDetail) => (currentDetail?.project.id === targetProjectId ? { ...currentDetail, storyboardSkill: skill } : currentDetail));
    return skill;
  }

  async function saveProjectTaste(tasteId: string): Promise<ProjectTaste> {
    if (!projectDetail) throw new Error(t("project.noOpenProject"));
    const targetProjectId = projectDetail.project.id;
    const taste = await window.mkboard.saveProjectTaste(targetProjectId, tasteId);
    setProjectDetail((currentDetail) =>
      currentDetail?.project.id === targetProjectId
        ? { ...currentDetail, project: { ...currentDetail.project, tasteId: taste.id }, taste }
        : currentDetail
    );
    setProjects((currentProjects) =>
      currentProjects.map((project) => (project.id === targetProjectId ? { ...project, tasteId: taste.id } : project))
    );
    return taste;
  }

  async function importAssetPaths(filePaths: string[]) {
    if (!projectDetail || filePaths.length === 0) return;
    const targetProjectId = projectDetail.project.id;
    const previousAssetIds = new Set(assets.map((asset) => asset.id));
    try {
      const nextAssets = await window.mkboard.importAssetPaths(targetProjectId, filePaths);
      const importedCount = nextAssets.filter((asset) => !previousAssetIds.has(asset.id)).length;
      setAssets(nextAssets);
      setProjectDetail((detail) => (detail?.project.id === targetProjectId ? { ...detail, assets: nextAssets } : detail));
      setAssetDropNotice(importedCount > 0 ? { kind: "imported", count: importedCount } : { kind: "duplicates-skipped" });
    } catch (error) {
      console.error("Failed to import assets", error);
      setAssetDropNotice({ kind: "import-failed" });
    }
  }

  async function chooseProjectAssets(): Promise<ProjectAsset[]> {
    if (!projectDetail) return assets;
    const targetProjectId = projectDetail.project.id;
    const previousAssetIds = new Set(assets.map((asset) => asset.id));
    try {
      const nextAssets = await window.mkboard.chooseAssets(targetProjectId);
      const importedCount = nextAssets.filter((asset) => !previousAssetIds.has(asset.id)).length;
      setAssets(nextAssets);
      setProjectDetail((detail) => (detail?.project.id === targetProjectId ? { ...detail, assets: nextAssets } : detail));
      if (importedCount > 0) setAssetDropNotice({ kind: "imported", count: importedCount });
      return nextAssets;
    } catch (error) {
      console.error("Failed to choose assets", error);
      setAssetDropNotice({ kind: "import-failed" });
      throw error;
    }
  }

  function applyShotMediaUpdate(
    result: ShotMediaUpdateResult,
    targetProjectId: string,
    expectedStoryboardRowIds: Set<string> = getCurrentStoryboardRowIds()
  ) {
    if (!isCurrentProjectId(targetProjectId)) return;
    if (
      expectedStoryboardRowIds.size > 0 &&
      !storyboardRowIdSetsEqual(new Set(result.rows.map((row) => row.id)), expectedStoryboardRowIds)
    ) {
      console.warn("Ignored stale storyboard media update after the storyboard was re-parsed.");
      return;
    }
    trackStoryboardRows(result.rows);
    setAssets(result.assets);
    setProjectDetail((detail) => (detail?.project.id === targetProjectId ? { ...detail, rows: result.rows, assets: result.assets } : detail));
  }

  async function renameProjectAsset(assetId: string, fileName: string) {
    if (!projectDetail) return;
    const targetProjectId = projectDetail.project.id;
    applyShotMediaUpdate(await window.mkboard.renameAsset(targetProjectId, assetId, fileName), targetProjectId);
  }

  async function deleteProjectAssets(assetIds: string[]) {
    if (assetIds.length === 0) return;
    const targetProjectId = projectId || projectDetail?.project.id;
    if (!targetProjectId) return;
    applyShotMediaUpdate(await window.mkboard.deleteAssets(targetProjectId, assetIds), targetProjectId);
  }

  async function updateStoryboardShotMedia(rowId: string, assetIds: string[]) {
    if (!projectDetail) return;
    const targetProjectId = projectDetail.project.id;
    applyShotMediaUpdate(await window.mkboard.updateShotMedia(targetProjectId, rowId, assetIds), targetProjectId);
  }

  async function chooseStoryboardShotMedia(rowId: string) {
    if (!projectDetail) return;
    const targetProjectId = projectDetail.project.id;
    applyShotMediaUpdate(await window.mkboard.chooseShotMedia(targetProjectId, rowId), targetProjectId);
  }

  async function importStoryboardShotMediaPaths(rowId: string, filePaths: string[]) {
    if (!projectDetail || filePaths.length === 0) return;
    const targetProjectId = projectDetail.project.id;
    applyShotMediaUpdate(await window.mkboard.importShotMediaPaths(targetProjectId, rowId, filePaths), targetProjectId);
  }

  async function importClipboardImageAsStoryboardShotMedia(rowId: string) {
    if (!projectDetail) return;
    const targetProjectId = projectDetail.project.id;
    applyShotMediaUpdate(await window.mkboard.importClipboardImageAsShotMedia(targetProjectId, rowId), targetProjectId);
  }

  async function createNewAgentConversation(targetProjectId = projectDetail?.project.id ?? ""): Promise<string | null> {
    if (!targetProjectId) return null;
    const detail = await window.mkboard.createAgentConversation(targetProjectId);
    if (isCurrentProjectId(targetProjectId)) {
      setAgentConversations(detail.conversations);
      setCurrentActiveAgentConversationId(detail.activeConversationId);
      setAgentMessages(detail.messages);
      setAgentOperationConfirmations((confirmations) =>
        confirmations.filter((confirmation) => confirmation.projectId !== targetProjectId || confirmation.conversationId === detail.activeConversationId)
      );
      setAgentImageAttachments([]);
    }
    return detail.activeConversationId;
  }

  async function openAgentConversation(conversationId: string) {
    if (!projectDetail) return;
    const detail = await window.mkboard.markAgentConversationCompletionSeen(projectDetail.project.id, conversationId);
    setAgentConversations(detail.conversations);
    setCurrentActiveAgentConversationId(detail.activeConversationId);
    setAgentMessages(detail.messages);
    setAgentOperationConfirmations((confirmations) =>
      confirmations.filter((confirmation) => confirmation.projectId !== projectDetail.project.id || confirmation.conversationId === detail.activeConversationId)
    );
    setAgentImageAttachments([]);
  }

  async function startStoryboardAgentWorkflow(
    action: StoryboardAiAction,
    targetCount: number,
    userContent?: string,
    options: { localOnly?: boolean; clientRunId?: string; conversationId?: string; projectId?: string } = {}
  ): Promise<StoryboardAgentWorkflowRun> {
    const clientRunId = options.clientRunId ?? createClientRunId();
    const targetProjectId = options.projectId ?? currentProjectIdRef.current;
    let conversationId = options.conversationId ?? (isCurrentProjectId(targetProjectId) ? activeAgentConversationIdRef.current : "");
    if (!conversationId && !options.localOnly) {
      const nextConversationId = await createNewAgentConversation(targetProjectId);
      conversationId = nextConversationId ?? "";
    }
    if (!conversationId) conversationId = `local-workflow-${clientRunId}`;

    const createdAt = new Date().toISOString();
    const workflowLanguage = inferConversationMessageLanguage(userContent, interfaceLanguage);
    const workflowT = createTranslator(workflowLanguage);
    const userMessageContent = userContent?.trim() || workflowT(getStoryboardAgentWorkflowUserKey(action));
    const userMessage: AgentMessage = {
      id: `local-user-${clientRunId}`,
      conversationId,
      role: "user",
      content: userMessageContent,
      createdAt
    };
    const assistantMessage: AgentMessage = {
      id: `local-assistant-${clientRunId}`,
      conversationId,
      role: "assistant",
      content: workflowT(getStoryboardAgentWorkflowStartKey(action), { count: targetCount }),
      createdAt,
      clientRunId,
      agentCliId: selectedCliId,
      events: [
        ...(action === "parse" ? [{ kind: "status" as const, label: "storyboard_parse" }] : []),
        { kind: "status", label: "queued", detail: workflowT("agent.workflow.requestQueued") },
        { kind: "status", label: "context", detail: workflowT("agent.workflow.context") },
        { kind: "status", label: "running", detail: workflowT(getStoryboardAgentWorkflowRunningKey(action), { count: targetCount }) }
      ],
      runStatus: "running"
    };

    if (isCurrentProjectId(targetProjectId)) {
      setAgentMessages((messages) => [...(isDefaultAgentConversation(messages) ? [] : messages), userMessage, assistantMessage]);
    }
    markAgentConversationRunRunning(clientRunId, conversationId);
    return { clientRunId, conversationId, projectId: targetProjectId, userMessage, assistantMessage, language: workflowLanguage };
  }

  function updateStoryboardAgentWorkflow(run: StoryboardAgentWorkflowRun, status: "running" | "succeeded" | "failed", detail: string) {
    if (status === "running") {
      markAgentConversationRunRunning(run.clientRunId, run.conversationId);
    } else {
      markAgentConversationRunStopped(run.clientRunId);
    }
    if (!isCurrentProjectId(run.projectId)) return;

    const nextEvent: AgentEvent =
      status === "failed"
        ? { kind: "error", message: detail }
        : { kind: "status", label: status === "succeeded" ? "succeeded" : "writing", detail };

    setAgentMessages((messages) => {
      const baseMessages = isDefaultAgentConversation(messages) ? [] : messages;
      let updatedAssistantMessage: AgentMessage | null = null;
      const nextMessages = baseMessages.map((message) => {
        if (message.id !== run.assistantMessage.id && message.clientRunId !== run.clientRunId) return message;
        const currentEvents = message.events ?? run.assistantMessage.events ?? [];
        const nextAssistantMessage: AgentMessage = {
          ...message,
          content: detail,
          events: appendAgentEventIfMissing(currentEvents, nextEvent),
          runStatus: status
        };
        updatedAssistantMessage = nextAssistantMessage;
        return nextAssistantMessage;
      });
      if (updatedAssistantMessage) {
        run.assistantMessage = updatedAssistantMessage;
        return nextMessages;
      }

      const fallbackAssistantMessage: AgentMessage = {
        ...run.assistantMessage,
        content: detail,
        events: appendAgentEventIfMissing(run.assistantMessage.events ?? [], nextEvent),
        runStatus: status
      };
      run.assistantMessage = fallbackAssistantMessage;
      return [...baseMessages, run.userMessage, fallbackAssistantMessage];
    });
  }

  function isActiveAgentConversationRunning() {
    if (!activeAgentConversationId) return false;
    return agentMessages.some((message) => {
      if (message.conversationId !== activeAgentConversationId) return false;
      if (message.role !== "assistant" || !message.clientRunId || !runningAgentClientRunIds.has(message.clientRunId)) return false;
      const status = effectiveAgentRunStatus(message);
      return status === "queued" || status === "running";
    });
  }

  function findAgentOperationConfirmation(confirmationId: string) {
    return (
      agentOperationConfirmations.find((item) => item.id === confirmationId) ??
      agentMessages.find((message) => message.operationConfirmation?.id === confirmationId)?.operationConfirmation
    );
  }

  function applyAgentOperationConfirmationState(confirmation: AgentOperationConfirmation) {
    setAgentOperationConfirmations((confirmations) => [
      ...confirmations.filter((item) => item.id !== confirmation.id),
      confirmation
    ]);
    setAgentMessages((messages) =>
      messages.map((message) =>
        message.role === "assistant" && message.clientRunId === confirmation.clientRunId
          ? { ...message, operationConfirmation: confirmation }
          : message
      )
    );
  }

  async function persistAgentOperationConfirmation(confirmation: AgentOperationConfirmation) {
    try {
      await window.mkboard.updateAgentMessageOperationConfirmation(confirmation.projectId, confirmation.clientRunId, confirmation);
    } catch (error) {
      console.warn("Failed to persist agent operation confirmation", error);
    }
  }

  async function executeAgentPendingOperations(
    pendingOperations: AgentOperation[],
    userMessage: string,
    latestDetail: ProjectDetail,
    clientRunId: string
  ) {
    if (pendingOperations.length === 0) return;

    const parseOperations = pendingOperations.filter(isAgentParseStoryboardOperation);
    const mediaOperations = pendingOperations.filter(isAgentRegenerateMediaOperation);
    const dreaminaMediaOperations = mediaOperations.filter(isDreaminaAgentRegenerateMediaOperation);
    const standardMediaOperations = mediaOperations.filter((operation) => !isDreaminaAgentRegenerateMediaOperation(operation));
    const projectOperations = pendingOperations.filter((operation) => !isAgentRegenerateMediaOperation(operation) && !isAgentParseStoryboardOperation(operation));
    let currentDetail = latestDetail;

    if (projectOperations.length > 0) {
      const result = await window.mkboard.applyAgentOperations(latestDetail.project.id, projectOperations);
      currentDetail = result.project;
      if (isCurrentProjectId(result.project.project.id)) applyProjectDetail(result.project);
    }

    if (parseOperations.length > 0) {
      if (isCurrentProjectId(currentDetail.project.id)) openWorkspaceTab("storyboard");
      await generateStoryboardFromScript({ userContent: userMessage, sourceDetail: currentDetail });
      return;
    }

    if (dreaminaMediaOperations.length > 0) {
      currentDetail = await window.mkboard.executeConfirmedDreaminaAgentGeneration({
        projectId: currentDetail.project.id,
        clientRunId,
        agentCliId: selectedCliId,
        interfaceLanguage,
        userMessage,
        operations: dreaminaMediaOperations
      });
      if (isCurrentProjectId(currentDetail.project.id)) applyProjectDetail(currentDetail);
    }

    const mediaRequests = collectAgentMediaRegenerationRequests(standardMediaOperations, currentDetail.rows);
    if (mediaRequests.imageRowIds.length > 0) {
      await generateStoryboardImagesFromCloud({
        rowIds: mediaRequests.imageRowIds,
        mode: "all",
        overwriteExisting: true,
        userMessage,
        sourceDetail: currentDetail
      });
    }
    if (mediaRequests.videoRowIds.length > 0) {
      await generateStoryboardVideosFromLocal({
        rowIds: mediaRequests.videoRowIds,
        mode: "all",
        overwriteExisting: true,
        userMessage,
        sourceDetail: currentDetail,
        seedanceAspectRatioByRowId: mediaRequests.seedanceAspectRatioByRowId
      });
    }
  }

  async function handleAgentPendingOperations(operations: AgentOperation[] | undefined, userMessage: string, latestDetail: ProjectDetail, clientRunId: string, conversationId: string) {
    const pendingOperations = operations ?? [];
    if (pendingOperations.length === 0) return;
    if (agentPermissionMode === "auto-apply") {
      await executeAgentPendingOperations(pendingOperations, userMessage, latestDetail, clientRunId);
      return;
    }
    const { immediateOperations, confirmationOperations } = partitionAgentOperationsForConfirmation(pendingOperations, latestDetail.rows);

    if (confirmationOperations.length > 0) {
      const confirmation: AgentOperationConfirmation = {
        id: `agent-confirmation-${clientRunId}`,
        clientRunId,
        projectId: latestDetail.project.id,
        conversationId,
        operations: confirmationOperations,
        userMessage,
        rows: latestDetail.rows,
        createdAt: new Date().toISOString(),
        status: "pending"
      };
      applyAgentOperationConfirmationState(confirmation);
      void persistAgentOperationConfirmation(confirmation);
    }

    if (immediateOperations.length > 0) {
      await executeAgentPendingOperations(immediateOperations, userMessage, latestDetail, clientRunId);
    }
  }

  async function confirmAgentOperationConfirmation(confirmationId: string) {
    const confirmation = findAgentOperationConfirmation(confirmationId);
    if (!confirmation || confirmation.status !== "pending" || activeAgentOperationConfirmationIdsRef.current.has(confirmation.id)) return;
    activeAgentOperationConfirmationIdsRef.current.add(confirmation.id);

    const confirmedConfirmation: AgentOperationConfirmation = { ...confirmation, status: "confirmed", error: undefined };
    applyAgentOperationConfirmationState(confirmedConfirmation);
    await persistAgentOperationConfirmation(confirmedConfirmation);

    try {
      const latestDetail = await window.mkboard.getProject(confirmedConfirmation.projectId, interfaceLanguage);
      if (isCurrentProjectId(confirmedConfirmation.projectId)) applyProjectDetail(latestDetail);
      await executeAgentPendingOperations(
        confirmedConfirmation.operations,
        confirmedConfirmation.userMessage,
        latestDetail,
        confirmedConfirmation.clientRunId
      );
    } catch (error) {
      const failedConfirmation: AgentOperationConfirmation = {
        ...confirmedConfirmation,
        status: "failed",
        error: formatUserFacingError(error, t, selectedCliName)
      };
      applyAgentOperationConfirmationState(failedConfirmation);
      await persistAgentOperationConfirmation(failedConfirmation);
    } finally {
      activeAgentOperationConfirmationIdsRef.current.delete(confirmation.id);
    }
  }

  function cancelAgentOperationConfirmation(confirmationId: string) {
    const confirmation = findAgentOperationConfirmation(confirmationId);
    if (!confirmation || confirmation.status !== "pending") return;
    const canceledConfirmation: AgentOperationConfirmation = { ...confirmation, status: "canceled" };
    applyAgentOperationConfirmationState(canceledConfirmation);
    void persistAgentOperationConfirmation(canceledConfirmation);
  }

  function startAgentMediaGenerationPlaceholderRun(clientRunId: string, targetProjectId: string, message: string, rows: StoryboardRow[]) {
    const placeholder = inferAgentMediaGenerationPlaceholder(message, rows);
    const targetRowIds = [...new Set([...placeholder.imageRowIds, ...placeholder.videoRowIds])];
    if (targetRowIds.length === 0) return;
    flushSync(() => {
      setAgentMediaGenerationPlaceholderRuns((currentRuns) => {
        const nextRuns = new Map(currentRuns);
        nextRuns.set(clientRunId, { projectId: targetProjectId, ...placeholder });
        return nextRuns;
      });
    });
    if (isCurrentProjectId(targetProjectId)) scrollNearestStoryboardRowsIntoView(targetRowIds);
  }

  function finishAgentMediaGenerationPlaceholderRun(clientRunId: string) {
    setAgentMediaGenerationPlaceholderRuns((currentRuns) => {
      if (!currentRuns.has(clientRunId)) return currentRuns;
      const nextRuns = new Map(currentRuns);
      nextRuns.delete(clientRunId);
      return nextRuns;
    });
  }

  async function dispatchAgentMessage(
    text: string,
    currentAttachments: ProjectAsset[],
    onAccepted?: () => void
  ) {
    if (!text || !projectDetail || isActiveAgentConversationRunning()) return;
    const targetProjectId = projectDetail.project.id;
    const targetStoryboardRows = projectDetail.rows;
    const ready = await ensureSelectedCliReady();
    if (!ready || !isCurrentProjectId(targetProjectId)) return;
    let conversationId = activeAgentConversationId;
    if (!conversationId) {
      const nextConversationId = await createNewAgentConversation();
      if (!nextConversationId) return;
      conversationId = nextConversationId;
    }
    setAgentBusy(true);
    const clientRunId = createClientRunId();
    const runAgentName = selectedCliName;
    const requestT = createTranslator(inferConversationMessageLanguage(text, interfaceLanguage));
    markAgentClientRunRunning(clientRunId, conversationId);
    setActiveAgentClientRunId(clientRunId);
    onAccepted?.();
    setAgentImageAttachments([]);
    startAgentMediaGenerationPlaceholderRun(clientRunId, targetProjectId, text, targetStoryboardRows);
    setAgentMessages((messages) => [
      ...messages,
      {
        id: `local-user-${Date.now()}`,
        conversationId,
        role: "user",
        content: text,
        createdAt: new Date().toISOString(),
        attachments: currentAttachments.map(createAgentMessageAttachmentSnapshot)
      },
      {
        id: `local-assistant-${clientRunId}`,
        conversationId,
        role: "assistant",
        content: "",
        createdAt: new Date().toISOString(),
        clientRunId,
        agentCliId: selectedCliId,
        events: [
          { kind: "status", label: "context", detail: requestT("agent.projectContextPreparing") },
          ...(currentAttachments.length > 0
            ? [{ kind: "status" as const, label: "context", detail: requestT("agent.attachmentsReady", { count: currentAttachments.length }) }]
            : []),
          { kind: "status", label: "running", detail: requestT("agent.waitingForModelThinking") }
        ],
        runStatus: "running"
      }
    ]);
    try {
      const response = await window.mkboard.sendAgentMessage({
        projectId: targetProjectId,
        conversationId,
        tab,
        message: text,
        agentCliId: selectedCliId,
        model: selectedAgentModel !== "default" ? selectedAgentModel : undefined,
        effort: selectedAgentEffort,
        permissionMode: agentPermissionMode,
        interfaceLanguage,
        clientRunId,
        attachmentAssetIds: currentAttachments.map((asset) => asset.id)
      });
      const detail = await window.mkboard.getProject(targetProjectId, interfaceLanguage);
      if (isCurrentProjectId(targetProjectId)) applyProjectDetail(detail);
      await handleAgentPendingOperations(response.pendingOperations, text, detail, clientRunId, conversationId);
    } catch (error) {
      if (!hasAgentClientRunTerminalEvent(clientRunId)) {
        setAgentMessages((messages) =>
          messages.map((message) =>
            message.clientRunId === clientRunId
              ? {
                  ...message,
                  content: requestT("agent.callFailedWithName", { name: runAgentName }),
                  events: appendAgentEventIfMissing(message.events ?? [], { kind: "status", label: "failed", detail: formatUserFacingError(error, requestT, runAgentName) }),
                  runStatus: "failed"
                }
              : message
          )
        );
      }
    } finally {
      finishAgentMediaGenerationPlaceholderRun(clientRunId);
      markAgentClientRunStopped(clientRunId);
      setAgentBusy(false);
      setActiveAgentClientRunId((currentRunId) => (currentRunId === clientRunId ? null : currentRunId));
    }
  }

  const sendAgentMessage: AgentSubmitHandler = async (event, draftMessage, onAccepted) => {
    event.preventDefault();
    const currentAttachments = agentImageAttachments;
    const text = draftMessage.trim() || (currentAttachments.length > 0 ? t("agent.defaultAttachmentPrompt") : "");
    if (!text || !projectDetail || isActiveAgentConversationRunning()) return;
    await dispatchAgentMessage(text, currentAttachments, onAccepted);
  };

  async function stopAgentRun(clientRunId = activeAgentClientRunId) {
    if (!clientRunId) return;
    finishAgentMediaGenerationPlaceholderRun(clientRunId);
    await window.mkboard.cancelAgentRun(clientRunId);
    setAgentMessages((messages) =>
      messages.map((message) => {
        if (message.clientRunId !== clientRunId) return message;
        const messageT = createTranslator(inferAgentMessageLanguage(message, interfaceLanguage));
        return {
          ...message,
          content: message.content || messageT("agent.stopped"),
          events: [...(message.events ?? []), { kind: "status", label: "canceled", detail: messageT("agent.stoppedDetail") }],
          runStatus: "canceled"
        };
      })
    );
    markAgentClientRunStopped(clientRunId);
    finishStoryboardParseRun(clientRunId);
    setAgentBusy(false);
    setActiveAgentClientRunId((currentRunId) => (currentRunId === clientRunId ? null : currentRunId));
  }

  async function chooseAgentImageAttachments() {
    if (!projectDetail || isActiveAgentConversationRunning()) return;
    const selectedImages = await window.mkboard.chooseAgentImages(projectDetail.project.id);
    if (selectedImages.length === 0) return;
    addAgentImageAttachments(selectedImages, projectDetail.project.id);
  }

  async function pasteAgentImageAttachment() {
    if (!projectDetail || isActiveAgentConversationRunning()) return;
    const pastedImages = await window.mkboard.importAgentClipboardImage(projectDetail.project.id);
    if (pastedImages.length === 0) return;
    addAgentImageAttachments(pastedImages, projectDetail.project.id);
  }

  function addAgentImageAttachments(selectedImages: ProjectAsset[], projectId: string) {
    setAgentImageAttachments((current) => {
      const existingIds = new Set(current.map((asset) => asset.id));
      return [...current, ...selectedImages.filter((asset) => !existingIds.has(asset.id))];
    });
    setAssets((current) => {
      const existingIds = new Set(current.map((asset) => asset.id));
      return [...selectedImages.filter((asset) => !existingIds.has(asset.id)), ...current];
    });
    setProjectDetail((detail) => {
      if (!detail || detail.project.id !== projectId) return detail;
      const existingIds = new Set(detail.assets.map((asset) => asset.id));
      return {
        ...detail,
        assets: [...selectedImages.filter((asset) => !existingIds.has(asset.id)), ...detail.assets]
      };
    });
  }

  function removeAgentImageAttachment(assetId: string) {
    setAgentImageAttachments((current) => current.filter((asset) => asset.id !== assetId));
  }

  if (isBooting) {
    return (
      <div className="app-shell boot-screen">
        <div className="boot-card">
          <MkboardBrandIcon className="boot-brand-icon" decorative />
          <span>{t("app.boot.opening")}</span>
        </div>
      </div>
    );
  }

  if (bootError) {
    return (
      <div className="app-shell boot-screen">
        <div className="boot-card boot-card-error">
          <MkboardBrandIcon className="boot-brand-icon" decorative />
          <div>
            <strong>{t("app.boot.failed")}</strong>
            <span>{bootError}</span>
          </div>
        </div>
      </div>
    );
  }

  const showHomeRail = screen !== "workspace";
  const onboardingGuideState =
    workspacePresentationOpen || (showCreate && onboardingState?.currentStep === "create_project")
      ? null
      : onboardingState;
  const tutorialOnboardingActive = Boolean(onboardingState && !onboardingState.completedAt && projectDetail && isTutorialProject(projectDetail.project));
  const visibleStoryboardRows = tutorialOnboardingActive ? getTutorialOnboardingVisibleRows(storyboardRows, onboardingState, onboardingRevealAction, onboardingStoryboardRevealCount) : storyboardRows;
  const visibleProjectAssets = tutorialOnboardingActive ? getTutorialOnboardingVisibleAssets(assets, onboardingState, onboardingRevealAction) : assets;
  const suppressStoryboardEmptyGenerateAction =
    tutorialOnboardingActive &&
    onboardingState?.currentStep === "storyboard" &&
    !onboardingState.completedStepIds.includes("storyboard");
  return (
    <I18nContext.Provider value={i18n}>
    <div className={cn("app-shell", !showHomeRail && "workspace-app-shell")}>
      {showHomeRail ? (
        <aside className="rail" aria-label={t("nav.main")}>
          <Button className="rail-brand-button" variant="ghost" aria-label={t("nav.projects")} onPress={openProjects}>
            <MkboardBrandIcon className="rail-brand-icon" decorative />
          </Button>
          <nav className="rail-nav">
            <Button className={cn("rail-item", (screen === "projects" || screen === "templates" || screen === "template-create" || screen === "template-edit" || screen === "trash") && "active")} variant="ghost" aria-label={t("nav.projects")} onPress={openProjects}>
              <Grid2X2 aria-hidden="true" />
              <span>{t("nav.projects")}</span>
            </Button>
            <Button className={cn("rail-item", screen === "assets" && "active")} variant="ghost" aria-label={t("nav.assetLibrary")} onPress={() => void openAssets()}>
              <PackageSearch aria-hidden="true" />
              <span>{t("nav.assets")}</span>
            </Button>
            <Button className={cn("rail-item", screen === "skills" && "active")} variant="ghost" aria-label={t("nav.skills")} onPress={() => void openSkills()}>
              <Lightbulb aria-hidden="true" />
              <span>{t("nav.skills")}</span>
            </Button>
            <Button className={cn("rail-item", screen === "taste" && "active")} variant="ghost" aria-label={t("nav.taste")} onPress={() => void openTaste()}>
              <Palette aria-hidden="true" />
              <span>{t("nav.taste")}</span>
            </Button>
          </nav>
        <Button
          className={cn("rail-account onboarding-settings-trigger", selectedCliConnectionState === "connected" && "connected", selectedCliConnectionState !== "connected" && selectedCliConnectionState !== "checking" && "needs-auth")}
          variant="ghost"
            aria-label={t("nav.settingsAiAuth")}
            onPress={openAccountAuth}
          >
            <Settings aria-hidden="true" />
            <span>{t("nav.settings")}</span>
          </Button>
        </aside>
      ) : null}

      <main className="main-area">
        {screen === "projects" ? (
          <ProjectsScreen
            desktopVersionCheck={desktopVersionCheck}
            projects={visibleProjectsForInterfaceLanguage}
            archivedProjects={visibleArchivedProjectsForInterfaceLanguage}
            archiveFilter={projectArchiveFilter}
            onArchiveFilterChange={setProjectArchiveFilter}
            onCreate={() => startCreateProject()}
            onOpenDesktopDownload={() => {
              void startDesktopUpdate();
            }}
            onEditProject={openProjectEditor}
            onOpenProject={(nextProject) => void openProject(nextProject.id, nextProject.name)}
            onOpenTemplates={openTemplates}
            onOpenTrash={() => void openTrash()}
            onArchiveProject={(nextProject) => void archiveProject(nextProject)}
            onTrashProject={(nextProject) => void moveProjectToTrash(nextProject)}
            onUnarchiveProject={(nextProject) => void unarchiveProject(nextProject)}
          />
        ) : screen === "templates" ? (
          <TemplatesScreen
            templates={orderedTemplates}
            defaultTemplateId={defaultTemplateId}
            onBack={() => void openProjects()}
            onCreateTemplate={() => void openTemplateCreator()}
            onDuplicateTemplate={duplicateTemplate}
            onEditTemplate={(template) => void openTemplateEditor(template)}
            onDeleteTemplate={deleteTemplate}
            onSetDefaultTemplate={saveDefaultTemplate}
            onUseTemplate={startCreateProject}
          />
        ) : screen === "template-create" || screen === "template-edit" ? (
          <TemplateEditorScreen
            key={screen === "template-edit" ? editingTemplate?.id ?? templateEditId : "new"}
            isEditing={screen === "template-edit"}
            template={screen === "template-edit" ? editingTemplate : null}
            skills={skills}
            skillsError={skillsError}
            skillsLoading={skillsLoading}
            onBack={() => void openTemplates()}
            onOpenProjects={() => void openProjects()}
            onCreateTemplate={(input) => createTemplate(input)}
            onUpdateTemplate={(input) => updateTemplate(input)}
            onSaved={() => void openTemplates()}
          />
        ) : screen === "assets" ? (
          <AssetsScreen
            projects={visibleProjectsForInterfaceLanguage}
            selectedProjectId={projectId}
            selectedProjectName={projectName}
            assets={assets}
            dropText={dropText}
            onAssetDropNoticeChange={setAssetDropNotice}
            onChooseProjectAssets={chooseProjectAssets}
            onDeleteAssets={deleteProjectAssets}
            onImportAssetPaths={(filePaths) => void importAssetPaths(filePaths)}
            onRenameAsset={(assetId, fileName) => void renameProjectAsset(assetId, fileName)}
            onSelectProject={(nextProjectId) => void openAssets(nextProjectId)}
          />
        ) : screen === "skills" ? (
          <SkillsScreen
            error={skillsError}
            homeRequestId={skillsHomeRequestId}
            loading={skillsLoading}
            skills={skills}
            onCreateSkill={(input) => createSkill(input)}
            onDeleteSkill={(skillId) => deleteSkill(skillId)}
            onReloadSkills={async () => {
              try {
                return await refreshSkills();
              } catch {
                return [];
              }
            }}
            onUpdateSkill={(input) => updateSkill(input)}
          />
        ) : screen === "taste" ? (
          <TasteScreen
            defaultTasteId={defaultTasteId}
            error={tastesError}
            loading={tastesLoading}
            tastes={tastes.length > 0 ? tastes : [getFallbackDefaultTaste()]}
            onSetDefaultTaste={saveDefaultTaste}
            onReload={() => void refreshTastes().catch(() => undefined)}
          />
        ) : screen === "trash" ? (
          <TrashScreen
            projects={deletedProjects}
            onBack={() => void openProjects()}
            onDelete={(nextProject) => void permanentlyDeleteProject(nextProject)}
            onEmptyTrash={(projectsToDelete) => emptyTrash(projectsToDelete)}
            onRestore={(nextProject) => void restoreDeletedProject(nextProject)}
          />
        ) : (
          <WorkspaceScreen
            projectId={projectId}
            projectName={projectName}
            onEditProject={() => {
              if (projectDetail) void openProjectEditor(projectDetail.project);
            }}
            tab={tab}
            setTab={openWorkspaceTab}
            agentConversations={agentConversations}
            activeAgentConversationId={activeAgentConversationId}
            agentMessages={agentMessages}
            agentOperationConfirmations={agentOperationConfirmations.filter((confirmation) => confirmation.projectId === projectId)}
            agentImageAttachments={agentImageAttachments}
            agentBusy={agentBusy}
            runningAgentClientRunIds={runningAgentClientRunIds}
            runningAgentConversationIds={runningAgentConversationIds}
            localCliAgents={visibleLocalCliAgents}
            selectedCliId={selectedCliId}
            selectedCliName={selectedCliName}
            selectedCliConnectionState={selectedCliConnectionState}
            selectedCliConnectionLabel={selectedCliConnectionLabel}
            selectedCliStatusBusy={selectedCliStatusBusy}
            selectedAgentModel={selectedAgentModel}
            selectedAgentEffort={selectedAgentEffort}
            agentPermissionMode={agentPermissionMode}
            mcpBridgeStatus={mcpBridgeStatus}
            onSelectCli={setSelectedCliId}
            onSelectAgentModel={setSelectedAgentModel}
            onSelectAgentEffort={setSelectedAgentEffort}
            onChangeAgentPermissionMode={setAgentPermissionMode}
            onOpenRuntimeSettings={openAccountAuth}
            onConnectSelectedCli={connectSelectedCli}
            onCreateAgentConversation={() => void createNewAgentConversation()}
            onOpenAgentConversation={(conversationId) => void openAgentConversation(conversationId)}
            onRefreshSelectedCliStatus={() => void testSelectedCliStatus()}
            onStopAgentRun={(clientRunId) => void stopAgentRun(clientRunId)}
            onConfirmAgentOperations={(confirmationId) => void confirmAgentOperationConfirmation(confirmationId)}
            onCancelAgentOperations={cancelAgentOperationConfirmation}
            onChooseAgentImages={() => void chooseAgentImageAttachments()}
            onPasteAgentImage={() => void pasteAgentImageAttachment()}
            onRemoveAgentImageAttachment={removeAgentImageAttachment}
            sendAgentMessage={sendAgentMessage}
            scriptRichText={scriptRichText}
            setScriptRichText={(value) => void persistScript(value)}
            rows={visibleStoryboardRows}
            columns={storyboardColumns}
            imageRatio={imageRatio}
            skills={skills}
            skillsError={skillsError}
            skillsLoading={skillsLoading}
            storyboardSkill={projectDetail?.storyboardSkill ?? null}
            projectTaste={projectDetail?.taste ?? null}
            tastes={tastes}
            tastesError={tastesError}
            tastesLoading={tastesLoading}
            storyboardBusyAction={storyboardBusyAction}
            storyboardGenerating={storyboardGenerating}
            storyboardImageGeneratingRowIds={storyboardImageVisibleGeneratingRowIds}
            storyboardVideoGeneratingRowIds={storyboardVideoVisibleGeneratingRowIds}
            storyboardImageGenerationTasks={storyboardImageGenerationTasks}
            storyboardVideoGenerationTasks={storyboardVideoGenerationTasks}
            onCreateStoryboards={createStoryboardRows}
            onDeleteStoryboards={deleteStoryboardRows}
            onDuplicateStoryboards={duplicateStoryboardRows}
            onGenerateStoryboardImages={(mode) => void generateStoryboardImagesFromCloud({ mode })}
            onGenerateStoryboardImageRows={(rowIds, userMessage) => generateStoryboardImagesFromCloud({ rowIds, userMessage })}
            onGenerateStoryboardVideos={(mode, methodFilter) => void generateStoryboardVideosFromLocal({ mode, methodFilter })}
            onGenerateStoryboardVideoRows={(rowIds, userMessage) => generateStoryboardVideosFromLocal({ rowIds, userMessage })}
            onRetryStoryboardTask={retryStoryboardGenerationTask}
            onCancelStoryboardVideoGenerations={cancelStoryboardVideoGenerations}
            onGenerateStoryboard={() => void generateStoryboardFromScript()}
            onChooseProjectAssets={chooseProjectAssets}
            onImageRatioChange={(nextImageRatio) => void saveImageRatio(nextImageRatio)}
            onLoadSkills={refreshSkills}
            onStoryboardSkillChange={(skillId) => saveProjectStoryboardSkill(skillId)}
            onLoadTastes={refreshTastes}
            onProjectTasteChange={(tasteId) => saveProjectTaste(tasteId)}
            onImportClipboardImageAsShotMedia={(rowId) => void importClipboardImageAsStoryboardShotMedia(rowId)}
            onImportShotMediaPaths={(rowId, filePaths) => void importStoryboardShotMediaPaths(rowId, filePaths)}
            onInsertStoryboard={insertStoryboardRow}
            onChooseShotMedia={(rowId) => void chooseStoryboardShotMedia(rowId)}
            onReorderRows={(sourceRowId, targetRowId) => void reorderStoryboardRows(sourceRowId, targetRowId)}
            onSaveColumns={(nextColumns) => void saveStoryboardColumns(nextColumns)}
            onUpdateCell={updateStoryboardCell}
            onUpdateShotMedia={(rowId, assetIds) => void updateStoryboardShotMedia(rowId, assetIds)}
            assets={visibleProjectAssets}
            dropText={dropText}
            onAssetDropNoticeChange={setAssetDropNotice}
            onDeleteAssets={deleteProjectAssets}
            onImportAssetPaths={(filePaths) => void importAssetPaths(filePaths)}
            onRenameAsset={(assetId, fileName) => void renameProjectAsset(assetId, fileName)}
            onBackToProjects={() => void openProjects()}
            onOpenSettings={openAccountAuth}
            suppressStoryboardEmptyGenerateAction={suppressStoryboardEmptyGenerateAction}
            presentationRequestId={onboardingPresentationRequestId}
            onPresentationOpenChange={handleWorkspacePresentationOpenChange}
            speechVoiceId={elevenLabsStatus?.configured ? elevenLabsDefaultVoiceId : ""}
            onOpenVoiceSettings={() => openAccountAuthAtSection("voice")}
          />
        )}
      </main>



      <OnboardingGuide
        busy={storyboardGenerating || onboardingActionBusy}
        state={onboardingGuideState}
        settingsModalOpen={accountAuthOpen}
        onPreviousAction={() => void runOnboardingPreviousAction()}
        onPrimaryAction={() => void runOnboardingPrimaryAction()}
        onSkip={() => void finishOnboarding()}
      />

      {showCreate ? (
        <ProjectDialog
          busy={projectCreateBusy}
          icon={projectIconInput}
          imageRatio={projectImageRatioInput}
          mode="create"
          name={projectNameInput}
          defaultTasteId={defaultTasteId}
          projectMarkOptions={projectMarkOptions}
          ready={createReady}
          skillId={projectSkillInput}
          skillsError={skillsError}
          skillsLoading={skillsLoading}
          skillDrawerOpen={projectSkillDrawerOpen}
          skills={skills}
          tasteDrawerOpen={createTasteDrawerOpen}
          tasteId={tasteInput}
          tastes={tastes}
          tastesError={tastesError}
          tastesLoading={tastesLoading}
          templateId={templateInput}
          templateOptions={templateOptions}
          onClose={closeCreateProjectModal}
          onCloseTasteDrawer={() => setCreateTasteDrawerOpen(false)}
          onCloseSkillDrawer={() => setProjectSkillDrawerOpen(false)}
          onIconChange={setProjectIconInput}
          onImageRatioChange={setProjectImageRatioInput}
          onNameChange={setProjectNameInput}
          onOpenSkillDrawer={() => setProjectSkillDrawerOpen(true)}
          onOpenTasteDrawer={() => setCreateTasteDrawerOpen(true)}
          onReloadSkills={() => void refreshSkills().catch(() => undefined)}
          onReloadTastes={() => void refreshTastes().catch(() => undefined)}
          onSkillChange={setProjectSkillInput}
          onSubmit={() => void createProject()}
          onTasteChange={setTasteInput}
          onTemplateChange={(nextTemplateId) => {
            setTemplateInput(nextTemplateId);
            setProjectSkillInput(getTemplateStoryboardSkillId(templates, nextTemplateId, interfaceLanguage));
          }}
        />
      ) : null}
      {editingProject ? (
        <ProjectDialog
          busy={projectEditBusy}
          icon={projectIconInput}
          imageRatio={projectImageRatioInput}
          mode="edit"
          name={projectNameInput}
          defaultTasteId={defaultTasteId}
          projectMarkOptions={projectMarkOptions}
          ready={editReady}
          skillId={projectSkillInput}
          skillsError={skillsError}
          skillsLoading={skillsLoading}
          skillDrawerOpen={projectSkillDrawerOpen}
          skills={skills}
          tasteDrawerOpen={createTasteDrawerOpen}
          tasteId={tasteInput}
          tastes={tastes}
          tastesError={tastesError}
          tastesLoading={tastesLoading}
          templateId={templateInput}
          templateOptions={templateOptions}
          onClose={() => {
            if (!projectEditBusy) {
              setEditingProject(null);
              setCreateTasteDrawerOpen(false);
              setProjectSkillDrawerOpen(false);
            }
          }}
          onCloseTasteDrawer={() => setCreateTasteDrawerOpen(false)}
          onCloseSkillDrawer={() => setProjectSkillDrawerOpen(false)}
          onIconChange={setProjectIconInput}
          onImageRatioChange={setProjectImageRatioInput}
          onNameChange={setProjectNameInput}
          onOpenSkillDrawer={() => setProjectSkillDrawerOpen(true)}
          onOpenTasteDrawer={() => setCreateTasteDrawerOpen(true)}
          onReloadSkills={() => void refreshSkills().catch(() => undefined)}
          onReloadTastes={() => void refreshTastes().catch(() => undefined)}
          onSkillChange={setProjectSkillInput}
          onSubmit={() => void saveProjectEdit()}
          onTasteChange={setTasteInput}
          onTemplateChange={(nextTemplateId) => {
            setTemplateInput(nextTemplateId);
            setProjectSkillInput(getTemplateStoryboardSkillId(templates, nextTemplateId, interfaceLanguage));
          }}
        />
      ) : null}
      <ProjectActionConfirmationDialog
        action={pendingProjectAction}
        busy={projectActionBusy}
        onClose={() => {
          if (!projectActionBusy) setPendingProjectAction(null);
        }}
        onConfirm={() => void confirmProjectAction()}
      />
      {accountAuthOpen ? (
        <CodexAuthorizationDialog
          codexStatus={codexStatus}
          localCliAgents={visibleLocalCliAgents}
          localCliScanBusy={localCliScanBusy}
          selectedCliId={selectedCliId}
          interfaceLanguage={interfaceLanguage}
          appearanceMode={appearanceMode}
          hyperframesVideoResolution={hyperframesVideoResolution}
          seedanceVideoResolution={seedanceVideoResolution}
          hyperframesVideoConcurrency={hyperframesVideoConcurrency}
          cliTestBusy={cliTestBusy}
          cliTestResult={cliTestResult}
          byokSettings={byokSettings}
          companionStatus={companionStatus}
          byokNotice={byokNotice}
          onClearByokNotice={clearByokNotice}
          onByokSettingsChange={setByokSettings}
          onCompanionStatusChange={(next) => {
            setCompanionStatus(next);
            void refreshByokAndCompanion();
          }}
          appVersion={desktopVersionCheck?.currentVersion ?? ""}
          desktopVersionCheck={desktopVersionCheck}
          desktopVersionCheckBusy={desktopVersionCheckBusy}
          desktopVersionCheckError={desktopVersionCheckError}
          initialSection={accountAuthSection}
          onClose={closeAccountAuth}
          onCheckDesktopVersion={() => void checkDesktopVersionFromSettings()}
          onOpenExternal={openExternalUrl}
          onRefreshSelectedCliStatus={() => void testSelectedCliStatus()}
          onRefreshLocalCliAgents={() => void refreshLocalCliAgents()}
          onSelectCli={setSelectedCliId}
          onInterfaceLanguageChange={setInterfaceLanguage}
          onAppearanceModeChange={setAppearanceMode}
          onHyperframesVideoResolutionChange={setHyperframesVideoResolution}
          onSeedanceVideoResolutionChange={setSeedanceVideoResolution}
          onHyperframesVideoConcurrencyChange={setHyperframesVideoConcurrency}
          elevenLabsStatus={elevenLabsStatus}
          elevenLabsDefaultVoiceId={elevenLabsDefaultVoiceId}
          elevenLabsDefaultVoiceName={elevenLabsDefaultVoiceName}
          onElevenLabsStatusChange={setElevenLabsStatus}
          onElevenLabsDefaultVoiceChange={(voiceId, voiceName) => {
            setElevenLabsDefaultVoiceId(voiceId);
            setElevenLabsDefaultVoiceName(voiceName);
          }}
        />
      ) : null}

    </div>
    </I18nContext.Provider>
  );
}

function ProjectsScreen({
  desktopVersionCheck,
  projects,
  archivedProjects,
  archiveFilter,
  onArchiveFilterChange,
  onCreate,
  onOpenDesktopDownload,
  onArchiveProject,
  onEditProject,
  onOpenProject,
  onOpenTemplates,
  onOpenTrash,
  onTrashProject,
  onUnarchiveProject
}: {
  desktopVersionCheck: DesktopVersionCheckResult | null;
  projects: ProjectSummary[];
  archivedProjects: ProjectSummary[];
  archiveFilter: ProjectArchiveFilter;
  onArchiveFilterChange: (filter: ProjectArchiveFilter) => void;
  onCreate: () => void;
  onOpenDesktopDownload: () => void;
  onArchiveProject: (project: ProjectSummary) => void;
  onEditProject: (project: ProjectSummary) => void;
  onOpenProject: (project: ProjectSummary) => void;
  onOpenTemplates: () => void;
  onOpenTrash: () => void;
  onTrashProject: (project: ProjectSummary) => void;
  onUnarchiveProject: (project: ProjectSummary) => void;
}) {
  const { locale, t } = useI18n();
  const [projectSearchQuery, setProjectSearchQuery] = useState("");
  const [projectViewMode, setProjectViewMode] = useState<"grid" | "list">(() => {
    try {
      return window.localStorage.getItem("mkboard.projectsViewMode") === "list" ? "list" : "grid";
    } catch {
      return "grid";
    }
  });
  const handleProjectViewModeChange = (nextMode: "grid" | "list") => {
    setProjectViewMode(nextMode);
    try {
      window.localStorage.setItem("mkboard.projectsViewMode", nextMode);
    } catch {
      // ignore storage errors
    }
  };
  const currentProjects = archiveFilter === "archived" ? archivedProjects : projects;
  const normalizedProjectSearchQuery = projectSearchQuery.trim().toLocaleLowerCase();
	  const visibleProjects = normalizedProjectSearchQuery
	    ? currentProjects.filter((project) => project.name.toLocaleLowerCase().includes(normalizedProjectSearchQuery))
	    : currentProjects;
	  const isSearchingProjects = normalizedProjectSearchQuery.length > 0;
  const isArchivedView = archiveFilter === "archived";

  return (
    <section className="screen projects-screen active" aria-label={t("project.myProjects")}>
      <header className="library-page-header topbar">
        <div>
          <div className="projects-title-row">
            <h1>{t("project.myProjects")}</h1>
            {desktopVersionCheck?.updateAvailable ? (
              <button
                className="desktop-update-tag"
                type="button"
                aria-label={t("desktopUpdate.openDownload", { version: desktopVersionCheck.latestVersion ?? "" })}
                title={t("desktopUpdate.openDownload", { version: desktopVersionCheck.latestVersion ?? "" })}
                onClick={onOpenDesktopDownload}
              >
                {t("desktopUpdate.tag")}
              </button>
            ) : null}
          </div>
        </div>
        <div className="topbar-actions">
          <label className="project-search-field">
            <span className="sr-only">{t("project.searchLabel")}</span>
            <Search aria-hidden="true" />
            <input
              className="project-search-input"
              type="search"
              placeholder={t("project.searchPlaceholder")}
              value={projectSearchQuery}
              onChange={(event) => setProjectSearchQuery(event.target.value)}
            />
          </label>
          <Button className="topbar-action-button" variant="ghost" onPress={onOpenTemplates}>
            <Grid2X2 aria-hidden="true" />
            {t("common.template")}
          </Button>
        </div>
      </header>

      <div className="library-page-content projects-page-content">
        <div className="projects-toolbar-row">
          <div className="project-archive-tabs" role="tablist" aria-label={t("project.archiveFilterLabel")}>
            <button
              className={cn("project-archive-tab", archiveFilter === "active" && "active")}
              type="button"
              role="tab"
              aria-selected={archiveFilter === "active"}
              onClick={() => onArchiveFilterChange("active")}
            >
              <Flag aria-hidden="true" />
              <span>{t("project.activeProjects")}</span>
            </button>
            <button
              className={cn("project-archive-tab", archiveFilter === "archived" && "active")}
              type="button"
              role="tab"
              aria-selected={archiveFilter === "archived"}
              onClick={() => onArchiveFilterChange("archived")}
            >
              <Archive aria-hidden="true" />
              <span>{t("project.archivedProjects")}</span>
            </button>
          </div>

          <div className="project-archive-tabs project-view-mode-tabs" role="group" aria-label={t("project.viewModeLabel")}>
            <button
              className={cn("project-archive-tab project-view-mode-tab", projectViewMode === "grid" && "active")}
              type="button"
              aria-pressed={projectViewMode === "grid"}
              onClick={() => handleProjectViewModeChange("grid")}
            >
              <LayoutGrid aria-hidden="true" />
              <span>{t("project.viewModeGrid")}</span>
            </button>
            <button
              className={cn("project-archive-tab project-view-mode-tab", projectViewMode === "list" && "active")}
              type="button"
              aria-pressed={projectViewMode === "list"}
              onClick={() => handleProjectViewModeChange("list")}
            >
              <List aria-hidden="true" />
              <span>{t("project.viewModeList")}</span>
            </button>
          </div>
        </div>

        {projectViewMode === "grid" ? (
          <div className="project-grid" aria-label={t("project.list")}>
            {!isArchivedView ? (
              <Button className="project-card create-card onboarding-create-project-target" variant="ghost" onPress={onCreate}>
                <div className="folder-empty">
                  <span className="create-card-plus-badge">
                    <Plus aria-hidden="true" />
                  </span>
                </div>
                <div className="project-card-meta">
                  <span className="project-card-title-line">
                    <strong>{t("project.createNew")}</strong>
                  </span>
                  <small>{t("project.createNewHint")}</small>
                </div>
              </Button>
            ) : null}
            {visibleProjects.map((project) => (
              <ProjectCard
                isArchived={isArchivedView}
                project={project}
                key={project.id}
                onArchiveProject={onArchiveProject}
                onEditProject={onEditProject}
                onOpenProject={onOpenProject}
                onTrashProject={onTrashProject}
                onUnarchiveProject={onUnarchiveProject}
              />
            ))}
            {isSearchingProjects && visibleProjects.length === 0 ? (
              <div className="project-search-empty" role="status">
                <Search aria-hidden="true" />
                <strong>{t("project.searchEmptyTitle")}</strong>
              </div>
            ) : null}
            {!isSearchingProjects && isArchivedView && visibleProjects.length === 0 ? (
              <div className="project-search-empty project-archive-empty" role="status">
                <Archive aria-hidden="true" />
                <strong>{t("project.archivedEmptyTitle")}</strong>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="project-list-shell" aria-label={t("project.list")}>
            {!isArchivedView ? (
              <Button className="project-list-create-row onboarding-create-project-target" variant="ghost" onPress={onCreate}>
                <span className="project-list-create-icon">
                  <Plus aria-hidden="true" />
                </span>
                <span className="project-list-create-copy">
                  <strong>{t("project.createNew")}</strong>
                  <small>{t("project.createNewHint")}</small>
                </span>
              </Button>
            ) : null}

            {visibleProjects.length > 0 ? (
              <div className="project-list-table" role="table" aria-label={t("project.list")}>
                <div className="project-list-header" role="row">
                  <span role="columnheader">{t("project.columnName")}</span>
                  <span className="project-list-col-ratio" role="columnheader">{t("project.columnRatio")}</span>
                  <span className="project-list-col-stats" role="columnheader">{t("project.columnStats")}</span>
                  <span className="project-list-col-updated" role="columnheader">{t("project.columnUpdatedAt")}</span>
                  <span className="project-list-col-created" role="columnheader">{t("project.columnCreatedAt")}</span>
                  <span className="project-list-col-actions" role="columnheader">
                    <span className="sr-only">{t("project.columnActions")}</span>
                  </span>
                </div>
                <div className="project-list-body" role="rowgroup">
                  {visibleProjects.map((project) => (
                    <ProjectListRow
                      isArchived={isArchivedView}
                      project={project}
                      key={project.id}
                      onArchiveProject={onArchiveProject}
                      onEditProject={onEditProject}
                      onOpenProject={onOpenProject}
                      onTrashProject={onTrashProject}
                      onUnarchiveProject={onUnarchiveProject}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {isSearchingProjects && visibleProjects.length === 0 ? (
              <div className="project-search-empty project-list-empty" role="status">
                <Search aria-hidden="true" />
                <strong>{t("project.searchEmptyTitle")}</strong>
              </div>
            ) : null}
            {!isSearchingProjects && isArchivedView && visibleProjects.length === 0 ? (
              <div className="project-search-empty project-archive-empty project-list-empty" role="status">
                <Archive aria-hidden="true" />
                <strong>{t("project.archivedEmptyTitle")}</strong>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="floating-tools" aria-label={t("project.floatingTools")}>
        <Button className="floating-tool" variant="ghost" aria-label={t("trash.title")} onPress={onOpenTrash}>
          <Trash2 aria-hidden="true" />
        </Button>
      </div>
    </section>
  );
}

type PageHierarchyBreadcrumbItem = {
  label: string;
  onPress?: () => void;
  isDisabled?: boolean;
};

function PageHierarchyBreadcrumb({
  ariaLabel,
  className,
  items
}: {
  ariaLabel: string;
  className?: string;
  items: PageHierarchyBreadcrumbItem[];
}) {
  return (
    <nav className={cn("page-hierarchy-breadcrumb", className)} aria-label={ariaLabel}>
      {items.map((item, index) => {
        const isCurrent = index === items.length - 1;
        return (
          <div className="page-hierarchy-segment" key={`${item.label}:${index}`}>
            {index > 0 ? <ChevronRight className="page-hierarchy-separator" aria-hidden="true" /> : null}
            {isCurrent ? (
              <h1 className="page-hierarchy-current" aria-current="page">{item.label}</h1>
            ) : (
              <Button className="page-hierarchy-link" variant="ghost" isDisabled={item.isDisabled} onPress={item.onPress}>
                {item.label}
              </Button>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function TemplatesScreen({
  templates,
  defaultTemplateId,
  onBack,
  onCreateTemplate,
  onDuplicateTemplate,
  onEditTemplate,
  onDeleteTemplate,
  onSetDefaultTemplate,
  onUseTemplate
}: {
  templates: ProjectTemplate[];
  defaultTemplateId: string;
  onBack: () => void;
  onCreateTemplate: () => void;
  onDuplicateTemplate: (template: ProjectTemplate) => Promise<ProjectTemplate>;
  onEditTemplate: (template: ProjectTemplate) => void;
  onDeleteTemplate: (templateId: string) => Promise<ProjectTemplate[]>;
  onSetDefaultTemplate: (templateId: string) => void;
  onUseTemplate: (templateId: string) => void;
}) {
  const { t } = useI18n();
  const [previewTemplate, setPreviewTemplate] = useState<ProjectTemplate | null>(null);
  const [pendingDeleteTemplate, setPendingDeleteTemplate] = useState<ProjectTemplate | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [activeFilter, setActiveFilter] = useState<TemplateFilter>("all");
  const filteredTemplates = useMemo(() => {
    if (activeFilter === "all") return templates;
    return templates.filter((template) => template.scope === activeFilter);
  }, [activeFilter, templates]);

  async function duplicateTemplate(template: ProjectTemplate) {
    if (actionBusy) return;
    setActionError("");
    setActionBusy(`duplicate:${template.id}`);
    try {
      await onDuplicateTemplate(template);
      if (activeFilter === "system") setActiveFilter("user");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setActionBusy(null);
    }
  }

  function setDefaultTemplate(template: ProjectTemplate) {
    if (actionBusy || template.id === defaultTemplateId) return;
    setActionError("");
    onSetDefaultTemplate(template.id);
  }

  async function confirmDeleteTemplate() {
    if (!pendingDeleteTemplate || actionBusy) return;
    const template = pendingDeleteTemplate;
    setActionError("");
    setActionBusy(`delete:${template.id}`);
    try {
      await onDeleteTemplate(template.id);
      setPendingDeleteTemplate(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setActionBusy(null);
    }
  }

  return (
    <section className="screen templates-screen active" aria-label={t("templates.title")}>
      <header className="page-hierarchy-topbar template-page-header template-library-header">
        <PageHierarchyBreadcrumb
          ariaLabel={t("common.pageHierarchy")}
          items={[
            { label: t("nav.projects"), onPress: onBack },
            { label: t("templates.title") }
          ]}
        />
        <Button className="topbar-action-button" variant="ghost" onPress={onCreateTemplate}>
          <Plus aria-hidden="true" />
          {t("templates.createTemplate")}
        </Button>
      </header>

      <div className="template-library-content">
        <div className="skills-filter-tabs template-filter-tabs" role="tablist" aria-label={t("templates.filterLabel")}>
          {([
            ["all", t("templates.filter.all")],
            ["system", t("templates.filter.official")],
            ["user", t("templates.filter.mine")]
          ] as Array<[TemplateFilter, string]>).map(([filter, label]) => (
            <button
              className={cn("skills-filter-tab template-filter-tab", activeFilter === filter && "active")}
              key={filter}
              type="button"
              role="tab"
              aria-selected={activeFilter === filter}
              onClick={() => setActiveFilter(filter)}
            >
              {label}
            </button>
          ))}
        </div>
        {actionError ? <p className="template-action-error" role="alert">{actionError}</p> : null}
        {filteredTemplates.length === 0 ? (
          <div className="skill-editor-empty-state skills-library-message template-filter-empty" role="status">
            <TableProperties aria-hidden="true" />
            <strong>{t("templates.emptyFilteredTitle")}</strong>
          </div>
        ) : (
          <div className="template-grid" aria-label={t("templates.list")}>
            {filteredTemplates.map((template) => {
              const storyboardSkillName = getTemplateStoryboardSkillName(template, t);
              const templateName = template.scope === "system" ? t("common.defaultTemplate") : template.name;
              const isDefault = template.id === defaultTemplateId;
              return (
                <article className={template.scope === "system" ? "template-card template-card-system" : "template-card template-card-user"} key={template.id}>
                  <div className="template-card-top">
                    <div className="template-card-heading">
                      <div className="template-card-icon" aria-hidden="true">
                        {template.scope === "system" ? <Clapperboard /> : <TableProperties />}
                      </div>
                      <div className="template-card-heading-copy">
                        <h2>{templateName}</h2>
                        {template.scope === "system" ? (
                          <span className="template-card-lock" aria-label={t("templates.builtInBadge")} title={t("templates.builtInBadge")}>
                            <Lock aria-hidden="true" />
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="template-card-top-actions">
                      <TemplateActionsMenu
                        actionBusy={actionBusy}
                        template={template}
                        onDelete={() => setPendingDeleteTemplate(template)}
                        onDuplicate={() => void duplicateTemplate(template)}
                        onEdit={() => onEditTemplate(template)}
                      />
                    </div>
                  </div>
                  <button className="template-card-preview-surface" type="button" aria-label={t("templates.previewNamedTemplate", { name: templateName })} onClick={() => setPreviewTemplate(template)}>
                    <p className="template-card-description">{template.scope === "system" ? t("templates.defaultDescription") : template.description || t("templates.customDescriptionFallback")}</p>
                    <div className="template-card-meta" aria-label={t("templates.columnCount", { count: template.columns.length })}>
                      <span>{t("templates.columnCount", { count: template.columns.length })}</span>
                      <span>{storyboardSkillName}</span>
                    </div>
                  </button>
                  <div className="template-card-footer-actions">
                    <Button
                      className={cn("template-card-default-control", isDefault && "selected")}
                      variant="ghost"
                      isDisabled={actionBusy !== null}
                      aria-pressed={isDefault}
                      onPress={() => setDefaultTemplate(template)}
                    >
                      <span className="sr-only">{templateName}：</span>
                      {isDefault ? <CircleCheck aria-hidden="true" /> : <CirclePlus aria-hidden="true" />}
                      <span>{t(isDefault ? "templates.defaultBadge" : "templates.setAsDefault")}</span>
                    </Button>
                    <Button className="template-card-use-action" variant="primary" onPress={() => onUseTemplate(template.id)}>
                      {t("templates.useTemplate")}
                      <ChevronRight aria-hidden="true" />
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
      <TemplatePreviewDialog
        template={previewTemplate}
        onClose={() => setPreviewTemplate(null)}
        onUseTemplate={(templateId) => {
          setPreviewTemplate(null);
          onUseTemplate(templateId);
        }}
      />
      <TemplateDeleteDialog
        busy={Boolean(pendingDeleteTemplate && actionBusy === `delete:${pendingDeleteTemplate.id}`)}
        template={pendingDeleteTemplate}
        onCancel={() => {
          if (!actionBusy) setPendingDeleteTemplate(null);
        }}
        onConfirm={() => void confirmDeleteTemplate()}
      />
    </section>
  );
}

function TemplateActionsMenu({
  actionBusy,
  template,
  onDelete,
  onDuplicate,
  onEdit
}: {
  actionBusy: string | null;
  template: ProjectTemplate;
  onDelete: () => void;
  onDuplicate: () => void;
  onEdit: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const disabled = actionBusy !== null;
  const templateName = template.scope === "system" ? t("common.defaultTemplate") : template.name;
  const actionMenuId = `template-actions:${template.id}`;

  useEffect(() => {
    if (!open) return undefined;

    function closeOnOutsidePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const actionSurface = target.closest<HTMLElement>("[data-template-actions-id]");
      if (actionSurface?.dataset.templateActionsId === actionMenuId) return;
      setOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", closeOnOutsidePointerDown, true);
    document.addEventListener("keydown", closeOnEscape, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointerDown, true);
      document.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [actionMenuId, open]);

  function runAction(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <Popover isOpen={open} onOpenChange={setOpen}>
      <Popover.Trigger>
        <Button
          className={cn("template-card-more-trigger", open && "open")}
          variant="ghost"
          isDisabled={disabled}
          aria-label={t("templates.actionsLabel", { name: templateName })}
          data-template-actions-id={actionMenuId}
        >
          {actionBusy?.endsWith(`:${template.id}`) ? <LoaderCircle className="spinning" aria-hidden="true" /> : <Ellipsis aria-hidden="true" />}
        </Button>
      </Popover.Trigger>
      <Popover.Content
        className="project-card-actions-popover template-card-actions-popover"
        data-template-actions-id={actionMenuId}
        isNonModal
        offset={8}
        placement="bottom end"
      >
        <Popover.Dialog>
          <div className="project-card-actions-menu" aria-label={t("templates.actionsLabel", { name: templateName })}>
            {template.scope === "user" ? (
              <Button className="project-card-actions-menu-item" variant="ghost" onPress={() => runAction(onEdit)}>
                <Pencil aria-hidden="true" />
                {t("templates.editTemplate")}
              </Button>
            ) : null}
            <Button className="project-card-actions-menu-item" variant="ghost" onPress={() => runAction(onDuplicate)}>
              <Copy aria-hidden="true" />
              {t("templates.copyTemplate")}
            </Button>
            {template.scope === "user" ? (
              <Button className="project-card-actions-menu-item destructive" variant="ghost" onPress={() => runAction(onDelete)}>
                <Trash2 aria-hidden="true" />
                {t("templates.deleteTemplate")}
              </Button>
            ) : null}
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}

function TemplateDeleteDialog({
  busy,
  template,
  onCancel,
  onConfirm
}: {
  busy: boolean;
  template: ProjectTemplate | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();

  return (
    <ScreenConfirmationDialog
      cancelDisabled={busy}
      cancelLabel={t("common.cancel")}
      confirmBusy={busy}
      confirmDisabled={busy}
      confirmLabel={t(busy ? "templates.deletingTemplate" : "templates.confirmDeleteTemplate")}
      confirmVariant="danger"
      descriptions={[t("templates.deleteDialogDescription")]}
      icon={<Trash2 />}
      idBase="template-delete-confirmation"
      isDismissable={!busy}
      isOpen={Boolean(template)}
      status="danger"
      title={t("templates.deleteDialogTitle", { name: template?.name ?? "" })}
      onClose={onCancel}
      onConfirm={onConfirm}
    />
  );
}

function TemplatePreviewDialog({
  template,
  onClose,
  onUseTemplate
}: {
  template: ProjectTemplate | null;
  onClose: () => void;
  onUseTemplate: (templateId: string) => void;
}) {
  const { locale, t } = useI18n();
  const columns = useMemo(() => ensureStoryboardPromptColumns(template?.columns ?? [], locale), [locale, template?.columns]);
  const rows = useMemo(() => getTemplatePreviewRows(columns, t), [columns, t]);

  useEffect(() => {
    if (!template) return undefined;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, template]);

  if (!template) return null;

  const templateName = template.scope === "system" ? t("common.defaultTemplate") : template.name;
  const storyboardSkillName = getTemplateStoryboardSkillName(template, t);

  return (
    <div
      className="template-preview-layer"
      role="presentation"
      onPointerDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section className="template-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="template-preview-title">
        <header className="template-preview-header">
          <div className="template-preview-heading">
            <h2 id="template-preview-title">{templateName}</h2>
            <div className="template-preview-meta" aria-label={t("templates.previewMeta")}>
              <span>{t("templates.columnCount", { count: columns.length })}</span>
              <span>{storyboardSkillName}</span>
              <span>{t("templates.previewReadonlyBadge")}</span>
            </div>
          </div>
          <button className="template-preview-close" type="button" aria-label={t("common.close")} onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="template-preview-body">
          <TemplatePreviewTable columns={columns} rows={rows} />
        </div>

        <footer className="template-preview-footer">
          <div className="template-preview-footer-actions">
            <Button className="template-preview-secondary-action" variant="outline" onPress={onClose}>
              {t("common.close")}
            </Button>
            <Button className="template-preview-primary-action" variant="primary" onPress={() => onUseTemplate(template.id)}>
              {t("templates.useTemplate")}
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function TemplatePreviewTable({ columns, rows }: { columns: StoryboardColumn[]; rows: StoryboardRow[] }) {
  const { t } = useI18n();
  const visibleColumns = columns.filter((column) => column.visible);
  const tableColumns = visibleColumns.map((column) => getColumnTrack(column.id, {})).join(" ");
  const tableWidth = getStoryboardTableWidth(visibleColumns, {});

  return (
    <div className="template-preview-table-scroll">
      <div
        className="template-preview-table"
        role="table"
        aria-label={t("templates.previewTableLabel")}
        style={
          {
            "--template-preview-columns": tableColumns,
            "--template-preview-table-width": `${tableWidth}px`
          } as React.CSSProperties
        }
      >
        <div className="template-preview-row template-preview-row-header" role="row">
          {visibleColumns.map((column) => (
            <div className="template-preview-header-cell" role="columnheader" data-column-id={column.id} key={column.id}>
              <span className="template-preview-column-icon" aria-hidden="true">
                {getColumnSettingIcon(column)}
              </span>
              <span>{getColumnLabel(column, t)}</span>
            </div>
          ))}
        </div>
        {rows.map((row, rowIndex) => (
          <div className={cn("template-preview-row", rowIndex % 2 === 1 && "soft")} role="row" key={row.id}>
            {visibleColumns.map((column) => (
              <TemplatePreviewCell column={column} row={row} rowIndex={rowIndex} key={`${row.id}-${column.id}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function TemplatePreviewCell({ column, row, rowIndex }: { column: StoryboardColumn; row: StoryboardRow; rowIndex: number }) {
  const { t } = useI18n();
  const value = getTemplatePreviewCellValue(column, row, rowIndex);
  const category = column.id === "scene" ? normalizeStoryboardCategory(value) : "";
  const method = normalizeStoryboardGenerationMethod(value);

  if (column.id === "sort") {
    return (
      <div className="template-preview-cell template-preview-sort-cell" role="cell" aria-readonly="true" data-column-id={column.id}>
        {rowIndex + 1}
      </div>
    );
  }

  if (column.type === "image") {
    const imageState = getTemplatePreviewImageState(row);
    const imageSrc = imageState === "error" ? TEMPLATE_PREVIEW_ERROR_IMAGE_SRC : TEMPLATE_PREVIEW_PLACEHOLDER_IMAGE_SRC;
    return (
      <div className="template-preview-cell template-preview-image-cell" role="cell" aria-readonly="true" data-column-id={column.id}>
        <span className={imageState} aria-hidden="true">
          <img
            src={imageSrc}
            alt=""
            loading="lazy"
            decoding="async"
            onError={(event) => {
              if (event.currentTarget.src !== TEMPLATE_PREVIEW_ERROR_IMAGE_SRC) event.currentTarget.src = TEMPLATE_PREVIEW_ERROR_IMAGE_SRC;
            }}
          />
        </span>
        <small>{t(imageState === "error" ? "templates.previewImageErrorPlaceholder" : "templates.previewImagePlaceholder")}</small>
      </div>
    );
  }

  if (category) {
    return (
      <div className="template-preview-cell" role="cell" aria-readonly="true" data-column-id={column.id}>
        <span className={cn("template-preview-category", getStoryboardCategoryClassName(category))}>
          {getStoryboardCategoryIcon(category)}
          {category}
        </span>
      </div>
    );
  }

  if (method) {
    return (
      <div className="template-preview-cell" role="cell" aria-readonly="true" data-column-id={column.id}>
        <span className={cn("template-preview-method", getGenerationMethodClassName(method))}>
          {getGenerationMethodIcon(method)}
          {method}
        </span>
      </div>
    );
  }

  if (column.type === "select") {
    return (
      <div className="template-preview-cell" role="cell" aria-readonly="true" data-column-id={column.id}>
        <span className="template-preview-select-value">
          <ListChecks aria-hidden="true" />
          {value || t("storyboard.selectPlaceholder")}
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn("template-preview-cell", column.type === "number" && "template-preview-number-cell", !value && "empty placeholder-cell")}
      data-placeholder={t("storyboard.noPromptPlaceholder")}
      role="cell"
      aria-readonly="true"
      data-column-id={column.id}
    >
      {value || null}
    </div>
  );
}

function getTemplatePreviewRows(columns: StoryboardColumn[], t: Translator): StoryboardRow[] {
  return [
    {
      id: "template-preview-row-1",
      shot: "1",
      scene: "A-ROLL",
      duration: "6",
      content: t("templates.previewSampleArollContent"),
      note: t("templates.previewSampleArollNote"),
      customValues: getTemplatePreviewCustomValues(columns, "a-roll", t)
    },
    {
      id: "template-preview-row-2",
      shot: "2",
      scene: "B-ROLL",
      duration: "8",
      content: t("templates.previewSampleBrollContent"),
      note: t("templates.previewSampleBrollNote"),
      customValues: getTemplatePreviewCustomValues(columns, "b-roll", t)
    }
  ];
}

function getTemplatePreviewCustomValues(columns: StoryboardColumn[], rowKind: "a-roll" | "b-roll", t: Translator) {
  return columns.reduce<Record<string, string>>((values, column) => {
    if (!column.id.startsWith("custom-")) return values;

    const normalizedLabel = column.label.toLocaleLowerCase();
    const isGenerationMethod = column.id === "custom-3" || /生成方式|generation/.test(normalizedLabel);
    if (isGenerationMethod) {
      values[column.id] = rowKind === "b-roll" ? "ChatGPT Image2" : "";
      return values;
    }

    if (/图像|圖片|image/.test(normalizedLabel)) {
      values[column.id] = rowKind === "b-roll" ? t("templates.previewSampleImagePrompt") : "";
      return values;
    }

    if (/视频|影片|video/.test(normalizedLabel)) {
      values[column.id] = rowKind === "b-roll" ? t("templates.previewSampleVideoPrompt") : "";
      return values;
    }

    if (column.type === "number") {
      values[column.id] = rowKind === "b-roll" ? "2" : "1";
      return values;
    }

    if (column.type === "select") {
      values[column.id] = rowKind === "b-roll" ? t("templates.previewSampleSelectValue") : "";
      return values;
    }

    values[column.id] = rowKind === "b-roll" ? t("templates.previewSampleCustomValue") : "";
    return values;
  }, {});
}

function getTemplatePreviewCellValue(column: StoryboardColumn, row: StoryboardRow, rowIndex: number) {
  if (column.id === "sort") return String(rowIndex + 1);
  if (column.id === "shot") return row.shot;
  return getStoryboardCellValue(column.id, row);
}

function getTemplatePreviewImageState(row: StoryboardRow): "placeholder" | "error" {
  return row.customValues?.[TEMPLATE_PREVIEW_IMAGE_STATE_FIELD] === "error" ? "error" : "placeholder";
}

function TemplateEditorScreen({
  isEditing,
  template,
  skills,
  skillsError,
  skillsLoading,
  onBack,
  onOpenProjects,
  onCreateTemplate,
  onUpdateTemplate,
  onSaved
}: {
  isEditing: boolean;
  template: ProjectTemplate | null;
  skills: Skill[];
  skillsError: string | null;
  skillsLoading: boolean;
  onBack: () => void;
  onOpenProjects: () => void;
  onCreateTemplate: (input: CreateProjectTemplateInput) => Promise<ProjectTemplate>;
  onUpdateTemplate: (input: UpdateProjectTemplateInput) => Promise<ProjectTemplate>;
  onSaved: () => void;
}) {
  const { locale, t } = useI18n();
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [columns, setColumns] = useState<StoryboardColumn[]>(() =>
    template ? template.columns.map((column) => ({ ...column })) : getDefaultStoryboardColumns(locale)
  );
  const [customColumnName, setCustomColumnName] = useState("");
  const [customColumnType, setCustomColumnType] = useState<StoryboardColumnType>("text");
  const [selectedSkillId, setSelectedSkillId] = useState(template?.storyboardSkillId ?? "");
  const [saving, setSaving] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);
  const [saveAttempted, setSaveAttempted] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [createStep, setCreateStep] = useState<"columns" | "settings">("columns");
  const nextCustomColumnIndex = getNextCustomColumnIndex(columns);
  const selectableSkills = getSelectableProjectSkills(skills, t, locale);
  const isColumnsStep = createStep === "columns";
  const nameInvalid = !name.trim();
  const skillInvalid = !selectedSkillId;
  const columnsInvalid = columns.length === 0;
  const showNameError = (nameTouched || saveAttempted) && nameInvalid;
  const showSkillError = saveAttempted && skillInvalid;

  useEffect(() => {
    if (selectedSkillId && selectableSkills.some((skill) => skill.id === selectedSkillId)) return;
    setSelectedSkillId(selectableSkills[0]?.id ?? "");
  }, [selectedSkillId, selectableSkills]);

  function addCustomColumn() {
    const nextIndex = nextCustomColumnIndex;
    const nextColumnId = `custom-${nextIndex}` as StoryboardColumnId;
    setColumns((currentColumns) => [
      ...currentColumns,
      {
        id: nextColumnId,
        label: customColumnName.trim() || t("storyboard.customColumnDefault", { index: nextIndex }),
        type: customColumnType,
        visible: true,
        custom: true
      }
    ]);
    setCustomColumnName("");
  }

  function toggleColumn(columnId: StoryboardColumnId) {
    setColumns((currentColumns) =>
      currentColumns.map((column) => {
        if (column.id !== columnId || column.locked) return column;
        return { ...column, visible: !column.visible };
      })
    );
  }

  function updateColumnLabel(columnId: StoryboardColumnId, label: string) {
    const nextLabel = label.trim();
    if (!nextLabel) return;
    setColumns((currentColumns) => currentColumns.map((column) => (column.id === columnId ? { ...column, label: nextLabel } : column)));
  }

  function updateColumnType(columnId: StoryboardColumnId, type: StoryboardColumnType) {
    setColumns((currentColumns) => currentColumns.map((column) => (column.id === columnId ? { ...column, type } : column)));
  }

  function deleteColumn(columnId: StoryboardColumnId) {
    setColumns((currentColumns) => currentColumns.filter((column) => column.id !== columnId || column.locked));
  }

  function moveColumn(columnId: StoryboardColumnId, direction: "up" | "down") {
    setColumns((currentColumns) => {
      const sourceIndex = currentColumns.findIndex((column) => column.id === columnId);
      const targetIndex = direction === "up" ? sourceIndex - 1 : sourceIndex + 1;
      const sourceColumn = currentColumns[sourceIndex];
      const targetColumn = currentColumns[targetIndex];

      if (!sourceColumn || !targetColumn || sourceColumn.locked || targetColumn.locked) return currentColumns;

      const nextColumns = [...currentColumns];
      nextColumns[sourceIndex] = targetColumn;
      nextColumns[targetIndex] = sourceColumn;
      return nextColumns;
    });
  }

  async function saveTemplate() {
    if (saving || skillsLoading) return;
    setSaveAttempted(true);
    setNameTouched(true);
    setSaveError("");
    if (nameInvalid || skillInvalid || columnsInvalid) {
      if (columnsInvalid) setCreateStep("columns");
      return;
    }
    setSaving(true);
    try {
      const input = {
        name: name.trim(),
        description: description.trim(),
        columns,
        storyboardSkillId: selectedSkillId,
        interfaceLanguage: locale
      };
      if (isEditing && template) {
        await onUpdateTemplate({ ...input, id: template.id });
      } else {
        await onCreateTemplate(input);
      }
      onSaved();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  const editorPageTitle = t(isEditing ? "templates.editTitle" : "templates.createTitle");

  if (isEditing && !template) {
    return (
      <section className="screen template-create-screen active" aria-label={t("templates.editTitle")}>
        <header className="page-hierarchy-topbar template-page-header template-create-header">
          <PageHierarchyBreadcrumb
            ariaLabel={t("common.pageHierarchy")}
            items={[
              { label: t("nav.projects"), onPress: onOpenProjects },
              { label: t("templates.title"), onPress: onBack },
              { label: t("templates.editTitle") }
            ]}
          />
        </header>
        <div className="template-create-page-content">
          <div className="template-editor-unavailable" role="status">
            <h2>{t("templates.editUnavailableTitle")}</h2>
            <p>{t("templates.editUnavailableDescription")}</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="screen template-create-screen active" aria-label={editorPageTitle}>
      <header className="page-hierarchy-topbar template-page-header template-create-header">
        <PageHierarchyBreadcrumb
          ariaLabel={t("common.pageHierarchy")}
          items={[
            { label: t("nav.projects"), onPress: onOpenProjects },
            { label: t("templates.title"), onPress: onBack },
            { label: editorPageTitle }
          ]}
        />
      </header>

      <div className="template-create-page-content">
        <p className="template-page-description template-create-description">{t(isEditing ? "templates.editDescription" : "templates.createDescription")}</p>
        <div className="template-create-workbench">
          <ol className="template-create-stepper" aria-label={t("templates.createSteps")}>
            <li className={cn(isColumnsStep && "active", !isColumnsStep && "complete")} aria-current={isColumnsStep ? "step" : undefined}>
              <Button className="template-create-step-button" variant="ghost" onPress={() => setCreateStep("columns")}>
                <span className="template-create-step-index">{isColumnsStep ? "1" : <Check aria-hidden="true" />}</span>
                <span className="template-create-step-copy">
                  <strong>{t("templates.stepOne")}</strong>
                  <small>{t("templates.stepColumns")}</small>
                </span>
              </Button>
            </li>
            <li className={cn(!isColumnsStep && "active")} aria-current={!isColumnsStep ? "step" : undefined}>
              <Button className="template-create-step-button" variant="ghost" onPress={() => setCreateStep("settings")}>
                <span className="template-create-step-index">2</span>
                <span className="template-create-step-copy">
                  <strong>{t("templates.stepTwo")}</strong>
                  <small>{t("templates.stepSkill")}</small>
                </span>
              </Button>
            </li>
          </ol>

          <div className="template-create-layout">
            {isColumnsStep ? (
              <section className="template-create-main template-create-step-panel" aria-label={t("templates.stepColumns")}>
                <div className="template-columns-panel">
                  <ColumnSettingsPanel
                    columns={columns}
                    customColumnName={customColumnName}
                    customColumnType={customColumnType}
                    nextCustomColumnIndex={nextCustomColumnIndex}
                    showHeader={false}
                    t={t}
                    onAddCustomColumn={addCustomColumn}
                    onChangeCustomColumnType={setCustomColumnType}
                    onChangeCustomColumnName={setCustomColumnName}
                    onChangeColumnLabel={updateColumnLabel}
                    onChangeColumnType={updateColumnType}
                    onDeleteColumn={deleteColumn}
                    onMoveColumn={moveColumn}
                    onToggleColumn={toggleColumn}
                  />
                </div>
              </section>
            ) : (
              <section className="template-create-side template-create-step-panel template-create-form-panel" aria-label={t("templates.templateSettings")}>
                <div className="template-create-settings-grid">
                  <section className="template-create-details-card" aria-labelledby="template-details-title">
                    <div className="template-create-subsection-heading">
                      <h3 id="template-details-title">{t("templates.templateDetails")}</h3>
                      <p>{t("templates.templateDetailsDescription")}</p>
                    </div>
                    <div className="template-create-form-fields">
                      <label className="template-create-field" htmlFor="template-name-input">
                        <span className="template-create-field-label">
                          {t("templates.name")}
                          <strong aria-hidden="true">*</strong>
                        </span>
                        <Input
                          id="template-name-input"
                          className="template-create-input"
                          value={name}
                          placeholder={t("templates.namePlaceholder")}
                          aria-describedby="template-name-feedback"
                          aria-invalid={showNameError || undefined}
                          aria-required="true"
                          onBlur={() => setNameTouched(true)}
                          onChange={(event) => {
                            setName(event.target.value);
                            setSaveError("");
                          }}
                        />
                        <small className={cn("template-create-field-feedback", showNameError && "error")} id="template-name-feedback">
                          {showNameError ? t("templates.nameRequired") : t("templates.nameHelper")}
                        </small>
                      </label>
                      <label className="template-create-field" htmlFor="template-description-input">
                        <span className="template-create-field-label">{t("templates.descriptionField")}</span>
                        <TextArea
                          id="template-description-input"
                          className="template-create-textarea"
                          value={description}
                          placeholder={t("templates.descriptionPlaceholder")}
                          aria-describedby="template-description-feedback"
                          rows={4}
                          onChange={(event) => {
                            setDescription(event.target.value);
                            setSaveError("");
                          }}
                        />
                        <small className="template-create-field-feedback" id="template-description-feedback">{t("templates.descriptionHelper")}</small>
                      </label>
                    </div>
                  </section>

                  <section className="template-create-skill-card" aria-labelledby="template-skill-title">
                    <div className="template-create-subsection-heading">
                      <h3 id="template-skill-title">{t("templates.skill")}</h3>
                      <p>{t("templates.skillDescription")}</p>
                    </div>
                    {skillsLoading ? (
                      <div className="template-create-skill-status" role="status">
                        <LoaderCircle className="spinning" aria-hidden="true" />
                        <span>{t("skills.loading")}</span>
                      </div>
                    ) : (
                      <div className="template-create-skill-grid" aria-label={t("templates.skill")}>
                        {selectableSkills.map((skill) => (
                          <SkillCard
                            className="template-create-skill-option"
                            key={skill.id}
                            selected={skill.id === selectedSkillId}
                            skill={skill}
                            onSelect={(skillId) => {
                              setSelectedSkillId(skillId);
                              setSaveError("");
                            }}
                          />
                        ))}
                      </div>
                    )}
                    {showSkillError ? <p className="template-create-error" role="alert">{t("templates.skillRequired")}</p> : null}
                    {skillsError ? <p className="template-create-error" role="alert">{skillsError}</p> : null}
                  </section>
                </div>
                {saveError ? <p className="template-create-save-error" role="alert"><AlertTriangle aria-hidden="true" />{saveError}</p> : null}
              </section>
            )}
          </div>

          <div className={cn("template-create-actions", !isColumnsStep && "with-previous")}>
            {!isColumnsStep ? (
              <Button className="template-create-secondary-action" variant="outline" onPress={() => setCreateStep("columns")}>
                <ArrowLeft aria-hidden="true" />
                {t("templates.previousStep")}
              </Button>
            ) : null}
            {isColumnsStep ? (
              <Button className="template-create-primary-action" variant="primary" onPress={() => setCreateStep("settings")}>
                {t("templates.nextStep")}
                <ChevronRight aria-hidden="true" />
              </Button>
            ) : (
              <Button className="template-create-primary-action template-save-action" isDisabled={saving || skillsLoading} variant="primary" onPress={() => void saveTemplate()}>
                {saving ? <LoaderCircle className="spinning" aria-hidden="true" /> : <Check aria-hidden="true" />}
                {t(isEditing ? "templates.saveChanges" : "templates.saveTemplate")}
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function ProjectCard({
  isArchived,
  project,
  onArchiveProject,
  onEditProject,
  onOpenProject,
  onTrashProject,
  onUnarchiveProject
}: {
  isArchived: boolean;
  project: ProjectSummary;
  onArchiveProject: (project: ProjectSummary) => void;
  onEditProject: (project: ProjectSummary) => void;
  onOpenProject: (project: ProjectSummary) => void;
  onTrashProject: (project: ProjectSummary) => void;
  onUnarchiveProject: (project: ProjectSummary) => void;
}) {
  const { t } = useI18n();
  const [actionsOpen, setActionsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [coverImageFailed, setCoverImageFailed] = useState(false);
  const tutorialProject = isTutorialProject(project);
  const coverPreview = project.coverPreview ?? null;
  const shotCount = project.shotCount ?? 0;
  const videoCount = project.videoCount ?? 0;

  useEffect(() => {
    setCoverImageFailed(false);
  }, [coverPreview?.url, coverPreview?.videoUrl]);

  useEffect(() => {
    if (!actionsOpen) return;

    function closeOnOutsidePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".project-card-actions-trigger, .project-card-actions-popover")) return;
      setActionsOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setActionsOpen(false);
    }

    document.addEventListener("pointerdown", closeOnOutsidePointerDown, true);
    document.addEventListener("keydown", closeOnEscape, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointerDown, true);
      document.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [actionsOpen]);

  function openProjectForEditing() {
    setActionsOpen(false);
    onEditProject(project);
  }

  function trashProject() {
    setActionsOpen(false);
    onTrashProject(project);
  }

  function toggleProjectArchive() {
    setActionsOpen(false);
    if (isArchived) {
      onUnarchiveProject(project);
    } else {
      onArchiveProject(project);
    }
  }

  const hasVisualCover = Boolean(coverPreview && (!coverImageFailed || coverPreview.videoUrl || coverPreview.fallbackUrl));

  return (
    <article
      className={cn("project-card folder-card", tutorialProject && "tutorial-project-card", hasVisualCover && "has-media-cover")}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
    >
      {tutorialProject ? <span className="project-tutorial-badge">{t("project.tutorialBadge")}</span> : null}
      <Button className="project-card-open" variant="ghost" onPress={() => onOpenProject(project)}>
        <div className={cn("folder-preview", hasVisualCover ? "folder-preview-media" : "folder-preview-slate")}>
          {coverPreview?.kind === "video-first-frame" ? (
            <>
              {coverPreview.isRemoteVideo || coverImageFailed ? (
                <video
                  className="project-card-cover-media"
                  src={coverPreview.videoUrl ? `${coverPreview.videoUrl}#t=0.05` : coverPreview.url}
                  poster={coverPreview.fallbackUrl ?? undefined}
                  preload="metadata"
                  muted
                  loop
                  playsInline
                  autoPlay={isHovered}
                />
              ) : (
                <>
                  <img
                    className="project-card-cover-media"
                    src={coverPreview.url}
                    alt=""
                    loading="lazy"
                    onError={() => setCoverImageFailed(true)}
                  />
                  {isHovered && coverPreview.videoUrl ? (
                    <video
                      className="project-card-cover-media project-card-cover-hover-video"
                      src={coverPreview.videoUrl}
                      autoPlay
                      muted
                      loop
                      playsInline
                    />
                  ) : null}
                </>
              )}
              {!tutorialProject ? (
                <span className="project-card-cover-pill is-video">
                  <Film aria-hidden="true" />
                  <span>{t("project.coverVideoBadge")}</span>
                  {coverPreview.shotNumber ? <em>#{coverPreview.shotNumber}</em> : null}
                </span>
              ) : null}
            </>
          ) : coverPreview?.kind === "broll-image" && !coverImageFailed ? (
            <>
              <img
                className="project-card-cover-media"
                src={coverPreview.url}
                alt=""
                loading="lazy"
                onError={() => setCoverImageFailed(true)}
              />
              {!tutorialProject ? (
                <span className="project-card-cover-pill is-broll">
                  <Image aria-hidden="true" />
                  <span>{t("project.coverBRollBadge")}</span>
                  {coverPreview.shotNumber ? <em>#{coverPreview.shotNumber}</em> : null}
                </span>
              ) : null}
            </>
          ) : (
            <div className="project-card-empty-stage">
              <div className="project-card-empty-frame">
                <ProjectMarkIcon value={project.icon} className="project-card-project-icon" />
              </div>
              <span className="project-card-empty-caption">{t("project.coverEmptyHint")}</span>
            </div>
          )}

          <div className="project-card-cover-scrim">
            <span className="project-card-ratio-chip">{project.imageRatio}</span>
            {shotCount > 0 ? (
              <span className="project-card-stats-chip">
                {t("project.shotsCount", { count: String(shotCount) })}
                {videoCount > 0 ? ` · ${t("project.videosCount", { count: String(videoCount) })}` : ""}
              </span>
            ) : null}
          </div>
        </div>
        <div className="project-card-meta">
          <span className="project-card-title-line" title={project.name}>
            <span className="project-card-mini-icon">
              <ProjectMarkIcon value={project.icon} />
            </span>
            <strong title={project.name}>{project.name}</strong>
          </span>
          <small>{tutorialProject ? t("project.tutorialDescription") : t("project.createdAt", { date: formatProjectDate(project.createdAt, t) })}</small>
        </div>
      </Button>
      {tutorialProject ? (
        <span className="project-card-tutorial-lock" aria-label={t("project.tutorialLocked")}>
          <Lock aria-hidden="true" />
        </span>
      ) : (
      <Popover isOpen={actionsOpen} onOpenChange={setActionsOpen}>
        <Popover.Trigger>
          <Button
            aria-label={t("project.actionsLabel", { name: project.name })}
            className={cn("project-card-actions-trigger", actionsOpen && "open")}
            variant="ghost"
          >
            <Ellipsis aria-hidden="true" />
          </Button>
        </Popover.Trigger>
        <Popover.Content className="project-card-actions-popover" isNonModal offset={8} placement="bottom end">
          <Popover.Dialog>
            <div className="project-card-actions-menu" aria-label={t("project.actionsLabel", { name: project.name })}>
              <Button className="project-card-actions-menu-item" variant="ghost" onPress={openProjectForEditing}>
                <Pencil aria-hidden="true" />
                <span>{t("project.editProject")}</span>
              </Button>
              <Button className="project-card-actions-menu-item" variant="ghost" onPress={toggleProjectArchive}>
                {isArchived ? <ArchiveRestore aria-hidden="true" /> : <Archive aria-hidden="true" />}
                <span>{t(isArchived ? "project.unarchiveProject" : "project.archiveProject")}</span>
              </Button>
              <Button className="project-card-actions-menu-item destructive" variant="ghost" onPress={trashProject}>
                <Trash2 aria-hidden="true" />
                <span>{t("project.deleteProject")}</span>
              </Button>
            </div>
          </Popover.Dialog>
        </Popover.Content>
      </Popover>
      )}
    </article>
  );
}

function ProjectListRow({
  isArchived,
  project,
  onArchiveProject,
  onEditProject,
  onOpenProject,
  onTrashProject,
  onUnarchiveProject
}: {
  isArchived: boolean;
  project: ProjectSummary;
  onArchiveProject: (project: ProjectSummary) => void;
  onEditProject: (project: ProjectSummary) => void;
  onOpenProject: (project: ProjectSummary) => void;
  onTrashProject: (project: ProjectSummary) => void;
  onUnarchiveProject: (project: ProjectSummary) => void;
}) {
  const { t } = useI18n();
  const [actionsOpen, setActionsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [coverImageFailed, setCoverImageFailed] = useState(false);
  const tutorialProject = isTutorialProject(project);
  const coverPreview = project.coverPreview ?? null;
  const shotCount = project.shotCount ?? 0;
  const videoCount = project.videoCount ?? 0;

  useEffect(() => {
    setCoverImageFailed(false);
  }, [coverPreview?.url, coverPreview?.videoUrl]);

  useEffect(() => {
    if (!actionsOpen) return;

    function closeOnOutsidePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".project-card-actions-trigger, .project-card-actions-popover")) return;
      setActionsOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setActionsOpen(false);
    }

    document.addEventListener("pointerdown", closeOnOutsidePointerDown, true);
    document.addEventListener("keydown", closeOnEscape, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointerDown, true);
      document.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [actionsOpen]);

  function openProjectForEditing() {
    setActionsOpen(false);
    onEditProject(project);
  }

  function trashProject() {
    setActionsOpen(false);
    onTrashProject(project);
  }

  function toggleProjectArchive() {
    setActionsOpen(false);
    if (isArchived) {
      onUnarchiveProject(project);
    } else {
      onArchiveProject(project);
    }
  }

  const hasVisualCover = Boolean(coverPreview && (!coverImageFailed || coverPreview.videoUrl || coverPreview.fallbackUrl));

  return (
    <div
      className={cn("project-list-row", tutorialProject && "is-tutorial", actionsOpen && "actions-open")}
      role="row"
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
    >
      <Button className="project-list-row-main" variant="ghost" onPress={() => onOpenProject(project)}>
        <span className="project-list-name-cell" role="cell">
          <span className={cn("project-list-thumb", hasVisualCover ? "has-media" : "is-slate")}>
            {coverPreview?.kind === "video-first-frame" ? (
              coverPreview.isRemoteVideo || coverImageFailed ? (
                <video
                  className="project-list-thumb-media"
                  src={coverPreview.videoUrl ? `${coverPreview.videoUrl}#t=0.05` : coverPreview.url}
                  poster={coverPreview.fallbackUrl ?? undefined}
                  preload="metadata"
                  muted
                  loop
                  playsInline
                  autoPlay={isHovered}
                />
              ) : (
                <>
                  <img
                    className="project-list-thumb-media"
                    src={coverPreview.url}
                    alt=""
                    loading="lazy"
                    onError={() => setCoverImageFailed(true)}
                  />
                  {isHovered && coverPreview.videoUrl ? (
                    <video
                      className="project-list-thumb-media project-list-thumb-hover-video"
                      src={coverPreview.videoUrl}
                      autoPlay
                      muted
                      loop
                      playsInline
                    />
                  ) : null}
                </>
              )
            ) : coverPreview?.kind === "broll-image" && !coverImageFailed ? (
              <img
                className="project-list-thumb-media"
                src={coverPreview.url}
                alt=""
                loading="lazy"
                onError={() => setCoverImageFailed(true)}
              />
            ) : (
              <span className="project-list-thumb-empty">
                <ProjectMarkIcon value={project.icon} />
              </span>
            )}
          </span>

          <span className="project-list-title-stack">
            <span className="project-list-title-main">
              <span className="project-card-mini-icon">
                <ProjectMarkIcon value={project.icon} />
              </span>
              <strong className="project-list-title" title={project.name}>{project.name}</strong>
              {tutorialProject ? (
                <span className="project-list-badge is-tutorial">{t("project.tutorialBadge")}</span>
              ) : coverPreview?.kind === "video-first-frame" ? (
                <span className="project-list-badge is-video">
                  <Film aria-hidden="true" />
                  <span>{t("project.coverVideoBadge")}</span>
                  {coverPreview.shotNumber ? <em>#{coverPreview.shotNumber}</em> : null}
                </span>
              ) : coverPreview?.kind === "broll-image" ? (
                <span className="project-list-badge is-broll">
                  <Image aria-hidden="true" />
                  <span>{t("project.coverBRollBadge")}</span>
                  {coverPreview.shotNumber ? <em>#{coverPreview.shotNumber}</em> : null}
                </span>
              ) : null}
            </span>
          </span>
        </span>

        <span className="project-list-cell project-list-col-ratio" role="cell">
          <span className="project-list-ratio-pill">{project.imageRatio}</span>
        </span>

        <span className="project-list-cell project-list-col-stats" role="cell">
          {shotCount > 0 ? (
            <span className="project-list-stats">
              {t("project.shotsCount", { count: String(shotCount) })}
              {videoCount > 0 ? ` · ${t("project.videosCount", { count: String(videoCount) })}` : ""}
            </span>
          ) : (
            <span className="project-list-stats is-empty">{t("project.coverEmptyHint")}</span>
          )}
        </span>

        <span className="project-list-cell project-list-col-updated" role="cell">
          <span className="project-list-date">{formatProjectDate(project.updatedAt, t)}</span>
        </span>

        <span className="project-list-cell project-list-col-created" role="cell">
          <span className="project-list-date is-muted">
            {tutorialProject ? t("project.tutorialDescription") : formatProjectDate(project.createdAt, t)}
          </span>
        </span>
      </Button>

      <div className="project-list-actions-cell project-list-col-actions" role="cell">
        {tutorialProject ? (
          <span className="project-list-lock" aria-label={t("project.tutorialLocked")} title={t("project.tutorialLocked")}>
            <Lock aria-hidden="true" />
          </span>
        ) : (
          <Popover isOpen={actionsOpen} onOpenChange={setActionsOpen}>
            <Popover.Trigger>
              <Button
                aria-label={t("project.actionsLabel", { name: project.name })}
                className={cn("project-card-actions-trigger project-list-actions-trigger", actionsOpen && "open")}
                variant="ghost"
              >
                <Ellipsis aria-hidden="true" />
              </Button>
            </Popover.Trigger>
            <Popover.Content className="project-card-actions-popover" isNonModal offset={8} placement="bottom end">
              <Popover.Dialog>
                <div className="project-card-actions-menu" aria-label={t("project.actionsLabel", { name: project.name })}>
                  <Button className="project-card-actions-menu-item" variant="ghost" onPress={openProjectForEditing}>
                    <Pencil aria-hidden="true" />
                    <span>{t("project.editProject")}</span>
                  </Button>
                  <Button className="project-card-actions-menu-item" variant="ghost" onPress={toggleProjectArchive}>
                    {isArchived ? <ArchiveRestore aria-hidden="true" /> : <Archive aria-hidden="true" />}
                    <span>{t(isArchived ? "project.unarchiveProject" : "project.archiveProject")}</span>
                  </Button>
                  <Button className="project-card-actions-menu-item destructive" variant="ghost" onPress={trashProject}>
                    <Trash2 aria-hidden="true" />
                    <span>{t("project.deleteProject")}</span>
                  </Button>
                </div>
              </Popover.Dialog>
            </Popover.Content>
          </Popover>
        )}
      </div>
    </div>
  );
}

function OnboardingGuide({
  busy,
  state,
  settingsModalOpen,
  onPreviousAction,
  onPrimaryAction,
  onSkip
}: {
  busy: boolean;
  state: OnboardingState | null;
  settingsModalOpen: boolean;
  onPreviousAction: () => void;
  onPrimaryAction: () => void;
  onSkip: () => void;
}) {
  const { t } = useI18n();
  if (!state || state.completedAt) return null;

  const currentIndex = Math.max(0, onboardingStepOrder.indexOf(state.currentStep));
  const progressLabel = t("onboarding.progress", { current: currentIndex + 1, total: onboardingStepOrder.length });
  const currentStep = state.currentStep;
  const actionDisabled = busy && (currentStep === "storyboard" || currentStep === "images" || currentStep === "videos");
  const canGoPrevious = currentIndex > 0;
  const actionLabelKey =
    currentStep === "settings" && settingsModalOpen
      ? "onboarding.step.settings.completeAction"
      : (`onboarding.step.${currentStep}.action` as I18nKey);
  const titleLabelKey =
    currentStep === "settings" && settingsModalOpen
      ? "onboarding.step.settings.confirmTitle"
      : (`onboarding.step.${currentStep}.title` as I18nKey);
  const bodyLabelKey =
    currentStep === "settings" && settingsModalOpen
      ? "onboarding.step.settings.confirmBody"
      : (`onboarding.step.${currentStep}.body` as I18nKey);
  const targetSelectorsByStep: Record<OnboardingStepId, string[]> = {
    settings: settingsModalOpen
      ? [".onboarding-settings-agent-group-target"]
      : [".workspace-more-trigger", ".rail-account", ".onboarding-settings-trigger"],
    hyperframes: [".onboarding-settings-hyperframes-group-target", ".onboarding-settings-local-agent-target"],
    create_project: [".onboarding-create-dialog-target", ".onboarding-create-project-target", ".project-card.create-card"],
    script: [".onboarding-script-anchor", ".onboarding-script-target", ".rich-text-pane"],
    storyboard: [".onboarding-storyboard-anchor", ".onboarding-storyboard-target", ".onboarding-workspace-tab-storyboard"],
    images: [".onboarding-storyboard-anchor", ".onboarding-storyboard-target", ".onboarding-workspace-tab-storyboard"],
    videos: [".onboarding-storyboard-anchor", ".onboarding-storyboard-target", ".onboarding-workspace-tab-storyboard"],
    preview: [".workspace-demo-trigger"],
    export: [".onboarding-assets-anchor", ".onboarding-assets-target", ".asset-browser-shell", ".onboarding-workspace-tab-assets"]
  };
  const spotlightSelectorsByStep: Record<OnboardingStepId, string[]> = {
    settings: settingsModalOpen
      ? [".onboarding-settings-agent-group-target"]
      : [".workspace-more-trigger", ".rail-account", ".onboarding-settings-trigger"],
    hyperframes: [".onboarding-settings-hyperframes-group-target", ".onboarding-settings-local-agent-target"],
    create_project: [".onboarding-create-dialog-target", ".onboarding-create-project-target", ".project-card.create-card"],
    script: [".onboarding-script-target", ".rich-text-pane"],
    storyboard: [".onboarding-storyboard-target", ".onboarding-workspace-tab-storyboard"],
    images: [".onboarding-storyboard-target", ".onboarding-workspace-tab-storyboard"],
    videos: [".onboarding-storyboard-target", ".onboarding-workspace-tab-storyboard"],
    preview: [".workspace-demo-trigger"],
    export: [".onboarding-assets-target", ".asset-browser-shell", ".onboarding-workspace-tab-assets"]
  };
  const placementByStep: Record<OnboardingStepId, Placement> = {
    settings: settingsModalOpen ? "left-start" : "left-start",
    hyperframes: "left-start",
    create_project: "right-start",
    script: "left-start",
    storyboard: "bottom-end",
    images: "bottom-end",
    videos: "bottom-end",
    preview: "bottom-end",
    export: "left-start"
  };
  const spotlightPaddingByStep: Record<OnboardingStepId, Step["spotlightPadding"]> = {
    settings: settingsModalOpen ? 8 : 8,
    hyperframes: { top: 8, right: 8, bottom: 8, left: 8 },
    create_project: { top: 8, right: 8, bottom: 8, left: 8 },
    script: { top: 8, right: 8, bottom: 8, left: 8 },
    storyboard: { top: 8, right: 8, bottom: 8, left: 8 },
    images: { top: 8, right: 8, bottom: 8, left: 8 },
    videos: { top: 8, right: 8, bottom: 8, left: 8 },
    preview: { top: 8, right: 8, bottom: 8, left: 8 },
    export: { top: 8, right: 8, bottom: 8, left: 8 }
  };

  const steps: Step[] = [
    {
      id: `${currentStep}-${settingsModalOpen ? "settings-open" : "settings-closed"}`,
      target: () => findOnboardingTarget(targetSelectorsByStep[currentStep]),
      spotlightTarget: () => findOnboardingTarget(spotlightSelectorsByStep[currentStep]),
      title: t(titleLabelKey),
      content: t(bodyLabelKey),
      placement: placementByStep[currentStep],
      skipBeacon: true,
      spotlightPadding: spotlightPaddingByStep[currentStep],
      spotlightRadius: currentStep === "settings" && !settingsModalOpen ? 12 : 10
    }
  ];

  function OnboardingTooltip({ step, tooltipProps }: TooltipRenderProps) {
    return (
      <section {...tooltipProps} className="onboarding-guide" aria-label={t("onboarding.title")}>
        <header className="onboarding-guide-header">
          <span className="onboarding-guide-kicker">{progressLabel}</span>
          <button className="onboarding-guide-skip" type="button" onClick={onSkip}>
            {t("onboarding.skip")}
          </button>
        </header>
        <div className="onboarding-guide-progress" aria-hidden="true">
          {onboardingStepOrder.map((stepId, index) => (
            <span
              className={cn("onboarding-guide-progress-dot", index < currentIndex && "done", index === currentIndex && "active")}
              key={stepId}
            />
          ))}
        </div>
        <div className="onboarding-guide-copy">
          <h2>{step.title}</h2>
          <p>{step.content}</p>
        </div>
        <div className={cn("onboarding-guide-actions", !canGoPrevious && "single")}>
          {canGoPrevious ? (
            <button className="onboarding-guide-action secondary" disabled={actionDisabled} type="button" onClick={onPreviousAction}>
              <ChevronLeft aria-hidden="true" />
              {t("onboarding.previous")}
            </button>
          ) : null}
          <button className="onboarding-guide-action primary" disabled={actionDisabled} type="button" onClick={onPrimaryAction}>
            {actionDisabled ? <LoaderCircle className="spinning" aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
            {t(actionLabelKey)}
          </button>
        </div>
      </section>
    );
  }

  return (
    <Joyride
      key={`${currentStep}-${settingsModalOpen ? "settings-open" : "settings-closed"}`}
      continuous
      run
      scrollToFirstStep
      steps={steps}
      tooltipComponent={OnboardingTooltip}
      floatingOptions={{
        flipOptions: { padding: 18 },
        hideArrow: true,
        shiftOptions: { padding: 18 },
        strategy: "fixed"
      }}
      options={{
        blockTargetInteraction: false,
        buttons: ["primary"],
        closeButtonAction: "skip",
        dismissKeyAction: false,
        offset: 14,
        overlayClickAction: false,
        overlayColor: "rgba(16, 19, 24, 0.48)",
        scrollDuration: 240,
        scrollOffset: 72,
        skipBeacon: true,
        targetWaitTimeout: 2400,
        width: 360,
        zIndex: onboardingGuideZIndex
      }}
      styles={{
        overlay: {
          backgroundColor: "rgba(16, 19, 24, 0.48)"
        },
        spotlight: {
          filter: "drop-shadow(0 16px 42px rgba(12, 15, 20, 0.22))",
          stroke: "rgba(255, 211, 90, 0.96)",
          strokeWidth: 2
        },
        tooltip: {
          backgroundColor: "transparent",
          borderRadius: 8,
          boxShadow: "none",
          padding: 0
        },
        tooltipContainer: {
          padding: 0
        },
        tooltipContent: {
          padding: 0
        },
        tooltipFooter: {
          display: "none"
        }
      }}
    />
  );
}

function ScreenConfirmationDialog({
  cancelDisabled = false,
  cancelLabel,
  confirmBusy = false,
  confirmDisabled = false,
  confirmLabel,
  confirmVariant = "danger",
  descriptions,
  dialogClassName,
  icon,
  idBase,
  isDismissable = true,
  isOpen,
  status = "danger",
  title,
  onClose,
  onConfirm
}: {
  cancelDisabled?: boolean;
  cancelLabel: string;
  confirmBusy?: boolean;
  confirmDisabled?: boolean;
  confirmLabel: string;
  confirmVariant?: ConfirmationDialogConfirmVariant;
  descriptions: string[];
  dialogClassName?: string;
  icon: React.ReactNode;
  idBase: string;
  isDismissable?: boolean;
  isOpen: boolean;
  status?: ConfirmationDialogStatus;
  title: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open && isDismissable) onClose();
      }}
    >
      <AlertDialog.Backdrop
        className="screen-confirmation-backdrop"
        isDismissable={isDismissable}
        isKeyboardDismissDisabled={!isDismissable}
        variant="blur"
      >
        <AlertDialog.Container className="screen-confirmation-container" placement="center" size="sm">
          <AlertDialog.Dialog
            aria-describedby={`${idBase}-description`}
            className={cn("hero-confirmation-dialog", dialogClassName)}
          >
            <AlertDialog.Header className="screen-confirmation-header">
              <AlertDialog.Icon className="screen-confirmation-icon" status={status} aria-hidden="true">
                {icon}
              </AlertDialog.Icon>
              <AlertDialog.Heading className="screen-confirmation-heading" id={`${idBase}-title`}>
                {title}
              </AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body className="screen-confirmation-body" id={`${idBase}-description`}>
              {descriptions.map((description) => (
                <p key={description}>{description}</p>
              ))}
            </AlertDialog.Body>
            <AlertDialog.Footer className="screen-confirmation-footer">
              <Button
                autoFocus
                className="screen-confirmation-cancel"
                isDisabled={cancelDisabled}
                size="sm"
                variant="tertiary"
                onPress={onClose}
              >
                {cancelLabel}
              </Button>
              <Button
                aria-busy={confirmBusy}
                className="screen-confirmation-confirm"
                isDisabled={confirmDisabled || confirmBusy}
                isPending={confirmBusy}
                size="sm"
                variant={confirmVariant}
                onPress={onConfirm}
              >
                {confirmBusy ? <LoaderCircle className="spinning" aria-hidden="true" /> : null}
                {confirmLabel}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  );
}

function ProjectActionConfirmationDialog({
  action,
  busy,
  onClose,
  onConfirm
}: {
  action: PendingProjectAction | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();

  if (!action) return null;

  const project = "project" in action ? action.project : null;
  const title =
    action.kind === "move-to-trash"
      ? t("project.moveToTrashConfirm", { name: project?.name ?? "" })
      : action.kind === "restore"
        ? t("trash.restoreConfirm", { name: project?.name ?? "" })
        : action.kind === "delete-forever"
          ? t("trash.deleteForeverConfirm", { name: project?.name ?? "" })
          : t("trash.emptyTrashConfirm");
  const description =
    action.kind === "move-to-trash"
      ? t("project.moveToTrashDescription")
      : action.kind === "restore"
        ? t("trash.restoreDescription")
        : action.kind === "delete-forever"
          ? t("trash.deleteForeverDescription")
          : t("trash.emptyTrashDescription", { count: String(action.projects.length) });
  const confirmLabel =
    action.kind === "move-to-trash"
      ? t("project.moveToTrash")
      : action.kind === "restore"
        ? t("trash.restore")
        : action.kind === "delete-forever"
          ? t("trash.deleteForever")
          : t("trash.emptyTrash");
  const icon = action.kind === "restore" ? <RotateCcw /> : action.kind === "move-to-trash" ? <Trash2 /> : <AlertTriangle />;
  const status: ConfirmationDialogStatus = action.kind === "restore" ? "success" : action.kind === "move-to-trash" ? "warning" : "danger";
  const confirmVariant: ConfirmationDialogConfirmVariant = action.kind === "restore" ? "primary" : "danger";
  const dialogClassName = action.kind === "restore" ? "project-restore-dialog" : undefined;
  const idBase = `project-${action.kind}-confirmation`;

  return (
    <ScreenConfirmationDialog
      cancelDisabled={busy}
      cancelLabel={t("common.cancel")}
      confirmBusy={busy}
      confirmDisabled={busy}
      confirmLabel={confirmLabel}
      confirmVariant={confirmVariant}
      descriptions={[description]}
      dialogClassName={dialogClassName}
      icon={icon}
      idBase={idBase}
      isDismissable={!busy}
      isOpen={Boolean(action)}
      status={status}
      title={title}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}

function TrashScreen({
  projects,
  onBack,
  onDelete,
  onEmptyTrash,
  onRestore
}: {
  projects: ProjectSummary[];
  onBack: () => void;
  onDelete: (project: ProjectSummary) => void;
  onEmptyTrash: (projects: ProjectSummary[]) => void;
  onRestore: (project: ProjectSummary) => void;
}) {
  const { t } = useI18n();

  return (
    <section className="screen trash-screen active" aria-label={t("trash.title")}>
      <header className="trash-page-header">
        <div>
          <h1>{t("trash.title")}</h1>
          <p>{t("trash.description")}</p>
        </div>
        <div className="trash-header-actions">
          {projects.length > 0 ? (
            <Button className="topbar-action-button trash-empty-button" variant="ghost" onPress={() => onEmptyTrash(projects)}>
              <Trash2 aria-hidden="true" />
              {t("trash.emptyTrash")}
            </Button>
          ) : null}
          <Button className="topbar-action-button" variant="ghost" onPress={onBack}>
            <Grid2X2 aria-hidden="true" />
            {t("trash.backToProjects")}
          </Button>
        </div>
      </header>

      {projects.length === 0 ? (
        <div className="trash-empty-state">
          <Trash2 aria-hidden="true" />
          <strong>{t("trash.emptyTitle")}</strong>
          <p>{t("trash.emptyDescription")}</p>
        </div>
      ) : (
        <div className="project-grid trash-project-grid" aria-label={t("trash.projectList")}>
          {projects.map((project) => (
            <TrashProjectCard
              key={project.id}
              project={project}
              onDelete={onDelete}
              onRestore={onRestore}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function TrashProjectCard({
  project,
  onDelete,
  onRestore
}: {
  project: ProjectSummary;
  onDelete: (project: ProjectSummary) => void;
  onRestore: (project: ProjectSummary) => void;
}) {
  const { t } = useI18n();
  const [actionsOpen, setActionsOpen] = useState(false);

  useEffect(() => {
    if (!actionsOpen) return;

    function closeOnOutsidePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".project-card-actions-trigger, .project-card-actions-popover")) return;
      setActionsOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setActionsOpen(false);
    }

    document.addEventListener("pointerdown", closeOnOutsidePointerDown, true);
    document.addEventListener("keydown", closeOnEscape, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointerDown, true);
      document.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [actionsOpen]);

  function restoreProject() {
    setActionsOpen(false);
    onRestore(project);
  }

  function deleteProjectForever() {
    setActionsOpen(false);
    onDelete(project);
  }

  return (
    <article className="project-card trash-card">
      <div className="folder-preview trash-folder-preview">
        <ProjectMarkIcon value={project.icon} className="project-card-project-icon" />
      </div>
      <strong>{project.name}</strong>
      <small>{t("trash.deletedAt", { date: formatProjectDate(project.deletedAt ?? project.updatedAt, t) })}</small>
      <Popover isOpen={actionsOpen} onOpenChange={setActionsOpen}>
        <Popover.Trigger>
          <Button
            aria-label={t("trash.actionsLabel", { name: project.name })}
            className={cn("project-card-actions-trigger", actionsOpen && "open")}
            variant="ghost"
          >
            <Ellipsis aria-hidden="true" />
          </Button>
        </Popover.Trigger>
        <Popover.Content className="project-card-actions-popover" isNonModal offset={8} placement="bottom end">
          <Popover.Dialog>
            <div className="project-card-actions-menu" aria-label={t("trash.actionsLabel", { name: project.name })}>
              <Button className="project-card-actions-menu-item" variant="ghost" onPress={restoreProject}>
                <RotateCcw aria-hidden="true" />
                <span>{t("trash.restore")}</span>
              </Button>
              <Button className="project-card-actions-menu-item destructive" variant="ghost" onPress={deleteProjectForever}>
                <Trash2 aria-hidden="true" />
                <span>{t("trash.deleteForever")}</span>
              </Button>
            </div>
          </Popover.Dialog>
        </Popover.Content>
      </Popover>
    </article>
  );
}

function AssetsScreen({
  projects,
  selectedProjectId,
  selectedProjectName,
  assets,
  dropText,
  onAssetDropNoticeChange,
  onChooseProjectAssets,
  onDeleteAssets,
  onImportAssetPaths,
  onRenameAsset,
  onSelectProject
}: {
  projects: ProjectSummary[];
  selectedProjectId: string;
  selectedProjectName: string;
  assets: ProjectAsset[];
  dropText: string;
  onAssetDropNoticeChange: (notice: AssetDropNotice) => void;
  onChooseProjectAssets: ChooseProjectAssetsHandler;
  onDeleteAssets: (assetIds: string[]) => Promise<void>;
  onImportAssetPaths: (filePaths: string[]) => void;
  onRenameAsset: (assetId: string, fileName: string) => void;
  onSelectProject: (projectId: string) => void;
}) {
  const { t } = useI18n();
  const [projectSearchQuery, setProjectSearchQuery] = useState("");
  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  const normalizedProjectSearchQuery = projectSearchQuery.trim().toLocaleLowerCase();
  const filteredProjects = normalizedProjectSearchQuery
    ? projects.filter((project) => `${project.name} ${project.id}`.toLocaleLowerCase().includes(normalizedProjectSearchQuery))
    : projects;

  const projectSelector = (
    <div className="asset-project-select compact">
      <span className="asset-project-select-label" id="asset-project-select-label">
        {t("assets.projectSelectorLabel")}
      </span>
      <HeroSelect
        aria-labelledby="asset-project-select-label"
        className="asset-project-picker"
        isDisabled={projects.length === 0}
        value={selectedProjectId || null}
        onChange={(key) => {
          if (!key) return;
          setProjectSearchQuery("");
          onSelectProject(String(key));
        }}
        onOpenChange={(isOpen) => {
          if (!isOpen) setProjectSearchQuery("");
        }}
      >
        <HeroSelect.Trigger className={cn("asset-project-trigger", projects.length === 0 && "disabled")}>
          <HeroSelect.Value className={cn("asset-project-value", !selectedProject && "placeholder")}>
            {selectedProjectName || t("assets.noProjects")}
          </HeroSelect.Value>
          <HeroSelect.Indicator>
            <ChevronDown aria-hidden="true" />
          </HeroSelect.Indicator>
        </HeroSelect.Trigger>
        <HeroSelect.Popover className="asset-project-popover" placement="bottom start">
          <div className="asset-project-search-panel">
            <label className="asset-project-search-control">
              <Search aria-hidden="true" />
              <input
                className="asset-project-search-input"
                type="search"
                value={projectSearchQuery}
                placeholder={t("assets.searchProjectPlaceholder")}
                onChange={(event) => setProjectSearchQuery(event.target.value)}
                onKeyDown={(event) => event.stopPropagation()}
              />
            </label>
          </div>
          <ListBox className="asset-project-listbox">
            {filteredProjects.map((project) => (
              <ListBoxItem className="asset-project-option" id={project.id} key={project.id} textValue={project.name}>
                <span className="asset-project-option-name">{project.name}</span>
                <span className={cn("asset-project-option-check", project.id === selectedProjectId && "visible")} aria-hidden="true">
                  <Check />
                </span>
              </ListBoxItem>
            ))}
          </ListBox>
          {filteredProjects.length === 0 ? <div className="asset-project-empty">{t("assets.noMatchingProjects")}</div> : null}
        </HeroSelect.Popover>
      </HeroSelect>
    </div>
  );

  return (
    <section className="screen assets-screen active" aria-label={t("assets.title")}>
      <header className="library-page-header asset-page-header">
        <div>
          <h1>{t("nav.assets")}</h1>
        </div>
        <div className="library-page-header-actions">{projectSelector}</div>
      </header>
      <AssetsPanel
        assets={assets}
        canImport={Boolean(selectedProjectName)}
        dropText={selectedProjectName ? dropText : t("assets.createProjectFirst")}
        projectId={selectedProjectId}
        projectName={selectedProjectName}
        scope="library"
        showHeading={false}
        onAssetDropNoticeChange={onAssetDropNoticeChange}
        onChooseProjectAssets={onChooseProjectAssets}
        onDeleteAssets={onDeleteAssets}
        onImportAssetPaths={onImportAssetPaths}
        onRenameAsset={onRenameAsset}
      />
    </section>
  );
}

function SkillsScreen({
  error,
  homeRequestId,
  loading,
  skills,
  onCreateSkill,
  onDeleteSkill,
  onReloadSkills,
  onUpdateSkill
}: {
  error: string | null;
  homeRequestId: number;
  loading: boolean;
  skills: Skill[];
  onCreateSkill: (input: CreateSkillInput) => Promise<Skill>;
  onDeleteSkill: (skillId: string) => Promise<Skill[]>;
  onReloadSkills: () => Promise<Skill[]>;
  onUpdateSkill: (input: UpdateSkillInput) => Promise<Skill>;
}) {
  const { t } = useI18n();
  const [skillView, setSkillView] = useState<"list" | "editor">("list");
  const [selectedSkillId, setSelectedSkillId] = useState("");
  const [activeFilter, setActiveFilter] = useState<SkillFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [draftIconId, setDraftIconId] = useState(defaultSkillIconId);
  const [draftGradientId, setDraftGradientId] = useState(defaultSkillGradientId);
  const [skillVisualPickerOpen, setSkillVisualPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingDeleteSkill, setPendingDeleteSkill] = useState<Skill | null>(null);
  const isCreating = selectedSkillId === "new";
  const selectedSkill = isCreating ? null : skills.find((skill) => skill.id === selectedSkillId) ?? null;
  const locked = Boolean(selectedSkill?.locked);
  const canSave = !locked && draftName.trim() && draftContent.trim() && !saving;
  const filteredSkills = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
    return skills.filter((skill) => {
      if (activeFilter === "system" && !skill.locked) return false;
      if (activeFilter === "user" && skill.locked) return false;
      if (!normalizedQuery) return true;
      return `${skill.name} ${skill.description}`.toLocaleLowerCase().includes(normalizedQuery);
    });
  }, [activeFilter, searchQuery, skills]);

  useEffect(() => {
    if (homeRequestId === 0) return;
    setSkillView("list");
    setPendingDeleteSkill(null);
    setSkillVisualPickerOpen(false);
  }, [homeRequestId]);

  useEffect(() => {
    if (skillView !== "editor" || selectedSkillId === "new" || !selectedSkillId) return;
    if (!skills.some((skill) => skill.id === selectedSkillId)) {
      setSkillView("list");
      setSelectedSkillId("");
    }
  }, [selectedSkillId, skillView, skills]);

  useEffect(() => {
    if (isCreating) {
      setDraftName("");
      setDraftDescription("");
      setDraftContent("");
      setDraftIconId(defaultSkillIconId);
      setDraftGradientId(getRandomSkillGradientId());
      return;
    }
    if (!selectedSkill) return;
    setDraftName(selectedSkill.name);
    setDraftDescription(selectedSkill.description);
    setDraftContent(selectedSkill.content);
    setDraftIconId(selectedSkill.iconId || (selectedSkill.locked ? defaultSystemSkillIconId : defaultSkillIconId));
    setDraftGradientId(selectedSkill.gradientId || (selectedSkill.locked ? defaultSystemSkillGradientId : defaultSkillGradientId));
  }, [isCreating, selectedSkill?.id]);

  function startCreateSkill() {
    setSelectedSkillId("new");
    setSkillView("editor");
    setPendingDeleteSkill(null);
    setSkillVisualPickerOpen(false);
  }

  function openSkill(skillId: string) {
    setSelectedSkillId(skillId);
    setSkillView("editor");
    setPendingDeleteSkill(null);
    setSkillVisualPickerOpen(false);
  }

  function returnToSkillList() {
    if (saving) return;
    setSkillView("list");
    setPendingDeleteSkill(null);
    setSkillVisualPickerOpen(false);
  }

  async function saveSkill() {
    if (!canSave) return;
    setSaving(true);
    try {
      if (isCreating) {
        const skill = await onCreateSkill({
          name: draftName,
          description: draftDescription,
          content: draftContent,
          iconId: draftIconId,
          gradientId: draftGradientId
        });
        setSelectedSkillId(skill.id);
      } else if (selectedSkill) {
        await onUpdateSkill({
          id: selectedSkill.id,
          name: draftName,
          description: draftDescription,
          content: draftContent,
          iconId: draftIconId,
          gradientId: draftGradientId
        });
      }
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteSkill() {
    if (!pendingDeleteSkill) return;
    setSaving(true);
    try {
      await onDeleteSkill(pendingDeleteSkill.id);
      setSelectedSkillId("");
      setSkillView("list");
      setPendingDeleteSkill(null);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  const editorTitle = isCreating ? t("skills.new") : selectedSkill?.name ?? t("skills.editTitle");

  if (skillView === "editor") {
    return (
      <section className="screen skills-screen skill-editor-screen active" aria-label={editorTitle}>
        <header className="page-hierarchy-topbar skills-editor-topbar">
          <PageHierarchyBreadcrumb
            ariaLabel={t("common.pageHierarchy")}
            className="skills-editor-breadcrumb"
            items={[
              { label: t("skills.title"), onPress: returnToSkillList, isDisabled: saving },
              { label: isCreating ? t("skills.new") : t("skills.editTitle") }
            ]}
          />
          {!locked ? (
            <Button className="skill-editor-create-button" isDisabled={!canSave || loading} variant="primary" onPress={() => void saveSkill()}>
              {saving ? <LoaderCircle className="spinning" aria-hidden="true" /> : null}
              {isCreating ? t("skills.create") : t("skills.save")}
            </Button>
          ) : null}
        </header>

        <div className="skill-form-page">
          {error ? (
            <div className="skill-editor-empty-state">
              <AlertTriangle aria-hidden="true" />
              <strong>{t("skills.loadFailed")}</strong>
              <p>{error}</p>
              <Button className="skill-save-action" isDisabled={loading} variant="outline" onPress={() => void onReloadSkills()}>
                {loading ? <LoaderCircle className="spinning" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
                {t("skills.retry")}
              </Button>
            </div>
          ) : !isCreating && !selectedSkill ? (
            <div className="skill-editor-empty-state">
              <Lightbulb aria-hidden="true" />
              <strong>{t("skills.noSkillsTitle")}</strong>
              <p>{t("skills.noSkillsDescription")}</p>
            </div>
          ) : (
            <div className="skill-form-shell">
              <div className="skill-visual-control">
                {locked ? (
                  <SkillVisualIcon className="skill-form-icon" iconId={draftIconId} gradientId={draftGradientId} />
                ) : (
                  <Popover isOpen={skillVisualPickerOpen} onOpenChange={setSkillVisualPickerOpen}>
                    <Popover.Trigger>
                      <button className="skill-visual-trigger" type="button" disabled={loading} aria-label={t("skills.visualPicker")}>
                        <SkillVisualIcon className="skill-form-icon" iconId={draftIconId} gradientId={draftGradientId} />
                      </button>
                    </Popover.Trigger>
                    <Popover.Content className="skill-visual-popover" offset={10} placement="bottom start">
                      <Popover.Dialog>
                        <div className="skill-visual-picker">
                          <section className="skill-visual-section" aria-label={t("skills.icon")}>
                            <span className="skill-visual-section-title">{t("skills.icon")}</span>
                            <div className="skill-icon-option-grid">
                              {skillIconDefinitions.map(({ Icon, id, label }) => (
                                <button
                                  className={cn("skill-icon-option", draftIconId === id && "selected")}
                                  key={id}
                                  type="button"
                                  title={label}
                                  aria-label={t("skills.iconOptionLabel", { name: label })}
                                  aria-pressed={draftIconId === id}
                                  onClick={() => setDraftIconId(id)}
                                >
                                  <Icon aria-hidden="true" />
                                </button>
                              ))}
                            </div>
                          </section>
                          <section className="skill-visual-section" aria-label={t("skills.background")}>
                            <span className="skill-visual-section-title">{t("skills.background")}</span>
                            <div className="skill-gradient-option-grid">
                              {skillGradientDefinitions.map((gradient) => (
                                <button
                                  className={cn("skill-gradient-option", draftGradientId === gradient.id && "selected")}
                                  key={gradient.id}
                                  type="button"
                                  title={gradient.label}
                                  aria-label={t("skills.gradientOptionLabel", { name: gradient.label })}
                                  aria-pressed={draftGradientId === gradient.id}
                                  style={getSkillVisualStyle(gradient.id)}
                                  onClick={() => setDraftGradientId(gradient.id)}
                                />
                              ))}
                            </div>
                          </section>
                        </div>
                      </Popover.Dialog>
                    </Popover.Content>
                  </Popover>
                )}
              </div>

              <div className="skill-form-fields-row">
                <div className="skill-form-field">
                  <span className="skill-form-label">{t("skills.name")}</span>
                  <Input
                    className="skill-form-input"
                    readOnly={locked || loading}
                    maxLength={40}
                    value={draftName}
                    placeholder={t("skills.namePlaceholder")}
                    onChange={(event) => setDraftName(event.target.value)}
                  />
                </div>
                <div className="skill-form-field">
                  <span className="skill-form-label">{t("skills.subtitle")}</span>
                  <Input
                    className="skill-form-input"
                    readOnly={locked || loading}
                    maxLength={60}
                    value={draftDescription}
                    placeholder={t("skills.descriptionPlaceholder")}
                    onChange={(event) => setDraftDescription(event.target.value)}
                  />
                </div>
              </div>

              <div className="skill-form-field skill-form-instruction-field">
                <div className="skill-instruction-card">
                  <span className="skill-form-label">{t("skills.instruction")}</span>
                  <TextArea
                    className="skill-form-textarea"
                    aria-label={t("skills.instruction")}
                    readOnly={locked || loading}
                    value={draftContent}
                    placeholder={t("skills.contentPlaceholder")}
                    spellCheck={false}
                    onChange={(event) => setDraftContent(event.target.value)}
                  />
                </div>
              </div>

              {locked || selectedSkill ? (
                <footer className="skill-form-footer">
                  {locked ? (
                    <span className="skill-lock-note">
                      <Lock aria-hidden="true" />
                      {t("skills.systemLocked")}
                    </span>
                  ) : (
                    <Button className="skill-delete-action" isDisabled={saving || loading} variant="outline" onPress={() => selectedSkill && setPendingDeleteSkill(selectedSkill)}>
                      <Trash2 aria-hidden="true" />
                      {t("skills.delete")}
                    </Button>
                  )}
                </footer>
              ) : null}
            </div>
          )}
        </div>

        <ScreenConfirmationDialog
          cancelDisabled={saving}
          cancelLabel={t("common.cancel")}
          confirmDisabled={saving}
          confirmLabel={t("skills.delete")}
          descriptions={[t("skills.deleteConfirmDescription")]}
          icon={<AlertTriangle />}
          idBase="skill-delete-confirmation"
          isDismissable={!saving}
          isOpen={Boolean(pendingDeleteSkill)}
          title={t("skills.deleteConfirmTitle", { name: pendingDeleteSkill?.name ?? "" })}
          onClose={() => {
            if (!saving) setPendingDeleteSkill(null);
          }}
          onConfirm={() => void confirmDeleteSkill()}
        />
      </section>
    );
  }

  return (
    <section className="screen skills-screen active" aria-label={t("skills.title")}>
      <header className="library-page-header skills-page-header">
        <div>
          <h1>{t("skills.title")}</h1>
        </div>
        <Button className="topbar-action-button skills-new-action" variant="ghost" isDisabled={loading} onPress={startCreateSkill}>
          <Plus aria-hidden="true" />
          {t("skills.new")}
        </Button>
      </header>

      <div className="skills-library">
        <div className="skills-toolbar">
          <div className="skills-filter-tabs" role="tablist" aria-label={t("skills.filterLabel")}>
            {([
              ["all", t("skills.filter.all")],
              ["system", t("skills.filter.system")],
              ["user", t("skills.filter.user")]
            ] as Array<[SkillFilter, string]>).map(([filter, label]) => (
              <button className={cn("skills-filter-tab", activeFilter === filter && "active")} key={filter} type="button" role="tab" aria-selected={activeFilter === filter} onClick={() => setActiveFilter(filter)}>
                {label}
              </button>
            ))}
          </div>
          <label className="skills-search-field">
            <Search aria-hidden="true" />
            <input type="search" value={searchQuery} placeholder={t("skills.searchPlaceholder")} aria-label={t("skills.searchPlaceholder")} onChange={(event) => setSearchQuery(event.target.value)} />
          </label>
        </div>

        {loading ? (
          <div className="skills-loading-note">
            <LoaderCircle className="spinning" aria-hidden="true" />
            <span>{t("skills.loading")}</span>
          </div>
        ) : null}

        {error ? (
          <div className="skill-editor-empty-state skills-library-message">
            <AlertTriangle aria-hidden="true" />
            <strong>{t("skills.loadFailed")}</strong>
            <p>{error}</p>
            <Button className="skill-save-action" isDisabled={loading} variant="outline" onPress={() => void onReloadSkills()}>
              {loading ? <LoaderCircle className="spinning" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
              {t("skills.retry")}
            </Button>
          </div>
        ) : !loading && skills.length === 0 ? (
          <div className="skill-editor-empty-state skills-library-message">
            <Lightbulb aria-hidden="true" />
            <strong>{t("skills.noSkillsTitle")}</strong>
            <p>{t("skills.noSkillsDescription")}</p>
          </div>
        ) : filteredSkills.length === 0 ? (
          <div className="skill-editor-empty-state skills-library-message">
            <Search aria-hidden="true" />
            <strong>{t("skills.emptyFilteredTitle")}</strong>
            {searchQuery.trim() ? <p>{t("skills.emptyFilteredDescription", { query: searchQuery.trim() })}</p> : null}
          </div>
        ) : (
          <div className="skills-card-grid" aria-label={t("skills.cardGridLabel")}>
            {filteredSkills.map((skill) => (
              <SkillCard key={skill.id} skill={skill} onSelect={openSkill} />
            ))}
          </div>
        )}

      </div>

      <ScreenConfirmationDialog
        cancelDisabled={saving}
        cancelLabel={t("common.cancel")}
        confirmDisabled={saving}
        confirmLabel={t("skills.delete")}
        descriptions={[t("skills.deleteConfirmDescription")]}
        icon={<AlertTriangle />}
        idBase="skill-delete-confirmation"
        isDismissable={!saving}
        isOpen={Boolean(pendingDeleteSkill)}
        title={t("skills.deleteConfirmTitle", { name: pendingDeleteSkill?.name ?? "" })}
        onClose={() => {
          if (!saving) setPendingDeleteSkill(null);
        }}
        onConfirm={() => void confirmDeleteSkill()}
      />
    </section>
  );
}

function SkillCard({
  className,
  disabled = false,
  saving = false,
  selected = false,
  skill,
  onSelect
}: {
  className?: string;
  disabled?: boolean;
  saving?: boolean;
  selected?: boolean;
  skill: Skill;
  onSelect: (skillId: string) => void;
}) {
  const { t } = useI18n();
  const description = skill.description || (skill.locked ? t("skills.locked") : t("skills.user"));
  const isDisabled = disabled || saving;

  return (
    <button
      className={cn("skill-card", skill.locked && "system", selected && "selected", saving && "saving", className)}
      type="button"
      disabled={isDisabled}
      aria-pressed={selected || undefined}
      onClick={() => onSelect(skill.id)}
    >
      <span className="skill-card-heading">
        <SkillVisualIcon className="skill-card-icon" iconId={skill.iconId} gradientId={skill.gradientId} />
        <strong className="skill-card-title">{skill.name}</strong>
      </span>
      <span className="skill-card-description">{description}</span>
      {saving ? (
        <span className="skill-card-status" aria-hidden="true">
          <LoaderCircle className="spinning" aria-hidden="true" />
        </span>
      ) : selected ? (
        <span className="skill-card-status selected" aria-hidden="true">
          <Check aria-hidden="true" />
        </span>
      ) : null}
    </button>
  );
}

function TasteScreen({
  defaultTasteId,
  error,
  loading,
  tastes,
  onSetDefaultTaste,
  onReload
}: {
  defaultTasteId: string;
  error: string | null;
  loading: boolean;
  tastes: Taste[];
  onSetDefaultTaste: (tasteId: string) => void;
  onReload: () => void;
}) {
  const { t } = useI18n();
  const orderedTastes = useMemo(() => orderTastesWithPinnedDefault(tastes, defaultTasteId), [defaultTasteId, tastes]);
  const [previewTasteId, setPreviewTasteId] = useState<string | null>(null);
  const [defaultNoticeTasteId, setDefaultNoticeTasteId] = useState<string | null>(null);
  const previewTaste = previewTasteId ? orderedTastes.find((taste) => taste.id === previewTasteId) ?? null : null;

  useEffect(() => {
    if (!previewTasteId) return;
    if (!orderedTastes.some((taste) => taste.id === previewTasteId)) setPreviewTasteId(null);
  }, [orderedTastes, previewTasteId]);

  useEffect(() => {
    if (!defaultNoticeTasteId) return undefined;
    const timer = window.setTimeout(() => setDefaultNoticeTasteId(null), 2400);
    return () => window.clearTimeout(timer);
  }, [defaultNoticeTasteId]);

  function setDefaultTaste(tasteId: string) {
    onSetDefaultTaste(tasteId);
    setPreviewTasteId(null);
    setDefaultNoticeTasteId(tasteId);
  }

  return (
    <section className="screen taste-screen active" aria-label={t("taste.libraryTitle")}>
      <header className="library-page-header skills-page-header">
        <div>
          <h1>{t("taste.libraryTitle")}</h1>
        </div>
      </header>
      <TasteLibraryPanel
        defaultNoticeTasteId={defaultNoticeTasteId}
        defaultTasteId={defaultTasteId}
        error={error}
        loading={loading}
        previewTaste={previewTaste}
        tastes={orderedTastes}
        onPreviewTaste={setPreviewTasteId}
        onReload={onReload}
        onSetDefaultTaste={setDefaultTaste}
      />
    </section>
  );
}

function TasteLibraryPanel({
  defaultNoticeTasteId,
  defaultTasteId,
  error,
  loading,
  previewTaste,
  tastes,
  onPreviewTaste,
  onSetDefaultTaste,
  onReload
}: {
  defaultNoticeTasteId: string | null;
  defaultTasteId: string;
  error: string | null;
  loading: boolean;
  previewTaste: Taste | null;
  tastes: Taste[];
  onPreviewTaste: (tasteId: string | null) => void;
  onSetDefaultTaste: (tasteId: string) => void;
  onReload: () => void;
}) {
  const { locale, t } = useI18n();
  const defaultNoticeTaste = defaultNoticeTasteId ? tastes.find((taste) => taste.id === defaultNoticeTasteId) : null;

  return (
    <section className="skills-library taste-library-panel" aria-label={t("taste.libraryTitle")}>
      {loading ? (
        <div className="skills-loading-note">
          <LoaderCircle className="spinning" aria-hidden="true" />
          <span>{t("taste.loading")}</span>
        </div>
      ) : null}
      {error ? (
        <div className="skill-editor-empty-state skills-library-message">
          <AlertTriangle aria-hidden="true" />
          <strong>{t("skills.loadFailed")}</strong>
          <p>{error}</p>
          <Button className="skill-save-action" isDisabled={loading} variant="outline" onPress={onReload}>
            {loading ? <LoaderCircle className="spinning" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
            {t("taste.reload")}
          </Button>
        </div>
      ) : (
        <>
          {defaultNoticeTaste ? (
            <div className="taste-default-notice" role="status" aria-live="polite">
              <CircleCheck aria-hidden="true" />
              <span>{t("taste.defaultSaved", { name: getLocalizedTasteName(defaultNoticeTaste, locale) })}</span>
            </div>
          ) : null}
          <TasteCardGrid
            className="taste-card-grid-library"
            defaultTasteId={defaultTasteId}
            tastes={tastes}
            onPreview={onPreviewTaste}
          />
          <TastePreviewDialog
            defaultTasteId={defaultTasteId}
            taste={previewTaste}
            onClose={() => onPreviewTaste(null)}
            onSetDefaultTaste={onSetDefaultTaste}
          />
        </>
      )}
    </section>
  );
}

function TastePreviewDialog({
  defaultTasteId,
  taste,
  onClose,
  onSetDefaultTaste
}: {
  defaultTasteId: string;
  taste: Taste | null;
  onClose: () => void;
  onSetDefaultTaste: (tasteId: string) => void;
}) {
  const { locale, t } = useI18n();
  const language = getTasteVideoLanguageForLocale(locale);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const media = taste ? getTasteMediaAssets(taste) : null;
  const videoUrl = media?.videos[language] || "";
  const posterUrl = media?.posters[language] || media?.image || "";

  useEffect(() => {
    if (!taste) return undefined;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, taste]);

  useEffect(() => {
    if (!taste || !videoUrl) return undefined;
    const video = videoRef.current;
    if (!video) return undefined;
    const currentVideo = video;

    currentVideo.autoplay = true;
    currentVideo.muted = true;

    function playLoadedVideo() {
      if (currentVideo.readyState < 2) return;
      void currentVideo.play().catch(() => undefined);
    }

    playLoadedVideo();

    if (currentVideo.readyState >= 2) {
      return undefined;
    }

    currentVideo.addEventListener("loadeddata", playLoadedVideo, { once: true });
    currentVideo.addEventListener("canplay", playLoadedVideo, { once: true });
    return () => {
      currentVideo.removeEventListener("loadeddata", playLoadedVideo);
      currentVideo.removeEventListener("canplay", playLoadedVideo);
    };
  }, [language, taste, videoUrl]);

  if (!taste || typeof document === "undefined") return null;

  const tasteName = getLocalizedTasteName(taste, locale);
  const isDefault = taste.id === defaultTasteId;

  return createPortal(
    <div
      className="taste-preview-dialog-layer"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="taste-preview-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="taste-preview-dialog-title"
        aria-describedby="taste-preview-dialog-description"
      >
        <div className="taste-preview-dialog-media">
          {videoUrl ? (
            <video ref={videoRef} key={`${taste.id}-${language}`} src={videoUrl} poster={posterUrl || undefined} controls autoPlay muted playsInline preload="auto" />
          ) : posterUrl ? (
            <img src={posterUrl} alt="" loading="eager" decoding="async" />
          ) : (
            <div className="taste-preview-dialog-empty" style={{ background: taste.preview.background, color: taste.preview.foreground }}>
              <Palette aria-hidden="true" />
            </div>
          )}
        </div>
        <div className="taste-preview-dialog-copy">
          <div>
            <span className="taste-preview-kicker">{t("taste.previewTitle")}</span>
            <h2 id="taste-preview-dialog-title">{tasteName}</h2>
          </div>
          <p id="taste-preview-dialog-description">{taste.description}</p>
        </div>
        <footer className="taste-preview-dialog-actions">
          <Button className="project-delete-cancel" variant="outline" onPress={onClose}>
            {t("common.close")}
          </Button>
          <Button className="project-delete-confirm taste-preview-default-action" isDisabled={isDefault} variant="primary" onPress={() => onSetDefaultTaste(taste.id)}>
            {isDefault ? t("taste.defaultCurrent") : t("taste.setDefault")}
          </Button>
        </footer>
      </section>
    </div>,
    document.body
  );
}

function ProjectDialog({
  busy = false,
  defaultTasteId,
  mode,
  name,
  icon,
  imageRatio,
  templateId,
  skillId,
  tasteId,
  projectMarkOptions,
  templateOptions,
  skillDrawerOpen,
  skills,
  tastes,
  tastesError,
  tastesLoading,
  skillsError,
  skillsLoading,
  tasteDrawerOpen,
  ready,
  onClose,
  onNameChange,
  onIconChange,
  onImageRatioChange,
  onTemplateChange,
  onSkillChange,
  onTasteChange,
  onOpenSkillDrawer,
  onCloseSkillDrawer,
  onOpenTasteDrawer,
  onCloseTasteDrawer,
  onReloadSkills,
  onReloadTastes,
  onSubmit
}: {
  busy?: boolean;
  defaultTasteId: string;
  mode: ProjectDialogMode;
  name: string;
  icon: string;
  imageRatio: ImageRatio;
  templateId: string;
  skillId: string;
  tasteId: string;
  projectMarkOptions: SelectOption[];
  templateOptions: SelectOption[];
  skillDrawerOpen: boolean;
  skills: Skill[];
  tastes: Taste[];
  tastesError: string | null;
  tastesLoading: boolean;
  skillsError: string | null;
  skillsLoading: boolean;
  tasteDrawerOpen: boolean;
  ready: boolean;
  onClose: () => void;
  onNameChange: (value: string) => void;
  onIconChange: (value: string) => void;
  onImageRatioChange: (value: ImageRatio) => void;
  onTemplateChange: (value: string) => void;
  onSkillChange: (value: string) => void;
  onTasteChange: (value: string) => void;
  onOpenSkillDrawer: () => void;
  onCloseSkillDrawer: () => void;
  onOpenTasteDrawer: () => void;
  onCloseTasteDrawer: () => void;
  onReloadSkills: () => void;
  onReloadTastes: () => void;
  onSubmit: () => void;
}) {
  const { t } = useI18n();
  const isCreateMode = mode === "create";

  return (
    <CreateModal closeDisabled={busy} title={t(isCreateMode ? "project.createTitle" : "project.editProject")} onClose={onClose}>
      <TextField
        label={t("project.name")}
        required
        placeholder={t("project.namePlaceholder")}
        value={name}
        onChange={(event) => onNameChange(event.target.value)}
      />
      <div className="create-project-field-grid">
        <SelectField
          className="project-dialog-choice-field"
          display="icon-grid"
          label={t("project.mark")}
          value={icon}
          options={projectMarkOptions}
          placeholder={t("common.select")}
          onValueChange={onIconChange}
        />
        <SelectField
          className="project-dialog-choice-field"
          label={t("project.storyboardLayout")}
          value={templateId}
          options={templateOptions}
          onValueChange={onTemplateChange}
        />
      </div>
      <ProjectAspectRatioPicker disabled={busy} value={imageRatio} onChange={onImageRatioChange} />
      <div className="project-dialog-settings-grid">
        <ProjectSkillPicker
          drawerOpen={skillDrawerOpen}
          error={skillsError}
          loading={skillsLoading}
          selectedSkillId={skillId}
          skills={skills}
          onCloseDrawer={onCloseSkillDrawer}
          onOpenDrawer={onOpenSkillDrawer}
          onReload={onReloadSkills}
          onSelect={onSkillChange}
        />
        <CreateProjectTastePicker
          defaultTasteId={defaultTasteId}
          drawerOpen={tasteDrawerOpen}
          error={tastesError}
          loading={tastesLoading}
          selectedTasteId={tasteId}
          tastes={tastes.length > 0 ? tastes : [getFallbackDefaultTaste()]}
          onCloseDrawer={onCloseTasteDrawer}
          onOpenDrawer={onOpenTasteDrawer}
          onReload={onReloadTastes}
          onSelect={onTasteChange}
        />
      </div>
      <div className="create-project-modal-actions">
        <Button
          aria-busy={busy}
          className="create-project-primary-action"
          isDisabled={!ready || busy}
          isPending={busy}
          onPress={onSubmit}
          variant="primary"
        >
          {busy ? <LoaderCircle className="spinning" aria-hidden="true" /> : null}
          {t(isCreateMode ? "common.create" : "common.save")}
        </Button>
        <Button className="create-project-secondary-action" isDisabled={busy} variant="outline" onPress={onClose}>
          {t("common.cancel")}
        </Button>
      </div>
    </CreateModal>
  );
}

function ProjectAspectRatioPicker({ disabled, value, onChange }: { disabled: boolean; value: ImageRatio; onChange: (value: ImageRatio) => void }) {
  const { t } = useI18n();

  return (
    <div className="project-aspect-ratio-field">
      <span className="project-aspect-ratio-label">{t("project.imageRatio")}</span>
      <div className="project-aspect-ratio-options" role="radiogroup" aria-label={t("project.imageRatio")}>
        {imageRatioOptions.map((option) => (
          <button
            className={cn("project-aspect-ratio-option", value === option.value && "selected")}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            disabled={disabled}
            key={option.value}
            onClick={() => onChange(option.value)}
          >
            <AspectRatioIcon ratio={option.value} />
            <span>{option.label}</span>
            {value === option.value ? <Check aria-hidden="true" /> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

function ProjectSkillPicker({
  drawerOpen,
  error,
  loading,
  selectedSkillId,
  skills,
  onCloseDrawer,
  onOpenDrawer,
  onReload,
  onSelect
}: {
  drawerOpen: boolean;
  error: string | null;
  loading: boolean;
  selectedSkillId: string;
  skills: Skill[];
  onCloseDrawer: () => void;
  onOpenDrawer: () => void;
  onReload: () => void;
  onSelect: (skillId: string) => void;
}) {
  const { locale, t } = useI18n();
  const selectableSkills = getSelectableProjectSkills(skills, t, locale);
  const selectedSkill = resolveSelectedProjectSkill(skills, selectedSkillId, t, loading, locale);

  function selectSkill(nextSkillId: string) {
    onSelect(nextSkillId);
    onCloseDrawer();
  }

  return (
    <div className="project-setting-section">
      <ProjectSettingHeading label={t("project.skill")} description={t("project.skillDescription")} />
      {error ? <p className="create-project-taste-error">{error}</p> : null}
      {loading ? (
        <p className="create-project-taste-status">
          <LoaderCircle className="spinning" aria-hidden="true" />
          {t("skills.loading")}
        </p>
      ) : null}
      <ProjectSkillSummaryCard skill={selectedSkill} onOpen={onOpenDrawer} />
      <ProjectSkillSelectionDrawer
        currentSkillId={selectedSkill.id}
        error={error}
        isOpen={drawerOpen}
        loading={loading}
        skills={selectableSkills}
        onClose={onCloseDrawer}
        onReload={onReload}
        onSelect={selectSkill}
      />
    </div>
  );
}

function ProjectSettingHeading({ label, description }: { label: string; description: string }) {
  return (
    <div className="project-setting-heading">
      <span className="project-setting-heading-title">
        {label}
        <span className="project-setting-info" tabIndex={0} aria-label={description} data-tooltip={description}>
          <HelpCircle aria-hidden="true" />
        </span>
      </span>
    </div>
  );
}

function ProjectSkillSummaryCard({ skill, onOpen }: { skill: Skill; onOpen: () => void }) {
  const { t } = useI18n();
  const description = skill.description || (skill.locked ? t("skills.locked") : t("skills.user"));

  return (
    <button className="project-setting-summary-card skill" type="button" onClick={onOpen}>
      <span className="project-setting-summary-main">
        <SkillVisualIcon className="project-setting-summary-icon" iconId={skill.iconId} gradientId={skill.gradientId} />
        <span className="project-setting-summary-copy">
          <strong>{skill.name}</strong>
          <small>{description}</small>
        </span>
      </span>
      <span className="project-setting-summary-action">
        <Grid2X2 aria-hidden="true" />
        {t("taste.browseAll")}
      </span>
    </button>
  );
}

function ProjectTasteSummaryCard({ taste, onOpen }: { taste: Taste; onOpen: () => void }) {
  const { locale, t } = useI18n();
  const tasteName = getLocalizedTasteName(taste, locale);
  const previewImageUrl = getTastePreviewImageUrl(taste);

  return (
    <button className="project-setting-summary-card taste" type="button" onClick={onOpen}>
      <span className="project-setting-summary-main">
        <span className="project-setting-taste-preview" style={{ background: taste.preview.background }} aria-hidden="true">
          {previewImageUrl ? <img src={previewImageUrl} alt="" loading="lazy" decoding="async" /> : null}
          <span style={{ background: taste.preview.accent }} />
        </span>
        <span className="project-setting-summary-copy">
          <strong>{tasteName}</strong>
          {taste.description ? <small>{taste.description}</small> : null}
        </span>
      </span>
      <span className="project-setting-summary-action">
        <Grid2X2 aria-hidden="true" />
        {t("taste.browseAll")}
      </span>
    </button>
  );
}

function ProjectSkillSelectionDrawer({
  currentSkillId,
  error,
  isOpen,
  loading,
  savingSkillId,
  skills,
  onClose,
  onReload,
  onSelect
}: {
  currentSkillId: string;
  error: string | null;
  isOpen: boolean;
  loading: boolean;
  savingSkillId?: string | null;
  skills: Skill[];
  onClose: () => void;
  onReload: () => void;
  onSelect: (skillId: string) => void;
}) {
  const { t } = useI18n();

  useEffect(() => {
    if (!isOpen) return undefined;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !savingSkillId) onClose();
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isOpen, onClose, savingSkillId]);

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="taste-selection-drawer-layer"
      onMouseDown={(event) => {
        if (!savingSkillId && event.target === event.currentTarget) onClose();
      }}
    >
      <aside className="taste-selection-drawer project-skill-selection-drawer" role="dialog" aria-modal="true" aria-labelledby="project-skill-selection-title">
        <header className="storyboard-asset-drawer-header">
          <div>
            <h2 className="storyboard-asset-drawer-title" id="project-skill-selection-title">
              {t("project.skill")}
            </h2>
            <p>{t("project.skillDrawerDescription")}</p>
          </div>
          <button className="storyboard-asset-drawer-close" type="button" aria-label={t("common.close")} disabled={Boolean(savingSkillId)} onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>
        <div className="taste-selection-drawer-body">
          {error ? (
            <div className="storyboard-skill-dialog-error">
              <span>{error}</span>
              <button type="button" disabled={loading} onClick={onReload}>
                {t("storyboard.reloadSkills")}
              </button>
            </div>
          ) : null}
          {loading && skills.length === 0 ? (
            <div className="storyboard-skill-loading">
              <LoaderCircle className="spinning" aria-hidden="true" />
              <span>{t("skills.loading")}</span>
            </div>
          ) : null}
          {!loading && skills.length === 0 && !error ? <p className="storyboard-skill-empty">{t("storyboard.skillEmpty")}</p> : null}
          <div className="skills-card-grid project-skill-card-grid" aria-label={t("storyboard.skillList")}>
            {skills.map((skill) => (
              <SkillCard
                key={skill.id}
                skill={skill}
                selected={skill.id === currentSkillId}
                saving={savingSkillId === skill.id}
                disabled={Boolean(savingSkillId) || skill.id === currentSkillId}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
      </aside>
    </div>,
    document.body
  );
}

function CreateProjectTastePicker({
  defaultTasteId,
  drawerOpen,
  error,
  loading,
  selectedTasteId,
  tastes,
  onCloseDrawer,
  onOpenDrawer,
  onReload,
  onSelect
}: {
  defaultTasteId: string;
  drawerOpen: boolean;
  error: string | null;
  loading: boolean;
  selectedTasteId: string;
  tastes: Taste[];
  onCloseDrawer: () => void;
  onOpenDrawer: () => void;
  onReload: () => void;
  onSelect: (tasteId: string) => void;
}) {
  const { t } = useI18n();
  const selectedTaste = resolveSelectedTaste(tastes, selectedTasteId);

  function selectTaste(nextTasteId: string) {
    onSelect(nextTasteId);
    onCloseDrawer();
  }

  return (
    <div className="project-setting-section">
      <ProjectSettingHeading label={t("taste.projectTaste")} description={t("taste.projectTasteDescription")} />
      {error ? <p className="create-project-taste-error">{error}</p> : null}
      {loading ? (
        <p className="create-project-taste-status">
          <LoaderCircle className="spinning" aria-hidden="true" />
          {t("taste.loading")}
        </p>
      ) : null}
      <ProjectTasteSummaryCard taste={selectedTaste} onOpen={onOpenDrawer} />
      <TasteSelectionDrawer
        currentTasteId={selectedTaste.id}
        defaultTasteId={defaultTasteId}
        error={error}
        isOpen={drawerOpen}
        loading={loading}
        tastes={tastes}
        onClose={onCloseDrawer}
        onReload={onReload}
        onSelect={selectTaste}
      />
    </div>
  );
}

function TasteSelectionDrawer({
  currentTasteId,
  defaultTasteId,
  error,
  isOpen,
  loading,
  savingTasteId,
  tastes,
  onClose,
  onReload,
  onSelect
}: {
  currentTasteId: string;
  defaultTasteId?: string;
  error: string | null;
  isOpen: boolean;
  loading: boolean;
  savingTasteId?: string | null;
  tastes: Taste[];
  onClose: () => void;
  onReload: () => void;
  onSelect: (tasteId: string) => void;
}) {
  const { t } = useI18n();

  useEffect(() => {
    if (!isOpen) return undefined;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !savingTasteId) onClose();
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isOpen, onClose, savingTasteId]);

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="taste-selection-drawer-layer"
      onMouseDown={(event) => {
        if (!savingTasteId && event.target === event.currentTarget) onClose();
      }}
    >
      <aside className="taste-selection-drawer" role="dialog" aria-modal="true" aria-labelledby="taste-selection-drawer-title">
        <header className="storyboard-asset-drawer-header">
          <div>
            <h2 className="storyboard-asset-drawer-title" id="taste-selection-drawer-title">
              {t("taste.dialogTitle")}
            </h2>
            <p>{t("taste.drawerDescription")}</p>
          </div>
          <button className="storyboard-asset-drawer-close" type="button" aria-label={t("common.close")} disabled={Boolean(savingTasteId)} onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>
        <div className="taste-selection-drawer-body">
          {error ? (
            <div className="storyboard-skill-dialog-error">
              <span>{error}</span>
              <button type="button" disabled={loading} onClick={onReload}>
                {t("taste.reload")}
              </button>
            </div>
          ) : null}
          {loading && tastes.length === 0 ? (
            <div className="storyboard-skill-loading">
              <LoaderCircle className="spinning" aria-hidden="true" />
              <span>{t("taste.loading")}</span>
            </div>
          ) : null}
          <TasteCardGrid
            className="taste-card-grid-drawer"
            defaultTasteId={defaultTasteId}
            selectedTasteId={currentTasteId}
            savingTasteId={savingTasteId}
            tastes={tastes}
            onSelect={onSelect}
          />
        </div>
      </aside>
    </div>,
    document.body
  );
}

function TasteCardGrid({
  className,
  compact = false,
  defaultTasteId,
  previewTasteId,
  selectedTasteId,
  savingTasteId,
  tastes,
  onPreview,
  onSelect
}: {
  className?: string;
  compact?: boolean;
  defaultTasteId?: string;
  previewTasteId?: string;
  selectedTasteId?: string;
  savingTasteId?: string | null;
  tastes: Taste[];
  onPreview?: (tasteId: string) => void;
  onSelect?: (tasteId: string) => void;
}) {
  const { t } = useI18n();
  const orderedTastes = orderTastesWithPinnedDefault(tastes, defaultTasteId);

  return (
    <div className={cn("taste-card-grid", compact && "compact", className)} aria-label={t("taste.cardGridLabel")}>
      {orderedTastes.map((taste) => (
        <TastePreviewCard
          compact={compact}
          defaultTaste={taste.id === defaultTasteId}
          key={taste.id}
          previewing={taste.id === previewTasteId}
          selected={taste.id === selectedTasteId}
          saving={taste.id === savingTasteId}
          taste={taste}
          onPreview={onPreview}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function resolveSelectedTaste(tastes: Taste[], selectedTasteId: string) {
  return tastes.find((taste) => taste.id === selectedTasteId) ?? tastes[0] ?? getFallbackDefaultTaste();
}

function TastePreviewCard({
  className,
  compact = false,
  defaultTaste = false,
  previewing = false,
  selected = false,
  saving = false,
  taste,
  onPreview,
  onSelect
}: {
  className?: string;
  compact?: boolean;
  defaultTaste?: boolean;
  previewing?: boolean;
  selected?: boolean;
  saving?: boolean;
  taste: Taste;
  onPreview?: (tasteId: string) => void;
  onSelect?: (tasteId: string) => void;
}) {
  const { locale, t } = useI18n();
  const tasteName = getLocalizedTasteName(taste, locale);
  const content = <TasteCardContent defaultTaste={defaultTaste} saving={saving} selected={selected} taste={taste} />;
  const cardClassName = cn("taste-card", compact && "compact", previewing && "previewing", selected && "selected", defaultTaste && "default", className);

  if (onSelect || onPreview) {
    return (
      <button
        className={cardClassName}
        type="button"
        aria-label={onPreview && !onSelect ? t("taste.previewStyle", { name: tasteName }) : undefined}
        aria-pressed={onSelect ? selected : undefined}
        onClick={() => (onSelect ? onSelect(taste.id) : onPreview?.(taste.id))}
      >
        {content}
      </button>
    );
  }

  return (
    <article className={cardClassName}>
      {content}
    </article>
  );
}

function TasteCardContent({
  defaultTaste = false,
  selected = false,
  saving = false,
  taste
}: {
  defaultTaste?: boolean;
  selected?: boolean;
  saving?: boolean;
  taste: Taste;
}) {
  const { locale, t } = useI18n();
  const tasteName = getLocalizedTasteName(taste, locale);
  const previewImageUrl = getTastePreviewImageUrl(taste);

  return (
    <>
      <div className={cn("taste-card-preview", previewImageUrl && "has-image")} style={{ background: taste.preview.background, color: taste.preview.foreground }}>
        {previewImageUrl ? (
          <img className="taste-card-preview-image" src={previewImageUrl} alt="" loading="lazy" decoding="async" />
        ) : (
          <>
            <span className="taste-card-accent" style={{ background: taste.preview.accent }} aria-hidden="true" />
            <strong>{tasteName}</strong>
            <small>{t("taste.cardLabel")}</small>
          </>
        )}
      </div>
      <div className="taste-card-copy">
        <strong>{tasteName}</strong>
        {defaultTaste ? <small>{t("taste.defaultBadge")}</small> : null}
      </div>
      {saving ? (
        <span className="taste-card-status" aria-label={t("taste.saving")}>
          <LoaderCircle className="spinning" aria-hidden="true" />
        </span>
      ) : selected ? (
        <span className="taste-card-status selected" aria-label={t("taste.selected")}>
          <Check aria-hidden="true" />
        </span>
      ) : null}
    </>
  );
}

function CodexAuthorizationDialog({
  codexStatus,
  localCliAgents,
  localCliScanBusy,
  selectedCliId,
  interfaceLanguage,
  appearanceMode,
  hyperframesVideoResolution,
  seedanceVideoResolution,
  hyperframesVideoConcurrency,
  cliTestBusy,
  cliTestResult,
  appVersion,
  desktopVersionCheck,
  desktopVersionCheckBusy,
  desktopVersionCheckError,
  initialSection,
  onClose,
  onCheckDesktopVersion,
  onOpenExternal,
  onRefreshSelectedCliStatus,
  onRefreshLocalCliAgents,
  onSelectCli,
  byokSettings,
  companionStatus,
  byokNotice,
  onClearByokNotice,
  onByokSettingsChange,
  onCompanionStatusChange,
  onInterfaceLanguageChange,
  onAppearanceModeChange,
  onHyperframesVideoResolutionChange,
  onSeedanceVideoResolutionChange,
  onHyperframesVideoConcurrencyChange,
  elevenLabsStatus,
  elevenLabsDefaultVoiceId,
  elevenLabsDefaultVoiceName,
  onElevenLabsStatusChange,
  onElevenLabsDefaultVoiceChange
}: {
  codexStatus: CodexCliStatus;
  localCliAgents: LocalCliAgent[];
  localCliScanBusy: boolean;
  selectedCliId: AgentCliId;
  byokSettings: ByokSettingsSnapshot | null;
  companionStatus: CompanionServerStatus | null;
  byokNotice: string;
  onClearByokNotice: () => void;
  onByokSettingsChange: (next: ByokSettingsSnapshot) => void;
  onCompanionStatusChange: (next: CompanionServerStatus) => void;
  interfaceLanguage: InterfaceLanguage;
  appearanceMode: AppearanceMode;
  hyperframesVideoResolution: HyperframesVideoResolution;
  seedanceVideoResolution: SeedanceVideoResolution;
  hyperframesVideoConcurrency: number;
  cliTestBusy: boolean;
  cliTestResult: CliTestResult | null;
  appVersion: string;
  desktopVersionCheck: DesktopVersionCheckResult | null;
  desktopVersionCheckBusy: boolean;
  desktopVersionCheckError: string;
  initialSection: SettingsSectionId;
  onClose: () => void;
  onCheckDesktopVersion: () => void;
  onOpenExternal: (url: string) => void;
  onRefreshSelectedCliStatus: () => void;
  onRefreshLocalCliAgents: () => void;
  onSelectCli: (cliId: AgentCliId) => void;
  onInterfaceLanguageChange: (language: InterfaceLanguage) => void;
  onAppearanceModeChange: (mode: AppearanceMode) => void;
  onHyperframesVideoResolutionChange: (resolution: HyperframesVideoResolution) => void;
  onSeedanceVideoResolutionChange: (resolution: SeedanceVideoResolution) => void;
  onHyperframesVideoConcurrencyChange: (concurrency: number) => void;
  elevenLabsStatus: ElevenLabsStatus | null;
  elevenLabsDefaultVoiceId: string;
  elevenLabsDefaultVoiceName: string;
  onElevenLabsStatusChange: (status: ElevenLabsStatus | null) => void;
  onElevenLabsDefaultVoiceChange: (voiceId: string, voiceName: string) => void;
}) {
  const { t } = useI18n();
  const [activeSection, setActiveSection] = useState<SettingsSectionId>(initialSection);
  const [activeAgentCliId, setActiveAgentCliId] = useState<AgentCliId>(selectedCliId);
  const selectedCli = localCliAgents.find((agent) => agent.id === selectedCliId) || localCliAgents.find((agent) => agent.id === "codex");
  const selectedIsCodex = selectedCli?.id === "codex";
  const selectedConnectionState = selectedIsCodex ? codexStatus.state : selectedCli?.connectionState;
  const selectedConnected = selectedConnectionState === "connected";
  const agentCliCards = localCliAgents.filter((agent) => !isDependencyCliAgent(agent));
  const versionActionIsDownload = Boolean(desktopVersionCheck?.updateAvailable && desktopVersionCheck.downloadUrl);
  const versionActionLabel = desktopVersionCheckBusy
    ? t("settings.about.updateChecking")
    : versionActionIsDownload
      ? t("settings.about.updateDownload", { version: desktopVersionCheck?.latestVersion ?? "" })
      : t("settings.about.checkUpdate");
  const versionCheckDetail = getDesktopVersionCheckDetail(desktopVersionCheck, desktopVersionCheckBusy, desktopVersionCheckError, t);
  const versionCheckTone = getDesktopVersionCheckTone(desktopVersionCheck, desktopVersionCheckBusy, desktopVersionCheckError);

  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

  useEffect(() => {
    if (byokNotice) setActiveSection("profile");
  }, [byokNotice]);

  useEffect(() => {
    if (localCliAgents.length > 0 && !localCliAgents.some((agent) => agent.id === activeAgentCliId && !isDependencyCliAgent(agent))) {
      setActiveAgentCliId(selectedCliId);
    }
  }, [activeAgentCliId, localCliAgents, selectedCliId]);

  useEffect(() => {
    setActiveAgentCliId(selectedCliId);
  }, [selectedCliId]);

  return (
    <div className="prototype-modal-backdrop">
      <section className="prototype-modal account-settings-modal" role="dialog" aria-modal="true" aria-label={t("settings.navLabel")}>
        <button className="prototype-modal-close" type="button" onClick={onClose} aria-label={t("common.close")}>
          <X aria-hidden="true" />
        </button>
        <div className="account-settings-layout">
          <aside className="account-settings-nav" aria-label={t("settings.navLabel")}>
            <div className="settings-nav-heading">
              <span>{t("nav.settings")}</span>
              <strong>MkBoard</strong>
            </div>
            {settingsSections.map((section) => (
              <SettingsNavItem
                active={activeSection === section.id}
                icon={section.icon}
                key={section.id}
                label={t(section.labelKey)}
                onPress={() => setActiveSection(section.id)}
              />
            ))}
          </aside>
          <section className="execution-settings-pane">
            {activeSection === "runtime" ? (
              <>
                <header className="execution-settings-header">
                  <h1 id="account-auth-title">{t("settings.runtime.title")}</h1>
                </header>

                <section className="local-cli-section onboarding-settings-local-agent-target" aria-label={t("settings.runtime.localCli")}>
                  <span className="onboarding-floating-anchor onboarding-settings-local-anchor" aria-hidden="true" />
                  <div className="local-cli-head">
                    <div className="local-cli-actions">
                      <button className="local-cli-action" type="button" onClick={() => onOpenExternal(LOCAL_CLI_GUIDE_URL)}>
                        <BookOpen aria-hidden="true" />
                        {t("settings.runtime.webGuide")}
                      </button>
                      <button className="local-cli-action" disabled={cliTestBusy} type="button" onClick={onRefreshSelectedCliStatus}>
                        {cliTestBusy ? <LoaderCircle className="spinning" aria-hidden="true" /> : <CircleCheck aria-hidden="true" />}
                        {cliTestBusy ? t("common.testing") : t("common.test")}
                      </button>
                      <button className="local-cli-action" disabled={localCliScanBusy} type="button" onClick={onRefreshLocalCliAgents}>
                        <RefreshCw aria-hidden="true" />
                        {localCliScanBusy ? t("common.scanning") : t("common.rescan")}
                      </button>
                    </div>
                  </div>

                  <div className="local-cli-group onboarding-settings-agent-group-target">
                    <span className="onboarding-floating-anchor onboarding-settings-agent-anchor" aria-hidden="true" />
                    <div className="local-cli-group-title">
                      <span>{t("settings.runtime.agentCliGroup")}</span>
                    </div>
                    <div className="local-cli-grid" aria-label={t("settings.runtime.agentCliGroup")}>
                      {agentCliCards.map((agent) => (
                        <LocalCliCard
                          agent={agent}
                          codexStatus={codexStatus}
                          key={agent.id}
                          selected={agent.installed && agent.id === activeAgentCliId}
                          onSelect={() => {
                            if (!isAgentCliId(agent.id) || !agent.installed) return;
                            setActiveAgentCliId(agent.id);
                            onSelectCli(agent.id);
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  {cliTestResult ? <CliTestFeedback result={cliTestResult} /> : null}

                  <section className="local-cli-group onboarding-settings-hyperframes-group-target" aria-labelledby="video-settings-title">
                    <span className="onboarding-floating-anchor onboarding-settings-hyperframes-anchor" aria-hidden="true" />
                    <h2 className="local-cli-group-title" id="video-settings-title">
                      <span>{t("settings.runtime.videoSettingsGroup")}</span>
                    </h2>
                    <div className="video-settings-card">
                      <HyperframesVideoResolutionSetting value={hyperframesVideoResolution} onChange={onHyperframesVideoResolutionChange} />
                      <SeedanceVideoResolutionSetting value={seedanceVideoResolution} onChange={onSeedanceVideoResolutionChange} />
                      <VideoConcurrencySetting value={hyperframesVideoConcurrency} onChange={onHyperframesVideoConcurrencyChange} />
                    </div>
                  </section>

                  <section className="local-cli-group" aria-labelledby="voice-runtime-group-title">
                    <h2 className="local-cli-group-title" id="voice-runtime-group-title">
                      <span>{t("settings.runtime.voiceGroup")}</span>
                    </h2>
                    <div className="video-settings-card">
                      <ElevenLabsRuntimeSetting
                        defaultVoiceName={elevenLabsDefaultVoiceName}
                        status={elevenLabsStatus}
                        onOpenVoicePanel={() => setActiveSection("voice")}
                        onStatusChange={onElevenLabsStatusChange}
                      />
                    </div>
                  </section>

                  <section className="local-cli-group" aria-labelledby="mcp-runtime-group-title">
                    <h2 className="local-cli-group-title" id="mcp-runtime-group-title">
                      <span>{t("settings.runtime.mcpGroup")}</span>
                    </h2>
                    <div className="video-settings-card">
                      <McpBridgeRuntimeSetting />
                    </div>
                  </section>

                  <div className="local-cli-footer">
                    <div className={cn("selected-cli-state", selectedConnected && "connected", !selectedConnected && "needs-auth")}>
                      {selectedConnected ? <ShieldCheck aria-hidden="true" /> : <KeyRound aria-hidden="true" />}
                      <span>{selectedCli?.installed ? `${selectedCli.name} · ${selectedCli.version || t("common.installed")}` : t("settings.runtime.selectInstalledCli")}</span>
                    </div>
                  </div>
                </section>
              </>
            ) : null}

            {activeSection === "profile" ? (
              <section className="profile-settings-section" aria-label="BYOK & Multi-Device">
                <ByokAndCompanionSection
                  byokSettings={byokSettings}
                  companionStatus={companionStatus}
                  notice={byokNotice}
                  onDismissNotice={onClearByokNotice}
                  onByokSettingsChange={onByokSettingsChange}
                  onCompanionStatusChange={onCompanionStatusChange}
                  onOpenExternal={onOpenExternal}
                />
              </section>
            ) : null}

            {activeSection === "preferences" ? (
              <SettingsPreferencesPanel
                appearanceMode={appearanceMode}
                interfaceLanguage={interfaceLanguage}
                onAppearanceModeChange={onAppearanceModeChange}
                onInterfaceLanguageChange={onInterfaceLanguageChange}
              />
            ) : null}

            {activeSection === "voice" ? (
              <VoiceSettingsPanel
                defaultVoiceId={elevenLabsDefaultVoiceId}
                defaultVoiceName={elevenLabsDefaultVoiceName}
                status={elevenLabsStatus}
                onDefaultVoiceChange={onElevenLabsDefaultVoiceChange}
                onStatusChange={onElevenLabsStatusChange}
              />
            ) : null}

            {activeSection === "feedback" ? <FeedbackSettingsPanel onOpenXDirectMessage={() => onOpenExternal(X_DIRECT_MESSAGE_URL)} /> : null}

            {activeSection === "about" ? (
              <section className="settings-static-section" aria-labelledby="account-auth-title">
                <header className="execution-settings-header">
                  <h1 id="account-auth-title">{t("settings.about.title")}</h1>
                </header>
                <div className="settings-static-grid">
                  <SettingsStaticCard
                    action={
                      <button
                        className={cn("settings-static-action", versionActionIsDownload && "primary")}
                        disabled={desktopVersionCheckBusy}
                        type="button"
                        onClick={onCheckDesktopVersion}
                      >
                        {desktopVersionCheckBusy ? <LoaderCircle className="spinning" aria-hidden="true" /> : versionActionIsDownload ? <Download aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
                        {versionActionLabel}
                      </button>
                    }
                    detail={versionCheckDetail}
                    detailTone={versionCheckTone}
                    icon={<MkboardBrandIcon className="settings-brand-icon" decorative />}
                    title={t("settings.about.version")}
                    value={appVersion || t("common.loading")}
                  />
                </div>
              </section>
            ) : null}
          </section>
        </div>
      </section>
    </div>
  );
}

function ByokAndCompanionSection({
  byokSettings,
  companionStatus,
  notice,
  onDismissNotice,
  onByokSettingsChange,
  onCompanionStatusChange,
  onOpenExternal
}: {
  byokSettings: ByokSettingsSnapshot | null;
  companionStatus: CompanionServerStatus | null;
  notice: string;
  onDismissNotice: () => void;
  onByokSettingsChange: (next: ByokSettingsSnapshot) => void;
  onCompanionStatusChange: (next: CompanionServerStatus) => void;
  onOpenExternal: (url: string) => void;
}) {
  const { locale } = useI18n();
  const isEn = locale === "en";
  const [draftKeys, setDraftKeys] = useState<Record<string, string>>({});
  const [draftUrls, setDraftUrls] = useState<Record<string, string>>({});
  const [busyProvider, setBusyProvider] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, ByokTestResult>>({});
  const [companionBusy, setCompanionBusy] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  async function saveProvider(providerId: ByokProviderId) {
    if (!window.mkboard?.saveByokProvider) return;
    setBusyProvider(providerId);
    try {
      const apiKey = draftKeys[providerId];
      const baseUrl = draftUrls[providerId];
      const next = await window.mkboard.saveByokProvider({
        providerId,
        ...(apiKey && apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        ...(baseUrl !== undefined ? { baseUrl } : {})
      });
      onByokSettingsChange(next);
      setDraftKeys((prev) => ({ ...prev, [providerId]: "" }));
      onDismissNotice();
    } finally {
      setBusyProvider(null);
    }
  }

  async function clearProvider(providerId: ByokProviderId) {
    if (!window.mkboard?.clearByokProvider) return;
    setBusyProvider(providerId);
    try {
      const next = await window.mkboard.clearByokProvider(providerId);
      onByokSettingsChange(next);
      setDraftKeys((prev) => ({ ...prev, [providerId]: "" }));
    } finally {
      setBusyProvider(null);
    }
  }

  async function testProvider(providerId: ByokProviderId) {
    if (!window.mkboard?.testByokProvider) return;
    setBusyProvider(`test:${providerId}`);
    try {
      const candidate = draftKeys[providerId]?.trim() || undefined;
      const result = await window.mkboard.testByokProvider(providerId, candidate);
      setTestResults((prev) => ({ ...prev, [providerId]: result }));
    } finally {
      setBusyProvider(null);
    }
  }

  async function changeActiveImageProvider(activeImageProvider: ByokImageProviderId) {
    if (!window.mkboard?.setByokActiveProviders) return;
    const next = await window.mkboard.setByokActiveProviders({ activeImageProvider });
    onByokSettingsChange(next);
  }

  async function changeCompanionMode(mode: CompanionAccessMode) {
    if (!window.mkboard?.setCompanionMode || companionBusy) return;
    setCompanionBusy(true);
    try {
      const next = await window.mkboard.setCompanionMode(mode);
      if (next) onCompanionStatusChange(next);
    } finally {
      setCompanionBusy(false);
    }
  }

  async function rotateToken() {
    if (!window.mkboard?.rotateCompanionToken || companionBusy) return;
    setCompanionBusy(true);
    try {
      const next = await window.mkboard.rotateCompanionToken();
      if (next) onCompanionStatusChange(next);
    } finally {
      setCompanionBusy(false);
    }
  }

  function copyText(key: string, value: string) {
    void navigator.clipboard?.writeText(value);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey((curr) => (curr === key ? null : curr)), 1800);
  }

  const editableProviders = (byokSettings?.providers ?? []).filter((p) => p.id !== "stub");

  return (
    <div className="byok-companion-section">
      <header className="execution-settings-header">
        <h1>{isEn ? "Local API Keys (BYOK) & Multi-Device Companion" : "本地 API 密钥 (BYOK) 与多端协同"}</h1>
      </header>

      <div className="byok-privacy-banner">
        <ShieldCheck aria-hidden="true" />
        <div>
          <strong>
            {isEn
              ? "100% Open-Source · Zero Backend · Zero Credit Packs"
              : "100% 开源纯本地 · 零后端 · 无积分包与项目数限制"}
          </strong>
          <p>
            {isEn
              ? "API keys are stored only on your machine (or read from environment variables) and connect directly to upstream model APIs."
              : "所有 API Key 仅保存在你的本机（或直接读取环境变量），分镜生图、生视频与配音均由本机直连上游模型接口，不经过任何中间服务器。"}
          </p>
        </div>
      </div>

      {notice ? (
        <div className="byok-notice-banner" role="status">
          <span>{notice}</span>
          <button className="local-cli-action" type="button" onClick={onDismissNotice}>
            {isEn ? "Dismiss" : "知道了"}
          </button>
        </div>
      ) : null}

      <div className="byok-defaults-row">
        <div className="byok-default-card">
          <label htmlFor="byok-image-provider-select">
            {isEn ? "Default Storyboard Image Engine" : "默认分镜生图引擎"}
          </label>
          <select
            id="byok-image-provider-select"
            className="byok-select"
            value={byokSettings?.activeImageProvider ?? "kie"}
            onChange={(e) => void changeActiveImageProvider(e.target.value as ByokImageProviderId)}
          >
            <option value="kie">KIE (GPT-Image / Flux)</option>
            <option value="openai">OpenAI (gpt-image-1)</option>
            <option value="gemini">Google Gemini (Imagen 3)</option>
            <option value="stub">{isEn ? "Offline Stub (Zero-Key Local SVG)" : "Offline Stub（免 Key 本地占位图）"}</option>
          </select>
        </div>
        <div className="byok-default-card">
          <label htmlFor="byok-video-provider-select">
            {isEn ? "Storyboard Video Engines" : "分镜视频生成引擎"}
          </label>
          <select
            id="byok-video-provider-select"
            className="byok-select"
            value={byokSettings?.activeVideoProvider ?? "kie"}
            disabled
          >
            <option value="kie">
              {isEn ? "Hyperframes (Zero-Key Local CLI) + KIE Seedance 2.0" : "Hyperframes（免 Key 本地渲染）+ KIE Seedance 2.0"}
            </option>
          </select>
        </div>
      </div>

      <div className="byok-provider-grid">
        {editableProviders.map((provider) => {
          const testResult = testResults[provider.id];
          const isSaving = busyProvider === provider.id;
          const isTesting = busyProvider === `test:${provider.id}`;
          return (
            <article className="byok-provider-card" key={provider.id}>
              <div className="byok-provider-head">
                <div className="byok-provider-title">
                  <KeyRound size={15} aria-hidden="true" />
                  <strong>{provider.name}</strong>
                  <span className={cn("byok-badge", provider.configured && "ready", provider.source === "env" && "env")}>
                    {provider.source === "env"
                      ? `ENV (${provider.envVarName})`
                      : provider.configured
                        ? `${isEn ? "Saved" : "已保存"} · ${provider.maskedKey || "***"}`
                        : isEn
                          ? "Not configured"
                          : "未配置"}
                  </span>
                </div>
                {provider.docsUrl ? (
                  <button className="local-cli-action" type="button" onClick={() => onOpenExternal(provider.docsUrl)}>
                    <ExternalLink aria-hidden="true" />
                    {isEn ? "Get Key" : "获取 Key"}
                  </button>
                ) : null}
              </div>
              <p className="byok-provider-desc">{provider.category === "image_video" ? "KIE 分镜生图 + Seedance 2.0 视频直连" : provider.category === "voice" ? "ElevenLabs 脚本与分镜演示配音直连" : `${provider.name} (${provider.model})`}</p>
              <div className="byok-provider-inputs">
                <input
                  type="password"
                  className="byok-input"
                  placeholder={
                    provider.configured
                      ? `${provider.maskedKey || "••••••••"} (${isEn ? "enter new key to replace" : "输入新 Key 可覆盖"})`
                      : `${provider.envVarName} ...`
                  }
                  value={draftKeys[provider.id] ?? ""}
                  onChange={(e) => setDraftKeys((prev) => ({ ...prev, [provider.id]: e.target.value }))}
                />
                <input
                  type="url"
                  className="byok-input"
                  placeholder={provider.baseUrl || (isEn ? "Custom Base URL (optional)" : "自定义 Base URL（可选）")}
                  value={draftUrls[provider.id] ?? provider.baseUrl ?? ""}
                  onChange={(e) => setDraftUrls((prev) => ({ ...prev, [provider.id]: e.target.value }))}
                />
              </div>
              <div className="byok-provider-actions">
                <div className="byok-btn-group">
                  <button
                    className="local-cli-action"
                    type="button"
                    disabled={isSaving || (!draftKeys[provider.id]?.trim() && draftUrls[provider.id] === undefined)}
                    onClick={() => void saveProvider(provider.id)}
                  >
                    {isSaving ? <LoaderCircle className="spinning" aria-hidden="true" /> : <Check aria-hidden="true" />}
                    {isEn ? "Save" : "保存"}
                  </button>
                  <button
                    className="local-cli-action"
                    type="button"
                    disabled={isTesting || (!provider.configured && !draftKeys[provider.id]?.trim())}
                    onClick={() => void testProvider(provider.id)}
                  >
                    {isTesting ? <LoaderCircle className="spinning" aria-hidden="true" /> : <CircleCheck aria-hidden="true" />}
                    {isEn ? "Test" : "测试连通性"}
                  </button>
                  {provider.source === "stored" ? (
                    <button className="local-cli-action" type="button" disabled={isSaving} onClick={() => void clearProvider(provider.id)}>
                      <Trash2 aria-hidden="true" />
                      {isEn ? "Clear" : "清除"}
                    </button>
                  ) : null}
                </div>
                {testResult ? (
                  <span className={cn("byok-test-feedback", testResult.ok ? "ok" : "err")}>
                    {testResult.message}
                  </span>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>

      <section className="companion-card" aria-label="Multi-Device Web Companion">
        <div className="byok-provider-head">
          <div className="byok-provider-title">
            <Monitor size={16} aria-hidden="true" />
            <strong>{isEn ? "Web & iPad / Mobile Companion + Remote HTTP MCP" : "多端 Web 协同（浏览器 / iPad 扫码直连）与远程 HTTP MCP"}</strong>
          </div>
          {companionStatus?.running ? (
            <button className="local-cli-action" type="button" disabled={companionBusy} onClick={() => void rotateToken()}>
              <RotateCcw aria-hidden="true" />
              {isEn ? "Rotate Token" : "重置配对令牌"}
            </button>
          ) : null}
        </div>
        <p className="byok-provider-desc">
          {isEn
            ? "Open MkBoard in any desktop, iPad, or mobile browser over localhost, LAN, or Tailscale, and expose Streamable HTTP /mcp for remote agents."
            : "开启后可在任意桌面浏览器、iPad 或手机上通过局域网 / Tailscale 实时访问同一分镜工作台，并同时提供 Streamable HTTP /mcp 远程 Agent 接口。"}
        </p>
        <div className="companion-mode-bar" role="tablist">
          {(
            [
              { id: "off", label: isEn ? "Off" : "关闭" },
              { id: "local-only", label: isEn ? "Localhost Only" : "仅本机 (127.0.0.1)" },
              { id: "network-accessible", label: isEn ? "LAN / Tailscale (QR)" : "局域网 / Tailscale 扫码" }
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={(companionStatus?.mode ?? "off") === item.id}
              className={cn("companion-mode-btn", (companionStatus?.mode ?? "off") === item.id && "active")}
              disabled={companionBusy}
              onClick={() => void changeCompanionMode(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {companionStatus?.running ? (
          <div className="companion-pair-grid">
            {companionStatus.qrSvg ? (
              <div
                className="companion-qr-box"
                aria-label="Companion QR Code"
                dangerouslySetInnerHTML={{ __html: companionStatus.qrSvg }}
              />
            ) : null}
            <div className="companion-url-list">
              {companionStatus.endpoints.map((ep, idx) => {
                const copyId = `pair-${idx}`;
                return (
                  <div className="companion-url-row" key={ep.url}>
                    <code>{ep.label}: {ep.pairingUrl}</code>
                    <button className="local-cli-action" type="button" onClick={() => copyText(copyId, ep.pairingUrl)}>
                      <Copy aria-hidden="true" />
                      {copiedKey === copyId ? (isEn ? "Copied" : "已复制") : isEn ? "Copy Link" : "复制配对链接"}
                    </button>
                  </div>
                );
              })}
              {companionStatus.mcpHttpUrl ? (
                <div className="companion-url-row">
                  <code>MCP HTTP: {companionStatus.mcpHttpUrl} ({companionStatus.tokenPreview})</code>
                  <button
                    className="local-cli-action"
                    type="button"
                    onClick={() => copyText("mcp-http", companionStatus.mcpHttpUrl || "")}
                  >
                    <Copy aria-hidden="true" />
                    {copiedKey === "mcp-http" ? (isEn ? "Copied" : "已复制") : isEn ? "Copy URL" : "复制 MCP 地址"}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function SettingsPreferencesPanel({
  appearanceMode,
  interfaceLanguage,
  onAppearanceModeChange,
  onInterfaceLanguageChange
}: {
  appearanceMode: AppearanceMode;
  interfaceLanguage: InterfaceLanguage;
  onAppearanceModeChange: (mode: AppearanceMode) => void;
  onInterfaceLanguageChange: (language: InterfaceLanguage) => void;
}) {
  const { t } = useI18n();
  const [languageOpen, setLanguageOpen] = useState(false);
  const languagePickerRef = useRef<HTMLDivElement>(null);
  const selectedLanguage = getLanguageOption(interfaceLanguage);

  useEffect(() => {
    if (!languageOpen) return undefined;

    function closeOnOutsidePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !languagePickerRef.current?.contains(event.target)) {
        setLanguageOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setLanguageOpen(false);
    }

    window.addEventListener("pointerdown", closeOnOutsidePointerDown);
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      window.removeEventListener("pointerdown", closeOnOutsidePointerDown);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [languageOpen]);

  return (
    <section className="preferences-section" aria-labelledby="account-auth-title">
      <header className="execution-settings-header">
        <h1 id="account-auth-title">{t("preferences.title")}</h1>
      </header>

      <div className="preferences-stack">
        <section className="preference-group" aria-labelledby="language-preference-title">
          <div className="preference-group-heading">
            <div>
              <h2 className="local-cli-group-title" id="language-preference-title">
                <span>{t("preferences.languageTitle")}</span>
              </h2>
            </div>
          </div>

          <div className={cn("language-picker", languageOpen && "open")} ref={languagePickerRef}>
            <button
              className="language-picker-trigger"
              type="button"
              aria-haspopup="listbox"
              aria-expanded={languageOpen}
              onClick={() => setLanguageOpen((open) => !open)}
            >
              <span className="language-picker-icon">
                <Languages aria-hidden="true" />
              </span>
              <span className="language-picker-copy">
                <strong>{selectedLanguage.label}</strong>
                <small>{selectedLanguage.code}</small>
              </span>
              <ChevronDown className={cn("language-picker-chevron", languageOpen && "open")} aria-hidden="true" />
            </button>

            {languageOpen ? (
              <div className="language-options" role="listbox" aria-label={t("preferences.languageList")}>
                {languageOptions.map((option) => {
                  const selected = option.value === interfaceLanguage;

                  return (
                    <button
                      className={cn("language-option", selected && "selected")}
                      key={option.value}
                      role="option"
                      aria-selected={selected}
                      type="button"
                      onClick={() => {
                        onInterfaceLanguageChange(option.value);
                        setLanguageOpen(false);
                      }}
                    >
                      <span>
                        <strong>{option.label}</strong>
                        <small>{option.code}</small>
                      </span>
                      {selected ? <Check aria-hidden="true" /> : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </section>

        <section className="preference-group" aria-labelledby="appearance-preference-title">
          <div className="preference-group-heading">
            <div>
              <h2 className="local-cli-group-title" id="appearance-preference-title">
                <span>{t("preferences.appearanceTitle")}</span>
              </h2>
            </div>
          </div>

          <div className="appearance-segment" role="radiogroup" aria-label={t("preferences.appearanceTitle")}>
            {appearanceOptions.map((option) => (
              <button
                className={cn("appearance-option", option.value === appearanceMode && "selected")}
                key={option.value}
                type="button"
                role="radio"
                aria-checked={option.value === appearanceMode}
                onClick={() => onAppearanceModeChange(option.value)}
              >
                <AppearanceOptionIcon mode={option.value} />
                <span>{t(option.labelKey)}</span>
                <small>{t(option.detailKey)}</small>
              </button>
            ))}
          </div>

        </section>
      </div>
    </section>
  );
}

function HyperframesVideoResolutionSetting({
  value,
  onChange
}: {
  value: HyperframesVideoResolution;
  onChange: (resolution: HyperframesVideoResolution) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="video-setting-row">
      <span className="video-setting-copy">
        <span className="video-setting-icon" aria-hidden="true">
          <Video />
        </span>
        <span>
          <strong>{t("settings.runtime.hyperframesResolution")}</strong>
          <small>{t("settings.runtime.hyperframesResolutionDetail")}</small>
        </span>
      </span>
      <Tabs className="video-setting-tabs" selectedKey={value} variant="primary" onSelectionChange={(nextValue) => onChange(nextValue as HyperframesVideoResolution)}>
        <Tabs.ListContainer className="video-setting-tabs-container">
          <Tabs.List className="video-setting-segment" aria-label={t("settings.runtime.hyperframesResolutionList")}>
            {hyperframesVideoResolutionOptions.map((option) => (
              <Tab className={cn("video-setting-option", option.value === value && "selected")} id={option.value} key={option.value}>
                {option.label}
              </Tab>
            ))}
          </Tabs.List>
        </Tabs.ListContainer>
      </Tabs>
    </div>
  );
}

function SeedanceVideoResolutionSetting({
  value,
  onChange
}: {
  value: SeedanceVideoResolution;
  onChange: (resolution: SeedanceVideoResolution) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="video-setting-row">
      <span className="video-setting-copy">
        <span className="video-setting-icon" aria-hidden="true">
          <Sparkles />
        </span>
        <span>
          <strong>{t("settings.runtime.seedanceResolution")}</strong>
          <small>{t("settings.runtime.seedanceResolutionDetail")}</small>
        </span>
      </span>
      <Tabs className="video-setting-tabs" selectedKey={value} variant="primary" onSelectionChange={(nextValue) => onChange(nextValue as SeedanceVideoResolution)}>
        <Tabs.ListContainer className="video-setting-tabs-container">
          <Tabs.List className="video-setting-segment" aria-label={t("settings.runtime.seedanceResolutionList")}>
            {seedanceVideoResolutionOptions.map((option) => (
              <Tab className={cn("video-setting-option", option.value === value && "selected")} id={option.value} key={option.value}>
                {option.label}
              </Tab>
            ))}
          </Tabs.List>
        </Tabs.ListContainer>
      </Tabs>
    </div>
  );
}

function VideoConcurrencySetting({
  value,
  onChange
}: {
  value: number;
  onChange: (concurrency: number) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="video-setting-row">
      <span className="video-setting-copy">
        <span className="video-setting-icon" aria-hidden="true">
          <Layers />
        </span>
        <span>
          <strong>{t("settings.runtime.hyperframesConcurrency")}</strong>
          <small>{t("settings.runtime.hyperframesConcurrencyDetail")}</small>
        </span>
      </span>
      <Tabs className="video-setting-tabs" selectedKey={String(value)} variant="primary" onSelectionChange={(nextValue) => onChange(Number(nextValue))}>
        <Tabs.ListContainer className="video-setting-tabs-container">
          <Tabs.List className="video-setting-segment numeric" aria-label={t("settings.runtime.hyperframesConcurrencyList")}>
            {hyperframesVideoConcurrencyOptions.map((option) => (
              <Tab className={cn("video-setting-option numeric", option === value && "selected")} id={String(option)} key={option}>
                {option}
              </Tab>
            ))}
          </Tabs.List>
        </Tabs.ListContainer>
      </Tabs>
    </div>
  );
}

function ElevenLabsRuntimeSetting({
  status,
  defaultVoiceName,
  onOpenVoicePanel,
  onStatusChange
}: {
  status: ElevenLabsStatus | null;
  defaultVoiceName: string;
  onOpenVoicePanel: () => void;
  onStatusChange: (status: ElevenLabsStatus | null) => void;
}) {
  const { t } = useI18n();
  const configured = Boolean(status?.configured);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [keyBusy, setKeyBusy] = useState(false);
  const [keyError, setKeyError] = useState<ElevenLabsErrorCode | null>(null);

  async function saveApiKey() {
    if (!window.mkboard || keyBusy) return;
    const apiKey = apiKeyInput.trim();
    if (!apiKey) return;
    setKeyBusy(true);
    setKeyError(null);
    try {
      const result = await window.mkboard.saveElevenLabsApiKey(apiKey);
      if (result.ok) {
        onStatusChange(result.status);
        setApiKeyInput("");
      } else {
        setKeyError(result.error);
      }
    } catch {
      setKeyError("request_failed");
    } finally {
      setKeyBusy(false);
    }
  }

  const statusDetail = configured
    ? `${t("settings.voice.apiKeyConfigured", { maskedKey: status?.maskedKey ?? "" })}${
        defaultVoiceName ? ` · ${t("settings.voice.defaultVoiceCurrent", { name: defaultVoiceName })}` : ""
      }`
    : t("settings.voice.apiKeyMissing");

  return (
    <div className="video-setting-row voice-runtime-row">
      <span className="video-setting-copy">
        <span className="video-setting-icon" aria-hidden="true">
          <AudioLines />
        </span>
        <span>
          <strong>{t("settings.voice.title")}</strong>
          <small>{statusDetail}</small>
        </span>
      </span>
      <span className="voice-runtime-controls">
        {keyError ? <em className="voice-runtime-error">{t(getSpeechErrorKey(keyError))}</em> : null}
        {!configured ? (
          <>
            <Input
              aria-label={t("settings.voice.apiKey")}
              autoComplete="off"
              className="voice-settings-key-input voice-runtime-input"
              placeholder={t("settings.voice.apiKeyPlaceholder")}
              type="password"
              value={apiKeyInput}
              onChange={(event) => setApiKeyInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void saveApiKey();
              }}
            />
            <button
              className="voice-settings-key-save voice-runtime-save"
              disabled={keyBusy || !apiKeyInput.trim()}
              type="button"
              onClick={() => void saveApiKey()}
            >
              {keyBusy ? <LoaderCircle className="spinning" aria-hidden="true" /> : null}
              {keyBusy ? t("settings.voice.validatingKey") : t("settings.voice.saveKey")}
            </button>
          </>
        ) : null}
        <button className="local-cli-action" type="button" onClick={onOpenVoicePanel}>
          {t("settings.voice.manageVoices")}
        </button>
      </span>
    </div>
  );
}

function McpBridgeRuntimeSetting() {
  const { t } = useI18n();
  const [status, setStatus] = useState<McpBridgeStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let canceled = false;
    void window.mkboard
      ?.getMcpBridgeStatus?.()
      .then((nextStatus) => {
        if (!canceled) setStatus(nextStatus);
      })
      .catch(() => undefined);
    return () => {
      canceled = true;
    };
  }, []);

  async function toggle() {
    if (!window.mkboard?.setMcpBridgeEnabled || !status || busy) return;
    setBusy(true);
    try {
      const isConnected = status.enabled && status.clients.some((client) => client.registered);
      setStatus(await window.mkboard.setMcpBridgeEnabled(!isConnected));
    } finally {
      setBusy(false);
    }
  }

  const clientNames: Record<McpBridgeStatus["clients"][number]["id"], string> = { claude_code: "Claude Code", codex: "Codex" };
  const detail = !status
    ? t("settings.mcp.serviceOffline")
    : [
        ...status.clients.map((client) => {
          const name = clientNames[client.id];
          if (!client.detected) return t("settings.mcp.clientNotDetected", { name });
          if (client.registered) return t("settings.mcp.clientConnected", { name });
          if (client.removedByUser) return t("settings.mcp.clientRemoved", { name });
          return t("settings.mcp.clientNotConnected", { name });
        }),
        status.listening ? "" : t("settings.mcp.serviceOffline")
      ]
        .filter(Boolean)
        .join(" · ");
  const connected = Boolean(status?.enabled && status.clients.some((client) => client.registered));

  return (
    <div className="video-setting-row voice-runtime-row">
      <span className="video-setting-copy">
        <span className="video-setting-icon" aria-hidden="true">
          <Bot />
        </span>
        <span>
          <strong>{t("settings.mcp.title")}</strong>
          <small>{t("settings.mcp.description")}</small>
          <small>{detail}</small>
          {status?.error ? <small className="voice-runtime-error">{status.error}</small> : null}
          <small>{t("settings.mcp.restartHint")}</small>
          {status?.snippets && status.snippets.length > 0 ? (
            <span className="mcp-snippets-box">
              {status.snippets.slice(0, 3).map((snip) => (
                <span className="mcp-snippet-item" key={snip.id}>
                  <code>{snip.label}: {snip.command}</code>
                  <button
                    className="local-cli-action"
                    type="button"
                    onClick={() => void navigator.clipboard?.writeText(snip.command)}
                  >
                    <Copy aria-hidden="true" />
                  </button>
                </span>
              ))}
            </span>
          ) : null}
        </span>
      </span>
      <span className="voice-runtime-controls">
        <button className="local-cli-action" disabled={!status || busy} type="button" onClick={() => void toggle()}>
          {busy ? <LoaderCircle className="spinning" aria-hidden="true" /> : null}
          {status?.enabled && connected ? t("settings.mcp.disconnect") : t("settings.mcp.connect")}
        </button>
      </span>
    </div>
  );
}

function VoiceSettingsPanel({
  status,
  defaultVoiceId,
  defaultVoiceName,
  onDefaultVoiceChange,
  onStatusChange
}: {
  status: ElevenLabsStatus | null;
  defaultVoiceId: string;
  defaultVoiceName: string;
  onDefaultVoiceChange: (voiceId: string, voiceName: string) => void;
  onStatusChange: (status: ElevenLabsStatus | null) => void;
}) {
  const { t } = useI18n();
  const configured = Boolean(status?.configured);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [keyFormOpen, setKeyFormOpen] = useState(!configured);
  const [keyBusy, setKeyBusy] = useState(false);
  const [keyError, setKeyError] = useState<ElevenLabsErrorCode | null>(null);
  const [voices, setVoices] = useState<ElevenLabsVoice[] | null>(null);
  const [voicesBusy, setVoicesBusy] = useState(false);
  const [voicesError, setVoicesError] = useState<ElevenLabsErrorCode | null>(null);
  const [previewVoiceId, setPreviewVoiceId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const personalVoices = (voices ?? []).filter((voice) => voice.isPersonal);
  const builtInVoices = (voices ?? []).filter((voice) => !voice.isPersonal);

  function stopVoicePreview() {
    const audio = previewAudioRef.current;
    previewAudioRef.current = null;
    if (audio) {
      try {
        audio.pause();
      } catch {
        // A detached preview element can throw on pause; clearing the ref is enough.
      }
    }
    setPreviewVoiceId(null);
  }

  async function loadVoices() {
    if (!window.mkboard) return;
    setVoicesBusy(true);
    setVoicesError(null);
    try {
      const result = await window.mkboard.listElevenLabsVoices();
      if (result.ok) {
        setVoices(result.voices);
      } else {
        setVoices(null);
        setVoicesError(result.error);
      }
    } catch {
      setVoices(null);
      setVoicesError("request_failed");
    } finally {
      setVoicesBusy(false);
    }
  }

  useEffect(() => {
    if (configured) void loadVoices();
    return stopVoicePreview;
  }, [configured]);

  async function saveApiKey() {
    if (!window.mkboard || keyBusy) return;
    const apiKey = apiKeyInput.trim();
    if (!apiKey) return;
    setKeyBusy(true);
    setKeyError(null);
    try {
      const result = await window.mkboard.saveElevenLabsApiKey(apiKey);
      if (result.ok) {
        onStatusChange(result.status);
        setApiKeyInput("");
        setKeyFormOpen(false);
      } else {
        setKeyError(result.error);
      }
    } catch {
      setKeyError("request_failed");
    } finally {
      setKeyBusy(false);
    }
  }

  async function clearApiKey() {
    if (!window.mkboard || keyBusy) return;
    setKeyBusy(true);
    setKeyError(null);
    stopVoicePreview();
    try {
      const nextStatus = await window.mkboard.clearElevenLabsApiKey();
      onStatusChange(nextStatus);
      setVoices(null);
      setVoicesError(null);
      setKeyFormOpen(true);
    } catch {
      setKeyError("request_failed");
    } finally {
      setKeyBusy(false);
    }
  }

  function toggleVoicePreview(voice: ElevenLabsVoice) {
    if (previewVoiceId === voice.voiceId) {
      stopVoicePreview();
      return;
    }
    stopVoicePreview();
    if (!voice.previewUrl) return;
    const audio = new Audio(voice.previewUrl);
    previewAudioRef.current = audio;
    setPreviewVoiceId(voice.voiceId);
    audio.addEventListener("ended", () => {
      if (previewAudioRef.current === audio) {
        previewAudioRef.current = null;
        setPreviewVoiceId(null);
      }
    });
    void audio.play().catch(() => {
      if (previewAudioRef.current === audio) {
        previewAudioRef.current = null;
        setPreviewVoiceId(null);
      }
    });
  }

  function getVoiceMeta(voice: ElevenLabsVoice) {
    const parts: string[] = [];
    if (voice.gender === "male") parts.push(t("settings.voice.genderMale"));
    if (voice.gender === "female") parts.push(t("settings.voice.genderFemale"));
    if (voice.gender === "neutral") parts.push(t("settings.voice.genderNeutral"));
    if (voice.language) parts.push(voice.language.toUpperCase());
    else if (voice.accent) parts.push(voice.accent);
    if (voice.isPersonal) parts.push(t("settings.voice.personalTag"));
    return parts.join(" · ");
  }

  function renderVoiceList(groupVoices: ElevenLabsVoice[]) {
    return (
      <div className="voice-settings-list" role="listbox" aria-label={t("settings.voice.voiceListLabel")}>
        {groupVoices.map((voice) => {
          const selected = voice.voiceId === defaultVoiceId;
          return (
            <div className={cn("voice-settings-item", selected && "selected")} key={voice.voiceId} role="option" aria-selected={selected}>
              <button
                className="voice-settings-item-main"
                type="button"
                onClick={() => onDefaultVoiceChange(voice.voiceId, voice.name)}
              >
                <span className={cn("voice-settings-check", selected && "checked")} aria-hidden="true">
                  {selected ? <Check aria-hidden="true" /> : null}
                </span>
                <span className="voice-settings-item-copy">
                  <strong>{voice.name}</strong>
                  <small>{getVoiceMeta(voice) || voice.description || ""}</small>
                </span>
              </button>
              {voice.previewUrl ? (
                <button
                  className={cn("voice-settings-preview", previewVoiceId === voice.voiceId && "playing")}
                  type="button"
                  aria-label={t("settings.voice.preview", { name: voice.name })}
                  onClick={() => toggleVoicePreview(voice)}
                >
                  {previewVoiceId === voice.voiceId ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <section className="voice-settings-section" aria-labelledby="voice-settings-title">
      <header className="execution-settings-header">
        <h1 id="voice-settings-title">{t("settings.voice.title")}</h1>
      </header>
      <p className="voice-settings-intro">{t("settings.voice.intro")}</p>

      <div className="voice-settings-key-card">
        <div className="voice-settings-key-row">
          <span className="voice-settings-key-copy">
            <span className="voice-settings-key-icon" aria-hidden="true">
              <KeyRound />
            </span>
            <span>
              <strong>{t("settings.voice.apiKey")}</strong>
              <small>
                {configured
                  ? t("settings.voice.apiKeyConfigured", { maskedKey: status?.maskedKey ?? "" })
                  : t("settings.voice.apiKeyMissing")}
              </small>
            </span>
          </span>
          {configured && !keyFormOpen ? (
            <span className="voice-settings-key-actions">
              <button className="local-cli-action" type="button" onClick={() => setKeyFormOpen(true)}>
                {t("settings.voice.replaceKey")}
              </button>
              <button className="local-cli-action danger" disabled={keyBusy} type="button" onClick={() => void clearApiKey()}>
                {t("settings.voice.clearKey")}
              </button>
            </span>
          ) : null}
        </div>
        {keyFormOpen || !configured ? (
          <div className="voice-settings-key-form">
            <Input
              aria-label={t("settings.voice.apiKey")}
              autoComplete="off"
              className="voice-settings-key-input"
              placeholder={t("settings.voice.apiKeyPlaceholder")}
              type="password"
              value={apiKeyInput}
              onChange={(event) => setApiKeyInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void saveApiKey();
              }}
            />
            <button className="voice-settings-key-save" disabled={keyBusy || !apiKeyInput.trim()} type="button" onClick={() => void saveApiKey()}>
              {keyBusy ? <LoaderCircle className="spinning" aria-hidden="true" /> : null}
              {keyBusy ? t("settings.voice.validatingKey") : t("settings.voice.saveKey")}
            </button>
            {configured ? (
              <button
                className="local-cli-action"
                type="button"
                onClick={() => {
                  setKeyFormOpen(false);
                  setApiKeyInput("");
                  setKeyError(null);
                }}
              >
                {t("common.cancel")}
              </button>
            ) : null}
          </div>
        ) : null}
        {keyError ? <p className="voice-settings-error">{t(getSpeechErrorKey(keyError))}</p> : null}
        {!configured || keyFormOpen || keyError ? (
          <div className="voice-settings-tutorial">
            <div className="voice-settings-tutorial-head">
              <strong>{t("settings.voice.tutorialTitle")}</strong>
              <button
                className="voice-settings-tutorial-open"
                type="button"
                onClick={() => void window.mkboard?.openExternal("https://elevenlabs.io/app/settings/api-keys")}
              >
                <ExternalLink aria-hidden="true" />
                {t("settings.voice.openKeysPage")}
              </button>
            </div>
            <div className="voice-settings-tutorial-steps">
              <div className="voice-settings-tutorial-step">
                <span className="voice-settings-tutorial-step-num" aria-hidden="true">1</span>
                <span className="voice-settings-tutorial-step-body">{t("settings.voice.tutorialStep1")}</span>
              </div>
              <div className="voice-settings-tutorial-step">
                <span className="voice-settings-tutorial-step-num" aria-hidden="true">2</span>
                <span className="voice-settings-tutorial-step-body">
                  {t("settings.voice.tutorialStep2")}
                  <span className="voice-settings-tutorial-perms">
                    <em>
                      <Check aria-hidden="true" />
                      {t("settings.voice.tutorialPermTts")}
                    </em>
                    <em>
                      <Check aria-hidden="true" />
                      {t("settings.voice.tutorialPermVoices")}
                    </em>
                  </span>
                </span>
              </div>
              <div className="voice-settings-tutorial-step">
                <span className="voice-settings-tutorial-step-num" aria-hidden="true">3</span>
                <span className="voice-settings-tutorial-step-body">{t("settings.voice.tutorialStep3")}</span>
              </div>
            </div>
          </div>
        ) : (
          <p className="voice-settings-hint">{t("settings.voice.keyHint")}</p>
        )}
      </div>

      {configured ? (
        <div className="voice-settings-voices">
          <div className="voice-settings-voices-head">
            <strong>{t("settings.voice.defaultVoiceTitle")}</strong>
            <span>
              {defaultVoiceId
                ? t("settings.voice.defaultVoiceCurrent", { name: defaultVoiceName || defaultVoiceId })
                : t("settings.voice.defaultVoiceEmpty")}
            </span>
            <button className="local-cli-action" disabled={voicesBusy} type="button" onClick={() => void loadVoices()}>
              <RefreshCw aria-hidden="true" />
              {voicesBusy ? t("common.scanning") : t("settings.voice.refreshVoices")}
            </button>
          </div>
          {voicesBusy && !voices ? (
            <p className="voice-settings-hint">
              <LoaderCircle className="spinning" aria-hidden="true" /> {t("settings.voice.loadingVoices")}
            </p>
          ) : null}
          {voicesError ? <p className="voice-settings-error">{t(getSpeechErrorKey(voicesError))}</p> : null}
          {voices && personalVoices.length > 0 ? (
            <>
              <h2 className="voice-settings-group-title">{t("settings.voice.personalGroup")}</h2>
              {renderVoiceList(personalVoices)}
            </>
          ) : null}
          {voices && personalVoices.length === 0 ? <p className="voice-settings-hint">{t("settings.voice.noPersonalVoices")}</p> : null}
          {voices && builtInVoices.length > 0 ? (
            <>
              <h2 className="voice-settings-group-title">{t("settings.voice.builtInGroup")}</h2>
              {renderVoiceList(builtInVoices)}
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function FeedbackSettingsPanel({ onOpenXDirectMessage }: { onOpenXDirectMessage: () => void }) {
  const { t } = useI18n();

  return (
    <section className="settings-feedback-section" aria-labelledby="settings-feedback-title">
      <header className="execution-settings-header">
        <h1 id="settings-feedback-title">{t("settings.feedback.title")}</h1>
      </header>

      <div className="settings-feedback-stack">
        <article className="settings-feedback-card settings-feedback-x-card">
          <div className="settings-feedback-brand-icon settings-feedback-x-icon" aria-hidden="true">
            <img src={X_LOGO_SRC} alt="" />
          </div>
          <div className="settings-feedback-copy">
            <strong>{t("settings.feedback.problemTitle")}</strong>
            <small>{t("settings.feedback.xNote")}</small>
          </div>
          <button className="settings-feedback-x-button" type="button" aria-label={t("settings.feedback.openXDm")} onClick={onOpenXDirectMessage}>
            <ExternalLink aria-hidden="true" />
          </button>
        </article>

        <article className="settings-feedback-card settings-feedback-feishu-card">
          <div className="settings-feedback-brand-icon" aria-hidden="true">
            <img src={FEISHU_ICON_SRC} alt="" />
          </div>
          <div className="settings-feedback-copy">
            <strong>{t("settings.feedback.feishuValue")}</strong>
            <small>{t("settings.feedback.feishuDescription")}</small>
          </div>
          <img className="settings-feedback-qr" src={FEISHU_GROUP_QR_SRC} alt={t("settings.feedback.feishuQrAlt")} />
        </article>
      </div>
    </section>
  );
}

function AppearanceOptionIcon({ mode }: { mode: AppearanceMode }) {
  if (mode === "light") return <Sun aria-hidden="true" />;
  if (mode === "dark") return <Moon aria-hidden="true" />;
  return <Monitor aria-hidden="true" />;
}

function SettingsNavItem({
  active,
  icon,
  label,
  onPress
}: {
  active?: boolean;
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <button className={cn("settings-nav-item", active && "active")} type="button" onClick={onPress} aria-current={active ? "page" : undefined}>
      {icon}
      <span className="settings-nav-copy">
        <span>{label}</span>
      </span>
    </button>
  );
}

function CliTestFeedback({ result }: { result: CliTestResult }) {
  const Icon = result.state === "success" ? ShieldCheck : AlertTriangle;

  return (
    <div className={cn("cli-test-feedback", result.state)} role="status" aria-live="polite">
      <Icon aria-hidden="true" />
      <span className="cli-test-feedback-copy">
        <strong>{result.title}</strong>
        {result.detail ? <span>{result.detail}</span> : null}
      </span>
    </div>
  );
}

function getDesktopVersionCheckDetail(
  versionCheck: DesktopVersionCheckResult | null,
  checking: boolean,
  errorMessage: string,
  t: Translator
) {
  if (checking) return t("settings.about.updateCheckingDetail");
  if (errorMessage) return t("settings.about.updateFailed", { message: errorMessage });
  if (!versionCheck) return t("settings.about.updateIdle");
  if (versionCheck.updateAvailable && versionCheck.latestVersion) {
    return t("settings.about.updateAvailableDetail", { version: versionCheck.latestVersion });
  }
  if (versionCheck.status === "unavailable") {
    return versionCheck.message ? t("settings.about.updateFailed", { message: versionCheck.message }) : t("settings.about.updateUnavailable");
  }
  if (versionCheck.latestVersion) return t("settings.about.updateCurrentDetail", { version: versionCheck.latestVersion });
  return t("settings.about.updateCurrent");
}

function getDesktopVersionCheckTone(
  versionCheck: DesktopVersionCheckResult | null,
  checking: boolean,
  errorMessage: string
): SettingsStaticDetailTone {
  if (checking) return "checking";
  if (errorMessage) return "error";
  if (!versionCheck) return "neutral";
  if (versionCheck.updateAvailable) return "warning";
  if (versionCheck.status === "unavailable") return "error";
  return "success";
}

function SettingsStaticDetailIcon({ tone }: { tone: SettingsStaticDetailTone }) {
  if (tone === "checking") return <LoaderCircle aria-hidden="true" />;
  if (tone === "success") return <CircleCheck aria-hidden="true" />;
  if (tone === "warning") return <Download aria-hidden="true" />;
  if (tone === "error") return <AlertTriangle aria-hidden="true" />;
  return null;
}

function SettingsStaticCard({
  action,
  detail,
  detailTone = "neutral",
  icon,
  title,
  value
}: {
  action?: React.ReactNode;
  detail?: string;
  detailTone?: SettingsStaticDetailTone;
  icon: React.ReactNode;
  title: string;
  value: string;
}) {
  return (
    <article className={cn("settings-static-card", action && "with-action")}>
      <div className="settings-static-icon">{icon}</div>
      <div className="settings-static-content">
        <div className="settings-static-copy">
          <span>{title}</span>
          <strong>{value}</strong>
          {detail ? (
            <small className={cn("settings-static-detail", detailTone)} role="status" aria-live="polite">
              <SettingsStaticDetailIcon tone={detailTone} />
              {detail}
            </small>
          ) : null}
        </div>
        {action}
      </div>
    </article>
  );
}

function LocalCliCard({
  agent,
  codexStatus,
  selected,
  onSelect,
  interactive = true
}: {
  agent: LocalCliAgent;
  codexStatus: CodexCliStatus;
  selected: boolean;
  onSelect?: () => void;
  interactive?: boolean;
}) {
  const { t } = useI18n();
  const isCodex = agent.id === "codex";
  const connectionState = isCodex ? codexStatus.state : agent.connectionState;
  const installedLabel = isCodex && codexStatus.path ? codexStatus.version || agent.version || t("common.installed") : agent.version || t("common.installed");
  const statusClass = selected ? "selected" : agent.installed ? "installed" : "not-installed";
  const authClass = connectionState === "connected" ? "ready" : agent.installed ? "needs-auth" : "";
  const connectionLabel = localizeLocalCliConnectionLabel(agent, connectionState, selected, t);
  const Icon = getLocalCliIcon(agent.id);
  const selectable = interactive && agent.installed;
  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!selectable || !onSelect) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onSelect();
  };

  return (
    <article
      aria-disabled={interactive && !agent.installed ? true : undefined}
      className={cn("local-cli-card", `local-cli-card-${agent.id}`, statusClass, authClass, !interactive && "readonly", interactive && !agent.installed && "disabled")}
      role={interactive ? "button" : "group"}
      tabIndex={selectable ? 0 : undefined}
      onClick={selectable ? onSelect : undefined}
      onKeyDown={handleKeyDown}
    >
      <span className={cn("cli-brand-icon", agent.id)} aria-hidden="true">
        {Icon ? <Icon size={26} /> : <span className="cli-brand-letter">{getLocalCliFallbackMark(agent.name)}</span>}
      </span>
      <span className="local-cli-copy">
        <strong>{agent.name}</strong>
        <span>{agent.installed ? installedLabel : t("common.notInstalled")}</span>
        {agent.installed && connectionLabel ? <small>{connectionLabel}</small> : null}
      </span>
      <span className="local-cli-dot" aria-hidden="true" />
    </article>
  );
}

function getLocalCliIcon(id: string): LocalCliIconComponent | undefined {
  const iconMap: Record<string, LocalCliIconComponent> = {
    "claude-code": ClaudeCodeIcon,
    codex: CodexIcon
  };

  return iconMap[id];
}

function getLocalCliFallbackMark(name: string) {
  return name.slice(0, 2);
}

function ProjectDownloadControl({
  assets,
  onOpenSettings,
  projectId,
  rows
}: {
  assets: ProjectAsset[];
  onOpenSettings: () => void;
  projectId: string;
  rows: StoryboardRow[];
}) {
  const { locale, t } = useI18n();
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [selectedKind, setSelectedKind] = useState<ProjectExportKind>("storyboard-csv");
  const [exportBusy, setExportBusy] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const exportRequestIdRef = useRef(0);
  const storyboardAssetCount = useMemo(() => {
    const assetIds = new Set(rows.flatMap((row) => getStoryboardRowMediaAssetIds(row)));
    return assets.filter((asset) => assetIds.has(asset.id) && (asset.kind === "image" || asset.kind === "video")).length;
  }, [assets, rows]);
  const exportOptions: Array<{
    descriptionKey: I18nKey;
    disabled: boolean;
    disabledReasonKey?: I18nKey;
    format: "CSV" | "ZIP";
    kind: ProjectExportKind;
    titleKey: I18nKey;
  }> = [
    {
      kind: "storyboard-csv",
      titleKey: "projectExport.storyboardCsv",
      descriptionKey: "projectExport.storyboardCsvDescription",
      format: "CSV",
      disabled: false
    },
    {
      kind: "storyboard-assets-zip",
      titleKey: "projectExport.storyboardAssetsZip",
      descriptionKey: "projectExport.storyboardAssetsZipDescription",
      disabledReasonKey: "projectExport.storyboardAssetsEmpty",
      format: "ZIP",
      disabled: storyboardAssetCount === 0
    },
    {
      kind: "all-assets-zip",
      titleKey: "projectExport.allAssetsZip",
      descriptionKey: "projectExport.allAssetsZipDescription",
      disabledReasonKey: "projectExport.allAssetsEmpty",
      format: "ZIP",
      disabled: assets.length === 0
    }
  ];
  const selectedOption = exportOptions.find((option) => option.kind === selectedKind) ?? exportOptions[0];

  useEffect(() => {
    exportRequestIdRef.current += 1;
    setDownloadOpen(false);
    setMoreOpen(false);
    setSelectedKind("storyboard-csv");
    setExportBusy(false);
    setExportFeedback(null);
  }, [projectId]);

  useEffect(() => {
    if (selectedOption.disabled) setSelectedKind("storyboard-csv");
  }, [selectedOption.disabled]);

  function handleDownloadOpenChange(isOpen: boolean) {
    if (isOpen && exportBusy) return;
    if (isOpen) {
      setMoreOpen(false);
      setExportFeedback(null);
    }
    setDownloadOpen(isOpen);
  }

  function handleMoreOpenChange(isOpen: boolean) {
    if (exportBusy) return;
    if (isOpen) setDownloadOpen(false);
    setMoreOpen(isOpen);
  }

  function openDownloadFromMore() {
    setMoreOpen(false);
    setExportFeedback(null);
    setDownloadOpen(true);
  }

  async function exportProject() {
    if (exportBusy || selectedOption.disabled) return;
    const requestId = exportRequestIdRef.current + 1;
    exportRequestIdRef.current = requestId;
    setExportBusy(true);
    setExportFeedback(null);
    try {
      const result = await window.mkboard.exportProject(projectId, selectedKind, locale);
      if (requestId !== exportRequestIdRef.current || result.canceled) return;
      const fileName = result.fileName || result.filePath?.split(/[/\\]/u).pop() || t("projectExport.completedFile");
      setExportFeedback({ tone: "success", message: t("projectExport.success", { fileName }) });
    } catch (error) {
      if (requestId !== exportRequestIdRef.current) return;
      const rawMessage = error instanceof Error ? error.message : String(error ?? "");
      const message = stripIpcErrorPrefix(rawMessage) || t("projectExport.unknownError");
      setExportFeedback({ tone: "error", message: t("projectExport.error", { message }) });
    } finally {
      if (requestId === exportRequestIdRef.current) setExportBusy(false);
    }
  }

  return (
    <div className="workspace-download-control" role="group" aria-label={t("workspace.downloadActions")}>
      <Popover isOpen={downloadOpen} onOpenChange={handleDownloadOpenChange}>
        <Popover.Trigger
          className={cn("workspace-download-trigger", downloadOpen && "open")}
          aria-disabled={exportBusy || undefined}
          aria-label={t("workspace.openDownload")}
        >
          {t("workspace.download")}
        </Popover.Trigger>
        <Popover.Content className="workspace-download-popover" offset={8} placement="bottom end">
          <Popover.Dialog aria-labelledby="project-export-title">
            <section className="project-export-panel" aria-busy={exportBusy}>
              <header className="project-export-header">
                <div>
                  <span>{t("projectExport.typeLabel")}</span>
                  <h2 id="project-export-title">{t("projectExport.title")}</h2>
                </div>
                <Button
                  className="project-export-close"
                  variant="ghost"
                  isDisabled={exportBusy}
                  aria-label={t("common.close")}
                  onPress={() => handleDownloadOpenChange(false)}
                >
                  <X aria-hidden="true" />
                </Button>
              </header>
              <div className="project-export-options" role="group" aria-label={t("projectExport.typeLabel")}>
                {exportOptions.map((option) => {
                  const selected = option.kind === selectedKind;
                  const OptionIcon = option.kind === "storyboard-csv" ? FileText : FileArchive;
                  return (
                    <Button
                      key={option.kind}
                      className={cn("project-export-option", selected && "selected")}
                      variant="ghost"
                      aria-pressed={selected}
                      isDisabled={exportBusy || option.disabled}
                      onPress={() => {
                        setSelectedKind(option.kind);
                        setExportFeedback(null);
                      }}
                    >
                      <span className="project-export-option-icon" aria-hidden="true">
                        <OptionIcon />
                      </span>
                      <span className="project-export-option-copy">
                        <strong>{t(option.titleKey)}</strong>
                        <small>{t(option.descriptionKey)}</small>
                        {option.disabled && option.disabledReasonKey ? <em>{t(option.disabledReasonKey)}</em> : null}
                      </span>
                      <span className="project-export-format">{option.format}</span>
                      <span className="project-export-radio" aria-hidden="true">{selected ? <Check /> : null}</span>
                    </Button>
                  );
                })}
              </div>
              {exportFeedback ? (
                <div
                  className={cn("project-export-feedback", exportFeedback.tone)}
                  role={exportFeedback.tone === "error" ? "alert" : "status"}
                  aria-live={exportFeedback.tone === "error" ? "assertive" : "polite"}
                >
                  {exportFeedback.tone === "success" ? <CircleCheck aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}
                  <span>{exportFeedback.message}</span>
                </div>
              ) : null}
              <Button
                className="project-export-submit"
                variant="primary"
                isDisabled={exportBusy || selectedOption.disabled}
                onPress={() => void exportProject()}
              >
                {exportBusy ? <LoaderCircle className="spinning" aria-hidden="true" /> : <Download aria-hidden="true" />}
                {exportBusy ? t("projectExport.downloading") : t("projectExport.start")}
              </Button>
            </section>
          </Popover.Dialog>
        </Popover.Content>
      </Popover>
      <Popover isOpen={moreOpen} onOpenChange={handleMoreOpenChange}>
        <Popover.Trigger
          className={cn("workspace-more-trigger onboarding-settings-trigger", moreOpen && "open")}
          aria-disabled={exportBusy || undefined}
          aria-label={t("workspace.moreActions")}
        >
          <Ellipsis aria-hidden="true" />
        </Popover.Trigger>
        <Popover.Content className="workspace-more-popover" offset={8} placement="bottom end">
          <Popover.Dialog>
            <div className="workspace-more-menu" aria-label={t("workspace.moreActions")}>
              <strong>{t("workspace.moreActions")}</strong>
              <Button className="workspace-more-menu-item" variant="ghost" onPress={openDownloadFromMore}>
                <Download aria-hidden="true" />
                {t("workspace.download")}
              </Button>
              <Button
                className="workspace-more-menu-item"
                variant="ghost"
                onPress={() => {
                  setMoreOpen(false);
                  onOpenSettings();
                }}
              >
                <Settings aria-hidden="true" />
                {t("workspace.settings")}
              </Button>
            </div>
          </Popover.Dialog>
        </Popover.Content>
      </Popover>
    </div>
  );
}

function WorkspaceScreen({
  projectId,
  projectName,
  tab,
  setTab,
  agentConversations,
  activeAgentConversationId,
  agentMessages,
  agentOperationConfirmations,
  agentImageAttachments,
  agentBusy,
  runningAgentClientRunIds,
  runningAgentConversationIds,
  localCliAgents,
  selectedCliId,
  selectedCliName,
  selectedCliConnectionState,
  selectedCliConnectionLabel,
  selectedCliStatusBusy,
  selectedAgentModel,
  selectedAgentEffort,
  agentPermissionMode,
  mcpBridgeStatus,
  onSelectCli,
  onSelectAgentModel,
  onSelectAgentEffort,
  onChangeAgentPermissionMode,
  onOpenRuntimeSettings,
  onConnectSelectedCli,
  onCreateAgentConversation,
  onOpenAgentConversation,
  onRefreshSelectedCliStatus,
  onStopAgentRun,
  onConfirmAgentOperations,
  onCancelAgentOperations,
  onChooseAgentImages,
  onPasteAgentImage,
  onRemoveAgentImageAttachment,
  sendAgentMessage,
  scriptRichText,
  setScriptRichText,
  rows,
  columns,
  imageRatio,
  skills,
  skillsError,
  skillsLoading,
  storyboardSkill,
  projectTaste,
  tastes,
  tastesError,
  tastesLoading,
  storyboardBusyAction,
  storyboardGenerating,
  storyboardImageGeneratingRowIds,
  storyboardVideoGeneratingRowIds,
  storyboardImageGenerationTasks,
  storyboardVideoGenerationTasks,
  onCreateStoryboards,
  onDeleteStoryboards,
  onDuplicateStoryboards,
  onGenerateStoryboardImages,
  onGenerateStoryboardImageRows,
  onGenerateStoryboardVideos,
  onGenerateStoryboardVideoRows,
  onRetryStoryboardTask,
  onCancelStoryboardVideoGenerations,
  onGenerateStoryboard,
  onChooseProjectAssets,
  onImageRatioChange,
  onLoadSkills,
  onStoryboardSkillChange,
  onLoadTastes,
  onProjectTasteChange,
  onImportClipboardImageAsShotMedia,
  onImportShotMediaPaths,
  onInsertStoryboard,
  onChooseShotMedia,
  onEditProject,
  onReorderRows,
  onSaveColumns,
  onUpdateCell,
  onUpdateShotMedia,
  assets,
  dropText,
  onAssetDropNoticeChange,
  onDeleteAssets,
  onImportAssetPaths,
  onRenameAsset,
  onBackToProjects,
  onOpenSettings,
  suppressStoryboardEmptyGenerateAction,
  presentationRequestId,
  onPresentationOpenChange,
  speechVoiceId,
  onOpenVoiceSettings
}: {
  projectId: string;
  projectName: string;
  tab: WorkspaceTab;
  setTab: (tab: WorkspaceTab) => void;
  agentConversations: AgentConversation[];
  activeAgentConversationId: string;
  agentMessages: AgentMessage[];
  agentOperationConfirmations: AgentOperationConfirmation[];
  agentImageAttachments: ProjectAsset[];
  agentBusy: boolean;
  runningAgentClientRunIds: Set<string>;
  runningAgentConversationIds: ReadonlySet<string>;
  localCliAgents: LocalCliAgent[];
  selectedCliId: AgentCliId;
  selectedCliName: string;
  selectedCliConnectionState: CodexCliStatus["state"];
  selectedCliConnectionLabel: string;
  selectedCliStatusBusy: boolean;
  selectedAgentModel: string;
  selectedAgentEffort: AgentEffortLevel;
  agentPermissionMode: AgentPermissionMode;
  mcpBridgeStatus: McpBridgeStatus | null;
  onSelectCli: (cliId: AgentCliId) => void;
  onSelectAgentModel: (model: string) => void;
  onSelectAgentEffort: (effort: AgentEffortLevel) => void;
  onChangeAgentPermissionMode: (mode: AgentPermissionMode) => void;
  onOpenRuntimeSettings: () => void;
  onConnectSelectedCli: () => void;
  onCreateAgentConversation: () => void;
  onOpenAgentConversation: (conversationId: string) => void;
  onRefreshSelectedCliStatus: () => void;
  onStopAgentRun: (clientRunId?: string) => void;
  onConfirmAgentOperations: (confirmationId: string) => void;
  onCancelAgentOperations: (confirmationId: string) => void;
  onChooseAgentImages: () => void;
  onPasteAgentImage: () => void;
  onRemoveAgentImageAttachment: (assetId: string) => void;
  sendAgentMessage: AgentSubmitHandler;
  scriptRichText: string;
  setScriptRichText: (value: string) => void;
  rows: StoryboardRow[];
  columns: StoryboardColumn[];
  imageRatio: ImageRatio;
  skills: Skill[];
  skillsError: string | null;
  skillsLoading: boolean;
  storyboardSkill: ProjectSkill | null;
  projectTaste: ProjectTaste | null;
  tastes: Taste[];
  tastesError: string | null;
  tastesLoading: boolean;
  storyboardBusyAction: StoryboardAiAction | null;
  storyboardGenerating: boolean;
  storyboardImageGeneratingRowIds: Set<string>;
  storyboardVideoGeneratingRowIds: Set<string>;
  storyboardImageGenerationTasks: StoryboardGenerationTaskItem[];
  storyboardVideoGenerationTasks: StoryboardGenerationTaskItem[];
  onCreateStoryboards: (count: number) => Promise<void>;
  onDeleteStoryboards: (rowIds: string[]) => Promise<void>;
  onDuplicateStoryboards: (rowIds: string[]) => Promise<void>;
  onGenerateStoryboardImages: (mode: StoryboardMediaGenerationMode) => void;
  onGenerateStoryboardImageRows: (rowIds: string[], userMessage?: string) => Promise<void>;
  onGenerateStoryboardVideos: (mode: StoryboardMediaGenerationMode, methodFilter?: StoryboardVideoGenerationMethodFilter) => void;
  onGenerateStoryboardVideoRows: (rowIds: string[], userMessage?: string) => Promise<void>;
  onRetryStoryboardTask: (task: StoryboardGenerationTaskItem) => Promise<void>;
  onCancelStoryboardVideoGenerations: () => Promise<void>;
  onGenerateStoryboard: () => void;
  onChooseProjectAssets: ChooseProjectAssetsHandler;
  onImageRatioChange: (imageRatio: ImageRatio) => void;
  onLoadSkills: () => Promise<Skill[]>;
  onStoryboardSkillChange: (skillId: string) => Promise<ProjectSkill>;
  onLoadTastes: () => Promise<Taste[]>;
  onProjectTasteChange: (tasteId: string) => Promise<ProjectTaste>;
  onImportClipboardImageAsShotMedia: (rowId: string) => void;
  onImportShotMediaPaths: (rowId: string, filePaths: string[]) => void;
  onInsertStoryboard: (rowId: string, placement: "before" | "after") => Promise<void>;
  onChooseShotMedia: (rowId: string) => void;
  onEditProject: () => void;
  onReorderRows: (sourceRowId: string, targetRowId: string) => void;
  onSaveColumns: (columns: StoryboardColumn[]) => void;
  onUpdateCell: UpdateStoryboardCellHandler;
  onUpdateShotMedia: (rowId: string, assetIds: string[]) => void;
  assets: ProjectAsset[];
  dropText: string;
  onAssetDropNoticeChange: (notice: AssetDropNotice) => void;
  onDeleteAssets: (assetIds: string[]) => Promise<void>;
  onImportAssetPaths: (filePaths: string[]) => void;
  onRenameAsset: (assetId: string, fileName: string) => void;
  onBackToProjects: () => void;
  onOpenSettings: () => void;
  suppressStoryboardEmptyGenerateAction: boolean;
  presentationRequestId: number;
  onPresentationOpenChange: (isOpen: boolean) => void;
  speechVoiceId: string;
  onOpenVoiceSettings: () => void;
}) {
  const { t } = useI18n();
  const [presentationIndex, setPresentationIndex] = useState<number | null>(null);
  const [lastPresentationFrameId, setLastPresentationFrameId] = useState<string | null>(null);
  const [agentSidebarVisible, setAgentSidebarVisible] = useState(true);
  const [agentSidebarWidth, setAgentSidebarWidth] = useState(AGENT_SIDEBAR_DEFAULT_WIDTH);
  const shouldUseAgentSidebar = tab === "script" || tab === "storyboard" || tab === "assets";
  const isAgentSidebarCollapsed = shouldUseAgentSidebar && !agentSidebarVisible;
  const presentationFrames = useMemo(() => getPresentationFrames(rows, assets), [assets, rows]);

  useEffect(() => {
    setPresentationIndex(null);
    setLastPresentationFrameId(null);
  }, [projectId]);

  function openPresentation() {
    const nextIndex = lastPresentationFrameId ? presentationFrames.findIndex((frame) => frame.id === lastPresentationFrameId) : -1;
    const resolvedIndex = nextIndex >= 0 ? nextIndex : 0;
    setPresentationIndex(resolvedIndex);
    const nextFrame = presentationFrames[resolvedIndex];
    if (nextFrame) setLastPresentationFrameId(nextFrame.id);
    onPresentationOpenChange(true);
  }

  useEffect(() => {
    if (presentationRequestId <= 0) return;
    openPresentation();
  }, [presentationRequestId]);

  function updatePresentationIndex(nextIndex: number | null) {
    setPresentationIndex(nextIndex);
    if (nextIndex === null) return;

    const nextFrame = presentationFrames[nextIndex];
    if (nextFrame) setLastPresentationFrameId(nextFrame.id);
  }

  function closePresentation() {
    const currentFrameId =
      presentationIndex !== null && presentationFrames.length > 0
        ? presentationFrames[Math.min(Math.max(presentationIndex, 0), presentationFrames.length - 1)]?.id
        : lastPresentationFrameId;

    updatePresentationIndex(null);
    onPresentationOpenChange(false);
    if (currentFrameId) setLastPresentationFrameId(currentFrameId);
    if (tab === "storyboard" && currentFrameId) scrollNearestStoryboardRowsIntoView([currentFrameId]);
  }

  function startAgentSidebarResize(event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = agentSidebarWidth;

    function handlePointerMove(moveEvent: PointerEvent) {
      const nextWidth = startWidth - (moveEvent.clientX - startX);
      setAgentSidebarWidth(Math.min(AGENT_SIDEBAR_MAX_WIDTH, Math.max(AGENT_SIDEBAR_MIN_WIDTH, Math.round(nextWidth))));
    }

    function handlePointerUp() {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  }

  return (
    <section
      className={cn(
        "screen workspace-screen active",
        `workspace-tab-${tab}`,
        shouldUseAgentSidebar && "with-agent-sidebar",
        isAgentSidebarCollapsed && "agent-sidebar-collapsed"
      )}
      style={{ "--agent-sidebar-width": `${agentSidebarWidth}px` } as React.CSSProperties}
      aria-label={t("workspace.label")}
    >
      <header className="workspace-header">
        <div className="workspace-header-left">
          <button className="workspace-brand" type="button" aria-label={t("workspace.backToProjects")} onClick={onBackToProjects}>
            <MkboardBrandIcon className="workspace-brand-mark" decorative />
            <strong>MkBoard</strong>
          </button>
          <button className="workspace-back-button" type="button" aria-label={t("workspace.backToProjects")} onClick={onBackToProjects}>
            <ArrowLeft aria-hidden="true" />
          </button>
          <div className="project-title">
            <h1>{projectName}</h1>
            <button className="project-title-edit-button" type="button" aria-label={t("workspace.editProject")} onClick={onEditProject}>
              <Pencil aria-hidden="true" />
            </button>
          </div>
        </div>
        <WorkspaceTabs value={tab} onChange={setTab} />
        <div className="workspace-header-actions">
          <button className="workspace-demo-trigger" type="button" aria-label={t("workspace.demoProject")} onClick={openPresentation}>
            <Monitor aria-hidden="true" />
            {t("workspace.demo")}
            <ChevronDown aria-hidden="true" />
          </button>
          <ProjectDownloadControl assets={assets} onOpenSettings={onOpenSettings} projectId={projectId} rows={rows} />
        </div>
        {shouldUseAgentSidebar ? (
          <button className="agent-collapse workspace-agent-toggle" type="button" aria-label={agentSidebarVisible ? t("workspace.collapseAgent") : t("workspace.expandAgent")} onClick={() => setAgentSidebarVisible((visible) => !visible)}>
            <PanelRight aria-hidden="true" />
          </button>
        ) : null}
      </header>

      <div className="workspace-body">
        <div className="workspace-primary-panel">
          {tab === "script" ? (
            <ScriptPanel
              scriptRichText={scriptRichText}
              setScriptRichText={setScriptRichText}
              speechVoiceId={speechVoiceId}
              onOpenVoiceSettings={onOpenVoiceSettings}
            />
          ) : null}
          {tab === "storyboard" ? (
            <StoryboardPanel
              assets={assets}
              columns={columns}
              imageRatio={imageRatio}
              projectId={projectId}
              rows={rows}
              skills={skills}
              skillsError={skillsError}
            skillsLoading={skillsLoading}
            storyboardSkill={storyboardSkill}
            projectTaste={projectTaste}
            tastes={tastes}
            tastesError={tastesError}
            tastesLoading={tastesLoading}
            storyboardBusyAction={storyboardBusyAction}
            storyboardGenerating={storyboardGenerating}
            storyboardImageGeneratingRowIds={storyboardImageGeneratingRowIds}
            storyboardVideoGeneratingRowIds={storyboardVideoGeneratingRowIds}
            storyboardImageGenerationTasks={storyboardImageGenerationTasks}
            storyboardVideoGenerationTasks={storyboardVideoGenerationTasks}
              onCreateStoryboards={onCreateStoryboards}
              onDeleteStoryboards={onDeleteStoryboards}
              onDuplicateStoryboards={onDuplicateStoryboards}
              onGenerateStoryboardImages={(mode) => {
                setAgentSidebarVisible(true);
                onGenerateStoryboardImages(mode);
              }}
              onGenerateStoryboardImageRows={async (rowIds, userMessage) => {
                setAgentSidebarVisible(true);
                await onGenerateStoryboardImageRows(rowIds, userMessage);
              }}
              onGenerateStoryboardVideos={(mode, methodFilter) => {
                setAgentSidebarVisible(true);
                onGenerateStoryboardVideos(mode, methodFilter);
              }}
              onGenerateStoryboardVideoRows={async (rowIds, userMessage) => {
                setAgentSidebarVisible(true);
                await onGenerateStoryboardVideoRows(rowIds, userMessage);
              }}
              onRetryStoryboardTask={async (task) => {
                setAgentSidebarVisible(true);
                await onRetryStoryboardTask(task);
              }}
              onCancelStoryboardVideoGenerations={onCancelStoryboardVideoGenerations}
              onGenerateStoryboard={() => {
                setAgentSidebarVisible(true);
                onGenerateStoryboard();
              }}
              onChooseProjectAssets={onChooseProjectAssets}
              onImageRatioChange={onImageRatioChange}
              onLoadSkills={onLoadSkills}
              onStoryboardSkillChange={onStoryboardSkillChange}
              onLoadTastes={onLoadTastes}
              onProjectTasteChange={onProjectTasteChange}
              onImportClipboardImageAsShotMedia={onImportClipboardImageAsShotMedia}
              onImportShotMediaPaths={onImportShotMediaPaths}
              onInsertStoryboard={onInsertStoryboard}
              onChooseShotMedia={onChooseShotMedia}
              suppressEmptyGenerateAction={suppressStoryboardEmptyGenerateAction}
              onReorderRows={onReorderRows}
              onSaveColumns={onSaveColumns}
              onUpdateCell={onUpdateCell}
              onUpdateShotMedia={onUpdateShotMedia}
            />
          ) : null}
          {tab === "assets" ? (
            <AssetsPanel
              assets={assets}
              dropText={dropText}
              projectId={projectId}
              projectName={projectName}
              scope="preview"
              showHeading={false}
              onAssetDropNoticeChange={onAssetDropNoticeChange}
              onChooseProjectAssets={onChooseProjectAssets}
              onDeleteAssets={onDeleteAssets}
              onImportAssetPaths={onImportAssetPaths}
              onRenameAsset={onRenameAsset}
            />
          ) : null}
        </div>
        {shouldUseAgentSidebar ? (
          <>
            <button
              className="agent-resize-handle"
              type="button"
              aria-label={t("workspace.resizeAgent")}
              aria-hidden={!agentSidebarVisible}
              disabled={!agentSidebarVisible}
              onPointerDown={startAgentSidebarResize}
            />
            <AgentPanel
              isCollapsed={!agentSidebarVisible}
              conversations={agentConversations}
              activeConversationId={activeAgentConversationId}
              agentMessages={agentMessages}
              agentOperationConfirmations={agentOperationConfirmations}
              agentImageAttachments={agentImageAttachments}
              agentBusy={agentBusy}
              runningAgentClientRunIds={runningAgentClientRunIds}
              runningAgentConversationIds={runningAgentConversationIds}
              localCliAgents={localCliAgents}
              selectedCliId={selectedCliId}
              selectedCliName={selectedCliName}
              selectedCliConnectionState={selectedCliConnectionState}
              selectedCliConnectionLabel={selectedCliConnectionLabel}
              selectedCliStatusBusy={selectedCliStatusBusy}
              selectedAgentModel={selectedAgentModel}
              selectedAgentEffort={selectedAgentEffort}
              agentPermissionMode={agentPermissionMode}
              mcpBridgeStatus={mcpBridgeStatus}
              onSelectCli={onSelectCli}
              onSelectAgentModel={onSelectAgentModel}
              onSelectAgentEffort={onSelectAgentEffort}
              onChangeAgentPermissionMode={onChangeAgentPermissionMode}
              onOpenRuntimeSettings={onOpenRuntimeSettings}
              onConnectSelectedCli={onConnectSelectedCli}
              onCreateConversation={onCreateAgentConversation}
              onOpenConversation={onOpenAgentConversation}
              onRefreshSelectedCliStatus={onRefreshSelectedCliStatus}
              onStopAgentRun={onStopAgentRun}
              onConfirmAgentOperations={onConfirmAgentOperations}
              onCancelAgentOperations={onCancelAgentOperations}
              onChooseAgentImages={onChooseAgentImages}
              onPasteAgentImage={onPasteAgentImage}
              onRemoveAgentImageAttachment={onRemoveAgentImageAttachment}
              sendAgentMessage={sendAgentMessage}
            />
          </>
        ) : null}
      </div>
      <StoryboardPresentationDialog
        currentIndex={presentationIndex}
        frames={presentationFrames}
        imageRatio={imageRatio}
        projectName={projectName}
        speechVoiceId={speechVoiceId}
        onClose={closePresentation}
        onIndexChange={updatePresentationIndex}
        onOpenVoiceSettings={onOpenVoiceSettings}
      />
    </section>
  );
}

function ScriptPanel({
  scriptRichText,
  setScriptRichText,
  speechVoiceId,
  onOpenVoiceSettings
}: {
  scriptRichText: string;
  setScriptRichText: (value: string) => void;
  speechVoiceId: string;
  onOpenVoiceSettings: () => void;
}) {
  const { t } = useI18n();
  const { speechState, speechError, speak, stopSpeech } = useElevenLabsSpeaker();
  const [readDurationSeconds, setReadDurationSeconds] = useState<number | null>(null);
  const [speechFloatOffset, setSpeechFloatOffset] = useState(readStoredScriptSpeechFloatOffset);
  const speechFloatRef = useRef<HTMLDivElement | null>(null);
  const scriptPlainText = useMemo(() => stripScriptHtmlToPlainText(scriptRichText), [scriptRichText]);
  const speechReady = Boolean(speechVoiceId);
  const speechBusy = speechState !== "idle";

  function startSpeechFloatDrag(event: React.PointerEvent<HTMLSpanElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const startOffset = speechFloatOffset;
    let latestOffset = startOffset;

    function handlePointerMove(moveEvent: PointerEvent) {
      const floatElement = speechFloatRef.current;
      const container = floatElement?.parentElement;
      if (!floatElement || !container) return;
      const requested = { x: startOffset.x + moveEvent.clientX - startX, y: startOffset.y + moveEvent.clientY - startY };
      const floatRect = floatElement.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const deltaX = requested.x - latestOffset.x;
      const deltaY = requested.y - latestOffset.y;
      latestOffset = {
        x: latestOffset.x + Math.min(Math.max(deltaX, containerRect.left - floatRect.left), containerRect.right - floatRect.right),
        y: latestOffset.y + Math.min(Math.max(deltaY, containerRect.top - floatRect.top), containerRect.bottom - floatRect.bottom)
      };
      setSpeechFloatOffset(latestOffset);
    }

    function handlePointerUp() {
      window.removeEventListener("pointermove", handlePointerMove);
      try {
        window.localStorage.setItem(SCRIPT_SPEECH_FLOAT_OFFSET_STORAGE_KEY, JSON.stringify(latestOffset));
      } catch {
        // Local storage can be unavailable in hardened shells; keep the in-memory position.
      }
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  }

  useEffect(() => {
    setReadDurationSeconds(null);
  }, [scriptPlainText]);

  async function playScriptSpeech() {
    const result = await speak(speechVoiceId, scriptPlainText);
    if (result.completed) setReadDurationSeconds(result.durationSeconds);
  }

  async function toggleScriptSpeech() {
    if (speechBusy) {
      stopSpeech();
      return;
    }
    if (!speechReady) {
      onOpenVoiceSettings();
      return;
    }
    if (!scriptPlainText) return;
    await playScriptSpeech();
  }

  // Switching tabs unmounts this panel while the main process keeps generating the voiceover.
  // On return, pick the running request back up (the main process joins it, so no second paid call).
  const speechResumeCheckedRef = useRef(false);
  const speechPanelMountedRef = useRef(true);
  useEffect(() => {
    speechPanelMountedRef.current = true;
    return () => {
      speechPanelMountedRef.current = false;
    };
  }, []);
  useEffect(() => {
    if (speechResumeCheckedRef.current || !speechVoiceId || !scriptPlainText || !window.mkboard?.getElevenLabsSpeechStatus) return;
    speechResumeCheckedRef.current = true;
    void window.mkboard
      .getElevenLabsSpeechStatus({ voiceId: speechVoiceId, texts: splitTextIntoSpeechSegments(scriptPlainText) })
      .then((states) => {
        if (speechPanelMountedRef.current && states.includes("generating")) void playScriptSpeech();
      })
      .catch(() => undefined);
  }, [speechVoiceId, scriptPlainText]);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3]
        }
      }),
      Placeholder.configure({
        placeholder: t("script.placeholder")
      })
    ],
    content: scriptRichText,
    editorProps: {
      attributes: {
        "aria-label": t("script.bodyLabel"),
        spellcheck: "false"
      }
    },
    immediatelyRender: false,
    onUpdate: ({ editor: currentEditor }) => {
      setScriptRichText(currentEditor.getHTML());
    }
  });

  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() === scriptRichText) return;
    editor.commands.setContent(scriptRichText, { emitUpdate: false });
  }, [editor, scriptRichText]);

  return (
    <section className="tab-panel active" aria-label={t("script.label")}>
      <div className="editor-shell">
        <div className="script-layout rich-text-layout">
          <div
            className="script-speech-float"
            ref={speechFloatRef}
            style={{ transform: `translate(${speechFloatOffset.x}px, ${speechFloatOffset.y}px)` }}
          >
            {speechError ? (
              <span className="script-speech-note error">{t(getSpeechErrorKey(speechError))}</span>
            ) : !speechReady ? (
              <span className="script-speech-note">{t("speech.setupHint")}</span>
            ) : null}
            <span className="script-speech-controls">
              <span
                className="script-speech-drag-handle"
                aria-hidden="true"
                onPointerDown={startSpeechFloatDrag}
              >
                <GripVertical />
              </span>
              {readDurationSeconds !== null ? (
                <span className="script-speech-duration actual">
                  <CircleCheck aria-hidden="true" />
                  {t("script.speech.actualDuration", { duration: formatSpeechDuration(readDurationSeconds) })}
                </span>
              ) : null}
              <button
                className={cn("script-speech-button", speechBusy && "busy")}
                disabled={!scriptPlainText && speechReady}
                type="button"
                onClick={() => void toggleScriptSpeech()}
              >
                {speechState === "loading" ? (
                  <LoaderCircle className="spinning" aria-hidden="true" />
                ) : speechState === "playing" ? (
                  <Pause aria-hidden="true" />
                ) : (
                  <AudioLines aria-hidden="true" />
                )}
                {speechState === "loading"
                  ? t("script.speech.generating")
                  : speechState === "playing"
                    ? t("script.speech.stop")
                    : speechReady
                      ? t("script.speech.read")
                      : t("speech.setupAction")}
              </button>
            </span>
          </div>
          <article className="rich-text-pane onboarding-script-target" aria-label={t("script.editorLabel")}>
            <span className="onboarding-floating-anchor onboarding-script-anchor" aria-hidden="true" />
            <EditorContent className="rich-text-editor" editor={editor} />
          </article>
        </div>
      </div>
    </section>
  );
}

function StoryboardPanel({
  assets,
  columns,
  rows,
  imageRatio,
  projectId,
  skills,
  skillsError,
  skillsLoading,
  storyboardSkill,
  projectTaste,
  tastes,
  tastesError,
  tastesLoading,
  storyboardBusyAction,
  storyboardGenerating,
  storyboardImageGeneratingRowIds,
  storyboardVideoGeneratingRowIds,
  storyboardImageGenerationTasks,
  storyboardVideoGenerationTasks,
  onCreateStoryboards,
  onDeleteStoryboards,
  onDuplicateStoryboards,
  onGenerateStoryboardImages,
  onGenerateStoryboardImageRows,
  onGenerateStoryboardVideos,
  onGenerateStoryboardVideoRows,
  onRetryStoryboardTask,
  onCancelStoryboardVideoGenerations,
  onGenerateStoryboard,
  onChooseProjectAssets,
  onImageRatioChange,
  onLoadSkills,
  onStoryboardSkillChange,
  onLoadTastes,
  onProjectTasteChange,
  onImportClipboardImageAsShotMedia,
  onImportShotMediaPaths,
  onInsertStoryboard,
  onChooseShotMedia,
  suppressEmptyGenerateAction,
  onReorderRows,
  onSaveColumns,
  onUpdateCell,
  onUpdateShotMedia
}: {
  assets: ProjectAsset[];
  columns: StoryboardColumn[];
  rows: StoryboardRow[];
  imageRatio: ImageRatio;
  projectId: string;
  skills: Skill[];
  skillsError: string | null;
  skillsLoading: boolean;
  storyboardSkill: ProjectSkill | null;
  projectTaste: ProjectTaste | null;
  tastes: Taste[];
  tastesError: string | null;
  tastesLoading: boolean;
  storyboardBusyAction: StoryboardAiAction | null;
  storyboardGenerating: boolean;
  storyboardImageGeneratingRowIds: Set<string>;
  storyboardVideoGeneratingRowIds: Set<string>;
  storyboardImageGenerationTasks: StoryboardGenerationTaskItem[];
  storyboardVideoGenerationTasks: StoryboardGenerationTaskItem[];
  onCreateStoryboards: (count: number) => Promise<void>;
  onDeleteStoryboards: (rowIds: string[]) => Promise<void>;
  onDuplicateStoryboards: (rowIds: string[]) => Promise<void>;
  onGenerateStoryboardImages: (mode: StoryboardMediaGenerationMode) => void;
  onGenerateStoryboardImageRows: (rowIds: string[], userMessage?: string) => Promise<void>;
  onGenerateStoryboardVideos: (mode: StoryboardMediaGenerationMode, methodFilter?: StoryboardVideoGenerationMethodFilter) => void;
  onGenerateStoryboardVideoRows: (rowIds: string[], userMessage?: string) => Promise<void>;
  onRetryStoryboardTask: (task: StoryboardGenerationTaskItem) => Promise<void>;
  onCancelStoryboardVideoGenerations: () => Promise<void>;
  onGenerateStoryboard: () => void;
  onChooseProjectAssets: ChooseProjectAssetsHandler;
  onImageRatioChange: (imageRatio: ImageRatio) => void;
  onLoadSkills: () => Promise<Skill[]>;
  onStoryboardSkillChange: (skillId: string) => Promise<ProjectSkill>;
  onLoadTastes: () => Promise<Taste[]>;
  onProjectTasteChange: (tasteId: string) => Promise<ProjectTaste>;
  onImportClipboardImageAsShotMedia: (rowId: string) => void;
  onImportShotMediaPaths: (rowId: string, filePaths: string[]) => void;
  onInsertStoryboard: (rowId: string, placement: "before" | "after") => Promise<void>;
  onChooseShotMedia: (rowId: string) => void;
  suppressEmptyGenerateAction: boolean;
  onReorderRows: (sourceRowId: string, targetRowId: string) => void;
  onSaveColumns: (columns: StoryboardColumn[]) => void;
  onUpdateCell: UpdateStoryboardCellHandler;
  onUpdateShotMedia: (rowId: string, assetIds: string[]) => void;
}) {
  const { locale, t } = useI18n();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsMode, setSettingsMode] = useState<"menu" | "ratio">("menu");
  const [skillDialogOpen, setSkillDialogOpen] = useState(false);
  const [skillDialogError, setSkillDialogError] = useState<string | null>(null);
  const [savingSkillId, setSavingSkillId] = useState<string | null>(null);
  const [tasteDialogOpen, setTasteDialogOpen] = useState(false);
  const [tasteDialogError, setTasteDialogError] = useState<string | null>(null);
  const [savingTasteId, setSavingTasteId] = useState<string | null>(null);
  const [aiActionOpen, setAiActionOpen] = useState(false);
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectionOpen, setSelectionOpen] = useState(false);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [localMutationAction, setLocalMutationAction] = useState<StoryboardLocalMutationAction | null>(null);
  const [selectedImageGenerationSubmitting, setSelectedImageGenerationSubmitting] = useState(false);
  const [selectedImageGenerationSubmittingCount, setSelectedImageGenerationSubmittingCount] = useState(0);
  const [selectedVideoGenerationSubmitting, setSelectedVideoGenerationSubmitting] = useState(false);
  const [selectedVideoGenerationSubmittingCount, setSelectedVideoGenerationSubmittingCount] = useState(0);
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [generationStatusOpen, setGenerationStatusOpen] = useState(false);
  const [generationStatusAction, setGenerationStatusAction] = useState<StoryboardAiAction | null>(null);
  const [pendingAiAction, setPendingAiAction] = useState<StoryboardAiAction | null>(null);
  const [columnWidths, setColumnWidths] = useState<StoryboardColumnWidths>({});
  const [draggingRowId, setDraggingRowId] = useState<string | null>(null);
  const [activeColumnMenuId, setActiveColumnMenuId] = useState<StoryboardColumnId | null>(null);
  const [editingColumnId, setEditingColumnId] = useState<StoryboardColumnId | null>(null);
  const [columnDraftTitle, setColumnDraftTitle] = useState("");
  const [columnDraftType, setColumnDraftType] = useState<StoryboardColumnType>("text");
  const [customColumnName, setCustomColumnName] = useState("");
  const [assetDrawerRowId, setAssetDrawerRowId] = useState<string | null>(null);
  const selectedImageGenerationAutoCloseTimerRef = useRef<number | null>(null);
  const selectedImageGenerationStartedRef = useRef(false);
  const selectedImageGenerationTargetRowIdsRef = useRef<Set<string>>(new Set());
  const selectedVideoGenerationAutoCloseTimerRef = useRef<number | null>(null);
  const selectedVideoGenerationStartedRef = useRef(false);
  const selectedVideoGenerationTargetRowIdsRef = useRef<Set<string>>(new Set());
  const nextCustomColumnIndex = getNextCustomColumnIndex(columns);
  const storyboardParsing = storyboardBusyAction === "parse";
  const selectedRowIdSet = useMemo(() => new Set(selectedRowIds), [selectedRowIds]);
  const selectedRowsIncludeGenerating = useMemo(
    () => selectedRowIds.some((rowId) => storyboardImageGeneratingRowIds.has(rowId) || storyboardVideoGeneratingRowIds.has(rowId)),
    [selectedRowIds, storyboardImageGeneratingRowIds, storyboardVideoGeneratingRowIds]
  );
  const selectedImageGenerationRowIds = useMemo(
    () => getStoryboardMediaGenerationTargetRowIds("images", rows, columns, imageRatio, selectedRowIdSet).filter((rowId) => !storyboardImageGeneratingRowIds.has(rowId)),
    [columns, imageRatio, rows, selectedRowIdSet, storyboardImageGeneratingRowIds]
  );
  const selectedVideoGenerationRowIds = useMemo(
    () => getStoryboardMediaGenerationTargetRowIds("videos", rows, columns, imageRatio, selectedRowIdSet).filter((rowId) => !storyboardVideoGeneratingRowIds.has(rowId)),
    [columns, imageRatio, rows, selectedRowIdSet, storyboardVideoGeneratingRowIds]
  );
  const allRowsSelected = rows.length > 0 && selectedRowIds.length === rows.length;
  const assetDrawerRow = assetDrawerRowId ? rows.find((row) => row.id === assetDrawerRowId) ?? null : null;
  const hasImageGenerationHistory = storyboardImageGenerationTasks.length > 0;
  const hasVideoGenerationHistory = storyboardVideoGenerationTasks.length > 0;
  const hasGenerationHistory = hasImageGenerationHistory || hasVideoGenerationHistory;

  useEffect(() => {
    const currentRowIds = new Set(rows.map((row) => row.id));
    setSelectedRowIds((currentIds) => {
      const nextIds = currentIds.filter((rowId) => currentRowIds.has(rowId));
      return nextIds.length === currentIds.length ? currentIds : nextIds;
    });
  }, [rows]);

  useEffect(() => {
    if ((selectedRowIds.length === 0 || selectedRowsIncludeGenerating) && deleteConfirmationOpen) {
      setDeleteConfirmationOpen(false);
    }
  }, [deleteConfirmationOpen, selectedRowIds.length, selectedRowsIncludeGenerating]);

  useEffect(() => {
    if (!selectedImageGenerationSubmitting || selectedRowIds.length === 0) return undefined;
    const generationStarted = storyboardImageGenerationTasks.some(
      (task) => selectedImageGenerationTargetRowIdsRef.current.has(task.rowId) && isActiveGenerationTaskStatus(task.status)
    );
    if (!generationStarted || selectedImageGenerationAutoCloseTimerRef.current) return undefined;
    selectedImageGenerationStartedRef.current = true;
    selectedImageGenerationAutoCloseTimerRef.current = window.setTimeout(() => {
      selectedImageGenerationAutoCloseTimerRef.current = null;
      clearSelectedRows();
    }, 2000);
    return undefined;
  }, [selectedImageGenerationSubmitting, selectedRowIds.length, storyboardImageGenerationTasks]);

  useEffect(() => {
    if (!selectedVideoGenerationSubmitting || selectedRowIds.length === 0) return undefined;
    const generationStarted = storyboardVideoGenerationTasks.some(
      (task) => selectedVideoGenerationTargetRowIdsRef.current.has(task.rowId) && isActiveGenerationTaskStatus(task.status)
    );
    if (!generationStarted) return undefined;
    if (selectedVideoGenerationAutoCloseTimerRef.current) return undefined;
    selectedVideoGenerationStartedRef.current = true;
    selectedVideoGenerationAutoCloseTimerRef.current = window.setTimeout(() => {
      selectedVideoGenerationAutoCloseTimerRef.current = null;
      clearSelectedRows();
    }, 2000);
    return undefined;
  }, [selectedRowIds.length, selectedVideoGenerationSubmitting, storyboardVideoGenerationTasks]);

  useEffect(() => {
    return () => {
      if (selectedImageGenerationAutoCloseTimerRef.current) {
        window.clearTimeout(selectedImageGenerationAutoCloseTimerRef.current);
        selectedImageGenerationAutoCloseTimerRef.current = null;
      }
      if (selectedVideoGenerationAutoCloseTimerRef.current) {
        window.clearTimeout(selectedVideoGenerationAutoCloseTimerRef.current);
        selectedVideoGenerationAutoCloseTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (assetDrawerRowId && !rows.some((row) => row.id === assetDrawerRowId)) {
      setAssetDrawerRowId(null);
    }
  }, [assetDrawerRowId, rows]);

  useEffect(() => {
    if (!storyboardParsing) return;
    setSettingsOpen(false);
    setSettingsMode("menu");
    setSkillDialogOpen(false);
    setSkillDialogError(null);
    setSavingSkillId(null);
    setTasteDialogOpen(false);
    setTasteDialogError(null);
    setSavingTasteId(null);
    setAiActionOpen(false);
    setColumnSettingsOpen(false);
    setCreateOpen(false);
    setSelectionOpen(false);
    setDeleteConfirmationOpen(false);
    setPendingAiAction(null);
    setAssetDrawerRowId(null);
    setSelectedRowIds([]);
    setDraggingRowId(null);
    closeColumnMenu();
  }, [storyboardParsing]);

  useEffect(() => {
    if (storyboardBusyAction === "images" || storyboardBusyAction === "videos") {
      setGenerationStatusAction(storyboardBusyAction);
      return;
    }
    if (storyboardBusyAction === "parse") {
      setGenerationStatusOpen(false);
      setGenerationStatusAction(null);
      return;
    }
    if (!hasGenerationHistory) {
      setGenerationStatusOpen(false);
      setGenerationStatusAction(null);
    }
  }, [hasGenerationHistory, storyboardBusyAction]);

  const anyStoryboardPopoverOpen = aiActionOpen || createOpen || selectionOpen || settingsOpen || columnSettingsOpen || activeColumnMenuId !== null;

  useEffect(() => {
    if (!anyStoryboardPopoverOpen) return;

    function closeOnOutsidePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (
        target.closest(
          [
            ".storyboard-create-popover",
            ".storyboard-create-trigger",
            ".storyboard-ai-popover",
            ".storyboard-ai-trigger",
            ".storyboard-select-popover",
            ".storyboard-select-trigger",
            ".storyboard-settings-popover",
            ".storyboard-settings-trigger",
            ".column-settings-popover",
            ".column-settings-trigger",
            ".storyboard-header-trigger",
            ".header-column-popover",
            ".onboarding-guide"
          ].join(", ")
        )
      ) {
        return;
      }

      closeStoryboardToolPopovers();
      closeColumnMenu();
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      closeStoryboardToolPopovers();
      closeColumnMenu();
    }

    document.addEventListener("pointerdown", closeOnOutsidePointerDown, true);
    document.addEventListener("keydown", closeOnEscape, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointerDown, true);
      document.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [anyStoryboardPopoverOpen]);

  function closeStoryboardToolPopovers() {
    setAiActionOpen(false);
    setCreateOpen(false);
    setSelectionOpen(false);
    setSettingsOpen(false);
    setSettingsMode("menu");
    setColumnSettingsOpen(false);
  }

  function isStoryboardToolLocked(target: "ai" | "create" | "selection" | "settings" | "columns") {
    if (storyboardParsing) return true;
    if (localMutationAction && (target === "ai" || target === "create" || target === "selection")) return true;
    if (target === "selection" || target === "settings" || target === "columns") return false;
    if (target === "create") return false;
    return storyboardGenerating;
  }

  function setStoryboardToolPopover(target: "ai" | "create" | "selection" | "settings" | "columns", open: boolean) {
    if (isStoryboardToolLocked(target) || !open) {
      if (target === "ai") setAiActionOpen(false);
      if (target === "create") setCreateOpen(false);
      if (target === "selection") setSelectionOpen(false);
      if (target === "settings") {
        setSettingsOpen(false);
        setSettingsMode("menu");
      }
      if (target === "columns") setColumnSettingsOpen(false);
      return;
    }

    closeColumnMenu();
    setAiActionOpen(target === "ai");
    setCreateOpen(target === "create");
    setSelectionOpen(target === "selection");
    setSettingsOpen(target === "settings");
    setSettingsMode("menu");
    setColumnSettingsOpen(target === "columns");
  }

  function openColumnMenu(column: StoryboardColumn) {
    if (storyboardParsing) return;
    closeStoryboardToolPopovers();
    setActiveColumnMenuId(column.id);
    setEditingColumnId(null);
    setColumnDraftTitle(getColumnLabel(column, t));
    setColumnDraftType(column.type);
  }

  function closeColumnMenu() {
    setActiveColumnMenuId(null);
    setEditingColumnId(null);
  }

  function startEditingColumn(column: StoryboardColumn) {
    if (storyboardParsing) return;
    setEditingColumnId(column.id);
    setColumnDraftTitle(getColumnLabel(column, t));
    setColumnDraftType(column.type);
  }

  function saveColumnEdit(columnId: StoryboardColumnId) {
    if (storyboardParsing) return;
    const nextTitle = columnDraftTitle.trim();
    onSaveColumns(
      columns.map((column) =>
        column.id === columnId ? { ...column, label: nextTitle || column.label, type: columnDraftType } : column
      )
    );
    closeColumnMenu();
  }

  function updateColumnLabel(columnId: StoryboardColumnId, label: string) {
    if (storyboardParsing) return;
    const nextLabel = label.trim();
    if (!nextLabel) return;
    onSaveColumns(columns.map((column) => (column.id === columnId ? { ...column, label: nextLabel } : column)));
  }

  function updateColumnType(columnId: StoryboardColumnId, type: StoryboardColumnType) {
    if (storyboardParsing) return;
    onSaveColumns(columns.map((column) => (column.id === columnId ? { ...column, type } : column)));
  }

  function toggleColumn(columnId: StoryboardColumnId) {
    if (storyboardParsing) return;
    onSaveColumns(
      columns.map((column) => {
        if (column.id !== columnId || column.locked) return column;
        return { ...column, visible: !column.visible };
      })
    );
  }

  function moveColumn(columnId: StoryboardColumnId, direction: "up" | "down") {
    if (storyboardParsing) return;
    const sourceIndex = columns.findIndex((column) => column.id === columnId);
    const targetIndex = direction === "up" ? sourceIndex - 1 : sourceIndex + 1;
    const sourceColumn = columns[sourceIndex];
    const targetColumn = columns[targetIndex];

    if (!sourceColumn || !targetColumn || sourceColumn.locked || targetColumn.locked) return;

    const nextColumns = [...columns];
    nextColumns[sourceIndex] = targetColumn;
    nextColumns[targetIndex] = sourceColumn;
    onSaveColumns(nextColumns);
  }

  function addCustomColumn() {
    if (storyboardParsing) return;
    const nextIndex = nextCustomColumnIndex;
    const nextColumnId = `custom-${nextIndex}` as StoryboardColumnId;
    const nextLabel = customColumnName.trim() || t("storyboard.customColumnDefault", { index: nextIndex });
    onSaveColumns([
      ...columns,
      {
        id: nextColumnId,
        label: nextLabel,
        type: "text",
        visible: true,
        custom: true
      }
    ]);
    setColumnWidths((currentWidths) => ({ ...currentWidths, [nextColumnId]: getDefaultColumnSize(nextColumnId).width }));
    setCustomColumnName("");
  }

  function hideColumn(columnId: StoryboardColumnId) {
    if (storyboardParsing) return;
    onSaveColumns(
      columns.map((column) => {
        if (column.id !== columnId || column.locked) return column;
        return { ...column, visible: false };
      })
    );
    closeColumnMenu();
  }

  function deleteColumn(columnId: StoryboardColumnId) {
    if (storyboardParsing) return;
    const targetColumn = columns.find((column) => column.id === columnId);
    if (!targetColumn || targetColumn.locked) return;

    onSaveColumns(columns.filter((column) => column.id !== columnId));
    setColumnWidths((currentWidths) => {
      const nextWidths = { ...currentWidths };
      delete nextWidths[columnId];
      return nextWidths;
    });
    closeColumnMenu();
  }

  function showStoryboardLocalMutationError(error: unknown) {
    window.alert(error instanceof Error ? error.message : String(error));
  }

  async function createStoryboards(count: number) {
    if (storyboardParsing) return;
    if (localMutationAction) return;
    setLocalMutationAction({ kind: "create", count });
    try {
      await onCreateStoryboards(count);
      setCreateOpen(false);
    } catch (error) {
      showStoryboardLocalMutationError(error);
    } finally {
      setLocalMutationAction(null);
    }
  }

  function toggleRowSelection(rowId: string) {
    if (storyboardParsing) return;
    setSelectedRowIds((currentIds) => (currentIds.includes(rowId) ? currentIds.filter((id) => id !== rowId) : [...currentIds, rowId]));
  }

  function selectEmptyImageRows() {
    if (storyboardParsing) return;
    setSelectedRowIds(rows.filter(isStoryboardRowMissingImage).map((row) => row.id));
    setSelectionOpen(false);
  }

  function selectAllRows() {
    if (storyboardParsing) return;
    setSelectedRowIds(rows.map((row) => row.id));
    setSelectionOpen(false);
  }

  function clearSelectedRows() {
    if (selectedImageGenerationAutoCloseTimerRef.current) {
      window.clearTimeout(selectedImageGenerationAutoCloseTimerRef.current);
      selectedImageGenerationAutoCloseTimerRef.current = null;
    }
    if (selectedVideoGenerationAutoCloseTimerRef.current) {
      window.clearTimeout(selectedVideoGenerationAutoCloseTimerRef.current);
      selectedVideoGenerationAutoCloseTimerRef.current = null;
    }
    setSelectedImageGenerationSubmitting(false);
    setSelectedImageGenerationSubmittingCount(0);
    setSelectedVideoGenerationSubmitting(false);
    setSelectedVideoGenerationSubmittingCount(0);
    setSelectedRowIds([]);
    setSelectionOpen(false);
  }

  function toggleAllRows() {
    if (allRowsSelected) {
      clearSelectedRows();
      return;
    }
    selectAllRows();
  }

  async function duplicateSelectedRows() {
    if (storyboardParsing || selectedRowIds.length === 0) return;
    if (localMutationAction) return;
    setLocalMutationAction({ kind: "duplicate" });
    try {
      await onDuplicateStoryboards(selectedRowIds);
      clearSelectedRows();
    } catch (error) {
      showStoryboardLocalMutationError(error);
    } finally {
      setLocalMutationAction(null);
    }
  }

  async function deleteSelectedRows() {
    if (selectedRowsIncludeGenerating) return;
    if (selectedRowIds.length === 0) {
      setDeleteConfirmationOpen(false);
      return;
    }
    if (localMutationAction) return;
    setLocalMutationAction({ kind: "delete" });
    try {
      await onDeleteStoryboards(selectedRowIds);
      clearSelectedRows();
      setDeleteConfirmationOpen(false);
    } catch (error) {
      showStoryboardLocalMutationError(error);
    } finally {
      setLocalMutationAction(null);
    }
  }

  function requestDeleteSelectedRows() {
    if (localMutationAction || selectedRowsIncludeGenerating || selectedRowIds.length === 0) return;
    setDeleteConfirmationOpen(true);
  }

  async function generateSelectedStoryboardImages() {
    if (storyboardParsing || selectedImageGenerationSubmitting || selectedVideoGenerationSubmitting || selectedRowIds.length === 0) return;
    closeStoryboardToolPopovers();
    closeColumnMenu();

    if (selectedImageGenerationRowIds.length === 0) {
      window.alert(t("storyboard.selectedShotsNoImageTargetsAlert"));
      return;
    }

    const targetRowIds = [...selectedImageGenerationRowIds];
    setSelectedImageGenerationSubmitting(true);
    setSelectedImageGenerationSubmittingCount(targetRowIds.length);
    selectedImageGenerationStartedRef.current = false;
    selectedImageGenerationTargetRowIdsRef.current = new Set(targetRowIds);
    try {
      await onGenerateStoryboardImageRows(targetRowIds, t("storyboard.generateSelectedShotImages", { count: targetRowIds.length }));
    } finally {
      const generationStarted = selectedImageGenerationStartedRef.current;
      selectedImageGenerationStartedRef.current = false;
      selectedImageGenerationTargetRowIdsRef.current = new Set();
      if (!generationStarted || !selectedImageGenerationAutoCloseTimerRef.current) {
        setSelectedImageGenerationSubmitting(false);
        setSelectedImageGenerationSubmittingCount(0);
      }
    }
  }

  async function generateSelectedStoryboardVideos() {
    if (storyboardParsing || selectedVideoGenerationSubmitting || selectedRowIds.length === 0) return;
    closeStoryboardToolPopovers();
    closeColumnMenu();

    if (selectedVideoGenerationRowIds.length === 0) {
      window.alert(t("storyboard.selectedShotsNoVideoTargetsAlert"));
      return;
    }

    const targetRowIds = [...selectedVideoGenerationRowIds];
    setSelectedVideoGenerationSubmitting(true);
    setSelectedVideoGenerationSubmittingCount(targetRowIds.length);
    selectedVideoGenerationStartedRef.current = false;
    selectedVideoGenerationTargetRowIdsRef.current = new Set(targetRowIds);
    try {
      await onGenerateStoryboardVideoRows(
        targetRowIds,
        t("storyboard.generateSelectedShotVideos", { count: targetRowIds.length })
      );
    } finally {
      const generationStarted = selectedVideoGenerationStartedRef.current;
      selectedVideoGenerationStartedRef.current = false;
      selectedVideoGenerationTargetRowIdsRef.current = new Set();
      if (!generationStarted) {
        clearSelectedRows();
        setSelectedVideoGenerationSubmitting(false);
      } else if (!selectedVideoGenerationAutoCloseTimerRef.current) {
        setSelectedVideoGenerationSubmitting(false);
        setSelectedVideoGenerationSubmittingCount(0);
      }
    }
  }

  function reorderStoryboardRows(sourceRowId: string, targetRowId: string) {
    if (storyboardParsing) return;
    onReorderRows(sourceRowId, targetRowId);
  }

  async function insertStoryboardAtRow(rowId: string, placement: "before" | "after") {
    if (storyboardParsing) return;
    if (localMutationAction) return;
    setLocalMutationAction({ kind: "insert", rowId, placement });
    try {
      await onInsertStoryboard(rowId, placement);
    } catch (error) {
      showStoryboardLocalMutationError(error);
    } finally {
      setLocalMutationAction(null);
    }
  }

  function openStoryboardAssetDrawer(rowId: string) {
    if (storyboardParsing) return;
    closeStoryboardToolPopovers();
    closeColumnMenu();
    setAssetDrawerRowId(rowId);
  }

  async function openStoryboardSkillDialog() {
    if (storyboardParsing) return;
    setSettingsOpen(false);
    setSettingsMode("menu");
    setSkillDialogError(null);
    setSkillDialogOpen(true);
    if (skills.length > 0 || skillsLoading) return;
    try {
      await onLoadSkills();
    } catch (error) {
      setSkillDialogError(error instanceof Error ? error.message : String(error));
    }
  }

  async function selectStoryboardSkill(skillId: string) {
    if (storyboardParsing || savingSkillId || skillId === storyboardSkill?.id) return;
    setSavingSkillId(skillId);
    setSkillDialogError(null);
    try {
      await onStoryboardSkillChange(skillId);
      setSkillDialogOpen(false);
    } catch (error) {
      setSkillDialogError(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingSkillId(null);
    }
  }

  async function reloadStoryboardSkills() {
    setSkillDialogError(null);
    try {
      await onLoadSkills();
    } catch (error) {
      setSkillDialogError(error instanceof Error ? error.message : String(error));
    }
  }

  async function openProjectTasteDialog() {
    if (storyboardParsing) return;
    setSettingsOpen(false);
    setSettingsMode("menu");
    setTasteDialogError(null);
    setTasteDialogOpen(true);
    if (tastes.length > 0 || tastesLoading) return;
    try {
      await onLoadTastes();
    } catch (error) {
      setTasteDialogError(error instanceof Error ? error.message : String(error));
    }
  }

  async function selectProjectTaste(tasteId: string) {
    if (storyboardParsing || savingTasteId || tasteId === projectTaste?.id) return;
    setSavingTasteId(tasteId);
    setTasteDialogError(null);
    try {
      await onProjectTasteChange(tasteId);
      setTasteDialogOpen(false);
    } catch (error) {
      setTasteDialogError(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingTasteId(null);
    }
  }

  async function reloadProjectTastes() {
    setTasteDialogError(null);
    try {
      await onLoadTastes();
    } catch (error) {
      setTasteDialogError(error instanceof Error ? error.message : String(error));
    }
  }

  function resizeStoryboardColumn(columnId: StoryboardColumnId, nextWidth: number) {
    if (storyboardParsing) return;
    const size = getDefaultColumnSize(columnId);
    const boundedWidth = Math.min(size.maxWidth, Math.max(size.minWidth, Math.round(nextWidth)));
    setColumnWidths((currentWidths) => ({ ...currentWidths, [columnId]: boundedWidth }));
  }

  function requestStoryboardAiAction(action: StoryboardAiAction) {
    if (storyboardGenerating || localMutationAction) return;
    closeStoryboardToolPopovers();
    closeColumnMenu();
    if (action === "parse" && rows.length === 0) {
      setPendingAiAction(null);
      onGenerateStoryboard();
      return;
    }
    setPendingAiAction(action);
  }

  function closeStoryboardAiConfirmation() {
    setPendingAiAction(null);
  }

  function confirmStoryboardAiAction(mode: StoryboardMediaGenerationMode = "missing", methodFilter: StoryboardVideoGenerationMethodFilter = "all") {
    const action = pendingAiAction;
    closeStoryboardAiConfirmation();
    if (action === "parse") {
      onGenerateStoryboard();
      return;
    }

    if (action === "images") {
      onGenerateStoryboardImages(mode);
      return;
    }

    if (action === "videos") {
      onGenerateStoryboardVideos(mode, methodFilter);
    }
  }

  function getDefaultGenerationStatusAction(): StoryboardAiAction | null {
    if (storyboardBusyAction === "images" || storyboardBusyAction === "videos") return storyboardBusyAction;
    if (hasVideoGenerationHistory) return "videos";
    if (hasImageGenerationHistory) return "images";
    return generationStatusAction;
  }

  function openGenerationStatus() {
    const nextAction = getDefaultGenerationStatusAction();
    if (nextAction !== "images" && nextAction !== "videos") return;
    closeStoryboardToolPopovers();
    closeColumnMenu();
    setGenerationStatusAction(nextAction);
    setGenerationStatusOpen(true);
  }

  function openGenerationStatusIfBusy() {
    if (storyboardBusyAction !== "images" && storyboardBusyAction !== "videos") return;
    openGenerationStatus();
  }

  function closeGenerationStatus() {
    setGenerationStatusOpen(false);
    if (storyboardBusyAction !== "images" && storyboardBusyAction !== "videos") {
      setGenerationStatusAction(null);
    }
  }

  const canOpenGenerationStatus = storyboardBusyAction === "images" || storyboardBusyAction === "videos";
  const showEmptyStoryboardCard = rows.length === 0 && storyboardBusyAction !== "parse" && !suppressEmptyGenerateAction;

  return (
    <section className="tab-panel storyboard-panel active onboarding-storyboard-target" aria-label={t("storyboard.label")}>
      <span className="onboarding-floating-anchor onboarding-storyboard-anchor" aria-hidden="true" />
      <div className="storyboard-main">
        <div className="storyboard-content-toolbar" aria-label={t("storyboard.toolbar")}>
          <div className="storyboard-content-primary">
            <Popover isOpen={createOpen && !storyboardParsing} onOpenChange={(open) => setStoryboardToolPopover("create", open)}>
              <Popover.Trigger>
                <Button className="storyboard-primary-action storyboard-create-trigger" isDisabled={storyboardParsing || Boolean(localMutationAction)} variant="primary">
                  <Plus aria-hidden="true" />
                  {t("storyboard.new")}
                  <span className="storyboard-create-separator" aria-hidden="true" />
                  <ChevronDown className={cn("settings-chevron", createOpen && "open")} aria-hidden="true" />
                </Button>
              </Popover.Trigger>
              <Popover.Content className="storyboard-create-popover" isNonModal offset={10} placement="bottom start">
                <Popover.Dialog>
                  <div className="storyboard-create-menu" aria-label={t("storyboard.newMenu")}>
                    {storyboardCreateOptions.map((option) => (
                      <button
                        aria-busy={localMutationAction?.kind === "create" && localMutationAction.count === option.count}
                        type="button"
                        disabled={Boolean(localMutationAction)}
                        key={option.count}
                        onClick={() => void createStoryboards(option.count)}
                      >
                        <span className="create-shot-icon" aria-hidden="true">
                          {localMutationAction?.kind === "create" && localMutationAction.count === option.count ? <LoaderCircle className="spinning" /> : <CirclePlus />}
                        </span>
                        <span>{option.count === 1 ? t("storyboard.createOne") : t("storyboard.createCount", { count: option.count })}</span>
                      </button>
                    ))}
                  </div>
                </Popover.Dialog>
              </Popover.Content>
            </Popover>
          </div>
          <div className="storyboard-content-actions">
            <Popover isOpen={aiActionOpen && !storyboardGenerating} onOpenChange={(open) => setStoryboardToolPopover("ai", open)}>
              <Popover.Trigger>
                <Button
                  className="storyboard-toolbar-button storyboard-generate-button storyboard-ai-trigger onboarding-storyboard-ai-trigger"
                  isDisabled={storyboardBusyAction === "parse" || Boolean(localMutationAction)}
                  variant="outline"
                  onPress={canOpenGenerationStatus ? openGenerationStatusIfBusy : undefined}
                >
                  {storyboardGenerating ? <LoaderCircle className="spinning" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
                  {storyboardGenerating && storyboardBusyAction ? t(getStoryboardBusyLabelKey(storyboardBusyAction)) : t("storyboard.aiStoryboard")}
                </Button>
              </Popover.Trigger>
              <Popover.Content className="storyboard-create-popover storyboard-ai-popover" isNonModal offset={10} placement="bottom end">
                <Popover.Dialog>
                  <div className="storyboard-create-menu storyboard-ai-menu" aria-label={t("storyboard.aiMenu")}>
                    {hasGenerationHistory ? (
                      <button type="button" onClick={openGenerationStatus}>
                        <span className="create-shot-icon" aria-hidden="true">
                          <Clock />
                        </span>
                        <strong>{t("storyboard.generationHistory")}</strong>
                      </button>
                    ) : null}
                    <button type="button" onClick={() => requestStoryboardAiAction("parse")}>
                      <span className="create-shot-icon" aria-hidden="true">
                        <WandSparkles />
                      </span>
                      <strong>{t("storyboard.aiParse")}</strong>
                    </button>
                    <button type="button" onClick={() => requestStoryboardAiAction("images")}>
                      <span className="create-shot-icon" aria-hidden="true">
                        <Images />
                      </span>
                      <strong>{t("storyboard.aiGenerateImages")}</strong>
                    </button>
                    <button type="button" onClick={() => requestStoryboardAiAction("videos")}>
                      <span className="create-shot-icon" aria-hidden="true">
                        <Video />
                      </span>
                      <strong>{t("storyboard.aiGenerateVideos")}</strong>
                    </button>
                  </div>
                </Popover.Dialog>
              </Popover.Content>
            </Popover>
            {allRowsSelected ? (
              <Button className="storyboard-toolbar-button storyboard-select-trigger selected" isDisabled={storyboardParsing || Boolean(localMutationAction) || rows.length === 0} variant="outline" onPress={clearSelectedRows}>
                <CheckCheck aria-hidden="true" />
                {t("storyboard.deselectAllShots")}
              </Button>
            ) : (
              <Popover isOpen={selectionOpen && !storyboardParsing} onOpenChange={(open) => setStoryboardToolPopover("selection", open)}>
                <Popover.Trigger>
                  <Button className="storyboard-toolbar-button storyboard-select-trigger" isDisabled={storyboardParsing || Boolean(localMutationAction) || rows.length === 0} variant="outline">
                    <CheckCheck aria-hidden="true" />
                    {t("storyboard.select")}
                  </Button>
                </Popover.Trigger>
                <Popover.Content className="storyboard-select-popover" isNonModal offset={10} placement="bottom end">
                  <Popover.Dialog>
                    <div className="storyboard-create-menu storyboard-select-menu" aria-label={t("storyboard.selectMenu")}>
                      <button type="button" onClick={selectEmptyImageRows}>
                        <span className="create-shot-icon" aria-hidden="true">
                          <CheckCheck />
                        </span>
                        <span>{t("storyboard.selectEmptyShots")}</span>
                      </button>
                      <button type="button" onClick={selectAllRows}>
                        <span className="create-shot-icon" aria-hidden="true">
                          <Check />
                        </span>
                        <span>{t("storyboard.selectAllShots")}</span>
                      </button>
                    </div>
                  </Popover.Dialog>
                </Popover.Content>
              </Popover>
            )}
            <Popover isOpen={settingsOpen && !storyboardParsing} onOpenChange={(open) => setStoryboardToolPopover("settings", open)}>
              <Popover.Trigger>
                <Button className="storyboard-toolbar-button storyboard-settings-trigger" isDisabled={storyboardParsing} variant="outline">
                  <Settings aria-hidden="true" />
                  {t("storyboard.settings")}
                  <span className="settings-ratio-pill">{imageRatio}</span>
                </Button>
              </Popover.Trigger>
              <Popover.Content className="storyboard-settings-popover" isNonModal offset={10} placement="bottom end">
                <Popover.Dialog>
                  <div className="storyboard-settings-panel">
                    {settingsMode === "menu" ? (
                      <>
                        <div className="settings-panel-header">
                          <div>
                            <strong>{t("storyboard.settings")}</strong>
                          </div>
                        </div>
                        <div className="storyboard-settings-menu" aria-label={t("storyboard.settingsMenu")}>
                          <button type="button" onClick={() => setSettingsMode("ratio")}>
                            <span className="settings-menu-icon" aria-hidden="true">
                              <AspectRatioIcon ratio={imageRatio} />
                            </span>
                            <span className="settings-menu-copy">
                              <strong>{t("storyboard.ratioSettings")}</strong>
                              <small>{t("storyboard.ratioSettingsDescription", { ratio: imageRatio })}</small>
                            </span>
                            <span className="settings-menu-value">{imageRatio}</span>
                            <ChevronRight aria-hidden="true" />
                          </button>
                          <button type="button" onClick={() => void openStoryboardSkillDialog()}>
                            <span className="settings-menu-icon" aria-hidden="true">
                              <Lightbulb />
                            </span>
                            <span className="settings-menu-copy">
                              <strong>{t("storyboard.skillSettings")}</strong>
                              <small>{storyboardSkill?.name ?? t("storyboard.skillNotSelected")}</small>
                            </span>
                            <ChevronRight aria-hidden="true" />
                          </button>
                          <button type="button" onClick={() => void openProjectTasteDialog()}>
                            <span className="settings-menu-icon" aria-hidden="true">
                              <Palette />
                            </span>
                            <span className="settings-menu-copy">
                              <strong>{t("storyboard.tasteSettings")}</strong>
                              <small>{projectTaste ? getLocalizedTasteName(projectTaste, locale) : t("storyboard.tasteNotSelected")}</small>
                            </span>
                            <ChevronRight aria-hidden="true" />
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="settings-panel-header">
                          <button className="settings-panel-back" type="button" onClick={() => setSettingsMode("menu")} aria-label={t("storyboard.backToSettings")}>
                            <ChevronLeft aria-hidden="true" />
                          </button>
                          <div>
                            <strong>{t("storyboard.imageRatio")}</strong>
                          </div>
                        </div>
                        <div className="ratio-options" role="radiogroup" aria-label={t("storyboard.imageRatio")}>
                          {imageRatioOptions.map((option) => (
                            <button
                              className={cn("ratio-option", imageRatio === option.value && "selected")}
                              type="button"
                              role="radio"
                              aria-checked={imageRatio === option.value}
                              key={option.value}
                              onClick={() => {
                                onImageRatioChange(option.value);
                                setSettingsOpen(false);
                                setSettingsMode("menu");
                              }}
                            >
                              <span className="ratio-preview-wrap" aria-hidden="true">
                                <span className="ratio-preview" style={{ aspectRatio: option.aspectRatio }} />
                              </span>
                              <span>{option.label}</span>
                              {imageRatio === option.value ? <Check aria-hidden="true" /> : null}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                    </div>
                  </Popover.Dialog>
                </Popover.Content>
              </Popover>
              <Popover isOpen={columnSettingsOpen && !storyboardParsing} onOpenChange={(open) => setStoryboardToolPopover("columns", open)}>
                <Popover.Trigger>
                  <Button className="storyboard-toolbar-button column-settings-trigger" isDisabled={storyboardParsing} variant="outline">
                    <TableProperties aria-hidden="true" />
                    {t("storyboard.columnSettings")}
                  </Button>
                </Popover.Trigger>
                <Popover.Content className="column-settings-popover" isNonModal offset={10} placement="bottom end">
                  <Popover.Dialog>
                      <ColumnSettingsPanel
                        columns={columns}
                        customColumnName={customColumnName}
                        nextCustomColumnIndex={nextCustomColumnIndex}
                        t={t}
                        onAddCustomColumn={addCustomColumn}
                        onChangeCustomColumnName={setCustomColumnName}
                        onChangeColumnLabel={updateColumnLabel}
                        onChangeColumnType={updateColumnType}
                        onMoveColumn={moveColumn}
                        onToggleColumn={toggleColumn}
                      />
                  </Popover.Dialog>
                </Popover.Content>
              </Popover>
            </div>
          </div>
          <div className="storyboard-scroll-region">
            {showEmptyStoryboardCard ? (
              <StoryboardEmptyStateCard onGenerateStoryboard={() => requestStoryboardAiAction("parse")} />
            ) : (
              <StoryboardTable
                activeColumnMenuId={activeColumnMenuId}
                assets={assets}
                columnDraftTitle={columnDraftTitle}
                columnDraftType={columnDraftType}
                columnWidths={columnWidths}
                columns={columns}
                draggingRowId={draggingRowId}
                editingColumnId={editingColumnId}
                imageRatio={imageRatio}
                isLoading={storyboardBusyAction === "parse"}
                loadingAction={storyboardBusyAction}
                localMutationAction={localMutationAction}
                projectId={projectId}
                imageGeneratingRowIds={storyboardImageGeneratingRowIds}
                videoGenerationTasks={storyboardVideoGenerationTasks}
                videoGeneratingRowIds={storyboardVideoGeneratingRowIds}
                readOnly={storyboardBusyAction === "parse"}
                rows={rows}
                selectedRowIds={selectedRowIdSet}
                selectedImageGenerationCount={selectedImageGenerationSubmitting ? selectedImageGenerationSubmittingCount : selectedImageGenerationRowIds.length}
                selectedImageGenerationSubmitting={selectedImageGenerationSubmitting}
                selectedVideoGenerationCount={selectedVideoGenerationSubmitting ? selectedVideoGenerationSubmittingCount : selectedVideoGenerationRowIds.length}
                selectionActionsDisabled={storyboardParsing}
                selectionGenerateDisabled={storyboardParsing}
                selectionDeleteDisabled={selectedRowsIncludeGenerating}
                selectedVideoGenerationSubmitting={selectedVideoGenerationSubmitting}
                suppressEmptyGenerateAction={suppressEmptyGenerateAction}
                onChangeColumnDraftTitle={setColumnDraftTitle}
                onChangeColumnDraftType={setColumnDraftType}
                onClearSelection={clearSelectedRows}
                onCloseColumnMenu={closeColumnMenu}
                onDeleteColumn={deleteColumn}
                onDeleteSelectedRows={requestDeleteSelectedRows}
                onDragRowEnd={() => setDraggingRowId(null)}
                onDragRowStart={setDraggingRowId}
                onDuplicateSelectedRows={duplicateSelectedRows}
                onGenerateSelectedImages={generateSelectedStoryboardImages}
                onGenerateSelectedVideos={generateSelectedStoryboardVideos}
                onHideColumn={hideColumn}
                onImportClipboardImageAsShotMedia={onImportClipboardImageAsShotMedia}
                onImportShotMediaPaths={onImportShotMediaPaths}
                onInsertRow={insertStoryboardAtRow}
                onChooseShotMedia={openStoryboardAssetDrawer}
                onChooseProjectAssets={onChooseProjectAssets}
                onGenerateStoryboard={() => requestStoryboardAiAction("parse")}
                onOpenColumnMenu={openColumnMenu}
                onReorderRows={reorderStoryboardRows}
                onResizeColumn={resizeStoryboardColumn}
                onSaveColumnEdit={saveColumnEdit}
                onStartEditingColumn={startEditingColumn}
                onToggleAllRows={toggleAllRows}
                onToggleRowSelection={toggleRowSelection}
                onUpdateCell={onUpdateCell}
                onUpdateShotMedia={onUpdateShotMedia}
              />
            )}
          </div>
          <StoryboardDeleteConfirmationDialog
            busy={localMutationAction?.kind === "delete"}
            isOpen={deleteConfirmationOpen}
            selectedCount={selectedRowIds.length}
            onClose={() => setDeleteConfirmationOpen(false)}
            onConfirm={deleteSelectedRows}
          />
          <StoryboardAiConfirmationDialog
            action={pendingAiAction}
            assets={assets}
            columns={columns}
            imageRatio={imageRatio}
            rows={rows}
            onClose={closeStoryboardAiConfirmation}
            onConfirm={confirmStoryboardAiAction}
          />
          <StoryboardGenerationStatusDialog
            action={generationStatusAction}
            assets={assets}
            imageTasks={storyboardImageGenerationTasks}
            isOpen={generationStatusOpen}
            rows={rows}
            videoTasks={storyboardVideoGenerationTasks}
            onCancelAll={onCancelStoryboardVideoGenerations}
            onClose={closeGenerationStatus}
            onRetryTask={onRetryStoryboardTask}
          />
          <ProjectSkillSelectionDrawer
            currentSkillId={storyboardSkill?.id ?? ""}
            error={skillDialogError ?? skillsError}
            isOpen={skillDialogOpen}
            loading={skillsLoading}
            savingSkillId={savingSkillId}
            skills={getSelectableProjectSkills(skills, t, locale)}
            onClose={() => {
              if (!savingSkillId) setSkillDialogOpen(false);
            }}
            onReload={() => void reloadStoryboardSkills()}
            onSelect={(skillId) => void selectStoryboardSkill(skillId)}
          />
          <TasteSelectionDrawer
            currentTasteId={projectTaste?.id ?? ""}
            error={tasteDialogError ?? tastesError}
            isOpen={tasteDialogOpen}
            loading={tastesLoading}
            savingTasteId={savingTasteId}
            tastes={tastes.length > 0 ? tastes : [getFallbackDefaultTaste()]}
            onClose={() => {
              if (!savingTasteId) setTasteDialogOpen(false);
            }}
            onReload={() => void reloadProjectTastes()}
            onSelect={(tasteId) => void selectProjectTaste(tasteId)}
          />
          <StoryboardAssetDrawer
            assets={assets}
            row={assetDrawerRow}
            onChooseProjectAssets={onChooseProjectAssets}
            onClose={() => setAssetDrawerRowId(null)}
            onUpdateShotMedia={onUpdateShotMedia}
          />
      </div>
    </section>
  );
}

function StoryboardAssetDrawer({
  assets,
  row,
  onChooseProjectAssets,
  onClose,
  onUpdateShotMedia
}: {
  assets: ProjectAsset[];
  row: StoryboardRow | null;
  onChooseProjectAssets: ChooseProjectAssetsHandler;
  onClose: () => void;
  onUpdateShotMedia: (rowId: string, assetIds: string[]) => void;
}) {
  const { t } = useI18n();
  const [uploading, setUploading] = useState(false);
  const mediaAssets = assets.filter((asset) => asset.kind === "image" || asset.kind === "video");
  const { assetDurationLabels, assetDimensions, updateAssetDimensions, updateAssetDurationLabel } = useAssetDurationLabels(mediaAssets);
  const selectedAssetIds = row ? getStoryboardRowEditableMediaAssetIds(row, assets) : [];
  const selectedAssetIdSet = new Set(selectedAssetIds);
  const selectedCount = selectedAssetIds.length;

  useEffect(() => {
    if (!row) return undefined;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, row]);

  if (!row || typeof document === "undefined") return null;

  async function uploadAssets() {
    if (uploading) return;
    setUploading(true);
    try {
      await onChooseProjectAssets();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    } finally {
      setUploading(false);
    }
  }

  function toggleAsset(assetId: string) {
    if (!row) return;
    const selected = selectedAssetIdSet.has(assetId);
    if (!selected && selectedCount >= 10) return;
    const nextAssetIds = selected ? selectedAssetIds.filter((currentAssetId) => currentAssetId !== assetId) : [...selectedAssetIds, assetId];
    onUpdateShotMedia(row.id, nextAssetIds);
    if (!selected) onClose();
  }

  return createPortal(
    <aside className="storyboard-asset-drawer-content" role="dialog" aria-modal="false" aria-label={t("storyboard.assetDrawerTitle", { shot: row.shot })}>
      <div className="storyboard-asset-drawer-dialog">
        <header className="storyboard-asset-drawer-header">
          <div>
            <h2 className="storyboard-asset-drawer-title">{t("storyboard.assetDrawerTitle", { shot: row.shot })}</h2>
            <p>{t("storyboard.assetDrawerDescription", { count: selectedCount })}</p>
          </div>
          <button className="storyboard-asset-drawer-close" type="button" aria-label={t("common.close")} onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>
        <div className="storyboard-asset-drawer-body">
          <div className="storyboard-asset-picker-grid" aria-label={t("storyboard.assetDrawerList")}>
            <button className="storyboard-asset-upload-card" type="button" disabled={uploading} onClick={() => void uploadAssets()}>
              {uploading ? <LoaderCircle className="spinning" aria-hidden="true" /> : <UploadCloud aria-hidden="true" />}
              <strong>{t("storyboard.assetDrawerUpload")}</strong>
              <span>{t("storyboard.assetDrawerUploadDescription")}</span>
            </button>
            {mediaAssets.map((asset) => {
              const selected = selectedAssetIdSet.has(asset.id);
              const disabled = !selected && selectedCount >= 10;
              const durationLabel = asset.kind === "video" ? assetDurationLabels[asset.id] : null;
              const resolutionLabel = formatAssetResolutionLabel(asset, assetDimensions[asset.id]);
              return (
                <button
                  className={cn("storyboard-asset-picker-card", selected && "selected")}
                  type="button"
                  aria-pressed={selected}
                  disabled={disabled}
                  key={asset.id}
                  onClick={() => toggleAsset(asset.id)}
                >
                  <span className="storyboard-asset-picker-media">
                    {asset.kind === "video" ? (
                      <video
                        src={asset.previewUrl}
                        poster={asset.posterUrl ?? undefined}
                        muted
                        playsInline
                        preload="metadata"
                        onLoadedMetadata={(event) =>
                          updateAssetDurationLabel(asset.id, event.currentTarget.duration, event.currentTarget.videoWidth, event.currentTarget.videoHeight)
                        }
                      />
                    ) : (
                      <img
                        src={asset.previewUrl}
                        alt=""
                        loading="lazy"
                        onLoad={(event) => updateAssetDimensions(asset.id, event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)}
                      />
                    )}
                    <AssetPreviewBadges asset={asset} durationLabel={durationLabel} resolutionLabel={resolutionLabel} />
                    <span className="storyboard-asset-picker-check" aria-hidden="true">
                      <Check />
                    </span>
                  </span>
                  <span className="storyboard-asset-picker-meta">
                    <strong>{asset.name}</strong>
                    <span>{getAssetKindLabel(asset.kind, t)}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {mediaAssets.length === 0 ? (
            <div className="storyboard-asset-drawer-empty">
              <Images aria-hidden="true" />
              <strong>{t("storyboard.assetDrawerEmptyTitle")}</strong>
              <span>{t("storyboard.assetDrawerEmptyDescription")}</span>
            </div>
          ) : null}
        </div>
      </div>
    </aside>,
    document.body
  );
}

function StoryboardPromptAssetDrawer({
  assets,
  kind,
  row,
  selectedAssetId,
  onChooseProjectAssets,
  onClose,
  onSelectAsset
}: {
  assets: ProjectAsset[];
  kind: "image" | "video";
  row: StoryboardRow;
  selectedAssetId: string | null;
  onChooseProjectAssets: ChooseProjectAssetsHandler;
  onClose: () => void;
  onSelectAsset: (assetId: string) => void | Promise<void>;
}) {
  const { t } = useI18n();
  const [uploading, setUploading] = useState(false);
  const { assetDurationLabels, assetDimensions, updateAssetDimensions, updateAssetDurationLabel } = useAssetDurationLabels(assets);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  async function uploadAssets() {
    if (uploading) return;
    setUploading(true);
    try {
      await onChooseProjectAssets();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    } finally {
      setUploading(false);
    }
  }

  async function selectAsset(assetId: string) {
    await onSelectAsset(assetId);
    onClose();
  }

  return createPortal(
    <aside
      className="storyboard-asset-drawer-content storyboard-prompt-asset-drawer-content"
      role="dialog"
      aria-modal="false"
      aria-label={t("storyboard.promptAssetDrawerTitle", { shot: row.shot })}
    >
      <div className="storyboard-asset-drawer-dialog">
        <header className="storyboard-asset-drawer-header">
          <div>
            <h2 className="storyboard-asset-drawer-title">{t("storyboard.promptAssetDrawerTitle", { shot: row.shot })}</h2>
            <p>{t("storyboard.promptAssetDrawerDescription")}</p>
          </div>
          <button className="storyboard-asset-drawer-close" type="button" aria-label={t("common.close")} onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>
        <div className="storyboard-asset-drawer-body">
          <div className="storyboard-asset-picker-grid" aria-label={t("storyboard.promptAssetDrawerList")}>
            <button className="storyboard-asset-upload-card" type="button" disabled={uploading} onClick={() => void uploadAssets()}>
              {uploading ? <LoaderCircle className="spinning" aria-hidden="true" /> : <UploadCloud aria-hidden="true" />}
              <strong>{t("storyboard.assetDrawerUpload")}</strong>
              <span>{t("storyboard.assetDrawerUploadDescription")}</span>
            </button>
            {assets.map((asset) => {
              const selected = selectedAssetId === asset.id;
              const durationLabel = asset.kind === "video" ? assetDurationLabels[asset.id] : null;
              const resolutionLabel = formatAssetResolutionLabel(asset, assetDimensions[asset.id]);
              return (
                <button
                  className={cn("storyboard-asset-picker-card", selected && "selected")}
                  type="button"
                  aria-pressed={selected}
                  key={asset.id}
                  onClick={() => void selectAsset(asset.id)}
                >
                  <span className="storyboard-asset-picker-media">
                    {kind === "video" ? (
                      <video
                        src={asset.previewUrl}
                        poster={asset.posterUrl ?? undefined}
                        muted
                        playsInline
                        preload="metadata"
                        onLoadedMetadata={(event) =>
                          updateAssetDurationLabel(asset.id, event.currentTarget.duration, event.currentTarget.videoWidth, event.currentTarget.videoHeight)
                        }
                      />
                    ) : (
                      <img
                        src={asset.previewUrl}
                        alt=""
                        loading="lazy"
                        onLoad={(event) => updateAssetDimensions(asset.id, event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)}
                      />
                    )}
                    <AssetPreviewBadges asset={asset} durationLabel={durationLabel} resolutionLabel={resolutionLabel} />
                    <span className="storyboard-asset-picker-check" aria-hidden="true">
                      <Check />
                    </span>
                  </span>
                  <span className="storyboard-asset-picker-meta">
                    <strong>{asset.name}</strong>
                    <span>{getAssetKindLabel(asset.kind, t)}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {assets.length === 0 ? (
            <div className="storyboard-asset-drawer-empty">
              <Images aria-hidden="true" />
              <strong>{t("storyboard.promptAssetDrawerEmptyTitle")}</strong>
              <span>{t(kind === "video" ? "storyboard.promptVideoAssetDrawerEmptyDescription" : "storyboard.promptImageAssetDrawerEmptyDescription")}</span>
            </div>
          ) : null}
        </div>
      </div>
    </aside>,
    document.body
  );
}

function ColumnSettingsPanel({
  columns,
  customColumnName,
  customColumnType,
  nextCustomColumnIndex,
  showHeader = true,
  t,
  onAddCustomColumn,
  onChangeColumnLabel,
  onChangeColumnType,
  onChangeCustomColumnType,
  onChangeCustomColumnName,
  onDeleteColumn,
  onMoveColumn,
  onToggleColumn
}: {
  columns: StoryboardColumn[];
  customColumnName: string;
  customColumnType?: StoryboardColumnType;
  nextCustomColumnIndex: number;
  showHeader?: boolean;
  t: Translator;
  onAddCustomColumn: () => void;
  onChangeColumnLabel: (columnId: StoryboardColumnId, value: string) => void;
  onChangeColumnType: (columnId: StoryboardColumnId, value: StoryboardColumnType) => void;
  onChangeCustomColumnType?: (value: StoryboardColumnType) => void;
  onChangeCustomColumnName: (value: string) => void;
  onDeleteColumn?: (columnId: StoryboardColumnId) => void;
  onMoveColumn: (columnId: StoryboardColumnId, direction: "up" | "down") => void;
  onToggleColumn: (columnId: StoryboardColumnId) => void;
}) {
  const firstMovableColumnIndex = columns.findIndex((column) => !column.locked);

  return (
    <div className="column-settings-panel">
      {showHeader ? (
        <div className="column-settings-header">
          <div>
            <strong>{t("storyboard.columnSettings")}</strong>
          </div>
        </div>
      ) : null}

      <form
        className="custom-column-form"
        onSubmit={(event) => {
          event.preventDefault();
          onAddCustomColumn();
        }}
      >
        <Input
          className="custom-column-input"
          aria-label={t("storyboard.customColumnName")}
          placeholder={t("storyboard.addCustomColumnField")}
          value={customColumnName}
          onChange={(event) => onChangeCustomColumnName(event.target.value)}
        />
        {customColumnType && onChangeCustomColumnType ? (
          <ColumnTypeSelect
            className="custom-column-type-select"
            aria-label={t("storyboard.columnType")}
            value={customColumnType}
            t={t}
            onChange={onChangeCustomColumnType}
          />
        ) : null}
        <Button className="add-column-button" type="submit" variant="primary">
          <Plus aria-hidden="true" />
          <span>{t("storyboard.add")}</span>
        </Button>
      </form>

      <div className="column-settings-table">
        <div className="column-settings-list-header" aria-hidden="true">
          <span />
          <span>{t("storyboard.columnTitle")}</span>
          <span>{t("storyboard.columnType")}</span>
          <span />
        </div>
        <div className="column-settings-list" aria-label={t("storyboard.columnSettingsList")}>
          {columns.map((column, index) => {
            const canMoveUp = !column.locked && index > firstMovableColumnIndex && !columns[index - 1]?.locked;
            const canMoveDown = !column.locked && index < columns.length - 1 && !columns[index + 1]?.locked;

            return (
              <ColumnSettingRow
                canMoveDown={canMoveDown}
                canMoveUp={canMoveUp}
                column={column}
                key={column.id}
                t={t}
                onChangeColumnLabel={onChangeColumnLabel}
                onChangeColumnType={onChangeColumnType}
                onDeleteColumn={onDeleteColumn}
                onMoveColumn={onMoveColumn}
                onToggleColumn={onToggleColumn}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ColumnTypeSelect({
  "aria-label": ariaLabel,
  className,
  isDisabled = false,
  value,
  t,
  onChange
}: {
  "aria-label": string;
  className?: string;
  isDisabled?: boolean;
  value: StoryboardColumnType;
  t: Translator;
  onChange: (value: StoryboardColumnType) => void;
}) {
  const selectedOption = storyboardColumnTypeOptions.find((option) => option.value === value) ?? storyboardColumnTypeOptions[0];

  return (
    <HeroSelect
      aria-label={ariaLabel}
      className={cn("column-type-select", className)}
      isDisabled={isDisabled}
      value={value}
      onChange={(key) => {
        if (key) onChange(String(key) as StoryboardColumnType);
      }}
    >
      <HeroSelect.Trigger className="column-type-select-trigger">
        <HeroSelect.Value className="column-type-select-value">
          {getColumnTypeIcon(selectedOption.value)}
          <span>{t(selectedOption.labelKey)}</span>
        </HeroSelect.Value>
        <HeroSelect.Indicator>
          <ChevronDown aria-hidden="true" />
        </HeroSelect.Indicator>
      </HeroSelect.Trigger>
      <HeroSelect.Popover className="column-type-select-popover" placement="bottom end">
        <ListBox className="column-type-select-listbox">
          {storyboardColumnTypeOptions.map((option) => (
            <ListBoxItem id={option.value} key={option.value} textValue={t(option.labelKey)}>
              {getColumnTypeIcon(option.value)}
              <span>{t(option.labelKey)}</span>
              {option.value === value ? <Check className="column-type-select-check" aria-hidden="true" /> : null}
            </ListBoxItem>
          ))}
        </ListBox>
      </HeroSelect.Popover>
    </HeroSelect>
  );
}

function ColumnSettingRow({
  canMoveDown,
  canMoveUp,
  column,
  t,
  onChangeColumnLabel,
  onChangeColumnType,
  onDeleteColumn,
  onMoveColumn,
  onToggleColumn
}: {
  canMoveDown: boolean;
  canMoveUp: boolean;
  column: StoryboardColumn;
  t: Translator;
  onChangeColumnLabel: (columnId: StoryboardColumnId, value: string) => void;
  onChangeColumnType: (columnId: StoryboardColumnId, value: StoryboardColumnType) => void;
  onDeleteColumn?: (columnId: StoryboardColumnId) => void;
  onMoveColumn: (columnId: StoryboardColumnId, direction: "up" | "down") => void;
  onToggleColumn: (columnId: StoryboardColumnId) => void;
}) {
  const columnLabel = getColumnLabel(column, t);
  const [labelDraft, setLabelDraft] = useState(columnLabel);

  useEffect(() => {
    setLabelDraft(columnLabel);
  }, [column.id, columnLabel]);

  function commitLabel() {
    const nextLabel = labelDraft.trim();
    if (!nextLabel) {
      setLabelDraft(columnLabel);
      return;
    }
    setLabelDraft(nextLabel);
    if (nextLabel !== column.label) onChangeColumnLabel(column.id, nextLabel);
  }

  return (
    <div className={cn("column-setting-row", !column.visible && "muted", column.locked && "locked")}>
      <Button
        className="column-visibility-button"
        variant="ghost"
        aria-label={column.locked ? t("storyboard.lockedColumnAria", { label: columnLabel }) : t(column.visible ? "storyboard.hideColumnAria" : "storyboard.showColumnAria", { label: columnLabel })}
        aria-pressed={column.visible}
        isDisabled={column.locked}
        onPress={() => onToggleColumn(column.id)}
      >
        {column.visible ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
      </Button>
      <Input
        className="column-setting-name-input"
        aria-label={`${t("storyboard.columnTitle")}：${columnLabel}`}
        value={labelDraft}
        onBlur={commitLabel}
        onChange={(event) => setLabelDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") setLabelDraft(columnLabel);
        }}
      />
      <ColumnTypeSelect
        aria-label={`${columnLabel}：${t("storyboard.columnType")}`}
        isDisabled={Boolean(column.locked)}
        value={column.type}
        t={t}
        onChange={(value) => onChangeColumnType(column.id, value)}
      />
      <span className="column-row-actions">
        {column.locked ? (
          <span className="column-lock-indicator" aria-label={t("storyboard.lockedColumnAria", { label: columnLabel })} title={t("storyboard.locked") }>
            <Lock aria-hidden="true" />
          </span>
        ) : (
          <>
            <Button
              className="column-order-button"
              variant="ghost"
              aria-label={t("storyboard.moveColumnUp", { label: columnLabel })}
              isDisabled={!canMoveUp}
              onPress={() => onMoveColumn(column.id, "up")}
            >
              <ArrowUp aria-hidden="true" />
            </Button>
            <Button
              className="column-order-button"
              variant="ghost"
              aria-label={t("storyboard.moveColumnDown", { label: columnLabel })}
              isDisabled={!canMoveDown}
              onPress={() => onMoveColumn(column.id, "down")}
            >
              <ArrowDown aria-hidden="true" />
            </Button>
            {onDeleteColumn ? (
              <Button
                className="column-delete-button"
                variant="ghost"
                aria-label={`${t("storyboard.deleteColumn")} ${columnLabel}`}
                onPress={() => onDeleteColumn(column.id)}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            ) : null}
          </>
        )}
      </span>
    </div>
  );
}

function StoryboardTable({
  activeColumnMenuId,
  assets,
  columnDraftTitle,
  columnDraftType,
  columnWidths,
  columns,
  draggingRowId,
  editingColumnId,
  imageGeneratingRowIds,
  imageRatio,
  isLoading,
  loadingAction,
  localMutationAction,
  projectId,
  readOnly,
  rows,
  selectedRowIds,
  selectedImageGenerationCount,
  selectedImageGenerationSubmitting,
  selectedVideoGenerationCount,
  selectedVideoGenerationSubmitting,
  selectionActionsDisabled,
  selectionDeleteDisabled,
  selectionGenerateDisabled,
  suppressEmptyGenerateAction,
  videoGenerationTasks,
  videoGeneratingRowIds,
  onChangeColumnDraftTitle,
  onChangeColumnDraftType,
  onClearSelection,
  onCloseColumnMenu,
  onDeleteColumn,
  onDeleteSelectedRows,
  onDragRowEnd,
  onDragRowStart,
  onDuplicateSelectedRows,
  onGenerateSelectedImages,
  onGenerateSelectedVideos,
  onHideColumn,
  onImportClipboardImageAsShotMedia,
  onImportShotMediaPaths,
  onInsertRow,
  onChooseShotMedia,
  onChooseProjectAssets,
  onGenerateStoryboard,
  onOpenColumnMenu,
  onReorderRows,
  onResizeColumn,
  onSaveColumnEdit,
  onStartEditingColumn,
  onToggleAllRows,
  onToggleRowSelection,
  onUpdateCell,
  onUpdateShotMedia
}: {
  activeColumnMenuId: StoryboardColumnId | null;
  assets: ProjectAsset[];
  columnDraftTitle: string;
  columnDraftType: StoryboardColumnType;
  columnWidths: StoryboardColumnWidths;
  columns: StoryboardColumn[];
  draggingRowId: string | null;
  editingColumnId: StoryboardColumnId | null;
  imageGeneratingRowIds: Set<string>;
  imageRatio: ImageRatio;
  isLoading: boolean;
  loadingAction: StoryboardAiAction | null;
  localMutationAction: StoryboardLocalMutationAction | null;
  projectId: string;
  readOnly: boolean;
  rows: StoryboardRow[];
  selectedRowIds: Set<string>;
  selectedImageGenerationCount: number;
  selectedImageGenerationSubmitting: boolean;
  selectedVideoGenerationCount: number;
  selectedVideoGenerationSubmitting: boolean;
  selectionActionsDisabled: boolean;
  selectionDeleteDisabled: boolean;
  selectionGenerateDisabled: boolean;
  suppressEmptyGenerateAction: boolean;
  videoGenerationTasks: StoryboardGenerationTaskItem[];
  videoGeneratingRowIds: Set<string>;
  onChangeColumnDraftTitle: (value: string) => void;
  onChangeColumnDraftType: (value: StoryboardColumnType) => void;
  onClearSelection: () => void;
  onCloseColumnMenu: () => void;
  onDeleteColumn: (columnId: StoryboardColumnId) => void;
  onDeleteSelectedRows: () => void;
  onDragRowEnd: () => void;
  onDragRowStart: (rowId: string) => void;
  onDuplicateSelectedRows: () => void;
  onGenerateSelectedImages: () => void;
  onGenerateSelectedVideos: () => void;
  onHideColumn: (columnId: StoryboardColumnId) => void;
  onImportClipboardImageAsShotMedia: (rowId: string) => void;
  onImportShotMediaPaths: (rowId: string, filePaths: string[]) => void;
  onInsertRow: (rowId: string, placement: "before" | "after") => void;
  onChooseShotMedia: (rowId: string) => void;
  onChooseProjectAssets: ChooseProjectAssetsHandler;
  onGenerateStoryboard: () => void;
  onOpenColumnMenu: (column: StoryboardColumn) => void;
  onReorderRows: (sourceRowId: string, targetRowId: string) => void;
  onResizeColumn: (columnId: StoryboardColumnId, nextWidth: number) => void;
  onSaveColumnEdit: (columnId: StoryboardColumnId) => void;
  onStartEditingColumn: (column: StoryboardColumn) => void;
  onToggleAllRows: () => void;
  onToggleRowSelection: (rowId: string) => void;
  onUpdateCell: UpdateStoryboardCellHandler;
  onUpdateShotMedia: (rowId: string, assetIds: string[]) => void;
}) {
  const { t } = useI18n();
  const visibleColumns = columns.filter((column) => column.visible);
  const showDurationTotal = visibleColumns.some((column) => column.id === "duration");
  const tableColumns = visibleColumns.map((column) => getColumnTrack(column.id, columnWidths)).join(" ");
  const tableWidth = getStoryboardTableWidth(visibleColumns, columnWidths);
  const stickyShotLeft = getStickyColumnOffset(visibleColumns, columnWidths, "shot");
  const totalDuration = rows.reduce((sum, row) => sum + Number(row.duration || 0), 0);
  const selectedCount = selectedRowIds.size;
  const selectionVisible = !readOnly && selectedCount > 0;
  const allRowsSelected = rows.length > 0 && selectedCount === rows.length;
  const dragDescriptionId = "storyboard-drag-description";
  const videoGenerationTaskByRowId = useMemo(() => new Map(videoGenerationTasks.map((task) => [task.rowId, task])), [videoGenerationTasks]);

  function startColumnResize(event: React.PointerEvent<HTMLButtonElement>, columnId: StoryboardColumnId) {
    if (readOnly) return;
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startWidth = getColumnWidth(columnId, columnWidths);

    function handlePointerMove(moveEvent: PointerEvent) {
      onResizeColumn(columnId, startWidth + moveEvent.clientX - startX);
    }

    function handlePointerUp() {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  }

  return (
    <>
      <div className="storyboard-table-scroll">
        <div
          className="storyboard-table"
          role="table"
          aria-label={t("storyboard.table")}
          aria-busy={isLoading}
          data-empty={!isLoading && rows.length === 0 ? "true" : "false"}
          data-readonly={readOnly ? "true" : "false"}
          style={
            {
              "--storyboard-columns": tableColumns,
              "--storyboard-sticky-shot-left": `${stickyShotLeft}px`,
              "--storyboard-table-width": `${tableWidth}px`
            } as React.CSSProperties
          }
        >
          <p className="sr-only" id={dragDescriptionId}>
            {t("storyboard.dragDescription")}
          </p>
          <div className="storyboard-row header" role="row">
            {visibleColumns.map((column) => (
              <div className="storyboard-header-cell" role="columnheader" data-column-id={column.id} key={column.id}>
                {column.id === "sort" ? (
                  <div className="storyboard-sort-header">
                    <span>{getColumnLabel(column, t)}</span>
                    <button
                      className={cn("row-select-checkbox header-select-checkbox", selectionVisible && "selection-control-visible", allRowsSelected && "selected")}
                      type="button"
                      aria-label={allRowsSelected ? t("storyboard.deselectAllShots") : t("storyboard.selectAllShots")}
                      aria-pressed={allRowsSelected}
                      disabled={readOnly || rows.length === 0}
                      onClick={onToggleAllRows}
                    >
                      <Check aria-hidden="true" />
                    </button>
                  </div>
                ) : (
                  <Popover
                    isOpen={activeColumnMenuId === column.id}
                    onOpenChange={(open) => {
                      if (open) {
                        onOpenColumnMenu(column);
                      } else {
                        onCloseColumnMenu();
                      }
                    }}
                  >
                    <Popover.Trigger>
                      <Button className={cn("storyboard-header-trigger", activeColumnMenuId === column.id && "open")} isDisabled={readOnly} variant="ghost">
                        <span>{getColumnLabel(column, t)}</span>
                        <ChevronDown className="header-menu-chevron" aria-hidden="true" />
                      </Button>
                    </Popover.Trigger>
                    <Popover.Content
                      className={cn("header-column-popover", editingColumnId === column.id && "editing")}
                      isNonModal
                      offset={10}
                      placement="bottom start"
                    >
                      <Popover.Dialog>
                        {editingColumnId === column.id ? (
                          <ColumnEditPanel
                            column={column}
                            draftTitle={columnDraftTitle}
                            draftType={columnDraftType}
                            onCancel={onCloseColumnMenu}
                            onChangeDraftTitle={onChangeColumnDraftTitle}
                            onChangeDraftType={onChangeColumnDraftType}
                            onConfirm={() => onSaveColumnEdit(column.id)}
                          />
                        ) : (
                          <ColumnHeaderMenu
                            column={column}
                            onDelete={() => onDeleteColumn(column.id)}
                            onEdit={() => onStartEditingColumn(column)}
                            onHide={() => onHideColumn(column.id)}
                          />
                        )}
                      </Popover.Dialog>
                    </Popover.Content>
                  </Popover>
                )}
                <button
                  className="column-resize-handle"
                  type="button"
                  aria-label={t("storyboard.resizeColumn", { label: getColumnLabel(column, t) })}
                  disabled={readOnly}
                  onPointerDown={(event) => startColumnResize(event, column.id)}
                />
              </div>
            ))}
          </div>
          {isLoading ? <StoryboardLoadingRows columns={visibleColumns} imageRatio={imageRatio} /> : null}
          {!isLoading && rows.length === 0 && !suppressEmptyGenerateAction ? (
            <div className="storyboard-row storyboard-empty-row" role="row">
              <div className="storyboard-empty-cell" role="cell">
                <Button className="storyboard-empty-generate-button" isDisabled={readOnly} variant="primary" onPress={onGenerateStoryboard}>
                  <Sparkles aria-hidden="true" />
                  {t("storyboard.generateFromScript")}
                </Button>
              </div>
            </div>
          ) : null}
          {!isLoading && rows.map((row, index) => {
            const rowSelected = selectedRowIds.has(row.id);

            return (
              <div
                className={cn("storyboard-row", index % 2 === 1 && "soft", draggingRowId === row.id && "dragging", selectionVisible && "selection-visible", rowSelected && "selected")}
                role="row"
                data-storyboard-row-id={row.id}
                key={row.id}
                aria-describedby={dragDescriptionId}
                onDragOver={(event) => {
                  if (readOnly) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => {
                  if (readOnly) return;
                  event.preventDefault();
                  const sourceRowId = event.dataTransfer.getData("text/plain");
                  if (!sourceRowId) return;
                  onReorderRows(sourceRowId, row.id);
                  onDragRowEnd();
                }}
              >
                {visibleColumns.map((column) =>
                  column.id === "sort" ? (
                    <StoryboardSortCell
                      dragDescriptionId={dragDescriptionId}
                      insertDisabled={Boolean(localMutationAction)}
                      insertingPlacement={localMutationAction?.kind === "insert" && localMutationAction.rowId === row.id ? localMutationAction.placement : null}
                      key={`${row.id}-${column.id}`}
                      row={row}
                      readOnly={readOnly}
                      selected={rowSelected}
                      selectionVisible={selectionVisible}
                      onDragRowEnd={onDragRowEnd}
                      onDragRowStart={onDragRowStart}
                      onInsertRow={onInsertRow}
                      onToggleRowSelection={onToggleRowSelection}
                    />
                  ) : (
                    <StoryboardCell
                      assets={assets}
                      column={column}
                      columns={columns}
                      imageGenerating={imageGeneratingRowIds.has(row.id)}
                      imageRatio={imageRatio}
                      projectId={projectId}
                      readOnly={readOnly}
                      row={row}
                      key={`${row.id}-${column.id}`}
                      videoGenerationTask={videoGenerationTaskByRowId.get(row.id) ?? null}
                      videoGenerating={videoGeneratingRowIds.has(row.id)}
                      onChooseShotMedia={onChooseShotMedia}
                      onChooseProjectAssets={onChooseProjectAssets}
                      onImportClipboardImageAsShotMedia={onImportClipboardImageAsShotMedia}
                      onImportShotMediaPaths={onImportShotMediaPaths}
                      onUpdateCell={onUpdateCell}
                      onUpdateShotMedia={onUpdateShotMedia}
                    />
                  )
                )}
              </div>
            );
          })}
        </div>
      </div>
      {isLoading ? (
        <div className="storyboard-loading-status" role="status" aria-live="polite">
          <LoaderCircle className="spinning" aria-hidden="true" />
          <span>{t(getStoryboardLoadingStatusKey(loadingAction ?? "parse"))}</span>
        </div>
      ) : selectedCount > 0 ? (
        <StoryboardSelectionBar
          actionsDisabled={selectionActionsDisabled}
          deleteDisabled={selectionDeleteDisabled}
          generateDisabled={selectionGenerateDisabled}
          imageGenerationCount={selectedImageGenerationCount}
          imageGenerationSubmitting={selectedImageGenerationSubmitting}
          localMutationAction={localMutationAction}
          selectedCount={selectedCount}
          videoGenerationCount={selectedVideoGenerationCount}
          videoGenerationSubmitting={selectedVideoGenerationSubmitting}
          onClearSelection={onClearSelection}
          onDeleteSelectedRows={onDeleteSelectedRows}
          onDuplicateSelectedRows={onDuplicateSelectedRows}
          onGenerateSelectedImages={onGenerateSelectedImages}
          onGenerateSelectedVideos={onGenerateSelectedVideos}
        />
      ) : (
        <StoryboardFloatingStats totalDuration={totalDuration} totalShots={rows.length} showDuration={showDurationTotal} />
      )}
    </>
  );
}

function StoryboardEmptyStateCard({ onGenerateStoryboard }: { onGenerateStoryboard: () => void }) {
  const { t } = useI18n();

  return (
    <div className="storyboard-empty-panel">
      <section className="storyboard-empty-card" aria-label={t("storyboard.emptyDescription")}>
        <span className="storyboard-empty-card-icon" aria-hidden="true">
          <WandSparkles />
        </span>
        <div className="storyboard-empty-card-copy">
          <p>{t("storyboard.emptyDescription")}</p>
        </div>
        <Button className="storyboard-empty-card-action" variant="primary" onPress={onGenerateStoryboard}>
          <WandSparkles aria-hidden="true" />
          {t("storyboard.emptyAction")}
        </Button>
      </section>
    </div>
  );
}

function StoryboardLoadingRows({ columns, imageRatio }: { columns: StoryboardColumn[]; imageRatio: ImageRatio }) {
  return (
    <>
      {Array.from({ length: 4 }, (_, rowIndex) => (
        <div className={cn("storyboard-row storyboard-loading-row", rowIndex % 2 === 1 && "soft")} role="row" aria-hidden="true" key={`loading-${rowIndex}`}>
          {columns.map((column, columnIndex) => (
            <StoryboardSkeletonCell column={column} columnIndex={columnIndex} imageRatio={imageRatio} key={`${rowIndex}-${column.id}`} />
          ))}
        </div>
      ))}
    </>
  );
}

function StoryboardSkeletonCell({ column, columnIndex, imageRatio }: { column: StoryboardColumn; columnIndex: number; imageRatio: ImageRatio }) {
  if (column.id === "sort") {
    return (
      <div className="storyboard-skeleton-cell skeleton-sort-cell" role="cell" data-column-id="sort">
        <span className="skeleton-dot" />
      </div>
    );
  }

  if (column.id === "shot") {
    return (
      <div className="storyboard-skeleton-cell skeleton-shot-cell" role="cell" data-column-id="shot">
        <span className="skeleton-line short" />
      </div>
    );
  }

  if (column.type === "image") {
    return (
      <div className="storyboard-skeleton-cell" role="cell">
        <span className="skeleton-thumb" data-ratio={imageRatio} />
      </div>
    );
  }

  const lineCount = column.id === "content" || column.id === "note" || column.custom ? 3 : 1;

  return (
    <div className="storyboard-skeleton-cell text" role="cell">
      {Array.from({ length: lineCount }, (_, lineIndex) => (
        <span className={cn("skeleton-line", lineIndex === lineCount - 1 && "tail", columnIndex % 2 === 0 && "alt")} key={lineIndex} />
      ))}
    </div>
  );
}

function StoryboardSortCell({
  dragDescriptionId,
  insertDisabled,
  insertingPlacement,
  readOnly,
  row,
  selected,
  selectionVisible,
  onDragRowEnd,
  onDragRowStart,
  onInsertRow,
  onToggleRowSelection
}: {
  dragDescriptionId: string;
  insertDisabled: boolean;
  insertingPlacement: "before" | "after" | null;
  readOnly: boolean;
  row: StoryboardRow;
  selected: boolean;
  selectionVisible: boolean;
  onDragRowEnd: () => void;
  onDragRowStart: (rowId: string) => void;
  onInsertRow: (rowId: string, placement: "before" | "after") => void;
  onToggleRowSelection: (rowId: string) => void;
}) {
  const { t } = useI18n();

  function insertRow(event: React.MouseEvent<HTMLButtonElement>, placement: "before" | "after") {
    event.preventDefault();
    event.stopPropagation();
    if (readOnly || insertDisabled) return;
    onInsertRow(row.id, placement);
  }

  function stopInsertPointer(event: React.PointerEvent<HTMLButtonElement>) {
    event.stopPropagation();
  }

  return (
    <div className="drag-cell" role="cell" data-column-id="sort">
      <button
        className="row-insert-button row-insert-before"
        type="button"
        aria-label={t("storyboard.insertBeforeShot", { shot: row.shot })}
        aria-busy={insertingPlacement === "before"}
        disabled={readOnly || insertDisabled}
        onClick={(event) => insertRow(event, "before")}
        onPointerDown={stopInsertPointer}
      >
        {insertingPlacement === "before" ? <LoaderCircle className="spinning" aria-hidden="true" /> : <Plus aria-hidden="true" />}
      </button>
      <button
        className={cn("row-select-checkbox", selectionVisible && "selection-control-visible", selected && "selected")}
        type="button"
        aria-label={selected ? t("storyboard.deselectShot", { shot: row.shot }) : t("storyboard.selectShot", { shot: row.shot })}
        aria-pressed={selected}
        disabled={readOnly}
        onClick={() => onToggleRowSelection(row.id)}
      >
        <Check aria-hidden="true" />
      </button>
      <button
        className="drag-handle"
        type="button"
        draggable={!readOnly}
        aria-describedby={dragDescriptionId}
        aria-label={t("storyboard.dragShot", { shot: row.shot })}
        disabled={readOnly}
        onDragStart={(event) => {
          if (readOnly) {
            event.preventDefault();
            return;
          }
          onDragRowStart(row.id);
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", row.id);
        }}
        onDragEnd={onDragRowEnd}
      />
      <button
        className="row-insert-button row-insert-after"
        type="button"
        aria-label={t("storyboard.insertAfterShot", { shot: row.shot })}
        aria-busy={insertingPlacement === "after"}
        disabled={readOnly || insertDisabled}
        onClick={(event) => insertRow(event, "after")}
        onPointerDown={stopInsertPointer}
      >
        {insertingPlacement === "after" ? <LoaderCircle className="spinning" aria-hidden="true" /> : <Plus aria-hidden="true" />}
      </button>
    </div>
  );
}

function StoryboardSelectionBar({
  actionsDisabled,
  deleteDisabled,
  generateDisabled,
  imageGenerationCount,
  imageGenerationSubmitting,
  localMutationAction,
  selectedCount,
  videoGenerationCount,
  videoGenerationSubmitting,
  onClearSelection,
  onDeleteSelectedRows,
  onDuplicateSelectedRows,
  onGenerateSelectedImages,
  onGenerateSelectedVideos
}: {
  actionsDisabled: boolean;
  deleteDisabled: boolean;
  generateDisabled: boolean;
  imageGenerationCount: number;
  imageGenerationSubmitting: boolean;
  localMutationAction: StoryboardLocalMutationAction | null;
  selectedCount: number;
  videoGenerationCount: number;
  videoGenerationSubmitting: boolean;
  onClearSelection: () => void;
  onDeleteSelectedRows: () => void;
  onDuplicateSelectedRows: () => void;
  onGenerateSelectedImages: () => void;
  onGenerateSelectedVideos: () => void;
}) {
  const { t } = useI18n();
  const actionsBusy = actionsDisabled || imageGenerationSubmitting || videoGenerationSubmitting || Boolean(localMutationAction);
  const generateBusy = generateDisabled || imageGenerationSubmitting || videoGenerationSubmitting || Boolean(localMutationAction);
  const duplicating = localMutationAction?.kind === "duplicate";

  return (
    <div className="storyboard-selection-bar" aria-label={t("storyboard.selectedActions")}>
      <strong>{t("storyboard.selectedCount", { count: selectedCount })}</strong>
      {imageGenerationCount > 0 ? (
        <Button aria-busy={imageGenerationSubmitting} className="storyboard-selection-action generate" isDisabled={generateBusy} isPending={imageGenerationSubmitting} variant="outline" onPress={onGenerateSelectedImages}>
          {imageGenerationSubmitting ? <LoaderCircle className="spinning" aria-hidden="true" /> : <Images aria-hidden="true" />}
          <span>{t("storyboard.generateSelectedImages", { count: imageGenerationCount })}</span>
        </Button>
      ) : null}
      {videoGenerationCount > 0 ? (
        <Button aria-busy={videoGenerationSubmitting} className="storyboard-selection-action generate" isDisabled={generateBusy} isPending={videoGenerationSubmitting} variant="outline" onPress={onGenerateSelectedVideos}>
          {videoGenerationSubmitting ? <LoaderCircle className="spinning" aria-hidden="true" /> : <Video aria-hidden="true" />}
          <span>{t("storyboard.generateSelectedVideos", { count: videoGenerationCount })}</span>
        </Button>
      ) : null}
      <Button aria-busy={duplicating} className="storyboard-selection-action" isDisabled={actionsBusy} isPending={duplicating} variant="outline" onPress={onDuplicateSelectedRows}>
        {duplicating ? <LoaderCircle className="spinning" aria-hidden="true" /> : <Copy aria-hidden="true" />}
        <span>{t("storyboard.duplicateShots")}</span>
      </Button>
      <Button className="storyboard-selection-action destructive" isDisabled={deleteDisabled || actionsBusy} variant="outline" onPress={onDeleteSelectedRows}>
        <Trash2 aria-hidden="true" />
        <span>{t("storyboard.deleteShots")}</span>
      </Button>
      <Button className="storyboard-selection-action" isDisabled={actionsBusy} variant="outline" onPress={onClearSelection}>
        <X aria-hidden="true" />
        <span>{t("storyboard.cancelSelection")}</span>
      </Button>
    </div>
  );
}

function StoryboardDeleteConfirmationDialog({
  busy,
  isOpen,
  selectedCount,
  onClose,
  onConfirm
}: {
  busy: boolean;
  isOpen: boolean;
  selectedCount: number;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();

  return (
    <ScreenConfirmationDialog
      cancelDisabled={busy}
      cancelLabel={t("common.cancel")}
      confirmBusy={busy}
      confirmDisabled={busy}
      confirmLabel={t("storyboard.deleteShots")}
      descriptions={[t("storyboard.deleteShotsDescription")]}
      icon={<AlertTriangle />}
      idBase="storyboard-delete-confirmation"
      isDismissable={!busy}
      isOpen={isOpen}
      title={t("storyboard.deleteShotsConfirm", { count: selectedCount })}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}

function StoryboardAiConfirmationDialog({
  action,
  assets,
  columns,
  imageRatio,
  rows,
  onClose,
  onConfirm
}: {
  action: StoryboardAiAction | null;
  assets: ProjectAsset[];
  columns: StoryboardColumn[];
  imageRatio: ImageRatio;
  rows: StoryboardRow[];
  onClose: () => void;
  onConfirm: (mode?: StoryboardMediaGenerationMode, methodFilter?: StoryboardVideoGenerationMethodFilter) => void;
}) {
  const { t } = useI18n();
  const [selectedMediaMode, setSelectedMediaMode] = useState<StoryboardMediaGenerationMode>("missing");
  const [selectedVideoMethodFilter, setSelectedVideoMethodFilter] = useState<StoryboardVideoGenerationMethodFilter>("hyperframes");
  const isMediaAction = action === "images" || action === "videos";
  const mediaKind = action === "videos" ? "video" : "image";
  const videoAllTargets = action === "videos" ? buildStoryboardVideoGenerationCandidates(rows, columns, imageRatio) : [];
  const selectedVideoMethodTargets = action === "videos" ? filterStoryboardVideoTargetsByMethod(videoAllTargets, selectedVideoMethodFilter) : [];
  const mediaGenerationCount =
    action === "images"
      ? buildStoryboardImageGenerationCandidates(rows, columns, imageRatio).length
      : action === "videos"
      ? selectedVideoMethodTargets.length
      : rows.length;
  const mediaGenerationCounts =
    isMediaAction
      ? getStoryboardMediaGenerationCounts(action, rows, assets, columns, imageRatio, action === "videos" ? selectedVideoMethodFilter : "all")
      : null;
  const showMediaGenerationRange = Boolean(mediaGenerationCounts && mediaGenerationCounts.missing < mediaGenerationCounts.all);
  const effectiveMediaMode = showMediaGenerationRange ? selectedMediaMode : "missing";
  const videoMethodOptionCounts = action === "videos" ? getStoryboardVideoMethodOptionCounts(videoAllTargets, rows, assets, effectiveMediaMode) : null;
  const selectedMediaGenerationCount = mediaGenerationCounts ? (effectiveMediaMode === "all" ? mediaGenerationCounts.all : mediaGenerationCounts.missing) : mediaGenerationCount;
  const existingMediaCount = mediaGenerationCounts ? Math.max(0, mediaGenerationCounts.all - mediaGenerationCounts.missing) : 0;
  const confirmDisabled = isMediaAction && selectedMediaGenerationCount === 0;
  const confirmTitleKey = isMediaAction && !showMediaGenerationRange
    ? getStoryboardAiSimpleConfirmTitleKey(mediaKind)
    : action
    ? getStoryboardAiConfirmTitleKey(action)
    : null;
  const confirmDescriptionKey = isMediaAction && !showMediaGenerationRange
    ? getStoryboardAiSimpleConfirmDescriptionKey(mediaKind)
    : action
    ? getStoryboardAiConfirmDescriptionKey(action)
    : null;
  const confirmDescription =
    !confirmDescriptionKey
      ? ""
      : t(confirmDescriptionKey, { count: action === "parse" ? rows.length : selectedMediaGenerationCount });
  const confirmLabel =
    isMediaAction && action
      ? t(getStoryboardAiConfirmActionWithCountKey(mediaKind), { count: selectedMediaGenerationCount })
      : action
      ? t(getStoryboardAiConfirmActionKey(action))
      : "";

  useEffect(() => {
    setSelectedMediaMode("missing");
    setSelectedVideoMethodFilter("hyperframes");
  }, [action]);

  if (!action) return null;

  return (
    <AlertDialog
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AlertDialog.Backdrop
        className="screen-confirmation-backdrop"
        isDismissable
        isKeyboardDismissDisabled={false}
        variant="blur"
      >
        <AlertDialog.Container className="screen-confirmation-container" placement="center" size="lg">
          <AlertDialog.Dialog
            aria-describedby="storyboard-ai-confirmation-description"
            className="hero-confirmation-dialog storyboard-ai-confirmation-dialog"
          >
            <AlertDialog.Header className="screen-confirmation-header">
              <AlertDialog.Icon
                className="screen-confirmation-icon"
                status={action === "parse" ? "warning" : "accent"}
                aria-hidden="true"
              >
                {action === "parse" ? <AlertTriangle /> : action === "images" ? <Images /> : <Video />}
              </AlertDialog.Icon>
              <AlertDialog.Heading className="screen-confirmation-heading" id="storyboard-ai-confirmation-title">
                {confirmTitleKey ? t(confirmTitleKey) : null}
              </AlertDialog.Heading>
            </AlertDialog.Header>

            <AlertDialog.Body className="screen-confirmation-body storyboard-ai-confirmation-body" id="storyboard-ai-confirmation-description">
          <p>{confirmDescription}</p>
          {isMediaAction && mediaGenerationCounts && showMediaGenerationRange ? (
            <div className="storyboard-ai-generation-options">
              <div className="storyboard-ai-generation-range" role="radiogroup" aria-label={t("storyboard.aiMediaGenerationCountLabel")}>
                <button
                  className={cn("storyboard-ai-generation-option", selectedMediaMode === "missing" && "selected")}
                  type="button"
                  role="radio"
                  aria-checked={selectedMediaMode === "missing"}
                  onClick={() => setSelectedMediaMode("missing")}
                >
                  <span className="storyboard-ai-generation-option-indicator" aria-hidden="true">{selectedMediaMode === "missing" ? <Check /> : null}</span>
                  <span className="storyboard-ai-generation-option-copy">
                    <span className="storyboard-ai-generation-option-title">
                      <strong>{t("storyboard.aiMediaMissingOptionTitle")}</strong>
                      <em>{t("storyboard.aiMediaRecommended")}</em>
                    </span>
                    <span>{t(getStoryboardAiMissingOptionDescriptionKey(mediaKind))}</span>
                  </span>
                  <strong className="storyboard-ai-generation-option-count">{t(getStoryboardAiOptionCountKey(mediaKind), { count: mediaGenerationCounts.missing })}</strong>
                </button>

                <button
                  className={cn("storyboard-ai-generation-option", selectedMediaMode === "all" && "selected")}
                  type="button"
                  role="radio"
                  aria-checked={selectedMediaMode === "all"}
                  onClick={() => setSelectedMediaMode("all")}
                >
                  <span className="storyboard-ai-generation-option-indicator" aria-hidden="true">{selectedMediaMode === "all" ? <Check /> : null}</span>
                  <span className="storyboard-ai-generation-option-copy">
                    <span className="storyboard-ai-generation-option-title">
                      <strong>{t("storyboard.aiMediaAllOptionTitle")}</strong>
                    </span>
                    <span>{t(getStoryboardAiAllOptionDescriptionKey(mediaKind))}</span>
                  </span>
                  <strong className="storyboard-ai-generation-option-count">{t(getStoryboardAiOptionCountKey(mediaKind), { count: mediaGenerationCounts.all })}</strong>
                </button>
              </div>
              <p className={cn("storyboard-ai-generation-summary", effectiveMediaMode === "all" && existingMediaCount > 0 && "warning")}>
                {t(getStoryboardAiSelectionSummaryKey(mediaKind, effectiveMediaMode, selectedMediaGenerationCount === 0, existingMediaCount === 0), {
                  selected: selectedMediaGenerationCount,
                  existing: existingMediaCount
                })}
              </p>
            </div>
          ) : null}
          {action === "videos" && videoMethodOptionCounts ? (
            <div className="storyboard-ai-generation-options">
              <div className="storyboard-ai-generation-range" role="radiogroup" aria-label={t("storyboard.aiVideoMethodLabel")}>
                {storyboardVideoMethodFilterOptions.map((option) => (
                  <button
                    className={cn("storyboard-ai-generation-option", selectedVideoMethodFilter === option.value && "selected")}
                    type="button"
                    role="radio"
                    aria-checked={selectedVideoMethodFilter === option.value}
                    key={option.value}
                    onClick={() => setSelectedVideoMethodFilter(option.value)}
                  >
                    <span className="storyboard-ai-generation-option-indicator" aria-hidden="true">{selectedVideoMethodFilter === option.value ? <Check /> : null}</span>
                    <span className="storyboard-ai-generation-option-copy">
                      <span className="storyboard-ai-generation-option-title">
                        <strong>{t(option.titleKey)}</strong>
                        {option.value === "hyperframes" ? <em>{t("storyboard.aiMediaRecommended")}</em> : null}
                      </span>
                      <span>{t(option.descriptionKey)}</span>
                    </span>
                    <strong className="storyboard-ai-generation-option-count">{t("storyboard.aiVideosOptionCount", { count: videoMethodOptionCounts[option.value] })}</strong>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
            </AlertDialog.Body>

            <AlertDialog.Footer className="screen-confirmation-footer">
              <Button autoFocus className="screen-confirmation-cancel" size="sm" variant="tertiary" onPress={onClose}>
                {t("common.cancel")}
              </Button>
              <Button
                className="screen-confirmation-confirm"
                isDisabled={confirmDisabled}
                size="sm"
                variant="primary"
                onPress={() => onConfirm(effectiveMediaMode, action === "videos" ? selectedVideoMethodFilter : "all")}
              >
                {confirmLabel}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  );
}

function StoryboardGenerationStatusDialog({
  action,
  assets,
  imageTasks,
  isOpen,
  rows,
  videoTasks,
  onCancelAll,
  onClose,
  onRetryTask
}: {
  action: StoryboardAiAction | null;
  assets: ProjectAsset[];
  imageTasks: StoryboardGenerationTaskItem[];
  isOpen: boolean;
  rows: StoryboardRow[];
  videoTasks: StoryboardGenerationTaskItem[];
  onCancelAll?: () => Promise<void>;
  onClose: () => void;
  onRetryTask?: (task: StoryboardGenerationTaskItem) => Promise<void>;
}) {
  const { locale, t } = useI18n();
  const [activeContentFilter, setActiveContentFilter] = useState<StoryboardGenerationContentFilter>("all");
  const [activeStatusFilter, setActiveStatusFilter] = useState<StoryboardGenerationStatusFilter>("active");
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [retryingTaskId, setRetryingTaskId] = useState<string | null>(null);
  const [cancellingVideos, setCancellingVideos] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const initializedOpenStateRef = useRef(false);
  const tasks = useMemo(() => [...imageTasks, ...videoTasks], [imageTasks, videoTasks]);
  const rowById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
  const rowOrderById = useMemo(() => new Map(rows.map((row, index) => [row.id, index])), [rows]);
  const orderedTasks = useMemo(() => sortGenerationTasksByTimeline(tasks, rowOrderById), [rowOrderById, tasks]);
  const assetById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const contentFilteredTasks = useMemo(() => {
    if (activeContentFilter === "image") return orderedTasks.filter((task) => task.kind === "image");
    if (activeContentFilter === "video") return orderedTasks.filter((task) => task.kind === "video");
    return orderedTasks;
  }, [activeContentFilter, orderedTasks]);
  const taskDisplayItems = useMemo(() => buildGenerationTaskDisplayItems(contentFilteredTasks, rowById, locale), [contentFilteredTasks, locale, rowById]);
  const contentCounts = useMemo(
    () => ({
      all: tasks.length,
      image: tasks.filter((task) => task.kind === "image").length,
      video: tasks.filter((task) => task.kind === "video").length
    }),
    [tasks]
  );
  const counts = useMemo(
    () => ({
      total: contentFilteredTasks.length,
      active: contentFilteredTasks.filter((task) => task.status === "queued" || task.status === "running").length,
      succeeded: contentFilteredTasks.filter((task) => task.status === "succeeded").length,
      failed: contentFilteredTasks.filter((task) => task.status === "failed" || task.status === "cancelled").length
    }),
    [contentFilteredTasks]
  );
  const activeVideoCount = useMemo(() => videoTasks.filter((task) => task.status === "queued" || task.status === "running").length, [videoTasks]);
  const showContentFilter = contentCounts.image > 0 && contentCounts.video > 0;
  const headerSummary = getGenerationStatusHeaderSummary(activeContentFilter, contentCounts, t);
  const contentFilterOptions: Array<{ id: StoryboardGenerationContentFilter; labelKey: I18nKey; count: number }> = [
    { id: "all", labelKey: "storyboard.generationStatusContentAll", count: contentCounts.all },
    { id: "image", labelKey: "storyboard.generationStatusContentImages", count: contentCounts.image },
    { id: "video", labelKey: "storyboard.generationStatusContentVideos", count: contentCounts.video }
  ];
  const filterOptions: Array<{ id: StoryboardGenerationStatusFilter; labelKey: I18nKey; count: number }> = [
    { id: "all", labelKey: "storyboard.generationStatusTotal", count: counts.total },
    { id: "active", labelKey: "storyboard.generationStatusActive", count: counts.active },
    { id: "succeeded", labelKey: "storyboard.generationStatusSucceeded", count: counts.succeeded },
    { id: "failed", labelKey: "storyboard.generationStatusFailed", count: counts.failed }
  ];
  const filteredTasks = useMemo(() => {
    if (activeStatusFilter === "active") return taskDisplayItems.filter(({ task }) => task.status === "queued" || task.status === "running");
    if (activeStatusFilter === "succeeded") return taskDisplayItems.filter(({ task }) => task.status === "succeeded");
    if (activeStatusFilter === "failed") return taskDisplayItems.filter(({ task }) => task.status === "failed" || task.status === "cancelled");
    return taskDisplayItems;
  }, [activeStatusFilter, taskDisplayItems]);
  const previewAssets = useMemo(() => {
    const seenAssetIds = new Set<string>();
    const nextAssets: ProjectAsset[] = [];
    for (const { task } of filteredTasks) {
      const asset = getGenerationTaskPreviewAsset(task, rowById, assetById, assets);
      if (!asset || seenAssetIds.has(asset.id)) continue;
      seenAssetIds.add(asset.id);
      nextAssets.push(asset);
    }
    return nextAssets;
  }, [assetById, assets, filteredTasks, rowById]);
  const canCancelAll = activeContentFilter !== "image" && activeVideoCount > 0 && Boolean(onCancelAll);
  const retryDisabled = Boolean(retryingTaskId) || cancellingVideos;

  useEffect(() => {
    if (!isOpen || counts.active === 0) return undefined;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [counts.active, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      initializedOpenStateRef.current = false;
      setPreviewIndex(null);
      return;
    }
    if (!initializedOpenStateRef.current) {
      const initialContentFilter = getInitialGenerationContentFilter(action, imageTasks, videoTasks);
      setActiveContentFilter(initialContentFilter);
      setActiveStatusFilter(getInitialGenerationStatusFilter(initialContentFilter, imageTasks, videoTasks));
      setPreviewIndex(null);
      initializedOpenStateRef.current = true;
    }
  }, [action, imageTasks, isOpen, videoTasks]);

  useEffect(() => {
    if (!isOpen || showContentFilter) return;
    const singleContentFilter: StoryboardGenerationContentFilter = contentCounts.video > 0 ? "video" : contentCounts.image > 0 ? "image" : "all";
    if (activeContentFilter !== singleContentFilter) setActiveContentFilter(singleContentFilter);
  }, [activeContentFilter, contentCounts.image, contentCounts.video, isOpen, showContentFilter]);

  function openMediaPreview(assetId: string) {
    const nextIndex = previewAssets.findIndex((asset) => asset.id === assetId);
    if (nextIndex >= 0) setPreviewIndex(nextIndex);
  }

  function openHyperframesStudio(task: StoryboardGenerationTaskItem) {
    void window.mkboard.openHyperframesStudio({ studioUrl: task.studioUrl, workDir: task.workDir }).catch((error) => {
      console.warn("Failed to open HyperFrames Studio", error);
    });
  }

  async function retryTask(task: StoryboardGenerationTaskItem) {
    if (!onRetryTask || retryingTaskId || cancellingVideos) return;
    setActiveContentFilter(task.kind);
    setActiveStatusFilter("all");
    setRetryingTaskId(task.id);
    try {
      await onRetryTask(task);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    } finally {
      setRetryingTaskId(null);
    }
  }

  async function cancelAllVideos() {
    if (!onCancelAll || cancellingVideos) return;
    setCancellingVideos(true);
    try {
      await onCancelAll();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    } finally {
      setCancellingVideos(false);
    }
  }

  useEffect(() => {
    if (!isOpen) return undefined;

    function closeOnEscape(event: KeyboardEvent) {
      if (previewIndex !== null || cancellingVideos || event.defaultPrevented) return;
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [cancellingVideos, isOpen, onClose, previewIndex]);

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <>
      <div
        className="screen-confirmation-layer"
        onMouseDown={(event) => {
          if (!cancellingVideos && event.target === event.currentTarget) onClose();
        }}
      >
        <section className="project-delete-dialog screen-confirmation-dialog storyboard-generation-status-dialog" role="dialog" aria-modal="true" aria-labelledby="storyboard-generation-status-title">
          <header className="project-delete-header">
            <div className="project-delete-icon generation" aria-hidden="true">
              {activeContentFilter === "image" ? <Images /> : activeContentFilter === "video" ? <Video /> : <Layers />}
            </div>
            <div className="storyboard-generation-status-heading">
              <h2 className="project-delete-title" id="storyboard-generation-status-title">
                {t("storyboard.generationStatusTitle")}
              </h2>
              <span className="storyboard-generation-status-count">{headerSummary}</span>
            </div>
          </header>

          <div className="project-delete-body storyboard-generation-status-body">
            <div className="storyboard-generation-filter-row">
              {showContentFilter ? (
                <div className="storyboard-generation-content-filter" role="tablist" aria-label={t("storyboard.generationStatusContentFilter")}>
                  {contentFilterOptions.map((option) => (
                    <button
                      className={cn("storyboard-generation-content-filter-button", activeContentFilter === option.id && "active")}
                      type="button"
                      role="tab"
                      aria-selected={activeContentFilter === option.id}
                      key={option.id}
                      onClick={() => {
                        setActiveContentFilter(option.id);
                        setPreviewIndex(null);
                      }}
                    >
                      <span>{t(option.labelKey)}</span>
                      <strong>{option.count}</strong>
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="storyboard-generation-status-tabs">
                <div className="storyboard-generation-status-summary" role="tablist" aria-label={t("storyboard.generationStatusSummary")}>
                  {filterOptions.map((option) => (
                    <button
                      className="storyboard-generation-status-summary-tab"
                      type="button"
                      role="tab"
                      aria-selected={activeStatusFilter === option.id}
                      key={option.id}
                      onClick={() => setActiveStatusFilter(option.id)}
                    >
                      <span className="storyboard-generation-status-summary-label">{t(option.labelKey)}</span>
                      <strong className="storyboard-generation-status-summary-count">{option.count}</strong>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="storyboard-generation-task-list" aria-label={t("storyboard.generationStatusTaskList")}>
              {filteredTasks.length > 0 ? (
                filteredTasks.map(({ task, shotLabel }) => {
                  const previewAsset = getGenerationTaskPreviewAsset(task, rowById, assetById, assets);
                  const canRetryDelivery = Boolean(task.canRetryDelivery || task.localDeliveryFailed);
                  const isDreaminaAgentTask = task.kind === "video" && task.provider === "dreamina_cli";
                  const canRetryGeneration = task.kind === "video" && !isDreaminaAgentTask && (task.status === "failed" || task.status === "cancelled");
                  const canRetryTask = Boolean(onRetryTask) && (canRetryDelivery || canRetryGeneration);
                  const elapsedText = task.kind === "video" ? formatGenerationTaskElapsedClock(task, now) : "";
                  const isHyperframesTask = task.kind === "video" && task.method === "Hyperframes";
                  const taskBrand = getStoryboardGenerationBrand(task.kind, task.method);
                  const progressLabel = getGenerationTaskProgressLabel(task, t);
                  return (
                    <article className={cn("storyboard-generation-task", task.status)} key={task.id}>
                      <span className={cn("storyboard-generation-task-icon", taskBrand && "brand", taskBrand)} aria-hidden="true">
                        {taskBrand ? <StoryboardGenerationBrandIcon brand={taskBrand} /> : getGenerationTaskStatusIcon(task.status)}
                      </span>
                      <span className="storyboard-generation-task-main">
                        <strong>{t("storyboard.generationStatusShot", { shot: shotLabel })}</strong>
                        <small className={cn("storyboard-generation-task-kind", isHyperframesTask && "hyperframes")}>
                          <span>{task.method || t(task.kind === "image" ? "storyboard.generationStatusImageKind" : "storyboard.generationStatusVideoKind")}</span>
                          {isHyperframesTask ? (
                            <span>{t("storyboard.generationStatusHyperframesKind")}</span>
                          ) : isDreaminaAgentTask ? (
                            <span>{t("storyboard.generationStatusDreaminaAgentKind")}</span>
                          ) : null}
                        </small>
                        {elapsedText ? <small className="storyboard-generation-task-elapsed">{t("agent.elapsed.complete", { time: elapsedText })}</small> : null}
                        {progressLabel ? <small className="storyboard-generation-task-stage">{progressLabel}</small> : null}
                        {task.message ? (
                          <em className="storyboard-generation-task-message">
                            <span>{t("storyboard.generationStatusMessageLabel")}</span>
                            {task.message}
                          </em>
                        ) : null}
                      </span>
                      <span className="storyboard-generation-task-actions">
                        {isHyperframesTask && (task.studioUrl || task.workDir) ? (
                          <button className="storyboard-generation-task-studio" type="button" onClick={() => openHyperframesStudio(task)}>
                            <Monitor aria-hidden="true" />
                            <span>{t("storyboard.generationStatusEditStudio")}</span>
                          </button>
                        ) : null}
                        {previewAsset ? (
                          <button className="storyboard-generation-task-preview" type="button" onClick={() => openMediaPreview(previewAsset.id)}>
                            <Eye aria-hidden="true" />
                            <span>{t("storyboard.generationStatusView")}</span>
                          </button>
                        ) : canRetryTask && onRetryTask ? (
                          <button
                            className="storyboard-generation-task-retry"
                            type="button"
                            aria-busy={retryingTaskId === task.id}
                            disabled={retryDisabled}
                            title={canRetryDelivery ? t("storyboard.generationStatusRetryDeliveryHint") : undefined}
                            onClick={() => void retryTask(task)}
                          >
                            {retryingTaskId === task.id ? <LoaderCircle className="spinning" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
                            <span>{t(canRetryDelivery ? "storyboard.generationStatusRetryDelivery" : "storyboard.generationStatusRetry")}</span>
                          </button>
                        ) : (
                          <span className="storyboard-generation-task-status">{t(getGenerationTaskStatusKey(task.status))}</span>
                        )}
                      </span>
                    </article>
                  );
                })
              ) : (
                <div className="storyboard-generation-task-empty">
                  <Clock aria-hidden="true" />
                  <span>{t(getGenerationStatusEmptyKey(activeStatusFilter))}</span>
                </div>
              )}
            </div>
          </div>

          <footer className={cn("project-delete-actions storyboard-generation-status-actions", canCancelAll && "with-cancel")}>
            {canCancelAll ? (
              <>
                <Button className="project-delete-cancel" isDisabled={cancellingVideos} variant="outline" onPress={onClose}>
                  {t("common.close")}
                </Button>
                <Button
                  aria-busy={cancellingVideos}
                  className="storyboard-generation-cancel-all"
                  isDisabled={cancellingVideos}
                  isPending={cancellingVideos}
                  variant="primary"
                  onPress={() => void cancelAllVideos()}
                >
                  {cancellingVideos ? <LoaderCircle className="spinning" aria-hidden="true" /> : null}
                  {t(activeContentFilter === "video" ? "storyboard.generationStatusCancelAll" : "storyboard.generationStatusCancelVideos")}
                </Button>
              </>
            ) : (
              <Button className="project-delete-cancel storyboard-generation-close" variant="outline" onPress={onClose}>
                {t("common.close")}
              </Button>
            )}
          </footer>
        </section>
      </div>
      <StoryboardMediaPreviewDialog
        assets={previewAssets}
        currentIndex={previewIndex}
        elevated
        stripLabel={t("storyboard.generationStatusMediaPreviewStrip")}
        title={t("storyboard.generationStatusMediaPreviewTitle")}
        onClose={() => setPreviewIndex(null)}
        onIndexChange={setPreviewIndex}
      />
    </>,
    document.body
  );
}

function ColumnHeaderMenu({
  column,
  onDelete,
  onEdit,
  onHide
}: {
  column: StoryboardColumn;
  onDelete: () => void;
  onEdit: () => void;
  onHide: () => void;
}) {
  const { t } = useI18n();
  const columnLabel = getColumnLabel(column, t);

  return (
    <div className="header-column-menu" aria-label={t("storyboard.columnActions", { label: columnLabel })}>
      <button className="header-column-action" type="button" onClick={onEdit}>
        <Pencil aria-hidden="true" />
        <span>{t("storyboard.editColumn")}</span>
        <ChevronRight aria-hidden="true" />
      </button>
      <button className="header-column-action" type="button" disabled={column.locked} onClick={onHide}>
        <EyeOff aria-hidden="true" />
        <span>{t("storyboard.hideColumn")}</span>
      </button>
      <button className="header-column-action destructive" type="button" disabled={column.locked} onClick={onDelete}>
        <Trash2 aria-hidden="true" />
        <span>{t("storyboard.deleteColumn")}</span>
      </button>
    </div>
  );
}

function ColumnEditPanel({
  column,
  draftTitle,
  draftType,
  onCancel,
  onChangeDraftTitle,
  onChangeDraftType,
  onConfirm
}: {
  column: StoryboardColumn;
  draftTitle: string;
  draftType: StoryboardColumnType;
  onCancel: () => void;
  onChangeDraftTitle: (value: string) => void;
  onChangeDraftType: (value: StoryboardColumnType) => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();
  const columnLabel = getColumnLabel(column, t);

  return (
    <div className="column-edit-panel" aria-label={t("storyboard.editColumnLabel", { label: columnLabel })}>
      <label className="column-edit-field">
        <span>{t("storyboard.columnTitle")}</span>
        <Input
          className="column-title-input"
          value={draftTitle}
          onChange={(event) => onChangeDraftTitle(event.target.value)}
        />
      </label>
      <div className="column-edit-field">
        <span>{t("storyboard.columnType")}</span>
        <div className="column-type-options" role="radiogroup" aria-label={t("storyboard.columnType")}>
          {storyboardColumnTypeOptions.map((option) => (
            <button
              className={cn("column-type-option", draftType === option.value && "selected")}
              type="button"
              role="radio"
              aria-checked={draftType === option.value}
              key={option.value}
              onClick={() => onChangeDraftType(option.value)}
            >
              {getColumnTypeIcon(option.value)}
              <span>{getColumnTypeDisplayLabel(option.value, t)}</span>
              {draftType === option.value ? <Check aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
            </button>
          ))}
        </div>
      </div>
      <div className="column-edit-actions">
        <Button variant="outline" onPress={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button className="column-edit-confirm" onPress={onConfirm} variant="primary">
          {t("common.confirm")}
        </Button>
      </div>
    </div>
  );
}

function getClipboardPlainText(event: React.ClipboardEvent<HTMLElement>): string | null {
  const plainText = event.clipboardData.getData("text/plain");
  if (plainText) return normalizeStoryboardEditableText(plainText);
  const html = event.clipboardData.getData("text/html");
  if (!html) return null;
  const document = new DOMParser().parseFromString(html, "text/html");
  return normalizeStoryboardEditableText(document.body.textContent ?? "");
}

function handleStoryboardPlainTextPaste(event: React.ClipboardEvent<HTMLElement>) {
  const plainText = getClipboardPlainText(event);
  if (plainText === null) return;
  event.preventDefault();
  insertStoryboardEditableText(event.currentTarget, plainText);
}

function handleStoryboardEditableKeyDown(event: React.KeyboardEvent<HTMLElement>) {
  if (event.key !== "Enter" || event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return;
  event.preventDefault();
  insertStoryboardEditableText(event.currentTarget, "\n");
}

function insertStoryboardEditableText(target: HTMLElement, text: string) {
  const ownerDocument = target.ownerDocument;
  const selection = ownerDocument.getSelection();
  if (!selection || selection.rangeCount === 0) {
    target.appendChild(ownerDocument.createTextNode(text));
    return;
  }

  const range = selection.getRangeAt(0);
  if (!target.contains(range.commonAncestorContainer)) {
    target.appendChild(ownerDocument.createTextNode(text));
    target.focus();
    return;
  }

  range.deleteContents();
  const textNode = ownerDocument.createTextNode(text);
  range.insertNode(textNode);
  range.setStart(textNode, textNode.data.length);
  range.setEnd(textNode, textNode.data.length);
  selection.removeAllRanges();
  selection.addRange(range);
}

function readStoryboardEditableText(target: HTMLElement): string {
  return normalizeStoryboardEditableText(target.innerText || target.textContent || "");
}

function normalizeStoryboardEditableText(value: string): string {
  return value.replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ");
}

function getStoryboardDisplayCellValue(column: StoryboardColumn, value: string): string {
  const trimmedValue = value.trim();
  if (!trimmedValue) return "";
  if (column.type === "text" && isStoryboardPromptTextColumn(column) && isPromptPlaceholderValue(trimmedValue)) return "";
  if (column.id === "scene" && trimmedValue === "输入类别") return "";
  if (column.id === "content" && trimmedValue === "输入内容") return "";
  if (column.id === "note" && trimmedValue === "输入备注") return "";
  return value;
}

function getStoryboardTextPlaceholder(column: StoryboardColumn, t: Translator): string {
  if (column.id === "content") return t("storyboard.contentPlaceholder");
  if (column.id === "note") return t("storyboard.notePlaceholder");
  return t("storyboard.inputPlaceholder");
}

function getStoryboardPromptPlaceholder(column: StoryboardColumn, rawValue: string, t: Translator, isArollRow: boolean): string {
  if (isArollRow || isPromptPlaceholderValue(rawValue.trim())) return t("storyboard.noPromptPlaceholder");
  if (isStoryboardImagePromptColumn(column)) return t("storyboard.imagePromptPlaceholder");
  if (isStoryboardVideoPromptColumn(column)) return t("storyboard.videoPromptPlaceholder");
  return t("storyboard.promptPlaceholder");
}

function isPromptPlaceholderValue(value: string): boolean {
  return value === "—" || value === "-";
}

function StoryboardCell({
  assets,
  column,
  columns,
  imageGenerating,
  row,
  imageRatio,
  projectId,
  readOnly,
  videoGenerationTask,
  videoGenerating,
  onChooseShotMedia,
  onImportClipboardImageAsShotMedia,
  onImportShotMediaPaths,
  onChooseProjectAssets,
  onUpdateCell,
  onUpdateShotMedia
}: {
  assets: ProjectAsset[];
  column: StoryboardColumn;
  columns: StoryboardColumn[];
  imageGenerating: boolean;
  row: StoryboardRow;
  imageRatio: ImageRatio;
  projectId: string;
  readOnly: boolean;
  videoGenerationTask: StoryboardGenerationTaskItem | null;
  videoGenerating: boolean;
  onChooseShotMedia: (rowId: string) => void;
  onImportClipboardImageAsShotMedia: (rowId: string) => void;
  onImportShotMediaPaths: (rowId: string, filePaths: string[]) => void;
  onChooseProjectAssets: ChooseProjectAssetsHandler;
  onUpdateCell: UpdateStoryboardCellHandler;
  onUpdateShotMedia: (rowId: string, assetIds: string[]) => void;
}) {
  const { t } = useI18n();

  if (column.id === "sort") {
    return (
      <div className="drag-cell" role="cell">
        <span className="drag-handle" aria-hidden="true" />
      </div>
    );
  }

  if (column.id === "shot") return <div role="cell" data-column-id="shot">{row.shot}</div>;

  if (column.type === "image") {
    return (
      <StoryboardImageCell
        assets={assets}
        imageGenerating={imageGenerating}
        imageRatio={imageRatio}
        projectId={projectId}
        readOnly={readOnly}
        row={row}
        videoGenerationTask={videoGenerationTask}
        videoGenerating={videoGenerating}
        onChooseShotMedia={onChooseShotMedia}
        onImportClipboardImageAsShotMedia={onImportClipboardImageAsShotMedia}
        onImportShotMediaPaths={onImportShotMediaPaths}
        onUpdateCell={onUpdateCell}
        onUpdateShotMedia={onUpdateShotMedia}
      />
    );
  }

  const rawCellValue = getStoryboardCellValue(column.id, row);
  const isPromptColumn = column.type === "text" && isStoryboardPromptTextColumn(column);
  const isGenerationMethodColumn = isStoryboardGenerationMethodColumn(column);
  const cellValue = getStoryboardDisplayCellValue(column, rawCellValue);
  const isArollRow = isArollStoryboardRow(row);
  const isEmptyTextCell = !cellValue.trim();

  if (column.id === "scene") {
    return <StoryboardCategoryCell columns={columns} readOnly={readOnly} row={row} value={cellValue} onUpdateCell={onUpdateCell} />;
  }

  if (isPromptColumn && isArollRow && isEmptyTextCell) {
    return (
      <div
        className="prompt-disabled-cell placeholder-cell"
        data-placeholder={getStoryboardPromptPlaceholder(column, rawCellValue, t, isArollRow)}
        role="cell"
        aria-readonly="true"
      />
    );
  }

  if (isGenerationMethodColumn && column.type === "select" && isArollRow) {
    return <div className="generation-method-cell generation-method-empty" role="cell" aria-readonly="true" />;
  }

  if (isPromptColumn) {
    const promptAssetKind = isStoryboardVideoPromptColumn(column) ? "video" : "image";
    const promptPreviewAssets = getStoryboardPromptPreviewAssets(row, assets, promptAssetKind);
    const projectPromptAssets = assets.filter((asset) => asset.kind === promptAssetKind);
    return (
      <StoryboardPromptCell
        asset={getStoryboardPromptPreviewAsset(row, assets, promptAssetKind)}
        assets={promptPreviewAssets}
        column={column}
        imageRatio={imageRatio}
        kind={promptAssetKind}
        projectId={projectId}
        projectAssets={projectPromptAssets}
        readOnly={readOnly}
        row={row}
        value={cellValue}
        placeholder={getStoryboardPromptPlaceholder(column, rawCellValue, t, isArollRow)}
        onChooseProjectAssets={onChooseProjectAssets}
        onUpdateCell={onUpdateCell}
      />
    );
  }

  if (column.type === "select") {
    if (isGenerationMethodColumn) {
      return <GenerationMethodCell column={column} readOnly={readOnly || isArollRow} row={row} value={cellValue} onUpdateCell={onUpdateCell} />;
    }

    return (
      <div role="cell">
        <button className="cell-select" type="button" disabled={readOnly}>
          <span>{cellValue || t("storyboard.selectPlaceholder")}</span>
          <ChevronDown aria-hidden="true" />
        </button>
      </div>
    );
  }

  if (column.type === "number") {
    return (
      <div
        className={cn("number-cell", isEmptyTextCell && "placeholder-cell")}
        data-placeholder="0"
        role="cell"
        aria-readonly={readOnly}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        onBlur={readOnly ? undefined : (event) => onUpdateCell(row.id, column.id, readStoryboardEditableText(event.currentTarget))}
        onPaste={readOnly ? undefined : handleStoryboardPlainTextPaste}
      >
        {isEmptyTextCell ? null : cellValue}
      </div>
    );
  }

  return (
    <div
      className={cn(column.custom && "custom-column-cell", isEmptyTextCell && "placeholder-cell")}
      data-placeholder={getStoryboardTextPlaceholder(column, t)}
      role="cell"
      aria-readonly={readOnly}
      contentEditable={!readOnly}
      suppressContentEditableWarning
      onBlur={readOnly ? undefined : (event) => onUpdateCell(row.id, column.id, readStoryboardEditableText(event.currentTarget))}
      onKeyDown={readOnly ? undefined : handleStoryboardEditableKeyDown}
      onPaste={readOnly ? undefined : handleStoryboardPlainTextPaste}
    >
      {isEmptyTextCell ? null : cellValue}
    </div>
  );
}

function StoryboardPromptCell({
  asset,
  assets,
  column,
  imageRatio,
  kind,
  projectId,
  projectAssets,
  placeholder,
  readOnly,
  row,
  value,
  onChooseProjectAssets,
  onUpdateCell
}: {
  asset: ProjectAsset | null;
  assets: ProjectAsset[];
  column: StoryboardColumn;
  imageRatio: ImageRatio;
  kind: "image" | "video";
  projectId: string;
  projectAssets: ProjectAsset[];
  placeholder: string;
  readOnly: boolean;
  row: StoryboardRow;
  value: string;
  onChooseProjectAssets: ChooseProjectAssetsHandler;
  onUpdateCell: UpdateStoryboardCellHandler;
}) {
  const { t } = useI18n();
  const [assetDrawerOpen, setAssetDrawerOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const isEmpty = !value.trim();
  const canEditAsset = !readOnly;
  const assetIdField = getPromptPreviewAssetIdField(kind);
  const hiddenField = getPromptPreviewHiddenField(kind);
  const previewAssets = useMemo(() => {
    if (!asset) return assets;
    return assets.some((previewAsset) => previewAsset.id === asset.id) ? assets : [asset, ...assets];
  }, [asset, assets]);
  const { assetDurationLabels, assetDimensions, updateAssetDimensions, updateAssetDurationLabel } = useAssetDurationLabels(previewAssets);
  const assetPreviewIndex = asset ? previewAssets.findIndex((previewAsset) => previewAsset.id === asset.id) : -1;
  const assetDurationLabel = asset?.kind === "video" ? assetDurationLabels[asset.id] : null;
  const assetResolutionLabel = asset ? formatAssetResolutionLabel(asset, assetDimensions[asset.id]) : null;

  useEffect(() => {
    if (previewIndex !== null && (previewIndex < 0 || previewIndex >= previewAssets.length)) setPreviewIndex(null);
  }, [previewAssets.length, previewIndex]);

  async function removeAssetPreview() {
    await onUpdateCell(row.id, assetIdField, "");
    await onUpdateCell(row.id, hiddenField, "true");
  }

  async function chooseAssetPreview(assetId: string) {
    await onUpdateCell(row.id, assetIdField, assetId);
    await onUpdateCell(row.id, hiddenField, "");
    setAssetDrawerOpen(false);
  }

  return (
    <div className="storyboard-prompt-cell" role="cell" aria-readonly={readOnly}>
      {asset ? (
        <figure className="storyboard-prompt-asset" data-ratio={imageRatio} title={asset.name}>
          <button
            className="storyboard-prompt-asset-preview-trigger"
            type="button"
            aria-label={t("storyboard.openMediaPreview", { name: asset.name })}
            onClick={() => setPreviewIndex(assetPreviewIndex >= 0 ? assetPreviewIndex : 0)}
          >
            {asset.kind === "video" ? (
              <video
                src={asset.previewUrl}
                poster={asset.posterUrl ?? undefined}
                muted
                playsInline
                preload="metadata"
                onLoadedMetadata={(event) =>
                  updateAssetDurationLabel(asset.id, event.currentTarget.duration, event.currentTarget.videoWidth, event.currentTarget.videoHeight)
                }
              />
            ) : (
              <img
                src={asset.previewUrl}
                alt={asset.name}
                loading="lazy"
                onLoad={(event) => updateAssetDimensions(asset.id, event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)}
              />
            )}
          </button>
          <AssetPreviewBadges asset={asset} durationLabel={assetDurationLabel} resolutionLabel={assetResolutionLabel} />
          {!readOnly ? (
            <button className="storyboard-prompt-asset-remove" type="button" aria-label={t("storyboard.removePromptPreview")} onClick={() => void removeAssetPreview()}>
              <X aria-hidden="true" />
            </button>
          ) : null}
        </figure>
      ) : canEditAsset ? (
        <button className="storyboard-prompt-floating-add" type="button" aria-label={t("storyboard.addPromptPreview")} onClick={() => setAssetDrawerOpen(true)}>
          <Plus aria-hidden="true" />
        </button>
      ) : null}
      <div
        className={cn("storyboard-prompt-text", "custom-column-cell", isEmpty && "placeholder-cell")}
        data-placeholder={placeholder}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        onBlur={readOnly ? undefined : (event) => onUpdateCell(row.id, column.id, readStoryboardEditableText(event.currentTarget))}
        onKeyDown={readOnly ? undefined : handleStoryboardEditableKeyDown}
        onPaste={readOnly ? undefined : handleStoryboardPlainTextPaste}
      >
        {isEmpty ? null : value}
      </div>
      {assetDrawerOpen ? (
        <StoryboardPromptAssetDrawer
          assets={projectAssets}
          kind={kind}
          row={row}
          selectedAssetId={asset?.id ?? null}
          onChooseProjectAssets={onChooseProjectAssets}
          onClose={() => setAssetDrawerOpen(false)}
          onSelectAsset={chooseAssetPreview}
        />
      ) : null}
      <StoryboardMediaPreviewDialog
        assets={previewAssets}
        currentIndex={previewIndex}
        projectId={projectId}
        stripLabel={t("storyboard.mediaPreviewStrip")}
        title={t("storyboard.mediaPreviewTitle", { shot: row.shot })}
        onClose={() => setPreviewIndex(null)}
        onIndexChange={setPreviewIndex}
      />
    </div>
  );
}

function StoryboardCategoryCell({
  columns,
  readOnly,
  row,
  value,
  onUpdateCell
}: {
  columns: StoryboardColumn[];
  readOnly: boolean;
  row: StoryboardRow;
  value: string;
  onUpdateCell: UpdateStoryboardCellHandler;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const category = normalizeStoryboardCategory(value);
  const label = category || value.trim();
  const isEmpty = !value.trim();

  async function selectCategory(nextCategory: StoryboardCategory) {
    await onUpdateCell(row.id, "scene", nextCategory);
    const generationMethodColumn = columns.find(isStoryboardGenerationMethodColumn);
    if (nextCategory === "A-ROLL" && generationMethodColumn && getStoryboardCellValue(generationMethodColumn.id, row).trim()) {
      await onUpdateCell(row.id, generationMethodColumn.id, "");
    }
    setOpen(false);
  }

  return (
    <div className="storyboard-category-cell" role="cell" data-column-id="scene" aria-readonly={readOnly}>
      <Popover isOpen={open && !readOnly} onOpenChange={setOpen}>
        <Popover.Trigger>
          <button
            className={cn("storyboard-category-tag", getStoryboardCategoryClassName(value))}
            type="button"
            disabled={readOnly}
            data-placeholder={t("storyboard.inputPlaceholder")}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setOpen((currentOpen) => !currentOpen);
            }}
          >
            {category ? getStoryboardCategoryIcon(category) : <TableProperties aria-hidden="true" />}
            <span>{isEmpty ? t("storyboard.selectPlaceholder") : label}</span>
            <ChevronDown className="storyboard-category-chevron" aria-hidden="true" />
          </button>
        </Popover.Trigger>
        <Popover.Content className="storyboard-category-popover" isNonModal offset={8} placement="bottom start">
          <Popover.Dialog>
            <div className="storyboard-category-menu" aria-label={t("storyboard.categoryMenu")}>
              {storyboardCategoryOptions.map((option) => (
                <button className={cn("storyboard-category-option", getStoryboardCategoryClassName(option))} type="button" key={option} onClick={() => void selectCategory(option)}>
                  {getStoryboardCategoryIcon(option)}
                  <span>{option}</span>
                </button>
              ))}
            </div>
          </Popover.Dialog>
        </Popover.Content>
      </Popover>
    </div>
  );
}

function GenerationMethodCell({
  column,
  readOnly,
  row,
  value,
  onUpdateCell
}: {
  column: StoryboardColumn;
  readOnly: boolean;
  row: StoryboardRow;
  value: string;
  onUpdateCell: UpdateStoryboardCellHandler;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const method = normalizeStoryboardGenerationMethod(value);

  if (readOnly && !method) return <div className="generation-method-cell generation-method-empty" role="cell" aria-readonly="true" />;

  function selectMethod(nextMethod: StoryboardGenerationMethod) {
    onUpdateCell(row.id, column.id, nextMethod);
    setOpen(false);
  }

  function clearMethod() {
    onUpdateCell(row.id, column.id, "");
    setOpen(false);
  }

  return (
    <div className="generation-method-cell" role="cell">
      <Popover isOpen={open && !readOnly} onOpenChange={setOpen}>
        <Popover.Trigger>
          <span className="generation-method-control">
            <button
              className={cn("generation-method-tag", method ? getGenerationMethodClassName(method) : "empty")}
              type="button"
              disabled={readOnly}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setOpen((currentOpen) => !currentOpen);
              }}
            >
              {method ? getGenerationMethodIcon(method) : <Sparkles aria-hidden="true" />}
              <span>{method ? getGenerationMethodDisplayLabel(method, t) : t("storyboard.selectPlaceholder")}</span>
              <ChevronDown className="generation-method-chevron" aria-hidden="true" />
            </button>
            {method && !readOnly ? (
              <button
                className="generation-method-clear-button"
                type="button"
                aria-label={t("storyboard.clearGenerationMethod")}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  clearMethod();
                }}
              >
                <X aria-hidden="true" />
              </button>
            ) : null}
          </span>
        </Popover.Trigger>
        <Popover.Content className="generation-method-popover" isNonModal offset={8} placement="bottom start">
          <Popover.Dialog>
            <div className="generation-method-menu" aria-label={t("storyboard.generationMethodMenu")}>
              {storyboardGenerationMethodOptions.map((option) => (
                <button className={cn("generation-method-option", getGenerationMethodClassName(option))} type="button" key={option} onClick={() => selectMethod(option)}>
                  {getGenerationMethodIcon(option)}
                  <span>{getGenerationMethodDisplayLabel(option, t)}</span>
                </button>
              ))}
            </div>
          </Popover.Dialog>
        </Popover.Content>
      </Popover>
    </div>
  );
}

function StoryboardImageCell({
  assets,
  imageGenerating,
  imageRatio,
  projectId,
  readOnly,
  row,
  videoGenerationTask,
  videoGenerating,
  onChooseShotMedia,
  onImportClipboardImageAsShotMedia,
  onImportShotMediaPaths,
  onUpdateCell,
  onUpdateShotMedia
}: {
  assets: ProjectAsset[];
  imageGenerating: boolean;
  imageRatio: ImageRatio;
  projectId: string;
  readOnly: boolean;
  row: StoryboardRow;
  videoGenerationTask: StoryboardGenerationTaskItem | null;
  videoGenerating: boolean;
  onChooseShotMedia: (rowId: string) => void;
  onImportClipboardImageAsShotMedia: (rowId: string) => void;
  onImportShotMediaPaths: (rowId: string, filePaths: string[]) => void;
  onUpdateCell: UpdateStoryboardCellHandler;
  onUpdateShotMedia: (rowId: string, assetIds: string[]) => void;
}) {
  const { t } = useI18n();
  const mediaAssets = getStoryboardRowMediaAssets(row, assets);
  const displayAssets = getStoryboardRowDisplayMediaAssets(row, assets);
  const editableMediaAssetIds = getStoryboardRowEditableMediaAssetIds(row, assets);
  const previewAssets = getStoryboardRowPreviewAssets(row, assets);
  const { assetDurationLabels, assetDimensions, updateAssetDimensions, updateAssetDurationLabel } = useAssetDurationLabels(displayAssets);
  const mediaGenerating = imageGenerating || videoGenerating;
  const canAddMedia = !readOnly && editableMediaAssetIds.length < 10;
  const isARoll = isArollStoryboardRow(row);
  const showARollSample = isARoll;
  const aRollSampleHidden = isArollSampleHidden(row);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [draggingMediaAssetId, setDraggingMediaAssetId] = useState<string | null>(null);
  const [dragOverMediaAssetId, setDragOverMediaAssetId] = useState<string | null>(null);
  const [fileDragActive, setFileDragActive] = useState(false);
  const fileDragDepthRef = useRef(0);

  useEffect(() => {
    if (previewIndex === null) return;
    if (previewAssets.length === 0) {
      setPreviewIndex(null);
      return;
    }
    if (previewIndex >= previewAssets.length) setPreviewIndex(previewAssets.length - 1);
  }, [previewAssets.length, previewIndex]);

  function chooseMedia() {
    if (!canAddMedia) return;
    onChooseShotMedia(row.id);
  }

  function pasteMedia(event: React.ClipboardEvent<HTMLDivElement>) {
    if (readOnly) return;
    const files = Array.from(event.clipboardData.files);
    const filePaths = window.mkboard.resolveDroppedFilePaths(files);
    if (filePaths.length > 0) {
      event.preventDefault();
      onImportShotMediaPaths(row.id, filePaths);
      return;
    }

    const hasImageItem = Array.from(event.clipboardData.items).some((item) => item.kind === "file" && item.type.startsWith("image/"));
    if (hasImageItem) {
      event.preventDefault();
      onImportClipboardImageAsShotMedia(row.id);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    chooseMedia();
  }

  function removeMediaAsset(assetId: string) {
    if (readOnly) return;
    onUpdateShotMedia(row.id, editableMediaAssetIds.filter((currentAssetId) => currentAssetId !== assetId));
  }

  function startMediaAssetDrag(event: React.DragEvent<HTMLButtonElement>, assetId: string) {
    event.stopPropagation();
    if (readOnly) {
      event.preventDefault();
      return;
    }
    setDraggingMediaAssetId(assetId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(STORYBOARD_MEDIA_DRAG_TYPE, assetId);
  }

  function clearMediaAssetDrag() {
    setDraggingMediaAssetId(null);
    setDragOverMediaAssetId(null);
  }

  function dragMediaAssetOver(event: React.DragEvent<HTMLElement>, targetAssetId: string) {
    if (readOnly || !draggingMediaAssetId) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    if (dragOverMediaAssetId !== targetAssetId) setDragOverMediaAssetId(targetAssetId);
  }

  function dropMediaAsset(event: React.DragEvent<HTMLElement>, targetAssetId: string) {
    if (readOnly) return;
    const sourceAssetId = event.dataTransfer.getData(STORYBOARD_MEDIA_DRAG_TYPE) || draggingMediaAssetId;
    if (!sourceAssetId) return;
    event.preventDefault();
    event.stopPropagation();
    if (sourceAssetId !== targetAssetId) {
      const nextAssetIds = moveStoryboardMediaAssetId(editableMediaAssetIds, sourceAssetId, targetAssetId);
      if (!areStringArraysEqual(nextAssetIds, editableMediaAssetIds)) onUpdateShotMedia(row.id, nextAssetIds);
    }
    clearMediaAssetDrag();
  }

  function openMediaPreview(assetId: string) {
    const nextIndex = previewAssets.findIndex((asset) => asset.id === assetId);
    setPreviewIndex(nextIndex >= 0 ? nextIndex : 0);
  }

  function isExternalFileDrag(event: React.DragEvent<HTMLElement>) {
    const types = Array.from(event.dataTransfer.types);
    return types.includes("Files") && !types.includes(STORYBOARD_MEDIA_DRAG_TYPE);
  }

  function handleFileDragEnter(event: React.DragEvent<HTMLDivElement>) {
    if (readOnly || !isExternalFileDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    fileDragDepthRef.current += 1;
    if (canAddMedia) setFileDragActive(true);
  }

  function handleFileDragOver(event: React.DragEvent<HTMLDivElement>) {
    if (readOnly || !isExternalFileDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = canAddMedia ? "copy" : "none";
  }

  function handleFileDragLeave(event: React.DragEvent<HTMLDivElement>) {
    if (readOnly || !isExternalFileDrag(event)) return;
    event.stopPropagation();
    fileDragDepthRef.current = Math.max(0, fileDragDepthRef.current - 1);
    if (fileDragDepthRef.current === 0) setFileDragActive(false);
  }

  function handleFileDrop(event: React.DragEvent<HTMLDivElement>) {
    if (readOnly || !isExternalFileDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    fileDragDepthRef.current = 0;
    setFileDragActive(false);
    if (!canAddMedia) return;
    const filePaths = window.mkboard.resolveDroppedFilePaths(Array.from(event.dataTransfer.files));
    if (filePaths.length > 0) onImportShotMediaPaths(row.id, filePaths);
  }

  const fileDropProps = {
    onDragEnter: handleFileDragEnter,
    onDragOver: handleFileDragOver,
    onDragLeave: handleFileDragLeave,
    onDrop: handleFileDrop
  };
  const fileDropHint = fileDragActive ? (
    <div className="storyboard-media-drop-hint" aria-hidden="true">
      <UploadCloud />
      <span>{t("storyboard.dropMediaHint")}</span>
    </div>
  ) : null;

  function removeARollSample() {
    if (readOnly) return;
    onUpdateCell(row.id, A_ROLL_SAMPLE_HIDDEN_FIELD, "true");
  }

  const showVisibleARollSample = showARollSample && !aRollSampleHidden;
  const aRollSampleElement = showVisibleARollSample ? (
    <figure className="storyboard-a-roll-sample" data-ratio={imageRatio}>
      <img src={A_ROLL_SAMPLE_IMAGE_SRC} alt={t("storyboard.aRollSample")} loading="lazy" />
      <figcaption>{t("storyboard.aRollSampleShort")}</figcaption>
      {!readOnly ? (
        <button className="storyboard-media-remove a-roll-sample-remove" type="button" aria-label={t("storyboard.removeARollSample")} onClick={removeARollSample}>
          <X aria-hidden="true" />
        </button>
      ) : null}
    </figure>
  ) : null;

  if (displayAssets.length === 0) {
    if (mediaGenerating) {
      return (
        <div
          className={cn("storyboard-media-cell is-generating", showVisibleARollSample && "has-a-roll-sample", fileDragActive && "is-file-drag-over")}
          role="cell"
          tabIndex={readOnly ? -1 : 0}
          aria-label={
            imageGenerating && videoGenerating
              ? `${t("storyboard.imageGenerating")} / ${t("storyboard.videoGenerating")}`
              : t(videoGenerating ? "storyboard.videoGenerating" : "storyboard.imageGenerating")
          }
          onKeyDown={handleKeyDown}
          onPaste={pasteMedia}
          {...fileDropProps}
        >
          {fileDropHint}
          <div className="storyboard-media-grid" data-ratio={imageRatio}>
            {aRollSampleElement}
            {imageGenerating ? <StoryboardMediaGeneratingThumb imageRatio={imageRatio} kind="image" /> : null}
            {videoGenerating ? <StoryboardMediaGeneratingThumb imageRatio={imageRatio} kind="video" task={videoGenerationTask} /> : null}
            {canAddMedia ? (
              <button className="storyboard-media-add" data-ratio={imageRatio} type="button" aria-label={t("storyboard.addMoreMedia")} onClick={chooseMedia}>
                <Plus aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>
      );
    }

    return (
      <div
        className={cn("storyboard-media-cell is-empty", showVisibleARollSample && "has-a-roll-sample", fileDragActive && "is-file-drag-over")}
        role="cell"
        tabIndex={readOnly ? -1 : 0}
        aria-label={showVisibleARollSample ? t("storyboard.aRollSample") : t("storyboard.addImage")}
        onKeyDown={handleKeyDown}
        onPaste={pasteMedia}
        {...fileDropProps}
      >
        {fileDropHint}
        <div className="storyboard-media-grid" data-ratio={imageRatio}>
          {aRollSampleElement}
          <button className="storyboard-media-add" data-ratio={imageRatio} type="button" aria-label={t("storyboard.addImage")} disabled={!canAddMedia} onClick={chooseMedia}>
            <Plus aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn("storyboard-media-cell has-media", showVisibleARollSample && "has-a-roll-sample", fileDragActive && "is-file-drag-over")}
      role="cell"
      tabIndex={readOnly ? -1 : 0}
      aria-label={t("storyboard.mediaCount", { count: mediaAssets.length })}
      onKeyDown={handleKeyDown}
      onPaste={pasteMedia}
      {...fileDropProps}
    >
      {fileDropHint}
      <div className="storyboard-media-grid" data-ratio={imageRatio}>
        {aRollSampleElement}
        {imageGenerating ? <StoryboardMediaGeneratingThumb imageRatio={imageRatio} kind="image" compact /> : null}
        {videoGenerating ? <StoryboardMediaGeneratingThumb imageRatio={imageRatio} kind="video" task={videoGenerationTask} compact /> : null}
        {displayAssets.map((asset) => {
          const durationLabel = asset.kind === "video" ? assetDurationLabels[asset.id] : null;
          const resolutionLabel = formatAssetResolutionLabel(asset, assetDimensions[asset.id]);
          return (
            <figure
              className={cn("storyboard-media-thumb", draggingMediaAssetId === asset.id && "dragging", dragOverMediaAssetId === asset.id && draggingMediaAssetId !== asset.id && "drag-over")}
              data-ratio={imageRatio}
              title={asset.name}
              key={asset.id}
              onDragOver={(event) => dragMediaAssetOver(event, asset.id)}
              onDrop={(event) => dropMediaAsset(event, asset.id)}
            >
              {!readOnly && displayAssets.length > 1 ? (
                <button
                  className="storyboard-media-drag-handle"
                  type="button"
                  draggable
                  aria-label={t("storyboard.dragMedia", { name: asset.name })}
                  onDragStart={(event) => startMediaAssetDrag(event, asset.id)}
                  onDragEnd={clearMediaAssetDrag}
                >
                  <GripVertical aria-hidden="true" />
                </button>
              ) : null}
              <button
                className="storyboard-media-preview-trigger"
                type="button"
                aria-label={t("storyboard.openMediaPreview", { name: asset.name })}
                onClick={() => openMediaPreview(asset.id)}
              >
                {asset.kind === "video" ? (
                  <>
                    <video
                      src={asset.previewUrl}
                      poster={asset.posterUrl ?? undefined}
                      muted
                      playsInline
                      preload="metadata"
                      draggable={false}
                      onLoadedMetadata={(event) =>
                        updateAssetDurationLabel(asset.id, event.currentTarget.duration, event.currentTarget.videoWidth, event.currentTarget.videoHeight)
                      }
                    />
                    <span className="storyboard-media-play" aria-hidden="true">
                      <Play />
                    </span>
                  </>
                ) : (
                  <img
                    src={asset.previewUrl}
                    alt={asset.name}
                    draggable={false}
                    loading="lazy"
                    onLoad={(event) => updateAssetDimensions(asset.id, event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)}
                  />
                )}
              </button>
              <AssetPreviewBadges asset={asset} durationLabel={durationLabel} resolutionLabel={resolutionLabel} />
              {!readOnly ? (
                <button
                  className="storyboard-media-remove"
                  type="button"
                  aria-label={t("storyboard.removeMedia", { name: asset.name })}
                  onClick={() => removeMediaAsset(asset.id)}
                >
                  <X aria-hidden="true" />
                </button>
              ) : null}
            </figure>
          );
        })}
        {canAddMedia ? (
          <button className="storyboard-media-add" data-ratio={imageRatio} type="button" aria-label={t("storyboard.addMoreMedia")} onClick={chooseMedia}>
            <Plus aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <StoryboardMediaPreviewDialog
        assets={previewAssets}
        currentIndex={previewIndex}
        projectId={projectId}
        stripLabel={t("storyboard.mediaPreviewStrip")}
        title={t("storyboard.mediaPreviewTitle", { shot: row.shot })}
        onClose={() => setPreviewIndex(null)}
        onIndexChange={setPreviewIndex}
      />
    </div>
  );
}

function StoryboardMediaGeneratingThumb({
  compact = false,
  imageRatio,
  kind,
  task
}: {
  compact?: boolean;
  imageRatio: ImageRatio;
  kind: "image" | "video";
  task?: StoryboardGenerationTaskItem | null;
}) {
  const { t } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  const activeTask = task && isActiveGenerationTaskStatus(task.status) ? task : null;
  const showElapsed = kind === "video";
  const elapsedText = showElapsed ? formatGenerationTaskElapsedClock(activeTask, now) || formatElapsedClock(0) : "";
  const elapsedRunning = Boolean(activeTask?.startedAt && !activeTask.finishedAt);
  const brand = getStoryboardGenerationBrand(kind, task?.method);
  const queuedLabel = kind === "video" && activeTask?.status === "queued" ? t("storyboard.generationStatusQueued") : "";

  useEffect(() => {
    if (!elapsedRunning) return undefined;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [activeTask?.startedAt, elapsedRunning]);

  return (
    <div className={cn("storyboard-media-generating", compact && "compact")} data-ratio={imageRatio} aria-hidden={compact ? "true" : undefined}>
      <div className="storyboard-media-generating-frame">
        {brand ? <StoryboardGenerationBrandIcon brand={brand} className="storyboard-media-generating-logo" /> : <LoaderCircle className="spinning" aria-hidden="true" />}
        {queuedLabel ? <span className="storyboard-media-generating-queue">{queuedLabel}</span> : null}
        {elapsedText ? <span className="storyboard-media-generating-elapsed">{elapsedText}</span> : null}
      </div>
    </div>
  );
}

type StoryboardGenerationBrand = "image2" | "seedance" | "hyperframes" | "claude";

function getStoryboardGenerationBrand(kind: "image" | "video", method?: string): StoryboardGenerationBrand | null {
  if (kind === "image") return "image2";
  if (method === "Hyperframes") return "hyperframes";
  if (method === "Seedance 2.0" || /seedance|c[-\s]?dance/iu.test(method ?? "")) return "seedance";
  if (/claude\s*2(?:\.0)?/iu.test(method ?? "")) return "claude";
  return null;
}

function StoryboardGenerationBrandIcon({ brand, className }: { brand: StoryboardGenerationBrand; className?: string }) {
  if (brand === "hyperframes") return <img className={className} src={HYPERFRAMES_LOGO_SRC} alt="" />;
  const Icon = brand === "image2" ? OpenAIIcon : brand === "seedance" ? ByteDanceIcon : ClaudeCodeIcon;
  return (
    <span className={cn("storyboard-generation-brand-icon", className, brand)} aria-hidden="true">
      <Icon size={20} />
    </span>
  );
}

function StoryboardMediaPreviewDialog({
  assets,
  currentIndex,
  elevated = false,
  projectId,
  stripLabel,
  title,
  onClose,
  onIndexChange
}: {
  assets: ProjectAsset[];
  currentIndex: number | null;
  elevated?: boolean;
  projectId?: string;
  stripLabel: string;
  title: string;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}) {
  const { t } = useI18n();
  const isOpen = currentIndex !== null && currentIndex >= 0 && currentIndex < assets.length;
  const currentAsset = isOpen ? assets[currentIndex] : null;
  const hasMultipleAssets = assets.length > 1;

  function showPrevious() {
    if (currentIndex === null || assets.length === 0) return;
    onIndexChange((currentIndex - 1 + assets.length) % assets.length);
  }

  function showNext() {
    if (currentIndex === null || assets.length === 0) return;
    onIndexChange((currentIndex + 1) % assets.length);
  }

  async function openCurrentImageContextMenu(event: React.MouseEvent<HTMLImageElement>) {
    if (!projectId || !currentAsset || currentAsset.kind !== "image") return;
    event.preventDefault();
    try {
      await window.mkboard.showAssetImageContextMenu(projectId, currentAsset.id, t("storyboard.copyMediaPreviewImage"));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  }

  useEffect(() => {
    if (!isOpen) return undefined;

    function handlePreviewKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        showPrevious();
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        showNext();
      }
    }

    window.addEventListener("keydown", handlePreviewKeyDown);
    return () => window.removeEventListener("keydown", handlePreviewKeyDown);
  }, [currentIndex, isOpen, onClose]);

  if (!isOpen || !currentAsset || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={cn("storyboard-media-preview-layer", elevated && "elevated")}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="storyboard-media-preview-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="storyboard-media-preview-title"
      >
        <header className="storyboard-media-preview-header">
          <div>
            <h2 id="storyboard-media-preview-title">{title}</h2>
            <p>{currentAsset.name}</p>
          </div>
          <div className="storyboard-media-preview-meta">
            <span>{t("storyboard.mediaPreviewCounter", { current: currentIndex + 1, total: assets.length })}</span>
            <button className="storyboard-media-preview-close" type="button" aria-label={t("storyboard.closeMediaPreview")} onClick={onClose}>
              <X aria-hidden="true" />
            </button>
          </div>
        </header>
        <div className="storyboard-media-preview-stage">
          {hasMultipleAssets ? (
            <button className="storyboard-media-preview-nav previous" type="button" aria-label={t("storyboard.previousMedia")} onClick={showPrevious}>
              <ChevronLeft aria-hidden="true" />
            </button>
          ) : null}
          <div className={cn("storyboard-media-preview-frame", currentAsset.kind === "video" && "video-frame")}>
            {currentAsset.kind === "video" ? (
              <video src={currentAsset.previewUrl} poster={currentAsset.posterUrl ?? undefined} controls playsInline preload="metadata" />
            ) : (
              <img src={currentAsset.previewUrl} alt={currentAsset.name} onContextMenu={(event) => void openCurrentImageContextMenu(event)} />
            )}
          </div>
          {hasMultipleAssets ? (
            <button className="storyboard-media-preview-nav next" type="button" aria-label={t("storyboard.nextMedia")} onClick={showNext}>
              <ChevronRight aria-hidden="true" />
            </button>
          ) : null}
        </div>
        {hasMultipleAssets ? (
          <footer className="storyboard-media-preview-strip" aria-label={stripLabel}>
            {assets.map((asset, assetIndex) => (
              <button
                className={cn("storyboard-media-preview-strip-item", assetIndex === currentIndex && "active")}
                type="button"
                aria-label={t("storyboard.openMediaPreview", { name: asset.name })}
                aria-current={assetIndex === currentIndex ? "true" : undefined}
                key={asset.id}
                onClick={() => onIndexChange(assetIndex)}
              >
                {asset.kind === "video" ? <video src={asset.previewUrl} poster={asset.posterUrl ?? undefined} muted playsInline preload="metadata" /> : <img src={asset.previewUrl} alt="" loading="lazy" />}
              </button>
            ))}
          </footer>
        ) : null}
      </section>
    </div>,
    document.body
  );
}

function StoryboardPresentationDialog({
  currentIndex,
  frames,
  imageRatio,
  projectName,
  speechVoiceId,
  onClose,
  onIndexChange,
  onOpenVoiceSettings
}: {
  currentIndex: number | null;
  frames: PresentationFrame[];
  imageRatio: ImageRatio;
  projectName: string;
  speechVoiceId: string;
  onClose: () => void;
  onIndexChange: (index: number | null) => void;
  onOpenVoiceSettings: () => void;
}) {
  const { t } = useI18n();
  const activeCardRef = useRef<HTMLButtonElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const stageVideoRef = useRef<HTMLVideoElement | null>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const { speechState, speechError, speak, stopSpeech, setSpeechPlaybackRate } = useElevenLabsSpeaker();
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(readStoredPresentationPlaybackRate);
  const autoPlayRunRef = useRef(0);

  function cyclePlaybackRate() {
    const currentIndex = presentationPlaybackRates.indexOf(playbackRate as (typeof presentationPlaybackRates)[number]);
    const nextRate = presentationPlaybackRates[(currentIndex + 1) % presentationPlaybackRates.length];
    setPlaybackRate(nextRate);
    try {
      window.localStorage.setItem(PRESENTATION_PLAYBACK_RATE_STORAGE_KEY, String(nextRate));
    } catch {
      // Local storage can be unavailable in hardened shells; keep the in-memory rate.
    }
  }

  function startStageVideoForAutoPlay(muted: boolean) {
    const video = stageVideoRef.current;
    if (!video) return;
    try {
      video.currentTime = 0;
    } catch {
      // Seeking can fail before metadata loads; playback still starts from the beginning.
    }
    video.muted = muted;
    video.playbackRate = playbackRate;
    void video.play().catch(() => {});
  }

  function pauseStageVideo() {
    const video = stageVideoRef.current;
    if (!video) return;
    try {
      video.pause();
      video.muted = false;
    } catch {
      // A detached video element can throw on pause; nothing to restore then.
    }
  }

  function waitForStageVideoToEnd(): Promise<void> {
    const video = stageVideoRef.current;
    if (!video) {
      return new Promise((resolveDelay) => {
        window.setTimeout(resolveDelay, PRESENTATION_AUTO_PLAY_FALLBACK_MS);
      });
    }
    if (video.ended) return Promise.resolve();
    return new Promise((resolvePlayback) => {
      const finish = () => resolvePlayback();
      video.addEventListener("ended", finish, { once: true });
      video.addEventListener("error", finish, { once: true });
    });
  }
  const isOpen = currentIndex !== null;
  const hasFrames = frames.length > 0;
  const safeIndex = hasFrames && currentIndex !== null ? Math.min(currentIndex, frames.length - 1) : 0;
  const currentFrame = hasFrames ? frames[safeIndex] : null;
  const hasMultipleFrames = frames.length > 1;
  const presentationFrameSize = fitPresentationFrame(stageSize, imageRatio);
  const presentationFrameStyle = presentationFrameSize
    ? ({
        width: `${presentationFrameSize.width}px`,
        height: `${presentationFrameSize.height}px`
      } satisfies React.CSSProperties)
    : undefined;

  function showPrevious() {
    if (!hasMultipleFrames) return;
    if (!isAutoPlaying) stopSpeech();
    onIndexChange((safeIndex - 1 + frames.length) % frames.length);
  }

  function showNext() {
    if (!hasMultipleFrames) return;
    if (!isAutoPlaying) stopSpeech();
    onIndexChange((safeIndex + 1) % frames.length);
  }

  function stopAutoPlay() {
    setIsAutoPlaying(false);
    stopSpeech();
    pauseStageVideo();
  }

  function toggleAutoPlay() {
    if (isAutoPlaying) {
      stopAutoPlay();
      return;
    }
    if (!hasFrames) return;
    stopSpeech();
    setIsAutoPlaying(true);
  }

  function toggleFrameSpeech() {
    if (speechState !== "idle" || isAutoPlaying) {
      stopAutoPlay();
      return;
    }
    if (!speechVoiceId) {
      onClose();
      onOpenVoiceSettings();
      return;
    }
    if (!currentFrame?.speechText) return;
    void speak(speechVoiceId, currentFrame.speechText);
  }

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.focus();
      return;
    }
    autoPlayRunRef.current += 1;
    setIsAutoPlaying(false);
    stopSpeech();
    pauseStageVideo();
  }, [isOpen]);

  useEffect(() => {
    setSpeechPlaybackRate(playbackRate);
    const video = stageVideoRef.current;
    if (video) video.playbackRate = playbackRate;
  }, [playbackRate, safeIndex, isOpen]);

  useEffect(() => {
    if (!isOpen || !isAutoPlaying || !currentFrame) return undefined;
    const runId = ++autoPlayRunRef.current;
    let cancelled = false;
    let fallbackTimer = 0;

    async function playCurrentFrame() {
      const frame = currentFrame;
      if (!frame) return;
      const nextFrame = frames[safeIndex + 1];
      if (nextFrame?.speechText && speechVoiceId && window.mkboard) {
        const nextSegment = splitTextIntoSpeechSegments(nextFrame.speechText)[0];
        if (nextSegment) {
          void window.mkboard.synthesizeElevenLabsSpeech({ text: nextSegment, voiceId: speechVoiceId }).catch(() => {});
        }
      }
      const frameHasVideo = frame.asset?.kind === "video";
      if (frame.speechText && speechVoiceId) {
        // Narration leads; a video frame plays muted underneath it.
        if (frameHasVideo) startStageVideoForAutoPlay(true);
        const result = await speak(speechVoiceId, frame.speechText);
        if (cancelled || autoPlayRunRef.current !== runId) return;
        if (!result.completed) {
          setIsAutoPlaying(false);
          return;
        }
      } else if (frameHasVideo) {
        startStageVideoForAutoPlay(false);
        await waitForStageVideoToEnd();
        if (cancelled || autoPlayRunRef.current !== runId) return;
      } else {
        await new Promise((resolveDelay) => {
          fallbackTimer = window.setTimeout(resolveDelay, PRESENTATION_AUTO_PLAY_FALLBACK_MS / playbackRate);
        });
        if (cancelled || autoPlayRunRef.current !== runId) return;
      }
      if (safeIndex + 1 < frames.length) {
        onIndexChange(safeIndex + 1);
      } else {
        setIsAutoPlaying(false);
      }
    }

    void playCurrentFrame();
    return () => {
      cancelled = true;
      if (fallbackTimer) window.clearTimeout(fallbackTimer);
    };
  }, [isAutoPlaying, isOpen, safeIndex, frames.length, speechVoiceId]);

  useEffect(() => {
    if (!isOpen || currentIndex === null || frames.length === 0 || currentIndex < frames.length) return;
    onIndexChange(frames.length - 1);
  }, [currentIndex, frames.length, isOpen, onIndexChange]);

  useEffect(() => {
    if (!isOpen) return;
    const card = activeCardRef.current;
    const strip = card?.parentElement;
    if (!card || !strip) return;
    const stripRect = strip.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    if (cardRect.left >= stripRect.left && cardRect.right <= stripRect.right) return;
    // Page the strip instead of nudging: the newly active card becomes the first visible one.
    const stripPaddingLeft = parseFloat(window.getComputedStyle(strip).paddingLeft) || 0;
    strip.scrollTo({
      left: strip.scrollLeft + (cardRect.left - stripRect.left) - stripPaddingLeft,
      behavior: "smooth"
    });
  }, [isOpen, safeIndex]);

  useEffect(() => {
    if (!isOpen || !stageRef.current) return undefined;

    const stageElement = stageRef.current;
    const updateStageSize = () => {
      setStageSize((currentSize) => {
        const nextSize = getPresentationStageContentSize(stageElement);
        if (currentSize.width === nextSize.width && currentSize.height === nextSize.height) return currentSize;
        return nextSize;
      });
    };

    updateStageSize();

    const resizeObserver = new ResizeObserver(updateStageSize);
    resizeObserver.observe(stageElement);
    window.addEventListener("resize", updateStageSize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateStageSize);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;

    function handlePresentationKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        showPrevious();
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        showNext();
      }
      if (event.key === " " || event.key === "Spacebar") {
        const target = event.target as HTMLElement | null;
        if (target && (target.tagName === "BUTTON" || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
        event.preventDefault();
        toggleAutoPlay();
      }
    }

    window.addEventListener("keydown", handlePresentationKeyDown);
    return () => window.removeEventListener("keydown", handlePresentationKeyDown);
  }, [frames.length, isAutoPlaying, isOpen, onClose, safeIndex]);

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="storyboard-presentation-layer"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="storyboard-presentation-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="storyboard-presentation-title"
        tabIndex={-1}
      >
        <header className="storyboard-presentation-header">
          <div className="storyboard-presentation-heading">
            <p>{projectName}</p>
            <div className="storyboard-presentation-title-row">
              <h2 id="storyboard-presentation-title">
                {currentFrame ? t("presentation.shotTitle", { shot: currentFrame.shot }) : t("presentation.title")}
              </h2>
              {currentFrame ? <span className="storyboard-presentation-tag">{currentFrame.tag === "A-roll" ? t("presentation.aRollTag") : t("presentation.bRollTag")}</span> : null}
            </div>
          </div>
          <div className="storyboard-presentation-meta">
            {hasFrames ? (
              <button
                className="storyboard-presentation-rate"
                type="button"
                aria-label={t("presentation.playbackRate")}
                title={t("presentation.playbackRate")}
                onClick={cyclePlaybackRate}
              >
                {formatPresentationPlaybackRate(playbackRate)}
              </button>
            ) : null}
            {hasFrames ? (
              <button
                className={cn("storyboard-presentation-autoplay", isAutoPlaying && "active")}
                type="button"
                aria-pressed={isAutoPlaying}
                onClick={toggleAutoPlay}
              >
                {isAutoPlaying ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
                {isAutoPlaying ? t("presentation.autoPlayStop") : t("presentation.autoPlay")}
              </button>
            ) : null}
            <span>{hasFrames ? t("storyboard.mediaPreviewCounter", { current: safeIndex + 1, total: frames.length }) : t("presentation.emptyCounter")}</span>
            <button className="storyboard-presentation-close" type="button" aria-label={t("presentation.close")} onClick={onClose}>
              <X aria-hidden="true" />
            </button>
          </div>
        </header>
        <div className="storyboard-presentation-stage" ref={stageRef}>
          {hasMultipleFrames ? (
            <button className="storyboard-presentation-nav previous" type="button" aria-label={t("presentation.previousShot")} onClick={showPrevious}>
              <ChevronLeft aria-hidden="true" />
            </button>
          ) : null}
          <div
            className={cn("storyboard-presentation-frame", currentFrame?.sampleSrc && !currentFrame.asset && "has-a-roll-sample")}
            data-ratio={imageRatio}
            style={presentationFrameStyle}
          >
            {currentFrame?.asset?.kind === "video" ? (
              <video
                key={currentFrame.id}
                ref={stageVideoRef}
                src={currentFrame.asset.previewUrl}
                poster={currentFrame.asset.posterUrl ?? undefined}
                controls
                playsInline
                preload="auto"
              />
            ) : currentFrame?.asset ? (
              <img src={currentFrame.asset.previewUrl} alt={currentFrame.asset.name} />
            ) : currentFrame?.sampleSrc ? (
              <img src={currentFrame.sampleSrc} alt={t("storyboard.aRollSample")} />
            ) : (
              <div className="storyboard-presentation-empty-frame">
                <Image aria-hidden="true" />
                <strong>{hasFrames ? t("presentation.noFrameTitle") : t("presentation.emptyTitle")}</strong>
                <span>{hasFrames ? t("presentation.noFrameDescription") : t("presentation.emptyDescription")}</span>
              </div>
            )}
          </div>
          {hasMultipleFrames ? (
            <button className="storyboard-presentation-nav next" type="button" aria-label={t("presentation.nextShot")} onClick={showNext}>
              <ChevronRight aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <div className="storyboard-presentation-description">
          <div className="storyboard-presentation-description-head">
            <strong>{currentFrame ? t("presentation.description") : t("presentation.emptyDescriptionTitle")}</strong>
            {currentFrame ? (
              <span className="storyboard-presentation-speech">
                {speechError ? <em className="storyboard-presentation-speech-error">{t(getSpeechErrorKey(speechError))}</em> : null}
                {!speechVoiceId ? <em className="storyboard-presentation-speech-hint">{t("speech.setupHint")}</em> : null}
                <button
                  className={cn("storyboard-presentation-speech-button", speechState !== "idle" && "busy")}
                  disabled={Boolean(speechVoiceId) && !currentFrame.speechText && !isAutoPlaying && speechState === "idle"}
                  type="button"
                  onClick={toggleFrameSpeech}
                >
                  {speechState === "loading" ? (
                    <LoaderCircle className="spinning" aria-hidden="true" />
                  ) : speechState === "playing" ? (
                    <Pause aria-hidden="true" />
                  ) : (
                    <AudioLines aria-hidden="true" />
                  )}
                  {speechState === "loading"
                    ? t("presentation.speechGenerating")
                    : speechState === "playing"
                      ? t("presentation.speechStop")
                      : speechVoiceId
                        ? t("presentation.speechRead")
                        : t("speech.setupAction")}
                </button>
              </span>
            ) : null}
          </div>
          <p>{currentFrame ? currentFrame.description || currentFrame.scene || t("presentation.noDescription") : t("presentation.emptyDescription")}</p>
        </div>
        {hasFrames ? (
          <footer className="storyboard-presentation-strip" aria-label={t("presentation.thumbnailStrip")}>
            {frames.map((frame, frameIndex) => (
              <button
                className={cn("storyboard-presentation-card", frameIndex === safeIndex && "active")}
                type="button"
                aria-label={t("presentation.openShot", { shot: frame.shot })}
                aria-current={frameIndex === safeIndex ? "true" : undefined}
                ref={frameIndex === safeIndex ? activeCardRef : undefined}
                key={frame.id}
                onClick={() => {
                  if (!isAutoPlaying) stopSpeech();
                  onIndexChange(frameIndex);
                }}
              >
                <span className={cn("storyboard-presentation-card-media", frame.sampleSrc && !frame.asset && "has-a-roll-sample")} data-ratio={imageRatio}>
                  {frame.asset?.kind === "video" ? (
                    <video src={frame.asset.previewUrl} poster={frame.asset.posterUrl ?? undefined} muted playsInline preload="metadata" />
                  ) : frame.asset ? (
                    <img src={frame.asset.previewUrl} alt="" loading="lazy" />
                  ) : frame.sampleSrc ? (
                    <img src={frame.sampleSrc} alt="" loading="lazy" />
                  ) : (
                    <span className="storyboard-presentation-card-placeholder">
                      <Image aria-hidden="true" />
                    </span>
                  )}
                </span>
                <span className="storyboard-presentation-card-meta">
                  <strong>{t("presentation.shotTitle", { shot: frame.shot })}</strong>
                  <em>{frame.tag === "A-roll" ? t("presentation.aRollTag") : t("presentation.bRollTag")}</em>
                </span>
              </button>
            ))}
          </footer>
        ) : null}
      </section>
    </div>,
    document.body
  );
}

function getStoryboardRowGenerationMethod(row: StoryboardRow, columns: StoryboardColumn[]): StoryboardGenerationMethod | "" {
  const methodColumn = columns.find(isStoryboardGenerationMethodColumn);
  return methodColumn ? normalizeStoryboardGenerationMethod(getStoryboardCellValue(methodColumn.id, row)) : "";
}

function normalizeStoryboardCategory(value: string): StoryboardCategory | "" {
  if (/(^|[^a-z])a\s*-?\s*roll([^a-z]|$)/i.test(value)) return "A-ROLL";
  if (/(^|[^a-z])b\s*-?\s*roll([^a-z]|$)/i.test(value)) return "B-ROLL";
  return "";
}

function getGenerationMethodClassName(method: StoryboardGenerationMethod) {
  if (method === "ChatGPT Image2") return "chatgpt";
  if (method === "Seedance 2.0") return "seedance";
  if (method === "Hyperframes") return "hyperframes";
  return "custom";
}

function getGenerationMethodDisplayLabel(method: StoryboardGenerationMethod, t: Translator) {
  return method === "自定义" ? t("storyboard.generationMethodCustom") : method;
}

function getGenerationMethodIcon(method: StoryboardGenerationMethod) {
  if (method === "ChatGPT Image2") return <OpenAIIcon size={16} />;
  if (method === "Seedance 2.0") return <ByteDanceIcon size={16} />;
  if (method === "Hyperframes") return <img className="generation-method-brand-icon" src={HYPERFRAMES_LOGO_SRC} alt="" aria-hidden="true" />;
  return <UploadCloud aria-hidden="true" />;
}

function getStoryboardAiConfirmTitleKey(action: StoryboardAiAction): I18nKey {
  if (action === "parse") return "storyboard.aiParseConfirmTitle";
  if (action === "images") return "storyboard.aiImagesConfirmTitle";
  return "storyboard.aiVideosConfirmTitle";
}

function getStoryboardAiConfirmDescriptionKey(action: StoryboardAiAction): I18nKey {
  if (action === "parse") return "storyboard.aiParseConfirmDescription";
  if (action === "images") return "storyboard.aiImagesConfirmDescription";
  return "storyboard.aiVideosConfirmDescription";
}

function getStoryboardAiConfirmActionKey(action: StoryboardAiAction): I18nKey {
  if (action === "parse") return "storyboard.aiParseConfirmAction";
  if (action === "images") return "storyboard.aiImagesConfirmAction";
  return "storyboard.aiVideosConfirmAction";
}

function getStoryboardAiConfirmActionWithCountKey(kind: "image" | "video"): I18nKey {
  return kind === "image" ? "storyboard.aiImagesConfirmActionWithCount" : "storyboard.aiVideosConfirmActionWithCount";
}

function getStoryboardAiSimpleConfirmTitleKey(kind: "image" | "video"): I18nKey {
  return kind === "image" ? "storyboard.aiImagesSimpleConfirmTitle" : "storyboard.aiVideosSimpleConfirmTitle";
}

function getStoryboardAiSimpleConfirmDescriptionKey(kind: "image" | "video"): I18nKey {
  return kind === "image" ? "storyboard.aiImagesSimpleConfirmDescription" : "storyboard.aiVideosSimpleConfirmDescription";
}

function getStoryboardAiOptionCountKey(kind: "image" | "video"): I18nKey {
  return kind === "image" ? "storyboard.aiImagesOptionCount" : "storyboard.aiVideosOptionCount";
}

function getStoryboardAiMissingOptionDescriptionKey(kind: "image" | "video"): I18nKey {
  return kind === "image" ? "storyboard.aiImagesMissingOptionDescription" : "storyboard.aiVideosMissingOptionDescription";
}

function getStoryboardAiAllOptionDescriptionKey(kind: "image" | "video"): I18nKey {
  return kind === "image" ? "storyboard.aiImagesAllOptionDescription" : "storyboard.aiVideosAllOptionDescription";
}

function getStoryboardAiSelectionSummaryKey(kind: "image" | "video", mode: StoryboardMediaGenerationMode, selectedIsZero: boolean, existingIsZero: boolean): I18nKey {
  if (kind === "image") {
    if (mode === "missing") return selectedIsZero ? "storyboard.aiImagesMissingNoneSummary" : "storyboard.aiImagesMissingSelectionSummary";
    return existingIsZero ? "storyboard.aiImagesAllNoExistingSelectionSummary" : "storyboard.aiImagesAllSelectionSummary";
  }
  if (mode === "missing") return selectedIsZero ? "storyboard.aiVideosMissingNoneSummary" : "storyboard.aiVideosMissingSelectionSummary";
  return existingIsZero ? "storyboard.aiVideosAllNoExistingSelectionSummary" : "storyboard.aiVideosAllSelectionSummary";
}

function getStoryboardBusyLabelKey(action: StoryboardAiAction): I18nKey {
  if (action === "parse") return "storyboard.busyParse";
  if (action === "images") return "storyboard.busyImages";
  return "storyboard.busyVideos";
}

function getStoryboardLoadingStatusKey(action: StoryboardAiAction): I18nKey {
  if (action === "parse") return "storyboard.loadingStatusParse";
  if (action === "images") return "storyboard.loadingStatusImages";
  return "storyboard.loadingStatusVideos";
}

function getStoryboardAgentWorkflowUserKey(action: StoryboardAiAction): I18nKey {
  if (action === "parse") return "agent.workflow.parseUser";
  if (action === "images") return "agent.workflow.imagesUser";
  return "agent.workflow.videosUser";
}

function getStoryboardAgentWorkflowStartKey(action: StoryboardAiAction): I18nKey {
  if (action === "parse") return "agent.workflow.parseStart";
  if (action === "images") return "agent.workflow.imagesStart";
  return "agent.workflow.videosStart";
}

function getStoryboardAgentWorkflowRunningKey(action: StoryboardAiAction): I18nKey {
  if (action === "parse") return "agent.workflow.parseRunning";
  if (action === "images") return "agent.workflow.imagesRunning";
  return "agent.workflow.videosRunning";
}

function getRunningStoryboardImageRowIds(tasks: StoryboardImageTaskSummary[] | undefined, fallbackRowIds: string[] = []) {
  if (!Array.isArray(tasks)) return new Set(fallbackRowIds);
  return new Set(
    tasks
      .filter((task) => task.rowId && (task.status === "queued" || task.status === "running"))
      .map((task) => task.rowId as string)
  );
}

function mergeGenerationRowIdSets(...rowIdSets: Set<string>[]): Set<string> {
  const mergedRowIds = new Set<string>();
  rowIdSets.forEach((rowIds) => rowIds.forEach((rowId) => mergedRowIds.add(rowId)));
  return mergedRowIds;
}

function collectAgentMediaGenerationPlaceholderRowIds(
  runs: Map<string, AgentMediaGenerationPlaceholderRun>,
  projectId: string,
  kind: "image" | "video"
): Set<string> {
  const rowIds = new Set<string>();
  runs.forEach((run) => {
    if (run.projectId !== projectId) return;
    const runRowIds = kind === "image" ? run.imageRowIds : run.videoRowIds;
    runRowIds.forEach((rowId) => rowIds.add(rowId));
  });
  return rowIds;
}

function addGenerationRowIds(currentRowIds: Set<string>, rowIds: string[]): Set<string> {
  const nextRowIds = new Set(currentRowIds);
  rowIds.forEach((rowId) => nextRowIds.add(rowId));
  return nextRowIds;
}

function removeGenerationRowIds(currentRowIds: Set<string>, rowIds: string[]): Set<string> {
  const nextRowIds = new Set(currentRowIds);
  rowIds.forEach((rowId) => nextRowIds.delete(rowId));
  return nextRowIds;
}

function replaceGenerationRowIds(currentRowIds: Set<string>, scopedRowIds: string[], activeRowIds: Set<string>): Set<string> {
  const nextRowIds = removeGenerationRowIds(currentRowIds, scopedRowIds);
  activeRowIds.forEach((rowId) => nextRowIds.add(rowId));
  return nextRowIds;
}

function mergeGenerationTaskItems(currentTasks: StoryboardGenerationTaskItem[], incomingTasks: StoryboardGenerationTaskItem[]): StoryboardGenerationTaskItem[] {
  const nextTasks = [...currentTasks];
  incomingTasks.forEach((incomingTask) => {
    const existingIndex = nextTasks.findIndex((task) => isMergeableGenerationTask(task, incomingTask));
    if (existingIndex >= 0) {
      nextTasks[existingIndex] = { ...nextTasks[existingIndex], ...incomingTask };
      return;
    }
    nextTasks.push(incomingTask);
  });
  return nextTasks;
}

function isMergeableGenerationTask(existingTask: StoryboardGenerationTaskItem, incomingTask: StoryboardGenerationTaskItem): boolean {
  if (existingTask.kind !== incomingTask.kind) return false;
  if (existingTask.id === incomingTask.id) return true;
  if (existingTask.batchId && incomingTask.batchId && existingTask.batchId === incomingTask.batchId && existingTask.rowId === incomingTask.rowId) return true;
  const existingIsClientPlaceholder =
    isActiveGenerationTaskStatus(existingTask.status) &&
    existingTask.rowId === incomingTask.rowId &&
    (existingTask.id.startsWith(`${existingTask.kind}-pending-`) || existingTask.id.startsWith(`${existingTask.kind}-queued-`));
  return existingIsClientPlaceholder && !incomingTask.id.startsWith(`${incomingTask.kind}-pending-`) && !incomingTask.id.startsWith(`${incomingTask.kind}-queued-`);
}

function mapPendingImageGenerationTargets(targets: StoryboardCloudGenerationTarget[]): StoryboardGenerationTaskItem[] {
  const createdAt = new Date().toISOString();
  return targets.map((target, index) => ({
    id: `image-pending-${target.rowId}-${index}`,
    kind: "image",
    batchId: `client-image-${createdAt}`,
    rowId: target.rowId,
    method: "ChatGPT Image2",
    status: "queued",
    createdAt,
    updatedAt: createdAt
  }));
}

function mapImageGenerationTasks(tasks: StoryboardImageTaskSummary[]): StoryboardGenerationTaskItem[] {
  return tasks
    .filter((task) => task.rowId)
    .map((task, index) => ({
      id: task.taskId || `image-${task.rowId}-${index}`,
      kind: "image" as const,
      batchId: task.batchId,
      rowId: task.rowId as string,
      method: "ChatGPT Image2",
      status: task.localDeliveryFailed || task.status === "delivery_failed" ? ("failed" as const) : normalizeGenerationTaskStatus(task.status),
      providerTaskId: task.providerTaskId,
      assetId: task.status === "succeeded" && !task.localDeliveryFailed ? task.taskId : undefined,
      message: task.errorMessage ?? null,
      canRetryDelivery: task.canRetryDelivery,
      localDeliveryFailed: task.localDeliveryFailed,
      deliveryAttempts: task.deliveryAttempts,
      localDeliveryAttemptCount: task.localDeliveryAttemptCount,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt
    }));
}

function mapQueuedVideoGenerationTargets(targets: StoryboardVideoGenerationTarget[], t: Translator): StoryboardGenerationTaskItem[] {
  const createdAt = new Date().toISOString();
  return targets.map((target, index) => ({
    id: `video-queued-${target.rowId}-${index}`,
    kind: "video",
    batchId: `client-video-${createdAt}`,
    rowId: target.rowId,
    method: target.method,
    status: "queued",
    createdAt,
    updatedAt: createdAt,
    stage: "queued",
    stageLabel: target.method === "Hyperframes" ? t("storyboard.hyperframesWaitingCli") : undefined
  }));
}

function upsertVideoGenerationEventTask(tasks: StoryboardGenerationTaskItem[], event: StoryboardVideoGenerationEvent): StoryboardGenerationTaskItem[] {
  const existingIndex = tasks.findIndex((task) => {
    if (task.kind !== "video") return false;
    if (event.taskId && task.id === event.taskId) return true;
    if (event.taskId && task.rowId === event.rowId && task.id.startsWith("video-queued-")) return true;
    return !event.taskId && task.rowId === event.rowId;
  });
  const existingTask = existingIndex >= 0 ? tasks[existingIndex] : null;
  const eventFinished = event.status === "succeeded" || event.status === "failed" || event.status === "cancelled";
  const nextTask: StoryboardGenerationTaskItem = {
    id: event.taskId || existingTask?.id || `video-${event.rowId}`,
    kind: "video",
    batchId: event.batchId ?? existingTask?.batchId,
    rowId: event.rowId,
    method: event.method,
    status: event.status,
    provider: event.provider ?? existingTask?.provider,
    providerTaskId: event.providerTaskId ?? existingTask?.providerTaskId,
    assetId: event.assetId,
    fileName: event.fileName,
    message: event.errorMessage ?? null,
    canRetryDelivery: event.canRetryDelivery ?? existingTask?.canRetryDelivery,
    localDeliveryFailed: event.localDeliveryFailed ?? existingTask?.localDeliveryFailed,
    deliveryAttempts: event.deliveryAttempts ?? existingTask?.deliveryAttempts,
    localDeliveryAttemptCount: event.localDeliveryAttemptCount ?? existingTask?.localDeliveryAttemptCount,
    createdAt: event.createdAt ?? existingTask?.createdAt,
    updatedAt: event.updatedAt ?? existingTask?.updatedAt,
    startedAt: event.startedAt ?? existingTask?.startedAt ?? (event.status === "running" ? event.updatedAt ?? new Date().toISOString() : undefined),
    finishedAt: event.finishedAt ?? existingTask?.finishedAt ?? (eventFinished ? event.updatedAt ?? new Date().toISOString() : undefined),
    stage: event.stage ?? existingTask?.stage,
    stageLabel: event.stageLabel ?? existingTask?.stageLabel,
    stageDetail: event.stageDetail ?? existingTask?.stageDetail,
    cliLog: mergeGenerationTaskLog(existingTask?.cliLog, event.cliLog),
    studioUrl: event.studioUrl ?? existingTask?.studioUrl,
    workDir: event.workDir ?? existingTask?.workDir
  };
  if (existingIndex < 0) return [...tasks, nextTask];
  return tasks.map((task, index) => (index === existingIndex ? { ...task, ...nextTask } : task));
}

function mapActiveVideoGenerationTasks(
  tasks: Array<
    Pick<StoryboardActiveVideoGenerationTask, "rowId" | "status"> &
      Partial<
        Pick<
          StoryboardActiveVideoGenerationTask,
          "taskId" | "batchId" | "method" | "provider" | "providerTaskId" | "assetId" | "fileName" | "errorMessage" | "canRetryDelivery" | "localDeliveryFailed" | "deliveryAttempts" | "localDeliveryAttemptCount" | "createdAt" | "startedAt" | "finishedAt" | "updatedAt" | "stage" | "stageLabel" | "stageDetail" | "cliLog" | "studioUrl" | "workDir"
        >
      >
  >
): StoryboardGenerationTaskItem[] {
  return tasks.map((task) => ({
    id: task.taskId || `video-${task.rowId}`,
    kind: "video",
    batchId: task.batchId,
    rowId: task.rowId,
    method: task.method,
    status: normalizeGenerationTaskStatus(task.status),
    provider: task.provider,
    providerTaskId: task.providerTaskId,
    assetId: task.assetId,
    fileName: task.fileName,
    message: task.errorMessage ?? null,
    canRetryDelivery: task.canRetryDelivery,
    localDeliveryFailed: task.localDeliveryFailed,
    deliveryAttempts: task.deliveryAttempts,
    localDeliveryAttemptCount: task.localDeliveryAttemptCount,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
    stage: task.stage,
    stageLabel: task.stageLabel,
    stageDetail: task.stageDetail,
    cliLog: task.cliLog,
    studioUrl: task.studioUrl,
    workDir: task.workDir
  }));
}

function mapVideoGenerationTaskResults(tasks: StoryboardVideoTaskSummary[]): StoryboardGenerationTaskItem[] {
  return tasks.map((task) => ({
    id: task.taskId || `video-${task.rowId}`,
    kind: "video",
    batchId: task.batchId,
    rowId: task.rowId,
    method: task.method,
    status: normalizeGenerationTaskStatus(task.status),
    provider: task.provider,
    providerTaskId: task.providerTaskId,
    assetId: task.assetId,
    fileName: task.fileName,
    message: task.errorMessage ?? null,
    canRetryDelivery: task.canRetryDelivery,
    localDeliveryFailed: task.localDeliveryFailed,
    deliveryAttempts: task.deliveryAttempts,
    localDeliveryAttemptCount: task.localDeliveryAttemptCount,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
    stage: task.stage,
    stageLabel: task.stageLabel,
    stageDetail: task.stageDetail,
    cliLog: task.cliLog,
    studioUrl: task.studioUrl,
    workDir: task.workDir
  }));
}

function sortGenerationTasksByTimeline(tasks: StoryboardGenerationTaskItem[], rowOrderById: Map<string, number>): StoryboardGenerationTaskItem[] {
  const decoratedTasks = tasks.map((task, index) => ({
    task,
    index,
    batchKey: getGenerationTaskBatchKey(task, index),
    timestampMs: getGenerationTaskTimestampMs(task)
  }));
  const batchOrder = new Map<string, { timestampMs: number; firstIndex: number }>();
  for (const item of decoratedTasks) {
    const existing = batchOrder.get(item.batchKey);
    if (!existing) {
      batchOrder.set(item.batchKey, { timestampMs: item.timestampMs, firstIndex: item.index });
      continue;
    }
    if (item.timestampMs > existing.timestampMs) existing.timestampMs = item.timestampMs;
    if (item.index < existing.firstIndex) existing.firstIndex = item.index;
  }

  return decoratedTasks
    .sort((a, b) => {
      if (a.batchKey !== b.batchKey) {
        const batchA = batchOrder.get(a.batchKey);
        const batchB = batchOrder.get(b.batchKey);
        const batchTimeA = batchA?.timestampMs ?? 0;
        const batchTimeB = batchB?.timestampMs ?? 0;
        if (batchTimeA !== batchTimeB) return batchTimeB - batchTimeA;
        return (batchA?.firstIndex ?? a.index) - (batchB?.firstIndex ?? b.index);
      }

      const rowOrderA = rowOrderById.get(a.task.rowId);
      const rowOrderB = rowOrderById.get(b.task.rowId);
      if (rowOrderA !== undefined && rowOrderB !== undefined && rowOrderA !== rowOrderB) return rowOrderA - rowOrderB;
      if (rowOrderA !== undefined && rowOrderB === undefined) return -1;
      if (rowOrderA === undefined && rowOrderB !== undefined) return 1;
      return a.index - b.index;
    })
    .map((item) => item.task);
}

function getGenerationTaskBatchKey(task: StoryboardGenerationTaskItem, index: number): string {
  if (task.batchId) return `${task.kind}:batch:${task.batchId}`;
  return `${task.kind}:task:${task.id || index}`;
}

function getGenerationTaskTimestampMs(task: StoryboardGenerationTaskItem): number {
  const timestamp = task.createdAt ?? task.startedAt ?? task.updatedAt ?? task.finishedAt;
  const parsed = timestamp ? Date.parse(timestamp) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildGenerationTaskDisplayItems(
  tasks: StoryboardGenerationTaskItem[],
  rowById: Map<string, StoryboardRow>,
  locale: InterfaceLanguage
): StoryboardGenerationTaskDisplayItem[] {
  const duplicateCountByRowId = new Map<string, number>();
  for (const task of tasks) {
    duplicateCountByRowId.set(task.rowId, (duplicateCountByRowId.get(task.rowId) ?? 0) + 1);
  }

  const duplicateIndexByRowId = new Map<string, number>();
  return tasks.map((task) => {
    const baseLabel = rowById.get(task.rowId)?.shot ?? task.rowId;
    const duplicateCount = duplicateCountByRowId.get(task.rowId) ?? 0;
    if (duplicateCount <= 1) return { task, shotLabel: baseLabel };
    const duplicateIndex = (duplicateIndexByRowId.get(task.rowId) ?? 0) + 1;
    duplicateIndexByRowId.set(task.rowId, duplicateIndex);
    return {
      task,
      shotLabel: `${baseLabel}${formatGenerationTaskDuplicateSuffix(duplicateIndex, locale)}`
    };
  });
}

function formatGenerationTaskDuplicateSuffix(index: number, locale: InterfaceLanguage): string {
  return locale === "en" ? ` (${index})` : `（${index}）`;
}

function getInitialGenerationContentFilter(
  action: StoryboardAiAction | null,
  imageTasks: StoryboardGenerationTaskItem[],
  videoTasks: StoryboardGenerationTaskItem[]
): StoryboardGenerationContentFilter {
  if (imageTasks.length > 0 && videoTasks.length > 0) return "all";
  if (action === "images") return "image";
  if (action === "videos") return "video";
  if (imageTasks.length > 0) return "image";
  if (videoTasks.length > 0) return "video";
  return "all";
}

function getInitialGenerationStatusFilter(
  contentFilter: StoryboardGenerationContentFilter,
  imageTasks: StoryboardGenerationTaskItem[],
  videoTasks: StoryboardGenerationTaskItem[]
): StoryboardGenerationStatusFilter {
  const tasks = contentFilter === "image" ? imageTasks : contentFilter === "video" ? videoTasks : [...imageTasks, ...videoTasks];
  return tasks.some((task) => task.status === "queued" || task.status === "running") ? "active" : "all";
}

function getGenerationTaskPreviewAsset(
  task: StoryboardGenerationTaskItem,
  rowById: Map<string, StoryboardRow>,
  assetById: Map<string, ProjectAsset>,
  assets: ProjectAsset[]
): ProjectAsset | null {
  if (task.status !== "succeeded") return null;
  if (task.assetId) {
    const directAsset = assetById.get(task.assetId);
    if (directAsset?.kind === task.kind) return directAsset;
  }
  const row = rowById.get(task.rowId);
  if (!row) return null;
  return getStoryboardRowPreviewAssets(row, assets).find((asset) => asset.kind === task.kind) ?? null;
}

function mergeGenerationTaskLog(existing: string | undefined, next: string | undefined): string | undefined {
  if (!next) return existing;
  const merged = [existing, next].filter(Boolean).join("\n");
  return merged.length > 2400 ? merged.slice(-2400) : merged;
}

function markGenerationTasksFailed(tasks: StoryboardGenerationTaskItem[], message: string): StoryboardGenerationTaskItem[] {
  const finishedAt = new Date().toISOString();
  return tasks.map((task) =>
    task.status === "succeeded"
      ? task
      : {
          ...task,
          status: "failed",
          message,
          finishedAt: task.finishedAt ?? finishedAt
        }
  );
}

function markGenerationTasksFailedForRows(tasks: StoryboardGenerationTaskItem[], rowIds: string[], kind: "image" | "video", message: string): StoryboardGenerationTaskItem[] {
  const rowIdSet = new Set(rowIds);
  const finishedAt = new Date().toISOString();
  return tasks.map((task) =>
    task.kind === kind && rowIdSet.has(task.rowId) && isActiveGenerationTaskStatus(task.status)
      ? {
          ...task,
          status: "failed",
          message,
          finishedAt: task.finishedAt ?? finishedAt
        }
      : task
  );
}

function markGenerationTasksCancelled(tasks: StoryboardGenerationTaskItem[], message: string): StoryboardGenerationTaskItem[] {
  const finishedAt = new Date().toISOString();
  return tasks.map((task) =>
    task.status === "queued" || task.status === "running"
      ? {
          ...task,
          status: "cancelled",
          message,
          finishedAt: task.finishedAt ?? finishedAt
        }
      : task
  );
}

function normalizeGenerationTaskStatus(status: string): StoryboardGenerationTaskStatus {
  if (status === "queued" || status === "running" || status === "succeeded" || status === "failed" || status === "cancelled") return status;
  if (status === "delivery_failed") return "failed";
  if (status === "canceled") return "cancelled";
  return "running";
}

function isActiveGenerationTaskStatus(status: StoryboardGenerationTaskStatus): boolean {
  return status === "queued" || status === "running";
}

function formatGenerationTaskElapsedClock(task: Pick<StoryboardGenerationTaskItem, "startedAt" | "finishedAt" | "status"> | null | undefined, now: number): string {
  if (!task) return "";
  const startedAt = task?.startedAt ? Date.parse(task.startedAt) : Number.NaN;
  if (!Number.isFinite(startedAt)) return "";
  const finishedAt = task?.finishedAt ? Date.parse(task.finishedAt) : Number.NaN;
  const endAt = Number.isFinite(finishedAt) ? finishedAt : isActiveGenerationTaskStatus(task.status) ? now : Number.NaN;
  if (!Number.isFinite(endAt)) return "";
  return formatElapsedClock(endAt - startedAt);
}

function formatElapsedClock(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getGenerationStatusHeaderSummary(contentFilter: StoryboardGenerationContentFilter, counts: { all: number; image: number; video: number }, t: Translator): string {
  if (contentFilter === "image") return t("storyboard.generationStatusHeaderImages", { count: counts.image });
  if (contentFilter === "video") return t("storyboard.generationStatusHeaderVideos", { count: counts.video });
  return t("storyboard.generationStatusHeaderAll", { count: counts.all });
}

function getGenerationStatusEmptyKey(statusFilter: StoryboardGenerationStatusFilter): I18nKey {
  if (statusFilter === "active") return "storyboard.generationStatusEmptyActive";
  if (statusFilter === "succeeded") return "storyboard.generationStatusEmptySucceeded";
  if (statusFilter === "failed") return "storyboard.generationStatusEmptyFailed";
  return "storyboard.generationStatusEmptyAll";
}

function getGenerationTaskStatusKey(status: StoryboardGenerationTaskStatus): I18nKey {
  if (status === "queued") return "storyboard.generationStatusQueued";
  if (status === "running") return "storyboard.generationStatusRunning";
  if (status === "succeeded") return "storyboard.generationStatusSucceededLabel";
  if (status === "cancelled") return "storyboard.generationStatusCancelled";
  return "storyboard.generationStatusFailedLabel";
}

function getGenerationTaskProgressLabel(task: StoryboardGenerationTaskItem, t: Translator): string {
  if (task.kind === "video" && task.method === "Hyperframes") return t(getHyperframesGenerationProgressKey(task));
  return task.stageLabel ?? "";
}

function getHyperframesGenerationProgressKey(task: StoryboardGenerationTaskItem): I18nKey {
  if (task.status === "queued") return "storyboard.generationStatusHyperframesQueued";
  if (task.status === "failed") return "storyboard.generationStatusHyperframesFailed";
  if (task.status === "cancelled") return "storyboard.generationStatusHyperframesCancelled";
  if (task.status === "succeeded" || task.stage === "done") return "storyboard.generationStatusHyperframesDone";
  if (task.stage === "studio") return "storyboard.generationStatusHyperframesPreview";
  if (task.stage === "runtime" || task.stage === "cli" || task.stage === "lint" || task.stage === "validate" || task.stage === "inspect") return "storyboard.generationStatusHyperframesChecking";
  if (task.stage === "repair") return "storyboard.generationStatusHyperframesRepair";
  if (task.stage === "render") return "storyboard.generationStatusHyperframesRender";
  if (task.stage === "import") return "storyboard.generationStatusHyperframesImport";
  return "storyboard.generationStatusHyperframesProject";
}

function getGenerationTaskStatusIcon(status: StoryboardGenerationTaskStatus) {
  if (status === "succeeded") return <CircleCheck />;
  if (status === "failed" || status === "cancelled") return <AlertTriangle />;
  if (status === "queued") return <Clock />;
  return <LoaderCircle className="spinning" />;
}

const storyboardVideoMethodFilterOptions: Array<{
  value: StoryboardVideoGenerationMethodFilter;
  titleKey: I18nKey;
  descriptionKey: I18nKey;
}> = [
  {
    value: "hyperframes",
    titleKey: "storyboard.aiVideoMethodHyperframesTitle",
    descriptionKey: "storyboard.aiVideoMethodHyperframesDescription"
  },
  {
    value: "seedance",
    titleKey: "storyboard.aiVideoMethodSeedanceTitle",
    descriptionKey: "storyboard.aiVideoMethodSeedanceDescription"
  },
  {
    value: "all",
    titleKey: "storyboard.aiVideoMethodAllTitle",
    descriptionKey: "storyboard.aiVideoMethodAllDescription"
  }
];

function getStoryboardVideoMethodOptionCounts(
  targets: StoryboardVideoGenerationTarget[],
  rows: StoryboardRow[],
  assets: ProjectAsset[],
  mode: StoryboardMediaGenerationMode
): Record<StoryboardVideoGenerationMethodFilter, number> {
  const scopedTargets = filterStoryboardGenerationTargetsByMode(targets, rows, assets, "video", mode);
  return {
    hyperframes: filterStoryboardVideoTargetsByMethod(scopedTargets, "hyperframes").length,
    seedance: filterStoryboardVideoTargetsByMethod(scopedTargets, "seedance").length,
    all: scopedTargets.length
  };
}

function isAgentRegenerateMediaOperation(operation: AgentOperation): operation is AgentRegenerateMediaOperation {
  return operation.type === "regenerate_media";
}

function isDreaminaAgentRegenerateMediaOperation(operation: AgentOperation): operation is DreaminaAgentRegenerateMediaOperation {
  return operation.type === "regenerate_media" && operation.provider === "dreamina_cli";
}

function isAgentParseStoryboardOperation(operation: AgentOperation): operation is AgentParseStoryboardOperation {
  return operation.type === "parse_storyboard";
}

function partitionAgentOperationsForConfirmation(operations: AgentOperation[], rows: StoryboardRow[]) {
  const confirmationOperations: AgentOperation[] = [];
  const immediateOperations: AgentOperation[] = [];
  operations.forEach((operation) => {
    const isValidVideoGeneration =
      operation.type === "regenerate_media" &&
      operation.kind === "video" &&
      collectAgentMediaRegenerationRequests([operation], rows).videoRowIds.length > 0;
    (isValidVideoGeneration ? confirmationOperations : immediateOperations).push(operation);
  });
  return { immediateOperations, confirmationOperations };
}

function collectAgentMediaRegenerationRequests(operations: AgentRegenerateMediaOperation[], rows: StoryboardRow[]) {
  const imageRowIds: string[] = [];
  const videoRowIds: string[] = [];
  const seedanceAspectRatioByRowId = new Map<string, SeedanceAspectRatio>();
  operations.forEach((operation) => {
    operation.rowRefs.forEach((rowRef) => {
      const rowId = resolveAgentRowRefInRows(rowRef, rows);
      if (!rowId) return;
      const target = operation.kind === "image" ? imageRowIds : videoRowIds;
      if (!target.includes(rowId)) target.push(rowId);
      if (operation.kind === "video" && isSeedanceAspectRatio(operation.aspectRatio)) {
        seedanceAspectRatioByRowId.set(rowId, operation.aspectRatio);
      }
    });
  });
  return { imageRowIds, videoRowIds, seedanceAspectRatioByRowId };
}

function formatAgentOperationConfirmationItem(operation: AgentOperation, rows: StoryboardRow[], locale: InterfaceLanguage, t: Translator) {
  if (operation.type === "parse_storyboard") return rows.length > 0 ? t("agent.operation.parseOverwrite") : t("agent.operation.parseInitial");
  if (operation.type === "insert_shots") return t("agent.operation.insertShots", { count: operation.count });
  if (operation.type === "delete_shots") return t("agent.operation.deleteShots", { refs: formatAgentRowRefs(operation.rowRefs, rows, locale, t) });
  if (operation.type === "duplicate_shots") return t("agent.operation.duplicateShots", { refs: formatAgentRowRefs(operation.rowRefs, rows, locale, t) });
  if (operation.type === "reorder_shot") {
    return t("agent.operation.reorderShot", {
      row: formatAgentRowRef(operation.rowRef, rows, t),
      target: formatAgentRowRef(operation.targetRowRef, rows, t),
      placement: t(operation.placement === "after" ? "agent.operation.reorderAfter" : "agent.operation.reorderBefore")
    });
  }
  if (operation.type === "regenerate_media") {
    if (operation.provider === "dreamina_cli") {
      return t("agent.operation.regenerateDreaminaMedia", {
        refs: formatAgentRowRefs(operation.rowRefs, rows, locale, t),
        kind: t(operation.kind === "image" ? "agent.operation.kind.image" : "agent.operation.kind.video")
      });
    }
    const translationKey = operation.kind === "video" && isSeedanceAspectRatio(operation.aspectRatio)
      ? "agent.operation.regenerateMediaWithAspectRatio"
      : "agent.operation.regenerateMedia";
    return t(translationKey, {
      refs: formatAgentRowRefs(operation.rowRefs, rows, locale, t),
      kind: t(operation.kind === "image" ? "agent.operation.kind.image" : "agent.operation.kind.video"),
      aspectRatio: operation.aspectRatio ?? ""
    });
  }
  if (operation.type === "update_script") return t("agent.operation.updateScript");
  if (operation.type === "sync_script_a_roll_tags") return t("agent.operation.syncARollTags");
  if (operation.type === "update_shot_cells") return t("agent.operation.updateShotCells", { row: formatAgentRowRef(operation.rowRef, rows, t) });
  if (operation.type === "update_shot_media") return t("agent.operation.updateShotMedia", { row: formatAgentRowRef(operation.rowRef, rows, t) });
  return t("agent.operation.unknown");
}

function formatAgentRowRefs(rowRefs: AgentRowRef[], rows: StoryboardRow[], locale: InterfaceLanguage, t: Translator) {
  const separator = locale === "en" ? ", " : "、";
  return rowRefs.map((rowRef) => formatAgentRowRef(rowRef, rows, t)).join(separator) || t("agent.operation.refsFallback");
}

function formatAgentRowRef(rowRef: AgentRowRef, rows: StoryboardRow[], t: Translator) {
  if (rowRef.kind === "index") return t("agent.operation.rowIndex", { index: rowRef.value });
  const index = rows.findIndex((row) => row.id === rowRef.value);
  return index >= 0 ? t("agent.operation.rowIndex", { index: index + 1 }) : t("agent.operation.rowId", { id: rowRef.value });
}

function resolveAgentRowRefInRows(rowRef: AgentRowRef, rows: StoryboardRow[]) {
  if (rowRef.kind === "id") return rows.find((row) => row.id === rowRef.value)?.id ?? null;
  return rows[rowRef.value - 1]?.id ?? null;
}

function getStoryboardMediaGenerationCounts(
  action: "images" | "videos",
  rows: StoryboardRow[],
  assets: ProjectAsset[],
  columns: StoryboardColumn[],
  imageRatio: ImageRatio,
  videoMethodFilter: StoryboardVideoGenerationMethodFilter = "all"
) {
  if (action === "images") {
    const allTargets = buildStoryboardImageGenerationCandidates(rows, columns, imageRatio);
    return {
      missing: filterStoryboardGenerationTargetsByMode(allTargets, rows, assets, "image", "missing").length,
      all: allTargets.length
    };
  }

  const allTargets = filterStoryboardVideoTargetsByMethod(buildStoryboardVideoGenerationCandidates(rows, columns, imageRatio), videoMethodFilter);
  return {
    missing: filterStoryboardGenerationTargetsByMode(allTargets, rows, assets, "video", "missing").length,
    all: allTargets.length
  };
}

function getStoryboardMediaGenerationTargetRowIds(
  action: "images" | "videos",
  rows: StoryboardRow[],
  columns: StoryboardColumn[],
  imageRatio: ImageRatio,
  selectedRowIds: Set<string>
) {
  if (selectedRowIds.size === 0) return [];
  const selectedRows = rows.filter((row) => selectedRowIds.has(row.id));
  const targets =
    action === "images"
      ? buildStoryboardImageGenerationCandidates(selectedRows, columns, imageRatio)
      : buildStoryboardVideoGenerationCandidates(selectedRows, columns, imageRatio);
  return targets.map((target) => target.rowId);
}

function buildFallbackImagePrompt(row: StoryboardRow, method: StoryboardImageGenerationMethod, imageRatio: ImageRatio): string {
  const source = buildFallbackPromptSource(row);
  const useChinese = fallbackPromptUsesChinese(row);
  const base = useChinese
    ? `为这个镜头生成一张高质量分镜图片：${source || "根据当前镜头内容设计主体、场景和构图"}。画面需要主体明确、构图干净、光线统一、风格稳定，画幅 ${imageRatio}。不要添加字幕、旁白、说明文字、水印或任何 UI 标注。`
    : `Generate a high-quality storyboard image for this shot: ${source || "design the subject, scene, and composition from the current shot context"}. Keep the subject clear, composition clean, lighting consistent, style stable, and aspect ratio ${imageRatio}. Do not add captions, narration text, explanatory text, watermarks, or UI labels.`;
  return method === "Seedance 2.0" ? withSeedanceReferenceGridPrompt(base) : base;
}

function buildFallbackVideoPrompt(row: StoryboardRow, method: StoryboardVideoGenerationMethod, imageRatio: ImageRatio): string {
  if (method === "Seedance 2.0") return buildFallbackSeedanceVideoPrompt(row, imageRatio);
  return buildFallbackHyperframesVideoPrompt(row, imageRatio);
}

function buildFallbackHyperframesVideoPrompt(row: StoryboardRow, imageRatio: ImageRatio): string {
  const source = buildFallbackVideoPromptSource(row);
  const useChinese = fallbackPromptUsesChinese(row);
  return useChinese
    ? `全画幅构图。${source || "根据当前镜头内容设计必要的画面结构和动效"}。使用 ${imageRatio} 画幅，只保留必要的阶段变化、可读文字和稳定版式；沿用已绑定参考素材，不复述主体或场景。无 BGM，只保留匹配画面动作或环境的音效；相邻 Shot 硬切，不做转场动画。`
    : `Full-frame composition. ${source || "Design only the visual structure and motion needed for the current shot"}. Use a ${imageRatio} aspect ratio with concise phase changes, readable typography, and a stable layout; follow bound references without restating the subject or scene. No BGM; use only sound effects tied to visible actions or ambience. Hard cut between shots with no transition animation.`;
}

function buildFallbackSeedanceVideoPrompt(row: StoryboardRow, imageRatio: ImageRatio): string {
  const source = buildFallbackVideoPromptSource(row);
  const useChinese = fallbackPromptUsesChinese(row);
  return useChinese
    ? `根据这个镜头的分镜参考图生成视频。景别沿用参考图；若参考图未明确，则使用中景。${source || "表现当前镜头中发生的动作"}。画幅 ${imageRatio}，不重复描述参考主体或场景，不添加文字、字幕、水印或 UI。无 BGM，只生成匹配动作或环境的音效；相邻 Shot 硬切，不做转场动画。`
    : `Generate the video from this shot's storyboard reference image. Follow its shot size, or use a medium shot when framing is unspecified. ${source || "Show what happens in the current shot"}. Use a ${imageRatio} aspect ratio without restating the referenced subject or scene and without text, captions, watermarks, or UI. No BGM; generate only action- or ambience-matched sound effects. Hard cut between shots with no transition animation.`;
}

function buildFallbackPromptSource(row: StoryboardRow): string {
  return [row.content, row.note].map((value) => value.trim()).filter(Boolean).join(" ");
}

function buildFallbackVideoPromptSource(row: StoryboardRow): string {
  const source = buildFallbackPromptSource(row).replace(/\s+/g, " ");
  return source.length > 240 ? `${source.slice(0, 237).trimEnd()}…` : source;
}

function fallbackPromptUsesChinese(row: StoryboardRow): boolean {
  return /[\u3400-\u9fff]/.test(`${row.content}\n${row.note}`);
}


function getStoryboardCategoryIcon(category: StoryboardCategory) {
  if (category === "A-ROLL") return <UserPen aria-hidden="true" />;
  return <Clapperboard aria-hidden="true" />;
}

function getStoryboardCategoryClassName(value: string) {
  if (!value.trim()) return "empty";
  if (/(^|[^a-z])a\s*-?\s*roll([^a-z]|$)/i.test(value)) return "aroll";
  if (/(^|[^a-z])b\s*-?\s*roll([^a-z]|$)/i.test(value)) return "broll";
  return "custom";
}

function moveStoryboardMediaAssetId(assetIds: string[], sourceAssetId: string, targetAssetId: string) {
  const sourceIndex = assetIds.indexOf(sourceAssetId);
  const targetIndex = assetIds.indexOf(targetAssetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return assetIds;
  const nextAssetIds = [...assetIds];
  const [sourceId] = nextAssetIds.splice(sourceIndex, 1);
  nextAssetIds.splice(targetIndex, 0, sourceId);
  return nextAssetIds;
}

function areStringArraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function getStoryboardRowMediaAssets(row: StoryboardRow, assets: ProjectAsset[]) {
  const assetMap = new Map(assets.map((asset) => [asset.id, asset]));
  return getStoryboardRowMediaAssetIds(row)
    .map((assetId) => assetMap.get(assetId))
    .filter((asset): asset is ProjectAsset => asset !== undefined && (asset.kind === "image" || asset.kind === "video"));
}

function getStoryboardRowDisplayMediaAssets(row: StoryboardRow, assets: ProjectAsset[]) {
  const mediaAssets = getStoryboardRowMediaAssets(row, assets);
  if (isStoryboardRowMediaSelectionTouched(row)) return mediaAssets;
  const imageAsset = mediaAssets.find((asset) => asset.kind === "image");
  const videoAsset = mediaAssets.find((asset) => asset.kind === "video");
  return [imageAsset, videoAsset].filter((asset): asset is ProjectAsset => asset !== undefined);
}

function getStoryboardRowEditableMediaAssetIds(row: StoryboardRow, assets: ProjectAsset[]) {
  if (isStoryboardRowMediaSelectionTouched(row)) return getStoryboardRowMediaAssetIds(row);
  return getStoryboardRowDisplayMediaAssets(row, assets).map((asset) => asset.id);
}

function getStoryboardRowPreviewAssets(row: StoryboardRow, assets: ProjectAsset[]) {
  const selectedAssets = getStoryboardRowMediaAssets(row, assets);
  const selectedIds = new Set(selectedAssets.map((asset) => asset.id));
  const linkedAssets = assets.filter((asset) => asset.linkedShotId === row.id && (asset.kind === "image" || asset.kind === "video") && !selectedIds.has(asset.id));
  return [...selectedAssets, ...linkedAssets];
}

function getStoryboardPromptPreviewAssets(row: StoryboardRow, assets: ProjectAsset[], kind: "image" | "video") {
  const selectedIds = new Set(getStoryboardRowMediaAssetIds(row));
  return assets.filter((asset) => asset.kind === kind && asset.linkedShotId === row.id && !selectedIds.has(asset.id));
}

function getStoryboardPromptPreviewAsset(row: StoryboardRow, assets: ProjectAsset[], kind: "image" | "video") {
  const explicitAssetId = row.customValues?.[getPromptPreviewAssetIdField(kind)] ?? "";
  const explicitAsset = explicitAssetId ? assets.find((asset) => asset.id === explicitAssetId && asset.kind === kind) : undefined;
  if (explicitAsset) return explicitAsset;
  if (row.customValues?.[getPromptPreviewHiddenField(kind)] === "true") return null;
  return getStoryboardPromptPreviewAssets(row, assets, kind)[0] ?? null;
}

function getPromptPreviewAssetIdField(kind: "image" | "video") {
  return kind === "video" ? PROMPT_PREVIEW_VIDEO_ASSET_ID_FIELD : PROMPT_PREVIEW_IMAGE_ASSET_ID_FIELD;
}

function getPromptPreviewHiddenField(kind: "image" | "video") {
  return kind === "video" ? PROMPT_PREVIEW_VIDEO_HIDDEN_FIELD : PROMPT_PREVIEW_IMAGE_HIDDEN_FIELD;
}

function isArollSampleHidden(row: StoryboardRow) {
  return row.customValues?.[A_ROLL_SAMPLE_HIDDEN_FIELD] === "true";
}

function isStoryboardRowMediaSelectionTouched(row: StoryboardRow) {
  return row.customValues?.[STORYBOARD_MEDIA_SELECTION_TOUCHED_FIELD] === "true";
}

function isStoryboardRowMissingImage(row: StoryboardRow) {
  return (!isArollStoryboardRow(row) || isArollSampleHidden(row)) && getStoryboardRowMediaAssetIds(row).length === 0;
}

function getColumnTrack(columnId: StoryboardColumnId, columnWidths: StoryboardColumnWidths) {
  return `${getColumnWidth(columnId, columnWidths)}px`;
}

function getStoryboardTableWidth(columns: StoryboardColumn[], columnWidths: StoryboardColumnWidths) {
  return columns.reduce((totalWidth, column) => totalWidth + getColumnWidth(column.id, columnWidths), 0);
}

function getStickyColumnOffset(columns: StoryboardColumn[], columnWidths: StoryboardColumnWidths, columnId: StoryboardColumnId) {
  let offset = 0;

  for (const column of columns) {
    if (column.id === columnId) return offset;
    offset += getColumnWidth(column.id, columnWidths);
  }

  return 0;
}

function getColumnWidth(columnId: StoryboardColumnId, columnWidths: StoryboardColumnWidths) {
  return columnWidths[columnId] ?? getDefaultColumnSize(columnId).width;
}

function getDefaultColumnSize(columnId: StoryboardColumnId) {
  if (columnId === "sort") return { width: 72, minWidth: 64, maxWidth: 110 };
  if (columnId === "shot") return { width: 72, minWidth: 56, maxWidth: 110 };
  if (columnId === "image") return { width: 260, minWidth: 150, maxWidth: 900 };
  if (columnId === "scene") return { width: 130, minWidth: 80, maxWidth: 640 };
  if (columnId === "duration") return { width: 112, minWidth: 76, maxWidth: 160 };
  if (columnId === "content") return { width: 420, minWidth: 160, maxWidth: 1600 };
  if (columnId === "note") return { width: 280, minWidth: 140, maxWidth: 1400 };
  if (columnId === "custom-3") return { width: 180, minWidth: 156, maxWidth: 720 };
  return { width: 180, minWidth: 110, maxWidth: 1400 };
}

function getColumnSettingIcon(column: StoryboardColumn) {
  if (column.id === "duration") return <Clock aria-hidden="true" />;
  return getColumnTypeIcon(column.type);
}

function getColumnTypeIcon(columnType: StoryboardColumnType) {
  if (columnType === "image") return <Image aria-hidden="true" />;
  if (columnType === "number") return <Hash aria-hidden="true" />;
  if (columnType === "select") return <ListChecks aria-hidden="true" />;
  return <Type aria-hidden="true" />;
}

function getNextCustomColumnIndex(columns: StoryboardColumn[]) {
  const maxCustomIndex = columns.reduce((maxIndex, column) => {
    if (!column.id.startsWith("custom-")) return maxIndex;
    const parsedIndex = Number(column.id.replace("custom-", ""));
    return Number.isFinite(parsedIndex) ? Math.max(maxIndex, parsedIndex) : maxIndex;
  }, 0);

  return maxCustomIndex + 1;
}

function StoryboardFloatingStats({
  totalShots,
  totalDuration,
  showDuration
}: {
  totalShots: number;
  totalDuration: number;
  showDuration: boolean;
}) {
  const { t } = useI18n();

  return (
    <div className="storyboard-floating-stats" aria-label={t("storyboard.stats")}>
      <div className="storyboard-stat-chip">
        <span>{t("storyboard.totalShots")}</span>
        <strong>{totalShots}</strong>
      </div>
      {showDuration ? (
        <div className="storyboard-stat-chip">
          <span>{t("storyboard.totalDuration")}</span>
          <strong>{t("storyboard.durationSeconds", { seconds: totalDuration })}</strong>
        </div>
      ) : null}
    </div>
  );
}

function AgentPanel({
  isCollapsed,
  conversations,
  activeConversationId,
  agentMessages,
  agentOperationConfirmations,
  agentImageAttachments,
  agentBusy,
  runningAgentClientRunIds,
  runningAgentConversationIds,
  localCliAgents,
  selectedCliId,
  selectedCliName,
  selectedCliConnectionState,
  selectedCliConnectionLabel,
  selectedCliStatusBusy,
  selectedAgentModel,
  selectedAgentEffort,
  agentPermissionMode,
  mcpBridgeStatus,
  onSelectCli,
  onSelectAgentModel,
  onSelectAgentEffort,
  onChangeAgentPermissionMode,
  onOpenRuntimeSettings,
  onConnectSelectedCli,
  onCreateConversation,
  onOpenConversation,
  onRefreshSelectedCliStatus,
  onStopAgentRun,
  onConfirmAgentOperations,
  onCancelAgentOperations,
  onChooseAgentImages,
  onPasteAgentImage,
  onRemoveAgentImageAttachment,
  sendAgentMessage
}: {
  isCollapsed: boolean;
  conversations: AgentConversation[];
  activeConversationId: string;
  agentMessages: AgentMessage[];
  agentOperationConfirmations: AgentOperationConfirmation[];
  agentImageAttachments: ProjectAsset[];
  agentBusy: boolean;
  runningAgentClientRunIds: Set<string>;
  runningAgentConversationIds: ReadonlySet<string>;
  localCliAgents: LocalCliAgent[];
  selectedCliId: AgentCliId;
  selectedCliName: string;
  selectedCliConnectionState: CodexCliStatus["state"];
  selectedCliConnectionLabel: string;
  selectedCliStatusBusy: boolean;
  selectedAgentModel: string;
  selectedAgentEffort: AgentEffortLevel;
  agentPermissionMode: AgentPermissionMode;
  mcpBridgeStatus: McpBridgeStatus | null;
  onSelectCli: (cliId: AgentCliId) => void;
  onSelectAgentModel: (model: string) => void;
  onSelectAgentEffort: (effort: AgentEffortLevel) => void;
  onChangeAgentPermissionMode: (mode: AgentPermissionMode) => void;
  onOpenRuntimeSettings: () => void;
  onConnectSelectedCli: () => void;
  onCreateConversation: () => void;
  onOpenConversation: (conversationId: string) => void;
  onRefreshSelectedCliStatus: () => void;
  onStopAgentRun: (clientRunId?: string) => void;
  onConfirmAgentOperations: (confirmationId: string) => void;
  onCancelAgentOperations: (confirmationId: string) => void;
  onChooseAgentImages: () => void;
  onPasteAgentImage: () => void;
  onRemoveAgentImageAttachment: (assetId: string) => void;
  sendAgentMessage: AgentSubmitHandler;
}) {
  const { t } = useI18n();
  const cliConnected = selectedCliConnectionState === "connected";
  const cliActionDisabled = selectedCliStatusBusy || selectedCliConnectionState === "not_installed";
  const showCliNotice = !cliConnected;
  const messageListRef = useRef<HTMLDivElement>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const pinnedToBottomRef = useRef(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [scrolledFromBottom, setScrolledFromBottom] = useState(false);
  const visibleAgentMessages = isDefaultAgentConversation(agentMessages) ? [] : agentMessages;
  const confirmationByClientRunId = useMemo(() => {
    const confirmations = new Map<string, AgentOperationConfirmation>();
    agentOperationConfirmations
      .filter((confirmation) => confirmation.conversationId === activeConversationId)
      .forEach((confirmation) => confirmations.set(confirmation.clientRunId, confirmation));
    return confirmations;
  }, [activeConversationId, agentOperationConfirmations]);
  const latestAssistantId = [...visibleAgentMessages].reverse().find((message) => message.role === "assistant")?.id;
  const stoppableAgentClientRunId = latestStoppableAgentClientRunId(visibleAgentMessages, runningAgentClientRunIds);
  const agentStoppable = Boolean(stoppableAgentClientRunId);
  const activeConversationTitle = formatAgentConversationTitle(conversations.find((conversation) => conversation.id === activeConversationId)?.title, t);
  const hasUnreadConversationCompletion = conversations.some((conversation) => conversation.hasUnreadCompletion);
  const isConversationEmpty = visibleAgentMessages.length === 0;

  useEffect(() => {
    if (!pinnedToBottomRef.current) return;
    messageEndRef.current?.scrollIntoView({ block: "end" });
    requestAnimationFrame(updateAgentScrollState);
  }, [agentMessages, agentBusy, agentOperationConfirmations]);

  function updateAgentScrollState() {
    const list = messageListRef.current;
    if (!list) return;
    const distanceFromBottom = list.scrollHeight - list.scrollTop - list.clientHeight;
    pinnedToBottomRef.current = distanceFromBottom < 72;
    setScrolledFromBottom(distanceFromBottom > 120);
  }

  function handleAgentMessagesScroll() {
    updateAgentScrollState();
  }

  function scrollAgentMessagesToBottom() {
    pinnedToBottomRef.current = true;
    setScrolledFromBottom(false);
    messageEndRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }

  return (
    <aside className={cn("agent-panel", isCollapsed && "collapsed")} aria-label={isCollapsed ? t("agent.panelCollapsed") : t("agent.panel")}>
      <div className="agent-topbar">
        {!isCollapsed ? (
          <>
            <div className="agent-conversation-title" aria-live="polite">
              <span>{activeConversationTitle}</span>
            </div>
            <div className="agent-topbar-actions">
              <button
                className={cn("agent-topbar-icon", historyOpen && "active", hasUnreadConversationCompletion && "has-unread")}
                type="button"
                aria-label={hasUnreadConversationCompletion ? t("agent.historyUnread") : t("agent.history")}
                aria-expanded={historyOpen}
                title={hasUnreadConversationCompletion ? t("agent.historyUnread") : t("agent.history")}
                onClick={() => setHistoryOpen((open) => !open)}
              >
                <Clock aria-hidden="true" />
                {hasUnreadConversationCompletion ? <span className="agent-notification-dot" aria-hidden="true" /> : null}
              </button>
              <button className="agent-topbar-icon" type="button" aria-label={t("agent.newConversation")} title={t("agent.newConversation")} onClick={onCreateConversation}>
                <Plus aria-hidden="true" />
              </button>
            </div>
          </>
        ) : null}
      </div>
      {!isCollapsed ? (
        <>
          {historyOpen ? (
            <AgentConversationHistory
              activeConversationId={activeConversationId}
              conversations={conversations}
              runningConversationIds={runningAgentConversationIds}
              onCreateConversation={() => {
                onCreateConversation();
                setHistoryOpen(false);
              }}
              onOpenConversation={(conversationId) => {
                onOpenConversation(conversationId);
                setHistoryOpen(false);
              }}
            />
          ) : null}
          {showCliNotice ? (
            <div className={cn("agent-connection-notice", `state-${selectedCliConnectionState}`)}>
              <span>{selectedCliStatusBusy ? t("agent.checkingCli", { name: selectedCliName }) : selectedCliConnectionLabel}</span>
              <div className="agent-connection-actions">
                {selectedCliConnectionState !== "not_installed" ? (
                  <button className="agent-link-button" type="button" onClick={onConnectSelectedCli} disabled={cliActionDisabled}>
                    {t("agent.connect")}
                  </button>
                ) : null}
                <button
                  className="agent-refresh-button"
                  type="button"
                  onClick={onRefreshSelectedCliStatus}
                  disabled={selectedCliStatusBusy}
                  aria-label={t("agent.refreshCliStatus", { name: selectedCliName })}
                >
                  <RefreshCw aria-hidden="true" />
                </button>
              </div>
            </div>
          ) : null}
          <div className="agent-messages-wrap">
            <div className={cn("agent-messages", isConversationEmpty && "empty")} ref={messageListRef} onScroll={handleAgentMessagesScroll}>
              {isConversationEmpty ? <AgentEmptyState /> : null}
              {visibleAgentMessages.map((message) => (
                <div className={cn("agent-message", message.role === "user" && "user", message.role === "assistant" && "assistant")} key={message.id}>
                  {message.role === "assistant" ? (
                    <AgentAssistantMessage
                      message={message}
                      confirmation={message.clientRunId ? confirmationByClientRunId.get(message.clientRunId) ?? message.operationConfirmation : message.operationConfirmation}
                      streaming={message.clientRunId ? runningAgentClientRunIds.has(message.clientRunId) : false}
                      isLatest={message.id === latestAssistantId}
                      agentCliId={selectedCliId}
                      onConfirmAgentOperations={onConfirmAgentOperations}
                      onCancelAgentOperations={onCancelAgentOperations}
                    />
                  ) : (
                    <AgentUserMessage message={message} />
                  )}
                </div>
              ))}
              <div ref={messageEndRef} />
            </div>
            <button className={cn("agent-jump-button", scrolledFromBottom && "visible")} type="button" onClick={scrollAgentMessagesToBottom} aria-hidden={!scrolledFromBottom}>
              <ArrowDown aria-hidden="true" />
              <span>{t("agent.jumpBottom")}</span>
            </button>
          </div>
          <AgentComposer
            activeConversationId={activeConversationId}
            agentImageAttachments={agentImageAttachments}
            agentStoppable={agentStoppable}
            cliConnected={cliConnected}
            localCliAgents={localCliAgents}
            selectedCliId={selectedCliId}
            selectedCliName={selectedCliName}
            selectedCliStatusBusy={selectedCliStatusBusy}
            selectedAgentModel={selectedAgentModel}
            selectedAgentEffort={selectedAgentEffort}
            agentPermissionMode={agentPermissionMode}
            mcpBridgeStatus={mcpBridgeStatus}
            stoppableAgentClientRunId={stoppableAgentClientRunId ?? undefined}
            onSelectCli={onSelectCli}
            onSelectAgentModel={onSelectAgentModel}
            onSelectAgentEffort={onSelectAgentEffort}
            onChangeAgentPermissionMode={onChangeAgentPermissionMode}
            onOpenRuntimeSettings={onOpenRuntimeSettings}
            onChooseAgentImages={onChooseAgentImages}
            onPasteAgentImage={onPasteAgentImage}
            onRemoveAgentImageAttachment={onRemoveAgentImageAttachment}
            onStopAgentRun={onStopAgentRun}
            sendAgentMessage={sendAgentMessage}
          />
        </>
      ) : null}
    </aside>
  );
}

function AgentComposer({
  activeConversationId,
  agentImageAttachments,
  agentStoppable,
  cliConnected,
  localCliAgents,
  selectedCliId,
  selectedCliName,
  selectedCliStatusBusy,
  selectedAgentModel,
  selectedAgentEffort,
  agentPermissionMode,
  mcpBridgeStatus,
  stoppableAgentClientRunId,
  onSelectCli,
  onSelectAgentModel,
  onSelectAgentEffort,
  onChangeAgentPermissionMode,
  onOpenRuntimeSettings,
  onChooseAgentImages,
  onPasteAgentImage,
  onRemoveAgentImageAttachment,
  onStopAgentRun,
  sendAgentMessage
}: {
  activeConversationId: string;
  agentImageAttachments: ProjectAsset[];
  agentStoppable: boolean;
  cliConnected: boolean;
  localCliAgents: LocalCliAgent[];
  selectedCliId: AgentCliId;
  selectedCliName: string;
  selectedCliStatusBusy: boolean;
  selectedAgentModel: string;
  selectedAgentEffort: AgentEffortLevel;
  agentPermissionMode: AgentPermissionMode;
  mcpBridgeStatus: McpBridgeStatus | null;
  stoppableAgentClientRunId?: string;
  onSelectCli: (cliId: AgentCliId) => void;
  onSelectAgentModel: (model: string) => void;
  onSelectAgentEffort: (effort: AgentEffortLevel) => void;
  onChangeAgentPermissionMode: (mode: AgentPermissionMode) => void;
  onOpenRuntimeSettings: () => void;
  onChooseAgentImages: () => void;
  onPasteAgentImage: () => void;
  onRemoveAgentImageAttachment: (assetId: string) => void;
  onStopAgentRun: (clientRunId?: string) => void;
  sendAgentMessage: AgentSubmitHandler;
}) {
  const { locale, t } = useI18n();
  const isEn = locale === "en";
  const [composerInput, setComposerInput] = useState("");
  const [agentMenuOpen, setAgentMenuOpen] = useState(false);
  const agentMenuRef = useRef<HTMLDivElement>(null);
  const composerTextAreaRef = useRef<HTMLTextAreaElement>(null);
  const selectableAgents = useMemo(
    () => localCliAgents.filter((agent) => !isDependencyCliAgent(agent)),
    [localCliAgents]
  );
  const activeAgentObj = selectableAgents.find((agent) => agent.id === selectedCliId);
  const availableModels = activeAgentObj?.models ?? [{ id: "default", label: isEn ? "CLI Default" : "CLI 默认模型" }];
  const supportsEffort = activeAgentObj?.supportsEffort ?? selectedCliId === "codex";
  const mcpOnline = Boolean(mcpBridgeStatus?.listening && mcpBridgeStatus?.enabled);

  useEffect(() => {
    if (!agentMenuOpen) return undefined;
    const onPointerDown = (event: MouseEvent) => {
      if (agentMenuRef.current && !agentMenuRef.current.contains(event.target as Node)) {
        setAgentMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [agentMenuOpen]);

  useLayoutEffect(() => {
    resizeAgentComposerTextArea(composerTextAreaRef.current);
  }, [composerInput]);

  useEffect(() => {
    const textarea = composerTextAreaRef.current;
    if (!textarea) return;

    let previousWidth = textarea.getBoundingClientRect().width;
    const resizeObserver = new ResizeObserver(([entry]) => {
      const nextWidth = entry?.contentRect.width ?? textarea.getBoundingClientRect().width;
      if (Math.abs(nextWidth - previousWidth) < 0.5) return;
      previousWidth = nextWidth;
      resizeAgentComposerTextArea(textarea);
    });

    resizeObserver.observe(textarea);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    setComposerInput("");
  }, [activeConversationId]);

  function submitComposer(event: { preventDefault: () => void }) {
    void sendAgentMessage(event, composerInput, () => setComposerInput(""));
  }

  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.metaKey || event.ctrlKey) return;
    event.preventDefault();
    submitComposer(event);
  }

  function handleComposerPaste(event: React.ClipboardEvent<HTMLFormElement>) {
    const hasImage = Array.from(event.clipboardData.items).some((item) => item.kind === "file" && item.type.startsWith("image/"));
    if (!hasImage || !cliConnected || agentStoppable) return;
    event.preventDefault();
    onPasteAgentImage();
  }

  return (
    <form className="agent-input" onPaste={handleComposerPaste} onSubmit={submitComposer}>
      <TextArea
        ref={composerTextAreaRef}
        className="composer-textarea"
        placeholder={cliConnected ? t("agent.messagePlaceholder") : t("agent.connectFirstPlaceholderWithName", { name: selectedCliName })}
        aria-label={t("agent.inputLabel")}
        rows={2}
        value={composerInput}
        disabled={!cliConnected || agentStoppable}
        onChange={(event) => setComposerInput(event.target.value)}
        onKeyDown={handleComposerKeyDown}
      />
      {agentImageAttachments.length > 0 ? (
        <div className="agent-attachment-strip" aria-label={t("agent.attachments")}>
          {agentImageAttachments.map((asset) => (
            <div className="agent-attachment-thumb" key={asset.id} title={asset.name}>
              <img src={asset.previewUrl} alt="" />
              <button type="button" aria-label={t("agent.removeAttachment", { name: asset.name })} onClick={() => onRemoveAgentImageAttachment(asset.id)}>
                <X aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <div className="composer-footer-row">
        <div className="composer-pills-bar">
          <button className="composer-icon" type="button" aria-label={t("agent.addAsset")} title={t("agent.addAsset")} disabled={!cliConnected || agentStoppable} onClick={onChooseAgentImages}>
            <Plus aria-hidden="true" />
          </button>

          <div className="composer-pill-wrap" ref={agentMenuRef}>
            <button
              className="composer-pill"
              type="button"
              onClick={() => setAgentMenuOpen((open) => !open)}
              title={isEn ? "Switch CLI Agent, Model & Effort" : "切换本地 CLI Agent、模型与推理强度"}
            >
              <Terminal aria-hidden="true" />
              <span>
                {selectedCliName}
                {selectedAgentModel && selectedAgentModel !== "default" ? ` · ${selectedAgentModel}` : ""}
                {supportsEffort ? ` · ${selectedAgentEffort}` : ""}
              </span>
              <ChevronDown aria-hidden="true" />
            </button>
            {agentMenuOpen ? (
              <div className="composer-popover" role="dialog" aria-label="Agent & Model Picker">
                <div className="composer-popover-label">{isEn ? "Local CLI Agent" : "本地 CLI Agent"}</div>
                <div className="composer-popover-list">
                  {selectableAgents.map((agent) => (
                    <button
                      key={agent.id}
                      type="button"
                      disabled={!agent.installed}
                      className={cn("composer-popover-option", agent.id === selectedCliId && "selected")}
                      onClick={() => {
                        if (!isAgentCliId(agent.id)) return;
                        onSelectCli(agent.id);
                        onSelectAgentModel("default");
                      }}
                    >
                      <span>{agent.name}</span>
                      <small>{agent.installed ? (agent.id === selectedCliId ? "✓" : "") : isEn ? "Not installed" : "未安装"}</small>
                    </button>
                  ))}
                </div>
                {availableModels.length > 0 ? (
                  <>
                    <div className="composer-popover-label">{isEn ? "Model" : "模型"}</div>
                    <select
                      className="byok-select"
                      value={availableModels.some((m) => m.id === selectedAgentModel) ? selectedAgentModel : availableModels[0].id}
                      onChange={(e) => onSelectAgentModel(e.target.value)}
                    >
                      {availableModels.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </>
                ) : null}
                {supportsEffort ? (
                  <>
                    <div className="composer-popover-label">{isEn ? "Reasoning Effort" : "推理强度"}</div>
                    <div className="composer-effort-chips">
                      {(["low", "medium", "high"] as const).map((lvl) => (
                        <button
                          key={lvl}
                          type="button"
                          className={cn("composer-effort-chip", selectedAgentEffort === lvl && "active")}
                          onClick={() => onSelectAgentEffort(lvl)}
                        >
                          {lvl}
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}
                <button
                  type="button"
                  className="composer-popover-option"
                  onClick={() => {
                    setAgentMenuOpen(false);
                    onOpenRuntimeSettings();
                  }}
                >
                  <span>{isEn ? "Configure CLI & API Keys…" : "管理 CLI 与本地 API Key…"}</span>
                  <Settings size={13} aria-hidden="true" />
                </button>
              </div>
            ) : null}
          </div>

          <button
            className={cn("composer-pill", agentPermissionMode === "auto-apply" && "mode-auto")}
            type="button"
            onClick={() => onChangeAgentPermissionMode(agentPermissionMode === "supervised" ? "auto-apply" : "supervised")}
            title={
              agentPermissionMode === "auto-apply"
                ? isEn
                  ? "Auto-apply: Agent operations execute immediately"
                  : "自动应用：Agent 修改与生图生视频操作直接执行"
                : isEn
                  ? "Supervised: Destructive & media operations ask before running"
                  : "监督模式：删除分镜与重新生成媒体前先确认"
            }
          >
            <ShieldCheck aria-hidden="true" />
            <span>{agentPermissionMode === "auto-apply" ? (isEn ? "Auto-apply" : "自动执行") : isEn ? "Supervised" : "需确认"}</span>
          </button>

          <button
            className="composer-pill"
            type="button"
            onClick={onOpenRuntimeSettings}
            title={mcpOnline ? "MkBoard MCP Server Ready" : "Configure MkBoard MCP Bridge"}
          >
            <span className={cn("composer-pill-dot", mcpOnline && "online")} aria-hidden="true" />
            <span>MCP</span>
          </button>
        </div>

        <div className="composer-actions">
          {agentStoppable ? (
            <button className="composer-send stop" type="button" aria-label={t("agent.stop")} title={t("agent.stop")} onClick={() => onStopAgentRun(stoppableAgentClientRunId)}>
              <span className="composer-stop-glyph" aria-hidden="true" />
            </button>
          ) : (
            <button className="composer-send" type="submit" aria-label={t("agent.send")} disabled={(!composerInput.trim() && agentImageAttachments.length === 0) || !cliConnected || selectedCliStatusBusy}>
              <ArrowUp aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </form>
  );
}

const AGENT_COMPOSER_MAX_ROWS = 10;

function resizeAgentComposerTextArea(textarea: HTMLTextAreaElement | null) {
  if (!textarea) return;

  textarea.style.height = "auto";
  textarea.style.overflowY = "hidden";

  const styles = window.getComputedStyle(textarea);
  const lineHeight = Number.parseFloat(styles.lineHeight);
  const paddingHeight = Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom);
  const borderHeight = Number.parseFloat(styles.borderTopWidth) + Number.parseFloat(styles.borderBottomWidth);
  const maxHeight = lineHeight * AGENT_COMPOSER_MAX_ROWS + paddingHeight + borderHeight;
  const contentHeight = textarea.scrollHeight + borderHeight;

  textarea.style.height = `${Math.min(contentHeight, maxHeight)}px`;
  textarea.style.overflowY = contentHeight > maxHeight ? "auto" : "hidden";
}

function AgentConversationHistory({
  activeConversationId,
  conversations,
  runningConversationIds,
  onCreateConversation,
  onOpenConversation
}: {
  activeConversationId: string;
  conversations: AgentConversation[];
  runningConversationIds: ReadonlySet<string>;
  onCreateConversation: () => void;
  onOpenConversation: (conversationId: string) => void;
}) {
  const { locale, t } = useI18n();

  return (
    <section className="agent-history-panel" aria-label={t("agent.conversationHistory")}>
      <div className="agent-history-head">
        <strong>{t("agent.conversationHistory")}</strong>
        <button className="agent-history-new" type="button" onClick={onCreateConversation}>
          <Plus aria-hidden="true" />
          {t("agent.newConversationShort")}
        </button>
      </div>
      <div className="agent-history-list">
        {conversations.length === 0 ? <div className="agent-history-empty">{t("agent.emptyConversations")}</div> : null}
        {conversations.map((conversation) => {
          const active = conversation.id === activeConversationId;
          const running = runningConversationIds.has(conversation.id);
          const unreadCompletion = conversation.hasUnreadCompletion;

          return (
            <button
              className={cn("agent-history-item", active && "active", running && "running", unreadCompletion && "has-unread")}
              type="button"
              key={conversation.id}
              aria-current={active ? "true" : undefined}
              aria-busy={running ? "true" : undefined}
              aria-label={unreadCompletion ? `${formatAgentConversationTitle(conversation.title, t)}，${t("agent.unreadCompletion")}` : undefined}
              onClick={() => onOpenConversation(conversation.id)}
            >
              <span className="agent-history-title">{formatAgentConversationTitle(conversation.title, t)}</span>
              <span className="agent-history-trailing">
                {running ? (
                  <span className="agent-history-running" role="status" aria-label={t("agent.status.running")}>
                    <LoaderCircle aria-hidden="true" />
                    <span>{t("agent.status.running")}</span>
                  </span>
                ) : null}
                {unreadCompletion ? <span className="agent-history-notification-dot" title={t("agent.unreadCompletion")} aria-hidden="true" /> : null}
                <span className="agent-history-meta">{formatAgentConversationDate(conversation.updatedAt, locale)}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

type AgentToolItem = {
  use: Extract<AgentEvent, { kind: "tool_use" }>;
  result?: Extract<AgentEvent, { kind: "tool_result" }>;
};

type AgentBlock =
  | { kind: "text"; text: string }
  | { kind: "thinking"; text: string }
  | { kind: "tool-group"; items: AgentToolItem[] }
  | { kind: "status"; label: string; detail?: string }
  | { kind: "error"; message: string };

type AgentVisibleContent = { kind: "text" | "error"; text: string };

const agentPreparingMessage = fallbackTranslator("agent.preparing");
const agentLocalPreparingMessage = fallbackTranslator("agent.localPreparing");
const englishTranslator = createTranslator("en");
const agentStreamingPlaceholders = new Set([
  agentPreparingMessage,
  agentLocalPreparingMessage,
  englishTranslator("agent.preparing"),
  englishTranslator("agent.localPreparing")
]);

const AGENT_TYPEWRITER_INTERVAL_MS = 18;
const AGENT_TYPEWRITER_INITIAL_DELAY_MS = 55;
const agentMarkdownComponents: Components = {
  a({ href, children, ...props }) {
    return (
      <a href={href} target={href ? "_blank" : undefined} rel={href ? "noreferrer" : undefined} {...props}>
        {children}
      </a>
    );
  }
};

function isDefaultAgentConversation(messages: AgentMessage[]) {
  return messages.length === 1 && messages[0]?.role === "assistant" && messages[0]?.content === defaultAgentMessage;
}

function useTypewriterText(targetText: string, streaming: boolean, animateOnMount = false) {
  const shouldAnimateOnMount = streaming || animateOnMount;
  const [visibleText, setVisibleText] = useState(() => (shouldAnimateOnMount ? "" : targetText));
  const visibleTextRef = useRef(visibleText);
  const targetTextRef = useRef(targetText);
  const timerRef = useRef<number | null>(null);
  const animatingRef = useRef(shouldAnimateOnMount);

  useEffect(() => {
    targetTextRef.current = targetText;

    function clearTimer() {
      if (timerRef.current === null) return;
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    function commit(nextText: string) {
      visibleTextRef.current = nextText;
      setVisibleText(nextText);
    }

    function tick() {
      const current = visibleTextRef.current;
      const target = targetTextRef.current;
      if (!target.startsWith(current)) {
        animatingRef.current = false;
        commit(target);
        return;
      }
      if (current.length >= target.length) {
        animatingRef.current = false;
        return;
      }

      const nextLength = Math.min(target.length, current.length + agentTypewriterStep(target.length - current.length));
      commit(target.slice(0, nextLength));
      timerRef.current = window.setTimeout(tick, AGENT_TYPEWRITER_INTERVAL_MS);
    }

    const current = visibleTextRef.current;
    const canAppend = targetText.startsWith(current);
    const shouldAnimate = canAppend && (streaming || animatingRef.current || current.length < targetText.length);

    clearTimer();
    if (!shouldAnimate || !canAppend) {
      animatingRef.current = false;
      if (current !== targetText) commit(targetText);
      return clearTimer;
    }

    animatingRef.current = current.length < targetText.length;
    if (!animatingRef.current) return clearTimer;

    timerRef.current = window.setTimeout(tick, current ? AGENT_TYPEWRITER_INTERVAL_MS : AGENT_TYPEWRITER_INITIAL_DELAY_MS);
    return clearTimer;
  }, [targetText, streaming]);

  return { text: visibleText, typing: visibleText.length < targetText.length };
}

function agentTypewriterStep(remainingChars: number) {
  if (remainingChars > 1200) return 28;
  if (remainingChars > 500) return 18;
  if (remainingChars > 160) return 10;
  return 4;
}

function AgentEmptyState() {
  const { t } = useI18n();

  return (
    <div className="agent-empty-state">
      <div className="agent-empty-title">{t("agent.emptyTitle")}</div>
    </div>
  );
}

function AgentUserMessage({ message }: { message: AgentMessage }) {
  const { locale, t } = useI18n();
  const [copied, setCopied] = useState(false);
  const sentAt = formatAgentMessageTime(message.createdAt, locale);
  const imageAttachments = (message.attachments ?? []).filter((attachment) => attachment.kind === "image");

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function handleCopy() {
    const copiedText = await copyTextToClipboard(message.content);
    if (copiedText) setCopied(true);
  }

  return (
    <>
      <span>{t("common.you")}</span>
      <div className="agent-user-text-wrap">
        {imageAttachments.length > 0 ? (
          <div className="agent-message-attachment-grid" aria-label={t("agent.attachments")}>
            {imageAttachments.map((attachment) => (
              <span className="agent-message-attachment-thumb" key={attachment.id} title={attachment.name}>
                <img src={attachment.previewUrl} alt={attachment.name} loading="lazy" />
              </span>
            ))}
          </div>
        ) : null}
        <AgentMarkdownBlock className="agent-user-markdown" text={message.content} />
        <div className="agent-user-actions">
          {sentAt ? <span className="agent-user-actions-time">{sentAt}</span> : null}
          <button className="agent-user-copy-button" type="button" onClick={handleCopy} aria-label={copied ? t("agent.copiedMessage") : t("agent.copyMessage")} title={copied ? t("agent.copied") : t("agent.copy")}>
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          </button>
        </div>
      </div>
    </>
  );
}

function AgentAssistantMessage({
  message,
  confirmation,
  streaming,
  isLatest,
  agentCliId,
  onConfirmAgentOperations,
  onCancelAgentOperations
}: {
  message: AgentMessage;
  confirmation?: AgentOperationConfirmation;
  streaming: boolean;
  isLatest: boolean;
  agentCliId: AgentCliId;
  onConfirmAgentOperations: (confirmationId: string) => void;
  onCancelAgentOperations: (confirmationId: string) => void;
}) {
  const { locale } = useI18n();
  const messageLocale = inferAgentMessageLanguage(message, locale);
  const messageT = useMemo(() => createTranslator(messageLocale), [messageLocale]);
  const messageI18n = useMemo(() => ({ locale: messageLocale, t: messageT }), [messageLocale, messageT]);
  const events = message.events ?? [];
  const isDreaminaCliRun = events.some(isDreaminaCliToolEvent);
  const messageAgentCliId = message.agentCliId ?? inferAgentCliIdFromRenderedMessage(message) ?? agentCliId;
  const agentName = agentCliDisplayName(messageAgentCliId);
  const blocks = buildAgentBlocks(events, agentName, messageT);
  const usage = mergeAgentUsage(events);
  const visibleContent = visibleAgentContent(message.content, messageT, agentName);
  const effectiveStatus = effectiveAgentRunStatus(message);
  const effectiveTerminal = isTerminalAgentRunStatus(effectiveStatus);
  const effectiveComparableStatus = effectiveStatus as AgentMessage["runStatus"];
  const effectiveFailedOrCanceled = effectiveComparableStatus === "failed" || effectiveComparableStatus === "canceled";
  const effectiveStreaming = streaming && !effectiveTerminal;
  const blocksForDisplay =
    effectiveFailedOrCanceled && blocks.some((block) => block.kind === "error")
      ? blocks.filter((block) => !(block.kind === "status" && isTerminalFailureStatusLabel(block.label)))
      : blocks;
  const hasTerminalFailureCard = blocksForDisplay.some((block) => block.kind === "error" || (block.kind === "status" && isTerminalFailureStatusLabel(block.label)));
  const hasDuplicateContent = visibleContent ? agentBlocksContainVisibleContent(blocksForDisplay, visibleContent) : false;
  const hasStreamedText = blocks.some((block) => block.kind === "text");
  const finalContentIsError = visibleContent?.kind === "error" || effectiveComparableStatus === "failed";
  const animateFinalContent = isLatest && Boolean(message.clientRunId) && !hasStreamedText && isRecentAgentMessage(message.createdAt);
  const showFinalContent =
    Boolean(visibleContent) &&
    (!effectiveStreaming || hasStreamedText || effectiveTerminal) &&
    !hasDuplicateContent &&
    !(effectiveFailedOrCanceled && hasTerminalFailureCard);
  const thinkingIsActive = effectiveStreaming && !showFinalContent && !hasStreamedText;
  const hasOnlyStatusBlocks = blocksForDisplay.length > 0 && blocksForDisplay.every((block) => block.kind === "status");
  const showFooter = !(hasOnlyStatusBlocks && !effectiveStreaming);

  return (
    <I18nContext.Provider value={messageI18n}>
      <div className="agent-assistant-flow">
        {blocksForDisplay.map((block, index) => {
          if (block.kind === "text") return <AgentTextBlock key={`text-${index}`} text={block.text} streaming={effectiveStreaming} />;
          if (block.kind === "thinking") return <AgentThinkingBlock key={`thinking-${index}`} text={block.text} streaming={thinkingIsActive && index === blocks.length - 1} />;
          if (block.kind === "tool-group") return <AgentToolGroupCard key={`tool-${index}`} items={block.items} streaming={effectiveStreaming} defaultCollapsed={isDreaminaCliRun} />;
          if (block.kind === "error") return <AgentErrorBlock key={`error-${index}`} message={block.message} />;
          if (block.label === "thinking" && !effectiveStreaming) return null;
          return <AgentStatusPill key={`status-${index}`} label={block.label} detail={block.detail} />;
        })}
        {showFinalContent && finalContentIsError ? <AgentErrorBlock message={visibleContent?.text ?? ""} /> : null}
        {showFinalContent && !finalContentIsError && visibleContent?.kind === "text" ? (
          <AgentTextBlock text={visibleContent.text} variant={effectiveFailedOrCanceled ? "muted" : "final"} streaming={effectiveStreaming} animateOnMount={animateFinalContent} />
        ) : null}
        {confirmation ? (
          <AgentOperationConfirmationCard
            confirmation={confirmation}
            onCancel={() => onCancelAgentOperations(confirmation.id)}
            onConfirm={() => onConfirmAgentOperations(confirmation.id)}
          />
        ) : null}
        {showFooter ? <AgentAssistantFooter streaming={effectiveStreaming} status={effectiveStatus} usage={usage} events={events} isLatest={isLatest} startedAt={message.createdAt} hasVisibleOutput={showFinalContent || hasStreamedText} /> : null}
      </div>
    </I18nContext.Provider>
  );
}

function AgentOperationConfirmationCard({
  confirmation,
  onConfirm,
  onCancel
}: {
  confirmation: AgentOperationConfirmation;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { locale, t } = useI18n();
  const items = confirmation.operations.map((operation) => formatAgentOperationConfirmationItem(operation, confirmation.rows, locale, t));
  const isPending = confirmation.status === "pending";
  const isApplying = confirmation.status === "applying";
  const status = getAgentOperationConfirmationStatusCopy(confirmation, t);

  return (
    <section className={cn("agent-confirmation-card", `status-${confirmation.status}`)} aria-label={t("agent.confirmation.aria")}>
      <header className="agent-confirmation-head">
        <span className="agent-confirmation-icon" aria-hidden="true">
          {isApplying ? <LoaderCircle className="spinning" /> : confirmation.status === "confirmed" ? <Check /> : confirmation.status === "canceled" ? <X /> : <AlertTriangle />}
        </span>
        <div>
          <strong>{t("agent.confirmation.title")}</strong>
        </div>
      </header>
      <ul className="agent-confirmation-list">
        {items.map((item, index) => (
          <li key={`${item}-${index}`}>{item}</li>
        ))}
      </ul>
      {status ? (
        <div className="agent-confirmation-status" role={confirmation.status === "failed" ? "alert" : "status"}>
          <span>{status.title}</span>
          {status.detail ? <small>{status.detail}</small> : null}
        </div>
      ) : null}
      {isPending ? (
        <footer className="agent-confirmation-actions">
          <Button className="agent-confirmation-action secondary" variant="outline" onPress={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button className="agent-confirmation-action primary" variant="primary" onPress={onConfirm}>
            {t("agent.confirmation.confirm")}
          </Button>
        </footer>
      ) : null}
    </section>
  );
}

function getAgentOperationConfirmationStatusCopy(confirmation: AgentOperationConfirmation, t: Translator) {
  const includesDreaminaGeneration = confirmation.operations.some(isDreaminaAgentRegenerateMediaOperation);
  if (confirmation.status === "pending") {
    return null;
  }
  if (confirmation.status === "applying") {
    if (includesDreaminaGeneration) {
      return { title: t("agent.confirmation.dreaminaStartingTitle"), detail: t("agent.confirmation.dreaminaStartingDetail") };
    }
    return { title: t("agent.confirmation.applyingTitle"), detail: t("agent.confirmation.applyingDetail") };
  }
  if (confirmation.status === "confirmed") {
    return { title: t("agent.confirmation.confirmedTitle"), detail: "" };
  }
  if (confirmation.status === "canceled") {
    return { title: t("agent.confirmation.canceledTitle"), detail: t("agent.confirmation.canceledDetail") };
  }
  return { title: t("agent.confirmation.failedTitle"), detail: confirmation.error || t("agent.confirmation.failedDetail") };
}

function inferAgentCliIdFromRenderedMessage(message: AgentMessage): AgentCliId | undefined {
  const parts: string[] = [];
  if (message.content !== defaultAgentMessage) parts.push(message.content);
  for (const event of message.events ?? []) {
    if (event.kind === "status" && event.detail) parts.push(event.detail);
    if ((event.kind === "text" || event.kind === "thinking") && event.text) parts.push(event.text);
    if (event.kind === "tool_result" && event.content) parts.push(event.content);
    if (event.kind === "error") parts.push(event.message, event.raw ?? "");
    if (event.kind === "raw") parts.push(event.line);
  }

  const text = parts.join("\n");
  const claudeIndex = text.search(/\bClaude Code\b/iu);
  const codexIndex = text.search(/\bCodex CLI\b/iu);
  if (claudeIndex >= 0 && (codexIndex < 0 || claudeIndex < codexIndex)) return "claude-code";
  if (codexIndex >= 0) return "codex";
  return undefined;
}

function AgentTextBlock({ text, variant, streaming = false, animateOnMount = false }: { text: string; variant?: "final" | "muted"; streaming?: boolean; animateOnMount?: boolean }) {
  const { text: visibleText, typing } = useTypewriterText(text, streaming, animateOnMount);
  return (
    <AgentMarkdownBlock className={cn("agent-prose", variant && `variant-${variant}`)} dataTyping={typing} text={visibleText} />
  );
}

function AgentMarkdownBlock({ className, dataTyping, text }: { className?: string; dataTyping?: boolean; text: string }) {
  return (
    <div className={className} data-typing={dataTyping ? "true" : "false"}>
      <ReactMarkdown components={agentMarkdownComponents} remarkPlugins={[remarkGfm]}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

function AgentThinkingBlock({ text, streaming }: { text: string; streaming: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(() => streaming);
  const label = streaming ? t("agent.status.thinking") : t("agent.process.thinking");
  const { text: visibleText, typing } = useTypewriterText(text, streaming);
  const toggleLabel = open ? t("agent.thinking.collapse") : t("agent.thinking.expand");

  useEffect(() => {
    setOpen(streaming);
  }, [streaming]);

  function handleToggle() {
    setOpen((current) => !current);
  }

  return (
    <div className={cn("agent-thinking-block", streaming && "running", !open && "collapsed")}>
      <button className="agent-thinking-toggle" type="button" aria-expanded={open} aria-label={toggleLabel} title={toggleLabel} onClick={handleToggle}>
        <span className="agent-thinking-indicator" aria-hidden="true">
          {streaming ? <LoaderCircle /> : <span />}
        </span>
        <span className="agent-thinking-label">{label}</span>
        <ChevronDown className="agent-thinking-chevron" aria-hidden="true" />
      </button>
      {open ? <AgentMarkdownBlock className="agent-prose agent-thinking-body" dataTyping={typing} text={visibleText} /> : null}
    </div>
  );
}

function AgentToolGroupCard({ items, streaming, defaultCollapsed = false }: { items: AgentToolItem[]; streaming: boolean; defaultCollapsed?: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(() => streaming && !defaultCollapsed);
  const manuallyToggledRef = useRef(false);
  const completed = items.filter((item) => item.result).length;
  const hasError = items.some((item) => item.result?.isError);
  const isRunning = !hasError && streaming && completed < items.length;
  const toolName = toolDisplayName(items[0]?.use.name ?? "Tool", t);
  const title = items.length > 1 ? t("agent.tool.count", { tool: toolName, count: items.length }) : toolName;
  const status = hasError ? t("agent.status.error") : completed === items.length ? t("agent.status.complete") : streaming ? t("agent.status.running") : t("agent.status.waiting");

  useEffect(() => {
    if (defaultCollapsed) {
      if (!manuallyToggledRef.current) setOpen(false);
      return;
    }
    if (hasError || (streaming && completed < items.length)) setOpen(true);
  }, [completed, defaultCollapsed, hasError, items.length, streaming]);

  function handleToggle() {
    manuallyToggledRef.current = true;
    setOpen((value) => !value);
  }

  return (
    <div className={cn("agent-tool-card", hasError && "has-error", isRunning && "is-running", open && "open")}>
      <button className="agent-tool-card-head" type="button" aria-expanded={open} onClick={handleToggle}>
        <span className="agent-tool-icon">{hasError ? <AlertTriangle aria-hidden="true" /> : completed === items.length ? <CircleCheck aria-hidden="true" /> : <Terminal aria-hidden="true" />}</span>
        <strong>{title}</strong>
        <span className="agent-tool-status">{status}</span>
        <ChevronRight aria-hidden="true" />
      </button>
      {open ? (
        <div className="agent-tool-items">
          {items.map((item, index) => (
            <div className="agent-tool-item" key={`${item.use.id}-${index}`}>
              <code>{toolInputPreview(item.use, t)}</code>
              {item.result?.content ? <pre>{truncateAgentDetail(item.result.content, 700)}</pre> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function AgentErrorBlock({ message }: { message: string }) {
  return (
    <div className="agent-error-block" role="status">
      <AlertTriangle aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

function AgentStatusPill({ label, detail }: { label: string; detail?: string }) {
  const { t } = useI18n();
  const isRunning = label === "running" || label === "writing" || label === "thinking" || label === "starting";

  return (
    <div className={cn("agent-status-pill", label === "failed" || label === "error" ? "is-error" : label === "warning" ? "is-warning" : undefined, isRunning && "is-running")}>
      <span>{agentStatusLabel(label, t)}</span>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

function AgentAssistantFooter({
  streaming,
  status,
  usage,
  events,
  isLatest,
  startedAt,
  hasVisibleOutput
}: {
  streaming: boolean;
  status?: AgentMessage["runStatus"];
  usage: MergedAgentUsage;
  events: AgentEvent[];
  isLatest: boolean;
  startedAt: string;
  hasVisibleOutput: boolean;
}) {
  const { t } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  const currentEvent = latestAgentActivityEvent(events);
  const label = currentAgentActivityLabel(currentEvent, streaming, status, t, hasVisibleOutput);
  const completedQuietly = !streaming && (!status || status === "succeeded");
  const shimmer = streaming && (!currentEvent || currentEvent.kind === "status" || currentEvent.kind === "thinking");
  const stats = agentUsageText(usage);
  const elapsedMs = agentElapsedMs(startedAt, usage.durationMs, streaming, now);
  const elapsedText = elapsedMs === null ? "" : t(streaming ? "agent.elapsed.running" : "agent.elapsed.complete", { time: formatElapsedDuration(elapsedMs) });

  useEffect(() => {
    if (!streaming) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [streaming]);

  return (
    <div className="agent-assistant-footer" data-streaming={streaming ? "true" : "false"} data-last={isLatest ? "true" : "false"}>
      {completedQuietly ? (
        <MkboardBrandIcon className="agent-footer-brand" decorative />
      ) : (
        <span className={cn(shimmer && "shimmer-text")}>{label}</span>
      )}
      {elapsedText ? <small className="agent-footer-elapsed">{elapsedText}</small> : null}
      {stats ? <small>{stats}</small> : null}
    </div>
  );
}

function agentElapsedMs(startedAt: string, durationMs: number | undefined, streaming: boolean, now: number): number | null {
  if (durationMs !== undefined) return Math.max(0, durationMs);
  if (!streaming) return null;
  const startedAtMs = new Date(startedAt).getTime();
  if (Number.isNaN(startedAtMs)) return null;
  return Math.max(0, now - startedAtMs);
}

function formatElapsedDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function latestAgentActivityEvent(events: AgentEvent[]) {
  const internalToolUseIds = internalStructuredOutputToolUseIds(events);
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.kind === "tool_use" && isInternalStructuredOutputToolName(event.name)) continue;
    if (event.kind === "tool_result" && internalToolUseIds.has(event.toolUseId)) continue;
    if (event.kind !== "usage" && event.kind !== "raw") return event;
  }
  return null;
}

function currentAgentActivityLabel(event: AgentEvent | null, streaming: boolean, status: AgentMessage["runStatus"] | undefined, t: Translator, hasVisibleOutput = false) {
  if (!streaming) return status ? agentRunStatusText(status, t) : t("agent.status.complete");
  if (!event) return t("agent.status.preparing");
  if (event.kind === "thinking") return t("agent.status.thinking");
  if (event.kind === "text") return t("agent.status.responding");
  if (event.kind === "tool_use") return t("agent.run.callingTool", { tool: toolDisplayName(event.name, t) });
  if (event.kind === "tool_result") return event.isError ? t("agent.status.error") : t("agent.status.executing");
  if (event.kind === "error") return t("agent.status.error");
  if (event.kind === "status") {
    if (event.label === "requesting") return hasVisibleOutput ? t("agent.status.responding") : t("agent.status.running");
    if (event.label === "thinking") return hasVisibleOutput ? t("agent.status.responding") : t("agent.status.thinking");
    if (event.label === "running") return hasVisibleOutput ? t("agent.status.responding") : t("agent.status.running");
    return agentStatusLabel(event.label, t);
  }
  return t("agent.status.executing");
}

function agentRunStatusText(status: NonNullable<AgentMessage["runStatus"]>, t: Translator) {
  if (status === "queued") return t("agent.run.queued");
  if (status === "running") return t("agent.status.running");
  if (status === "succeeded") return t("agent.status.complete");
  if (status === "failed") return t("agent.run.failed");
  return t("agent.run.canceled");
}

function isRecentAgentMessage(createdAt: string) {
  const createdAtMs = new Date(createdAt).getTime();
  if (Number.isNaN(createdAtMs)) return false;
  return Date.now() - createdAtMs < 120_000;
}

function formatAgentMessageTime(value: string, locale: InterfaceLanguage) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

function formatAgentConversationDate(value: string, locale: InterfaceLanguage) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(locale, { month: "numeric", day: "numeric", year: "numeric" });
}

async function copyTextToClipboard(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the DOM fallback below.
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    textarea.remove();
    return ok;
  } catch {
    return false;
  }
}

function buildAgentBlocks(events: AgentEvent[], agentName: string, t: Translator): AgentBlock[] {
  const blocks: AgentBlock[] = [];
  const resultByToolId = new Map<string, Extract<AgentEvent, { kind: "tool_result" }>>();
  const seenErrors = new Set<string>();
  const seenToolUseIds = new Set<string>();

  for (const event of events) {
    if (event.kind === "tool_result") resultByToolId.set(event.toolUseId, event);
  }

  for (const event of events) {
    if (event.kind === "text") {
      const last = blocks[blocks.length - 1];
      if (last?.kind === "text") last.text += event.text;
      else blocks.push({ kind: "text", text: event.text });
      continue;
    }
    if (event.kind === "thinking") {
      const last = blocks[blocks.length - 1];
      if (last?.kind === "thinking") last.text = appendAgentThinkingText(last.text, event.text);
      else blocks.push({ kind: "thinking", text: event.text });
      continue;
    }
    if (event.kind === "tool_use") {
      if (isInternalStructuredOutputToolName(event.name)) continue;
      if (seenToolUseIds.has(event.id)) continue;
      seenToolUseIds.add(event.id);
      const item: AgentToolItem = { use: event, result: resultByToolId.get(event.id) };
      const last = blocks[blocks.length - 1];
      if (last?.kind === "tool-group" && toolFamily(last.items[last.items.length - 1]?.use.name) === toolFamily(event.name)) {
        last.items.push(item);
      } else {
        blocks.push({ kind: "tool-group", items: [item] });
      }
      continue;
    }
    if (event.kind === "tool_result" || event.kind === "usage" || event.kind === "raw") continue;
    if (event.kind === "error") {
      const message = formatUserFacingMessage(event.message, t, agentName);
      if (!seenErrors.has(message)) {
        seenErrors.add(message);
        blocks.push({ kind: "error", message });
      }
      continue;
    }
    if (event.kind === "status") {
      if (["storyboard_parse", "queued", "starting", "initializing", "requesting", "running", "succeeded"].includes(event.label)) continue;
      blocks.push({ kind: "status", label: event.label, detail: formatAgentStatusDetail(event, agentName, t) });
    }
  }
  const visibleBlocks = blocks
    .map((block) => {
      if (block.kind !== "text") return block;
      const text = visibleTextFromAgentTextBlock(block.text, t, agentName);
      return text ? { ...block, text } : null;
    })
    .filter((block): block is AgentBlock => Boolean(block))
    .filter((block) => block.kind !== "thinking" || block.text.trim().length > 0);
  return compactAgentBlocks(visibleBlocks);
}

function appendAgentThinkingText(current: string, incoming: string) {
  const currentTrimmed = current.trimEnd();
  const incomingTrimmed = incoming.trimStart();
  const joinsAdjacentMarkdownBlocks = /(?:\*\*|__)$/.test(currentTrimmed) && /^(?:\*\*|__)/.test(incomingTrimmed);

  if (!joinsAdjacentMarkdownBlocks) return current + incoming;
  return `${currentTrimmed}\n\n${incomingTrimmed}`;
}

function compactAgentBlocks(blocks: AgentBlock[]): AgentBlock[] {
  const hasVisibleOutput = blocks.some((block) => block.kind !== "status");
  let lastTerminalStatusIndex = -1;
  let lastProgressStatusIndex = -1;
  const seenWarnings = new Set<string>();

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (block.kind !== "status") continue;
    if (isTerminalFailureStatusLabel(block.label)) {
      lastTerminalStatusIndex = index;
    } else if (block.label !== "warning") {
      lastProgressStatusIndex = index;
    }
  }

  return blocks.filter((block, index) => {
    if (block.kind !== "status") return true;
    if (block.label === "warning") {
      const key = normalizeAgentText(block.detail || block.label);
      if (seenWarnings.has(key)) return false;
      seenWarnings.add(key);
      return true;
    }
    if (lastTerminalStatusIndex >= 0) return index === lastTerminalStatusIndex;
    if (hasVisibleOutput) return false;
    return index === lastProgressStatusIndex;
  });
}

function formatAgentStatusDetail(event: Extract<AgentEvent, { kind: "status" }>, agentName: string, t: Translator) {
  if (!event.detail) return undefined;
  const detail = formatUserFacingMessage(event.detail, t, agentName);
  if (event.label === "canceled" && isAgentCancellationMessage(detail, agentName)) return undefined;
  return detail || undefined;
}

type MergedAgentUsage = {
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  reasoningOutputTokens?: number;
  durationMs?: number;
};

function mergeAgentUsage(events: AgentEvent[]): MergedAgentUsage {
  const usage: MergedAgentUsage = {};
  for (const event of events) {
    if (event.kind !== "usage") continue;
    if (event.inputTokens !== undefined) usage.inputTokens = event.inputTokens;
    if (event.outputTokens !== undefined) usage.outputTokens = event.outputTokens;
    if (event.cachedInputTokens !== undefined) usage.cachedInputTokens = event.cachedInputTokens;
    if (event.reasoningOutputTokens !== undefined) usage.reasoningOutputTokens = event.reasoningOutputTokens;
    if (event.durationMs !== undefined) usage.durationMs = event.durationMs;
  }
  return usage;
}

function effectiveAgentRunStatus(message: AgentMessage): AgentMessage["runStatus"] {
  const events = message.events ?? [];
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const status = agentRunStatusFromEvent(events[index]);
    if (status) return status;
  }
  return message.runStatus;
}

function agentBlocksContainVisibleContent(blocks: AgentBlock[], content: AgentVisibleContent) {
  const normalized = normalizeAgentText(content.text);
  return blocks.some((block) => {
    if (content.kind === "text") return block.kind === "text" && normalizeAgentText(block.text) === normalized;
    return block.kind === "error" && normalizeAgentText(block.message) === normalized;
  });
}

function isTerminalFailureStatusLabel(label: string) {
  return label === "failed" || label === "canceled" || label === "error";
}

function normalizeAgentText(text: string) {
  return text.replace(/\s+/gu, " ").trim();
}

function visibleAgentContent(content: string, t: Translator, agentName = t("agent.localName")): AgentVisibleContent | null {
  const trimmed = content.trim();
  if (!trimmed || isAgentPreparingPlaceholder(trimmed)) return null;

  const transportReply = structuredTransportReply(trimmed);
  if (transportReply) return { kind: "text", text: transportReply };

  const partialTransportReply = partialStructuredTransportReply(trimmed);
  if (partialTransportReply) return { kind: "text", text: partialTransportReply };

  const rawError = extractRawAgentError(trimmed, t);
  if (rawError) return { kind: "error", text: rawError };

  if (looksLikeStructuredTransportPrefix(trimmed)) return null;

  return { kind: "text", text: formatUserFacingMessage(trimmed, t, agentName) };
}

function visibleTextFromAgentTextBlock(text: string, t: Translator, agentName = t("agent.localName")) {
  if (isAgentPreparingPlaceholder(text.trim())) return "";
  const transportReply = structuredTransportReply(text) ?? partialStructuredTransportReply(text);
  if (transportReply) return transportReply;
  if (looksLikeStructuredTransportPrefix(text)) return "";
  return formatUserFacingMessage(text, t, agentName);
}

function isAgentPreparingPlaceholder(text: string) {
  return (
    agentStreamingPlaceholders.has(text) ||
    /^正在准备 .+ 任务[.。]*$/u.test(text) ||
    /^.+ 正在读取当前脚本、分镜表、项目素材和(?: SKILL|技能)[.。]*$/u.test(text)
  );
}

function structuredTransportReply(text: string) {
  const parsed = parseStructuredTransportPayload(text);
  const reply = parsed?.reply;
  return typeof reply === "string" && reply.trim().length > 0 ? reply.trim() : null;
}

function parseStructuredTransportPayload(text: string): { reply?: unknown; scriptHtml?: unknown; rows?: unknown } | null {
  const jsonText = extractStructuredTransportJsonText(text);
  if (!jsonText) return null;
  try {
    const parsed = JSON.parse(jsonText) as { reply?: unknown; scriptHtml?: unknown; rows?: unknown };
    return "reply" in parsed && "scriptHtml" in parsed && "rows" in parsed ? parsed : null;
  } catch {
    return null;
  }
}

function extractStructuredTransportJsonText(text: string): string | null {
  const trimmed = text.trim();
  const candidates: string[] = [];
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) candidates.push(trimmed);

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/iu);
  if (fenced?.[1]?.trim().startsWith("{")) candidates.push(fenced[1].trim());

  for (let start = trimmed.indexOf("{"); start >= 0; start = trimmed.indexOf("{", start + 1)) {
    const end = findJsonObjectEnd(trimmed, start);
    if (end > start) candidates.push(trimmed.slice(start, end + 1));
  }

  return candidates.find(isStructuredTransportJsonText) ?? null;
}

function isStructuredTransportJsonText(jsonText: string) {
  try {
    const parsed = JSON.parse(jsonText) as { reply?: unknown; scriptHtml?: unknown; rows?: unknown };
    return parsed && typeof parsed === "object" && "reply" in parsed && "scriptHtml" in parsed && "rows" in parsed;
  } catch {
    return false;
  }
}

function findJsonObjectEnd(text: string, start: number) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function partialStructuredTransportReply(text: string) {
  if (!looksLikeStructuredTransportPrefix(text)) return null;
  return extractJsonStringFieldPrefix(text, "reply");
}

function looksLikeStructuredTransportPrefix(text: string) {
  const trimmed = text.trimStart();
  return trimmed.startsWith("{") || /^```json\b/iu.test(trimmed);
}

function extractJsonStringFieldPrefix(text: string, fieldName: string) {
  const keyPattern = new RegExp(`"${escapeRegExp(fieldName)}"\\s*:\\s*"`, "u");
  const match = keyPattern.exec(text);
  if (!match) return null;

  let output = "";
  let index = match.index + match[0].length;
  while (index < text.length) {
    const char = text[index];
    if (char === '"') return output.trim() || null;
    if (char !== "\\") {
      output += char;
      index += 1;
      continue;
    }

    const next = text[index + 1];
    if (!next) break;
    if (next === "u") {
      const hex = text.slice(index + 2, index + 6);
      if (!/^[\da-f]{4}$/iu.test(hex)) break;
      output += String.fromCharCode(parseInt(hex, 16));
      index += 6;
      continue;
    }

    output += decodeJsonEscape(next);
    index += 2;
  }

  return output.trim() || null;
}

function decodeJsonEscape(char: string) {
  if (char === "n") return "\n";
  if (char === "r") return "\r";
  if (char === "t") return "\t";
  if (char === "b") return "\b";
  if (char === "f") return "\f";
  return char;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function extractRawAgentError(text: string, t: Translator) {
  const normalized = decodeRawAgentText(text);
  if (!looksLikeRawAgentError(normalized)) return null;
  if (isCodexSchemaError(normalized)) {
    return t("agent.error.schema");
  }

  const parsedMessage = extractRawAgentErrorFromJsonLines(normalized);
  if (parsedMessage) return t("agent.error.codex", { detail: truncateAgentDetail(parsedMessage, 220) });

  const messageMatch = normalized.match(/"message"\s*:\s*"((?:\\.|[^"\\])*)"/u);
  if (messageMatch?.[1]) {
    return t("agent.error.codex", { detail: truncateAgentDetail(decodeJsonStringFragment(messageMatch[1]), 220) });
  }
  return t("agent.error.codex", { detail: truncateAgentDetail(normalized, 220) });
}

function formatStoryboardParseFailure(error: unknown, t: Translator) {
  const message = formatUserFacingError(error, t, t("agent.localName"));
  if (/timed out|timeout/i.test(message)) {
    return t("agent.error.parseTimeout");
  }
  return message || t("agent.error.parseFailed");
}

function stripIpcErrorPrefix(message: string) {
  return message
    .replace(/^Error invoking remote method '[^']+':\s*/u, "")
    .replace(/^Error:\s*/u, "")
    .trim();
}

function formatUserFacingError(error: unknown, t: Translator, agentName?: string) {
  return formatUserFacingMessage(error instanceof Error ? error.message : String(error), t, agentName);
}

function formatUserFacingMessage(input: string, t: Translator, agentName = t("agent.localName")) {
  const message = stripIpcErrorPrefix(input);
  if (!message) return "";
  const knownStatusMessage = localizeKnownAgentSystemMessage(message, t, agentName);
  if (knownStatusMessage) return knownStatusMessage;
  if (/无法连接 MkBoard 云端 API/u.test(message)) return message;
  if (isAgentCancellationMessage(message, agentName)) return t("agent.error.canceledWithName", { name: agentName });
  if (isClaudeToolCallTruncatedMessage(message)) return t("agent.error.truncatedWithName", { name: agentName });
  if (isAgentNetworkFailureMessage(message)) return formatAgentNetworkFailureMessage(agentName, t);
  if (/timed out|timeout/i.test(message)) return t("agent.error.timeoutWithName", { name: agentName });
  return message;
}

function localizeKnownAgentSystemMessage(message: string, t: Translator, agentName: string) {
  if (/正在读取当前脚本、分镜表、项目素材/u.test(message)) return t("agent.localPreparingWithName", { name: agentName });
  const attachmentMatch = message.match(/^已附加\s+(\d+)\s+张图片，将作为本次对话参考。$/u);
  if (attachmentMatch) return t("agent.attachmentsReady", { count: Number(attachmentMatch[1]) });
  if (message === "正在等待模型分析请求。") return t("agent.waitingForModelThinking");
  if (message === "正在准备项目上下文。") return t("agent.projectContextPreparing");
  if (message === "已收到这个生成请求。") return t("agent.workflow.requestQueued");
  if (message === "我来根据当前脚本重新解析分镜。") return t("agent.workflow.parseStart");
  return "";
}

function isAgentCancellationMessage(message: string, agentName: string) {
  const normalized = normalizeAgentText(stripIpcErrorPrefix(message));
  if (/canceled|cancelled|aborted/i.test(normalized)) return true;
  return normalized === `用户停止了当前 ${agentName} 任务。` || normalized === `已停止当前 ${agentName} 任务。`;
}

function formatAgentNetworkFailureMessage(agentName: string, t: Translator) {
  if (agentName === "Claude Code") return t("agent.error.claudeNetworkWithName", { name: agentName });
  return t("agent.error.networkWithName", { name: agentName });
}

function isClaudeToolCallTruncatedMessage(message: string) {
  return /TRUNCATED|stream ended before the tool call completed|Arguments were not fully transmitted/i.test(message);
}

function looksLikeRawAgentError(text: string) {
  return /invalid_json_schema|Invalid schema for response_format|invalid_grant|Grant not found|"type"\s*:\s*"(?:error|turn\.failed)"|"error"\s*:/iu.test(text);
}

function isCodexSchemaError(text: string) {
  return /invalid_json_schema|Invalid schema for response_format/iu.test(text);
}

function decodeRawAgentText(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "string") return parsed;
    } catch {
      // Keep the original text if it is not a full JSON string.
    }
  }
  return trimmed.replace(/\\n/gu, "\n").replace(/\\"/gu, '"');
}

function extractRawAgentErrorFromJsonLines(text: string) {
  for (const line of text.split(/\n+/u).reverse()) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) continue;
    try {
      const parsed = JSON.parse(trimmed);
      const message = findMessageInAgentPayload(parsed);
      if (message) return message;
    } catch {
      continue;
    }
  }
  return null;
}

function findMessageInAgentPayload(value: unknown, depth = 0): string | null {
  if (depth > 5 || value === null) return null;
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const message = findMessageInAgentPayload(item, depth + 1);
      if (message) return message;
    }
    return null;
  }
  if (typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  if (typeof record.message === "string" && record.message.trim()) return record.message.trim();
  for (const key of ["error", "payload", "data", "cause"]) {
    const message = findMessageInAgentPayload(record[key], depth + 1);
    if (message) return message;
  }
  return null;
}

function decodeJsonStringFragment(value: string) {
  try {
    const parsed = JSON.parse(`"${value}"`);
    return typeof parsed === "string" ? parsed : value;
  } catch {
    return value.replace(/\\"/gu, '"');
  }
}

function agentStatusLabel(label: string, t: Translator) {
  if (label === "queued") return t("agent.status.queued");
  if (label === "starting") return t("agent.status.starting");
  if (label === "initializing") return t("agent.status.initializing");
  if (label === "context") return t("agent.status.context");
  if (label === "thinking") return t("agent.status.thinking");
  if (label === "responding") return t("agent.status.responding");
  if (label === "writing") return t("agent.status.writing");
  if (label === "requesting") return t("agent.status.running");
  if (label === "running") return t("agent.status.running");
  if (label === "succeeded") return t("agent.status.succeeded");
  if (label === "failed") return t("agent.status.failed");
  if (label === "canceled") return t("agent.status.canceled");
  if (label === "error") return t("agent.status.error");
  if (label === "warning") return t("agent.status.warning");
  return label;
}

function toolFamily(name?: string) {
  const normalized = (name || "").toLowerCase();
  if (normalized.includes("bash") || normalized.includes("shell") || normalized.includes("command")) return "terminal";
  if (normalized.includes("project_write")) return "project_write";
  return normalized || "tool";
}

function isDreaminaCliToolEvent(event: AgentEvent) {
  if (event.kind !== "tool_use") return false;

  let input = "";
  try {
    input =
      typeof event.input === "string"
        ? event.input
        : event.input && typeof event.input === "object" && "command" in event.input
          ? String((event.input as { command?: unknown }).command ?? "")
          : event.input
            ? JSON.stringify(event.input)
            : "";
  } catch {
    return false;
  }

  return /(?:\.dreamina_cli(?:[\\/]|$)|[\\/]\.mkboard[\\/]dreamina(?:[\\/]|$)|(?:^|[\s"'=;|&\\/])dreamina(?:\s|$|[\\/]))/iu.test(input);
}

function isInternalStructuredOutputToolName(name?: string) {
  return (name || "").replace(/[\s_-]+/gu, "").toLowerCase() === "structuredoutput";
}

function internalStructuredOutputToolUseIds(events: AgentEvent[]) {
  const ids = new Set<string>();
  for (const event of events) {
    if (event.kind === "tool_use" && isInternalStructuredOutputToolName(event.name)) ids.add(event.id);
  }
  return ids;
}

function toolDisplayName(name: string, t: Translator) {
  if (toolFamily(name) === "terminal") return t("agent.tool.terminal");
  if (toolFamily(name) === "project_write") return t("agent.tool.projectWrite");
  return name;
}

function toolInputPreview(event: Extract<AgentEvent, { kind: "tool_use" }>, t: Translator) {
  if (toolFamily(event.name) === "project_write") {
    const targets = event.input && typeof event.input === "object" && "targets" in event.input ? (event.input as { targets?: unknown }).targets : undefined;
    if (Array.isArray(targets) && targets.length > 0) return t("agent.tool.writeTargets", { targets: targets.map(String).join(", ") });
    return t("agent.tool.writeProjectData");
  }
  if (event.input && typeof event.input === "object" && "command" in event.input) return String((event.input as { command?: unknown }).command ?? "").trim() || t("agent.tool.runCommand");
  if (typeof event.input === "string") return event.input;
  try {
    return event.input ? JSON.stringify(event.input) : t("agent.tool.runTool");
  } catch {
    return t("agent.tool.runTool");
  }
}

function agentUsageText(usage: MergedAgentUsage) {
  const parts = [
    usage.inputTokens ? `in ${usage.inputTokens}` : "",
    usage.outputTokens ? `out ${usage.outputTokens}` : "",
    usage.cachedInputTokens ? `cached ${usage.cachedInputTokens}` : "",
    usage.reasoningOutputTokens ? `reasoning ${usage.reasoningOutputTokens}` : ""
  ].filter(Boolean);
  return parts.join(" · ");
}

function truncateAgentDetail(value: string, maxLength: number) {
  const compact = value.replace(/\s+$/gu, "").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 1)}…`;
}

function AssetsPanel({
  assets,
  canImport = true,
  dropText,
  pageAction,
  projectId,
  projectName,
  scope,
  showHeading = true,
  onAssetDropNoticeChange,
  onChooseProjectAssets,
  onDeleteAssets,
  onImportAssetPaths,
  onRenameAsset
}: {
  assets: ProjectAsset[];
  canImport?: boolean;
  dropText: string;
  pageAction?: React.ReactNode;
  projectId: string;
  projectName: string;
  scope: "library" | "preview";
  showHeading?: boolean;
  onAssetDropNoticeChange: (notice: AssetDropNotice) => void;
  onChooseProjectAssets: ChooseProjectAssetsHandler;
  onDeleteAssets: (assetIds: string[]) => Promise<void>;
  onImportAssetPaths: (filePaths: string[]) => void;
  onRenameAsset: (assetId: string, fileName: string) => void;
}) {
  const { locale, t } = useI18n();
  const [assetFilter, setAssetFilter] = useState<AssetFilter>("all");
  const [isDraggingAssets, setIsDraggingAssets] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [activeAssetMenuId, setActiveAssetMenuId] = useState<string | null>(null);
  const [renamingAsset, setRenamingAsset] = useState<ProjectAsset | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [pendingDeleteAssetIds, setPendingDeleteAssetIds] = useState<string[]>([]);
  const [assetPreviewIndex, setAssetPreviewIndex] = useState<number | null>(null);
  const { assetDurationLabels, assetDimensions, updateAssetDimensions, updateAssetDurationLabel } = useAssetDurationLabels(assets);
  const assetDragDepthRef = useRef(0);
  const filteredAssets = useMemo(() => sortAssetsByImportedAt(assetFilter === "all" ? assets : assets.filter((asset) => asset.kind === assetFilter)), [assetFilter, assets]);
  const groupedAssets = useMemo(() => groupAssetsByImportDate(filteredAssets, locale, t), [filteredAssets, locale, t]);
  const previewableAssets = filteredAssets.filter((asset) => asset.kind === "image" || asset.kind === "video");
  const selectedFilterLabel = t(assetFilterOptions.find((option) => option.value === assetFilter)?.labelKey ?? "assets.filter.all");
  const selectedAssetCount = selectedAssetIds.length;
  const filteredAssetIds = useMemo(() => filteredAssets.map((asset) => asset.id), [filteredAssets]);
  const selectedAssetIdSet = useMemo(() => new Set(selectedAssetIds), [selectedAssetIds]);
  const allFilteredAssetsSelected = filteredAssetIds.length > 0 && filteredAssetIds.every((assetId) => selectedAssetIdSet.has(assetId));
  const usesLibraryHeaderControls = scope === "library";
  const hasPageHeader = showHeading || Boolean(pageAction) || usesLibraryHeaderControls;

  useEffect(() => {
    const assetIds = new Set(assets.map((asset) => asset.id));
    setSelectedAssetIds((currentIds) => currentIds.filter((assetId) => assetIds.has(assetId)));
    if (assets.length === 0) setSelectionMode(false);
  }, [assets]);

  useEffect(() => {
    if (assetPreviewIndex === null) return;
    if (previewableAssets.length === 0) {
      setAssetPreviewIndex(null);
      return;
    }
    if (assetPreviewIndex >= previewableAssets.length) setAssetPreviewIndex(previewableAssets.length - 1);
  }, [assetPreviewIndex, previewableAssets.length]);

  useEffect(() => {
    if (!activeAssetMenuId) return;

    function closeOnOutsidePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".asset-card-menu-trigger, .asset-card-menu-popover")) return;
      setActiveAssetMenuId(null);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setActiveAssetMenuId(null);
    }

    document.addEventListener("pointerdown", closeOnOutsidePointerDown, true);
    document.addEventListener("keydown", closeOnEscape, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointerDown, true);
      document.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [activeAssetMenuId]);

  function ingestFiles(files: FileList | File[]) {
    if (!canImport) return;
    const filePaths = window.mkboard.resolveDroppedFilePaths(Array.from(files));
    if (filePaths.length === 0) {
      onAssetDropNoticeChange({ kind: "missing-local-path" });
      return;
    }
    onImportAssetPaths(filePaths);
  }

  function handleAssetDragEnter(event: React.DragEvent<HTMLElement>) {
    if (!canImport) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    assetDragDepthRef.current += 1;
    setIsDraggingAssets(true);
  }

  function handleAssetDragLeave(event: React.DragEvent<HTMLElement>) {
    if (!canImport) return;
    event.preventDefault();
    assetDragDepthRef.current = Math.max(0, assetDragDepthRef.current - 1);
    if (assetDragDepthRef.current === 0) setIsDraggingAssets(false);
  }

  function handleAssetDragOver(event: React.DragEvent<HTMLElement>) {
    if (!canImport) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleAssetDrop(event: React.DragEvent<HTMLElement>) {
    if (!canImport) return;
    event.preventDefault();
    assetDragDepthRef.current = 0;
    setIsDraggingAssets(false);
    ingestFiles(event.dataTransfer.files);
  }

  async function handleChooseAssets() {
    if (!canImport) return;
    try {
      await onChooseProjectAssets();
    } catch {
      // The parent owns and displays the import failure state.
    }
  }

  function toggleSelectionMode() {
    setSelectionMode((current) => {
      if (current) setSelectedAssetIds([]);
      return !current;
    });
  }

  function toggleAssetSelection(assetId: string) {
    setSelectedAssetIds((currentIds) => (currentIds.includes(assetId) ? currentIds.filter((id) => id !== assetId) : [...currentIds, assetId]));
  }

  function toggleFilteredAssetSelection() {
    if (filteredAssetIds.length === 0) return;
    const filteredAssetIdSet = new Set(filteredAssetIds);
    setSelectedAssetIds((currentIds) => {
      const allSelected = filteredAssetIds.every((assetId) => currentIds.includes(assetId));
      if (allSelected) return currentIds.filter((assetId) => !filteredAssetIdSet.has(assetId));
      const nextIds = [...currentIds];
      filteredAssetIds.forEach((assetId) => {
        if (!nextIds.includes(assetId)) nextIds.push(assetId);
      });
      return nextIds;
    });
  }

  function handleAssetCardClick(assetId: string) {
    setActiveAssetMenuId(null);
    if (selectionMode) toggleAssetSelection(assetId);
  }

  function closeAssetMenuFromBackgroundClick(event: React.MouseEvent<HTMLElement>) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest(".asset-preview-card, .asset-card-menu-popover, .asset-selection-bar")) return;
    setActiveAssetMenuId(null);
  }

  function openAssetPreview(assetId: string) {
    const nextPreviewIndex = previewableAssets.findIndex((asset) => asset.id === assetId);
    if (nextPreviewIndex >= 0) setAssetPreviewIndex(nextPreviewIndex);
  }

  function clearAssetSelection() {
    setSelectedAssetIds([]);
    setSelectionMode(false);
  }

  function openRenameDialog(asset: ProjectAsset) {
    setActiveAssetMenuId(null);
    setRenamingAsset(asset);
    setRenameDraft(asset.name);
  }

  function confirmRenameAsset() {
    if (!renamingAsset || !renameDraft.trim()) return;
    onRenameAsset(renamingAsset.id, renameDraft);
    setRenamingAsset(null);
    setRenameDraft("");
  }

  async function revealAsset(assetId: string) {
    if (!projectId) return;
    setActiveAssetMenuId(null);
    try {
      await window.mkboard.revealAsset(projectId, assetId);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  }

  function requestDeleteAssets(assetIds: string[]) {
    setActiveAssetMenuId(null);
    setPendingDeleteAssetIds(assetIds);
  }

  async function confirmDeleteAssets() {
    if (pendingDeleteAssetIds.length === 0) return;
    const targetIds = pendingDeleteAssetIds;
    const remainingSelectedIds = selectedAssetIds.filter((assetId) => !targetIds.includes(assetId));
    try {
      await onDeleteAssets(targetIds);
      setSelectedAssetIds(remainingSelectedIds);
      if (remainingSelectedIds.length === 0) setSelectionMode(false);
      setPendingDeleteAssetIds([]);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  }

  async function downloadSelectedAssets() {
    if (!projectId || selectedAssetIds.length === 0) return;
    try {
      await window.mkboard.downloadAssets(projectId, selectedAssetIds);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  }

  const filterTabs = (
    <Tabs className="asset-filter-tabs-root" selectedKey={assetFilter} onSelectionChange={(nextValue) => setAssetFilter(nextValue as AssetFilter)} variant="primary">
      <Tabs.ListContainer className="asset-filter-tabs-container">
        <Tabs.List className="asset-filter-tabs" aria-label={t("assets.typeFilter")}>
          {assetFilterOptions.map((option) => (
            <Tab className="asset-filter-tab" id={option.value} key={option.value}>
              {t(option.labelKey)}
              <span className="asset-filter-count">{countAssetsByFilter(assets, option.value)}</span>
            </Tab>
          ))}
        </Tabs.List>
      </Tabs.ListContainer>
    </Tabs>
  );

  const multiSelectButton = (
    <Button className={cn("asset-multi-select-button", selectionMode && "active")} isDisabled={assets.length === 0} variant="outline" onPress={toggleSelectionMode}>
      <ListChecks aria-hidden="true" />
      <span>{selectionMode ? t("assets.exitMultiSelect") : t("assets.multiSelect")}</span>
    </Button>
  );

  const selectAllButton = selectionMode ? (
    <Button
      className={cn("asset-multi-select-button asset-select-all-button", allFilteredAssetsSelected && "active")}
      isDisabled={filteredAssetIds.length === 0}
      variant="outline"
      aria-pressed={allFilteredAssetsSelected}
      onPress={toggleFilteredAssetSelection}
    >
      {allFilteredAssetsSelected ? <X aria-hidden="true" /> : <CheckCheck aria-hidden="true" />}
      <span>{allFilteredAssetsSelected ? t("assets.cancelSelectAll") : t("assets.selectAll")}</span>
    </Button>
  ) : null;

  return (
    <section className="tab-panel active onboarding-assets-target" aria-label={t("nav.assets")}>
      <div className={cn("asset-browser-shell onboarding-assets-target", scope === "preview" && "project-preview", usesLibraryHeaderControls && "library-layout", !hasPageHeader && "no-page-header")}>
        <span className="onboarding-floating-anchor onboarding-assets-anchor" aria-hidden="true" />
        {hasPageHeader ? (
          <header className={cn("asset-browser-header", !showHeading && "controls-only", usesLibraryHeaderControls && "library-controls")}>
            {showHeading ? (
              <div className="asset-browser-header-main">
                <div className="asset-browser-summary">
                  <span className="asset-browser-kicker">{scope === "preview" ? t("assets.projectAssets") : t("assets.crossProjectLibrary")}</span>
                  <h2>{scope === "preview" ? t("assets.preview") : t("assets.title")}</h2>
                  <p>{projectName ? t("assets.projectAssetCount", { projectName, count: assets.length }) : t("assets.noViewableProject")}</p>
                </div>
              </div>
            ) : null}
            {usesLibraryHeaderControls ? (
              <div className="asset-browser-control-bar">
                {pageAction ? <div className="asset-browser-page-action">{pageAction}</div> : null}
                <div className="asset-browser-filter-control">{filterTabs}</div>
                <div className="asset-browser-header-action">
                  {selectAllButton}
                  {multiSelectButton}
                </div>
              </div>
            ) : (
              pageAction ? <div className="asset-browser-page-action">{pageAction}</div> : null
            )}
          </header>
        ) : null}
        <div className={cn("assets-layout", usesLibraryHeaderControls && "library-assets-layout")}>
          <section
            className={cn("asset-preview-panel", usesLibraryHeaderControls && "library-preview-panel no-toolbar", canImport && "drop-enabled", isDraggingAssets && "is-dragging")}
            aria-label={t("assets.previewLabel", { kind: selectedFilterLabel })}
            onClick={closeAssetMenuFromBackgroundClick}
            onDragEnter={handleAssetDragEnter}
            onDragLeave={handleAssetDragLeave}
            onDragOver={handleAssetDragOver}
            onDrop={handleAssetDrop}
          >
            {!usesLibraryHeaderControls ? (
              <div className="asset-preview-toolbar">
                <div className="asset-preview-toolbar-main">
                  {filterTabs}
                </div>
                <div className="asset-preview-toolbar-actions">
                  {selectAllButton}
                  {multiSelectButton}
                </div>
              </div>
            ) : null}
            <div className="asset-preview-grid">
              {groupedAssets.map((group) => (
                <section className="asset-date-section" aria-label={group.label} key={group.key}>
                  <h3 className="asset-date-heading">{group.label}</h3>
                  <div className="asset-date-grid">
                    {group.assets.map((asset) => {
                      const selected = selectedAssetIdSet.has(asset.id);
                      const canPreviewAsset = asset.kind === "image" || asset.kind === "video";
                      const durationLabel = asset.kind === "video" ? assetDurationLabels[asset.id] : null;
                      const dimensions = assetDimensions[asset.id];
                      const resolutionLabel = formatAssetResolutionLabel(asset, dimensions);
                      const previewOptions =
                        asset.kind === "video"
                          ? {
                              onVideoMetadata: (event: React.SyntheticEvent<HTMLVideoElement>) =>
                                updateAssetDurationLabel(
                                  asset.id,
                                  event.currentTarget.duration,
                                  event.currentTarget.videoWidth,
                                  event.currentTarget.videoHeight
                                )
                            }
                          : asset.kind === "image"
                            ? {
                                onImageMetadata: (event: React.SyntheticEvent<HTMLImageElement>) =>
                                  updateAssetDimensions(asset.id, event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)
                              }
                            : undefined;
                      return (
                        <article
                          className={cn("asset-preview-card", selectionMode && "selecting", selected && "selected")}
                          data-selected={selected ? "true" : "false"}
                          key={asset.id}
                          onClick={() => handleAssetCardClick(asset.id)}
                        >
                          <Button
                            className={cn("asset-card-checkbox", (selectionMode || selected) && "visible", selected && "selected")}
                            variant="ghost"
                            aria-label={selected ? t("assets.deselectAsset", { name: asset.name }) : t("assets.selectAsset", { name: asset.name })}
                            aria-pressed={selected}
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleAssetSelection(asset.id);
                            }}
                          >
                            <Check aria-hidden="true" />
                          </Button>
                          <Popover
                            isOpen={activeAssetMenuId === asset.id}
                            onOpenChange={(open) => setActiveAssetMenuId(open ? asset.id : null)}
                          >
                            <Popover.Trigger>
                              <Button
                                className={cn("asset-card-menu-trigger", activeAssetMenuId === asset.id && "open")}
                                aria-label={t("assets.assetActions", { name: asset.name })}
                                variant="ghost"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <Ellipsis aria-hidden="true" />
                              </Button>
                            </Popover.Trigger>
                            <Popover.Content className="asset-card-menu-popover" isNonModal offset={8} placement="bottom end">
                              <Popover.Dialog>
                                <div className="asset-card-menu" aria-label={t("assets.assetActions", { name: asset.name })}>
                                  <Button className="asset-card-menu-item" variant="ghost" onPress={() => openRenameDialog(asset)}>
                                    <Pencil aria-hidden="true" />
                                    <span>{t("assets.editFileName")}</span>
                                  </Button>
                                  <Button className="asset-card-menu-item" variant="ghost" onPress={() => void revealAsset(asset.id)}>
                                    <FolderOpen aria-hidden="true" />
                                    <span>{t("assets.revealInFolder")}</span>
                                  </Button>
                                  <Button className="asset-card-menu-item destructive" variant="ghost" onPress={() => requestDeleteAssets([asset.id])}>
                                    <Trash2 aria-hidden="true" />
                                    <span>{t("assets.deleteFile")}</span>
                                  </Button>
                                </div>
                              </Popover.Dialog>
                            </Popover.Content>
                          </Popover>
                          <div className={cn("asset-preview-media", asset.kind)}>
                            {canPreviewAsset ? (
                              <button
                                className="asset-preview-open-button"
                                type="button"
                                aria-label={t("assets.openPreview", { name: asset.name })}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  if (selectionMode) {
                                    toggleAssetSelection(asset.id);
                                  } else {
                                    openAssetPreview(asset.id);
                                  }
                                }}
                              >
                                {renderAssetPreview(asset, previewOptions)}
                              </button>
                            ) : (
                              renderAssetPreview(asset, previewOptions)
                            )}
                            <AssetPreviewBadges
                              asset={asset}
                              durationLabel={durationLabel}
                              resolutionLabel={resolutionLabel}
                            />
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
              {filteredAssets.length === 0 ? (
                canImport && assets.length === 0 ? (
                  <button className="asset-empty-state drop-empty" type="button" onClick={() => void handleChooseAssets()}>
                    <UploadCloud aria-hidden="true" />
                    <strong>{t("assets.emptyTitle")}</strong>
                    <span>{dropText === t("assets.defaultDropText") ? t("assets.emptyUploadDescription") : dropText}</span>
                  </button>
                ) : (
                  <div className="asset-empty-state">
                    {assets.length === 0 ? <UploadCloud aria-hidden="true" /> : <PackageSearch aria-hidden="true" />}
                    <strong>{assets.length === 0 ? t("assets.emptyTitle") : t("assets.emptyKindTitle", { kind: selectedFilterLabel })}</strong>
                    <span>{assets.length === 0 ? dropText : t("assets.emptyFilteredDescription")}</span>
                  </div>
                )
              ) : null}
            </div>
            <StoryboardMediaPreviewDialog
              assets={previewableAssets}
              currentIndex={assetPreviewIndex}
              projectId={projectId}
              stripLabel={t("assets.previewStrip")}
              title={t("assets.preview")}
              onClose={() => setAssetPreviewIndex(null)}
              onIndexChange={setAssetPreviewIndex}
            />
            {canImport ? (
              <div className={cn("asset-drop-overlay", isDraggingAssets && "visible")} aria-hidden="true">
                <UploadCloud />
                <strong>{t("assets.dropOverlayTitle")}</strong>
                <span>{projectName ? t("assets.dropToProject", { projectName }) : dropText}</span>
              </div>
            ) : null}
          </section>
        </div>
      </div>
      {selectedAssetCount > 0 ? (
        <AssetSelectionBar
          selectedCount={selectedAssetCount}
          onClearSelection={clearAssetSelection}
          onDeleteSelectedAssets={() => requestDeleteAssets(selectedAssetIds)}
          onDownloadSelectedAssets={() => void downloadSelectedAssets()}
        />
      ) : null}
      <AssetRenameDialog
        asset={renamingAsset}
        draftName={renameDraft}
        onChangeDraftName={setRenameDraft}
        onClose={() => {
          setRenamingAsset(null);
          setRenameDraft("");
        }}
        onConfirm={confirmRenameAsset}
      />
      <AssetDeleteConfirmationDialog
        isOpen={pendingDeleteAssetIds.length > 0}
        selectedCount={pendingDeleteAssetIds.length}
        onClose={() => setPendingDeleteAssetIds([])}
        onConfirm={() => void confirmDeleteAssets()}
      />
    </section>
  );
}

function AssetSelectionBar({
  selectedCount,
  onClearSelection,
  onDeleteSelectedAssets,
  onDownloadSelectedAssets
}: {
  selectedCount: number;
  onClearSelection: () => void;
  onDeleteSelectedAssets: () => void;
  onDownloadSelectedAssets: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="asset-selection-bar" aria-label={t("assets.selectedActions")}>
      <strong>{t("assets.selectedCount", { count: selectedCount })}</strong>
      <Button className="storyboard-selection-action" variant="outline" onPress={onDownloadSelectedAssets}>
        <Download aria-hidden="true" />
        <span>{t("assets.downloadSelected")}</span>
      </Button>
      <Button className="storyboard-selection-action destructive" variant="outline" onPress={onDeleteSelectedAssets}>
        <Trash2 aria-hidden="true" />
        <span>{t("assets.deleteSelected")}</span>
      </Button>
      <Button className="storyboard-selection-action" variant="outline" onPress={onClearSelection}>
        <X aria-hidden="true" />
        <span>{t("assets.cancelSelection")}</span>
      </Button>
    </div>
  );
}

function AssetRenameDialog({
  asset,
  draftName,
  onChangeDraftName,
  onClose,
  onConfirm
}: {
  asset: ProjectAsset | null;
  draftName: string;
  onChangeDraftName: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();

  useEffect(() => {
    if (!asset) return undefined;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [asset, onClose]);

  if (!asset || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="screen-confirmation-layer"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="project-delete-dialog screen-confirmation-dialog asset-rename-dialog" role="dialog" aria-modal="true" aria-labelledby="asset-rename-title">
        <header className="project-delete-header">
          <div className="project-delete-icon warning" aria-hidden="true">
            <Pencil />
          </div>
          <h2 className="project-delete-title" id="asset-rename-title">
            {t("assets.renameTitle")}
          </h2>
        </header>
        <div className="project-delete-body asset-rename-body">
          <p>{t("assets.renameDescription")}</p>
          <label className="asset-rename-field">
            <span>{t("assets.fileName")}</span>
            <Input autoFocus value={draftName} onChange={(event) => onChangeDraftName(event.target.value)} />
          </label>
        </div>
        <footer className="project-delete-actions">
          <Button className="project-delete-cancel" variant="outline" onPress={onClose}>
            {t("common.cancel")}
          </Button>
          <Button className="asset-rename-confirm" isDisabled={!draftName.trim()} variant="primary" onPress={onConfirm}>
            {t("common.save")}
          </Button>
        </footer>
      </section>
    </div>,
    document.body
  );
}

function AssetDeleteConfirmationDialog({
  isOpen,
  selectedCount,
  onClose,
  onConfirm
}: {
  isOpen: boolean;
  selectedCount: number;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();

  return (
    <ScreenConfirmationDialog
      cancelLabel={t("common.cancel")}
      confirmLabel={t("assets.deleteConfirmAction")}
      descriptions={[t("assets.deleteConfirmDescription")]}
      icon={<AlertTriangle />}
      idBase="asset-delete-confirmation"
      isOpen={isOpen}
      title={t("assets.deleteConfirmTitle", { count: selectedCount })}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}

function countAssetsByFilter(assets: ProjectAsset[], filter: AssetFilter) {
  if (filter === "all") return assets.length;
  return assets.filter((asset) => asset.kind === filter).length;
}

function sortAssetsByImportedAt(assets: ProjectAsset[]) {
  return assets
    .map((asset, index) => ({ asset, index }))
    .sort((left, right) => {
      const timeDiff = getAssetImportedTime(right.asset) - getAssetImportedTime(left.asset);
      return timeDiff || left.index - right.index;
    })
    .map((item) => item.asset);
}

function groupAssetsByImportDate(assets: ProjectAsset[], locale: InterfaceLanguage, t: Translator): AssetDateGroup[] {
  const groups = new Map<string, AssetDateGroup>();
  assets.forEach((asset) => {
    const date = parseAssetImportedDate(asset);
    const key = date ? getLocalDateKey(date) : "unknown";
    const label = date ? formatAssetGroupLabel(date, locale, t) : t("assets.group.unknown");
    const group = groups.get(key) ?? { key, label, assets: [] };
    group.assets.push(asset);
    groups.set(key, group);
  });
  return Array.from(groups.values());
}

function parseAssetImportedDate(asset: ProjectAsset): Date | null {
  const date = new Date(asset.importedAt);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getAssetImportedTime(asset: ProjectAsset) {
  return parseAssetImportedDate(asset)?.getTime() ?? 0;
}

function getLocalDateKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function getLocalDateOrdinal(date: Date) {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
}

function formatAssetGroupLabel(date: Date, locale: InterfaceLanguage, t: Translator) {
  const today = new Date();
  const dayDiff = getLocalDateOrdinal(today) - getLocalDateOrdinal(date);
  if (dayDiff <= 0) return t("assets.group.today");
  if (dayDiff === 1) return t("assets.group.yesterday");
  if (dayDiff === 2) return t("assets.group.twoDaysAgo");
  if (locale === "en") return date.toLocaleDateString(locale, { month: "short", day: "numeric" });
  return date.toLocaleDateString(locale, { month: "long", day: "2-digit" });
}

function useAssetDurationLabels(assets: ProjectAsset[]) {
  const [assetDurationLabels, setAssetDurationLabels] = useState<Record<string, string>>({});
  const [assetDimensions, setAssetDimensions] = useState<Record<string, VideoDimensions>>({});

  useEffect(() => {
    const assetIds = new Set(assets.map((asset) => asset.id));
    setAssetDurationLabels((currentLabels) => {
      const nextLabels = Object.fromEntries(Object.entries(currentLabels).filter(([assetId]) => assetIds.has(assetId)));
      return Object.keys(nextLabels).length === Object.keys(currentLabels).length ? currentLabels : nextLabels;
    });
    setAssetDimensions((currentDimensions) => {
      const nextDimensions = Object.fromEntries(Object.entries(currentDimensions).filter(([assetId]) => assetIds.has(assetId)));
      return Object.keys(nextDimensions).length === Object.keys(currentDimensions).length ? currentDimensions : nextDimensions;
    });
  }, [assets]);

  function updateAssetDimensions(assetId: string, width?: number, height?: number) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || Number(width) <= 0 || Number(height) <= 0) return;
    const dimensions = { width: Math.round(Number(width)), height: Math.round(Number(height)) };
    setAssetDimensions((currentDimensions) => {
      const current = currentDimensions[assetId];
      return current?.width === dimensions.width && current?.height === dimensions.height
        ? currentDimensions
        : { ...currentDimensions, [assetId]: dimensions };
    });
  }

  function updateAssetDurationLabel(assetId: string, duration: number, width?: number, height?: number) {
    const durationLabel = formatVideoDurationLabel(duration);
    if (durationLabel) {
      setAssetDurationLabels((currentLabels) => (currentLabels[assetId] === durationLabel ? currentLabels : { ...currentLabels, [assetId]: durationLabel }));
    }
    updateAssetDimensions(assetId, width, height);
  }

  return { assetDurationLabels, assetDimensions, updateAssetDimensions, updateAssetDurationLabel };
}

function AssetPreviewBadges({
  asset,
  durationLabel,
  resolutionLabel
}: {
  asset: ProjectAsset;
  durationLabel?: string | null;
  resolutionLabel?: string | null;
}) {
  if (asset.kind !== "image" && asset.kind !== "video") return null;
  if (!resolutionLabel && !durationLabel) return null;

  return (
    <span className="asset-preview-badges">
      {resolutionLabel ? (
        <span className="asset-preview-badge asset-resolution-tag" title={resolutionLabel}>
          {resolutionLabel}
        </span>
      ) : null}
      {asset.kind === "video" && durationLabel ? (
        <span className="asset-preview-badge asset-preview-duration" title={durationLabel}>
          {durationLabel}
        </span>
      ) : null}
    </span>
  );
}

function formatAssetResolutionLabel(asset: ProjectAsset, dimensions?: VideoDimensions): string | null {
  if (!dimensions) return null;
  if (asset.kind === "video") return getVideoResolutionLabel(dimensions.width, dimensions.height);
  if (asset.kind === "image") return `${dimensions.width}×${dimensions.height}`;
  return null;
}

function formatVideoDurationLabel(duration: number): string | null {
  if (!Number.isFinite(duration) || duration <= 0) return null;
  const totalSeconds = Math.max(0, Math.floor(duration));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

function renderAssetPreview(
  asset: ProjectAsset,
  options: {
    onImageMetadata?: (event: React.SyntheticEvent<HTMLImageElement>) => void;
    onVideoMetadata?: (event: React.SyntheticEvent<HTMLVideoElement>) => void;
  } = {}
) {
  if (asset.kind === "image") {
    return <img src={asset.previewUrl} alt={asset.name} loading="lazy" onLoad={options.onImageMetadata} />;
  }
  if (asset.kind === "video") {
    return <video src={asset.previewUrl} poster={asset.posterUrl ?? undefined} muted playsInline preload="metadata" onLoadedMetadata={options.onVideoMetadata} />;
  }
  if (asset.kind === "audio") {
    return (
      <div className="asset-audio-preview">
        <FileAudio aria-hidden="true" />
        <audio src={asset.previewUrl} controls preload="metadata" />
      </div>
    );
  }
  return <span className={cn("asset-thumb", asset.kind)}>{getAssetIcon(asset.kind)}</span>;
}

function getAssetKindLabel(kind: AssetKind, t: Translator) {
  if (kind === "image") return t("assetKind.image");
  if (kind === "video") return t("assetKind.video");
  if (kind === "audio") return t("assetKind.audio");
  if (kind === "archive") return t("assetKind.archive");
  if (kind === "document") return t("assetKind.document");
  return t("assetKind.other");
}

function formatProjectDate(value: string, t?: Translator) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t?.("common.justNow") ?? fallbackTranslator("common.justNow");
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function getAssetIcon(kind: AssetKind) {
  if (kind === "image") return <FileImage aria-hidden="true" />;
  if (kind === "video") return <FileVideo aria-hidden="true" />;
  if (kind === "audio") return <FileAudio aria-hidden="true" />;
  if (kind === "archive") return <FileArchive aria-hidden="true" />;
  if (kind === "document") return <FileText aria-hidden="true" />;
  return <FileIcon aria-hidden="true" />;
}

function WorkspaceTabs({ value, onChange }: { value: WorkspaceTab; onChange: (value: WorkspaceTab) => void }) {
  const { t } = useI18n();

  return (
    <Tabs
      className="workspace-tabs-root"
      selectedKey={value}
      onSelectionChange={(nextValue) => onChange(nextValue as WorkspaceTab)}
      variant="primary"
    >
      <Tabs.ListContainer className="workspace-tabs-container">
        <Tabs.List aria-label={t("workspace.tabsLabel")} className="workspace-tabs-list">
          {tabItems.map((item) => (
            <Tabs.Tab className={cn("workspace-tab-trigger", `onboarding-workspace-tab-${item.value}`)} id={item.value} key={item.value}>
              {item.icon}
              {t(item.labelKey)}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs.ListContainer>
    </Tabs>
  );
}

function CreateModal({ title, children, closeDisabled = false, onClose }: { title: string; children: React.ReactNode; closeDisabled?: boolean; onClose: () => void }) {
  const { t } = useI18n();

  return (
    <div className="create-project-modal-backdrop">
      <section className="create-project-modal onboarding-create-dialog-target" role="dialog" aria-modal="true" aria-labelledby="create-title">
        <button className="create-project-modal-close" type="button" disabled={closeDisabled} onClick={onClose} aria-label={t("common.close")}>
          <X aria-hidden="true" />
        </button>
        <h2 id="create-title">{title}</h2>
        {children}
      </section>
    </div>
  );
}

function TextField({
  label,
  required,
  className,
  ...props
}: React.ComponentProps<typeof Input> & { label: string; required?: boolean }) {
  return (
    <label className={cn("create-project-field", className)}>
      <span>
        {required ? <strong>*</strong> : null}
        {label}
      </span>
      <Input className="create-project-input" {...props} />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  placeholder,
  onValueChange,
  className,
  display = "default"
}: {
  label: string;
  value: string;
  options: SelectOption[];
  placeholder?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  display?: "default" | "icon-grid";
}) {
  const selectedOption = options.find((option) => option.value === value);
  const iconGrid = display === "icon-grid";

  return (
    <div className={cn("create-project-field", iconGrid && "icon-grid-field", className)}>
      <span>{label}</span>
      <HeroSelect
        aria-label={label}
        className={cn("create-project-select", iconGrid && "icon-grid")}
        value={value || null}
        onChange={(key) => {
          if (key) onValueChange?.(String(key));
        }}
      >
        <HeroSelect.Trigger className="create-project-select-trigger">
          <HeroSelect.Value className={cn("create-project-select-value", !selectedOption && "placeholder")}>
            {selectedOption ? (
              <span className={cn("create-project-select-value-content", iconGrid && "icon-only")}>
                {selectedOption.icon}
                <span className="create-project-select-trigger-label">{selectedOption.label}</span>
              </span>
            ) : (
              placeholder
            )}
          </HeroSelect.Value>
          <HeroSelect.Indicator>
            <ChevronDown aria-hidden="true" />
          </HeroSelect.Indicator>
        </HeroSelect.Trigger>
        <HeroSelect.Popover className={cn("create-project-select-popover", iconGrid && "icon-grid")} placement="bottom">
          <ListBox className={cn("create-project-select-listbox", iconGrid && "icon-grid")}>
            {options.map((option) => (
              <ListBoxItem id={option.value} key={option.value} textValue={option.label}>
                {option.icon}
                <span className={cn("create-project-select-option-label", iconGrid && "sr-only")}>{option.label}</span>
                <span className={cn("create-project-select-option-check", option.value === value && "visible")}>
                  <Check aria-hidden="true" />
                </span>
              </ListBoxItem>
            ))}
          </ListBox>
        </HeroSelect.Popover>
      </HeroSelect>
    </div>
  );
}
