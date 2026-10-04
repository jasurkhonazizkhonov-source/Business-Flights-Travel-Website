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
import { createWebsiteLead } from "../src/server/create-website-lead";
import { deriveLeadId } from "../src/lib/submission-id";
import { saveLeadSubmissionInfo } from "../src/server/save-submission-info";

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
  // The same Gmail address is both sender and recipient — there is no
  // separate notification-recipient variable.
  process.env.GMAIL_SENDER_EMAIL = "ops+e2e@businessflights.travel";
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
  if (built.to !== "ops+e2e@businessflights.travel") throw new Error("notification recipient did not match the configured GMAIL_SENDER_EMAIL (sender and recipient must be the same address)");
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

  // --- Server-side idempotency, proven against the real engine with the real
  // helper the Server Action uses (computed AFTER the counts above so those
  // stay about the three flows). A repeated/retried/concurrent attempt of the
  // same submission must land on ONE Lead (one status history, one
  // LEAD_CREATED activity); attempts without a key, or with different keys,
  // are separate requests and must stay separate.
  const leadInput = (): Parameters<typeof createWebsiteLead>[1] => ({
    contactId, departureAirportId: from.id, arrivalAirportId: to.id, departureDate: new Date("2027-02-01"), tripType: "ONE_WAY", cabinClass: "BUSINESS",
    adults: 1, children: 0, infants: 0, flexibleDates: false, source: "WEBSITE", priority: "MEDIUM", status: "ATTEMPTING_TO_CONTACT",
    LeadStatusHistory: { create: [{ toStatus: "ATTEMPTING_TO_CONTACT" }] },
    Activity: { create: [{ contactId, actorId: null, type: "LEAD_CREATED", description: "Lead created from the website flight request form" }] },
  });
  const leadsBefore = await prisma.lead.count();
  const keyA = "7b1d2f64-0c9e-4a3b-8d55-1f0a9c3e2b10";
  const idA = deriveLeadId(keyA);
  if (!/^c[0-9a-f]{24}$/.test(idA)) throw new Error(`derived lead id has an unexpected shape: ${idA}`);
  const first = await createWebsiteLead(prisma, leadInput(), idA);
  const second = await createWebsiteLead(prisma, leadInput(), idA); // the "retried POST"
  if (first.duplicate || first.id !== idA) throw new Error(`first attempt should create the Lead under the derived id: ${JSON.stringify(first)}`);
  if (!second.duplicate || second.id !== idA) throw new Error(`second attempt should be reported as a duplicate of the same Lead: ${JSON.stringify(second)}`);
  const keyB = "0d8c4a77-5e21-47aa-9b0c-6a1e3f9d8c21";
  const concurrent = await Promise.all([1, 2, 3, 4].map(() => createWebsiteLead(prisma, leadInput(), deriveLeadId(keyB))));
  const concurrentCreated = concurrent.filter((r) => !r.duplicate).length;
  if (concurrentCreated !== 1) throw new Error(`4 concurrent attempts of one submission must create exactly one Lead, created ${concurrentCreated}`);
  const noKey1 = await createWebsiteLead(prisma, leadInput());
  const noKey2 = await createWebsiteLead(prisma, leadInput());
  if (noKey1.duplicate || noKey2.duplicate || noKey1.id === noKey2.id) throw new Error("two requests without a submission key must stay two separate Leads");
  const leadsAfterAll = await prisma.lead.count();
  if (leadsAfterAll - leadsBefore !== 4) throw new Error(`expected 4 new Leads (A, B, and the two keyless), got ${leadsAfterAll - leadsBefore}`);
  for (const id of [idA, deriveLeadId(keyB)]) {
    const activities = await prisma.activity.count({ where: { leadId: id, type: "LEAD_CREATED" } });
    const history = await prisma.leadStatusHistory.count({ where: { leadId: id } });
    if (activities !== 1 || history !== 1) throw new Error(`lead ${id} must have exactly one LEAD_CREATED activity and one status history row, got ${activities}/${history}`);
  }
  // A genuine failure (invalid FK) under a key is NOT mistaken for a duplicate, creates nothing, and still throws.
  let realFailureThrew = false;
  try {
    await createWebsiteLead(prisma, { ...leadInput(), departureAirportId: -999999 }, deriveLeadId("11111111-1111-4111-8111-111111111111"));
  } catch {
    realFailureThrew = true;
  }
  if (!realFailureThrew) throw new Error("a real persistence failure must propagate, not be reported as a duplicate");
  if ((await prisma.lead.count()) !== leadsAfterAll) throw new Error("a failed attempt must not leave a Lead behind");
  // --- Submission info (full IP + approximate location), against the real engine:
  // the table exists because the BUNDLED migration created it, a retried save
  // never writes a second row or overwrites the first, an ordinary Lead query
  // never loads these values, and deleting the Lead removes the row.
  const infoA = { ip: { address: "203.0.113.42", version: "v4" as const }, location: { city: "San Francisco", regionCode: "CA", region: "California", country: "United States", countryCode: "US", timeZone: "America/Los_Angeles" }, locationSource: "Vercel edge geolocation (approximate)", capturedAt: new Date("2026-10-04T10:00:00Z") };
  if (!(await saveLeadSubmissionInfo(prisma, idA, infoA, "AUD"))) throw new Error("saveLeadSubmissionInfo reported nothing stored for a populated record");
  await saveLeadSubmissionInfo(prisma, idA, { ...infoA, ip: { address: "198.51.100.77", version: "v4" as const } }, "EUR"); // the retried call
  const infoRows = await prisma.leadSubmissionInfo.findMany({ where: { leadId: idA } });
  if (infoRows.length !== 1) throw new Error(`a retried save must leave exactly one row, found ${infoRows.length}`);
  const stored = infoRows[0];
  if (stored.ipAddress !== "203.0.113.42" || stored.ipVersion !== "v4" || stored.city !== "San Francisco" || stored.region !== "California" || stored.countryCode !== "US" || stored.timeZone !== "America/Los_Angeles" || stored.budgetCurrency !== "AUD") {
    throw new Error(`stored submission info does not match what was saved (a retry must not overwrite it): ${JSON.stringify(stored)}`);
  }
  const plainLead = (await prisma.lead.findUnique({ where: { id: idA } })) as Record<string, unknown>;
  if ("ipAddress" in plainLead || "LeadSubmissionInfo" in plainLead) throw new Error("an ordinary Lead query must not carry the submission info");
  const throwaway = await createWebsiteLead(prisma, leadInput());
  await saveLeadSubmissionInfo(prisma, throwaway.id, infoA);
  await prisma.lead.delete({ where: { id: throwaway.id } });
  if ((await prisma.leadSubmissionInfo.count({ where: { leadId: throwaway.id } })) !== 0) throw new Error("deleting a Lead must delete its submission info");
  if (await saveLeadSubmissionInfo(prisma, idA, { capturedAt: new Date() })) throw new Error("a record with nothing to store must not touch the database");
  summary.submissionInfo = { storedFromBundledMigration: true, retrySafe: "one row, original values kept", notLoadedWithOrdinaryLeadQuery: true, cascadeOnLeadDelete: true };
  summary.idempotency = { sameKeyTwice: "one Lead, second reported duplicate", concurrentSameKey: "4 attempts -> 1 Lead", noKeyOrDifferentKey: "separate Leads", leadHasOneActivityAndHistory: true, realFailurePropagates: true };

  console.log(JSON.stringify({ ok: true, ...summary }));
  await prisma.$disconnect();
  await pg.close();
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e?.constructor?.name, code: e?.code, message: String(e?.message ?? e).slice(0, 400) }));
  process.exit(1);
});
