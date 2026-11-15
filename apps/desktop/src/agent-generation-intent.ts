import type { StoryboardRow } from "./shared";

export type AgentMediaGenerationPlaceholder = {
  imageRowIds: string[];
  videoRowIds: string[];
};

export type DreaminaAgentGenerationKind = "image" | "video" | "mixed";

export type DreaminaCliIntent =
  | { action: "generate"; kind: DreaminaAgentGenerationKind }
  | { action: "recover"; kind: "image" | "video" | "mixed" | null };

const EMPTY_PLACEHOLDER: AgentMediaGenerationPlaceholder = {
  imageRowIds: [],
  videoRowIds: []
};

const GENERATION_ACTION_PATTERN =
  /(?:生成|生图|出图|重(?:新)?做|重试|补(?:做|生成)?|继续(?:生成|渲染)?|开始(?:生成|渲染)?|渲染|制作|转(?:成|为)?视频|generate|regenerate|retry|resume|render|create|image\s*(?:to|2)\s*video)/iu;
const DIAGNOSTIC_PATTERN = /(?:为什么|为何|原因|怎么回事|检查|确认|看(?:一)?下|分析|why|what\s+happened|check|inspect|diagnos)/iu;
const EXPLICIT_GENERATION_COMMAND_PATTERN =
  /(?:现在|马上|直接|开始|继续|重新|再|重试|补|修复|把|将|为(?!什么|何)|给|批量|全部|所有|然后|并|now|start|resume|retry|fix|then|and\s+then).{0,18}(?:生成|生图|出图|重(?:新)?做|重试|补(?:做|生成)?|继续(?:生成|渲染)?|渲染|制作|转(?:成|为)?视频|generate|regenerate|retry|resume|render|create|image\s*(?:to|2)\s*video)/iu;
const VIDEO_PATTERN = /(?:视频|影片|动画|动效|seedance|c[-\s]?dance|hyperframes?|video|clip|movie|animation)/iu;
const IMAGE_PATTERN = /(?:图片|图像|画面|关键帧|首帧|尾帧|四宫格|分镜(?:参考)?图|生图|出图|image|picture|key\s*frame|storyboard\s*(?:reference|grid))/iu;
const IMAGE_TO_VIDEO_PATTERN = /(?:图生视频|图片转视频|图转视频|image\s*(?:to|2)\s*video)/iu;
const ALL_ROWS_PATTERN =
  /(?:全部|所有|每(?:一)?个|整批|批量|还没|尚未|未生成|没有(?:图片|图像|视频|影片)|缺失|剩余|余下|接下来|后续|后面|失败的|all|every|each|batch|missing|remaining|rest|failed|required)/iu;
const ROW_NUMBER_LIST_PATTERN = "[0-9\\s、，,和及与&/\\-–—~至到]+";
const DREAMINA_CLI_PATTERN = /(?:即梦\s*(?:ai\s*)?cli|dreamina\s*(?:cli)?)/iu;
const DREAMINA_IMAGE_PATTERN = /(?:图片|图像|照片|海报|插画|四宫格|分镜(?:参考)?图|生图|seedream|image)/iu;
const DREAMINA_VIDEO_PATTERN = /(?:视频|影片|动画|短片|生视频|seedance|video)/iu;
const DREAMINA_RECOVERY_PATTERN =
  /(?:同步|找回|恢复|取回|拉取|下载|导入|回显|回绑|关联|放(?:到|进)|加入|添加|素材库|已有|已经|刚才|刚刚|生成好(?:的|了)?|任务状态|查看.{0,24}任务|查询.{0,24}任务|(?:当前|最近).{0,16}任务|list_task|query_result|sync|recover|fetch|download|import|attach|existing|previous|recent)/iu;
