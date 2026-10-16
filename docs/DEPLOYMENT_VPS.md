# Deploying the website on the OVHcloud VPS (Docker + Cloudflare Tunnel)

Branch `feature/vps-website`. **Nothing here has been deployed, and no production system was contacted** (no VPS, no CRM, no
production database, no Cloudflare, no DNS). Every step that changes the server, the tunnel, DNS or the database is an **owner action**;
no script in `deploy/` performs any of them.

**Status: UNVERIFIED for first deployment.** The code, the database role, the scripts' logic and the standalone server were tested (section 12).
The Docker image build, `docker compose` itself and the real Docker network were **not** — Docker was not available. Treat the first deployment
as unproven until section 8.6 passes.

## 1. Architecture (facts reported from the VPS on 2026-10-16, not re-checked by this branch)

| Item | Value |
|---|---|
| Host | OVH VPS, Ubuntu 26.04.1, `51.161.102.115`; public ports 80/443 closed |
| CRM Compose project | `compass-tools`, `/home/ubuntu/apps/Compass-Tools/compose.yaml` |
| Containers | `compass-tools-app-1` (bound to `127.0.0.1:3000`), `compass-tools-db-1` (PostgreSQL 17, healthy, no host port), `compass-tools-cloudflared-1` |
| Network | one private network, `compass-tools_internal`, shared by all three |
| Tunnel | remotely managed; effective ingress: `compass-tools.com` → `http://app:3000`, then a catch-all HTTP 404 |
| Resources | ~82 GB disk, ~10.4 GB available memory |

```
visitor ──HTTPS──▶ Cloudflare ──tunnel (outbound from the VPS)──▶ cloudflared ──▶ http://app:3000      (CRM, compass-tools.com — unchanged)
                                                                                └─▶ http://bft-web:3000  (this website — owner adds the routes)
website container ──compass-tools_internal──▶ db:5432
website container ──own project network──▶ outbound only: Gmail SMTP, images.unsplash.com
```

- **Own Compose project** `business-flights-travel`, one service `bft-web`. It does not define, start, stop or recreate PostgreSQL, the CRM or
  the connector. Every script passes `-p business-flights-travel` and names only `bft-web`.
- **Unique name on a shared network.** The service is `bft-web`, not `web`, because Docker adds the service name as a DNS alias on every
  network it joins, and a flat network answers a name from *every* container that carries it. `bft-web` must never be renamed to `app`, `db`,
  `web` or `cloudflared`. `deploy/preflight.sh` refuses to deploy if any other container already answers to `bft-web`. No `container_name:` is set.
- **No published port** (`ports:` is absent; `deploy/preflight.sh` and `deploy/verify.sh` both fail if one appears). No volume: the site stores no files.
- **Image**: `node:24.21.0-bookworm-slim` pinned by digest, multi-stage, Next `standalone` output, non-root `node` user, root-owned application files
  (only `.next/cache` is writable), `HEALTHCHECK` on `/api/health` (no database access), `no-new-privileges`, all capabilities dropped,
  memory/CPU/PID limits, log rotation, `restart: unless-stopped`.

## 2. Files in this branch and why

| File | Why |
|---|---|
| `Dockerfile`, `.dockerignore`, `.gitattributes` | production image; context excludes `.env`, keys, tests, docs; shell scripts keep LF endings |
| `compose.yaml`, `.env.vps.example` | the website's own project, one external network, no ports, hardening; placeholders only |
| `next.config.ts` | `output: "standalone"` only when `NEXT_OUTPUT=standalone`; **apex → `www` 308 redirect** (section 9) |
| `src/app/api/health/route.ts`, `scripts/healthcheck.mjs`, `src/app/robots.ts` | liveness probe that never touches the database; `/api/` disallowed |
| `src/lib/db-tls.ts` (+ `prisma.ts`, `schema-ready.ts`) | TLS policy; URL `ssl*` parameters removed (section 7.3) |
| `src/lib/prisma.ts` | **one client per process in production** (section 7.5) — a pre-existing defect that matters on a long-lived server |
| `src/server/lead-distribution.ts` | `FOR UPDATE OF lqe SKIP LOCKED` (section 7.4) |
| `src/server/save-submission-info.ts` | a concurrent duplicate save is success, not an error |
| `src/lib/ip-geo.ts`, `src/lib/submission-info.ts` | Cloudflare visitor location (section 10) |
| `deploy/*.sh`, `deploy/verify-responses.mjs` | preflight / deploy / verify / rollback, scoped to this project |
| `deploy/sql/website-runtime-role-grants.sql`, `deploy/sql/verify-website-runtime-role.sql` | the least-privilege role and a read-only report of what it can do |
| `scripts/verify-runtime-role*.ts`, `scripts/prepare-self-hosted-e2e-db.ts`, `tests/*` | proofs, section 12 |
| `playwright.config.ts`, `package.json` | database/infrastructure specs run once in their own project (section 12.3); `test:infra`, `test:ui` scripts |

