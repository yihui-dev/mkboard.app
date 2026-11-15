import { useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Clapperboard,
  Code2,
  Compass,
  Film,
  Layers,
  Lock,
  Plus,
  Rocket,
  Sparkles,
  WandSparkles
} from "lucide-react";
import type { Skill } from "../../../shared";
import type { InterfaceLanguage } from "../i18n";

const CREATOR_POSTERS = [
  "https://media.skillry.dev/cdn-cgi/image/width=960,quality=82,fit=scale-down,format=auto/ai-motion-graphics/scatter-presenter.e74aa25307.webp",
  "https://media.skillry.dev/cdn-cgi/image/width=960,quality=82,fit=scale-down,format=auto/ai-motion-graphics/action-checklist.4909778e30.webp",
  "https://media.skillry.dev/cdn-cgi/image/width=960,quality=82,fit=scale-down,format=auto/ai-motion-graphics/sequential-bars.ca2ae067fb.webp",
  "https://media.skillry.dev/cdn-cgi/image/width=960,quality=82,fit=scale-down,format=auto/ai-motion-graphics/hub-routing.dc3de2ec33.webp",
  "https://media.skillry.dev/cdn-cgi/image/width=960,quality=82,fit=scale-down,format=auto/ai-motion-graphics/calculation-roi.c35179a2ed.webp",
  "https://media.skillry.dev/cdn-cgi/image/width=960,quality=82,fit=scale-down,format=auto/ai-motion-graphics/definition-reframe.776da87398.webp"
];

const LAUNCH_POSTERS = [
  "https://media.skillry.dev/cdn-cgi/image/width=960,quality=82,fit=scale-down,format=auto/product-launch-video/beat-hook.f692b5ce1d.webp",
  "https://media.skillry.dev/cdn-cgi/image/width=960,quality=82,fit=scale-down,format=auto/product-launch-video/beat-demo.3317300011.webp",
  "https://media.skillry.dev/cdn-cgi/image/width=960,quality=82,fit=scale-down,format=auto/product-launch-video/beat-close.6fdb4d7fdc.webp"
];

type EditorialArtPalette = {
  bg: string;
  accent: string;
  ink: string;
  cardBg: string;
  badgeBg: string;
  gridColor: string;
};

const EDITORIAL_ART_PALETTES: EditorialArtPalette[] = [
  {
    bg: "linear-gradient(135deg, #0F172A 0%, #1E293B 58%, #1E3A8A 100%)",
    accent: "#38BDF8",
    ink: "#F8FAFC",
    cardBg: "rgba(15, 23, 42, 0.72)",
    badgeBg: "rgba(56, 189, 248, 0.18)",
    gridColor: "rgba(148, 163, 184, 0.14)"
  },
  {
    bg: "linear-gradient(135deg, #FBF8F1 0%, #F3E9D7 58%, #E7D6B9 100%)",
    accent: "#D97706",
    ink: "#1C1917",
    cardBg: "rgba(255, 255, 255, 0.84)",
    badgeBg: "rgba(217, 119, 6, 0.14)",
    gridColor: "rgba(28, 25, 23, 0.07)"
  },
  {
    bg: "linear-gradient(135deg, #0D1F1B 0%, #13332B 58%, #065F46 100%)",
    accent: "#34D399",
    ink: "#ECFDF5",
    cardBg: "rgba(6, 36, 29, 0.74)",
    badgeBg: "rgba(52, 211, 153, 0.18)",
    gridColor: "rgba(167, 243, 208, 0.12)"
  },
  {
    bg: "linear-gradient(135deg, #23192D 0%, #3B234A 58%, #581C87 100%)",
    accent: "#C084FC",
    ink: "#FAF5FF",
    cardBg: "rgba(29, 18, 43, 0.74)",
    badgeBg: "rgba(192, 132, 252, 0.2)",
    gridColor: "rgba(233, 213, 255, 0.12)"
  },
  {
    bg: "linear-gradient(135deg, #FFF5F0 0%, #FDE3D5 58%, #F9C6AE 100%)",
    accent: "#EA580C",
    ink: "#291811",
    cardBg: "rgba(255, 255, 255, 0.85)",
    badgeBg: "rgba(234, 88, 12, 0.14)",
    gridColor: "rgba(41, 24, 17, 0.07)"
  },
  {
    bg: "linear-gradient(135deg, #EEF4FF 0%, #DBEAFE 56%, #BFDBFE 100%)",
    accent: "#2563EB",
    ink: "#0F172A",
    cardBg: "rgba(255, 255, 255, 0.86)",
    badgeBg: "rgba(37, 99, 235, 0.14)",
    gridColor: "rgba(15, 23, 42, 0.07)"
  }
];

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

