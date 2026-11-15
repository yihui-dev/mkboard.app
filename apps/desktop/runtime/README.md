# Bundled HyperFrames runtime

`runtime-sources.json` is the source of truth for every bundled component.
Builds stage one target at a time into the ignored `runtime/current` directory:

```bash
pnpm --filter @mkboard/desktop run runtime:stage:mac
pnpm --filter @mkboard/desktop run runtime:stage:win
```

The staging command downloads pinned archives, verifies SHA-256 before
extraction, installs HyperFrames from the committed npm lock, excludes ONNX
and unsupported platform binaries, builds a GPL/libx264 FFmpeg without
`--enable-nonfree`, and writes a packaged `manifest.json` with critical-file
hashes.

Windows staging requires a native Windows x64 MSYS2/MINGW64 toolchain. Public
Windows packaging requires the native runner receipt and validation gates.
Authenticode signing is preferred; an unsigned Internal package is publishable
only with the explicit `--allow-unsigned-windows` release override.
