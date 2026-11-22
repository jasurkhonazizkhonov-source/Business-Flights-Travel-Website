# Production redeployment readiness - release candidate (verified 2026-11-22)

**Decision: CONDITIONALLY READY FOR CONTROLLED PRODUCTION REDEPLOYMENT PREPARATION; NOT READY FOR PRODUCTION REDEPLOYMENT ITSELF.** Production deployment is **not authorized** by this document or by anything done in this task; it needs your explicit approval after the external gates in section 3 are closed. The code, the tests that can run on this machine, the dependency audit and the documentation are in a releasable state. The gates that remain cannot be closed from here: the Docker rehearsal, PostgreSQL-backed CRM tests, live CRM authentication, the live VPS/Cloudflare inspection, counsel's review, and field performance data. Status words used below: **Verified** (run in this task on the final source), **Not run** (blocked or not authorised), **Needs approval**.

Release commit: the commit that contains this file on branch `review/website-parity-and-contact-ip-2026-11-15` (the exact SHA is in the GitHub section of the final report and in `git log`; the tests below ran on the working tree that became that commit, built once and served from the standalone build). Previous published commit: `3e919f4`. `docs/workspace-archive/` and `docs/brand-assets/` are deliberately **not** committed. The CRM repository was not touched.

## 1. Build and test results (final source, final build)

Everything below ran **after the last source change**; results of earlier runs were not reused. Environment: Windows 11, 8 GB RAM, Node 24.19, Next.js 16.4.6, production **standalone** build served on 127.0.0.1:3101, stand-in CRM on loopback only. New files and temporary folders were written on F: only. Skipped, blocked and not-run items are never counted as passed.

| Check | Command (from the repository root) | Result |
|---|---|---|
| Dependency audit | `npm audit` | **0 vulnerabilities** |
| Type check, lint | `npx next typegen && npx tsc --noEmit`; `npx eslint . --quiet` (typegen first: see section 3, item 9) | clean |
| Production build | `NEXT_OUTPUT=standalone npm run build` | succeeded, no warning or advisory notice |
| SEO validation | `node scripts/validate-seo.mjs` (local build) | **223 routes, 0 failures** |
| SEO inventory | `node scripts/audit-seo-inventory.mjs http://localhost:3101` | 0 non-200, 0 duplicate titles / descriptions / H1s, 0 broken internal links, max depth 2; 3 "problems" = the decorative `alt=""` background photo on `/`, `/about`, `/business-class` (correct HTML, counted by the script) |
| Search Console URLs re-checked on the local build | 125 documented URLs + 3 apex checks | **all behave as documented** (`SEO_INDEXING_RECOVERY_AUDIT.md`, section 8) |
| Browser, Desktop Chrome + Mobile 320 / 375 / 390 | `npm run test:ui` | **2,548 passed, 0 failed, 0 flaky, 8 skipped** (first attempt, 12.3 min) |
| Tablet 768x1024 and neighbours 767, 769 (x1024) and 1023, 1024 (x768) | the viewport projects at those widths | **637 / 637 / 637 passed; 637 / 636 passed; 0 failed; 0 flaky; 3-4 skipped each** (width-gated) |
| Layout sweep | `tests/layout-stability.spec.ts` x3 | 25 widths x 3: **3 passed** |
| Infrastructure (standalone servers, stand-in CRM, raw HTTP) | `npm run test:infra` | **201 passed, 0 failed, 0 flaky, 6 skipped** (the opt-in live-CRM contract spec: not run); every test of the CRM-actions spec executed (10.8 min) |
| CI-equivalent (no browser installed) | the commands of `.github/workflows/verify.yml` | with `PLAYWRIGHT_BROWSERS_PATH` pointing at an empty folder (no browser available): **54 passed** (`crm-api-client`, `docker-topology`) and **237 passed** (rate limiting, e-mail/phone/date validation, airport suggestion, signing context, IP capture) |
| Secret scan of the commit set | pattern scan of every changed and new file | **28 files scanned (everything this commit adds or changes), 0 hits, no `.env` file**; values were never printed |
| CRM tests | not re-run (the CRM was not touched); last recorded: 4,499 passed, 0 failed, 1,089 skipped (need PostgreSQL) | **Not run** (separate project) |
| Docker rehearsal | `bash deploy/rehearsal/run.sh` | **Not run**: no Docker, Podman or WSL distribution on this machine (re-checked 2026-11-22; `wsl.exe` reports WSL is not installed) |
| PostgreSQL-backed tests | the CRM's own suite | **Not run**: no PostgreSQL, no `DATABASE_URL`; none installed |
| Live CRM authentication | runbook section F | **Not run, by design**; **Needs approval** |
| Lighthouse | - | **Not run**: not installed, not installed without approval; the project's Chromium lab emulation was used instead (`SEO_TECHNICAL_VERIFICATION.md`, sections 10 and 14) |
| Real-user Core Web Vitals | - | **Not available** before deployment |

