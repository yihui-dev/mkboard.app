import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import vm from "node:vm";
import crossSpawn from "cross-spawn";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import type {
  AgentCliId,
  ExternalSourceImportInput,
  Skill,
  SkillryAccessCheckResult,
  SkillryAccountState,
  SkillryCatalogStatus,
  SkillryCollectionDetail,
  SkillryDeviceAuthSession,
  SkillryInstallInput,
  SkillryInstallResult,
  SkillryPackId,
  SkillryPackPricingTier,
  SkillryPackStatus,
  SkillrySubEffectItem,
  SkillryVisualThemeItem,
  Taste,
  TastePreview
} from "../shared";
import { localCliSpawnEnv, localToolchainExecutableCandidates, resolveAgentCliExecutable } from "./codex-auth";
import type { MkboardStore } from "./database";

const SKILLRY_BASE_URL = "https://skillry.dev";
const SKILLRY_MEDIA_BASE_URL = "https://media.skillry.dev";
const KEYRING_SERVICE = "com.best-ai-skills.cli.session";
const KEYRING_ACCOUNT = createHash("sha256").update(SKILLRY_BASE_URL).digest("hex");
const DEVICE_CLIENT_ID = "skillry-cli";
const DEVICE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";
const MEMBERS_ONLY_PRICE_USD_CENTS = 99_999;

type SkillryPackDefinition = {
  slug: SkillryPackId;
  mkboardSkillId: string;
  title: string;
  subtitle: string;
  pricingTier: SkillryPackPricingTier;
  totalEffectsCount: number;
  freeEffectsCount: number;
  landingUrl: string;
  skillPageUrl: string;
  installDocUrl: string;
  pricingUrl: string;
  heroVideoUrl: string;
  heroPosterUrl: string;
  featuredPosters: string[];
  categoryTagsZh: string[];
  categoryTagsEn: string[];
  themes: SkillryVisualThemeItem[];
  iconId: string;
  gradientId: string;
  storyboardGuidance: string;
};

const CREATORMOTION_THEMES: SkillryVisualThemeItem[] = [
  {
    id: "white-yellow",
    packSlug: "bs-creatormotion",
    nameZh: "白底暖黄 · 瑞士讲稿",
    nameEn: "White & Warm Yellow",
    descriptionZh: "明亮干净的知识口播底色，配合高辨识度暖黄重点高亮，适合商业拆解与教程讲解。",
    descriptionEn: "Clean editorial light background with warm yellow emphasis for explainer B-roll.",
    swatches: ["#FAF9F5", "#141413", "#F4C542", "#6E6D68"],
    posterUrl: `${SKILLRY_BASE_URL}/skills/bs-creatormotion-split-chart-swap/media/cover.webp?variant=card`,
    previewVideoUrl: `${SKILLRY_BASE_URL}/skills/bs-creatormotion-split-chart-swap/media/preview-1.mp4`,
    tasteRules: "采用瑞士现代知识讲稿视觉：暖白纸感背景 (#FAF9F5)、深炭黑主标题 (#141413)、高对比暖黄重点标记 (#F4C542)，排版留白充足、层级克制清晰。"
  },
  {
    id: "charcoal-lime",
    packSlug: "bs-creatormotion",
    nameZh: "炭黑荧光绿 · 极客科技",
    nameEn: "Charcoal & Signal Lime",
    descriptionZh: "深炭黑工程底色搭配高能荧光绿信号色，适合 AI 评测、代码架构与硬核科技口播。",
    descriptionEn: "Deep charcoal stage with crisp signal-lime accents for AI, dev, and tech commentary.",
    swatches: ["#141517", "#F3F4F6", "#B6F042", "#272A30"],
    posterUrl: `${SKILLRY_MEDIA_BASE_URL}/cdn-cgi/image/width=768,quality=80,fit=scale-down,format=auto/ai-motion-graphics/hub-routing.dc3de2ec33.webp`,
    previewVideoUrl: `${SKILLRY_BASE_URL}/skills/bs-creatormotion-split-chart-swap/media/preview-2.mp4`,
    tasteRules: "采用深色极客工程视觉：炭黑底色 (#141517)、冷白正文 (#F3F4F6)、荧光绿关键指标与信号线 (#B6F042)，强调数据对比与几何结构感。"
  },
  {
    id: "paper-orange",
    packSlug: "bs-creatormotion",
    nameZh: "暖纸信号橙 · 杂志叙事",
    nameEn: "Paper & Editorial Orange",
    descriptionZh: "温润纸张肌理配复古工业橙，适合人物故事、深度商业评论与播客切片。",
    descriptionEn: "Warm off-white paper paired with industrial orange for essays and storytelling.",
    swatches: ["#F4EFE6", "#1D1B18", "#EB5E28", "#8C8479"],
    posterUrl: `${SKILLRY_MEDIA_BASE_URL}/cdn-cgi/image/width=768,quality=80,fit=scale-down,format=auto/ai-motion-graphics/quote-evidence.28eb405593.webp`,
    previewVideoUrl: `${SKILLRY_BASE_URL}/skills/bs-creatormotion-split-chart-swap/media/preview-3.mp4`,
    tasteRules: "采用人文杂志叙事视觉：米白暖纸底色 (#F4EFE6)、浓黑衬线/无衬线混排 (#1D1B18)、工业信号橙视觉锚点 (#EB5E28)，沉稳且富有人文质感。"
  },
  {
    id: "midnight-ice",
    packSlug: "bs-creatormotion",
    nameZh: "午夜冰蓝 · 金融研报",
    nameEn: "Midnight & Ice Blue",
    descriptionZh: "深海蓝夜色配冷冽冰蓝高亮，适合宏观财经、增长复盘与严谨数据推演。",
    descriptionEn: "Midnight navy canvas with ice-blue data highlights for finance and analytics.",
    swatches: ["#0D1526", "#EEF4FF", "#5CE1E6", "#1E2D4A"],
    posterUrl: `${SKILLRY_MEDIA_BASE_URL}/cdn-cgi/image/width=768,quality=80,fit=scale-down,format=auto/ai-motion-graphics/sequential-bars.ca2ae067fb.webp`,
    previewVideoUrl: `${SKILLRY_BASE_URL}/skills/bs-creatormotion-split-chart-swap/media/preview-4.mp4`,
    tasteRules: "采用严谨研报深蓝视觉：午夜深蓝底色 (#0D1526)、冰白数字标题 (#EEF4FF)、冰青蓝高亮曲线 (#5CE1E6)，突出专业度与精密秩序。"
  }
];

const LAUNCHMOTION_THEMES: SkillryVisualThemeItem[] = [
  {
    id: "blue",
    packSlug: "bs-launchmotion",
    nameZh: "电光科技蓝 · SaaS 旗舰",
    nameEn: "Electric SaaS Blue",
    descriptionZh: "LaunchMotion 标志性硅谷产品发布配色，通透毛玻璃卡片搭配电光蓝聚焦动效。",
    descriptionEn: "Flagship SaaS launch aesthetic with frosted glass surfaces and electric blue focus.",
    swatches: ["#F7F9FC", "#0F172A", "#2F6BFF", "#DCE7FF"],
    posterUrl: `${SKILLRY_MEDIA_BASE_URL}/cdn-cgi/image/width=768,quality=80,fit=scale-down,format=auto/product-launch-video/themes/cta-business-segment-cards-blue.54d3d56820.webp`,
    previewVideoUrl: `${SKILLRY_MEDIA_BASE_URL}/product-launch-video/themes/cta-business-segment-cards-blue.044b67aa8f.mp4`,
    tasteRules: "采用硅谷旗舰 SaaS 发布片视觉：极简冷白空间 (#F7F9FC)、深石板黑大字重标题 (#0F172A)、电光蓝交互焦点 (#2F6BFF) 与细腻毛玻璃卡片。"
  },
  {
    id: "mono",
    packSlug: "bs-launchmotion",
    nameZh: "纯粹黑白 · 硬件与极简",
    nameEn: "Pure Monochrome",
    descriptionZh: "零冗余纯黑白光影张力，适合 AI Agent、开发者工具与高格调品牌首发。",
    descriptionEn: "High-contrast monochrome precision for AI agents, dev tools, and minimalist launches.",
    swatches: ["#FAF9F7", "#1F1E1C", "#575551", "#E5E3DF"],
    posterUrl: `${SKILLRY_MEDIA_BASE_URL}/cdn-cgi/image/width=768,quality=80,fit=scale-down,format=auto/product-launch-video/themes/cta-business-segment-cards-mono.a7246e3dd7.webp`,
    previewVideoUrl: `${SKILLRY_MEDIA_BASE_URL}/product-launch-video/themes/cta-business-segment-cards-mono.cd58b3069c.mp4`,
    tasteRules: "采用极简纯黑白发布片视觉：纯粹黑白灰阶对比 (#FAF9F7 / #1F1E1C)，依靠精密微交互缩放、字重反差与光影节奏传递高级感。"
  },
  {
    id: "orange",
    packSlug: "bs-launchmotion",
    nameZh: "活力信号橙 · 增长先锋",
    nameEn: "Signal Launch Orange",
    descriptionZh: "极具冲击力的先锋橙色视觉锤，适合高能量新产品亮相与社交平台病毒传播。",
    descriptionEn: "Bold kinetic orange accent built for high-energy product reveals on X and YouTube.",
    swatches: ["#FFFBF7", "#1C1917", "#F37021", "#FED7AA"],
    posterUrl: `${SKILLRY_MEDIA_BASE_URL}/cdn-cgi/image/width=768,quality=80,fit=scale-down,format=auto/product-launch-video/themes/cta-business-segment-cards-orange.a53573b618.webp`,
    previewVideoUrl: `${SKILLRY_MEDIA_BASE_URL}/product-launch-video/themes/cta-business-segment-cards-orange.edf5bdab97.mp4`,
    tasteRules: "采用先锋信号橙发布片视觉：暖白画布 (#FFFBF7) 搭配高饱和活力橙 (#F37021) 按钮与光标焦点，节奏明快利落。"
  },
  {
    id: "green",
    packSlug: "bs-launchmotion",
    nameZh: "翡翠品牌绿 · 金融与效率",
    nameEn: "Emerald Brand Accent",
    descriptionZh: "支持注入任意品牌主色（--accent），翡翠绿演绎金融科技、健康与工作流产品质感。",
    descriptionEn: "Custom brand accent render demonstrating crisp emerald fintech & productivity styling.",
    swatches: ["#F6FBF9", "#0F1F1A", "#10B981", "#D1FAE5"],
    posterUrl: `${SKILLRY_MEDIA_BASE_URL}/cdn-cgi/image/width=768,quality=80,fit=scale-down,format=auto/product-launch-video/themes/cta-business-segment-cards-green.d10dd187d5.webp`,
    previewVideoUrl: `${SKILLRY_MEDIA_BASE_URL}/product-launch-video/themes/cta-business-segment-cards-green.6b584ab723.mp4`,
    tasteRules: "采用清新翡翠绿品牌视觉：浅薄荷白背景 (#F6FBF9)、墨绿深色标题 (#0F1F1A) 与翡翠绿增长指标高亮 (#10B981)。"
  },
  {
    id: "rose",
    packSlug: "bs-launchmotion",
    nameZh: "绯红创意色 · 消费与设计",
    nameEn: "Crimson Rose Accent",
    descriptionZh: "鲜明绯红品牌色渲染，适合设计工具、创作者经济与潮流消费级应用预告。",
    descriptionEn: "Expressive rose-crimson brand accent tailored for creator apps and design tools.",
    swatches: ["#FFF8F9", "#231015", "#E11D48", "#FFE4E6"],
    posterUrl: `${SKILLRY_MEDIA_BASE_URL}/cdn-cgi/image/width=768,quality=80,fit=scale-down,format=auto/product-launch-video/themes/cta-business-segment-cards-rose.4b4303ed25.webp`,
    previewVideoUrl: `${SKILLRY_MEDIA_BASE_URL}/product-launch-video/themes/cta-business-segment-cards-rose.fda43c5c40.mp4`,
    tasteRules: "采用时尚绯红创意视觉：柔白底色 (#FFF8F9)、深酒红黑字体 (#231015) 与玫瑰绯红视觉焦点 (#E11D48)。"
  },
  {
    id: "gold",
    packSlug: "bs-launchmotion",
    nameZh: "流光琥珀金 · 旗舰尊享",
    nameEn: "Amber Gold Accent",
    descriptionZh: "温暖琥珀金品牌色演绎，适合年度大版本发布、会员体系与精品应用宣传。",
    descriptionEn: "Warm amber-gold brand accent crafted for flagship milestones and premium editions.",
    swatches: ["#FFFDF6", "#1F1A0E", "#F5B800", "#FEF08A"],
    posterUrl: `${SKILLRY_MEDIA_BASE_URL}/cdn-cgi/image/width=768,quality=80,fit=scale-down,format=auto/product-launch-video/themes/cta-business-segment-cards-gold.12336ab5f8.webp`,
    previewVideoUrl: `${SKILLRY_MEDIA_BASE_URL}/product-launch-video/themes/cta-business-segment-cards-gold.fe9b807364.mp4`,
    tasteRules: "采用琥珀流金旗舰视觉：暖白丝绸感画布 (#FFFDF6)、深棕黑标题 (#1F1A0E) 与琥珀金徽章及光标动效 (#F5B800)。"
  }
];

