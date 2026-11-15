# Contact inquiry: client IP and approximate location, end to end

Date: 2026-11-13. Scope: `Travel Agency Website-updated` (website) and `compass-tools-updated` (CRM, working tree only). No deployment, no production system, no real visitor data or submissions were touched. Everything below was verified locally against a stand-in CRM or CRM unit tests.

## 1. Root cause

The contact form (`submitContactMessage`) never forwarded the visitor's IP or location to the CRM, so a contact inquiry reached the CRM with no signed visitor context and the CRM, correctly, stored nothing. Four defects combined:

| # | Defect | Where |
|---|--------|-------|
| a | The contact action never captured or signed visitor information. Only the flight-request path did. | `src/server/actions/submit-contact-message.ts` |
| b | `LEAD_INGEST_SECRET` was resolved only for the `flight-inquiry` target, so the contact target had no signing secret. | `src/lib/crm-api/config.ts` |
| c | The public-endpoint client function had no way to carry the two visitor headers. | `src/lib/crm-api/client.ts` (`postPublic`, `postContactInquiry`) |
| d | The CRM labelled any verified signed location as Vercel data, including Cloudflare data. | CRM `lead-ingest-context.ts`, `inquiry-submission-info.ts`, `lead-submission-info.ts` |

## 2. Files changed

Website: `src/lib/crm-api/config.ts`, `client.ts`, `visitor-context.ts`, `src/server/actions/submit-contact-message.ts`, `tests/support/stub-crm.ts`, `tests/crm-api-actions-e2e.spec.ts`, `tests/crm-api-client.spec.ts` (one expectation updated for the new `source` field), new `tests/contact-visitor-context.spec.ts`.

CRM (working tree only, not committed): `src/server/lead-ingest-context.ts`, `src/server/inquiry-submission-info.ts`, `src/server/lead-submission-info.ts`, new `src/server/__tests__/website-visitor-context-contact.test.ts`.

No migration is needed on either side. The `InquirySubmissionInfo` table and its columns already exist in the CRM.

## 3. How the client IP is determined

Implemented in the existing `src/lib/ip-geo.ts` and `src/lib/request-ip.ts` (unchanged by this work), now reached from the contact action as well.

