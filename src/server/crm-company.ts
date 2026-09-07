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

// `async`, not a plain function returning a Promise: the lazy Prisma proxy
// (src/lib/prisma.ts) throws SYNCHRONOUSLY, not as a rejection, the moment
// a missing/unreachable DATABASE_URL is discovered on first property access
// (e.g. `prisma.company` below) — that's intentional there, so a request
// with no database dependency at all never pays for a connection attempt.
// A plain function has no way to convert that synchronous throw into a
// promise rejection on its own; only a function actually declared `async`
// gets that conversion from the language itself. That distinction is
// invisible when this is awaited directly (`await getCrmCompanyId()`
// already runs inside another async function, which performs the same
// conversion regardless), but it matters the moment this is called as a
// bare expression alongside another async call — e.g.
// `Promise.all([resolveContact(...), getCrmCompanyId()])` in
// submit-contact-message.ts. There, `resolveContact(...)` starts first and
// returns its (already-rejecting, since it also awaits this function)
// promise; if the second array element then throws synchronously while
// `Promise.all`'s argument list is still being evaluated, `Promise.all` is
// never actually called — nothing ever attaches a handler to
// `resolveContact`'s promise, and Node logs it as an unhandled rejection
// even though the outer try/catch still runs (rejections need a consumer
// to be marked "handled"; being unwound past by an unrelated synchronous
// throw doesn't count). Declaring this `async` removes the synchronous
// throw entirely, so it can no longer happen regardless of call site.
export async function getCrmCompanyId(): Promise<string> {
  if (cachedCompanyId) return cachedCompanyId;
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
