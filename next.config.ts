import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

// Diagnostic-only — inert unless ANALYZE=true is set (`npm run analyze`),
// so it never affects a normal `next build`/production deploy.
const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === "true" });

// The Content-Security-Policy is NOT set here any more: its script policy carries a nonce that is fresh for every request, so it is built and set per request by
// src/proxy.ts (policy text: src/lib/csp.ts; rationale, the runtime kill switch and the remaining exceptions: docs/CSP_HARDENING.md).

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self), payment=(), usb=(), interest-cohort=()",
  },
  // Only takes effect when actually served over HTTPS (the header itself is
  // harmless over plain HTTP); enforced at the hosting/reverse-proxy layer,
  // this just tells browsers to remember and require it going forward.
  // Two years for THIS host only. `includeSubDomains` and `preload` are deliberately NOT sent: they bind every subdomain of the domain
  // (and, with `preload`, make the domain eligible for the browsers' built-in list, which is very hard to undo) and nothing here can confirm
  // that every subdomain is HTTPS-only or that the owner wants to be on that list. Add them only after that decision (docs/SECURITY_REVIEW_AND_REMAINING_LIMITATIONS.md).
  { key: "Strict-Transport-Security", value: "max-age=63072000" },
];

// Self-hosted (Docker) build only: `NEXT_OUTPUT=standalone` makes `next build` emit a minimal, self-contained server
// (.next/standalone) for the container image (see Dockerfile and docs/DEPLOYMENT_VPS.md). Unset everywhere else — Vercel and
// local `next build` / `next start` are unchanged. The tracing root is pinned so the output layout does not depend on where a
// stray lockfile happens to sit above the project.
const standalone = process.env.NEXT_OUTPUT === "standalone";

const nextConfig: NextConfig = {
  ...(standalone ? { output: "standalone" as const, outputFileTracingRoot: process.cwd() } : {}),
  // Do not advertise the framework in an `X-Powered-By: Next.js` response header: it tells scanners which stack (and advisories) apply.
  poweredByHeader: false,
  // Server Action request bodies (the flight request, contact and newsletter forms - the only actions here) are capped at 64 KB instead of Next's
  // 1 MB default. The largest legitimate body is a six-segment multi-city request (about 6 KB of airport data) plus a 2,000-character note and the
  // contact details - roughly 10 KB, or 25 KB if every character were non-ASCII - so 64 KB leaves a wide margin for real visitors while a client
  // can no longer make the server buffer and parse a megabyte per request. An oversized request is refused before the action runs (HTTP 413);
  // the forms show their inline "try again" message for it. tests/server-action-body-limit-e2e.spec.ts pins the boundary. If a form ever needs
  // a bigger payload (a file upload), raise this deliberately, together with that spec.
  experimental: { serverActions: { bodySizeLimit: "64kb" } },
  images: {
    // Editorial/destination imagery is sourced from Unsplash as placeholders
    // during development — swap for licensed/company-owned photography via
    // the `heroImage` fields in src/data/destinations.ts and src/data/blog-posts.ts.
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
    // Next 16 only serves qualities on this allowlist (anything else is coerced to the nearest entry; the raw endpoint answers 400). 75 is the
    // default every image uses. 55 is for the decorative hero photos that are shown dimmed (opacity 45-60% under a navy scrim, alt=""): at that
    // visibility the extra bytes of quality 75 cannot be seen, and the hero is the Largest Contentful Paint element on those pages, so on a slow
    // connection its transfer time is the page's LCP (measured in docs/SEO_TECHNICAL_VERIFICATION.md, section 14).
    qualities: [55, 75],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Permanent redirects ONLY for retired/guessed article URLs that have an unambiguous
  // topical equivalent. None of these slugs exists in this repository's history, so they
  // come from outside links; where the topic matches an article we publish, a 308 keeps
  // the visitor (and any link value) on the right page. Other unknown blog URLs are
  // deliberately NOT redirected — they return a real 404 (see dynamicParams in
  // src/app/blog/[slug]/page.tsx) rather than being sent to an unrelated page.
  async redirects() {
    return [
      // Canonical host. Behind Cloudflare Tunnel the apex arrives with its original Host header; send it to www, keeping path and
      // query string (Next passes the query through). Only the exact apex matches (escaped dot, anchored): www, localhost and the
      // internal name the tunnel health probes use are never redirected, so there is no loop and the container health check is unaffected.
      { source: "/:path*", has: [{ type: "host" as const, value: "^businessflights\\.travel$" }], destination: "https://www.businessflights.travel/:path*", permanent: true },
      { source: "/blog/airport-lounge-guide-for-executives", destination: "/blog/business-class-airport-lounge-guide", permanent: true },
      { source: "/blog/business-class-travel-tips", destination: "/blog/long-haul-business-class-travel-tips", permanent: true },
      { source: "/blog/best-airlines-for-business-class-routes", destination: "/blog/best-business-class-airlines-long-haul", permanent: true },
      // Search Console 2026-11 (see docs/SEO_INDEXING_RECOVERY_AUDIT.md). Same test as above: only where the topic is the same page we publish.
      // "Sleep better on overnight business-class flights" is the article we publish on sleeping on long-haul business class; "best airport
      // lounges around the world" is the lounge topic our lounge guide covers (the guide, not a ranking of named lounges - a judgement call
      // recorded in the audit); "/terms" is the conventional address of the page that lives at /terms-of-service.
      { source: "/blog/sleep-better-on-overnight-business-class-flights", destination: "/blog/how-to-sleep-better-on-long-haul-business-class", permanent: true },
      { source: "/blog/best-airport-lounges-around-the-world", destination: "/blog/business-class-airport-lounge-guide", permanent: true },
      { source: "/terms", destination: "/terms-of-service", permanent: true },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
