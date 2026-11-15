#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 4 ]]; then
  echo "Usage: build-ffmpeg-macos.sh <ffmpeg.tar.xz> <x264.tar.gz> <output-dir> <work-dir>" >&2
  exit 2
fi

if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then
  echo "The macOS FFmpeg runtime must be built natively on Apple Silicon." >&2
  exit 2
fi

FFMPEG_ARCHIVE="$1"
X264_ARCHIVE="$2"
OUTPUT_DIR="$3"
WORK_DIR="$4"
PREFIX="$WORK_DIR/prefix"
export MACOSX_DEPLOYMENT_TARGET="${MACOSX_DEPLOYMENT_TARGET:-12.0}"

rm -rf "$WORK_DIR" "$OUTPUT_DIR"
mkdir -p "$WORK_DIR/src" "$PREFIX" "$OUTPUT_DIR"
tar -xf "$X264_ARCHIVE" -C "$WORK_DIR/src"
tar -xf "$FFMPEG_ARCHIVE" -C "$WORK_DIR/src"

X264_SRC="$(find "$WORK_DIR/src" -mindepth 1 -maxdepth 1 -type d -name 'x264-*' | head -1)"
FFMPEG_SRC="$(find "$WORK_DIR/src" -mindepth 1 -maxdepth 1 -type d -name 'ffmpeg-*' | head -1)"
JOBS="${MKBOARD_RUNTIME_BUILD_JOBS:-$(sysctl -n hw.ncpu)}"

if [[ -z "$X264_SRC" || -z "$FFMPEG_SRC" ]]; then
  echo "Unable to locate extracted FFmpeg/x264 sources." >&2
  exit 3
fi

(
  cd "$X264_SRC"
  ./configure \
    --prefix="$PREFIX" \
    --enable-static \
    --disable-cli \
    --disable-opencl \
    --extra-cflags="-mmacosx-version-min=$MACOSX_DEPLOYMENT_TARGET" \
    --extra-ldflags="-mmacosx-version-min=$MACOSX_DEPLOYMENT_TARGET"
  make -j"$JOBS"
  make install
)

(
  cd "$FFMPEG_SRC"
  PKG_CONFIG_PATH="$PREFIX/lib/pkgconfig" ./configure \
    --prefix="$PREFIX" \
    --cc=clang \
    --pkg-config-flags=--static \
    --extra-cflags="-I$PREFIX/include -mmacosx-version-min=$MACOSX_DEPLOYMENT_TARGET" \
    --extra-ldflags="-L$PREFIX/lib -mmacosx-version-min=$MACOSX_DEPLOYMENT_TARGET" \
    --enable-gpl \
    --enable-libx264 \
    --disable-nonfree \
    --disable-autodetect \
    --disable-debug \
    --disable-doc \
    --disable-ffplay \
    --disable-shared \
    --enable-static \
    --disable-indevs \
    --disable-outdevs \
    --enable-indev=lavfi
  make -j"$JOBS" ffmpeg ffprobe
  cp ffmpeg ffprobe "$OUTPUT_DIR/"
)

chmod 755 "$OUTPUT_DIR/ffmpeg" "$OUTPUT_DIR/ffprobe"
"$OUTPUT_DIR/ffmpeg" -version > "$OUTPUT_DIR/ffmpeg-configure.txt"

grep -q -- '--enable-gpl' "$OUTPUT_DIR/ffmpeg-configure.txt"
grep -q -- '--enable-libx264' "$OUTPUT_DIR/ffmpeg-configure.txt"
if grep -q -- '--enable-nonfree' "$OUTPUT_DIR/ffmpeg-configure.txt"; then
  echo "Refusing to stage a non-redistributable FFmpeg build." >&2
  exit 4
fi
