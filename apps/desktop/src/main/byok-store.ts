import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  ByokImageProviderId,
  ByokProviderId,
  ByokProviderStatus,
  ByokSaveInput,
  ByokSettingsSnapshot,
  ByokTestResult,
  ByokVideoProviderId
} from "../shared";

type StoredSecretEntry = {
  apiKey: string;
  updatedAt: string;
};

type StoredSecretsFile = {
  version: 1;
  providers: Partial<Record<ByokProviderId, StoredSecretEntry>>;
};

type StoredByokConfigFile = {
  version: 1;
  activeImageProvider?: ByokImageProviderId;
  activeVideoProvider?: ByokVideoProviderId;
  overrides?: Partial<Record<ByokProviderId, { baseUrl?: string; model?: string; updatedAt?: string }>>;
};

type ProviderMeta = {
  id: ByokProviderId;
  name: string;
  category: "image_video" | "image" | "voice" | "offline";
  envKeys: string[];
  baseUrlEnvKeys: string[];
  defaultBaseUrl: string;
  defaultModel: string;
  docsUrl: string;
};

const PROVIDER_METAS: readonly ProviderMeta[] = [
  {
    id: "kie",
    name: "KIE AI (GPT-Image-2 & Seedance 2.0)",
    category: "image_video",
    envKeys: ["MKBOARD_KIE_API_KEY", "KIE_API_KEY"],
    baseUrlEnvKeys: ["MKBOARD_KIE_BASE_URL"],
    defaultBaseUrl: "https://api.kie.ai",
    defaultModel: "gpt-image-2-text-to-image",
    docsUrl: "https://kie.ai/api-key"
  },
  {
    id: "openai",
    name: "OpenAI (gpt-image-1)",
    category: "image",
    envKeys: ["MKBOARD_OPENAI_API_KEY", "OPENAI_API_KEY"],
    baseUrlEnvKeys: ["MKBOARD_OPENAI_BASE_URL", "OPENAI_BASE_URL"],
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-image-1",
    docsUrl: "https://platform.openai.com/api-keys"
  },
  {
    id: "gemini",
    name: "Google Gemini (gemini-2.5-flash-image)",
    category: "image",
    envKeys: ["MKBOARD_GEMINI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY"],
    baseUrlEnvKeys: ["MKBOARD_GEMINI_BASE_URL"],
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    defaultModel: "gemini-2.5-flash-image",
    docsUrl: "https://aistudio.google.com/apikey"
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs (Multilingual v2 TTS)",
    category: "voice",
    envKeys: ["MKBOARD_ELEVENLABS_API_KEY", "ELEVENLABS_API_KEY"],
    baseUrlEnvKeys: ["MKBOARD_ELEVENLABS_BASE_URL"],
    defaultBaseUrl: "https://api.elevenlabs.io",
    defaultModel: "eleven_multilingual_v2",
    docsUrl: "https://elevenlabs.io/app/settings/api-keys"
  },
  {
    id: "stub",
    name: "Local Offline Placeholder (Zero-Key Stub)",
    category: "offline",
    envKeys: [],
    baseUrlEnvKeys: [],
    defaultBaseUrl: "local://stub",
    defaultModel: "mkboard-local-stub-v1",
    docsUrl: "https://github.com/yihui-dev/mkboard.app"
  }
];

export class ByokStore {
  private readonly secretsDir: string;
  private readonly secretsPath: string;
  private readonly configPath: string;
  private readonly env: NodeJS.ProcessEnv;

  constructor(dataDir: string, env: NodeJS.ProcessEnv = process.env) {
    this.secretsDir = join(dataDir, "secrets");
    this.secretsPath = join(this.secretsDir, "byok-secrets.json");
    this.configPath = join(dataDir, "byok-config.json");
    this.env = env;
  }

  getSnapshot(): ByokSettingsSnapshot {
    const secrets = this.readSecrets();
    const config = this.readConfig();
    const providers = PROVIDER_METAS.map((meta) => this.buildProviderStatus(meta, secrets, config));
    return {
      activeImageProvider: this.resolveActiveImageProvider(providers, config),
      activeVideoProvider: this.resolveActiveVideoProvider(providers, config),
      providers
    };
  }

