import { randomUUID } from "node:crypto";
import { isStoryboardGenerationMethodColumn, isStoryboardVideoPromptColumn } from "../shared";
import type {
  AgentEvent,
  AgentInsertedShot,
  AgentOperation,
  AgentResponse,
  AgentRowRef,
  ProjectDetail,
  StoryboardRow,
  UpdateShotInput
} from "../shared";

export type AgentOperationStore = {
  getProject(projectId: string): ProjectDetail;
  updateScript(projectId: string, scriptHtml: string): void;
  updateShot(projectId: string, input: UpdateShotInput): StoryboardRow[];
  updateShotMedia(projectId: string, rowId: string, assetIds: string[]): unknown;
  createShots(projectId: string, count: number): StoryboardRow[];
  insertShot(projectId: string, targetRowId: string, placement: "before" | "after"): StoryboardRow[];
  deleteShots(projectId: string, rowIds: string[]): StoryboardRow[];
  duplicateShots(projectId: string, rowIds: string[]): StoryboardRow[];
  replaceRows(projectId: string, rows: StoryboardRow[]): void;
};

export function applyAgentResponseWrites(
  store: AgentOperationStore,
  projectId: string,
  response: AgentResponse,
  emitAgentEvent: (agentEvent: AgentEvent) => void
): { appliedOperations: AgentOperation[]; pendingOperations: AgentOperation[] } {
  const operations = response.operations ?? [];
  const immediateOperations = operations.filter(isImmediateAgentOperation);
  const pendingOperations = operations.filter((operation) => !isImmediateAgentOperation(operation));
  const useLegacyScriptWrite = operations.length === 0;
  const hasRowUpdates = Boolean(response.rows?.length);
  const targets = [];
  if (useLegacyScriptWrite && response.scriptHtml) targets.push("脚本");
  if (hasRowUpdates) targets.push("分镜单元格");
  if (immediateOperations.length > 0) targets.push(...agentOperationTargetLabels(immediateOperations));
  if (targets.length === 0) return { appliedOperations: [], pendingOperations };

  const toolUseId = randomUUID();
  emitAgentEvent({
    kind: "status",
    label: "writing",
    detail: `正在写入${targets.join("、")}。`
  });
  emitAgentEvent({
    kind: "tool_use",
    id: toolUseId,
    name: "project_write",
    input: { targets }
  });

  try {
    if (useLegacyScriptWrite && response.scriptHtml) store.updateScript(projectId, response.scriptHtml);
    if (immediateOperations.length > 0) applyConfirmedAgentOperations(store, projectId, immediateOperations);
    if (response.rows) applyAgentRowUpdates(store, projectId, response.rows);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emitAgentEvent({
      kind: "tool_result",
      toolUseId,
      content: `写入失败：${message}`,
      isError: true
    });
    throw error;
  }

  emitAgentEvent({
    kind: "tool_result",
    toolUseId,
    content: `已写入${targets.join("、")}。`,
    isError: false
  });
  return { appliedOperations: immediateOperations, pendingOperations };
}

export function completeAgentResponseFromDirectStoryboardIntent(
  response: AgentResponse,
  detail: ProjectDetail,
  userMessage: string,
  options: { allowMediaGenerationFallback?: boolean } = {}
): AgentResponse {
  const scopedResponse = removeUnrequestedVideoGenerationOperations(response, userMessage);
  const completedCrudResponse = completeAgentResponseFromDirectCrudIntent(scopedResponse, detail, userMessage);
  if (completedCrudResponse !== scopedResponse) return dedupeAgentResponseOperations(completedCrudResponse, detail);

  const completedReorderResponse = completeAgentResponseFromDirectReorderIntent(scopedResponse, detail, userMessage);
  if (completedReorderResponse !== scopedResponse) return dedupeAgentResponseOperations(completedReorderResponse, detail);

  if (options.allowMediaGenerationFallback === false) return dedupeAgentResponseOperations(scopedResponse, detail);

  const intent = parseDirectStoryboardIntent(userMessage, detail);
  if (!intent) return dedupeAgentResponseOperations(completeAgentResponseFromBatchVideoGenerationIntent(scopedResponse, detail, userMessage), detail);

  const operations = [...(scopedResponse.operations ?? [])];
  const rowRef: AgentRowRef = { kind: "id", value: intent.row.id };
  const cells: Array<{ field: string; value: string }> = [];

  if (intent.scene && !rowsSetRowFieldToValue(scopedResponse.rows, intent.row.id, "scene", intent.scene) && !operationsUpdateRowField(detail, operations, intent.row.id, "scene")) {
    cells.push({ field: "scene", value: intent.scene });
  }

  const methodColumn = detail.columns.find(isStoryboardGenerationMethodColumn);
  if (
    intent.generationMethod &&
    methodColumn &&
    !rowsSetRowFieldToValue(scopedResponse.rows, intent.row.id, methodColumn.id, intent.generationMethod) &&
    !operationsUpdateRowField(detail, operations, intent.row.id, methodColumn.id)
  ) {
    cells.push({ field: methodColumn.id, value: intent.generationMethod });
  }

  const videoPromptColumn = detail.columns.find(isStoryboardVideoPromptColumn);
  const currentVideoPrompt = videoPromptColumn ? readStoryboardCellValue(intent.row, videoPromptColumn.id) : "";
  const targetGenerationMethod = intent.targetGenerationMethod;
  const shouldRefreshVideoPrompt =
    targetGenerationMethod &&
    intent.generateVideo &&
    videoPromptColumn &&
    (isEmptyPromptValue(currentVideoPrompt) || Boolean(intent.generationMethod && intent.generationMethod !== intent.currentGenerationMethod));
  if (
    targetGenerationMethod &&
    videoPromptColumn &&
    shouldRefreshVideoPrompt &&
    !rowsSetRowPromptFieldToUsableValue(scopedResponse.rows, intent.row.id, videoPromptColumn.id) &&
    !operationsSetRowPromptFieldToUsableValue(detail, operations, intent.row.id, videoPromptColumn.id)
  ) {
    cells.push({ field: videoPromptColumn.id, value: buildFallbackVideoPrompt(intent.row, targetGenerationMethod) });
  }

  let rows = scopedResponse.rows;
  if (cells.length > 0) {
    rows = mergeAgentRowCellUpdates(detail, scopedResponse.rows, intent.row.id, cells);
  }

  if (intent.generateImage && !operationsRegenerateRowMedia(detail, operations, intent.row.id, "image")) {
    operations.push({ type: "regenerate_media", rowRefs: [rowRef], kind: "image", overwriteExisting: true });
  }

  if (intent.generateVideo && !operationsRegenerateRowMedia(detail, operations, intent.row.id, "video")) {
    operations.push({ type: "regenerate_media", rowRefs: [rowRef], kind: "video", overwriteExisting: true });
  }

  const reply = intent.generateImage && operationsRegenerateRowMedia(detail, operations, intent.row.id, "image")
    ? appendGenerationWaitNotice(scopedResponse.reply || "已按你的要求准备生成分镜图。", userMessage)
    : intent.generateVideo && operationsRegenerateRowMedia(detail, operations, intent.row.id, "video")
      ? appendGenerationWaitNotice(scopedResponse.reply || "已按你的要求更新分镜并准备生成视频。", userMessage)
      : scopedResponse.reply;
  const fallbackReply = intent.generateImage ? "已按你的要求准备生成分镜图。" : "已按你的要求更新分镜并准备生成视频。";

  if (operations.length === (scopedResponse.operations ?? []).length && rows === scopedResponse.rows && reply === scopedResponse.reply) {
    return dedupeAgentResponseOperations(scopedResponse, detail);
  }
  return dedupeAgentResponseOperations({
    ...scopedResponse,
    operations,
    rows,
    reply: reply || fallbackReply
  }, detail);
}

