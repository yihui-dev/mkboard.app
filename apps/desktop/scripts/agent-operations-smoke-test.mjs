import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  applyAgentResponseWrites,
  applyConfirmedAgentOperations,
  attachAgentImageAttachmentsToRegeneratedVideoRows,
  completeAgentResponseFromDirectStoryboardIntent
} from "../src/main/agent-operations.ts";
import {
  buildCodexExecArgs,
  buildConversationContext,
  createCodexEventHandler,
  isRecoverableCodexReconnect,
  isRecoverableHyperframesProjectResult,
  mergeHyperframesProjectFiles
} from "../src/main/codex-agent.ts";
import { parseAgentResponse } from "../src/main/agent-response.ts";
import { buildAgentOutputSchema } from "../src/main/agent-output-schema.ts";
import { getCodexCliStatus, resolveCodexExecutable, resolveCodexNativeBinary } from "../src/main/codex-auth.ts";
import { normalizeHyperframesProjectFontsForLint } from "../src/main/hyperframes-fonts.ts";
import { inferAgentMediaGenerationPlaceholder } from "../src/agent-generation-intent.ts";
import {
  isAgentNetworkFailureMessage,
  isCodexChatGptWebsocketForbiddenMessage,
  isSeedanceAspectRatio,
  hyperframesVideoDimensionsFromAspectRatio,
  normalizeImageRatio,
  normalizeSeedanceVideoResolution,
  seedanceVideoCreditsPerSecond
} from "../src/shared.ts";

const projectId = "project-1";
const scriptDir = dirname(fileURLToPath(import.meta.url));

const columns = [
  { id: "sort", label: "排序", visible: true, custom: false },
  { id: "shot", label: "分镜", visible: true, custom: false },
  { id: "image", label: "画面", visible: true, custom: false },
  { id: "scene", label: "类别", visible: true, custom: false },
  { id: "duration", label: "时长", visible: true, custom: false },
  { id: "content", label: "内容", visible: true, custom: false },
  { id: "note", label: "备注", visible: true, custom: false },
  { id: "custom-1", label: "图像提示词", visible: true, custom: true },
  { id: "custom-2", label: "视频提示词", visible: true, custom: true },
  { id: "custom-3", label: "生成方式", visible: true, custom: true }
];

test("Seedance resolution defaults to 720p and uses resolution-based pricing", () => {
  assert.equal(normalizeSeedanceVideoResolution(undefined), "720p");
  assert.equal(normalizeSeedanceVideoResolution("invalid"), "720p");
  assert.equal(normalizeSeedanceVideoResolution("1080p"), "1080p");
  assert.equal(seedanceVideoCreditsPerSecond("720p"), 50);
  assert.equal(seedanceVideoCreditsPerSecond("1080p"), 100);
});

test("project image ratio accepts the four supported values and defaults safely", () => {
  assert.equal(normalizeImageRatio("16:9"), "16:9");
  assert.equal(normalizeImageRatio("9:16"), "9:16");
  assert.equal(normalizeImageRatio("4:3"), "4:3");
  assert.equal(normalizeImageRatio("3:4"), "3:4");
  assert.equal(normalizeImageRatio("1:1"), "16:9");
  assert.equal(normalizeImageRatio(undefined), "16:9");
  assert.equal(isSeedanceAspectRatio("1:1"), true);
  assert.equal(isSeedanceAspectRatio("21:9"), true);
  assert.equal(isSeedanceAspectRatio("5:4"), false);
  assert.deepEqual(hyperframesVideoDimensionsFromAspectRatio("16:9"), { width: 1920, height: 1080 });
  assert.deepEqual(hyperframesVideoDimensionsFromAspectRatio("9:16"), { width: 1080, height: 1920 });
  assert.deepEqual(hyperframesVideoDimensionsFromAspectRatio("3:4"), { width: 1080, height: 1440 });
  assert.deepEqual(hyperframesVideoDimensionsFromAspectRatio("4:3"), { width: 1440, height: 1080 });
});

