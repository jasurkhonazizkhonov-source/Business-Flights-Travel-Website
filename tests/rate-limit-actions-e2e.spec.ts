import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// The three public form actions, called for real over HTTP on the standalone server exactly as the browser calls them (a server-action POST),
// with TRUSTED_PROXY=cloudflare - the VPS configuration. No database is involved: every request here ends at the rate limiter, the
// honeypot or validation, all of which run before any database access (the server is given an unreachable DATABASE_URL to prove it).
//
// Needs `NEXT_OUTPUT=standalone npm run build` first; otherwise skipped (never "passed").
const repo = path.resolve(__dirname, "..");
const standalone = path.join(repo, ".next", "standalone");
const PORT = 3233;
const BASE = `http://127.0.0.1:${PORT}`;

interface ActionCase {
  name: "subscribeToNewsletter" | "submitContactMessage" | "submitFlightRequest";
  limit: number;
  /** An argument that reaches the limiter and then ends cheaply (honeypot / validation) without touching the database. */
  args: unknown[];
  allowedMarker: RegExp;
  blockedMarker: RegExp;
}

const CASES: ActionCase[] = [
  {
    name: "subscribeToNewsletter",
    limit: 6,
    args: [{ email: "not-an-email" }],
    allowedMarker: /Please enter a valid email address\./,
    blockedMarker: /Too many attempts\. Please try again in a few minutes\./,
  },
  {
    name: "submitContactMessage",
    limit: 8,
    args: [{}],
    allowedMarker: /Please check the highlighted fields and try again\./,
    blockedMarker: /You've sent several messages recently\. Please wait a few minutes and try again\./,
  },
  {
    name: "submitFlightRequest",
    limit: 8,
    args: [{}],
    allowedMarker: /Please check the highlighted fields and try again\./,
    blockedMarker: /You've submitted several requests recently\. Please wait a few minutes and try again, or contact us directly\./,
  },
];

