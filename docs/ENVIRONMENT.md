# Environment Variables

This project reads a small, fixed set of environment variables (`DATABASE_URL`
is the only one required to submit a form; the rest are optional —
`DATABASE_AUTO_INIT` and the two below). Everything else — the production
site URL, SEO metadata, static reference data — is checked into the repo as
code, not sourced from configuration. No secret is ever imported into a
Client Component or sent to the browser (`src/lib/prisma.ts`,
`src/lib/email/mailer.ts`, and every `server/actions/*.ts` file are
server-only).

Copy `.env.example` to `.env` and fill in the real value, or set it directly
in your hosting provider's environment variable settings for production.

## Database — `DATABASE_URL` (required for dynamic features only)

The shared "Compass Tools" CRM's PostgreSQL connection string. This website
writes directly into CRM tables — `Lead` for flight requests, `ContactInquiry`
for contact-form messages, `Subscriber` for newsletter signups (see the
header comment in `prisma/schema.prisma`) — rather than a parallel database.
Ask whoever administers the CRM database for this value.

**Not required to build or serve the site — only to complete a form
submission.** `src/lib/prisma.ts` exports `prisma` as a lazily-initialized
proxy: importing it never touches `DATABASE_URL`, and constructing the real
client (which throws a clear error if `DATABASE_URL` is missing) only
happens the moment a server action actually calls a `prisma.*` method —
inside that action's own `try`/`catch`, which turns it into the same
friendly, generic error message any other database failure produces. This
means `next build` succeeds and the site serves every static/reference-data
page (including the flight request form's application-owned airport
autocomplete) with `DATABASE_URL` completely unset; only submitting a form
requires it, and only that submission fails — not the whole page.
(Previously the client was constructed eagerly at module-import time, which
made *any* page reachable from a "use server" action that imports
`prisma.ts` — in effect, every page with a form — crash outright without
`DATABASE_URL`, before that action's own error handling ever ran. Fixed as
part of the database-portability work in this pass.)

Still set `DATABASE_URL` in your hosting provider's environment variables
before real customers can submit forms — there's just no build-time
ordering requirement to worry about anymore.

## Database schema safety — `DATABASE_AUTO_INIT` (optional, unset by default)

The website never owns the CRM schema: `prisma/migrations/` is a verbatim copy of the Compass Tools migration history, and `src/lib/migration-bundle.generated.ts` embeds that SQL for the runtime (regenerate with `npm run bundle:migrations`; a test fails if it drifts). `src/lib/schema-shape.generated.ts` is a second, complementary generated file: the canonical, PostgreSQL-catalog-introspected shape (columns, primary key, indexes, foreign keys) of each table the website itself depends on, used for **targeted repair** — regenerate with `npm run bundle:schema-shape` (also test-verified against drift).

Before a write path touches the database, `src/lib/schema-guard.ts` (wired in via `getCrmCompanyId()` and the flight-request action) inspects the connected database's **actual PostgreSQL catalog** (`information_schema`/`pg_catalog`) once per server instance — deliberately NOT relying on Prisma's `_prisma_migrations` bookkeeping alone, since that table can say every migration succeeded while a table it created has since been deleted by hand. It classifies the database into one of five states:

| State | Meaning | Behavior |
|---|---|---|
| healthy | every required table present, with its expected columns/indexes/constraints | nothing is created, altered or reset; the write proceeds |
| empty | zero tables in `public` | **refused** unless `DATABASE_AUTO_INIT=true`; with it, the real migration history is applied under an advisory lock, the schema is re-verified, then the write proceeds in the same request |
| needs_repair | one or more required tables, or an existing required table's index/constraint/primary key/sequence, is missing — **even if `_prisma_migrations` says everything is applied** (e.g. a table was manually dropped) | **refused** unless `DATABASE_AUTO_INIT=true`; with it, ONLY the missing object(s) are recreated (additive DDL only — `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX`, `ADD CONSTRAINT`), under the same advisory lock, then re-verified. This restores **schema**, not **data**: a manually-deleted table's rows are already gone and this cannot recover them (only a PostgreSQL/Aiven backup or point-in-time recovery can) — it only makes the table exist again so new writes succeed. |
| unsafe_damage | a required table exists but a column the website actually reads/writes is missing or has a different type | **always refused**, regardless of the opt-in — changing an existing column risks real data, so this is never auto-repaired; a safe diagnostic is logged and an administrator must resolve it manually |
| unrelated | **none** of the website's required tables exist, whatever else is present | **always refused** — another application's database is never touched |

