# Website environment and deployment configuration audit

Date: 2026-11-15. Source: the repository only. No VPS, production `.env`, Docker network, Cloudflare setting or CRM instance was read or changed. No value of any secret appears in this report or was printed during the work. "Verified" below means verified in the repository or by the local test suites; production facts are marked **NOT VERIFIED - VPS-side**.

## 1. Environment variable checklist (names only)

Everything the website reads from the environment, found by searching `src/`, `next.config.ts` and `scripts/` and by reading `compose.yaml`, the `Dockerfile` and `deploy/*`.

| Variable | Needed when | Required? | Server-only? | Validated by | Notes |
|---|---|---|---|---|---|
| `CRM_API_URL` | runtime | yes (compose default `http://compass-crm:3000`) | yes | `parseCrmBaseUrl`: http(s) origin only, no credentials, no path/query/fragment; preflight checks scheme and host characters | The host must be a name resolvable on the private CRM network, not a public URL |
| `CRM_API_KEY` | runtime | yes for flight requests | yes | at least 32 characters in the app (`resolveCrmApiConfig`) and in preflight; compose refuses to render without it (`:?`) | Must equal the CRM's `WEBSITE_API_KEY` |
| `CRM_COMPANY_ID` | runtime | yes for contact form and newsletter | yes | non-empty in the app; preflight and compose require it | The CRM's `WEBSITE_API_COMPANY_ID`. Not secret, but environment-specific |
| `LEAD_INGEST_SECRET` | runtime | **optional** | yes | at least 32 characters, else a one-time warning and nothing is signed; preflight warns if unset and fails if set but short | Must equal the CRM's `LEAD_INGEST_SECRET`. Without it, no IP or location reaches the CRM for flight **or contact** requests |
| `TRUSTED_PROXY` | runtime | set by compose to `cloudflare` | yes | `trustedProxyMode()` accepts `vercel`, `cloudflare`, `nginx`, `generic`; anything else is `none` | `cloudflare` is only safe if the origin is reachable solely through the tunnel (compose publishes no port) |
| `GMAIL_SENDER_EMAIL` | runtime | compose and preflight require it (same as the original release); the mailer treats it as optional | yes | compose `:?`; mailer reads and trims | Internal flight-request notification only |
| `GMAIL_APP_PASSWORD` | runtime | as above | yes | as above | A Google App Password, never the account password |
| `PORT`, `HOSTNAME` | runtime | set by compose/Dockerfile (`3000`, `0.0.0.0`) | n/a | - | The container listens on 3000; the tunnel targets `http://bft-web:3000` |
| `NODE_ENV` | runtime | `production` in the image | n/a | - | |
| `NEXT_OUTPUT` | **build time** | `standalone`, set in the Dockerfile builder stage | n/a | `next.config.ts` | Without it `next build` is not standalone |
| `NODE_OPTIONS` (`--max-old-space-size`) | build 3072 MB, runtime 768 MB | in the Dockerfile | n/a | - | The image build needs a builder with enough memory (this machine ran out of memory once at about 0.2 GB free) |
| `ANALYZE`, `VERCEL`, `NEXT_TELEMETRY_DISABLED` | optional / tooling | no | n/a | - | `VERCEL` is read by `client-ip.ts` only to detect that platform |
| `CRM_API_NETWORK_NAME`, `TUNNEL_NETWORK_NAME`, `APP_VERSION` | deploy scripts / compose | optional overrides | n/a | `deploy/common.sh` defaults | Names of the two external Docker networks (defaults `compass-tools-website-api`, `compass-tools_web`) |

Public (`NEXT_PUBLIC_*`) variables: **none exist** in `src/` or `next.config.ts` (search result: only comments say there are none). The CRM credentials are read in exactly one module, `src/server/crm-api.ts`, which imports `server-only`; a structural test fails if client code imports it. The build needs no CRM variable (the Dockerfile says so and pages are static).

No variable named `DATABASE_*` or `DIRECT_URL` is read anywhere in the updated website. **The website does not require a database variable.**

## 2. Do `CRM_API_KEY` and `CRM_COMPANY_ID` validate correctly?

Yes, at all three layers: the app (`src/lib/crm-api/config.ts`, covered by `tests/crm-api-client.spec.ts` and `tests/contact-visitor-context.spec.ts`), compose (`:?` makes `docker compose config` fail without them) and `deploy/preflight.sh` (presence, key length above 32 bytes). The app reports a problem once per process with variable names and rules only, never a value, and shows the visitor a generic error.

## 3. The `DATABASE_*` preflight conflict (finding and change)

**Finding (confirmed from the repository).** The original release's `compose.yaml` makes `DATABASE_URL` mandatory (`${DATABASE_URL:?...}`) and its preflight requires it, so a `.env` that works with the original release necessarily contains `DATABASE_URL` (and possibly `DATABASE_SSL_*`). The updated preflight refused any such variable with a hard failure. Consequences:

1. The first redeploy over the original release would fail preflight unless someone edits the live `.env`.
2. Removing `DATABASE_URL` from the live `.env` would also break a rollback to the previous image (its compose file requires the variable).
3. The variable is harmless to the new container: the updated `compose.yaml` forwards only the variables it lists explicitly, and a test asserts that it never mentions a database variable.

