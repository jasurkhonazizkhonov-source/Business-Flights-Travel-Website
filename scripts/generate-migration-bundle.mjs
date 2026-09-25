#!/usr/bin/env node
// Regenerates src/lib/migration-bundle.generated.ts from prisma/migrations/.
//
// WHY A GENERATED MODULE INSTEAD OF READING prisma/migrations AT RUNTIME:
// the runtime schema guard (src/lib/schema-guard.ts) can apply the real
// migration history to an intentionally-empty database (only when
// DATABASE_AUTO_INIT=true — see that file). On Vercel a serverless function
// only ships files Next's output tracing decides it needs; migration SQL
// read through `fs` isn't guaranteed to be among them. Embedding the SQL
// as a normal module import makes it part of the server bundle by
// construction, with no tracing configuration to get wrong.
//
// Source of truth stays prisma/migrations/ (a verbatim copy of the CRM's
// migration history). tests/schema-guard.spec.ts fails if this generated
// file drifts from that directory, so it can't silently go stale — rerun
// `npm run bundle:migrations` after any change there.
//
// Line endings are normalized to LF so the output (and the checksums the
// guard records, which are sha256 of this exact text) is identical whether
// this runs on a Windows checkout or on Vercel.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const migrationsDir = path.join(root, "prisma", "migrations");
const outFile = path.join(root, "src", "lib", "migration-bundle.generated.ts");

export function buildBundleSource() {
  const names = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  const entries = names.map((name) => {
    const sql = fs.readFileSync(path.join(migrationsDir, name, "migration.sql"), "utf8").replace(/\r\n/g, "\n");
    return `  { name: ${JSON.stringify(name)}, sql: ${JSON.stringify(sql)} },`;
  });

  return (
    `// GENERATED FILE — do not edit by hand. Run \`npm run bundle:migrations\`.\n` +
    `// Source: prisma/migrations/*/migration.sql (${names.length} migrations). See scripts/generate-migration-bundle.mjs.\n` +
    `export interface BundledMigration {\n  name: string;\n  sql: string;\n}\n\n` +
    `export const MIGRATION_BUNDLE: readonly BundledMigration[] = [\n${entries.join("\n")}\n];\n`
  );
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  fs.writeFileSync(outFile, buildBundleSource(), "utf8");
  console.log(`Wrote ${path.relative(root, outFile)}`);
}
