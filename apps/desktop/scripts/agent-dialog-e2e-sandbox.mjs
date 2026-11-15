import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { runStoryboardAgent, runHyperframesProjectAgent } from "../src/main/codex-agent.ts";
import {
  applyAgentResponseWrites,
  applyConfirmedAgentOperations,
  attachAgentImageAttachmentsToRegeneratedVideoRows,
  completeAgentResponseFromDirectStoryboardIntent,
  summarizeAgentResult
} from "../src/main/agent-operations.ts";
import { runLocalStoryboardVideoGeneration, suggestedVideoAssetName } from "../src/main/local-video.ts";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "../../..");
const projectId = process.env.MKBOARD_E2E_PROJECT_ID || "tibotest-6b6effde";
const sandboxBase = process.env.MKBOARD_E2E_SANDBOX || readFileSync("/tmp/mkboard-agent-test/latest-sandbox-path", "utf8").trim();
const dbPath = join(sandboxBase, "userData", "mkboard.sqlite");
const projectsRoot = join(sandboxBase, "projects");
const reportPath = process.env.MKBOARD_E2E_REPORT || join(sandboxBase, "agent-dialog-e2e-report.json");
const runRealImage = process.env.MKBOARD_E2E_REAL_IMAGE === "1";
const runRealHyperframes = process.env.MKBOARD_E2E_REAL_HYPERFRAMES !== "0";
const onlyRealHyperframes = process.env.MKBOARD_E2E_ONLY_REAL_HYPERFRAMES === "1";
const runHyperframesAgentPreflight = process.env.MKBOARD_E2E_PREFLIGHT_HYPERFRAMES_AGENT !== "0";
const agentTimeoutMs = Number(process.env.MKBOARD_E2E_AGENT_TIMEOUT_MS || 240000);
const videoTimeoutMs = Number(process.env.MKBOARD_E2E_VIDEO_TIMEOUT_MS || 600000);
const apiBase = (process.env.MKBOARD_API_BASE_URL || "http://localhost:8787").replace(/\/$/, "");

if (!existsSync(dbPath)) throw new Error(`Missing sandbox database: ${dbPath}`);

class SqliteCliStore {
  constructor(dbPath, projectRoot) {
    this.dbPath = dbPath;
    this.projectRoot = projectRoot;
    this.conversations = new Map();
  }

  query(sql) {
    const raw = execFileSync("sqlite3", ["-json", this.dbPath, sql], { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 }).trim();
    return raw ? JSON.parse(raw) : [];
  }

