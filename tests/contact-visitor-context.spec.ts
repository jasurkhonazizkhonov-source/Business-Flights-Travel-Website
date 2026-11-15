import { test, expect } from "@playwright/test";
import { captureSubmissionInfo } from "../src/lib/submission-info";
import { buildVisitorContextHeaders, VISITOR_CONTEXT_HEADER, VISITOR_SIGNATURE_HEADER } from "../src/lib/crm-api/visitor-context";
import { resolveCrmApiConfig } from "../src/lib/crm-api/config";
import { postContactInquiry } from "../src/lib/crm-api/client";
import { createHmac } from "node:crypto";

// The contact inquiry carries the visitor's IP and approximate location to the CRM as a SIGNED context (the CRM only sees this website's server).
// These tests pin the whole chain without a network: what is trusted (Cloudflare's headers only when TRUSTED_PROXY says the origin is reachable only
// through Cloudflare), what is rejected, the exact signed payload, the secret handling and the contact call's headers. The end-to-end behaviour
// through a real server and the stand-in CRM is in crm-api-actions-e2e.spec.ts.

const SECRET = "unit-test-ingest-secret-0123456789abcdef-xyz"; // throwaway
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

const headers = (h: Record<string, string>) => new Headers(h);
type Payload = { v: number; ts: number; ip?: string; city?: string; region?: string; country?: string; timezone?: string; source?: string };
const decode = (h: Record<string, string>): Payload => JSON.parse(Buffer.from(h[VISITOR_CONTEXT_HEADER], "base64url").toString("utf8"));
const sign = (h: Record<string, string>, nowMs?: number) => buildVisitorContextHeaders(captureSubmissionInfo(headers(h), new Date(nowMs ?? Date.now())).info, SECRET, nowMs);
const cloudflare = () => (process.env.TRUSTED_PROXY = "cloudflare");

