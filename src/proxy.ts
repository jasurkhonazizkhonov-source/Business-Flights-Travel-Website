import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy, cspScriptMode } from "@/lib/csp";

// Next.js 16 "proxy" (the former middleware): mints a fresh nonce for every request and sets the Content-Security-Policy that carries it, on BOTH the request
// (Next reads the nonce from the request's CSP header and stamps it on its own inline framework scripts while it renders) and the response (the browser enforces
// it). A page that is rendered per request is what makes a nonce possible: that is why the root layout is `force-dynamic`. See docs/CSP_HARDENING.md.
export function proxy(request: NextRequest) {
  // A page that is rendered per request would answer PUT, DELETE, PATCH, TRACE and OPTIONS with the page (a prerendered page answered 405). Documents take GET and HEAD to be read and
  // POST because that is how a server action reaches the page it belongs to; nothing else is meaningful. API routes answer their own methods and are left to Next.
  if (!request.nextUrl.pathname.startsWith("/api/") && !["GET", "HEAD", "POST"].includes(request.method)) {
    return new NextResponse(null, { status: 405, headers: { Allow: "GET, HEAD, POST", "Cache-Control": "no-store" } });
  }
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = contentSecurityPolicy({ nonce, mode: cspScriptMode(), dev: process.env.NODE_ENV !== "production" });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  // A page carries a nonce that is valid for that one response, so no shared cache may keep it: "private" forbids Cloudflare and any proxy, and "no-cache" makes a browser
  // revalidate (the page has no validator, so it is fetched again) instead of reusing it. Next adds "no-store" to a dynamic page by itself, and Chrome never puts a
  // "no-store" page in the back/forward cache, so every Back or Forward would reload the page. "private, no-cache" gives the same protection and keeps Back/Forward instant
  // (the restored page is the same document with its own nonce). API routes set their own policy and are left alone.
  if (!request.nextUrl.pathname.startsWith("/api/")) response.headers.set("Cache-Control", "private, no-cache, max-age=0, must-revalidate");
  return response;
}

// Not for the build's own static files (they are not documents and are served with long-lived caching): everything else, including the API routes and the 404 page.
export const config = {
  matcher: [{ source: "/((?!_next/static|_next/image|favicon.ico).*)", missing: [{ type: "header", key: "next-router-prefetch" }, { type: "header", key: "purpose", value: "prefetch" }] }],
};
