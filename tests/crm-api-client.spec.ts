import { test, expect } from "@playwright/test";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { startStubCrm, STUB_ALLOWED_FIELDS, type StubCrm } from "./support/stub-crm";
import { MIN_SECRET_LENGTH, parseCrmBaseUrl, resolveCrmApiConfig } from "../src/lib/crm-api/config";
import { buildFlightInquiryBody } from "../src/lib/crm-api/flight-inquiry";
import { buildVisitorContextHeaders, VISITOR_CONTEXT_HEADER, VISITOR_SIGNATURE_HEADER } from "../src/lib/crm-api/visitor-context";
import { postContactInquiry, postFlightInquiry, postNewsletterSubscription } from "../src/lib/crm-api/client";
import { flightRequestSchema, type FlightRequestInput } from "../src/lib/validations/flight-request";

// The website's CRM client against a LOCAL stand-in for the CRM that enforces the CRM's published contract (tests/support/stub-crm.ts).
// Everything runs on loopback; nothing can reach a real CRM or database. Sentinel values stand in for secrets and customer data and must
// never appear in an outcome, a message or a log line.
const KEY = "sentinel-api-key-" + "0123456789abcdef".repeat(3);
const INGEST = "sentinel-ingest-" + "fedcba9876543210".repeat(3);
const COMPANY = "test-company";
const root = path.resolve(__dirname, "..");

const futureDate = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const JFK = { iata: "JFK", city: "New York", country: "United States", name: "John F. Kennedy International Airport" };
const CDG = { iata: "CDG", city: "Paris", country: "France", name: "Paris Charles de Gaulle Airport" };
const LHR = { iata: "LHR", city: "London", country: "United Kingdom", name: "Heathrow" };
const SIN = { iata: "SIN", city: "Singapore", country: "Singapore", name: "Changi" };

function request(overrides: Partial<FlightRequestInput> = {}): FlightRequestInput {
  return flightRequestSchema.parse({
    tripType: "ROUND_TRIP",
    segments: [{ from: JFK, to: CDG, departureDate: futureDate(30) }],
    returnDate: futureDate(40),
    cabinClass: "BUSINESS",
    adults: 2,
    children: 1,
    infants: 0,
    flexibleDates: true,
    firstName: "Zelda",
    lastName: "Quillfeather",
    email: "zelda.q@example.org",
    phone: "+14155552671",
    website: "",
    renderedAt: Date.now() - 10_000,
    submissionId: "7b1d2f64-0c9e-4a3b-8d55-1f0a9c3e2b10",
    ...overrides,
  });
}

