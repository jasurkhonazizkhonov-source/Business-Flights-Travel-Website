# Environment Variables

This project reads exactly one environment variable. Everything else — the
production site URL, SEO metadata, static reference data — is checked into
the repo as code, not sourced from configuration. No secret is ever imported
into a Client Component or sent to the browser (`src/lib/prisma.ts` and
every `server/actions/*.ts` file are server-only).

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

Before a write path touches the database, `src/lib/schema-guard.ts` (wired in via `getCrmCompanyId()` and the flight-request action) inspects the connected database's **actual PostgreSQL catalog** (`information_schema`/`pg_catalog`) once per server instance — deliberately NOT relying on Prisma's `_prisma_migrations` bookkeeping alone, since that table can say every migration succeeded while a table it created has since been deleted by hand. It classifies the database into one of six states:

| State | Meaning | Behavior |
|---|---|---|
| healthy | every required table present, with its expected columns/indexes/constraints | nothing is created, altered or reset; the write proceeds |
| empty | zero tables in `public` | **refused** unless `DATABASE_AUTO_INIT=true`; with it, the real migration history is applied under an advisory lock, the schema is re-verified, then the write proceeds in the same request |
| needs_repair | one or more required tables, or an existing required table's index/constraint/primary key/sequence, is missing — **even if `_prisma_migrations` says everything is applied** (e.g. a table was manually dropped) | **refused** unless `DATABASE_AUTO_INIT=true`; with it, ONLY the missing object(s) are recreated (additive DDL only — `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX`, `ADD CONSTRAINT`), under the same advisory lock, then re-verified. This restores **schema**, not **data**: a manually-deleted table's rows are already gone and this cannot recover them (only a PostgreSQL/Aiven backup or point-in-time recovery can) — it only makes the table exist again so new writes succeed. |
| unsafe_damage | a required table exists but a column the website actually reads/writes is missing or has a different type | **always refused**, regardless of the opt-in — changing an existing column risks real data, so this is never auto-repaired; a safe diagnostic is logged and an administrator must resolve it manually |
| partial_unexpected | some required tables are present alongside a table this app doesn't recognize | **always refused** — too ambiguous to safely act on automatically |
| unrelated | tables exist, none are the app's (or none of the app's tables are present at all) | **always refused** — another application's database is never touched |

Two allowlists keep repair narrow and prevent false alarms: `REQUIRED_TABLES` (13 tables the website's own code touches — repair-eligible) and `ALL_SCHEMA_TABLES` (every table the full ~40-table Compass Tools CRM schema creates — e.g. `Booking`, `Quote`, `Task` — recognized as legitimate but never repaired by this guard, since the website never queries them). A third, small allowlist (`KNOWN_EXTERNAL_TABLES`) covers tables documented as possibly still present in the real production database from a since-removed integration (see `docs/PRODUCTION_READINESS.md`'s "orphaned database tables" note) — their presence alone must never cause a refusal.

`DATABASE_AUTO_INIT=true` gates **both** full empty-database initialization and object-level repair identically (the same opt-in, the same advisory lock, the same mandatory post-action re-verification) — this was a deliberate decision to keep one simple, well-understood safety story rather than inventing a separate "high confidence" heuristic for automatic repair. It exists so a wrong or stale `DATABASE_URL` can never silently turn an unintended database into a working orphan CRM (this happened once in production), and so a genuinely damaged database is never silently patched without an operator's explicit opt-in. Leave it **unset** for the normal production deployment, whose `DATABASE_URL` points at the real, already-migrated CRM database. Set it only when you deliberately point a deployment at a brand-new, empty database, or need to repair a database with a manually-deleted managed table/index/constraint, and remove it afterwards. The same gate applies to the Vercel build step (`scripts/vercel-build.mjs`). Refusals reach visitors as the usual generic error; the cause (plus the safe `db target:` host/port/dbname only) is in the server logs as `schema-guard (<reason>)` — never a password, connection string, or other credential.

**Schema, not data.** The guard can recover missing *schema* only. If someone deletes a table that held records, repair recreates the empty structure (and its sequence, indexes, constraints and foreign keys) so new writes succeed — the deleted rows are gone and can only come back from a PostgreSQL/Aiven backup or point-in-time recovery. Nothing here implies otherwise, and it never deletes, truncates, overwrites or "fixes" existing rows (a constraint that existing rows violate is refused and rolled back, not satisfied by altering data).

**Objects the website manages** (`REQUIRED_TABLES`, re-derived from the actual write paths — `subscribe-newsletter`, `submit-contact-message`, `submit-flight-request`, `resolveContact`, `distributeNewWebsiteLead`): `Company`, `Account`, `Contact`, `ContactEmail`, `ContactPhone`, `ContactInquiry`, `Lead`, `LeadStatusHistory`, `LeadQueueEntry`, `Activity`, `Airport`, `Subscriber`, `Notification` — plus, for those tables only, their sequence (`Airport_id_seq`), primary keys, unique constraints, indexes and foreign keys. The other ~29 Compass Tools tables (`Booking`, `Quote`, `Task`, …) are recognized as legitimate CRM tables but are never inspected for readiness or repaired: the website does not use them, and the guard is not a general CRM repair tool. Column checks are limited to columns the website reads/writes (`WEBSITE_REQUIRED_COLUMNS`), and index/constraint checks to those covering only such columns, so CRM-only schema evolution never blocks the website. Column types are compared via PostgreSQL's own `format_type()` on both sides (no hand-written string mapping); NOT NULL flags and DEFAULT expressions are deliberately not compared, because hand-applied production migrations make harmless looseness real and refusing writes over it would create an outage.

**Atomic repair.** All DDL of one repair runs in a single PostgreSQL transaction (PostgreSQL DDL is transactional): a failure mid-way rolls back every statement, leaving the original damage exactly as it was, so the next request retries from an accurate diagnosis. A sequence recreated on a table that kept its rows is advanced past the current maximum id. Repair is idempotent — a second run finds a healthy schema and changes nothing.

**Readiness cache.** A "healthy" verdict is memoized per server instance for 5 minutes only (`src/lib/readiness-cache.ts`), shared by concurrent callers (one inspection, not one per request), and dropped immediately when a write fails with a missing-relation/column error. Failures are never cached. The database, not process memory, stays authoritative, so a table deleted later on a warm instance is noticed within the window (or at once after a failed write).

**Local vs production.** The local and production websites intentionally use *different* Aiven databases; nothing in this repository hard-codes either (`DATABASE_URL` is read only from the environment; `.env` is git-ignored). Guard log lines and every action's failure log end with `db target: <host>:<port>/<dbname>` — never the user, password or full URL — which is enough to tell the two environments apart in the logs.

Concurrency: repair/initialization runs under the same PostgreSQL advisory lock Prisma's own `migrate deploy` uses, and re-inspects the actual database again once the lock is held — so two requests that both detect the same problem never race to create conflicting objects; the second finds the first's work already done. A failed repair is never reported healthy and is retried (not skipped) on the next request.

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
