# Production Docker network audit

Date: 2026-11-15. **No VPS, SSH or Docker access was available in this session** (Docker is not installed on this machine, there is no SSH configuration and no key, WSL has no distribution). Therefore nothing about the real containers, networks, aliases, ports, health or logs was observed. Everything below is derived from the repositories' own documentation and scripts (historical, "reported from the VPS on 2026-10-16, not re-checked"), from public anonymous requests, and from tests against a fake `docker`. Nothing was changed on any server. This repository is public: no address, container ID or secret is written here.

## 1. What is known, and from where

| Question | Answer | Basis |
|---|---|---|
| Where is the live website served? | Behind **Cloudflare** (DNS resolves to Cloudflare addresses, `Server: cloudflare`, a `cf-ray` header) from a **Next.js** app | public `HEAD` request |
| Which release is live? | An **old, database-backed** release: it still shows the previous telephone number, e-mail address and street address, has no shared JSON-LD `@id`s, and still sends `X-Powered-By: Next.js`. It has `/api/health` answering `{"status":"ok"}` and a robots file that disallows `/api/`, which the `main` branch does not have | public `GET`s compared with every remote branch's source |
| Which branch is live? | **Live deployment branch: NOT VERIFIED - USER CONFIRMATION REQUIRED.** The public fingerprint (contact details identical to `main`, `feature/vps-website` and the API-only branches; `/api/health` and `Disallow: /api/` present only from `feature/vps-website` on) is consistent with `feature/vps-website`, and the open pull request #1 targets that branch, but a fingerprint is not a deployment record | read-only comparison |
| Do website and CRM share a Docker environment? | The repository documents a VPS (OVH, Ubuntu) running the CRM stack under Compose project `compass-tools` with a Cloudflare Tunnel; the website was designed to be a **separate** Compose project (`business-flights-travel`, service `bft-web`) joined to the CRM's networks. Whether that is how the live (old) website runs, or whether it is hosted elsewhere, is **not verifiable** from here | `docs/DEPLOYMENT_VPS.md` (historical) |
| Does the website call the CRM over an internal network or a public URL? | The **updated** website: private in-network URL by design (`CRM_API_URL`, default `http://compass-crm:3000`); the CRM's flight route actually **refuses** a request that arrives through the public hostname. The **live (old)** website talks to the database directly and does not use the CRM API at all | source; public fingerprint |
| Reverse proxy or tunnel | A **remotely managed Cloudflare Tunnel** (`cloudflared`), ingress for `compass-tools.com` to the CRM; the website's own ingress is added by the owner in the Cloudflare dashboard (the repo never edits it) | `docs/DEPLOYMENT_VPS.md` |
| Does the live deployment differ from the updated source? | **Yes, substantially**: architecture (database-backed against API-only), contact details, structured data, headers, forms | public fingerprint against the review branch |

## 2. The two layouts the documents describe

| | Release layout (CRM repo, commit `4d33c29`) | Live layout as last reported (2026-10-16) |
|---|---|---|
| Networks | `compass-tools-website-api` (internal, CRM only), `compass-tools_web` (tunnel), `compass-tools_data` (database only) | one network, `compass-tools_internal`, carrying the CRM app, PostgreSQL and `cloudflared` |
| CRM name for the website | alias `compass-crm` on the API network | service name `app` |
| Website's route to PostgreSQL | none (never joins `data`) | **yes**, if it joins the single network |
| Preflight result | passes | **fails** (database container on the website's network) |

## 3. Is the preflight rule a protection or a misjudgement?

**It is a legitimate security protection, and on the live single-network layout it fails correctly.** The architecture is website, then authenticated CRM API, then CRM database. The website has no database credential, but putting it on the same Docker network as PostgreSQL gives it a network route to the database, which the design forbids (defence in depth: if the website were ever compromised, the database port would be reachable). The "overly broad network name" explanation does not apply: the rule is about a real property, not a name.

**But the rule was weaker than its purpose, and that was a defect.** It identified the database only by the alias `db`. A PostgreSQL container named anything else (for example `postgres`, `pgbouncer` or a custom name) shared a network with the website and passed. **Fixed in this pass** (`deploy/preflight.sh`, tested in `tests/deploy-scripts.spec.ts`): a container on either of the website's networks now also counts as a database when its alias is `db`, `postgres`, `postgresql` or `pgbouncer`, or when its **image** is PostgreSQL, PostGIS, pgvector, TimescaleDB, PgBouncer or Pgpool. The check was not disabled or loosened: it can now refuse more than before, and an ordinary container (a sidecar, a connector) is still accepted. New tests cover: image-only disguise, three other alias names, and an ordinary container that must pass. **Known remaining limit:** a database under an unrelated alias and an unrecognised image would still not be detected by name or image; a port-based check (`5432` exposed) was left out because it cannot be exercised with the fake docker. The authoritative control remains the network topology below.

## 4. Required change to deploy the updated website (not made; needs your approval)

The preflight failure on the live layout is a **topology problem, not a script problem**. Two ways, both outside this repository and both production changes:

**Option A (preferred, matches the release layout):** give the CRM stack the layout in its own repository: an internal API network on which the CRM app answers as `compass-crm`, a tunnel network without PostgreSQL, a data network for PostgreSQL only. This is a change to the CRM's Compose project and needs a CRM restart, therefore a planned release.

**Option B (no CRM Compose edit, but not persistent):** create two small networks and connect only the two containers that must talk to the website, without touching the database container:

```
docker network create --internal bft_crm_api
docker network create bft_tunnel
docker network connect --alias compass-crm bft_crm_api <crm-app-container>
docker network connect bft_tunnel <cloudflared-container>
```
and in the website's `.env`: `CRM_API_NETWORK_NAME=bft_crm_api`, `TUNNEL_NETWORK_NAME=bft_tunnel`, `CRM_API_URL=http://compass-crm:3000`. The website then never shares a network with PostgreSQL. **Caveat:** `docker network connect` is lost when a container is recreated, so it must be repeated (or moved into Compose) after any CRM or tunnel redeploy. Neither command was run.

**Not acceptable:** relaxing the preflight so the website may share the single network with PostgreSQL, unless you knowingly accept the route and the rule is replaced by a reviewed, narrower one.

## 5. Website-to-CRM route checklist (all NOT VERIFIED here; the preflight verifies them read-only on the VPS)

1. The hostname in `CRM_API_URL` resolves from the website container.
2. The CRM listens on port 3000 inside the network (documented; not observed).
3. The CRM container carries that alias on the network the website joins.
4. No container on the website's networks is a database (now image-aware).
5. Nothing else answers to `bft-web`.
6. The CRM's published ports do not expose PostgreSQL (not observable from outside; the public hostname serves only the CRM app).

## 6. What the public requests could and could not show

They show the CRM is reachable through Cloudflare, healthy, and that the three routes are registered. They cannot show networks, aliases, internal ports, container health, restart policies, resource limits, environment-variable names or logs.
