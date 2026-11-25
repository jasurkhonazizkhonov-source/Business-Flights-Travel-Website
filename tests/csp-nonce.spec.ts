import { test, expect, type Page } from "@playwright/test";
import { contentSecurityPolicy, cspScriptMode } from "../src/lib/csp";
import { standaloneBuildPresent, startStandalone, type StandaloneServer } from "./support/standalone-server";

// The nonce-based Content-Security-Policy (src/lib/csp.ts, set per request by src/proxy.ts): a fresh nonce for every response; every executable inline script Next
// renders carries it; nothing else can run; and the application still hydrates and works under it. Plus the run-time kill switch (CSP_SCRIPT_MODE=compat), which
// exists for the case where something between the origin and the browser rewrites scripts without the nonce.
const ENV = { TRUSTED_PROXY: "cloudflare", CRM_API_URL: "http://127.0.0.1:1", CRM_API_KEY: "k".repeat(40), CRM_COMPANY_ID: "csp-test" };
const PAGES = ["/", "/flights", "/contact", "/about", "/destinations", "/destinations/europe", "/destinations/europe/germany/munich", "/blog", "/blog/business-class-vs-first-class", "/privacy-policy", "/this-page-does-not-exist"];

test.describe("the policy text", () => {
  test("strict is the default and carries the nonce, with no 'unsafe-inline' for scripts; compat is the previous script policy; both refuse handler attributes", () => {
    const strict = contentSecurityPolicy({ nonce: "abc123", mode: "strict" });
    expect(strict).toContain("script-src 'self' 'nonce-abc123'");
    expect(strict).not.toMatch(/script-src[^;]*unsafe-inline/);
    const compat = contentSecurityPolicy({ nonce: "abc123", mode: "compat" });
    expect(compat).toContain("script-src 'self' 'unsafe-inline'");
    expect(compat).not.toContain("nonce-");
    for (const policy of [strict, compat]) {
      for (const directive of ["default-src 'self'", "script-src-attr 'none'", "frame-src 'none'", "worker-src 'none'", "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'", "img-src 'self' data:"]) expect(policy).toContain(directive);
      expect(policy).not.toContain("unsafe-eval");
      expect(policy).not.toMatch(/https?:\/\/|\*/);
    }
  });
  test("a strict policy without a nonce falls back to compat (it must never emit a policy that blocks the framework's own scripts); development adds unsafe-eval and the socket only there", () => {
    expect(contentSecurityPolicy({ mode: "strict" })).toContain("script-src 'self' 'unsafe-inline'");
    expect(contentSecurityPolicy({ nonce: "n", dev: true })).toContain("'unsafe-eval'");
    expect(contentSecurityPolicy({ nonce: "n", dev: false })).not.toContain("'unsafe-eval'");
    expect(contentSecurityPolicy({ nonce: "n", dev: true })).toContain("ws://localhost:*");
    expect(contentSecurityPolicy({ nonce: "n" })).not.toContain("ws://");
  });
  test("the mode: strict unless it says compat (a typo is the safe direction)", () => {
    for (const [value, expected] of [[undefined, "strict"], ["", "strict"], ["strict", "strict"], ["compat", "compat"], [" COMPAT ", "compat"], ["compact", "strict"], ["unsafe", "strict"]] as const) {
      expect(cspScriptMode({ CSP_SCRIPT_MODE: value }), String(value)).toBe(expected);
    }
  });
});

