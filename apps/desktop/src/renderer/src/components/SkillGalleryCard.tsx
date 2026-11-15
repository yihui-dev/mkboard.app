import { useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CircleCheck,
  Code2,
  Compass,
  FileText,
  Layers,
  Palette,
  Plus,
  Rocket,
  Sparkles,
  Terminal,
  WandSparkles
} from "lucide-react";
import type { Skill, SkillryPackStatus, Taste } from "../../../shared";
import type { InterfaceLanguage } from "../i18n";

const CREATOR_POSTERS = [
  "https://media.skillry.dev/cdn-cgi/image/width=960,quality=82,fit=scale-down,format=auto/ai-motion-graphics/scatter-presenter.e74aa25307.webp",
  "https://media.skillry.dev/cdn-cgi/image/width=960,quality=82,fit=scale-down,format=auto/ai-motion-graphics/action-checklist.4909778e30.webp",
  "https://media.skillry.dev/cdn-cgi/image/width=960,quality=82,fit=scale-down,format=auto/ai-motion-graphics/sequential-bars.ca2ae067fb.webp",
  "https://media.skillry.dev/cdn-cgi/image/width=960,quality=82,fit=scale-down,format=auto/ai-motion-graphics/hub-routing.dc3de2ec33.webp",
  "https://media.skillry.dev/cdn-cgi/image/width=960,quality=82,fit=scale-down,format=auto/ai-motion-graphics/calculation-roi.c35179a2ed.webp",
  "https://media.skillry.dev/cdn-cgi/image/width=960,quality=82,fit=scale-down,format=auto/ai-motion-graphics/definition-reframe.776da87398.webp"
];

const LAUNCH_HERO_POSTER =
  "https://media.skillry.dev/cdn-cgi/image/width=960,quality=82,fit=scale-down,format=auto/product-launch-video/hero.635baeb12c.webp";

const LAUNCH_POSTERS = [
  LAUNCH_HERO_POSTER,
  "https://media.skillry.dev/cdn-cgi/image/width=960,quality=82,fit=scale-down,format=auto/product-launch-video/beat-hook.f692b5ce1d.webp",
  "https://media.skillry.dev/cdn-cgi/image/width=960,quality=82,fit=scale-down,format=auto/product-launch-video/beat-close.6fdb4d7fdc.webp"
];

type EditorialArtPalette = {
  bg: string;
  accent: string;
  ink: string;
  cardBg: string;
};

