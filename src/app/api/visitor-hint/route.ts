import { headers } from "next/headers";
import { resolveClientIp } from "@/lib/client-ip";
import { checkRateLimit } from "@/lib/rate-limit";
import { ipv6Bucket } from "@/lib/rate-limit-client";
import { readVisitorHint } from "@/lib/visitor-hint";

// GET /api/visitor-hint - the visitor's OWN approximate location, reduced to what the forms need: a country code (for the phone field). Nothing else:
// no airport (that comes only from the device's position, if the visitor allows it), no city, no coordinates. See src/lib/visitor-hint.ts.
//
// Deliberately not cacheable: the answer is about the requester. `private, no-store` stops Cloudflare and any other cache from handing one
// visitor's answer to another. No IP address, no coordinates, no city name, no airport are in the response, and nothing is logged or stored.
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" } as const;

// A generous per-client allowance (a visitor makes one call per page that has a form with a suggestion): enough that a household behind one address is
// never affected, low enough that a script hammering the route is answered with 429 instead of being served indefinitely. Only a client the TRUSTED
// proxy path identified is counted (an unidentified one has no location to hint at anyway, and must not share one bucket with everyone). It is the same
// in-process limiter as the forms use, with the same limits (per process, reset on restart); the edge rule in docs/SECURITY_REVIEW_AND_REMAINING_LIMITATIONS.md is the real control.
const HINT_LIMIT_PER_WINDOW = 120;

export async function GET() {
  const headerList = await headers();
  const client = resolveClientIp(headerList);
  if (client.ok) {
    const bucket = client.address.includes(":") ? ipv6Bucket(client.address) : client.address;
    if (!checkRateLimit(`visitor-hint:${bucket}`, HINT_LIMIT_PER_WINDOW).allowed) {
      return Response.json({}, { status: 429, headers: { ...NO_STORE, "Retry-After": "600" } });
    }
  }
  const hint = readVisitorHint(headerList);
  const body: { countryCode?: string } = {};
  if (hint.countryCode) body.countryCode = hint.countryCode;
  return Response.json(body, { headers: NO_STORE });
}
