# Request signing, replay protection and body binding

Date: 2026-11-15. Source read on both sides (the CRM read-only): website `src/lib/crm-api/visitor-context.ts`, `client.ts`, `config.ts`; CRM `src/server/lead-ingest-context.ts`, `src/server/public-inquiry.ts`, `src/app/api/v1/website/flight-inquiries/route.ts`, `src/server/security/website-api-auth.ts`. **Nothing was changed in the CRM, and nothing in the signing protocol was changed on the website**: a signing change is a two-sided protocol change, and a website-only change would give no protection while the CRM still accepts the old form (see section 5). This report states the design, measures the real risk, and proposes the change for your approval.

## 1. What is actually signed today

| Property | Value | Verified in |
|---|---|---|
| Payload | JSON `{v:1, ts, ip?, city?, region?, country?, timezone?, source?}`, base64url, header `x-ct-visitor-context` | both sides |
| Signature | hex HMAC-SHA256 of the exact header string, header `x-ct-visitor-signature` | both sides, independent-code test |
| Secret | `LEAD_INGEST_SECRET`, at least 32 characters, identical on both sides, never in the browser | config, CRM verifier |
| Timestamp | `ts` in unix seconds; the CRM accepts a difference of at most **300 s in either direction** | CRM `VISITOR_CONTEXT_MAX_SKEW_SECONDS` |
| Size | at most 2048 bytes | CRM |
| HTTP method signed? | **no** | |
| Request path signed? | **no** (the same envelope is valid on the flight and on the contact endpoint) | |
| Request body signed? | **no** | |
| Company id signed? | **no** | |
| Nonce / request id? | **no** | |
| Replay protection beyond the window? | **none** (and none needed against the existing idempotency keys, see below) | |
| Authenticates the whole request? | **no**: it only vouches for the visitor IP and location fields. Flight requests are authenticated by the separate Bearer credential; **contact and newsletter requests are not authenticated at all** | |

A context that is present but invalid yields no IP and no location, never a fallback to the connection headers (CRM tests; stand-in CRM test with a wrong secret). The context cannot be forged without the secret.

## 2. What the weakness really allows

An attacker who captured one envelope (both headers) could, for up to 5 minutes, attach that visitor's IP and location to **a different request body** sent to the contact endpoint (or the flight endpoint with a valid credential). Realistic requirements: the attacker must be able to read traffic on the private Docker network or a log that contains the headers (the website never logs them). Impact: a spurious inquiry that carries someone else's recorded IP and approximate location; it cannot grant access, change an existing record, or read data.

What replay of the **identical** request does: nothing harmful. Flight: same `Idempotency-Key` and same body gives `duplicate`, a different body under the same key gives 409. Contact: same `submissionId` and message gives `duplicate: true`, a different message under the same key gives 409. The CRM's own comment states the same conclusion ("a duplicate submission is already a no-op"). Concurrent duplicates are serialised in the CRM by advisory locks in a transaction (**real PostgreSQL behaviour is BLOCKED / NOT RUN**: the integration test exists and was never run against a disposable database).

Related property (not part of signing): the CRM's per-IP limiter on the public inquiry routes **does not apply to website traffic** because the website's server-to-server call carries no trusted client IP and that limiter allows requests without one. The website's own in-memory limiter is the only throttle there.

## 3. Proposed contract v2 (needs CRM and website changes; not implemented)

Goal: make the envelope valid for exactly one request, without breaking retries or idempotency.

