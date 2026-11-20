// Builds src/data/airport-hubs.json: the airports the "suggest my departure airport" feature may offer, as compact [iata, latitude, longitude]
// tuples (about 35 KB, loaded only when a suggestion is computed in the browser - never with the page).
//
// Source: src/data/airports.json, which is already the project's airport reference (OurAirports, public domain). That file is ordered by airport
// size class - large airports first, then medium, then small, each class alphabetical by city (see src/data/airports.ts). The first class, the
// "large" airports, is where the major commercial passenger airports are; it is read off that ordering (the first place the city order restarts)
// rather than re-derived from anything invented here. Nothing in the data is changed: codes and coordinates are copied as they are.
//
// One suitability filter on top: an entry that names only a military air base ("... Air Base" with no "Airport" in the name, e.g. a base that
// merely carries an IATA code) is not a place to suggest to a leisure/business traveller. Civil airports that share a field with a base
// ("Baghdad International Airport / New Al Muthana Air Base") keep their entry.
//
// Run:  node scripts/build-airport-hubs.mjs          (rewrites the file)
//       node scripts/build-airport-hubs.mjs --check  (exits 1 if the committed file is out of date; used by tests/airport-suggestion.spec.ts)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "src/data/airports.json");
const targetPath = path.join(root, "src/data/airport-hubs.json");

export function buildHubs(rows) {
  // Index of the first row whose city sorts BEFORE the previous row's city: the start of the second size class.
  let end = rows.length;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][2].localeCompare(rows[i - 1][2]) < 0) {
      end = i;
      break;
    }
  }
  return rows
    .slice(0, end)
    .filter((row) => row[6] != null && row[7] != null)
    .filter((row) => !(/air ?base/i.test(row[1]) && !/airport/i.test(row[1])))
    .map((row) => [row[0], row[6], row[7]]);
}

const rows = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const hubs = buildHubs(rows);
const output = JSON.stringify(hubs);

if (process.argv.includes("--check")) {
  const existing = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, "utf8") : "";
  if (existing !== output) {
    console.error("src/data/airport-hubs.json is out of date; run: node scripts/build-airport-hubs.mjs");
    process.exit(1);
  }
  console.log(`airport-hubs.json is current (${hubs.length} airports).`);
} else {
  fs.writeFileSync(targetPath, output);
  console.log(`Wrote ${hubs.length} airports to src/data/airport-hubs.json (${output.length} bytes).`);
}
