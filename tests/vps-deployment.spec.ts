import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getDatabaseTlsMode, isAllowedPlaintextDatabaseHost, resolveDatabaseSsl } from "../src/lib/db-tls";
import { CLOUDFLARE_GEO_SOURCE, GEO_SOURCE, decodeUtf8Header, readCloudflareApproximateLocation } from "../src/lib/ip-geo";
import { captureSubmissionInfo } from "../src/lib/submission-info";
import { resolveClientIp } from "../src/lib/client-ip";

// Self-hosted (OVH VPS + Docker Compose + Cloudflare Tunnel) deployment: the TLS policy for the private database, visitor IP /
// location behind Cloudflare, and the static properties of the container files. None of this needs Docker or a database; what could
// not be exercised without them is listed in docs/DEPLOYMENT_VPS.md ("What was and was not tested").
const root = path.resolve(__dirname, "..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) saved[k] = process.env[k];
  try {
    for (const [k, v] of Object.entries(vars)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    return fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}
const H = (o: Record<string, string>) => new Headers(o);

test.describe("database TLS (src/lib/db-tls.ts)", () => {
  const DB = "postgresql://role:pw@db:5432/app";
  const PEM = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----";

  test("default is unchanged: encrypted, not identity-verified (Vercel / Aiven keep working)", () => {
    expect(resolveDatabaseSsl({ DATABASE_URL: "postgresql://u:p@example.aivencloud.com:1234/x" })).toEqual({ rejectUnauthorized: false });
    expect(getDatabaseTlsMode({})).toBe("unverified");
  });

  test("CA and system verification turn certificate checking ON", () => {
    expect(resolveDatabaseSsl({ DATABASE_SSL_CA: PEM })).toEqual({ rejectUnauthorized: true, ca: PEM });
    expect(resolveDatabaseSsl({ DATABASE_SSL_CA: PEM.replace(/\n/g, "\\n") })).toEqual({ rejectUnauthorized: true, ca: PEM });
    expect(resolveDatabaseSsl({ DATABASE_SSL_VERIFY: "system" })).toEqual({ rejectUnauthorized: true });
    expect(() => resolveDatabaseSsl({ DATABASE_SSL_CA: "not a certificate" })).toThrow(/PEM/);
  });

  test('"disable" works only for the exact allow-listed hosts', () => {
    for (const host of ["db", "DB", "localhost", "127.0.0.1", "[::1]"]) {
      expect(resolveDatabaseSsl({ DATABASE_SSL_MODE: "disable", DATABASE_URL: `postgresql://u:p@${host}:5432/x` }), host).toBe(false);
    }
    expect(getDatabaseTlsMode({ DATABASE_SSL_MODE: "disable" })).toBe("disabled");
  });

  test('"disable" is refused for every other host, so TLS can never be silently dropped for a public or unintended database', () => {
    const refused = [
      "postgresql://u:p@db.example.com:5432/x", // public-looking
      "postgresql://u:p@postgres:5432/x", // other single-label name
      "postgresql://u:p@host.docker.internal:5432/x", // the Docker host
      "postgresql://u:p@something.internal:5432/x",
      "postgresql://u:p@10.0.0.5:5432/x", // private IP is not a container name
      "postgresql://u:p@192.168.1.10:5432/x",
      "postgresql://u:p@db.:5432/x", // trailing dot
      "postgresql://u:p@db:5432/x?host=attacker.example", // driver would connect elsewhere
      "postgresql://u:p@db:5432/x?hostaddr=203.0.113.9",
      "not a url",
    ];
    for (const url of refused) expect(() => resolveDatabaseSsl({ DATABASE_SSL_MODE: "disable", DATABASE_URL: url }), url).toThrow(/DATABASE_SSL_MODE=disable/);
    expect(() => resolveDatabaseSsl({ DATABASE_SSL_MODE: "disable" })).toThrow(/DATABASE_SSL_MODE=disable/); // no URL at all
  });

  test("contradictory or unknown settings are refused, never guessed", () => {
    expect(() => resolveDatabaseSsl({ DATABASE_SSL_MODE: "disable", DATABASE_URL: DB, DATABASE_SSL_CA: PEM })).toThrow(/conflicts/);
    expect(() => resolveDatabaseSsl({ DATABASE_SSL_MODE: "disable", DATABASE_URL: DB, DATABASE_SSL_VERIFY: "system" })).toThrow(/conflicts/);
    for (const v of ["require", "false", "off", "verify-full", "true"]) expect(() => resolveDatabaseSsl({ DATABASE_SSL_MODE: v, DATABASE_URL: DB }), v).toThrow(/must be "disable"/);
    expect(isAllowedPlaintextDatabaseHost("db")).toBe(true);
    expect(isAllowedPlaintextDatabaseHost("db.")).toBe(false);
  });

  test("error messages never echo the connection string or certificate", () => {
    try {
      resolveDatabaseSsl({ DATABASE_SSL_MODE: "disable", DATABASE_URL: "postgresql://secretuser:secretpw@db.example.com:5432/x" });
    } catch (e) {
      expect(String((e as Error).message)).not.toMatch(/secretuser|secretpw|example\.com/);
    }
  });

  test("both connection sites use the shared resolver (no stray rejectUnauthorized:false)", () => {
    for (const f of ["src/lib/prisma.ts", "src/server/schema-ready.ts"]) {
      // Code only: the comments in these files describe the historical default.
      const code = read(f)
        .split("\n")
        .filter((line) => !line.trim().startsWith("//"))
        .join("\n");
      expect(code, f).toContain("resolveDatabaseSsl()");
      expect(code, f).not.toMatch(/rejectUnauthorized:\s*false/);
    }
  });
});

test.describe("visitor IP and location behind Cloudflare (TRUSTED_PROXY=cloudflare)", () => {
  const cf = (extra: Record<string, string> = {}) => H({ "cf-connecting-ip": "198.51.100.50", ...extra });

  test("the address comes from CF-Connecting-IP only; a forged X-Forwarded-For / X-Real-IP / Forwarded / Vercel header is ignored", () => {
    withEnv({ TRUSTED_PROXY: "cloudflare", VERCEL: undefined }, () => {
      const r = resolveClientIp(cf({ "x-forwarded-for": "8.8.8.8", "x-real-ip": "1.1.1.1", forwarded: "for=9.9.9.9", "x-vercel-forwarded-for": "4.4.4.4", "true-client-ip": "5.5.5.5" }));
      expect(r).toEqual({ ok: true, address: "198.51.100.50", version: "v4" });
      // No CF-Connecting-IP => unknown, never a guess from the forgeable headers.
      expect(resolveClientIp(H({ "x-forwarded-for": "8.8.8.8" }))).toEqual({ ok: false, reason: "no_header" });
    });
  });

  test("IPv6, private/reserved and malformed values are handled safely", () => {
    withEnv({ TRUSTED_PROXY: "cloudflare" }, () => {
      expect(resolveClientIp(H({ "cf-connecting-ip": "2607:F8B0:4005:80A::200E" }))).toEqual({ ok: true, address: "2607:f8b0:4005:80a::200e", version: "v6" });
      expect(resolveClientIp(H({ "cf-connecting-ip": "10.0.0.7" }))).toEqual({ ok: false, reason: "private_or_reserved" });
      expect(resolveClientIp(H({ "cf-connecting-ip": "not-an-ip" }))).toEqual({ ok: false, reason: "invalid" });
    });
  });

  test("without a trusted proxy nothing is believed (the secure default)", () => {
    withEnv({ TRUSTED_PROXY: undefined, VERCEL: undefined }, () => {
      expect(resolveClientIp(cf())).toEqual({ ok: false, reason: "no_trusted_proxy" });
    });
  });

  test("Cloudflare location headers are read, decoded from UTF-8, labelled approximate, and Tor / unknown are not a country", () => {
    const loc = readCloudflareApproximateLocation(
      H({ "cf-ipcountry": "br", "cf-region-code": "sp", "cf-region": "SÃ£o Paulo", "cf-ipcity": "SÃ£o Paulo", "cf-timezone": "America/Sao_Paulo" }),
    );
    expect(loc).toEqual({ city: "São Paulo", regionCode: "SP", region: "São Paulo", country: "Brazil", countryCode: "BR", timeZone: "America/Sao_Paulo" });
    expect(readCloudflareApproximateLocation(H({ "cf-ipcountry": "T1" }))).toBeUndefined();
    expect(readCloudflareApproximateLocation(H({ "cf-ipcountry": "XX" }))).toBeUndefined();
    // Only IP Geolocation on (no Managed Transform): just the country.
    expect(readCloudflareApproximateLocation(H({ "cf-ipcountry": "AU" }))).toEqual({ country: "Australia", countryCode: "AU" });
    // Hostile or malformed values are dropped, not passed on.
    expect(readCloudflareApproximateLocation(H({ "cf-ipcountry": "<script>", "cf-timezone": "Not/AZone", "cf-region-code": "<b>" }))).toBeUndefined();
    expect(decodeUtf8Header("plain ascii")).toBe("plain ascii");
    expect(decodeUtf8Header("ÿþ")).toBeUndefined(); // not valid UTF-8
  });

  test("captureSubmissionInfo: Cloudflare headers only count in cloudflare mode; Vercel headers never do there; missing geo is a safe no-location", () => {
    const geo = { "cf-ipcountry": "US", "cf-ipcity": "Los Angeles", "cf-region-code": "CA", "cf-timezone": "America/Los_Angeles" };
    const vercelGeo = { "x-vercel-ip-country": "DE", "x-vercel-ip-city": "Munich" };
    withEnv({ TRUSTED_PROXY: "cloudflare" }, () => {
      const { info } = captureSubmissionInfo(cf({ ...geo, ...vercelGeo }));
      expect(info.ip?.address).toBe("198.51.100.50");
      expect(info.location).toMatchObject({ city: "Los Angeles", countryCode: "US", region: "California" });
      expect(info.locationSource).toBe(CLOUDFLARE_GEO_SOURCE);
      const bare = captureSubmissionInfo(cf());
      expect(bare.info.ip?.address).toBe("198.51.100.50");
      expect(bare.info.location).toBeUndefined(); // no geo headers: submission still has everything else
      expect(bare.info.locationSource).toBeUndefined();
    });
    withEnv({ TRUSTED_PROXY: "vercel" }, () => {
      const { info } = captureSubmissionInfo(H({ "x-vercel-forwarded-for": "198.51.100.9", ...vercelGeo, ...geo }));
      expect(info.location).toMatchObject({ city: "Munich", countryCode: "DE" });
      expect(info.locationSource).toBe(GEO_SOURCE);
    });
    withEnv({ TRUSTED_PROXY: "none" }, () => {
      const { info } = captureSubmissionInfo(cf({ ...geo }));
      expect(info.ip).toBeUndefined();
      expect(info.location).toBeUndefined();
    });
  });
});

test.describe("container files (static checks; Docker itself was not available to run them)", () => {
  const dockerfile = read("Dockerfile");
  const compose = read("compose.yaml");

  test("Dockerfile: pinned base image, non-root runtime, health check, no secrets, no migrations or schema creation", () => {
    expect(dockerfile).toMatch(/^ARG NODE_IMAGE=node:\d+\.\d+\.\d+-bookworm-slim@sha256:[0-9a-f]{64}$/m);
    expect(dockerfile).toMatch(/^USER node$/m);
    expect(dockerfile).toMatch(/^HEALTHCHECK .*scripts\/healthcheck\.mjs/m);
    expect(dockerfile).toMatch(/^CMD \["node", "server\.js"\]$/m);
    expect(dockerfile).toMatch(/NEXT_OUTPUT=standalone/);
    expect(dockerfile).not.toMatch(/\bARG\s+\w*(PASSWORD|SECRET|TOKEN|DATABASE_URL|KEY)\w*/i);
    expect(dockerfile).not.toMatch(/ENV\s+(DATABASE_URL|GMAIL_APP_PASSWORD)/);
    expect(dockerfile).not.toMatch(/prisma migrate|prisma db push|vercel-build|bootstrap/);
    expect(dockerfile).not.toMatch(/COPY\s+[^\n]*\.env(\s|$)/);
    expect(dockerfile).toContain("-name '.env'"); // the build fails if an env file slipped into the image
  });

  test(".dockerignore keeps env files, keys and local tooling state out of the build context", () => {
    const ignore = read(".dockerignore");
    for (const entry of ["**/.env", "**/.env.*", "**/*.pem", "**/*.key", ".git", "node_modules", ".next"]) expect(ignore, entry).toContain(entry);
    expect(ignore).toMatch(/!\*\*\/\.env\.vps\.example/);
  });

  test("compose: one service, own project, nothing published, only external networks shared, secrets by reference", () => {
    expect(compose).toMatch(/^name: business-flights-travel$/m);
    const servicesBlock = compose.slice(compose.indexOf("\nservices:"), compose.indexOf("\nnetworks:"));
    const services = [...servicesBlock.matchAll(/^ {2}([a-z][\w-]*):\s*$/gm)].map((m) => m[1]);
    expect(services).toEqual(["web"]); // no db, no cloudflared, no CRM service defined here
    expect(compose).not.toMatch(/^\s+ports:/m);
    expect(compose).not.toMatch(/published:/);
    expect(compose).toMatch(/^\s+expose:\s*\n\s+- "3000"/m);
    expect(compose).not.toMatch(/privileged:|network_mode:|pid: host|cap_add:|\/var\/run\/docker\.sock/);
    expect(compose).toMatch(/cap_drop:\s*\n\s+- ALL/);
    expect(compose).toMatch(/no-new-privileges:true/);
    expect(compose).toMatch(/restart: unless-stopped/);
    // Both shared networks are EXTERNAL: compose must refuse to start rather than create an empty one.
    expect(compose).toMatch(/edge:\s*\n\s+external: true/);
    expect(compose).toMatch(/crm_data:\s*\n\s+external: true/);
    expect(compose).toMatch(/aliases: \[bft-web\]/);
    expect(compose).not.toMatch(/\bvolumes:/); // no volumes at all: this site stores no files
    expect(compose).not.toMatch(/-v\b|down -v|prune/);
  });

  test("compose: trust and schema settings are fixed, and every secret is a ${VAR} reference (no literal credential)", () => {
    expect(compose).toMatch(/TRUSTED_PROXY: cloudflare/);
    expect(compose).toMatch(/DATABASE_AUTO_INIT: "false"/); // the website never creates or alters schema
    expect(compose).toMatch(/DATABASE_URL: \$\{DATABASE_URL:\?/);
    expect(compose).toMatch(/GMAIL_APP_PASSWORD: \$\{GMAIL_APP_PASSWORD:\?/);
    expect(compose).not.toMatch(/postgresql:\/\/[^\s$]*:[^\s$@]+@/); // no literal user:password@ URL
  });

  test(".env.vps.example holds placeholders only", () => {
    const example = read(".env.vps.example");
    expect(example).toMatch(/DATABASE_URL=postgresql:\/\/<runtime_role>:<url_encoded_password>@db:5432\/<database_name>/);
    expect(example).toMatch(/GMAIL_APP_PASSWORD=<google-app-password>/);
    expect(example).not.toMatch(/^[A-Z_]+=[A-Za-z0-9+/=_-]{24,}$/m); // nothing key-shaped
  });

  test("deploy scripts are scoped to this project and contain no destructive or CRM-touching command", () => {
    for (const f of ["deploy/common.sh", "deploy/preflight.sh", "deploy/deploy.sh", "deploy/rollback.sh", "deploy/verify.sh"]) {
      const src = read(f);
      // Strip comments so the explanation of what is NOT done does not trip the check.
      const code = src.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
      expect(code, f).not.toMatch(/compose\s+down|\bvolume\s+(rm|prune)|system prune|image prune|network (rm|prune)|rm -rf|docker (stop|kill|restart|rm)\b|compass-tools(?!_data)|cloudflared (tunnel|service)|psql|pg_dump|migrate/);
    }
    expect(read("deploy/common.sh")).toContain('PROJECT="business-flights-travel"');
    expect(read("deploy/deploy.sh")).toContain("compose up -d --no-deps");
    expect(read("deploy/rollback.sh")).toContain("--no-build");
  });

  test("the lead-queue claim locks only the queue entry, so the runtime role never needs UPDATE on Account", () => {
    const src = read("src/server/lead-distribution.ts");
    expect(src).toContain("FOR UPDATE OF lqe SKIP LOCKED");
    expect(src).not.toMatch(/FOR UPDATE SKIP LOCKED/);
    // And the grants file must not hand the website write access to accounts.
    const grants = read("deploy/sql/website-runtime-role-grants.sql").split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    expect(grants).not.toMatch(/(UPDATE|INSERT|DELETE|ALL)[^;]*"Account"/);
    expect(grants).not.toMatch(/GRANT[^;]*\b(DELETE|TRUNCATE|ALL PRIVILEGES)\b/i);
  });
});

test.describe("liveness route and robots", () => {
  test("/api/health: 200 {status:ok}, never cached, never indexed, and reveals nothing", async ({ request }) => {
    const res = await request.get("/api/health", { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
    expect(res.headers()["cache-control"]).toMatch(/no-store/);
    expect(res.headers()["x-robots-tag"]).toMatch(/noindex/);
  });

  test("robots.txt keeps the whole site crawlable except /api/, and the route is not in the sitemap", async ({ request }) => {
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toMatch(/Disallow: \/api\//);
    expect(robots).toMatch(/Allow: \//);
    expect(robots).not.toMatch(/^Disallow:\s*\/\s*$/m);
    expect(await (await request.get("/sitemap.xml")).text()).not.toContain("/api/health");
  });
});
