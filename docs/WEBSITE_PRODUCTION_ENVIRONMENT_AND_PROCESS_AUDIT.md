# Production environment and process audit

Date: 2026-11-15. **No production process, container, log or environment was inspected** (no authorised VPS access in this session; Docker not installed locally). This report therefore separates: (a) what the **source and configuration files require** (verified here), (b) what the **public requests** showed about the live processes, and (c) what remains **NOT VERIFIED - VPS-side**. No value of any variable appears here or was read; names only.

## 1. Variable inventory (redacted)

"Verified" means checked in source, in compose or by a local test. **No variable's presence in production was verified.**

### Website (updated release)

| Variable | Required / optional | Build / runtime | Purpose | Verified (source and tests) | Production |
|---|---|---|---|---|---|
| `CRM_API_URL` | required (compose default `http://compass-crm:3000`) | runtime | origin of the CRM, private network | http(s) origin only, no credentials, path or query | NOT VERIFIED |
| `CRM_API_KEY` | required for flight requests | runtime | bearer credential, equals the CRM's `WEBSITE_API_KEY`, at least 32 characters | app, compose (`:?`), preflight | NOT VERIFIED |
| `CRM_COMPANY_ID` | required for contact and newsletter | runtime | CRM company id placed in the body of the two public calls | app, compose (`:?`), preflight | NOT VERIFIED |
| `LEAD_INGEST_SECRET` | **optional** | runtime | signs the visitor IP and approximate location (flight **and** contact); equals the CRM's value, at least 32 characters | app, preflight (warns if unset, fails if short) | NOT VERIFIED; **see section 4** |
| `TRUSTED_PROXY` | set by compose to `cloudflare` | runtime | the only way visitor IP and Cloudflare location are believed | `client-ip.ts`, compose | NOT VERIFIED |
| `GMAIL_SENDER_EMAIL`, `GMAIL_APP_PASSWORD` | compose and preflight require them (as the original release did); the mailer treats them as optional | runtime | internal flight-request notification by SMTP | compose, mailer | NOT VERIFIED |
| `PORT`, `HOSTNAME`, `NODE_ENV` | image / compose | runtime | listen on 3000 on all interfaces, production mode | Dockerfile, compose | NOT VERIFIED |
| `NEXT_OUTPUT`, `NODE_OPTIONS` (heap 3072 MB build, 768 MB run) | image | build / runtime | standalone output, memory cap | Dockerfile | NOT VERIFIED (image never built here) |
| `CRM_API_NETWORK_NAME`, `TUNNEL_NETWORK_NAME`, `APP_VERSION` | optional | deploy scripts | names of the two external networks; image tag | `deploy/common.sh` | NOT VERIFIED |
| `PREFLIGHT_ALLOW_LEGACY_DATABASE_VARS` | **never in `.env`**; shell only | deploy time | explicit per-run tolerance of the previous release's `DATABASE_*` | tested (`deploy-scripts.spec.ts`) | n/a |
| `DATABASE_URL`, `DIRECT_URL`, `DATABASE_SSL_*`, `DATABASE_AUTO_INIT` | **must not be used by the website** | - | the previous release's database access | the updated website reads none of them; compose does not forward them | probably present in the live `.env` (the previous release's compose requires `DATABASE_URL`) |

No `NEXT_PUBLIC_*` variable exists. No build-time variable is a secret: the Dockerfile contains no `CRM_*`, no database and no mail setting, and a test forbids `ARG`/`ENV` for secrets.

### CRM (read from source only; the CRM was not modified)

