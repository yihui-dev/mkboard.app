import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import type {
  AgentCliId,
  ExternalSourceImportInput,
  Skill,
  SkillryCatalogStatus,
  SkillryInstallInput,
  SkillryInstallResult,
  SkillryPackId,
  SkillryPackPricingTier,
  SkillryPackStatus,
  Taste,
  TastePreview
} from "../shared";
import { localCliSpawnEnv, localToolchainExecutableCandidates, resolveAgentCliExecutable } from "./codex-auth";
import type { MkboardStore } from "./database";

type SkillryPackDefinition = {
  slug: SkillryPackId;
  mkboardSkillId: string;
  title: string;
  subtitle: string;
  pricingTier: SkillryPackPricingTier;
  totalEffectsCount: number;
  landingUrl: string;
  skillPageUrl: string;
  installDocUrl: string;
  pricingUrl: string;
  iconId: string;
  gradientId: string;
  storyboardGuidance: string;
};

export const SKILLRY_OFFICIAL_PACKS: Record<SkillryPackId, SkillryPackDefinition> = {
  "bs-creatormotion": {
    slug: "bs-creatormotion",
    mkboardSkillId: "skill-skillry-bs-creatormotion",
    title: "CreatorMotion",
    subtitle: "口播 / 知识讲解动态图形 B-Roll 母技能（含免费体验 · Pro 解锁 122+ 可编辑动效）",
    pricingTier: "freemium_pro",
    totalEffectsCount: 122,
    landingUrl: "https://skillry.dev/ai-videos/ai-motion-graphics",
    skillPageUrl: "https://skillry.dev/skills/bs-creatormotion",
    installDocUrl: "https://skillry.dev/skills/bs-creatormotion/install.md",
    pricingUrl: "https://skillry.dev/pricing",
    iconId: "wand-sparkles",
    gradientId: "apricot-grey",
    storyboardGuidance: [
      "你是结合 Skillry 官方 CreatorMotion 动效库的口播与知识讲解分镜导演。",
      "1. 识别脚本中真正受益于动态视觉解释的节点（数量变化、前后对比、流程关系、集合累积、章节切换、金句强调），将该分镜的生成方式设为 Hyperframes，并在视频提示词中写明对应的画面变化逻辑与可编辑文案。",
      "2. 口播主讲人出镜自然段落保留为 A-ROLL；需要写实摄影或镜头运动的画面使用 ChatGPT Image2 / Seedance 2.0，不要把所有镜头机械塞成同一种卡片。",
      "3. 当本机已安装 ~/.agents/skills/bs-creatormotion 时，HyperFrames 生成阶段优先参考其 references/catalog.md 与 references/DESIGN.md（如 white-yellow、charcoal-lime、paper-orange、midnight-ice 配色体系与中文排版规范）。"
    ].join("\n")
  },
  "bs-launchmotion": {
    slug: "bs-launchmotion",
    mkboardSkillId: "skill-skillry-bs-launchmotion",
    title: "LaunchMotion",
    subtitle: "产品发布片 / SaaS 宣传片代码级动效套件（Pro / 单买解锁 208 个高转化发布场景）",
    pricingTier: "paid_pro",
    totalEffectsCount: 208,
    landingUrl: "https://skillry.dev/ai-videos/product-launch-video",
    skillPageUrl: "https://skillry.dev/skills/bs-launchmotion",
    installDocUrl: "https://skillry.dev/skills/bs-launchmotion/install.md",
    pricingUrl: "https://skillry.dev/pricing",
    iconId: "rocket",
    gradientId: "periwinkle-haze",
    storyboardGuidance: [
      "你是结合 Skillry 官方 LaunchMotion 发布片套件的产品宣传片导演。",
      "1. 按高转化产品发布片节奏拆分镜头：Hook 痛点钩子 -> 旧方案对比 -> 核心产品 UI 演示 -> 关键指标/客户背书 (Proof) -> 品牌收尾与行动号召 (CTA Wordmark)。",
      "2. 产品 UI 演示、指标跳动、特性拆解、品牌口号收尾优先将生成方式设为 Hyperframes，并在视频提示词中明确界面元素层级、交互焦点、文案语言和时长（10–16 秒）。",
      "3. 当本机已安装 ~/.agents/skills/bs-launchmotion 时，HyperFrames 生成阶段优先参考其本机场景规范与组件动效节奏，严禁虚构不存在的产品数据。"
    ].join("\n")
  }
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
    join(home, ".codex", "skills")
  ];
}

