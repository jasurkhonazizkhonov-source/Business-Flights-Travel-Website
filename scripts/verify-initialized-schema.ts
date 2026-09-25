// End-to-end compatibility proof (run: `npm run verify:init-schema`, also
// executed by tests/schema-init-e2e.spec.ts).
//
// 1. Builds the CRM schema in a brand-new, disposable, in-process PostgreSQL
//    (PGlite) using ONLY src/lib/schema-guard.ts + the bundled real migrations.
// 2. Drives the website's real Prisma client (the generated client, exactly what
//    the deployed site uses) through the same write sequences the three server
//    actions perform — Subscriber, Contact + ContactEmail/ContactPhone (in the
//    Serializable transaction resolveContact uses), Lead + LeadStatusHistory +
//    Airport upserts + Activity, ContactInquiry.
//
// If the initialized schema ever drifts from prisma/schema.prisma in a way that
// matters to the website (missing column, wrong enum, missing FK target...),
// a write here throws and this exits non-zero. Prints a JSON summary only —
// no credentials exist in this flow (there is no external database).
import { PGlite } from "@electric-sql/pglite";
import { PrismaPGlite } from "pglite-prisma-adapter";
import { PrismaClient, Prisma } from "../src/generated/prisma/client";
import { ensureSchema, BASELINE_COMPANY } from "../src/lib/schema-guard";
import { MIGRATION_BUNDLE } from "../src/lib/migration-bundle.generated";

async function main() {
  const pg = new PGlite();
  const runner = {
    query: async (sql: string, params?: unknown[]) => (await pg.query(sql, params)).rows as Array<Record<string, unknown>>,
    exec: async (sql: string) => {
      await pg.exec(sql);
    },
  };
  const init = await ensureSchema({ db: runner, bundle: MIGRATION_BUNDLE, autoInit: true });
  await pg.exec(`SELECT 1`); // ensure the lock connection state is clean before Prisma takes over

  const prisma = new PrismaClient({ adapter: new PrismaPGlite(pg) });
  const summary: Record<string, unknown> = { migrationsApplied: init.appliedMigrations.length };

  // getCrmCompanyId()'s exact query
  const company = await prisma.company.findFirst({ select: { id: true } });
  if (!company || company.id !== BASELINE_COMPANY.id) throw new Error("Company lookup failed after initialization");
  summary.companyId = company.id;

  // --- Newsletter (subscribe-newsletter.ts) ---
  const sub = await prisma.subscriber.create({
    data: { companyId: company.id, email: "e2e-newsletter@example.com", status: "SUBSCRIBED", source: "website", unsubscribeToken: "e2e-token-1", updatedAt: new Date() },
  });
  const found = await prisma.subscriber.findUnique({ where: { companyId_email: { companyId: company.id, email: "e2e-newsletter@example.com" } } });
  if (found?.id !== sub.id) throw new Error("Subscriber composite-unique lookup failed");
  await prisma.subscriber.create({ data: { companyId: company.id, email: "e2e-newsletter@example.com", status: "SUBSCRIBED", unsubscribeToken: "e2e-token-2", updatedAt: new Date() } }).then(
    () => { throw new Error("duplicate Subscriber was allowed"); },
    (e) => { if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002") throw e; },
  );
  summary.newsletter = "created; duplicate rejected by unique (companyId,email)";

  // --- Contact resolution (server/contact.ts), Serializable transaction ---
  const contactId = await prisma.$transaction(
    async (tx) => {
      const c = await tx.contact.create({
        data: {
          firstName: "E2E", lastName: "Tester", primaryPhone: "+14155550100", primaryEmail: "e2e-flight@example.com", companyId: company.id,
          ContactPhone: { create: [{ number: "+14155550100", type: "MOBILE", isPrimary: true }] },
          ContactEmail: { create: [{ email: "e2e-flight@example.com", type: "PERSONAL", isPrimary: true }] },
        },
      });
      return c.id;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  // --- Flight request (submit-flight-request.ts) ---
  const [from, to] = await Promise.all([
    prisma.airport.upsert({ where: { iata: "JFK" }, create: { iata: "JFK", name: "John F. Kennedy International Airport", city: "New York", country: "United States" }, update: {} }),
    prisma.airport.upsert({ where: { iata: "LHR" }, create: { iata: "LHR", name: "Heathrow Airport", city: "London", country: "United Kingdom" }, update: {} }),
  ]);
  const lead = await prisma.lead.create({
    data: {
      contactId, departureAirportId: from.id, arrivalAirportId: to.id, departureDate: new Date("2027-01-15"), tripType: "ONE_WAY", cabinClass: "BUSINESS",
      adults: 1, children: 0, infants: 0, flexibleDates: false, source: "WEBSITE", priority: "MEDIUM", status: "ATTEMPTING_TO_CONTACT",
      LeadStatusHistory: { create: [{ toStatus: "ATTEMPTING_TO_CONTACT" }] },
    },
  });
  await prisma.activity.create({ data: { leadId: lead.id, contactId, actorId: null, type: "LEAD_CREATED", description: "Lead created from the website flight request form" } });
  summary.flightRequest = "contact + lead + status history + airports + activity created";

  // --- Get in touch (submit-contact-message.ts) ---
  const inquiry = await prisma.contactInquiry.create({
    data: { companyId: company.id, firstName: "E2E", lastName: "Tester", email: "e2e-contact@example.com", phone: "+14155550100", subject: "GENERAL_INQUIRY", message: "e2e", status: "NEW", matchedContactId: contactId, updatedAt: new Date() },
  });
  await prisma.activity.create({ data: { contactId, actorId: null, type: "CONTACT_INQUIRY_CREATED", description: "Contact inquiry submitted from the website", metadata: { inquiryId: inquiry.id } } });
  summary.contact = "inquiry + activity created";

  summary.counts = {
    company: await prisma.company.count(), subscriber: await prisma.subscriber.count(), contact: await prisma.contact.count(),
    lead: await prisma.lead.count(), contactInquiry: await prisma.contactInquiry.count(), leadStatusHistory: await prisma.leadStatusHistory.count(),
  };
  if ((summary.counts as { company: number }).company !== 1) throw new Error("expected exactly one Company");
  console.log(JSON.stringify({ ok: true, ...summary }));
  await prisma.$disconnect();
  await pg.close();
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e?.constructor?.name, code: e?.code, message: String(e?.message ?? e).slice(0, 400) }));
  process.exit(1);
});