function extractSkillFeatureTags(skill: Skill, isEn: boolean): string[] {
  if (skill.locked || skill.id === "default-storyboard") {
    return isEn
      ? ["A/B-Roll Split", "Visual Prompts", "Shot Timing"]
      : ["A/B-Roll 拆解", "画面提示词", "时长节奏"];
  }
  if (skill.id.includes("bs-creatormotion")) {
    return isEn
      ? ["122+ Motion Graphics", "4 Color Systems", "Editable B-Roll"]
      : ["122+ 动态图形", "4 套配色体系", "可编辑 B-Roll"];
  }
  if (skill.id.includes("bs-launchmotion")) {
    return isEn
      ? ["208+ Launch Scenes", "6 Brand Palettes", "SaaS & Product"]
      : ["208+ 发布场景", "6 套品牌色", "产品宣传片"];
  }

  const headings = [...skill.content.matchAll(/^#{2,3}\s+([^\n#]{2,22})/gm)]
    .map((m) => m[1].trim())
    .filter(Boolean)
    .slice(0, 3);

  if (headings.length > 0) {
    return headings;
  }

  return isEn ? ["Custom Rules", "SKILL.md"] : ["自定义分镜规范", "SKILL.md"];
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
        poster: LAUNCH_POSTERS[0],
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
          label: isEn ? "Official · Core Engine" : "官方内置 · 核心分镜",
          tone: "amber",
          Icon: Clapperboard
        };
      case "creator-master":
      case "creator-sub":
        return {
          label: kind === "creator-master" ? "Skillry · CreatorMotion" : (isEn ? "CreatorMotion Sub-Skill" : "CreatorMotion 子动效"),
          tone: "emerald",
          Icon: WandSparkles
        };
      case "launch-master":
      case "launch-sub":
        return {
          label: kind === "launch-master" ? "Skillry · LaunchMotion" : (isEn ? "LaunchMotion Scene" : "LaunchMotion 场景"),
          tone: "blue",
          Icon: Rocket
        };
      case "github-imported":
        return {
          label: isEn ? "GitHub / Imported" : "GitHub / 外部导入",
          tone: "slate",
          Icon: Code2
        };
      default:
        return {
          label: isEn ? "Custom Skill" : "我的自定义技能",
          tone: "violet",
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
        if (videoRef.current) {
          videoRef.current.pause();
        }
      }}
    >
      <div className="skg-cover">
        {kind === "system-storyboard" ? (
          <div className="skg-art-storyboard" aria-hidden="true">
            <div className="skg-art-storyboard-glow" />
            <div className="skg-storyboard-sheet">
              <div className="skg-sb-header">
                <span className="skg-sb-brand">
                  <Film />
                  <span>STORYBOARD ENGINE</span>
                </span>
                <span className="skg-sb-ratio">16:9 · HD</span>
              </div>
              <div className="skg-sb-rows">
                <div className="skg-sb-row">
                  <span className="skg-sb-shot">01</span>
                  <span className="skg-sb-pill aroll">A-ROLL</span>
                  <div className="skg-sb-wave">
                    <i style={{ height: "45%" }} />
                    <i style={{ height: "85%" }} />
                    <i style={{ height: "60%" }} />
                    <i style={{ height: "95%" }} />
                    <i style={{ height: "50%" }} />
                    <i style={{ height: "75%" }} />
                  </div>
                  <span className="skg-sb-time">3.5s</span>
                </div>
                <div className="skg-sb-row highlight">
                  <span className="skg-sb-shot">02</span>
                  <span className="skg-sb-pill broll">B-ROLL</span>
                  <span className="skg-sb-prompt-bar">
                    <span className="skg-sb-thumb" />
                    <span>{isEn ? "Cinematic Visual Prompt" : "分镜画面与视频提示词"}</span>
                  </span>
                  <span className="skg-sb-time">4.0s</span>
                </div>
                <div className="skg-sb-row">
                  <span className="skg-sb-shot">03</span>
                  <span className="skg-sb-pill motion">MOTION</span>
                  <span className="skg-sb-bars">
                    <b style={{ width: "68%" }} />
                  </span>
                  <span className="skg-sb-time">2.8s</span>
                </div>
              </div>
            </div>
          </div>
        ) : mediaInfo && !imgFailed ? (
          <div className="skg-art-media" aria-hidden="true">
            {mediaInfo.video ? (
              <video
                ref={videoRef}
                className="skg-cover-video"
                src={mediaInfo.video}
                poster={mediaInfo.poster}
                muted
                loop
                playsInline
                preload="metadata"
              />
            ) : (
              <img
                className="skg-cover-img"
                src={mediaInfo.poster}
                alt=""
                loading="lazy"
                onError={() => setImgFailed(true)}
              />
            )}
            <div className="skg-cover-scrim" />
            <div className="skg-media-dots">
              {mediaInfo.dots.map((hex) => (
                <span key={hex} style={{ background: hex }} />
              ))}
            </div>
          </div>
        ) : (
          <div
            className="skg-art-editorial"
            style={{
              background: palette.bg,
              color: palette.ink,
              ["--skg-grid" as string]: palette.gridColor,
              ["--skg-accent" as string]: palette.accent
            }}
            aria-hidden="true"
          >
            <div className="skg-editorial-orb" style={{ background: palette.accent }} />
            <div className="skg-editorial-window" style={{ background: palette.cardBg }}>
              <div className="skg-ew-top">
                <span className="skg-ew-dots">
                  <i style={{ background: palette.accent }} />
                  <i />
                  <i />
                </span>
                <span className="skg-ew-spec" style={{ background: palette.badgeBg, color: palette.accent }}>
                  SKILL.MD
                </span>
              </div>
              <div className="skg-ew-main">
                <div className="skg-ew-icon" style={{ borderColor: `${palette.accent}44`, color: palette.accent }}>
                  <Compass />
                </div>
                <div className="skg-ew-lines">
                  <span className="skg-ew-title-line" style={{ background: palette.ink }} />
                  <span className="skg-ew-sub-line" style={{ background: palette.accent }} />
                  <div className="skg-ew-tags">
                    {tags.slice(0, 2).map((tg) => (
                      <em key={tg} style={{ borderColor: `${palette.ink}22`, color: palette.ink }}>
                        {tg}
                      </em>
                    ))}
                  </div>
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
          {skill.locked ? (
            <span className="skg-lock-pill" title={isEn ? "Read-only built-in skill" : "官方内置只读技能"}>
              <Lock aria-hidden="true" />
            </span>
          ) : null}
        </div>
      </div>

      <div className="skg-body">
        <div className="skg-title-row">
          {iconNode}
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
            <span>{skill.locked ? (isEn ? "Built-in Spec" : "查看内置规则") : isEn ? "Editable SKILL" : "支持自定义编辑"}</span>
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

export function SkillCreateActionCard({
  locale,
  onCreate,
  onImportGithub
}: {
  locale: InterfaceLanguage;
  onCreate: () => void;
  onImportGithub: () => void;
}) {
  const isEn = locale === "en";
  return (
    <div className="skg-card skg-create-card">
      <button type="button" className="skg-create-main" onClick={onCreate}>
        <div className="skg-cover skg-create-cover" aria-hidden="true">
          <div className="skg-create-blueprint">
            <span className="skg-create-plus">
              <Plus />
            </span>
            <span className="skg-create-caption">
              {isEn ? "AUTHOR NEW STORYBOARD SKILL" : "新建专属分镜技能规范"}
            </span>
          </div>
        </div>
        <div className="skg-body">
          <div className="skg-title-row">
            <span className="skg-create-mini-icon" aria-hidden="true">
              <BookOpen />
            </span>
            <div className="skg-title-col">
              <strong className="skg-title">{isEn ? "Create Custom Skill" : "新建自定义分镜技能"}</strong>
              <span className="skg-scope-sub">{isEn ? "Markdown Prompt & Shot Rules" : "支持 Markdown 编写镜头拆解与提示词模版"}</span>
            </div>
          </div>
          <p className="skg-desc">
            {isEn
              ? "Define your own pacing, shot categories, B-Roll density, or import an open-source SKILL.md from GitHub."
              : "沉淀你的专属口播节奏、镜头分类与 B-Roll 提示词结构，或直接从 GitHub 导入开源 SKILL.md。"}
          </p>
        </div>
      </button>
      <div className="skg-create-actions">
        <button type="button" className="hub-btn hub-btn-dark hub-btn-sm" onClick={onCreate}>
          <Plus aria-hidden="true" />
          <span>{isEn ? "New Skill" : "空白创建"}</span>
        </button>
        <button type="button" className="hub-btn hub-btn-outline hub-btn-sm" onClick={onImportGithub}>
          <Code2 aria-hidden="true" />
          <span>{isEn ? "Import GitHub / ZIP" : "导入 GitHub / ZIP"}</span>
        </button>
      </div>
    </div>
  );
}