test.describe.configure({ mode: "serial" });
test.describe("rate limits on the real public actions (standalone server, TRUSTED_PROXY=cloudflare)", () => {
  test.skip(!existsSync(path.join(standalone, "server.js")), "needs a standalone build (NEXT_OUTPUT=standalone npm run build)");
  test.setTimeout(120_000);

  let server: ChildProcess | undefined;
  let layout = "";
  let logs = "";
  const ids: Record<string, string> = {};

  test.beforeAll(async () => {
    layout = mkdtempSync(path.join(os.tmpdir(), "bft-ratelimit-"));
    cpSync(standalone, layout, { recursive: true, filter: (src) => !/[\\/]\.env($|\.)/.test(src) }); // like the image: no .env
    const manifest = JSON.parse(readFileSync(path.join(layout, ".next", "server", "server-reference-manifest.json"), "utf8")) as {
      node: Record<string, { exportedName: string }>;
    };
    for (const [id, v] of Object.entries(manifest.node)) ids[v.exportedName] = id;
    for (const c of CASES) expect(ids[c.name], `server action id for ${c.name}`).toBeTruthy();

    const env = {
      PATH: process.env.PATH ?? "",
      SystemRoot: process.env.SystemRoot ?? "",
      NODE_ENV: "production",
      HOSTNAME: "127.0.0.1",
      PORT: String(PORT),
      TRUSTED_PROXY: "cloudflare",
      DATABASE_URL: "postgresql://nobody:none@127.0.0.1:1/none", // unreachable on purpose: nothing below may need a database
      DATABASE_SSL_MODE: "disable",
      DATABASE_AUTO_INIT: "false",
    } as NodeJS.ProcessEnv;
    const child = spawn(process.execPath, ["server.js"], { cwd: layout, env, stdio: ["ignore", "pipe", "pipe"] });
    server = child;
    child.stdout.on("data", (d) => (logs += d));
    child.stderr.on("data", (d) => (logs += d));
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch(`${BASE}/api/health`)).status === 200) return;
      } catch {
        /* not up yet */
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error("the standalone server did not start:\n" + logs.slice(-1200));
  });

  test.afterAll(async () => {
    server?.kill();
    await new Promise((r) => setTimeout(r, 1500));
    if (layout) {
      try {
        rmSync(layout, { recursive: true, force: true });
      } catch {
        /* a leftover temp directory is harmless */
      }
    }
  });

  /** One server-action call, the way the browser makes it. Returns the response text (the React Flight payload). */
  async function call(c: ActionCase, headers: Record<string, string>): Promise<string> {
    const res = await fetch(`${BASE}/`, {
      method: "POST",
      headers: { "Next-Action": ids[c.name], "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component", ...headers },
      body: JSON.stringify(c.args),
    });
    expect(res.status, `${c.name} responded ${res.status}`).toBe(200);
    return res.text();
  }

  for (const c of CASES) {
    test(`${c.name}: constant trusted client IP + rotated forged X-Forwarded-For -> request ${c.limit + 1} is refused with the unchanged message`, async () => {
      const trusted = { "CF-Connecting-IP": "198.51.100.10" };
      const out: string[] = [];
      for (let i = 0; i < c.limit + 3; i++) {
        out.push(await call(c, { ...trusted, "X-Forwarded-For": `203.0.113.${i + 1}, 198.18.${i + 1}.7`, "X-Real-IP": `192.0.2.${i + 1}` }));
      }
      for (let i = 0; i < c.limit; i++) {
        expect(out[i], `request ${i + 1} must be allowed`).toMatch(c.allowedMarker);
        expect(out[i]).not.toMatch(c.blockedMarker);
      }
      for (let i = c.limit; i < out.length; i++) expect(out[i], `request ${i + 1} must be refused`).toMatch(c.blockedMarker);
      // rotating the forged header further never frees the blocked client
      for (let i = 50; i < 60; i++) expect(await call(c, { ...trusted, "X-Forwarded-For": `203.0.113.${i}` })).toMatch(c.blockedMarker);
      // a different trusted client is unaffected: its own bucket, its own full allowance
      expect(await call(c, { "CF-Connecting-IP": "198.51.100.11", "X-Forwarded-For": "203.0.113.1" })).toMatch(c.allowedMarker);
    });

    test(`${c.name}: no usable trusted IP (missing / malformed / private / multi-value) -> ONE shared bucket with the same threshold, however the headers are rotated`, async () => {
      const variants: Array<Record<string, string>> = [
        {}, // header missing
        { "CF-Connecting-IP": "not-an-ip" },
        { "CF-Connecting-IP": "10.0.0.1" },
        { "CF-Connecting-IP": "198.51.100.1, 198.51.100.2" },
        { "CF-Connecting-IP": "999.1.1.1" },
        { "CF-Connecting-IP": "::1" },
      ];
      const out: string[] = [];
      for (let i = 0; i < c.limit + 4; i++) out.push(await call(c, { ...variants[i % variants.length], "X-Forwarded-For": `203.0.113.${i + 100}` }));
      const allowed = out.filter((t) => c.allowedMarker.test(t) && !c.blockedMarker.test(t)).length;
      const blocked = out.filter((t) => c.blockedMarker.test(t)).length;
      expect(allowed, "exactly the threshold in total across every malformed variant").toBe(c.limit);
      expect(blocked).toBe(4);
      // the spoofer cannot pick a bucket: this is still the same exhausted one
      expect(await call(c, { "X-Forwarded-For": "203.0.113.250" })).toMatch(c.blockedMarker);
    });
  }

  test("the fallback is announced once in the server log, without any header value", async () => {
    const fallbackLines = logs.split("\n").filter((l) => l.includes("[rate-limit] no trusted client IP"));
    expect(fallbackLines.length).toBeGreaterThanOrEqual(1);
    expect(fallbackLines.length).toBeLessThanOrEqual(2); // throttled: dozens of unresolved requests above, a handful of lines at most
    expect(fallbackLines.join("\n")).not.toMatch(/not-an-ip|999\.1\.1\.1|203\.0\.113|198\.51\.100/);
  });
});