export const SKILLRY_OFFICIAL_PACKS: Record<SkillryPackId, SkillryPackDefinition> = {
  "bs-creatormotion": {
    slug: "bs-creatormotion",
    mkboardSkillId: "skill-skillry-bs-creatormotion",
    title: "CreatorMotion",
    subtitle: "自媒体口播 / 知识讲解动态图形合集（122 个可编辑子效果 · 含免费体验，Pro 解锁全集）",
    pricingTier: "freemium_pro",
    totalEffectsCount: 122,
    freeEffectsCount: 2,
    landingUrl: `${SKILLRY_BASE_URL}/ai-videos/ai-motion-graphics`,
    skillPageUrl: `${SKILLRY_BASE_URL}/skills/bs-creatormotion`,
    installDocUrl: `${SKILLRY_BASE_URL}/skills/bs-creatormotion/install.md`,
    pricingUrl: `${SKILLRY_BASE_URL}/pricing`,
    heroVideoUrl: `${SKILLRY_MEDIA_BASE_URL}/ai-motion-graphics/format-16x9.a171f29e2c.mp4`,
    heroPosterUrl: `${SKILLRY_MEDIA_BASE_URL}/cdn-cgi/image/width=1080,quality=80,fit=scale-down,format=auto/ai-motion-graphics/scatter-presenter.e74aa25307.webp`,
    featuredPosters: [
      `${SKILLRY_MEDIA_BASE_URL}/cdn-cgi/image/width=480,quality=80,fit=scale-down,format=auto/ai-motion-graphics/scatter-presenter.e74aa25307.webp`,
      `${SKILLRY_MEDIA_BASE_URL}/cdn-cgi/image/width=480,quality=80,fit=scale-down,format=auto/ai-motion-graphics/sequential-bars.ca2ae067fb.webp`,
      `${SKILLRY_MEDIA_BASE_URL}/cdn-cgi/image/width=480,quality=80,fit=scale-down,format=auto/ai-motion-graphics/hub-routing.dc3de2ec33.webp`
    ],
    categoryTagsZh: ["章节转场", "数据对比", "结构拆解", "口播分屏", "动态排版", "清单卡片"],
    categoryTagsEn: ["Chapters", "Data & Charts", "Diagrams", "Presenter Split", "Kinetic Type", "Cards & Lists"],
    themes: CREATORMOTION_THEMES,
    iconId: "wand-sparkles",
    gradientId: "apricot-grey",
    storyboardGuidance: [
      "你是结合 Skillry 官方 CreatorMotion 动效库的口播与知识讲解分镜导演。",
      "1. 识别脚本中真正受益于动态视觉解释的节点（数量变化、前后对比、流程关系、集合累积、章节切换、金句强调），将该分镜的生成方式设为 Hyperframes，并在视频提示词中写明对应的画面变化逻辑与可编辑文案。",
      "2. 口播主讲人出镜自然段落保留为 A-ROLL；需要写实摄影或镜头运动的画面使用 ChatGPT Image2 / Seedance 2.0，不要把所有镜头机械塞成同一种卡片。",
      "3. 当本机已安装 ~/.agents/skills/bs-creatormotion（或其子效果）时，HyperFrames 生成阶段优先参考其 references 规范（white-yellow、charcoal-lime、paper-orange、midnight-ice 配色体系与中文排版规范）。"
    ].join("\n")
  },
  "bs-launchmotion": {
    slug: "bs-launchmotion",
    mkboardSkillId: "skill-skillry-bs-launchmotion",
    title: "LaunchMotion",
    subtitle: "产品发布片 / SaaS 宣传片动效场景合集（208 个高转化发布场景 · 6 套品牌色 · 含免费体验，Pro 解锁全集）",
    pricingTier: "paid_pro",
    totalEffectsCount: 208,
    freeEffectsCount: 8,
    landingUrl: `${SKILLRY_BASE_URL}/ai-videos/product-launch-video`,
    skillPageUrl: `${SKILLRY_BASE_URL}/skills/bs-launchmotion`,
    installDocUrl: `${SKILLRY_BASE_URL}/skills/bs-launchmotion/install.md`,
    pricingUrl: `${SKILLRY_BASE_URL}/pricing`,
    heroVideoUrl: `${SKILLRY_MEDIA_BASE_URL}/product-launch-video/hero.66bd4589cc.mp4`,
    heroPosterUrl: `${SKILLRY_MEDIA_BASE_URL}/cdn-cgi/image/width=1080,quality=80,fit=scale-down,format=auto/product-launch-video/hero.635baeb12c.webp`,
    featuredPosters: [
      `${SKILLRY_MEDIA_BASE_URL}/cdn-cgi/image/width=480,quality=80,fit=scale-down,format=auto/product-launch-video/beat-hook.f692b5ce1d.webp`,
      `${SKILLRY_MEDIA_BASE_URL}/cdn-cgi/image/width=480,quality=80,fit=scale-down,format=auto/product-launch-video/beat-demo.3317300011.webp`,
      `${SKILLRY_MEDIA_BASE_URL}/cdn-cgi/image/width=480,quality=80,fit=scale-down,format=auto/product-launch-video/beat-close.6fdb4d7fdc.webp`
    ],
    categoryTagsZh: ["痛点与输入", "产品 UI 演示", "Agent 流程", "数据背书", "矩阵画廊", "品牌收尾 CTA"],
    categoryTagsEn: ["Prompt & Hook", "Product UI", "Agent Flow", "Data Proof", "Grid & Moodboard", "Brand CTA"],
    themes: LAUNCHMOTION_THEMES,
    iconId: "rocket",
    gradientId: "periwinkle-haze",
    storyboardGuidance: [
      "你是结合 Skillry 官方 LaunchMotion 发布片套件的产品宣传片导演。",
      "1. 按高转化产品发布片节奏拆分镜头：Hook 痛点钩子 -> 旧方案对比 -> 核心产品 UI 演示 -> 关键指标/客户背书 (Proof) -> 品牌收尾与行动号召 (CTA Wordmark)。",
      "2. 产品 UI 演示、指标跳动、特性拆解、品牌口号收尾优先将生成方式设为 Hyperframes，并在视频提示词中明确界面元素层级、交互焦点、文案语言和时长（6–15 秒）。",
      "3. 当本机已安装 ~/.agents/skills/bs-launchmotion（或其子场景）时，HyperFrames 生成阶段优先参考其本机场景规范与组件动效节奏，严禁虚构不存在的产品数据。"
    ].join("\n")
  }
};

// Built-in public showcase fallback items (metadata + public CDN URLs ONLY — zero skill code)
const FALLBACK_SUB_EFFECTS: Record<SkillryPackId, Array<Omit<SkillrySubEffectItem, "installedLocally" | "syncedToMkboard">>> = {
  "bs-creatormotion": [
    {
      slug: "bs-creatormotion-cards-action-checklist",
      packSlug: "bs-creatormotion",
      effectId: "cards-action-checklist",
      category: "cards",
      name: "录屏操作同步勾选",
      description: "随讲解节奏逐条点亮执行清单，适合实操教程、SOP 拆解与复盘总结。",
      priceUsdCents: 0,
      posterUrl: `${SKILLRY_BASE_URL}/skills/bs-creatormotion-cards-action-checklist/media/cover.webp?variant=card`,
      previewVideoUrl: `${SKILLRY_BASE_URL}/skills/bs-creatormotion-cards-action-checklist/media/preview.mp4`,
      skillPageUrl: `${SKILLRY_BASE_URL}/skills/bs-creatormotion-cards-action-checklist`
    },
    {
      slug: "bs-creatormotion-chapter-title-stamp",
      packSlug: "bs-creatormotion",
      effectId: "chapter-title-stamp",
      category: "chapter",
      name: "倾斜章节标题落定",
      description: "章节标题带着克制倾角与缩放落定，配合几何遮罩自然衔接到下一段口播。",
      priceUsdCents: 0,
      posterUrl: `${SKILLRY_BASE_URL}/skills/bs-creatormotion-chapter-title-stamp/media/cover.webp?variant=card`,
      previewVideoUrl: `${SKILLRY_BASE_URL}/skills/bs-creatormotion-chapter-title-stamp/media/preview.mp4`,
      skillPageUrl: `${SKILLRY_BASE_URL}/skills/bs-creatormotion-chapter-title-stamp`
    },
    {
      slug: "bs-creatormotion-split-chart-swap",
      packSlug: "bs-creatormotion",
      effectId: "split-chart-swap",
      category: "split",
      name: "口播人像与图表双栏联动",
      description: "主讲人画面与动态数据图表同屏分栏切换，让口播观点拥有直观数字支撑。",
      priceUsdCents: 499,
      posterUrl: `${SKILLRY_BASE_URL}/skills/bs-creatormotion-split-chart-swap/media/cover.webp?variant=card`,
      previewVideoUrl: `${SKILLRY_BASE_URL}/skills/bs-creatormotion-split-chart-swap/media/preview.mp4`,
      skillPageUrl: `${SKILLRY_BASE_URL}/skills/bs-creatormotion-split-chart-swap`
    },
    {
      slug: "bs-creatormotion-comparison-sequential-bars",
      packSlug: "bs-creatormotion",
      effectId: "comparison-sequential-bars",
      category: "comparison",
      name: "序列柱状差距对比",
      description: "按叙事顺序逐根生长对比柱状图，直观呈现成本、速度或倍率量级差异。",
      priceUsdCents: 499,
      posterUrl: `${SKILLRY_BASE_URL}/skills/bs-creatormotion-comparison-sequential-bars/media/cover.webp?variant=card`,
      previewVideoUrl: `${SKILLRY_BASE_URL}/skills/bs-creatormotion-comparison-sequential-bars/media/preview.mp4`,
      skillPageUrl: `${SKILLRY_BASE_URL}/skills/bs-creatormotion-comparison-sequential-bars`
    },
    {
      slug: "bs-creatormotion-diagram-hub-routing",
      packSlug: "bs-creatormotion",
      effectId: "diagram-hub-routing",
      category: "diagram",
      name: "中心枢纽路由图解",
      description: "清晰展示输入请求如何经由核心引擎分发到多个下游节点，适合架构与工作流讲解。",
      priceUsdCents: 499,
      posterUrl: `${SKILLRY_BASE_URL}/skills/bs-creatormotion-diagram-hub-routing/media/cover.webp?variant=card`,
      previewVideoUrl: `${SKILLRY_BASE_URL}/skills/bs-creatormotion-diagram-hub-routing/media/preview.mp4`,
      skillPageUrl: `${SKILLRY_BASE_URL}/skills/bs-creatormotion-diagram-hub-routing`
    },
    {
      slug: "bs-creatormotion-type-title-takeover",
      packSlug: "bs-creatormotion",
      effectId: "type-title-takeover",
      category: "type",
      name: "核心金句全屏接管",
      description: "在关键转折处用高张力动态大字全屏强调核心结论，瞬间抓住观众注意力。",
      priceUsdCents: 499,
      posterUrl: `${SKILLRY_BASE_URL}/skills/bs-creatormotion-type-title-takeover/media/cover.webp?variant=card`,
      previewVideoUrl: `${SKILLRY_BASE_URL}/skills/bs-creatormotion-type-title-takeover/media/preview.mp4`,
      skillPageUrl: `${SKILLRY_BASE_URL}/skills/bs-creatormotion-type-title-takeover`
    },
    {
      slug: "bs-creatormotion-type-behind-subject",
      packSlug: "bs-creatormotion",
      effectId: "type-behind-subject",
      category: "type",
      name: "人物前景景深大字",
      description: "超大主题词在主讲人身后分层滑入，营造高质感杂志级口播开场。",
      priceUsdCents: 499,
      posterUrl: `${SKILLRY_BASE_URL}/skills/bs-creatormotion-type-behind-subject/media/cover.webp?variant=card`,
      previewVideoUrl: `${SKILLRY_BASE_URL}/skills/bs-creatormotion-type-behind-subject/media/preview.mp4`,
      skillPageUrl: `${SKILLRY_BASE_URL}/skills/bs-creatormotion-type-behind-subject`
    },
    {
      slug: "bs-creatormotion-comparison-paired-swap",
      packSlug: "bs-creatormotion",
      effectId: "comparison-paired-swap",
      category: "comparison",
      name: "新旧方案成对翻转对比",
      description: "把传统繁琐做法与新方案左右并置切换，适合痛点拆解与认知纠偏。",
      priceUsdCents: 499,
      posterUrl: `${SKILLRY_BASE_URL}/skills/bs-creatormotion-comparison-paired-swap/media/cover.webp?variant=card`,
      previewVideoUrl: `${SKILLRY_BASE_URL}/skills/bs-creatormotion-comparison-paired-swap/media/preview.mp4`,
      skillPageUrl: `${SKILLRY_BASE_URL}/skills/bs-creatormotion-comparison-paired-swap`
    }
  ],
  "bs-launchmotion": [
    {
      slug: "bs-launchmotion-reveal-laptop-phone-terminal",
      packSlug: "bs-launchmotion",
      effectId: "reveal-laptop-phone-terminal",
      category: "reveal",
      name: "多端协同全景拉远",
      description: "从笔记本特写拉远至手机、终端与团队协作全景，展示产品跨端无缝同步能力。",
      priceUsdCents: 0,
      posterUrl: `${SKILLRY_BASE_URL}/skills/bs-launchmotion-reveal-laptop-phone-terminal/media/cover.webp?variant=card`,
      previewVideoUrl: `${SKILLRY_BASE_URL}/skills/bs-launchmotion-reveal-laptop-phone-terminal/media/preview.mp4`,
      skillPageUrl: `${SKILLRY_BASE_URL}/skills/bs-launchmotion-reveal-laptop-phone-terminal`
    },
    {
      slug: "bs-launchmotion-grid-angle-moodboards-hard",
      packSlug: "bs-launchmotion",
      effectId: "grid-angle-moodboards-hard",
      category: "grid",
      name: "灵感情绪板磁吸拼合",
      description: "散落的参考素材卡片高速交替漂移后磁吸归位成整洁画板，适合设计/创意工具开场。",
      priceUsdCents: 0,
      posterUrl: `${SKILLRY_BASE_URL}/skills/bs-launchmotion-grid-angle-moodboards-hard/media/cover.webp?variant=card`,
      previewVideoUrl: `${SKILLRY_BASE_URL}/skills/bs-launchmotion-grid-angle-moodboards-hard/media/preview.mp4`,
      skillPageUrl: `${SKILLRY_BASE_URL}/skills/bs-launchmotion-grid-angle-moodboards-hard`
    },
    {
      slug: "bs-launchmotion-ui-agent-shortlists-influencers",
      packSlug: "bs-launchmotion",
      effectId: "ui-agent-shortlists-influencers",
      category: "ui",
      name: "Agent 自动筛选与状态流转",
      description: "展示 AI Agent 自动生成候选列表并在审批后依次流转为已完成状态。",
      priceUsdCents: 0,
      posterUrl: `${SKILLRY_BASE_URL}/skills/bs-launchmotion-ui-agent-shortlists-influencers/media/cover.webp?variant=card`,
      previewVideoUrl: `${SKILLRY_BASE_URL}/skills/bs-launchmotion-ui-agent-shortlists-influencers/media/preview.mp4`,
      skillPageUrl: `${SKILLRY_BASE_URL}/skills/bs-launchmotion-ui-agent-shortlists-influencers`
    },
    {
      slug: "bs-launchmotion-type-demonstrate-parameter-system",
      packSlug: "bs-launchmotion",
      effectId: "type-demonstrate-parameter-system",
      category: "type",
      name: "点阵参数系统演绎",
      description: "高亮依次走过六项核心参数，几何点阵实时响应形态变化，彰显精密底层能力。",
      priceUsdCents: 0,
      posterUrl: `${SKILLRY_BASE_URL}/skills/bs-launchmotion-type-demonstrate-parameter-system/media/cover.webp?variant=card`,
      previewVideoUrl: `${SKILLRY_BASE_URL}/skills/bs-launchmotion-type-demonstrate-parameter-system/media/preview.mp4`,
      skillPageUrl: `${SKILLRY_BASE_URL}/skills/bs-launchmotion-type-demonstrate-parameter-system`
    },
    {
      slug: "bs-launchmotion-cta-approach-call-action",
      packSlug: "bs-launchmotion",
      effectId: "cta-approach-call-action",
      category: "cta",
      name: "超大光标点击收尾 CTA",
      description: "超大光滑光标落向行动号召按钮点击，界面优雅折叠为品牌标志与口号。",
      priceUsdCents: 499,
      posterUrl: `${SKILLRY_BASE_URL}/skills/bs-launchmotion-cta-approach-call-action/media/cover.webp?variant=card`,
      previewVideoUrl: `${SKILLRY_BASE_URL}/skills/bs-launchmotion-cta-approach-call-action/media/preview.mp4`,
      skillPageUrl: `${SKILLRY_BASE_URL}/skills/bs-launchmotion-cta-approach-call-action`
    },
    {
      slug: "bs-launchmotion-cta-business-segment-cards",
      packSlug: "bs-launchmotion",
      effectId: "cta-business-segment-cards",
      category: "cta",
      name: "卡片流转与碰一碰交互",
      description: "多行业卡片在选框中流畅滚动后切换至核心交易完成瞬间，最后落定品牌口号。",
      priceUsdCents: 499,
      posterUrl: `${SKILLRY_BASE_URL}/skills/bs-launchmotion-cta-business-segment-cards/media/cover.webp?variant=card`,
      previewVideoUrl: `${SKILLRY_BASE_URL}/skills/bs-launchmotion-cta-business-segment-cards/media/preview.mp4`,
      skillPageUrl: `${SKILLRY_BASE_URL}/skills/bs-launchmotion-cta-business-segment-cards`
    },
    {
      slug: "bs-launchmotion-cta-particle-dome-headlines",
      packSlug: "bs-launchmotion",
      effectId: "cta-particle-dome-headlines",
      category: "cta",
      name: "3D 粒子球与品牌宣言",
      description: "恢弘的动态粒子球体旋转汇聚，托起极具科技感的产品核心价值主张。",
      priceUsdCents: 499,
      posterUrl: `${SKILLRY_MEDIA_BASE_URL}/cdn-cgi/image/width=768,quality=80,fit=scale-down,format=auto/product-launch-video/scenes/cta-particle-dome-headlines.7d79827827.webp`,
      previewVideoUrl: `${SKILLRY_MEDIA_BASE_URL}/product-launch-video/scenes/cta-particle-dome-headlines.d446a465a4.mp4`,
      skillPageUrl: `${SKILLRY_BASE_URL}/skills/bs-launchmotion-cta-particle-dome-headlines`
    },
    {
      slug: "bs-launchmotion-reveal-multiple-agents-logo",
      packSlug: "bs-launchmotion",
      effectId: "reveal-multiple-agents-logo",
      category: "reveal",
      name: "多智能体汇聚品牌引擎",
      description: "多路专业 Agent 并发执行任务后向中心汇聚点亮产品核心 Logo。",
      priceUsdCents: 499,
      posterUrl: `${SKILLRY_MEDIA_BASE_URL}/cdn-cgi/image/width=768,quality=80,fit=scale-down,format=auto/product-launch-video/scenes/reveal-multiple-agents-logo.331cbdd34e.webp`,
      previewVideoUrl: `${SKILLRY_MEDIA_BASE_URL}/product-launch-video/scenes/reveal-multiple-agents-logo.5794cc1fda.mp4`,
      skillPageUrl: `${SKILLRY_BASE_URL}/skills/bs-launchmotion-reveal-multiple-agents-logo`
    }
  ]
};

