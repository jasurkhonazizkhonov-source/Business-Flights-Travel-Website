import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { standaloneBuildPresent, startStandalone, type StandaloneServer } from "./support/standalone-server";

// What the website's own rate limiter really guarantees, measured on real production servers (the limiter is one in-memory sliding window per PROCESS):
//   1. two instances do not share a count: the same client gets the limit on EACH (so scaling the website to N containers multiplies the allowance by N; the CRM's
//      database-backed per-visitor limits are the shared layer). This test pins that documented limitation, it does not endorse it;
//   2. without the optional edge proof, rotating a FORGED CF-Connecting-IP gives every request a fresh bucket, so the limit never applies to someone who can reach the
//      origin directly (the exposure the edge proof exists for);
//   3. with the edge proof, requests that lack it all share ONE bucket whatever IP they claim, so rotating forged values gains nothing; requests that carry it are
//      limited per real client address.
// Every request ends at the limiter or validation: no CRM is configured (an unreachable address is given to prove nothing is sent there).
const SECRET = "edge-proof-" + "0123456789abcdef".repeat(2); // throwaway test value
const LIMIT = 6; // newsletter: src/server/actions/subscribe-newsletter.ts
const ALLOWED = /Please enter a valid email address\./; // reached validation: the limiter let it through
const BLOCKED = /Too many attempts\. Please try again in a few minutes\./;

test.describe.configure({ mode: "serial" });
test.describe("rate limiting across instances and forged addresses (standalone servers)", () => {
  test.skip(!standaloneBuildPresent(), "needs a standalone build (NEXT_OUTPUT=standalone npm run build)");
  test.setTimeout(180_000);

  const servers: StandaloneServer[] = [];
  const ids = new Map<StandaloneServer, string>();
  const baseEnv = { TRUSTED_PROXY: "cloudflare", CRM_API_URL: "http://127.0.0.1:1", CRM_API_KEY: "k".repeat(40), CRM_COMPANY_ID: "topology-test" };

  async function start(label: string, port: number, extra: Record<string, string> = {}) {
    const server = await startStandalone({ label, port, env: { ...baseEnv, ...extra } });
    const manifest = JSON.parse(readFileSync(path.join(server.layout, ".next", "server", "server-reference-manifest.json"), "utf8")) as { node: Record<string, { exportedName: string }> };
    ids.set(server, Object.entries(manifest.node).find(([, v]) => v.exportedName === "subscribeToNewsletter")?.[0] ?? "");
    expect(ids.get(server)).toBeTruthy();
    servers.push(server);
    return server;
  }
  const subscribe = async (server: StandaloneServer, headers: Record<string, string>) => {
    const res = await fetch(`${server.origin}/`, {
      method: "POST",
      headers: { "Next-Action": ids.get(server)!, "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component", ...headers },
      body: JSON.stringify([{ email: "not-an-email" }]),
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    return BLOCKED.test(text) ? "blocked" : ALLOWED.test(text) ? "allowed" : `unexpected: ${text.slice(0, 120)}`;
  };

  test.afterAll(async () => {
    for (const s of servers) await s.stop();
  });

  test("two instances do not share a count: the same client gets the full allowance on each (documented limitation)", async () => {
    const a = await start("topology A", 3264);
    const b = await start("topology B", 3265);
    const client = { "CF-Connecting-IP": "203.0.113.150" };
    const onA: string[] = [];
    for (let i = 0; i < LIMIT + 1; i++) onA.push(await subscribe(a, client));
    expect(onA.slice(0, LIMIT)).toEqual(Array(LIMIT).fill("allowed"));
    expect(onA[LIMIT]).toBe("blocked"); // the limit does apply inside one process
    const onB: string[] = [];
    for (let i = 0; i < LIMIT; i++) onB.push(await subscribe(b, client));
    expect(onB, "the same client on a second instance starts from zero").toEqual(Array(LIMIT).fill("allowed"));
  });

  test("without the edge proof, a caller that rotates a forged CF-Connecting-IP is never limited (the exposure the proof closes)", async () => {
    const a = servers[0];
    const results: string[] = [];
    for (let i = 0; i < LIMIT * 2; i++) results.push(await subscribe(a, { "CF-Connecting-IP": `203.0.113.${160 + i}` }));
    expect(results.every((r) => r === "allowed"), results.join(",")).toBe(true);
  });

  test("with the edge proof: forged rotation shares ONE bucket and is limited; a proven client is limited by its own address", async () => {
    const c = await start("topology C (edge proof)", 3266, { EDGE_PROOF_SECRET: SECRET });
    const forged: string[] = [];
    for (let i = 0; i < LIMIT + 3; i++) forged.push(await subscribe(c, { "CF-Connecting-IP": `203.0.113.${180 + i}` }));
    expect(forged.slice(0, LIMIT)).toEqual(Array(LIMIT).fill("allowed"));
    expect(forged.slice(LIMIT), "rotating the claimed address did not buy a fresh allowance").toEqual(Array(3).fill("blocked"));
    // a request that carries the proof has its own bucket per real address, untouched by the exhausted shared one
    expect(await subscribe(c, { "CF-Connecting-IP": "203.0.113.200", "x-bft-edge-proof": SECRET })).toBe("allowed");
    const proven: string[] = [];
    for (let i = 0; i < LIMIT; i++) proven.push(await subscribe(c, { "CF-Connecting-IP": "203.0.113.201", "x-bft-edge-proof": SECRET }));
    expect(proven.slice(0, LIMIT)).toEqual(Array(LIMIT).fill("allowed"));
    expect(await subscribe(c, { "CF-Connecting-IP": "203.0.113.201", "x-bft-edge-proof": SECRET })).toBe("blocked");
    expect(await subscribe(c, { "CF-Connecting-IP": "203.0.113.202", "x-bft-edge-proof": SECRET })).toBe("allowed");
  });

  test("with the edge proof ON but the Cloudflare rule missing, every visitor shares the one bucket: the sitewide allowance is the single client's (the misconfiguration to avoid)", async () => {
    const c = servers[servers.length - 1];
    // the shared bucket is already exhausted by the previous test: an ordinary visitor (no proof header, because the rule is absent) is refused
    expect(await subscribe(c, { "CF-Connecting-IP": "198.51.100.77" })).toBe("blocked");
  });
});
