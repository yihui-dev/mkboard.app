import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { localCliSpawnEnv } from "./codex-auth";
import { bundledRuntimeSpawnEnv, resolveBundledRuntime } from "./bundled-runtime";
import { runManagedProcess } from "./managed-process";
import type { StoryboardVideoGenerationProgress } from "../shared";

type ExecResult = {
  code: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
};

export type SmartCoverExtractionResult = {
  posterPath: string | null;
  score: number;
  timestampSec: number;
};

const SAMPLE_WIDTH = 96;
const SAMPLE_HEIGHT = 54;
const SAMPLE_BYTES = SAMPLE_WIDTH * SAMPLE_HEIGHT * 3;

function resolveFfmpegExecution(): { ffmpegBin: string; ffprobeBin: string; runtimeEnv: NodeJS.ProcessEnv } {
  const baseEnv = localCliSpawnEnv();
  try {
    const runtime = resolveBundledRuntime();
    return {
      ffmpegBin: runtime.ffmpegBin,
      ffprobeBin: runtime.ffprobeBin,
      runtimeEnv: bundledRuntimeSpawnEnv(runtime, baseEnv)
    };
  } catch {
    return {
      ffmpegBin: process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg",
      ffprobeBin: process.platform === "win32" ? "ffprobe.exe" : "ffprobe",
      runtimeEnv: baseEnv
    };
  }
}

/**
 * Scores a 96x54 RGB24 buffer for suitability as a project cover thumbnail.
 * Heavily penalizes blank/flat white or black intro frames (e.g. fade-ins or empty wireframes)
 * and rewards crisp central typography, UI cards, charts, or human subjects.
 */
export function scoreRgb24CoverSample(buf: Buffer, width = SAMPLE_WIDTH, height = SAMPLE_HEIGHT): number {
  const pixelCount = width * height;
  if (buf.length < pixelCount * 3) return -1;

  const lum = new Float32Array(pixelCount);
  const sat = new Float32Array(pixelCount);
  const hist = new Uint32Array(16);

  let sumY = 0;
  let sumSqY = 0;
  let sumSat = 0;

  for (let i = 0; i < pixelCount; i += 1) {
    const off = i * 3;
    const r = buf[off];
    const g = buf[off + 1];
    const b = buf[off + 2];
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const maxC = r > g ? (r > b ? r : b) : g > b ? g : b;
    const minC = r < g ? (r < b ? r : b) : g < b ? g : b;
    const s = maxC - minC;

    lum[i] = y;
    sat[i] = s;
    sumY += y;
    sumSqY += y * y;
    sumSat += s;

    const bin = Math.min(15, Math.max(0, Math.floor(y / 16)));
    hist[bin] += 1;
  }

  // Find dominant background luminance bin (plus immediate neighbor bins)
  let dominantBin = 0;
  let dominantCount = 0;
  for (let b = 0; b < 16; b += 1) {
    if (hist[b] > dominantCount) {
      dominantCount = hist[b];
      dominantBin = b;
    }
  }
  const bgCenterY = dominantBin * 16 + 8;

  let activePixels = 0;
  let centerActivePixels = 0;
  let centerTotalPixels = 0;

  const xMin = Math.floor(width * 0.18);
  const xMax = Math.ceil(width * 0.82);
  const yMin = Math.floor(height * 0.18);
  const yMax = Math.ceil(height * 0.82);

  for (let py = 0; py < height; py += 1) {
    const inCenterY = py >= yMin && py < yMax;
    for (let px = 0; px < width; px += 1) {
      const idx = py * width + px;
      const isForeground = Math.abs(lum[idx] - bgCenterY) > 18 || sat[idx] > 26;
      const inCenter = inCenterY && px >= xMin && px < xMax;
      if (inCenter) centerTotalPixels += 1;
      if (isForeground) {
        activePixels += 1;
        if (inCenter) centerActivePixels += 1;
      }
    }
  }

  // Spatial edge gradient (weighted toward central 64% viewport)
  let edgeAccum = 0;
  let edgeWeightSum = 0;
  for (let py = 0; py < height - 1; py += 1) {
    const inCenterY = py >= yMin && py < yMax;
    for (let px = 0; px < width - 1; px += 1) {
      const idx = py * width + px;
      const gx = Math.abs(lum[idx + 1] - lum[idx]);
      const gy = Math.abs(lum[idx + width] - lum[idx]);
      const weight = inCenterY && px >= xMin && px < xMax ? 1.75 : 0.75;
      edgeAccum += (gx + gy) * weight;
      edgeWeightSum += weight;
    }
  }

  const activeRatio = activePixels / pixelCount;
  const centerActiveRatio = centerTotalPixels > 0 ? centerActivePixels / centerTotalPixels : activeRatio;
  const meanY = sumY / pixelCount;
  const varianceY = Math.max(0, sumSqY / pixelCount - meanY * meanY);
  const stdY = Math.sqrt(varianceY);
  const meanSat = sumSat / pixelCount;
  const meanEdge = edgeWeightSum > 0 ? edgeAccum / edgeWeightSum : 0;

  // Coverage utility: 0 when blank (<2%), ramps smoothly up to ~1.0 around 18%+ foreground coverage
  const effectiveCoverage = Math.max(activeRatio, centerActiveRatio * 0.9);
  if (effectiveCoverage < 0.015 && meanEdge < 2.2) {
    return 0.5; // Essentially blank white / black screen
  }

  let coverageFactor = Math.min(1, effectiveCoverage / 0.16);
  if (effectiveCoverage < 0.045) {
    // Faint wireframe / single tiny icon fade-in penalty
    coverageFactor *= 0.35;
  }

  const edgeScore = Math.min(45, meanEdge * 2.4);
  const contrastScore = Math.min(28, stdY * 0.52);
  const colorScore = Math.min(15, meanSat * 0.22);
  const centerBonus = Math.min(18, centerActiveRatio * 42);

  return Number(((edgeScore + contrastScore + colorScore + centerBonus) * (0.2 + 0.8 * coverageFactor)).toFixed(3));
}

