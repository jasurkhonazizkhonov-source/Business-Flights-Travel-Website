# Website: production deployment compatibility audit (2026-11-13)

Audit only. **No VPS, CRM, database, Cloudflare setting, container, image or environment file was contacted, read or changed.** Every statement about the live system is either taken from the repository's own
documentation (and labelled *reported*) or derived from the two Compose files; nothing was observed on the VPS. Nothing was deployed.

## 1. Decision

**NOT deployable today as a "website-image-only replacement".** The updated website's code, image definition and service identity are compatible with the existing structure, but it is **not** a drop-in replacement
because it needs inputs the live environment does not provide: two new required environment variables, a reachable CRM that serves the website API, and a Docker network layout that the repository itself cannot confirm
the VPS has. Each is listed below with the smallest adaptation; none was applied. Because of this, release condition 14 in the GitHub gate is **not** satisfied (`WEBSITE_GITHUB_RELEASE_VERIFICATION.md`).

## 2. What the production architecture is believed to be (reported, unverified)

| Item | Source | Value |
|---|---|---|
| Website checkout / project / service | original `docs/DEPLOYMENT_VPS.md` ("reported from the VPS on 2026-10-16") | `~/apps/Business-Flights-Travel-Website-release`, Compose project `business-flights-travel`, service `bft-web`, container `business-flights-travel-bft-web-1`, image `business-flights-web:local` |
| Internal port / tunnel target | same | 3000; `http://bft-web:3000` |
| Network | same | `compass-tools_internal` (shared with the CRM app, `db`, `cloudflared`) |
| Database access | same | `DATABASE_URL` to the CRM's PostgreSQL `db` with a least-privilege role (the website writes directly) |
| CRM stack | same | project `compass-tools` in `~/apps/Compass-Tools` (+ a release checkout), services `db`, `app`, `cloudflared`, volume `postgres_data` |

These are historical reference points, not proof of the current state.

## 3. What the updated website preserves, changes and removes

| Aspect | Original | Updated | Compatible? |
|---|---|---|---|
| Compose project / service / image name / container name | `business-flights-travel` / `bft-web` / `business-flights-web:${APP_VERSION:-local}` | identical | yes |
| Internal port, `HOSTNAME`, `TRUSTED_PROXY` | 3000, `0.0.0.0`, `cloudflare` | identical | yes |
| Network alias and tunnel target | `bft-web` | identical | yes |
| Restart policy, `init`, memory/CPU/pids limits, `cap_drop`, `no-new-privileges`, `tmpfs`, grace period, log rotation | as listed | identical | yes |
| Published ports | none | none | yes |
| Base image | `node:24.21.0-bookworm-slim@sha256:d6aa...` | identical digest | yes |
| Start command, user | `node server.js`, `node` (non-root) | identical | yes |
| Health check | `scripts/healthcheck.mjs` -> `GET /api/health` = 200 `{"status":"ok"}` (never touches the database) | identical contract; no CRM call | yes |
| Volumes | none | none | yes |
| Database | `DATABASE_URL`, TLS settings, runtime role | none; the container receives no database variable | **changed (intended)** |
| Networks | one external network (`CRM_NETWORK_NAME`, default `compass-tools_internal`) | two external networks (`CRM_API_NETWORK_NAME` default `compass-tools-website-api`, `TUNNEL_NETWORK_NAME` default `compass-tools_web`) | **conflict, see 5** |
| CRM reachability | none (direct database) | `CRM_API_URL` default `http://compass-crm:3000` | **new requirement, see 6** |

## 4. Environment variables (names only; no value was read)