const CATEGORY_LABELS: Record<string, { zh: string; en: string }> = {
  chapter: { zh: "章节转场", en: "Chapters" },
  comparison: { zh: "数据与对比", en: "Comparison & Charts" },
  diagram: { zh: "架构与流程", en: "Diagrams & Flows" },
  split: { zh: "口播分屏", en: "Presenter Split" },
  type: { zh: "动态排版", en: "Kinetic Type" },
  cards: { zh: "清单与卡片", en: "Cards & Lists" },
  quote: { zh: "金句与背书", en: "Quotes & Proof" },
  transition: { zh: "图形遮罩", en: "Transitions" },
  prompt: { zh: "痛点与输入", en: "Prompt & Hook" },
  ui: { zh: "产品界面演示", en: "Product UI" },
  flow: { zh: "Agent 工作流", en: "Agent Flow" },
  data: { zh: "指标与增长", en: "Data & Metrics" },
  grid: { zh: "矩阵与画廊", en: "Grid & Gallery" },
  reveal: { zh: "品牌揭晓", en: "Brand Reveal" },
  cta: { zh: "行动号召收尾", en: "Closing CTA" },
  other: { zh: "精选动效", en: "Featured" }
};

const IGNORED_SCAN_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "out",
  ".next",
  ".turbo",
  "coverage",
  "__pycache__",
  ".venv"
]);

export function getAgentSkillScanRoots(home = homedir()): string[] {
  return [
    join(home, ".agents", "skills"),
    join(home, ".claude", "skills"),
    join(home, ".codex", "skills"),
    join(home, ".gemini", "antigravity", "skills")
  ];
}

export function findInstalledSkillPathsBySlug(slug: string, home = homedir()): {
  installedPaths: string[];
  primarySkillMdPath: string | null;
} {
  const installedPaths: string[] = [];
  let primarySkillMdPath: string | null = null;
  for (const root of getAgentSkillScanRoots(home)) {
    if (!existsSync(root)) continue;
    const dir = join(root, slug);
    const md = join(dir, "SKILL.md");
    if (existsSync(md)) {
      installedPaths.push(dir);
      if (!primarySkillMdPath) primarySkillMdPath = md;
    }
  }
  return { installedPaths, primarySkillMdPath };
}

export function findInstalledSkillryPackPaths(slug: SkillryPackId, home = homedir()): {
  installedPaths: string[];
  subSkillCount: number;
  subSkillSlugs: Set<string>;
  primarySkillMdPath: string | null;
} {
  const installedPaths: string[] = [];
  const subSkillSlugs = new Set<string>();
  let primarySkillMdPath: string | null = null;

  for (const root of getAgentSkillScanRoots(home)) {
    if (!existsSync(root)) continue;
    const directDir = join(root, slug);
    const directSkillMd = join(directDir, "SKILL.md");
    if (existsSync(directSkillMd)) {
      installedPaths.push(directDir);
      if (!primarySkillMdPath) primarySkillMdPath = directSkillMd;
    }
    try {
      for (const entry of readdirSync(root, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith(`${slug}-`) && existsSync(join(root, entry.name, "SKILL.md"))) {
          subSkillSlugs.add(entry.name);
        }
      }
    } catch {
      // Ignore unreadable skill directories.
    }
  }

  return {
    installedPaths,
    subSkillCount: subSkillSlugs.size,
    subSkillSlugs,
    primarySkillMdPath
  };
}

// --- Shared Credential Store (zero Keychain-popup mirror + system `node` bridge to skillry-cli) ---
function getMkboardSkillrySessionFilePath(): string {
  const customDir = process.env.MKBOARD_SKILLRY_SESSION_DIR?.trim();
  const baseDir = customDir || join(homedir(), ".config", "mkboard");
  return join(baseDir, "skillry-session.json");
}

function readMirrorSessionToken(): string | null {
  try {
    const file = getMkboardSkillrySessionFilePath();
    if (!existsSync(file)) return null;
    const parsed = JSON.parse(readFileSync(file, "utf8")) as { baseUrl?: string; token?: string };
    if (parsed && parsed.baseUrl === SKILLRY_BASE_URL && typeof parsed.token === "string" && parsed.token.trim()) {
      return parsed.token.trim();
    }
  } catch {
    // Ignore malformed or unreadable mirror session file.
  }
  return null;
}

function writeMirrorSessionToken(token: string): void {
  try {
    const file = getMkboardSkillrySessionFilePath();
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    writeFileSync(
      file,
      `${JSON.stringify({ version: 1, baseUrl: SKILLRY_BASE_URL, token: token.trim() })}\n`,
      { encoding: "utf8", mode: 0o600 }
    );
  } catch {
    // Best-effort local owner-only mirror.
  }
}

function deleteMirrorSessionToken(): void {
  try {
    const file = getMkboardSkillrySessionFilePath();
    if (existsSync(file)) rmSync(file, { force: true });
  } catch {
    // Ignore
  }
}

function resolveSystemNodeBinarySync(): string | null {
  const env = localCliSpawnEnv();
  const candidates = localToolchainExecutableCandidates("node", undefined, env);
  for (const candidate of candidates) {
    if ((candidate.includes("/") || candidate.includes("\\")) && existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function resolveBundledCredentialStoreUrl(): string | null {
  try {
    const req = createRequire(import.meta.url);
    const pkgJsonPath = req.resolve("skillry-cli/package.json");
    let cliDir = dirname(pkgJsonPath);
    if (cliDir.includes("app.asar") && !cliDir.includes("app.asar.unpacked")) {
      cliDir = cliDir.replace("app.asar", "app.asar.unpacked");
    }
    const storeJs = join(cliDir, "dist", "credential-store.js");
    if (existsSync(storeJs)) {
      return new URL(`file://${storeJs}`).href;
    }
  } catch {
    // Ignore
  }
  return null;
}

async function runNodeCredentialBridge(
  op: "read" | "write" | "delete",
  token?: string
): Promise<string | null> {
  if (process.env.MKBOARD_DISABLE_SYSTEM_KEYRING === "1") return null;
  const nodeBin = resolveSystemNodeBinarySync();
  const storeHref = resolveBundledCredentialStoreUrl();
  if (!nodeBin || !storeHref) return null;

  const script =
    op === "read"
      ? `import(${JSON.stringify(storeHref)}).then(async m => { const v = await m.createCredentialStore().read(${JSON.stringify(SKILLRY_BASE_URL)}); if (v) process.stdout.write(v); }).catch(() => {})`
      : op === "write"
        ? `import(${JSON.stringify(storeHref)}).then(async m => { await m.createCredentialStore().write(${JSON.stringify(SKILLRY_BASE_URL)}, process.env.MKBOARD_TMP_SKILLRY_TOKEN || ""); }).catch(() => {})`
        : `import(${JSON.stringify(storeHref)}).then(async m => { await m.createCredentialStore().delete(${JSON.stringify(SKILLRY_BASE_URL)}); }).catch(() => {})`;

  const res = await runCommandCapture(nodeBin, ["-e", script], {
    timeoutMs: 2500,
    envExtra: token ? { MKBOARD_TMP_SKILLRY_TOKEN: token } : undefined
  });
  return res.exitCode === 0 && res.output.trim() ? res.output.trim() : null;
}

async function readSkillryKeyringToken(): Promise<string | null> {
  const mirrored = readMirrorSessionToken();
  if (mirrored) return mirrored;

  const fromNodeKeychain = await runNodeCredentialBridge("read");
  if (fromNodeKeychain) {
    writeMirrorSessionToken(fromNodeKeychain);
    return fromNodeKeychain;
  }
  return null;
}

async function writeSkillryKeyringToken(token: string): Promise<void> {
  const clean = token.trim();
  if (!clean) return;
  writeMirrorSessionToken(clean);
  await runNodeCredentialBridge("write", clean);
}

async function deleteSkillryKeyringToken(): Promise<void> {
  deleteMirrorSessionToken();
  await runNodeCredentialBridge("delete");
}

let cachedAccountState: { at: number; state: SkillryAccountState } | null = null;

async function fetchJsonWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 8000
): Promise<{ status: number; ok: boolean; body: Record<string, unknown> }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text();
    let parsed: Record<string, unknown> = {};
    try {
      const json = JSON.parse(text) as unknown;
      if (json && typeof json === "object" && !Array.isArray(json)) {
        parsed = json as Record<string, unknown>;
      }
    } catch {
      // Non-JSON response
    }
    return { status: res.status, ok: res.ok, body: parsed };
  } finally {
    clearTimeout(timer);
  }
}

export async function getSkillryAccountState(forceRefresh = false): Promise<SkillryAccountState> {
  if (!forceRefresh && cachedAccountState && Date.now() - cachedAccountState.at < 20_000) {
    return cachedAccountState.state;
  }

  const token = await readSkillryKeyringToken();
  if (!token) {
    const disconnected: SkillryAccountState = {
      connected: false,
      email: null,
      name: null,
      entitlement: "unknown",
      quotaRemaining: null,
      quotaLimit: null
    };
    cachedAccountState = { at: Date.now(), state: disconnected };
    return disconnected;
  }

  try {
    const res = await fetchJsonWithTimeout(
      `${SKILLRY_BASE_URL}/api/cli/me`,
      { headers: { Authorization: `Bearer ${token}` } },
      6500
    );
    if (res.status === 401 || res.status === 403) {
      const expired: SkillryAccountState = {
        connected: false,
        email: null,
        name: null,
        entitlement: "unknown",
        quotaRemaining: null,
        quotaLimit: null
      };
      cachedAccountState = { at: Date.now(), state: expired };
      return expired;
    }
    if (res.ok) {
      const user = (res.body.user && typeof res.body.user === "object" ? res.body.user : {}) as Record<string, unknown>;
      const quota = (res.body.quota && typeof res.body.quota === "object" ? res.body.quota : {}) as Record<string, unknown>;
      const entitlement =
        res.body.entitlement === "premium"
          ? "premium"
          : res.body.entitlement === "free"
            ? "free"
            : "unknown";
      const state: SkillryAccountState = {
        connected: true,
        email: typeof user.email === "string" ? user.email : null,
        name: typeof user.name === "string" ? user.name : null,
        entitlement,
        quotaRemaining: typeof quota.remaining === "number" ? quota.remaining : null,
        quotaLimit: typeof quota.limit === "number" ? quota.limit : null
      };
      cachedAccountState = { at: Date.now(), state };
      return state;
    }
  } catch {
    // Network offline fallback: token exists in keyring
  }

  const fallbackConnected: SkillryAccountState = {
    connected: true,
    email: null,
    name: null,
    entitlement: "unknown",
    quotaRemaining: null,
    quotaLimit: null
  };
  cachedAccountState = { at: Date.now(), state: fallbackConnected };
  return fallbackConnected;
}