const DREAMINA_EXISTING_RESULT_PATTERN =
  /(?:刚才|刚刚|之前|此前|已经|已有|生成好(?:的|了)?|生成(?:了|过|完成)|(?:即梦\s*(?:ai\s*)?cli|dreamina\s*(?:cli)?).{0,12}生成的(?:视频|影片|图片|图像)|previous|existing|already|generated\s+(?:video|image|result))/iu;
const DREAMINA_NEW_GENERATION_OVERRIDE_PATTERN =
  /(?:(?:重新|再次|再|重试|补做|开始|继续|马上|现在|直接|新建|创建).{0,16}(?:生成|生图|生视频|制作|渲染)|(?:regenerate|retry|resume|start|create\s+new).{0,24}(?:video|image|generation)?)/iu;
const DREAMINA_EXPLICIT_GENERATION_PATTERN =
  /(?:(?:重新|再次|再|开始|马上|直接|继续|批量|全部|所有|新建|创建).{0,16}(?:生成|生图|生视频|制作|渲染)|(?:使用|用|让).{0,16}(?:即梦\s*(?:ai\s*)?cli|dreamina\s*(?:cli)?).{0,16}(?:生成|生图|生视频|制作|渲染)|(?:基于|通过).{0,12}(?:即梦\s*(?:ai\s*)?cli|dreamina\s*(?:cli)?).{0,16}(?:生成|生图|生视频|制作|渲染))/iu;

export function detectDreaminaCliIntent(message: string): DreaminaCliIntent | null {
  const text = message.trim();
  if (!text || !DREAMINA_CLI_PATTERN.test(text)) return null;

  const requestsImage = DREAMINA_IMAGE_PATTERN.test(text);
  const requestsVideo = DREAMINA_VIDEO_PATTERN.test(text);
  const kind = requestsImage && requestsVideo ? "mixed" : requestsVideo ? "video" : requestsImage ? "image" : null;
  const requestsRecovery = DREAMINA_RECOVERY_PATTERN.test(text);
  const explicitlyRequestsGeneration = DREAMINA_EXPLICIT_GENERATION_PATTERN.test(text);
  const referencesExistingResult = DREAMINA_EXISTING_RESULT_PATTERN.test(text);
  const overridesWithNewGeneration = DREAMINA_NEW_GENERATION_OVERRIDE_PATTERN.test(text);

  if (requestsRecovery && referencesExistingResult && !overridesWithNewGeneration) return { action: "recover", kind };
  if (requestsRecovery && !explicitlyRequestsGeneration) return { action: "recover", kind };
  if (!kind || !GENERATION_ACTION_PATTERN.test(text)) return null;
  return { action: "generate", kind };
}

export function detectDreaminaCliGenerationIntent(message: string): { kind: DreaminaAgentGenerationKind } | null {
  const intent = detectDreaminaCliIntent(message);
  return intent?.action === "generate" ? { kind: intent.kind } : null;
}

/**
 * Predicts the storyboard rows that should show generation feedback before an
 * Agent run is dispatched. This is deliberately limited to explicit media
 * generation requests so diagnostic questions do not create false loading UI.
 */
export function inferAgentMediaGenerationPlaceholder(
  message: string,
  rows: StoryboardRow[]
): AgentMediaGenerationPlaceholder {
  const text = message.trim();
  if (!text || rows.length === 0 || !GENERATION_ACTION_PATTERN.test(text)) return EMPTY_PLACEHOLDER;
  if (DIAGNOSTIC_PATTERN.test(text) && !EXPLICIT_GENERATION_COMMAND_PATTERN.test(text)) return EMPTY_PLACEHOLDER;

  const requestsVideo = VIDEO_PATTERN.test(text);
  const requestsImage = IMAGE_PATTERN.test(text) && !IMAGE_TO_VIDEO_PATTERN.test(text);
  if (!requestsImage && !requestsVideo) return EMPTY_PLACEHOLDER;

  const rowNumbers = extractStoryboardRowNumbers(text);
  const targetRows =
    rowNumbers.length > 0
      ? resolveStoryboardRows(rowNumbers, rows)
      : ALL_ROWS_PATTERN.test(text)
        ? rows.filter((row) => !isARollStoryboardRow(row))
        : [];
  if (targetRows.length === 0) return EMPTY_PLACEHOLDER;

  const rowIds = [...new Set(targetRows.map((row) => row.id))];
  return {
    imageRowIds: requestsImage ? rowIds : [],
    videoRowIds: requestsVideo ? rowIds : []
  };
}