  getProviderStatus(providerId: ByokProviderId): ByokProviderStatus {
    const snapshot = this.getSnapshot();
    const found = snapshot.providers.find((p) => p.id === providerId);
    if (!found) throw new Error(`Unknown provider: ${providerId}`);
    return found;
  }

  resolveCredentials(providerId: ByokProviderId): {
    apiKey: string | null;
    source: "env" | "stored" | "builtin" | "unset";
    baseUrl: string;
    model: string;
    updatedAt: string | null;
  } {
    const meta = PROVIDER_METAS.find((m) => m.id === providerId);
    if (!meta) throw new Error(`Unknown provider: ${providerId}`);
    const secrets = this.readSecrets();
    const config = this.readConfig();
    const override = config.overrides?.[providerId];

    const envBaseUrl = firstNonEmptyEnv(this.env, meta.baseUrlEnvKeys);
    const baseUrl = normalizeBaseUrl(envBaseUrl || override?.baseUrl || meta.defaultBaseUrl);
    const model = override?.model?.trim() || meta.defaultModel;

    if (providerId === "stub") {
      return { apiKey: "stub", source: "builtin", baseUrl, model, updatedAt: null };
    }

    const envKey = firstNonEmptyEnv(this.env, meta.envKeys);
    if (envKey) {
      return { apiKey: envKey, source: "env", baseUrl, model, updatedAt: null };
    }

    const stored = secrets.providers[providerId];
    if (stored?.apiKey?.trim()) {
      return { apiKey: stored.apiKey.trim(), source: "stored", baseUrl, model, updatedAt: stored.updatedAt || null };
    }

    return { apiKey: null, source: "unset", baseUrl, model, updatedAt: override?.updatedAt || null };
  }

  saveProvider(input: ByokSaveInput): ByokSettingsSnapshot {
    const meta = PROVIDER_METAS.find((m) => m.id === input.providerId);
    if (!meta) throw new Error(`Unknown provider: ${input.providerId}`);

    const now = new Date().toISOString();
    // Wipe protection: empty apiKey string does NOT overwrite an existing stored secret.
    if (typeof input.apiKey === "string" && input.apiKey.trim().length > 0 && input.providerId !== "stub") {
      const secrets = this.readSecrets();
      secrets.providers[input.providerId] = {
        apiKey: input.apiKey.trim(),
        updatedAt: now
      };
      this.writeSecrets(secrets);
    }

    const config = this.readConfig();
    if (input.baseUrl !== undefined || input.model !== undefined) {
      const prev = config.overrides?.[input.providerId] ?? {};
      const nextBaseUrl = input.baseUrl !== undefined ? normalizeBaseUrl(input.baseUrl.trim() || meta.defaultBaseUrl) : prev.baseUrl;
      const nextModel = input.model !== undefined ? input.model.trim() || meta.defaultModel : prev.model;
      config.overrides = {
        ...config.overrides,
        [input.providerId]: {
          baseUrl: nextBaseUrl,
          model: nextModel,
          updatedAt: now
        }
      };
    }
    if (input.activeImageProvider) config.activeImageProvider = input.activeImageProvider;
    if (input.activeVideoProvider) config.activeVideoProvider = input.activeVideoProvider;
    this.writeConfig(config);

    return this.getSnapshot();
  }

  setActiveProviders(input: { activeImageProvider?: ByokImageProviderId; activeVideoProvider?: ByokVideoProviderId }): ByokSettingsSnapshot {
    const config = this.readConfig();
    if (input.activeImageProvider) config.activeImageProvider = input.activeImageProvider;
    if (input.activeVideoProvider) config.activeVideoProvider = input.activeVideoProvider;
    this.writeConfig(config);
    return this.getSnapshot();
  }

  clearProviderKey(providerId: ByokProviderId): ByokSettingsSnapshot {
    const secrets = this.readSecrets();
    if (secrets.providers[providerId]) {
      delete secrets.providers[providerId];
      this.writeSecrets(secrets);
    }
    return this.getSnapshot();
  }

