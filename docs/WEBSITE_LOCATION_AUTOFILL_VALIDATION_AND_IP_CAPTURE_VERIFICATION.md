# Location autofill, input validation, 11-month flight dates and IP capture - implementation and verification

Date: 2026-11-16. Scope: the updated website (`Travel Agency Website-updated`) and the updated CRM (`compass-tools-updated`) only. The original projects were not touched. **Nothing was deployed, committed, pushed or merged; no production system, container, network, Cloudflare setting, database or `.env` was touched; nothing was sent to the live CRM.** This document is public-safe: it contains no secret, no customer data, no full visitor IP and no server address.

Legend used for evidence: **VERIFIED-LOCAL** (ran here against the real code), **VERIFIED-MOCK-CRM** (ran here against the project's stand-in CRM or mocked CRM stores), **NOT VERIFIED** (could not be tested here).

---

## 1. Executive summary

**Superseded in part (2026-11-23): the "Use my location" button and the network-derived departure-airport suggestion described below were removed; the departure airport now comes only from the device's own location, requested when the flight request form opens. Current behaviour: `DEVICE_LOCATION_DEPARTURE_AIRPORT.md`. The validation, date-window and IP-capture parts of this report are unchanged.**

**Decision: READY FOR FURTHER DEPLOYMENT PREPARATION. NOT READY FOR PRODUCTION DEPLOYMENT.** The code of this task is finished and tested locally; the blockers for production are unchanged from the previous report (the Docker rehearsal has never run; the live VPS state, the live CRM version and live authentication are unverified; a real-PostgreSQL run of the replay store is missing; legal review is outstanding) plus two new items (the CRM must be redeployed first because of the flight-route limiter fix, and the Cloudflare "visitor location headers" setting must be confirmed). Details in sections 21, 22 and 24.

What was done:

| # | Requirement | Result |
|---|---|---|
| 4 | Suggest departure city/airport from location | **Done.** Source 1: the device's own location, only when the visitor clicks "Use my location" (or already granted the permission to this site); source 2: the server's approximate, Cloudflare-derived location (a new `GET /api/visitor-hint` that returns a country code and the nearest major airport, never an IP, city or coordinates). Editable, labelled "Suggested", never overwrites a choice the visitor made. |
| 5 | Suggest the phone country code | **Done** from the same server answer; neutral (no country, no US default) when unknown. |
| 6 | International phone validation | **Done** (libphonenumber-js, already a dependency): reason-specific messages, validate on blur and on submit, server re-check. Validity means "valid in the numbering plan" and is never described as assigned or reachable. |
| 7 | Email validation | **Done**: one dependency-free rule set shared by browser and server; syntax only; a provable subset of what the CRM accepts. |
| 8 | 11-month flight-date limit | **Done** in the calendars, the client validation and the server schema, with calendar-month arithmetic and one shared module. |
| 9-10 | IP and location capture, end to end | **Verified** for flight, contact and newsletter (code review of every hop, plus the existing and 14 new tests). One real gap found and fixed: see 18. |
| 11 | Signing v2 claims | **Verified against the source** (table in section 17). No protocol change. |
| 12 | Rate limiting | **One security gap found and fixed (CRM):** the flight route had no per-visitor limit. |
| 15 | SEO and accessibility regression | Section 19-20. |
| 17 | Docker | **Not run: Docker is not installed** (also no WSL, no Podman). |

Two decisions you should know about, both explained below: the `Permissions-Policy` header changed from `geolocation=()` to `geolocation=(self)` (without it no browser would ever show the location prompt), and one sentence was added to the Privacy Policy describing the suggestions (not legal-reviewed; the "Last updated" date was deliberately **not** changed).

---

## 2. Modified website files (`Travel Agency Website-updated`, all uncommitted)

New: `src/lib/flight-date-window.ts`, `src/lib/email-validation.ts`, `src/lib/airport-suggestion.ts`, `src/lib/visitor-hint.ts`, `src/app/api/visitor-hint/route.ts`, `src/hooks/useVisitorHint.ts`, `src/hooks/useDeviceAirport.ts`, `src/data/airport-hubs.json` (generated, 28 KB, 1,167 airports), `scripts/build-airport-hubs.mjs`; tests `tests/flight-date-window.spec.ts`, `email-validation.spec.ts`, `phone-validation.spec.ts`, `airport-suggestion.spec.ts`, `location-autofill.spec.ts`, `form-validation-and-dates.spec.ts`, `visitor-hint-route.spec.ts`.

Changed: `src/components/flight-form/FlightRequestForm.tsx`, `AirportAutocomplete.tsx`, `SegmentRow.tsx`, `DateField.tsx`; `src/components/forms/PhoneNumberField.tsx`; `src/components/contact/ContactForm.tsx`; `src/components/newsletter/NewsletterForm.tsx`; `src/lib/phone.ts`, `phone-validator.ts`, `validate.ts`; `src/lib/validations/flight-request.ts`, `contact.ts`, `newsletter.ts`; `src/data/airports.ts`; `src/server/actions/submit-flight-request.ts`, `submit-contact-message.ts`; `src/app/privacy-policy/page.tsx` (one paragraph); `next.config.ts` (Permissions-Policy); `playwright.config.ts`; `deploy/rehearsal/run.sh` (two new checks, syntax-checked only); tests `crm-api-actions-e2e.spec.ts` (+9 tests) and `flight-request-notification.spec.ts` (fixture date, renamed call); docs `IP_AND_LOCATION_CAPTURE.md`, `ENVIRONMENT.md`, `WEBSITE_VPS_DEPLOYMENT_AND_ROLLBACK_RUNBOOK.md`, and correction notes appended to `WEBSITE_REQUEST_SIGNING_AND_REPLAY_PROTECTION_AUDIT.md` and `WEBSITE_FINAL_DOCKER_SECURITY_AND_REDEPLOYMENT_READINESS_REPORT.md`.

## 3. Modified CRM files (`compass-tools-updated`, all uncommitted)

This task: `src/app/api/v1/website/flight-inquiries/route.ts` (per-visitor limit after signature verification, `429` with `Retry-After`), `src/app/api/v1/website/flight-inquiries/__tests__/route.test.ts` (+7 tests; the rate-limit mock now also stands in for the per-visitor counter), `docs/WEBSITE_LEAD_API.md` (one paragraph). Everything else listed by `git status` in the CRM is the previous pass's signing-v2 work and is unchanged by this task.

---

## 4. Location-source implementation

| Source | Where it runs | When | What leaves the browser | Accuracy and caveat |
|---|---|---|---|---|
| Device location (browser Geolocation API) | In the browser (`src/hooks/useDeviceAirport.ts`) | Only on the visitor's click on "Use my location", or silently when the Permissions API already says `granted` for this site | **Nothing.** The coordinates are turned into an airport locally; no request carries them (a test asserts that no request URL or body contains the coordinates) | Can be precise; low accuracy mode is requested (`enableHighAccuracy: false`, 8 s time-out, up to 10 min old) |
| Approximate network location | Server (`src/lib/visitor-hint.ts`, `GET /api/visitor-hint`) | Once per page load, after the page has loaded and gone idle | The browser receives a **country code and an airport** (code, name, city, country). Not the IP, not the visitor's city, not coordinates | An estimate of where the *network* appears to be; VPNs, mobile carriers and privacy relays make it wrong |
| Neither | - | - | - | The form is the normal empty form |

Order of preference: device location first, then the approximate location, then nothing. A device result replaces an approximate suggestion; an approximate result never replaces a device result; neither ever replaces an airport the visitor chose (sole exception: the visitor's own click on "Use my location").

Rules enforced (and tested, `tests/location-autofill.spec.ts`): never prompted on load (permission `prompt` -> zero calls until a click, then exactly one); after a refusal the button disappears and a reload does not ask again (session flag); a time-out or unavailable position shows a plain message and allows a retry; a position far from any major airport shows "No major airport found near you"; a missing Geolocation API shows nothing; a failed, empty or malformed `/api/visitor-hint` answer leaves the normal form.

The server trusts the approximate location **only** behind the proxy the operator declared trusted (`TRUSTED_PROXY=cloudflare`, set by the VPS compose). With no trusted proxy, Cloudflare-looking headers sent straight to the server are ignored (tested on a real standalone server, including `TRUSTED_PROXY=nginx`).

## 5. Airport selection logic and data source

* **Data:** the project's own airport reference `src/data/airports.json` (9,057 IATA-coded airports, OurAirports, public domain), already in the project. No new dependency, no external service, nothing invented: codes and coordinates are copied from it.
* **"Major":** that file is ordered by size class (large, then medium, then small; documented in `src/data/airports.ts`). `scripts/build-airport-hubs.mjs` takes the first class (the large airports) and excludes entries that name only a military air base (e.g. Kadena Air Base); civil airports that share a base (e.g. Baghdad International Airport / New Al Muthana Air Base) stay. Result: `src/data/airport-hubs.json`, 1,167 `[iata, lat, lon]` rows, loaded **only** when a suggestion is computed (never with the page). A test regenerates it and fails if it is out of date.
* **Choice:** the **nearest** hub by great-circle distance, and none at all beyond **400 km**. Small airfields are never offered (e.g. a visitor near Würzburg is not offered Giebelstadt or Kitzingen, 16-19 km away; the nearest major airport is Nuremberg, about 87 km, then Frankfurt, about 103 km).
* **What it cannot know:** the data has no passenger volumes, route networks or rail links, so "suitable" means "a major commercial airport", not "the best-connected one". Known consequence (tested and documented): the nearest major airport to central San Francisco by distance is Oakland (OAK), not SFO; central Paris gives Orly (ORY), not Charles de Gaulle; central New York gives LaGuardia. The visitor can always change it. A better ranking needs passenger-volume data the project does not have; that would be a separate data decision.
* Results checked (`tests/airport-suggestion.spec.ts`, 13 cities and edge cases): Frankfurt FRA, Munich MUC, Hamburg HAM, Berlin BER, London LHR, Dubai DXB, Tashkent TAS, Los Angeles LAX, Tokyo HND, Sydney SYD, and the cases above. **Not hard-coded**: all of it is the distance rule over the dataset.

## 6. Country-code suggestion logic

The server's `countryCode` (from `cf-ipcountry`, never from the browser language) becomes the phone field's default country, **only while the field is untouched**: a number typed, or a country picked, before the answer arrives freezes the field and the late suggestion is ignored (tested with a delayed answer). With no suggestion the field is **neutral**: the library's "International" entry, no country assumed, **no United States default any more** (the previous code hard-coded `US`). `XX` and `T1` (Cloudflare's "unknown"/Tor) are never treated as countries. The same suggestion drives the contact form's phone field.

## 7. Manual override behavior

* Departure airport: choosing one in the list makes it the visitor's (the "Suggested" label disappears and nothing automatic touches it again). Editing the text so it no longer names the suggested airport **drops** the suggestion: before this change the field kept submitting the old airport while showing something else (a pre-existing bug for every airport field, fixed for all of them); typing the airport's label back exactly re-selects it. The suggestion is never placed when it equals the destination.
* The "Suggested" label sits in the label row (no layout shift: the To and date fields stay level, tested at all four widths); screen readers get a status text ("Suggested from your approximate location. You can change it.") and the field is described by it.
* Phone: changing the country **after a number was typed** makes the library reset the number to the new calling code (the same digits under another code would be a different, possibly valid, wrong number: `+1 415 570 9267` is also a valid number under +49, +86, +91 and +55). The field says so ("Country changed to France. The number you had entered was cleared, because it belonged to the previous country code.") and offers "Restore it". Nothing is changed silently. Typing, or a new country change on an empty field, dismisses the notice.

## 8. Phone validation implementation

`src/lib/phone.ts` (`libphonenumber-js` "min" metadata, already installed; loaded on demand as before). `checkPhoneNumber(raw, defaultCountry?)` returns a reason: `empty`, `not_a_number` (letters, vanity numbers, stray symbols), `needs_country` (national format with no country), `invalid_country_code` (+999...), `too_short` (including a bare calling code), `too_long`, `invalid_length`, `invalid_for_country` (plausible length but not a number the plan allows). A leading `00` is read as `+` when no country is chosen (interpreted, never rewritten in the field). Valid numbers are normalised to E.164 for the CRM; the display formatting stays the library's.

Possible / valid / assigned / reachable: only **valid in the numbering plan** is checked. A test asserts that no message contains "reachable", "verified", "exists" or similar. Messages: an incomplete number keeps each form's existing sentence (so existing tests are unchanged); the other reasons are specific ("This phone number has too many digits...", "We don't recognise that country code...", "...valid phone number for United Kingdom/Japan/+44...").

Timing: validated when focus **leaves the whole phone control** (moving between the country list and the number is not leaving), nothing is said while the field is empty or being typed in, the message clears as soon as the number is acceptable, and the number is validated again on submit and again on the server. A failed check keeps the typed number. Tested with 18 valid numbers (US, Canada, Germany landline and mobile, UK, France, Uzbekistan, Japan, China, UAE, India, Australia, Brazil, national formats with a country chosen, `00` prefix) and 18 invalid ones.

## 9. Email validation implementation

`src/lib/email-validation.ts`, dependency-free (no zod in the client bundle), used by the browser and the server for the flight, contact and newsletter forms. Syntax only: **nothing verifies that the mailbox exists, can receive mail, or belongs to the visitor** (the site sends no verification message) and no text says otherwise.

Rules: only the surrounding whitespace is trimmed (an `<input type="email">` also trims it itself); exactly one `@`; local part up to 64 characters of letters, digits and `_ ' + - .` with no leading/trailing/consecutive dots; domain of two or more labels (1-63 characters, no leading or trailing hyphen), final label letters only; 254 characters at most; no whitespace or invisible characters. Specific hints for each mistake ("needs an @ sign", "Remove any spaces", ...), appended to each form's existing sentence.

Deliberate limits, because the CRM validates with zod's `.email()`: addresses with non-ASCII characters in the local part, `xn--` top-level domains, quoted local parts and the rare characters `! # $ % & * / = ? ^ { | } ~` are not accepted (the CRM would refuse them after the visitor had been told "sent"). A non-ASCII domain typed into an `<input type="email">` is converted to its ASCII form by Chrome and then passes. **Property test:** over 20,000 generated awkward addresses plus the listed cases, everything this module accepts is also accepted by zod's check.

## 10. Eleven-month flight-date calculation and boundary behavior

`src/lib/flight-date-window.ts`, used by the calendars, the client validation and the server schema (so they cannot disagree). The window is **today through the same day 11 calendar months later, both inclusive**, computed on plain calendar dates, never milliseconds:

* 15 Nov 2026 -> 15 Oct 2027. A day that does not exist in the target month is **clamped** to its last day, never rolled over: 31 Jan -> 31 Dec; 31 Mar 2026 -> 28 Feb 2027; 31 Mar 2027 -> **29 Feb 2028** (leap); 31 Dec -> 30 Nov; 30 Jan + 1 month -> 28 Feb (the `setMonth` trap). Tested for **every day of 2027 and 2028**: always exactly 11 months, never 10 or 12.
* Time zones and DST: no time of day, offset or DST arithmetic is ever applied to a date. Tested in six zones (Los Angeles and Lord Howe with DST, Berlin, Tashkent, Kiritimati UTC+14, Pago Pago UTC-11) across DST changes and local midnight.
* **Browser vs server:** the browser uses the visitor's own calendar date. The server cannot know the visitor's zone, so it accepts the widest window any zone could produce: from the date at UTC-12 to 11 months after the date at UTC+14 (a visitor is never refused a date their own calendar offered). **Consequence, by design:** the server may accept a date up to **one day** beyond the strict limit of its own zone; a test pins both edges and sweeps every hour of a day against every zone. This also fixes an older bug: the server used its own local date for "not in the past", so an evening visitor behind UTC had "today" refused.
* Both departure and return obey the limit; return cannot precede departure; same-day return is allowed; multi-city legs must be in date order (new, also enforced by the calendar since before). The calendar pages stop at the last month, disable later days, and say "Flights can be requested until Oct 15, 2027." inside the open calendar (not in the static page, which would carry a stale build-time date).
* Browser tests with a fixed clock: today = 15 Nov 2026, 31 Mar 2027 (leap), 31 Mar 2028, 31 Dec 2026: last month, last enabled day, first disabled day, exactly 12 months paged, the last day selectable, return calendar identical, keyboard.
* The CRM accepts any date (it has no range rule); the rule lives in the website. A direct authenticated API caller is not limited by it (the API is server-to-server only).
* Test fixtures that used a "2099" date had to change (a date 90 days ahead now): that fixture was valid only because there was no upper limit.

---

## 11. Flight-request IP capture results (end to end, VERIFIED-MOCK-CRM)

Path: browser -> Cloudflare -> website server (`captureSubmissionInfo`, `src/lib/client-ip.ts`) -> visitor context (`src/lib/crm-api/visitor-context.ts`) -> signature v2 -> CRM API client -> CRM verification (`website-request-signature.ts`) -> `LeadSubmissionInfo` row -> CRM display.

* Website: with `TRUSTED_PROXY=cloudflare` **only** `cf-connecting-ip` is read (and `cf-connecting-ipv6` only when `cf-connecting-ip` is Cloudflare's Class-E Pseudo-IPv4 stand-in). `X-Forwarded-For`, `X-Real-IP` and `Forwarded` are never read in that mode, so neither a forged header nor the Cloudflare edge/Docker hop address can become the visitor. Private, loopback, link-local, CGNAT, documentation, multicast and Docker (172.16/12) addresses are refused as "unavailable".
* The IP travels **only inside the HMAC-signed context header**, never in the body, a URL or a log (the success log says "captured"/"unavailable" and a value-free reason; a test asserts the IP is not in the server log). The browser never receives it (new route, section 4).
* CRM: `buildLeadSubmissionInfoCreate` uses the verified context only (a server-to-server call never falls back to the connection's addresses), canonicalises and re-checks the IP, and writes one `LeadSubmissionInfo` row inside the lead's creation (nested create). It is create-only: a duplicate answer returns the existing lead and **cannot overwrite** a stored IP or location with an empty or different one (code read; the real-database test needs PostgreSQL and was **not run**).
* Display and policy unchanged: the lead page shows the **masked** IP and the approximate location to roles that can see that lead; the full IP is available only through the administrator-only, audited, recently-signed-in "Reveal". Not changed.

## 12. Contact-request IP capture results

Identical path and guarantees, route `POST /api/public/contact-inquiry` (stored in `InquirySubmissionInfo`). **Newsletter**: signed too (visitor IP in the signature only for the CRM's rate limit; **not stored**). Tests exist for all three.

## 13. IPv4 and IPv6 test results

Flight and contact each (new flight tests mirror the existing contact ones): IPv4; IPv6 in full, compressed and upper-case notation -> one canonical lower-case compressed string (`2A00:1450:4001:081B:0000:0000:0000:200E` -> `2a00:1450:4001:81b::200e`, **no truncation**); IPv4-mapped IPv6 -> plain IPv4; Cloudflare Pseudo-IPv4 -> the real IPv6; invalid/private/internal values -> unavailable; the CRM stores `ipVersion` v4/v6. Results are in the test summary below.

## 14. Approximate geolocation results

Country, country code, city, region, time zone and the source label (`Cloudflare edge geolocation (approximate)`) are captured and stored; `XX`/`T1` are dropped; non-ASCII city names survive (`São Paulo`); partial data is kept as partial (no invented fields). **Coordinates are not sent to or stored in the CRM** (by design: the signed context has no field for them; a latitude/longitude pair appears only in the internal notification e-mail, rounded to about 1 km). Browser (device) coordinates are never combined with the Cloudflare location and are never transmitted. Accuracy: an IP location is where the *network* appears to be, not the visitor; the Privacy Policy and the CRM labels say so.

## 15. Trusted-proxy security findings

* Correct for the intended deployment: the VPS compose fixes `TRUSTED_PROXY=cloudflare` (not configurable from `.env`), the preflight refuses any rendered `ports:` entry (no published port), and the origin is reached only by the Cloudflare Tunnel. Spoofed `Cf-*` / `X-Forwarded-For` headers are ignored when the trusted proxy is not Cloudflare (tests on real servers: none, nginx), and forwarded-for headers are ignored when it **is** Cloudflare.
* **Residual:** the application cannot itself prove that a request came through Cloudflare (behind a tunnel the peer is the tunnel container). The protection is the network topology (no published port, preflight, compose). If the container were ever published or attached to a network that untrusted callers can reach, `cf-connecting-ip` could be forged. The Docker rehearsal (not run) checks exactly this; keep it a release gate.
* The new `/api/visitor-hint` follows the same trust gate, returns no IP, is `private, no-store`, and logs nothing about the visitor.

## 16. CRM transmission and persistence verification

Transmission: HTTPS is not used inside the Docker network (HTTP over the private `compass-tools-website-api` network by design); authenticity and integrity come from the Bearer credential (flight route) and the v2 HMAC over method, path, company, exact body bytes, timestamp and nonce. Persistence: columns `ipAddress`, `ipVersion`, `city`, `region`, `country`, `countryCode`, `timeZone`, `geoSource`, `capturedAt` (no latitude/longitude, no retention period added, access rules unchanged). **PostgreSQL-backed integration tests were not run** (no approved disposable database; `compass_test` was not created).

## 17. Signing v2 and replay protection: claims checked against the current source

| Claim | Source check |
|---|---|
| Binds method, path, company, exact body bytes, timestamp, nonce | `CT-WEBSITE-REQUEST-V2` canonical message, length-prefixed fields; known-answer vector shared by both suites - **confirmed** |
| HMAC-SHA256, constant-time compare | `createHmac` + `timingSafeEqual` on equal-length buffers - **confirmed** |
| 120 s past / 30 s future | `WEBSITE_SIGNATURE_MAX_AGE_SECONDS = 120`, `..._MAX_FUTURE_SECONDS = 30` - **confirmed** |
| v1 / unsigned rejected once `LEAD_INGEST_SECRET` is set | `unsupported_version`; guard returns 401 `signature_required` - **confirmed** (with no secret the routes behave as before) |
| One-time nonce in `RateLimitCounter`, no migration | `INSERT ... ON CONFLICT ("key") DO NOTHING RETURNING "id"`, key `nonce:v2:<company>:<nonce>`, expiry = signing time + 180 s - **confirmed** |
| 503 when the nonce store is down | `unavailable` -> 503, fail closed - **confirmed** (mocked store) |
| Retries sign afresh; idempotency preserved | website signs inside the attempt loop; unchanged `Idempotency-Key`/`submissionId` - **confirmed** (CRM and website tests) |
| Per-visitor rate limit on the verified IP | **confirmed for contact and newsletter; was MISSING for the flight route - fixed, section 18** |

Test coverage of your 20 scenarios (all VERIFIED-MOCK-CRM unless stated): 1-5 complete IPv4/IPv6, location, missing location, unavailable IP: website e2e (flight and contact) + CRM route tests; 6-9 invalid header, spoofed forwarding header, trusted Cloudflare, untrusted direct: website e2e (flight and contact), `submission-ip.spec.ts`, `visitor-hint-route.spec.ts`; 10-14 modified body/method/path/company, expired: CRM `website-request-signature.test.ts`, route tests (flight, contact, subscribe); 15-16 reused nonce, wrong secret: CRM tests + website e2e (wrong secret is refused 401, not retried); 17 nonce-store failure: CRM tests with a mocked store (**the real PostgreSQL race is NOT VERIFIED**); 18 idempotent retry: both suites; 19-20 CRM timeout/unavailable and DNS failure: `crm-api-client.spec.ts`, `crm-api-actions-e2e.spec.ts`. The website never sends an unsigned fallback and never exposes the secret to the browser (existing structural tests; unchanged).

## 18. Rate-limiting findings

* **Fixed (CRM, flight route).** `POST /api/v1/website/flight-inquiries` was protected only by an account-wide budget (120 per minute for the whole website). One visitor or script could use all of it and make every other visitor's request fail with 429. Now, after the signature is verified, the visitor IP inside it keys a per-visitor limit (20 per 15 minutes, bucket `WEBSITE_FLIGHT:website`), `429` + `Retry-After` + code `rate_limited`. Seven new CRM tests: over-limit refusal and another visitor unaffected; IPv4/IPv6 separate and IPv6 canonicalised; private/internal addresses fall into the shared unattributed bucket; the unattributed bucket's 5x allowance; forged `X-Forwarded-For`/`Forwarded`/`X-Real-IP` do not move a visitor between buckets; an unsigned or badly signed request never reaches the limiter; retries count like any request. The earlier reports' wording ("per-visitor limiting exists") was only true for contact and newsletter; corrections were appended to them.
* Verified unchanged: contact (20/15 min) and newsletter keep their per-verified-visitor limits; the website's own in-memory limiter stays as the first line.
* **Residual risks:** (a) the website's own limiter is in memory (per instance, reset on restart); (b) if the website cannot resolve visitor IPs (a mis-set `TRUSTED_PROXY`), every visitor falls into one shared bucket (5x allowance): the limit is not disabled, but one abuser could then exhaust it for everyone until the window ends - the preflight/rehearsal checks the proxy setting, and the success log shows `ip unavailable (...)` if it happens; (c) the CRM must be **redeployed before the website** for the fix to apply.
* Not weakened to make a test pass; no limit value was changed.

## 19. Accessibility and mobile regression results

New states are tested: no axe WCAG 2.2 A/AA violation with a suggestion, a country-change notice, an email error and a phone error showing at once; the "use my location" control is a real button with a name, at least 24 px tall (WCAG 2.5.8) with its 16 px label row unchanged (negative margins), operable by keyboard; the status text is a `role="status"` region; error messages keep `aria-invalid`/`aria-describedby`; no horizontal overflow at 320/375/390; no console or hydration error on `/`, `/flights`, `/contact` and a destination page. Full-suite numbers are in the test summary. The tablet 768x1024 observation from the previous report (the floating call button hides by design when the form's submit button is on screen) was **not** changed.

## 20. SEO regression results

Results are in the test summary (route validation against the 218-route baseline, structured data, canonical, sitemap, robots). The new route is under `/api/`, which `robots.txt` already disallows and the sitemap never lists; the new text is inside the open calendar and the contact form only, no keyword text was added. No ranking or Core Web Vitals claim is made: **Lighthouse and Core Web Vitals were not measured.** Added client weight: a few KB of dependency-free validation and hook code; the airport-hub list (28 KB) is loaded only when a suggestion is computed; no new dependency.

## 21. Docker rehearsal

**Not run: Docker is not installed on this machine** (also no WSL, no Podman). Nothing was claimed. `deploy/rehearsal/run.sh` gained two checks (`/api/visitor-hint` reachable, JSON, private no-store, no IP; `Permissions-Policy` contains `geolocation=(self)` and still denies the camera); the script was syntax-checked with `bash -n` only. Running it on a machine with Docker remains a blocker for "ready for production".

## 22. Remaining vulnerabilities and limitations

1. Docker image build and rehearsal never run. 2. Live VPS networks, environment, branch and CRM version unverified; live CRM authentication is a post-deployment check. 3. Real PostgreSQL behaviour of the nonce store, idempotency locks and `LeadSubmissionInfo` is unverified (no approved disposable database). 4. Lighthouse and Core Web Vitals not measured. 5. Counsel review outstanding for Privacy, Cookie, Terms, the quote-button wording and **the new Privacy Policy paragraph**. 6. Server clocks must stay NTP-synchronised (120 s / 30 s window). 7. The Cloudflare "Add visitor location headers" Managed Transform setting is unverified; without it only the country-code suggestion works. 8. The CRM and website must be deployed in that order (CRM first). 9. Email syntax is validated, not deliverability; phone validity is numbering-plan validity, not reachability. 10. The airport suggestion is "nearest major airport", not "best connected" (OAK/SFO, ORY/CDG, LGA/JFK). 11. IP geolocation is an estimate of the network, not the person. 12. `Permissions-Policy` now allows `geolocation` for the site's own pages; no embedded or third-party frame can use it. 13. A trusted-proxy mis-setting would put all visitors into one rate-limit bucket (section 18). 14. The application cannot verify that a request came through Cloudflare; the network topology does (section 15). 15. Internationalised email addresses and rare RFC-valid local-part characters are refused (compatibility with the CRM); widening that needs a coordinated CRM change.

## 23. Recommended commit sequence (needs your approval; nothing was committed)

Website, on the existing review branch, never `main`, never forced: (1) `feat(forms): 11-month flight-date window shared by calendars, validation and server`; (2) `feat(forms): shared email and phone validation with specific messages`; (3) `feat(forms): departure airport and phone country suggestions (visitor-hint route, device location on click)` including the Permissions-Policy change; (4) `docs/test: verification report, runbook additions, corrections`; keep the previous pass's commits (signing v2, breadcrumbs, privacy pointer, rehearsal kit) ahead of these. CRM, in its own repository/branch: (1) the signing-v2 commit(s) from the previous pass; (2) `fix(website-api): per-visitor rate limit on the flight route`. Excluded from every commit: `docs/workspace-archive/`, `docs/brand-assets/`, the CRM's `docs/recovery-archive/`. Deploy order after approval: CRM, then website.

## 24. Post-deployment verification requirements

See the "Additional post-deployment checks" appended to `WEBSITE_VPS_DEPLOYMENT_AND_ROLLBACK_RUNBOOK.md` (the hint route, the `Permissions-Policy` header, the visible suggestion, the 11-month limit) plus the checks already listed there (live CRM authentication with one signed, clearly marked test submission approved by you, clock agreement, health, tunnel origin, no database reachability from the website).

---

## Test summary

All runs are local, on the final production (standalone) build, against stand-in CRMs only. "Skipped" and "not run" are never counted as passed.

| Check | Result |
|---|---|
| Website `tsc --noEmit` and `eslint .` | clean |
| Pure unit specs (dates, email, phone, airports, visitor-hint reading) | 156 passed |
| Browser projects (Desktop Chrome + Mobile 320/375/390), 2,356 tests | **2,348 passed, 0 failed, 8 skipped** |
| Tablet 768x1024 | 586 passed, **1 failed**, 2 skipped. The failure is the one already known and unchanged: `accessibility.spec.ts` "Floating call button - steps aside while a date or traveler popup is open". At 768x1024 the form's own submit button is in the first viewport, and the call pill hides for it by design; the test assumes it is visible. The layout was **not** changed to satisfy the test. |
| Infrastructure project (205 tests, standalone servers + stand-in CRM) | **199 passed, 0 failed, 6 skipped** (the opt-in live-CRM contract tests: NOT RUN). Run on the build before the final one-line focus fix; the specs that exercise the changed behaviour (visitor-hint route, CRM actions, form failure recovery, VPS deployment, Docker topology) were re-run on the final build: 112 passed. |
| SEO: `validate-seo` over the sitemap | 218 routes, 0 failures (same as the baseline); sitemap 218 unique URLs on the canonical host |
| SEO inventory audit | 0 non-200, 0 duplicate titles/descriptions/H1s, 0 broken internal links, every route reachable from the home page, max depth 2. Three pages report one `<img alt="">`: the decorative hero background, intentional and pre-existing |
| Structured data / canonical | BreadcrumbList on 217 of 218 pages (home excluded by design), canonical on all, 0 `noindex`, all JSON-LD blocks valid JSON |
| New route in robots/sitemap | `/api/` disallowed; not in the sitemap; no new text in static HTML (no stale build-date text) |
| CRM `tsc` and `eslint` (changed areas) | clean |
| CRM full unit suite (`vitest run src`) | 310 files passed, 53 skipped; **4,499 tests passed, 0 failed, 1,089 skipped** (the skipped ones need a real PostgreSQL database: NOT RUN) |
| Docker image build and rehearsal (`deploy/rehearsal/run.sh`) | **BLOCKED / NOT RUN**: Docker, WSL and Podman are not installed. Script syntax-checked with `bash -n` only |
| PostgreSQL-backed integration tests (nonce race, idempotency locks, `LeadSubmissionInfo`) | **NOT RUN** (no approved disposable database) |
| Live CRM authentication / any live POST | **NOT RUN** (forbidden here; post-deployment check) |
| Lighthouse / Core Web Vitals | **NOT MEASURED** |

Problems the tests found in this pass and that were fixed: the "focus the first invalid field" helper focused the new "Use my location" button instead of the input (caught by an existing accessibility test on all four viewports; fixed in `src/lib/focus-field-error.ts`, with a new regression test); my own hydration test wrongly expected a phone field on a destination page (test fixed); an existing test fixture used a 2099 date that the 11-month rule correctly rejects (now 90 days ahead) and two structural tests referred to a renamed variable (`validateClientSide(phoneErrorFor)`); no assertion was weakened or removed.

Observation (not caused by this work, not touched): the original CRM folder's `.git/config` is filled with NUL bytes (modified 2026-10-21), so `git` cannot read that repository. Both original projects are otherwise unmodified (the original website still shows its 32 pre-existing changes).

Final git state: nothing committed or pushed in either repository; no server of mine is left running.