`scripts/vercel-build.mjs` (the old Vercel build, which can run schema DDL) is not used by the image and was not touched.

## 3. Assumptions and compatibility risks

1. **Node.** The image pins `node:24.21.0-bookworm-slim@sha256:d6aa754f…ec7f87b20`. The CRM's Dockerfile on its `feature/website-lead-api` and
   `feature/local-upload-storage` branches pins the **identical** reference (compared by reading both files; the other local CRM branches contain no
   Dockerfile). Whether the **running** `compass-tools-app-1` image was built from that file is **not verified**; the owner can check with
   `docker exec compass-tools-app-1 node --version`. Requirements: Next 16.3.1 `>=20.9`, Prisma 7.10 `^20.19 || ^22.12 || >=24`, sharp 0.35 `>=20.9`,
   pg `>=16` — all satisfied by 24.21. Developed/tested locally on Node 24.19.
2. **Native dependencies.** `package-lock.json` (generated on Windows) contains the glibc Linux packages (`@img/sharp-linux-x64`, `@img/sharp-libvips-linux-x64`,
   `@next/swc-linux-x64-gnu`), so `npm ci` on Debian bookworm resolves them; the runner additionally copies the complete `@img` platform packages from the deps stage.
   Prisma 7 with `@prisma/adapter-pg` needs no native query engine. **Not verified by an actual image build.**
3. The CRM network is named `compass-tools_internal` (reported). Confirm with `docker network ls`; override with `CRM_NETWORK_NAME`.
4. **The database location is undecided** (D1): the CRM's PostgreSQL runs on the VPS as `db` (PostgreSQL 17); this branch does not assume the CRM's live data
   has finished moving there, and no production database was contacted. The website's schema is a copy of the CRM's; the schema guard is read-only in this
   deployment and logs (does not apply) bundled migrations the database has not recorded.
5. The notification email uses Gmail SMTP with an app password and needs outbound access from the VPS; `next/image` needs `images.unsplash.com`.
6. The shared network is **flat**: the website container can reach the CRM app and `db`, and they can reach it. The database role (7.2) is the real boundary,
   not the network.

## 4. Networking: joining `compass-tools_internal` safely

Separate Compose projects do not share networks. The website declares the CRM project's network as **external**, so Compose attaches to it and
never creates or removes it; if the name is wrong, `up` fails ("network … declared as external, but could not be found") instead of silently creating
an empty network. The website joins with the alias `bft-web`; nothing about `compass-tools-*` is redefined, restarted or recreated.

Read-only checks the owner runs first (also performed by `deploy/preflight.sh`):

```bash
docker compose ls                                                              # the real CRM project name: expect compass-tools
docker network ls --format '{{.Name}}' | grep -x compass-tools_internal        # the real network name
docker network inspect compass-tools_internal --format '{{range .Containers}}{{.Name}} {{end}}'      # app, db, cloudflared (and later the website)
docker inspect compass-tools-db-1 --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}: {{range $v.Aliases}}{{.}} {{end}}{{end}}'   # alias "db"
docker port compass-tools-db-1                                                  # must print nothing
```

