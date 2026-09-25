import type { Destination } from "@/data/destinations";

// Picks the "Related Destinations" shown on a destination page.
//
// Why this is its own function: the previous inline version was
// `destinations.filter(sameRegionOrCountry).slice(0, 4)` — the first four
// matches IN FILE ORDER, identical for every page in a region. A full-route
// crawl (scripts/audit-seo-inventory.mjs) showed the consequence: the same
// handful of destinations received hundreds of internal links while ~150
// pages had exactly one incoming link (the index). Internal links are how
// Google discovers and prioritizes pages, so that starved most of the site.
//
// Selection, all deterministic (no randomness, so builds are reproducible):
//   1. Up to two OTHER cities in the same country — the most genuinely
//      related choice a reader has.
//   2. The rest from the same region, walking the region's stable
//      (country, city) ordering forward from this page's own position and
//      wrapping around. Because each page starts from a different position,
//      links spread across the whole region instead of piling onto its first
//      four entries — every destination ends up linked from several peers.
//   3. Only if the region is too small to fill the list (e.g. North America),
//      continue the same rotation through the global list.
export function pickRelatedDestinations(current: Destination, all: readonly Destination[], limit = 4): Destination[] {
  const key = (d: Destination) => `${d.region}/${d.countrySlug}/${d.citySlug}`;
  const byPlace = (a: Destination, b: Destination) => a.country.localeCompare(b.country) || a.city.localeCompare(b.city);
  const chosen: Destination[] = [];
  const seen = new Set<string>([key(current)]);
  const take = (d: Destination) => {
    if (chosen.length < limit && !seen.has(key(d))) {
      seen.add(key(d));
      chosen.push(d);
    }
  };

  const sameCountry = all.filter((d) => d.region === current.region && d.countrySlug === current.countrySlug).sort(byPlace);
  const ownIndexInCountry = sameCountry.findIndex((d) => key(d) === key(current));
  // rotate from own position here too, so a country's cities spread links among each other
  for (let i = 1; i < sameCountry.length && chosen.length < 2; i++) take(sameCountry[(ownIndexInCountry + i) % sameCountry.length]);

  const walk = (pool: Destination[]) => {
    const start = pool.findIndex((d) => key(d) === key(current));
    const from = start >= 0 ? start : 0;
    for (let i = 1; i <= pool.length && chosen.length < limit; i++) take(pool[(from + i) % pool.length]);
  };
  walk(all.filter((d) => d.region === current.region).sort(byPlace));
  if (chosen.length < limit) walk([...all].sort(byPlace));
  return chosen;
}
