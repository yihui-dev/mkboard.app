import type { APIRoute } from "astro";

export const GET: APIRoute = ({ site, url }) => {
  const origin = import.meta.env.PUBLIC_WEB_URL ?? site?.toString() ?? url.origin;
  return new Response(
    ["User-agent: *", "Allow: /", "", `Sitemap: ${new URL("/sitemap.xml", origin).toString()}`].join("\n"),
    {
      headers: {
        "Content-Type": "text/plain; charset=utf-8"
      }
    }
  );
};