const EDITORIAL_ART_PALETTES: EditorialArtPalette[] = [
  {
    bg: "linear-gradient(180deg, #F8FAFC 0%, #EEF2F6 100%)",
    accent: "#2563EB",
    ink: "#0F172A",
    cardBg: "#FFFFFF"
  },
  {
    bg: "linear-gradient(180deg, #FAF9F6 0%, #F2EFE9 100%)",
    accent: "#D97706",
    ink: "#1C1917",
    cardBg: "#FFFFFF"
  },
  {
    bg: "linear-gradient(180deg, #F4FBF8 0%, #E7F5EE 100%)",
    accent: "#059669",
    ink: "#064E3B",
    cardBg: "#FFFFFF"
  },
  {
    bg: "linear-gradient(180deg, #F5F7FF 0%, #EBF0FF 100%)",
    accent: "#4F46E5",
    ink: "#1E1B4B",
    cardBg: "#FFFFFF"
  }
];

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function extractSkillFeatureTags(skill: Skill, isEn: boolean): string[] {
  if (skill.locked || skill.id === "default-storyboard") {
    return isEn ? ["A/B-Roll Split", "Image Prompts", "Shot Timing"] : ["A/B-Roll 拆解", "画面提示词", "时长节奏"];
  }
  if (skill.id.includes("creatormotion")) {
    return isEn ? ["122+ Motion B-Roll", "4 Color Themes", "Editable Specs"] : ["122+ 动态图形", "4 套配色体系", "可编辑 B-Roll"];
  }
  if (skill.id.includes("launchmotion")) {
    return isEn ? ["208 Launch Scenes", "6 Brand Palettes", "SaaS Promo"] : ["208 发布场景", "6 套品牌色", "SaaS 宣传片"];
  }

  const headings: string[] = [];
  for (const line of skill.content.split(/\r?\n/u)) {
    const m = /^#{1,3}\s+(.+)$/u.exec(line.trim());
    if (m) {
      const cleaned = m[1].replace(/[`*_#]/gu, "").trim();
      if (cleaned.length >= 2 && cleaned.length <= 14 && !headings.includes(cleaned)) {
        headings.push(cleaned);
      }
      if (headings.length >= 3) break;
    }
  }
  if (headings.length >= 2) return headings.slice(0, 3);
  return isEn ? ["Custom Rules", "Prompt Spec", "Reusable"] : ["自定义规则", "分镜规范", "可复用模版"];
}

/**
 * Minimalist OpenDesign-style architectural wireframe illustration for Default Storyboard Skill.
 * Zero text clutter, zero neon/gold noise: pure geometric storyboard triptych on a calm slate canvas.
 */
function MinimalStoryboardArtwork() {
  return (
    <div className="skg-art-minimal-sb" aria-hidden="true">
      <svg
        className="skg-minimal-sb-svg mk-brand-svg"
        viewBox="0 0 380 214"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: "100%", height: "100%", strokeWidth: 0 }}
      >
        <defs>
          <pattern id="mk-sb-dots" x="0" y="0" width="16" height="16" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1" fill="#CBD5E1" fillOpacity="0.55" />
          </pattern>
          <filter id="mk-sb-shadow" x="-12%" y="-12%" width="124%" height="132%">
            <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="#0F172A" floodOpacity="0.06" />
          </filter>
        </defs>

        <rect width="380" height="214" fill="#F6F8FB" />
        <rect width="380" height="214" fill="url(#mk-sb-dots)" />

        {/* Left card: Script structure */}
        <g filter="url(#mk-sb-shadow)" transform="translate(38, 56)">
          <rect width="84" height="104" rx="10" fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="1" />
          <rect x="14" y="18" width="28" height="5" rx="2.5" fill="#94A3B8" />
          <rect x="14" y="32" width="56" height="4" rx="2" fill="#E2E8F0" />
          <rect x="14" y="42" width="48" height="4" rx="2" fill="#E2E8F0" />
          <rect x="14" y="58" width="56" height="4" rx="2" fill="#E2E8F0" />
          <rect x="14" y="68" width="38" height="4" rx="2" fill="#E2E8F0" />
          <rect x="14" y="84" width="22" height="5" rx="2.5" fill="#CBD5E1" />
        </g>

        {/* Center hero card: 16:9 Storyboard Keyframe */}
        <g filter="url(#mk-sb-shadow)" transform="translate(114, 38)">
          <rect width="152" height="138" rx="13" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="1.2" />
          {/* Inner 16:9 frame */}
          <rect x="12" y="12" width="128" height="76" rx="8" fill="#F1F5F9" stroke="#E2E8F0" strokeWidth="1" />
          {/* Minimalist sun + composition geometry */}
          <circle cx="44" cy="36" r="8" fill="#CBD5E1" />
          <path
            d="M22 80L56 50L82 70L104 54L130 80H22Z"
            fill="#CBD5E1"
            fillOpacity="0.65"
          />
          {/* Subtle rule-of-thirds crosshair */}
          <line x1="60" y1="22" x2="60" y2="30" stroke="#94A3B8" strokeWidth="1.2" strokeLinecap="round" />
          <line x1="56" y1="26" x2="64" y2="26" stroke="#94A3B8" strokeWidth="1.2" strokeLinecap="round" />

          {/* Clean shot caption & timeline scrubber */}
          <rect x="14" y="100" width="64" height="6" rx="3" fill="#0F172A" fillOpacity="0.82" />
          <rect x="14" y="114" width="124" height="5" rx="2.5" fill="#EEF2F6" />
          <rect x="14" y="114" width="74" height="5" rx="2.5" fill="#0F172A" />
          <circle cx="88" cy="116.5" r="4" fill="#0F172A" />
        </g>

        {/* Right card: A/B-Roll sequence rhythm */}
        <g filter="url(#mk-sb-shadow)" transform="translate(258, 56)">
          <rect width="84" height="104" rx="10" fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="1" />
          <rect x="14" y="18" width="56" height="18" rx="5" fill="#F1F5F9" />
          <rect x="20" y="25" width="24" height="4" rx="2" fill="#64748B" />
          <rect x="14" y="43" width="56" height="18" rx="5" fill="#0F172A" fillOpacity="0.06" stroke="#CBD5E1" strokeWidth="1" />
          <rect x="20" y="50" width="32" height="4" rx="2" fill="#0F172A" fillOpacity="0.75" />
          <rect x="14" y="68" width="56" height="18" rx="5" fill="#F1F5F9" />
          <rect x="20" y="75" width="20" height="4" rx="2" fill="#94A3B8" />
        </g>
      </svg>
    </div>
  );
}

export function SkillGalleryCard({
  skill,
  locale,
  iconNode,
  onSelect
}: {
  skill: Skill;
  locale: InterfaceLanguage;
  iconNode: React.ReactNode;
  onSelect: (skillId: string) => void;
}) {
  const isEn = locale === "en";
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [imgFailed, setImgFailed] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);

  const kind = useMemo(() => {
    if (skill.locked || skill.id === "default-storyboard") return "system-storyboard" as const;
    if (skill.id === "skill-skillry-bs-creatormotion") return "creator-master" as const;
    if (skill.id.startsWith("skill-skillry-bs-creatormotion-")) return "creator-sub" as const;
    if (skill.id === "skill-skillry-bs-launchmotion") return "launch-master" as const;
    if (skill.id.startsWith("skill-skillry-bs-launchmotion-")) return "launch-sub" as const;
    if (skill.id.startsWith("skill-ext-")) return "github-imported" as const;
    return "custom-user" as const;
  }, [skill.id, skill.locked]);

  const seed = useMemo(() => hashString(`${skill.id}:${skill.gradientId || ""}:${skill.name}`), [skill.id, skill.gradientId, skill.name]);
  const palette = EDITORIAL_ART_PALETTES[seed % EDITORIAL_ART_PALETTES.length];
  const tags = useMemo(() => extractSkillFeatureTags(skill, isEn), [skill, isEn]);

  const mediaInfo = useMemo(() => {
    if (kind === "creator-master") {
      return {
        poster: CREATOR_POSTERS[0],
        video: "https://media.skillry.dev/ai-motion-graphics/hero/preview-1.mp4",
        dots: ["#F6C445", "#39E58C", "#F97316", "#38BDF8"]
      };
    }
    if (kind === "creator-sub") {
      return {
        poster: CREATOR_POSTERS[seed % CREATOR_POSTERS.length],
        video: null,
        dots: ["#F6C445", "#39E58C", "#F97316"]
      };
    }
    if (kind === "launch-master") {
      return {
        poster: LAUNCH_HERO_POSTER,
        video: "https://media.skillry.dev/product-launch-video/hero-collage-desktop.mp4",
        dots: ["#2563EB", "#18181B", "#EA580C", "#10B981", "#E11D48", "#EAB308"]
      };
    }
    if (kind === "launch-sub") {
      return {
        poster: LAUNCH_POSTERS[seed % LAUNCH_POSTERS.length],
        video: null,
        dots: ["#2563EB", "#EA580C", "#10B981"]
      };
    }
    return null;
  }, [kind, seed]);

  const badgeInfo = useMemo(() => {
    switch (kind) {
      case "system-storyboard":
        return {
          label: isEn ? "Core Built-in" : "内置核心",
          tone: "neutral",
          Icon: Layers
        };
      case "creator-master":
      case "creator-sub":
        return {
          label: kind === "creator-master" ? "Skillry · CreatorMotion" : isEn ? "CreatorMotion Sub-Skill" : "CreatorMotion 子动效",
          tone: "emerald",
          Icon: WandSparkles
        };
      case "launch-master":
      case "launch-sub":
        return {
          label: kind === "launch-master" ? "Skillry · LaunchMotion" : isEn ? "LaunchMotion Scene" : "LaunchMotion 场景",
          tone: "blue",
          Icon: Rocket
        };
      case "github-imported":
        return {
          label: isEn ? "GitHub / Imported" : "GitHub 导入",
          tone: "slate",
          Icon: Code2
        };
      default:
        return {
          label: isEn ? "Custom Skill" : "自定义技能",
          tone: "slate",
          Icon: Sparkles
        };
    }
  }, [kind, isEn]);

  const BadgeIcon = badgeInfo.Icon;

  return (
    <button
      type="button"
      className="skg-card"
      onClick={() => onSelect(skill.id)}
      onMouseEnter={() => {
        if (videoRef.current) {
          videoRef.current.play().catch(() => {});
        }
      }}
      onMouseLeave={() => {
        setVideoPlaying(false);
        if (videoRef.current) {
          videoRef.current.pause();
        }
      }}
    >
      <div className="skg-cover">
        {kind === "system-storyboard" ? (
          <MinimalStoryboardArtwork />
        ) : mediaInfo && !imgFailed ? (
          <div className="skg-art-media" aria-hidden="true">
            <img
              className="skg-cover-img"
              src={mediaInfo.poster}
              alt=""
              loading="lazy"
              onError={() => setImgFailed(true)}
            />
            {mediaInfo.video ? (
              <video
                ref={videoRef}
                className={`skg-cover-video hover-overlay ${videoPlaying ? "playing" : ""}`}
                src={mediaInfo.video}
                muted
                loop
                playsInline
                preload="none"
                onPlaying={() => setVideoPlaying(true)}
              />
            ) : null}
            <div className="skg-cover-scrim" />
            <div className="skg-media-dots">
              {mediaInfo.dots.map((hex) => (
                <span key={hex} style={{ background: hex }} />
              ))}
            </div>
          </div>
        ) : (
          <div className="skg-art-clean-doc" style={{ background: palette.bg }} aria-hidden="true">
            <div className="skg-clean-doc-sheet" style={{ background: palette.cardBg }}>
              <div className="skg-clean-doc-head">
                <span className="skg-clean-doc-dot" style={{ background: palette.accent }} />
                <span className="skg-clean-doc-bar" />
              </div>
              <div className="skg-clean-doc-body">
                <span className="skg-clean-doc-glyph" style={{ color: palette.accent }}>
                  <Compass />
                </span>
                <div className="skg-clean-doc-lines">
                  <span style={{ width: "78%" }} />
                  <span style={{ width: "54%" }} />
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="skg-cover-top">
          <span className={`skg-badge ${badgeInfo.tone}`}>
            <BadgeIcon aria-hidden="true" />
            <span>{badgeInfo.label}</span>
          </span>
        </div>
      </div>

      <div className="skg-body">
        <div className="skg-title-row">
          {kind === "system-storyboard" ? (
            <span className="skg-minimal-avatar" aria-hidden="true">
              <Layers />
            </span>
          ) : (
            iconNode
          )}
          <div className="skg-title-col">
            <strong className="skg-title">{skill.name}</strong>
            <span className="skg-scope-sub">
              {skill.locked
                ? isEn
                  ? "System Built-in · Auto Ready"
                  : "系统内置 · 开箱即用"
                : isEn
                  ? `${Math.max(1, Math.round(skill.content.length / 100) / 10)}k chars prompt spec`
                  : `约 ${Math.max(100, skill.content.length).toLocaleString()} 字规则规范`}
            </span>
          </div>
        </div>

        <p className="skg-desc">
          {skill.description.trim() || (isEn ? "Open to view storyboard prompt rules." : "点击查看与编辑完整分镜提示词规范。")}
        </p>

        <div className="skg-tags-row">
          {tags.map((tag) => (
            <span key={tag} className="skg-tag-chip">
              {tag}
            </span>
          ))}
        </div>

        <div className="skg-footer">
          <span className="skg-footer-hint">
            <Layers aria-hidden="true" />
            <span>{skill.locked ? (isEn ? "Built-in Spec" : "内置分镜规范") : isEn ? "Editable SKILL" : "支持自定义编辑"}</span>
          </span>
          <span className="skg-footer-cta">
            <span>{skill.locked ? (isEn ? "Inspect" : "查看规范") : isEn ? "Edit Skill" : "查看 / 编辑"}</span>
            <ArrowRight aria-hidden="true" />
          </span>
        </div>
      </div>
    </button>
  );
}

/**
 * Unified-size Skillry Collection Card inside `.skg-grid` (matches `SkillGalleryCard` dimensions 1:1).
 */
export function SkillryPackGalleryCard({
  pack,
  locale,
  onOpenGallery,
  onPullPack,
  onEditSyncedSkill
}: {
  pack: SkillryPackStatus;
  locale: InterfaceLanguage;
  onOpenGallery: () => void;
  onPullPack: () => void;
  onEditSyncedSkill?: (skillId: string) => void;
}) {
  const isEn = locale === "en";
  const isCreator = pack.slug === "bs-creatormotion";
  const Icon = isCreator ? WandSparkles : Rocket;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoPlaying, setVideoPlaying] = useState(false);

  const posterUrl = isCreator ? CREATOR_POSTERS[0] : LAUNCH_HERO_POSTER;
  const hoverVideoUrl = isCreator
    ? "https://media.skillry.dev/ai-motion-graphics/hero/preview-1.mp4"
    : "https://media.skillry.dev/product-launch-video/hero-collage-desktop.mp4";
  const dots =
    pack.themes.length > 0
      ? pack.themes.map((th) => th.swatches[2] || th.swatches[0])
      : isCreator
        ? ["#F6C445", "#39E58C", "#F97316", "#38BDF8"]
        : ["#2563EB", "#18181B", "#EA580C", "#10B981", "#E11D48", "#EAB308"];

  const tags = (isEn ? pack.categoryTagsEn : pack.categoryTagsZh).slice(0, 3);
  const isReady = pack.syncedToMkboard || pack.installedMasterLocally;

  return (
    <div
      className="skg-card skg-pack-card"
      role="button"
      tabIndex={0}
      onClick={onOpenGallery}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenGallery();
        }
      }}
      onMouseEnter={() => {
        if (videoRef.current) {
          videoRef.current.play().catch(() => {});
        }
      }}
      onMouseLeave={() => {
        setVideoPlaying(false);
        if (videoRef.current) {
          videoRef.current.pause();
        }
      }}
    >
      <div className="skg-cover">
        <div className="skg-art-media" aria-hidden="true">
          <img className="skg-cover-img" src={posterUrl} alt="" loading="lazy" />
          <video
            ref={videoRef}
            className={`skg-cover-video hover-overlay ${videoPlaying ? "playing" : ""}`}
            src={hoverVideoUrl}
            muted
            loop
            playsInline
            preload="none"
            onPlaying={() => setVideoPlaying(true)}
          />
          <div className="skg-cover-scrim" />
          <div className="skg-media-dots">
            {dots.map((hex, idx) => (
              <span key={`${hex}-${idx}`} style={{ background: hex }} />
            ))}
          </div>
        </div>

        <div className="skg-cover-top">
          <span className={`skg-badge ${isCreator ? "emerald" : "blue"}`}>
            <Icon aria-hidden="true" />
            <span>
              {isEn
                ? `Skillry · ${pack.totalEffectsCount} Effects`
                : `Skillry 合集 · ${pack.totalEffectsCount} 子效果`}
            </span>
          </span>

          {isReady ? (
            <span className="skg-status-pill ready">
              <CircleCheck aria-hidden="true" />
              <span>{isEn ? "Installed" : "已导入"}</span>
            </span>
          ) : (
            <span className="skg-status-pill free">
              <span>{isEn ? `${pack.freeEffectsCount} Free` : `含 ${pack.freeEffectsCount} 免费`}</span>
            </span>
          )}
        </div>
      </div>

      <div className="skg-body">
        <div className="skg-title-row">
          <span className={`skg-pack-avatar ${isCreator ? "creator" : "launch"}`} aria-hidden="true">
            <Icon />
          </span>
          <div className="skg-title-col">
            <strong className="skg-title">{pack.title}</strong>
            <span className="skg-scope-sub">
              {isCreator
                ? isEn
                  ? "Talking-Head & Explainer Motion B-Roll"
                  : "自媒体口播 / 知识讲解动态图形库"
                : isEn
                  ? "Product Launch & SaaS Promo Library"
                  : "产品发布片 / SaaS 宣传片动效库"}
            </span>
          </div>
        </div>

        <p className="skg-desc">{pack.subtitle}</p>

        <div className="skg-tags-row">
          {tags.map((tag) => (
            <span key={tag} className="skg-tag-chip">
              {tag}
            </span>
          ))}
        </div>

        <div className="skg-footer">
          {pack.syncedToMkboard && onEditSyncedSkill ? (
            <button
              type="button"
              className="skg-footer-pill-btn"
              onClick={(e) => {
                e.stopPropagation();
                onEditSyncedSkill(pack.mkboardSkillId);
              }}
            >
              <FileText aria-hidden="true" />
              <span>{isEn ? "Edit Spec" : "查看规则"}</span>
            </button>
          ) : (
            <button
              type="button"
              className="skg-footer-pill-btn"
              onClick={(e) => {
                e.stopPropagation();
                onPullPack();
              }}
            >
              <Terminal aria-hidden="true" />
              <span>{isEn ? "npm Pull" : "npm 拉取"}</span>
            </button>
          )}

          <span className="skg-footer-cta">
            <span>
              {isEn
                ? `${pack.totalEffectsCount} Effects`
                : `查看 ${pack.totalEffectsCount} 子效果`}
            </span>
            <ArrowRight aria-hidden="true" />
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Unified Visual Preset Card inside `SkillsScreen` `.skg-grid` (replaces standalone Style screen cards).
 */
export function VisualPresetGalleryCard({
  taste,
  locale,
  isDefault,
  starterBadge,
  specimenText,
  onSelect
}: {
  taste: Pick<Taste, "id" | "name" | "description" | "preview">;
  locale: InterfaceLanguage;
  isDefault?: boolean;
  starterBadge?: string;
  specimenText?: string;
  onSelect: () => void;
}) {
  const isEn = locale === "en";
  const bg = taste.preview?.background || "#111317";
  const fg = taste.preview?.foreground || "#F8FAFC";
  const accent = taste.preview?.accent || "#34D399";
  const displayTitle = specimenText || taste.name;

  return (
    <button type="button" className="skg-card skg-visual-preset-card" onClick={onSelect}>
      <div className="skg-cover">
        <div
          className="skg-preset-poster"
          style={{ background: bg, color: fg }}
          aria-hidden="true"
        >
          <div className="skg-preset-top">
            <span className="skg-preset-kicker">{starterBadge ? "OPEN-SOURCE PRESET" : "VISUAL PRESET"}</span>
            {isDefault ? (
              <span className="skg-preset-pill default">
                {isEn ? "Default" : "默认"}
              </span>
            ) : starterBadge ? (
              <span className="skg-preset-pill starter" style={{ background: accent, color: "#FFFFFF" }}>
                {starterBadge}
              </span>
            ) : null}
          </div>

          <div className="skg-preset-mid">
            <strong className="skg-preset-specimen">{displayTitle}</strong>
            <span className="skg-preset-orb" style={{ background: accent }} />
          </div>

          <div className="skg-preset-bottom">
            <span className="skg-preset-hex">{bg.toUpperCase()}</span>
            <span className="skg-preset-swatches">
              <i style={{ background: bg }} />
              <i style={{ background: fg }} />
              <i style={{ background: accent }} />
            </span>
          </div>
        </div>
      </div>

      <div className="skg-body">
        <div className="skg-title-row">
          <span className="skg-minimal-avatar" aria-hidden="true">
            <Palette />
          </span>
          <div className="skg-title-col">
            <strong className="skg-title">{taste.name}</strong>
            <span className="skg-scope-sub">
              {starterBadge
                ? isEn
                  ? "One-click Color & Layout Preset"
                  : "开源配色与版式预设"
                : isDefault
                  ? isEn
                    ? "Active Default Visual Preset"
                    : "当前默认视觉预设"
                  : isEn
                    ? "Saved Visual & Color Spec"
                    : "自定义配色与画风规范"}
            </span>
          </div>
        </div>

        <p className="skg-desc">{taste.description}</p>

        <div className="skg-tags-row">
          <span className="skg-tag-chip">{bg.toUpperCase()}</span>
          <span className="skg-tag-chip">{accent.toUpperCase()}</span>
          <span className="skg-tag-chip">{isEn ? "Color & Tone" : "色彩与画风"}</span>
        </div>

        <div className="skg-footer">
          <span className="skg-footer-hint">
            <Palette aria-hidden="true" />
            <span>{starterBadge ? (isEn ? "Add to Library" : "一键加入预设库") : isEn ? "Visual Spec" : "视觉配色规范"}</span>
          </span>
          <span className="skg-footer-cta">
            <span>{starterBadge ? (isEn ? "Add & Use" : "一键启用") : isEn ? "Configure" : "编辑 / 设默认"}</span>
            <ArrowRight aria-hidden="true" />
          </span>
        </div>
      </div>
    </button>
  );
}

/**
 * Legacy export kept for backwards compatibility if referenced.
 */
export function SkillryTastePackCard({
  pack,
  locale,
  onOpenGallery
}: {
  pack: SkillryPackStatus;
  locale: InterfaceLanguage;
  onOpenGallery: () => void;
}) {
  return (
    <SkillryPackGalleryCard
      pack={pack}
      locale={locale}
      onOpenGallery={onOpenGallery}
      onPullPack={onOpenGallery}
    />
  );
}

export function SkillCreateActionCard({
  locale,
  mode = "skill",
  onCreate,
  onCreatePreset,
  onImportGithub
}: {
  locale: InterfaceLanguage;
  mode?: "skill" | "preset";
  onCreate: () => void;
  onCreatePreset?: () => void;
  onImportGithub: () => void;
}) {
  const isEn = locale === "en";
  const isPreset = mode === "preset";
  const handlePrimary = isPreset && onCreatePreset ? onCreatePreset : onCreate;

  return (
    <div className="skg-card skg-create-card">
      <button type="button" className="skg-create-main" onClick={handlePrimary}>
        <div className="skg-cover skg-create-cover" aria-hidden="true">
          <div className="skg-create-blueprint">
            <span className="skg-create-plus">
              <Plus />
            </span>
          </div>
        </div>
        <div className="skg-body">
          <div className="skg-title-row">
            <span className="skg-minimal-avatar" aria-hidden="true">
              {isPreset ? <Palette /> : <BookOpen />}
            </span>
            <div className="skg-title-col">
              <strong className="skg-title">
                {isPreset
                  ? isEn
                    ? "New Visual Preset"
                    : "新建自定义视觉预设"
                  : isEn
                    ? "New Custom Skill"
                    : "新建自定义技能"}
              </strong>
              <span className="skg-scope-sub">
                {isPreset
                  ? isEn
                    ? "Palette, Typography & Tone"
                    : "主副配色、字体层级与画风词"
                  : isEn
                    ? "Markdown Prompt & Shot Rules"
                    : "编写分镜拆解规则或导入 SKILL.md"}
              </span>
            </div>
          </div>
          <p className="skg-desc">
            {isPreset
              ? isEn
                ? "Define primary/accent colors and visual art direction for storyboard generation, or import from GitHub."
                : "自定义生图与动效的主副色比例、留白节奏与画风描述，或从 GitHub 仓库一键提取。"
              : isEn
                ? "Define your own pacing, shot categories, and B-Roll prompt templates, or import from GitHub."
                : "沉淀你的专属口播节奏、镜头拆解与提示词规范，或直接从 GitHub / ZIP 导入。"}
          </p>
        </div>
      </button>
      <div className="skg-create-actions">
        <button type="button" className="hub-btn hub-btn-dark hub-btn-sm" onClick={handlePrimary}>
          <Plus aria-hidden="true" />
          <span>{isPreset ? (isEn ? "New Preset" : "新建预设") : isEn ? "New Skill" : "新建技能"}</span>
        </button>
        {onCreatePreset && !isPreset ? (
          <button type="button" className="hub-btn hub-btn-outline hub-btn-sm" onClick={onCreatePreset}>
            <Palette aria-hidden="true" />
            <span>{isEn ? "New Preset" : "新建视觉预设"}</span>
          </button>
        ) : (
          <button type="button" className="hub-btn hub-btn-outline hub-btn-sm" onClick={onImportGithub}>
            <Code2 aria-hidden="true" />
            <span>{isEn ? "Import GitHub" : "导入 GitHub"}</span>
          </button>
        )}
      </div>
    </div>
  );
}
