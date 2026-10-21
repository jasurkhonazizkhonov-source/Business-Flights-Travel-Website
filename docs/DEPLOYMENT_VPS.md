# Deploying the website on the OVHcloud VPS (Docker + Cloudflare Tunnel, API-only CRM integration)

Branch `feature/api-only-crm-integration`. **Nothing here has been deployed, and no production system was contacted** (no VPS, no CRM, no
production database, no Cloudflare, no DNS). Every step that changes the server, the tunnel or DNS is an **owner action**; no script in `deploy/`
performs any of them.

**Status: UNVERIFIED for first deployment.** The code, the CRM API client (against a local stand-in for the CRM's contract), the scripts' logic and
the standalone server were tested (section 12). The Docker image build, `docker compose` itself, the real Docker networks and a real CRM were
**not** — Docker was not available here and the CRM release was not run. Treat the first deployment as unproven until section 8.6 passes.

**This supersedes the earlier version of this document**, in which the website talked to PostgreSQL directly (a runtime role, TLS settings, grants,
a schema guard). That design is gone: the website now has **no database access of any kind**. See `docs/CRM_API_INTEGRATION.md`.

## 1. Architecture

```
visitor ──HTTPS──▶ Cloudflare ──tunnel (outbound from the VPS)──▶ cloudflared ──▶ http://app:3000        (CRM, compass-tools.com — unchanged)
                                                                                └─▶ http://bft-web:3000   (this website — owner adds the routes)

website container (bft-web) ──private API network──▶ http://compass-crm:3000/api/v1/website/flight-inquiries   (bearer key, Idempotency-Key)
                                                  └─▶ http://compass-crm:3000/api/public/{contact-inquiry,subscribe}
website container ──own project network──▶ outbound only: Gmail SMTP, images.unsplash.com
```

The website → CRM → CRM database chain is the only data path. There is no website database, no connection string, and no route from the website
container to PostgreSQL.

| Item | Value (reported from the VPS on 2026-10-16; **not re-checked by this branch**) |
|---|---|
| Host | OVH VPS, Ubuntu 26.04.1, `51.161.102.115`; public ports 80/443 closed |
| CRM Compose project | `compass-tools` (`/home/ubuntu/apps/Compass-Tools/compose.yaml`) — and, for the API, the release checkout `~/apps/Compass-Tools-release` |
| Tunnel | remotely managed; ingress `compass-tools.com` → `http://app:3000`, then a catch-all HTTP 404 |

The compose layout of the live CRM stack differs from the repository's (see the CRM's own notes on the live stack versus Git compose). The website
therefore refers to the CRM networks **by configurable name**, and `deploy/preflight.sh` reads the real ones before anything starts.

- **Own Compose project** `business-flights-travel`, one service `bft-web`. It does not define, start, stop or recreate the CRM, PostgreSQL or the
  connector. Every script passes `-p business-flights-travel` and names only `bft-web`.
- **Unique name on shared networks.** The service is `bft-web` (never `app`, `db`, `web`, `cloudflared`, `compass-crm`), because Docker adds the
  service name as a DNS alias on each network it joins. Only the tunnel network carries it as an explicit alias. `deploy/preflight.sh` refuses to
  deploy if another container already answers to `bft-web`. No `container_name:` is set.
- **No published port, no volume.** The site stores no files.
- **Image**: `node:24.21.0-bookworm-slim` pinned by digest, multi-stage, Next `standalone` output, non-root `node` user, root-owned application files
  (only `.next/cache` is writable), `HEALTHCHECK` on `/api/health` (no CRM call), `no-new-privileges`, all capabilities dropped, memory/CPU/PID
  limits, log rotation, `restart: unless-stopped`. The image contains **no** Prisma, no database tooling, no `openssl`, no build-time secret.

## 2. Files and why

