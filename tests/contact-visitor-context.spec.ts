import { test, expect } from "@playwright/test";
import { captureSubmissionInfo } from "../src/lib/submission-info";
import { createRequestSigner, signRequestV2, canonicalRequestMessage, sha256Hex, VISITOR_CONTEXT_HEADER, VISITOR_SIGNATURE_HEADER, type RequestToSign } from "../src/lib/crm-api/visitor-context";
import { SAMPLE_REQUEST, signedHeaders } from "./support/signing";
import { resolveCrmApiConfig } from "../src/lib/crm-api/config";
import { postContactInquiry, postFlightInquiry } from "../src/lib/crm-api/client";
import { createHash, createHmac } from "node:crypto";

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
type Payload = { v: number; ts: number; nonce?: string; ip?: string; city?: string; region?: string; country?: string; timezone?: string; source?: string };
const decode = (h: Record<string, string>): Payload => JSON.parse(Buffer.from(h[VISITOR_CONTEXT_HEADER], "base64url").toString("utf8"));
const sign = (h: Record<string, string>, nowMs?: number) => signedHeaders(captureSubmissionInfo(headers(h), new Date(nowMs ?? Date.now())).info, SECRET, nowMs);
const cloudflare = () => (process.env.TRUSTED_PROXY = "cloudflare");

