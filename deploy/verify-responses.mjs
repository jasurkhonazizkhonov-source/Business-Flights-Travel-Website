// Run INSIDE the website container by deploy/verify.sh (node -e): checks the app's own responses on loopback.
const base = "http://127.0.0.1:" + (process.env.PORT || "3000");
const checks = [
  ["/api/health", 200, (t, h) => JSON.parse(t).status === "ok" && /no-store/.test(h.get("cache-control") || "")],
  ["/", 200, (t) => /<h1/.test(t) && !t.includes("Loading…")],
  ["/robots.txt", 200, (t) => t.includes("Sitemap: https://www.businessflights.travel/sitemap.xml")],
  ["/sitemap.xml", 200, (t) => (t.match(/<loc>/g) || []).length > 100],
  ["/blog/zzz-not-a-real-article", 404, () => true],
  ["/destinations/europe/france/zzz-not-a-city", 404, () => true],
  ["/flights?to=GRU", 200, (t) => t.includes('rel="canonical" href="https://www.businessflights.travel/flights"')],
];
let bad = 0;
for (const [path, status, test] of checks) {
  try {
    const r = await fetch(base + path, { redirect: "manual" });
    const t = await r.text();
    const pass = r.status === status && test(t, r.headers);
    console.log((pass ? "  ok:   " : "  FAIL: ") + r.status + " " + path);
    if (!pass) bad++;
  } catch (e) {
    console.log("  FAIL: " + path + " " + e.message);
    bad++;
  }
}
process.exit(bad ? 1 : 0);
