import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CircleCheck,
  Coins,
  Copy,
  Download,
  ExternalLink,
  Eye,
  Film,
  KeyRound,
  Layers,
  LoaderCircle,
  Lock,
  LogIn,
  LogOut,
  Palette,
  Play,
  RefreshCw,
  Rocket,
  Search,
  ShieldCheck,
  Sparkles,
  Terminal,
  Unlock,
  WandSparkles,
  X
} from "lucide-react";
import type {
  AgentCliId,
  CreateTasteInput,
  SkillryAccessCheckResult,
  SkillryCatalogStatus,
  SkillryCollectionDetail,
  SkillryDeviceAuthSession,
  SkillryInstallResult,
  SkillryPackId,
  SkillryPackStatus,
  SkillrySubEffectItem,
  SkillryVisualThemeItem,
  Taste
} from "../../../shared";
import type { InterfaceLanguage } from "../i18n";

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

const DEFAULT_FALLBACK_PACKS: SkillryPackStatus[] = [
  {
    slug: "bs-creatormotion",
    mkboardSkillId: "skill-skillry-bs-creatormotion",
    title: "CreatorMotion",
    subtitle: "自媒体口播 / 知识讲解动态图形合集（122 个可编辑子效果 · 含免费体验，Pro 解锁全集）",
    pricingTier: "freemium_pro",
    totalEffectsCount: 122,
    freeEffectsCount: 2,
    installedLocally: false,
    installedMasterLocally: false,
    installedSubSkillCount: 0,
    installedPaths: [],
    syncedToMkboard: false,
    landingUrl: "https://skillry.dev/ai-videos/ai-motion-graphics",
    skillPageUrl: "https://skillry.dev/skills/bs-creatormotion",
    installDocUrl: "https://skillry.dev/skills/bs-creatormotion/install.md",
    pricingUrl: "https://skillry.dev/pricing",
    heroVideoUrl: "https://media.skillry.dev/ai-motion-graphics/format-16x9.a171f29e2c.mp4",
    heroPosterUrl:
      "https://media.skillry.dev/cdn-cgi/image/width=1080,quality=80,fit=scale-down,format=auto/ai-motion-graphics/scatter-presenter.e74aa25307.webp",
    featuredPosters: [
      "https://media.skillry.dev/cdn-cgi/image/width=480,quality=80,fit=scale-down,format=auto/ai-motion-graphics/scatter-presenter.e74aa25307.webp",
      "https://media.skillry.dev/cdn-cgi/image/width=480,quality=80,fit=scale-down,format=auto/ai-motion-graphics/sequential-bars.ca2ae067fb.webp",
      "https://media.skillry.dev/cdn-cgi/image/width=480,quality=80,fit=scale-down,format=auto/ai-motion-graphics/hub-routing.dc3de2ec33.webp"
    ],
    categoryTagsZh: ["章节转场", "数据对比", "结构拆解", "口播分屏", "动态排版", "清单卡片"],
    categoryTagsEn: ["Chapters", "Data & Charts", "Diagrams", "Presenter Split", "Kinetic Type", "Cards & Lists"],
    themes: [],
    aiInstallPrompt: "Read https://skillry.dev/skills/bs-creatormotion/install.md and follow the instructions to install the skill.",
    cliInstallCommand: "npm exec --yes --package=skillry-cli@latest -- skillry-cli install bs-creatormotion --agent shared --force"
  },
  {
    slug: "bs-launchmotion",
    mkboardSkillId: "skill-skillry-bs-launchmotion",
    title: "LaunchMotion",
    subtitle: "产品发布片 / SaaS 宣传片动效场景合集（208 个高转化发布场景 · 6 套品牌色 · 含免费体验，Pro 解锁全集）",
    pricingTier: "paid_pro",
    totalEffectsCount: 208,
    freeEffectsCount: 8,
    installedLocally: false,
    installedMasterLocally: false,
    installedSubSkillCount: 0,
    installedPaths: [],
    syncedToMkboard: false,
    landingUrl: "https://skillry.dev/ai-videos/product-launch-video",
    skillPageUrl: "https://skillry.dev/skills/bs-launchmotion",
    installDocUrl: "https://skillry.dev/skills/bs-launchmotion/install.md",
    pricingUrl: "https://skillry.dev/pricing",
    heroVideoUrl: "https://media.skillry.dev/product-launch-video/hero.66bd4589cc.mp4",
    heroPosterUrl:
      "https://media.skillry.dev/cdn-cgi/image/width=1080,quality=80,fit=scale-down,format=auto/product-launch-video/hero.635baeb12c.webp",
    featuredPosters: [
      "https://media.skillry.dev/cdn-cgi/image/width=480,quality=80,fit=scale-down,format=auto/product-launch-video/beat-hook.f692b5ce1d.webp",
      "https://media.skillry.dev/cdn-cgi/image/width=480,quality=80,fit=scale-down,format=auto/product-launch-video/beat-demo.3317300011.webp",
      "https://media.skillry.dev/cdn-cgi/image/width=480,quality=80,fit=scale-down,format=auto/product-launch-video/beat-close.6fdb4d7fdc.webp"
    ],
    categoryTagsZh: ["痛点与输入", "产品 UI 演示", "Agent 流程", "数据背书", "矩阵画廊", "品牌收尾 CTA"],
    categoryTagsEn: ["Prompt & Hook", "Product UI", "Agent Flow", "Data Proof", "Grid & Moodboard", "Brand CTA"],
    themes: [],
    aiInstallPrompt: "Read https://skillry.dev/skills/bs-launchmotion/install.md and follow the instructions to install the skill.",
    cliInstallCommand: "npm exec --yes --package=skillry-cli@latest -- skillry-cli install bs-launchmotion --agent shared --force"
  }
];

function formatPriceUsd(cents: number, isEn: boolean): string {
  if (cents <= 0) return isEn ? "Free" : "免费体验";
  if (cents >= 99_999) return isEn ? "Pro Members" : "Pro 会员专享";
  return `$${(cents / 100).toFixed(2)}`;
}