  async testProvider(providerId: ByokProviderId, candidateKey?: string): Promise<ByokTestResult> {
    const startedAt = Date.now();
    const resolved = this.resolveCredentials(providerId);
    const apiKey = candidateKey?.trim() || resolved.apiKey;

    if (providerId === "stub") {
      return {
        ok: true,
        providerId,
        latencyMs: Date.now() - startedAt,
        message: "Local offline stub generator is ready (no API key required)."
      };
    }

    if (!apiKey) {
      return {
        ok: false,
        providerId,
        latencyMs: Date.now() - startedAt,
        message: "API Key is not configured yet."
      };
    }

    try {
      if (providerId === "elevenlabs") {
        const res = await fetch(`${resolved.baseUrl}/v1/voices?show_legacy=true`, {
          headers: { "xi-api-key": apiKey },
          signal: AbortSignal.timeout(10_000)
        });
        if (!res.ok) {
          return {
            ok: false,
            providerId,
            latencyMs: Date.now() - startedAt,
            message: res.status === 401 || res.status === 403 ? "Invalid ElevenLabs API key." : `ElevenLabs HTTP ${res.status}`
          };
        }
        const body = (await res.json().catch(() => ({}))) as { voices?: unknown[] };
        const count = Array.isArray(body.voices) ? body.voices.length : 0;
        return {
          ok: true,
          providerId,
          latencyMs: Date.now() - startedAt,
          message: `Connected to ElevenLabs (${count} voices available).`
        };
      }

      if (providerId === "openai") {
        const res = await fetch(`${resolved.baseUrl}/models`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(10_000)
        });
        if (!res.ok) {
          return {
            ok: false,
            providerId,
            latencyMs: Date.now() - startedAt,
            message: res.status === 401 ? "Invalid OpenAI API key." : `OpenAI HTTP ${res.status}`
          };
        }
        return {
          ok: true,
          providerId,
          latencyMs: Date.now() - startedAt,
          message: `Connected to OpenAI (${resolved.model}).`
        };
      }

      if (providerId === "gemini") {
        const res = await fetch(`${resolved.baseUrl}/models?key=${encodeURIComponent(apiKey)}&pageSize=5`, {
          signal: AbortSignal.timeout(10_000)
        });
        if (!res.ok) {
          return {
            ok: false,
            providerId,
            latencyMs: Date.now() - startedAt,
            message: res.status === 400 || res.status === 403 ? "Invalid Gemini API key." : `Gemini HTTP ${res.status}`
          };
        }
        return {
          ok: true,
          providerId,
          latencyMs: Date.now() - startedAt,
          message: `Connected to Google Gemini (${resolved.model}).`
        };
      }

      if (providerId === "kie") {
        const probeUrl = new URL("/api/v1/jobs/recordInfo", resolved.baseUrl);
        probeUrl.searchParams.set("taskId", "mkboard_key_probe");
        const res = await fetch(probeUrl.toString(), {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(10_000)
        });
        const raw = (await res.json().catch(() => ({}))) as { code?: number; msg?: string; message?: string };
        if (res.status === 401 || res.status === 403 || raw.code === 401 || raw.code === 403) {
          return {
            ok: false,
            providerId,
            latencyMs: Date.now() - startedAt,
            message: String(raw.msg || raw.message || "Invalid KIE API key.")
          };
        }
        return {
          ok: true,
          providerId,
          latencyMs: Date.now() - startedAt,
          message: "Connected to KIE AI endpoint (GPT-Image-2 & Seedance 2.0 ready)."
        };
      }

      return { ok: false, providerId, latencyMs: Date.now() - startedAt, message: "Unsupported provider." };
    } catch (error) {
      return {
        ok: false,
        providerId,
        latencyMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private buildProviderStatus(meta: ProviderMeta, secrets: StoredSecretsFile, config: StoredByokConfigFile): ByokProviderStatus {
    const resolved = this.resolveCredentials(meta.id);
    const configured = meta.id === "stub" ? true : Boolean(resolved.apiKey);
    return {
      id: meta.id,
      name: meta.name,
      category: meta.category,
      configured,
      source: resolved.source,
      maskedKey: meta.id === "stub" ? "built-in" : resolved.apiKey ? maskApiKey(resolved.apiKey) : null,
      envVarName: meta.envKeys[1] || meta.envKeys[0] || "",
      baseUrl: resolved.baseUrl,
      model: resolved.model,
      docsUrl: meta.docsUrl,
      updatedAt: resolved.updatedAt ?? secrets.providers[meta.id]?.updatedAt ?? config.overrides?.[meta.id]?.updatedAt ?? null
    };
  }

  private resolveActiveImageProvider(providers: ByokProviderStatus[], config: StoredByokConfigFile): ByokImageProviderId {
    const preferred = config.activeImageProvider;
    if (preferred && providers.some((p) => p.id === preferred && p.configured)) return preferred;
    for (const candidate of ["kie", "openai", "gemini"] as const) {
      if (providers.some((p) => p.id === candidate && p.configured)) return candidate;
    }
    return preferred ?? "kie";
  }

  private resolveActiveVideoProvider(providers: ByokProviderStatus[], config: StoredByokConfigFile): ByokVideoProviderId {
    const preferred = config.activeVideoProvider;
    if (preferred && providers.some((p) => p.id === preferred && p.configured)) return preferred;
    if (providers.some((p) => p.id === "kie" && p.configured)) return "kie";
    return preferred ?? "kie";
  }

  private readSecrets(): StoredSecretsFile {
    if (!existsSync(this.secretsPath)) return { version: 1, providers: {} };
    try {
      const parsed = JSON.parse(readFileSync(this.secretsPath, "utf8")) as Partial<StoredSecretsFile>;
      return {
        version: 1,
        providers: parsed.providers && typeof parsed.providers === "object" ? parsed.providers : {}
      };
    } catch {
      return { version: 1, providers: {} };
    }
  }

  private writeSecrets(secrets: StoredSecretsFile): void {
    mkdirSync(this.secretsDir, { recursive: true, mode: 0o700 });
    try {
      if (process.platform !== "win32") chmodSync(this.secretsDir, 0o700);
    } catch {
      // Ignore chmod issues on restricted filesystems.
    }
    writeJsonAtomic(this.secretsPath, secrets, 0o600);
  }

  private readConfig(): StoredByokConfigFile {
    if (!existsSync(this.configPath)) return { version: 1 };
    try {
      const parsed = JSON.parse(readFileSync(this.configPath, "utf8")) as Partial<StoredByokConfigFile>;
      return {
        version: 1,
        activeImageProvider: parsed.activeImageProvider,
        activeVideoProvider: parsed.activeVideoProvider,
        overrides: parsed.overrides && typeof parsed.overrides === "object" ? parsed.overrides : {}
      };
    } catch {
      return { version: 1 };
    }
  }

  private writeConfig(config: StoredByokConfigFile): void {
    writeJsonAtomic(this.configPath, config, 0o600);
  }
}

export function maskApiKey(rawKey: string): string {
  const key = rawKey.trim();
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

export function assertSafeRemoteMediaUrl(rawUrl: string): URL {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`Blocked unsafe media URL scheme: ${parsed.protocol}`);
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host === "[::1]" ||
    host.startsWith("127.") ||
    host.startsWith("169.254.") ||
    host.endsWith(".internal")
  ) {
    throw new Error(`Blocked loopback/link-local media URL: ${host}`);
  }
  return parsed;
}

function firstNonEmptyEnv(env: NodeJS.ProcessEnv, keys: string[]): string | null {
  for (const key of keys) {
    const val = env[key]?.trim();
    if (val) return val;
  }
  return null;
}

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function writeJsonAtomic(filePath: string, data: unknown, mode: number): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(data, null, 2)}\n`, { encoding: "utf8", mode });
  try {
    if (process.platform !== "win32") chmodSync(tempPath, mode);
    renameSync(tempPath, filePath);
  } catch (error) {
    rmSync(tempPath, { force: true });
    throw error;
  }
}
