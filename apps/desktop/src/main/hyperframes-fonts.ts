type HyperframesProjectFileLike = {
  path: string;
  content: string;
};

const hyperframesSystemSansFontStack = "system-ui, sans-serif";
const hyperframesSystemSerifFontStack = "ui-serif, serif";
const hyperframesSystemMonoFontStack = "ui-monospace, monospace";

export function normalizeHyperframesProjectFontsForLint<T extends HyperframesProjectFileLike>(files: T[]): T[] {
  return files.map((file) => {
    const projectPath = file.path.replace(/\\/gu, "/");
    if (!isHyperframesCssLikeFile(projectPath)) return file;

    const content = normalizeHyperframesCssFontUsage(file.content);
    return content === file.content ? file : { ...file, content };
  });
}

function isHyperframesCssLikeFile(projectPath: string): boolean {
  return /\.(html|css)$/iu.test(projectPath);
}

function normalizeHyperframesCssFontUsage(content: string): string {
  return content
    .replace(/@font-face\s*\{[\s\S]*?\}/giu, "")
    .replace(/(--font-[\w-]+\s*:\s*)([^;{}]+)([;}])/giu, (_match, prefix: string, value: string, ending: string) => {
      return `${prefix}${resolveHyperframesSystemFontStack(value)}${normalizeCssDeclarationEnding(ending)}`;
    })
    .replace(/font-family\s*:\s*([^;{}]+)([;}])/giu, (_match, value: string, ending: string) => {
      return `font-family: ${resolveHyperframesSystemFontStack(value)}${normalizeCssDeclarationEnding(ending)}`;
    })
    .replace(
      /["']?(?:-apple-system|BlinkMacSystemFont|Noto Sans(?: CJK)? SC|Noto Serif SC|PingFang SC|Hiragino Sans GB|Hiragino Sans|Microsoft YaHei|Arial Unicode MS|Source Han Sans SC|Source Han Serif SC|思源黑体|思源宋体)["']?/giu,
      "system-ui"
    );
}

function normalizeCssDeclarationEnding(ending: string): string {
  return ending === "}" ? ";}" : ";";
}

function resolveHyperframesSystemFontStack(value: string): string {
  const normalized = value.toLowerCase();
  if (/(mono|menlo|monaco|consolas|courier|sfmono)/u.test(normalized)) return hyperframesSystemMonoFontStack;
  const withoutSansSerif = normalized.replace(/sans-serif/gu, "");
  if (/(serif|songti|kaiti|playfair|noto serif|source han serif|georgia|times)/u.test(withoutSansSerif)) return hyperframesSystemSerifFontStack;
  return hyperframesSystemSansFontStack;
}
