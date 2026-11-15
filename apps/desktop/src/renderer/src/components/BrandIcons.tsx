import type { CSSProperties } from "react";
import AntigravityColor from "@lobehub/icons/es/Antigravity/components/Color";
import ClaudeCodeColor from "@lobehub/icons/es/ClaudeCode/components/Color";
import CodexColor from "@lobehub/icons/es/Codex/components/Color";
import CursorMono from "@lobehub/icons/es/Cursor/components/Mono";
import ElevenLabsMono from "@lobehub/icons/es/ElevenLabs/components/Mono";
import GeminiColor from "@lobehub/icons/es/Gemini/components/Color";
import JimengColor from "@lobehub/icons/es/Jimeng/components/Color";
import KimiColor from "@lobehub/icons/es/Kimi/components/Color";
import KimiMono from "@lobehub/icons/es/Kimi/components/Mono";
import KlingColor from "@lobehub/icons/es/Kling/components/Color";
import OpenAIMono from "@lobehub/icons/es/OpenAI/components/Mono";
import OpenCodeMono from "@lobehub/icons/es/OpenCode/components/Mono";
import { Terminal } from "lucide-react";

const HYPERFRAMES_LOGO_URL = "https://static.mkboard.app/desktop-assets/2026-06-18/brands/hyperframes-logo.png";

function iconBoxStyle(size: number): CSSProperties {
  return {
    width: `${size}px`,
    height: `${size}px`,
    minWidth: `${size}px`,
    minHeight: `${size}px`,
    flex: "0 0 auto",
    strokeWidth: 0
  };
}

export function normalizeBrandAgentId(id?: string | null): string {
  if (!id) return "codex";
  if (id === "gemini-cli") return "antigravity";
  return id;
}

/**
 * Renders the crisp vector brand mark for any local CLI agent (for inline pills, menus, chat headers, or cards).
 */
export function AgentBrandGlyph({
  agentId,
  name,
  size = 22,
  variant = "tile"
}: {
  agentId: string;
  name?: string;
  size?: number;
  variant?: "tile" | "inline";
}) {
  const normalized = normalizeBrandAgentId(agentId);
  const svgStyle = iconBoxStyle(size);

  if (normalized === "codex") {
    return <CodexColor className="mk-brand-svg" size={size} style={svgStyle} />;
  }
  if (normalized === "claude-code") {
    return <ClaudeCodeColor className="mk-brand-svg" size={size} style={svgStyle} />;
  }
  if (normalized === "antigravity") {
    return <AntigravityColor className="mk-brand-svg" size={size} style={svgStyle} />;
  }
  if (normalized === "opencode") {
    return <OpenCodeMono className="mk-brand-svg" size={size} style={svgStyle} />;
  }
  if (normalized === "cursor-agent" || normalized === "cursor") {
    return <CursorMono className="mk-brand-svg" size={size} style={svgStyle} />;
  }
  if (normalized === "kimi-cli") {
    if (variant === "inline") {
      return (
        <span
          className="mk-inline-dark-badge"
          style={{
            width: `${size + 4}px`,
            height: `${size + 4}px`,
            borderRadius: "6px",
            background: "#14161a",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flex: "0 0 auto"
          }}
        >
          <KimiColor className="mk-brand-svg" size={Math.max(12, size - 3)} style={iconBoxStyle(Math.max(12, size - 3))} />
        </span>
      );
    }
    return <KimiColor className="mk-brand-svg" size={size} style={svgStyle} />;
  }
  if (normalized === "hyperframes") {
    return (
      <img
        alt=""
        className="mk-brand-img"
        src={HYPERFRAMES_LOGO_URL}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: "6px",
          objectFit: "contain",
          display: "block"
        }}
      />
    );
  }

  if (variant === "inline") {
    return <Terminal size={Math.max(14, size - 2)} style={{ width: `${size - 2}px`, height: `${size - 2}px` }} />;
  }

  const fallback = (name || normalized).replace(/^custom:/i, "").slice(0, 2).toUpperCase();
  return <span className="cli-brand-letter">{fallback}</span>;
}

/**
 * Renders the crisp vector brand avatar for BYOK AI media/voice providers.
 */
export function ByokProviderBrandAvatar({
  providerId,
  size = 20
}: {
  providerId: string;
  size?: number;
}) {
  const svgStyle = iconBoxStyle(size);

  if (providerId === "gemini") {
    return (
      <span className="mk-provider-avatar gemini" aria-hidden="true">
        <GeminiColor className="mk-brand-svg" size={size} style={svgStyle} />
      </span>
    );
  }
  if (providerId === "openai") {
    return (
      <span className="mk-provider-avatar openai" aria-hidden="true">
        <OpenAIMono className="mk-brand-svg" size={size} style={svgStyle} />
      </span>
    );
  }
  if (providerId === "kie") {
    return (
      <span className="mk-provider-avatar kie" aria-hidden="true">
        <JimengColor className="mk-brand-svg" size={size} style={svgStyle} />
      </span>
    );
  }
  if (providerId === "kling") {
    return (
      <span className="mk-provider-avatar kling" aria-hidden="true">
        <KlingColor className="mk-brand-svg" size={size} style={svgStyle} />
      </span>
    );
  }
  if (providerId === "elevenlabs") {
    return (
      <span className="mk-provider-avatar elevenlabs" aria-hidden="true">
        <ElevenLabsMono className="mk-brand-svg" size={size} style={svgStyle} />
      </span>
    );
  }

  return (
    <span className="mk-provider-avatar generic" aria-hidden="true">
      <KimiMono className="mk-brand-svg" size={size} style={svgStyle} />
    </span>
  );
}
