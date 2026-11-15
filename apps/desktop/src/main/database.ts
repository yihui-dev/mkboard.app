import type BetterSqlite3 from "better-sqlite3";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { defaultTasteId, systemTasteSeeds } from "./taste-catalog";
import { extractVideoBestCoverFrame, extractVideoFirstFrame, extractVideoTailFrame } from "./video-poster";
import {
  areManagedTutorialStoryboardRows,
  areTutorialStoryboardRows,
  getTutorialLocale,
  getTutorialMediaAssetsForLocale,
  getTutorialProjectId,
  getTutorialProjectIdForLocale,
  getTutorialProjectLocaleForProjectId,
  getTutorialProjectName,
  getTutorialScriptHtml,
  getTutorialStoryboardRows,
  getTutorialStoryboardRowsForLocale,
  inferTutorialStoryboardRowsLocale,
  inferTutorialScriptLocale,
  isTutorialProjectId,
  isKnownTutorialScript,
  tutorialProjectContentVersion,
  type TutorialLocale,
  type TutorialMediaAsset
} from "./onboarding-content";
import {
  PROMPT_PREVIEW_IMAGE_ASSET_ID_FIELD,
  PROMPT_PREVIEW_IMAGE_HIDDEN_FIELD,
  PROMPT_PREVIEW_VIDEO_ASSET_ID_FIELD,
  PROMPT_PREVIEW_VIDEO_HIDDEN_FIELD,
  STORYBOARD_MEDIA_SELECTION_TOUCHED_FIELD,
  defaultAgentConversationTitle,
  defaultAgentMessage,
  defaultSkillGradientId,
  defaultSkillIconId,
  defaultSystemSkillGradientId,
  defaultSystemSkillIconId,
  ensureStoryboardPromptColumns,
  getDefaultStoryboardColumns,
  getStoryboardTemplateLanguage,
  legacyDefaultAgentConversationTitles,
  normalizeImageRatio,
  withMkboardR2ImageQuality,
  withMkboardR2VideoOptimization,
  type AgentConversation,
  type AgentConversationDetail,
  type AgentCliId,
  type AgentEvent,
  type AgentMessageAttachment,
  type AgentOperationConfirmation,
  initialScriptRichText,
  type AgentRunStatus,
  type AgentMessage,
  type AssetKind,
  type CreateProjectTemplateInput,
  type CreateSkillInput,
  type CreateTasteInput,
  type UpdateTasteInput,
  type CreateProjectInput,
  type ImageRatio,
  type InterfaceLanguage,
  type OnboardingState,
  type OnboardingStatePatch,
  type OnboardingStepId,
  type ProjectAsset,
  type ProjectDetail,
  type ProjectKind,
  type ProjectSkill,
  type ProjectSummary,
  type ProjectTaste,
  type ProjectTemplate,
  type ShotMediaUpdateResult,
  type Skill,
  type StoryboardActiveVideoGenerationTask,
  type Taste,
  type TastePreview,
  type StoryboardColumn,
  type StoryboardRow,
  type StoryboardVideoGenerationMethod,
  type UpdateProjectInput,
  type UpdateProjectTemplateInput,
  type UpdateSkillInput,
  type UpdateShotInput
} from "../shared";
import {
  buildAllSystemProjectTemplates,
  buildSystemProjectTemplate,
  getLocalizedSystemStoryboardSkillId,
  getSystemStoryboardSkillSeeds,
  getSystemStoryboardSkillSortIndex,
  getSystemTemplateSeed,
  isSystemStoryboardSkillId,
  isSystemTemplateId
} from "../storyboard-presets";

const require = createRequire(import.meta.url);
const sqlitePackageName = "better-sqlite3";
const Database = require(sqlitePackageName) as typeof BetterSqlite3;
const assetPreviewScheme = "mkboard-asset";

type ProjectRecord = {
  id: string;
  kind?: ProjectKind | null;
  name: string;
  icon: string;
  template_id: string;
  taste_id?: string | null;
  image_ratio?: string | null;
  local_path: string;
  cloud_project_id?: string | null;
  created_at: string;
  updated_at: string;
  archived_at?: string | null;
  deleted_at?: string | null;
};

type ScriptRecord = {
  project_id: string;
  html: string;
  plain_text: string;
  updated_at: string;
};

type ShotRecord = {
  id: string;
  project_id: string;
  position: number;
  shot_number: string;
  image_asset_id: string | null;
  image_asset_ids_json?: string | null;
  scene: string;
  duration: string;
  content: string;
  note: string;
  custom_values_json: string;
  created_at: string;
  updated_at: string;
};

type AssetRecord = {
  id: string;
  project_id: string;
  file_name: string;
  kind: AssetKind;
  file_size: number;
  local_path: string;
  indexed_path: string;
  poster_path?: string | null;
  poster_indexed_path?: string | null;
  linked_shot_id: string | null;
  content_hash?: string | null;
  created_at: string;
};

type TutorialShotMediaSnapshot = {
  position: number;
  assetIds: string[];
  previewImageAssetId?: string;
  previewVideoAssetId?: string;
  mediaSelectionTouched: boolean;
};

type SettingsRecord = {
  project_id: string;
  image_ratio: ImageRatio;
  columns_json: string;
  storyboard_skill_id?: string | null;
  updated_at: string;
};

type AgentMessageRecord = {
  id: string;
  project_id: string;
  conversation_id?: string | null;
  role: "assistant" | "user";
  content: string;
  attachments_json?: string | null;
  events_json?: string | null;
  run_status?: AgentRunStatus | null;
  client_run_id?: string | null;
  agent_cli_id?: AgentCliId | null;
  operation_confirmation_json?: string | null;
  created_at: string;
};

type AgentConversationRecord = {
  id: string;
  project_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  unread_completion: number;
  message_count?: number;
};

type SkillRecord = {
  id: string;
  name: string;
  description: string;
  content: string;
  icon_id: string;
  gradient_id: string;
  scope: "system" | "user";
  locked: number;
  created_at: string;
  updated_at: string;
};

type TasteRecord = {
  id: string;
  name: string;
  description: string;
  content: string;
  source_url: string;
  preview_json: string;
  scope: "system" | "user";
  locked: number;
  created_at: string;
  updated_at: string;
};

const systemTasteSortOrder = new Map<string, number>(
  [defaultTasteId, ...systemTasteSeeds.map((taste) => taste.id).filter((tasteId) => tasteId !== defaultTasteId)].map((tasteId, index): [string, number] => [
    tasteId,
    index
  ])
);

type TemplateRecord = {
  id: string;
  name: string;
  description: string;
  scope: "system" | "user";
  columns_json: string;
  storyboard_skill_id: string;
  created_at: string;
  updated_at: string;
};

type OnboardingStateRecord = {
  id: string;
  app_version: string;
  content_version: string;
  tutorial_project_id: string;
  current_step: OnboardingStepId;
  completed_step_ids_json: string;
  dismissed_step_ids_json: string;
  started_at?: string | null;
  completed_at?: string | null;
  updated_at: string;
};

export type StoryboardVideoTaskStatus = StoryboardActiveVideoGenerationTask["status"];

export type PendingCloudProjectDeletion = {
  cloudProjectId: string;
  localProjectId: string;
  createdAt: string;
  lastAttemptedAt: string | null;
  lastError: string | null;
};

export type StoryboardVideoTaskRecord = {
  id: string;
  project_id: string;
  row_id: string;
  method: StoryboardVideoGenerationMethod;
  status: StoryboardVideoTaskStatus;
  prompt: string;
  aspect_ratio?: string | null;
  duration_sec?: number | null;
  provider?: string | null;
  provider_task_id?: string | null;
  work_dir?: string | null;
  output_dir?: string | null;
  output_path?: string | null;
  asset_id?: string | null;
  file_name?: string | null;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  failed_at?: string | null;
  cancelled_at?: string | null;
};

export type StoryboardVideoTaskPatch = Partial<{
  status: StoryboardVideoTaskStatus;
  provider: string | null;
  providerTaskId: string | null;
  workDir: string | null;
  outputDir: string | null;
  outputPath: string | null;
  assetId: string | null;
  fileName: string | null;
  errorMessage: string | null;
}>;

export type StoryboardImageDeliveryRecoveryRecord = {
  project_id: string;
  task_id: string;
  row_id: string;
  provider_task_id?: string | null;
  error_message?: string | null;
  attempt_count: number;
};

const legacyDefaultAgentMessages = new Set([
  "我通过本机 Codex CLI 读取当前项目上下文，可以按你的要求修改脚本或分镜。重要改动会先整理为可理解的结果再写入本地项目数据库。"
]);

const agentConversationTitleMaxLength = 10;
const maxShotMediaAssets = 10;
const defaultTemplateId = "default-template";
const legacyDefaultTemplateIds = new Set(["默认模板", "default", defaultTemplateId]);
const defaultTemplateName = "默认模板";
const defaultTemplateDescription = "从空白脚本和基础分镜表开始，适合大多数新项目。";
const sampleProjectId = "testing-storyboard";
const sampleProjectName = "Apple Growth Story";
const legacySampleProjectName = "Test Project";
const legacySampleScriptTitle = "The Night Shift That Opened the Universe";
const legacySampleRowContents = [
  "In the 1990s, in Shanxi, China, Liu Cixin was not writing from a quiet studio or a university office.",
  "By day, he worked as an engineer at a power plant. Machines roared, coal dust hung in the air, and the rhythm of the factory measured his hours.",
  "After work, when the lights outside went cold and most people were thinking only about sleep, he returned to his desk.",
  "He carried the noise of the plant with him, but on the page, it became something vast: suns rising and falling over alien worlds, civilizations trying to survive.",
  "He wrote in stolen hours, sentence by sentence, after shifts that had already used up his body.",
  "The Three-Body Problem began in the afterglow of labor, with a tired engineer refusing to let the universe inside his head go silent."
];
const storyboardSkillId = "storyboard-split";
const storyboardSkillName = "Default Storyboard Skill";
const storyboardSkillDescription = "Splits scripts into A-Roll/B-Roll and prepares image/video prompts.";
const chineseStoryboardSkillId = "storyboard-split-zh";
const chineseStoryboardSkillName = "默认分镜技能";
const chineseStoryboardSkillDescription = "将脚本拆分成 A-Roll/B-Roll，并准备图片和视频提示词。";
const systemStoryboardSkillIds = new Set([storyboardSkillId, chineseStoryboardSkillId]);
const fallbackStoryboardSkill = `---
name: Default Storyboard Skill
description: ${storyboardSkillDescription}
---

# Default Storyboard Skill

Split the current script into MkBoard's default storyboard table. Return rows only. Do not rewrite the script, read or write files, or call image/video generation APIs.

## Splitting Logic

1. Split shots by meaning, pacing, and visual change. One row is one shot.
2. Preserve the user's original line meaning. Do not rewrite or translate the user's spoken script in row.content.
3. Decide whether each row is A-Roll or B-Roll, then write that decision into the scene/category column.

## Duration Rules

- For A-Roll rows, set row.duration from the spoken content length and pacing.
- For B-Roll rows that use ChatGPT Image2 or 自定义, set row.duration from the storyboard pacing.
- For Seedance 2.0 video rows, row.duration must be at least 10 seconds. Use 12 seconds as the normal target; extend up to 15 seconds when the row.content is long or the action needs more time.
- For Hyperframes video rows, row.duration must be 10 to 20 seconds. Use 10 seconds for short text-card or simple MG shots, 12 to 15 seconds for medium narration or multi-step animation, and 18 to 20 seconds for long narration, dense data/process explanation, or multi-scene UI animation.
- Choose duration from the split row.content length first, then the visual complexity. Longer narration or more on-screen steps must get a longer video duration.

## A-Roll

- A-Roll is talking-head narration, emphasis, transitions, opening hooks, and closing CTAs.
- Write A-ROLL in the scene/category column.
- Write the spoken line in row.content, preserving the script language.
- Do not invent asset ids for the visual column. Keep imageAssetIds empty; MkBoard will show the default local talking-head image.
- In row.note, describe the talking-head framing or subtitle suggestion in the resolved output language.
- Write "—" in both the image prompt and video prompt columns.
- The generation method column must be an empty string. Do not write ChatGPT Image2, Seedance 2.0, Hyperframes, or 自定义.

## B-Roll

- B-Roll is supporting visual material used to explain, demonstrate, or enrich the spoken line.
- Write B-ROLL in the scene/category column.
- Write the narration or corresponding script line in row.content.
- In row.note, explain the material type plus the subject, setting, action, and visual purpose.
- Common B-Roll material types include:
  - video footage, AI-generated images, and AI-generated videos
  - real screen recordings and filmed footage
  - MG animation, text animation, or explainer animation generated by HyperFrames
- B-Roll has four possible execution methods. Choose per shot purpose; do not default every B-Roll row to Hyperframes:
  1. AI-generated image: use ChatGPT Image2 for static scenes, character/object/environment establishing shots, comparison images, concept visuals, product cards, screenshot-like frames, and shots that only need one key image.
  2. AI-generated video: first use ChatGPT Image2 / C-DAIS 2.0 to create a clean 2x2 storyboard reference grid, then use Seedance 2.0 for video. Use this for real motion, camera movement, human action, object movement, scene progression, emotion change, or continuous action longer than about 2 seconds.
  3. Hyperframes: use for HTML/MG/text/data/process/UI-card animation, such as title cards, number counters, methodology cards, infographics, product UI card choreography, and subtitle-rhythm animation. Do not use it for realistic people, realistic locations, live-action motion, or shots that need photographic texture.
  4. 自定义: use when the user already has or will prepare images, screen recordings, filmed footage, external edits, or manual media, so MkBoard should not automatically call image or video generation.
- If a shot only needs an image, set the generation method to ChatGPT Image2, fill only the image prompt, and write "—" in the video prompt.
- If a shot needs realistic motion or camera movement, set the generation method to Seedance 2.0 and fill both:
  - Image prompt: a ChatGPT Image2 / C-DAIS 2.0 prompt for the shot's 2x2 storyboard reference grid. Describe the key subject, scene, composition, lighting, style, and aspect ratio. Explicitly require a pure 2x2 grid with no panel numbers, shot numbers, panel titles, captions, narration text, explanatory text, storyboard-image descriptions, description boxes, watermarks, or UI labels.
  - Video prompt: a concise Seedance 2.0 all-around-reference prompt based on that storyboard grid. Explicitly say that the video should be generated from the storyboard image, then state the shot size/framing and what happens. Mention camera movement only when it is essential to the action. The prompt duration must match row.duration and never be shorter than 10 seconds.
- If a shot is abstract information, a text card, data chart, process explanation, or UI/MG animation, set the generation method to Hyperframes. Write a concise animation prompt in the video prompt column, describing the framing, what changes on screen, the essential HTML/MG/text/data/UI structure, phase timing, visible-copy language, and duration. The prompt duration must match row.duration and stay between 10 and 20 seconds. Write "—" in the image prompt unless the user explicitly asks for a 2x2 storyboard grid too.
- Hyperframes prompts must stay renderable. For dense data, ecosystem maps, or multi-step explanations, ask for 3-5 staged phases, at most 4 prominent stat cards/nodes visible at once, short labels, and a stable final layout. Do not request that every source phrase or every product name stay visible simultaneously.
- If the user clearly says a shot will use prepared media, stock media, screen recording, filmed footage, external editing, or manual production, set the generation method to 自定义. Write "—" in both image and video prompts, and explain the needed material type in row.note. 自定义 rows are excluded from the default automatic video generation queue.
- Choose the generation method from the shot content. A complete storyboard usually mixes ChatGPT Image2, Seedance 2.0, Hyperframes, and a few 自定义 rows. Use Hyperframes heavily only when the script itself is mostly abstract infographics, product cards, data/process explanation, or UI animation.

## Video Prompt Rules

- Keep each video prompt concise, preferably 1-3 short sentences. State the shot size/framing and what happens. Add only execution-critical details such as duration, aspect ratio, visible-copy language, or a necessary camera move.
- Do not add metaphors, emotional embellishment, cinematic mood prose, generic quality adjectives, or repeated story explanation. The prompt should describe the shot, not sell the feeling of the shot.
- When the row already has bound/uploaded subject, character, scene, storyboard, or other reference assets, tell the video model to follow those references. Do not repeat their appearance, wardrobe, environment, palette, or style in text.
- Never request BGM, music, melody, or score. Request only synchronized diegetic/Foley/action/environment sound effects that directly match the visible event. If no sound effect is justified, prefer silence over music.
- Do not request transition animations, transition clips, bridge shots, intros, or outros. Each shot is self-contained and adjacent shots use a hard cut. Hyperframes may animate elements inside one shot, but must not simulate a cross-shot transition.

## Language Resolution

Use two signals: the user's selected interface language injected by MkBoard, and the current script's dominant language.

- Preserve source dialogue in row.content. Never translate the user's script line just to match the interface language.
- If the script is clearly Chinese, split and display generated row notes, image prompts, video prompts, and Hyperframes visible-copy requirements in Chinese.
- If the script is clearly English, split and display generated row notes, image prompts, video prompts, and Hyperframes visible-copy requirements in English.
- If the script is empty, mixed, or unclear, fall back to the user's selected interface language: zh-CN / zh-TW means Chinese, en means English.
- If no reliable language signal is available, default generated notes and prompts to English.
- For Hyperframes rows, the video prompt must explicitly state the visible-copy language for titles, subtitles, labels, step names, buttons, data notes, and other on-screen text.
- Proper nouns, product names, model names, code identifiers, and short phrases already written in another language may be preserved.
- Fixed enum values do not change with language: A-ROLL, B-ROLL, ChatGPT Image2, Seedance 2.0, Hyperframes, 自定义.

## Table Fields

- Keep the current default template columns: Sort, Shot, Frame, Category, Duration (s), Content, Notes.
- Also fill these three custom columns: Image prompt, Video prompt, Generation method.
- Write image prompts, video prompts, and generation methods into the matching customValues[columnId].
- The generation method may only be ChatGPT Image2, Seedance 2.0, Hyperframes, or 自定义. If no generation method is needed, write an empty string.
- For empty image prompt and video prompt cells, still write "—" in customValues. Do not write none, empty, blank, N/A, or UI placeholder text.
- Only write real asset ids into imageAssetIds when the current project assets JSON contains a clearly usable asset. Otherwise keep imageAssetIds as an empty array.
`;
const fallbackChineseStoryboardSkill = `---
name: 默认分镜技能
description: ${chineseStoryboardSkillDescription}
---

# 默认分镜技能

把当前脚本拆分成 MkBoard 默认分镜表。只返回分镜行。不要改写脚本，不要读写文件，也不要调用图片或视频生成 API。

## 拆分逻辑

1. 按语义、节奏和视觉变化拆分镜头。一个表格行就是一个镜头。
2. 保留用户原始台词含义。不要为了匹配界面语言而改写或翻译 row.content 里的口播内容。
3. 判断每一行是 A-Roll 还是 B-Roll，并写入 scene/category 列。

## 时长规则

- A-Roll 行根据口播内容长度和语速设置 row.duration。
- 使用 ChatGPT Image2 或 自定义 的 B-Roll 行，根据分镜节奏设置 row.duration。
- Seedance 2.0 视频行的 row.duration 必须至少 10 秒。常规目标用 12 秒；如果 row.content 较长或动作需要更完整，延长到 15 秒。
- Hyperframes 视频行的 row.duration 必须为 10 到 20 秒。短文本卡片或简单 MG 镜头用 10 秒；中等长度口播或多步骤动画用 12 到 15 秒；长口播、密集数据/流程解释或多场景 UI 动画用 18 到 20 秒。
- 先根据拆分后的 row.content 长度选择时长，再结合视觉复杂度微调。口播更长或屏幕步骤更多时，视频时长必须更长。

## A-Roll

- A-Roll 是真人口播、重点强调、转场、开场钩子和结尾 CTA。
- 在 scene/category 列写 A-ROLL。
- 在 row.content 写口播台词，并保留脚本原始语言。
- 不要为画面列编造素材 id。保持 imageAssetIds 为空；MkBoard 会显示默认本地口播图。
- 在 row.note 中用最终输出语言描述口播构图或字幕建议。
- 图片提示词和视频提示词两列都写 "—"。
- 生成方式列必须为空字符串。不要写 ChatGPT Image2、Seedance 2.0、Hyperframes 或 自定义。

## B-Roll

- B-Roll 是用于解释、演示或丰富口播内容的辅助画面。
- 在 scene/category 列写 B-ROLL。
- 在 row.content 写对应的旁白或脚本句子。
- 在 row.note 中说明素材类型，以及主体、场景、动作和视觉目的。
- 常见 B-Roll 素材类型包括：
  - 视频素材、AI 生成图片和 AI 生成视频
  - 真实录屏和实拍素材
  - 由 HyperFrames 生成的 MG 动画、文字动画或解释型动画
- B-Roll 有四种执行方式。按镜头目的选择，不要把所有 B-Roll 默认成 Hyperframes：
  1. AI 生成图片：静态场景、角色/物体/环境建立镜头、对比图、概念视觉、产品卡片、类截图画面，以及只需要一张关键图的镜头，使用 ChatGPT Image2。
  2. AI 生成视频：先用 ChatGPT Image2 / C-DAIS 2.0 创建干净的 2x2 四宫格分镜参考图，再用 Seedance 2.0 生成视频。适用于真实运动、镜头运动、人物动作、物体移动、场景推进、情绪变化，或持续超过约 2 秒的连续动作。
  3. Hyperframes：适用于 HTML/MG/文字/数据/流程/UI 卡片动画，例如标题卡、数字计数器、方法论卡片、信息图、产品 UI 卡片编排和字幕节奏动画。不要用于写实人物、写实地点、真人运动或需要摄影质感的镜头。
  4. 自定义：当用户已经有或将自行准备图片、录屏、实拍素材、外部剪辑或手工制作素材时使用，这样 MkBoard 不应自动调用图片或视频生成。
- 如果镜头只需要图片，生成方式设为 ChatGPT Image2，只填写图片提示词，视频提示词写 "—"。
- 如果镜头需要写实运动或镜头运动，生成方式设为 Seedance 2.0，并同时填写：
  - 图片提示词：用于 ChatGPT Image2 / C-DAIS 2.0 生成该镜头 2x2 四宫格分镜参考图的提示词。描述主体、场景、构图、光线、风格和画幅比例。必须明确要求纯 2x2 四宫格画面，不添加面板编号、镜头号、面板标题、字幕、旁白、说明文字、分镜图片描述、描述栏、水印或任何 UI 标注。
  - 视频提示词：基于该四宫格参考图的简洁 Seedance 2.0 all-around-reference 提示词。必须说明视频应从分镜图生成，然后只写清景别/构图范围和发生了什么；只有动作确实需要时才补充镜头运动。提示词时长必须匹配 row.duration，且绝不能短于 10 秒。
- 如果镜头是抽象信息、文本卡片、数据图表、流程解释或 UI/MG 动画，生成方式设为 Hyperframes。在视频提示词列写简洁动画提示词，说明景别/构图范围、画面发生的变化、必要的 HTML/MG/文字/数据/UI 结构、阶段节奏、可见文案语言和时长。提示词时长必须匹配 row.duration，并保持在 10 到 20 秒之间。除非用户明确要求 2x2 分镜图，否则图片提示词写 "—"。
- Hyperframes 提示词必须保持可渲染。对于密集数据、生态图或多步骤解释，要求 3-5 个阶段，任一时刻最多显示 4 个主要统计卡片/节点，使用短标签，并给出稳定的最终布局。不要要求每一句来源文本或每个产品名同时可见。
- 如果用户明确说某个镜头会使用已准备素材、素材库素材、录屏、实拍、外部剪辑或手工制作，生成方式设为 自定义。图片和视频提示词都写 "—"，并在 row.note 中说明所需素材类型。自定义行会被排除在默认自动视频生成队列之外。
- 根据镜头内容选择生成方式。一份完整分镜通常会混合 ChatGPT Image2、Seedance 2.0、Hyperframes，以及少量 自定义 行。只有当脚本本身主要是抽象信息图、产品卡片、数据/流程解释或 UI 动画时，才大量使用 Hyperframes。

## 视频提示词规则

- 每条视频提示词保持简洁，优先控制在 1-3 个短句内。只写清 Shot 的景别/构图范围和实际发生了什么，再补充确有必要的时长、画幅、可见文字语言或镜头运动。
- 不要加入比喻、情绪渲染、电影感散文、泛泛的画质形容词或重复的故事说明。提示词的作用是交代镜头，不是渲染气氛。
- 当前行已经绑定或上传主体、角色、场景、分镜图或其他参考素材时，直接要求沿用参考。不要再用文字重复主体外观、服装、场景陈设、配色或风格。
- 禁止生成 BGM、配乐、旋律或背景音乐。只要求生成与画面动作和环境直接对应的同步音效；没有合理音效时宁可保持安静，也不要用音乐填充。
- 不要生成转场动画、转场素材、过渡镜头、片头或片尾式衔接。每个 Shot 独立成立，相邻 Shot 直接硬切。Hyperframes 可以保留单个 Shot 内必要的元素动画，但不得模拟跨 Shot 转场。

## 语言解析

使用两个信号：MkBoard 注入的用户界面语言，以及当前脚本的主导语言。

- 保留 row.content 中的原始口播内容。不要为了匹配界面语言而翻译脚本台词。
- 如果脚本明显是中文，生成的 row.note、图片提示词、视频提示词和 Hyperframes 可见文字要求都用中文。
- 如果脚本明显是英文，生成的 row.note、图片提示词、视频提示词和 Hyperframes 可见文字要求都用英文。
- 如果脚本为空、混合或不明确，回退到用户选择的界面语言：zh-CN / zh-TW 使用中文，en 使用英文。
- 如果没有可靠语言信号，默认生成英文 notes 和 prompts。
- Hyperframes 行的视频提示词必须明确说明标题、字幕、标签、步骤名、按钮、数据说明和其他屏幕文字的可见文字语言。
- 专有名词、产品名、模型名、代码标识符，以及原本就是另一种语言的短语可以保留。
- 固定枚举值不随语言变化：A-ROLL、B-ROLL、ChatGPT Image2、Seedance 2.0、Hyperframes、自定义。

## 表格字段

- 保持当前默认模板列：排序、镜号、画面、类别、时长（秒）、内容、备注。
- 同时填写这三个自定义列：图片提示词、视频提示词、生成方式。
- 图片提示词、视频提示词和生成方式必须写入匹配的 customValues[columnId]。
- 生成方式只能是 ChatGPT Image2、Seedance 2.0、Hyperframes 或 自定义。如果不需要生成方式，写空字符串。
- 空的图片提示词和视频提示词单元格仍然写 "—"。不要写 无、空、留空、N/A 或 UI 占位文字。
- 只有当当前项目素材 JSON 中存在明确可用的素材时，才把真实素材 id 写入 imageAssetIds。否则保持 imageAssetIds 为空数组。
`;

export class MkboardStore {
  private db: BetterSqlite3.Database;
  private readonly videoTailPosterBackfillAttempts = new Set<string>();

  private readonly dbPath: string;
  private readonly projectRoot: string;

  constructor(dbPath: string, projectRoot: string) {
    this.dbPath = dbPath;
    this.projectRoot = projectRoot;
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.migrate();
    this.removeUntouchedSampleProject();
    this.ensureTutorialProjects();
  }

  private readonly firstFrameExtractions = new Map<string, Promise<string | null>>();

