import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { CloudSyncService, parseAudioShotKey } from "../src/main/cloud-sync.ts";

class InMemorySyncServer {
  constructor(token) {
    this.token = token;
    this.blobs = new Map();
    this.manifests = new Map();
    this.revisions = new Map();
    this.uploadCalls = 0;
  }

  fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const headers = new Headers(init.headers || {});
    if (headers.get("Authorization") !== `Bearer ${this.token}`) {
      return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401 });
    }
    const method = (init.method || "GET").toUpperCase();
    const path = url.pathname;

    if (method === "GET" && path === "/v1/verify") {
      return new Response(JSON.stringify({ ok: true, projectCount: this.manifests.size }), { status: 200 });
    }
    if (method === "POST" && path === "/v1/blobs/check") {
      const { hashes } = JSON.parse(String(init.body || "{}"));
      const existing = hashes.filter((h) => this.blobs.has(h));
      const missing = hashes.filter((h) => !this.blobs.has(h));
      return new Response(JSON.stringify({ ok: true, existing, missing }), { status: 200 });
    }
    const blobPut = /^\/v1\/blobs\/([a-f0-9]{64})$/.exec(path);
    if (method === "PUT" && blobPut) {
      this.uploadCalls += 1;
      const bytes = Buffer.from(init.body);
      this.blobs.set(blobPut[1], {
        bytes,
        mimeType: headers.get("Content-Type") || "application/octet-stream"
      });
      return new Response(JSON.stringify({ ok: true, hash: blobPut[1], size: bytes.byteLength }), { status: 200 });
    }
    const manifestPut = /^\/v1\/projects\/([^/]+)\/storyboard$/.exec(path);
    if (method === "PUT" && manifestPut) {
      const projectId = decodeURIComponent(manifestPut[1]);
      const body = JSON.parse(String(init.body || "{}"));
      const rev = (this.revisions.get(projectId) ?? 0) + 1;
      this.revisions.set(projectId, rev);
      this.manifests.set(projectId, body);
      return new Response(
        JSON.stringify({ ok: true, projectId, revision: rev, syncedAt: new Date().toISOString(), shotCount: body.shots.length }),
        { status: 200 }
      );
    }
    return new Response(JSON.stringify({ ok: false, error: "not_found" }), { status: 404 });
  };
}

test("parseAudioShotKey parses Chinese/English shot audio names and ignores full-film audio", () => {
  assert.deepEqual(parseAudioShotKey("配音-镜头03.mp3"), { shotNum: 3, revision: 0 });
  assert.deepEqual(parseAudioShotKey("配音-镜头15-2.mp3"), { shotNum: 15, revision: 2 });
  assert.deepEqual(parseAudioShotKey("shot_07-1.wav"), { shotNum: 7, revision: 1 });
  assert.equal(parseAudioShotKey("全片配音-Jerry-eleven_v4-4.mp3"), null);
});

