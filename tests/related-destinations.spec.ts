import { test, expect } from "@playwright/test";
import { destinations, destinationPath } from "../src/data/destinations";
import { pickRelatedDestinations } from "../src/lib/related-destinations";

// Regression guard for the internal-link distribution bug: the old inline
// selection (`.filter(sameRegionOrCountry).slice(0, 4)`) gave every page in a
// region the SAME four links, leaving ~150 of 171 destination pages with a
// single incoming internal link. These assert the properties that matter to
// crawlability, over the real dataset.

const incoming = new Map<string, number>(destinations.map((d) => [destinationPath(d), 0]));
for (const d of destinations) for (const r of pickRelatedDestinations(d, destinations, 4)) incoming.set(destinationPath(r), (incoming.get(destinationPath(r)) ?? 0) + 1);

test.describe("pickRelatedDestinations", () => {
  test("always returns exactly 4 distinct destinations, never the page itself", () => {
    for (const d of destinations) {
      const rel = pickRelatedDestinations(d, destinations, 4);
      expect(rel).toHaveLength(4);
      expect(new Set(rel.map(destinationPath)).size).toBe(4);
      expect(rel.map(destinationPath)).not.toContain(destinationPath(d));
    }
  });

  test("every destination in a region with 3+ cities receives at least 2 related-links from other destination pages, and the median page receives 4 (was: median 1, ~150 pages received none)", () => {
    const tiny = new Set(destinations.filter((d) => destinations.filter((x) => x.region === d.region).length < 3).map(destinationPath));
    const starved = [...incoming.entries()].filter(([p, n]) => n < 2 && !tiny.has(p));
    expect(starved).toEqual([]);
    const sorted = [...incoming.values()].sort((a, b) => a - b);
    expect(sorted[Math.floor(sorted.length / 2)]).toBeGreaterThanOrEqual(4);
  });

  test("links are spread, not piled onto a few hubs (no page receives more than 3x the average)", () => {
    const avg = [...incoming.values()].reduce((a, b) => a + b, 0) / incoming.size;
    const max = Math.max(...incoming.values());
    expect(max).toBeLessThanOrEqual(avg * 3);
  });

  test("same-country cities are preferred when they exist", () => {
    const italy = destinations.filter((d) => d.countrySlug === "italy");
    expect(italy.length).toBeGreaterThan(2);
    for (const d of italy) {
      const sameCountry = pickRelatedDestinations(d, destinations, 4).filter((r) => r.countrySlug === "italy");
      expect(sameCountry.length).toBeGreaterThanOrEqual(2);
    }
  });

  test("deterministic: identical output on repeated calls", () => {
    const d = destinations[40];
    expect(pickRelatedDestinations(d, destinations).map(destinationPath)).toEqual(pickRelatedDestinations(d, destinations).map(destinationPath));
  });

  test("a region too small to fill the list falls back to other regions without duplicating or self-linking", () => {
    const small = destinations.filter((d) => destinations.filter((x) => x.region === d.region).length < 5);
    for (const d of small) expect(pickRelatedDestinations(d, destinations, 4)).toHaveLength(4);
  });
});
