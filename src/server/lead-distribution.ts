import "server-only";
import { prisma } from "@/lib/prisma";

// Ports the CRM's own queue-assignment algorithm (src/server/actions/lead-queue.ts
// in the "Compass Tools" app, specifically claimNextWorker/distributeNewWebsiteLead)
// so a website-submitted lead is picked up by the SAME LeadQueueEntry queue,
// with the same least-recently-served ordering and the same race-safety
// (FOR UPDATE SKIP LOCKED + a conditional UPDATE ... WHERE assignedAgentId
// IS NULL). This website is a separate Next.js app/deployment from the CRM,
// so the CRM's own server action can't be called directly — this reproduces
// its logic against the shared database instead of inventing a new, parallel
// assignment scheme.
//
// If the CRM ever grows a public API for this, prefer calling that instead
// of keeping two implementations of the same algorithm in sync by hand.

type DistributionResult =
  | { assigned: true; accountId: string }
  | { assigned: false; reason: "no_active_workers" | "already_assigned" };

const NO_WORKER_RETRY_ATTEMPTS = 5;
const NO_WORKER_RETRY_DELAY_MS = 15;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function claimNextWorker(leadId: string): Promise<DistributionResult> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string; accountId: string }>>`
      SELECT lqe."id", lqe."accountId" FROM "LeadQueueEntry" lqe
      JOIN "Account" a ON a."id" = lqe."accountId"
      WHERE lqe."isActive" = true AND a."role" NOT IN ('TICKETING_AGENT', 'FLIGHT_EXPERT')
      ORDER BY lqe."lastAssignedAt" ASC NULLS FIRST, lqe."joinedAt" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `;
    const worker = rows[0];
    if (!worker) return { assigned: false as const, reason: "no_active_workers" as const };

    const claimed = await tx.lead.updateMany({
      where: { id: leadId, assignedAgentId: null },
      data: { assignedAgentId: worker.accountId, queueDistributedAt: new Date() },
    });
    if (claimed.count === 0) return { assigned: false as const, reason: "already_assigned" as const };

    await tx.leadQueueEntry.update({
      where: { id: worker.id },
      data: { lastAssignedAt: new Date(), leadsAssignedCount: { increment: 1 } },
    });

    return { assigned: true as const, accountId: worker.accountId };
  });
}

/**
 * Best-effort: called right after a new website Lead is inserted with
 * source=WEBSITE, assignedAgentId=null, queueDistributedAt=null. Never
 * throws — a lead that can't be auto-assigned right now (no active queue
 * workers) simply stays unassigned with queueDistributedAt still null, so
 * the CRM's own cron/background distributor (or an agent claiming it
 * manually) can still pick it up later. The website submission itself must
 * never fail just because nobody happens to be in the queue at this moment.
 */
export async function distributeNewWebsiteLead(leadId: string): Promise<DistributionResult> {
  let result: DistributionResult = { assigned: false, reason: "no_active_workers" };
  for (let attempt = 0; attempt < NO_WORKER_RETRY_ATTEMPTS; attempt++) {
    result = await claimNextWorker(leadId);
    if (result.assigned || result.reason !== "no_active_workers") break;
    if (attempt < NO_WORKER_RETRY_ATTEMPTS - 1) await sleep(NO_WORKER_RETRY_DELAY_MS * (attempt + 1));
  }

  if (result.assigned) {
    const lead = await prisma.lead.findUnique({ where: { id: leadId }, include: { Contact_Lead_contactIdToContact: true } });
    const contact = lead?.Contact_Lead_contactIdToContact ?? null;
    await Promise.all([
      prisma.notification.create({
        data: {
          accountId: result.accountId,
          leadId,
          type: "LEAD_ASSIGNED",
          title: contact ? `New lead: ${contact.firstName} ${contact.lastName}` : "New lead assigned to you",
          body: "Assigned automatically from the website lead queue.",
        },
      }),
      prisma.activity.create({
        data: {
          leadId,
          contactId: contact?.id,
          actorId: null,
          type: "LEAD_AUTO_ASSIGNED",
          description: "Automatically assigned via the lead queue",
        },
      }),
    ]);
  }

  return result;
}