| File | Why |
|---|---|
| `src/lib/crm-api/*`, `src/server/crm-api.ts`, `src/server/actions/*` | the server-only CRM client, the single place the credentials are read, and the three form actions (`docs/CRM_API_INTEGRATION.md`) |
| `Dockerfile`, `.dockerignore`, `.gitattributes` | production image; the context excludes `.env`, keys, tests, docs; shell scripts keep LF endings |
| `compose.yaml`, `.env.vps.example` | the website's own project, two **external** networks, no ports, hardening; placeholders only |
| `next.config.ts` | `output: "standalone"` only when `NEXT_OUTPUT=standalone`; apex → `www` 308 redirect (section 9) |
| `src/app/api/health/route.ts`, `scripts/healthcheck.mjs`, `src/app/robots.ts` | liveness probe that never touches the CRM; `/api/` disallowed |
| `src/lib/ip-geo.ts`, `src/lib/submission-info.ts`, `src/lib/client-ip.ts` | trusted visitor IP and Cloudflare location (section 10) |
| `deploy/*.sh`, `deploy/verify-responses.mjs` | preflight / deploy / verify / rollback, scoped to this project |
| `tests/*`, `playwright.config.ts` | proofs, section 12 |

Removed in this branch (no replacement is needed because the CRM owns the function): `prisma/`, `prisma.config.ts`, `deploy/sql/*` (the old
runtime-role grants), `src/lib/{prisma,db-tls,db-error,schema-guard,…}.ts`, `src/server/{crm-company,create-website-lead,lead-distribution,…}.ts`,
`scripts/vercel-build.mjs` and the database verification scripts.

## 3. Assumptions and compatibility risks

1. The CRM release that contains the website API **and its migration `20261016000100_lead_ingest_fingerprint`** is deployed by the CRM owner. That is
   the CRM pull request at commit `01e809d` (branch `work/website-api-minimal-20261021`; **not merged, not deployed**; the website's client was
   verified against that build, see `docs/CRM_API_INTEGRATION.md`). The production database was last reported with 72 migrations, i.e. **without**
   that one (re-confirm on the VPS); without it the flight endpoint cannot store a lead and every flight request shows the friendly error. The website
   does not and must not apply migrations.
2. **The private network path is NOT verified for the live CRM stack.** The defaults in `compose.yaml` - network `compass-tools-website-api` (the CRM
   answering as `compass-crm`) and network `compass-tools_web` - describe the CRM *release branch's* Compose layout (`4d33c29`: networks `data`, `web`
   and `website_api`). The CRM pull request contains **no Compose file**, so it defines no network and no alias at all. The live production CRM stack
   was last reported with a different layout: **one** network, `compass-tools_internal`, carrying the CRM app, PostgreSQL and `cloudflared`, with the
   CRM service reachable as `app` (so `http://app:3000`, not `http://compass-crm:3000`). None of that can be read from this repository; confirm it
   on the VPS with the read-only `docker network ls`, `docker network inspect compass-tools_internal` and `docker inspect` of the CRM container
   (aliases only). `CRM_API_URL`, `CRM_API_NETWORK_NAME` and `TUNNEL_NETWORK_NAME` exist so the real names can be used, and `deploy/preflight.sh` now
   verifies the host named by `CRM_API_URL` (not a fixed `compass-crm`).
3. The CRM's API network is `internal` (no internet), so the website also joins the CRM's tunnel network for the Cloudflare Tunnel (and for
   outbound Gmail / Unsplash through the normal Docker egress). That tunnel network must **not** carry PostgreSQL; preflight refuses a network where a
   container answers to `db`. **On the live single-network layout from item 2 that rule fails by design** (PostgreSQL shares `compass-tools_internal`),
   so the website cannot be deployed there with this preflight. The owner must choose, outside this repository: (a) give the live CRM stack the
   release layout - a separate internal API network with the `compass-crm` alias and a tunnel network without PostgreSQL (a CRM Compose change); or
   (b) accept, knowingly, that the website shares a network with PostgreSQL. The website holds no database credential, but the network route would
   exist; (b) is not implemented here and would need an explicit, reviewed relaxation of the preflight rule.
4. `LEAD_INGEST_SECRET` (optional) is identical on both sides, or the CRM ignores the visitor context and records no IP or location.
5. The contact form and the newsletter use the CRM's **public, unauthenticated** endpoints, because no authenticated equivalent exists
   (`docs/CRM_API_INTEGRATION.md`, "Gaps"). They are rate limited by the CRM and by the website, but anyone who can reach the CRM can call them.

