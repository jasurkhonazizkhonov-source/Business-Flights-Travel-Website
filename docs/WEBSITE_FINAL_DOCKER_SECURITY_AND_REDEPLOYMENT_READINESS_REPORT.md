# Final Docker, security and redeployment readiness report

Date: 2026-11-15 (third pass). Scope: signing v2 and replay protection in both applications, CRM-side rate limiting, Docker topology and rehearsal preparation, environment comparison, privacy and wording free of any other company's name, SEO, public-repository review, backup and rollback preparation. **Nothing was deployed, committed or pushed; no production system, database, network, `.env`, Cloudflare or DNS setting was touched; nothing was sent to the live CRM** (the live CRM's authentication and a real submission are a post-deployment step, see section 28). This repository is public: no secret, customer datum, full visitor IP or server address is written here.

## 1. Executive readiness decision

| | Decision |
|---|---|
| **Overall** | **READY FOR DEPLOYMENT PREPARATION. NOT READY FOR PRODUCTION DEPLOYMENT.** |
| Why not the second status | The **Docker image build and the isolated container rehearsal have NOT run** (Docker is not installed on this machine; the rehearsal kit is written and statically tested, never executed). The deployment branch, the live CRM version, the live Docker networks and the live `.env` are unverifiable from here, and the documented live single-network layout fails the database-isolation preflight (correctly). Legal approval of the privacy/consent wording is outstanding. |
| What *is* done | Signing v2 with one-time nonces and body/method/path/company binding is implemented in **both** applications and tested; CRM per-visitor rate limiting of website traffic exists; preflight database isolation is image- and alias-aware; topology is documented, statically tested and has a rehearsal kit; the contact form has an internal privacy pointer; no other company's name or link exists anywhere in the website; BreadcrumbList is on every indexable page; the runbook with exact backup/deploy/rollback commands is written. |

## 2. Files modified in the website (all uncommitted)

