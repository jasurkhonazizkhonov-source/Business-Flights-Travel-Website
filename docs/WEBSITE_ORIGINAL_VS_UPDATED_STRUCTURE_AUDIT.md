# Original vs updated website: structure audit

Date: 2026-11-15. Original = `F:\Claude Workspace\Travel Agency Website` (branch `feature/vps-website`, 10fe079, read only, port 3100). Updated = `F:\Claude Workspace\Travel Agency Website-updated` (branch `work/website-crm-api-integration`, HEAD d1d1b61 plus the uncommitted working tree). Nothing in the original was modified. This report supersedes nothing: the earlier `WEBSITE_ORIGINAL_VS_UPDATED_STRUCTURAL_PARITY_AUDIT.md` and `WEBSITE_SOURCE_PARITY_AND_RECONCILIATION_2026-11-13.md` are kept as they were.

Method: file inventories of both trees (tracked plus untracked, excluding `node_modules`, `.next`, `.git`, `test-results/`, `docs/workspace-archive/`), compared by name and then by content with line endings ignored. All counts below come from that comparison, run on 2026-11-15.

## 1. Headline

| Measure | Value |
|---|---|
| Files in original / updated inventory | 278 / 221 (175 names in both) |
| Only in original | 103 (all database related, see section 2) |
| Only in updated | 46 (11 source files, 15 tests, 20 documents; see section 3) |
| Present in both, byte-different | 153 |
| ...of which only line endings differ | 81 |
| ...of which content differs | 72 (see section 4) |
| `src/app` route files (pages, route handlers, layouts, metadata files) | **identical set: 23 files in each** |
| `public/` (logo, icons, airline marks, brand assets) | **identical** |
| Missing page, route, asset or component that the site needs | **none found** |

Verdict for **A. Source completeness: PASS WITH LIMITATIONS.** Every public page, route handler and asset of the original exists in the updated tree. The only things absent are the database layer, which was removed on purpose when the website became an API-only client of the CRM. The limitation is that "complete" is established by structure and by the automated suites below, not by a person comparing the live site page by page.

## 2. Present in the original, absent from the updated project

All 103 files fall into one group: the website's own database. The updated website has no database (`docs/CRM_API_INTEGRATION.md`; guarded by structural tests in `tests/crm-api-client.spec.ts`).

| Group | Files | Classification |
|---|---|---|
| Prisma schema, lock, config and 55 migrations (`prisma/`, `prisma.config.ts`) | 58 | 2. Intentionally removed (the CRM owns the schema) |
| Database runtime: `src/lib/prisma.ts`, `db-tls.ts`, `db-error.ts`, `schema-guard.ts`, `readiness-cache.ts`, generated `migration-bundle` and `schema-shape` | 7 (src total with the next two rows: 14) | 2. Intentionally removed |
| Database-writing server code: `src/server/contact.ts`, `create-website-lead.ts`, `crm-company.ts`, `lead-distribution.ts`, `save-submission-info.ts`, `schema-ready.ts` | 6 | 3. Replaced by `src/lib/crm-api/*` and `src/server/crm-api.ts` (HTTP) |
| `src/lib/submission-id.ts` (derived lead id for idempotency) | 1 | 3. Replaced: the form's submission key now travels as the `Idempotency-Key` header (flight) and as `submissionId` (contact) |
| Database scripts: `generate-migration-bundle`, `generate-schema-shape`, `vercel-build`, `verify-initialized-schema`, `verify-runtime-role*`, `verify-tls-real-pg`, `prepare-self-hosted-e2e-db`, `release-validation`, `scripts/support/*` | 11 | 2. Intentionally removed |
| `deploy/sql/*` (runtime role grants) | 3 | 2. Intentionally removed |
| Database tests: `db-*`, `schema-*`, `readiness-cache`, `runtime-role-*`, `integration-gate`, `*release-safeguards`, `vercel-build`, and their `tests/support/*` | 17 | 2. Intentionally removed with the code they tested |
| `package.json` dependencies `@prisma/adapter-pg`, `@prisma/client`, `pg`, `prisma`; dev `@electric-sql/pglite`, `dotenv`, `pglite-prisma-adapter`, `tsx`; scripts `vercel-build`, `bundle:*`, `verify:init-schema`, `postinstall`, `test:release` | - | 2. Intentionally removed |

Class 4 (missing and problematic): **none**. Class 5 (uncertain): the retired `GET /api/health` database check. The original health route said it was deliberately not a database check; the updated one is deliberately not a CRM check (same behaviour, comment changed). No functional difference.

## 3. Present only in the updated project

