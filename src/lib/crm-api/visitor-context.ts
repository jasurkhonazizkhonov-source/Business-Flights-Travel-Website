import { createHash, createHmac, randomBytes } from "node:crypto";
import type { SubmissionInfo } from "@/lib/submission-info";
import { CLOUDFLARE_GEO_SOURCE, GEO_SOURCE } from "@/lib/ip-geo";

// Signing v2: every request the website's SERVER sends to the Compass Tools CRM carries ONE authenticated, single-use envelope. It replaces the v1 "visitor
// context" signature, which vouched only for the visitor fields and bound nothing else (so a captured envelope could be attached to a different request for
// five minutes). The CRM's verifier is src/server/website-request-signature.ts in the CRM project; the two applications implement the same specification
// independently and share one known-answer vector (tests/contact-visitor-context.spec.ts here, website-request-signature.test.ts there).
//
//   x-ct-visitor-context:   base64url( JSON { v: 2, ts, nonce, ip?, city?, region?, country?, timezone?, source? } )
//   x-ct-visitor-signature: hex( HMAC-SHA256( LEAD_INGEST_SECRET, canonicalMessage ) )
//
//   canonicalMessage = "CT-WEBSITE-REQUEST-V2" LF field LF field ...   each field written as <byte length of its UTF-8 form>:<field>, in this order:
//     METHOD (upper case) | path (pathname only) | companyId | ts (decimal unix seconds) | nonce |
//     SHA-256 of the EXACT request body bytes (64 lower-case hex) | the context header value exactly as sent
//
// The method, path, company and body hash are not sent: the CRM recomputes them from the request it receives, so changing any of them breaks the signature.
// ts/nonce are fresh for EVERY attempt (the CRM accepts a nonce once, within about two minutes); a retry is therefore signed again, and the unchanged
// Idempotency-Key / submissionId is what makes the retry a duplicate instead of a second record.
//
// Only what THIS server itself observed (src/lib/submission-info.ts: trusted proxy headers, never a form field) is signed as visitor information. Nothing is
// forwarded from the visitor's own headers, and no `cf-*` header ever goes to the CRM. The secret never leaves the server process and never appears in a header.

export const VISITOR_CONTEXT_HEADER = "x-ct-visitor-context";
export const VISITOR_SIGNATURE_HEADER = "x-ct-visitor-signature";
export const SIGNATURE_VERSION = 2;
const DOMAIN = "CT-WEBSITE-REQUEST-V2";

/** Which edge produced the location fields, so the CRM can label them accurately instead of assuming its own platform. Sent only with a location. */
type LocationSource = "cloudflare" | "vercel";
export type SignedContextPayload = { v: 2; ts: number; nonce: string; ip?: string; city?: string; region?: string; country?: string; timezone?: string; source?: LocationSource };

export type SignedRequestParts = { method: string; path: string; companyId: string; ts: number; nonce: string; bodySha256: string; context: string };

/** The one canonical message both applications HMAC. Length-prefixed: no field value can change where another one begins. */
export function canonicalRequestMessage(p: SignedRequestParts): string {
  const fields = [p.method.toUpperCase(), p.path, p.companyId, String(p.ts), p.nonce, p.bodySha256, p.context];
  return `${DOMAIN}\n${fields.map((f) => `${Buffer.byteLength(f, "utf8")}:${f}`).join("\n")}`;
}

export function sha256Hex(body: Uint8Array | string): string {
  return createHash("sha256").update(typeof body === "string" ? Buffer.from(body, "utf8") : body).digest("hex");
}

/** Signs a payload for one request. Exported for the contract tests. */
export function signRequestV2(input: { secret: string; method: string; path: string; companyId: string; body: Uint8Array | string; payload: SignedContextPayload }): {
  context: string;
  signature: string;
} {
  const context = Buffer.from(JSON.stringify(input.payload), "utf8").toString("base64url");
  const message = canonicalRequestMessage({ method: input.method, path: input.path, companyId: input.companyId, ts: input.payload.ts, nonce: input.payload.nonce, bodySha256: sha256Hex(input.body), context });
  return { context, signature: createHmac("sha256", input.secret).update(message).digest("hex") };
}

/** What a request signer needs to know about the exact request it is signing. */
export type RequestToSign = { method: string; path: string; companyId: string; body: string };
/** Returns the two headers for exactly this request. Called once per ATTEMPT (fresh timestamp and nonce every time). */
export type RequestSigner = (request: RequestToSign) => Record<string, string>;

function visitorFields(info: SubmissionInfo | undefined): Pick<SignedContextPayload, "ip" | "city" | "region" | "country" | "timezone" | "source"> {
  const out: Pick<SignedContextPayload, "ip" | "city" | "region" | "country" | "timezone" | "source"> = {};
  if (info?.ip) out.ip = info.ip.address;
  const location = info?.location;
  if (location) {
    if (location.city) out.city = encodeURIComponent(location.city);
    const region = location.regionCode ?? location.region;
    if (region) out.region = region;
    const country = location.countryCode ?? location.country;
    if (country) out.country = country;
    if (location.timeZone) out.timezone = location.timeZone;
    // The website knows which trusted edge supplied these values (src/lib/submission-info.ts). A CRM that does not know the field ignores it.
    if (info?.locationSource === CLOUDFLARE_GEO_SOURCE) out.source = "cloudflare";
    else if (info?.locationSource === GEO_SOURCE) out.source = "vercel";
  }
  return out;
}

/**
 * A signer for this submission, or undefined when no secret is configured (nothing can be signed; the CRM then refuses the request if it has a secret, which the
 * visitor sees as a clear failure rather than an unauthenticated fallback). `info` is what this server observed; with neither an IP nor a location the
 * envelope still authenticates the request, it simply carries no visitor facts.
 */
export function createRequestSigner(
  info: SubmissionInfo | undefined,
  secret: string | undefined,
  clock: () => number = Date.now,
  makeNonce: () => string = () => randomBytes(16).toString("base64url"),
): RequestSigner | undefined {
  if (!secret) return undefined;
  const facts = visitorFields(info);
  return ({ method, path, companyId, body }) => {
    const payload: SignedContextPayload = { v: SIGNATURE_VERSION, ts: Math.floor(clock() / 1000), nonce: makeNonce(), ...facts };
    const { context, signature } = signRequestV2({ secret, method, path, companyId, body, payload });
    return { [VISITOR_CONTEXT_HEADER]: context, [VISITOR_SIGNATURE_HEADER]: signature };
  };
}
