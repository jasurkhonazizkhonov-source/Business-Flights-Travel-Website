import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { effectiveProxyMode, edgeProofAccepted, resolveClientIp, EDGE_PROOF_HEADER, MIN_EDGE_PROOF_SECRET_LENGTH } from "../src/lib/client-ip";
import { captureSubmissionInfo } from "../src/lib/submission-info";
import { readVisitorHint } from "../src/lib/visitor-hint";
import { standaloneBuildPresent, startStandalone, type StandaloneServer } from "./support/standalone-server";
import { startStubCrm, type StubCrm } from "./support/stub-crm";

// The OPTIONAL edge proof (EDGE_PROOF_SECRET). TRUSTED_PROXY=cloudflare is a statement about the NETWORK ("only Cloudflare reaches the origin"); the proof makes
// the headers themselves prove it, so a container that can reach the origin directly (for example one on the tunnel's Docker network) cannot forge
// CF-Connecting-IP or CF-IPCountry. Off when the variable is unset: every behaviour that existed before is unchanged (the first group below pins that).
const SECRET = "edge-proof-" + "0123456789abcdef".repeat(2); // throwaway test value, 43 characters
const REAL = "203.0.113.77";
const forged = (extra: Record<string, string> = {}) => new Headers({ "CF-Connecting-IP": REAL, "CF-IPCountry": "FR", "CF-IPCity": "Paris", "X-Forwarded-For": "8.8.8.8", "X-Real-IP": "8.8.4.4", ...extra });