function completeAgentResponseFromDirectCrudIntent(response: AgentResponse, detail: ProjectDetail, userMessage: string): AgentResponse {
  const insertIntent = parseDirectInsertIntent(userMessage, detail);
  if (insertIntent) {
    const operations = filterDirectIntentStructuralOperations(response.operations ?? [], new Set(["insert_shots"]));
    if (!operationsInsertRows(detail, operations, insertIntent)) {
      operations.push({
        type: "insert_shots",
        ...(insertIntent.targetRow ? { rowRef: { kind: "id", value: insertIntent.targetRow.id } as AgentRowRef } : {}),
        placement: insertIntent.placement,
        count: insertIntent.count,
        rows: insertIntent.rows
      });
    }
    return operations.length === (response.operations ?? []).length
      ? response
      : { ...response, operations, reply: response.reply || "已准备插入分镜，确认后会新增分镜。" };
  }

  const duplicateIntent = parseDirectDuplicateIntent(userMessage, detail);
  if (duplicateIntent) {
    const operations = filterDirectIntentStructuralOperations(response.operations ?? [], new Set(["duplicate_shots"]));
    if (!operationsDuplicateRows(detail, operations, [duplicateIntent.row.id])) {
      operations.push({ type: "duplicate_shots", rowRefs: [{ kind: "id", value: duplicateIntent.row.id }] });
    }
    return operations.length === (response.operations ?? []).length
      ? response
      : { ...response, operations, reply: response.reply || "已准备复制分镜，确认后会新增副本。" };
  }

  const deleteIntent = parseDirectDeleteIntent(userMessage, detail);
  if (deleteIntent) {
    const rowIds = deleteIntent.rows.map((row) => row.id);
    const operations = filterDirectIntentStructuralOperations(response.operations ?? [], new Set(["delete_shots"]));
    if (!operationsDeleteRows(detail, operations, rowIds)) {
      operations.push({ type: "delete_shots", rowRefs: rowIds.map((rowId): AgentRowRef => ({ kind: "id", value: rowId })) });
    }
    return operations.length === (response.operations ?? []).length
      ? response
      : { ...response, operations, reply: response.reply || "已准备删除分镜，确认后会更新分镜表。" };
  }

  return response;
}

function completeAgentResponseFromDirectReorderIntent(response: AgentResponse, detail: ProjectDetail, userMessage: string): AgentResponse {
  const intent = parseDirectReorderIntent(userMessage, detail);
  if (!intent) return response;

  const operations = filterDirectIntentStructuralOperations(response.operations ?? [], new Set(["reorder_shot"]));
  if (!operationsReorderRow(detail, operations, intent.sourceRow.id, intent.targetRow.id, intent.placement)) {
    operations.push({
      type: "reorder_shot",
      rowRef: { kind: "id", value: intent.sourceRow.id },
      targetRowRef: { kind: "id", value: intent.targetRow.id },
      placement: intent.placement
    });
  }

  if (operations.length === (response.operations ?? []).length) return response;
  return {
    ...response,
    operations,
    reply: response.reply || "已准备移动分镜，确认后会更新分镜顺序。"
  };
}

function filterDirectIntentStructuralOperations(operations: AgentOperation[], allowedTypes: Set<AgentOperation["type"]>): AgentOperation[] {
  return operations.filter((operation) => !isStructuralAgentOperation(operation) || allowedTypes.has(operation.type));
}

function removeUnrequestedVideoGenerationOperations(response: AgentResponse, userMessage: string): AgentResponse {
  if (!messageTargetsImageGeneration(userMessage) || !response.operations?.length) return response;
  const operations = response.operations.filter((operation) => operation.type !== "regenerate_media" || operation.kind !== "video");
  return operations.length === response.operations.length ? response : { ...response, operations };
}

function completeAgentResponseFromBatchVideoGenerationIntent(response: AgentResponse, detail: ProjectDetail, userMessage: string): AgentResponse {
  const intent = parseBatchVideoGenerationIntent(userMessage, detail);
  if (!intent) return response;

  const operations = [...(response.operations ?? [])];
  const videoPromptColumn = detail.columns.find(isStoryboardVideoPromptColumn);
  let rows = response.rows;

  for (const target of intent.targets) {
    if (
      videoPromptColumn &&
      isEmptyPromptValue(readStoryboardCellValue(target.row, videoPromptColumn.id)) &&
      !rowsSetRowPromptFieldToUsableValue(rows, target.row.id, videoPromptColumn.id) &&
      !operationsSetRowPromptFieldToUsableValue(detail, operations, target.row.id, videoPromptColumn.id)
    ) {
      rows = mergeAgentRowCellUpdates(detail, rows, target.row.id, [{ field: videoPromptColumn.id, value: buildFallbackVideoPrompt(target.row, target.method) }]);
    }
  }

  const missingRowRefs = intent.targets
    .filter((target) => !operationsRegenerateRowMedia(detail, operations, target.row.id, "video"))
    .map((target): AgentRowRef => ({ kind: "id", value: target.row.id }));

  if (missingRowRefs.length > 0) {
    operations.push({ type: "regenerate_media", rowRefs: missingRowRefs, kind: "video", overwriteExisting: true });
  }

  const hasVideoGenerationOperation = intent.targets.some((target) => operationsRegenerateRowMedia(detail, operations, target.row.id, "video"));
  const reply = hasVideoGenerationOperation ? appendGenerationWaitNotice(response.reply || `已准备生成 ${intent.targets.length} 个分镜视频。`, userMessage) : response.reply;

  if (operations.length === (response.operations ?? []).length && rows === response.rows && reply === response.reply) return dedupeAgentResponseOperations(response, detail);
  return dedupeAgentResponseOperations({
    ...response,
    operations,
    rows,
    reply: reply || `已准备生成 ${intent.targets.length} 个分镜视频。`
  }, detail);
}

function dedupeAgentResponseOperations(response: AgentResponse, detail: ProjectDetail): AgentResponse {
  const operations = response.operations;
  if (!operations || operations.length < 1) return response;

  const seenOperationKeys = new Set<string>();
  const nextOperations: AgentOperation[] = [];
  for (const operation of operations) {
    const operationKey = dedupableAgentOperationKey(detail, operation);
    if (operationKey) {
      if (seenOperationKeys.has(operationKey)) continue;
      seenOperationKeys.add(operationKey);
    }
    nextOperations.push(operation);
  }

  const rows = hasStructuralPendingAgentOperation(nextOperations) ? undefined : response.rows;
  return nextOperations.length === operations.length && rows === response.rows ? response : { ...response, operations: nextOperations, rows };
}

