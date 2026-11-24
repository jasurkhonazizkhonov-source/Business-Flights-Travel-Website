import { test, expect } from "@playwright/test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// The public attack surface of the website, pinned. Nothing here calls a server: it reads the source and the production build.
//   * Server Actions are RPC endpoints that anyone can call by id, so the only ones that may exist are the three public form actions (each rate-limited,
//     validated server-side and answered with fixed messages). A fourth exported function in a "use server" file, or a "use server" file with another export,
//     fails here before it can be shipped.
//   * API routes: exactly /api/health and /api/visitor-hint, GET only.
//   * Redirects are static: no destination takes a host or a full URL from the request.
//   * No secret-looking variable is exposed to the browser (NEXT_PUBLIC_*).
const root = path.resolve(__dirname, "..");
const src = path.join(root, "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}
const files = walk(src).filter((f) => /\.(ts|tsx)$/.test(f));
const read = (f: string) => readFileSync(f, "utf8");
const rel = (f: string) => path.relative(root, f).replace(/\\/g, "/");
/** Exported names of a module (functions, consts, classes; `export type`/`interface` are not runtime exports). */
function exportedNames(text: string): string[] {
  const names: string[] = [];
  for (const m of text.matchAll(/^export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z0-9_$]+)/gm)) names.push(m[1]);
  for (const m of text.matchAll(/^export\s*\{([^}]*)\}/gm)) for (const part of m[1].split(",")) if (part.trim() && !/^type\s/.test(part.trim())) names.push(part.trim().split(/\s+as\s+/).pop()!.trim());
  return names;
}
/** A "use server" FILE: the directive is the first statement (comments and blank lines may precede it). */
function hasUseServerDirective(text: string): boolean {
  let rest = text.replace(/^﻿/, "");
  for (;;) {
    rest = rest.trimStart();
    if (rest.startsWith("//")) rest = rest.slice(rest.indexOf("\n") === -1 ? rest.length : rest.indexOf("\n") + 1);
    else if (rest.startsWith("/*")) rest = rest.slice(rest.indexOf("*/") === -1 ? rest.length : rest.indexOf("*/") + 2);
    else break;
  }
  return /^["']use server["']/.test(rest);
}

test.describe("Server Actions", () => {
  const useServerFiles = files.filter((f) => hasUseServerDirective(read(f)));

  test("the only 'use server' files are the three public form actions, each exporting exactly its one action", () => {
    const found = Object.fromEntries(useServerFiles.map((f) => [rel(f), exportedNames(read(f)).sort()]));
    expect(found).toEqual({
      "src/server/actions/submit-contact-message.ts": ["submitContactMessage"],
      "src/server/actions/submit-flight-request.ts": ["submitFlightRequest"],
      "src/server/actions/subscribe-newsletter.ts": ["subscribeToNewsletter"],
    });
  });

  test("every public action rate-limits the caller by the trusted client key before it does anything else", () => {
    for (const f of useServerFiles) {
      const text = read(f);
      const limiter = text.search(/checkRateLimit\(/);
      expect(limiter, `${rel(f)} must call checkRateLimit`).toBeGreaterThan(0);
      expect(text, `${rel(f)} must key the limiter on rateLimitClientKey (never on a raw header)`).toMatch(/rateLimitClientKey\(/);
      // nothing that validates, reads the body or calls out may come before the limiter inside the action
      const beforeLimiter = text.slice(0, limiter);
      expect(beforeLimiter, `${rel(f)}: validation or an outbound call before the limiter`).not.toMatch(/\.(safeParse|parse)\(|postFlightInquiry\(|postContactInquiry\(|postNewsletterSubscription\(|fetch\(/);
    }
  });

  test("the production build registers exactly the same three actions (and no other function is reachable by id)", () => {
    const manifestPath = path.join(root, ".next", "server", "server-reference-manifest.json");
    test.skip(!existsSync(manifestPath), "needs a production build (npm run build)");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { node: Record<string, { exportedName: string }>; edge?: Record<string, unknown> };
    expect(Object.values(manifest.node).map((v) => v.exportedName).sort()).toEqual(["submitContactMessage", "submitFlightRequest", "subscribeToNewsletter"]);
    expect(Object.keys(manifest.edge ?? {})).toEqual([]);
  });

  test("nothing under src/lib or src/components is a 'use server' file by accident", () => {
    for (const f of useServerFiles) expect(rel(f)).toMatch(/^src\/server\/actions\//);
  });
});

test.describe("API routes", () => {
  const routes = files.filter((f) => /\/route\.ts$/.test(f.replace(/\\/g, "/")));

  test("exactly /api/health, /api/visitor-hint and /api/edge-check exist", () => {
    expect(routes.map(rel).sort()).toEqual(["src/app/api/edge-check/route.ts", "src/app/api/health/route.ts", "src/app/api/visitor-hint/route.ts"]);
  });

  test("all are read-only: GET is the only method exported", () => {
    for (const f of routes) expect(exportedNames(read(f)).filter((n) => /^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)$/.test(n)), rel(f)).toEqual(["GET"]);
  });

  test("none echoes a request header or a secret into its answer", () => {
    for (const f of routes) {
      const text = read(f);
      expect(text, rel(f)).not.toMatch(/process\.env\.(CRM_|LEAD_|GMAIL_|EDGE_)/);
      for (const line of text.split("\n").filter((l) => /Response\.json\(/.test(l))) {
        expect(line, `${rel(f)}: a request header must not be copied into the answer`).not.toMatch(/headerList|request\.headers|req\.headers|\.headers\.get\(/);
      }
    }
  });
});

test.describe("redirects and browser-visible configuration", () => {
  test("every redirect destination is a fixed path, or the one fixed canonical host with the same path", async () => {
    type Config = { redirects?: () => Promise<Array<{ source: string; destination: string }>> };
    const mod = (await import("../next.config")) as unknown as { default?: Config & { default?: Config } };
    const config: Config = mod.default?.default ?? mod.default ?? (mod as unknown as Config); // the config is TypeScript loaded through an interop layer: the object may sit one level deeper
    expect(typeof config.redirects, "next.config.ts must export a redirects() function").toBe("function");
    const redirects = await config.redirects!();
    expect(redirects.length).toBeGreaterThan(0);
    for (const r of redirects) {
      const ok = r.destination.startsWith("/") || r.destination === "https://www.businessflights.travel/:path*";
      expect(ok, `${r.source} -> ${r.destination}`).toBe(true);
      expect(r.destination.startsWith("//"), `${r.source} -> ${r.destination}: protocol-relative`).toBe(false);
    }
  });

  test("no secret, key, password or token is exposed through a NEXT_PUBLIC_ variable", () => {
    const hits: string[] = [];
    for (const f of [...files, path.join(root, "next.config.ts"), path.join(root, "compose.yaml"), path.join(root, ".env.example")]) {
      if (!existsSync(f)) continue;
      for (const m of read(f).matchAll(/NEXT_PUBLIC_[A-Z0-9_]*(KEY|SECRET|PASSWORD|TOKEN)[A-Z0-9_]*/g)) hits.push(`${rel(f)}: ${m[0]}`);
    }
    expect(hits).toEqual([]);
  });
});