* Header trust is controlled by `TRUSTED_PROXY`. Default `none`: no forwarded header is believed, so the IP is "unavailable". `cloudflare` reads only `cf-connecting-ip` (and `cf-connecting-ipv6` when `cf-connecting-ip` is Cloudflare's Class-E pseudo-IPv4 stand-in). `vercel`, `nginx`, `generic` read their own forwarded headers.
* Nothing from the request body or form fields is ever used. A body-supplied `ip` field is ignored (tested).
* The value must parse as a real IP. IPv4 and IPv6 are accepted. IPv6 is stored canonical (lower-case, zero-compressed, zone id dropped), which is the same address as the notation the visitor's network used. An IPv4-mapped IPv6 address collapses to IPv4. Garbage, private, loopback, link-local, CGNAT (100.64/10), documentation (2001:db8::/32) and other reserved values are rejected and the IP is reported as unavailable, never guessed.
* No truncation: the full address is carried. The signed context is limited to 2048 bytes; the worst case (full IPv6 plus long, percent-encoded, non-ASCII city) is tested under that limit.
* Logging: on success the action logs one value-free line (for example "visitor context signed; ip captured; location captured"). It never logs an address, a city, the secret or a signature.

Known limitation (not fixable in code): under `TRUSTED_PROXY=cloudflare` the trust is network based. It holds only if the origin is reachable exclusively through Cloudflare or the tunnel. It is not cryptographic proof.

## 4. Location fields and source

From Cloudflare headers, only when trusted: country code (`cf-ipcountry`; `XX` and `T1` ignored), city (`cf-ipcity`), region (`cf-region-code` or `cf-region`), time zone (`cf-timezone`). The country name is derived from the code. Each field is optional; a missing field is omitted, never invented. Latitude and longitude (`cf-iplatitude/longitude`) are used for the internal notification email only and are deliberately not sent to the CRM (the CRM has no column; adding one needs a migration and a privacy review).

The signed payload carries `source: "cloudflare"` (or `"vercel"`). The CRM allow-lists the value and stores the matching human label; an unknown or missing value falls back to the previous default label. Older CRM ignores `source`; an older website works with the new CRM. The label is stored but not shown in the CRM UI.

## 5. API request and response behaviour

* Request: `POST /api/public/contact-inquiry` with the existing JSON body plus two headers, `x-ct-visitor-context` (base64url JSON `{v:1, ts, ip?, city?, region?, country?, timezone?, source?}`) and `x-ct-visitor-signature` (hex HMAC-SHA256 of the header value with `LEAD_INGEST_SECRET`, at least 32 characters, identical on both sides). The public contact endpoint still sends no API key.
* Signing needs `LEAD_INGEST_SECRET` on the website. Without it nothing is signed and the inquiry is still delivered, only without IP/location.
* The CRM accepts a context only within 300 s, at most 2048 bytes, with a valid signature. A forged, expired or oversized context is discarded; the connection headers are never used as a fallback for server-to-server calls.
* Response handling is unchanged: success, validation error, and a generic error for CRM failures. A CRM failure shows the visitor the generic message with no IP in it (tested).
* Idempotency: the form's `submissionId` still makes a resend one inquiry, including a resend from another network.

## 6. CRM storage and display

Verified by CRM unit tests against the route's persistence mapping (mocked data layer): IPv4, IPv6, partial location, location only, IP only, older website without `source`, and no or forged context (no submission row is written, validation unchanged). Display and permissions were reviewed in code and covered by existing tests: the information is Admin only (`canViewGetInTouch`), the IP is masked and revealing it needs a recent sign-in and is audited.

The PostgreSQL-backed behaviour (real insert of `ContactInquiry` plus `InquirySubmissionInfo` in one transaction, advisory locks) is **BLOCKED / NOT RUN**: no approved disposable database was used. The integration test `public-inquiry-idempotency.integration.test.ts` is written and unexecuted.

## 7. Test results

| Suite | Result |
|-------|--------|
| `tests/contact-visitor-context.spec.ts` (14 new unit tests) | 14 passed |
| `tests/crm-api-client.spec.ts` + the above, Infrastructure project | 43 passed (after updating one expectation for `source`) |
| Infrastructure e2e on the fresh standalone build: `crm-api-actions-e2e`, `crm-api-client`, `form-failure-recovery-e2e` | 103 passed, 1 failed on first run (the `source` expectation, fixed and re-run green), 0 skipped |
| New contact end-to-end tests (IPv4 + location + source; IPv6 full, compressed, mapped, pseudo-IPv4; partial, no and unknown location; no trusted IP, spoofed or invalid or private values; body ip ignored; resend and CRM failure) | 6 of 6 passed inside the above |
| CRM `website-visitor-context-contact` and related unit tests | 40 of 40 passed |
| `tsc --noEmit`, `eslint src tests` (website) | clean |
| Production build `NEXT_OUTPUT=standalone npm run build` | first attempt crashed (heap out of memory, host had about 0.2 GB free); second attempt exit 0 |
| PostgreSQL-backed tests | BLOCKED / NOT RUN |
| Docker image build | NOT RUN (Docker is not installed) |

## 8. Remaining concerns

* The privacy policy (`src/app/privacy-policy/page.tsx`, section "Information collected automatically") describes IP and location capture for a **flight request** only. The contact form now also records them when `LEAD_INGEST_SECRET` is configured, so the wording is incomplete. This needs attorney-reviewed text; I did not draft or publish any. See `docs/LEGAL.md`.
* The statement depends on configuration: if the secret is not set, nothing is recorded, so the policy and the deployment must be kept in step.
* Cloudflare trust is network based (see section 3).
* Coordinates are not stored in the CRM by design.

---

## Re-verification, 2026-11-15 (independent re-read of the code and fresh test runs)

Nothing above was assumed. The three files named in the brief (`src/lib/crm-api/client.ts`, `visitor-context.ts`, `src/server/actions/submit-contact-message.ts`) and the modules they call (`src/lib/submission-info.ts`, `client-ip.ts`, `ip-geo.ts`, `src/server/crm-api.ts`, `config.ts`) were read again in full. Every statement in sections 1 to 5 still matches the source.

### Data flow as it actually runs

Visitor browser, then the contact form (a client component that sends only the typed fields plus a per-mount `submissionId` and the honeypot and timing fields), then the server action `submitContactMessage` (rate limit by trusted client key, zod validation, honeypot, phone normalisation, CRM configuration), then `captureSubmissionInfo(headers())` (the IP from the trusted-proxy mode only; the location from Cloudflare headers only when `TRUSTED_PROXY=cloudflare`), then `buildVisitorContextHeaders` (base64url JSON and a hex HMAC-SHA256 with `LEAD_INGEST_SECRET`), then `postContactInquiry` (`POST /api/public/contact-inquiry`, one attempt, no API key), then the CRM verifies the signature, the 300 s age and the 2048-byte limit and persists one `InquirySubmissionInfo` row with the `ContactInquiry`.

The first hops were exercised over real HTTP against the standalone production server, with a stand-in CRM that verifies the signature and decodes the payload as the CRM would. The last hop (CRM persistence) is covered by the CRM unit tests with a mocked data layer, because the real PostgreSQL path is BLOCKED / NOT RUN.

### Scenario matrix (mocked headers, fake data)

| Scenario | Where it is tested | Result 2026-11-15 |
|---|---|---|
| Valid IPv4 with full Cloudflare location | `crm-api-actions-e2e` (standalone server), `contact-visitor-context` | pass; `source: "cloudflare"` |
| Valid IPv6 (full, compressed, IPv4-mapped; Cloudflare pseudo-IPv4 replaced by the real IPv6) | same | pass; no truncation |
| Missing client IP | `crm-api-actions-e2e` ("no trusted client IP") | pass; inquiry still sent, no IP substituted |
| Malformed or private/reserved IP | same, `submission-ip` | pass; reported as unavailable |
| Spoofed forwarding header (`X-Forwarded-For`, `X-Real-IP`, `Forwarded`) | same, `submission-ip` | pass; never believed behind Cloudflare mode |
| Missing country, missing city, partial location, unknown country marker (`XX`, `T1`) | `crm-api-actions-e2e`, `contact-visitor-context` | pass; only existing parts sent, nothing invented |
| Unknown location source | website: the source comes only from the trusted mode; CRM: allow-list | pass (CRM unit tests) |
| Invalid or forged signature | `crm-api-client` ("a wrong secret is simply not believed"); CRM test "forged context writes no row" | pass |
| Missing or short signing configuration | `contact-visitor-context` | pass; no headers, inquiry still sent, one value-free warning |
| Contact with and without available visitor context | `crm-api-actions-e2e`, `contact-visitor-context` | pass |
| CRM rejection (HTTP 400), CRM 500 and CRM timeout | `contact-visitor-context` (`postContactInquiry` outcomes), `crm-api-actions-e2e` (CRM 500) | pass; generic visitor message; no IP in the message or the logs |
| Body-supplied `ip` or location fields | `crm-api-actions-e2e` | pass; ignored |

Fresh totals: `contact-visitor-context.spec.ts` has 14 tests per viewport project (all green in the 1391 passed); `crm-api-actions-e2e.spec.ts` and `crm-api-client.spec.ts` are green in the Infrastructure run (168 passed, 0 failed).

### Security requirements checked

* No truncation, IPv4 and IPv6: yes. No arbitrary header trust: yes (gated by the proxy mode). No fabricated location and no GPS claim: coordinates are never sent to the CRM, and the policy text says the location is an estimate. Source identification: yes.
* The signature cannot be altered without detection: yes (HMAC over the exact header value). It is **not bound to the request body and has no nonce** (see the security audit, limitation 1): documented, needs both sides to change, not changed.
* The secret is not exposed to the browser: `.next/static` contains none of the secret names, and the module is `server-only`.
* No full IP in ordinary logs: the success log line says only "ip captured" or "ip unavailable (reason)".
* Contact and flight requests use the same `captureSubmissionInfo` and `buildVisitorContextHeaders`. The flight request sends the context on its authenticated call and the contact request on its public call: different endpoints, same contract.
* CRM company and tenant isolation: the contact body carries `CRM_COMPANY_ID` as configured and the CRM decides. Not exercised against a real CRM.

### Result

Verified locally: PASS. Not verified: persistence in the real CRM database, behaviour of the deployed CRM, real Cloudflare headers. A privacy-wording sentence for the contact form was added in this pass (see `WEBSITE_PRIVACY_AND_CONSENT_READINESS_REVIEW.md`). Contact IP/location capture should not be switched on in production (`LEAD_INGEST_SECRET`) before that wording has been reviewed.
