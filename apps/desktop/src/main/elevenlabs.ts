import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  SPEECH_SEGMENT_MAX_LENGTH,
  type ElevenLabsErrorCode,
  type ElevenLabsKeySaveResult,
  type ElevenLabsSpeechInput,
  type ElevenLabsSpeechResult,
  type ElevenLabsSpeechSegmentState,
  type ElevenLabsSpeechStatusInput,
  type ElevenLabsStatus,
  type ElevenLabsVoice,
  type ElevenLabsVoicesResult
} from "../shared";
import { ByokStore, maskApiKey } from "./byok-store";

export const defaultElevenLabsModelId = "eleven_v4";
const defaultElevenLabsOutputFormat = "mp3_44100_128";
const maxCachedSpeechFiles = 200;
const maxSpeechAudioBytes = 25 * 1024 * 1024;
const elevenLabsTimeoutMs = 60_000;

export type ElevenLabsTransport = {
  synthesizeElevenLabsSpeech(input: {
    text: string;
    voiceId: string;
    modelId: string;
    outputFormat: string;
  }): Promise<
    | { ok: true; data: { audioBase64: string; contentType: string } }
    | { ok: false; error: { code: string; message: string } }
  >;
};

export class ElevenLabsService {
  private readonly speechCacheDir: string;
  private readonly byok: ByokStore;
  private readonly customTransport: ElevenLabsTransport | null;
  private readonly inFlightSpeech = new Map<string, Promise<ElevenLabsSpeechResult>>();
  private cachedVoices: { keyFingerprint: string; voices: ElevenLabsVoice[]; fetchedAt: number } | null = null;

  constructor(dataDir: string, byokOrTransport?: ByokStore | ElevenLabsTransport) {
    this.speechCacheDir = join(dataDir, "elevenlabs-speech-cache");
    if (byokOrTransport && "getSnapshot" in byokOrTransport) {
      this.byok = byokOrTransport;
      this.customTransport = null;
    } else {
      this.byok = new ByokStore(dataDir);
      this.customTransport = (byokOrTransport as ElevenLabsTransport | undefined) ?? null;
    }
  }

  async getStatus(): Promise<ElevenLabsStatus> {
    const creds = this.byok.resolveCredentials("elevenlabs");
    return {
      configured: Boolean(creds.apiKey),
      maskedKey: creds.apiKey ? maskApiKey(creds.apiKey) : null,
      updatedAt: creds.updatedAt
    };
  }

  async saveApiKey(rawKey: string): Promise<ElevenLabsKeySaveResult> {
    const trimmed = rawKey.trim();
    if (!trimmed) return { ok: false, error: "invalid_key" };

    // Verify directly against ElevenLabs before persisting
    const probe = await this.byok.testProvider("elevenlabs", trimmed);
    if (!probe.ok) {
      const msg = probe.message.toLowerCase();
      if (msg.includes("invalid") || msg.includes("401") || msg.includes("403")) {
        return { ok: false, error: "invalid_key" };
      }
      return { ok: false, error: "network_error" };
    }

    this.byok.saveProvider({ providerId: "elevenlabs", apiKey: trimmed });
    this.cachedVoices = null;
    return { ok: true, status: await this.getStatus() };
  }

  async clearApiKey(): Promise<ElevenLabsStatus> {
    this.byok.clearProviderKey("elevenlabs");
    this.cachedVoices = null;
    return this.getStatus();
  }

  async listVoices(): Promise<ElevenLabsVoicesResult> {
    const creds = this.byok.resolveCredentials("elevenlabs");
    if (!creds.apiKey) return { ok: false, error: "not_configured" };

    const fingerprint = createHash("sha256").update(`${creds.baseUrl}\n${creds.apiKey}`).digest("hex");
    if (this.cachedVoices && this.cachedVoices.keyFingerprint === fingerprint && Date.now() - this.cachedVoices.fetchedAt < 5 * 60_000) {
      return { ok: true, voices: this.cachedVoices.voices };
    }

    try {
      const res = await fetch(`${creds.baseUrl}/v1/voices?show_legacy=true`, {
        headers: { "xi-api-key": creds.apiKey },
        signal: AbortSignal.timeout(15_000)
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) return { ok: false, error: "invalid_key" };
        if (res.status === 429) return { ok: false, error: "quota_exceeded" };
        return { ok: false, error: "request_failed" };
      }
      const payload = (await res.json().catch(() => ({}))) as { voices?: Array<Record<string, unknown>> };
      const voices = (payload.voices ?? [])
        .map(mapUpstreamVoice)
        .filter((v): v is ElevenLabsVoice => Boolean(v));
      this.cachedVoices = { keyFingerprint: fingerprint, voices, fetchedAt: Date.now() };
      return { ok: true, voices };
    } catch {
      return { ok: false, error: "network_error" };
    }
  }

  private resolveModelId(): string {
    if (this.customTransport) return defaultElevenLabsModelId;
    return this.byok.resolveCredentials("elevenlabs").model || defaultElevenLabsModelId;
  }