test("CloudSyncService syncs only active shot media, posters, matched audio & ElevenLabs cache, and deduplicates on resync", async () => {
  const root = mkdtempSync(join(tmpdir(), "mkboard-cloud-sync-test-"));
  try {
    const dataDir = join(root, "userData");
    const assetsDir = join(root, "assets");
    mkdirSync(dataDir, { recursive: true });
    mkdirSync(assetsDir, { recursive: true });

    const video1Path = join(assetsDir, "B-ROLL-镜头01-含配音-3.mp4");
    const poster1Path = join(assetsDir, "B-ROLL-镜头01-poster.jpg");
    const unusedOldVideoPath = join(assetsDir, "B-ROLL-镜头01-含配音-1.mp4");
    const audio1OldPath = join(assetsDir, "配音-镜头01.mp3");
    const audio1NewPath = join(assetsDir, "配音-镜头01-2.mp3");
    const elCachedPath = join(assetsDir, "el-cache-shot2.mp3");

    writeFileSync(video1Path, Buffer.from("fake-mp4-v3-content"));
    writeFileSync(poster1Path, Buffer.from("fake-jpg-poster"));
    writeFileSync(unusedOldVideoPath, Buffer.from("OLD-UNUSED-TAKE-SHOULD-NOT-UPLOAD"));
    writeFileSync(audio1OldPath, Buffer.from("old-audio-take"));
    writeFileSync(audio1NewPath, Buffer.from("new-audio-take-v2"));
    writeFileSync(elCachedPath, Buffer.from("elevenlabs-cached-mp3-shot2"));

    const server = new InMemorySyncServer("secret-token-xyz");
    const storeAdapter = {
      getProject: () => ({
        project: {
          id: "proj-1",
          kind: "user",
          name: "测试分镜项目",
          icon: "film",
          templateId: "t1",
          tasteId: "",
          imageRatio: "16:9",
          localPath: root,
          createdAt: "2026-11-23T00:00:00Z",
          updatedAt: "2026-11-23T01:00:00Z"
        },
        scriptHtml: "<p>script</p>",
        imageRatio: "16:9",
        columns: [],
        rows: [
          {
            id: "shot-1",
            shot: "1",
            scene: "B-ROLL",
            duration: "10.5",
            content: "第一镜口播台词",
            note: "4K 实录",
            imageAssetIds: ["asset-video-v3"],
            customValues: { "custom-3": "自定义" }
          },
          {
            id: "shot-2",
            shot: "2",
            scene: "A-ROLL",
            duration: "5.0",
            content: "第二镜真人出镜台词",
            note: "留空口播位",
            imageAssetIds: [],
            customValues: {}
          }
        ],
        assets: [
          { id: "asset-video-v3", name: "B-ROLL-镜头01-含配音-3.mp4", kind: "video", sizeLabel: "1KB", localPath: video1Path, indexedPath: "", previewUrl: "", linkedShot: "1", importedAt: "2026-11-23T01:00:00Z" },
          { id: "asset-video-old", name: "B-ROLL-镜头01-含配音-1.mp4", kind: "video", sizeLabel: "1KB", localPath: unusedOldVideoPath, indexedPath: "", previewUrl: "", linkedShot: "", importedAt: "2026-11-23T00:10:00Z" },
          { id: "asset-audio-old", name: "配音-镜头01.mp3", kind: "audio", sizeLabel: "1KB", localPath: audio1OldPath, indexedPath: "", previewUrl: "", linkedShot: "", importedAt: "2026-11-23T00:10:00Z" },
          { id: "asset-audio-new", name: "配音-镜头01-2.mp3", kind: "audio", sizeLabel: "1KB", localPath: audio1NewPath, indexedPath: "", previewUrl: "", linkedShot: "", importedAt: "2026-11-23T00:20:00Z" }
        ],
        storyboardSkill: null,
        taste: null,
        agentConversations: [],
        activeAgentConversationId: "",
        agentMessages: []
      }),
      resolveAssetPreviewPath: (id) =>
        ({
          "asset-video-v3": video1Path,
          "asset-video-old": unusedOldVideoPath,
          "asset-audio-old": audio1OldPath,
          "asset-audio-new": audio1NewPath
        })[id] || null,
      resolveAssetPosterPath: (id) => (id === "asset-video-v3" ? poster1Path : null),
      resolveProjectCoverPath: () => null
    };

    const speechAdapter = {
      getCachedSpeechFilePath: (voiceId, text) => (voiceId === "voice-1" && text === "第二镜真人出镜台词" ? elCachedPath : null)
    };

    const service = new CloudSyncService({
      dataDir,
      store: storeAdapter,
      speech: speechAdapter,
      getDefaultSpeechVoiceId: () => "voice-1",
      fetchImpl: server.fetch,
      env: {}
    });

    const snap = service.saveConfig({ workerUrl: "https://sync.test.workers.dev/", syncToken: "secret-token-xyz", autoSync: true });
    assert.equal(snap.configured, true);
    assert.equal(snap.workerUrl, "https://sync.test.workers.dev");
    assert.ok(snap.pairingUri?.startsWith("mkboard-sync://pair?"));
    assert.ok(snap.qrSvg?.includes("<svg"));

    const testRes = await service.testConnection();
    assert.equal(testRes.ok, true);

    // First sync: uploads video v3 + poster + audio v2 + elevenlabs cache = 4 blobs (skips unused old video & old audio!)
    const first = await service.syncProject("proj-1");
    assert.equal(first.ok, true);
    assert.equal(first.uploadedBlobs, 4);
    assert.equal(first.reusedBlobs, 0);
    assert.equal(server.uploadCalls, 4);

    const unusedHash = createHash("sha256").update("OLD-UNUSED-TAKE-SHOULD-NOT-UPLOAD").digest("hex");
    assert.equal(server.blobs.has(unusedHash), false, "Unused historical takes must NOT be uploaded");

    const savedManifest = server.manifests.get("proj-1");
    assert.equal(savedManifest.shots.length, 2);
    assert.equal(savedManifest.shots[0].media[0].hasEmbeddedAudio, true);
    assert.equal(savedManifest.shots[0].audio.fileName, "配音-镜头01-2.mp3");
    assert.equal(savedManifest.shots[1].audio.source, "elevenlabs-cache");

    // Second sync with unchanged media: 0 uploads, 4 reused!
    const second = await service.syncProject("proj-1");
    assert.equal(second.ok, true);
    assert.equal(second.uploadedBlobs, 0);
    assert.equal(second.reusedBlobs, 4);
    assert.equal(second.revision, 2);
    assert.equal(server.uploadCalls, 4);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
