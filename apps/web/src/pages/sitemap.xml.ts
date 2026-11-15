import type { APIRoute } from "astro";

const publicRoutes = [
  { path: "/", priority: "1.0", changefreq: "weekly" },
  { path: "/zh", priority: "1.0", changefreq: "weekly" },
  { path: "/download", priority: "0.9", changefreq: "weekly" },
  { path: "/zh/download", priority: "0.9", changefreq: "weekly" },
  { path: "/changelog", priority: "0.6", changefreq: "weekly" },
  { path: "/zh/changelog", priority: "0.6", changefreq: "weekly" },
  { path: "/docs", priority: "0.7", changefreq: "monthly" },
  { path: "/zh/docs", priority: "0.7", changefreq: "monthly" },
  { path: "/docs/install", priority: "0.7", changefreq: "monthly" },
  { path: "/zh/docs/install", priority: "0.7", changefreq: "monthly" },
  { path: "/docs/start", priority: "0.7", changefreq: "monthly" },
  { path: "/zh/docs/start", priority: "0.7", changefreq: "monthly" },
  { path: "/privacy-policy", priority: "0.3", changefreq: "yearly" },
  { path: "/zh/privacy-policy", priority: "0.3", changefreq: "yearly" },
  { path: "/terms-of-service", priority: "0.3", changefreq: "yearly" },
  { path: "/zh/terms-of-service", priority: "0.3", changefreq: "yearly" }
];

export const GET: APIRoute = ({ site }) => {
  const origin = import.meta.env.PUBLIC_WEB_URL ?? site?.toString() ?? "https://mkboard.app";
  const updatedAt = new Date().toISOString();
  const items = publicRoutes
    .map((route) => {
      const loc = new URL(route.path, origin).toString();
      return [
        "  <url>",
        `    <loc>${loc}</loc>`,
        `    <lastmod>${updatedAt}</lastmod>`,
        `    <changefreq>${route.changefreq}</changefreq>`,
        `    <priority>${route.priority}</priority>`,
        "  </url>"
      ].join("\n");
    })
    .join("\n");

  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</urlset>`, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8"
    }
  });
};
