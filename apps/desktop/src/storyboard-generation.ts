// Which shots MkBoard generates images / videos for, with which prompt, duration and method.
// Shared by the storyboard toolbar (renderer) and the MCP generate_shot_images / generate_shot_videos tools.
import {
  isSeedanceAspectRatio,
  isStoryboardGenerationMethodColumn,
  isStoryboardImagePromptColumn,
  isStoryboardVideoPromptColumn,
  type HyperframesVideoResolution,
  type ImageRatio,
  type ProjectAsset,
  type SeedanceAspectRatio,
  type SeedanceVideoResolution,
  type StoryboardCloudGenerationTarget,
  type StoryboardColumn,
  type StoryboardColumnId,
  type StoryboardRow,
  type StoryboardVideoGenerationMethod,
  type StoryboardVideoGenerationTarget
} from "./shared";

export type StoryboardMediaGenerationMode = "missing" | "all";
export type StoryboardVideoGenerationMethodFilter = "hyperframes" | "seedance" | "all";
export type StoryboardGenerationMethod = "ChatGPT Image2" | "Seedance 2.0" | "Hyperframes" | "自定义";
export type StoryboardImageGenerationMethod = "ChatGPT Image2" | "Seedance 2.0";
export type StoryboardImageGenerationCandidate = StoryboardCloudGenerationTarget & { method: StoryboardImageGenerationMethod };
export const storyboardGenerationMethodOptions: StoryboardGenerationMethod[] = ["ChatGPT Image2", "Seedance 2.0", "Hyperframes", "自定义"];
const seedanceReferenceGridPromptMarker = "Seedance 2.0 前置参考图要求：";

export function getStoryboardCellValue(columnId: StoryboardColumnId, row: StoryboardRow) {
  if (columnId === "scene") return row.scene;
  if (columnId === "duration") return row.duration;
  if (columnId === "content") return row.content;
  if (columnId === "note") return row.note;
  if (columnId.startsWith("custom-")) return row.customValues?.[columnId] ?? "";
  return "";
}

export function normalizeStoryboardGenerationMethod(value: string): StoryboardGenerationMethod | "" {
  const normalized = value.trim();
  const directOption = storyboardGenerationMethodOptions.find((option) => option === normalized);
  if (directOption) return directOption;
  if (/^(gpt\s*magic|chatgpt\s*image\s*2|chatgpt\s*image2)$/i.test(normalized)) return "ChatGPT Image2";
  if (/^(c[-\s]?dance|seedance(?:\s*2(?:\.0)?)?|即梦)$/i.test(normalized)) return "Seedance 2.0";
  if (/^hyper(?:front|frames?)$/i.test(normalized)) return "Hyperframes";
  if (/^(custom|manual|自定义|自定義|手动|手動|自备素材|自備素材)$/i.test(normalized)) return "自定义";
  return "";
}

export function normalizeGenerationPromptValue(value: string) {
  const prompt = value.trim();
  if (!prompt || prompt === "—" || prompt === "-") return "";
  return prompt;
}

export function withSeedanceReferenceGridPrompt(prompt: string) {
  if (prompt.includes(seedanceReferenceGridPromptMarker)) return prompt;
  return `${prompt}

${seedanceReferenceGridPromptMarker}请用 GPT Image2 生成一张 2x2 四宫格分镜参考图，图内包含 4 个连续画面。不要生成单张普通关键帧；不要添加分镜 1/2/3/4 序号、镜头号、标题、字幕、旁白、说明文字、描述栏、水印、边框或任何 UI 标注。`;
}

export function resolveStoryboardVideoDurationSec(row: StoryboardRow, prompt: string, method: StoryboardVideoGenerationMethod): number {
  const parsedDuration = parseStoryboardDurationNumber(row.duration);
  const contentDuration = estimateStoryboardVideoDurationFromText(row, prompt, method);
  const baseline = method === "Seedance 2.0" ? 12 : 10;
  const max = method === "Seedance 2.0" ? 15 : 20;
  return Math.max(10, Math.min(max, Math.round(Math.max(parsedDuration ?? 0, contentDuration, baseline))));
}

