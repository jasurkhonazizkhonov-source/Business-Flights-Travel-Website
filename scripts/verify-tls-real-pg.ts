// End-to-end proof of the website's database TLS behaviour against a REAL, TLS-enabled PostgreSQL server, through the real
// src/lib/prisma.ts (so the real resolver, the real URL parameter stripping, the real pg driver).
//
//   INTEGRATION_TLS_PORT=54340 INTEGRATION_TLS_CA_FILE=<ca.crt> INTEGRATION_TLS_OTHER_CA_FILE=<other-ca.crt> \
//     node node_modules/tsx/dist/cli.mjs scripts/verify-tls-real-pg.ts
//
// The server must be a DISPOSABLE loopback PostgreSQL with `ssl=on`, trust authentication for the `postgres` user, and a server
// certificate issued by the CA in INTEGRATION_TLS_CA_FILE whose only name is `localhost` (so `127.0.0.1` must fail host-name
// verification). Nothing here can reach any other host: the URL is built from 127.0.0.1/localhost only.
//
// Each scenario runs in its own child process because src/lib/prisma.ts keeps one client per process.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type Outcome = { connected: boolean; tls?: boolean; error?: string };

async function scenario(): Promise<void> {
  const out: Outcome = { connected: false };
  try {
    const { prisma } = await import("../src/lib/prisma");
    const rows = await prisma.$queryRaw<Array<{ ssl: boolean }>>`SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()`;
    out.connected = true;
    out.tls = rows[0]?.ssl === true;
    const { prisma: p2 } = await import("../src/lib/prisma");
    await p2.$disconnect();
  } catch (e) {
    out.error = String((e as Error).message ?? e).replace(/\s+/g, " ").slice(0, 300);
  }
  console.log("RESULT " + JSON.stringify(out));
  process.exit(0);
}

let lastOutcome: Outcome = { connected: false };
function run(env: Record<string, string>): Outcome {
  return (lastOutcome = runOnce(env));
}

function runOnce(env: Record<string, string>): Outcome {
  const r = spawnSync(process.execPath, [path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs"), fileURLToPath(import.meta.url), "--scenario"], {
    env: { ...process.env, NODE_OPTIONS: "--conditions=react-server --no-deprecation", ...env },
    encoding: "utf8",
    timeout: 60_000,
  });
  const line = (r.stdout ?? "").split("\n").find((l) => l.startsWith("RESULT "));
  if (!line) return { connected: false, error: "no result: " + (r.stderr ?? "").slice(0, 200) };
  return JSON.parse(line.slice(7)) as Outcome;
}

async function main() {
  const port = process.env.INTEGRATION_TLS_PORT;
  const caFile = process.env.INTEGRATION_TLS_CA_FILE;
  const otherCaFile = process.env.INTEGRATION_TLS_OTHER_CA_FILE;
  if (!port || !caFile || !otherCaFile) throw new Error("INTEGRATION_TLS_PORT, INTEGRATION_TLS_CA_FILE and INTEGRATION_TLS_OTHER_CA_FILE are required");
  const ca = readFileSync(caFile, "utf8").trim().replace(/\r?\n/g, "\\n"); // .env style: literal \n
  const otherCa = readFileSync(otherCaFile, "utf8").trim().replace(/\r?\n/g, "\\n");
  const url = (host: string, query = "") => `postgresql://postgres@${host}:${port}/postgres${query}`;
  const checks: string[] = [];
  const expect = (cond: unknown, label: string) => {
    if (!cond) throw new Error("CHECK FAILED: " + label + " | last outcome: " + JSON.stringify(lastOutcome));
    checks.push(label);
  };
  const failed = (o: Outcome, re: RegExp) => !o.connected && re.test(o.error ?? "");

  let o = run({ DATABASE_URL: url("localhost"), DATABASE_SSL_CA: ca });
  expect(o.connected && o.tls === true, "verified TLS (CA) to the matching host name connects, and the server confirms the session is encrypted");

  o = run({ DATABASE_URL: url("localhost"), DATABASE_SSL_CA: otherCa });
  expect(failed(o, /self.signed|unable to (get|verify)|certificate|issuer/i), "verified TLS with the WRONG CA is refused: " + o.error?.slice(0, 80));

  o = run({ DATABASE_URL: url("127.0.0.1"), DATABASE_SSL_CA: ca });
  expect(failed(o, /altnames|not in the cert|hostname|identity/i), "verified TLS refuses a host name the certificate is not valid for (127.0.0.1): " + o.error?.slice(0, 80));

  for (const q of ["?sslmode=disable", "?ssl=0", "?ssl=false", "?sslmode=no-verify", "?sslrootcert=" + encodeURIComponent(caFile)]) {
    o = run({ DATABASE_URL: url("localhost", q), DATABASE_SSL_CA: otherCa });
    expect(failed(o, /self.signed|unable to (get|verify)|certificate|issuer/i), `a URL parameter (${q.split("=")[0]}) cannot downgrade or redirect verification: still refused with the wrong CA`);
  }

  o = run({ DATABASE_URL: url("localhost"), DATABASE_SSL_VERIFY: "system" });
  expect(failed(o, /self.signed|unable to (get|verify)|certificate|issuer/i), "DATABASE_SSL_VERIFY=system refuses a private CA that is not in the system trust store");

  o = run({ DATABASE_URL: url("127.0.0.1") });
  expect(o.connected && o.tls === true, "DEFAULT (nothing set): encrypted but NOT verified - it connects even though 127.0.0.1 is not in the certificate (the documented weakness; preflight forces an explicit choice)");

  o = run({ DATABASE_URL: url("localhost"), DATABASE_SSL_MODE: "disable" });
  expect(o.connected && o.tls === false, "DATABASE_SSL_MODE=disable is real PLAINTEXT even though this server offers TLS (pg_stat_ssl says the session is not encrypted)");

  o = run({ DATABASE_URL: url("localhost", "?sslmode=require"), DATABASE_SSL_MODE: "disable" });
  expect(!o.connected && /conflicts with an ssl/.test(o.error ?? ""), "disable + an ssl parameter in the URL is refused before any connection");

  o = run({ DATABASE_URL: url("localhost"), DATABASE_SSL_MODE: "disable", DATABASE_SSL_CA: ca });
  expect(!o.connected && /conflicts with DATABASE_SSL_CA/.test(o.error ?? ""), "disable + a CA is refused before any connection");

  o = run({ DATABASE_URL: "postgresql://postgres@example.invalid:5432/postgres", DATABASE_SSL_MODE: "disable" });
  expect(!o.connected && /only allowed when DATABASE_URL/.test(o.error ?? ""), "disable against a non-allow-listed host is refused before any connection");

  console.log(JSON.stringify({ ok: true, checks }, null, 1));
}

if (process.argv.includes("--scenario")) {
  scenario();
} else {
  main().catch((e) => {
    console.error(JSON.stringify({ ok: false, message: String(e?.message ?? e).slice(0, 600) }));
    process.exit(1);
  });
}
