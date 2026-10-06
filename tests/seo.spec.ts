import { test, expect } from "@playwright/test";

// Search + sharing metadata, sitemap, robots, icons and structured data. Runs
// against the same dev server as the other specs; every URL asserted on is a
// PRODUCTION URL (metadataBase), never localhost.
const ORIGIN = "https://www.businessflights.travel";

const PAGES = [
  "/",
  "/flights",
  "/business-class",
  "/destinations",
  "/destinations/europe/united-kingdom/london",
  "/how-it-works",
  "/about",
  "/contact",
  "/blog",
  "/blog/business-class-vs-first-class",
  "/privacy-policy",
  "/terms-of-service",
  "/cookie-policy",
];

for (const path of PAGES) {
  test(`metadata: ${path} has a deliberate title, description, canonical and matching Open Graph / Twitter tags`, async ({ page }) => {
    await page.goto(path);
    const meta = async (sel: string) => (await page.locator(sel).first().getAttribute("content")) ?? "";
    const title = await page.title();
    const description = await meta('meta[name="description"]');
    const canonical = (await page.locator('link[rel="canonical"]').getAttribute("href")) ?? "";

    expect(title.length, `title: ${title}`).toBeGreaterThan(10);
    expect(title.length, `title too long (cut off in results): ${title}`).toBeLessThanOrEqual(70);
    expect(description.length, `description: ${description}`).toBeGreaterThanOrEqual(70);
    expect(description.length, `description too long: ${description}`).toBeLessThanOrEqual(165);

    const expectedUrl = path === "/" ? ORIGIN : `${ORIGIN}${path}`;
    expect(canonical.replace(/\/$/, "")).toBe(expectedUrl);
    // Open Graph + Twitter agree with the page, not with the homepage defaults.
    expect((await meta('meta[property="og:url"]')).replace(/\/$/, "")).toBe(expectedUrl);
    expect(await meta('meta[property="og:title"]')).toContain(title.split(" | ")[0].slice(0, 25));
    expect(await meta('meta[property="og:description"]')).toBe(description);
    expect(await meta('meta[property="og:site_name"]')).toBe("Business Flights Travel");
    // https in production (metadataBase); the dev server reports its own origin for the generated share image.
    expect(await meta('meta[property="og:image"]')).toMatch(/^https?:\/\//);
    expect(await meta('meta[name="twitter:card"]')).toBe("summary_large_image");
    expect(await meta('meta[name="twitter:title"]')).toBe(await meta('meta[property="og:title"]'));
    expect(await meta('meta[name="twitter:image"]')).toMatch(/^https?:\/\//);

    // No dev/localhost origin leaks into the URLs search engines read. (The generated
    // share-image URL is excluded: the dev server reports its own origin for that one
    // file-based route; production resolves it against metadataBase — checked live.)
    expect(canonical).not.toContain("localhost");
    expect(await meta('meta[property="og:url"]')).not.toContain("localhost");
    // Exactly one H1, and every JSON-LD block parses.
    await expect(page.locator("h1")).toHaveCount(1);
    const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(ld.length).toBeGreaterThan(0);
    for (const block of ld) {
      expect(() => JSON.parse(block)).not.toThrow();
      expect(block).not.toContain("localhost");
    }
  });
}

test("blog articles are og:type article with a descriptive image alt; brand suffix is dropped only when the title would run long", async ({ page }) => {
  await page.goto("/blog/business-class-vs-first-class");
  expect(await page.locator('meta[property="og:type"]').getAttribute("content")).toBe("article");
  expect(await page.locator('meta[property="og:image:alt"]').getAttribute("content")).toBeTruthy();
  expect(await page.title()).not.toMatch(/Business Flights Travel \| Business Flights Travel/);
  expect((await page.title()).length).toBeLessThanOrEqual(65);
});

test("the Organization structured data states contact details the site itself publishes", async ({ page }) => {
  await page.goto("/about");
  const blocks = (await page.locator('script[type="application/ld+json"]').allTextContents()).map((b) => JSON.parse(b));
  const org = blocks.find((b) => b["@type"] === "TravelAgency");
  expect(org.name).toBe("Business Flights Travel");
  expect(org.telephone).toBe("+14157777788");
  expect(org.email).toBe("requests@businessflights.travel");
  expect(org.contactPoint.telephone).toBe(org.telephone);
  expect(org.address.streetAddress).toBeTruthy();
  // Nothing invented: no ratings, awards or reviews.
  expect(JSON.stringify(org)).not.toMatch(/aggregateRating|award|review/i);
});

test("sitemap.xml is valid, uses production URLs only, and lists no private routes", async ({ request }) => {
  const res = await request.get("/sitemap.xml");
  expect(res.status()).toBe(200);
  const xml = await res.text();
  expect(xml).toMatch(/^<\?xml/);
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  expect(locs.length).toBeGreaterThan(100);
  expect(new Set(locs).size).toBe(locs.length);
  for (const loc of locs) {
    expect(loc.startsWith(ORIGIN), loc).toBe(true);
    expect(loc).not.toMatch(/localhost|\/api\/|\/login|\/admin|\?/);
  }
  for (const p of ["/flights", "/about", "/contact", "/blog", "/destinations"]) expect(locs).toContain(`${ORIGIN}${p}`);
});

test("robots.txt allows crawling and points at the production sitemap", async ({ request }) => {
  const res = await request.get("/robots.txt");
  expect(res.status()).toBe(200);
  const txt = await res.text();
  expect(txt).toMatch(/User-Agent: \*/i);
  expect(txt).toMatch(/Allow: \//);
  expect(txt).not.toMatch(/Disallow: \/\s*$/m);
  expect(txt).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
});

test("favicon, app icon and manifest icons all resolve", async ({ request, page }) => {
  for (const path of ["/favicon.ico", "/icon.png", "/apple-icon.png", "/brand-mark.png"]) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(200);
    expect(res.headers()["content-type"], path).toMatch(/image\//);
  }
  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.name).toBe("Business Flights Travel");
  for (const icon of manifest.icons) expect((await request.get(icon.src)).status(), icon.src).toBe(200);
  expect(await page.locator('meta[name="theme-color"]').first().getAttribute("content")).toBe("#fbf9f5");
});