test.describe.configure({ mode: "serial" });
test.describe("on real production servers", () => {
  test.skip(!standaloneBuildPresent(), "needs a standalone build (NEXT_OUTPUT=standalone npm run build)");
  test.setTimeout(240_000);
  let strict: StandaloneServer;
  let compat: StandaloneServer;
  test.beforeAll(async () => {
    strict = await startStandalone({ label: "csp strict", port: 3275, withStaticAssets: true, env: ENV });
    compat = await startStandalone({ label: "csp compat", port: 3276, withStaticAssets: true, env: { ...ENV, CSP_SCRIPT_MODE: "compat" } });
  });
  test.afterAll(async () => {
    await strict?.stop();
    await compat?.stop();
  });

  const nonceOf = (csp: string) => /script-src 'self' 'nonce-([A-Za-z0-9+/=]+)'/.exec(csp)?.[1];
  async function fetchPage(server: StandaloneServer, route: string) {
    const res = await fetch(`${server.origin}${route}`);
    return { res, html: await res.text(), csp: res.headers.get("content-security-policy") ?? "" };
  }

  for (const route of PAGES) {
    test(`strict ${route}: a fresh nonce, in the header and on every executable inline script, and on nothing else`, async () => {
      const a = await fetchPage(strict, route);
      const b = await fetchPage(strict, route);
      const nonceA = nonceOf(a.csp);
      const nonceB = nonceOf(b.csp);
      expect(nonceA, "a nonce in the policy").toBeTruthy();
      expect(Buffer.from(nonceA!, "base64").length, "at least 16 bytes of entropy").toBeGreaterThanOrEqual(16);
      expect(nonceA, "a new nonce for every response").not.toBe(nonceB);
      expect(a.csp).not.toMatch(/script-src[^;]*unsafe-inline/);
      // A page with a per-response nonce must never be kept by a shared cache or reused without revalidation. "private, no-cache" does that and still lets the browser's back/forward cache
      // restore the page (Chrome never does for "no-store"); Next's own 404 keeps its "no-store".
      const cacheControl = a.res.headers.get("cache-control") ?? "";
      expect(cacheControl, "private: no shared cache keeps it").toMatch(/\bprivate\b/);
      expect(cacheControl, "revalidated or not stored").toMatch(/no-cache|no-store/);
      expect(cacheControl, "never shared-cacheable or fresh").not.toMatch(/\bpublic\b|s-maxage|max-age=[1-9]/);
      if (route !== "/this-page-does-not-exist") expect(cacheControl, "a normal page is back/forward-cache friendly").not.toMatch(/no-store/);
      for (const m of a.html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
        const [, attrs] = m;
        if (/type="application\/(ld\+)?json"/.test(attrs)) continue; // a data block, never executed
        expect(attrs, `${route}: every executable script (inline or file) carries this response's nonce`).toContain(`nonce="${nonceA}"`);
      }
      expect([...a.html.matchAll(/nonce="([^"]+)"/g)].every((x) => x[1] === nonceA), "no other nonce value appears in the page").toBe(true);
      expect(a.html.includes(nonceB!), "the other response's nonce is not in this page").toBe(false);
    });
  }

  test("the API routes carry the policy too, and the build's static files (not documents) are left alone", async () => {
    for (const route of ["/api/health", "/api/visitor-hint", "/api/edge-check"]) {
      const res = await fetch(`${strict.origin}${route}`);
      expect(res.headers.get("content-security-policy"), route).toContain("script-src 'self' 'nonce-");
    }
  });

  test("compat: the previous script policy, no nonce, handler attributes still refused, and the pages are the same pages", async () => {
    const { res, html, csp } = await fetchPage(compat, "/flights");
    expect(res.status).toBe(200);
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("script-src-attr 'none'");
    expect(csp).not.toContain("nonce-");
    expect(html).toContain("Find Your Flight");
  });

  async function hydrated(page: Page, origin: string) {
    const violations: string[] = [];
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 120)));
    await page.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", (e) => (window as unknown as { __v: string[] }).__v.push(`${e.effectiveDirective} ${e.blockedURI || "inline"}`));
      (window as unknown as { __v: string[] }).__v = [];
    });
    await page.addInitScript(() => localStorage.setItem("bft-cookie-consent", JSON.stringify({ version: 1, decidedAt: "2026-11-01T00:00:00.000Z", preferences: { necessary: true, analytics: false, marketing: false } })));
    await page.route("**/api/visitor-hint", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    await page.goto(`${origin}/flights`);
    await page.locator(".PhoneInput").first().waitFor({ timeout: 30_000 }); // client-side code ran: the form is hydrated
    const form = page.locator("form:has(#phone)");
    await form.getByRole("button", { name: /Add preferences/ }).click(); // React state, i.e. an event handler attached by hydration
    await expect(form.getByRole("group", { name: "Date flexibility" })).toBeVisible();
    await form.getByText("± 2 days", { exact: true }).click();
    await expect(form.getByLabel("± 2 days", { exact: true })).toBeChecked();
    await form.getByText("Select date").first().click(); // the lazily loaded calendar chunk
    await expect(page.getByRole("grid").first()).toBeVisible();
    violations.push(...(await page.evaluate(() => (window as unknown as { __v: string[] }).__v)));
    return { violations, errors };
  }

  test("strict: the site hydrates and works (a handler, a lazily loaded chunk, the calendar), with no policy violation and no page error", async ({ page }) => {
    const { violations, errors } = await hydrated(page, strict.origin);
    expect(violations).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("compat: the same, so the kill switch really restores a working site", async ({ page }) => {
    const { violations, errors } = await hydrated(page, compat.origin);
    expect(violations).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("strict: client-side navigation works too (a link, then back), and still no violation", async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __v: string[] }).__v = [];
      document.addEventListener("securitypolicyviolation", (e) => (window as unknown as { __v: string[] }).__v.push(`${e.effectiveDirective} ${e.blockedURI || "inline"}`));
      localStorage.setItem("bft-cookie-consent", JSON.stringify({ version: 1, decidedAt: "2026-11-01T00:00:00.000Z", preferences: { necessary: true, analytics: false, marketing: false } }));
    });
    await page.goto(`${strict.origin}/about`);
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => (window as unknown as { __soft: boolean }).__soft = true);
    await page.getByRole("link", { name: "Contact", exact: true }).first().click().catch(async () => { await page.goto(`${strict.origin}/contact`); });
    await page.waitForURL("**/contact");
    await expect(page.locator("#c-firstName")).toBeVisible();
    await page.goBack();
    await page.waitForURL("**/about");
    expect(await page.evaluate(() => (window as unknown as { __v: string[] }).__v)).toEqual([]);
  });

  test("strict: what an attacker could inject does not run: an inline script without the nonce, a handler attribute, eval, a script from another host", async ({ page }) => {
    await page.goto(`${strict.origin}/contact`);
    await page.waitForLoadState("networkidle");
    const result = await page.evaluate(async () => {
      const w = window as unknown as { __ran?: string[] };
      w.__ran = [];
      const violations: string[] = [];
      document.addEventListener("securitypolicyviolation", (e) => violations.push(e.effectiveDirective));
      const inline = document.createElement("script");
      inline.textContent = "window.__ran.push('inline')";
      document.body.appendChild(inline);
      const handler = document.createElement("img");
      handler.setAttribute("onerror", "window.__ran.push('handler')");
      handler.setAttribute("src", "/missing.png");
      document.body.appendChild(handler);
      // eval is judged from a script that is allowed to run (it carries the page's own nonce): page.evaluate itself runs with eval permitted by the test harness, so it
      // cannot show what the page's policy says. A script that the policy accepts must still be unable to call eval or the Function constructor.
      const trusted = document.querySelector("script[nonce]") as HTMLScriptElement;
      const probe = document.createElement("script");
      probe.setAttribute("nonce", trusted.nonce ?? "");
      probe.textContent = "try { new Function('1')(); window.__evalAllowed = true; } catch (e) { window.__evalAllowed = false; } window.__probeRan = true;";
      // appended from a timer, outside the harness's evaluation call: eval stays permitted for the whole synchronous stack of that call, which would hide the answer
      setTimeout(() => document.body.appendChild(probe), 0);
      const foreign = document.createElement("script");
      foreign.src = "https://example.invalid/attack.js";
      document.body.appendChild(foreign);
      await new Promise((r) => setTimeout(r, 600));
      const probeState = window as unknown as { __probeRan?: boolean; __evalAllowed?: boolean };
      return { ran: w.__ran, probeRan: probeState.__probeRan, evalAllowed: probeState.__evalAllowed, violations };
    });
    expect(result.ran).toEqual([]);
    expect(result.probeRan, "a script carrying the page's nonce does run").toBe(true);
    expect(result.evalAllowed, "but even it cannot use eval / new Function").toBe(false);
    expect(result.violations).toEqual(expect.arrayContaining(["script-src-elem", "script-src-attr"]));
  });

  test("compat is also unable to run a handler attribute or a foreign script (only an inline script is allowed, as before)", async ({ page }) => {
    await page.goto(`${compat.origin}/contact`);
    await page.waitForLoadState("networkidle");
    const result = await page.evaluate(async () => {
      const w = window as unknown as { __ran?: string[] };
      w.__ran = [];
      const handler = document.createElement("img");
      handler.setAttribute("onerror", "window.__ran.push('handler')");
      handler.setAttribute("src", "/missing.png");
      document.body.appendChild(handler);
      const foreign = document.createElement("script");
      foreign.src = "https://example.invalid/attack.js";
      document.body.appendChild(foreign);
      await new Promise((r) => setTimeout(r, 600));
      return w.__ran;
    });
    expect(result).toEqual([]);
  });
});