Behaviour to know: (a) the website container is attached by Compose at creation, so it survives its own restarts and the CRM's; (b) if someone runs
`docker compose down` in the **CRM** project while the website is up, Docker cannot remove the shared network ("resource is still in use") — a warning,
not an outage; (c) `docker compose down` is never used by any website script.

Verification that Docker DNS does what this document claims (service DNS names, aliases, `bft-web` reachable from `cloudflared`) **could not be run here**; it is
step 8.6 below, run by the owner after deploying and before adding any tunnel route.

## 5. Cloudflare Tunnel: owner-controlled routes

The tunnel receives its ingress remotely; editing the CRM's Compose file changes nothing about routes. This branch does not edit tunnel configuration, never
reads, prints or rotates the tunnel token, and invents no tunnel ID. After the website is running and healthy (section 8):

1. Cloudflare dashboard → Zero Trust → Networks → Tunnels → the existing tunnel → **Published application routes** (Public hostname).
2. **Add** two routes, nothing else: `businessflights.travel` → service type **HTTP**, URL `bft-web:3000`; and `www.businessflights.travel` → HTTP, `bft-web:3000`.
   Do not edit, reorder or delete the `compass-tools.com` route or the final catch-all 404; do not use a wildcard hostname. The CRM is therefore unreachable
   from these hostnames by construction: routing is by hostname and each route has its own target.
3. A route needs no conflicting DNS record for the same name. Check first (section 11). Adding a route in the dashboard creates the proxied CNAME to the tunnel itself.
4. Verify (section 8.6) that `https://www.businessflights.travel/api/health` answers exactly `{"status":"ok"}` and that `https://compass-tools.com/` still answers as before.

`businessflights.travel` (apex) is routed to the website too and answered by the application with a **308 to `https://www.businessflights.travel`** (section 9).

## 6. Environment variables (names only; values are the owner's, in a `chmod 600` `.env` beside `compose.yaml`)

| Variable | Required | Placeholder / meaning |
|---|---|---|
| `DATABASE_URL` | yes | `postgresql://<runtime_role>:<url_encoded_password>@db:5432/<database_name>` |
| `DATABASE_SSL_MODE` | no (compose default `disable`) | only `disable`, only for host `db`/localhost, only for an owner-approved private Docker-network connection (7.3) |
| `DATABASE_SSL_CA` / `DATABASE_SSL_VERIFY` | no | verified TLS for a remote database; conflicts with `disable` (refused) |
| `GMAIL_SENDER_EMAIL` | yes | `<the-single-gmail-address@example.com>` |
| `GMAIL_APP_PASSWORD` | yes | `<google-app-password>` |
| `CRM_NETWORK_NAME` | no | default `compass-tools_internal` |
| `APP_VERSION` | no | image tag; `deploy.sh` sets it to the git short SHA |

Fixed in `compose.yaml`, deliberately not configurable from `.env`: `TRUSTED_PROXY=cloudflare`, `DATABASE_AUTO_INIT=false`, `HOSTNAME`, `PORT`. No build argument or
build-time secret exists; nothing is read from the environment during `docker build`. No script prints secrets (`env_value` reads without echoing; failure
logs are filtered). Do not paste `docker compose config` output anywhere — it expands secrets.

## 7. Database

### 7.1 Where, which, who