function dedupableAgentOperationKey(detail: ProjectDetail, operation: AgentOperation): string | null {
  if (operation.type === "regenerate_media") return regenerateMediaOperationKey(detail, operation);
  if (operation.type === "duplicate_shots") return rowRefsOperationKey(detail, "duplicate_shots", operation.rowRefs);
  if (operation.type === "delete_shots") return rowRefsOperationKey(detail, "delete_shots", operation.rowRefs);
  if (operation.type === "reorder_shot") {
    const sourceRowId = resolveAgentRowRefInDetail(detail, operation.rowRef) ?? `${operation.rowRef.kind}:${operation.rowRef.value}`;
    const targetRowId = resolveAgentRowRefInDetail(detail, operation.targetRowRef) ?? `${operation.targetRowRef.kind}:${operation.targetRowRef.value}`;
    return `reorder_shot:${sourceRowId}:${operation.placement}:${targetRowId}`;
  }
  return null;
}

function hasStructuralPendingAgentOperation(operations: AgentOperation[]): boolean {
  return operations.some(isStructuralAgentOperation);
}

function isStructuralAgentOperation(operation: AgentOperation): boolean {
  return operation.type === "parse_storyboard" || operation.type === "insert_shots" || operation.type === "delete_shots" || operation.type === "duplicate_shots" || operation.type === "reorder_shot";
}

function regenerateMediaOperationKey(detail: ProjectDetail, operation: Extract<AgentOperation, { type: "regenerate_media" }>): string {
  const rowIds = normalizedRowRefKeyValues(detail, operation.rowRefs);
  return `regenerate_media:${operation.provider ?? "default"}:${operation.kind}:${operation.overwriteExisting ? "overwrite" : "missing"}:${rowIds.join(",")}`;
}

function rowRefsOperationKey(detail: ProjectDetail, type: "duplicate_shots" | "delete_shots", rowRefs: AgentRowRef[]): string {
  return `${type}:${normalizedRowRefKeyValues(detail, rowRefs).join(",")}`;
}

function normalizedRowRefKeyValues(detail: ProjectDetail, rowRefs: AgentRowRef[]): string[] {
  return rowRefs.map((rowRef) => resolveAgentRowRefInDetail(detail, rowRef) ?? `${rowRef.kind}:${rowRef.value}`).sort();
}

function appendGenerationWaitNotice(reply: string, userMessage: string): string {
  const base = reply.trim();
  if (replyMentionsGenerationWait(base)) return base;
  const useChinese = /[\u3400-\u9fff]/.test(`${base}\n${userMessage}`);
  const notice = useChinese
    ? "请耐心等待，生成完成后结果会自动回到对应镜头。"
    : "Please wait while generation finishes; the result will appear on the shot when it is ready.";
  if (!base) return notice;
  const separator = /[。！？.!?]$/.test(base) ? " " : useChinese ? "。" : ". ";
  return `${base}${separator}${notice}`;
}

function replyMentionsGenerationWait(reply: string): boolean {
  return /耐心等待|等待.{0,8}生成完成|生成完成后|完成后.{0,20}(?:回到|显示|更新|出现)|please wait|wait (?:for|while)|when (?:it|generation|the generation).{0,30}(?:ready|complete|finishes)/i.test(reply);
}

export function attachAgentImageAttachmentsToRegeneratedVideoRows(response: AgentResponse, detail: ProjectDetail, attachmentAssetIds: string[]): AgentResponse {
  const operations = response.operations ?? [];
  if (operations.length === 0 || attachmentAssetIds.length === 0) return response;

  const imageAttachmentIds = uniqueAssetIds(attachmentAssetIds).filter((assetId) => detail.assets.some((asset) => asset.id === assetId && asset.kind === "image"));
  if (imageAttachmentIds.length === 0) return response;

  const videoRowIds = new Set<string>();
  for (const operation of operations) {
    if (operation.type !== "regenerate_media" || operation.kind !== "video") continue;
    for (const rowRef of operation.rowRefs) {
      const rowId = resolveAgentRowRefInDetail(detail, rowRef);
      if (rowId) videoRowIds.add(rowId);
    }
  }
  if (videoRowIds.size === 0) return response;

  const rowById = new Map(detail.rows.map((row) => [row.id, row]));
  const handledRowIds = new Set<string>();
  let changed = false;
  const nextOperations = operations.map((operation): AgentOperation => {
    if (operation.type !== "update_shot_media") return operation;
    const rowId = resolveAgentRowRefInDetail(detail, operation.rowRef);
    if (!rowId || !videoRowIds.has(rowId)) return operation;
    handledRowIds.add(rowId);
    const mergedAssetIds = mergeAssetIds(operation.assetIds, imageAttachmentIds);
    if (arraysEqual(mergedAssetIds, operation.assetIds)) return operation;
    changed = true;
    return {
      ...operation,
      assetIds: mergedAssetIds
    };
  });

  for (const rowId of videoRowIds) {
    if (handledRowIds.has(rowId)) continue;
    const row = rowById.get(rowId);
    if (!row) continue;
    const nextAssetIds = mergeAssetIds(row.imageAssetIds ?? (row.imageAssetId ? [row.imageAssetId] : []), imageAttachmentIds);
    if (arraysEqual(nextAssetIds, row.imageAssetIds ?? (row.imageAssetId ? [row.imageAssetId] : []))) continue;
    nextOperations.push({
      type: "update_shot_media",
      rowRef: { kind: "id", value: rowId },
      assetIds: nextAssetIds
    });
    changed = true;
  }

  return changed ? { ...response, operations: nextOperations } : response;
}

export function summarizeAgentResult(response: {
  scriptHtml?: string;
  rows?: unknown[];
  appliedOperations?: AgentOperation[];
  pendingOperations?: AgentOperation[];
}): string {
  const changes = [];
  if (response.scriptHtml) changes.push("脚本已更新");
  if (response.rows) changes.push("分镜单元格已更新");
  if (response.appliedOperations && response.appliedOperations.length > 0) changes.push(summarizeAgentOperations(response.appliedOperations));
  if (response.pendingOperations && response.pendingOperations.length > 0) changes.push(`${response.pendingOperations.length} 个操作等待确认`);
  return changes.length > 0 ? changes.join("，") : "本次没有写入脚本或分镜变更";
}

export function isImmediateAgentOperation(operation: AgentOperation): boolean {
  return operation.type === "update_script" || operation.type === "sync_script_a_roll_tags" || operation.type === "update_shot_cells" || operation.type === "update_shot_media";
}

export function applyConfirmedAgentOperations(store: AgentOperationStore, projectId: string, operations: AgentOperation[]): AgentOperation[] {
  const appliedOperations: AgentOperation[] = [];
  for (const operation of operations) {
    if (operation.type === "parse_storyboard") {
      throw new Error("重新解析分镜需要在客户端确认后通过 AI 解析分镜入口执行。");
    }
    if (operation.type === "regenerate_media") {
      throw new Error("媒体生成操作需要在客户端确认后通过生成队列执行。");
    }
    applyAgentOperation(store, projectId, operation);
    appliedOperations.push(operation);
  }
  return appliedOperations;
}