async function probeDurationSeconds(
  ffprobeBin: string,
  videoPath: string,
  signal: AbortSignal | undefined,
  runtimeEnv: NodeJS.ProcessEnv
): Promise<number> {
  const res = await execCli(
    ffprobeBin,
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", videoPath],
    10_000,
    signal,
    runtimeEnv
  );
  const parsed = Number.parseFloat(res.stdout.trim());
  if (Number.isFinite(parsed) && parsed > 0.05) {
    return parsed;
  }
  return 5.0;
}

function buildCandidateTimestamps(durationSec: number): number[] {
  if (durationSec <= 0.6) return [0];
  // Focus on the front-middle golden window (up to first 14s) so the cover represents the core hook/content,
  // skipping t=0 blank fade-ins and end-of-clip fade-outs.
  const windowEnd = Math.min(durationSec * 0.88, Math.max(Math.min(durationSec * 0.85, 14), Math.min(durationSec * 0.8, 3.6)));
  const minStart = durationSec >= 1.4 ? Math.min(0.65, durationSec * 0.16) : durationSec * 0.15;
  const fractions = [0.18, 0.34, 0.5, 0.68, 0.84];
  const stamps: number[] = [];
  for (const f of fractions) {
    const t = Number(Math.max(minStart, Math.min(durationSec - 0.08, minStart + (windowEnd - minStart) * f)).toFixed(2));
    if (!stamps.some((prev) => Math.abs(prev - t) < 0.18)) {
      stamps.push(t);
    }
  }
  return stamps.length > 0 ? stamps : [0];
}

export async function extractVideoBestCoverFrame(
  videoPath: string,
  posterPath: string,
  signal?: AbortSignal
): Promise<SmartCoverExtractionResult> {
  throwIfAborted(signal);
  const { ffmpegBin, ffprobeBin, runtimeEnv } = resolveFfmpegExecution();

  const durationSec = await probeDurationSeconds(ffprobeBin, videoPath, signal, runtimeEnv);
  throwIfAborted(signal);

  const candidates = buildCandidateTimestamps(durationSec);
  let bestTimestamp = candidates[0] ?? 0;
  let bestScore = -1;

  for (let idx = 0; idx < candidates.length; idx += 1) {
    throwIfAborted(signal);
    const ts = candidates[idx];
    const samplePath = `${posterPath}.sample-${idx}.rgb`;
    rmSync(samplePath, { force: true });
    try {
      await execCli(
        ffmpegBin,
        [
          "-y",
          "-ss",
          String(ts),
          "-i",
          videoPath,
          "-an",
          "-frames:v",
          "1",
          "-vf",
          `scale=${SAMPLE_WIDTH}:${SAMPLE_HEIGHT}:flags=fast_bilinear`,
          "-f",
          "rawvideo",
          "-pix_fmt",
          "rgb24",
          samplePath
        ],
        15_000,
        signal,
        runtimeEnv
      );
      if (existsSync(samplePath)) {
        const raw = readFileSync(samplePath);
        if (raw.length >= SAMPLE_BYTES) {
          // Slight tie-breaker bonus for earlier representative frames when scores are close
          const rawScore = scoreRgb24CoverSample(raw);
          const adjustedScore = rawScore - idx * 0.35;
          if (adjustedScore > bestScore) {
            bestScore = adjustedScore;
            bestTimestamp = ts;
          }
        }
      }
    } finally {
      rmSync(samplePath, { force: true });
    }
  }

  rmSync(posterPath, { force: true });
  const renderArgs = ["-y", "-ss", String(Math.max(0, bestTimestamp)), "-i", videoPath, "-an", "-frames:v", "1", "-q:v", "2", posterPath];
  await execCli(ffmpegBin, renderArgs, 30_000, signal, runtimeEnv);
  throwIfAborted(signal);
  if (isGeneratedPosterReady(posterPath)) {
    return { posterPath, score: Math.max(0, bestScore), timestampSec: bestTimestamp };
  }

  // Fallback to frame 0 if seek failed near EOF on an unusual container
  const fallbackFirst = await extractVideoFirstFrame(videoPath, posterPath, signal);
  return { posterPath: fallbackFirst, score: Math.max(0, bestScore), timestampSec: 0 };
}