## 4. Networking

The service joins exactly two networks, both created and owned by the CRM project and declared `external: true` (compose refuses to start rather than
create an empty one):

| Network (default name, overridable) | Why the website joins it | Alias |
|---|---|---|
| `compass-tools-website-api` (`CRM_API_NETWORK_NAME`) | the private path to `compass-crm:3000` | none |
| `compass-tools_web` (`TUNNEL_NETWORK_NAME`) | so the existing `cloudflared` can reach the site as `bft-web:3000` | `bft-web` |

Not joined: the CRM's data network or any network that carries PostgreSQL. The website cannot resolve `db`, and holds no credential that would allow a
connection if it could. Docker reachability is not authentication: the CRM still requires the bearer key on its API.

`deploy/preflight.sh` (read-only) checks: both networks exist; a container answers to the host named by `CRM_API_URL` (default `compass-crm`) on the API network; no container answers to `db`
on either network; no other container answers to `bft-web`. `deploy/deploy.sh` records the other containers' ids and start times on both networks
before and after the deploy and refuses to report success if any changed.

## 5. Cloudflare Tunnel: owner-controlled routes

The tunnel receives its ingress remotely. This branch does not edit tunnel configuration, never reads, prints or rotates the tunnel token, and invents
no tunnel ID. After the website is running and healthy (section 8):

1. Cloudflare dashboard → Zero Trust → Networks → Tunnels → the existing tunnel → **Published application routes**.
2. **Add** two routes, nothing else: `businessflights.travel` → HTTP, `bft-web:3000`; and `www.businessflights.travel` → HTTP, `bft-web:3000`.
   Do not edit, reorder or delete the `compass-tools.com` route or the final catch-all 404; do not use a wildcard hostname.
3. A route needs no conflicting DNS record for the same name (section 11).
4. Verify (8.6) that `https://www.businessflights.travel/api/health` answers `{"status":"ok"}` and that `https://compass-tools.com/` still answers as before.

**Checks before the routes are enabled** (owner actions):
1. The website container is healthy, `verify.sh` passes, and `cloudflared` resolves and reaches `bft-web:3000` (8.6).
2. The tunnel configuration is captured first (screenshot/export of the published routes and the catch-all) so the previous state can be restored.
3. The DNS zone export is saved and no A/AAAA/CNAME conflicts with the two names. Mail records are not edited here.
4. The canonical host is confirmed. After enabling: request both hostnames and a 404 URL, confirm the apex answers 308 to `www`, and confirm
   `https://compass-tools.com/` behaves exactly as before.

## 6. Environment variables (names only; values are the owner's, in a `chmod 600` `.env` beside `compose.yaml`)

| Variable | Required | Placeholder / meaning |
|---|---|---|
| `CRM_API_KEY` | yes (compose refuses to start without it) | `<same-value-as-the-CRMs-WEBSITE_API_KEY>`, at least 32 characters |
| `CRM_COMPANY_ID` | yes | `<crm-company-id>` — used by the contact form and the newsletter only |
| `CRM_API_URL` | no | default `http://compass-crm:3000` |
| `LEAD_INGEST_SECRET` | no (recommended) | `<same-value-as-the-CRMs-LEAD_INGEST_SECRET>`, ≥ 32 characters; without it leads carry no visitor IP / location |
| `GMAIL_SENDER_EMAIL` | yes | `<the-single-gmail-address@example.com>` |
| `GMAIL_APP_PASSWORD` | yes | `<google-app-password>` |
| `CRM_API_NETWORK_NAME` | no | default `compass-tools-website-api` |
| `TUNNEL_NETWORK_NAME` | no | default `compass-tools_web` |
| `APP_VERSION` | no | image tag; `deploy.sh` sets it to the git short SHA |

