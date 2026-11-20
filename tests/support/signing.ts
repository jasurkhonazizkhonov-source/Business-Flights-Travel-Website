import { createRequestSigner, VISITOR_CONTEXT_HEADER, VISITOR_SIGNATURE_HEADER, type RequestToSign } from "../../src/lib/crm-api/visitor-context";
import type { SubmissionInfo } from "../../src/lib/submission-info";

// Test helpers around the website's REAL signer (src/lib/crm-api/visitor-context.ts, signing v2). Nothing here re-implements the protocol except the
// independent known-answer calculation in tests/contact-visitor-context.spec.ts.

/** A fixed request to sign when a test only cares about what the signed context CARRIES (the visitor facts), not what it is bound to. */
export const SAMPLE_REQUEST: RequestToSign = { method: "POST", path: "/api/public/contact-inquiry", companyId: "test-company", body: "{}" };

/** The two headers for SAMPLE_REQUEST, or {} when no secret is configured (nothing can be signed). */
export function signedHeaders(info: SubmissionInfo | undefined, secret: string | undefined, nowMs?: number, request: RequestToSign = SAMPLE_REQUEST): Record<string, string> {
  const sign = createRequestSigner(info, secret, nowMs === undefined ? undefined : () => nowMs);
  return sign ? sign(request) : {};
}

/** The JSON payload of a context header (the part the CRM reads the visitor facts from). */
export function decodeContext(headers: Record<string, string>): Record<string, unknown> {
  return JSON.parse(Buffer.from(headers[VISITOR_CONTEXT_HEADER], "base64url").toString("utf8")) as Record<string, unknown>;
}

export { VISITOR_CONTEXT_HEADER, VISITOR_SIGNATURE_HEADER };
