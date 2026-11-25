import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { handleRequest } from "../src/index.ts";

class MemoryR2Bucket {
  constructor() {
    this.objects = new Map();
    this.uploads = new Map();
    this.nextUploadId = 1;
  }

  async head(key) {
    const item = this.objects.get(key);
    if (!item) return null;
    return {
      key,
      size: item.bytes.byteLength,
      httpEtag: item.etag,
      httpMetadata: item.httpMetadata
    };
  }

  async get(key, options) {
    const item = this.objects.get(key);
    if (!item) return null;
    let slice = item.bytes;
    if (options?.range) {
      const start = options.range.offset ?? 0;
      const length = options.range.length ?? item.bytes.byteLength - start;
      slice = item.bytes.subarray(start, start + length);
    }
    return {
      key,
      size: item.bytes.byteLength,
      httpEtag: item.etag,
      httpMetadata: item.httpMetadata,
      body: slice,
      async json() {
        return JSON.parse(Buffer.from(slice).toString("utf8"));
      },
      async arrayBuffer() {
        return slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength);
      }
    };
  }

  async put(key, value, options) {
    let bytes;
    if (typeof value === "string") {
      bytes = Buffer.from(value, "utf8");
    } else if (value instanceof Uint8Array) {
      bytes = Buffer.from(value);
    } else if (value && typeof value.getReader === "function") {
      const reader = value.getReader();
      const chunks = [];
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        chunks.push(Buffer.from(chunk));
      }
      bytes = Buffer.concat(chunks);
    } else {
      bytes = Buffer.from(await new Response(value).arrayBuffer());
    }
    const etag = `"${createHash("md5").update(bytes).digest("hex")}"`;
    this.objects.set(key, {
      bytes,
      etag,
      httpMetadata: options?.httpMetadata ?? {}
    });
    return { key, size: bytes.byteLength, httpEtag: etag };
  }

  async delete(key) {
    this.objects.delete(key);
  }

  async createMultipartUpload(key, options) {
    const uploadId = `mp-${this.nextUploadId++}`;
    this.uploads.set(uploadId, { key, options, parts: new Map() });
    return { key, uploadId };
  }

  resumeMultipartUpload(key, uploadId) {
    const state = this.uploads.get(uploadId);
    if (!state || state.key !== key) throw new Error("Upload not found");
    return {
      uploadPart: async (partNumber, body) => {
        const bytes = Buffer.from(await new Response(body).arrayBuffer());
        const etag = `"part-${partNumber}-${bytes.byteLength}"`;
        state.parts.set(partNumber, { bytes, etag });
        return { partNumber, etag };
      },
      complete: async (parts) => {
        const ordered = [...parts]
          .sort((a, b) => a.partNumber - b.partNumber)
          .map((p) => state.parts.get(p.partNumber).bytes);
        const combined = Buffer.concat(ordered);
        this.uploads.delete(uploadId);
        return this.put(key, combined, state.options);
      },
      abort: async () => {
        this.uploads.delete(uploadId);
      }
    };
  }
}

const TOKEN = "test-sync-token-123456";

function makeEnv() {
  return {
    SYNC_BUCKET: new MemoryR2Bucket(),
    SYNC_TOKEN: TOKEN,
    CORS_ORIGIN: "*"
  };
}

function req(path, init = {}, token = TOKEN) {
  const headers = new Headers(init.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return new Request(`https://sync.example.com${path}`, { ...init, headers });
}

test("health and auth enforcement", async () => {
  const env = makeEnv();
  const health = await handleRequest(new Request("https://sync.example.com/health"), env);
  assert.equal(health.status, 200);
  const unauth = await handleRequest(new Request("https://sync.example.com/v1/projects"), env);
  assert.equal(unauth.status, 401);
  const ok = await handleRequest(req("/v1/verify"), env);
  assert.equal(ok.status, 200);
  const payload = await ok.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.projectCount, 0);
});

