# SEO and content-quality audit — 2026-10-16

Scope: every page the site publishes (218 URLs in `sitemap.xml`: 1 home, 10 static, 171 destinations,
36 articles), the three blog redirects added in `2b6d1bd`, and the technical SEO of the routes behind them.
Baseline commit: `2b6d1bd`. No Search Console or analytics data was available to this audit, so nothing
here is prioritised by clicks or impressions.

Files in this folder

| File | Contents |
|---|---|
| `pages.csv` | One row per sitemap URL: status, self-canonical, robots, title/description length, H1/H2 counts, JSON-LD types, main-text words, internal inlinks |
| `destinations.csv` | One row per destination: templated or not, FAQ count, verified-access flag, shared-text %, inlinks, classification, priority, notes |

Both were generated from a crawl of a local **production build** (`next build && next start`) of this commit.

## 0. Production was unreachable during this audit

The live site could not be crawled, so all checks use a local production build. Observed on 2026-10-16:

* `www.businessflights.travel` returns **NXDOMAIN** (Google DNS-over-HTTPS `Status 3`, and via 8.8.8.8 / 1.1.1.1).
  The apex `businessflights.travel` resolves with no A/AAAA/CNAME record. The nameservers are Cloudflare
  (`hayes.ns.cloudflare.com`, `maleah.ns.cloudflare.com`), so the records are missing at the DNS host.
* The Vercel deployment for `2b6d1bd` (GitHub status "success") now answers **HTTP 402 `DEPLOYMENT_DISABLED` / "Payment required"**
  on its `*.vercel.app` URL, i.e. the Vercel team/project is suspended for billing.

Neither is a code problem and neither was changed by this work. Until DNS and hosting are restored, no Search
Console re-crawl can succeed and nothing pushed to `main` will be served by Vercel.

## 1. Findings

### Confirmed technical defects

| # | Severity | Finding | Evidence | Status |
|---|---|---|---|---|
| T1 | High | The root `src/app/loading.tsx` (added in `a22be0b`) wrapped every page in a Suspense boundary. The HTML a crawler fetched had `Loading…` inside `<main>` and the real page in a hidden out-of-order segment (`<div hidden id="S:0">`) that only a script swaps in. This is also what turned unknown slugs into HTTP 200 soft-404s. | Raw HTML of `/destinations/europe/united-kingdom/london` on a production build: skeleton in `<main>`, 2 `Loading…`, content in a hidden segment. After removing the file: `<main>` holds the page (31 KB), 0 fallback, 0 hidden segments, same 404 behaviour (with `dynamicParams = false`). | **Fixed** — file and its CSS removed; regression test added |
| T2 | Medium | Destination pages: the first H2 repeated the H1 verbatim on all 171 pages. | `h1EqualsFirstH2 = 171` in the crawl. | **Fixed** — now 0 |
| T3 | Medium | 97 destination pages showed the same sentence up to three times on one page (hero tagline, then the "overview", then a bullet): the overview is exactly *tagline + bullet 1 + ", and " + bullet 2*. | Pattern check over the data: 97 of 171 match exactly. | **Fixed** — the redundant overview is not rendered (data untouched) |
| T4 | Low | The shared routing paragraphs ("Routing from the United States to X (CODE) typically connects…", "Total travel time to CODE depends…") appeared as two separate sections on ~100 pages. | 68 pages share one routing text verbatim, 97 share one "What to Expect" text. | **Reduced** — shown once as a short note |
| T5 | — | Unknown blog slugs / unknown city returned HTTP 200 + `noindex` + homepage canonical | Fixed in `2b6d1bd`; re-verified here on a production build (404). | Verified |
| T6 | — | `/flights?to=XXX` (171 internal links, one per destination) | 200, exactly one canonical → `/flights`, no robots meta, not in sitemap; destination preselection still works. Policy unchanged. | Verified |
| T7 | — | Sitemap / robots / canonicals / titles / descriptions | 218/218 URLs: 200, self-canonical, no `noindex`, one H1, no duplicate titles or descriptions, no image-less `<img>`. `robots.txt` allows all and names the sitemap. Share images (`/opengraph-image`, `/twitter-image`) are not in the sitemap. | Verified |

### Content-quality findings (editorial; not defects)

| # | Severity | Finding | Evidence |
|---|---|---|---|
| C1 | High | **97 of 171 destination pages (57%) are templated stubs**: generated overview, shared routing/airport text, no FAQ. | See `destinations.csv` (`templated_overview = true`). |
| C2 | High | The "Airlines Serving This Route" list on every destination is an editorial list that was never verified against schedules (the Batumi page claimed Qatar Airways; no source supports it, so it was removed on 2026-10-09). Other pages can contain the same kind of error. | `popularAirlines` is hand-entered in `src/data/destinations.ts`. |
| C3 | Medium | Even the hand-written pages are short: ~350–450 words including template and CTA text. | Crawl: destination main-text median 370 words (after) / 431 (before the dedupe). |
| C4 | Medium | Median 79% of a destination page's 6-word phrases also appear on at least one other destination page (p90 85%). This **rose** from 74% because the removed overview paragraph was unique to each page but carried no information; the shared boilerplate (business-travel line, airline paragraph, CTA, fare note, related cards) is unchanged. Readability improved; uniqueness did not. Real uniqueness needs verified, destination-specific facts (C1, C2). | `summary-*` crawl comparison. |
| C5 | Medium | Moscow and Saint Petersburg pages: entry requirements, sanctions and routing restrictions change; the copy already carries a caution. Needs an owner/compliance decision on whether to keep marketing business-class bookings there. | `destinations.csv` → "Review indexation or consolidation". No change made. |
| C6 | Low | Region labelling: Georgia, Armenia and Azerbaijan sit under `/destinations/middle-east/…`. Changing URLs was not justified by any evidence. | — |