function applyAgentOperation(store: AgentOperationStore, projectId: string, operation: Exclude<AgentOperation, { type: "parse_storyboard" } | { type: "regenerate_media" }>): void {
  if (operation.type === "update_script" || operation.type === "sync_script_a_roll_tags") {
    store.updateScript(projectId, operation.scriptHtml);
    return;
  }
  if (operation.type === "update_shot_cells") {
    const rowId = resolveAgentRowRef(store, projectId, operation.rowRef);
    for (const cell of operation.cells) {
      const field = normalizeAgentShotField(store, projectId, cell.field);
      store.updateShot(projectId, { id: rowId, field, value: cell.value });
    }
    return;
  }
  if (operation.type === "insert_shots") {
    insertAgentShots(store, projectId, operation);
    return;
  }
  if (operation.type === "delete_shots") {
    store.deleteShots(projectId, uniqueResolvedRowIds(store, projectId, operation.rowRefs));
    return;
  }
  if (operation.type === "duplicate_shots") {
    store.duplicateShots(projectId, uniqueResolvedRowIds(store, projectId, operation.rowRefs));
    return;
  }
  if (operation.type === "reorder_shot") {
    reorderAgentShot(store, projectId, operation.rowRef, operation.targetRowRef, operation.placement);
    return;
  }
  if (operation.type === "update_shot_media") {
    store.updateShotMedia(projectId, resolveAgentRowRef(store, projectId, operation.rowRef), operation.assetIds);
  }
}

type DirectStoryboardIntent = {
  row: StoryboardRow;
  scene?: "A-ROLL" | "B-ROLL";
  generationMethod?: "Seedance 2.0" | "Hyperframes";
  currentGenerationMethod?: "Seedance 2.0" | "Hyperframes";
  targetGenerationMethod?: "Seedance 2.0" | "Hyperframes";
  generateImage: boolean;
  generateVideo: boolean;
};

type BatchVideoGenerationIntent = {
  targets: Array<{
    row: StoryboardRow;
    method: "Seedance 2.0" | "Hyperframes";
  }>;
};

type DirectReorderIntent = {
  sourceRow: StoryboardRow;
  targetRow: StoryboardRow;
  placement: "before" | "after";
};

type DirectInsertIntent = {
  targetRow?: StoryboardRow;
  placement: "before" | "after" | "end";
  count: number;
  rows: AgentInsertedShot[];
};

type DirectDuplicateIntent = {
  row: StoryboardRow;
};

type DirectDeleteIntent = {
  rows: StoryboardRow[];
};

function parseDirectStoryboardIntent(message: string, detail: ProjectDetail): DirectStoryboardIntent | null {
  const rowIndex = readRequestedShotIndex(message);
  if (!rowIndex) return null;
  const row = detail.rows[rowIndex - 1];
  if (!row) return null;
  if (messageAsksAboutGenerationProblem(message)) return null;

  const scene = readRequestedStoryboardScene(message);
  const requestedGenerationMethod = readRequestedVideoGenerationMethod(message);
  const currentGenerationMethod = readStoryboardRowVideoGenerationMethod(row, detail);
  const targetGenerationMethod = requestedGenerationMethod ?? currentGenerationMethod;
  const generateImage = messageRequestsVideoGeneration(message) && messageTargetsImageGeneration(message);
  const generateVideo = Boolean(targetGenerationMethod && messageRequestsVideoGeneration(message) && !messageTargetsImageGeneration(message));
  if (!scene && !requestedGenerationMethod && !generateImage && !generateVideo) return null;

  return {
    row,
    scene,
    generationMethod: requestedGenerationMethod,
    currentGenerationMethod,
    targetGenerationMethod,
    generateImage,
    generateVideo
  };
}

function parseBatchVideoGenerationIntent(message: string, detail: ProjectDetail): BatchVideoGenerationIntent | null {
  if (messageAsksAboutGenerationProblem(message)) return null;
  if (!messageRequestsVideoGeneration(message)) return null;
  if (!messageTargetsVideoGeneration(message)) return null;
  if (!messageRequestsBatchVideoGeneration(message)) return null;

  const requestedGenerationMethod = readRequestedVideoGenerationMethod(message);
  const targets = detail.rows.flatMap((row) => {
    if (isArollStoryboardRow(row)) return [];
    const method = readStoryboardRowVideoGenerationMethod(row, detail);
    if (!method) return [];
    if (requestedGenerationMethod && method !== requestedGenerationMethod) return [];
    return [{ row, method }];
  });

  return targets.length > 0 ? { targets } : null;
}

function parseDirectReorderIntent(message: string, detail: ProjectDetail): DirectReorderIntent | null {
  if (!/(移动|移到|移至|挪到|挪至|调整.{0,8}顺序|排序|move|reorder)/i.test(message)) return null;
  const placement = readRequestedReorderPlacement(message);
  const targetIndex = readRequestedReorderTargetIndex(message);
  if (!placement || !targetIndex) return null;
  const targetRow = detail.rows[targetIndex - 1];
  if (!targetRow) return null;

  const sourceRow = readRequestedReorderSourceRow(message, detail);
  if (!sourceRow || sourceRow.id === targetRow.id) return null;
  return { sourceRow, targetRow, placement };
}

function parseDirectInsertIntent(message: string, detail: ProjectDetail): DirectInsertIntent | null {
  if (!/(新增|插入|添加|insert|add)/i.test(message)) return null;
  if (messageNegatesInsert(message)) return null;
  if (!/(分镜|分鏡|镜头|鏡頭|镜|鏡|A-?ROLL|B-?ROLL|shot)/i.test(message)) return null;
  const placement = readRequestedInsertPlacement(message);
  const targetIndex = readRequestedInsertTargetIndex(message);
  const targetRow = targetIndex ? detail.rows[targetIndex - 1] : undefined;
  if (targetIndex && !targetRow) return null;

  const count = readRequestedInsertCount(message);
  const draft = readRequestedInsertedShotDraft(message);
  const rows = Array.from({ length: count }, (_, index): AgentInsertedShot => (index === 0 ? draft : {}));
  return { targetRow, placement: targetRow ? placement : "end", count, rows };
}

function messageNegatesInsert(message: string): boolean {
  return /(?:不要|不需要|不用|不|别|別|未|没有|沒有|不要再|不要额外|不要額外)[^。！？.!?]{0,12}?(?:新增|插入|添加|insert|add)/i.test(message);
}

function parseDirectDuplicateIntent(message: string, detail: ProjectDetail): DirectDuplicateIntent | null {
  if (!/(复制|拷贝|副本|duplicate|copy)/i.test(message)) return null;
  const row = readRequestedCrudSourceRows(message, detail, { allowMultipleContentMatches: false })[0];
  return row ? { row } : null;
}

function parseDirectDeleteIntent(message: string, detail: ProjectDetail): DirectDeleteIntent | null {
  if (!/(删除|移除|删掉|刪掉|删去|刪去|delete|remove)/i.test(message)) return null;
  const rows = readRequestedCrudSourceRows(message, detail, { allowMultipleContentMatches: messageRequestsAllMatches(message) });
  return rows.length > 0 ? { rows } : null;
}

function readRequestedReorderPlacement(message: string): "before" | "after" | null {
  if (/之前|前面|前边|前方|before/i.test(message)) return "before";
  if (/之后|後面|后面|后边|後邊|后方|after/i.test(message)) return "after";
  return null;
}

