import { existsSync, readFileSync } from "node:fs";

export function parseEnvText(text) {
  const entries = new Map();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    entries.set(match[1], value);
  }
  return entries;
}

export function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return new Map();
  return parseEnvText(readFileSync(filePath, "utf8"));
}

export function mergedEnvFromFiles(files) {
  const merged = {};
  for (const file of files) {
    for (const [key, value] of parseEnvFile(file)) merged[key] = value;
  }
  return { ...merged, ...process.env };
}
