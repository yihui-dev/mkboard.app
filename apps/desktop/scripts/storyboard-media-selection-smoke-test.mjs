import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { MkboardStore } from "../src/main/database.ts";

function createStoreFixture() {
  const root = mkdtempSync(join(tmpdir(), "mkboard-storyboard-media-test-"));
  return {
    root,
    store: new MkboardStore(join(root, "data", "mkboard.sqlite"), join(root, "projects"))
  };
}

test("a completed generation poll cannot restore media explicitly removed by the user", () => {
  const { root, store } = createStoreFixture();

  try {
    const template = store.listTemplates("zh-CN").find((item) => item.scope === "system");
    const taste = store.listTastes()[0];
    assert.ok(template);
    assert.ok(taste);

    const project = store.createProject({
      name: "轮询删除回归测试",
      icon: "clapperboard",
      templateId: template.id,
      tasteId: taste.id,
      interfaceLanguage: "zh-CN"
    });
    const [row] = store.createShots(project.project.id, 1);
    assert.ok(row);

    const firstUpdate = store.importShotMediaBuffer(project.project.id, row.id, "generated-a.png", new Uint8Array([1, 2, 3]));
    const firstAssetId = firstUpdate.rows[0]?.imageAssetIds?.[0];
    assert.ok(firstAssetId);

    const secondUpdate = store.importShotMediaBuffer(project.project.id, row.id, "generated-b.png", new Uint8Array([4, 5, 6]));
    const selectedIds = secondUpdate.rows[0]?.imageAssetIds ?? [];
    assert.equal(selectedIds.length, 2);
    const removedAssetId = selectedIds.find((assetId) => assetId !== firstAssetId);
    assert.ok(removedAssetId);

    const afterRemoval = store.updateShotMedia(project.project.id, row.id, [firstAssetId]);
    assert.deepEqual(afterRemoval.rows[0]?.imageAssetIds, [firstAssetId]);
    assert.equal(afterRemoval.assets.find((asset) => asset.id === removedAssetId)?.linkedShotId, null);

    const afterRepeatedPoll = store.ensureShotMediaAsset(project.project.id, row.id, removedAssetId);
    assert.deepEqual(afterRepeatedPoll.rows[0]?.imageAssetIds, [firstAssetId]);
    assert.equal(afterRepeatedPoll.assets.find((asset) => asset.id === removedAssetId)?.linkedShotId, null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("pasted agent images are persisted and deduplicated as project assets", () => {
  const { root, store } = createStoreFixture();

  try {
    const template = store.listTemplates("zh-CN").find((item) => item.scope === "system");
    const taste = store.listTastes()[0];
    assert.ok(template);
    assert.ok(taste);

    const project = store.createProject({
      name: "Agent 图片粘贴回归测试",
      icon: "clapperboard",
      templateId: template.id,
      tasteId: taste.id,
      interfaceLanguage: "zh-CN"
    });
    const imageBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
    const firstImport = store.importAgentImageAttachmentBuffer(project.project.id, "clipboard.png", imageBytes);
    const repeatedImport = store.importAgentImageAttachmentBuffer(project.project.id, "clipboard-copy.png", imageBytes);

    assert.equal(firstImport.length, 1);
    assert.equal(repeatedImport.length, 1);
    assert.equal(firstImport[0]?.kind, "image");
    assert.equal(firstImport[0]?.id, repeatedImport[0]?.id);
    assert.equal(existsSync(join(project.project.localPath, firstImport[0]?.indexedPath ?? "")), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("re-parsing a storyboard resets row media while preserving assets in the library", () => {
  const { root, store } = createStoreFixture();

  try {
    const template = store.listTemplates("zh-CN").find((item) => item.scope === "system");
    const taste = store.listTastes()[0];
    assert.ok(template);
    assert.ok(taste);
    const project = store.createProject({
      name: "分镜重生成素材重置测试",
      icon: "clapperboard",
      templateId: template.id,
      tasteId: taste.id,
      interfaceLanguage: "zh-CN"
    });
    const [aRollRow, bRollRow] = store.createShots(project.project.id, 2);
    assert.ok(aRollRow);
    assert.ok(bRollRow);
    store.updateShot(project.project.id, { id: aRollRow.id, field: "scene", value: "A-ROLL" });
    store.updateShot(project.project.id, { id: bRollRow.id, field: "scene", value: "B-ROLL" });

    const aRollMedia = store.importShotMediaBuffer(project.project.id, aRollRow.id, "a-roll.png", new Uint8Array([1, 2, 3]));
    const bRollMedia = store.importShotMediaBuffer(project.project.id, bRollRow.id, "b-roll.mp4", new Uint8Array([4, 5, 6]));
    const aRollAssetId = aRollMedia.rows.find((row) => row.id === aRollRow.id)?.imageAssetIds?.[0];
    const bRollAssetId = bRollMedia.rows.find((row) => row.id === bRollRow.id)?.imageAssetIds?.[0];
    assert.ok(aRollAssetId);
    assert.ok(bRollAssetId);

    store.replaceRowsAfterStoryboardParse(project.project.id, [
      {
        id: "",
        shot: "1",
        scene: "A-ROLL",
        duration: "6",
        content: "新的 A-ROLL",
        note: "",
        imageAssetIds: [aRollAssetId],
        customValues: {
          aRollSampleHidden: "true",
          promptPreviewImageAssetId: aRollAssetId,
          storyboardMediaSelectionTouched: "true",
          "custom-1": "保留新的提示词"
        }
      },
      {
        id: "",
        shot: "2",
        scene: "B-ROLL",
        duration: "10",
        content: "新的 B-ROLL",
        note: "",
        imageAssetIds: [bRollAssetId],
        customValues: {}
      }
    ]);

    const detail = store.getProject(project.project.id, "zh-CN");
    assert.deepEqual(detail.rows.map((row) => row.imageAssetIds), [[], []]);
    assert.equal(detail.rows[0]?.customValues?.aRollSampleHidden, undefined);
    assert.equal(detail.rows[0]?.customValues?.promptPreviewImageAssetId, undefined);
    assert.equal(detail.rows[0]?.customValues?.storyboardMediaSelectionTouched, undefined);
    assert.equal(detail.rows[0]?.customValues?.["custom-1"], "保留新的提示词");
    assert.equal(detail.assets.find((asset) => asset.id === aRollAssetId)?.linkedShotId, null);
    assert.equal(detail.assets.find((asset) => asset.id === bRollAssetId)?.linkedShotId, null);
    assert.equal(detail.assets.some((asset) => asset.id === aRollAssetId), true);
    assert.equal(detail.assets.some((asset) => asset.id === bRollAssetId), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("stale storyboard parse messages are canceled without touching the active run", () => {
  const { root, store } = createStoreFixture();

  try {
    const template = store.listTemplates("zh-CN").find((item) => item.scope === "system");
    const taste = store.listTastes()[0];
    assert.ok(template);
    assert.ok(taste);
    const project = store.createProject({
      name: "分镜运行态恢复测试",
      icon: "clapperboard",
      templateId: template.id,
      tasteId: taste.id,
      interfaceLanguage: "zh-CN"
    });
    const conversationId = project.activeAgentConversationId;
    store.appendAgentMessage(project.project.id, "assistant", "active", {
      conversationId,
      clientRunId: "active-run",
      events: [{ kind: "status", label: "storyboard_parse" }],
      runStatus: "running"
    });
    store.appendAgentMessage(project.project.id, "assistant", "stale", {
      conversationId,
      clientRunId: "stale-run",
      events: [{ kind: "status", label: "storyboard_parse" }, { kind: "status", label: "running" }],
      runStatus: "running"
    });

    assert.equal(store.markInterruptedStoryboardParseRuns(project.project.id, "active-run"), 1);
    assert.equal(store.markInterruptedStoryboardParseRuns(project.project.id, "active-run"), 0);
    const messages = store.getAgentConversation(project.project.id, conversationId).messages;
    assert.equal(messages.find((message) => message.clientRunId === "active-run")?.runStatus, "running");
    const staleMessage = messages.find((message) => message.clientRunId === "stale-run");
    assert.equal(staleMessage?.runStatus, "canceled");
    assert.match(JSON.stringify(staleMessage?.events), /MkBoard 退出而中断/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Dreamina Agent video tasks preserve their provider in local generation progress", () => {
  const { root, store } = createStoreFixture();

  try {
    const template = store.listTemplates("zh-CN").find((item) => item.scope === "system");
    const taste = store.listTastes()[0];
    assert.ok(template);
    assert.ok(taste);

    const project = store.createProject({
      name: "即梦生成进度回归测试",
      icon: "clapperboard",
      templateId: template.id,
      tasteId: taste.id,
      interfaceLanguage: "zh-CN"
    });
    const [row] = store.createShots(project.project.id, 1);
    assert.ok(row);
    const createdTask = store.createStoryboardVideoTask({
      projectId: project.project.id,
      rowId: row.id,
      method: "Seedance 2.0",
      prompt: "中景，人物转身。无 BGM，只保留脚步声。",
      aspectRatio: "16:9",
      durationSec: 12
    });
    const runningTask = store.updateStoryboardVideoTask(project.project.id, createdTask.id, {
      status: "running",
      provider: "dreamina_cli",
      outputDir: join(root, "dreamina-output")
    });
    assert.ok(runningTask);
    assert.equal(runningTask.provider, "dreamina_cli");
    assert.equal(store.listRecoverableStoryboardVideoTasks(project.project.id)[0]?.id, createdTask.id);

    const activeTask = store.mapStoryboardVideoTask(runningTask);
    assert.equal(activeTask.provider, "dreamina_cli");
    assert.equal(activeTask.status, "running");
    assert.equal(activeTask.method, "Seedance 2.0");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("agent completion notifications survive legacy SQLite migration and clear only when opened", () => {
  const root = mkdtempSync(join(tmpdir(), "mkboard-agent-completion-test-"));
  const dataDir = join(root, "data");
  const dbPath = join(dataDir, "mkboard.sqlite");
  mkdirSync(dataDir, { recursive: true });
  const legacyDatabase = new Database(dbPath);
  legacyDatabase.exec(`
    CREATE TABLE agent_conversations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  legacyDatabase.close();

  const store = new MkboardStore(dbPath, join(root, "projects"));
  try {
    const template = store.listTemplates("zh-CN").find((item) => item.scope === "system");
    const taste = store.listTastes()[0];
    assert.ok(template);
    assert.ok(taste);

    const project = store.createProject({
      name: "对话完成提醒回归测试",
      icon: "clapperboard",
      templateId: template.id,
      tasteId: taste.id,
      interfaceLanguage: "zh-CN"
    });
    const conversationId = project.activeAgentConversationId;
    assert.equal(project.agentConversations.find((conversation) => conversation.id === conversationId)?.hasUnreadCompletion, false);

    const succeededMessage = store.appendAgentMessage(project.project.id, "assistant", "处理中", {
      conversationId,
      runStatus: "running",
      clientRunId: "run-succeeded"
    });
    store.updateAgentMessage(project.project.id, succeededMessage.id, { content: "已完成", runStatus: "succeeded" });
    assert.equal(store.getAgentConversation(project.project.id, conversationId).conversations.find((conversation) => conversation.id === conversationId)?.hasUnreadCompletion, true);

    const secondConversationId = store.createAgentConversation(project.project.id).activeConversationId;
    const secondSucceededMessage = store.appendAgentMessage(project.project.id, "assistant", "另一项任务处理中", {
      conversationId: secondConversationId,
      runStatus: "running",
      clientRunId: "run-second-succeeded"
    });
    store.updateAgentMessage(project.project.id, secondSucceededMessage.id, { content: "另一项任务已完成", runStatus: "succeeded" });
    const conversationsWithTwoUnread = store.getAgentConversation(project.project.id, conversationId).conversations;
    assert.equal(
      conversationsWithTwoUnread.find((conversation) => conversation.id === conversationId)?.hasUnreadCompletion,
      true,
      `first conversation missing unread state: ${JSON.stringify(conversationsWithTwoUnread)}`
    );
    assert.equal(
      conversationsWithTwoUnread.find((conversation) => conversation.id === secondConversationId)?.hasUnreadCompletion,
      true,
      `second conversation missing unread state: ${JSON.stringify(conversationsWithTwoUnread)}`
    );

    const conversationsAfterOpeningFirst = store.markAgentConversationCompletionSeen(project.project.id, conversationId).conversations;
    assert.equal(conversationsAfterOpeningFirst.find((conversation) => conversation.id === conversationId)?.hasUnreadCompletion, false);
    assert.equal(conversationsAfterOpeningFirst.find((conversation) => conversation.id === secondConversationId)?.hasUnreadCompletion, true);
    store.markAgentConversationCompletionSeen(project.project.id, secondConversationId);
    store.updateAgentMessage(project.project.id, succeededMessage.id, { content: "已完成并写回" });
    const conversationsAfterContentUpdate = store.getAgentConversation(project.project.id, conversationId).conversations;
    assert.equal(conversationsAfterContentUpdate.find((conversation) => conversation.id === conversationId)?.hasUnreadCompletion, false);
    assert.equal(conversationsAfterContentUpdate.find((conversation) => conversation.id === secondConversationId)?.hasUnreadCompletion, false);

    const failedMessage = store.appendAgentMessage(project.project.id, "assistant", "处理中", {
      conversationId,
      runStatus: "running",
      clientRunId: "run-failed"
    });
    store.updateAgentMessage(project.project.id, failedMessage.id, { content: "生成失败", runStatus: "failed" });
    assert.equal(store.getAgentConversation(project.project.id, conversationId).conversations.find((conversation) => conversation.id === conversationId)?.hasUnreadCompletion, true);

    store.markAgentConversationCompletionSeen(project.project.id, conversationId);
    const canceledMessage = store.appendAgentMessage(project.project.id, "assistant", "处理中", {
      conversationId,
      runStatus: "running",
      clientRunId: "run-canceled"
    });
    store.updateAgentMessage(project.project.id, canceledMessage.id, { content: "已取消", runStatus: "canceled" });
    assert.equal(store.getAgentConversation(project.project.id, conversationId).conversations.find((conversation) => conversation.id === conversationId)?.hasUnreadCompletion, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