test("blob dedup check, single put, range 206 streaming, and multipart upload", async () => {
  const env = makeEnv();
  const sampleBytes = Buffer.from("0123456789abcdefghijklmnopqrstuvwxyz");
  const hash = createHash("sha256").update(sampleBytes).digest("hex");

  // 1. Check missing
  const check1 = await handleRequest(
    req("/v1/blobs/check", { method: "POST", body: JSON.stringify({ hashes: [hash] }) }),
    env
  );
  assert.deepEqual((await check1.json()).missing, [hash]);

  // 2. Upload blob
  const putRes = await handleRequest(
    req(`/v1/blobs/${hash}`, {
      method: "PUT",
      headers: { "Content-Type": "video/mp4" },
      body: sampleBytes
    }),
    env
  );
  assert.equal(putRes.status, 200);

  // 3. Check existing
  const check2 = await handleRequest(
    req("/v1/blobs/check", { method: "POST", body: JSON.stringify({ hashes: [hash] }) }),
    env
  );
  assert.deepEqual((await check2.json()).existing, [hash]);

  // 4. Range 206 request with query token (for ExoPlayer / AVPlayer compatibility)
  const rangeRes = await handleRequest(
    new Request(`https://sync.example.com/v1/blobs/${hash}?token=${TOKEN}`, {
      headers: { Range: "bytes=10-19" }
    }),
    env
  );
  assert.equal(rangeRes.status, 206);
  assert.equal(rangeRes.headers.get("Content-Range"), `bytes 10-19/${sampleBytes.byteLength}`);
  assert.equal(await rangeRes.text(), "abcdefghij");

  // 5. Multipart upload
  const mpData = Buffer.from("hello-multipart-4k-video-stream");
  const mpHash = createHash("sha256").update(mpData).digest("hex");
  const initRes = await handleRequest(
    req(`/v1/blobs/${mpHash}/multipart/init`, {
      method: "POST",
      body: JSON.stringify({ mimeType: "video/mp4" })
    }),
    env
  );
  const { uploadId } = await initRes.json();
  const p1 = await (
    await handleRequest(
      req(`/v1/blobs/${mpHash}/multipart/${uploadId}/part/1`, { method: "PUT", body: mpData.subarray(0, 15) }),
      env
    )
  ).json();
  const p2 = await (
    await handleRequest(
      req(`/v1/blobs/${mpHash}/multipart/${uploadId}/part/2`, { method: "PUT", body: mpData.subarray(15) }),
      env
    )
  ).json();
  const complete = await handleRequest(
    req(`/v1/blobs/${mpHash}/multipart/${uploadId}/complete`, {
      method: "POST",
      body: JSON.stringify({ parts: [p1, p2] })
    }),
    env
  );
  assert.equal(complete.status, 200);
  const fetchedMp = await handleRequest(req(`/v1/blobs/${mpHash}`), env);
  assert.equal(await fetchedMp.text(), mpData.toString("utf8"));
});

test("project storyboard upsert, list, read with enriched URLs, and delete", async () => {
  const env = makeEnv();
  const mediaHash = createHash("sha256").update("video").digest("hex");
  const audioHash = createHash("sha256").update("audio").digest("hex");

  const putManifest = await handleRequest(
    req("/v1/projects/geo-chapter2/storyboard", {
      method: "PUT",
      body: JSON.stringify({
        name: "GEO Chapter 2",
        icon: "film",
        imageRatio: "16:9",
        coverHash: mediaHash,
        shots: [
          {
            id: "s1",
            position: 1,
            shotNumber: "1",
            scene: "B-ROLL",
            duration: "12.5",
            content: "大家好，欢迎回到第二章",
            note: "4K实录",
            media: [{ kind: "video", hash: mediaHash, fileName: "shot1.mp4", mimeType: "video/mp4", fileSize: 1024 }],
            audio: { source: "elevenlabs-cache", hash: audioHash, fileName: "vo1.mp3", mimeType: "audio/mpeg", fileSize: 512 }
          }
        ]
      })
    }),
    env
  );
  assert.equal(putManifest.status, 200);
  assert.equal((await putManifest.json()).revision, 1);

  const listRes = await handleRequest(req("/v1/projects"), env);
  const listData = await listRes.json();
  assert.equal(listData.projects.length, 1);
  assert.equal(listData.projects[0].coverUrl, `https://sync.example.com/v1/blobs/${mediaHash}`);

  const readRes = await handleRequest(req("/v1/projects/geo-chapter2/storyboard"), env);
  const readData = await readRes.json();
  assert.equal(readData.storyboard.shots[0].media[0].url, `https://sync.example.com/v1/blobs/${mediaHash}`);
  assert.equal(readData.storyboard.shots[0].audio.url, `https://sync.example.com/v1/blobs/${audioHash}`);

  const delRes = await handleRequest(req("/v1/projects/geo-chapter2", { method: "DELETE" }), env);
  assert.equal(delRes.status, 200);
  const listAfter = await (await handleRequest(req("/v1/projects"), env)).json();
  assert.equal(listAfter.projects.length, 0);
});
