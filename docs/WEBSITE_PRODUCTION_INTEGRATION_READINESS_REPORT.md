# Production integration readiness report

Date: 2026-11-15. Scope: website to Compass-Tools CRM integration, deployment configuration, privacy wording, repository security. This repository is public; no secret, customer data, full visitor IP or server address is in this report. Earlier reports are kept; this one adds the 2026-11-15 investigation and the results of the independent re-run.

## Final decision

| | Status | One-line reason |
|---|---|---|
| **Website-to-CRM integration readiness** | **READY WITH LIMITATIONS** | The website's request contract matches the CRM source field for field and is verified end to end against a stand-in CRM, including failures and wrong settings; but the **live CRM is older than that source, its authentication and an actual submission are not verified**, and the signed visitor context has a documented replay and body-binding limitation that needs a CRM change |
| **Production redeployment readiness** | **NOT READY** | The deployment branch is unverified; the live CRM version, Docker networks and `.env` are unverifiable from here (no authorised server access); the documented live single-network layout fails the preflight's database-isolation rule (correctly); the Docker image was never built or rehearsed; legal review is outstanding |

## 1. What was verified, by level

| Level | Result |
|---|---|
| **Read-only production (anonymous public requests only)** | Website: Cloudflare, Next.js, **old database-backed release** still live (old contact details, no shared structured-data ids, `X-Powered-By`, `/api/health` and `Disallow: /api/` present). CRM: reachable, TLS valid, `/api/health` ok with database ok, the three website routes **registered** (GET answers 405), health output **older than the updated source**. No cookies set on any live response. **No server, Docker, log or environment access.** No POST sent |
| **Authentication and a real submission against production** | **NOT VERIFIED** (not allowed without separate approval) |
| **Source contract read (CRM read-only)** | Paths, methods, auth, company handling, idempotency, visitor context, rate limits, public-edge refusal: matched against the website (`WEBSITE_LIVE_CRM_ENDPOINT_VERIFICATION.md`) |
| **Local integration (stand-in CRM, fake data)** | all scenarios in `WEBSITE_CRM_FAILURE_AND_RETRY_TEST_REPORT.md` pass |
| **Mock vs live** | Nothing local proves the live CRM accepts the current requests |

## 2. Bugs and defects fixed in this pass (working tree only, **not committed, not pushed**)

| # | Defect | Root cause | File | Fix | Regression test | Result |
|---|---|---|---|---|---|---|
| 1 | The preflight's database-isolation rule recognised a database only by the alias `db`, so a PostgreSQL container under any other name (`postgres`, `pgbouncer`, a custom name) could share a network with the website and pass | name-only heuristic for a topological property | `deploy/preflight.sh` | the rule also refuses by alias `postgres`/`postgresql`/`pgbouncer` and by **image** (PostgreSQL, PostGIS, pgvector, TimescaleDB, PgBouncer, Pgpool); error text updated; an ordinary container is still accepted; the rule was not relaxed anywhere | `tests/deploy-scripts.spec.ts`: image-only disguise, three other names, ordinary sidecar passes, original `db` case | 19 of 19 pass |
| 2 | The newsletter route was named `/api/public/newsletter` in two published reports (the code and the CRM use `/api/public/subscribe`) | documentation error | `docs/WEBSITE_CRM_API_INTEGRATION_VERIFICATION.md`, `docs/WEBSITE_ENVIRONMENT_AND_DEPLOYMENT_CONFIGURATION_AUDIT.md` | corrected, erratum added | n/a (the code was right and is covered by the e2e newsletter test) | done |
| 3 | A public documentation file published the server's address and account name | unnecessary operational detail | `docs/DEPLOYMENT_VPS.md` | address removed, path generalised, instructions kept | n/a | done in the working tree; the published branch still has it until a push is approved |
| 4 | Test gaps for the scenarios requested | missing coverage | `tests/crm-api-actions-e2e.spec.ts` | three end-to-end tests: unknown company id; a signing secret the CRM does not share; an unresolvable CRM hostname | themselves | 3 of 3 pass |

No privacy or terms wording was changed (nothing found was a confirmed technical inaccuracy that could be fixed without inventing wording). No product code (`src/`) was changed, so the production build of the previous pass is still the build of this source.