Fixed in `compose.yaml`, deliberately not configurable from `.env`: `TRUSTED_PROXY=cloudflare`, `HOSTNAME`, `PORT`. **There is no database variable**:
`deploy/preflight.sh` refuses to continue if `DATABASE_URL`, `DIRECT_URL`, `DATABASE_SSL_*` or `DATABASE_AUTO_INIT` is present in `.env`. Previously used
and now removed: `DATABASE_URL`, `DIRECT_URL`, `DATABASE_SSL_MODE`, `DATABASE_SSL_CA`, `DATABASE_SSL_VERIFY`, `DATABASE_AUTO_INIT`, `CRM_NETWORK_NAME`.
`LEAD_INGEST_SECRET`, `GMAIL_SENDER_EMAIL` and `GMAIL_APP_PASSWORD` are still used. No build argument or build-time secret exists; nothing is read from
the environment during `docker build`. No script prints secrets. Do not paste `docker compose config` output anywhere — it expands secrets.

## 7. The CRM API from the operator's side

- **Credential.** The CRM operator generates the key (`openssl rand -hex 32`), sets it on the CRM as `WEBSITE_API_KEY`, and gives the same value to
  the website's `.env` as `CRM_API_KEY`. Rotation: the CRM accepts `WEBSITE_API_KEY_NEXT` during an overlap, then the website's value is changed and
  the website restarted (environment is read at process start). A leaked key is revoked on the CRM; the website then shows the friendly error until
  updated.
- **What a failure looks like.** The server log carries one value-free line per problem (`[crm-api] …`, `[submitFlightRequest] …`): variable *names*,
  CRM error codes and failing field *paths*, never a key, an address, a phone number or a message. 401/404 from the CRM means the key, the URL or the
  network is wrong; 5xx / timeouts are retried (same key, same body) up to 3 times before the visitor sees an error.
- **Idempotency.** The form's `submissionId` is the `Idempotency-Key`. A repeated submission is answered `duplicate` by the CRM and sends no second
  notification e-mail. Contact and newsletter requests are attempted once.
- **Nothing is queued.** If the CRM is down for longer than the retry window, the request is not stored anywhere on the website side; the visitor is
  told to try again or call. This is deliberate (no database fallback) — decision D1 below.

## 8. Runbook

### 8.1 Preflight (read-only, nothing changes)

```bash
deploy/preflight.sh
```

Checks the tools, the `.env` (mode, required CRM/Gmail values, key length, **no database variables**), both external networks, the answer of the
host named by `CRM_API_URL` (default `compass-crm`) on the API network, the absence of any `db` on either network, and the `bft-web` alias. It starts, stops and changes nothing.

### 8.2 Owner approval and configuration (before anything is built)

Confirm: the CRM release with the website API (and its migration, section 3) is live; `WEBSITE_API_KEY` / `WEBSITE_API_COMPANY_ID` exist there; the
real network names (`docker network ls`); the canonical host; the decisions in section 13. Then create `.env` from `.env.vps.example` with `chmod 600`.

### 8.3 Backups

The website holds no data, so it has no database backup. Take the CRM's own backups before the CRM migration in section 3 (that is the CRM
owner's runbook). Keep a copy of the `.env` in the owner's password manager.

### 8.4 Image build

Part of `deploy/deploy.sh`: `docker compose -p business-flights-travel build bft-web` for the checked-out clean commit. No secret is used or baked
in; a failed build leaves the running container untouched.

### 8.5 Website-only deployment

```bash
deploy/deploy.sh      # preflight → refuses a dirty tree → records the other containers' ids and start times → tags the running image as :previous
                      # → build bft-web → up -d --no-deps bft-web → waits for "healthy" → verify.sh → confirms the CRM, db and tunnel containers are unchanged
```

It runs no SQL and no migration. Nothing it issues is `down`, `rm`, `stop`, `restart`, `volume` or `prune`.

### 8.6 Health and functional verification

`deploy/verify.sh` (also run by deploy): container running and healthy, no host ports, non-root, then from inside the container on loopback:
`/api/health` 200 + `no-store`, home 200 with an `<h1>`, `robots.txt` naming the sitemap, `sitemap.xml` with > 100 URLs, two unknown URLs returning a
real **404**, `/flights?to=GRU` canonical `/flights`. Then owner-run, **before adding tunnel routes**:

```bash
docker exec business-flights-travel-bft-web-1 getent hosts compass-crm bft-web    # the host in CRM_API_URL (default compass-crm) must resolve; `getent hosts db` must print nothing
```

