import { isSeedanceAspectRatio, isStoryboardPromptTextColumn } from "../shared";
import type { AgentOperation, AgentResponse, AgentRowRef, StoryboardColumn, StoryboardRow } from "../shared";

export function parseAgentResponse(input: string, agentName: string, columns: StoryboardColumn[] = []): AgentResponse {
  const jsonText = extractJsonObject(input);
  if (!jsonText) {
    return {
      reply: input.trim() || `${agentName} 没有返回可解析内容。`
    };
  }
  try {
    const parsed = JSON.parse(jsonText) as AgentResponse;
    return {
      reply: typeof parsed.reply === "string" ? parsed.reply : "",
      scriptHtml: typeof parsed.scriptHtml === "string" ? parsed.scriptHtml : undefined,
      rows: Array.isArray(parsed.rows) ? normalizeRows(parsed.rows, columns) : undefined,
      operations: Array.isArray((parsed as { operations?: unknown }).operations) ? normalizeAgentOperations((parsed as { operations: unknown[] }).operations, columns) : undefined
    };
  } catch {
    return {
      reply: input.trim() || `${agentName} 返回的 JSON 无法解析。`
    };
  }
}

function normalizeAgentOperations(operations: unknown[], columns: StoryboardColumn[]): AgentOperation[] {
  return operations
    .filter(isRecord)
    .map((operation) => normalizeAgentOperation(operation, columns))
    .filter((operation): operation is AgentOperation => operation !== null);
}

export function normalizeAgentOperation(operation: Record<string, unknown>, columns: StoryboardColumn[]): AgentOperation | null {
  const type = normalizeAgentOperationType(operation);
  if (type === "update_script") {
    const scriptHtml = readStringField(operation, ["scriptHtml", "script_html", "html"]);
    return scriptHtml ? { type, scriptHtml } : null;
  }
  if (type === "sync_script_a_roll_tags") {
    const scriptHtml = readStringField(operation, ["scriptHtml", "script_html", "html"]);
    return scriptHtml ? { type, scriptHtml } : null;
  }
  if (type === "parse_storyboard") {
    return { type, overwriteExisting: operation.overwriteExisting !== false };
  }
  if (type === "update_shot_cells") {
    const rowRef = normalizeAgentRowRef(operation.rowRef ?? operation.row_ref);
    const cells = Array.isArray(operation.cells) ? normalizeAgentShotCellUpdates(operation.cells) : [];
    return rowRef && cells.length > 0 ? { type, rowRef, cells } : null;
  }
  if (type === "insert_shots") {
    const count = normalizeOperationCount(operation.count);
    const rowRef = normalizeAgentRowRef(operation.rowRef ?? operation.row_ref);
    const placement = normalizeInsertPlacement(operation.placement);
    const rows = Array.isArray(operation.rows) ? normalizeAgentInsertedShots(operation.rows, columns) : undefined;
    return { type, rowRef: rowRef ?? undefined, placement, count, rows };
  }
  if (type === "delete_shots" || type === "duplicate_shots") {
    const rowRefs = normalizeAgentRowRefs(operation.rowRefs ?? operation.row_refs ?? operation.rows);
    return rowRefs.length > 0 ? { type, rowRefs } : null;
  }
  if (type === "reorder_shot") {
    const rowRef = normalizeAgentRowRef(operation.rowRef ?? operation.row_ref);
    const targetRowRef = normalizeAgentRowRef(operation.targetRowRef ?? operation.target_row_ref ?? operation.target);
    const placement = normalizeReorderPlacement(operation.placement);
    return rowRef && targetRowRef ? { type, rowRef, targetRowRef, placement } : null;
  }
  if (type === "update_shot_media") {
    const rowRef = normalizeAgentRowRef(operation.rowRef ?? operation.row_ref);
    const assetIds = readStringArrayField(operation, ["assetIds", "asset_ids", "imageAssetIds", "image_asset_ids"]).slice(0, 10);
    return rowRef ? { type, rowRef, assetIds } : null;
  }
  if (type === "regenerate_media") {
    const rowRefs = normalizeAgentRowRefs(operation.rowRefs ?? operation.row_refs ?? operation.rows);
    const kind = normalizeRegenerateMediaKind(operation);
    if (!kind || rowRefs.length === 0) return null;
    const provider = normalizeRegenerateMediaProvider(operation);
    const aspectRatio = kind === "video" ? normalizeRegenerateMediaAspectRatio(operation) : null;
    return {
      type,
      rowRefs,
      kind,
      overwriteExisting: operation.overwriteExisting !== false,
      ...(provider ? { provider } : {}),
      ...(aspectRatio ? { aspectRatio } : {})
    };
  }
  return null;
}

