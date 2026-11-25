import { contextBridge, ipcRenderer, webUtils } from "electron";
import type {
  AgentConversationTitleEvent,
  AgentOperation,
  AgentOperationConfirmation,
  AgentRequest,
  AgentStreamEvent,
  ByokImageProviderId,
  ByokProviderId,
  ByokSaveInput,
  ByokVideoProviderId,
  CloudSyncProgressEvent,
  CloudSyncSaveInput,
  CompanionAccessMode,
  CreateProjectInput,
  CreateProjectTemplateInput,
  CreateSkillInput,
  CreateTasteInput,
  ExternalSourceImportInput,
  SkillryInstallInput,
  SkillryPackId,
  UpdateTasteInput,
  DesktopVersionCheckResult,
  ElevenLabsSpeechInput,
  ElevenLabsSpeechStatusInput,
  ExecuteConfirmedDreaminaAgentGenerationInput,
  GenerateStoryboardInput,
  HyperframesStudioOpenInput,
  ImageRatio,
  InterfaceLanguage,
  McpActiveViewReport,
  McpOpenProjectRequest,
  MkboardApi,
  OnboardingStatePatch,
  ProjectChangedExternallyEvent,
  ProjectExportKind,
  StoryboardColumn,
  StoryboardDeliveryRetryInput,
  StoryboardImageBatchInput,
  StoryboardImageBatchSyncInput,
  StoryboardVideoBatchInput,
  StoryboardVideoGenerationEvent,
  TutorialMediaRevealInput,
  TutorialStoryboardRevealInput,
  UpdateProjectCoverInput,
  UpdateProjectInput,
  UpdateProjectTemplateInput,
  UpdateShotInput,
  UpdateSkillInput
} from "../shared";

