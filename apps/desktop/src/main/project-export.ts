import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { lstat, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { finished } from "node:stream/promises";
import { Zip, ZipPassThrough } from "fflate";
import type { ProjectAsset, ProjectDetail, ProjectExportKind, StoryboardRow } from "../shared";

const MAX_ZIP_ENTRY_SIZE = 0xffffffff;
const MAX_ZIP_ENTRY_COUNT = 0xffff;
const MAX_EXPORT_FILE_NAME_LENGTH = 180;
const REMOTE_ASSET_IDLE_TIMEOUT_MS = 60_000;
const windowsReservedFileName = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu;

export type ProjectExportErrorCode =
  | "empty-archive"
  | "missing-asset-record"
  | "missing-asset-source"
  | "invalid-project-directory"
  | "invalid-local-asset"
  | "asset-outside-project"
  | "unsafe-destination"
  | "remote-download-failed"
  | "asset-too-large"
  | "archive-too-large";

export class ProjectExportError extends Error {
  readonly code: ProjectExportErrorCode;
  readonly assetName?: string;

  constructor(code: ProjectExportErrorCode, message: string, assetName?: string) {
    super(message);
    this.name = "ProjectExportError";
    this.code = code;
    this.assetName = assetName;
  }
}

export type ProjectExportSourceResolver = (asset: ProjectAsset) => string | null | Promise<string | null>;

export type WriteProjectExportInput = {
  kind: ProjectExportKind;
  destinationPath: string;
  project: Pick<ProjectDetail, "project" | "rows" | "columns" | "assets">;
  resolveAssetSource?: ProjectExportSourceResolver;
};

export function collectStoryboardAssetIds(rows: StoryboardRow[]): string[] {
  const collected: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const currentIds = Array.isArray(row.imageAssetIds) && row.imageAssetIds.length > 0 ? row.imageAssetIds : row.imageAssetId ? [row.imageAssetId] : [];
    for (const value of currentIds) {
      if (typeof value !== "string") continue;
      const assetId = value.trim();
      if (!assetId || seen.has(assetId)) continue;
      seen.add(assetId);
      collected.push(assetId);
    }
  }
  return collected;
}

export function buildExportFileNameMap(assets: ProjectAsset[]): Map<string, string> {
  const result = new Map<string, string>();
  const usedNames = new Set<string>();
  for (const asset of assets) {
    if (!asset?.id || result.has(asset.id)) continue;
    const safeName = sanitizeExportFileName(asset.name);
    let candidate = safeName;
    let index = 2;
    while (usedNames.has(normalizeExportFileNameKey(candidate))) {
      candidate = addFileNameSuffix(safeName, index);
      index += 1;
    }
    usedNames.add(normalizeExportFileNameKey(candidate));
    result.set(asset.id, candidate);
  }
  return result;
}

export function serializeStoryboardCsv(
  project: Pick<ProjectDetail, "rows" | "columns" | "assets">,
  fileNameMap: ReadonlyMap<string, string> = buildExportFileNameMap(project.assets)
): string {
  const header = project.columns.map((column) => encodeCsvCell(column.label)).join(",");
  const body = project.rows.map((row, rowIndex) =>
    project.columns
      .map((column) => {
        if (column.id === "sort") return encodeCsvCell(String(rowIndex + 1));
        if (column.id === "shot") return encodeCsvCell(row.shot);
        if (column.id === "image" || column.type === "image") {
          const names = getStoryboardRowAssetIds(row)
            .map((assetId) => fileNameMap.get(assetId))
            .filter((name): name is string => Boolean(name));
          return encodeCsvCell(names.join("\n"));
        }
        if (column.id === "scene") return encodeCsvCell(row.scene);
        if (column.id === "duration") return encodeCsvCell(row.duration);
        if (column.id === "content") return encodeCsvCell(row.content);
        if (column.id === "note") return encodeCsvCell(row.note);
        return encodeCsvCell(row.customValues?.[column.id] ?? "");
      })
      .join(",")
  );
  return `\uFEFF${[header, ...body].join("\r\n")}\r\n`;
}

