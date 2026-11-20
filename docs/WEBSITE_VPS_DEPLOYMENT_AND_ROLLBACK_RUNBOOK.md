# VPS deployment and rollback runbook (website release candidate)

Status: **prepared, not executed.** Nothing in this document has been run against the VPS, and every command marked **[APPROVAL]** must only be run after explicit written approval. Commands marked **[READ-ONLY]** change nothing. This repository is public: **no address, host name of the server, credential or secret is written here**; angle-bracket placeholders are filled in by the owner on the server.

Facts this runbook relies on (verified in the repositories; the **live** values are NOT VERIFIED and are re-read in step 0):

| Item | Value |
|---|---|
| Website Compose project / service / container | `business-flights-travel` / `bft-web` / `business-flights-travel-bft-web-1` (same in the original and the updated release, so the update replaces the running website in place) |
| Website image | `business-flights-web:<tag>` (deploy.sh tags the previous healthy image `business-flights-web:previous`) |
| Internal port, published ports | 3000, **none** |
| Tunnel origin (Cloudflare dashboard, owner-managed) | `http://bft-web:3000` (alias `bft-web` on the tunnel network); keep exactly this |
| Health check | `node scripts/healthcheck.mjs` -> `GET /api/health` inside the container (liveness; does not call the CRM) |
| CRM service name for the website | `http://compass-crm:3000` (alias `compass-crm` on the CRM's internal API network `compass-tools-website-api`) |
| Volumes | none |
| Restart policy | `unless-stopped` |
| Website needs a database migration | **No.** The website has no database. No CRM migration is part of this deployment (signing v2 needs none) |

## Why the order matters (read before anything else)

1. The live **CRM is older than the updated source** and does not know signing v2. The updated website signs every request with v2, so **the CRM must be updated first** and have `LEAD_INGEST_SECRET` set; otherwise (secret unset on the CRM) it accepts unsigned requests but records no visitor IP, and (an old CRM with the secret set) it ignores `v:2` and trusts nothing.
2. The live **website is the old, database-backed release**. It keeps working against the database until it is replaced, so the CRM update must not break its network path (see "Network" below: use the additive path).
3. **Rollback of the website to the old release needs the OLD compose file and the OLD `.env` values**, not the new `compose.yaml`: the old image needs `DATABASE_URL` and the old network, which the new compose does not pass. Keep a copy of the old release's checkout (step 1) before anything changes.

## Network: two paths (the owner chooses; both are production changes)

The updated website joins two **external** networks: `compass-tools-website-api` (internal; the CRM answers there as `compass-crm`) and `compass-tools_web` (the network `cloudflared` is on). The updated CRM's own `compose.yaml` already defines them (`website_api` with alias `compass-crm`, and `web`). The live stack was last reported with **one** network `compass-tools_internal` carrying the CRM app, PostgreSQL and `cloudflared`: the website must **not** join a network that carries PostgreSQL (the preflight refuses it).

* **Path 1: adopt the release layout** (recreate the CRM stack from the updated CRM `compose.yaml`). Cleanest end state; the old website loses its route to PostgreSQL the moment the CRM layout changes, so it needs a maintenance window, and rolling back means restoring the old CRM compose as well.
* **Path 2 (recommended): additive override, nothing existing is removed.** A small override file for the CRM's **live** Compose project adds the two networks and attaches only the CRM app and the tunnel connector to them. PostgreSQL is not touched and is on neither new network, and the old website keeps working on `compass-tools_internal` until it is replaced, which makes rollback trivial. Example (adjust service names to the live file; **[APPROVAL]** to apply):

```yaml
# compose.bft-override.yaml  (CRM project; used together with the live compose file: docker compose -f <live compose> -f compose.bft-override.yaml ...)
services:
  app:                       # the live CRM app service
    networks:
      bft_crm_api:
        aliases: [compass-crm]
  cloudflared:               # the live tunnel connector service
    networks: [bft_tunnel]
networks:
  bft_crm_api: { name: compass-tools-website-api, internal: true }
  bft_tunnel:  { name: compass-tools_web }
```

Applying it recreates the CRM app and the tunnel connector containers (a short interruption of both). PostgreSQL is not named in the command and is not recreated.

## 0. Read-only inspection of the live state  [READ-ONLY]

```bash
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
docker network ls
docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}: {{range $v.Aliases}}{{.}} {{end}}{{"\n"}}{{end}}' <crm-app-container> <cloudflared-container> business-flights-travel-bft-web-1
docker inspect -f '{{.Config.Image}} {{.Image}}' business-flights-travel-bft-web-1
docker image ls business-flights-web --format '{{.Tag}} {{.ID}} {{.CreatedSince}}'
git -C <website checkout> rev-parse --short HEAD && git -C <website checkout> branch --show-current      # which branch/commit is live
```
Record: the deployed branch and commit (**this answers the open "live deployment branch" question**), the CRM image/commit, the real network and alias names, the names (never values) of the variables in the website `.env` and the CRM `.env`.

## 1. Website backup and image preservation  [APPROVAL to run on the VPS; non-destructive]

```bash
cd <website checkout>                                    # the CURRENT live checkout; do not change branch
mkdir -p ~/bft-backups/$(date -u +%Y%m%dT%H%M%SZ) && cd ~/bft-backups/<that folder>
docker inspect business-flights-travel-bft-web-1 > container-inspect.json       # full container configuration (contains env VALUES: keep private, mode 600)
chmod 600 container-inspect.json
docker inspect -f '{{.Image}}' business-flights-travel-bft-web-1 > image-id.txt # the exact image id (digest-addressable)
docker tag $(cat image-id.txt) business-flights-web:rollback-$(date -u +%Y%m%d)   # a NAMED, permanent tag: the old release can be started from it
cp <website checkout>/compose.yaml compose.old.yaml
cp -a <website checkout> ../website-checkout-old                                  # source of the live release (the old compose, scripts and docs)
cp <website checkout>/.env env.old && chmod 600 env.old                           # PRIVATE: holds secrets; never copy it off the server, never commit it
docker compose -p business-flights-travel ls; docker compose -p business-flights-travel ps
```

## 2. CRM database backup  [APPROVAL; read-only on the database, writes a file]

The CRM's own script (`deploy/backup-db.sh` in the CRM checkout) does a `pg_dump --format=custom` of the production database, **excludes the retained security-code table by design**, refuses to keep an unreadable dump, optionally encrypts with `age`, and prunes backups older than `KEEP_DAYS` (default 14).

```bash
cd <crm checkout on the VPS>
BACKUP_DIR=/var/backups/compass-tools KEEP_DAYS=14 BACKUP_AGE_RECIPIENT=<age public key, if used> bash deploy/backup-db.sh
ls -l /var/backups/compass-tools | tail -n 3          # the new file, mode 600
```
**Verify integrity** (harmless: restores into a throw-away database next to the live one, prints row counts, drops it; the live database and the site are not touched):
```bash
bash deploy/restore-db.sh /var/backups/compass-tools/compass-<timestamp>.dump           # default mode is the TEST restore
```
**Never** run `--replace` as part of this deployment: it stops the site and drops the live database. A website-only deployment needs no restore and no migration. Copy the dump off the server only encrypted.

## 3. Pre-flight  [READ-ONLY]

```bash
cd <website checkout at the release commit>            # NOT the old live checkout; see step 4
# only if the live .env still holds the previous release's DATABASE_* (it almost certainly does, for the rollback window):
PREFLIGHT_ALLOW_LEGACY_DATABASE_VARS=yes deploy/preflight.sh
# otherwise:
deploy/preflight.sh
```
It checks Docker, the `.env` file mode, required variables (names only), `CRM_API_KEY` and `LEAD_INGEST_SECRET` length, that no `DATABASE_*` is set (unless the explicit opt-in), that the rendered compose publishes no port and defines exactly one service, that both external networks exist, that **a container answers to `CRM_API_URL`'s host on the API network**, that **no database container (by alias or by image) shares either network**, and that nothing else answers to `bft-web`. **A failure is the answer: do not work around it.**

## 4. Prepare the release checkout  [APPROVAL: pulls source onto the VPS]

Put the reviewed release commit in a **new** directory (do not overwrite the live checkout; it is the rollback source):
```bash
git clone --branch <review-or-release-branch> --single-branch <repository URL> <new dir>      # or: git -C <new dir> fetch && git -C <new dir> checkout <commit>
cp <old checkout>/.env <new dir>/.env && chmod 600 <new dir>/.env
# add, by hand, the NEW variable NAMES to <new dir>/.env (values from the password manager; never typed into a shell history): CRM_API_KEY, CRM_COMPANY_ID, LEAD_INGEST_SECRET
```
`.env` keeps `DATABASE_*` for the rollback window; the new compose does not forward them to the container.

## 5. Update the CRM  [APPROVAL: production change, brief CRM interruption]

1. Build/obtain the CRM image from the updated CRM source (the commit that contains `website-request-signature.ts`).
2. Set `LEAD_INGEST_SECRET` in the **CRM** `.env` (same value as the website's will be). **From this moment the CRM refuses unsigned website requests** (the old website does not call these routes, so nothing live breaks). Set it only after the privacy wording decision (see the report).
3. Apply Path 2 (or Path 1) from the "Network" section, recreating **only** the CRM app and the connector:
```bash
cd <crm checkout>
docker compose -f <live compose> -f compose.bft-override.yaml up -d --no-deps app cloudflared      # NEVER a bare `up -d`, never `down`
docker inspect -f '{{.State.Status}}' <postgres container>   # must still be the same running container (check its StartedAt did not change)
```
4. **[READ-ONLY]** CRM health: `curl -s http://localhost:<crm port>/api/health` from the server (or from a container on the CRM network); expect ok.

## 6. Deploy the website (website service only)  [APPROVAL: production change]

```bash
cd <new dir>
PREFLIGHT_ALLOW_LEGACY_DATABASE_VARS=yes deploy/deploy.sh     # drop the variable if the legacy DATABASE_* were removed from .env
```
`deploy.sh` runs the preflight, refuses a dirty tree, **tags the currently running healthy image as `business-flights-web:previous`**, builds the new image (`APP_VERSION=<sha>`), starts **only** `bft-web` (`compose up -d --no-deps bft-web`), waits for the health check, runs `deploy/verify.sh` (container running, healthy, no host port, non-root, route responses from inside) and checks that no other container on the shared networks changed. It never runs `down`, `prune`, volume commands or migrations.

## 7. Post-deployment verification  [READ-ONLY unless stated]

1. `deploy/verify.sh`; `docker logs --tail 100 business-flights-travel-bft-web-1` (look for `[crm-api]` configuration warnings; no secret is ever logged).
2. Public checks (anonymous GET): home, `/flights`, `/contact`, `/privacy-policy`, `/robots.txt`, `/sitemap.xml`, `/api/health`; new telephone/e-mail/address visible; `X-Powered-By` absent; HSTS and CSP present.
3. DNS and TLS: `www.businessflights.travel` and `businessflights.travel` resolve to Cloudflare, certificate valid, apex redirects (308) to `www`.
4. **CRM endpoint verification (explicitly planned for after deployment):** with a clearly fake submission, one flight request, one contact message and one newsletter sign-up through the real site; confirm in the CRM (Admin) that each arrived exactly once with the right company, that the visitor IP/location appears only if `LEAD_INGEST_SECRET` is set, that a duplicate click did not create a second record, and that the CRM log shows no `[website-signature] refused:` lines for these. Then have the CRM owner delete the three test records. This is the first moment authentication with the live CRM is actually exercised.
5. Failure drill (optional, with approval): briefly stop the CRM app container and confirm the website shows the generic error and keeps serving pages; start it again.
6. Search: see "Search Console checklist" in the final report.

## 8. Rollback  [APPROVAL]

**Website only (the CRM and PostgreSQL untouched) back to the previous release.** Because the old image needs the old compose and `.env` values:
```bash
cd ~/bft-backups/<folder>/../website-checkout-old        # the copy taken in step 1
docker compose -p business-flights-travel -f compose.yaml up -d --no-deps --no-build bft-web      # old compose, old image tag it references; requires the old network to exist (Path 2 leaves it untouched)
docker image ls business-flights-web                                # the old tag is the one kept in step 1 (business-flights-web:rollback-<date>)
docker inspect -f '{{.State.Health.Status}}' business-flights-travel-bft-web-1                      # healthy
```
If the old compose references a tag that no longer exists locally, set `APP_VERSION` to the preserved tag or tag the saved image id: `docker tag $(cat ~/bft-backups/<folder>/image-id.txt) business-flights-web:<tag the old compose expects>`.

**Rolling back to the previous NEW release** (a later release that failed) uses the website's own script: `deploy/rollback.sh previous` (or `deploy/rollback.sh <git short sha>`), which recreates only `bft-web` from a kept image and re-runs `verify.sh`. It cannot revive the old database-backed release (different compose).

**CRM side:** if only the CRM update must be undone, remove the override (`up -d --no-deps app cloudflared` with the live compose file only) and unset the CRM's `LEAD_INGEST_SECRET`; the CRM then accepts unsigned requests again and records no visitor IP. The CRM database is not changed by any step here, so no restore is needed; `restore-db.sh --replace` is a last resort for data loss only and is outside this runbook.

## 9. Things that must NOT be done

`docker compose down` (any project), `docker system prune`, `docker volume rm`, a bare `docker compose up -d` in the CRM project, `restore-db.sh --replace`, `prisma migrate` of any kind, editing the Cloudflare Tunnel's published route (it stays `http://bft-web:3000`), publishing a host port, putting a `DATABASE_*` value into the new container's environment, committing or pasting `.env` content anywhere, deleting `business-flights-web:previous` or the `rollback-<date>` tag before the rollback window has passed.

## 10. Local rehearsal (before the real thing, on any machine that has Docker)

`bash deploy/rehearsal/run.sh` builds the image, starts a mock CRM, a throw-away PostgreSQL and a tunnel stand-in on **isolated** networks, and checks DNS, reachability, database isolation, health, the tunnel origin, assets, restart, graceful stop, secrets in image layers, signing v2 acceptance and replay refusal, and a website-only rollback (CRM and database untouched). **It has not been run yet** (Docker is not installed on the machine this release was prepared on); a recorded "ALL CHECKS PASSED" from it is a prerequisite for calling the release ready.


---

## Additional post-deployment checks (fourth pass: form suggestions, validation, 11-month limit)

Each is read-only or uses a visit/submission the operator makes on purpose; none needs the production database.

1. `curl -s -H 'Accept: application/json' https://<site>/api/visitor-hint` from a normal connection: expect HTTP 200, `Cache-Control: private, no-store`, a JSON object with a `countryCode` and (if the Managed Transform is on) an `airport`; **no IP address, city or coordinates** in the body.
2. `curl -sI https://<site>/flights`: the `Permissions-Policy` header must contain `geolocation=(self)` and still deny `camera`, `microphone`, `payment`, `usb`.
3. In a browser: open `/flights`; the departure field should be suggested (labelled "Suggested") and the phone country code pre-selected; change both by hand and confirm the change is kept. "Use my location" must ask the browser for permission **only when clicked**.
4. The calendars must stop 11 calendar months after today; a flight request for a day beyond it must be refused with "Flights can be requested up to 11 months ahead."
5. After the CRM is redeployed with the flight-route limiter: nothing to do for a normal visitor; an operator can confirm the code `rate_limited` only by exceeding 20 requests in 15 minutes from one signed visitor, which should NOT be tried against production.


---

## SEO release additions (2026-11-20)

Read-only checks after deployment (full list and the Search Console checklist: `SEO_TECHNICAL_VERIFICATION.md`, `PRODUCTION_REDEPLOYMENT_READINESS.md`):

1. `curl -sI https://www.businessflights.travel/terms` -> `308` with `location: /terms-of-service`; the same for `/blog/sleep-better-on-overnight-business-class-flights` and `/blog/best-airport-lounges-around-the-world`.
2. `curl -s https://www.businessflights.travel/robots.txt` contains `Disallow: /api/` and `Disallow: /cdn-cgi/` and the sitemap line.
3. `curl -s https://www.businessflights.travel/sitemap.xml` lists **223** URLs, including `/destinations/europe`, `/asia`, `/africa`, `/middle-east`, `/oceania`, and no `?to=` URL.
4. `/destinations/europe` is 200 with a self-canonical; `/destinations/north-america` is a real 404.
5. `/offers` and `/blog/emirates-business-class-guide` are real 404s (not redirects).
6. A destination such as `/destinations/europe/germany/munich` shows "From MUC Into the City" with its sources and check date.

Not part of the container and needing your approval: the Cloudflare changes listed in `PRODUCTION_REDEPLOYMENT_READINESS.md` section 7 (one-hop apex redirect, Email Address Obfuscation off, visitor location headers on).


---

## Release candidate addendum (2026-11-20, continuation task)

Prepared, not executed. Read together with the sections above; where they differ, this addendum is newer.

### A. What is being released

Branch `review/website-parity-and-contact-ip-2026-11-15` (no merge to `main`, no auto-deploy: **no CI/CD workflow exists**, a push deploys nothing). New since the last runbook revision: `next` / `eslint-config-next` **16.4.6** (the Next.js advisories are closed, `npm audit` reports 0), HSTS reduced to `max-age=63072000` (no `includeSubDomains`, no `preload`), no browser storage for a refused location prompt, region hub pages, redirects, content, `security-headers.spec.ts`. Details: `SECURITY_REVIEW_AND_REMAINING_LIMITATIONS.md`, `PRODUCTION_REDEPLOYMENT_READINESS.md`.

### B. Reproducible local verification before anyone deploys (any machine with Node 20+, no secrets needed)

```bash
git clone --branch review/website-parity-and-contact-ip-2026-11-15 --single-branch <repository URL> bft-release && cd bft-release
npm ci                                   # exact lockfile; install scripts are limited to the two documented packages
npm audit                                # expect: found 0 vulnerabilities
npx tsc --noEmit && npx eslint .
NEXT_OUTPUT=standalone npm run build     # the same build the Docker image performs
node scripts/validate-seo.mjs            # needs the built site on the port it prints; expect "0 failure(s)"
npx playwright test --project="Desktop Chrome" --project="Mobile 320" --project="Mobile 375" --project="Mobile 390"
npx playwright test --project=Infrastructure --no-deps --workers=1
```
The commit under test is the one `git rev-parse --short HEAD` prints; `deploy/deploy.sh` stamps the image with that short sha (`APP_VERSION`), so the running container can always be tied to a commit.

### C. Order of operations (summary; the numbered sections above give the commands)

1. Read-only inspection of the live state (section 0) and the three backups (sections 1-2).
2. Deploy the CRM **first** (signing v2 verifier, per-visitor flight limiter, `LEAD_INGEST_SECRET` set), confirm its health and that PostgreSQL did not restart.
3. Preflight, then `deploy/deploy.sh` (website only; refuses a dirty tree; tags `:previous` from a healthy container; waits for health; runs `verify.sh`).
4. Cloudflare changes (section E) **after** the origin is healthy, one at a time, each verified before the next.
5. Public smoke tests and the one approved CRM test submission (sections 7 and F).
6. Search Console steps in `SEO_TECHNICAL_VERIFICATION.md`.
Rollback at any point: section 8.

### D. Environment variable names (values only on the server, never in Git)

Website container: `CRM_API_URL`, `CRM_API_KEY`, `CRM_COMPANY_ID`, `LEAD_INGEST_SECRET` (>= 32 characters, identical on the CRM), `GMAIL_SENDER_EMAIL` and the Gmail app password variable named in `.env.vps.example`; `TRUSTED_PROXY=cloudflare` is fixed by `compose.yaml`; `NODE_ENV=production`, `PORT=3000`, `HOSTNAME=0.0.0.0` and `APP_VERSION` are set by the image/script. No `DATABASE_*` variable is read by the website. `deploy/preflight.sh` validates the set and refuses a mismatch without printing a value.

### E. Cloudflare: exact instructions and verification (nothing was changed; do each only with your approval)

Menu names follow the current dashboard and may sit under slightly different headings in your account; the intent of each step is what matters.

**E1. One-hop apex redirect (today: Cloudflare 301 to the www host, then the app's 308 to the same URL, two hops).**
1. DNS: the apex record must be proxied (orange cloud) so the rule can act on it.
2. Rules -> Redirect Rules -> Create rule. Name: `apex to www`. When: *Hostname equals* `businessflights.travel`. Then: *Dynamic* redirect, expression `concat("https://www.businessflights.travel", http.request.uri.path)`, **Preserve query string: on**, status **301**.
3. Verify (read-only):
```bash
curl -sI "https://businessflights.travel/flights?to=LHR"            # expect: one hop, 301, location: https://www.businessflights.travel/flights?to=LHR
curl -sIL "https://businessflights.travel/flights?to=LHR" | grep -ciE "^HTTP/"    # expect 2 status lines (301, then 200), not 3
curl -sI "https://www.businessflights.travel/flights" | head -1                    # 200
```
The app's own apex rule (`next.config.ts`) stays as a harmless fallback; it simply stops being reached.
4. Rollback: disable or delete the rule; the app rule resumes the old two-hop behaviour.

**E2. Email Address Obfuscation (analysis: `SECURITY_REVIEW_AND_REMAINING_LIMITATIONS.md`, section 9; switching it off is optional).**
If you decide to switch it off: Scrape Shield -> Email Address Obfuscation -> off. Verify: `curl -s https://www.businessflights.travel/contact | grep -c "email-protection"` returns `0` and the page shows a plain `mailto:` link (Cloudflare may cache HTML briefly; purge the page cache or wait if the old markup persists). Search Console may keep listing `/cdn-cgi/l/email-protection` for a while; `robots.txt` already disallows `/cdn-cgi/`. If you decide to keep it on: do nothing and ignore that URL in the report. Do not turn off any other Scrape Shield feature as part of this.

**E3. "Add visitor location headers" (needed for the nearest-airport suggestion; the country-code suggestion and the phone prefix only need the free `CF-IPCountry` header).**
1. Rules -> Managed Transforms -> **Add visitor location headers**: on. This adds the location request headers the website reads server-side (`cf-iplatitude`, `cf-iplongitude`, `cf-ipcity`, `cf-region`, `cf-region-code`, `cf-timezone`); coordinates are only used on the server to choose an airport and are **never** returned to the browser.
2. Verify from a normal connection (no secrets): `curl -s -H "Accept: application/json" https://www.businessflights.travel/api/visitor-hint` -> HTTP 200, `Cache-Control: private, no-store`, body contains `countryCode` and (once the transform is on) `airport`, and **no** IP, city or coordinates. Check from two different networks if you can: the answers must differ, proving the response is not cached across visitors.
3. Caching: make sure no Cache Rule or Page Rule caches `/api/visitor-hint` (the response is `private, no-store`; Cloudflare honours that by default).
4. Rollback: switch the transform off; the site then suggests the country only and the departure field stays empty.

### F. Post-deployment live CRM verification (procedure only; it creates real records, so it needs your explicit approval and the CRM owner's help)

1. Choose a clearly fake identity (name `Release Test - do not call`, an address you own, a number you own) and a date inside the 11-month window.
2. Submit **one** flight request through the real form. Expect: success screen; in the CRM exactly one lead for the right company; masked visitor IP and approximate location; the internal notification e-mail once; in the website log a line stating the request was signed (v2) and **no** `[crm-api]` misconfiguration warning; in the CRM log no `[website-signature] refused:` line for it.
3. Press submit again on the unchanged form: expect the duplicate path (same lead, no second record).
4. Submit one contact message and one newsletter sign-up with the same fake identity; expect one record each.
5. Ask the CRM owner to delete the three test records. Do **not** probe the rate limit (it takes 20 requests in 15 minutes from one visitor) and do **not** stop the CRM to test outages in production.

### G. CRM API contract the website relies on (from the source; the CRM was not modified)

| | Flight request | Contact | Newsletter |
|---|---|---|---|
| Endpoint | `POST /api/v1/website/flight-inquiries` | `POST /api/public/contact-inquiry` | `POST /api/public/subscribe` |
| Auth | `Authorization: Bearer <CRM_API_KEY>` and the company id; `Idempotency-Key: <submission id>` (required) | company id in the body/envelope | company id in the body/envelope |
| Signature | **v2** on all three: headers `x-ct-visitor-context` (base64url JSON `{v:2, ts, nonce, ip?, city?, region?, country?, timezone?, source?}`) and `x-ct-visitor-signature` = hex HMAC-SHA256 with `LEAD_INGEST_SECRET` over a length-prefixed message of method, path, company id, timestamp, nonce, SHA-256 of the exact body bytes and the context header | same | same |
| Freshness | the CRM accepts a timestamp at most **120 s** old and **30 s** in the future; each nonce is accepted **once**; a nonce-store failure answers 503 (never "accept") | same | same |
| Visitor rate limit | CRM-side shared limit on this route: **20 requests per 15 minutes per signed visitor**, answered with 429 and `Retry-After` | website-side limiter only | website-side limiter only |
| Website timeout | **10 s** per attempt | 10 s, one attempt | 10 s, one attempt |
| Website retries | up to **3 attempts** on network error, timeout, 429, 500, 502, 503, 504, **same Idempotency-Key and body, a freshly signed envelope each time**, `Retry-After` honoured but capped at 5 s | none | none |
| Responses and the website's handling | 201 created / 200 duplicate -> success; 401 or 404 -> "misconfigured" (no retry, generic message, operator log names the variables to check); 403 and other 4xx -> "rejected" (no retry, generic message); 409 for a different request under a used key; 429/5xx/timeout -> retried, then a friendly "please try again" | as the website's action wraps it | as the website's action wraps it |
| Never | an unsigned fallback, a v1 envelope, forwarding visitor `cf-*` headers, the secret in a header or log | | |

### H. Health, logs and failure behaviour

Liveness: `GET /api/health` (no CRM call, no detail); the container health check calls it from inside. Logs go to stdout as fixed tags and codes (`[crm-api] ...`, `[flight-request-notification] ...`); no secret, IP or form content is logged (tested). Server-rendered error pages show fixed text, never a stack trace. A SIGTERM is handled by Next's standalone server (graceful stop is checked by the rehearsal, which has not run). The forms keep what the visitor typed on any failure and reuse the submission id on the next press.

### I. Rollback (unchanged, restated)

Website-only: `deploy/rollback.sh previous` for a failed new release; the old database-backed release needs its own compose and `.env` (section 8). CRM: remove the override and unset `LEAD_INGEST_SECRET`. Cloudflare: undo each change in reverse order (E3, E2, E1).