## 3. Test results (current run, 2026-11-15; the earlier baselines are historical only)

| Check | Command | Result |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | exit 0, no errors |
| ESLint | `npx eslint src tests scripts deploy` | exit 0, no findings |
| Content validation | `node scripts/validate-content.mjs` | passed in the previous pass; source unchanged |
| Production build | `NEXT_OUTPUT=standalone npm run build` | **not re-run**: no `src/`, config or dependency change since the passing build of 2026-11-15 (exit 0, first attempt) |
| Standalone runtime / SEO crawl | `npm start` on port 3101, then `node scripts/validate-seo.mjs` | 218 routes (11 static, 171 destinations, 36 articles), **0 failures** |
| Browser projects | `npx playwright test --project="Desktop Chrome" --project="Mobile 320" --project="Mobile 375" --project="Mobile 390" --workers=2 --retries=0` | **1392 passed, 0 failed, 8 skipped** (1400 tests, 14.6 min). The 8 skips are viewport-conditional by design (no hamburger on desktop, touch checked once, three-column layout from `lg`) |
| Infrastructure | `npx playwright test --project=Infrastructure --no-deps --workers=1 --retries=0` | **171 passed, 0 failed, 6 skipped** (10.4 min; 168 earlier plus the 3 new). The 6 skips are `crm-contract-live.spec.ts`, which needs a **non-production CRM you point it at: NOT RUN** |
| Deploy scripts alone | `... tests/deploy-scripts.spec.ts` | 19 passed |
| Dependencies | `npm audit --omit=dev` | 0 vulnerabilities (previous pass; manifest unchanged) |
| Docker image build, isolated Docker network simulation, port-5432 exposure check | n/a | **BLOCKED**: Docker is not installed (no WSL distribution either) |
| PostgreSQL-backed tests (CRM idempotency locks) | n/a | **BLOCKED / NOT RUN**: no approved disposable database; none installed |
| Read-only production checks | public `GET`/`HEAD` | done, see section 1 |

The temporary production server I started on 3101 for these checks was identified by its process and command line and stopped afterwards; nothing else was started or stopped.

## 4. Remaining limitations (all unresolved, each with the reason)

1. Live deployment branch **NOT VERIFIED**: no CI, no workflow, no release record, no server access; the public fingerprint is consistent with `feature/vps-website`.
2. Live CRM version and authentication **NOT VERIFIED**: no authorised production test.
3. Docker networks, aliases, ports, health, restart policy, logs, variable names **NOT VERIFIED**: no server access.
4. Docker build and rollback rehearsal **NOT RUN**: Docker unavailable.
5. Replay and body binding of the signed visitor context **OPEN**: needs a CRM-side change (proposal in `WEBSITE_REQUEST_SIGNING_AND_REPLAY_PROTECTION_AUDIT.md`).
6. Real PostgreSQL behaviour of the CRM idempotency locks **NOT RUN**.
7. Real Cloudflare headers **not observed** (simulated).
8. Legal review of Privacy, Cookie and Terms and of the quote-button wording **outstanding**; the contact form has no privacy pointer.
9. The CRM's per-IP limiter does not throttle website traffic; the website's in-memory limiter is the only throttle.
10. A CRM outage means a submission exists only in the visitor's open form (no website storage by design).
11. The server address remains in the published history and on the published review branch.

## 5. Related reports

`WEBSITE_LIVE_CRM_ENDPOINT_VERIFICATION.md`, `WEBSITE_PRODUCTION_DOCKER_NETWORK_AUDIT.md`, `WEBSITE_PRODUCTION_ENVIRONMENT_AND_PROCESS_AUDIT.md`, `WEBSITE_REQUEST_SIGNING_AND_REPLAY_PROTECTION_AUDIT.md`, `WEBSITE_PRIVACY_TERMS_AND_CONSENT_REVIEW.md`, `WEBSITE_PUBLIC_REPOSITORY_SECURITY_REVIEW.md`, `WEBSITE_CRM_FAILURE_AND_RETRY_TEST_REPORT.md`, `WEBSITE_REDEPLOYMENT_BLOCKERS_AND_REQUIRED_APPROVALS.md`.