function readRequestedInsertPlacement(message: string): "before" | "after" | "end" {
  if (/之前|前面|前边|前方|before/i.test(message)) return "before";
  if (/之后|後面|后面|后边|後邊|后方|after/i.test(message)) return "after";
  return "end";
}

function readRequestedInsertTargetIndex(message: string): number | null {
  const numberPattern = String.raw`(\d{1,3}|[一二两三四五六七八九十]{1,3})`;
  const patterns = [
    new RegExp(String.raw`第\s*${numberPattern}\s*(?:个|個)?\s*(?:镜头|鏡頭|分镜|分鏡|镜|鏡|shot)\s*(?:之前|前面|前边|前方|之后|後面|后面|后边|後邊|后方|before|after)`, "i"),
    new RegExp(String.raw`(?:在|到|至|after|before)[\s\S]{0,8}?第?\s*${numberPattern}\s*(?:个|個)?\s*(?:镜头|鏡頭|分镜|分鏡|镜|鏡|shot)`, "i")
  ];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    const token = match?.[1];
    const value = token ? parseShotNumberToken(token) : null;
    if (value) return value;
  }
  return null;
}

function readRequestedInsertCount(message: string): number {
  const numberPattern = String.raw`(\d{1,2}|[一二两三四五六七八九十]{1,3})`;
  const patterns = [
    new RegExp(String.raw`(?:新增|插入|添加|insert|add)[\s\S]{0,12}?${numberPattern}\s*(?:个|個|条|條|镜|鏡|shot)?`, "i"),
    new RegExp(String.raw`${numberPattern}\s*(?:个|個|条|條)\s*(?:B-?ROLL|A-?ROLL|分镜|分鏡|镜头|鏡頭|shot)`, "i")
  ];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    const token = match?.[1];
    const value = token ? parseShotNumberToken(token) : null;
    if (value) return Math.max(1, Math.min(20, value));
  }
  return 1;
}

function readRequestedInsertedShotDraft(message: string): AgentInsertedShot {
  const scene = readRequestedStoryboardScene(message);
  const content = readLabeledQuotedValue(message, "内容");
  const note = readLabeledQuotedValue(message, "备注");
  return {
    ...(scene ? { scene } : {}),
    ...(content ? { content } : {}),
    ...(note ? { note } : {})
  };
}

function readLabeledQuotedValue(message: string, label: string): string | null {
  const pattern = new RegExp(`${label}\\s*(?:必须)?\\s*(?:是|为|寫|写|填|=|:|：)\\s*[“「\"']([^”」\"']+)[”」\"']`);
  const match = message.match(pattern);
  return match?.[1]?.trim() || null;
}

function readRequestedReorderTargetIndex(message: string): number | null {
  const numberPattern = String.raw`(\d{1,3}|[一二两三四五六七八九十]{1,3})`;
  const patterns = [
    new RegExp(String.raw`(?:移动|移到|移至|挪到|挪至|move|reorder)[\s\S]{0,40}?(?:到|至|在|before|after)?\s*第?\s*${numberPattern}\s*(?:个|個)?\s*(?:镜头|鏡頭|分镜|分鏡|镜|鏡|shot)?\s*(?:之前|前面|前边|前方|之后|後面|后面|后边|後邊|后方|before|after)`, "i"),
    new RegExp(String.raw`第?\s*${numberPattern}\s*(?:个|個)?\s*(?:镜头|鏡頭|分镜|分鏡|镜|鏡|shot)?\s*(?:之前|前面|前边|前方|之后|後面|后面|后边|後邊|后方|before|after)`, "i")
  ];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    const token = match?.[1];
    const value = token ? parseShotNumberToken(token) : null;
    if (value) return value;
  }
  return null;
}

function readRequestedReorderSourceRow(message: string, detail: ProjectDetail): StoryboardRow | null {
  const content = readQuotedContentTarget(message);
  if (content) {
    return detail.rows.find((row) => row.content.trim() === content) ?? detail.rows.find((row) => row.content.includes(content)) ?? null;
  }

  const explicitIndex = readRequestedSourceShotIndex(message, { verbs: "(?:移动|移到|移至|挪到|挪至|move|reorder)" });
  if (explicitIndex) return detail.rows[explicitIndex - 1] ?? null;
  return null;
}

function readRequestedCrudSourceRows(message: string, detail: ProjectDetail, options: { allowMultipleContentMatches: boolean }): StoryboardRow[] {
  const content = readQuotedContentTarget(message);
  if (content) {
    const exactMatches = detail.rows.filter((row) => row.content.trim() === content);
    const matches = exactMatches.length > 0 ? exactMatches : detail.rows.filter((row) => row.content.includes(content));
    return options.allowMultipleContentMatches ? matches : matches.slice(0, 1);
  }

  const explicitIndex = readRequestedSourceShotIndex(message);
  if (explicitIndex) {
    const row = detail.rows[explicitIndex - 1];
    return row ? [row] : [];
  }

  return [];
}

function readRequestedSourceShotIndex(message: string, options?: { verbs?: string }): number | null {
  const numberPattern = String.raw`(\d{1,3}|[一二两三四五六七八九十]{1,3})`;
  const verbs = options?.verbs ?? "(?:复制|拷贝|删除|移除|删掉|刪掉|删去|刪去|移动|移到|移至|挪到|挪至|duplicate|copy|delete|remove|move|reorder)";
  const explicitShotPattern = String.raw`(?:第\s*${numberPattern}\s*(?:个|個)?\s*(?:镜头|鏡頭|分镜|分鏡|镜|鏡|shot)|${numberPattern}\s*号\s*(?:镜头|鏡頭|分镜|分鏡|镜|鏡|shot)|shot\s*#?\s*${numberPattern})`;
  const patterns = [
    new RegExp(String.raw`(?:把|将|將)?\s*${explicitShotPattern}[\s\S]{0,24}?${verbs}`, "i"),
    new RegExp(String.raw`${verbs}[\s\S]{0,24}?${explicitShotPattern}`, "i")
  ];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    const token = [match?.[1], match?.[2], match?.[3]].find(Boolean);
    const value = token ? parseShotNumberToken(token) : null;
    if (value) return value;
  }
  return null;
}

function messageRequestsAllMatches(message: string): boolean {
  return /全部|所有|全量|每(?:个|個|一)|all|every/i.test(message);
}

function readQuotedContentTarget(message: string): string | null {
  const patterns = [
    /内容\s*(?:为|是|=|:|：)\s*[“「"']([^”」"']+)[”」"']/,
    /content\s*(?:is|=|:)\s*[“「"']([^”」"']+)[”」"']/i,
    /[“「"']([^”」"']+)[”」"']/
  ];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    const value = match?.[1]?.trim();
    if (value) return value;
  }
  return null;
}

function messageRequestsBatchVideoGeneration(message: string): boolean {
  return /全部|所有|全量|批量|每(?:个|個|一)|all|every|batch/i.test(message);
}

function messageTargetsVideoGeneration(message: string): boolean {
  if (messageExplicitlyTargetsVideoGeneration(message)) return true;
  if (messageExplicitlyTargetsImageGeneration(message)) return false;
  return Boolean(readRequestedVideoGenerationMethod(message));
}

