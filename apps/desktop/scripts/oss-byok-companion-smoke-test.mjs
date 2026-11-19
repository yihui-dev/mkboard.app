import { MkboardStore } from "../src/main/database.ts";
import assert from "node:assert/strict";
import { mkdirSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ByokStore } from "../src/main/byok-store.ts";
import { LocalAiMediaService } from "../src/main/local-ai-media.ts";
import { renderQrSvg } from "../src/main/qr-svg.ts";
import { findCliAgentDefinition, loadCliAgentDefinitions } from "../src/main/agent-registry.ts";
import { CompanionServer } from "../src/main/companion-server.ts";
import {
  classifySkillryInstallFailure,
  extractPaletteFromSources,
  getSkillryCatalogStatus,
  getSkillryCollectionDetail,
  checkSkillrySkillAccess,
  importSkillFromSource,
  importTasteFromSource,
  parseGitHubUrl,
  resolveBundledSkillryCliEntry,
  resolveNpmBinary
} from "../src/main/style-skill-hub.ts";

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
    for (const builtin of ["codex", "claude-code", "antigravity", "opencode", "cursor-agent", "kimi-cli", "custom:aider"]) {
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

    // 4. Upload custom cover image (3:4) -> overrides B-Roll video on Home and populates Workspace banner coverImageUrl
    const customCoverPath = join(mediaSourceDir, "custom-cover-3x4.png");
    writeFileSync(customCoverPath, Buffer.from("89504e470d0a1a0a0000000d49484452", "hex"));
    const afterUpload = store.updateProjectCover({
      projectId: pid,
      coverImageSourcePath: customCoverPath,
      coverImageRatio: "3:4"
    });
    summary = afterUpload.projects.find((p) => p.id === pid);
    assert.equal(summary?.coverPreview?.kind, "custom-cover");
    assert.equal(summary?.coverPreview?.ratio, "3:4");
    assert.equal(summary?.coverPreview?.videoUrl, undefined);
    assert.ok(afterUpload.detail.project.coverImageUrl);
    assert.equal(afterUpload.detail.project.coverImageRatio, "3:4");
    const resolvedDiskCover = store.resolveAssetPreviewPath(`project-cover--${pid}`);
    assert.ok(resolvedDiskCover && existsSync(resolvedDiskCover));

    // 5. Switch cover ratio (3:4 -> 4:3 -> 16:9) without re-uploading file
    const afterRatio = store.updateProjectCover({
      projectId: pid,
      coverImageRatio: "4:3"
    });
    summary = afterRatio.projects.find((p) => p.id === pid);
    assert.equal(summary?.coverPreview?.kind, "custom-cover");
    assert.equal(summary?.coverPreview?.ratio, "4:3");
    assert.equal(afterRatio.detail.project.coverImageRatio, "4:3");

    // 6. Remove custom cover -> restores B-Roll video first-frame preview on Home and clears Workspace banner coverImageUrl
    const afterClear = store.updateProjectCover({
      projectId: pid,
      clearCoverImage: true
    });
    summary = afterClear.projects.find((p) => p.id === pid);
    assert.equal(summary?.coverPreview?.kind, "video-first-frame");
    assert.equal(afterClear.detail.project.coverImageUrl, null);
    assert.equal(store.resolveAssetPreviewPath(`project-cover--${pid}`), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Legacy preset tastes are removed; custom imported styles persist across MkboardStore restarts and fall back cleanly on delete", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mkboard-taste-hub-"));
  try {
    const dbDir = join(dir, "userdata");
    const templateDir = join(dir, "open-editorial-theme");
    mkdirSync(dbDir, { recursive: true });
    mkdirSync(templateDir, { recursive: true });

    writeFileSync(
      join(templateDir, "DESIGN.md"),
      "---\nname: Open Editorial Neo\ndescription: Clean high-contrast open-source editorial template\n---\n# Open Editorial Neo\n\nUse crisp ivory backgrounds, deep obsidian ink, and vermilion accents.",
      "utf8"
    );
    writeFileSync(
      join(templateDir, "tokens.css"),
      ":root { --background: #FAF8F5; --foreground: #141619; --accent: #E64833; }",
      "utf8"
    );

    const store1 = new MkboardStore(join(dbDir, "mkboard.sqlite"), join(dbDir, "projects"));
    const initialTastes = store1.listTastes();
    assert.equal(initialTastes.length, 1);
    assert.equal(initialTastes[0].id, "taste-auto-adaptive");

    const importedTaste = await importTasteFromSource(store1, {
      sourceType: "local",
      urlOrPath: templateDir
    });
    assert.equal(importedTaste.name, "Open Editorial Neo");
    assert.equal(importedTaste.preview.background, "#FAF8F5");
    assert.equal(importedTaste.preview.foreground, "#141619");
    assert.equal(importedTaste.preview.accent, "#E64833");
    assert.equal(importedTaste.scope, "user");

    const createdProject = store1.createProject({
      name: "Custom Style Persistence Check",
      icon: "film",
      templateId: "default-template",
      tasteId: importedTaste.id
    });
    assert.equal(createdProject.project.tasteId, importedTaste.id);

    // Reopen MkboardStore against the same SQLite database to verify ensureProjectTasteAssignments preserves user tastes
    const store2 = new MkboardStore(join(dbDir, "mkboard.sqlite"), join(dbDir, "projects"));
    const reopenedProject = store2.getProject(createdProject.project.id);
    assert.equal(reopenedProject.project.tasteId, importedTaste.id);
    assert.equal(reopenedProject.taste.name, "Open Editorial Neo");

    // Deleting the custom style resets assigned projects back to taste-auto-adaptive
    const remainingTastes = store2.deleteTaste(importedTaste.id);
    assert.equal(remainingTastes.length, 1);
    assert.equal(remainingTastes[0].id, "taste-auto-adaptive");
    assert.equal(store2.getProject(createdProject.project.id).project.tasteId, "taste-auto-adaptive");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Skillry CreatorMotion & LaunchMotion hub status, paid entitlement classification, GitHub URL parser, and skill importer work end-to-end", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mkboard-skillry-hub-"));
  try {
    const ghRoot = parseGitHubUrl("https://github.com/nexu-io/open-design");
    assert.equal(ghRoot?.owner, "nexu-io");
    assert.equal(ghRoot?.repo, "open-design");
    assert.equal(ghRoot?.mode, "root");

    const ghTree = parseGitHubUrl("https://github.com/anthropics/skills/tree/main/skills/frontend-design");
    assert.equal(ghTree?.owner, "anthropics");
    assert.equal(ghTree?.repo, "skills");
    assert.equal(ghTree?.mode, "tree");
    assert.deepEqual(ghTree?.remainderSegments, ["main", "skills", "frontend-design"]);

    const palette = extractPaletteFromSources(":root { --bg: #0b1020; --fg: #f8fafc; --brand: #38bdf8; }");
    assert.equal(palette.background, "#0B1020");
    assert.equal(palette.foreground, "#F8FAFC");
    assert.equal(palette.accent, "#38BDF8");

    const store = new MkboardStore(join(dir, "mkboard.sqlite"), join(dir, "projects"));
    const catalog = await getSkillryCatalogStatus(store);
    assert.deepEqual(
      catalog.packs.map((p) => p.slug),
      ["bs-creatormotion", "bs-launchmotion"]
    );
    assert.equal(catalog.packs[0].pricingTier, "freemium_pro");
    assert.equal(catalog.packs[1].pricingTier, "paid_pro");
    assert.equal(
      catalog.packs[0].cliInstallCommand,
      "npm exec --yes --package=skillry-cli@latest -- skillry-cli install bs-creatormotion --agent shared --force"
    );
    assert.equal(catalog.packs[0].themes.length, 4);
    assert.equal(catalog.packs[1].themes.length, 6);
    assert.equal(catalog.bundledCliAvailable, true);

    const creatorDetail = await getSkillryCollectionDetail(store, { slug: "bs-creatormotion", locale: "zh-CN" });
    assert.equal(creatorDetail.pack.slug, "bs-creatormotion");
    assert.ok(creatorDetail.items.length >= 12);
    assert.ok(creatorDetail.categories.length >= 2);
    assert.ok(creatorDetail.items.every((it) => it.previewVideoUrl.startsWith("https://")));

    const launchDetail = await getSkillryCollectionDetail(store, { slug: "bs-launchmotion", locale: "zh-CN" });
    assert.equal(launchDetail.pack.slug, "bs-launchmotion");
    assert.ok(launchDetail.items.length >= 12);
    assert.ok(launchDetail.categories.length >= 2);

    const accessCheck = await checkSkillrySkillAccess({ slug: "bs-launchmotion", priceUsdCents: 99999 });
    assert.equal(accessCheck.slug, "bs-launchmotion");
    assert.equal(accessCheck.isMembersOnlyBundle, true);
    assert.equal(accessCheck.pricingUrl, "https://skillry.dev/pricing");
    const npmBin = await resolveNpmBinary();
    assert.ok(npmBin && npmBin.length > 0);
    const bundledEntry = resolveBundledSkillryCliEntry();
    assert.ok(bundledEntry && bundledEntry.entryPath.endsWith("dist/index.js"));

    const launchPaidCheck = classifySkillryInstallFailure(
      "SkillryApiError: HTTP 402 Payment Required - Upgrade to Skillry Pro at https://skillry.dev/pricing to unlock bs-launchmotion",
      2,
      "bs-launchmotion"
    );
    assert.equal(launchPaidCheck.status, "needs_entitlement");
    assert.equal(launchPaidCheck.pricingUrl, "https://skillry.dev/pricing");

    const localSkillDir = join(dir, "my-github-skill");
    mkdirSync(localSkillDir, { recursive: true });
    writeFileSync(
      join(localSkillDir, "SKILL.md"),
      "---\nname: cinematic-broll-planner\ndescription: Open-source storyboard B-Roll pacing skill\n---\n# Cinematic B-Roll Planner\n\nSplit beats cleanly into 4-second visual hooks.",
      "utf8"
    );

    const importedSkill = await importSkillFromSource(store, {
      sourceType: "local",
      urlOrPath: localSkillDir,
      installToAgentSkills: false
    });
    assert.equal(importedSkill.name, "Cinematic B-Roll Planner");
    assert.equal(importedSkill.scope, "user");
    assert.ok(store.listSkills().some((s) => s.id === importedSkill.id));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

import { scoreRgb24CoverSample } from "../src/main/video-poster.ts";

test("scoreRgb24CoverSample rejects blank white/black intro frames in favor of rich content frames", () => {
  const w = 96;
  const h = 54;
  const blankWhite = Buffer.alloc(w * h * 3, 252);
  const blankBlackWithThinBox = Buffer.alloc(w * h * 3, 8);
  // Draw a thin 1px grey rectangle outline in the middle (simulating an empty intro wireframe)
  for (let x = 28; x <= 68; x += 1) {
    for (const y of [18, 36]) {
      const idx = (y * w + x) * 3;
      blankBlackWithThinBox[idx] = 140;
      blankBlackWithThinBox[idx + 1] = 140;
      blankBlackWithThinBox[idx + 2] = 140;
    }
  }

  // Simulate a rich slide / UI showcase frame with high-contrast central panels, typography bars, and accent graphics
  const richSlide = Buffer.alloc(w * h * 3, 18);
  for (let y = 10; y < 44; y += 1) {
    for (let x = 16; x < 80; x += 1) {
      const idx = (y * w + x) * 3;
      if ((y + x) % 5 === 0) {
        richSlide[idx] = 56;
        richSlide[idx + 1] = 189;
        richSlide[idx + 2] = 248;
      } else if (y % 4 === 0 && x > 22 && x < 72) {
        richSlide[idx] = 248;
        richSlide[idx + 1] = 250;
        richSlide[idx + 2] = 252;
      } else {
        richSlide[idx] = 34;
        richSlide[idx + 1] = 42;
        richSlide[idx + 2] = 58;
      }
    }
  }

  const whiteScore = scoreRgb24CoverSample(blankWhite, w, h);
  const sparseWireframeScore = scoreRgb24CoverSample(blankBlackWithThinBox, w, h);
  const richScore = scoreRgb24CoverSample(richSlide, w, h);

  assert.ok(whiteScore < 2, `Expected blank white frame score < 2, got ${whiteScore}`);
  assert.ok(richScore > sparseWireframeScore * 2.5, `Expected rich frame (${richScore}) >> sparse intro wireframe (${sparseWireframeScore})`);
});
