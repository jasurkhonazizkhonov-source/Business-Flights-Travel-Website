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

**Checks that must pass BEFORE the routes are enabled** (each is an owner action; the branch changes none of them):
1. The website container is healthy and `verify.sh` passes; the owner-run network checks in 8.6 pass (`cloudflared` resolves and reaches `bft-web:3000`).
2. A verified backup set exists (8.3) and the D1/D3/D9 decisions are recorded.
3. The current tunnel configuration is captured first (dashboard → the tunnel → Configure → screenshot/export of the published routes and the catch-all) so the exact previous state can be restored. Do not touch, display or rotate the tunnel token.
4. The DNS zone export is saved and no existing A/AAAA/CNAME conflicts with the two names (section 11). Mail records (MX/SPF/DKIM/DMARC) are not edited in this step.
5. The canonical host is confirmed (D5). After enabling: request both hostnames and a 404 URL, confirm the apex answers 308 to `www`, and confirm `https://compass-tools.com/` behaves exactly as before.

`businessflights.travel` (apex) is routed to the website too and answered by the application with a **308 to `https://www.businessflights.travel`** (section 9).

## 6. Environment variables (names only; values are the owner's, in a `chmod 600` `.env` beside `compose.yaml`)

| Variable | Required | Placeholder / meaning |
|---|---|---|
| `DATABASE_URL` | yes | `postgresql://<runtime_role>:<url_encoded_password>@db:5432/<database_name>` |
| `DATABASE_SSL_CA` | **one of the three TLS rows is required** (preflight refuses otherwise) | PREFERRED: PEM of the CA that signed the PostgreSQL server certificate (newlines may be written `\n`); chain and name verified (7.3) |
| `DATABASE_SSL_VERIFY` | see above | `system`: verify against the system trust store (publicly trusted CA only) |
| `DATABASE_SSL_MODE` | see above — **no default** | EXCEPTION only: exactly `disable`, only for host `db`/localhost, only as a recorded owner approval of plaintext on the private Docker network (7.3); conflicts with the two rows above (refused) |
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

Nothing in this repository runs the file: no deploy script, no container start-up, no application code. It is idempotent (applying it twice was tested on a real server) and runs in one transaction.

**Exact proposed procedure — owner-run, NOT executed by this branch, never against the live database before the backup in 8.3 is verified.** Review the SQL first: `deploy/sql/website-runtime-role-grants.sql` (grants) and `deploy/sql/verify-website-runtime-role.sql` (read-only report).

```bash
# 1. As the PostgreSQL superuser/owner, create the login role if it does not exist (idempotent; the password is yours — generate it, never commit it):
docker exec -i compass-tools-db-1 sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bft_web') THEN
    CREATE ROLE bft_web LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 8;
  END IF;
END $$;
SQL
# 2. Set the password without putting it in shell history or a process list (interactive prompt):
docker exec -it compass-tools-db-1 sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'     # then:  \password bft_web
# 3. Apply the reviewed grants in one transaction (the file is read from this checkout on the VPS):
docker exec -i compass-tools-db-1 sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -v role=bft_web -1' < deploy/sql/website-runtime-role-grants.sql
# 4. Read-only verification: the output must equal the table below exactly (an extra row is a defect):
docker exec -i compass-tools-db-1 sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -v role=bft_web' < deploy/sql/verify-website-runtime-role.sql
```

If the CRM database has had `CONNECT` revoked from `PUBLIC`, the owner also runs `GRANT CONNECT ON DATABASE <name> TO bft_web;`. The application holds one pool of ≤ 5 connections plus a short-lived schema-guard connection; the CRM's PostgreSQL is sized with `max_connections=40` in the CRM's Compose file, so keep the role limit at 8.
**SQL that must be reviewed before approval:** every statement of the grants file (14 `GRANT`/`REVOKE` statements); in particular the `Contact*`/`Lead` read access and the four column-level `UPDATE` lists below. Removing the role again: `DROP OWNED BY bft_web; DROP ROLE bft_web;` (owner-run; `DROP OWNED` revokes everything granted to it, touches no table data).

Effective privileges that must result (the table is the expected output of the verification report; it is asserted on PostgreSQL 17.10 by `scripts/verify-runtime-role-pg.ts`):