export async function writeProjectExport(input: WriteProjectExportInput): Promise<{ exportedCount: number }> {
  await assertDestinationOutsideProject(input.destinationPath, input.project.project.localPath);
  const fileNameMap = buildExportFileNameMap(input.project.assets);
  const assetsById = new Map(input.project.assets.map((asset) => [asset.id, asset]));
  const storyboardAssetIds = collectStoryboardAssetIds(input.project.rows);

  if (input.kind === "storyboard-csv") {
    await writeTextAtomically(input.destinationPath, serializeStoryboardCsv(input.project, fileNameMap));
    return { exportedCount: input.project.rows.length };
  }

  if (input.kind === "storyboard-assets-zip") assertAssetRecordsExist(storyboardAssetIds, assetsById);
  const assetIds = input.kind === "storyboard-assets-zip" ? storyboardAssetIds : input.project.assets.map((asset) => asset.id);
  if (assetIds.length === 0) throw new ProjectExportError("empty-archive", "There are no assets to export.");
  if (assetIds.length >= MAX_ZIP_ENTRY_COUNT) throw new ProjectExportError("archive-too-large", "The ZIP archive contains too many files.");
  if (!input.resolveAssetSource) throw new ProjectExportError("missing-asset-source", "Asset source resolver is required.");

  const entries = [] as Array<{ asset: ProjectAsset; archiveName: string; source: string }>;
  for (const assetId of assetIds) {
    const asset = assetsById.get(assetId);
    if (!asset) throw new ProjectExportError("missing-asset-record", `Asset record is missing: ${assetId}`, assetId);
    const source = await input.resolveAssetSource(asset);
    if (!source) throw new ProjectExportError("missing-asset-source", `Asset source is missing: ${asset.name}`, asset.name);
    entries.push({ asset, archiveName: fileNameMap.get(asset.id) ?? sanitizeExportFileName(asset.name), source });
  }

  await writeZipAtomically(input.destinationPath, input.project.project.localPath, entries);
  return { exportedCount: entries.length };
}

