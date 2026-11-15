# Website: functional, API, SEO/accessibility and legal audit (2026-11-13)

Audit only. All checks used static inspection, the stub CRM and local servers with synthetic data. No production system, live CRM, real e-mail or real visitor data was used. Nothing was deployed.

## 1. Methodology

Source reading of the three Server Actions, their validation schemas, the CRM client and the form components; field-by-field comparison with the CRM's real schemas (`flightInquiryBase`, the public inquiry and subscribe schemas, read from the CRM repository); the stub CRM written from the CRM's published contract; unit and browser tests; a standalone production server for form-failure, body-limit and rate-limit tests; GET requests to the local updated server for headers, JSON-LD and element ids. The original's server (3100) was not running, so no live side-by-side render was possible (`WEBSITE_ORIGINAL_VS_UPDATED_STRUCTURAL_PARITY_AUDIT.md`, section 1).

## 2. Visitor workflows

### Flight request form
| Requirement | Finding | Evidence |
|---|---|---|
| One-way, round-trip, multi-city | all three (`TRIP_TYPES`); multi-city 2-6 legs; one leg for the others | `validations/flight-request.ts`; e2e |
| Date validation | return date required for round trip and not before departure; departure-date range calendar highlights the span | schema refinements; `tests/date-range.spec.ts` (7) |
| Passengers | adults 1-9, children 0-8, infants 0-8, total <= 9, infants <= adults | schema refinements |
| Cabin, airports, optional airline/budget/notes (<= 2,000) | present; unchanged | schema; `redesign.spec` |
| Required fields and messages | first/last name, valid E.164-capable phone, optional e-mail; field-level messages, focus moves to the first error | `focus-field-error.ts`; a11y/redesign specs |
| Submission, loading, success, error | `callAction` + own `busy` flag; success summary only after the server confirms; inline `role="alert"` message on any whole-call failure | `safe-action.ts`; `form-failure-recovery-e2e` (35, retries off) |
| Duplicate protection | button disabled while busy + ref guard; per-form `submissionId` is the CRM `Idempotency-Key`; the CRM answers a repeat as `duplicate:true` | `FlightRequestForm.tsx`; stub-CRM tests |
| CRM payload | built from an explicit allow-list, no spreading; exactly the fields the CRM's strict schema accepts | `crm-api/flight-inquiry.ts`; section 3 |

### Contact form
Validation (names, e-mail, phone via libphonenumber, subject enum, message 10-3,000 characters, honeypot + 2 s minimum fill time); on any failure the values stay and an inline message shows; the server-side check repeats everything; the `submissionId` is `<form id>.<16 hex of a hash of the typed fields>`, so a resend of the same text is one inquiry and an edited message is a new one; one attempt per press, never retried automatically. Evidence: `crm-api-actions-e2e`, `crm-api-client.spec`, `form-failure-recovery-e2e`, `contact-details-and-consent.spec`.

### Newsletter
E-mail validated client and server side; a filled honeypot is discarded silently **before** validation with the reply a real success gets and no CRM call (also for a junk address, a whitespace value, repeated, and malformed argument shapes); success shows the same toast as before; the CRM's reply cannot say "already subscribed", so that text is never shown (existing behaviour, documented); element ids are unique per instance (`newsletter-email`/`newsletter-website` once on `/contact`, footer keeps the original ids). Evidence: `crm-api-actions-e2e`, `contact-form-autocomplete.spec`.

### General requirements
| Requirement | Result |
|---|---|
| No false success | success is rendered only for a validated `{ok:true}` reply; a malformed 200, an aborted call, a 413/500 and a time-out all produce the inline error (tested for all three forms) |
| No automatic retry creating duplicates | contact and newsletter: none; flight: up to 3 attempts with the **same key and byte-identical body**, so the CRM answers repeats as duplicates; the browser-side call is never repeated |
| Entered data kept | asserted after every failure class |
| Oversized requests | Server Action bodies are capped at 64 KB (largest legitimate body about 10 KB); Next refuses a larger body before the action runs and answers HTTP 200 with an opaque error row (Next 16 does not map this to 413); the forms turn it into the inline message; no CRM call, no stack trace (10 tests incl. 5 MB, malformed, wrong content types) |
| Authentication and validation not weakened | the website holds no CRM credential in the browser; server-side re-validation unchanged; CRM-side checks untouched |
| API contracts compatible | section 3 |

## 3. CRM API contract (website side checked against the CRM's real implementation)

