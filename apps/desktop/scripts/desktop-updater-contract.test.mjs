import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopDir = join(scriptDir, "..");

test("open-source electron-builder config defaults to unsigned builds with no private signing identity", () => {
  const builderConfig = readFileSync(join(desktopDir, "electron-builder.yml"), "utf8");
  assert.equal(builderConfig.includes("windows-sign"), false);
  assert.match(builderConfig, /identity:\s*null/u);
  assert.match(builderConfig, /signAndEditExecutable:\s*false/u);
  assert.match(builderConfig, /linux:/u);
});

test("desktop updater defaults to disabled unless MKBOARD_AUTO_UPDATE_BASE_URL is explicitly configured", () => {
  const updaterSource = readFileSync(join(desktopDir, "src/main/desktop-updater.ts"), "utf8");
  const defaultsScript = readFileSync(join(desktopDir, "scripts/write-runtime-defaults.mjs"), "utf8");
  assert.match(defaultsScript, /const autoUpdateBaseUrl = firstEnv\(\["MKBOARD_AUTO_UPDATE_BASE_URL"\], ""\)/u);
  assert.match(updaterSource, /packagedAutoUpdateBaseUrl/u);
});