function messageTargetsImageGeneration(message: string): boolean {
  if (messageExplicitlyTargetsVideoGeneration(message)) return false;
  return messageExplicitlyTargetsImageGeneration(message);
}

function messageExplicitlyTargetsVideoGeneration(message: string): boolean {
  return /视频|影片|動畫|动画|动效|动态|video|animation|motion|render/i.test(message);
}

function messageExplicitlyTargetsImageGeneration(message: string): boolean {
  return /图片|圖片|图像|圖像|分镜图|分鏡圖|镜头图|鏡頭圖|参考图|參考圖|四宫格|四宮格|生图|生圖|出图|出圖|image|picture|storyboard\s+(?:image|frame)|reference\s+(?:image|frame)/i.test(message);
}

function readRequestedShotIndex(message: string): number | null {
  const numberPattern = String.raw`(\d{1,3}|[一二两三四五六七八九十]{1,3})`;
  const patterns = [
    new RegExp(String.raw`(?:镜头|鏡頭|分镜|分鏡|镜|鏡|shot)\s*#?\s*${numberPattern}`, "i"),
    new RegExp(String.raw`第\s*${numberPattern}\s*(?:个|個)?\s*(?:镜头|鏡頭|分镜|分鏡|镜|鏡|shot)`, "i"),
    new RegExp(String.raw`${numberPattern}\s*号?\s*(?:镜头|鏡頭|分镜|分鏡|镜|鏡)`, "i")
  ];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    const token = match?.[1];
    const value = token ? parseShotNumberToken(token) : null;
    if (value) return value;
  }
  return null;
}

function parseShotNumberToken(token: string): number | null {
  const numeric = Number.parseInt(token, 10);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;

  const digits: Record<string, number> = {
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9
  };
  if (token === "十") return 10;
  if (token.startsWith("十")) return 10 + (digits[token.slice(1)] ?? 0);
  if (token.endsWith("十")) return (digits[token.slice(0, -1)] ?? 0) * 10;
  const tenIndex = token.indexOf("十");
  if (tenIndex > 0) {
    const tens = digits[token.slice(0, tenIndex)] ?? 0;
    const ones = digits[token.slice(tenIndex + 1)] ?? 0;
    return tens > 0 ? tens * 10 + ones : null;
  }
  return digits[token] ?? null;
}

function readRequestedStoryboardScene(message: string): "A-ROLL" | "B-ROLL" | undefined {
  if (/(^|[^a-z])b\s*-?\s*roll([^a-z]|$)|broll/i.test(message)) return "B-ROLL";
  if (/(^|[^a-z])a\s*-?\s*roll([^a-z]|$)|aroll/i.test(message)) return "A-ROLL";
  return undefined;
}

function readRequestedVideoGenerationMethod(message: string): "Seedance 2.0" | "Hyperframes" | undefined {
  if (/hyper\s*-?\s*frames?|hyperframe/i.test(message)) return "Hyperframes";
  if (/seedance(?:\s*2(?:\.0)?)?|即梦|即夢/i.test(message)) return "Seedance 2.0";
  return undefined;
}

function buildFallbackVideoPrompt(row: StoryboardRow, method: "Seedance 2.0" | "Hyperframes"): string {
  if (method === "Seedance 2.0") return buildFallbackSeedanceVideoPrompt(row);
  return buildFallbackHyperframesVideoPrompt(row);
}

function buildFallbackHyperframesVideoPrompt(row: StoryboardRow): string {
  const source = buildFallbackVideoPromptSource(row);
  return fallbackVideoPromptUsesChinese(row)
    ? `全画幅构图。${source || "根据当前镜头内容设计必要的画面变化"}。沿用已绑定参考素材，不复述主体或场景。无 BGM，只保留匹配画面动作或环境的音效；相邻 Shot 硬切，不做转场动画。`
    : `Full-frame composition. ${source || "Design only the visual changes needed for the current shot"}. Follow bound references without restating the subject or scene. No BGM; use only sound effects tied to visible actions or ambience. Hard cut between shots with no transition animation.`;
}

function buildFallbackSeedanceVideoPrompt(row: StoryboardRow): string {
  const source = buildFallbackVideoPromptSource(row);
  return fallbackVideoPromptUsesChinese(row)
    ? `根据这个镜头的分镜参考图生成视频。景别沿用参考图；若参考图未明确，则使用中景。${source || "表现当前镜头中发生的动作"}。不复述参考主体或场景。无 BGM，只生成匹配动作或环境的音效；相邻 Shot 硬切，不做转场动画。`
    : `Generate the video from this shot's storyboard reference image. Follow its shot size, or use a medium shot when framing is unspecified. ${source || "Show what happens in the current shot"}. Do not restate the referenced subject or scene. No BGM; generate only action- or ambience-matched sound effects. Hard cut between shots with no transition animation.`;
}

function buildFallbackVideoPromptSource(row: StoryboardRow): string {
  const source = [row.content, row.note].map((value) => value.trim()).filter(Boolean).join(" ").replace(/\s+/g, " ");
  return source.length > 240 ? `${source.slice(0, 237).trimEnd()}…` : source;
}

function fallbackVideoPromptUsesChinese(row: StoryboardRow): boolean {
  return /[\u3400-\u9fff]/u.test(`${row.content}\n${row.note}`);
}

function messageRequestsVideoGeneration(message: string): boolean {
  return /生成|重生成|重新生成|出(?:视频|影片|片|動畫|动画|动效)?|做(?:视频|影片|動畫|动画|动效)|渲染|render|generate|regenerate/i.test(message);
}

