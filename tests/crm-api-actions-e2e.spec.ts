import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { standaloneBuildPresent, startStandalone, type StandaloneServer } from "./support/standalone-server";
import { startStubCrm, type StubCrm } from "./support/stub-crm";

// The three public form actions, called for real over HTTP on the PRODUCTION (standalone) build exactly as the browser calls them (a
// server-action POST), against a LOCAL stand-in CRM that enforces the CRM's published contract (tests/support/stub-crm.ts). Nothing leaves
// loopback: there is no real CRM, no database and no mail server here - the website has no database at all, and the server is started with no
// database setting of any kind.
//
// Needs `NEXT_OUTPUT=standalone npm run build` first; otherwise skipped (never "passed"). Every server is started by this spec and identified
// before anything is sent to it (tests/support/standalone-server.ts).
const KEY = "sentinel-api-key-" + "0123456789abcdef".repeat(3);
const INGEST = "sentinel-ingest-" + "fedcba9876543210".repeat(3);
const COMPANY = "test-company";
const futureDate = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const JFK = { iata: "JFK", city: "New York", country: "United States", name: "John F. Kennedy International Airport" };
const CDG = { iata: "CDG", city: "Paris", country: "France", name: "Paris Charles de Gaulle Airport" };
const LHR = { iata: "LHR", city: "London", country: "United Kingdom", name: "Heathrow" };
const SIN = { iata: "SIN", city: "Singapore", country: "Singapore", name: "Changi" };

const CUSTOMER = { firstName: "Zelda", lastName: "Quillfeather", email: "zelda.q@example.org", phone: "+14155552671" };
const NEEDLES = [KEY, INGEST, CUSTOMER.email, CUSTOMER.lastName, "+14155552671", "14155552671", "secret-passport-note"];

const flightInput = (over: Record<string, unknown> = {}) => ({
  tripType: "ROUND_TRIP",
  segments: [{ from: JFK, to: CDG, departureDate: futureDate(30) }],
  returnDate: futureDate(40),
  cabinClass: "BUSINESS",
  adults: 2,
  children: 1,
  infants: 0,
  flexibleDates: true,
  ...CUSTOMER,
  website: "",
  renderedAt: Date.now() - 10_000,
  submissionId: randomUUID(),
  ...over,
});
const contactInput = (over: Record<string, unknown> = {}) => ({
  ...CUSTOMER,
  subject: "GENERAL_INQUIRY",
  message: "Hello, I need help with an existing booking, secret-passport-note.",
  website: "",
  renderedAt: Date.now() - 10_000,
  ...over,
});

let ipCounter = 10;
/** A distinct "visitor" per call: the website's own per-IP rate limiter must never be what a test measures. */
const visitor = (extra: Record<string, string> = {}) => ({
  "CF-Connecting-IP": `198.51.100.${ipCounter++}`,
  "CF-IPCountry": "AU",
  "CF-IPCity": "Sydney",
  "CF-Region-Code": "NSW",
  "X-Forwarded-For": "8.8.8.8", // forged: must never be believed behind Cloudflare
  ...extra,
});

function actions(server: StandaloneServer) {
  const manifest = JSON.parse(readFileSync(path.join(server.layout, ".next", "server", "server-reference-manifest.json"), "utf8")) as {
    node: Record<string, { exportedName: string }>;
  };
  const ids: Record<string, string> = {};
  for (const [id, v] of Object.entries(manifest.node)) ids[v.exportedName] = id;
  return async (name: "submitFlightRequest" | "submitContactMessage" | "subscribeToNewsletter", args: unknown[], headers: Record<string, string> = visitor()): Promise<string> => {
    expect(ids[name], `server action id for ${name}`).toBeTruthy();
    const res = await fetch(`${server.origin}/`, {
      method: "POST",
      headers: { "Next-Action": ids[name], "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component", ...headers },
      body: JSON.stringify(args),
    });
    expect(res.status, `${name} responded ${res.status}`).toBe(200);
    return res.text();
  };
}
const GENERIC_FLIGHT_ERROR = /We're sorry, something went wrong while submitting your request/;
const GENERIC_CONTACT_ERROR = /We're sorry, something went wrong while sending your message/;
const NEWSLETTER_ERROR = /We're sorry, something went wrong\. Please try again\./;

test.describe.configure({ mode: "serial" });

