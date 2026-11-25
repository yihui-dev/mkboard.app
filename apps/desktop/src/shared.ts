export type WorkspaceTab = "script" | "storyboard" | "assets";
export type InterfaceLanguage = "zh-CN" | "zh-TW" | "en";
export const imageRatioValues = ["16:9", "9:16", "3:4", "4:3"] as const;
export type ImageRatio = (typeof imageRatioValues)[number];
export const projectCoverRatioValues = ["16:9", "4:3", "3:4", "9:16", "1:1"] as const;
export type ProjectCoverRatio = (typeof projectCoverRatioValues)[number];
export const seedanceAspectRatioValues = ["1:1", "4:3", "3:4", "16:9", "9:16", "21:9"] as const;
export type SeedanceAspectRatio = (typeof seedanceAspectRatioValues)[number];
export type ProjectKind = "user" | "tutorial";
export const hyperframesVideoResolutionValues = ["1080p", "2k", "4k"] as const;
export type HyperframesVideoResolution = (typeof hyperframesVideoResolutionValues)[number];
export const seedanceVideoResolutionValues = ["720p", "1080p"] as const;
export type SeedanceVideoResolution = (typeof seedanceVideoResolutionValues)[number];
export type AssetKind = "image" | "video" | "audio" | "archive" | "document" | "other";
export type ProjectExportKind = "storyboard-csv" | "storyboard-assets-zip" | "all-assets-zip";
export type StoryboardColumnId = "sort" | "shot" | "image" | "scene" | "duration" | "content" | "note" | `custom-${number}`;
export type StoryboardColumnType = "text" | "select" | "number" | "image";
export type CodexCliConnectionState = "checking" | "connected" | "needs_auth" | "not_installed" | "error";
export type AgentRunStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";
export type AgentCliId = string;
export type AgentModelPreset = {
  id: string;
  label: string;
  description?: string;
};
export type AgentEffortLevel = "low" | "medium" | "high";
export type AgentPermissionMode = "supervised" | "auto-apply";
export const defaultAgentConversationTitle = "__mkboard_default_agent_conversation_title__";
export const legacyDefaultAgentConversationTitles = ["新对话", "新對話", "New chat", defaultAgentConversationTitle] as const;
export type LocalCliAgentRole = "agent" | "dependency";
export type LocalCliDiagnosticState = "passed" | "warning" | "failed";
export type LocalCliInstallStep =
  | string
  | {
      text: string;
      linkLabel?: string;
      linkUrl?: string;
      linkTitle?: string;
    };
export type SkillScope = "system" | "user";
export type TasteScope = "system" | "user";
export const defaultSkillIconId = "file-text";
export const defaultSkillGradientId = "mist-slate";
export const defaultSystemSkillIconId = "lock";
export const defaultSystemSkillGradientId = "mist-amber";
export const STORYBOARD_MEDIA_SELECTION_TOUCHED_FIELD = "storyboardMediaSelectionTouched";
export const PROMPT_PREVIEW_IMAGE_ASSET_ID_FIELD = "promptPreviewImageAssetId";
export const PROMPT_PREVIEW_VIDEO_ASSET_ID_FIELD = "promptPreviewVideoAssetId";
export const PROMPT_PREVIEW_IMAGE_HIDDEN_FIELD = "promptPreviewImageHidden";
export const PROMPT_PREVIEW_VIDEO_HIDDEN_FIELD = "promptPreviewVideoHidden";

const MKBOARD_R2_ASSET_HOSTS = new Set(["static.mkboard.app", "assets.mkboard.app"]);
export const MKBOARD_R2_IMAGE_QUALITY = "85";
const MKBOARD_R2_VIDEO_OPTIMIZE_QUERY_KEY = "optimize";
const MKBOARD_R2_VIDEO_OPTIMIZE_QUERY_VALUE = "video";

/**
 * Append Cloudflare R2 image-optimization params to an mkboard CDN image URL.
 * Host-gated so external/local URLs pass through untouched.
 */
export function withMkboardR2ImageQuality(imageUrl: string): string {
  if (!imageUrl) return "";
  try {
    const url = new URL(imageUrl);
    if (!MKBOARD_R2_ASSET_HOSTS.has(url.hostname)) return imageUrl;
    url.searchParams.set("quality", MKBOARD_R2_IMAGE_QUALITY);
    return url.toString();
  } catch {
    return imageUrl;
  }
}

/**
 * Append the R2 video-optimization flag to an mkboard CDN video URL.
 * Host-gated so external/local URLs pass through untouched.
 */
export function withMkboardR2VideoOptimization(videoUrl: string): string {
  if (!videoUrl) return "";
  try {
    const url = new URL(videoUrl);
    if (!MKBOARD_R2_ASSET_HOSTS.has(url.hostname)) return videoUrl;
    url.searchParams.set(MKBOARD_R2_VIDEO_OPTIMIZE_QUERY_KEY, MKBOARD_R2_VIDEO_OPTIMIZE_QUERY_VALUE);
    return url.toString();
  } catch {
    return videoUrl;
  }
}

export function isCodexChatGptWebsocketForbiddenMessage(message: string): boolean {
  return /(?:unexpected status\s+)?403 Forbidden/iu.test(message) && /chatgpt\.com\/backend-api\/codex\/responses|cf-ray:|<!DOCTYPE html>/iu.test(message);
}

export function isAgentNetworkFailureMessage(message: string): boolean {
  return (
    isCodexChatGptWebsocketForbiddenMessage(message) ||
    /fetch failed|failed to fetch|load failed|\bnetwork\b|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|ConnectionRefused|connection refused|socket hang up|origin_response_timeout|Error 524|status["']?\s*:\s*524\b|\b524\b.*timeout|timeout.*\b524\b/iu.test(
      message
    )
  );
}

export function normalizeHyperframesVideoResolution(input: unknown): HyperframesVideoResolution {
  if (input === "2k" || input === "2K") return "2k";
  if (input === "4k" || input === "4K") return "4k";
  return "1080p";
}

export function normalizeSeedanceVideoResolution(input: unknown): SeedanceVideoResolution {
  return input === "1080p" ? "1080p" : "720p";
}

export function normalizeImageRatio(input: unknown): ImageRatio {
  return imageRatioValues.includes(input as ImageRatio) ? (input as ImageRatio) : "16:9";
}

export function normalizeProjectCoverRatio(input: unknown): ProjectCoverRatio {
  return projectCoverRatioValues.includes(input as ProjectCoverRatio) ? (input as ProjectCoverRatio) : "16:9";
}

export function suggestProjectCoverRatio(width: number, height: number): ProjectCoverRatio {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return "16:9";
  }
  const actual = width / height;
  const candidates: Array<{ ratio: ProjectCoverRatio; value: number }> = [
    { ratio: "16:9", value: 16 / 9 },
    { ratio: "4:3", value: 4 / 3 },
    { ratio: "1:1", value: 1 },
    { ratio: "3:4", value: 3 / 4 },
    { ratio: "9:16", value: 9 / 16 }
  ];
  let best = candidates[0]!;
  let minLogDiff = Math.abs(Math.log(actual / best.value));
  for (let i = 1; i < candidates.length; i += 1) {
    const diff = Math.abs(Math.log(actual / candidates[i]!.value));
    if (diff < minLogDiff) {
      minLogDiff = diff;
      best = candidates[i]!;
    }
  }
  return best.ratio;
}

export function isSeedanceAspectRatio(input: unknown): input is SeedanceAspectRatio {
  return seedanceAspectRatioValues.includes(input as SeedanceAspectRatio);
}

export function seedanceVideoCreditsPerSecond(input: unknown): number {
  return normalizeSeedanceVideoResolution(input) === "1080p" ? 100 : 50;
}

export function hyperframesVideoDimensionsFromAspectRatio(
  aspectRatio: string,
  resolution: HyperframesVideoResolution = "1080p"
): { width: number; height: number } {
  const shortSideByResolution: Record<HyperframesVideoResolution, number> = {
    "1080p": 1080,
    "2k": 1440,
    "4k": 2160
  };
  const shortSide = shortSideByResolution[normalizeHyperframesVideoResolution(resolution)];

  if (aspectRatio === "9:16") return { width: shortSide, height: Math.round((shortSide * 16) / 9) };
  if (aspectRatio === "4:3") return { width: Math.round((shortSide * 4) / 3), height: shortSide };
  if (aspectRatio === "3:4") return { width: shortSide, height: Math.round((shortSide * 4) / 3) };
  return { width: Math.round((shortSide * 16) / 9), height: shortSide };
}