export function findInstalledSkillryPackPaths(slug: SkillryPackId, home = homedir()): {
  installedPaths: string[];
  subSkillCount: number;
  primarySkillMdPath: string | null;
} {
  const installedPaths: string[] = [];
  const subSkillNames = new Set<string>();
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
          subSkillNames.add(entry.name);
        }
      }
    } catch {
      // Ignore unreadable skill directories.
    }
  }

  return {
    installedPaths,
    subSkillCount: subSkillNames.size,
    primarySkillMdPath
  };
}

async function detectSkillryCliAuthState(): Promise<{
  loggedIn: boolean;
  email: string | null;
  handle: string | null;
}> {
  const home = homedir();
  const configCandidates = [
    join(home, ".config", "skillry", "auth.json"),
    join(home, ".skillry", "auth.json"),
    join(home, "Library", "Application Support", "skillry", "auth.json")
  ];
  for (const candidate of configCandidates) {
    if (!existsSync(candidate)) continue;
    try {
      const parsed = JSON.parse(readFileSync(candidate, "utf8")) as Record<string, unknown>;
      if (parsed.accessToken || parsed.token || parsed.user) {
        const user = (parsed.user && typeof parsed.user === "object" ? parsed.user : {}) as Record<string, unknown>;
        return {
          loggedIn: true,
          email: typeof user.email === "string" ? user.email : typeof parsed.email === "string" ? parsed.email : null,
          handle: typeof user.handle === "string" ? user.handle : typeof user.name === "string" ? user.name : null
        };
      }
    } catch {
      // Ignore malformed auth cache.
    }
  }

  // On macOS, skillry-cli stores OAuth tokens in Keychain under service "skillry-cli" or "skillry.dev".
  if (process.platform === "darwin") {
    for (const serviceName of ["skillry-cli", "skillry.dev", "skillry"]) {
      const found = await runQuickCommand("/usr/bin/security", ["find-generic-password", "-s", serviceName], 1500);
      if (found.exitCode === 0) {
        return { loggedIn: true, email: null, handle: null };
      }
    }
  }

  return { loggedIn: false, email: null, handle: null };
}

export async function getSkillryCatalogStatus(store: MkboardStore): Promise<SkillryCatalogStatus> {
  const skills = store.listSkills();
  const skillIds = new Set(skills.map((skill) => skill.id));
  const auth = await detectSkillryCliAuthState();

  const packs: SkillryPackStatus[] = (Object.keys(SKILLRY_OFFICIAL_PACKS) as SkillryPackId[]).map((slug) => {
    const def = SKILLRY_OFFICIAL_PACKS[slug];
    const localInfo = findInstalledSkillryPackPaths(slug);
    const hasChildOnly = !localInfo.primarySkillMdPath && localInfo.subSkillCount > 0;
    return {
      slug: def.slug,
      mkboardSkillId: def.mkboardSkillId,
      title: def.title,
      subtitle: def.subtitle,
      pricingTier: def.pricingTier,
      totalEffectsCount: def.totalEffectsCount,
      installedLocally: localInfo.installedPaths.length > 0 || hasChildOnly,
      installedSubSkillCount: localInfo.subSkillCount,
      installedPaths: localInfo.installedPaths,
      syncedToMkboard: skillIds.has(def.mkboardSkillId),
      landingUrl: def.landingUrl,
      skillPageUrl: def.skillPageUrl,
      installDocUrl: def.installDocUrl,
      pricingUrl: def.pricingUrl,
      aiInstallPrompt: `Read ${def.installDocUrl} and follow the instructions to install the skill.`,
      cliInstallCommand: `npx --yes skillry-cli@latest install ${def.slug} --force`
    };
  });

  return {
    cliLoggedIn: auth.loggedIn,
    cliAccountEmail: auth.email,
    cliAccountHandle: auth.handle,
    packs
  };
}

