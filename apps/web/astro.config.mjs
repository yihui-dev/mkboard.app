import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import { defineConfig } from "astro/config";

const MKBOARD_R2_IMAGE_HOSTS = new Set(["assets.mkboard.app", "assets.dev.mkboard.app", "static.mkboard.app"]);
const MKBOARD_R2_IMAGE_QUALITY = "80";

function rehypeExternalLinks() {
  return (tree) => {
    visitElements(tree, (node) => {
      if (node.tagName !== "a") return;

      const href = node.properties?.href;
      if (typeof href !== "string" || !/^https?:\/\//i.test(href)) return;

      node.properties.target = "_blank";
      node.properties.rel = mergeRel(node.properties.rel, ["noopener", "noreferrer"]);
    });
  };
}

function rehypeMkboardR2Images() {
  return (tree) => {
    visitElements(tree, (node) => {
      if (node.tagName !== "img") return;

      const src = node.properties?.src;
      if (typeof src !== "string") return;

      node.properties.src = withMkboardR2ImageQuality(src);
    });
  };
}

function remarkMkboardR2HtmlImages() {
  return (tree) => {
    visitNodes(tree, (node) => {
      if (node.type !== "html" || typeof node.value !== "string") return;

      node.value = node.value.replace(/\bsrc=(["'])([^"']+)\1/giu, (match, quote, src) => {
        const decodedSrc = unescapeHtmlAttribute(src);
        const nextSrc = withMkboardR2ImageQuality(decodedSrc);
        if (nextSrc === decodedSrc) return match;

        return `src=${quote}${escapeHtmlAttribute(nextSrc)}${quote}`;
      });
    });
  };
}

function visitElements(node, callback) {
  if (!node || typeof node !== "object") return;

  if (node.type === "element") {
    callback(node);
  }

  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      visitElements(child, callback);
    }
  }
}

function visitNodes(node, callback) {
  if (!node || typeof node !== "object") return;

  callback(node);

  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      visitNodes(child, callback);
    }
  }
}

function mergeRel(currentRel, additions) {
  const relValues = Array.isArray(currentRel)
    ? currentRel
    : typeof currentRel === "string"
      ? currentRel.split(/\s+/)
      : [];

  return Array.from(new Set([...relValues.filter(Boolean), ...additions])).join(" ");
}

function withMkboardR2ImageQuality(imageUrl) {
  try {
    const url = new URL(imageUrl);
    if (!MKBOARD_R2_IMAGE_HOSTS.has(url.hostname)) return imageUrl;

    url.searchParams.set("quality", MKBOARD_R2_IMAGE_QUALITY);
    return url.toString();
  } catch {
    return imageUrl;
  }
}

function escapeHtmlAttribute(value) {
  return value.replace(/&/gu, "&amp;").replace(/"/gu, "&quot;").replace(/'/gu, "&#39;");
}

function unescapeHtmlAttribute(value) {
  return value.replace(/&amp;/giu, "&");
}

export default defineConfig({
  output: "server",
  adapter: cloudflare(),
  integrations: [react()],
  markdown: {
    remarkPlugins: [remarkMkboardR2HtmlImages],
    rehypePlugins: [rehypeExternalLinks, rehypeMkboardR2Images]
  }
});