function estimateStoryboardVideoDurationFromText(row: StoryboardRow, prompt: string, method: StoryboardVideoGenerationMethod): number {
  const contentUnits = countStoryboardDurationTextUnits(row.content);
  const noteUnits = Math.ceil(countStoryboardDurationTextUnits(row.note) * 0.75);
  const promptUnits = Math.ceil(countStoryboardDurationTextUnits(prompt) * 0.35);
  const units = Math.max(contentUnits, noteUnits, promptUnits);
  if (method === "Seedance 2.0") {
    if (units > 120) return 15;
    if (units > 85) return 14;
    if (units > 55) return 13;
    return 12;
  }
  if (units > 120) return 20;
  if (units > 85) return 18;
  if (units > 55) return 15;
  if (units > 30) return 12;
  return 10;
}

function countStoryboardDurationTextUnits(value: string): number {
  const text = value.replace(/<[^>]+>/gu, " ").trim();
  if (!text) return 0;
  const cjkMatches = text.match(/[\u3400-\u9fff\uf900-\ufaff]/gu) ?? [];
  const textWithoutCjk = text.replace(/[\u3400-\u9fff\uf900-\ufaff]/gu, " ");
  const wordMatches = textWithoutCjk.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/gu) ?? [];
  return Math.ceil(cjkMatches.length / 2) + wordMatches.length;
}

export function parseStoryboardDurationNumber(value: string): number | null {
  const match = value.trim().match(/\d+(?:\.\d+)?/u);
  if (!match) return null;
  const numberValue = Number(match[0]);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
}

export function normalizeSeedanceVideoCreditsDuration(value: unknown): number {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) return 12;
  return Math.max(10, Math.min(15, Math.round(numberValue)));
}

export function getStoryboardRowMediaAssetIds(row: StoryboardRow) {
  const sourceIds = row.imageAssetIds && row.imageAssetIds.length > 0 ? row.imageAssetIds : row.imageAssetId ? [row.imageAssetId] : [];
  return sourceIds.filter((assetId, index) => assetId && sourceIds.indexOf(assetId) === index).slice(0, 10);
}

export function storyboardRowHasMediaKind(row: StoryboardRow, assets: ProjectAsset[], kind: "image" | "video") {
  const explicitAssetIds = new Set(getStoryboardRowMediaAssetIds(row));
  return assets.some((asset) => asset.kind === kind && (explicitAssetIds.has(asset.id) || asset.linkedShotId === row.id));
}

export function isArollStoryboardRow(row: StoryboardRow) {
  return /(^|[^a-z])a\s*-?\s*roll([^a-z]|$)/i.test(row.scene);
}

export function buildStoryboardImageGenerationCandidates(
  rows: StoryboardRow[],
  columns: StoryboardColumn[],
  imageRatio: ImageRatio
): StoryboardImageGenerationCandidate[] {
  const promptColumn = columns.find(isStoryboardImagePromptColumn);
  const methodColumn = columns.find(isStoryboardGenerationMethodColumn);
  if (!promptColumn) return [];
  const targets: StoryboardImageGenerationCandidate[] = [];
  rows.forEach((row) => {
    if (isArollStoryboardRow(row)) return;
    const method = methodColumn ? normalizeStoryboardGenerationMethod(getStoryboardCellValue(methodColumn.id, row)) : "ChatGPT Image2";
    if (method !== "ChatGPT Image2" && method !== "Seedance 2.0") return;
    const prompt = normalizeGenerationPromptValue(getStoryboardCellValue(promptColumn.id, row));
    targets.push({
      rowId: row.id,
      method,
      prompt: prompt && method === "Seedance 2.0" ? withSeedanceReferenceGridPrompt(prompt) : prompt,
      aspectRatio: imageRatio
    });
  });
  return targets;
}