* **Signing v2:** `src/lib/crm-api/visitor-context.ts` (rewritten: canonical message, `signRequestV2`, per-attempt `createRequestSigner`), `client.ts` (signs every attempt; `sign` replaces `visitorHeaders`), `config.ts` (company needed to sign flight requests), `src/server/actions/submit-contact-message.ts`, `submit-flight-request.ts`, `subscribe-newsletter.ts` (newsletter now signed, carries visitor IP for the CRM's rate limit only).
* **Privacy/contact:** `src/components/contact/ContactForm.tsx` (internal Privacy Policy pointer under the button, no checkbox, no consent wording).
* **SEO:** new `src/components/seo/BreadcrumbJsonLd.tsx`; used in `flights`, `business-class`, `how-it-works`, `destinations`, `contact`, `blog` pages and `LegalLayout` (privacy, cookie, terms).
* **Deployment:** `deploy/preflight.sh` (messages for the signing secret; earlier: image/alias-aware database check and the explicit legacy opt-in), new `deploy/rehearsal/{compose.rehearsal.yaml,mock-crm.mjs,run.sh}`, `.env.example`, `.env.vps.example`, `playwright.config.ts` (registers the static topology spec).
* **Tests:** `tests/support/stub-crm.ts` (verifies v2 with its own independent code), new `tests/support/signing.ts`, `tests/docker-topology.spec.ts`, `tests/breadcrumbs.spec.ts`; updated `contact-visitor-context`, `crm-api-client`, `crm-api-actions-e2e`, `vps-deployment`, `submission-ip`, `deploy-scripts`, `contact-details-and-consent`.
* **Docs:** `CRM_API_INTEGRATION.md`, `ENVIRONMENT.md`, `DEPLOYMENT_VPS.md` (server address removed), the earlier reports (newsletter route erratum, another company name removed, status updates), plus this report and `WEBSITE_VPS_DEPLOYMENT_AND_ROLLBACK_RUNBOOK.md`, and the nine reports of the previous pass.

## 3. Files modified in the CRM (`compass-tools-updated`, uncommitted; narrow: website API security only)

New: `src/server/website-request-signature.ts` (v2 verifier, canonical message, one-time nonce store), `src/server/website-signature-guard.ts` (policy, per-visitor rate limit, fixed refusal texts), tests `src/server/__tests__/website-request-signature.test.ts`, `src/app/api/public/__tests__/website-signed-routes.test.ts`. Modified: `public-inquiry.ts`, `src/app/api/public/subscribe/route.ts`, `src/app/api/v1/website/flight-inquiries/route.ts`, `lead-ingest-context.ts` (shared extraction of visitor fields; v1 unchanged for `lead-capture`), `inquiry-submission-info.ts`, `lead-submission-info.ts`, `security/rate-limit.ts` (`checkPublicRateLimitForKey`), `security/read-limited-json.ts` (also returns the raw bytes), `.env.example`, `docs/WEBSITE_LEAD_API.md`, and the tests that signed with v1 (`flight-inquiries/__tests__/route.test.ts`, `public-inquiry-submission-info.test.ts`, `website-visitor-context-contact.test.ts`, `read-limited-json.test.ts`). **No schema change, no migration, no change to unrelated CRM functionality.** Another session's untracked CRM files (`docs/recovery-archive/`, two earlier CRM reports) were left alone.

## 4. Previous Docker topology and the network mismatch

| | Earlier website (original repo, and live as last reported) | Updated website / updated CRM |
|---|---|---|
| Network | one network, `compass-tools_internal`, shared with the CRM app, PostgreSQL and `cloudflared` (original compose: `CRM_NETWORK_NAME`, alias `bft-web` on it) | website joins two **external** networks: the CRM's internal API network `compass-tools-website-api` (CRM alias `compass-crm`) and the tunnel network `compass-tools_web` (alias `bft-web`); the updated CRM compose already defines both (`website_api`, `web`) plus `data` for PostgreSQL only |
| Website's route to PostgreSQL | **yes** (same network; it used `DATABASE_URL`) | **none** by design |
| Tunnel origin | `http://bft-web:3000` | `http://bft-web:3000` (unchanged) |

**Remaining mismatch (unresolvable from the repositories):** the live stack's real layout is NOT VERIFIED (no server access); if it is the single shared network, the updated website's preflight **rightly fails**. No production network was or may be changed by this task. The runbook gives **Path 2 (recommended): an additive Compose override for the CRM project** that adds the two networks and attaches only the CRM app and the connector (PostgreSQL untouched, the old website keeps working, rollback is trivial), and Path 1 (adopt the release layout, maintenance window). **Needs your approval.**

## 5. Final intended Docker network diagram

```
                      Cloudflare edge  --(remotely managed tunnel)-->  cloudflared
                                                                          |  network: compass-tools_web
                                                                          v
   [ bft-web :3000 ]  alias bft-web   (website; no host port; no volume; no database variable)
        |  network: compass-tools-website-api  (internal, no internet)
        v
   [ compass-crm :3000 ]  alias compass-crm   (CRM app)
        |  network: data (internal)               (CRM only; the website is NOT on it)
        v
   [ PostgreSQL ]   (no published port; reachable by the CRM only)
```
The website's own default network gives it outbound access (Gmail SMTP, the photo host for `next/image`).

## 6. Website-to-CRM connectivity results

| Check | Result |
|---|---|
| Hostname resolution and HTTP reachability inside a Docker network | **BLOCKED / NOT RUN** (Docker unavailable). `deploy/rehearsal/run.sh` performs it (website resolves `compass-crm`, reaches `http://compass-crm:3000/api/health`, tunnel stand-in reaches `http://bft-web:3000`) |
| Contract against a stand-in CRM over real HTTP (standalone production server) | **PASS**: Infrastructure suite 182 passed, including flight, contact, newsletter, signing, failure and wrong-setting scenarios |
| Compose external-network declarations, tunnel alias, port, no published port, no volume, no database variable | **PASS** (static spec `tests/docker-topology.spec.ts`, 10 tests, plus the existing `vps-deployment`/`deploy-scripts` specs) |
| Preflight with a fake `docker`: refuses a database container sharing a network, **also when it hides under another alias or only by image** | **PASS** (`deploy-scripts.spec.ts`, 19 tests) |

## 7. Does the website have direct access to PostgreSQL?

By construction **no**: the website is not attached to the network that carries the database (updated CRM compose), it receives no database variable (compose forwards only a fixed list; a test forbids `DATABASE_*`/`POSTGRES` in it and in the Dockerfile `ARG`/`ENV`), the updated source reads none, and the preflight refuses any database container (by alias or image) on either of its networks. **Not demonstrated at container level**: the rehearsal (`db` unresolvable and unreachable from the website, reachable from the CRM stand-in) has not been run.

## 8. Environment variables: original versus updated

Derived from the actual files (`.env.example`, `.env.vps.example`, `compose.yaml`, `Dockerfile`, `deploy/*`) and `process.env` references in both trees.

| Variable | Class | Where / when | Notes |
|---|---|---|---|
| `DATABASE_URL` | 2 no longer required; **8 legacy, kept for rollback** | original compose required it (runtime) | updated source never reads it; compose does not forward it; preflight refuses it unless the shell-only opt-in |
| `DATABASE_SSL_MODE`, `DATABASE_SSL_CA`, `DATABASE_SSL_VERIFY`, `DATABASE_AUTO_INIT` | 2 + 8 | original runtime | same |
| `DIRECT_URL` | 2 (only named in the updated preflight's refusal list) | n/a | not read by the updated source |
| `CRM_NETWORK_NAME` | 2 (replaced) | original deploy-time (single network name) | replaced by the two below |
| `CRM_API_URL` | **3 new, required** | runtime | private origin, default `http://compass-crm:3000` |
| `CRM_API_KEY` | **3 new, required** | runtime | = CRM `WEBSITE_API_KEY`, >= 32 chars |
| `CRM_COMPANY_ID` | **3 new, required** | runtime | = CRM `WEBSITE_API_COMPANY_ID`; also signs flight requests |
| `LEAD_INGEST_SECRET` | 3/4 **optional, but must be set on both sides together** | runtime | signs every request (v2); a CRM with the secret refuses unsigned requests |
| `CRM_API_NETWORK_NAME`, `TUNNEL_NETWORK_NAME` | 7 deploy-only, optional | compose/preflight | defaults `compass-tools-website-api`, `compass-tools_web` |
| `PREFLIGHT_ALLOW_LEGACY_DATABASE_VARS` | 7 deploy-only | operator's shell, never `.env` | not an application variable |
| `GMAIL_SENDER_EMAIL`, `GMAIL_APP_PASSWORD` | 1 still required by compose/preflight (the mailer treats them as optional) | runtime | unchanged from the original |
| `TRUSTED_PROXY` | 1 | runtime, fixed to `cloudflare` by compose | |
| `PORT`, `HOSTNAME`, `NODE_ENV`, `NODE_OPTIONS`, `NEXT_TELEMETRY_DISABLED` | image-level runtime | Dockerfile | `NODE_OPTIONS` heap 3072 MB at build, 768 MB at runtime |
| `NEXT_OUTPUT` | 5 build-time only | Dockerfile builder stage | |
| `APP_VERSION` | 7 deploy-only | image tag | |
| `ANALYZE`, `VERCEL` | optional | build / runtime detection | |
| `APP_BASE_URL`, public site URL, `NEXT_PUBLIC_*` | **do not exist in the website** | | the site URL is the constant `SITE_URL` in `src/lib/constants.ts` (nothing to configure); no public variable |
| Cloudflare | none in the website | | the tunnel token belongs to the connector, owner-managed; the website never reads it |

**Does the updated website need `DATABASE_*`? No** (verified: no reference in source, compose or Dockerfile). Secrets are not baked in: the Dockerfile has no secret `ARG`/`ENV` (asserted by tests), `.next/static` contains none of the secret names (checked on the previous build), no `NEXT_PUBLIC_*`. **Image layers were not inspected** (no Docker); the rehearsal checks `docker history` and the image environment.

## 9. Required production variable names and purposes (no values)

Website `.env`: `CRM_API_KEY`, `CRM_COMPANY_ID`, `GMAIL_SENDER_EMAIL`, `GMAIL_APP_PASSWORD`, `LEAD_INGEST_SECRET` (recommended once the privacy wording is approved), optional `CRM_API_URL`, `CRM_API_NETWORK_NAME`, `TUNNEL_NETWORK_NAME`; legacy `DATABASE_*` may remain for the rollback window. CRM `.env`: `WEBSITE_API_KEY`, `WEBSITE_API_COMPANY_ID`, `LEAD_INGEST_SECRET` (same value as the website's), `TRUSTED_PROXY`, `CRON_SECRET`, `DATABASE_URL` (the CRM's own, never the website's); `WEBSITE_API_ALLOW_PUBLIC_ROUTE` must stay unset.

## 10. Signing v2 protocol specification

Headers: `x-ct-visitor-context` = base64url(JSON `{v:2, ts, nonce, ip?, city?, region?, country?, timezone?, source?}`), `x-ct-visitor-signature` = hex(HMAC-SHA256(`LEAD_INGEST_SECRET`, canonicalMessage)).
`canonicalMessage` = `"CT-WEBSITE-REQUEST-V2"` LF, then the seven fields, each as `<UTF-8 byte length>:<value>` separated by LF, in this order: **METHOD (upper case), path (pathname only), companyId, ts, nonce, SHA-256 of the exact body bytes (lower-case hex), the context header value as sent.** Length-prefixing removes any delimiter ambiguity. The method, path, company and body hash are not transmitted; the CRM recomputes them from the request it received (company = the credential's company on the flight route, the body's `companyId` on the public routes). Nonce: 22 to 64 characters of `[A-Za-z0-9_-]` (the website sends 128 random bits). Window: at most 120 s old, at most 30 s ahead. Comparison: constant-time. Known-answer vector (same literal in both test suites): signature `5bafec28...ed6d6` for the vector in the CRM's `docs/WEBSITE_LEAD_API.md`. Full text: CRM `docs/WEBSITE_LEAD_API.md` and website `docs/CRM_API_INTEGRATION.md`.

## 11. Replay protection: implementation and tests

One-time nonce, per company, in the existing `RateLimitCounter` table: `INSERT ... ON CONFLICT ("key") DO NOTHING RETURNING "id"` with key `nonce:v2:<company>:<nonce>`, expiry = signing time + 180 s (always longer than the accepted window), purged by the existing cron. Atomic across concurrent requests, instances and restarts; **no migration, no schema change**. Only authentic, in-window, correctly bound requests reach the store (garbage cannot fill it). If the store is unreachable the request gets 503 (fail closed). Tests (CRM, 40 + 13 + the rewritten route tests, all passing): valid; modified body (including one byte of whitespace), method, path, company; missing company; wrong secret; altered signature; altered context; expired; future; empty/malformed nonce; unknown and v1 version; malformed/oversize context; missing secret; **reused nonce; concurrent submissions of one envelope (exactly one wins)**; the nonce is per company; refused requests consume no nonce; store outage; cross-route and cross-company substitution on the public routes; logs hold fixed tags only. Website tests: known-answer vector, length-prefix properties, binding of method/path/company/body, fresh nonce per call (2,000 unique), every attempt of a flight retry re-signed. **The real PostgreSQL unique-key race is BLOCKED / NOT RUN** (concurrency is tested against an in-memory stand-in with the same contract).

## 12. Idempotency and retry behaviour

`Idempotency-Key` (flight) and `submissionId` (contact) are unchanged. A retry is a **new** request: new timestamp, new nonce, same key, same body bytes, so it passes verification and the CRM answers `duplicate` instead of creating a second record (tested: 3 attempts = 3 nonces, 1 key, 1 body; stand-in CRM answers duplicate). A captured envelope re-sent is refused. Flight: up to 3 attempts for retryable failures only; a 401 (signature, key) is never retried; contact and newsletter: one attempt, the visitor's resend is safe through `submissionId`. A timeout leaves the outcome unknown by design and is reported as a generic failure, never as success.

## 13. Rate-limiting findings

* **Website** (first line): in-memory per trusted client key (contact 8 per 10 min, newsletter 6; per container, resets on restart, adequate for one container). Keyed on the trusted proxy IP, never a spoofable forwarded header (tests).
* **CRM**: the per-IP limiter on the public routes found no client IP for the website's server-to-server calls and let everything through. **Fixed**: after the signature is verified, the visitor IP inside it is the key for a per-visitor limit in a website-only bucket (`<ENDPOINT>:website`); unattributed traffic shares one bucket with 5x the allowance; 429 with `Retry-After`. A visitor cannot choose that key. No full IP appears in logs. The flight route keeps its per-credential budget. Real database behaviour of the counter: not run.
* **Authentication per route:** flight = bearer key + v2 signature; contact and newsletter (previously unauthenticated and abusable, e.g. enrolling arbitrary addresses) = v2 signature, required as soon as the CRM has the secret. If any other client posts to `/api/public/subscribe` unsigned, it will be refused once the secret is set (no other caller exists in either repository).

## 14. Privacy and consent corrections

Done: **internal Privacy Policy pointer** under the contact form's button ("See our Privacy Policy for how we handle your information"; link `/privacy-policy`; no checkbox; no consent, SMS or marketing wording; tested). The Privacy Policy sentence for the contact form's IP/location (previous pass) is unchanged. The quote-button notice keeps its conservative text. **Not done, by design:** no SMS, "phone-exclusive deals" or consent wording was added: there is no SMS provider, no recorded consent, and the CRM has automated e-mail sequences and campaigns (documented in `WEBSITE_PRIVACY_TERMS_AND_CONSENT_REVIEW.md`). The newsletter call now also carries the visitor IP inside the signature so the CRM can rate-limit per visitor; the CRM stores no subscriber IP, but its counters hold the IP for the length of the window: **counsel should know** (added to the legal questions). Cookie behaviour re-verified: no cookies set by the application or by live responses; one `localStorage` key; no analytics. **Attorney review of the Privacy Policy, Cookie Policy, Terms and the quote wording is still required.**

## 15. No other company's name or link remains

Searched the whole website tree (source, tests, public files, scripts, deploy files, documentation; the unpublished untracked archive folders were not part of the search): **0 occurrences** of the other company's name or domain. The guard test no longer names it: it asserts that every link mentioning privacy is exactly `/privacy-policy` on all 11 sampled pages and that **no external privacy link exists** (tests pass at four viewports). The link never existed in the website source or history (previous pass); it was only in the proposed disclaimer text.

## 16 to 20. Docker build, container startup, environment injection, static assets, API routes, health checks

**BLOCKED / NOT RUN: Docker is not installed on this machine** (no Docker, no WSL distribution, no Podman). Nothing below may be reported as passed: image build, container start, runtime variable injection inside a container, static assets and API routes served from the container, container DNS, Docker health status, file permissions as the container user, graceful stop, restart policy, memory behaviour, secrets in image layers. **Prepared and statically tested instead:** `deploy/rehearsal/run.sh` (about 30 checks over an isolated project: build, health, DNS, reachability, database isolation, aliases, tunnel origin, published ports, uid, read-only files, start command, injected variables, image history/env secret scan, 15 routes and assets, signed request accepted and replay refused, restart, graceful stop timing, website-only rollback with the CRM stand-in and database untouched). Equivalent checks that **were** run without Docker: standalone production server started by the Infrastructure suite with explicit environment (routes, server actions, assets, health, CRM failure modes, body limit, rate limits, 182 passed); `next build` standalone exit 0; static compose/Dockerfile assertions (health check calls the app's own `/api/health` and never the CRM; port 3000; `USER node`; `CMD ["node","server.js"]`; no secret `ARG`/`ENV`; hardening flags; 1 GB limit).

## 21. SEO improvements and audit results

Used the installed `claude-seo:seo-technical` skill (its scripts refuse localhost, so its checklist was applied with a local crawl of the production build; no installs, no external fetches). Baseline preserved: **218 routes crawled, 0 failures, sitemap 218 unique URLs on the canonical host** (before and after).

| Check | Result (local production build) |
|---|---|
| robots.txt, sitemap, canonical (self-referencing, canonical host), noindex | pass; 0 accidental noindex; 404 returns 404 with a titled page; retired URLs and trailing-slash URLs redirect once (308) |
| Titles / descriptions | 0 duplicate titles, 0 duplicate descriptions, all present; 1 title (home) is 68 characters (informational) |
| Open Graph / Twitter metadata, viewport, one h1 per page | present on all 218 |
| HTML size | largest page about 1.09 MB (< 2 MB Googlebot limit), primary content server-rendered (home: about 1,700 words in the raw HTML) |
| Structured data | valid JSON-LD everywhere; shared `@id` graph; **BreadcrumbList added to the 9 top-level and legal pages that lacked it: now present on all 217 non-home pages (was 208)**; no invented ratings, reviews, prices or credentials |
| Images | alt text present; `fill`-mode images have no width/height attributes by design (absolutely positioned in sized containers, no layout shift) |
| Security headers | CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy present (previous pass); `X-Powered-By` off |
| Not measured | real Core Web Vitals, Lighthouse/PageSpeed, Search Console, rankings: **no claim is made** |

Not changed (decisions, not defects): a WebPage node per page (broad change, no verified benefit), IndexNow.

## 22. Accessibility and mobile regression results

Final run against the rebuilt production server on port 3101: **Desktop Chrome + Mobile 320/375/390: 1512 passed, 0 failed, 8 skipped** (viewport-conditional by design). Earlier in the pass the same suites showed 12 failures that asserted v1 behaviour (three tests times four viewports); they were updated for v2 and re-verified. **Tablet (768 x 1024), run through a temporary config that was removed afterwards: 171 passed, 1 failed, 2 skipped.** The failure (`accessibility.spec.ts`, call-button test) is a test assumption, not a defect: at 1024 px height the flight form's submit button is inside the first screen (measured: top 883 px), so the floating call pill steps aside by design. Axe, keyboard, focus, calendar and form specs pass at every viewport. No screen-reader session and no visual review by eye were done.

## 23. Public GitHub security findings

Re-run against the current remote (64 commits, 5 branches unchanged): no credential, no personal e-mail address; one routable address (the VPS) in one historical commit on four branches (not `main`), removed from the current files only; other hits are test fixtures. GitHub security alerts are unreadable without authentication. No history rewrite, no push. Details: `WEBSITE_PUBLIC_REPOSITORY_SECURITY_REVIEW.md`.

## 24. Website backup procedure

Runbook step 1: `docker inspect` of the live container (private, mode 600), the exact image id, a named permanent tag `business-flights-web:rollback-<date>`, copies of the old `compose.yaml`, the whole old checkout and the old `.env` (private, never committed or copied off the server), the Compose project listing. Not executed.

## 25. CRM database backup procedure

Runbook step 2: the CRM's own `deploy/backup-db.sh` (`pg_dump --format=custom`, excludes retained security codes, refuses an unreadable dump, optional `age` encryption, prunes after `KEEP_DAYS`), integrity check by `deploy/restore-db.sh <file>` in its default test mode (throw-away database, row counts, then dropped; the live database untouched); `--replace` is explicitly forbidden for this deployment. **No backup or restore was run.** A website-only deployment needs no migration; signing v2 needs none.

## 26. Existing image preservation and rollback rehearsal

Preservation: `deploy.sh` tags the running healthy image `business-flights-web:previous`; the runbook adds a named `rollback-<date>` tag and a saved image id. **Important finding:** rolling the website back to the **old database-backed release needs the OLD compose file and `.env` values** (the new compose forwards no `DATABASE_URL`); `rollback.sh` revives only a previous *new* release. The runbook therefore keeps the old checkout and gives the exact old-compose command. **Local rehearsal NOT RUN** (Docker); the rehearsal script includes a website-only rollback and checks the CRM stand-in and database are untouched. The rollback script's logic was exercised against a fake docker in `deploy-scripts.spec.ts`.

## 27. Proposed website-only production deployment commands

See `WEBSITE_VPS_DEPLOYMENT_AND_ROLLBACK_RUNBOOK.md` (every production-affecting command is marked **[APPROVAL]**). In short: read-only inspection; backups; preflight (`PREFLIGHT_ALLOW_LEGACY_DATABASE_VARS=yes deploy/preflight.sh` while legacy `DATABASE_*` remain); CRM updated **first** (v2 verifier, `LEAD_INGEST_SECRET`), recreating only the CRM app and the connector via an additive override; then `deploy/deploy.sh` for `bft-web` only (`compose up -d --no-deps bft-web`, never a whole-stack operation, never `down`/`prune`/volumes/migrations); `deploy/verify.sh`; rollback by old compose (back to the old release) or `deploy/rollback.sh previous` (to a previous new release).

## 28. Post-deployment CRM endpoint verification checklist (explicitly deferred, not a current blocker)

1. From the live site: one fake flight request, one fake contact message, one fake newsletter sign-up (clearly labelled).
2. In the CRM: each exactly once, right company; IP/location present only if the secret is set; a double click produced one record; no `[website-signature] refused:` lines for these; no `[submitFlightRequest]`/`[submitContactMessage]` CRM-refusal lines on the website.
3. Authentication proof: the flight request succeeded with the bearer key **and** a verified v2 signature (a wrong key or signature is refused, see the local tests).
4. Have the CRM owner delete the three test records. 5. Check clocks (NTP) if any request is refused as expired/future. 6. DNS/TLS/headers, then Search Console (sitemap, indexing, canonical, structured data, Core Web Vitals). **Do not claim the live CRM authenticates until this is done.**

## 29. Test results (this pass; the earlier numbers are historical)

| Check | Result |
|---|---|
| Website `tsc --noEmit`, `eslint src tests scripts deploy` | clean (exit 0) |
| Website production build (`NEXT_OUTPUT=standalone`) | exit 0 (second build this pass, after the breadcrumb change; line endings of seven files were then normalised to LF, no logic change) |
| `scripts/validate-seo.mjs` live crawl | 218 routes, 0 failures |
| Website browser projects (Desktop, 320, 375, 390) | **1512 passed, 0 failed, 8 skipped** |
| Tablet 768 x 1024 (temporary config) | 171 passed, 1 failed (test assumption, see 22), 2 skipped |
| Website Infrastructure suite (stand-in CRM, standalone server, deploy scripts, topology, signing) | **182 passed, 0 failed, 6 skipped** (the 6 are the opt-in live-CRM contract tests: **NOT RUN**) |
| CRM `tsc --noEmit`, `eslint src` | clean |
| CRM full unit suite (`vitest run src`) | **4490 passed, 2 failed, 1089 skipped** (database-gated) on the first full run; the 2 failures (a card-number hygiene guard tripped by a fixture, and the body-reader test that did not expect the new `raw` field) were fixed and re-run green (28 tests across those files). A final complete CRM run was not repeated after the fixes |
| New CRM signing tests | 40 (verifier/guard) + 13 (routes) + flight route 44 (incl. 18 signing cases), all pass |
| Docker image build / container start / rehearsal | **BLOCKED / NOT RUN** (Docker unavailable) |
| PostgreSQL-backed tests (nonce race, idempotency locks, counters) | **BLOCKED / NOT RUN** (no approved disposable database) |
| Live CRM authentication / real submission | **NOT RUN, by instruction** (post-deployment) |
| Lighthouse / Core Web Vitals / performance (startup time, memory, response times) | **NOT MEASURED** |

## 30. Remaining limitations, blockers, approvals

1. **Docker**: run `deploy/rehearsal/run.sh` on a machine with Docker; the release is not "ready for production" until it prints ALL CHECKS PASSED (this is the blocker for the stronger decision).
2. **Live deployment branch, CRM version, networks, `.env`**: unverifiable from here; step 0 of the runbook reads them read-only. The documented single-network layout fails the preflight; **choose Path 1 or 2 (approval)**.
3. **CRM must be updated before the website** (v2). A deployed CRM from the updated source with the secret set refuses unsigned requests; anything that posts unsigned to the three routes (none known) would break.
4. **Rollback to the old release needs the old compose and `.env`**; keep the old checkout (runbook).
5. **Legal**: counsel for Privacy, Cookie, Terms and the quote wording; decide whether `LEAD_INGEST_SECRET` is enabled before or after (it turns on IP/location capture for flight and contact, and the newsletter's rate-limit IP). Recommended: after.
6. **Clock sync** between the two servers (120 s / 30 s window).
7. Real PostgreSQL nonce/idempotency behaviour is untested; the CRM's pool maximum of 2 connections (reported by the live health output) is a capacity point to remember.
8. The server address remains in published Git history and on the published review branch; the cleaned documentation is uncommitted.
9. The in-memory website rate limiter is per container; the CRM limiter now keys on the signed visitor IP.
10. `docs/workspace-archive` and `docs/brand-assets` stay untracked and unpublished (one archive file contains a personal address).

## 31. Recommended commit sequence (nothing was committed; each step needs your approval)

Website, on the existing review branch (never `main`, never forced): (1) `feat(signing): v2 request signature, per-attempt signing, newsletter signed`; (2) `feat(seo,privacy): breadcrumb structured data on top-level pages; contact form privacy pointer`; (3) `chore(deploy): docker rehearsal kit, topology tests, preflight messages`; (4) `docs: runbook, final readiness report, env and API docs, address removed from DEPLOYMENT_VPS.md`; (5) `test: v2 coverage and updated expectations`. CRM, on its own branch in its own repository (not this one): (A) `feat(website-api): signing v2 verifier, one-time nonce, guard`; (B) `feat(website-api): per-visitor rate limit for signed website traffic; raw body reader`; (C) `test: v2 and updated route tests`; (D) `docs: WEBSITE_LEAD_API v2, .env.example`. Review each diff first; the CRM repository must not be pushed as part of the website's release.


---

## Correction (fourth pass, 2026-11-16)

* Section "Rate limiting" above (and the summary in section 1): the **flight route did not have a per-visitor limit** at the CRM; only the contact and newsletter routes did. This is now fixed in the CRM source (uncommitted, not deployed) - see `WEBSITE_LOCATION_AUTOFILL_VALIDATION_AND_IP_CAPTURE_VERIFICATION.md`, section 18.
* The browser may now ask for the device's location, only on a visitor's click: the `Permissions-Policy` header changed from `geolocation=()` to `geolocation=(self)` (the page itself only). Every other feature in that header is still denied. See the same document.
