# Joint website + CRM release readiness - 2026-11-13

Audit only: nothing was deployed, restarted, migrated, committed or changed in production, and no VPS was contacted. This report ties together
`Travel Agency Website-updated/docs/FINAL_PRODUCTION_READINESS_AUDIT_2026-11-13.md` and `compass-tools-updated/docs/FINAL_PRODUCTION_READINESS_AUDIT_2026-11-13.md`.
Everything about the live VPS below is a **historical reference or a file-derived expectation**, not a verified fact.

## Decision

| Application | Classification |
|---|---|
| Updated CRM (`compass-tools-updated`) | **NOT READY** - release source is an unfinished merge plus uncommitted work (Docker/deploy assets only staged), and one new migration may fail to apply (UTF-8 BOM) |
| Updated website (`Travel Agency Website-updated`) | **READY WITH CONDITIONS** - deployable only after the CRM release, a committed source, a rewritten `.env`, confirmed network names and an end-to-end test |
| **Joint** | **NO-GO today.** A controlled release becomes possible once the CRM is committed and verified against PostgreSQL, and the VPS facts in section 6 are confirmed. |

Not asserted anywhere: that the integration works against a live CRM (blocked - no isolated CRM with a database is authorised), that the Docker images build (Docker is not installed on this machine), or that contact idempotency is correct in PostgreSQL (mocked tests only).

## 1. Exact website-to-CRM integration dependencies

| Website needs | CRM provides | Verified how |
|---|---|---|
| `POST /api/v1/website/flight-inquiries`, Bearer `CRM_API_KEY`, `Idempotency-Key` | the route, `WEBSITE_API_KEY` (>= 32 chars), strict schema, 32 KB cap, fingerprint table `LeadIngestFingerprint` (migration `20261016000100`, already in the original CRM line) | schema compared field by field: compatible; DB behaviour unverified |
| `POST /api/public/contact-inquiry` with optional `submissionId` | idempotency (derived id + advisory lock), `409` on key reuse, `duplicate` flag; **table `InquirySubmissionInfo`** (new migration `20261113000100`) | code read, 14 mocked tests; **needs the migration and a PostgreSQL test** |
| `POST /api/public/subscribe` | route unchanged | compatible |
| Company identity: `CRM_COMPANY_ID` (contact, newsletter) | `WEBSITE_API_COMPANY_ID` (flight API; default `default-company`) | **both must name the same real company**; unknown in production |
| Optional signed visitor context (`LEAD_INGEST_SECRET`, identical both sides) | verifies it within 5 minutes | stand-in CRM tests only |
| Private reachability `http://compass-crm:3000` | alias `compass-crm` on network `compass-tools-website-api` (`internal: true`) | read from both compose files: names match |

The flight API rejects calls that arrive through the public Cloudflare hostname; the website must use the private network (it does).

## 2. Which application first - and why

**The CRM first.** (1) The website's forms call the CRM API; without it every submission fails with the friendly error. (2) The CRM changes are additive and backward-compatible with the website that is live today: the new migrations only add two nullable columns and one table, and the old website writes straight to the same tables, so migrating and starting the new CRM does not break the old website's data path. (3) The new website's `submissionId` is ignored by an older CRM, so the reverse order would silently lose the idempotency guarantee. **But:** if the live stack uses the network `compass-tools_internal` (the original website's documentation), redeploying the CRM from the current compose replaces it with `data` / `web` / `website_api`, and the live website - which reaches PostgreSQL and the tunnel through that network - stops working until the new website is deployed. In that case the CRM and website releases are one maintenance window, with the new website image built and its preflight passed beforehand.

## 3. Database migrations and verification

