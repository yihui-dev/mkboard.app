import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import { startMcpControlServer } from "../src/main/mcp/control-server.ts";
import { createMcpToolHandler, EXTERNAL_STYLE_GUIDANCE, joinMp3Chunks } from "../src/main/mcp/host.ts";
import {
  getMcpIntegrationStatus,
  hasCodexMcpServer,
  registeredCodexMcpServerNames,
  removeClaudeMcpServer,
  removeCodexMcpServer,
  setMcpIntegrationEnabled,
  syncMcpIntegration,
  upsertClaudeMcpServer,
  upsertCodexMcpServer
} from "../src/main/mcp/integration.ts";
import { resolveMcpSocketPath } from "../src/main/mcp/protocol.ts";
import { runMkboardMcpServer } from "../src/main/mcp/server.ts";
import { MKBOARD_MCP_TOOLS } from "../src/main/mcp/tools.ts";
import { buildCodexExecArgs } from "../src/main/codex-agent.ts";

const projectId = "project-1";

test("Codex config edits only touch MkBoard's own mcp_servers tables", () => {
  const original = [
    'model = "gpt-5"',
    "",
    "[mcp_servers.chatcut_desktop]",
    'command = "/tmp/chatcut-mcp"',
    "",
    "[mcp_servers.chatcut_desktop.env]",
    'CHATCUT_MCP_CLIENT = "codex_app"',
    "",
    '[plugins."github@openai-curated"]',
    "enabled = true",
    ""
  ].join("\n");
  const added = upsertCodexMcpServer(original, "mkboard", "/Users/me/Library/Application Support/MkBoard/mkboard-mcp", { MKBOARD_MCP_CLIENT: "codex" });
  assert.ok(added.startsWith(original.trimEnd()));
  assert.match(added, /\[mcp_servers\.mkboard\]\ncommand = "\/Users\/me\/Library\/Application Support\/MkBoard\/mkboard-mcp"/);
  assert.match(added, /\[mcp_servers\.mkboard\.env\]\nMKBOARD_MCP_CLIENT = "codex"/);
  assert.equal(hasCodexMcpServer(added, "mkboard"), true);
  assert.equal(upsertCodexMcpServer(added, "mkboard", "/Users/me/Library/Application Support/MkBoard/mkboard-mcp", { MKBOARD_MCP_CLIENT: "codex" }), added);

  const moved = upsertCodexMcpServer(added, "mkboard", "/new/path/mkboard-mcp", { MKBOARD_MCP_CLIENT: "codex" });
  assert.equal(moved.match(/\[mcp_servers\.mkboard\]/g).length, 1);
  assert.match(moved, /command = "\/new\/path\/mkboard-mcp"/);

  const removed = removeCodexMcpServer(moved, "mkboard");
  assert.equal(hasCodexMcpServer(removed, "mkboard"), false);
  assert.match(removed, /\[mcp_servers\.chatcut_desktop\.env\]\nCHATCUT_MCP_CLIENT = "codex_app"/);
  assert.match(removed, /\[plugins\."github@openai-curated"\]\nenabled = true/);

  const inline = '[mcp_servers]\nmkboard = { command = "/custom" }\n';
  assert.equal(upsertCodexMcpServer(inline, "mkboard", "/x", {}), inline);
});

test("Claude config edits keep other keys and never rewrite unparseable JSON", () => {
  const original = JSON.stringify({ numStartups: 3, mcpServers: { other: { type: "stdio", command: "/bin/other" } }, projects: {} }, null, 2);
  const entry = { type: "stdio", command: "/tmp/mkboard-mcp", args: [], env: { MKBOARD_MCP_CLIENT: "claude_code" } };
  const next = upsertClaudeMcpServer(original, "mkboard", entry);
  const parsed = JSON.parse(next);
  assert.deepEqual(parsed.mcpServers.mkboard, entry);
  assert.deepEqual(parsed.mcpServers.other, { type: "stdio", command: "/bin/other" });
  assert.equal(parsed.numStartups, 3);
  assert.equal(upsertClaudeMcpServer(next, "mkboard", entry), next);
  assert.equal(upsertClaudeMcpServer("{ broken", "mkboard", entry), null);
  assert.equal("mkboard" in JSON.parse(removeClaudeMcpServer(next, "mkboard")).mcpServers, false);
});