test.describe("IP capture behind Cloudflare (TRUSTED_PROXY=cloudflare)", () => {
  test.beforeEach(cloudflare);

  test("a valid IPv4 is captured whole", () => {
    expect(decode(sign({ "cf-connecting-ip": "203.0.113.77" })).ip).toBe("203.0.113.77");
    expect(captureSubmissionInfo(headers({ "cf-connecting-ip": "8.8.8.8" })).info.ip).toEqual({ address: "8.8.8.8", version: "v4" });
  });

  test("IPv6 is captured whole: full, compressed and upper-case forms become one canonical address; the version is v6", () => {
    for (const raw of ["2001:4860:4860:0:0:0:0:8888", "2001:4860:4860:0000:0000:0000:0000:8888", "2001:4860:4860::8888", "2001:4860:4860::8888".toUpperCase()]) {
      expect(captureSubmissionInfo(headers({ "cf-connecting-ip": raw })).info.ip, raw).toEqual({ address: "2001:4860:4860::8888", version: "v6" });
    }
    const longest = "2a00:1450:4001:081b:0123:4567:89ab:cdef"; // 39 characters, no compression possible
    expect(longest).toHaveLength(39);
    expect(captureSubmissionInfo(headers({ "cf-connecting-ip": longest })).info.ip?.address).toBe("2a00:1450:4001:81b:123:4567:89ab:cdef");
    expect(decode(sign({ "cf-connecting-ip": "[2001:4860:4860::8888]:443" })).ip).toBe("2001:4860:4860::8888"); // bracket and port syntax
    expect(captureSubmissionInfo(headers({ "cf-connecting-ip": "fe80::1%eth0" })).info.ip).toBeUndefined(); // link-local with a zone id is not a visitor address
    expect(sign({ "cf-connecting-ip": "fe80::1%eth0" })).toEqual({}); // and with nothing else to say, nothing is signed
  });

  test("IPv4-mapped IPv6 becomes the plain IPv4 address; the Pseudo-IPv4 stand-in is replaced by the real IPv6 header", () => {
    expect(captureSubmissionInfo(headers({ "cf-connecting-ip": "::ffff:203.0.113.9" })).info.ip).toEqual({ address: "203.0.113.9", version: "v4" });
    expect(captureSubmissionInfo(headers({ "cf-connecting-ip": "240.1.2.3", "cf-connecting-ipv6": "2606:4700:4700::1111" })).info.ip?.address).toBe("2606:4700:4700::1111");
    // the IPv6 header is consulted ONLY for a stand-in: a usable CF-Connecting-IP always wins, so it cannot be used to override it
    expect(captureSubmissionInfo(headers({ "cf-connecting-ip": "203.0.113.9", "cf-connecting-ipv6": "2606:4700:4700::1111" })).info.ip?.address).toBe("203.0.113.9");
  });

  test("an invalid, private, loopback, link-local, documentation-v6 or empty value is 'unavailable', never stored, never replaced", () => {
    for (const bad of ["", "   ", "not-an-ip", "999.1.1.1", "1.2.3", "1.2.3.4.5", "10.1.2.3", "172.16.0.1", "192.168.1.1", "127.0.0.1", "169.254.1.1", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "::", "fe80::1", "fd00::1", "2001:db8::1", "zz::1", "2001:4860:4860::8888::1"]) {
      const { info, ipUnavailable } = captureSubmissionInfo(headers({ "cf-connecting-ip": bad }));
      expect(info.ip, JSON.stringify(bad)).toBeUndefined();
      expect(ipUnavailable, JSON.stringify(bad)).toBeTruthy();
    }
    expect(captureSubmissionInfo(headers({})).ipUnavailable).toBe("no_header"); // missing header: a value-free reason, nothing invented
  });

  test("forwarding headers are not believed in this mode: a forged X-Forwarded-For / X-Real-IP / Forwarded never becomes the IP", () => {
    const forged = { "x-forwarded-for": "8.8.8.8", "x-real-ip": "8.8.4.4", forwarded: "for=1.1.1.1", "x-vercel-forwarded-for": "9.9.9.9", "true-client-ip": "4.4.4.4" };
    expect(captureSubmissionInfo(headers(forged)).info.ip).toBeUndefined();
    expect(captureSubmissionInfo(headers({ ...forged, "cf-connecting-ip": "203.0.113.50" })).info.ip?.address).toBe("203.0.113.50");
    expect(sign(forged)).toEqual({}); // nothing trustworthy -> nothing signed
  });

  test("the signed payload holds exactly what Cloudflare supplied, percent-encodes the city, and names Cloudflare as the source", () => {
    const h = sign({ "cf-connecting-ip": "203.0.113.77", "cf-ipcountry": "AU", "cf-ipcity": "Sydney", "cf-region-code": "NSW", "cf-timezone": "Australia/Sydney" }, 1_800_000_000_000);
    expect(decode(h)).toEqual({ v: 1, ts: 1_800_000_000, ip: "203.0.113.77", city: "Sydney", region: "NSW", country: "AU", timezone: "Australia/Sydney", source: "cloudflare" });
    expect(h[VISITOR_SIGNATURE_HEADER]).toBe(createHmac("sha256", SECRET).update(h[VISITOR_CONTEXT_HEADER]).digest("hex")); // the CRM's own check
    const accented = decode(sign({ "cf-connecting-ip": "203.0.113.78", "cf-ipcountry": "BR", "cf-ipcity": Buffer.from("São Paulo", "utf8").toString("latin1") }));
    expect(decodeURIComponent(accented.city!)).toBe("São Paulo");
  });

  test("partial, missing and 'unknown' geolocation: only real parts are sent; the IP survives; no location -> no source", () => {
    const partial = decode(sign({ "cf-connecting-ip": "203.0.113.60", "cf-ipcountry": "GB" }));
    expect(partial).toMatchObject({ ip: "203.0.113.60", country: "GB", source: "cloudflare" });
    expect([partial.city, partial.region, partial.timezone]).toEqual([undefined, undefined, undefined]);
    const noGeo = decode(sign({ "cf-connecting-ip": "203.0.113.61" }));
    expect(noGeo.ip).toBe("203.0.113.61");
    expect([noGeo.city, noGeo.region, noGeo.country, noGeo.timezone, noGeo.source]).toEqual([undefined, undefined, undefined, undefined, undefined]);
    for (const marker of ["XX", "T1", "xx", "", "USA", "1"]) expect(decode(sign({ "cf-connecting-ip": "203.0.113.62", "cf-ipcountry": marker })).country, marker).toBeUndefined();
    // location without a usable IP is still sent (the IP is simply missing)
    const geoOnly = decode(sign({ "cf-ipcountry": "DE", "cf-ipcity": "Berlin" }));
    expect(geoOnly).toMatchObject({ country: "DE", city: "Berlin", source: "cloudflare" });
    expect(geoOnly.ip).toBeUndefined();
    // IP-derived coordinates are never part of the signed payload
    expect(JSON.stringify(decode(sign({ "cf-connecting-ip": "203.0.113.63", "cf-iplatitude": "37.77", "cf-iplongitude": "-122.41" })))).not.toMatch(/lat|lon|37\.77|122\.41/i);
  });

  test("hostile geolocation values are dropped or bounded; the worst-case context stays far below the CRM's 2,048-byte limit", () => {
    expect(decode(sign({ "cf-connecting-ip": "203.0.113.64", "cf-ipcity": "x".repeat(81) })).city).toBeUndefined(); // over 80 characters
    expect(decode(sign({ "cf-connecting-ip": "203.0.113.65", "cf-ipcity": "<script>alert(1)</script>" })).city).toBe(encodeURIComponent("<script>alert(1)</script>")); // data, percent-encoded, never markup
    const worst = sign({ "cf-connecting-ip": "2a00:1450:4001:081b:0123:4567:89ab:cdef", "cf-ipcountry": "JP", "cf-ipcity": Buffer.from("東".repeat(80), "utf8").toString("latin1"), "cf-region-code": "ABCD", "cf-timezone": "America/Argentina/ComodRivadavia" });
    expect(worst[VISITOR_CONTEXT_HEADER].length).toBeLessThan(2048);
  });
});

