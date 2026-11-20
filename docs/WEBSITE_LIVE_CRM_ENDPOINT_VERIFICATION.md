# Live CRM endpoint verification

Date: 2026-11-15. This repository is **public**; this report contains no secret, no customer data, no full visitor IP and no server address. Everything labelled "live" below came from anonymous public requests (DNS, TLS handshake, HTTP `GET`/`HEAD`) of the kind any visitor can make. **No SSH, Docker, VPS or database access was used or available** in this session (no SSH configuration, no keys, no Docker). No `POST` was sent to any live host, so no record, email or notification could have been created.

## 1. Verification levels (kept separate, as asked)

| Level | Result | Evidence |
|---|---|---|
| Production endpoint **reachable** | **YES** | `compass-tools.com` resolves to Cloudflare addresses; TLS 1.3 handshake succeeds with a Let's Encrypt certificate valid 2026-10-09 to 2027-01-07 (subject matches the hostname); `GET /` answers HTTP 200 (a Next.js app behind Cloudflare, `Cache-Control: no-store`) |
| Production **health** | **YES** | `GET /api/health` answers HTTP 200 `{"status":"ok", ...}` with the database check `ok` |
| Production **route confirmed (registered)** | **YES for all three** | `GET` on each POST-only route answers **405 Method Not Allowed**, not 404: `/api/public/contact-inquiry`, `/api/public/subscribe` and `/api/v1/website/flight-inquiries`. A 405 exists only if the route is registered in the running build |
| Production **authentication** verified | **NO** | Needs a `POST` with the website's credential; not allowed and not possible without the secret |
| Production **actual submission** tested | **NO** | Deliberately not done; needs a separately approved production test |
| **Local integration** tested | **YES** (stand-in CRM) | see section 4 |

## 2. What the live CRM tells us about its version

The live health response still carries database timing and connection-pool details to an anonymous caller. The updated CRM source (`src/app/api/health/route.ts`, implemented in the 2026-11-13 pass) returns only `{status}` anonymously and the detailed report only with `Authorization: Bearer <CRON_SECRET>`. **So the live CRM is older than the updated CRM source**: at least the health hardening is not deployed. Which commit it runs is **NOT VERIFIED** (no deploy record, no version endpoint). The live CRM already has the flight-inquiry route, so it is at least from the API-introducing line. Whether it has the contact idempotency (`submissionId`), the `source` allow-list for visitor context, or the stricter flight contract cannot be established from outside.

Consequence for compatibility: the website is designed to degrade safely against an older CRM. An older CRM ignores `source`; a CRM without `submissionId` support ignores the key and stores the message as before; a flight route without the `Idempotency-Key` requirement would also accept the header. **What cannot be known remotely is whether the flight route enforces the strict body the website now sends**; the stand-in CRM implements the updated contract, so a successful local test does not prove the live CRM accepts it.

## 3. Endpoint contract: website against CRM source (read-only reference)

Derived from the code, not from documentation. Paths: the website calls exactly `POST /api/v1/website/flight-inquiries`, `POST /api/public/contact-inquiry` and `POST /api/public/subscribe` (`src/lib/crm-api/client.ts`). The CRM has no `/api/public/newsletter` route; an earlier version of this repository's reports named the newsletter route wrongly (corrected, see the erratum in `WEBSITE_CRM_API_INTEGRATION_VERIFICATION.md`). The code was always right.

| | Flight inquiry | Contact inquiry | Newsletter |
|---|---|---|---|
| Method, path | `POST /api/v1/website/flight-inquiries` | `POST /api/public/contact-inquiry` | `POST /api/public/subscribe` |
| Authentication | `Authorization: Bearer <CRM_API_KEY>` (= CRM `WEBSITE_API_KEY`, at least 32 characters) | **none** | **none** |
| Company | fixed by the credential; a body `companyId` is **rejected** (strict body) | `companyId` in the body (= `CRM_COMPANY_ID`); unknown company gives 400 | same |
| Idempotency | `Idempotency-Key` header, required, 8 to 200 characters `[A-Za-z0-9._-]`; same key and body gives 200 duplicate, same key with a different body gives 409 | optional `submissionId` in the body (same character set, 8 to 200); same message gives `duplicate: true`, different message with the same key gives 409 | CRM upsert |
| Visitor context | `x-ct-visitor-context` / `-signature` accepted | accepted (server-to-server mode; without a valid context no IP or location is stored) | not used |
| Body | strict: unknown fields rejected | lenient: unknown fields dropped; `subject` must be one of five values | `companyId`, `email`, optional `source` |
| Rate limits | per-credential request budget plus a failed-auth counter | per-IP counter (see finding 3.2) | per-IP counter |
| Public edge | **404 if the request carries `cf-ray`, `cf-connecting-ip` or `cf-visitor`** unless `WEBSITE_API_ALLOW_PUBLIC_ROUTE=true` | none | none |

**Field-level match (verified):** the five contact subjects in the website (`GENERAL_INQUIRY`, `FLIGHT_REQUEST_HELP`, `EXISTING_BOOKING`, `CORPORATE_TRAVEL`, `OTHER`) equal the CRM's enum; the website's `submissionId` (form UUID, a dot, 16 hex characters) fits the CRM's pattern and length; phone is sent in E.164; the flight body is mapped by `buildFlightInquiryBody` and asserted by the stand-in CRM, which is strict in the same way. No mismatch in field names, signature calculation, timestamp format (unix seconds), endpoint paths or response parsing was found.

### 3.1 The flight route refuses the public hostname by design
Because `arrivedViaPublicEdge` looks for Cloudflare headers, **`CRM_API_URL` must be a private, in-network address** (the compose default is `http://compass-crm:3000`). If it were set to `https://compass-tools.com`, every flight request would receive 404 and the visitor would see the generic error. The website never forwards `cf-*` headers (they are not copied), so the private route works. (`GET` to the route on the public hostname answering 405 is consistent: the method check precedes the handler.)

### 3.2 Finding: the CRM's per-IP limiter does not throttle the website's traffic
The public inquiry routes call `checkPublicRateLimit(req.headers, ...)`, which keys on `getClientIp(headers)` and **allows the request when no trusted client IP is present**. The website's server-to-server request carries no client IP header (by design: the visitor context is signed separately), so for website traffic that limiter is effectively off. The only throttle on website submissions is the website's own in-memory limiter (contact: 8 per 10 minutes per client key; per container, reset on restart). Direct abusers of the unauthenticated public routes on the public hostname are limited by their own `cf-connecting-ip`. This is not a defect to fix on the website; it is a property to know (see the signing audit and the CRM proposal).

## 4. Local integration evidence (stand-in CRM, fake data, current results 2026-11-15)

See `WEBSITE_PRODUCTION_INTEGRATION_READINESS_REPORT.md` for the exact commands and counts. In short: the Infrastructure suite and the contact, flight and newsletter end-to-end tests pass against a stand-in CRM that enforces the contract above.

## 5. Decision

* Live CRM endpoint: **reachable, healthy, routes registered. Authentication and an actual submission: NOT VERIFIED.**
* Website to live CRM compatibility: **NOT VERIFIED** (the live CRM is older than the source the contract was read from).
* What is needed to close it: a separately approved, non-customer production test (a test company or a clearly labelled test inquiry created and then removed by the CRM owner), or the owner confirming the deployed CRM commit.