function withEnv<T>(env: Record<string, string | undefined>, fn: () => T): T {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(env)) saved[key] = process.env[key];
  try {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    return fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test.describe("edge proof off (no EDGE_PROOF_SECRET): behaviour is exactly what it was", () => {
  test("cloudflare mode believes CF-Connecting-IP and ignores every other forwarded header", () => {
    withEnv({ TRUSTED_PROXY: "cloudflare", EDGE_PROOF_SECRET: undefined }, () => {
      expect(resolveClientIp(forged())).toEqual({ ok: true, address: REAL, version: "v4" });
      expect(effectiveProxyMode(forged())).toBe("cloudflare");
      expect(edgeProofAccepted(forged())).toBe(true);
    });
  });
  test("an empty or blank secret means off, not 'require an empty proof'", () => {
    for (const blank of ["", "   "]) {
      withEnv({ TRUSTED_PROXY: "cloudflare", EDGE_PROOF_SECRET: blank }, () => {
        expect(resolveClientIp(forged()).ok).toBe(true);
      });
    }
  });
  test("with no trusted proxy configured nothing is believed, whatever is sent", () => {
    withEnv({ TRUSTED_PROXY: "none", EDGE_PROOF_SECRET: undefined }, () => {
      expect(resolveClientIp(forged())).toEqual({ ok: false, reason: "no_trusted_proxy" });
      expect(captureSubmissionInfo(forged()).info.location).toBeUndefined();
    });
  });
});

test.describe("edge proof on: only a request that carries the secret is believed", () => {
  const on = (fn: () => void) => withEnv({ TRUSTED_PROXY: "cloudflare", EDGE_PROOF_SECRET: SECRET }, fn);

  test("a request without the proof is a direct caller: the forged IP, country and city are all ignored", () => {
    on(() => {
      expect(resolveClientIp(forged())).toEqual({ ok: false, reason: "edge_not_proven" });
      expect(effectiveProxyMode(forged())).toBe("none");
      const { info, ipUnavailable } = captureSubmissionInfo(forged());
      expect(info.ip).toBeUndefined();
      expect(info.location).toBeUndefined();
      expect(ipUnavailable).toBe("edge_not_proven");
      expect(readVisitorHint(forged())).toEqual({});
    });
  });

  test("a wrong proof is refused exactly like a missing one (including near-misses, case changes, a prefix and a longer value)", () => {
    on(() => {
      for (const wrong of ["", "x", SECRET.toUpperCase(), SECRET.slice(0, -1), SECRET + "x", ` ${SECRET.slice(1)}`, "edge-proof-" + "0".repeat(32)]) {
        const headers = forged({ [EDGE_PROOF_HEADER]: wrong });
        expect(resolveClientIp(headers).ok, JSON.stringify(wrong)).toBe(false);
        expect(edgeProofAccepted(headers), JSON.stringify(wrong)).toBe(false);
      }
    });
  });

  test("the right proof restores exactly the trusted-Cloudflare behaviour: the real IP and the edge's own country and city, never the other forwarded headers", () => {
    on(() => {
      const headers = forged({ [EDGE_PROOF_HEADER]: SECRET });
      expect(resolveClientIp(headers)).toEqual({ ok: true, address: REAL, version: "v4" });
      const { info } = captureSubmissionInfo(headers);
      expect(info.ip?.address).toBe(REAL);
      expect(info.location).toMatchObject({ countryCode: "FR", city: "Paris" });
      expect(readVisitorHint(headers)).toEqual({ countryCode: "FR" });
    });
  });

  test("a secret that is set but shorter than the minimum fails CLOSED, even for a request that presents it", () => {
    const short = "x".repeat(MIN_EDGE_PROOF_SECRET_LENGTH - 1);
    withEnv({ TRUSTED_PROXY: "cloudflare", EDGE_PROOF_SECRET: short }, () => {
      const headers = forged({ [EDGE_PROOF_HEADER]: short });
      expect(edgeProofAccepted(headers)).toBe(false);
      expect(resolveClientIp(headers).ok).toBe(false);
    });
    withEnv({ TRUSTED_PROXY: "cloudflare", EDGE_PROOF_SECRET: "x".repeat(MIN_EDGE_PROOF_SECRET_LENGTH) }, () => {
      expect(resolveClientIp(forged({ [EDGE_PROOF_HEADER]: "x".repeat(MIN_EDGE_PROOF_SECRET_LENGTH) })).ok).toBe(true);
    });
  });

  test("the proof vouches for the SOURCE, not the content: a proven request with a bad, private, multiple or malformed address still yields no client IP", () => {
    on(() => {
      const proven = (ip: string, extra: Record<string, string> = {}) => new Headers({ "CF-Connecting-IP": ip, [EDGE_PROOF_HEADER]: SECRET, ...extra });
      expect(resolveClientIp(proven("203.0.113.5, 198.51.100.1"))).toEqual({ ok: false, reason: "invalid" }); // two values: never "the first one"
      expect(resolveClientIp(proven("10.0.0.7"))).toEqual({ ok: false, reason: "private_or_reserved" });
      expect(resolveClientIp(proven("not-an-ip"))).toEqual({ ok: false, reason: "invalid" });
      expect(resolveClientIp(proven("203.0.113.5 junk"))).toEqual({ ok: false, reason: "invalid" }); // (a NUL byte cannot even be put in a header)
      expect(resolveClientIp(proven("2001:4860:4860::8888"))).toMatchObject({ ok: true, version: "v6" });
      expect(resolveClientIp(proven("::ffff:203.0.113.9"))).toEqual({ ok: true, address: "203.0.113.9", version: "v4" }); // one real client, one string
      // Cloudflare's Class E stand-in: the real IPv6 is read from CF-Connecting-IPv6 only in that exact case (and only with the proof)
      expect(resolveClientIp(proven("240.1.2.3", { "CF-Connecting-IPv6": "2001:4860:4860::8844" }))).toMatchObject({ ok: true, address: "2001:4860:4860::8844" });
      expect(resolveClientIp(new Headers({ "CF-Connecting-IP": "240.1.2.3", "CF-Connecting-IPv6": "2001:4860:4860::8844" })).ok).toBe(false); // no proof: not believed
    });
  });

  test("a repeated or reflected proof header is not accepted, and no other forwarded header can stand in for it", () => {
    on(() => {
      // two copies of the header are joined by the platform as "a, a": that is not the secret
      expect(edgeProofAccepted(forged({ [EDGE_PROOF_HEADER]: `${SECRET}, ${SECRET}` }))).toBe(false);
      for (const name of ["x-forwarded-for", "x-real-ip", "forwarded", "x-edge-proof", "cf-ray", "cf-visitor", "authorization"]) {
        expect(edgeProofAccepted(forged({ [name]: SECRET })), name).toBe(false);
      }
    });
  });

  test("the proof is only about the Cloudflare mode: a Vercel or unset deployment is not changed by it", () => {
    withEnv({ TRUSTED_PROXY: "none", EDGE_PROOF_SECRET: SECRET }, () => {
      expect(resolveClientIp(forged({ [EDGE_PROOF_HEADER]: SECRET }))).toEqual({ ok: false, reason: "no_trusted_proxy" });
    });
    withEnv({ TRUSTED_PROXY: "vercel", EDGE_PROOF_SECRET: SECRET }, () => {
      expect(effectiveProxyMode(new Headers({ "x-vercel-forwarded-for": REAL }))).toBe("vercel");
    });
  });

  test("the secret is never part of a result or a reason", () => {
    on(() => {
      for (const headers of [forged(), forged({ [EDGE_PROOF_HEADER]: SECRET })]) {
        expect(JSON.stringify(resolveClientIp(headers))).not.toContain(SECRET);
        expect(JSON.stringify(captureSubmissionInfo(headers))).not.toContain(SECRET);
      }
    });
  });
});

// ---- on a real production server --------------------------------------------------------------------------------------------------------------------------
const PORT = 3263;
const KEY = "sentinel-api-key-" + "0123456789abcdef".repeat(3);
const INGEST = "sentinel-ingest-" + "fedcba9876543210".repeat(3);
const COMPANY = "test-company";
const futureDate = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const JFK = { iata: "JFK", city: "New York", country: "United States", name: "John F. Kennedy International Airport" };
const CDG = { iata: "CDG", city: "Paris", country: "France", name: "Paris Charles de Gaulle Airport" };

test.describe.configure({ mode: "serial" });
test.describe("a real production server with the edge proof on (stub CRM)", () => {
  test.skip(!standaloneBuildPresent(), "needs a standalone build (NEXT_OUTPUT=standalone npm run build)");
  test.setTimeout(120_000);
  let crm: StubCrm;
  let server: StandaloneServer;
  let actionId = "";

  test.beforeAll(async () => {
    crm = await startStubCrm({ apiKey: KEY, companyId: COMPANY, ingestSecret: INGEST });
    server = await startStandalone({
      label: "edge proof e2e",
      port: PORT,
      env: { TRUSTED_PROXY: "cloudflare", EDGE_PROOF_SECRET: SECRET, CRM_API_URL: crm.url, CRM_API_KEY: KEY, CRM_COMPANY_ID: COMPANY, LEAD_INGEST_SECRET: INGEST },
    });
    const manifest = JSON.parse(readFileSync(path.join(server.layout, ".next", "server", "server-reference-manifest.json"), "utf8")) as { node: Record<string, { exportedName: string }> };
    actionId = Object.entries(manifest.node).find(([, v]) => v.exportedName === "submitFlightRequest")?.[0] ?? "";
    expect(actionId).toBeTruthy();
  });
  test.beforeEach(() => {
    server.assertAlive();
    crm.reset();
  });
  test.afterAll(async () => {
    await server?.stop();
    await crm?.close();
  });

  const hint = async (headers: Record<string, string>) => (await fetch(`${server.origin}/api/visitor-hint`, { headers })).json() as Promise<Record<string, unknown>>;
  const submit = async (headers: Record<string, string>) => {
    const input = {
      tripType: "ONE_WAY", segments: [{ from: JFK, to: CDG, departureDate: futureDate(30) }], cabinClass: "BUSINESS", adults: 1, children: 0, infants: 0, dateFlexibilityDays: 1,
      firstName: "Edge", lastName: "Proof", email: "edge.proof@example.org", phone: "+14155552671", website: "", renderedAt: Date.now() - 10_000, submissionId: randomUUID(),
    };
    const res = await fetch(`${server.origin}/`, {
      method: "POST",
      headers: { "Next-Action": actionId, "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component", ...headers },
      body: JSON.stringify([input]),
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/"ok":true/);
    expect(crm.requests).toHaveLength(1);
    return crm.requests[0];
  };
  let n = 100;
  const cf = (extra: Record<string, string> = {}) => ({ "CF-Connecting-IP": `198.51.100.${n++}`, "CF-IPCountry": "FR", "CF-IPCity": "Paris", "X-Forwarded-For": "8.8.8.8", ...extra });

  test("the hint: forged Cloudflare headers without the proof tell the server nothing; with the proof they are the edge's word", async () => {
    expect(await hint(cf())).not.toHaveProperty("countryCode");
    expect(await hint(cf({ [EDGE_PROOF_HEADER]: "wrong-" + SECRET }))).not.toHaveProperty("countryCode");
    expect(await hint(cf({ [EDGE_PROOF_HEADER]: SECRET }))).toEqual({ countryCode: "FR" });
  });

  test("a form submission: a direct caller's forged IP and location never reach the CRM; the same request with the proof reaches it as the signed, verified context", async () => {
    const direct = await submit(cf({ "CF-Connecting-IP": "203.0.113.200" }));
    expect(direct.visitor?.ip).not.toBe("203.0.113.200");
    expect(direct.visitor?.city).toBeUndefined();
    expect(direct.visitor?.country).toBeUndefined();
    crm.reset();
    const proven = await submit(cf({ "CF-Connecting-IP": "203.0.113.201", [EDGE_PROOF_HEADER]: SECRET }));
    expect(proven.visitor).toMatchObject({ state: "verified", ip: "203.0.113.201", country: "FR", city: "Paris" });
  });

  test("the secret is never reflected: not in any response body or header of the public routes, whether or not the request carries it", async () => {
    for (const headers of [cf(), cf({ [EDGE_PROOF_HEADER]: SECRET }), cf({ [EDGE_PROOF_HEADER]: "wrong-" + SECRET })]) {
      for (const route of ["/api/health", "/api/visitor-hint", "/contact", "/does-not-exist"]) {
        const res = await fetch(`${server.origin}${route}`, { headers });
        const text = await res.text();
        expect(text, `${route} body`).not.toContain(SECRET);
        expect(JSON.stringify([...res.headers.entries()]), `${route} headers`).not.toContain(SECRET);
      }
    }
  });
});