test("integration registers both clients, installs the skill and respects manual removal", () => {
  const root = mkdtempSync(join(tmpdir(), "mkboard-mcp-integration-"));
  try {
    const homeDir = join(root, "home");
    const userDataDir = join(root, "userData");
    mkdirSync(join(homeDir, ".claude"), { recursive: true });
    mkdirSync(join(homeDir, ".codex"), { recursive: true });
    writeFileSync(join(homeDir, ".claude.json"), JSON.stringify({ numStartups: 1 }, null, 2), { mode: 0o600 });
    writeFileSync(join(homeDir, ".codex", "config.toml"), 'model = "gpt-5"\n');
    const options = {
      variant: "production",
      userDataDir,
      homeDir,
      socketPath: resolveMcpSocketPath(userDataDir, "production", "darwin"),
      electronExecPath: "/Applications/MkBoard.app/Contents/MacOS/MkBoard",
      serverScriptPath: "/Applications/MkBoard.app/Contents/Resources/app.asar/out/mcp/server.cjs",
      appLaunchPath: "/Applications/MkBoard.app",
      appVersion: "0.2.7",
      platform: "darwin"
    };

    const status = syncMcpIntegration(options);
    assert.equal(status.enabled, true);
    assert.deepEqual(status.clients.map((client) => [client.id, client.registered]), [["claude_code", true], ["codex", true]]);
    const launcher = readFileSync(join(userDataDir, "mkboard-mcp"), "utf8");
    assert.match(launcher, /export ELECTRON_RUN_AS_NODE='1'/);
    assert.match(launcher, /exec '\/Applications\/MkBoard\.app\/Contents\/MacOS\/MkBoard' '\/Applications\/MkBoard\.app\/Contents\/Resources\/app\.asar\/out\/mcp\/server\.cjs' "\$@"/);
    assert.equal(statSync(join(userDataDir, "mkboard-mcp")).mode & 0o777, 0o755);
    assert.equal(statSync(join(homeDir, ".claude.json")).mode & 0o777, 0o600);
    assert.equal(JSON.parse(readFileSync(join(homeDir, ".claude.json"), "utf8")).numStartups, 1);
    assert.deepEqual(registeredCodexMcpServerNames(homeDir), ["mkboard"]);
    for (const skillRoot of [join(homeDir, ".claude", "skills"), join(homeDir, ".codex", "skills")]) {
      const skill = readFileSync(join(skillRoot, "mkboard-storyboard", "SKILL.md"), "utf8");
      assert.match(skill, /name: mkboard-storyboard/);
      assert.match(skill, /Do not ask about, look up or imitate the MkBoard project style/);
    }

    // The user removes MkBoard from Codex by hand: the next launch must not add it back.
    writeFileSync(join(homeDir, ".codex", "config.toml"), 'model = "gpt-5"\n');
    const afterRemoval = syncMcpIntegration(options);
    const codex = afterRemoval.clients.find((client) => client.id === "codex");
    assert.equal(codex.registered, false);
    assert.equal(codex.removedByUser, true);
    assert.equal(syncMcpIntegration(options).clients.find((client) => client.id === "codex").registered, false);

    // Reconnecting from settings registers it again.
    assert.equal(setMcpIntegrationEnabled(options, true).clients.find((client) => client.id === "codex").registered, true);

    const disabled = setMcpIntegrationEnabled(options, false);
    assert.equal(disabled.enabled, false);
    assert.ok(disabled.clients.every((client) => !client.registered));
    assert.equal(existsSync(join(homeDir, ".claude", "skills", "mkboard-storyboard")), false);
    assert.equal(getMcpIntegrationStatus(options).enabled, false);
    assert.equal(syncMcpIntegration(options).clients.some((client) => client.registered), false);

    // A user-owned skill with the same name is never overwritten or deleted.
    mkdirSync(join(homeDir, ".codex", "skills", "mkboard-storyboard"), { recursive: true });
    writeFileSync(join(homeDir, ".codex", "skills", "mkboard-storyboard", "SKILL.md"), "mine");
    setMcpIntegrationEnabled(options, true);
    setMcpIntegrationEnabled(options, false);
    assert.equal(readFileSync(join(homeDir, ".codex", "skills", "mkboard-storyboard", "SKILL.md"), "utf8"), "mine");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("development and production keep separate registration state in the shared userData folder", () => {
  const root = mkdtempSync(join(tmpdir(), "mkboard-mcp-variants-"));
  try {
    const homeDir = join(root, "home");
    const userDataDir = join(root, "userData");
    mkdirSync(join(homeDir, ".claude"), { recursive: true });
    mkdirSync(join(homeDir, ".codex"), { recursive: true });
    mkdirSync(userDataDir, { recursive: true });
    writeFileSync(join(homeDir, ".claude.json"), "{}\n");
    writeFileSync(join(homeDir, ".codex", "config.toml"), 'model = "gpt-5"\n');
    const base = { userDataDir, homeDir, electronExecPath: "/bin/electron", serverScriptPath: "/app/out/mcp/server.cjs", appVersion: "0.2.8", platform: "darwin" };
    const dev = { ...base, variant: "development", socketPath: resolveMcpSocketPath(userDataDir, "development", "darwin") };
    const prod = { ...base, variant: "production", socketPath: resolveMcpSocketPath(userDataDir, "production", "darwin"), appLaunchPath: "/Applications/MkBoard.app" };
    const registeredNames = () => ({
      claude: Object.keys(JSON.parse(readFileSync(join(homeDir, ".claude.json"), "utf8")).mcpServers ?? {}).sort(),
      codex: registeredCodexMcpServerNames(homeDir)
    });

    // State left by desktop <= 0.2.7: the dev build registered first, production then marked itself removed.
    syncMcpIntegration(dev);
    writeFileSync(
      join(userDataDir, "mcp-integration-state.json"),
      JSON.stringify({ version: 1, enabled: true, clients: { claude_code: { registered: false, removedByUser: true }, codex: { registered: false, removedByUser: true } } })
    );
    const prodStatus = syncMcpIntegration(prod);
    assert.ok(prodStatus.clients.every((client) => client.registered && !client.removedByUser));
    assert.deepEqual(registeredNames(), { claude: ["mkboard", "mkboard_dev"], codex: ["mkboard", "mkboard_dev"] });

    // Alternating launches keep both registered.
    for (let round = 0; round < 2; round += 1) {
      syncMcpIntegration(dev);
      syncMcpIntegration(prod);
    }
    assert.deepEqual(registeredNames(), { claude: ["mkboard", "mkboard_dev"], codex: ["mkboard", "mkboard_dev"] });
    assert.equal(JSON.parse(readFileSync(join(userDataDir, "mcp-integration-state.json"), "utf8")).variant, "production");
    assert.equal(JSON.parse(readFileSync(join(userDataDir, "mcp-integration-state-dev.json"), "utf8")).variant, "development");

    // Disconnecting the dev build leaves production alone; a manual removal of mkboard is still respected.
    setMcpIntegrationEnabled(dev, false);
    assert.equal(syncMcpIntegration(prod).enabled, true);
    assert.deepEqual(registeredNames(), { claude: ["mkboard"], codex: ["mkboard"] });
    writeFileSync(join(homeDir, ".codex", "config.toml"), 'model = "gpt-5"\n');
    assert.equal(syncMcpIntegration(prod).clients.find((client) => client.id === "codex").removedByUser, true);
    assert.equal(syncMcpIntegration(prod).clients.find((client) => client.id === "codex").registered, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a legacy production-only state keeps the user's manual removal", () => {
  const root = mkdtempSync(join(tmpdir(), "mkboard-mcp-legacy-state-"));
  try {
    const homeDir = join(root, "home");
    const userDataDir = join(root, "userData");
    mkdirSync(join(homeDir, ".codex"), { recursive: true });
    mkdirSync(userDataDir, { recursive: true });
    writeFileSync(join(homeDir, ".codex", "config.toml"), 'model = "gpt-5"\n');
    writeFileSync(join(userDataDir, "mcp-integration-state.json"), JSON.stringify({ version: 1, enabled: true, clients: { codex: { registered: false, removedByUser: true } } }));
    const status = syncMcpIntegration({
      variant: "production",
      userDataDir,
      homeDir,
      socketPath: resolveMcpSocketPath(userDataDir, "production", "darwin"),
      electronExecPath: "/bin/electron",
      serverScriptPath: "/app/out/mcp/server.cjs",
      appVersion: "0.2.8",
      platform: "darwin"
    });
    assert.equal(status.clients.find((client) => client.id === "codex").registered, false);
    assert.deepEqual(registeredCodexMcpServerNames(homeDir), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("sidebar Codex runs switch off registered MkBoard MCP servers", () => {
  const root = mkdtempSync(join(tmpdir(), "mkboard-mcp-codex-home-"));
  const previous = process.env.CODEX_HOME;
  try {
    writeFileSync(join(root, "config.toml"), '[mcp_servers.mkboard]\ncommand = "/x"\n\n[mcp_servers.mkboard_dev]\ncommand = "/y"\n');
    process.env.CODEX_HOME = root;
    const args = buildCodexExecArgs("/tmp/project", "/tmp/out.json", "/tmp/schema.json");
    assert.ok(args.includes("mcp_servers.mkboard.enabled=false"));
    assert.ok(args.includes("mcp_servers.mkboard_dev.enabled=false"));
  } finally {
    if (previous === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previous;
    rmSync(root, { recursive: true, force: true });
  }
});

test("MCP tools read and edit the project through the shared operation executor", async () => {
  const root = mkdtempSync(join(tmpdir(), "mkboard-mcp-host-"));
  try {
    const { store } = createFakeStore(root);
    const changes = [];
    const handle = createMcpToolHandler({
      store,
      getActiveView: () => ({ projectId, screen: "workspace", tab: "storyboard" }),
      openProject: async () => undefined,
      notifyProjectChanged: (id, tool) => changes.push([id, tool]),
      downloadsDir: join(root, "downloads"),
      fetchImpl: async () => new Response(Buffer.from("fake-png"), { headers: { "content-type": "image/png" } })
    });

    const active = await handle("get_active_project", {});
    assert.equal(active.activeProject.id, projectId);
    assert.equal(active.activeProject.shotCount, 2);

    const read = await handle("read_project", {});
    assert.equal(read.styleGuidance, EXTERNAL_STYLE_GUIDANCE);
    assert.doesNotMatch(JSON.stringify(read), /测试 Taste|taste-content-secret/);
    assert.equal(read.columns.find((column) => column.id === "custom-1").semantic, "imagePrompt");
    assert.equal(read.rows[1].index, 2);

    await handle("update_shot_cells", { updates: [{ row: "2", cells: [{ field: "图像提示词", value: "城市夜景" }, { field: "note", value: "推近" }] }] });
    assert.equal(store.rows[1].customValues["custom-1"], "城市夜景");
    assert.equal(store.rows[1].note, "推近");

    const inserted = await handle("insert_shots", {
      row: "1",
      placement: "after",
      rows: Array.from({ length: 25 }, (_, index) => ({ scene: "B-ROLL", content: `新镜头 ${index + 1}` }))
    });
    assert.equal(inserted.insertedCount, 25);
    assert.deepEqual(
      store.rows.slice(0, 4).map((row) => row.content),
      ["第 1 镜", "新镜头 1", "新镜头 2", "新镜头 3"]
    );
    assert.equal(store.rows[25].content, "新镜头 25");
    assert.equal(store.rows[26].content, "第 2 镜");

    await handle("delete_shots", { rows: Array.from({ length: 25 }, (_, index) => String(index + 2)) });
    assert.deepEqual(store.rows.map((row) => row.content), ["第 1 镜", "第 2 镜"]);

    await handle("reorder_shot", { row: "2", target: "1", placement: "before" });
    assert.deepEqual(store.rows.map((row) => row.content), ["第 2 镜", "第 1 镜"]);

    const localImage = join(root, "frame.png");
    writeFileSync(localImage, "png");
    const imported = await handle("import_shot_media", { row: "1", filePaths: [localImage], urls: ["https://example.com/broll"] });
    assert.equal(imported.importedCount, 2);
    assert.equal(imported.row.media.length, 2);
    const replaced = await handle("import_shot_media", { row: "1", filePaths: [localImage], mode: "replace" });
    assert.equal(replaced.row.media.length, 1);
    assert.equal(existsSync(join(root, "downloads")) ? store.importedPaths.every((filePath) => !filePath.includes("downloads") || !existsSync(filePath)) : true, true);

    await assert.rejects(handle("import_shot_media", { row: "1", filePaths: ["relative.png"] }), /绝对路径/);
    await assert.rejects(handle("update_shot_cells", { updates: [{ row: "9", cells: [{ field: "note", value: "x" }] }] }), /第 9 个分镜/);

    const replacedBoard = await handle("replace_storyboard", {
      rows: [
        { scene: "A-ROLL", content: "开场", customValues: { generationMethod: "自定义" } },
        { scene: "B-ROLL", content: "空镜", customValues: { "custom-1": "街道" } }
      ]
    });
    assert.equal(replacedBoard.shotCount, 2);
    assert.equal(store.rows[0].customValues["custom-3"], "自定义");
    assert.equal(store.rows[1].customValues["custom-1"], "街道");

    await handle("update_script", { scriptText: "第一段\n\n第二段 <A>" });
    assert.equal(store.scriptHtml, "<p>第一段</p><p>第二段 &lt;A&gt;</p>");
    assert.ok(changes.every(([id]) => id === projectId));
    assert.ok(changes.some(([, tool]) => tool === "import_shot_media"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("stdio MCP server lists tools and forwards calls to the control socket", async () => {
  const root = mkdtempSync(join(tmpdir(), "mkboard-mcp-stdio-"));
  const socketPath = resolveMcpSocketPath(root, "development");
  const tokenFile = join(root, "mcp-token");
  const calls = [];
  const server = await startMcpControlServer({
    socketPath,
    tokenFile,
    handleTool: async (name, args, context) => {
      calls.push({ name, args, context });
      if (name === "delete_shots") throw new Error("找不到第 9 个分镜。");
      return { ok: true };
    }
  });
  try {
    assert.equal(statSync(socketPath).mode & 0o777, 0o600);
    const input = new PassThrough();
    const output = new PassThrough();
    const lines = [];
    output.on("data", (chunk) => lines.push(...chunk.toString().split("\n").filter(Boolean).map((line) => JSON.parse(line))));
    const done = runMkboardMcpServer({ socketPath, tokenFile, client: "codex", version: "9.9.9", input, output, log: () => undefined });
    input.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } })}\n`);
    input.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
    input.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" })}\n`);
    input.write(`${JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "read_project", arguments: { include: ["storyboard"] } } })}\n`);
    input.write(`${JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "delete_shots", arguments: { rows: ["9"] } } })}\n`);
    input.write(`${JSON.stringify({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "not_a_tool" } })}\n`);
    input.end();
    await done;

    const byId = new Map(lines.map((line) => [line.id, line]));
    assert.equal(lines.some((line) => line.id === undefined), false);
    assert.equal(byId.get(1).result.protocolVersion, "2025-06-18");
    assert.equal(byId.get(1).result.serverInfo.version, "9.9.9");
    assert.match(byId.get(1).result.instructions, /project style \(Taste/);
    assert.deepEqual(byId.get(2).result.tools.map((tool) => tool.name), MKBOARD_MCP_TOOLS.map((tool) => tool.name));
    assert.deepEqual(JSON.parse(byId.get(3).result.content[0].text), { ok: true });
    assert.equal(byId.get(4).result.isError, true);
    assert.match(byId.get(4).result.content[0].text, /第 9 个分镜/);
    assert.equal(byId.get(5).error.code, -32602);
    assert.deepEqual(calls[0], { name: "read_project", args: { include: ["storyboard"] }, context: { client: "codex" } });

    // A wrong token is rejected before any tool runs.
    writeFileSync(tokenFile, "wrong-token-wrong-token-wrong-token-000\n");
    const badInput = new PassThrough();
    const badOutput = new PassThrough();
    const badLines = [];
    badOutput.on("data", (chunk) => badLines.push(...chunk.toString().split("\n").filter(Boolean).map((line) => JSON.parse(line))));
    const badDone = runMkboardMcpServer({ socketPath, tokenFile, input: badInput, output: badOutput, log: () => undefined });
    badInput.end(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_projects", arguments: {} } })}\n`);
    await badDone;
    assert.equal(badLines[0].result.isError, true);
    assert.match(badLines[0].result.content[0].text, /令牌无效/);
    assert.equal(calls.length, 2);
  } finally {
    await server.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("stdio MCP server reports a closed app when no launcher path is configured", async () => {
  const root = mkdtempSync(join(tmpdir(), "mkboard-mcp-closed-"));
  try {
    const input = new PassThrough();
    const output = new PassThrough();
    const lines = [];
    output.on("data", (chunk) => lines.push(...chunk.toString().split("\n").filter(Boolean).map((line) => JSON.parse(line))));
    const done = runMkboardMcpServer({ socketPath: join(root, "missing.sock"), tokenFile: join(root, "token"), input, output, log: () => undefined });
    input.end(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_active_project", arguments: {} } })}\n`);
    await done;
    assert.equal(lines[0].result.isError, true);
    assert.match(lines[0].result.content[0].text, /请先打开 MkBoard/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("MCP creates projects through the injected create entry and runs guide / AI split", async () => {
  const root = mkdtempSync(join(tmpdir(), "mkboard-mcp-create-"));
  try {
    const { store } = createFakeStore(root);
    const readLanguages = [];
    const getProject = store.getProject;
    store.getProject = (id, interfaceLanguage) => {
      readLanguages.push(interfaceLanguage);
      return getProject(id);
    };
    const changes = [];
    const opened = [];
    const createCalls = [];
    const parseCalls = [];
    let quotaReached = false;
    let parseStartedBeforeAwait = false;
    const handle = createMcpToolHandler({
      store,
      getActiveView: () => ({ projectId, screen: "workspace", tab: "storyboard", agentCliId: "claude-code", interfaceLanguage: "zh-CN" }),
      openProject: async (id, tab) => opened.push([id, tab]),
      notifyProjectChanged: (id, tool) => changes.push([id, tool]),
      listTemplates: () => [
        { id: "tpl-default", name: "默认模板", description: "", scope: "system", columns: [{ id: "sort", label: "" }, { id: "content", label: "内容" }], storyboardSkillId: "skill-1", storyboardSkillName: "拆分镜 Skill" }
      ],
      createProject: (input) => {
        if (quotaReached) throw new Error("免费版最多保留 1 个项目。");
        createCalls.push(input);
        return store.getProject(projectId);
      },
      runStoryboardParse: async (input) => {
        parseCalls.push(input);
        await Promise.resolve();
        parseStartedBeforeAwait = changes.some(([, tool]) => tool === "split_storyboard_started");
        store.replaceRowsAfterStoryboardParse(projectId, [{ scene: "A-ROLL", content: "AI 拆出的镜头", customValues: {} }]);
        return [];
      },
      downloadsDir: join(root, "downloads")
    });

    const templates = await handle("list_templates", {});
    assert.deepEqual(templates.templates[0].columns, ["内容"]);

    const created = await handle("create_project", { name: " 新项目 ", imageRatio: "9:16", scriptText: "开场白\n\n第二段" });
    assert.deepEqual(createCalls, [{ name: "新项目", templateId: "", imageRatio: "9:16", interfaceLanguage: "zh-CN" }]);
    assert.equal(store.scriptHtml, "<p>开场白</p><p>第二段</p>");
    assert.deepEqual(opened, [[projectId, "script"]]);
    assert.equal(created.opened, true);
    assert.ok(changes.some(([, tool]) => tool === "create_project"));

    await handle("create_project", { name: "不打开", imageRatio: "bogus", open: false });
    assert.equal(createCalls[1].imageRatio, "16:9");
    assert.equal(opened.length, 1);

    quotaReached = true;
    await assert.rejects(handle("create_project", { name: "超额" }), /免费版最多/);
    await assert.rejects(handle("create_project", {}), /name/);

    readLanguages.length = 0;
    const guide = await handle("get_storyboard_guide", {});
    assert.ok(readLanguages.includes("zh-CN"), "guide reads the localized 拆分镜 skill");
    assert.match(guide.storyboardSkill.content, /拆分镜规则/);
    assert.equal(guide.styleGuidance, EXTERNAL_STYLE_GUIDANCE);
    assert.doesNotMatch(JSON.stringify(guide), /测试 Taste|taste-content-secret/);
    assert.ok(guide.generationRules.some((rule) => /BGM/.test(rule)));
    assert.equal(guide.columns.find((column) => column.id === "custom-2").semantic, "videoPrompt");

    const split = await handle("split_storyboard", { instructions: " 每镜不超过 12 秒 " });
    assert.deepEqual(parseCalls, [{ projectId, agentCliId: "claude-code", instructions: "每镜不超过 12 秒", interfaceLanguage: "zh-CN" }]);
    assert.equal(parseStartedBeforeAwait, true);
    assert.equal(split.agent, "claude-code");
    assert.equal(split.shotCount, 1);
    assert.equal(split.rows[0].content, "AI 拆出的镜头");
    assert.equal(changes.at(-1)[1], "split_storyboard");

    await handle("split_storyboard", { agent: "codex" });
    assert.equal(parseCalls[1].agentCliId, "codex");

    await handle("update_script", { scriptHtml: "<p> </p>" });
    await assert.rejects(handle("split_storyboard", {}), /脚本为空/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("MCP project tools report unsupported hosts clearly", async () => {
  const root = mkdtempSync(join(tmpdir(), "mkboard-mcp-legacy-"));
  try {
    const { store } = createFakeStore(root);
    const handle = createMcpToolHandler({
      store,
      getActiveView: () => ({ projectId }),
      openProject: async () => undefined,
      notifyProjectChanged: () => undefined,
      downloadsDir: join(root, "downloads")
    });
    await assert.rejects(handle("create_project", { name: "x" }), /不支持/);
    await assert.rejects(handle("split_storyboard", {}), /不支持/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("MCP manages project lifecycle, settings, columns, assets and export", async () => {
  const root = mkdtempSync(join(tmpdir(), "mkboard-mcp-projects-"));
  try {
    const { store } = createFakeStore(root);
    const changes = [];
    let cloudCleanup = 0;
    const handle = createMcpToolHandler({
      store,
      getActiveView: () => ({ projectId, screen: "workspace", tab: "storyboard", interfaceLanguage: "zh-CN" }),
      openProject: async () => undefined,
      notifyProjectChanged: (id, tool) => changes.push([id, tool]),
      listSkills: () => [{ id: "skill-1", name: "拆分镜 Skill", description: "", scope: "system", content: "secret-skill" }],
      listTastes: () => [{ id: "taste-1", name: "测试 Taste", description: "", scope: "system", content: "taste-content-secret" }],
      afterProjectDeleted: async () => {
        cloudCleanup += 1;
      },
      downloadsDir: join(root, "downloads")
    });

    // Lists: active by default, archived / trash / all on request; tutorial projects never show up.
    assert.deepEqual((await handle("list_projects", {})).projects.map((item) => item.id), [projectId]);
    const all = await handle("list_projects", { status: "all" });
    assert.deepEqual(all.projects.map((item) => [item.id, item.status]), [[projectId, "active"], ["project-2", "archived"]]);
    assert.equal(all.projects[1].imageRatio, "9:16");

    // Settings.
    const renamed = await handle("update_project", { name: " 新名字 ", imageRatio: "9:16", storyboardSkillId: "skill-1", tasteId: "taste-1" });
    assert.equal(renamed.project.name, "新名字");
    assert.equal(renamed.project.imageRatio, "9:16");
    assert.deepEqual(store.lifecycle[0], ["update", { id: projectId, name: "新名字", interfaceLanguage: "zh-CN", imageRatio: "9:16", storyboardSkillId: "skill-1", tasteId: "taste-1" }]);
    assert.doesNotMatch(JSON.stringify(renamed), /taste-content-secret/);
    await assert.rejects(handle("update_project", { imageRatio: "1:1" }), /imageRatio/);
    await assert.rejects(handle("update_project", { storyboardSkillId: "nope" }), /list_skills/);
    await assert.rejects(handle("update_project", {}), /至少/);
    assert.doesNotMatch(JSON.stringify(await handle("list_tastes", {})), /taste-content-secret/);
    assert.doesNotMatch(JSON.stringify(await handle("list_skills", {})), /secret-skill/);

    // Archive / unarchive; archived projects are not editable until restored.
    assert.equal((await handle("archive_project", { projectId })).project.status, "archived");
    await assert.rejects(handle("read_project", { projectId }), /已归档.*unarchive_project/);
    await assert.rejects(handle("archive_project", { projectId }), /不能归档/);
    assert.equal((await handle("unarchive_project", { projectId })).project.status, "active");
    await assert.rejects(handle("archive_project", {}), /projectId/);

    // Delete = move to trash; restore; permanent delete only from the trash.
    assert.equal((await handle("delete_project", { projectId })).project.status, "trash");
    await assert.rejects(handle("delete_project", { projectId }), /已经在回收站/);
    assert.equal((await handle("restore_project", { projectId })).project.status, "active");
    await assert.rejects(handle("delete_project_permanently", { projectId }), /先用 delete_project/);
    await handle("delete_project", { projectId: "project-2" });
    const purged = await handle("delete_project_permanently", { projectId: "project-2" });
    assert.equal(purged.deleted, true);
    assert.equal(cloudCleanup, 1);
    assert.deepEqual(store.lifecycle.at(-1), ["deleted", "project-2"]);
    assert.deepEqual((await handle("list_projects", { status: "all" })).projects.map((item) => item.id), [projectId]);
    await assert.rejects(handle("delete_project", { projectId: "tutorial" }), /找不到项目/);
    for (const tool of ["update_project", "archive_project", "unarchive_project", "delete_project", "restore_project", "delete_project_permanently"]) {
      assert.ok(changes.some(([, changed]) => changed === tool), `${tool} notifies the window`);
    }

    // Columns: add / rename / hide / retype / remove / reorder, locked 镜号 stays put.
    const added = await handle("update_columns", { add: [{ label: "镜头运动" }, { label: "时长备注", type: "number" }] });
    assert.deepEqual(added.columns.slice(-2).map((column) => [column.id, column.label, column.type]), [["custom-4", "镜头运动", "text"], ["custom-5", "时长备注", "number"]]);
    await handle("update_columns", { update: [{ column: "备注", label: "画面备注" }, { column: "custom-2", visible: false }, { column: "镜头运动", type: "select" }] });
    assert.equal(store.columns.find((column) => column.id === "note").label, "画面备注");
    assert.equal(store.columns.find((column) => column.id === "custom-2").visible, false);
    assert.equal(store.columns.find((column) => column.id === "custom-4").type, "select");
    await handle("update_columns", { remove: ["时长备注"], order: ["内容", "画面"] });
    assert.deepEqual(store.columns.map((column) => column.id), ["shot", "content", "image", "scene", "custom-3", "note", "custom-1", "custom-2", "custom-4"]);
    await assert.rejects(handle("update_columns", { remove: ["镜号"] }), /锁定列/);
    await assert.rejects(handle("update_columns", { update: [{ column: "content", type: "number" }] }), /自定义列/);
    await assert.rejects(handle("update_columns", { update: [{ column: "不存在" , label: "x" }] }), /找不到列/);
    await assert.rejects(handle("update_columns", {}), /add、update/);

    // Asset library.
    const reference = join(root, "ref.png");
    writeFileSync(reference, "reference");
    const imported = await handle("import_assets", { filePaths: [reference] });
    const assetId = imported.assets[0].assetId;
    assert.equal((await handle("rename_asset", { assetId, name: "角色参考" })).asset.name, "角色参考.png");
    const replacement = join(root, "ref-v2.png");
    writeFileSync(replacement, "reference v2");
    assert.equal((await handle("replace_asset", { assetId, filePath: replacement })).asset.name, "ref-v2.png");
    await assert.rejects(handle("replace_asset", { assetId, filePath: "ref.png" }), /绝对路径/);
    await assert.rejects(handle("rename_asset", { assetId: "missing", name: "x" }), /找不到素材/);
    await assert.rejects(handle("delete_assets", { assetIds: [assetId, "missing"] }), /missing/);
    assert.equal((await handle("delete_assets", { assetIds: [assetId] })).remainingAssetCount, 0);

    // Export to a folder outside the project.
    const exportDir = join(root, "exports");
    mkdirSync(exportDir);
    const exported = await handle("export_project", { kind: "storyboard-csv", outputPath: exportDir });
    assert.equal(exported.filePath, join(exportDir, "新名字-storyboard.csv"));
    assert.match(readFileSync(exported.filePath, "utf8"), /第 1 镜/);
    await assert.rejects(handle("export_project", { kind: "storyboard-csv", outputPath: exportDir }), /overwrite/);
    assert.equal((await handle("export_project", { kind: "storyboard-csv", outputPath: join(exportDir, "board"), overwrite: true })).filePath, join(exportDir, "board.csv"));
    await assert.rejects(handle("export_project", { kind: "pdf", outputPath: exportDir }), /kind/);
    await assert.rejects(handle("export_project", { kind: "storyboard-csv", outputPath: "out.csv" }), /绝对路径/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("MCP voiceover uses the MkBoard voice, saves MP3s to the asset library and reuses identical audio", async () => {
  const root = mkdtempSync(join(tmpdir(), "mkboard-mcp-voice-"));
  try {
    const { store } = createFakeStore(root);
    await store.updateScript(projectId, "<p>第一句。</p><p>第二句！</p>");
    const calls = [];
    let speechError = null;
    let configured = true;
    let defaultVoice = "voice-default";
    const handle = createMcpToolHandler({
      store,
      getActiveView: () => ({ projectId, interfaceLanguage: "zh-CN", speechVoiceId: defaultVoice }),
      openProject: async () => undefined,
      notifyProjectChanged: () => undefined,
      speech: {
        getStatus: async () => ({ configured, maskedKey: configured ? "sk_***" : null, updatedAt: null }),
        listVoices: async () => ({ ok: true, voices: [{ voiceId: "voice-default", name: "Ava", category: "premade", isPersonal: false, gender: "female", language: "zh", accent: null, description: null, useCase: null, previewUrl: "https://x" }] }),
        synthesize: async ({ text, voiceId }) => {
          calls.push([voiceId, text]);
          if (speechError) return { ok: false, error: speechError };
          return { ok: true, cached: calls.length > 2, audio: Buffer.from(`${voiceId}:${text}`) };
        }
      },
      downloadsDir: join(root, "downloads")
    });

    const voices = await handle("list_voices", {});
    assert.equal(voices.defaultVoiceId, "voice-default");
    assert.equal(voices.voices[0].name, "Ava");
    assert.equal("previewUrl" in voices.voices[0], false);

    const script = await handle("generate_voiceover", {});
    assert.equal(script.source, "script");
    // Same text and segmentation as the in-app 配音 player, so both share ElevenLabs' cache.
    assert.deepEqual(calls, [["voice-default", "第一句。 第二句！"]]);
    assert.equal(script.outputs[0].asset.name, "配音-脚本.mp3");
    assert.equal(script.outputs[0].asset.kind, "audio");
    assert.equal(readFileSync(script.outputs[0].asset.localPath, "utf8"), "voice-default:第一句。 第二句！");
    assert.equal(existsSync(join(root, "downloads")) ? readdirEmpty(join(root, "downloads")) : true, true);

    const again = await handle("generate_voiceover", { source: "script" });
    assert.equal(again.outputs[0].asset.assetId, script.outputs[0].asset.assetId, "identical audio reuses the existing asset");

    const shots = await handle("generate_voiceover", { rows: ["2"], voiceId: "voice-b" });
    assert.equal(shots.source, "shots");
    assert.deepEqual(shots.outputs.map((output) => [output.row.index, output.asset.name]), [[2, "配音-镜头02.mp3"]]);
    assert.deepEqual(calls.at(-1), ["voice-b", "第 2 镜"]);

    const custom = await handle("generate_voiceover", { source: "text", text: "片尾口播", fileName: "片尾.mp3" });
    assert.equal(custom.outputs[0].asset.name, "片尾.mp3");

    await assert.rejects(handle("generate_voiceover", { source: "text" }), /text/);
    speechError = "not_configured";
    await assert.rejects(handle("generate_voiceover", { source: "text", text: "新的一句" }), /ElevenLabs API Key/);
    speechError = null;
    defaultVoice = "";
    await assert.rejects(handle("generate_voiceover", {}), /voiceId/);
    configured = false;
    assert.equal((await handle("list_voices", {})).configured, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("joined voiceover MP3 keeps one leading ID3 tag", () => {
  const id3 = Buffer.concat([Buffer.from("ID3"), Buffer.from([4, 0, 0, 0, 0, 0, 4]), Buffer.from("meta")]);
  const first = Buffer.concat([id3, Buffer.from("AAAA")]);
  const second = Buffer.concat([id3, Buffer.from("BBBB")]);
  assert.equal(joinMp3Chunks([first, second]).toString("latin1"), `${first.toString("latin1")}BBBB`);
  assert.equal(joinMp3Chunks([first]), first);
});

test("MCP runs MkBoard image and video generation with dry runs, credit checks and status", async () => {
  const root = mkdtempSync(join(tmpdir(), "mkboard-mcp-generation-"));
  try {
    const { store } = createFakeStore(root);
    const changes = [];
    const calls = { images: [], syncs: 0, videos: [], cancelled: 0 };
    let account = { ok: true, signedIn: true, creditsAvailable: 2000, isPaid: true, canUseImages: true, canUseSeedance: true, canUseHyperframes: true };
    let videoTasks = [];
    let videoRun = null;
    const generation = {
      getAccount: async () => account,
      submitImages: async (input) => {
        calls.images.push(input);
        return {
          ok: true,
          data: {
            batchId: "batch-1",
            cloudProjectId: "cloud-1",
            targetCount: input.items.length,
            creditsRequired: input.items.length * 8,
            creditsReserved: input.items.length * 8,
            submittedCount: input.items.length,
            failedCount: 0,
            tasks: input.items.map((item) => ({ taskId: `task-${item.rowId}`, rowId: item.rowId, status: "running", creditsReserved: 8 }))
          }
        };
      },
      syncImageBatch: async () => {
        calls.syncs += 1;
        const done = calls.syncs > 1;
        const items = calls.images.at(-1).items;
        return {
          ok: true,
          data: {
            rows: [],
            assets: [],
            batchId: "batch-1",
            importedCount: done ? items.length : 0,
            localAvailableCount: done ? items.length : 0,
            localImportFailedCount: 0,
            pendingCount: done ? 0 : items.length,
            failedCount: 0,
            succeededCount: done ? items.length : 0,
            tasks: items.map((item) => ({ taskId: `task-${item.rowId}`, rowId: item.rowId, status: done ? "succeeded" : "running", creditsReserved: 8 }))
          }
        };
      },
      syncActiveImages: async () => ({
        ok: true,
        data: { rows: [], assets: [], batchId: "active", importedCount: 1, localAvailableCount: 1, localImportFailedCount: 0, pendingCount: 0, failedCount: 0, succeededCount: 1, tasks: [] }
      }),
      runVideos: (input) => {
        calls.videos.push(input);
        return videoRun ?? Promise.resolve({ rows: [], assets: [], submittedCount: input.items.length, succeededCount: input.items.length, failedCount: 0, tasks: input.items.map((item) => ({ rowId: item.rowId, method: item.method, status: "succeeded" })) });
      },
      getVideoState: async () => ({ rowIds: videoTasks.filter((task) => task.status === "running").map((task) => task.rowId), tasks: videoTasks }),
      cancelVideos: () => {
        calls.cancelled += 1;
        return true;
      }
    };
    const handle = createMcpToolHandler({
      store,
      getActiveView: () => ({ projectId, interfaceLanguage: "zh-CN", agentCliId: "claude-code", seedanceResolution: "1080p", hyperframesConcurrency: 3 }),
      openProject: async () => undefined,
      notifyProjectChanged: (id, tool) => changes.push([id, tool]),
      generation,
      sleep: async () => undefined,
      downloadsDir: join(root, "downloads")
    });

    await handle("replace_storyboard", {
      rows: [
        { scene: "A-ROLL", content: "开场口播" },
        { scene: "B-ROLL", content: "城市", customValues: { 生成方式: "ChatGPT Image2", 图像提示词: "城市夜景" } },
        { scene: "B-ROLL", content: "推进", duration: "12", customValues: { 生成方式: "Seedance 2.0", 图像提示词: "街道", 视频提示词: "镜头缓慢推进" } },
        { scene: "B-ROLL", content: "图表", customValues: { 生成方式: "Hyperframes", 视频提示词: "柱状图逐根生长" } },
        { scene: "B-ROLL", content: "空镜", customValues: { 生成方式: "ChatGPT Image2" } }
      ]
    });
    const rowId = (index) => store.rows[index - 1].id;

    // Images: plan, credits, Seedance four-panel prompt, polling until imported.
    const imagePlan = await handle("generate_shot_images", { dryRun: true });
    assert.deepEqual(imagePlan.shots, [2, 3]);
    assert.equal(imagePlan.estimatedCredits, 16);
    assert.deepEqual(imagePlan.skipped.missingPrompt, [5]);
    assert.equal(calls.images.length, 0);

    account = { ...account, creditsAvailable: 10 };
    await assert.rejects(handle("generate_shot_images", {}), /积分不足.*16.*10/);
    account = { ...account, signedIn: false, creditsAvailable: 2000 };
    await assert.rejects(handle("generate_shot_images", {}), /登录/);
    account = { ...account, signedIn: true };

    const images = await handle("generate_shot_images", {});
    assert.equal(calls.images[0].overwriteExisting, false);
    assert.deepEqual(calls.images[0].items.map((item) => item.rowId), [rowId(2), rowId(3)]);
    assert.equal(calls.images[0].items[0].prompt, "城市夜景");
    assert.match(calls.images[0].items[1].prompt, /2x2 四宫格/);
    assert.equal(images.finished, true);
    assert.equal(images.succeededCount, 2);
    assert.equal(calls.syncs, 2);
    assert.deepEqual(images.shots.map((shot) => [shot.shot, shot.status]), [[2, "succeeded"], [3, "succeeded"]]);
    assert.ok(changes.some(([, tool]) => tool === "generation_started"));
    assert.ok(changes.some(([, tool]) => tool === "generate_shot_images"));
    await assert.rejects(handle("generate_shot_images", { rows: ["1"] }), /没有可生成图片/);
    await assert.rejects(handle("generate_shot_images", { rows: ["5"] }), /第 5 镜还没有图像提示词/);

    // Videos: settings from the window, Seedance credits, finished run.
    const videoPlan = await handle("generate_shot_videos", { dryRun: true });
    assert.deepEqual(
      videoPlan.shots.map((shot) => [shot.shot, shot.method, shot.durationSec, shot.resolution]),
      [[3, "Seedance 2.0", 12, "1080p"], [4, "Hyperframes", 10, "1080p"]]
    );
    assert.equal(videoPlan.estimatedCredits, 1200);
    assert.equal((await handle("generate_shot_videos", { dryRun: true, seedanceResolution: "720p" })).estimatedCredits, 600);
    assert.equal((await handle("generate_shot_videos", { dryRun: true, method: "hyperframes" })).estimatedCredits, 0);
    await assert.rejects(handle("generate_shot_videos", { seedanceResolution: "4k" }), /seedanceResolution/);

    const videos = await handle("generate_shot_videos", { seedanceAspectRatio: "9:16" });
    assert.equal(videos.finished, true);
    assert.equal(calls.videos[0].agentCliId, "claude-code");
    assert.equal(calls.videos[0].hyperframesConcurrency, 3);
    assert.equal(calls.videos[0].items.find((item) => item.method === "Seedance 2.0").aspectRatio, "9:16");
    assert.equal(calls.videos[0].items.find((item) => item.method === "Hyperframes").aspectRatio, "16:9");
    assert.deepEqual(videos.shots.map((shot) => [shot.shot, shot.status]), [[3, "succeeded"], [4, "succeeded"]]);

    // A run that outlasts waitSeconds keeps going; status and the running guard see it.
    videoRun = new Promise(() => undefined);
    videoTasks = [{ rowId: rowId(3), method: "Seedance 2.0", status: "running", stageLabel: "云端生成中" }];
    await assert.rejects(handle("generate_shot_videos", { rows: ["3"] }), /第 3 镜已经在生成视频/);
    const pending = await handle("generate_shot_videos", { rows: ["4"], waitSeconds: 0 });
    assert.equal(pending.finished, false);
    assert.match(pending.hint, /get_generation_status/);

    const status = await handle("get_generation_status", {});
    assert.equal(status.images.importedCount, 1);
    assert.equal(status.videos.runningCount, 1);
    assert.deepEqual(status.videos.shots[0], { shot: 3, rowId: rowId(3), method: "Seedance 2.0", status: "running", stage: "云端生成中" });

    assert.equal((await handle("cancel_video_generation", {})).cancelled, true);
    assert.equal(calls.cancelled, 1);

    const credits = await handle("get_credits", {});
    assert.equal(credits.creditsAvailable, 2000);
    assert.equal(credits.pricing.seedancePerSecond["1080p"], 100);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("MCP generation tools report unsupported hosts clearly", async () => {
  const root = mkdtempSync(join(tmpdir(), "mkboard-mcp-generation-legacy-"));
  try {
    const { store } = createFakeStore(root);
    const handle = createMcpToolHandler({
      store,
      getActiveView: () => ({ projectId }),
      openProject: async () => undefined,
      notifyProjectChanged: () => undefined,
      downloadsDir: join(root, "downloads")
    });
    for (const tool of ["get_credits", "generate_shot_images", "generate_shot_videos", "get_generation_status", "cancel_video_generation"]) {
      await assert.rejects(handle(tool, {}), /不支持/);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function readdirEmpty(directory) {
  return readdirSync(directory).length === 0;
}

function createFakeStore(root) {
  const columns = [
    { id: "shot", label: "镜号", type: "text", visible: true, locked: true },
    { id: "image", label: "画面", type: "image", visible: true },
    { id: "scene", label: "类别", type: "select", visible: true },
    { id: "custom-3", label: "生成方式", type: "select", visible: true, custom: true },
    { id: "content", label: "内容", type: "text", visible: true },
    { id: "note", label: "备注", type: "text", visible: true },
    { id: "custom-1", label: "图像提示词", type: "text", visible: true, custom: true },
    { id: "custom-2", label: "视频提示词", type: "text", visible: true, custom: true }
  ];
  let nextRowId = 1;
  let nextAssetId = 1;
  const assets = [];
  const importedPaths = [];
  const createRow = (fields = {}) => ({
    id: `row-${nextRowId++}`,
    shot: "",
    scene: "",
    duration: "0",
    content: "",
    note: "",
    imageAssetIds: [],
    imageAssetId: null,
    customValues: {},
    ...fields
  });
  const clone = (row) => ({ ...row, imageAssetIds: [...row.imageAssetIds], customValues: { ...row.customValues } });
  const state = {
    scriptHtml: "<p>脚本</p>",
    rows: [createRow({ scene: "A-ROLL", content: "第 1 镜" }), createRow({ scene: "B-ROLL", content: "第 2 镜" })]
  };
  const resequence = () => state.rows.forEach((row, index) => (row.shot = String(index + 1)));
  const listRows = () => state.rows.map(clone);
  const mediaUpdate = () => ({ rows: listRows(), assets: [...assets] });
  const project = { id: projectId, kind: "user", name: "测试项目", imageRatio: "16:9", localPath: join(root, "project"), updatedAt: "2026-09-24T00:00:00.000Z" };
  const projects = [
    project,
    { id: "project-2", kind: "user", name: "旧项目", imageRatio: "9:16", localPath: join(root, "project-2"), updatedAt: "2026-09-01T00:00:00.000Z", archivedAt: "2026-09-02T00:00:00.000Z" },
    { id: "tutorial", kind: "tutorial", name: "教程", imageRatio: "16:9", localPath: join(root, "tutorial"), updatedAt: "2026-09-01T00:00:00.000Z" }
  ];
  const lifecycle = [];
  const findProject = (id) => {
    const found = projects.find((item) => item.id === id);
    if (!found) throw new Error(`no project ${id}`);
    return found;
  };
  const activeProjects = () => projects.filter((item) => !item.archivedAt && !item.deletedAt);
  let columnState = columns.map((column) => ({ ...column }));
  mkdirSync(join(root, "project", "assets"), { recursive: true });
  resequence();

  const store = {
    get rows() {
      return state.rows;
    },
    get scriptHtml() {
      return state.scriptHtml;
    },
    importedPaths,
    lifecycle,
    get columns() {
      return columnState;
    },
    listProjects: () => activeProjects(),
    listArchivedProjects: () => projects.filter((item) => item.archivedAt && !item.deletedAt),
    listDeletedProjects: () => projects.filter((item) => item.deletedAt),
    updateProject: (input) => {
      const target = findProject(input.id);
      lifecycle.push(["update", input]);
      target.name = input.name;
      if (input.imageRatio) target.imageRatio = input.imageRatio;
      return activeProjects();
    },
    archiveProject: (id) => {
      findProject(id).archivedAt = "2026-11-07T00:00:00.000Z";
      return activeProjects();
    },
    unarchiveProject: (id) => {
      findProject(id).archivedAt = null;
      return projects.filter((item) => item.archivedAt);
    },
    trashProject: (id) => {
      findProject(id).deletedAt = "2026-11-07T00:00:00.000Z";
      return activeProjects();
    },
    restoreProject: (id) => {
      findProject(id).deletedAt = null;
      return projects.filter((item) => item.deletedAt);
    },
    deleteProject: (id) => {
      if (!findProject(id).deletedAt) throw new Error("请先将项目移入回收站，再永久删除。");
      projects.splice(projects.findIndex((item) => item.id === id), 1);
      lifecycle.push(["deleted", id]);
      return projects.filter((item) => item.deletedAt);
    },
    saveColumns: (_id, nextColumns) => {
      columnState = nextColumns.map((column) => ({ ...column }));
    },
    renameAsset: (_id, assetId, name) => {
      const asset = assets.find((item) => item.id === assetId);
      asset.name = /\.[a-z0-9]+$/i.test(name) ? name : `${name}${asset.name.slice(asset.name.lastIndexOf("."))}`;
      return mediaUpdate();
    },
    replaceAssetPath: async (_id, assetId, sourcePath) => {
      const asset = assets.find((item) => item.id === assetId);
      asset.name = sourcePath.split("/").pop();
      asset.localPath = sourcePath;
      return mediaUpdate();
    },
    deleteAssets: (_id, assetIds) => {
      for (const assetId of assetIds) assets.splice(assets.findIndex((item) => item.id === assetId), 1);
      state.rows.forEach((row) => (row.imageAssetIds = row.imageAssetIds.filter((assetId) => !assetIds.includes(assetId))));
      return mediaUpdate();
    },
    getAssetFilePath: (_id, assetId) => assets.find((item) => item.id === assetId)?.localPath ?? null,
    getProject: (id = projectId) => ({
      project: projects.find((item) => item.id === id) ?? project,
      scriptHtml: state.scriptHtml,
      rows: listRows(),
      columns: columnState.map((column) => ({ ...column })),
      imageRatio: (projects.find((item) => item.id === id) ?? project).imageRatio,
      assets: [...assets],
      storyboardSkill: { id: "skill-1", name: "拆分镜 Skill", description: "按口播拆 A/B-ROLL", content: "# 拆分镜规则\n每段口播一个 A-ROLL。" },
      taste: { id: "taste-1", name: "测试 Taste", content: "taste-content-secret" },
      agentConversations: [],
      activeAgentConversationId: "c-1",
      agentMessages: []
    }),
    updateScript: (_id, html) => {
      state.scriptHtml = html;
    },
    updateShot: (_id, input) => {
      const row = state.rows.find((item) => item.id === input.id);
      if (["scene", "duration", "content", "note"].includes(input.field)) row[input.field] = input.value;
      else row.customValues[input.field] = input.value;
      return listRows();
    },
    updateShotMedia: (_id, rowId, assetIds) => {
      const row = state.rows.find((item) => item.id === rowId);
      row.imageAssetIds = assetIds.filter((assetId) => assets.some((asset) => asset.id === assetId)).slice(0, 10);
      row.imageAssetId = row.imageAssetIds[0] ?? null;
      return mediaUpdate();
    },
    createShots: (_id, count) => {
      for (let index = 0; index < Math.min(20, count); index += 1) state.rows.push(createRow());
      resequence();
      return listRows();
    },
    insertShot: (_id, targetRowId, placement) => {
      const index = state.rows.findIndex((row) => row.id === targetRowId);
      state.rows.splice(placement === "before" ? index : index + 1, 0, createRow());
      resequence();
      return listRows();
    },
    deleteShots: (_id, rowIds) => {
      state.rows = state.rows.filter((row) => !rowIds.includes(row.id));
      resequence();
      return listRows();
    },
    duplicateShots: () => listRows(),
    replaceRows: (_id, rows) => {
      state.rows = rows.map((row) => clone(state.rows.find((item) => item.id === row.id) ?? row));
      resequence();
    },
    replaceRowsAfterStoryboardParse: (_id, rows) => {
      state.rows = rows.map((row) => createRow({ scene: row.scene, duration: row.duration, content: row.content, note: row.note, customValues: { ...row.customValues } }));
      resequence();
    },
    importShotMediaPaths: async (_id, rowId, filePaths) => {
      const row = state.rows.find((item) => item.id === rowId);
      for (const filePath of filePaths) {
        assert.ok(existsSync(filePath), `import source should exist: ${filePath}`);
        importedPaths.push(filePath);
        const asset = { id: `asset-${nextAssetId++}`, name: filePath.split("/").pop(), kind: "image", sizeLabel: "1 KB", localPath: filePath, linkedShot: row.shot };
        assets.push(asset);
        row.imageAssetIds.push(asset.id);
      }
      row.imageAssetId = row.imageAssetIds[0] ?? null;
      return mediaUpdate();
    },
    importAssetPaths: async (_id, filePaths) => {
      for (const filePath of filePaths) {
        const content = readFileSync(filePath);
        if (assets.some((asset) => existsSync(asset.localPath) && readFileSync(asset.localPath).equals(content))) continue;
        const name = filePath.split("/").pop();
        const destination = join(root, "project", "assets", name);
        writeFileSync(destination, content);
        const kind = name.endsWith(".mp3") ? "audio" : name.endsWith(".png") ? "image" : "document";
        assets.push({ id: `asset-${nextAssetId++}`, name, kind, sizeLabel: "1 KB", localPath: destination, linkedShot: "" });
      }
      return [...assets];
    }
  };
  return { store };
}
