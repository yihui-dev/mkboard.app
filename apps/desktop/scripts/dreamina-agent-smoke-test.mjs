import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  assertDreaminaVideoAspectRatio,
  buildDreaminaAgentInstruction,
  countDreaminaOutputFiles,
  detectDreaminaCliGenerationIntent,
  discoverDreaminaOutputGroups,
  discoverDreaminaSubmittedTasks,
  parseDreaminaSubmittedTaskList,
  removeDreaminaForbiddenMediaOperations,
  resolveDreaminaVideoAspectRatio
} from "../src/main/dreamina-agent.ts";
import { detectDreaminaCliIntent } from "../src/agent-generation-intent.ts";
import { codexSandboxModeForAgentRun } from "../src/main/codex-agent.ts";

test("Dreamina intent requires both explicit CLI identity and generation intent", () => {
  assert.deepEqual(detectDreaminaCliGenerationIntent("使用即梦 CLI 给第 4 镜生成 Seedance 2.0 视频"), { kind: "video" });
  assert.deepEqual(detectDreaminaCliGenerationIntent("Use Dreamina CLI to generate an image"), { kind: "image" });
  assert.deepEqual(detectDreaminaCliGenerationIntent("Use Dreamina CLI to generate 2x2 storyboard reference images for rows 8, 13, and 14"), { kind: "image" });
  assert.deepEqual(detectDreaminaCliGenerationIntent("Use Dreamina CLI to generate all required Seedance 2.0 videos"), { kind: "video" });
  assert.deepEqual(detectDreaminaCliGenerationIntent("用即梦CLI生成图片和视频"), { kind: "mixed" });
  assert.equal(detectDreaminaCliGenerationIntent("安装即梦 CLI"), null);
  assert.equal(detectDreaminaCliGenerationIntent("生成一段视频"), null);
  assert.equal(detectDreaminaCliGenerationIntent("你把即梦cli生成的视频，放到分镜里面去"), null);
  assert.deepEqual(detectDreaminaCliIntent("你把即梦cli生成的视频，放到分镜里面去"), { action: "recover", kind: "video" });
  assert.deepEqual(detectDreaminaCliIntent("我刚才让你用即梦 CLI 生成了视频，现在把它导入分镜"), { action: "recover", kind: "video" });
  assert.deepEqual(detectDreaminaCliIntent("查看一下即梦 CLI 当前生成任务"), { action: "recover", kind: null });
  assert.deepEqual(detectDreaminaCliIntent("现在用即梦 CLI 重新生成镜头 3 的视频"), { action: "generate", kind: "video" });
  assert.deepEqual(detectDreaminaCliIntent("刚才的即梦 CLI 视频失败了，现在重新生成镜头 3"), { action: "generate", kind: "video" });
});

test("Dreamina video ratio uses an explicit user ratio before the project ratio", () => {
  assert.deepEqual(resolveDreaminaVideoAspectRatio("使用即梦 CLI 生成视频", "9:16"), {
    aspectRatio: "9:16",
    source: "project"
  });
  assert.deepEqual(resolveDreaminaVideoAspectRatio("使用即梦 CLI 生成 3：4 视频", "9:16"), {
    aspectRatio: "3:4",
    source: "user"
  });
  assert.deepEqual(resolveDreaminaVideoAspectRatio("不要 16:9，改成 9:16 竖屏", "16:9"), {
    aspectRatio: "9:16",
    source: "user"
  });
  assert.deepEqual(resolveDreaminaVideoAspectRatio("Generate a portrait Dreamina CLI video", "4:3"), {
    aspectRatio: "9:16",
    source: "user"
  });
  assert.deepEqual(resolveDreaminaVideoAspectRatio("用即梦 CLI 生成竖屏视频", "3:4"), {
    aspectRatio: "3:4",
    source: "project"
  });
  assert.deepEqual(resolveDreaminaVideoAspectRatio("不要 16:9，改成竖屏", "3:4"), {
    aspectRatio: "3:4",
    source: "project"
  });
  assert.deepEqual(resolveDreaminaVideoAspectRatio("不要 16:9，改成竖屏", "4:3"), {
    aspectRatio: "9:16",
    source: "user"
  });
  assert.deepEqual(resolveDreaminaVideoAspectRatio("不要竖屏，改成横屏", "3:4"), {
    aspectRatio: "16:9",
    source: "user"
  });
  assert.deepEqual(resolveDreaminaVideoAspectRatio("不要 9:16", "4:3"), {
    aspectRatio: "4:3",
    source: "project"
  });
  assert.deepEqual(resolveDreaminaVideoAspectRatio("不要生成 16:9 的视频", "3:4"), {
    aspectRatio: "3:4",
    source: "project"
  });
  assert.deepEqual(resolveDreaminaVideoAspectRatio("不要做成横屏视频", "3:4"), {
    aspectRatio: "3:4",
    source: "project"
  });
  assert.deepEqual(resolveDreaminaVideoAspectRatio("请勿生成 16:9，而是 9:16", "4:3"), {
    aspectRatio: "9:16",
    source: "user"
  });
  assert.deepEqual(resolveDreaminaVideoAspectRatio("不要改成 16:9", "3:4"), {
    aspectRatio: "3:4",
    source: "project"
  });
  assert.deepEqual(resolveDreaminaVideoAspectRatio("不要横屏而要竖屏", "4:3"), {
    aspectRatio: "9:16",
    source: "user"
  });
  assert.deepEqual(resolveDreaminaVideoAspectRatio("不要竖屏而要横屏", "3:4"), {
    aspectRatio: "16:9",
    source: "user"
  });
  assert.deepEqual(resolveDreaminaVideoAspectRatio("不要 16:9 而使用 9:16", "4:3"), {
    aspectRatio: "9:16",
    source: "user"
  });
  assert.deepEqual(resolveDreaminaVideoAspectRatio("不要 16:9 而改用 9:16", "4:3"), {
    aspectRatio: "9:16",
    source: "user"
  });
  assert.deepEqual(resolveDreaminaVideoAspectRatio("不要 16:9 而应该是 9:16", "4:3"), {
    aspectRatio: "9:16",
    source: "user"
  });
  assert.deepEqual(resolveDreaminaVideoAspectRatio("不要横屏要竖屏", "4:3"), {
    aspectRatio: "9:16",
    source: "user"
  });
  assert.deepEqual(resolveDreaminaVideoAspectRatio("不要 16:9 用 9:16", "4:3"), {
    aspectRatio: "9:16",
    source: "user"
  });
  assert.deepEqual(resolveDreaminaVideoAspectRatio("不要使用 16:9", "3:4"), {
    aspectRatio: "3:4",
    source: "project"
  });
  assert.deepEqual(resolveDreaminaVideoAspectRatio("不要横屏别用竖屏", "4:3"), {
    aspectRatio: "4:3",
    source: "project"
  });
});