**First-attempt and retry results are reported separately.** In the verification runs of this task a full browser run on an earlier form of the same code had 4 tests that failed their first attempt and passed on retry, and one run had 0; the final run above had none. The causes found and fixed are listed in section 2; the remainder were 27-35 s stalls of tests that normally take 2-7 s, which occurred only with three browsers and the server competing on an 8 GB machine (about 1.3 GB free) and never in isolation (one of them, run alone 24 times, took 3-3.7 s every time). If a CI machine or small workstation shows them, run `npx playwright test --workers=2`; they are not hidden by raised timeouts (see below).

**Skipped-test register (all conditional skips written in the tests; none was added to hide a failure):** *browser projects, 8* - `accessibility.spec.ts` "mobile menu" skips on Desktop (no hamburger; runs on the three mobile projects); `date-range.spec.ts` "first tap previews the range" skips on the three mobile projects (touch behaviour is checked once, on Desktop); `design-integrity.spec.ts` "odd last card" skips on Desktop (three-column layout from lg); `redesign.spec.ts` "desktop mega menu" skips on the three mobile projects. *Width suites* - the same width-gated tests (3 at 767-1023, 4 at 1024). *Infrastructure, 6* - `crm-contract-live.spec.ts` (opt-in: needs `CRM_CONTRACT_URL` and `CRM_CONTRACT_KEY` for a **non-production** CRM): **not run**.

## 2. What changed in this task (2026-11-22), and why

