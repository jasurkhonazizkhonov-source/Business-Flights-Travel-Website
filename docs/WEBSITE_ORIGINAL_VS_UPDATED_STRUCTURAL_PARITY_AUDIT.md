# Website: original vs updated - structural parity audit (2026-11-13)

Audit only. The original (`F:\Claude Workspace\Travel Agency Website`) was never written to: a fresh SHA-256 inventory of its 331 non-generated files shows **0 differences** against the baseline taken at the start of this task.
The updated project (`F:\Claude Workspace\Travel Agency Website-updated`) is the sole release candidate. Nothing was deployed, committed, staged or pushed in this task (see `WEBSITE_GITHUB_RELEASE_VERIFICATION.md`).

## 1. Methodology

1. **File-level inventory, independent of Git:** SHA-256 of every file outside `.git`, `node_modules`, `.next`, test output, `.agents`/`.claude` (raw hash and line-ending-normalised hash) for both projects, taken at the start of this task and compared again at the end.
2. **Three-way classification:** the updated repository contains the original's history (shared base `10fe079`), so each file was classified against that base to separate "the original is newer" from "the updated project is newer".
3. **Set comparison:** routes (`src/app`), components, data, hooks, libraries, `public/`, `scripts/`, `deploy/`, `docs/`, tests, configuration.
4. **Line-level review** of the 74 differing files (lines removed/added per file; every deletion-heavy file read).
5. **Rendered-page comparison was attempted and could not be completed:** the original's dev server on port 3100 was no longer running when this step began (it was running earlier today; it was stopped by something other than this audit). It was **not restarted**: starting it would write `.next` into the original project, which must stay untouched. Parity is therefore established from source, inventories, the shared base and the updated site's own tests, not from a side-by-side render. The updated server (3101) was queried for headers, JSON-LD, heading and id checks (`WEBSITE_FUNCTIONAL_AND_API_COMPATIBILITY_AUDIT.md`).
6. Previous reports were **re-verified, not repeated** (section 8).

## 2. Totals (fresh inventory)

| | Original | Updated |
|---|---|---|
| Non-generated files | 331 | 294 (79 of them are `docs/workspace-archive/*`) |
| In both | 178: identical bytes 23, identical apart from line endings 81, different content **74** | |
| Only in the original | **153** | |
| Only in the updated | | **116** (79 archive, 37 other) |
| Branch / HEAD | `feature/vps-website` / `10fe079` | `work/website-crm-api-integration` / `d1d1b61` (+10 commits on `10fe079`) |

## 3. Original-only files (153) - none is visitor-facing

| Group | Files | Explanation (category) |
|---|---|---|
| `prisma/` (schema, config, 56 migrations, lock) | 58 | the website no longer has a database; the CRM owns the schema (intentionally removed) |
| `src/generated/prisma/` | 47 | generated Prisma client (obsolete) |
| `src/lib`: `prisma.ts`, `db-tls.ts`, `db-error.ts`, `schema-guard.ts`, `readiness-cache.ts`, `submission-id.ts`, two generated bundles | 8 | direct-database modules; the derived lead id is replaced by the CRM `Idempotency-Key` / `submissionId` |
| `src/server`: `contact.ts`, `create-website-lead.ts`, `lead-distribution.ts`, `save-submission-info.ts`, `crm-company.ts`, `schema-ready.ts` | 6 | replaced by `src/lib/crm-api/*` and `src/server/crm-api.ts`; lead-queue distribution and the visitor record now happen in the CRM (signed visitor context) |
| `deploy/sql/*` (runtime-role grants/settings/verification) | 3 | PostgreSQL role for the old architecture (obsolete) |
| `scripts/` (verify-*, generate-*, vercel-build, release-validation, support) | 11 | database/Vercel tooling; `release-validation.mjs` + `scripts/support/*` are an open decision (below) |
| `tests/` (db-*, schema-*, runtime-role-*, readiness-cache, vercel-build, integration-gate, release/own-server safeguards, support helpers) | 17 | tests of the removed database layer; `tests/support/own-server.ts` is replaced by `tests/support/standalone-server.ts` (starts and identifies its own server before sending a request) |
| `.env`, `.codex/hooks.json`, `skills-lock.json` | 3 | local secrets / AI-tooling state: **never copied** |

Open decision (unchanged from the parity report, category F): `tests/support/base-url-policy.ts` (refuse a non-loopback `TEST_BASE_URL` for form-submitting browser tests) and an API-only equivalent of `scripts/release-validation.mjs`.

## 4. Updated-only files (116, excluding the archive: 37)

CRM API client and signer (`src/lib/crm-api/{client,config,flight-inquiry,visitor-context}.ts`, `src/server/crm-api.ts`), form-failure handling (`src/lib/safe-action.ts`), lazy phone validation (`src/lib/phone-validator.ts`), quote-consent notice, focus/scroll helpers, JSON-LD helper, ten new specs, the stub CRM and standalone-server test harness, `CLAUDE.md`, and documentation (`CRM_API_INTEGRATION.md`, `IP_AND_LOCATION_CAPTURE.md`, `UPDATED_PROJECT.md`, brand artwork and the 2026-11-13 reports). The 79 archive files are workspace reports from the 2026-11-09 consolidation.

## 5. Differing files (74): the updated project is newer in every case that matters

