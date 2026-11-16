const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { createReadStream } = require("node:fs");
const fs = require("node:fs/promises");
const path = require("node:path");

module.exports = async function afterPack(context) {
  const macSigned = process.env.MKBOARD_MAC_SIGN === "1";
  const darwinArch = context.arch === 1 ? "x64" : "arm64";
  const expectedTarget =
    context.electronPlatformName === "darwin"
      ? `darwin-${darwinArch}`
      : context.electronPlatformName === "win32"
        ? "win32-x64"
        : null;

  if (expectedTarget) {
    const runtimeRoot = path.join(
      context.appOutDir,
      context.electronPlatformName === "darwin" ? "MkBoard.app/Contents/Resources/runtime" : "resources/runtime"
    );
    const manifestPath = path.join(runtimeRoot, "manifest.json");
    const hasManifest = await fs.access(manifestPath).then(
      () => true,
      () => false
    );
    if (!hasManifest) {
      if (context.electronPlatformName === "darwin" && !macSigned) {
        adHocSignMacBundle(path.join(context.appOutDir, "MkBoard.app"));
      }
      if (context.electronPlatformName === "win32") {
        await fs.rm(path.join(context.appOutDir, "resources", "app.asar.unpacked", "node_modules", "fsevents"), {
          recursive: true,
          force: true
        });
      }
      return;
    }

    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    if (manifest.target !== expectedTarget) {
      throw new Error(`Bundled runtime target mismatch: expected ${expectedTarget}, got ${manifest.target}`);
    }
    const onnxPath = path.join(runtimeRoot, "hyperframes", "node_modules", "onnxruntime-node");
    try {
      await fs.access(onnxPath);
      throw new Error(`Excluded ONNX runtime was packaged: ${onnxPath}`);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }

    if (context.electronPlatformName === "darwin") {
      const codeSignatureProtected = {};
      for (const [file, unsignedSha256] of Object.entries(manifest.integrity || {})) {
        if (!(await isMachO(path.join(runtimeRoot, file)))) continue;
        codeSignatureProtected[file] = unsignedSha256;
        delete manifest.integrity[file];
      }
      for (const file of [manifest.executables?.browser, manifest.executables?.ffmpeg, manifest.executables?.ffprobe]) {
        if (!file || !codeSignatureProtected[file]) {
          throw new Error(`Expected a code-signed macOS runtime executable: ${file || "<missing>"}`);
        }
      }
      await packMacHyperframesRuntime(runtimeRoot, manifest, codeSignatureProtected);
      manifest.codeSignatureProtected = codeSignatureProtected;
      await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      if (!macSigned) {
        adHocSignMacBundle(path.join(context.appOutDir, "MkBoard.app"));
      }
    }
  }

  if (context.electronPlatformName !== "win32") return;

  await fs.rm(path.join(context.appOutDir, "resources", "app.asar.unpacked", "node_modules", "fsevents"), {
    recursive: true,
    force: true
  });
};

async function packMacHyperframesRuntime(runtimeRoot, manifest, codeSignatureProtected) {
  const hyperframesRoot = path.join(runtimeRoot, "hyperframes");
  const asarPath = path.join(runtimeRoot, "hyperframes.asar");
  const asar = loadAsar();

  await asar.createPackageWithOptions(hyperframesRoot, asarPath, {
    unpackDir: "node_modules/{@img,@esbuild}/**"
  });
  await fs.rm(hyperframesRoot, { recursive: true, force: true });

  for (const file of Object.keys(manifest.integrity || {})) {
    if (file.startsWith("hyperframes/")) delete manifest.integrity[file];
  }
  manifest.integrity["hyperframes.asar"] = await sha256(asarPath);

  for (const [file, unsignedSha256] of Object.entries(codeSignatureProtected)) {
    if (!file.startsWith("hyperframes/")) continue;
    delete codeSignatureProtected[file];
    codeSignatureProtected[`hyperframes.asar.unpacked/${file.slice("hyperframes/".length)}`] = unsignedSha256;
  }

  manifest.executables.hyperframesCli = "hyperframes.asar/node_modules/hyperframes/dist/cli.js";
}

function loadAsar() {
  const desktopRoot = path.resolve(__dirname, "..");
  const electronBuilderPackage = require.resolve("electron-builder/package.json", { paths: [desktopRoot] });
  return require(require.resolve("@electron/asar", { paths: [path.dirname(electronBuilderPackage)] }));
}

async function sha256(file) {
  const hash = createHash("sha256");
  await new Promise((resolvePromise, reject) => {
    const stream = createReadStream(file);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("end", resolvePromise);
    stream.once("error", reject);
  });
  return hash.digest("hex");
}

async function isMachO(file) {
  const handle = await fs.open(file, "r");
  try {
    const header = Buffer.alloc(4);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (bytesRead !== header.length) return false;
    return new Set([
      0xfeedface,
      0xcefaedfe,
      0xfeedfacf,
      0xcffaedfe,
      0xcafebabe,
      0xbebafeca,
      0xcafebabf,
      0xbfbafeca
    ]).has(header.readUInt32BE(0));
  } finally {
    await handle.close();
  }
}

function adHocSignMacBundle(appBundlePath) {
  if (process.platform !== "darwin") return;
  const res = spawnSync("codesign", ["--force", "--deep", "--sign", "-", appBundlePath], { stdio: "inherit" });
  if (res.error) throw res.error;
  if (res.status !== 0) throw new Error(`Ad-hoc codesign failed with exit code ${res.status}`);
}
