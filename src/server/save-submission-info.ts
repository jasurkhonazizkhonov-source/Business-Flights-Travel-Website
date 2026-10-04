import type { PrismaClient } from "@/generated/prisma/client";
import { hasSubmissionDetails, type SubmissionInfo } from "@/lib/submission-info";

// Not "server-only" and takes the client as a parameter, for the same reason
// src/server/create-website-lead.ts does: the persistence behaviour is proven
// against a real PostgreSQL engine in scripts/verify-initialized-schema.ts.

/**
 * Stores what the server learned about the submitting request against the
 * Lead: the full IP address it received and the platform's approximate
 * (IP-derived, never exact) location, plus the budget currency the customer
 * chose. One row per Lead (`leadId` is unique), so repeating this for the same
 * Lead — a retried request — is a no-op, never a second row.
 *
 * Deliberately a separate table written AFTER the Lead is saved and after the
 * response, by the caller's best-effort `after()` path: it can never block or
 * fail the customer's submission, and an unavailable table (the CRM migration
 * not yet applied to this database) only means this one call throws and is
 * logged. Returns false when there was nothing to store.
 */
export async function saveLeadSubmissionInfo(
  client: Pick<PrismaClient, "leadSubmissionInfo">,
  leadId: string,
  info: SubmissionInfo | undefined,
  budgetCurrency?: string,
): Promise<boolean> {
  if (!hasSubmissionDetails(info) && !budgetCurrency) return false;
  const location = info?.location;
  const data = {
    ipAddress: info?.ip?.address,
    ipVersion: info?.ip?.version,
    city: location?.city,
    // The readable name where this app knows it, otherwise the code as supplied.
    region: location?.region ?? location?.regionCode,
    country: location?.country,
    countryCode: location?.countryCode,
    timeZone: location?.timeZone,
    geoSource: info?.locationSource,
    budgetCurrency,
    capturedAt: info?.capturedAt,
  };
  await client.leadSubmissionInfo.upsert({ where: { leadId }, create: { leadId, ...data }, update: {} });
  return true;
}