**A table this guard doesn't recognize is never, by itself, a problem.** An earlier version also refused whenever the database contained a table outside a hand-maintained "every other known Compass Tools CRM table" list — that list was captured once from this repo's own copy of the CRM's migration history, and it went stale the moment the CRM (developed in a separate repository) shipped a migration this repo didn't know about yet. In production, that took down every website write path identically (confirmed live, 2026-10-01) — Flight Request, Newsletter, anything behind `ensureSchemaReady()` — because the CRM's real schema had moved ahead of this repo's snapshot. The fix: the guard now evaluates ONLY its own managed schema (`REQUIRED_TABLES`, scoped by `WEBSITE_REQUIRED_COLUMNS`) and never requires a complete inventory of the shared database. The only thing that still means "this probably isn't the right database" is the **absence** of every table the website depends on (`unrelated`, above) — a check that needs no inventory of what else exists, so it can't go stale as the CRM's own schema evolves.

`DATABASE_AUTO_INIT=true` gates **both** full empty-database initialization and object-level repair identically (the same opt-in, the same advisory lock, the same mandatory post-action re-verification) — this was a deliberate decision to keep one simple, well-understood safety story rather than inventing a separate "high confidence" heuristic for automatic repair. It exists so a wrong or stale `DATABASE_URL` can never silently turn an unintended database into a working orphan CRM (this happened once in production), and so a genuinely damaged database is never silently patched without an operator's explicit opt-in. Leave it **unset** for the normal production deployment, whose `DATABASE_URL` points at the real, already-migrated CRM database. Set it only when you deliberately point a deployment at a brand-new, empty database, or need to repair a database with a manually-deleted managed table/index/constraint, and remove it afterwards. The same gate applies to the Vercel build step (`scripts/vercel-build.mjs`). Refusals reach visitors as the usual generic error; the cause (plus the safe `db target:` host/port/dbname only) is in the server logs as `schema-guard (<reason>)` — never a password, connection string, or other credential.

**Schema, not data.** The guard can recover missing *schema* only. If someone deletes a table that held records, repair recreates the empty structure (and its sequence, indexes, constraints and foreign keys) so new writes succeed — the deleted rows are gone and can only come back from a PostgreSQL/Aiven backup or point-in-time recovery. Nothing here implies otherwise, and it never deletes, truncates, overwrites or "fixes" existing rows (a constraint that existing rows violate is refused and rolled back, not satisfied by altering data).

**Objects the website manages** (`REQUIRED_TABLES`, re-derived from the actual write paths — `subscribe-newsletter`, `submit-contact-message`, `submit-flight-request`, `resolveContact`, `distributeNewWebsiteLead`): `Company`, `Account`, `Contact`, `ContactEmail`, `ContactPhone`, `ContactInquiry`, `Lead`, `LeadStatusHistory`, `LeadQueueEntry`, `Activity`, `Airport`, `Subscriber`, `Notification` — plus, for those tables only, their sequence (`Airport_id_seq`), primary keys, unique constraints, indexes and foreign keys. The other ~29 Compass Tools tables (`Booking`, `Quote`, `Task`, …) are recognized as legitimate CRM tables but are never inspected for readiness or repaired: the website does not use them, and the guard is not a general CRM repair tool. Column checks are limited to columns the website reads/writes (`WEBSITE_REQUIRED_COLUMNS`), and index/constraint checks to those covering only such columns, so CRM-only schema evolution never blocks the website. Column types are compared via PostgreSQL's own `format_type()` on both sides (no hand-written string mapping); NOT NULL flags and DEFAULT expressions are deliberately not compared, because hand-applied production migrations make harmless looseness real and refusing writes over it would create an outage.

