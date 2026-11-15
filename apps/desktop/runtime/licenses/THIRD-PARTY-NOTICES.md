# MkBoard bundled video runtime notices

MkBoard ships the following command-line programs as separate processes:

- HyperFrames 0.7.48, Apache License 2.0.
- Chrome Headless Shell 152.0.7928.2. Its complete
  `LICENSE.headless_shell` notice is included beside the browser runtime.
- FFmpeg 7.1.5 built with x264, distributed under GPL version 2 or later.
- x264, distributed under GPL version 2 or later.
- Node.js 22.22.1 on Windows, distributed under the Node.js license and its
  bundled third-party notices.

The corresponding FFmpeg and x264 source archives, their SHA-256 checksums,
and the exact build configuration are included under `licenses/sources` and
`licenses/ffmpeg-configure.txt` in the installed runtime. The same materials
must be mirrored next to public installers before a public release.

Source and license references:

- https://github.com/heygen-com/hyperframes/tree/v0.7.48
- https://googlechromelabs.github.io/chrome-for-testing/
- https://ffmpeg.org/legal.html
- https://ffmpeg.org/releases/ffmpeg-7.1.5.tar.xz
- https://code.videolan.org/videolan/x264
- https://nodejs.org/dist/v22.22.1/

MkBoard does not use an FFmpeg build configured with `--enable-nonfree`.