// ---------------------------------------------------------------------------------------------------------------------------------------
test.describe("the forms against a configured website and a stand-in CRM (production build)", () => {
  test.skip(!standaloneBuildPresent(), "needs a standalone build (NEXT_OUTPUT=standalone npm run build)");
  test.setTimeout(120_000);
  let crm: StubCrm;
  let server: StandaloneServer;
  let call: ReturnType<typeof actions>;

  test.beforeAll(async () => {
    crm = await startStubCrm({ apiKey: KEY, companyId: COMPANY, ingestSecret: INGEST });
    server = await startStandalone({
      label: "crm-api actions e2e",
      port: 3232,
      env: { TRUSTED_PROXY: "cloudflare", CRM_API_URL: crm.url, CRM_API_KEY: KEY, CRM_COMPANY_ID: COMPANY, LEAD_INGEST_SECRET: INGEST },
    });
    call = actions(server);
  });
  test.afterAll(async () => {
    await server?.stop();
    await crm?.close();
  });
  test.beforeEach(() => {
    server.assertAlive();
    crm.reset();
  });

  test("flight request: success - the CRM receives the mapped body with the Bearer key and the submission key as Idempotency-Key", async () => {
    const input = flightInput({ budget: 3200, budgetCurrency: "EUR", notes: "Window seats", preferredAirline: "Lufthansa" });
    const text = await call("submitFlightRequest", [input]);
    expect(text).toMatch(/"ok":true/);
    expect(text).toContain("New York (JFK)");
    expect(text).toContain("Paris (CDG)");
    expect(crm.requests).toHaveLength(1);
    const r = crm.requests[0];
    expect(r.path).toBe("/api/v1/website/flight-inquiries");
    expect(r.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(r.headers["idempotency-key"]).toBe(input.submissionId);
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({
      firstName: "Zelda", lastName: "Quillfeather", phone: "+14155552671", email: "zelda.q@example.org", tripType: "ROUND_TRIP",
      departureAirportIata: "JFK", arrivalAirportIata: "CDG", returnDate: futureDate(40), cabinClass: "BUSINESS", adults: 2, children: 1, infants: 0,
      datesFlexible: true, preferredAirline: "Lufthansa", approximateBudget: 3200, budgetCurrency: "EUR", additionalNotes: "Window seats",
    });
    for (const forbidden of ["website", "renderedAt", "submissionId", "companyId"]) expect(r.json).not.toHaveProperty(forbidden);
    expect(crm.leadCount()).toBe(1);
  });

  test("flight request: the visitor's IP and location reach the CRM ONLY as a signed context built from Cloudflare's headers, never from the forged ones", async () => {
    const headers = visitor({ "CF-Connecting-IP": "203.0.113.55" });
    await call("submitFlightRequest", [flightInput()], headers);
    const r = crm.requests[0];
    expect(r.visitor).toMatchObject({ state: "verified", ip: "203.0.113.55", country: "AU", city: "Sydney", region: "NSW" });
    expect(JSON.stringify(r)).not.toMatch(/8\.8\.8\.8/);
    expect(r.headers["x-forwarded-for"]).toBeUndefined(); // the visitor's own headers are never forwarded
    for (const h of Object.keys(r.headers)) expect(h.startsWith("cf-"), h).toBe(false);
    // With no trusted address at all (only forged headers) the lead still goes through, with no IP in the context.
    crm.reset();
    await call("submitFlightRequest", [flightInput()], { "X-Forwarded-For": "8.8.8.8", "X-Real-IP": "8.8.4.4" });
    expect(crm.requests[0].json).toBeTruthy();
    expect(crm.requests[0].visitor?.ip).toBeUndefined();
  });

  test("flight request: one-way and multi-city are sent as the CRM expects (legs by IATA code, in order)", async () => {
    await call("submitFlightRequest", [flightInput({ tripType: "ONE_WAY", returnDate: undefined })]);
    expect(crm.requests[0].json).toMatchObject({ tripType: "ONE_WAY", departureAirportIata: "JFK", arrivalAirportIata: "CDG" });
    expect(crm.requests[0].json).not.toHaveProperty("returnDate");
    expect(crm.requests[0].json).not.toHaveProperty("segments");
    crm.reset();
    const multi = flightInput({
      tripType: "MULTI_CITY",
      returnDate: undefined,
      segments: [{ from: JFK, to: LHR, departureDate: futureDate(30) }, { from: LHR, to: SIN, departureDate: futureDate(35) }],
    });
    const text = await call("submitFlightRequest", [multi]);
    expect(text).toMatch(/"ok":true/);
    expect(crm.requests[0].json?.segments).toEqual([
      { departureAirportIata: "JFK", arrivalAirportIata: "LHR", departureDate: futureDate(30) },
      { departureAirportIata: "LHR", arrivalAirportIata: "SIN", departureDate: futureDate(35) },
    ]);
  });

  test("flight request: the SAME submission sent twice is accepted both times and is ONE lead (the CRM answers the repeat as a duplicate)", async () => {
    const input = flightInput();
    expect(await call("submitFlightRequest", [input])).toMatch(/"ok":true/);
    expect(await call("submitFlightRequest", [input])).toMatch(/"ok":true/);
    expect(crm.requests.map((r) => r.status)).toEqual([201, 200]);
    expect(new Set(crm.requests.map((r) => r.headers["idempotency-key"])).size).toBe(1);
    expect(crm.requests[1].bodyText).toBe(crm.requests[0].bodyText);
    expect(crm.leadCount()).toBe(1);
  });

  test("flight request: a changed form under the SAME key is refused by the CRM (409); the visitor is told to reload, not shown a false success", async () => {
    const input = flightInput();
    await call("submitFlightRequest", [input]);
    const text = await call("submitFlightRequest", [{ ...input, adults: 3 }]);
    expect(text).toMatch(/"ok":false/);
    expect(text).toContain("We've already received a request from this page");
    expect(crm.requests.map((r) => r.status)).toEqual([201, 409]);
    expect(crm.leadCount()).toBe(1);
  });

  test("flight request: without a submission key (an old cached form) each submission gets its own fresh key", async () => {
    await call("submitFlightRequest", [flightInput({ submissionId: undefined })]);
    await call("submitFlightRequest", [flightInput({ submissionId: undefined })]);
    const keys = crm.requests.map((r) => r.headers["idempotency-key"]);
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
    for (const k of keys) expect(k).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("flight request: validation errors are returned field by field BEFORE the CRM is called", async () => {
    const text = await call("submitFlightRequest", [flightInput({ email: "not-an-email", firstName: "" })]);
    expect(text).toMatch(/"ok":false/);
    expect(text).toContain("Please check the highlighted fields and try again.");
    expect(text).toContain("First name is required");
    expect(crm.requests).toHaveLength(0);
  });

  test("flight request: the honeypot and the too-fast submission are rejected without calling the CRM", async () => {
    // A filled honeypot fails the schema (the field must be empty); a form submitted faster than a human can fill it is the anti-spam timing check.
    expect(await call("submitFlightRequest", [flightInput({ website: "http://spam.example" })])).toMatch(/"ok":false/);
    expect(await call("submitFlightRequest", [flightInput({ renderedAt: Date.now() })])).toMatch(GENERIC_FLIGHT_ERROR);
    expect(crm.requests).toHaveLength(0);
  });

  test("flight request: the CRM refuses the request (400): a generic error for the visitor, one attempt, nothing of the CRM's reply shown", async () => {
    crm.script({ status: 400, body: { ok: false, error: { code: "validation_failed", message: "internal detail do-not-show", fields: [{ path: "phone", message: "bad" }] } } });
    const text = await call("submitFlightRequest", [flightInput()]);
    expect(text).toMatch(/"ok":false/);
    expect(text).toMatch(GENERIC_FLIGHT_ERROR);
    expect(text).not.toMatch(/validation_failed|do-not-show|phone/);
    expect(crm.requests).toHaveLength(1);
  });

  test("flight request: the CRM rejects the website's credential (401): a generic error, one attempt, no retry, and the key is never shown", async () => {
    crm.script({ status: 401, body: { ok: false, error: { code: "unauthorized", message: "Missing or invalid credentials." } } });
    const text = await call("submitFlightRequest", [flightInput()]);
    expect(text).toMatch(GENERIC_FLIGHT_ERROR);
    expect(text).not.toMatch(/401|unauthorized|Bearer/i);
    expect(text).not.toContain(KEY);
    expect(crm.requests).toHaveLength(1);
  });

  test("flight request: a CRM server error is retried with the same key and body, then the visitor succeeds", async () => {
    crm.script({ status: 500, body: { ok: false, error: { code: "internal_error", message: "x" } } });
    const input = flightInput();
    const text = await call("submitFlightRequest", [input]);
    expect(text).toMatch(/"ok":true/);
    expect(crm.requests.map((r) => r.status)).toEqual([500, 201]);
    expect(crm.requests[1].headers["idempotency-key"]).toBe(input.submissionId);
    expect(crm.requests[1].bodyText).toBe(crm.requests[0].bodyText);
    expect(crm.leadCount()).toBe(1);
  });

  test("flight request: the CRM stores the lead but its reply is lost - the visitor still succeeds, and there is still ONE lead", async () => {
    crm.script("drop-after-store");
    const text = await call("submitFlightRequest", [flightInput()]);
    expect(text).toMatch(/"ok":true/);
    expect(crm.requests).toHaveLength(2);
    expect(crm.leadCount()).toBe(1);
  });

  test("contact message: posted to the CRM's public endpoint with the company in the body, the E.164 phone and NO credential; success reaches the visitor", async () => {
    const text = await call("submitContactMessage", [contactInput()]);
    expect(text).toMatch(/"ok":true/);
    expect(crm.requests).toHaveLength(1);
    const r = crm.requests[0];
    expect(r.path).toBe("/api/public/contact-inquiry");
    expect(r.headers.authorization).toBeUndefined();
    expect(r.json).toMatchObject({ companyId: COMPANY, firstName: "Zelda", lastName: "Quillfeather", email: "zelda.q@example.org", phone: "+14155552671", subject: "GENERAL_INQUIRY" });
    for (const forbidden of ["website", "renderedAt"]) expect(r.json).not.toHaveProperty(forbidden);
  });

  test("contact message: validation and spam checks run before the CRM; a CRM refusal or error gives the generic message and is NOT retried", async () => {
    expect(await call("submitContactMessage", [contactInput({ message: "short" })])).toContain("Please add a few more details");
    expect(await call("submitContactMessage", [contactInput({ website: "x" })])).toMatch(/"ok":false/); // honeypot: the field must be empty
    expect(await call("submitContactMessage", [contactInput({ renderedAt: Date.now() })])).toMatch(GENERIC_CONTACT_ERROR); // too fast for a human
    expect(crm.requests).toHaveLength(0);
    crm.script({ status: 500, body: { ok: false, error: "Could not submit your request." } });
    const text = await call("submitContactMessage", [contactInput()]);
    expect(text).toMatch(GENERIC_CONTACT_ERROR);
    expect(crm.requests).toHaveLength(1); // a non-idempotent write: attempted exactly once
    crm.reset();
    crm.script({ status: 400, body: { ok: false, error: "Invalid submission" } });
    expect(await call("submitContactMessage", [contactInput()])).toMatch(GENERIC_CONTACT_ERROR);
    expect(crm.requests).toHaveLength(1);
  });

  test("newsletter: posted to the CRM's public subscribe endpoint (company, email, source) with no credential; the honeypot never reaches the CRM", async () => {
    const text = await call("subscribeToNewsletter", [{ email: "news@example.org", website: "" }]);
    expect(text).toMatch(/"ok":true/);
    expect(crm.requests).toHaveLength(1);
    expect(crm.requests[0].path).toBe("/api/public/subscribe");
    expect(crm.requests[0].json).toEqual({ companyId: COMPANY, email: "news@example.org", source: "website" });
    expect(crm.requests[0].headers.authorization).toBeUndefined();
    crm.reset();
    // (A filled honeypot already fails the schema - the field must be empty - so a bot is stopped before the CRM either way.)
    await call("subscribeToNewsletter", [{ email: "bot@example.org", website: "http://spam.example" }]);
    expect(crm.requests).toHaveLength(0);
    expect(await call("subscribeToNewsletter", [{ email: "not-an-email" }])).toContain("Please enter a valid email address.");
    expect(crm.requests).toHaveLength(0);
  });

  test("newsletter: a CRM error is reported to the visitor generically, once, with no retry", async () => {
    crm.script({ status: 500, body: { ok: false, error: "Could not complete your subscription. Please try again." } });
    expect(await call("subscribeToNewsletter", [{ email: "news@example.org", website: "" }])).toMatch(NEWSLETTER_ERROR);
    expect(crm.requests).toHaveLength(1);
  });

  test("the server log names fixed tags and codes only: no key, no secret, no customer value, no CRM message", async () => {
    const logs = server.logs();
    expect(logs).toContain("[submitFlightRequest] accepted by the CRM");
    expect(logs).toContain("the CRM rejected the request (HTTP 400, validation_failed, fields: phone)");
    expect(logs).toContain("the CRM refused the website's credential or route (HTTP 401)");
    for (const needle of NEEDLES) expect(logs, needle).not.toContain(needle);
    expect(logs).not.toContain("do-not-show");
    expect(logs).not.toMatch(/DATABASE|prisma|postgres/i); // the website has no database to mention
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------
test.describe("the CRM is unreachable (connection refused): friendly errors, bounded time, and NO other write path", () => {
  test.skip(!standaloneBuildPresent(), "needs a standalone build (NEXT_OUTPUT=standalone npm run build)");
  test.setTimeout(120_000);
  let server: StandaloneServer;
  let call: ReturnType<typeof actions>;
  test.beforeAll(async () => {
    server = await startStandalone({
      label: "crm-api unreachable e2e",
      port: 3234,
      env: { TRUSTED_PROXY: "cloudflare", CRM_API_URL: "http://127.0.0.1:1", CRM_API_KEY: KEY, CRM_COMPANY_ID: COMPANY },
    });
    call = actions(server);
  });
  test.afterAll(async () => {
    await server?.stop();
  });

  test("all three forms give the friendly error; the flight request tries a bounded number of times and then stops", async () => {
    const started = Date.now();
    expect(await call("submitFlightRequest", [flightInput()])).toMatch(GENERIC_FLIGHT_ERROR);
    expect(Date.now() - started).toBeLessThan(30_000);
    expect(await call("submitContactMessage", [contactInput()])).toMatch(GENERIC_CONTACT_ERROR);
    expect(await call("subscribeToNewsletter", [{ email: "news@example.org", website: "" }])).toMatch(NEWSLETTER_ERROR);
    const logs = server.logs();
    expect(logs).toContain("the CRM could not be reached after 3 attempt(s) (network)");
    expect(logs).toMatch(/\[submitContactMessage\] the CRM could not be reached \(network\)/);
    for (const needle of NEEDLES) expect(logs, needle).not.toContain(needle);
    expect(logs).not.toMatch(/DATABASE|prisma|postgres|fallback/i);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------
test.describe("the CRM settings are missing: friendly errors, the operator is told which VARIABLE, and nothing else happens", () => {
  test.skip(!standaloneBuildPresent(), "needs a standalone build (NEXT_OUTPUT=standalone npm run build)");
  test.setTimeout(120_000);
  let server: StandaloneServer;
  let call: ReturnType<typeof actions>;
  test.beforeAll(async () => {
    server = await startStandalone({ label: "crm-api unconfigured e2e", port: 3235, env: { TRUSTED_PROXY: "cloudflare" } });
    call = actions(server);
  });
  test.afterAll(async () => {
    await server?.stop();
  });

  test("with no CRM_API_URL / CRM_API_KEY / CRM_COMPANY_ID each form fails gracefully, validation still works, and the log names variables only", async () => {
    expect(await call("submitFlightRequest", [flightInput({ email: "bad" })])).toContain("Please check the highlighted fields"); // validation needs no CRM
    expect(await call("submitFlightRequest", [flightInput()])).toMatch(GENERIC_FLIGHT_ERROR);
    expect(await call("submitFlightRequest", [flightInput()])).toMatch(GENERIC_FLIGHT_ERROR); // reported once, not once per request
    expect(await call("submitContactMessage", [contactInput()])).toMatch(GENERIC_CONTACT_ERROR);
    expect(await call("subscribeToNewsletter", [{ email: "news@example.org", website: "" }])).toMatch(NEWSLETTER_ERROR);
    const logs = server.logs();
    expect(logs).toContain("[crm-api] flight request: CRM_API_URL is not set");
    expect(logs).toContain("[crm-api] flight request: CRM_API_KEY is not set");
    expect(logs).toContain("[crm-api] contact message: CRM_COMPANY_ID is not set");
    expect(logs).toContain("[crm-api] newsletter: CRM_COMPANY_ID is not set");
    expect(logs.split("flight request: CRM_API_KEY is not set")).toHaveLength(2); // exactly once
    for (const needle of NEEDLES) expect(logs, needle).not.toContain(needle);
  });
});
