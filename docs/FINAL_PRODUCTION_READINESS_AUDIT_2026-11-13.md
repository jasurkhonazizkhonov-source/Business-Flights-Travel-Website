# Final production-readiness audit - Business Flights Travel website (updated) - 2026-11-13

Audit only. Nothing was fixed, deployed, restarted, committed or changed in production; no migration was run; no production credential, e-mail or submission was used.
Companion reports: the CRM audit (`compass-tools-updated/docs/FINAL_PRODUCTION_READINESS_AUDIT_2026-11-13.md`) and the joint report
(`docs/JOINT_WEBSITE_CRM_RELEASE_READINESS_2026-11-13.md`).

## Decision

**READY WITH CONDITIONS** (as a release candidate). It cannot be released today; every condition below is a prerequisite, none is a defect in the website's code.

| # | Condition | Why |
|---|---|---|
| 1 | The working tree is committed (22 modified + 96 untracked files today, including legal/privacy wording that was held for review) and the commit is the one deployed | `deploy/deploy.sh` refuses a dirty tree (line 10) |
| 2 | The updated CRM is released first, with the website API enabled (`WEBSITE_API_KEY`, `WEBSITE_API_COMPANY_ID`) and reachable as `http://compass-crm:3000` on the network `compass-tools-website-api` | the website's flight, contact and newsletter forms are useless without it |
| 3 | The VPS `.env` for the website is rewritten (CRM variables in, every `DATABASE_*` variable out) | `deploy/preflight.sh` refuses to continue while any is present |
| 4 | The actual VPS network names are confirmed (section 12) | the original website joined `compass-tools_internal`; the updated one joins two different networks |
| 5 | An end-to-end test against an isolated CRM with fake data passes (not possible in this audit) | integration is proven only against a stand-in CRM |
| 6 | The image is built once on a machine with Docker (this machine has none) | the Docker build was not exercised here |

## 1. Project identity and baseline

