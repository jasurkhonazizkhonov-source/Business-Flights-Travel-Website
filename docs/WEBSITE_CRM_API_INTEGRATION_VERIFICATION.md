# Website to CRM API integration: verification

Date: 2026-11-13. Local verification only (stand-in CRM and CRM unit tests). Nothing here was exercised against a production CRM.

## Contract (website side)

| Form | Endpoint | Authentication | Visitor context | Idempotency |
|------|----------|----------------|-----------------|-------------|
| Flight request | `POST /api/v1/website/flight-inquiries` | `CRM_API_KEY` + `CRM_COMPANY_ID`, server side only | signed IP / location headers (needs `LEAD_INGEST_SECRET`) | request id |
| Contact message | `POST /api/public/contact-inquiry` | none (public endpoint) | signed IP / location headers (**new in this change**) | `submissionId` |
| Newsletter | `POST /api/public/newsletter` | none | not sent | CRM side |

The website has no database and imports nothing from the CRM. Credentials are read in one server-only module. Structural tests assert all of this (43/43 in `crm-api-client.spec.ts`).

## What was verified

* Signature: header value is base64url JSON, the signature is hex HMAC-SHA256 of that exact string with the shared secret; verified with independent code in a test. The secret never appears in a header, a log or an error.
* The payload for a full Cloudflare observation carries exactly `v, ts, ip, city (percent-encoded), region, country, timezone, source`. Partial data omits what is missing; empty data sends nothing.
* Failure modes: CRM 500, timeout and a lost answer give the visitor a generic message; no IP or CRM text is leaked; a resend stores one inquiry.
* CRM side (unit level): a verified context is persisted into `InquirySubmissionInfo` with the right mapping; a missing, forged, expired or oversized context produces no row; validation of the inquiry body is unchanged; `source` is allow-listed.

## Compatibility matrix

| Website | CRM | Result |
|---------|-----|--------|
| new (sends `source`) | new | label "Cloudflare" stored |
| new | old | `source` ignored; location stored with the old default label (Vercel). Cosmetic only |
| old (no contact context) | new | works; no IP/location, same as before |

## Not verified

* Real PostgreSQL behaviour of the contact route (insert plus advisory locks). BLOCKED / NOT RUN, no approved disposable database.
* Whether the deployed CRM actually serves `/api/v1/website/flight-inquiries` and the new `source` allow-list. In the CRM working tree the flight route file is modified by another session and its new test file is incomplete (8 type errors in that session's untracked file). I did not touch it. Which CRM commit is deployed is not known from the repositories.
* The Cloudflare headers were simulated. Real `cf-*` headers were not observed.

---

## Re-verification, 2026-11-15

The contract was re-read against the CRM source as a read-only reference (the CRM was not modified).

| Check | Result |
|---|---|
| Flight endpoint `POST /api/v1/website/flight-inquiries`: bearer `CRM_API_KEY`, `Idempotency-Key` header, body from `buildFlightInquiryBody` | consistent with the CRM route and tests; website suites green (Infrastructure 168 passed) |
| Contact endpoint `POST /api/public/contact-inquiry` (unauthenticated, `CRM_COMPANY_ID` in the body, `submissionId`) and newsletter `POST /api/public/newsletter` | consistent with the CRM source; the website uses exactly these paths |
| Signature and timestamp | the website signs `ts` (unix seconds); the CRM accepts 300 s and at most 2048 bytes; verified with independent code in a test |
| Replay protection | **None beyond the 300 s window**: no nonce and not bound to the body. The flight route has its own idempotency key; the visitor context is separate. Documented in the security audit (limitation 1); needs a joint change |
| Company identification | flight: derived by the CRM from the API credential; contact and newsletter: `CRM_COMPANY_ID` in the body |
| Source validation | allow-list on the CRM (`vercel`, `cloudflare`); the website sends one of them only together with a location |
| Error responses, timeouts, retries, response parsing | one attempt per submit, never retried automatically; 4xx, 5xx, timeout and a malformed reply become a generic inline message (`safe-action`, `form-failure-recovery-e2e`) |
| Duplicate handling | flight: `Idempotency-Key`; contact: `submissionId`; a resend gives `duplicate: true` and one inquiry (stand-in CRM; the real PostgreSQL behaviour is BLOCKED / NOT RUN) |

**Does the deployed CRM expose the contact and flight functionality?** Not established. The CRM source tree contains the routes, and a branch containing them (`review/crm-verification-2026-11-13`) exists on the CRM remote, published by a separate CRM session. What the live VPS runs is not recorded anywhere. **NOT VERIFIED - VPS-side verification required.** The opt-in `tests/crm-contract-live.spec.ts` (6 tests) can check a non-production CRM; it was **not run**.

**Docker network and endpoint:** see `WEBSITE_ENVIRONMENT_AND_DEPLOYMENT_CONFIGURATION_AUDIT.md` section 4. `CRM_API_URL` is a private, server-side origin; public and internal URLs are not mixed; the network names and the `compass-crm` alias can only be confirmed on the VPS.

**CRM-side defects found, none fixed (the CRM must not be modified in this task):**
1. `vitest.config.ts` has no `exclude` for `.next/**`, so stale `.next/standalone` test copies are collected. Correction: `exclude: [...configDefaults.exclude, ".next/**"]`.
2. The visitor context is not bound to the request body (see above).
Both need separate approval.
