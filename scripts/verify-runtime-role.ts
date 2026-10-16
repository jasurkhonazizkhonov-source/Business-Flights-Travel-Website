// Real-engine proof (PGlite = PostgreSQL compiled to WASM) of the website's LEAST-PRIVILEGE database role:
//   1. build the CRM-compatible schema as the OWNER, from the bundled real migrations (schema-guard + migration bundle);
//   2. create a role and apply EXACTLY deploy/sql/website-runtime-role-grants.sql to it;
//   3. switch the session to that role and run the website's real write paths through the real Prisma client and the real helpers —
//      schema guard (read-only), newsletter, contact resolution, airport upserts, flight-request Lead (nested history + activity),
//      submission info, contact inquiry, and the lead-queue assignment statements;
//   4. prove the role CANNOT create/alter/drop objects, delete, truncate, change grants, or read CRM tables outside the grant list.
// Prints one JSON line. Run through tests/runtime-role-e2e.spec.ts (it needs the generated, ESM-only Prisma client, like
// scripts/verify-initialized-schema.ts). No production database is involved.
import { PGlite } from "@electric-sql/pglite";
import { PrismaPGlite } from "pglite-prisma-adapter";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient, Prisma } from "../src/generated/prisma/client";
import { ensureSchema, BASELINE_COMPANY } from "../src/lib/schema-guard";
import { MIGRATION_BUNDLE } from "../src/lib/migration-bundle.generated";
import { createWebsiteLead } from "../src/server/create-website-lead";
import { saveLeadSubmissionInfo } from "../src/server/save-submission-info";
import { deriveLeadId } from "../src/lib/submission-id";

const ROLE = "bft_runtime_test";

