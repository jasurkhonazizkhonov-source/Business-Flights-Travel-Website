# Environment Variables

This project reads a small, fixed set of environment variables. **It has no database**: it sends every form to the Compass Tools CRM over an
authenticated HTTP API (see `docs/CRM_API_INTEGRATION.md`), so there is no `DATABASE_URL`, no schema variable and no database credential
anywhere — and none may be added (`deploy/preflight.sh` refuses to deploy with one, and `tests/crm-api-client.spec.ts` fails if source,
scripts, dependencies or compose reintroduce one). Everything else — the production site URL, SEO metadata, static reference data — is checked
into the repo as code, not sourced from configuration. No secret is ever imported into a Client Component or sent to the browser: the CRM
credentials are read in exactly one `server-only` module (`src/server/crm-api.ts`), and `src/lib/email/mailer.ts` and every
`src/server/actions/*.ts` file are server-only too.

Copy `.env.example` to `.env` and fill in the real values, or set them directly in the host's environment (on the VPS: the protected `.env`
beside `compose.yaml`, `.env.vps.example`). **Placeholders only belong in this repository.**

## Compass Tools CRM — `CRM_API_URL`, `CRM_API_KEY`, `CRM_COMPANY_ID`, `LEAD_INGEST_SECRET`

| Variable | Needed for | What it is | Rules |
|---|---|---|---|
| `CRM_API_URL` | every form | The CRM's **origin** — scheme, host and port, no path, no credentials. On the self-hosted VPS the CRM answers on its private website-API network as `http://compass-crm:3000` (the default in `compose.yaml`). | Server-side only. Anything that is not an `http(s)` origin is refused with a message that does not repeat the value. |
| `CRM_API_KEY` | flight requests | The bearer key for `POST /api/v1/website/flight-inquiries` — **the same value as the CRM's `WEBSITE_API_KEY`** (the CRM operator generates it, `openssl rand -hex 32`). At least 32 characters; the CRM treats a shorter one as "not configured". | Server-side only. Never `NEXT_PUBLIC_*`, never in client code, a response, a log line or Git. Rotated on the CRM with `WEBSITE_API_KEY_NEXT` (see the CRM's `docs/WEBSITE_LEAD_API.md`). |
| `CRM_COMPANY_ID` | contact form, newsletter | The CRM Company id (the CRM's `WEBSITE_API_COMPANY_ID`). Those two forms use the CRM's public endpoints, which name the company in the request body. Flight requests do not send it: the CRM fixes the company from the API key. | Not secret, but configuration: never hard-coded. |
| `LEAD_INGEST_SECRET` | optional | Signs the visitor's IP and approximate location so the CRM can record them with a flight request. At least 32 characters; **identical to the CRM's `LEAD_INGEST_SECRET`**. | Server-side only. Unset (or too short, which is logged as a warning) = leads are created without an IP or location; nothing else changes. |

**None of them is needed to build or serve the site.** `next build` and every static page (including the flight form's application-owned
airport autocomplete) work with all four unset; only submitting a form needs them. A missing or malformed value does not throw: the visitor gets the
same friendly error any CRM failure produces, and the server log carries one line per problem naming the **variable and the rule** (for example
`[crm-api] flight request: CRM_API_KEY is not set`), once per process, never a value.

**What the website does not have, on purpose:** a database driver or client, a connection string, a schema or migration, a "company lookup", a
queue or contact-matching code. The CRM owns all of that. If the CRM is unreachable, nothing is stored on the website side — see
`docs/CRM_API_INTEGRATION.md` for the retry and idempotency rules.

## Internal Flight Request notification — `GMAIL_SENDER_EMAIL`, `GMAIL_APP_PASSWORD` (both optional)

A separate, internal-only email to the Business Flights Travel team after a flight request has been validated and **accepted by the CRM** — distinct from, and never affecting, the customer's own success response. See `src/lib/email/flight-request-notification.ts` (the pure template/decision logic) and `src/lib/email/mailer.ts` (the only module that touches Nodemailer/Gmail). Wired into `src/server/actions/submit-flight-request.ts`, after the CRM has accepted the request.

**The same Gmail address is both the sender and the recipient** — there is no separate notification-recipient variable. That account authenticates, sends the notification, and receives it back in its own inbox as a normal new email.

| Variable | What it is |
|---|---|
| `GMAIL_SENDER_EMAIL` | The Gmail/Google Workspace account that authenticates, sends, **and receives** the notification (SMTP "from" *and* "to"). This project had no existing sender-email variable to reuse — checked directly: no email/SMTP code existed anywhere in this repository before this feature (the CRM's own email sending lives in the separate Compass Tools codebase, not here). |
| `GMAIL_APP_PASSWORD` | A Google-generated **App Password** for `GMAIL_SENDER_EMAIL` — never that account's normal login password. Requires 2-Step Verification enabled on the account first; generate one at `myaccount.google.com/apppasswords`. |

Both are **optional** and **unset by default**: if `GMAIL_SENDER_EMAIL` isn't set, the feature is simply inactive — no error, nothing sent, the customer's flow is completely unaffected. Both are server-side only, never `NEXT_PUBLIC_*`, and must be configured separately for local and production. Both are trimmed of surrounding whitespace *and* quote characters before use, since a trailing space/newline or a value pasted with surrounding quotes (a common habit from a shell `export KEY="value"`) is a real, easy, and otherwise invisible mistake that makes Gmail reject authentication outright. Never put the real App Password — or any real value here — in `.env.example`, a commit, a log line, or an error shown to a customer; a send failure is logged with only the message/SMTP protocol code, never the credentials or the Nodemailer config object, and is never surfaced to the visitor (the Flight Request they already submitted stays in the CRM either way — see that module's own header for why).

**If the App Password is correctly set but the email still doesn't arrive**, check (in this order): (1) **server logs** — every attempt logs exactly one line starting `[flight-request-notification]`, ending in either "SMTP accepted the message" (with Gmail's own server reply and message id — proof the message left this app and Gmail's server accepted it, not proof the recipient's inbox displayed it, which is invisible to any sender on any provider past that point), "is not set — skipping" (the feature isn't configured), or "Failed to send internal notification (**category**): ..." where category is `authentication_failed` (wrong password, or see next point), `connection_failed` (couldn't reach `smtp.gmail.com`), `envelope_rejected` (Gmail refused the sender/recipient address), `message_rejected`, or `other`; (2) **`GMAIL_SENDER_EMAIL` must be the exact account that generated the App Password** — a Gmail "Send As" alias configured under a different account will authenticate-fail even with a correct-looking password, because the alias itself has no App Password of its own; (3) a **Google Workspace account** additionally needs its admin to allow SMTP/App-Password access at the organization level — if authentication still fails after confirming (1) and (2), that organization policy is the next thing to check with whoever administers the account; (4) **spam/junk/promotions folders** — once Gmail's SMTP server has accepted the message (category above), everything past that (spam filtering, inbox rules) happens on the recipient's side and is not observable from this application.

**How it runs, and what it does and does not guarantee.**

- **Order:** validate → send the request to the CRM → return the customer's success response → send the notification. The send is scheduled with Next.js `after()` (`submit-flight-request.ts`), so a slow or unreachable Gmail never delays the customer; it also means the log line above is the *only* trace of the outcome. `after()` work is bounded by the route's `maxDuration`, which is why `src/app/page.tsx` and `src/app/flights/page.tsx` (the two pages hosting the form, whose Server Action inherits their limit) export `maxDuration = 30` — the SMTP worst case is about 21 s.
- **Headers:** `From` and `To` are both `GMAIL_SENDER_EMAIL`; `Reply-To` is the customer's own email (so Reply in Gmail reaches them), and is left out — the notification still goes — if that value isn't a single plain address. Subject is `New Flight Request — JFK → LHR — 1 Traveler`, UTF-8 encoded by Nodemailer. The message is `multipart/alternative` (full plain-text part + HTML part).
- **Log levels:** a successful send is logged at `info`, an unset variable at `warn`, every failure at `error`. No log line contains customer data — only the sender address, SMTP protocol metadata and the failure category.
- **Retry:** at most one retry, 500 ms later, only for connection-class errors (`ECONNECTION`, `ESOCKET`, `ETIMEDOUT`, `EDNS`, `ECONNRESET`); never for authentication, envelope or message rejections. Timeouts are 10 s each (connection, greeting, socket).
- **Not exactly-once.** SMTP cannot tell the client whether Gmail accepted a message when the connection drops before the final reply, and Nodemailer reports that case with the same error as a failed connect, so the retry cannot be limited to provably-undelivered attempts. The retry reuses the first attempt's `Message-ID`, which gives Gmail the chance to collapse a duplicate (commonly observed, not documented as a guarantee). One rare duplicate internal notification is possible and is accepted over silently losing one.
- **Duplicate form submissions.** Two layers. (1) In the browser, a ref guard blocks a second submit while one is in flight (Next.js *queues* a second Server Action rather than dropping it). (2) The form sends one random `submissionId` per mounted form, identical on every attempt of that submission — including the one automatic retry Next.js makes of a failed action POST and a visitor pressing the button again — and the website sends it to the CRM as the `Idempotency-Key`. The CRM derives the lead from that key, so a repeated or concurrent attempt is answered `200 duplicate:true` with the same lead, and the website then sends **no second notification**. A *changed* form under the same key is refused by the CRM (`409`) and the visitor is asked to reload. A caller without a key (an old cached form) gets a fresh key for that one call, which still makes the retries inside it safe.
- **Latency.** The response waits for one HTTP call to the CRM on the private network (a few hundred milliseconds in normal use; the CRM creates the lead, its history and its activity in a single insert and starts queue assignment itself). The per-attempt timeout is 10 s and a failing CRM is retried up to 3 times (1 s, then 2 s apart), so the worst case a visitor waits is roughly 35 s before the friendly error. Everything else (the notification e-mail) runs after the response.
- **Not controllable from here:** whether the message lands in the inbox, in spam, or shows as unread — SMTP delivery makes it a normal incoming message, and Gmail's read/unread state cannot be set by the sender.

## Submission IP and approximate location — `TRUSTED_PROXY` (optional)

Every new Flight Request records what the **server** learned about the request: the full IP address it received and the platform's approximate, IP-derived location. It is never taken from a form field or anything the browser's JavaScript could supply (the schema and the form have no such field).

- **Known vs estimated.** The IP address (IPv4 or IPv6, canonicalised: IPv6 lower-cased and zero-compressed, an IPv4-mapped IPv6 address collapsed to plain IPv4, ports and zone ids dropped) is what the server received. City, region, country and time zone are only an estimate of where that *network* is — wrong or coarse behind VPNs, proxies, mobile and corporate networks, privacy relays and for IPv6 — and are labelled approximate everywhere they appear.
- **Trust model** (`src/lib/client-ip.ts`, a port of the CRM's `src/lib/request-ip.ts`). Forwarded-for headers are only believed when a proxy in front of the app overwrites them. On Vercel (`VERCEL=1`, which only the platform sets, or an explicit `TRUSTED_PROXY=vercel`) only `x-vercel-forwarded-for`, `x-real-ip` and `x-forwarded-for` are read — never `Forwarded` or `CF-Connecting-IP`, which Vercel passes through from the client. `TRUSTED_PROXY=cloudflare` reads `cf-connecting-ip` only; `nginx`/`generic` read the standard headers for an operator who has asserted their proxy overwrites them; `none` disables capture. An explicit value always wins. Everywhere else (local `next dev`) nothing is believed and **no IP is stored** — that is the secure default, not a bug. A value that is not a valid address, or is private/loopback/link-local/CGNAT/multicast/documentation range, is treated as "could not be determined" — never stored, never invented.
- **Location source: no external provider.** City, region, country and time zone come from headers the edge in front of the app adds: Cloudflare's `cf-ip*` headers behind the self-hosted tunnel (`TRUSTED_PROXY=cloudflare`), or Vercel's `x-vercel-ip-*` headers on Vercel. They are read only when the matching proxy is trusted, since anywhere else a client could send them. No third party receives a customer's IP, no API key or credential exists, there is no extra network call, and the lookup cannot fail or slow a submission. **Not captured:** ISP/organisation and ASN — the platform does not supply them, and they would need a vendor decision and a privacy review of sending customer IPs to that vendor. Precise coordinates and postal codes are deliberately not read. US states, Canadian provinces and Australian states are shown by name; other regions keep only the code as supplied.
- **Where it goes.** (1) The internal notification email, in a "Submission & IP Information" section (HTML and plain text), with the approximate-location caveat. (2) The CRM, **only** inside the signed visitor context described in `docs/CRM_API_INTEGRATION.md` (`x-ct-visitor-context` / `x-ct-visitor-signature`, HMAC with `LEAD_INGEST_SECRET`), built from what this server itself observed. The CRM stores it in its own permission-gated lead section; the website stores nothing. Without `LEAD_INGEST_SECRET` the CRM records no IP or location, and the e-mail still carries them.
- **Not shown publicly, not logged.** The values appear only in the internal email and in the CRM's permission-gated "Submission & IP Information" lead section; never on a customer-facing page, URL, analytics call or browser storage. The server log carries only whether an IP and a location were captured and, if not, a value-free reason (`no_trusted_proxy`, `no_header`, `invalid`, `private_or_reserved`) — never an address or location. (The unrelated per-IP rate limiter reads `x-forwarded-for` in memory only and logs nothing.)
- **When unavailable:** the section simply omits the missing rows (no placeholders); with neither IP nor location it is titled "Submission Details".
- **Retention** follows the Lead in the CRM; whether a fixed retention period applies is a decision for whoever owns the privacy policy and the CRM. The website keeps no copy.
- **Budget currency.** The form lets the customer choose the currency of the budget (default USD, 24 ISO codes); it is preserved end to end, never converted: the email shows e.g. "AUD 8,000" and the CRM receives it as `budgetCurrency` next to `approximateBudget` (the CRM keeps the currency with the submission details, never mixed into the number). A budget with no currency (an older cached form) is shown flagged "currency not specified", never assumed to be dollars.

## Production site URL — not an environment variable

`SITE_URL` in `src/lib/constants.ts` is a plain static constant
(`https://www.businessflights.travel`), not read from configuration.
Canonical URLs, the sitemap, Open Graph tags, and structured data all derive
from it. If the production domain ever changes, update that one constant —
there's nothing to set in `.env`, and no risk of a stray `localhost` URL
reaching production metadata because there's no environment-dependent
fallback to misconfigure.

## Google Search Console — not currently supported

There is no `GOOGLE_SITE_VERIFICATION` variable and no verification meta tag
in `src/app/layout.tsx`'s metadata. The sitemap (`src/app/sitemap.ts`) and
`robots.txt` (`src/app/robots.ts`) work independently of Search Console
verification — you can still submit the sitemap URL from your Search
Console account and verify domain ownership through Google's other methods
(DNS record, etc.) without any change to this codebase. If you want the
HTML-tag verification method specifically, add a `verification: { google:
"..." }` field to the metadata object in `layout.tsx` once you have a real
token — don't invent one ahead of time.

## Analytics — not currently implemented

There is no analytics code in this project at all — no script, no
tracking pixel, no cookie-consent banner, no environment variable to
configure. The Cookie Policy (`/cookie-policy`) states plainly that the
site sets no cookies today. If analytics is added in the future, build the
consent-gating in the same change that adds the tracking script — don't
let the policy drift out of sync with what the code actually does.

## Static operational reference data — no environment variable needed

Destinations, airlines, airline logos, and airports are **not** fetched from the CRM or any database — they're application-owned data, checked
into the repo, so the site's core content renders correctly even when the CRM is down or not configured. See:

- `src/data/destinations.ts` — every destination's city, country, region, IATA code, starting fare, and content
- `src/data/airlines.ts` — the airlines shown in the footer, with their logo paths
- `public/airlines/*.png` — the actual logo image files
- `src/data/airports.ts` — a curated list of major world airports (IATA code, name, city, country) that powers the flight request form's
  origin/destination search-as-you-type entirely client-side, with no network request and no database involved.

`submit-flight-request.ts` validates the submitted IATA codes against `src/data/airports.ts` and sends **only the codes** to the CRM, which
resolves them to its own airport records.

## How website submissions reach the CRM

There is no separate sync step or background job — each form's server action (`src/server/actions/`) calls the CRM in the same request and reports
the result to the visitor (details, endpoints, retries and the gaps: `docs/CRM_API_INTEGRATION.md`):

- **Flight requests** (`submit-flight-request.ts`) → `POST /api/v1/website/flight-inquiries` (bearer key, `Idempotency-Key`). The CRM creates the
  lead, its history and activity, matches or creates the contact, stores every multi-city leg, and starts the existing queue assignment.
- **Contact messages** (`submit-contact-message.ts`) → `POST /api/public/contact-inquiry` — the CRM's public endpoint (no authenticated one exists yet).
- **Newsletter sign-ups** (`subscribe-newsletter.ts`) → `POST /api/public/subscribe` — likewise.
