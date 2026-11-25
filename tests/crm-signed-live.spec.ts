import { test, expect } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { signRequestV2, VISITOR_CONTEXT_HEADER, VISITOR_SIGNATURE_HEADER, type SignedContextPayload } from "../src/lib/crm-api/visitor-context";

// OPT-IN: the website's request signing (signing v2) against a REAL, NON-PRODUCTION Compass Tools CRM that has a LEAD_INGEST_SECRET. Skipped unless all of these are set:
//
//   CRM_CONTRACT_URL=http://127.0.0.1:3301      the CRM origin (loopback, or a staging host with CRM_CONTRACT_ALLOW_REMOTE=staging)
//   CRM_CONTRACT_KEY=<WEBSITE_API_KEY of that CRM>
//   CRM_CONTRACT_SECRET=<LEAD_INGEST_SECRET of that CRM>
//   CRM_CONTRACT_COMPANY_ID=<WEBSITE_API_COMPANY_ID of that CRM>
//
// It CREATES a few leads (names "SIGNED-CHECK", @example.test addresses, documentation IP addresses). It never prints a key, a secret, a signature or a body.
// It covers what the stand-in CRM cannot prove: that the REAL verifier accepts what this website signs, and refuses a replay, a tampered body, a stale or future
// timestamp, a wrong secret and a missing signature; and that the per-visitor limit (keyed on the signed IP) really answers 429 from the shared database limiter.
const url = process.env.CRM_CONTRACT_URL?.trim().replace(/\/+$/, "");
const key = process.env.CRM_CONTRACT_KEY?.trim();
const secret = process.env.CRM_CONTRACT_SECRET?.trim();
const companyId = process.env.CRM_CONTRACT_COMPANY_ID?.trim();
const configured = !!url && !!key && !!secret && !!companyId;
const PATH = "/api/v1/website/flight-inquiries";
const fixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, "support", "fixtures", "website-flight-inquiry-contract.json"), "utf8")) as { accepted: Array<{ name: string; body: Record<string, unknown> }> };
const base = fixture.accepted.find((c) => c.name === "round trip, plus or minus 2 days, every preference")!.body;