function normalizeAgentOperationType(operation: Record<string, unknown>): string {
  const directType = readStringField(operation, ["type", "operation", "action"]);
  if (directType) return directType;
  const kind = readStringField(operation, ["kind"]);
  if (isAgentOperationType(kind)) return kind;
  return "";
}

function isAgentOperationType(value: string): value is AgentOperation["type"] {
  return (
    value === "update_script" ||
    value === "sync_script_a_roll_tags" ||
    value === "parse_storyboard" ||
    value === "update_shot_cells" ||
    value === "insert_shots" ||
    value === "delete_shots" ||
    value === "duplicate_shots" ||
    value === "reorder_shot" ||
    value === "update_shot_media" ||
    value === "regenerate_media"
  );
}

function normalizeRegenerateMediaKind(operation: Record<string, unknown>): "image" | "video" | null {
  for (const key of ["kind", "mediaKind", "media_kind", "mediaType", "media_type", "targetKind", "target_kind"]) {
    const kind = readStringField(operation, [key]);
    if (kind === "video") return "video";
    if (kind === "image") return "image";
  }
  return null;
}

function normalizeRegenerateMediaProvider(operation: Record<string, unknown>): "dreamina_cli" | null {
  for (const key of ["provider", "mediaProvider", "media_provider", "generationProvider", "generation_provider"]) {
    const provider = readStringField(operation, [key]).toLowerCase();
    if (provider === "dreamina_cli" || provider === "dreamina" || provider === "即梦cli" || provider === "即梦 cli") {
      return "dreamina_cli";
    }
  }
  return null;
}

function normalizeRegenerateMediaAspectRatio(operation: Record<string, unknown>) {
  const aspectRatio = readStringField(operation, ["aspectRatio", "aspect_ratio", "videoAspectRatio", "video_aspect_ratio", "ratio"]);
  return isSeedanceAspectRatio(aspectRatio) ? aspectRatio : null;
}

function normalizeAgentRowRefs(value: unknown): AgentRowRef[] {
  if (Array.isArray(value)) return value.map(normalizeAgentRowRef).filter((rowRef): rowRef is AgentRowRef => rowRef !== null);
  const rowRef = normalizeAgentRowRef(value);
  return rowRef ? [rowRef] : [];
}

function normalizeAgentRowRef(value: unknown): AgentRowRef | null {
  if (!isRecord(value)) return null;
  const kind = value.kind === "id" ? "id" : value.kind === "index" ? "index" : null;
  if (kind === "id") {
    const id = readStringField(value, ["value", "id", "rowId", "row_id"]);
    return id ? { kind, value: id } : null;
  }
  if (kind === "index") {
    const index = normalizePositiveInteger(value.value ?? value.index);
    return index ? { kind, value: index } : null;
  }
  return null;
}

function normalizeAgentShotCellUpdates(cells: unknown[]): Array<{ field: string; value: string }> {
  return cells.filter(isRecord).flatMap((cell) => {
    const field = readStringField(cell, ["field", "column", "columnId", "column_id"]);
    if (!field) return [];
    const value = readStringField(cell, ["value", "text", "content"], typeof cell.value === "number" && Number.isFinite(cell.value) ? String(cell.value) : "");
    return [{ field, value }];
  });
}

function normalizeAgentInsertedShots(rows: unknown[], columns: StoryboardColumn[]): Array<{
  scene?: string;
  duration?: string;
  content?: string;
  note?: string;
  imageAssetIds?: string[];
  customValues?: Record<string, string>;
}> {
  return rows.filter(isRecord).map((row) => ({
    scene: readStringField(row, ["scene", "类别"]) || undefined,
    duration: readStringField(row, ["duration", "时长"]) || undefined,
    content: readStringField(row, ["content", "内容"]) || undefined,
    note: readStringField(row, ["note", "备注"]) || undefined,
    imageAssetIds: readStringArrayField(row, ["imageAssetIds", "image_asset_ids"]).slice(0, 10),
    customValues: normalizeInsertedCustomValues(row, columns)
  }));
}