function messageAsksAboutGenerationProblem(message: string): boolean {
  if (!/为什么|為什麼|为何|為何|怎么回事|原因|报错|報錯|没有生成|沒有生成|没生成|沒生成|无法生成|無法生成|不能生成|why|error|failed|cannot|can't/i.test(message)) return false;
  return !/帮我|幫我|请|請|修复|修復|重试|重試|继续|繼續|重新生成|再生成|直接生成|fix|retry|continue|regenerate/i.test(message);
}

function readStoryboardRowVideoGenerationMethod(row: StoryboardRow, detail: ProjectDetail): "Seedance 2.0" | "Hyperframes" | undefined {
  const methodColumn = detail.columns.find(isStoryboardGenerationMethodColumn);
  const method = methodColumn ? readStoryboardCellValue(row, methodColumn.id).trim() : "";
  if (/^(c[-\s]?dance|seedance(?:\s*2(?:\.0)?)?|即梦|即夢)$/i.test(method)) return "Seedance 2.0";
  if (/^hyper(?:front|frames?)$/i.test(method)) return "Hyperframes";
  return undefined;
}

function isArollStoryboardRow(row: StoryboardRow): boolean {
  return /(^|[^a-z])a\s*-?\s*roll([^a-z]|$)/i.test(row.scene);
}

function isEmptyPromptValue(value: string): boolean {
  const normalized = value.trim();
  return !normalized || normalized === "—" || normalized === "-";
}

function operationsUpdateRowField(detail: ProjectDetail, operations: AgentOperation[], rowId: string, field: string): boolean {
  return operations.some((operation) => {
    if (operation.type !== "update_shot_cells") return false;
    if (!agentRowRefMatchesRow(detail, operation.rowRef, rowId)) return false;
    return operation.cells.some((cell) => normalizeFieldKey(cell.field) === normalizeFieldKey(field));
  });
}

function operationsSetRowPromptFieldToUsableValue(detail: ProjectDetail, operations: AgentOperation[], rowId: string, field: string): boolean {
  return operations.some((operation) => {
    if (operation.type !== "update_shot_cells") return false;
    if (!agentRowRefMatchesRow(detail, operation.rowRef, rowId)) return false;
    return operation.cells.some((cell) => normalizeFieldKey(cell.field) === normalizeFieldKey(field) && !isEmptyPromptValue(cell.value));
  });
}

function rowsSetRowFieldToValue(rows: AgentResponse["rows"] | undefined, rowId: string, field: string, value: string): boolean {
  const row = rows?.find((item) => item.id === rowId);
  if (!row) return false;
  return normalizeFieldComparableValue(readStoryboardCellValue(row, field)) === normalizeFieldComparableValue(value);
}

function rowsSetRowPromptFieldToUsableValue(rows: AgentResponse["rows"] | undefined, rowId: string, field: string): boolean {
  const row = rows?.find((item) => item.id === rowId);
  return Boolean(row && !isEmptyPromptValue(readStoryboardCellValue(row, field)));
}

function mergeAgentRowCellUpdates(detail: ProjectDetail, rows: AgentResponse["rows"] | undefined, rowId: string, cells: Array<{ field: string; value: string }>): StoryboardRow[] {
  const baseRows = buildAgentRowPatchBase(detail, rows);
  return baseRows.map((row) => {
    if (row.id !== rowId) return row;
    const nextRow = cloneStoryboardRow(row);
    for (const cell of cells) {
      assignStoryboardCellValue(nextRow, cell.field, cell.value);
    }
    return nextRow;
  });
}

function buildAgentRowPatchBase(detail: ProjectDetail, rows: AgentResponse["rows"] | undefined): StoryboardRow[] {
  if (!rows?.length) return detail.rows.map(cloneStoryboardRow);

  const currentById = new Map(detail.rows.map((row) => [row.id, row]));
  const incomingIds = rows.map((row) => row.id).filter(Boolean);
  const canUseIncomingRows = incomingIds.length === rows.length && new Set(incomingIds).size === incomingIds.length && incomingIds.every((id) => currentById.has(id));
  if (!canUseIncomingRows) return detail.rows.map(cloneStoryboardRow);

  const patchById = new Map(rows.map((row) => [row.id, row]));
  return detail.rows.map((row) => cloneStoryboardRow(patchById.get(row.id) ?? row));
}

function assignStoryboardCellValue(row: StoryboardRow, field: string, value: string): void {
  if (field === "scene" || field === "duration" || field === "content" || field === "note") {
    row[field] = value;
    return;
  }
  row.customValues = { ...(row.customValues ?? {}), [field]: value };
}

function cloneStoryboardRow(row: StoryboardRow): StoryboardRow {
  return {
    ...row,
    imageAssetIds: [...(row.imageAssetIds ?? [])],
    customValues: { ...(row.customValues ?? {}) }
  };
}

function normalizeFieldComparableValue(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function operationsRegenerateRowMedia(detail: ProjectDetail, operations: AgentOperation[], rowId: string, kind: "image" | "video"): boolean {
  return operations.some((operation) => operation.type === "regenerate_media" && operation.kind === kind && operation.rowRefs.some((rowRef) => agentRowRefMatchesRow(detail, rowRef, rowId)));
}

function operationsInsertRows(detail: ProjectDetail, operations: AgentOperation[], intent: DirectInsertIntent): boolean {
  return operations.some((operation) => {
    if (operation.type !== "insert_shots") return false;
    if ((operation.count ?? 1) !== intent.count) return false;
    const placement = operation.placement ?? "end";
    if (placement !== intent.placement) return false;
    if (!intent.targetRow) return !operation.rowRef;
    return Boolean(operation.rowRef && agentRowRefMatchesRow(detail, operation.rowRef, intent.targetRow.id));
  });
}

function operationsDuplicateRows(detail: ProjectDetail, operations: AgentOperation[], rowIds: string[]): boolean {
  return rowIds.every((rowId) =>
    operations.some((operation) => operation.type === "duplicate_shots" && operation.rowRefs.some((rowRef) => agentRowRefMatchesRow(detail, rowRef, rowId)))
  );
}

function operationsDeleteRows(detail: ProjectDetail, operations: AgentOperation[], rowIds: string[]): boolean {
  const expected = new Set(rowIds);
  return operations.some((operation) => {
    if (operation.type !== "delete_shots") return false;
    const actual = new Set(operation.rowRefs.map((rowRef) => resolveAgentRowRefInDetail(detail, rowRef)).filter((rowId): rowId is string => Boolean(rowId)));
    return expected.size === actual.size && [...expected].every((rowId) => actual.has(rowId));
  });
}

function operationsReorderRow(detail: ProjectDetail, operations: AgentOperation[], sourceRowId: string, targetRowId: string, placement: "before" | "after"): boolean {
  return operations.some(
    (operation) =>
      operation.type === "reorder_shot" &&
      operation.placement === placement &&
      agentRowRefMatchesRow(detail, operation.rowRef, sourceRowId) &&
      agentRowRefMatchesRow(detail, operation.targetRowRef, targetRowId)
  );
}

function agentRowRefMatchesRow(detail: ProjectDetail, rowRef: AgentRowRef, rowId: string): boolean {
  if (rowRef.kind === "id") return rowRef.value === rowId;
  return detail.rows[rowRef.value - 1]?.id === rowId;
}

function normalizeFieldKey(field: string): string {
  return field.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function readStoryboardCellValue(row: StoryboardRow, field: string): string {
  if (field === "scene") return row.scene;
  if (field === "duration") return row.duration;
  if (field === "content") return row.content;
  if (field === "note") return row.note;
  return row.customValues?.[field] ?? "";
}

function insertAgentShots(store: AgentOperationStore, projectId: string, operation: Extract<AgentOperation, { type: "insert_shots" }>): void {
  const count = Math.max(1, Math.min(20, Math.floor(operation.count)));
  const createdRows: StoryboardRow[] = [];
  let anchorRowId = operation.rowRef ? resolveAgentRowRef(store, projectId, operation.rowRef) : "";
  const placement = operation.placement ?? "end";

  if (!anchorRowId || placement === "end") {
    const beforeCount = store.getProject(projectId).rows.length;
    const rows = store.createShots(projectId, count);
    createdRows.push(...rows.slice(beforeCount));
  } else {
    for (let index = 0; index < count; index += 1) {
      const beforeIds = new Set(store.getProject(projectId).rows.map((row) => row.id));
      const rows = store.insertShot(projectId, anchorRowId, placement === "before" ? "before" : "after");
      const createdRow = rows.find((row) => !beforeIds.has(row.id));
      if (createdRow) {
        createdRows.push(createdRow);
        if (placement === "after") anchorRowId = createdRow.id;
      }
    }
  }

  operation.rows?.forEach((draft, index) => {
    const row = createdRows[index];
    if (row) applyAgentInsertedShot(store, projectId, row.id, draft);
  });
}

function applyAgentInsertedShot(store: AgentOperationStore, projectId: string, rowId: string, draft: AgentInsertedShot): void {
  if (draft.scene !== undefined) store.updateShot(projectId, { id: rowId, field: "scene", value: draft.scene });
  if (draft.duration !== undefined) store.updateShot(projectId, { id: rowId, field: "duration", value: draft.duration });
  if (draft.content !== undefined) store.updateShot(projectId, { id: rowId, field: "content", value: draft.content });
  if (draft.note !== undefined) store.updateShot(projectId, { id: rowId, field: "note", value: draft.note });
  for (const [field, value] of Object.entries(draft.customValues ?? {})) {
    store.updateShot(projectId, { id: rowId, field: normalizeAgentShotField(store, projectId, field), value });
  }
  if (draft.imageAssetIds) store.updateShotMedia(projectId, rowId, draft.imageAssetIds);
}

function reorderAgentShot(store: AgentOperationStore, projectId: string, rowRef: AgentRowRef, targetRowRef: AgentRowRef, placement: "before" | "after"): void {
  const sourceRowId = resolveAgentRowRef(store, projectId, rowRef);
  const targetRowId = resolveAgentRowRef(store, projectId, targetRowRef);
  if (sourceRowId === targetRowId) return;
  const rows = store.getProject(projectId).rows;
  const sourceRow = rows.find((row) => row.id === sourceRowId);
  if (!sourceRow) throw new Error("要移动的分镜不存在。");
  const remainingRows = rows.filter((row) => row.id !== sourceRowId);
  const targetIndex = remainingRows.findIndex((row) => row.id === targetRowId);
  if (targetIndex < 0) throw new Error("目标分镜不存在。");
  const insertIndex = placement === "after" ? targetIndex + 1 : targetIndex;
  const nextRows = [...remainingRows];
  nextRows.splice(insertIndex, 0, sourceRow);
  store.replaceRows(projectId, nextRows);
}

function uniqueResolvedRowIds(store: AgentOperationStore, projectId: string, rowRefs: AgentRowRef[]): string[] {
  const rowIds = rowRefs.map((rowRef) => resolveAgentRowRef(store, projectId, rowRef));
  return rowIds.filter((rowId, index) => rowId && rowIds.indexOf(rowId) === index);
}

export function resolveAgentRowRef(store: AgentOperationStore, projectId: string, rowRef: AgentRowRef): string {
  const rows = store.getProject(projectId).rows;
  if (rowRef.kind === "id") {
    const row = rows.find((item) => item.id === rowRef.value);
    if (!row) throw new Error(`找不到分镜行：${rowRef.value}`);
    return row.id;
  }
  const row = rows[rowRef.value - 1];
  if (!row) throw new Error(`找不到第 ${rowRef.value} 个分镜。`);
  return row.id;
}

function resolveAgentRowRefInDetail(detail: ProjectDetail, rowRef: AgentRowRef): string | null {
  if (rowRef.kind === "id") return detail.rows.some((row) => row.id === rowRef.value) ? rowRef.value : null;
  return detail.rows[rowRef.value - 1]?.id ?? null;
}

function uniqueAssetIds(assetIds: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const assetId of assetIds) {
    const normalized = assetId.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function mergeAssetIds(currentAssetIds: string[], appendedAssetIds: string[]): string[] {
  return uniqueAssetIds([...currentAssetIds, ...appendedAssetIds]).slice(0, 10);
}

function arraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function normalizeAgentShotField(store: AgentOperationStore, projectId: string, field: string): UpdateShotInput["field"] {
  const normalized = field.trim();
  if (normalized === "scene" || normalized === "duration" || normalized === "content" || normalized === "note") return normalized;
  const columns = store.getProject(projectId).columns;
  const column = columns.find((item) => item.id === normalized);
  if (!column) throw new Error(`不支持的分镜字段：${field}。请使用当前分镜字段 JSON 中的 column id。`);
  if (column.id === "sort" || column.id === "shot" || column.id === "image") {
    throw new Error(`字段 ${column.label} 不能通过单元格操作修改。`);
  }
  return column.id;
}

function agentOperationTargetLabels(operations: AgentOperation[]): string[] {
  return Array.from(new Set(operations.map(agentOperationTargetLabel)));
}

function agentOperationTargetLabel(operation: AgentOperation): string {
  if (operation.type === "update_script") return "脚本";
  if (operation.type === "sync_script_a_roll_tags") return "脚本 A-Roll 标签";
  if (operation.type === "parse_storyboard") return "重新解析分镜";
  if (operation.type === "update_shot_cells") return "分镜单元格";
  if (operation.type === "insert_shots") return "新增分镜";
  if (operation.type === "delete_shots") return "删除分镜";
  if (operation.type === "duplicate_shots") return "复制分镜";
  if (operation.type === "reorder_shot") return "分镜排序";
  if (operation.type === "update_shot_media") return "画面素材";
  return operation.kind === "image" ? "图片生成" : "视频生成";
}

export function summarizeAgentOperations(operations: AgentOperation[]): string {
  const labels = agentOperationTargetLabels(operations);
  return labels.length > 0 ? `${labels.join("、")}已处理` : "没有操作";
}

function applyAgentRowUpdates(store: AgentOperationStore, projectId: string, rows: NonNullable<AgentResponse["rows"]>): void {
  const currentRows = store.getProject(projectId).rows;
  if (currentRows.length === 0) {
    store.replaceRows(projectId, rows.map((row) => ({ ...row, id: "" })));
    return;
  }

  const currentIds = new Set(currentRows.map((row) => row.id));
  const incomingIds = rows.map((row) => row.id).filter(Boolean);
  const validExistingRowPatch =
    incomingIds.length === rows.length &&
    new Set(incomingIds).size === incomingIds.length &&
    incomingIds.every((id) => currentIds.has(id));

  if (!validExistingRowPatch) {
    throw new Error("普通对话的 rows 只能修改当前已有分镜行，不能新增、删除或替换整张分镜表。请使用 AI 解析分镜入口重新拆分，或用插入/删除/排序操作调整行结构。");
  }

  const currentById = new Map(currentRows.map((row) => [row.id, row]));
  for (const row of rows) {
    const current = currentById.get(row.id);
    if (!current) continue;
    applyAgentShotFieldUpdate(store, projectId, row.id, "scene", row.scene, current.scene);
    applyAgentShotFieldUpdate(store, projectId, row.id, "duration", row.duration, current.duration);
    applyAgentShotFieldUpdate(store, projectId, row.id, "content", row.content, current.content);
    applyAgentShotFieldUpdate(store, projectId, row.id, "note", row.note, current.note);

    for (const [field, value] of Object.entries(row.customValues ?? {})) {
      applyAgentShotFieldUpdate(store, projectId, row.id, field as UpdateShotInput["field"], value, current.customValues?.[field] ?? "");
    }
  }
}

function applyAgentShotFieldUpdate(
  store: AgentOperationStore,
  projectId: string,
  rowId: string,
  field: UpdateShotInput["field"],
  nextValue: string,
  currentValue: string
): void {
  if (nextValue === currentValue) return;
  store.updateShot(projectId, { id: rowId, field, value: nextValue });
}
