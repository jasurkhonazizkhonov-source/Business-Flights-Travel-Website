# Compass Tools CRM integration (API only)

**Architecture (decided, not up for redesign here):**

```
Business Flights Travel website  ──authenticated private HTTP API──▶  Compass Tools CRM  ──▶  CRM database
```

The website **never** connects to the CRM database. It has no database driver, no Prisma client, no `DATABASE_URL`, no schema guard and no
migrations; `deploy/preflight.sh` refuses to deploy if a database setting is present in its `.env`, and `tests/crm-api-client.spec.ts` fails if
any source file, script, dependency or compose setting reintroduces one. There is **no database fallback**: if the CRM cannot be reached the
visitor is told so and nothing is stored on the website side.

The contract below was read from the CRM repository at commit `4d33c29` (branch `feature/website-lead-api`, the "release" checkout), not
assumed: `docs/WEBSITE_LEAD_API.md`, `src/app/api/v1/website/flight-inquiries/route.ts`, `src/server/lead-intake.ts`,
`src/server/lead-ingest-context.ts`, `src/app/api/public/contact-inquiry/route.ts` (+ `src/server/public-inquiry.ts`) and
`src/app/api/public/subscribe/route.ts`. If the CRM changes, re-read those files; this document and `tests/support/stub-crm.ts` are the
website's copy of the contract.

## Which form uses which CRM endpoint

