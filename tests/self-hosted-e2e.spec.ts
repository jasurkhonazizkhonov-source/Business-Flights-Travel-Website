import { test, expect, type Page } from "@playwright/test";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { Client } from "pg";

// The SELF-HOSTED runtime, end to end, without Docker: the standalone server is copied into a container-like layout (no .env, no source),
// started with the exact environment compose.yaml sets (TRUSTED_PROXY=cloudflare, DATABASE_SSL_MODE=disable, DATABASE_AUTO_INIT=false),
// connected as the least-privilege role to a disposable PostgreSQL server, and driven through a real browser with Cloudflare-style headers.
//
// Needs: `NEXT_OUTPUT=standalone npm run build` first, and INTEGRATION_ADMIN_DATABASE_URL pointing at a disposable LOOPBACK server
// (see tests/runtime-role-pg-e2e.spec.ts). Skipped, never "passed", without them. It cannot prove the Docker image or the Docker network.
const repo = path.resolve(__dirname, "..");
const adminUrl = process.env.INTEGRATION_ADMIN_DATABASE_URL;
const standalone = path.join(repo, ".next", "standalone", "server.js");
const PORT = 3231;
const ROLE_PASSWORD = "e2e-" + Math.random().toString(36).slice(2);
const ready = Boolean(adminUrl) && existsSync(standalone);