### Google indexing decisions (not controllable here)

"Crawled – currently not indexed" and "Alternative page with proper canonical tag" are Google's decisions.
Nothing in this audit should be read as a promise that any page will be indexed or ranked.

## 2. Changes made

| File | Change | Why |
|---|---|---|
| `src/app/loading.tsx` (deleted), `src/app/globals.css` | Removed the root loading boundary and its skeleton CSS | T1 |
| `src/app/destinations/[region]/[country]/[city]/page.tsx` | Overview section only when it adds information, retitled "X at a Glance"; routing note shown once instead of two shared paragraphs; new "From CODE Into the City" section (with sources and check date) when verified data exists | T2–T4, C1 |
| `src/lib/destination-content.ts` (new) | Recognises exactly the templated patterns (never rewrites text) | T3, T4 |
| `src/data/destinations.ts` | New optional fields `airportAccess`, `sources`, `verifiedOn`; filled for Frankfurt, Zurich, Luxembourg City, Brussels | C1 |
| `tests/seo.spec.ts`, `tests/accessibility.spec.ts` | New regression tests (below); skeleton assertion removed with the skeleton | — |

## 3. Facts added, with sources

All four were checked on **2026-10-16** against pages published by the airport, rail or transit operator
(search results pointing at those pages; the wording on the site stays within what they state). Time-sensitive
details (service frequencies, tram hours, temporary rail works, Frankfurt's AiRail check-in change) were deliberately left out.

| Destination | Statement added | Sources |
|---|---|---|
| Frankfurt (FRA) | Long-distance station next to Terminal 1 (Deutsche Bahn, IC/ICE); Terminal 1 about 10 minutes on foot per the airport; Terminal 2 by shuttle bus or SkyLine | frankfurt-airport.com — "travel by train", "long-distance train station" |
| Zurich (ZRH) | Airport railway station; SBB trains to Zürich HB every 10 minutes, about 15 minutes (airport's figures); several long-distance lines call at the airport | flughafen-zuerich.ch — "train, tram and bus"; network.sbb.ch — Zürich Flughafen connections |
| Luxembourg City (LUX) | Tram extended to Findel airport on 2 March 2025 (stops incl. Hamilius, Gare centrale); bus lines 16 and 29 to the centre | luxtram.lu; lux-airport.lu FAQ |
| Brussels (BRU) | Station directly beneath the terminal; direct trains to Central/North/South; roughly 16–18 minutes to Central (airport and operator differ slightly); rail surcharge ("Brussels Airport supplement") | brusselsairport.be — train; belgiantrain.be — airport supplement |

Not verified and therefore **not** added: which airlines fly which routes, nonstop availability, flight times, lounge details.

## 4. Redirect decisions (from `2b6d1bd`)

No evidence that any of these URLs ever existed in this repository (no history in git). They are topical guesses, kept
because each target satisfies the likely intent and none is linked internally.

| From | To | Verdict |
|---|---|---|
| `/blog/airport-lounge-guide-for-executives` | `/blog/business-class-airport-lounge-guide` | **Keep.** Same topic (lounge access for business-class travellers). |
| `/blog/business-class-travel-tips` | `/blog/long-haul-business-class-travel-tips` | **Keep.** Practical business-class tips (arrival, lounge, connections, packing). Slightly narrower (long-haul). |
| `/blog/best-airlines-for-business-class-routes` | `/blog/best-business-class-airlines-long-haul` | **Keep, moderate confidence.** The target explains what separates the best long-haul business-class airlines; it is not a route-by-route ranking. Revisit if Search Console shows these URLs being treated as soft 404s. |

Single hop (308 → 200), targets are self-canonical and indexable. The other five reported URLs
(`emirates-business-class-guide`, `business-travel-trends-2026`, `united-polaris-vs-american-flagship-business`,
`qatar-airways-qsuite-business-class-experience`, `top-european-business-destinations`) return a real 404; no
published article is an equivalent.

## 5. Destination classification

| Classification | Pages |
|---|---|
| Keep as-is (hand-written, specific; technically correct) | 69 |
| Keep and improve — done | 4 (Batumi 2026-10-09; Frankfurt, Zurich, Brussels 2026-10-16) |
| Partially improved; still needs verified research | 1 (Luxembourg City) |
| Needs verified research | 95 (P1 = most duplicated; P2/P3 in the CSV) |
| Review indexation or consolidation | 2 (Moscow, Saint Petersburg — compliance/editorial) |

No page was removed, redirected, noindexed or re-canonicalised, and none was dropped from the sitemap.

## 6. Tests

Run against a production build (`TEST_BASE_URL=http://localhost:3200`, 3 workers, 4 viewport projects):
**1249 passed, 4 skipped, 3 flaky (passed on retry), 0 failed.** The three flaky tests are the heavy real-engine specs
(`schema-guard` schema-shape sync on Desktop; `schema-init-e2e` on Mobile 375 and 390) that time out under parallel load;
re-run alone with `--workers=1 --retries=0` the two files passed 148/148. TypeScript, ESLint and `next build` are clean.
New specs in `tests/seo.spec.ts`:
crawlable `<main>` (no loading fallback, no hidden segments), heading structure on 8 destination pages, templated vs
specific rendering, verified-access sections and sources for the four updated pages, data invariants, helper behaviour,
plus the earlier indexing-policy suite (404s, redirects, canonicals, sitemap, share images). Status-code tests need a
production build: `npm run build && npx next start -p 3200`, then `TEST_BASE_URL=http://localhost:3200 npx playwright test`.
