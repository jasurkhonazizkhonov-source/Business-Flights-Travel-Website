import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Server-only: importing this from a Client Component fails the build
// (via the "server-only" package) rather than silently bundling DATABASE_URL
// into client JavaScript.

// The CRM's Aiven Postgres instance presents a certificate chain the default
// TLS validation rejects; stripping sslmode from the URL and validating via
// an explicit `ssl` option (rejectUnauthorized: false, still TLS-encrypted)
// mirrors the CRM app's own prisma/bootstrap-company.ts connection setup.
function connectionStringWithoutSslMode(url: string): string {
  const u = new URL(url);
  u.searchParams.delete("sslmode");
  return u.toString();
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// The shared CRM Postgres instance caps out at 20 total connections, with a
// handful permanently held by background workers (pg_cron, replication,
// etc.) before any application even connects. `next build` runs static
// generation across several parallel worker *processes*, each with its own
// independent connection pool — at the default pool size, a handful of
// workers alone can exceed what's left of that budget. Capping the pool to
// a single connection specifically during the build phase keeps the worst
// case bounded to (worker count), while a normal request-serving process
// (dev server, `next start`) still gets a real pool for concurrency.
const POOL_MAX = process.env.NEXT_PHASE === "phase-production-build" ? 1 : 5;

function createPrismaClient() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set. Add it to .env (server-side only, never NEXT_PUBLIC_*).");
  }
  const adapter = new PrismaPg({
    connectionString: connectionStringWithoutSslMode(databaseUrl),
    ssl: { rejectUnauthorized: false },
    max: POOL_MAX,
  });
  return new PrismaClient({ adapter });
}

function getPrismaClient(): PrismaClient {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;
  const client = createPrismaClient();
  // Reused across hot-reloads in dev so each edit doesn't open a fresh pool
  // against the shared CRM database.
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
  }
  return client;
}

// A lazy proxy, not `createPrismaClient()` called directly at module scope.
// The previous eager version constructed (and, without DATABASE_URL, threw
// from) the real client the moment this module was first imported —
// including transitively, whenever a page bundled a "use server" action
// that imports it (every form's src/server/actions/*.ts). That happens
// during normal request handling and during `next build`'s page-data
// collection alike, so a missing/unreachable database crashed the entire
// page with Next's generic error overlay before any of the server actions'
// own try/catch could run — even for a request that never actually
// submitted a form, and even for pages whose visible content (like the
// flight request form's application-owned airport autocomplete) has no
// database dependency at all. Deferring construction until the first real
// `prisma.<model>.<method>()` call means that failure now surfaces exactly
// where it's already handled: inside the try/catch in each server action,
// which returns the friendly, generic error message the security review
// requires instead of leaking a stack trace.
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrismaClient();
    const value = Reflect.get(client as object, prop);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
