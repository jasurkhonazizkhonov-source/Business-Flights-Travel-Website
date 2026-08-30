import type { NextConfig } from "next";

// A CSP strict enough to matter, without breaking Next.js's own hydration
// script or the JSON-LD <script> tags rendered inline throughout the app
// (layout.tsx, destination/blog/FAQ structured data). Nonce-based script-src
// (no 'unsafe-inline') is the stricter option, but requires threading a
// per-request nonce through every one of those inline scripts via
// middleware — a real future hardening step, not something to bolt on
// without the testing that deserves. next/font self-hosts font files at
// build time (no fonts.gstatic.com at runtime), and next/image proxies
// remote images through same-origin /_next/image, so neither needs a CSP
// allowance here despite Unsplash being configured below.
// Dev-only relaxations — never applied to a production build. Turbopack's
// hot-reload client opens a same-origin WebSocket that browsers treat as a
// separate scheme from connect-src 'self', and React's dev-mode tooling
// uses eval() for component stack traces (never in production — see
// https://react.dev, this is stripped from the production build).
const isDev = process.env.NODE_ENV !== "production";

// No analytics loads anywhere in this app right now (see docs/ENVIRONMENT.md)
// — no third-party script hosts need allowing here. If that changes, widen
// this alongside whatever loads the script, not speculatively ahead of it.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws://localhost:* http://localhost:*" : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  // Only takes effect when actually served over HTTPS (the header itself is
  // harmless over plain HTTP); enforced at the hosting/reverse-proxy layer,
  // this just tells browsers to remember and require it going forward.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  images: {
    // Editorial/destination imagery is sourced from Unsplash as placeholders
    // during development — swap for licensed/company-owned photography via
    // the `heroImage` fields in src/data/destinations.ts and src/data/blog-posts.ts.
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
