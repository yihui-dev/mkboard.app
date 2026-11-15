// Bundles the stdio MCP server (src/main/mcp/server.ts) into out/mcp/server.cjs.
// It runs outside the Electron main bundle: Claude Code / Codex launch it through the
// `mkboard-mcp` launcher with ELECTRON_RUN_AS_NODE=1. CommonJS keeps it loadable from app.asar.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

await build({
  configFile: false,
  root,
  logLevel: "warn",
  build: {
    ssr: resolve(root, "src/main/mcp/server.ts"),
    outDir: resolve(root, "out/mcp"),
    emptyOutDir: true,
    target: "node20",
    minify: false,
    sourcemap: false,
    rollupOptions: {
      output: { format: "cjs", entryFileNames: "server.cjs" }
    }
  },
  ssr: { target: "node", noExternal: true }
});

console.log("MkBoard MCP server: out/mcp/server.cjs");
