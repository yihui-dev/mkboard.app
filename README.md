# MkBoard — Open-Source Local-First AI Storyboard & Video Studio

**100% Local-First · Bring Your Own Key (BYOK) · Multi-Agent CLI · Multi-Device Web Companion**

[**Download Installers (macOS / Windows / Linux)**](https://mkboard.app/download) · [**GitHub Releases**](https://github.com/yihui-dev/mkboard.app/releases/latest) · [**Documentation**](https://mkboard.app/docs/intro)

MkBoard turns scripts into structured storyboards, visual keyframes, voiceovers, and rendered motion/AI videos — running entirely on your machine with **zero cloud lock-in, zero credit packs, and zero mandatory backend**.

---

## Highlights / 核心特性

1. **Zero Cloud Lock-In & Pure BYOK (无云端绑定、纯本地自带 Key)**
   - Projects, scripts, storyboards, SQLite metadata, and media assets live in `~/Documents/MkBoard Projects`.
   - Bring your own API keys (`KIE_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `ELEVENLABS_API_KEY`) stored locally with `0600` permissions or passed via environment variables. No MkBoard account, subscription, or credit pack required.

2. **Declarative Multi-Agent CLI & MCP Bridge (多 Agent 连接与双向 MCP)**
   - Native support for **Codex CLI**, **Claude Code**, **Antigravity** (`agy`), **OpenCode**, **Cursor Agent**, **Kimi CLI**, plus custom agents via `~/.mkboard/agents.local.json`.
   - Inline Agent Composer controls for switching **Agent / Model / Effort**, **Supervised vs Auto-Apply** write permissions, and one-click **MCP** setup (stdio + Streamable HTTP `/mcp`).

3. **Multi-Platform & Multi-Surface Companion (多端桌面 + 局域网/iPad 浏览器协同)**
   - Desktop builds for **macOS (Apple Silicon & Intel)**, **Windows (x64)**, and **Linux (AppImage & deb)** — unsigned out-of-the-box so forks and CI require zero signing secrets.
   - Built-in **Web Companion Server** exposes the full Storyboard UI over `127.0.0.1`, LAN (`192.168.x.x`), or Tailscale (`100.x.y.z`) with one-scan QR / `#token=` pairing for iPad, mobile, or headless workstations.

---

## Quick Start / 快速上手

```bash
pnpm install

# Launch Electron Desktop Studio
pnpm --filter @mkboard/desktop dev

# Or run Standalone Headless + Browser Web Companion (no Electron required!)
pnpm --filter @mkboard/desktop start:web
```

## Packaging Unsigned Installers (Zero Secrets Required)

```bash
# macOS (.dmg)
CSC_IDENTITY_AUTO_DISCOVERY=false pnpm --filter @mkboard/desktop run dist:mac:oss

# Linux (.AppImage + .deb)
CSC_IDENTITY_AUTO_DISCOVERY=false pnpm --filter @mkboard/desktop run dist:linux

# Windows (.exe NSIS)
CSC_IDENTITY_AUTO_DISCOVERY=false pnpm --filter @mkboard/desktop run dist:win:oss
```

> **macOS Signing & Gatekeeper**: Official macOS installers on [GitHub Releases](https://github.com/yihui-dev/mkboard.app/releases/latest) are Apple Developer ID signed and notarized. Community builds compiled from source are unsigned by default (`identity: null`); if building locally without an Apple certificate, run `xattr -cr /Applications/MkBoard.app` on first launch.

## License

Apache-2.0. See [LICENSE](./LICENSE).