// --- OAuth Device Flow (connects browser & writes shared keyring token) ---
let pendingDeviceAuth: {
  deviceCode: string;
  userCode: string;
  verificationUrl: string;
  expiresAt: number;
  intervalSeconds: number;
} | null = null;

export async function startSkillryDeviceAuth(
  openBrowser: (url: string) => Promise<void> | void
): Promise<SkillryDeviceAuthSession> {
  try {
    const res = await fetchJsonWithTimeout(
      `${SKILLRY_BASE_URL}/api/auth/device/code`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: DEVICE_CLIENT_ID,
          scope: "skills:read"
        })
      },
      10_000
    );
    if (!res.ok) {
      return {
        status: "error",
        message: `无法发起 Skillry 浏览器授权（HTTP ${res.status}）。`
      };
    }
    const deviceCode = String(res.body.device_code || res.body.deviceCode || "");
    const userCode = String(res.body.user_code || res.body.userCode || "");
    const rawUrl = String(
      res.body.verification_uri_complete ||
        res.body.verificationUriComplete ||
        res.body.verification_uri ||
        res.body.verificationUri ||
        ""
    );
    if (!deviceCode || !userCode || !rawUrl) {
      return {
        status: "error",
        message: "Skillry 授权服务返回字段不完整，请稍后重试。"
      };
    }
    const verificationUrl = rawUrl.startsWith("http")
      ? rawUrl
      : `${SKILLRY_BASE_URL}${rawUrl.startsWith("/") ? "" : "/"}${rawUrl}`;
    const expiresIn = typeof res.body.expires_in === "number" ? res.body.expires_in : 600;
    const intervalSeconds = typeof res.body.interval === "number" ? Math.max(2, res.body.interval) : 4;

    pendingDeviceAuth = {
      deviceCode,
      userCode,
      verificationUrl,
      expiresAt: Date.now() + expiresIn * 1000,
      intervalSeconds
    };

    await openBrowser(verificationUrl);

    return {
      status: "pending",
      userCode,
      verificationUrl,
      pollAfterSeconds: intervalSeconds,
      expiresAt: new Date(pendingDeviceAuth.expiresAt).toISOString()
    };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "连接 Skillry 授权服务器失败，请检查网络。"
    };
  }
}

