# Business Flights Travel — Independence, Completeness, API and Integration Audit (read-only)

Date: 2026-11-13 (Pacific Standard Time). Audit window about 02:50–03:35. Target: `F:\Claude Workspace\Travel Agency Website-updated`. Reference only: `F:\Claude Workspace\Travel Agency Website`.

**This audit changed nothing.** No source, configuration, dependency, build output, Git state, server, port, backup or archive was modified; nothing was built, installed, tested, committed, staged or deployed; the original website and both preview ports were not touched. Reads of the original's `.env` were limited to its existence and size (contents never read). The only file written is this report. Temporary working data (hash inventories, helper scripts) lives in this Claude session's own scratch directory outside the project folders and is not a project artifact.

**Snapshot caveat (important).** The updated project is being edited by another Claude session while this audit ran. My file inventory and hashes were taken at 03:19:10. Afterwards: `src/components/contact/ContactForm.tsx`, `src/components/flight-form/FlightRequestForm.tsx` and `src/components/forms/PhoneNumberField.tsx` changed (03:20:39), a new test `tests/phone-validation-loading.spec.ts` appeared (03:27:46), a new production build was made (BUILD_ID `UKG4qIOwymqt3N1_zqa4h`, 03:23:09) and the 3101 server was restarted (PID 4728 → PID 17296, 03:23:19). `src/lib/phone-validator.ts` (lazy loading of the phone library) is part of the same in-flight work. Git status grew from 95 entries (start of audit) to 98 entries (03:27), 99 with this report. Findings about form code were re-verified against the current files at about 03:28. Everything else is a snapshot; it will drift.

Evidence legend used below: **[S]** source inspection, **[H]** read-only HTTP GET against the running 3101 server, **[X]** check executed today, **[P]** result from an earlier session (2026-11-08/09), not re-run, **[N]** not verified / not run.

---

## 1. Executive summary

* **The updated project is a self-contained project.** Own Git repository, `package.json` + lockfile, `node_modules` (installed packages equal the lockfile exactly: 476 of 476), source, public assets, build output and deployment files. No import in 150 source files leaves the project root, no symlink or junction exists in it, and its build output records its own path. No unintentional dependency on the original was found. [S][X]
* **It is the original's architecture with the database layer deliberately replaced by an API boundary.** All 27 app-router files and all 218 sitemap routes are identical in both projects; all 14 `public/` assets, 3 app icons and 212 external image URLs are identical. The 154 files that exist only in the original are fully explained: 92 were removed by the commit "Convert the website to an API-only Compass Tools CRM integration", 51 are git-ignored local files (generated Prisma client, `.env`, tooling), 11 are uncommitted release tooling of the original, **0 are unexplained**. [S][X]
* **The smaller size is justified**: 1,467 MB → 1,008 MB (−458 MB, −31%), almost entirely generated or tooling material: `node_modules` −280 MB (149 database-related packages removed, 0 added), `.next` −156 MB (mostly dev caches), tooling −18 MB. Source files shrank 8.65 → 5.96 MB (Prisma code gone). [X]
* **The API surface is small and consistent**: one route handler (`/api/health`) and three server actions (flight request, contact message, newsletter). The CRM is reached only through its HTTP API; no database client, CRM source import, `NEXT_PUBLIC_*` variable or secret in client code was found, and no secret name appears in any shipped client file or prerendered page. [S][X]
* **Main findings** (details in sections 14–16): the project is **in flux** (another session edits it; 98→99 uncommitted entries, including four hard-coded port edits in tracked files); **none of the three forms catches a thrown server-action failure** (visitors would see the generic error page, not an inline message); **the shared-JSON-body protection file named in the brief, `server/security/read-limited-json.ts`, does not exist in the website** (it belongs to the CRM project) and the website relies on Next.js's 1 MB server-action default plus field length limits; abuse protection is honeypot + client-supplied timestamp + an in-memory per-process rate limit; contact and newsletter use the CRM's **unauthenticated** public endpoints and the contact call is not idempotent; the newsletter honeypot branch is dead code.
* **Not verified anywhere in this audit**: email delivery, CRM lead creation, newsletter subscription and any production behaviour; the clean-room build/start of the updated project (not allowed read-only); and all tests (none re-run). Earlier test results are cited as historical only.
* **Verdict:** safe to continue developing independently, **not ready for production deployment** (section 16). Nothing was fixed or proposed for immediate change.

---

## 2. Current state of both projects

| Item | Original (reference) | Updated (target) |
|---|---|---|
| Path | `F:\Claude Workspace\Travel Agency Website` | `F:\Claude Workspace\Travel Agency Website-updated` |
| Git | own `.git` (directory), root = itself | own `.git` (directory), root = itself |
| Branch / HEAD | `feature/vps-website` / `10fe079` | `work/website-crm-api-integration` / `d1d1b6141ecd403d8ad005f8a9256d7cd3f67de4` |
| Relationship | `10fe079` is an ancestor of the updated HEAD (10 commits apart: 4 CRM-API commits + 6 release commits) | |
| Working tree | 35 entries (24 modified, 11 untracked, 0 deleted) = the VPS/database work, as at session start | 95 entries at start of audit (9 modified, 86 untracked) → 98 at 03:27 (+ this report = 99) |
| Staged / stashes | 0 / 0 | 0 / 0 |
| Merge / rebase / cherry-pick / revert in progress | none | none |
| Remote | `origin` → `…/Business-Flights-Travel-Website.git` | **same `origin` URL** (shared intentionally; see §3) |
| Package manager | npm, `package-lock.json` (lockfileVersion 3), no `packageManager` or `engines` field | same |
| Node / npm available | v24.19.0 / 11.17.0 (machine-wide) | same; Dockerfile pins `node:24.21.0-bookworm-slim` by digest |
| Next.js declared / installed | 16.3.1 / 16.3.1 | 16.4.2 / 16.4.2 (requires Node ≥ 20.9.0) |
| `node_modules` | present, last written 2026-10-01 | present, last written 2026-11-13 00:21; real directory, no junctions |
| `.next` | present; BUILD_ID `nDLJb4GOtR-4HzlFyTUWc`, built 11/13 00:18:45; 219 prerendered HTML files; `package.json` modified at 00:29 **after** that build | present; BUILD_ID `aVxZeJ3rCZsVWi3yOx-IR` (02:14:31) at the start, `UKG4qIOwymqt3N1_zqa4h` (03:23:09) at the end; 219 prerendered HTML files; `required-server-files.json` records `appDir`/root = the updated folder |
| Symlinks / junctions | 86 in `.claude/skills/*` → `.agents/skills/*` plus 9 under `.windsurf/skills` (Claude/agent tooling; the 5 targets I printed resolve inside the original) | none outside `node_modules`/`.next`/`.git`; none inside `node_modules` top level |
| Real env file | `.env` (812 B; **contents not read**), plus two tracked example files | **none** — only the tracked `.env.example` and `.env.vps.example` |
| Port 3100 | **no listener**; no process of the original is running | n/a |
| Port 3101 | n/a | listening; `next start -p 3101` (PID 4728 started 03:14:19 when I identified it; PID 17296 started 03:23:19 after the new build) |
| Other processes | none from the original; no process command line mentions either folder except this Claude session itself | another session's helper scripts (`perf-measure.mjs`, `chunkcheck.mjs`) were running against 3101 |

The previously reported state was **partly stale**: the scratch tree `_phase2-scratch-20261108\tree` that once served 3101 **no longer exists**; 3101 now serves the updated project's own `.next`.

---

## 3. Independence matrix

Classification: **I** = Independent, **SI** = Shared intentionally, **SU** = Shared unintentionally, **M** = Missing, **NV** = Not verified.