**Decision.** The check itself is meaningful (credentials the website does not need should not sit in its `.env`), so it was **not** weakened by default. Instead one narrow, explicit, per-run exception was added to `deploy/preflight.sh`:

* Default behaviour is unchanged: any database variable fails preflight, and the message now tells the operator how to proceed.
* `PREFLIGHT_ALLOW_LEGACY_DATABASE_VARS=yes deploy/preflight.sh` turns the failure into a loud warning that names the variables (never their values). Only the exact value `yes` counts, and it is read from the operator's shell, never from `.env`, so it cannot be left behind in the file.
* Even then preflight refuses if the rendered compose configuration would forward a database variable to the container.
* `tests/deploy-scripts.spec.ts`: the existing refusal test is unchanged and a new test covers the opt-in, the "yes only" rule, "not honoured from .env", and value-free output.

The live `.env` was not touched. Whether to use the exception or to move the legacy variables elsewhere is the owner's decision.

## 3b. `deploy.sh`, rollback and image behaviour

`deploy/deploy.sh` runs preflight first, so the opt-in must be set when running it as well. `deploy/rollback.sh` and `deploy/verify.sh` exist and are exercised by `tests/deploy-scripts.spec.ts` against a fake `docker` (stubbed): that proves script logic, not a real Docker daemon.

## 4. Docker network and CRM endpoint compatibility

Repository facts: the website is its own compose project (`business-flights-travel`) with one service, `bft-web`, no published port, no volume, joins two **external** networks (the CRM's API network and the tunnel network), and has the tunnel alias `bft-web`. `CRM_API_URL` defaults to `http://compass-crm:3000`, a **private server-side URL**; the public hostnames are not used for server-to-server calls. Preflight (read-only) verifies that a container on the CRM API network answers to the host named in `CRM_API_URL`, that no container on either network answers to `db`, and that nothing else answers to `bft-web`.

| Question | Answer |
|---|---|
| Is the API URL appropriate for server-side use? | Yes in design: private network name, http, origin only |
| Are public and internal URLs confused anywhere? | No. No public CRM URL appears in the code |
| Do the networks and the `compass-crm` alias exist on the VPS? | **NOT VERIFIED - VPS-side.** `docs/DEPLOYMENT_VPS.md` says the live CRM stack's compose layout differs from the repository's (report of 2026-10-16, "not re-checked") and that the alias is not guaranteed |
| Does preflight pass on the live network layout? | **Probably not, by design.** `docs/DEPLOYMENT_VPS.md` (items 2 and 3) records that the live CRM stack was last reported with ONE network, `compass-tools_internal`, carrying the CRM app, PostgreSQL and `cloudflared`, with the CRM answering as `app`. Preflight refuses a tunnel network on which a container answers to `db`, and expects the CRM under the name in `CRM_API_URL`. Either the live stack is given the release layout (a CRM Compose change by the owner) or the owner knowingly accepts the website sharing a network with PostgreSQL, which needs a reviewed relaxation of the preflight rule (not made here). **Owner decision; VPS-side verification required** |
| Does the deployed CRM serve `/api/v1/website/flight-inquiries`, `/api/public/contact-inquiry`, `/api/public/newsletter`? | **NOT VERIFIED - VPS-side.** The CRM source tree contains them; which commit runs is not recorded |
| Does the deployed CRM know the new `source` field? | **NOT VERIFIED.** It is harmless if not: an older CRM ignores it |

## 5. Does the standalone deployment receive its runtime variables?

Yes by construction: the runner stage starts `node server.js` with variables from compose's `environment:` block, which is where all runtime variables above are listed. `docker compose` is not installed here, so this was **not run**; what was run is the production build (`NEXT_OUTPUT=standalone npm run build`, exit 0) and the standalone-server suites that start `.next/standalone/server.js` with explicit environment (`self-hosted-e2e`, `crm-api-actions-e2e`, `form-failure-recovery-e2e`).

## 6. Redacted checklist for a future deployment (the owner performs this; nothing here was done)

1. Confirm which branch/commit is live (see the release report); take the backups listed in `docs/DEPLOYMENT_VPS.md`.
2. In the existing `.env`: ensure `CRM_API_KEY` (same as the CRM's `WEBSITE_API_KEY`), `CRM_COMPANY_ID`, `GMAIL_SENDER_EMAIL`, `GMAIL_APP_PASSWORD` are set; set `LEAD_INGEST_SECRET` (same as the CRM's) only after the privacy wording is approved (it enables IP/location capture for flight **and** contact requests); do not set `NEXT_PUBLIC_*` anything; keep mode 600.
3. If the `.env` still holds the previous release's `DATABASE_*`: either keep them for the rollback window and run preflight with `PREFLIGHT_ALLOW_LEGACY_DATABASE_VARS=yes`, or remove them and accept that a rollback to the previous image then needs them restored.
4. Verify on the VPS that the CRM API network, the `compass-crm` alias (or the name in `CRM_API_URL`), the tunnel network and the CRM's endpoints exist (`deploy/preflight.sh` does this read-only).
5. Build the image on a builder with at least 3 GB of free memory for the Node heap; run `deploy/verify.sh` after the start.