async function main() {
  const pg = new PGlite();
  const runner = {
    query: async (sql: string, params?: unknown[]) => (await pg.query(sql, params)).rows as Array<Record<string, unknown>>,
    exec: async (sql: string) => {
      await pg.exec(sql);
    },
  };

  // ---- 1. schema + fixtures, as the owner -------------------------------------------------------------------------------------
  const init = await ensureSchema({ db: runner, bundle: MIGRATION_BUNDLE, autoInit: true });
  const prisma = new PrismaClient({ adapter: new PrismaPGlite(pg) });
  const company = await prisma.company.findFirst({ select: { id: true } });
  if (!company || company.id !== BASELINE_COMPANY.id) throw new Error("company missing after initialization");
  await prisma.account.create({ data: { id: "acc-queue-1", fullName: "Queue Agent", email: "agent@example.com", role: "TRAVEL_AGENT", companyId: company.id, updatedAt: new Date() } });
  await prisma.leadQueueEntry.create({ data: { id: "lqe-1", accountId: "acc-queue-1", updatedAt: new Date() } });

  // ---- 2. the role and the grants file, exactly as an owner would apply it ---------------------------------------------------
  await pg.exec(`CREATE ROLE ${ROLE} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE`);
  const grants = readFileSync(path.join(__dirname, "..", "deploy", "sql", "website-runtime-role-grants.sql"), "utf8").split(':"role"').join(`"${ROLE}"`);
  await pg.exec(grants);

  // ---- 3. everything below runs as the restricted role ------------------------------------------------------------------------
  await pg.exec(`SET ROLE ${ROLE}`);
  const who = (await pg.query<{ current_user: string }>("SELECT current_user")).rows[0].current_user;
  if (who !== ROLE) throw new Error(`expected to run as ${ROLE}, running as ${who}`);
  const summary: Record<string, unknown> = { role: who, migrationsApplied: init.appliedMigrations.length };

  // Schema guard, read-only (DATABASE_AUTO_INIT unset): healthy, and it creates/repairs NOTHING.
  const guard = await ensureSchema({ db: runner, bundle: MIGRATION_BUNDLE, autoInit: false });
  if (guard.initialized || guard.repaired) throw new Error("the schema guard must not initialize or repair as the runtime role");
  summary.schemaGuard = "healthy, read-only";

  const coId = (await prisma.company.findFirst({ select: { id: true } }))!.id;

  // Newsletter (subscribe-newsletter.ts)
  const sub = await prisma.subscriber.create({ data: { companyId: coId, email: "role-news@example.com", status: "SUBSCRIBED", source: "website", unsubscribeToken: "role-tok-1", updatedAt: new Date() } });
  await prisma.subscriber.update({ where: { id: sub.id }, data: { status: "SUBSCRIBED", subscribedAt: new Date(), unsubscribedAt: null, updatedAt: new Date() } });
  if (!(await prisma.subscriber.findUnique({ where: { companyId_email: { companyId: coId, email: "role-news@example.com" } } }))) throw new Error("subscriber lookup failed");

  // Contact resolution (server/contact.ts): Serializable transaction, find-or-create with nested phone/email rows
  const contactId = await prisma.$transaction(
    async (tx) => {
      const existing = await tx.contact.findFirst({ where: { companyId: coId, OR: [{ primaryEmail: "role-flight@example.com" }, { ContactEmail: { some: { email: "role-flight@example.com" } } }] } });
      if (existing) return existing.id;
      const c = await tx.contact.create({
        data: {
          firstName: "Role", lastName: "Tester", primaryPhone: "+14155550123", primaryEmail: "role-flight@example.com", companyId: coId,
          ContactPhone: { create: [{ number: "+14155550123", type: "MOBILE", isPrimary: true }] },
          ContactEmail: { create: [{ email: "role-flight@example.com", type: "PERSONAL", isPrimary: true }] },
        },
      });
      return c.id;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  // Flight request (submit-flight-request.ts): airports (insert path, then the existing-row path), nested Lead, activity, submission info
  const mkAirports = () =>
    Promise.all([
      prisma.airport.upsert({ where: { iata: "SYD" }, create: { iata: "SYD", name: "Sydney Kingsford Smith", city: "Sydney", country: "Australia" }, update: {} }),
      prisma.airport.upsert({ where: { iata: "LHR" }, create: { iata: "LHR", name: "Heathrow Airport", city: "London", country: "United Kingdom" }, update: {} }),
    ]);
  const [from, to] = await mkAirports();
  await mkAirports(); // existing rows: the update branch
  const leadInput = (): Parameters<typeof createWebsiteLead>[1] => ({
    contactId, departureAirportId: from.id, arrivalAirportId: to.id, departureDate: new Date("2027-03-01"), tripType: "ONE_WAY", cabinClass: "BUSINESS",
    adults: 1, children: 0, infants: 0, flexibleDates: false, source: "WEBSITE", priority: "MEDIUM", status: "ATTEMPTING_TO_CONTACT",
    LeadStatusHistory: { create: [{ toStatus: "ATTEMPTING_TO_CONTACT" }] },
    Activity: { create: [{ contactId, actorId: null, type: "LEAD_CREATED", description: "Lead created from the website flight request form" }] },
  });
  const leadId = deriveLeadId("0b7f2a54-6c1e-4d9a-9e43-2a5b7c1d8e90");
  const first = await createWebsiteLead(prisma, leadInput(), leadId);
  const retry = await createWebsiteLead(prisma, leadInput(), leadId);
  if (first.duplicate || !retry.duplicate) throw new Error("idempotent lead creation must work as the runtime role");
  const info = { ip: { address: "198.51.100.23", version: "v4" as const }, capturedAt: new Date(), location: { city: "Sydney", country: "Australia", countryCode: "AU" }, locationSource: "Cloudflare edge geolocation (approximate)" };
  if (!(await saveLeadSubmissionInfo(prisma, leadId, info, "AUD"))) throw new Error("submission info was not stored");
  await saveLeadSubmissionInfo(prisma, leadId, { ...info, ip: { address: "198.51.100.99", version: "v4" as const } }, "EUR"); // retry
  const rows = await prisma.leadSubmissionInfo.findMany({ where: { leadId } });
  if (rows.length !== 1 || rows[0].ipAddress !== "198.51.100.23") throw new Error("a retried save must keep exactly the first row");

  // Contact inquiry (submit-contact-message.ts)
  const inquiry = await prisma.contactInquiry.create({ data: { companyId: coId, firstName: "Role", lastName: "Tester", email: "role-flight@example.com", phone: "+14155550123", subject: "GENERAL_INQUIRY", message: "Hello", status: "NEW", matchedContactId: contactId, updatedAt: new Date() } });
  await prisma.activity.create({ data: { contactId, actorId: null, type: "CONTACT_INQUIRY_CREATED", description: "Contact inquiry submitted from the website", metadata: { inquiryId: inquiry.id, subject: "GENERAL_INQUIRY" } } });

  // Lead queue assignment (server/lead-distribution.ts): the same statements
  const assigned = await prisma.$transaction(async (tx) => {
    const picked = await tx.$queryRaw<Array<{ id: string; accountId: string }>>`
      SELECT lqe."id", lqe."accountId" FROM "LeadQueueEntry" lqe
      JOIN "Account" a ON a."id" = lqe."accountId"
      WHERE lqe."isActive" = true AND a."role" NOT IN ('TICKETING_AGENT', 'FLIGHT_EXPERT')
      ORDER BY lqe."lastAssignedAt" ASC NULLS FIRST, lqe."joinedAt" ASC
      LIMIT 1
      FOR UPDATE OF lqe SKIP LOCKED`;
    const worker = picked[0];
    if (!worker) throw new Error("queue entry not visible to the runtime role");
    const claimed = await tx.lead.updateMany({ where: { id: leadId, assignedAgentId: null }, data: { assignedAgentId: worker.accountId, queueDistributedAt: new Date() } });
    if (claimed.count !== 1) throw new Error("lead was not claimed");
    await tx.leadQueueEntry.update({ where: { id: worker.id }, data: { lastAssignedAt: new Date(), leadsAssignedCount: { increment: 1 } } });
    return worker.accountId;
  });
  const leadRow = await prisma.lead.findUnique({ where: { id: leadId }, include: { Contact_Lead_contactIdToContact: true } });
  await prisma.notification.create({ data: { accountId: assigned, leadId, type: "LEAD_ASSIGNED", title: `New lead: ${leadRow?.Contact_Lead_contactIdToContact?.firstName}`, body: "Assigned automatically from the website lead queue." } });
  await prisma.activity.create({ data: { leadId, contactId, actorId: null, type: "LEAD_AUTO_ASSIGNED", description: "Automatically assigned via the lead queue" } });
  summary.writePaths = "newsletter, contact, airports, lead(+history+activity), submission info, inquiry, queue assignment + notification: all succeeded";

  // ---- 4. what the role must NOT be able to do ---------------------------------------------------------------------------------
  const refused: Record<string, string> = {};
  const mustFail = async (label: string, sql: string, pattern: RegExp) => {
    try {
      await pg.exec(sql);
    } catch (e) {
      const message = String((e as Error).message ?? e);
      if (!pattern.test(message)) throw new Error(`${label}: failed, but not with the expected permission error: ${message}`);
      refused[label] = message.split("\n")[0];
      return;
    }
    throw new Error(`${label}: SUCCEEDED but the runtime role must be refused`);
  };
  await mustFail("create table", `CREATE TABLE "Evil" (id int)`, /permission denied/);
  await mustFail("alter table", `ALTER TABLE "Lead" ADD COLUMN evil int`, /must be owner|permission denied/);
  await mustFail("drop table", `DROP TABLE "Activity"`, /must be owner|permission denied/);
  await mustFail("create index", `CREATE INDEX evil_idx ON "Lead" ("status")`, /must be owner|permission denied/);
  await mustFail("truncate", `TRUNCATE "Lead" CASCADE`, /permission denied/);
  await mustFail("delete lead", `DELETE FROM "Lead"`, /permission denied/);
  await mustFail("delete subscriber", `DELETE FROM "Subscriber"`, /permission denied/);
  await mustFail("update account", `UPDATE "Account" SET "email" = 'x@example.com'`, /permission denied/);
  await mustFail("insert account", `INSERT INTO "Account" ("id","fullName","email","updatedAt","companyId") VALUES ('x','x','y@example.com',now(),'c')`, /permission denied/);
  await mustFail("read payment methods", `SELECT * FROM "PaymentMethod"`, /permission denied/);
  await mustFail("read bookings", `SELECT * FROM "Booking"`, /permission denied/);
  await mustFail("read audit log", `SELECT * FROM "AuditLog"`, /permission denied/);
  await mustFail("read gmail connection", `SELECT * FROM "GmailConnection"`, /permission denied/);
  // PostgreSQL only WARNS (and grants nothing) when a non-owner without grant option runs GRANT, so prove the EFFECT instead.
  await pg.exec(`GRANT ALL ON "Lead" TO PUBLIC`);
  await mustFail("change grants", `DELETE FROM "Lead"`, /permission denied/);
  await mustFail("create role", `CREATE ROLE evil_role`, /permission denied/);
  await mustFail("write migration ledger", `DELETE FROM "_prisma_migrations"`, /permission denied/);
  summary.refused = refused;

  await pg.exec("RESET ROLE");
  await prisma.$disconnect();
  await pg.close();
  console.log(JSON.stringify({ ok: true, ...summary }));
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e?.constructor?.name, code: e?.code, message: String(e?.message ?? e).slice(0, 600) }));
  process.exit(1);
});