test.describe("an untrusted request path yields nothing", () => {
  const spoof = { "cf-connecting-ip": "203.0.113.99", "cf-ipcountry": "AU", "cf-ipcity": "Sydney", "x-forwarded-for": "8.8.8.8", "x-vercel-ip-country": "US", "x-vercel-forwarded-for": "9.9.9.9" };

  test("no TRUSTED_PROXY (or 'none'): no IP, no location, nothing signed, whatever the headers say", () => {
    for (const mode of [undefined, "none", "NONE", "bogus"]) {
      if (mode === undefined) delete process.env.TRUSTED_PROXY;
      else process.env.TRUSTED_PROXY = mode;
      const { info, ipUnavailable } = captureSubmissionInfo(headers(spoof));
      expect([info.ip, info.location, info.locationSource], String(mode)).toEqual([undefined, undefined, undefined]);
      expect(ipUnavailable, String(mode)).toBe("no_trusted_proxy");
      expect(sign(spoof), String(mode)).toEqual({});
    }
  });

  test("a generic proxy trusts forwarding headers but never Cloudflare's or Vercel's geolocation headers (a client could send those)", () => {
    process.env.TRUSTED_PROXY = "generic";
    const { info } = captureSubmissionInfo(headers(spoof));
    expect(info.ip?.address).toBe("8.8.8.8");
    expect(info.location).toBeUndefined();
  });

  test("Cloudflare's headers are not read when the trusted proxy is Vercel, and the Vercel source is named correctly", () => {
    process.env.TRUSTED_PROXY = "vercel";
    expect(captureSubmissionInfo(headers({ "cf-connecting-ip": "203.0.113.99", "cf-ipcountry": "AU" })).info.location).toBeUndefined();
    const h = sign({ "x-vercel-forwarded-for": "203.0.113.98", "x-vercel-ip-country": "CA", "x-vercel-ip-city": "Toronto" });
    expect(decode(h)).toMatchObject({ ip: "203.0.113.98", country: "CA", city: "Toronto", source: "vercel" });
  });
});

