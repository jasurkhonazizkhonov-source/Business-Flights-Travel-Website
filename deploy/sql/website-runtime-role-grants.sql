-- Least-privilege grants for the WEBSITE's database role. OWNER-RUN ONLY, reviewed first, in one transaction:
--
--     psql "$OWNER_URL" -v ON_ERROR_STOP=1 -v role=bft_web -1 -f deploy/sql/website-runtime-role-grants.sql
--
-- Nothing in this repository runs this file: no deploy script, no container start-up, no application code. It is idempotent (GRANT and
-- REVOKE can be repeated safely), so re-running it after review changes nothing that is already granted.
--
-- The role itself is created separately, because it needs a password the owner chooses (docs/DEPLOYMENT_VPS.md, "Database"). Idempotent form:
--     DO $$ BEGIN
--       IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bft_web') THEN
--         CREATE ROLE bft_web LOGIN PASSWORD '<generated>' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 8;
--       END IF; END $$;
-- If the CRM database has had CONNECT revoked from PUBLIC, also run:  GRANT CONNECT ON DATABASE <database_name> TO bft_web;
--
-- Derived from what the website's code does (src/server/*, audited 2026-10-16) and proven twice:
--   * scripts/verify-runtime-role.ts       in-process PostgreSQL (PGlite), every website write path + 16 refusals;
--   * scripts/verify-runtime-role-pg.ts    a real PostgreSQL server (version recorded in the test output), the real Prisma client over TCP,
--                                          concurrent idempotent submissions and lead-queue claims.
-- Re-run both whenever the website or the CRM schema changes.
--
-- It grants NO schema-creating privilege (no CREATE, no table ownership), NO DELETE, NO TRUNCATE, no sequence access except Airport's, and
-- it deliberately does NOT use ALTER DEFAULT PRIVILEGES: a table or sequence the CRM adds later is NOT visible to this role until the
-- owner adds a reviewed line here. The website never runs migrations; the CRM project owns the schema.

GRANT USAGE ON SCHEMA public TO :"role";
REVOKE CREATE ON SCHEMA public FROM :"role";

-- Read-only, COLUMN-level where the table holds data the website has no business reading:
--   Company: the single row's id (every write needs companyId).      Account: id and role only — the lead-queue query joins on them.
--   Not granted on Account: email, phone, activeSessionId, commission, permissions, ... (a compromised website must not read them).
-- The schema guard (read-only) lists tables/columns through information_schema, which shows only what the role may see, and
-- WEBSITE_REQUIRED_COLUMNS in src/lib/schema-guard.ts names exactly these columns.
GRANT SELECT ("id") ON "Company" TO :"role";
GRANT SELECT ("id", "role") ON "Account" TO :"role";
-- The migration ledger (read-only): the guard reads it; without it every table would look unmigrated.
GRANT SELECT ON "_prisma_migrations" TO :"role";

-- Rows the website creates (INSERT) and reads back (SELECT; Prisma returns the created row; contact de-duplication reads Contact*).
GRANT SELECT, INSERT ON "Lead", "LeadStatusHistory", "Activity", "Contact", "ContactEmail", "ContactPhone", "ContactInquiry", "Notification", "LeadSubmissionInfo" TO :"role";

-- Rows it also changes: queue assignment, newsletter re-subscribe, the airports it upserts, the lead's own submission details.
GRANT UPDATE ON "Lead", "LeadSubmissionInfo" TO :"role";
GRANT SELECT, INSERT, UPDATE ON "Subscriber", "Airport" TO :"role";
GRANT SELECT, UPDATE ON "LeadQueueEntry" TO :"role";

-- Airport.id is a serial column: inserting an airport the CRM does not have yet needs its sequence. No other sequence is used.
GRANT USAGE ON SEQUENCE "Airport_id_seq" TO :"role";
