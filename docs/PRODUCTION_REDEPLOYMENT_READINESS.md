# Production redeployment readiness - release candidate of 2026-11-20

**Decision: READY FOR PRODUCTION REDEPLOYMENT PREPARATION. NOT READY FOR CONTROLLED PRODUCTION REDEPLOYMENT.** Production deployment is **not authorized** by this document or by anything done in this task; it needs your explicit approval after the external gates in section 3 are closed.

Why not "ready for controlled redeployment": the Docker rehearsal has never run (Docker is not installed here), the live VPS state and the live CRM version are unverified, no real-PostgreSQL run of the CRM replay store exists, live CRM authentication has not been exercised, real-user Core Web Vitals do not exist, the legal wording is unreviewed, and the website depends on a CRM change that is not deployed. None of these can be closed from this machine. What **is** closed in code: the Next.js advisory, the dependency audit, the tablet test, HSTS over-reach, the extra browser-storage key, and a small layout shift found during final verification.

Scope: `F:\Claude Workspace\Travel Agency Website-updated`, branch `review/website-parity-and-contact-ip-2026-11-15`. The work of the last four tasks plus this task is committed in logical groups on that same branch and pushed without force (commit list and remote verification: the final report; no `main`, no merge, no new branch). `docs/workspace-archive/` and `docs/brand-assets/` are deliberately **not** committed. The CRM repository was not touched.

## 1. Build and test results (final build: Next.js 16.4.6, production standalone build)

All runs are local, on the final production build, against stand-in CRMs only. Skipped, blocked and not-run items are never counted as passed. Every run below was repeated after the last source change (the layout-shift fix, section 2); earlier results were not reused.

