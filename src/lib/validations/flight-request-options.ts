// Plain runtime constants the client-side flight form needs (trip type and
// cabin class options) — deliberately split out of flight-request.ts, which
// also builds the full Zod validation schema. Zod (plus every `.refine()`
// call in that schema) has no reason to ship to the browser: only the
// server action actually validates with it. But because flight-request.ts
// imports `zod` at its top level, any client component that imported even
// a single plain value from that file (e.g. TRIP_TYPES) pulled the entire
// module — zod included — into the client bundle, since bundlers can't
// safely tree-shake past `z.object(...).refine(...)` calls, which look
// like they could have side effects. That was measured as ~2.4s of a
// single chunk's script execution in a production Lighthouse run.
// This file has zero dependencies, so importing from it (instead of from
// flight-request.ts) can't pull zod in. flight-request.ts re-exports these
// same two constants so the server/schema side of the app still has one
// canonical import path.
export const TRIP_TYPES = ["ONE_WAY", "ROUND_TRIP", "MULTI_CITY"] as const;
export const CABIN_CLASSES = ["ECONOMY", "PREMIUM_ECONOMY", "BUSINESS", "FIRST"] as const;
