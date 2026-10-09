import { test, expect } from "@playwright/test";
import { blogPosts } from "../src/data/blog-posts";
import { destinations, destinationPath } from "../src/data/destinations";

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
  // Every referenced icon exists AND is really the size the manifest declares (PNG IHDR width/height).
  const declared = new Set<string>();
  for (const icon of manifest.icons) {
    const res = await request.get(icon.src);
    expect(res.status(), icon.src).toBe(200);
    const body = await res.body();
    expect(body.subarray(1, 4).toString("ascii"), `${icon.src} is a PNG`).toBe("PNG");
    expect(`${body.readUInt32BE(16)}x${body.readUInt32BE(20)}`, `${icon.src} real size`).toBe(icon.sizes);
    declared.add(icon.sizes);
  }
  // The pair Chrome/Android need for an installable site.
  expect(declared.has("192x192") && declared.has("512x512")).toBe(true);
  expect(await page.locator('meta[name="theme-color"]').first().getAttribute("content")).toBe("#fbf9f5");
});

// ---------------------------------------------------------------------------
// Indexing policy — the Search Console findings of 2026-10, expressed as policy:
//  * a URL that does not exist is a real HTTP 404, never a streamed 200 "not found" page
//    (which carried noindex + the homepage canonical and was reported as "noindex");
//  * only a few retired article URLs with an unambiguous topical match are redirected (308);
//  * every published article/destination is indexable, self-canonical and in the sitemap;
//  * parameterised flight URLs canonicalise to /flights and are not in the sitemap;
//  * the generated share images are served as images and are not sitemap pages.
// Status-code assertions are only meaningful on a production build:
//   npm run build && npx next start -p 3200  ->  TEST_BASE_URL=http://localhost:3200
// ---------------------------------------------------------------------------
const noRedirect = { maxRedirects: 0 } as const;
const robotsMeta = (html: string) => (html.match(/<meta name="robots" content="([^"]*)"/i) || [])[1] ?? "";
const canonicalOf = (html: string) => (html.match(/<link rel="canonical" href="([^"]+)"/i) || [])[1] ?? "";

