-- Least-privilege grants for the WEBSITE's database role. Run by the database owner, reviewed, in a transaction:
--
--     psql "$OWNER_URL" -v ON_ERROR_STOP=1 -v role=bft_web -1 -f deploy/sql/website-runtime-role-grants.sql
--
-- The role itself is created separately because it needs a password the owner chooses (see docs/DEPLOYMENT_VPS.md, "Database"):
--     CREATE ROLE bft_web LOGIN PASSWORD '<generated>' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 8;
--
-- Derived from what the website's code does (src/server/*, checked 2026-10-16) and proven against a real PostgreSQL engine by
-- scripts/verify-runtime-role.ts (tests/runtime-role-e2e.spec.ts): every website write path works with exactly these grants, and DDL,
-- DELETE, TRUNCATE and every CRM table not listed here are refused. Re-run that proof whenever the website or the CRM schema changes.
--
-- It grants NO schema-creating privilege (no CREATE, no table ownership), NO DELETE, NO TRUNCATE. The website never runs migrations;
-- the CRM project owns the schema and applies migrations with its own owner role.

GRANT USAGE ON SCHEMA public TO :"role";
REVOKE CREATE ON SCHEMA public FROM :"role";

-- Read-only: the single Company row (companyId for every write), the Account join used by the lead queue, and the migration ledger
-- (the schema guard reads it; information_schema only lists tables the role holds a privilege on, so a table missing from these
-- grants would look "missing" to the guard).
GRANT SELECT ON "Company", "Account", "_prisma_migrations" TO :"role";

-- Rows the website creates (INSERT) and reads back (SELECT; Prisma returns the created row).
GRANT SELECT, INSERT ON "Lead", "LeadStatusHistory", "Activity", "Contact", "ContactEmail", "ContactPhone", "ContactInquiry", "Notification", "LeadSubmissionInfo" TO :"role";

-- Rows it also changes: queue assignment, newsletter re-subscribe, the airports it upserts, the lead's own submission details.
GRANT UPDATE ON "Lead", "LeadSubmissionInfo" TO :"role";
GRANT SELECT, INSERT, UPDATE ON "Subscriber", "Airport" TO :"role";
GRANT SELECT, UPDATE ON "LeadQueueEntry" TO :"role";

-- Airport.id is a serial column: inserting an airport the CRM does not have yet needs its sequence.
GRANT USAGE ON SEQUENCE "Airport_id_seq" TO :"role";
