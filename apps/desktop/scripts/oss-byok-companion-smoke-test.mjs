import { MkboardStore } from "../src/main/database.ts";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ByokStore } from "../src/main/byok-store.ts";
import { LocalAiMediaService } from "../src/main/local-ai-media.ts";
import { renderQrSvg } from "../src/main/qr-svg.ts";
import { loadCliAgentDefinitions } from "../src/main/agent-registry.ts";
import { CompanionServer } from "../src/main/companion-server.ts";

test("ByokStore persists keys locally, masks previews, honors env overrides, and prevents blank-key wipes", () => {
  const dir = mkdtempSync(join(tmpdir(), "mkboard-byok-"));
  const prevOpenAi = process.env.OPENAI_API_KEY;
  try {
    delete process.env.OPENAI_API_KEY;
    const store = new ByokStore(dir);

    let snap = store.saveProvider({ providerId: "kie", apiKey: "kie_live_secret_1234567890" });
    const kie = snap.providers.find((p) => p.id === "kie");
    assert.ok(kie?.configured);
    assert.equal(kie?.source, "stored");
    assert.ok(kie?.maskedKey && !kie.maskedKey.includes("secret_123456"));

    // Blank apiKey update (e.g. changing baseUrl only) must NOT wipe stored key
    snap = store.saveProvider({ providerId: "kie", apiKey: "   ", baseUrl: "https://api.kie.ai" });
    assert.equal(store.resolveCredentials("kie").apiKey, "kie_live_secret_1234567890");

    // Environment variable overrides stored setting without mutating disk
    process.env.OPENAI_API_KEY = "sk-env-override-987654321";
    const envSnap = store.getSnapshot();
    const openai = envSnap.providers.find((p) => p.id === "openai");
    assert.equal(openai?.source, "env");
    assert.equal(store.resolveCredentials("openai").apiKey, "sk-env-override-987654321");

    // Explicit clear removes stored key
    snap = store.clearProviderKey("kie");
    assert.equal(snap.providers.find((p) => p.id === "kie")?.configured, false);
  } finally {
    if (prevOpenAi === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prevOpenAi;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("LocalAiMediaService generates offline zero-key stub storyboard images without any backend", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mkboard-local-media-"));
  try {
    const byok = new ByokStore(dir);
    byok.setActiveProviders({ activeImageProvider: "stub" });
    const media = new LocalAiMediaService(dir, byok);

    const res = await media.generateStoryboardImages("proj-1", {
      overwriteExisting: true,
      items: [
        { rowId: "row-1", prompt: "Wide establishing shot of a neon workstation", aspectRatio: "16:9" },
        { rowId: "row-2", prompt: "Close-up of storyboard frames", aspectRatio: "16:9" }
      ]
    });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.submittedCount, 2);
      assert.equal(res.data.tasks.length, 2);
      assert.equal(res.data.tasks[0].status, "succeeded");
      assert.ok(res.data.tasks[0].resultUrl?.endsWith(".png"));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("renderQrSvg produces standalone SVG markup and loadCliAgentDefinitions merges custom agents.local.json", () => {
  const svg = renderQrSvg("http://192.168.1.10:4318/#token=test123456");
  assert.ok(svg.startsWith("<svg") && svg.endsWith("</svg>"));
  assert.match(svg, /viewBox=/u);

  const fakeHome = mkdtempSync(join(tmpdir(), "mkboard-agent-home-"));
  const prevAgentsCfg = process.env.MKBOARD_AGENTS_CONFIG;
  try {
    const cfgPath = join(fakeHome, "agents.local.json");
    writeFileSync(
      cfgPath,
      JSON.stringify({
        agents: [
          {
            id: "custom:aider",
            name: "Aider Local",
            command: "aider"
          }
        ]
      })
    );
    process.env.MKBOARD_AGENTS_CONFIG = cfgPath;
    const defs = loadCliAgentDefinitions();
    const ids = defs.map((d) => d.id);
    for (const builtin of ["codex", "claude-code", "gemini-cli", "opencode", "cursor-agent", "kimi-cli", "custom:aider"]) {
      assert.ok(ids.includes(builtin), `missing agent ${builtin}`);
    }
  } finally {
    if (prevAgentsCfg === undefined) delete process.env.MKBOARD_AGENTS_CONFIG;
    else process.env.MKBOARD_AGENTS_CONFIG = prevAgentsCfg;
    rmSync(fakeHome, { recursive: true, force: true });
  }
});

test("CompanionServer pairs via token, enforces auth on /api/rpc/:method, serves Streamable HTTP /mcp, and rotates tokens", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mkboard-companion-"));
  const rendererDir = join(dir, "renderer");
  mkdirSync(rendererDir, { recursive: true });
  writeFileSync(join(rendererDir, "index.html"), "<!doctype html><title>MkBoard Web Companion</title>");

  const companion = new CompanionServer({
    dataDir: dir,
    rendererDistDir: rendererDir,
    resolveAssetPath: () => null,
    dispatchRpc: async (method) => {
      if (method === "listProjects") return [{ id: "p1", name: "Open Source Demo" }];
      throw new Error(`Unexpected RPC: ${method}`);
    },
    handleMcpRequest: async (msg) => ({
      jsonrpc: "2.0",
      id: msg.id ?? 1,
      result: { tools: [{ name: "list_projects" }] }
    }),
    defaultPort: 19418
  });

  try {
    const status = await companion.setMode("network-accessible");
    assert.equal(status.running, true);
    assert.ok(status.port > 0);
    assert.ok(status.qrSvg?.startsWith("<svg"));
    const pairEndpoint = status.endpoints[0];
    assert.ok(pairEndpoint);
    const token = pairEndpoint.pairingUrl.split("#token=")[1];
    assert.ok(token && token.length >= 16);
    const baseUrl = `http://127.0.0.1:${status.port}`;

    // Unauthenticated RPC in network-accessible mode must be rejected with 401
    const unauth = await fetch(`${baseUrl}/api/rpc/listProjects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ args: [] })
    });
    assert.equal(unauth.status, 401);

    // Authenticated RPC succeeds
    const authRpc = await fetch(`${baseUrl}/api/rpc/listProjects`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ args: [] })
    });
    assert.equal(authRpc.status, 200);
    const rpcBody = await authRpc.json();
    assert.deepEqual(rpcBody, { ok: true, result: [{ id: "p1", name: "Open Source Demo" }] });

    // Streamable HTTP /mcp succeeds
    const mcpRes = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/list" })
    });
    assert.equal(mcpRes.status, 200);
    const mcpBody = await mcpRes.json();
    assert.equal(mcpBody.result.tools[0].name, "list_projects");

    // Token rotation invalidates previous token
    await companion.rotateToken();
    const oldTokenAttempt = await fetch(`${baseUrl}/api/rpc/listProjects`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ args: [] })
    });
    assert.equal(oldTokenAttempt.status, 401);
  } finally {
    await companion.stop();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ProjectSummary coverPreview uses first B-Roll storyboard image and upgrades to video first frame when video exists", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mkboard-cover-preview-"));
  try {
    const store = new MkboardStore(join(dir, "mkboard.sqlite"), join(dir, "projects"));
    const created = store.createProject({ name: "Cover Priority Test", icon: "film", imageRatio: "16:9" });
    const pid = created.project.id;

    // 1. Fresh empty project -> coverPreview is null
    let summary = store.listProjects().find((p) => p.id === pid);
    assert.ok(summary);
    assert.equal(summary.coverPreview, null);

    // Prepare dummy image & video files
    const mediaSourceDir = join(dir, "sources");
    mkdirSync(mediaSourceDir, { recursive: true });
    const imgPath = join(mediaSourceDir, "broll-shot.png");
    const vidPath = join(mediaSourceDir, "scene-motion.mp4");
    writeFileSync(imgPath, Buffer.from("89504e470d0a1a0a", "hex"));
    writeFileSync(vidPath, Buffer.from("00000018667479706d703432", "hex"));

    // Create 2 shots: Shot 1 = A-ROLL, Shot 2 = B-ROLL
    let detail = store.getProject(pid);
    if (detail.rows.length < 2) {
      store.createShots(pid, 2 - detail.rows.length);
      detail = store.getProject(pid);
    }
    const [shot1, shot2] = detail.rows;
    store.updateShot(pid, { id: shot1.id, field: "scene", value: "A-ROLL" });
    store.updateShot(pid, { id: shot2.id, field: "scene", value: "B-ROLL" });

    // 2. Import B-Roll storyboard image onto Shot 2 -> coverPreview is "broll-image"
    await store.importShotMediaPaths(pid, shot2.id, [imgPath]);
    summary = store.listProjects().find((p) => p.id === pid);
    assert.equal(summary?.coverPreview?.kind, "broll-image");
    assert.match(summary?.coverPreview?.url ?? "", /^mkboard-asset:\/\/asset\//u);

    // 3. Import video onto Shot 2 -> coverPreview upgrades to "video-first-frame" with ?firstFrame=1
    await store.importShotMediaPaths(pid, shot2.id, [vidPath]);
    summary = store.listProjects().find((p) => p.id === pid);
    assert.equal(summary?.coverPreview?.kind, "video-first-frame");
    assert.match(summary?.coverPreview?.url ?? "", /firstFrame=1/u);
    assert.ok(summary?.coverPreview?.videoUrl);
    assert.equal(summary?.videoCount, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
