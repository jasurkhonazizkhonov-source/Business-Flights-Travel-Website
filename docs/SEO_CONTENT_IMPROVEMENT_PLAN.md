# SEO content improvement plan - blogs and destinations

Date: 2026-11-20. Companion to `SEO_INDEXING_RECOVERY_AUDIT.md`. **No search-volume, traffic, ranking, backlink or Search Console performance data was available to this pass** (only the list of URLs Google reported), so nothing here is prioritised by demand; priority uses what is actually known: the page's commercial role (featured destinations), whether Google has already discovered or crawled it (the supplied Search Console lists), and how thin its unique content is. No fact was invented: every airport-access statement added cites a primary source and a check date.

## 1. What was changed in this pass

* **Ten articles expanded** with practical, durable guidance (each gained two new sections and one to two FAQs, and a real `updatedAt` of 2026-11-20, which also feeds `dateModified` in the Article markup and the sitemap `lastmod`): `business-class-baggage-allowance-explained`, `business-class-flights-to-japan`, `business-class-suites-vs-traditional-seats`, `business-class-vs-first-class`, `what-does-business-class-actually-include`, `understanding-business-class-seat-types`, `business-travel-packing-guide-long-haul`, `how-to-sleep-better-on-long-haul-business-class`, `planning-a-comfortable-multi-city-business-trip`, `corporate-travel-planning-tips`. Rules followed: no airline-specific product, schedule, price, lounge, allowance or visa claim; general statements are hedged ("commonly", "depends on the airline"); where a rule varies the text tells the reader how to check it.
* **Five region hub pages** (`/destinations/europe|asia|africa|middle-east|oceania`): a short editorial introduction written to be true without data that can go stale, every country with its cities, and the planning guides that genuinely cover the region. Regions with 9+ destinations only (North and South America have 2 and 5, so they stay a section of `/destinations`; a hub there would be a thin page).
* **Five destinations gained verified airport-to-city information** from primary sources fetched on 2026-11-20 (Munich, Singapore, Oslo, Edinburgh, Budapest), joining Frankfurt, Zurich, Brussels and Luxembourg City from 2026-10-16 (9 of 171 now). Helsinki's source returned HTTP 403 and Tallinn and Vienna have temporary rail disruptions, so those three were deliberately **not** added rather than guessed.
* **Hierarchy and internal links:** destination breadcrumbs (visible and structured data) now go Home > Destinations > Region hub > City instead of pointing at a `#fragment`; the destinations index links to each hub; every destination page gained a crawlable link from its region hub (minimum incoming internal links per destination 3 -> 4, median 5 -> 6).

## 2. Blog audit (36 articles)

