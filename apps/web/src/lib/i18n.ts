export const locales = ["zh", "en"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

export function isLocale(value: string | null | undefined): value is Locale {
  return value === "zh" || value === "en";
}

export function stripLocalePrefix(pathname: string) {
  if (pathname === "/zh" || pathname === "/en") return "/";
  if (pathname.startsWith("/zh/") || pathname.startsWith("/en/")) return pathname.slice(3) || "/";
  return pathname || "/";
}

export function localizePath(path: string, locale: Locale) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const pathWithoutLocale = stripLocalePrefix(normalizedPath);
  if (locale === defaultLocale) return pathWithoutLocale;
  if (pathWithoutLocale === "/") return "/zh";
  return `/zh${pathWithoutLocale}`;
}

export function switchLocalePath(pathname: string, targetLocale: Locale) {
  return localizePath(stripLocalePrefix(pathname), targetLocale);
}

export function getLocaleFromRequest(request: Request, url: URL): Locale {
  const headerLocale = request.headers.get("x-mkboard-locale");
  if (isLocale(headerLocale)) return headerLocale;
  if (url.pathname === "/zh" || url.pathname.startsWith("/zh/")) return "zh";
  if (url.pathname === "/en" || url.pathname.startsWith("/en/")) return "en";
  return defaultLocale;
}

export const layoutCopy = {
  zh: {
    navLabel: "主导航",
    footerLabel: "页脚导航",
    nav: {
      home: "首页",
      docs: "文档",
      download: "下载",
      github: "GitHub 开源"
    },
    language: {
      label: "切换语言",
      zh: "中文",
      en: "EN"
    },
    footer: {
      explore: "探索",
      resources: "资源",
      legal: "法律",
      home: "首页",
      docs: "文档",
      download: "下载",
      github: "GitHub 仓库",
      changelog: "更新日志",
      privacyPolicy: "隐私说明",
      termsOfService: "开源许可"
    }
  },
  en: {
    navLabel: "Primary navigation",
    footerLabel: "Footer navigation",
    nav: {
      home: "Home",
      docs: "Docs",
      download: "Download",
      github: "GitHub"
    },
    language: {
      label: "Switch language",
      zh: "中文",
      en: "EN"
    },
    footer: {
      explore: "Explore",
      resources: "Resources",
      legal: "Open Source",
      home: "Home",
      docs: "Docs",
      download: "Download",
      github: "GitHub Repo",
      changelog: "Changelog",
      privacyPolicy: "Privacy Policy",
      termsOfService: "Terms & License"
    }
  }
} as const;