function buildMkboardSkillContentForSkillryPack(def: SkillryPackDefinition, primarySkillMdPath: string | null): {
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

  const localDirNote = primarySkillMdPath
    ? `本机 Skillry 技能目录：${dirname(primarySkillMdPath)}\n本机 SKILL.md 路径：${primarySkillMdPath}`
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

export async function syncSkillryPackToMkboard(store: MkboardStore, slug: SkillryPackId): Promise<SkillryInstallResult> {
  const def = SKILLRY_OFFICIAL_PACKS[slug];
  if (!def) {
    throw new Error(`未知的 Skillry 套件：${slug}`);
  }

  const localInfo = findInstalledSkillryPackPaths(slug);
  if (!localInfo.primarySkillMdPath && localInfo.subSkillCount === 0) {
    const catalog = await getSkillryCatalogStatus(store);
    return {
      status: "failed",
      slug,
      actionUrl: def.landingUrl,
      pricingUrl: def.pricingUrl,
      landingUrl: def.landingUrl,
      message: `本机尚未检测到 ${def.title}（~/.agents/skills/${slug}），请先点击「AI 一键导入」。`,
      catalog
    };
  }

  // Mirror between ~/.agents/skills/<slug> and ~/.claude/skills/<slug> so all local agents see it.
  if (localInfo.primarySkillMdPath) {
    mirrorSkillFolderAcrossAgentDirs(dirname(localInfo.primarySkillMdPath), slug);
  }

  const refreshedInfo = findInstalledSkillryPackPaths(slug);
  const built = buildMkboardSkillContentForSkillryPack(def, refreshedInfo.primarySkillMdPath);
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
    slug,
    skill,
    installedPaths: refreshedInfo.installedPaths,
    actionUrl: def.landingUrl,
    pricingUrl: def.pricingUrl,
    landingUrl: def.landingUrl,
    message: `已将 ${def.title} 同步到 MkBoard 技能库，可在创建项目或切换分镜技能时直接选用。`,
    catalog
  };
}

export function classifySkillryInstallFailure(
  combinedOutput: string,
  exitCode: number | null,
  slug: SkillryPackId
): Pick<SkillryInstallResult, "status" | "actionUrl" | "pricingUrl" | "landingUrl" | "message"> {
  const def = SKILLRY_OFFICIAL_PACKS[slug];
  const normalized = combinedOutput.toLowerCase();

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
      actionUrl: def.landingUrl,
      pricingUrl: def.pricingUrl,
      landingUrl: def.landingUrl,
      message:
        slug === "bs-creatormotion"
          ? "当前 Skillry 账号尚未解锁 CreatorMotion 完整套件权限。前往 Skillry 开通 Pro 或获取对应套件后，点击「重试导入」即可一键拉取到本地。"
          : "LaunchMotion 属于 Skillry 付费专业套件（Pro 会员免费解锁全部 208 个场景，也支持单独购买）。前往 Skillry 解锁后，回来点击「重试导入」即可完成安装。"
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
      actionUrl: def.skillPageUrl,
      pricingUrl: def.pricingUrl,
      landingUrl: def.landingUrl,
      message: "需要在浏览器中完成 Skillry 账号登录授权。请确认已在弹出的浏览器页面点击授权后重试。"
    };
  }

  return {
    status: "failed",
    actionUrl: def.landingUrl,
    pricingUrl: def.pricingUrl,
    landingUrl: def.landingUrl,
    message: extractCleanErrorSummary(combinedOutput) || `导入 ${def.title} 未完成，请检查网络连接或使用 ZIP 离线包导入。`
  };
}

