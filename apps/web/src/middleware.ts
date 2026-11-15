import { defineMiddleware } from "astro:middleware";

export const onRequest = defineMiddleware((context, next) => {
  const pathname = context.url.pathname;

  if (context.request.headers.get("x-mkboard-locale")) {
    return next();
  }

  if (pathname === "/version-history") {
    return context.redirect(`/changelog${context.url.search}`, 301);
  }

  if (pathname === "/zh/version-history") {
    return context.redirect(`/zh/changelog${context.url.search}`, 301);
  }

  if (pathname === "/en/version-history") {
    return context.redirect(`/changelog${context.url.search}`, 301);
  }

  if (pathname === "/en" || pathname.startsWith("/en/")) {
    const targetPath = pathname === "/en" ? "/" : pathname.slice(3) || "/";
    return context.redirect(`${targetPath}${context.url.search}`, 301);
  }

  if (pathname === "/zh" || pathname.startsWith("/zh/")) {
    const targetPath = pathname === "/zh" ? "/" : pathname.slice(3) || "/";
    const targetUrl = new URL(targetPath + context.url.search, context.url.origin);
    const headers = new Headers(context.request.headers);
    headers.set("x-mkboard-locale", "zh");
    headers.set("x-mkboard-original-path", pathname);

    return context.rewrite(new Request(targetUrl, { headers }));
  }

  return next();
});
