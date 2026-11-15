# MkBoard Open-Source Architecture

MkBoard is a 100% local-first, Bring-Your-Own-Key (BYOK) AI storyboard studio released under Apache-2.0.

## Core Modules

1. **Local SQLite & Asset Engine (`apps/desktop/src/main/database.ts`)**
   - Stores projects, rich-text scripts, storyboard shots, templates, and media metadata locally.
   - Automatically resolves project card covers (`video-first-frame` via FFmpeg cached in `assets/.covers/`, or `broll-image` from the first B-Roll shot).
2. **Local BYOK Media Engine (`apps/desktop/src/main/byok-store.ts`, `local-ai-media.ts`)**
   - Stores provider API keys locally (`0o600` permissions) or reads standard environment variables (`OPENAI_API_KEY`, `GEMINI_API_KEY`, `KIE_API_KEY`, `ELEVENLABS_API_KEY`).
   - Connects directly from the user's device to OpenAI, Google Gemini, KIE, and ElevenLabs with zero cloud proxy or credit fees.
3. **Web & Mobile Companion (`apps/desktop/src/main/companion-server.ts`)**
   - Exposes `/api/rpc`, `/api/events` (SSE), `/api/upload`, `/api/assets/:id`, and `/mcp` (Streamable HTTP JSON-RPC 2.0) with optional LAN token & QR code pairing.
4. **Multi-Agent CLI Registry & MCP Server (`apps/desktop/src/main/agent-registry.ts`, `mcp-server.ts`)**
   - Supports Codex CLI, Claude Code, Gemini CLI, OpenCode, and custom CLI definitions (`~/.mkboard/agents.local.json`), alongside stdio and HTTP MCP tools.