function normalizeInsertedCustomValues(row: Record<string, unknown>, columns: StoryboardColumn[]): Record<string, string> | undefined {
  if (!isRecord(row.customValues)) return undefined;
  const entries = readCustomValueEntries(row.customValues, columns);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function normalizeOperationCount(value: unknown): number {
  return Math.max(1, Math.min(20, normalizePositiveInteger(value) ?? 1));
}

function normalizePositiveInteger(value: unknown): number | null {
  const numberValue = typeof value === "number" ? value : typeof value === "string" ? Number.parseInt(value, 10) : NaN;
  if (!Number.isFinite(numberValue) || numberValue < 1) return null;
  return Math.round(numberValue);
}

function normalizeInsertPlacement(value: unknown): "before" | "after" | "end" {
  return value === "before" || value === "after" || value === "end" ? value : "end";
}

function normalizeReorderPlacement(value: unknown): "before" | "after" {
  return value === "after" ? "after" : "before";
}

function extractJsonObject(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (match?.[1]?.trim().startsWith("{")) return match[1].trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return null;
}

export function normalizeRows(rows: unknown[], columns: StoryboardColumn[]): StoryboardRow[] {
  return rows.filter(isRecord).map((row, index) => {
    const imageAssetIds = readStringArrayField(row, ["imageAssetIds", "image_asset_ids", "素材ids", "素材IDs"]).slice(0, 10);
    const imageAssetId = imageAssetIds[0] ?? readNullableStringField(row, ["imageAssetId", "image_asset_id", "素材id", "素材ID"]);

    return {
      id: readStringField(row, ["id"]),
      shot: String(index + 1),
      scene: readStringField(row, ["scene", "类别", "景别"], ""),
      duration: readStringField(row, ["duration", "时长", "时长（秒）"], "0"),
      content: readStringField(row, ["content", "内容", "台词拆分", "dialogue", "line"]),
      note: readStringField(row, ["note", "备注", "画面", "画面描述", "visual", "description"]),
      imageAssetIds: imageAssetIds.length > 0 ? imageAssetIds : imageAssetId ? [imageAssetId] : [],
      imageAssetId,
      customValues: normalizeCustomValues(row, columns)
    };
  });
}

function readStringArrayField(row: Record<string, unknown>, keys: string[]): string[] {
  for (const key of keys) {
    const value = row[key];
    if (!Array.isArray(value)) continue;
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
  }
  const legacyAssetId = readNullableStringField(row, ["imageAssetId", "image_asset_id", "素材id", "素材ID"]);
  return legacyAssetId ? [legacyAssetId] : [];
}

function readStringField(row: Record<string, unknown>, keys: string[], fallback = ""): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return fallback;
}

function readNullableStringField(row: Record<string, unknown>, keys: string[]): string | null {
  const value = readStringField(row, keys);
  return value || null;
}

function normalizeCustomValues(row: Record<string, unknown>, columns: StoryboardColumn[]): Record<string, string> {
  const customValues = isRecord(row.customValues) ? Object.fromEntries(readCustomValueEntries(row.customValues, columns)) : {};
  ensureVisibleCustomValuePlaceholders(columns, customValues);
  return customValues;
}

function readCustomValueEntries(value: Record<string, unknown>, columns: StoryboardColumn[]): Array<[string, string]> {
  const allowedColumnIds = new Set<string>(columns.filter((column) => column.visible && column.custom).map((column) => column.id));
  const shouldRestrictToVisibleColumns = columns.length > 0;
  const entries: Array<[string, string]> = [];
  for (const [rawKey, entry] of Object.entries(value)) {
    const key = rawKey.trim();
    if (!key || (shouldRestrictToVisibleColumns && !allowedColumnIds.has(key))) continue;
    if (typeof entry === "string") {
      entries.push([key, entry.trim()]);
    } else if (typeof entry === "number" && Number.isFinite(entry)) {
      entries.push([key, String(entry)]);
    }
  }
  return entries;
}

function ensureVisibleCustomValuePlaceholders(columns: StoryboardColumn[], customValues: Record<string, string>): void {
  columns
    .filter((column) => column.visible && column.custom)
    .forEach((column) => {
      if (isPromptPlaceholderColumn(column)) {
        if (!customValues[column.id]?.trim()) customValues[column.id] = "—";
        return;
      }
      if (!(column.id in customValues)) customValues[column.id] = "";
    });
}

function isPromptPlaceholderColumn(column: StoryboardColumn): boolean {
  return isStoryboardPromptTextColumn(column);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
