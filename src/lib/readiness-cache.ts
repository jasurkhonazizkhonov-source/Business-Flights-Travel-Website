// Bounded, self-expiring memo for "the schema was verified healthy".
//
// Why not memoize forever: Vercel instances are long-lived while warm and
// there can be many of them. A process-local "healthy" flag that never
// expires would keep hiding a table someone drops later — the connected
// PostgreSQL database, not process memory, is the authority. So a verified-
// healthy result is trusted only for `ttlMs`; after that the next caller
// triggers ONE shared re-verification (concurrent callers share the same
// promise — never a stampede), which is a cheap catalog inspection once per
// instance per window rather than per customer request.
//
// Invalidation: `invalidate()` drops the memo immediately, used when a write
// fails with a "relation/column does not exist" error so the very next
// request re-inspects (and, if permitted, repairs) instead of waiting out
// the window. Failures are never memoized.
//
// Free of `server-only` and of any database import so it can be unit
// tested with a fake clock.
export interface ReadinessCache {
  ensure(): Promise<void>;
  invalidate(): void;
}

export function createReadinessCache(options: { ttlMs: number; verify: () => Promise<void>; now?: () => number }): ReadinessCache {
  const now = options.now ?? Date.now;
  let entry: { promise: Promise<void>; verifiedAt: number | null } | null = null;
  return {
    ensure() {
      if (entry && (entry.verifiedAt === null || now() - entry.verifiedAt < options.ttlMs)) return entry.promise;
      // eslint-disable-next-line prefer-const
      let created: { promise: Promise<void>; verifiedAt: number | null };
      const promise = options.verify().then(
        () => {
          created.verifiedAt = now();
        },
        (err) => {
          if (entry === created) entry = null; // never memoize a failure
          throw err;
        },
      );
      created = { promise, verifiedAt: null }; // null = still verifying: concurrent callers share this promise
      entry = created;
      return promise;
    },
    invalidate() {
      entry = null;
    },
  };
}

/** True for errors meaning "an object the app expects is missing" (Prisma P2021/P2022, Postgres 42P01/42703). */
export function isMissingSchemaObjectError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  if (code === "P2021" || code === "P2022" || code === "42P01" || code === "42703") return true;
  const meta = (err as { meta?: { driverAdapterError?: { cause?: { originalCode?: unknown } } } } | null)?.meta;
  const original = meta?.driverAdapterError?.cause?.originalCode;
  return original === "42P01" || original === "42703";
}