| Variable | Original | Updated | Note |
|---|---|---|---|
| `GMAIL_SENDER_EMAIL`, `GMAIL_APP_PASSWORD` | required | required | unchanged: existing values are reused |
| `DATABASE_URL`, `DATABASE_SSL_CA`, `DATABASE_SSL_VERIFY`, `DATABASE_SSL_MODE`, `DATABASE_AUTO_INIT` | required / set by compose | **not used** | compose has no `env_file`, so leftover entries in `.env` are not passed to the container |
| `CRM_API_KEY` (>= 32 chars) | - | **required** (compose refuses to render without it) | equals the CRM's `WEBSITE_API_KEY` |
| `CRM_COMPANY_ID` | - | **required** | the CRM company used by contact and newsletter |
| `LEAD_INGEST_SECRET` (>= 32 chars) | - | optional | without it leads carry no visitor IP/location; the new privacy text describes that record |
| `CRM_API_URL`, `CRM_API_NETWORK_NAME`, `TUNNEL_NETWORK_NAME` | `CRM_NETWORK_NAME` | optional overrides | defaults are the CRM release layout |

**Rule applied:** the existing production environment is the source of truth and must not be deleted, regenerated or overwritten. `CRM_API_KEY` and `CRM_COMPANY_ID` are *newly required* variables that the existing environment cannot contain (the old website never called the CRM API). Per the preservation rule this is a **stop-and-report** item: the deployment cannot proceed until the owner supplies them (their values originate in the CRM's `WEBSITE_API_KEY` and `WEBSITE_API_COMPANY_ID`). No value was invented.

**Preflight conflict (investigated, not worked around).** `deploy/preflight.sh` stops with an error if any `DATABASE_*` variable is present in `.env`. That check is a local policy, not a technical need: the container never receives those variables, and removing them would also remove what the **previous** image needs for a rollback. Deleting production variables to satisfy a script is exactly what must not happen. Recommended adaptation (a code change in the repository, needs your approval, not made): downgrade that check from an error to a warning that says "unused by this version; kept for rollback; remove after final cleanup is approved".

## 5. Docker networks and CRM hostname: the one real structural conflict

* The original website joined **one** external network, `compass-tools_internal`, shared with PostgreSQL and the tunnel.
* The updated Compose file joins `compass-tools-website-api` (internal network carrying only the CRM app, alias `compass-crm`) and `compass-tools_web` (the tunnel's network). Both names and the alias **are** defined by the CRM's own Compose file in its repository (`website_api` with a fixed name, `web` in project `compass-tools`), so the pair is internally consistent.
* **Neither CRM Compose file defines `compass-tools_internal`.** If the live CRM stack was created from an older layout that does, the two layouts disagree. Whether the VPS has `compass-tools-website-api` and the alias `compass-crm` is **unknown**.

| Option | What it needs | Preserves existing structure? | Risk |
|---|---|---|---|
| A. Use the repository's layout (defaults) | the CRM stack redeployed/recreated with `website_api` and `web`; env unchanged | no (new networks, CRM stack change) | the live website loses its database and tunnel route when the CRM stack's networks change; a coordinated window |
| B. Adapt the website to what exists | set `CRM_API_NETWORK_NAME`, `TUNNEL_NETWORK_NAME` and `CRM_API_URL` (three additive `.env` entries) to the existing shared network and the CRM's service name on it | **yes** (no new network, no CRM change) | the website then shares a network with PostgreSQL (it has no credentials for it); the preflight's "no `db` name resolves" check would have to be relaxed; two network keys naming the same external network is **unverified** (Docker is not available here) |
| C. Add a private API network only for the website, leave the tunnel network as is | CRM change (new network) | partly | CRM stack change |

Recommendation: decide A or B only after the read-only VPS facts below. B is the closest to "replace only the website container" but is a conscious reduction of the website's network isolation and must be tested with Docker first.

## 6. CRM API compatibility with the existing live CRM (CRM-first is required only for one form)

| Form | Endpoint | Exists in an older CRM? | Needs a new CRM release? |
|---|---|---|---|
| Flight request | `POST /api/v1/website/flight-inquiries` (Bearer key, `Idempotency-Key`) | **no** (introduced with the website API) | **yes**: the route, `WEBSITE_API_KEY`, `WEBSITE_API_COMPANY_ID` and the table `LeadIngestFingerprint` (migration `20261016000100`) must exist on the live CRM. *Reported* on 2026-10-16 as "not merged, not deployed"; the current CRM repository has it merged, but its deployment is unknown |
| Contact | `POST /api/public/contact-inquiry` | yes | no. `submissionId` is ignored by an older CRM (previous behaviour); full idempotency needs the new CRM |
| Newsletter | `POST /api/public/subscribe` | yes | no |

Consequence: **a website-only release against a CRM without the website API would break the flight request form** (visitors see the friendly error) while contact and newsletter keep working. So the CRM must already serve the API (verify read-only on the VPS: image/commit, migration list, whether the API key is configured) or be released first. This is derived from the contract, not assumed. The alternative of adapting the website to the older public lead endpoint would drop company scoping and idempotency guarantees and is not recommended.

## 7. Image build, runtime and static assets

* Production standalone build (`NEXT_OUTPUT=standalone npm run build`): **succeeded** in this audit; the image's `runner` stage copies `.next/standalone`, `.next/static`, `public` and `scripts/healthcheck.mjs`.
* `docker build`: **not run** (Docker is not installed on this machine). The Dockerfile is the original's with Prisma/OpenSSL removed; the base digest is unchanged, so no new base-image risk.
* The standalone server was started by the infrastructure tests exactly as the Docker layout does (no `.env`, no sources); they pass (see `WEBSITE_GITHUB_RELEASE_VERIFICATION.md` for counts).
* Next.js 16.4.2 requires Node >= 20.9; the image pins 24.21.0.

## 8. Rollback compatibility

`deploy/deploy.sh` tags the running image `business-flights-web:previous` only when that container is healthy; `deploy/rollback.sh` returns to it. For a rollback to work the following must still exist when it is needed: the old image (do not prune), the old `compose.yaml` and the **unchanged `.env`** (the old image needs `DATABASE_URL`), the old network, and the database role. Rollback does not touch PostgreSQL or CRM data. Recommended before any deployment: copy the current `compose.yaml` and `.env` aside on the VPS, record `docker inspect` of the container (image id, networks, restart policy, health), and run the old image once from the copy to prove it restores.

## 9. Pre-deployment gate (the brief's section 6) - status

| Check | Status |
|---|---|
| Updated production build succeeds | pass |
| Existing VPS environment inspected | **not done** (no VPS access) |
| Required environment variables present | **not satisfied**: `CRM_API_KEY`, `CRM_COMPANY_ID` are new and must come from the owner |
| Next.js runtime / Docker image compatibility | pass in source; **Docker build unverified** |
| Container start command, internal port, health-check URL | compatible |
| Docker network names | **unverified / possible conflict** (section 5) |
| CRM API hostname and authentication | **unverified** on the VPS |
| Website-to-CRM request compatibility | verified statically and against stand-ins (`WEBSITE_FUNCTIONAL_AND_API_COMPATIBILITY_AUDIT.md`) |
| Cloudflare Tunnel routing | unchanged target `http://bft-web:3000`; tunnel connector must be on the chosen network |
| Current image and configuration backed up; rollback proven | **not done** (no VPS access) |
| Explicit user approval | **not given** |

## 9a. Read-only VPS facts to collect before any deployment decision (none collected)

`docker ps` and `docker inspect` of the website container (image id and tag, container id, Compose project and service, environment-variable *names*, networks, port mappings, health, restart policy, labels with the deployed commit); `docker network ls` and the members of each `compass-tools*` network; the CRM's image/commit, `prisma migrate status`, whether `WEBSITE_API_KEY` is set (name only), the live company id; whether `business-flights-web:previous` exists; free disk/memory; the Cloudflare cache rules for HTML.

## 10. Differences that could prevent a safe release (summary)

1. New required variables (`CRM_API_KEY`, `CRM_COMPANY_ID`) are not in the existing environment.
2. Preflight refuses leftover `DATABASE_*` variables that the rollback path still needs.
3. Network layout (`compass-tools_internal` versus `compass-tools-website-api` + `compass-tools_web`) is unverified and may differ.
4. The flight form needs a CRM that already serves the website API.
5. The Docker image has not been built in this audit.
6. Legal and consent wording is unreviewed (separate gate).

**Confirmation:** production was not deployed, restarted, inspected or modified; no environment file, database, Cloudflare setting or CRM was touched.
