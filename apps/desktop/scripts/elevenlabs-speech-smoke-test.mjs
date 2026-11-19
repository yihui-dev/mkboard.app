import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ByokStore } from "../src/main/byok-store.ts";
import { defaultElevenLabsModelId, ElevenLabsService } from "../src/main/elevenlabs.ts";

function createFakeCloud() {
  const calls = [];
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  return {
    calls,
    release: () => release(),
    cloud: {
      async synthesizeElevenLabsSpeech(input) {
        assert.equal(input.modelId, "eleven_v4");
        calls.push(input.text);
        await gate;
        return { ok: true, data: { audioBase64: Buffer.from(`audio:${input.text}`).toString("base64"), contentType: "audio/mpeg" } };
      }
    }
  };
}

test("repeated voiceover requests while one is running reuse it instead of calling ElevenLabs again", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "mkboard-elevenlabs-"));
  try {
    const fake = createFakeCloud();
    const service = new ElevenLabsService(dataDir, fake.cloud);
    const input = { text: "第一段逐字稿。", voiceId: "voice-1" };

    const first = service.synthesizeSpeech(input);
    // The script tab is left and opened again: the view asks for status, then requests the same audio.
    assert.deepEqual(service.getSpeechStatus({ voiceId: "voice-1", texts: ["第一段逐字稿。", "第二段"] }), ["generating", "missing"]);
    const second = service.synthesizeSpeech({ ...input, text: ` ${input.text} ` });

    fake.release();
    const [firstResult, secondResult] = await Promise.all([first, second]);
    assert.equal(fake.calls.length, 1);
    assert.equal(firstResult.ok, true);
    assert.deepEqual(secondResult, firstResult);

    assert.deepEqual(service.getSpeechStatus({ voiceId: "voice-1", texts: ["第一段逐字稿。"] }), ["cached"]);
    const cachedResult = await service.synthesizeSpeech(input);
    assert.equal(cachedResult.ok && cachedResult.cached, true);
    assert.equal(fake.calls.length, 1);
    assert.deepEqual(service.getSpeechStatus({ voiceId: "voice-2", texts: ["第一段逐字稿。", ""] }), ["missing", "missing"]);
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("a failed voiceover request is not remembered as in progress", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "mkboard-elevenlabs-fail-"));
  try {
    let calls = 0;
    const service = new ElevenLabsService(dataDir, {
      async synthesizeElevenLabsSpeech() {
        calls += 1;
        return { ok: false, error: { code: "ELEVENLABS_QUOTA_EXCEEDED", message: "quota" } };
      }
    });
    const result = await service.synthesizeSpeech({ text: "文本", voiceId: "voice-1" });
    assert.deepEqual(result, { ok: false, error: "quota_exceeded", message: "quota" });
    assert.deepEqual(service.getSpeechStatus({ voiceId: "voice-1", texts: ["文本"] }), ["missing"]);
    await service.synthesizeSpeech({ text: "文本", voiceId: "voice-1" });
    assert.equal(calls, 2);
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("ElevenLabs defaults to eleven_v4 in both ElevenLabsService and ByokStore", () => {
  assert.equal(defaultElevenLabsModelId, "eleven_v4");
  const dataDir = mkdtempSync(join(tmpdir(), "mkboard-elevenlabs-model-"));
  try {
    const byok = new ByokStore(dataDir);
    assert.equal(byok.resolveCredentials("elevenlabs").model, "eleven_v4");
    assert.equal(byok.getProviderStatus("elevenlabs").model, "eleven_v4");
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});