export async function extractVideoFirstFrame(
  videoPath: string,
  posterPath: string,
  signal?: AbortSignal
): Promise<string | null> {
  throwIfAborted(signal);
  const { ffmpegBin, runtimeEnv } = resolveFfmpegExecution();

  rmSync(posterPath, { force: true });
  const firstFrameArgs = ["-y", "-ss", "0", "-i", videoPath, "-an", "-frames:v", "1", "-q:v", "2", posterPath];
  await execCli(ffmpegBin, firstFrameArgs, 30_000, signal, runtimeEnv);
  throwIfAborted(signal);
  if (isGeneratedPosterReady(posterPath)) return posterPath;

  rmSync(posterPath, { force: true });
  const fallbackArgs = ["-y", "-i", videoPath, "-an", "-vf", "select=eq(n\\,0)", "-frames:v", "1", "-q:v", "2", posterPath];
  await execCli(ffmpegBin, fallbackArgs, 45_000, signal, runtimeEnv);
  throwIfAborted(signal);
  if (isGeneratedPosterReady(posterPath)) return posterPath;

  return null;
}

export async function extractVideoTailFrame(
  videoPath: string,
  posterPath: string,
  signal?: AbortSignal,
  onProgress?: (progress: StoryboardVideoGenerationProgress) => void
): Promise<string | null> {
  throwIfAborted(signal);
  const { ffmpegBin, runtimeEnv } = resolveFfmpegExecution();

  rmSync(posterPath, { force: true });
  const tailFrameArgs = ["-y", "-sseof", "-2", "-i", videoPath, "-an", "-update", "1", "-q:v", "2", posterPath];
  onProgress?.({
    stage: "render",
    stageLabel: "正在抽取视频尾帧",
    stageDetail: "FFmpeg tail frame",
    cliLog: `$ ${ffmpegBin} ${tailFrameArgs.join(" ")}`
  });
  const result = await execCli(ffmpegBin, tailFrameArgs, 60_000, signal, runtimeEnv);
  throwIfAborted(signal);
  if (isGeneratedPosterReady(posterPath)) return reportPosterReady(posterPath, onProgress);

  rmSync(posterPath, { force: true });
  const fullScanTailFrameArgs = ["-y", "-i", videoPath, "-an", "-update", "1", "-q:v", "2", posterPath];
  onProgress?.({
    stage: "render",
    stageLabel: "正在重试抽取视频尾帧",
    stageDetail: "FFmpeg tail frame fallback",
    cliLog: `$ ${ffmpegBin} ${fullScanTailFrameArgs.join(" ")}`
  });
  const fallbackResult = await execCli(ffmpegBin, fullScanTailFrameArgs, 180_000, signal, runtimeEnv);
  throwIfAborted(signal);
  if (isGeneratedPosterReady(posterPath)) return reportPosterReady(posterPath, onProgress);

  onProgress?.({
    stage: "render",
    stageLabel: "视频尾帧抽取失败",
    stageDetail: "视频仍会导入素材库，但预览会回退到播放器默认画面。",
    cliLog: [formatCliFailure("FFmpeg 抽取尾帧失败", result), formatCliFailure("FFmpeg 尾帧兜底抽取失败", fallbackResult)].join("\n")
  });
  return null;
}

function isGeneratedPosterReady(posterPath: string): boolean {
  return existsSync(posterPath) && statSync(posterPath).size > 0;
}

function reportPosterReady(
  posterPath: string,
  onProgress?: (progress: StoryboardVideoGenerationProgress) => void
): string {
  onProgress?.({
    stage: "render",
    stageLabel: "视频尾帧已生成",
    stageDetail: posterPath
  });
  return posterPath;
}

function execCli(bin: string, args: string[], timeoutMs: number, signal: AbortSignal | undefined, env: NodeJS.ProcessEnv): Promise<ExecResult> {
  if (!bin.trim()) {
    return Promise.resolve({
      code: 1,
      stdout: "",
      stderr: "本机 CLI 可执行文件路径为空。请检查 PATH。",
      error: new Error("Local CLI executable is empty")
    });
  }
  return runManagedProcess(bin, args, { timeoutMs, maxBuffer: 10 * 1024 * 1024, signal, env });
}

function formatCliFailure(prefix: string, result: ExecResult): string {
  const output = [result.stderr, result.stdout].map((value) => value.trim()).filter(Boolean).join("\n").trim();
  return output ? `${prefix}：${output.slice(-1200)}` : `${prefix}，退出码：${result.code ?? "unknown"}。`;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error("视频生成已中止。");
  error.name = "AbortError";
  throw error;
}