| | Updated website (release candidate) | Original website (reference) |
|---|---|---|
| Folder / port | `F:\Claude Workspace\Travel Agency Website-updated` / 3101 | `F:\Claude Workspace\Travel Agency Website` / 3100 |
| Branch / HEAD | `work/website-crm-api-integration` / `d1d1b61` | `feature/vps-website` / `10fe079` |
| Staged / unstaged / untracked | 0 / 22 / 96 (95 pre-existing + this audit's reports) | 0 / 24 / 11 |
| Merge / stash | none / none | none / none |
| Git index SHA-256 (prefix) | `ec6f1b99033ec38f` (unchanged since the start of the previous task) | `5fc1185e72fe52e0` |
| Package manager, versions | npm 11 (lockfile consistent: `npm ls --all` exit 0); next 16.4.2, react 19.2.8, no Prisma/pg | next 16.3.1, react 19.2.8, Prisma 7, pg |
| Env files (names only) | `.env.example`, `.env.vps.example` | `.env` (not read), `.env.example`, `.env.vps.example` |
| Docker / deploy | `Dockerfile`, `.dockerignore`, `compose.yaml`, `deploy/{common,deploy,preflight,rollback,verify}.sh`, `deploy/verify-responses.mjs` | same names, database-based |
| Runtime used here | Node 24.19.0; the Dockerfile pins `node:24.21.0-bookworm-slim@sha256:...` | same pin |
| Hashes | SHA-256 inventory of all 290 non-generated files taken at the start of the previous task, repeated at its end (only `CLAUDE.md`, one spec and one report differ); the original website: 0 differences against its baseline |  |
| Local servers (not touched) | 3101: PID 16196, cwd `Travel Agency Website-updated`, `/api/health` 200 | 3100: PID 6780, cwd original, 200; 3000 and 3001 are CRM ports |

## 2. Architecture comparison with the original

Independently re-checked (not copied from the parity report): the route/layout set (24 files), the 43+1 components, the 7 data files and the 14 public assets are identical apart from two additions
(`QuoteConsentNotice.tsx`, `useScrollPopoverIntoView.ts`); there is no original-only visitor-facing file. The differences are the intended ones:

| Area | Original | Updated | Intentional? |
|---|---|---|---|
| Persistence | Prisma + `pg`, runtime role, schema guard, TLS, lead queue in the website | none; forms call the CRM over HTTP (`src/lib/crm-api/*`) | yes (API-only requirement) |
| Compose networks | joins `compass-tools_internal` (reaches PostgreSQL `db`) | joins `compass-tools-website-api` (internal, carries only the CRM app as `compass-crm`) and `compass-tools_web` (tunnel) | yes |
| Env | `DATABASE_URL`, `DATABASE_SSL_*`, `DATABASE_AUTO_INIT` | `CRM_API_URL` (default `http://compass-crm:3000`), `CRM_API_KEY`, `CRM_COMPANY_ID`, optional `LEAD_INGEST_SECRET` | yes |
| Health | `/api/health` (never touched the DB) | same, no CRM call | unchanged |
| Next.js | 16.3.1 | 16.4.2 | security patch line |
| Vercel build (`vercel-build`) | present | removed | VPS is the target |

No CRM source is imported and no database is reachable from the website (0 imports of CRM code; 0 files mention Prisma, `DATABASE_URL` or `pg`; the preflight also refuses database variables).

## 3. Preserved functionality

All visitor-facing functionality of the original is present (pages, navigation, header/footer/mobile menu, flight request one-way / round-trip / multi-city, passengers, cabin, airport search, date range, contact, newsletter, cookie consent, legal pages, blog and 171 destination pages, error and not-found pages, SEO, JSON-LD, sitemap, robots). No analytics or tracking script exists in either project. Evidence: identical route set, `validate:content` and `validate:seo` (218 routes, 0 failures) and the browser projects (section 9).

## 4. Implemented improvements - verified in source and by tests

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | Inline failure messages (flight, contact, newsletter) | present | `src/lib/safe-action.ts`; `callAction` + `role="alert"` in all three forms |
| 2 | Entered values preserved after failure | present | e2e `expectTypedValuesKept`; 35/35 (retries off) |
| 3 | Manual retry, no automatic resubmission | present | `callAction` runs the action once; test "never calls the action a second time" |
| 4 | Busy/loading state | present | own `busy` flag (React's transition flag stayed set after a time-out) |
| 5 | Contact `submissionId` | present | form id (`randomUUID`) + hash of the typed fields, `<id>.<16 hex>` |
| 6 | Contact idempotency contract | present on the website side; **CRM side proven only with mocks** | `docs/CRM_API_INTEGRATION.md`; section 11 |
| 7 | Silent newsletter honeypot | present | `subscribe-newsletter.ts` lines 32-35; e2e |
| 8 | 64 KB Server Action body limit | present, works on Next 16.4.2 | `next.config.ts`; 10-test spec; oversize answers HTTP 200 with an opaque error row (Next behaviour), no action run |
| 9 | Lazy phone validation | present | `src/lib/phone-validator.ts`; spec passes on a production build |
| 10 | Updated company contact information | present | `src/lib/constants.ts`: +1 415 570 9267, info@businessflights.travel, 350 Sansome St; old values forbidden by `contact-details-and-consent.spec.ts` |
| 11 | Quote consent notice and privacy link | present | `QuoteConsentNotice.tsx` (links to `/privacy-policy`), rendered by `FlightRequestForm.tsx:539`. **Uncommitted and held for your legal review** |
| 12 | SEO and accessibility | present | 17 a11y tests (original 10), `json-ld.spec`, `design-integrity.spec`, validators |
| 13 | Dependencies | present | `npm audit`: 7 moderate findings, all in dev tooling (`typescript-eslint`, `minimatch`); `npm audit --omit=dev`: **0** |
| 14 | Docker / production build | build present; **Docker build not run** | standalone build succeeded today 08:00:44; no source file is newer than it; Docker is not installed on this machine |

Nothing reported as implemented was found missing. Items 6 and 14 are only partly verified (see their notes).

## 5. Missing or regressed functionality

None found. Categories C-F of the parity report stand: database/Vercel tooling intentionally removed; local AI tooling and secrets not copied; two release-tooling items (TEST_BASE_URL guard, API-only release-validation script) await your decision.

## 6. Source and configuration integrity

* The release candidate is **not a clean commit**: 22 tracked files modified and 96 untracked (including `QuoteConsentNotice.tsx`, `phone-validator.ts`, `safe-action.ts`, new tests and docs). `deploy/deploy.sh` refuses a dirty tree, so these must be committed first. Held items: legal/privacy wording.
* `CLAUDE.md` (git-ignored) was restored in the previous task; the original was not modified.
* `next-env.d.ts` and build output are regenerated artefacts.

## 7. Dependency and security findings

Website: 0 critical, 0 high, 7 moderate (all dev tooling: `typescript-eslint` family <= 8.72.2, `minimatch` 7-11), 0 in the production dependency tree. Not a blocker. The website and CRM trees are independent (separate `package.json`, lockfiles, `node_modules`). Next 16.4.2 is past the advisory range reported for 16.0.0-16.4.0.

## 8. Build results

`tsc --noEmit` clean; ESLint clean (both re-run in this audit); `NEXT_OUTPUT=standalone npm run build` succeeded earlier today and is current (no newer source). Docker build: **not run** (blocked: Docker is not installed here).

## 9. Test results

Re-run in this audit: `tsc` 0 errors, ESLint 0 problems, `npm audit`, `npm ls --all` (consistent). The browser and infrastructure suites were **not re-executed** in this audit; the results below are from earlier today on source that has not changed since (verified: no file newer than the build; the only later edit is a test helper and the reports).

| Suite | Passed | Failed | Skipped | Flaky | Notes |
|---|---|---|---|---|---|
| Desktop Chrome (336) | 332 | 1 | 2 | 1 | `phone-validation-loading.spec.ts:27`; flaky `redesign.spec.ts:335` |
| Mobile 320 / 375 / 390 (336 each) | 333 / 332 / 333 | 1 each | 2 each | 0 / 1 / 0 | same `:27`; flaky phone `:178` on 375 |
| Infrastructure (167) | 160 | 0 | 6 | 1 | skipped = opt-in live-CRM spec (**not run**) |
| `form-failure-recovery-e2e` after hardening, retries off | 35 | 0 | 0 | 0 | |
| Phone spec on the production build | 14 (3 of 4 runs) | 1 once (`:129`) | 0 | | not reproducible in 3 repeats |

**The `phone-validation-loading.spec.ts:27` failure is explained, not unexplained.** It asserts that the chunk fetched when the phone field is focused does not contain libphonenumber's metadata. On the Turbopack **dev** server that chunk *is* the library chunk, so the marker is present and the test fails in all four viewports, deterministically; on a **production** build the same test passes. It is a development-server-only discrepancy in the test's premise, not an application bug and not a production issue; assertions were not weakened. The three flaky results are timing races under machine load, each passing on its automatic retry; the two isolated ones pass repeatedly. The suite should not be called "clean": one explained failure remains on the dev server.

## 10. Database and migration requirements

None. The website has no database. After cut-over, the website's PostgreSQL runtime role and its grants (created for the old architecture) become unused; revoking them is a separate, optional, approved action.

## 11. API integration compatibility (website side checked against the CRM's real schemas)

| Endpoint | Auth | Website sends | CRM requires | Result |
|---|---|---|---|---|
| `POST /api/v1/website/flight-inquiries` | `Authorization: Bearer <CRM_API_KEY>`; header `Idempotency-Key` (8-200 of `A-Za-z0-9._-`) | firstName, lastName, phone (E.164), email?, tripType, departure/arrival IATA, departureDate, returnDate?, segments? (MULTI_CITY), cabinClass, adults, children, infants, datesFlexible, preferredAirline?, approximateBudget?, budgetCurrency?, additionalNotes?; signed visitor-context headers when `LEAD_INGEST_SECRET` is set | strict schema (unknown field = 400; `companyId`/`submissionId` in the body = 400), 32 KB cap, phone possible-number check, request-hash fingerprint | **fields, types, enums and limits match** (checked field by field against `flightInquiryBase`); website limits are tighter than the CRM's (adults 9 vs 20, 6 legs, notes 2000 vs 5000) |
| `POST /api/public/contact-inquiry` | none; `companyId` in the body | companyId, firstName, lastName, email, phone, subject, message, `submissionId?` | zod schema; `subject` enum identical (5 values); unknown fields stripped | **match**; `submissionId` accepted only by the updated CRM (older CRM ignores it) |
| `POST /api/public/subscribe` | none | companyId, email, source | companyId, email, source? | **match** |

Responses: flight `201/200 {ok,leadId,duplicate}`, `409 idempotency_key_reused`, `400 validation_failed`, `401/404/413/415/429/503` (website maps each: no retry on 400/401/403/404/409, bounded retry on 429/5xx/timeouts, flight only); contact `200 {ok,id,duplicate?}`, `409`, `400`, `429`, `500`; subscribe `200 {ok}`. The website timeouts and retries are as documented in `docs/CRM_API_INTEGRATION.md`.
**Not proven:** behaviour against a *running* CRM with its database. The opt-in `crm-contract-live.spec.ts` was not run (no isolated CRM/database is authorised). Classified **blocked / not run**, not passed. The CRM's `compose.yaml` publishes the exact network and alias the website expects (section 12), and the CRM's flight API answers 404 to requests that arrive through the public Cloudflare hostname (unless `WEBSITE_API_ALLOW_PUBLIC_ROUTE` is set), so the website must (and does) use the private hostname.

## 12. Docker and VPS compatibility

Verified from the files of both projects:

* Website `compose.yaml`: one service `bft-web`, image `business-flights-web:${APP_VERSION:-local}`, `expose: 3000`, **no published ports**, alias `bft-web`, joins external networks `${CRM_API_NETWORK_NAME:-compass-tools-website-api}` and `${TUNNEL_NETWORK_NAME:-compass-tools_web}`; project name `business-flights-travel`.
* CRM `compose.yaml` (project `compass-tools`): defines `website_api` as `name: compass-tools-website-api` (`internal: true`) with the CRM `app` carrying the alias `compass-crm`, and `web` (therefore `compass-tools_web`, carrying `app`, `cloudflared`, `cvv-cleanup`). **Names, alias and ports are compatible** with the website's defaults. `db` is only on `data`, so the website's preflight "no `db` name resolves" check passes.
* Dockerfile: pinned Node 24.21.0 bookworm-slim, non-root `node`, standalone output, healthcheck `scripts/healthcheck.mjs` (GET `/api/health` = 200 `{"status":"ok"}`, still valid), no secrets, no Prisma.
* `deploy/preflight.sh`: requires `CRM_API_KEY` (>= 32 chars), `CRM_COMPANY_ID`, `GMAIL_SENDER_EMAIL`, `GMAIL_APP_PASSWORD`; `LEAD_INGEST_SECRET` optional (warning if unset, error if shorter than 32); refuses `DATABASE_URL`, `DIRECT_URL`, `DATABASE_SSL_*`, `DATABASE_AUTO_INIT`; verifies the host named by `CRM_API_URL` resolves on the CRM network. Variable names only are listed here; no value was read.
* Cloudflare Tunnel target stays `http://bft-web:3000`; the tunnel connector must be on `compass-tools_web`.

**Conflict to verify on the VPS (not assumed):** the *original* website was written for a network named `compass-tools_internal` ("reported"). Neither CRM compose defines a network with that name. If the live stack still uses it, the new website cannot reach the CRM until the CRM stack is redeployed with the new layout, and redeploying the CRM removes the network that the **currently live** website uses to reach PostgreSQL and the tunnel. See the joint report for the sequencing consequence.

Exact VPS facts to confirm before deploying (read-only commands, none run here): `docker network ls`; which networks `cloudflared`, `app` and `bft-web` are on; whether the alias `compass-crm` resolves from a container on `compass-tools-website-api`; the live CRM's `WEBSITE_API_COMPANY_ID` and the company id in the CRM database (the flight API uses the credential's company, contact/newsletter use `CRM_COMPANY_ID` - they must name the same company); the website container/image names and `business-flights-web:previous`; free disk and memory for the build; the Cloudflare cache rules for HTML (purge after release).

## 13. Production operational risks

* **Cut-over downtime and ordering** (section 12): the live website and the new one cannot both be served by the same container name; plan a short window.
* **Duplicate submissions across the cut-over:** the flight request is idempotent at the CRM (key per form). The contact message is idempotent only once the *new* CRM is live; a visitor resending during the window against an old CRM can create two inquiries (previous behaviour).
* **Visitor IP and location** need `LEAD_INGEST_SECRET` identical on both sides, else leads are created without them (a warning, not a failure).
* **No store-and-forward:** if the CRM is down longer than the retry window, a request is lost (the visitor sees the friendly error).
* **The website's rate limiter is per process;** the CRM's public limiter cannot key website-mediated traffic (no trusted visitor IP on the private network) and fails open by design.
* **Legal/privacy wording** is uncommitted and unreviewed.

## 14. Rollback requirements

The previous image is kept as `business-flights-web:previous` only when the running container was healthy at deploy time (`deploy.sh`); `rollback.sh` returns to it. The old (database) website image rolls back only while the old networks, `DATABASE_URL`, the database role and the CRM's old schema still exist; rolling the website back after a CRM redeploy that removed `compass-tools_internal` needs the CRM layout restored too. The website has no data of its own to roll back.

## 15. Outstanding blockers

* **Critical:** none in the website's code.
* **High:** release source is an uncommitted working tree; legal wording unreviewed; the CRM prerequisites (joint report).
* **Medium:** Docker build and a live CRM test not executed; the VPS network name conflict is unverified; explained dev-only failing spec.
* **Low:** 3 timing-flaky tests under load; 7 dev-tooling advisories.

## 16. Recommendations

1. Review and commit the working tree (decide the legal wording); deploy only that commit.
2. Release the CRM first (joint plan), then rebuild the website image from the committed source.
3. Run, in an authorised isolated CRM with fake data, the opt-in `crm-contract-live.spec.ts` plus one manual flight, contact and newsletter submission, and the contact double-click / resend cases.
4. Run `docker compose build` once in CI or on the VPS and `deploy/preflight.sh` (read-only) before the real deploy.
5. Decide the two category-F items from the parity report.