let counter = 0;
function bodyText(overrides: Record<string, unknown> = {}) {
  counter += 1;
  return JSON.stringify({ ...base, firstName: "Signed", lastName: `SIGNED-CHECK-${Date.now()}-${counter}`, email: `signed-check-${Date.now()}-${counter}@example.test`, ...overrides });
}
function sign(text: string, over: { ts?: number; nonce?: string; ip?: string; secret?: string; company?: string } = {}) {
  const payload: SignedContextPayload = { v: 2, ts: over.ts ?? Math.floor(Date.now() / 1000), nonce: over.nonce ?? randomBytes(16).toString("base64url"), ip: over.ip ?? "203.0.113.10" };
  return signRequestV2({ secret: over.secret ?? secret!, method: "POST", path: PATH, companyId: over.company ?? companyId!, body: text, payload });
}
async function post(text: string, headers: Record<string, string>, idempotencyKey = randomUUID()) {
  const res = await fetch(`${url}${PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "Idempotency-Key": idempotencyKey, ...headers },
    body: text,
    redirect: "error",
  });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: { code?: string }; leadId?: string; duplicate?: boolean };
  return { status: res.status, code: json.error?.code, leadId: json.leadId, duplicate: json.duplicate, retryAfter: res.headers.get("retry-after") };
}
const headersOf = (s: { context: string; signature: string }) => ({ [VISITOR_CONTEXT_HEADER]: s.context, [VISITOR_SIGNATURE_HEADER]: s.signature });

test.describe.configure({ mode: "serial" });
test.describe("signing v2 against a real CRM (opt-in)", () => {
  test.skip(!configured, "set CRM_CONTRACT_URL, CRM_CONTRACT_KEY, CRM_CONTRACT_SECRET and CRM_CONTRACT_COMPANY_ID to run this against a non-production CRM");

  test("refuses a non-loopback target unless it is confirmed as a non-production CRM", () => {
    const host = new URL(url!).hostname;
    expect(["127.0.0.1", "localhost", "::1", "[::1]"].includes(host) || process.env.CRM_CONTRACT_ALLOW_REMOTE === "staging", "a non-loopback CRM needs CRM_CONTRACT_ALLOW_REMOTE=staging").toBe(true);
    expect(key!.length).toBeGreaterThanOrEqual(32);
    expect(secret!.length).toBeGreaterThanOrEqual(32);
  });

  test("a correctly signed request is accepted, and a retry of the same submission (fresh signature, same Idempotency-Key) is a duplicate of the same lead", async () => {
    const text = bodyText();
    const id = randomUUID();
    const first = await post(text, headersOf(sign(text)), id);
    expect(first.status, `status ${first.status} ${first.code ?? ""}`).toBe(201);
    expect(first.leadId).toBeTruthy();
    const retry = await post(text, headersOf(sign(text)), id);
    expect(retry.status).toBe(200);
    expect(retry.duplicate).toBe(true);
    expect(retry.leadId).toBe(first.leadId);
  });

  test("a captured request cannot be replayed: the same signature and nonce a second time is refused", async () => {
    const text = bodyText();
    const signed = headersOf(sign(text));
    expect((await post(text, signed)).status).toBe(201);
    const replay = await post(text, signed, randomUUID()); // even with a brand-new Idempotency-Key
    expect(replay.status).toBe(401);
    expect(replay.code).toBe("invalid_signature");
  });

  test("a body changed after signing is refused", async () => {
    const text = bodyText();
    const signed = headersOf(sign(text));
    const tampered = text.replace('"adults":2', '"adults":9');
    expect(tampered).not.toBe(text);
    const res = await post(tampered, signed);
    expect(res.status).toBe(401);
    expect(res.code).toBe("invalid_signature");
  });

  test("a signature for another company, or made with another secret, is refused", async () => {
    const text = bodyText();
    expect((await post(text, headersOf(sign(text, { company: "someone-else" })))).status).toBe(401);
    expect((await post(text, headersOf(sign(text, { secret: "x".repeat(40) })))).status).toBe(401);
  });

  test("a stale timestamp (10 minutes old) and a far-future timestamp (10 minutes ahead) are refused, a fresh one is accepted", async () => {
    const now = Math.floor(Date.now() / 1000);
    const stale = bodyText();
    expect((await post(stale, headersOf(sign(stale, { ts: now - 600 })))).status).toBe(401);
    const future = bodyText();
    expect((await post(future, headersOf(sign(future, { ts: now + 600 })))).status).toBe(401);
    const fresh = bodyText();
    expect((await post(fresh, headersOf(sign(fresh, { ts: now })))).status).toBe(201);
  });

  test("a request with no signature at all is refused (there is no unsigned fallback while the CRM has a secret)", async () => {
    const res = await post(bodyText(), {});
    expect(res.status).toBe(401);
    expect(res.code).toBe("invalid_signature");
  });

  test("the per-visitor limit comes from the CRM's shared database limiter, keyed on the SIGNED visitor IP: the 21st request from one address is 429, another address is unaffected", async () => {
    test.setTimeout(120_000);
    const crowded = "198.51.100.77";
    let limitedAt = 0;
    for (let i = 1; i <= 25; i++) {
      const text = bodyText();
      const res = await post(text, headersOf(sign(text, { ip: crowded })));
      if (res.status === 429) {
        limitedAt = i;
        expect(res.retryAfter, "a Retry-After is sent").toBeTruthy();
        break;
      }
      expect(res.status, `request ${i}`).toBe(201);
    }
    expect(limitedAt, "the limit is 20 per visitor per 15 minutes").toBe(21);
    const other = bodyText();
    expect((await post(other, headersOf(sign(other, { ip: "198.51.100.78" })))).status).toBe(201);
  });
});