export function inferAgentMentionedStoryboardRowIds(message: string, rows: StoryboardRow[]): string[] {
  const rowNumbers = extractStoryboardRowNumbers(message);
  return [...new Set(resolveStoryboardRows(rowNumbers, rows).map((row) => row.id))];
}

function extractStoryboardRowNumbers(text: string): number[] {
  const numberBlocks: string[] = [];
  const normalizedText = text.replace(/\b(?:and|or)\b/giu, ",");
  const expressions = [
    new RegExp(`(?:镜头|分镜)\\s*(?:第|#)?\\s*(${ROW_NUMBER_LIST_PATTERN})`, "giu"),
    new RegExp(`第\\s*(${ROW_NUMBER_LIST_PATTERN})\\s*(?:号)?(?:镜|镜头|分镜)`, "giu"),
    new RegExp(`(${ROW_NUMBER_LIST_PATTERN})\\s*(?:号)?(?:镜头|分镜)`, "giu"),
    new RegExp(`(?:shots?|rows?)\\s*(?:number(?:s)?|no\\.?|#)?\\s*(${ROW_NUMBER_LIST_PATTERN})`, "giu")
  ];

  expressions.forEach((expression) => {
    for (const match of normalizedText.matchAll(expression)) {
      if (match[1]) numberBlocks.push(match[1]);
    }
  });

  const rowNumbers = new Set<number>();
  numberBlocks.forEach((block) => {
    const rangePattern = /(\d+)\s*(?:-|–|—|~|至|到)\s*(\d+)/gu;
    for (const rangeMatch of block.matchAll(rangePattern)) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      if (!isValidRowNumber(start) || !isValidRowNumber(end)) continue;
      const direction = start <= end ? 1 : -1;
      for (let value = start; value !== end + direction; value += direction) rowNumbers.add(value);
    }
    const withoutRanges = block.replace(rangePattern, " ");
    for (const numberMatch of withoutRanges.matchAll(/\d+/gu)) {
      const value = Number(numberMatch[0]);
      if (isValidRowNumber(value)) rowNumbers.add(value);
    }
  });
  return [...rowNumbers];
}

function resolveStoryboardRows(rowNumbers: number[], rows: StoryboardRow[]): StoryboardRow[] {
  const rowByShotNumber = new Map<number, StoryboardRow>();
  rows.forEach((row) => {
    const match = row.shot.trim().match(/^(?:镜头|分镜)?\s*0*(\d+)\s*$/u);
    if (!match) return;
    const shotNumber = Number(match[1]);
    if (isValidRowNumber(shotNumber) && !rowByShotNumber.has(shotNumber)) rowByShotNumber.set(shotNumber, row);
  });

  const resolvedRows: StoryboardRow[] = [];
  const resolvedRowIds = new Set<string>();
  rowNumbers.forEach((rowNumber) => {
    const row = rowByShotNumber.get(rowNumber) ?? rows[rowNumber - 1];
    if (!row || resolvedRowIds.has(row.id)) return;
    resolvedRowIds.add(row.id);
    resolvedRows.push(row);
  });
  return resolvedRows;
}

function isARollStoryboardRow(row: StoryboardRow): boolean {
  return /(^|[^a-z])a\s*-?\s*roll([^a-z]|$)/iu.test(row.scene);
}

function isValidRowNumber(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0 && value <= 10_000;
}
