import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { CRM_COMPANY_ID } from "@/lib/constants";

// Shared by both lead-generation paths (the flight request form and the
// general contact form) so a customer who submits both doesn't end up as
// two separate Contact rows in the CRM. Company-scoped dedup, matching the
// CRM's own findDuplicateContact (src/server/actions/leads.ts).
function duplicateContactWhere(e164Phone: string | undefined, rawPhone: string | undefined, email: string | undefined) {
  const or: Array<Record<string, unknown>> = [];
  if (rawPhone) {
    const phoneCandidates = e164Phone && e164Phone !== rawPhone ? [e164Phone, rawPhone] : [rawPhone];
    for (const candidate of phoneCandidates) {
      or.push({ primaryPhone: candidate });
      or.push({ ContactPhone: { some: { number: candidate } } });
    }
  }
  if (email) {
    or.push({ primaryEmail: email });
    or.push({ ContactEmail: { some: { email } } });
  }
  return or;
}

export async function resolveContact(input: {
  firstName: string;
  lastName: string;
  e164Phone?: string;
  rawPhone?: string;
  email: string;
}): Promise<string> {
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const or = duplicateContactWhere(input.e164Phone, input.rawPhone, input.email);
          const existing = or.length > 0 ? await tx.contact.findFirst({ where: { companyId: CRM_COMPANY_ID, OR: or } }) : null;
          if (existing) return existing.id;

          const storedPhone = input.e164Phone ?? input.rawPhone;
          const contact = await tx.contact.create({
            data: {
              firstName: input.firstName,
              lastName: input.lastName,
              primaryPhone: storedPhone,
              primaryEmail: input.email,
              companyId: CRM_COMPANY_ID,
              ContactPhone: storedPhone ? { create: [{ number: storedPhone, type: "MOBILE", isPrimary: true }] } : undefined,
              ContactEmail: { create: [{ email: input.email, type: "PERSONAL", isPrimary: true }] },
            },
          });
          return contact.id;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (err) {
      const isSerializationConflict = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034";
      if (isSerializationConflict && attempt < MAX_ATTEMPTS) continue;
      throw err;
    }
  }
  throw new Error("Could not resolve contact after retries");
}