| Variable | Purpose | Note |
|---|---|---|
| `WEBSITE_API_KEY` | the credential the flight route checks (equal to the website's `CRM_API_KEY`); at least 32 characters, otherwise "not configured" (503) | required for the flight route |
| `WEBSITE_API_COMPANY_ID` | the company the credential files leads under; also the value the website puts in `CRM_COMPANY_ID` | must be identical on both sides |
| `WEBSITE_API_ALLOW_PUBLIC_ROUTE` | lets the flight route answer requests that arrived through the public hostname (default: refuse with 404) | should stay unset: the website uses the private route |
| `LEAD_INGEST_SECRET` | verifies the signed visitor context; equal to the website's; at least 32 characters | without it the CRM ignores a visitor context and records no IP or location |
| `TRUSTED_PROXY` | which proxy headers the CRM believes for its own public visitors | independent of the website's setting |
| `DATABASE_URL` (and TLS settings) | the CRM's own database access | the website must never receive it |
| `CRON_SECRET` | authorises the detailed `/api/health` report and cron routes | not a website variable |

## 2. Consistency between source, configuration and documentation (verified)

* Names in `compose.yaml`, `.env.vps.example`, `docs/ENVIRONMENT.md`, `src/lib/crm-api/config.ts` and the CRM's website-API code agree (`CRM_API_KEY` is the CRM's `WEBSITE_API_KEY`; `CRM_COMPANY_ID` is its `WEBSITE_API_COMPANY_ID`; `LEAD_INGEST_SECRET` is shared).
* Compose passes only the variables it lists; nothing from `.env` reaches the container by accident, so a legacy `DATABASE_URL` in `.env` is not seen by the website process.
* Secrets reach the browser nowhere: no `NEXT_PUBLIC_*`, the credentials module is `server-only`, and `.next/static` contains none of the secret names.
* Fixed in this pass: documentation of the newsletter route name (`/api/public/subscribe`), and the deployment document no longer states the server address (see the public-repository review).
* Not checkable here: missing variables, wrong container, inconsistent company id or API URL **in production**.

## 3. Process and runtime state (what could and could not be established)

| Question | Status |
|---|---|
| Website container running, healthy, restart loops, image version, Node version, standalone mode | **NOT VERIFIED.** From outside only: the live site answers 200 and `/api/health` answers `{"status":"ok"}` (a liveness answer; the health route deliberately does not call the CRM, so it says nothing about the CRM) |
| CRM container running and healthy | The CRM answers its anonymous health check with `ok` and a database check `ok` (public `GET`). Container-level state, restarts and logs are NOT VERIFIED |
| Connection pool | The live CRM health response reports a pool maximum of 2 connections (a deliberate small setting per the CRM's own comments, because the database's connection limit is small). With several concurrent form submissions this is a capacity limit to keep in mind; not tested |
| Application logs, CRM connection failures, memory or disk pressure, log rotation | **NOT VERIFIED** (no log access). The updated image caps the Node heap at 768 MB inside a 1 GB container limit with log rotation configured in compose; unverified in production |
| Health checks reflect readiness | By design the website's check is liveness only. It would report healthy while the CRM is down; that is intentional (a CRM outage must not restart the website) and is covered by the failure tests |
| Secrets available only to the server process | By construction yes (see section 2); production not inspected |

## 4. `LEAD_INGEST_SECRET`: consequences of enabling or leaving it unset (decision for you; not enabled, not changed)

| | Unset (the safe default) | Set, identical on both sides |
|---|---|---|
| Flight request | still created; **no IP or location** recorded | IP and approximate location recorded with the lead and shown to authorised CRM staff; coordinates appear only in the internal e-mail |
| Contact message | still created; no IP or location | the same, recorded in the CRM's "Get In Touch" inbox (Admin only, IP masked, reveal audited) |
| Privacy Policy | the sentence about IP and location **over-states** what happens (nothing is recorded) | the sentence is accurate |
| Preflight | warns | passes (fails if shorter than 32 characters) |
| Security | nothing signed | the signed context has the replay and body-binding limits in `WEBSITE_REQUEST_SIGNING_AND_REPLAY_PROTECTION_AUDIT.md` |

Recommendation: **leave it unset until the privacy wording is attorney-reviewed**, then enable it on both sides together. Enabling it on only one side is harmless (a one-sided secret just means nothing is believed), but it records nothing.

## 5. The shell-only preflight opt-in: still safe and still necessary?

**Necessary** only for the first redeploy over the previous release, whose live `.env` almost certainly holds `DATABASE_URL`, and for the rollback window (the previous image's compose requires it). **Safe**: default unchanged (refuse), exact value `yes` only, read from the operator's shell never from `.env`, value-free warning naming the variables, and it still refuses if the rendered compose would forward a database variable. It should be **removed** from use once the rollback window ends and the legacy variables are deleted from `.env`. It does not weaken the network-boundary check, which is independent.

## 6. What is needed to close this audit

A read-only look at the VPS by the owner (or authorised access for a later session): `docker ps`, `docker inspect` (image, health, restart policy, environment **names**), `docker network inspect` (aliases only), the CRM and website logs for CRM connection errors (redacted), and the names (not values) present in the live `.env` files. The preflight script performs the network part read-only.