export async function installSkillryPack(store: MkboardStore, input: SkillryInstallInput): Promise<SkillryInstallResult> {
  const def = SKILLRY_OFFICIAL_PACKS[input.slug];
  if (!def) {
    throw new Error(`未知的 Skillry 套件：${input.slug}`);
  }

  const logChunks: string[] = [];
  const mode = input.mode ?? "ai-agent";

  // 1. If user chose AI Agent mode and has a configured local coding agent (Claude Code / Codex),
  //    let the Agent read official install.md or run skillry-cli first, then verify via skillry-cli if needed.
  if (mode === "ai-agent" && input.agentCliId && (input.agentCliId === "claude-code" || input.agentCliId === "codex")) {
    const probe = await resolveAgentCliExecutable(input.agentCliId).catch(() => null);
    if (probe?.launchBin) {
      logChunks.push(`[AI Agent] 正在通过 ${probe.name || input.agentCliId} 读取 ${def.installDocUrl} 执行安装...`);
      const agentPrompt = [
        `Read ${def.installDocUrl} and install the skill "${def.slug}" into ~/.agents/skills/${def.slug} using:`,
        `npx --yes skillry-cli@latest install ${def.slug} --force`,
        `Do not modify any other files. If the CLI reports 402/403, payment, Pro, or purchase required, output the exact CLI error and stop immediately.`
      ].join("\n");

      const agentArgs =
        input.agentCliId === "claude-code"
          ? ["-p", agentPrompt, "--dangerously-skip-permissions"]
          : ["exec", "--skip-git-repo-check", "--dangerously-bypass-approvals-and-sandbox", agentPrompt];

      const agentRun = await runCommandCapture(probe.launchBin, agentArgs, {
        timeoutMs: 180_000,
        pathPrepend: probe.launchPathPrepend
      });
      if (agentRun.output.trim()) {
        logChunks.push(agentRun.output.trim());
      }

      const afterAgent = findInstalledSkillryPackPaths(input.slug);
      if (afterAgent.primarySkillMdPath) {
        const synced = await syncSkillryPackToMkboard(store, input.slug);
        return {
          ...synced,
          logs: logChunks.join("\n\n")
        };
      }

      // Check if the agent already hit a clear entitlement (402/403) error so we don't double-prompt OAuth unnecessarily.
      const agentClassification = classifySkillryInstallFailure(agentRun.output, agentRun.exitCode, input.slug);
      if (agentClassification.status === "needs_entitlement") {
        const catalog = await getSkillryCatalogStatus(store);
        return {
          slug: input.slug,
          ...agentClassification,
          logs: logChunks.join("\n\n"),
          catalog
        };
      }
    }
  }

  // 2. Run official `npx --yes skillry-cli@latest install <slug> --force` directly with enriched local PATH.
  //    This triggers browser OAuth 2.0 Device Flow automatically if not logged in, and gives exact exit code / 402 message if unentitled.
  const npxPath = resolveNpxBinary();
  if (!npxPath) {
    const catalog = await getSkillryCatalogStatus(store);
    return {
      status: "failed",
      slug: input.slug,
      actionUrl: def.landingUrl,
      pricingUrl: def.pricingUrl,
      landingUrl: def.landingUrl,
      logs: logChunks.join("\n\n"),
      message: "未在本机检测到 Node.js / npx 环境，请先安装 Node.js 或直接导入从 Skillry 下载的 ZIP 压缩包。",
      catalog
    };
  }

  logChunks.push(`$ npx --yes skillry-cli@latest install ${def.slug} --force`);
  const cliRun = await runCommandCapture(npxPath, ["--yes", "skillry-cli@latest", "install", def.slug, "--force"], {
    timeoutMs: 240_000,
    pathPrepend: [dirname(npxPath)]
  });
  if (cliRun.output.trim()) {
    logChunks.push(cliRun.output.trim());
  }

  const localAfterCli = findInstalledSkillryPackPaths(input.slug);
  if (cliRun.exitCode === 0 && localAfterCli.primarySkillMdPath) {
    const synced = await syncSkillryPackToMkboard(store, input.slug);
    return {
      ...synced,
      logs: logChunks.join("\n\n")
    };
  }

  const classification = classifySkillryInstallFailure(cliRun.output, cliRun.exitCode, input.slug);
  const catalog = await getSkillryCatalogStatus(store);
  return {
    slug: input.slug,
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

function resolveNpxBinary(): string | null {
  const env = localCliSpawnEnv();
  const candidates = localToolchainExecutableCandidates("npx", undefined, env);
  for (const candidate of candidates) {
    if (candidate.includes("/") && existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[0] || "npx";
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
  options: { timeoutMs: number; pathPrepend?: string[] }
): Promise<{ exitCode: number | null; output: string }> {
  return new Promise((resolvePromise) => {
    const chunks: string[] = [];
    let settled = false;
    const child = spawn(command, args, {
      env: localCliSpawnEnv(options.pathPrepend ?? []),
      stdio: ["ignore", "pipe", "pipe"]
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
