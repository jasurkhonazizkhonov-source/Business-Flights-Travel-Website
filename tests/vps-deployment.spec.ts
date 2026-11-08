import { test, expect } from "@playwright/test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { CLOUDFLARE_GEO_SOURCE, GEO_SOURCE, decodeUtf8Header, readCloudflareApproximateLocation } from "../src/lib/ip-geo";
import { captureSubmissionInfo } from "../src/lib/submission-info";
import { buildFlightRequestNotificationEmail } from "../src/lib/email/flight-request-notification";
import { resolveClientIp } from "../src/lib/client-ip";
import { VISITOR_CONTEXT_HEADER, buildVisitorContextHeaders } from "../src/lib/crm-api/visitor-context";
import { standaloneBuildPresent, startStandalone, type StandaloneServer } from "./support/standalone-server";

// Self-hosted (OVH VPS + Docker Compose + Cloudflare Tunnel) deployment: visitor IP / location behind Cloudflare, the static properties of
// the container files, and the liveness route on the production build. The website has NO database, so there is no database TLS, grant or
// role to test here: the CRM API client is covered by tests/crm-api-client.spec.ts and tests/crm-api-actions-e2e.spec.ts. None of this needs
// Docker; what could not be exercised without it is listed in docs/DEPLOYMENT_VPS.md ("What was and was not tested").
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

  test("complete IPv4 and IPv6 addresses are preserved from the header to the signed context sent to the CRM", () => {
    const decode = (headers: Record<string, string>) => JSON.parse(Buffer.from(headers[VISITOR_CONTEXT_HEADER], "base64url").toString("utf8"));
    const secret = "s".repeat(40);
    withEnv({ TRUSTED_PROXY: "cloudflare" }, () => {
      const samples: Array<[string, string, "v4" | "v6"]> = [
        ["198.51.100.50", "198.51.100.50", "v4"],
        ["198.51.100.50:51820", "198.51.100.50", "v4"], // a port is not part of the address
        ["2606:4700:4700::1111", "2606:4700:4700::1111", "v6"],
        ["2A00:1450:4001:081D:0000:0000:0000:200E", "2a00:1450:4001:81d::200e", "v6"], // canonical form, nothing truncated or lost
        ["[2606:4700:4700::1111]:443", "2606:4700:4700::1111", "v6"],
        ["::ffff:198.51.100.7", "198.51.100.7", "v4"], // IPv4-mapped IPv6 collapses to the IPv4 address
      ];
      for (const [raw, expected, version] of samples) {
        const { info } = captureSubmissionInfo(H({ "cf-connecting-ip": raw }));
        expect(info.ip, raw).toEqual({ address: expected, version });
        const sent = buildVisitorContextHeaders(info, secret);
        expect(decode(sent).ip, raw).toBe(expected);
      }
    });
  });

  test("Cloudflare Pseudo IPv4 'Overwrite Headers': the real IPv6 address is taken from CF-Connecting-IPv6, and only then", () => {
    withEnv({ TRUSTED_PROXY: "cloudflare" }, () => {
      // CF-Connecting-IP carries a Class E stand-in (240.0.0.0/4) for an IPv6 visitor; the real address moved to CF-Connecting-IPv6.
      expect(resolveClientIp(H({ "cf-connecting-ip": "240.12.34.56", "cf-connecting-ipv6": "2606:4700:4700::1111" }))).toEqual({
        ok: true,
        address: "2606:4700:4700::1111",
        version: "v6",
      });
      // A usable CF-Connecting-IP always wins: the IPv6 header is never consulted (a forged one changes nothing).
      expect(resolveClientIp(H({ "cf-connecting-ip": "198.51.100.50", "cf-connecting-ipv6": "2606:4700:4700::1111" }))).toEqual({
        ok: true,
        address: "198.51.100.50",
        version: "v4",
      });
      // No IPv6 header, or an unusable one: the stand-in is never stored as if it were a customer address.
      expect(resolveClientIp(H({ "cf-connecting-ip": "240.12.34.56" }))).toEqual({ ok: false, reason: "private_or_reserved" });
      expect(resolveClientIp(H({ "cf-connecting-ip": "240.12.34.56", "cf-connecting-ipv6": "fd00::1" }))).toEqual({ ok: false, reason: "private_or_reserved" });
      expect(resolveClientIp(H({ "cf-connecting-ip": "240.12.34.56", "cf-connecting-ipv6": "not-an-ip" }))).toEqual({ ok: false, reason: "private_or_reserved" });
    });
    // Outside cloudflare mode that header is not believed at all.
    withEnv({ TRUSTED_PROXY: "none" }, () => {
      expect(resolveClientIp(H({ "cf-connecting-ip": "240.12.34.56", "cf-connecting-ipv6": "2606:4700:4700::1111" }))).toEqual({ ok: false, reason: "no_trusted_proxy" });
    });
  });

  test("the signed context carries exactly what the server observed: IP + location, IP only, location only, or nothing", () => {
    const decode = (headers: Record<string, string>) => JSON.parse(Buffer.from(headers[VISITOR_CONTEXT_HEADER], "base64url").toString("utf8"));
    const secret = "s".repeat(40);
    const geo = { "cf-ipcountry": "US", "cf-ipcity": "San Francisco", "cf-region-code": "CA", "cf-timezone": "America/Los_Angeles" };
    withEnv({ TRUSTED_PROXY: "cloudflare" }, () => {
      const full = decode(buildVisitorContextHeaders(captureSubmissionInfo(cf({ ...geo })).info, secret));
      expect(full).toMatchObject({ v: 1, ip: "198.51.100.50", city: "San%20Francisco", region: "CA", country: "US", timezone: "America/Los_Angeles" });
      // Cloudflare's Managed Transform is off: only cf-ipcountry arrives. Country is sent; no city/region is invented.
      const countryOnly = decode(buildVisitorContextHeaders(captureSubmissionInfo(cf({ "cf-ipcountry": "AU" })).info, secret));
      expect(countryOnly.country).toBe("AU");
      expect(countryOnly).not.toHaveProperty("city");
      expect(countryOnly).not.toHaveProperty("region");
      // No geolocation headers at all: IP only.
      const ipOnly = decode(buildVisitorContextHeaders(captureSubmissionInfo(cf()).info, secret));
      expect(ipOnly.ip).toBe("198.51.100.50");
      for (const k of ["city", "region", "country", "timezone"]) expect(ipOnly).not.toHaveProperty(k);
      // Tor / unknown country codes are not a location.
      expect(decode(buildVisitorContextHeaders(captureSubmissionInfo(cf({ "cf-ipcountry": "T1" })).info, secret))).not.toHaveProperty("country");
      // Coordinates / postal code are never sent to the CRM (its context has no such field), even when Cloudflare supplies them.
      const withCoords = JSON.stringify(decode(buildVisitorContextHeaders(captureSubmissionInfo(cf({ ...geo, "cf-iplatitude": "37.77", "cf-iplongitude": "-122.41", "cf-postal-code": "94104" })).info, secret)));
      expect(withCoords).not.toMatch(/37\.77|122\.41|94104|lat|lon|postal/i);
    });
    // Nothing observed (no trusted proxy): nothing is signed or sent — the CRM then records no IP and no location.
    withEnv({ TRUSTED_PROXY: "none" }, () => {
      expect(buildVisitorContextHeaders(captureSubmissionInfo(cf({ ...geo })).info, secret)).toEqual({});
    });
    // No secret configured: nothing is sent either.
    withEnv({ TRUSTED_PROXY: "cloudflare" }, () => {
      expect(buildVisitorContextHeaders(captureSubmissionInfo(cf({ ...geo })).info, undefined)).toEqual({});
    });
  });

  test("approximate coordinates: read only as a valid pair, rounded to ~1 km, never invented, shown in the internal e-mail only", () => {
    const pair = (lat: string, lon: string) => readCloudflareApproximateLocation(H({ "cf-ipcountry": "US", "cf-iplatitude": lat, "cf-iplongitude": lon }));
    expect(pair("37.77490", "-122.41940")).toMatchObject({ latitude: 37.77, longitude: -122.42, countryCode: "US" });
    expect(pair("-33.8688", "151.2093")).toMatchObject({ latitude: -33.87, longitude: 151.21 });
    // Half a pair, text, out of range, and the 0/0 no-data placeholder are all "unavailable" — the country is still kept.
    for (const [lat, lon] of [["37.77", ""], ["", "-122.4"], ["north", "west"], ["91", "10"], ["10", "181"], ["0", "0"], ["1e3", "5"]]) {
      const loc = pair(lat, lon);
      expect(loc, `${lat}/${lon}`).toEqual({ country: "United States", countryCode: "US" });
    }
    // Without the Managed Transform there are no coordinates at all.
    expect(readCloudflareApproximateLocation(H({ "cf-ipcountry": "AU" }))).toEqual({ country: "Australia", countryCode: "AU" });

    // Internal notification: one extra labelled row, flagged as a network estimate; absent when not obtained.
    const JFK = { iata: "JFK", city: "New York", country: "United States", name: "John F. Kennedy International Airport" };
    const CDG = { iata: "CDG", city: "Paris", country: "France", name: "Paris Charles de Gaulle Airport" };
    const base = {
      firstName: "Test", lastName: "Visitor", email: "visitor@example.com", phoneE164: "+14155550100", tripType: "ONE_WAY" as const, cabinClass: "BUSINESS" as const,
      adults: 1, children: 0, infants: 0, flexibleDates: false, segments: [{ from: JFK, to: CDG, departureDate: "2026-12-24" }], submittedAt: new Date("2026-11-08T10:00:00Z"),
    };
    const withCoords = buildFlightRequestNotificationEmail({ ...base, submission: { ip: { address: "198.51.100.50", version: "v4" }, location: pair("37.77490", "-122.41940"), locationSource: CLOUDFLARE_GEO_SOURCE } });
    expect(withCoords.text).toContain("Approximate Coordinates: 37.77, -122.42 (network estimate, about city level)");
    expect(withCoords.html).toContain("Approximate Coordinates");
    const without = buildFlightRequestNotificationEmail({ ...base, submission: { ip: { address: "198.51.100.50", version: "v4" }, location: pair("", ""), locationSource: CLOUDFLARE_GEO_SOURCE } });
    expect(without.text).not.toContain("Coordinates");
    // The CRM context is built from named fields only, so coordinates never leave in it.
    const sent = buildVisitorContextHeaders({ ip: { address: "198.51.100.50", version: "v4" }, location: pair("37.77490", "-122.41940"), capturedAt: new Date() }, "s".repeat(40));
    expect(Buffer.from(sent[VISITOR_CONTEXT_HEADER], "base64url").toString("utf8")).not.toMatch(/latitude|longitude|37\.77|122\.4/);
  });
});

