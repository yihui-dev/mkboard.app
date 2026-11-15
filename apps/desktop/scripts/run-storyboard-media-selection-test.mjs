import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import electronPath from "electron";
import { build } from "vite";

const outDir = mkdtempSync(resolve(".tmp-storyboard-media-test-build-"));

try {
  await build({
    configFile: false,
    logLevel: "error",
    build: {
      emptyOutDir: true,
      minify: false,
      outDir,
      sourcemap: "inline",
      ssr: resolve("scripts/storyboard-media-selection-smoke-test.mjs"),
      target: "node24",
      rollupOptions: {
        external: ["better-sqlite3"],
        output: { entryFileNames: "storyboard-media-selection-smoke-test.mjs" }
      }
    }
  });
  execFileSync(electronPath, ["--test", join(outDir, "storyboard-media-selection-smoke-test.mjs")], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    stdio: "inherit"
  });
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
