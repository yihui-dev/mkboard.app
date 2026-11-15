import { existsSync, rmSync, statSync } from "node:fs";
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

function resolveFfmpegExecution(): { ffmpegBin: string; runtimeEnv: NodeJS.ProcessEnv } {
  const baseEnv = localCliSpawnEnv();
  try {
    const runtime = resolveBundledRuntime();
    return {
      ffmpegBin: runtime.ffmpegBin,
      runtimeEnv: bundledRuntimeSpawnEnv(runtime, baseEnv)
    };
  } catch {
    return {
      ffmpegBin: process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg",
      runtimeEnv: baseEnv
    };
  }
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
