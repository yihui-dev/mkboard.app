import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopDir = join(scriptDir, "..");
const repoDir = resolve(desktopDir, "..", "..");

test("open-source electron-builder config defaults to unsigned builds with no private signing identity", () => {
  const builderConfig = readFileSync(join(desktopDir, "electron-builder.yml"), "utf8");
  assert.equal(builderConfig.includes("windows-sign"), false);
  assert.match(builderConfig, /identity:\s*null/u);
  assert.match(builderConfig, /hardenedRuntime:\s*false/u);
  assert.match(builderConfig, /notarize:\s*false/u);
  assert.match(builderConfig, /signAndEditExecutable:\s*false/u);
  assert.match(builderConfig, /linux:/u);
});

test("macOS signing and CI files never hardcode personal Developer IDs, Team IDs, or private keys", () => {
  const auditedFiles = [
    join(desktopDir, "electron-builder.yml"),
    join(desktopDir, "package.json"),
    join(desktopDir, "resources/entitlements.mac.plist"),
    join(desktopDir, "resources/entitlements.mac.inherit.plist"),
    join(desktopDir, "scripts/after-pack.cjs"),
    join(desktopDir, "scripts/notarize-mac.cjs"),
    join(desktopDir, "scripts/pack-mac.mjs"),
    join(repoDir, ".github/workflows/release.yml")
  ];

  for (const filePath of auditedFiles) {
    const content = readFileSync(filePath, "utf8");
    // Ensure no literal certificate common name (excluding redaction placeholder)
    const devIdMatches = (content.match(/Developer ID (?:Application|Installer):[^\n\r"'/]+/gu) ?? []).filter((m) => !m.includes("[REDACTED]"));
    assert.deepEqual(devIdMatches, [], `Unexpected signing identity in ${filePath}`);
    // Ensure no PEM private key material
    assert.equal(/-----BEGIN [A-Z ]*PRIVATE KEY-----/u.test(content), false, `Private key material found in ${filePath}`);
    // Ensure entitlements do not embed application-identifier or team-identifier
    if (filePath.endsWith(".plist")) {
      assert.equal(content.includes("com.apple.developer.team-identifier"), false);
      assert.equal(content.includes("com.apple.application-identifier"), false);
    }
  }
});

test("desktop updater defaults to disabled unless MKBOARD_AUTO_UPDATE_BASE_URL is explicitly configured", () => {
  const updaterSource = readFileSync(join(desktopDir, "src/main/desktop-updater.ts"), "utf8");
  const defaultsScript = readFileSync(join(desktopDir, "scripts/write-runtime-defaults.mjs"), "utf8");
  assert.match(defaultsScript, /const autoUpdateBaseUrl = firstEnv\(\["MKBOARD_AUTO_UPDATE_BASE_URL"\], ""\)/u);
  assert.match(updaterSource, /packagedAutoUpdateBaseUrl/u);
});