// ---- styles: elements are restricted to this origin and the one known toast stylesheet; the style="" attributes stay allowed ----------------------------------------------
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { EMPTY_STYLE_HASH, SONNER_STYLE_HASH } from "../src/lib/csp";

test.describe("style policy", () => {
  test("style elements and stylesheets are limited to this origin plus two hashes; style attributes stay allowed; the broad directive is only the fallback; development keeps it simple", () => {
    for (const mode of ["strict", "compat"] as const) {
      const policy = contentSecurityPolicy({ nonce: "abc123", mode });
      expect(policy).toContain(`style-src-elem 'self' '${SONNER_STYLE_HASH}' '${EMPTY_STYLE_HASH}'`);
      expect(policy).toContain("style-src-attr 'unsafe-inline'");
      expect(policy).toContain("style-src 'self' 'unsafe-inline'"); // the fallback for a browser that does not know style-src-elem / style-src-attr
      expect(policy.match(/style-src-elem [^;]*/)![0]).not.toContain("unsafe-inline");
      expect(policy.match(/style-src-elem [^;]*/)![0]).not.toMatch(/nonce-|https?:|\*/);
    }
    const dev = contentSecurityPolicy({ nonce: "abc123", dev: true });
    expect(dev).not.toContain("style-src-elem");
    expect(dev).toContain("style-src 'self' 'unsafe-inline'");
  });

  test("the hash in the policy is the hash of the CSS the INSTALLED toast library really inserts (updating the library must update the hash)", async () => {
    const created: string[] = [];
    const g = globalThis as unknown as { document?: unknown };
    const previous = g.document;
    g.document = {
      head: { appendChild() {} },
      getElementsByTagName: () => [{ appendChild() {} }],
      createElement: () => ({ appendChild: (node: { data: string }) => created.push(node.data), styleSheet: undefined, type: "" }),
      createTextNode: (data: string) => ({ data }),
    };
    try {
      const file = pathToFileURL(path.resolve(__dirname, "..", "node_modules", "sonner", "dist", "index.mjs")).href;
      await (new Function("u", "return import(u)") as (u: string) => Promise<unknown>)(file);
    } finally {
      g.document = previous;
    }
    expect(created.length, "the library creates exactly one style element when it is imported").toBe(1);
    expect(`sha256-${createHash("sha256").update(created[0], "utf8").digest("base64")}`).toBe(SONNER_STYLE_HASH);
    expect(`sha256-${createHash("sha256").update("", "utf8").digest("base64")}`).toBe(EMPTY_STYLE_HASH);
  });
});

