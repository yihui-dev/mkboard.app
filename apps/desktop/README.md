# MkBoard Desktop (Open-Source BYOK Edition)

Electron + React + SQLite local-first AI storyboard studio, Web/Mobile Companion server, and MCP server.

## Development

```bash
pnpm install
pnpm --filter @mkboard/desktop dev
```

## Headless Web / Mobile Companion Mode

```bash
pnpm --filter @mkboard/desktop start:web
```

## Local Unsigned Packaging

No Apple Developer ID, notarization credentials, or Windows EV certificates are required:

```bash
pnpm --filter @mkboard/desktop run dist:mac:oss
pnpm --filter @mkboard/desktop run dist:win:oss
pnpm --filter @mkboard/desktop run dist:linux
```
