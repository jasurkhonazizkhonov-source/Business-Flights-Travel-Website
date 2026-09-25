#!/usr/bin/env node
// Deep SEO/crawlability inventory across the WHOLE route set (not just the
// examples Search Console lists). Complements validate-seo.mjs (pass/fail
// gate) with the analysis that gate can't do: internal-link graph (incoming
// link counts + crawl depth from the homepage), duplicate title/description/H1
// detection, near-duplicate content measurement, thin-content signals, image
// alt coverage, structured-data validity and social metadata — plus, when
// given a Search Console URL list, a per-URL reconciliation against the
// actual route set.
//
//   node scripts/audit-seo-inventory.mjs [baseUrl] [--gsc path/to/gsc.json] [--out dir]
//
// Read-only (GET requests only). Default base is production.
import fs from "node:fs";
import path from "node:path";
import { destinations, destinationPath } from "../src/data/destinations.ts";
import { blogPosts } from "../src/data/blog-posts.ts";

const args = process.argv.slice(2);
const BASE = args.find((a) => a.startsWith("http")) || "https://www.businessflights.travel";
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const GSC = flag("--gsc");
const OUT = flag("--out") || ".";
const HOST = new URL(BASE).host;

const STATIC = ["", "/flights", "/business-class", "/destinations", "/how-it-works", "/about", "/blog", "/contact", "/privacy-policy", "/cookie-policy", "/terms-of-service"];
const routes = [
  ...STATIC.map((p) => ({ path: p || "/", kind: "static" })),
  ...destinations.map((d) => ({ path: destinationPath(d), kind: "destination", meta: d })),
  ...blogPosts.map((p) => ({ path: `/blog/${p.slug}`, kind: "blog", meta: p })),
];

const decode = (s) => s.replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const stripTags = (s) => decode(s.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

async function fetchPage(p) {
  const res = await fetch(BASE + (p === "/" ? "" : p), { redirect: "manual" });
  const html = res.status === 200 ? await res.text() : "";
  return { status: res.status, html, location: res.headers.get("location"), xrobots: res.headers.get("x-robots-tag") };
}

function analyze(route, page) {
  const html = page.html;
  const get = (re) => (html.match(re) || [])[1];
  const title = decode(get(/<title>([^<]*)<\/title>/) || "");
  const description = decode(get(/<meta name="description" content="([^"]*)"/) || "");
  const canonical = get(/<link rel="canonical" href="([^"]+)"/);
  const robotsMeta = get(/<meta name="robots" content="([^"]*)"/);
  const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => stripTags(m[1]));
  const og = { title: get(/<meta property="og:title" content="([^"]*)"/), description: get(/<meta property="og:description" content="([^"]*)"/), image: get(/<meta property="og:image" content="([^"]*)"/), url: get(/<meta property="og:url" content="([^"]*)"/) };
  const twitter = { card: get(/<meta name="twitter:card" content="([^"]*)"/), image: get(/<meta name="twitter:image" content="([^"]*)"/) };
  const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => {
    try {
      const j = JSON.parse(m[1]);
      return { ok: true, type: j["@type"], j };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
  const main = (html.match(/<main[\s\S]*?<\/main>/) || [html])[0];
  const text = stripTags(main);
  const words = text.split(" ").filter(Boolean);
  const links = new Set();
  for (const m of html.matchAll(/<a [^>]*href="([^"#]+)[^"]*"/g)) {
    let h = decode(m[1]);
    if (h.startsWith("http")) {
      try {
        const u = new URL(h);
        if (u.host !== HOST) continue;
        h = u.pathname + u.search;
      } catch {
        continue;
      }
    }
    if (!h.startsWith("/") || h.startsWith("//")) continue;
    links.add(h.split("?")[0].replace(/\/$/, "") || "/");
  }
  const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
  const imgsNoAlt = imgs.filter((t) => !/\balt="[^"]+"/.test(t)).length;
  return { title, description, canonical, robotsMeta, h1s, og, twitter, ld, text, wordCount: words.length, links: [...links], imgCount: imgs.length, imgsNoAlt };
}

const results = new Map();
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const it = items[i++]; await fn(it); } }));
}

console.log(`Auditing ${routes.length} routes on ${BASE} ...`);
await pool(routes, 8, async (r) => {
  const page = await fetchPage(r.path);
  results.set(r.path, { route: r, page, a: page.status === 200 ? analyze(r, page) : null });
});

