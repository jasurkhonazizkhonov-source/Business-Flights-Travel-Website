# Deploying the website on the OVHcloud VPS (Docker + Cloudflare Tunnel)

Branch `feature/vps-website`. **Nothing in this branch has been deployed.** It was prepared and tested on a Windows workstation with no
Docker, no Linux and no access to the VPS, the CRM, the production database, Cloudflare or DNS. Section 12 lists exactly what was and
was not proven. Everything in sections 4, 5, 8 and 9 that changes the server, the tunnel, DNS or the database is an **owner action**:
nothing here does it for you, and no script in `deploy/` does it either.

## 1. Architecture

```
visitor ──HTTPS──▶ Cloudflare edge ──(tunnel, outbound from the VPS)──▶ cloudflared ──▶ http://bft-web:3000  (this website)
                                                                                    └─▶ http://app:3000      (CRM, unchanged)
website container ──private Docker network──▶ db:5432  (the CRM's PostgreSQL)
website container ──outbound──▶ Gmail SMTP (465/587), images.unsplash.com
```

- **Own Compose project**: `business-flights-travel`, one service `web`. `compose.yaml` does not define, start, stop or recreate
  PostgreSQL, the CRM or the Cloudflare connector. Every script passes `-p business-flights-travel` and names only `web`.
- **No published port.** There is no `ports:` anywhere (`expose: 3000` only documents the port for other containers). Public ports
  80/443 stay closed. `deploy/preflight.sh` and `deploy/verify.sh` both fail if a host port appears.
- **No volume.** The site stores no files (no uploads, no local state); customer data lives only in PostgreSQL. So there is nothing to
  back up for the website container itself — back up the database (section 7).
- **Image**: Node `24.21.0-bookworm-slim` pinned by digest (the same pin the CRM uses), multi-stage, non-root `node` user, Next
  `standalone` output, `HEALTHCHECK` on `/api/health`, `no-new-privileges`, all capabilities dropped, memory/CPU/PID limits, JSON log
  rotation, `restart: unless-stopped`. No secret is used at build time or present in the image (a final build step fails if a `.env` is).

## 2. Files in this branch and why

| File | Why |
|---|---|
| `Dockerfile`, `.dockerignore`, `.gitattributes` | production image; context excludes `.env`/keys; scripts keep LF endings |
| `compose.yaml` | the website's own project, external networks, no ports, hardening |
| `.env.vps.example` | variable **names** with placeholders (the real `.env` is never committed; `.gitignore` allows only the example) |
| `next.config.ts` | `output: "standalone"` only when `NEXT_OUTPUT=standalone` (the Docker build); Vercel/dev builds are unchanged |
| `src/app/api/health/route.ts`, `scripts/healthcheck.mjs` | liveness probe that deliberately does **not** touch the database; `robots.ts` disallows `/api/` |
| `src/lib/db-tls.ts` (+ `prisma.ts`, `schema-ready.ts`) | TLS policy, section 6.3 |
| `src/lib/ip-geo.ts`, `src/lib/submission-info.ts` | Cloudflare-compatible visitor location, section 8 |
| `src/server/lead-distribution.ts` | `FOR UPDATE SKIP LOCKED` → `FOR UPDATE OF lqe SKIP LOCKED` (section 6.4) |
| `deploy/*.sh`, `deploy/verify-responses.mjs` | preflight / deploy / verify / rollback, all scoped to this project |
| `deploy/sql/website-runtime-role-grants.sql` | the least-privilege role |
| `scripts/verify-runtime-role.ts`, `tests/runtime-role-e2e.spec.ts`, `tests/vps-deployment.spec.ts` | tests, section 12 |

`scripts/vercel-build.mjs` (the old Vercel build, which can run schema DDL) was **not** touched and is not used by the Docker image.

## 3. Assumptions and compatibility risks (verify before relying on them)