export function sanitizeExportFileName(input: string): string {
  const leafName = String(input || "")
    .normalize("NFC")
    .split(/[\\/]/u)
    .pop() ?? "";
  let cleaned = leafName
    .replace(/[\u0000-\u001f\u007f-\u009f<>:"/\\|?*]|\p{Cf}/gu, "-")
    .replace(/\s+/gu, " ")
    .replace(/[. ]+$/gu, "")
    .replace(/^[. ]+/gu, "")
    .trim();
  if (!cleaned || cleaned === "." || cleaned === "..") cleaned = "asset";
  if (windowsReservedFileName.test(cleaned)) cleaned = `_${cleaned}`;
  return truncateFileName(cleaned, MAX_EXPORT_FILE_NAME_LENGTH);
}

function getStoryboardRowAssetIds(row: StoryboardRow): string[] {
  const sourceIds = Array.isArray(row.imageAssetIds) && row.imageAssetIds.length > 0 ? row.imageAssetIds : row.imageAssetId ? [row.imageAssetId] : [];
  const seen = new Set<string>();
  const normalizedIds: string[] = [];
  for (const assetId of sourceIds) {
    if (typeof assetId !== "string") continue;
    const normalized = assetId.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    normalizedIds.push(normalized);
  }
  return normalizedIds;
}

function assertAssetRecordsExist(assetIds: string[], assetsById: ReadonlyMap<string, ProjectAsset>): void {
  const missingAssetId = assetIds.find((assetId) => !assetsById.has(assetId));
  if (missingAssetId) throw new ProjectExportError("missing-asset-record", `Asset record is missing: ${missingAssetId}`, missingAssetId);
}

function encodeCsvCell(input: unknown): string {
  let value = String(input ?? "").replace(/\r\n?/gu, "\n");
  if (/^[\t\n\r ]*[=+@-]/u.test(value)) value = `'${value}`;
  return `"${value.replace(/"/gu, '""')}"`;
}

function normalizeExportFileNameKey(fileName: string): string {
  return fileName.normalize("NFC").toLocaleLowerCase("en-US");
}

function addFileNameSuffix(fileName: string, index: number): string {
  const extension = extname(fileName);
  const baseName = basename(fileName, extension) || "asset";
  const suffix = ` (${index})`;
  const suffixLength = Array.from(suffix).length;
  const boundedExtension = Array.from(extension)
    .slice(0, Math.max(0, MAX_EXPORT_FILE_NAME_LENGTH - suffixLength - 1))
    .join("");
  const baseLength = Math.max(1, MAX_EXPORT_FILE_NAME_LENGTH - suffixLength - Array.from(boundedExtension).length);
  const boundedBase = Array.from(baseName).slice(0, baseLength).join("") || "asset".slice(0, baseLength);
  return `${boundedBase}${suffix}${boundedExtension}`;
}

function truncateFileName(fileName: string, maxLength: number): string {
  const characters = Array.from(fileName);
  if (characters.length <= maxLength) return fileName;
  const extension = extname(fileName);
  if (Array.from(extension).length >= maxLength - 1) return characters.slice(0, maxLength).join("");
  const baseName = basename(fileName, extension) || "asset";
  const availableBaseLength = Math.max(1, maxLength - Array.from(extension).length);
  return `${Array.from(baseName).slice(0, availableBaseLength).join("")}${extension}`;
}

async function writeTextAtomically(destinationPath: string, content: string): Promise<void> {
  const partialPath = createPartialPath(destinationPath);
  try {
    await writeFile(partialPath, content, { encoding: "utf8", flag: "wx" });
    await replaceWithPartial(partialPath, destinationPath);
  } catch (error) {
    await rm(partialPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function writeZipAtomically(
  destinationPath: string,
  projectDirectory: string,
  entries: Array<{ asset: ProjectAsset; archiveName: string; source: string }>
): Promise<void> {
  const partialPath = createPartialPath(destinationPath);
  const output = createWriteStream(partialPath, { flags: "wx" });
  let outputError: Error | null = null;
  let drainPromise: Promise<void> | null = null;
  output.on("error", (error) => {
    outputError = error;
  });
  let archive: Zip | null = null;
  let archiveByteLength = 0;

  try {
    await once(output, "open");
    archive = new Zip((error, data, final) => {
      if (error) {
        outputError = error;
        output.destroy(error);
        return;
      }
      archiveByteLength += data.byteLength;
      if (archiveByteLength >= MAX_ZIP_ENTRY_SIZE) {
        const archiveSizeError = new ProjectExportError("archive-too-large", "The ZIP archive exceeds the supported size limit.");
        outputError = archiveSizeError;
        output.destroy(archiveSizeError);
        return;
      }
      if (outputError) return;
      const needsDrain = !output.write(data);
      if (final) {
        output.end();
        return;
      }
      if (needsDrain && !drainPromise) {
        const pendingDrain = once(output, "drain").then(() => undefined);
        pendingDrain.catch(() => undefined);
        drainPromise = pendingDrain;
        void pendingDrain
          .finally(() => {
            if (drainPromise === pendingDrain) drainPromise = null;
          })
          .catch(() => undefined);
      }
    });

    for (const entry of entries) {
      const zipEntry = new ZipPassThrough(entry.archiveName);
      archive.add(zipEntry);
      if (isRemoteSource(entry.source)) {
        await pushRemoteSource(zipEntry, entry.source, entry.asset.name, () => drainPromise);
      } else {
        const localPath = await resolveSafeLocalAssetPath(projectDirectory, entry.source, entry.asset.name);
        await pushLocalSource(zipEntry, localPath, entry.asset.name, () => drainPromise);
      }
      if (outputError) throw outputError;
    }
    archive.end();
    await finished(output);
    if (outputError) throw outputError;
    await replaceWithPartial(partialPath, destinationPath);
  } catch (error) {
    try {
      archive?.terminate();
    } catch {
      // Preserve the original filesystem or asset error.
    }
    output.destroy();
    await finished(output).catch(() => undefined);
    await rm(partialPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function pushLocalSource(
  entry: ZipPassThrough,
  sourcePath: string,
  assetName: string,
  getDrainPromise: () => Promise<void> | null
): Promise<void> {
  const sourceStats = await stat(sourcePath);
  if (!sourceStats.isFile()) throw new ProjectExportError("invalid-local-asset", `Asset is not a file: ${assetName}`, assetName);
  assertZipEntrySize(sourceStats.size, assetName);
  for await (const chunk of createReadStream(sourcePath)) {
    entry.push(toUint8Array(chunk), false);
    const drain = getDrainPromise();
    if (drain) await drain;
  }
  entry.push(new Uint8Array(0), true);
  const drain = getDrainPromise();
  if (drain) await drain;
}

async function pushRemoteSource(
  entry: ZipPassThrough,
  sourceUrl: string,
  assetName: string,
  getDrainPromise: () => Promise<void> | null
): Promise<void> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const refreshTimeout = () => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => controller.abort(), REMOTE_ASSET_IDLE_TIMEOUT_MS);
    timeout.unref?.();
  };
  const clearTimeoutHandle = () => {
    if (timeout) clearTimeout(timeout);
    timeout = null;
  };
  let response: Response;
  try {
    refreshTimeout();
    response = await fetch(sourceUrl, { signal: controller.signal });
  } catch (error) {
    clearTimeoutHandle();
    throw new ProjectExportError("remote-download-failed", `Failed to download ${assetName}: ${error instanceof Error ? error.message : String(error)}`, assetName);
  }
  if (!response.ok || !response.body) {
    clearTimeoutHandle();
    throw new ProjectExportError("remote-download-failed", `Failed to download ${assetName}: HTTP ${response.status}`, assetName);
  }
  const reader = response.body.getReader();
  let receivedSize = 0;
  try {
    const declaredSize = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredSize) && declaredSize >= 0) assertZipEntrySize(declaredSize, assetName);
    while (true) {
      refreshTimeout();
      const { done, value } = await reader.read();
      if (done) break;
      refreshTimeout();
      receivedSize += value.byteLength;
      assertZipEntrySize(receivedSize, assetName);
      entry.push(value, false);
      const drain = getDrainPromise();
      if (drain) await drain;
    }
    entry.push(new Uint8Array(0), true);
    const drain = getDrainPromise();
    if (drain) await drain;
    clearTimeoutHandle();
  } catch (error) {
    clearTimeoutHandle();
    await reader.cancel().catch(() => undefined);
    if (error instanceof ProjectExportError) throw error;
    throw new ProjectExportError("remote-download-failed", `Failed to download ${assetName}: ${error instanceof Error ? error.message : String(error)}`, assetName);
  }
}

async function resolveSafeLocalAssetPath(projectDirectory: string, sourcePath: string, assetName: string): Promise<string> {
  let projectRealPath: string;
  let assetRealPath: string;
  try {
    projectRealPath = await realpath(projectDirectory);
  } catch {
    throw new ProjectExportError("invalid-project-directory", "Project directory is unavailable.");
  }
  try {
    assetRealPath = await realpath(isAbsolute(sourcePath) ? sourcePath : resolve(projectDirectory, sourcePath));
  } catch {
    throw new ProjectExportError("invalid-local-asset", `Asset file is unavailable: ${assetName}`, assetName);
  }
  const relativePath = relative(projectRealPath, assetRealPath);
  if (relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw new ProjectExportError("asset-outside-project", `Asset is outside the project directory: ${assetName}`, assetName);
  }
  return assetRealPath;
}

async function assertDestinationOutsideProject(destinationPath: string, projectDirectory: string): Promise<void> {
  let projectRealPath: string;
  let destinationParentRealPath: string;
  try {
    [projectRealPath, destinationParentRealPath] = await Promise.all([realpath(projectDirectory), realpath(dirname(destinationPath))]);
  } catch {
    throw new ProjectExportError("invalid-project-directory", "The project or export destination directory is unavailable.");
  }
  const resolvedDestination = resolve(destinationParentRealPath, basename(destinationPath));
  const relativeDestination = relative(projectRealPath, resolvedDestination);
  const isInsideProject =
    relativeDestination === "" || (relativeDestination !== ".." && !relativeDestination.startsWith(`..${sep}`) && !isAbsolute(relativeDestination));
  if (isInsideProject) {
    throw new ProjectExportError("unsafe-destination", "Choose an export destination outside the MkBoard project directory.");
  }
}

function isRemoteSource(source: string): boolean {
  try {
    const url = new URL(source);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function assertZipEntrySize(size: number, assetName: string): void {
  if (size >= MAX_ZIP_ENTRY_SIZE) {
    throw new ProjectExportError("asset-too-large", `Asset exceeds the ZIP entry size limit: ${assetName}`, assetName);
  }
}

function toUint8Array(chunk: string | Buffer): Uint8Array {
  return typeof chunk === "string" ? new TextEncoder().encode(chunk) : new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
}

function createPartialPath(destinationPath: string): string {
  return join(dirname(destinationPath), `.${basename(destinationPath)}.mkboard-partial-${randomUUID()}`);
}

async function replaceWithPartial(partialPath: string, destinationPath: string): Promise<void> {
  try {
    await rename(partialPath, destinationPath);
    return;
  } catch (initialError) {
    const destinationStats = await lstat(destinationPath).catch(() => null);
    if (!destinationStats || (!destinationStats.isFile() && !destinationStats.isSymbolicLink())) throw initialError;

    // Windows cannot rename over an existing file. Preserve the previous export
    // until the completed partial has taken its place, then remove the backup.
    const backupPath = createPartialPath(`${destinationPath}.backup`);
    await rename(destinationPath, backupPath);
    try {
      await rename(partialPath, destinationPath);
    } catch (replacementError) {
      await rename(backupPath, destinationPath).catch(() => undefined);
      throw replacementError;
    }
    await rm(backupPath, { force: true }).catch(() => undefined);
  }
}
