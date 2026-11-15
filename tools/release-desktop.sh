#!/usr/bin/env bash
set -euo pipefail

# Open-Source local packaging helper (unsigned out-of-the-box).

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
export CSC_IDENTITY_AUTO_DISCOVERY=false

PLATFORM="${1:-mac}"
case "$PLATFORM" in
  mac)
    pnpm --dir "$ROOT_DIR" --filter @mkboard/desktop run dist:mac:oss
    ;;
  mac-bundled)
    pnpm --dir "$ROOT_DIR" --filter @mkboard/desktop run dist:mac
    ;;
  win)
    pnpm --dir "$ROOT_DIR" --filter @mkboard/desktop run dist:win:oss
    ;;
  linux)
    pnpm --dir "$ROOT_DIR" --filter @mkboard/desktop run dist:linux
    ;;
  *)
    echo "Usage: tools/release-desktop.sh [mac|mac-bundled|win|linux]" >&2
    exit 1
    ;;
esac
