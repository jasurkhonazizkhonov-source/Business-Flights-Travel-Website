# SEO indexing recovery audit - every Search Console URL, one by one

Date: 2026-11-20. Workspace: `F:\Claude Workspace\Travel Agency Website-updated` (the folder the brief calls `bft-live-source-20261108`, which was renamed on 2026-11-09; it no longer exists under the old name), branch `review/website-parity-and-contact-ip-2026-11-15`. **Nothing was committed, pushed or deployed; no production system was changed.** This file is public-safe (no secrets, customer data or server addresses).

Evidence used, and how far each can be trusted:

* **Live, read-only:** public HTTP GETs of every supplied URL on 2026-11-20 (status, redirect target, robots meta/header, canonical, title, text length). No form was submitted. This is what Google would get today.
* **Local production build** of this working tree (`next build`, standalone, served on 127.0.0.1:3101, the apex host emulated with a `Host` header): what the release candidate will serve after deployment.
* **Search Console groups as supplied in the brief.** They are *historical evidence*: they say what Google saw on earlier crawls, not what the site returns now. The brief says 30 URLs under "Discovered - currently not indexed" but lists **35** (3 articles, 31 destinations, the privacy page); all 35 are audited below.

## Headline findings

1. **Most of what Search Console reports is already resolved on the live site.** The four "noindex" blog URLs that never existed as articles return a real 404 (no longer a soft `noindex` page), two retired articles are permanent redirects, and every supplied destination, article and the privacy page is HTTP 200, indexable and self-canonical. Google simply has not re-crawled most of them ("Discovered" with no crawl date).
2. **The 58 `/flights?to=XXX` URLs are an intentional design, not a defect:** each is the quote form pre-filled with a destination, linked from the destination pages, all canonical to `/flights`. Google correctly lists them as "alternate page with proper canonical". They are not in the sitemap and should stay that way.
3. **Two genuine 404s had an obvious home and were redirected**: `/terms` -> `/terms-of-service`, and two retired article URLs with a same-topic article. `/offers` never existed in this repository's history and the site has no offers to show; it stays a real 404 (nothing fabricated).
4. **`/cdn-cgi/l/email-protection` is Cloudflare's own endpoint**, produced by Cloudflare's *Email Address Obfuscation* rewriting every `mailto:` link on the live pages (verified in the live HTML; the source emits plain `mailto:`). It is not a site page. `robots.txt` now disallows `/cdn-cgi/`; the real fix is a Cloudflare dashboard setting that needs your approval (section 3).
5. **The apex redirect is a two-hop chain** on the live site (`http://businessflights.travel/` -> 301 `https://businessflights.travel/` -> 308 `https://www.businessflights.travel`). The first hop is Cloudflare's "Always use HTTPS", the second is the application. Collapsing it to one hop is a Cloudflare Redirect Rule (needs approval, section 4).
6. **Real weaknesses were in content depth and hierarchy, not in indexability**: destination data averages ~155 words of unique text per page, region breadcrumbs pointed at a `#fragment`, and only 4 destinations had verified airport-to-city information. Changes made are listed per section and in `SEO_CONTENT_IMPROVEMENT_PLAN.md`.

## Summary

| Category | URLs supplied | Audited | Fixed or dispositioned | Remaining |
|---|---|---|---|---|
| Alternative page with proper canonical | 58 | 58 | 58 reviewed; 0 changed (intentional) | none |
| Excluded by `noindex` | 6 | 6 | 6 dispositioned (2 redirected, 4 real 404) | none (the pages do not exist as articles) |
| Not found (404) | 5 | 5 | 5 dispositioned (1 new redirect, 1 already, 3 real 404 / Cloudflare endpoint) | Cloudflare setting for the email-obfuscation endpoint (approval) |
| Page with redirect | 2 | 2 | 2 verified (chain documented) | one-hop redirect needs a Cloudflare rule (approval) |
| Discovered, currently not indexed | 35 (brief says 30) | 35 | 35 reviewed; 5 given verified airport data; all linked from region hubs | Google must re-crawl; nothing technical left |
| Crawled, currently not indexed | 21 | 21 | 21 reviewed (5 are assets); 7 articles expanded; /terms redirected; /offers stays 404 | Google's decision; editorial depth is ongoing work |

## 1. Alternative page with proper canonical (58 `/flights?to=XXX` URLs)

