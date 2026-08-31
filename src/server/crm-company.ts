import "server-only";
import { prisma } from "@/lib/prisma";

// The CRM ("Compass Tools") is single-tenant per database — exactly one
// Company row exists in any given connected PostgreSQL database, with an
// id Prisma auto-generates as a cuid (see compass-tools/prisma/schema.prisma:
// `Company.id String @id @default(cuid())`, and bootstrap-company.ts's own
// comment: "this app's single-Company-per-DB assumption"). Every website
// submission that needs a `companyId` (Contact, ContactInquiry, Subscriber)
// must resolve THIS database's actual Company row at runtime rather than
// assume a fixed id — a literal like `"default-company"` only happens to
// work against the one database that was manually seeded with that exact
// value, and silently breaks every submission (a foreign-key constraint
// violation on `companyId`, caught by the caller's try/catch and surfaced
// as a generic "something went wrong") the moment `DATABASE_URL` points at
// any other compatible PostgreSQL database — including the CRM's own real,
// properly-bootstrapped one.
//
// Cached in memory once resolved: the single Company row a deployment's
// database has doesn't change during that deployment's lifetime, so this
// is one extra indexed lookup on the first submission per server instance,
// not a query added to every request. A failed lookup (e.g. a brand-new,
// not-yet-bootstrapped database) is NOT cached, so the next attempt
// retries instead of staying broken for the process's lifetime.
let cachedCompanyId: string | null = null;
let pendingLookup: Promise<string> | null = null;

export function getCrmCompanyId(): Promise<string> {
  if (cachedCompanyId) return Promise.resolve(cachedCompanyId);
  if (!pendingLookup) {
    pendingLookup = prisma.company
      .findFirst({ select: { id: true } })
      .then((company) => {
        pendingLookup = null;
        if (!company) {
          throw new Error(
            "No Company row found in the connected database. The CRM database must be bootstrapped (see compass-tools/prisma/bootstrap-company.ts) before website submissions can be stored.",
          );
        }
        cachedCompanyId = company.id;
        return company.id;
      })
      .catch((err) => {
        pendingLookup = null;
        throw err;
      });
  }
  return pendingLookup;
}