Host `db` (the CRM's PostgreSQL 17 on `compass-tools_internal`), port 5432. The database **name** is the CRM's (read it as the owner; this branch never creates a database).
The website connects as its own role, `bft_web` — never the superuser, never the CRM's application role. **Decision D3**: the owner creates it and chooses its password.

### 7.2 Permissions (`deploy/sql/website-runtime-role-grants.sql`, owner-run only)

Nothing in this repository runs the file: no deploy script, no container start-up, no application code. It is idempotent (applying it twice was tested) and is applied in one
transaction by the owner (`psql "$OWNER_URL" -v ON_ERROR_STOP=1 -v role=bft_web -1 -f …`). The role is created separately with the idempotent `DO` block in the file's header
(`NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 8`; the application holds one pool of ≤ 5 plus a short-lived schema-guard connection).
If the CRM database has had `CONNECT` revoked from `PUBLIC`, the owner also grants `CONNECT`.

Effective privileges that must result (checked by `deploy/sql/verify-website-runtime-role.sql`, read-only; compare its output with this table, any extra line is a defect):

| Object | Privileges | Used for |
|---|---|---|
| `Company` | `SELECT ("id")` — column-level | companyId for every write |
| `Account` | `SELECT ("id", "role")` — column-level | the lead-queue join. **Not** readable: email, phone, `activeSessionId`, permissions, commission |
| `_prisma_migrations` | `SELECT` | read-only schema guard |
| `Contact`, `ContactEmail`, `ContactPhone`, `ContactInquiry`, `LeadStatusHistory`, `Activity`, `Notification` | `SELECT, INSERT` | contact de-duplication and creation, inquiries, history, activity, queue notification |
| `Lead`, `LeadSubmissionInfo`, `Airport`, `Subscriber` | `SELECT, INSERT, UPDATE` | lead + queue claim, IP/geo row, airport upserts, newsletter re-subscribe |
| `LeadQueueEntry` | `SELECT, UPDATE` | queue claim |
| sequence `Airport_id_seq` | `USAGE` | inserting a new airport |
| schema `public` | `USAGE` (no `CREATE`) | |
| database | `CONNECT, TEMPORARY` (inherited from `PUBLIC`; the website can create session-local temp tables only) | |

No `DELETE`, no `TRUNCATE`, no DDL, no grants, no payment/booking/audit/Gmail/quote/task/attachment tables (35 refusals tested on a real server). **Privilege decisions still needing owner
approval (D3):** table-level `SELECT` on `Contact*` (the form de-duplicates against existing customers, so the website reads customer names/emails/phones); `UPDATE` on `Lead`; the `TEMPORARY` default.

### 7.3 TLS

- Default, unchanged: encrypted but **not** identity-verified (Vercel/Aiven behaviour kept so existing setups do not break). `DATABASE_SSL_CA` or `DATABASE_SSL_VERIFY=system`: certificate **and host name** verified.
- `DATABASE_SSL_MODE=disable` is accepted only if the value is exactly `disable`; the host is exactly `db`, `localhost`, `127.0.0.1` or `::1`; the URL carries no `host=`/`hostaddr=` and no `ssl*`/`sslmode` parameter;
  and `DATABASE_SSL_CA`/`VERIFY` are unset. Anything else throws at start-up. Host spellings tested as refused: trailing dot, percent-encoded names, multi-host lists, `user@host` confusion, IPv4-mapped IPv6, short/decimal IPv4, socket paths, key/value strings, look-alike names.
  The tests compare the decision with what the real `pg` driver would connect to.
- `pg` lets connection-string parameters override explicit options (`?ssl=0` would silently replace a verified setup). Both connection paths therefore strip every `ssl*` URL parameter, so `src/lib/db-tls.ts` is the single source of truth.
  **Behaviour change:** a `DATABASE_URL` that carried e.g. `sslrootcert=` or `ssl=true` no longer has them honoured — use `DATABASE_SSL_CA`/`DATABASE_SSL_VERIFY`.
- **Security boundary:** disabling TLS is acceptable **only** for an explicitly approved connection over the private Docker network to the `db` container whose port is not published. It is a typo guard, not proof the network is private: a name on the allow-list resolves wherever Docker DNS says. It affects only the website's own connections; the CRM's TLS is unchanged.

### 7.4 Lead-queue claim (`FOR UPDATE OF lqe`)

A bare `FOR UPDATE` on `LeadQueueEntry JOIN Account` also row-locks the joined `Account` rows, which requires `UPDATE` on `Account` (and briefly blocked CRM account updates). The statement now locks only the queue entry — the only contended resource.
Tested on PostgreSQL 17.10 as the restricted role: 12 concurrent leads → 4/4/4 across the three eligible workers, exactly one assignment/notification/counter increment per lead; 10 claimers racing for one lead → exactly one winner; a locked entry is skipped in ~5 ms;
all eligible entries locked → bounded retries (~220 ms) then `no_active_workers` with the lead left for the CRM's own distributor; inactive and ticketing/flight-expert entries are never picked.

### 7.5 Connection budget (a defect fixed here)

`src/lib/prisma.ts` is a lazy proxy that calls `getPrismaClient()` on **every** property access, and it only remembered the client outside production. In a production server each `prisma.<model>` access therefore built a new client
and pool; the self-hosted end-to-end test exhausted a role's connection limit within two form submissions. It now keeps one client per process everywhere. The real-server test fails (connection limit) if this is reverted. This also protects the CRM, which shares the server's `max_connections`.

### 7.6 Migrations and compatibility

Places schema-creating statements can run: `scripts/vercel-build.mjs` (Vercel only; not in the image); the schema guard only when `DATABASE_AUTO_INIT` is exactly `"true"` — compose pins `"false"`, and the role could not execute DDL anyway.
No deploy or start-up script migrates, initializes or repairs anything; tested statically and the self-hosted run created no objects. **Owner-controlled procedure:** the CRM project applies migrations with its owner role. Before a CRM migration that touches a table in the 7.2 table, update the website's `prisma/schema.prisma` copy and generated client, run
`npm run test:infra` against a disposable PostgreSQL 17, deploy the website first for additive changes ("expand"), and only then "contract" (drop/rename). After every CRM migration run `verify-website-runtime-role.sql`. A table, column or sequence added later is **not** visible to the role automatically (no `ALTER DEFAULT PRIVILEGES`, by design):
new columns on table-granted tables just work; new columns on `Account`/`Company`, new tables and new sequences need a reviewed grant line — a new sequence on a granted table fails loudly (`permission denied for sequence`), which is the intended signal.

## 8. Runbook

### 8.1 Preflight (read-only, nothing changes)

```bash
git fetch origin && git switch feature/vps-website      # the owner-approved, clean commit
deploy/preflight.sh
```

Checks Docker/Compose, `.env` present, mode `600`, required variables present (values never shown); the rendered config has no ports and exactly one service; the external network exists; one container on it answers to `db`; **no other container answers to `bft-web`**; PostgreSQL publishes no host port;
the connector is attached; free disk/memory; the current website container. A failed check names the fix.

### 8.2 Owner approval and configuration (before anything is built)

Owner confirms in writing: D1–D8 below; the `.env` values; that no website command will be run against a database that has not been backed up. Owner creates the `bft_web` role and applies the grants (7.2) — **this is never done by a script here**. Copy `.env.vps.example` to `.env`, `chmod 600 .env`.

### 8.3 Backup and recovery readiness (owner; before the first deploy and before any CRM migration)

The website has no volume and no uploads, so there is nothing to back up for it besides `.env` (keep it in the password manager). Uploads belong to the CRM and are covered by the CRM's own backup. Database:

```bash
umask 077
docker exec compass-tools-db-1 sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > "$HOME/backups/crm-$(date +%F-%H%M).dump"   # to a file, never the terminal
pg_restore --list "$HOME/backups/crm-"*.dump | wc -l                                                                               # prints only a count
```

(credentials come from the container's own environment, not from the command line; the dump contains customer data — keep it outside the repository, mode 600, and copy it off the VPS.) Prove recoverability once by restoring into a **disposable** database/container, never over the live one.
Do not proceed without a verified backup.

### 8.4 Image build

Part of `deploy/deploy.sh`: `docker compose -p business-flights-travel build bft-web` for the checked-out clean commit. No secret is used or baked in; a failed build leaves the running website container untouched (tested with a stub).

### 8.5 Website-only deployment

```bash
deploy/deploy.sh      # preflight → refuses a dirty tree → records the other containers' ids and start times → tags the running image as :previous
                      # → build bft-web → up -d --no-deps bft-web → waits for "healthy" → verify.sh → confirms the CRM, db and tunnel containers are unchanged
```

It runs no SQL and no migration. If the container is unhealthy it prints a (credential-filtered) log tail and the rollback command. Nothing it issues is `down`, `rm`, `stop`, `restart`, `volume` or `prune` (the dry-run test asserts this over every command).

### 8.6 Health and functional verification

`deploy/verify.sh` (also run by deploy): container running and healthy, no host ports, non-root, then from inside the container on loopback: `/api/health` 200 + `no-store`, home 200 with an `<h1>`, `robots.txt` naming the sitemap, `sitemap.xml` with > 100 URLs, two unknown URLs returning a real **404**, `/flights?to=GRU` canonical `/flights`.
Then owner-run, **before adding tunnel routes**, proving the Docker-network facts this branch could not test:

```bash
docker exec compass-tools-cloudflared-1 wget -qO- http://bft-web:3000/api/health 2>/dev/null || echo "wget not in the image: use the connector's own diagnostics or a temporary curl container on compass-tools_internal"
docker exec business-flights-travel-bft-web-1 getent hosts db bft-web                                                             # both names must resolve, db to the PostgreSQL container's address only
```

After the routes exist (section 5): `curl -sI https://www.businessflights.travel/`, `curl -s https://www.businessflights.travel/api/health`, `curl -sI https://businessflights.travel/` (308 → www), a 404 URL, and `curl -sI https://compass-tools.com/` unchanged.
Then submit **one real test flight request and one contact message** from a browser and confirm in the CRM: the lead, its IP/location, queue assignment and the notification email. This is the only proof that the role, queue and email work together in production.

### 8.7 Rollback

```bash
deploy/rollback.sh previous        # or: deploy/rollback.sh <git short sha>
```

Recreates only `bft-web` from an already-built image with `--no-build` and verifies the CRM containers were not touched. It deletes no image, volume or data and has no database component. If routing is the problem, remove the two published routes in Cloudflare (owner) — the CRM is unaffected.
A failed health check, build error or rollback attempt only ever acts on `bft-web`; the CRM, `db` and `cloudflared` are never targeted.

## 9. Canonical host and apex

The site declares `https://www.businessflights.travel` as canonical. `next.config.ts` redirects only the exact host `businessflights.travel` (anchored, dot escaped) to `https://www.businessflights.travel/<same path>` with **308**, query string preserved; `www`, `localhost`, `bft-web:3000` and look-alikes
(`xbusinessflights.travel`, `businessflights.travel.evil.example`, `evil-businessflights.travel`) are not redirected, so there is no loop (verified against the standalone server). The apex must reach the application (route in section 5), because the redirect is application-side. `/api/health` on the apex is redirected too; probes use the internal name.

## 10. Visitor IP and location

- `TRUSTED_PROXY=cloudflare` (fixed in compose) reads **only** `CF-Connecting-IP`; `X-Forwarded-For`, `X-Real-IP`, `Forwarded` and Vercel headers are ignored. This is safe only because the origin is reachable only through the tunnel (no published port) — otherwise any client could forge the header.
  Cloudflare overwrites `CF-Connecting-IP` on every proxied request. Anything else on the shared network (the CRM app, a compromised container) could forge it; that is the residual risk of the flat network.
  Tested end to end: with Cloudflare headers plus a forged `X-Forwarded-For`/`X-Real-IP`/`X-Vercel-Forwarded-For`, the stored IP is the Cloudflare one; with only forged headers, no IP is stored and the lead is still saved and assigned.
- **Location is optional, untrusted, approximate metadata.** `CF-IPCountry` is always present when Cloudflare proxies (`XX` and `T1` are not countries and are dropped). City/region/timezone arrive only if the owner enables **Rules → Managed Transforms → "Add visitor location headers"** (decision D7); without it only the country is stored. Missing headers are normal: an IP with no location, or a lead with neither, is stored without error (tested).
- **Privacy:** the full IP address and approximate location are personal data (UK/EU GDPR and similar). They are stored in `LeadSubmissionInfo` (plaintext, readable in the CRM by permission), per lead. The owner must: mention this collection in the privacy policy, define a retention period and a deletion path, and decide whether the CRM shows the IP unmasked (D7).
- **Not verified in production:** that Cloudflare strips a forged client `CF-Connecting-IP` (documented behaviour; check with `curl -H 'CF-Connecting-IP: 203.0.113.9' https://www.businessflights.travel/…` and compare the stored IP to your own).

## 11. DNS and email (owner-controlled; nothing here changes them)

No MX, SPF, DKIM, DMARC, A, AAAA or CNAME value is invented in this repository. Evidence needed to recover the original configuration: a Cloudflare zone export (DNS → Records → Export) and the nameservers actually set at the registrar (the earlier outage showed NXDOMAIN for `www`); full headers of a recent email to/from the domain
(`Received`, `Return-Path`, `Authentication-Results`, `DKIM-Signature d=/s=`) identifying the provider and selector; the mail provider's admin console (it lists the exact records it expects); any previous DNS export/backup; third-party DNS history only as a cross-check.
The website's own notification mail uses Gmail SMTP (`GMAIL_SENDER_EMAIL`); if that is a plain Gmail address it does not depend on the domain's MX/SPF/DKIM, but mail to `@businessflights.travel` does. Before adding the tunnel routes, confirm no existing A/AAAA/CNAME for those two names conflicts.

## 12. What was and was not tested

All commands were run from the repository root; results are from this machine (Windows 11, Node 24.19, 12 cores, 7.7 GB RAM).

### 12.1 Verified

- `npx tsc --noEmit` and `npx eslint .`: clean. `npx prisma validate`, plain `npm run build` and `NEXT_OUTPUT=standalone npm run build`: see 12.4.
- **Real PostgreSQL server: PostgreSQL 17.10** (`embedded-postgres@17.10.0-beta.17`, a disposable loopback-only server; no Docker): `INTEGRATION_ADMIN_DATABASE_URL=postgresql://postgres@127.0.0.1:54331/postgres npx playwright test tests/runtime-role-pg-e2e.spec.ts`
  (`scripts/verify-runtime-role-pg.ts`): schema built from the 55 bundled migrations by a non-superuser owner; the grants file applied twice; the effective-privilege report equals section 7.2 exactly; as the restricted role over TCP with the website's real code (real TLS resolver with `localhost` + `disable`, real Prisma client, real schema guard): 10 concurrent identical contacts → one contact;
  20 concurrent identical lead submissions → 1 created, 19 duplicates, 0 errors, one lead/history/activity row; 5 concurrent submission-info saves → one row; 12 concurrent queue claims, 10 racers for one lead, skipped and fully locked queue rows (7.4); the application holds one pool (≤ 5 connections); 35 forbidden operations refused; future-migration behaviour (7.6).
  It found three real defects, all fixed: the `FOR UPDATE` privilege issue (7.4), the concurrent submission-info `P2002`, and (via the self-hosted run) the per-access Prisma pool (7.5).
- In-process PostgreSQL (PGlite, **not** a real server): `tests/runtime-role-e2e.spec.ts` — the same write paths and 16 refusals, kept as a fast check.
- **Standalone server, container-like layout, real PostgreSQL 17.10** (`tests/self-hosted-e2e.spec.ts`): no `.env`, no source files; health probe exits 0; apex redirect and look-alike hosts; three real browser form submissions with Cloudflare headers → lead saved, queued, notified, IP/location stored; forged forwarding headers ignored; no geo handled; the running server created no schema objects and logged no credentials.
- `tests/db-tls-driver.spec.ts` (7) and `tests/vps-deployment.spec.ts`: TLS policy compared with the real `pg` parser, Cloudflare IP/geo, static properties of Dockerfile/compose/scripts/grants.
- `tests/deploy-scripts.spec.ts` (13): the real `deploy/*.sh` under bash with a **stub `docker`**: preflight refusals (alias collision, missing network/db alias, published port, missing `.env`), deploy success/failure paths, CRM-fingerprint check, rollback, and an allow-list over every docker command issued. Proves the scripts' logic only, not Docker's behaviour.
- Shell syntax (`bash -n`), LF endings and executable bits (`100755`) of the four runnable scripts.

### 12.2 Not verified (could not be)

`docker build` (so: the Dockerfile as a whole, `npm ci` on Linux, non-root file permissions, the HEALTHCHECK inside the image), `docker compose config`/`up`, the real Docker network and DNS (`db`, `bft-web`), the live `compass-tools_internal` network, whether `compass-tools_internal` has outbound internet (the website uses its own network for egress), the CRM database and its TLS, the VPS, Cloudflare Tunnel routing, `CF-Connecting-IP` behaviour in production, Gmail delivery, DNS.
**Compose configuration was not validated with the Compose CLI**; only static checks on the YAML were made.

### 12.3 Worker crashes in the earlier full run

The earlier full run (3 workers, 4 viewport projects) reported 1335 passed / 4 skipped / 1 flaky / 4 failed, all four being `worker process exited unexpectedly` (exit code 2147483651 = 0x80000003, a fatal abort) in specs that start an in-memory PostgreSQL. Investigation: the same specs pass serially (172/172) and also at 3 workers (176/176) when run on their own; each instance needs 150–200 MB; this machine had ~1.4 GB free; and those specs ran four times, once per viewport project, next to Chromium and a Next server.
This is consistent with memory exhaustion, not a logic defect, but it is **not proven** (no crash dump was captured). Mitigation in this branch: these specs now live in one `Infrastructure` project that runs once, after the browser projects, and `npm run test:infra` runs it with one worker. Results of the final runs are in 12.4.

### 12.4 Final validation results

- `npx tsc --noEmit`, `npx eslint .`, `npx prisma validate` (schema unchanged): clean. Plain `npm run build` and `NEXT_OUTPUT=standalone npm run build`: succeed.
- `npm run test:infra` (Infrastructure project, 1 worker, real PostgreSQL 17.10 available): **93 passed, 0 failed**, 178 s. Free memory dipped to 461 MB of 7.7 GB even serially (sampled every 2 s), which supports the memory-pressure explanation in 12.3.
- Browser projects (4 viewport projects, `--workers=2`, plain production build under `next start -p 3200`, 208 s): **1080 passed, 4 skipped, 0 failed, 0 flaky, no worker crashes.** Sampled free memory reached 0 MB at some sample (possibly a sampling artifact, not investigated) — memory is tight on this machine, so 2 workers is the recommended setting here.
- Not re-run in this final form: the earlier 3-worker, 4-project single run (1335 passed / 4 crashes); the current split (93 + 1080 + 4 skipped) replaces it.
- Docker, Compose CLI and the VPS: not available, not tested (12.2).

## 13. Outstanding owner decisions and blockers

- **D1** Database location: is the live CRM database now the `db` container (PostgreSQL 17), with all data moved? Not assumed. A remote database needs `DATABASE_SSL_CA`, no `compass-tools_internal` dependency, and a small compose edit.
- **D2** Accept joining the CRM's shared, flat network (this branch's design, per the reported topology), or have the CRM project add a dedicated network for the website (a change in the CRM repository).
- **D3** Create `bft_web` and approve the privileges in 7.2 (table-level `SELECT` on customer contact tables, `UPDATE` on `Lead`, default `TEMPORARY`); choose the password; confirm which role owns CRM migrations.
- **D4** Who coordinates CRM migrations with website releases (7.6), and who re-runs the verification report afterwards.
- **D5** Canonical host `www` (as declared) and routes for both hostnames (section 5).
- **D6** Which provider handled `@businessflights.travel` mail, and the evidence to restore its DNS records (section 11).
- **D7** Enable Cloudflare "Add visitor location headers"; privacy-policy wording and retention for IP/location; whether the CRM shows the IP unmasked.
- **D8** The CRM's authenticated lead API (separate task, awaiting the contract): this branch writes leads directly to the database, exactly as the Vercel deployment did.
- **Blockers for a safe first deployment:** Docker image/Compose/network behaviour unverified (12.2); a verified database backup and restore test (8.3); D1 and D3; the owner-run Docker-network checks (8.6); DNS/mail evidence (11).

## 14. Updating the base image

Pinned by version and digest. To update: pick a new patch release of the same major, read its digest from Docker Hub, change `NODE_IMAGE` in a reviewed commit (keep it equal to the CRM's pin), rebuild, run `npm run test:infra`, then `deploy/deploy.sh`. A rebuild without a change does not pick up OS security updates; schedule a periodic review.
