import { spawn, type ChildProcess } from "node:child_process";

export type ManagedProcessResult = {
  code: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
};

export type ManagedProcessOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  timeoutMs: number;
  maxBuffer?: number;
  onOutput?: (chunk: string, stream: "stdout" | "stderr") => void;
};

export function runManagedProcess(bin: string, args: string[], options: ManagedProcessOptions): Promise<ManagedProcessResult> {
  const maxBuffer = options.maxBuffer ?? 10 * 1024 * 1024;
  if (!bin.trim()) return Promise.resolve({ code: 1, stdout: "", stderr: "可执行文件路径为空。", error: new Error("Executable path is empty") });

  return new Promise((resolveResult) => {
    let stdout = "";
    let stderr = "";
    let processError: Error | undefined;
    let finished = false;
    let timedOut = false;
    let aborted = false;
    const child = spawn(bin, args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });

    const append = (current: string, chunk: string) => {
      const next = current + chunk;
      return next.length > maxBuffer ? next.slice(next.length - maxBuffer) : next;
    };
    child.stdout?.on("data", (chunk) => {
      const value = String(chunk);
      stdout = append(stdout, value);
      options.onOutput?.(value, "stdout");
    });
    child.stderr?.on("data", (chunk) => {
      const value = String(chunk);
      stderr = append(stderr, value);
      options.onOutput?.(value, "stderr");
    });
    child.once("error", (error) => {
      processError = error;
    });

    const abort = () => {
      aborted = true;
      terminateProcessTree(child);
    };
    if (options.signal?.aborted) abort();
    else options.signal?.addEventListener("abort", abort, { once: true });

    const timeout = setTimeout(() => {
      timedOut = true;
      terminateProcessTree(child);
    }, options.timeoutMs);
    timeout.unref?.();

    child.once("close", (code, signalName) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abort);
      if (timedOut) processError = new Error(`Process timed out after ${options.timeoutMs}ms`);
      else if (aborted) {
        processError = new Error("Process aborted");
        processError.name = "AbortError";
      } else if (signalName && !processError) processError = new Error(`Process exited from signal ${signalName}`);
      resolveResult({ code: processError ? 1 : code, stdout, stderr, error: processError });
    });
  });
}

export function terminateProcessTree(child: ChildProcess): void {
  if (child.exitCode !== null || child.killed) return;
  if (process.platform === "win32" && child.pid) {
    const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
      shell: false,
      windowsHide: true,
      stdio: "ignore"
    });
    killer.unref();
    return;
  }

  child.kill("SIGTERM");
  const timer = setTimeout(() => {
    // `child.killed` only means Node successfully sent a signal; it does not
    // mean the process has exited. Escalate if it is still alive after grace.
    if (child.exitCode === null) child.kill("SIGKILL");
  }, 2_000);
  timer.unref?.();
}