Body text (the article's own blocks): 291-657 words, median 362. Pairwise similarity between articles is low (max 0.18 in the 2026-10-16 audit; not re-measured after the additions, which are article-specific). No duplicates and no articles on the same question, but one cluster deserves watching for keyword overlap: **seat design** (`understanding-business-class-seat-types`, `business-class-suites-vs-traditional-seats`, `direct-aisle-access-business-class`). They answer different questions (types, suites, aisle access), cross-link each other, and were kept separate; if Search Console later shows them competing for the same queries, merge the two shorter ones into the seat-types guide with 308s.

Classification key: **Keep + improved** = expanded in this pass; **Keep + expand next** = sound and accurate but short (under about 340 words), the next candidates; **Keep** = no action needed now. None needs consolidation, redirection, `noindex` or removal today.

| Article | Category | Body words | FAQs | Incoming links | In the Search Console lists | Classification | Priority |
|---|---|---|---|---|---|---|---|
| `how-to-choose-the-right-business-class-flight` | Choosing Your Flight | 524 | 0 | 188 |  | Keep | P3 |
| `business-class-airport-lounge-guide` | Airport Guides | 357 | 2 | 180 |  | Keep | P3 |
| `how-to-find-business-class-flight-deals` | Business Class Travel Guides | 340 | 0 | 6 |  | Keep | P3 |
| `best-business-class-airlines-long-haul` | Best Business-Class Airlines | 367 | 0 | 8 |  | Keep | P3 |
| `long-haul-business-class-travel-tips` | Business Travel Tips | 446 | 2 | 8 |  | Keep | P3 |
| `corporate-travel-planning-tips` | Corporate Travel Tips | 531 | 1 | 4 | yes | Keep + improved (2026-11-20) | done |
| `when-to-book-international-business-class` | International Travel Guides | 499 | 2 | 180 |  | Keep | P3 |
| `business-class-vs-first-class` | Choosing Your Flight | 657 | 3 | 3 | yes | Keep + improved (2026-11-20) | done |
| `understanding-business-class-seat-types` | Business Class Travel Guides | 629 | 1 | 15 | yes | Keep + improved (2026-11-20) | done |
| `what-does-business-class-actually-include` | Business Class Travel Guides | 544 | 3 | 4 | yes | Keep + improved (2026-11-20) | done |
| `is-business-class-worth-it-long-haul` | Business Class Travel Guides | 373 | 2 | 2 |  | Keep | P3 |
| `first-time-business-class-traveler-guide` | Business Class Travel Guides | 350 | 2 | 3 |  | Keep | P3 |
| `direct-aisle-access-business-class` | Airline / Cabin Education | 362 | 2 | 3 |  | Keep | P3 |
| `business-class-suites-vs-traditional-seats` | Airline / Cabin Education | 458 | 2 | 5 | yes | Keep + improved (2026-11-20) | done |
| `how-to-compare-business-class-cabins-across-airlines` | Airline / Cabin Education | 328 | 0 | 5 |  | Keep + expand next | P2 |
| `business-class-baggage-allowance-explained` | Business Class Travel Guides | 506 | 3 | 4 | yes | Keep + improved (2026-11-20) | done |
| `how-to-sleep-better-on-long-haul-business-class` | Business Class Guides | 473 | 3 | 4 | yes | Keep + improved (2026-11-20) | done |
| `planning-a-business-class-trip-to-europe` | Destination Planning | 312 | 0 | 91 |  | Keep + expand next | P2 |
| `business-class-flights-to-asia-planning` | Destination Planning | 319 | 0 | 43 |  | Keep + expand next | P2 |
| `business-class-flights-to-the-middle-east` | Destination Planning | 300 | 0 | 20 |  | Keep + expand next | P2 |
| `business-class-flights-to-japan` | Destination Planning | 479 | 2 | 6 | yes | Keep + improved (2026-11-20) | done |
| `business-class-flights-to-dubai` | Destination Planning | 291 | 0 | 5 |  | Keep + expand next | P2 |
| `how-to-reduce-jet-lag-business-travel` | Practical Travel | 314 | 2 | 8 |  | Keep + expand next | P2 |
| `business-travel-packing-guide-long-haul` | Practical Travel | 467 | 1 | 4 | yes | Keep + improved (2026-11-20) | done |
| `planning-a-comfortable-multi-city-business-trip` | Practical Travel | 448 | 3 | 9 | yes | Keep + improved (2026-11-20) | done |
| `business-class-etiquette-guide` | Business Travel Tips | 420 | 0 | 2 |  | Keep | P3 |
| `redeeming-miles-points-business-class` | Business Class Guides | 369 | 0 | 1 |  | Keep | P3 |
| `solo-business-travel-tips` | Practical Travel | 339 | 0 | 1 |  | Keep + expand next | P2 |
| `business-class-meal-service-guide` | Airline / Cabin Education | 332 | 0 | 2 |  | Keep + expand next | P2 |
| `how-business-class-fare-classes-work` | Business Class Guides | 303 | 0 | 2 |  | Keep + expand next | P2 |
| `traveling-with-family-business-class` | Practical Travel | 333 | 0 | 1 |  | Keep + expand next | P2 |
| `business-class-flights-to-south-america` | Destination Planning | 313 | 0 | 3 |  | Keep + expand next | P2 |
| `business-class-flights-to-africa` | Destination Planning | 318 | 0 | 3 |  | Keep + expand next | P2 |
| `best-long-haul-business-class-routes-from-us` | Business Class Guides | 341 | 0 | 2 |  | Keep | P3 |
| `handling-flight-delays-cancellations-business-class` | Practical Travel | 335 | 0 | 2 |  | Keep + expand next | P2 |
| `premium-economy-vs-business-class` | Choosing Your Flight | 321 | 0 | 2 |  | Keep + expand next | P2 |

Editorial work still recommended for the remaining short articles (each is accurate today; none was rewritten because rewriting for its own sake is what the brief warns against): add the practical "how to check" sections and FAQs used in this pass; destination-planning articles (`business-class-flights-to-dubai`, `-to-the-middle-east`, `-to-asia-planning`, `-to-south-america`, `-to-africa`) would benefit most from verified airport and routing facts with sources and dates, which need research per region.

Claims to fact-check before anything is expanded further (existing text, not changed here): flight-time ranges in `business-class-flights-to-japan` ("typically 11-13 hours"), the "around 32 kg per checked bag" figure in the baggage article (airline-specific, hedged but unsourced), and fare ranges shown on destination pages (they are explicitly indicative, editorial estimates).

## 3. Destination audit (171 pages)

Findings (computed from the data, not estimated): 171 destinations; **97** use the shared routing paragraphs for BOTH "flying from the United States" and "what to expect" (the page then shows one shared note instead of repeating them); **97** have an overview that only repeats the tagline plus two bullets (the page hides it); unique data text per page after removing the shared paragraphs: min 74, median 93, max 426 words; FAQs: 97 pages have none, 72 have one; **9 have verified airport-to-city information**; near-duplicate similarity (5-word shingles) median 0.216, highest 0.584 (timisoara / bucharest, Romanian cities).

**The template is not producing duplicates of the harmful kind** (primary content is unique per page and the shared paragraphs are collapsed), **but the unique part is short.** The only honest way to make a destination page more useful and more distinct is to add *verified, city-specific facts*: airport-to-city access (done for 9), the airport's own facts, entry rules (not our remit), and routing that can be sourced. Rewording paragraphs to look different would be the "change only the city name" practice the brief rules out, so it was not done.

Priority used: **P1** = featured on the site (commercial role); **P2** = named in the Search Console lists (Google already discovered or crawled it); **P3** = the rest. The recommended work is identical for all: add verified airport access with sources (the data model, template and tests already support it), then city-specific FAQs only where an official source supports the answer.

| Destination | Country | URL | Unique data words | FAQs | Routing text | Verified airport access | Incoming links | Indexable | Canonical | In sitemap | Recommended improvement | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Cape Town | South Africa | `/destinations/africa/south-africa/cape-town` | 194 | 1 | own routing text | no | 222 | yes | self | yes | add verified airport access (primary sources) | P1 |
| Lagos | Nigeria | `/destinations/africa/nigeria/lagos` | 166 | 1 | own routing text | no | 6 | yes | self | yes | add verified airport access (primary sources) | P1 |
| Bengaluru | India | `/destinations/asia/india/bengaluru` | 170 | 1 | own routing text | no | 5 | yes | self | yes | add verified airport access (primary sources) | P1 |
| Delhi | India | `/destinations/asia/india/delhi` | 171 | 1 | own routing text | no | 6 | yes | self | yes | add verified airport access (primary sources) | P1 |
| Mumbai | India | `/destinations/asia/india/mumbai` | 180 | 1 | own routing text | no | 6 | yes | self | yes | add verified airport access (primary sources) | P1 |
| Singapore | Singapore | `/destinations/asia/singapore/singapore` | 257 | 1 | own routing text | yes (2026-11-20) | 222 | yes | self | yes | verified access present; add city-specific FAQ if sourced | P1 |
| Tokyo | Japan | `/destinations/asia/japan/tokyo` | 180 | 1 | own routing text | no | 222 | yes | self | yes | add verified airport access (primary sources) | P1 |
| Barcelona | Spain | `/destinations/europe/spain/barcelona` | 177 | 1 | own routing text | no | 222 | yes | self | yes | add verified airport access (primary sources) | P1 |
| Copenhagen | Denmark | `/destinations/europe/denmark/copenhagen` | 156 | 1 | own routing text | no | 222 | yes | self | yes | add verified airport access (primary sources) | P1 |
| Istanbul | Turkey | `/destinations/europe/turkey/istanbul` | 194 | 1 | own routing text | no | 222 | yes | self | yes | add verified airport access (primary sources) | P1 |
| London | United Kingdom | `/destinations/europe/united-kingdom/london` | 291 | 2 | own routing text | no | 222 | yes | self | yes | add verified airport access (primary sources) | P1 |
| Paris | France | `/destinations/europe/france/paris` | 218 | 1 | own routing text | no | 222 | yes | self | yes | add verified airport access (primary sources) | P1 |
| Dubai | United Arab Emirates | `/destinations/middle-east/uae/dubai` | 184 | 1 | own routing text | no | 222 | yes | self | yes | add verified airport access (primary sources) | P1 |
| Sydney | Australia | `/destinations/oceania/australia/sydney` | 196 | 1 | own routing text | no | 222 | yes | self | yes | add verified airport access (primary sources) | P1 |
| Abidjan | Ivory Coast | `/destinations/africa/ivory-coast/abidjan` | 89 | 0 | shared routing note | no | 6 | yes | self | yes | add verified airport access (primary sources) | P2 |
| Abuja | Nigeria | `/destinations/africa/nigeria/abuja` | 89 | 0 | shared routing note | no | 7 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Accra | Ghana | `/destinations/africa/ghana/accra` | 161 | 1 | own routing text | no | 6 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Addis Ababa | Ethiopia | `/destinations/africa/ethiopia/addis-ababa` | 186 | 1 | own routing text | no | 6 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Cairo | Egypt | `/destinations/africa/egypt/cairo` | 153 | 1 | own routing text | no | 222 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Casablanca | Morocco | `/destinations/africa/morocco/casablanca` | 189 | 1 | own routing text | no | 9 | yes | self | yes | add verified airport access (primary sources) | P2 |
| Dakar | Senegal | `/destinations/africa/senegal/dakar` | 85 | 0 | shared routing note | no | 6 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Durban | South Africa | `/destinations/africa/south-africa/durban` | 89 | 0 | shared routing note | no | 7 | yes | self | yes | add verified airport access (primary sources) | P2 |
| Entebbe | Uganda | `/destinations/africa/uganda/entebbe` | 87 | 0 | shared routing note | no | 6 | yes | self | yes | add verified airport access (primary sources) | P2 |
| Johannesburg | South Africa | `/destinations/africa/south-africa/johannesburg` | 148 | 1 | own routing text | no | 222 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Luanda | Angola | `/destinations/africa/angola/luanda` | 87 | 0 | shared routing note | no | 4 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Marrakech | Morocco | `/destinations/africa/morocco/marrakech` | 177 | 1 | own routing text | no | 222 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Mauritius | Mauritius | `/destinations/africa/mauritius/mauritius` | 178 | 1 | own routing text | no | 6 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Nairobi | Kenya | `/destinations/africa/kenya/nairobi` | 167 | 1 | own routing text | no | 222 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Sharm El Sheikh | Egypt | `/destinations/africa/egypt/sharm-el-sheikh` | 94 | 0 | shared routing note | no | 6 | yes | self | yes | add verified airport access (primary sources) | P2 |
| Zanzibar | Tanzania | `/destinations/africa/tanzania/zanzibar` | 179 | 1 | own routing text | no | 6 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Ahmedabad | India | `/destinations/asia/india/ahmedabad` | 159 | 1 | own routing text | no | 8 | yes | self | yes | add verified airport access (primary sources) | P2 |
| Bali | Indonesia | `/destinations/asia/indonesia/bali` | 189 | 1 | own routing text | no | 7 | yes | self | yes | add verified airport access (primary sources) | P2 |
| Bangkok | Thailand | `/destinations/asia/thailand/bangkok` | 173 | 1 | own routing text | no | 222 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Beijing | China | `/destinations/asia/china/beijing` | 178 | 1 | own routing text | no | 9 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Busan | South Korea | `/destinations/asia/south-korea/busan` | 87 | 0 | shared routing note | no | 7 | yes | self | yes | add verified airport access (primary sources) | P2 |
| Cebu | Philippines | `/destinations/asia/philippines/cebu` | 96 | 0 | shared routing note | no | 8 | yes | self | yes | add verified airport access (primary sources) | P2 |
| Chennai | India | `/destinations/asia/india/chennai` | 84 | 0 | shared routing note | no | 5 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Chiang Mai | Thailand | `/destinations/asia/thailand/chiang-mai` | 84 | 0 | shared routing note | no | 7 | yes | self | yes | add verified airport access (primary sources) | P2 |
| Clark / Angeles City | Philippines | `/destinations/asia/philippines/clark-angeles-city` | 94 | 0 | shared routing note | no | 7 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Da Nang | Vietnam | `/destinations/asia/vietnam/da-nang` | 86 | 0 | shared routing note | no | 7 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Dhaka | Bangladesh | `/destinations/asia/bangladesh/dhaka` | 76 | 0 | shared routing note | no | 5 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Fukuoka | Japan | `/destinations/asia/japan/fukuoka` | 81 | 0 | shared routing note | no | 7 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Guangzhou | China | `/destinations/asia/china/guangzhou` | 91 | 0 | shared routing note | no | 6 | yes | self | yes | add verified airport access (primary sources) | P2 |
| Hanoi | Vietnam | `/destinations/asia/vietnam/hanoi` | 80 | 0 | shared routing note | no | 7 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Ho Chi Minh City | Vietnam | `/destinations/asia/vietnam/ho-chi-minh-city` | 172 | 1 | own routing text | no | 4 | yes | self | yes | add verified airport access (primary sources) | P2 |
| Hong Kong | Hong Kong | `/destinations/asia/hong-kong/hong-kong` | 153 | 1 | own routing text | no | 222 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Hyderabad | India | `/destinations/asia/india/hyderabad` | 172 | 1 | own routing text | no | 6 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Islamabad | Pakistan | `/destinations/asia/pakistan/islamabad` | 91 | 0 | shared routing note | no | 5 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Jakarta | Indonesia | `/destinations/asia/indonesia/jakarta` | 170 | 1 | own routing text | no | 6 | yes | self | yes | add verified airport access (primary sources) | P2 |
| Karachi | Pakistan | `/destinations/asia/pakistan/karachi` | 79 | 0 | shared routing note | no | 5 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Kathmandu | Nepal | `/destinations/asia/nepal/kathmandu` | 90 | 0 | shared routing note | no | 6 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Kolkata | India | `/destinations/asia/india/kolkata` | 85 | 0 | shared routing note | no | 6 | yes | self | yes | add verified airport access (primary sources) | P2 |
| Kuala Lumpur | Malaysia | `/destinations/asia/malaysia/kuala-lumpur` | 159 | 1 | own routing text | no | 5 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Manila | Philippines | `/destinations/asia/philippines/manila` | 88 | 0 | shared routing note | no | 6 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Nanjing | China | `/destinations/asia/china/nanjing` | 87 | 0 | shared routing note | no | 5 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Osaka | Japan | `/destinations/asia/japan/osaka` | 78 | 0 | shared routing note | no | 7 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Phuket | Thailand | `/destinations/asia/thailand/phuket` | 173 | 1 | own routing text | no | 6 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Seoul | South Korea | `/destinations/asia/south-korea/seoul` | 146 | 1 | own routing text | no | 222 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Shanghai | China | `/destinations/asia/china/shanghai` | 153 | 1 | own routing text | no | 6 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Wuhan | China | `/destinations/asia/china/wuhan` | 82 | 0 | shared routing note | no | 6 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Amsterdam | Netherlands | `/destinations/europe/netherlands/amsterdam` | 175 | 1 | own routing text | no | 7 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Ankara | Turkey | `/destinations/europe/turkey/ankara` | 82 | 0 | shared routing note | no | 7 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Antalya | Turkey | `/destinations/europe/turkey/antalya` | 83 | 0 | shared routing note | no | 7 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Bari | Italy | `/destinations/europe/italy/bari` | 90 | 0 | shared routing note | no | 8 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Basel | Switzerland | `/destinations/europe/switzerland/basel` | 93 | 0 | shared routing note | no | 6 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Belgrade | Serbia | `/destinations/europe/serbia/belgrade` | 81 | 0 | shared routing note | no | 4 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Berlin | Germany | `/destinations/europe/germany/berlin` | 90 | 0 | shared routing note | no | 8 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Bilbao | Spain | `/destinations/europe/spain/bilbao` | 83 | 0 | shared routing note | no | 6 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Bologna | Italy | `/destinations/europe/italy/bologna` | 87 | 0 | shared routing note | no | 5 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Bordeaux | France | `/destinations/europe/france/bordeaux` | 83 | 0 | shared routing note | no | 8 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Bratislava | Slovakia | `/destinations/europe/slovakia/bratislava` | 81 | 0 | shared routing note | no | 5 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Brussels | Belgium | `/destinations/europe/belgium/brussels` | 214 | 1 | own routing text | yes (2026-10-16) | 5 | yes | self | yes | verified access present; add city-specific FAQ if sourced | P3 |
| Bucharest | Romania | `/destinations/europe/romania/bucharest` | 84 | 0 | shared routing note | no | 7 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Budapest | Hungary | `/destinations/europe/hungary/budapest` | 240 | 1 | own routing text | yes (2026-11-20) | 6 | yes | self | yes | verified access present; add city-specific FAQ if sourced | P2 |
| Catania | Italy | `/destinations/europe/italy/catania` | 86 | 0 | shared routing note | no | 5 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Chișinău | Moldova | `/destinations/europe/moldova/chisinau` | 82 | 0 | shared routing note | no | 7 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Cluj-Napoca | Romania | `/destinations/europe/romania/cluj-napoca` | 84 | 0 | shared routing note | no | 7 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Corfu | Greece | `/destinations/europe/greece/corfu` | 79 | 0 | shared routing note | no | 8 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Dubrovnik | Croatia | `/destinations/europe/croatia/dubrovnik` | 80 | 0 | shared routing note | no | 8 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Düsseldorf | Germany | `/destinations/europe/germany/dusseldorf` | 95 | 0 | shared routing note | no | 7 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Edinburgh | United Kingdom | `/destinations/europe/united-kingdom/edinburgh` | 252 | 1 | own routing text | yes (2026-11-20) | 7 | yes | self | yes | verified access present; add city-specific FAQ if sourced | P2 |
| Faro | Portugal | `/destinations/europe/portugal/faro` | 97 | 0 | shared routing note | no | 7 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Florence | Italy | `/destinations/europe/italy/florence` | 86 | 0 | shared routing note | no | 6 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Frankfurt | Germany | `/destinations/europe/germany/frankfurt` | 246 | 1 | own routing text | yes (2026-10-16) | 4 | yes | self | yes | verified access present; add city-specific FAQ if sourced | P3 |
| Geneva | Switzerland | `/destinations/europe/switzerland/geneva` | 87 | 0 | shared routing note | no | 6 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Genoa | Italy | `/destinations/europe/italy/genoa` | 87 | 0 | shared routing note | no | 6 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Gothenburg | Sweden | `/destinations/europe/sweden/gothenburg` | 80 | 0 | shared routing note | no | 7 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Gran Canaria | Spain | `/destinations/europe/spain/gran-canaria` | 87 | 0 | shared routing note | no | 6 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Hamburg | Germany | `/destinations/europe/germany/hamburg` | 86 | 0 | shared routing note | no | 5 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Hannover | Germany | `/destinations/europe/germany/hannover` | 82 | 0 | shared routing note | no | 6 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Helsinki | Finland | `/destinations/europe/finland/helsinki` | 174 | 1 | own routing text | no | 6 | yes | self | yes | add verified airport access (primary sources) | P2 |
| Heraklion | Greece | `/destinations/europe/greece/heraklion` | 76 | 0 | shared routing note | no | 7 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Krakow | Poland | `/destinations/europe/poland/krakow` | 84 | 0 | shared routing note | no | 7 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Larnaca | Cyprus | `/destinations/europe/cyprus/larnaca` | 80 | 0 | shared routing note | no | 6 | yes | self | yes | add verified airport access (primary sources) | P2 |
| Lisbon | Portugal | `/destinations/europe/portugal/lisbon` | 90 | 0 | shared routing note | no | 7 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Luxembourg City | Luxembourg | `/destinations/europe/luxembourg/luxembourg-city` | 128 | 0 | shared routing note | yes (2026-10-16) | 4 | yes | self | yes | verified access present; add city-specific FAQ if sourced | P3 |
| Lyon | France | `/destinations/europe/france/lyon` | 74 | 0 | shared routing note | no | 7 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Madrid | Spain | `/destinations/europe/spain/madrid` | 174 | 1 | own routing text | no | 222 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Malaga | Spain | `/destinations/europe/spain/malaga` | 92 | 0 | shared routing note | no | 6 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Marseille | France | `/destinations/europe/france/marseille` | 89 | 0 | shared routing note | no | 6 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Milan | Italy | `/destinations/europe/italy/milan` | 187 | 1 | own routing text | no | 222 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Moscow | Russia | `/destinations/europe/russia/moscow` | 193 | 1 | own routing text | no | 6 | yes | self | yes | add verified airport access (primary sources) | P2 |
| Munich | Germany | `/destinations/europe/germany/munich` | 227 | 1 | own routing text | yes (2026-11-20) | 6 | yes | self | yes | verified access present; add city-specific FAQ if sourced | P2 |
| Mykonos | Greece | `/destinations/europe/greece/mykonos` | 76 | 0 | shared routing note | no | 4 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Nantes | France | `/destinations/europe/france/nantes` | 84 | 0 | shared routing note | no | 6 | yes | self | yes | add verified airport access (primary sources) | P2 |
| Naples | Italy | `/destinations/europe/italy/naples` | 83 | 0 | shared routing note | no | 6 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Nice | France | `/destinations/europe/france/nice` | 93 | 0 | shared routing note | no | 6 | yes | self | yes | add verified airport access (primary sources) | P2 |
| Oslo | Norway | `/destinations/europe/norway/oslo` | 215 | 1 | own routing text | yes (2026-11-20) | 7 | yes | self | yes | verified access present; add city-specific FAQ if sourced | P2 |
| Palermo | Italy | `/destinations/europe/italy/palermo` | 77 | 0 | shared routing note | no | 6 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Palma de Mallorca | Spain | `/destinations/europe/spain/palma-de-mallorca` | 84 | 0 | shared routing note | no | 6 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Porto | Portugal | `/destinations/europe/portugal/porto` | 91 | 0 | shared routing note | no | 4 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Prague | Czech Republic | `/destinations/europe/czech-republic/prague` | 83 | 0 | shared routing note | no | 6 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Pristina | Kosovo | `/destinations/europe/kosovo/pristina` | 80 | 0 | shared routing note | no | 6 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Rhodes | Greece | `/destinations/europe/greece/rhodes` | 79 | 0 | shared routing note | no | 5 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Riga | Latvia | `/destinations/europe/latvia/riga` | 83 | 0 | shared routing note | no | 6 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Rome | Italy | `/destinations/europe/italy/rome` | 167 | 1 | own routing text | no | 222 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Rotterdam | Netherlands | `/destinations/europe/netherlands/rotterdam` | 89 | 0 | shared routing note | no | 6 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Saint Petersburg | Russia | `/destinations/europe/russia/saint-petersburg` | 90 | 0 | shared routing note | no | 6 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Salzburg | Austria | `/destinations/europe/austria/salzburg` | 86 | 0 | shared routing note | no | 6 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Santorini | Greece | `/destinations/europe/greece/santorini` | 85 | 0 | shared routing note | no | 6 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Sarajevo | Bosnia and Herzegovina | `/destinations/europe/bosnia-and-herzegovina/sarajevo` | 89 | 0 | shared routing note | no | 6 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Seville | Spain | `/destinations/europe/spain/seville` | 78 | 0 | shared routing note | no | 6 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Skopje | North Macedonia | `/destinations/europe/north-macedonia/skopje` | 77 | 0 | shared routing note | no | 6 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Split | Croatia | `/destinations/europe/croatia/split` | 83 | 0 | shared routing note | no | 6 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Stockholm | Sweden | `/destinations/europe/sweden/stockholm` | 157 | 1 | own routing text | no | 6 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Stuttgart | Germany | `/destinations/europe/germany/stuttgart` | 92 | 0 | shared routing note | no | 6 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Tallinn | Estonia | `/destinations/europe/estonia/tallinn` | 78 | 0 | shared routing note | no | 5 | yes | self | yes | add verified airport access (primary sources) | P2 |
| Tenerife | Spain | `/destinations/europe/spain/tenerife` | 95 | 0 | shared routing note | no | 6 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Thessaloniki | Greece | `/destinations/europe/greece/thessaloniki` | 86 | 0 | shared routing note | no | 6 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Timișoara | Romania | `/destinations/europe/romania/timisoara` | 80 | 0 | shared routing note | no | 4 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Tirana | Albania | `/destinations/europe/albania/tirana` | 78 | 0 | shared routing note | no | 4 | yes | self | yes | add verified airport access (primary sources) | P2 |
| Toulouse | France | `/destinations/europe/france/toulouse` | 83 | 0 | shared routing note | no | 6 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Trabzon | Turkey | `/destinations/europe/turkey/trabzon` | 85 | 0 | shared routing note | no | 5 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Trieste | Italy | `/destinations/europe/italy/trieste` | 88 | 0 | shared routing note | no | 6 | yes | self | yes | add verified airport access (primary sources) | P2 |
| Tromsø | Norway | `/destinations/europe/norway/tromso` | 108 | 0 | shared routing note | no | 6 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Valencia | Spain | `/destinations/europe/spain/valencia` | 86 | 0 | shared routing note | no | 6 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Valletta | Malta | `/destinations/europe/malta/valletta` | 89 | 0 | shared routing note | no | 5 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Venice | Italy | `/destinations/europe/italy/venice` | 82 | 0 | shared routing note | no | 6 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Vienna | Austria | `/destinations/europe/austria/vienna` | 165 | 1 | own routing text | no | 6 | yes | self | yes | add verified airport access (primary sources) | P2 |
| Warsaw | Poland | `/destinations/europe/poland/warsaw` | 81 | 0 | shared routing note | no | 7 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Wroclaw | Poland | `/destinations/europe/poland/wroclaw` | 75 | 0 | shared routing note | no | 6 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Zagreb | Croatia | `/destinations/europe/croatia/zagreb` | 79 | 0 | shared routing note | no | 6 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Zurich | Switzerland | `/destinations/europe/switzerland/zurich` | 236 | 1 | own routing text | yes (2026-10-16) | 6 | yes | self | yes | verified access present; add city-specific FAQ if sourced | P2 |
| Abu Dhabi | United Arab Emirates | `/destinations/middle-east/uae/abu-dhabi` | 173 | 1 | own routing text | no | 222 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Amman | Jordan | `/destinations/middle-east/jordan/amman` | 177 | 1 | own routing text | no | 6 | yes | self | yes | add verified airport access (primary sources) | P2 |
| Baku | Azerbaijan | `/destinations/middle-east/azerbaijan/baku` | 96 | 0 | shared routing note | no | 5 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Batumi | Georgia | `/destinations/middle-east/georgia/batumi` | 426 | 3 | own routing text | no | 6 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Beirut | Lebanon | `/destinations/middle-east/lebanon/beirut` | 86 | 0 | shared routing note | no | 6 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Doha | Qatar | `/destinations/middle-east/qatar/doha` | 167 | 1 | own routing text | no | 222 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Jeddah | Saudi Arabia | `/destinations/middle-east/saudi-arabia/jeddah` | 173 | 1 | own routing text | no | 222 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Kuwait City | Kuwait | `/destinations/middle-east/kuwait/kuwait-city` | 170 | 1 | own routing text | no | 6 | yes | self | yes | add verified airport access (primary sources) | P2 |
| Manama | Bahrain | `/destinations/middle-east/bahrain/manama` | 159 | 1 | own routing text | no | 6 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Muscat | Oman | `/destinations/middle-east/oman/muscat` | 172 | 1 | own routing text | no | 5 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Riyadh | Saudi Arabia | `/destinations/middle-east/saudi-arabia/riyadh` | 177 | 1 | own routing text | no | 222 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Tbilisi | Georgia | `/destinations/middle-east/georgia/tbilisi` | 85 | 0 | shared routing note | no | 6 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Yerevan | Armenia | `/destinations/middle-east/armenia/yerevan` | 94 | 0 | shared routing note | no | 6 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Mexico City | Mexico | `/destinations/north-america/mexico/mexico-city` | 161 | 1 | own routing text | no | 222 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Toronto | Canada | `/destinations/north-america/canada/toronto` | 189 | 1 | own routing text | no | 222 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Adelaide | Australia | `/destinations/oceania/australia/adelaide` | 157 | 1 | own routing text | no | 8 | yes | self | yes | add verified airport access (primary sources) | P2 |
| Auckland | New Zealand | `/destinations/oceania/new-zealand/auckland` | 177 | 1 | own routing text | no | 222 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Brisbane | Australia | `/destinations/oceania/australia/brisbane` | 166 | 1 | own routing text | no | 222 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Melbourne | Australia | `/destinations/oceania/australia/melbourne` | 192 | 1 | own routing text | no | 222 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Nadi | Fiji | `/destinations/oceania/fiji/nadi` | 186 | 1 | own routing text | no | 6 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Papeete | French Polynesia | `/destinations/oceania/french-polynesia/papeete` | 192 | 1 | own routing text | no | 6 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Perth | Australia | `/destinations/oceania/australia/perth` | 177 | 1 | own routing text | no | 222 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Queenstown | New Zealand | `/destinations/oceania/new-zealand/queenstown` | 177 | 1 | own routing text | no | 5 | yes | self | yes | add verified airport access (primary sources) | P2 |
| Bogotá | Colombia | `/destinations/south-america/colombia/bogota` | 155 | 1 | own routing text | no | 222 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Buenos Aires | Argentina | `/destinations/south-america/argentina/buenos-aires` | 149 | 1 | own routing text | no | 222 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Lima | Peru | `/destinations/south-america/peru/lima` | 165 | 1 | own routing text | no | 222 | yes | self | yes | add verified airport access (primary sources) | P3 |
| Santiago | Chile | `/destinations/south-america/chile/santiago` | 161 | 1 | own routing text | no | 222 | yes | self | yes | add verified airport access (primary sources) | P3 |
| São Paulo | Brazil | `/destinations/south-america/brazil/sao-paulo` | 162 | 1 | own routing text | no | 222 | yes | self | yes | add verified airport access (primary sources) | P3 |

Prioritisation by external signals (search demand, existing traffic, backlinks, Search Console performance) **was not possible**: none of that data was provided or accessible. When Search Console performance data is available, re-rank P2/P3 by impressions and clicks.

## 4. Search intent and differentiation

| Page type | Primary topic and intent | Unique value | Pages it could compete with | How it is separated |
|---|---|---|---|---|
| Home, `/flights` | Commercial: request a business-class quote | Personal specialist follow-up; no live inventory is claimed | `/business-class` | `/flights` is the form; `/business-class` explains the product |
| Region hubs (new) | Navigational/informational: which destinations in a region, how flights from the U.S. usually work | Country-by-country listing with links; honest regional context | The regional planning article (e.g. Africa) | Hub titles say "Business-Class Destinations in X"; the articles are planning guides; the duplicate title found for Africa was fixed |
| Destination pages | Informational + commercial: business class to this city | Airport, best time, carriers, verified access (9 so far), FAQ, quote CTA | `/flights?to=XXX` (the prefill URL) | Query URLs canonicalise to `/flights`; the destination page is the one meant to rank |
| Articles | One question each | Practical checklists, FAQs, how-to-check guidance | Other articles in the same cluster | See the seat-design cluster note above |

## 5. Images and media

Hero and card images come from Unsplash (placeholders per the code comment in `next.config.ts`); alt text is the destination or article title; decorative hero backgrounds correctly use `alt=""` (three pages show this in the inventory audit, which counts them as "without alt"; they are decorative). Image licensing and the Unsplash placeholder status were **not** changed or verified here: replacing them with licensed or owned photography is an owner decision. Next's image optimiser serves AVIF/WebP at the requested sizes (measured: a 1600 px source delivered as 24 KB at 384 px and 134 KB at 1080 px, and the 358 KB logo PNG as 12 KB) - but only when sharp's libvips libraries are present, which the Dockerfile ensures.