export interface SkillryMotionHubProps {
  surface: "taste" | "skills";
  locale: InterfaceLanguage;
  catalog: SkillryCatalogStatus | null;
  catalogLoading: boolean;
  selectedCliId?: AgentCliId;
  onRefreshCatalog: (forceRefresh?: boolean) => Promise<SkillryCatalogStatus | null>;
  onSkillsChanged?: () => Promise<unknown>;
  onOpenSkillInEditor?: (skillId: string) => void;
  onApplyVisualThemeAsTaste?: (input: CreateTasteInput) => Promise<Taste>;
  onOpenExternal: (url: string) => void;
  onDrillDownChange?: (isDrilledDown: boolean) => void;
}

type ModalTarget =
  | {
      kind: "bundle";
      pack: SkillryPackStatus;
    }
  | {
      kind: "subEffect";
      pack: SkillryPackStatus;
      item: SkillrySubEffectItem;
    };

export function SkillryMotionHub({
  surface,
  locale,
  catalog,
  catalogLoading,
  selectedCliId,
  onRefreshCatalog,
  onSkillsChanged,
  onOpenSkillInEditor,
  onApplyVisualThemeAsTaste,
  onOpenExternal,
  onDrillDownChange
}: SkillryMotionHubProps) {
  const isEn = locale === "en";
  const packs = catalog?.packs?.length ? catalog.packs : DEFAULT_FALLBACK_PACKS;
  const account = catalog?.account ?? {
    connected: Boolean(catalog?.cliLoggedIn),
    email: catalog?.cliAccountEmail ?? null,
    name: catalog?.cliAccountHandle ?? null,
    entitlement: "unknown" as const,
    quotaRemaining: null,
    quotaLimit: null
  };

  const [activePackSlug, setActivePackSlug] = useState<SkillryPackId | null>(null);
  const [collectionDetail, setCollectionDetail] = useState<SkillryCollectionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleLimit, setVisibleLimit] = useState(24);
  const [selectedThemeId, setSelectedThemeId] = useState<string>("");
  const [applyingThemeId, setApplyingThemeId] = useState<string | null>(null);
  const [themeSavedToast, setThemeSavedToast] = useState<string | null>(null);

  // Device Auth state
  const [authSession, setAuthSession] = useState<SkillryDeviceAuthSession | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  // Unlock & Pull Modal target
  const [modalTarget, setModalTarget] = useState<ModalTarget | null>(null);

  useEffect(() => {
    onDrillDownChange?.(Boolean(activePackSlug));
  }, [activePackSlug, onDrillDownChange]);

  const loadCollectionDetail = useCallback(
    async (slug: SkillryPackId, forceRefresh = false) => {
      if (!window.mkboard?.getSkillryCollectionDetail) return;
      setDetailLoading(true);
      try {
        const res = await window.mkboard.getSkillryCollectionDetail({
          slug,
          locale,
          forceRefresh
        });
        setCollectionDetail(res);
        setSelectedThemeId((prev) => {
          if (prev && res.pack.themes.some((th: SkillryVisualThemeItem) => th.id === prev)) return prev;
          return res.pack.themes[0]?.id ?? "";
        });
      } finally {
        setDetailLoading(false);
      }
    },
    [locale]
  );

  useEffect(() => {
    if (!activePackSlug) {
      setCollectionDetail(null);
      return;
    }
    setSelectedCategory("all");
    setSearchQuery("");
    setVisibleLimit(24);
    void loadCollectionDetail(activePackSlug, false);
  }, [activePackSlug, loadCollectionDetail]);

  // Poll OAuth Device Flow automatically while status === "pending"
  useEffect(() => {
    if (!authSession || authSession.status !== "pending") return undefined;
    const intervalMs = Math.max(2500, (authSession.pollAfterSeconds ?? 4) * 1000);
    const timer = window.setInterval(async () => {
      if (!window.mkboard?.pollSkillryDeviceAuth) return;
      const next = await window.mkboard.pollSkillryDeviceAuth();
      setAuthSession(next);
      if (next.status === "connected") {
        await onRefreshCatalog(true);
        if (activePackSlug) {
          void loadCollectionDetail(activePackSlug, false);
        }
        window.setTimeout(() => setAuthSession(null), 2500);
      }
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [activePackSlug, authSession, loadCollectionDetail, onRefreshCatalog]);

  async function handleStartConnectAccount() {
    if (!window.mkboard?.startSkillryDeviceAuth || authBusy) return;
    setAuthBusy(true);
    try {
      const session = await window.mkboard.startSkillryDeviceAuth();
      setAuthSession(session);
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleDisconnectAccount() {
    if (!window.mkboard?.disconnectSkillryAccount || authBusy) return;
    setAuthBusy(true);
    try {
      setAuthSession(null);
      await window.mkboard.disconnectSkillryAccount();
      await onRefreshCatalog(true);
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleApplyThemeToTaste(pack: SkillryPackStatus, theme: SkillryVisualThemeItem) {
    if (!onApplyVisualThemeAsTaste) return;
    const hasUnlockOrLocal = account.entitlement === "premium" || pack.installedLocally;
    if (!hasUnlockOrLocal) {
      setModalTarget({ kind: "bundle", pack });
      return;
    }
    setApplyingThemeId(theme.id);
    try {
      const created = await onApplyVisualThemeAsTaste({
        name: `${pack.title} · ${isEn ? theme.nameEn : theme.nameZh}`,
        description: isEn ? theme.descriptionEn : theme.descriptionZh,
        content: [
          `# ${pack.title} — ${isEn ? theme.nameEn : theme.nameZh}`,
          "",
          theme.tasteRules,
          "",
          `Palette: ${theme.swatches.join(" / ")}`,
          `Collection: ${pack.landingUrl}`
        ].join("\n"),
        sourceUrl: pack.landingUrl,
        preview: {
          background: theme.swatches[0] || "#FAF9F5",
          foreground: theme.swatches[1] || "#141413",
          accent: theme.swatches[2] || "#2F6BFF"
        }
      });
      setThemeSavedToast(created.name);
      window.setTimeout(() => setThemeSavedToast(null), 2800);
    } finally {
      setApplyingThemeId(null);
    }
  }

  const activePack = useMemo(
    () => (activePackSlug ? collectionDetail?.pack ?? packs.find((p) => p.slug === activePackSlug) ?? null : null),
    [activePackSlug, collectionDetail, packs]
  );

  const filteredItems = useMemo(() => {
    const all = collectionDetail?.items ?? [];
    const q = searchQuery.trim().toLowerCase();
    return all.filter((item) => {
      if (selectedCategory === "free" && item.priceUsdCents !== 0) return false;
      if (selectedCategory === "installed" && !item.installedLocally) return false;
      if (
        selectedCategory !== "all" &&
        selectedCategory !== "free" &&
        selectedCategory !== "installed" &&
        item.category !== selectedCategory
      ) {
        return false;
      }
      if (!q) return true;
      return `${item.name} ${item.description} ${item.slug}`.toLowerCase().includes(q);
    });
  }, [collectionDetail?.items, searchQuery, selectedCategory]);

  const visibleItems = useMemo(() => filteredItems.slice(0, visibleLimit), [filteredItems, visibleLimit]);
  const activeThemes = activePack?.themes ?? [];
  const selectedTheme = activeThemes.find((t) => t.id === selectedThemeId) ?? activeThemes[0] ?? null;

  return (
    <div className="sry-hub-root">
      {/* Shared Account & Entitlement Connection Bar */}
      <div className="sry-account-bar">
        <div className="sry-account-bar-left">
          <span className="sry-brand-badge">
            <Sparkles aria-hidden="true" />
            <span>SKILLRY MOTION COLLECTIONS</span>
          </span>
          <span className="sry-showcase-note">
            {isEn
              ? "Preview all sub-effects freely · Connect Skillry & verify Pro / purchase to pull via npm"
              : "集合与子效果仅供预览展示 · 下载使用需连接 Skillry 账号并验证权限后通过 npm 拉取"}
          </span>
        </div>

        <div className="sry-account-bar-right">
          {account.connected ? (
            <>
              <span className={cx("sry-entitlement-pill", account.entitlement === "premium" ? "pro" : "free")}>
                {account.entitlement === "premium" ? <ShieldCheck aria-hidden="true" /> : <KeyRound aria-hidden="true" />}
                <span>
                  {account.entitlement === "premium"
                    ? isEn
                      ? "Skillry Pro Unlocked"
                      : "Skillry Pro 会员已解锁"
                    : isEn
                      ? "Free Account"
                      : "免费版账号"}
                </span>
                {account.email ? <small>· {account.email}</small> : null}
              </span>
              {account.entitlement !== "premium" ? (
                <button
                  type="button"
                  className="hub-btn hub-btn-amber sry-compact-btn"
                  onClick={() => onOpenExternal("https://skillry.dev/pricing")}
                >
                  <Coins aria-hidden="true" />
                  <span>{isEn ? "Upgrade Pro" : "开通 Pro"}</span>
                </button>
              ) : null}
              <button
                type="button"
                className="sry-icon-btn"
                title={isEn ? "Refresh entitlement" : "刷新账号与权限"}
                disabled={catalogLoading}
                onClick={() => {
                  void onRefreshCatalog(true);
                  if (activePackSlug) void loadCollectionDetail(activePackSlug, true);
                }}
              >
                <RefreshCw className={cx(catalogLoading && "spinning")} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="sry-icon-btn"
                title={isEn ? "Disconnect Skillry account" : "退出 Skillry 账号"}
                disabled={authBusy}
                onClick={() => void handleDisconnectAccount()}
              >
                <LogOut aria-hidden="true" />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="hub-btn hub-btn-outline sry-compact-btn"
                disabled={authBusy}
                onClick={() => void handleStartConnectAccount()}
              >
                {authBusy ? <LoaderCircle className="spinning" aria-hidden="true" /> : <LogIn aria-hidden="true" />}
                <span>{isEn ? "Connect Skillry Account" : "连接 Skillry 账号"}</span>
              </button>
              <button
                type="button"
                className="hub-btn hub-btn-ghost sry-compact-btn"
                onClick={() => onOpenExternal("https://skillry.dev/pricing")}
              >
                <Coins aria-hidden="true" />
                <span>{isEn ? "Pricing" : "会员与定价"}</span>
                <ExternalLink aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Inline OAuth Device Authorization Banner */}
      {authSession && authSession.status !== "not_started" ? (
        <div className={cx("sry-auth-flow-banner", authSession.status)} role="status" aria-live="polite">
          {authSession.status === "pending" ? (
            <>
              <div className="sry-auth-flow-copy">
                <LoaderCircle className="spinning" aria-hidden="true" />
                <div>
                  <strong>
                    {isEn
                      ? "Waiting for browser approval — verify code:"
                      : "已在浏览器打开 Skillry 授权页，请核对设备验证码并点击批准："}
                  </strong>
                  <span className="sry-device-code">{authSession.userCode}</span>
                  <small>
                    {isEn
                      ? "Once approved, MkBoard and npm skillry-cli share the login automatically."
                      : "批准后 MkBoard 与本地 npm skillry-cli 将自动共享登录凭证。"}
                  </small>
                </div>
              </div>
              <div className="sry-auth-flow-actions">
                {authSession.verificationUrl ? (
                  <button
                    type="button"
                    className="hub-btn hub-btn-outline sry-compact-btn"
                    onClick={() => onOpenExternal(authSession.verificationUrl!)}
                  >
                    <span>{isEn ? "Re-open Browser" : "重新打开授权页"}</span>
                    <ExternalLink aria-hidden="true" />
                  </button>
                ) : null}
                <button type="button" className="sry-icon-btn" onClick={() => setAuthSession(null)} aria-label="Close">
                  <X aria-hidden="true" />
                </button>
              </div>
            </>
          ) : authSession.status === "connected" ? (
            <div className="sry-auth-flow-copy">
              <CircleCheck aria-hidden="true" />
              <strong>
                {isEn
                  ? `Connected to Skillry (${authSession.account?.email || "Ready"})!`
                  : `Skillry 账号连接成功（${authSession.account?.email || "已就绪"}）！现在可直接验证权限并通过 npm 拉取。`}
              </strong>
            </div>
          ) : (
            <div className="sry-auth-flow-copy">
              <AlertTriangle aria-hidden="true" />
              <span>{authSession.message || (isEn ? "Authorization did not complete." : "授权未完成，请重试。")}</span>
              <button type="button" className="sry-icon-btn" onClick={() => setAuthSession(null)} aria-label="Close">
                <X aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      ) : null}

      {themeSavedToast ? (
        <div className="sry-toast-banner" role="status">
          <CircleCheck aria-hidden="true" />
          <span>
            {isEn
              ? `Saved "${themeSavedToast}" to your custom styles!`
              : `已将「${themeSavedToast}」保存到下方我的自定义风格！`}
          </span>
        </div>
      ) : null}

      {/* MODE 1: COLLECTION OVERVIEW CARDS */}
      {!activePackSlug ? (
        <div className="sry-collection-grid">
          {packs.map((pack) => {
            const isCreator = pack.slug === "bs-creatormotion";
            const Icon = isCreator ? WandSparkles : Rocket;
            const tags = isEn ? pack.categoryTagsEn : pack.categoryTagsZh;

            return (
              <article key={pack.slug} className={cx("sry-collection-card", isCreator ? "creator" : "launch")}>
                <div
                  className="sry-collection-stage"
                  role="button"
                  tabIndex={0}
                  onClick={() => setActivePackSlug(pack.slug)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setActivePackSlug(pack.slug);
                    }
                  }}
                >
                  <video
                    className="sry-collection-hero-video"
                    src={pack.heroVideoUrl}
                    poster={pack.heroPosterUrl}
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="metadata"
                  />
                  <div className="sry-collection-stage-scrim" />

                  <div className="sry-collection-top-badges">
                    <span className="sry-stage-pill dark">
                      <Layers aria-hidden="true" />
                      <span>
                        {isEn
                          ? `${pack.totalEffectsCount} Sub-Effects`
                          : `${pack.totalEffectsCount} 个子效果合集`}
                      </span>
                    </span>
                    <span className="sry-stage-pill free">
                      <span>
                        {isEn
                          ? `${pack.freeEffectsCount} Free Starters`
                          : `含 ${pack.freeEffectsCount} 个免费子效果`}
                      </span>
                    </span>
                  </div>

                  <div className="sry-collection-top-right">
                    {pack.installedMasterLocally ? (
                      <span className="sry-stage-pill installed">
                        <CircleCheck aria-hidden="true" />
                        <span>{isEn ? "Full Pack Installed" : "整套已安装"}</span>
                      </span>
                    ) : pack.installedSubSkillCount > 0 ? (
                      <span className="sry-stage-pill installed">
                        <CircleCheck aria-hidden="true" />
                        <span>
                          {isEn
                            ? `${pack.installedSubSkillCount} Installed`
                            : `已安装 ${pack.installedSubSkillCount} 个子效果`}
                        </span>
                      </span>
                    ) : (
                      <span className="sry-stage-pill pro-lock">
                        <Lock aria-hidden="true" />
                        <span>{isEn ? "Showcase · Unlock to Pull" : "展示合集 · 解锁后拉取"}</span>
                      </span>
                    )}
                  </div>

                  <div className="sry-collection-stage-bottom">
                    <div className="sry-mini-thumbs" aria-hidden="true">
                      {pack.featuredPosters.slice(0, 3).map((poster, i) => (
                        <img key={i} src={poster} alt="" loading="lazy" />
                      ))}
                    </div>
                    <span className="sry-enter-gallery-cta">
                      <Eye aria-hidden="true" />
                      <span>{isEn ? "Inspect Sub-Effects →" : "点进查看子效果 →"}</span>
                    </span>
                  </div>
                </div>

                <div className="sry-collection-body">
                  <div className="sry-collection-title-row">
                    <div className="sry-collection-brand">
                      <span className={cx("sry-collection-icon", isCreator ? "creator" : "launch")}>
                        <Icon aria-hidden="true" />
                      </span>
                      <div>
                        <h3>{pack.title}</h3>
                        <span className="sry-collection-sub">
                          {isCreator
                            ? isEn
                              ? "Editable Explainer & Talking-Head Motion B-Roll"
                              : "自媒体口播 / 知识讲解可编辑动态图形库"
                            : isEn
                              ? "Product Launch & SaaS Promo Motion Library"
                              : "产品发布片 / SaaS 宣传片代码级动效库"}
                        </span>
                      </div>
                    </div>

                    {pack.themes.length > 0 ? (
                      <div className="sry-theme-dots" title={isEn ? "Visual color themes" : "内置配色主题"}>
                        {pack.themes.map((th) => (
                          <span
                            key={th.id}
                            className="sry-theme-dot"
                            style={{ background: th.swatches[2] || th.swatches[0] }}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <p className="sry-collection-desc">{pack.subtitle}</p>

                  <div className="sry-collection-tags">
                    {tags.map((tag) => (
                      <span key={tag} className="sry-tag-chip">
                        {tag}
                      </span>
                    ))}
                  </div>

                  <div className="sry-collection-actions">
                    <button
                      type="button"
                      className="hub-btn hub-btn-dark sry-flex-btn"
                      onClick={() => setActivePackSlug(pack.slug)}
                    >
                      <Film aria-hidden="true" />
                      <span>
                        {isEn
                          ? `Browse ${pack.totalEffectsCount} Sub-Effects`
                          : `浏览全部 ${pack.totalEffectsCount} 个子效果`}
                      </span>
                    </button>

                    {pack.syncedToMkboard && onOpenSkillInEditor ? (
                      <button
                        type="button"
                        className="hub-btn hub-btn-outline"
                        onClick={() => onOpenSkillInEditor(pack.mkboardSkillId)}
                      >
                        <Check aria-hidden="true" />
                        <span>{isEn ? "Synced" : "已导入"}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="hub-btn hub-btn-outline"
                        onClick={() => setModalTarget({ kind: "bundle", pack })}
                      >
                        <Terminal aria-hidden="true" />
                        <span>{isEn ? "Pull Pack (npm)" : "整套拉取 (npm)"}</span>
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : activePack ? (
        /* MODE 2: DRILL-DOWN COLLECTION SUB-EFFECTS GALLERY */
        <div className="sry-gallery-view">
          <div className="sry-gallery-topbar">
            <div className="sry-gallery-topbar-left">
              <button
                type="button"
                className="hub-btn hub-btn-outline sry-compact-btn"
                onClick={() => setActivePackSlug(null)}
              >
                <ArrowLeft aria-hidden="true" />
                <span>{isEn ? "Collections" : "返回集合"}</span>
              </button>
              <div className="sry-gallery-heading">
                <h2>{activePack.title}</h2>
                <span className="sry-count-badge">
                  {isEn
                    ? `${collectionDetail?.items.length ?? activePack.totalEffectsCount} Sub-Effects`
                    : `${collectionDetail?.items.length ?? activePack.totalEffectsCount} 个子效果`}
                </span>
              </div>
            </div>

            <div className="sry-gallery-topbar-right">
              <button
                type="button"
                className="hub-btn hub-btn-ghost sry-compact-btn"
                onClick={() => onOpenExternal(activePack.landingUrl)}
              >
                <span>{isEn ? "Official Showcase" : "官网完整介绍"}</span>
                <ExternalLink aria-hidden="true" />
              </button>
              <button
                type="button"
                className="hub-btn hub-btn-dark sry-compact-btn"
                onClick={() => setModalTarget({ kind: "bundle", pack: activePack })}
              >
                {account.entitlement === "premium" || activePack.installedMasterLocally ? (
                  <Terminal aria-hidden="true" />
                ) : (
                  <Lock aria-hidden="true" />
                )}
                <span>
                  {activePack.installedMasterLocally
                    ? isEn
                      ? "Manage Full Pack"
                      : "整套已安装 · 管理"
                    : isEn
                      ? `Unlock / Pull All ${activePack.totalEffectsCount} (npm)`
                      : `整套解锁与 npm 拉取（${activePack.totalEffectsCount} 个）`}
                </span>
              </button>
            </div>
          </div>

          {/* Visual Color Theme Showcase Strip */}
          {activeThemes.length > 0 && selectedTheme ? (
            <div className="sry-theme-showcase-panel">
              <div className="sry-theme-showcase-video-wrap">
                <video
                  key={selectedTheme.previewVideoUrl}
                  src={selectedTheme.previewVideoUrl}
                  poster={selectedTheme.posterUrl}
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                />
                <span className="sry-theme-live-tag">
                  <Palette aria-hidden="true" />
                  <span>{isEn ? selectedTheme.nameEn : selectedTheme.nameZh}</span>
                </span>
              </div>

              <div className="sry-theme-showcase-controls">
                <div className="sry-theme-showcase-head">
                  <div>
                    <span className="sry-kicker-mini">
                      {isEn ? "VISUAL THEME SYSTEM" : "集合内置视觉配色体系（实时渲染预览）"}
                    </span>
                    <h3>{isEn ? selectedTheme.nameEn : selectedTheme.nameZh}</h3>
                  </div>
                  {surface === "taste" && onApplyVisualThemeAsTaste ? (
                    <button
                      type="button"
                      className="hub-btn hub-btn-outline sry-compact-btn"
                      disabled={applyingThemeId === selectedTheme.id}
                      onClick={() => void handleApplyThemeToTaste(activePack, selectedTheme)}
                    >
                      {applyingThemeId === selectedTheme.id ? (
                        <LoaderCircle className="spinning" aria-hidden="true" />
                      ) : account.entitlement === "premium" || activePack.installedLocally ? (
                        <Palette aria-hidden="true" />
                      ) : (
                        <Lock aria-hidden="true" />
                      )}
                      <span>
                        {account.entitlement === "premium" || activePack.installedLocally
                          ? isEn
                            ? "Save Theme to My Styles"
                            : "保存此配色到我的风格"
                          : isEn
                            ? "Unlock Pack to Use Style"
                            : "解锁套件以使用此风格"}
                      </span>
                    </button>
                  ) : null}
                </div>

                <p>{isEn ? selectedTheme.descriptionEn : selectedTheme.descriptionZh}</p>

                <div className="sry-theme-pill-list" role="tablist">
                  {activeThemes.map((th) => {
                    const active = th.id === selectedTheme.id;
                    return (
                      <button
                        key={th.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        className={cx("sry-theme-selector-pill", active && "active")}
                        onClick={() => setSelectedThemeId(th.id)}
                      >
                        <span className="sry-swatch-pair">
                          <i style={{ background: th.swatches[0] }} />
                          <i style={{ background: th.swatches[2] || th.swatches[1] }} />
                        </span>
                        <span>{isEn ? th.nameEn : th.nameZh.split("·")[0]?.trim()}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}

          {/* Sub-Effects Category Filter & Search Bar */}
          <div className="sry-filter-toolbar">
            <div className="sry-category-pills">
              <button
                type="button"
                className={cx("sry-cat-pill", selectedCategory === "all" && "active")}
                onClick={() => {
                  setSelectedCategory("all");
                  setVisibleLimit(24);
                }}
              >
                <span>{isEn ? "All" : "全部"}</span>
                <small>{collectionDetail?.items.length ?? 0}</small>
              </button>

              <button
                type="button"
                className={cx("sry-cat-pill free-pill", selectedCategory === "free" && "active")}
                onClick={() => {
                  setSelectedCategory("free");
                  setVisibleLimit(24);
                }}
              >
                <span>{isEn ? "Free Starter" : "免费体验"}</span>
                <small>{(collectionDetail?.items ?? []).filter((i) => i.priceUsdCents === 0).length}</small>
              </button>

              {(collectionDetail?.items ?? []).some((i) => i.installedLocally) ? (
                <button
                  type="button"
                  className={cx("sry-cat-pill", selectedCategory === "installed" && "active")}
                  onClick={() => {
                    setSelectedCategory("installed");
                    setVisibleLimit(24);
                  }}
                >
                  <span>{isEn ? "Installed" : "已安装"}</span>
                  <small>{(collectionDetail?.items ?? []).filter((i) => i.installedLocally).length}</small>
                </button>
              ) : null}

              {(collectionDetail?.categories ?? []).map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  className={cx("sry-cat-pill", selectedCategory === cat.id && "active")}
                  onClick={() => {
                    setSelectedCategory(cat.id);
                    setVisibleLimit(24);
                  }}
                >
                  <span>{isEn ? cat.labelEn : cat.labelZh}</span>
                  <small>{cat.count}</small>
                </button>
              ))}
            </div>

            <div className="sry-search-box">
              <Search aria-hidden="true" />
              <input
                type="text"
                value={searchQuery}
                placeholder={isEn ? "Search sub-effects..." : "搜索子效果名称或描述..."}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setVisibleLimit(24);
                }}
              />
              {searchQuery ? (
                <button type="button" className="sry-search-clear" onClick={() => setSearchQuery("")} aria-label="Clear">
                  <X aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </div>

          {/* Sub-Effects 4-Column Grid */}
          {detailLoading && !collectionDetail ? (
            <div className="sry-loading-grid-state">
              <LoaderCircle className="spinning" aria-hidden="true" />
              <span>{isEn ? "Loading sub-effects showcase..." : "正在加载集合内全部子效果预览..."}</span>
            </div>
          ) : visibleItems.length === 0 ? (
            <div className="sry-loading-grid-state">
              <span>{isEn ? "No matching sub-effects found." : "没有匹配当前筛选条件的子效果。"}</span>
            </div>
          ) : (
            <>
              <div className="sry-subeffects-grid">
                {visibleItems.map((item) => (
                  <SubEffectShowcaseCard
                    key={item.slug}
                    item={item}
                    isEn={isEn}
                    isProUser={account.entitlement === "premium"}
                    onSelect={() => setModalTarget({ kind: "subEffect", pack: activePack, item })}
                  />
                ))}
              </div>

              {filteredItems.length > visibleLimit ? (
                <div className="sry-load-more-row">
                  <button
                    type="button"
                    className="hub-btn hub-btn-outline"
                    onClick={() => setVisibleLimit((prev) => prev + 24)}
                  >
                    <span>
                      {isEn
                        ? `Show More (${visibleItems.length} / ${filteredItems.length})`
                        : `加载更多子效果（当前显示 ${visibleItems.length} / 共 ${filteredItems.length} 个）`}
                    </span>
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {/* Unlock Verification & npm Pull Modal */}
      {modalTarget ? (
        <SkillryUnlockAndPullModal
          target={modalTarget}
          isEn={isEn}
          account={account}
          selectedCliId={selectedCliId}
          onClose={() => setModalTarget(null)}
          onConnectAccount={handleStartConnectAccount}
          authSession={authSession}
          onOpenExternal={onOpenExternal}
          onInstalled={async () => {
            await onRefreshCatalog(true);
            await onSkillsChanged?.();
            if (activePackSlug) {
              await loadCollectionDetail(activePackSlug, false);
            }
          }}
        />
      ) : null}
    </div>
  );
}

function SubEffectShowcaseCard({
  item,
  isEn,
  isProUser,
  onSelect
}: {
  item: SkillrySubEffectItem;
  isEn: boolean;
  isProUser: boolean;
  onSelect: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const isFree = item.priceUsdCents === 0;
  const unlockedByPro = isProUser || item.installedLocally || isFree;

  return (
    <article
      className={cx("sry-effect-card", item.installedLocally && "installed")}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="sry-effect-media">
        <img src={item.posterUrl} alt={item.name} loading="lazy" />
        {hovered ? (
          <video
            className="sry-effect-hover-video"
            src={item.previewVideoUrl}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
          />
        ) : null}

        <div className="sry-effect-badges">
          {item.installedLocally ? (
            <span className="sry-eff-badge installed">
              <Check aria-hidden="true" />
              <span>{isEn ? "Installed" : "已安装"}</span>
            </span>
          ) : isFree ? (
            <span className="sry-eff-badge free">{isEn ? "Free" : "免费体验"}</span>
          ) : isProUser ? (
            <span className="sry-eff-badge pro-open">
              <Unlock aria-hidden="true" />
              <span>{isEn ? "Pro Ready" : "Pro 可直接拉取"}</span>
            </span>
          ) : (
            <span className="sry-eff-badge paid">
              <Lock aria-hidden="true" />
              <span>Pro / {formatPriceUsd(item.priceUsdCents, isEn)}</span>
            </span>
          )}
        </div>

        <span className="sry-effect-play-hint" aria-hidden="true">
          <Play />
        </span>
      </div>

      <div className="sry-effect-meta">
        <div className="sry-effect-title-line">
          <h4>{item.name}</h4>
        </div>
        <p>{item.description || item.slug}</p>
        <div className="sry-effect-footer">
          <code>{item.effectId}</code>
          <span className={cx("sry-effect-cta-text", unlockedByPro ? "ready" : "locked")}>
            {item.installedLocally
              ? isEn
                ? "Manage →"
                : "查看 / 更新 →"
              : unlockedByPro
                ? isEn
                  ? "Pull via npm →"
                  : "通过 npm 拉取 →"
                : isEn
                  ? "Preview & Unlock →"
                  : "预览与解锁 →"}
          </span>
        </div>
      </div>
    </article>
  );
}

function SkillryUnlockAndPullModal({
  target,
  isEn,
  account,
  selectedCliId,
  authSession,
  onClose,
  onConnectAccount,
  onOpenExternal,
  onInstalled
}: {
  target: ModalTarget;
  isEn: boolean;
  account: SkillryCatalogStatus["account"];
  selectedCliId?: AgentCliId;
  authSession: SkillryDeviceAuthSession | null;
  onClose: () => void;
  onConnectAccount: () => Promise<void>;
  onOpenExternal: (url: string) => void;
  onInstalled: () => Promise<void>;
}) {
  const isBundle = target.kind === "bundle";
  const slug = isBundle ? target.pack.slug : target.item.slug;
  const title = isBundle ? `${target.pack.title}（整套 ${target.pack.totalEffectsCount} 个动效合集）` : target.item.name;
  const description = isBundle ? target.pack.subtitle : target.item.description;
  const previewVideoUrl = isBundle ? target.pack.heroVideoUrl : target.item.previewVideoUrl;
  const posterUrl = isBundle ? target.pack.heroPosterUrl : target.item.posterUrl;
  const priceUsdCents = isBundle ? 99_999 : target.item.priceUsdCents;
  const npmCommand = `npm exec --yes --package=skillry-cli@latest -- skillry-cli install ${slug} --agent shared --force`;

  const [accessState, setAccessState] = useState<SkillryAccessCheckResult | null>(null);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [pullBusy, setPullBusy] = useState(false);
  const [pullResult, setPullResult] = useState<SkillryInstallResult | null>(null);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refreshAccess = useCallback(async () => {
    if (!window.mkboard?.checkSkillrySkillAccess) {
      setCheckingAccess(false);
      return null;
    }
    setCheckingAccess(true);
    try {
      const res = await window.mkboard.checkSkillrySkillAccess({ slug, priceUsdCents });
      if (mountedRef.current) setAccessState(res);
      return res;
    } finally {
      if (mountedRef.current) setCheckingAccess(false);
    }
  }, [priceUsdCents, slug]);

  useEffect(() => {
    void refreshAccess();
  }, [refreshAccess, account.connected, account.entitlement]);

  async function runNpmPull(skipPreflight = false) {
    if (!window.mkboard?.installSkillryPack || pullBusy) return;
    setPullBusy(true);
    setPullResult(null);
    try {
      const res = await window.mkboard.installSkillryPack({
        slug,
        mode: "npm",
        agentCliId: selectedCliId,
        skipPreflight
      });
      if (!mountedRef.current) return;
      setPullResult(res);
      if (res.status === "installed") {
        await onInstalled();
        await refreshAccess();
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setPullResult({
        status: "failed",
        slug,
        message: err instanceof Error ? err.message : String(err)
      });
    } finally {
      if (mountedRef.current) setPullBusy(false);
    }
  }

  async function handleVerifyAfterPurchaseAndPull() {
    const latest = await refreshAccess();
    if (latest?.canDownload) {
      await runNpmPull(true);
    }
  }

  if (typeof document === "undefined") return null;

  const isConnected = accessState ? accessState.connected : account.connected;
  const canDownload = Boolean(accessState?.canDownload);
  const installedLocally = Boolean(accessState?.installedLocally || (isBundle ? target.pack.installedMasterLocally : target.item.installedLocally));

  return createPortal(
    <div
      className="taste-preview-dialog-layer"
      onMouseDown={(e) => {
        if (!pullBusy && e.target === e.currentTarget) onClose();
      }}
    >
      <section className="hub-modal-dialog sry-unlock-modal" role="dialog" aria-modal="true" aria-label={title}>
        <header className="hub-modal-header">
          <div className="sry-modal-title-group">
            <span className="sry-kicker-mini">
              {isBundle
                ? isEn
                  ? "OFFICIAL COLLECTION PACK"
                  : "SKILLRY 官方动效合集包"
                : isEn
                  ? `${target.pack.title.toUpperCase()} SUB-EFFECT`
                  : `${target.pack.title} · 单个子效果`}
            </span>
            <h2>{title}</h2>
          </div>
          <button type="button" className="hub-modal-close" disabled={pullBusy} onClick={onClose} aria-label="Close">
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="hub-modal-body sry-unlock-modal-body">
          {/* HD Looping Preview Stage */}
          <div className="sry-modal-video-stage">
            <video src={previewVideoUrl} poster={posterUrl} autoPlay muted loop playsInline controls />
          </div>

          <p className="sry-modal-desc">{description}</p>

          {/* 3-Step Connection -> Entitlement -> npm Pull Gate */}
          <div className="sry-gate-card">
            <div className="sry-gate-header">
              <div className="sry-gate-step">
                <span className={cx("sry-step-dot", isConnected && "done")}>1</span>
                <span>{isEn ? "Connect Account" : "连接账号"}</span>
              </div>
              <span className="sry-step-line" />
              <div className="sry-gate-step">
                <span className={cx("sry-step-dot", (canDownload || installedLocally) && "done")}>2</span>
                <span>{isEn ? "Verify Entitlement" : "验证付费/会员权限"}</span>
              </div>
              <span className="sry-step-line" />
              <div className="sry-gate-step">
                <span className={cx("sry-step-dot", (installedLocally || pullResult?.status === "installed") && "done")}>3</span>
                <span>{isEn ? "npm Pull & Sync" : "npm 拉取到本地"}</span>
              </div>
            </div>

            {checkingAccess ? (
              <div className="sry-gate-status-box neutral">
                <LoaderCircle className="spinning" aria-hidden="true" />
                <span>{isEn ? "Verifying account & download entitlement..." : "正在向 Skillry 验证账号与权限状态..."}</span>
              </div>
            ) : !isConnected ? (
              <div className="sry-gate-status-box warn">
                <div className="sry-gate-copy">
                  <strong>
                    <Lock aria-hidden="true" />
                    <span>{isEn ? "Step 1: Connect your Skillry account" : "第一步：请先连接你的 Skillry 账号"}</span>
                  </strong>
                  <p>
                    {isEn
                      ? "Showcase previews are open to everyone, but pulling SKILL packages via npm requires verifying your Skillry account & entitlement."
                      : "画廊效果仅供预览展示。如需下载安装到本地使用，请先连接 Skillry 账号以验证你的会员或购买权限。"}
                  </p>
                  {authSession?.status === "pending" ? (
                    <div className="sry-inline-code-pill">
                      <LoaderCircle className="spinning" aria-hidden="true" />
                      <span>
                        {isEn ? "Approve in browser · Code: " : "请在打开的浏览器点击授权 · 验证码："}
                        <b>{authSession.userCode}</b>
                      </span>
                    </div>
                  ) : null}
                </div>
                <div className="sry-gate-actions">
                  <button type="button" className="hub-btn hub-btn-dark" onClick={() => void onConnectAccount()}>
                    <LogIn aria-hidden="true" />
                    <span>{isEn ? "Connect in Browser" : "一键连接 Skillry 账号（浏览器授权）"}</span>
                  </button>
                </div>
              </div>
            ) : !canDownload && !installedLocally ? (
              <div className="sry-gate-status-box locked">
                <div className="sry-gate-copy">
                  <strong>
                    <Coins aria-hidden="true" />
                    <span>
                      {isBundle
                        ? isEn
                          ? "Skillry Pro Membership Required for Full Collection"
                          : `整套合集为 Skillry Pro 会员专享（当前账号：${account.email || "免费版"}）`
                        : isEn
                          ? `Unlock "${target.item.name}" ($4.99 or Skillry Pro)`
                          : `尚未解锁此子效果（当前账号：${account.email || "免费版"}）`}
                    </span>
                  </strong>
                  <p>
                    {isBundle
                      ? isEn
                        ? `Upgrade to Skillry Pro to unlock all ${target.pack.totalEffectsCount} effects in ${target.pack.title} plus LaunchMotion & CreatorMotion.`
                        : `开通 Skillry Pro 即可一键解锁 ${target.pack.title} 全部 ${target.pack.totalEffectsCount} 个动效及全站所有付费技能；也可返回画廊筛选「免费体验」子效果直接测试。`
                      : isEn
                        ? "Unlock all 330+ CreatorMotion & LaunchMotion effects with Skillry Pro, or buy this single sub-effect ($4.99)."
                        : "开通 Skillry Pro 可一次解锁 CreatorMotion + LaunchMotion 全部 330+ 动效；也可以仅单独购买当前这一个子效果（$4.99）。解锁后回来点击「刷新权限并拉取」即可！"}
                  </p>
                </div>
                <div className="sry-gate-actions wrap">
                  <button
                    type="button"
                    className="hub-btn hub-btn-dark"
                    onClick={() => onOpenExternal(accessState?.pricingUrl || "https://skillry.dev/pricing")}
                  >
                    <Sparkles aria-hidden="true" />
                    <span>{isEn ? "Unlock All with Skillry Pro ↗" : "开通 Skillry Pro 解锁全套 ↗"}</span>
                  </button>

                  {!isBundle && accessState?.purchaseUrl ? (
                    <button
                      type="button"
                      className="hub-btn hub-btn-outline"
                      onClick={() => onOpenExternal(accessState.purchaseUrl!)}
                    >
                      <span>{isEn ? `Buy Single Effect (${formatPriceUsd(priceUsdCents, true)}) ↗` : `单独购买此子效果（${formatPriceUsd(priceUsdCents, false)}）↗`}</span>
                    </button>
                  ) : null}

                  <button
                    type="button"
                    className="hub-btn hub-btn-outline"
                    onClick={() => void handleVerifyAfterPurchaseAndPull()}
                  >
                    <RefreshCw aria-hidden="true" />
                    <span>{isEn ? "I've Unlocked · Verify & Pull" : "我已完成解锁，刷新权限并拉取"}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="sry-gate-status-box unlocked">
                <div className="sry-gate-copy">
                  <strong>
                    <ShieldCheck aria-hidden="true" />
                    <span>
                      {installedLocally
                        ? isEn
                          ? "Installed locally & ready in MkBoard"
                          : "本机已安装该技能包（~/.agents/skills）"
                        : accessState?.access === "free"
                          ? isEn
                            ? "Free Starter Verified — Ready to Pull via npm"
                            : "免费体验权限已验证 ✓ 可直接通过 npm 拉取到本地"
                          : isEn
                            ? "Paid / Pro Entitlement Verified — Ready to Pull via npm"
                            : `权限校验通过（${accessState?.access === "purchased" ? "已单独购买" : "Skillry Pro 会员"}）✓ 可直接通过 npm 拉取`}
                    </span>
                  </strong>
                  <div className="sry-npm-cmd-row">
                    <code>{npmCommand}</code>
                    <button
                      type="button"
                      className="sry-copy-mini"
                      onClick={() => {
                        void navigator.clipboard.writeText(npmCommand);
                        setCopiedCmd(true);
                        window.setTimeout(() => setCopiedCmd(false), 1800);
                      }}
                    >
                      {copiedCmd ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                    </button>
                  </div>
                </div>

                <div className="sry-gate-actions">
                  <button
                    type="button"
                    className="hub-btn hub-btn-dark"
                    disabled={pullBusy}
                    onClick={() => void runNpmPull(false)}
                  >
                    {pullBusy ? <LoaderCircle className="spinning" aria-hidden="true" /> : <Download aria-hidden="true" />}
                    <span>
                      {pullBusy
                        ? isEn
                          ? "Running npm pull..."
                          : "正在执行 npm 拉取..."
                        : installedLocally
                          ? isEn
                            ? "Update / Re-pull via npm"
                            : "通过 npm 更新并同步到 MkBoard"
                          : isEn
                            ? "Pull via npm & Import Now"
                            : "立即通过 npm 拉取并导入"}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Pull execution result feedback */}
          {pullResult ? (
            <div
              className={cx(
                "sry-pull-result-box",
                pullResult.status === "installed"
                  ? "ok"
                  : pullResult.status === "needs_entitlement" || pullResult.status === "needs_login"
                    ? "warn"
                    : "err"
              )}
              role="status"
            >
              <div className="sry-pull-result-main">
                {pullResult.status === "installed" ? <CircleCheck aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}
                <span>{pullResult.message}</span>
              </div>
              {pullResult.logs ? (
                <details className="sry-pull-logs">
                  <summary>{isEn ? "View npm execution log" : "查看 npm 执行日志"}</summary>
                  <pre>{pullResult.logs}</pre>
                </details>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>
    </div>,
    document.body
  );
}