1. The CRM's compose project is named `compass-tools`, so its private database network is `compass-tools_data` and the database
   service answers to the alias `db`. This comes from the CRM's `compose.yaml` as read; **confirm with `docker network ls`** (the
   preflight does). If the real names differ, set `CRM_DATA_NETWORK_NAME` / `EDGE_NETWORK_NAME` in `.env` — never guess.
2. The CRM's database has moved to (or will move to) the PostgreSQL container `db` on the VPS. **This branch does not assume the move is
   complete** — see decision D1. While the CRM still uses a managed remote database the website must not be pointed at `db`.
3. The website's `prisma/schema.prisma` is a copy of the CRM schema. The CRM owns it. If the CRM migrates a column or table the website
   uses (Lead, Contact, Activity, Notification, Subscriber, Airport, LeadQueueEntry, LeadSubmissionInfo, ContactInquiry …) the website
   must be updated and redeployed with it — see 6.5.
4. The tunnel connector is the CRM's `cloudflared`, remotely managed (routes are created in the Cloudflare dashboard). It is outbound-only.
5. Gmail SMTP is reachable from the VPS, and `images.unsplash.com` (used by `next/image`) is reachable.

## 4. Networking (owner steps; nothing disrupts a running service)

Separate Compose projects do **not** share networks. The website needs two shared networks: one to reach `db`, one to be reached by
the tunnel connector. Both are declared `external` in `compose.yaml`, so Compose never creates one and `up` fails loudly if one is missing.

**4.1 Read first (read-only):**

```bash
docker network ls
docker network inspect compass-tools_data --format '{{range .Containers}}{{.Name}} {{end}}'   # expect the db container, CRM app
docker ps --format '{{.Names}}\t{{.Ports}}'                                                     # nothing publishes 5432
```

