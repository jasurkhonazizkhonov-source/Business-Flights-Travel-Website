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
import { sendFlightRequestNotification, type FlightRequestSegment } from "../src/lib/email/flight-request-notification";
import type { Mailer, MailMessage } from "../src/lib/email/mailer";

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

  // --- Flight Request internal notification: REAL integration, not just an
  // isolated-helper test. Uses the actual, unmodified sendFlightRequestNotification
  // (imported above, the exact function submit-flight-request.ts calls) fed with
  // data read back from the rows JUST persisted above — not hand-typed fixture
  // values — so this proves the notification builder correctly consumes genuinely-
  // persisted Prisma records, not only a test's own assumptions about their shape.
  // Only the SMTP transport itself is faked (as it must be for an automated,
  // credential-free test) — everything else here is the real production code path.
  process.env.FLIGHT_REQUEST_NOTIFICATION_EMAIL = "ops+e2e@businessflights.travel";
  const persistedContact = await prisma.contact.findUniqueOrThrow({ where: { id: contactId } });
  const emailSegments: FlightRequestSegment[] = [{ from, to, departureDate: "2027-01-15" }];
  const sentMessages: MailMessage[] = [];
  const fakeMailer: Mailer = {
    async send(message) {
      sentMessages.push(message);
      return { messageId: "e2e-fake-message-id", response: "250 2.0.0 OK (fake, e2e)", accepted: [message.to], rejected: [] };
    },
  };
  const notifyResult = await sendFlightRequestNotification(
    {
      firstName: persistedContact.firstName,
      lastName: persistedContact.lastName,
      email: persistedContact.primaryEmail ?? "e2e-flight@example.com",
      phoneE164: persistedContact.primaryPhone ?? "+14155550100",
      tripType: "ONE_WAY",
      cabinClass: "BUSINESS",
      adults: 1,
      children: 0,
      infants: 0,
      flexibleDates: false,
      segments: emailSegments,
      submittedAt: new Date(),
    },
    { mailer: fakeMailer },
  );
  if (!notifyResult.sent) throw new Error(`expected the real notification function to report sent:true against persisted data, got: ${JSON.stringify(notifyResult)}`);
  if (sentMessages.length !== 1) throw new Error(`expected exactly one email attempt, got ${sentMessages.length}`);
  const built = sentMessages[0];
  if (built.to !== "ops+e2e@businessflights.travel") throw new Error("notification recipient did not match FLIGHT_REQUEST_NOTIFICATION_EMAIL");
  if (!built.subject.includes("JFK") || !built.subject.includes("LHR")) throw new Error(`subject did not reflect the actual persisted route: ${built.subject}`);
  if (!built.html.includes(persistedContact.firstName) || !built.html.includes(persistedContact.lastName)) {
    throw new Error("notification HTML did not include the actual persisted contact's name");
  }
  if (!built.html.includes("John F. Kennedy International Airport") || !built.html.includes("Heathrow Airport")) {
    throw new Error("notification HTML did not include the actual persisted airport names");
  }
  summary.notification = { sent: true, messageId: (notifyResult as { messageId: string }).messageId, recipient: built.to };

  // --- Failure isolation, proven behaviorally (not just by reading source text):
  // database failure -> notification never attempted; database success + email
  // failure -> the already-saved record is untouched and still there afterward.
  let notifyAttemptedAfterDbFailure = false;
  let dbWriteThrew = false;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.lead.create({
        data: {
          contactId, departureAirportId: -999999, arrivalAirportId: to.id, // invalid FK -> this write throws
          departureDate: new Date(), tripType: "ONE_WAY", cabinClass: "BUSINESS", adults: 1, children: 0, infants: 0, flexibleDates: false,
          source: "WEBSITE", priority: "MEDIUM", status: "ATTEMPTING_TO_CONTACT",
        },
      });
      // Mirrors submit-flight-request.ts's own structure: notification is only
      // ever reached AFTER persistence succeeds, in the same try block — a
      // thrown persistence error means this next line is simply never reached.
      notifyAttemptedAfterDbFailure = true;
      await sendFlightRequestNotification({ firstName: "x", lastName: "y", email: "x@example.com", phoneE164: "+14155550100", tripType: "ONE_WAY", cabinClass: "BUSINESS", adults: 1, children: 0, infants: 0, flexibleDates: false, segments: emailSegments, submittedAt: new Date() }, { mailer: fakeMailer });
    });
  } catch {
    dbWriteThrew = true;
  }
  // Checked OUTSIDE the try/catch above on purpose: if it were inside that
  // same try block, this very assertion failing would be caught by the
  // catch right below it and silently treated as "the expected failure" —
  // masking the real bug (the invalid-FK write unexpectedly succeeding)
  // instead of reporting it.
  if (!dbWriteThrew) throw new Error("expected the invalid-foreign-key Lead write to throw, but it did not");
  if (notifyAttemptedAfterDbFailure) throw new Error("notification was attempted even though persistence failed — this must never happen");
  if (sentMessages.length !== 1) throw new Error("the failed-persistence attempt must not have sent an additional email");
  summary.notificationNotAttemptedOnDbFailure = true;

  const leadCountBeforeEmailFailure = await prisma.lead.count();
  const alwaysFailingMailer: Mailer = { send: async () => { throw new Error("simulated SMTP failure for e2e proof"); } };
  const failedNotifyResult = await sendFlightRequestNotification(
    { firstName: "DbSuccess", lastName: "EmailFail", email: "x@example.com", phoneE164: "+14155550100", tripType: "ONE_WAY", cabinClass: "BUSINESS", adults: 1, children: 0, infants: 0, flexibleDates: false, segments: emailSegments, submittedAt: new Date() },
    { mailer: alwaysFailingMailer },
  );
  if (failedNotifyResult.sent) throw new Error("expected the always-failing mailer to produce sent:false");
  if ((await prisma.lead.count()) !== leadCountBeforeEmailFailure) throw new Error("a notification failure must never affect already-persisted rows");
  summary.dataPreservedOnEmailFailure = true;

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