| Independence check | Original | Updated | Finding |
|---|---|---|---|
| Separate Git repository | I | I | Two separate `.git` directories. **SI:** both have the same `origin` URL and the updated history contains the original's HEAD, so a push from either targets one GitHub repository. |
| Own `package.json` | I | I | Both present; scripts differ (original `-p 3100`, updated `-p 3101`). |
| Own lockfile | I | I | Both `package-lock.json`; root specs match `package.json` in both (0 mismatches). |
| Own source code | I | I | 150 (updated) / 220 (original) source files scanned: 0 imports resolve outside the project root; updated has 0 unresolved imports. The original has 2 unresolved: a generated Prisma file and `tests/release-safeguards.spec.ts → ./support/disposable-guard` (missing file; reference project only). |
| Own public assets | I | I | 14 identical copies each (duplicated, not shared). |
| Own environment configuration | I | **M** | Updated has no real `.env` (by design; forms need operator-supplied CRM variables). The original has one. Neither reads the other's. |
| Own build output | I | I | Separate `.next`; the updated build's absolute paths point at the updated folder. Stale references to the *old* name `bft-live-source-20261108` exist only in `.next/dev/**` source maps (dev leftovers, harmless; 3 files). |
| Own runtime dependencies | I | I | Separate `node_modules`; updated's 395 installed packages are a strict subset of the original's 544 (0 added). |
| No cross-project imports | I | I | See "Own source code". |
| No cross-project filesystem dependency | I | I | No code or script reads a path in the other project. Only prose mentions: `docs/PRODUCTION_READINESS.md:157` (an older folder name) and `:303` (port 3100), `docs/UPDATED_PROJECT.md` (documents the pair). |
| Independent start command | I | I | `npm start` → `next start -p 3100` / `-p 3101`. Hard-coded preview ports: see finding F9. |
| Independent deployment configuration | I | I | Each has its own `Dockerfile`, `compose.yaml`, `deploy/*`, `.env.vps.example`. **SI (external, not between the two projects):** both deploy next to the Compass Tools CRM stack via named Docker networks (`compass-tools-website-api`, `compass-tools_web`); the updated compose has no database route and `deploy/preflight.sh` refuses `DATABASE_URL` and a shared DB network. |
| Runtime reliance on the CRM | n/a | SI | Intended: HTTP API only (`CRM_API_URL`). **NV** against the CRM's current contract. |
| Reliance on Google Fonts at build | SI | SI | `next/font/google` (Instrument Sans, Playfair Display) is downloaded at build time and self-hosted afterwards: 6 `.woff2` files are present in the updated build. A clean build therefore needs network access to Google Fonts (or Next's font cache). Same in both. |

No **Shared unintentionally** finding. Missing: the updated project's real environment file (by design).

---

## 4. Git and workspace state

* Updated: 9 modified tracked files at start — `README.md`, `docs/LEGAL.md`, `package.json`, `playwright.config.ts`, `scripts/validate-seo.mjs`, `src/app/privacy-policy/page.tsx`, `src/components/contact/ContactForm.tsx`, `src/components/flight-form/FlightRequestForm.tsx`, `tests/date-range.spec.ts` — now also `src/components/forms/PhoneNumberField.tsx`. 86 untracked at start: 79 under `docs/workspace-archive/`, `docs/UPDATED_PROJECT.md`, 3 images in `docs/brand-assets/`, `src/components/flight-form/QuoteConsentNotice.tsx`, `tests/contact-details-and-consent.spec.ts`, `tests/contact-form-autocomplete.spec.ts`; now also `src/lib/phone-validator.ts` and `tests/phone-validation-loading.spec.ts`. The 8 files of the earlier "eight uncommitted files" set were byte-identical to their recorded hashes when last checked (two of them, `ContactForm.tsx` and `FlightRequestForm.tsx`, have since been edited by the in-flight work).
* The earlier combined fingerprint (`66e156fd…ca976`) no longer describes the whole uncommitted set.
* Ignored (not tracked): `.claude/launch.json` (port 3101), `AGENTS.md`, `next-env.d.ts`, all `.env*` except the two examples, `.next`, `node_modules`, `test-results`.
* Retired material: the other session archived earlier reports into `docs/workspace-archive/`; the scratch tree is gone. Nothing was deleted by this audit.

---

## 5. Route and feature comparison

Route inventory **[S][X]** (scripts compared `src/app` special files and imported each project's `destinations.ts` / `blog-posts.ts`):

| Route or feature | Original | Updated | Difference | Status |
|---|---|---|---|---|
| App-router files (pages, layouts, error, not-found, sitemap, robots, manifest, OG/Twitter images, icons, `brand-mark.png`, `api/health`) | 27 | 27 | identical set | Preserved |
| 11 static pages (`/`, `/flights`, `/business-class`, `/destinations`, `/how-it-works`, `/about`, `/blog`, `/contact`, `/privacy-policy`, `/cookie-policy`, `/terms-of-service`) | yes | yes | content files modified (release commits) | Preserved |
| Destination pages | 171 | 171 | identical route set | Preserved |
| Blog articles | 36 | 36 | identical route set | Preserved |
| Sitemap | — | 218 URLs, all on `www.businessflights.travel` **[H]** | | Preserved |
| `validate-seo.mjs` against 3101 | — | **218 routes, 0 failures** **[X][H]** (GET only) | | Pass today |
| 404 behaviour | — | unknown page, unknown blog slug, `/destinations/xx/yy/zz`, `/api/unknown` → 404 **[H]** | | OK |
| Redirects | — | retired article URL → 308 **[H]**; apex→www redirect configured in `next.config.ts` **[S]** | | OK |
| `/api/health` | liveness, no DB check | liveness, no CRM check | comment/behaviour same shape (`{"status":"ok"}`, `no-store`, `noindex`) | Preserved, adapted |
| Flight request | Prisma: `createWebsiteLead`, `lead-distribution`, `save-submission-info`, airport upserts | CRM API `POST /api/v1/website/flight-inquiries` + Gmail notification | replaced architecture | Replaced (by design) |
| Contact message | `prisma.contactInquiry.create` + activity | CRM API `POST /api/public/contact-inquiry` | replaced architecture | Replaced (by design) |
| Newsletter | `prisma.subscriber` find/update/create | CRM API `POST /api/public/subscribe` | replaced; "already subscribed" message no longer possible | Replaced; behaviour change (F5) |
| Cookie consent, floating call button, header/footer, date picker, a11y/design fixes, connected JSON-LD, new contact details, IP/location signing | older versions | updated versions (73 content-modified files in total) | intentional improvements (release commits) | Added/changed |
| Added: `QuoteConsentNotice`, phone-validator lazy loading | — | present, **uncommitted / in flight** | legal wording pending review; phone work unreviewed | Pending |

---

## 6. File comparison summary

Method: SHA-256 of every file outside `node_modules`, `.next`, `.git`, test output, `tsconfig.tsbuildinfo`; `.claude`/`.agents` skills counted but not compared. Inventory time 03:19:10 (original: working tree, includes its uncommitted VPS work).

| Result | Files |
|---|---:|
| Original hashed | 331 |
| Updated hashed | 281 |
| Identical bytes | 22 |
| Identical apart from CR/LF line endings | 82 (checkout line-ending difference; not content) |
| Content-modified | 73 (44 in `src/`, 14 root files, 8 tests, 4 docs, 2 deploy, 1 script) |
| Original-only | 154 |
| Updated-only | 104 (25 outside the archive + 79 in `docs/workspace-archive/`) |
| Relocated (identical content, new path) | 1 (`tests/cleanup-and-server-identity-release-safeguards.spec.ts` → archived as `….spec.ts.txt`) |

The 73 modified files are grouped by theme rather than attributed one by one (per-file attribution is available with `git diff 10fe079 HEAD --stat`): CRM conversion (`submit-*.ts`, `subscribe-newsletter.ts`, `validations/*`, `email/*`, `constants.ts`, `package*.json`, `next.config.ts`, `Dockerfile`, `compose.yaml`, deploy scripts, env examples, docs); release commits 1–6 (contrast/heading/alt-text/form-focus/cookie-banner/date-range changes, `Reveal`, JSON-LD, contact phone/email/address, IP capture); uncommitted legal and port edits. Some differences also come from the original's own uncommitted VPS edits.

---

## 7. Original-only and updated-only file analysis

### 7.1 Original-only (154) — classification

| Class | Files | Evidence | Verdict |
|---|---:|---|---|
| Removed by commit `2fe19a3` "Convert the website to an API-only Compass Tools CRM integration" | 92 | `git log --diff-filter=D 10fe079..HEAD`: `prisma/schema.prisma` + 56 migrations, `prisma.config.ts`, 8 `src/lib` DB modules (`prisma`, `db-error`, `db-tls`, `schema-guard`, `schema-shape.generated`, `migration-bundle.generated`, `readiness-cache`, `submission-id`), 6 `src/server` DB modules (`create-website-lead`, `crm-company`, `lead-distribution`, `save-submission-info`, `schema-ready`, `contact`), 10 DB scripts (`vercel-build`, `verify-*`, `generate-*`, `prepare-self-hosted-e2e-db`), `deploy/sql/*` (2), 10 DB tests | **Intentionally removed**, replaced by `src/lib/crm-api/*` and `src/server/crm-api.ts` |
| Git-ignored local files in the original | 51 | 47 generated Prisma client files (`src/generated/prisma/**`), `.env`, `CLAUDE.md`, `skills-lock.json`, `.codex/hooks.json` | **No longer required** (generated / local tooling / secrets) |
| Uncommitted, never in any commit of the original | 11 | `scripts/release-validation.mjs`, `scripts/support/{admin-url,disposable-guard}.ts`, `tests/{release-safeguards,own-server-release-safeguards,integration-gate,cleanup-and-server-identity-release-safeguards}.spec.ts`, `tests/support/{base-url-policy,integration-gate,own-server}.ts`, `deploy/sql/website-runtime-role-settings.sql` | **Uncertain — needs review**: release-validation tooling of the *database* line. The updated project has no equivalent `test:release` script. One spec was archived as `.txt`. Not required for the API-only architecture, but a release-gate script may be wanted (decision D12). |
| Tracked at the original's HEAD and **not** deleted by any commit in the updated line | **0** | | No unexplained loss |

### 7.2 Updated-only outside the archive (25) — purpose

* Added by commit `2fe19a3` (10): `docs/CRM_API_INTEGRATION.md`, `src/lib/crm-api/{client,config,flight-inquiry,visitor-context}.ts`, `src/server/crm-api.ts`, `tests/crm-api-client.spec.ts`, `tests/crm-api-actions-e2e.spec.ts`, `tests/support/{standalone-server,stub-crm}.ts` — **required** at runtime (first five) and for tests (rest).
* `3d68d0f` (1): `tests/crm-contract-live.spec.ts` — opt-in live CRM contract test (dev/test only).
* `7d99b4a` (4): `src/hooks/useScrollPopoverIntoView.ts`, `src/lib/focus-field-error.ts` (**runtime**), `tests/date-range.spec.ts`, `tests/design-integrity.spec.ts` (tests).
* `c7e2263` (2): `src/lib/json-ld.ts` (**runtime**), `tests/json-ld.spec.ts`.
* `d1d1b61` (1): `docs/IP_AND_LOCATION_CAPTURE.md` (documentation).
* Uncommitted (7): `src/components/flight-form/QuoteConsentNotice.tsx` (**runtime**, held legal wording), 2 tests, `docs/UPDATED_PROJECT.md`, 3 images in `docs/brand-assets/` (1.56 MB; not used by the site).
* In flight after the inventory (3): `src/lib/phone-validator.ts`, `tests/phone-validation-loading.spec.ts`, plus edits to three form components.
* `docs/workspace-archive/**` (79 files, 0.82 MB): optional documentation and archived reports/tools; **not** required to build or run.

---

## 8. Images, icons and fonts

| Check | Result |
|---|---|
| `public/` | 14 files each; **14/14 byte-identical** (airline logos ×9, `brand/logo-{mark-b,navy,white}.png`, `icon-192.png`, `logo.png`) [X] |
| App icons (`favicon.ico`, `icon.png`, `apple-icon.png`) | identical; all served 200 on 3101 [H] |
| Local image/font path literals in `src` | 15 in each project; **0 not found** in `public/` or `src/app` [X] |
| External image URLs | 212 distinct, all `images.unsplash.com`, **identical sets** in both projects [X] |
| Reachability | HEAD request on a 30-URL sample of the 212 (every ~7th): 30 OK, 0 problems [X]. **The other 182 were not checked** and a working URL today is not a guarantee. |
| Unused assets | `public/brand/logo-mark-b.png` is not referenced by any path string in `src` (it may be read dynamically; not confirmed) |
| Fonts | `next/font/google` (Instrument Sans, Playfair Display) → 6 `.woff2` emitted into `.next/static/media` of the updated build [X] |
| Served assets on 3101 | `/logo.png`, `/brand/logo-navy.png`, `/airlines/ek.png`, `/opengraph-image`, `/brand-mark.png`, `/manifest.webmanifest` → 200 [H] |
| New assets in updated | none in `public/`; only `docs/brand-assets/*` (documentation folder, untracked) |
| Licensing | `next.config.ts` states the Unsplash imagery is a development **placeholder** to be swapped for licensed/company-owned photography (F18) |

---

## 9. Folder-size breakdown

Same walker, same exclusions and counting for both (hashed set) plus separately summed generated directories; cross-checked with a second method (`Get-ChildItem`: 54,522 files / 1,467.0 MB vs 43,574 files / 1,008.2 MB).

| Category | Original files | Original MB | Updated files | Updated MB | Difference MB | Explanation |
|---|---:|---:|---:|---:|---:|---|
| Source (`src/`, hand-written) | 124 | 1.83 | 119 | 1.69 | −0.15 | DB modules removed, CRM client added |
| Source: generated Prisma client | 47 | 4.42 | 0 | 0.00 | −4.42 | git-ignored `prisma generate` output, not needed |
| Database (`prisma/`, config) | 58 | 0.12 | 0 | 0.00 | −0.12 | intentionally removed |
| Public assets | 14 | 0.95 | 14 | 0.95 | 0.00 | identical |
| Tests + `playwright.config.ts` | 32 | 0.42 | 25 | 0.33 | −0.09 | DB tests removed, CRM/UI tests added |
| Scripts | 16 | 0.17 | 5 | 0.03 | −0.14 | DB scripts removed |
| Deployment (deploy/, Dockerfile, compose) | 12 | 0.04 | 9 | 0.03 | −0.01 | SQL role files removed |
| Docs (excl. archive) | 10 | 0.33 | 16 | 1.85 | +1.52 | CRM/IP docs, 1.56 MB of brand images, shorter VPS docs |
| Docs: workspace archive | 0 | 0.00 | 79 | 0.82 | +0.82 | archived reports (optional) |
| Root config and misc | 18 | 0.37 | 14 | 0.27 | −0.09 | `package-lock.json` 0.32 → 0.25 MB, no `skills-lock.json` etc. |
| **Source-only subtotal** | 331 | **8.65** | 281 | **5.96** | **−2.69** | |
| Dependencies (`node_modules`) | 48,222 | 791.80 | 38,315 | 512.17 | **−279.64** | 149 packages only in the original (`@prisma/client` 74.8 MB, `@prisma/studio-core` 42.0, `prisma` 40.1, `effect` 25.8, `@electric-sql/pglite` 22.2, `@prisma/engines` 21.1, `@prisma/dev` 18.1, `@esbuild/win32-x64` 11.2, …); **0** only in the updated |
| Build output (`.next`) | 4,177 | 643.76 | 4,832 | 487.51 | **−156.25** | `.next/dev` 410.9 vs 190.0 MB (dev-mode caches); `cache` 142.3 vs 147.9. Production output is *larger* in the updated build (`server` 87.1 → 145.8 MB) because Next 16.4 writes a 63 MB `route-cache` folder (absent in 16.3.1) — not a loss |
| Dev tooling (`.agents` + `.claude` skills) | 789 | 18.17 | 1 | 0.00 | −18.17 | agent skills present only in the original |
| Git history (`.git`) | 1,001 | 4.33 | 148 | 2.70 | −1.62 | different clone/pack state |
| Test output + tsbuildinfo | 2 | 0.25 | 2 | 0.21 | −0.04 | |
| **Total** | **54,522** | **1,466.96** | **43,579** | **1,008.56** | **−458.40** | |

Required runtime/build files are all present in the updated project (§10). The size difference is explained by intentional removals and generated/development material; it does not indicate missing functionality. The updated project's real runtime/build set is dependencies + `src` + `public` + config (about 520 MB installed, ~7 MB of source), none of it missing.

---

## 10. Updated website — build and runtime requirements

| Requirement | Status |
|---|---|
| `package.json` + lockfile consistent | **Pass** [X]: 26 declared dependencies, 0 lockfile root mismatches; 476 locked packages, 0 missing, 0 version differences against installed; 81 optional/peer entries not installed (platform-specific, normal) |
| Next.js / React / SWC | 16.4.2, React 19.2.8, `@next/swc-win32-x64-msvc` 16.4.2 present [X] |
| Node.js | `engines` not declared; Next requires ≥ 20.9.0; machine has 24.19.0; Dockerfile uses 24.21.0 |
| Build scripts | `npm run build` (`next build`); standalone container build sets `NEXT_OUTPUT=standalone` in the Dockerfile; `analyze`, `validate:content`, `validate:seo`, `test:ui`, `test:infra` present; **no** `postinstall`, `vercel-build` or `test:release` |
| Start | local: `next start -p 3101`; container: `CMD ["node","server.js"]`, `PORT=3000`, `HOSTNAME=0.0.0.0`, `USER node`, `HEALTHCHECK node scripts/healthcheck.mjs` (GET `/api/health`) |
| Static files / images / fonts | present (§8) |
| Config files | `next.config.ts` (CSP/headers, redirects, `poweredByHeader:false`, Unsplash image host), `tsconfig.json` (`@/* → ./src/*`), ESLint, PostCSS, Playwright — all local |
| Middleware | none (no `middleware.ts`) |
| Build-time external dependency | Google Fonts (see §3) |
| Runtime variables (names only) | `CRM_API_URL` (origin only), `CRM_API_KEY` (≥ 32 chars), `CRM_COMPANY_ID`, `LEAD_INGEST_SECRET` (optional, ≥ 32 chars, must equal the CRM's), `GMAIL_SENDER_EMAIL`, `GMAIL_APP_PASSWORD`, `TRUSTED_PROXY` (e.g. `cloudflare`), `VERCEL` (platform); compose only: `APP_VERSION`, `CRM_API_NETWORK_NAME`, `TUNNEL_NETWORK_NAME`. Verified **absent** from the updated project (no real env file); no `NEXT_PUBLIC_*` variable is used anywhere [S] |
| Optional dev requirements | Playwright + `@axe-core/playwright`, ESLint, `@next/bundle-analyzer` |
| External services | the CRM HTTP API, Gmail SMTP (`smtp.gmail.com:465`), Unsplash (images, via `/_next/image`), Google Fonts (build) |
| Reliance on the original project | **none found** (§3) |
| Clean-room proof | **[N]** a build/start from an empty tree was not performed (would write files); evidence is indirect |

---

## 11. 3100 and 3101 process/build verification

| Port | Finding |
|---|---|
| **3100** | **Not running** (no listener on IPv4/IPv6; none of the earlier PIDs exist). No process serves the original. The original's `.next` (BUILD_ID `nDLJb4GOtR-4HzlFyTUWc`, 11/13 00:18:45) exists but is older than its modified `package.json` (00:29) and `next-env.d.ts` (00:59). Not started or touched. |
| **3101** | Listening. At about 03:14 PID 4728, `node.exe node_modules\next\dist\bin\next start -p 3101` (relative path, so the working directory is not in the command line). **Which build it served was determined by content**: the 3 pages I fetched reference 19 static assets; **19/19 exist in the updated project's `.next/static`, 0/19 in the (now deleted) scratch tree, 1/19 in the original's** [X][H]. So 3101 serves `Travel Agency Website-updated`, not `_phase2-scratch-20261108\tree`. The page contains the updated markers (new email ×8, `350 Sansome` ×4, connected JSON-LD `@id` ×3; no old email/address). At 03:23:19 the server was restarted as PID 17296 after a new build; **that restart was not re-verified** (assumed to be the same project). |
| Build vs source | At 03:28 the newest non-generated source change after the 03:23:09 build was `tests/phone-validation-loading.spec.ts` (a test) — i.e. the running build includes the in-flight form edits made at 03:20:39. Earlier build `aVxZeJ3r…` (02:14) predated them. |
| Representative checks on 3101 [H] | `/` 200, `/flights`, `/contact`, `/about`, `/how-it-works`, `/business-class`, `/destinations` (1.08 MB), `/blog`, the three legal pages, a destination page and a blog article all 200 `text/html`; `/robots.txt`, `/sitemap.xml` (218 URLs), `/manifest.webmanifest`, `/favicon.ico`, `/icon.png`, `/apple-icon.png`, `/opengraph-image`, `/brand-mark.png`, `/logo.png`, `/brand/logo-navy.png`, `/airlines/ek.png` all 200 with the right types. |
| Security headers on `/` [H] | CSP (`default-src 'self'`, `script-src 'self' 'unsafe-inline'`, `frame-ancestors 'none'`, `form-action 'self'`, `object-src 'none'`), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera/microphone/geolocation/payment/usb off), HSTS 2 years + preload; **no** `X-Powered-By`, `Server`, `Set-Cookie` or `Access-Control-Allow-Origin`. `Cache-Control: s-maxage=31536000` on the static homepage (see F7). |
| 3101 is not production | It runs with no CRM or email variables, so form submissions cannot succeed there by design. |

---

## 12. Deployment and maintenance independence

* The updated project can be built and deployed without the original: its own `Dockerfile` (multi-stage, pinned Node image, `npm ci`, `NEXT_OUTPUT=standalone`, non-root `node` user, health check), `compose.yaml` (one service `bft-web`; **no `ports:`**, the site is reachable only through the Cloudflare Tunnel, which is what makes `TRUSTED_PROXY=cloudflare` safe; `cap_drop`, `security_opt`; joins two external networks), `deploy/{preflight,deploy,rollback,verify}.sh`, `deploy/verify-responses.mjs`, `scripts/healthcheck.mjs`, `docs/DEPLOYMENT_VPS.md`, `docs/ENVIRONMENT.md`. `deploy/preflight.sh` refuses to continue when any database variable is present or a container named `db` shares a network with the site. [S]
* **Hard-coded preview ports**: `package.json` `dev`/`start` use `-p 3101`, plus `playwright.config.ts`, `scripts/validate-seo.mjs`, README, `docs/UPDATED_PROJECT.md`, `.claude/launch.json` (ignored). The container path (`node server.js`, `PORT=3000`) does **not** use `npm start`, so production in Docker is unaffected. A non-Docker host that runs `npm start` would be forced onto 3101 because a `-p` flag overrides `PORT` (F9). The original does the same with 3100.
* Production items requiring review before deployment: Cloudflare client-IP and visitor-location headers (needed for IP/location capture), the tunnel hostname, `CRM_API_URL` over the private network, key and secret rotation, caching rules for HTML, the Google Fonts build dependency, the placeholder imagery licence, and the held legal wording (F19). Rollback: `deploy/rollback.sh` and `docs/DEPLOYMENT_VPS.md`; the rollback target cannot be named until the production commit/image is confirmed (unverified).

---

## 13. Test evidence and limitations

**Executed today (read-only):** `scripts/validate-seo.mjs` against 3101 (GET only): *218 routes, 0 failures, robots checked, sitemap 218 unique URLs on the canonical host*; header, route and asset GETs; secret/credential scans; import-resolution, hash, size, lockfile and git-history analysis.

**Not run (would write files, install, rebuild or contact external systems):** `tsc`, ESLint, `next build`, `validate:content`, `npm audit`, Playwright suites (UI, accessibility, infrastructure), `crm-contract-live`, any POST to a form. `test-results/.last-run.json` says `passed`, `failedTests: []` at 02:49 on 11/13 — produced by another session; its scope is unknown, so it is not counted as evidence.

**Historical only [P]** (2026-11-08/09, on a snapshot of this repo before the later edits): four-viewport UI suite 1232 passed / 8 skipped / 0 failed; targeted regression 428 / 8 / 0; infrastructure suite 112 passed / 6 skipped / 0 failed (it needs a `NEXT_OUTPUT=standalone` build and skips otherwise); six live-CRM tests skipped (no non-production CRM). Skipped or blocked tests are not passes.

Separation: **Passed today**: SEO validator, header/route/asset checks, lockfile consistency. **Failed**: none observed. **Skipped/Blocked**: live CRM contract (needs `CRM_CONTRACT_URL/KEY` of a non-production CRM). **Not tested today**: everything else listed above. No claims are made about real-device mobile performance.

---

## 14. Missing or potentially missing components

* No essential build or runtime file is missing from the updated project. By design absent: the real `.env`.
* Not proven: a clean-room build (network for Google Fonts; `npm ci`), and CRM-side presence of the endpoints the website calls (§B).
* Uncertain classification: the original's 11 uncommitted release-validation files (no `test:release` equivalent in the updated project).
* In-flight, unreviewed: phone-validator loading work.
* `public/brand/logo-mark-b.png` possibly unused.

---

## 15. Security and configuration concerns (all read-only findings; severities are mine)

| ID | Severity | Finding | Evidence |
|---|---|---|---|
| F1 | Medium | The project is being modified concurrently by another session; 98–99 uncommitted entries mix approved and unapproved work (held legal wording, port edits, archive, phone work). A blanket `git add` would commit everything. | git status; §4 |
| F2 | Medium | None of the three forms catches a thrown server-action failure (network error, server 5xx, request over the body limit, CSRF origin rejection). Only returned `{ok:false}` results are shown inline; a thrown error goes to the route error boundary (generic "Something went wrong" page, with phone/email), replacing the form and any typed text. Flight form: `try/finally` without `catch` (`FlightRequestForm.tsx` ~222–226); contact `ContactForm.tsx:96`; newsletter `NewsletterForm.tsx:35` have no `try`. | re-verified 03:28 |
| F3 | Low | Newsletter honeypot branch is dead code: `newsletterSchema` requires `website` to be empty, so a filled honeypot fails validation and returns "Please enter a valid email address." instead of the intended silent success. Flight and contact likewise return a validation/field error for a filled honeypot. | `validations/newsletter.ts`, `subscribe-newsletter.ts:27–34` |
| F4 | Medium | Abuse protection is: honeypot, a client-supplied `renderedAt` timing check (a bot can send an old timestamp), and an in-memory sliding-window rate limit (8 per 10 min per client for flight and contact, 6 for newsletter) that is per process and resets on restart. No CAPTCHA. With `TRUSTED_PROXY` unset (as on the 3101 preview) every request shares one `unresolved` bucket, so 8 submissions in 10 minutes block all visitors of that instance. | `rate-limit.ts`, `rate-limit-client.ts`, `anti-spam.ts` |
| F5 | Medium | Contact and newsletter go to the CRM's **unauthenticated** public endpoints with the company id in the body; the contact call is attempted exactly once and is not idempotent (a timeout may lose or duplicate a message); a repeat newsletter sign-up can no longer say "already subscribed". Their protection against direct abuse is the CRM's responsibility. | `crm-api/client.ts` header comment, `docs/CRM_API_INTEGRATION.md` |
| F6 | Info/Medium | `server/security/read-limited-json.ts` **does not exist in the website** (neither project). It exists only in the CRM project (`compass-tools-updated\src\server\security\read-limited-json.ts` and its test). The website has no JSON-body API route; its three mutation endpoints are server actions limited by Next's default **1 MB** body cap (`serverActions.bodySizeLimit` not set) and field maxima (message 3000, notes 2000, names 80, email 200, phone 30, ≤ 6 segments). No test covers an oversized action body. Whether the CRM's public endpoints use its limiter was not audited. | `next.config.ts`; Next docs (`server-actions.md`) |
| F7 | Low | HTML responses carry `s-maxage=31536000` (Next's default for static pages). Behind Cloudflare, an HTML-caching rule would make updates and legal-text changes slow to appear. | [H] |
| F8 | Low | CSP allows `'unsafe-inline'` for scripts and styles (documented trade-off; nonce-based CSP not implemented). | `next.config.ts` |
| F9 | Low/Medium | `dev`/`start` scripts hard-code ports (3101; original 3100); `-p` overrides `PORT`. Docker path unaffected. | `package.json` |
| F10 | Low | Build depends on Google Fonts at build time. | `layout.tsx`, §3 |
| F11 | Info | Stale `bft-live-source-20261108` paths in 3 `.next/dev` source maps; harmless. | §3 |
| F12 | Medium | 79 archive files and 3 brand images (≈ 2.4 MB) sit untracked inside the website repo's `docs/`; if committed they become part of the website's history. A pattern scan found no credentials or private keys; 4 candidate strings are test fixtures (a rejected `user:pass@` URL example, two `GMAIL_APP_PASSWORD` placeholders in a test, one "sentinel" value in an archived spec). | scan with values masked |
| F13 | Info | Original (reference): its installed `node_modules` lag its own `package-lock.json` for the same 5 packages (zod, nodemailer, js-yaml, brace-expansion ×2); it has a real `.env`; one of its untracked specs imports a missing helper. | §3 |
| F14 | High (as a gap) | No end-to-end evidence exists in this audit for email delivery, CRM lead creation or newsletter subscription; 6 live-CRM contract tests are skipped without a staging CRM. | §13 |
| F15 | Info | In-memory rate limiting and `server-only` boundaries are sound for one instance; multi-instance deployment would need a shared store (documented in `rate-limit.ts`). | |
| F16 | Info | Server actions return HTTP 200 with `{ok:false,…}` for validation, rate-limit and CRM errors (consistent across the three, but not HTTP-semantic: no 400/429 on the wire). | §B |
| F17 | Info | Another session's helper processes were hitting 3101 during the audit (not mine). | process list |
| F18 | Medium (business) | 212 Unsplash URLs are declared development placeholders; licensing and availability risk before launch. | `next.config.ts` |
| F19 | Pre-existing | Held legal/consent wording (`QuoteConsentNotice`, privacy page, `LEGAL.md`) is uncommitted and not legally approved. | |
| F20 | Info | The original's `.next` was rebuilt at 00:18 today and its `package.json` was modified afterwards; 3100 is not running. | |

Positive findings: no database client or CRM source import anywhere in the updated source/scripts/config (database words appear only in comments and in compose/deploy guard text that forbids database access); the CRM credentials are read in exactly one `server-only` module (`src/server/crm-api.ts`); no `NEXT_PUBLIC_*`; no CRM/SMTP/secret name or credential pattern in 33 shipped client files or 219 prerendered pages; `dangerouslySetInnerHTML` is used only for JSON-LD through `jsonLd()` which escapes `<`; email HTML escapes all user-supplied values; airport codes are regex-limited so a crafted code cannot inject an email header; no CORS headers, redirects built from input, file uploads or `eval` in `src`; `/api/health` returns only `{"status":"ok"}` (POST 405, OPTIONS 204, `no-store`, `noindex`).

---

# PART B — API, forms, CRM and integration audit

## B1. API architecture

* **Route handlers:** `/api/health` (GET). Content routes: `sitemap.xml`, `robots.txt`, `manifest.webmanifest`, `opengraph-image`, `twitter-image`, `brand-mark.png`, `/_next/image` (restricted to `images.unsplash.com`). `robots.txt` disallows `/api/`.
* **Mutation surface = Next.js Server Actions** (`"use server"`), invoked as POSTs to the page URL: `submitFlightRequest` (forms on `/` and `/flights`), `submitContactMessage` (`/contact`), `subscribeToNewsletter` (footer on every page and a band on `/`). There is no `middleware.ts`/`proxy.ts` in the project (checked at the root and `src/`). They are protected by Next's built-in same-origin check (`Origin` vs `Host`/`X-Forwarded-Host`; `allowedOrigins` not configured) and the 1 MB default body cap.
* **Shared plumbing:** `rateLimitClientKey` (trusted proxy IP only), `checkRateLimit`, zod schemas, `isSpamSubmission`, `normalizePhoneNumber` (libphonenumber-js), the CRM client, the visitor-context signer, `captureSubmissionInfo` (IP/location from trusted proxy headers only), the Gmail mailer.

### API inventory

| Endpoint | Method | Purpose | Validation | Authentication | External integration | Status |
|---|---|---|---|---|---|---|
| `/api/health` | GET (POST→405, OPTIONS→204) | liveness for Docker/tunnel | none needed | none (exposes nothing) | none | verified 200, `{"status":"ok"}` [H] |
| Server action `submitFlightRequest` | POST via page | flight request → CRM lead + internal email | `flightRequestSchema` (zod: enums, ≤ 6 segments, IATA `^[A-Za-z]{3}$`, dates, pax ≤ 9, infants ≤ adults, field maxima), phone via libphonenumber, airports re-looked-up in own dataset, honeypot, timing ≥ 2.5 s | public; rate limit 8/10 min/IP | CRM `POST /api/v1/website/flight-inquiries` (Bearer key, **required `Idempotency-Key`**, optional HMAC-signed visitor context); Gmail SMTP notification after the response | implemented; locally tested against a stand-in CRM [P]; live **NV** |
| Server action `submitContactMessage` | POST via page | contact message → CRM inbox | `contactMessageSchema` (subject enum, message 10–3000), phone check, honeypot, timing ≥ 2 s | public; rate limit 8/10 min/IP | CRM `POST /api/public/contact-inquiry` (**unauthenticated**, `companyId` in body), one attempt | implemented; live **NV** |
| Server action `subscribeToNewsletter` | POST via page | newsletter → CRM subscriber | `newsletterSchema` (email ≤ 200, honeypot) | public; rate limit 6/10 min/IP | CRM `POST /api/public/subscribe` (unauthenticated), one attempt | implemented; live **NV** |
| `/sitemap.xml`, `/robots.txt`, `/manifest.webmanifest`, OG/Twitter images, `/brand-mark.png` | GET | SEO/PWA | n/a | none | none | verified 200 [H] |

### API parity with the original

| API functionality | Original | Updated | Difference | Assessment |
|---|---|---|---|---|
| Health endpoint | `/api/health`, no DB check | `/api/health`, no CRM check | wording only | Preserved |
| Flight request storage | direct database (Prisma: lead, airports, queue distribution, submission info) | CRM API with idempotency | architecture replaced | Intentional; behaviour now depends on the CRM |
| Contact message storage | `prisma.contactInquiry.create` + activity | CRM public endpoint | replaced | Intentional; weaker duplicate/atomicity guarantees (F5) |
| Newsletter | upsert in database; "already subscribed" shown | CRM public endpoint; always "subscribed" | replaced | Behaviour change |
| Internal notification email (Gmail SMTP) | yes | yes (retry once on transient error, same Message-ID) | modified | Preserved |
| IP / approximate location | stored in the database | sent to the CRM only as an HMAC-signed, 5-minute visitor context; also in the internal email | replaced | Intentional |
| Rate limiting keyed on trusted IP | yes (`10fe079`) | yes | same | Preserved |
| Schema readiness / DB guards / migrations | yes | removed | removed with the database | Intentional |

## B2. Form-to-backend flows

`UI → client validation → server action → zod → anti-spam/rate limit → business logic → CRM/email → result object → UI`

| Feature | UI and client validation | Server | External | Response to user | Tests | Assessment |
|---|---|---|---|---|---|---|
| **Flight request** (`FlightRequestForm`) | controlled state, `noValidate`, inline accessible errors, focus on first error, airport autocomplete, date picker; mints a `submissionId` UUID per mounted form and `renderedAt`; `submittingRef` prevents double submit | rate limit → zod → honeypot/timing → phone → submission info → airport lookup → config check → CRM call (3 attempts, same key/bytes, 1/2/4 s backoff, retry only on network/timeout/429/5xx/unreadable 200; 401/404 = misconfigured; 400/409/413/415 = rejected; redirects = error) → success summary → email via `after()` | CRM + Gmail | success panel; field errors; generic friendly error; special text for a 409 key conflict; duplicate = success without a second email (documented limitation) | client unit, stand-in-CRM e2e, self-hosted e2e (these need a standalone build) | complete frontend and backend; thrown failures unhandled in UI (F2) |
| **Contact** (`ContactForm`) | client validation, `renderedAt`, honeypot | rate limit → zod → honeypot/timing → phone → CRM call once | CRM public endpoint | success view or friendly error | client + e2e + live-opt-in | complete; not idempotent (F5); thrown failures unhandled (F2) |
| **Newsletter** (`NewsletterForm`) | client email check, toast success/error | rate limit → zod → (dead honeypot branch) → CRM call once | CRM public endpoint | toast | e2e | complete; F3, F5 |
| Cookie consent, floating call button, other interactive features | client-only (no backend) | — | — | — | UI suite [P] | not API features |

Retry safety: flight inquiries cannot create two leads (same key, same bytes); the contact message is deliberately attempted once. Nothing from the visitor or the CRM's message text is logged (fixed tags only; asserted by tests [P]); the IP is never logged, only "captured/unavailable".

## B3. CRM integration

* **Boundary:** HTTP only. `CRM_API_URL` must be an origin on the private network (e.g. `http://compass-crm:3000`; no path, credentials, query or fragment), the compose file gives the website no route to the database, and `preflight.sh` enforces it. [S]
* **Authentication:** flight inquiries use `Authorization: Bearer <CRM_API_KEY>` (≥ 32 chars) + `Idempotency-Key`; visitor IP/location is sent only in `x-ct-visitor-context` + `x-ct-visitor-signature` (HMAC-SHA256 with `LEAD_INGEST_SECRET`, accepted by the CRM for 5 minutes; no `cf-*` header forwarded). Contact/newsletter use `companyId` and **no credential**.
* **Timeout/retry:** 10 s per attempt; `redirect: "error"`; `cache: "no-store"`.
* **Deviations looked for and not found:** CRM source imports, Prisma or another DB client, direct DB access, CRM filesystem paths, shared env files, CRM secrets in browser code. Evidence: grep of `src`, `scripts`, config, compose, deploy and `.env` examples; `package.json` has no database package; the source test "no source file or script touches a database" exists [S].
* **Compatibility with the CRM's *current* contract:** **[N]**. The client states it was verified against CRM commit `4d33c29` and PR build `01e809d`; the live contract test is skipped without a staging CRM, and the CRM project was not audited here (it was only searched for one file name).
* **Operator-supplied, unverified:** every CRM variable; `LEAD_INGEST_SECRET` equality with the CRM; which CRM hostname/route the tunnel exposes.

## B4. Email and external services

| Service | Purpose | Configuration | Authentication | Failure handling | Status |
|---|---|---|---|---|---|
| Compass Tools CRM API | lead/inquiry/subscriber creation | `CRM_API_URL`, `CRM_API_KEY`, `CRM_COMPANY_ID`, `LEAD_INGEST_SECRET` | Bearer / none / HMAC | typed outcomes; bounded retry for flights; generic visitor message; fixed-tag logs | implemented; live NV |
| Gmail SMTP (Nodemailer) | internal flight-request notification | `GMAIL_SENDER_EMAIL`, `GMAIL_APP_PASSWORD` (cleaned of whitespace) | SMTP auth, server-only module | runs in `after()` after the CRM saved the lead; one retry on transient errors; failure is logged and never affects the visitor | implemented; **delivery NV**; "accepted" ≠ delivered |
| Unsplash | page imagery | `next.config.ts` `remotePatterns` | none | none (broken image) | 30/212 sampled reachable |
| Google Fonts | build-time fonts | `next/font/google` | none | build failure if unreachable | NV on a clean machine |
| Cloudflare Tunnel / edge | TLS, client IP, location headers | `TRUSTED_PROXY=cloudflare`, tunnel route | n/a | unresolved IP → shared bucket; no IP/location stored | NV |
| Analytics, CAPTCHA, marketing platform | — | none implemented | — | — | not applicable |

Secrets are read only in `server-only` modules; none appears in client bundles [X]. Misleading success: a CRM failure returns a generic error, never a success; the only "success without confirmation" case is the documented duplicate-submission path that skips the second email.

## B5. Security review of the API

| Security control | Expected behaviour | Updated implementation | Evidence | Finding |
|---|---|---|---|---|
| Request body size | bounded | Next default 1 MB + zod maxima; no explicit limit; `read-limited-json.ts` not applicable | `next.config.ts`, validations | Adequate by default; undocumented in tests (F6) |
| Input validation | server re-validates everything | zod on all three actions, phone library, airport re-lookup | source | Pass |
| Injection / XSS | escape output | email HTML escaped; JSON-LD escaped; no raw HTML from input; IATA regex | source | Pass |
| CSRF | origin check | Next's built-in action origin check | framework docs | Pass; behind the tunnel the proxy's host handling is **NV** |
| Authentication / authorization | n/a for public forms; CRM calls authenticated | Bearer key for flights; none for contact/newsletter | source | F5 |
| Rate limiting | per trusted client | in-memory, per process, trusted-IP key, shared fallback bucket | source, tests [P] | F4 |
| Abuse/automation | bot controls | honeypot + timing (+ rate limit) | source | Basic; F3/F4 |
| Open redirect / SSRF | none | no user-controlled redirect or fetch target; CRM URL from env only | source | Pass |
| Secret exposure | none client-side | `server-only`, no `NEXT_PUBLIC_*` | grep + bundle scan | Pass |
| CORS | none | no CORS headers observed | [H] | Pass |
| Caching of private responses | none cached | forms are actions (not cached); `/api/health` `no-store` | [H] | Pass; HTML `s-maxage` noted (F7) |
| Security headers | CSP, HSTS, XFO, nosniff, referrer, permissions | all present | [H] | Pass (CSP uses `unsafe-inline`, F8) |
| Error detail | no stack traces or CRM text to the visitor | fixed friendly messages | source | Pass |
| File uploads | none | none | grep | n/a |

## B6. Response and error consistency

All three actions return `{ ok: true … }` or `{ ok: false, error, fieldErrors? }` and always HTTP 200; validation, rate-limit, spam and CRM failures are distinguishable only by message, and external failures are not distinguishable from validation errors for the visitor by design (all CRM failures → one generic message). Framework-level rejections (over 1 MB, origin mismatch, crash) are not shaped by the app (F2). `/api/health`: 200 JSON; unknown `/api/*`: 404; wrong method: 405. No 401/403/413/429 are produced by the website itself.

## B7. Functional test coverage (what the tests actually assert; none re-run today)

| Area | Present tests (titles read) | Gap |
|---|---|---|
| CRM client (`crm-api-client.spec.ts`, 40) | config rules; body mapping and strict allow-list; HMAC headers; 201/200/409/401/404/400/413/415; 5xx and 429 retry with same key/bytes; timeouts, dropped connection, unreadable 200; redirect refused; no secret/customer value in any outcome; no database code anywhere | uses a stand-in server, not the real CRM |
| Actions e2e (`crm-api-actions-e2e.spec.ts`, 20; needs standalone build) | success, signed visitor context, one-way/multi-city, duplicate = one lead, 409, no key, validation before CRM, honeypot/too fast, 400/401/5xx, lost reply, contact, newsletter, log hygiene, missing config | skipped without a standalone build |
| Live contract (`crm-contract-live.spec.ts`, 6) | create/repeat/conflict, multi-city, wrong key, unexpected field, public-edge refusal | **skipped** (no non-production CRM) |
| Rate limits (`rate-limit-client.spec.ts` 16, `rate-limit-actions-e2e.spec.ts`) | trusted-IP keying, forged `X-Forwarded-For`, shared bucket, log once | actions e2e needs standalone build |
| Anti-spam (`anti-spam.spec.ts`) | honeypot, missing/too-fast `renderedAt` | |
| Email (`flight-request-notification.spec.ts` 82+, `smtp-helpers.spec.ts` 14) | content, escaping, helpers (fake mailer) | no real SMTP |
| Self-hosted (`self-hosted-e2e.spec.ts`, 8; standalone) | no env/source/DB in container layout, apex redirect, Cloudflare headers, CRM down/up, log hygiene | skipped without standalone build |
| Error boundaries (`error-boundaries.spec.ts`, 2) | files exist and export components | does **not** exercise a thrown action failure |

Per-endpoint coverage of the nine conditions requested: **valid** ✔; **invalid** ✔; **missing required fields** ✔ (client/e2e); **malformed JSON** — not applicable to server actions (framework-parsed), not tested; **oversized body** ✘ none (website side); **unauthorized** ✔ for the CRM key (401), n/a otherwise; **external failure** ✔ (CRM down/5xx/timeout/401/400/429); email failure covered with a fake mailer; **duplicates** ✔ flight, documented-once for contact/newsletter; **unexpected server error** partial (generic CRM errors ✔, thrown exception → UI ✘).

## B8. Live versus local

| Level | Done in this audit |
|---|---|
| Source-code inspection | yes (actions, CRM client/config/visitor context, rate limit, mailer, validations, forms, config) |
| Existing automated test results | historical only [P] |
| Local non-destructive checks | yes (GETs on 3101, SEO validator, scans) |
| Local integration tests | **no** |
| Production HTTP checks | **no** (no request to `www.businessflights.travel`) |
| External service verification | **no** (no email, CRM, newsletter or form submission was made) — would require your explicit authorization |

### Feature functionality

| Feature | Frontend present | Backend present | Integration present | Tests | Assessment |
|---|---|---|---|---|---|
| Flight request | yes | yes | CRM + Gmail | yes (some need standalone build) | implemented; unverified end-to-end |
| Contact | yes | yes | CRM public | yes | implemented; unverified end-to-end |
| Newsletter | yes | yes | CRM public | yes | implemented; unverified end-to-end |
| Health | n/a | yes | none | indirect | verified locally |
| SEO/sitemap/robots | yes | yes | none | validator | verified locally today |

### External integrations

| Integration | Required configuration | Implementation | Verified behaviour | Limitation |
|---|---|---|---|---|
| CRM | 4 variables + network | complete | stand-in only [P] | contract vs current CRM unverified |
| Gmail | 2 variables | complete | fake mailer only | delivery unverified |
| Cloudflare | `TRUSTED_PROXY`, headers | complete | forged-header tests [P] | real edge unverified |
| Unsplash / Fonts | none / network | complete | 30 URLs reachable | licensing, build-time network |

---

## 16. Prioritized decisions for your approval (nothing has been changed)

1. **Coordinate the concurrent editing** of `Travel Agency Website-updated`: decide which session owns it and agree a freeze point before any commit (F1). *(High)*
2. **What to do with unreviewed/held items** before any commit: the held legal wording (F19), the in-flight phone-validation work, `package.json` port edits (keep, revert or make configurable — F9), and the archive/brand-asset files (keep inside the repo or move them out — F12). *(High)*
3. **Authorize live verification** with a non-production CRM and a test mailbox (CRM lead, contact, newsletter, internal email), and confirm the production commit/image, Cloudflare headers and `LEAD_INGEST_SECRET` equality (F14). *(High)*
4. **Form failure handling**: approve a fix so thrown server-action errors show an inline message (F2). *(Medium)*
5. **Abuse/limits policy**: whether to add CAPTCHA or shared rate limiting, set an explicit `serverActions.bodySizeLimit` and add an oversize test, and decide the CRM-side protections of the unauthenticated public endpoints (F4, F5, F6). *(Medium)*
6. **Newsletter honeypot / "already subscribed" behaviour** (F3, F5). *(Low)*
7. **Imagery licensing** before launch (F18). *(Medium, business)*
8. **HTML caching rule at Cloudflare** (F7). *(Low)*
9. **Refresh the test evidence**: approve a build and a standalone build with the full UI/infrastructure suites (they write files) so the verdict is current. *(Medium)*
10. **Release-gate tooling**: whether any of the original's 11 uncommitted release-validation files should be re-created for the API-only line (§7.1). *(Low)*
11. **Clean-room build** proof (fresh clone + `npm ci` + build with network) to close the independence evidence. *(Low)*
12. **Same-remote caution**: both repositories use one GitHub remote; agree branch/push policy (§3). *(Low)*

---

## 17. Final conclusions

**A. Are the original and updated projects genuinely independent?** Yes in code, dependencies, build output, runtime files and Git history (separate repositories); shared only intentionally (same GitHub remote; the external CRM stack in production). No unintentional sharing found. The updated project has no real environment file.

**B. Can the updated website build and run without accessing the original folder?** Read-only evidence says yes: no import or path leaves the project, `node_modules` is self-contained and equals the lockfile, and 3101 serves the updated build. A clean-room build was not performed, and a build needs network for Google Fonts.

**C. Does it contain every required runtime and build component?** Yes, nothing essential is missing; the real `.env` is intentionally operator-supplied.

**D. Have all original pages, features, content and assets been preserved apart from documented intentional removals?** Yes for routes (27/27 files, 218/218 routes), assets (14/14, 3/3 icons, 212/212 URLs). The database layer was intentionally replaced by CRM API calls (92 files); 11 uncommitted original-only release-tooling files are not carried over (decision 10). Lead handling behaviour now depends on the CRM and is not verified here.

**E. Are the added features complete and supported by files and dependencies?** Implemented with all files and dependencies present (no new packages), earlier local tests passed [P]; **not end-to-end verified**, legal wording held, and the phone-validation work is in flight and unreviewed.

**F. Is the smaller folder size justified?** Yes: −458 MB is dependencies (−280), dev caches (−156), tooling (−18) and removed database material; no functional loss found.

**G. Is anything essential missing from `Travel Agency Website-updated`?** Nothing essential found; see §14 for unproven items.

**H. Safe to continue developing independently?** Yes technically, provided concurrent edits are coordinated and nothing is committed blindly (F1).

**I. Ready for production?** **No.** Blockers: unverified production commit/image, Cloudflare/origin headers and secret equality; no live CRM/email/newsletter verification; held legal wording; unreviewed in-flight changes and port edits; no fresh full test run; placeholder imagery.

### Part B answers

* **A. Is the API architecture complete and internally consistent?** Yes: one health route + three server actions on a shared validation/rate-limit/CRM-client pattern.
* **B. Are all required endpoints present?** Yes for the website's own surface; the CRM-side endpoints are the CRM's and were not audited.
* **C. Do the three forms have complete frontend-to-backend implementations?** Yes (F2/F3 noted).
* **D. Does CRM integration use only the intended API boundary?** Yes, per source, config and compose guards.
* **E. Any unintended direct CRM database access?** None found.
* **F. Are authentication, validation, rate limiting and request-size protection correct?** Validation and CRM authentication: yes. Rate limiting: works as designed but is basic and per process. Request size: relies on the framework default and field maxima; the named `read-limited-json.ts` is CRM-side, not a website file.
* **G. Are email and other integrations configured and handled safely?** Handled safely in code; configuration unverified (not present here).
* **H. Are API failures communicated correctly to users?** Returned failures yes; thrown failures no (F2).
* **I. Are the tests sufficient?** Strong for CRM-client behaviour, retries, idempotency, secrets/logging and rate-limit keying; gaps: oversized body, thrown-exception UI, real SMTP, real CRM; several suites skip without a standalone build or a staging CRM.
* **J. Confirmed working / only implemented / unverified?** Confirmed today: pages, headers, sitemap/robots, health, 218-route validator, no secret leakage. Implemented only: the three forms, CRM calls, email, IP signing. Unverified: end-to-end delivery and CRM lead/subscriber creation, production behaviour.
* **K. Vulnerabilities or incomplete integrations needing attention?** No high-severity vulnerability found. Attention: F2, F4, F5, F6, F12, F14, F18.
* **L. Ready for independent operation and eventual production?** Ready to operate independently as a project; not ready for production deployment.

---

## Appendix — method and limits

* Read-only throughout: `git --no-optional-locks` read commands only; hashing, import-resolution, size and dependency analysis with local scripts; HTTP GET/HEAD only (3101 pages and assets, a 30-URL Unsplash sample). The original's `.next` and dev server were never requested.
* Secret scanning reported counts and file names only; matches were masked and triaged.
* Excluded from content comparison: `node_modules`, `.next`, `.git`, test output, `tsconfig.tsbuildinfo`; agent-skill folders counted, not compared.
* Not audited: the Compass Tools CRM project, production systems, Cloudflare, the VPS, Docker images, a clean clone.
* Findings can change while another session edits the project (see the snapshot caveat).
