import { spawn } from "node:child_process";
import net from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pnpmBin = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const children = new Set();
let shuttingDown = false;

main().catch((error) => {
  console.error(`[dev] ${error instanceof Error ? error.message : String(error)}`);
  shutdown(1);
});

async function main() {
  process.on("SIGINT", () => shutdown(130));
  process.on("SIGTERM", () => shutdown(143));

  console.log("[dev] Starting MkBoard Open-Source local workspace (Desktop + Web Docs)...");

  if (!(await isPortOpen(4321))) {
    startService("Web", "@mkboard/web", false);
  } else {
    console.log("[dev] Web port 4321 already open; reusing.");
  }

  if (await isPortOpen(5173)) {
    console.log("[dev] Desktop Vite port 5173 already open; assuming Desktop is running.");
  } else {
    startService("Desktop", "@mkboard/desktop", true);
  }
}

function startService(name, filter, required) {
  const env = { ...process.env, FORCE_COLOR: process.env.FORCE_COLOR ?? "1" };
  const child = spawn(pnpmBin, ["--filter", filter, "dev"], {
    cwd: rootDir,
    env,
    shell: process.platform === "win32",
    stdio: "inherit"
  });
  children.add(child);
  child.on("exit", (code) => {
    children.delete(child);
    if (shuttingDown) return;
    if (required || code) shutdown(code ?? 1);
  });
}

function isPortOpen(port) {
  return Promise.any([probePort(port, "127.0.0.1"), probePort(port, "::1")]).catch(() => false);
}

function probePort(port, host) {
  return new Promise((res, rej) => {
    const socket = net.createConnection({ host, port });
    socket.once("connect", () => { socket.destroy(); res(true); });
    socket.once("error", () => { socket.destroy(); rej(); });
    socket.setTimeout(800, () => { socket.destroy(); rej(); });
  });
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(code), 1000).unref();
  if (children.size === 0) process.exit(code);
}