| Item | Purpose | Classification |
|---|---|---|
| `src/lib/crm-api/{client,config,flight-inquiry,visitor-context}.ts`, `src/server/crm-api.ts` | HTTP client for the CRM, the only place its credentials are read (`server-only`) | 1. Improved (replaces the database layer) |
| `src/lib/safe-action.ts` | Whole-call failure handling for the three forms | 1. Improved |
| `src/lib/phone-validator.ts`, `src/lib/focus-field-error.ts`, `src/hooks/useScrollPopoverIntoView.ts` | Form usability and phone validation | 1. Improved |
| `src/lib/json-ld.ts` | Safe JSON-LD serialiser (escapes `<`) | 1. Improved |
| `src/components/flight-form/QuoteConsentNotice.tsx` | The short notice under the flight-request button (no checkbox) | 1. Improved (user's design preference) |
| 15 new test files (`tests/*` and `tests/support/*`) | CRM contract, forms, visitor context, a11y, SEO, deploy scripts | 1. Improved |
| `docs/*` reports, `docs/brand-assets/`, `docs/workspace-archive/` | Evidence and history | not shipped code |

## 4. Present in both, content differs (72 files; the other 81 differ only in line endings)

All are explained by earlier approved work; none is an unexplained drift. No file was copied from the original.

| Group | Files (examples) | Classification |
|---|---|---|
| Company details: `src/lib/constants.ts` (phone, email, address, CRM company comment), `src/app/global-error.tsx`, `src/app/about/page.tsx` text | 3 | 1. Improved (new official details) |
| Forms and CRM: `ContactForm`, `FlightRequestForm`, `NewsletterForm`, `PhoneNumberField`, `validations/*`, `server/actions/*`, `lib/email/*`, `lib/crm-api/*` | ~14 | 3. Replaced with equivalent behaviour over HTTP, plus the new failure handling |
| Round-trip date range: `DateField`, `SegmentRow`, `DayPickerCalendar`, `AirportAutocomplete`, `PassengerCabinField` | 5 | 1. Improved |
| Accessibility, contrast and design fixes: `globals.css`, `Reveal`, `CookieConsent`, `FloatingDealsButton`, `Footer`, `Hero`, `layout`, `not-found`, `business-class`, `Testimonials`, `PopularRegions`, `HowItWorksSteps`, `DestinationCard`, `HomeFAQ`, `LegalLayout`, `NewsletterSection`, `DestinationsPreview` | ~20 | 1. Improved (no redesign: overlay opacities, heading order, list semantics, honest alt text, one star-row removed because no rating is verified) |
| SEO: `layout.tsx` and page JSON-LD with shared `@id`, `lib/constants.ts` ids, `scripts/validate-seo.mjs`, `lib/seo.ts` unchanged | ~6 | 1. Improved |
| Deployment: `Dockerfile`, `compose.yaml`, `.env.example`, `.env.vps.example`, `deploy/common.sh`, `deploy/preflight.sh`, `scripts/*`, `docs/DEPLOYMENT_VPS.md`, `ENVIRONMENT.md`, `README.md` | ~12 | 3. Replaced (no database; CRM networks) |
| Config: `next.config.ts` (`poweredByHeader: false`, 64 KB Server Action limit), `package.json`, `package-lock.json`, `playwright.config.ts`, `.gitignore`, `.dockerignore` | 6 | 1. Improved |
| Privacy Policy page | 1 | 1. Improved, see the privacy report |
| Tests and docs updated alongside | ~15 | 1. Improved |

`next` moved 16.3.1 to 16.4.2 and `eslint-config-next` likewise (security patches); nothing else was upgraded.

## 5. Routes (identical set in both trees)

Pages: `/`, `/about`, `/blog`, `/blog/[slug]`, `/business-class`, `/contact`, `/cookie-policy`, `/destinations`, `/destinations/[region]/[country]/[city]`, `/flights`, `/how-it-works`, `/privacy-policy`, `/terms-of-service`. Handlers and metadata: `/api/health`, `/brand-mark.png`, `/opengraph-image`, `/twitter-image`, `/manifest`, `/robots.txt`, `/sitemap.xml`; plus `error`, `global-error`, `not-found`. Redirects are unchanged: apex to `www` (308), and the three retired blog URLs. A live crawl of the updated production build (`scripts/validate-seo.mjs`, 2026-11-15) checked 218 routes (11 static, 171 destinations, 36 blog articles): 0 failures, sitemap 218 unique URLs, all on the canonical host.

## 6. What this audit did not establish

* No person compared the live production site with the updated build page by page. Original-versus-updated behaviour was not run side by side against a live original on port 3100 in this pass; the comparison is source-level plus the automated suites listed in `WEBSITE_COMPLETE_FUNCTIONALITY_AND_REGRESSION_AUDIT.md`.
* Deployment configuration was compared as files only (section 4); it cannot be proven equivalent without the VPS (see `WEBSITE_ENVIRONMENT_AND_DEPLOYMENT_CONFIGURATION_AUDIT.md`).