test("Dreamina output ratio validation rejects landscape output for a portrait task", () => {
  assert.doesNotThrow(() => assertDreaminaVideoAspectRatio({ width: 834, height: 1112, displayAspectRatio: "3:4" }, "3:4"));
  assert.doesNotThrow(() => assertDreaminaVideoAspectRatio({ width: 1080, height: 1920 }, "9:16"));
  assert.throws(
    () => assertDreaminaVideoAspectRatio({ width: 1920, height: 1080, displayAspectRatio: "16:9" }, "3:4"),
    /期望 3:4，实际 16:9/u
  );
});

test("Dreamina instruction forbids KIE, pins output directories, and forces the resolved video ratio", () => {
  const prompt = buildDreaminaAgentInstruction({
    kind: "video",
    outputDir: "/tmp/mkboard-dreamina",
    projectAspectRatio: "3:4",
    videoAspectRatio: "3:4",
    videoAspectRatioSource: "project"
  });
  assert.match(prompt, /不得调用 KIE/u);
  assert.match(prompt, /row-<当前分镜的 1-based 行号>/u);
  assert.match(prompt, /operations.*必须为 \[\]/u);
  assert.match(prompt, /--download_dir/u);
  assert.match(prompt, /Library\/Keychains/u);
  assert.match(prompt, /seedance2\.0_vip/u);
  assert.match(prompt, /多个 Seedance 视频必须严格串行/u);
  assert.match(prompt, /用户未明确指定不同的精确视频比例，已采用当前项目比例/u);
  assert.match(prompt, /--ratio=3:4/u);
  assert.match(prompt, /不得省略 `--ratio`/u);
  assert.match(prompt, /有参考图片或视频时使用[^\n]*`multimodal2video`/u);
  assert.match(prompt, /没有任何参考素材时使用[^\n]*`text2video`/u);
  assert.doesNotMatch(prompt, /必须使用支持显式比例的 `multimodal2video`/u);
  assert.match(prompt, /优先控制在 1-3 个短句内/u);
  assert.match(prompt, /禁止 BGM、配乐、旋律和背景音乐/u);
  assert.match(prompt, /相邻 Shot 在后期直接硬切/u);
  assert.match(prompt, /明确点名即梦 CLI/u);
  assert.match(prompt, /`DREAMINA_BIN` 指向的可执行文件/u);
  assert.match(prompt, /`command -v dreamina`/u);
  assert.match(prompt, /`~\/\.local\/bin\/dreamina`/u);
  assert.match(prompt, /curl -s https:\/\/jimeng\.jianying\.com\/cli \| bash/u);
  assert.match(prompt, /安装完成后再次按上述顺序检测/u);
  assert.match(prompt, /不得安装其他 CLI/u);
  assert.match(prompt, /不要改用 KIE 或其他 Provider/u);
});

