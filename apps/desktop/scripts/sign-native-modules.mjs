#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

if (process.platform !== "darwin") {
  process.exit(0);
}

const require = createRequire(import.meta.url);
const packageJsonPath = require.resolve("better-sqlite3/package.json");
const sqliteNativeModule = join(dirname(packageJsonPath), "build", "Release", "better_sqlite3.node");

if (!existsSync(sqliteNativeModule)) {
  console.warn(`[native-sign] better-sqlite3 native module not found: ${sqliteNativeModule}`);
  process.exit(0);
}

run("codesign", ["--force", "--sign", "-", sqliteNativeModule]);
console.log(`[native-sign] signed ${relativeToDesktop(sqliteNativeModule)}`);

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function relativeToDesktop(path) {
  const desktopRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  return path.startsWith(`${desktopRoot}/`) ? path.slice(desktopRoot.length + 1) : path;
}