// ---------------------------------------------------------------------------------------------------------------------------------------
test.describe("configuration (src/lib/crm-api/config.ts)", () => {
  test("CRM_API_URL: an origin only; everything else is refused with a reason that never repeats the value", () => {
    expect(parseCrmBaseUrl("http://compass-crm:3000")).toEqual({ ok: true, origin: "http://compass-crm:3000" });
    expect(parseCrmBaseUrl("https://crm.internal:8443/")).toEqual({ ok: true, origin: "https://crm.internal:8443" });
    for (const bad of ["", undefined, "   ", "not a url", "ftp://crm", "http://user:pw-sentinel@crm:3000", "http://crm:3000/api", "http://crm:3000/?a=1", "http://crm:3000/#x"]) {
      const r = parseCrmBaseUrl(bad as string | undefined);
      expect(r.ok, String(bad)).toBe(false);
      expect(JSON.stringify(r)).not.toContain("pw-sentinel");
    }
  });

  test("a flight request needs CRM_API_URL and a CRM_API_KEY of at least 32 characters; problems name variables, never values", () => {
    expect(resolveCrmApiConfig({}, "flight-inquiry")).toEqual({ ok: false, problems: ["CRM_API_URL is not set", "CRM_API_KEY is not set"] });
    const short = resolveCrmApiConfig({ CRM_API_URL: "http://crm:3000", CRM_API_KEY: "short-secret-sentinel" }, "flight-inquiry");
    expect(short).toEqual({ ok: false, problems: [`CRM_API_KEY must be at least ${MIN_SECRET_LENGTH} characters`] });
    expect(JSON.stringify(short)).not.toContain("short-secret-sentinel");
    const ok = resolveCrmApiConfig({ CRM_API_URL: "http://crm:3000/", CRM_API_KEY: KEY }, "flight-inquiry");
    expect(ok).toMatchObject({ ok: true, config: { baseUrl: "http://crm:3000", apiKey: KEY }, warnings: [] });
  });

  test("the contact form and the newsletter need CRM_COMPANY_ID, not the API key", () => {
    expect(resolveCrmApiConfig({ CRM_API_URL: "http://crm:3000" }, "public-inquiry")).toEqual({ ok: false, problems: ["CRM_COMPANY_ID is not set"] });
    const ok = resolveCrmApiConfig({ CRM_API_URL: "http://crm:3000", CRM_COMPANY_ID: " cabc " }, "public-inquiry");
    expect(ok).toMatchObject({ ok: true, config: { companyId: "cabc" } });
    expect(ok.ok && ok.config.apiKey).toBeUndefined(); // the key is never even loaded for the unauthenticated endpoints
  });

  test("LEAD_INGEST_SECRET is optional; a too-short one is ignored with a warning (the lead is still sent, without the visitor's IP)", () => {
    const base = { CRM_API_URL: "http://crm:3000", CRM_API_KEY: KEY };
    const without = resolveCrmApiConfig(base, "flight-inquiry");
    expect(without.ok && without.config.ingestSecret).toBeUndefined();
    const short = resolveCrmApiConfig({ ...base, LEAD_INGEST_SECRET: "tiny-secret-sentinel" }, "flight-inquiry");
    expect(short.ok && short.config.ingestSecret).toBeUndefined();
    expect(short.ok && short.warnings).toHaveLength(1);
    expect(JSON.stringify(short)).not.toContain("tiny-secret-sentinel");
    const good = resolveCrmApiConfig({ ...base, LEAD_INGEST_SECRET: INGEST }, "flight-inquiry");
    expect(good.ok && good.config.ingestSecret).toBe(INGEST);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------
test.describe("request body (src/lib/crm-api/flight-inquiry.ts)", () => {
  test("a round trip maps onto the CRM's field names, and only onto them", () => {
    const body = buildFlightInquiryBody(request({ budget: 3200, budgetCurrency: "EUR", notes: "  Window seats  ", preferredAirline: " Lufthansa " }), "+14155552671");
    expect(body).toEqual({
      firstName: "Zelda",
      lastName: "Quillfeather",
      phone: "+14155552671",
      email: "zelda.q@example.org",
      tripType: "ROUND_TRIP",
      departureAirportIata: "JFK",
      arrivalAirportIata: "CDG",
      departureDate: futureDate(30),
      returnDate: futureDate(40),
      cabinClass: "BUSINESS",
      adults: 2,
      children: 1,
      infants: 0,
      datesFlexible: true,
      preferredAirline: "Lufthansa",
      approximateBudget: 3200,
      budgetCurrency: "EUR",
      additionalNotes: "Window seats",
    });
  });

  test("the CRM is STRICT: every key sent is on its allow-list, and no website-only or CRM-owned field is ever sent", () => {
    const bodies = [
      buildFlightInquiryBody(request(), "+14155552671"),
      buildFlightInquiryBody(request({ tripType: "ONE_WAY", returnDate: undefined }), "+14155552671"),
      buildFlightInquiryBody(
        request({ tripType: "MULTI_CITY", returnDate: undefined, segments: [{ from: JFK, to: LHR, departureDate: futureDate(30) }, { from: LHR, to: SIN, departureDate: futureDate(35) }] }),
        "+14155552671",
      ),
    ];
    for (const body of bodies) {
      for (const key of Object.keys(body)) expect(STUB_ALLOWED_FIELDS as readonly string[], key).toContain(key);
      for (const forbidden of ["companyId", "submissionId", "website", "renderedAt", "source", "status", "priority", "assignedAgentId", "ipAddress", "flexibleDates", "budget", "notes"]) {
        expect(body, forbidden).not.toHaveProperty(forbidden);
      }
    }
  });

  test("one-way: no return date; round trip: the return date; multi-city: every leg, in order, by IATA code", () => {
    const oneWay = buildFlightInquiryBody(request({ tripType: "ONE_WAY", returnDate: undefined }), "+14155552671");
    expect(oneWay.returnDate).toBeUndefined();
    expect(oneWay.segments).toBeUndefined();
    const multi = buildFlightInquiryBody(
      request({ tripType: "MULTI_CITY", returnDate: undefined, segments: [{ from: JFK, to: LHR, departureDate: futureDate(30) }, { from: LHR, to: SIN, departureDate: futureDate(35) }, { from: SIN, to: JFK, departureDate: futureDate(45) }] }),
      "+14155552671",
    );
    expect(multi.tripType).toBe("MULTI_CITY");
    expect(multi.segments).toEqual([
      { departureAirportIata: "JFK", arrivalAirportIata: "LHR", departureDate: futureDate(30) },
      { departureAirportIata: "LHR", arrivalAirportIata: "SIN", departureDate: futureDate(35) },
      { departureAirportIata: "SIN", arrivalAirportIata: "JFK", departureDate: futureDate(45) },
    ]);
    expect(multi.departureAirportIata).toBe("JFK"); // the lead-level route mirrors the first leg
  });

  test("optional values that are empty are omitted; a currency is only sent together with an amount", () => {
    const body = buildFlightInquiryBody(request({ preferredAirline: "", notes: "   ", budget: undefined, budgetCurrency: "AUD" }), "+14155552671");
    for (const key of ["preferredAirline", "additionalNotes", "approximateBudget", "budgetCurrency"]) expect(body, key).not.toHaveProperty(key);
  });

  test("the body is a pure function of the validated input: a retry of the same submission is byte-identical", () => {
    const a = JSON.stringify(buildFlightInquiryBody(request(), "+14155552671"));
    const b = JSON.stringify(buildFlightInquiryBody(request(), "+14155552671"));
    expect(a).toBe(b);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------
test.describe("signed visitor context (src/lib/crm-api/visitor-context.ts)", () => {
  const info = {
    ip: { address: "203.0.113.9", version: "v4" as const },
    location: { city: "São Paulo", region: "São Paulo", regionCode: "SP", country: "Brazil", countryCode: "BR", timeZone: "America/Sao_Paulo" },
    locationSource: "Cloudflare edge geolocation (approximate)",
    capturedAt: new Date(),
  };

  test("the two headers carry base64url(JSON) and hex(HMAC-SHA256(secret, header value)), verifiable with independent code", () => {
    const now = Date.UTC(2026, 9, 18, 12, 0, 0);
    const h = buildVisitorContextHeaders(info, INGEST, now);
    const context = h[VISITOR_CONTEXT_HEADER];
    const signature = h[VISITOR_SIGNATURE_HEADER];
    expect(signature).toBe(createHmac("sha256", INGEST).update(context).digest("hex"));
    expect(JSON.parse(Buffer.from(context, "base64url").toString("utf8"))).toEqual({
      v: 1,
      ts: Math.floor(now / 1000),
      ip: "203.0.113.9",
      city: "S%C3%A3o%20Paulo", // percent-encoded, as Vercel's header would carry it; the CRM decodes it
      region: "SP",
      country: "BR",
      timezone: "America/Sao_Paulo",
    });
    expect(Object.values(h).join("")).not.toContain(INGEST);
  });

  test("nothing is sent without a secret, without information, or with an empty observation", () => {
    expect(buildVisitorContextHeaders(info, undefined)).toEqual({});
    expect(buildVisitorContextHeaders(undefined, INGEST)).toEqual({});
    expect(buildVisitorContextHeaders({ capturedAt: new Date() }, INGEST)).toEqual({});
  });

  test("an IP alone, or a location alone, is enough", () => {
    expect(Object.keys(buildVisitorContextHeaders({ ip: info.ip, capturedAt: new Date() }, INGEST))).toHaveLength(2);
    expect(Object.keys(buildVisitorContextHeaders({ location: { countryCode: "AU" }, capturedAt: new Date() }, INGEST))).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------
test.describe("POST /api/v1/website/flight-inquiries against the stand-in CRM", () => {
  let crm: StubCrm;
  test.beforeAll(async () => {
    crm = await startStubCrm({ apiKey: KEY, companyId: COMPANY, ingestSecret: INGEST });
  });
  test.afterAll(async () => {
    await crm.close();
  });
  test.beforeEach(() => crm.reset());

  const config = () => ({ baseUrl: crm.url, apiKey: KEY, companyId: COMPANY });
  const KEY1 = "7b1d2f64-0c9e-4a3b-8d55-1f0a9c3e2b10";
  const send = (over: { key?: string; body?: unknown; apiKey?: string; sleeps?: number[]; timeoutMs?: number; maxAttempts?: number; visitorHeaders?: Record<string, string> } = {}) =>
    postFlightInquiry({
      config: { ...config(), apiKey: over.apiKey ?? KEY },
      body: over.body ?? buildFlightInquiryBody(request(), "+14155552671"),
      idempotencyKey: over.key ?? KEY1,
      visitorHeaders: over.visitorHeaders,
      timeoutMs: over.timeoutMs ?? 2_000,
      maxAttempts: over.maxAttempts,
      sleep: async (ms) => void over.sleeps?.push(ms),
    });

  test("a valid request is created (201): Bearer key, Idempotency-Key and JSON go out, and the lead id is the CRM's", async () => {
    const outcome = await send();
    expect(outcome).toMatchObject({ status: "created", attempts: 1 });
    expect(outcome.status === "created" && outcome.leadId).toMatch(/^c[0-9a-f]{24}$/);
    expect(crm.requests).toHaveLength(1);
    const r = crm.requests[0];
    expect(r.method).toBe("POST");
    expect(r.path).toBe("/api/v1/website/flight-inquiries");
    expect(r.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(r.headers["idempotency-key"]).toBe(KEY1);
    expect(r.headers["content-type"]).toBe("application/json");
    expect(r.json).toMatchObject({ firstName: "Zelda", tripType: "ROUND_TRIP", departureAirportIata: "JFK", arrivalAirportIata: "CDG", datesFlexible: true });
    expect(r.status).toBe(201);
  });

  test("the same submission again is a duplicate (200) and still ONE lead; the lead id does not change", async () => {
    const first = await send();
    const second = await send();
    expect(first.status).toBe("created");
    expect(second).toMatchObject({ status: "duplicate" });
    expect(second.status === "duplicate" && first.status === "created" && second.leadId === first.leadId).toBe(true);
    expect(crm.leadCount()).toBe(1);
  });

  test("a different request under the same key is refused (409) and not retried", async () => {
    await send();
    const outcome = await send({ body: buildFlightInquiryBody(request({ adults: 3 }), "+14155552671") });
    expect(outcome).toMatchObject({ status: "rejected", httpStatus: 409, code: "idempotency_key_reused", attempts: 1 });
    expect(crm.requests).toHaveLength(2);
  });

  test("a wrong or missing key (401) is a configuration problem: reported once, never retried", async () => {
    const sleeps: number[] = [];
    const outcome = await send({ apiKey: "wrong-" + KEY, sleeps });
    expect(outcome).toEqual({ status: "misconfigured", httpStatus: 401, attempts: 1 });
    expect(crm.requests).toHaveLength(1);
    expect(sleeps).toEqual([]);
    expect(JSON.stringify(outcome)).not.toContain(KEY);
  });

  test("404 (the route is not served here, e.g. the public hostname) is also a configuration problem, not retried", async () => {
    crm.script({ status: 404, body: { ok: false, error: { code: "not_found", message: "Not found." } } });
    expect(await send()).toEqual({ status: "misconfigured", httpStatus: 404, attempts: 1 });
    expect(crm.requests).toHaveLength(1);
  });

  test("a validation failure (400) reports the failing field PATHS only and is not retried", async () => {
    const outcome = await send({ body: { ...buildFlightInquiryBody(request(), "+14155552671"), phone: "12" } });
    expect(outcome).toMatchObject({ status: "rejected", httpStatus: 400, code: "validation_failed", fieldPaths: ["phone"], attempts: 1 });
    expect(crm.requests).toHaveLength(1);
    expect(JSON.stringify(outcome)).not.toContain("Zelda");
  });

  test("413 / 415 / an unknown 4xx are refusals too, never retried; an unreadable error body is 'unrecognised'", async () => {
    for (const status of [413, 415, 418]) {
      crm.reset();
      crm.script({ status, body: "<html>proxy</html>" });
      expect(await send()).toMatchObject({ status: "rejected", httpStatus: status, code: "unrecognised", fieldPaths: [], attempts: 1 });
      expect(crm.requests).toHaveLength(1);
    }
  });

  test("a server error is retried with the SAME key and the SAME bytes, with backoff, and then succeeds", async () => {
    const sleeps: number[] = [];
    crm.script({ status: 500, body: { ok: false, error: { code: "internal_error", message: "x" } } });
    const outcome = await send({ sleeps });
    expect(outcome).toMatchObject({ status: "created", attempts: 2 });
    expect(crm.requests).toHaveLength(2);
    expect(crm.requests[1].headers["idempotency-key"]).toBe(crm.requests[0].headers["idempotency-key"]);
    expect(crm.requests[1].bodyText).toBe(crm.requests[0].bodyText);
    expect(sleeps).toEqual([1_000]);
    expect(crm.leadCount()).toBe(1);
  });

  test("the CRM stores the lead but the reply is lost: the retry carries the same key and is answered as a duplicate - still ONE lead", async () => {
    crm.script("drop-after-store");
    const outcome = await send();
    expect(outcome).toMatchObject({ status: "duplicate", attempts: 2 });
    expect(crm.requests).toHaveLength(2);
    expect(crm.requests[0].status).toBe(201); // attempt 1 really was processed by the CRM
    expect(crm.requests[1].status).toBe(200);
    expect(crm.requests[1].bodyText).toBe(crm.requests[0].bodyText);
    expect(crm.leadCount()).toBe(1);
  });

  test("429 honours Retry-After (capped), then succeeds; a 503 is retried too", async () => {
    const sleeps: number[] = [];
    crm.script({ status: 429, headers: { "Retry-After": "2" }, body: { ok: false, error: { code: "rate_limited", message: "x" } } });
    crm.script({ status: 503, body: { ok: false, error: { code: "not_configured", message: "x" } } });
    const outcome = await send({ sleeps });
    expect(outcome).toMatchObject({ status: "created", attempts: 3 });
    expect(sleeps).toEqual([2_000, 2_000]);
    crm.reset();
    crm.script({ status: 429, headers: { "Retry-After": "600" }, body: {} });
    const capped: number[] = [];
    await send({ sleeps: capped });
    expect(capped).toEqual([5_000]); // never hold the visitor for the CRM's full delay
  });

  test("every attempt failing ends as 'unavailable' after exactly maxAttempts, with the backoff between them and no more", async () => {
    const sleeps: number[] = [];
    crm.script({ status: 503, body: { ok: false, error: { code: "not_configured", message: "x" } } }, { count: 10 });
    const outcome = await send({ sleeps });
    expect(outcome).toEqual({ status: "unavailable", reason: "server_error", httpStatus: 503, attempts: 3 });
    expect(crm.requests).toHaveLength(3);
    expect(sleeps).toEqual([1_000, 2_000]);
    expect(crm.leadCount()).toBe(0);
  });

  test("a request that never gets an answer times out (per attempt), is retried with the same key, and ends as 'unavailable: timeout'", async () => {
    crm.script("hang", { count: 3 });
    const started = Date.now();
    const outcome = await send({ timeoutMs: 150 });
    expect(outcome).toEqual({ status: "unavailable", reason: "timeout", httpStatus: undefined, attempts: 3 });
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(new Set(crm.requests.map((r) => r.headers["idempotency-key"])).size).toBe(1);
  });

  test("a dropped connection is a network error and is retried; a closed port ends as 'unavailable: network'", async () => {
    crm.script("reset", { count: 1 });
    expect(await send()).toMatchObject({ status: "created", attempts: 2 });
    const dead = await startStubCrm({ apiKey: KEY });
    const url = dead.url;
    await dead.close();
    const outcome = await postFlightInquiry({ config: { baseUrl: url, apiKey: KEY }, body: {}, idempotencyKey: KEY1, timeoutMs: 500, sleep: async () => undefined });
    expect(outcome).toEqual({ status: "unavailable", reason: "network", httpStatus: undefined, attempts: 3 });
  });

  test("an unreadable 200 (no leadId) is not trusted: it is retried with the same key, and ends as 'bad_response' if it stays unreadable", async () => {
    crm.script({ status: 200, body: { ok: true } });
    expect(await send()).toMatchObject({ status: "created", attempts: 2 });
    crm.reset();
    crm.script({ status: 201, body: "<html>not json</html>" }, { count: 5 });
    expect(await send()).toMatchObject({ status: "unavailable", reason: "bad_response", attempts: 3 });
  });

  test("a redirect is never followed: the Authorization header cannot be replayed somewhere else", async () => {
    const elsewhere = await startStubCrm({ apiKey: KEY });
    try {
      crm.script({ status: 302, headers: { Location: `${elsewhere.url}/steal` } }, { count: 3 });
      const outcome = await send();
      expect(outcome).toMatchObject({ status: "unavailable" });
      expect(elsewhere.requests).toHaveLength(0);
    } finally {
      await elsewhere.close();
    }
  });

  test("the visitor context headers are passed through unchanged and the CRM verifies them; a wrong secret is simply not believed", async () => {
    const info = { ip: { address: "198.51.100.77", version: "v4" as const }, location: { city: "Sydney", regionCode: "NSW", countryCode: "AU", timeZone: "Australia/Sydney" }, capturedAt: new Date() };
    await send({ visitorHeaders: buildVisitorContextHeaders(info, INGEST) });
    expect(crm.requests[0].visitor).toMatchObject({ state: "verified", ip: "198.51.100.77", city: "Sydney", region: "NSW", country: "AU", timezone: "Australia/Sydney" });
    crm.reset();
    await send({ visitorHeaders: buildVisitorContextHeaders(info, "x".repeat(40)) });
    expect(crm.requests[0].visitor).toEqual({ state: "invalid" });
    crm.reset();
    await send();
    expect(crm.requests[0].visitor).toEqual({ state: "absent" });
  });

  test("no outcome ever contains the key, a customer value or the CRM's message text", async () => {
    const outcomes = [
      await send(),
      await send({ apiKey: "wrong-" + KEY }),
      await send({ body: { phone: "12" } }),
    ];
    crm.script({ status: 500, body: { ok: false, error: { code: "internal_error", message: "database exploded at 10.0.0.5" } } }, { count: 5 });
    outcomes.push(await send({ key: "another-key-1234" }));
    const text = JSON.stringify(outcomes);
    for (const needle of [KEY, INGEST, "Zelda", "zelda.q@example.org", "+14155552671", "10.0.0.5", "database exploded"]) expect(text, needle).not.toContain(needle);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------
test.describe("the CRM's public endpoints (contact inquiry, newsletter): ONE attempt, no credential", () => {
  let crm: StubCrm;
  test.beforeAll(async () => {
    crm = await startStubCrm({ apiKey: KEY, companyId: COMPANY });
  });
  test.afterAll(async () => {
    await crm.close();
  });
  test.beforeEach(() => crm.reset());

  const config = () => ({ baseUrl: crm.url, companyId: COMPANY });
  const contact = { firstName: "Zelda", lastName: "Quillfeather", email: "zelda.q@example.org", phone: "+14155552671", subject: "GENERAL_INQUIRY", message: "Hello, I need help with a booking." };

  test("contact inquiry: posted to /api/public/contact-inquiry with the company in the body, and NO Authorization header", async () => {
    expect(await postContactInquiry({ config: config(), body: contact, timeoutMs: 1_000 })).toEqual({ status: "ok" });
    const r = crm.requests[0];
    expect(r.path).toBe("/api/public/contact-inquiry");
    expect(r.headers.authorization).toBeUndefined();
    expect(r.json).toMatchObject({ companyId: COMPANY, ...contact });
  });

  test("newsletter: posted to /api/public/subscribe with company, email and source", async () => {
    expect(await postNewsletterSubscription({ config: config(), email: "news@example.org", source: "website", timeoutMs: 1_000 })).toEqual({ status: "ok" });
    expect(crm.requests[0].path).toBe("/api/public/subscribe");
    expect(crm.requests[0].json).toEqual({ companyId: COMPANY, email: "news@example.org", source: "website" });
    expect(crm.requests[0].headers.authorization).toBeUndefined();
  });

  test("a refusal (400) and a rate limit (429) are reported and NOT retried", async () => {
    crm.script({ status: 400, body: { ok: false, error: "Invalid submission" } });
    expect(await postContactInquiry({ config: config(), body: contact, timeoutMs: 1_000 })).toEqual({ status: "rejected", httpStatus: 400 });
    crm.script({ status: 429, body: { ok: false, error: "Too many" } });
    expect(await postNewsletterSubscription({ config: config(), email: "a@example.org", source: "website", timeoutMs: 1_000 })).toEqual({ status: "rate_limited" });
    expect(crm.requests).toHaveLength(2);
  });

  test("the contact message is NOT idempotent, so a server error or a timeout is attempted exactly once and reported as unavailable", async () => {
    crm.script({ status: 500, body: { ok: false, error: "Could not submit your request." } });
    expect(await postContactInquiry({ config: config(), body: contact, timeoutMs: 1_000 })).toEqual({ status: "unavailable", reason: "server_error", httpStatus: 500 });
    expect(crm.requests).toHaveLength(1);
    crm.reset();
    crm.script("hang");
    expect(await postContactInquiry({ config: config(), body: contact, timeoutMs: 150 })).toEqual({ status: "unavailable", reason: "timeout" });
    expect(crm.requests).toHaveLength(1);
  });

  test("an unreadable success reply is not trusted", async () => {
    crm.script({ status: 200, body: "<html></html>" });
    expect(await postNewsletterSubscription({ config: config(), email: "a@example.org", source: "website", timeoutMs: 1_000 })).toMatchObject({ status: "unavailable", reason: "bad_response" });
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------
test.describe("architecture guards (structural): the website has NO database, and the credentials stay server-side", () => {
  const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel, out);
      else if (/\.(ts|tsx|mjs|js)$/.test(e.name)) out.push(rel);
    }
    return out;
  };
  /** Source with comments removed, so prose that explains what is NOT done does not trip the guards. */
  const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
  const sourceFiles = [...walk("src"), ...walk("scripts")];

  test("no source file or script touches a database: no Prisma, no pg driver, no DATABASE_URL / DIRECT_URL / schema code", () => {
    expect(sourceFiles.length).toBeGreaterThan(50);
    const offenders: string[] = [];
    for (const f of sourceFiles) {
      if (/@prisma|@\/generated\/prisma|from ["']pg["']|require\(["']pg["']\)|DATABASE_URL|DIRECT_URL|DATABASE_SSL|DATABASE_AUTO_INIT|\bPrismaClient\b|schema-guard|\$queryRaw/.test(code(f))) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });

  test("the database packages, the Prisma schema/migrations and the schema scripts are gone", () => {
    const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string>; devDependencies: Record<string, string>; scripts: Record<string, string> };
    const names = [...Object.keys(pkg.dependencies), ...Object.keys(pkg.devDependencies)];
    for (const banned of ["prisma", "@prisma/client", "@prisma/adapter-pg", "pg", "@electric-sql/pglite", "pglite-prisma-adapter"]) expect(names, banned).not.toContain(banned);
    expect(Object.keys(pkg.scripts)).not.toEqual(expect.arrayContaining(["postinstall"]));
    expect(JSON.stringify(pkg.scripts)).not.toMatch(/prisma|migration|schema|vercel-build/);
    for (const gone of ["prisma", "prisma.config.ts", "deploy/sql", "scripts/vercel-build.mjs", "src/lib/prisma.ts", "src/lib/schema-guard.ts", "src/server/crm-company.ts", "src/server/contact.ts"]) {
      expect(fs.existsSync(path.join(root, gone)), gone).toBe(false);
    }
  });

  test("compose.yaml, the Dockerfile and the env examples configure no database", () => {
    for (const f of ["compose.yaml", "Dockerfile", ".env.example", ".env.vps.example"]) {
      const lines = read(f).split(/\r?\n/).filter((l) => !/^\s*#/.test(l));
      expect(lines.join("\n"), f).not.toMatch(/DATABASE_|DIRECT_URL|prisma|postgres/i);
    }
  });

  test("the CRM credentials are read in exactly one module, which is server-only; no client code can import the client", () => {
    // (A log line that NAMES a variable for the operator is fine; what matters is who READS one.)
    const envReaders = sourceFiles.filter((f) => /\benv\.(CRM_API_KEY|LEAD_INGEST_SECRET|CRM_COMPANY_ID|CRM_API_URL)\b|env\[["'](CRM_|LEAD_INGEST)/.test(code(f)));
    expect(envReaders.sort()).toEqual(["src/lib/crm-api/config.ts"]); // a pure parser: it receives the environment as an argument
    expect(sourceFiles.filter((f) => /process\.env\.(CRM_|LEAD_INGEST)/.test(code(f)))).toEqual([]);
    expect(read("src/server/crm-api.ts")).toMatch(/^import "server-only";/m);
    expect(read("src/server/crm-api.ts")).toContain("process.env");
    const clientFiles = sourceFiles.filter((f) => /^\s*["']use client["'];?/m.test(read(f)));
    expect(clientFiles.length).toBeGreaterThan(10);
    // (A client component may import a Server Action - that is a reference, not the code. It must never import the CRM client or its settings.)
    for (const f of clientFiles) expect(read(f), f).not.toMatch(/crm-api|NEXT_PUBLIC_CRM/);
    expect(read(".env.example") + read(".env.vps.example") + read("compose.yaml")).not.toMatch(/NEXT_PUBLIC_(CRM|LEAD)/);
  });

  test("the three actions call the CRM and nothing else: no fetch of their own, no environment access, no fallback write", () => {
    for (const f of ["submit-flight-request", "submit-contact-message", "subscribe-newsletter"]) {
      const src = code(`src/server/actions/${f}.ts`);
      expect(src, f).toContain("crmApiConfig(");
      expect(src, f).not.toMatch(/\bfetch\(|process\.env|XMLHttpRequest|axios/);
      expect(src, f).not.toMatch(/fallback|prisma|\bpg\b/i);
    }
    // A missing or malformed configuration is a friendly error, never an exception and never a different write path.
    const flight = code("src/server/actions/submit-flight-request.ts");
    expect(flight).toMatch(/const api = crmApiConfig\("flight-inquiry", "flight request"\);\s*if \(!api\.ok\) return friendlyError\(\);/);
    expect(flight.indexOf("crmApiConfig(")).toBeLessThan(flight.indexOf("postFlightInquiry("));
  });

  test("the client never logs the key, the body or the CRM's message text", () => {
    const src = code("src/lib/crm-api/client.ts") + code("src/server/crm-api.ts");
    expect(src).not.toMatch(/console\.(log|info|warn|error)\([^)]*(apiKey|Authorization|body|payload|json|idempotencyKey)/);
    // the only place a CRM-supplied string is read is `error.code` and `fields[].path`
    expect(read("src/lib/crm-api/client.ts")).not.toMatch(/error\.message|\.message\)/);
  });
});