// ---- link graph --------------------------------------------------------
const routeSet = new Set(routes.map((r) => (r.path === "/" ? "/" : r.path)));
const incoming = new Map([...routeSet].map((p) => [p, new Set()]));
const brokenInternal = [];
for (const [p, { a }] of results) {
  if (!a) continue;
  for (const l of a.links) {
    if (l === p) continue;
    if (incoming.has(l)) incoming.get(l).add(p);
    else if (!/^\/(_next|icon|apple-icon|opengraph-image|twitter-image|manifest|sitemap|robots|brand)/.test(l) && !/\.(png|jpg|svg|webp|ico|xml|txt)$/.test(l)) brokenInternal.push({ from: p, to: l });
  }
}
// BFS depth from homepage
const depth = new Map([["/", 0]]);
const q = ["/"];
while (q.length) {
  const cur = q.shift();
  const a = results.get(cur)?.a;
  if (!a) continue;
  for (const l of a.links) if (routeSet.has(l) && !depth.has(l)) { depth.set(l, depth.get(cur) + 1); q.push(l); }
}

// ---- duplicates ---------------------------------------------------------
const dupes = (key) => {
  const m = new Map();
  for (const [p, { a }] of results) if (a && a[key]) (m.get(key === "h1s" ? a.h1s.join("|") : a[key]) || m.set(key === "h1s" ? a.h1s.join("|") : a[key], []).get(key === "h1s" ? a.h1s.join("|") : a[key])).push(p);
  return [...m.entries()].filter(([, v]) => v.length > 1);
};

// ---- near-duplicate content (5-word shingles, Jaccard) ------------------
const shingles = (text) => {
  const w = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  const s = new Set();
  for (let i = 0; i + 5 <= w.length; i++) s.add(w.slice(i, i + 5).join(" "));
  return s;
};
const groupSim = (kind) => {
  const items = [...results].filter(([, v]) => v.route.kind === kind && v.a).map(([p, v]) => ({ p, s: shingles(v.a.text) }));
  const freq = new Map();
  for (const it of items) for (const sh of it.s) freq.set(sh, (freq.get(sh) || 0) + 1);
  const pairs = [];
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) {
      let inter = 0;
      const [small, big] = items[i].s.size < items[j].s.size ? [items[i].s, items[j].s] : [items[j].s, items[i].s];
      for (const x of small) if (big.has(x)) inter++;
      const jac = inter / (items[i].s.size + items[j].s.size - inter || 1);
      pairs.push({ a: items[i].p, b: items[j].p, jac });
    }
  pairs.sort((x, y) => y.jac - x.jac);
  // per page: share of its shingles that appear on NO other page of this kind
  const unique = items.map((it) => ({ p: it.p, uniqueShare: [...it.s].filter((x) => freq.get(x) === 1).length / (it.s.size || 1) }));
  unique.sort((x, y) => x.uniqueShare - y.uniqueShare);
  return { pairs: pairs.slice(0, 10), maxJac: pairs[0]?.jac ?? 0, medianJac: pairs[Math.floor(pairs.length / 2)]?.jac ?? 0, unique };
};
const destSim = groupSim("destination");
const blogSim = groupSim("blog");

// ---- per-route problems -------------------------------------------------
const problems = [];
for (const [p, { route, page, a }] of results) {
  const add = (m) => problems.push({ path: p, problem: m });
  if (page.status !== 200) { add(`HTTP ${page.status}`); continue; }
  const expected = "https://www.businessflights.travel" + (p === "/" ? "" : p);
  if (!a.canonical || a.canonical.replace(/\/$/, "") !== expected) add(`canonical "${a.canonical}" != "${expected}"`);
  if (a.robotsMeta && /noindex/.test(a.robotsMeta)) add("noindex meta");
  if (page.xrobots) add(`X-Robots-Tag: ${page.xrobots}`);
  if (!a.title) add("no title");
  if (!a.description) add("no description");
  if (a.h1s.length !== 1) add(`${a.h1s.length} H1s`);
  if (!a.og.title || !a.og.image) add("incomplete Open Graph");
  if (a.twitter.card === undefined) add("no twitter:card");
  if (a.ld.some((x) => !x.ok)) add("invalid JSON-LD");
  if (a.imgsNoAlt > 0) add(`${a.imgsNoAlt} <img> without alt`);
  if (/lorem ipsum|TODO|placeholder text|\bTBD\b/i.test(a.text)) add("placeholder-looking text");
  if (route.kind === "destination") {
    const d = route.meta;
    if (!a.h1s[0]?.includes(d.city)) add(`H1 "${a.h1s[0]}" does not mention city "${d.city}"`);
    if (!a.text.includes(d.iata)) add(`IATA ${d.iata} not present in page text`);
  }
}

