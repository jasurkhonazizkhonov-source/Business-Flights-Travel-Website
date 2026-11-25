import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import http from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { effectiveProxyMode, edgeProofAccepted, edgeProofCounters, edgeProofMode, edgeProofState, resetEdgeProofCountersForTests, resolveClientIp, EDGE_PROOF_HEADER, MIN_EDGE_PROOF_SECRET_LENGTH } from "../src/lib/client-ip";
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

test.describe("enforcement asked for without a secret fails closed: a missing variable cannot switch the proof off", () => {
  for (const mode of ["enforce", " ENFORCE ", "enforced"]) {
    test(`EDGE_PROOF_MODE=${JSON.stringify(mode)} with no secret: nothing is believed`, () => {
      for (const secret of [undefined, "", "  "]) {
        withEnv({ TRUSTED_PROXY: "cloudflare", EDGE_PROOF_SECRET: secret, EDGE_PROOF_MODE: mode }, () => {
          expect(edgeProofState(forged())).toBe("invalid");
          expect(edgeProofState(forged({ [EDGE_PROOF_HEADER]: "" }))).toBe("invalid");
          expect(resolveClientIp(forged())).toEqual({ ok: false, reason: "edge_not_proven" });
          expect(captureSubmissionInfo(forged()).info.location).toBeUndefined();
          expect(readVisitorHint(forged())).toEqual({});
        });
      }
    });
  }
  for (const mode of [undefined, "", "observe"]) {
    test(`EDGE_PROOF_MODE=${JSON.stringify(mode)} with no secret: the feature is off, as before`, () => {
      withEnv({ TRUSTED_PROXY: "cloudflare", EDGE_PROOF_SECRET: undefined, EDGE_PROOF_MODE: mode }, () => {
        expect(edgeProofState(forged())).toBe("off");
        expect(resolveClientIp(forged()).ok).toBe(true);
      });
    });
  }
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

test.describe("edge proof state, observe versus enforce, and what is counted", () => {
  const proof = (extra: Record<string, string> = {}) => forged({ [EDGE_PROOF_HEADER]: SECRET, ...extra });

  test("the state of a request: off, valid, missing, invalid (wrong value, repeated header, or a too-short configured secret)", () => {
    withEnv({ TRUSTED_PROXY: "cloudflare", EDGE_PROOF_SECRET: undefined }, () => expect(edgeProofState(forged())).toBe("off"));
    withEnv({ TRUSTED_PROXY: "cloudflare", EDGE_PROOF_SECRET: SECRET }, () => {
      expect(edgeProofState(proof())).toBe("valid");
      expect(edgeProofState(forged())).toBe("missing");
      expect(edgeProofState(forged({ [EDGE_PROOF_HEADER]: "wrong-" + SECRET }))).toBe("invalid");
      expect(edgeProofState(forged({ [EDGE_PROOF_HEADER]: `${SECRET}, ${SECRET}` }))).toBe("invalid");
      expect(edgeProofState(forged({ [EDGE_PROOF_HEADER]: "" }))).toBe("missing");
    });
    withEnv({ TRUSTED_PROXY: "cloudflare", EDGE_PROOF_SECRET: "x".repeat(MIN_EDGE_PROOF_SECRET_LENGTH - 1) }, () => {
      expect(edgeProofState(forged({ [EDGE_PROOF_HEADER]: "x".repeat(MIN_EDGE_PROOF_SECRET_LENGTH - 1) }))).toBe("invalid");
    });
  });

  test("the mode: enforce unless it says observe (anything else, including a typo, is the safe direction)", () => {
    for (const [value, expected] of [[undefined, "enforce"], ["", "enforce"], ["enforce", "enforce"], ["observe", "observe"], [" OBSERVE ", "observe"], ["obsrve", "enforce"], ["off", "enforce"], ["false", "enforce"]] as const) {
      withEnv({ EDGE_PROOF_MODE: value }, () => expect(edgeProofMode(), JSON.stringify(value)).toBe(expected));
    }
  });

  test("observe: a request without the proof is still believed (nothing is refused yet); enforce refuses it; both believe a proven one", () => {
    withEnv({ TRUSTED_PROXY: "cloudflare", EDGE_PROOF_SECRET: SECRET, EDGE_PROOF_MODE: "observe" }, () => {
      expect(resolveClientIp(forged())).toEqual({ ok: true, address: REAL, version: "v4" });
      expect(effectiveProxyMode(forged())).toBe("cloudflare");
      expect(resolveClientIp(proof())).toEqual({ ok: true, address: REAL, version: "v4" });
      // the forwarded headers are still never read, in either mode
      expect(resolveClientIp(new Headers({ "X-Forwarded-For": "8.8.8.8", "X-Real-IP": "8.8.4.4" }))).toMatchObject({ ok: false });
    });
    withEnv({ TRUSTED_PROXY: "cloudflare", EDGE_PROOF_SECRET: SECRET, EDGE_PROOF_MODE: "enforce" }, () => {
      expect(resolveClientIp(forged())).toEqual({ ok: false, reason: "edge_not_proven" });
      expect(resolveClientIp(proof())).toEqual({ ok: true, address: REAL, version: "v4" });
    });
  });

  test("every IP resolution is counted by what the request carried, and a value-free summary is logged at most once every five minutes", () => {
    resetEdgeProofCountersForTests();
    const lines: string[] = [];
    const realInfo = console.info;
    const realWarn = console.warn;
    console.info = (...a: unknown[]) => void lines.push(a.join(" "));
    console.warn = (...a: unknown[]) => void lines.push(a.join(" "));
    try {
      withEnv({ TRUSTED_PROXY: "cloudflare", EDGE_PROOF_SECRET: SECRET, EDGE_PROOF_MODE: "observe" }, () => {
        for (let i = 0; i < 5; i++) resolveClientIp(proof());
        for (let i = 0; i < 3; i++) resolveClientIp(forged());
        resolveClientIp(forged({ [EDGE_PROOF_HEADER]: "wrong-" + SECRET }));
      });
    } finally {
      console.info = realInfo;
      console.warn = realWarn;
    }
    // the first check opens the summary window (a line is written and the counters restart), later ones within five minutes only count
    expect(lines.length).toBe(1);
    expect(lines[0]).toMatch(/^\[edge-proof\] mode=observe checks in the last \d+s: valid=\d+ missing=\d+ invalid=\d+$/);
    for (const line of lines) {
      expect(line).not.toContain(SECRET);
      expect(line).not.toContain(REAL);
    }
    const counted = edgeProofCounters();
    expect(counted.valid + counted.missing + counted.invalid).toBe(8); // the other 8 of the 9 checks after the first one that opened the window
    expect(counted).toEqual({ valid: 4, missing: 3, invalid: 1 });
    resetEdgeProofCountersForTests();
    withEnv({ TRUSTED_PROXY: "cloudflare", EDGE_PROOF_SECRET: undefined }, () => {
      resolveClientIp(forged());
      expect(edgeProofCounters()).toEqual({ valid: 0, missing: 0, invalid: 0 }); // feature off: nothing is counted
    });
    withEnv({ TRUSTED_PROXY: "none", EDGE_PROOF_SECRET: SECRET }, () => {
      resolveClientIp(forged());
      expect(edgeProofCounters()).toEqual({ valid: 0, missing: 0, invalid: 0 }); // not the Cloudflare mode: nothing is counted
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

// ---- the activation path: observe first, verify with /api/edge-check, then enforce ----------------------------------------------------------------------------
test.describe("activating the edge proof safely on real production servers (observe, then enforce)", () => {
  test.skip(!standaloneBuildPresent(), "needs a standalone build (NEXT_OUTPUT=standalone npm run build)");
  test.setTimeout(150_000);
  const servers: StandaloneServer[] = [];
  const baseEnv = { TRUSTED_PROXY: "cloudflare", CRM_API_URL: "http://127.0.0.1:1", CRM_API_KEY: "k".repeat(40), CRM_COMPANY_ID: "activation-test" };
  const cf = (extra: Record<string, string> = {}) => ({ "CF-Connecting-IP": "203.0.113.90", "CF-IPCountry": "FR", ...extra });
  const get = async (server: StandaloneServer, route: string, headers: Record<string, string>) => {
    const res = await fetch(`${server.origin}${route}`, { headers });
    return { status: res.status, json: (await res.json()) as Record<string, unknown>, headers: res.headers };
  };
  test.afterAll(async () => {
    for (const s of servers) await s.stop();
  });

  test("with no secret: /api/edge-check says off, whatever is sent", async () => {
    const server = await startStandalone({ label: "edge activation: off", port: 3268, env: baseEnv });
    servers.push(server);
    for (const headers of [cf(), cf({ [EDGE_PROOF_HEADER]: SECRET })]) expect((await get(server, "/api/edge-check", headers)).json).toEqual({ edgeProof: "off" });
  });

  test("step 1, observe: nothing is refused (the hint is still given without the proof), and /api/edge-check shows the rule working: valid with the proof, missing without", async () => {
    const server = await startStandalone({ label: "edge activation: observe", port: 3269, env: { ...baseEnv, EDGE_PROOF_SECRET: SECRET, EDGE_PROOF_MODE: "observe" } });
    servers.push(server);
    expect((await get(server, "/api/edge-check", cf({ [EDGE_PROOF_HEADER]: SECRET }))).json).toEqual({ edgeProof: "valid" });
    expect((await get(server, "/api/edge-check", cf())).json).toEqual({ edgeProof: "missing" });
    expect((await get(server, "/api/edge-check", cf({ [EDGE_PROOF_HEADER]: "wrong-" + SECRET }))).json).toEqual({ edgeProof: "invalid" });
    // observe refuses nothing: a request without the proof still gets its country hint (exactly the behaviour before the secret existed)
    expect((await get(server, "/api/visitor-hint", cf())).json).toEqual({ countryCode: "FR" });
    // and the server says what it saw, without a value
    await expect.poll(() => server.logs(), { timeout: 10_000 }).toMatch(/\[edge-proof\] mode=observe checks in the last \d+s: valid=\d+ missing=\d+ invalid=\d+/);
    expect(server.logs()).not.toContain(SECRET);
  });

  test("step 2, enforce (also the default when only the secret is set): without the proof nothing is believed; with it everything is", async () => {
    for (const [port, mode] of [[3270, "enforce"], [3271, ""]] as const) {
      const server = await startStandalone({ label: `edge activation: enforce (${mode || "default"})`, port, env: { ...baseEnv, EDGE_PROOF_SECRET: SECRET, EDGE_PROOF_MODE: mode } });
      servers.push(server);
      expect((await get(server, "/api/visitor-hint", cf())).json, `${mode || "default"}: no proof`).toEqual({});
      expect((await get(server, "/api/visitor-hint", cf({ [EDGE_PROOF_HEADER]: SECRET }))).json, `${mode || "default"}: proof`).toEqual({ countryCode: "FR" });
      expect((await get(server, "/api/edge-check", cf())).json).toEqual({ edgeProof: "missing" });
      expect((await get(server, "/api/edge-check", cf({ [EDGE_PROOF_HEADER]: SECRET }))).json).toEqual({ edgeProof: "valid" });
    }
  });

  test("the diagnostic route reveals nothing about the secret, the mode or the client, is not cacheable or indexable, and accepts only GET", async () => {
    const server = servers[servers.length - 1];
    const ok = await get(server, "/api/edge-check", cf({ [EDGE_PROOF_HEADER]: SECRET }));
    expect(Object.keys(ok.json)).toEqual(["edgeProof"]);
    expect(JSON.stringify([ok.json, [...ok.headers.entries()]])).not.toContain(SECRET);
    expect(JSON.stringify(ok.json)).not.toMatch(/203\.0\.113\.90|observe|enforce/);
    expect(ok.headers.get("cache-control")).toBe("private, no-store");
    expect(ok.headers.get("x-robots-tag")).toMatch(/noindex/);
    for (const method of ["POST", "PUT", "DELETE"]) expect((await fetch(`${server.origin}/api/edge-check`, { method })).status, method).toBe(405);
  });
});

// ---- the verification script, against a stand-in for Cloudflare ---------------------------------------------------------------------------------------------
test.describe("deploy/check-edge-proof.sh against a stand-in edge", () => {
  test.skip(!standaloneBuildPresent(), "needs a standalone build (NEXT_OUTPUT=standalone npm run build)");
  test.setTimeout(150_000);
  const script = path.resolve(__dirname, "..", "deploy", "check-edge-proof.sh");
  let server: StandaloneServer;
  const proxies: http.Server[] = [];

  // A reverse proxy that behaves like the Cloudflare rule (sets x-bft-edge-proof, OVERWRITING anything the client sent) or like no rule at all.
  function startEdge(port: number, addProof: boolean): Promise<void> {
    return new Promise((resolve) => {
      const edge = http.createServer((req, res) => {
        const headers = { ...req.headers, host: `127.0.0.1:${server.port}` } as Record<string, string | string[] | undefined>;
        if (addProof) headers["x-bft-edge-proof"] = SECRET;
        headers["cf-connecting-ip"] = "203.0.113.55";
        const upstream = http.request({ host: "127.0.0.1", port: server.port, method: req.method, path: req.url, headers }, (up) => {
          res.writeHead(up.statusCode ?? 502, up.headers);
          up.pipe(res);
        });
        upstream.on("error", () => res.writeHead(502).end());
        req.pipe(upstream);
      });
      proxies.push(edge);
      edge.listen(port, "127.0.0.1", () => resolve());
    });
  }
  // ASYNCHRONOUS on purpose: the stand-in edges above run inside THIS Node process, so a blocking spawnSync would stop them from answering while the script waits for them.
  const run = (url: string) =>
    new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
      const child = spawn("bash", [script, url], { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => (stdout += d));
      child.stderr.on("data", (d) => (stderr += d));
      const timer = setTimeout(() => child.kill(), 60_000);
      child.on("close", (status) => (clearTimeout(timer), resolve({ status, stdout, stderr })));
    });

  test.beforeAll(async () => {
    server = await startStandalone({
      label: "edge check script",
      port: 3272,
      env: { TRUSTED_PROXY: "cloudflare", EDGE_PROOF_SECRET: SECRET, EDGE_PROOF_MODE: "observe", CRM_API_URL: "http://127.0.0.1:1", CRM_API_KEY: "k".repeat(40), CRM_COMPANY_ID: "script-test" },
    });
    await startEdge(3273, true); // the rule is in place
    await startEdge(3274, false); // no rule
  });
  test.afterAll(async () => {
    for (const p of proxies) await new Promise((r) => p.close(() => r(null)));
    await server?.stop();
  });

  test("with the rule in place the script passes, including the check that a client-supplied proof is overwritten, and never prints the secret", async () => {
    const r = await run("http://127.0.0.1:3273");
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain("PASS  through Cloudflare, nothing special sent -> valid");
    expect(r.stdout).toContain("PASS  through Cloudflare, with a forged x-bft-edge-proof header (the rule must overwrite it) -> valid");
    expect(r.stdout).toContain("RESULT  the edge proof behaves as designed");
    expect(r.stdout + r.stderr).not.toContain(SECRET);
  });

  test("without the rule the script fails and says not to switch to enforce", async () => {
    const r = await run("http://127.0.0.1:3274");
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("FAIL  through Cloudflare, nothing special sent -> 'missing' (expected 'valid')");
    expect(r.stdout).toContain("do not switch to enforce");
  });

  test("an unreachable address fails cleanly, and the script is valid bash", async () => {
    const r = await run("http://127.0.0.1:9");
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("unreachable");
    expect(spawnSync("bash", ["-n", script], { encoding: "utf8" }).status).toBe(0);
  });
});