/** Signing v2 calculated WITHOUT the website's signer: "CT-WEBSITE-REQUEST-V2" then length-prefixed fields; the CRM's verifier does the same. */
function independentSignature(secret: string, req: RequestToSign, contextHeader: string): string {
  const payload = JSON.parse(Buffer.from(contextHeader, "base64url").toString("utf8")) as { ts: number; nonce: string };
  const bodyHash = createHash("sha256").update(Buffer.from(req.body, "utf8")).digest("hex");
  const fields = [req.method.toUpperCase(), req.path, req.companyId, String(payload.ts), payload.nonce, bodyHash, contextHeader];
  const message = "CT-WEBSITE-REQUEST-V2\n" + fields.map((x) => Buffer.byteLength(x, "utf8") + ":" + x).join("\n");
  return createHmac("sha256", secret).update(message).digest("hex");
}

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
    expect(decode(sign({ "cf-connecting-ip": "fe80::1%eth0" }))).toEqual({ v: 2, ts: expect.any(Number), nonce: expect.any(String) }); // and with nothing else to say, the request is signed but carries no visitor facts
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
    expect(decode(sign(forged))).toEqual({ v: 2, ts: expect.any(Number), nonce: expect.any(String) }); // nothing trustworthy -> signed, but no visitor facts
  });

  test("the signed payload holds exactly what Cloudflare supplied, percent-encodes the city, and names Cloudflare as the source", () => {
    const h = sign({ "cf-connecting-ip": "203.0.113.77", "cf-ipcountry": "AU", "cf-ipcity": "Sydney", "cf-region-code": "NSW", "cf-timezone": "Australia/Sydney" }, 1_800_000_000_000);
    expect(decode(h)).toEqual({ v: 2, ts: 1_800_000_000, nonce: expect.stringMatching(/^[A-Za-z0-9_-]{22}$/), ip: "203.0.113.77", city: "Sydney", region: "NSW", country: "AU", timezone: "Australia/Sydney", source: "cloudflare" });
    expect(h[VISITOR_SIGNATURE_HEADER]).toBe(independentSignature(SECRET, SAMPLE_REQUEST, h[VISITOR_CONTEXT_HEADER])); // the CRM's own calculation, written separately
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

  test("no TRUSTED_PROXY (or 'none'): no IP, no location, no visitor facts in the signed context, whatever the headers say", () => {
    for (const mode of [undefined, "none", "NONE", "bogus"]) {
      if (mode === undefined) delete process.env.TRUSTED_PROXY;
      else process.env.TRUSTED_PROXY = mode;
      const { info, ipUnavailable } = captureSubmissionInfo(headers(spoof));
      expect([info.ip, info.location, info.locationSource], String(mode)).toEqual([undefined, undefined, undefined]);
      expect(ipUnavailable, String(mode)).toBe("no_trusted_proxy");
      const carried = decode(sign(spoof)); // the request is still signed, but it carries no visitor facts at all
      expect(carried, String(mode)).toMatchObject({ v: 2 });
      for (const k of ["ip", "city", "region", "country", "timezone", "source"]) expect(carried, String(mode)).not.toHaveProperty(k);
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
  test("no secret (or an empty one) -> no signer and no headers: nothing is invented; with a secret but no observation the request is still signed, carrying no visitor facts", () => {
    process.env.TRUSTED_PROXY = "cloudflare";
    const info = captureSubmissionInfo(headers({ "cf-connecting-ip": "203.0.113.70", "cf-ipcountry": "AU" })).info;
    expect(createRequestSigner(info, undefined)).toBeUndefined();
    expect(createRequestSigner(info, "")).toBeUndefined();
    expect(signedHeaders(info, undefined)).toEqual({});
    expect(decode(signedHeaders(undefined, SECRET))).toEqual({ v: 2, ts: expect.any(Number), nonce: expect.any(String) });
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

    expect(await postContactInquiry({ config, body, sign: () => visitorHeaders, fetchImpl: respond(200, { ok: true }) })).toEqual({ status: "ok" });
    expect(seen[0].url).toBe("http://crm.test/api/public/contact-inquiry");
    expect(seen[0].headers[VISITOR_CONTEXT_HEADER]).toBe(visitorHeaders[VISITOR_CONTEXT_HEADER]);
    expect(seen[0].headers[VISITOR_SIGNATURE_HEADER]).toBe(visitorHeaders[VISITOR_SIGNATURE_HEADER]);
    expect(Object.values(seen[0].headers).join("")).not.toContain(SECRET);
    expect(Object.keys(seen[0].headers).some((h) => /^(cf-|x-forwarded|x-real-ip|authorization)/i.test(h))).toBe(false);
    expect(seen[0].body).not.toMatch(/203\.0\.113\.71|8\.8\.8\.8|Sydney/);

    // without headers the call is byte-for-byte what it was before this change
    await postContactInquiry({ config, body, fetchImpl: respond(200, { ok: true }) });
    expect(Object.keys(seen[1].headers).sort()).toEqual(["Accept", "Content-Type"]);

    // CRM refusals, rate limits, server errors, an unreadable reply and a time-out are never "ok", and are attempted once
    const calls = seen.length;
    expect(await postContactInquiry({ config, body, sign: () => visitorHeaders, fetchImpl: respond(400, { ok: false }) })).toEqual({ status: "rejected", httpStatus: 400 });
    expect(await postContactInquiry({ config, body, sign: () => visitorHeaders, fetchImpl: respond(401, { ok: false }) })).toMatchObject({ status: "unavailable", reason: "unexpected_status", httpStatus: 401 });
    expect(await postContactInquiry({ config, body, sign: () => visitorHeaders, fetchImpl: respond(429, { ok: false }) })).toEqual({ status: "rate_limited" });
    expect(await postContactInquiry({ config, body, sign: () => visitorHeaders, fetchImpl: respond(500, { ok: false }) })).toMatchObject({ status: "unavailable", reason: "server_error" });
    expect(await postContactInquiry({ config, body, sign: () => visitorHeaders, fetchImpl: respond(200, { unexpected: true }) })).toMatchObject({ status: "unavailable", reason: "bad_response" });
    expect(await postContactInquiry({ config, body, sign: () => visitorHeaders, timeoutMs: 40, fetchImpl: (_u, init) => new Promise((_r, reject) => init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("t"), { name: "TimeoutError" })))) })).toEqual({ status: "unavailable", reason: "timeout" });
    expect(seen.length - calls).toBe(5); // the five that answered were each attempted exactly once
  });
});