test("Codex and Claude Code receive the same Agent-owned Dreamina install instruction", () => {
  const source = readFileSync(join(import.meta.dirname, "../src/main/codex-agent.ts"), "utf8");
  const runner = source.slice(source.indexOf("export async function runStoryboardAgent"), source.indexOf("export function codexSandboxModeForAgentRun"));
  const promptBuilder = source.slice(source.indexOf("function buildPrompt"), source.indexOf("function buildHyperframesProjectPrompt"));
  assert.match(runner, /const prompt = buildPrompt\(input, executable\.name\)/u);
  assert.match(runner, /executable\.id === "codex"[\s\S]*runCodex[\s\S]*runClaudeCode/u);
  assert.match(promptBuilder, /buildDreaminaAgentInstruction\(dreaminaGeneration\)/u);
  assert.match(promptBuilder, /## 当前项目比例[\s\S]*\$\{project\.imageRatio\}/u);
});

test("only an authorized Dreamina Agent run bypasses the Codex macOS sandbox", () => {
  assert.equal(codexSandboxModeForAgentRun(), "workspace-write");
  assert.equal(
    codexSandboxModeForAgentRun({
      kind: "video",
      outputDir: "/tmp/mkboard-dreamina",
      projectAspectRatio: "9:16",
      videoAspectRatio: "9:16",
      videoAspectRatioSource: "project"
    }),
    "danger-full-access"
  );
});

test("Dreamina output discovery groups row results and general assets", () => {
  const root = mkdtempSync(join(tmpdir(), "mkboard-dreamina-test-"));
  try {
    mkdirSync(join(root, "row-4"), { recursive: true });
    mkdirSync(join(root, "row-9", "nested"), { recursive: true });
    mkdirSync(join(root, "general"), { recursive: true });
    writeFileSync(join(root, "row-4", "shot.mp4"), "video");
    writeFileSync(join(root, "row-9", "nested", "shot.webp"), "image");
    writeFileSync(join(root, "general", "poster.png"), "image");
    writeFileSync(join(root, "general", "result.json"), "{}");
    const groups = discoverDreaminaOutputGroups(root);
    assert.deepEqual(groups.map((group) => group.rowIndex), [4, 9, null]);
    assert.equal(countDreaminaOutputFiles(groups), 3);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Dreamina task discovery recovers submit ids from run-local manifests and logs", () => {
  const root = mkdtempSync(join(tmpdir(), "mkboard-dreamina-task-test-"));
  try {
    mkdirSync(join(root, "row-3"), { recursive: true });
    mkdirSync(join(root, ".cli-home", ".dreamina_cli", "logs"), { recursive: true });
    writeFileSync(join(root, "row-3", "task-submit.json"), JSON.stringify({
      submit_id: "manifest-task",
      gen_status: "querying",
      prompt: "镜头三提示词"
    }));
    const request = JSON.stringify({
      image_paths: ["/project/assets/row-7.png"],
      prompt: "镜头七提示词"
    });
    writeFileSync(
      join(root, ".cli-home", ".dreamina_cli", "logs", "dreamina.log"),
      `Info [SubmitTask] submit generation task finished gen_task_type=multimodal2video submit_id=log-task task_status=querying input=${request}\n`
    );
    const tasks = discoverDreaminaSubmittedTasks(root, [
      { rowIndex: 3, prompt: "镜头三提示词", referencePaths: ["/project/assets/row-3.png"] },
      { rowIndex: 7, prompt: "镜头七提示词", referencePaths: ["/project/assets/row-7.png"] }
    ]);
    assert.deepEqual(
      tasks.map((task) => ({ submitId: task.submitId, rowIndex: task.rowIndex, status: task.status })),
      [
        { submitId: "manifest-task", rowIndex: 3, status: "querying" },
        { submitId: "log-task", rowIndex: 7, status: "querying" }
      ]
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Dreamina service task fallback only maps unambiguous project prompts", () => {
  const hints = [
    { rowIndex: 3, prompt: "镜头三唯一提示词", referencePaths: [] },
    { rowIndex: 7, prompt: "重复提示词", referencePaths: [] },
    { rowIndex: 8, prompt: "重复提示词", referencePaths: [] }
  ];
  const tasks = parseDreaminaSubmittedTaskList([
    { submit_id: "newest-task", prompt: "镜头三唯一提示词", gen_status: "success" },
    { submit_id: "ambiguous-task", prompt: "重复提示词", gen_status: "success" }
  ], hints);
  assert.deepEqual(
    tasks.map((task) => ({ submitId: task.submitId, rowIndex: task.rowIndex, order: task.order })),
    [
      { submitId: "newest-task", rowIndex: 3, order: 2 },
      { submitId: "ambiguous-task", rowIndex: null, order: 1 }
    ]
  );
});

test("Dreamina responses cannot fall through to MkBoard regenerate_media", () => {
  const response = removeDreaminaForbiddenMediaOperations({
    reply: "done",
    operations: [
      { type: "regenerate_media", rowRefs: [{ kind: "index", value: 4 }], kind: "video", overwriteExisting: true },
      { type: "update_script", scriptHtml: "<p>ok</p>" }
    ]
  });
  assert.deepEqual(response.operations, [{ type: "update_script", scriptHtml: "<p>ok</p>" }]);
});
