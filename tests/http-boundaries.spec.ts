import { test, expect } from "@playwright/test";
import http from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { standaloneBuildPresent, startStandalone, type StandaloneServer } from "./support/standalone-server";

// What the PRODUCTION server (standalone build) does with hostile or malformed requests, over raw HTTP: the image optimiser as an SSRF vector, path and
// redirect confusion, a forged Host header, a cross-origin Server Action call, malformed Server Action bodies, and verbs a page should not answer.
// Every request here ends at a refusal or at validation: the CRM is given an address nothing listens on, and the newsletter action is called with an
// invalid e-mail address, so nothing could be sent anywhere even if a request were wrongly accepted.
//
// Needs `NEXT_OUTPUT=standalone npm run build` first; otherwise skipped (never "passed").

const PORT = 3253;
test.describe.configure({ mode: "serial" });
test.describe("hostile and malformed requests (standalone server)", () => {
  test.skip(!standaloneBuildPresent(), "needs a standalone build (NEXT_OUTPUT=standalone npm run build)");
  test.setTimeout(120_000);

  let server: StandaloneServer;
  const ids: Record<string, string> = {};

  test.beforeAll(async () => {
    server = await startStandalone({ label: "http boundaries", port: PORT, env: { TRUSTED_PROXY: "cloudflare", CRM_API_URL: "http://127.0.0.1:1", CRM_API_KEY: "k".repeat(40), CRM_COMPANY_ID: "boundary-test" } });
    const manifest = JSON.parse(readFileSync(path.join(server.layout, ".next", "server", "server-reference-manifest.json"), "utf8")) as { node: Record<string, { exportedName: string }> };
    for (const [id, v] of Object.entries(manifest.node)) ids[v.exportedName] = id;
  });
  test.beforeEach(() => server.assertAlive());
  test.afterAll(async () => {
    await server?.stop();
  });

  /** A raw request: unlike fetch, it can send any Host header and any method. */
  function raw(method: string, urlPath: string, headers: Record<string, string> = {}, body?: string) {
    return new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }>((resolve, reject) => {
      const req = http.request({ host: "127.0.0.1", port: PORT, method, path: urlPath, headers: { ...(body !== undefined ? { "content-length": String(Buffer.byteLength(body)) } : {}), ...headers }, timeout: 20_000 }, (res) => {
        let b = "";
        res.on("data", (d) => (b += d));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: b }));
      });
      req.on("error", reject);
      req.on("timeout", () => req.destroy(new Error("timeout")));
      if (body !== undefined) req.write(body);
      req.end();
    });
  }
  // Text that would reveal how the server is built or where it runs. (Not a bare "stack" or a drive letter: React's flight payload contains "3f:\".)
  const LEAKS = /(\n\s+at [\w$.<>]+ \(|node_modules[\\/]|[A-Z]:\\(?:Users|Claude|Program)|\/(?:home|root|usr|app)\/[\w.-]+\/|ENOENT|ECONN|Invalid Server Actions request|DATABASE_URL|CRM_API_KEY|LEAD_INGEST_SECRET)/;

  test("the image optimiser fetches only from the allow-listed host and only the allowed widths and qualities (no SSRF)", async () => {
    const refused = [
      "url=https%3A%2F%2Fevil.example%2Fa.png&w=640&q=75",
      "url=http%3A%2F%2F127.0.0.1%3A3253%2Fapi%2Fhealth&w=640&q=75",
      "url=http%3A%2F%2F169.254.169.254%2Flatest%2Fmeta-data&w=640&q=75",
      "url=https%3A%2F%2Fimages.unsplash.com%40evil.example%2Fa.png&w=640&q=75", // userinfo trick
      "url=https%3A%2F%2Fimages.unsplash.com.evil.example%2Fa.png&w=640&q=75", // allow-listed name as a prefix
      "url=file%3A%2F%2F%2Fetc%2Fpasswd&w=640&q=75",
      "url=%2Fbrand-mark.png&w=641&q=75", // width not on the list
      "url=%2Fbrand-mark.png&w=99999&q=75",
      "url=%2Fbrand-mark.png&w=640&q=33", // quality not on the list
      "w=640&q=75", // no url
      "url=a&url=b&w=640&q=75", // repeated parameter
    ];
    for (const query of refused) {
      const r = await raw("GET", `/_next/image?${query}`);
      expect(r.status, query).toBe(400);
      expect(r.body, query).not.toMatch(LEAKS);
    }
    expect((await raw("GET", "/_next/image?url=%2F..%2F..%2Fpackage.json&w=640&q=75")).status).toBe(404); // traversal out of the public folder
  });

  test("path tricks never become an off-site redirect, and nothing outside public/ is served", async () => {
    for (const p of ["//evil.example", "//evil.example/", "//terms", "/flights//", "/flights/"]) {
      const r = await raw("GET", p);
      expect(r.status, p).toBe(308);
      const location = String(r.headers.location);
      expect(location, p).toMatch(/^\/(?!\/)/); // a path on THIS site: never "//host" (protocol-relative) and never an absolute URL
      expect(location, p).not.toMatch(/evil\.example\.|^https?:/);
    }
    for (const p of ["/%5Cevil.example", "/%2f%2fevil.example", "/%0d%0aSet-Cookie:x=1", "/FLIGHTS", "/blog/..%2f..%2fprivacy-policy", "/_next/static/../../package.json", "/%2e%2e/%2e%2e/etc/passwd", "/_next/static/%2e%2e/%2e%2e/server.js",
      "/.env", "/.git/config", "/package.json", "/next.config.ts", "/_next/server/app/page.js", "/server.js", "/api/..%2fhealth"]) {
      const r = await raw("GET", p);
      expect(r.status, p).toBe(404);
      expect(r.headers.location, p).toBeUndefined();
      expect(r.headers["set-cookie"], p).toBeUndefined();
      expect(r.body, p).not.toMatch(LEAKS);
    }
  });

  test("a forged Host or X-Forwarded-Host is never written into the page, its canonical URL, the sitemap or robots.txt", async () => {
    for (const headers of ([{ host: "evil.example" }, { host: `127.0.0.1:${PORT}`, "x-forwarded-host": "evil.example" }, { host: "businessflights.travel.evil.example" }, { host: `127.0.0.1:${PORT}`, "x-forwarded-proto": "http" }] as Array<Record<string, string>>)) {
      for (const p of ["/flights?to=LHR", "/", "/sitemap.xml", "/robots.txt"]) {
        const r = await raw("GET", p, headers);
        expect(r.status, `${p} ${JSON.stringify(headers)}`).toBe(200);
        expect(r.body, `${p} ${JSON.stringify(headers)}`).not.toContain("evil.example");
      }
    }
    const page = (await raw("GET", "/flights", { host: "evil.example" })).body;
    expect(page).toContain('<link rel="canonical" href="https://www.businessflights.travel/flights"');
    // the one host the application redirects is the bare apex, and only to the www host with path and query kept
    const apex = await raw("GET", "/flights?to=LHR", { host: "businessflights.travel" });
    expect(apex.status).toBe(308);
    expect(apex.headers.location).toBe("https://www.businessflights.travel/flights?to=LHR");
    expect((await raw("GET", "/flights", { host: "evilbusinessflights.travel" })).status).toBe(200);
  });

  test("a Server Action called from another origin is refused before it runs; a same-origin call reaches validation only", async () => {
    const body = JSON.stringify([{ email: "not-an-email" }]); // invalid on purpose: it can never reach the CRM
    const call = (extra: Record<string, string>) => raw("POST", "/", { "content-type": "text/plain;charset=UTF-8", "next-action": ids.subscribeToNewsletter, host: `127.0.0.1:${PORT}`, ...extra }, body);
    const same = await call({ origin: `http://127.0.0.1:${PORT}` });
    expect(same.status).toBe(200);
    expect(same.body).toContain("Please enter a valid email address.");
    for (const origin of ["https://evil.example", "null", "https://www.businessflights.travel"]) {
      const r = await call({ origin });
      expect(r.status, origin).toBe(500);
      expect(r.body, origin).not.toContain("Please enter a valid email address."); // the action did not run
      expect(r.body, origin).not.toMatch(LEAKS);
    }
    // No ambient credentials exist to ride on: the server never sets a cookie, on a refused or an accepted call.
    expect(same.headers["set-cookie"]).toBeUndefined();
  });

  test("malformed Server Action calls get a bare refusal: no stack, no path, no framework detail", async () => {
    const real = ids.submitContactMessage;
    const cases: Array<[string, Record<string, string>, string]> = [
      ["unknown action id", { "next-action": "00" + "a".repeat(40), "content-type": "text/plain" }, "[]"],
      ["json content type", { "next-action": "00" + "a".repeat(40), "content-type": "application/json" }, "{}"],
      ["multipart without a boundary", { "next-action": "00" + "a".repeat(40), "content-type": "multipart/form-data" }, "x"],
      ["real id, body is not JSON", { "next-action": real, "content-type": "text/plain" }, "{not json"],
      ["real id, prototype-pollution payload", { "next-action": real, "content-type": "text/plain" }, '[{"__proto__":{"polluted":true},"constructor":{"prototype":{"x":1}}}]'],
      ["real id, wrong shape (string instead of object)", { "next-action": real, "content-type": "text/plain" }, '["just a string"]'],
      ["real id, empty argument list", { "next-action": real, "content-type": "text/plain" }, "[]"],
    ];
    for (const [label, headers, body] of cases) {
      const r = await raw("POST", "/", { host: `127.0.0.1:${PORT}`, origin: `http://127.0.0.1:${PORT}`, ...headers }, body);
      expect(r.status, label).toBeLessThan(600);
      expect(r.body, label).not.toMatch(LEAKS);
      expect(r.headers["set-cookie"], label).toBeUndefined();
    }
    const unknown = await raw("POST", "/", { "next-action": "00" + "a".repeat(40), "content-type": "text/plain" }, "[]");
    expect(unknown.status).toBe(409);
    expect(unknown.body).toBe("Server Action unavailable.");
    // the prototype was not polluted for later requests
    expect((await raw("GET", "/api/health")).status).toBe(200);
    expect(server.logs()).not.toMatch(/polluted/);
  });

  test("a redirect never reflects raw markup from the request path (the application's own 308s carry no content-type or nosniff, so this is what keeps them harmless)", async () => {
    // A tool, unlike a browser, can put '<' and '>' on the request line. The redirect's Location header and its small body (the destination path) must
    // come back percent-encoded. Sent over a raw socket because Node's HTTP client refuses some of these characters.
    const net = await import("node:net");
    const rawLine = (line: string) =>
      new Promise<string>((resolve) => {
        const socket = net.connect(PORT, "127.0.0.1", () => socket.write(`${line} HTTP/1.1\r\nHost: 127.0.0.1:${PORT}\r\nConnection: close\r\n\r\n`));
        let received = "";
        socket.on("data", (d) => (received += d));
        socket.on("end", () => resolve(received));
        socket.on("error", () => resolve(received));
        setTimeout(() => (socket.destroy(), resolve(received)), 8000);
      });
    for (const line of ["GET //<script>alert(1)</script>", "GET /<script>alert(1)</script>//", "GET //<img/src=x/onerror=alert(1)>"]) {
      const reply = await rawLine(line);
      const [head, ...rest] = reply.split("\r\n\r\n");
      const body = rest.join("\r\n\r\n");
      expect(head, line).toMatch(/^HTTP\/1\.1 308/);
      expect(head, line).not.toMatch(/[<>]/);
      expect(body, line).not.toMatch(/[<>]/);
      expect(head.toLowerCase(), line).not.toContain("content-type: text/html");
    }
  });

  test("static pages and files answer only GET/HEAD; error pages say nothing about the server", async () => {
    for (const p of ["/", "/sitemap.xml", "/robots.txt", "/_next/image?url=%2Fbrand-mark.png&w=640&q=75"]) {
      for (const method of ["PUT", "DELETE", "PATCH", "TRACE", "OPTIONS"]) expect((await raw(method, p)).status, `${method} ${p}`).toBe(405);
    }
    const notFound = await raw("GET", "/no-such-page-xyz");
    expect(notFound.status).toBe(404);
    expect(notFound.body).not.toMatch(LEAKS);
    expect(notFound.headers["x-powered-by"]).toBeUndefined();
    expect(notFound.headers.server).toBeUndefined();
  });
});