After the routes exist: `curl -sI https://www.businessflights.travel/`, `curl -s https://www.businessflights.travel/api/health`,
`curl -sI https://businessflights.travel/` (308 → www), a 404 URL, and `curl -sI https://compass-tools.com/` unchanged. Then submit **one real test
flight request, one contact message and one newsletter sign-up** from a browser and confirm in the CRM: the lead with its IP/location and queue
assignment, the contact inquiry, the subscriber, and the notification e-mail. This is the only proof that the key, the network and the CRM release
work together; repeat the flight request once with the same page open to see the duplicate handling.

### 8.7 Rollback

```bash
deploy/rollback.sh previous        # or: deploy/rollback.sh <git short sha>
```

Recreates only `bft-web` from an already-built image with `--no-build` and verifies the other containers were not touched. It deletes no image,
volume or data. If routing is the problem, remove the two published routes in Cloudflare (owner) — the CRM is unaffected.

## 9. Canonical host and apex

The site declares `https://www.businessflights.travel` as canonical. `next.config.ts` redirects only the exact host `businessflights.travel` (anchored,
dot escaped) to `https://www.businessflights.travel/<same path>` with **308**, query string preserved; `www`, `localhost`, `bft-web:3000` and
look-alikes are not redirected, so there is no loop. The apex must reach the application (route in section 5), because the redirect is
application-side. Probes use the internal name.

## 10. Visitor IP and location

- `TRUSTED_PROXY=cloudflare` (fixed in compose) reads **only** `CF-Connecting-IP`; `X-Forwarded-For`, `X-Real-IP`, `Forwarded` and Vercel headers are
  ignored. This is safe only because the origin is reachable only through the tunnel (no published port). Anything else on the shared tunnel network
  could forge it; that is the residual risk of a shared network.
- **Location is optional, untrusted, approximate metadata.** `CF-IPCountry` is present when Cloudflare proxies (`XX` and `T1` are not countries and are
  dropped). City/region/timezone arrive only if the owner enables **Rules → Managed Transforms → "Add visitor location headers"**.
- **How it reaches the CRM.** The website signs the IP and location with `LEAD_INGEST_SECRET` and sends them as `x-ct-visitor-context` /
  `x-ct-visitor-signature` on the flight request (`docs/CRM_API_INTEGRATION.md`). The CRM validates the signature, stores them in its permission-gated
  lead section, and labels the location source with its own (Vercel) label. The website stores nothing. The notification e-mail carries them too.
- **Privacy:** the full IP address and approximate location are personal data (UK/EU GDPR and similar). The owner must mention the collection in the
  privacy policy and define a retention period and deletion path **in the CRM**, and decide whether the CRM shows the IP unmasked.