**Diagnosis (same for all 58, verified on every URL).** `FlightsPage` reads `?to=<IATA>` only to pre-fill the "To" field of the quote form (`resolveAirportByIata`) and to show a destination-specific heading. Its metadata is fixed: `canonical = /flights`, no `noindex`, no `X-Robots-Tag`, identical title/description. The URLs are linked from the destination pages ("Get a Free Flight Quote"). Search results for a quote form with a pre-filled field are not useful landing pages, and there is no live inventory behind them, so they must not be indexable pages in their own right.

**Decision: keep the canonical to `/flights` (Google's own classification is correct). Do not put the query URLs in the sitemap, do not block them in robots.txt (Google must be able to read the canonical), do not create 58 thin pages.** The *destination* each parameter refers to already has a proper indexable page at a clean URL with a self-canonical (column "clean page"); that is the page meant to rank, and each is in the sitemap.

Checks on every row: live HTTP 200 for the query URL; canonical `https://www.businessflights.travel/flights` (live and local); no `noindex`; the canonical target `/flights` is 200, indexable, self-canonical and in the sitemap; the query URL is **not** in the sitemap; the clean destination page is 200, self-canonical and in the sitemap.

| URL | IATA | live / local status | canonical (live) | clean page that should rank | clean page in sitemap | verdict |
|---|---|---|---|---|---|---|
| `/flights?to=KUL` | KUL | 200 / 200 | `/flights` | `/destinations/asia/malaysia/kuala-lumpur` (Kuala Lumpur) | yes | intentional prefill URL; canonical correct |
| `/flights?to=BSL` | BSL | 200 / 200 | `/flights` | `/destinations/europe/switzerland/basel` (Basel) | yes | intentional prefill URL; canonical correct |
| `/flights?to=BER` | BER | 200 / 200 | `/flights` | `/destinations/europe/germany/berlin` (Berlin) | yes | intentional prefill URL; canonical correct |
| `/flights?to=KIV` | KIV | 200 / 200 | `/flights` | `/destinations/europe/moldova/chisinau` (Chișinău) | yes | intentional prefill URL; canonical correct |
| `/flights?to=FRA` | FRA | 200 / 200 | `/flights` | `/destinations/europe/germany/frankfurt` (Frankfurt) | yes | intentional prefill URL; canonical correct |
| `/flights?to=SKG` | SKG | 200 / 200 | `/flights` | `/destinations/europe/greece/thessaloniki` (Thessaloniki) | yes | intentional prefill URL; canonical correct |
| `/flights?to=PEK` | PEK | 200 / 200 | `/flights` | `/destinations/asia/china/beijing` (Beijing) | yes | intentional prefill URL; canonical correct |
| `/flights?to=HAJ` | HAJ | 200 / 200 | `/flights` | `/destinations/europe/germany/hannover` (Hannover) | yes | intentional prefill URL; canonical correct |
| `/flights?to=CAI` | CAI | 200 / 200 | `/flights` | `/destinations/africa/egypt/cairo` (Cairo) | yes | intentional prefill URL; canonical correct |
| `/flights?to=HER` | HER | 200 / 200 | `/flights` | `/destinations/europe/greece/heraklion` (Heraklion) | yes | intentional prefill URL; canonical correct |
| `/flights?to=MAD` | MAD | 200 / 200 | `/flights` | `/destinations/europe/spain/madrid` (Madrid) | yes | intentional prefill URL; canonical correct |
| `/flights?to=MRU` | MRU | 200 / 200 | `/flights` | `/destinations/africa/mauritius/mauritius` (Mauritius) | yes | intentional prefill URL; canonical correct |
| `/flights?to=PMO` | PMO | 200 / 200 | `/flights` | `/destinations/europe/italy/palermo` (Palermo) | yes | intentional prefill URL; canonical correct |
| `/flights?to=VCE` | VCE | 200 / 200 | `/flights` | `/destinations/europe/italy/venice` (Venice) | yes | intentional prefill URL; canonical correct |
| `/flights?to=FLR` | FLR | 200 / 200 | `/flights` | `/destinations/europe/italy/florence` (Florence) | yes | intentional prefill URL; canonical correct |
| `/flights?to=BCN` | BCN | 200 / 200 | `/flights` | `/destinations/europe/spain/barcelona` (Barcelona) | yes | intentional prefill URL; canonical correct |
| `/flights?to=BRU` | BRU | 200 / 200 | `/flights` | `/destinations/europe/belgium/brussels` (Brussels) | yes | intentional prefill URL; canonical correct |
| `/flights?to=ARN` | ARN | 200 / 200 | `/flights` | `/destinations/europe/sweden/stockholm` (Stockholm) | yes | intentional prefill URL; canonical correct |
| `/flights?to=NAN` | NAN | 200 / 200 | `/flights` | `/destinations/oceania/fiji/nadi` (Nadi) | yes | intentional prefill URL; canonical correct |
| `/flights?to=ABV` | ABV | 200 / 200 | `/flights` | `/destinations/africa/nigeria/abuja` (Abuja) | yes | intentional prefill URL; canonical correct |
| `/flights?to=NKG` | NKG | 200 / 200 | `/flights` | `/destinations/asia/china/nanjing` (Nanjing) | yes | intentional prefill URL; canonical correct |
| `/flights?to=GOA` | GOA | 200 / 200 | `/flights` | `/destinations/europe/italy/genoa` (Genoa) | yes | intentional prefill URL; canonical correct |
| `/flights?to=CLJ` | CLJ | 200 / 200 | `/flights` | `/destinations/europe/romania/cluj-napoca` (Cluj-Napoca) | yes | intentional prefill URL; canonical correct |
| `/flights?to=FAO` | FAO | 200 / 200 | `/flights` | `/destinations/europe/portugal/faro` (Faro) | yes | intentional prefill URL; canonical correct |
| `/flights?to=LIS` | LIS | 200 / 200 | `/flights` | `/destinations/europe/portugal/lisbon` (Lisbon) | yes | intentional prefill URL; canonical correct |
| `/flights?to=OTP` | OTP | 200 / 200 | `/flights` | `/destinations/europe/romania/bucharest` (Bucharest) | yes | intentional prefill URL; canonical correct |
| `/flights?to=WUH` | WUH | 200 / 200 | `/flights` | `/destinations/asia/china/wuhan` (Wuhan) | yes | intentional prefill URL; canonical correct |
| `/flights?to=FUK` | FUK | 200 / 200 | `/flights` | `/destinations/asia/japan/fukuoka` (Fukuoka) | yes | intentional prefill URL; canonical correct |
| `/flights?to=ZAG` | ZAG | 200 / 200 | `/flights` | `/destinations/europe/croatia/zagreb` (Zagreb) | yes | intentional prefill URL; canonical correct |
| `/flights?to=WAW` | WAW | 200 / 200 | `/flights` | `/destinations/europe/poland/warsaw` (Warsaw) | yes | intentional prefill URL; canonical correct |
| `/flights?to=WRO` | WRO | 200 / 200 | `/flights` | `/destinations/europe/poland/wroclaw` (Wroclaw) | yes | intentional prefill URL; canonical correct |
| `/flights?to=LUX` | LUX | 200 / 200 | `/flights` | `/destinations/europe/luxembourg/luxembourg-city` (Luxembourg City) | yes | intentional prefill URL; canonical correct |
| `/flights?to=KIX` | KIX | 200 / 200 | `/flights` | `/destinations/asia/japan/osaka` (Osaka) | yes | intentional prefill URL; canonical correct |
| `/flights?to=KRK` | KRK | 200 / 200 | `/flights` | `/destinations/europe/poland/krakow` (Krakow) | yes | intentional prefill URL; canonical correct |
| `/flights?to=RTM` | RTM | 200 / 200 | `/flights` | `/destinations/europe/netherlands/rotterdam` (Rotterdam) | yes | intentional prefill URL; canonical correct |
| `/flights?to=SKP` | SKP | 200 / 200 | `/flights` | `/destinations/europe/north-macedonia/skopje` (Skopje) | yes | intentional prefill URL; canonical correct |
| `/flights?to=SZG` | SZG | 200 / 200 | `/flights` | `/destinations/europe/austria/salzburg` (Salzburg) | yes | intentional prefill URL; canonical correct |
| `/flights?to=HAN` | HAN | 200 / 200 | `/flights` | `/destinations/asia/vietnam/hanoi` (Hanoi) | yes | intentional prefill URL; canonical correct |
| `/flights?to=BLQ` | BLQ | 200 / 200 | `/flights` | `/destinations/europe/italy/bologna` (Bologna) | yes | intentional prefill URL; canonical correct |
| `/flights?to=RIX` | RIX | 200 / 200 | `/flights` | `/destinations/europe/latvia/riga` (Riga) | yes | intentional prefill URL; canonical correct |
| `/flights?to=TLS` | TLS | 200 / 200 | `/flights` | `/destinations/europe/france/toulouse` (Toulouse) | yes | intentional prefill URL; canonical correct |
| `/flights?to=NBO` | NBO | 200 / 200 | `/flights` | `/destinations/africa/kenya/nairobi` (Nairobi) | yes | intentional prefill URL; canonical correct |
| `/flights?to=BEY` | BEY | 200 / 200 | `/flights` | `/destinations/middle-east/lebanon/beirut` (Beirut) | yes | intentional prefill URL; canonical correct |
| `/flights?to=VLC` | VLC | 200 / 200 | `/flights` | `/destinations/europe/spain/valencia` (Valencia) | yes | intentional prefill URL; canonical correct |
| `/flights?to=ESB` | ESB | 200 / 200 | `/flights` | `/destinations/europe/turkey/ankara` (Ankara) | yes | intentional prefill URL; canonical correct |
| `/flights?to=GOT` | GOT | 200 / 200 | `/flights` | `/destinations/europe/sweden/gothenburg` (Gothenburg) | yes | intentional prefill URL; canonical correct |
| `/flights?to=AYT` | AYT | 200 / 200 | `/flights` | `/destinations/europe/turkey/antalya` (Antalya) | yes | intentional prefill URL; canonical correct |
| `/flights?to=GVA` | GVA | 200 / 200 | `/flights` | `/destinations/europe/switzerland/geneva` (Geneva) | yes | intentional prefill URL; canonical correct |
| `/flights?to=CMN` | CMN | 200 / 200 | `/flights` | `/destinations/africa/morocco/casablanca` (Casablanca) | yes | intentional prefill URL; canonical correct |
| `/flights?to=HAM` | HAM | 200 / 200 | `/flights` | `/destinations/europe/germany/hamburg` (Hamburg) | yes | intentional prefill URL; canonical correct |
| `/flights?to=STR` | STR | 200 / 200 | `/flights` | `/destinations/europe/germany/stuttgart` (Stuttgart) | yes | intentional prefill URL; canonical correct |
| `/flights?to=MAA` | MAA | 200 / 200 | `/flights` | `/destinations/asia/india/chennai` (Chennai) | yes | intentional prefill URL; canonical correct |
| `/flights?to=SVQ` | SVQ | 200 / 200 | `/flights` | `/destinations/europe/spain/seville` (Seville) | yes | intentional prefill URL; canonical correct |
| `/flights?to=DSS` | DSS | 200 / 200 | `/flights` | `/destinations/africa/senegal/dakar` (Dakar) | yes | intentional prefill URL; canonical correct |
| `/flights?to=RHO` | RHO | 200 / 200 | `/flights` | `/destinations/europe/greece/rhodes` (Rhodes) | yes | intentional prefill URL; canonical correct |
| `/flights?to=GRU` | GRU | 200 / 200 | `/flights` | `/destinations/south-america/brazil/sao-paulo` (São Paulo) | yes | intentional prefill URL; canonical correct |
| `/flights?to=MEL` | MEL | 200 / 200 | `/flights` | `/destinations/oceania/australia/melbourne` (Melbourne) | yes | intentional prefill URL; canonical correct |
| `/flights?to=PER` | PER | 200 / 200 | `/flights` | `/destinations/oceania/australia/perth` (Perth) | yes | intentional prefill URL; canonical correct |

All 58 airport codes map to a destination page of their own that is 200, self-canonical and in the sitemap; none is missing.

## 2. Excluded by `noindex` (6 blog URLs)

**Diagnosis.** None of the six exists as an article in the current source or anywhere in this repository's git history, so there is no page to "un-noindex": Google saw the old live behaviour (a 200 "not found" page carrying `noindex`, fixed by commits `2b6d1bd` and `40113cb`, which made unknown blog URLs a real 404 via `dynamicParams = false`). Today: no `noindex` anywhere on these URLs. The brief's option A/B (improve and index) cannot apply to a page that does not exist; creating articles to match four old URLs would be exactly the fabrication the brief forbids.

| URL | live now | this build | same-topic article we publish? | decision |
|---|---|---|---|---|
| `/blog/sleep-better-on-overnight-business-class-flights` | 404 | 308 → /blog/how-to-sleep-better-on-long-haul-business-class | `/blog/how-to-sleep-better-on-long-haul-business-class` | **new** 308 to the same-topic article (see next.config.ts) |
| `/blog/emirates-business-class-guide` | 404 | 404 | no | real 404 kept: no equivalent article exists; nothing invented |
| `/blog/business-class-travel-tips` | 308 → /blog/long-haul-business-class-travel-tips | 308 → /blog/long-haul-business-class-travel-tips | `/blog/long-haul-business-class-travel-tips` | already a permanent redirect to the same-topic article (live and local) |
| `/blog/business-travel-trends-2026` | 404 | 404 | no | real 404 kept: no equivalent article exists; nothing invented |
| `/blog/united-polaris-vs-american-flagship-business` | 404 | 404 | no | real 404 kept: no equivalent article exists; nothing invented |
| `/blog/best-airlines-for-business-class-routes` | 308 → /blog/best-business-class-airlines-long-haul | 308 → /blog/best-business-class-airlines-long-haul | `/blog/best-business-class-airlines-long-haul` | already a permanent redirect to the same-topic article (live and local) |

## 3. Not found (404) - 5 URLs

| URL | live now | this build | history / links / sitemap | decision |
|---|---|---|---|---|
| `/blog/singapore-airlines-business-class-lounges` | 404 | 404 | Never in git history. Not linked internally, not in the sitemap. Airline-specific; we publish no article on it. | real 404 kept (a redirect to a general article would not be the same topic); no article invented |
| `/cdn-cgi/l/email-protection` | 404 | 404 | Not a page of this site. Cloudflare's *Email Address Obfuscation* rewrites every `mailto:` on the live pages to `/cdn-cgi/l/email-protection#<hash>` (live HTML contains it; the source and the local build contain none). Google fetches the bare path and gets a 404. | no page created. `robots.txt` now disallows `/cdn-cgi/`. **Recommended, needs approval:** switch off Email Address Obfuscation (Cloudflare > Scrape Shield) since the addresses are public contact details, or wrap them in `<!--email_off-->`. |
| `/blog/airport-lounge-guide-for-executives` | 308 → /blog/business-class-airport-lounge-guide | 308 → /blog/business-class-airport-lounge-guide | Never in git history. Not linked internally, not in the sitemap. | already a permanent redirect to `/blog/business-class-airport-lounge-guide` (live and local) |
| `/blog/best-airport-lounges-around-the-world` | 404 | 308 → /blog/business-class-airport-lounge-guide | Never in git history. Not linked, not in the sitemap. Topic = airport lounges. | **new** 308 to `/blog/business-class-airport-lounge-guide` - a judgement call: it is our lounge guide, not a ranking of named lounges; revert the line in next.config.ts if you would rather keep a 404 |
| `/blog/qatar-qsuite-vs-emirates-business-class` | 404 | 404 | Never in git history. Not linked internally, not in the sitemap. Airline-specific; we publish no article on it. | real 404 kept (a redirect to a general article would not be the same topic); no article invented |

## 4. Page with redirect (2 apex URLs)

Verified live 2026-11-20 with `curl` (read-only):

| Request | Response chain | Final |
|---|---|---|
| `http://businessflights.travel/` | 301 -> `https://businessflights.travel/` -> 308 -> `https://www.businessflights.travel` | 200 |
| `https://businessflights.travel/` | 308 -> `https://www.businessflights.travel` | 200 |
| `https://businessflights.travel/flights?to=FRA` | 308 -> `https://www.businessflights.travel/flights?to=FRA` (path and query kept) | 200 |
| `http://www.businessflights.travel/` | 301 -> `https://www.businessflights.travel/` | 200 |

Permanent redirects, no loop, the final homepage is 200 and self-canonical, and canonicals, `og:url`, JSON-LD and sitemap URLs all use `https://www.businessflights.travel` (checked on all 223 routes). **The only imperfection is the two-hop chain for `http://` apex.** The first hop is Cloudflare's "Always Use HTTPS" (it sends the visitor to the HTTPS *apex*), the second is this application's apex -> www rule (`next.config.ts`). Google reports both URLs as "Page with redirect", which is exactly right for URLs that redirect; nothing should make them indexable. To shorten it to one hop: a Cloudflare **Redirect Rule** for `businessflights.travel` (any scheme) -> `https://www.businessflights.travel` (301, keep path and query), placed before "Always Use HTTPS". **Not done: it changes the production Cloudflare configuration and needs your approval.** The local build was checked with a `Host` header: apex -> 308 www with path and query preserved, `www` and `localhost` never redirected (no loop).

## 5. Discovered, currently not indexed (35 URLs)

**Diagnosis.** All 35 return HTTP 200 live and locally, carry a self-referencing canonical, no `noindex` and no `X-Robots-Tag`, are in the sitemap, have server-rendered content, and are reachable within two clicks of the home page. "Discovered" with no crawl date means Google queued them and has not fetched them yet; there is no technical fault to fix. What can help: stronger internal linking from a topical parent, and pages that are worth fetching. Changes made: the five **region hubs** now link to every destination (see `incoming` below: every destination page gained a crawlable link from a topical parent page, and the destination breadcrumb now points at a real hub page instead of `#region`); Munich, Singapore, Edinburgh, Oslo and Budapest gained **verified** airport-to-city information from primary sources with check dates; three articles were expanded.

| URL | live / local status | canonical | in sitemap | incoming internal links | clicks from home | text words (local) | change made |
|---|---|---|---|---|---|---|---|
| `/blog/business-class-baggage-allowance-explained` | 200 / 200 | self | yes | 4 | 2 | 1080 | article expanded (+sections, FAQs, updated date) |
| `/blog/business-class-flights-to-japan` | 200 / 200 | self | yes | 6 | 2 | 997 | article expanded (+sections, FAQs, updated date) |
| `/blog/business-class-suites-vs-traditional-seats` | 200 / 200 | self | yes | 5 | 2 | 985 | article expanded (+sections, FAQs, updated date) |
| `/destinations/africa/egypt/sharm-el-sheikh` | 200 / 200 | self | yes | 6 | 2 | 636 | linked from region hub |
| `/destinations/africa/ivory-coast/abidjan` | 200 / 200 | self | yes | 6 | 2 | 618 | linked from region hub |
| `/destinations/africa/nigeria/lagos` | 200 / 200 | self | yes | 6 | 2 | 701 | linked from region hub |
| `/destinations/africa/south-africa/durban` | 200 / 200 | self | yes | 7 | 2 | 620 | linked from region hub |
| `/destinations/africa/uganda/entebbe` | 200 / 200 | self | yes | 6 | 2 | 619 | linked from region hub |
| `/destinations/asia/china/guangzhou` | 200 / 200 | self | yes | 6 | 2 | 628 | linked from region hub |
| `/destinations/asia/india/delhi` | 200 / 200 | self | yes | 6 | 2 | 709 | linked from region hub |
| `/destinations/asia/india/kolkata` | 200 / 200 | self | yes | 6 | 2 | 621 | linked from region hub |
| `/destinations/asia/india/mumbai` | 200 / 200 | self | yes | 6 | 2 | 716 | linked from region hub |
| `/destinations/asia/indonesia/bali` | 200 / 200 | self | yes | 7 | 2 | 725 | linked from region hub |
| `/destinations/asia/philippines/cebu` | 200 / 200 | self | yes | 8 | 2 | 632 | linked from region hub |
| `/destinations/asia/singapore/singapore` | 200 / 200 | self | yes | 222 | 1 | 815 | verified airport access added; linked from region hub |
| `/destinations/asia/south-korea/busan` | 200 / 200 | self | yes | 7 | 2 | 626 | linked from region hub |
| `/destinations/asia/thailand/chiang-mai` | 200 / 200 | self | yes | 7 | 2 | 630 | linked from region hub |
| `/destinations/europe/albania/tirana` | 200 / 200 | self | yes | 4 | 2 | 617 | linked from region hub |
| `/destinations/europe/cyprus/larnaca` | 200 / 200 | self | yes | 6 | 2 | 620 | linked from region hub |
| `/destinations/europe/estonia/tallinn` | 200 / 200 | self | yes | 5 | 2 | 615 | linked from region hub |
| `/destinations/europe/finland/helsinki` | 200 / 200 | self | yes | 6 | 2 | 712 | linked from region hub |
| `/destinations/europe/france/nantes` | 200 / 200 | self | yes | 6 | 2 | 618 | linked from region hub |
| `/destinations/europe/france/nice` | 200 / 200 | self | yes | 6 | 2 | 628 | linked from region hub |
| `/destinations/europe/germany/munich` | 200 / 200 | self | yes | 6 | 2 | 784 | verified airport access added; linked from region hub |
| `/destinations/europe/hungary/budapest` | 200 / 200 | self | yes | 6 | 2 | 797 | verified airport access added; linked from region hub |
| `/destinations/europe/italy/trieste` | 200 / 200 | self | yes | 6 | 2 | 624 | linked from region hub |
| `/destinations/europe/norway/oslo` | 200 / 200 | self | yes | 7 | 2 | 774 | verified airport access added; linked from region hub |
| `/destinations/europe/switzerland/zurich` | 200 / 200 | self | yes | 6 | 2 | 801 | verified airport access already present (checked 2026-10-16); linked from region hub |
| `/destinations/europe/united-kingdom/edinburgh` | 200 / 200 | self | yes | 7 | 2 | 817 | verified airport access added; linked from region hub |
| `/destinations/europe/united-kingdom/london` | 200 / 200 | self | yes | 222 | 1 | 841 | linked from region hub |
| `/destinations/middle-east/jordan/amman` | 200 / 200 | self | yes | 6 | 2 | 722 | linked from region hub |
| `/destinations/middle-east/kuwait/kuwait-city` | 200 / 200 | self | yes | 6 | 2 | 724 | linked from region hub |
| `/destinations/oceania/australia/adelaide` | 200 / 200 | self | yes | 8 | 2 | 689 | linked from region hub |
| `/destinations/oceania/new-zealand/queenstown` | 200 / 200 | self | yes | 5 | 2 | 711 | linked from region hub |
| `/privacy-policy` | 200 / 200 | self | yes | 222 | 1 | 1970 | new paragraph on location suggestions (counsel review needed) |

## 6. Crawled, currently not indexed (21 URLs)

### 6a. Technical assets (5) - not landing pages, deliberately left alone

| URL | live | what it is | decision |
|---|---|---|---|
| `/favicon.ico?favicon.2_b_y0slevam1.ico` | 200 image/x-icon | site favicon (cache-busted query string) | loads correctly; not in the sitemap; not linked as a page; nothing to fix. "Crawled, not indexed" on an icon, image or font file is informational. |
| `/twitter-image?f1f91c1551256e83` | 200 image/png | generated `twitter:image` PNG (image endpoint) | loads correctly; not in the sitemap; not linked as a page; nothing to fix. "Crawled, not indexed" on an icon, image or font file is informational. Blocking or `noindex`-ing the share image would risk the social preview, so it is left as is. |
| `/_next/static/media/2a65768255d6b625-s.p.3u4lli0-axodc.woff2` | 200 font/woff2 | self-hosted font file | loads correctly; not in the sitemap; not linked as a page; nothing to fix. "Crawled, not indexed" on an icon, image or font file is informational. |
| `/favicon.ico?favicon.1oef3sbogplr0.ico` | 200 image/x-icon | site favicon (cache-busted query string) | loads correctly; not in the sitemap; not linked as a page; nothing to fix. "Crawled, not indexed" on an icon, image or font file is informational. |
| `/_next/static/media/f06bf9da926bae75-s.p.2874ccu1_u7jf.woff2` | 200 font/woff2 | self-hosted font file | loads correctly; not in the sitemap; not linked as a page; nothing to fix. "Crawled, not indexed" on an icon, image or font file is informational. |

### 6b. Articles (7) and destinations (7)

| URL | live / local status | canonical | in sitemap | incoming internal links | text words live -> local | action |
|---|---|---|---|---|---|---|
| `/blog/business-class-vs-first-class` | 200 / 200 | self | yes | 3 | 1089 -> 1258 | article expanded: new practical sections + FAQs; `updatedAt` = 2026-11-20 |
| `/blog/what-does-business-class-actually-include` | 200 / 200 | self | yes | 4 | 933 -> 1122 | article expanded: new practical sections + FAQs; `updatedAt` = 2026-11-20 |
| `/blog/understanding-business-class-seat-types` | 200 / 200 | self | yes | 15 | 918 -> 1128 | article expanded: new practical sections + FAQs; `updatedAt` = 2026-11-20 |
| `/blog/business-travel-packing-guide-long-haul` | 200 / 200 | self | yes | 4 | 755 -> 948 | article expanded: new practical sections + FAQs; `updatedAt` = 2026-11-20 |
| `/blog/how-to-sleep-better-on-long-haul-business-class` | 200 / 200 | self | yes | 4 | 868 -> 1075 | article expanded: new practical sections + FAQs; `updatedAt` = 2026-11-20 |
| `/blog/planning-a-comfortable-multi-city-business-trip` | 200 / 200 | self | yes | 9 | 844 -> 1021 | article expanded: new practical sections + FAQs; `updatedAt` = 2026-11-20 |
| `/blog/corporate-travel-planning-tips` | 200 / 200 | self | yes | 4 | 849 -> 1027 | article expanded: new practical sections + FAQs; `updatedAt` = 2026-11-20 |
| `/destinations/europe/russia/moscow` | 200 / 200 | self | yes | 6 | 722 -> 729 | indexable; content depth tracked in the content plan |
| `/destinations/asia/indonesia/jakarta` | 200 / 200 | self | yes | 6 | 701 -> 708 | indexable; content depth tracked in the content plan |
| `/destinations/africa/morocco/casablanca` | 200 / 200 | self | yes | 9 | 720 -> 727 | indexable; content depth tracked in the content plan |
| `/destinations/asia/india/ahmedabad` | 200 / 200 | self | yes | 8 | 691 -> 698 | indexable; content depth tracked in the content plan |
| `/destinations/europe/austria/vienna` | 200 / 200 | self | yes | 6 | 697 -> 704 | indexable; content depth tracked in the content plan |
| `/destinations/asia/india/bengaluru` | 200 / 200 | self | yes | 5 | 704 -> 711 | indexable; content depth tracked in the content plan |
| `/destinations/asia/vietnam/ho-chi-minh-city` | 200 / 200 | self | yes | 4 | 725 -> 732 | indexable; content depth tracked in the content plan |

Googlebot receives the same text as a visitor: the content is in the server-rendered `<main>` (checked by `tests/seo.spec.ts`: no loading fallback, no script-swapped content), so "crawled, not indexed" here is a quality/priority judgement by Google, not a rendering problem. For the destination pages the unique text is short (see the content plan); that is the honest reason, and it can only be improved with verified, city-specific facts.

### 6c. Other pages (2)

| URL | live | this build | history | decision |
|---|---|---|---|---|
| `/offers` | 404 | 404 | never existed in git history; not linked; not in any sitemap | stays a real 404. The site has no offers and no offer data; an "offers" page would have to be invented. If real offers exist later, build the page from real data then. |
| `/terms` | 404 | 308 → /terms-of-service | never existed in git history; not linked; not in any sitemap | **new** 308 to `/terms-of-service` (the conventional address of the page that exists) |

`/terms-of-service` itself: 200, self-canonical, indexable, in the sitemap, linked from the footer and the legal navigation; its legal text was **not** changed.

## 7. What still needs someone else

* **Cloudflare (needs your approval, not done):** (a) a Redirect Rule so `businessflights.travel` -> `https://www.businessflights.travel` is one hop; (b) turn off *Email Address Obfuscation*; (c) confirm *Add visitor location headers*. A read-only checklist is in `PRODUCTION_REDEPLOYMENT_READINESS.md`.
* **Google:** re-crawling and indexing are Google's decisions. After deployment: submit the sitemap, inspect a few representative URLs, and request indexing for a small number of high-priority pages only (checklist in `SEO_TECHNICAL_VERIFICATION.md`).
* **Editorial:** the destination pages need verified, city-specific facts to become meaningfully more unique (the plan lists priorities and the exact data needed). No facts were invented in this pass.


## 8. Re-check on 2026-11-22 (local production build of the release candidate; the live site was not used)

**URLs.** Every URL in sections 1-6 was requested again from the local production build (`/flights?to=` x58, the six `noindex` URLs, the five 404 URLs, the 35 "discovered" and 21 "crawled" URLs) plus the apex host (emulated with a `Host` header), and compared with the treatment documented above: **125 of 125 URLs and the 3 apex checks behave exactly as documented** (the 58 `/flights?to=` URLs are 200 with canonical `https://www.businessflights.travel/flights`; the documented 308s and real 404s are unchanged; the 35 "discovered" URLs are 200, self-canonical, not `noindex` and in the sitemap (checked strictly), and the 21 "crawled" URLs return the status documented in section 6 (200, 308 or 404; only the status was compared for those); the apex answers `308` to the same path and query on `www`). The sitemap lists 223 URLs and `validate-seo` reports 0 failures.

**Content claims re-checked** against the operators' pages (search results, not a direct page fetch; the 2026-11-20 pass read the pages themselves):
* Oslo (Flytoget: 19 minutes, about every 10 minutes, virtually all day): **confirmed**.
* Budapest (BKK 100E: Deák Ferenc tér via Kálvin tér, 40 minutes, every 6 to 10 minutes by day): **confirmed** (BKK gives 6-10 minutes on some weekdays and 7-10 on the others; the page's range covers both).
* Edinburgh (tram every 7 minutes 6:30am-7pm, every 10 minutes early and late): **frequency confirmed**; the 30-minute journey figure was **not visible** in the search results (it was read on the airport's tram page on 2026-11-20); left unchanged.
* **Munich: changed.** The airport's own pages state the S-Bahn journey to the main station slightly differently (about 40 minutes on one page, about 45 on others), and the bus's 45-minute figure could not be confirmed. The page now says "roughly 40 to 45 minutes ... its own pages state the figure slightly differently", names the Lufthansa Express Bus without a duration, and asks the reader to check the timetable for their day. Source link and check date unchanged (the claim is now weaker, not different).
* Frankfurt, Zurich, Brussels, Singapore, Luxembourg City were not re-checked in this pass.

Nothing else in this audit changed: no page was added, no redirect was added, the 58 `/flights?to=` URLs stay canonical to `/flights`, and no content was added to raise the number of indexed URLs. Indexing remains Google's decision.
