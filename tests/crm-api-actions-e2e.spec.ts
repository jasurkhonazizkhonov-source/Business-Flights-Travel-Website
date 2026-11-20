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

  // ---- contact inquiry: the visitor's IP and approximate location, signed, from Cloudflare's headers only -----------------------------------
  // The server under test runs with TRUSTED_PROXY=cloudflare and LEAD_INGEST_SECRET; the stub CRM verifies the HMAC with its own code.
  const contactVisitor = async (headers: Record<string, string>, over: Record<string, unknown> = {}) => {
    crm.reset();
    const text = await call("submitContactMessage", [contactInput(over)], headers);
    expect(text, "the inquiry itself must still succeed").toMatch(/"ok":true/);
    const r = crm.requests.find((x) => x.path === "/api/public/contact-inquiry")!;
    return { r, v: r.visitor! };
  };
  const cf = (extra: Record<string, string>) => ({ ...extra });

  test("contact: an IPv4 visitor with Cloudflare's country, city, region and time zone -> one signed context with exactly those values and the Cloudflare source", async () => {
    const { r, v } = await contactVisitor(
      cf({ "CF-Connecting-IP": "203.0.113.77", "CF-IPCountry": "AU", "CF-IPCity": "Sydney", "CF-Region-Code": "NSW", "CF-Timezone": "Australia/Sydney", "X-Forwarded-For": "8.8.8.8" }),
    );
    expect(v).toMatchObject({ state: "verified", ip: "203.0.113.77", country: "AU", city: "Sydney", region: "NSW", timezone: "Australia/Sydney", source: "cloudflare" });
    // never forwarded: the forged header, any cf-* header, the raw IP outside the signed context, or an IP in the body
    expect(r.headers["x-forwarded-for"]).toBeUndefined();
    for (const h of Object.keys(r.headers)) expect(h.startsWith("cf-"), h).toBe(false);
    expect(r.bodyText).not.toMatch(/203\.0\.113\.77|8\.8\.8\.8/);
    expect(JSON.stringify(r.json)).not.toMatch(/"ip|ipAddress|city|country|timezone/i);
  });

  test("contact: IPv6 in full and compressed notation is preserved (canonical form), IPv4-mapped collapses to IPv4, Cloudflare's Pseudo-IPv4 stand-in is replaced by the real IPv6", async () => {
    expect((await contactVisitor(cf({ "CF-Connecting-IP": "2001:4860:4860:0:0:0:0:8888", "CF-IPCountry": "US" }))).v.ip).toBe("2001:4860:4860::8888");
    expect((await contactVisitor(cf({ "CF-Connecting-IP": "2001:4860:4860::8888" }))).v.ip).toBe("2001:4860:4860::8888");
    expect((await contactVisitor(cf({ "CF-Connecting-IP": "2A00:1450:4001:081B:0000:0000:0000:200E" }))).v.ip).toBe("2a00:1450:4001:81b::200e");
    expect((await contactVisitor(cf({ "CF-Connecting-IP": "::ffff:203.0.113.9" }))).v.ip).toBe("203.0.113.9");
    expect((await contactVisitor(cf({ "CF-Connecting-IP": "240.0.0.7", "CF-Connecting-IPv6": "2606:4700:4700::1111" }))).v.ip).toBe("2606:4700:4700::1111");
    const { v } = await contactVisitor(cf({ "CF-Connecting-IP": "2001:4860:4860::8888", "CF-IPCountry": "US", "CF-IPCity": "Mountain View", "CF-Region-Code": "CA" }));
    expect(v).toMatchObject({ ip: "2001:4860:4860::8888", country: "US", city: "Mountain View", region: "CA", source: "cloudflare" });
  });

  test("contact: incomplete geolocation keeps what exists (nothing invented); no geolocation keeps the IP; unknown country markers are dropped", async () => {
    const partial = (await contactVisitor(cf({ "CF-Connecting-IP": "203.0.113.20", "CF-IPCountry": "GB" }))).v;
    expect(partial).toMatchObject({ state: "verified", ip: "203.0.113.20", country: "GB", source: "cloudflare" });
    expect(partial.city).toBeUndefined();
    expect(partial.region).toBeUndefined();
    const none = (await contactVisitor(cf({ "CF-Connecting-IP": "203.0.113.21" }))).v;
    expect(none).toMatchObject({ state: "verified", ip: "203.0.113.21" });
    expect([none.city, none.region, none.country, none.timezone, none.source]).toEqual([undefined, undefined, undefined, undefined, undefined]);
    for (const marker of ["XX", "T1"]) {
      const v = (await contactVisitor(cf({ "CF-Connecting-IP": "203.0.113.22", "CF-IPCountry": marker }))).v;
      expect(v.country, marker).toBeUndefined();
      expect(v.source, marker).toBeUndefined();
    }
    const nonAscii = (await contactVisitor(cf({ "CF-Connecting-IP": "203.0.113.23", "CF-IPCountry": "BR", "CF-IPCity": Buffer.from("São Paulo", "utf8").toString("latin1") }))).v;
    expect(nonAscii.city).toBe("São Paulo");
  });

  test("contact: no trusted client IP (only forged forwarding headers, an invalid or a private value) -> the inquiry succeeds, with NO IP in the context and nothing substituted", async () => {
    const forged = await contactVisitor({ "X-Forwarded-For": "8.8.8.8", "X-Real-IP": "8.8.4.4", Forwarded: "for=1.1.1.1" });
    expect(forged.v.state).toBe("verified"); // the REQUEST is signed (signing v2) ...
    expect([forged.v.ip, forged.v.city, forged.v.region, forged.v.country, forged.v.timezone]).toEqual([undefined, undefined, undefined, undefined, undefined]); // ... but carries no visitor facts: no IP, no location
    expect(JSON.stringify(forged.r)).not.toMatch(/8\.8\.8\.8|8\.8\.4\.4|1\.1\.1\.1/);
    for (const bad of ["not-an-ip", "10.0.0.5", "127.0.0.1", "fe80::1", "999.1.1.1"]) {
      const v = (await contactVisitor(cf({ "CF-Connecting-IP": bad, "CF-IPCountry": "DE" }), {})).v;
      expect(v.ip, bad).toBeUndefined(); // an invalid / private value is "unavailable", never stored or replaced
      expect(v.country, bad).toBe("DE"); // the location Cloudflare supplied is still sent
    }
  });

  test("contact: a visitor-supplied ip/location field in the submitted data is ignored: it never reaches the CRM body or context", async () => {
    const { r, v } = await contactVisitor(cf({ "CF-Connecting-IP": "203.0.113.31" }), { ipAddress: "6.6.6.6", ip: "6.6.6.7", city: "Atlantis", country: "Mars", location: { city: "Nowhere" } });
    expect(v.ip).toBe("203.0.113.31");
    expect(v.city).toBeUndefined();
    expect(JSON.stringify(r)).not.toMatch(/6\.6\.6\.|Atlantis|Mars|Nowhere/);
  });

  // ---- flight request: the same IP / location guarantees as the contact form (it uses the same capture and the same signature) -----------------------
  const flightVisitor = async (headers: Record<string, string>, over: Record<string, unknown> = {}) => {
    crm.reset();
    const text = await call("submitFlightRequest", [flightInput(over)], headers);
    expect(text, "the flight request itself must still succeed").toMatch(/"ok":true/);
    const r = crm.requests.find((x) => x.path === "/api/v1/website/flight-inquiries")!;
    return { r, v: r.visitor! };
  };

  test("flight request: IPv6 in full and compressed notation is preserved (canonical form), IPv4-mapped collapses to IPv4, Pseudo-IPv4 is replaced by the real IPv6", async () => {
    expect((await flightVisitor(cf({ "CF-Connecting-IP": "2001:4860:4860:0:0:0:0:8888", "CF-IPCountry": "US" }))).v.ip).toBe("2001:4860:4860::8888");
    expect((await flightVisitor(cf({ "CF-Connecting-IP": "2A00:1450:4001:081B:0000:0000:0000:200E" }))).v.ip).toBe("2a00:1450:4001:81b::200e");
    expect((await flightVisitor(cf({ "CF-Connecting-IP": "::ffff:203.0.113.9" }))).v.ip).toBe("203.0.113.9");
    expect((await flightVisitor(cf({ "CF-Connecting-IP": "240.0.0.7", "CF-Connecting-IPv6": "2606:4700:4700::1111" }))).v.ip).toBe("2606:4700:4700::1111");
    const { r, v } = await flightVisitor(cf({ "CF-Connecting-IP": "2001:4860:4860::8888", "CF-IPCountry": "US", "CF-IPCity": "Mountain View", "CF-Region-Code": "CA", "CF-Timezone": "America/Los_Angeles" }));
    expect(v).toMatchObject({ state: "verified", ip: "2001:4860:4860::8888", country: "US", city: "Mountain View", region: "CA", timezone: "America/Los_Angeles", source: "cloudflare" });
    expect(r.bodyText).not.toMatch(/2001:4860/); // only inside the signed context, never in the body
  });

  test("flight request: incomplete or absent location keeps what exists and invents nothing; unknown country markers are dropped", async () => {
    const partial = (await flightVisitor(cf({ "CF-Connecting-IP": "203.0.113.20", "CF-IPCountry": "GB" }))).v;
    expect(partial).toMatchObject({ state: "verified", ip: "203.0.113.20", country: "GB", source: "cloudflare" });
    expect([partial.city, partial.region]).toEqual([undefined, undefined]);
    const none = (await flightVisitor(cf({ "CF-Connecting-IP": "203.0.113.21" }))).v;
    expect(none).toMatchObject({ state: "verified", ip: "203.0.113.21" });
    expect([none.city, none.region, none.country, none.timezone, none.source]).toEqual([undefined, undefined, undefined, undefined, undefined]);
    for (const marker of ["XX", "T1"]) expect((await flightVisitor(cf({ "CF-Connecting-IP": "203.0.113.22", "CF-IPCountry": marker }))).v.country, marker).toBeUndefined();
  });

  test("flight request: only forged, invalid or private addresses -> the request succeeds and is signed, with NO IP in the context and nothing substituted", async () => {
    const forged = await flightVisitor({ "X-Forwarded-For": "8.8.8.8", "X-Real-IP": "8.8.4.4", Forwarded: "for=1.1.1.1" });
    expect(forged.v.state).toBe("verified");
    expect([forged.v.ip, forged.v.city, forged.v.country]).toEqual([undefined, undefined, undefined]);
    expect(JSON.stringify(forged.r)).not.toMatch(/8\.8\.8\.8|8\.8\.4\.4|1\.1\.1\.1/);
    for (const bad of ["not-an-ip", "10.0.0.5", "172.17.0.2", "127.0.0.1", "fe80::1", "999.1.1.1"]) {
      const v = (await flightVisitor(cf({ "CF-Connecting-IP": bad, "CF-IPCountry": "DE" }))).v;
      expect(v.ip, bad).toBeUndefined(); // an invalid or internal (Docker/private) address is "unavailable", never stored as the visitor
      expect(v.country, bad).toBe("DE");
    }
  });

  test("flight request: an ip / location field in the submitted data is ignored", async () => {
    const { r, v } = await flightVisitor(cf({ "CF-Connecting-IP": "203.0.113.31" }), { ipAddress: "6.6.6.6", ip: "6.6.6.7", city: "Atlantis", country: "Mars", location: { city: "Nowhere" } });
    expect(v.ip).toBe("203.0.113.31");
    expect(v.city).toBeUndefined();
    expect(JSON.stringify(r)).not.toMatch(/6\.6\.6\.|Atlantis|Mars|Nowhere/);
  });

  // ---- the new field rules, checked by the server itself (a caller that skips the browser's checks still gets them) ---------------------------------
  const fieldErrors = (text: string): Record<string, string> => {
    const match = /"fieldErrors":(\{[^}]*\})/.exec(text);
    return match ? (JSON.parse(match[1]) as Record<string, string>) : {};
  };
  const isoPlus = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

  test("flight request: the 11-month limit - the last day is accepted, the next is refused before the CRM, at the departure and at the return", async () => {
    // The server accepts the widest window any time zone could produce (see src/lib/flight-date-window.ts): up to 11 calendar months after the date at UTC+14.
    const { serverDateWindow } = await import("../src/lib/flight-date-window");
    const { min, max } = serverDateWindow();
    const dayAfter = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    const dayBefore = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

    expect(await call("submitFlightRequest", [flightInput({ tripType: "ONE_WAY", returnDate: undefined, segments: [{ from: JFK, to: CDG, departureDate: max }] })])).toMatch(/"ok":true/);
    expect(crm.leadCount()).toBe(1);
    crm.reset();

    const tooFar = await call("submitFlightRequest", [flightInput({ tripType: "ONE_WAY", returnDate: undefined, segments: [{ from: JFK, to: CDG, departureDate: dayAfter(max) }] })]);
    expect(tooFar).toMatch(/"ok":false/);
    expect(fieldErrors(tooFar)["segments.0.departureDate"]).toBe("Flights can be requested up to 11 months ahead. Please choose an earlier date.");

    const returnOnLimit = await call("submitFlightRequest", [flightInput({ segments: [{ from: JFK, to: CDG, departureDate: isoPlus(30) }], returnDate: max })]);
    expect(returnOnLimit).toMatch(/"ok":true/);
    crm.reset();
    const returnTooFar = await call("submitFlightRequest", [flightInput({ segments: [{ from: JFK, to: CDG, departureDate: isoPlus(30) }], returnDate: dayAfter(max) })]);
    expect(fieldErrors(returnTooFar)["returnDate"]).toBe("Flights can be requested up to 11 months ahead. Please choose an earlier date.");

    expect(await call("submitFlightRequest", [flightInput({ tripType: "ONE_WAY", returnDate: undefined, segments: [{ from: JFK, to: CDG, departureDate: min }] })])).toMatch(/"ok":true/);
    crm.reset();
    const past = await call("submitFlightRequest", [flightInput({ tripType: "ONE_WAY", returnDate: undefined, segments: [{ from: JFK, to: CDG, departureDate: dayBefore(min) }] })]);
    expect(fieldErrors(past)["segments.0.departureDate"]).toBe("Departure date cannot be in the past");
    expect(crm.requests).toHaveLength(0);
  });

  test("flight request: an email that is not an address is refused field by field, with a hint, before the CRM", async () => {
    for (const [email, hint] of [["zelda.q@example", "needs a dot"], ["zelda q@example.org", "Remove any spaces"], ["zelda..q@example.org", "two dots in a row"], ["@example.org", "Add the part before the @"]] as const) {
      const text = await call("submitFlightRequest", [flightInput({ email })]);
      expect(text, email).toMatch(/"ok":false/);
      expect(fieldErrors(text).email, email).toContain(hint);
    }
    expect(crm.requests).toHaveLength(0);
    // surrounding whitespace is the one thing that is tolerated (trimmed); the address is otherwise sent exactly as typed
    expect(await call("submitFlightRequest", [flightInput({ email: "  Zelda.Q+trip@Example.org " })])).toMatch(/"ok":true/);
    expect(crm.requests[0].json).toMatchObject({ email: "Zelda.Q+trip@Example.org" });
  });

  test("flight request and contact message: a phone number that is not valid is refused field by field with its own message, before the CRM", async () => {
    const cases: [string, RegExp][] = [
      ["+14155552", /complete number/], // too short
      ["+1415555267112345", /too many digits/],
      ["+999123456789", /country code/],
      ["+44207946095", /valid phone number for/], // plausible length, not a number the plan allows
      ["+1 4155552671 ext", /digits, spaces, dashes and brackets/],
    ];
    for (const [phone, message] of cases) {
      const flight = await call("submitFlightRequest", [flightInput({ phone })]);
      expect(fieldErrors(flight).phone, `flight ${phone}`).toMatch(message);
      const contact = await call("submitContactMessage", [contactInput({ phone })]);
      expect(fieldErrors(contact).phone, `contact ${phone}`).toMatch(message);
    }
    expect(crm.requests).toHaveLength(0);
    // a valid number from another country is normalised to E.164 for the CRM
    expect(await call("submitFlightRequest", [flightInput({ phone: "+49 30 123456" })])).toMatch(/"ok":true/);
    expect(crm.requests[0].json).toMatchObject({ phone: "+4930123456" });
  });

  test("contact message: an invalid email is refused with the same rules", async () => {
    const text = await call("submitContactMessage", [contactInput({ email: "zelda@@example.org" })]);
    expect(text).toMatch(/"ok":false/);
    expect(fieldErrors(text).email).toContain("only contain one @");
    expect(crm.requests).toHaveLength(0);
  });

  test("contact: a resend of the same message from another network is still ONE inquiry; a CRM failure gives the visitor the generic message with no IP in it", async () => {
    const formId = randomUUID();
    crm.reset();
    await call("submitContactMessage", [contactInput({ submissionId: formId })], cf({ "CF-Connecting-IP": "203.0.113.41" }));
    await call("submitContactMessage", [contactInput({ submissionId: formId })], cf({ "CF-Connecting-IP": "203.0.113.42" }));
    expect(crm.inquiryCount()).toBe(1);
    crm.reset();
    crm.script({ status: 500, body: { ok: false } });
    const failed = await call("submitContactMessage", [contactInput()], cf({ "CF-Connecting-IP": "203.0.113.43" }));
    expect(failed).toMatch(GENERIC_CONTACT_ERROR);
    expect(failed).not.toMatch(/"ok":true|203\.0\.113\.43/);
    expect(crm.requests).toHaveLength(1); // one attempt
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
    // A filled honeypot is discarded SILENTLY on the server: the bot gets exactly the reply a real success gets, and nothing reaches the CRM -
    // including when the bot also typed a junk address (a validation error there would tell it apart from success).
    const botReply = await call("subscribeToNewsletter", [{ email: "bot@example.org", website: "http://spam.example" }]);
    expect(botReply).toBe(text);
    expect(await call("subscribeToNewsletter", [{ email: "not-an-email", website: "http://spam.example" }])).toBe(text);
    expect(await call("subscribeToNewsletter", [{ email: "bot@example.org", website: " " }])).toBe(text);
    expect(crm.requests).toHaveLength(0);
    // A missing honeypot field is a normal submission: validation still applies, and nothing reaches the CRM for a malformed address.
    expect(await call("subscribeToNewsletter", [{ email: "not-an-email" }])).toContain("Please enter a valid email address.");
    expect(await call("subscribeToNewsletter", [{ email: "", website: "" }])).toContain("Please enter a valid email address.");
    expect(await call("subscribeToNewsletter", [{ email: "not-an-email", website: "" }])).toContain("Please enter a valid email address.");
    expect(crm.requests).toHaveLength(0);
    // Malformed argument shapes never reach the CRM either, and never throw the visitor a stack trace.
    for (const bad of [{}, { email: 5 }, { email: "a@example.org", website: 5 }, null]) {
      const out = await call("subscribeToNewsletter", [bad]);
      expect(out, JSON.stringify(bad)).not.toMatch(/at \w+ \(|node_modules|\.ts:\d+/);
    }
    expect(crm.requests).toHaveLength(0);
    // Repeated honeypot submissions behave the same every time.
    for (let i = 0; i < 3; i++) expect(await call("subscribeToNewsletter", [{ email: "bot@example.org", website: "http://spam.example" }])).toBe(text);
    expect(crm.requests).toHaveLength(0);
  });

  test("contact: the form's submissionId reaches the CRM as an idempotency key, so a visitor's resend stores ONE inquiry; a corrected message is a new one", async () => {
    const formId = randomUUID();
    expect(await call("submitContactMessage", [contactInput({ submissionId: formId })])).toMatch(/"ok":true/);
    expect(await call("submitContactMessage", [contactInput({ submissionId: formId })])).toMatch(/"ok":true/); // the visitor pressed Send again
    expect(crm.inquiryCount()).toBe(1);
    const sentKey = (crm.requests[0].json as { submissionId?: string }).submissionId;
    expect(sentKey).toMatch(new RegExp(`^${formId}\\.[0-9a-f]{16}$`)); // form id + a hash of what was typed
    expect(crm.requests.every((r) => (r.json as { submissionId?: string }).submissionId === sentKey)).toBe(true);
    // Editing the message after a failure is a different submission: stored on its own, never merged into the first.
    expect(await call("submitContactMessage", [contactInput({ submissionId: formId, message: "Actually, a different and corrected question about my booking." })])).toMatch(/"ok":true/);
    expect(crm.inquiryCount()).toBe(2);
    // No form id (an insecure context without randomUUID): no key is sent and the message is still delivered.
    crm.reset();
    expect(await call("submitContactMessage", [contactInput()])).toMatch(/"ok":true/);
    expect(crm.requests[0].json).not.toHaveProperty("submissionId");
    expect(crm.inquiryCount()).toBe(1);
    // A malformed form id is a validation failure, not a CRM call.
    crm.reset();
    expect(await call("submitContactMessage", [contactInput({ submissionId: "bad id!" })])).toMatch(/"ok":false/);
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

// ---------------------------------------------------------------------------------------------------------------------------------------
// Wrong (but present) settings against a REACHABLE CRM, and a CRM hostname that does not resolve. The website cannot know which of its settings is
// wrong; what it must do is fail explicitly and safely: a generic message for the visitor, never a false success, one attempt, nothing sensitive in the log,
// and the server stays healthy afterwards.
const OTHER_INGEST = "other-ingest-" + "abcdef0123456789".repeat(3);
test.describe("wrong company id and a different signing secret, against a reachable stand-in CRM", () => {
  test.skip(!standaloneBuildPresent(), "needs a standalone build (NEXT_OUTPUT=standalone npm run build)");
  test.setTimeout(120_000);
  let crm: StubCrm;
  let server: StandaloneServer;
  let call: ReturnType<typeof actions>;
  test.beforeAll(async () => {
    crm = await startStubCrm({ apiKey: KEY, companyId: COMPANY, ingestSecret: INGEST });
    server = await startStandalone({
      label: "crm-api wrong settings e2e",
      port: 3240,
      // CRM_COMPANY_ID names a company the CRM does not know; LEAD_INGEST_SECRET is not the CRM's secret.
      env: { TRUSTED_PROXY: "cloudflare", CRM_API_URL: crm.url, CRM_API_KEY: KEY, CRM_COMPANY_ID: "some-other-company", LEAD_INGEST_SECRET: OTHER_INGEST },
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

  test("a company the CRM does not know: contact and newsletter give the generic message once each and store nothing; the log says only that the CRM refused", async () => {
    expect(await call("submitContactMessage", [contactInput()])).toMatch(GENERIC_CONTACT_ERROR);
    expect(await call("subscribeToNewsletter", [{ email: "news@example.org", website: "" }])).toMatch(NEWSLETTER_ERROR);
    expect(crm.inquiryCount()).toBe(0);
    expect(crm.requests.filter((r) => r.path === "/api/public/contact-inquiry")).toHaveLength(1); // one attempt, never retried
    expect(crm.requests.filter((r) => r.path === "/api/public/subscribe")).toHaveLength(1);
    const logs = server.logs();
    expect(logs).toMatch(/\[submitContactMessage\] the CRM rejected the message \(HTTP 400\)/);
    expect(logs).not.toContain("some-other-company"); // the configured company id is never logged
    for (const needle of NEEDLES) expect(logs, needle).not.toContain(needle);
    expect(logs).not.toContain(OTHER_INGEST);
  });

  test("a signing secret (and company id) the CRM does not share: the request is REFUSED (401), the visitor gets the generic error, nothing is stored, it is not retried, and no secret is logged", async () => {
    const text = await call("submitFlightRequest", [flightInput()]);
    expect(text).toMatch(GENERIC_FLIGHT_ERROR); // never a false success
    const attempts = crm.requests.filter((x) => x.path === "/api/v1/website/flight-inquiries");
    expect(attempts).toHaveLength(1); // a signature refusal is an operator problem: not retried
    expect(attempts[0].status).toBe(401);
    expect(attempts[0].headers["x-ct-visitor-context"], "the website did sign the request").toBeTruthy();
    expect(attempts[0].visitor).toEqual({ state: "invalid", reason: "bad_signature" }); // the stand-in CRM, like the real one, does not believe it
    expect(crm.leadCount()).toBe(0);
    const logs = server.logs();
    expect(logs).toMatch(/\[submitFlightRequest\] the CRM refused the website's credential or route \(HTTP 401\)/);
    expect(logs).not.toContain(OTHER_INGEST);
    for (const needle of NEEDLES) expect(logs, needle).not.toContain(needle);
  });

  test("the contact message with a secret the CRM does not share is refused too, once, with the generic message and nothing stored", async () => {
    expect(await call("submitContactMessage", [contactInput()])).toMatch(GENERIC_CONTACT_ERROR);
    expect(crm.inquiryCount()).toBe(0);
    expect(server.logs()).not.toContain(OTHER_INGEST);
  });
});

test.describe("the CRM hostname does not resolve (DNS failure): bounded, generic, and the server stays healthy", () => {
  test.skip(!standaloneBuildPresent(), "needs a standalone build (NEXT_OUTPUT=standalone npm run build)");
  test.setTimeout(120_000);
  let server: StandaloneServer;
  let call: ReturnType<typeof actions>;
  test.beforeAll(async () => {
    // ".invalid" is reserved (RFC 2606) and never resolves.
    server = await startStandalone({
      label: "crm-api unresolvable host e2e",
      port: 3241,
      env: { TRUSTED_PROXY: "cloudflare", CRM_API_URL: "http://compass-crm.invalid:3000", CRM_API_KEY: KEY, CRM_COMPANY_ID: COMPANY, LEAD_INGEST_SECRET: INGEST },
    });
    call = actions(server);
  });
  test.afterAll(async () => {
    await server?.stop();
  });

  test("all three forms give the generic message in bounded time, never a success; the log names the failure class, not the host or any visitor value; /api/health still answers", async () => {
    const started = Date.now();
    expect(await call("submitFlightRequest", [flightInput()])).toMatch(GENERIC_FLIGHT_ERROR);
    expect(await call("submitContactMessage", [contactInput()])).toMatch(GENERIC_CONTACT_ERROR);
    expect(await call("subscribeToNewsletter", [{ email: "news@example.org", website: "" }])).toMatch(NEWSLETTER_ERROR);
    expect(Date.now() - started).toBeLessThan(60_000);
    const logs = server.logs();
    expect(logs).toMatch(/the CRM could not be reached/);
    for (const needle of NEEDLES) expect(logs, needle).not.toContain(needle);
    const health = await fetch(`${server.origin}/api/health`);
    expect(health.status).toBe(200);
    expect(await health.text()).toContain("ok");
  });
});