// ---- GSC reconciliation ---------------------------------------------------
let gscReport = null;
if (GSC) {
  const g = JSON.parse(fs.readFileSync(GSC, "utf8"));
  gscReport = { discovered: [], missingFromRoutes: [] };
  for (const u of g.discovered) {
    const r = results.get(u);
    if (!r) { gscReport.missingFromRoutes.push(u); continue; }
    gscReport.discovered.push({ url: u, status: r.page.status, inSitemapAndRoutes: true, incoming: incoming.get(u)?.size ?? 0, depth: depth.get(u) ?? null, words: r.a?.wordCount ?? 0, problems: problems.filter((x) => x.path === u).map((x) => x.problem) });
  }
}

// ---- output ---------------------------------------------------------------
const perRoute = [...results].map(([p, { route, page, a }]) => ({
  path: p, kind: route.kind, status: page.status, title: a?.title, canonical: a?.canonical, h1: a?.h1s?.[0], words: a?.wordCount,
  incoming: incoming.get(p)?.size ?? 0, depth: depth.get(p) ?? null, imgs: a?.imgCount, imgsNoAlt: a?.imgsNoAlt,
}));
const dests = perRoute.filter((r) => r.kind === "destination");
const stat = (arr, f) => { const v = arr.map(f).filter((x) => x != null).sort((a, b) => a - b); return { min: v[0], median: v[Math.floor(v.length / 2)], max: v[v.length - 1] }; };
const summary = {
  base: BASE,
  routes: routes.length, byKind: { static: STATIC.length, destination: destinations.length, blog: blogPosts.length },
  non200: perRoute.filter((r) => r.status !== 200).length,
  problems: problems.length,
  duplicateTitles: dupes("title").length, duplicateDescriptions: dupes("description").length, duplicateH1s: dupes("h1s").length,
  brokenInternalLinks: brokenInternal.length,
  destinationIncomingLinks: stat(dests, (r) => r.incoming),
  destinationDepthFromHome: stat(dests, (r) => r.depth),
  maxDepthAnyRoute: Math.max(...perRoute.map((r) => r.depth ?? 0)),
  unreachableFromHome: perRoute.filter((r) => r.depth == null).map((r) => r.path),
  destinationWordCount: stat(dests, (r) => r.words),
  blogWordCount: stat(perRoute.filter((r) => r.kind === "blog"), (r) => r.words),
  destinationNearDuplicate: { maxJaccard: +destSim.maxJac.toFixed(3), medianPairJaccard: +destSim.medianJac.toFixed(3), topPairs: destSim.pairs.slice(0, 5).map((x) => ({ ...x, jac: +x.jac.toFixed(3) })), lowestUniqueShare: destSim.unique.slice(0, 5).map((x) => ({ ...x, uniqueShare: +x.uniqueShare.toFixed(3) })) },
  blogNearDuplicate: { maxJaccard: +blogSim.maxJac.toFixed(3), medianPairJaccard: +blogSim.medianJac.toFixed(3), topPairs: blogSim.pairs.slice(0, 3).map((x) => ({ ...x, jac: +x.jac.toFixed(3) })) },
  imagesWithoutAlt: perRoute.reduce((n, r) => n + (r.imgsNoAlt || 0), 0),
  weakestDestinationsByIncomingLinks: [...dests].sort((a, b) => a.incoming - b.incoming).slice(0, 8).map((r) => ({ path: r.path, incoming: r.incoming, depth: r.depth })),
  gscDiscoveredChecked: gscReport?.discovered.length, gscDiscoveredNotInRoutes: gscReport?.missingFromRoutes,
  gscDiscoveredWithProblems: gscReport?.discovered.filter((d) => d.problems.length || d.status !== 200).length,
};
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "seo-audit-routes.json"), JSON.stringify({ summary, problems, brokenInternal, duplicates: { titles: dupes("title"), descriptions: dupes("description"), h1s: dupes("h1s") }, perRoute, gsc: gscReport }, null, 1));
console.log(JSON.stringify(summary, null, 1));
if (problems.length) console.log("\nPROBLEMS (first 40):\n" + problems.slice(0, 40).map((x) => `  ${x.path}: ${x.problem}`).join("\n"));
if (brokenInternal.length) console.log("\nBROKEN INTERNAL LINKS (first 20):\n" + brokenInternal.slice(0, 20).map((x) => `  ${x.from} -> ${x.to}`).join("\n"));