Using the shared base: for **61** of the 74 the original is unchanged since the base, so the difference is only the updated project's own work. For the 13 where the original has newer *uncommitted* work:
the contact phone (`constants.ts`, `global-error.tsx`, `seo.spec.ts`: the original changed only the phone; the updated project carries the same number plus the new e-mail and address, committed in `ceb7534`), two Prisma `select` clauses in the old actions, and the database release scaffolding (`package.json` script, `playwright.config.ts` base-URL policy, deploy specs). **Nothing in the original is newer in a way the updated project lacks, apart from the two category-F test-tooling items.**

Lines removed vs added (original -> updated), largest first: `globals.css` -3/+118, `DateField.tsx` -8/+122 (range calendar), `Reveal.tsx` -10/+85 (no invisible first paint), `ContactForm.tsx` -25/+77, `FlightRequestForm.tsx` -20/+77, `NewsletterForm.tsx` -17/+47, `privacy-policy/page.tsx` -20/+37, `SegmentRow.tsx` -21/+34, `CookieConsent.tsx` -4/+48, `FloatingDealsButton.tsx` -1/+28; every other file is within +/- 16 lines. Deletion-heavy files were read: `Footer.tsx` and `Testimonials.tsx` (a row of five green stars beside "Trustpilot" replaced by a neutral icon because no rating is verified, plus sr-only "opens in a new tab"), `SegmentRow.tsx` (field wrappers moved so error focus works), `business-class/page.tsx` (hero photo opacity, list semantics), `about/page.tsx` (new address, honest image alt), `layout.tsx` (JSON-LD `@id` graph). No content, section or link was lost.

## 6. Root-level and configuration comparison

| Item | Result |
|---|---|
| `tsconfig`, ESLint config, PostCSS, `.gitattributes`, `public/` (14 assets), `src/data` (7 files), fonts/images | identical |
| `package.json` | removed `@prisma/*`, `prisma`, `pg`, `dotenv`, `tsx`, `@electric-sql/pglite`, `pglite-prisma-adapter`, `postinstall: prisma generate`, `vercel-build`, `bundle:*`, `verify:init-schema`, `test:release`; `next` 16.3.1 -> 16.4.2 (security patch line), `eslint-config-next` likewise; dev/start ports 3100 -> 3101 for the local checkout only |
| `next.config.ts` | adds `poweredByHeader:false`, `experimental.serverActions.bodySizeLimit: "64kb"`; security headers and redirects unchanged |
| `playwright.config.ts` | base URL 3101, Infrastructure project lists the new specs, no base-URL policy (category F) |
| `Dockerfile` | same pinned `node:24.21.0-bookworm-slim` digest, standalone output, non-root, healthcheck; Prisma generate and OpenSSL removed |
| `compose.yaml` | same project (`business-flights-travel`), service (`bft-web`), image (`business-flights-web`), port, alias, restart, limits and hardening; **networks and environment differ** (see the deployment report) |
| `.dockerignore`, `.env.example`, `.env.vps.example` | database settings replaced by CRM settings; `src/generated` entry removed |
| `deploy/common.sh`, `deploy/preflight.sh` | CRM/tunnel network helpers, database-free checks; `deploy.sh`, `rollback.sh`, `verify.sh`, `verify-responses.mjs` unchanged in structure |
| SEO (`robots.ts`, `sitemap.ts`, `manifest.ts`, OG/Twitter images, `validate-seo.mjs`) | same files; sitemap 218 URLs; JSON-LD connected through `@id` |

## 7. Routes and pages

Both projects have the same 24 route/layout/metadata files: `/`, `/about`, `/blog`, `/blog/[slug]` (36 articles), `/business-class`, `/contact`, `/cookie-policy`, `/destinations`, `/destinations/[region]/[country]/[city]` (171 pages), `/flights`, `/how-it-works`, `/privacy-policy`, `/terms-of-service`, `/api/health`, `robots`, `sitemap`, `manifest`, `opengraph-image`, `twitter-image`, `error`, `global-error`, `not-found`, layouts. No route disappeared; `/api/health` still answers `200 {"status":"ok"}` without touching a database or the CRM. Server Actions: the same three (`submitFlightRequest`, `submitContactMessage`, `subscribeToNewsletter`); the only behavioural change is where they send the data (HTTP to the CRM instead of the database).
Components: 43 identical names plus `QuoteConsentNotice.tsx`; hooks: 2 plus `useScrollPopoverIntoView.ts`; data: identical.

## 8. Previous reports re-verified against the current source

| Claim | Status now |
|---|---|
| Same routes, components, data, assets; only two additions | **confirmed** (sets recomputed) |
| Original-only files are database/Vercel tooling, local tooling and secrets | **confirmed** (153 listed above) |
| Contact details complete in the updated project | **confirmed** (`+1 415 570 9267`, `info@businessflights.travel`, 350 Sansome St) |
| `CLAUDE.md` restored | **confirmed**, git-ignored |
| Compose service identity preserved | **confirmed** (project, service, image, port, alias, restart, limits) |
| Network and environment differences | **confirmed** and analysed further in the deployment report |
| Audit "READY WITH CONDITIONS" for the website | **still holds as a code assessment**; it is not the same as "safe to publish" (see the GitHub release verification) |

## 9. Structural parity decision

**Parity established for everything visitor-facing and for application code**, with the following exceptions that are intentional or open: the removed database layer (intended), two test-tooling items awaiting a decision, and the fact that a live side-by-side render of the original could not be made because its server was down. No unexpected missing file, route or component was found.
