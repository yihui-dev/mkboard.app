#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 4 ]]; then
  echo "Usage: build-ffmpeg-windows.sh <ffmpeg.tar.xz> <x264.tar.gz> <output-dir> <work-dir>" >&2
  exit 2
fi

case "$(uname -s)" in
  MINGW*|MSYS*) ;;
  *)
    echo "The Windows FFmpeg runtime must be built in native Windows MSYS2/MINGW64." >&2
    exit 2
    ;;
esac

FFMPEG_ARCHIVE="$1"
X264_ARCHIVE="$2"
OUTPUT_DIR="$3"
WORK_DIR="$4"
PREFIX="$WORK_DIR/prefix"

for command in gcc make nasm pkg-config; do
  command -v "$command" >/dev/null || {
    echo "Missing Windows FFmpeg build dependency: $command" >&2
    exit 3
  }
done

rm -rf "$WORK_DIR" "$OUTPUT_DIR"
mkdir -p "$WORK_DIR/src" "$PREFIX" "$OUTPUT_DIR"
tar -xf "$X264_ARCHIVE" -C "$WORK_DIR/src"
tar -xf "$FFMPEG_ARCHIVE" -C "$WORK_DIR/src"

X264_SRC="$(find "$WORK_DIR/src" -mindepth 1 -maxdepth 1 -type d -name 'x264-*' | head -1)"
FFMPEG_SRC="$(find "$WORK_DIR/src" -mindepth 1 -maxdepth 1 -type d -name 'ffmpeg-*' | head -1)"
JOBS="${MKBOARD_RUNTIME_BUILD_JOBS:-2}"

(
  cd "$X264_SRC"
  ./configure \
    --prefix="$PREFIX" \
    --host=x86_64-w64-mingw32 \
    --enable-static \
    --disable-cli \
    --disable-opencl
  make -j"$JOBS"
  make install
)

(
  cd "$FFMPEG_SRC"
  PKG_CONFIG_PATH="$PREFIX/lib/pkgconfig" ./configure \
    --prefix="$PREFIX" \
    --target-os=mingw32 \
    --arch=x86_64 \
    --cc=gcc \
    --pkg-config-flags=--static \
    --extra-cflags="-I$PREFIX/include" \
    --extra-ldflags="-L$PREFIX/lib -static" \
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
  make -j"$JOBS" ffmpeg.exe ffprobe.exe
  cp ffmpeg.exe ffprobe.exe "$OUTPUT_DIR/"
)

"$OUTPUT_DIR/ffmpeg.exe" -version > "$OUTPUT_DIR/ffmpeg-configure.txt"
grep -q -- '--enable-gpl' "$OUTPUT_DIR/ffmpeg-configure.txt"
grep -q -- '--enable-libx264' "$OUTPUT_DIR/ffmpeg-configure.txt"
if grep -q -- '--enable-nonfree' "$OUTPUT_DIR/ffmpeg-configure.txt"; then
  echo "Refusing to stage a non-redistributable FFmpeg build." >&2
  exit 4
fi