| Object | Privileges | Used for |
|---|---|---|
| `Company` | `SELECT ("id")` — column-level | companyId for every write |
| `Account` | `SELECT ("id", "role")` — column-level | the lead-queue join. **Not** readable: email, phone, `activeSessionId`, permissions, commission |
| `_prisma_migrations` | `SELECT` | read-only schema guard |
| `Contact`, `ContactEmail`, `ContactPhone`, `ContactInquiry`, `LeadStatusHistory`, `Activity`, `Notification`, `Lead`, `LeadSubmissionInfo`, `Airport`, `Subscriber`, `LeadQueueEntry` | `SELECT` (+ `INSERT` on all but `LeadQueueEntry`) | reading back created rows, contact de-duplication, history, activity, notification, queue |
| `Lead` | `UPDATE ("assignedAgentId", "queueDistributedAt", "updatedAt")` | queue claim only |
| `LeadQueueEntry` | `UPDATE ("lastAssignedAt", "leadsAssignedCount", "updatedAt")` | queue claim only |
| `Subscriber` | `UPDATE ("status", "subscribedAt", "unsubscribedAt", "updatedAt")` | newsletter re-signup only |
| `Airport` | `UPDATE ("name", "city", "country")` | `submit-flight-request.ts` keeps existing airports in step with the site's canonical data |
| sequence `Airport_id_seq` | `USAGE` | inserting a new airport |
| schema `public` | `USAGE` (no `CREATE`) | |
| database | `CONNECT, TEMPORARY` (inherited from `PUBLIC`; session-local temp tables only) | |

No table-wide `UPDATE`, no `DELETE`, no `TRUNCATE`, no DDL, no grants, no payment/booking/audit/Gmail/quote/task/attachment tables (42 refusals tested on a real server, including rewriting a lead's status/notes/contact, a queue entry's owner, a subscriber's e-mail, an airport code or a lead's stored IP).
**Residual exposure needing owner approval (D3):** (a) the website can **read** whole `Contact`, `Lead` and related rows (de-duplication needs it); (b) it can insert rows and re-subscribe an existing subscriber; (c) `Airport` name/city/country are overwritten on each submission by the site's data — a design choice inherited from the Vercel deployment that the CRM owner may prefer to drop;
(d) the default `TEMPORARY` privilege. Narrowing (a) needs code changes (`select` lists) and, long term, the CRM-API integration.

### 7.3 TLS: verified is the target; plaintext is a recorded exception

- **Preferred and recommended: verified TLS** — `DATABASE_SSL_CA` (the CA that signed the PostgreSQL server certificate) or `DATABASE_SSL_VERIFY=system`. The certificate chain **and name** are checked, and the name check is bound to the host in `DATABASE_URL`, including IP-literal hosts
  (without that binding the `pg` driver checks an IP-literal connection against the name "localhost": reproduced against a real server and fixed). Tested end to end on PostgreSQL 17 with TLS: right CA connects (server confirms an encrypted session); wrong CA, a name the certificate is not valid for, and every URL-parameter downgrade attempt are refused.
- **The default is not acceptable for this deployment.** With nothing set the code keeps the historical behaviour (encrypted, server **not** verified; Vercel/Aiven setups depend on it). On the VPS the compose file therefore has **no default** and `deploy/preflight.sh` refuses to continue unless `.env` makes one explicit choice.
- **What the CRM actually does on the VPS (evidence).** Your note says the CRM uses verified PostgreSQL TLS. The CRM's own Compose file (branches `feature/website-lead-api` and `feature/local-upload-storage`) connects to `db` with `DATABASE_SSL_MODE: disable` and its documentation says "the server in the container does not offer TLS" (reproduced there). If the live deployment differs, check on the VPS:
  `docker exec compass-tools-db-1 sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "show ssl; select ssl from pg_stat_ssl where pid = pg_backend_pid();"'` — `off` means the server cannot offer TLS and verified TLS needs a server certificate first.
