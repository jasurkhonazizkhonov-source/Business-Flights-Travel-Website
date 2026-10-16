// Proof of the website's least-privilege database role against a REAL PostgreSQL SERVER, over TCP, with the website's real code.
//
//   INTEGRATION_ADMIN_DATABASE_URL=postgresql://postgres@127.0.0.1:54331/postgres \
//     node --conditions=react-server node_modules/tsx/dist/cli.mjs scripts/verify-runtime-role-pg.ts
//
// (`--conditions=react-server` lets the real `server-only` modules load outside Next.js.) Wrapped by tests/runtime-role-pg-e2e.spec.ts,
// which skips itself when INTEGRATION_ADMIN_DATABASE_URL is not set.
//
// SAFETY: the admin URL must point at a loopback address. It creates and drops ONE disposable database (bft_it) and two disposable roles
// (crm_it_owner, bft_web_it) on that server and touches nothing else. It never reads a production URL: the only database this script can
// reach is the one you start for it. The version of the server it ran against is part of the output, so the result can say honestly what
// it was (the test is only evidence for the PostgreSQL major version the output reports).
//
// What it does:
//   1. creates a non-superuser CRM OWNER role and an empty database; builds the CRM schema with the bundled real migrations (schema guard);
//   2. creates the website role and applies deploy/sql/website-runtime-role-grants.sql EXACTLY as written (psql variable substituted);
//   3. runs deploy/sql/verify-website-runtime-role.sql and compares the effective privileges with the documented expectation;
//   4. as the website role, over TCP, through the real src/lib/prisma.ts (so the real TLS resolver, host `localhost`, DATABASE_SSL_MODE=disable):
//      the read-only schema guard, contact resolution, idempotent lead creation under concurrency, lead-queue claims under concurrency,
//      skipped-locked rows, notification/activity rows, newsletter, inquiry, submission info;
//   5. proves what the role is refused (DDL, DELETE, TRUNCATE, grants, sensitive CRM tables and columns) and what a future CRM migration
//      does and does not make visible.
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "../src/generated/prisma/client";
import { ensureSchema } from "../src/lib/schema-guard";
import { MIGRATION_BUNDLE } from "../src/lib/migration-bundle.generated";

const OWNER = "crm_it_owner";
const ROLE = "bft_web_it";
const DB = "bft_it";
const OWNER_PW = "owner-" + Math.random().toString(36).slice(2);
const ROLE_PW = "role-" + Math.random().toString(36).slice(2);

const results: Record<string, unknown> = {};
const checks: string[] = [];
function check(condition: unknown, label: string): void {
  if (!condition) throw new Error(`CHECK FAILED: ${label}`);
  checks.push(label);
}

function loopbackOnly(url: string): URL {
  const u = new URL(url);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(u.hostname)) {
    throw new Error("refusing to run: INTEGRATION_ADMIN_DATABASE_URL must point at a loopback address (a disposable local server)");
  }
  return u;
}

function urlFor(base: URL, user: string, password: string, database: string): string {
  const u = new URL(base.toString());
  u.username = user;
  u.password = password;
  u.pathname = `/${database}`;
  u.search = "";
  return u.toString();
}

