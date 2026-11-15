---
title: "安装教程"
description: "安装 MkBoard 桌面端，并连接 Codex CLI 或 Claude Code。"
locale: "zh"
eyebrow: "本机环境"
---

### 1. 安装开源版客户端（macOS 首次打开提示）

MkBoard 开源版安装包移除了私有商业签名密钥。在 macOS 上将 `MkBoard.app` 拖入 `Applications` 后，如首次打开提示“无法验证开发者”，可在终端执行以下命令后正常打开：

```bash
xattr -cr /Applications/MkBoard.app
```

### 2. 配置 Agent 与本地 BYOK API Key

MkBoard 通过你电脑上的本地 Agent 来读取当前项目，并执行分镜拆分、内容修复和生成任务。目前支持 Codex CLI 和 Claude Code。请注意，这里需要安装的是 CLI 版本；只安装桌面端 App 或编辑器插件，MkBoard 不一定能检测到。

<img class="docs-full-width-image" src="https://assets.mkboard.app/static/20260623-225834.webp" alt="MkBoard 桌面端设置里的本地 Agent 配置" />

先任选一个本地 Agent 安装并完成登录：

- Codex CLI：按照 [OpenAI 官方安装说明](https://developers.openai.com/codex/cli) 安装 CLI 并完成登录。
- Claude Code CLI：按照 [Claude Code 官方快速开始](https://code.claude.com/docs/en/quickstart) 安装 CLI 并完成登录。

安装完成之后，请在终端里面完成登录或配置，确保 Codex CLI 或 Claude Code CLI 能正常运行。

### 3. 检查内置视频运行时

HyperFrames CLI、Chrome Headless Shell、FFmpeg 和 ffprobe 已全部包含在 MkBoard 完整安装包中。Windows 版还内置固定的 Node.js 22。你不需要安装 Node.js、npm、FFmpeg、HyperFrames，也不需要修改 PATH 或在第一次生成时等待下载。

安装完成后，打开 MkBoard 设置页，在“视频制作工具”里点击 HyperFrames 的“测试”。MkBoard 会检查内置组件的版本、系统架构和文件完整性。如果检查失败，请重新下载并安装同版本完整安装包，不要通过全局安装依赖来绕过。

### 4. 开始使用 MkBoard

完成以上安装后，就可以进入 MkBoard Desktop 创建项目。你可以在项目里编写脚本、整理分镜，并继续生成视频草稿。

## 遇到问题

如果安装遇到问题，可以加入飞书交流群。请把设置页的内置运行时检查结果一起发给我们。

<img class="docs-qr-image" src="https://assets.mkboard.app/static/docs/install/feishu-group-qr-1c167fd7.webp" alt="MkBoard 飞书交流群二维码" />
