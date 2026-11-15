# Website source parity and reconciliation - 2026-11-13

Target: `F:\Claude Workspace\Travel Agency Website-updated` (the only implementation target). Reference only: `F:\Claude Workspace\Travel Agency Website` (**not modified**).
No CRM project was opened. Nothing was deployed, committed, staged, pushed or changed in production; no production credential, e-mail or submission was used.

**Result in one paragraph.** The updated website contains every visitor-facing page, component, data file and public asset of the original (identical route,
component, data and asset sets; the updated one has two additions), plus all the improvements implemented on 2026-11-13 (verified present and re-tested).
Everything the original has and the updated project lacks is database tooling that the API-only architecture deliberately removed, local AI-tooling state, or a
capability already replaced by the CRM API integration. One supporting file was genuinely missing and was restored (`CLAUDE.md`). One test file was hardened
(a hydration race in my own earlier spec). Two items need your decision (section C, category F). Deployment to the VPS is **blocked by prerequisites outside this
repository** (section G).

## A. Baseline

| | Original (reference) | Updated (target) |
|---|---|---|
| Path | `F:\Claude Workspace\Travel Agency Website` | `F:\Claude Workspace\Travel Agency Website-updated` |
| Branch / HEAD | `feature/vps-website` / `10fe079` | `work/website-crm-api-integration` / `d1d1b61` (ten commits on top of `10fe079`; the updated repository contains the original's history) |
| Staged | 0 | 0 |
| Unstaged / untracked (git status) | 24 / 11 (database runtime-role work, release-validation harness, 2 contact-phone constants) | 22 / 95 (CRM API, phone validation, legal wording, docs, archive) |
| Merge state | none | none |
| Package manager / key versions | npm; next 16.3.1, react 19.2.8; Prisma 7, pg | npm; next 16.4.2, react 19.2.8; no Prisma, no pg |
| Git health | repository answers (read-only commands only; index file timestamp unchanged) | healthy |
| Env files (names only) | `.env`, `.env.example`, `.env.vps.example` | `.env.example`, `.env.vps.example` |
| Docker / deploy | `Dockerfile`, `.dockerignore`, `compose.yaml`, `deploy/*` (9 files) | same names, API-only content (6 files) |
| Hashed files (outside `.git`, `node_modules`, `.next`, test output) | 331 | 290 (+ `CLAUDE.md`, added in this task) |
| Generated/tooling (counted, not hashed) | `.agents` 783, `.claude` 6, `.git` 1,001, `.next` 4,190, `node_modules` 48,222 | `.claude` 1, `.git` 148, `.next` 7,345, `node_modules` 38,315 |
| Routes (both) | 24 route/layout/metadata files: /, /about, /blog, /blog/[slug], /business-class, /contact, /cookie-policy, /destinations, /destinations/[region]/[country]/[city], /flights, /how-it-works, /privacy-policy, /terms-of-service, /api/health, robots, sitemap, manifest, opengraph/twitter images, error/global-error/not-found | identical set |
| Server actions / API routes | 3 actions (flight, contact, newsletter) writing to the database; /api/health | 3 actions calling the CRM over HTTP (`src/lib/crm-api/*`); /api/health (no database) |

Hash inventory: SHA-256 of every file (raw and line-ending-normalised), taken at the start of this task for both projects (working files kept outside both repositories).
Before/after comparison of the updated project: **2 files added (`CLAUDE.md` and this report), 1 modified (`tests/form-failure-recovery-e2e.spec.ts`), 0 removed**; original: 0 added, 0 modified, 0 removed;
the updated repository's index file hash is unchanged (nothing staged), HEAD and branch unchanged. Existing uncommitted work in the updated project was left exactly as it was.

## B. File comparison

Totals: present in both **177** (identical byte-for-byte 22, identical apart from line endings 81, different 74); original-only **154**; updated-only **113** (79 of them are the workspace archive).
Because the updated repository contains the original's history, a three-way comparison (base `10fe079`) was used to tell "original is newer" from "updated is newer".

**Original-only files (154).** None is a page, component, data file, asset or visitor-facing code file.

| File | Cat. | Reason |
|---|---|---|
| `prisma/migrations/*` (56 files incl. `migration_lock.toml`) | C | the CRM owns the schema; the website has no database |
| `src/generated/prisma/*` (47 files) | D | generated Prisma client |
| `.codex/hooks.json` | E | local AI-tooling state tied to the original's `.agents/` skills folder |
| `.env` | E | local secrets - never copied, never read |
| `CLAUDE.md` | B | restored (exact copy) |
| `deploy/sql/verify-website-runtime-role.sql` | D | PostgreSQL runtime-role SQL: no database on the website |
| `deploy/sql/website-runtime-role-grants.sql` | D | PostgreSQL runtime-role SQL: no database on the website |
| `deploy/sql/website-runtime-role-settings.sql` | D | PostgreSQL runtime-role SQL: no database on the website |
| `prisma/schema.prisma` | C | database schema/migrations: the website has no database any more (the CRM owns them) |
| `prisma.config.ts` | C | database schema/migrations: the website has no database any more (the CRM owns them) |
| `scripts/generate-migration-bundle.mjs` | D | database verification / bundle tooling |
| `scripts/generate-schema-shape.mjs` | D | database verification / bundle tooling |
| `scripts/prepare-self-hosted-e2e-db.ts` | D | database verification / bundle tooling |
| `scripts/release-validation.mjs` | F | original's release-validation harness (database-oriented, uncommitted); decision needed whether to port an API-only equivalent |
| `scripts/support/admin-url.ts` | F | original's release-validation harness (database-oriented, uncommitted); decision needed whether to port an API-only equivalent |
| `scripts/support/disposable-guard.ts` | F | original's release-validation harness (database-oriented, uncommitted); decision needed whether to port an API-only equivalent |
| `scripts/vercel-build.mjs` | D | Vercel + migrations build; deployment target is the VPS (Docker) |
| `scripts/verify-initialized-schema.ts` | D | database verification / bundle tooling |
| `scripts/verify-runtime-role-pg.ts` | D | database verification / bundle tooling |
| `scripts/verify-runtime-role.ts` | D | database verification / bundle tooling |
| `scripts/verify-tls-real-pg.ts` | D | database verification / bundle tooling |
| `skills-lock.json` | E | local AI-tooling state tied to the original's `.agents/` skills folder |
| `src/lib/db-error.ts` | C | direct-database module replaced by src/lib/crm-api/* and src/server/crm-api.ts |
| `src/lib/db-tls.ts` | C | direct-database module replaced by src/lib/crm-api/* and src/server/crm-api.ts |
| `src/lib/migration-bundle.generated.ts` | C | direct-database module replaced by src/lib/crm-api/* and src/server/crm-api.ts |
| `src/lib/prisma.ts` | C | direct-database module replaced by src/lib/crm-api/* and src/server/crm-api.ts |
| `src/lib/readiness-cache.ts` | C | direct-database module replaced by src/lib/crm-api/* and src/server/crm-api.ts |
| `src/lib/schema-guard.ts` | C | direct-database module replaced by src/lib/crm-api/* and src/server/crm-api.ts |
| `src/lib/schema-shape.generated.ts` | C | direct-database module replaced by src/lib/crm-api/* and src/server/crm-api.ts |
| `src/lib/submission-id.ts` | C | derived lead id -> replaced by the CRM `Idempotency-Key` (flight) and `submissionId` (contact) |
| `src/server/contact.ts` | C | direct-database module replaced by src/lib/crm-api/* and src/server/crm-api.ts |
| `src/server/create-website-lead.ts` | C | direct-database module replaced by src/lib/crm-api/* and src/server/crm-api.ts |
| `src/server/crm-company.ts` | C | direct-database module replaced by src/lib/crm-api/* and src/server/crm-api.ts |
| `src/server/lead-distribution.ts` | C | queue assignment now done by the CRM on lead creation (docs/CRM_API_INTEGRATION.md); live behaviour unverified here |
| `src/server/save-submission-info.ts` | C | IP/location now sent as a signed visitor context (src/lib/crm-api/visitor-context.ts) |
| `src/server/schema-ready.ts` | C | direct-database module replaced by src/lib/crm-api/* and src/server/crm-api.ts |
| `tests/cleanup-and-server-identity-release-safeguards.spec.ts` | C | server-identity guard exists in tests/support/standalone-server.ts; release harness itself is F (see scripts/release-validation.mjs) |
| `tests/db-error.spec.ts` | D | database / Vercel test |
| `tests/db-tls-driver.spec.ts` | D | database / Vercel test |
| `tests/db-tls-real-pg.spec.ts` | D | database / Vercel test |
| `tests/integration-gate.spec.ts` | D | database integration gate |
| `tests/own-server-release-safeguards.spec.ts` | C | server-identity guard exists in tests/support/standalone-server.ts; release harness itself is F (see scripts/release-validation.mjs) |
| `tests/readiness-cache.spec.ts` | D | database / Vercel test |
| `tests/release-safeguards.spec.ts` | C | server-identity guard exists in tests/support/standalone-server.ts; release harness itself is F (see scripts/release-validation.mjs) |
| `tests/runtime-role-e2e.spec.ts` | D | database / Vercel test |
| `tests/runtime-role-pg-e2e.spec.ts` | D | database / Vercel test |
| `tests/schema-guard-repair.spec.ts` | D | database / Vercel test |
| `tests/schema-guard.spec.ts` | D | database / Vercel test |
| `tests/schema-init-e2e.spec.ts` | D | database / Vercel test |
| `tests/support/base-url-policy.ts` | F | fail-closed TEST_BASE_URL policy (refuses non-loopback targets for form-submitting tests); needs a decision - see section D |
| `tests/support/integration-gate.ts` | D | database integration gate |
| `tests/support/own-server.ts` | C | server-identity guard exists in tests/support/standalone-server.ts; release harness itself is F (see scripts/release-validation.mjs) |
| `tests/vercel-build.spec.ts` | D | database / Vercel test |

**Updated-only files (113; 79 are `docs/workspace-archive/*`).**
`docs/brand-assets/Latest.jpg`, `docs/brand-assets/Latest.png`, `docs/brand-assets/Latest1.png`, `docs/BUSINESS_FLIGHTS_WEBSITE_INDEPENDENCE_AND_COMPLETENESS_AUDIT_2026-11-13.md`, `docs/CRM_API_INTEGRATION.md`, `docs/FOUR_PROJECT_INDEPENDENCE_AND_WEBSITE_AUDIT_2026-11-13.md`, `docs/IMPLEMENTATION_SUMMARY_2026-11-13.md`, `docs/IP_AND_LOCATION_CAPTURE.md`, `docs/UPDATED_PROJECT.md`, `src/components/flight-form/QuoteConsentNotice.tsx`, `src/hooks/useScrollPopoverIntoView.ts`, `src/lib/crm-api/client.ts`, `src/lib/crm-api/config.ts`, `src/lib/crm-api/flight-inquiry.ts`, `src/lib/crm-api/visitor-context.ts`, `src/lib/focus-field-error.ts`, `src/lib/json-ld.ts`, `src/lib/phone-validator.ts`, `src/lib/safe-action.ts`, `src/server/crm-api.ts`, `tests/contact-details-and-consent.spec.ts`, `tests/contact-form-autocomplete.spec.ts`, `tests/crm-api-actions-e2e.spec.ts`, `tests/crm-api-client.spec.ts`, `tests/crm-contract-live.spec.ts`, `tests/date-range.spec.ts`, `tests/design-integrity.spec.ts`, `tests/form-failure-recovery-e2e.spec.ts`, `tests/json-ld.spec.ts`, `tests/phone-validation-loading.spec.ts`, `tests/safe-action.spec.ts`, `tests/server-action-body-limit-e2e.spec.ts`, `tests/support/standalone-server.ts`, `tests/support/stub-crm.ts`.
Purpose: the CRM API client and visitor-context signer (`src/lib/crm-api/*`, `src/server/crm-api.ts`), form-failure handling (`src/lib/safe-action.ts`), the lazy phone validator (`src/lib/phone-validator.ts`), a quote-consent notice, focus/scroll helpers, a JSON-LD helper, and their tests and docs.

**Different content (74).** For 61 of them the original is *unchanged since the shared base*, so the difference is purely the updated project's own work (retained). The 13 where the original has newer uncommitted work are examined in section C.
`.dockerignore`, `.env.example`, `.env.vps.example`, `.gitignore`, `AGENTS.md`, `DESIGN.md`, `Dockerfile`, `README.md`, `compose.yaml`, `deploy/common.sh`, `deploy/preflight.sh`, `docs/DEPLOYMENT_VPS.md`, `docs/ENVIRONMENT.md`, `docs/LEGAL.md`, `docs/PRODUCTION_READINESS.md`, `next-env.d.ts`, `next.config.ts`, `package-lock.json`, `package.json`, `playwright.config.ts`, `scripts/validate-seo.mjs`, `src/app/about/page.tsx`, `src/app/api/health/route.ts`, `src/app/blog/[slug]/page.tsx`, `src/app/business-class/page.tsx`, `src/app/destinations/[region]/[country]/[city]/page.tsx`, `src/app/error.tsx`, `src/app/global-error.tsx`, `src/app/globals.css`, `src/app/layout.tsx`, `src/app/not-found.tsx`, `src/app/privacy-policy/page.tsx`, `src/components/Reveal.tsx`, `src/components/blog/RichContent.tsx`, `src/components/consent/CookieConsent.tsx`, `src/components/contact/ContactForm.tsx`, `src/components/destinations/DestinationCard.tsx`, `src/components/flight-form/AirportAutocomplete.tsx`, `src/components/flight-form/DateField.tsx`, `src/components/flight-form/FlightRequestForm.tsx`, `src/components/flight-form/PassengerCabinField.tsx`, `src/components/flight-form/SegmentRow.tsx`, `src/components/forms/PhoneNumberField.tsx`, `src/components/home/Hero.tsx`, `src/components/layout/FloatingDealsButton.tsx`, `src/components/layout/Footer.tsx`, `src/components/legal/LegalLayout.tsx`, `src/components/newsletter/NewsletterForm.tsx`, `src/components/sections/DestinationsPreview.tsx`, `src/components/sections/HomeFAQ.tsx`, `src/components/sections/HowItWorksSteps.tsx`, `src/components/sections/NewsletterSection.tsx`, `src/components/sections/PopularRegions.tsx`, `src/components/sections/Testimonials.tsx`, `src/data/how-it-works.ts`, `src/lib/client-ip.ts`, `src/lib/constants.ts`, `src/lib/email/flight-request-notification.ts`, `src/lib/email/mailer.ts`, `src/lib/ip-geo.ts`, `src/lib/validations/contact.ts`, `src/lib/validations/flight-request.ts`, `src/lib/validations/newsletter.ts`, `src/server/actions/submit-contact-message.ts`, `src/server/actions/submit-flight-request.ts`, `src/server/actions/subscribe-newsletter.ts`, `tests/accessibility.spec.ts`, `tests/deploy-scripts.spec.ts`, `tests/flight-request-notification.spec.ts`, `tests/rate-limit-actions-e2e.spec.ts`, `tests/self-hosted-e2e.spec.ts`, `tests/seo.spec.ts`, `tests/submission-ip.spec.ts`, `tests/vps-deployment.spec.ts`

**Identical (103 outside the archive, plus 0 archive files).** Includes all 14 public assets, all data files, all blog/destination content, the favicon/icon set and `.gitattributes`:
`.gitattributes`, `deploy/deploy.sh`, `deploy/rollback.sh`, `deploy/verify-responses.mjs`, `deploy/verify.sh`, `docs/seo-audit-2026-10-16/README.md`, `docs/seo-audit-2026-10-16/destinations.csv`, `docs/seo-audit-2026-10-16/pages.csv`, `docs/seo-audit/README.md`, `docs/seo-audit/gsc-affected-urls-2026-09-24.csv`, `docs/seo-audit/gsc-affected-urls-2026-09-27.csv`, `eslint.config.mjs`, `postcss.config.mjs`, `public/airlines/aa.png`, `public/airlines/ek.png`, `public/airlines/ey.png`, `public/airlines/lh.png`, `public/airlines/nh.png`, `public/airlines/qf.png`, `public/airlines/qr.png`, `public/airlines/sq.png`, `public/airlines/tk.png`, `public/brand/logo-mark-b.png`, `public/brand/logo-navy.png`, `public/brand/logo-white.png`, `public/icon-192.png`, `public/logo.png`, `scripts/audit-seo-inventory.mjs`, `scripts/build-airports-data.mjs`, `scripts/healthcheck.mjs`, `scripts/validate-content.mjs`, `src/app/apple-icon.png`, `src/app/blog/page.tsx`, `src/app/brand-mark.png/route.tsx`, `src/app/contact/page.tsx`, `src/app/cookie-policy/page.tsx`, `src/app/destinations/page.tsx`, `src/app/favicon.ico`, `src/app/flights/page.tsx`, `src/app/how-it-works/page.tsx`, `src/app/icon.png`, `src/app/manifest.ts`, `src/app/opengraph-image.tsx`, `src/app/page.tsx`, `src/app/robots.ts`, `src/app/sitemap.ts`, `src/app/terms-of-service/page.tsx`, `src/app/twitter-image.tsx`, `src/components/MotionProvider.tsx`, `src/components/Toaster.tsx`, `src/components/blog/PostCard.tsx`, `src/components/brand/AirlineLogo.tsx`, `src/components/brand/Logo.tsx`, `src/components/brand/PaymentIcons.tsx`, `src/components/consent/CookieSettingsLink.tsx`, `src/components/consent/DeferredCookieConsent.tsx`, `src/components/flight-form/DayPickerCalendar.tsx`, `src/components/forms/FieldError.tsx`, `src/components/forms/PhoneInputRich.tsx`, `src/components/layout/AirlineStrip.tsx`, `src/components/layout/DeferredFloatingDealsButton.tsx`, `src/components/layout/DestinationsMegaMenu.tsx`, `src/components/layout/Header.tsx`, `src/components/sections/BlogPreview.tsx`, `src/components/sections/BusinessClassHighlights.tsx`, `src/components/sections/CTASection.tsx`, `src/components/sections/HomeSeoSection.tsx`, `src/components/sections/PopularAirlines.tsx`, `src/components/sections/TrustSection.tsx`, `src/data/airlines.ts`, `src/data/airports.json`, `src/data/airports.ts`, `src/data/blog-posts.ts`, `src/data/destinations.ts`, `src/data/testimonials.ts`, `src/hooks/useClickOutside.ts`, `src/hooks/usePopoverAlign.ts`, `src/lib/anti-spam.ts`, `src/lib/cn.ts`, `src/lib/consent.ts`, `src/lib/destination-content.ts`, `src/lib/email/smtp-helpers.ts`, `src/lib/fares.ts`, `src/lib/format-date.ts`, `src/lib/motion-features.ts`, `src/lib/og-image.tsx`, `src/lib/phone.ts`, `src/lib/rate-limit-client.ts`, `src/lib/rate-limit.ts`, `src/lib/related-destinations.ts`, `src/lib/seo.ts`, `src/lib/submission-info.ts`, `src/lib/validate.ts`, `src/lib/validations/contact-options.ts`, `src/lib/validations/flight-request-options.ts`, `src/server/queries/airports.ts`, `tests/anti-spam.spec.ts`, `tests/error-boundaries.spec.ts`, `tests/rate-limit-client.spec.ts`, `tests/redesign.spec.ts`, `tests/related-destinations.spec.ts`, `tests/smtp-helpers.spec.ts`, `tsconfig.json`

**Renamed / relocated / equivalent under another name.**
| Original | Updated |
|---|---|
| `src/lib/submission-id.ts` (`deriveLeadId`) | the CRM's `Idempotency-Key` (flight) and `submissionId` (contact) in `src/lib/crm-api/client.ts`, `submit-*.ts` |
| `src/server/create-website-lead.ts`, `contact.ts`, `lead-distribution.ts`, `crm-company.ts` | `src/lib/crm-api/flight-inquiry.ts`, `client.ts`, `src/server/crm-api.ts` (company id from `CRM_COMPANY_ID`; queue distribution done by the CRM) |
| `src/server/save-submission-info.ts` | signed visitor context (`src/lib/crm-api/visitor-context.ts`, `docs/IP_AND_LOCATION_CAPTURE.md`) |
| `src/lib/schema-guard.ts`, `readiness-cache.ts`, `/api/health` DB probe | `/api/health` answers without any CRM or database |
| `tests/support/own-server.ts` | `tests/support/standalone-server.ts` (starts and identifies its own server before any request) |

**Intentionally excluded (never copied):** `.git/`, `node_modules/`, `.next/`, `.env` (secrets; not read), `.agents/`, `.claude/` skills, build output, caches, test output, the original's `package.json`/lockfile.

## C. Functional comparison and classification

Legend: **Both** = present in both; **Improved** = present in both, the updated implementation is newer; **Replaced** = original mechanism replaced by an equivalent one; **Unverified** = depends on something not testable here.

| Feature | Status | Evidence |
|---|---|---|
| Home, About, Contact, Flights, Destinations (+171 city pages), Blog (+36 articles), How it works, Business class | Both / Improved (a11y, SEO, contact details) | identical route set; `validate:content` and `validate:seo` pass (218 routes) |
| Privacy Policy, Terms, Cookie policy | Both / Improved (privacy wording is uncommitted work in the updated project; legal wording stays held for your review) | diff vs base; `LEGAL.md` |
| Header, footer, mobile navigation, floating deals button | Both / Improved (unverified-rating stars replaced by a neutral icon; sr-only "opens in a new tab") | component diffs |
| Flight request: one-way, round-trip, multi-city, passengers, cabin, airports, date range, validation, loading/success/error, duplicate protection | Both / Improved (range calendar, focus-on-error, idempotency key, inline failure handling) | 333 browser tests per viewport; `tests/date-range.spec.ts`; e2e |
| Contact form (validation, phone, spam protection, success/error) | Both / Improved (+ `submissionId`) | e2e and client specs |
| Newsletter (validation, honeypot, success/error) | Both / Improved (honeypot now silent) | `crm-api-actions-e2e` |
| Phone and email links, contact details | Both / Improved - the original holds only a *partial* update (new phone, old address and e-mail); the updated project has the complete, committed update (`ceb7534`) | `contact-details-and-consent.spec.ts` |
| Cookie consent banner | Both / Improved | diff; a11y spec |
| Analytics / tracking scripts | None in either project | grep of `src` and config |
| SEO metadata, JSON-LD (connected `@id`s), Open Graph, sitemap, robots, manifest | Both / Improved | `seo.spec`, `json-ld.spec`, `validate:seo` |
| Accessibility | Both / Improved (17 a11y tests vs 10) | `accessibility.spec.ts` |
| Responsive design, animations, lazy loading, image optimisation | Both / Improved (reveal-on-scroll without invisible first paint, lazy phone library) | `design-integrity`, `redesign`, `phone-validation-loading` |
| Error / not-found pages | Both | `error.tsx`, `global-error.tsx`, `not-found.tsx` |
| Security headers, CSP, `poweredByHeader:false` | Both / Improved (+ 64 KB action body limit) | `next.config.ts` |
| Writing to the database, lead queue distribution, runtime-role/TLS/schema guards | **Replaced** - the website must have no database; the CRM does this (queue distribution on lead creation). **Unverified live** against a real CRM | `docs/CRM_API_INTEGRATION.md`; `crm-contract-live.spec.ts` is opt-in and was **not run** |
| Vercel deployment build | Obsolete - deployment is the VPS (Docker) | `Dockerfile` / `compose.yaml` |

**Original work newer than the shared base (13 files where the updated file differs).**
| File(s) | Finding | Cat. |
|---|---|---|
| `src/lib/constants.ts`, `src/app/global-error.tsx`, `tests/seo.spec.ts` | original changed only the contact **phone** (to +1 (415) 570-9267) and kept the old e-mail/address; the updated project carries the same number (display "+1 415 570 9267", E.164 identical) with the new e-mail and address | C |
| `src/server/actions/submit-contact-message.ts`, `subscribe-newsletter.ts` | original's edits are two or three Prisma `select` clauses; the updated actions call the CRM instead | C |
| `package.json`, `package-lock.json`, `playwright.config.ts`, `docs/DEPLOYMENT_VPS.md`, `tests/{deploy-scripts,rate-limit-actions-e2e,self-hosted-e2e,vps-deployment}.spec.ts` | database release work (`test:release`, base-URL policy, runtime-role checks) | C/D, except the base-URL policy (F) |

**Classification of every finding**

* **Category A (required functionality missing): none.**
* **Category B (missing supporting file): `CLAUDE.md`** - restored.
* **Category C (replaced/improved): all database modules, lead queue, submission info, `submission-id`, contact details, UI diffs.**
* **Category D (obsolete): Prisma schema/client/migrations, runtime-role SQL and scripts, schema/TLS/readiness tests, Vercel build and its test, database integration gate.**
* **Category E (environment-specific, not copied): `.env`, `.codex/hooks.json`, `skills-lock.json`, `.agents/`, `.claude/` skills.**
* **Category F (needs your decision):**
  1. **`tests/support/base-url-policy.ts` + its `playwright.config.ts` wiring.** A fail-closed guard so form-submitting browser tests refuse a non-loopback `TEST_BASE_URL`. Valuable before the first production release (the browser tests submit real forms), but it changes `playwright.config.ts`, every test run and the documented defaults (it hard-codes port 3100), and it belongs to the original's uncommitted, held release work. Recommended: port it with default 3101 as a separate small change.
  2. **`scripts/release-validation.mjs` + `scripts/support/*` + the release-safeguards specs.** The original's database-oriented release harness. The updated project deliberately did not carry it (`docs/UPDATED_PROJECT.md`). Decide whether an API-only equivalent (build, start own server, run Infrastructure with zero skipped/flaky) is wanted.

## D. Reconciliation

| Item | What was missing | Change | Files | Why it is safe | Verified by |
|---|---|---|---|---|---|
| Claude Code project pointer | `CLAUDE.md` (`@AGENTS.md`) existed only in the original, so a session in the updated folder would not load `AGENTS.md` | exact copy added (it is git-ignored, like in the original) | `CLAUDE.md` | 11 bytes, no code, no runtime effect | hash equal to the original's |
| Test hardening | my own `form-failure-recovery-e2e` spec could click Subscribe before React hydrated (one flaky first attempt in the full run) | the drivers now wait for the page to settle after navigation; assertions unchanged | `tests/form-failure-recovery-e2e.spec.ts` | test-only | 35/35 passed with retries disabled |

No other file was added, removed or changed. No Category A/B item required code changes to forms, the CRM client, layouts or configuration.

## E. Preserved improvements (2026-11-13) - status verified in source and by tests

| Improvement | Present | Evidence |
|---|---|---|
| Form failure handling (inline message, input kept, no auto-retry, no false success, own busy flag, manual retry) | **Yes** | `src/lib/safe-action.ts`; `callAction`, `setBusy` and `role="alert"` in all three forms; 12 unit tests + 35 browser e2e tests (retries off) |
| Contact `submissionId` (form id + hash of the typed fields; one attempt per press; duplicate/409 handled; absent key = old behaviour) | **Yes** | `ContactForm.tsx`, `submit-contact-message.ts`, `crm-api/client.ts`; client + action specs; documented in `docs/CRM_API_INTEGRATION.md`. **Compatibility is proven against the stand-in CRM only**, not a live CRM |
| Newsletter honeypot (silent, same reply, no CRM call) | **Yes** | `subscribe-newsletter.ts`; `crm-api-actions-e2e` |
| 64 KB Server Action body limit on Next 16.4.2 | **Yes** | `next.config.ts`; 10-test body-limit spec (just below/above, 5 MB, malformed, content types) |
| Phone validation (lazy library, messages, a11y, keyboard, early submit, failed load) | **Yes** | `src/lib/phone-validator.ts`; `phone-validation-loading.spec.ts` (assertions unchanged) |
| Dependencies, lockfile, Next config, standalone production build | **Yes** | `package.json` (no Prisma/pg), lockfile, build succeeded |
| No CRM code, no database access in the website | **Yes** | 0 imports of CRM code; 0 files mention Prisma/`DATABASE_URL`/`pg` |

## F. Test results (this task, 2026-11-13, updated project)

Servers: 3101 = `Travel Agency Website-updated` (dev, PID verified), 3100 = original (reference, not used); no process was stopped or restarted and no port was changed. Harness test ports (3231-3243) were used only for standalone servers started and stopped by the tests.

| Check | Passed | Failed | Skipped | Flaky (passed on retry) | Notes |
|---|---|---|---|---|---|
| `tsc --noEmit` | clean | 0 | - | - | |
| ESLint (whole project) | clean | 0 | - | - | |
| Production build (`NEXT_OUTPUT=standalone npm run build`) | succeeded | - | - | - | |
| Desktop Chrome (336 tests, dev server 3101) | 332 | 1 | 2 | 1 | failure = `phone-validation-loading.spec.ts:27`; flaky = `redesign.spec.ts:335` |
| Mobile 320 (336) | 333 | 1 | 2 | 0 | same `:27` |
| Mobile 375 (336) | 332 | 1 | 2 | 1 | same `:27`; flaky = phone spec `:178` |
| Mobile 390 (336) | 333 | 1 | 2 | 0 | same `:27` |
| Infrastructure (167 tests, standalone build + stub CRM + deploy-script dry runs) | 160 | 0 | 6 | 1 | skipped = opt-in live-CRM spec (no CRM target authorised); flaky = a form-failure test (hydration race, fixed afterwards) |
| `form-failure-recovery-e2e` after the fix, retries off | 35 | 0 | 0 | 0 | |
| `phone-validation-loading.spec.ts` on the **production** build | 14 (three of four runs) | 1 once | 0 | - | first run 13/14 (`:129`, a timing race that does not reproduce), then 14/14 three times in a row |
| `validate:content` / `validate:seo` | both pass | - | - | - | 218 routes, 0 failures |
| Not run | - | - | - | - | the opt-in live-CRM contract spec (needs an authorised isolated CRM); any real submission or e-mail |

**The outstanding phone-validation browser failure remains:** `phone-validation-loading.spec.ts:27` ("the validator is fetched on demand...") fails on the Turbopack **dev** server in all four viewport projects, deterministically, because the lazily loaded chunk is the library chunk and contains the metadata marker there. On the **production** build the same test passes. Assertions were not changed. The three flaky retries are timing races that depend on machine load (the run was about 70 % slower than the previous day's); each passed on its automatic retry, and the two that I could isolate (the phone spec on production, the form-failure spec) pass repeatedly in isolation.

## G. Deployment compatibility - outstanding requirements and blockers (nothing was deployed or changed)

The updated website is **not** a drop-in replacement for what the VPS runs today. Differences from the original's deployment (`Dockerfile`, `compose.yaml`, `.env.vps.example`, `deploy/preflight.sh`, `deploy/common.sh`):

1. **Different architecture.** Original: the container holds `DATABASE_URL` and joins `compass-tools_internal` to reach PostgreSQL `db`. Updated: no database; it needs `CRM_API_URL` (default `http://compass-crm:3000`), `CRM_API_KEY` (>= 32 chars, equal to the CRM's `WEBSITE_API_KEY`), `CRM_COMPANY_ID`, and optionally `LEAD_INGEST_SECRET`. `deploy/preflight.sh` **refuses to deploy while any `DATABASE_*` variable is present in `.env`** - the VPS `.env` must be edited first.
2. **Different Docker networks.** Updated `compose.yaml` joins two *external* networks: `compass-tools-website-api` (internal, carrying only the CRM app as `compass-crm`) and `compass-tools_web` (the tunnel's network). The CRM stack on the VPS is not known to define either, or the `compass-crm` alias; names are overridable (`CRM_API_NETWORK_NAME`, `TUNNEL_NETWORK_NAME`, `CRM_API_URL`). **The CRM release that serves `/api/v1/website/flight-inquiries` and its migration must be deployed first** (the website shows the friendly error otherwise).
3. **The Cloudflare Tunnel target** (`http://bft-web:3000`) and service name are unchanged; the tunnel must be able to reach it on the new network.
4. **Removed on the website side:** Prisma, `pg`, runtime-role SQL, schema guard, TLS settings; `postinstall: prisma generate`. The Dockerfile no longer needs `prisma/`.
5. **Health check** (`/api/health`) no longer depends on the database or the CRM (container health no longer proves the CRM is reachable).
6. **Contact and newsletter use the CRM's unauthenticated public endpoints** (existing gap, `docs/CRM_API_INTEGRATION.md`); the contact `submissionId` only takes effect once the CRM release containing it is deployed (older CRM: ignored, previous behaviour).
7. **Not verified here:** a real CRM end to end (the opt-in live spec was not run), Docker build/run of the updated image on this machine (the deploy scripts were dry-run against a stub docker only), the VPS's actual network names and cache rules.
8. **Content decisions still open:** legal/privacy wording is uncommitted and held for your review; imagery is placeholder; the Trustpilot rating wording was neutralised.

## H. Source-of-truth confirmation

`Travel Agency Website-updated` contains every required original capability **as a visitor sees it** (same routes, components, data, assets, forms, SEO, legal pages) plus the intended improvements, and no obsolete database tooling. The only original files it does not contain are database/Vercel tooling, local tooling state and secrets (categories C-E), and two release-tooling items awaiting your decision (category F). Complete operational parity with the original's *deployment* is deliberately not claimed: the updated website needs the CRM API release, new networks and an edited `.env` before it can replace the live container (section G).

Report path: `F:\Claude Workspace\Travel Agency Website-updated\docs\WEBSITE_SOURCE_PARITY_AND_RECONCILIATION_2026-11-13.md`