  exec(sql) {
    execFileSync("sqlite3", [this.dbPath, sql], { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
  }

  getProject(projectId) {
    const [projectRow] = this.query(`SELECT * FROM projects WHERE id = ${sqlValue(projectId)}`);
    if (!projectRow) throw new Error(`Missing project ${projectId}`);
    const [scriptRow] = this.query(`SELECT html FROM scripts WHERE project_id = ${sqlValue(projectId)}`);
    const [settingsRow] = this.query(`SELECT * FROM storyboard_settings WHERE project_id = ${sqlValue(projectId)}`);
    const storyboardSkillId = settingsRow?.storyboard_skill_id || "storyboard-split-zh";
    const [skillRow] = this.query(`SELECT * FROM skills WHERE id = ${sqlValue(storyboardSkillId)}`) || this.query("SELECT * FROM skills LIMIT 1");
    const [tasteRow] = this.query(`SELECT * FROM tastes WHERE id = ${sqlValue(projectRow.taste_id || "taste-auto-adaptive")}`) || this.query("SELECT * FROM tastes LIMIT 1");
    const activeConversation = this.ensureActiveAgentConversation(projectId);
    return {
      project: mapProject(projectRow),
      scriptHtml: scriptRow?.html ?? "<p></p>",
      rows: this.listRows(projectId),
      columns: parseJson(settingsRow?.columns_json, []),
      imageRatio: settingsRow?.image_ratio || "16:9",
      assets: this.listAssets(projectId),
      storyboardSkill: mapSkill(skillRow),
      taste: mapTaste(tasteRow),
      agentConversations: this.listAgentConversations(projectId),
      activeAgentConversationId: activeConversation.id,
      agentMessages: this.listAgentMessages(projectId, activeConversation.id)
    };
  }

  saveProjectCloudProjectId(projectId, cloudProjectId) {
    this.exec(`UPDATE projects SET cloud_project_id = ${sqlValue(cloudProjectId)}, updated_at = ${sqlValue(new Date().toISOString())} WHERE id = ${sqlValue(projectId)}`);
  }

  updateScript(projectId, scriptHtml) {
    const now = new Date().toISOString();
    this.exec(
      `UPDATE scripts SET html = ${sqlValue(scriptHtml)}, plain_text = ${sqlValue(stripHtml(scriptHtml))}, updated_at = ${sqlValue(now)} WHERE project_id = ${sqlValue(projectId)};
       UPDATE projects SET updated_at = ${sqlValue(now)} WHERE id = ${sqlValue(projectId)};`
    );
  }

  updateShot(projectId, input) {
    const standardFields = new Set(["scene", "duration", "content", "note"]);
    const now = new Date().toISOString();
    if (standardFields.has(input.field)) {
      this.exec(
        `UPDATE shots SET ${input.field} = ${sqlValue(input.value)}, updated_at = ${sqlValue(now)} WHERE id = ${sqlValue(input.id)} AND project_id = ${sqlValue(projectId)};
         UPDATE projects SET updated_at = ${sqlValue(now)} WHERE id = ${sqlValue(projectId)};`
      );
      return this.listRows(projectId);
    }
    const [row] = this.query(`SELECT custom_values_json FROM shots WHERE id = ${sqlValue(input.id)} AND project_id = ${sqlValue(projectId)}`);
    if (!row) return this.listRows(projectId);
    const customValues = parseJson(row.custom_values_json, {});
    customValues[input.field] = input.value;
    this.exec(
      `UPDATE shots SET custom_values_json = ${sqlValue(JSON.stringify(customValues))}, updated_at = ${sqlValue(now)} WHERE id = ${sqlValue(input.id)} AND project_id = ${sqlValue(projectId)};
       UPDATE projects SET updated_at = ${sqlValue(now)} WHERE id = ${sqlValue(projectId)};`
    );
    return this.listRows(projectId);
  }

  updateShotMedia(projectId, rowId, assetIds) {
    const now = new Date().toISOString();
    const validIds = assetIds.filter((assetId) => this.query(`SELECT id FROM assets WHERE id = ${sqlValue(assetId)} AND project_id = ${sqlValue(projectId)}`).length > 0).slice(0, 10);
    this.exec(
      `UPDATE shots SET image_asset_id = ${sqlValue(validIds[0] ?? null)}, image_asset_ids_json = ${sqlValue(JSON.stringify(validIds))}, updated_at = ${sqlValue(now)} WHERE id = ${sqlValue(rowId)} AND project_id = ${sqlValue(projectId)};
       UPDATE projects SET updated_at = ${sqlValue(now)} WHERE id = ${sqlValue(projectId)};`
    );
    return { rows: this.listRows(projectId), assets: this.listAssets(projectId) };
  }

  createShots(projectId, count) {
    for (let index = 0; index < count; index += 1) this.insertShot(projectId, "", "after");
    return this.listRows(projectId);
  }

  insertShot(projectId, targetRowId, placement) {
    const rows = this.listRows(projectId);
    const targetIndex = rows.findIndex((row) => row.id === targetRowId);
    const insertIndex = targetIndex < 0 ? rows.length : placement === "before" ? targetIndex : targetIndex + 1;
    const nextRows = [...rows];
    const row = createEmptyRow(String(insertIndex + 1));
    nextRows.splice(insertIndex, 0, row);
    this.insertRowRecord(projectId, row, insertIndex + 1);
    this.replaceRows(projectId, nextRows);
    return this.listRows(projectId);
  }

  deleteShots(projectId, rowIds) {
    if (!rowIds.length) return this.listRows(projectId);
    this.exec(`DELETE FROM shots WHERE project_id = ${sqlValue(projectId)} AND id IN (${rowIds.map(sqlValue).join(", ")});`);
    this.resequence(projectId);
    return this.listRows(projectId);
  }

  duplicateShots(projectId, rowIds) {
    const selected = new Set(rowIds);
    const nextRows = [];
    for (const row of this.listRows(projectId)) {
      nextRows.push(row);
      if (selected.has(row.id)) nextRows.push({ ...cloneRow(row), id: randomUUID() });
    }
    this.replaceRows(projectId, nextRows);
    return this.listRows(projectId);
  }

  replaceRows(projectId, nextRows) {
    const now = new Date().toISOString();
    this.exec(`DELETE FROM shots WHERE project_id = ${sqlValue(projectId)};`);
    nextRows.forEach((row, index) => this.insertRowRecord(projectId, { ...row, shot: String(index + 1) }, index + 1, now));
    this.exec(`UPDATE projects SET updated_at = ${sqlValue(now)} WHERE id = ${sqlValue(projectId)};`);
  }

  upsertGeneratedShotImage(projectId, rowId, assetId, fileName, buffer, overwriteExisting) {
    const project = this.getProject(projectId).project;
    const assetsDir = join(project.localPath, "assets");
    mkdirSync(assetsDir, { recursive: true });
    const destination = join(assetsDir, fileName || `${assetId}.png`);
    writeFileSync(destination, Buffer.from(buffer));
    this.upsertAsset(projectId, rowId, assetId, basename(destination), "image", destination);
    this.attachGeneratedMedia(projectId, rowId, assetId, overwriteExisting);
    return { rows: this.listRows(projectId), assets: this.listAssets(projectId) };
  }

  upsertGeneratedShotVideo(projectId, rowId, assetId, sourcePath, fileName, overwriteExisting, posterPath) {
    const project = this.getProject(projectId).project;
    const assetsDir = join(project.localPath, "assets");
    mkdirSync(assetsDir, { recursive: true });
    const destination = join(assetsDir, fileName || basename(sourcePath));
    copyFileSync(sourcePath, destination);
    this.upsertAsset(projectId, rowId, assetId, basename(destination), "video", destination, posterPath);
    this.attachGeneratedMedia(projectId, rowId, assetId, overwriteExisting);
    return { rows: this.listRows(projectId), assets: this.listAssets(projectId) };
  }

  createAgentConversation(projectId) {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.conversations.set(id, { id, projectId, title: "新对话", createdAt: now, updatedAt: now, unreadCompletion: false, messages: [] });
    return this.getAgentConversation(projectId, id);
  }

  getAgentConversation(projectId, conversationId) {
    const conversation = this.conversations.get(conversationId);
    if (!conversation || conversation.projectId !== projectId) throw new Error(`Missing conversation ${conversationId}`);
    return {
      conversations: this.listAgentConversations(projectId),
      activeConversationId: conversation.id,
      messages: this.listAgentMessages(projectId, conversation.id)
    };
  }

  markAgentConversationCompletionSeen(projectId, conversationId) {
    const conversation = this.conversations.get(conversationId);
    if (!conversation || conversation.projectId !== projectId) throw new Error(`Missing conversation ${conversationId}`);
    conversation.unreadCompletion = false;
    return this.getAgentConversation(projectId, conversationId);
  }

  appendAgentMessage(projectId, role, content, options = {}) {
    const conversation = options.conversationId ? this.conversations.get(options.conversationId) : this.ensureActiveAgentConversation(projectId);
    if (!conversation) throw new Error("Missing active conversation");
    const message = {
      id: randomUUID(),
      conversationId: conversation.id,
      role,
      content,
      createdAt: new Date().toISOString(),
      attachments: options.attachments ?? [],
      events: options.events ?? [],
      runStatus: options.runStatus,
      clientRunId: options.clientRunId,
      agentCliId: options.agentCliId,
      operationConfirmation: options.operationConfirmation
    };
    conversation.messages.push(message);
    conversation.updatedAt = message.createdAt;
    return message;
  }

  updateAgentMessage(projectId, messageId, input) {
    for (const conversation of this.conversations.values()) {
      if (conversation.projectId !== projectId) continue;
      const message = conversation.messages.find((item) => item.id === messageId);
      if (!message) continue;
      const previousStatus = message.runStatus;
      const nextRunStatus = input.runStatus ?? message.runStatus;
      Object.assign(message, {
        content: input.content ?? message.content,
        events: input.events ?? message.events,
        runStatus: nextRunStatus,
        operationConfirmation: input.operationConfirmation === undefined ? message.operationConfirmation : input.operationConfirmation ?? undefined
      });
      if (message.role === "assistant" && !["succeeded", "failed"].includes(previousStatus) && ["succeeded", "failed"].includes(nextRunStatus)) {
        conversation.unreadCompletion = true;
      }
      conversation.updatedAt = new Date().toISOString();
      return message;
    }
    return null;
  }

  ensureActiveAgentConversation(projectId) {
    const existing = Array.from(this.conversations.values()).find((conversation) => conversation.projectId === projectId);
    if (existing) return existing;
    const detail = this.createAgentConversation(projectId);
    return this.conversations.get(detail.activeConversationId);
  }

  listAgentConversations(projectId) {
    return Array.from(this.conversations.values())
      .filter((conversation) => conversation.projectId === projectId)
      .map((conversation) => ({
        id: conversation.id,
        title: conversation.title,
        messageCount: conversation.messages.length,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        hasUnreadCompletion: conversation.unreadCompletion
      }));
  }

  listAgentMessages(projectId, conversationId) {
    const conversation = this.conversations.get(conversationId);
    if (!conversation || conversation.projectId !== projectId) return [];
    return conversation.messages.map((message) => ({ ...message }));
  }

  listRows(projectId) {
    return this.query(`SELECT * FROM shots WHERE project_id = ${sqlValue(projectId)} ORDER BY position ASC`).map(mapShot);
  }

  listAssets(projectId) {
    return this.query(`SELECT * FROM assets WHERE project_id = ${sqlValue(projectId)} ORDER BY created_at DESC`).map((row) => mapAsset(row, this.getProjectPath(projectId)));
  }

  getProjectPath(projectId) {
    const [project] = this.query(`SELECT local_path FROM projects WHERE id = ${sqlValue(projectId)}`);
    return project?.local_path ?? this.projectRoot;
  }

  insertRowRecord(projectId, row, position, now = new Date().toISOString()) {
    const imageAssetIds = row.imageAssetIds ?? [];
    this.exec(
      `INSERT INTO shots (id, project_id, position, shot_number, image_asset_id, image_asset_ids_json, scene, duration, content, note, custom_values_json, created_at, updated_at)
       VALUES (${sqlValue(row.id)}, ${sqlValue(projectId)}, ${position}, ${sqlValue(String(position))}, ${sqlValue(imageAssetIds[0] ?? null)}, ${sqlValue(JSON.stringify(imageAssetIds))}, ${sqlValue(row.scene ?? "")}, ${sqlValue(String(row.duration ?? ""))}, ${sqlValue(row.content ?? "")}, ${sqlValue(row.note ?? "")}, ${sqlValue(JSON.stringify(row.customValues ?? {}))}, ${sqlValue(now)}, ${sqlValue(now)});`
    );
  }

  resequence(projectId) {
    const rows = this.listRows(projectId);
    this.replaceRows(projectId, rows);
  }

  upsertAsset(projectId, rowId, assetId, fileName, kind, localPath, posterPath = null) {
    const projectPath = this.getProjectPath(projectId);
    const now = new Date().toISOString();
    const size = existsSync(localPath) ? statSync(localPath).size : 0;
    const indexedPath = relative(projectPath, localPath);
    const posterIndexedPath = posterPath && existsSync(posterPath) ? relative(projectPath, posterPath) : null;
    const exists = this.query(`SELECT id FROM assets WHERE id = ${sqlValue(assetId)} AND project_id = ${sqlValue(projectId)}`).length > 0;
    if (exists) {
      this.exec(
        `UPDATE assets SET file_name = ${sqlValue(fileName)}, kind = ${sqlValue(kind)}, file_size = ${size}, local_path = ${sqlValue(localPath)}, indexed_path = ${sqlValue(indexedPath)}, linked_shot_id = ${sqlValue(rowId)}, poster_path = ${sqlValue(posterPath)}, poster_indexed_path = ${sqlValue(posterIndexedPath)} WHERE id = ${sqlValue(assetId)} AND project_id = ${sqlValue(projectId)};`
      );
      return;
    }
    this.exec(
      `INSERT INTO assets (id, project_id, file_name, kind, file_size, local_path, indexed_path, linked_shot_id, content_hash, created_at, poster_path, poster_indexed_path)
       VALUES (${sqlValue(assetId)}, ${sqlValue(projectId)}, ${sqlValue(fileName)}, ${sqlValue(kind)}, ${size}, ${sqlValue(localPath)}, ${sqlValue(indexedPath)}, ${sqlValue(rowId)}, NULL, ${sqlValue(now)}, ${sqlValue(posterPath)}, ${sqlValue(posterIndexedPath)});`
    );
  }

  attachGeneratedMedia(projectId, rowId, assetId, overwriteExisting) {
    const [row] = this.query(`SELECT image_asset_ids_json FROM shots WHERE id = ${sqlValue(rowId)} AND project_id = ${sqlValue(projectId)}`);
    const current = overwriteExisting ? [] : parseJson(row?.image_asset_ids_json, []);
    const next = [assetId, ...current.filter((id) => id !== assetId)].slice(0, 10);
    this.updateShotMedia(projectId, rowId, next);
  }
}

function sqlValue(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function parseJson(value, fallback) {
  try {
    return typeof value === "string" ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function stripHtml(html) {
  return String(html ?? "").replace(/<[^>]*>/g, "");
}

function mapProject(row) {
  return {
    id: row.id,
    kind: row.kind === "tutorial" ? "tutorial" : "user",
    name: row.name,
    icon: row.icon,
    templateId: row.template_id,
    tasteId: row.taste_id,
    localPath: row.local_path,
    cloudProjectId: row.cloud_project_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at ?? null,
    deletedAt: row.deleted_at ?? null
  };
}

function mapShot(row) {
  const imageAssetIds = parseJson(row.image_asset_ids_json, []);
  return {
    id: row.id,
    shot: row.shot_number,
    scene: row.scene,
    duration: row.duration,
    content: row.content,
    note: row.note,
    imageAssetIds,
    imageAssetId: imageAssetIds[0] ?? null,
    customValues: parseJson(row.custom_values_json, {})
  };
}

function mapAsset(row) {
  return {
    id: row.id,
    name: row.file_name,
    kind: row.kind,
    sizeLabel: formatFileSize(Number(row.file_size ?? 0)),
    localPath: row.indexed_path,
    indexedPath: row.indexed_path,
    previewUrl: `mkboard-asset://asset/${encodeURIComponent(row.id)}/${encodeURIComponent(row.file_name)}`,
    posterUrl: row.poster_indexed_path ? `mkboard-asset://asset-poster/${encodeURIComponent(row.id)}/${encodeURIComponent(basename(row.poster_indexed_path))}` : undefined,
    linkedShotId: row.linked_shot_id ?? null,
    linkedShot: row.linked_shot_id ? `镜头 ${row.linked_shot_id}` : "未关联镜头",
    importedAt: row.created_at
  };
}

function mapSkill(row = {}) {
  return {
    id: row.id ?? "storyboard-split-zh",
    name: row.name ?? "默认分镜技能",
    description: row.description ?? "",
    content: row.content ?? "",
    iconId: row.icon_id ?? "file-text",
    gradientId: row.gradient_id ?? "mist-slate",
    scope: row.scope ?? "system",
    locked: Boolean(row.locked ?? true),
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? new Date().toISOString()
  };
}

function mapTaste(row = {}) {
  return {
    id: row.id ?? "taste-auto-adaptive",
    name: row.name ?? "Paper Cut Studio",
    description: row.description ?? "",
    content: row.content ?? "",
    sourceUrl: row.source_url ?? "",
    preview: parseJson(row.preview_json, {}),
    scope: row.scope ?? "system",
    locked: Boolean(row.locked ?? true),
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? new Date().toISOString()
  };
}

function formatFileSize(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function createEmptyRow(shot) {
  return {
    id: randomUUID(),
    shot,
    scene: "",
    duration: "",
    content: "",
    note: "",
    imageAssetIds: [],
    imageAssetId: null,
    customValues: {}
  };
}

function cloneRow(row) {
  return {
    ...row,
    imageAssetIds: [...(row.imageAssetIds ?? [])],
    customValues: { ...(row.customValues ?? {}) }
  };
}

const store = new SqliteCliStore(dbPath, projectsRoot);
const report = {
  sandboxBase,
  dbPath,
  projectId,
  startedAt: new Date().toISOString(),
  checks: [],
  agents: {}
};

function logCheck(name, data = {}) {
  const entry = { name, at: new Date().toISOString(), ...data };
  report.checks.push(entry);
  console.log(`[check] ${name}`, JSON.stringify(data));
  return entry;
}

function getProject() {
  return store.getProject(projectId, "zh-CN");
}

function rowAt(index) {
  const row = getProject().rows[index - 1];
  assert.ok(row, `Missing row at index ${index}`);
  return row;
}

function getCustomColumnIds() {
  const columns = getProject().columns;
  const findByLabel = (pattern) => {
    const column = columns.find((item) => item.custom && pattern.test(item.label));
    assert.ok(column, `Missing custom column matching ${pattern}`);
    return column.id;
  };
  return {
    imagePrompt: findByLabel(/图像|图片|image/i),
    videoPrompt: findByLabel(/视频|video/i),
    generationMethod: findByLabel(/生成方式|generation method/i)
  };
}

function summarizeResponse(response) {
  return {
    reply: response.reply,
    operations: (response.operations ?? []).map((operation) => operation.type),
    operationDetails: (response.operations ?? []).map(summarizeOperation),
    appliedOperations: (response.appliedOperations ?? []).map((operation) => operation.type),
    pendingOperations: (response.pendingOperations ?? []).map((operation) => operation.type),
    rows: response.rows?.length ?? 0,
    summary: summarizeAgentResult(response)
  };
}

function summarizeOperation(operation) {
  if (operation.type === "update_shot_cells") return { type: operation.type, rowRef: operation.rowRef, fields: operation.cells.map((cell) => cell.field) };
  if (operation.type === "update_shot_media") return { type: operation.type, rowRef: operation.rowRef, assetCount: operation.assetIds.length };
  if (operation.type === "insert_shots") return { type: operation.type, rowRef: operation.rowRef, placement: operation.placement, count: operation.count };
  if (operation.type === "delete_shots" || operation.type === "duplicate_shots") return { type: operation.type, rowRefs: operation.rowRefs };
  if (operation.type === "reorder_shot") return { type: operation.type, rowRef: operation.rowRef, targetRowRef: operation.targetRowRef, placement: operation.placement };
  if (operation.type === "regenerate_media") return { type: operation.type, rowRefs: operation.rowRefs, kind: operation.kind, overwriteExisting: operation.overwriteExisting };
  return { type: operation.type };
}

function operationMatchesType(operation, type) {
  return operation?.type === type;
}

function nonMediaPendingOperations(response) {
  return (response.pendingOperations ?? []).filter((operation) => operation.type !== "regenerate_media" && operation.type !== "parse_storyboard");
}

function mediaPendingOperations(response, kind) {
  return (response.pendingOperations ?? []).filter((operation) => operation.type === "regenerate_media" && operation.kind === kind);
}

async function sendAgentMessage(agentCliId, conversationId, message, options = {}) {
  const project = getProject();
  store.appendAgentMessage(projectId, "user", message, { conversationId });
  const conversationMessages = store.getAgentConversation(projectId, conversationId).messages;
  const assistant = store.appendAgentMessage(projectId, "assistant", "", {
    conversationId,
    events: [{ kind: "status", label: "queued", detail: `E2E ${agentCliId}` }],
    runStatus: "running",
    clientRunId: randomUUID(),
    agentCliId
  });
  const events = [];
  let streamed = "";
  const response = await runStoryboardAgent(
    {
      project,
      tab: "storyboard",
      message,
      agentCliId,
      interfaceLanguage: "zh-CN",
      conversationMessages
    },
    {
      timeoutMs: options.timeoutMs ?? agentTimeoutMs,
      onEvent(event) {
        events.push(event);
        if (event.kind === "text") streamed += event.text;
        store.updateAgentMessage(projectId, assistant.id, {
          content: streamed || assistant.content,
          events,
          runStatus: "running"
        });
      },
      log(step, detail = {}) {
        if (process.env.MKBOARD_E2E_VERBOSE === "1") console.log(`[${agentCliId}] ${step}`, JSON.stringify(detail));
      }
    }
  );
  const latestProject = getProject();
  const completed = completeAgentResponseFromDirectStoryboardIntent(response, latestProject, message);
  const withAttachmentMedia = attachAgentImageAttachmentsToRegeneratedVideoRows(completed, latestProject, []);
  const writeResult = applyAgentResponseWrites(store, projectId, withAttachmentMedia, (event) => events.push(event));
  const withWrites = {
    ...withAttachmentMedia,
    appliedOperations: writeResult.appliedOperations,
    pendingOperations: writeResult.pendingOperations
  };
  store.updateAgentMessage(projectId, assistant.id, {
    content: withWrites.reply,
    events: [...events, { kind: "status", label: "succeeded", detail: summarizeAgentResult(withWrites) }],
    runStatus: "succeeded"
  });
  return withWrites;
}

function confirmPendingProjectOperations(response) {
  const operations = nonMediaPendingOperations(response);
  if (operations.length === 0) return [];
  return applyConfirmedAgentOperations(store, projectId, operations);
}

function createConversation(agentCliId) {
  const detail = store.createAgentConversation(projectId);
  report.agents[agentCliId] = { conversationId: detail.activeConversationId, steps: [] };
  return detail.activeConversationId;
}

function recordAgentStep(agentCliId, step, response, extra = {}) {
  const item = { step, response: summarizeResponse(response), ...extra };
  report.agents[agentCliId].steps.push(item);
  console.log(`[${agentCliId}] ${step}`, JSON.stringify(item.response));
}

async function testAgent(agentCliId) {
  const conversationId = createConversation(agentCliId);
  const beforeScript = getProject().scriptHtml;
  const scriptMarker = `Agent脚本修改测试-${agentCliId}-${Date.now()}`;
  const scriptResponse = await sendAgentMessage(
    agentCliId,
    conversationId,
    `把当前脚本第一段开头加上“${scriptMarker}：”，只改脚本，不要改分镜。`
  );
  recordAgentStep(agentCliId, "script_update", scriptResponse);
  const afterScript = getProject().scriptHtml;
  assert.notEqual(afterScript, beforeScript, `${agentCliId} did not change script`);
  assert.ok(afterScript.includes(scriptMarker), `${agentCliId} script update missing marker`);

  const ids = getCustomColumnIds();
  const row3Before = rowAt(3);
  const contentMarker = `Agent内容更新-${agentCliId}`;
  const imagePromptMarker = `Agent图像提示词-${agentCliId}`;
  const updateResponse = await sendAgentMessage(
    agentCliId,
    conversationId,
    `把第3镜内容改成“${contentMarker}”，并把第3镜图像提示词改成“${imagePromptMarker}”。不要新增、删除或排序。`
  );
  recordAgentStep(agentCliId, "row_update", updateResponse);
  const row3After = getProject().rows.find((row) => row.id === row3Before.id);
  assert.equal(row3After?.content, contentMarker, `${agentCliId} did not update row 3 content`);
  assert.equal(row3After?.customValues?.[ids.imagePrompt], imagePromptMarker, `${agentCliId} did not update row 3 image prompt`);

  const rowCountBeforeInsert = getProject().rows.length;
  const insertMarker = `Agent插入测试-${agentCliId}`;
  const insertResponse = await sendAgentMessage(
    agentCliId,
    conversationId,
    `在第3镜后面新增1个B-ROLL分镜，内容必须是“${insertMarker}”，备注写“E2E 插入验证”。`
  );
  const insertedOps = confirmPendingProjectOperations(insertResponse);
  recordAgentStep(agentCliId, "insert_shot", insertResponse, { confirmed: insertedOps.map((operation) => operation.type) });
  assert.equal(getProject().rows.length, rowCountBeforeInsert + 1, `${agentCliId} did not insert one row`);
  const insertedRow = getProject().rows.find((row) => row.content === insertMarker);
  assert.ok(insertedRow, `${agentCliId} inserted row missing marker content`);

  const rowCountBeforeDuplicate = getProject().rows.length;
  const duplicateResponse = await sendAgentMessage(agentCliId, conversationId, `复制内容为“${insertMarker}”的那一镜。`);
  const duplicatedOps = confirmPendingProjectOperations(duplicateResponse);
  recordAgentStep(agentCliId, "duplicate_shot", duplicateResponse, { confirmed: duplicatedOps.map((operation) => operation.type) });
  assert.equal(getProject().rows.length, rowCountBeforeDuplicate + 1, `${agentCliId} did not duplicate one row`);
  assert.equal(getProject().rows.filter((row) => row.content === insertMarker).length >= 2, true, `${agentCliId} duplicate marker count too low`);

  const beforeFirstRowId = rowAt(1).id;
  const reorderTarget = getProject().rows.find((row) => row.content === insertMarker);
  assert.ok(reorderTarget, `${agentCliId} missing reorder target`);
  const reorderResponse = await sendAgentMessage(agentCliId, conversationId, `把内容为“${insertMarker}”的第一条分镜移动到第1镜之前。`);
  const reorderedOps = confirmPendingProjectOperations(reorderResponse);
  recordAgentStep(agentCliId, "reorder_shot", reorderResponse, { confirmed: reorderedOps.map((operation) => operation.type) });
  assert.equal(rowAt(1).content, insertMarker, `${agentCliId} did not reorder marker row to the top`);
  assert.notEqual(rowAt(1).id, beforeFirstRowId, `${agentCliId} first row id did not change after reorder`);

  const rowCountBeforeDelete = getProject().rows.length;
  const deleteResponse = await sendAgentMessage(agentCliId, conversationId, `删除所有内容为“${insertMarker}”的分镜。`);
  const deletedOps = confirmPendingProjectOperations(deleteResponse);
  recordAgentStep(agentCliId, "delete_shots", deleteResponse, { confirmed: deletedOps.map((operation) => operation.type) });
  assert.equal(getProject().rows.some((row) => row.content === insertMarker), false, `${agentCliId} did not delete marker rows`);
  assert.ok(getProject().rows.length < rowCountBeforeDelete, `${agentCliId} row count did not decrease after delete`);

  const imageRow = getProject().rows.find((row) => row.scene !== "A-ROLL" && String(row.customValues?.[ids.imagePrompt] ?? "").trim() && !["—", "-"].includes(String(row.customValues?.[ids.imagePrompt]).trim()));
  assert.ok(imageRow, `${agentCliId} missing image generation target row`);
  const imageResponse = await sendAgentMessage(agentCliId, conversationId, `重新生成第${imageRow.shot}镜图片。`);
  recordAgentStep(agentCliId, "image_generation_intent", imageResponse);
  const imageOps = mediaPendingOperations(imageResponse, "image");
  assert.equal(imageOps.length > 0, true, `${agentCliId} did not return image regenerate_media`);
  assert.equal(imageOps.some((operation) => operation.rowRefs.some((ref) => String(ref.value) === String(imageRow.id) || String(ref.value) === String(imageRow.shot))), true, `${agentCliId} image operation did not target requested row`);

  const hyperRow = getProject().rows.find(
    (row) => row.scene !== "A-ROLL" && String(row.customValues?.[ids.generationMethod] ?? "").trim() === "Hyperframes" && String(row.customValues?.[ids.videoPrompt] ?? "").trim() && !["—", "-"].includes(String(row.customValues?.[ids.videoPrompt]).trim())
  );
  assert.ok(hyperRow, `${agentCliId} missing Hyperframes target row`);
  const videoResponse = await sendAgentMessage(agentCliId, conversationId, `只生成第${hyperRow.shot}镜的 Hyperframes 视频，不要生成 Seedance 视频。`);
  recordAgentStep(agentCliId, "hyperframes_video_intent", videoResponse);
  const videoOps = mediaPendingOperations(videoResponse, "video");
  assert.equal(videoOps.length > 0, true, `${agentCliId} did not return video regenerate_media`);
  assert.equal(videoOps.some((operation) => operation.rowRefs.some((ref) => String(ref.value) === String(hyperRow.id) || String(ref.value) === String(hyperRow.shot))), true, `${agentCliId} video operation did not target requested row`);

  return { imageRowId: imageRow.id, hyperRowId: hyperRow.id };
}

function readDevCloudSession() {
  const rawPath = join(sandboxBase, "userData", "cloud-session.json");
  if (!existsSync(rawPath)) return null;
  const parsed = JSON.parse(readFileSync(rawPath, "utf8"));
  const payload = "payload" in parsed ? parsed.payload : JSON.stringify(parsed);
  if (parsed.encrypted) throw new Error("Sandbox cloud session is encrypted; E2E image generation cannot read it outside Electron.");
  return JSON.parse(payload);
}

async function apiRequest(path, { method = "GET", token, body } = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(method === "POST" ? { body: JSON.stringify(body ?? {}) } : {})
  });
  const result = await response.json().catch(() => null);
  if (!result || typeof result.ok !== "boolean") {
    return { ok: false, error: { code: `HTTP_${response.status}`, message: response.statusText || `HTTP ${response.status}` } };
  }
  return result;
}

async function runRealImageGeneration(rowId) {
  if (!runRealImage) {
    logCheck("image_generation_skipped", { reason: "Set MKBOARD_E2E_REAL_IMAGE=1 to submit a real image task." });
    return null;
  }
  const session = readDevCloudSession();
  assert.ok(session?.accessToken, "Missing cloud access token for image generation");
  const project = getProject().project;
  let cloudProjectId = project.cloudProjectId;
  if (!cloudProjectId) {
    const created = await apiRequest("/api/projects", {
      method: "POST",
      token: session.accessToken,
      body: { name: project.name, icon: project.icon, templateId: project.templateId }
    });
    assert.equal(created.ok, true, `Cloud project create failed: ${created.error?.message}`);
    cloudProjectId = created.data.project.id;
    store.saveProjectCloudProjectId(projectId, cloudProjectId);
  }
  const ids = getCustomColumnIds();
  const row = getProject().rows.find((item) => item.id === rowId);
  assert.ok(row, "Missing image row before submission");
  const prompt = String(row.customValues?.[ids.imagePrompt] ?? "").trim();
  assert.ok(prompt && prompt !== "—" && prompt !== "-", "Image row has no prompt");
  const submitted = await apiRequest(`/api/projects/${encodeURIComponent(cloudProjectId)}/ai/image-generations/batch`, {
    method: "POST",
    token: session.accessToken,
    body: {
      overwriteExisting: true,
      items: [{ rowId, prompt, aspectRatio: getProject().imageRatio }]
    }
  });
  assert.equal(submitted.ok, true, `Image submit failed: ${submitted.error?.message}`);
  logCheck("image_generation_submitted", {
    cloudProjectId,
    batchId: submitted.data.batchId,
    submittedCount: submitted.data.submittedCount,
    creditsReserved: submitted.data.creditsReserved
  });
  let latest = submitted;
  for (let index = 0; index < 36; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    latest = await apiRequest(`/api/projects/${encodeURIComponent(cloudProjectId)}/ai/image-generations/batches/${encodeURIComponent(submitted.data.batchId)}`, {
      token: session.accessToken
    });
    assert.equal(latest.ok, true, `Image sync failed: ${latest.error?.message}`);
    logCheck("image_generation_poll", { attempt: index + 1, counts: latest.data.counts });
    if (latest.data.counts.running === 0) break;
  }
  const task = latest.data.tasks.find((item) => item.rowId === rowId);
  assert.ok(task, "Missing image task in batch result");
  assert.equal(task.status, "succeeded", `Image task did not succeed: ${task.status} ${task.errorMessage ?? ""}`);
  assert.ok(task.resultUrl, "Image task succeeded without resultUrl");
  const assetResponse = await fetch(task.resultUrl);
  assert.equal(assetResponse.ok, true, `Generated image download failed: HTTP ${assetResponse.status}`);
  const bytes = new Uint8Array(await assetResponse.arrayBuffer());
  const contentType = assetResponse.headers.get("content-type") || "image/png";
  const extension = contentType.includes("webp") ? "webp" : contentType.includes("jpeg") || contentType.includes("jpg") ? "jpg" : "png";
  const beforeAssets = getProject().assets.length;
  const mediaUpdate = store.upsertGeneratedShotImage(projectId, rowId, task.taskId, `${task.taskId}.${extension}`, bytes, true);
  assert.ok(mediaUpdate.assets.length > beforeAssets, "Generated image was not imported into sandbox assets");
  logCheck("image_generation_imported", { taskId: task.taskId, bytes: bytes.byteLength, assetCount: mediaUpdate.assets.length });
  return task;
}

async function runRealHyperframesVideo(agentCliId, rowId) {
  if (!runRealHyperframes) {
    logCheck("hyperframes_generation_skipped", { reason: "MKBOARD_E2E_REAL_HYPERFRAMES=0" });
    return null;
  }
  const ids = getCustomColumnIds();
  const project = getProject();
  const row = project.rows.find((item) => item.id === rowId);
  assert.ok(row, "Missing Hyperframes row before real generation");
  const prompt = String(row.customValues?.[ids.videoPrompt] ?? "").trim();
  assert.ok(prompt && prompt !== "—" && prompt !== "-", "Hyperframes row has no prompt");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), videoTimeoutMs);
  const progress = [];
  try {
    const results = await runLocalStoryboardVideoGeneration(
      project,
      {
        projectId,
        overwriteExisting: true,
        agentCliId,
        items: [
          {
            rowId,
            method: "Hyperframes",
            prompt,
            durationSec: Math.max(10, Math.min(20, Number(row.duration) || 10)),
            aspectRatio: project.imageRatio,
            hyperframesResolution: "720p"
          }
        ]
      },
      {
        signal: controller.signal,
        onTaskProgress(_target, item) {
          progress.push({ at: new Date().toISOString(), ...item });
          logCheck("hyperframes_progress", { stage: item.stage, stageLabel: item.stageLabel });
        }
      }
    );
    const result = results[0];
    assert.ok(result, "Hyperframes generation returned no result");
    assert.ok(result.outputPath, `Hyperframes failed: ${result.errorMessage ?? "no outputPath"}`);
    assert.ok(existsSync(result.outputPath), `Hyperframes output missing: ${result.outputPath}`);
    assert.ok(statSync(result.outputPath).size > 0, "Hyperframes output is empty");
    const assetId = randomUUID();
    const mediaUpdate = store.upsertGeneratedShotVideo(projectId, rowId, assetId, result.outputPath, suggestedVideoAssetName(rowId, "Hyperframes", result.outputPath), true, result.posterPath);
    assert.equal(mediaUpdate.rows.some((item) => item.id === rowId && item.imageAssetIds.includes(assetId)), true, "Generated video was not attached to row");
    logCheck("hyperframes_generation_imported", { outputPath: result.outputPath, size: statSync(result.outputPath).size, assetId });
    return { ...result, assetId, progress };
  } finally {
    clearTimeout(timer);
  }
}

async function preflightHyperframesAgent(agentCliId) {
  const ids = getCustomColumnIds();
  const project = getProject();
  const row = project.rows.find(
    (item) => item.scene !== "A-ROLL" && item.customValues?.[ids.generationMethod] === "Hyperframes" && String(item.customValues?.[ids.videoPrompt] ?? "").trim() && !["—", "-"].includes(String(item.customValues?.[ids.videoPrompt]).trim())
  );
  assert.ok(row, "Missing Hyperframes row for preflight");
  const files = await runHyperframesProjectAgent({
    project,
    row,
    prompt: String(row.customValues?.[ids.videoPrompt]),
    imageRatio: project.imageRatio,
    hyperframesResolution: "720p",
    durationSec: Math.max(10, Math.min(20, Number(row.duration) || 10)),
    referenceAssets: [],
    agentCliId,
    agentProjectDir: join(project.project.localPath, ".mkboard", "e2e-agent-preflight", agentCliId)
  });
  assert.ok(files.some((file) => file.path === "index.html" && file.content.includes("<html")), `${agentCliId} did not produce index.html`);
  logCheck("hyperframes_agent_preflight", { agentCliId, files: files.map((file) => file.path) });
}

async function main() {
  mkdirSync(sandboxBase, { recursive: true });
  const project = getProject();
  assert.equal(project.project.id, projectId);
  assert.equal(project.project.name, "tibotest");
  assert.equal(project.rows.length > 0, true);
  const cloudSessionSource = process.env.MKBOARD_E2E_SESSION_FILE || "";
  const cloudSessionTarget = join(sandboxBase, "userData", "cloud-session.json");
  if (existsSync(cloudSessionSource) && !existsSync(cloudSessionTarget)) {
    writeFileSync(cloudSessionTarget, readFileSync(cloudSessionSource));
  }
  logCheck("sandbox_ready", { projectName: project.project.name, rows: project.rows.length, assets: project.assets.length, localPath: project.project.localPath });

  if (onlyRealHyperframes) {
    const ids = getCustomColumnIds();
    const hyperRow = getProject().rows.find(
      (row) => row.scene !== "A-ROLL" && String(row.customValues?.[ids.generationMethod] ?? "").trim() === "Hyperframes" && String(row.customValues?.[ids.videoPrompt] ?? "").trim() && !["—", "-"].includes(String(row.customValues?.[ids.videoPrompt]).trim())
    );
    assert.ok(hyperRow, "Missing Hyperframes target row");
    const hyperframesResult = await runRealHyperframesVideo("codex", hyperRow.id);
    report.completedAt = new Date().toISOString();
    report.realImage = null;
    report.realHyperframes = hyperframesResult ? { outputPath: hyperframesResult.outputPath, assetId: hyperframesResult.assetId } : null;
    report.final = {
      rows: getProject().rows.length,
      assets: getProject().assets.length
    };
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`[report] ${reportPath}`);
    return;
  }

  const codexTargets = await testAgent("codex");
  const claudeTargets = await testAgent("claude-code");

  if (runHyperframesAgentPreflight) {
    await preflightHyperframesAgent("codex");
    await preflightHyperframesAgent("claude-code");
  } else {
    logCheck("hyperframes_agent_preflight_skipped", { reason: "MKBOARD_E2E_PREFLIGHT_HYPERFRAMES_AGENT=0" });
  }

  const imageTask = await runRealImageGeneration(codexTargets.imageRowId);
  const hyperframesResult = await runRealHyperframesVideo("codex", codexTargets.hyperRowId);

  report.completedAt = new Date().toISOString();
  report.realImage = imageTask ? { taskId: imageTask.taskId, status: imageTask.status } : null;
  report.realHyperframes = hyperframesResult ? { outputPath: hyperframesResult.outputPath, assetId: hyperframesResult.assetId } : null;
  report.final = {
    rows: getProject().rows.length,
    assets: getProject().assets.length
  };
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`[report] ${reportPath}`);
}

main().catch((error) => {
  report.failedAt = new Date().toISOString();
  report.error = error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) };
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.error(error);
  console.error(`[report] ${reportPath}`);
  process.exit(1);
});