const api: MkboardApi = {
  getCodexStatus: () => ipcRenderer.invoke("mkboard:get-codex-status"),
  connectCodex: () => ipcRenderer.invoke("mkboard:connect-codex"),
  connectClaudeCode: () => ipcRenderer.invoke("mkboard:connect-claude-code"),
  scanLocalCliAgents: () => ipcRenderer.invoke("mkboard:scan-local-cli-agents"),
  testHyperframesDoctor: () => ipcRenderer.invoke("mkboard:test-hyperframes-doctor"),
  openExternal: (url: string) => ipcRenderer.invoke("mkboard:open-external", url),
  openHyperframesStudio: (input: HyperframesStudioOpenInput) => ipcRenderer.invoke("mkboard:open-hyperframes-studio", input),
  getByokSettings: () => ipcRenderer.invoke("mkboard:get-byok-settings"),
  saveByokProvider: (input: ByokSaveInput) => ipcRenderer.invoke("mkboard:save-byok-provider", input),
  clearByokProvider: (providerId: ByokProviderId) => ipcRenderer.invoke("mkboard:clear-byok-provider", providerId),
  setByokActiveProviders: (input: { activeImageProvider?: ByokImageProviderId; activeVideoProvider?: ByokVideoProviderId }) =>
    ipcRenderer.invoke("mkboard:set-byok-active-providers", input),
  testByokProvider: (providerId: ByokProviderId, candidateKey?: string) =>
    ipcRenderer.invoke("mkboard:test-byok-provider", providerId, candidateKey),
  getCompanionStatus: () => ipcRenderer.invoke("mkboard:get-companion-status"),
  setCompanionMode: (mode: CompanionAccessMode, port?: number) => ipcRenderer.invoke("mkboard:set-companion-mode", mode, port),
  rotateCompanionToken: () => ipcRenderer.invoke("mkboard:rotate-companion-token"),
  generateStoryboardImages: (input: StoryboardImageBatchInput) => ipcRenderer.invoke("mkboard:generate-storyboard-images", input),
  syncStoryboardImageBatch: (input: StoryboardImageBatchSyncInput) => ipcRenderer.invoke("mkboard:sync-storyboard-image-batch", input),
  syncActiveStoryboardImageGenerations: (projectId: string) => ipcRenderer.invoke("mkboard:sync-active-storyboard-image-generations", projectId),
  generateStoryboardVideos: (input: StoryboardVideoBatchInput) => ipcRenderer.invoke("mkboard:generate-storyboard-videos", input),
  cancelStoryboardVideoGenerations: (projectId: string) => ipcRenderer.invoke("mkboard:cancel-storyboard-video-generations", projectId),
  getActiveStoryboardVideoGenerations: (projectId: string) => ipcRenderer.invoke("mkboard:get-active-storyboard-video-generations", projectId),
  retryStoryboardGenerationDelivery: (input: StoryboardDeliveryRetryInput) =>
    ipcRenderer.invoke("mkboard:retry-storyboard-generation-delivery", input),
  ensureTutorialProject: (interfaceLanguage?: InterfaceLanguage) => ipcRenderer.invoke("mkboard:ensure-tutorial-project", interfaceLanguage),
  getOnboardingState: (interfaceLanguage?: InterfaceLanguage) => ipcRenderer.invoke("mkboard:get-onboarding-state", interfaceLanguage),
  updateOnboardingState: (input: OnboardingStatePatch, interfaceLanguage?: InterfaceLanguage) =>
    ipcRenderer.invoke("mkboard:update-onboarding-state", input, interfaceLanguage),
  revealTutorialStoryboard: (input: TutorialStoryboardRevealInput) => ipcRenderer.invoke("mkboard:reveal-tutorial-storyboard", input),
  revealTutorialMedia: (input: TutorialMediaRevealInput) => ipcRenderer.invoke("mkboard:reveal-tutorial-media", input),
  checkDesktopVersion: () => ipcRenderer.invoke("mkboard:check-desktop-version"),
  startDesktopUpdate: () => ipcRenderer.invoke("mkboard:start-desktop-update"),
  installDesktopUpdate: () => ipcRenderer.invoke("mkboard:install-desktop-update"),
  onDesktopUpdateStateChanged: (handler: (state: DesktopVersionCheckResult) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: DesktopVersionCheckResult) => handler(state);
    ipcRenderer.on("mkboard:desktop-update-state", listener);
    return () => ipcRenderer.removeListener("mkboard:desktop-update-state", listener);
  },
  listProjects: () => ipcRenderer.invoke("mkboard:list-projects"),
  listArchivedProjects: () => ipcRenderer.invoke("mkboard:list-archived-projects"),
  listDeletedProjects: () => ipcRenderer.invoke("mkboard:list-deleted-projects"),
  countRetainedProjects: () => ipcRenderer.invoke("mkboard:count-retained-projects"),
  createProject: (input: CreateProjectInput) => ipcRenderer.invoke("mkboard:create-project", input),
  updateProject: (input: UpdateProjectInput) => ipcRenderer.invoke("mkboard:update-project", input),
  chooseProjectCoverFile: () => ipcRenderer.invoke("mkboard:choose-project-cover-file"),
  updateProjectCover: (input: UpdateProjectCoverInput) => ipcRenderer.invoke("mkboard:update-project-cover", input),
  getProject: (projectId: string, interfaceLanguage?: InterfaceLanguage) => ipcRenderer.invoke("mkboard:get-project", projectId, interfaceLanguage),
  archiveProject: (projectId: string) => ipcRenderer.invoke("mkboard:archive-project", projectId),
  unarchiveProject: (projectId: string) => ipcRenderer.invoke("mkboard:unarchive-project", projectId),
  trashProject: (projectId: string) => ipcRenderer.invoke("mkboard:trash-project", projectId),
  restoreProject: (projectId: string) => ipcRenderer.invoke("mkboard:restore-project", projectId),
  deleteProject: (projectId: string) => ipcRenderer.invoke("mkboard:delete-project", projectId),
  updateScript: (projectId: string, scriptHtml: string) => ipcRenderer.invoke("mkboard:update-script", projectId, scriptHtml),
  getActiveStoryboardParseRun: (projectId: string) => ipcRenderer.invoke("mkboard:get-active-storyboard-parse-run", projectId),
  generateStoryboard: (input: GenerateStoryboardInput) => ipcRenderer.invoke("mkboard:generate-storyboard", input),
  createShots: (projectId: string, count: number) => ipcRenderer.invoke("mkboard:create-shots", projectId, count),
  insertShot: (projectId: string, targetRowId: string, placement: "before" | "after") =>
    ipcRenderer.invoke("mkboard:insert-shot", projectId, targetRowId, placement),
  duplicateShots: (projectId: string, rowIds: string[]) => ipcRenderer.invoke("mkboard:duplicate-shots", projectId, rowIds),
  deleteShots: (projectId: string, rowIds: string[]) => ipcRenderer.invoke("mkboard:delete-shots", projectId, rowIds),
  getShotMediaUpdate: (projectId: string) => ipcRenderer.invoke("mkboard:get-shot-media-update", projectId),
  chooseShotMedia: (projectId: string, rowId: string) => ipcRenderer.invoke("mkboard:choose-shot-media", projectId, rowId),
  importClipboardImageAsShotMedia: (projectId: string, rowId: string) => ipcRenderer.invoke("mkboard:import-clipboard-image-as-shot-media", projectId, rowId),
  importShotMediaPaths: (projectId: string, rowId: string, filePaths: string[]) => ipcRenderer.invoke("mkboard:import-shot-media-paths", projectId, rowId, filePaths),
  updateShot: (projectId: string, input: UpdateShotInput) => ipcRenderer.invoke("mkboard:update-shot", projectId, input),
  updateShotMedia: (projectId: string, rowId: string, assetIds: string[]) => ipcRenderer.invoke("mkboard:update-shot-media", projectId, rowId, assetIds),
  reorderShots: (projectId: string, sourceRowId: string, targetRowId: string) =>
    ipcRenderer.invoke("mkboard:reorder-shots", projectId, sourceRowId, targetRowId),
  saveStoryboardColumns: (projectId: string, columns: StoryboardColumn[]) => ipcRenderer.invoke("mkboard:save-columns", projectId, columns),
  saveImageRatio: (projectId: string, imageRatio: ImageRatio) => ipcRenderer.invoke("mkboard:save-image-ratio", projectId, imageRatio),
  saveStoryboardSkill: (projectId: string, skillId: string) => ipcRenderer.invoke("mkboard:save-storyboard-skill", projectId, skillId),
  chooseAssets: (projectId: string) => ipcRenderer.invoke("mkboard:choose-assets", projectId),
  resolveDroppedFilePaths: (files: File[]) =>
    Array.from(files)
      .map((file) => webUtils.getPathForFile(file) || (file as File & { path?: string }).path)
      .filter((filePath): filePath is string => Boolean(filePath)),
  importAssetPaths: (projectId: string, filePaths: string[]) => ipcRenderer.invoke("mkboard:import-asset-paths", projectId, filePaths),
  renameAsset: (projectId: string, assetId: string, fileName: string) => ipcRenderer.invoke("mkboard:rename-asset", projectId, assetId, fileName),
  replaceAsset: (projectId: string, assetId: string) => ipcRenderer.invoke("mkboard:replace-asset", projectId, assetId),
  revealAsset: (projectId: string, assetId: string) => ipcRenderer.invoke("mkboard:reveal-asset", projectId, assetId),
  showAssetImageContextMenu: (projectId: string, assetId: string, copyLabel: string) => ipcRenderer.invoke("mkboard:show-asset-image-context-menu", projectId, assetId, copyLabel),
  downloadAssets: (projectId: string, assetIds: string[]) => ipcRenderer.invoke("mkboard:download-assets", projectId, assetIds),
  exportProject: (projectId: string, kind: ProjectExportKind, interfaceLanguage?: InterfaceLanguage) =>
    ipcRenderer.invoke("mkboard:export-project", projectId, kind, interfaceLanguage),
  deleteAssets: (projectId: string, assetIds: string[]) => ipcRenderer.invoke("mkboard:delete-assets", projectId, assetIds),
  listTemplates: (interfaceLanguage?: InterfaceLanguage) => ipcRenderer.invoke("mkboard:list-templates", interfaceLanguage),
  createTemplate: (input: CreateProjectTemplateInput) => ipcRenderer.invoke("mkboard:create-template", input),
  updateTemplate: (input: UpdateProjectTemplateInput) => ipcRenderer.invoke("mkboard:update-template", input),
  deleteTemplate: (templateId: string) => ipcRenderer.invoke("mkboard:delete-template", templateId),
  listTastes: () => ipcRenderer.invoke("mkboard:list-tastes"),
  createTaste: (input: CreateTasteInput) => ipcRenderer.invoke("mkboard:create-taste", input),
  updateTaste: (input: UpdateTasteInput) => ipcRenderer.invoke("mkboard:update-taste", input),
  deleteTaste: (tasteId: string) => ipcRenderer.invoke("mkboard:delete-taste", tasteId),
  importTasteFromSource: (input: ExternalSourceImportInput) => ipcRenderer.invoke("mkboard:import-taste-from-source", input),
  saveProjectTaste: (projectId: string, tasteId: string) => ipcRenderer.invoke("mkboard:save-project-taste", projectId, tasteId),
  listSkills: (interfaceLanguage?: InterfaceLanguage) => ipcRenderer.invoke("mkboard:list-skills", interfaceLanguage),
  createSkill: (input: CreateSkillInput) => ipcRenderer.invoke("mkboard:create-skill", input),
  updateSkill: (input: UpdateSkillInput) => ipcRenderer.invoke("mkboard:update-skill", input),
  deleteSkill: (skillId: string) => ipcRenderer.invoke("mkboard:delete-skill", skillId),
  importSkillFromSource: (input: ExternalSourceImportInput) => ipcRenderer.invoke("mkboard:import-skill-from-source", input),
  getSkillryCatalogStatus: (forceRefresh?: boolean) => ipcRenderer.invoke("mkboard:get-skillry-catalog-status", forceRefresh),
  getSkillryCollectionDetail: (input: { slug: SkillryPackId; locale?: string; forceRefresh?: boolean }) =>
    ipcRenderer.invoke("mkboard:get-skillry-collection-detail", input),
  startSkillryDeviceAuth: () => ipcRenderer.invoke("mkboard:start-skillry-device-auth"),
  pollSkillryDeviceAuth: () => ipcRenderer.invoke("mkboard:poll-skillry-device-auth"),
  disconnectSkillryAccount: () => ipcRenderer.invoke("mkboard:disconnect-skillry-account"),
  checkSkillrySkillAccess: (input: { slug: string; priceUsdCents?: number }) =>
    ipcRenderer.invoke("mkboard:check-skillry-skill-access", input),
  installSkillryPack: (input: SkillryInstallInput) => ipcRenderer.invoke("mkboard:install-skillry-pack", input),
  syncSkillryPackToMkboard: (slug: string) => ipcRenderer.invoke("mkboard:sync-skillry-pack-to-mkboard", slug),
  chooseImportDirectoryPath: () => ipcRenderer.invoke("mkboard:choose-import-directory-path"),
  chooseImportArchiveOrFilePath: () => ipcRenderer.invoke("mkboard:choose-import-archive-or-file-path"),
  createAgentConversation: (projectId: string) => ipcRenderer.invoke("mkboard:create-agent-conversation", projectId),
  getAgentConversation: (projectId: string, conversationId: string) => ipcRenderer.invoke("mkboard:get-agent-conversation", projectId, conversationId),
  markAgentConversationCompletionSeen: (projectId: string, conversationId: string) =>
    ipcRenderer.invoke("mkboard:mark-agent-conversation-completion-seen", projectId, conversationId),
  chooseAgentImages: (projectId: string) => ipcRenderer.invoke("mkboard:choose-agent-images", projectId),
  importAgentClipboardImage: (projectId: string) => ipcRenderer.invoke("mkboard:import-agent-clipboard-image", projectId),
  sendAgentMessage: (request: AgentRequest) => ipcRenderer.invoke("mkboard:send-agent-message", request),
  executeConfirmedDreaminaAgentGeneration: (input: ExecuteConfirmedDreaminaAgentGenerationInput) =>
    ipcRenderer.invoke("mkboard:execute-confirmed-dreamina-agent-generation", input),
  updateAgentMessageOperationConfirmation: (projectId: string, clientRunId: string, confirmation: AgentOperationConfirmation) =>
    ipcRenderer.invoke("mkboard:update-agent-message-operation-confirmation", projectId, clientRunId, confirmation),
  applyAgentOperations: (projectId: string, operations: AgentOperation[]) => ipcRenderer.invoke("mkboard:apply-agent-operations", projectId, operations),
  cancelAgentRun: (clientRunId: string) => ipcRenderer.invoke("mkboard:cancel-agent-run", clientRunId),
  getElevenLabsStatus: () => ipcRenderer.invoke("mkboard:get-elevenlabs-status"),
  saveElevenLabsApiKey: (apiKey: string) => ipcRenderer.invoke("mkboard:save-elevenlabs-api-key", apiKey),
  clearElevenLabsApiKey: () => ipcRenderer.invoke("mkboard:clear-elevenlabs-api-key"),
  listElevenLabsVoices: () => ipcRenderer.invoke("mkboard:list-elevenlabs-voices"),
  synthesizeElevenLabsSpeech: (input: ElevenLabsSpeechInput) => ipcRenderer.invoke("mkboard:synthesize-elevenlabs-speech", input),
  getElevenLabsSpeechStatus: (input: ElevenLabsSpeechStatusInput) => ipcRenderer.invoke("mkboard:get-elevenlabs-speech-status", input),
  onAgentEvent: (handler: (event: AgentStreamEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: AgentStreamEvent) => handler(payload);
    ipcRenderer.on("mkboard:agent-event", listener);
    return () => ipcRenderer.removeListener("mkboard:agent-event", listener);
  },
  onStoryboardVideoGenerationEvent: (handler: (event: StoryboardVideoGenerationEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: StoryboardVideoGenerationEvent) => handler(payload);
    ipcRenderer.on("mkboard:storyboard-video-generation-event", listener);
    return () => ipcRenderer.removeListener("mkboard:storyboard-video-generation-event", listener);
  },
  onAgentConversationTitle: (handler: (event: AgentConversationTitleEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: AgentConversationTitleEvent) => handler(payload);
    ipcRenderer.on("mkboard:agent-conversation-title", listener);
    return () => ipcRenderer.removeListener("mkboard:agent-conversation-title", listener);
  },
  getMcpBridgeStatus: () => ipcRenderer.invoke("mkboard:get-mcp-bridge-status"),
  setMcpBridgeEnabled: (enabled: boolean) => ipcRenderer.invoke("mkboard:set-mcp-bridge-enabled", enabled),
  reportActiveView: (view: McpActiveViewReport) => ipcRenderer.send("mkboard:report-active-view", view),
  onProjectChangedExternally: (handler: (event: ProjectChangedExternallyEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: ProjectChangedExternallyEvent) => handler(payload);
    ipcRenderer.on("mkboard:project-changed-externally", listener);
    return () => ipcRenderer.removeListener("mkboard:project-changed-externally", listener);
  },
  onMcpOpenProjectRequest: (handler: (request: McpOpenProjectRequest) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: McpOpenProjectRequest) => handler(payload);
    ipcRenderer.on("mkboard:mcp-open-project", listener);
    return () => ipcRenderer.removeListener("mkboard:mcp-open-project", listener);
  },
  getCloudSyncConfig: () => ipcRenderer.invoke("mkboard:get-cloud-sync-config"),
  saveCloudSyncConfig: (input: CloudSyncSaveInput) => ipcRenderer.invoke("mkboard:save-cloud-sync-config", input),
  clearCloudSyncConfig: () => ipcRenderer.invoke("mkboard:clear-cloud-sync-config"),
  testCloudSyncConnection: (candidate?: { workerUrl?: string; syncToken?: string }) =>
    ipcRenderer.invoke("mkboard:test-cloud-sync-connection", candidate),
  syncProjectToCloud: (projectId: string, options?: { speechVoiceId?: string }) =>
    ipcRenderer.invoke("mkboard:sync-project-to-cloud", projectId, options),
  deleteProjectFromCloud: (projectId: string) => ipcRenderer.invoke("mkboard:delete-project-from-cloud", projectId),
  onCloudSyncProgress: (handler: (event: CloudSyncProgressEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: CloudSyncProgressEvent) => handler(payload);
    ipcRenderer.on("mkboard:cloud-sync-progress", listener);
    return () => ipcRenderer.removeListener("mkboard:cloud-sync-progress", listener);
  }
};

contextBridge.exposeInMainWorld("mkboard", api);