| Endpoint | Auth | Required | Optional | Responses the website handles | Idempotency / limits |
|---|---|---|---|---|---|
| `POST /api/v1/website/flight-inquiries` | `Authorization: Bearer <CRM_API_KEY>` (>= 32 chars); company fixed by the CRM's `WEBSITE_API_COMPANY_ID`; private network only | `Idempotency-Key` header (8-200 of `A-Za-z0-9._-`); body: firstName, lastName, phone (E.164), tripType, departureAirportIata, arrivalAirportIata, departureDate, cabinClass, adults, children, infants, datesFlexible | email, returnDate, segments[] (multi-city), preferredAirline, approximateBudget, budgetCurrency, additionalNotes | `201 {leadId,duplicate:false}`, `200 {duplicate:true}`, `409 idempotency_key_reused`, `400 validation_failed` (field paths), `401/404` (misconfiguration, no retry), `413`, `415`, `429` (honours Retry-After, capped), `503`/`5xx`/time-out/unreadable 200 (retried with the same key) | strict body (unknown field = 400); CRM cap 32 KB; website time-out 10 s per attempt, 3 attempts; request fingerprint on the CRM |
| `POST /api/public/contact-inquiry` | none; `companyId` in the body (`CRM_COMPANY_ID`) | companyId, firstName, lastName, email, phone (E.164), subject (`GENERAL_INQUIRY`, `FLIGHT_REQUEST_HELP`, `EXISTING_BOOKING`, `CORPORATE_TRAVEL`, `OTHER`), message | `submissionId` (8-200 chars) | `200 {ok,id,duplicate?}`, `409`, `400`, `429`, `5xx` | derived inquiry id, content + key lock (updated CRM); older CRM ignores the key; CRM bounded read 64 KB; one attempt, 10 s |
| `POST /api/public/subscribe` | none; `companyId` | companyId, email | source | `200 {ok}`, `400`, `429`, `5xx` | idempotent upsert; one attempt, 10 s |

Visitor IP and location: signed context headers (`x-ct-visitor-context` + HMAC with `LEAD_INGEST_SECRET`) are sent only when that secret is configured; values come from what the website observed behind the tunnel, never from a form field.
Checked limits: the website is stricter than the CRM everywhere (adults 9 vs 20, 6 legs, notes 2,000 vs 5,000, 64 KB actions vs 32 KB API body after mapping). **Live compatibility was not tested** (blocked: no isolated CRM with a database); the opt-in live contract spec was skipped, not passed.

## 4. SEO, accessibility and headers (observed on the updated server, plus tests)