test.describe("indexing policy", () => {
  test("blog URLs that never existed here return a real 404, not a streamed 200 noindex page", async ({ request }) => {
    for (const slug of [
      "emirates-business-class-guide",
      "business-travel-trends-2026",
      "united-polaris-vs-american-flagship-business",
      "qatar-airways-qsuite-business-class-experience",
      "top-european-business-destinations",
      "some-other-slug-that-does-not-exist",
    ]) {
      const res = await request.get(`/blog/${slug}`, noRedirect);
      expect(res.status(), slug).toBe(404);
    }
    // Same for an unknown city under a real region/country.
    expect((await request.get("/destinations/europe/france/not-a-real-city", noRedirect)).status()).toBe(404);
  });

  test("retired article URLs with a clear topical match are permanent redirects to a live, indexable article", async ({ request }) => {
    const map: Record<string, string> = {
      "airport-lounge-guide-for-executives": "business-class-airport-lounge-guide",
      "business-class-travel-tips": "long-haul-business-class-travel-tips",
      "best-airlines-for-business-class-routes": "best-business-class-airlines-long-haul",
    };
    for (const [from, to] of Object.entries(map)) {
      const res = await request.get(`/blog/${from}`, noRedirect);
      expect(res.status(), from).toBe(308);
      expect(new URL(res.headers()["location"], ORIGIN).pathname, from).toBe(`/blog/${to}`);
      expect(blogPosts.some((p) => p.slug === to), `redirect target ${to} is a published article`).toBe(true);
      const target = await request.get(`/blog/${to}`, noRedirect);
      expect(target.status(), to).toBe(200);
    }
  });

  test("every published article is 200, indexable (no noindex meta or X-Robots-Tag) and self-canonical", async ({ request }) => {
    for (const post of blogPosts) {
      const res = await request.get(`/blog/${post.slug}`, noRedirect);
      expect(res.status(), post.slug).toBe(200);
      expect(res.headers()["x-robots-tag"] ?? "", post.slug).not.toMatch(/noindex/i);
      const html = await res.text();
      expect(robotsMeta(html), post.slug).not.toMatch(/noindex/i);
      expect(canonicalOf(html), post.slug).toBe(`${ORIGIN}/blog/${post.slug}`);
    }
  });

  test("Batumi: indexable, self-canonical, in the sitemap, and carries specific content with FAQ structured data", async ({ request, page }) => {
    const path = "/destinations/middle-east/georgia/batumi";
    expect(destinations.some((d) => destinationPath(d) === path)).toBe(true);
    const res = await request.get(path, noRedirect);
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(robotsMeta(html)).not.toMatch(/noindex/i);
    expect(canonicalOf(html)).toBe(`${ORIGIN}${path}`);
    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).toContain(`<loc>${ORIGIN}${path}</loc>`);
    await page.goto(path);
    const main = (await page.locator("main").innerText()).replace(/\s+/g, " ");
    expect(main.length).toBeGreaterThan(2500);
    expect(main).toMatch(/Black Sea/);
    expect(main).toMatch(/no nonstop service from the United States/i);
    // Nothing unverified: this page must not claim Qatar Airways serves Batumi.
    expect(main).not.toMatch(/Qatar Airways/);
    const blocks = (await page.locator('script[type="application/ld+json"]').allTextContents()).map((b) => JSON.parse(b));
    const faq = blocks.find((b) => b["@type"] === "FAQPage");
    expect(faq.mainEntity.length).toBeGreaterThanOrEqual(3);
  });

  test("/flights?to=XXX is a working preselected form whose canonical is the clean /flights (no conflicting tags, never in the sitemap)", async ({ request, page }) => {
    for (const code of ["GRU", "MEL"]) {
      const res = await request.get(`/flights?to=${code}`, noRedirect);
      expect(res.status(), code).toBe(200);
      const html = await res.text();
      expect(html.match(/<link rel="canonical"/g)?.length, `one canonical for ${code}`).toBe(1);
      expect(canonicalOf(html)).toBe(`${ORIGIN}/flights`);
      expect(robotsMeta(html)).not.toMatch(/noindex/i);
    }
    // The canonical target itself is a normal 200 page that is in the sitemap.
    expect((await request.get("/flights", noRedirect)).status()).toBe(200);
    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).toContain(`<loc>${ORIGIN}/flights</loc>`);
    expect(sitemap).not.toMatch(/\/flights\?/);
    // The query still drives the existing interface: the destination field is pre-filled.
    await page.goto("/flights?to=GRU");
    await expect(page.locator('input[role="combobox"]').nth(1)).toHaveValue(/GRU/, { timeout: 15000 });
  });

  test("generated share images are served as images and are not sitemap pages", async ({ request, page }) => {
    for (const path of ["/opengraph-image", "/twitter-image"]) {
      const res = await request.get(path, noRedirect);
      expect(res.status(), path).toBe(200);
      expect(res.headers()["content-type"], path).toMatch(/^image\/png/);
    }
    // The hashed form Next appends for cache-busting (…?<hash>) serves the same image.
    await page.goto("/");
    const og = await page.locator('meta[property="og:image"]').getAttribute("content");
    const hashed = new URL(og!, ORIGIN);
    const res = await request.get(hashed.pathname + hashed.search, noRedirect);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/^image\/png/);
    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).not.toMatch(/opengraph-image|twitter-image|icon\.png|manifest/);
  });

  test("the sitemap lists exactly the published pages: static routes + every destination + every article, no parameters, no redirects", async ({ request }) => {
    const xml = await (await request.get("/sitemap.xml")).text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    const expected = new Set<string>([
      ORIGIN,
      ...["/flights", "/business-class", "/destinations", "/how-it-works", "/about", "/blog", "/contact", "/privacy-policy", "/cookie-policy", "/terms-of-service"].map((p) => ORIGIN + p),
      ...destinations.map((d) => ORIGIN + destinationPath(d)),
      ...blogPosts.map((p) => `${ORIGIN}/blog/${p.slug}`),
    ]);
    expect(new Set(locs)).toEqual(expected);
    for (const retired of ["airport-lounge-guide-for-executives", "business-class-travel-tips", "best-airlines-for-business-class-routes"]) {
      expect(locs).not.toContain(`${ORIGIN}/blog/${retired}`);
    }
  });

  test("robots.txt does not block any indexable section", async ({ request }) => {
    const txt = await (await request.get("/robots.txt")).text();
    expect(txt).not.toMatch(/Disallow:\s*\/(blog|destinations|flights|about|contact|business-class|how-it-works)?\s*$/m);
  });
});
