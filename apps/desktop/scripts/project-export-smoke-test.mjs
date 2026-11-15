import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { strFromU8, unzipSync } from "fflate";
import {
  ProjectExportError,
  buildExportFileNameMap,
  collectStoryboardAssetIds,
  serializeStoryboardCsv,
  writeProjectExport
} from "../src/main/project-export.ts";

const scriptDir = dirname(fileURLToPath(import.meta.url));

function createFixture(t) {
  const root = mkdtempSync(join(tmpdir(), "mkboard-project-export-"));
  mkdirSync(join(root, "project"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function makeAsset(id, name, kind = "image") {
  return {
    id,
    name,
    kind,
    sizeLabel: "1 KB",
    localPath: `assets/${name}`,
    indexedPath: `assets/${name}`,
    previewUrl: "",
    linkedShotId: null,
    linkedShot: "",
    importedAt: "2026-07-15T00:00:00.000Z"
  };
}

function makeProject(root, { assets = [], columns = [], rows = [] } = {}) {
  return {
    project: {
      id: "project-1",
      kind: "user",
      name: "Export fixture",
      icon: "folder",
      templateId: "template-1",
      tasteId: "taste-1",
      localPath: join(root, "project"),
      createdAt: "2026-07-15T00:00:00.000Z",
      updatedAt: "2026-07-15T00:00:00.000Z"
    },
    assets,
    columns,
    rows
  };
}

function unzipFile(filePath) {
  return unzipSync(new Uint8Array(readFileSync(filePath)));
}

function assertNoPartialFiles(directory) {
  assert.deepEqual(
    readdirSync(directory).filter((name) => name.includes(".mkboard-partial-")),
    []
  );
}

test("storyboard asset collection deduplicates current references and supports the legacy single id", () => {
  const ids = collectStoryboardAssetIds([
    { id: "row-1", imageAssetIds: [" asset-a ", "asset-b", "asset-a"], imageAssetId: "legacy-ignored" },
    { id: "row-2", imageAssetIds: [], imageAssetId: "legacy-c" },
    { id: "row-3", imageAssetId: "asset-b" }
  ]);

  assert.deepEqual(ids, ["asset-a", "asset-b", "legacy-c"]);
});

test("export file names remove traversal and control characters, protect Windows names, and deduplicate case-insensitively", () => {
  const names = buildExportFileNameMap([
    makeAsset("a", "../CON.txt"),
    makeAsset("b", "scene.png"),
    makeAsset("c", "SCENE.PNG"),
    makeAsset("d", "folder/.."),
    makeAsset("e", "bad\u0000name?.jpg"),
    makeAsset("f", `a.${"x".repeat(300)}`),
    makeAsset("g", `A.${"X".repeat(300)}`)
  ]);

  assert.equal(names.get("a"), "_CON.txt");
  assert.equal(names.get("b"), "scene.png");
  assert.equal(names.get("c"), "SCENE (2).PNG");
  assert.equal(names.get("d"), "asset");
  assert.equal(names.get("e"), "bad-name-.jpg");
  assert.equal([...names.get("f")].length, 180);
  assert.equal([...names.get("g")].length, 180);
  const values = [...names.values()];
  assert.equal(new Set(values.map((name) => name.toLocaleLowerCase("en-US"))).size, values.length);
  for (const name of values) {
    assert.doesNotMatch(name, /[\\/\u0000-\u001f<>:"|?*]/u);
    assert.notEqual(name, ".");
    assert.notEqual(name, "..");
  }
});

test("CSV keeps configured column order, includes hidden columns, writes frame file names, and neutralizes formulas", () => {
  const assets = [makeAsset("asset-a", "frame.png"), makeAsset("asset-b", "FRAME.PNG")];
  const csv = serializeStoryboardCsv({
    assets,
    columns: [
      { id: "sort", label: "排序", type: "text", visible: true },
      { id: "shot", label: "镜号", type: "number", visible: true },
      { id: "image", label: "画面", type: "image", visible: true },
      { id: "scene", label: "类别", type: "text", visible: true },
      { id: "duration", label: "时长", type: "number", visible: false },
      { id: "note", label: "备注,说明", type: "text", visible: true },
      { id: "custom-9", label: "隐藏\"字段", type: "text", visible: false, custom: true }
    ],
    rows: [
      {
        id: "row-1",
        shot: "shot,1",
        scene: "=SUM(A1:A2)",
        duration: "3",
        content: "",
        note: "line 1\r\nline 2",
        imageAssetIds: ["asset-a", "asset-b"],
        customValues: { "custom-9": "+RUN()" }
      }
    ]
  });

  assert.equal(csv.startsWith("\uFEFF"), true);
  assert.equal(csv.endsWith("\r\n"), true);
  assert.match(csv, /^\uFEFF"排序","镜号","画面","类别","时长","备注,说明","隐藏""字段"\r\n/u);
  assert.match(csv, /"frame\.png\nFRAME \(2\)\.PNG"/u);
  assert.match(csv, /"'=SUM\(A1:A2\)"/u);
  assert.match(csv, /"'\+RUN\(\)"/u);
  assert.match(csv, /"line 1\nline 2"/u);
  assert.doesNotMatch(csv, /asset-a|asset-b/u);
});

test("storyboard and all-assets ZIP exports use the same safe names and the correct asset boundaries", async (t) => {
  const root = createFixture(t);
  const assetsDirectory = join(root, "project", "assets");
  mkdirSync(assetsDirectory);
  const assets = [makeAsset("a", "scene.png"), makeAsset("b", "SCENE.PNG"), makeAsset("c", "notes.txt", "document")];
  const sources = new Map([
    ["a", join(root, "project", "..asset.png")],
    ["b", join(assetsDirectory, "b.png")],
    ["c", join(assetsDirectory, "c.txt")]
  ]);
  writeFileSync(sources.get("a"), "first frame");
  writeFileSync(sources.get("b"), "second frame");
  writeFileSync(sources.get("c"), "project notes");
  const project = makeProject(root, {
    assets,
    rows: [
      { id: "row-1", imageAssetIds: ["a", "b", "a"] },
      { id: "row-2", imageAssetIds: [], imageAssetId: "b" }
    ]
  });

  const storyboardDestination = join(root, "storyboard-assets.zip");
  const storyboardResult = await writeProjectExport({
    kind: "storyboard-assets-zip",
    destinationPath: storyboardDestination,
    project,
    resolveAssetSource: (asset) => sources.get(asset.id)
  });
  const storyboardArchive = unzipFile(storyboardDestination);
  assert.equal(storyboardResult.exportedCount, 2);
  assert.deepEqual(Object.keys(storyboardArchive).sort(), ["SCENE (2).PNG", "scene.png"]);
  assert.equal(strFromU8(storyboardArchive["scene.png"]), "first frame");
  assert.equal(strFromU8(storyboardArchive["SCENE (2).PNG"]), "second frame");

  const allDestination = join(root, "all-assets.zip");
  const allResult = await writeProjectExport({
    kind: "all-assets-zip",
    destinationPath: allDestination,
    project,
    resolveAssetSource: (asset) => sources.get(asset.id)
  });
  const allArchive = unzipFile(allDestination);
  assert.equal(allResult.exportedCount, 3);
  assert.deepEqual(Object.keys(allArchive).sort(), ["SCENE (2).PNG", "notes.txt", "scene.png"]);
  assert.equal(strFromU8(allArchive["notes.txt"]), "project notes");
  assertNoPartialFiles(root);
});

test("remote assets are streamed into a ZIP archive", async (t) => {
  const root = createFixture(t);
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/octet-stream" });
    response.write("remote ");
    response.end("asset");
  });
  t.after(() => server.close());
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const sourceUrl = `http://127.0.0.1:${address.port}/remote.bin`;
  const destination = join(root, "remote.zip");
  const asset = makeAsset("remote", "remote.bin", "video");

  await writeProjectExport({
    kind: "all-assets-zip",
    destinationPath: destination,
    project: makeProject(root, { assets: [asset] }),
    resolveAssetSource: () => sourceUrl
  });

  const archive = unzipFile(destination);
  assert.deepEqual(Object.keys(archive), ["remote.bin"]);
  assert.equal(strFromU8(archive["remote.bin"]), "remote asset");
});

test("remote failures preserve an existing destination and remove every partial file", async (t) => {
  const root = createFixture(t);
  const server = createServer((_request, response) => {
    response.writeHead(503);
    response.end("unavailable");
  });
  t.after(() => server.close());
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const destination = join(root, "failed.zip");
  writeFileSync(destination, "previous export");

  await assert.rejects(
    writeProjectExport({
      kind: "all-assets-zip",
      destinationPath: destination,
      project: makeProject(root, { assets: [makeAsset("remote", "remote.bin")] }),
      resolveAssetSource: () => `http://127.0.0.1:${address.port}/failed.bin`
    }),
    (error) => error instanceof ProjectExportError && error.code === "remote-download-failed"
  );

  assert.equal(readFileSync(destination, "utf8"), "previous export");
  assertNoPartialFiles(root);
});

test("local symlinks cannot escape the project directory", async (t) => {
  const root = createFixture(t);
  const outsideRoot = createFixture(t);
  const outsideFile = join(outsideRoot, "outside.png");
  const linkedFile = join(root, "project", "linked.png");
  writeFileSync(outsideFile, "private");
  symlinkSync(outsideFile, linkedFile);
  const destination = join(root, "unsafe.zip");

  await assert.rejects(
    writeProjectExport({
      kind: "all-assets-zip",
      destinationPath: destination,
      project: makeProject(root, { assets: [makeAsset("outside", "outside.png")] }),
      resolveAssetSource: () => linkedFile
    }),
    (error) => error instanceof ProjectExportError && error.code === "asset-outside-project"
  );

  assert.equal(existsSync(destination), false);
  assertNoPartialFiles(root);
});

test("empty ZIP exports fail before creating a destination", async (t) => {
  const root = createFixture(t);
  const destination = join(root, "empty.zip");

  await assert.rejects(
    writeProjectExport({
      kind: "storyboard-assets-zip",
      destinationPath: destination,
      project: makeProject(root)
    }),
    (error) => error instanceof ProjectExportError && error.code === "empty-archive"
  );
  assert.equal(existsSync(destination), false);
  assertNoPartialFiles(root);
});

test("CSV export replaces an existing file only after serialization succeeds and tolerates stale image references", async (t) => {
  const root = createFixture(t);
  const destination = join(root, "storyboard.csv");
  writeFileSync(destination, "previous export");
  const project = makeProject(root, {
    columns: [{ id: "image", label: "画面", type: "image", visible: true }],
    rows: [{ id: "row-1", imageAssetIds: ["missing-asset"] }]
  });

  const result = await writeProjectExport({ kind: "storyboard-csv", destinationPath: destination, project });
  assert.equal(result.exportedCount, 1);
  assert.equal(readFileSync(destination, "utf8").startsWith("\uFEFF\"画面\""), true);
  assertNoPartialFiles(root);
});

test("exports cannot overwrite files inside the MkBoard project directory", async (t) => {
  const root = createFixture(t);
  const destination = join(root, "project", "storyboard.csv");

  await assert.rejects(
    writeProjectExport({
      kind: "storyboard-csv",
      destinationPath: destination,
      project: makeProject(root, {
        columns: [{ id: "shot", label: "镜号", type: "number", visible: true }],
        rows: [{ id: "row-1", shot: "1" }]
      })
    }),
    (error) => error instanceof ProjectExportError && error.code === "unsafe-destination"
  );
  assert.equal(existsSync(destination), false);
});

test("ZIP output-open failures reject normally instead of crashing or leaving a partial", async (t) => {
  const root = createFixture(t);
  const exportDirectory = join(root, "exports");
  mkdirSync(exportDirectory);
  const source = join(root, "project", "source.png");
  writeFileSync(source, "source");
  const destination = join(exportDirectory, "output.zip");

  await assert.rejects(
    writeProjectExport({
      kind: "all-assets-zip",
      destinationPath: destination,
      project: makeProject(root, { assets: [makeAsset("source", "source.png")] }),
      resolveAssetSource: () => {
        rmSync(exportDirectory, { recursive: true, force: true });
        return source;
      }
    })
  );
  assert.equal(existsSync(destination), false);
  assertNoPartialFiles(root);
});

test("main, preload, renderer, and packaging keep one project export contract", () => {
  const mainSource = readFileSync(join(scriptDir, "../src/main/index.ts"), "utf8");
  const preloadSource = readFileSync(join(scriptDir, "../src/preload/index.ts"), "utf8");
  const sharedSource = readFileSync(join(scriptDir, "../src/shared.ts"), "utf8");
  const rendererSource = readFileSync(join(scriptDir, "../src/renderer/src/App.tsx"), "utf8");
  const viteSource = readFileSync(join(scriptDir, "../electron-vite.config.ts"), "utf8");

  assert.match(sharedSource, /ProjectExportKind = "storyboard-csv" \| "storyboard-assets-zip" \| "all-assets-zip"/u);
  assert.match(preloadSource, /exportProject: \(projectId: string, kind: ProjectExportKind/u);
  assert.match(mainSource, /"mkboard:export-project"/u);
  assert.match(mainSource, /dialog\.showSaveDialog/u);
  assert.match(rendererSource, /function ProjectDownloadControl/u);
  assert.match(rendererSource, /function openDownloadFromMore\(\)/u);
  assert.match(rendererSource, /window\.mkboard\.exportProject\(projectId, selectedKind, locale\)/u);
  assert.match(rendererSource, /className="workspace-more-menu-item"[\s\S]*onOpenSettings\(\)/u);
  assert.doesNotMatch(rendererSource, /workspace-settings-button/u);
  assert.match(viteSource, /externalizeDepsPlugin\(\{ exclude: \["fflate"\] \}\)/u);
});