- **Rate limits use the same trusted client IP** (flight request 8, contact message 8, newsletter 6, per 10 minutes). A request with no usable trusted
  IP shares one fixed `unresolved` bucket; the log line `[rate-limit] no trusted client IP (<reason>)` means `TRUSTED_PROXY` or the tunnel route is
  wrong. The real test submission in 8.6 (the lead must carry the visitor's IP) catches this before launch.
- **Not verified in production:** that Cloudflare strips a forged client `CF-Connecting-IP` (documented behaviour; check with
  `curl -H 'CF-Connecting-IP: 203.0.113.9' https://www.businessflights.travel/…` and compare the stored IP to your own).

## 11. DNS and email (owner-controlled; nothing here changes them)

No MX, SPF, DKIM, DMARC, A, AAAA or CNAME value is invented in this repository. Evidence needed to recover the original configuration: a Cloudflare
zone export and the nameservers actually set at the registrar (an earlier outage showed NXDOMAIN for `www`); full headers of a recent e-mail to/from
the domain identifying the provider and selector; the mail provider's admin console. The website's notification mail uses Gmail SMTP
(`GMAIL_SENDER_EMAIL`). Before adding the tunnel routes, confirm no existing A/AAAA/CNAME for those two names conflicts.

## 12. What was and was not tested

Source: this checkout, built and tested in an isolated worktree (`NEXT_OUTPUT=standalone` production build, Node from the local machine).

### 12.1 Run and passed

Final run on this tree before the commit, all with exit code 0:

| Check | Result |
|---|---|
| `npx tsc --noEmit` | passed |
| `npx eslint .` | passed |
| `NEXT_OUTPUT=standalone npm run build` (229 static pages, `.next/standalone/server.js` present; no database variable, no Prisma) | passed |
| `playwright test --project=Infrastructure --no-deps --workers=1` | **106 passed**, 0 failed — CRM client and config (`crm-api-client`), the three server actions on the production build against the stub CRM (`crm-api-actions-e2e`), the browser flow (`self-hosted-e2e`), rate limits (`rate-limit-actions-e2e`), deploy scripts with a stubbed Docker (`deploy-scripts`), container-file static checks and visitor IP / Cloudflare location (`vps-deployment`) |
| `playwright test --project="Desktop Chrome"` for `flight-request-notification`, `submission-ip`, `anti-spam`, `rate-limit-client`, `smtp-helpers`, `related-destinations` | **167 passed**, 0 failed |
| `playwright test --project="Desktop Chrome"` for `seo`, `error-boundaries` against the production build (`TEST_BASE_URL`) | **37 passed**, 0 failed |

Not re-run after this change (files untouched by it, they need a dev server on port 3100): `accessibility.spec.ts`, `redesign.spec.ts` and the
mobile viewport projects.

### 12.2 Not run / not verifiable here

- **The Docker image build, `docker compose config/up`, the real Docker networks and the Cloudflare Tunnel** — Docker was not available. The
  container files were checked by static tests only; the production build was started directly as a standalone Node server instead.
- **A real CRM.** The CRM release was not run. The contract (authentication, strict body, `Idempotency-Key`, fingerprint 409, `Retry-After`, signed
  visitor context, the two public endpoints) was read from the CRM repository at `4d33c29` and re-implemented in `tests/support/stub-crm.ts`. The
  tests prove the website behaves correctly against that contract; they cannot prove the CRM behaves as its documentation says, or that the
  production CRM runs this release. The isolated CRM test database that has `20261016000100_lead_ingest_fingerprint` applied proves nothing about
  the website.
- **Gmail delivery**, **real Cloudflare headers**, **real DNS**, anything in production.

### 12.3 Commands to run where Docker exists (NOT TESTED; none touches production)

```bash
# 1. Compose file renders (create throw-away networks first, with the default names or your overrides)
docker network create --internal compass-tools-website-api && docker network create compass-tools_web
CRM_API_KEY=x CRM_COMPANY_ID=x GMAIL_SENDER_EMAIL=x GMAIL_APP_PASSWORD=x docker compose -p bft-check config -q
# 2. Build the real image (no secrets are used or needed)
docker build -t bft-check .
# 3. Clean up only these throw-away resources
docker rmi bft-check; docker network rm compass-tools-website-api compass-tools_web
```

## 13. Outstanding owner decisions and blockers

| # | Item | Why it matters |
|---|---|---|
| D1 | **No database fallback**: when the CRM is unreachable the request is not stored | Deliberate. Accept it, or give the CRM a durable intake path (a queue) — never a website database. |
| D2 | **Contact and newsletter use the CRM's unauthenticated public endpoints** | Needs the authenticated, idempotent endpoints in `docs/CRM_API_INTEGRATION.md` ("Gaps"); a CRM change. |
| D3 | **CRM release + migration `20261016000100_lead_ingest_fingerprint`** must be live | Otherwise every flight request fails. CRM owner's deployment. |
| D4 | Real network and alias names on the live VPS | The live compose differs from Git; confirm with `deploy/preflight.sh` output. |
| D5 | Canonical host (`www`) and apex routing | Section 9. |
| D6 | `LEAD_INGEST_SECRET` on both sides | Without it leads carry no visitor IP / location. |
| D7 | Cloudflare "Add visitor location headers" transform and the privacy policy / retention for IP data | Section 10. |

## 14. Updating the base image

Pinned by version and digest. To update: pick a new patch release of the same major, read its digest from Docker Hub, change `NODE_IMAGE` in a
reviewed commit (keep it equal to the CRM's pin), rebuild, run `npm run test:infra`, then `deploy/deploy.sh`. A rebuild without a change does not pick
up OS security updates; schedule a periodic review.
