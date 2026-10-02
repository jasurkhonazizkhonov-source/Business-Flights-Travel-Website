import type { Prisma, PrismaClient } from "@/generated/prisma/client";

// Deliberately NOT "server-only", and takes the Prisma client as a parameter:
// the persistence-and-idempotency behaviour below is proven against a real
// PostgreSQL engine in scripts/verify-initialized-schema.ts (see
// tests/schema-init-e2e.spec.ts), the same reason src/lib/anti-spam.ts and
// src/lib/db-error.ts live outside their "use server" callers.

/**
 * Creates the Lead (with its status history and LEAD_CREATED activity in the
 * SAME transaction, so a Lead can never exist without them).
 *
 * When `leadId` is given (derived from the form's submission key — see
 * src/lib/submission-id.ts) it is used as the primary key, so a second
 * attempt of the same submission cannot create a second row: the insert
 * fails on the primary key and this reports `duplicate: true` instead.
 * Concurrent attempts are safe for the same reason — the database serializes
 * them on that key.
 *
 * "Did the insert fail because the row already exists?" is answered by
 * looking the row up, not by interpreting an error code, so it holds under
 * any driver/adapter error mapping. Anything else is rethrown untouched.
 */
export async function createWebsiteLead(
  client: Pick<PrismaClient, "lead">,
  data: Prisma.LeadUncheckedCreateInput,
  leadId?: string,
): Promise<{ id: string; duplicate: boolean }> {
  try {
    const lead = await client.lead.create({ data: leadId ? { ...data, id: leadId } : data, select: { id: true } });
    return { id: lead.id, duplicate: false };
  } catch (err) {
    if (leadId) {
      const existing = await client.lead.findUnique({ where: { id: leadId }, select: { id: true } });
      if (existing) return { id: existing.id, duplicate: true };
    }
    throw err;
  }
}