test("video settings keep MG and AI asset resolutions independent", () => {
  const rendererSource = readFileSync(join(scriptDir, "../src/renderer/src/App.tsx"), "utf8");
  const i18nSource = readFileSync(join(scriptDir, "../src/renderer/src/i18n.ts"), "utf8");

  assert.match(rendererSource, /HyperframesVideoResolutionSetting[\s\S]*SeedanceVideoResolutionSetting/u);
  assert.match(rendererSource, /seedanceVideoResolutionOptions[\s\S]*"720p"[\s\S]*"1080p"/u);
  assert.match(rendererSource, /readStoredOption\(SEEDANCE_VIDEO_RESOLUTION_STORAGE_KEY, "720p"/u);
  assert.match(i18nSource, /"settings\.runtime\.hyperframesResolution": "MG 动画素材"/u);
  assert.match(i18nSource, /"settings\.runtime\.seedanceResolution": "AI 素材"/u);
  assert.match(i18nSource, /"settings\.runtime\.seedanceResolutionDetail": "Seedance2\.0 生成的视频素材分辨率"/u);
});

test("agent output schema remains strict for Codex structured output", () => {
  const schema = buildAgentOutputSchema(columns);
  assertStrictObjectSchemas(schema);

  const operationItemSchema = schema.properties.operations.anyOf[0].items;
  const rowItemSchema = schema.properties.rows.anyOf[0].items;
  assert.equal(operationItemSchema.additionalProperties, false);
  assert.equal(operationItemSchema.properties.rowRef.anyOf[0].additionalProperties, false);
  assert.deepEqual(operationItemSchema.properties.provider.enum, ["dreamina_cli", null]);
  assert.deepEqual(operationItemSchema.properties.aspectRatio.enum, ["1:1", "4:3", "3:4", "16:9", "9:16", "21:9", null]);
  assert.equal("imagePrompt" in rowItemSchema.properties, false);
  assert.equal("videoPrompt" in rowItemSchema.properties, false);
  assert.equal("generationMethod" in rowItemSchema.properties, false);
  assert.deepEqual(Object.keys(rowItemSchema.properties.customValues.properties), ["custom-1", "custom-2", "custom-3"]);

  const storyboardGenerationSchema = buildAgentOutputSchema(columns, { requireRows: true });
  assert.equal(storyboardGenerationSchema.properties.rows.type, "array");
  assert.equal(storyboardGenerationSchema.properties.rows.minItems, 1);
  assert.deepEqual(Object.keys(storyboardGenerationSchema.properties.rows.items.properties.customValues.properties), ["custom-1", "custom-2", "custom-3"]);
});

test("agent conversation context skips failed turns and caps old history", () => {
  const longText = "长上下文".repeat(1200);
  const messages = [
    { id: "u-failed", role: "user", content: "失败请求不要带入", createdAt: "2026-01-01T00:00:00.000Z" },
    {
      id: "a-failed",
      role: "assistant",
      content: "API Error: Unable to connect to API (ConnectionRefused)",
      createdAt: "2026-01-01T00:00:01.000Z",
      runStatus: "failed",
      events: [{ kind: "error", message: "API Error: Unable to connect to API (ConnectionRefused)" }]
    },
    { id: "u-canceled", role: "user", content: "取消请求不要带入", createdAt: "2026-01-01T00:00:02.000Z" },
    {
      id: "a-canceled",
      role: "assistant",
      content: "已停止当前 Claude Code 任务。",
      createdAt: "2026-01-01T00:00:03.000Z",
      runStatus: "canceled"
    },
    ...Array.from({ length: 10 }, (_, index) => [
      { id: `u-long-${index}`, role: "user", content: `成功请求 ${index} ${longText}`, createdAt: `2026-01-01T00:01:${String(index).padStart(2, "0")}.000Z` },
      {
        id: `a-long-${index}`,
        role: "assistant",
        content: `成功回复 ${index} ${longText}`,
        createdAt: `2026-01-01T00:02:${String(index).padStart(2, "0")}.000Z`,
        runStatus: "succeeded"
      }
    ]).flat(),
    { id: "u-current", role: "user", content: "当前请求", createdAt: "2026-01-01T00:03:00.000Z" }
  ];

  const context = buildConversationContext(messages, "当前请求");
  assert.equal(context.includes("失败请求不要带入"), false);
  assert.equal(context.includes("取消请求不要带入"), false);
  assert.match(context, /成功请求 9/);
  assert.match(context, /成功回复 9/);
  assert.equal(context.length <= 12_000, true);
  assert.match(context, /更早的对话上下文已因长度限制被省略/);
});

test("completed background conversations expose persistent unread notification dots", () => {
  const sharedSource = readFileSync(join(scriptDir, "../src/shared.ts"), "utf8");
  const databaseSource = readFileSync(join(scriptDir, "../src/main/database.ts"), "utf8");
  const mainSource = readFileSync(join(scriptDir, "../src/main/index.ts"), "utf8");
  const preloadSource = readFileSync(join(scriptDir, "../src/preload/index.ts"), "utf8");
  const rendererSource = readFileSync(join(scriptDir, "../src/renderer/src/App.tsx"), "utf8");
  const rendererCssSource = readFileSync(join(scriptDir, "../src/renderer/src/styles/global.css"), "utf8");
  const i18nSource = readFileSync(join(scriptDir, "../src/renderer/src/i18n.ts"), "utf8");

  assert.match(sharedSource, /hasUnreadCompletion: boolean/);
  assert.match(sharedSource, /markAgentConversationCompletionSeen\(projectId: string, conversationId: string\)/);
  assert.match(databaseSource, /PRAGMA table_info\(agent_conversations\)[\s\S]*ALTER TABLE agent_conversations ADD COLUMN unread_completion INTEGER NOT NULL DEFAULT 0/);
  assert.match(databaseSource, /!isUnreadAgentCompletionStatus\(existing\.run_status\)[\s\S]*isUnreadAgentCompletionStatus\(nextRunStatus\)[\s\S]*unread_completion = 1/);
  assert.match(mainSource, /mkboard:mark-agent-conversation-completion-seen/);
  assert.match(preloadSource, /markAgentConversationCompletionSeen:[\s\S]*mkboard:mark-agent-conversation-completion-seen/);
  assert.match(rendererSource, /hasUnreadConversationCompletion = conversations\.some/);
  assert.match(rendererSource, /agent-notification-dot/);
  assert.match(rendererSource, /agent-history-notification-dot/);
  assert.match(rendererSource, /window\.mkboard\.markAgentConversationCompletionSeen/);
  assert.match(rendererCssSource, /\.agent-notification-dot[\s\S]*background: #ef4444/);
  assert.match(rendererCssSource, /\.agent-history-notification-dot[\s\S]*background: #ef4444/);
  assert.match(i18nSource, /"agent\.historyUnread": "历史对话，有未查看的完成结果"/);
});

test("agent network failure detection covers Claude Code and Codex gateway errors", () => {
  assert.equal(isAgentNetworkFailureMessage("API Error: Unable to connect to API (ConnectionRefused)"), true);
  assert.equal(isAgentNetworkFailureMessage('API Error: 524 {"status":524,"error_name":"origin_response_timeout"}'), true);
  const codexReconnect = "Reconnecting... 2/5 (unexpected status 403 Forbidden: <!DOCTYPE html>, url: wss://chatgpt.com/backend-api/codex/responses, cf-ray: example-HKG)";
  assert.equal(isCodexChatGptWebsocketForbiddenMessage(codexReconnect), true);
  assert.equal(isAgentNetworkFailureMessage(codexReconnect), true);
  assert.equal(isRecoverableCodexReconnect(codexReconnect), true);
  assert.equal(isAgentNetworkFailureMessage("Output does not match required schema"), false);
});

test("Codex websocket reconnect warnings remain recoverable instead of failing the task", () => {
  const message = "Reconnecting... 2/5 (unexpected status 403 Forbidden: <!DOCTYPE html>, url: wss://chatgpt.com/backend-api/codex/responses, cf-ray: example-HKG)";
  const events = [];
  const stream = createCodexEventHandler((event) => events.push(event));
  stream.feed(`${JSON.stringify({ type: "error", message })}\n`);
  stream.flush();
  assert.deepEqual(events, [{ kind: "status", label: "warning", detail: message }]);
});

test("storyboard Codex runs request detailed reasoning summaries and expose them as thinking events", () => {
  const args = buildCodexExecArgs("/tmp/project", "/tmp/result.json", "/tmp/schema.json", { reasoningSummaries: true });
  assert.deepEqual(args.slice(args.indexOf('model_reasoning_summary="detailed"') - 1, args.indexOf('model_reasoning_summary="detailed"') + 4), [
    "-c",
    'model_reasoning_summary="detailed"',
    "-c",
    "model_supports_reasoning_summaries=true",
    "--ephemeral"
  ]);

  const events = [];
  const stream = createCodexEventHandler((event) => events.push(event));
  stream.feed(`${JSON.stringify({ type: "item.completed", item: { id: "reasoning-1", type: "reasoning", text: "先识别脚本结构，再规划镜头层次。" } })}\n`);
  stream.flush();
  assert.deepEqual(events, [{ kind: "thinking", text: "先识别脚本结构，再规划镜头层次。" }]);
});

test("Codex, Claude Code, and video generation share a two-hour timeout ceiling", () => {
  const agentSource = readFileSync(join(scriptDir, "../src/main/codex-agent.ts"), "utf8");
  const localVideoSource = readFileSync(join(scriptDir, "../src/main/local-video.ts"), "utf8");
  const mainSource = readFileSync(join(scriptDir, "../src/main/index.ts"), "utf8");

  assert.match(agentSource, /const DEFAULT_AGENT_RUN_TIMEOUT_MS = 2 \* 60 \* 60_000/);
  assert.match(agentSource, /const DEFAULT_CODEX_TIMEOUT_MS = DEFAULT_AGENT_RUN_TIMEOUT_MS/);
  assert.match(agentSource, /const DEFAULT_CLAUDE_CODE_TIMEOUT_MS = DEFAULT_AGENT_RUN_TIMEOUT_MS/);
  assert.match(agentSource, /const STORYBOARD_GENERATION_TIMEOUT_MS = DEFAULT_AGENT_RUN_TIMEOUT_MS/);
  assert.match(agentSource, /const DEFAULT_HYPERFRAMES_AGENT_TIMEOUT_MS = DEFAULT_AGENT_RUN_TIMEOUT_MS/);
  assert.match(agentSource, /Math\.min\(2 \* 60 \* 60_000, Math\.round\(value\)\)/);
  assert.equal((agentSource.match(/timeoutMs: 30_000/g) ?? []).length, 3);

  assert.match(localVideoSource, /const defaultHyperframesInspectTimeoutMs = 2 \* 60 \* 60_000/);
  assert.match(localVideoSource, /const defaultHyperframesRenderTimeoutMs = 2 \* 60 \* 60_000/);
  assert.match(localVideoSource, /const defaultVideoTaskTimeoutMs = 2 \* 60 \* 60_000/);
  assert.equal((localVideoSource.match(/Math\.min\(2 \* 60 \* 60_000, Math\.round\(value\)\)/g) ?? []).length, 3);
  assert.match(localVideoSource, /视频生成等待已达到 2 小时/);
  assert.match(mainSource, /Seedance 2\.0 任务等待已超过 2 小时/);
  assert.match(mainSource, /Date\.now\(\) - createdAtMs > 2 \* 60 \* 60_000/);
});

test("project list keeps tutorial projects after user projects", () => {
  const databaseSource = readFileSync(join(scriptDir, "../src/main/database.ts"), "utf8");

  assert.match(databaseSource, /listProjects\(\): ProjectSummary\[\][\s\S]*ORDER BY CASE WHEN kind = 'tutorial' THEN 1 ELSE 0 END, updated_at DESC/);
  assert.doesNotMatch(databaseSource, /listProjects\(\): ProjectSummary\[\][\s\S]*ORDER BY CASE WHEN kind = 'tutorial' THEN 0 ELSE 1 END, updated_at DESC/);
});

test("open-source edition removes free project quota limits and cloud billing gates", () => {
  const databaseSource = readFileSync(join(scriptDir, "../src/main/database.ts"), "utf8");
  const mainSource = readFileSync(join(scriptDir, "../src/main/index.ts"), "utf8");
  const rendererSource = readFileSync(join(scriptDir, "../src/renderer/src/App.tsx"), "utf8");

  assert.match(databaseSource, /countRetainedProjects\(\): number[\s\S]*SELECT COUNT\(\*\) AS count FROM projects WHERE COALESCE\(kind, 'user'\) <> 'tutorial'/u);
  assert.doesNotMatch(mainSource, /getLocalProjectQuotaError|freeProjectLimit|ensureCloudProject/u);
  assert.doesNotMatch(rendererSource, /isLocalProjectQuotaExceeded|openCloudPricing/u);
});

test("project ratio persists while explicit valid video item ratios take precedence", () => {
  const databaseSource = readFileSync(join(scriptDir, "../src/main/database.ts"), "utf8");
  const mainSource = readFileSync(join(scriptDir, "../src/main/index.ts"), "utf8");
  const localAiMediaSource = readFileSync(join(scriptDir, "../src/main/local-ai-media.ts"), "utf8");

  assert.match(databaseSource, /insertDefaultProjectState\(id[\s\S]*normalizeImageRatio\(input\.imageRatio\)/);
  assert.match(databaseSource, /COALESCE\(\(SELECT image_ratio FROM storyboard_settings WHERE project_id = projects\.id\), '16:9'\) AS image_ratio/);
  assert.match(databaseSource, /imageRatio: normalizeImageRatio\(row\.image_ratio\)/);
  assert.match(mainSource, /generateStoryboardImages[\s\S]*items: input\.items\.map\(\(item\) => \(\{ \.\.\.item, aspectRatio: (?:item\.aspectRatio \|\| )?project\.imageRatio \}\)\)/);
  assert.match(mainSource, /normalizeStoryboardVideoGenerationItems\(input\.items, project\.imageRatio\)/);
  assert.match(mainSource, /function normalizeStoryboardVideoGenerationItems[\s\S]*aspectRatio: item\.method === "Seedance 2\.0"[\s\S]*resolveStoryboardVideoAspectRatio\(item\.aspectRatio, projectImageRatio\)/);
  assert.match(mainSource, /function prepareSeedanceCloudVideoTargets[\s\S]*aspectRatio: resolveStoryboardVideoAspectRatio\(item\.aspectRatio, project\.imageRatio\)/);
  assert.match(mainSource, /function resolveStoryboardVideoAspectRatio[\s\S]*isSeedanceAspectRatio\(input\)[\s\S]*normalizeImageRatio\(projectImageRatio\)/);
  assert.match(localAiMediaSource, /const aspectRatio: SeedanceAspectRatio = isSeedanceAspectRatio\(item\.aspectRatio\) \? item\.aspectRatio : "16:9"/);
});

test("standard Agent Seedance video can override the project ratio without changing Hyperframes or toolbar generation", () => {
  const rendererSource = readFileSync(join(scriptDir, "../src/renderer/src/App.tsx"), "utf8") + "\n" + readFileSync(join(scriptDir, "../src/storyboard-generation.ts"), "utf8");
  const agentSource = readFileSync(join(scriptDir, "../src/main/codex-agent.ts"), "utf8");
  const mainSource = readFileSync(join(scriptDir, "../src/main/index.ts"), "utf8");
  const i18nSource = readFileSync(join(scriptDir, "../src/renderer/src/i18n.ts"), "utf8");

  assert.match(agentSource, /aspectRatio 只用于标准 Seedance 2\.0 视频[\s\S]*1:1、4:3、3:4、16:9、9:16 或 21:9[\s\S]*图片、Hyperframes 和 dreamina_cli 操作一律写 null/u);
  assert.match(rendererSource, /collectAgentMediaRegenerationRequests[\s\S]*isSeedanceAspectRatio\(operation\.aspectRatio\)[\s\S]*seedanceAspectRatioByRowId\.set\(rowId, operation\.aspectRatio\)/u);
  assert.match(rendererSource, /executeAgentPendingOperations[\s\S]*seedanceAspectRatioByRowId: mediaRequests\.seedanceAspectRatioByRowId/u);
  assert.match(rendererSource, /function applyAgentSeedanceAspectRatioOverrides[\s\S]*target\.method !== "Seedance 2\.0"[\s\S]*return \{ \.\.\.target, aspectRatio \}/u);
  assert.match(mainSource, /aspectRatio: item\.method === "Seedance 2\.0"[\s\S]*resolveStoryboardVideoAspectRatio\(item\.aspectRatio, projectImageRatio\)[\s\S]*normalizeImageRatio\(projectImageRatio\)/u);
  assert.match(rendererSource, /onGenerateStoryboardVideos=\{\(mode, methodFilter\) => void generateStoryboardVideosFromLocal\(\{ mode, methodFilter \}\)\}/u);
  assert.match(rendererSource, /agent\.operation\.regenerateMediaWithAspectRatio/u);
  assert.match(i18nSource, /"agent\.operation\.regenerateMediaWithAspectRatio": "重新生成 \{refs\} 的\{kind\}（比例 \{aspectRatio\}）"/u);
});

test("fresh tutorial projects seed production R2 media and repair untouched partial content", () => {
  const databaseSource = readFileSync(join(scriptDir, "../src/main/database.ts"), "utf8");
  const rendererSource = readFileSync(join(scriptDir, "../src/renderer/src/App.tsx"), "utf8");
  const createTutorialProject = databaseSource.slice(
    databaseSource.indexOf("private createTutorialProject"),
    databaseSource.indexOf("private removeUntouchedSampleProject")
  );
  const getProject = databaseSource.slice(
    databaseSource.indexOf("\n  getProject(projectId:"),
    databaseSource.indexOf("async ensureProjectVideoTailPosters")
  );

  assert.match(createTutorialProject, /getTutorialStoryboardRowsForLocale\(locale\)/);
  assert.equal(getProject.indexOf("this.ensureTutorialStoryboardContent") < getProject.indexOf("this.syncTutorialBundledMediaAssets"), true);
  assert.match(databaseSource, /private ensureTutorialStoryboardContent[\s\S]*hasOfficialTutorialRowIdPrefix[\s\S]*this\.replaceRows/);
  const normalizeTutorialMediaSelection = databaseSource.slice(
    databaseSource.indexOf("private normalizeBundledTutorialMediaSelection"),
    databaseSource.indexOf("private upsertBundledTutorialMediaAsset")
  );
  assert.match(normalizeTutorialMediaSelection, /hasSelectedUserAssetOfSameKind[\s\S]*isAvailableTutorialUserAsset[\s\S]*return;/);
  assert.doesNotMatch(normalizeTutorialMediaSelection, /mediaSelectionTouched/);
  assert.match(databaseSource, /function isAvailableTutorialUserAsset[\s\S]*isHttpUrl\(asset\.local_path\)[\s\S]*statSync\(asset\.local_path\)\.isFile\(\)/);
  assert.match(rendererSource, /musk-story-\(\?:zh\|en\)-seedance-shot-/);

  const manifests = ["musk-story.zh.json", "musk-story.en.json"].map((fileName) =>
    JSON.parse(readFileSync(join(scriptDir, "../src/main/tutorial-content", fileName), "utf8"))
  );
  let remoteUrlCount = 0;
  for (const manifest of manifests) {
    assert.equal(manifest.rows.length, 14);
    assert.equal(manifest.mediaAssets.length, 18);
    assert.equal(manifest.mediaAssets.filter((asset) => asset.kind === "image").length, 7);
    assert.equal(manifest.mediaAssets.filter((asset) => asset.kind === "video").length, 11);
    const rowsById = new Map(manifest.rows.map((row) => [row.id, row]));
    for (const asset of manifest.mediaAssets) {
      assert.equal(rowsById.get(asset.rowId)?.imageAssetIds?.includes(asset.id), true);
      assert.match(asset.url, /^https:\/\/assets\.mkboard\.app\//);
      assert.doesNotMatch(asset.url, /assets\.dev\.mkboard\.app/);
      remoteUrlCount += 1;
      if (asset.kind === "video") {
        assert.match(asset.posterUrl, /^https:\/\/assets\.mkboard\.app\//);
        remoteUrlCount += 1;
      }
    }
  }
  assert.equal(remoteUrlCount, 58);
});

test("custom permission pre-dialog is removed while local BYOK vault protection remains", () => {
  const rendererSource = readFileSync(join(scriptDir, "../src/renderer/src/App.tsx"), "utf8");
  const i18nSource = readFileSync(join(scriptDir, "../src/renderer/src/i18n.ts"), "utf8");
  const rendererCssSource = readFileSync(join(scriptDir, "../src/renderer/src/styles/global.css"), "utf8");
  const byokStoreSource = readFileSync(join(scriptDir, "../src/main/byok-store.ts"), "utf8");

  assert.doesNotMatch(rendererSource, /SystemPermissionIntro|requestSystemPermissionIntro|systemPermissionIntro/);
  assert.doesNotMatch(i18nSource, /systemPermission\./);
  assert.doesNotMatch(rendererCssSource, /system-permission-intro/);
  assert.match(byokStoreSource, /0o600/);
  assert.match(byokStoreSource, /maskApiKey|maskedKey/);
});

test("onboarding create-project step closes the settings modal before project flow", () => {
  const source = readFileSync(join(scriptDir, "../src/renderer/src/App.tsx"), "utf8");

  assert.match(source, /function closeAccountAuth\(\) \{\s*setAccountAuthOpen\(false\);\s*\}/);
  assert.match(source, /if \(currentStep === "create_project"\) \{\s*closeAccountAuth\(\);[\s\S]*startCreateProject\(\);/);
  assert.match(source, /if \(currentStep === "create_project"\) \{\s*if \(accountAuthOpen\) \{\s*closeAccountAuth\(\);\s*return;\s*\}[\s\S]*void openProjects\(\);/);
  assert.match(source, /onClose=\{closeAccountAuth\}/);
});

test("bundled video runtime settings expose preferences without a HyperFrames doctor card", () => {
  const rendererSource = readFileSync(join(scriptDir, "../src/renderer/src/App.tsx"), "utf8");
  const i18nSource = readFileSync(join(scriptDir, "../src/renderer/src/i18n.ts"), "utf8");
  const rendererCssSource = readFileSync(join(scriptDir, "../src/renderer/src/styles/global.css"), "utf8");

  assert.match(rendererSource, /settings\.runtime\.videoSettingsGroup/);
  assert.match(rendererSource, /<HyperframesVideoResolutionSetting[\s\S]*<SeedanceVideoResolutionSetting[\s\S]*<VideoConcurrencySetting/);
  assert.doesNotMatch(rendererSource, /testHyperframesDoctor\(\)|HyperframesDoctorFeedback|hyperframesDoctorResult/);
  assert.match(i18nSource, /"settings\.runtime\.videoSettingsGroup": "视频设置"/);
  assert.match(i18nSource, /"onboarding\.step\.hyperframes\.title": "设置视频生成"/);
  assert.doesNotMatch(i18nSource, /HyperFrames 检查通过|HyperFrames check passed|HyperFrames 檢查通過/);
  assert.match(rendererCssSource, /\.account-settings-modal \.local-cli-group-title[\s\S]*margin: 0;[\s\S]*font-size: 14px/);
  assert.match(rendererCssSource, /\.local-cli-group[\s\S]*gap: 12px/);
  assert.doesNotMatch(rendererCssSource, /\.video-setting-option(?::|\.)[^,{]*::after/);
});

test("open-source renderer removes SaaS billing/credits and exposes local BYOK + Companion + T3 composer pills", () => {
  const source = readFileSync(join(scriptDir, "../src/renderer/src/App.tsx"), "utf8");
  assert.doesNotMatch(source, /CloudCreditLedger|startCloudBillingCheckout|claimDailyCheckIn|ForcedDesktopUpdateDialog/u);
  assert.match(source, /function ByokAndCompanionSection/u);
  assert.match(source, /composer-pills-bar/u);
  assert.match(source, /agentPermissionMode/u);
});

test("Codex CLI detection recovers an npm install exposed only by the login shell", () => {
  if (process.platform === "win32") return;

  const fixtureRoot = mkdtempSync(join(tmpdir(), "mkboard-codex-npm-shell-"));
  const fixtureHome = join(fixtureRoot, "home");
  const npmBinDir = join(fixtureRoot, "custom-npm", "bin");
  const codexBin = join(npmBinDir, "codex");
  const loginShell = join(fixtureRoot, "login-shell");
  const nodeBinDir = dirname(process.execPath);

  try {
    mkdirSync(fixtureHome, { recursive: true });
    mkdirSync(npmBinDir, { recursive: true });
    writeFileSync(
      codexBin,
      `#!/usr/bin/env node\nconst args = process.argv.slice(2).join(" ");\nif (args === "--version") console.log("codex-cli 99.0.0");\nelse if (args === "login status") console.log("Logged in using ChatGPT");\nelse process.exitCode = 2;\n`
    );
    chmodSync(codexBin, 0o755);
    writeFileSync(
      loginShell,
      `#!/bin/sh\nprintf '__MKBOARD_LOGIN_SHELL_PATH__%s\\n' "$MKBOARD_TEST_SHELL_PATH"\nprintf '%s\\n' "$MKBOARD_TEST_CODEX_BIN"\n`
    );
    chmodSync(loginShell, 0o755);

    const authModuleUrl = pathToFileURL(join(scriptDir, "../src/main/codex-auth.ts")).href;
    const loaderUrl = pathToFileURL(join(scriptDir, "register-ts-extension-loader.mjs")).href;
    const childScript = `
      import { getCodexCliStatus, resolveCodexExecutable } from ${JSON.stringify(authModuleUrl)};
      const probe = await resolveCodexExecutable();
      const status = await getCodexCliStatus();
      process.stdout.write(JSON.stringify({ probe, status }));
    `;
    const output = execFileSync(
      process.execPath,
      ["--experimental-strip-types", "--import", loaderUrl, "--input-type=module", "--eval", childScript],
      {
        encoding: "utf8",
        timeout: 20_000,
        env: {
          ...process.env,
          HOME: fixtureHome,
          PATH: "/usr/bin:/bin",
          SHELL: loginShell,
          CODEX_BIN: "",
          NPM_CONFIG_PREFIX: "",
          npm_config_prefix: "",
          MKBOARD_TEST_SHELL_PATH: `${npmBinDir}:${nodeBinDir}:/usr/bin:/bin`,
          MKBOARD_TEST_CODEX_BIN: codexBin
        }
      }
    );
    const result = JSON.parse(output);

    assert.equal(result.probe.bin, codexBin);
    assert.equal(result.probe.version, "codex-cli 99.0.0");
    assert.equal(result.probe.launchPathPrepend.includes(npmBinDir), true);
    assert.equal(result.probe.launchPathPrepend.includes(nodeBinDir), true);
    assert.equal(result.status.state, "connected");
    assert.equal(result.status.path, codexBin);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("Codex native resolver finds the nested Windows npm optional dependency behind codex.cmd", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "mkboard-codex-windows-native-"));
  const npmBinDir = join(fixtureRoot, "npm");
  const wrapperPath = join(npmBinDir, "codex.cmd");
  const nativeBinDir = join(
    npmBinDir,
    "node_modules",
    "@openai",
    "codex",
    "node_modules",
    "@openai",
    "codex-win32-x64",
    "vendor",
    "x86_64-pc-windows-msvc",
    "bin"
  );
  const nativePath = join(nativeBinDir, "codex.exe");

  try {
    mkdirSync(nativeBinDir, { recursive: true });
    writeFileSync(wrapperPath, '@echo off\r\nnode "%~dp0\\node_modules\\@openai\\codex\\bin\\codex.js" %*\r\n');
    writeFileSync(nativePath, "fixture");
    chmodSync(nativePath, 0o755);

    const resolved = resolveCodexNativeBinary(wrapperPath, "win32", "x64");
    assert.equal(resolved.path, nativePath);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("Codex status detection can launch a Windows npm codex.cmd wrapper", { skip: process.platform !== "win32" }, async () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "mkboard-codex-windows-cmd-"));
  const wrapperPath = join(fixtureRoot, "codex.cmd");
  const fixtureCliPath = join(fixtureRoot, "codex-fixture.cjs");
  const previousCodexBin = process.env.CODEX_BIN;

  try {
    writeFileSync(
      fixtureCliPath,
      'const args = process.argv.slice(2).join(" ");\nif (args === "--version") console.log("codex-cli 99.0.0");\nelse if (args === "login status") console.log("Logged in using ChatGPT");\nelse process.exitCode = 2;\n'
    );
    writeFileSync(wrapperPath, `@echo off\r\n"${process.execPath}" "${fixtureCliPath}" %*\r\n`);
    process.env.CODEX_BIN = wrapperPath;

    const probe = await resolveCodexExecutable();
    const status = await getCodexCliStatus();
    assert.equal(probe?.bin, wrapperPath);
    assert.equal(probe?.version, "codex-cli 99.0.0");
    assert.equal(status.state, "connected");
  } finally {
    if (previousCodexBin === undefined) delete process.env.CODEX_BIN;
    else process.env.CODEX_BIN = previousCodexBin;
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("queued storyboard video thumbs show the localized queue label below the icon", () => {
  const source = readFileSync(join(scriptDir, "../src/renderer/src/App.tsx"), "utf8");
  const i18nSource = readFileSync(join(scriptDir, "../src/renderer/src/i18n.ts"), "utf8");
  const rendererCssSource = readFileSync(join(scriptDir, "../src/renderer/src/styles/global.css"), "utf8");

  assert.match(source, /const activeTask = task && isActiveGenerationTaskStatus\(task\.status\) \? task : null/);
  assert.match(source, /const elapsedText = showElapsed \? formatGenerationTaskElapsedClock\(activeTask, now\) \|\| formatElapsedClock\(0\) : ""/);
  assert.match(source, /const queuedLabel = kind === "video" && activeTask\?\.status === "queued" \? t\("storyboard\.generationStatusQueued"\) : ""/);
  assert.match(source, /<StoryboardGenerationBrandIcon[\s\S]*storyboard-media-generating-queue[\s\S]*\{queuedLabel\}/);
  assert.match(i18nSource, /"storyboard\.generationStatusQueued": "排队中"[\s\S]*"storyboard\.generationStatusQueued": "Queued"[\s\S]*"storyboard\.generationStatusQueued": "排隊中"/);
  assert.match(rendererCssSource, /\.storyboard-media-generating-queue[\s\S]*white-space: nowrap/);
});

test("generation status dialog keeps Hyperframes progress user-facing", () => {
  const source = readFileSync(join(scriptDir, "../src/renderer/src/App.tsx"), "utf8");
  const i18nSource = readFileSync(join(scriptDir, "../src/renderer/src/i18n.ts"), "utf8");
  const rendererCssSource = readFileSync(join(scriptDir, "../src/renderer/src/styles/global.css"), "utf8");
  const dialogSource = source.slice(source.indexOf("function StoryboardGenerationStatusDialog"), source.indexOf("function StoryboardMediaGeneratingThumb"));

  assert.match(dialogSource, /showContentFilter \? \(/);
  assert.match(dialogSource, /getGenerationTaskProgressLabel\(task, t\)/);
  assert.match(dialogSource, /getGenerationStatusEmptyKey\(activeStatusFilter\)/);
  assert.doesNotMatch(dialogSource, /task\.stageDetail/);
  assert.doesNotMatch(dialogSource, /task\.cliLog/);
  assert.match(i18nSource, /"storyboard\.generationStatusHyperframesRender": "正在渲染视频"[\s\S]*"storyboard\.generationStatusHyperframesRender": "Rendering video"[\s\S]*"storyboard\.generationStatusHyperframesRender": "正在渲染影片"/);
  assert.match(rendererCssSource, /\.storyboard-generation-status-summary[\s\S]*flex-wrap: wrap/);
});

test("storyboard media generation locks UI before async preflight", () => {
  const source = readFileSync(join(scriptDir, "../src/renderer/src/App.tsx"), "utf8");
  const imageFunction = source.slice(
    source.indexOf("async function generateStoryboardImagesFromCloud"),
    source.indexOf("async function pollStoryboardImageBatch")
  );
  const videoFunction = source.slice(
    source.indexOf("async function generateStoryboardVideosFromLocal"),
    source.indexOf("async function cancelStoryboardVideoGenerations")
  );

  assert.match(source, /const storyboardMediaSubmitLockRef = useRef<StoryboardMediaSubmitLock \| null>\(null\)/);
  assert.match(source, /function acquireStoryboardMediaSubmitLock[\s\S]*storyboardMediaSubmitLockRef\.current[\s\S]*setStoryboardBusyAction\(action\)/);
  assert.equal(imageFunction.indexOf('acquireStoryboardMediaSubmitLock("images", targetProjectId)') < imageFunction.indexOf("getByokSettings"), true);
  assert.equal(videoFunction.indexOf('acquireStoryboardMediaSubmitLock("videos", targetProjectId)') < videoFunction.indexOf("getByokSettings"), true);
  assert.equal(imageFunction.indexOf("setStoryboardImagePreflightRowIds") < imageFunction.indexOf("getByokSettings"), true);
  assert.equal(videoFunction.indexOf("setStoryboardVideoPreflightRowIds") < videoFunction.indexOf("getByokSettings"), true);
  assert.match(imageFunction, /finally \{[\s\S]*removeGenerationRowIds\(currentRowIds, preflightScopeRowIds\)/);
  assert.match(videoFunction, /finally \{[\s\S]*removeGenerationRowIds\(currentRowIds, preflightScopeRowIds\)/);
  assert.match(source, /mergeGenerationRowIdSets\(storyboardImageGeneratingRowIds, storyboardImagePreflightRowIds, agentImageGenerationPlaceholderRowIds\)/);
  assert.match(source, /mergeGenerationRowIdSets\(storyboardVideoGeneratingRowIds, storyboardVideoPreflightRowIds, agentVideoGenerationPlaceholderRowIds\)/);
  assert.match(source, /storyboardImageGeneratingRowIds=\{storyboardImageVisibleGeneratingRowIds\}/);
  assert.match(source, /storyboardVideoGeneratingRowIds=\{storyboardVideoVisibleGeneratingRowIds\}/);
  assert.match(source, /activeStoryboardMediaRunCountsRef = useRef<Map<string, Record<StoryboardMediaAiAction, number>>>/);
  assert.match(source, /acquireStoryboardMediaSubmitLock[\s\S]*getStoryboardMediaRunCount\(action, targetProjectId\) > 0/);
  assert.match(source, /finishStoryboardMediaRun[\s\S]*activeStoryboardMediaRunCountsRef\.current\.get\(targetProjectId\)[\s\S]*delete\(targetProjectId\)/);
  assert.match(source, /getStoryboardMediaRunCount\("images", targetProjectId\) === 0 \|\| storyboardImageGeneratingRowIds\.size === 0/);
  assert.match(source, /getStoryboardMediaRunCount\("videos", targetProjectId\) === 0 \|\| storyboardVideoGeneratingRowIds\.size === 0/);
});

test("agent media generation intent predicts row placeholders without false diagnostic loading", () => {
  const rows = Array.from({ length: 14 }, (_, index) => ({
    id: `row-${index + 1}`,
    shot: String(index + 1),
    scene: index === 0 ? "A-ROLL" : "B-ROLL",
    duration: "",
    content: "",
    note: ""
  }));

  assert.deepEqual(
    inferAgentMediaGenerationPlaceholder(
      "使用即梦 CLI 严格串行生成镜头 3、7、8、9、11、12、13、14 的 Seedance 2.0 视频",
      rows
    ),
    {
      imageRowIds: [],
      videoRowIds: ["row-3", "row-7", "row-8", "row-9", "row-11", "row-12", "row-13", "row-14"]
    }
  );
  assert.deepEqual(inferAgentMediaGenerationPlaceholder("请给第 2、4 镜生成图片", rows), {
    imageRowIds: ["row-2", "row-4"],
    videoRowIds: []
  });
  assert.deepEqual(inferAgentMediaGenerationPlaceholder("为镜头 4 生成四宫格分镜参考图和 Seedance 视频", rows), {
    imageRowIds: ["row-4"],
    videoRowIds: ["row-4"]
  });
  assert.deepEqual(inferAgentMediaGenerationPlaceholder("生成所有 Seedance 2.0 视频", rows), {
    imageRowIds: [],
    videoRowIds: rows.slice(1).map((row) => row.id)
  });
  assert.deepEqual(inferAgentMediaGenerationPlaceholder("把还没有视频的镜头都生成出来", rows), {
    imageRowIds: [],
    videoRowIds: rows.slice(1).map((row) => row.id)
  });
  assert.deepEqual(inferAgentMediaGenerationPlaceholder("生成镜头 3-5 的视频", rows), {
    imageRowIds: [],
    videoRowIds: ["row-3", "row-4", "row-5"]
  });
  assert.deepEqual(inferAgentMediaGenerationPlaceholder("Use Dreamina CLI to generate videos for shots 3, 7, and 8", rows), {
    imageRowIds: [],
    videoRowIds: ["row-3", "row-7", "row-8"]
  });
  assert.deepEqual(inferAgentMediaGenerationPlaceholder("把镜头 4 的图片转视频", rows), {
    imageRowIds: [],
    videoRowIds: ["row-4"]
  });
  assert.deepEqual(inferAgentMediaGenerationPlaceholder("为什么镜头 3 的视频没有生成？", rows), {
    imageRowIds: [],
    videoRowIds: []
  });
});

test("agent media placeholders start before IPC and clean up per run", () => {
  const source = readFileSync(join(scriptDir, "../src/renderer/src/App.tsx"), "utf8");
  const sendFunction = source.slice(source.indexOf("async function dispatchAgentMessage"), source.indexOf("async function chooseAgentImageAttachments"));

  assert.equal(
    sendFunction.indexOf("startAgentMediaGenerationPlaceholderRun(clientRunId") < sendFunction.indexOf("window.mkboard.sendAgentMessage"),
    true
  );
  assert.match(source, /function startAgentMediaGenerationPlaceholderRun[\s\S]*flushSync\(\(\) => \{[\s\S]*setAgentMediaGenerationPlaceholderRuns/);
  assert.match(sendFunction, /finally \{\s*finishAgentMediaGenerationPlaceholderRun\(clientRunId\)/);
  assert.equal(
    sendFunction.indexOf("finishAgentMediaGenerationPlaceholderRun(clientRunId)") < sendFunction.indexOf("window.mkboard.cancelAgentRun(clientRunId)"),
    true
  );
  assert.match(source, /new Map\(currentRuns\)[\s\S]*nextRuns\.set\(clientRunId, \{ projectId: targetProjectId, \.\.\.placeholder \}\)/);
  assert.match(source, /collectAgentMediaGenerationPlaceholderRowIds\(agentMediaGenerationPlaceholderRuns, projectId, "image"\)/);
  assert.match(source, /collectAgentMediaGenerationPlaceholderRowIds\(agentMediaGenerationPlaceholderRuns, projectId, "video"\)/);
  assert.match(source, /if \(run\.projectId !== projectId\) return;/);
  assert.match(source, /imageGenerating \? <StoryboardMediaGeneratingThumb imageRatio=\{imageRatio\} kind="image" \/>/);
  assert.match(source, /videoGenerating \? <StoryboardMediaGeneratingThumb imageRatio=\{imageRatio\} kind="video" task=\{videoGenerationTask\} \/>/);
});

test("Dreamina Agent videos persist into generation progress and recover partial outputs", () => {
  const mainSource = readFileSync(join(scriptDir, "../src/main/index.ts"), "utf8");
  const rendererSource = readFileSync(join(scriptDir, "../src/renderer/src/App.tsx"), "utf8");
  const i18nSource = readFileSync(join(scriptDir, "../src/renderer/src/i18n.ts"), "utf8");
  const agentHandler = mainSource.slice(
    mainSource.indexOf("async function sendAgentMessageInternal"),
    mainSource.indexOf("async function dispatchCompanionRpc")
  );
  const persistedSync = mainSource.slice(
    mainSource.indexOf("async function syncPersistedStoryboardVideoTasks"),
    mainSource.indexOf("function markInterruptedStoryboardVideoTasks")
  );
  const confirmedExecution = mainSource.slice(
    mainSource.indexOf("async function executeConfirmedDreaminaAgentGeneration"),
    mainSource.indexOf("function buildConfirmedDreaminaGenerationInstruction")
  );
  const confirmedInstruction = mainSource.slice(
    mainSource.indexOf("function buildConfirmedDreaminaGenerationInstruction"),
    mainSource.indexOf("function summarizeAgentEventForStoryboardParseLog")
  );
  const recoveryFlow = mainSource.slice(
    mainSource.indexOf("async function recoverDreaminaAgentRun"),
    mainSource.indexOf("async function recoverDreaminaAgentResultsForRequest")
  );

  assert.doesNotMatch(agentHandler, /dreaminaVideoGenerationConfirmed|authorizeDreaminaAgentGeneration/);
  assert.match(agentHandler, /dreaminaRecoveryRequest[\s\S]*runStoryboardAgent/);
  assert.match(agentHandler, /allowMediaGenerationFallback: dreaminaIntent\?\.action !== "generate"/);
  assert.match(confirmedExecution, /operation\.provider !== "dreamina_cli"/);
  assert.doesNotMatch(confirmedExecution, /ensureDreaminaCliInstalled|curl -s/);
  assert.match(confirmedExecution, /resolveDreaminaVideoAspectRatio\(input\.userMessage, project\.imageRatio\)/);
  assert.match(confirmedExecution, /store\.createStoryboardVideoTask/);
  assert.match(confirmedExecution, /aspectRatio: videoAspectRatioSelection\.aspectRatio/);
  assert.match(confirmedExecution, /provider: "dreamina_cli"/);
  assert.match(confirmedExecution, /projectAspectRatio: project\.imageRatio/);
  assert.match(confirmedExecution, /videoAspectRatio: videoAspectRatioSelection\.aspectRatio/);
  assert.match(confirmedInstruction, /--ratio=\$\{videoAspectRatioSelection\.aspectRatio\}/);
  assert.match(confirmedInstruction, /用户未明确指定不同的精确视频比例，视频必须采用当前项目比例/);
  assert.match(confirmedExecution, /await recoverDreaminaAgentRun/);
  assert.match(confirmedExecution, /removeActiveStoryboardVideoRun\(input\.projectId, controller\)/);
  assert.match(recoveryFlow, /const sharedRunAspectRatio = runAspectRatios\.size === 1/);
  assert.match(recoveryFlow, /expectedAspectRatio = isSeedanceAspectRatio\(task\?\.aspect_ratio\)[\s\S]*sharedRunAspectRatio \?\? project\.imageRatio/u);
  assert.match(recoveryFlow, /await assertDreaminaVideoFileAspectRatio\([\s\S]*expectedAspectRatio[\s\S]*ffprobeBin/u);
  assert.match(recoveryFlow, /importDreaminaAgentOutputs\(input\.projectId, validatedOutputGroups\)/);
  assert.doesNotMatch(recoveryFlow, /importDreaminaAgentOutputs\(input\.projectId, outputGroups\)/);
  assert.doesNotMatch(recoveryFlow, /videoPaths\.length === 0 \|\| !group\.rowIndex/u);
  assert.match(mainSource, /discoverDreaminaSubmittedTasks\(input\.outputDir, hints\)/);
  assert.match(mainSource, /queryDreaminaTaskResult\([\s\S]*submitId: record\.submitId/);
  assert.match(mainSource, /providerTaskId: record\.submitId/);
  assert.match(persistedSync, /await recoverDreaminaAgentRun\(\{ projectId, outputDir \}\)/);
  assert.doesNotMatch(persistedSync, /应用关闭后，即梦 CLI Agent 生成已中断/);
  assert.match(persistedSync, /filter\(\(task\) => task\.provider !== "dreamina_cli"\)/);
  assert.match(mainSource, /function markInterruptedStoryboardVideoTasks[\s\S]*task\.provider === "dreamina_cli"[\s\S]*即梦服务端任务可能仍在生成/);
  assert.doesNotMatch(rendererSource, /detectDreaminaCliIntent|DreaminaAgentVideoConfirmationDialog|dreaminaVideoGenerationConfirmed/);
  assert.match(rendererSource, /isDreaminaAgentRegenerateMediaOperation/);
  assert.match(rendererSource, /window\.mkboard\.executeConfirmedDreaminaAgentGeneration/);
  assert.match(rendererSource, /<AgentOperationConfirmationCard/);
  assert.match(rendererSource, /task\.provider === "dreamina_cli"/);
  assert.match(rendererSource, /!isDreaminaAgentTask && \(task\.status === "failed" \|\| task\.status === "cancelled"\)/);
  assert.match(i18nSource, /本次操作不消耗 MkBoard 积分，将消耗即梦积分。/);
  assert.doesNotMatch(i18nSource, /agent\.dreaminaVideoConfirmation/);
  assert.match(i18nSource, /"storyboard\.generationStatusDreaminaAgentKind": "即梦 CLI Agent"/);
});

test("core project and storyboard actions expose pending state for their full async lifecycle", () => {
  const source = readFileSync(join(scriptDir, "../src/renderer/src/App.tsx"), "utf8");
  const createProjectFunction = source.slice(source.indexOf("async function createProject()"), source.indexOf("async function persistScript"));
  const parseFunction = source.slice(source.indexOf("async function generateStoryboardFromScript"), source.indexOf("async function ensureMissingStoryboardGenerationPrompts"));
  const storyboardPanel = source.slice(source.indexOf("function StoryboardPanel"), source.indexOf("function StoryboardAssetDrawer"));
  const generationDialog = source.slice(source.indexOf("function StoryboardGenerationStatusDialog"), source.indexOf("function ColumnHeaderMenu"));

  assert.match(createProjectFunction, /if \(projectCreateBusy\) return;/);
  assert.equal(createProjectFunction.indexOf("setProjectCreateBusy(true)") < createProjectFunction.indexOf("await window.mkboard.createProject"), true);
  assert.match(createProjectFunction, /finally \{\s*setProjectCreateBusy\(false\);/);
  assert.match(source, /<ProjectDialog\s+busy=\{projectCreateBusy\}/);
  assert.match(source, /<CreateModal closeDisabled=\{busy\}/);

  assert.equal(parseFunction.indexOf('setStoryboardBusyAction("parse")') < parseFunction.indexOf("await ensureSelectedCliReady()"), true);
  assert.match(parseFunction, /activeStoryboardParseRunIdRef\.current = clientRunId/);
  assert.match(parseFunction, /finally \{[\s\S]*finishStoryboardParseRun\(clientRunId\)/);

  assert.match(storyboardPanel, /async function createStoryboards[\s\S]*setLocalMutationAction\(\{ kind: "create", count \}\)[\s\S]*await onCreateStoryboards\(count\)[\s\S]*finally/);
  assert.match(storyboardPanel, /async function duplicateSelectedRows[\s\S]*setLocalMutationAction\(\{ kind: "duplicate" \}\)[\s\S]*await onDuplicateStoryboards/);
  assert.match(storyboardPanel, /async function deleteSelectedRows[\s\S]*setLocalMutationAction\(\{ kind: "delete" \}\)[\s\S]*await onDeleteStoryboards/);
  assert.match(storyboardPanel, /async function insertStoryboardAtRow[\s\S]*setLocalMutationAction\(\{ kind: "insert", rowId, placement \}\)[\s\S]*await onInsertStoryboard/);
  assert.match(storyboardPanel, /selectedImageGenerationSubmitting[\s\S]*await onGenerateStoryboardImageRows/);
  assert.match(storyboardPanel, /setSelectedImageGenerationSubmittingCount\(targetRowIds\.length\)/);
  assert.match(storyboardPanel, /selectedImageGenerationCount=\{selectedImageGenerationSubmitting \? selectedImageGenerationSubmittingCount : selectedImageGenerationRowIds\.length\}/);
  assert.match(storyboardPanel, /setSelectedVideoGenerationSubmittingCount\(targetRowIds\.length\)/);
  assert.match(storyboardPanel, /selectedVideoGenerationCount=\{selectedVideoGenerationSubmitting \? selectedVideoGenerationSubmittingCount : selectedVideoGenerationRowIds\.length\}/);

  assert.match(generationDialog, /const \[retryingTaskId, setRetryingTaskId\]/);
  assert.match(generationDialog, /const \[cancellingVideos, setCancellingVideos\]/);
  assert.match(generationDialog, /await onRetryTask\(task\)/);
  assert.match(generationDialog, /await onCancelAll\(\)/);
});

test("storyboard parse completion stays scoped to the project that started it", () => {
  const source = readFileSync(join(scriptDir, "../src/renderer/src/App.tsx"), "utf8");
  const parseFunction = source.slice(source.indexOf("async function generateStoryboardFromScript"), source.indexOf("async function ensureMissingStoryboardGenerationPrompts"));
  const workflowFunction = source.slice(source.indexOf("async function startStoryboardAgentWorkflow"), source.indexOf("function updateStoryboardAgentWorkflow"));
  const workflowUpdateFunction = source.slice(source.indexOf("function updateStoryboardAgentWorkflow"), source.indexOf("function isActiveAgentConversationRunning"));
  const pendingOperationsFunction = source.slice(source.indexOf("async function executeAgentPendingOperations"), source.indexOf("async function handleAgentPendingOperations"));

  assert.match(parseFunction, /const targetProjectId = activeProjectDetail\.project\.id/);
  assert.match(parseFunction, /startStoryboardAgentWorkflow\("parse"[\s\S]*projectId: targetProjectId/);
  assert.match(parseFunction, /generateStoryboard\(\{[\s\S]*projectId: targetProjectId/);
  assert.match(parseFunction, /if \(!isCurrentWorkspaceProjectId\(targetProjectId\)\) \{[\s\S]*ignored_stale_project_completion[\s\S]*return;/);
  assert.equal(parseFunction.indexOf("ignored_stale_project_completion") < parseFunction.indexOf("trackStoryboardRows(rows)"), true);
  assert.match(parseFunction, /const detail = await window\.mkboard\.getProject\(targetProjectId, interfaceLanguage\);[\s\S]*if \(!isCurrentWorkspaceProjectId\(targetProjectId\)\)[\s\S]*applyProjectDetail\(detail, \{ expectedStoryboardRowIds: new Set\(rows\.map\(\(row\) => row\.id\)\) \}\)/);
  assert.match(parseFunction, /applyRoute\(\{ screen: "workspace", projectId: targetProjectId, tab: "storyboard" \}\)/);
  assert.doesNotMatch(parseFunction, /openWorkspaceTab\("storyboard"\)/);
  assert.match(source, /function isCurrentWorkspaceProjectId\(targetProjectId: string\) \{\s*return currentScreenRef\.current === "workspace" && isCurrentProjectId\(targetProjectId\);/);
  assert.match(source, /currentScreenRef\.current = nextRoute\.screen;/);

  assert.match(workflowFunction, /const targetProjectId = options\.projectId \?\? currentProjectIdRef\.current/);
  assert.match(workflowFunction, /createNewAgentConversation\(targetProjectId\)/);
  assert.match(workflowFunction, /if \(isCurrentProjectId\(targetProjectId\)\) \{\s*setAgentMessages/);
  assert.match(workflowFunction, /return \{ clientRunId, conversationId, projectId: targetProjectId/);
  assert.match(workflowUpdateFunction, /if \(!isCurrentProjectId\(run\.projectId\)\) return;/);

  assert.match(pendingOperationsFunction, /if \(isCurrentProjectId\(result\.project\.project\.id\)\) applyProjectDetail\(result\.project\)/);
  assert.match(pendingOperationsFunction, /generateStoryboardFromScript\(\{ userContent: userMessage, sourceDetail: currentDetail \}\)/);
});

test("storyboard parse running state restores after reopening a project", () => {
  const sharedSource = readFileSync(join(scriptDir, "../src/shared.ts"), "utf8");
  const preloadSource = readFileSync(join(scriptDir, "../src/preload/index.ts"), "utf8");
  const mainSource = readFileSync(join(scriptDir, "../src/main/index.ts"), "utf8");
  const databaseSource = readFileSync(join(scriptDir, "../src/main/database.ts"), "utf8");
  const rendererSource = readFileSync(join(scriptDir, "../src/renderer/src/App.tsx"), "utf8");
  const restoreFunction = rendererSource.slice(
    rendererSource.indexOf("function restoreActiveStoryboardParseRun"),
    rendererSource.indexOf("async function loadProject")
  );
  const loadProjectFunction = rendererSource.slice(
    rendererSource.indexOf("async function loadProject"),
    rendererSource.indexOf("function applyRoute")
  );
  const agentEventEffect = rendererSource.slice(
    rendererSource.indexOf("if (!window.mkboard?.onAgentEvent)"),
    rendererSource.indexOf("if (!window.mkboard?.onStoryboardVideoGenerationEvent)")
  );

  assert.match(sharedSource, /getActiveStoryboardParseRun\(projectId: string\): Promise<ActiveStoryboardParseRun \| null>/);
  assert.match(preloadSource, /getActiveStoryboardParseRun: \(projectId: string\) => ipcRenderer\.invoke\("mkboard:get-active-storyboard-parse-run", projectId\)/);
  assert.match(mainSource, /activeStoryboardParseRuns\.get\(projectId\)[\s\S]*storyboardParseAlreadyRunningMessage/);
  assert.match(mainSource, /ipcMain\.handle\("mkboard:get-active-storyboard-parse-run"/);
  assert.match(mainSource, /get-active-storyboard-parse-run[\s\S]*store\.markInterruptedStoryboardParseRuns\(projectId, activeRun\?\.clientRunId\)/);
  assert.match(databaseSource, /markInterruptedStoryboardParseRuns[\s\S]*run_status IN \('queued', 'running'\)[\s\S]*event\.label === "storyboard_parse"[\s\S]*runStatus: "canceled"/);
  assert.match(restoreFunction, /activeStoryboardParseRunIdRef\.current = run\.clientRunId/);
  assert.match(restoreFunction, /markAgentClientRunRunning\(run\.clientRunId, run\.conversationId\)/);
  assert.match(restoreFunction, /setStoryboardBusyAction\("parse"\)/);
  assert.match(restoreFunction, /hasAgentClientRunTerminalEvent\(run\.clientRunId\)/);
  assert.equal(loadProjectFunction.indexOf("getActiveStoryboardParseRun") < loadProjectFunction.indexOf("getProject"), true);
  assert.match(loadProjectFunction, /restoreActiveStoryboardParseRun\(activeParseRun, detail\)/);
  assert.match(agentEventEffect, /const terminalRun = nextRunStatus === "succeeded" \|\| nextRunStatus === "failed" \|\| nextRunStatus === "canceled"/);
  assert.match(agentEventEffect, /completedStoryboardParse[\s\S]*getProject\(payload\.projectId, interfaceLanguage\)/);
  assert.match(mainSource, /function sendAgentEventToRenderer[\s\S]*mainWindow\.webContents/);
  assert.match(mainSource, /function sendAgentEventToRenderer[\s\S]*targetWebContents\.isDestroyed\(\)[\s\S]*try \{[\s\S]*targetWebContents\.send\("mkboard:agent-event", payload\)/);
  assert.match(mainSource, /app\.on\("before-quit"[\s\S]*activeAgentRuns\.values\(\)[\s\S]*controller\.abort\(\)/);
});

test("storyboard image and video completions cannot mutate another open project", () => {
  const rendererSource = readFileSync(join(scriptDir, "../src/renderer/src/App.tsx"), "utf8");
  const mainSource = readFileSync(join(scriptDir, "../src/main/index.ts"), "utf8");
  const imageGenerationFunction = rendererSource.slice(
    rendererSource.indexOf("async function generateStoryboardImagesFromCloud"),
    rendererSource.indexOf("async function pollStoryboardImageBatch")
  );
  const imagePollFunction = rendererSource.slice(
    rendererSource.indexOf("async function pollStoryboardImageBatch"),
    rendererSource.indexOf("function handleCloudGenerationError")
  );
  const activeGenerationSyncFunction = rendererSource.slice(
    rendererSource.indexOf("async function syncActiveStoryboardGenerationState"),
    rendererSource.indexOf("async function restoreActiveStoryboardGenerationState")
  );
  const videoGenerationFunction = rendererSource.slice(
    rendererSource.indexOf("async function generateStoryboardVideosFromLocal"),
    rendererSource.indexOf("async function cancelStoryboardVideoGenerations")
  );
  const mediaUpdateFunction = rendererSource.slice(
    rendererSource.indexOf("function applyShotMediaUpdate"),
    rendererSource.indexOf("async function renameProjectAsset")
  );
  const videoEventHandler = rendererSource.slice(
    rendererSource.indexOf("if (!window.mkboard?.onStoryboardVideoGenerationEvent)"),
    rendererSource.indexOf("if (storyboardBusyAction !== \"videos\"")
  );
  // The IPC handlers delegate to these functions, which the MCP generation tools call too.
  const imageSyncHandler = mainSource.slice(
    mainSource.indexOf("async function syncStoryboardImageBatch("),
    mainSource.indexOf("async function syncActiveStoryboardImageGenerations(")
  );
  const videoGenerationHandler = mainSource.slice(
    mainSource.indexOf("async function runStoryboardVideoGeneration("),
    mainSource.indexOf("function cancelStoryboardVideoGenerations(")
  );
  assert.match(mainSource, /ipcMain\.handle\("mkboard:sync-storyboard-image-batch", \(_event, input: StoryboardImageBatchSyncInput\) => syncStoryboardImageBatch\(input\)\)/);
  assert.match(mainSource, /ipcMain\.handle\("mkboard:generate-storyboard-videos", \(event, input: StoryboardVideoBatchInput\) => runStoryboardVideoGeneration\(input, event\.sender\)\)/);

  const imageSubmitCompletion = imageGenerationFunction.slice(imageGenerationFunction.indexOf("const result = await window.mkboard.generateStoryboardImages"));
  assert.equal(imageSubmitCompletion.indexOf("if (!isCurrentProjectId(targetProjectId)) return;") < imageSubmitCompletion.indexOf("setStoryboardImageGenerationTasks"), true);
  assert.match(imagePollFunction, /syncStoryboardImageBatch\([\s\S]*if \(!isCurrentProjectId\(input\.projectId\)\) return summary;[\s\S]*applyShotMediaUpdate\(syncResult\.data, input\.projectId\)/);
  assert.match(activeGenerationSyncFunction, /const expectedStoryboardRowIds = getCurrentStoryboardRowIds\(\)[\s\S]*syncActiveStoryboardImageGenerations\(targetProjectId\)[\s\S]*currentProjectIdRef\.current !== targetProjectId[\s\S]*applyShotMediaUpdate\(imageResult\.data, targetProjectId, expectedStoryboardRowIds\)/);

  const videoCompletion = videoGenerationFunction.slice(videoGenerationFunction.indexOf("const result = await generationPromise"));
  assert.equal(videoCompletion.indexOf("if (!isCurrentProjectId(targetProjectId)) return;") < videoCompletion.indexOf("applyShotMediaUpdate(result, targetProjectId)"), true);
  assert.match(mediaUpdateFunction, /if \(!isCurrentProjectId\(targetProjectId\)\) return;[\s\S]*storyboardRowIdSetsEqual[\s\S]*return;[\s\S]*trackStoryboardRows\(result\.rows\);\s*setAssets\(result\.assets\)/);
  assert.equal(videoEventHandler.indexOf("if (payload.projectId !== currentProjectIdRef.current) return;") < videoEventHandler.indexOf("applyShotMediaUpdate(payload.mediaUpdate, payload.projectId, expectedStoryboardRowIds)"), true);
  assert.match(videoEventHandler, /getCurrentStoryboardRowIds\(\)[\s\S]*applyShotMediaUpdate\(payload\.mediaUpdate, payload\.projectId, expectedStoryboardRowIds\)/);
  assert.match(videoEventHandler, /getProject\(payload\.projectId, interfaceLanguage\)[\s\S]*currentProjectIdRef\.current === payload\.projectId[\s\S]*applyProjectDetail\(detail, \{ expectedStoryboardRowIds \}\)/);

  assert.match(imageSyncHandler, /importStoryboardImageTasks\(input\.projectId, input\.overwriteExisting/);
  assert.match(videoGenerationHandler, /projectId: input\.projectId,[\s\S]*sendVideoGenerationEvent/);
  assert.match(videoGenerationHandler, /store\.getShotMediaUpdate\(input\.projectId\)/);
});

test("KIE delivery retry reuses the existing task without regenerating", () => {
  const localAiMediaSource = readFileSync(join(scriptDir, "../src/main/local-ai-media.ts"), "utf8");
  const databaseSource = readFileSync(join(scriptDir, "../src/main/database.ts"), "utf8");
  const mainSource = readFileSync(join(scriptDir, "../src/main/index.ts"), "utf8");
  const rendererSource = readFileSync(join(scriptDir, "../src/renderer/src/App.tsx"), "utf8");
  const retryHandler = rendererSource.slice(
    rendererSource.indexOf("async function retryStoryboardGenerationTask"),
    rendererSource.indexOf("async function createStoryboardRows")
  );
  const desktopRetryHandler = mainSource.slice(
    mainSource.indexOf("async function retryStoryboardGenerationDelivery"),
    mainSource.indexOf("function resolveImageDeliveryRetryTask")
  );
  const localRetryHandler = localAiMediaSource.slice(
    localAiMediaSource.indexOf("async retryStoryboardGenerationDelivery"),
    localAiMediaSource.indexOf("private async refreshRunningImageTasks")
  );

  assert.match(localRetryHandler, /pollKieTaskStatus/);
  assert.doesNotMatch(localRetryHandler, /createTask|submitKie/);
  assert.match(mainSource, /mkboard:retry-storyboard-generation-delivery/);
  assert.match(mainSource, /localDeliveryAttemptCount/);
  assert.doesNotMatch(desktopRetryHandler, /generateStoryboardImages|generateStoryboardVideos/);
  assert.match(retryHandler, /retryStoryboardGenerationDelivery/);
  assert.match(retryHandler, /Boolean\(task\.canRetryDelivery \|\| task\.localDeliveryFailed\)/);
  assert.match(retryHandler, /task\.providerTaskId \|\| task\.id/);
  assert.doesNotMatch(retryHandler, /generateStoryboardImages/);
  assert.match(databaseSource, /getStoryboardVideoTaskByProviderTaskId/);
  assert.match(mainSource, /providerMatchedLocalTask/);
  assert.match(mainSource, /olderDeliveryRecoveryRecords[\s\S]*persistedStoryboardVideoDeliveryState\(task\)\.canRetryDelivery === true/);
  assert.match(rendererSource, /storyboard\.generationStatusRetryDelivery/);
});

test("image local delivery recovery survives restart beyond the cloud active window", () => {
  const databaseSource = readFileSync(join(scriptDir, "../src/main/database.ts"), "utf8");
  const mainSource = readFileSync(join(scriptDir, "../src/main/index.ts"), "utf8");
  const recoverySchema = databaseSource.slice(
    databaseSource.indexOf("CREATE TABLE IF NOT EXISTS storyboard_image_delivery_recoveries"),
    databaseSource.indexOf("CREATE TABLE IF NOT EXISTS assets")
  );
  const activeImageSync = mainSource.slice(
    mainSource.indexOf("async function syncActiveStoryboardImageGenerations("),
    mainSource.indexOf("async function runStoryboardVideoGeneration(")
  );

  assert.match(recoverySchema, /CREATE TABLE IF NOT EXISTS storyboard_image_delivery_recoveries/);
  assert.match(recoverySchema, /project_id TEXT NOT NULL REFERENCES projects\(id\) ON DELETE CASCADE/);
  assert.match(recoverySchema, /row_id TEXT NOT NULL REFERENCES shots\(id\) ON DELETE CASCADE/);
  assert.doesNotMatch(recoverySchema, /ALTER TABLE/);
  assert.match(databaseSource, /ON CONFLICT\(project_id, task_id\) DO UPDATE SET/);
  assert.match(databaseSource, /listStoryboardImageDeliveryRecoveries/);
  assert.match(activeImageSync, /mergePersistedStoryboardImageDeliveryRecoveries\(projectId, activeResult\.data\.tasks\)/);
  assert.match(mainSource, /persistStoryboardImageDeliveryRecovery\(projectId, task, message, localDelivery\.attemptCount\)/);
  assert.match(mainSource, /store\.deleteStoryboardImageDeliveryRecovery\(projectId, task\.taskId\)/);
});

test("storyboard image polling keeps transient provider timeouts retryable", () => {
  const rendererSource = readFileSync(join(scriptDir, "../src/renderer/src/App.tsx"), "utf8");
  const localAiMediaSource = readFileSync(join(scriptDir, "../src/main/local-ai-media.ts"), "utf8");
  const pollFunction = rendererSource.slice(
    rendererSource.indexOf("async function pollStoryboardImageBatch"),
    rendererSource.indexOf("function handleCloudGenerationError")
  );

  assert.match(rendererSource, /const STORYBOARD_IMAGE_POLL_TIMEOUT_MS = 30 \* 60 \* 1000/);
  assert.match(rendererSource, /function isTransientCloudGenerationPollError[\s\S]*NETWORK_TIMEOUT[\s\S]*NETWORK_ERROR[\s\S]*status >= 500/);
  assert.match(pollFunction, /isTransientCloudGenerationPollError\(syncResult\.error\.code, syncResult\.error\.message\)[\s\S]*continue;/);
  assert.equal(
    pollFunction.indexOf("isTransientCloudGenerationPollError(syncResult.error.code, syncResult.error.message)") < pollFunction.indexOf("handleCloudGenerationError"),
    true
  );
  assert.match(localAiMediaSource, /pollKieTaskStatus/);
});

test("blank storyboard cells render placeholder state instead of persisted filler copy", () => {
  const databaseSource = readFileSync(join(scriptDir, "../src/main/database.ts"), "utf8");
  const agentResponseSource = readFileSync(join(scriptDir, "../src/main/agent-response.ts"), "utf8");
  const rendererSource = readFileSync(join(scriptDir, "../src/renderer/src/App.tsx"), "utf8");

  assert.match(databaseSource, /function createEmptyShotRecord[\s\S]*scene: ""[\s\S]*content: ""[\s\S]*note: ""/);
  assert.match(databaseSource, /normalizeLegacyShotPlaceholder[\s\S]*trimmedValue === "输入备注"[\s\S]*return ""/);
  assert.match(agentResponseSource, /readStringField\(row, \["scene", "类别", "景别"\], ""\)/);
  assert.match(rendererSource, /function getStoryboardDisplayCellValue[\s\S]*isPromptPlaceholderValue\(trimmedValue\)[\s\S]*return ""/);
  assert.match(rendererSource, /className="prompt-disabled-cell placeholder-cell"/);
  assert.match(rendererSource, /data-placeholder=\{getStoryboardPromptPlaceholder/);

  const createStore = createFakeStore();
  const createdRows = createStore.createShots(projectId, 1);
  const createdRow = createdRows.at(-1);
  assert.equal(createdRow.scene, "");
  assert.equal(createdRow.content, "");
  assert.equal(createdRow.note, "");

  const insertStore = createFakeStore();
  const insertedRows = insertStore.insertShot(projectId, "row-1", "after");
  const insertedRow = insertedRows[1];
  assert.equal(insertedRow.scene, "");
  assert.equal(insertedRow.content, "");
  assert.equal(insertedRow.note, "");
});

test("storyboard editable cells paste and wrap as plain text", () => {
  const rendererSource = readFileSync(join(scriptDir, "../src/renderer/src/App.tsx"), "utf8");
  const rendererCssSource = readFileSync(join(scriptDir, "../src/renderer/src/styles/global.css"), "utf8");

  assert.match(rendererSource, /event\.clipboardData\.getData\("text\/plain"\)/);
  assert.match(rendererSource, /function handleStoryboardPlainTextPaste[\s\S]*event\.preventDefault\(\)[\s\S]*insertStoryboardEditableText\(event\.currentTarget, plainText\)/);
  assert.match(rendererSource, /function handleStoryboardEditableKeyDown[\s\S]*event\.key !== "Enter"[\s\S]*insertStoryboardEditableText\(event\.currentTarget, "\\n"\)/);
  assert.match(rendererSource, /onPaste=\{readOnly \? undefined : handleStoryboardPlainTextPaste\}/);
  assert.match(rendererSource, /onKeyDown=\{readOnly \? undefined : handleStoryboardEditableKeyDown\}/);
  assert.match(rendererCssSource, /\.storyboard-row:not\(\.header\) > div\[contenteditable="true"\] \{[\s\S]*display: block/);
  assert.match(rendererCssSource, /\.storyboard-prompt-text \{[\s\S]*display: block/);
});

test("claude code recovers complete structured output before reporting close failure", () => {
  const source = readFileSync(join(scriptDir, "../src/main/codex-agent.ts"), "utf8");

  assert.match(source, /const settleRecoveredClaudeResult = \(reason: "stream_error" \| "close_failed"/);
  assert.match(source, /let structuredToolOutput = ""/);
  assert.match(source, /stringifyClaudeStructuredOutputToolInput\(event\)/);
  assert.match(source, /if \(isNonEmptyRecord\(parsed\.structured_output\)\) return JSON\.stringify\(parsed\.structured_output\)/);
  assert.doesNotMatch(source, /function extractClaudeCodeResult[\s\S]*return stdout\.trim\(\)/);
  assert.doesNotMatch(source, /settleRecoveredClaudeResult\("stdout_complete"\)/);
  assert.match(source, /child\.stdout\.on\("data"[\s\S]*stream\.feed\(chunk\)/);
  assert.match(source, /if \(code !== 0\) \{\s*if \(settleRecoveredClaudeResult\("close_failed"\)\) \{\s*return;\s*\}/);
  assert.match(source, /const recoveredHasWrites = recoveredAgentResultHasWrites\(recovered\)/);
  assert.match(source, /label: reason === "stream_error" \? "warning" : recoveredHasWrites \? "writing" : "running"/);
  assert.match(source, /function recoveredAgentResultHasWrites[\s\S]*Array\.isArray\(output\.operations\)[\s\S]*Array\.isArray\(output\.rows\)[\s\S]*output\.scriptHtml/);
  assert.match(source, /function readRecoverableClaudeResult[\s\S]*isRecoverableResult\(structuredToolOutput\)[\s\S]*isRecoverableResult\(lastMessage\)[\s\S]*isRecoverableResult\(stdoutResult\)/);
  assert.match(source, /function containsCompleteJsonObject[\s\S]*isNonEmptyRecord\(safeParseJson\(jsonText\)\)/);
  assert.match(source, /function stringifyClaudeStructuredOutputToolInput[\s\S]*event\.name !== "StructuredOutput"[\s\S]*containsCompleteJsonObject\(output\)/);
  assert.doesNotMatch(source, /function readRecoverableClaudeResult[\s\S]*streamError: string/);
});

test("default storyboard skills are localized and receive language context", () => {
  const databaseSource = readFileSync(join(scriptDir, "../src/main/database.ts"), "utf8");
  const sharedSource = readFileSync(join(scriptDir, "../src/shared.ts"), "utf8");
  const mainSource = readFileSync(join(scriptDir, "../src/main/index.ts"), "utf8");
  const preloadSource = readFileSync(join(scriptDir, "../src/preload/index.ts"), "utf8");
  const agentSource = readFileSync(join(scriptDir, "../src/main/codex-agent.ts"), "utf8");
  const rendererSource = readFileSync(join(scriptDir, "../src/renderer/src/App.tsx"), "utf8");

  assert.match(databaseSource, /const storyboardSkillName = "Default Storyboard Skill"/);
  assert.match(databaseSource, /const chineseStoryboardSkillId = "storyboard-split-zh"/);
  assert.match(databaseSource, /const chineseStoryboardSkillName = "默认分镜技能"/);
  assert.match(databaseSource, /const systemStoryboardSkillIds = new Set\(\[storyboardSkillId, chineseStoryboardSkillId\]\)/);
  assert.match(databaseSource, /# Default Storyboard Skill/);
  assert.match(databaseSource, /# 默认分镜技能/);
  assert.match(databaseSource, /## Language Resolution/);
  assert.match(databaseSource, /## 语言解析/);
  assert.match(databaseSource, /## Duration Rules/);
  assert.match(databaseSource, /## 时长规则/);
  assert.match(databaseSource, /## Video Prompt Rules[\s\S]*Never request BGM[\s\S]*hard cut/);
  assert.match(databaseSource, /## 视频提示词规则[\s\S]*禁止生成 BGM[\s\S]*直接硬切/);
  assert.match(databaseSource, /Seedance 2\.0 video rows[\s\S]*Use 12 seconds as the normal target/);
  assert.match(databaseSource, /Seedance 2\.0 视频行[\s\S]*常规目标用 12 秒/);
  assert.match(databaseSource, /Hyperframes video rows[\s\S]*10 to 20 seconds/);
  assert.match(databaseSource, /Hyperframes prompts must stay renderable[\s\S]*3-5 staged phases/);
  assert.match(databaseSource, /zh-CN \/ zh-TW means Chinese, en means English/);
  assert.match(databaseSource, /zh-CN \/ zh-TW 使用中文，en 使用英文/);
  assert.match(databaseSource, /Keep the current default template columns: Sort, Shot, Frame, Category, Duration \(s\), Content, Notes\./);
  assert.match(databaseSource, /保持当前默认模板列：排序、镜号、画面、类别、时长（秒）、内容、备注。/);
  assert.match(databaseSource, /Also fill these three custom columns: Image prompt, Video prompt, Generation method\./);
  assert.match(databaseSource, /同时填写这三个自定义列：图片提示词、视频提示词、生成方式。/);
  assert.match(databaseSource, /listSkills\(interfaceLanguage\?: InterfaceLanguage\): Skill\[\]/);
  assert.match(databaseSource, /row\.id === defaultStoryboardSkillId/);
  assert.match(databaseSource, /getLocalizedStoryboardSkillId\(this\.getStoryboardSkillId\(projectId\), interfaceLanguage\)/);
  assert.match(databaseSource, /existing\.locked !== 1/);
  assert.doesNotMatch(databaseSource, /Chinese templates use|图像提示词 \/ Image prompt|视频提示词 \/ Video prompt|生成方式 \/ Generation method|Do not write 无, 留空/);
  assert.match(sharedSource, /interfaceLanguage\?: InterfaceLanguage/);
  assert.match(sharedSource, /listSkills\(interfaceLanguage\?: InterfaceLanguage\): Promise<Skill\[\]>/);
  assert.match(sharedSource, /initialStoryboardColumns: StoryboardColumn\[\] = getDefaultStoryboardColumns\(\)/);
  assert.match(sharedSource, /getStoryboardTemplateLanguage\(interfaceLanguage\?: InterfaceLanguage\): StoryboardTemplateLanguage \{\s*return interfaceLanguage === "zh-CN" \|\| interfaceLanguage === "zh-TW" \? "zh" : "en";\s*\}/);
  assert.match(preloadSource, /listSkills: \(interfaceLanguage\?: InterfaceLanguage\) => ipcRenderer\.invoke\("mkboard:list-skills", interfaceLanguage\)/);
  assert.match(rendererSource, /interfaceLanguage,/);
  assert.match(rendererSource, /const DEFAULT_ZH_STORYBOARD_SKILL_ID = "storyboard-split-zh"/);
  assert.match(rendererSource, /window\.mkboard\.listSkills\(interfaceLanguage\)/);
  assert.match(mainSource, /interfaceLanguage,/);
  assert.match(mainSource, /mkboard:list-skills"[\s\S]*store\.listSkills\(normalizeInterfaceLanguage\(interfaceLanguage\)\)/);
  assert.match(mainSource, /userVisibleMessage: userMessage/);
  assert.match(agentSource, /## 用户选择的界面语言/);
  assert.match(agentSource, /## 对话可见输出语言/);
  assert.match(agentSource, /All natural-language text visible in the conversation panel/);
  assert.match(agentSource, /Do not choose the conversation output language from the current script language/);
  assert.match(agentSource, /脚本语言明确时优先脚本语言/);
  assert.match(agentSource, /Seedance 2\.0 行的 row\.duration 必须至少 10 秒/);
  assert.match(agentSource, /Hyperframes 行的 row\.duration 必须在 10 到 20 秒之间/);
  assert.match(agentSource, /所有新生成或补齐的视频提示词优先控制在 1-3 个短句内/);
  assert.match(agentSource, /无 BGM \/ 不生成背景音乐[\s\S]*相邻 Shot 直接硬切/);
  assert.match(agentSource, /当前项目只负责一个独立 Shot[\s\S]*视频边界由 MkBoard 在后期直接硬切/);
  assert.match(rendererSource, /无 BGM，只保留匹配画面动作或环境的音效[\s\S]*相邻 Shot 硬切，不做转场动画/);
  assert.match(rendererSource, /No BGM; generate only action- or ambience-matched sound effects[\s\S]*Hard cut between shots with no transition animation/);
  assert.match(agentSource, /使用即梦 CLI \/ Dreamina CLI 新生成[\s\S]*provider 写为 dreamina_cli[\s\S]*不要在本轮直接运行即梦 CLI/);
  assert.match(agentSource, /当 operations 包含 regenerate_media[\s\S]*不要声称已经开始或完成生成/);
  assert.match(agentSource, /path 严格等于 "index\.html"[\s\S]*退化成更简洁但完整可渲染/);
  assert.match(agentSource, /Data-heavy, process-heavy[\s\S]*3-5 clear phases/);
});

test("storyboard video duration and method selection stay above safe defaults", () => {
  const rendererSource = readFileSync(join(scriptDir, "../src/renderer/src/App.tsx"), "utf8") + "\n" + readFileSync(join(scriptDir, "../src/storyboard-generation.ts"), "utf8");
  const desktopMainSource = readFileSync(join(scriptDir, "../src/main/index.ts"), "utf8");
  const localVideoSource = readFileSync(join(scriptDir, "../src/main/local-video.ts"), "utf8");
  const localAiMediaSource = readFileSync(join(scriptDir, "../src/main/local-ai-media.ts"), "utf8");

  assert.match(rendererSource, /type StoryboardVideoGenerationMethodFilter = "hyperframes" \| "seedance" \| "all"/);
  assert.match(rendererSource, /storyboardVideoMethodFilterOptions[\s\S]*aiVideoMethodHyperframesTitle[\s\S]*aiVideoMethodSeedanceTitle[\s\S]*aiVideoMethodAllTitle/);
  assert.match(rendererSource, /filterStoryboardVideoTargetsByMethod[\s\S]*methodFilter === "hyperframes"[\s\S]*methodFilter === "seedance"/);
  assert.match(rendererSource, /onConfirm\(effectiveMediaMode, action === "videos" \? selectedVideoMethodFilter : "all"\)/);
  assert.match(rendererSource, /durationSec: resolveStoryboardVideoDurationSec\(row, prompt, method\)/);
  assert.match(rendererSource, /function resolveStoryboardVideoDurationSec[\s\S]*method === "Seedance 2\.0" \? 12 : 10[\s\S]*method === "Seedance 2\.0" \? 15 : 20/);
  assert.match(desktopMainSource, /function normalizeSeedanceCloudVideoDuration[\s\S]*return 12[\s\S]*Math\.max\(10, Math\.min\(15/);
  assert.match(desktopMainSource, /function normalizeStoryboardVideoDuration\(input: unknown, method: StoryboardVideoGenerationMethod\)[\s\S]*method === "Seedance 2\.0"[\s\S]*Math\.max\(10, Math\.min\(20/);
  assert.match(localVideoSource, /const defaultVideoDurationSec = 10/);
  assert.match(localVideoSource, /function normalizeDurationSec[\s\S]*Math\.max\(10, Math\.min\(20/);
  assert.match(localAiMediaSource, /const durationSec = typeof item\.durationSec === "number" && Number\.isFinite\(item\.durationSec\) \? item\.durationSec : 12/);
});

test("agent parser normalizes operations and storyboard-generation rows", () => {
  const operationResponse = parseAgentResponse(
    JSON.stringify({
      reply: "已理解。",
      operations: [
        {
          type: "sync_script_a_roll_tags",
          script_html: "<p>&lt;A&gt;第 1 镜旧内容&lt;/A&gt;</p>"
        },
        {
          type: "insert_shots",
          row_ref: { kind: "index", value: "3" },
          placement: "after",
          count: "2",
          rows: [
            { scene: "B-ROLL", content: "新增画面", customValues: { "custom-1": "新增图像提示词" } }
          ]
        },
        {
          type: "regenerate_media",
          row_refs: [{ kind: "index", value: 3 }],
          kind: "image",
          aspect_ratio: "21:9"
        },
        {
          kind: "regenerate_media",
          mediaKind: "video",
          rowRefs: [{ kind: "id", value: "row-2" }],
          provider: "dreamina_cli"
        },
        {
          type: "regenerate_media",
          kind: "video",
          rowRefs: [{ kind: "id", value: "row-3" }],
          aspect_ratio: "21:9"
        },
        {
          type: "regenerate_media",
          kind: "video",
          rowRefs: [{ kind: "id", value: "row-4" }],
          aspectRatio: "5:4"
        }
      ],
      scriptHtml: null,
      rows: null
    }),
    "Codex CLI",
    columns
  );

  assert.deepEqual(operationResponse.operations?.[0], {
    type: "sync_script_a_roll_tags",
    scriptHtml: "<p>&lt;A&gt;第 1 镜旧内容&lt;/A&gt;</p>"
  });
  assert.equal(operationResponse.operations?.[1]?.type, "insert_shots");
  assert.deepEqual(operationResponse.operations?.[1]?.rowRef, { kind: "index", value: 3 });
  assert.equal(operationResponse.operations?.[1]?.placement, "after");
  assert.equal(operationResponse.operations?.[1]?.count, 2);
  assert.equal(operationResponse.operations?.[1]?.rows?.[0]?.scene, "B-ROLL");
  assert.equal(operationResponse.operations?.[1]?.rows?.[0]?.content, "新增画面");
  assert.deepEqual(operationResponse.operations?.[1]?.rows?.[0]?.imageAssetIds, []);
  assert.deepEqual(operationResponse.operations?.[1]?.rows?.[0]?.customValues, { "custom-1": "新增图像提示词" });
  assert.deepEqual(operationResponse.operations?.[2], {
    type: "regenerate_media",
    rowRefs: [{ kind: "index", value: 3 }],
    kind: "image",
    overwriteExisting: true
  });
  assert.deepEqual(operationResponse.operations?.[3], {
    type: "regenerate_media",
    rowRefs: [{ kind: "id", value: "row-2" }],
    kind: "video",
    overwriteExisting: true,
    provider: "dreamina_cli"
  });
  assert.deepEqual(operationResponse.operations?.[4], {
    type: "regenerate_media",
    rowRefs: [{ kind: "id", value: "row-3" }],
    kind: "video",
    overwriteExisting: true,
    aspectRatio: "21:9"
  });
  assert.deepEqual(operationResponse.operations?.[5], {
    type: "regenerate_media",
    rowRefs: [{ kind: "id", value: "row-4" }],
    kind: "video",
    overwriteExisting: true
  });

  const kindTypeResponse = parseAgentResponse(
    JSON.stringify({
      reply: "已更新脚本。",
      operations: [{ kind: "update_script", scriptHtml: "<p>新脚本</p>" }]
    }),
    "Claude Code",
    columns
  );
  assert.deepEqual(kindTypeResponse.operations, [{ type: "update_script", scriptHtml: "<p>新脚本</p>" }]);

  const storyboardResponse = parseAgentResponse(
    JSON.stringify({
      reply: "已拆分。",
      operations: [],
      scriptHtml: null,
      rows: [
        {
          id: "model-row-1",
          shot: "ignored",
          scene: "B-ROLL",
          duration: 3,
          content: "演示 MkBoard 分镜表",
          note: "产品界面录屏",
          imageAssetIds: ["asset-a"],
          imageAssetId: null,
          customValues: {
            "custom-1": "清晰的产品界面静帧",
            "custom-2": "鼠标移动并高亮分镜行",
            "custom-3": "Hyperframes",
            "图像提示词": "不应通过可见列名写入"
          }
        }
      ]
    }),
    "Claude Code",
    columns
  );

  assert.equal(storyboardResponse.rows?.[0]?.shot, "1");
  assert.equal(storyboardResponse.rows?.[0]?.customValues?.["custom-1"], "清晰的产品界面静帧");
  assert.equal(storyboardResponse.rows?.[0]?.customValues?.["custom-2"], "鼠标移动并高亮分镜行");
  assert.equal(storyboardResponse.rows?.[0]?.customValues?.["custom-3"], "Hyperframes");
  assert.equal("图像提示词" in (storyboardResponse.rows?.[0]?.customValues ?? {}), false);
});

test("ordinary chat produces no writes", () => {
  const store = createFakeStore();
  const before = store.snapshot();
  const events = [];
  const result = applyAgentResponseWrites(store, projectId, { reply: "这是普通说明。", operations: [] }, (event) => events.push(event));

  assert.deepEqual(result, { appliedOperations: [], pendingOperations: [] });
  assert.deepEqual(store.snapshot(), before);
  assert.equal(events.length, 0);
});

test("safe operations apply immediately and only touch addressed cells", () => {
  const store = createFakeStore();
  const events = [];
  const response = parseAgentResponse(
    JSON.stringify({
      reply: "已更新脚本和第 2 镜。",
      operations: [
        { type: "update_script", script_html: "<p>新的脚本</p>" },
        {
          type: "update_shot_cells",
          row_ref: { kind: "index", value: 2 },
          cells: [
            { field: "content", value: "第 2 镜的新内容" },
            { field: "custom-1", value: "第 2 镜的新图像提示词" }
          ]
        },
        {
          type: "update_shot_media",
          rowRef: { kind: "id", value: "row-2" },
          assetIds: ["asset-image-1", "asset-image-2"]
        }
      ],
      scriptHtml: null,
      rows: null
    }),
    "Codex CLI",
    columns
  );

  const result = applyAgentResponseWrites(store, projectId, response, (event) => events.push(event));

  assert.equal(result.appliedOperations.length, 3);
  assert.equal(result.pendingOperations.length, 0);
  assert.equal(store.getScriptHtml(), "<p>新的脚本</p>");
  assert.equal(store.row("row-2").content, "第 2 镜的新内容");
  assert.equal(store.row("row-2").customValues["custom-1"], "第 2 镜的新图像提示词");
  assert.equal(store.row("row-2").customValues["custom-2"], "旧视频提示词 2");
  assert.deepEqual(store.row("row-2").imageAssetIds, ["asset-image-1", "asset-image-2"]);
  assert.equal(events.at(0)?.label, "writing");
  assert.equal(events.at(-1)?.kind, "tool_result");
});

test("storyboard media assets can be shared across rows", () => {
  const store = createFakeStore();

  applyConfirmedAgentOperations(store, projectId, [
    { type: "update_shot_media", rowRef: { kind: "id", value: "row-1" }, assetIds: ["asset-image-1"] },
    { type: "update_shot_media", rowRef: { kind: "id", value: "row-2" }, assetIds: ["asset-image-1"] }
  ]);

  assert.deepEqual(store.row("row-1").imageAssetIds, ["asset-image-1"]);
  assert.deepEqual(store.row("row-2").imageAssetIds, ["asset-image-1"]);
});

test("agent cell writes require current storyboard column ids for custom fields", () => {
  const store = createFakeStore();
  const before = store.snapshot();

  assert.throws(
    () =>
      applyConfirmedAgentOperations(store, projectId, [
        { type: "update_shot_cells", rowRef: { kind: "index", value: 2 }, cells: [{ field: "图像提示词", value: "不应写入" }] }
      ]),
    /请使用当前分镜字段 JSON 中的 column id/
  );
  assert.deepEqual(store.snapshot(), before);
});

test("a-roll tag sync writes the model-provided full script without local matching", () => {
  const store = createFakeStore();
  const events = [];
  const nextScriptHtml = "<p>&lt;A&gt;第 1 镜旧内容&lt;/A&gt;</p><p>第 2 镜旧内容</p>";

  const result = applyAgentResponseWrites(
    store,
    projectId,
    {
      reply: "已根据分镜给脚本补充 A 标签。",
      operations: [{ type: "sync_script_a_roll_tags", scriptHtml: nextScriptHtml }]
    },
    (event) => events.push(event)
  );

  assert.deepEqual(result.appliedOperations, [{ type: "sync_script_a_roll_tags", scriptHtml: nextScriptHtml }]);
  assert.equal(result.pendingOperations.length, 0);
  assert.equal(store.getScriptHtml(), nextScriptHtml);
  assert.equal(events.at(1)?.name, "project_write");
});

test("script prefix wording does not synthesize insert operations", () => {
  const store = createFakeStore();
  const response = completeAgentResponseFromDirectStoryboardIntent(
    { reply: "已在脚本第一段开头加上前缀。", operations: [{ type: "update_script", scriptHtml: "<p>前缀：脚本</p>" }] },
    store.getProject(projectId),
    "把当前脚本第一段开头加上“前缀：”，只改脚本，不要改分镜。"
  );

  assert.deepEqual(response.operations, [{ type: "update_script", scriptHtml: "<p>前缀：脚本</p>" }]);
});

test("custom prompt column ids update their own columns only", () => {
  const store = createFakeStore();

  applyConfirmedAgentOperations(store, projectId, [
    {
      type: "update_shot_cells",
      rowRef: { kind: "index", value: 2 },
      cells: [{ field: "custom-2", value: "只改视频提示词" }]
    }
  ]);

  assert.equal(store.row("row-2").customValues["custom-1"], "旧图像提示词 2");
  assert.equal(store.row("row-2").customValues["custom-2"], "只改视频提示词");
});

test("direct Hyperframes shot command fills cells and queues video regeneration", () => {
  const store = createFakeStore();
  applyConfirmedAgentOperations(store, projectId, [
    {
      type: "update_shot_cells",
      rowRef: { kind: "id", value: "row-1" },
      cells: [{ field: "custom-2", value: "—" }]
    }
  ]);
  const response = completeAgentResponseFromDirectStoryboardIntent(
    { reply: "已处理。", operations: [] },
    store.getProject(projectId),
    "把镜头1改成Broll，hyperframe生成"
  );
  const result = applyAgentResponseWrites(store, projectId, response, () => undefined);

  assert.match(response.reply, /请耐心等待，生成完成后结果会自动回到对应镜头。/);
  assert.equal(store.row("row-1").scene, "B-ROLL");
  assert.equal(store.row("row-1").customValues["custom-2"].includes("第 1 镜旧内容"), true);
  assert.equal(store.row("row-1").customValues["custom-3"], "Hyperframes");
  assert.deepEqual(result.pendingOperations, [
    {
      type: "regenerate_media",
      rowRefs: [{ kind: "id", value: "row-1" }],
      kind: "video",
      overwriteExisting: true
    }
  ]);
});

test("direct generate command fills missing Hyperframes video prompt before regeneration", () => {
  const store = createFakeStore();
  applyConfirmedAgentOperations(store, projectId, [
    {
      type: "update_shot_cells",
      rowRef: { kind: "id", value: "row-3" },
      cells: [
        { field: "custom-3", value: "Hyperframes" },
        { field: "custom-2", value: "—" }
      ]
    }
  ]);

  const response = completeAgentResponseFromDirectStoryboardIntent(
    { reply: "已处理。", operations: [] },
    store.getProject(projectId),
    "生成镜头3"
  );
  const result = applyAgentResponseWrites(store, projectId, response, () => undefined);

  assert.match(response.reply, /请耐心等待，生成完成后结果会自动回到对应镜头。/);
  assert.match(store.row("row-3").customValues["custom-2"], /无 BGM[\s\S]*相邻 Shot 硬切/);
  assert.deepEqual(result.pendingOperations, [
    {
      type: "regenerate_media",
      rowRefs: [{ kind: "id", value: "row-3" }],
      kind: "video",
      overwriteExisting: true
    }
  ]);
});

test("direct generate command fills missing Seedance prompt with concise sound and hard-cut rules", () => {
  const store = createFakeStore();
  applyConfirmedAgentOperations(store, projectId, [
    {
      type: "update_shot_cells",
      rowRef: { kind: "id", value: "row-2" },
      cells: [
        { field: "custom-3", value: "Seedance 2.0" },
        { field: "custom-2", value: "—" }
      ]
    }
  ]);

  const response = completeAgentResponseFromDirectStoryboardIntent(
    { reply: "已处理。", operations: [] },
    store.getProject(projectId),
    "生成镜头2"
  );
  const result = applyAgentResponseWrites(store, projectId, response, () => undefined);

  assert.match(store.row("row-2").customValues["custom-2"], /根据这个镜头的分镜参考图生成视频/);
  assert.match(store.row("row-2").customValues["custom-2"], /无 BGM[\s\S]*相邻 Shot 硬切/);
  assert.deepEqual(result.pendingOperations, [
    {
      type: "regenerate_media",
      rowRefs: [{ kind: "id", value: "row-2" }],
      kind: "video",
      overwriteExisting: true
    }
  ]);
});

test("batch Hyperframes generate command queues every matching video row even when agent omits operations", () => {
  const store = createFakeStore();
  applyConfirmedAgentOperations(store, projectId, [
    {
      type: "update_shot_cells",
      rowRef: { kind: "id", value: "row-1" },
      cells: [{ field: "custom-3", value: "Hyperframes" }]
    },
    {
      type: "update_shot_cells",
      rowRef: { kind: "id", value: "row-2" },
      cells: [
        { field: "custom-3", value: "Hyperframes" },
        { field: "custom-2", value: "—" }
      ]
    },
    {
      type: "update_shot_cells",
      rowRef: { kind: "id", value: "row-3" },
      cells: [{ field: "custom-3", value: "Hyperframes" }]
    }
  ]);

  const response = completeAgentResponseFromDirectStoryboardIntent(
    { reply: "已触发全部 Hyperframes 镜头的视频生成。", operations: [] },
    store.getProject(projectId),
    "生成HyperFrame的所有视频"
  );
  const result = applyAgentResponseWrites(store, projectId, response, () => undefined);

  assert.match(response.reply, /请耐心等待，生成完成后结果会自动回到对应镜头。/);
  assert.match(store.row("row-2").customValues["custom-2"], /无 BGM[\s\S]*相邻 Shot 硬切/);
  assert.deepEqual(result.pendingOperations, [
    {
      type: "regenerate_media",
      rowRefs: [
        { kind: "id", value: "row-2" },
        { kind: "id", value: "row-3" }
      ],
      kind: "video",
      overwriteExisting: true
    }
  ]);
});

test("batch video fallback ignores image generation wording", () => {
  const store = createFakeStore();
  applyConfirmedAgentOperations(store, projectId, [
    {
      type: "update_shot_cells",
      rowRef: { kind: "id", value: "row-2" },
      cells: [{ field: "custom-3", value: "Hyperframes" }]
    }
  ]);

  const response = { reply: "已准备生成所有图片。", operations: [] };
  const completed = completeAgentResponseFromDirectStoryboardIntent(response, store.getProject(projectId), "生成所有图片");

  assert.deepEqual(completed, response);
});

test("Dreamina planning never synthesizes a default provider generation fallback", () => {
  const store = createFakeStore();
  const detail = store.getProject(projectId);
  const omitted = completeAgentResponseFromDirectStoryboardIntent(
    { reply: "请确认后再使用即梦生成。", operations: [] },
    detail,
    "使用即梦 CLI 生成镜头3的视频",
    { allowMediaGenerationFallback: false }
  );
  assert.deepEqual(omitted.operations, []);

  const planned = completeAgentResponseFromDirectStoryboardIntent(
    {
      reply: "已识别即梦视频生成操作，请先确认。",
      operations: [
        {
          type: "regenerate_media",
          rowRefs: [{ kind: "id", value: "row-3" }],
          kind: "video",
          overwriteExisting: true,
          provider: "dreamina_cli"
        }
      ]
    },
    detail,
    "使用即梦 CLI 生成镜头3的视频",
    { allowMediaGenerationFallback: false }
  );
  assert.deepEqual(planned.operations, [
    {
      type: "regenerate_media",
      rowRefs: [{ kind: "id", value: "row-3" }],
      kind: "video",
      overwriteExisting: true,
      provider: "dreamina_cli"
    }
  ]);
});

test("direct generation fallback ignores diagnostic questions", () => {
  const store = createFakeStore();
  applyConfirmedAgentOperations(store, projectId, [
    {
      type: "update_shot_cells",
      rowRef: { kind: "id", value: "row-3" },
      cells: [
        { field: "custom-3", value: "Hyperframes" },
        { field: "custom-2", value: "—" }
      ]
    }
  ]);

  const response = { reply: "这是原因说明。", operations: [] };
  const completed = completeAgentResponseFromDirectStoryboardIntent(response, store.getProject(projectId), "为什么生成镜头3会报错，没有生成 HyperFrame 视频？");

  assert.deepEqual(completed, response);
});

test("direct generation fallback corrects unusable prompt operations", () => {
  const store = createFakeStore();
  applyConfirmedAgentOperations(store, projectId, [
    {
      type: "update_shot_cells",
      rowRef: { kind: "id", value: "row-3" },
      cells: [
        { field: "custom-3", value: "Hyperframes" },
        { field: "custom-2", value: "—" }
      ]
    }
  ]);

  const response = completeAgentResponseFromDirectStoryboardIntent(
    {
      reply: "已处理。",
      operations: [
        { type: "update_shot_cells", rowRef: { kind: "id", value: "row-3" }, cells: [{ field: "custom-2", value: "—" }] },
        { type: "regenerate_media", rowRefs: [{ kind: "id", value: "row-3" }], kind: "video", overwriteExisting: true }
      ]
    },
    store.getProject(projectId),
    "生成镜头3"
  );
  const result = applyAgentResponseWrites(store, projectId, response, () => undefined);

  assert.match(store.row("row-3").customValues["custom-2"], /无 BGM[\s\S]*相邻 Shot 硬切/);
  assert.equal(result.pendingOperations.length, 1);
});

test("duplicate regenerate media operations are deduped before confirmation", () => {
  const store = createFakeStore();
  const response = completeAgentResponseFromDirectStoryboardIntent(
    {
      reply: "已触发第 3 镜图片重新生成。",
      operations: [
        { type: "regenerate_media", rowRefs: [{ kind: "id", value: "row-3" }], kind: "image", overwriteExisting: true },
        { type: "regenerate_media", rowRefs: [{ kind: "index", value: 3 }], kind: "image", overwriteExisting: true }
      ]
    },
    store.getProject(projectId),
    "重新生成第3镜图片"
  );

  assert.deepEqual(response.operations, [
    { type: "regenerate_media", rowRefs: [{ kind: "id", value: "row-3" }], kind: "image", overwriteExisting: true }
  ]);
  const result = applyAgentResponseWrites(store, projectId, response, () => undefined);
  assert.equal(result.pendingOperations.length, 1);
});

test("explicit storyboard image requests discard accidental video operations", () => {
  const store = createFakeStore();
  const response = completeAgentResponseFromDirectStoryboardIntent(
    {
      reply: "已处理。",
      operations: [
        { type: "regenerate_media", rowRefs: [{ kind: "id", value: "row-3" }], kind: "image", overwriteExisting: true },
        { type: "regenerate_media", rowRefs: [{ kind: "id", value: "row-3" }], kind: "video", overwriteExisting: true }
      ]
    },
    store.getProject(projectId),
    "重新生成分镜3的分镜图"
  );

  assert.deepEqual(response.operations, [
    { type: "regenerate_media", rowRefs: [{ kind: "id", value: "row-3" }], kind: "image", overwriteExisting: true }
  ]);
});

test("explicit storyboard image requests synthesize image operations without video confirmation", () => {
  const store = createFakeStore();
  const response = completeAgentResponseFromDirectStoryboardIntent(
    { reply: "已处理。", operations: [] },
    store.getProject(projectId),
    "重新生成第3镜的分镜图"
  );

  assert.deepEqual(response.operations, [
    { type: "regenerate_media", rowRefs: [{ kind: "id", value: "row-3" }], kind: "image", overwriteExisting: true }
  ]);
  assert.doesNotMatch(response.reply, /准备生成视频/);
});

test("storyboard rows patch applies before pending media generation", () => {
  const store = createFakeStore();
  const currentRow = store.row("row-2");
  const nextRow = {
    ...currentRow,
    scene: "B-ROLL",
    customValues: {
      ...currentRow.customValues,
      "custom-2": "Rows patch video prompt",
      "custom-3": "Hyperframes"
    }
  };
  const operation = { type: "regenerate_media", rowRefs: [{ kind: "id", value: "row-2" }], kind: "video", overwriteExisting: true };

  const result = applyAgentResponseWrites(
    store,
    projectId,
    {
      reply: "已更新第 2 镜并准备生成。",
      rows: [nextRow],
      operations: [operation]
    },
    () => undefined
  );

  assert.equal(store.row("row-2").customValues["custom-2"], "Rows patch video prompt");
  assert.equal(store.row("row-2").customValues["custom-3"], "Hyperframes");
  assert.deepEqual(result.pendingOperations, [operation]);
});

test("high-impact operations stay pending until user confirmation", () => {
  const store = createFakeStore();
  const before = store.snapshot();
  const response = {
    reply: "这些操作需要确认。",
    operations: [
      { type: "delete_shots", rowRefs: [{ kind: "index", value: 2 }] },
      { type: "insert_shots", rowRef: { kind: "index", value: 3 }, placement: "after", count: 2 },
      { type: "regenerate_media", rowRefs: [{ kind: "index", value: 3 }], kind: "image", overwriteExisting: true },
      { type: "reorder_shot", rowRef: { kind: "id", value: "row-3" }, targetRowRef: { kind: "id", value: "row-1" }, placement: "before" }
    ]
  };

  const result = applyAgentResponseWrites(store, projectId, response, () => undefined);

  assert.equal(result.appliedOperations.length, 0);
  assert.equal(result.pendingOperations.length, 4);
  assert.deepEqual(store.snapshot(), before);
});

test("confirmed insert operations can add blank or initialized storyboard rows", () => {
  const store = createFakeStore();

  applyConfirmedAgentOperations(store, projectId, [
    {
      type: "insert_shots",
      rowRef: { kind: "index", value: 3 },
      placement: "after",
      count: 2,
      rows: [
        { scene: "B-ROLL", content: "插入分镜 1", note: "备注 1", customValues: { "custom-1": "插入图像提示词 1" } },
        { scene: "B-ROLL", content: "插入分镜 2", customValues: { "custom-2": "插入视频提示词 2" } }
      ]
    }
  ]);

  assert.deepEqual(store.rowIds(), ["row-1", "row-2", "row-3", "new-row-1", "new-row-2"]);
  assert.equal(store.row("new-row-1").content, "插入分镜 1");
  assert.equal(store.row("new-row-1").customValues["custom-1"], "插入图像提示词 1");
  assert.equal(store.row("new-row-2").customValues["custom-2"], "插入视频提示词 2");
});

test("structural pending operations discard unsafe full-row patches", () => {
  const store = createFakeStore();
  const project = store.getProject(projectId);
  const unsafeRows = project.rows.map((row) => (row.id === "row-2" ? { ...row, content: "不应该被 rows patch 改掉" } : row));
  const response = completeAgentResponseFromDirectStoryboardIntent(
    {
      reply: "已准备插入分镜。",
      operations: [
        {
          type: "insert_shots",
          rowRef: { kind: "id", value: "row-1" },
          placement: "after",
          count: 1,
          rows: [{ scene: "B-ROLL", content: "安全插入内容", note: "结构操作自带草稿" }]
        }
      ],
      rows: unsafeRows
    },
    project,
    "在第1镜后新增一镜，内容为“安全插入内容”。"
  );

  assert.equal(response.rows, undefined);
  const result = applyAgentResponseWrites(store, projectId, response, () => undefined);
  assert.equal(store.row("row-2").content, "第 2 镜旧内容");
  applyConfirmedAgentOperations(store, projectId, result.pendingOperations);
  assert.equal(store.row("new-row-1").content, "安全插入内容");
});

test("direct insert command is recovered when the agent omits operations", () => {
  const store = createFakeStore();
  const unsafeRows = store.getProject(projectId).rows.map((row) => (row.id === "row-2" ? { ...row, content: "不应该写入" } : row));
  const response = completeAgentResponseFromDirectStoryboardIntent(
    { reply: "已在第 3 镜后新增分镜。", operations: [], rows: unsafeRows },
    store.getProject(projectId),
    "在第3镜后面新增1个B-ROLL分镜，内容必须是“Agent插入测试”，备注写“E2E 插入验证”。"
  );

  assert.deepEqual(response.operations, [
    {
      type: "insert_shots",
      rowRef: { kind: "id", value: "row-3" },
      placement: "after",
      count: 1,
      rows: [{ scene: "B-ROLL", content: "Agent插入测试", note: "E2E 插入验证" }]
    }
  ]);
  assert.equal(response.rows, undefined);
  const result = applyAgentResponseWrites(store, projectId, response, () => undefined);
  assert.equal(store.row("row-2").content, "第 2 镜旧内容");
  applyConfirmedAgentOperations(store, projectId, result.pendingOperations);
  assert.equal(store.row("new-row-1").content, "Agent插入测试");
  assert.equal(store.row("new-row-1").note, "E2E 插入验证");
});

test("negated insert wording does not synthesize insert operations", () => {
  const store = createFakeStore();
  const response = completeAgentResponseFromDirectStoryboardIntent(
    { reply: "已更新第 3 镜。", operations: [], rows: [{ ...store.row("row-3"), content: "只改内容" }] },
    store.getProject(projectId),
    "把第3镜内容改成“只改内容”。不要新增、删除或排序。"
  );

  assert.equal(response.operations?.length ?? 0, 0);
  assert.equal(response.rows?.[0]?.content, "只改内容");
});

test("confirmed delete, duplicate, reorder, and media operations mutate storyboard rows", () => {
  const store = createFakeStore();

  applyConfirmedAgentOperations(store, projectId, [{ type: "duplicate_shots", rowRefs: [{ kind: "id", value: "row-1" }] }]);
  assert.deepEqual(store.rowIds(), ["row-1", "row-1-copy-1", "row-2", "row-3"]);

  applyConfirmedAgentOperations(store, projectId, [
    { type: "reorder_shot", rowRef: { kind: "id", value: "row-3" }, targetRowRef: { kind: "id", value: "row-1" }, placement: "before" }
  ]);
  assert.deepEqual(store.rowIds(), ["row-3", "row-1", "row-1-copy-1", "row-2"]);

  applyConfirmedAgentOperations(store, projectId, [{ type: "delete_shots", rowRefs: [{ kind: "index", value: 3 }] }]);
  assert.deepEqual(store.rowIds(), ["row-3", "row-1", "row-2"]);

  applyConfirmedAgentOperations(store, projectId, [
    { type: "update_shot_media", rowRef: { kind: "id", value: "row-2" }, assetIds: ["asset-video-1"] }
  ]);
  assert.deepEqual(store.row("row-2").imageAssetIds, ["asset-video-1"]);
});

test("direct reorder command is recovered when the agent omits operations", () => {
  const store = createFakeStore();
  const response = completeAgentResponseFromDirectStoryboardIntent(
    { reply: "已把内容为“第 3 镜旧内容”的第一条分镜移动到第 1 镜之前。", operations: [] },
    store.getProject(projectId),
    "把内容为“第 3 镜旧内容”的第一条分镜移动到第1镜之前。"
  );

  assert.deepEqual(response.operations, [
    {
      type: "reorder_shot",
      rowRef: { kind: "id", value: "row-3" },
      targetRowRef: { kind: "id", value: "row-1" },
      placement: "before"
    }
  ]);

  const result = applyAgentResponseWrites(store, projectId, response, () => undefined);
  assert.deepEqual(result.pendingOperations, response.operations);
  applyConfirmedAgentOperations(store, projectId, result.pendingOperations);
  assert.deepEqual(store.rowIds(), ["row-3", "row-1", "row-2"]);
});

test("direct reorder content target is not confused with target shot index", () => {
  const store = createFakeStore();
  const response = completeAgentResponseFromDirectStoryboardIntent(
    { reply: "已将内容为「第 3 镜旧内容」的第一条分镜移动到第 1 镜之前。", operations: [] },
    store.getProject(projectId),
    "把内容为「第 3 镜旧内容」的第一条分镜移动到第1镜之前。"
  );

  assert.deepEqual(response.operations, [
    {
      type: "reorder_shot",
      rowRef: { kind: "id", value: "row-3" },
      targetRowRef: { kind: "id", value: "row-1" },
      placement: "before"
    }
  ]);
});

test("direct duplicate command is recovered when the agent omits operations", () => {
  const store = createFakeStore();
  const response = completeAgentResponseFromDirectStoryboardIntent(
    { reply: "已复制内容为“第 2 镜旧内容”的分镜。", operations: [] },
    store.getProject(projectId),
    "复制内容为“第 2 镜旧内容”的那一镜。"
  );

  assert.deepEqual(response.operations, [{ type: "duplicate_shots", rowRefs: [{ kind: "id", value: "row-2" }] }]);

  const result = applyAgentResponseWrites(store, projectId, response, () => undefined);
  assert.deepEqual(result.pendingOperations, response.operations);
  applyConfirmedAgentOperations(store, projectId, result.pendingOperations);
  assert.deepEqual(store.rowIds(), ["row-1", "row-2", "row-2-copy-1", "row-3"]);
  assert.equal(store.row("row-2-copy-1").content, "第 2 镜旧内容");
});

test("direct duplicate content target does not treat 那一镜 as shot one", () => {
  const store = createFakeStore();
  applyConfirmedAgentOperations(store, projectId, [
    { type: "update_shot_cells", rowRef: { kind: "id", value: "row-2" }, cells: [{ field: "content", value: "短标记" }] }
  ]);
  const response = completeAgentResponseFromDirectStoryboardIntent(
    { reply: "已复制内容为“短标记”的分镜。", operations: [] },
    store.getProject(projectId),
    "复制内容为“短标记”的那一镜。"
  );

  assert.deepEqual(response.operations, [{ type: "duplicate_shots", rowRefs: [{ kind: "id", value: "row-2" }] }]);
});

test("duplicate operations referencing the same row are deduped before confirmation", () => {
  const store = createFakeStore();
  const response = completeAgentResponseFromDirectStoryboardIntent(
    {
      reply: "已复制内容为“第 2 镜旧内容”的分镜。",
      operations: [
        { type: "duplicate_shots", rowRefs: [{ kind: "index", value: 2 }] },
        { type: "duplicate_shots", rowRefs: [{ kind: "id", value: "row-2" }] }
      ]
    },
    store.getProject(projectId),
    "复制内容为“第 2 镜旧内容”的那一镜。"
  );

  assert.deepEqual(response.operations, [{ type: "duplicate_shots", rowRefs: [{ kind: "index", value: 2 }] }]);
  const result = applyAgentResponseWrites(store, projectId, response, () => undefined);
  applyConfirmedAgentOperations(store, projectId, result.pendingOperations);
  assert.deepEqual(store.rowIds(), ["row-1", "row-2", "row-2-copy-1", "row-3"]);
});

test("direct duplicate command filters unrelated insert operations", () => {
  const store = createFakeStore();
  const response = completeAgentResponseFromDirectStoryboardIntent(
    {
      reply: "已复制内容为“第 2 镜旧内容”的分镜。",
      operations: [
        { type: "duplicate_shots", rowRefs: [{ kind: "id", value: "row-2" }] },
        { type: "insert_shots", placement: "end", count: 1 }
      ]
    },
    store.getProject(projectId),
    "复制内容为“第 2 镜旧内容”的那一镜。"
  );

  assert.deepEqual(response.operations, [{ type: "duplicate_shots", rowRefs: [{ kind: "id", value: "row-2" }] }]);
});

test("direct delete command is recovered when the agent omits operations", () => {
  const store = createFakeStore();
  const response = completeAgentResponseFromDirectStoryboardIntent(
    { reply: "已删除内容为“第 2 镜旧内容”的分镜。", operations: [] },
    store.getProject(projectId),
    "删除所有内容为“第 2 镜旧内容”的分镜。"
  );

  assert.deepEqual(response.operations, [{ type: "delete_shots", rowRefs: [{ kind: "id", value: "row-2" }] }]);

  const result = applyAgentResponseWrites(store, projectId, response, () => undefined);
  assert.deepEqual(result.pendingOperations, response.operations);
  applyConfirmedAgentOperations(store, projectId, result.pendingOperations);
  assert.deepEqual(store.rowIds(), ["row-1", "row-3"]);
});

test("regenerate_media is routed out of the main write executor", () => {
  const store = createFakeStore();
  const operation = { type: "regenerate_media", rowRefs: [{ kind: "index", value: 3 }], kind: "video", overwriteExisting: true };
  const result = applyAgentResponseWrites(store, projectId, { reply: "准备重新生成视频。", operations: [operation] }, () => undefined);

  assert.deepEqual(result.pendingOperations, [operation]);
  assert.throws(() => applyConfirmedAgentOperations(store, projectId, [operation]), /媒体生成操作需要在客户端确认后通过生成队列执行/);
});

test("agent image attachments are bound to regenerated video target rows", () => {
  const store = createFakeStore();
  const operation = { type: "regenerate_media", rowRefs: [{ kind: "index", value: 3 }], kind: "video", overwriteExisting: true };
  const detail = store.getProject(projectId);
  detail.assets = [
    {
      id: "asset-openai",
      name: "openai.png",
      kind: "image",
      sizeLabel: "12 KB",
      localPath: "assets/openai.png",
      indexedPath: "assets/openai.png",
      previewUrl: "mkboard-asset://asset/asset-openai/openai.png",
      linkedShotId: null,
      linkedShot: "未关联镜头",
      importedAt: "2026-01-01T00:00:00.000Z"
    },
    {
      id: "asset-anthropic",
      name: "anthropic.png",
      kind: "image",
      sizeLabel: "14 KB",
      localPath: "assets/anthropic.png",
      indexedPath: "assets/anthropic.png",
      previewUrl: "mkboard-asset://asset/asset-anthropic/anthropic.png",
      linkedShotId: null,
      linkedShot: "未关联镜头",
      importedAt: "2026-01-01T00:00:00.000Z"
    }
  ];

  const response = attachAgentImageAttachmentsToRegeneratedVideoRows(
    { reply: "准备重新生成视频。", operations: [operation] },
    detail,
    ["asset-openai", "asset-anthropic"]
  );
  const result = applyAgentResponseWrites(store, projectId, response, () => undefined);

  assert.deepEqual(store.row("row-3").imageAssetIds, ["asset-openai", "asset-anthropic"]);
  assert.deepEqual(result.pendingOperations, [operation]);
});

test("generated storyboard video success events carry media updates for immediate renderer sync", () => {
  const sharedSource = readFileSync(join(scriptDir, "../src/shared.ts"), "utf8");
  const mainSource = readFileSync(join(scriptDir, "../src/main/index.ts"), "utf8");
  const rendererSource = readFileSync(join(scriptDir, "../src/renderer/src/App.tsx"), "utf8");
  const databaseSource = readFileSync(join(scriptDir, "../src/main/database.ts"), "utf8");
  const writeShotMediaIdsSource = databaseSource.match(/private writeShotMediaIds\(projectId: string, rowId: string, assetIds: string\[\], now: string\): void \{[\s\S]*?\n  \}/)?.[0] ?? "";

  assert.match(sharedSource, /mediaUpdate\?: ShotMediaUpdateResult/);
  assert.match(mainSource, /assertGeneratedVideoMediaImported\(mediaUpdate, result\.rowId, assetId\)/);
  assert.match(mainSource, /sendVideoGenerationEvent\(\{ \.\.\.storyboardVideoTaskEvent\(updatedTask\), \.\.\.doneProgress, mediaUpdate \}\)/);
  assert.match(mainSource, /store\.ensureShotMediaAsset\(input\.projectId, task\.rowId, existingTask\.asset_id\)/);
  assert.match(mainSource, /store\.ensureShotMediaAsset\(projectId, task\.rowId, task\.taskId\)/);
  assert.match(rendererSource, /if \(payload\.mediaUpdate\) applyShotMediaUpdate\(payload\.mediaUpdate, payload\.projectId, expectedStoryboardRowIds\)/);
  assert.match(rendererSource, /syncResult\.data\.importedCount > 0 \|\| syncResult\.data\.localAvailableCount > 0/);
  assert.match(rendererSource, /imageResult\.data\.importedCount > 0 \|\| imageResult\.data\.localAvailableCount > 0/);
  assert.match(databaseSource, /INSERT INTO assets[\s\S]*'video'[\s\S]*this\.writeShotPromptPreviewAsset\(projectId, rowId, "video", assetId, now\)[\s\S]*this\.writeShotMediaIds\(projectId, rowId, putGeneratedMediaAssetFirst\(currentIds, assetId\), now\)/);
  assert.match(databaseSource, /function putGeneratedMediaAssetFirst\(currentIds: string\[\], assetId: string\): string\[\][\s\S]*return \[normalizedAssetId, \.\.\.currentIds\.filter\(\(currentAssetId\) => currentAssetId !== normalizedAssetId\)\]\.slice\(0, maxShotMediaAssets\)/);
  assert.match(databaseSource, /const alreadySelected = currentIds\.includes\(assetId\);[\s\S]*const stillLinkedToShot = asset\.linked_shot_id === rowId;[\s\S]*if \(!alreadySelected && !stillLinkedToShot\) return this\.getShotMediaUpdate\(projectId\);/);
  assert.match(databaseSource, /ensureShotMediaAsset\(projectId: string, rowId: string, assetId: string\): ShotMediaUpdateResult[\s\S]*this\.writeShotMediaIds\(projectId, rowId, nextIds, now\)[\s\S]*this\.markShotMediaSelectionTouched\(projectId, rowId, now\)/);
  assert.doesNotMatch(writeShotMediaIdsSource, /this\.listShotRecords\(projectId\)/);
  assert.doesNotMatch(writeShotMediaIdsSource, /UPDATE assets SET linked_shot_id/);
  assert.match(rendererSource, /<div className="storyboard-media-grid" data-ratio=\{imageRatio\}>[\s\S]*imageGenerating \? <StoryboardMediaGeneratingThumb[\s\S]*videoGenerating \? <StoryboardMediaGeneratingThumb[\s\S]*displayAssets\.map/);
});

test("hyperframes video generation receives storyboard image assets", () => {
  const codexAgentSource = readFileSync(join(scriptDir, "../src/main/codex-agent.ts"), "utf8");
  const localVideoSource = readFileSync(join(scriptDir, "../src/main/local-video.ts"), "utf8");
  const mainSource = readFileSync(join(scriptDir, "../src/main/index.ts"), "utf8");

  assert.match(mainSource, /const completedResponse = dreaminaRecoveryRequest\s*\? removeDreaminaForbiddenMediaOperations\(response\)\s*:\s*completeAgentResponseFromDirectStoryboardIntent\(response, latestProject, request\.message, \{\s*allowMediaGenerationFallback: dreaminaIntent\?\.action !== "generate"\s*\}\)/);
  assert.match(mainSource, /attachAgentImageAttachmentsToRegeneratedVideoRows\([\s\S]*completedResponse,[\s\S]*latestProject,[\s\S]*attachments\.map\(\(asset\) => asset\.id\)[\s\S]*\)/);
  assert.match(localVideoSource, /collectHyperframesReferenceAssets\(project, row\)/);
  assert.match(localVideoSource, /copyHyperframesReferenceAssets\(projectDir, referenceAssets\)/);
  assert.match(localVideoSource, /renderPath: hyperframesReferenceAssetRenderPath\(asset, result\.length\)/);
  assert.match(codexAgentSource, /分镜绑定图片素材/);
  assert.match(codexAgentSource, /最终视频画面必须实际包含每一张列出的图片/);
  assert.match(codexAgentSource, /必须使用给定的 renderPath/);
});

test("hyperframes repair releases Studio before replacing its Windows project directory", () => {
  const localVideoSource = readFileSync(join(scriptDir, "../src/main/local-video.ts"), "utf8");

  assert.match(localVideoSource, /await prepareHyperframesProjectDirectory\(projectDir\)/);
  assert.match(localVideoSource, /function prepareHyperframesProjectDirectory[\s\S]*preview\.projectDir === projectDir[\s\S]*preview\.stop\(\)[\s\S]*waitForChildProcessExit/);
  assert.match(localVideoSource, /await rm\(projectDir, \{ recursive: true, force: true, maxRetries: 10, retryDelay: 200 \}\)/);
  assert.doesNotMatch(localVideoSource, /rmSync\(projectDir, \{ recursive: true, force: true \}\)/);
});

test("hyperframes only asks the Agent to repair project validation failures", () => {
  const localVideoSource = readFileSync(join(scriptDir, "../src/main/local-video.ts"), "utf8");
  const codexAgentSource = readFileSync(join(scriptDir, "../src/main/codex-agent.ts"), "utf8");

  assert.match(localVideoSource, /await assertHyperframesRuntimeReady\(signal\);[\s\S]*runHyperframesProjectAgent\(/);
  assert.match(localVideoSource, /if \(!\(error instanceof HyperframesProjectValidationError\)\) throw error;/);
  assert.match(localVideoSource, /isHyperframesProjectValidationStage[\s\S]*stage === "lint" \|\| stage === "validate" \|\| stage === "inspect"/);
  assert.doesNotMatch(localVideoSource, /stage === "render" \|\|/);
  assert.match(localVideoSource, /assertHyperframesProjectIsSelfContained\(currentFiles\);/);
  assert.match(localVideoSource, /HyperFrames 项目必须可离线渲染/);
  assert.match(codexAgentSource, /index\.html 必须完全自包含并可离线渲染/);
  assert.match(codexAgentSource, /必须移除已有的远程 script、import、stylesheet 和 CDN 依赖/);
  assert.doesNotMatch(codexAgentSource, /可以引用官方 starter 使用的 GSAP CDN/);
});

test("agent user message history keeps uploaded image thumbnails", () => {
  const sharedSource = readFileSync(join(scriptDir, "../src/shared.ts"), "utf8");
  const mainSource = readFileSync(join(scriptDir, "../src/main/index.ts"), "utf8");
  const rendererSource = readFileSync(join(scriptDir, "../src/renderer/src/App.tsx"), "utf8");
  const rendererCssSource = readFileSync(join(scriptDir, "../src/renderer/src/styles/global.css"), "utf8");
  const databaseSource = readFileSync(join(scriptDir, "../src/main/database.ts"), "utf8");

  assert.match(sharedSource, /export type AgentMessageAttachment = Pick<ProjectAsset, "id" \| "name" \| "kind" \| "previewUrl">/);
  assert.match(sharedSource, /attachments\?: AgentMessageAttachment\[\]/);
  assert.match(databaseSource, /attachments_json TEXT NOT NULL DEFAULT '\[\]'/);
  assert.match(databaseSource, /function parseAgentMessageAttachments/);
  assert.match(databaseSource, /INSERT INTO agent_messages[\s\S]*attachments_json[\s\S]*JSON\.stringify\(attachments\)/);
  assert.match(mainSource, /const attachmentSnapshots = attachments\.map\(createAgentMessageAttachmentSnapshot\)/);
  assert.match(mainSource, /store\.appendAgentMessage\(request\.projectId, "user", request\.message, \{ conversationId, attachments: attachmentSnapshots \}\)/);
  assert.match(rendererSource, /attachments: currentAttachments\.map\(createAgentMessageAttachmentSnapshot\)/);
  assert.match(rendererSource, /agent-message-attachment-grid/);
  assert.match(rendererCssSource, /\.agent-message-attachment-thumb/);
});

test("agent composer imports pasted clipboard images through the project asset pipeline", () => {
  const sharedSource = readFileSync(join(scriptDir, "../src/shared.ts"), "utf8");
  const preloadSource = readFileSync(join(scriptDir, "../src/preload/index.ts"), "utf8");
  const mainSource = readFileSync(join(scriptDir, "../src/main/index.ts"), "utf8");
  const databaseSource = readFileSync(join(scriptDir, "../src/main/database.ts"), "utf8");
  const rendererSource = readFileSync(join(scriptDir, "../src/renderer/src/App.tsx"), "utf8");

  assert.match(sharedSource, /importAgentClipboardImage\(projectId: string\): Promise<ProjectAsset\[\]>/);
  assert.match(preloadSource, /importAgentClipboardImage: \(projectId: string\) => ipcRenderer\.invoke\("mkboard:import-agent-clipboard-image", projectId\)/);
  assert.match(mainSource, /ipcMain\.handle\("mkboard:import-agent-clipboard-image"[\s\S]*clipboard\.readImage\(\)[\s\S]*importAgentImageAttachmentBuffer/);
  assert.match(databaseSource, /importAgentImageAttachmentBuffer\(projectId: string, fileName: string, buffer: Uint8Array\): ProjectAsset\[\]/);
  assert.match(rendererSource, /event\.clipboardData\.items[\s\S]*item\.type\.startsWith\("image\/"\)/);
  assert.match(rendererSource, /<form className="agent-input" onPaste=\{handleComposerPaste\} onSubmit=\{submitComposer\}>/);
  assert.match(rendererSource, /addAgentImageAttachments\(pastedImages, projectDetail\.project\.id\)/);
});

test("BYOK missing key notices guide users to configure local API keys instead of credits", () => {
  const rendererSource = readFileSync(join(scriptDir, "../src/renderer/src/App.tsx"), "utf8");

  assert.match(rendererSource, /openAccountAuthWithMessage/);
  assert.match(rendererSource, /activeImageProvider/);
  assert.doesNotMatch(rendererSource, /积分不足，预计需要/);
  assert.doesNotMatch(rendererSource, /积分不足，还差/);
});

test("hyperframes project parser accepts common Codex file wrappers", () => {
  const source = readFileSync(join(scriptDir, "../src/main/codex-agent.ts"), "utf8");

  assert.match(source, /parseOrRecoverHyperframesProjectFiles\(result\.lastMessage \|\| result\.assistantText, executable\.name, input\.project, input\.agentProjectDir\)/);
  assert.match(source, /parseOrRecoverHyperframesProjectFiles\(result\.lastMessage \|\| result\.assistantText, executable\.name, input\.project, input\.agentProjectDir, input\.files\)/);
  assert.match(source, /baseFiles\.length > 0 \? mergeHyperframesProjectFiles\(baseFiles, returnedFiles\) : returnedFiles/);
  assert.match(source, /baseFiles\.length > 0 \? mergeHyperframesProjectFiles\(baseFiles, recoveredFiles\) : recoveredFiles/);
  assert.match(source, /\.filter\(\(file\) => file\.path && file\.content\.trim\(\) && looksLikeHyperframesFilePath\(file\.path\)\)/);
  assert.match(source, /function collectHyperframesProjectFileEntries[\s\S]*if \(isRecord\(filesValue\)\) return readHyperframesFileMap\(filesValue\)/);
  assert.match(source, /function normalizeGeneratedHyperframesProjectPath[\s\S]*isAllowedHyperframesTopLevelFile\(fileName\)[\s\S]*return fileName/);
  assert.match(source, /content: path === "index\.html" \? normalizeHtmlDocument\(file\.content\) : file\.content/);
  assert.match(source, /function readHyperframesFilePath[\s\S]*"filePath"[\s\S]*"filename"/);
  assert.match(source, /function recoverHyperframesProjectFilesFromDirectory[\s\S]*collectRecoveredHyperframesProjectFiles/);
  assert.match(source, /function collectRecoveredHyperframesProjectFiles[\s\S]*readdirSync[\s\S]*readFileSync/);
  assert.match(source, /function isRecoverableHyperframesTextPath[\s\S]*isAllowedHyperframesTopLevelFile[\s\S]*isHyperframesCompositionSubpath[\s\S]*isHyperframesAssetSubpath/);
  assert.match(source, /function stringifyClaudeStructuredOutputToolInput[\s\S]*containsCompleteJsonObject\(output\)/);
  assert.match(source, /function readRecoverableClaudeResult[\s\S]*isRecoverableResult\(structuredToolOutput\)/);
});

test("hyperframes recovery ignores unrelated JSON from inspect tools", () => {
  assert.equal(
    isRecoverableHyperframesProjectResult('{"schemaVersion":1,"duration":18,"samples":[0,1,2]}'),
    false
  );
  assert.equal(
    isRecoverableHyperframesProjectResult('{"files":[{"path":"index.html","content":"<!doctype html><html></html>"}]}'),
    true
  );
  assert.equal(
    isRecoverableHyperframesProjectResult('{"files":[{"path":"STATUS","content":"done"}]}'),
    false
  );
});

test("hyperframes repair file patches retain the existing index and replace changed files", () => {
  const files = mergeHyperframesProjectFiles(
    [
      { path: "index.html", content: "<!doctype html><html><body>original</body></html>" },
      { path: "DESIGN.md", content: "# Original" }
    ],
    [
      { path: "nested/DESIGN.md", content: "# Repaired" },
      { path: "STATUS", content: "repair complete" }
    ]
  );

  assert.deepEqual(files, [
    { path: "index.html", content: "<!doctype html><html><body>original</body></html>" },
    { path: "DESIGN.md", content: "# Repaired" }
  ]);
});

test("hyperframes font normalization avoids undeclared named font families", () => {
  const [file] = normalizeHyperframesProjectFontsForLint([
    {
      path: "index.html",
      content:
        '<style>@font-face { font-family: "Noto Sans SC"; src: local("Noto Sans SC"); }:root{--font-body:"Noto Sans SC", sans-serif}body{font-family: Inter, "Noto Sans SC", -apple-system, BlinkMacSystemFont, "Microsoft YaHei", sans-serif}.code{font-family: "JetBrains Mono", Menlo, monospace}</style>'
    }
  ]);

  assert.doesNotMatch(file.content, /@font-face|Noto Sans SC|Microsoft YaHei|-apple-system|BlinkMacSystemFont/i);
  assert.match(file.content, /--font-body:system-ui, sans-serif;/);
  assert.match(file.content, /body\{font-family: system-ui, sans-serif;\}/);
  assert.match(file.content, /\.code\{font-family: ui-monospace, monospace;\}/);
});

test("claude code adapter preserves the same visible agent event contract as codex", () => {
  const source = readFileSync(join(scriptDir, "../src/main/codex-agent.ts"), "utf8");
  const rendererSource = readFileSync(join(scriptDir, "../src/renderer/src/App.tsx"), "utf8");

  assert.match(source, /function buildClaudeCodeArgs[\s\S]*--include-partial-messages/);
  assert.match(source, /"--input-format",\s*"stream-json"/);
  assert.match(source, /createClaudeStreamJsonUserMessage\(prompt\)/);
  assert.match(source, /useJsonSchema: input\.mode === "storyboard-generation"/);
  assert.match(source, /const useJsonSchema = options\.useJsonSchema === true && process\.env\.MKBOARD_CLAUDE_USE_JSON_SCHEMA\?\.trim\(\) !== "0"/);
  assert.match(source, /\.\.\.\(useJsonSchema \? \["--json-schema", readFileSync\(schemaPath, "utf8"\)\] : \[\]\)/);
  assert.match(source, /function buildClaudeCodeArgs[\s\S]*const tools = process\.env\.MKBOARD_CLAUDE_TOOLS \?\? ""[\s\S]*"--tools",\s*tools/);
  assert.match(source, /event\.type === "message_delta"[\s\S]*options\.onTurnEnd\?\.\(stopReason\)/);
  assert.match(source, /status === "requesting" \? "running" : status/);
  assert.match(source, /function createClaudeCodeEventHandler[\s\S]*parsed\.type === "stream_event"[\s\S]*handleClaudeStreamEvent/);
  assert.match(source, /const emittedToolUseIds = new Set<string>\(\)/);
  assert.match(source, /function emitClaudeToolUse[\s\S]*emittedToolUseIds\.has\(id\)[\s\S]*emittedToolUseIds\.add\(id\)/);
  assert.match(source, /function emitClaudeToolUse[\s\S]*kind: "tool_use"/);
  assert.match(source, /function emitClaudeToolResult[\s\S]*kind: "tool_result"/);
  assert.match(source, /function handleClaudeStreamEvent[\s\S]*delta\.type === "thinking_delta"[\s\S]*kind: "thinking"/);
  assert.match(source, /function handleClaudeAssistantMessage[\s\S]*block\.type === "tool_use"/);
  assert.match(source, /function handleClaudeUserMessage[\s\S]*block\.type === "tool_result"/);
  assert.match(source, /function visibleTextDeltaFromStructuredTransport[\s\S]*containsStructuredTransportObject\(raw\)[\s\S]*options\.suppressPlainJson === true/);
  assert.match(rendererSource, /event\.label === "requesting"\) return "running"/);
  assert.match(rendererSource, /\["storyboard_parse", "queued", "starting", "initializing", "requesting", "running", "succeeded"\]/);
  assert.match(rendererSource, /label === "requesting"\) return t\("agent\.status\.running"\)/);
});

test("agent prompt exposes model-owned a-roll tag sync rules", () => {
  const source = readFileSync(join(scriptDir, "../src/main/codex-agent.ts"), "utf8");
  const schemaSource = readFileSync(join(scriptDir, "../src/main/agent-output-schema.ts"), "utf8");
  const operationsSource = readFileSync(join(scriptDir, "../src/main/agent-operations.ts"), "utf8");
  const rendererSource = readFileSync(join(scriptDir, "../src/renderer/src/App.tsx"), "utf8");
  const i18nSource = readFileSync(join(scriptDir, "../src/renderer/src/i18n.ts"), "utf8");
  const rendererCssSource = readFileSync(join(scriptDir, "../src/renderer/src/styles/global.css"), "utf8");
  const databaseSource = readFileSync(join(scriptDir, "../src/main/database.ts"), "utf8");

  assert.match(schemaSource, /"sync_script_a_roll_tags"/);
  assert.match(source, /sync_script_a_roll_tags：根据当前分镜表给当前脚本 HTML 补充可见文本形式的 A-Roll 标签/);
  assert.match(source, /这个操作由模型自己理解分镜与原脚本的对应关系；MkBoard 只写入你返回的完整 scriptHtml/);
  assert.equal(source.includes("开标签必须写成 &lt;A&gt;，关标签必须写成 &lt;/A&gt;"), true);
  assert.match(source, /不要返回真实 HTML <A>\.\.\.<\/A> 元素、不要加 data 属性、不要加 span\/a 包裹、不要加样式或高亮/);
  assert.match(source, /不得修改原文，不得改写、翻译、补充、删减、重排、合并或拆散原脚本/);
  assert.match(source, /只根据“当前分镜表 JSON”判断 A-Roll/);
  assert.match(operationsSource, /operation\.type === "update_script" \|\| operation\.type === "sync_script_a_roll_tags"/);
  assert.match(i18nSource, /"agent\.operation\.syncARollTags": "根据当前分镜给脚本补充 A-Roll 标签"/);
  assert.match(rendererSource, /t\("agent\.operation\.syncARollTags"\)/);
  assert.equal(rendererSource.includes("ScriptARollTag"), false);
  assert.equal(rendererSource.includes("data-mkboard-a-roll"), false);
  assert.equal(rendererCssSource.includes("data-mkboard-a-roll"), false);
  assert.equal(databaseSource.includes('"&lt;A&gt;$1&lt;/A&gt;"'), true);
  assert.match(databaseSource, /getScriptHtml\(projectId: string\)[\s\S]*return normalizeScriptARollTags/);
  assert.match(databaseSource, /const normalizedScriptHtml = normalizeScriptARollTags\(scriptHtml\)[\s\S]*stripHtml\(normalizedScriptHtml\)/);
});

test("missing row references reject without mutating storyboard data", () => {
  const store = createFakeStore();
  const before = store.snapshot();

  assert.throws(
    () =>
      applyConfirmedAgentOperations(store, projectId, [
        { type: "update_shot_cells", rowRef: { kind: "index", value: 99 }, cells: [{ field: "content", value: "不应写入" }] }
      ]),
    /找不到第 99 个分镜/
  );
  assert.deepEqual(store.snapshot(), before);
});

test("rows patch updates existing row subsets but rejects unknown row replacement in chat", () => {
  const store = createFakeStore();
  const currentRows = store.getProject(projectId).rows;
  const nextRows = currentRows.map((row) => (row.id === "row-2" ? { ...row, content: "rows patch 更新内容" } : row));
  const subsetPatch = nextRows.filter((row) => row.id === "row-2");

  applyAgentResponseWrites(store, projectId, { reply: "更新分镜。", rows: subsetPatch }, () => undefined);
  assert.equal(store.row("row-2").content, "rows patch 更新内容");

  assert.throws(
    () =>
      applyAgentResponseWrites(
        store,
        projectId,
        { reply: "不允许替换整表。", rows: [...nextRows, createRow("new-model-row", "4")] },
        () => undefined
      ),
    /rows 只能修改当前已有分镜行/
  );
});

test("confirmation card switches to confirmed before video generation starts", () => {
  const source = readFileSync(join(scriptDir, "../src/renderer/src/App.tsx"), "utf8");
  const i18nSource = readFileSync(join(scriptDir, "../src/renderer/src/i18n.ts"), "utf8");
  const confirmationHandlerSource = source.slice(
    source.indexOf("async function confirmAgentOperationConfirmation"),
    source.indexOf("function cancelAgentOperationConfirmation")
  );
  const confirmedStateIndex = confirmationHandlerSource.indexOf('status: "confirmed"');
  const executeOperationsIndex = confirmationHandlerSource.indexOf("await executeAgentPendingOperations");

  assert.ok(confirmedStateIndex >= 0 && executeOperationsIndex >= 0 && confirmedStateIndex < executeOperationsIndex);
  assert.match(confirmationHandlerSource, /applyAgentOperationConfirmationState\(confirmedConfirmation\);[\s\S]*await persistAgentOperationConfirmation\(confirmedConfirmation\);[\s\S]*await executeAgentPendingOperations/);
  assert.doesNotMatch(confirmationHandlerSource, /status: "applying"|generationStarted|onDreaminaGenerationStarted/);
  assert.match(i18nSource, /"agent\.confirmation\.confirmedTitle": "已确认"/);
});

test("renderer routes pending operations through confirmation and guarded media target builders", () => {
  const source = readFileSync(join(scriptDir, "../src/renderer/src/App.tsx"), "utf8") + "\n" + readFileSync(join(scriptDir, "../src/storyboard-generation.ts"), "utf8");
  const rendererCssSource = readFileSync(join(scriptDir, "../src/renderer/src/styles/global.css"), "utf8");
  const i18nSource = readFileSync(join(scriptDir, "../src/renderer/src/i18n.ts"), "utf8");

  assert.equal(source.includes("resolveDirectStoryboardImageRequest"), false);
  assert.equal(source.includes("resolveDirectStoryboardVideoRequest"), false);
  assert.equal(source.includes("parseStoryboardOrdinal"), false);
  assert.match(source, /function inferConversationMessageLanguage[\s\S]*return "zh-CN"[\s\S]*return "en"/);
  assert.match(source, /const workflowLanguage = inferConversationMessageLanguage\(userContent, interfaceLanguage\)/);
  assert.match(source, /const requestT = createTranslator\(inferConversationMessageLanguage\(text, interfaceLanguage\)\)/);
  assert.match(source, /const messageLocale = inferAgentMessageLanguage\(message, locale\)/);
  assert.match(source, /<I18nContext\.Provider value=\{messageI18n\}>/);
  assert.match(source, /workflowT\("agent\.workflow\.imagesSubmitted"/);
  assert.match(source, /function AgentThinkingBlock[\s\S]*const \[open, setOpen\] = useState\(\(\) => streaming\)/);
  assert.match(source, /function AgentThinkingBlock[\s\S]*useEffect\(\(\) => \{\s*setOpen\(streaming\);\s*\}, \[streaming\]\)/);
  assert.match(source, /function AgentThinkingBlock[\s\S]*aria-expanded=\{open\}[\s\S]*<span className="agent-thinking-indicator"[\s\S]*<span className="agent-thinking-label">\{label\}<\/span>\s*<ChevronDown className="agent-thinking-chevron"/);
  assert.match(source, /function AgentThinkingBlock[\s\S]*<AgentMarkdownBlock className="agent-prose agent-thinking-body" dataTyping=\{typing\} text=\{visibleText\}/);
  assert.match(source, /last\.text = appendAgentThinkingText\(last\.text, event\.text\)/);
  assert.match(source, /function appendAgentThinkingText[\s\S]*joinsAdjacentMarkdownBlocks[\s\S]*`\$\{currentTrimmed\}\\n\\n\$\{incomingTrimmed\}`/);
  assert.match(rendererCssSource, /\.agent-thinking-toggle[\s\S]*cursor: pointer/);
  assert.match(rendererCssSource, /\.agent-thinking-block\.collapsed \.agent-thinking-chevron[\s\S]*rotate\(-90deg\)/);
  const thinkingCssSource = rendererCssSource.slice(rendererCssSource.indexOf(".agent-thinking-block,"), rendererCssSource.indexOf(".agent-tool-card {"));
  assert.match(thinkingCssSource, /\.agent-thinking-indicator[\s\S]*var\(--agent-active-dot\)/);
  assert.match(thinkingCssSource, /\.agent-thinking-toggle:focus-visible[\s\S]*outline: 2px solid var\(--agent-active-dot\)/);
  assert.match(thinkingCssSource, /\.agent-thinking-toggle:active[\s\S]*translateY\(1px\)/);
  assert.match(thinkingCssSource, /\.agent-thinking-toggle:disabled[\s\S]*cursor: not-allowed[\s\S]*opacity: 0\.5/);
  assert.match(thinkingCssSource, /\.agent-thinking-label[\s\S]*font-size: 12\.5px[\s\S]*font-weight: 400/);
  assert.match(thinkingCssSource, /\.agent-prose\.agent-thinking-body[\s\S]*font-size: 12\.5px[\s\S]*font-weight: 400/);
  assert.match(thinkingCssSource, /\.agent-thinking-body :is\(h1, h2, h3, h4, h5, h6\)[\s\S]*font-weight: 400/);
  assert.match(thinkingCssSource, /\.agent-thinking-body strong[\s\S]*font-weight: 400/);
  assert.match(thinkingCssSource, /\.agent-thinking-body\[data-typing="true"\][\s\S]*border-right-color: var\(--agent-active-dot\)/);
  assert.doesNotMatch(thinkingCssSource, /var\(--app-yellow\)|var\(--agent-running-strong\)/);
  assert.match(
    rendererCssSource,
    /\.create-project-field > span,\s*\.project-aspect-ratio-label,\s*\.project-setting-heading-title,\s*\.create-project-taste-heading > span[\s\S]*font-size: var\(--ui-font-sm\)[\s\S]*font-weight: 650/
  );
  assert.match(
    rendererCssSource,
    /\.project-aspect-ratio-option \{[\s\S]*min-height: 44px[\s\S]*padding: 6px 10px[\s\S]*font-size: var\(--ui-font-sm\)[\s\S]*font-weight: 400/
  );
  assert.match(
    rendererCssSource,
    /\/\* Keep create-project typography role-based after the shared density overrides\. \*\/[\s\S]*\.create-project-modal \{[\s\S]*font-weight: 400[\s\S]*\.create-project-input\[data-slot="input"\],[\s\S]*\.project-setting-summary-copy strong[\s\S]*font-weight: 550[\s\S]*\.create-project-input\[data-slot="input"\]::placeholder[\s\S]*font-weight: 520/
  );
  assert.match(i18nSource, /"agent\.thinking\.expand": "展开思考内容"/);
  assert.match(i18nSource, /"agent\.thinking\.expand": "Expand thinking"/);
  assert.match(i18nSource, /"agent\.thinking\.expand": "展開思考內容"/);
  assert.match(source, /function handleAgentPendingOperations[\s\S]*partitionAgentOperationsForConfirmation\(pendingOperations, latestDetail\.rows\)/);
  assert.match(source, /function handleAgentPendingOperations[\s\S]*operations: confirmationOperations[\s\S]*executeAgentPendingOperations\(immediateOperations/);
  assert.match(source, /function partitionAgentOperationsForConfirmation[\s\S]*operation\.type === "regenerate_media"[\s\S]*operation\.kind === "video"/);
  assert.match(source, /function partitionAgentOperationsForConfirmation[\s\S]*isValidVideoGeneration \? confirmationOperations : immediateOperations/);
  assert.doesNotMatch(source, /projectOperations\.length > 0 \|\|/);
  assert.doesNotMatch(source, /agentSeedanceVideoOperationsNeedConfirmation/);
  assert.match(source, /activeAgentOperationConfirmationIdsRef[\s\S]*status: "failed"[\s\S]*t\("agent\.confirmation\.failedDetail"\)/);
  assert.match(source, /if \(isActiveGenerationTaskStatus\(payload\.status\)\)/);
  assert.match(source, /setStoryboardVideoGeneratingRowIds\(\(currentRowIds\) => addGenerationRowIds\(currentRowIds, targetRowIds\)\)/);
  assert.match(source, /function isStoryboardToolLocked[\s\S]*if \(target === "create"\) return false;[\s\S]*return storyboardGenerating/);
  assert.match(source, /function createStoryboards[\s\S]*if \(storyboardParsing\) return;[\s\S]*onCreateStoryboards\(count\)/);
  assert.match(source, /function duplicateSelectedRows[\s\S]*if \(storyboardParsing \|\| selectedRowIds\.length === 0\) return;[\s\S]*onDuplicateStoryboards\(selectedRowIds\)/);
  assert.match(source, /function insertStoryboardAtRow[\s\S]*if \(storyboardParsing\) return;[\s\S]*onInsertStoryboard\(rowId, placement\)/);
  assert.match(source, /selectionActionsDisabled=\{storyboardParsing\}/);
  assert.match(source, /function executeAgentPendingOperations[\s\S]*window\.mkboard\.applyAgentOperations/);
  assert.match(source, /function executeAgentPendingOperations[\s\S]*window\.mkboard\.executeConfirmedDreaminaAgentGeneration/);
  assert.match(source, /currentDetail = await window\.mkboard\.executeConfirmedDreaminaAgentGeneration/);
  const confirmationHandlerSource = source.slice(
    source.indexOf("async function confirmAgentOperationConfirmation"),
    source.indexOf("function cancelAgentOperationConfirmation")
  );
  const confirmedStateIndex = confirmationHandlerSource.indexOf('status: "confirmed"');
  const executeOperationsIndex = confirmationHandlerSource.indexOf("await executeAgentPendingOperations");
  assert.ok(confirmedStateIndex >= 0 && executeOperationsIndex >= 0 && confirmedStateIndex < executeOperationsIndex);
  assert.match(confirmationHandlerSource, /applyAgentOperationConfirmationState\(confirmedConfirmation\);[\s\S]*await persistAgentOperationConfirmation\(confirmedConfirmation\);[\s\S]*await executeAgentPendingOperations/);
  assert.doesNotMatch(confirmationHandlerSource, /status: "applying"|generationStarted|onDreaminaGenerationStarted/);
  assert.match(source, /function executeAgentPendingOperations[\s\S]*overwriteExisting:\s*true/);
  assert.doesNotMatch(source, /DreaminaAgentVideoConfirmationDialog|dreaminaVideoConfirmationOpen/);
  assert.match(source, /function AgentOperationConfirmationCard[\s\S]*agent-confirmation-card/);
  assert.match(i18nSource, /"agent\.operation\.regenerateDreaminaMedia": "使用即梦 CLI 生成 \{refs\} 的\{kind\}。本次操作不消耗 MkBoard 积分，将消耗即梦积分。"/);
  assert.match(i18nSource, /"agent\.confirmation\.confirmedTitle": "已确认"/);
  assert.match(source, /function ensureMissingStoryboardGenerationPrompts[\s\S]*window\.mkboard\.updateShot[\s\S]*window\.mkboard\.getProject/);
  assert.match(source, /function buildFallbackImagePrompt[\s\S]*withSeedanceReferenceGridPrompt/);
  assert.match(source, /function buildFallbackVideoPrompt[\s\S]*buildFallbackSeedanceVideoPrompt[\s\S]*buildFallbackHyperframesVideoPrompt/);
  assert.match(source, /function buildStoryboardImageGenerationCandidates[\s\S]*rows\.forEach\(\(row\) => \{\s*if \(isArollStoryboardRow\(row\)\) return;/);
  assert.match(source, /function buildStoryboardImageGenerationTargets[\s\S]*filter\(\(target\) => Boolean\(target\.prompt\)\)/);
  assert.match(source, /const storyboardGenerationMethodOptions[\s\S]*"自定义"/);
  assert.match(source, /normalizeStoryboardGenerationMethod[\s\S]*return "自定义"/);
  assert.match(source, /selectedShotsNoVideoTargetsAlert/);
  assert.match(source, /function buildStoryboardVideoGenerationCandidates[\s\S]*\.filter\(\(row\) => !isArollStoryboardRow\(row\)\)/);
  assert.match(source, /function buildStoryboardVideoGenerationCandidates[\s\S]*method !== "Seedance 2\.0" && method !== "Hyperframes"/);
  assert.match(source, /function buildStoryboardVideoGenerationTargets[\s\S]*filter\(\(target\) => Boolean\(target\.prompt\)\)/);
  assert.match(source, /function buildStoryboardVideoGenerationCandidates[\s\S]*durationSec: resolveStoryboardVideoDurationSec\(row, prompt, method\)/);
  assert.match(source, /function getStoryboardMediaGenerationCounts[\s\S]*filterStoryboardVideoTargetsByMethod\(buildStoryboardVideoGenerationCandidates\(rows, columns, imageRatio\), videoMethodFilter\)/);
  assert.match(source, /function ProjectAspectRatioPicker[\s\S]*imageRatioOptions\.map[\s\S]*<AspectRatioIcon ratio=\{option\.value\}/);
  assert.match(source, /imageRatio: projectImageRatioInput/);
  assert.doesNotMatch(source, /project-card-ratio-badge|<AspectRatioIcon ratio=\{project\.imageRatio\}/);
  assert.match(rendererCssSource, /\.storyboard-a-roll-sample img[\s\S]*object-fit: cover/);
  assert.match(rendererCssSource, /\.storyboard-presentation-frame\.has-a-roll-sample img[\s\S]*object-fit: cover/);
  assert.match(source, /const orderedTasks = useMemo\(\(\) => sortGenerationTasksByTimeline\(tasks, rowOrderById\)/);
  assert.match(source, /if \(activeStatusFilter === "active"\) return taskDisplayItems\.filter/);
  assert.match(source, /function buildGenerationTaskDisplayItems[\s\S]*formatGenerationTaskDuplicateSuffix/);
});

test("renderer suppresses duplicate failure cards", () => {
  const source = readFileSync(join(scriptDir, "../src/renderer/src/App.tsx"), "utf8");

  assert.match(source, /const blocksForDisplay[\s\S]*isTerminalFailureStatusLabel/);
  assert.match(source, /const hasTerminalFailureCard[\s\S]*isTerminalFailureStatusLabel/);
  assert.match(source, /!\(effectiveFailedOrCanceled && hasTerminalFailureCard\)/);
  assert.match(source, /showFinalContent && finalContentIsError[\s\S]*AgentErrorBlock/);
});

function createFakeStore() {
  let scriptHtml = "<p>旧脚本</p>";
  let nextNewRow = 1;
  let nextCopyRow = 1;
  let rows = [
    createRow("row-1", "1", { scene: "A-ROLL", content: "第 1 镜旧内容" }),
    createRow("row-2", "2", { scene: "B-ROLL", content: "第 2 镜旧内容" }),
    createRow("row-3", "3", { scene: "B-ROLL", content: "第 3 镜旧内容" })
  ];

  const store = {
    getProject() {
      return {
        project: {
          id: projectId,
          name: "测试项目",
          icon: "clapperboard",
          templateId: "默认模板",
          localPath: "/tmp/mkboard-test",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z"
        },
        scriptHtml,
        rows: rows.map(cloneRow),
        columns,
        imageRatio: "16:9",
        assets: [],
        storyboardSkill: { id: "skill-1", name: "测试 Skill", description: "", content: "" },
        taste: { id: "taste-1", name: "测试 Taste", description: "", content: "", sourceUrl: "", preview: {}, scope: "system", locked: true },
        agentConversations: [],
        activeAgentConversationId: "conversation-1",
        agentMessages: []
      };
    },
    updateScript(_projectId, nextScriptHtml) {
      scriptHtml = nextScriptHtml;
    },
    updateShot(_projectId, input) {
      const row = rows.find((item) => item.id === input.id);
      if (!row) return rows.map(cloneRow);
      if (["scene", "duration", "content", "note"].includes(input.field)) {
        row[input.field] = input.value;
      } else {
        row.customValues[input.field] = input.value;
      }
      return rows.map(cloneRow);
    },
    updateShotMedia(_projectId, rowId, assetIds) {
      const row = rows.find((item) => item.id === rowId);
      if (!row) return { rows: rows.map(cloneRow) };
      row.imageAssetIds = [...assetIds];
      row.imageAssetId = assetIds[0] ?? null;
      return { rows: rows.map(cloneRow) };
    },
    createShots(_projectId, count) {
      for (let index = 0; index < count; index += 1) {
        rows.push(createRow(`new-row-${nextNewRow}`, String(rows.length + 1), { scene: "", content: "", note: "" }));
        nextNewRow += 1;
      }
      resequence();
      return rows.map(cloneRow);
    },
    insertShot(_projectId, targetRowId, placement) {
      const targetIndex = rows.findIndex((row) => row.id === targetRowId);
      const insertIndex = targetIndex < 0 ? rows.length : placement === "before" ? targetIndex : targetIndex + 1;
      rows.splice(insertIndex, 0, createRow(`new-row-${nextNewRow}`, "0", { scene: "", content: "", note: "" }));
      nextNewRow += 1;
      resequence();
      return rows.map(cloneRow);
    },
    deleteShots(_projectId, rowIds) {
      const selected = new Set(rowIds);
      rows = rows.filter((row) => !selected.has(row.id));
      resequence();
      return rows.map(cloneRow);
    },
    duplicateShots(_projectId, rowIds) {
      const selected = new Set(rowIds);
      rows = rows.flatMap((row) => {
        if (!selected.has(row.id)) return [row];
        const copy = cloneRow(row);
        copy.id = `${row.id}-copy-${nextCopyRow}`;
        nextCopyRow += 1;
        return [row, copy];
      });
      resequence();
      return rows.map(cloneRow);
    },
    replaceRows(_projectId, nextRows) {
      rows = nextRows.map(cloneRow);
      resequence();
    },
    getScriptHtml() {
      return scriptHtml;
    },
    row(rowId) {
      const row = rows.find((item) => item.id === rowId);
      if (!row) throw new Error(`Missing fake row ${rowId}`);
      return row;
    },
    rowIds() {
      return rows.map((row) => row.id);
    },
    snapshot() {
      return { scriptHtml, rows: rows.map(cloneRow) };
    }
  };

  function resequence() {
    rows = rows.map((row, index) => ({ ...row, shot: String(index + 1) }));
  }

  return store;
}

function createRow(id, shot, overrides = {}) {
  return {
    id,
    shot,
    scene: overrides.scene ?? "B-ROLL",
    duration: overrides.duration ?? "3",
    content: overrides.content ?? "旧内容",
    note: overrides.note ?? "旧备注",
    imageAssetIds: overrides.imageAssetIds ? [...overrides.imageAssetIds] : [],
    imageAssetId: overrides.imageAssetId ?? null,
    customValues: {
      "custom-1": overrides.customValues?.["custom-1"] ?? `旧图像提示词 ${shot}`,
      "custom-2": overrides.customValues?.["custom-2"] ?? `旧视频提示词 ${shot}`,
      "custom-3": overrides.customValues?.["custom-3"] ?? "Seedance 2.0",
      ...(overrides.customValues ?? {})
    }
  };
}

function cloneRow(row) {
  return {
    ...row,
    imageAssetIds: [...(row.imageAssetIds ?? [])],
    customValues: { ...(row.customValues ?? {}) }
  };
}

function assertStrictObjectSchemas(schema, path = "$") {
  if (!schema || typeof schema !== "object") return;

  const isObjectSchema = schema.type === "object" || (Array.isArray(schema.type) && schema.type.includes("object")) || Boolean(schema.properties);
  if (isObjectSchema) {
    assert.equal(schema.additionalProperties, false, `${path} must set additionalProperties: false`);
    const propertyKeys = Object.keys(schema.properties ?? {}).sort();
    const requiredKeys = [...(schema.required ?? [])].sort();
    assert.deepEqual(requiredKeys, propertyKeys, `${path} required must include every property`);
  }

  if (schema.properties && typeof schema.properties === "object") {
    for (const [key, value] of Object.entries(schema.properties)) {
      assertStrictObjectSchemas(value, `${path}.properties.${key}`);
    }
  }

  if (schema.items) {
    assertStrictObjectSchemas(schema.items, `${path}.items`);
  }

  for (const keyword of ["anyOf", "oneOf", "allOf"]) {
    if (!Array.isArray(schema[keyword])) continue;
    schema[keyword].forEach((item, index) => assertStrictObjectSchemas(item, `${path}.${keyword}[${index}]`));
  }
}