* **Security review completed** (`SECURITY_REVIEW_AND_REMAINING_LIMITATIONS.md`): CSP investigated with measurements (see below); rate limiting, abuse protection, the Cloudflare trust boundary, clock synchronisation and the redirect-header question written up with exact exposure and mitigations.
* **CSP stays; evidence recorded.** The 223 built pages carry 1,220 inline framework scripts with 776 distinct bodies (774 occur on one page only), so hashes and per-page lists are impossible; nonces would force all pages to render per request; the toast library injects a `<style>` element, so narrowing `style-src` produced 8 violations and `script-src 'self'` produced 30 blocked scripts and a broken page. `tests/csp-violations.spec.ts` now pins that the pages inline nothing but framework scripts (no inline `<style>`, handler or `javascript:` URL) and that the main flows raise **no** policy violation.
* **Rate limiting hardened** (`src/lib/sliding-window.ts`, `rate-limit.ts`, `rate-limit-client.ts`): an IPv6 client is keyed by its **/64** (one client could previously mint 2^64 buckets); memory is capped (50,000 keys) with amortised sweeps instead of a scan per request above 5,000 keys; one shared instance per process; `GET /api/visitor-hint` now answers `429` after 120 requests per 10 minutes per identified client. Tests: concurrency, window, cap, performance, /64, and the real route over HTTP. **Still per process and reset by a restart**: the reliable control is a Cloudflare rate-limiting rule (runbook E4; **Needs approval**).
* **Preflight stops without `LEAD_INGEST_SECRET`** (it used to warn): the website would otherwise send **unsigned** requests, which a CRM that has the secret refuses. The previous report's statement "no unsigned fallback" was corrected. `PREFLIGHT_ALLOW_UNSIGNED=yes` is the deliberate opt-out.
* **Clock drift tests**: `tests/crm-api-client.spec.ts` now covers timestamps 100 s behind / 20 s ahead (accepted) and 150 s behind / 45 s ahead / an hour behind (refused 401, not retried, never reported as success). Runbook section J gives the NTP check and the safe remedy (do not widen the window).
* **Layout stability, found in two steps.** The first fix of the previous task (an invisible placeholder for the helper button) was **incomplete**: my probe's mocked answer had the wrong field name, so it never applied the suggestion. The tablet suite then failed on the second shift (the button gives up its text when a suggestion is placed, moving the form up 16 px at 767-769 px). Root cause: between about 640 and 800 px the From column is so narrow that its label row holds one or two lines depending on its contents. Fix: the row reserves the two-line height for exactly that zone. Verified at 127 widths (no shift anywhere) and by the new `tests/layout-stability.spec.ts` (25 widths).
* **Flaky tests investigated, not hidden.** Fixed causes: two ordering races (the mocked answer was released by a clock, not by the event it was meant to follow) in `location-autofill.spec.ts`; the four delayed-chunk tests in `phone-validation-loading.spec.ts` had a 30 s whole-test budget around 30 s of internal waits and a deliberate 6 s delay, so they now state a 60 s budget with the reason; the destination-loop SEO test loops over every page and has a 120 s limit. The 27-35 s stalls under three-way load are an environment effect and are documented, not masked.
* **Content:** the Munich airport text was qualified (the airport's own pages give about 40 *or* 45 minutes, and the bus's 45-minute figure could not be confirmed; the bus duration was removed). Oslo and Budapest were re-confirmed; Edinburgh's frequency was confirmed (its journey time was not visible to the search tool; unchanged); others not re-checked (`SEO_INDEXING_RECOVERY_AUDIT.md`, section 8).
* **Performance (lab):** the four dimmed decorative hero photos are now encoded at quality 55 (`images.qualities: [55, 75]`): the LCP resource is about 20% smaller (home 45 -> 36 KB, Munich 131 -> 105 KB on mobile). LCP *times* lie within the noise of the lab emulation, so **no LCP improvement is claimed**. Causes of the lab LCP (bandwidth-bound; `/destinations` loads 1.6 MB of card photos; 588 KB of JavaScript on home and `/flights`) are in `SEO_TECHNICAL_VERIFICATION.md`, section 14. This is lab data, not Core Web Vitals.
* **Accessibility tests extended**: the new region-hub page type and a destination page with the airport-access block are now axe-scanned (WCAG 2.2 A/AA tags) on all four projects.
* **CI added, verification only** (`.github/workflows/verify.yml`): read-only token, no secrets, actions pinned to full SHAs, no deploy step, `review/**` branches and pull requests only. See section 3, item 9.
* Earlier in the release line (previous tasks, unchanged): Next.js 16.4.6 (advisories closed), HSTS `max-age=63072000` only, no session-storage key, signing v2, visitor-hint route, 11-month dates, email/phone validation, SEO recovery.

## 3. Blockers, approvals and who must act

| # | Item | Status | Needs |
|---|---|---|---|
| 1 | **Docker rehearsal** `bash deploy/rehearsal/run.sh` | **Not run** (no Docker/Podman/WSL). The script is isolated (own compose project, mock CRM, throw-away Postgres, no production network or volume) | A Docker machine (compose plugin, about 3 GB free memory, no host ports) and your approval. Only `ALL CHECKS PASSED` counts |
| 2 | **PostgreSQL-backed CRM tests** | **Not run** (no PostgreSQL; none installed) | An approved disposable PostgreSQL (never production, not a shared host) and the CRM project's own command |
| 3 | **CRM before website** | The website's flight requests need the CRM's signing v2 and the per-visitor flight limiter (CRM source uncommitted) | Deploy and verify the CRM first (runbook sections 5-6, J) |
| 4 | **Live CRM authentication** | **Not run**; the procedure and its safety were verified from both sources (runbook F and L: no customer-facing e-mail is sent; the newsletter test creates a marketing subscriber to delete) | **Needs approval** for three marked submissions, and the CRM owner's confirmation and clean-up |
| 5 | **Cloudflare** | Not inspected or changed. Runbook E1-E4: one-hop apex redirect, Email Address Obfuscation (optional), visitor location headers, edge rate-limit rule | **Needs approval**, one change at a time with the verification commands given |
| 6 | **Live VPS inspection** | Not done (read-only checks in runbook step 0 and the trust-boundary list: nothing else on the tunnel network, no other route to the origin, NTP on both hosts) | Your access on the server |
| 7 | **Legal review** | Privacy, Cookie Policy, Terms and the location paragraph unreviewed (section 8) | Counsel |
| 8 | **Real-user performance** | Lab only; some pages exceed 2.5 s LCP under a harsh emulation | PageSpeed Insights / CrUX / Search Console after deployment |
| 9 | **CI workflow first run** | The workflow could not be run on this machine; its first run on GitHub is recorded below after the push | none unless it fails |

