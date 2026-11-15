import { loader, source } from "fumadocs-core/source";
import type { Item, Node } from "fumadocs-core/page-tree";
import { defaultLocale, isLocale, localizePath, type Locale } from "./i18n";

export type DocsContentSlug = "intro" | "install" | "start";

type DocsPageData = {
  title: string;
  navTitle: string;
  description: string;
  contentSlug: DocsContentSlug;
};

type DocsMetaData = {
  title: string;
  root: boolean;
  pages: string[];
};

type DocsVirtualPage = {
  type: "page";
  path: string;
  slugs: string[];
  data: DocsPageData;
};

type DocsVirtualMeta = {
  type: "meta";
  path: string;
  data: DocsMetaData;
};

type DocsNavigationItem = {
  href: string;
  label: string;
  contentSlug: DocsContentSlug;
};

const docsPages: DocsVirtualPage[] = [
  {
    type: "page" as const,
    path: "index.en.mdx",
    slugs: [],
    data: {
      title: "Intro",
      navTitle: "Intro",
      description: "Understand what MkBoard is and where it fits in a storyboard production workflow.",
      contentSlug: "intro"
    }
  },
  {
    type: "page" as const,
    path: "install.en.mdx",
    slugs: ["install"],
    data: {
      title: "Installation guide",
      navTitle: "Installation guide",
      description: "Install MkBoard Desktop and prepare the local Agent and video rendering environment.",
      contentSlug: "install"
    }
  },
  {
    type: "page" as const,
    path: "start.en.mdx",
    slugs: ["start"],
    data: {
      title: "Get started",
      navTitle: "Get started",
      description: "Create your first MkBoard project and start turning scripts into storyboards and video drafts.",
      contentSlug: "start"
    }
  },
  {
    type: "page" as const,
    path: "index.zh.mdx",
    slugs: [],
    data: {
      title: "简介",
      navTitle: "简介",
      description: "了解 MkBoard 是什么产品，以及它在分镜制作流程中的位置。",
      contentSlug: "intro"
    }
  },
  {
    type: "page" as const,
    path: "install.zh.mdx",
    slugs: ["install"],
    data: {
      title: "安装教程",
      navTitle: "安装教程",
      description: "安装 MkBoard 桌面端，并准备本地 Agent 与视频渲染环境。",
      contentSlug: "install"
    }
  },
  {
    type: "page" as const,
    path: "start.zh.mdx",
    slugs: ["start"],
    data: {
      title: "开始使用",
      navTitle: "开始使用",
      description: "创建第一个 MkBoard 项目，把脚本整理成分镜，并继续推进到视频草稿。",
      contentSlug: "start"
    }
  }
];

const docsMetas: DocsVirtualMeta[] = [
  {
    type: "meta" as const,
    path: "meta.en.json",
    data: {
      title: "MkBoard Docs",
      root: true,
      pages: ["index", "install", "start"]
    }
  },
  {
    type: "meta" as const,
    path: "meta.zh.json",
    data: {
      title: "MkBoard 文档",
      root: true,
      pages: ["index", "install", "start"]
    }
  }
];

export const docsSource = loader(source({ pages: docsPages, metas: docsMetas }), {
  baseUrl: "/docs",
  i18n: {
    languages: ["en", "zh"],
    defaultLanguage: defaultLocale,
    hideLocale: "default-locale",
    parser: "dot",
    fallbackLanguage: "en"
  },
  url: (slugs, locale) => {
    const activeLocale = isLocale(locale) ? locale : defaultLocale;
    const path = slugs.length > 0 ? `/docs/${slugs.join("/")}` : "/docs";
    return localizePath(path, activeLocale);
  }
});

export function docsPathForContentSlug(contentSlug: DocsContentSlug, locale: Locale) {
  return localizePath(contentSlug === "intro" ? "/docs" : `/docs/${contentSlug}`, locale);
}

export function getDocsNavigation(locale: Locale): DocsNavigationItem[] {
  return collectPageNodes(docsSource.getPageTree(locale).children)
    .map((node) => {
      const page = docsSource.getNodePage(node, locale);
      if (!page) return null;

      return {
        href: page.url,
        label: page.data.navTitle,
        contentSlug: page.data.contentSlug
      };
    })
    .filter((item): item is DocsNavigationItem => item !== null);
}

function collectPageNodes(nodes: Node[]): Item[] {
  const items: Item[] = [];

  for (const node of nodes) {
    if (node.type === "page") {
      items.push(node);
      continue;
    }

    if (node.type === "folder") {
      if (node.index) items.push(node.index);
      items.push(...collectPageNodes(node.children));
    }
  }

  return items;
}
