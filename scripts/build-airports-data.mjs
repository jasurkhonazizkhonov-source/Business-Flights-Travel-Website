#!/usr/bin/env node
// Regenerates src/data/airports.json from the OurAirports public-domain
// dataset (https://ourairports.com/data/, Unlicense — no attribution
// required, but it's the industry-standard open aviation reference used by
// FlightAware, ADS-B Exchange, and similar tools).
//
// Run with: node scripts/build-airports-data.mjs
//
// This is the ONLY place this project's airport data comes from — it is
// never queried from or written to PostgreSQL (see src/data/airports.ts
// and docs/ENVIRONMENT.md). Re-run this script periodically to pick up
// newly-assigned IATA codes or airport closures upstream; it fetches a
// fresh export every time rather than relying on a stale local copy.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const AIRPORTS_CSV_URL = "https://davidmegginson.github.io/ourairports-data/airports.csv";
const COUNTRIES_CSV_URL = "https://davidmegginson.github.io/ourairports-data/countries.csv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, "..", "src", "data", "airports.json");

// --- Minimal, correct RFC4180-ish CSV parser (handles quoted fields, ----
// --- embedded commas, and escaped "" quotes — both source files use ----
// --- that quoting style throughout). -----------------------------------
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c === "\r") {
      // handled by \n
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function toObjects(rows) {
  const header = rows[0];
  return rows.slice(1).map((r) => {
    const o = {};
    header.forEach((h, i) => (o[h] = r[i] ?? ""));
    return o;
  });
}

async function fetchCsv(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  return parseCsv(await res.text());
}

const IATA_RE = /^[A-Z]{3}$/;

// Type priority controls both which row wins when the same IATA code
// appears more than once upstream (rare, but does happen) and the array's
// storage order, which src/data/airports.ts's search relies on: an
// early-exit scan over an array sorted large -> medium -> small naturally
// surfaces major airports first for a given query, without needing to
// re-rank the whole dataset on every keystroke.
const TYPE_RANK = {
  large_airport: 0,
  medium_airport: 1,
  small_airport: 2,
  seaplane_base: 3,
  heliport: 4,
  balloonport: 5,
  closed: 99,
};

async function main() {
  console.log("Fetching OurAirports data...");
  const [airportsRaw, countriesRaw] = await Promise.all([fetchCsv(AIRPORTS_CSV_URL), fetchCsv(COUNTRIES_CSV_URL)]);
  const airports = toObjects(airportsRaw);
  const countries = toObjects(countriesRaw);
  console.log(`Parsed ${airports.length} airport rows, ${countries.length} country rows.`);

  const countryNameByCode = new Map(countries.map((c) => [c.code, c.name]));
  const byIata = new Map();
  let skippedClosed = 0;
  let skippedBadCode = 0;
  let skippedNoName = 0;
  let duplicatesResolved = 0;

  for (const a of airports) {
    const iata = (a.iata_code || "").trim().toUpperCase();
    if (!IATA_RE.test(iata)) {
      if (a.iata_code) skippedBadCode++;
      continue;
    }
    if (a.type === "closed") {
      skippedClosed++;
      continue;
    }
    const name = (a.name || "").trim();
    if (!name) {
      skippedNoName++;
      continue;
    }
    let city = (a.municipality || "").trim() || name;
    // OurAirports sometimes appends a disambiguating suburb/administrative
    // detail in parentheses (e.g. "Paris (Roissy-en-France, Val-d'Oise)"
    // for CDG) -- strip it so the primary city label matches what
    // travelers actually type ("Paris", not the full parenthetical).
    city = city.replace(/\s*\([^)]*\)\s*$/, "").trim() || city;

    const countryCode = (a.iso_country || "").trim().toUpperCase();
    const country = countryNameByCode.get(countryCode) || countryCode;
    const continent = (a.continent || "").trim().toUpperCase();
    const lat = a.latitude_deg ? Number(a.latitude_deg) : null;
    const lon = a.longitude_deg ? Number(a.longitude_deg) : null;

    const record = {
      iata,
      name,
      city,
      country,
      countryCode,
      continent,
      lat: Number.isFinite(lat) ? Math.round(lat * 10000) / 10000 : null,
      lon: Number.isFinite(lon) ? Math.round(lon * 10000) / 10000 : null,
      type: a.type,
      scheduled: a.scheduled_service === "yes",
    };

    const existing = byIata.get(iata);
    if (!existing) {
      byIata.set(iata, record);
    } else {
      duplicatesResolved++;
      const existingRank = TYPE_RANK[existing.type] ?? 50;
      const newRank = TYPE_RANK[record.type] ?? 50;
      if (newRank < existingRank || (newRank === existingRank && record.scheduled && !existing.scheduled)) {
        byIata.set(iata, record);
      }
    }
  }

  const all = [...byIata.values()];
  all.sort((a, b) => {
    const r = (TYPE_RANK[a.type] ?? 50) - (TYPE_RANK[b.type] ?? 50);
    if (r !== 0) return r;
    return a.city.localeCompare(b.city);
  });

  console.log({ totalActiveWithValidIata: all.length, skippedClosed, skippedBadCode, skippedNoName, duplicatesResolved });

  // --- Integrity checks --------------------------------------------------
  const iataSet = new Set();
  let dupeIata = 0;
  let invalidIata = 0;
  let missingName = 0;
  let missingCity = 0;
  for (const r of all) {
    if (iataSet.has(r.iata)) dupeIata++;
    iataSet.add(r.iata);
    if (!IATA_RE.test(r.iata)) invalidIata++;
    if (!r.name) missingName++;
    if (!r.city) missingCity++;
  }
  console.log({ dupeIata, invalidIata, missingName, missingCity, uniqueIataCount: iataSet.size });
  if (dupeIata > 0 || invalidIata > 0 || missingName > 0 || missingCity > 0) {
    throw new Error("Data integrity check failed — refusing to write output. See counts above.");
  }
  if (all.length < 1000) {
    throw new Error(`Only ${all.length} airports resolved — this looks wrong, refusing to write output.`);
  }

  // Compact tuple output: [iata, name, city, country, countryCode, continent, lat, lon]
  const tuples = all.map((r) => [r.iata, r.name, r.city, r.country, r.countryCode, r.continent, r.lat, r.lon]);
  writeFileSync(OUTPUT_PATH, JSON.stringify(tuples));
  console.log(`Wrote ${tuples.length} records to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
