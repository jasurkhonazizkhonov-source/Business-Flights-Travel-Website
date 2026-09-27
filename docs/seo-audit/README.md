# SEO / indexing audit — 2026-09-24, updated 2026-09-27

**2026-09-27 update**: deeper re-audit found and fixed two real, mechanical content defects (not visible from HTTP/canonical/metadata checks alone — found by actually reading the rendered page text). See [`gsc-affected-urls-2026-09-27.csv`](./gsc-affected-urls-2026-09-27.csv) for the current 127-row inventory (125 from the original GSC report + 2 URLs named in a later task that do not exist in this repository — see below).

1. **`flyingFromUS`**: 98 of 171 destinations used one of two identical sentences verbatim, naming no city at all. Rewritten to include each destination's own city name and IATA code (already-verified data, nothing invented) — 171/171 now distinct.
2. **`businessTravel`**: the same 98 destinations had this field end with a duplicated, lowercased copy of their own `bestTimeToVisit` sentence appended (a leftover from whatever process generated the original content). Removed; the genuine airline-tracking sentence is unchanged.

Both are now guarded by `scripts/validate-content.mjs`. Near-duplicate similarity across destinations (re-measured live): max Jaccard 0.64 → 0.558, median 0.229 → 0.22 — a real but modest reduction, reported honestly rather than oversold.

**Also verified, not fixed**: two blog URLs named in the 2026-09-27 task (`united-polaris-vs-american-flagship-business`, `qatar-qsuite-vs-emirates-business-class`) do not exist anywhere in this repository's git history and correctly 404. Not fabricated to match a list that appears to have included them in error.

---

# Original audit — 2026-09-24

Generated with `node scripts/audit-seo-inventory.mjs <baseUrl> --gsc <gsc.json>` (read-only GETs) against
production, plus `scripts/validate-seo.mjs`. Full per-URL results for the 125 URLs in the Search Console report:
[`gsc-affected-urls-2026-09-24.csv`](./gsc-affected-urls-2026-09-24.csv).

## Route inventory (recalculated from the repository, not assumed)

| | Count |
|---|---:|
| Static routes | 11 |
| Destination pages | 171 |
| Blog articles | 36 |
| **Total routes = sitemap URLs** | **218** |

All 218: HTTP 200, self-canonical on `https://www.businessflights.travel`, no `noindex`, no `X-Robots-Tag`,
exactly one H1, title + description present and **unique** (0 duplicate titles / descriptions / H1s), complete Open Graph,
valid JSON-LD, 0 broken internal links. Everything is within 2 clicks of the homepage.

## Search Console categories

| Category | URLs | Finding |
|---|---:|---|
| Page with redirect | 2 | Intentional. `http://apex` → `https://apex` → `https://www` (308, 2 hops) is Vercel's domain/SSL layer; no `vercel.json`/middleware/`next.config` redirect exists in the repo. Shortening it to one hop is a Vercel **Domains** setting, not code. |
| Alternative page with proper canonical | 2 | Intentional. `/flights?to=<IATA>` is the quote-form prefill linked from every destination page; canonical → `/flights`; no `noindex`. |
| Discovered – currently not indexed | 120 | All 120 exist as routes (0 missing), return 200, and pass every technical check. Real weakness found and fixed: internal linking (below). |
| Crawled – currently not indexed | 1 | `/twitter-image?<hash>` is the generated `twitter:image` **PNG** (`image/png`), not an HTML page. Left unchanged on purpose (see below). |

## What was actually wrong, and the fix

**Internal links were concentrated, not distributed.** The "Related Destinations" block selected
`.filter(sameRegionOrCountry).slice(0, 4)` — the first four matches in file order, identical for every page in a region.
Measured before: destination pages had a **median of 1 incoming internal link** (only the `/destinations` index), while a
handful of hubs received hundreds. Fixed with `src/lib/related-destinations.ts` (same-country first, then rotating
regional neighbours). Measured after (same algorithm over the real dataset): **median 4, min 1 (only the two North-America
cities), max 7.** Covered by `tests/related-destinations.spec.ts`.

## Content findings (reported, not "fixed" — no invented facts)

* Primary destination content is **100% unique** across all 171 pages (overview, why-visit, business-travel, airport info, tagline).
* Templated sections: the "Flying from the United States" routing sentence is shared by 98 pages (two variants) and
  `popularRoutes` by 167. Near-duplicate measurement (5-word shingles): median pair similarity 0.23, highest 0.64
  (Santorini/Mykonos). Main-content length is ~410–580 words per destination, ~480–840 per blog article.
  Making these sections genuinely city-specific needs verified routing/airline data per city; generating it here would risk
  fabricated travel claims, so it is left for an editor with real data.
* Blog articles are clean (max pairwise similarity 0.18) and have a healthy link graph (median 4 incoming).
* The 3 `<img>` "without alt" flags are decorative full-bleed hero backgrounds with `alt=""` — correct, not defects.

## `/twitter-image` — why no `noindex`

It is an image endpoint that social crawlers must fetch, served as `image/png`. A blanket `noindex`/robots block risks
Google not using the image as a page thumbnail and gains nothing: "Crawled – currently not indexed" on an image URL is
informational, not an error.

## What code cannot decide

Whether/when Google indexes each page is Google's call. The site is technically indexable and internally linked; the
"Discovered" status with *Last crawled: N/A* means Google has queued the URL but not fetched it yet.