test.describe("the secret and the contact call", () => {
  test("no secret (or a missing/short one) -> no headers: the inquiry is still sent, unsigned context is never invented", () => {
    process.env.TRUSTED_PROXY = "cloudflare";
    const info = captureSubmissionInfo(headers({ "cf-connecting-ip": "203.0.113.70", "cf-ipcountry": "AU" })).info;
    expect(buildVisitorContextHeaders(info, undefined)).toEqual({});
    expect(buildVisitorContextHeaders(info, "")).toEqual({});
    expect(buildVisitorContextHeaders(undefined, SECRET)).toEqual({});
  });

  test("the secret now reaches the CONTACT call's configuration (it used to be dropped for everything but the flight request); a short secret is refused with a warning", () => {
    const base = { CRM_API_URL: "http://compass-crm:3000", CRM_COMPANY_ID: "co-1", CRM_API_KEY: "k".repeat(40) };
    const ok = resolveCrmApiConfig({ ...base, LEAD_INGEST_SECRET: SECRET }, "public-inquiry");
    expect(ok.ok && ok.config.ingestSecret).toBe(SECRET);
    const flight = resolveCrmApiConfig({ ...base, LEAD_INGEST_SECRET: SECRET }, "flight-inquiry");
    expect(flight.ok && flight.config.ingestSecret).toBe(SECRET);
    const short = resolveCrmApiConfig({ ...base, LEAD_INGEST_SECRET: "too-short" }, "public-inquiry");
    expect(short.ok && short.config.ingestSecret).toBeUndefined();
    expect(short.ok && short.warnings.join(" ")).toMatch(/LEAD_INGEST_SECRET is shorter than 32 characters/);
    expect(short.ok && short.warnings.join(" ")).not.toContain("too-short"); // the value is never echoed
    const none = resolveCrmApiConfig(base, "public-inquiry");
    expect(none.ok && none.config.ingestSecret).toBeUndefined();
  });

  test("postContactInquiry sends the signed headers with the request and nothing else about the visitor; a failure is not reported as success", async () => {
    process.env.TRUSTED_PROXY = "cloudflare";
    const visitorHeaders = sign({ "cf-connecting-ip": "203.0.113.71", "cf-ipcountry": "AU", "cf-ipcity": "Sydney", "x-forwarded-for": "8.8.8.8" });
    const seen: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
    const respond = (status: number, body: unknown) => async (url: string, init?: RequestInit) => {
      seen.push({ url, headers: init?.headers as Record<string, string>, body: String(init?.body) });
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    };
    const config = { baseUrl: "http://crm.test", companyId: "co-1" };
    const body = { firstName: "A", lastName: "B", email: "a@example.org", phone: "+14155552671", subject: "OTHER", message: "A sufficiently long message." };

    expect(await postContactInquiry({ config, body, visitorHeaders, fetchImpl: respond(200, { ok: true }) })).toEqual({ status: "ok" });
    expect(seen[0].url).toBe("http://crm.test/api/public/contact-inquiry");
    expect(seen[0].headers[VISITOR_CONTEXT_HEADER]).toBe(visitorHeaders[VISITOR_CONTEXT_HEADER]);
    expect(seen[0].headers[VISITOR_SIGNATURE_HEADER]).toBe(visitorHeaders[VISITOR_SIGNATURE_HEADER]);
    expect(Object.keys(seen[0].headers).some((h) => /^(cf-|x-forwarded|x-real-ip|authorization)/i.test(h))).toBe(false);
    expect(seen[0].body).not.toMatch(/203\.0\.113\.71|8\.8\.8\.8|Sydney/);

    // without headers the call is byte-for-byte what it was before this change
    await postContactInquiry({ config, body, fetchImpl: respond(200, { ok: true }) });
    expect(Object.keys(seen[1].headers).sort()).toEqual(["Accept", "Content-Type"]);

    // CRM refusals, rate limits, server errors, an unreadable reply and a time-out are never "ok", and are attempted once
    const calls = seen.length;
    expect(await postContactInquiry({ config, body, visitorHeaders, fetchImpl: respond(400, { ok: false }) })).toEqual({ status: "rejected", httpStatus: 400 });
    expect(await postContactInquiry({ config, body, visitorHeaders, fetchImpl: respond(401, { ok: false }) })).toMatchObject({ status: "unavailable", reason: "unexpected_status", httpStatus: 401 });
    expect(await postContactInquiry({ config, body, visitorHeaders, fetchImpl: respond(429, { ok: false }) })).toEqual({ status: "rate_limited" });
    expect(await postContactInquiry({ config, body, visitorHeaders, fetchImpl: respond(500, { ok: false }) })).toMatchObject({ status: "unavailable", reason: "server_error" });
    expect(await postContactInquiry({ config, body, visitorHeaders, fetchImpl: respond(200, { unexpected: true }) })).toMatchObject({ status: "unavailable", reason: "bad_response" });
    expect(await postContactInquiry({ config, body, visitorHeaders, timeoutMs: 40, fetchImpl: (_u, init) => new Promise((_r, reject) => init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("t"), { name: "TimeoutError" })))) })).toEqual({ status: "unavailable", reason: "timeout" });
    expect(seen.length - calls).toBe(5); // the five that answered were each attempted exactly once
  });
});
