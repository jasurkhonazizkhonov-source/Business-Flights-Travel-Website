import { createHmac } from "node:crypto";
import type { SubmissionInfo } from "@/lib/submission-info";

// The CRM records a visitor's IP and approximate location for a website lead ONLY from a signed "visitor context" (the connection it sees is
// this website's server, never the visitor). Contract: the CRM's docs/WEBSITE_LEAD_API.md ("Visitor IP and approximate location") and its
// src/server/lead-ingest-context.ts:
//
//   x-ct-visitor-context:   base64url( JSON { v: 1, ts: <unix seconds>, ip?, city?, region?, country?, timezone? } )
//   x-ct-visitor-signature: hex( HMAC-SHA256( LEAD_INGEST_SECRET, <the context header value exactly as sent> ) )
//
// The CRM accepts it for 5 minutes, rejects a bad signature or a private/reserved IP, and then treats the location fields exactly like
// Vercel's x-vercel-ip-* header values: country is the ISO 3166-1 code, region the subdivision code, and the city is percent-decoded - so the
// city is sent percent-encoded, as Vercel would. Without a valid context the lead is stored with no IP and no location.
//
// Only what THIS server itself observed (src/lib/submission-info.ts: trusted proxy headers, never a form field) is signed. Nothing is
// forwarded from the visitor's own headers, and no `cf-*` header ever goes to the CRM.

export const VISITOR_CONTEXT_HEADER = "x-ct-visitor-context";
export const VISITOR_SIGNATURE_HEADER = "x-ct-visitor-signature";

type VisitorContextPayload = { v: 1; ts: number; ip?: string; city?: string; region?: string; country?: string; timezone?: string };

/** Signs a payload. Exported for the contract tests (the CRM's own signVisitorContext computes the same two values). */
export function signVisitorContext(payload: VisitorContextPayload, secret: string): { context: string; signature: string } {
  const context = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return { context, signature: createHmac("sha256", secret).update(context).digest("hex") };
}

/**
 * The two headers for this request, or {} when there is nothing to send (no secret configured, or the server learned neither an IP nor a
 * location).
 */
export function buildVisitorContextHeaders(info: SubmissionInfo | undefined, secret: string | undefined, nowMs: number = Date.now()): Record<string, string> {
  if (!secret || !info) return {};
  const payload: VisitorContextPayload = { v: 1, ts: Math.floor(nowMs / 1000) };
  if (info.ip) payload.ip = info.ip.address;
  const location = info.location;
  if (location) {
    if (location.city) payload.city = encodeURIComponent(location.city);
    const region = location.regionCode ?? location.region;
    if (region) payload.region = region;
    const country = location.countryCode ?? location.country;
    if (country) payload.country = country;
    if (location.timeZone) payload.timezone = location.timeZone;
  }
  if (payload.ip === undefined && payload.city === undefined && payload.region === undefined && payload.country === undefined && payload.timezone === undefined) return {};
  const { context, signature } = signVisitorContext(payload, secret);
  return { [VISITOR_CONTEXT_HEADER]: context, [VISITOR_SIGNATURE_HEADER]: signature };
}