| Form | Server action | CRM endpoint | Authentication | Idempotent | Status |
|---|---|---|---|---|---|
| Flight request | `src/server/actions/submit-flight-request.ts` | `POST /api/v1/website/flight-inquiries` | **Bearer key** (`CRM_API_KEY` = the CRM's `WEBSITE_API_KEY`), company fixed by the CRM from the credential | **Yes** — required `Idempotency-Key` header | **Integrated** (authenticated) |
| Contact message | `src/server/actions/submit-contact-message.ts` | `POST /api/public/contact-inquiry` | **None** (the CRM's browser-facing endpoint; `companyId` in the body) | **No** | **Integrated, but NOT authenticated** — see "Gaps" |
| Newsletter sign-up | `src/server/actions/subscribe-newsletter.ts` | `POST /api/public/subscribe` | **None** (same kind of endpoint) | Server-side upsert; no key | **Integrated, but NOT authenticated** — see "Gaps" |

All three go through one server-only client, `src/lib/crm-api/client.ts`. The only module that reads the environment is
`src/server/crm-api.ts` (`import "server-only"`), so a credential cannot reach browser JavaScript, and nothing in `src/components` may import it.

## Flight request: `POST /api/v1/website/flight-inquiries`

```
POST {CRM_API_URL}/api/v1/website/flight-inquiries
Authorization: Bearer <CRM_API_KEY>
Idempotency-Key: <the form's submissionId (a UUID); a fresh UUID for this call only if the caller sent none>
Content-Type: application/json
x-ct-visitor-context / x-ct-visitor-signature      (optional, see "Visitor IP and location")
```

**Body** (built by `src/lib/crm-api/flight-inquiry.ts` from the already-validated form; the CRM is STRICT — an unknown field is a `400`):

| Website field | CRM field | Notes |
|---|---|---|
| `firstName`, `lastName` | same | |
| `phone` (normalised to E.164 by `src/lib/phone.ts`) | `phone` | the CRM validates it again |
| `email` | `email` | |
| `tripType` | `tripType` | `ONE_WAY` \| `ROUND_TRIP` \| `MULTI_CITY` — identical values |
| `segments[0].from.iata` / `.to.iata` / `.departureDate` | `departureAirportIata` / `arrivalAirportIata` / `departureDate` | the lead-level route is the first leg |
| `returnDate` | `returnDate` | round trips only |
| `segments[]` (multi-city) | `segments[]` = `{ departureAirportIata, arrivalAirportIata, departureDate }` | every leg, in order, by IATA code; the CRM resolves airports itself |
| `cabinClass` | `cabinClass` | `ECONOMY` \| `PREMIUM_ECONOMY` \| `BUSINESS` \| `FIRST` — identical values |
| `adults`, `children`, `infants` | same | |
| `flexibleDates` | `datesFlexible` | renamed |
| `preferredAirline` | `preferredAirline` | omitted when empty |
| `budget` | `approximateBudget` | renamed |
| `budgetCurrency` | `budgetCurrency` | only sent together with a budget |
| `notes` | `additionalNotes` | renamed; omitted when empty |

**Never sent:** `website` (honeypot), `renderedAt`, `submissionId` (it travels in the header), `companyId`, `source`, `status`, `priority`,
`assignedAgentId`, any IP address. The CRM sets source (`WEBSITE`), priority, status, company, assignment and timestamps itself.

**Not done by the website any more (the CRM owns it):** contact matching and creation, lead status and status history, the `LEAD_CREATED`
activity, multi-city legs, airport rows, the visitor-details record, queue assignment/distribution. The website keeps only: the public form's
validation, rate limit and spam checks, the customer-facing result, and the internal team notification e-mail (`GMAIL_*`), which is sent after
the CRM accepted the request and **not** for a repeat (`duplicate`).

**Responses and what the website does** (`src/lib/crm-api/client.ts`, tested in `tests/crm-api-client.spec.ts` and `tests/crm-api-actions-e2e.spec.ts`):

| CRM answer | Website behaviour |
|---|---|
| `201 {ok,leadId,duplicate:false}` | success; the internal e-mail is sent |
| `200 {ok,leadId,duplicate:true}` | success; **no** second e-mail (the first attempt already notified) |
| network error, timeout (10 s per attempt), `429` (honours `Retry-After`, capped at 5 s), `500`, `502`–`504`, an unreadable `2xx` | retried with the **same key and the same bytes**: up to 3 attempts, 1 s then 2 s apart. Then a friendly error. The CRM turns every repeat into the same lead, so a retry cannot create a second one. |
| `400` (`validation_failed`, `invalid_json`, `idempotency_key_required`), `413`, `415` | not retried; a friendly error; the log names the CRM's error `code` and the failing field **paths** only |
| `409 idempotency_key_reused` | not retried; the visitor is asked to reload the page (the same key was used for a *different* form — e.g. the visitor edited the form after an attempt whose answer was lost) |
| `401`, `404` | not retried; friendly error; the log tells the operator to check `CRM_API_URL` / `CRM_API_KEY` and the private network |
| anything else | friendly error |

Fewer attempts than the CRM's suggested 5 are deliberate: a visitor is waiting. After the last failure the visitor can press the button again
(the form keeps the same `submissionId`), which is safe for the same reason.

## Contact message: `POST /api/public/contact-inquiry`

Body: `{ companyId, firstName, lastName, email, phone, subject, message }` with `companyId` = `CRM_COMPANY_ID` and `phone` in E.164. `subject` is
one of `GENERAL_INQUIRY`, `FLIGHT_REQUEST_HELP`, `EXISTING_BOOKING`, `CORPORATE_TRAVEL`, `OTHER` (identical to the website's values). The CRM
files it in its "Get In Touch" inbox with source `BUSINESS_FLIGHTS_WEBSITE`, matches an existing contact for information, and notifies staff.
**Attempted exactly once**: the CRM route has no duplicate guard, so a retry after a timeout could store the message twice. A timeout therefore
shows the friendly error even though the message may have been stored.

## Newsletter: `POST /api/public/subscribe`

Body: `{ companyId, email, source: "website" }`. The CRM upserts the subscriber (an address that unsubscribed earlier is re-subscribed) and notifies
staff about a new one. One attempt.

## Visitor IP and approximate location

The CRM sees the website's server, not the visitor, so it records an IP and location only from a **signed visitor context** built by the website
(`src/lib/crm-api/visitor-context.ts`) from what the website itself observed (`src/lib/submission-info.ts`: Cloudflare's headers behind the
tunnel — never a form field, never the visitor's own `X-Forwarded-For`):

```
x-ct-visitor-context:   base64url( JSON { v: 1, ts: <unix seconds>, ip?, city?, region?, country?, timezone? } )
x-ct-visitor-signature: hex( HMAC-SHA256( LEAD_INGEST_SECRET, <the context header value exactly as sent> ) )
```

Sent only when `LEAD_INGEST_SECRET` (≥ 32 characters, identical to the CRM's) is configured. The CRM accepts it for 5 minutes, rejects a bad
signature or a private/reserved IP, and otherwise creates the lead with **no** IP and location. `country`/`region` are sent as codes and `city`
percent-encoded, because the CRM re-reads the context as Vercel-style header values.

## Configuration

See `docs/ENVIRONMENT.md`. `CRM_API_URL`, `CRM_API_KEY` (flight requests), `CRM_COMPANY_ID` (contact + newsletter), `LEAD_INGEST_SECRET`
(optional). Each is server-side only. A missing or malformed value is reported once in the log as the variable name and the rule, the visitor sees
the friendly error, and the page itself keeps working (`next build` and every static page need none of them).

## Gaps and blockers (changes the CRM repository would need — none was made here)

1. **Contact and newsletter have no authenticated endpoint.** The CRM's only server-to-server API is the flight inquiry. These two forms use
   its *public, unauthenticated* endpoints, which anyone who can reach the CRM can call (they are also internet-facing through the CRM's tunnel).
   They work and need no credential, but they do **not** meet the "authenticated private API" standard. Required (suggested) contract for the CRM,
   mirroring the flight API: `POST /api/v1/website/contact-inquiries` and `POST /api/v1/website/newsletter-subscriptions`, bearer-authenticated with
   the same `WEBSITE_API_KEY`, company fixed by the credential (no `companyId` in the body), strict body, required `Idempotency-Key` (so a retry is
   safe), private-network only, the same JSON error shape — and, for the newsletter, a response that says whether the address was already subscribed.
   Until then the website should be given only the private network, and the CRM's public rate limits protect these two routes.
2. **Behaviour differences from the old direct-database version** (inherent to the CRM's public endpoints): a contact message no longer creates or
   matches a `Contact` row or a `CONTACT_INQUIRY_CREATED` activity from the website (the CRM only links an existing contact for information); a
   repeat newsletter sign-up is confirmed as "subscribed" but can no longer say "you're already on the list".
3. **Deployment prerequisite on the CRM:** the flight API needs the CRM release that contains it **and** its migration
   `20261016000100_lead_ingest_fingerprint`, which the production database has not applied (it has 72 migrations). Without it the endpoint cannot
   store a lead and the website shows the friendly error. This work did not touch production.
4. **Geolocation label:** the CRM stamps a context's location with its own Vercel label; the website's Cloudflare source label is not carried.
5. The CRM creates leads for airports it does not know without an airport rather than failing; the website no longer creates Airport rows.