| Check | Result |
|---|---|
| `npm audit` (whole tree) | **0 vulnerabilities** (was 1 moderate advisory group in `next` plus 7 dev-tooling findings) |
| Website `tsc --noEmit` and `eslint` | clean |
| Production build (`NEXT_OUTPUT=standalone next build`) | succeeded (225 pages incl. 5 region hubs), no security notice |
| `validate-seo` over the sitemap | **223 routes, 0 failures** |
| SEO inventory audit (against the local build) | 0 non-200, 0 duplicate titles / descriptions / H1s, 0 broken internal links, max depth 2, every route reachable from home, canonical and JSON-LD valid; 3 "problems" are the decorative `alt=""` background photo on `/`, `/about`, `/business-class` (correct for a decorative image, counted by the script as a missing alt) |
| Browser projects: Desktop Chrome + Mobile 320 / 375 / 390 | **2,431 passed, 0 failed, 8 skipped, 5 flaky** (every flaky test passed on its retry; first attempts took 10-37 s on tests that normally take 2 s: cold loading of the airport data under three parallel browsers on an 8 GB machine, a pre-existing documented contention in `playwright.config.ts`; the one that looped over every destination page now has a 120 s limit). The changed header/SEO specs were re-run with retries off on Desktop and Mobile 390: 112 passed |
| Tablet 768x1024 (temporary config, removed after use) | **608 passed, 0 failed, 2 skipped, 1 flaky** (a 30 s stall that passed on retry). The previously failing "floating call button steps aside while a popup is open" test **passes** (test corrected, not skipped or weakened: at 768 px the form's own submit button is already in the first screen and the pill hides for it by design, so the popup-rule test now uses a viewport short enough for the submit button to be out of view, and a new test asserts the submit-button rule itself: hidden and not overlapping at 768x1100, visible at 768x640) |
| Infrastructure project (standalone servers, stand-in CRM, raw HTTP; `--no-deps --workers=1`) | **199 passed, 0 failed, 6 skipped** (the opt-in live-CRM contract tests: NOT RUN). The first run had one server start exceed its 30 s hook limit, which left that spec's other 37 tests not run; that spec alone was re-run: 38 of 38 passed |
| CRM tests | **not re-run** (the CRM was not touched); last results: 4,499 passed, 0 failed, 1,089 skipped (need PostgreSQL) |
| Docker image build and rehearsal | **BLOCKED / NOT RUN** (no Docker, WSL or Podman) |
| PostgreSQL-backed tests | **BLOCKED / NOT RUN** (no approved disposable database) |
| Live CRM authentication | **NOT RUN** (post-deployment, needs your approval) |
| Lighthouse | **NOT RUN** (not installed; not installed without your approval); lab Web Vitals emulation used instead (`SEO_TECHNICAL_VERIFICATION.md`, section 10) |
| Core Web Vitals from real users | **NOT AVAILABLE** |

**Skipped-test register (all 16 are conditional skips written in the tests, none was added to hide a failure):** browser projects, 8 - `accessibility.spec.ts` "mobile menu" skips on Desktop (no hamburger there; runs on the three mobile projects); `date-range.spec.ts` "first tap previews the range" skips on the three mobile projects (touch behaviour is checked once, on Desktop); `design-integrity.spec.ts` "odd last card" skips on Desktop (three-column layout from lg; runs below it); `redesign.spec.ts` "desktop mega menu" skips on the three mobile projects (runs on Desktop). Tablet, 2 - the same `date-range` and mega-menu conditions. Infrastructure, 6 - `crm-contract-live.spec.ts`, opt-in: it needs `CRM_CONTRACT_URL` and `CRM_CONTRACT_KEY` pointing at a **non-production** CRM, so it was not run.

## 2. What changed in this task

* **Next.js advisory resolved.** `next` and `eslint-config-next` 16.4.2 -> **16.4.6** (newest 16.x, includes the 16.4.5 fix for GHSA-mfr8-8qww-v76h, GHSA-vc7v-qv4w-wrv8, GHSA-7qx7-33qx-rqx2, GHSA-f3mh-rxg3-f5g2; same major). A non-forced `npm audit fix` also cleared the dev-tooling findings. `npm audit`: 0. Details: `SECURITY_REVIEW_AND_REMAINING_LIMITATIONS.md`.
* **HSTS reduced** to `max-age=63072000` (no `includeSubDomains`, no `preload`: nothing here can confirm every subdomain is HTTPS-only or that you want the domain on the preload list). `Permissions-Policy` still has `geolocation=(self)`.
* **Browser storage minimised:** the `sessionStorage` key `bft-geolocation-declined` was removed (the browser remembers a refusal and reports it through the Permissions API). The site now stores only the cookie-preference record in `localStorage` and sets no cookie, which makes the Cookie Policy's wording accurate again.
* **Layout shift fixed (found by the final stress run):** between about 768 and 1023 px the "Use my location" button wrapped onto a second line about 300 ms after load and pushed the form down 16 px (layout shift 0.0064, far below the 0.1 limit but real). The button's place is now reserved with an invisible, accessibility-hidden placeholder: 0 of 25 probe runs shift afterwards; nothing changes at widths where it fits on one line.
* **Tests:** new `tests/security-headers.spec.ts`; refusal test rewritten for the storage change; tablet test corrected; an ordering race in a location test made deterministic (the mocked answer is now held until the destination is chosen, not timed); the destination-loop SEO test given a realistic timeout. One recorded finding: the app's own 308 redirects carry no protective headers (Next.js answers redirects before applying `headers()`); a redirect has no body to exploit and the test now asserts only its target, no cookie and no framework banner.
* **Documents:** `SECURITY_REVIEW_AND_REMAINING_LIMITATIONS.md` (new), this file, the runbook addendum (sections A-I: reproducible verification, order of operations, variable names, exact Cloudflare instructions with verification commands, live-CRM test procedure, the CRM API contract, health/logging, rollback), `SEO_TECHNICAL_VERIFICATION.md` (post-upgrade section).
* Carried in the same release from the earlier tasks: signing v2, visitor IP/location handling, date/email/phone validation, the CRM per-visitor flight limiter dependency, SEO recovery (region hubs, redirects, 10 expanded articles, 5 verified-access destinations, sitemap 223).

## 3. Blockers and who must act

| # | Item | Status | Needs |
|---|---|---|---|
| 1 | **Docker rehearsal** `bash deploy/rehearsal/run.sh` | **Never run: Docker, WSL and Podman are not installed.** The script is isolated (own compose project `bft-rehearsal`, internal networks, mock CRM, throw-away Postgres, no production network, no published ports, no persistent data) and syntax-checked with `bash -n`. | A Docker-capable machine (Docker with the compose plugin, about 3 GB free memory for the image build, no host ports) and your approval. Only "ALL CHECKS PASSED" counts as a pass. |
| 2 | **PostgreSQL-backed tests** | **Not run.** No disposable PostgreSQL or `DATABASE_URL` exists here; nothing was installed. The website has no database; these tests belong to the CRM. | An approved disposable PostgreSQL (never production, not a shared host) and your go-ahead. |
| 3 | **Live CRM authentication** | **Not run, by design** (a live POST creates a real lead). | Post-deployment procedure in runbook section F, with your approval of one marked test submission. |
| 4 | **CRM deployment order** | The website's flight requests need the CRM's signing v2 and its per-visitor flight limiter (CRM source uncommitted). | **CRM first, then the website**; confirm the CRM build before the website goes out (section 5). |
| 5 | **Cloudflare settings** | Not inspected or changed. | Your approval to apply (runbook section E): one-hop apex redirect; Email Address Obfuscation (optional, analysis in the security review, section 9); "Add visitor location headers". |
| 6 | **Legal review** | Privacy, Cookie Policy, Terms and the location paragraph are unreviewed (section 8). | Counsel. Not claimed as reviewed. |
| 7 | **Real-user performance** | Lab emulation only; article, destination and `/destinations` LCP above 2.5 s under a harsh emulation; no safe blind fix was identified. | Lighthouse/PageSpeed on the deployed site and CrUX/Search Console field data; then decide. |
| 8 | **Live VPS state** | Not inspected. | Runbook step 0 (read-only) records the deployed branch/commit, networks and variable names. |

**Resolved in this task (no longer blockers):** the Next.js advisory (item 7 of the previous revision), the tablet test (item 9), and the HSTS/storage items in the legal checklist.

## 4. Environment variables (names only; values are never in the repository)

Required by the website container: `CRM_API_URL` (the CRM's private network address), `CRM_API_KEY`, `CRM_COMPANY_ID`; recommended: `LEAD_INGEST_SECRET` (>= 32 characters, identical on the CRM; once the CRM has one, unsigned requests are refused), the Gmail sender address and app-password variables for the internal notification. Fixed by `compose.yaml`: `TRUSTED_PROXY=cloudflare`. **No `DATABASE_*` variable is needed or accepted.** `deploy/preflight.sh` validates all of this and refuses a mismatch.

## 5. CRM dependency checklist (verified from the website source; nothing contacted)

The full contract (endpoints, authentication, signature v2, the 120 s / 30 s window, one-time nonce, the 20-per-15-minutes visitor limit, 10 s timeout, 3 attempts with the same Idempotency-Key, and how each response is handled) is in the runbook, section G. Before deploying the website, confirm on the CRM host (read-only): the CRM build contains the signing-v2 verifier and the flight-route limiter; `LEAD_INGEST_SECRET` is set identically on both sides; the server clocks agree (NTP); the website can reach `compass-crm` on the private network and cannot reach the database. The visitor never loses input on any failure; nothing sensitive reaches the visitor or the logs (tested).

## 6. Post-deployment verification plan (live CRM; needs your approval for the one submission)

1. Health: `/api/health` 200 through the tunnel; container healthy; no published port.
2. Read-only: `robots.txt` (with `Disallow: /cdn-cgi/`), sitemap (223 URLs), `/terms` 308, apex redirect (one hop once the Cloudflare rule exists), `/destinations/europe` 200, `/offers` 404, `/api/visitor-hint` `private, no-store` with no IP in the body, `Permissions-Policy` containing `geolocation=(self)`, `Strict-Transport-Security: max-age=63072000` without `includeSubDomains`/`preload`.
3. Runbook section F: one flight request, one contact message and one newsletter sign-up with a clearly fake identity, then the CRM owner deletes the three records. Do **not** probe the rate limit and do **not** stop the CRM in production.
4. Search Console steps: `SEO_TECHNICAL_VERIFICATION.md`, section 11.

## 7. Cloudflare checklist

Exact steps, verification commands and rollback for each change are in runbook section E (nothing was changed): E1 one-hop apex redirect rule; E2 Email Address Obfuscation (optional: low privacy benefit because the address is already in the structured data, cost is visitors without JavaScript and a recurring Search Console URL; not changed); E3 "Add visitor location headers" (needed only for the airport suggestion; country and phone prefix need only the free `CF-IPCountry` header). Also confirm "Always Use HTTPS" is on, the tunnel's public hostname points at `http://bft-web:3000`, and no cache rule caches `/api/visitor-hint`.

## 8. Privacy, Cookie Policy and Terms: consistency with the implementation, and the checklist for counsel

Reviewed against the code (no legal advice, no claim of compliance). Consistent: the approximate location is recorded with flight and contact submissions (true); the device location is used only in the browser and its coordinates are never sent (true, tested); no cookie is set (true); the only browser storage is the cookie-preference record in `localStorage` (true since this task removed the session-storage key); nothing optional loads. **For counsel:** (1) the new Privacy paragraph on location suggestions (its "Last updated" date was deliberately not changed); (2) whether the Cookie Policy should name the `localStorage` consent record (it says no browser storage is needed for the forms, which is accurate for the forms); (3) the `Permissions-Policy` change (`geolocation=(self)`); (4) the quote-button consent wording and the Terms (unchanged); (5) retention of CRM-held data (the website text states none, and none was invented); (6) that visitor IP and approximate location are signed to the CRM with each enquiry (lawful basis and disclosure wording). Nothing was rewritten beyond the one paragraph.

## 9. Rollback

Website only (the common case): `deploy/rollback.sh` re-runs the previous good `business-flights-web:<tag>` (`deploy.sh` tags `:previous` only from a healthy container); it never touches the CRM or its database. Rolling back **to the old database-backed release** needs the OLD compose file and `.env` (runbook section 8). Do not roll the CRM back below the signing-v2 build while the new website is live without testing the pair first. The SEO changes need no data rollback. Cloudflare changes are undone in reverse order (runbook section I).

## 10. Final safety confirmation

No production deployment; no production container restarted; no production database or CRM data touched; the CRM code and database were not modified; no Cloudflare or DNS setting changed; no real customer enquiry, e-mail or marketing message sent; the live site was read with public GET requests only; no production secret was read, printed or committed (pattern scan of the commit set clean); the original project folder was not modified; no unrelated project changed; no dependency was installed beyond the `next`/`eslint-config-next` patch upgrade and the non-forced `npm audit fix` of dev tooling; no `--force` audit fix; no force-push, no push to `main`, no new branch.
