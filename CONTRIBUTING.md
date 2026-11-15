# Contributing to MkBoard

Thank you for contributing to MkBoard!

## Development Setup

1. Node.js 22+ and `pnpm` 10+
2. `pnpm install`
3. `pnpm --filter @mkboard/desktop dev` (Desktop) or `pnpm --filter @mkboard/desktop start:web` (Browser Companion)

## Verification Before Opening a PR

```bash
pnpm --filter @mkboard/desktop typecheck
pnpm --filter @mkboard/desktop test:agent-operations
pnpm --filter @mkboard/desktop test:mcp-bridge
pnpm --filter @mkboard/desktop test:elevenlabs-speech
pnpm --filter @mkboard/web build
```

## Adding a New CLI Agent

Built-in CLI agents are declared in `apps/desktop/src/main/agent-registry.ts`. Users can also test custom CLI agents locally without modifying source code by creating `~/.mkboard/agents.local.json`.
