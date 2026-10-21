import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { parseCrmBaseUrl } from "../src/lib/crm-api/config";
import { buildFlightInquiryBody } from "../src/lib/crm-api/flight-inquiry";
import { postFlightInquiry } from "../src/lib/crm-api/client";
import { flightRequestSchema, type FlightRequestInput } from "../src/lib/validations/flight-request";
import { normalizePhoneNumber } from "../src/lib/phone";

// OPT-IN contract check of the website's CRM client against a REAL Compass Tools CRM (a staging stack, or a local run of the CRM's
// pull-request build). Skipped unless both variables are set - the normal suite never reaches a real CRM:
//
//   CRM_CONTRACT_URL=http://127.0.0.1:3411     the CRM's origin
//   CRM_CONTRACT_KEY=<that CRM's WEBSITE_API_KEY>      never a production key
//   CRM_CONTRACT_ALLOW_REMOTE=staging          only for a non-loopback CRM that is NOT production
//
// It CREATES leads in that CRM (fictional names marked CONTRACT-CHECK, @example.test addresses). It never prints the key or a request body,
// and it refuses a non-loopback target unless that is confirmed. See docs/CRM_API_INTEGRATION.md, "Staging validation".
const url = process.env.CRM_CONTRACT_URL?.trim();
const key = process.env.CRM_CONTRACT_KEY?.trim();
const configured = !!url && !!key;

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
const futureDate = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const airport = (iata: string, city: string) => ({ iata, city, name: `${city} Airport`, country: "Testland" });

let counter = 0;
function input(overrides: Partial<FlightRequestInput> = {}): FlightRequestInput {
  counter += 1;
  return flightRequestSchema.parse({
    tripType: "ONE_WAY",
    segments: [{ from: airport("JFK", "New York"), to: airport("LHR", "London"), departureDate: futureDate(30) }],
    cabinClass: "ECONOMY",
    adults: 2,
    children: 0,
    infants: 0,
    flexibleDates: false,
    firstName: "Contract",
    lastName: `CONTRACT-CHECK-${counter}`,
    email: `contract-check-${Date.now()}-${counter}@example.test`,
    phone: "+14155556001",
    ...overrides,
  });
}
function body(data: FlightRequestInput) {
  const phone = normalizePhoneNumber(data.phone);
  if (!phone) throw new Error("the website's phone normalisation rejected the test number");
  return buildFlightInquiryBody(data, phone.e164);
}

test.describe.configure({ mode: "serial" });

test.describe("the website's CRM client against a real CRM (opt-in)", () => {
  test.skip(!configured, "set CRM_CONTRACT_URL and CRM_CONTRACT_KEY to run this against a non-production CRM");

  const send = (requestBody: unknown, idempotencyKey: string, extra: { apiKey?: string; edgeHeader?: boolean } = {}) => {
    const base = parseCrmBaseUrl(url);
    if (!base.ok) throw new Error(`CRM_CONTRACT_URL is unusable: ${base.reason}`);
    return postFlightInquiry({
      config: { baseUrl: base.origin, apiKey: extra.apiKey ?? key },
      body: requestBody,
      idempotencyKey,
      maxAttempts: 1,
      sleep: async () => undefined,
      ...(extra.edgeHeader
        ? { fetchImpl: (target: string, init: RequestInit) => fetch(target, { ...init, headers: { ...(init.headers as Record<string, string>), "cf-ray": "contract-check" } }) }
        : {}),
    });
  };

  test("refuses a target that is not loopback unless it is confirmed as a non-production CRM", () => {
    const base = parseCrmBaseUrl(url);
    expect(base.ok, "CRM_CONTRACT_URL must be an http(s) origin").toBe(true);
    if (!base.ok) return;
    const host = new URL(base.origin).hostname;
    const confirmed = process.env.CRM_CONTRACT_ALLOW_REMOTE === "staging";
    expect(LOOPBACK.has(host) || confirmed, "a non-loopback CRM needs CRM_CONTRACT_ALLOW_REMOTE=staging (this test creates leads)").toBe(true);
    expect(key!.length, "the key must be at least 32 characters").toBeGreaterThanOrEqual(32);
  });

  test("create, repeat and conflict: one lead per Idempotency-Key", async () => {
    const idempotencyKey = randomUUID();
    const data = input();
    const first = await send(body(data), idempotencyKey);
    expect(first.status, JSON.stringify({ status: first.status })).toBe("created");
    if (first.status !== "created") return;

    const again = await send(body(data), idempotencyKey);
    expect(again.status).toBe("duplicate");
    if (again.status === "duplicate") expect(again.leadId).toBe(first.leadId);

    const changed = await send(body(input({ adults: 3 })), idempotencyKey);
    expect(changed.status).toBe("rejected");
    if (changed.status === "rejected") {
      expect(changed.httpStatus).toBe(409);
      expect(changed.code).toBe("idempotency_key_reused");
    }
  });

  test("a multi-city request (three legs) is accepted", async () => {
    const out = await send(
      body(
        input({
          tripType: "MULTI_CITY",
          segments: [
            { from: airport("JFK", "New York"), to: airport("LHR", "London"), departureDate: futureDate(30) },
            { from: airport("LHR", "London"), to: airport("DXB", "Dubai"), departureDate: futureDate(34) },
            { from: airport("DXB", "Dubai"), to: airport("JFK", "New York"), departureDate: futureDate(41) },
          ],
        }),
      ),
      randomUUID(),
    );
    expect(out.status, out.status === "rejected" ? `${out.httpStatus} ${out.code} ${out.fieldPaths.join(",")}` : out.status).toBe("created");
  });

  test("a wrong key is refused (401) and is not retried or treated as success", async () => {
    const out = await send(body(input()), randomUUID(), { apiKey: "x".repeat(40) });
    expect(out.status).toBe("misconfigured");
    if (out.status === "misconfigured") expect(out.httpStatus).toBe(401);
  });

  test("an unexpected field is rejected (400 validation_failed) with the field path only", async () => {
    const out = await send({ ...body(input()), companyId: "someone-else" }, randomUUID());
    expect(out.status).toBe("rejected");
    if (out.status === "rejected") {
      expect(out.httpStatus).toBe(400);
      expect(out.code).toBe("validation_failed");
      expect(out.fieldPaths.length).toBeGreaterThan(0);
    }
  });

  test("a request that looks like it came through the public Cloudflare edge is refused (404), unless the CRM allows the public route", async () => {
    test.skip(process.env.CRM_CONTRACT_PUBLIC_ROUTE_ALLOWED === "yes", "the CRM under test allows the public route (WEBSITE_API_ALLOW_PUBLIC_ROUTE=true)");
    const out = await send(body(input()), randomUUID(), { edgeHeader: true });
    expect(out.status).toBe("misconfigured");
    if (out.status === "misconfigured") expect(out.httpStatus).toBe(404);
  });
});