test.describe("nothing sensitive is shipped to the browser (needs a production build in .next)", () => {
  test("client bundles contain no IP/geolocation header names, no secrets' names and no visitor data handling", () => {
    const staticDir = path.join(root, ".next", "static");
    test.skip(!existsSync(staticDir), "run `next build` first");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(js|css|map)$/.test(e.name)) files.push(p);
      }
    };
    walk(staticDir);
    expect(files.length).toBeGreaterThan(5);
    const forbidden = /cf-connecting-ip|cf-ipcity|cf-iplatitude|cf-region-code|x-ct-visitor|LEAD_INGEST_SECRET|CRM_API_KEY|GMAIL_APP_PASSWORD|TRUSTED_PROXY/i;
    const hits = files.filter((f) => forbidden.test(readFileSync(f, "utf8"))).map((f) => path.relative(root, f));
    expect(hits).toEqual([]);
  });
});


test.describe("container files (static checks; Docker itself was not available to run them)", () => {
  const dockerfile = read("Dockerfile");
  const compose = read("compose.yaml");
  const composeCode = compose.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");

  test("Dockerfile: pinned base image, non-root runtime, health check, no secrets, no database tooling", () => {
    expect(dockerfile).toMatch(/^ARG NODE_IMAGE=node:\d+\.\d+\.\d+-bookworm-slim@sha256:[0-9a-f]{64}$/m);
    expect(dockerfile).toMatch(/^USER node$/m);
    expect(dockerfile).toMatch(/^HEALTHCHECK .*scripts\/healthcheck\.mjs/m);
    expect(dockerfile).toMatch(/^CMD \["node", "server\.js"\]$/m);
    expect(dockerfile).toMatch(/NEXT_OUTPUT=standalone/);
    expect(dockerfile).not.toMatch(/\bARG\s+\w*(PASSWORD|SECRET|TOKEN|DATABASE_URL|KEY)\w*/i);
    expect(dockerfile).not.toMatch(/ENV\s+(DATABASE_URL|GMAIL_APP_PASSWORD|CRM_API_KEY|LEAD_INGEST_SECRET)/);
    expect(dockerfile.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n")).not.toMatch(/prisma|vercel-build|bootstrap|openssl|COPY\s+prisma/);
    expect(dockerfile).not.toMatch(/COPY\s+[^\n]*\.env(\s|$)/);
    expect(dockerfile).toContain("-name '.env'"); // the build fails if an env file slipped into the image
  });

  test("Dockerfile: the runtime user can read the application but write ONLY the Next cache", () => {
    const runner = dockerfile.slice(dockerfile.indexOf("FROM base AS runner"));
    // No file copied into the runner is chowned to the runtime user: application code is root-owned and not writable by `node`.
    expect(runner.split("\n").filter((l) => /^COPY /.test(l) && /--chown/.test(l))).toEqual([]);
    expect(runner).toMatch(/chown -R node:node \/app\/\.next\/cache/);
    expect([...runner.matchAll(/chown /g)]).toHaveLength(1);
    expect(runner).not.toMatch(/chmod\s+(-R\s+)?[0-7]*7[0-7]{0,2}\s|chmod\s+(-R\s+)?\S*[+]w/);
    expect(runner.indexOf("USER node")).toBeGreaterThan(runner.indexOf("chown -R node:node"));
    // No build-time secrets and nothing read from the environment during the build: only these ENV/ARG names exist.
    const joined = dockerfile.replace(/\\\r?\n/g, " ");
    const envNames = joined.split("\n").filter((l) => /^(ENV|ARG)\s/.test(l)).flatMap((l) => [...l.matchAll(/(?:^ARG\s+|\s)([A-Z_]+)=/g)].map((m) => m[1]));
    expect([...new Set(envNames)].sort()).toEqual(["HOSTNAME", "NEXT_OUTPUT", "NEXT_TELEMETRY_DISABLED", "NODE_ENV", "NODE_IMAGE", "NODE_OPTIONS", "PORT"]);
  });

  test(".dockerignore keeps env files, keys and local tooling state out of the build context", () => {
    const ignore = read(".dockerignore");
    for (const entry of ["**/.env", "**/.env.*", "**/*.pem", "**/*.key", ".git", "node_modules", ".next"]) expect(ignore, entry).toContain(entry);
    expect(ignore).toMatch(/!\*\*\/\.env\.vps\.example/);
  });

  test("compose: one service, own project, nothing published, only the CRM's two EXTERNAL networks, secrets by reference", () => {
    expect(compose).toMatch(/^name: business-flights-travel$/m);
    const servicesBlock = compose.slice(compose.indexOf("\nservices:"), compose.indexOf("\nnetworks:"));
    const services = [...servicesBlock.matchAll(/^ {2}([a-z][\w-]*):\s*$/gm)].map((m) => m[1]);
    // One service, named uniquely: Docker adds the service name as a DNS alias on the CRM's shared network, so it must not be a generic
    // name (web, app, db, cloudflared) that another container could also answer to. No db, no cloudflared, no CRM service defined here.
    expect(services).toEqual(["bft-web"]);
    expect(composeCode).not.toMatch(/^\s+ports:/m);
    expect(composeCode).not.toMatch(/published:/);
    expect(compose).toMatch(/^\s+expose:\s*\n\s+- "3000"/m);
    expect(composeCode).not.toMatch(/privileged:|network_mode:|pid: host|cap_add:|\/var\/run\/docker\.sock/);
    expect(compose).toMatch(/cap_drop:\s*\n\s+- ALL/);
    expect(compose).toMatch(/no-new-privileges:true/);
    expect(compose).toMatch(/restart: unless-stopped/);
    // The two networks the CRM project owns are EXTERNAL: compose must refuse to start rather than create an empty one. The defaults are the
    // CRM release's own names; they are overridable, never created.
    expect(compose).toMatch(/crm_api:\s*\n\s+external: true\s*\n\s+name: \$\{CRM_API_NETWORK_NAME:-compass-tools-website-api\}/);
    expect(compose).toMatch(/tunnel:\s*\n\s+external: true\s*\n\s+name: \$\{TUNNEL_NETWORK_NAME:-compass-tools_web\}/);
    expect([...compose.matchAll(/external: true/g)]).toHaveLength(2);
    // The service joins the tunnel network with exactly one alias, unique and project-prefixed (the tunnel's Service URL is http://bft-web:3000),
    // and the API network with none.
    expect(compose).toMatch(/tunnel:\s*\n\s+aliases: \[bft-web\]/);
    expect(compose).toMatch(/crm_api: \{\}/);
    expect([...compose.matchAll(/aliases:/g)]).toHaveLength(1);
    // None of the CRM's service names may be used as a name or alias here.
    expect(composeCode).not.toMatch(/aliases:\s*\[[^\]]*(?<![\w-])(app|db|web|cloudflared)(?![\w-])|container_name:/);
    // The website must have no route to the database: no data network, no internal-network name that carries PostgreSQL.
    expect(composeCode).not.toMatch(/compass-tools_data|compass-tools_internal|CRM_NETWORK_NAME|CRM_DATA_NETWORK|\bdb\b/);
    expect(composeCode).not.toMatch(/\bvolumes:/); // no volumes at all: this site stores no files
    expect(composeCode).not.toMatch(/-v\b|down -v|prune/);
  });

  test("compose: the trust setting is fixed, the CRM key and the mail password are ${VAR} references, and there is no database setting at all", () => {
    expect(composeCode).toMatch(/TRUSTED_PROXY: cloudflare/);
    expect(composeCode).toMatch(/CRM_API_URL: \$\{CRM_API_URL:-http:\/\/compass-crm:3000\}/);
    expect(composeCode).toMatch(/CRM_API_KEY: \$\{CRM_API_KEY:\?/); // required: the container refuses to start without it
    expect(composeCode).toMatch(/CRM_COMPANY_ID: \$\{CRM_COMPANY_ID:\?/);
    expect(composeCode).toMatch(/LEAD_INGEST_SECRET: \$\{LEAD_INGEST_SECRET:-\}/);
    expect(composeCode).toMatch(/GMAIL_APP_PASSWORD: \$\{GMAIL_APP_PASSWORD:\?/);
    expect(composeCode).not.toMatch(/DATABASE_|DIRECT_URL|postgres/i);
    expect(composeCode).not.toMatch(/postgresql:\/\/[^\s$]*:[^\s$@]+@/); // no literal user:password@ URL
    expect(composeCode).not.toMatch(/(CRM_API_KEY|LEAD_INGEST_SECRET):\s*["']?[A-Za-z0-9]{16,}/); // no literal credential
  });

  test(".env.vps.example holds placeholders only, and no database setting", () => {
    const example = read(".env.vps.example");
    expect(example).toMatch(/^CRM_API_KEY=<same-value-as-the-CRMs-WEBSITE_API_KEY>$/m);
    expect(example).toMatch(/^CRM_COMPANY_ID=<crm-company-id>$/m);
    expect(example).toMatch(/GMAIL_APP_PASSWORD=<google-app-password>/);
    expect(example).not.toMatch(/^[A-Z_]+=[A-Za-z0-9+/=_-]{24,}$/m); // nothing key-shaped
    expect(example.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n")).not.toMatch(/DATABASE|DIRECT_URL|postgres/i);
  });

  test("deploy scripts are scoped to this project and contain no destructive, database or CRM-touching command", () => {
    for (const f of ["deploy/common.sh", "deploy/preflight.sh", "deploy/deploy.sh", "deploy/rollback.sh", "deploy/verify.sh"]) {
      const src = read(f);
      // Strip comments so the explanation of what is NOT done does not trip the check.
      const code = src.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
      expect(code, f).not.toMatch(/compose\s+down|\bvolume\s+(rm|prune)|system prune|image prune|network (rm|prune|create|connect|disconnect)|rm -rf|docker (stop|kill|restart|rm)\b|compass-tools(?!-website-api|_web)|cloudflared (tunnel|service)|psql|pg_dump|migrate/);
    }
    expect(read("deploy/common.sh")).toContain('PROJECT="business-flights-travel"');
    expect(read("deploy/deploy.sh")).toContain("compose up -d --no-deps");
    expect(read("deploy/rollback.sh")).toContain("--no-build");
  });

  test("no database artefact is left in the repository: no SQL grants, no role scripts, no schema or migration files", () => {
    const tracked = (rel: string) => {
      try {
        readFileSync(path.join(root, rel));
        return true;
      } catch {
        return false;
      }
    };
    for (const gone of ["deploy/sql/website-runtime-role-grants.sql", "deploy/sql/verify-website-runtime-role.sql", "prisma/schema.prisma", "prisma.config.ts", "scripts/vercel-build.mjs", "src/server/lead-distribution.ts"]) {
      expect(tracked(gone), gone).toBe(false);
    }
  });
});

// The liveness route and robots, on the PRODUCTION build (started and identified by this test - there is no dev server involved).
test.describe("liveness route and robots (standalone build)", () => {
  test.skip(!standaloneBuildPresent(), "needs a standalone build (NEXT_OUTPUT=standalone npm run build)");
  test.setTimeout(120_000);
  let server: StandaloneServer;
  test.beforeAll(async () => {
    // Deliberately NO CRM setting: the health route must not depend on the CRM, and a robots/sitemap request never calls it.
    server = await startStandalone({ label: "vps-deployment liveness", port: 3236, env: { TRUSTED_PROXY: "cloudflare" } });
  });
  test.afterAll(async () => {
    await server?.stop();
  });
  test.beforeEach(() => server.assertAlive());

  test("/api/health: 200 {status:ok}, never cached, never indexed, reveals nothing, and needs no CRM", async () => {
    const res = await fetch(`${server.origin}/api/health`, { redirect: "manual" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
    expect(res.headers.get("x-robots-tag")).toMatch(/noindex/);
  });

  test("robots.txt keeps the whole site crawlable except /api/, and the route is not in the sitemap", async () => {
    const robots = await (await fetch(`${server.origin}/robots.txt`)).text();
    expect(robots).toMatch(/Disallow: \/api\//);
    expect(robots).toMatch(/Allow: \//);
    expect(robots).not.toMatch(/^Disallow:\s*\/\s*$/m);
    expect(await (await fetch(`${server.origin}/sitemap.xml`)).text()).not.toContain("/api/health");
  });
});