1. **Payload v2** adds: `m` (HTTP method), `p` (path), `c` (company id the request is for), `bh` (base64url SHA-256 of the **exact request body bytes**), `n` (128-bit random nonce, base64url). `v` becomes 2. Existing fields unchanged.
2. **Signature** = HMAC-SHA256 over `"ct-visitor-v2\n" + <context header value>` (domain separation from v1).
3. **CRM verification**: recompute `bh` from the raw bytes it received (so the body must be read as text first, then parsed); require `m` and `p` to equal the actual method and path; require `c` to equal the company the request resolves to (the body `companyId` for the public routes, the credential's company for the flight route); reduce the accepted skew from 300 s to 60 to 120 s; ignore `ip`, `city` and the rest unless all checks pass.
4. **Replay**: with body, method, path and company bound, a replay can only resend the identical request, which the existing idempotency keys already collapse into a duplicate. A nonce store is therefore **optional hardening**, not required for integrity. If you want strict one-time use, the existing `RateLimitCounter` table (unique `key`, `expiresAt`, expired rows already purged by the CRM's cron) can hold `nonce:<hash>` rows with a single `INSERT ... ON CONFLICT DO NOTHING`, shared across instances and restarts, **with no migration**. Caveat: legitimate retries resend the same envelope, so strict one-time nonces require the website to **re-sign every attempt** (a small client change). An in-memory nonce cache would be wrong (several instances, restarts) and is not proposed.
5. **Backward compatibility and rollout**: (a) CRM first: accept v1 and v2 (v1 keeps today's behaviour); (b) website second: sign v2 only after the CRM is confirmed deployed; (c) later, optionally, the CRM refuses v1. A CRM that predates v2 would not understand `v:2`; the website must therefore not send it until step (a) is live (the website can be released first with the code dormant behind the presence of an environment flag, if you prefer).
6. **Rollback**: the CRM keeps v1; the website reverts to v1 by configuration or redeploy; no data migration either way.

### Website changes (small, after CRM approval)
Sign inside the HTTP client at send time, over the exact string that is sent (the body is already serialised once and sent byte-identically on every attempt), with the path and method known there; for the flight retries either re-sign per attempt (if one-time nonces are wanted) or keep one envelope (if not).

### CRM changes (not made)
`src/server/lead-ingest-context.ts` (v2 verification, raw body, method, path, company, shorter skew), `src/server/security/read-limited-json.ts` (expose the raw text), the two routes that call it (`public-inquiry.ts`, `flight-inquiries/route.ts`), and tests; optionally a nonce insert using `RateLimitCounter`. **No schema change, no migration.**

### Test plan
Valid v2 accepted; v1 still accepted during the transition; wrong method, path, company, body (one byte), body whitespace change, expired and future timestamps, wrong secret, wrong nonce size, oversize payload, cross-endpoint reuse; the identical request replayed gives `duplicate`; concurrent identical requests give one record; a modified-body replay is rejected; retry after a timeout does not create a second record; flight and contact both covered; the website and the CRM share one canonicalisation test vector.

## 4. Was any of this tested in this pass? (current, local, stand-in CRM)

The current protocol is covered by `contact-visitor-context.spec.ts` (14 per viewport project), `crm-api-client.spec.ts`, and the end-to-end contact and flight tests that verify the HMAC with independent code and show a wrong secret is simply not believed. The new end-to-end tests of this pass add a signing secret the CRM does not share (the visitor context is refused, the flight request still succeeds, nothing sensitive is logged). **Replayed requests, modified bodies, modified company ids and modified paths were not tested because the current protocol accepts them by design** (that is the limitation). Tests for them belong with the v2 implementation.

## 5. Why nothing was changed on the website alone

Adding fields to the signed payload on the website would be ignored by a CRM that does not check them (an older CRM tolerates unknown payload keys, as it already did for `source`), so it would look like protection while giving none. "Do not claim the issue is fixed on the website alone if the CRM still accepts replayed requests": the CRM still does. **Status: replay and body-binding limitation OPEN; CRM-side work required; proposal above awaits your approval.**


---

## Update (third pass): signing v2 IMPLEMENTED in both applications (not deployed)

The proposal in section 3 was implemented, with these decisions that differ from or sharpen it:

* **Canonical message:** `CT-WEBSITE-REQUEST-V2`, then the length-prefixed fields METHOD | path | companyId | ts | nonce | SHA-256(exact body bytes) | context header. The timestamp and nonce are signed twice over (explicitly in the message and inside the context header). Known-answer vector shared by both test suites.
* **Verifier and policy (CRM):** `src/server/website-request-signature.ts`, `src/server/website-signature-guard.ts`; wired into `POST /api/v1/website/flight-inquiries`, `POST /api/public/contact-inquiry`, `POST /api/public/subscribe`. The older `lead-capture` route (other callers) keeps v1 untouched.
* **Window:** at most 120 s old, at most 30 s ahead (was 300 s either way).
* **Required, no fallback:** once the CRM has a `LEAD_INGEST_SECRET`, an unsigned, v1, expired, modified or replayed request is refused with 401 (503 if the one-time store is unreachable: fail closed). With no secret on the CRM the routes behave as before. **There is no v1 compatibility window on these routes.**
* **Nonce store:** the existing `RateLimitCounter` table, one `INSERT ... ON CONFLICT ("key") DO NOTHING RETURNING "id"` per nonce (key `nonce:v2:<company>:<nonce>`, expiry signing time + 180 s, purged by the existing cron). Its schema was inspected: unique `key`, `expiresAt` indexed, `id` needs a client-supplied value, cleanup `deleteMany(expiresAt < now)`. **No migration.** Real PostgreSQL behaviour (the unique-key race) is **BLOCKED / NOT RUN**; concurrency is tested against an in-memory stand-in with the same first-insert-wins contract.
* **Retry vs consumed nonce:** the website signs **every attempt** with a fresh nonce and timestamp. A retry therefore passes verification and is collapsed into a duplicate by the unchanged `Idempotency-Key` / `submissionId`; re-sending a consumed signature is refused.
* **Rate limiting:** after verification, the visitor IP inside the signature is the key for a per-visitor limit in a website-only bucket (unattributed traffic shares one bucket with 5x the allowance); the website's own in-memory limiter remains as the first line.
* **Newsletter route:** now signed too (it was the unauthenticated route through which arbitrary addresses could be enrolled); the visitor IP travels in the signature only for the rate limit and is not stored.

**Status: implemented and tested locally (CRM unit tests, website unit and end-to-end tests against a stand-in CRM). NOT verified against the live CRM or a real database. Deployment order is CRM first, then the website** (runbook).


---

## Correction (fourth pass, 2026-11-16): the flight route had no per-visitor limit

The paragraph above says the visitor IP inside the verified signature keys a per-visitor limit. That was true for the two **public** routes (contact, newsletter) but **not for the authenticated flight route**, which was only covered by the account-wide budget (120 per minute for the whole website). One visitor or script could therefore use that whole budget and make every other visitor's flight request fail. **Fixed in the CRM** (`POST /api/v1/website/flight-inquiries` now applies the lead-capture allowance, 20 per 15 minutes, per verified visitor IP, in the website-only bucket `WEBSITE_FLIGHT:website`, after the signature is verified; 7 new tests). Details: `WEBSITE_LOCATION_AUTOFILL_VALIDATION_AND_IP_CAPTURE_VERIFICATION.md`, section 18. The CRM must be redeployed (before the website, as always) for this to take effect.