test.describe.configure({ mode: "serial" });
test.describe("self-hosted runtime (standalone server, restricted DB role, Cloudflare headers)", () => {
  test.skip(!ready, "needs INTEGRATION_ADMIN_DATABASE_URL and a standalone build (NEXT_OUTPUT=standalone npm run build)");
  test.setTimeout(180_000);

  let server: ChildProcess | undefined;
  let layout = "";
  let logs = "";
  let ownerUrl = "";

  test.beforeAll(async () => {
    const out = execFileSync(process.execPath, [path.join(repo, "node_modules", "tsx", "dist", "cli.mjs"), "scripts/prepare-self-hosted-e2e-db.ts"], {
      cwd: repo,
      encoding: "utf8",
      env: { ...process.env, E2E_ROLE_PASSWORD: ROLE_PASSWORD, NODE_OPTIONS: "--no-deprecation" },
    });
    const prepared = JSON.parse(out.trim().split("\n").pop() as string);
    const base = new URL(adminUrl as string);
    const mk = (user: string, pw: string) => `postgresql://${user}:${pw}@${base.hostname === "[::1]" ? "[::1]" : "localhost"}:${base.port}/${prepared.database}`;
    ownerUrl = mk(prepared.owner, prepared.ownerPassword);
    const roleUrl = mk(prepared.role, ROLE_PASSWORD);

    // The layout the Dockerfile's runner stage produces: standalone output + static assets + public + the health probe. NO .env.
    layout = mkdtempSync(path.join(os.tmpdir(), "bft-runtime-"));
    cpSync(path.join(repo, ".next", "standalone"), layout, { recursive: true, filter: (src) => !/[\\/]\.env($|\.)/.test(src) });
    mkdirSync(path.join(layout, ".next"), { recursive: true });
    cpSync(path.join(repo, ".next", "static"), path.join(layout, ".next", "static"), { recursive: true });
    cpSync(path.join(repo, "public"), path.join(layout, "public"), { recursive: true });
    mkdirSync(path.join(layout, "scripts"), { recursive: true });
    cpSync(path.join(repo, "scripts", "healthcheck.mjs"), path.join(layout, "scripts", "healthcheck.mjs"));

    // Only the variables compose.yaml passes. Nothing else from this machine's environment leaks in.
    const env = {
      PATH: process.env.PATH ?? "",
      SystemRoot: process.env.SystemRoot ?? "",
      NODE_ENV: "production",
      HOSTNAME: "127.0.0.1",
      PORT: String(PORT),
      DATABASE_URL: roleUrl,
      DATABASE_SSL_MODE: "disable",
      DATABASE_AUTO_INIT: "false",
      TRUSTED_PROXY: "cloudflare",
    } as NodeJS.ProcessEnv;
    const child = spawn(process.execPath, ["server.js"], { cwd: layout, env, stdio: ["ignore", "pipe", "pipe"] });
    server = child;
    child.stdout.on("data", (d) => (logs += d));
    child.stderr.on("data", (d) => (logs += d));
    for (let i = 0; i < 60; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${PORT}/api/health`);
        if (r.status === 200) return;
      } catch {
        /* not up yet */
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error("the standalone server did not become healthy:\n" + logs.slice(-1500));
  });

  test.afterAll(async () => {
    server?.kill();
    await new Promise((r) => setTimeout(r, 1500)); // let the process release its working directory (Windows refuses to delete it otherwise)
    if (layout) {
      try {
        rmSync(layout, { recursive: true, force: true });
      } catch {
        /* a leftover temp directory is harmless */
      }
    }
    if (adminUrl) {
      try {
        execFileSync(process.execPath, [path.join(repo, "node_modules", "tsx", "dist", "cli.mjs"), "scripts/prepare-self-hosted-e2e-db.ts", "--drop"], { cwd: repo, encoding: "utf8", env: { ...process.env, NODE_OPTIONS: "--no-deprecation" } });
      } catch {
        /* a disposable database left behind on a disposable server is harmless */
      }
    }
  });

  const rawGet = (host: string, urlPath: string) =>
    new Promise<{ status: number; location?: string }>((resolve, reject) => {
      const req = http.request({ host: "127.0.0.1", port: PORT, path: urlPath, method: "GET", headers: { Host: host } }, (res) => {
        res.resume();
        resolve({ status: res.statusCode ?? 0, location: res.headers.location });
      });
      req.on("error", reject);
      req.end();
    });

  test("container-like layout: no .env present, the health probe works, the process is healthy without any source files", async () => {
    expect(readdirSync(layout).filter((f) => f.startsWith(".env"))).toEqual([]);
    expect(existsSync(path.join(layout, "src"))).toBe(false);
    const code = execFileSync(process.execPath, ["scripts/healthcheck.mjs"], { cwd: layout, env: { ...process.env, PORT: String(PORT) }, encoding: "utf8" });
    expect(code).toBe(""); // exits 0 silently
    const r = await fetch(`http://127.0.0.1:${PORT}/api/health`);
    expect(await r.json()).toEqual({ status: "ok" });
    expect(r.headers.get("cache-control")).toMatch(/no-store/);
  });

  test("canonical host: the apex redirects to www (308, path and query kept); www, the internal name and look-alikes do not redirect", async () => {
    const apex = await rawGet("businessflights.travel", "/destinations/europe?utm_source=x&a=1");
    expect(apex.status).toBe(308);
    expect(apex.location).toBe("https://www.businessflights.travel/destinations/europe?utm_source=x&a=1");
    expect(new URL((await rawGet("businessflights.travel", "/")).location as string).href).toBe("https://www.businessflights.travel/"); // "/" and "" are the same URL
    for (const host of ["www.businessflights.travel", "bft-web:3000", "127.0.0.1:" + PORT, "xbusinessflights.travel", "businessflightsXtravel", "businessflights.travel.evil.example", "evil-businessflights.travel"]) {
      const r = await rawGet(host, "/");
      expect(r.status, host).toBe(200);
      expect(r.location, host).toBeUndefined();
    }
    // The www page declares itself canonical, so there is no loop: www -> 200 with canonical www.
    const html = await (await fetch(`http://127.0.0.1:${PORT}/`, { headers: { Host: "www.businessflights.travel" } })).text();
    expect(html).toContain('rel="canonical" href="https://www.businessflights.travel"');
  });

  async function submitFlightRequest(page: Page, email: string, phone: string) {
    await page.goto(`http://127.0.0.1:${PORT}/flights`);
    await page.getByRole("button", { name: "One Way", exact: true }).click();
    const from = page.getByPlaceholder("City or airport code").first();
    await from.click();
    await from.fill("JFK");
    await page.getByRole("option").filter({ hasText: "JFK" }).first().click();
    const to = page.getByPlaceholder("City or airport code").nth(1);
    await to.click();
    await to.fill("CDG");
    await page.getByRole("option").filter({ hasText: "CDG" }).first().click();
    await page.getByText("Select date").first().click();
    await page.getByRole("grid").first().locator("button:not([disabled])").last().click();
    const form = page.locator("form").first();
    await form.getByLabel("First Name", { exact: true }).fill("Selfhosted");
    await form.getByLabel("Last Name", { exact: true }).fill("Tester");
    await form.getByLabel("Email Address", { exact: true }).fill(email);
    await page.locator("#phone").fill(phone); // the country selector defaults to "International", which needs the + prefix
    await page.waitForTimeout(3000); // the form's anti-bot minimum fill time (2.5 s)
    await page.getByRole("button", { name: "Get a Free Flight Quote" }).click();
    try {
      await expect(page.getByText("Thank you for your request")).toBeVisible({ timeout: 30_000 });
    } catch (e) {
      throw new Error(`${(e as Error).message}\n--- server log (credentials are never logged) ---\n${logs.slice(-2500)}`);
    }
  }

  const rows = async (email: string) => {
    const c = new Client({ connectionString: ownerUrl });
    await c.connect();
    try {
      return (
        await c.query(
          `SELECT l."id", l."assignedAgentId", l."queueDistributedAt", s."ipAddress", s."ipVersion", s."city", s."region", s."countryCode", s."country", s."geoSource",
                  (SELECT count(*)::int FROM "Notification" n WHERE n."leadId" = l."id" AND n."type" = 'LEAD_ASSIGNED') AS notifications
             FROM "Contact" c JOIN "Lead" l ON l."contactId" = c."id" LEFT JOIN "LeadSubmissionInfo" s ON s."leadId" = l."id"
            WHERE c."primaryEmail" = $1`,
          [email],
        )
      ).rows;
    } finally {
      await c.end();
    }
  };
  const waitForRows = async (email: string, hasInfo: boolean) => {
    for (let i = 0; i < 40; i++) {
      const r = await rows(email);
      if (r.length === 1 && (!hasInfo || r[0].ipAddress !== null || r[0].geoSource !== null) && r[0].notifications === 1) return r[0];
      await new Promise((res) => setTimeout(res, 500));
    }
    return (await rows(email))[0];
  };

  test("a real submission behind Cloudflare headers: lead saved, queued, notified; IP and location come from CF headers, never from a forged X-Forwarded-For", async ({ browser }) => {
    const context = await browser.newContext({
      extraHTTPHeaders: {
        "CF-Connecting-IP": "198.51.100.77",
        "CF-IPCountry": "AU",
        "CF-IPCity": "Sydney",
        "CF-Region": "New South Wales",
        "X-Forwarded-For": "8.8.8.8",
        "X-Real-IP": "8.8.4.4",
        "X-Vercel-Forwarded-For": "9.9.9.9",
      },
    });
    const page = await context.newPage();
    await submitFlightRequest(page, "cf-headers@example.com", "+14155550123");
    await context.close();
    const r = await waitForRows("cf-headers@example.com", true);
    expect(r.id, "lead row").toBeTruthy();
    expect(r.assignedAgentId).toBe("e2e-agent");
    expect(r.queueDistributedAt).not.toBeNull();
    expect(r.notifications).toBe(1);
    expect(r.ipAddress).toBe("198.51.100.77");
    expect(r.ipVersion).toBe("v4");
    expect(r.countryCode).toBe("AU");
    expect(r.city).toBe("Sydney");
    expect(r.geoSource).toMatch(/Cloudflare/);
    expect(JSON.stringify(r)).not.toMatch(/8\.8\.8\.8|8\.8\.4\.4|9\.9\.9\.9/);
  });

  test("with ONLY forged forwarding headers (no CF-Connecting-IP) no IP is stored; the lead is still saved and assigned", async ({ browser }) => {
    const context = await browser.newContext({ extraHTTPHeaders: { "X-Forwarded-For": "8.8.8.8", "X-Real-IP": "8.8.4.4", Forwarded: "for=1.1.1.1", "CF-IPCountry": "AU" } });
    const page = await context.newPage();
    await submitFlightRequest(page, "forged@example.com", "+14155552671");
    await context.close();
    const r = await waitForRows("forged@example.com", false);
    expect(r.id).toBeTruthy();
    expect(r.assignedAgentId).toBe("e2e-agent");
    expect(r.ipAddress).toBeNull();
    expect(JSON.stringify(r)).not.toMatch(/8\.8\.8\.8|8\.8\.4\.4|1\.1\.1\.1/);
  });

  test("a valid IP with no location headers at all is stored without a location (missing geo is graceful)", async ({ browser }) => {
    const context = await browser.newContext({ extraHTTPHeaders: { "CF-Connecting-IP": "2607:f8b0:4005:80a::200e" } });
    const page = await context.newPage();
    await submitFlightRequest(page, "nogeo@example.com", "+12125550123");
    await context.close();
    const r = await waitForRows("nogeo@example.com", true);
    expect(r.ipAddress).toBe("2607:f8b0:4005:80a::200e");
    expect(r.ipVersion).toBe("v6");
    expect(r.city).toBeNull();
    expect(r.countryCode).toBeNull();
    expect(r.assignedAgentId).toBe("e2e-agent");
  });

  test("the running server never created or altered schema and logged no credentials", async () => {
    const c = new Client({ connectionString: ownerUrl });
    await c.connect();
    const owned = await c.query(`SELECT count(*)::int AS n FROM pg_class c JOIN pg_roles r ON r.oid = c.relowner WHERE r.rolname <> 'crm_e2e_owner' AND c.relnamespace = 'public'::regnamespace`);
    await c.end();
    expect(owned.rows[0].n).toBe(0);
    expect(logs).not.toContain(ROLE_PASSWORD);
    expect(logs).not.toMatch(/postgresql:\/\/[^\s]*:[^\s@]+@/);
  });
});