export function buildStoryboardImageGenerationTargets(
  rows: StoryboardRow[],
  columns: StoryboardColumn[],
  imageRatio: ImageRatio
): StoryboardCloudGenerationTarget[] {
  return buildStoryboardImageGenerationCandidates(rows, columns, imageRatio)
    .filter((target) => Boolean(target.prompt))
    .map(({ method: _method, ...target }) => target);
}

export function buildStoryboardVideoGenerationCandidates(
  rows: StoryboardRow[],
  columns: StoryboardColumn[],
  imageRatio: ImageRatio,
  hyperframesResolution: HyperframesVideoResolution = "1080p",
  seedanceResolution: SeedanceVideoResolution = "720p"
): StoryboardVideoGenerationTarget[] {
  const promptColumn = columns.find(isStoryboardVideoPromptColumn);
  const methodColumn = columns.find(isStoryboardGenerationMethodColumn);
  if (!promptColumn || !methodColumn) return [];
  const targets: StoryboardVideoGenerationTarget[] = [];
  rows
    .filter((row) => !isArollStoryboardRow(row))
    .forEach((row) => {
      const method = normalizeStoryboardGenerationMethod(getStoryboardCellValue(methodColumn.id, row));
      const prompt = normalizeGenerationPromptValue(getStoryboardCellValue(promptColumn.id, row));
      if (method !== "Seedance 2.0" && method !== "Hyperframes") return;
      targets.push({
        rowId: row.id,
        method,
        prompt,
        durationSec: resolveStoryboardVideoDurationSec(row, prompt, method),
        aspectRatio: imageRatio,
        hyperframesResolution: method === "Hyperframes" ? hyperframesResolution : undefined,
        seedanceResolution: method === "Seedance 2.0" ? seedanceResolution : undefined
      });
    });
  return targets;
}

export function buildStoryboardVideoGenerationTargets(
  rows: StoryboardRow[],
  columns: StoryboardColumn[],
  imageRatio: ImageRatio,
  hyperframesResolution: HyperframesVideoResolution = "1080p",
  seedanceResolution: SeedanceVideoResolution = "720p"
): StoryboardVideoGenerationTarget[] {
  const candidates = buildStoryboardVideoGenerationCandidates(rows, columns, imageRatio, hyperframesResolution, seedanceResolution);
  return candidates.filter((target) => Boolean(target.prompt));
}

export function applyAgentSeedanceAspectRatioOverrides(
  targets: StoryboardVideoGenerationTarget[],
  aspectRatioByRowId?: ReadonlyMap<string, SeedanceAspectRatio>
): StoryboardVideoGenerationTarget[] {
  if (!aspectRatioByRowId?.size) return targets;
  return targets.map((target) => {
    const aspectRatio = aspectRatioByRowId.get(target.rowId);
    if (target.method !== "Seedance 2.0" || !isSeedanceAspectRatio(aspectRatio)) return target;
    return { ...target, aspectRatio };
  });
}

export function filterStoryboardVideoTargetsByMethod<T extends { method: StoryboardVideoGenerationMethod }>(
  targets: T[],
  methodFilter: StoryboardVideoGenerationMethodFilter
): T[] {
  if (methodFilter === "hyperframes") return targets.filter((target) => target.method === "Hyperframes");
  if (methodFilter === "seedance") return targets.filter((target) => target.method === "Seedance 2.0");
  return targets;
}

export function filterStoryboardGenerationTargetsByMode<T extends { rowId: string }>(
  targets: T[],
  rows: StoryboardRow[],
  assets: ProjectAsset[],
  kind: "image" | "video",
  mode: StoryboardMediaGenerationMode
): T[] {
  if (mode === "all") return targets;
  const rowMap = new Map(rows.map((row) => [row.id, row]));
  return targets.filter((target) => {
    const row = rowMap.get(target.rowId);
    return row ? !storyboardRowHasMediaKind(row, assets, kind) : false;
  });
}
