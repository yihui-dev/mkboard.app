---
title: "Installation guide"
description: "Install MkBoard Desktop and connect Codex CLI or Claude Code."
locale: "en"
eyebrow: "Local environment"
---

### 1. Open-Source macOS First-Launch Tip

Open-source MkBoard builds omit proprietary Apple Developer signing certificates. On macOS, after dragging `MkBoard.app` into `/Applications`, if Gatekeeper prompts on first launch, run:

```bash
xattr -cr /Applications/MkBoard.app
```

### 2. Configure Agents & Local BYOK API Keys

MkBoard uses a local Agent on your computer to read the current project and run storyboard splitting, repair, and generation tasks. MkBoard currently supports Codex CLI and Claude Code. Make sure you install the CLI version; installing only the desktop app or editor extension may not be enough for MkBoard detection.

<img class="docs-full-width-image" src="https://assets.mkboard.app/static/20260623-225834.webp" alt="Local Agent configuration in MkBoard Desktop settings" />

Install and sign in to one local Agent first:

- Codex CLI: follow the [official OpenAI setup guide](https://developers.openai.com/codex/cli) to install the CLI and sign in.
- Claude Code CLI: follow the [official Claude Code quickstart](https://code.claude.com/docs/en/quickstart) to install the CLI and sign in.

After installation, finish sign-in or configuration in your terminal and make sure Codex CLI or Claude Code CLI runs correctly.

### 3. Check the bundled video runtime

The full MkBoard installer includes HyperFrames CLI, Chrome Headless Shell, FFmpeg, and ffprobe. The Windows installer also includes a pinned Node.js 22 runtime. You do not need to install Node.js, npm, FFmpeg, or HyperFrames, edit PATH, or wait for a first-run runtime download.

After installation, open MkBoard settings and click "Test" for HyperFrames under Video Tools. MkBoard checks the bundled versions, system architecture, and file integrity. If a check fails, reinstall the same full MkBoard installer instead of bypassing the check with global dependencies.

### 4. Start using MkBoard

After the setup is complete, open MkBoard Desktop and create a project. You can write your script, organize the storyboard, and continue into video drafts.

## Need Help

If setup fails, join the Feishu group and include the bundled-runtime check results from Settings.

<img class="docs-qr-image" src="https://assets.mkboard.app/static/docs/install/feishu-group-qr-1c167fd7.webp" alt="MkBoard Feishu group QR code" />