export type AgentEvent =
  | { kind: "status"; label: string; detail?: string }
  | { kind: "text"; text: string }
  | { kind: "thinking"; text: string }
  | { kind: "tool_use"; id: string; name: string; input?: unknown }
  | { kind: "tool_result"; toolUseId: string; content: string; isError: boolean }
  | { kind: "usage"; inputTokens?: number; outputTokens?: number; cachedInputTokens?: number; reasoningOutputTokens?: number; durationMs?: number }
  | { kind: "error"; message: string; raw?: string }
  | { kind: "raw"; line: string };

export type AgentOperationConfirmationStatus = "pending" | "applying" | "confirmed" | "canceled" | "failed";

export type LocalCliAgent = {
  id: string;
  name: string;
  command: string;
  role?: LocalCliAgentRole;
  installed: boolean;
  version?: string;
  path?: string;
  connectionState?: CodexCliConnectionState;
  connectionLabel?: string;
  connectionDetail?: string;
  diagnostics?: LocalCliDiagnostic[];
  installCommand?: string;
  loginCommand?: string;
  installSteps?: LocalCliInstallStep[];
  setupHint?: string;
  autoSetup?: string;
  installUrl?: string;
  docsUrl?: string;
  guideUrl?: string;
  models?: AgentModelPreset[];
  supportsEffort?: boolean;
};

export type LocalCliDiagnostic = {
  state: LocalCliDiagnosticState;
  label: string;
  detail?: string;
};

export type ProjectCoverPreview = {
  kind: "custom-cover" | "broll-image" | "video-first-frame";
  url: string;
  ratio?: ProjectCoverRatio | null;
  videoUrl?: string | null;
  fallbackUrl?: string | null;
  isRemoteVideo?: boolean;
  shotNumber?: string | null;
  scene?: string | null;
};

export type PickedProjectCoverFile = {
  filePath?: string | null;
  fileName: string;
  previewDataUrl: string;
  width: number;
  height: number;
  suggestedRatio: ProjectCoverRatio;
};

export type ProjectSummary = {
  id: string;
  kind: ProjectKind;
  name: string;
  icon: string;
  templateId: string;
  tasteId: string;
  imageRatio: ImageRatio;
  localPath: string;
  cloudProjectId?: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
  deletedAt?: string | null;
  coverImageUrl?: string | null;
  coverImageRatio?: ProjectCoverRatio | null;
  coverPreview?: ProjectCoverPreview | null;
  shotCount?: number;
  bRollCount?: number;
  videoCount?: number;
};

export type StoryboardColumn = {
  id: StoryboardColumnId;
  label: string;
  type: StoryboardColumnType;
  visible: boolean;
  locked?: boolean;
  custom?: boolean;
};

export type StoryboardTemplateLanguage = "zh" | "en";
export type StoryboardPromptColumnKind = "imagePrompt" | "videoPrompt" | "generationMethod";

export type StoryboardColumnWidths = Partial<Record<StoryboardColumnId, number>>;

export type StoryboardRow = {
  id: string;
  shot: string;
  scene: string;
  duration: string;
  content: string;
  note: string;
  imageAssetIds?: string[];
  /** @deprecated use imageAssetIds for multi-media storyboard cells. */
  imageAssetId?: string | null;
  customValues?: Record<string, string>;
};

export type ProjectAsset = {
  id: string;
  name: string;
  kind: AssetKind;
  sizeLabel: string;
  localPath: string;
  indexedPath: string;
  previewUrl: string;
  posterUrl?: string | null;
  linkedShotId?: string | null;
  linkedShot: string;
  importedAt: string;
};

export type VideoDimensions = {
  width: number;
  height: number;
};

export function getVideoResolutionLabel(width: number, height: number): string | null {
  const shortEdge = Math.min(normalizeVideoDimension(width), normalizeVideoDimension(height));
  if (shortEdge <= 0) return null;
  if (shortEdge >= 2160) return "4K";
  if (shortEdge >= 1800) return "3K";
  if (shortEdge >= 1440) return "2K";
  if (shortEdge >= 1080) return "1080p";
  if (shortEdge >= 720) return "720p";
  return `${shortEdge}p`;
}

