import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";

// Runs scripts/verify-tls-real-pg.ts: the website's real database TLS behaviour against a REAL TLS-enabled PostgreSQL server (verified CA,
// wrong CA, host-name mismatch, URL-parameter downgrade attempts, plaintext mode). Skipped - never "passed" - unless a DISPOSABLE loopback
// server is supplied: ssl=on, trust auth for `postgres`, a server certificate valid only for the name `localhost`.
//   INTEGRATION_TLS_PORT=54340 INTEGRATION_TLS_CA_FILE=<ca.crt> INTEGRATION_TLS_OTHER_CA_FILE=<other-ca.crt> npm run test:infra
const port = process.env.INTEGRATION_TLS_PORT;
const caFile = process.env.INTEGRATION_TLS_CA_FILE;
const otherCaFile = process.env.INTEGRATION_TLS_OTHER_CA_FILE;
test.setTimeout(240_000);

test("[real PostgreSQL + TLS] verified TLS accepts the right CA and name and refuses the wrong CA, the wrong name and any URL downgrade; plaintext is only the explicit mode", () => {
  test.skip(!port || !caFile || !otherCaFile, "needs INTEGRATION_TLS_PORT, INTEGRATION_TLS_CA_FILE and INTEGRATION_TLS_OTHER_CA_FILE (a disposable TLS-enabled PostgreSQL)");
  const root = path.resolve(__dirname, "..");
  const out = execFileSync(process.execPath, [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), "scripts/verify-tls-real-pg.ts"], {
    cwd: root,
    encoding: "utf8",
    timeout: 220_000,
  });
  const result = JSON.parse(out.trim());
  expect(result.ok).toBe(true);
  expect(result.checks.length).toBeGreaterThanOrEqual(13);
});