  listProjects(): ProjectSummary[] {
    const rows = this.db
      .prepare(
        `SELECT projects.*,
                COALESCE((SELECT image_ratio FROM storyboard_settings WHERE project_id = projects.id), '16:9') AS image_ratio
         FROM projects
         WHERE deleted_at IS NULL AND archived_at IS NULL
         ORDER BY CASE WHEN kind = 'tutorial' THEN 1 ELSE 0 END, updated_at DESC`
      )
      .all() as ProjectRecord[];
    return rows.map((row) => this.enrichProjectSummary(mapProject(row)));
  }

  listArchivedProjects(): ProjectSummary[] {
    const rows = this.db
      .prepare(
        `SELECT projects.*,
                COALESCE((SELECT image_ratio FROM storyboard_settings WHERE project_id = projects.id), '16:9') AS image_ratio
         FROM projects
         WHERE deleted_at IS NULL AND archived_at IS NOT NULL AND COALESCE(kind, 'user') <> 'tutorial'
         ORDER BY archived_at DESC, updated_at DESC`
      )
      .all() as ProjectRecord[];
    return rows.map((row) => this.enrichProjectSummary(mapProject(row)));
  }

  listDeletedProjects(): ProjectSummary[] {
    const rows = this.db
      .prepare(
        `SELECT projects.*,
                COALESCE((SELECT image_ratio FROM storyboard_settings WHERE project_id = projects.id), '16:9') AS image_ratio
         FROM projects
         WHERE deleted_at IS NOT NULL AND COALESCE(kind, 'user') <> 'tutorial'
         ORDER BY deleted_at DESC`
      )
      .all() as ProjectRecord[];
    return rows.map((row) => this.enrichProjectSummary(mapProject(row)));
  }

  private enrichProjectSummary(summary: ProjectSummary): ProjectSummary {
    const shots = this.listShotRecords(summary.id);
    const mediaAssets = this.db
      .prepare("SELECT * FROM assets WHERE project_id = ? AND kind IN ('image', 'video') ORDER BY created_at ASC")
      .all(summary.id) as AssetRecord[];
    const assetById = new Map(mediaAssets.map((a) => [a.id, a]));

    const shotCount = shots.length;
    let bRollCount = 0;
    const isBRollScene = (scene: string) => !/^a[-_\s]?roll$/iu.test((scene || "").trim());

    type CandidateHit = { asset: AssetRecord; shotNumber: string | null; scene: string | null };
    let firstBRollVideo: CandidateHit | null = null;
    let firstAnyShotVideo: CandidateHit | null = null;
    let firstBRollImage: CandidateHit | null = null;
    let firstAnyShotImage: CandidateHit | null = null;

    for (const shot of shots) {
      const bRoll = isBRollScene(shot.scene);
      if (bRoll) bRollCount += 1;
      const custom = parseJsonObject(shot.custom_values_json);
      const orderedIds: string[] = [...getShotMediaIds(shot)];
      if (custom[PROMPT_PREVIEW_VIDEO_HIDDEN_FIELD] !== "1" && custom[PROMPT_PREVIEW_VIDEO_ASSET_ID_FIELD]) {
        pushUniqueId(orderedIds, custom[PROMPT_PREVIEW_VIDEO_ASSET_ID_FIELD]);
      }
      if (custom[PROMPT_PREVIEW_IMAGE_HIDDEN_FIELD] !== "1" && custom[PROMPT_PREVIEW_IMAGE_ASSET_ID_FIELD]) {
        pushUniqueId(orderedIds, custom[PROMPT_PREVIEW_IMAGE_ASSET_ID_FIELD]);
      }

      for (const assetId of orderedIds) {
        const asset = assetById.get(assetId);
        if (!asset) continue;
        const hit: CandidateHit = {
          asset,
          shotNumber: shot.shot_number?.trim() || null,
          scene: shot.scene?.trim() || null
        };
        if (asset.kind === "video") {
          if (bRoll && !firstBRollVideo) firstBRollVideo = hit;
          if (!firstAnyShotVideo) firstAnyShotVideo = hit;
        } else if (asset.kind === "image") {
          if (bRoll && !firstBRollImage) firstBRollImage = hit;
          if (!firstAnyShotImage) firstAnyShotImage = hit;
        }
      }
    }

    const fallbackUnboundVideo = mediaAssets.find((a) => a.kind === "video") ?? null;
    const fallbackUnboundImage = mediaAssets.find((a) => a.kind === "image") ?? null;

    const chosenVideo: CandidateHit | null =
      firstBRollVideo ??
      firstAnyShotVideo ??
      (fallbackUnboundVideo ? { asset: fallbackUnboundVideo, shotNumber: null, scene: null } : null);

    const chosenImage: CandidateHit | null =
      firstBRollImage ??
      firstAnyShotImage ??
      (fallbackUnboundImage ? { asset: fallbackUnboundImage, shotNumber: null, scene: null } : null);

    const videoCount = mediaAssets.filter((a) => a.kind === "video").length;

    let coverPreview: ProjectSummary["coverPreview"] = null;
    if (chosenVideo) {
      const videoUrl = createAssetPreviewUrl(chosenVideo.asset);
      const remote = isHttpUrl(chosenVideo.asset.local_path);
      coverPreview = {
        kind: "video-first-frame",
        url: remote ? videoUrl : createAssetFirstFrameUrl(chosenVideo.asset),
        videoUrl,
        fallbackUrl: chosenImage ? createAssetPreviewUrl(chosenImage.asset) : null,
        isRemoteVideo: remote,
        shotNumber: chosenVideo.shotNumber,
        scene: chosenVideo.scene
      };
    } else if (chosenImage) {
      coverPreview = {
        kind: "broll-image",
        url: createAssetPreviewUrl(chosenImage.asset),
        shotNumber: chosenImage.shotNumber,
        scene: chosenImage.scene
      };
    }

    return {
      ...summary,
      coverPreview,
      shotCount,
      bRollCount,
      videoCount
    };
  }

  countRetainedProjects(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM projects WHERE COALESCE(kind, 'user') <> 'tutorial'").get() as { count: number } | undefined;
    return row?.count ?? 0;
  }

