import React, { useMemo, useRef, useState } from "react";
import {
  Check,
  Code2,
  Compass,
  Film,
  Images,
  Layers,
  Megaphone,
  Rocket,
  Sparkles,
  TableProperties,
  WandSparkles
} from "lucide-react";
import type { InterfaceLanguage, ProjectTemplate, Skill, SkillryPackStatus, StoryboardColumn, Taste } from "../../../shared";
import {
  getSystemStoryboardSkillArchetype,
  getSystemStoryboardSkillFamily,
  getSystemTemplateSeed,
  type StoryboardArchetypeId
} from "../../../storyboard-presets";

type DetectedSkillKind =
  | "system-storyboard"
  | "creatormotion-master"
  | "creatormotion-sub"
  | "launchmotion-master"
  | "launchmotion-sub"
  | "github-imported"
  | "custom";

const CREATOR_POSTERS = [
  "https://media.skillry.dev/cdn-cgi/image/width=1080,quality=80,fit=scale-down,format=auto/ai-motion-graphics/scatter-presenter.e74aa25307.webp",
  "https://media.skillry.dev/cdn-cgi/image/width=1080,quality=80,fit=scale-down,format=auto/ai-motion-graphics/sequential-bars.ca2ae067fb.webp",
  "https://media.skillry.dev/cdn-cgi/image/width=1080,quality=80,fit=scale-down,format=auto/ai-motion-graphics/hub-routing.dc3de2ec33.webp"
];

const CREATOR_HERO_VIDEO = "https://media.skillry.dev/ai-motion-graphics/format-16x9.a171f29e2c.mp4";
const LAUNCH_HERO_POSTER = "https://media.skillry.dev/cdn-cgi/image/width=1080,quality=80,fit=scale-down,format=auto/product-launch-video/hero.635baeb12c.webp";
const LAUNCH_HERO_VIDEO = "https://media.skillry.dev/product-launch-video/hero.66bd4589cc.mp4";

function hashSkillString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function detectSkillKind(skill: Skill): DetectedSkillKind {
  const hay = `${skill.id} ${skill.name} ${skill.description}`.toLowerCase();
  if (skill.locked || skill.id === "default-storyboard") {
    return "system-storyboard";
  }
  if (hay.includes("creatormotion")) {
    const isSub = /bs-creatormotion-[a-z0-9-]+/.test(hay);
    return isSub ? "creatormotion-sub" : "creatormotion-master";
  }
  if (hay.includes("launchmotion")) {
    const isSub = /bs-launchmotion-[a-z0-9-]+/.test(hay);
    return isSub ? "launchmotion-sub" : "launchmotion-master";
  }
  if (skill.content.includes("github.com") || hay.includes("github")) {
    return "github-imported";
  }
  return "custom";
}

function getCleanIllustrationPalette(seed: number) {
  const palettes = [
    { bg: "#F4F4F2", cardBg: "#FFFFFF", accent: "#2563EB" },
    { bg: "#F3F5F3", cardBg: "#FFFFFF", accent: "#059669" },
    { bg: "#F6F3F0", cardBg: "#FFFFFF", accent: "#D97706" },
    { bg: "#F4F3F7", cardBg: "#FFFFFF", accent: "#4F46E5" }
  ];
  return palettes[seed % palettes.length]!;
}

const ARCHETYPE_SURFACES: Record<StoryboardArchetypeId, { bg: string; accent: string }> = {
  default: { bg: "#F4F4F5", accent: "#18181B" },
  "minimal-keyframe": { bg: "#F6F4EF", accent: "#D97706" },
  "creator-explainer": { bg: "#F1F5F8", accent: "#0284C7" },
  "product-launch": { bg: "#F2F3F9", accent: "#4F46E5" },
  "cinematic-story": { bg: "#F7F2F3", accent: "#E11D48" },
  "social-hook": { bg: "#F1F6F3", accent: "#059669" }
};

/**
 * OpenDesign-inspired pure geometric storyboard skill specimens (zero text clutter, zero locks).
 * Each built-in storyboard skill family renders a distinct, calm architectural miniature.
 */
