# Privacy Policy (Open-Source Local-First Edition)

MkBoard is a **100% local-first open-source application**:

1. **No MkBoard Cloud Servers**: MkBoard does not operate a cloud account system, payment gateway, or telemetry collector.
2. **Local Storage**: All scripts, storyboards, SQLite databases, and media files stay on your machine (`~/Documents/MkBoard Projects` and your OS application data folder).
3. **Bring Your Own Key (BYOK)**: API keys you enter (KIE, OpenAI, Gemini, ElevenLabs) are stored locally in `0600` restricted files on your machine and sent **directly** from your device to the respective upstream API endpoint when you trigger generation.
4. **LAN Companion Mode**: The Web Companion binds to `127.0.0.1` by default and only listens on LAN/Tailscale interfaces when you explicitly switch to Network-Accessible mode, protected by a random 256-bit session token.