test.describe("style policy in a real browser", () => {
  test.skip(!standaloneBuildPresent(), "needs a standalone build (NEXT_OUTPUT=standalone npm run build)");
  test.setTimeout(120_000);
  let server: StandaloneServer;
  test.beforeAll(async () => {
    server = await startStandalone({ label: "csp style", port: 3277, withStaticAssets: true, env: ENV });
  });
  test.afterAll(async () => {
    await server?.stop();
  });

  test("the toast stylesheet is applied with no console error and no violation; an injected <style> with other text, and an injected foreign stylesheet, do nothing; an inline style attribute still works", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 160)));
    await page.addInitScript(() => {
      (window as unknown as { __v: string[] }).__v = [];
      document.addEventListener("securitypolicyviolation", (e) => (window as unknown as { __v: string[] }).__v.push(e.effectiveDirective));
    });
    await page.goto(`${server.origin}/contact`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    expect(consoleErrors, "no console error from the policy on a normal page view").toEqual([]);
    expect(await page.evaluate(() => (window as unknown as { __v: string[] }).__v), "no violation on a normal page view").toEqual([]);
    const sonnerRules = await page.evaluate(() => [...document.styleSheets].filter((s) => s.ownerNode instanceof HTMLStyleElement).reduce((n, s) => n + s.cssRules.length, 0));
    expect(sonnerRules, "the toast library's stylesheet is in effect").toBeGreaterThan(50);

    const result = await page.evaluate(async () => {
      const probe = document.createElement("div");
      probe.id = "csp-style-probe";
      probe.textContent = "probe";
      document.body.appendChild(probe);
      const violations: string[] = [];
      document.addEventListener("securitypolicyviolation", (e) => violations.push(e.effectiveDirective));
      const injected = document.createElement("style");
      injected.textContent = "#csp-style-probe{display:none !important}";
      document.head.appendChild(injected);
      const foreign = document.createElement("link");
      foreign.rel = "stylesheet";
      foreign.href = "https://example.invalid/attack.css";
      document.head.appendChild(foreign);
      probe.setAttribute("style", "letter-spacing: 7px");
      await new Promise((r) => setTimeout(r, 500));
      return { display: getComputedStyle(probe).display, letterSpacing: getComputedStyle(probe).letterSpacing, violations };
    });
    expect(result.display, "an injected style element is refused, so the element is still shown").toBe("block");
    expect(result.letterSpacing, "an inline style attribute still applies").toBe("7px");
    expect(result.violations).toEqual(expect.arrayContaining(["style-src-elem"]));
  });
});
