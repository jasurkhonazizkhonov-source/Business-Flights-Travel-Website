// Prepares (or drops, with --drop) a DISPOSABLE database for tests/self-hosted-e2e.spec.ts on a loopback PostgreSQL server:
// a non-superuser CRM owner, the CRM schema from the bundled real migrations, the website role with deploy/sql/website-runtime-role-grants.sql
// applied exactly as written, and one lead-queue worker. Same safety rules as scripts/verify-runtime-role-pg.ts: loopback only, fixed
// disposable names, never a production URL. The role password comes from E2E_ROLE_PASSWORD (chosen by the test, never printed).
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "../src/generated/prisma/client";
import { ensureSchema } from "../src/lib/schema-guard";
import { MIGRATION_BUNDLE } from "../src/lib/migration-bundle.generated";

const DB = "bft_e2e";
const OWNER = "crm_e2e_owner";
const ROLE = "bft_web_e2e";

async function main() {
  const adminUrl = process.env.INTEGRATION_ADMIN_DATABASE_URL;
  const password = process.env.E2E_ROLE_PASSWORD;
  if (!adminUrl) throw new Error("INTEGRATION_ADMIN_DATABASE_URL is not set");
  const base = new URL(adminUrl);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(base.hostname)) throw new Error("refusing to run: the admin URL must be a loopback address");
  const drop = process.argv.includes("--drop");
  if (!drop && !password) throw new Error("E2E_ROLE_PASSWORD is not set");
  const ownerPw = "owner-" + Math.random().toString(36).slice(2);

  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
  await admin.query(`DROP ROLE IF EXISTS ${ROLE}`);
  await admin.query(`DROP ROLE IF EXISTS ${OWNER}`);
  if (drop) {
    await admin.end();
    console.log(JSON.stringify({ ok: true, dropped: true }));
    return;
  }
  await admin.query(`CREATE ROLE ${OWNER} LOGIN PASSWORD '${ownerPw}' NOSUPERUSER NOCREATEDB NOCREATEROLE`);
  await admin.query(`CREATE ROLE ${ROLE} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 12`);
  await admin.query(`CREATE DATABASE ${DB} OWNER ${OWNER} ENCODING 'UTF8' TEMPLATE template0`);
  await admin.end();

  const ownerUrl = new URL(base.toString());
  ownerUrl.username = OWNER;
  ownerUrl.password = ownerPw;
  ownerUrl.pathname = `/${DB}`;
  const owner = new Client({ connectionString: ownerUrl.toString() });
  await owner.connect();
  await ensureSchema({
    db: { query: async (s, p) => (await owner.query(s, p as unknown[] | undefined)).rows, exec: async (s) => void (await owner.query(s)) },
    bundle: MIGRATION_BUNDLE,
    autoInit: true,
  });
  const grants = readFileSync(path.join(__dirname, "..", "deploy", "sql", "website-runtime-role-grants.sql"), "utf8").split(':"role"').join(`"${ROLE}"`);
  await owner.query("BEGIN");
  await owner.query(grants);
  await owner.query("COMMIT");
  await owner.end();

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: ownerUrl.toString() }) });
  const company = await prisma.company.findFirstOrThrow({ select: { id: true } });
  await prisma.account.create({ data: { id: "e2e-agent", fullName: "E2E Agent", email: "e2e-agent@example.com", role: "TRAVEL_AGENT", companyId: company.id, updatedAt: new Date() } });
  await prisma.leadQueueEntry.create({ data: { id: "e2e-queue", accountId: "e2e-agent", updatedAt: new Date() } });
  await prisma.$disconnect();
  console.log(JSON.stringify({ ok: true, database: DB, role: ROLE, owner: OWNER, ownerPassword: ownerPw }));
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, message: String(e?.message ?? e).slice(0, 500) }));
  process.exit(1);
});
