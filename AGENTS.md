# MkBoard Contributor & Agent Guide

MkBoard is an open-source (Apache-2.0), local-first AI storyboard studio with zero backend dependencies and Bring-Your-Own-Key (BYOK) media generation.

## Workspace Layout

- `apps/desktop`: Electron + React + SQLite desktop application, built-in Web Companion server (`/api/rpc`, `/api/events`, `/mcp`), local BYOK media engine, Cloudflare R2 cloud sync client, and stdio/HTTP MCP bridge.
- `apps/mobile`: React Native + Expo mobile storyboard review app (Android/iOS, foldable & landscape split-view support, managed with independent flat `node_modules` for Android Gradle compatibility).
- `apps/sync-worker`: Self-hosted Cloudflare Worker + R2 storyboard sync service (zero database, sha256 blob dedup, R2 multipart upload, HTTP 206 Range streaming).
- `apps/web`: Astro public documentation and download site.
- `packages/`: Shared workspace packages.

## Core Principles

1. **100% Local & BYOK**: All projects, scripts, storyboard shots, and assets live locally in SQLite and on-disk folders. Never introduce mandatory cloud accounts, telemetry, payment logic, or private signing identities.
2. **Multi-Agent CLI & MCP Parity**: CLI agent definitions live in `apps/desktop/src/main/agent-registry.ts` (extensible via `~/.mkboard/agents.local.json`). Sidebar `AgentOperation` writes and MCP tools must share validation and execution boundaries.
3. **Unsigned Out-of-the-Box Packaging**: Desktop builds (`dist:mac:oss`, `dist:win:oss`, `dist:linux`) must remain reproducible with `CSC_IDENTITY_AUTO_DISCOVERY=false` and zero private certificates.

## Verification Commands

- `pnpm typecheck`
- `pnpm build`
- `TMPDIR=/tmp pnpm --filter @mkboard/desktop test`
- `TMPDIR=/tmp pnpm --filter @mkboard/desktop run test:mcp-bridge`
