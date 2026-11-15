import zhTutorialContent from "./tutorial-content/musk-story.zh.json";
import enTutorialContent from "./tutorial-content/musk-story.en.json";
import {
  getTutorialProjectId,
  getTutorialProjectIdForLocale,
  getTutorialProjectLocale,
  getTutorialProjectLocaleForProjectId,
  isTutorialProjectId,
  tutorialProjectContentVersion,
  tutorialProjectId,
  tutorialProjectIdsByLocale,
  type InterfaceLanguage,
  type StoryboardRow
} from "../shared";

export {
  getTutorialProjectId,
  getTutorialProjectIdForLocale,
  getTutorialProjectLocaleForProjectId,
  isTutorialProjectId,
  tutorialProjectContentVersion,
  tutorialProjectId,
  tutorialProjectIdsByLocale
};

export type TutorialLocale = "zh" | "en";

export type TutorialMediaAsset = {
  id: string;
  rowId: string;
  kind: "image" | "video";
  fileName: string;
  url: string;
  fileSize: number;
  sha256?: string;
  posterFileName?: string;
  posterUrl?: string;
  posterFileSize?: number;
  posterSha256?: string;
  resourcePath?: string;
  posterResourcePath?: string;
};

type TutorialContentPackage = {
  locale: TutorialLocale;
  projectName: string;
  scriptHtml: string;
  legacyScriptHtml: string[];
  rows: StoryboardRow[];
  mediaAssets: TutorialMediaAsset[];
};

const tutorialContents: Record<TutorialLocale, TutorialContentPackage> = {
  zh: zhTutorialContent as unknown as TutorialContentPackage,
  en: enTutorialContent as unknown as TutorialContentPackage
};

export function getTutorialLocale(interfaceLanguage?: InterfaceLanguage | string | null): TutorialLocale {
  return getTutorialProjectLocale(interfaceLanguage);
}

export function getTutorialProjectName(interfaceLanguage?: InterfaceLanguage): string {
  return getTutorialContent(getTutorialLocale(interfaceLanguage)).projectName;
}

export function getTutorialScriptHtml(interfaceLanguage?: InterfaceLanguage): string {
  return getTutorialContent(getTutorialLocale(interfaceLanguage)).scriptHtml;
}

export function inferTutorialScriptLocale(html: string | null | undefined, fallbackInterfaceLanguage?: InterfaceLanguage): TutorialLocale {
  const text = htmlToPlainText(html || "");
  const cjkCount = [...text].filter((char) => /[\u4e00-\u9fff]/u.test(char)).length;
  const latinWordCount = text.match(/[A-Za-z][A-Za-z0-9']*/g)?.length ?? 0;
  if (cjkCount >= 8) return "zh";
  if (latinWordCount >= 20) return "en";
  return getTutorialLocale(fallbackInterfaceLanguage);
}

export function isKnownTutorialScript(html: string | null | undefined): boolean {
  const normalized = normalizeScriptTextForComparison(html || "");
  return Object.values(tutorialContents).some((content) =>
    [content.scriptHtml, ...content.legacyScriptHtml].some((script) => normalized === normalizeScriptTextForComparison(script))
  );
}

export function getTutorialStoryboardRows(interfaceLanguage?: InterfaceLanguage): StoryboardRow[] {
  return getTutorialStoryboardRowsForLocale(getTutorialLocale(interfaceLanguage));
}

export function getTutorialStoryboardRowsForLocale(locale: TutorialLocale): StoryboardRow[] {
  return getTutorialContent(locale).rows.map(cloneRow);
}

export function getTutorialMediaAssetsForLocale(locale: TutorialLocale): TutorialMediaAsset[] {
  return getTutorialContent(locale).mediaAssets.map((asset) => ({ ...asset }));
}

export function areKnownTutorialStoryboardRows(rows: StoryboardRow[]): boolean {
  if (rows.length === 0) return false;
  return rows.every((row, index) => isKnownTutorialStoryboardRow(row, index));
}

export function areManagedTutorialStoryboardRows(rows: StoryboardRow[]): boolean {
  if (areKnownTutorialStoryboardRows(rows)) return true;
  if (rows.length < 8) return false;
  const text = normalizeLooseText(rows.map((row) => row.content).join(" "));
  const hasZhMarkers = ["马斯克", "spacex", "tesla", "paypal"].every((marker) => text.includes(marker));
  const hasEnMarkers = ["elonmusk", "spacex", "tesla", "paypal"].every((marker) => text.includes(marker));
  return hasZhMarkers || hasEnMarkers;
}

export function areTutorialStoryboardRows(rows: StoryboardRow[]): boolean {
  if (rows.length === 0) return false;
  return rows.every((row) => isTutorialStoryboardRowId(row.id));
}

export function inferTutorialStoryboardRowsLocale(rows: StoryboardRow[]): TutorialLocale | null {
  if (rows.length === 0) return null;
  const text = rows.map((row) => row.content).join(" ");
  const cjkCount = [...text].filter((char) => /[\u4e00-\u9fff]/u.test(char)).length;
  const latinWordCount = text.match(/[A-Za-z][A-Za-z0-9']*/g)?.length ?? 0;
  if (cjkCount >= 8) return "zh";
  if (latinWordCount >= 20) return "en";
  return null;
}

function getTutorialContent(locale: TutorialLocale): TutorialContentPackage {
  return tutorialContents[locale] ?? tutorialContents.en;
}

function cloneRow(row: StoryboardRow): StoryboardRow {
  return {
    ...row,
    imageAssetIds: row.imageAssetIds ? [...row.imageAssetIds] : undefined,
    customValues: row.customValues ? { ...row.customValues } : undefined
  };
}

function normalizeScriptTextForComparison(html: string): string {
  return htmlToPlainText(html).replace(/\s+/g, " ").trim();
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeStoryboardContentForComparison(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeLooseText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[，。！？；：“”‘’、·]/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}

function isKnownTutorialStoryboardRow(row: StoryboardRow, index: number): boolean {
  const content = normalizeStoryboardContentForComparison(row.content);
  return Object.values(tutorialContents).some((tutorialContent) => {
    const knownRows = isTutorialStoryboardRowId(row.id)
      ? [tutorialContent.rows.find((candidate) => candidate.id === row.id)]
      : [tutorialContent.rows[index]];
    return knownRows.some((knownRow) => {
      const knownContent = normalizeStoryboardContentForComparison(knownRow?.content ?? "");
      return Boolean(knownContent && (content === knownContent || normalizeLooseText(content) === normalizeLooseText(knownContent)));
    });
  });
}

function isTutorialStoryboardRowId(rowId: string): boolean {
  return /^tutorial(?:-[a-z]+)?-shot-\d+$/i.test(rowId);
}