* Two new migrations (additive, no backfill, no destructive statement): `20261108000100_sign_in_location_provenance`, `20261113000100_inquiry_submission_info`. Production may also lack up to 2 others (the last reported production state was 72 migrations; the original CRM has 74): **unknown, to be read with `prisma migrate status`**.
* The newest file begins with a UTF-8 BOM; PostgreSQL probably rejects it. Strip it before committing, then prove both migrations on a disposable database that mirrors production's migration state (separately authorised; the project's guard allows only a loopback database named `compass_test`).
* Verification list for contact idempotency (advisory lock inside Prisma's interactive transaction, concurrent identical and conflicting requests, explicit id vs cuid, isolation, timeout, cascade) is in the CRM report, section 10. Treat it as a release gate.
* Migrations are applied only by `deploy/deploy.sh --migrate` after a verified backup (`backup-db.sh`); the app never starts before migrations succeed.

## 4. Environment variables by name only

* **Website `.env`:** required `CRM_API_KEY`, `CRM_COMPANY_ID`, `GMAIL_SENDER_EMAIL`, `GMAIL_APP_PASSWORD`; optional `LEAD_INGEST_SECRET` (>= 32 chars), `CRM_API_URL` (default `http://compass-crm:3000`), `CRM_API_NETWORK_NAME`, `TUNNEL_NETWORK_NAME`. **Must be absent:** `DATABASE_URL`, `DIRECT_URL`, `DATABASE_SSL_MODE`, `DATABASE_SSL_CA`, `DATABASE_SSL_VERIFY`, `DATABASE_AUTO_INIT` (preflight refuses to run otherwise).
* **CRM `.env`:** `APP_BASE_URL`, `POSTGRES_PASSWORD` (+ optional `POSTGRES_USER`, `POSTGRES_DB`), `CRON_SECRET` (mandatory; also unlocks the detailed health report), `WEBSITE_API_KEY` (equal to the website's `CRM_API_KEY`), `WEBSITE_API_KEY_NEXT` (rotation), `WEBSITE_API_COMPANY_ID`, `LEAD_INGEST_SECRET` (equal to the website's), `UPLOAD_*`, Google sign-in and Gmail settings, the Cloudflare tunnel token. Optional: `DISABLE_IN_PROCESS_POLLER`, `WEBSITE_API_ALLOW_PUBLIC_ROUTE` (leave unset).
* No value was read or is shown. Production `.env` files were not touched.

## 5. Docker network and hostname compatibility

| Item | Website compose expects | CRM compose provides | Result |
|---|---|---|---|
| API network | external `compass-tools-website-api` | `website_api` with fixed `name: compass-tools-website-api`, `internal: true` | match |
| CRM hostname | `compass-crm` on that network | alias `compass-crm` on `app` | match |
| Tunnel network | external `compass-tools_web` | `web` in project `compass-tools` -> `compass-tools_web`, carrying `cloudflared` and `app` | match |
| Tunnel target | `http://bft-web:3000` | unchanged | match (the tunnel's public hostname stays) |
| PostgreSQL isolation | no route to `db` | `db` only on `data` | match; preflight verifies no `db` name resolves |
| Name collisions | service `bft-web`, project `business-flights-travel` | services `db`, `app`, `cloudflared`, `cvv-cleanup`, `tools` | none |
| Older layout | original website: `compass-tools_internal` | not defined in either CRM compose | **conflict if the live stack still uses it** |

## 6. Facts to verify on the VPS (read-only; none checked)

1. `docker network ls`; members of every `compass-tools*` network; the network `cloudflared` is on; whether `compass-tools_internal` exists.
2. Which compose file/commit the live CRM runs (`~/apps/Compass-Tools`, `~/apps/Compass-Tools-release`), its image tag, and whether `website_api`/`compass-crm` already exist.
3. `prisma migrate status` result and the applied-migration list; free disk for a dump; backup timer status and the last verified backup.
4. The live CRM company id, `WEBSITE_API_COMPANY_ID`, and whether `WEBSITE_API_KEY` is set (>= 32 characters) - name only.
5. The website's current container (`business-flights-travel-bft-web-1`), image (`business-flights-web:local`) and whether `business-flights-web:previous` exists; the DB role it uses.
6. Free memory/swap for two image builds (the CRM build needs about 3 GB); the Cloudflare cache rules for HTML.
7. Whether `data/geoip/city.mmdb` is provisioned (otherwise sign-in/inquiry locations stay empty).

## 7. Release sequencing (to be executed only after approval; nothing here was run)

0. **Preconditions (blockers):** commit the CRM merge and its work (strip the migration BOM), review and commit the website tree (including the held legal wording), merge both to their `main`; build both images in CI or on the VPS; run the PostgreSQL verification list in an authorised disposable database; run the website's `crm-contract-live.spec.ts` and manual flows against an isolated CRM with fake data; confirm section 6.
1. Announce a window (the live website is replaced; contact/flight requests cannot be taken during it). Take a **verified database backup** and a copy of both `.env` files (offline, unreadable to the repository).
2. **CRM:** `bash deploy/deploy.sh --ref <sha>` first without `--migrate` (shows pending migrations and stops), then with `--migrate`; require `verify.sh` to pass (it reads the detailed health with `CRON_SECRET` from inside the container). Confirm `compass-tools-website-api` exists and `compass-crm` resolves from it.
3. **Website:** rewrite `.env` (section 4), run `deploy/preflight.sh`, then `deploy/deploy.sh`; it keeps `business-flights-web:previous` only if the running container was healthy.
4. Confirm the tunnel reaches `http://bft-web:3000` (public home page, `/api/health` 200, HSTS, no `X-Powered-By`).
5. If, and only if, the live network turned out to be `compass-tools_internal`, steps 2-3 run back to back in the same window.

## 8. Post-deployment verification

Data-free first: CRM `/api/health` anonymous answer is exactly `{"status":"ok"}` with 200; detailed health from inside the container shows `schema: current` and `pendingMigrations: 0`; response headers contain no `X-Powered-By`; the website container is `healthy`; from the website container the CRM API answers `401` to a wrong key and `400` to an empty body with the right key (no record created); the CRM answers `404` on the API when called through the public hostname. Then **one** clearly labelled test lead, one contact message (and a deliberate second press of Send) and one newsletter address, only with your explicit approval and only after deciding how the test records are removed in the CRM; check one inquiry (not two), the IP/location fields when `LEAD_INGEST_SECRET` is set, the staff notification, and the campaign preview in a signed-in browser. Watch logs for `P2021`/`P2002`, 5xx, `unauthorized` and rate-limit messages for the first hour.

## 9. Rollback sequencing

Order: website first, CRM second. (a) Website: `deploy/rollback.sh` to `business-flights-web:previous`. That image is the *old database* architecture; it can run again only if its network (`compass-tools_internal`), `DATABASE_URL` and database role still exist, so a rollback after a CRM redeploy that removed that network also requires restoring the old network layout and the saved `.env`. (b) CRM: `deploy/rollback.sh <previous tag>`; the previous image works with the migrated schema because both new migrations are additive. (c) Database: restore the pre-migration backup only if a migration itself must be reversed; this discards data written since. **Application rollback does not undo migrations.** Keep: previous image tags, backup file name, the saved `.env` copies.

## 10. Findings by severity

**Critical blockers**
* CRM release source is an unfinished merge with uncommitted work; `deploy.sh` requires a clean checkout and a commit already on `origin/main`.
* New migration `20261113000100_inquiry_submission_info` begins with a UTF-8 BOM and may fail `prisma migrate deploy` (unverified).

**High-priority blockers**
* Contact and flight idempotency and the 551 database-backed CRM tests have never been run against PostgreSQL.
* No Docker build of either image has been run (Docker not installed here).
* Website release source is an uncommitted tree (22 modified, 96 untracked) including held legal wording.
* Production migration state, company id and network layout are unknown; the `compass-tools_internal` conflict could take the live website offline during the CRM redeploy.

**Medium**
* Live behaviour not observed: CRM `/api/health`, `X-Powered-By`, campaign preview (the local CRM on 3001 returns 500 after the dependency update and needs a restart).
* CRM test suite flaky under load (3,990/0 twice, 3,989/1 once); one website browser test fails on the dev server only (explained, passes on a production build).
* GeoIP database not provisioned in the image; CRM public rate limits fail open for website traffic.
* No store-and-forward when the CRM is down; flight requests retry only for a short window.

**Low**
* 38 CRM advisories in tooling chains (none reaches runtime as far as can be inferred), 7 website dev-tooling advisories; CRLF working trees; empty stray files in the original CRM.

**Items requiring your approval:** commit/merge of both trees; legal wording; stripping the BOM; restarting the local CRM on 3001; a disposable PostgreSQL for the verification list; the production maintenance window; any test submission in production; the two category-F website items.
**Items requiring VPS verification:** section 6.
**Items requiring a separate test environment:** the PostgreSQL checks, both migrations from a production-like state, `crm-contract-live.spec.ts`, Docker builds, end-to-end form flows with fake data.

## 11. Ordered release plan (not executed)

1. Approve and make the commits; fix the BOM. 2. Authorise a disposable PostgreSQL; run the integration suites and the idempotency checks; prove both migrations. 3. Build both images in CI. 4. Read-only VPS fact-finding (section 6). 5. Decide the network question and set the window. 6. Backup, CRM release, website release (section 7). 7. Verification (section 8). 8. Keep the rollback artefacts for a defined period; then, separately approved, retire the website's old database role.

## 12. Final go / no-go

**NO-GO now. GO becomes appropriate** when the two critical blockers are closed, the PostgreSQL verification and the Docker builds pass, and the VPS facts match section 5 (or the window plan in section 2 is accepted). No release should be described as ready while any of those remain unverified.