| Item | Finding |
|---|---|
| JSON-LD | home: `TravelAgency` with `@id .../#organization`, `WebSite` with `@id .../#website` and `publisher` = `{@id: organization}`, `FAQPage`; article pages additionally `Article` (publisher references the organization `@id`), `BreadcrumbList`, `FAQPage`; `json-ld.spec` (3) |
| Canonical, metadata, OG | canonical present (home `https://www.businessflights.travel`), one `<h1>` on `/`; `validate:seo` 218 routes, 0 failures |
| IDs and labels | no duplicate ids on `/contact`; newsletter ids unique; form labels/`aria-describedby`/`aria-invalid` covered by the a11y and phone specs |
| Headings, alt text, contrast, keyboard | 17 accessibility tests (the original had 10) plus `design-integrity.spec`; alt text no longer claims people are staff; contrast fixes asserted |
| Cookie banner | present, tested (consent stored in local storage, no non-essential cookies set) |
| Headers | `X-Powered-By` **absent**; `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, CSP (with `'unsafe-inline'` for scripts: a documented trade-off, not new), `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` (**note:** `preload` and `includeSubDomains` are a commitment for the whole domain; pre-existing, confirm it is intended) |
| Lazy loading / performance | phone library loaded on first touch (outside the initial JS, tested on a production build); reveal animation no longer hides first paint; **no Lighthouse/field performance measurement was run** |

## 5. Privacy, legal and consent findings (qualified legal review required)

* `docs/LEGAL.md` itself states that the three legal pages are **drafted, not attorney-reviewed**, and "must not be published to real customers until one has". Open items it lists: attorney review of all three pages; **governing law/jurisdiction deliberately absent** from the Terms; cookie policy upkeep; SMS/promotional wording intentionally absent; contact details.
* The uncommitted privacy-page changes (dated "November 8, 2026") **reduce** claims (no marketing-text or "deals" promise, no database statement) and **add** new factual statements: Cloudflare processing, that the request IP and an approximate location are stored in the CRM and included in the internal e-mail (possibly with approximate coordinates), and "text message" as a way a specialist may contact a visitor about their request. These need legal review. **Accuracy dependency:** the statement that the IP/location is stored with the request is true only when `LEAD_INGEST_SECRET` is configured identically on both sides; otherwise nothing is recorded.
* The quote notice (`QuoteConsentNotice.tsx`) is intentionally **not a checkbox** ("By providing your contact details and clicking 'Request ...', you agree to be contacted by Business Flights Travel regarding your request. We respect your privacy" with a link to `/privacy-policy`); it states a policy, records nothing (the CRM API has no consent field), and says nothing about SMS marketing. The no-checkbox design is preserved; no checkbox was introduced.
* Placeholder scan of customer-facing source: no `lorem`, `TODO`, bracketed placeholders or "coming soon". Imagery is placeholder stock (documented in `next.config.ts`).
* Contact details are consistent everywhere (`constants.ts`; the old phone/e-mail/address are forbidden by a spec).
* **Conclusion: legal wording is an unresolved release blocker for publication; it was not changed or declared final.**

## 6. Test results

All runs in this audit, in the updated project, on 2026-11-13 (sequential, no other test load except where stated).

| Check | Passed | Failed | Skipped | Flaky (passed on automatic retry) | Notes |
|---|---|---|---|---|---|
| `tsc --noEmit` | clean | 0 | - | - | |
| ESLint (whole project) | clean | 0 | - | - | |
| `NEXT_OUTPUT=standalone npm run build` | succeeded | - | - | - | fresh build in this audit |
| `validate:content` / `validate:seo` | pass / pass (218 routes, 0 failures) | 0 | - | - | |
| `npm audit` | 7 moderate (dev tooling only) | - | - | - | `--omit=dev`: **0** |
| Desktop Chrome (336 tests, dev server 3101) | 333 | 1 | 2 | 0 | failure = `phone-validation-loading.spec.ts:27` (dev-server only, below) |
| Mobile 320 (336) | 331 | 1 | 2 | 2 | same `:27`; flaky: phone spec `:164`, `seo.spec.ts:246` |
| Mobile 375 (336) | 331 | 1 | 2 | 2 | same `:27`; flaky: `contact-details-and-consent.spec.ts:86`, `redesign.spec.ts:176` |
| Mobile 390 (336) | 333 | 1 | 2 | 0 | same `:27` |
| Infrastructure (167: stub CRM, standalone production server, deploy-script dry runs, form-failure, body-limit, rate-limit) | 160 | 0 | 6 | 1 | skipped = the opt-in live-CRM contract spec (**blocked**: no authorised isolated CRM); flaky: `rate-limit-actions-e2e.spec.ts:94` |
| Phone spec on the **production** build, 6 repeats (84 runs) | 82 | 2 | 0 | - | see section 7 |
| Not run | | | | | live-CRM contract spec; Docker build (Docker not installed); Lighthouse/field performance; any production or live-CRM request |

The 2 skipped tests per browser project are viewport-conditional tests that the project deliberately skips.

## 7. Known flaky tests - investigated

**`phone-validation-loading.spec.ts:27` ("the validator is fetched on demand...") - explained, not an application bug.** It asserts that the chunk fetched when the phone field is focused does not contain libphonenumber's metadata. On the Turbopack **dev** server that chunk *is* the library chunk, so the marker is present and the test fails in all four viewports, every time; on the **production** build the same test passes (it passed in all 6 repeats there). The assertion was not changed.

**`redesign.spec.ts` "flight form fits and airport dropdown does not clip at 390px"** (flaky in the earlier full run): 10 of 10 passed in isolation with retries disabled; no defect found; classified as load-dependent timing.

**"A submit before the library has loaded..." family (`phone-validation-loading.spec.ts:118`, `:129`, `:164`, `:178`) - NOT explained.** With retries off these failed 3 of 32 runs on the dev server and 2 of 84 on the production build (always the same symptom: after pressing Enter before the validator has loaded, `#phone-error` never appears within 15 s). A stand-alone probe of the exact flow (delayed chunks, fill, Enter) showed the error in **44 of 44** runs, including 20 with 6x CPU throttling, so the failure cannot be produced in isolation. Failures cluster late in long back-to-back repeat runs. Working hypothesis (unproven): Enter pressed before React has attached its handler becomes a native form submission (page reload, no message), which any server-rendered React form does inside the hydration window; the tests act immediately after `goto`. No defect was demonstrated and none was changed. **This remains an open, unexplained intermittent test failure** and the suite is not described as clean. Recommended next step: make the tests wait for hydration (an explicit ready marker) and re-measure; if a marker-based wait still fails, treat it as a product bug.

**Other flaky results this run** (each passed on its automatic retry): `seo.spec.ts:246` (share images; first-request compile on the dev server), `contact-details-and-consent.spec.ts:86` and `redesign.spec.ts:176` (layout/page-render timing on Mobile 375), `rate-limit-actions-e2e.spec.ts:94` (infrastructure, standalone server under load). They were not individually reproduced; the machine had about 1 GB of free memory during the full runs.

## 8. Remaining limitations

No live CRM or database; no Docker build; no live render of the original; no performance measurement; one explained failing test on the dev server; legal wording unreviewed; two test-tooling items undecided.

## 9. Functional and API decision

**Functional compatibility: confirmed** for the flight, contact and newsletter flows at source, stub-CRM and browser level. **CRM API compatibility: verified statically and against stand-ins only; live compatibility unverified.** **SEO/accessibility: improvements confirmed present; performance not measured.** **Privacy/legal: not ready for publication as final policy content.**