- **Decision D9 (owner):** (1) enable TLS on the CRM's PostgreSQL (server certificate whose name includes `db`, `ssl=on`; a change in the CRM project) and give the website `DATABASE_SSL_CA` — recommended; or (2) record an explicit exception to run plaintext over the private Docker network with `DATABASE_SSL_MODE=disable`, as the CRM itself does today. Disabling TLS is never "to simplify deployment": it is acceptable only for that approved, private, no-published-port connection, and `preflight.sh` prints a warning every time.
- `DATABASE_SSL_MODE=disable` is accepted only if the value is exactly `disable`; the host is exactly `db`, `localhost`, `127.0.0.1` or `::1`; the URL carries no `host=`/`hostaddr=` and no `ssl*`/`sslmode` parameter; and `DATABASE_SSL_CA`/`VERIFY` are unset (conflicts are refused at start-up and in preflight). Host spellings tested as refused: trailing dot, percent-encoded names, multi-host lists, `user@host` confusion, IPv4-mapped IPv6, short/decimal IPv4, socket paths, key/value strings, look-alike names; the tests compare the decision with what the real `pg` parser connects to.
- `pg` lets connection-string parameters override explicit options (`?ssl=0` would silently replace a verified setup), so both connection paths strip every `ssl*` URL parameter and `src/lib/db-tls.ts` is the single source of truth. **Behaviour change:** a `DATABASE_URL` that carried e.g. `sslrootcert=` or `ssl=true` no longer has them honoured — use `DATABASE_SSL_CA`/`DATABASE_SSL_VERIFY`.
  Verified modes also refuse a `host=`/`hostaddr=` parameter (the verified name must be the connection target).
- It affects only the website's own connections; the CRM's TLS settings are unchanged and no production database TLS setting was touched.

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

### 8.3 Backup, verified recovery and failure handling (owner; before the first deploy and before any CRM migration)

**What there is to protect.** The website has no volume and stores no files: its only state is rows in the CRM database, plus its `.env` (keep that in the password manager, never in git). The **uploaded files belong to the CRM** (host directory `UPLOADS_HOST_DIR`, `/srv/compass-tools/uploads` in the CRM's Compose file — confirm the real path with
`docker inspect compass-tools-app-1 --format '{{json .Mounts}}'`, read-only). The website performs **no migration**, so "before migration" means before any CRM migration the CRM owner runs, and before the first website deploy. Nothing below is run by this branch.

**1. Create a dated backup set and record the times** (files are not transactional with the database, so the order and the times matter):

```bash
umask 077; B="$HOME/backups/$(date -u +%Y%m%dT%H%M%SZ)"; mkdir -p "$B"
echo "backup started (UTC): $(date -u +%FT%TZ)" >> "$B/MANIFEST.txt"
# 1a. DATABASE FIRST. pg_dump is a consistent snapshot of the moment it STARTS. Output goes to a file, never to the terminal.
echo "db dump start: $(date -u +%FT%TZ)" >> "$B/MANIFEST.txt"
docker exec compass-tools-db-1 sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > "$B/db.dump"
echo "db dump end:   $(date -u +%FT%TZ)" >> "$B/MANIFEST.txt"
# 1b. UPLOADED FILES SECOND (a separate archive). Every file the dump refers to still exists; a file added in between is simply not referenced.
echo "files tar start: $(date -u +%FT%TZ)" >> "$B/MANIFEST.txt"
tar -C "$(dirname /srv/compass-tools/uploads)" -czf "$B/uploads.tgz" "$(basename /srv/compass-tools/uploads)"
echo "files tar end:   $(date -u +%FT%TZ)" >> "$B/MANIFEST.txt"
( cd "$B" && sha256sum db.dump uploads.tgz >> MANIFEST.txt )
```

**Mapping between the two.** Restore the database from `db.dump` (state at *db dump start*) and the files from `uploads.tgz` (state at *files tar start…end*, always later). Files uploaded in that window are harmless orphans; a file deleted in that window is missing from the archive — the CRM's own `scripts/attachments-reconcile.ts` (read-only, in its `tools` service) lists both kinds. Copy the whole directory off the VPS (a second location) and re-check the checksums there.

**2. A dump that "succeeded" is not a verified backup. It is VERIFIED only when all of these pass, and the manifest says so:**

1. `sha256sum -c MANIFEST.txt` passes at the off-VPS copy; `db.dump` and `uploads.tgz` are non-empty; `pg_restore --list "$B/db.dump" | wc -l` (prints a count only) is plausible and `tar -tzf "$B/uploads.tgz" | wc -l` matches the live file count.
2. **Restore into a disposable database — never the live one.** A throw-away container with a random password, no published port, no network, no reused volume, removed afterwards (this removes only the container named here):
   ```bash
   docker run -d --name bft-restore-test --network none -e POSTGRES_PASSWORD="$(openssl rand -hex 16)" postgres:17
   docker cp "$B/db.dump" bft-restore-test:/tmp/db.dump
   docker exec bft-restore-test sh -c 'until pg_isready -q; do sleep 1; done; createdb -U postgres restoretest && pg_restore -U postgres -d restoretest --no-owner --exit-on-error /tmp/db.dump'
   docker exec bft-restore-test psql -U postgres -d restoretest -Atc 'select count(*) from "Lead"; select count(*) from "Contact"; select count(*) from "Subscriber"; select count(*) from "_prisma_migrations";'
   docker rm -f bft-restore-test
   ```
   The counts must equal the live counts taken at the same moment (same four queries, run in the live database as a read-only check) — allowing for rows created after *db dump start*. The restored database must also contain every table listed in `REQUIRED_TABLES` (`src/lib/schema-guard.ts`).
