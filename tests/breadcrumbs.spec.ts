import { test, expect } from "@playwright/test";

// Every indexable page describes where it sits with BreadcrumbList structured data: Home, then the page (the top-level and legal pages added 2026-11-15; the About page,
// destinations and articles already had it). Pure markup: this checks the JSON-LD, never the visible layout.
const HOST = "https://www.businessflights.travel";
const TOP = [
  ["/flights", "Request a Quote"],
  ["/business-class", "Business Class"],
  ["/how-it-works", "How It Works"],
  ["/destinations", "Destinations"],
  ["/contact", "Contact"],
  ["/blog", "Travel Journal"],
  ["/about", "About Us"],
  ["/privacy-policy", "Privacy Policy"],
  ["/cookie-policy", "Cookie Policy"],
  ["/terms-of-service", "Terms of Service"],
] as const;

for (const [path, name] of TOP) {
  test(`${path}: one valid BreadcrumbList, Home then "${name}", absolute canonical URLs`, async ({ request }) => {
    const html = await (await request.get(path)).text();
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    const lists = blocks.filter((b) => b["@type"] === "BreadcrumbList");
    expect(lists, "exactly one BreadcrumbList").toHaveLength(1);
    const items = lists[0].itemListElement as Array<{ "@type": string; position: number; name: string; item: string }>;
    expect(items.map((i) => i.position)).toEqual([1, 2]);
    expect(items[0]).toMatchObject({ "@type": "ListItem", name: "Home", item: HOST });
    expect(items[1]).toMatchObject({ "@type": "ListItem", name, item: `${HOST}${path}` });
    // the breadcrumb's last item is the page's own canonical URL
    expect(html).toContain(`<link rel="canonical" href="${HOST}${path}"`);
  });
}
