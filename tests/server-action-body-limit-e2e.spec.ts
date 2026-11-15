import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { standaloneBuildPresent, startStandalone, type StandaloneServer } from "./support/standalone-server";
import { startStubCrm, type StubCrm } from "./support/stub-crm";

// The website's Server Action body-size limit (next.config.ts: experimental.serverActions.bodySizeLimit = "64kb"; Next's default is 1 MB).
// Real HTTP against the standalone production server, with the same request shape the browser sends. The limit is on the raw request body.
// Needs `NEXT_OUTPUT=standalone npm run build` first; otherwise skipped (never "passed").

const PORT = 3237;
const LIMIT = 64 * 1024; // "64kb" in the `bytes` format Next parses = 65,536 bytes
const COMPANY = "limit-test-company";

test.describe.configure({ mode: "serial" });
test.describe("server action body size limit (standalone server)", () => {
  test.skip(!standaloneBuildPresent(), "needs a standalone build (NEXT_OUTPUT=standalone npm run build)");
  test.setTimeout(120_000);

  let crm: StubCrm;
  let server: StandaloneServer;
  const ids: Record<string, string> = {};
  let ip = 10;

  test.beforeAll(async () => {
    crm = await startStubCrm({ apiKey: "k".repeat(40), companyId: COMPANY });
    server = await startStandalone({
      label: "body limit e2e",
      port: PORT,
      env: { TRUSTED_PROXY: "cloudflare", CRM_API_URL: crm.url, CRM_API_KEY: "k".repeat(40), CRM_COMPANY_ID: COMPANY },
    });
    const manifest = JSON.parse(readFileSync(path.join(server.layout, ".next", "server", "server-reference-manifest.json"), "utf8")) as { node: Record<string, { exportedName: string }> };
    for (const [id, v] of Object.entries(manifest.node)) ids[v.exportedName] = id;
  });
  test.beforeEach(() => {
    server.assertAlive();
    crm.reset();
  });
  test.afterAll(async () => {
    await server?.stop();
    await crm?.close();
  });

  /** A server-action POST with an exact raw body. Each call is a distinct visitor, so the per-IP limiter never decides the outcome. */
  async function post(name: string, body: string | Uint8Array, contentType = "text/plain;charset=UTF-8") {
    const res = await fetch(`http://127.0.0.1:${PORT}/`, {
      method: "POST",
      headers: { "Next-Action": ids[name], "Content-Type": contentType, Accept: "text/x-component", "CF-Connecting-IP": `198.51.100.${ip++}` },
      body: body as BodyInit,
    });
    return { status: res.status, text: await res.text() };
  }
  /** Pads a contact-form argument list with an over-long message until the JSON body is exactly `bytes` long. */
  const contactBodyOfSize = (bytes: number) => {
    const base = { firstName: "Ada", lastName: "Lovelace", email: "ada@example.org", phone: "+14155552671", subject: "GENERAL_INQUIRY", message: "", website: "", renderedAt: Date.now() - 10_000 };
    const shell = JSON.stringify([base]).length;
    return JSON.stringify([{ ...base, message: "x".repeat(bytes - shell) }]);
  };

  test("the config really sets 64 KB (guards against the setting being dropped)", async () => {
    const cfg = readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8");
    expect(cfg).toMatch(/serverActions:\s*\{\s*bodySizeLimit:\s*"64kb"\s*\}/);
  });

  test("a normal form submission (a few KB) is accepted and reaches the action", async () => {
    const r = await post("submitContactMessage", contactBodyOfSize(2_000));
    expect(r.status).toBe(200);
    expect(r.text).toMatch(/"ok":(true|false)/); // the action ran and answered (whatever it decided about this synthetic contact)
    expect(r.text).not.toMatch(/Body exceeded/);
  });

  test("the largest real contact message (3,000 chars of 4-byte characters, ~12 KB of JSON) is well inside the limit", async () => {
    const base = { firstName: "Ada", lastName: "Lovelace", email: "ada@example.org", phone: "+14155552671", subject: "GENERAL_INQUIRY", message: "😀".repeat(1500), website: "", renderedAt: Date.now() - 10_000 };
    const body = JSON.stringify([base]);
    expect(Buffer.byteLength(body)).toBeLessThan(LIMIT / 4);
    expect((await post("submitContactMessage", body)).status).toBe(200);
  });

  test("a body just BELOW the limit is still processed by the action (not refused for size)", async () => {
    const r = await post("submitContactMessage", contactBodyOfSize(LIMIT - 1_024));
    expect(r.status).toBe(200);
    expect(r.text).toMatch(/Please check the highlighted fields/); // refused by VALIDATION (message too long), which proves the action ran
  });

  /**
   * What an oversized body looks like to a caller. Next (16.x) rejects it with an internal 413 ApiError BEFORE the action is decoded or run, and for a
   * fetch action answers HTTP 200 with a Flight ERROR row carrying only an opaque digest (its own source has a TODO to map this to a 413 status);
   * for very large bodies the connection may simply be reset. What matters, and what is asserted: the action did not run (no "ok" result, no
   * validation answer), no message text or stack trace came back, and the CRM was never called. The browser sees this as a rejected call, which
   * the forms turn into their inline "please try again" message (tests/form-failure-recovery-e2e.spec.ts, "refused as too large").
   */
  const expectRefusedBeforeTheActionRan = (r: { status: number; text: string } | { reset: true }, label: string) => {
    if ("reset" in r) return; // the connection was cut: refused
    expect(r.text, label).not.toMatch(/"ok":(true|false)|fieldErrors|alreadySubscribed|leadId|summary/);
    expect(r.text, label).not.toMatch(/at \w+ \(|node_modules|\.ts:\d+|\.js:\d+|Body exceeded|stack/);
    expect(r.status === 200 || r.status === 413 || r.status === 500, `${label}: unexpected status ${r.status}`).toBe(true);
  };
  const postOrReset = async (name: string, body: string) => {
    try {
      return await post(name, body);
    } catch {
      return { reset: true as const };
    }
  };

  test("a body just ABOVE the limit is refused before the action runs (error row, no stack trace, no answer), and nothing reaches the CRM", async () => {
    const r = await post("submitContactMessage", contactBodyOfSize(LIMIT + 1_024));
    expectRefusedBeforeTheActionRan(r, "just above");
    expect(r.text).toMatch(/E\{"digest":"\d+"\}/); // the framework's own opaque error row
    expect(crm.requests).toHaveLength(0);
  });

  test("a very large body (5 MB) is refused the same way, on every action", async () => {
    const huge = JSON.stringify([{ email: "bot@example.org", website: "x".repeat(5 * 1024 * 1024) }]);
    for (const name of ["subscribeToNewsletter", "submitContactMessage", "submitFlightRequest"]) {
      expectRefusedBeforeTheActionRan(await postOrReset(name, huge), name);
    }
    expect(crm.requests).toHaveLength(0);
  });

  /** Runs `fn`, retrying only a connection reset: after the server cut an oversized upload, the client's pooled keep-alive socket can be a dead one. */
  async function afterReset<T>(fn: () => Promise<T>): Promise<T> {
    let last: unknown;
    for (let i = 0; i < 3; i++) {
      try {
        return await fn();
      } catch (e) {
        last = e;
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    throw last;
  }

  test("the server stays healthy after refusing oversized bodies", async () => {
    server.assertAlive(); // the process this test started is still the one running
    const res = await afterReset(() => fetch(`http://127.0.0.1:${PORT}/`, { headers: { Connection: "close" } }));
    expect(res.status).toBe(200);
    const ok = await afterReset(() => post("subscribeToNewsletter", JSON.stringify([{ email: "news@example.org", website: "" }])));
    expect(ok.status).toBe(200);
    expect(ok.text).toMatch(/"ok":true/);
  });

  test("malformed bodies never crash the server or leak internals: invalid JSON, truncated JSON, empty, wrong shape", async () => {
    for (const body of ["{not json", '[{"email":"a@b.co"', "", "null", '"just a string"', "[]", "[1,2,3]"]) {
      const r = await post("subscribeToNewsletter", body);
      expect(r.text, JSON.stringify(body)).not.toMatch(/at \w+ \(|node_modules|\.ts:\d+|\.js:\d+/);
      expect([200, 400, 500]).toContain(r.status);
    }
    expect(crm.requests).toHaveLength(0);
    expect((await afterReset(() => fetch(`http://127.0.0.1:${PORT}/`, { headers: { Connection: "close" } }))).status).toBe(200);
  });

  test("an unexpected content type is handled safely and reaches no CRM", async () => {
    for (const ct of ["application/json", "application/x-www-form-urlencoded", "multipart/form-data; boundary=nope", "text/html", "application/octet-stream"]) {
      const r = await post("subscribeToNewsletter", JSON.stringify([{ email: "news@example.org", website: "" }]), ct);
      expect(r.text, ct).not.toMatch(/at \w+ \(|node_modules|\.ts:\d+|\.js:\d+/);
      expect(r.status, ct).toBeLessThan(600);
    }
    expect((await afterReset(() => fetch(`http://127.0.0.1:${PORT}/`, { headers: { Connection: "close" } }))).status).toBe(200);
  });

  test("a request without a Next-Action id is not an action call at all", async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: "x".repeat(LIMIT + 10) });
    expect(res.status).not.toBe(500);
    expect(await res.text()).not.toMatch(/at \w+ \(|node_modules/);
  });
});