  createProject(input: CreateProjectInput): ProjectDetail {
    const now = new Date().toISOString();
    const id = createId(input.name);
    const template = this.getTemplate(input.templateId, input.interfaceLanguage);
    const taste = this.getTasteRecordOrDefault(input.tasteId);
    const storyboardSkillId = input.storyboardSkillId?.trim() ? this.getSkillRecord(input.storyboardSkillId.trim()).id : template.storyboardSkillId;
    const localPath = this.createProjectFolder(input.name, id);
    const create = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO projects (id, kind, name, icon, template_id, taste_id, local_path, created_at, updated_at)
           VALUES (?, 'user', ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(id, input.name.trim(), input.icon, template.id, taste.id, localPath, now, now);
      this.insertDefaultProjectState(id, now, "<p></p>", [], template.columns, storyboardSkillId, normalizeImageRatio(input.imageRatio));
    });
    create();
    return this.getProject(id, input.interfaceLanguage);
  }

  ensureTutorialProject(interfaceLanguage?: InterfaceLanguage): ProjectDetail {
    const locale = getTutorialLocale(interfaceLanguage);
    const projectId = getTutorialProjectIdForLocale(locale);
    const existing = this.db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as ProjectRecord | undefined;
    if (!existing) {
      this.createTutorialProject(locale);
      return this.getProject(projectId, interfaceLanguage);
    }
    if (existing.kind !== "tutorial") {
      this.db.prepare("UPDATE projects SET kind = 'tutorial' WHERE id = ?").run(projectId);
      existing.kind = "tutorial";
    }
    this.syncTutorialProjectLocale(existing, interfaceLanguage);
    this.removeTutorialGeneratedMedia(existing.id);
    return this.getProject(projectId, interfaceLanguage);
  }

  getOnboardingState(appVersion = "", interfaceLanguage?: InterfaceLanguage): OnboardingState {
    const now = new Date().toISOString();
    const targetTutorialProjectId = getTutorialProjectId(interfaceLanguage);
    const existing = this.db.prepare("SELECT * FROM onboarding_state WHERE id = 'default'").get() as OnboardingStateRecord | undefined;
    if (existing) {
      const nextProjectId = isTutorialProjectId(existing.tutorial_project_id) ? targetTutorialProjectId : existing.tutorial_project_id || targetTutorialProjectId;
      if (
        existing.content_version !== tutorialProjectContentVersion ||
        existing.tutorial_project_id !== nextProjectId ||
        (appVersion && existing.app_version !== appVersion)
      ) {
        this.db
          .prepare("UPDATE onboarding_state SET app_version = ?, content_version = ?, tutorial_project_id = ?, updated_at = ? WHERE id = 'default'")
          .run(appVersion || existing.app_version, tutorialProjectContentVersion, nextProjectId, now);
        return mapOnboardingState({
          ...existing,
          app_version: appVersion || existing.app_version,
          content_version: tutorialProjectContentVersion,
          tutorial_project_id: nextProjectId,
          updated_at: now
        });
      }
      return mapOnboardingState(existing);
    }
    const row: OnboardingStateRecord = {
      id: "default",
      app_version: appVersion,
      content_version: tutorialProjectContentVersion,
      tutorial_project_id: targetTutorialProjectId,
      current_step: "settings",
      completed_step_ids_json: "[]",
      dismissed_step_ids_json: "[]",
      started_at: now,
      completed_at: null,
      updated_at: now
    };
    this.db
      .prepare(
        `INSERT INTO onboarding_state (
          id, app_version, content_version, tutorial_project_id, current_step, completed_step_ids_json, dismissed_step_ids_json, started_at, completed_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        row.id,
        row.app_version,
        row.content_version,
        row.tutorial_project_id,
        row.current_step,
        row.completed_step_ids_json,
        row.dismissed_step_ids_json,
        row.started_at,
        row.completed_at,
        row.updated_at
      );
    return mapOnboardingState(row);
  }

  updateOnboardingState(input: OnboardingStatePatch, appVersion = "", interfaceLanguage?: InterfaceLanguage): OnboardingState {
    const current = this.getOnboardingState(appVersion, interfaceLanguage);
    const now = new Date().toISOString();
    const next: OnboardingStateRecord = {
      id: "default",
      app_version: current.appVersion || appVersion,
      content_version: tutorialProjectContentVersion,
      tutorial_project_id: getTutorialProjectId(interfaceLanguage),
      current_step: input.currentStep ?? current.currentStep,
      completed_step_ids_json: JSON.stringify(input.completedStepIds ?? current.completedStepIds),
      dismissed_step_ids_json: JSON.stringify(input.dismissedStepIds ?? current.dismissedStepIds),
      started_at: input.startedAt === undefined ? current.startedAt : input.startedAt,
      completed_at: input.completedAt === undefined ? current.completedAt : input.completedAt,
      updated_at: now
    };
    this.db
      .prepare(
        `INSERT INTO onboarding_state (
          id, app_version, content_version, tutorial_project_id, current_step, completed_step_ids_json, dismissed_step_ids_json, started_at, completed_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          app_version = excluded.app_version,
          content_version = excluded.content_version,
          tutorial_project_id = excluded.tutorial_project_id,
          current_step = excluded.current_step,
          completed_step_ids_json = excluded.completed_step_ids_json,
          dismissed_step_ids_json = excluded.dismissed_step_ids_json,
          started_at = excluded.started_at,
          completed_at = excluded.completed_at,
          updated_at = excluded.updated_at`
      )
      .run(
        next.id,
        next.app_version,
        next.content_version,
        next.tutorial_project_id,
        next.current_step,
        next.completed_step_ids_json,
        next.dismissed_step_ids_json,
        next.started_at,
        next.completed_at,
        next.updated_at
      );
    return mapOnboardingState(next);
  }

  revealTutorialStoryboard(input: { projectId: string; interfaceLanguage?: InterfaceLanguage; revealCount?: number }): StoryboardRow[] {
    const project = this.getProjectRecord(input.projectId);
    if (!isTutorialProjectRecord(project)) throw new Error("只能在教程项目中加载教程分镜。");
    const scriptLocale = this.resolveTutorialProjectLocale(project, input.interfaceLanguage);
    this.syncTutorialProjectLocale(project, input.interfaceLanguage);
    const currentShotRecords = this.listShotRecords(project.id);
    const currentRows = currentShotRecords.map(mapShotRecord);
    const sourceRows = getTutorialStoryboardRowsForLocale(scriptLocale);
    const currentRowsLocale = inferTutorialStoryboardRowsLocale(currentRows);
    const shouldReplaceTutorialRows =
      areManagedTutorialStoryboardRows(currentRows) || (areTutorialStoryboardRows(currentRows) && currentRowsLocale !== null && currentRowsLocale !== scriptLocale);
    if (shouldReplaceTutorialRows) {
      const revealCount = Math.max(1, Math.min(sourceRows.length, input.revealCount ?? sourceRows.length));
      const targetCount = currentRows.length >= sourceRows.length ? sourceRows.length : Math.min(sourceRows.length, currentRows.length + revealCount);
      this.replaceTutorialStoryboardRows(project, sourceRows.slice(0, targetCount), scriptLocale, currentShotRecords);
      return this.listRows(project.id);
    }
    if (currentRows.length >= sourceRows.length) return currentRows;
    const revealCount = Math.max(1, Math.min(sourceRows.length, input.revealCount ?? sourceRows.length));
    const nextRows = sourceRows.slice(currentRows.length, Math.min(sourceRows.length, currentRows.length + revealCount));
    this.replaceRows(project.id, [...currentRows, ...nextRows]);
    this.syncTutorialBundledMediaAssets(project, scriptLocale);
    return this.listRows(project.id);
  }

  revealTutorialMedia(input: { projectId: string; rowIds?: string[]; kind: "image" | "video"; interfaceLanguage?: InterfaceLanguage }): ShotMediaUpdateResult {
    const project = this.getProjectRecord(input.projectId);
    if (!isTutorialProjectRecord(project)) throw new Error("只能在教程项目中加载教程素材。");
    const scriptLocale = this.resolveTutorialProjectLocale(project, input.interfaceLanguage);
    this.syncTutorialProjectLocale(project, input.interfaceLanguage);
    const sourceRowIds = new Set(getTutorialStoryboardRowsForLocale(scriptLocale).map((row) => row.id));
    const requestedRowIds = input.rowIds ? normalizeShotIdSet(input.rowIds) : null;
    const rows = this.listShotRecords(project.id).filter(
      (row) => sourceRowIds.has(row.id) && (!requestedRowIds || requestedRowIds.has(row.id)) && isTutorialMediaRevealTarget(row, input.kind)
    );
    if (rows.length === 0) return this.getShotMediaUpdate(project.id);
    this.revealTutorialMediaAssets(project, rows, input.kind, scriptLocale);
    return this.getShotMediaUpdate(project.id);
  }

  updateProject(input: UpdateProjectInput): ProjectSummary[] {
    const name = input.name.trim();
    if (!name) throw new Error("项目名称不能为空。");
    const project = this.getProjectRecord(input.id);
    const icon = input.icon?.trim() || project.icon;
    const template = input.templateId !== undefined ? this.getTemplate(input.templateId, input.interfaceLanguage) : null;
    const taste = input.tasteId !== undefined ? this.getTasteRecordOrDefault(input.tasteId) : null;
    const skill = input.storyboardSkillId?.trim() ? this.getSkillRecord(input.storyboardSkillId.trim()) : template ? this.getSkillRecord(template.storyboardSkillId) : null;
    const now = new Date().toISOString();
    const update = this.db.transaction(() => {
      this.db
        .prepare("UPDATE projects SET name = ?, icon = ?, template_id = ?, taste_id = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL")
        .run(name, icon, template?.id ?? project.template_id, taste?.id ?? project.taste_id, now, input.id);
      if (skill || template) {
        const settings = this.getSettings(input.id);
        const columnsJson = template ? JSON.stringify(ensureStoryboardPromptColumns(template.columns, input.interfaceLanguage)) : settings.columns_json;
        this.db
          .prepare("UPDATE storyboard_settings SET columns_json = ?, storyboard_skill_id = ?, updated_at = ? WHERE project_id = ?")
          .run(columnsJson, skill?.id ?? settings.storyboard_skill_id ?? this.getStoryboardSkillId(input.id), now, input.id);
      }
      if (input.imageRatio !== undefined) {
        const settings = this.getSettings(input.id);
        this.db
          .prepare("UPDATE storyboard_settings SET image_ratio = ?, columns_json = ?, updated_at = ? WHERE project_id = ?")
          .run(normalizeImageRatio(input.imageRatio), settings.columns_json, now, input.id);
      }
    });
    update();
    return this.listProjects();
  }

  getProject(projectId: string, interfaceLanguage?: InterfaceLanguage): ProjectDetail {
    let project = this.getProjectRecord(projectId);
    if (isTutorialProjectRecord(project)) {
      const tutorialLocale = this.resolveTutorialProjectLocale(project, interfaceLanguage);
      this.syncTutorialProjectLocale(project, interfaceLanguage);
      this.removeTutorialGeneratedMedia(project.id);
      this.syncTutorialStoryboardRowsToScriptLanguage(project, interfaceLanguage);
      this.ensureTutorialStoryboardContent(project, tutorialLocale);
      this.syncTutorialBundledMediaAssets(project, tutorialLocale);
      project = this.getProjectRecord(projectId);
    }
    const activeConversation = this.ensureActiveAgentConversation(projectId);
    return {
      project: mapProject(project),
      scriptHtml: this.getScriptHtml(projectId),
      rows: this.listRows(projectId),
      columns: this.getColumns(projectId, interfaceLanguage),
      imageRatio: this.getImageRatio(projectId),
      assets: this.listAssets(projectId),
      storyboardSkill: this.getProjectStoryboardSkill(project.id, interfaceLanguage),
      taste: this.getProjectTaste(project.id),
      agentConversations: this.listAgentConversations(projectId),
      activeAgentConversationId: activeConversation.id,
      agentMessages: this.listAgentMessages(projectId, activeConversation.id)
    };
  }

  async ensureProjectVideoTailPosters(projectId: string): Promise<void> {
    const project = this.getProjectRecord(projectId);
    const assets = this.db.prepare("SELECT * FROM assets WHERE project_id = ? AND kind = 'video'").all(projectId) as AssetRecord[];
    for (const asset of assets) {
      await this.ensureVideoAssetPoster(project, asset, { requireTailPoster: true });
    }
  }

  getProjectCloudProjectId(projectId: string): string | null {
    const project = this.getProjectRecord(projectId);
    return project.cloud_project_id ?? null;
  }

  saveProjectCloudProjectId(projectId: string, cloudProjectId: string): void {
    this.getProjectRecord(projectId);
    this.db.prepare("UPDATE projects SET cloud_project_id = ?, updated_at = ? WHERE id = ?").run(cloudProjectId, new Date().toISOString(), projectId);
  }

  listPendingCloudProjectDeletions(): PendingCloudProjectDeletion[] {
    const rows = this.db
      .prepare("SELECT cloud_project_id, local_project_id, created_at, last_attempted_at, last_error FROM pending_cloud_project_deletions ORDER BY created_at ASC")
      .all() as Array<{
      cloud_project_id: string;
      local_project_id: string;
      created_at: string;
      last_attempted_at: string | null;
      last_error: string | null;
    }>;
    return rows.map((row) => ({
      cloudProjectId: row.cloud_project_id,
      localProjectId: row.local_project_id,
      createdAt: row.created_at,
      lastAttemptedAt: row.last_attempted_at,
      lastError: row.last_error
    }));
  }

  markPendingCloudProjectDeletionAttempt(cloudProjectId: string, errorMessage: string): void {
    this.db
      .prepare("UPDATE pending_cloud_project_deletions SET last_attempted_at = ?, last_error = ? WHERE cloud_project_id = ?")
      .run(new Date().toISOString(), errorMessage, cloudProjectId);
  }

  completePendingCloudProjectDeletion(cloudProjectId: string): void {
    this.db.prepare("DELETE FROM pending_cloud_project_deletions WHERE cloud_project_id = ?").run(cloudProjectId);
  }

  archiveProject(projectId: string): ProjectSummary[] {
    this.assertUserProject(projectId, "教程项目不允许归档。");
    const now = new Date().toISOString();
    this.db.prepare("UPDATE projects SET archived_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL").run(now, now, projectId);
    return this.listProjects();
  }

  unarchiveProject(projectId: string): ProjectSummary[] {
    const now = new Date().toISOString();
    this.db.prepare("UPDATE projects SET archived_at = NULL, updated_at = ? WHERE id = ? AND deleted_at IS NULL").run(now, projectId);
    return this.listArchivedProjects();
  }

  trashProject(projectId: string): ProjectSummary[] {
    this.assertUserProject(projectId, "教程项目不允许删除。");
    const now = new Date().toISOString();
    this.db.prepare("UPDATE projects SET deleted_at = ?, updated_at = ? WHERE id = ?").run(now, now, projectId);
    return this.listProjects();
  }

  restoreProject(projectId: string): ProjectSummary[] {
    const now = new Date().toISOString();
    this.db.prepare("UPDATE projects SET deleted_at = NULL, updated_at = ? WHERE id = ?").run(now, projectId);
    return this.listDeletedProjects();
  }

  deleteProject(projectId: string): ProjectSummary[] {
    const project = this.getProjectRecord(projectId);
    if (isTutorialProjectRecord(project)) throw new Error("教程项目不允许删除。");
    if (!project.deleted_at) {
      throw new Error("请先将项目移入回收站，再永久删除。");
    }
    if (!isPathInside(this.projectRoot, project.local_path)) {
      throw new Error(`Refusing to delete project folder outside MkBoard project root: ${project.local_path}`);
    }
    const tx = this.db.transaction(() => {
      if (project.cloud_project_id) {
        this.db
          .prepare(
            `INSERT INTO pending_cloud_project_deletions (cloud_project_id, local_project_id, created_at, last_attempted_at, last_error)
             VALUES (?, ?, ?, NULL, NULL)
             ON CONFLICT(cloud_project_id) DO NOTHING`
          )
          .run(project.cloud_project_id, project.id, new Date().toISOString());
      }
      this.db.prepare("DELETE FROM projects WHERE id = ?").run(projectId);
    });
    tx();
    rmSync(project.local_path, { recursive: true, force: true });
    return this.listDeletedProjects();
  }

  updateScript(projectId: string, scriptHtml: string): void {
    const normalizedScriptHtml = normalizeScriptARollTags(scriptHtml);
    this.touchProject(projectId);
    this.db
      .prepare(
        `INSERT INTO scripts (project_id, html, plain_text, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(project_id) DO UPDATE SET
           html = excluded.html,
           plain_text = excluded.plain_text,
           updated_at = excluded.updated_at`
      )
      .run(projectId, normalizedScriptHtml, stripHtml(normalizedScriptHtml), new Date().toISOString());
  }

  generateStoryboard(projectId: string): StoryboardRow[] {
    const script = stripHtml(this.getScriptHtml(projectId));
    const rows = splitScriptIntoStoryboard(script);
    this.replaceRows(projectId, rows);
    return this.listRows(projectId);
  }

  replaceRowsAfterStoryboardParse(projectId: string, rows: StoryboardRow[]): void {
    const previousShotIds = this.listShotRecords(projectId).map((row) => row.id);
    const resetRows = rows.map(resetStoryboardParseRowMedia);
    const now = new Date().toISOString();
    const insert = this.db.prepare(
      `INSERT INTO shots (
        id, project_id, position, shot_number, image_asset_id, image_asset_ids_json, scene, duration, content, note, custom_values_json, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const tx = this.db.transaction(() => {
      if (previousShotIds.length > 0) {
        const placeholders = previousShotIds.map(() => "?").join(", ");
        this.db
          .prepare(`UPDATE assets SET linked_shot_id = NULL WHERE project_id = ? AND linked_shot_id IN (${placeholders})`)
          .run(projectId, ...previousShotIds);
      }
      this.db.prepare("DELETE FROM shots WHERE project_id = ?").run(projectId);
      resetRows.forEach((row, index) => {
        insert.run(
          row.id || randomUUID(),
          projectId,
          index + 1,
          String(index + 1),
          null,
          "[]",
          row.scene || "",
          row.duration || "0",
          row.content || "",
          row.note || "",
          JSON.stringify(row.customValues ?? {}),
          now,
          now
        );
      });
      this.touchProject(projectId);
    });
    tx();
  }

  createShots(projectId: string, count: number): StoryboardRow[] {
    const boundedCount = Math.max(1, Math.min(20, Math.floor(count)));
    const now = new Date().toISOString();
    const current = this.listRows(projectId);
    const insert = this.db.prepare(
      `INSERT INTO shots (
        id, project_id, position, shot_number, image_asset_id, image_asset_ids_json, scene, duration, content, note, custom_values_json, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const tx = this.db.transaction(() => {
      for (let index = 0; index < boundedCount; index += 1) {
        const position = current.length + index + 1;
        insert.run(
          randomUUID(),
          projectId,
          position,
          String(position),
          null,
          "[]",
          "",
          "0",
          "",
          "",
          "{}",
          now,
          now
        );
      }
      this.touchProject(projectId);
    });
    tx();
    return this.listRows(projectId);
  }

  insertShot(projectId: string, targetRowId: string, placement: "before" | "after"): StoryboardRow[] {
    this.getProjectRecord(projectId);
    const rows = this.listShotRecords(projectId);
    const targetIndex = rows.findIndex((row) => row.id === targetRowId);
    const insertIndex = targetIndex < 0 ? rows.length : placement === "before" ? targetIndex : targetIndex + 1;
    const now = new Date().toISOString();
    const insertedRow = createEmptyShotRecord(projectId, now);
    const nextRows = [...rows];
    nextRows.splice(insertIndex, 0, insertedRow);
    const insert = this.db.prepare(
      `INSERT INTO shots (
        id, project_id, position, shot_number, image_asset_id, image_asset_ids_json, scene, duration, content, note, custom_values_json, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const tx = this.db.transaction(() => {
      insert.run(
        insertedRow.id,
        insertedRow.project_id,
        insertedRow.position,
        insertedRow.shot_number,
        insertedRow.image_asset_id,
        insertedRow.image_asset_ids_json ?? "[]",
        insertedRow.scene,
        insertedRow.duration,
        insertedRow.content,
        insertedRow.note,
        insertedRow.custom_values_json,
        insertedRow.created_at,
        insertedRow.updated_at
      );
      this.resequenceShotRecords(projectId, nextRows, now);
      this.touchProject(projectId);
    });
    tx();
    return this.listRows(projectId);
  }

  duplicateShots(projectId: string, rowIds: string[]): StoryboardRow[] {
    const requestedRowIds = normalizeShotIdSet(rowIds);
    if (requestedRowIds.size === 0) return this.listRows(projectId);

    this.getProjectRecord(projectId);
    const rows = this.listShotRecords(projectId);
    const selectedRowIds = new Set(rows.filter((row) => requestedRowIds.has(row.id)).map((row) => row.id));
    if (selectedRowIds.size === 0) return rows.map(mapShotRecord);

    const now = new Date().toISOString();
    const duplicateRows: ShotRecord[] = [];
    const nextRows = rows.flatMap((row) => {
      if (!selectedRowIds.has(row.id)) return [row];
      const duplicateRow: ShotRecord = {
        ...row,
        id: randomUUID(),
        project_id: projectId,
        position: 0,
        shot_number: "",
        image_asset_ids_json: JSON.stringify(getShotMediaIds(row)),
        custom_values_json: row.custom_values_json || "{}",
        created_at: now,
        updated_at: now
      };
      duplicateRows.push(duplicateRow);
      return [
        row,
        duplicateRow
      ];
    });
    const insert = this.db.prepare(
      `INSERT INTO shots (
        id, project_id, position, shot_number, image_asset_id, image_asset_ids_json, scene, duration, content, note, custom_values_json, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const tx = this.db.transaction(() => {
      duplicateRows.forEach((row) => {
        insert.run(
          row.id,
          row.project_id,
          row.position,
          row.shot_number,
          row.image_asset_id,
          row.image_asset_ids_json ?? "[]",
          row.scene,
          row.duration,
          row.content,
          row.note,
          row.custom_values_json,
          row.created_at,
          row.updated_at
        );
      });
      this.resequenceShotRecords(projectId, nextRows, now);
      this.touchProject(projectId);
    });
    tx();
    return this.listRows(projectId);
  }

  deleteShots(projectId: string, rowIds: string[]): StoryboardRow[] {
    const requestedRowIds = normalizeShotIdSet(rowIds);
    if (requestedRowIds.size === 0) return this.listRows(projectId);

    this.getProjectRecord(projectId);
    const rows = this.listShotRecords(projectId);
    const selectedRowIds = new Set(rows.filter((row) => requestedRowIds.has(row.id)).map((row) => row.id));
    if (selectedRowIds.size === 0) return rows.map(mapShotRecord);

    const now = new Date().toISOString();
    const nextRows = rows.filter((row) => !selectedRowIds.has(row.id));
    const deleteShot = this.db.prepare("DELETE FROM shots WHERE id = ? AND project_id = ?");
    const clearLinkedAsset = this.db.prepare("UPDATE assets SET linked_shot_id = NULL WHERE project_id = ? AND linked_shot_id = ?");
    const tx = this.db.transaction(() => {
      selectedRowIds.forEach((rowId) => {
        deleteShot.run(rowId, projectId);
        clearLinkedAsset.run(projectId, rowId);
      });
      this.resequenceShotRecords(projectId, nextRows, now);
      this.touchProject(projectId);
    });
    tx();
    return this.listRows(projectId);
  }

  getShotMediaUpdate(projectId: string): ShotMediaUpdateResult {
    return {
      rows: this.listRows(projectId),
      assets: this.listAssets(projectId)
    };
  }

  upsertStoryboardImageDeliveryRecovery(input: {
    projectId: string;
    taskId: string;
    rowId: string;
    providerTaskId?: string | null;
    errorMessage?: string | null;
    attemptCount: number;
  }): StoryboardImageDeliveryRecoveryRecord {
    this.getProjectRecord(input.projectId);
    if (!this.getShotRecord(input.projectId, input.rowId)) throw new Error(`Storyboard row not found: ${input.rowId}`);
    const taskId = input.taskId.trim();
    if (!taskId) throw new Error("Storyboard image task id is required.");
    const attemptCount = Math.max(0, Math.floor(Number.isFinite(input.attemptCount) ? input.attemptCount : 0));
    this.db
      .prepare(
        `INSERT INTO storyboard_image_delivery_recoveries (
           project_id, task_id, row_id, provider_task_id, error_message, attempt_count
         )
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(project_id, task_id) DO UPDATE SET
           row_id = excluded.row_id,
           provider_task_id = COALESCE(excluded.provider_task_id, storyboard_image_delivery_recoveries.provider_task_id),
           error_message = excluded.error_message,
           attempt_count = excluded.attempt_count`
      )
      .run(
        input.projectId,
        taskId,
        input.rowId,
        input.providerTaskId?.trim() || null,
        input.errorMessage ?? null,
        attemptCount
      );
    return this.getStoryboardImageDeliveryRecovery(input.projectId, taskId);
  }

  listStoryboardImageDeliveryRecoveries(projectId: string): StoryboardImageDeliveryRecoveryRecord[] {
    this.getProjectRecord(projectId);
    return this.db
      .prepare("SELECT * FROM storyboard_image_delivery_recoveries WHERE project_id = ? ORDER BY task_id ASC")
      .all(projectId) as StoryboardImageDeliveryRecoveryRecord[];
  }

  deleteStoryboardImageDeliveryRecovery(projectId: string, taskId: string): void {
    this.db.prepare("DELETE FROM storyboard_image_delivery_recoveries WHERE project_id = ? AND task_id = ?").run(projectId, taskId);
  }

  private getStoryboardImageDeliveryRecovery(projectId: string, taskId: string): StoryboardImageDeliveryRecoveryRecord {
    const recovery = this.db
      .prepare("SELECT * FROM storyboard_image_delivery_recoveries WHERE project_id = ? AND task_id = ?")
      .get(projectId, taskId) as StoryboardImageDeliveryRecoveryRecord | undefined;
    if (!recovery) throw new Error(`Storyboard image delivery recovery not found: ${taskId}`);
    return recovery;
  }

  createStoryboardVideoTask(input: {
    projectId: string;
    rowId: string;
    method: StoryboardVideoGenerationMethod;
    prompt: string;
    aspectRatio?: string | null;
    durationSec?: number | null;
  }): StoryboardVideoTaskRecord {
    this.getProjectRecord(input.projectId);
    const shot = this.getShotRecord(input.projectId, input.rowId);
    if (!shot) throw new Error(`Storyboard row not found: ${input.rowId}`);
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO storyboard_video_tasks (
           id, project_id, row_id, method, status, prompt, aspect_ratio, duration_sec,
           created_at, updated_at
         )
         VALUES (?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?)`
      )
      .run(id, input.projectId, input.rowId, input.method, input.prompt, input.aspectRatio ?? null, input.durationSec ?? null, now, now);
    return this.getStoryboardVideoTask(input.projectId, id);
  }

  updateStoryboardVideoTask(projectId: string, taskId: string, patch: StoryboardVideoTaskPatch): StoryboardVideoTaskRecord | null {
    const existing = this.getStoryboardVideoTaskOrNull(projectId, taskId);
    if (!existing) return null;
    const now = new Date().toISOString();
    const assignments: string[] = ["updated_at = ?"];
    const values: unknown[] = [now];

    const add = (column: string, value: unknown) => {
      assignments.push(`${column} = ?`);
      values.push(value);
    };

    if (patch.status !== undefined) {
      add("status", patch.status);
      if (patch.status === "running" && !existing.started_at) {
        add("started_at", now);
      } else if (patch.status === "succeeded") {
        add("completed_at", now);
        add("failed_at", null);
        add("cancelled_at", null);
      } else if (patch.status === "failed") {
        add("failed_at", now);
      } else if (patch.status === "cancelled") {
        add("cancelled_at", now);
      }
    }
    if ("provider" in patch) add("provider", patch.provider ?? null);
    if ("providerTaskId" in patch) add("provider_task_id", patch.providerTaskId ?? null);
    if ("workDir" in patch) add("work_dir", patch.workDir ?? null);
    if ("outputDir" in patch) add("output_dir", patch.outputDir ?? null);
    if ("outputPath" in patch) add("output_path", patch.outputPath ?? null);
    if ("assetId" in patch) add("asset_id", patch.assetId ?? null);
    if ("fileName" in patch) add("file_name", patch.fileName ?? null);
    if ("errorMessage" in patch) add("error_message", patch.errorMessage ?? null);

    values.push(taskId, projectId);
    this.db.prepare(`UPDATE storyboard_video_tasks SET ${assignments.join(", ")} WHERE id = ? AND project_id = ?`).run(...values);
    return this.getStoryboardVideoTaskOrNull(projectId, taskId);
  }

  listLatestStoryboardVideoTasks(projectId: string): StoryboardVideoTaskRecord[] {
    this.getProjectRecord(projectId);
    const rows = this.listStoryboardVideoTasks(projectId).slice().reverse();
    const seenRowIds = new Set<string>();
    const latestRows: StoryboardVideoTaskRecord[] = [];
    for (const row of rows) {
      if (seenRowIds.has(row.row_id)) continue;
      seenRowIds.add(row.row_id);
      latestRows.push(row);
    }
    return latestRows.reverse();
  }

  listStoryboardVideoTasks(projectId: string): StoryboardVideoTaskRecord[] {
    this.getProjectRecord(projectId);
    return this.db
      .prepare("SELECT * FROM storyboard_video_tasks WHERE project_id = ? ORDER BY created_at ASC, updated_at ASC")
      .all(projectId) as StoryboardVideoTaskRecord[];
  }

  listRecoverableStoryboardVideoTasks(projectId: string): StoryboardVideoTaskRecord[] {
    return this.listLatestStoryboardVideoTasks(projectId).filter((task) => task.status === "queued" || task.status === "running");
  }

  getLatestStoryboardVideoTaskByRow(projectId: string, rowId: string): StoryboardVideoTaskRecord | null {
    this.getProjectRecord(projectId);
    return (
      (this.db
        .prepare("SELECT * FROM storyboard_video_tasks WHERE project_id = ? AND row_id = ? ORDER BY created_at DESC, updated_at DESC LIMIT 1")
        .get(projectId, rowId) as StoryboardVideoTaskRecord | undefined) ?? null
    );
  }

  getStoryboardVideoTaskByProviderTaskId(projectId: string, providerTaskId: string): StoryboardVideoTaskRecord | null {
    this.getProjectRecord(projectId);
    return (
      (this.db
        .prepare(
          "SELECT * FROM storyboard_video_tasks WHERE project_id = ? AND provider_task_id = ? ORDER BY created_at DESC, updated_at DESC LIMIT 1"
        )
        .get(projectId, providerTaskId) as StoryboardVideoTaskRecord | undefined) ?? null
    );
  }

  mapStoryboardVideoTask(task: StoryboardVideoTaskRecord): StoryboardActiveVideoGenerationTask {
    return mapStoryboardVideoTaskRecord(task);
  }

  private getStoryboardVideoTask(projectId: string, taskId: string): StoryboardVideoTaskRecord {
    const task = this.getStoryboardVideoTaskOrNull(projectId, taskId);
    if (!task) throw new Error(`Storyboard video task not found: ${taskId}`);
    return task;
  }

  private getStoryboardVideoTaskOrNull(projectId: string, taskId: string): StoryboardVideoTaskRecord | null {
    return (
      (this.db.prepare("SELECT * FROM storyboard_video_tasks WHERE id = ? AND project_id = ?").get(taskId, projectId) as StoryboardVideoTaskRecord | undefined) ??
      null
    );
  }

  async importShotMediaPaths(projectId: string, rowId: string, filePaths: string[]): Promise<ShotMediaUpdateResult> {
    const project = this.getProjectRecord(projectId);
    const shot = this.getShotRecord(projectId, rowId);
    if (!shot) return this.getShotMediaUpdate(projectId);

    const currentIds = getShotMediaIds(shot);
    const remainingSlots = maxShotMediaAssets - currentIds.length;
    if (remainingSlots <= 0) return this.getShotMediaUpdate(projectId);

    const importedAssetIds = await this.insertAssetFileRecords(project, filePaths, {
      linkedShotId: rowId,
      existingTargetAssetIds: currentIds,
      limit: remainingSlots,
      mediaOnly: true
    });
    const tx = this.db.transaction(() => {
      if (importedAssetIds.length === 0) return;
      this.writeShotMediaIds(projectId, rowId, [...currentIds, ...importedAssetIds], new Date().toISOString());
      this.markShotMediaSelectionTouched(projectId, rowId, new Date().toISOString());
      this.touchProject(projectId);
    });
    tx();
    return this.getShotMediaUpdate(projectId);
  }

  importShotMediaBuffer(projectId: string, rowId: string, fileName: string, buffer: Uint8Array): ShotMediaUpdateResult {
    const project = this.getProjectRecord(projectId);
    const shot = this.getShotRecord(projectId, rowId);
    if (!shot || buffer.byteLength === 0) return this.getShotMediaUpdate(projectId);

    const currentIds = getShotMediaIds(shot);
    if (currentIds.length >= maxShotMediaAssets) return this.getShotMediaUpdate(projectId);

    const assetsDir = join(project.local_path, "assets");
    mkdirSync(assetsDir, { recursive: true });
    const now = new Date().toISOString();
    const contentHash = hashBuffer(buffer);
    const existingAssetId = this.findAssetIdByContentHash(projectId, contentHash);
    if (existingAssetId) {
      const tx = this.db.transaction(() => {
        this.writeShotMediaIds(projectId, rowId, [...currentIds, existingAssetId], now);
        this.markShotMediaSelectionTouched(projectId, rowId, now);
        this.touchProject(projectId);
      });
      tx();
      return this.getShotMediaUpdate(projectId);
    }
    const safeFileName = uniqueAssetFileName(assetsDir, fileName || `clipboard-${Date.now()}.png`);
    const destination = join(assetsDir, safeFileName);
    const assetId = randomUUID();
    const insert = this.db.prepare(
      `INSERT INTO assets (id, project_id, file_name, kind, file_size, local_path, indexed_path, linked_shot_id, content_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const tx = this.db.transaction(() => {
      writeFileSync(destination, Buffer.from(buffer));
      insert.run(assetId, projectId, safeFileName, "image", buffer.byteLength, destination, relative(project.local_path, destination), rowId, contentHash, now);
      this.writeShotMediaIds(projectId, rowId, [...currentIds, assetId], now);
      this.markShotMediaSelectionTouched(projectId, rowId, now);
      this.touchProject(projectId);
    });
    tx();
    return this.getShotMediaUpdate(projectId);
  }

  upsertGeneratedShotImage(projectId: string, rowId: string, assetId: string, fileName: string, buffer: Uint8Array, _overwriteExisting: boolean): ShotMediaUpdateResult {
    const project = this.getProjectRecord(projectId);
    const shot = this.getShotRecord(projectId, rowId);
    if (!shot || !assetId || buffer.byteLength === 0) return this.getShotMediaUpdate(projectId);

    const existingAsset = this.getAssetRecord(projectId, assetId);
    const assetsDir = join(project.local_path, "assets");
    mkdirSync(assetsDir, { recursive: true });
    const now = new Date().toISOString();
    const contentHash = hashBuffer(buffer);
    const safeFileName = existingAsset?.file_name ?? uniqueAssetFileName(assetsDir, fileName || `${assetId}.png`);
    const destination = existingAsset?.local_path ?? join(assetsDir, safeFileName);
    const indexedPath = relative(project.local_path, destination);

    const tx = this.db.transaction(() => {
      writeFileSync(destination, Buffer.from(buffer));
      if (existingAsset) {
        this.db
          .prepare("UPDATE assets SET file_size = ?, local_path = ?, indexed_path = ?, linked_shot_id = ?, content_hash = ? WHERE id = ? AND project_id = ?")
          .run(buffer.byteLength, destination, indexedPath, rowId, contentHash, assetId, projectId);
      } else {
        this.db
          .prepare(
            `INSERT INTO assets (id, project_id, file_name, kind, file_size, local_path, indexed_path, linked_shot_id, content_hash, created_at)
             VALUES (?, ?, ?, 'image', ?, ?, ?, ?, ?, ?)`
          )
          .run(assetId, projectId, safeFileName, buffer.byteLength, destination, indexedPath, rowId, contentHash, now);
      }

      const currentIds = getShotMediaIds(shot);
      this.writeShotPromptPreviewAsset(projectId, rowId, "image", assetId, now);
      this.writeShotMediaIds(projectId, rowId, putGeneratedMediaAssetFirst(currentIds, assetId), now);
      this.markShotMediaSelectionTouched(projectId, rowId, now);
      this.touchProject(projectId);
    });
    tx();
    return this.getShotMediaUpdate(projectId);
  }

  upsertGeneratedShotVideo(
    projectId: string,
    rowId: string,
    assetId: string,
    sourcePath: string,
    fileName: string,
    _overwriteExisting: boolean,
    posterSourcePath?: string | null
  ): ShotMediaUpdateResult {
    const project = this.getProjectRecord(projectId);
    const shot = this.getShotRecord(projectId, rowId);
    if (!shot || !assetId || !sourcePath || !existsSync(sourcePath)) return this.getShotMediaUpdate(projectId);
    const stats = statSync(sourcePath);
    if (!stats.isFile()) return this.getShotMediaUpdate(projectId);

    const assetsDir = join(project.local_path, "assets");
    mkdirSync(assetsDir, { recursive: true });
    const now = new Date().toISOString();
    const existingAsset = this.getAssetRecord(projectId, assetId);
    const safeFileName = existingAsset?.file_name ?? uniqueAssetFileName(assetsDir, fileName || basename(sourcePath) || `${assetId}.mp4`);
    const destination = existingAsset?.local_path ?? join(assetsDir, safeFileName);
    const indexedPath = relative(project.local_path, destination);
    const contentHash = hashFile(sourcePath);
    const poster = prepareGeneratedVideoPoster(project, assetsDir, safeFileName, posterSourcePath, existingAsset?.poster_path);

    const tx = this.db.transaction(() => {
      if (resolve(sourcePath) !== resolve(destination)) copyFileSync(sourcePath, destination);
      if (existingAsset?.poster_path && existingAsset.poster_path !== poster.path) removeProjectFile(project, existingAsset.poster_path);
      if (poster.sourcePath && poster.path && resolve(poster.sourcePath) !== resolve(poster.path)) copyFileSync(poster.sourcePath, poster.path);
      if (existingAsset) {
        this.db
          .prepare(
            "UPDATE assets SET file_name = ?, kind = 'video', file_size = ?, local_path = ?, indexed_path = ?, poster_path = ?, poster_indexed_path = ?, linked_shot_id = ?, content_hash = ? WHERE id = ? AND project_id = ?"
          )
          .run(safeFileName, stats.size, destination, indexedPath, poster.path, poster.indexedPath, rowId, contentHash, assetId, projectId);
      } else {
        this.db
          .prepare(
            `INSERT INTO assets (id, project_id, file_name, kind, file_size, local_path, indexed_path, poster_path, poster_indexed_path, linked_shot_id, content_hash, created_at)
             VALUES (?, ?, ?, 'video', ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(assetId, projectId, safeFileName, stats.size, destination, indexedPath, poster.path, poster.indexedPath, rowId, contentHash, now);
      }

      const currentIds = getShotMediaIds(shot);
      this.writeShotPromptPreviewAsset(projectId, rowId, "video", assetId, now);
      this.writeShotMediaIds(projectId, rowId, putGeneratedMediaAssetFirst(currentIds, assetId), now);
      this.markShotMediaSelectionTouched(projectId, rowId, now);
      this.touchProject(projectId);
    });
    tx();
    return this.getShotMediaUpdate(projectId);
  }

  async upsertGeneratedShotVideoBytes(
    projectId: string,
    rowId: string,
    assetId: string,
    fileName: string,
    buffer: Uint8Array,
    _overwriteExisting: boolean
  ): Promise<ShotMediaUpdateResult> {
    const project = this.getProjectRecord(projectId);
    const shot = this.getShotRecord(projectId, rowId);
    if (!shot || !assetId || buffer.byteLength === 0) return this.getShotMediaUpdate(projectId);

    const existingAsset = this.getAssetRecord(projectId, assetId);
    const assetsDir = join(project.local_path, "assets");
    mkdirSync(assetsDir, { recursive: true });
    const now = new Date().toISOString();
    const contentHash = hashBuffer(buffer);
    const safeFileName = existingAsset?.file_name ?? uniqueAssetFileName(assetsDir, fileName || `${assetId}.mp4`);
    const destination = existingAsset?.local_path ?? join(assetsDir, safeFileName);
    const indexedPath = relative(project.local_path, destination);
    writeFileSync(destination, Buffer.from(buffer));
    const poster = await prepareVideoAssetPoster(project, assetsDir, safeFileName, destination, existingAsset?.poster_path);

    const tx = this.db.transaction(() => {
      if (existingAsset?.poster_path && existingAsset.poster_path !== poster.path) removeProjectFile(project, existingAsset.poster_path);
      if (existingAsset) {
        this.db
          .prepare(
            "UPDATE assets SET file_name = ?, kind = 'video', file_size = ?, local_path = ?, indexed_path = ?, poster_path = ?, poster_indexed_path = ?, linked_shot_id = ?, content_hash = ? WHERE id = ? AND project_id = ?"
          )
          .run(safeFileName, buffer.byteLength, destination, indexedPath, poster.path, poster.indexedPath, rowId, contentHash, assetId, projectId);
      } else {
        this.db
          .prepare(
            `INSERT INTO assets (id, project_id, file_name, kind, file_size, local_path, indexed_path, poster_path, poster_indexed_path, linked_shot_id, content_hash, created_at)
             VALUES (?, ?, ?, 'video', ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(assetId, projectId, safeFileName, buffer.byteLength, destination, indexedPath, poster.path, poster.indexedPath, rowId, contentHash, now);
      }

      const currentIds = getShotMediaIds(shot);
      this.writeShotPromptPreviewAsset(projectId, rowId, "video", assetId, now);
      this.writeShotMediaIds(projectId, rowId, putGeneratedMediaAssetFirst(currentIds, assetId), now);
      this.markShotMediaSelectionTouched(projectId, rowId, now);
      this.touchProject(projectId);
    });
    tx();
    return this.getShotMediaUpdate(projectId);
  }

  ensureShotMediaAsset(projectId: string, rowId: string, assetId: string): ShotMediaUpdateResult {
    const shot = this.getShotRecord(projectId, rowId);
    const asset = this.getAssetRecord(projectId, assetId);
    if (!shot || !asset || !isShotMediaKind(asset.kind)) return this.getShotMediaUpdate(projectId);

    const now = new Date().toISOString();
    const currentIds = getShotMediaIds(shot);
    const alreadySelected = currentIds.includes(assetId);
    const stillLinkedToShot = asset.linked_shot_id === rowId;
    // A completed cloud task may be seen again after refresh; do not reattach media the user removed from this shot.
    if (!alreadySelected && !stillLinkedToShot) return this.getShotMediaUpdate(projectId);

    const nextIds = alreadySelected ? currentIds : putGeneratedMediaAssetFirst(currentIds, assetId);
    const tx = this.db.transaction(() => {
      this.writeShotMediaIds(projectId, rowId, nextIds, now);
      this.writeShotPromptPreviewAsset(projectId, rowId, asset.kind === "video" ? "video" : "image", assetId, now);
      this.markShotMediaSelectionTouched(projectId, rowId, now);
      this.touchProject(projectId);
    });
    tx();
    return this.getShotMediaUpdate(projectId);
  }

  updateShotMedia(projectId: string, rowId: string, assetIds: string[]): ShotMediaUpdateResult {
    const shot = this.getShotRecord(projectId, rowId);
    if (!shot) return this.getShotMediaUpdate(projectId);
    const currentAssetIds = getShotMediaIds(shot);
    const validAssetIds = this.filterProjectMediaAssetIds(projectId, assetIds);
    const nextAssetIdSet = new Set(validAssetIds);
    const removedAssetIds = currentAssetIds.filter((assetId) => !nextAssetIdSet.has(assetId));
    const now = new Date().toISOString();
    const unlinkRemovedAsset = this.db.prepare(
      "UPDATE assets SET linked_shot_id = NULL WHERE id = ? AND project_id = ? AND linked_shot_id = ?"
    );
    const tx = this.db.transaction(() => {
      this.writeShotMediaIds(projectId, rowId, validAssetIds, now);
      // Successful cloud tasks are polled more than once. Clearing the source link for an
      // explicitly removed item prevents a later poll from treating it as still selected.
      removedAssetIds.forEach((assetId) => unlinkRemovedAsset.run(assetId, projectId, rowId));
      this.markShotMediaSelectionTouched(projectId, rowId, now);
      this.touchProject(projectId);
    });
    tx();
    return this.getShotMediaUpdate(projectId);
  }

  updateShot(projectId: string, input: UpdateShotInput): StoryboardRow[] {
    const shot = this.db.prepare("SELECT * FROM shots WHERE id = ? AND project_id = ?").get(input.id, projectId) as ShotRecord | undefined;
    if (!shot) return this.listRows(projectId);

    const standardFields = new Set(["scene", "duration", "content", "note"]);
    const now = new Date().toISOString();
    if (standardFields.has(input.field)) {
      this.db
        .prepare(`UPDATE shots SET ${input.field} = ?, updated_at = ? WHERE id = ? AND project_id = ?`)
        .run(input.value, now, input.id, projectId);
    } else {
      const customValues = parseJsonObject(shot.custom_values_json);
      customValues[input.field] = input.value;
      this.db
        .prepare("UPDATE shots SET custom_values_json = ?, updated_at = ? WHERE id = ? AND project_id = ?")
        .run(JSON.stringify(customValues), now, input.id, projectId);
    }
    this.touchProject(projectId);
    return this.listRows(projectId);
  }

  reorderShots(projectId: string, sourceRowId: string, targetRowId: string): StoryboardRow[] {
    if (!sourceRowId || sourceRowId === targetRowId) return this.listRows(projectId);
    const rows = this.listRows(projectId);
    const sourceIndex = rows.findIndex((row) => row.id === sourceRowId);
    const targetIndex = rows.findIndex((row) => row.id === targetRowId);
    if (sourceIndex < 0 || targetIndex < 0) return rows;
    const nextRows = [...rows];
    const [moved] = nextRows.splice(sourceIndex, 1);
    nextRows.splice(targetIndex, 0, moved);
    this.replaceRows(projectId, nextRows);
    return this.listRows(projectId);
  }

  saveColumns(projectId: string, columns: StoryboardColumn[]): void {
    this.saveSettings(projectId, this.getImageRatio(projectId), columns);
  }

  saveImageRatio(projectId: string, imageRatio: ImageRatio): void {
    this.saveSettings(projectId, normalizeImageRatio(imageRatio), this.getColumns(projectId));
  }

  saveStoryboardSkill(projectId: string, skillId: string): ProjectSkill {
    this.getProjectRecord(projectId);
    const skill = this.getSkillRecord(skillId);
    const settings = this.getSettings(projectId);
    this.saveSettings(projectId, settings.image_ratio, this.getColumns(projectId), skill.id);
    return mapSkill(skill);
  }

  saveProjectTaste(projectId: string, tasteId: string): ProjectTaste {
    this.getProjectRecord(projectId);
    const taste = this.getTasteRecordOrDefault(tasteId);
    this.db.prepare("UPDATE projects SET taste_id = ?, updated_at = ? WHERE id = ?").run(taste.id, new Date().toISOString(), projectId);
    return mapTaste(taste);
  }

  async importAssetPaths(projectId: string, filePaths: string[]): Promise<ProjectAsset[]> {
    const project = this.getProjectRecord(projectId);
    const importedAssetIds = await this.insertAssetFileRecords(project, filePaths);
    const tx = this.db.transaction(() => {
      if (importedAssetIds.length > 0) this.touchProject(projectId);
    });
    tx();
    return this.listAssets(projectId);
  }

  async importAgentImageAttachmentPaths(projectId: string, filePaths: string[]): Promise<ProjectAsset[]> {
    const project = this.getProjectRecord(projectId);
    const imagePaths = filePaths.filter((filePath) => getAssetKind(filePath) === "image");
    const importedAssetIds = await this.insertAssetFileRecords(project, imagePaths);
    const tx = this.db.transaction(() => {
      if (importedAssetIds.length > 0) this.touchProject(projectId);
    });
    tx();
    if (importedAssetIds.length === 0) return [];
    const allAssets = this.listAssets(projectId);
    const assetById = new Map(allAssets.map((asset) => [asset.id, asset]));
    return importedAssetIds.map((assetId) => assetById.get(assetId)).filter((asset): asset is ProjectAsset => Boolean(asset));
  }

  importAgentImageAttachmentBuffer(projectId: string, fileName: string, buffer: Uint8Array): ProjectAsset[] {
    const project = this.getProjectRecord(projectId);
    if (buffer.byteLength === 0) return [];

    const assetsDir = join(project.local_path, "assets");
    mkdirSync(assetsDir, { recursive: true });
    const now = new Date().toISOString();
    const contentHash = hashBuffer(buffer);
    let importedAssetId = this.findAssetIdByContentHash(projectId, contentHash);

    if (!importedAssetId) {
      const safeFileName = uniqueAssetFileName(assetsDir, fileName || `clipboard-${Date.now()}.png`);
      const destination = join(assetsDir, safeFileName);
      importedAssetId = randomUUID();
      const insert = this.db.prepare(
        `INSERT INTO assets (id, project_id, file_name, kind, file_size, local_path, indexed_path, linked_shot_id, content_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const tx = this.db.transaction(() => {
        writeFileSync(destination, Buffer.from(buffer));
        insert.run(importedAssetId, projectId, safeFileName, "image", buffer.byteLength, destination, relative(project.local_path, destination), null, contentHash, now);
        this.touchProject(projectId);
      });
      tx();
    } else {
      this.touchProject(projectId);
    }

    const importedAsset = this.listAssets(projectId).find((asset) => asset.id === importedAssetId && asset.kind === "image");
    return importedAsset ? [importedAsset] : [];
  }

  renameAsset(projectId: string, assetId: string, nextFileName: string): ShotMediaUpdateResult {
    const project = this.getProjectRecord(projectId);
    const asset = this.getAssetRecord(projectId, assetId);
    if (!asset) return this.getShotMediaUpdate(projectId);

    const cleanFileName = normalizeAssetFileName(nextFileName, asset.file_name);
    if (cleanFileName === asset.file_name) return this.getShotMediaUpdate(projectId);

    const assetsDir = join(project.local_path, "assets");
    const targetPath = join(assetsDir, uniqueAssetFileNameExcluding(assetsDir, cleanFileName, asset.local_path));
    if (!isPathInside(project.local_path, asset.local_path) || !isPathInside(project.local_path, targetPath)) return this.getShotMediaUpdate(projectId);

    const fileSize = existsSync(asset.local_path) ? statSync(asset.local_path).size : asset.file_size;
    const tx = this.db.transaction(() => {
      mkdirSync(assetsDir, { recursive: true });
      if (existsSync(asset.local_path)) renameSync(asset.local_path, targetPath);
      this.db
        .prepare("UPDATE assets SET file_name = ?, kind = ?, file_size = ?, local_path = ?, indexed_path = ? WHERE id = ? AND project_id = ?")
        .run(basename(targetPath), getAssetKind(targetPath), fileSize, targetPath, relative(project.local_path, targetPath), assetId, projectId);
      this.touchProject(projectId);
    });
    tx();
    return this.getShotMediaUpdate(projectId);
  }

  async replaceAssetPath(projectId: string, assetId: string, sourcePath: string): Promise<ShotMediaUpdateResult> {
    const project = this.getProjectRecord(projectId);
    const asset = this.getAssetRecord(projectId, assetId);
    if (!asset || !sourcePath || !existsSync(sourcePath)) return this.getShotMediaUpdate(projectId);
    const stats = statSync(sourcePath);
    if (!stats.isFile()) return this.getShotMediaUpdate(projectId);

    const assetsDir = join(project.local_path, "assets");
    const nextFileName = uniqueAssetFileNameExcluding(assetsDir, basename(sourcePath), asset.local_path);
    const destination = join(assetsDir, nextFileName);
    const nextKind = getAssetKind(nextFileName);
    if (!isPathInside(project.local_path, asset.local_path) || !isPathInside(project.local_path, destination)) return this.getShotMediaUpdate(projectId);
    const poster =
      nextKind === "video" ? await prepareVideoAssetPoster(project, assetsDir, nextFileName, sourcePath, asset.poster_path) : { path: null, indexedPath: null };

    const tx = this.db.transaction(() => {
      mkdirSync(assetsDir, { recursive: true });
      if (resolve(sourcePath) !== resolve(destination)) copyFileSync(sourcePath, destination);
      if (asset.local_path !== destination && existsSync(asset.local_path)) rmSync(asset.local_path, { force: true });
      if (asset.poster_path && asset.poster_path !== poster.path) removeProjectFile(project, asset.poster_path);
      this.db
        .prepare(
          "UPDATE assets SET file_name = ?, kind = ?, file_size = ?, local_path = ?, indexed_path = ?, poster_path = ?, poster_indexed_path = ?, content_hash = ? WHERE id = ? AND project_id = ?"
        )
        .run(nextFileName, nextKind, stats.size, destination, relative(project.local_path, destination), poster.path, poster.indexedPath, hashFile(destination), assetId, projectId);
      if (!isShotMediaKind(nextKind)) this.removeAssetIdsFromShotMedia(projectId, [assetId], new Date().toISOString());
      this.touchProject(projectId);
    });
    tx();
    return this.getShotMediaUpdate(projectId);
  }

  getAssetFilePath(projectId: string, assetId: string): string | null {
    const asset = this.getAssetRecord(projectId, assetId);
    if (!asset) return null;
    return asset.local_path;
  }

  deleteAssets(projectId: string, assetIds: string[]): ShotMediaUpdateResult {
    const project = this.getProjectRecord(projectId);
    const targetIds = normalizeIdList(assetIds);
    if (targetIds.length === 0) return this.getShotMediaUpdate(projectId);
    const rows = this.db
      .prepare(`SELECT * FROM assets WHERE project_id = ? AND id IN (${targetIds.map(() => "?").join(",")})`)
      .all(projectId, ...targetIds) as AssetRecord[];
    if (rows.length === 0) return this.getShotMediaUpdate(projectId);

    const now = new Date().toISOString();
    const deleteAsset = this.db.prepare("DELETE FROM assets WHERE id = ? AND project_id = ?");
    const tx = this.db.transaction(() => {
      this.removeAssetIdsFromShotMedia(projectId, rows.map((row) => row.id), now);
      rows.forEach((row) => {
        if (isPathInside(project.local_path, row.local_path) && existsSync(row.local_path)) rmSync(row.local_path, { force: true });
        removeProjectFile(project, row.poster_path);
        deleteAsset.run(row.id, projectId);
      });
      this.touchProject(projectId);
    });
    tx();
    return this.getShotMediaUpdate(projectId);
  }

  listTemplates(interfaceLanguage?: InterfaceLanguage): ProjectTemplate[] {
    this.ensureDefaultSkills();
    const systemTemplates = buildAllSystemProjectTemplates(interfaceLanguage, (targetSkillId) => {
      const skill = this.getSkillRecordOrDefault(targetSkillId);
      return { id: skill.id, name: skill.name };
    });
    const rows = this.db.prepare("SELECT * FROM templates ORDER BY updated_at DESC, created_at DESC").all() as TemplateRecord[];
    return [
      ...systemTemplates,
      ...rows
        .filter((row) => !isSystemTemplateId(row.id))
        .map((row) => mapTemplate(row, this.getTemplateSkillName(row.storyboard_skill_id, interfaceLanguage), interfaceLanguage))
    ];
  }

  createTemplate(input: CreateProjectTemplateInput): ProjectTemplate {
    const name = input.name.trim();
    if (!name) throw new Error("模板名称不能为空。");
    if (!Array.isArray(input.columns) || input.columns.length === 0) throw new Error("模板至少需要保留一组分镜表列。");
    this.assertUniqueUserTemplateName(name);
    const skill = this.getSkillRecord(input.storyboardSkillId);
    const columns = ensureStoryboardPromptColumns(input.columns, input.interfaceLanguage);
    const now = new Date().toISOString();
    const row: TemplateRecord = {
      id: createId(name),
      name,
      description: input.description.trim(),
      scope: "user",
      columns_json: JSON.stringify(columns),
      storyboard_skill_id: skill.id,
      created_at: now,
      updated_at: now
    };
    this.db
      .prepare(
        `INSERT INTO templates (id, name, description, scope, columns_json, storyboard_skill_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(row.id, row.name, row.description, row.scope, row.columns_json, row.storyboard_skill_id, row.created_at, row.updated_at);
    return mapTemplate(row, skill.name, input.interfaceLanguage);
  }

  updateTemplate(input: UpdateProjectTemplateInput): ProjectTemplate {
    if (isSystemTemplateId(input.id)) throw new Error("内置分镜模板不允许修改。");
    const existing = this.db.prepare("SELECT * FROM templates WHERE id = ?").get(input.id) as TemplateRecord | undefined;
    if (!existing) throw new Error("没有找到要编辑的分镜模板。");
    if (existing.scope !== "user") throw new Error("内置分镜模板不允许修改。");

    const name = input.name.trim();
    if (!name) throw new Error("模板名称不能为空。");
    if (!Array.isArray(input.columns) || input.columns.length === 0) throw new Error("模板至少需要保留一组分镜表列。");
    this.assertUniqueUserTemplateName(name, input.id);

    const skill = this.getSkillRecord(input.storyboardSkillId);
    const columns = ensureStoryboardPromptColumns(input.columns, input.interfaceLanguage);
    const description = input.description.trim();
    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE templates SET name = ?, description = ?, columns_json = ?, storyboard_skill_id = ?, updated_at = ? WHERE id = ?")
      .run(name, description, JSON.stringify(columns), skill.id, now, input.id);

    return mapTemplate(
      {
        ...existing,
        name,
        description,
        columns_json: JSON.stringify(columns),
        storyboard_skill_id: skill.id,
        updated_at: now
      },
      skill.name,
      input.interfaceLanguage
    );
  }

  deleteTemplate(templateId: string): ProjectTemplate[] {
    if (isSystemTemplateId(templateId)) throw new Error("内置分镜模板不允许删除。");
    const existing = this.db.prepare("SELECT * FROM templates WHERE id = ?").get(templateId) as TemplateRecord | undefined;
    if (!existing) throw new Error("没有找到要删除的分镜模板。");
    if (existing.scope !== "user") throw new Error("内置分镜模板不允许删除。");

    const remove = this.db.transaction(() => {
      this.db.prepare("UPDATE projects SET template_id = ? WHERE template_id = ?").run(defaultTemplateId, templateId);
      this.db.prepare("DELETE FROM templates WHERE id = ?").run(templateId);
    });
    remove();
    return this.listTemplates();
  }

  listTastes(): Taste[] {
    this.ensureDefaultTastes();
    const rows = this.db.prepare("SELECT * FROM tastes ORDER BY locked DESC, created_at ASC, updated_at DESC").all() as TasteRecord[];
    return rows.sort(compareTasteRecords).map(mapTaste);
  }

  createTaste(input: CreateTasteInput & { id?: string }): Taste {
    this.ensureDefaultTastes();
    const name = input.name.trim();
    const content = input.content.trim();
    if (!name) throw new Error("风格名称不能为空。");
    if (!content) throw new Error("风格规则内容不能为空。");

    const now = new Date().toISOString();
    const preview: TastePreview = {
      background: input.preview?.background?.trim() || "#F8FAFC",
      foreground: input.preview?.foreground?.trim() || "#0F172A",
      accent: input.preview?.accent?.trim() || "#EFB72E"
    };
    const requestedId = input.id?.trim();
    const existing = requestedId
      ? (this.db.prepare("SELECT * FROM tastes WHERE id = ?").get(requestedId) as TasteRecord | undefined)
      : undefined;

    if (existing && !existing.locked) {
      const sourceUrl = input.sourceUrl?.trim() ?? existing.source_url ?? "user://custom-taste";
      const previewJson = JSON.stringify(preview);
      this.db
        .prepare("UPDATE tastes SET name = ?, description = ?, content = ?, source_url = ?, preview_json = ?, updated_at = ? WHERE id = ?")
        .run(name, input.description.trim(), content, sourceUrl, previewJson, now, existing.id);
      return mapTaste({
        ...existing,
        name,
        description: input.description.trim(),
        content,
        source_url: sourceUrl,
        preview_json: previewJson,
        updated_at: now
      });
    }

    const row: TasteRecord = {
      id: requestedId && !existing ? requestedId : `taste-${createId(name)}`,
      name,
      description: input.description.trim(),
      content,
      source_url: input.sourceUrl?.trim() || "user://custom-taste",
      preview_json: JSON.stringify(preview),
      scope: "user",
      locked: 0,
      created_at: now,
      updated_at: now
    };
    this.db
      .prepare("INSERT INTO tastes (id, name, description, content, source_url, preview_json, scope, locked, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(row.id, row.name, row.description, row.content, row.source_url, row.preview_json, row.scope, row.locked, row.created_at, row.updated_at);
    return mapTaste(row);
  }

  updateTaste(input: UpdateTasteInput): Taste {
    this.ensureDefaultTastes();
    const existing = this.db.prepare("SELECT * FROM tastes WHERE id = ?").get(input.id) as TasteRecord | undefined;
    if (!existing) throw new Error(`未找到风格：${input.id}`);
    if (existing.locked) throw new Error("系统自适应默认风格不可修改。");

    const name = input.name.trim();
    const content = input.content.trim();
    if (!name) throw new Error("风格名称不能为空。");
    if (!content) throw new Error("风格规则内容不能为空。");

    const currentPreview = parseTastePreview(existing.preview_json);
    const preview: TastePreview = {
      background: input.preview?.background?.trim() || currentPreview.background,
      foreground: input.preview?.foreground?.trim() || currentPreview.foreground,
      accent: input.preview?.accent?.trim() || currentPreview.accent
    };
    const sourceUrl = input.sourceUrl?.trim() ?? existing.source_url;
    const previewJson = JSON.stringify(preview);
    const now = new Date().toISOString();

    this.db
      .prepare("UPDATE tastes SET name = ?, description = ?, content = ?, source_url = ?, preview_json = ?, updated_at = ? WHERE id = ?")
      .run(name, input.description.trim(), content, sourceUrl, previewJson, now, existing.id);

    return mapTaste({
      ...existing,
      name,
      description: input.description.trim(),
      content,
      source_url: sourceUrl,
      preview_json: previewJson,
      updated_at: now
    });
  }

  deleteTaste(tasteId: string): Taste[] {
    this.ensureDefaultTastes();
    const existing = this.db.prepare("SELECT * FROM tastes WHERE id = ?").get(tasteId) as TasteRecord | undefined;
    if (!existing) return this.listTastes();
    if (existing.locked || existing.id === defaultTasteId) {
      throw new Error("系统自适应默认风格不可删除。");
    }
    const tx = this.db.transaction(() => {
      this.db.prepare("UPDATE projects SET taste_id = ? WHERE taste_id = ?").run(defaultTasteId, existing.id);
      this.db.prepare("DELETE FROM tastes WHERE id = ?").run(existing.id);
    });
    tx();
    return this.listTastes();
  }

  upsertExternalSkill(input: {
    id: string;
    name: string;
    description: string;
    content: string;
    iconId?: string;
    gradientId?: string;
  }): Skill {
    this.ensureDefaultSkills();
    const name = input.name.trim();
    const content = input.content.trim();
    if (!name) throw new Error("SKILL 名称不能为空。");
    if (!content) throw new Error("SKILL 规则不能为空。");

    const now = new Date().toISOString();
    const existing = this.db.prepare("SELECT * FROM skills WHERE id = ?").get(input.id) as SkillRecord | undefined;
    if (existing && !existing.locked) {
      const iconId = normalizeSkillVisualId(input.iconId, existing.icon_id || defaultSkillIconId);
      const gradientId = normalizeSkillVisualId(input.gradientId, existing.gradient_id || defaultSkillGradientId);
      this.db
        .prepare("UPDATE skills SET name = ?, description = ?, content = ?, icon_id = ?, gradient_id = ?, updated_at = ? WHERE id = ?")
        .run(name, input.description.trim(), content, iconId, gradientId, now, existing.id);
      return mapSkill({
        ...existing,
        name,
        description: input.description.trim(),
        content,
        icon_id: iconId,
        gradient_id: gradientId,
        updated_at: now
      });
    }

    const row: SkillRecord = {
      id: existing ? createId(name) : input.id,
      name,
      description: input.description.trim(),
      content,
      icon_id: normalizeSkillVisualId(input.iconId, defaultSkillIconId),
      gradient_id: normalizeSkillVisualId(input.gradientId, defaultSkillGradientId),
      scope: "user",
      locked: 0,
      created_at: now,
      updated_at: now
    };
    this.db
      .prepare("INSERT INTO skills (id, name, description, content, icon_id, gradient_id, scope, locked, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(row.id, row.name, row.description, row.content, row.icon_id, row.gradient_id, row.scope, row.locked, row.created_at, row.updated_at);
    return mapSkill(row);
  }

  listSkills(interfaceLanguage?: InterfaceLanguage): Skill[] {
    this.ensureDefaultSkills();
    const defaultStoryboardSkillId = this.getDefaultStoryboardSkillId(interfaceLanguage);
    const rows = this.db.prepare("SELECT * FROM skills ORDER BY locked DESC, updated_at DESC, created_at DESC").all() as SkillRecord[];
    return rows
      .filter((row) => !isSystemStoryboardSkillId(row.id) || row.id === defaultStoryboardSkillId || getLocalizedSystemStoryboardSkillId(row.id, interfaceLanguage) === row.id)
      .sort((a, b) => {
        if (a.locked !== b.locked) return b.locked - a.locked;
        if (a.locked) {
          return getSystemStoryboardSkillSortIndex(a.id) - getSystemStoryboardSkillSortIndex(b.id);
        }
        return 0;
      })
      .map(mapSkill);
  }

  createSkill(input: CreateSkillInput): Skill {
    const name = input.name.trim();
    const content = input.content.trim();
    if (!name) throw new Error("SKILL 名称不能为空。");
    if (!content) throw new Error("SKILL 规则不能为空。");

    const now = new Date().toISOString();
    const row: SkillRecord = {
      id: createId(name),
      name,
      description: input.description.trim(),
      content,
      icon_id: normalizeSkillVisualId(input.iconId, defaultSkillIconId),
      gradient_id: normalizeSkillVisualId(input.gradientId, defaultSkillGradientId),
      scope: "user",
      locked: 0,
      created_at: now,
      updated_at: now
    };
    this.db
      .prepare("INSERT INTO skills (id, name, description, content, icon_id, gradient_id, scope, locked, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(row.id, row.name, row.description, row.content, row.icon_id, row.gradient_id, row.scope, row.locked, row.created_at, row.updated_at);
    return mapSkill(row);
  }

  updateSkill(input: UpdateSkillInput): Skill {
    const existing = this.getSkillRecord(input.id);
    if (existing.locked) throw new Error("系统默认 SKILL 不允许修改。");
    const name = input.name.trim();
    const content = input.content.trim();
    if (!name) throw new Error("SKILL 名称不能为空。");
    if (!content) throw new Error("SKILL 规则不能为空。");

    const now = new Date().toISOString();
    const iconId = normalizeSkillVisualId(input.iconId, existing.icon_id || defaultSkillIconId);
    const gradientId = normalizeSkillVisualId(input.gradientId, existing.gradient_id || defaultSkillGradientId);
    this.db
      .prepare("UPDATE skills SET name = ?, description = ?, content = ?, icon_id = ?, gradient_id = ?, updated_at = ? WHERE id = ?")
      .run(name, input.description.trim(), content, iconId, gradientId, now, input.id);
    return mapSkill({
      ...existing,
      name,
      description: input.description.trim(),
      content,
      icon_id: iconId,
      gradient_id: gradientId,
      updated_at: now
    });
  }

  deleteSkill(skillId: string): Skill[] {
    const existing = this.getSkillRecord(skillId);
    if (existing.locked || isSystemStoryboardSkillId(existing.id)) throw new Error("系统默认拆分分镜 SKILL 不允许删除。");
    this.db.prepare("DELETE FROM skills WHERE id = ?").run(skillId);
    return this.listSkills();
  }

  resolveAssetPreviewPath(assetId: string): string | null {
    const row = this.db.prepare("SELECT local_path FROM assets WHERE id = ?").get(assetId) as Pick<AssetRecord, "local_path"> | undefined;
    if (!row || !row.local_path || !existsSync(row.local_path)) return null;
    if (!isPathInside(this.projectRoot, row.local_path)) return null;
    const stats = statSync(row.local_path);
    return stats.isFile() ? row.local_path : null;
  }

  resolveAssetPosterPath(assetId: string): string | null {
    const row = this.db.prepare("SELECT poster_path FROM assets WHERE id = ?").get(assetId) as Pick<AssetRecord, "poster_path"> | undefined;
    if (!row || !row.poster_path || !existsSync(row.poster_path)) return null;
    if (!isPathInside(this.projectRoot, row.poster_path)) return null;
    const stats = statSync(row.poster_path);
    return stats.isFile() ? row.poster_path : null;
  }

  async resolveAssetFirstFramePath(assetId: string): Promise<string | null> {
    const row = this.db
      .prepare("SELECT id, project_id, kind, local_path, content_hash FROM assets WHERE id = ?")
      .get(assetId) as Pick<AssetRecord, "id" | "project_id" | "kind" | "local_path" | "content_hash"> | undefined;
    if (!row || !row.local_path || isHttpUrl(row.local_path) || !existsSync(row.local_path)) return null;
    if (!isPathInside(this.projectRoot, row.local_path)) return null;
    if (row.kind !== "video") return this.resolveAssetPreviewPath(assetId);

    const coversDir = join(dirname(row.local_path), ".covers");
    mkdirSync(coversDir, { recursive: true });
    const versionHash = (row.content_hash || "v1").replace(/[^a-zA-Z0-9_-]/gu, "").slice(0, 12) || "v1";
    const coverPath = join(coversDir, `${row.id}-${versionHash}-smart-cover-v2.jpg`);
    if (existsSync(coverPath) && statSync(coverPath).size > 0) {
      return coverPath;
    }

    const inflight = this.firstFrameExtractions.get(coverPath);
    if (inflight) return inflight;

    const extractSmartProjectCover = async (): Promise<string | null> => {
      const primary = await extractVideoBestCoverFrame(row.local_path, coverPath);
      // If the primary clip already has substantive visual content (score >= 9), use it directly.
      if (primary.posterPath && primary.score >= 9.0) {
        return primary.posterPath;
      }

      // Otherwise inspect up to 4 subsequent video clips in the same project to rescue projects
      // whose opening clip is a pure white/black intro wipe or empty wireframe.
      const siblings = this.db
        .prepare(
          "SELECT id, local_path, content_hash FROM assets WHERE project_id = ? AND kind = 'video' AND id <> ? ORDER BY created_at ASC LIMIT 4"
        )
        .all(row.project_id, row.id) as Array<Pick<AssetRecord, "id" | "local_path" | "content_hash">>;

      let bestScore = primary.score;
      let bestSourcePath: string | null = null;
      const tempCandidates: string[] = [];

      try {
        for (const sib of siblings) {
          if (!sib.local_path || isHttpUrl(sib.local_path) || !existsSync(sib.local_path)) continue;
          if (!isPathInside(this.projectRoot, sib.local_path)) continue;
          const sibTemp = join(coversDir, `${row.id}-sib-${sib.id.slice(0, 8)}.tmp.jpg`);
          tempCandidates.push(sibTemp);
          const candidate = await extractVideoBestCoverFrame(sib.local_path, sibTemp).catch(() => null);
          if (candidate?.posterPath && candidate.score > bestScore + 2.5) {
            bestScore = candidate.score;
            bestSourcePath = candidate.posterPath;
          }
          if (bestScore >= 22.0) break;
        }

        if (bestSourcePath && existsSync(bestSourcePath)) {
          copyFileSync(bestSourcePath, coverPath);
          return coverPath;
        }
      } finally {
        for (const tmp of tempCandidates) {
          rmSync(tmp, { force: true });
        }
      }

      return primary.posterPath;
    };

    const job = extractSmartProjectCover()
      .catch(() => null)
      .finally(() => {
        this.firstFrameExtractions.delete(coverPath);
      });
    this.firstFrameExtractions.set(coverPath, job);
    return job;
  }

  createAgentConversation(projectId: string): AgentConversationDetail {
    this.getProjectRecord(projectId);
    const now = new Date().toISOString();
    const id = randomUUID();
    this.db
      .prepare("INSERT INTO agent_conversations (id, project_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, projectId, defaultAgentConversationTitle, now, now);
    this.touchProject(projectId);
    return this.getAgentConversation(projectId, id);
  }

  getAgentConversation(projectId: string, conversationId: string): AgentConversationDetail {
    const conversation = this.ensureProjectAgentConversation(projectId, conversationId);
    return {
      conversations: this.listAgentConversations(projectId),
      activeConversationId: conversation.id,
      messages: this.listAgentMessages(projectId, conversation.id)
    };
  }

  markAgentConversationCompletionSeen(projectId: string, conversationId: string): AgentConversationDetail {
    this.ensureProjectAgentConversation(projectId, conversationId);
    this.db
      .prepare("UPDATE agent_conversations SET unread_completion = 0 WHERE id = ? AND project_id = ?")
      .run(conversationId, projectId);
    return this.getAgentConversation(projectId, conversationId);
  }

  shouldGenerateAgentConversationTitle(projectId: string, conversationId: string): boolean {
    const conversation = this.ensureProjectAgentConversation(projectId, conversationId);
    if (!isDefaultAgentConversationTitle(conversation.title)) return false;
    const row = this.db
      .prepare("SELECT COUNT(*) AS count FROM agent_messages WHERE project_id = ? AND conversation_id = ? AND role = 'user'")
      .get(projectId, conversationId) as { count: number } | undefined;
    return Number(row?.count ?? 0) > 0;
  }

  renameAgentConversation(projectId: string, conversationId: string, title: string): AgentConversationDetail {
    this.ensureProjectAgentConversation(projectId, conversationId);
    this.db
      .prepare("UPDATE agent_conversations SET title = ? WHERE id = ? AND project_id = ?")
      .run(createAgentConversationTitle(title), conversationId, projectId);
    return this.getAgentConversation(projectId, conversationId);
  }

  appendAgentMessage(
    projectId: string,
    role: "assistant" | "user",
    content: string,
    options: {
      conversationId?: string;
      attachments?: AgentMessageAttachment[];
      events?: AgentEvent[];
      runStatus?: AgentRunStatus;
      clientRunId?: string;
      agentCliId?: AgentCliId;
      operationConfirmation?: AgentOperationConfirmation;
    } = {}
  ): AgentMessage {
    const conversation = options.conversationId ? this.ensureProjectAgentConversation(projectId, options.conversationId) : this.ensureActiveAgentConversation(projectId);
    const attachments = sanitizeAgentMessageAttachments(options.attachments);
    const message: AgentMessage = {
      id: randomUUID(),
      conversationId: conversation.id,
      role,
      content,
      createdAt: new Date().toISOString(),
      attachments,
      events: options.events ?? [],
      runStatus: options.runStatus,
      clientRunId: options.clientRunId,
      agentCliId: options.agentCliId,
      operationConfirmation: options.operationConfirmation
    };
    this.db
      .prepare(
        "INSERT INTO agent_messages (id, project_id, conversation_id, role, content, attachments_json, events_json, run_status, client_run_id, agent_cli_id, operation_confirmation_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        message.id,
        projectId,
        conversation.id,
        role,
        content,
        JSON.stringify(attachments),
        JSON.stringify(message.events ?? []),
        options.runStatus ?? null,
        options.clientRunId ?? null,
        options.agentCliId ?? null,
        options.operationConfirmation ? JSON.stringify(options.operationConfirmation) : null,
        message.createdAt
      );
    this.touchAgentConversation(projectId, conversation.id);
    this.touchProject(projectId);
    return message;
  }

  updateAgentMessage(projectId: string, messageId: string, input: { content?: string; events?: AgentEvent[]; runStatus?: AgentRunStatus; operationConfirmation?: AgentOperationConfirmation | null }): AgentMessage | null {
    const existing = this.db.prepare("SELECT * FROM agent_messages WHERE id = ? AND project_id = ?").get(messageId, projectId) as AgentMessageRecord | undefined;
    if (!existing) return null;
    const nextContent = input.content ?? existing.content;
    const nextEvents = input.events ?? parseAgentEvents(existing.events_json);
    const nextRunStatus = input.runStatus ?? existing.run_status ?? null;
    const nextOperationConfirmation =
      input.operationConfirmation === undefined ? parseAgentOperationConfirmation(existing.operation_confirmation_json) : input.operationConfirmation ?? undefined;
    this.db
      .prepare("UPDATE agent_messages SET content = ?, events_json = ?, run_status = ?, operation_confirmation_json = ? WHERE id = ? AND project_id = ?")
      .run(nextContent, JSON.stringify(nextEvents), nextRunStatus, nextOperationConfirmation ? JSON.stringify(nextOperationConfirmation) : null, messageId, projectId);
    if (existing.conversation_id) {
      if (
        existing.role === "assistant" &&
        !isUnreadAgentCompletionStatus(existing.run_status) &&
        isUnreadAgentCompletionStatus(nextRunStatus)
      ) {
        this.db
          .prepare("UPDATE agent_conversations SET unread_completion = 1 WHERE id = ? AND project_id = ?")
          .run(existing.conversation_id, projectId);
      }
      this.touchAgentConversation(projectId, existing.conversation_id);
    }
    this.touchProject(projectId);
    return {
      id: messageId,
      conversationId: existing.conversation_id ?? undefined,
      role: existing.role,
      content: nextContent,
      createdAt: existing.created_at,
      attachments: parseAgentMessageAttachments(existing.attachments_json),
      events: nextEvents,
      runStatus: nextRunStatus ?? undefined,
      clientRunId: existing.client_run_id ?? undefined,
      agentCliId: parseAgentCliId(existing.agent_cli_id) ?? inferAgentCliIdFromAgentMessage(nextContent, nextEvents),
      operationConfirmation: nextOperationConfirmation
    };
  }

  updateAgentMessageOperationConfirmation(projectId: string, clientRunId: string, confirmation: AgentOperationConfirmation): AgentMessage | null {
    const existing = this.db
      .prepare("SELECT * FROM agent_messages WHERE project_id = ? AND client_run_id = ? AND role = 'assistant' ORDER BY created_at DESC LIMIT 1")
      .get(projectId, clientRunId) as AgentMessageRecord | undefined;
    if (!existing) return null;
    return this.updateAgentMessage(projectId, existing.id, { operationConfirmation: confirmation });
  }

  markInterruptedStoryboardParseRuns(projectId: string, activeClientRunId?: string): number {
    const rows = this.db
      .prepare("SELECT * FROM agent_messages WHERE project_id = ? AND role = 'assistant' AND run_status IN ('queued', 'running')")
      .all(projectId) as AgentMessageRecord[];
    let interruptedCount = 0;

    for (const row of rows) {
      if (row.client_run_id && row.client_run_id === activeClientRunId) continue;
      const events = parseAgentEvents(row.events_json);
      const isStoryboardParseRun = events.some((event) => event.kind === "status" && event.label === "storyboard_parse");
      if (!isStoryboardParseRun) continue;
      const hasTerminalEvent = events.some(
        (event) =>
          event.kind === "error" ||
          (event.kind === "status" && (event.label === "succeeded" || event.label === "failed" || event.label === "canceled" || event.label === "error"))
      );
      if (hasTerminalEvent) continue;

      this.updateAgentMessage(projectId, row.id, {
        events: [...events, { kind: "status", label: "canceled", detail: "上次分镜生成任务已因 MkBoard 退出而中断。" }],
        runStatus: "canceled"
      });
      interruptedCount += 1;
    }

    return interruptedCount;
  }

  replaceRows(projectId: string, rows: StoryboardRow[]): void {
    const now = new Date().toISOString();
    const insert = this.db.prepare(
      `INSERT INTO shots (
        id, project_id, position, shot_number, image_asset_id, image_asset_ids_json, scene, duration, content, note, custom_values_json, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const tx = this.db.transaction(() => {
      this.db.prepare("DELETE FROM shots WHERE project_id = ?").run(projectId);
      rows.forEach((row, index) => {
        const imageAssetIds = this.filterProjectMediaAssetIds(projectId, row.imageAssetIds ?? (row.imageAssetId ? [row.imageAssetId] : []));
        insert.run(
          row.id || randomUUID(),
          projectId,
          index + 1,
          String(index + 1),
          imageAssetIds[0] ?? null,
          JSON.stringify(imageAssetIds),
          row.scene || "",
          row.duration || "0",
          row.content || "",
          row.note || "",
          JSON.stringify(row.customValues ?? {}),
          now,
          now
        );
      });
      this.touchProject(projectId);
    });
    tx();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL DEFAULT 'user',
        name TEXT NOT NULL,
        icon TEXT NOT NULL,
        template_id TEXT NOT NULL,
        taste_id TEXT,
        local_path TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        archived_at TEXT,
        deleted_at TEXT
      );

      CREATE TABLE IF NOT EXISTS pending_cloud_project_deletions (
        cloud_project_id TEXT PRIMARY KEY,
        local_project_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_attempted_at TEXT,
        last_error TEXT
      );

      CREATE TABLE IF NOT EXISTS scripts (
        project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
        html TEXT NOT NULL,
        plain_text TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS storyboard_settings (
        project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
        image_ratio TEXT NOT NULL,
        columns_json TEXT NOT NULL,
        storyboard_skill_id TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS shots (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        shot_number TEXT NOT NULL,
        image_asset_id TEXT,
        image_asset_ids_json TEXT NOT NULL DEFAULT '[]',
        scene TEXT NOT NULL,
        duration TEXT NOT NULL,
        content TEXT NOT NULL,
        note TEXT NOT NULL,
        custom_values_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS storyboard_image_delivery_recoveries (
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        task_id TEXT NOT NULL,
        row_id TEXT NOT NULL REFERENCES shots(id) ON DELETE CASCADE,
        provider_task_id TEXT,
        error_message TEXT,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (project_id, task_id)
      );

      CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        file_name TEXT NOT NULL,
        kind TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        local_path TEXT NOT NULL,
        indexed_path TEXT NOT NULL,
        poster_path TEXT,
        poster_indexed_path TEXT,
        linked_shot_id TEXT,
        content_hash TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS agent_conversations (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        unread_completion INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS agent_messages (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        conversation_id TEXT REFERENCES agent_conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        attachments_json TEXT NOT NULL DEFAULT '[]',
        events_json TEXT NOT NULL DEFAULT '[]',
        run_status TEXT,
        client_run_id TEXT,
        agent_cli_id TEXT,
        operation_confirmation_json TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS skills (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        content TEXT NOT NULL,
        icon_id TEXT NOT NULL DEFAULT 'file-text',
        gradient_id TEXT NOT NULL DEFAULT 'mist-slate',
        scope TEXT NOT NULL DEFAULT 'user',
        locked INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tastes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        content TEXT NOT NULL,
        source_url TEXT NOT NULL DEFAULT '',
        preview_json TEXT NOT NULL DEFAULT '{}',
        scope TEXT NOT NULL DEFAULT 'system',
        locked INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        scope TEXT NOT NULL DEFAULT 'user',
        columns_json TEXT NOT NULL,
        storyboard_skill_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS storyboard_video_tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        row_id TEXT NOT NULL,
        method TEXT NOT NULL,
        status TEXT NOT NULL,
        prompt TEXT NOT NULL DEFAULT '',
        aspect_ratio TEXT,
        duration_sec INTEGER,
        provider TEXT,
        provider_task_id TEXT,
        work_dir TEXT,
        output_dir TEXT,
        output_path TEXT,
        asset_id TEXT,
        file_name TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        failed_at TEXT,
        cancelled_at TEXT
      );

      CREATE TABLE IF NOT EXISTS onboarding_state (
        id TEXT PRIMARY KEY,
        app_version TEXT NOT NULL DEFAULT '',
        content_version TEXT NOT NULL,
        tutorial_project_id TEXT NOT NULL,
        current_step TEXT NOT NULL,
        completed_step_ids_json TEXT NOT NULL DEFAULT '[]',
        dismissed_step_ids_json TEXT NOT NULL DEFAULT '[]',
        started_at TEXT,
        completed_at TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_shots_project_position ON shots(project_id, position);
      CREATE INDEX IF NOT EXISTS idx_assets_project_created ON assets(project_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_agent_conversations_project_updated ON agent_conversations(project_id, updated_at);
      CREATE INDEX IF NOT EXISTS idx_agent_messages_project_created ON agent_messages(project_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_skills_scope_updated ON skills(scope, updated_at);
      CREATE INDEX IF NOT EXISTS idx_tastes_scope_updated ON tastes(scope, updated_at);
      CREATE INDEX IF NOT EXISTS idx_templates_scope_updated ON templates(scope, updated_at);
      CREATE INDEX IF NOT EXISTS idx_storyboard_video_tasks_project_status ON storyboard_video_tasks(project_id, status, updated_at);
      CREATE INDEX IF NOT EXISTS idx_storyboard_video_tasks_project_row_created ON storyboard_video_tasks(project_id, row_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_storyboard_video_tasks_provider ON storyboard_video_tasks(provider, provider_task_id);
    `);
    this.ensureProjectColumns();
    this.ensureStoryboardSettingsColumns();
    this.ensureShotMediaColumns();
    this.ensureAssetPosterColumns();
    this.ensureAssetContentHashColumn();
    this.ensureStoryboardVideoTaskColumns();
    this.db.prepare("CREATE INDEX IF NOT EXISTS idx_projects_deleted_updated ON projects(deleted_at, updated_at)").run();
    this.db.prepare("CREATE INDEX IF NOT EXISTS idx_projects_archived_updated ON projects(deleted_at, archived_at, updated_at)").run();
    this.db.prepare("CREATE INDEX IF NOT EXISTS idx_assets_project_content_hash ON assets(project_id, content_hash)").run();
    this.ensureAgentConversationColumns();
    this.ensureAgentMessageColumns();
    this.ensureSkillColumns();
    this.ensureDefaultSkills();
    this.ensureDefaultTastes();
    this.ensureProjectTasteAssignments();
    this.ensureDefaultProjectTemplateIds();
    this.ensureStoryboardPromptColumnSettings();
  }

  private ensureProjectColumns(): void {
    const columns = this.db.prepare("PRAGMA table_info(projects)").all() as Array<{ name: string }>;
    const names = new Set(columns.map((column) => column.name));
    if (!names.has("kind")) {
      this.db.prepare("ALTER TABLE projects ADD COLUMN kind TEXT NOT NULL DEFAULT 'user'").run();
    }
    if (!names.has("deleted_at")) {
      this.db.prepare("ALTER TABLE projects ADD COLUMN deleted_at TEXT").run();
    }
    if (!names.has("cloud_project_id")) {
      this.db.prepare("ALTER TABLE projects ADD COLUMN cloud_project_id TEXT").run();
    }
    if (!names.has("archived_at")) {
      this.db.prepare("ALTER TABLE projects ADD COLUMN archived_at TEXT").run();
    }
    if (!names.has("taste_id")) {
      this.db.prepare("ALTER TABLE projects ADD COLUMN taste_id TEXT").run();
    }
  }

  private ensureSkillColumns(): void {
    const columns = this.db.prepare("PRAGMA table_info(skills)").all() as Array<{ name: string }>;
    const names = new Set(columns.map((column) => column.name));
    if (!names.has("icon_id")) {
      this.db.prepare(`ALTER TABLE skills ADD COLUMN icon_id TEXT NOT NULL DEFAULT '${defaultSkillIconId}'`).run();
    }
    if (!names.has("gradient_id")) {
      this.db.prepare(`ALTER TABLE skills ADD COLUMN gradient_id TEXT NOT NULL DEFAULT '${defaultSkillGradientId}'`).run();
    }
  }

  private ensureStoryboardSettingsColumns(): void {
    const columns = this.db.prepare("PRAGMA table_info(storyboard_settings)").all() as Array<{ name: string }>;
    const names = new Set(columns.map((column) => column.name));
    if (!names.has("storyboard_skill_id")) {
      this.db.prepare("ALTER TABLE storyboard_settings ADD COLUMN storyboard_skill_id TEXT").run();
    }

    const rows = this.db
      .prepare(
        `SELECT s.project_id AS project_id, p.template_id AS template_id
         FROM storyboard_settings s
         JOIN projects p ON p.id = s.project_id
         WHERE s.storyboard_skill_id IS NULL OR s.storyboard_skill_id = ''`
      )
      .all() as Array<{ project_id: string; template_id: string }>;
    if (rows.length === 0) return;

    const updateSkill = this.db.prepare("UPDATE storyboard_settings SET storyboard_skill_id = ? WHERE project_id = ?");
    const backfill = this.db.transaction(() => {
      rows.forEach((row) => {
        updateSkill.run(this.getTemplate(row.template_id).storyboardSkillId, row.project_id);
      });
    });
    backfill();
  }

  private ensureDefaultProjectTemplateIds(): void {
    this.db.prepare("UPDATE projects SET template_id = ? WHERE template_id IN (?, ?)").run(defaultTemplateId, "默认模板", "default");
  }

  private ensureStoryboardPromptColumnSettings(): void {
    const settingRows = this.db.prepare("SELECT project_id, columns_json FROM storyboard_settings").all() as Array<{
      project_id: string;
      columns_json: string;
    }>;
    const templateRows = this.db.prepare("SELECT id, columns_json FROM templates").all() as Array<{ id: string; columns_json: string }>;
    const updateSettings = this.db.prepare("UPDATE storyboard_settings SET columns_json = ? WHERE project_id = ?");
    const updateTemplate = this.db.prepare("UPDATE templates SET columns_json = ? WHERE id = ?");

    const backfill = this.db.transaction(() => {
      settingRows.forEach((row) => {
        const columns = parseColumnsJson(row.columns_json);
        if (!columns) return;
        const normalizedColumns = ensureStoryboardPromptColumns(columns);
        const normalizedColumnsJson = JSON.stringify(normalizedColumns);
        if (normalizedColumnsJson !== row.columns_json) updateSettings.run(normalizedColumnsJson, row.project_id);
      });

      templateRows.forEach((row) => {
        const columns = parseColumnsJson(row.columns_json);
        if (!columns) return;
        const normalizedColumns = ensureStoryboardPromptColumns(columns);
        const normalizedColumnsJson = JSON.stringify(normalizedColumns);
        if (normalizedColumnsJson !== row.columns_json) updateTemplate.run(normalizedColumnsJson, row.id);
      });
    });
    backfill();
  }

  private ensureAgentMessageColumns(): void {
    const columns = this.db.prepare("PRAGMA table_info(agent_messages)").all() as Array<{ name: string }>;
    const names = new Set(columns.map((column) => column.name));
    if (!names.has("events_json")) {
      this.db.prepare("ALTER TABLE agent_messages ADD COLUMN events_json TEXT NOT NULL DEFAULT '[]'").run();
    }
    if (!names.has("attachments_json")) {
      this.db.prepare("ALTER TABLE agent_messages ADD COLUMN attachments_json TEXT NOT NULL DEFAULT '[]'").run();
    }
    if (!names.has("run_status")) {
      this.db.prepare("ALTER TABLE agent_messages ADD COLUMN run_status TEXT").run();
    }
    if (!names.has("conversation_id")) {
      this.db.prepare("ALTER TABLE agent_messages ADD COLUMN conversation_id TEXT REFERENCES agent_conversations(id) ON DELETE CASCADE").run();
    }
    if (!names.has("client_run_id")) {
      this.db.prepare("ALTER TABLE agent_messages ADD COLUMN client_run_id TEXT").run();
    }
    if (!names.has("agent_cli_id")) {
      this.db.prepare("ALTER TABLE agent_messages ADD COLUMN agent_cli_id TEXT").run();
    }
    if (!names.has("operation_confirmation_json")) {
      this.db.prepare("ALTER TABLE agent_messages ADD COLUMN operation_confirmation_json TEXT").run();
    }
  }

  private ensureAgentConversationColumns(): void {
    const columns = this.db.prepare("PRAGMA table_info(agent_conversations)").all() as Array<{ name: string }>;
    const names = new Set(columns.map((column) => column.name));
    if (!names.has("unread_completion")) {
      this.db.prepare("ALTER TABLE agent_conversations ADD COLUMN unread_completion INTEGER NOT NULL DEFAULT 0").run();
    }
  }

  private ensureShotMediaColumns(): void {
    const columns = this.db.prepare("PRAGMA table_info(shots)").all() as Array<{ name: string }>;
    const names = new Set(columns.map((column) => column.name));
    if (!names.has("image_asset_ids_json")) {
      this.db.prepare("ALTER TABLE shots ADD COLUMN image_asset_ids_json TEXT NOT NULL DEFAULT '[]'").run();
      const legacyRows = this.db
        .prepare("SELECT id, image_asset_id FROM shots WHERE image_asset_id IS NOT NULL AND image_asset_id <> ''")
        .all() as Array<{ id: string; image_asset_id: string }>;
      const updateLegacyMediaIds = this.db.prepare("UPDATE shots SET image_asset_ids_json = ? WHERE id = ?");
      const migrateLegacyMediaIds = this.db.transaction(() => {
        legacyRows.forEach((row) => {
          updateLegacyMediaIds.run(JSON.stringify([row.image_asset_id]), row.id);
        });
      });
      migrateLegacyMediaIds();
    }
  }

  private ensureAssetPosterColumns(): void {
    const columns = this.db.prepare("PRAGMA table_info(assets)").all() as Array<{ name: string }>;
    const names = new Set(columns.map((column) => column.name));
    if (!names.has("poster_path")) {
      this.db.prepare("ALTER TABLE assets ADD COLUMN poster_path TEXT").run();
    }
    if (!names.has("poster_indexed_path")) {
      this.db.prepare("ALTER TABLE assets ADD COLUMN poster_indexed_path TEXT").run();
    }
  }

  private ensureAssetContentHashColumn(): void {
    const columns = this.db.prepare("PRAGMA table_info(assets)").all() as Array<{ name: string }>;
    const names = new Set(columns.map((column) => column.name));
    if (!names.has("content_hash")) {
      this.db.prepare("ALTER TABLE assets ADD COLUMN content_hash TEXT").run();
    }

    const rows = this.db.prepare("SELECT id, project_id, local_path FROM assets WHERE content_hash IS NULL OR content_hash = ''").all() as Array<{
      id: string;
      project_id: string;
      local_path: string;
    }>;
    if (rows.length === 0) return;

    const updateHash = this.db.prepare("UPDATE assets SET content_hash = ? WHERE id = ? AND project_id = ?");
    const backfill = this.db.transaction(() => {
      rows.forEach((row) => {
        if (!existsSync(row.local_path)) return;
        updateHash.run(hashFile(row.local_path), row.id, row.project_id);
      });
    });
    backfill();
  }

  private ensureStoryboardVideoTaskColumns(): void {
    const columns = this.db.prepare("PRAGMA table_info(storyboard_video_tasks)").all() as Array<{ name: string }>;
    const names = new Set(columns.map((column) => column.name));
    if (!names.has("started_at")) {
      this.db.prepare("ALTER TABLE storyboard_video_tasks ADD COLUMN started_at TEXT").run();
    }
  }

  private ensureTutorialProjects(): void {
    this.ensureTutorialProject("zh-CN");
    this.ensureTutorialProject("en");
  }

  private createTutorialProject(locale: TutorialLocale): void {
    const now = new Date().toISOString();
    const interfaceLanguage = getTutorialInterfaceLanguage(locale);
    const projectId = getTutorialProjectIdForLocale(locale);
    const localPath = join(this.projectRoot, `${sanitizeFileName(getTutorialProjectName(interfaceLanguage))}-${projectId.slice(0, 8)}`);
    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO projects (id, kind, name, icon, template_id, taste_id, local_path, created_at, updated_at)
           VALUES (?, 'tutorial', ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(projectId, getTutorialProjectName(interfaceLanguage), "rocket", defaultTemplateId, defaultTasteId, localPath, now, now);
      this.insertDefaultProjectState(
        projectId,
        now,
        getTutorialScriptHtml(interfaceLanguage),
        getTutorialStoryboardRowsForLocale(locale),
        getDefaultStoryboardColumns(interfaceLanguage),
        this.getDefaultStoryboardSkillId(interfaceLanguage)
      );
    });
    tx();
  }

  private removeUntouchedSampleProject(): void {
    const project = this.db.prepare("SELECT * FROM projects WHERE id = ?").get(sampleProjectId) as ProjectRecord | undefined;
    if (!project || isTutorialProjectRecord(project) || project.archived_at || project.deleted_at) return;
    if (project.name !== sampleProjectName && project.name !== legacySampleProjectName) return;

    const script = this.db.prepare("SELECT * FROM scripts WHERE project_id = ?").get(sampleProjectId) as ScriptRecord | undefined;
    const rows = this.listShotRecords(sampleProjectId);
    const isUntouchedAppleSample =
      project.name === sampleProjectName &&
      Boolean(script?.html.includes("Apple in Two Minutes")) &&
      rows.length === createAppleSampleProjectRows().length;
    const isUntouchedLegacySample =
      project.name === legacySampleProjectName &&
      Boolean(script?.html.includes(legacySampleScriptTitle)) &&
      rows.length === legacySampleRowContents.length &&
      legacySampleRowContents.every((content, index) => rows[index]?.content === content);

    if (!isUntouchedAppleSample && !isUntouchedLegacySample) return;

    this.db.prepare("DELETE FROM projects WHERE id = ?").run(sampleProjectId);
    if (project.local_path && isPathInside(this.projectRoot, project.local_path)) {
      rmSync(project.local_path, { recursive: true, force: true });
    }
  }

  private removeTutorialGeneratedMedia(projectId: string): void {
    const project = this.getProjectRecord(projectId);
    if (!isTutorialProjectRecord(project)) return;
    const assetRows = this.db
      .prepare("SELECT * FROM assets WHERE project_id = ? AND kind IN ('image', 'video')")
      .all(projectId) as AssetRecord[];
    const rows = assetRows.filter((row) => isTutorialPlaceholderAsset(project, row));
    if (rows.length === 0) return;

    const now = new Date().toISOString();
    const assetIds = rows.map((row) => row.id);
    const targetIds = new Set(assetIds);
    const deleteAsset = this.db.prepare("DELETE FROM assets WHERE id = ? AND project_id = ?");
    const updateShotCustomValues = this.db.prepare("UPDATE shots SET custom_values_json = ?, updated_at = ? WHERE id = ? AND project_id = ?");
    const tx = this.db.transaction(() => {
      this.removeAssetIdsFromShotMedia(projectId, assetIds, now);
      this.listShotRecords(projectId).forEach((shot) => {
        const customValues = parseJsonObject(shot.custom_values_json);
        let changed = false;
        if (targetIds.has(customValues[PROMPT_PREVIEW_IMAGE_ASSET_ID_FIELD])) {
          delete customValues[PROMPT_PREVIEW_IMAGE_ASSET_ID_FIELD];
          changed = true;
        }
        if (targetIds.has(customValues[PROMPT_PREVIEW_VIDEO_ASSET_ID_FIELD])) {
          delete customValues[PROMPT_PREVIEW_VIDEO_ASSET_ID_FIELD];
          changed = true;
        }
        if (changed) updateShotCustomValues.run(JSON.stringify(customValues), now, shot.id, projectId);
      });
      rows.forEach((row) => {
        if (isPathInside(project.local_path, row.local_path) && existsSync(row.local_path)) rmSync(row.local_path, { force: true });
        removeProjectFile(project, row.poster_path);
        deleteAsset.run(row.id, projectId);
      });
      this.touchProject(projectId);
    });
    tx();
  }

  private revealTutorialMediaAssets(
    project: ProjectRecord,
    rows: ShotRecord[],
    kind: "image" | "video",
    locale: TutorialLocale,
    options: { bundledOnly?: boolean } = {}
  ): void {
    const bundledAssetsByRowId = new Map(
      getTutorialMediaAssetsForLocale(locale)
        .filter((asset) => asset.kind === kind)
        .map((asset) => [asset.rowId, asset])
    );
    const placeholderRows: Array<{ row: ShotRecord; index: number }> = [];
    rows.forEach((row, index) => {
      const bundledAsset = bundledAssetsByRowId.get(row.id);
      if (bundledAsset) {
        if (this.isBundledTutorialMediaAssetReady(project, row, bundledAsset) || this.upsertBundledTutorialMediaAsset(project.id, row.id, bundledAsset)) {
          this.normalizeBundledTutorialMediaSelection(project.id, row.id, bundledAsset);
          return;
        }
      }
      if (options.bundledOnly) return;
      placeholderRows.push({ row, index });
    });
    if (placeholderRows.length === 0) return;

    const assetsDir = join(project.local_path, "assets");
    mkdirSync(assetsDir, { recursive: true });
    const now = new Date().toISOString();
    const tx = this.db.transaction(() => {
      placeholderRows.forEach(({ row, index }) => this.upsertTutorialMediaAsset(project, assetsDir, row, kind, index, now));
      this.touchProject(project.id);
    });
    tx();
  }

  private replaceTutorialStoryboardRows(project: ProjectRecord, rows: StoryboardRow[], locale: TutorialLocale, previousRows: ShotRecord[]): void {
    const mediaSnapshot = this.createTutorialShotMediaSnapshot(project.id, previousRows);
    this.replaceRows(project.id, rows);
    this.applyTutorialShotMediaSnapshot(project.id, locale, mediaSnapshot);
    this.syncTutorialBundledMediaAssets(project, locale);
  }

  private syncTutorialBundledMediaAssets(project: ProjectRecord, locale: TutorialLocale): void {
    if (!isTutorialProjectId(project.id)) return;
    const bundledAssets = getTutorialMediaAssetsForLocale(locale);
    if (bundledAssets.length === 0) return;

    const rowsById = new Map(this.listShotRecords(project.id).map((row) => [row.id, row]));
    const rowsByKind = new Map<"image" | "video", ShotRecord[]>();
    bundledAssets.forEach((asset) => {
      const row = rowsById.get(asset.rowId);
      if (!row) return;
      const rows = rowsByKind.get(asset.kind) ?? [];
      if (!rows.some((existingRow) => existingRow.id === row.id)) rows.push(row);
      rowsByKind.set(asset.kind, rows);
    });

    rowsByKind.forEach((rows, kind) => this.revealTutorialMediaAssets(project, rows, kind, locale, { bundledOnly: true }));
  }

  private createTutorialShotMediaSnapshot(projectId: string, rows: ShotRecord[]): TutorialShotMediaSnapshot[] {
    return rows
      .map((row) => {
        const customValues = parseJsonObject(row.custom_values_json);
        const linkedAssetRows = this.db
          .prepare("SELECT id FROM assets WHERE project_id = ? AND linked_shot_id = ? ORDER BY created_at ASC")
          .all(projectId, row.id) as Array<{ id: string }>;
        const assetIds = normalizeShotMediaIds([...getShotMediaIds(row), ...linkedAssetRows.map((asset) => asset.id)]);
        const previewImageAssetId =
          typeof customValues[PROMPT_PREVIEW_IMAGE_ASSET_ID_FIELD] === "string" ? customValues[PROMPT_PREVIEW_IMAGE_ASSET_ID_FIELD] : undefined;
        const previewVideoAssetId =
          typeof customValues[PROMPT_PREVIEW_VIDEO_ASSET_ID_FIELD] === "string" ? customValues[PROMPT_PREVIEW_VIDEO_ASSET_ID_FIELD] : undefined;
        return {
          position: row.position,
          assetIds,
          previewImageAssetId,
          previewVideoAssetId,
          mediaSelectionTouched: customValues[STORYBOARD_MEDIA_SELECTION_TOUCHED_FIELD] === "true"
        };
      })
      .filter((snapshot) => snapshot.assetIds.length > 0 || Boolean(snapshot.previewImageAssetId || snapshot.previewVideoAssetId));
  }

  private applyTutorialShotMediaSnapshot(projectId: string, locale: TutorialLocale, snapshots: TutorialShotMediaSnapshot[]): void {
    if (snapshots.length === 0) return;
    const snapshotsByPosition = new Map(snapshots.map((snapshot) => [snapshot.position, snapshot]));
    const rows = this.listShotRecords(projectId);
    const now = new Date().toISOString();
    const tx = this.db.transaction(() => {
      let changed = false;
      rows.forEach((row) => {
        const snapshot = snapshotsByPosition.get(row.position);
        if (!snapshot) return;

        const assets = this.getShotMediaAssets(projectId, snapshot.assetIds);
        const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
        const preservedAssetIds = snapshot.assetIds.filter((assetId) => {
          const asset = assetsById.get(assetId);
          return asset ? this.shouldPreserveTutorialSnapshotAsset(row, locale, asset) : false;
        });
        if (preservedAssetIds.length === 0) return;

        this.writeShotMediaIds(projectId, row.id, preservedAssetIds, now);
        const previewImageAssetId = this.pickTutorialPreviewAssetId(snapshot.previewImageAssetId, "image", preservedAssetIds, assetsById);
        const previewVideoAssetId = this.pickTutorialPreviewAssetId(snapshot.previewVideoAssetId, "video", preservedAssetIds, assetsById);
        if (previewImageAssetId) this.writeShotPromptPreviewAsset(projectId, row.id, "image", previewImageAssetId, now);
        if (previewVideoAssetId) this.writeShotPromptPreviewAsset(projectId, row.id, "video", previewVideoAssetId, now);
        if (snapshot.mediaSelectionTouched) this.markShotMediaSelectionTouched(projectId, row.id, now);
        changed = true;
      });
      if (changed) this.touchProject(projectId);
    });
    tx();
  }

  private shouldPreserveTutorialSnapshotAsset(row: ShotRecord, locale: TutorialLocale, asset: AssetRecord): boolean {
    if (!isShotMediaKind(asset.kind)) return false;
    if (isBundledTutorialMediaAssetId(asset.id) && !isBundledTutorialMediaAssetIdForLocale(asset.id, locale)) return false;
    if (locale === "en" && asset.kind === "video" && isHyperframesShotRecord(row)) return false;
    return true;
  }

  private pickTutorialPreviewAssetId(
    preferredAssetId: string | undefined,
    kind: "image" | "video",
    assetIds: string[],
    assetsById: Map<string, AssetRecord>
  ): string | undefined {
    if (preferredAssetId && assetIds.includes(preferredAssetId) && assetsById.get(preferredAssetId)?.kind === kind) return preferredAssetId;
    return assetIds.find((assetId) => assetsById.get(assetId)?.kind === kind);
  }

  private isBundledTutorialMediaAssetReady(project: ProjectRecord, row: ShotRecord, asset: TutorialMediaAsset): boolean {
    const existingAsset = this.getAssetRecord(project.id, asset.id);
    if (!existingAsset || existingAsset.kind !== asset.kind || existingAsset.linked_shot_id !== row.id) return false;
    if (asset.url) {
      if (existingAsset.local_path !== asset.url || existingAsset.indexed_path !== asset.url) return false;
      if (asset.kind === "video" && asset.posterUrl && existingAsset.poster_path !== asset.posterUrl) return false;
      return getShotMediaIds(row).includes(asset.id);
    }
    if (!existingAsset.local_path || !existsSync(existingAsset.local_path)) return false;
    if (asset.kind === "video" && asset.posterResourcePath && (!existingAsset.poster_path || !existsSync(existingAsset.poster_path))) return false;
    return getShotMediaIds(row).includes(asset.id);
  }

  private normalizeBundledTutorialMediaSelection(projectId: string, rowId: string, asset: TutorialMediaAsset): void {
    const row = this.getShotRecord(projectId, rowId);
    if (!row) return;
    const now = new Date().toISOString();
    const currentIds = getShotMediaIds(row);
    const currentAssetsById = new Map(this.getShotMediaAssets(projectId, currentIds).map((currentAsset) => [currentAsset.id, currentAsset]));
    const hasSelectedUserAssetOfSameKind = currentIds.some((currentAssetId) => {
      const currentAsset = currentAssetsById.get(currentAssetId);
      return (
        currentAsset?.kind === asset.kind &&
        !isBundledTutorialMediaAssetId(currentAssetId) &&
        isAvailableTutorialUserAsset(currentAsset)
      );
    });
    if (hasSelectedUserAssetOfSameKind) return;

    const filteredIds = currentIds.filter((currentAssetId) => currentAssetId === asset.id || currentAssetsById.get(currentAssetId)?.kind !== asset.kind);
    const idsWithAsset = normalizeShotMediaIds([...filteredIds, asset.id]);
    const assetsById = new Map(this.getShotMediaAssets(projectId, idsWithAsset).map((currentAsset) => [currentAsset.id, currentAsset]));
    const nextIds = isHyperframesShotRecord(row) ? putGeneratedMediaAssetFirst(filteredIds, asset.id) : orderStoryboardMediaIdsByKind(idsWithAsset, assetsById);
    if (!areStringArraysEqual(nextIds, currentIds)) {
      this.writeShotMediaIds(projectId, rowId, nextIds, now);
    }

    const latestRow = this.getShotRecord(projectId, rowId);
    if (!latestRow) return;
    const latestCustomValues = parseJsonObject(latestRow.custom_values_json);
    const assetIdField = asset.kind === "video" ? PROMPT_PREVIEW_VIDEO_ASSET_ID_FIELD : PROMPT_PREVIEW_IMAGE_ASSET_ID_FIELD;
    if (latestCustomValues[assetIdField] !== asset.id) this.writeShotPromptPreviewAsset(projectId, rowId, asset.kind, asset.id, now);
  }

  private upsertBundledTutorialMediaAsset(projectId: string, rowId: string, asset: TutorialMediaAsset): boolean {
    if (asset.url) {
      this.upsertRemoteTutorialMediaAsset(projectId, rowId, asset);
      return true;
    }

    const sourcePath = asset.resourcePath ? resolveTutorialBundledAssetPath(asset.resourcePath) : null;
    if (!sourcePath) return false;
    if (asset.kind === "image") {
      this.upsertGeneratedShotImage(projectId, rowId, asset.id, asset.fileName, readFileSync(sourcePath), false);
      return true;
    }

    const posterPath = asset.posterResourcePath ? resolveTutorialBundledAssetPath(asset.posterResourcePath) : null;
    this.upsertGeneratedShotVideo(projectId, rowId, asset.id, sourcePath, asset.fileName, false, posterPath);
    return true;
  }

  private upsertRemoteTutorialMediaAsset(projectId: string, rowId: string, asset: TutorialMediaAsset): void {
    if (!isTutorialProjectId(projectId)) {
      throw new Error(`Refusing to attach remote tutorial media to non-tutorial project: ${projectId}`);
    }
    const now = new Date().toISOString();
    const existingAsset = this.getAssetRecord(projectId, asset.id);
    const fileSize = Number.isFinite(asset.fileSize) && asset.fileSize > 0 ? Math.round(asset.fileSize) : existingAsset?.file_size ?? 0;
    const contentHash = asset.sha256?.trim() || existingAsset?.content_hash || null;
    const posterUrl = asset.kind === "video" ? asset.posterUrl ?? null : null;
    const posterIndexedUrl = asset.kind === "video" ? asset.posterUrl ?? null : null;
    const project = this.getProjectRecord(projectId);

    if (existingAsset) {
      if (existingAsset.local_path !== asset.url && isPathInside(project.local_path, existingAsset.local_path) && existsSync(existingAsset.local_path)) {
        rmSync(existingAsset.local_path, { force: true });
      }
      if (existingAsset.poster_path && existingAsset.poster_path !== posterUrl) removeProjectFile(project, existingAsset.poster_path);
      this.db
        .prepare(
          "UPDATE assets SET file_name = ?, kind = ?, file_size = ?, local_path = ?, indexed_path = ?, poster_path = ?, poster_indexed_path = ?, linked_shot_id = ?, content_hash = ? WHERE id = ? AND project_id = ?"
        )
        .run(asset.fileName, asset.kind, fileSize, asset.url, asset.url, posterUrl, posterIndexedUrl, rowId, contentHash, asset.id, projectId);
      return;
    }

    this.db
      .prepare(
        `INSERT INTO assets (id, project_id, file_name, kind, file_size, local_path, indexed_path, poster_path, poster_indexed_path, linked_shot_id, content_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(asset.id, projectId, asset.fileName, asset.kind, fileSize, asset.url, asset.url, posterUrl, posterIndexedUrl, rowId, contentHash, now);
  }

  private upsertTutorialMediaAsset(project: ProjectRecord, assetsDir: string, row: ShotRecord, kind: "image" | "video", index: number, now: string): void {
    const assetId = getTutorialGuideMediaAssetId(kind, row.id);
    const rowSlug = getTutorialGuideMediaRowSlug(row.id);
    const safeIndex = String(index + 1).padStart(2, "0");
    const fileName = `mkb-guide-${kind}-${rowSlug}.${kind === "image" ? "svg" : "mp4"}`;
    const destination = join(assetsDir, fileName);
    const posterFileName = kind === "video" ? `mkb-guide-video-${rowSlug}-poster.svg` : null;
    const posterPath = posterFileName ? join(assetsDir, posterFileName) : null;
    const posterIndexedPath = posterPath ? relative(project.local_path, posterPath) : null;

    if (kind === "image") {
      writeFileSync(destination, createTutorialGuideSvg(row, "image", index));
    } else {
      writeFileSync(destination, Buffer.from(`MkBoard guide video placeholder ${row.id}\n`, "utf8"));
      if (posterPath) writeFileSync(posterPath, createTutorialGuideSvg(row, "video", index));
    }

    const fileSize = statSync(destination).size;
    const indexedPath = relative(project.local_path, destination);
    const contentHash = hashFile(destination);
    const existingAsset = this.getAssetRecord(project.id, assetId);
    if (existingAsset) {
      this.db
        .prepare(
          "UPDATE assets SET file_name = ?, kind = ?, file_size = ?, local_path = ?, indexed_path = ?, poster_path = ?, poster_indexed_path = ?, linked_shot_id = ?, content_hash = ? WHERE id = ? AND project_id = ?"
        )
        .run(fileName, kind, fileSize, destination, indexedPath, posterPath, posterIndexedPath, row.id, contentHash, assetId, project.id);
    } else {
      this.db
        .prepare(
          `INSERT INTO assets (id, project_id, file_name, kind, file_size, local_path, indexed_path, poster_path, poster_indexed_path, linked_shot_id, content_hash, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(assetId, project.id, fileName, kind, fileSize, destination, indexedPath, posterPath, posterIndexedPath, row.id, contentHash, now);
    }

    const currentIds = getShotMediaIds(row);
    this.writeShotPromptPreviewAsset(project.id, row.id, kind, assetId, now);
    this.writeShotMediaIds(project.id, row.id, putGeneratedMediaAssetFirst(currentIds, assetId), now);
    this.markShotMediaSelectionTouched(project.id, row.id, now);
  }

  private insertDefaultProjectState(
    projectId: string,
    now: string,
    scriptHtml: string,
    rows: StoryboardRow[],
    columns: StoryboardColumn[],
    storyboardSkillIdValue: string,
    imageRatio: ImageRatio = "16:9"
  ): void {
    const normalizedScriptHtml = normalizeScriptARollTags(scriptHtml);
    const conversationId = randomUUID();
    this.db
      .prepare("INSERT INTO scripts (project_id, html, plain_text, updated_at) VALUES (?, ?, ?, ?)")
      .run(projectId, normalizedScriptHtml, stripHtml(normalizedScriptHtml), now);
    this.db
      .prepare("INSERT INTO storyboard_settings (project_id, image_ratio, columns_json, storyboard_skill_id, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run(projectId, normalizeImageRatio(imageRatio), JSON.stringify(ensureStoryboardPromptColumns(columns)), storyboardSkillIdValue, now);
    this.db
      .prepare("INSERT INTO agent_conversations (id, project_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run(conversationId, projectId, defaultAgentConversationTitle, now, now);
    this.db
      .prepare("INSERT INTO agent_messages (id, project_id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(randomUUID(), projectId, conversationId, "assistant", defaultAgentMessage, now);
    if (rows.length > 0) this.replaceRows(projectId, rows);
  }

  private getProjectRecord(projectId: string): ProjectRecord {
    const project = this.db
      .prepare(
        `SELECT projects.*,
                COALESCE((SELECT image_ratio FROM storyboard_settings WHERE project_id = projects.id), '16:9') AS image_ratio
         FROM projects
         WHERE id = ?`
      )
      .get(projectId) as ProjectRecord | undefined;
    if (!project) throw new Error(`Project not found: ${projectId}`);
    return project;
  }

  private getScriptHtml(projectId: string): string {
    const script = this.db.prepare("SELECT * FROM scripts WHERE project_id = ?").get(projectId) as ScriptRecord | undefined;
    return normalizeScriptARollTags(script?.html ?? "<p></p>");
  }

  private getColumns(projectId: string, interfaceLanguage?: InterfaceLanguage): StoryboardColumn[] {
    const settings = this.getSettings(projectId);
    try {
      const parsed = JSON.parse(settings.columns_json) as StoryboardColumn[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        const columns = ensureStoryboardPromptColumns(parsed, interfaceLanguage);
        if (JSON.stringify(columns) !== settings.columns_json) {
          this.saveSettings(projectId, settings.image_ratio as ImageRatio, columns, settings.storyboard_skill_id ?? this.getStoryboardSkillId(projectId));
        }
        return columns;
      }
    } catch {
      // Fall through to defaults.
    }
    return ensureStoryboardPromptColumns(getDefaultStoryboardColumns(interfaceLanguage), interfaceLanguage);
  }

  private getImageRatio(projectId: string): ImageRatio {
    return normalizeImageRatio(this.getSettings(projectId).image_ratio);
  }

  private getSettings(projectId: string): SettingsRecord {
    const settings = this.db.prepare("SELECT * FROM storyboard_settings WHERE project_id = ?").get(projectId) as SettingsRecord | undefined;
    if (settings) {
      const imageRatio = normalizeImageRatio(settings.image_ratio);
      if (imageRatio !== settings.image_ratio) {
        this.db.prepare("UPDATE storyboard_settings SET image_ratio = ?, updated_at = ? WHERE project_id = ?").run(imageRatio, new Date().toISOString(), projectId);
        settings.image_ratio = imageRatio;
      }
      if (!settings.storyboard_skill_id) {
        const skillId = this.getStoryboardSkillId(projectId);
        this.db.prepare("UPDATE storyboard_settings SET storyboard_skill_id = ? WHERE project_id = ?").run(skillId, projectId);
        return { ...settings, storyboard_skill_id: skillId };
      }
      return settings;
    }
    const now = new Date().toISOString();
    const skillId = this.getStoryboardSkillId(projectId);
    this.db
      .prepare("INSERT INTO storyboard_settings (project_id, image_ratio, columns_json, storyboard_skill_id, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run(projectId, "16:9", JSON.stringify(ensureStoryboardPromptColumns(getDefaultStoryboardColumns())), skillId, now);
    return {
      project_id: projectId,
      image_ratio: "16:9",
      columns_json: JSON.stringify(ensureStoryboardPromptColumns(getDefaultStoryboardColumns())),
      storyboard_skill_id: skillId,
      updated_at: now
    };
  }

  private saveSettings(projectId: string, imageRatio: ImageRatio, columns: StoryboardColumn[], storyboardSkillIdValue?: string): void {
    const now = new Date().toISOString();
    const skillId = storyboardSkillIdValue ?? this.getStoryboardSkillId(projectId);
    this.db
      .prepare(
        `INSERT INTO storyboard_settings (project_id, image_ratio, columns_json, storyboard_skill_id, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(project_id) DO UPDATE SET
           image_ratio = excluded.image_ratio,
           columns_json = excluded.columns_json,
           storyboard_skill_id = excluded.storyboard_skill_id,
           updated_at = excluded.updated_at`
      )
      .run(projectId, imageRatio, JSON.stringify(ensureStoryboardPromptColumns(columns)), skillId, now);
    this.touchProject(projectId);
  }

  private getShotRecord(projectId: string, rowId: string): ShotRecord | undefined {
    return this.db.prepare("SELECT * FROM shots WHERE id = ? AND project_id = ?").get(rowId, projectId) as ShotRecord | undefined;
  }

  private getAssetRecord(projectId: string, assetId: string): AssetRecord | undefined {
    return this.db.prepare("SELECT * FROM assets WHERE id = ? AND project_id = ?").get(assetId, projectId) as AssetRecord | undefined;
  }

  private getShotMediaAssets(projectId: string, assetIds: string[]): AssetRecord[] {
    if (assetIds.length === 0) return [];
    return this.db
      .prepare(`SELECT * FROM assets WHERE project_id = ? AND id IN (${assetIds.map(() => "?").join(",")})`)
      .all(projectId, ...assetIds) as AssetRecord[];
  }

  private async insertAssetFileRecords(
    project: ProjectRecord,
    filePaths: string[],
    options: { linkedShotId?: string | null; existingTargetAssetIds?: string[]; limit?: number; mediaOnly?: boolean } = {}
  ): Promise<string[]> {
    const assetsDir = join(project.local_path, "assets");
    mkdirSync(assetsDir, { recursive: true });
    const now = new Date().toISOString();
    const insert = this.db.prepare(
      `INSERT INTO assets (id, project_id, file_name, kind, file_size, local_path, indexed_path, poster_path, poster_indexed_path, linked_shot_id, content_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const importedAssetIds: string[] = [];
    const existingTargetAssetIds = new Set(options.existingTargetAssetIds ?? []);
    const nextTargetAssetCount = () => importedAssetIds.filter((assetId) => !existingTargetAssetIds.has(assetId)).length;

    for (const sourcePath of filePaths) {
      if (options.limit !== undefined && nextTargetAssetCount() >= options.limit) break;
      if (!sourcePath || !existsSync(sourcePath)) continue;
      const stats = statSync(sourcePath);
      if (!stats.isFile()) continue;
      const kind = getAssetKind(sourcePath);
      if (options.mediaOnly && !isShotMediaKind(kind)) continue;
      const contentHash = hashFile(sourcePath);
      const existingAsset = this.findAssetRecordByContentHash(project.id, contentHash);
      if (existingAsset) {
        await this.ensureVideoAssetPoster(project, existingAsset);
        pushUniqueId(importedAssetIds, existingAsset.id);
        continue;
      }
      const fileName = uniqueAssetFileName(assetsDir, basename(sourcePath));
      const destination = join(assetsDir, fileName);
      const assetId = randomUUID();
      const poster = kind === "video" ? await prepareVideoAssetPoster(project, assetsDir, fileName, sourcePath) : { path: null, indexedPath: null };
      copyFileSync(sourcePath, destination);
      insert.run(
        assetId,
        project.id,
        fileName,
        kind,
        stats.size,
        destination,
        relative(project.local_path, destination),
        poster.path,
        poster.indexedPath,
        options.linkedShotId ?? null,
        contentHash,
        now
      );
      pushUniqueId(importedAssetIds, assetId);
    }

    return importedAssetIds;
  }

  private async ensureVideoAssetPoster(project: ProjectRecord, asset: AssetRecord, options: { requireTailPoster?: boolean } = {}): Promise<void> {
    if (asset.kind !== "video" || isHttpUrl(asset.local_path) || !existsSync(asset.local_path)) return;
    const hasReusablePoster = asset.poster_path && isPathInside(project.local_path, asset.poster_path) && existsSync(asset.poster_path);
    if (hasReusablePoster && (!options.requireTailPoster || isTailFramePosterPath(asset.poster_path))) return;
    const attemptKey = `${project.id}:${asset.id}:${asset.content_hash ?? ""}:${asset.poster_path ?? ""}`;
    if (options.requireTailPoster && this.videoTailPosterBackfillAttempts.has(attemptKey)) return;
    if (options.requireTailPoster) this.videoTailPosterBackfillAttempts.add(attemptKey);
    const assetsDir = join(project.local_path, "assets");
    mkdirSync(assetsDir, { recursive: true });
    const poster = await prepareVideoAssetPoster(project, assetsDir, asset.file_name, asset.local_path, asset.poster_path);
    if (!poster.path) return;
    if (asset.poster_path && asset.poster_path !== poster.path) removeProjectFile(project, asset.poster_path);
    this.db
      .prepare("UPDATE assets SET poster_path = ?, poster_indexed_path = ? WHERE id = ? AND project_id = ?")
      .run(poster.path, poster.indexedPath, asset.id, project.id);
  }

  private findAssetRecordByContentHash(projectId: string, contentHash: string): AssetRecord | null {
    return (
      (this.db
        .prepare("SELECT * FROM assets WHERE project_id = ? AND content_hash = ? ORDER BY created_at ASC LIMIT 1")
        .get(projectId, contentHash) as AssetRecord | undefined) ?? null
    );
  }

  private findAssetIdByContentHash(projectId: string, contentHash: string): string | null {
    return this.findAssetRecordByContentHash(projectId, contentHash)?.id ?? null;
  }

  private filterProjectMediaAssetIds(projectId: string, assetIds: string[]): string[] {
    const requestedIds = normalizeShotMediaIds(assetIds);
    if (requestedIds.length === 0) return [];
    const rows = this.db
      .prepare("SELECT id, kind FROM assets WHERE project_id = ?")
      .all(projectId) as Array<{ id: string; kind: AssetKind }>;
    const validAssetIds = new Set(rows.filter((row) => isShotMediaKind(row.kind)).map((row) => row.id));
    return requestedIds.filter((assetId) => validAssetIds.has(assetId)).slice(0, maxShotMediaAssets);
  }

  private writeShotMediaIds(projectId: string, rowId: string, assetIds: string[], now: string): void {
    const nextIds = this.filterProjectMediaAssetIds(projectId, assetIds);
    // Asset ids are references, not ownership markers; the same asset can appear in multiple shots.
    this.db
      .prepare("UPDATE shots SET image_asset_id = ?, image_asset_ids_json = ?, updated_at = ? WHERE id = ? AND project_id = ?")
      .run(nextIds[0] ?? null, JSON.stringify(nextIds), now, rowId, projectId);
  }

  private markShotMediaSelectionTouched(projectId: string, rowId: string, now: string): void {
    const shot = this.getShotRecord(projectId, rowId);
    if (!shot) return;
    const customValues = parseJsonObject(shot.custom_values_json);
    if (customValues[STORYBOARD_MEDIA_SELECTION_TOUCHED_FIELD] === "true") return;
    customValues[STORYBOARD_MEDIA_SELECTION_TOUCHED_FIELD] = "true";
    this.db
      .prepare("UPDATE shots SET custom_values_json = ?, updated_at = ? WHERE id = ? AND project_id = ?")
      .run(JSON.stringify(customValues), now, rowId, projectId);
  }

  private writeShotPromptPreviewAsset(projectId: string, rowId: string, kind: "image" | "video", assetId: string, now: string): void {
    const shot = this.getShotRecord(projectId, rowId);
    if (!shot) return;
    const customValues = parseJsonObject(shot.custom_values_json);
    const assetIdField = kind === "video" ? PROMPT_PREVIEW_VIDEO_ASSET_ID_FIELD : PROMPT_PREVIEW_IMAGE_ASSET_ID_FIELD;
    const hiddenField = kind === "video" ? PROMPT_PREVIEW_VIDEO_HIDDEN_FIELD : PROMPT_PREVIEW_IMAGE_HIDDEN_FIELD;
    customValues[assetIdField] = assetId;
    delete customValues[hiddenField];
    this.db
      .prepare("UPDATE shots SET custom_values_json = ?, updated_at = ? WHERE id = ? AND project_id = ?")
      .run(JSON.stringify(customValues), now, rowId, projectId);
  }

  private removeAssetIdsFromShotMedia(projectId: string, assetIds: string[], now: string): void {
    const targetIds = new Set(normalizeIdList(assetIds));
    if (targetIds.size === 0) return;
    const rows = this.listShotRecords(projectId);
    rows.forEach((row) => {
      const nextIds = getShotMediaIds(row).filter((assetId) => !targetIds.has(assetId));
      this.db
        .prepare("UPDATE shots SET image_asset_id = ?, image_asset_ids_json = ?, updated_at = ? WHERE id = ? AND project_id = ?")
        .run(nextIds[0] ?? null, JSON.stringify(nextIds), now, row.id, projectId);
    });
    normalizeIdList(assetIds).forEach((assetId) => {
      this.db.prepare("UPDATE assets SET linked_shot_id = NULL WHERE id = ? AND project_id = ?").run(assetId, projectId);
    });
  }

  private listRows(projectId: string): StoryboardRow[] {
    return this.listShotRecords(projectId).map(mapShotRecord);
  }

  private listShotRecords(projectId: string): ShotRecord[] {
    return this.db
      .prepare("SELECT * FROM shots WHERE project_id = ? ORDER BY position ASC")
      .all(projectId) as ShotRecord[];
  }

  private resequenceShotRecords(projectId: string, rows: Array<Pick<ShotRecord, "id" | "position" | "shot_number">>, now: string): void {
    const update = this.db.prepare("UPDATE shots SET position = ?, shot_number = ?, updated_at = ? WHERE id = ? AND project_id = ?");
    rows.forEach((row, index) => {
      const position = index + 1;
      const shotNumber = String(position);
      if (row.position === position && row.shot_number === shotNumber) return;
      update.run(position, shotNumber, now, row.id, projectId);
    });
  }

  private listAssets(projectId: string): ProjectAsset[] {
    const rows = this.db
      .prepare("SELECT * FROM assets WHERE project_id = ? ORDER BY created_at DESC")
      .all(projectId) as AssetRecord[];
    return rows.map((row) => ({
      id: row.id,
      name: row.file_name,
      kind: row.kind,
      sizeLabel: formatFileSize(row.file_size),
      localPath: row.indexed_path,
      indexedPath: row.indexed_path,
      previewUrl: createAssetPreviewUrl(row),
      posterUrl: createAssetPosterUrl(row),
      linkedShotId: row.linked_shot_id,
      linkedShot: row.linked_shot_id ? `镜头 ${row.linked_shot_id}` : "未关联镜头",
      importedAt: row.created_at
    }));
  }

  private listAgentConversations(projectId: string): AgentConversation[] {
    this.ensureActiveAgentConversation(projectId);
    const rows = this.db
      .prepare(
        `SELECT
           agent_conversations.*,
           COUNT(agent_messages.id) AS message_count
         FROM agent_conversations
         LEFT JOIN agent_messages ON agent_messages.conversation_id = agent_conversations.id
         WHERE agent_conversations.project_id = ?
         GROUP BY agent_conversations.id
         ORDER BY agent_conversations.updated_at DESC, agent_conversations.created_at DESC`
      )
      .all(projectId) as AgentConversationRecord[];
    return rows.map(mapAgentConversation);
  }

  private ensureActiveAgentConversation(projectId: string): AgentConversationRecord {
    this.getProjectRecord(projectId);
    const existing = this.db
      .prepare("SELECT * FROM agent_conversations WHERE project_id = ? ORDER BY updated_at DESC, created_at DESC LIMIT 1")
      .get(projectId) as AgentConversationRecord | undefined;

    if (existing) {
      this.assignOrphanAgentMessages(projectId, existing.id);
      return existing;
    }

    const firstMessage = this.db
      .prepare("SELECT * FROM agent_messages WHERE project_id = ? ORDER BY created_at ASC LIMIT 1")
      .get(projectId) as AgentMessageRecord | undefined;
    const now = new Date().toISOString();
    const conversationId = randomUUID();
    const createdAt = firstMessage?.created_at ?? now;
    const title = firstMessage?.role === "user" ? createAgentConversationTitle(firstMessage.content) : defaultAgentConversationTitle;
    this.db
      .prepare("INSERT INTO agent_conversations (id, project_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run(conversationId, projectId, title, createdAt, now);
    this.assignOrphanAgentMessages(projectId, conversationId);
    return {
      id: conversationId,
      project_id: projectId,
      title,
      unread_completion: 0,
      created_at: createdAt,
      updated_at: now
    };
  }

  private ensureProjectAgentConversation(projectId: string, conversationId: string): AgentConversationRecord {
    this.ensureActiveAgentConversation(projectId);
    const conversation = this.db
      .prepare("SELECT * FROM agent_conversations WHERE id = ? AND project_id = ?")
      .get(conversationId, projectId) as AgentConversationRecord | undefined;
    if (!conversation) throw new Error(`Agent conversation not found: ${conversationId}`);
    return conversation;
  }

  private assignOrphanAgentMessages(projectId: string, conversationId: string): void {
    this.db.prepare("UPDATE agent_messages SET conversation_id = ? WHERE project_id = ? AND conversation_id IS NULL").run(conversationId, projectId);
  }

  private touchAgentConversation(projectId: string, conversationId: string): void {
    const conversation = this.ensureProjectAgentConversation(projectId, conversationId);
    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE agent_conversations SET title = ?, updated_at = ? WHERE id = ? AND project_id = ?")
      .run(conversation.title || defaultAgentConversationTitle, now, conversationId, projectId);
  }

  private listAgentMessages(projectId: string, conversationId: string): AgentMessage[] {
    this.ensureProjectAgentConversation(projectId, conversationId);
    const rows = this.db
      .prepare("SELECT * FROM agent_messages WHERE project_id = ? AND conversation_id = ? ORDER BY created_at ASC")
      .all(projectId, conversationId) as AgentMessageRecord[];
    return rows.map((row) => {
      const content = legacyDefaultAgentMessages.has(row.content) ? defaultAgentMessage : row.content;
      const events = parseAgentEvents(row.events_json);
      return {
        id: row.id,
        conversationId: row.conversation_id ?? undefined,
        role: row.role,
        content,
        createdAt: row.created_at,
        attachments: parseAgentMessageAttachments(row.attachments_json),
        events,
        runStatus: parseRunStatus(row.run_status),
        clientRunId: row.client_run_id ?? undefined,
        agentCliId: parseAgentCliId(row.agent_cli_id) ?? inferAgentCliIdFromAgentMessage(content, events),
        operationConfirmation: parseAgentOperationConfirmation(row.operation_confirmation_json)
      };
    });
  }

  private createProjectFolder(name: string, id: string): string {
    const folder = join(this.projectRoot, `${sanitizeFileName(name)}-${id.slice(0, 8)}`);
    mkdirSync(join(folder, "assets"), { recursive: true });
    return folder;
  }

  private getProjectStoryboardSkill(projectId: string, interfaceLanguage?: InterfaceLanguage): ProjectSkill {
    return mapSkill(this.getSkillRecordOrDefault(this.getLocalizedStoryboardSkillId(this.getStoryboardSkillId(projectId), interfaceLanguage)));
  }

  private getProjectTaste(projectId: string): ProjectTaste {
    const project = this.getProjectRecord(projectId);
    return mapTaste(this.getTasteRecordOrDefault(project.taste_id ?? defaultTasteId));
  }

  private getStoryboardSkillId(projectId: string): string {
    const settings = this.db
      .prepare("SELECT storyboard_skill_id FROM storyboard_settings WHERE project_id = ?")
      .get(projectId) as Pick<SettingsRecord, "storyboard_skill_id"> | undefined;
    if (settings?.storyboard_skill_id) return settings.storyboard_skill_id;
    const project = this.getProjectRecord(projectId);
    return this.getTemplate(project.template_id).storyboardSkillId;
  }

  private getSkillRecord(skillId: string): SkillRecord {
    this.ensureDefaultSkills();
    const row = this.db.prepare("SELECT * FROM skills WHERE id = ?").get(skillId) as SkillRecord | undefined;
    if (!row) throw new Error(`SKILL not found: ${skillId}`);
    return row;
  }

  private assertUniqueUserTemplateName(name: string, excludedTemplateId?: string): void {
    const normalizedName = name.trim().toLocaleLowerCase();
    const rows = this.db.prepare("SELECT id, name FROM templates WHERE scope = 'user'").all() as Array<Pick<TemplateRecord, "id" | "name">>;
    const duplicate = rows.some((row) => row.id !== excludedTemplateId && row.name.trim().toLocaleLowerCase() === normalizedName);
    if (duplicate) throw new Error("已有同名分镜模板，请换一个名称。");
  }

  private getSkillRecordOrDefault(skillId: string): SkillRecord {
    this.ensureDefaultSkills();
    return (this.db.prepare("SELECT * FROM skills WHERE id = ?").get(skillId) as SkillRecord | undefined) ?? this.getSkillRecord(storyboardSkillId);
  }

  private getTasteRecordOrDefault(tasteId?: string | null): TasteRecord {
    this.ensureDefaultTastes();
    const normalizedTasteId = tasteId?.trim() || defaultTasteId;
    const row = this.db.prepare("SELECT * FROM tastes WHERE id = ?").get(normalizedTasteId) as TasteRecord | undefined;
    if (row) return row;
    return this.db.prepare("SELECT * FROM tastes WHERE id = ?").get(defaultTasteId) as TasteRecord;
  }

  private getTemplate(templateId: string, interfaceLanguage?: InterfaceLanguage): ProjectTemplate {
    const normalizedTemplateId = legacyDefaultTemplateIds.has(templateId) ? defaultTemplateId : templateId;
    const systemSeed = getSystemTemplateSeed(normalizedTemplateId);
    if (systemSeed) {
      this.ensureDefaultSkills();
      return buildSystemProjectTemplate(systemSeed, interfaceLanguage, (targetSkillId) => {
        const skill = this.getSkillRecordOrDefault(targetSkillId);
        return { id: skill.id, name: skill.name };
      });
    }
    const row = this.db.prepare("SELECT * FROM templates WHERE id = ?").get(normalizedTemplateId) as TemplateRecord | undefined;
    if (!row) return this.getDefaultTemplate(interfaceLanguage);
    return mapTemplate(row, this.getTemplateSkillName(row.storyboard_skill_id, interfaceLanguage), interfaceLanguage);
  }

  private getDefaultTemplate(interfaceLanguage?: InterfaceLanguage): ProjectTemplate {
    const defaultSeed = getSystemTemplateSeed(defaultTemplateId)!;
    this.ensureDefaultSkills();
    return buildSystemProjectTemplate(defaultSeed, interfaceLanguage, (targetSkillId) => {
      const skill = this.getSkillRecordOrDefault(targetSkillId);
      return { id: skill.id, name: skill.name };
    });
  }

  private getTemplateSkillName(skillId: string, interfaceLanguage?: InterfaceLanguage): string {
    return this.getSkillRecordOrDefault(this.getLocalizedStoryboardSkillId(skillId, interfaceLanguage)).name;
  }

  private getDefaultStoryboardSkillId(interfaceLanguage?: InterfaceLanguage): string {
    return getStoryboardTemplateLanguage(interfaceLanguage) === "zh" ? chineseStoryboardSkillId : storyboardSkillId;
  }

  private getLocalizedStoryboardSkillId(skillId: string, interfaceLanguage?: InterfaceLanguage): string {
    return isSystemStoryboardSkillId(skillId) ? getLocalizedSystemStoryboardSkillId(skillId, interfaceLanguage) : skillId;
  }

  private ensureDefaultSkills(): void {
    const now = new Date().toISOString();
    const seeds = getSystemStoryboardSkillSeeds();
    const insert = this.db.prepare(
      "INSERT INTO skills (id, name, description, content, icon_id, gradient_id, scope, locked, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    const update = this.db.prepare("UPDATE skills SET name = ?, description = ?, content = ?, icon_id = ?, gradient_id = ?, scope = 'system', locked = 1, updated_at = ? WHERE id = ?");
    const tx = this.db.transaction(() => {
      seeds.forEach((seed) => {
        const existing = this.db.prepare("SELECT * FROM skills WHERE id = ?").get(seed.id) as SkillRecord | undefined;
        if (!existing) {
          insert.run(seed.id, seed.name, seed.description, seed.content, seed.iconId, seed.gradientId, "system", 1, now, now);
          return;
        }
        if (
          existing.scope !== "system" ||
          existing.locked !== 1 ||
          existing.name !== seed.name ||
          existing.description !== seed.description ||
          existing.content !== seed.content ||
          existing.icon_id !== seed.iconId ||
          existing.gradient_id !== seed.gradientId
        ) {
          update.run(seed.name, seed.description, seed.content, seed.iconId, seed.gradientId, now, seed.id);
        }
      });
    });
    tx();
  }

  private ensureDefaultTastes(): void {
    const now = new Date().toISOString();
    const systemTasteIds = systemTasteSeeds.map((taste) => taste.id);
    const systemTasteIdPlaceholders = systemTasteIds.map(() => "?").join(", ");
    const insert = this.db.prepare(
      "INSERT INTO tastes (id, name, description, content, source_url, preview_json, scope, locked, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'system', 1, ?, ?)"
    );
    const update = this.db.prepare(
      "UPDATE tastes SET name = ?, description = ?, content = ?, source_url = ?, preview_json = ?, scope = 'system', locked = 1, updated_at = ? WHERE id = ?"
    );
    const deleteStaleSystemTastes = this.db.prepare(`DELETE FROM tastes WHERE scope = 'system' AND id NOT IN (${systemTasteIdPlaceholders})`);

    const tx = this.db.transaction(() => {
      systemTasteSeeds.forEach((taste) => {
        const previewJson = JSON.stringify(taste.preview);
        const existing = this.db.prepare("SELECT * FROM tastes WHERE id = ?").get(taste.id) as TasteRecord | undefined;
        if (!existing) {
          insert.run(taste.id, taste.name, taste.description, taste.content, taste.sourceUrl, previewJson, now, now);
          return;
        }
        if (
          existing.name !== taste.name ||
          existing.description !== taste.description ||
          existing.content !== taste.content ||
          existing.source_url !== taste.sourceUrl ||
          existing.preview_json !== previewJson ||
          existing.scope !== "system" ||
          existing.locked !== 1
        ) {
          update.run(taste.name, taste.description, taste.content, taste.sourceUrl, previewJson, now, taste.id);
        }
      });
      deleteStaleSystemTastes.run(...systemTasteIds);
    });
    tx();
  }

  private ensureProjectTasteAssignments(): void {
    const rows = this.db.prepare("SELECT id, taste_id FROM projects").all() as Array<{ id: string; taste_id?: string | null }>;
    if (rows.length === 0) return;
    const existingTasteRows = this.db.prepare("SELECT id FROM tastes").all() as Array<{ id: string }>;
    const validTasteIds = new Set([...systemTasteSeeds.map((taste) => taste.id), ...existingTasteRows.map((taste) => taste.id)]);
    const update = this.db.prepare("UPDATE projects SET taste_id = ? WHERE id = ?");
    const tx = this.db.transaction(() => {
      rows.forEach((row) => {
        if (row.taste_id && validTasteIds.has(row.taste_id)) return;
        update.run(defaultTasteId, row.id);
      });
    });
    tx();
  }

  private syncTutorialProjectLocale(project: ProjectRecord, interfaceLanguage?: InterfaceLanguage, options: { syncScript?: boolean } = {}): void {
    if (!isTutorialProjectRecord(project)) return;
    const targetLocale = this.resolveTutorialProjectLocale(project, interfaceLanguage);
    const targetInterfaceLanguage = getTutorialInterfaceLanguage(targetLocale);
    const nextName = getTutorialProjectName(targetInterfaceLanguage);
    const nextScriptHtml = normalizeScriptARollTags(getTutorialScriptHtml(targetInterfaceLanguage));
    const currentScriptHtml = this.getScriptHtml(project.id);
    const currentScriptPlainText = stripHtml(currentScriptHtml).trim();
    const canReplaceScript = options.syncScript !== false && (isKnownTutorialScript(currentScriptHtml) || currentScriptPlainText.length === 0);
    const now = new Date().toISOString();
    const tx = this.db.transaction(() => {
      if (project.name !== nextName && isManagedTutorialProjectName(project.name)) {
        this.db.prepare("UPDATE projects SET name = ?, updated_at = ? WHERE id = ?").run(nextName, now, project.id);
      }
      if (canReplaceScript && normalizeScriptARollTags(currentScriptHtml) !== nextScriptHtml) {
        this.db
          .prepare("UPDATE scripts SET html = ?, plain_text = ?, updated_at = ? WHERE project_id = ?")
          .run(nextScriptHtml, stripHtml(nextScriptHtml), now, project.id);
      }
      const settings = this.getSettings(project.id);
      const nextColumns = ensureStoryboardPromptColumns(getDefaultStoryboardColumns(targetInterfaceLanguage), targetInterfaceLanguage);
      const nextColumnsJson = JSON.stringify(nextColumns);
      if (settings.columns_json !== nextColumnsJson && isManagedTutorialColumnsJson(settings.columns_json)) {
        this.db
          .prepare("UPDATE storyboard_settings SET columns_json = ?, updated_at = ? WHERE project_id = ?")
          .run(nextColumnsJson, now, project.id);
      }
    });
    tx();
  }

  private resolveTutorialProjectLocale(project: ProjectRecord, interfaceLanguage?: InterfaceLanguage): TutorialLocale {
    const projectLocale = getTutorialProjectLocaleForProjectId(project.id);
    if (projectLocale) return projectLocale;
    if (interfaceLanguage !== undefined) return getTutorialLocale(interfaceLanguage);
    const rowsLocale = inferTutorialStoryboardRowsLocale(this.listRows(project.id));
    if (rowsLocale) return rowsLocale;
    return inferTutorialScriptLocale(this.getScriptHtml(project.id));
  }

  private syncTutorialStoryboardRowsToScriptLanguage(project: ProjectRecord, interfaceLanguage?: InterfaceLanguage): void {
    const currentShotRecords = this.listShotRecords(project.id);
    const currentRows = currentShotRecords.map(mapShotRecord);
    if (!areTutorialStoryboardRows(currentRows) && !areManagedTutorialStoryboardRows(currentRows)) return;
    const scriptLocale = this.resolveTutorialProjectLocale(project, interfaceLanguage);
    const currentRowsLocale = inferTutorialStoryboardRowsLocale(currentRows);
    if (currentRowsLocale === null || currentRowsLocale === scriptLocale) return;
    this.replaceTutorialStoryboardRows(project, getTutorialStoryboardRowsForLocale(scriptLocale).slice(0, currentRows.length), scriptLocale, currentShotRecords);
  }

  private ensureTutorialStoryboardContent(project: ProjectRecord, locale: TutorialLocale): void {
    const currentRows = this.listRows(project.id);
    const sourceRows = getTutorialStoryboardRowsForLocale(locale);
    if (currentRows.length >= sourceRows.length) return;

    if (currentRows.length > 0 && !hasOfficialTutorialRowIdPrefix(currentRows, sourceRows)) return;
    this.replaceRows(project.id, [...currentRows, ...sourceRows.slice(currentRows.length)]);
  }

  private assertUserProject(projectId: string, message: string): void {
    const project = this.getProjectRecord(projectId);
    if (isTutorialProjectRecord(project)) throw new Error(message);
  }

  private touchProject(projectId: string): void {
    this.db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(new Date().toISOString(), projectId);
  }
}

function mapProject(row: ProjectRecord): ProjectSummary {
  return {
    id: row.id,
    kind: row.kind === "tutorial" ? "tutorial" : "user",
    name: row.name,
    icon: row.icon,
    templateId: legacyDefaultTemplateIds.has(row.template_id) ? defaultTemplateId : row.template_id,
    tasteId: row.taste_id || defaultTasteId,
    imageRatio: normalizeImageRatio(row.image_ratio),
    localPath: row.local_path,
    cloudProjectId: row.cloud_project_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at ?? null,
    deletedAt: row.deleted_at ?? null
  };
}

function isTutorialProjectRecord(row: Pick<ProjectRecord, "id" | "kind">): boolean {
  return row.kind === "tutorial" || isTutorialProjectId(row.id);
}

const tutorialInterfaceLanguages: InterfaceLanguage[] = ["zh-CN", "zh-TW", "en"];

function getTutorialInterfaceLanguage(locale: TutorialLocale): InterfaceLanguage {
  return locale === "zh" ? "zh-CN" : "en";
}

function isManagedTutorialProjectName(name: string): boolean {
  const normalizedName = name.trim();
  if (!normalizedName) return true;
  return tutorialInterfaceLanguages.some((language) => normalizedName === getTutorialProjectName(language));
}

function isManagedTutorialColumnsJson(columnsJson: string): boolean {
  return tutorialInterfaceLanguages.some((language) => {
    const columns = ensureStoryboardPromptColumns(getDefaultStoryboardColumns(language), language);
    return columnsJson === JSON.stringify(columns);
  });
}

function isTutorialPlaceholderAsset(project: ProjectRecord, row: AssetRecord): boolean {
  if (/^tutorial-(?:image|video|shot)-/i.test(row.id)) return true;

  const fileName = row.file_name.toLowerCase();
  if (/^tutorial-(?:image|video|shot)-/i.test(fileName)) return true;
  if (fileName.includes("mkboard-onboarding-demo") || fileName.includes("onboarding-demo") || fileName.includes("demo-asset")) return true;

  if (!row.local_path || !isPathInside(project.local_path, row.local_path) || !existsSync(row.local_path)) return false;

  try {
    const stats = statSync(row.local_path);
    if (!stats.isFile() || stats.size > 250_000) return false;
    const content = readFileSync(row.local_path).toString("utf8");
    return content.includes("MkBoard onboarding demo asset") || content.includes("Tutorial shot ") || content.includes("A-ROLL 示例") || content.includes("A-ROLL sample");
  } catch {
    return false;
  }
}

function hasOfficialTutorialRowIdPrefix(currentRows: StoryboardRow[], sourceRows: StoryboardRow[]): boolean {
  if (currentRows.length === 0 || currentRows.length >= sourceRows.length) return false;
  return currentRows.every((row, index) => row.id === sourceRows[index]?.id);
}

function resolveTutorialBundledAssetPath(relativePath: string): string | null {
  const normalizedPath = relativePath
    .split(/[\\/]+/g)
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
  if (!normalizedPath) return null;

  const devRoot = join(__dirname, "../../resources/tutorial-assets");
  const packagedRoot = typeof process.resourcesPath === "string" ? join(process.resourcesPath, "tutorial-assets") : "";
  const roots = process.env.ELECTRON_RENDERER_URL ? [devRoot, packagedRoot] : [packagedRoot, devRoot];
  for (const root of roots) {
    if (!root) continue;
    const candidate = join(root, normalizedPath);
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function getTutorialGuideMediaAssetId(kind: "image" | "video", rowId: string): string {
  return `mkb-guide-${kind}-${getTutorialGuideMediaRowSlug(rowId)}`;
}

function getTutorialGuideMediaRowSlug(rowId: string): string {
  return rowId.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "shot";
}

function isTutorialMediaRevealTarget(row: ShotRecord, kind: "image" | "video"): boolean {
  if (/(^|[^a-z])a\s*-?\s*roll([^a-z]|$)/i.test(row.scene)) return false;
  const method = getShotGenerationMethod(row);
  const customValues = parseJsonObject(row.custom_values_json);
  const prompt = customValues[kind === "image" ? "custom-1" : "custom-2"];
  if (!isMeaningfulTutorialPrompt(prompt)) return false;
  if (kind === "image") return method === "ChatGPT Image2" || method === "Seedance 2.0";
  return method === "Seedance 2.0" || method === "Hyperframes";
}

function getShotGenerationMethod(row: Pick<ShotRecord, "custom_values_json">): string {
  const customValues = parseJsonObject(row.custom_values_json);
  return typeof customValues["custom-3"] === "string" ? customValues["custom-3"].trim() : "";
}

function isHyperframesShotRecord(row: Pick<ShotRecord, "custom_values_json">): boolean {
  return getShotGenerationMethod(row).toLowerCase() === "hyperframes";
}

function isBundledTutorialMediaAssetId(assetId: string): boolean {
  return isBundledTutorialMediaAssetIdForLocale(assetId, "zh") || isBundledTutorialMediaAssetIdForLocale(assetId, "en");
}

function isBundledTutorialMediaAssetIdForLocale(assetId: string, locale: TutorialLocale): boolean {
  return getTutorialMediaAssetsForLocale(locale).some((asset) => asset.id === assetId);
}

function isAvailableTutorialUserAsset(asset: AssetRecord): boolean {
  if (isHttpUrl(asset.local_path)) return true;
  try {
    return statSync(asset.local_path).isFile();
  } catch {
    return false;
  }
}

function isMeaningfulTutorialPrompt(input: unknown): boolean {
  if (typeof input !== "string") return false;
  const value = input.trim();
  return Boolean(value && value !== "—" && value !== "-");
}

function createTutorialGuideSvg(row: ShotRecord, kind: "image" | "video", index: number): string {
  const label = kind === "image" ? "AI Image" : "AI Video";
  const title = `${label} ${String(index + 1).padStart(2, "0")}`;
  const description = stripHtml(row.content || row.scene || row.note).slice(0, 120);
  const accent = kind === "image" ? "#ffd45c" : "#7ed7ff";
  const secondary = kind === "image" ? "#f28b36" : "#7868ff";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#141821"/>
      <stop offset="55%" stop-color="#263142"/>
      <stop offset="100%" stop-color="${secondary}"/>
    </linearGradient>
  </defs>
  <rect width="1280" height="720" fill="url(#bg)"/>
  <rect x="70" y="70" width="1140" height="580" rx="36" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.26)" stroke-width="2"/>
  <circle cx="158" cy="154" r="34" fill="${accent}"/>
  <text x="218" y="148" fill="#ffffff" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="700">${escapeXml(title)}</text>
  <text x="218" y="196" fill="rgba(255,255,255,0.72)" font-family="Inter, Arial, sans-serif" font-size="22">${escapeXml(row.shot_number ? `Shot ${row.shot_number}` : "Generated guide asset")}</text>
  <text x="110" y="392" fill="#ffffff" font-family="Inter, Arial, sans-serif" font-size="42" font-weight="700">${escapeXml(description || label)}</text>
  <text x="110" y="462" fill="rgba(255,255,255,0.68)" font-family="Inter, Arial, sans-serif" font-size="24">MkBoard guide asset</text>
</svg>`;
}

function escapeXml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function mapOnboardingState(row: OnboardingStateRecord): OnboardingState {
  return {
    appVersion: row.app_version,
    contentVersion: row.content_version,
    tutorialProjectId: row.tutorial_project_id,
    currentStep: parseOnboardingStepId(row.current_step) ?? "settings",
    completedStepIds: parseOnboardingStepIds(row.completed_step_ids_json),
    dismissedStepIds: parseOnboardingStepIds(row.dismissed_step_ids_json),
    startedAt: row.started_at ?? null,
    completedAt: row.completed_at ?? null,
    updatedAt: row.updated_at
  };
}

function parseOnboardingStepIds(input: string): OnboardingStepId[] {
  try {
    const parsed = JSON.parse(input);
    if (!Array.isArray(parsed)) return [];
    const result: OnboardingStepId[] = [];
    parsed.forEach((item) => {
      const stepId = parseOnboardingStepId(item);
      if (stepId && !result.includes(stepId)) result.push(stepId);
    });
    return result;
  } catch {
    return [];
  }
}

function parseOnboardingStepId(input: unknown): OnboardingStepId | null {
  if (
    input === "settings" ||
    input === "hyperframes" ||
    input === "create_project" ||
    input === "script" ||
    input === "storyboard" ||
    input === "images" ||
    input === "videos" ||
    input === "preview" ||
    input === "export"
  ) {
    return input;
  }
  return null;
}

function mapSkill(row: SkillRecord): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    content: row.content,
    iconId: normalizeSkillVisualId(row.icon_id, row.locked ? defaultSystemSkillIconId : defaultSkillIconId),
    gradientId: normalizeSkillVisualId(row.gradient_id, row.locked ? defaultSystemSkillGradientId : defaultSkillGradientId),
    scope: row.scope,
    locked: Boolean(row.locked),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeSkillVisualId(input: unknown, fallback: string): string {
  if (typeof input !== "string") return fallback;
  const value = input.trim();
  return value ? value.slice(0, 80) : fallback;
}

function mapTaste(row: TasteRecord): Taste {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    content: row.content,
    sourceUrl: row.source_url,
    preview: parseTastePreview(row.preview_json),
    scope: row.scope,
    locked: Boolean(row.locked),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function compareTasteRecords(a: TasteRecord, b: TasteRecord): number {
  const lockedDelta = b.locked - a.locked;
  if (lockedDelta !== 0) return lockedDelta;

  const aSystemOrder = systemTasteSortOrder.get(a.id);
  const bSystemOrder = systemTasteSortOrder.get(b.id);
  if (aSystemOrder !== undefined || bSystemOrder !== undefined) {
    const systemOrderDelta = (aSystemOrder ?? Number.MAX_SAFE_INTEGER) - (bSystemOrder ?? Number.MAX_SAFE_INTEGER);
    if (systemOrderDelta !== 0) return systemOrderDelta;
  }

  const createdDelta = a.created_at.localeCompare(b.created_at);
  if (createdDelta !== 0) return createdDelta;
  return b.updated_at.localeCompare(a.updated_at);
}

function mapTemplate(row: TemplateRecord, storyboardSkillName: string, interfaceLanguage?: InterfaceLanguage): ProjectTemplate {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    scope: row.scope,
    columns: parseTemplateColumns(row.columns_json, interfaceLanguage),
    storyboardSkillId: row.storyboard_skill_id,
    storyboardSkillName,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapStoryboardVideoTaskRecord(row: StoryboardVideoTaskRecord): StoryboardActiveVideoGenerationTask {
  return {
    taskId: row.id,
    rowId: row.row_id,
    method: row.method,
    status: row.status,
    provider: row.provider ?? undefined,
    providerTaskId: row.provider_task_id ?? undefined,
    assetId: row.asset_id ?? undefined,
    fileName: row.file_name ?? undefined,
    errorMessage: row.error_message ?? undefined,
    startedAt: row.started_at ?? undefined,
    finishedAt: getStoryboardVideoTaskFinishedAt(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function getStoryboardVideoTaskFinishedAt(row: StoryboardVideoTaskRecord): string | undefined {
  return row.completed_at ?? row.failed_at ?? row.cancelled_at ?? (row.status === "succeeded" || row.status === "failed" || row.status === "cancelled" ? row.updated_at : undefined);
}

function parseTastePreview(input: string): TastePreview {
  try {
    const parsed = JSON.parse(input) as Partial<TastePreview>;
    if (parsed && typeof parsed.background === "string" && typeof parsed.foreground === "string" && typeof parsed.accent === "string") {
      return {
        background: parsed.background,
        foreground: parsed.foreground,
        accent: parsed.accent
      };
    }
  } catch {
    // Fall through to default preview.
  }
  return {
    background: "linear-gradient(135deg, #111318 0%, #2e3f5f 48%, #f2d16b 100%)",
    foreground: "#fff7df",
    accent: "#f2d16b"
  };
}

function parseTemplateColumns(columnsJson: string, interfaceLanguage?: InterfaceLanguage): StoryboardColumn[] {
  try {
    const parsed = JSON.parse(columnsJson) as StoryboardColumn[];
    if (Array.isArray(parsed) && parsed.length > 0) return ensureStoryboardPromptColumns(parsed, interfaceLanguage);
  } catch {
    // Fall through to defaults.
  }
  return ensureStoryboardPromptColumns(getDefaultStoryboardColumns(interfaceLanguage), interfaceLanguage);
}

function parseColumnsJson(columnsJson: string): StoryboardColumn[] | null {
  try {
    const parsed = JSON.parse(columnsJson) as StoryboardColumn[];
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {
    // Invalid legacy data is left unchanged by migration backfills.
  }
  return null;
}

function createAssetPreviewUrl(row: Pick<AssetRecord, "id" | "kind" | "file_name" | "local_path" | "content_hash">): string {
  if (isHttpUrl(row.local_path)) {
    // Tutorial media is the only asset kind served from the mkboard CDN. Apply
    // the matching R2 optimization flag (video -> optimize=video, image -> quality).
    return row.kind === "video" ? withMkboardR2VideoOptimization(row.local_path) : withMkboardR2ImageQuality(row.local_path);
  }
  const baseUrl = `${assetPreviewScheme}://asset/${encodeURIComponent(row.id)}/${encodeURIComponent(row.file_name)}`;
  const version = typeof row.content_hash === "string" ? row.content_hash.trim() : "";
  return version ? `${baseUrl}?v=${encodeURIComponent(version)}` : baseUrl;
}

function createAssetFirstFrameUrl(row: Pick<AssetRecord, "id" | "kind" | "file_name" | "local_path" | "content_hash">): string {
  const previewUrl = createAssetPreviewUrl(row);
  return `${previewUrl}${previewUrl.includes("?") ? "&" : "?"}firstFrame=1&cv=smart2`;
}

function createAssetPosterUrl(row: Pick<AssetRecord, "id" | "kind" | "file_name" | "local_path" | "poster_path" | "content_hash">): string | null {
  if (!row.poster_path) return null;
  if (isHttpUrl(row.poster_path)) return withMkboardR2ImageQuality(row.poster_path);
  const previewUrl = createAssetPreviewUrl(row);
  const posterVersion = getLocalPosterVersion(row.poster_path);
  return `${previewUrl}${previewUrl.includes("?") ? "&" : "?"}poster=1${posterVersion ? `&pv=${encodeURIComponent(posterVersion)}` : ""}`;
}

function isHttpUrl(value: string | null | undefined): boolean {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function getLocalPosterVersion(posterPath: string): string {
  try {
    if (!existsSync(posterPath)) return "";
    const stats = statSync(posterPath);
    return stats.isFile() ? `${stats.size}-${Math.round(stats.mtimeMs)}` : "";
  } catch {
    return "";
  }
}

function isTailFramePosterPath(posterPath: string | null | undefined): boolean {
  return typeof posterPath === "string" && /(?:^|[/\\])[^/\\]*-tail-poster\.[^/\\.]+$/iu.test(posterPath);
}

function hashFile(filePath: string): string {
  return hashBuffer(readFileSync(filePath));
}

function hashBuffer(buffer: Uint8Array): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function pushUniqueId(target: string[], id: string): void {
  if (!target.includes(id)) target.push(id);
}

function mapAgentConversation(row: AgentConversationRecord): AgentConversation {
  return {
    id: row.id,
    title: row.title || defaultAgentConversationTitle,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messageCount: Number(row.message_count ?? 0),
    hasUnreadCompletion: row.unread_completion === 1
  };
}

function isUnreadAgentCompletionStatus(status: string | null | undefined): boolean {
  return status === "succeeded" || status === "failed";
}

function createAgentConversationTitle(content: string): string {
  const normalized = content
    .replace(/["'“”‘’`]/g, "")
    .replace(/[。！？!?，,；;：:、|/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized || isDefaultAgentConversationTitle(normalized)) return defaultAgentConversationTitle;
  return Array.from(normalized).slice(0, agentConversationTitleMaxLength).join("");
}

function isDefaultAgentConversationTitle(title: string | null | undefined): boolean {
  return legacyDefaultAgentConversationTitles.includes((title || defaultAgentConversationTitle) as (typeof legacyDefaultAgentConversationTitles)[number]);
}

function isPathInside(root: string, target: string): boolean {
  const normalizedRoot = resolve(root);
  const normalizedTarget = resolve(target);
  const relativePath = relative(normalizedRoot, normalizedTarget);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function prepareGeneratedVideoPoster(
  project: ProjectRecord,
  assetsDir: string,
  videoFileName: string,
  sourcePath?: string | null,
  existingPosterPath?: string | null
): { sourcePath: string | null; path: string | null; indexedPath: string | null } {
  if (!sourcePath || !existsSync(sourcePath)) return { sourcePath: null, path: null, indexedPath: null };
  const stats = statSync(sourcePath);
  if (!stats.isFile()) return { sourcePath: null, path: null, indexedPath: null };
  const reusablePosterPath = existingPosterPath && isPathInside(project.local_path, existingPosterPath) && isTailFramePosterPath(existingPosterPath) ? existingPosterPath : null;
  const videoBaseName = basename(videoFileName, extname(videoFileName)) || "video";
  const posterPath = reusablePosterPath ?? join(assetsDir, uniqueAssetFileName(assetsDir, `${videoBaseName}-tail-poster.jpg`));
  return {
    sourcePath,
    path: posterPath,
    indexedPath: relative(project.local_path, posterPath)
  };
}

async function prepareVideoAssetPoster(
  project: ProjectRecord,
  assetsDir: string,
  videoFileName: string,
  videoPath: string,
  existingPosterPath?: string | null
): Promise<{ path: string | null; indexedPath: string | null }> {
  if (!videoPath || !existsSync(videoPath)) return { path: null, indexedPath: null };
  const stats = statSync(videoPath);
  if (!stats.isFile()) return { path: null, indexedPath: null };
  const reusablePosterPath = existingPosterPath && isPathInside(project.local_path, existingPosterPath) && isTailFramePosterPath(existingPosterPath) ? existingPosterPath : null;
  const videoBaseName = basename(videoFileName, extname(videoFileName)) || "video";
  const posterPath = reusablePosterPath ?? join(assetsDir, uniqueAssetFileName(assetsDir, `${videoBaseName}-tail-poster.jpg`));
  const extractedPath = await extractVideoTailFrame(videoPath, posterPath);
  if (!extractedPath) return { path: null, indexedPath: null };
  return {
    path: extractedPath,
    indexedPath: relative(project.local_path, extractedPath)
  };
}

function removeProjectFile(project: ProjectRecord, filePath?: string | null): void {
  if (!filePath || !isPathInside(project.local_path, filePath) || !existsSync(filePath)) return;
  rmSync(filePath, { force: true });
}

function createId(input: string): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "project"}-${randomUUID().slice(0, 8)}`;
}

function sanitizeFileName(input: string): string {
  return (
    input
      .trim()
      .replace(/[/:*?"<>|\\]/g, "-")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "") || "MkBoard"
  );
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeScriptARollTags(html: string): string {
  return html
    .replace(/<span\b(?=[^>]*\bdata-mkboard-a-roll(?:\s*=\s*(?:"true"|'true'|true|""))?)[^>]*>([\s\S]*?)<\/span>/gi, "&lt;A&gt;$1&lt;/A&gt;")
    .replace(/<a\b(?=[^>]*\bdata-mkboard-a-roll(?:\s*=\s*(?:"true"|'true'|true|""))?)[^>]*>([\s\S]*?)<\/a>/gi, "&lt;A&gt;$1&lt;/A&gt;")
    .replace(/<a\b(?![^>]*\bhref=)[^>]*>([\s\S]*?)<\/a>/gi, "&lt;A&gt;$1&lt;/A&gt;");
}

function createAppleSampleProjectRows(): StoryboardRow[] {
  return [
    {
      id: randomUUID(),
      shot: "1",
      scene: "A-ROLL",
      duration: "8",
      content: "In 1976, Apple began with a simple but radical idea: personal computers should not be locked away for specialists.",
      note: "Presenter: open with a fast, curious social-media hook.",
      customValues: {
        "custom-1": "—",
        "custom-2": "—",
        "custom-3": ""
      }
    },
    {
      id: randomUUID(),
      shot: "2",
      scene: "B-ROLL",
      duration: "10",
      content: "Steve Jobs, Steve Wozniak, and Ronald Wayne started the company in California, turning a garage-sized dream into a business.",
      note: "Archival-style garage, early circuit boards, young founders mood, no real-person likeness required.",
      customValues: {
        "custom-1": "A cinematic archival-style garage workbench in 1970s California, early personal computer circuit boards, warm afternoon light, handmade startup atmosphere, realistic documentary photo look, no logos.",
        "custom-2": "Slow push across a 1970s garage workbench with computer parts, handwritten notes, and warm California light, documentary technology history mood.",
        "custom-3": "Seedance 2.0"
      }
    },
    {
      id: randomUUID(),
      shot: "3",
      scene: "B-ROLL",
      duration: "10",
      content: "The Apple II helped bring computing into homes, schools, and small businesses, proving that the computer could become personal.",
      note: "Retro classroom and desk setup, focus on the spread of personal computing.",
      customValues: {
        "custom-1": "Late 1970s classroom with a beige personal computer on a desk, students gathered around, retro educational technology atmosphere, soft film grain, realistic editorial style.",
        "custom-2": "Camera glides from a home desk to a classroom desk, showing early personal computers becoming part of everyday life, retro documentary pacing.",
        "custom-3": "Seedance 2.0"
      }
    },
    {
      id: randomUUID(),
      shot: "4",
      scene: "A-ROLL",
      duration: "9",
      content: "Then came 1984. The Macintosh made technology feel creative, visual, and human.",
      note: "Presenter: mark this as the first major turning point.",
      customValues: {
        "custom-1": "—",
        "custom-2": "—",
        "custom-3": ""
      }
    },
    {
      id: randomUUID(),
      shot: "5",
      scene: "B-ROLL",
      duration: "10",
      content: "Its graphical interface and mouse showed people that computers did not have to be cold command lines.",
      note: "Show GUI metaphorically without recreating a copyrighted interface exactly.",
      customValues: {
        "custom-1": "Minimal 1980s computer desk with a small beige monitor, mouse, and simple graphical windows represented abstractly, clean studio lighting, retro technology editorial frame.",
        "custom-2": "Close-up of a hand moving a mouse beside a retro computer as simple abstract windows appear on screen, 1980s product-film feeling.",
        "custom-3": "Seedance 2.0"
      }
    },
    {
      id: randomUUID(),
      shot: "6",
      scene: "B-ROLL",
      duration: "10",
      content: "But Apple also struggled. Jobs left, the product line became confusing, and by the mid-1990s the company was fighting to stay relevant.",
      note: "Mood shifts darker: clutter, confusion, product boxes, financial pressure.",
      customValues: {
        "custom-1": "1990s corporate office table crowded with confusing computer product boxes, dim fluorescent light, anxious business atmosphere, documentary still, no readable brand logos.",
        "custom-2": "A slow pan over a cluttered 1990s tech office desk with overlapping product brochures and fading screen glow, tense comeback-story mood.",
        "custom-3": "Seedance 2.0"
      }
    },
    {
      id: randomUUID(),
      shot: "7",
      scene: "A-ROLL",
      duration: "10",
      content: "The comeback began when Jobs returned in 1997. Apple simplified, focused, and rebuilt its identity around design and clarity.",
      note: "Presenter: concise reset, confident tone.",
      customValues: {
        "custom-1": "—",
        "custom-2": "—",
        "custom-3": ""
      }
    },
    {
      id: randomUUID(),
      shot: "8",
      scene: "B-ROLL",
      duration: "10",
      content: "The colorful iMac made computers feel playful again. The iPod and iTunes changed how people carried and bought music.",
      note: "Use product-era color and music energy without relying on official product imagery.",
      customValues: {
        "custom-1": "Turn-of-the-millennium desk scene with colorful translucent computer shapes and a pocket music player silhouette, bright optimistic product-design mood, editorial realism.",
        "custom-2": "Energetic montage of colorful translucent desktop shapes, headphones, and a pocket music player silhouette moving through clean white space, early 2000s tech culture.",
        "custom-3": "Seedance 2.0"
      }
    },
    {
      id: randomUUID(),
      shot: "9",
      scene: "A-ROLL",
      duration: "8",
      content: "Then the iPhone arrived, and the definition of a phone changed almost overnight.",
      note: "Presenter: make this line punchy, with a short pause after iPhone.",
      customValues: {
        "custom-1": "—",
        "custom-2": "—",
        "custom-3": ""
      }
    },
    {
      id: randomUUID(),
      shot: "10",
      scene: "B-ROLL",
      duration: "11",
      content: "With the App Store, that pocket device became a platform for work, maps, photos, banking, games, and everyday life.",
      note: "Avoid exact app icons; show the platform idea through abstract tiles.",
      customValues: {
        "custom-1": "Modern smartphone silhouette surrounded by floating abstract app tiles for maps, photos, work, finance, and games, clean editorial lighting, no real app icons or logos.",
        "custom-2": "Abstract app tiles orbit a modern smartphone silhouette, each tile becoming part of daily life scenes, smooth technology explainer motion.",
        "custom-3": "Seedance 2.0"
      }
    },
    {
      id: randomUUID(),
      shot: "11",
      scene: "B-ROLL",
      duration: "12",
      content: "Apple kept expanding into iPad, Apple Watch, services, privacy-focused software, and its own Apple Silicon chips.",
      note: "Ecosystem board: devices, chips, health, cloud services, privacy.",
      customValues: {
        "custom-1": "Premium technology ecosystem layout with tablet, watch silhouette, laptop, chip architecture diagram, cloud service symbols, and privacy lock motif, clean white editorial style, no brand logos.",
        "custom-2": "Smooth overhead camera move across a connected technology ecosystem: tablet, watch, laptop, chip diagram, cloud and privacy symbols linking together.",
        "custom-3": "Seedance 2.0"
      }
    },
    {
      id: randomUUID(),
      shot: "12",
      scene: "B-ROLL",
      duration: "12",
      content: "From a garage project to one of the world's most influential companies, Apple showed that technology wins when it feels personal.",
      note: "Closing hero image: personal technology as a human-centered experience.",
      customValues: {
        "custom-1": "Elegant closing editorial image of a glowing personal device on a simple desk, reflections of a garage, classroom, music, phone, and chip era subtly layered in the background, warm human-centered technology mood.",
        "custom-2": "A warm cinematic timeline transition from garage workbench to modern personal device on a desk, ending with calm human-centered technology atmosphere.",
        "custom-3": "Seedance 2.0"
      }
    }
  ];
}

function splitScriptIntoStoryboard(text: string): StoryboardRow[] {
  const chunks = text
    .split(/(?:\n{2,}|[。！？!?]\s*)/u)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .slice(0, 40);
  const source = chunks.length > 0 ? chunks : ["请在脚本 Tab 输入内容后重新生成分镜。"];
  return source.map((content, index) => ({
    id: randomUUID(),
    shot: String(index + 1),
    scene: inferStoryboardCategory(content, index),
    duration: "0",
    content,
    note: index === 0 ? "由脚本一键拆解生成，可继续编辑。" : ""
  }));
}

function createEmptyShotRecord(projectId: string, now: string): ShotRecord {
  return {
    id: randomUUID(),
    project_id: projectId,
    position: 0,
    shot_number: "",
    image_asset_id: null,
    image_asset_ids_json: "[]",
    scene: "",
    duration: "0",
    content: "",
    note: "",
    custom_values_json: "{}",
    created_at: now,
    updated_at: now
  };
}

function mapShotRecord(row: ShotRecord): StoryboardRow {
  const imageAssetIds = getShotMediaIds(row);
  return {
    id: row.id,
    shot: row.shot_number,
    scene: normalizeLegacyShotPlaceholder("scene", row.scene),
    duration: row.duration,
    content: normalizeLegacyShotPlaceholder("content", row.content),
    note: normalizeLegacyShotPlaceholder("note", row.note),
    imageAssetIds,
    imageAssetId: imageAssetIds[0] ?? null,
    customValues: parseJsonObject(row.custom_values_json)
  };
}

function resetStoryboardParseRowMedia(row: StoryboardRow): StoryboardRow {
  const customValues = { ...(row.customValues ?? {}) };
  [
    "aRollSampleHidden",
    PROMPT_PREVIEW_IMAGE_ASSET_ID_FIELD,
    PROMPT_PREVIEW_IMAGE_HIDDEN_FIELD,
    PROMPT_PREVIEW_VIDEO_ASSET_ID_FIELD,
    PROMPT_PREVIEW_VIDEO_HIDDEN_FIELD,
    STORYBOARD_MEDIA_SELECTION_TOUCHED_FIELD
  ].forEach((field) => delete customValues[field]);

  return {
    ...row,
    imageAssetIds: [],
    imageAssetId: null,
    customValues
  };
}

function normalizeLegacyShotPlaceholder(field: "scene" | "content" | "note", value: string): string {
  const trimmedValue = value.trim();
  if (field === "scene" && trimmedValue === "输入类别") return "";
  if (field === "content" && trimmedValue === "输入内容") return "";
  if (field === "note" && trimmedValue === "输入备注") return "";
  return value;
}

function normalizeShotIdSet(rowIds: string[]): Set<string> {
  if (!Array.isArray(rowIds)) return new Set();
  return new Set(rowIds.filter((rowId): rowId is string => typeof rowId === "string" && rowId.length > 0));
}

function normalizeIdList(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  const normalizedIds: string[] = [];
  ids.forEach((id) => {
    if (typeof id !== "string") return;
    const trimmedId = id.trim();
    if (!trimmedId || normalizedIds.includes(trimmedId)) return;
    normalizedIds.push(trimmedId);
  });
  return normalizedIds;
}

function getShotMediaIds(row: Pick<ShotRecord, "image_asset_id" | "image_asset_ids_json">): string[] {
  const parsedIds = parseJsonStringArray(row.image_asset_ids_json);
  return normalizeShotMediaIds(parsedIds.length > 0 ? parsedIds : row.image_asset_id ? [row.image_asset_id] : []);
}

function putGeneratedMediaAssetFirst(currentIds: string[], assetId: string): string[] {
  const normalizedAssetId = assetId.trim();
  if (!normalizedAssetId) return currentIds;
  return [normalizedAssetId, ...currentIds.filter((currentAssetId) => currentAssetId !== normalizedAssetId)].slice(0, maxShotMediaAssets);
}

function orderStoryboardMediaIdsByKind(assetIds: string[], assetsById: Map<string, Pick<AssetRecord, "kind">>): string[] {
  const images = assetIds.filter((assetId) => assetsById.get(assetId)?.kind === "image");
  const videos = assetIds.filter((assetId) => assetsById.get(assetId)?.kind === "video");
  const others = assetIds.filter((assetId) => {
    const kind = assetsById.get(assetId)?.kind;
    return kind !== "image" && kind !== "video";
  });
  return [...images, ...videos, ...others].slice(0, maxShotMediaAssets);
}

function areStringArraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function normalizeShotMediaIds(assetIds: unknown): string[] {
  if (!Array.isArray(assetIds)) return [];
  const normalizedIds: string[] = [];
  assetIds.forEach((assetId) => {
    if (typeof assetId !== "string") return;
    const trimmedId = assetId.trim();
    if (!trimmedId || normalizedIds.includes(trimmedId)) return;
    normalizedIds.push(trimmedId);
  });
  return normalizedIds.slice(0, maxShotMediaAssets);
}

function parseJsonStringArray(input?: string | null): string[] {
  if (!input) return [];
  try {
    const parsed = JSON.parse(input);
    if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    // Ignore malformed historical data.
  }
  return [];
}

function inferStoryboardCategory(content: string, index: number): string {
  if (/演示|录屏|截图|界面|产品|数据|图表|流程|画面|展示|动画|素材|环境|城市|街道|房间/u.test(content)) return "B-ROLL";
  if (/开头|钩子|总结|结尾|观点|我|我们|你|大家|说|讲|表达/u.test(content)) return "A-ROLL";
  return index % 4 === 0 ? "A-ROLL" : "B-ROLL";
}

function parseJsonObject(input: string): Record<string, string> {
  try {
    const parsed = JSON.parse(input);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, string>;
  } catch {
    // Ignore malformed historical data.
  }
  return {};
}

function parseAgentEvents(input?: string | null): AgentEvent[] {
  if (!input) return [];
  try {
    const parsed = JSON.parse(input) as AgentEvent[];
    if (Array.isArray(parsed)) return parsed.filter(isAgentEvent);
  } catch {
    // Ignore malformed historical data.
  }
  return [];
}

function parseAgentMessageAttachments(input?: string | null): AgentMessageAttachment[] {
  if (!input) return [];
  try {
    const parsed = JSON.parse(input) as unknown;
    return sanitizeAgentMessageAttachments(parsed);
  } catch {
    // Ignore malformed historical data.
  }
  return [];
}

function sanitizeAgentMessageAttachments(input: unknown): AgentMessageAttachment[] {
  if (!Array.isArray(input)) return [];
  const attachments: AgentMessageAttachment[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const attachment = item as Partial<AgentMessageAttachment>;
    if (typeof attachment.id !== "string" || typeof attachment.name !== "string" || typeof attachment.previewUrl !== "string") continue;
    if (attachment.kind !== "image" && attachment.kind !== "video" && attachment.kind !== "audio" && attachment.kind !== "archive" && attachment.kind !== "document" && attachment.kind !== "other") continue;
    attachments.push({
      id: attachment.id,
      name: attachment.name,
      kind: attachment.kind,
      previewUrl: attachment.previewUrl
    });
  }
  return attachments;
}

function parseAgentOperationConfirmation(input?: string | null): AgentOperationConfirmation | undefined {
  if (!input) return undefined;
  try {
    const parsed = JSON.parse(input) as Partial<AgentOperationConfirmation>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    const status = parseAgentOperationConfirmationStatus(parsed.status);
    if (!status) return undefined;
    if (
      typeof parsed.id !== "string" ||
      typeof parsed.clientRunId !== "string" ||
      typeof parsed.projectId !== "string" ||
      typeof parsed.conversationId !== "string" ||
      typeof parsed.userMessage !== "string" ||
      typeof parsed.createdAt !== "string" ||
      !Array.isArray(parsed.operations) ||
      !Array.isArray(parsed.rows)
    ) {
      return undefined;
    }
    return {
      id: parsed.id,
      clientRunId: parsed.clientRunId,
      projectId: parsed.projectId,
      conversationId: parsed.conversationId,
      operations: parsed.operations,
      userMessage: parsed.userMessage,
      rows: parsed.rows,
      createdAt: parsed.createdAt,
      status,
      error: typeof parsed.error === "string" ? parsed.error : undefined
    };
  } catch {
    // Ignore malformed historical data.
  }
  return undefined;
}

function parseRunStatus(input?: string | null): AgentRunStatus | undefined {
  if (input === "queued" || input === "running" || input === "succeeded" || input === "failed" || input === "canceled") return input;
  return undefined;
}

function parseAgentOperationConfirmationStatus(input: unknown): AgentOperationConfirmation["status"] | undefined {
  if (input === "pending" || input === "applying" || input === "confirmed" || input === "canceled" || input === "failed") return input;
  return undefined;
}

function parseAgentCliId(input?: string | null): AgentCliId | undefined {
  if (!input) return undefined;
  if (input === "gemini-cli") return "antigravity";
  if (
    input === "codex" ||
    input === "claude-code" ||
    input === "antigravity" ||
    input === "opencode" ||
    input === "cursor-agent" ||
    input === "kimi-cli" ||
    input.startsWith("custom:")
  ) {
    return input;
  }
  return undefined;
}

function inferAgentCliIdFromAgentMessage(content: string, events: AgentEvent[]): AgentCliId | undefined {
  const parts: string[] = [];
  if (content !== defaultAgentMessage) parts.push(content);
  for (const event of events) {
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

function isAgentEvent(value: unknown): value is AgentEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as { kind?: unknown };
  return (
    event.kind === "status" ||
    event.kind === "text" ||
    event.kind === "thinking" ||
    event.kind === "tool_use" ||
    event.kind === "tool_result" ||
    event.kind === "usage" ||
    event.kind === "error" ||
    event.kind === "raw"
  );
}

function uniqueAssetFileName(targetDir: string, originalName: string): string {
  const ext = extname(originalName);
  const base = basename(originalName, ext) || "asset";
  let candidate = `${sanitizeFileName(base)}${ext}`;
  let index = 1;
  while (existsSync(join(targetDir, candidate))) {
    candidate = `${sanitizeFileName(base)}-${index}${ext}`;
    index += 1;
  }
  return candidate;
}

function uniqueAssetFileNameExcluding(targetDir: string, originalName: string, excludedPath: string): string {
  const ext = extname(originalName);
  const base = basename(originalName, ext) || "asset";
  let candidate = `${sanitizeFileName(base)}${ext}`;
  let index = 1;
  while (existsSync(join(targetDir, candidate)) && resolve(join(targetDir, candidate)) !== resolve(excludedPath)) {
    candidate = `${sanitizeFileName(base)}-${index}${ext}`;
    index += 1;
  }
  return candidate;
}

function normalizeAssetFileName(input: string, fallback: string): string {
  const fallbackExt = extname(fallback);
  const rawFileName = basename(String(input || "").trim());
  const rawExt = extname(rawFileName);
  const base = basename(rawFileName || fallback, rawExt || fallbackExt);
  return `${sanitizeFileName(base)}${rawExt || fallbackExt}`;
}

function getAssetKind(fileName: string): AssetKind {
  const ext = extname(fileName).toLowerCase();
  if (
    [
      ".png",
      ".jpg",
      ".jpeg",
      ".webp",
      ".gif",
      ".bmp",
      ".tif",
      ".tiff",
      ".svg",
      ".avif",
      ".heic",
      ".heif",
      ".ico",
      ".apng",
      ".jxl",
      ".jp2",
      ".j2k",
      ".jpf",
      ".psd",
      ".psb",
      ".raw",
      ".dng",
      ".cr2",
      ".nef",
      ".arw",
      ".orf",
      ".raf",
      ".rw2",
      ".tga",
      ".exr",
      ".hdr"
    ].includes(ext)
  )
    return "image";
  if (
    [
      ".mp4",
      ".mov",
      ".webm",
      ".mkv",
      ".avi",
      ".m4v",
      ".mpg",
      ".mpeg",
      ".3gp",
      ".ogv",
      ".mts",
      ".m2ts",
      ".ts",
      ".wmv",
      ".flv",
      ".f4v",
      ".asf",
      ".vob",
      ".m2v",
      ".mpv",
      ".mxf",
      ".dv",
      ".divx",
      ".rm",
      ".rmvb"
    ].includes(ext)
  )
    return "video";
  if ([".mp3", ".wav", ".m4a", ".aac", ".flac"].includes(ext)) return "audio";
  if ([".zip", ".rar", ".7z", ".tar", ".gz"].includes(ext)) return "archive";
  if ([".md", ".txt", ".doc", ".docx", ".pdf", ".csv", ".json"].includes(ext)) return "document";
  return "other";
}

function isShotMediaKind(kind: AssetKind): boolean {
  return kind === "image" || kind === "video";
}

function formatFileSize(size: number): string {
  if (!size) return "未知大小";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