export async function pollSkillryDeviceAuth(): Promise<SkillryDeviceAuthSession> {
  if (!pendingDeviceAuth) {
    const account = await getSkillryAccountState(true);
    return account.connected ? { status: "connected", account } : { status: "not_started", account };
  }
  if (Date.now() >= pendingDeviceAuth.expiresAt) {
    pendingDeviceAuth = null;
    return { status: "expired", message: "授权验证码已过期，请重新发起连接。" };
  }

  const currentPending = pendingDeviceAuth;
  try {
    const res = await fetchJsonWithTimeout(
      `${SKILLRY_BASE_URL}/api/cli/auth/device/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: DEVICE_CLIENT_ID,
          device_code: pendingDeviceAuth.deviceCode,
          grant_type: DEVICE_GRANT_TYPE
        })
      },
      8000
    );

    if (res.ok) {
      const token = String(
        res.body.access_token ||
          res.body.accessToken ||
          res.body.session_token ||
          res.body.sessionToken ||
          res.body.token ||
          ""
      ).trim();
      if (!token) {
        return { status: "error", message: "未获取到有效访问凭证。" };
      }
      await writeSkillryKeyringToken(token);
      pendingDeviceAuth = null;
      cachedAccountState = null;
      const account = await getSkillryAccountState(true);
      return { status: "connected", account };
    }

    const code = String(res.body.error || res.body.code || "");
    if (code === "authorization_pending" || code === "slow_down") {
      if (code === "slow_down") pendingDeviceAuth.intervalSeconds += 3;
      return {
        status: "pending",
        userCode: pendingDeviceAuth.userCode,
        verificationUrl: pendingDeviceAuth.verificationUrl,
        pollAfterSeconds: pendingDeviceAuth.intervalSeconds,
        expiresAt: new Date(pendingDeviceAuth.expiresAt).toISOString()
      };
    }
    if (code === "access_denied") {
      pendingDeviceAuth = null;
      return { status: "denied", message: "浏览器端已拒绝本次授权。" };
    }
    if (code === "expired_token") {
      pendingDeviceAuth = null;
      return { status: "expired", message: "授权验证码已过期，请重新点击连接。" };
    }
    return { status: "error", message: `授权状态查询异常（HTTP ${res.status}）。` };
  } catch {
    return {
      status: "pending",
      userCode: currentPending.userCode,
      verificationUrl: currentPending.verificationUrl,
      pollAfterSeconds: currentPending.intervalSeconds
    };
  }
}

export async function disconnectSkillryAccount(store: MkboardStore): Promise<SkillryCatalogStatus> {
  pendingDeviceAuth = null;
  const token = await readSkillryKeyringToken();
  if (token) {
    await fetchJsonWithTimeout(
      `${SKILLRY_BASE_URL}/api/cli/logout`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: "{}"
      },
      4000
    ).catch(() => null);
  }
  await deleteSkillryKeyringToken();
  cachedAccountState = null;
  return getSkillryCatalogStatus(store, true);
}

// --- Real-Time Entitlement Preflight (/api/cli/skills/$slug/access) ---
export function resolvePackIdForSlug(slug: string): SkillryPackId | null {
  if (slug === "bs-creatormotion" || slug.startsWith("bs-creatormotion-")) return "bs-creatormotion";
  if (slug === "bs-launchmotion" || slug.startsWith("bs-launchmotion-")) return "bs-launchmotion";
  return null;
}

export async function checkSkillrySkillAccess(input: {
  slug: string;
  priceUsdCents?: number;
  forceRefreshAccount?: boolean;
}): Promise<SkillryAccessCheckResult> {
  const cleanSlug = sanitizeSlug(input.slug);
  const isMasterBundle = cleanSlug === "bs-creatormotion" || cleanSlug === "bs-launchmotion";
  const priceUsdCents =
    typeof input.priceUsdCents === "number"
      ? input.priceUsdCents
      : isMasterBundle
        ? MEMBERS_ONLY_PRICE_USD_CENTS
        : 499;
  const isMembersOnlyBundle = isMasterBundle || priceUsdCents === MEMBERS_ONLY_PRICE_USD_CENTS;
  const localCheck = isMasterBundle
    ? findInstalledSkillryPackPaths(cleanSlug as SkillryPackId)
    : findInstalledSkillPathsBySlug(cleanSlug);
  const installedLocally = Boolean(localCheck.primarySkillMdPath);

  const token = await readSkillryKeyringToken();
  const account = await getSkillryAccountState(Boolean(input.forceRefreshAccount));

  if (!token || !account.connected) {
    return {
      slug: cleanSlug,
      connected: false,
      canDownload: false,
      access: "unauthenticated",
      reason: "unauthenticated",
      isMembersOnlyBundle,
      priceUsdCents,
      purchaseUrl: isMembersOnlyBundle ? `${SKILLRY_BASE_URL}/pricing` : `${SKILLRY_BASE_URL}/skills/${cleanSlug}`,
      pricingUrl: `${SKILLRY_BASE_URL}/pricing`,
      installedLocally,
      account,
      message: "请先连接 Skillry 账号以验证下载权限。"
    };
  }

  try {
    const res = await fetchJsonWithTimeout(
      `${SKILLRY_BASE_URL}/api/cli/skills/${encodeURIComponent(cleanSlug)}/access`,
      { headers: { Authorization: `Bearer ${token}` } },
      8000
    );
    if (res.status === 401 || res.status === 403) {
      cachedAccountState = null;
      return {
        slug: cleanSlug,
        connected: false,
        canDownload: false,
        access: "unauthenticated",
        reason: "unauthenticated",
        isMembersOnlyBundle,
        priceUsdCents,
        purchaseUrl: isMembersOnlyBundle ? `${SKILLRY_BASE_URL}/pricing` : `${SKILLRY_BASE_URL}/skills/${cleanSlug}`,
        pricingUrl: `${SKILLRY_BASE_URL}/pricing`,
        installedLocally,
        account: { ...account, connected: false },
        message: "登录凭证已失效，请重新连接 Skillry 账号。"
      };
    }

    if (res.ok) {
      const canDownload = Boolean(res.body.canDownload);
      const rawAccess = String(res.body.access || "");
      const access: SkillryAccessCheckResult["access"] =
        rawAccess === "free" || rawAccess === "member" || rawAccess === "purchased" || rawAccess === "purchase_required"
          ? rawAccess
          : canDownload
            ? "member"
            : "purchase_required";
      const rawReason = res.body.reason;
      const reason: SkillryAccessCheckResult["reason"] =
        rawReason === "purchase_required" || rawReason === "daily_download_limit" ? rawReason : null;
      const serverPurchaseUrl = typeof res.body.purchaseUrl === "string" ? res.body.purchaseUrl : null;
      return {
        slug: cleanSlug,
        connected: true,
        canDownload,
        access,
        reason,
        isMembersOnlyBundle,
        priceUsdCents,
        purchaseUrl:
          serverPurchaseUrl ||
          (isMembersOnlyBundle ? `${SKILLRY_BASE_URL}/pricing` : `${SKILLRY_BASE_URL}/skills/${cleanSlug}`),
        pricingUrl: `${SKILLRY_BASE_URL}/pricing`,
        installedLocally,
        account
      };
    }
  } catch {
    // Fall through to network error result
  }

  return {
    slug: cleanSlug,
    connected: true,
    canDownload: account.entitlement === "premium" || priceUsdCents === 0,
    access: account.entitlement === "premium" ? "member" : priceUsdCents === 0 ? "free" : "error",
    reason: "network_error",
    isMembersOnlyBundle,
    priceUsdCents,
    purchaseUrl: isMembersOnlyBundle ? `${SKILLRY_BASE_URL}/pricing` : `${SKILLRY_BASE_URL}/skills/${cleanSlug}`,
    pricingUrl: `${SKILLRY_BASE_URL}/pricing`,
    installedLocally,
    account,
    message: "暂时无法连接权限校验接口，可直接尝试拉取。"
  };
}

// --- Live Storefront Showcase Catalog Fetcher (122 CreatorMotion + 208 LaunchMotion) ---
type RawStorefrontCard = {
  slug: string;
  name: string | null;
  description: string | null;
  priceUsdCents: number | null;
  posterUrl: string | null;
  previewVideoUrl: string | null;
};

const collectionCache = new Map<string, { at: number; cards: RawStorefrontCard[] }>();

function resolveSkillryUrl(rawUrl: string | null | undefined, fallbackUrl: string): string {
  if (!rawUrl || !rawUrl.trim()) return fallbackUrl;
  const trimmed = rawUrl.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return `${SKILLRY_BASE_URL}${trimmed.startsWith("/") ? "" : "/"}${trimmed}`;
}

function inferEffectCategory(packSlug: SkillryPackId, slug: string): { effectId: string; category: string } {
  const prefix = `${packSlug}-`;
  const effectId = slug.startsWith(prefix) ? slug.slice(prefix.length) : slug;
  const firstToken = effectId.split("-")[0]?.toLowerCase() || "other";
  if (CATEGORY_LABELS[firstToken]) {
    return { effectId, category: firstToken };
  }
  return { effectId, category: "other" };
}

function cleanDisplayEffectTitle(rawName: string | null | undefined, effectId: string): string {
  if (!rawName || !rawName.trim()) return humanizeName(effectId);
  return rawName
    .replace(/^(CreatorMotion|LaunchMotion|自媒体视频动效|自媒體影片動效|发布动效|發布動效)\s*[·•\-—:]\s*/iu, "")
    .trim();
}

async function fetchLiveStorefrontCards(
  packSlug: SkillryPackId,
  locale = "zh-CN",
  forceRefresh = false
): Promise<RawStorefrontCard[] | null> {
  const localeSegment = locale === "en" ? "" : locale === "zh-TW" ? "/zh-tw" : "/zh";
  const cacheKey = `${packSlug}:${localeSegment || "en"}`;
  const cached = collectionCache.get(cacheKey);
  if (!forceRefresh && cached && Date.now() - cached.at < 10 * 60 * 1000) {
    return cached.cards;
  }

  const pagePath =
    packSlug === "bs-creatormotion" ? "/ai-videos/ai-motion-graphics" : "/ai-videos/product-launch-video";
  const targetUrl = `${SKILLRY_BASE_URL}${localeSegment}${pagePath}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7500);
  try {
    const res = await fetch(targetUrl, { signal: controller.signal });
    if (!res.ok) return null;
    const html = await res.text();
    const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    const tsrScript = scripts.find((s) => s.includes("$_TSR.router="));
    if (!tsrScript) return null;

    const sandbox: Record<string, unknown> = {
      ReadableStream,
      TextEncoder,
      TextDecoder,
      document: { currentScript: { remove() {} } }
    };
    vm.createContext(sandbox);
    vm.runInContext(`var self = this; ${tsrScript}`, sandbox, { timeout: 1500 });

    const router = (sandbox.$_TSR as { router?: { matches?: Array<{ l?: Record<string, unknown> }> } } | undefined)?.router;
    const loaderData = router?.matches?.find((m) => m && m.l)?.l;
    const rawList = Array.isArray(loaderData?.effects)
      ? loaderData.effects
      : Array.isArray(loaderData?.scenes)
        ? loaderData.scenes
        : null;
    if (!rawList || rawList.length === 0) return null;

    const normalized: RawStorefrontCard[] = [];
    for (const item of rawList) {
      if (!item || typeof item !== "object") continue;
      const rec = item as Record<string, unknown>;
      const slug = typeof rec.slug === "string" ? rec.slug.trim() : "";
      if (!slug.startsWith(`${packSlug}-`)) continue;
      normalized.push({
        slug,
        name: typeof rec.name === "string" ? rec.name : null,
        description: typeof rec.description === "string" ? rec.description : null,
        priceUsdCents: typeof rec.priceUsdCents === "number" ? rec.priceUsdCents : 499,
        posterUrl: typeof rec.posterUrl === "string" ? rec.posterUrl : null,
        previewVideoUrl: typeof rec.previewVideoUrl === "string" ? rec.previewVideoUrl : null
      });
    }

    if (normalized.length > 0) {
      collectionCache.set(cacheKey, { at: Date.now(), cards: normalized });
      return normalized;
    }
  } catch {
    // Graceful fallback when offline or blocked
  } finally {
    clearTimeout(timer);
  }
  return null;
}

function buildPackStatus(
  def: SkillryPackDefinition,
  skillIds: Set<string>,
  home = homedir()
): SkillryPackStatus {
  const localInfo = findInstalledSkillryPackPaths(def.slug, home);
  const installedMasterLocally = Boolean(localInfo.primarySkillMdPath);
  const hasChildOnly = !installedMasterLocally && localInfo.subSkillCount > 0;
  return {
    slug: def.slug,
    mkboardSkillId: def.mkboardSkillId,
    title: def.title,
    subtitle: def.subtitle,
    pricingTier: def.pricingTier,
    totalEffectsCount: def.totalEffectsCount,
    freeEffectsCount: def.freeEffectsCount,
    installedLocally: installedMasterLocally || hasChildOnly,
    installedMasterLocally,
    installedSubSkillCount: localInfo.subSkillCount,
    installedPaths: localInfo.installedPaths,
    syncedToMkboard: skillIds.has(def.mkboardSkillId),
    landingUrl: def.landingUrl,
    skillPageUrl: def.skillPageUrl,
    installDocUrl: def.installDocUrl,
    pricingUrl: def.pricingUrl,
    heroVideoUrl: def.heroVideoUrl,
    heroPosterUrl: def.heroPosterUrl,
    featuredPosters: def.featuredPosters,
    categoryTagsZh: def.categoryTagsZh,
    categoryTagsEn: def.categoryTagsEn,
    themes: def.themes,
    aiInstallPrompt: `Read ${def.installDocUrl} and follow the instructions to install the skill.`,
    cliInstallCommand: `npm exec --yes --package=skillry-cli@latest -- skillry-cli install ${def.slug} --agent shared --force`
  };
}

export async function getSkillryCatalogStatus(
  store: MkboardStore,
  forceRefresh = false
): Promise<SkillryCatalogStatus> {
  const skills = store.listSkills();
  const skillIds = new Set(skills.map((skill) => skill.id));
  const account = await getSkillryAccountState(forceRefresh);
  const npmBin = await resolveNpmBinary();
  const bundledCli = resolveBundledSkillryCliEntry();

  const packs: SkillryPackStatus[] = (Object.keys(SKILLRY_OFFICIAL_PACKS) as SkillryPackId[]).map((slug) =>
    buildPackStatus(SKILLRY_OFFICIAL_PACKS[slug], skillIds)
  );

  return {
    cliLoggedIn: account.connected,
    cliAccountEmail: account.email,
    cliAccountHandle: account.name,
    account,
    npmAvailable: Boolean(npmBin),
    bundledCliAvailable: Boolean(bundledCli),
    packs
  };
}

export async function getSkillryCollectionDetail(
  store: MkboardStore,
  input: { slug: SkillryPackId; locale?: string; forceRefresh?: boolean }
): Promise<SkillryCollectionDetail> {
  const def = SKILLRY_OFFICIAL_PACKS[input.slug];
  if (!def) {
    throw new Error(`未知的 Skillry 动效集合：${input.slug}`);
  }

  const skills = store.listSkills();
  const skillIds = new Set(skills.map((s) => s.id));
  const pack = buildPackStatus(def, skillIds);
  const localPackInfo = findInstalledSkillryPackPaths(def.slug);

  const liveCards = await fetchLiveStorefrontCards(def.slug, input.locale || "zh-CN", Boolean(input.forceRefresh));
  let items: SkillrySubEffectItem[];
  let source: "live" | "fallback" = "fallback";

  if (liveCards && liveCards.length > 0) {
    source = "live";
    items = liveCards.map((card) => {
      const { effectId, category } = inferEffectCategory(def.slug, card.slug);
      const installedLocally = pack.installedMasterLocally || localPackInfo.subSkillSlugs.has(card.slug);
      const mkboardSubId = `skill-skillry-${card.slug}`;
      return {
        slug: card.slug,
        packSlug: def.slug,
        effectId,
        category,
        name: cleanDisplayEffectTitle(card.name, effectId),
        description: (card.description || "").trim(),
        priceUsdCents: typeof card.priceUsdCents === "number" ? card.priceUsdCents : 499,
        posterUrl: resolveSkillryUrl(
          card.posterUrl,
          `${SKILLRY_BASE_URL}/skills/${card.slug}/media/cover.webp?variant=card`
        ),
        previewVideoUrl: resolveSkillryUrl(
          card.previewVideoUrl,
          `${SKILLRY_BASE_URL}/skills/${card.slug}/media/preview.mp4`
        ),
        installedLocally,
        syncedToMkboard: pack.syncedToMkboard || skillIds.has(mkboardSubId),
        skillPageUrl: `${SKILLRY_BASE_URL}/skills/${card.slug}`
      };
    });
    // Put free starter items and installed items right up front so users can try immediately!
    items.sort((a, b) => {
      if (a.installedLocally !== b.installedLocally) return a.installedLocally ? -1 : 1;
      if ((a.priceUsdCents === 0) !== (b.priceUsdCents === 0)) return a.priceUsdCents === 0 ? -1 : 1;
      return a.slug.localeCompare(b.slug);
    });
  } else {
    items = FALLBACK_SUB_EFFECTS[def.slug].map((item) => ({
      ...item,
      installedLocally: pack.installedMasterLocally || localPackInfo.subSkillSlugs.has(item.slug),
      syncedToMkboard: pack.syncedToMkboard || skillIds.has(`skill-skillry-${item.slug}`)
    }));
  }

  const categoryCounts = new Map<string, number>();
  for (const item of items) {
    categoryCounts.set(item.category, (categoryCounts.get(item.category) || 0) + 1);
  }
  const categories = [...categoryCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => ({
      id,
      labelZh: CATEGORY_LABELS[id]?.zh || humanizeName(id),
      labelEn: CATEGORY_LABELS[id]?.en || humanizeName(id),
      count
    }));

  return {
    pack: {
      ...pack,
      totalEffectsCount: Math.max(def.totalEffectsCount, items.length),
      freeEffectsCount: items.filter((i) => i.priceUsdCents === 0).length || def.freeEffectsCount
    },
    categories,
    items,
    source
  };
}

function buildMkboardSkillContentForSkillryPack(
  def: SkillryPackDefinition,
  primarySkillMdPath: string | null,
  subSkillSlugs?: Set<string>
): {
  description: string;
  content: string;
} {
  let rawBody = "";
  let parsedDescription = "";
  if (primarySkillMdPath && existsSync(primarySkillMdPath)) {
    const raw = readFileSync(primarySkillMdPath, "utf8");
    const fm = parseYamlFrontmatter(raw);
    parsedDescription = fm.description || "";
    rawBody = fm.body.trim();
  }

  const installedSubList = subSkillSlugs && subSkillSlugs.size > 0 ? [...subSkillSlugs].slice(0, 40).join(", ") : "";
  const localDirNote = primarySkillMdPath
    ? `本机 Skillry 技能目录：${dirname(primarySkillMdPath)}\n本机 SKILL.md 路径：${primarySkillMdPath}`
    : installedSubList
      ? `本机已安装 ${subSkillSlugs?.size ?? 0} 个 ${def.title} 子效果（~/.agents/skills）：${installedSubList}`
      : `官方安装指引：${def.installDocUrl}`;

  const contentSections = [
    `# ${def.title}（Skillry 官方套件）`,
    localDirNote,
    "## MkBoard 分镜与动效协作规则",
    def.storyboardGuidance
  ];

  if (rawBody) {
    contentSections.push("## Skillry 原始 SKILL.md 规范摘录", truncateMiddle(rawBody, 16_000));
  }

  return {
    description: parsedDescription ? `${def.subtitle}` : def.subtitle,
    content: contentSections.join("\n\n")
  };
}

export async function syncSkillryPackToMkboard(store: MkboardStore, rawSlug: string): Promise<SkillryInstallResult> {
  const cleanSlug = sanitizeSlug(rawSlug);
  const isMaster = cleanSlug === "bs-creatormotion" || cleanSlug === "bs-launchmotion";

  if (isMaster) {
    const def = SKILLRY_OFFICIAL_PACKS[cleanSlug as SkillryPackId];
    const localInfo = findInstalledSkillryPackPaths(def.slug);
    if (!localInfo.primarySkillMdPath && localInfo.subSkillCount === 0) {
      const catalog = await getSkillryCatalogStatus(store);
      return {
        status: "failed",
        slug: cleanSlug,
        actionUrl: def.landingUrl,
        pricingUrl: def.pricingUrl,
        landingUrl: def.landingUrl,
        message: `本机尚未检测到 ${def.title}（~/.agents/skills/${cleanSlug}），请先验证权限并通过 npm 拉取。`,
        catalog
      };
    }

    if (localInfo.primarySkillMdPath) {
      mirrorSkillFolderAcrossAgentDirs(dirname(localInfo.primarySkillMdPath), cleanSlug);
    }

    const refreshedInfo = findInstalledSkillryPackPaths(def.slug);
    const built = buildMkboardSkillContentForSkillryPack(def, refreshedInfo.primarySkillMdPath, refreshedInfo.subSkillSlugs);
    const skill = store.upsertExternalSkill({
      id: def.mkboardSkillId,
      name: `${def.title} · Skillry`,
      description: built.description,
      content: built.content,
      iconId: def.iconId,
      gradientId: def.gradientId
    });
    const catalog = await getSkillryCatalogStatus(store);

    return {
      status: "installed",
      slug: cleanSlug,
      skill,
      installedPaths: refreshedInfo.installedPaths,
      actionUrl: def.landingUrl,
      pricingUrl: def.pricingUrl,
      landingUrl: def.landingUrl,
      message: `已将 ${def.title} 同步到 MkBoard 技能库，可在创建项目或切换分镜技能时直接选用。`,
      catalog
    };
  }

  // Individual sub-effect skill
  const found = findInstalledSkillPathsBySlug(cleanSlug);
  const parentPackId = resolvePackIdForSlug(cleanSlug);
  const parentDef = parentPackId ? SKILLRY_OFFICIAL_PACKS[parentPackId] : null;
  if (!found.primarySkillMdPath) {
    const catalog = await getSkillryCatalogStatus(store);
    return {
      status: "failed",
      slug: cleanSlug,
      actionUrl: `${SKILLRY_BASE_URL}/skills/${cleanSlug}`,
      pricingUrl: `${SKILLRY_BASE_URL}/pricing`,
      landingUrl: parentDef?.landingUrl || SKILLRY_BASE_URL,
      message: `本机尚未安装子效果 ${cleanSlug}，请先点击「通过 npm 拉取此效果」。`,
      catalog
    };
  }

  mirrorSkillFolderAcrossAgentDirs(dirname(found.primarySkillMdPath), cleanSlug);
  const raw = readFileSync(found.primarySkillMdPath, "utf8");
  const fm = parseYamlFrontmatter(raw);
  const displayTitle = cleanDisplayEffectTitle(fm.name || extractFirstMarkdownHeading(fm.body) || cleanSlug, cleanSlug);
  const skill = store.upsertExternalSkill({
    id: `skill-skillry-${cleanSlug}`,
    name: parentDef ? `${parentDef.title} · ${displayTitle}` : displayTitle,
    description: fm.description || extractFirstMarkdownParagraph(fm.body) || `Skillry 官方动效子技能（${cleanSlug}）`,
    content: [
      `# ${displayTitle}（${cleanSlug}）`,
      `本机技能目录：${dirname(found.primarySkillMdPath)}`,
      parentDef ? parentDef.storyboardGuidance : "",
      "## SKILL.md 规范",
      truncateMiddle(fm.body.trim() || raw, 16_000)
    ]
      .filter(Boolean)
      .join("\n\n"),
    iconId: parentDef?.iconId || "sparkles",
    gradientId: parentDef?.gradientId || "apricot-grey"
  });
  if (parentDef) {
    const parentLocal = findInstalledSkillryPackPaths(parentDef.slug);
    if (parentLocal.primarySkillMdPath || parentLocal.subSkillCount > 0) {
      const builtParent = buildMkboardSkillContentForSkillryPack(
        parentDef,
        parentLocal.primarySkillMdPath,
        parentLocal.subSkillSlugs
      );
      store.upsertExternalSkill({
        id: parentDef.mkboardSkillId,
        name: `${parentDef.title} · Skillry`,
        description: builtParent.description,
        content: builtParent.content,
        iconId: parentDef.iconId,
        gradientId: parentDef.gradientId
      });
    }
  }
  const catalog = await getSkillryCatalogStatus(store);
  return {
    status: "installed",
    slug: cleanSlug,
    skill,
    installedPaths: found.installedPaths,
    actionUrl: `${SKILLRY_BASE_URL}/skills/${cleanSlug}`,
    pricingUrl: `${SKILLRY_BASE_URL}/pricing`,
    landingUrl: parentDef?.landingUrl || SKILLRY_BASE_URL,
    message: `已成功通过 npm 拉取「${displayTitle}」并导入到 MkBoard 技能库！`,
    catalog
  };
}

export function classifySkillryInstallFailure(
  combinedOutput: string,
  exitCode: number | null,
  rawSlug: string
): Pick<
  SkillryInstallResult,
  "status" | "actionUrl" | "purchaseUrl" | "pricingUrl" | "landingUrl" | "isMembersOnlyBundle" | "message"
> {
  const cleanSlug = sanitizeSlug(rawSlug);
  const isMaster = cleanSlug === "bs-creatormotion" || cleanSlug === "bs-launchmotion";
  const parentPackId = resolvePackIdForSlug(cleanSlug) || "bs-creatormotion";
  const def = SKILLRY_OFFICIAL_PACKS[parentPackId];
  const normalized = combinedOutput.toLowerCase();
  const skillUrl = `${SKILLRY_BASE_URL}/skills/${cleanSlug}`;
  const pricingUrl = `${SKILLRY_BASE_URL}/pricing`;

  const isEntitlementIssue =
    exitCode === 2 ||
    /\b(402|403)\b/.test(normalized) ||
    normalized.includes("payment required") ||
    normalized.includes("entitlement") ||
    normalized.includes("not entitled") ||
    normalized.includes("purchase") ||
    normalized.includes("upgrade to pro") ||
    normalized.includes("skillry pro") ||
    normalized.includes("requires pro") ||
    normalized.includes("subscription") ||
    normalized.includes("unlock") ||
    normalized.includes("skillry.dev/pricing");

  if (isEntitlementIssue) {
    return {
      status: "needs_entitlement",
      actionUrl: isMaster ? pricingUrl : skillUrl,
      purchaseUrl: isMaster ? pricingUrl : skillUrl,
      pricingUrl,
      landingUrl: def.landingUrl,
      isMembersOnlyBundle: isMaster,
      message: isMaster
        ? `「${def.title}」整套合集属于 Skillry Pro 会员专享。开通 Pro 后即可一键拉取全部 ${def.totalEffectsCount} 个动效，也可在子效果画廊中先体验免费子效果或按需单独购买。`
        : `当前账号尚未解锁子效果「${cleanSlug}」。你可以单独购买该子效果（$4.99），或开通 Skillry Pro 一次解锁全部 330+ 动效。`
    };
  }

  const isLoginIssue =
    normalized.includes("401") ||
    normalized.includes("unauthorized") ||
    normalized.includes("not logged in") ||
    normalized.includes("login timed out") ||
    normalized.includes("authorization") ||
    normalized.includes("device code");

  if (isLoginIssue) {
    return {
      status: "needs_login",
      actionUrl: skillUrl,
      purchaseUrl: isMaster ? pricingUrl : skillUrl,
      pricingUrl,
      landingUrl: def.landingUrl,
      isMembersOnlyBundle: isMaster,
      message: "请先连接你的 Skillry 账号并完成浏览器授权，验证权限后即可自动通过 npm 拉取。"
    };
  }

  return {
    status: "failed",
    actionUrl: def.landingUrl,
    purchaseUrl: isMaster ? pricingUrl : skillUrl,
    pricingUrl,
    landingUrl: def.landingUrl,
    isMembersOnlyBundle: isMaster,
    message: extractCleanErrorSummary(combinedOutput) || `拉取 ${cleanSlug} 未完成，请检查网络连接后重试。`
  };
}

export async function installSkillryPack(store: MkboardStore, input: SkillryInstallInput): Promise<SkillryInstallResult> {
  const cleanSlug = sanitizeSlug(input.slug);
  if (!cleanSlug) {
    throw new Error("无效的 Skillry 技能标识");
  }
  const isMaster = cleanSlug === "bs-creatormotion" || cleanSlug === "bs-launchmotion";
  const parentPackId = resolvePackIdForSlug(cleanSlug) || "bs-creatormotion";
  const def = SKILLRY_OFFICIAL_PACKS[parentPackId];
  const installDocUrl = `${SKILLRY_BASE_URL}/skills/${cleanSlug}/install.md`;

  const logChunks: string[] = [];
  const mode = input.mode ?? "npm";

  // Step 1: Fast preflight auth & entitlement check so we never hang npm waiting for an invisible terminal prompt
  // or waste time bootstrapping npx when purchase/Pro is required!
  if (!input.skipPreflight && mode !== "ai-agent") {
    const accessCheck = await checkSkillrySkillAccess({ slug: cleanSlug, forceRefreshAccount: true });
    if (!accessCheck.connected || accessCheck.reason === "unauthenticated") {
      const catalog = await getSkillryCatalogStatus(store);
      return {
        status: "needs_login",
        slug: cleanSlug,
        actionUrl: `${SKILLRY_BASE_URL}/skills/${cleanSlug}`,
        purchaseUrl: accessCheck.purchaseUrl,
        pricingUrl: accessCheck.pricingUrl,
        landingUrl: def.landingUrl,
        isMembersOnlyBundle: accessCheck.isMembersOnlyBundle,
        priceUsdCents: accessCheck.priceUsdCents,
        message: "下载使用前需验证 Skillry 账号权限：请先点击「连接 Skillry 账号」完成浏览器登录授权。",
        catalog
      };
    }

    if (!accessCheck.canDownload && accessCheck.reason === "purchase_required") {
      const catalog = await getSkillryCatalogStatus(store);
      return {
        status: "needs_entitlement",
        slug: cleanSlug,
        actionUrl: accessCheck.purchaseUrl || accessCheck.pricingUrl,
        purchaseUrl: accessCheck.purchaseUrl,
        pricingUrl: accessCheck.pricingUrl,
        landingUrl: def.landingUrl,
        isMembersOnlyBundle: accessCheck.isMembersOnlyBundle,
        priceUsdCents: accessCheck.priceUsdCents,
        message: accessCheck.isMembersOnlyBundle
          ? `「${def.title}」整套母包为 Skillry Pro 会员专享。开通 Pro 后即可通过 npm 一键拉取整套 ${def.totalEffectsCount} 个动效！`
          : `你的账号（${accessCheck.account.email || "免费版"}）尚未解锁「${cleanSlug}」。可前往单独购买该效果（$4.99），或开通 Skillry Pro 解锁全库。`,
        catalog
      };
    }

    if (!accessCheck.canDownload && accessCheck.reason === "daily_download_limit") {
      const catalog = await getSkillryCatalogStatus(store);
      return {
        status: "failed",
        slug: cleanSlug,
        actionUrl: accessCheck.pricingUrl,
        pricingUrl: accessCheck.pricingUrl,
        landingUrl: def.landingUrl,
        message: "今日账号下载配额已达上限，请稍后再试。",
        catalog
      };
    }
  }

  const checkInstalled = () =>
    isMaster ? Boolean(findInstalledSkillryPackPaths(cleanSlug as SkillryPackId).primarySkillMdPath) : Boolean(findInstalledSkillPathsBySlug(cleanSlug).primarySkillMdPath);

  // Optional AI Agent mode
  if (mode === "ai-agent" && input.agentCliId && (input.agentCliId === "claude-code" || input.agentCliId === "codex" || input.agentCliId === "antigravity")) {
    const probe = await resolveAgentCliExecutable(input.agentCliId).catch(() => null);
    if (probe?.launchBin) {
      logChunks.push(`[AI Agent] 正在通过 ${probe.name || input.agentCliId} 读取 ${installDocUrl} 执行安装...`);
      const agentPrompt = [
        `Read ${installDocUrl} and install the skill "${cleanSlug}" into ~/.agents/skills/${cleanSlug} using:`,
        `npm exec --yes --package=skillry-cli@latest -- skillry-cli install ${cleanSlug} --agent shared --force`,
        `Do not modify any other files. If the CLI reports 402/403, payment, Pro, or purchase required, output the exact CLI error and stop immediately.`
      ].join("\n");

      const agentArgs =
        input.agentCliId === "claude-code"
          ? ["-p", agentPrompt, "--dangerously-skip-permissions"]
          : input.agentCliId === "antigravity"
            ? ["-p", agentPrompt, "--mode", "auto"]
            : ["exec", "--skip-git-repo-check", "--dangerously-bypass-approvals-and-sandbox", agentPrompt];

      const agentRun = await runCommandCapture(probe.launchBin, agentArgs, {
        timeoutMs: 180_000,
        pathPrepend: probe.launchPathPrepend
      });
      if (agentRun.output.trim()) {
        logChunks.push(agentRun.output.trim());
      }

      if (checkInstalled()) {
        const synced = await syncSkillryPackToMkboard(store, cleanSlug);
        return { ...synced, logs: logChunks.join("\n\n") };
      }

      const agentClassification = classifySkillryInstallFailure(agentRun.output, agentRun.exitCode, cleanSlug);
      if (agentClassification.status === "needs_entitlement" || agentClassification.status === "needs_login") {
        const catalog = await getSkillryCatalogStatus(store);
        return { slug: cleanSlug, ...agentClassification, logs: logChunks.join("\n\n"), catalog };
      }
    }
  }

  // Primary engine: proactively execute npm (`npm exec --yes --package=skillry-cli@latest -- skillry-cli install <slug> --agent shared --force`)
  const npmBin = await resolveNpmBinary();
  let lastRun: { exitCode: number | null; output: string } | null = null;

  if (npmBin) {
    const npmArgs = [
      "exec",
      "--yes",
      "--package=skillry-cli@latest",
      "--",
      "skillry-cli",
      "install",
      cleanSlug,
      "--agent",
      "shared",
      "--force"
    ];
    logChunks.push(`$ npm ${npmArgs.join(" ")}`);
    const npmRun = await runCommandCapture(npmBin, npmArgs, {
      timeoutMs: 240_000,
      pathPrepend: npmBin.includes("/") || npmBin.includes("\\") ? [dirname(npmBin)] : [],
      envExtra: {
        npm_config_yes: "true",
        npm_config_fund: "false",
        npm_config_audit: "false",
        npm_config_update_notifier: "false"
      }
    });
    lastRun = npmRun;
    if (npmRun.output.trim()) {
      logChunks.push(npmRun.output.trim());
    }

    if (npmRun.exitCode === 0 && checkInstalled()) {
      const synced = await syncSkillryPackToMkboard(store, cleanSlug);
      return { ...synced, logs: logChunks.join("\n\n") };
    }

    const npmClassification = classifySkillryInstallFailure(npmRun.output, npmRun.exitCode, cleanSlug);
    if (npmClassification.status === "needs_entitlement" || npmClassification.status === "needs_login") {
      const catalog = await getSkillryCatalogStatus(store);
      return { slug: cleanSlug, ...npmClassification, logs: logChunks.join("\n\n"), catalog };
    }
  }

  // Built-in zero-Node/zero-npm fallback using MkBoard's bundled skillry-cli installer (zero Keychain prompt)
  const bundledCli = resolveBundledSkillryCliEntry();
  if (bundledCli) {
    logChunks.push(
      npmBin
        ? `[Fallback] npm 执行未完成，切换使用 MkBoard 内置 Skillry 引擎拉取 ${cleanSlug}...`
        : `[Built-in Runtime] 本机未检测到全局 npm，自动使用 MkBoard 内置 Skillry 引擎拉取 ${cleanSlug}...`
    );
    try {
      const tokenForFallback = await readSkillryKeyringToken();
      if (!tokenForFallback) {
        lastRun = { exitCode: 1, output: "Not logged in to Skillry. Please connect your Skillry account first." };
      } else {
        const installerHref = new URL(`file://${join(dirname(bundledCli.entryPath), "installer.js")}`).href;
        const installerMod = (await import(installerHref)) as {
          installSkill: (
            opts: { baseUrl: string; force: boolean; slug: string; targetDirectory: string },
            deps: {
              login: () => Promise<string>;
              store: {
                read: (b: string) => Promise<string | null>;
                write: (b: string, t: string) => Promise<void>;
                delete: (b: string) => Promise<void>;
              };
            }
          ) => Promise<{ targetPath: string; version: string }>;
        };
        const targetDirectory = join(homedir(), ".agents", "skills");
        mkdirSync(targetDirectory, { recursive: true });
        const installedRes = await installerMod.installSkill(
          {
            baseUrl: SKILLRY_BASE_URL,
            slug: cleanSlug,
            targetDirectory,
            force: true
          },
          {
            login: async () => {
              throw new Error("SESSION_UNAUTHORIZED");
            },
            store: {
              read: async () => tokenForFallback,
              write: async (_b, nextToken) => writeSkillryKeyringToken(nextToken),
              delete: async () => deleteSkillryKeyringToken()
            }
          }
        );
        lastRun = { exitCode: 0, output: `Installed ${cleanSlug}@${installedRes.version} -> ${installedRes.targetPath}` };
        logChunks.push(lastRun.output);
        if (checkInstalled()) {
          const synced = await syncSkillryPackToMkboard(store, cleanSlug);
          return { ...synced, logs: logChunks.join("\n\n") };
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const errCode = (err as { exitCode?: number })?.exitCode ?? 1;
      lastRun = { exitCode: errCode, output: errMsg };
      logChunks.push(errMsg);
    }
  }

  if (!lastRun) {
    const catalog = await getSkillryCatalogStatus(store);
    return {
      status: "failed",
      slug: cleanSlug,
      actionUrl: def.landingUrl,
      pricingUrl: def.pricingUrl,
      landingUrl: def.landingUrl,
      logs: logChunks.join("\n\n"),
      message: "未检测到可用的 npm 或内置 Skillry CLI 运行环境，请检查本机 Node.js / npm 环境。",
      catalog
    };
  }

  const classification = classifySkillryInstallFailure(lastRun.output, lastRun.exitCode, cleanSlug);
  const catalog = await getSkillryCatalogStatus(store);
  return {
    slug: cleanSlug,
    ...classification,
    logs: logChunks.join("\n\n"),
    catalog
  };
}

export async function importTasteFromSource(store: MkboardStore, input: ExternalSourceImportInput): Promise<Taste> {
  const prepared = await prepareImportWorkspace(input);
  try {
    const extracted = extractStyleFromDirectory(prepared.targetDir, {
      fallbackName: input.name?.trim() || prepared.suggestedName,
      fallbackDescription: input.description?.trim() || "",
      sourceUrl: prepared.canonicalSourceUrl
    });

    const stableId =
      input.existingId?.trim() ||
      (prepared.sourceSlug ? `taste-import-${sanitizeSlug(prepared.sourceSlug)}` : undefined);

    return store.createTaste({
      id: stableId,
      name: input.name?.trim() || extracted.name,
      description: input.description?.trim() || extracted.description,
      content: extracted.content,
      sourceUrl: prepared.canonicalSourceUrl,
      preview: extracted.preview
    });
  } finally {
    prepared.cleanup();
  }
}

export async function importSkillFromSource(store: MkboardStore, input: ExternalSourceImportInput): Promise<Skill> {
  const prepared = await prepareImportWorkspace(input);
  try {
    const extracted = extractSkillFromDirectory(prepared.targetDir, {
      fallbackName: input.name?.trim() || prepared.suggestedName,
      fallbackDescription: input.description?.trim() || "",
      sourceUrl: prepared.canonicalSourceUrl
    });

    // Check if the imported skill is actually one of the official Skillry packs (e.g. imported from a Skillry ZIP!).
    const normalizedSlug = sanitizeSlug(extracted.rawSkillSlug || extracted.name);
    const matchedOfficialSlug =
      normalizedSlug === "bs-creatormotion" || extracted.rawSkillSlug === "bs-creatormotion"
        ? ("bs-creatormotion" as const)
        : normalizedSlug === "bs-launchmotion" || extracted.rawSkillSlug === "bs-launchmotion"
          ? ("bs-launchmotion" as const)
          : null;

    if (input.installToAgentSkills !== false && extracted.skillFolderToInstall) {
      const targetSlug = matchedOfficialSlug ?? sanitizeSlug(extracted.rawSkillSlug || extracted.name || prepared.suggestedName);
      if (targetSlug) {
        installSkillFolderToLocalAgents(extracted.skillFolderToInstall, targetSlug);
      }
    }

    if (matchedOfficialSlug) {
      const synced = await syncSkillryPackToMkboard(store, matchedOfficialSlug);
      if (synced.skill) return synced.skill;
    }

    const stableId =
      input.existingId?.trim() ||
      (prepared.sourceSlug ? `skill-import-${sanitizeSlug(prepared.sourceSlug)}` : `skill-import-${sanitizeSlug(extracted.name)}`);

    return store.upsertExternalSkill({
      id: stableId,
      name: input.name?.trim() || extracted.name,
      description: input.description?.trim() || extracted.description,
      content: extracted.content,
      iconId: extracted.iconId,
      gradientId: extracted.gradientId
    });
  } finally {
    prepared.cleanup();
  }
}

// ============================================================================
// OpenDesign-inspired GitHub / Local / ZIP Workspace Preparation & Extractors
// ============================================================================

type PreparedWorkspace = {
  targetDir: string;
  canonicalSourceUrl: string;
  suggestedName: string;
  sourceSlug: string;
  cleanup: () => void;
};

type ParsedGitHubTarget = {
  owner: string;
  repo: string;
  mode: "root" | "tree" | "blob";
  remainderSegments: string[];
  canonicalUrl: string;
};

export function parseGitHubUrl(rawInput: string): ParsedGitHubTarget | null {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  // Support github:owner/repo[/subpath] or shorthand owner/repo
  const shorthandMatch = /^(?:github:)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:\/(.+))?$/u.exec(trimmed);
  if (shorthandMatch && !trimmed.includes("://") && !trimmed.startsWith("/") && !trimmed.startsWith(".")) {
    const owner = shorthandMatch[1];
    const repo = shorthandMatch[2].replace(/\.git$/iu, "");
    const rest = shorthandMatch[3] ? shorthandMatch[3].split("/").filter(Boolean) : [];
    return {
      owner,
      repo,
      mode: rest.length > 0 ? "tree" : "root",
      remainderSegments: rest.length > 0 ? ["HEAD", ...rest] : [],
      canonicalUrl: `https://github.com/${owner}/${repo}${rest.length > 0 ? `/tree/HEAD/${rest.join("/")}` : ""}`
    };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.hostname !== "github.com" && url.hostname !== "www.github.com") {
    return null;
  }

  const segments = url.pathname
    .replace(/\/+$/u, "")
    .split("/")
    .filter(Boolean);
  if (segments.length < 2) return null;

  const owner = segments[0];
  const repo = segments[1].replace(/\.git$/iu, "");
  if (segments.length === 2) {
    return {
      owner,
      repo,
      mode: "root",
      remainderSegments: [],
      canonicalUrl: `https://github.com/${owner}/${repo}`
    };
  }

  const kind = segments[2];
  if ((kind === "tree" || kind === "blob") && segments.length >= 4) {
    return {
      owner,
      repo,
      mode: kind,
      remainderSegments: segments.slice(3).map((seg) => decodeURIComponent(seg)),
      canonicalUrl: `https://github.com/${owner}/${repo}/${kind}/${segments.slice(3).join("/")}`
    };
  }

  return {
    owner,
    repo,
    mode: "root",
    remainderSegments: [],
    canonicalUrl: `https://github.com/${owner}/${repo}`
  };
}

async function prepareImportWorkspace(input: ExternalSourceImportInput): Promise<PreparedWorkspace> {
  const raw = input.urlOrPath.trim();
  if (!raw) {
    throw new Error("请输入有效的 GitHub 仓库地址或选择本地路径。");
  }

  // Auto-detect GitHub URLs even if sourceType wasn't toggled
  const githubTarget = input.sourceType === "github" || raw.includes("github.com/") || raw.startsWith("github:") ? parseGitHubUrl(raw) : null;
  if (githubTarget) {
    return downloadGitHubWorkspace(githubTarget);
  }

  // Raw HTTP(S) Markdown URL (e.g. raw.githubusercontent.com/.../SKILL.md or DESIGN.md)
  if (/^https?:\/\//iu.test(raw)) {
    const tempRoot = mkdtempSync(join(tmpdir(), "mkboard-url-import-"));
    try {
      const response = await fetch(raw, {
        headers: { "User-Agent": "MkBoard-OSS/0.3" }
      });
      if (!response.ok) {
        throw new Error(`下载远程文件失败（HTTP ${response.status}）。`);
      }
      const text = await response.text();
      const urlObj = new URL(raw);
      const base = basename(urlObj.pathname) || "SKILL.md";
      const fileName = extname(base) ? base : `${base}.md`;
      writeFileSync(join(tempRoot, fileName), text, "utf8");
      const stem = fileName.replace(/\.[^.]+$/u, "");
      return {
        targetDir: tempRoot,
        canonicalSourceUrl: raw,
        suggestedName: humanizeName(stem === "SKILL" || stem === "DESIGN" || stem === "README" ? urlObj.hostname : stem),
        sourceSlug: `${urlObj.hostname}-${stem}`,
        cleanup: () => rmSync(tempRoot, { recursive: true, force: true })
      };
    } catch (error) {
      rmSync(tempRoot, { recursive: true, force: true });
      throw error;
    }
  }

  // Local path (directory, .zip archive, or single file)
  const resolvedPath = raw.startsWith("~/") ? join(homedir(), raw.slice(2)) : resolve(raw);
  if (!existsSync(resolvedPath)) {
    throw new Error(`找不到本地路径：${resolvedPath}`);
  }

  const stat = statSync(resolvedPath);
  if (stat.isDirectory()) {
    const folderName = basename(resolvedPath);
    return {
      targetDir: resolvedPath,
      canonicalSourceUrl: `file://${resolvedPath}`,
      suggestedName: humanizeName(folderName),
      sourceSlug: folderName,
      cleanup: () => undefined
    };
  }

  const ext = extname(resolvedPath).toLowerCase();
  const tempRoot = mkdtempSync(join(tmpdir(), "mkboard-local-import-"));
  try {
    if (ext === ".zip" || ext === ".tgz" || ext === ".gz") {
      await extractArchiveToDirectory(resolvedPath, tempRoot);
      const unwrapped = unwrapSingleTopLevelDirectory(tempRoot);
      const archiveStem = basename(resolvedPath, ext);
      return {
        targetDir: unwrapped,
        canonicalSourceUrl: `file://${resolvedPath}`,
        suggestedName: humanizeName(basename(unwrapped) !== basename(tempRoot) ? basename(unwrapped) : archiveStem),
        sourceSlug: archiveStem,
        cleanup: () => rmSync(tempRoot, { recursive: true, force: true })
      };
    }

    const copiedName = basename(resolvedPath);
    cpSync(resolvedPath, join(tempRoot, copiedName));
    const stem = copiedName.replace(/\.[^.]+$/u, "");
    const parentName = basename(dirname(resolvedPath));
    return {
      targetDir: tempRoot,
      canonicalSourceUrl: `file://${resolvedPath}`,
      suggestedName: humanizeName(stem.toUpperCase() === "SKILL" || stem.toUpperCase() === "DESIGN" ? parentName : stem),
      sourceSlug: `${parentName}-${stem}`,
      cleanup: () => rmSync(tempRoot, { recursive: true, force: true })
    };
  } catch (error) {
    rmSync(tempRoot, { recursive: true, force: true });
    throw error;
  }
}

async function downloadGitHubWorkspace(target: ParsedGitHubTarget): Promise<PreparedWorkspace> {
  const tempRoot = mkdtempSync(join(tmpdir(), "mkboard-gh-import-"));
  const archivePath = join(tempRoot, "repo.tar.gz");
  const extractDir = join(tempRoot, "extracted");
  mkdirSync(extractDir, { recursive: true });

  try {
    // Build candidate { ref, subpath } pairs (handles branches like main, master, HEAD, or feature/foo)
    const candidates: Array<{ ref: string; subpath: string }> = [];
    if (target.mode === "root" || target.remainderSegments.length === 0) {
      candidates.push({ ref: "HEAD", subpath: "" }, { ref: "main", subpath: "" }, { ref: "master", subpath: "" });
    } else if (target.remainderSegments[0] === "HEAD") {
      const sub = target.remainderSegments.slice(1).join("/");
      candidates.push({ ref: "HEAD", subpath: sub }, { ref: "main", subpath: sub }, { ref: "master", subpath: sub });
    } else {
      for (let splitIndex = 1; splitIndex <= target.remainderSegments.length; splitIndex += 1) {
        const ref = target.remainderSegments.slice(0, splitIndex).join("/");
        const subpath = target.remainderSegments.slice(splitIndex).join("/");
        candidates.push({ ref, subpath });
      }
    }

    let resolvedDir: string | null = null;
    let resolvedSubpath = "";

    for (const candidate of candidates) {
      const codeloadUrl =
        candidate.ref === "HEAD"
          ? `https://codeload.github.com/${target.owner}/${target.repo}/tar.gz/HEAD`
          : `https://codeload.github.com/${target.owner}/${target.repo}/tar.gz/${candidate.ref}`;
      const res = await fetch(codeloadUrl, {
        headers: { "User-Agent": "MkBoard-OSS/0.3" }
      });
      if (!res.ok) continue;

      const bytes = Buffer.from(await res.arrayBuffer());
      writeFileSync(archivePath, bytes);
      rmSync(extractDir, { recursive: true, force: true });
      mkdirSync(extractDir, { recursive: true });

      const tarResult = await runQuickCommand("tar", ["-xzf", archivePath, "-C", extractDir], 30_000);
      if (tarResult.exitCode !== 0) continue;

      const repoRoot = unwrapSingleTopLevelDirectory(extractDir);
      if (!candidate.subpath) {
        resolvedDir = repoRoot;
        resolvedSubpath = "";
        break;
      }

      const candidateTarget = join(repoRoot, candidate.subpath);
      if (existsSync(candidateTarget)) {
        const st = statSync(candidateTarget);
        if (st.isDirectory()) {
          resolvedDir = candidateTarget;
        } else {
          // Single blob file inside GitHub repo -> isolate in its own directory or parent directory if SKILL.md/DESIGN.md
          const fileName = basename(candidateTarget).toUpperCase();
          if (fileName === "SKILL.md" || fileName === "DESIGN.MD" || fileName === "STYLE.MD") {
            resolvedDir = dirname(candidateTarget);
          } else {
            const singleDir = join(tempRoot, "single");
            mkdirSync(singleDir, { recursive: true });
            cpSync(candidateTarget, join(singleDir, basename(candidateTarget)));
            resolvedDir = singleDir;
          }
        }
        resolvedSubpath = candidate.subpath;
        break;
      }
    }

    if (!resolvedDir) {
      throw new Error(`无法从 GitHub 拉取 ${target.owner}/${target.repo}，请确认仓库为公开仓库且分支/目录地址正确。`);
    }

    const leafName = resolvedSubpath ? basename(resolvedSubpath.replace(/\/+$/u, "")) : target.repo;
    const cleanLeaf = ["SKILL.MD", "DESIGN.MD", "STYLE.MD", "README.MD"].includes(leafName.toUpperCase())
      ? basename(dirname(resolvedSubpath)) || target.repo
      : leafName;

    return {
      targetDir: resolvedDir,
      canonicalSourceUrl: target.canonicalUrl,
      suggestedName: humanizeName(cleanLeaf || target.repo),
      sourceSlug: `${target.owner}-${target.repo}${resolvedSubpath ? `-${resolvedSubpath}` : ""}`,
      cleanup: () => rmSync(tempRoot, { recursive: true, force: true })
    };
  } catch (error) {
    rmSync(tempRoot, { recursive: true, force: true });
    throw error;
  }
}

function extractStyleFromDirectory(
  rootDir: string,
  options: { fallbackName: string; fallbackDescription: string; sourceUrl: string }
): {
  name: string;
  description: string;
  preview: TastePreview;
  content: string;
} {
  const files = collectProjectFiles(rootDir, 4, 80);
  const mdPriority = ["design.md", "style.md", "visual-style.md", "taste.md", "skill.md", "readme.md"];
  let primaryDocPath: string | null = null;
  for (const preferred of mdPriority) {
    const hit = files.find((filePath) => basename(filePath).toLowerCase() === preferred);
    if (hit) {
      primaryDocPath = hit;
      break;
    }
  }
  if (!primaryDocPath) {
    primaryDocPath = files.find((filePath) => filePath.toLowerCase().endsWith(".md")) ?? null;
  }

  let docName = "";
  let docDescription = "";
  let docBody = "";
  if (primaryDocPath) {
    const raw = readFileSync(primaryDocPath, "utf8");
    const fm = parseYamlFrontmatter(raw);
    docName = fm.name || extractFirstMarkdownHeading(fm.body) || "";
    docDescription = fm.description || extractFirstMarkdownParagraph(fm.body) || "";
    docBody = fm.body.trim();
  }

  // Scan CSS / SCSS / JSON / TSX / HTML files for design tokens & color palette
  const styleSourceTexts: string[] = [];
  if (docBody) styleSourceTexts.push(docBody);
  for (const filePath of files) {
    const ext = extname(filePath).toLowerCase();
    if ([".css", ".scss", ".less", ".html", ".tsx", ".jsx", ".json", ".js", ".ts"].includes(ext)) {
      try {
        const text = readFileSync(filePath, "utf8");
        if (text.length <= 120_000) {
          styleSourceTexts.push(text);
        }
      } catch {
        // Ignore binary/unreadable files.
      }
    }
  }

  const combinedStyleText = styleSourceTexts.join("\n");
  const preview = extractPaletteFromSources(combinedStyleText);
  const fontHints = extractFontFamiliesFromSources(combinedStyleText);

  const finalName = (docName || options.fallbackName || "Custom Imported Style").slice(0, 60);
  const finalDescription = (
    options.fallbackDescription ||
    docDescription ||
    `从 ${options.sourceUrl.replace(/^file:\/\//u, "")} 导入的视觉风格与模板规范`
  ).slice(0, 180);

  const tokenSummary = [
    `# ${finalName}`,
    `- 来源：${options.sourceUrl}`,
    `- 主背景色 (Background)：${preview.background}`,
    `- 主前景色 (Foreground)：${preview.foreground}`,
    `- 强调色 (Accent)：${preview.accent}`,
    fontHints.length > 0 ? `- 识别字体信号：${fontHints.join(", ")}` : null
  ]
    .filter(Boolean)
    .join("\n");

  const content = docBody
    ? `${tokenSummary}\n\n## 导入的设计系统与视觉规范\n\n${truncateMiddle(docBody, 24_000)}`
    : `${tokenSummary}\n\n## 自动提取的模板视觉规则\n\n- 严格使用主背景色 ${preview.background}、主文字色 ${preview.foreground} 与强调色 ${preview.accent} 构建高对比度画面层级。\n- 保持留白克制、组件对齐清晰，避免通用默认蓝紫渐变。\n- 在生成分镜图像与 HyperFrames 动态图形时延续该开源模板的排版比例与色彩语义。`;

  return {
    name: finalName,
    description: finalDescription,
    preview,
    content
  };
}

function extractSkillFromDirectory(
  rootDir: string,
  options: { fallbackName: string; fallbackDescription: string; sourceUrl: string }
): {
  name: string;
  description: string;
  content: string;
  rawSkillSlug: string;
  skillFolderToInstall: string | null;
  iconId: string;
  gradientId: string;
} {
  const files = collectProjectFiles(rootDir, 3, 60);
  const skillMdPath =
    files.find((f) => f === join(rootDir, "SKILL.md")) ||
    files.find((f) => basename(f).toLowerCase() === "skill.md") ||
    null;

  const fallbackMdPath =
    skillMdPath ||
    files.find((f) => ["agents.md", "claude.md", "prompt.md", "readme.md"].includes(basename(f).toLowerCase())) ||
    files.find((f) => f.toLowerCase().endsWith(".md")) ||
    null;

  if (!fallbackMdPath) {
    throw new Error("未在该仓库或压缩包中找到 SKILL.md 或 Markdown 规则文件。");
  }

  const raw = readFileSync(fallbackMdPath, "utf8");
  const fm = parseYamlFrontmatter(raw);
  const rawSlug = fm.name.trim();
  const heading = extractFirstMarkdownHeading(fm.body);
  const name = (heading || (rawSlug ? humanizeName(rawSlug) : "") || options.fallbackName || "Imported Skill").slice(0, 60);
  const description = (
    options.fallbackDescription ||
    fm.description ||
    extractFirstMarkdownParagraph(fm.body) ||
    `从 ${options.sourceUrl.replace(/^file:\/\//u, "")} 导入的自定义技能`
  ).slice(0, 180);

  const skillFolderToInstall = skillMdPath ? dirname(skillMdPath) : null;
  const contentHeader = `# ${name}\n来源：${options.sourceUrl}\n\n`;
  const content = `${contentHeader}${truncateMiddle(fm.body.trim() || raw.trim(), 28_000)}`;

  return {
    name,
    description,
    content,
    rawSkillSlug: rawSlug,
    skillFolderToInstall,
    iconId: skillMdPath ? "sparkles" : "package-search",
    gradientId: skillMdPath ? "glacier" : "teal-fog"
  };
}

export function extractPaletteFromSources(source: string): TastePreview {
  const varMatches = new Map<string, string>();
  const cssVarRegex = /--([A-Za-z0-9_-]+)\s*:\s*([^;\n}]+)/gu;
  let match: RegExpExecArray | null;
  while ((match = cssVarRegex.exec(source)) !== null) {
    const key = match[1].toLowerCase();
    const hex = normalizeToHexColor(match[2]);
    if (hex && !varMatches.has(key)) {
      varMatches.set(key, hex);
    }
  }

  // Also check JSON/object style keys like "background": "#0f172a"
  const jsonColorRegex = /["']?(background|bg|surface|paper|canvas|foreground|fg|text|ink|accent|primary|brand|highlight)["']?\s*:\s*["'](#[0-9a-fA-F]{3,8})["']/giu;
  while ((match = jsonColorRegex.exec(source)) !== null) {
    const key = match[1].toLowerCase();
    const hex = normalizeToHexColor(match[2]);
    if (hex && !varMatches.has(key)) {
      varMatches.set(key, hex);
    }
  }

  const pickByKeys = (keys: string[]): string | null => {
    for (const key of keys) {
      if (varMatches.has(key)) return varMatches.get(key)!;
    }
    for (const [k, v] of varMatches.entries()) {
      if (keys.some((candidate) => k.includes(candidate))) return v;
    }
    return null;
  };

  let background = pickByKeys(["background", "bg-primary", "canvas", "paper", "surface", "bg"]);
  let foreground = pickByKeys(["foreground", "text-primary", "ink", "fg", "text"]);
  let accent = pickByKeys(["accent", "primary", "brand", "highlight"]);

  const allHexes: string[] = [];
  const hexRegex = /#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/gu;
  while ((match = hexRegex.exec(source)) !== null) {
    const normalized = normalizeToHexColor(match[0]);
    if (normalized && !allHexes.includes(normalized)) {
      allHexes.push(normalized);
    }
    if (allHexes.length >= 24) break;
  }

  if (!background) {
    background = allHexes.find((hex) => getRelativeLuminance(hex) > 0.78 || getRelativeLuminance(hex) < 0.08) || allHexes[0] || "#0F172A";
  }

  const bgLum = getRelativeLuminance(background);
  if (!foreground || Math.abs(getRelativeLuminance(foreground) - bgLum) < 0.25) {
    const contrasting = allHexes.find((hex) => Math.abs(getRelativeLuminance(hex) - bgLum) >= 0.45);
    foreground = contrasting || (bgLum > 0.45 ? "#0F172A" : "#F8FAFC");
  }

  if (!accent || accent === background || accent === foreground) {
    const vibrant = allHexes.find((hex) => hex !== background && hex !== foreground && getColorSaturation(hex) > 0.28);
    accent = vibrant || "#EFB72E";
  }

  return { background, foreground, accent };
}

function extractFontFamiliesFromSources(source: string): string[] {
  const found = new Set<string>();
  const regex = /font-family\s*:\s*([^;\n}]+)/giu;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source)) !== null) {
    const firstFont = match[1]
      .split(",")[0]
      ?.replace(/["']/gu, "")
      .trim();
    if (firstFont && !firstFont.startsWith("var(") && firstFont.length < 40) {
      found.add(firstFont);
    }
    if (found.size >= 4) break;
  }
  return Array.from(found);
}

function normalizeToHexColor(raw: string): string | null {
  const trimmed = raw.trim();
  const hexMatch = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/u.exec(trimmed);
  if (hexMatch) {
    const digits = hexMatch[1];
    if (digits.length === 3) {
      return `#${digits[0]}${digits[0]}${digits[1]}${digits[1]}${digits[2]}${digits[2]}`.toUpperCase();
    }
    return `#${digits.slice(0, 6)}`.toUpperCase();
  }
  return null;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const r = Number.parseInt(clean.slice(0, 2), 16) || 0;
  const g = Number.parseInt(clean.slice(2, 4), 16) || 0;
  const b = Number.parseInt(clean.slice(4, 6), 16) || 0;
  return [r, g, b];
}

function getRelativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getColorSaturation(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const l = (max + min) / 2;
  return l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
}

function parseYamlFrontmatter(markdown: string): { name: string; description: string; body: string } {
  const normalized = markdown.replace(/\r\n/gu, "\n");
  if (!normalized.startsWith("---\n")) {
    return { name: "", description: "", body: normalized };
  }
  const endIndex = normalized.indexOf("\n---\n", 4);
  if (endIndex < 0) {
    return { name: "", description: "", body: normalized };
  }
  const header = normalized.slice(4, endIndex);
  const body = normalized.slice(endIndex + 5);
  let name = "";
  let description = "";
  for (const line of header.split("\n")) {
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.+)$/u.exec(line.trim());
    if (!kv) continue;
    const key = kv[1].toLowerCase();
    const val = kv[2].replace(/^["']|["']$/gu, "").trim();
    if (key === "name") name = val;
    if (key === "description") description = val;
  }
  return { name, description, body };
}

function extractFirstMarkdownHeading(markdown: string): string {
  for (const line of markdown.split(/\r?\n/u)) {
    const m = /^#\s+(.+)$/u.exec(line.trim());
    if (m) return m[1].replace(/[`*_]/gu, "").trim();
  }
  return "";
}

function extractFirstMarkdownParagraph(markdown: string): string {
  const blocks = markdown
    .split(/\n\s*\n/u)
    .map((b) => b.trim())
    .filter(Boolean);
  for (const block of blocks) {
    if (block.startsWith("#") || block.startsWith("```") || block.startsWith("-") || block.startsWith(">")) continue;
    return block.replace(/\s+/gu, " ").trim();
  }
  return "";
}

function collectProjectFiles(rootDir: string, maxDepth: number, maxFiles: number): string[] {
  const out: string[] = [];
  function walk(dir: string, depth: number) {
    if (depth > maxDepth || out.length >= maxFiles) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (out.length >= maxFiles) break;
      if (entry.name.startsWith(".") && entry.name !== ".agents") continue;
      if (IGNORED_SCAN_DIRS.has(entry.name)) continue;
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (entry.isFile()) {
        out.push(fullPath);
      }
    }
  }
  walk(rootDir, 0);
  return out;
}

function unwrapSingleTopLevelDirectory(dir: string): string {
  try {
    const entries = readdirSync(dir, { withFileTypes: true }).filter((e) => !e.name.startsWith(".") && e.name !== "__MACOSX");
    if (entries.length === 1 && entries[0].isDirectory()) {
      return join(dir, entries[0].name);
    }
  } catch {
    // Fall through
  }
  return dir;
}

async function extractArchiveToDirectory(archivePath: string, targetDir: string): Promise<void> {
  const lower = archivePath.toLowerCase();
  if (lower.endsWith(".zip") && process.platform === "darwin") {
    const ditto = await runQuickCommand("/usr/bin/ditto", ["-x", "-k", archivePath, targetDir], 30_000);
    if (ditto.exitCode === 0) return;
  }
  const tar = await runQuickCommand("tar", ["-xf", archivePath, "-C", targetDir], 30_000);
  if (tar.exitCode !== 0) {
    throw new Error(`解压压缩包失败：${tar.output || archivePath}`);
  }
}

function installSkillFolderToLocalAgents(sourceFolder: string, slug: string): string[] {
  const installed: string[] = [];
  const home = homedir();
  const sharedTarget = join(home, ".agents", "skills", slug);
  mkdirSync(dirname(sharedTarget), { recursive: true });
  if (resolve(sourceFolder) !== resolve(sharedTarget)) {
    rmSync(sharedTarget, { recursive: true, force: true });
    cpSync(sourceFolder, sharedTarget, { recursive: true });
  }
  installed.push(sharedTarget);

  const claudeDir = join(home, ".claude");
  if (existsSync(claudeDir)) {
    const claudeTarget = join(claudeDir, "skills", slug);
    mkdirSync(dirname(claudeTarget), { recursive: true });
    if (resolve(sourceFolder) !== resolve(claudeTarget)) {
      rmSync(claudeTarget, { recursive: true, force: true });
      cpSync(sourceFolder, claudeTarget, { recursive: true });
    }
    installed.push(claudeTarget);
  }
  return installed;
}

function mirrorSkillFolderAcrossAgentDirs(sourceFolder: string, slug: string): void {
  try {
    installSkillFolderToLocalAgents(sourceFolder, slug);
  } catch {
    // Non-fatal mirror step.
  }
}

export async function resolveNpmBinary(): Promise<string | null> {
  const env = localCliSpawnEnv();
  const candidates = localToolchainExecutableCandidates("npm", undefined, env);
  for (const candidate of candidates) {
    if ((candidate.includes("/") || candidate.includes("\\")) && existsSync(candidate)) {
      return candidate;
    }
  }
  const probeName = process.platform === "win32" ? "npm.cmd" : "npm";
  const probe = await runCommandCapture(probeName, ["--version"], { timeoutMs: 2500 });
  if (probe.exitCode === 0 && probe.output.trim()) {
    return probeName;
  }
  return null;
}

export function resolveBundledSkillryCliEntry(): {
  nodeBin: string;
  entryPath: string;
  envExtra: Record<string, string>;
} | null {
  try {
    const req = createRequire(import.meta.url);
    const pkgJsonPath = req.resolve("skillry-cli/package.json");
    let cliDir = dirname(pkgJsonPath);
    if (cliDir.includes("app.asar") && !cliDir.includes("app.asar.unpacked")) {
      const unpackedDir = cliDir.replace("app.asar", "app.asar.unpacked");
      if (existsSync(join(unpackedDir, "dist", "index.js"))) {
        cliDir = unpackedDir;
      }
    }
    const entryPath = join(cliDir, "dist", "index.js");
    if (!existsSync(entryPath)) return null;
    return {
      nodeBin: process.execPath,
      entryPath,
      envExtra: process.versions.electron ? { ELECTRON_RUN_AS_NODE: "1" } : {}
    };
  } catch {
    return null;
  }
}

function runQuickCommand(
  command: string,
  args: string[],
  timeoutMs: number
): Promise<{ exitCode: number | null; output: string }> {
  return runCommandCapture(command, args, { timeoutMs });
}

function runCommandCapture(
  command: string,
  args: string[],
  options: { timeoutMs: number; pathPrepend?: string[]; envExtra?: Record<string, string> }
): Promise<{ exitCode: number | null; output: string }> {
  return new Promise((resolvePromise) => {
    const chunks: string[] = [];
    let settled = false;
    const child = crossSpawn(command, args, {
      env: {
        ...localCliSpawnEnv(options.pathPrepend ?? []),
        ...(options.envExtra ?? {})
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      resolvePromise({ exitCode: null, output: `${chunks.join("")}\n[Timed out]` });
    }, options.timeoutMs);

    child.stdout?.on("data", (buf: Buffer) => chunks.push(buf.toString("utf8")));
    child.stderr?.on("data", (buf: Buffer) => chunks.push(buf.toString("utf8")));
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise({ exitCode: 1, output: `${chunks.join("")}\n${err.message}` });
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise({ exitCode: code, output: chunks.join("") });
    });
  });
}

function sanitizeSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 64);
}

function humanizeName(raw: string): string {
  return raw
    .replace(/^bs-/iu, "")
    .replace(/[-_]+/gu, " ")
    .replace(/\b[a-z]/gu, (ch) => ch.toUpperCase())
    .trim();
}

function truncateMiddle(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const half = Math.floor(maxChars / 2);
  return `${text.slice(0, half)}\n\n...[已省略中间 ${text.length - maxChars} 字符]...\n\n${text.slice(text.length - half)}`;
}

function extractCleanErrorSummary(output: string): string {
  const lines = output
    .split(/\r?\n/u)
    .map((l) => l.replace(/\u001b\[[0-9;]*m/gu, "").trim())
    .filter(Boolean);
  const important = lines.find((l) => /error|failed|402|403|404|denied|unable/iu.test(l));
  return (important || lines[lines.length - 1] || "").slice(0, 240);
}