function normalizeVideoDimension(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

export type AgentMessageAttachment = Pick<ProjectAsset, "id" | "name" | "kind" | "previewUrl">;

export type Skill = {
  id: string;
  name: string;
  description: string;
  content: string;
  iconId: string;
  gradientId: string;
  scope: SkillScope;
  locked: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProjectSkill = Skill;

export type TastePreview = {
  background: string;
  foreground: string;
  accent: string;
};

export type Taste = {
  id: string;
  name: string;
  description: string;
  content: string;
  sourceUrl: string;
  preview: TastePreview;
  scope: TasteScope;
  locked: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProjectTaste = Taste;

export type ProjectTemplateScope = "system" | "user";

export type ProjectTemplate = {
  id: string;
  name: string;
  description: string;
  scope: ProjectTemplateScope;
  columns: StoryboardColumn[];
  storyboardSkillId: string;
  storyboardSkillName: string;
  createdAt: string;
  updatedAt: string;
};

export type UpdateProjectInput = {
  id: string;
  name: string;
  icon?: string;
  templateId?: string;
  tasteId?: string;
  imageRatio?: ImageRatio;
  storyboardSkillId?: string;
  coverImageSourcePath?: string | null;
  coverImageDataUrl?: string | null;
  coverImageRatio?: ProjectCoverRatio;
  clearCoverImage?: boolean;
  interfaceLanguage?: InterfaceLanguage;
};

export type UpdateProjectCoverInput = {
  projectId: string;
  coverImageSourcePath?: string | null;
  coverImageDataUrl?: string | null;
  coverImageRatio?: ProjectCoverRatio;
  clearCoverImage?: boolean;
  interfaceLanguage?: InterfaceLanguage;
};

export type UpdateProjectCoverResult = {
  projects: ProjectSummary[];
  detail: ProjectDetail;
};

export type AgentMessage = {
  id: string;
  conversationId?: string;
  role: "assistant" | "user";
  content: string;
  createdAt: string;
  attachments?: AgentMessageAttachment[];
  events?: AgentEvent[];
  runStatus?: AgentRunStatus;
  clientRunId?: string;
  agentCliId?: AgentCliId;
  operationConfirmation?: AgentOperationConfirmation;
};

export type AgentConversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  hasUnreadCompletion: boolean;
};

export type AgentConversationDetail = {
  conversations: AgentConversation[];
  activeConversationId: string;
  messages: AgentMessage[];
};

export type ProjectDetail = {
  project: ProjectSummary;
  scriptHtml: string;
  rows: StoryboardRow[];
  columns: StoryboardColumn[];
  imageRatio: ImageRatio;
  assets: ProjectAsset[];
  storyboardSkill: ProjectSkill;
  taste: ProjectTaste;
  agentConversations: AgentConversation[];
  activeAgentConversationId: string;
  agentMessages: AgentMessage[];
};

export type CreateProjectInput = {
  name: string;
  icon: string;
  templateId: string;
  tasteId: string;
  imageRatio?: ImageRatio;
  storyboardSkillId?: string;
  coverImageSourcePath?: string | null;
  coverImageDataUrl?: string | null;
  coverImageRatio?: ProjectCoverRatio;
  interfaceLanguage?: InterfaceLanguage;
};

export type CreateProjectTemplateInput = {
  name: string;
  description: string;
  columns: StoryboardColumn[];
  storyboardSkillId: string;
  interfaceLanguage?: InterfaceLanguage;
};

export type UpdateProjectTemplateInput = CreateProjectTemplateInput & {
  id: string;
};

export type CreateSkillInput = {
  name: string;
  description: string;
  content: string;
  iconId?: string;
  gradientId?: string;
};

export type UpdateSkillInput = CreateSkillInput & {
  id: string;
};

export const DEFAULT_AUTO_TASTE_ID = "taste-auto-adaptive";

export type CreateTasteInput = {
  name: string;
  description: string;
  content: string;
  sourceUrl?: string;
  preview?: Partial<TastePreview>;
};

export type UpdateTasteInput = CreateTasteInput & {
  id: string;
};

export type ExternalSourceImportInput = {
  sourceType: "github" | "local" | "zip";
  urlOrPath: string;
  name?: string;
  description?: string;
  existingId?: string;
  installToAgentSkills?: boolean;
};

export type SkillryPackId = "bs-creatormotion" | "bs-launchmotion";
export type SkillryPackPricingTier = "freemium_pro" | "paid_pro";

export type SkillryVisualThemeItem = {
  id: string;
  packSlug: SkillryPackId;
  nameZh: string;
  nameEn: string;
  descriptionZh: string;
  descriptionEn: string;
  swatches: string[];
  previewVideoUrl: string;
  posterUrl: string;
  tasteRules: string;
};

export type SkillrySubEffectItem = {
  slug: string;
  packSlug: SkillryPackId;
  effectId: string;
  category: string;
  name: string;
  description: string;
  priceUsdCents: number;
  posterUrl: string;
  previewVideoUrl: string;
  installedLocally: boolean;
  syncedToMkboard: boolean;
  skillPageUrl: string;
};

export type SkillryAccountState = {
  connected: boolean;
  email: string | null;
  name: string | null;
  entitlement: "free" | "premium" | "unknown";
  quotaRemaining: number | null;
  quotaLimit: number | null;
};

export type SkillryDeviceAuthSession = {
  status: "pending" | "connected" | "denied" | "expired" | "not_started" | "error";
  userCode?: string;
  verificationUrl?: string;
  pollAfterSeconds?: number;
  expiresAt?: string;
  account?: SkillryAccountState;
  message?: string;
};

export type SkillryAccessCheckResult = {
  slug: string;
  connected: boolean;
  canDownload: boolean;
  access: "free" | "member" | "purchased" | "purchase_required" | "unauthenticated" | "error";
  reason: "purchase_required" | "daily_download_limit" | "unauthenticated" | "network_error" | null;
  isMembersOnlyBundle: boolean;
  priceUsdCents: number;
  purchaseUrl: string | null;
  pricingUrl: string;
  installedLocally: boolean;
  account: SkillryAccountState;
  message?: string;
};

export type SkillryPackStatus = {
  slug: SkillryPackId;
  mkboardSkillId: string;
  title: string;
  subtitle: string;
  pricingTier: SkillryPackPricingTier;
  totalEffectsCount: number;
  freeEffectsCount: number;
  installedLocally: boolean;
  installedMasterLocally: boolean;
  installedSubSkillCount: number;
  installedPaths: string[];
  syncedToMkboard: boolean;
  landingUrl: string;
  skillPageUrl: string;
  installDocUrl: string;
  pricingUrl: string;
  heroVideoUrl: string;
  heroPosterUrl: string;
  featuredPosters: string[];
  categoryTagsZh: string[];
  categoryTagsEn: string[];
  themes: SkillryVisualThemeItem[];
  aiInstallPrompt: string;
  cliInstallCommand: string;
};

export type SkillryCollectionDetail = {
  pack: SkillryPackStatus;
  categories: Array<{ id: string; labelZh: string; labelEn: string; count: number }>;
  items: SkillrySubEffectItem[];
  source: "live" | "fallback";
};

export type SkillryCatalogStatus = {
  cliLoggedIn: boolean;
  cliAccountEmail?: string | null;
  cliAccountHandle?: string | null;
  account: SkillryAccountState;
  npmAvailable?: boolean;
  bundledCliAvailable?: boolean;
  packs: SkillryPackStatus[];
};

export type SkillryInstallInput = {
  slug: string;
  mode?: "npm" | "cli" | "ai-agent";
  agentCliId?: AgentCliId;
  skipPreflight?: boolean;
};

export type SkillryInstallResult = {
  status: "installed" | "needs_entitlement" | "needs_login" | "failed";
  slug: string;
  skill?: Skill;
  installedPaths?: string[];
  actionUrl?: string;
  purchaseUrl?: string | null;
  pricingUrl?: string;
  landingUrl?: string;
  isMembersOnlyBundle?: boolean;
  priceUsdCents?: number;
  logs?: string;
  message: string;
  catalog?: SkillryCatalogStatus;
};

export type UpdateShotInput = {
  id: string;
  field:
    | "scene"
    | "duration"
    | "content"
    | "note"
    | "aRollSampleHidden"
    | typeof PROMPT_PREVIEW_IMAGE_ASSET_ID_FIELD
    | typeof PROMPT_PREVIEW_VIDEO_ASSET_ID_FIELD
    | typeof PROMPT_PREVIEW_IMAGE_HIDDEN_FIELD
    | typeof PROMPT_PREVIEW_VIDEO_HIDDEN_FIELD
    | typeof STORYBOARD_MEDIA_SELECTION_TOUCHED_FIELD
    | StoryboardColumnId;
  value: string;
};

export type AgentRowRef = { kind: "id"; value: string } | { kind: "index"; value: number };

export type AgentShotCellUpdate = {
  field: UpdateShotInput["field"] | string;
  value: string;
};

export type AgentInsertedShot = {
  scene?: string;
  duration?: string;
  content?: string;
  note?: string;
  imageAssetIds?: string[];
  customValues?: Record<string, string>;
};

export type AgentOperation =
  | { type: "update_script"; scriptHtml: string }
  | { type: "sync_script_a_roll_tags"; scriptHtml: string }
  | { type: "parse_storyboard"; overwriteExisting: boolean }
  | { type: "update_shot_cells"; rowRef: AgentRowRef; cells: AgentShotCellUpdate[] }
  | { type: "insert_shots"; rowRef?: AgentRowRef; placement?: "before" | "after" | "end"; count: number; rows?: AgentInsertedShot[] }
  | { type: "delete_shots"; rowRefs: AgentRowRef[] }
  | { type: "duplicate_shots"; rowRefs: AgentRowRef[] }
  | { type: "reorder_shot"; rowRef: AgentRowRef; targetRowRef: AgentRowRef; placement: "before" | "after" }
  | { type: "update_shot_media"; rowRef: AgentRowRef; assetIds: string[] }
  | {
      type: "regenerate_media";
      rowRefs: AgentRowRef[];
      kind: "image" | "video";
      overwriteExisting: boolean;
      provider?: "dreamina_cli";
      aspectRatio?: SeedanceAspectRatio;
    };

export type DreaminaAgentRegenerateMediaOperation = Extract<AgentOperation, { type: "regenerate_media" }> & {
  provider: "dreamina_cli";
};

export type AgentOperationConfirmation = {
  id: string;
  clientRunId: string;
  projectId: string;
  conversationId: string;
  operations: AgentOperation[];
  userMessage: string;
  rows: StoryboardRow[];
  createdAt: string;
  status: AgentOperationConfirmationStatus;
  error?: string;
};

export type AgentRequest = {
  projectId: string;
  conversationId?: string;
  tab: WorkspaceTab;
  message: string;
  agentCliId?: AgentCliId;
  model?: string;
  effort?: AgentEffortLevel;
  permissionMode?: AgentPermissionMode;
  interfaceLanguage?: InterfaceLanguage;
  clientRunId?: string;
  attachmentAssetIds?: string[];
};

export type ExecuteConfirmedDreaminaAgentGenerationInput = {
  projectId: string;
  clientRunId: string;
  agentCliId: AgentCliId;
  interfaceLanguage?: InterfaceLanguage;
  userMessage: string;
  operations: DreaminaAgentRegenerateMediaOperation[];
};

export type GenerateStoryboardInput = {
  projectId: string;
  agentCliId?: AgentCliId;
  interfaceLanguage?: InterfaceLanguage;
  conversationId?: string;
  clientRunId?: string;
  clientStartedAt?: number;
  userMessage?: string;
};

export type ActiveStoryboardParseRun = {
  projectId: string;
  clientRunId: string;
  conversationId: string;
  assistantMessageId: string;
  startedAt: number;
};

export type AgentResponse = {
  reply: string;
  scriptHtml?: string;
  rows?: StoryboardRow[];
  operations?: AgentOperation[];
  appliedOperations?: AgentOperation[];
  pendingOperations?: AgentOperation[];
  error?: string;
  runStatus?: AgentRunStatus;
};

export type ApplyAgentOperationsResult = {
  project: ProjectDetail;
  appliedOperations: AgentOperation[];
  summary: string;
};

export type AgentStreamEvent = {
  projectId: string;
  conversationId: string;
  clientRunId: string;
  assistantMessageId: string;
  event: AgentEvent;
};

export type AgentConversationTitleEvent = {
  projectId: string;
  conversationId: string;
  activeConversationId: string;
  conversations: AgentConversation[];
};

export type ShotMediaUpdateResult = {
  rows: StoryboardRow[];
  assets: ProjectAsset[];
};

export type AssetDownloadResult = {
  copiedCount: number;
  directory: string | null;
};

export type ProjectExportResult = {
  canceled: boolean;
  filePath: string | null;
  fileName: string | null;
  exportedCount: number;
};

export type CodexCliStatus = {
  state: CodexCliConnectionState;
  label: string;
  detail?: string;
  path?: string;
  version?: string;
};

export type CloudApiErrorPayload = {
  code: string;
  message: string;
  details?: unknown;
};

export type CloudApiResult<T> = { ok: true; data: T } | { ok: false; error: CloudApiErrorPayload };

export type ByokProviderId = "kie" | "openai" | "gemini" | "elevenlabs" | "stub";
export type ByokImageProviderId = "kie" | "openai" | "gemini" | "stub";
export type ByokVideoProviderId = "kie";

export type ByokProviderStatus = {
  id: ByokProviderId;
  name: string;
  category: "image_video" | "image" | "voice" | "offline";
  configured: boolean;
  source: "env" | "stored" | "builtin" | "unset";
  maskedKey: string | null;
  envVarName: string;
  baseUrl: string;
  model: string;
  docsUrl: string;
  updatedAt: string | null;
};

export type ByokSettingsSnapshot = {
  activeImageProvider: ByokImageProviderId;
  activeVideoProvider: ByokVideoProviderId;
  providers: ByokProviderStatus[];
};

export type ByokSaveInput = {
  providerId: ByokProviderId;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  activeImageProvider?: ByokImageProviderId;
  activeVideoProvider?: ByokVideoProviderId;
};

export type ByokTestResult = {
  ok: boolean;
  providerId: ByokProviderId;
  latencyMs: number;
  message: string;
};

export type CompanionAccessMode = "off" | "local-only" | "network-accessible";

export type CompanionEndpoint = {
  label: string;
  kind: "loopback" | "lan" | "tailscale";
  url: string;
  pairingUrl: string;
};

export type CompanionServerStatus = {
  running: boolean;
  mode: CompanionAccessMode;
  port: number;
  tokenPreview: string;
  mcpHttpUrl: string | null;
  endpoints: CompanionEndpoint[];
  primaryPairingUrl: string | null;
  qrSvg: string | null;
  connectedClients: number;
  error?: string;
};

export type DesktopVersionCheckResult = {
  status: "idle" | "checking" | "current" | "update_available" | "downloading" | "update_downloaded" | "installing" | "unavailable";
  currentVersion: string;
  latestVersion: string | null;
  downloadUrl: string;
  updateAvailable: boolean;
  checkedAt: string | null;
  downloadProgress: {
    percent: number;
    bytesPerSecond: number;
    transferred: number;
    total: number;
  } | null;
  installBlocked: boolean;
  message?: string;
};

export type StoryboardCloudGenerationTarget = {
  rowId: string;
  prompt: string;
  aspectRatio?: string;
};

export type StoryboardImageBatchInput = {
  projectId: string;
  overwriteExisting: boolean;
  items: StoryboardCloudGenerationTarget[];
};

export type StoryboardImageTaskSummary = {
  taskId: string;
  batchId?: string | null;
  rowId: string | null;
  status: string;
  providerTaskId?: string | null;
  resultUrl?: string | null;
  resultAssetId?: string | null;
  errorMessage?: string | null;
  canRetryDelivery?: boolean;
  localDeliveryFailed?: boolean;
  deliveryAttempts?: number;
  localDeliveryAttemptCount?: number;
  creditsReserved: number;
  createdAt?: string;
  updatedAt?: string;
};

export type StoryboardImageBatchResult = {
  batchId: string;
  cloudProjectId: string;
  targetCount: number;
  creditsRequired: number;
  creditsReserved: number;
  submittedCount: number;
  failedCount: number;
  tasks: StoryboardImageTaskSummary[];
};

export type StoryboardImageBatchSyncInput = {
  projectId: string;
  cloudProjectId: string;
  batchId: string;
  overwriteExisting: boolean;
};

export type StoryboardImageBatchSyncResult = ShotMediaUpdateResult & {
  batchId: string;
  importedCount: number;
  localAvailableCount: number;
  localImportFailedCount: number;
  pendingCount: number;
  failedCount: number;
  succeededCount: number;
  tasks: StoryboardImageTaskSummary[];
};

export type StoryboardVideoGenerationMethod = "Seedance 2.0" | "Hyperframes";

export type StoryboardVideoGenerationStage =
  | "queued"
  | "agent"
  | "project"
  | "studio"
  | "runtime"
  | "cli"
  | "lint"
  | "validate"
  | "inspect"
  | "repair"
  | "render"
  | "import"
  | "done";

export type StoryboardVideoGenerationProgress = {
  stage?: StoryboardVideoGenerationStage;
  stageLabel?: string;
  stageDetail?: string;
  cliLog?: string;
  studioUrl?: string;
  autoOpenStudio?: boolean;
  workDir?: string;
};

export type HyperframesStudioOpenInput = {
  studioUrl?: string;
  workDir?: string;
};

export type StoryboardActiveVideoGenerationTask = {
  taskId?: string;
  batchId?: string | null;
  rowId: string;
  method: StoryboardVideoGenerationMethod;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  provider?: string;
  providerTaskId?: string | null;
  assetId?: string;
  fileName?: string;
  errorMessage?: string;
  canRetryDelivery?: boolean;
  localDeliveryFailed?: boolean;
  deliveryAttempts?: number;
  localDeliveryAttemptCount?: number;
  startedAt?: string;
  finishedAt?: string;
  createdAt?: string;
  updatedAt?: string;
} & StoryboardVideoGenerationProgress;

export type StoryboardActiveVideoGenerations = {
  rowIds: string[];
  tasks: StoryboardActiveVideoGenerationTask[];
};

export type StoryboardVideoGenerationTarget = {
  rowId: string;
  method: StoryboardVideoGenerationMethod;
  prompt: string;
  durationSec?: number;
  aspectRatio?: string;
  hyperframesResolution?: HyperframesVideoResolution;
  seedanceResolution?: SeedanceVideoResolution;
};

export type StoryboardVideoFirstFrameInput = {
  fileName?: string;
  mimeType?: string;
  dataBase64?: string;
};

export type StoryboardCloudVideoGenerationTarget = {
  rowId: string;
  prompt: string;
  durationSec?: number;
  aspectRatio?: string;
  resolution?: SeedanceVideoResolution;
  firstFrame?: StoryboardVideoFirstFrameInput | null;
};

export type StoryboardVideoBatchInput = {
  projectId: string;
  overwriteExisting: boolean;
  agentCliId?: AgentCliId;
  hyperframesConcurrency?: number;
  items: StoryboardVideoGenerationTarget[];
};

export type StoryboardVideoTaskSummary = {
  taskId?: string;
  batchId?: string | null;
  rowId: string;
  method: StoryboardVideoGenerationMethod;
  status: "queued" | "running" | "succeeded" | "failed" | "delivery_failed" | "cancelled";
  provider?: string;
  providerTaskId?: string | null;
  resultUrl?: string | null;
  resultAssetId?: string | null;
  assetId?: string;
  fileName?: string;
  errorMessage?: string;
  canRetryDelivery?: boolean;
  localDeliveryFailed?: boolean;
  deliveryAttempts?: number;
  localDeliveryAttemptCount?: number;
  creditsReserved?: number;
  durationSec?: number;
  resolution?: SeedanceVideoResolution;
  startedAt?: string;
  finishedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  outputPath?: string;
} & StoryboardVideoGenerationProgress;

export type StoryboardVideoGenerationEvent = {
  projectId: string;
  taskId?: string;
  batchId?: string | null;
  rowId: string;
  method: StoryboardVideoGenerationMethod;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  provider?: string;
  providerTaskId?: string | null;
  assetId?: string;
  fileName?: string;
  errorMessage?: string;
  canRetryDelivery?: boolean;
  localDeliveryFailed?: boolean;
  deliveryAttempts?: number;
  localDeliveryAttemptCount?: number;
  startedAt?: string;
  finishedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  mediaUpdate?: ShotMediaUpdateResult;
} & StoryboardVideoGenerationProgress;

export type StoryboardVideoBatchResult = ShotMediaUpdateResult & {
  submittedCount: number;
  succeededCount: number;
  failedCount: number;
  tasks: StoryboardVideoTaskSummary[];
};

export type StoryboardDeliveryRetryInput = {
  projectId: string;
  kind: "image" | "video";
  /** Cloud task id or the persisted KIE provider task id. */
  taskId: string;
  rowId: string;
  overwriteExisting?: boolean;
};

export type StoryboardCloudDeliveryRetryResponse = {
  kind?: "image" | "video";
  recovered?: boolean;
  task?: StoryboardImageTaskSummary | StoryboardVideoTaskSummary;
  imageTask?: StoryboardImageTaskSummary;
  videoTask?: StoryboardVideoTaskSummary;
  canRetryDelivery?: boolean;
  deliveryAttempts?: number;
};

export type StoryboardDeliveryRetryResult = ShotMediaUpdateResult & {
  kind: "image" | "video";
  recovered: boolean;
  taskId: string;
  providerTaskId?: string | null;
  canRetryDelivery: boolean;
  localDeliveryFailed: boolean;
  localDeliveryAttemptCount: number;
  imageTask?: StoryboardImageTaskSummary;
  videoTask?: StoryboardActiveVideoGenerationTask;
};

export type OnboardingStepId = "settings" | "hyperframes" | "create_project" | "script" | "storyboard" | "images" | "videos" | "preview" | "export";

export type OnboardingState = {
  appVersion: string;
  contentVersion: string;
  tutorialProjectId: string;
  currentStep: OnboardingStepId;
  completedStepIds: OnboardingStepId[];
  dismissedStepIds: OnboardingStepId[];
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
};

export type OnboardingStatePatch = Partial<Pick<OnboardingState, "currentStep" | "completedStepIds" | "dismissedStepIds" | "startedAt" | "completedAt">>;

export type TutorialStoryboardRevealInput = {
  projectId: string;
  interfaceLanguage?: InterfaceLanguage;
  revealCount?: number;
};

export type TutorialMediaRevealInput = {
  projectId: string;
  rowIds?: string[];
  kind: "image" | "video";
  interfaceLanguage?: InterfaceLanguage;
};

export type StoryboardVideoCloudBatchResult = {
  batchId: string;
  cloudProjectId: string;
  targetCount: number;
  creditsRequired: number;
  creditsReserved: number;
  submittedCount: number;
  failedCount: number;
  tasks: StoryboardVideoTaskSummary[];
};

export type ElevenLabsStatus = {
  configured: boolean;
  maskedKey: string | null;
  updatedAt: string | null;
};

export type ElevenLabsErrorCode =
  | "sign_in_required"
  | "not_configured"
  | "invalid_key"
  | "quota_exceeded"
  | "text_too_long"
  | "network_error"
  | "request_failed";

export type ElevenLabsVoice = {
  voiceId: string;
  name: string;
  category: string;
  isPersonal: boolean;
  gender: "male" | "female" | "neutral" | "unknown";
  language: string | null;
  accent: string | null;
  description: string | null;
  useCase: string | null;
  previewUrl: string | null;
};

export type ElevenLabsVoicesResult =
  | { ok: true; voices: ElevenLabsVoice[] }
  | { ok: false; error: ElevenLabsErrorCode };

export type ElevenLabsKeySaveResult =
  | { ok: true; status: ElevenLabsStatus }
  | { ok: false; error: ElevenLabsErrorCode };

export type ElevenLabsSpeechInput = {
  text: string;
  voiceId: string;
};

export type ElevenLabsSpeechStatusInput = {
  voiceId: string;
  texts: string[];
};

export type ElevenLabsSpeechSegmentState = "cached" | "generating" | "missing";

export type ElevenLabsSpeechResult =
  | { ok: true; audioDataUrl: string; cached: boolean }
  | { ok: false; error: ElevenLabsErrorCode; message?: string };

export type McpBridgeClientStatus = {
  id: "claude_code" | "codex";
  detected: boolean;
  registered: boolean;
  removedByUser: boolean;
  configPath: string;
  skillPath: string;
};

export type McpCommandSnippet = {
  id: string;
  label: string;
  command: string;
};

export type McpBridgeStatus = {
  enabled: boolean;
  listening: boolean;
  serverName: string;
  launcherPath: string;
  socketPath: string;
  clients: McpBridgeClientStatus[];
  snippets?: McpCommandSnippet[];
  httpMcpUrl?: string | null;
  error?: string;
};

export type McpActiveViewReport = {
  projectId: string | null;
  screen?: string;
  tab?: WorkspaceTab;
  // Lets MCP create_project / split_storyboard follow the language and CLI selected in the window.
  agentCliId?: AgentCliId;
  interfaceLanguage?: InterfaceLanguage;
  // Default ElevenLabs voice picked in MkBoard settings, so MCP generate_voiceover matches the in-app 配音.
  speechVoiceId?: string;
  // Video generation settings, so MCP generate_shot_videos defaults match the storyboard toolbar.
  hyperframesResolution?: HyperframesVideoResolution;
  seedanceResolution?: SeedanceVideoResolution;
  hyperframesConcurrency?: number;
};

export type ProjectChangedExternallyEvent = {
  projectId: string;
  source: "mcp";
  tool: string;
};

export type McpOpenProjectRequest = {
  projectId: string;
  tab: WorkspaceTab;
};

export type CloudSyncProjectRecord = {
  syncedAt: string;
  revision: number;
  shotCount: number;
  uploadedBlobs: number;
};

export type CloudSyncConfigSnapshot = {
  configured: boolean;
  source: "stored" | "env" | "none";
  workerUrl: string;
  maskedToken: string | null;
  autoSync: boolean;
  pairingUri: string | null;
  qrSvg: string | null;
  lastSyncedByProject: Record<string, CloudSyncProjectRecord>;
};

export type CloudSyncSaveInput = {
  workerUrl: string;
  syncToken?: string;
  autoSync?: boolean;
};

export type CloudSyncTestResult = {
  ok: boolean;
  message: string;
  projectCount?: number;
};

export type CloudSyncProgressEvent = {
  projectId: string;
  status: "idle" | "scanning" | "uploading" | "finalizing" | "synced" | "error";
  current?: number;
  total?: number;
  message?: string;
  syncedAt?: string;
  revision?: number;
};

export type CloudSyncProjectResult =
  | {
      ok: true;
      projectId: string;
      revision: number;
      syncedAt: string;
      shotCount: number;
      uploadedBlobs: number;
      reusedBlobs: number;
    }
  | {
      ok: false;
      error: string;
    };

export type MkboardApi = {
  getCodexStatus(): Promise<CodexCliStatus>;
  connectCodex(): Promise<CodexCliStatus>;
  connectClaudeCode(): Promise<LocalCliAgent>;
  scanLocalCliAgents(): Promise<LocalCliAgent[]>;
  testHyperframesDoctor(): Promise<LocalCliAgent>;
  openExternal(url: string): Promise<void>;
  openHyperframesStudio(input: HyperframesStudioOpenInput): Promise<{ studioUrl: string }>;
  getByokSettings(): Promise<ByokSettingsSnapshot>;
  saveByokProvider(input: ByokSaveInput): Promise<ByokSettingsSnapshot>;
  clearByokProvider(providerId: ByokProviderId): Promise<ByokSettingsSnapshot>;
  setByokActiveProviders(input: { activeImageProvider?: ByokImageProviderId; activeVideoProvider?: ByokVideoProviderId }): Promise<ByokSettingsSnapshot>;
  testByokProvider(providerId: ByokProviderId, candidateKey?: string): Promise<ByokTestResult>;
  getCompanionStatus(): Promise<CompanionServerStatus>;
  setCompanionMode(mode: CompanionAccessMode, port?: number): Promise<CompanionServerStatus>;
  rotateCompanionToken(): Promise<CompanionServerStatus>;
  generateStoryboardImages(input: StoryboardImageBatchInput): Promise<CloudApiResult<StoryboardImageBatchResult>>;
  syncStoryboardImageBatch(input: StoryboardImageBatchSyncInput): Promise<CloudApiResult<StoryboardImageBatchSyncResult>>;
  syncActiveStoryboardImageGenerations(projectId: string): Promise<CloudApiResult<StoryboardImageBatchSyncResult>>;
  generateStoryboardVideos(input: StoryboardVideoBatchInput): Promise<StoryboardVideoBatchResult>;
  cancelStoryboardVideoGenerations(projectId: string): Promise<boolean>;
  getActiveStoryboardVideoGenerations(projectId: string): Promise<StoryboardActiveVideoGenerations>;
  retryStoryboardGenerationDelivery(input: StoryboardDeliveryRetryInput): Promise<CloudApiResult<StoryboardDeliveryRetryResult>>;
  ensureTutorialProject(interfaceLanguage?: InterfaceLanguage): Promise<ProjectDetail>;
  getOnboardingState(interfaceLanguage?: InterfaceLanguage): Promise<OnboardingState>;
  updateOnboardingState(input: OnboardingStatePatch, interfaceLanguage?: InterfaceLanguage): Promise<OnboardingState>;
  revealTutorialStoryboard(input: TutorialStoryboardRevealInput): Promise<StoryboardRow[]>;
  revealTutorialMedia(input: TutorialMediaRevealInput): Promise<ShotMediaUpdateResult>;
  checkDesktopVersion(): Promise<DesktopVersionCheckResult>;
  startDesktopUpdate(): Promise<DesktopVersionCheckResult>;
  installDesktopUpdate(): Promise<DesktopVersionCheckResult>;
  onDesktopUpdateStateChanged(handler: (state: DesktopVersionCheckResult) => void): () => void;
  listProjects(): Promise<ProjectSummary[]>;
  listArchivedProjects(): Promise<ProjectSummary[]>;
  listDeletedProjects(): Promise<ProjectSummary[]>;
  countRetainedProjects(): Promise<number>;
  createProject(input: CreateProjectInput): Promise<ProjectDetail>;
  updateProject(input: UpdateProjectInput): Promise<ProjectSummary[]>;
  chooseProjectCoverFile(): Promise<PickedProjectCoverFile | null>;
  updateProjectCover(input: UpdateProjectCoverInput): Promise<UpdateProjectCoverResult>;
  getProject(projectId: string, interfaceLanguage?: InterfaceLanguage): Promise<ProjectDetail>;
  archiveProject(projectId: string): Promise<ProjectSummary[]>;
  unarchiveProject(projectId: string): Promise<ProjectSummary[]>;
  trashProject(projectId: string): Promise<ProjectSummary[]>;
  restoreProject(projectId: string): Promise<ProjectSummary[]>;
  deleteProject(projectId: string): Promise<ProjectSummary[]>;
  updateScript(projectId: string, scriptHtml: string): Promise<void>;
  getActiveStoryboardParseRun(projectId: string): Promise<ActiveStoryboardParseRun | null>;
  generateStoryboard(input: GenerateStoryboardInput): Promise<StoryboardRow[]>;
  createShots(projectId: string, count: number): Promise<StoryboardRow[]>;
  insertShot(projectId: string, targetRowId: string, placement: "before" | "after"): Promise<StoryboardRow[]>;
  duplicateShots(projectId: string, rowIds: string[]): Promise<StoryboardRow[]>;
  deleteShots(projectId: string, rowIds: string[]): Promise<StoryboardRow[]>;
  getShotMediaUpdate(projectId: string): Promise<ShotMediaUpdateResult>;
  chooseShotMedia(projectId: string, rowId: string): Promise<ShotMediaUpdateResult>;
  importClipboardImageAsShotMedia(projectId: string, rowId: string): Promise<ShotMediaUpdateResult>;
  importShotMediaPaths(projectId: string, rowId: string, filePaths: string[]): Promise<ShotMediaUpdateResult>;
  updateShot(projectId: string, input: UpdateShotInput): Promise<StoryboardRow[]>;
  updateShotMedia(projectId: string, rowId: string, assetIds: string[]): Promise<ShotMediaUpdateResult>;
  reorderShots(projectId: string, sourceRowId: string, targetRowId: string): Promise<StoryboardRow[]>;
  saveStoryboardColumns(projectId: string, columns: StoryboardColumn[]): Promise<void>;
  saveImageRatio(projectId: string, imageRatio: ImageRatio): Promise<void>;
  saveStoryboardSkill(projectId: string, skillId: string): Promise<ProjectSkill>;
  chooseAssets(projectId: string): Promise<ProjectAsset[]>;
  resolveDroppedFilePaths(files: File[]): string[];
  importAssetPaths(projectId: string, filePaths: string[]): Promise<ProjectAsset[]>;
  renameAsset(projectId: string, assetId: string, fileName: string): Promise<ShotMediaUpdateResult>;
  replaceAsset(projectId: string, assetId: string): Promise<ShotMediaUpdateResult>;
  revealAsset(projectId: string, assetId: string): Promise<void>;
  showAssetImageContextMenu(projectId: string, assetId: string, copyLabel: string): Promise<boolean>;
  downloadAssets(projectId: string, assetIds: string[]): Promise<AssetDownloadResult>;
  exportProject(projectId: string, kind: ProjectExportKind, interfaceLanguage?: InterfaceLanguage): Promise<ProjectExportResult>;
  deleteAssets(projectId: string, assetIds: string[]): Promise<ShotMediaUpdateResult>;
  listTemplates(interfaceLanguage?: InterfaceLanguage): Promise<ProjectTemplate[]>;
  createTemplate(input: CreateProjectTemplateInput): Promise<ProjectTemplate>;
  updateTemplate(input: UpdateProjectTemplateInput): Promise<ProjectTemplate>;
  deleteTemplate(templateId: string): Promise<ProjectTemplate[]>;
  listTastes(): Promise<Taste[]>;
  createTaste(input: CreateTasteInput): Promise<Taste>;
  updateTaste(input: UpdateTasteInput): Promise<Taste>;
  deleteTaste(tasteId: string): Promise<Taste[]>;
  importTasteFromSource(input: ExternalSourceImportInput): Promise<Taste>;
  saveProjectTaste(projectId: string, tasteId: string): Promise<ProjectTaste>;
  listSkills(interfaceLanguage?: InterfaceLanguage): Promise<Skill[]>;
  createSkill(input: CreateSkillInput): Promise<Skill>;
  updateSkill(input: UpdateSkillInput): Promise<Skill>;
  deleteSkill(skillId: string): Promise<Skill[]>;
  importSkillFromSource(input: ExternalSourceImportInput): Promise<Skill>;
  getSkillryCatalogStatus(forceRefresh?: boolean): Promise<SkillryCatalogStatus>;
  getSkillryCollectionDetail(input: { slug: SkillryPackId; locale?: string; forceRefresh?: boolean }): Promise<SkillryCollectionDetail>;
  startSkillryDeviceAuth(): Promise<SkillryDeviceAuthSession>;
  pollSkillryDeviceAuth(): Promise<SkillryDeviceAuthSession>;
  disconnectSkillryAccount(): Promise<SkillryCatalogStatus>;
  checkSkillrySkillAccess(input: { slug: string; priceUsdCents?: number }): Promise<SkillryAccessCheckResult>;
  installSkillryPack(input: SkillryInstallInput): Promise<SkillryInstallResult>;
  syncSkillryPackToMkboard(slug: string): Promise<SkillryInstallResult>;
  chooseImportDirectoryPath(): Promise<string | null>;
  chooseImportArchiveOrFilePath(): Promise<string | null>;
  createAgentConversation(projectId: string): Promise<AgentConversationDetail>;
  getAgentConversation(projectId: string, conversationId: string): Promise<AgentConversationDetail>;
  markAgentConversationCompletionSeen(projectId: string, conversationId: string): Promise<AgentConversationDetail>;
  importAgentClipboardImage(projectId: string): Promise<ProjectAsset[]>;
  sendAgentMessage(request: AgentRequest): Promise<AgentResponse>;
  executeConfirmedDreaminaAgentGeneration(input: ExecuteConfirmedDreaminaAgentGenerationInput): Promise<ProjectDetail>;
  updateAgentMessageOperationConfirmation(projectId: string, clientRunId: string, confirmation: AgentOperationConfirmation): Promise<AgentMessage | null>;
  applyAgentOperations(projectId: string, operations: AgentOperation[]): Promise<ApplyAgentOperationsResult>;
  chooseAgentImages(projectId: string): Promise<ProjectAsset[]>;
  cancelAgentRun(clientRunId: string): Promise<boolean>;
  getElevenLabsStatus(): Promise<ElevenLabsStatus>;
  saveElevenLabsApiKey(apiKey: string): Promise<ElevenLabsKeySaveResult>;
  clearElevenLabsApiKey(): Promise<ElevenLabsStatus>;
  listElevenLabsVoices(): Promise<ElevenLabsVoicesResult>;
  synthesizeElevenLabsSpeech(input: ElevenLabsSpeechInput): Promise<ElevenLabsSpeechResult>;
  getElevenLabsSpeechStatus(input: ElevenLabsSpeechStatusInput): Promise<ElevenLabsSpeechSegmentState[]>;
  onAgentEvent(handler: (event: AgentStreamEvent) => void): () => void;
  onStoryboardVideoGenerationEvent(handler: (event: StoryboardVideoGenerationEvent) => void): () => void;
  onAgentConversationTitle(handler: (event: AgentConversationTitleEvent) => void): () => void;
  getMcpBridgeStatus(): Promise<McpBridgeStatus | null>;
  setMcpBridgeEnabled(enabled: boolean): Promise<McpBridgeStatus | null>;
  reportActiveView(view: McpActiveViewReport): void;
  onProjectChangedExternally(handler: (event: ProjectChangedExternallyEvent) => void): () => void;
  onMcpOpenProjectRequest(handler: (request: McpOpenProjectRequest) => void): () => void;
  getCloudSyncConfig(): Promise<CloudSyncConfigSnapshot>;
  saveCloudSyncConfig(input: CloudSyncSaveInput): Promise<CloudSyncConfigSnapshot>;
  clearCloudSyncConfig(): Promise<CloudSyncConfigSnapshot>;
  testCloudSyncConnection(candidate?: { workerUrl?: string; syncToken?: string }): Promise<CloudSyncTestResult>;
  syncProjectToCloud(projectId: string, options?: { speechVoiceId?: string }): Promise<CloudSyncProjectResult>;
  deleteProjectFromCloud(projectId: string): Promise<{ ok: boolean; error?: string }>;
  onCloudSyncProgress(handler: (event: CloudSyncProgressEvent) => void): () => void;
};

export const initialScriptRichText = `
  <h1>Apple in Two Minutes: From Garage Startup to Global Icon</h1>
  <p>In 1976, Apple began with a simple but radical idea: personal computers should not be locked away for specialists. Steve Jobs, Steve Wozniak, and Ronald Wayne started the company in California, and the Apple II soon helped bring computing into homes, schools, and small businesses.</p>
  <p>Then came 1984. The Macintosh introduced a friendly graphical interface, a mouse, and a new belief about technology: it could feel creative, visual, and human. But the company also struggled. Jobs left, Apple lost direction, and by the mid-1990s it was fighting to stay relevant.</p>
  <p>The comeback began when Jobs returned in 1997. Apple simplified its product line, launched the colorful iMac, and rebuilt its identity around design, clarity, and taste. The iPod and iTunes changed how people carried music. The iPhone changed what a phone could be. The App Store turned that device into a platform for everyday life.</p>
  <p>In the years that followed, Apple expanded into iPad, Apple Watch, services, privacy-focused software, and its own Apple Silicon chips. The deeper story is not just a list of products. Apple became powerful because it kept connecting hardware, software, design, retail, and ecosystem into one experience. From a garage project to one of the most influential companies in the world, Apple showed that technology wins when it feels personal.</p>
`;

const storyboardBaseColumnLabels: Record<StoryboardTemplateLanguage, Record<"sort" | "shot" | "image" | "scene" | "duration" | "content" | "note", string>> = {
  zh: {
    sort: "排序",
    shot: "镜号",
    image: "画面",
    scene: "类别",
    duration: "时长（秒）",
    content: "内容",
    note: "备注"
  },
  en: {
    sort: "Sort",
    shot: "Shot",
    image: "Frame",
    scene: "Category",
    duration: "Duration (s)",
    content: "Content",
    note: "Notes"
  }
};

const storyboardPromptColumnLabels: Record<StoryboardTemplateLanguage, Record<StoryboardPromptColumnKind, string>> = {
  zh: {
    imagePrompt: "图像提示词",
    videoPrompt: "视频提示词",
    generationMethod: "生成方式"
  },
  en: {
    imagePrompt: "Image prompt",
    videoPrompt: "Video prompt",
    generationMethod: "Generation method"
  }
};

const storyboardPromptColumnIds: Record<StoryboardPromptColumnKind, StoryboardColumnId> = {
  imagePrompt: "custom-1",
  videoPrompt: "custom-2",
  generationMethod: "custom-3"
};

const storyboardPromptColumnAliases: Record<StoryboardPromptColumnKind, string[]> = {
  imagePrompt: ["图像提示词", "圖像提示詞", "图片提示词", "圖片提示詞", "生图提示词", "imageprompt", "image prompt", "image_prompt"],
  videoPrompt: ["视频提示词", "影片提示詞", "動畫提示詞", "动画提示词", "动态提示词", "video prompt", "videoprompt", "video_prompt"],
  generationMethod: ["生成方式", "generation method", "generationmethod", "generation_method"]
};

export const initialStoryboardColumns: StoryboardColumn[] = getDefaultStoryboardColumns();

export function getDefaultStoryboardColumns(interfaceLanguage?: InterfaceLanguage): StoryboardColumn[] {
  const language = getStoryboardTemplateLanguage(interfaceLanguage);
  const baseLabels = storyboardBaseColumnLabels[language];
  const promptLabels = storyboardPromptColumnLabels[language];
  return [
    { id: "sort", label: baseLabels.sort, type: "text", visible: true, locked: true },
    { id: "shot", label: baseLabels.shot, type: "number", visible: true, locked: true },
    { id: "image", label: baseLabels.image, type: "image", visible: true },
    { id: "scene", label: baseLabels.scene, type: "text", visible: true },
    { id: "custom-3", label: promptLabels.generationMethod, type: "select", visible: true, custom: true },
    { id: "duration", label: baseLabels.duration, type: "number", visible: false },
    { id: "content", label: baseLabels.content, type: "text", visible: true },
    { id: "note", label: baseLabels.note, type: "text", visible: true },
    { id: "custom-1", label: promptLabels.imagePrompt, type: "text", visible: true, custom: true },
    { id: "custom-2", label: promptLabels.videoPrompt, type: "text", visible: true, custom: true }
  ];
}

export function getStoryboardTemplateLanguage(interfaceLanguage?: InterfaceLanguage): StoryboardTemplateLanguage {
  return interfaceLanguage === "zh-CN" || interfaceLanguage === "zh-TW" ? "zh" : "en";
}

export function getStoryboardPromptColumnKind(column: Pick<StoryboardColumn, "id" | "label">): StoryboardPromptColumnKind | null {
  if (column.id === storyboardPromptColumnIds.imagePrompt) return "imagePrompt";
  if (column.id === storyboardPromptColumnIds.videoPrompt) return "videoPrompt";
  if (column.id === storyboardPromptColumnIds.generationMethod) return "generationMethod";
  const normalizedLabel = normalizeStoryboardColumnLabel(column.label);
  if (storyboardPromptColumnAliases.imagePrompt.some((alias) => normalizeStoryboardColumnLabel(alias) === normalizedLabel)) return "imagePrompt";
  if (storyboardPromptColumnAliases.videoPrompt.some((alias) => normalizeStoryboardColumnLabel(alias) === normalizedLabel)) return "videoPrompt";
  if (storyboardPromptColumnAliases.generationMethod.some((alias) => normalizeStoryboardColumnLabel(alias) === normalizedLabel)) return "generationMethod";
  return null;
}

export function isStoryboardImagePromptColumn(column: Pick<StoryboardColumn, "id" | "label">): boolean {
  return getStoryboardPromptColumnKind(column) === "imagePrompt";
}

export function isStoryboardVideoPromptColumn(column: Pick<StoryboardColumn, "id" | "label">): boolean {
  return getStoryboardPromptColumnKind(column) === "videoPrompt";
}

export function isStoryboardGenerationMethodColumn(column: Pick<StoryboardColumn, "id" | "label">): boolean {
  return getStoryboardPromptColumnKind(column) === "generationMethod";
}

export function isStoryboardPromptTextColumn(column: Pick<StoryboardColumn, "id" | "label">): boolean {
  const kind = getStoryboardPromptColumnKind(column);
  return kind === "imagePrompt" || kind === "videoPrompt";
}

export function ensureStoryboardPromptColumns(columns: StoryboardColumn[], interfaceLanguage?: InterfaceLanguage): StoryboardColumn[] {
  const language = resolveStoryboardTemplateLanguage(columns, interfaceLanguage);
  const baseLabels = storyboardBaseColumnLabels[language];
  const promptLabels = storyboardPromptColumnLabels[language];
  const nextColumns = columns
    .filter((column) => !isLegacyAnimationPromptColumn(column))
    .map((column) => {
      if (column.id === "sort" || column.id === "shot" || column.id === "image" || column.id === "scene" || column.id === "duration" || column.id === "content" || column.id === "note") {
        return {
          ...column,
          label: shouldUseDefaultStoryboardBaseColumnLabel(column.id, column.label) ? baseLabels[column.id] : column.label
        };
      }
      const promptKind = getStoryboardPromptColumnKind(column);
      if (promptKind) {
        return {
          ...column,
          label: shouldUseDefaultStoryboardPromptColumnLabel(promptKind, column.label) ? promptLabels[promptKind] : column.label,
          custom: true
        };
      }
      return { ...column };
    });
  appendStoryboardPromptColumn(nextColumns, "imagePrompt", promptLabels.imagePrompt);
  appendStoryboardPromptColumn(nextColumns, "videoPrompt", promptLabels.videoPrompt);
  appendStoryboardPromptColumn(nextColumns, "generationMethod", promptLabels.generationMethod, "select");
  moveStoryboardPromptColumnAfter(nextColumns, "generationMethod", "scene");
  return nextColumns;
}

function appendStoryboardPromptColumn(columns: StoryboardColumn[], kind: StoryboardPromptColumnKind, label: string, type: StoryboardColumnType = "text"): void {
  const existingColumn = columns.find((column) => getStoryboardPromptColumnKind(column) === kind);
  if (existingColumn) {
    existingColumn.custom = true;
    return;
  }
  const defaultColumnId = storyboardPromptColumnIds[kind];
  columns.push({
    id: columns.some((column) => column.id === defaultColumnId) ? getNextStoryboardCustomColumnId(columns) : defaultColumnId,
    label,
    type,
    visible: true,
    custom: true
  });
}

function moveStoryboardPromptColumnAfter(columns: StoryboardColumn[], kind: StoryboardPromptColumnKind, targetId: StoryboardColumnId): void {
  const columnIndex = columns.findIndex((column) => getStoryboardPromptColumnKind(column) === kind);
  const targetIndex = columns.findIndex((column) => column.id === targetId);
  if (columnIndex < 0 || targetIndex < 0 || columnIndex === targetIndex + 1) return;

  const [column] = columns.splice(columnIndex, 1);
  const adjustedTargetIndex = columnIndex < targetIndex ? targetIndex - 1 : targetIndex;
  columns.splice(adjustedTargetIndex + 1, 0, column);
}

function getNextStoryboardCustomColumnId(columns: StoryboardColumn[]): StoryboardColumnId {
  const indexes = columns
    .map((column) => {
      const match = /^custom-(\d+)$/.exec(column.id);
      return match ? Number(match[1]) : 0;
    })
    .filter((index) => Number.isFinite(index));
  return `custom-${Math.max(0, ...indexes) + 1}` as StoryboardColumnId;
}

function resolveStoryboardTemplateLanguage(_columns: StoryboardColumn[], interfaceLanguage?: InterfaceLanguage): StoryboardTemplateLanguage {
  return getStoryboardTemplateLanguage(interfaceLanguage);
}

function shouldUseDefaultStoryboardBaseColumnLabel(
  columnId: "sort" | "shot" | "image" | "scene" | "duration" | "content" | "note",
  label: string
): boolean {
  const normalizedLabel = normalizeStoryboardColumnLabel(label);
  if (!normalizedLabel) return true;
  return (Object.keys(storyboardBaseColumnLabels) as StoryboardTemplateLanguage[]).some(
    (language) => normalizeStoryboardColumnLabel(storyboardBaseColumnLabels[language][columnId]) === normalizedLabel
  );
}

function shouldUseDefaultStoryboardPromptColumnLabel(kind: StoryboardPromptColumnKind, label: string): boolean {
  const normalizedLabel = normalizeStoryboardColumnLabel(label);
  if (!normalizedLabel) return true;
  return storyboardPromptColumnAliases[kind].some((alias) => normalizeStoryboardColumnLabel(alias) === normalizedLabel);
}

function isEnglishDefaultStoryboardColumn(column: Pick<StoryboardColumn, "id" | "label">): boolean {
  const normalizedLabel = normalizeStoryboardColumnLabel(column.label);
  const promptKind = getStoryboardPromptColumnKind(column);
  if (promptKind && normalizeStoryboardColumnLabel(storyboardPromptColumnLabels.en[promptKind]) === normalizedLabel) return true;
  if (column.id === "sort" || column.id === "shot" || column.id === "image" || column.id === "scene" || column.id === "duration" || column.id === "content" || column.id === "note") {
    return normalizeStoryboardColumnLabel(storyboardBaseColumnLabels.en[column.id]) === normalizedLabel;
  }
  return false;
}

function isLegacyAnimationPromptColumn(column: Pick<StoryboardColumn, "id" | "label">): boolean {
  const normalizedLabel = normalizeStoryboardColumnLabel(column.label);
  return normalizedLabel === normalizeStoryboardColumnLabel("动画提示词") || normalizedLabel === normalizeStoryboardColumnLabel("動畫提示詞");
}

function normalizeStoryboardColumnLabel(label: string): string {
  return label.trim().toLocaleLowerCase().replace(/[\s_-]+/g, "");
}

export const defaultAgentMessage = "告诉我想改脚本还是分镜。";
export const tutorialProjectId = "mkboard-tutorial-musk-story";
export const tutorialProjectIdsByLocale = {
  zh: tutorialProjectId,
  en: "mkboard-tutorial-musk-story-en"
} as const;
export type TutorialProjectLocale = keyof typeof tutorialProjectIdsByLocale;
export const tutorialProjectContentVersion = "2026-06-musk-story-v3";

export function getTutorialProjectLocale(interfaceLanguage?: InterfaceLanguage | string | null): TutorialProjectLocale {
  const normalized = `${interfaceLanguage ?? ""}`.toLowerCase();
  return normalized === "zh-cn" || normalized === "zh-tw" || normalized.startsWith("zh-") || normalized === "zh" ? "zh" : "en";
}

export function getTutorialProjectId(interfaceLanguage?: InterfaceLanguage | string | null): string {
  return tutorialProjectIdsByLocale[getTutorialProjectLocale(interfaceLanguage)];
}

export function getTutorialProjectIdForLocale(locale: TutorialProjectLocale): string {
  return tutorialProjectIdsByLocale[locale];
}

export function getTutorialProjectLocaleForProjectId(projectId: string | null | undefined): TutorialProjectLocale | null {
  if (!projectId) return null;
  return (Object.entries(tutorialProjectIdsByLocale).find(([, id]) => id === projectId)?.[0] as TutorialProjectLocale | undefined) ?? null;
}

export function isTutorialProjectId(projectId: string | null | undefined): boolean {
  return getTutorialProjectLocaleForProjectId(projectId) !== null;
}

// ElevenLabs voiceover text handling, shared by the 配音 player and the MCP generate_voiceover tool so both hit the same speech cache.
export const SPEECH_SEGMENT_MAX_LENGTH = 800;
const speechCellPlaceholders = new Set(["输入内容", "輸入內容", "Enter content"]);

export function getSpokenTextFromCell(cellValue: string) {
  const text = cellValue
    .replace(/<[^>]+>/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return speechCellPlaceholders.has(text) ? "" : text;
}

export function stripScriptHtmlToPlainText(html: string) {
  return html
    .replace(/<(?:br|\/p|\/h[1-6]|\/li|\/div)\b[^>]*>/giu, "\n")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&quot;/giu, '"')
    .replace(/&#0?39;/gu, "'")
    .replace(/[ \t]+/gu, " ")
    .replace(/\s*\n\s*/gu, "\n")
    .trim();
}

export function splitTextIntoSpeechSegments(text: string, maxLength = SPEECH_SEGMENT_MAX_LENGTH) {
  const sentences = text
    .split(/(?<=[。！？；!?;.])\s*|\n+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const segments: string[] = [];
  let currentSegment = "";
  for (const sentence of sentences) {
    for (let offset = 0; offset < sentence.length; offset += maxLength) {
      const piece = sentence.slice(offset, offset + maxLength);
      if (currentSegment && currentSegment.length + piece.length + 1 > maxLength) {
        segments.push(currentSegment);
        currentSegment = piece;
      } else {
        currentSegment = currentSegment ? `${currentSegment} ${piece}` : piece;
      }
    }
  }
  if (currentSegment) segments.push(currentSegment);
  return segments;
}