3. Restore a sample of files from `uploads.tgz` into a scratch directory and compare their checksums with the live originals.

**3. Failure handling — each case stops the line; none touches the CRM:**

| What fails | Result | Next step |
|---|---|---|
| Dump or tar fails, or verification fails | nothing was changed | fix and repeat; **do not deploy** or run a CRM migration |
| Website image build fails | the running website container is untouched (script order: build before start) | fix the code; nothing to restore |
| Container never becomes healthy | `deploy.sh` stops, prints a credential-filtered log tail | `deploy/rollback.sh previous` (the `previous` tag is only moved from a *healthy* container) |
| `rollback.sh` also fails, or the site misbehaves in public | the CRM is unaffected | remove the two published routes in Cloudflare (owner); the website is simply offline until fixed |
| A CRM migration (owner-run, separate procedure) fails | not caused by the website | restore **into a new database name**, verify, then switch the CRM — after taking a *second* backup of the current state; never overwrite the live database in place |
| Wrong data was written by the website | the role cannot delete or rewrite arbitrary rows (7.2) | restore from the verified backup into a new database, copy the affected rows back deliberately |

**4. Rollback never deletes data.** `rollback.sh` recreates only `bft-web` from an already-built image with `--no-build`; no script here removes a volume, an image, a network, uploads or a database object, and none runs `down`, `prune` or `volume` commands (asserted over every docker command by the dry-run test).

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
  (`scripts/verify-runtime-role-pg.ts`): schema built from the 55 bundled migrations by a non-superuser owner; the grants file applied twice; the effective-privilege report equals section 7.2 exactly (including the four column-level UPDATE lists); as the restricted role over TCP with the website's real code (real TLS resolver with `localhost` + `disable`, real Prisma client, real schema guard): 10 concurrent identical contacts → one contact;
  20 concurrent identical lead submissions → 1 created, 19 duplicates, 0 errors, one lead/history/activity row; 5 concurrent submission-info saves → one row; 12 concurrent queue claims, 10 racers for one lead, skipped and fully locked queue rows (7.4); the application holds one pool (≤ 5 connections); 42 forbidden operations refused; future-migration behaviour (7.6).
  Together with the self-hosted run it found real defects, all fixed: the `FOR UPDATE` privilege issue (7.4), the concurrent submission-info `P2002`, the per-access Prisma pool (7.5), and — in this review — that the real flight-request action also updates `Airport.name/city/country` (the first narrowed grant broke it; the browser test caught it, the proof script's upsert now mirrors the action).
- In-process PostgreSQL (PGlite, **not** a real server): `tests/runtime-role-e2e.spec.ts` — the same write paths and 16 refusals, kept as a fast check.
- **Standalone server, container-like layout, real PostgreSQL 17.10** (`tests/self-hosted-e2e.spec.ts`): no `.env`, no source files; health probe exits 0; apex redirect and look-alike hosts; three real browser form submissions with Cloudflare headers → lead saved, queued, notified, IP/location stored; forged forwarding headers ignored; no geo handled; the running server created no schema objects and logged no credentials.
- **Real PostgreSQL 17.10 with TLS enabled** (`scripts/verify-tls-real-pg.ts`, a disposable server with a throw-away CA and a certificate valid only for the name `localhost`): the right CA and name connect (the server reports an encrypted session); the wrong CA is refused; `127.0.0.1` is refused (this exposed the IP-literal gap in 7.3, now fixed); `?sslmode=disable`, `?ssl=0`, `?ssl=false`, `?sslmode=no-verify` and `?sslrootcert=` cannot downgrade or redirect verification; `DATABASE_SSL_VERIFY=system` refuses the private CA; the default connects unverified (documented weakness); `DATABASE_SSL_MODE=disable` is real plaintext; conflicting or off-list configurations are refused before any connection.
- `tests/db-tls-driver.spec.ts` (8) and `tests/vps-deployment.spec.ts`: TLS policy compared with the real `pg` parser, Cloudflare IP/geo, static properties of Dockerfile/compose/scripts/grants.
- `tests/deploy-scripts.spec.ts` (15): the real `deploy/*.sh` under bash with a **stub `docker`**: preflight refusals (alias collision, missing network/db alias, published port, missing `.env`, no/conflicting/invalid TLS decision), `:previous` not retagged from an unhealthy container, deploy success/failure paths, CRM-fingerprint check, rollback, and an allow-list over every docker command issued. Proves the scripts' logic only, not Docker's behaviour.
- Shell syntax (`bash -n`), LF endings and executable bits (`100755`) of the four runnable scripts.

### 12.2 Not verified (could not be)

`docker build` (so: the Dockerfile as a whole, `npm ci` on Linux, non-root file permissions, the HEALTHCHECK inside the image), `docker compose config`/`up`, the real Docker network and DNS (`db`, `bft-web`), the live `compass-tools_internal` network, whether `compass-tools_internal` has outbound internet (the website uses its own network for egress), the CRM database and its TLS, the VPS, Cloudflare Tunnel routing, `CF-Connecting-IP` behaviour in production, Gmail delivery, DNS.
**Compose configuration was not validated with the Compose CLI**; only static checks on the YAML were made.

### 12.3 Worker crashes in the earlier full run

The earlier full run (3 workers, 4 viewport projects) reported 1335 passed / 4 skipped / 1 flaky / 4 failed, all four being `worker process exited unexpectedly` (exit code 2147483651 = 0x80000003, a fatal abort) in specs that start an in-memory PostgreSQL. Investigation: the same specs pass serially (172/172) and also at 3 workers (176/176) when run on their own; each instance needs 150–200 MB; this machine had ~1.4 GB free; and those specs ran four times, once per viewport project, next to Chromium and a Next server.
This is consistent with memory exhaustion, not a logic defect, but it is **not proven** (no crash dump was captured). Mitigation in this branch: these specs now live in one `Infrastructure` project that runs once, after the browser projects, and `npm run test:infra` runs it with one worker. Results of the final runs are in 12.4.

### 12.4 Final validation results (current checkout, re-run in the 2026-10-17 pre-merge review)

- `npx tsc --noEmit`, `npx eslint .`: clean. `npx prisma validate` (schema unchanged): valid. `prisma generate` with no `DATABASE_URL` and no `.env` (as in the image build): succeeds. Plain `npm run build` and `NEXT_OUTPUT=standalone npm run build`: both succeed.
- `npm run test:infra` (Infrastructure project, 1 worker; real PostgreSQL 17.10 and a real TLS-enabled PostgreSQL 17.10 supplied): **97 passed, 0 failed, 0 skipped**, 260 s.
  (A first run of this project found the `Airport` UPDATE regression described in 12.1: 1 failed / 93 passed; fixed and re-run.)
- Browser projects (`--workers=2`, plain production build under `next start -p 3200`): **1080 passed, 4 skipped, 0 failed, no worker crashes**, 203 s. The 4 skipped tests are the same 4 skipped in the earlier runs.
- Resource pressure recurred and was looked at: this 7.7 GB machine had 1.7 GB free at idle (Windows memory compression 1.4 GB, Defender, the desktop app, Chrome) and sampled free memory fell to ~40 MB during the browser projects (10th percentile ~456 MB). It is a property of this machine; keeping the database specs out of the browser run and using 2 workers coincided with no worker crash in any run recorded in this section (the one failing run failed an assertion, not a worker).
- Not tested: Docker, the Compose CLI, the VPS, Cloudflare, e-mail delivery, DNS (12.2). Run the commands in 12.5 where Docker exists.

### 12.5 Commands to run where Docker exists (NOT TESTED here; none touches production)

Run these on a **separate Linux machine** (preferred) — on the VPS only if you keep the distinct project name `bft-check`, the distinct tag `check-only` and the throw-away network exactly as written — and never against the CRM's Compose project. They need Docker Engine with Compose v2 and use dummy values only.

```bash
git clone --branch feature/vps-website https://github.com/jasurkhonazizkhonov-source/Business-Flights-Travel-Website.git bft-check && cd bft-check
# 1. Compose file: renders, one service, no ports, the external network declared (safe dummy values; create the dummy network first)
docker network create bft-check-net                                           # a throw-away network, removed in step 6
export APP_VERSION=check-only            # a distinct image tag: never the deployed one
export DATABASE_URL='postgresql://dummy:dummy@db:5432/dummy' DATABASE_SSL_MODE=disable GMAIL_SENDER_EMAIL=a@example.com GMAIL_APP_PASSWORD=dummy CRM_NETWORK_NAME=bft-check-net
docker compose -p bft-check -f compose.yaml config --quiet && echo "config ok"
docker compose -p bft-check -f compose.yaml config | grep -E '^s+(ports|published):' && echo "FAIL: ports published" || echo "no published ports"
docker compose -p bft-check -f compose.yaml config --services                 # expect exactly: bft-web
# 2. Build the real image (no secrets are used or needed)
docker compose -p bft-check -f compose.yaml build bft-web
# 3. Start it ONLY on the throw-away network and check health, user, file permissions, no .env, no host port
docker compose -p bft-check -f compose.yaml up -d --no-deps bft-web
docker inspect -f '{{.State.Health.Status}}' bft-check-bft-web-1               # healthy (the health check does not use the database)
docker exec bft-check-bft-web-1 id -u                                          # not 0
docker exec bft-check-bft-web-1 sh -c 'touch /app/server.js 2>&1 | head -1; touch /app/.next/cache/x && echo "cache writable"; ls -a /app | grep -c "^.env" || true'   # app code NOT writable, cache writable, no .env
docker port bft-check-bft-web-1                                                # prints nothing
docker exec bft-check-bft-web-1 getent hosts bft-web                           # the alias resolves inside the network
# 4. Functional checks from inside the container (the same script the deploy uses)
CONTAINER=bft-check-bft-web-1; docker exec "$CONTAINER" node -e "$(cat deploy/verify-responses.mjs)"
# 5. Disposable PostgreSQL + role + grants (see 7.2 / 8.3 for the exact SQL): run it against a throw-away postgres:17 container on the same network
#    with the alias db, then repeat the form-submission test of tests/self-hosted-e2e.spec.ts against it.
# 6. Clean up ONLY these throw-away resources
docker compose -p bft-check -f compose.yaml down --remove-orphans             # project "bft-check" only
docker network rm bft-check-net && docker image rm business-flights-web:check-only || true
```

On the VPS, additionally (read-only, section 4 and 8.6): confirm the real network name, the `db` alias, no other container named `bft-web`, and that `cloudflared` can resolve `bft-web` — before any route is added. Persistent uploads are the CRM's, not the website's: this image has no data volume, which step 3 confirms (`docker inspect` shows no mounts).

## 13. Outstanding owner decisions and blockers

- **D1** Database location: is the live CRM database now the `db` container (PostgreSQL 17), with all data moved? Not assumed. A remote database needs `DATABASE_SSL_CA`, no `compass-tools_internal` dependency, and a small compose edit.
- **D2** Accept joining the CRM's shared, flat network (this branch's design, per the reported topology), or have the CRM project add a dedicated network for the website (a change in the CRM repository).
- **D3** Create `bft_web` and approve the privileges in 7.2 (whole-table `SELECT` on the contact/lead tables, the four column-level `UPDATE` lists, whether the site should keep overwriting `Airport` names, default `TEMPORARY`); choose the password; confirm which role owns CRM migrations.
- **D9** Database TLS (7.3): enable TLS on the CRM's PostgreSQL and use `DATABASE_SSL_CA` (recommended), or record an explicit plaintext exception for the private Docker network (what the CRM's own Compose file does today). The deployment cannot start without one of the two being written into `.env`.
- **D4** Who coordinates CRM migrations with website releases (7.6), and who re-runs the verification report afterwards.
- **D5** Canonical host `www` (as declared) and routes for both hostnames (section 5).
- **D6** Which provider handled `@businessflights.travel` mail, and the evidence to restore its DNS records (section 11).
- **D7** Enable Cloudflare "Add visitor location headers"; privacy-policy wording and retention for IP/location; whether the CRM shows the IP unmasked.
- **D8** The CRM's authenticated lead API (separate task, awaiting the contract): this branch writes leads directly to the database, exactly as the Vercel deployment did.
- **Blockers for a safe first deployment:** Docker image/Compose/network behaviour unverified (12.2); a verified database backup and restore test (8.3); D1 and D3; the owner-run Docker-network checks (8.6); DNS/mail evidence (11).

## 14. Updating the base image

Pinned by version and digest. To update: pick a new patch release of the same major, read its digest from Docker Hub, change `NODE_IMAGE` in a reviewed commit (keep it equal to the CRM's pin), rebuild, run `npm run test:infra`, then `deploy/deploy.sh`. A rebuild without a change does not pick up OS security updates; schedule a periodic review.