function MinimalStoryboardArtwork({ archetype = "default" }: { archetype?: StoryboardArchetypeId }) {
  const surface = ARCHETYPE_SURFACES[archetype] ?? ARCHETYPE_SURFACES.default;
  const cssVars = {
    "--sb-stage-bg": surface.bg,
    "--sb-accent": surface.accent
  } as React.CSSProperties;

  if (archetype === "minimal-keyframe") {
    return (
      <div className="od-art-storyboard" style={cssVars} aria-hidden="true">
        <div className="od-art-sb-sheet minimal">
          <div className="od-art-sb-topbar">
            <span className="od-art-accent-dot" />
            <span className="od-art-sb-bar short" />
          </div>
          <div className="od-art-keyframe-strip">
            <div className="od-art-kf-frame">
              <span className="od-art-kf-horizon" />
              <span className="od-art-kf-sun" />
            </div>
            <div className="od-art-kf-frame active">
              <span className="od-art-kf-subject" />
            </div>
            <div className="od-art-kf-frame">
              <span className="od-art-kf-horizon low" />
            </div>
          </div>
          <div className="od-art-minimal-ticks">
            <i className="active" />
            <i />
            <i />
          </div>
        </div>
      </div>
    );
  }

  if (archetype === "creator-explainer") {
    return (
      <div className="od-art-storyboard" style={cssVars} aria-hidden="true">
        <div className="od-art-sb-sheet explainer">
          <div className="od-art-sb-topbar">
            <span className="od-art-accent-dot" />
            <span className="od-art-sb-bar" />
          </div>
          <div className="od-art-explainer-split">
            <div className="od-art-explainer-left">
              <span className="od-art-sb-avatar" />
              <span className="od-art-sb-line w85 dark" />
              <span className="od-art-sb-line w55" />
            </div>
            <div className="od-art-explainer-right">
              <span className="od-art-callout-pill" />
              <div className="od-art-explainer-bars">
                <i style={{ height: "38%" }} />
                <i style={{ height: "66%" }} />
                <i className="hi" style={{ height: "96%" }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (archetype === "product-launch") {
    return (
      <div className="od-art-storyboard" style={cssVars} aria-hidden="true">
        <div className="od-art-sb-sheet launch">
          <div className="od-art-sb-topbar">
            <span className="od-art-sb-dots">
              <i />
              <i />
              <i />
            </span>
            <span className="od-art-accent-pill" />
          </div>
          <div className="od-art-launch-body">
            <div className="od-art-launch-hero">
              <span className="od-art-sb-line w68 dark" />
              <span className="od-art-sb-line w45" />
              <span className="od-art-launch-cta" />
            </div>
            <div className="od-art-launch-cards">
              <div className="od-art-launch-tile" />
              <div className="od-art-launch-tile active" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (archetype === "cinematic-story") {
    return (
      <div className="od-art-storyboard" style={cssVars} aria-hidden="true">
        <div className="od-art-sb-sheet cinema">
          <div className="od-art-cinema-grid">
            <div className="od-art-cinema-panel">
              <span className="od-art-cinema-subject wide" />
            </div>
            <div className="od-art-cinema-panel active">
              <span className="od-art-cinema-subject close" />
            </div>
            <div className="od-art-cinema-panel">
              <span className="od-art-cinema-subject mid" />
            </div>
            <div className="od-art-cinema-panel">
              <span className="od-art-cinema-wave" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (archetype === "social-hook") {
    return (
      <div className="od-art-storyboard" style={cssVars} aria-hidden="true">
        <div className="od-art-vertical-stage">
          <div className="od-art-phone-frame active">
            <span className="od-art-phone-notch" />
            <span className="od-art-phone-badge" />
            <div className="od-art-phone-center">
              <span className="od-art-sb-avatar" />
            </div>
            <span className="od-art-phone-caption" />
          </div>
          <div className="od-art-phone-frame secondary">
            <span className="od-art-phone-notch" />
            <div className="od-art-phone-bars">
              <span style={{ width: "78%" }} />
              <span style={{ width: "56%" }} />
              <span className="accent" style={{ width: "68%" }} />
            </div>
            <span className="od-art-phone-caption short" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="od-art-storyboard" style={cssVars} aria-hidden="true">
      <div className="od-art-sb-sheet">
        <div className="od-art-sb-topbar">
          <span className="od-art-sb-dots">
            <i />
            <i />
            <i />
          </span>
          <span className="od-art-sb-bar" />
        </div>
        <div className="od-art-sb-frames">
          <div className="od-art-sb-cell">
            <div className="od-art-sb-thumb">
              <span className="od-art-sb-avatar" />
            </div>
            <span className="od-art-sb-line w75" />
            <span className="od-art-sb-line w45" />
          </div>
          <div className="od-art-sb-cell active">
            <div className="od-art-sb-thumb accent">
              <span className="od-art-sb-chart">
                <i style={{ height: "42%" }} />
                <i style={{ height: "72%" }} />
                <i style={{ height: "100%" }} />
              </span>
            </div>
            <span className="od-art-sb-line w85 dark" />
            <span className="od-art-sb-line w55" />
          </div>
          <div className="od-art-sb-cell">
            <div className="od-art-sb-thumb">
              <span className="od-art-sb-cardlet" />
            </div>
            <span className="od-art-sb-line w68" />
            <span className="od-art-sb-line w40" />
          </div>
        </div>
        <div className="od-art-sb-timeline">
          <span className="seg a" />
          <span className="seg b" />
          <span className="seg c" />
        </div>
      </div>
    </div>
  );
}

/**
 * Minimalist OpenDesign Storyboard Sheet Specimen for `ProjectTemplate` cards.
 * Visually mirrors the template's actual visible column density & archetype without noisy text!
 */
function MinimalTemplateSheetArtwork({
  columns,
  archetype,
  accentHex
}: {
  columns: StoryboardColumn[];
  archetype: StoryboardArchetypeId;
  accentHex: string;
}) {
  const surface = ARCHETYPE_SURFACES[archetype] ?? ARCHETYPE_SURFACES.default;
  const visibleContentCols = useMemo(() => {
    const visible = columns.filter((col) => col.visible && col.id !== "sort" && col.id !== "shot");
    return visible.slice(0, 5);
  }, [columns]);

  const isVertical = archetype === "social-hook";

  return (
    <div
      className="od-art-template-stage"
      style={
        {
          "--tpl-stage-bg": surface.bg,
          "--tpl-accent": accentHex || surface.accent
        } as React.CSSProperties
      }
      aria-hidden="true"
    >
      <div className="od-tpl-sheet">
        <div className="od-tpl-sheet-head">
          <div className="od-tpl-sheet-head-left">
            <span className="od-tpl-accent-dot" />
            <span className="od-tpl-title-bar" />
          </div>
          <span className="od-tpl-count-pill" />
        </div>

        <div className="od-tpl-table">
          <div className="od-tpl-row head">
            <span className="od-tpl-idx-col" />
            {visibleContentCols.map((col) => (
              <span
                key={col.id}
                className={`od-tpl-col-head ${col.type === "image" ? "img" : col.custom && col.id !== "custom-1" && col.id !== "custom-2" && col.id !== "custom-3" ? "highlight" : ""}`}
              />
            ))}
          </div>

          {[0, 1, 2].map((rowIdx) => (
            <div key={rowIdx} className={`od-tpl-row body ${rowIdx === 1 ? "active" : ""}`}>
              <span className="od-tpl-idx-dot" />
              {visibleContentCols.map((col, colIdx) => {
                if (col.type === "image") {
                  return (
                    <span
                      key={col.id}
                      className={`od-tpl-thumb-cell ${isVertical ? "vertical" : ""} ${rowIdx === 1 ? "accent" : ""}`}
                    />
                  );
                }
                if (col.id === "scene" || col.type === "select" || col.id === "duration") {
                  return (
                    <span
                      key={col.id}
                      className={`od-tpl-chip-cell ${rowIdx === 1 && colIdx <= 2 ? "accent" : ""}`}
                    />
                  );
                }
                const isCustomHighlight =
                  col.custom && col.id !== "custom-1" && col.id !== "custom-2" && col.id !== "custom-3";
                return (
                  <span key={col.id} className="od-tpl-lines-cell">
                    <i className={isCustomHighlight ? "accent" : rowIdx === 1 && col.id === "content" ? "dark" : ""} />
                    <i className="short" />
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Miniature editorial slide/UI mockup rendered in `{ bg, fg, accent }` — just like OpenDesign Community thumbnails.
 */
function PresetEditorialSpecimen({
  bg,
  fg,
  accent
}: {
  bg: string;
  fg: string;
  accent: string;
}) {
  return (
    <div
      className="od-preset-stage"
      style={
        {
          "--preset-bg": bg,
          "--preset-fg": fg,
          "--preset-accent": accent
        } as React.CSSProperties
      }
      aria-hidden="true"
    >
      <div className="od-preset-canvas">
        <div className="od-preset-nav">
          <span className="od-preset-mark" />
          <div className="od-preset-nav-pills">
            <span />
            <span />
            <i />
          </div>
        </div>

        <div className="od-preset-grid">
          <div className="od-preset-hero-col">
            <span className="od-preset-eyebrow" />
            <div className="od-preset-display">
              <span className="line-lg" />
              <span className="line-highlight" />
            </div>
            <span className="od-preset-subline" />
            <span className="od-preset-cta" />
          </div>

          <div className="od-preset-bento-col">
            <div className="od-preset-bento-card top">
              <div className="od-preset-bars">
                <i style={{ height: "38%" }} />
                <i style={{ height: "64%" }} />
                <i style={{ height: "52%" }} />
                <i className="hi" style={{ height: "92%" }} />
              </div>
            </div>
            <div className="od-preset-bento-row">
              <div className="od-preset-bento-card mini">
                <span className="od-preset-ring" />
              </div>
              <div className="od-preset-bento-card mini accent-fill">
                <span className="od-preset-spark" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function getArchetypeEmblem(archetype: StoryboardArchetypeId | null) {
  switch (archetype) {
    case "minimal-keyframe":
      return Images;
    case "creator-explainer":
      return WandSparkles;
    case "product-launch":
      return Rocket;
    case "cinematic-story":
      return Film;
    case "social-hook":
      return Megaphone;
    default:
      return Layers;
  }
}

export function SkillGalleryCard({
  skill,
  locale,
  onSelect,
  onDuplicate
}: {
  skill: Skill;
  locale: InterfaceLanguage;
  iconNode?: React.ReactNode;
  onSelect: (skillId: string) => void;
  onDuplicate?: (skill: Skill) => void;
}) {
  const isEn = locale === "en";
  const kind = useMemo(() => detectSkillKind(skill), [skill]);
  const systemArchetype = useMemo(() => getSystemStoryboardSkillArchetype(skill.id), [skill.id]);
  const systemFamily = useMemo(() => getSystemStoryboardSkillFamily(skill.id), [skill.id]);
  const seed = useMemo(() => hashSkillString(skill.id + skill.name), [skill.id, skill.name]);
  const palette = useMemo(() => getCleanIllustrationPalette(seed), [seed]);
  const [imgFailed, setImgFailed] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const mediaInfo = useMemo(() => {
    if (kind === "creatormotion-master" || kind === "creatormotion-sub") {
      const idx = kind === "creatormotion-master" ? 0 : seed % CREATOR_POSTERS.length;
      return {
        poster: CREATOR_POSTERS[idx]!,
        video: CREATOR_HERO_VIDEO
      };
    }
    if (kind === "launchmotion-master" || kind === "launchmotion-sub") {
      return {
        poster: LAUNCH_HERO_POSTER,
        video: LAUNCH_HERO_VIDEO
      };
    }
    return null;
  }, [kind, seed]);

  const displayName = useMemo(() => {
    if (systemFamily) {
      return isEn ? systemFamily.enName : systemFamily.zhName;
    }
    return skill.name;
  }, [isEn, skill.name, systemFamily]);

  const conciseSummary = useMemo(() => {
    if (systemFamily) {
      return isEn ? systemFamily.enDescription : systemFamily.zhDescription;
    }
    const raw = skill.description.trim();
    if (raw) return raw;
    return isEn ? "Storyboard breakdown & visual prompts" : "分镜拆解与画面提示词规范";
  }, [isEn, skill.description, systemFamily]);

  const sourceLabel = useMemo(() => {
    if (skill.locked) return isEn ? "Built-in" : "官方内置";
    if (kind === "github-imported") return "GitHub";
    if (kind.startsWith("creatormotion") || kind.startsWith("launchmotion")) return "Skillry";
    return isEn ? "Custom" : "自定义技能";
  }, [kind, isEn, skill.locked]);

  const EmblemIcon =
    kind === "system-storyboard"
      ? getArchetypeEmblem(systemArchetype)
      : kind === "github-imported"
        ? Code2
        : Sparkles;

  return (
    <div
      className="skg-card"
      role="button"
      tabIndex={0}
      onClick={() => onSelect(skill.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(skill.id);
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
        {kind === "system-storyboard" ? (
          <MinimalStoryboardArtwork archetype={systemArchetype ?? "default"} />
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

        <div className="skg-hover-overlay">
          <span className="skg-hover-pill light">
            {skill.locked
              ? isEn
                ? "Inspect"
                : "查看规范"
              : isEn
                ? "Edit"
                : "编辑技能"}
          </span>
          {skill.locked && onDuplicate ? (
            <button
              type="button"
              className="skg-hover-pill dark"
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate(skill);
              }}
            >
              {isEn ? "Customize" : "复制自定义"}
            </button>
          ) : null}
        </div>
      </div>

      <div className="skg-caption">
        <div className="skg-caption-row1">
          <strong className="skg-caption-title">{displayName}</strong>
          {skill.locked ? (
            <span className="skg-inline-status neutral">
              {isEn ? "Built-in" : "内置"}
            </span>
          ) : null}
        </div>
        <div className="skg-caption-row2">
          <span className="skg-micro-emblem" aria-hidden="true">
            <EmblemIcon />
          </span>
          <span className="skg-caption-meta">
            {sourceLabel} · {conciseSummary}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Minimalist OpenDesign Gallery Card for Storyboard Templates (`分镜模板`).
 */
export function TemplateGalleryCard({
  template,
  templateName,
  templateDescription,
  storyboardSkillName,
  visibleColumnCount,
  columnCountLabel,
  locale,
  isDefault,
  actionsSlot,
  onPreview,
  onUseTemplate
}: {
  template: ProjectTemplate;
  templateName: string;
  templateDescription: string;
  storyboardSkillName: string;
  visibleColumnCount: number;
  columnCountLabel: string;
  locale: InterfaceLanguage;
  isDefault: boolean;
  actionsSlot?: React.ReactNode;
  onPreview: () => void;
  onUseTemplate: () => void;
}) {
  const isEn = locale === "en";
  const systemSeed = useMemo(() => getSystemTemplateSeed(template.id), [template.id]);
  const seedNum = useMemo(() => hashSkillString(template.id + templateName), [template.id, templateName]);
  const fallbackPalette = useMemo(() => getCleanIllustrationPalette(seedNum), [seedNum]);

  const archetype: StoryboardArchetypeId = systemSeed?.archetype ?? "default";
  const accentHex = systemSeed?.accentHex ?? fallbackPalette.accent;

  return (
    <article
      className="skg-card skg-template-card"
      data-template-id={template.id}
      data-visible-columns={visibleColumnCount}
    >
      <div
        className="skg-cover"
        role="button"
        tabIndex={0}
        aria-label={templateName}
        onClick={onPreview}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onPreview();
          }
        }}
      >
        <MinimalTemplateSheetArtwork
          columns={template.columns}
          archetype={archetype}
          accentHex={accentHex}
        />

        {actionsSlot ? (
          <div
            className="skg-card-top-actions"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {actionsSlot}
          </div>
        ) : null}

        <div className="skg-hover-overlay">
          <span className="skg-hover-pill light">
            {isEn ? "Preview" : "预览结构"}
          </span>
          <button
            type="button"
            className="skg-hover-pill dark"
            onClick={(e) => {
              e.stopPropagation();
              onUseTemplate();
            }}
          >
            {isEn ? "Use Template" : "使用模板"}
          </button>
        </div>
      </div>

      <div className="skg-caption">
        <div className="skg-caption-row1">
          <strong
            className="skg-caption-title"
            role="button"
            tabIndex={-1}
            onClick={onPreview}
          >
            {templateName}
          </strong>
          {isDefault ? (
            <span className="skg-inline-status active">
              <Check aria-hidden="true" />
              <span>{isEn ? "Default" : "默认"}</span>
            </span>
          ) : template.scope === "system" ? (
            <span className="skg-inline-status neutral">
              {isEn ? "Built-in" : "内置"}
            </span>
          ) : null}
        </div>
        <div className="skg-caption-row2">
          <span className="skg-micro-emblem" aria-hidden="true">
            <TableProperties />
          </span>
          <span className="skg-caption-meta">
            {columnCountLabel} · {storyboardSkillName}
            {templateDescription ? ` · ${templateDescription}` : ""}
          </span>
        </div>
      </div>
    </article>
  );
}

/**
 * OpenDesign Community-style Motion Pack Showcase Card (`CreatorMotion` & `LaunchMotion`).
 */
export function SkillryPackGalleryCard({
  pack,
  locale,
  onOpenGallery,
  onPullPack
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
  const [imgFailed, setImgFailed] = useState(false);

  const posterUrl = pack.heroPosterUrl || (isCreator ? CREATOR_POSTERS[0]! : LAUNCH_HERO_POSTER);
  const hoverVideoUrl = pack.heroVideoUrl || (isCreator ? CREATOR_HERO_VIDEO : LAUNCH_HERO_VIDEO);

  const isReady = pack.syncedToMkboard || pack.installedMasterLocally;
  const summary = isCreator
    ? isEn
      ? `${pack.totalEffectsCount}+ editable explainer B-Roll effects`
      : `${pack.totalEffectsCount}+ 口播知识讲解可编辑动效`
    : isEn
      ? `${pack.totalEffectsCount} product launch motion scenes`
      : `${pack.totalEffectsCount} 个产品发布高转化动效场景`;

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
        {!imgFailed ? (
          <div className="skg-art-media" aria-hidden="true">
            <img
              className="skg-cover-img"
              src={posterUrl}
              alt=""
              loading="lazy"
              onError={() => setImgFailed(true)}
            />
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
          </div>
        ) : (
          <PresetEditorialSpecimen
            bg={isCreator ? "#0F172A" : "#111827"}
            fg="#F8FAFC"
            accent={isCreator ? "#38BDF8" : "#F97316"}
          />
        )}

        <div className="skg-hover-overlay">
          <span className="skg-hover-pill light">
            {isEn ? "Preview Gallery" : "浏览效果"}
          </span>
          {!isReady ? (
            <button
              type="button"
              className="skg-hover-pill dark"
              onClick={(e) => {
                e.stopPropagation();
                onPullPack();
              }}
            >
              {isEn ? "Enable" : "一键启用"}
            </button>
          ) : null}
        </div>
      </div>

      <div className="skg-caption">
        <div className="skg-caption-row1">
          <strong className="skg-caption-title">{pack.title}</strong>
          {isReady ? (
            <span className="skg-inline-status active">
              <Check aria-hidden="true" />
              <span>{isEn ? "Enabled" : "已启用"}</span>
            </span>
          ) : null}
        </div>
        <div className="skg-caption-row2">
          <span className="skg-micro-emblem" aria-hidden="true">
            <Icon />
          </span>
          <span className="skg-caption-meta">Skillry · {summary}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * OpenDesign Community-style Visual Preset Card inside `SkillsScreen` `.skg-grid`.
 */
export function VisualPresetGalleryCard({
  taste,
  locale,
  isDefault,
  starterBadge,
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

  const sourceLabel = starterBadge
    ? isEn
      ? "Open Preset"
      : "开源预设"
    : isEn
      ? "Visual Preset"
      : "视觉预设";

  const summary =
    taste.description.trim() ||
    (isEn ? "Palette & editorial layout direction" : "配色比例与版式画风规范");

  return (
    <button type="button" className="skg-card skg-visual-preset-card" onClick={onSelect}>
      <div className="skg-cover">
        <PresetEditorialSpecimen bg={bg} fg={fg} accent={accent} />

        <div className="skg-hover-overlay" aria-hidden="true">
          <span className={starterBadge ? "skg-hover-pill dark" : "skg-hover-pill light"}>
            {starterBadge
              ? isEn
                ? "Add Preset"
                : "添加并启用"
              : isEn
                ? "Configure"
                : "编辑预设"}
          </span>
        </div>
      </div>

      <div className="skg-caption">
        <div className="skg-caption-row1">
          <strong className="skg-caption-title">{taste.name}</strong>
          {isDefault ? (
            <span className="skg-inline-status active">
              <Check aria-hidden="true" />
              <span>{isEn ? "Default" : "默认"}</span>
            </span>
          ) : null}
        </div>
        <div className="skg-caption-row2">
          <span className="skg-swatch-pair" aria-hidden="true">
            <i style={{ background: bg }} />
            <i style={{ background: accent }} />
          </span>
          <span className="skg-caption-meta">
            {sourceLabel} · {summary}
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
