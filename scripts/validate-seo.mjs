#!/usr/bin/env node
// Programmatic indexability check across every route the sitemap should
// contain — HTTP status, canonical correctness, noindex absence, title/
// description/H1 presence, and cross-checks against the actual generated
// sitemap.xml. Run against a running server (local prod build or
// production) via `node scripts/validate-seo.mjs [baseUrl]`, default
// http://localhost:3100. This is what section 24 of the SEO/indexing pass
// asked for as a standing regression check, not a one-off script — rerun
// it whenever destinations.ts/blog-posts.ts/route metadata changes.
import { destinations, destinationPath } from "../src/data/destinations.ts";
import { blogPosts } from "../src/data/blog-posts.ts";

const BASE = process.argv[2] || "http://localhost:3100";
const SITE_URL = "https://www.businessflights.travel";

const STATIC_ROUTES = [
  "", // homepage — sitemap.ts emits `${SITE_URL}` with no trailing slash
  "/flights",
  "/business-class",
  "/destinations",
  "/how-it-works",
  "/about",
  "/blog",
  "/contact",
  "/privacy-policy",
  "/cookie-policy",
  "/terms-of-service",
];

const destinationRoutes = destinations.map((d) => destinationPath(d));
const blogRoutes = blogPosts.map((p) => `/blog/${p.slug}`);
const allRoutes = [...STATIC_ROUTES, ...destinationRoutes, ...blogRoutes];

let failed = 0;
let checked = 0;
const failures = [];

function fail(route, msg) {
  failed++;
  failures.push(`${route}: ${msg}`);
}

async function checkRoute(route) {
  checked++;
  let res;
  try {
    res = await fetch(BASE + route, { redirect: "manual" });
  } catch (e) {
    fail(route, `fetch failed: ${e.message}`);
    return;
  }

  if (res.status >= 300 && res.status < 400) {
    fail(route, `unexpected redirect (${res.status}) — every sitemap route should resolve directly, not redirect`);
    return;
  }
  if (res.status !== 200) {
    fail(route, `HTTP ${res.status}, expected 200`);
    return;
  }

  const html = await res.text();

  const canonicalMatch = html.match(/<link rel="canonical" href="([^"]+)"/);
  const expectedCanonical = SITE_URL + (route === "" ? "/" : route);
  if (!canonicalMatch) {
    fail(route, "no <link rel=\"canonical\"> found");
  } else if (canonicalMatch[1] !== expectedCanonical && canonicalMatch[1] !== expectedCanonical.replace(/\/$/, "")) {
    fail(route, `canonical is "${canonicalMatch[1]}", expected "${expectedCanonical}"`);
  }

  if (/<meta name="robots" content="[^"]*noindex/.test(html)) {
    fail(route, "unexpected noindex robots meta tag");
  }

  const titleMatch = html.match(/<title>([^<]*)<\/title>/);
  if (!titleMatch || !titleMatch[1].trim()) {
    fail(route, "missing or empty <title>");
  }

  const descMatch = html.match(/<meta name="description" content="([^"]*)"/);
  if (!descMatch || !descMatch[1].trim()) {
    fail(route, "missing or empty meta description");
  }

  const h1Matches = [...html.matchAll(/<h1[^>]*>/g)];
  if (h1Matches.length === 0) {
    fail(route, "no <h1> found");
  } else if (h1Matches.length > 1) {
    fail(route, `${h1Matches.length} <h1> elements found, expected exactly 1`);
  }
}

// Cross-check against the actual generated sitemap.
async function checkSitemap() {
  const res = await fetch(BASE + "/sitemap.xml");
  if (res.status !== 200) {
    fail("/sitemap.xml", `HTTP ${res.status}`);
    return new Set();
  }
  const xml = await res.text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const uniqueUrls = new Set(urls);
  if (urls.length !== uniqueUrls.size) fail("/sitemap.xml", `${urls.length - uniqueUrls.size} duplicate URL(s)`);

  const nonCanonicalHost = urls.filter((u) => !u.startsWith(SITE_URL));
  if (nonCanonicalHost.length) fail("/sitemap.xml", `${nonCanonicalHost.length} URL(s) not using the canonical host: ${nonCanonicalHost.slice(0, 3).join(", ")}`);

  const expectedUrls = new Set(allRoutes.map((r) => SITE_URL + r));
  const missing = [...expectedUrls].filter((u) => !uniqueUrls.has(u));
  if (missing.length) fail("/sitemap.xml", `${missing.length} expected route(s) missing from sitemap: ${missing.slice(0, 5).join(", ")}`);

  console.log(`Sitemap: ${urls.length} URLs (${uniqueUrls.size} unique), all on canonical host: ${nonCanonicalHost.length === 0}`);
  return uniqueUrls;
}

async function checkRobots() {
  const res = await fetch(BASE + "/robots.txt");
  const text = await res.text();
  if (res.status !== 200) fail("/robots.txt", `HTTP ${res.status}`);
  if (!/Sitemap:\s*https:\/\/www\.businessflights\.travel\/sitemap\.xml/.test(text)) {
    fail("/robots.txt", "sitemap directive missing or wrong host");
  }
  if (/Disallow:\s*\/(destinations|blog|about|contact|flights)\b/i.test(text)) {
    fail("/robots.txt", "an important section appears to be disallowed");
  }
  console.log("robots.txt checked.");
}

console.log(`Checking ${allRoutes.length} routes against ${BASE} ...`);
console.log(`(${STATIC_ROUTES.length} static, ${destinationRoutes.length} destinations, ${blogRoutes.length} blog articles)\n`);

await checkRobots();
await checkSitemap();

// Bounded concurrency — fetch 10 at a time so this stays fast without
// hammering the server.
const CONCURRENCY = 10;
for (let i = 0; i < allRoutes.length; i += CONCURRENCY) {
  await Promise.all(allRoutes.slice(i, i + CONCURRENCY).map(checkRoute));
}

console.log(`\nChecked ${checked} routes, ${failed} failure(s).`);
if (failures.length) {
  console.log("\n--- Failures ---");
  failures.forEach((f) => console.log("FAIL:", f));
  process.exit(1);
} else {
  console.log("validate-seo: all checks passed");
}