  getSpeechStatus(input: ElevenLabsSpeechStatusInput): ElevenLabsSpeechSegmentState[] {
    const voiceId = input.voiceId.trim();
    if (!voiceId) return input.texts.map(() => "missing");
    const modelId = this.resolveModelId();
    return input.texts.map((rawText) => {
      const text = rawText.trim();
      if (!text) return "missing";
      const cacheKey = speechCacheKey(voiceId, text, modelId);
      if (this.inFlightSpeech.has(cacheKey)) return "generating";
      return this.readCachedAudio(cacheKey) ? "cached" : "missing";
    });
  }

  async synthesizeSpeechAudio(
    input: ElevenLabsSpeechInput
  ): Promise<{ ok: true; audio: Buffer; contentType: string; cached: boolean } | { ok: false; error: ElevenLabsErrorCode; message?: string }> {
    const text = input.text.trim();
    const voiceId = input.voiceId.trim();
    if (!text || !voiceId) return { ok: false, error: "request_failed", message: "Missing speech text or voiceId." };
    if (text.length > SPEECH_SEGMENT_MAX_LENGTH * 2) return { ok: false, error: "text_too_long" };

    const modelId = this.resolveModelId();
    const cacheKey = speechCacheKey(voiceId, text, modelId);
    const cached = this.readCachedAudio(cacheKey);
    if (cached) return { ok: true, audio: cached, contentType: "audio/mpeg", cached: true };

    if (this.customTransport) {
      const result = await this.customTransport.synthesizeElevenLabsSpeech({
        text,
        voiceId,
        modelId,
        outputFormat: defaultElevenLabsOutputFormat
      });
      if (!result.ok) {
        return { ok: false, error: mapTransportErrorCode(result.error.code), message: result.error.message };
      }
      const decoded = decodeAudio(result.data.audioBase64);
      if (!decoded) return { ok: false, error: "request_failed", message: "Invalid synthesized audio payload." };
      this.writeCachedAudio(cacheKey, decoded);
      return { ok: true, audio: decoded, contentType: result.data.contentType || "audio/mpeg", cached: false };
    }

    const creds = this.byok.resolveCredentials("elevenlabs");
    if (!creds.apiKey) return { ok: false, error: "not_configured", message: "ElevenLabs API Key 尚未配置。" };

    try {
      const url = new URL(`/v1/text-to-speech/${encodeURIComponent(voiceId)}`, creds.baseUrl);
      url.searchParams.set("output_format", defaultElevenLabsOutputFormat);
      const response = await fetch(url.toString(), {
        method: "POST",
        headers: {
          "xi-api-key": creds.apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg"
        },
        body: JSON.stringify({
          text,
          model_id: modelId
        }),
        signal: AbortSignal.timeout(elevenLabsTimeoutMs)
      });

      if (!response.ok) {
        const rawErr = (await response.json().catch(() => ({}))) as { detail?: { status?: string; message?: string } | string };
        const errText =
          typeof rawErr.detail === "string"
            ? rawErr.detail
            : typeof rawErr.detail?.message === "string"
              ? rawErr.detail.message
              : `HTTP ${response.status}`;
        const statusStr = typeof rawErr.detail === "object" ? String(rawErr.detail?.status || "") : "";
        if (statusStr.includes("quota") || response.status === 429) {
          return { ok: false, error: "quota_exceeded", message: errText };
        }
        if (response.status === 401 || response.status === 403) {
          return { ok: false, error: "invalid_key", message: errText };
        }
        return { ok: false, error: "request_failed", message: errText };
      }

      const audio = Buffer.from(await response.arrayBuffer());
      if (!audio.byteLength || audio.byteLength > maxSpeechAudioBytes) {
        return { ok: false, error: "request_failed", message: "ElevenLabs returned empty or oversized audio." };
      }
      this.writeCachedAudio(cacheKey, audio);
      const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() || "audio/mpeg";
      return { ok: true, audio, contentType, cached: false };
    } catch (error) {
      return {
        ok: false,
        error: "network_error",
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async synthesizeSpeech(input: ElevenLabsSpeechInput): Promise<ElevenLabsSpeechResult> {
    const text = input.text.trim();
    const voiceId = input.voiceId.trim();
    if (!text || !voiceId) return { ok: false, error: "request_failed" };

    const cacheKey = speechCacheKey(voiceId, text, this.resolveModelId());
    const cached = this.readCachedAudio(cacheKey);
    if (cached) return { ok: true, audioDataUrl: toAudioDataUrl(cached, "audio/mpeg"), cached: true };

    const existing = this.inFlightSpeech.get(cacheKey);
    if (existing) return existing;

    const run = this.synthesizeSpeechAudio({ text, voiceId })
      .then((res): ElevenLabsSpeechResult => {
        if (!res.ok) return res;
        return { ok: true, audioDataUrl: toAudioDataUrl(res.audio, res.contentType), cached: res.cached };
      })
      .finally(() => {
        this.inFlightSpeech.delete(cacheKey);
      });

    this.inFlightSpeech.set(cacheKey, run);
    return run;
  }

  private readCachedAudio(cacheKey: string): Buffer | null {
    const cachedPath = join(this.speechCacheDir, `${cacheKey}.mp3`);
    if (!existsSync(cachedPath)) return null;
    try {
      const audio = readFileSync(cachedPath);
      return audio.byteLength > 0 && audio.byteLength <= maxSpeechAudioBytes ? audio : null;
    } catch {
      return null;
    }
  }

  private writeCachedAudio(cacheKey: string, audio: Buffer): void {
    const cachedPath = join(this.speechCacheDir, `${cacheKey}.mp3`);
    try {
      mkdirSync(this.speechCacheDir, { recursive: true });
      writeFileSync(cachedPath, audio);
      this.pruneSpeechCache();
    } catch {
      // Cache writes are best-effort.
    }
  }

  private pruneSpeechCache(): void {
    try {
      const entries = readdirSync(this.speechCacheDir)
        .filter((name) => name.endsWith(".mp3"))
        .map((name) => {
          const filePath = join(this.speechCacheDir, name);
          return { filePath, mtimeMs: statSync(filePath).mtimeMs };
        })
        .sort((left, right) => right.mtimeMs - left.mtimeMs);
      for (const entry of entries.slice(maxCachedSpeechFiles)) rmSync(entry.filePath, { force: true });
    } catch {
      // Best-effort cache pruning.
    }
  }
}

function mapUpstreamVoice(raw: Record<string, unknown>): ElevenLabsVoice | null {
  const voiceId = typeof raw.voice_id === "string" ? raw.voice_id.trim() : "";
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!voiceId || !name) return null;
  const category = typeof raw.category === "string" ? raw.category : "premade";
  const labels = raw.labels && typeof raw.labels === "object" ? (raw.labels as Record<string, unknown>) : {};
  const verifiedLangs = Array.isArray(raw.verified_languages) ? (raw.verified_languages as Array<Record<string, unknown>>) : [];
  const primaryVerified = verifiedLangs[0] && typeof verifiedLangs[0] === "object" ? verifiedLangs[0] : null;
  const rawGender = typeof labels.gender === "string" ? labels.gender.toLowerCase() : "";
  const gender: ElevenLabsVoice["gender"] =
    rawGender === "male" ? "male" : rawGender === "female" ? "female" : rawGender === "neutral" ? "neutral" : "unknown";
  const rawDesc = typeof raw.description === "string" ? raw.description.trim() : "";
  const labelDesc = typeof labels.description === "string" ? labels.description.trim() : "";
  const description = rawDesc.length >= labelDesc.length && rawDesc ? rawDesc : labelDesc || null;
  const language =
    typeof labels.language === "string" && labels.language.trim()
      ? labels.language.trim()
      : primaryVerified && typeof primaryVerified.language === "string"
        ? primaryVerified.language.trim()
        : null;
  const accent =
    typeof labels.accent === "string" && labels.accent.trim()
      ? labels.accent.trim()
      : primaryVerified && typeof primaryVerified.accent === "string"
        ? primaryVerified.accent.trim()
        : null;
  const useCase =
    typeof labels.use_case === "string" && labels.use_case.trim()
      ? labels.use_case.trim()
      : typeof labels["use case"] === "string" && (labels["use case"] as string).trim()
        ? (labels["use case"] as string).trim()
        : null;
  return {
    voiceId,
    name,
    category,
    isPersonal: category !== "premade" && category !== "default",
    gender,
    language,
    accent,
    description,
    useCase,
    previewUrl: typeof raw.preview_url === "string" ? raw.preview_url : null
  };
}

function mapTransportErrorCode(code: string): ElevenLabsErrorCode {
  if (code === "ELEVENLABS_NOT_CONFIGURED") return "not_configured";
  if (code === "ELEVENLABS_INVALID_KEY") return "invalid_key";
  if (code === "ELEVENLABS_QUOTA_EXCEEDED") return "quota_exceeded";
  if (code === "ELEVENLABS_TEXT_TOO_LONG") return "text_too_long";
  if (code === "ELEVENLABS_NETWORK_ERROR" || code === "NETWORK_ERROR" || code === "NETWORK_TIMEOUT") return "network_error";
  return "request_failed";
}

function speechCacheKey(voiceId: string, text: string, modelId = defaultElevenLabsModelId): string {
  return createHash("sha256").update(`${voiceId}\n${modelId}\n${defaultElevenLabsOutputFormat}\n${text}`).digest("hex");
}

function decodeAudio(audioBase64: string): Buffer | null {
  try {
    const audio = Buffer.from(audioBase64, "base64");
    return audio.byteLength && audio.byteLength <= maxSpeechAudioBytes ? audio : null;
  } catch {
    return null;
  }
}

function toAudioDataUrl(audio: Buffer, rawContentType: string): string {
  const contentType = /^audio\/[a-z0-9.+-]+$/iu.test(rawContentType) ? rawContentType : "audio/mpeg";
  return `data:${contentType};base64,${audio.toString("base64")}`;
}