**4.2 Database side.** `compass-tools_data` already exists (it is the CRM's). The website attaches to it as a client; nothing about the
CRM changes. Note this network is flat: the website container can reach every container attached to it (the CRM app as well as `db`),
so the database role (section 6) is the real boundary, not the network.

**4.3 Tunnel side — choose ONE (decision D2).**

- **Option A (recommended, nothing in the CRM project changes): attach the website to the network the connector is already on.**
  Find it with `docker inspect <cloudflared container> --format '{{json .NetworkSettings.Networks}}'` (the CRM's `web` network, expected
  `compass-tools_web`) and put it in `.env` as `EDGE_NETWORK_NAME=compass-tools_web`. The website joins with the unique alias `bft-web`;
  the connector and CRM are not modified or restarted. Trade-off: the website and the CRM app share one network.
- **Option B (isolated): a dedicated `bft-edge` network.** `docker network create bft-edge`, then connect the connector once:
  `docker network connect bft-edge <cloudflared container>`. This **does not survive** the connector being recreated (for example by the
  CRM's deploy script). To make it permanent the CRM's compose file must list `bft-edge` — a change in the CRM repository that this
  branch deliberately does not make. Until then, re-run the connect command after every CRM redeploy.

Either way, verify before routing any traffic (the website must already be running, section 10):

```bash
docker exec <cloudflared container> wget -qO- http://bft-web:3000/api/health      # {"status":"ok"} ; if wget is absent use the CRM's own probe tool
```

**4.4 Tunnel routes (owner, Cloudflare dashboard — not done by this branch).** After 4.3 works, in Zero Trust → Networks → Tunnels →
the existing tunnel → Public Hostname add **two** routes: `businessflights.travel` → `HTTP` `bft-web:3000` and
`www.businessflights.travel` → `HTTP` `bft-web:3000`. Adding a route also creates a proxied CNAME to `<tunnel-id>.cfargotunnel.com` for
a hostname with no conflicting record. **Do not add them before** you have confirmed (a) the existing records for those names
(section 9), and (b) the CRM's own routes are unaffected. Choose the canonical host (D5): the site declares
`https://www.businessflights.travel` as canonical, so redirect the apex to `www` (a Cloudflare redirect rule) rather than serving two origins.

## 5. Environment variables (names only — values are the owner's, in a `chmod 600` `.env` beside `compose.yaml`)

| Variable | Required | Meaning |
|---|---|---|
| `DATABASE_URL` | yes | `postgresql://<runtime_role>:<url_encoded_password>@db:5432/<database_name>` |
| `DATABASE_SSL_MODE` | no (default `disable`) | only `disable` is valid, and only for host `db`/localhost; see 6.3 |
| `DATABASE_SSL_CA`, `DATABASE_SSL_VERIFY` | no | verified TLS for a remote database (conflicts with `disable`, which is then refused) |
| `GMAIL_SENDER_EMAIL`, `GMAIL_APP_PASSWORD` | yes | notification email sender (app password) |
| `EDGE_NETWORK_NAME`, `CRM_DATA_NETWORK_NAME` | no | external network names (4.3, 3.1) |
| `APP_VERSION` | no | image tag; the deploy script sets it to the git short SHA |

Fixed by `compose.yaml` and not configurable from `.env`: `TRUSTED_PROXY=cloudflare`, `DATABASE_AUTO_INIT=false`. Secrets are never
printed by any script (`env_value` reads without echoing; `compose config -q` is used, and the log filter hides `*PASSWORD/SECRET/TOKEN`).
Do not paste `docker compose config` output into tickets: it expands secrets.

## 6. Database

### 6.1 Hostname, name, role

`db` (the CRM's PostgreSQL service on `compass-tools_data`), port 5432. **The database name is the CRM's** — read it from the CRM's
environment as the owner; this branch does not create another database. **Role: a dedicated `bft_web`**, not the superuser and not the
CRM's application role.

### 6.2 Permissions (what the role may do)

`deploy/sql/website-runtime-role-grants.sql` (the owner runs it, reviewed, in one transaction — header of the file has the command).
Summary: `USAGE` on schema `public`, **no `CREATE`**, no ownership; `SELECT` on `Company`, `Account`, `_prisma_migrations`;
`SELECT, INSERT` on `Lead`, `LeadStatusHistory`, `Activity`, `Contact`, `ContactEmail`, `ContactPhone`, `ContactInquiry`,
`Notification`, `LeadSubmissionInfo`; `UPDATE` on `Lead`, `LeadSubmissionInfo`; `SELECT, INSERT, UPDATE` on `Subscriber`, `Airport`;
`SELECT, UPDATE` on `LeadQueueEntry`; `USAGE` on `Airport_id_seq`. **No `DELETE`, no `TRUNCATE`, no DDL, no access to payment, booking,
audit, Gmail or any other CRM table.** The role is created `NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS` with a connection
limit (the file's header has the statement; the password is the owner's).

Why `SELECT` on `Account` and `_prisma_migrations`: the lead-queue query joins `Account`, and the read-only schema guard lists tables
through `information_schema`, which shows a table only if the role holds a privilege on it.

This list was derived from the code and **proven on a real PostgreSQL engine** (section 12): every website write path runs under exactly
these grants, and DDL, `DELETE`, `TRUNCATE`, `GRANT`, `CREATE ROLE` and the sensitive CRM tables are refused by the database. Re-run
`tests/runtime-role-e2e.spec.ts` whenever the website or CRM schema changes.

### 6.3 TLS

- Default, unchanged: encrypted but **not** identity-verified (the historical behaviour, kept so Vercel/Aiven setups keep working).
- `DATABASE_SSL_CA` (or `DATABASE_SSL_VERIFY=system`): certificate **and host name verified**. Use this for any non-private database.
- `DATABASE_SSL_MODE=disable`: plaintext, accepted **only** if the value is exactly `disable`, the host in `DATABASE_URL` is exactly
  `db`, `localhost`, `127.0.0.1` or `::1`, the URL has no `host=`/`hostaddr=` override, and `DATABASE_SSL_CA`/`VERIFY` are not also set.
  Anything else throws at startup — never a silent downgrade. This is a misconfiguration guard, not proof of a private network: the control
  that matters is that PostgreSQL publishes no host port and sits on an internal Docker network (checked by the preflight).
- The CRM's own TLS behaviour is not touched.

### 6.4 One application change this required

The lead-queue claim ran `SELECT … FROM "LeadQueueEntry" JOIN "Account" … FOR UPDATE SKIP LOCKED`. Without `OF`, PostgreSQL also takes
row locks on the joined `Account` rows, which needs `UPDATE` on `"Account"` — a privilege the website must not hold. It is now
`FOR UPDATE OF lqe SKIP LOCKED`: identical claim semantics (only the queue entry is contended) and it no longer locks CRM account rows.
This was found by the real-engine role test, and a static test pins it.

### 6.5 Migrations — where schema-creating statements can run, and the workflow

Places that *can* execute DDL in this codebase: (1) `scripts/vercel-build.mjs` (Vercel only; not in the image, not run); (2) the schema
guard in `src/lib/schema-guard.ts` / `src/server/schema-ready.ts`, **only** when `DATABASE_AUTO_INIT` is exactly `"true"` — compose pins it
to `"false"`, and the runtime role could not execute it anyway. In the VPS deployment the website therefore performs **no** migration and no
schema repair; with the guard read-only, a missing table produces a clear error instead of an attempt to create it.
Workflow: the CRM project applies migrations with its own owner role. When a CRM migration changes something the website uses, update the
website's schema copy and `src/generated` client, run the section 12 tests, then redeploy the website. Never deploy a CRM migration that
drops/renames used columns before the matching website release (expand → deploy website → contract).

**This branch has not connected to, read, or modified any production database.**

## 7. Runbook

### 7.1 Preflight (read-only)

```bash
git fetch origin && git switch feature/vps-website        # the owner-approved commit, clean tree
cp .env.vps.example .env && chmod 600 .env                # first time only; fill in with the owner's secrets
deploy/preflight.sh
```

It checks Docker/Compose, `.env` present and `600`, required variables present (values not shown), the rendered config has no ports and
exactly one service, both external networks exist, a container on the CRM data network answers to `db`, PostgreSQL publishes no host
port, whether the connector is attached, disk and memory, and the current website container.

### 7.2 Backup (owner; before the first deploy and before any CRM migration)

The website has no volume. Back up the database with the CRM's own procedure; if none exists:

```bash
docker exec <db container> sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > "bft-crm-$(date +%F).dump"   # then verify: pg_restore -l <file> | head
```

Also copy `.env` to the password manager/offline store (it is not in git). Do not run anything that deletes a volume.

### 7.3 Deployment

```bash
deploy/deploy.sh        # preflight → tags the running image as business-flights-web:previous → build → up -d --no-deps web → wait healthy → verify
```

Only the `web` service of this project is built/recreated. First deploy only: the owner applies the role grants (6.2) and sets
`DATABASE_URL` **before** this step; the container can start without a reachable database (the health check does not use it), so the
database path is proven by the checks in 7.4, not by "healthy".

### 7.4 Verification

`deploy/deploy.sh` ends with `deploy/verify.sh` (also runnable alone): container running and healthy, no host ports, non-root, then from
inside the container: `/api/health` 200 and `no-store`, home 200 with a rendered `<h1>`, `robots.txt` naming the sitemap, `sitemap.xml` with
more than 100 URLs, two unknown URLs (a blog slug and a destination city) each returning a real **404**, and `/flights?to=GRU` carrying the
canonical `/flights`. Then, owner-run once the routes exist (section 4.4):

```bash
curl -sI https://www.businessflights.travel/ | head -n 5
curl -s -o /dev/null -w '%{http_code}\n' https://www.businessflights.travel/definitely-not-a-page      # 404
curl -s https://www.businessflights.travel/robots.txt
```

Then submit **one real test flight request and one contact message** from a normal browser, and in the CRM confirm the lead appears with
the correct IP and approximate location, is assigned by the queue, and the notification email arrives. This is the only proof the
database role, the queue and the email path work together in production; no earlier check covers it.

### 7.5 Rollback

```bash
deploy/rollback.sh previous        # or a specific tag: deploy/rollback.sh <git short sha>
```

Recreates only `web` from an already-built image with `--no-build`. If the problem is routing, remove the two public hostname routes in
Cloudflare (owner) — the CRM is unaffected. A database change is never part of a website rollback (there is none).

## 8. Visitor IP and location

- `TRUSTED_PROXY=cloudflare` (set by compose) reads **only** `CF-Connecting-IP`; `X-Forwarded-For` and `X-Real-IP` are ignored in this
  mode and in every mode that is not explicitly trusted. This is safe **only because nothing can reach the container except via the
  tunnel** (no published port). Anything else on a shared Docker network (see 4.2/4.3) could forge the header, which is one more reason to
  prefer a minimal set of networks and a restricted database role.
- Vercel-specific geo headers (`x-vercel-ip-*`) are read **only** when `TRUSTED_PROXY=vercel`. Under `cloudflare` location comes from:
  `CF-IPCountry` (IP Geolocation, on by default; `XX` and `T1` are not countries and are dropped) and, if the owner enables **Rules →
  Managed Transforms → "Add visitor location headers"**, `cf-ipcity`, `cf-region`, `cf-region-code`, `cf-timezone`. Header values are
  decoded as UTF-8. Location is labelled "approximate" in the CRM.
- Missing geo headers are normal and handled: the lead still saves with IP only.
- **Not verified in production**: header forgery from the internet (Cloudflare overwrites `CF-Connecting-IP`; confirm with
  `curl -H 'CF-Connecting-IP: 203.0.113.9' https://www.businessflights.travel/…` and check the stored IP is yours), and whether the managed
  transform is enabled on this zone. Until the transform is on, only the country is stored.

## 9. DNS and email — owner actions and evidence needed

Nothing in this branch modifies DNS or Cloudflare. **Do not add or change any DNS value without the evidence below. This document invents no MX,
SPF, DKIM, DMARC, A, AAAA or CNAME values.**

1. Export what exists today: Cloudflare → DNS → Records → Export (BIND file) for the zone; at the registrar, record the nameservers
   actually in use. The earlier outage showed NXDOMAIN for `www`, so an expected record is currently absent or the zone is not authoritative.
2. Recover the original mail configuration from evidence, not memory: a recent email's full headers (`Received`, `Return-Path`,
   `Authentication-Results`, the `DKIM-Signature` `d=`/`s=` values show the provider and selector); the mail provider's admin console
   (Google Workspace/Microsoft 365/other) which shows the exact records it expects; the previous Cloudflare/registrar DNS export or
   backup; DNS history from a third-party archive as a cross-check only.
3. Note what the website itself needs: it sends notification mail through **Gmail SMTP with an app password** (`GMAIL_SENDER_EMAIL`); if that
   sender is a plain Gmail address, the website's outgoing mail does not depend on the domain's MX/SPF/DKIM at all. Mail to
   `@businessflights.travel` addresses does, and that is separate from the website.
4. Only after 1–2: confirm no existing record conflicts with the two tunnel hostnames (a route cannot be added over an existing A/AAAA/CNAME
   for the same name), then add the routes (4.4).

## 10. First-deployment order (summary)

1. Owner decisions D1–D6 below. 2. Backup (7.2). 3. Create the role and apply the grants (6.2). 4. Networks (4.1–4.3) and `.env`.
5. `deploy/preflight.sh`. 6. `deploy/deploy.sh`. 7. Verify the connector reaches `bft-web:3000` (4.3). 8. DNS evidence (9), then the
tunnel routes (4.4). 9. Public checks and the real test submission (7.4). 10. Cloudflare "Add visitor location headers" (8).
11. Search Console: resubmit the sitemap and re-validate fixes once the site answers.

## 11. Updating the base image

The Node image is pinned by version and digest. To update: pick a new patch release of the same major, read its digest from Docker Hub,
change `NODE_IMAGE` in the `Dockerfile` in a reviewed commit (keep it equal to the CRM's pin), rebuild and run the tests, then `deploy/deploy.sh`.
Rebuilding without a change does not pick up OS security updates beyond the pinned image; schedule a periodic review.

## 12. What was and was not tested

Run on the development machine (Windows, Node 24):

- `tsc --noEmit`, `eslint .`: clean. `npm run build` (default config) and the standalone build (`NEXT_OUTPUT=standalone`): succeed.
- `tests/vps-deployment.spec.ts`: TLS policy (every allowed/refused combination, URL-parameter override, conflicts), Cloudflare IP/geo
  handling (XFF ignored, `XX`/`T1`, UTF-8 city names, missing headers), static checks of Dockerfile/compose/scripts (no ports, one service,
  external networks, no destructive commands, non-root, digest pin, no `rejectUnauthorized: false` left in code), `/api/health` and robots.
- `tests/runtime-role-e2e.spec.ts` (PGlite = real PostgreSQL engine): the real migration bundle builds the schema as owner; the grants file
  is applied to a new role; as that role the real Prisma client and real helpers run the schema guard (read-only), newsletter, contact
  resolution (Serializable), airports, idempotent lead creation, submission info, contact inquiry, queue assignment, notification and
  activity; 16 forbidden operations are each refused by the database. It found and fixed the `FOR UPDATE` issue in 6.4.
- The built server was started with `NEXT_OUTPUT=standalone` and the in-container verification script was run against it on loopback.
- Full Playwright suite (4 viewport projects, 3 workers) against `next start` on a production build: 1335 passed, 4 skipped, 1 flaky, 4 failed.
  All 4 failures were `worker process exited unexpectedly` crashes of the in-memory PostgreSQL (PGlite) specs while several workers
  ran them at once (two of them are the pre-existing `schema-guard-repair.spec.ts`), not assertion failures. Re-running those specs
  plus `schema-guard.spec.ts` with `--workers=1 --retries=0`: **172 of 172 passed**, including the role proof in all four projects. To run the
  PGlite specs reliably, use `npx playwright test tests/runtime-role-e2e.spec.ts tests/schema-guard*.spec.ts --workers=1`.

**Not tested (could not be):** `docker build`, `docker compose config/up`, the shell scripts under real Bash on Linux (they were reviewed and
statically tested only), the image's runtime behaviour as user `node` with `cap_drop`, tunnel routing, Docker networking between projects,
the real CRM database or its TLS behaviour, real Gmail delivery, Cloudflare header behaviour in production, DNS. This branch adds no CI
workflow; the first deployment on the VPS is the proof for these, so treat it as unproven until 7.4 passes.

## 13. Outstanding owner decisions

- **D1** Is the CRM database on the VPS (`db`) now, or still remote? This branch targets `db`; a remote database needs `DATABASE_SSL_CA`, no
  `crm_data` network entry in `compose.yaml` (a small edit), and egress to it.
- **D2** Tunnel network: Option A (join the connector's existing network) or B (dedicated `bft-edge`, needs a CRM compose change to persist).
- **D3** Database name and role: create `bft_web` with the file's grants and a strong password; confirm the CRM's schema owner role runs migrations.
- **D4** Who owns coordinating CRM migrations with website releases (6.5).
- **D5** Canonical host (`www`, as the site declares) and the apex redirect; rules for both hostnames.
- **D6** Which mail provider handled `@businessflights.travel` mail, and the evidence to restore its DNS records (section 9).
- **D7** Whether to enable Cloudflare "Add visitor location headers" (city/region); and the business decision, still open from earlier passes,
  on whether the CRM should show the lead IP unmasked.
- **D8** The pending CRM API lead-submission integration is a separate task awaiting the contract; this branch writes leads directly to the
  database, exactly as the Vercel deployment did.