**Atomic repair.** All DDL of one repair runs in a single PostgreSQL transaction (PostgreSQL DDL is transactional): a failure mid-way rolls back every statement, leaving the original damage exactly as it was, so the next request retries from an accurate diagnosis. A sequence recreated on a table that kept its rows is advanced past the current maximum id. Repair is idempotent — a second run finds a healthy schema and changes nothing.

**Readiness cache.** A "healthy" verdict is memoized per server instance for 5 minutes only (`src/lib/readiness-cache.ts`), shared by concurrent callers (one inspection, not one per request), and dropped immediately when a write fails with a missing-relation/column error. Failures are never cached. The database, not process memory, stays authoritative, so a table deleted later on a warm instance is noticed within the window (or at once after a failed write).

**Local vs production.** The local and production websites intentionally use *different* Aiven databases; nothing in this repository hard-codes either (`DATABASE_URL` is read only from the environment; `.env` is git-ignored). Guard log lines and every action's failure log end with `db target: <host>:<port>/<dbname>` — never the user, password or full URL — which is enough to tell the two environments apart in the logs.

Concurrency: repair/initialization runs under the same PostgreSQL advisory lock Prisma's own `migrate deploy` uses, and re-inspects the actual database again once the lock is held — so two requests that both detect the same problem never race to create conflicting objects; the second finds the first's work already done. A failed repair is never reported healthy and is retried (not skipped) on the next request.

## Internal Flight Request notification — `GMAIL_SENDER_EMAIL`, `GMAIL_APP_PASSWORD` (both optional)

A separate, internal-only email to the Business Flights Travel team after a flight request has been validated and **successfully saved** — distinct from, and never affecting, the customer's own success response. See `src/lib/email/flight-request-notification.ts` (the pure template/decision logic) and `src/lib/email/mailer.ts` (the only module that touches Nodemailer/Gmail). Wired into `src/server/actions/submit-flight-request.ts`, after the Lead is persisted.

**The same Gmail address is both the sender and the recipient** — there is no separate notification-recipient variable. That account authenticates, sends the notification, and receives it back in its own inbox as a normal new email.

