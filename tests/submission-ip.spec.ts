import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { normalizeIp, isPrivateOrReservedIp, resolveClientIp, trustedProxyMode } from "../src/lib/client-ip";
import { readApproximateLocation, formatLocation } from "../src/lib/ip-geo";
import { captureSubmissionInfo, hasSubmissionDetails } from "../src/lib/submission-info";
import { saveLeadSubmissionInfo } from "../src/server/save-submission-info";
import {
  buildFlightRequestNotificationEmail,
  buildFlightRequestNotificationSubject,
  IP_LOCATION_NOTE,
  type FlightRequestNotificationInput,
} from "../src/lib/email/flight-request-notification";

// Environment that decides whether forwarded headers are trusted — isolated per test.
const KEYS = ["VERCEL", "TRUSTED_PROXY"] as const;
const saved: Partial<Record<(typeof KEYS)[number], string | undefined>> = {};
test.beforeEach(() => {
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
test.afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const onVercel = () => {
  process.env.VERCEL = "1";
};
const h = (init: Record<string, string>) => new Headers(init);

test.describe("client IP resolution — trust model", () => {
  test("on Vercel the full IPv4 address is taken from the platform's own header", () => {
    onVercel();
    expect(resolveClientIp(h({ "x-vercel-forwarded-for": "203.0.113.42" }))).toEqual({ ok: true, address: "203.0.113.42", version: "v4" });
  });

  test("a full IPv6 address is captured, canonicalised (lower-case, zero-compressed) and reported as v6", () => {
    onVercel();
    expect(resolveClientIp(h({ "x-vercel-forwarded-for": "2607:F8B0:4005:080A:0000:0000:0000:200E" }))).toEqual({ ok: true, address: "2607:f8b0:4005:80a::200e", version: "v6" });
  });

  test("an IPv4-mapped IPv6 address collapses to the plain IPv4 so one client is never stored as two strings", () => {
    onVercel();
    expect(resolveClientIp(h({ "x-real-ip": "::ffff:203.0.113.9" }))).toEqual({ ok: true, address: "203.0.113.9", version: "v4" });
    expect(normalizeIp("::FFFF:203.0.113.9")).toBe("203.0.113.9");
  });

  test("a port suffix or IPv6 brackets are stripped, and only the first hop of a list is used", () => {
    onVercel();
    expect(resolveClientIp(h({ "x-forwarded-for": "203.0.113.42:51820" }))).toMatchObject({ address: "203.0.113.42" });
    expect(resolveClientIp(h({ "x-forwarded-for": "[2607:f8b0::1]:443" }))).toMatchObject({ address: "2607:f8b0::1", version: "v6" });
    expect(resolveClientIp(h({ "x-forwarded-for": "198.51.100.7, 10.0.0.1, 172.16.0.4" }))).toMatchObject({ address: "198.51.100.7" });
  });

  test("header priority on Vercel: x-vercel-forwarded-for, then x-real-ip, then x-forwarded-for", () => {
    onVercel();
    expect(resolveClientIp(h({ "x-vercel-forwarded-for": "198.51.100.1", "x-real-ip": "198.51.100.2", "x-forwarded-for": "198.51.100.3" }))).toMatchObject({ address: "198.51.100.1" });
    expect(resolveClientIp(h({ "x-real-ip": "198.51.100.2", "x-forwarded-for": "198.51.100.3" }))).toMatchObject({ address: "198.51.100.2" });
  });

  test("SPOOFING: outside a trusted proxy, no forwarded header is ever believed", () => {
    // VERCEL unset, TRUSTED_PROXY unset (local dev / an unknown host)
    const spoof = h({ "x-forwarded-for": "8.8.8.8", "x-real-ip": "8.8.4.4", forwarded: "for=1.1.1.1", "cf-connecting-ip": "1.0.0.1", "x-vercel-forwarded-for": "9.9.9.9" });
    expect(resolveClientIp(spoof)).toEqual({ ok: false, reason: "no_trusted_proxy" });
    expect(trustedProxyMode()).toBe("none");
  });

  test("SPOOFING: even on Vercel, the `Forwarded` and CF-Connecting-IP headers (which Vercel does not sanitise) are never read", () => {
    onVercel();
    expect(resolveClientIp(h({ forwarded: "for=8.8.8.8", "cf-connecting-ip": "8.8.4.4" }))).toEqual({ ok: false, reason: "no_header" });
  });

  test("an explicit TRUSTED_PROXY=none wins over the Vercel platform signal; cloudflare reads only cf-connecting-ip", () => {
    onVercel();
    process.env.TRUSTED_PROXY = "none";
    expect(resolveClientIp(h({ "x-vercel-forwarded-for": "203.0.113.42" }))).toEqual({ ok: false, reason: "no_trusted_proxy" });
    process.env.TRUSTED_PROXY = "cloudflare";
    expect(resolveClientIp(h({ "cf-connecting-ip": "203.0.113.50", "x-forwarded-for": "8.8.8.8" }))).toMatchObject({ address: "203.0.113.50" });
  });

  test("unknown is reported as unknown with a value-free reason — never invented", () => {
    onVercel();
    expect(resolveClientIp(h({}))).toEqual({ ok: false, reason: "no_header" });
    expect(resolveClientIp(h({ "x-vercel-forwarded-for": "not-an-ip" }))).toEqual({ ok: false, reason: "invalid" });
    expect(resolveClientIp(h({ "x-vercel-forwarded-for": "999.1.1.1" }))).toEqual({ ok: false, reason: "invalid" });
  });

  test("private, loopback, link-local, CGNAT, multicast and documentation addresses are never a customer's address", () => {
    onVercel();
    for (const ip of ["10.1.2.3", "172.16.0.1", "192.168.1.1", "127.0.0.1", "169.254.1.1", "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255", "::1", "fd00::1", "fe80::1", "ff02::1", "2001:db8::1"]) {
      expect(isPrivateOrReservedIp(normalizeIp(ip)!), ip).toBe(true);
      expect(resolveClientIp(h({ "x-vercel-forwarded-for": ip })), ip).toEqual({ ok: false, reason: "private_or_reserved" });
    }
    expect(isPrivateOrReservedIp("203.0.113.42")).toBe(false);
    expect(isPrivateOrReservedIp("2607:f8b0::1")).toBe(false);
  });

  test("an IPv6 zone id is dropped; garbage and over-long input are rejected without throwing", () => {
    expect(normalizeIp("fe80::1%eth0")).toBe("fe80::1");
    for (const bad of ["", " ", "1.2.3", "1.2.3.4.5", "::g", "[::1", "http://x", "1.2.3.4/24", "a".repeat(5000)]) expect(normalizeIp(bad), JSON.stringify(bad).slice(0, 30)).toBeUndefined();
  });
});

test.describe("approximate location from the platform's geolocation headers", () => {
  test("city, region (named for US/CA/AU), country, country code and time zone are read; the city's URL-encoding is decoded", () => {
    const loc = readApproximateLocation(
      h({ "x-vercel-ip-country": "US", "x-vercel-ip-country-region": "CA", "x-vercel-ip-city": "San%20Francisco", "x-vercel-ip-timezone": "America/Los_Angeles" }),
    );
    expect(loc).toEqual({ city: "San Francisco", regionCode: "CA", region: "California", country: "United States", countryCode: "US", timeZone: "America/Los_Angeles" });
    expect(formatLocation(loc!)).toBe("San Francisco, California, United States");
    expect(readApproximateLocation(h({ "x-vercel-ip-country": "AU", "x-vercel-ip-country-region": "NSW", "x-vercel-ip-city": "Sydney" }))).toMatchObject({ region: "New South Wales", country: "Australia" });
    expect(readApproximateLocation(h({ "x-vercel-ip-country": "CA", "x-vercel-ip-country-region": "ON" }))).toMatchObject({ region: "Ontario", country: "Canada" });
  });

  test("non-ASCII cities are decoded correctly", () => {
    expect(readApproximateLocation(h({ "x-vercel-ip-country": "CH", "x-vercel-ip-city": "Z%C3%BCrich" }))).toMatchObject({ city: "Zürich", country: "Switzerland" });
  });

  test("a region this app has no name for keeps only the code as supplied — no name is invented", () => {
    const loc = readApproximateLocation(h({ "x-vercel-ip-country": "DE", "x-vercel-ip-country-region": "BY", "x-vercel-ip-city": "Munich" }))!;
    expect(loc.region).toBeUndefined();
    expect(loc.regionCode).toBe("BY");
    expect(formatLocation(loc)).toBe("Munich, BY, Germany");
  });

  test("malformed or hostile header values are dropped, not passed on", () => {
    expect(readApproximateLocation(h({ "x-vercel-ip-country": "USA", "x-vercel-ip-timezone": "Not/AZone", "x-vercel-ip-country-region": "<script>" }))).toBeUndefined();
    expect(readApproximateLocation(h({ "x-vercel-ip-city": "%E0%A4%A" }))).toBeUndefined(); // invalid percent-encoding
    expect(readApproximateLocation(h({ "x-vercel-ip-city": "A".repeat(200) }))).toBeUndefined(); // over-long
    const clean = readApproximateLocation(h({ "x-vercel-ip-country": "US", "x-vercel-ip-city": "Spring%0Afield" }))!;
    expect(clean.city).toBe("Spring field"); // control characters never reach an email or the CRM
  });

  test("an unknown country code is never presented as a name, and absent headers give no location at all", () => {
    expect(readApproximateLocation(h({ "x-vercel-ip-country": "ZZ" }))).toEqual({ countryCode: "ZZ" });
    expect(readApproximateLocation(h({}))).toBeUndefined();
  });
});

test.describe("captureSubmissionInfo", () => {
  const geo = { "x-vercel-forwarded-for": "203.0.113.42", "x-vercel-ip-country": "US", "x-vercel-ip-country-region": "CA", "x-vercel-ip-city": "San%20Francisco", "x-vercel-ip-timezone": "America/Los_Angeles" };

  test("on Vercel: the full IP, version, location and its source are all captured together", () => {
    onVercel();
    const now = new Date("2026-10-04T10:00:00Z");
    const { info, ipUnavailable } = captureSubmissionInfo(h(geo), now);
    expect(ipUnavailable).toBeUndefined();
    expect(info.ip).toEqual({ address: "203.0.113.42", version: "v4" });
    expect(info.location).toMatchObject({ city: "San Francisco", countryCode: "US" });
    expect(info.locationSource).toContain("Vercel");
    expect(info.capturedAt).toBe(now);
    expect(hasSubmissionDetails(info)).toBe(true);
  });

  test("outside Vercel: nothing is believed — a client cannot plant an IP OR a location by sending the headers itself", () => {
    const { info, ipUnavailable } = captureSubmissionInfo(h(geo));
    expect(info.ip).toBeUndefined();
    expect(info.location).toBeUndefined();
    expect(info.locationSource).toBeUndefined();
    expect(ipUnavailable).toBe("no_trusted_proxy");
    expect(hasSubmissionDetails(info)).toBe(false);
  });

  test("IP unknown but location known (or the reverse) keeps exactly what was obtained", () => {
    onVercel();
    const noIp = captureSubmissionInfo(h({ "x-vercel-ip-country": "FR" }));
    expect(noIp.info.ip).toBeUndefined();
    expect(noIp.info.location).toMatchObject({ countryCode: "FR" });
    expect(noIp.ipUnavailable).toBe("no_header");
    const noGeo = captureSubmissionInfo(h({ "x-vercel-forwarded-for": "198.51.100.9" }));
    expect(noGeo.info.ip?.address).toBe("198.51.100.9");
    expect(noGeo.info.location).toBeUndefined();
  });
});

test.describe("the internal notification: Submission & IP Information", () => {
  const JFK = { iata: "JFK", city: "New York", country: "United States", name: "John F. Kennedy International Airport" };
  const CDG = { iata: "CDG", city: "Paris", country: "France", name: "Paris Charles de Gaulle Airport" };
  const BASE: FlightRequestNotificationInput = {
    firstName: "Jayan", lastName: "Grondin", email: "jayan@example.com", phoneE164: "+33783905717", tripType: "ONE_WAY", cabinClass: "BUSINESS",
    adults: 1, children: 0, infants: 0, flexibleDates: false, segments: [{ from: JFK, to: CDG, departureDate: "2026-10-24" }], submittedAt: new Date("2026-10-04T10:00:00Z"),
  };
  const submission = {
    ip: { address: "203.0.113.42", version: "v4" as const },
    location: { city: "San Francisco", regionCode: "CA", region: "California", country: "United States", countryCode: "US", timeZone: "America/Los_Angeles" },
    locationSource: "Vercel edge geolocation (approximate)",
  };

  test("the full IP and every obtained location field appear in BOTH the HTML and the plain text, labelled approximate", () => {
    const { html, text } = buildFlightRequestNotificationEmail({ ...BASE, submission });
    for (const part of ["Submission &amp; IP Information", "203.0.113.42", "IPv4", "Approximate Location", "San Francisco, California, United States", "United States (US)", "America/Los_Angeles", "Vercel edge geolocation (approximate)"]) {
      expect(html, `html missing ${part}`).toContain(part);
    }
    expect(text).toContain("SUBMISSION & IP INFORMATION");
    expect(text).toContain("IP Address: 203.0.113.42");
    expect(text).toContain("IP Version: IPv4");
    expect(text).toContain("Approximate Location: San Francisco, California, United States");
    expect(text).toContain("Country: United States (US)");
    expect(text).toContain("Time Zone: America/Los_Angeles");
    expect(text).toContain("Location Source: Vercel edge geolocation (approximate)");
    expect(html).toContain(IP_LOCATION_NOTE.slice(0, 40));
    expect(text).toContain(IP_LOCATION_NOTE);
  });

  test("an IPv6 address is shown in full and labelled IPv6", () => {
    const { text } = buildFlightRequestNotificationEmail({ ...BASE, submission: { ip: { address: "2607:f8b0:4005:80a::200e", version: "v6" } } });
    expect(text).toContain("IP Address: 2607:f8b0:4005:80a::200e");
    expect(text).toContain("IP Version: IPv6");
  });

  test("nothing that was not obtained is shown — no network/ISP/ASN rows are ever invented", () => {
    const { html, text } = buildFlightRequestNotificationEmail({ ...BASE, submission });
    for (const content of [html, text]) {
      expect(content).not.toMatch(/\bASN\b|\bISP\b|Network:|Organi[sz]ation:/);
      expect(content).not.toContain("undefined");
      expect(content).not.toContain("null");
    }
  });

  test("IP only (no location): the IP rows show, location rows and the 'approximate' rows do not", () => {
    const { text } = buildFlightRequestNotificationEmail({ ...BASE, submission: { ip: { address: "198.51.100.9", version: "v4" } } });
    expect(text).toContain("SUBMISSION & IP INFORMATION");
    expect(text).toContain("IP Address: 198.51.100.9");
    expect(text).not.toContain("Approximate Location");
    expect(text).not.toContain("Time Zone");
  });

  test("location only (no IP): no IP rows; the location is still labelled approximate", () => {
    const { text } = buildFlightRequestNotificationEmail({ ...BASE, submission: { location: submission.location, locationSource: submission.locationSource } });
    expect(text).not.toContain("IP Address");
    expect(text).toContain("Approximate Location: San Francisco, California, United States");
    expect(text).toContain(IP_LOCATION_NOTE);
  });

  test("when neither was obtained, the section is a plain 'Submission Details' with no IP wording or disclaimer, and the email still sends content", () => {
    const { html, text } = buildFlightRequestNotificationEmail({ ...BASE, submission: {} });
    expect(text).toContain("SUBMISSION DETAILS");
    expect(text).not.toContain("IP ");
    expect(html).not.toContain("IP Information");
    expect(text).not.toContain(IP_LOCATION_NOTE);
    expect(text).toContain("Submitted:");
  });

  test("the IP is never placed in the subject, and obtained values are HTML-escaped in the body", () => {
    expect(buildFlightRequestNotificationSubject({ ...BASE, submission })).not.toContain("203.0.113");
    const hostile = buildFlightRequestNotificationEmail({ ...BASE, submission: { location: { city: '<img src=x onerror=alert(1)>"&', countryCode: "US" } } });
    expect(hostile.html).not.toContain("<img src=x");
    expect(hostile.html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(hostile.html).not.toMatch(/<[a-z]+[^>]*\sonerror\s*=/i);
  });
});

test.describe("persisting the submission details (what the CRM reads)", () => {
  type UpsertArgs = { where: { leadId: string }; create: Record<string, unknown>; update: Record<string, unknown> };
  const fakeClient = () => {
    const calls: UpsertArgs[] = [];
    return { calls, client: { leadSubmissionInfo: { upsert: async (a: UpsertArgs) => void calls.push(a) } } as unknown as Parameters<typeof saveLeadSubmissionInfo>[0] };
  };
  const info = {
    ip: { address: "203.0.113.42", version: "v4" as const },
    location: { city: "San Francisco", regionCode: "CA", region: "California", country: "United States", countryCode: "US", timeZone: "America/Los_Angeles" },
    locationSource: "Vercel edge geolocation (approximate)",
    capturedAt: new Date("2026-10-04T10:00:00Z"),
  };

  test("stores the full IP, version, location, source, currency and timestamp against the Lead — and nothing else", async () => {
    const { calls, client } = fakeClient();
    expect(await saveLeadSubmissionInfo(client, "lead_1", info, "AUD")).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].where).toEqual({ leadId: "lead_1" });
    expect(calls[0].create).toEqual({
      leadId: "lead_1", ipAddress: "203.0.113.42", ipVersion: "v4", city: "San Francisco", region: "California", country: "United States", countryCode: "US",
      timeZone: "America/Los_Angeles", geoSource: "Vercel edge geolocation (approximate)", budgetCurrency: "AUD", capturedAt: info.capturedAt,
    });
  });

  test("it is an upsert whose update is empty — repeating it for the same Lead (a retry) can never create a second row or overwrite the first", async () => {
    const { calls, client } = fakeClient();
    await saveLeadSubmissionInfo(client, "lead_1", info);
    expect(calls[0].update).toEqual({});
  });

  test("an unknown region is stored as the code as supplied; absent values are stored as absent, not as placeholders", async () => {
    const { calls, client } = fakeClient();
    await saveLeadSubmissionInfo(client, "lead_2", { ip: { address: "198.51.100.9", version: "v4" }, location: { regionCode: "BY", countryCode: "DE" }, capturedAt: new Date() });
    expect(calls[0].create).toMatchObject({ region: "BY", countryCode: "DE", ipAddress: "198.51.100.9" });
    expect(calls[0].create.city).toBeUndefined();
    expect(calls[0].create.timeZone).toBeUndefined();
  });

  test("nothing to store -> no database call", async () => {
    const { calls, client } = fakeClient();
    expect(await saveLeadSubmissionInfo(client, "lead_3", { capturedAt: new Date() })).toBe(false);
    expect(await saveLeadSubmissionInfo(client, "lead_3", undefined)).toBe(false);
    expect(calls).toHaveLength(0);
  });

  test("a budget currency alone (no IP, no location) is still stored", async () => {
    const { calls, client } = fakeClient();
    expect(await saveLeadSubmissionInfo(client, "lead_4", { capturedAt: new Date() }, "EUR")).toBe(true);
    expect(calls[0].create).toMatchObject({ budgetCurrency: "EUR" });
  });
});

test.describe("privacy and boundary guards (structural)", () => {
  const root = path.resolve(__dirname, "..");
  const read = (f: string) => fs.readFileSync(path.join(root, f), "utf8");
  const action = read("src/server/actions/submit-flight-request.ts");

  test("the IP comes from the server's own request headers — the form payload and schema have no IP field", () => {
    expect(read("src/lib/validations/flight-request.ts")).not.toMatch(/\bip(Address)?\b/i);
    expect(read("src/components/flight-form/FlightRequestForm.tsx")).not.toMatch(/ipAddress|clientIp|ipify|api\.ipify|\bfetch\(/i);
    expect(action).toContain("captureSubmissionInfo(headerList)");
  });

  test("no console line in the action ever interpolates the address, location or any customer field", () => {
    // Whole statements (a log call can span several lines), not single lines.
    const statements = action.match(/console\.(?:log|info|warn|error)\([\s\S]*?\);/g) ?? [];
    expect(statements.length).toBeGreaterThan(3);
    for (const statement of statements) {
      expect(statement).not.toMatch(/ip\??\.address|location\??\.(city|region|country|timeZone)|JSON\.stringify\(submissionInfo|\$\{submissionInfo\.(ip|location)\}|data\.(email|phone|firstName|lastName|notes)/);
    }
  });

  test("the submission info is written best-effort through the after() helper, never inside the Lead transaction, and a duplicate skips it", () => {
    const saveIdx = action.indexOf("saveLeadSubmissionInfo(prisma");
    const dupIdx = action.indexOf("if (created.duplicate) return");
    expect(saveIdx).toBeGreaterThan(dupIdx);
    expect(action.lastIndexOf("afterResponse(", saveIdx)).toBeGreaterThan(dupIdx);
    expect(read("src/server/create-website-lead.ts")).not.toContain("LeadSubmissionInfo");
    expect(action.slice(action.indexOf("await createWebsiteLead("), action.indexOf("lap(\"lead\")"))).not.toContain("LeadSubmissionInfo");
  });

  test("the IP modules are server-side only code: nothing in a client component imports them", () => {
    const clientDir = path.join(root, "src/components");
    const stack = [clientDir];
    const offenders: string[] = [];
    while (stack.length) {
      const dir = stack.pop()!;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) stack.push(full);
        else if (/\.(ts|tsx)$/.test(e.name) && /client-ip|ip-geo|submission-info|save-submission-info/.test(fs.readFileSync(full, "utf8"))) offenders.push(path.relative(root, full));
      }
    }
    expect(offenders).toEqual([]);
  });

  test("TRUSTED_PROXY is documented and no provider credential variable exists (no external IP-intelligence service is used)", () => {
    const docs = read("docs/ENVIRONMENT.md") + read(".env.example");
    expect(docs).toContain("TRUSTED_PROXY");
    expect(docs).not.toMatch(/IPINFO|IPAPI|IPGEOLOCATION|MAXMIND|IP_GEO_API/i);
    expect(read("src/lib/ip-geo.ts")).not.toMatch(/https?:\/\/(?!vercel)/);
  });
});
