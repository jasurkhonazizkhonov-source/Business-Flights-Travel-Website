import { resolveClientIp } from "@/lib/client-ip";

// The "who is this client" part of the public forms' rate limits (flight request, contact message, newsletter).
//
// It used to be the first value of X-Forwarded-For. That header is chosen by the visitor (Cloudflare keeps a client-supplied value
// first and only appends the real address), so rotating it gave every request a fresh bucket and the limit never applied.
//
// Now the client is whatever the TRUSTED proxy path says it is - the same resolution that records a lead's IP (src/lib/client-ip.ts):
// with TRUSTED_PROXY=cloudflare that is CF-Connecting-IP only (Cloudflare overwrites it, and the origin is reachable only through the
// tunnel); on Vercel the platform's own headers; with no trusted proxy configured, nothing is believed.
//
// When no usable trusted client IP exists (header missing, malformed, private/reserved, several values, or no trusted proxy), the
// request is NOT assumed to be any particular client and NOT given a bucket of its own choosing: every such request shares ONE fixed
// bucket with the normal threshold. No header value can select or enlarge that bucket, so a spoofer gains nothing by omitting or
// corrupting the trusted header. The trade-off is deliberate and visible: if the trusted header were ever absent for ALL traffic
// (a mis-routed tunnel), real visitors would share that single allowance - which is why the fallback is logged (below) and why the
// deployment checklist has a real test submission that must store the visitor's IP.

/** The one fixed bucket for requests whose client IP cannot be established from the trusted path. Not a valid IP, so it cannot collide with one. */
export const UNRESOLVED_CLIENT = "unresolved";

/**
 * Requests the trusted proxy path could not attribute to a client all share ONE bucket (so rotating a forged address gains nothing), and that bucket gets a larger
 * allowance than a single client: if attribution is ever lost for ALL traffic (a mis-routed tunnel, an edge proof set before its Cloudflare rule exists), real
 * visitors then share it, and the base allowance of one client would lock the whole site out after a handful of submissions. The same factor the CRM applies to its own
 * "unattributed" website traffic (src/server/website-signature-guard.ts WEBSITE_UNATTRIBUTED_RATE_MULTIPLIER), so the two layers degrade in step.
 */
export const UNRESOLVED_ALLOWANCE_MULTIPLIER = 5;

/** The allowance for this client key: the base for an attributed client, the larger shared allowance for the unresolved bucket. */
export function limitFor(base: number, clientKey: string): number {
  return clientKey === UNRESOLVED_CLIENT ? base * UNRESOLVED_ALLOWANCE_MULTIPLIER : base;
}

const WARN_EVERY_MS = 5 * 60 * 1000;
let lastWarnAt = 0;

/**
 * The bucket for an IPv6 client is its /64 (the first four 16-bit groups), the unit one subscriber or one device is normally given: the owner of a /64
 * can choose among 2^64 addresses, so a per-address bucket would let a single client mint a fresh allowance for every request. The result
 * ("2001:db8:1:2::/64") is never a valid address, so it cannot collide with an IPv4 key or with UNRESOLVED_CLIENT. Input is the canonical form that
 * normalizeIp returns (lower-case, zero-compressed, no embedded IPv4).
 */
export function ipv6Bucket(canonical: string): string {
  const [head, tail] = canonical.split("::");
  const front = head ? head.split(":") : [];
  const back = tail === undefined ? [] : tail ? tail.split(":") : [];
  const groups = tail === undefined ? front : [...front, ...Array(Math.max(0, 8 - front.length - back.length)).fill("0"), ...back];
  return `${groups.slice(0, 4).join(":")}::/64`;
}

/**
 * The rate-limit client key for a request: the trusted client IP (an IPv6 client by its /64), or UNRESOLVED_CLIENT. Never any text taken from a header.
 * The fallback is announced in the server log at most once per interval, with the value-free reason category only.
 */
export function rateLimitClientKey(headerList: Headers, now: number = Date.now()): string {
  const resolved = resolveClientIp(headerList);
  if (resolved.ok) return resolved.address.includes(":") ? ipv6Bucket(resolved.address) : resolved.address;
  if (now - lastWarnAt >= WARN_EVERY_MS) {
    lastWarnAt = now;
    console.warn(
      `[rate-limit] no trusted client IP (${resolved.reason}); applying the shared "${UNRESOLVED_CLIENT}" bucket. If this appears for normal visitor traffic, check TRUSTED_PROXY and the tunnel route (docs/DEPLOYMENT_VPS.md).`,
    );
  }
  return UNRESOLVED_CLIENT;
}
