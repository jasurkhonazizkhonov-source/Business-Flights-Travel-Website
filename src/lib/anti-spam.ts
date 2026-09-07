// Shared anti-spam check used by every form's server action
// (submit-flight-request.ts, submit-contact-message.ts). Pulled out as a
// plain, dependency-free function — no `next/headers`, no Prisma, nothing
// that requires a live Next.js request context or database — specifically
// so it can be exercised directly by an automated test (tests/anti-spam.spec.ts)
// without needing to replay a build-generated Server Action id or spin up a
// server. Behavior is unchanged from what was previously inlined in each
// action; only the location moved.
//
// Two independent signals, either one alone is enough to reject:
//   1. Honeypot (`website`) — a hidden field a real visitor never sees or
//      fills; only a bot filling every field blind trips it.
//   2. Timing (`renderedAt`) — set via useState(() => Date.now()) the
//      instant the real form mounts (FlightRequestForm.tsx /
//      ContactForm.tsx), so a submission arriving suspiciously soon after
//      that timestamp didn't come from a human filling the form.
//
// `renderedAt` is REQUIRED to pass, not merely checked when present: a
// crafted request that simply omits this optional field must be rejected
// the same way one that omits `website` is, or the timing check does
// nothing against exactly the request it exists to catch. This is the
// fixed form of a real bug — the previous `data.renderedAt && (too-fast
// check)` short-circuit let a missing timestamp pass silently.
export function isSpamSubmission(input: { website?: string | null; renderedAt?: number | null; minFillMs: number; now?: number }): boolean {
  const now = input.now ?? Date.now();
  if (input.website) return true;
  if (!input.renderedAt || now - input.renderedAt < input.minFillMs) return true;
  return false;
}