test.describe("signing v2: what the signature binds, and that every attempt is signed afresh", () => {
  const VECTOR = {
    secret: "known-answer-secret-0123456789-abcdefghij",
    payload: { v: 2 as const, ts: 1800000000, nonce: "AAAAAAAAAAAAAAAAAAAAAA", ip: "203.0.113.7", country: "AU" },
    body: '{"companyId":"company-1","email":"a@example.test"}',
    context: "eyJ2IjoyLCJ0cyI6MTgwMDAwMDAwMCwibm9uY2UiOiJBQUFBQUFBQUFBQUFBQUFBQUFBQUFBIiwiaXAiOiIyMDMuMC4xMTMuNyIsImNvdW50cnkiOiJBVSJ9",
    bodyHash: "5339ff248c79874aa7f96a7ab5aec083d3e1ac7cbbd3bcbb10f389ff6b14780c",
    signature: "5bafec282f9a6cb99071361647e971dcb3e34659f691528f9b33afd0667ed6d6",
  };
  const REQ: RequestToSign = { method: "POST", path: "/api/public/contact-inquiry", companyId: "company-1", body: '{"companyId":"company-1","email":"a@example.test"}' };

  test("the known-answer vector (the same literal is in the CRM's tests): context, body hash and signature are exactly the pre-computed ones", () => {
    const s = signRequestV2({ secret: VECTOR.secret, method: REQ.method, path: REQ.path, companyId: REQ.companyId, body: VECTOR.body, payload: VECTOR.payload });
    expect(s.context).toBe(VECTOR.context);
    expect(sha256Hex(VECTOR.body)).toBe(VECTOR.bodyHash);
    expect(s.signature).toBe(VECTOR.signature);
  });

  test("the canonical message is length-prefixed, upper-cases only the method, and measures UTF-8 bytes", () => {
    const base = { method: "POST", ts: 1, nonce: "n".repeat(22), bodySha256: "0".repeat(64), context: "ctx" };
    expect(canonicalRequestMessage({ ...base, path: "/a", companyId: "bc" })).not.toBe(canonicalRequestMessage({ ...base, path: "/ab", companyId: "c" }));
    expect(canonicalRequestMessage({ ...base, method: "post", path: "/é", companyId: "C" })).toContain("4:POST\n3:/é\n1:C");
  });

  const sig = (info: Parameters<typeof signedHeaders>[0], req: RequestToSign, nowMs = 1_800_000_000_000) => signedHeaders(info, SECRET, nowMs, req);

  test("the signature binds the method, the path, the company and the exact body bytes: changing any one of them changes it", () => {
    const base = sig(undefined, REQ);
    // Same nonce is impossible across calls, so compare what each is bound to by recomputing independently over the SAME context:
    const context = base[VISITOR_CONTEXT_HEADER];
    const want = (req: RequestToSign) => independentSignature(SECRET, req, context);
    expect(base[VISITOR_SIGNATURE_HEADER]).toBe(want(REQ));
    for (const changed of [{ ...REQ, method: "PUT" }, { ...REQ, path: "/api/public/subscribe" }, { ...REQ, companyId: "company-2" }, { ...REQ, body: REQ.body + " " }, { ...REQ, body: REQ.body.replace("a@", "b@") }]) {
      expect(want(changed)).not.toBe(base[VISITOR_SIGNATURE_HEADER]);
    }
  });

  test("every call is signed afresh: a new nonce each time, the secret is never in a header, and the same request signed twice differs", () => {
    const a = sig(undefined, REQ);
    const b = sig(undefined, REQ);
    expect(decode(a).nonce).not.toBe(decode(b).nonce);
    expect(a[VISITOR_SIGNATURE_HEADER]).not.toBe(b[VISITOR_SIGNATURE_HEADER]);
    expect(Object.values(a).join("")).not.toContain(SECRET);
  });

  test("the nonces are 128-bit random values (22 URL-safe characters) and never repeat", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) seen.add(String(decode(sig(undefined, REQ)).nonce));
    expect(seen.size).toBe(2000);
    for (const n of seen) expect(n).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  test("a flight retry re-signs EVERY attempt (fresh nonce and timestamp) with the SAME Idempotency-Key and the SAME body bytes", async () => {
    const seen: Array<{ headers: Record<string, string>; body: string }> = [];
    let n = 0;
    const fetchImpl = async (_url: string, init: RequestInit) => {
      seen.push({ headers: init.headers as Record<string, string>, body: String(init.body) });
      n++;
      return n < 3 ? new Response("{}", { status: 503 }) : new Response(JSON.stringify({ ok: true, leadId: "c" + "0".repeat(24), duplicate: false }), { status: 201 });
    };
    const signer = createRequestSigner(undefined, SECRET);
    const out = await postFlightInquiry({
      config: { baseUrl: "http://crm.test", apiKey: "k".repeat(40), companyId: "company-1" },
      body: { firstName: "A" },
      idempotencyKey: "retry-key-0123456789",
      sign: signer,
      fetchImpl,
      sleep: async () => undefined,
    });
    expect(out).toMatchObject({ status: "created", attempts: 3 });
    expect(seen).toHaveLength(3);
    expect(new Set(seen.map((s) => decode(s.headers).nonce)).size).toBe(3); // three different nonces
    expect(new Set(seen.map((s) => s.headers["Idempotency-Key"])).size).toBe(1); // one key
    expect(new Set(seen.map((s) => s.body)).size).toBe(1); // byte-identical body
    for (const s of seen) expect(s.headers[VISITOR_SIGNATURE_HEADER]).toBe(independentSignature(SECRET, { method: "POST", path: "/api/v1/website/flight-inquiries", companyId: "company-1", body: s.body }, s.headers[VISITOR_CONTEXT_HEADER]));
  });

  test("the flight call is bound to the company and path it was made for; a contact call to its own", async () => {
    const seen: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
    const fetchImpl = async (url: string, init: RequestInit) => {
      seen.push({ url, headers: init.headers as Record<string, string>, body: String(init.body) });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };
    const signer = createRequestSigner(undefined, SECRET);
    await postContactInquiry({ config: { baseUrl: "http://crm.test", companyId: "company-9" }, body: { firstName: "A", lastName: "B", email: "a@example.org", phone: "+14155552671", subject: "OTHER", message: "A sufficiently long message." }, sign: signer, fetchImpl });
    const c = seen[0];
    expect(c.url).toBe("http://crm.test/api/public/contact-inquiry");
    expect(c.headers[VISITOR_SIGNATURE_HEADER]).toBe(independentSignature(SECRET, { method: "POST", path: "/api/public/contact-inquiry", companyId: "company-9", body: c.body }, c.headers[VISITOR_CONTEXT_HEADER]));
    expect(JSON.parse(c.body).companyId).toBe("company-9"); // the company that is signed is the company in the body the CRM will read
  });

  test("flight requests need CRM_COMPANY_ID once a secret is configured (the signature binds the company); a missing one is reported by name, never by value", () => {
    const env = { CRM_API_URL: "http://compass-crm:3000", CRM_API_KEY: "k".repeat(40), LEAD_INGEST_SECRET: SECRET };
    const missing = resolveCrmApiConfig(env, "flight-inquiry");
    expect(missing.ok).toBe(false);
    expect(!missing.ok && missing.problems.join(" ")).toContain("CRM_COMPANY_ID is not set");
    expect(!missing.ok && missing.problems.join(" ")).not.toContain(SECRET);
    const ok = resolveCrmApiConfig({ ...env, CRM_COMPANY_ID: "co-1" }, "flight-inquiry");
    expect(ok.ok && ok.config.companyId).toBe("co-1");
    // without a secret nothing is signed, so the flight call still needs no company id
    expect(resolveCrmApiConfig({ CRM_API_URL: env.CRM_API_URL, CRM_API_KEY: env.CRM_API_KEY }, "flight-inquiry").ok).toBe(true);
  });
});
