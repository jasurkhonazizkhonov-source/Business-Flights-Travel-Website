# Four-project independence and website audit — 2026-11-13

Audit time about 05:30–06:30 PST. This report belongs to the **updated website** (`F:\Claude Workspace\Travel Agency Website-updated`). It does not rely on earlier reports: everything below was re-checked against the current files, running servers and fresh test runs unless marked **[P]** (historical, from another report, not re-run). The companion CRM report is `F:\Claude Workspace\compass-tools-updated\docs\CRM_INDEPENDENCE_SECURITY_AND_FUNCTIONALITY_AUDIT_2026-11-13.md`. The earlier website audit (`BUSINESS_FLIGHTS_WEBSITE_INDEPENDENCE_AND_COMPLETENESS_AUDIT_2026-11-13.md`) was used only as a reference.

**Boundaries kept.** No source, configuration, dependency, package, lockfile, environment file or Git state was changed in any of the four projects; nothing was committed, pushed, staged, stashed, reset or deployed; no database was touched, installed or configured; no production system, credential or real data was used; nothing was submitted to a CRM or SMTP server. The two original projects were not edited. The only files written are the two requested reports (untracked, in the updated projects' `docs/` folders) and temporary scripts/logs in this session's scratch area outside all projects.

**What running servers did write.** Starting a development server writes build cache into that project's own `.next/dev` and Next may rewrite git-ignored `next-env.d.ts`; `tsc` rewrites the git-ignored `tsconfig.tsbuildinfo`; Playwright writes `test-results/` (ignored). Git status of every project was compared before and after (website-updated 100 → 100, CRM-updated hash identical before and after the server start and before and after the tests, website-original 35 → 35).

**Snapshot caveat.** Another Claude session (peer "Compass Tools CRM implementation") shares this workspace and was idle during the audit; the working tree of the updated website still contains uncommitted work from earlier sessions (see §2).

---

## 1. Fixed four-project mapping and server verification

| Project | Directory | Fixed port | PID | Running status | Verified identity |
|---|---|---:|---|---|---|
| Original CRM | `F:\Claude Workspace\compass-tools` | 3000 | — | **Not running — deliberately not started** (blocked, see below) | not verified (not started) |
| Updated CRM | `F:\Claude Workspace\compass-tools-updated` | 3001 | listener 2132 (`next dev -p 3001`, parent 9392), started by this session 05:4x | **Running** (development server, Next 16.3.8 Turbopack) | `GET /` → 200, title "Compass Tools — CRM for Travel Agencies"; command line paths all inside `compass-tools-updated`; `/login` → 500 and `/api/health` → 503 because **no `.env` exists in this project** (`GOOGLE_CLIENT_ID is not configured`, database not configured) — an environment condition, not a code fault |
| Original website | `F:\Claude Workspace\Travel Agency Website` | 3100 | listener 6780 (`next dev -p 3100`, parent 10544) since 06:15; the first instance (listener 16144) was stopped by this session at about 06:00 with the preview tool's `preview_stop` to free memory for the CRM tests | **Running** (development server, Next 16.3.1); started by this session through the existing, unedited `.claude/launch.json` | while running: `/` 200, title "Business-Class & International Flights | Business Flights Travel", old email `requests@businessflights.travel` ×8, old address "580 California" ×4, **no** `info@businessflights.travel`, **no** JSON-LD `@id` → the original site; Next 16.3.1; server log "Environments: .env" |
| Updated website | `F:\Claude Workspace\Travel Agency Website-updated` | 3101 | listener 14904 (`next dev -p 3101`, parent 14628), started by this session 05:4x | **Running** (development server, Next 16.4.2 Turbopack) | `/`, `/contact`, `/api/health`, `/robots.txt` → 200; new email ×8, "350 Sansome" ×4, JSON-LD `@id` ×3, no old email/address; no env file loaded |

How identity was established: absolute paths in each process's command line (`…\<project>\node_modules\next\dist\bin\next`, `…\start-server.js`), distinct page content per project, and each project's own `.next` (a server's working directory itself cannot be read on Windows without extra tooling; the command-line paths are the evidence). Ports were checked free before each start and **no port was reassigned, switched or invented** (3102/3103 were never used).

**Port 3000 is blocked, not failed.** `compass-tools\.env` holds a **non-loopback `DATABASE_URL`** (value never read; only its host class was classified), Google OAuth secrets and encryption keys. The CRM's `instrumentation.ts` starts a 60-second poller (`processDueTaskNotifications`) at server boot that queries the database, so starting the original CRM would immediately run background work against a non-loopback database. That conflicts with the rule against using production/remote databases for testing, so it was not started; nothing about it was changed.

**Another notable condition.** The original website's `.env` also contains a non-loopback `DATABASE_URL`, and its dev server (3100) loaded it while it ran. The original website touches the database only when a form is submitted; no form was submitted and no request other than page loads and `/api/health` (which does not check the database) was made to it.

**Action not completed:** stopping the updated CRM's dev server (to free memory for the CRM tests) was **denied by the auto-mode permission classifier**; I did not try another route. The server was left running.

### Browser console / server errors
* 3101 (updated website): no server errors from normal page loads. The only error lines are the intentional ones produced by my failure probe (aborted request → `TypeError: Failed to fetch` in `error.tsx`; "CRM_API_URL / CRM_COMPANY_ID is not set" with no CRM configured; the rate-limit notice that `TRUSTED_PROXY` is unset). One transient `SyntaxError: Unexpected end of JSON input` inside Next's dev compile produced one HTTP 500 on `/blog/long-haul-business-class-travel-tips` during a 218-route sweep; three immediate retries returned 200 (not reproducible; Next internals; see W14).
* 3100 (original): preview-pane console showed no errors.
* 3001 (CRM): `GOOGLE_CLIENT_ID is not configured` at `src/server/auth/google-config.ts:20` (expected without `.env`), `[health] DATABASE_CHECK_FAILED`.

---

## 2. Four-project inventory (read-only; `git --no-optional-locks`)

| | Original CRM | Updated CRM | Original website | Updated website |
|---|---|---|---|---|
| Git root | **unreadable by git** (`.git/config` is 1,034 NUL bytes → "bad config line 1") | itself | itself | itself |
| Branch / HEAD | `feature/website-api-idempotency-fingerprint` / `c6b8d8edb94a…` (read from `.git/HEAD` and the loose ref file) | `work/commission-salesboard-notes-ui` / `5a77976` | `feature/vps-website` / `10fe079` | `work/website-crm-api-integration` / `d1d1b61` |
| Working tree | not determinable with git | **208 entries: 79 staged, 55 unstaged, 84 untracked, 0 unmerged**, 1 stash | 35 (24 modified, 11 untracked), 0 staged | 100 at the start of this audit (11 modified, 89 untracked), 0 staged, 0 stashes (101 with these reports) |
| Merge / rebase | none | **merge in progress**: `MERGE_HEAD` = `c6b8d8e` (`github/feature/website-api-idempotency-fingerprint`, 15 commits not in HEAD), `README.md` conflict already resolved (0 unmerged index entries), merge uncommitted | none | none |
| Env files (names only) | `.env` (7,061 B), `.env.example` | `.env.example` only | `.env` (812 B), `.env.example`, `.env.vps.example` | `.env.example`, `.env.vps.example` only |
| Next.js / React / Prisma | 16.3.8 / 19.2.8 / ^7.9.1 | 16.3.8 / 19.2.8 / ^7.9.1 | 16.3.1 / 19.2.8 / ^7.9.1 | **16.4.2** / 19.2.8 / none |
| Package manager / lock | npm, `package-lock.json` | same | same | same |
| `node_modules` / `.next` | present / build `a20lsm8d…` (2026-10-13) | present / build `-2rvpm1cA…` (11/13 02:59) + dev dir | present / build `nDLJb4GO…` (11/13 00:18) + dev dir | present / build `UKG4qIOw…` (11/13 03:23) + dev dir |
| Dev script | `next dev -p 3000` | `next dev -p 3001` | `next dev -p 3100` | `next dev -p 3101` |
| Launch config | `compass-tools-dev` (3000) **and** `compass-tools-prod` (`npm run start -- -p 3002`, port 3002) — an existing stray port in the original, not mine, **not edited** | `compass-tools-updated-dev` (3001) | `travel-agency` (3100) | `travel-agency-updated-dev` (3101) |
| Test tooling | vitest | vitest (282 unit/component files + 25 database-backed files) | Playwright | Playwright |

All four launch configurations already map to the fixed ports and `autoPort` is `false` where present; **none was created or edited**. Git state of the updated CRM (including `MERGE_HEAD`, the 79 staged entries and the stash) and of the updated website was preserved exactly (identical status hashes before/after).

Node v24.19.0, npm 11.17.0 (machine-wide).

---

## 3. Website independence (re-verified)

| Check | Result |
|---|---|
| Own source | 151 source files scanned; 61 relative and 237 `@/` imports; **0 resolve outside the project**, **0 unresolved**, 0 absolute-path imports |
| No import of the original website or of Compass-Tools internals | none; `package.json`/`package-lock.json` contain **no** `prisma`, `pg`, `compass` or `crm` dependency (0 matches); no source file imports a CRM module |
| No direct CRM database connection | none — no database client anywhere in `src`, `scripts`, config, compose or deploy files; `deploy/preflight.sh` refuses any `DATABASE_*` variable and any network that also carries a database |
| Only the intended HTTP API | all CRM traffic goes through `src/lib/crm-api/client.ts` (`fetch`), configured only in `src/server/crm-api.ts` (`server-only`) |
| Own dependencies / lockfile | installed packages equal `package-lock.json` (476 of 476 [from the earlier audit, lockfile unchanged]); `npm audit --omit=dev` → **0** vulnerabilities |
| Own build output | its own `.next`; `required-server-files.json` records the updated folder |
| Own environment configuration | only example files; **no real `.env`** (the operator must supply `CRM_API_URL`, `CRM_API_KEY`, `CRM_COMPANY_ID`, `LEAD_INGEST_SECRET`, `GMAIL_SENDER_EMAIL`, `GMAIL_APP_PASSWORD`, `TRUSTED_PROXY`) |
| Reverse direction | the CRM source (864 files) has 0 imports outside its root and mentions the website only in one comment (`scripts/vercel-build.mjs:21`) |
| Can it be built and maintained independently | yes by all read-only evidence; a clean-room build was not performed (no builds allowed). The build needs network access for `next/font/google` (Google Fonts) |

---

## 4. Website functionality audit

### 4.1 Flight request (`src/components/flight-form/FlightRequestForm.tsx` → `src/server/actions/submit-flight-request.ts`)
* **Client validation** (accessible inline errors, `noValidate`, focus on first error, airport autocomplete, date picker, phone validator loaded on demand) and **server validation** (`src/lib/validations/flight-request.ts`: trip-type/cabin enums, 1–6 segments, IATA `^[A-Za-z]{3}$`, dates, past-date refusal, adults 1–9 / children ≤8 / infants ≤8, total ≤ 9, infants ≤ adults, notes ≤ 2000, budget ≤ 1,000,000, names ≤ 80, email ≤ 200, phone ≤ 30, then libphonenumber normalisation and airport re-lookup in the app's own dataset).
* **Payload** (`src/lib/crm-api/flight-inquiry.ts`): explicit allow-list, byte-identical on retry; honeypot/timing/`submissionId` never sent.
* **Authentication:** `Authorization: Bearer <CRM_API_KEY>` (≥ 32 chars) + `Idempotency-Key` (the per-mounted-form UUID) + optional HMAC-signed visitor context.
* **Duplicate protection / retry:** same key and bytes on every attempt (up to 3, 1/2/4 s backoff, only for network/timeout/429/5xx/unreadable 200); a repeat is answered `duplicate` by the CRM; client `submittingRef` blocks double clicks.
* **Rate limit:** 8 per 10 minutes per trusted client IP (in memory). **Request size:** Next.js default 1 MB for server actions plus the field maxima above (no explicit limit; W4). **Logging:** fixed tags only; the IP is never logged.
* **Failure handling:** returned failures (rate limit, validation, CRM refusal/outage, misconfiguration) become inline messages; a thrown failure does not (W1).

### 4.2 Contact form (`ContactForm.tsx` → `submit-contact-message.ts`)
Validation: subject enum (5 values identical to the CRM's), message 10–3000, names ≤ 80, email ≤ 200, phone checked twice. CRM call: `POST /api/public/contact-inquiry`, unauthenticated, `companyId` in the body, **one attempt, no idempotency** (W2). Rate limit 8/10 min (in memory). Personal data: held only in transit; not logged; sent to the CRM and never stored by the website. Thrown failures unhandled (W1).

### 4.3 Newsletter (`NewsletterForm.tsx` → `subscribe-newsletter.ts`)
Email validation client + zod; honeypot field `website`; CRM call `POST /api/public/subscribe` (`{companyId,email,source:"website"}`), one attempt; rate limit 6/10 min. The CRM upserts, so a repeat is harmless but the visitor is never told "already subscribed" (`alreadySubscribed` is always false). **The honeypot problem from the previous audit is still present** (W3). Thrown failures unhandled (W1).

### 4.4 Dynamic proof of the failure behaviour (my own probe on 3101, synthetic data, no CRM configured)
| Scenario | Result |
|---|---|
| A — the server-action POST is aborted at the network level | visitor lands on the generic page "This page hit an unexpected error"; the **form is gone and the typed message is lost**; console `TypeError: Failed to fetch` in `error.tsx` |
| B — real action with no CRM configured (a *returned* failure) | inline alert "We're sorry, something went wrong while sending your message…"; the form stays and all typed text (62 chars) is kept |

So the requirement "a network failure or thrown server-action error must not send the visitor to a generic error page" is **not met** today (W1).

---

## 5. Website security findings
(The detailed findings are in §11; summary of controls verified.)
* Secrets: read only in `server-only` modules; **no secret name or credential pattern in any shipped client file** (33 files) or prerendered page (219); no `NEXT_PUBLIC_*` variable used. `dangerouslySetInnerHTML` only for JSON-LD with `<` escaped. The notification email HTML-escapes every user value; IATA codes are regex-limited (no header injection).
* Headers on 3101 (dev) and earlier on the production build: CSP (`default-src 'self'`, `'unsafe-inline'` scripts/styles, `frame-ancestors 'none'`, `form-action 'self'`, `object-src 'none'`), HSTS 2 years + preload, `X-Frame-Options: DENY`, nosniff, referrer policy, permissions policy; no `X-Powered-By`, `Server` or CORS headers.
* Request size: framework default 1 MB, no explicit limit, no oversize test (W4). **The CRM's `src/server/security/read-limited-json.ts` is for the CRM's route handlers (`Request.json()`) and is not applicable to the website**, which exposes no JSON route handler — its only mutation surface is three Server Actions. An independent website implementation is therefore a one-line framework setting (`serverActions.bodySizeLimit`), **not** a copy of CRM code (copying CRM internals into the website would also break the independence rule).
* Dependencies: `npm audit` → 7 moderate, all in the ESLint/TypeScript-ESLint toolchain (dev only); 0 production vulnerabilities.
* Errors: visitors never see stack traces or CRM text (fixed messages).
* Abuse: honeypot + client-supplied timing + in-memory rate limit; no CAPTCHA (W5).

---

## 6. SEO and content (static analysis of the 219 prerendered pages in each project's own production build; no server load)
| Check | Updated website | Original website |
|---|---|---|
| Pages analysed | 217 (+ `/flights` dynamic = 218 routes) | 217 |
| Missing title / description / canonical | 0 / 0 / 0 | 0 / 0 / 0 |
| Canonical not equal to the page's own URL, or off `www.businessflights.travel` | 0 | 0 |
| Duplicate titles / descriptions / H1 | 0 / 0 / 0 | 0 / 0 / 0 |
| Missing og:title / og:image / twitter:card; `noindex`; missing `lang` | 0 | 0 |
| Pages with ≠ 1 `<h1>`; skipped heading levels | 0; **0** | 0; 1 (`/how-it-works`) |
| `<img>` without `alt` | 0 | 0 |
| `alt=""` on non-hidden images | 3 (`/`, `/about`, `/business-class`) — the decorative hero background (`opacity-60` behind the headline); correct use of empty alt | same |
| JSON-LD invalid / dangling `@id` references | 0 / 0 | 0 / 0 |
| Title > 65 or description outside 70–170 characters | 0 | 0 |
| Internal links to unknown targets | none (the one "unmatched" target is `/flights`, a dynamic route that returns 200) | same |

Sitemap: 218 URLs, all on the canonical host; `robots.txt` allows `/`, disallows `/api/`, names the sitemap. `scripts/validate-seo.mjs` run against the 3101 dev server today: **218 routes, 1 failure (a transient dev-compile 500, W14), robots and sitemap checks passed**; against the production build in the previous audit: 218 routes, 0 failures [P, not re-run].

Preserved originals: routes (27/27 app files, 218/218 routes), 14/14 `public/` files, 3/3 icons and the same 212 Unsplash URLs as the original (previous audit, not re-hashed today). **Held / incomplete content:** the three legal pages are drafts that **no attorney has reviewed** (`docs/LEGAL.md`: "must not be published to real customers until one has"); no governing-law clause exists; the privacy page (dated "November 8, 2026") and `QuoteConsentNotice.tsx` are **uncommitted**. No placeholder text (TODO/lorem/`[insert]`) remains in `src`. No legal wording was edited.

---

## 7. Performance (static, from the existing production builds; I measured no emulated or real-device metrics)
| Page | JS in initial scripts, gzip KB — updated / original | HTML gzip KB | Images (lazy/eager) | `fetchpriority=high` |
|---|---|---|---|---|
| `/` | 233.2 / 261.0 (−10.7 %) | 34.8 | 25 (23/2) | 2 (original: 0) |
| `/contact` | 220.4 / 249.8 (−11.8 %) | 15.1 | 11 (10/1) | 0 |
| `/about`, content pages | 216.9 / 216.9 | 20–29 | 11–45 lazy | 2 on destination and blog pages (original: 0) |
| `/destinations` | 216.9 | **1,057 KB raw / 54.8 gz** | 190 (185 lazy) | 0 |

* The phone-number metadata is **absent from `/contact`'s initial scripts in the updated build and present in the original's** — verified by file content, which independently confirms the lazy-loading work.
* Every content page ships about 217 KB gzip (690 KB raw) of shared JavaScript; `/destinations` is a 1 MB HTML document (171 cards, 190 images, 185 lazy).
* The other session's emulated before/after table (`compass-tools-updated/docs/FOUR_PROJECT_COMPARISON_2026-11-13.md` §7: TBT −25…−42 % on an emulated 4× CPU phone profile; total JS unchanged after settling) is **emulation on this PC, not real iOS/Android results**; I did not re-measure it, and no real-device testing exists anywhere in this workspace.
* Not measured here: Core Web Vitals (LCP/CLS/INP), form responsiveness under load, unnecessary network requests. Fonts are self-hosted by `next/font` after a build-time Google fetch.

---

## 8. Website ↔ CRM integration audit (source-level; live verification blocked — no staging CRM, no credentials, no database)

**Payload vs the CRM's real contract** (`compass-tools-updated/src/server/lead-intake.ts` `flightInquiryBase`, `strict()`; `src/app/api/v1/website/flight-inquiries/route.ts`; `docs/WEBSITE_LEAD_API.md`) — compared field by field:
* Every field the website sends exists in the CRM schema with a compatible type and **tighter-or-equal limits**: names 80 ≤ 200; phone E.164 ≤ 50; `tripType` and `cabinClass` enums identical; adults ≤ 9 ≤ 20; notes 2000 ≤ 5000; preferred airline 120 ≤ 200; `budgetCurrency` a 3-letter code; airports by 3-letter IATA; `submissionId` correctly travels only in the `Idempotency-Key` header (the CRM refuses it in the body). Unknown fields are a CRM 400, and the website builds the body from an allow-list, so none are sent.
* Contact: the five `subject` values are identical in both projects; `companyId` + `firstName`/`lastName`/`email`/`phone`/`subject`/`message` (message 3000 ≤ 5000).
* Newsletter: `{companyId, email, source}` (source ≤ 100).
* **Authentication:** CRM requires a Bearer key ≥ 32 chars, constant-time comparison, failure counting then 429, refuses requests that arrived through Cloudflare's public edge (404) — the website's server-to-server calls carry no `cf-*` header. **Key rotation:** the CRM accepts `WEBSITE_API_KEY` and `WEBSITE_API_KEY_NEXT` simultaneously (rotate without downtime); the website uses one key from its environment, so rotation = change the website env after the CRM accepts both. **Variable names differ by design** (`CRM_API_KEY` ↔ `WEBSITE_API_KEY`) and `CRM_COMPANY_ID` must be a real CRM company id for the public endpoints (the authenticated endpoint fixes the company by `WEBSITE_API_COMPANY_ID`).
* **Duplicates:** flight = idempotent by key + request hash (same request → `duplicate`, different request under the same key → 409); contact/newsletter = none on the website side; the CRM's contact route has the mechanism (`duplicateWindowMs`, advisory-lock based) but **does not enable it** for the website's route (W2, I2).
* **Error propagation:** CRM 400/409/413/415 → website `rejected`; 401/404 → `misconfigured` (never retried); 429/5xx/timeouts → retried (flight) or reported once (public). All become generic visitor messages; no CRM text is shown or logged.
* **CRM activity creation / lead creation / queue distribution:** implemented CRM-side (`createWebsiteFlightLead`, `logActivity`, `distributeNewWebsiteLead`); **not exercised** (needs the database).
* **Rate limiting at the boundary:** the CRM's authenticated endpoint has one shared 120/min budget for the website; the CRM's *public* limiter (contact/newsletter) is keyed by a trusted client IP and **fails open** when none is available, which is always the case for calls from the website's server (I2).
* **Observability:** fixed-tag logs on both sides; CRM audit rows for website-API creates/duplicates/conflicts.
* **Cross-project dependency to note:** the idempotency-fingerprint behaviour the website relies on belongs to a CRM **merge that is still uncommitted** (`MERGE_HEAD c6b8d8e`, 79 staged entries). Aborting that merge would remove it (I1).

---

## 9. Tests executed (exact results; skipped ≠ passed)

| Suite (project dir, runner) | Passed | Failed | Skipped | Blocked / not run |
|---|---:|---:|---:|---|
| Website `tsc --noEmit` | exit 0 | — | — | |
| Website ESLint (166 files) | 0 errors, 0 warnings | | | |
| Website `validate:content` | pass | | | |
| Website unit-style Playwright specs (anti-spam, rate-limit-client, smtp-helpers, flight-request-notification, json-ld, related-destinations, error-boundaries) — Desktop Chrome project, `--retries=0` | **140** | 0 | 0 | |
| Website Infrastructure group (`crm-api-client` 40 + `crm-api-actions-e2e`, `crm-contract-live`, `self-hosted-e2e`, `rate-limit-actions-e2e`), `--no-deps` | **40** | 0 | **40** | the 40 skips need a `NEXT_OUTPUT=standalone` build (no builds allowed) or a staging CRM (6 live-contract tests): **not passed, not run** |
| Website browser suite on the 3101 dev server, Desktop Chrome, 1 worker, retries off (accessibility, phone-validation-loading, contact-form-autocomplete, contact-details-and-consent, design-integrity, date-range, redesign): 117 tests | **113** | **2** | **2** | see below |
| Re-run of `phone-validation-loading.spec.ts` ×2 | 13 / 13 | 1 / 1 | | |
| `validate-seo.mjs` vs the 3101 dev server | 217 routes | 1 (transient 500, then 200 ×3) | | |
| `npm audit` website | 0 production vulnerabilities (7 moderate, dev tooling) | | | |
| Mobile 320/375/390 viewport projects, standalone-build infrastructure specs, deploy-script and VPS specs, Lighthouse, any real-device test | | | | **not run** (memory limits; not authorised or not possible) |
| Database-backed tests of either project | | | | **deferred by decision** (§12) |

Failures: **(1)** `phone-validation-loading.spec.ts:27` "the validator is fetched on demand: touching the phone field loads one more, small chunk" fails **every time (3 of 3 runs) on the dev server** — in dev the first touch of the field fetches the whole library chunk (`node_modules_libphonenumber-js_….js`, which contains the metadata marker), while the test (and the other session's measurements) assume a **production build** in which the metadata arrives after hydration with the rich input. Cause class: **environment / test assumption, not shown to be a code defect**; confirming it needs a production build served on 3101 (not done). **(2)** a second test in the same file (`…:138`, "library can never be loaded…") failed once with the harness error `apiResponse.text: Response has been disposed` and **passed in both re-runs**: flaky test harness (the other session reported and mitigated the same race). Skips: `accessibility.spec.ts:112` (no hamburger on desktop) and `design-integrity.spec.ts:90` (three-column layout only below `lg`) — by design.

---

## 10. Remaining limitations
Live CRM/SMTP/newsletter flows unverified (no staging, no credentials); no database-backed test run; no production build served or re-verified today; only Desktop Chrome UI tests were run in this audit (mobile projects not run); no Core Web Vitals or real-device data; the legal pages are unreviewed drafts; the working tree mixes approved and unapproved uncommitted work; a clean-room build was not performed; the original CRM's git repository is unusable with git.

---

## 11. Prioritized website improvement roadmap
Status key: **confirmed**, **suspected**, **already fixed**, **blocked**. All fixes below are **proposals — nothing was changed** and each needs your approval first.

### Critical
None found in the website.

### High
**W1 — A thrown server-action failure sends the visitor to the generic error page and loses the form** · updated website · High · **confirmed (dynamic probe)**
* Location: `src/components/contact/ContactForm.tsx:95-114`, `src/components/flight-form/FlightRequestForm.tsx:219-241` (`try/finally`, no `catch`), `src/components/newsletter/NewsletterForm.tsx:34-50`; fallback page `src/app/error.tsx`.
* Evidence: probe scenario A (§4.4): aborted POST → "This page hit an unexpected error", form removed, typed text lost.
* Impact: a dropped connection, a server restart or a framework rejection (over-size, origin check) costs the visitor their request and gives no retry path; real leads are lost.
* Root cause: only the action's *returned* failures are handled; exceptions inside `startTransition(async …)` propagate to the error boundary.
* Minimal fix: wrap each `await` in `try/catch` and set the existing inline error state ("We couldn't reach our server — your details are still here, please try again or call …"); keep the flight form's stable `submissionId` so a retry cannot create a second lead.
* Dependencies/risks: none beyond UI copy; the three forms share the same pattern.
* Approval: yes (code change in the updated website).
* Test: Playwright `page.route('**/contact', r => r.abort())` (the probe) for each form: form still present, inline error shown, typed values kept; plus a second submit after `route.continue()` creates one lead (stand-in CRM).

**W2 — The contact message is not idempotent end to end** · updated website + updated CRM · High · **confirmed (code)**
* Location: website `src/lib/crm-api/client.ts` (`postContactInquiry`, one attempt) and `src/server/actions/submit-contact-message.ts:62-84`; CRM `src/app/api/public/contact-inquiry/route.ts:11-19` (passes no `duplicateWindowMs`), `src/server/public-inquiry.ts:64-68,167-197` (the mechanism exists, "Off by default").
* Evidence: the route options list only `source`, `rateLimitEndpoint`, `rateLimit`, `serverToServer`.
* Impact: after a timeout the outcome is unknown; a visitor who presses send again can create two inbox items, and the website cannot safely retry, so some messages are lost.
* Root cause: the CRM's duplicate guard is not enabled for the website's route.
* Minimal fix: CRM — add `duplicateWindowMs: 10 * 60_000` to that route (and optionally `requirePhone: true`); website — then allow one bounded retry. (CRM change lands in a project with an unfinished merge; coordinate.)
* Dependencies/risks: CRM merge state; contract note in `docs/CRM_API_INTEGRATION.md` must change.
* Approval: yes (two projects; CRM is an implementation target).
* Test: stand-in CRM test: same message twice within the window → one inquiry; CRM integration test (database-backed, **deferred**).

### Medium
**W3 — Newsletter honeypot returns an error instead of a silent success (dead branch)** · website · Medium · **confirmed**
* Location: `src/lib/validations/newsletter.ts:5` (`website: z.string().max(0,"")`), `src/server/actions/subscribe-newsletter.ts:27-34` (the "honeypot tripped" branch is unreachable).
* Evidence: a filled honeypot fails `safeParse` first and returns "Please enter a valid email address." — the comment promises a silent success. Flight and contact likewise return a field error for a filled honeypot.
* Impact: tells bots which field tripped; inconsistent with the documented intent.
* Minimal fix: keep `website` out of the failing schema (accept any string), then return `{ ok: true }` before calling the CRM when it is non-empty (same for the other two forms if silent success is wanted).
* Risks: none. Approval: yes. Test: unit test — filled honeypot returns ok and the stand-in CRM is never called.

**W4 — No explicit server-action body limit; no oversize test** · website · Medium · **confirmed (absence)**
* Location: `next.config.ts` (no `serverActions` block); framework default 1 MB (Next docs, `server-actions.md`).
* Evidence: grep of `next.config.ts`; field maxima bound content, but not the request envelope.
* Impact: each request can make the server buffer up to 1 MB; legitimate requests are < 20 KB.
* Minimal fix: `experimental.serverActions.bodySizeLimit: "64kb"` (an independent, framework-native mechanism — **not** the CRM's `read-limited-json.ts`, which targets route handlers).
* Risks: must stay above the largest legal request (6 segments + 2000-char notes ≈ 8 KB); verify on a production build. Approval: yes. Test: POST an action body > 64 kB → refused; max legal flight request → accepted.

**W5 — Abuse protection is basic and mostly per process** · website · Medium · **confirmed**
* Location: `src/lib/rate-limit.ts`, `src/lib/rate-limit-client.ts`, `src/lib/anti-spam.ts`.
* Evidence: in-memory limiter (resets on restart, not shared across instances); `renderedAt` is client-supplied; no CAPTCHA; with `TRUSTED_PROXY` unset every request shares one `unresolved` bucket (8 per 10 min for all visitors of that instance — affects preview/testing, not a correctly configured production).
* Impact: moderate bot resistance; shared-bucket lockout risk if the proxy header is lost.
* Minimal fix options (decision): keep as is and rely on Cloudflare WAF rate rules; or add Turnstile; or a shared store if more than one instance is ever run.
* Approval: decision + code. Test: existing `rate-limit-client` / `rate-limit-actions-e2e` specs (the latter needs a standalone build).

**W6 — Legal pages are unreviewed drafts; privacy/consent changes are uncommitted** · website · Medium (production blocker) · **confirmed, blocked on counsel**
* Location: `docs/LEGAL.md`, `src/app/privacy-policy/page.tsx`, `src/components/flight-form/QuoteConsentNotice.tsx`, `src/app/terms-of-service/page.tsx` (governing law deliberately absent).
* Impact: cannot be published to real customers per the project's own document. **No wording was changed.** Approval: yours and counsel's.

**W7 — The uncommitted state mixes approved and unapproved work** · website · Medium · **confirmed**
* Evidence: 100 entries — port edits in `package.json`/`playwright.config.ts`/`scripts/validate-seo.mjs`/`README.md`, 79 archive files and 3 brand images under `docs/`, held legal files, phone-validation work, this audit's reports. A blanket `git add` would commit all of it.
* Minimal fix: decide per group; add explicit staging only. Note `package.json` `dev`/`start` hard-code `-p 3101` (container production runs `node server.js` on 3000 and is unaffected; a non-Docker host using `npm start` would be forced to 3101 because `-p` overrides `PORT`).
* Approval: yes (commit decisions are yours).

**W8 — Placeholder imagery (212 Unsplash URLs)** · website · Medium (business) · **confirmed** — `next.config.ts` states they are development placeholders; 30 of 212 sampled URLs were reachable (previous audit); licensing/availability is unresolved. Approval: yours.

**W9 — Shared JavaScript weight and the 1 MB `/destinations` document** · website · Medium · **confirmed (static)** — about 217 KB gzip (690 KB raw) of JS on every content page; `/destinations` HTML 1,057 KB raw / 55 KB gzip with 190 images. Minimal fix to investigate: paginate or virtualise the destination grid; analyse the shared bundle with the existing `npm run analyze`. Test: Lighthouse/field CWV (not measured). Approval: yes.

**W10 — The phone-validation spec is not dev-server safe** · website tests · Medium · **confirmed** (§9) — `tests/phone-validation-loading.spec.ts:27-37` (deterministic on the dev server) and a flaky `Response has been disposed` race (`…:138`). Minimal fix: run it against a production build in the release gate, skip/adapt it in dev, and read response bodies before the page closes. Approval: yes (test change). Test: 5× repeat on `next start`.

**W11 — Mobile and real-device coverage is missing** · website · Medium · **blocked** — only Desktop Chrome UI tests were run now; mobile viewport projects and iOS/Android devices were not tested.

### Low
**W12 — Next's dev mode prints server-action arguments, including email addresses, to the console** · website (framework behaviour) · Low · **confirmed** — seen in the 3101 log for the probe's synthetic email. Production (`next start`) does not. Action: never run a dev server on a shared/public host or keep its logs. No change needed.
**W13 — HTML cache header and CSP posture** · Low · confirmed — static pages send `s-maxage=31536000` (verify the Cloudflare cache rule); CSP allows `'unsafe-inline'`.
**W14 — Dev-server compile hiccup** · Low · **suspected environmental, not reproducible** — one HTTP 500 (`SyntaxError: Unexpected end of JSON input` in Next's dev compile) on 1 of 218 routes under memory pressure; 3 retries OK.
**W15 — Google Fonts at build time** · Low · confirmed — `next/font/google` needs network on a clean build.
**W16 — A contact form mismatch worth documenting** · Low · `QuoteConsentNotice` is wired into the flight form only; the contact form has no consent text (by the legal decision on file).

### Integration items filed against both projects
**I1 — The CRM contract relies on an uncommitted merge** · updated CRM/website · High (process) · **confirmed** — `MERGE_HEAD c6b8d8e`, 15 incoming commits, 79 staged entries; the idempotency-fingerprint behaviour the website expects is inside it. Do not run `git merge --abort`; decide to complete and commit it (your approval).
**I2 — No effective CRM-side per-visitor rate limit for website-mediated contact/newsletter** · High/Medium · **confirmed (code)** — `src/server/security/rate-limit.ts:55-58` returns "allowed" when `getClientIp` is undefined, which is always the case for server-to-server calls without a Cloudflare header; the website's in-memory limiter is the only per-visitor control. Fix options: the CRM keys these two public routes on the signed visitor context, or an edge rate rule. Approval: yes.
**I3 — Live integration verification is blocked** · **blocked** — needs a staging CRM, a website key, a test company and a test mailbox; none exists. Nothing was sent.

---

## 12. Database-dependent work still deferred (by your decision)
Database-backed CRM integration tests (25 files, 569 tests skipped), Prisma migrations against a test database, the sequence advisory-lock concurrency test, the six website-to-CRM contract tests, and database-backed browser flows. **None passed and none was attempted**; no PostgreSQL was installed or configured; no database guard was changed.

## 13. Actions not completed safely
* Starting the original CRM on 3000 — blocked (remote database URL in its `.env`).
* Stopping the updated CRM's dev server — denied by the permission classifier; not retried another way.
* Production-build verification of the phone-validation test, mobile test projects, standalone-build infrastructure specs, Lighthouse, live integration — not run (see §9/§10).

## Implementation and verification - 2026-11-13 (added after the audit above; the audit text is unchanged)

Changes are in `Travel Agency Website-updated` (and, for W2, the CRM's working tree). The originals were not modified, nothing was staged or committed,
nothing was deployed. Summary with all test totals: `docs/IMPLEMENTATION_SUMMARY_2026-11-13.md`.

| Finding | Outcome |
|---|---|
| W1 server-action failure handling | **Fixed.** `src/lib/safe-action.ts` + the three forms: inline message, input kept, no auto-retry, no false success, own `busy` flag (React kept the transition pending after our time limit - found by the new no-answer test). 12 unit tests + a real-browser e2e on the standalone build for contact, newsletter and flight (call failures, no answer, CRM 400/401/403/429/500/wrong shape, double click). |
| W2 contact idempotency | **Fixed (website half), CRM half mocked-DB tested.** `submissionId` = form id + hash of the typed fields; documented in `docs/CRM_API_INTEGRATION.md`; backward compatible both ways. |
| W3 newsletter honeypot | **Fixed.** A filled honeypot is silently discarded before email validation (same reply as success, no CRM call). |
| W4 body-size limit | **Fixed.** 64 KB, pinned by a 10-test standalone spec. Next refuses oversize bodies before the action runs but answers HTTP 200 with an opaque error row (Next's own TODO for 413). |
| W10 phone-validation spec | **Investigated, not a product defect, assertions unchanged.** `:27` fails only on the Turbopack dev server (the on-demand chunk is the library chunk and contains the metadata marker there); on the production build the whole file passes 14/14. The `:138` flake did not reproduce. |
| W5-W9, W11-W16 | Not changed; recommendations stand. W16-adjacent: the contact form's honeypot has the same `max(0)` schema flaw W3 had - recommended follow-up. |

Totals this pass: `tsc` 0 errors, ESLint 0 problems, Desktop Chrome project 333 passed / 1 failed (`:27`, dev only) / 2 skipped, Infrastructure project
161 passed / 0 failed / 6 skipped (opt-in live-CRM spec), `validate:content` and `validate:seo` passed, standalone production build succeeded.
Not run: Mobile 320/375/390 projects, the live-CRM contract spec, anything database-dependent.