| Variable | What it is |
|---|---|
| `GMAIL_SENDER_EMAIL` | The Gmail/Google Workspace account that authenticates, sends, **and receives** the notification (SMTP "from" *and* "to"). This project had no existing sender-email variable to reuse — checked directly: no email/SMTP code existed anywhere in this repository before this feature (the CRM's own email sending lives in the separate Compass Tools codebase, not here). |
| `GMAIL_APP_PASSWORD` | A Google-generated **App Password** for `GMAIL_SENDER_EMAIL` — never that account's normal login password. Requires 2-Step Verification enabled on the account first; generate one at `myaccount.google.com/apppasswords`. |

Both are **optional** and **unset by default**: if `GMAIL_SENDER_EMAIL` isn't set, the feature is simply inactive — no error, nothing sent, the customer's flow is completely unaffected. Both are server-side only, never `NEXT_PUBLIC_*`, and must be configured separately for local and production. Both are trimmed of surrounding whitespace *and* quote characters before use, since a trailing space/newline or a value pasted with surrounding quotes (a common habit from a shell `export KEY="value"`) is a real, easy, and otherwise invisible mistake that makes Gmail reject authentication outright. Never put the real App Password — or any real value here — in `.env.example`, a commit, a log line, or an error shown to a customer; a send failure is logged with only the message/SMTP protocol code, never the credentials or the Nodemailer config object, and is never surfaced to the visitor (the Flight Request they already submitted stays saved either way — see that module's own header for why).

**If the App Password is correctly set but the email still doesn't arrive**, check (in this order): (1) **server logs** — every attempt logs exactly one line starting `[flight-request-notification]`, ending in either "SMTP accepted the message" (with Gmail's own server reply and message id — proof the message left this app and Gmail's server accepted it, not proof the recipient's inbox displayed it, which is invisible to any sender on any provider past that point), "is not set — skipping" (the feature isn't configured), or "Failed to send internal notification (**category**): ..." where category is `authentication_failed` (wrong password, or see next point), `connection_failed` (couldn't reach `smtp.gmail.com`), `envelope_rejected` (Gmail refused the sender/recipient address), `message_rejected`, or `other`; (2) **`GMAIL_SENDER_EMAIL` must be the exact account that generated the App Password** — a Gmail "Send As" alias configured under a different account will authenticate-fail even with a correct-looking password, because the alias itself has no App Password of its own; (3) a **Google Workspace account** additionally needs its admin to allow SMTP/App-Password access at the organization level — if authentication still fails after confirming (1) and (2), that organization policy is the next thing to check with whoever administers the account; (4) **spam/junk/promotions folders** — once Gmail's SMTP server has accepted the message (category above), everything past that (spam filtering, inbox rules) happens on the recipient's side and is not observable from this application.

**How it runs, and what it does and does not guarantee.**

- **Order:** validate → persist the Lead → return the customer's success response → send the notification. The send is scheduled with Next.js `after()` (`submit-flight-request.ts`), so a slow or unreachable Gmail never delays the customer; it also means the log line above is the *only* trace of the outcome. `after()` work is bounded by the route's `maxDuration`, which is why `src/app/page.tsx` and `src/app/flights/page.tsx` (the two pages hosting the form, whose Server Action inherits their limit) export `maxDuration = 30` — the SMTP worst case is about 21 s.
- **Headers:** `From` and `To` are both `GMAIL_SENDER_EMAIL`; `Reply-To` is the customer's own email (so Reply in Gmail reaches them), and is left out — the notification still goes — if that value isn't a single plain address. Subject is `New Flight Request — JFK → LHR — 1 Traveler`, UTF-8 encoded by Nodemailer. The message is `multipart/alternative` (full plain-text part + HTML part).
- **Log levels:** a successful send is logged at `info`, an unset variable at `warn`, every failure at `error`. No log line contains customer data — only the sender address, SMTP protocol metadata and the failure category.
- **Retry:** at most one retry, 500 ms later, only for connection-class errors (`ECONNECTION`, `ESOCKET`, `ETIMEDOUT`, `EDNS`, `ECONNRESET`); never for authentication, envelope or message rejections. Timeouts are 10 s each (connection, greeting, socket).
- **Not exactly-once.** SMTP cannot tell the client whether Gmail accepted a message when the connection drops before the final reply, and Nodemailer reports that case with the same error as a failed connect, so the retry cannot be limited to provably-undelivered attempts. The retry reuses the first attempt's `Message-ID`, which gives Gmail the chance to collapse a duplicate (commonly observed, not documented as a guarantee). One rare duplicate internal notification is possible and is accepted over silently losing one.
- **Duplicate form submissions.** Two layers. (1) In the browser, a ref guard blocks a second submit while one is in flight (Next.js *queues* a second Server Action rather than dropping it). (2) On the server, the form sends one random `submissionId` per mounted form, identical on every attempt of that submission — including the one automatic retry Next.js makes of a failed action POST — and `Lead.id` (a plain string primary key whose `cuid()` default is generated by the Prisma client, not the database) is derived from it (`src/lib/submission-id.ts`, `src/server/create-website-lead.ts`). A repeated or concurrent attempt of the same submission therefore hits the primary key and is answered with the same success **without** a second Lead, queue assignment or notification. No schema change and no heuristic: the CRM schema is untouched, and two genuinely separate requests carry different keys (a page reload mounts a new form and is a new request). Proven against a real PostgreSQL engine in `tests/schema-init-e2e.spec.ts`. Limits: a client that sends no key (an old cached bundle, or an insecure context without `crypto.randomUUID`) gets no server-side protection; two independent clients are, correctly, two requests; and the Contact is still resolved/deduplicated by phone/email as before.
- **Latency.** The database is far from the function: measured on production, a Server Action POST that touches no database takes ~0.2 s, while one warm single-statement action takes ~1 s — hundreds of milliseconds per sequential round trip — so the *number of sequential round trips* is what the customer waits for. Replaying the action against a real engine gives: airports ~1, contact resolution 4 (existing) / 8 (new), Lead + status history + activity (one transaction) ~6, and queue distribution 9 (a worker is active) to 15 (nobody is, plus 150 ms of sleeps). Queue distribution is best-effort and not needed for the response, so it runs in `after()`; the response now waits only for the Lead being saved. A cold instance additionally runs the schema verification once (42 sequential catalog queries on a healthy database, re-run at most every 5 minutes per instance) — that safeguard is intentionally unchanged. Every request logs one line, `[submitFlightRequest] persisted in …ms (steps, ms: {schema, airports, contact, lead})`, with durations only and no customer data, so a slow request can be attributed to a step.
- **Not controllable from here:** whether the message lands in the inbox, in spam, or shows as unread — SMTP delivery makes it a normal incoming message, and Gmail's read/unread state cannot be set by the sender.

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

Destinations, airlines, airline logos, and airports are **not** read from
`DATABASE_URL` — they're application-owned data, checked into the repo, so
the site's core content renders correctly even before `DATABASE_URL` is
configured, and continues to work if the app is ever pointed at a different
database. See:

- `src/data/destinations.ts` — every destination's city, country, region,
  IATA code, starting fare, and content
- `src/data/airlines.ts` — the airlines shown in the footer, with their
  logo paths
- `public/airlines/*.png` — the actual logo image files
- `src/data/airports.ts` — a curated list of major world airports (IATA
  code, name, city, country) that powers the flight request form's
  origin/destination search-as-you-type entirely client-side, with no
  network request and no database involved. (This used to query the CRM's
  `Airport` table directly over an API route — that broke autocomplete in
  production the moment `DATABASE_URL` pointed at a database whose
  `Airport` table wasn't seeded the same way as the original development
  database. See the header comment in `src/data/airports.ts` for the full
  history.)

`DATABASE_URL`'s `Airport` table is still used for one thing: `Lead` (and
`FlightSegment`) rows have a real foreign key to it, so a submitted flight
request still needs a matching `Airport` row to attach to. Rather than
requiring that row to already exist, `submit-flight-request.ts` validates
the submitted IATA code against `src/data/airports.ts` (not the database)
and then `upsert`s the corresponding `Airport` row using that canonical
data — so submission works against any compatible Postgres database,
including a brand-new one with an empty `Airport` table, not just the one
instance that happened to have it pre-seeded.

## How website submissions reach the CRM

There is no separate sync step or background job — each form's server
action (`src/server/actions/`) writes directly into the CRM's own tables in
the same request:

- **Flight requests** (`submit-flight-request.ts`) create a `Lead`, then call
  the existing queue-distribution logic (`src/server/lead-distribution.ts`)
  so an active agent is assigned exactly as before.
- **Contact messages** (`submit-contact-message.ts`) create a
  `ContactInquiry`, linked to the same `Contact` record a flight request
  would resolve to, so an agent sees every inquiry and lead for that person
  together.
- **Newsletter signups** (`subscribe-newsletter.ts`) create or reactivate a
  `Subscriber`, the same table the CRM's own campaign sender
  (`MarketingCampaignSend`) already reads from.

All three share `resolveContact()` (`src/server/contact.ts`) for
duplicate-contact detection, so the same customer contacting the site
multiple ways doesn't create separate, disconnected records.