## 4. Environment variables (names only; values never in the repository)

Required by the website container: `CRM_API_URL`, `CRM_API_KEY`, `CRM_COMPANY_ID`, **`LEAD_INGEST_SECRET` (now required by the preflight; 32 characters or more; identical on the CRM)**, `GMAIL_SENDER_EMAIL`, `GMAIL_APP_PASSWORD`. Fixed by `compose.yaml`: `TRUSTED_PROXY=cloudflare`. No `DATABASE_*` variable is needed or accepted.

## 5. CRM dependency and deployment order

The contract (endpoints, bearer key, signature v2, the 120 s / 30 s window, one-time nonce, 20 requests per 15 minutes per visitor on the flight route, 10 s timeout, 3 attempts with the same Idempotency-Key, and how each response is handled) is in the runbook, section G, and was cross-read against the CRM's verifier (constants 120 and 30, nonce kept until timestamp + 180 s; not modified). **Order:** (1) complete and approve the CRM release; (2) deploy the compatible CRM; (3) verify CRM health and the signed API contract (stand-in tests here; a live check only with approval); (4) set `LEAD_INGEST_SECRET` identically on both sides (never in a shell history, never in Git); (5) check the clocks (runbook J); (6) preflight, then `deploy/deploy.sh` for the website only; (7) the approved smoke test (runbook F, P). None of this was executed.

## 6. Post-deployment verification

Runbook section P (anonymous GETs: health, headers, robots, 223-URL sitemap, `/terms` 308, `/offers` 404, visitor-hint without IP/coordinates) and section F (live CRM test, with approval); Search Console steps in `SEO_TECHNICAL_VERIFICATION.md`. Do not probe the rate limits in production and do not stop the CRM to test outages.

## 7. Cloudflare checklist

Exact steps, verification and rollback: runbook E1 (apex rule), E2 (Email Address Obfuscation: optional, analysis in the security review section 9, **not** changed), E3 (location headers), E4 (edge rate limiting). Also confirm "Always Use HTTPS", the tunnel route `http://bft-web:3000`, and that no cache rule covers `/api/visitor-hint`.

## 8. Privacy, Cookie Policy and Terms: consistency with the implementation, and questions for counsel

Checked against the code (no legal advice, no claim of compliance). Browser storage inventory, complete: one `localStorage` key (`bft-cookie-consent`, the cookie-notice choice), no cookie, no session storage (confirmed by search of `src/`). Visitor IP and approximate location are captured on the server from the trusted proxy, shown to nobody, sent to the CRM inside the signed envelope and included in the business's own notification e-mail; coordinates from the device never leave the browser; the hint route returns only a country code and an airport and is not logged. **Questions for counsel:** (1) the Privacy paragraph on location suggestions and IP capture (its "Last updated" date was not changed); (2) whether the Cookie Policy should name the `localStorage` consent record; (3) the `Permissions-Policy` change (`geolocation=(self)`); (4) the quote-button consent wording and the Terms; (5) retention of CRM-held data (the website states none; none was invented); (6) lawful basis and disclosure for recording IP/approximate location with each enquiry; (7) the newsletter sign-up wording (marketing consent) against how the CRM uses subscribers. Accessibility: automated WCAG 2.2 A/AA scans on 17 pages (including the new hub pages and the 404 page), keyboard, focus and reduced-motion tests, touch-target and contrast checks exist and pass; no manual screen-reader test was run.

## 9. Rollback

Website only: `deploy/rollback.sh previous` (the deploy script tags `:previous` only from a healthy container); it never touches the CRM or its database. Rolling back to the old database-backed release needs the OLD compose file and `.env` (runbook section 8). Do not roll the CRM back below the signing-v2 build while the new website is live without testing the pair. Cloudflare changes are undone in reverse order (runbook I).

## 10. Final safety confirmation

No production deployment; no production container restarted; no production database or CRM data touched; the CRM code and database were not modified (its source was read, not edited); no Cloudflare, DNS or VPS setting changed; no live CRM submission, real customer enquiry, e-mail or marketing message; the live site was not contacted for tests (only the local build and public GETs to GitHub and search); no production secret was read, printed or committed; the original project folder was not modified; no software was installed (no Docker, WSL, PostgreSQL or Lighthouse); no force-push, no history rewrite, no push to `main`, no new branch.