async function main() {
  const adminUrl = process.env.INTEGRATION_ADMIN_DATABASE_URL;
  if (!adminUrl) throw new Error("INTEGRATION_ADMIN_DATABASE_URL is not set");
  const base = loopbackOnly(adminUrl);

  // ---- 1. owner role, database, schema --------------------------------------------------------------------------------------
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  results.server = (await admin.query("SHOW server_version")).rows[0].server_version;
  results.serverMajor = Number(String(results.server).split(".")[0]);
  await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
  await admin.query(`DROP ROLE IF EXISTS ${ROLE}`);
  await admin.query(`DROP ROLE IF EXISTS ${OWNER}`);
  await admin.query(`CREATE ROLE ${OWNER} LOGIN PASSWORD '${OWNER_PW}' NOSUPERUSER NOCREATEDB NOCREATEROLE`);
  await admin.query(`CREATE DATABASE ${DB} OWNER ${OWNER} ENCODING 'UTF8' TEMPLATE template0`);
  await admin.end();

  const owner = new Client({ connectionString: urlFor(base, OWNER, OWNER_PW, DB) });
  await owner.connect();
  const runner = {
    query: async (sql: string, params?: unknown[]) => (await owner.query(sql, params as unknown[] | undefined)).rows as Array<Record<string, unknown>>,
    exec: async (sql: string) => {
      await owner.query(sql);
    },
  };
  const init = await ensureSchema({ db: runner, bundle: MIGRATION_BUNDLE, autoInit: true });
  results.migrationsApplied = init.appliedMigrations.length;

  // ---- 2. the website role + the grants file, exactly as an owner would apply it ---------------------------------------------
  await owner.query(`CREATE ROLE ${ROLE} LOGIN PASSWORD '${ROLE_PW}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 12`).catch(async () => {
    // creating a role needs CREATEROLE: the owner above has none (as in production), so the server administrator creates it
    const a = new Client({ connectionString: adminUrl });
    await a.connect();
    await a.query(`CREATE ROLE ${ROLE} LOGIN PASSWORD '${ROLE_PW}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 12`);
    await a.end();
  });
  const root = path.join(__dirname, "..");
  const sub = (file: string) => readFileSync(path.join(root, "deploy", "sql", file), "utf8").split(':"role"').join(`"${ROLE}"`).split(":'role'").join(`'${ROLE}'`);
  await owner.query("BEGIN"); // psql -1
  await owner.query(sub("website-runtime-role-grants.sql"));
  await owner.query("COMMIT");
  // idempotent: applying it a second time changes nothing and does not fail
  await owner.query("BEGIN");
  await owner.query(sub("website-runtime-role-grants.sql"));
  await owner.query("COMMIT");
  checks.push("grants file applies in one transaction and is idempotent (applied twice)");

  // ---- 3. effective privileges == the documented expectation ---------------------------------------------------------------
  const report = (await owner.query(sub("verify-website-runtime-role.sql"))).rows as Array<{ object: string; kind: string; privileges: string }>;
  const actual = report.map((r) => `${r.kind}|${r.object}|${r.privileges}`).sort();
  const RW = "SELECT,INSERT";
  const expected = [
    `table|Activity|${RW}`, `table|Airport|SELECT,INSERT,UPDATE`, `table|Contact|${RW}`, `table|ContactEmail|${RW}`, `table|ContactInquiry|${RW}`,
    `table|ContactPhone|${RW}`, `table|Lead|SELECT,INSERT,UPDATE`, `table|LeadQueueEntry|SELECT,UPDATE`, `table|LeadStatusHistory|${RW}`,
    `table|LeadSubmissionInfo|SELECT,INSERT,UPDATE`, `table|Notification|${RW}`, `table|Subscriber|SELECT,INSERT,UPDATE`, `table|_prisma_migrations|SELECT`,
    `columns|Account|id,role`, `columns|Company|id`, `sequence|Airport_id_seq|USAGE`,
    `schema|public|USAGE`, `database|${DB}|CONNECT,TEMPORARY`, `role-attributes|${ROLE}|LOGIN`,
  ].sort();
  results.effectivePrivileges = actual;
  check(JSON.stringify(actual) === JSON.stringify(expected), "effective privileges equal the documented expectation exactly (no extra, none missing)");

  // ---- fixtures (as owner): queue workers --------------------------------------------------------------------------------------
  const ownerPrisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlFor(base, OWNER, OWNER_PW, DB) }) });
  const company = await ownerPrisma.company.findFirstOrThrow({ select: { id: true } });
  const mkAccount = (id: string, role: "TRAVEL_AGENT" | "TICKETING_AGENT") =>
    ownerPrisma.account.create({ data: { id, fullName: id, email: `${id}@example.com`, role, companyId: company.id, updatedAt: new Date() } });
  for (const id of ["w1", "w2", "w3", "inactive", "ticketing"]) await mkAccount(id, id === "ticketing" ? "TICKETING_AGENT" : "TRAVEL_AGENT");
  for (const [id, accountId, isActive] of [["q1", "w1", true], ["q2", "w2", true], ["q3", "w3", true], ["q4", "inactive", false], ["q5", "ticketing", true]] as const) {
    await ownerPrisma.leadQueueEntry.create({ data: { id, accountId, isActive, updatedAt: new Date() } });
  }
  const ELIGIBLE = ["w1", "w2", "w3"];

  // ---- 4. the website's real code, as the restricted role, over TCP ---------------------------------------------------------
  // Production semantics: src/lib/prisma.ts must keep ONE client per process when NODE_ENV=production (a regression there opened a new pool
  // on every prisma.<model> access; with the role's CONNECTION LIMIT below that fails this script).
  (process.env as Record<string, string | undefined>).NODE_ENV = "production";
  process.env.DATABASE_URL = urlFor(base, ROLE, ROLE_PW, DB).replace("127.0.0.1", "localhost");
  process.env.DATABASE_SSL_MODE = "disable";
  delete process.env.DATABASE_AUTO_INIT;
  const { resolveDatabaseSsl } = await import("../src/lib/db-tls");
  check(resolveDatabaseSsl() === false, "the real TLS resolver accepts localhost + DATABASE_SSL_MODE=disable for this connection");
  const { prisma } = await import("../src/lib/prisma");
  const { ensureSchemaReady } = await import("../src/server/schema-ready");
  const { getCrmCompanyId } = await import("../src/server/crm-company");
  const { resolveContact } = await import("../src/server/contact");
  const { createWebsiteLead } = await import("../src/server/create-website-lead");
  const { saveLeadSubmissionInfo } = await import("../src/server/save-submission-info");
  const { distributeNewWebsiteLead } = await import("../src/server/lead-distribution");
  const { deriveLeadId } = await import("../src/lib/submission-id");

  const who = await prisma.$queryRaw<Array<{ u: string; v: string }>>`SELECT current_user AS u, current_setting('server_version') AS v`;
  check(who[0].u === ROLE, `the application connects as ${ROLE}`);

  await ensureSchemaReady(); // the real read-only guard, as the role: must pass without creating or repairing anything
  checks.push("schema guard (read-only, real code) is healthy as the restricted role");
  check((await getCrmCompanyId()) === company.id, "company id resolved with column-level SELECT (id) only");

  // contact resolution, concurrent: Serializable + retries, one contact only
  const contactArgs = { firstName: "Conc", lastName: "Urrent", e164Phone: "+14155550177", email: "conc@example.com" };
  const contactOutcomes = await Promise.allSettled(Array.from({ length: 10 }, () => resolveContact(contactArgs)));
  const contactIds = new Set(contactOutcomes.flatMap((o) => (o.status === "fulfilled" ? [o.value] : [])));
  const contactFailures = contactOutcomes.filter((o) => o.status === "rejected").map((o) => String((o as PromiseRejectedResult).reason?.code ?? (o as PromiseRejectedResult).reason?.message).slice(0, 60));
  const contactRows = await ownerPrisma.contact.count({ where: { primaryEmail: "conc@example.com" } });
  results.concurrentContact = { requests: 10, distinctIdsReturned: contactIds.size, contactRows, rejected: contactFailures };
  check(contactRows === 1, "10 concurrent identical contact submissions create exactly one Contact (Serializable + retry)");
  check(contactIds.size === 1, "every successful concurrent contact submission returned the same contact id");
  const contactId = [...contactIds][0];

  // airports (insert path, then the existing-row path) — sequence access
  const mk = () =>
    Promise.all([
      prisma.airport.upsert({ where: { iata: "SYD" }, create: { iata: "SYD", name: "Sydney Kingsford Smith", city: "Sydney", country: "Australia" }, update: {} }),
      prisma.airport.upsert({ where: { iata: "LHR" }, create: { iata: "LHR", name: "Heathrow Airport", city: "London", country: "United Kingdom" }, update: {} }),
    ]);
  const [from, to] = await mk();
  await mk();
  const leadInput = () => ({
    contactId, departureAirportId: from.id, arrivalAirportId: to.id, departureDate: new Date("2027-03-01"), tripType: "ONE_WAY" as const, cabinClass: "BUSINESS" as const,
    adults: 1, children: 0, infants: 0, flexibleDates: false, source: "WEBSITE" as const, priority: "MEDIUM" as const, status: "ATTEMPTING_TO_CONTACT" as const,
    LeadStatusHistory: { create: [{ toStatus: "ATTEMPTING_TO_CONTACT" as const }] },
    Activity: { create: [{ contactId, actorId: null, type: "LEAD_CREATED" as const, description: "Lead created from the website flight request form" }] },
  });

  // ---- idempotent submission under concurrency
  const sameId = deriveLeadId("0b7f2a54-6c1e-4d9a-9e43-2a5b7c1d8e90");
  const dup = await Promise.allSettled(Array.from({ length: 20 }, () => createWebsiteLead(prisma, leadInput(), sameId)));
  const fulfilled = dup.flatMap((o) => (o.status === "fulfilled" ? [o.value] : []));
  const rejected = dup.filter((o) => o.status === "rejected").length;
  const leadRows = await ownerPrisma.lead.count({ where: { id: sameId } });
  const histRows = await ownerPrisma.leadStatusHistory.count({ where: { leadId: sameId } });
  const actRows = await ownerPrisma.activity.count({ where: { leadId: sameId, type: "LEAD_CREATED" } });
  results.concurrentIdempotentLead = { requests: 20, created: fulfilled.filter((r) => !r.duplicate).length, duplicates: fulfilled.filter((r) => r.duplicate).length, rejected, leadRows, histRows, actRows };
  check(rejected === 0, "no concurrent idempotent submission was rejected with an error");
  check(fulfilled.filter((r) => !r.duplicate).length === 1 && fulfilled.filter((r) => r.duplicate).length === 19, "exactly 1 of 20 concurrent identical submissions created the lead; 19 were reported as duplicates");
  check(leadRows === 1 && histRows === 1 && actRows === 1, "one Lead, one status-history row and one activity row (no partial or doubled nested writes)");

  const info = { ip: { address: "198.51.100.23", version: "v4" as const }, capturedAt: new Date(), location: { city: "Sydney", country: "Australia", countryCode: "AU" }, locationSource: "Cloudflare edge geolocation (approximate)" };
  await Promise.all(Array.from({ length: 5 }, () => saveLeadSubmissionInfo(prisma, sameId, info, "AUD")));
  check((await ownerPrisma.leadSubmissionInfo.count({ where: { leadId: sameId } })) === 1, "5 concurrent submission-info saves leave exactly one row");

  // ---- lead-queue claims under concurrency: 12 distinct leads, 3 eligible workers
  const batch = Array.from({ length: 12 }, (_, i) => deriveLeadId(`00000000-0000-4000-8000-${String(i).padStart(12, "0")}`));
  for (const id of batch) await createWebsiteLead(prisma, leadInput(), id);
  const outcomes = await Promise.all(batch.map((id) => distributeNewWebsiteLead(id)));
  const assignedOk = outcomes.filter((o) => o.assigned).length;
  const leads = await ownerPrisma.lead.findMany({ where: { id: { in: batch } }, select: { id: true, assignedAgentId: true, queueDistributedAt: true } });
  const perWorker: Record<string, number> = {};
  for (const l of leads) if (l.assignedAgentId) perWorker[l.assignedAgentId] = (perWorker[l.assignedAgentId] ?? 0) + 1;
  const entries = await ownerPrisma.leadQueueEntry.findMany({ select: { accountId: true, leadsAssignedCount: true } });
  const counted = entries.reduce((s, e) => s + e.leadsAssignedCount, 0);
  const notes = await ownerPrisma.notification.count({ where: { leadId: { in: batch }, type: "LEAD_ASSIGNED" } });
  const acts = await ownerPrisma.activity.count({ where: { leadId: { in: batch }, type: "LEAD_AUTO_ASSIGNED" } });
  results.concurrentQueueClaims = { leads: 12, assignedResults: assignedOk, perWorker, leadsAssignedCountTotal: counted, notifications: notes, autoAssignActivities: acts, notAssignedReasons: outcomes.filter((o) => !o.assigned).map((o) => (o as { reason: string }).reason) };
  check(assignedOk === 12 && leads.every((l) => l.assignedAgentId && l.queueDistributedAt), "all 12 concurrent leads were assigned exactly once");
  check(Object.keys(perWorker).every((a) => ELIGIBLE.includes(a)), "only eligible workers received leads (inactive and TICKETING_AGENT entries were skipped)");
  check(counted === 12, "the workers' leadsAssignedCount increments add up to exactly 12 (no lost or doubled increments)");
  check(notes === 12 && acts === 12, "exactly one notification and one auto-assign activity per assigned lead");

  // ---- the SAME lead claimed by many at once: one assignment, one notification
  const racing = deriveLeadId("11111111-1111-4111-8111-111111111111");
  await createWebsiteLead(prisma, leadInput(), racing);
  const before = (await ownerPrisma.leadQueueEntry.findMany({ select: { leadsAssignedCount: true } })).reduce((s, e) => s + e.leadsAssignedCount, 0);
  const race = await Promise.all(Array.from({ length: 10 }, () => distributeNewWebsiteLead(racing)));
  const after = (await ownerPrisma.leadQueueEntry.findMany({ select: { leadsAssignedCount: true } })).reduce((s, e) => s + e.leadsAssignedCount, 0);
  results.sameLeadRace = { claimers: 10, assigned: race.filter((r) => r.assigned).length, others: race.filter((r) => !r.assigned).map((r) => (r as { reason: string }).reason) };
  check(race.filter((r) => r.assigned).length === 1, "10 claimers racing for ONE lead: exactly one assignment");
  check(after - before === 1, "...and exactly one leadsAssignedCount increment");
  check((await ownerPrisma.notification.count({ where: { leadId: racing, type: "LEAD_ASSIGNED" } })) === 1, "...and exactly one notification");

  // ---- connection budget: one client (one pool) per process, however many queries and property accesses happened above
  const stat = new Client({ connectionString: adminUrl });
  await stat.connect();
  const open = (await stat.query(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE usename = $1`, [ROLE])).rows[0].n as number;
  await stat.end();
  results.connectionsHeldByTheApplication = open;
  check(open >= 1 && open <= 5, `after ~100 queries and every prisma.<model> access above, the application holds ${open} connection(s): one pool of at most 5, not one pool per access`);

  // ---- skipped locked rows: a worker row locked by someone else is skipped, never waited on
  const holder = new Client({ connectionString: process.env.DATABASE_URL.replace("localhost", "127.0.0.1") });
  await holder.connect();
  const lockSql = (limit: string) => `SELECT lqe."id", lqe."accountId" FROM "LeadQueueEntry" lqe JOIN "Account" a ON a."id" = lqe."accountId"
      WHERE lqe."isActive" = true AND a."role" NOT IN ('TICKETING_AGENT', 'FLIGHT_EXPERT')
      ORDER BY lqe."lastAssignedAt" ASC NULLS FIRST, lqe."joinedAt" ASC ${limit} FOR UPDATE OF lqe`;
  const one = deriveLeadId("22222222-2222-4222-8222-222222222222");
  await createWebsiteLead(prisma, leadInput(), one);
  await holder.query("BEGIN");
  const held = (await holder.query(lockSql("LIMIT 1"))).rows[0].accountId as string;
  let t0 = Date.now();
  const skipped = await distributeNewWebsiteLead(one);
  const skipMs = Date.now() - t0;
  results.skippedLockedRow = { lockedWorker: held, assignedTo: skipped.assigned ? skipped.accountId : null, ms: skipMs };
  check(skipped.assigned && skipped.accountId !== held && ELIGIBLE.includes(skipped.accountId), "a locked queue row is SKIPPED: the lead went to another eligible worker");
  check(skipMs < 2000, "...without waiting for the lock");
  await holder.query("ROLLBACK");

  const blocked = deriveLeadId("33333333-3333-4333-8333-333333333333");
  await createWebsiteLead(prisma, leadInput(), blocked);
  await holder.query("BEGIN");
  await holder.query(lockSql(""));
  t0 = Date.now();
  const none = await distributeNewWebsiteLead(blocked);
  const noneMs = Date.now() - t0;
  const stillOpen = await ownerPrisma.lead.findUniqueOrThrow({ where: { id: blocked }, select: { assignedAgentId: true, queueDistributedAt: true } });
  results.allLockedRows = { result: none, ms: noneMs, leadUnassigned: stillOpen.assignedAgentId === null };
  check(!none.assigned && none.reason === "no_active_workers", "every eligible row locked: the claim gives up as 'no_active_workers' instead of hanging");
  check(noneMs >= 90 && noneMs < 3000, `...after the bounded retries (took ${noneMs} ms)`);
  check(stillOpen.assignedAgentId === null && stillOpen.queueDistributedAt === null, "...and the lead stays unassigned, available to the CRM's own distributor");
  check((await ownerPrisma.notification.count({ where: { leadId: blocked } })) === 0, "...with no notification created");
  await holder.query("ROLLBACK");
  const later = await distributeNewWebsiteLead(blocked);
  check(later.assigned, "once the locks are released the same lead is assigned on the next attempt");

  // why the OF clause matters: the old statement is refused for the least-privilege role
  const old = new Client({ connectionString: process.env.DATABASE_URL.replace("localhost", "127.0.0.1") });
  await old.connect();
  let oldError = "";
  try {
    await old.query(`SELECT lqe."id" FROM "LeadQueueEntry" lqe JOIN "Account" a ON a."id" = lqe."accountId" LIMIT 1 FOR UPDATE SKIP LOCKED`);
  } catch (e) {
    oldError = String((e as Error).message);
  }
  check(/permission denied for table Account/.test(oldError), "the previous bare `FOR UPDATE` is refused for this role (permission denied for table Account): the OF lqe change is required");
  await old.end();
  await holder.end();

  // newsletter + inquiry, once, through real queries
  const sub1 = await prisma.subscriber.create({ data: { companyId: company.id, email: "role-news@example.com", status: "SUBSCRIBED", source: "website", unsubscribeToken: "role-tok-1", updatedAt: new Date() } });
  await prisma.subscriber.update({ where: { id: sub1.id }, data: { status: "SUBSCRIBED", subscribedAt: new Date(), unsubscribedAt: null, updatedAt: new Date() } });
  const inquiry = await prisma.contactInquiry.create({ data: { companyId: company.id, firstName: "Role", lastName: "Tester", email: "role-flight@example.com", phone: "+14155550123", subject: "GENERAL_INQUIRY", message: "Hello", status: "NEW", matchedContactId: contactId, updatedAt: new Date() } });
  await prisma.activity.create({ data: { contactId, actorId: null, type: "CONTACT_INQUIRY_CREATED", description: "Contact inquiry submitted from the website", metadata: { inquiryId: inquiry.id, subject: "GENERAL_INQUIRY" } } });
  checks.push("newsletter subscribe/re-subscribe, contact inquiry and its activity succeed");

  // ---- 5. refusals, as the role, on a plain connection -----------------------------------------------------------------------
  const rc = new Client({ connectionString: process.env.DATABASE_URL.replace("localhost", "127.0.0.1") });
  await rc.connect();
  const refused: Record<string, string> = {};
  const mustFail = async (label: string, sql: string, pattern: RegExp) => {
    try {
      await rc.query(sql);
    } catch (e) {
      const m = String((e as Error).message);
      if (!pattern.test(m)) throw new Error(`${label}: failed, but not with the expected error: ${m}`);
      refused[label] = m;
      return;
    }
    throw new Error(`${label}: SUCCEEDED but the website role must be refused`);
  };
  await mustFail("create table", `CREATE TABLE "Evil" (id int)`, /permission denied/);
  await mustFail("create temp-free schema", `CREATE SCHEMA evil`, /permission denied/);
  await mustFail("alter table", `ALTER TABLE "Lead" ADD COLUMN evil int`, /must be owner/);
  await mustFail("drop table", `DROP TABLE "Activity"`, /must be owner/);
  await mustFail("create index", `CREATE INDEX evil_idx ON "Lead" ("status")`, /must be owner/);
  await mustFail("truncate", `TRUNCATE "Lead" CASCADE`, /permission denied/);
  await mustFail("delete lead", `DELETE FROM "Lead"`, /permission denied/);
  await mustFail("delete subscriber", `DELETE FROM "Subscriber"`, /permission denied/);
  await mustFail("delete contact", `DELETE FROM "Contact"`, /permission denied/);
  await mustFail("update account", `UPDATE "Account" SET "role" = 'ADMIN'`, /permission denied/);
  await mustFail("insert account", `INSERT INTO "Account" ("id","fullName","email","updatedAt","companyId") VALUES ('x','x','y@example.com',now(),'c')`, /permission denied/);
  await mustFail("read account email", `SELECT "email" FROM "Account"`, /permission denied for table Account/);
  await mustFail("read account sessions", `SELECT "activeSessionId" FROM "Account"`, /permission denied for table Account/);
  await mustFail("read account (star)", `SELECT * FROM "Account"`, /permission denied for table Account/);
  await mustFail("read company details", `SELECT "name", "logoEmailData" FROM "Company"`, /permission denied for table Company/);
  await mustFail("update company", `UPDATE "Company" SET "id" = "id"`, /permission denied/);
  await mustFail("update queue ownership", `UPDATE "LeadQueueEntry" SET "accountId" = 'w1' WHERE false; DELETE FROM "LeadQueueEntry"`, /permission denied/);
  for (const t of ["PaymentMethod", "PaymentCharge", "Booking", "AuditLog", "GmailConnection", "Quote", "EmailLog", "Note", "Attachment", "Task", "MarketingCampaign"]) {
    await mustFail(`read ${t}`, `SELECT 1 FROM "${t}" LIMIT 1`, new RegExp(`permission denied for table ${t}`));
  }
  await mustFail("write migration ledger", `DELETE FROM "_prisma_migrations"`, /permission denied/);
  await mustFail("create role", `CREATE ROLE evil_role`, /permission denied/);
  await mustFail("become the owner", `SET ROLE ${OWNER}`, /permission denied/);
  await mustFail("read other sequences", `SELECT nextval('"Airport_id_seq"'::regclass); SELECT last_value FROM pg_sequences WHERE false; SELECT setval('"Airport_id_seq"', 1)`, /permission denied/);
  await mustFail("pg_read_server_files", `SELECT pg_read_file('postgresql.conf')`, /permission denied/);
  await mustFail("copy program", `COPY (SELECT 1) TO PROGRAM 'echo x'`, /permission denied/);
  await rc.query(`GRANT ALL ON "Lead" TO PUBLIC`); // a non-owner without grant option: PostgreSQL only WARNS and grants nothing
  await mustFail("grants have no effect", `DELETE FROM "Lead"`, /permission denied/);
  results.refusedCount = Object.keys(refused).length;
  check(Object.keys(refused).length >= 30, `${Object.keys(refused).length} forbidden operations were each refused by the database itself`);

  // ---- future migrations: what a later CRM change does and does not expose to the role ------------------------------------------
  await owner.query(`ALTER TABLE "Lead" ADD COLUMN "futureColumn" text`);
  await owner.query(`ALTER TABLE "Account" ADD COLUMN "futureSecret" text`);
  await owner.query(`CREATE TABLE "FutureCrmTable" (id text PRIMARY KEY, secret text)`);
  const leadAfter = await prisma.$queryRaw<Array<{ n: number }>>`SELECT count(*)::int AS n FROM "Lead" WHERE "futureColumn" IS NULL`;
  check(leadAfter[0].n > 0, "a new nullable column on a granted table is readable/writable without any new grant (table-level grant)");
  await mustFail("new column on a column-granted table", `SELECT "futureSecret" FROM "Account"`, /permission denied/);
  await mustFail("new CRM table", `SELECT * FROM "FutureCrmTable"`, /permission denied/);
  const guardLater = await ensureSchema({ db: { query: async (s, p) => (await rc.query(s, p as unknown[] | undefined)).rows, exec: async (s) => { await rc.query(s); } }, bundle: MIGRATION_BUNDLE, autoInit: false });
  check(!guardLater.initialized && !guardLater.repaired, "the read-only guard still passes after such CRM migrations (it does not need the new objects)");
  await owner.query(`ALTER TABLE "Activity" ADD COLUMN "futureSeq" serial`);
  let seqErr = "";
  try {
    await rc.query(`INSERT INTO "Activity" ("id","type","description") VALUES ('seq-test','NOTE_ADDED','x')`);
  } catch (e) {
    seqErr = String((e as Error).message);
  }
  check(/permission denied for sequence/.test(seqErr), "a NEW sequence on a granted table fails loudly until the owner grants it deliberately (no ALTER DEFAULT PRIVILEGES shortcut)");
  results.futureMigrations = "new columns on table-granted tables work; new columns on column-granted tables, new tables and new sequences require an explicit reviewed grant";

  // ---- done ------------------------------------------------------------------------------------------------------------------------
  await rc.end();
  await prisma.$disconnect();
  await ownerPrisma.$disconnect();
  await owner.end();
  const cleanup = new Client({ connectionString: adminUrl });
  await cleanup.connect();
  await cleanup.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
  await cleanup.query(`DROP ROLE IF EXISTS ${ROLE}`);
  await cleanup.query(`DROP ROLE IF EXISTS ${OWNER}`);
  await cleanup.end();
  console.log(JSON.stringify({ ok: true, ...results, checks }, null, 1));
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e?.constructor?.name, code: e?.code, message: String(e?.message ?? e).slice(0, 900), passedSoFar: checks }, null, 1));
  process.exit(1);
});
