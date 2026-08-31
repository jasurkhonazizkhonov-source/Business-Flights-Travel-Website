// Application-owned airport reference data — deliberately NOT sourced from
// PostgreSQL. See docs/ENVIRONMENT.md for the full history of why (the
// flight form's autocomplete used to query the CRM's shared `Airport`
// table directly and broke in production the moment a differently-seeded
// database was connected).
//
// The raw data lives in airports.json — 9,057 real, currently-active
// airports with a valid 3-letter IATA code, sourced from OurAirports
// (https://ourairports.com/data/, public domain / Unlicense), the
// industry-standard open aviation dataset also used by FlightAware,
// ADS-B Exchange, and similar tools. It is the full, verified set of
// IATA-coded airports in that dataset as of the export used to build this
// file — not a hand-curated subset, and not invented. See
// .claude's session notes / PRODUCTION_READINESS.md for the exact
// generation/verification process (duplicate-IATA and malformed-code
// checks, all zero).
//
// Stored as an array of compact tuples, not objects with repeated key
// names — at 9,000+ records that halves the JSON payload compared to
// `{iata, name, city, ...}` per row, which matters because this file is
// lazily code-split (see loadIndex() below), not part of any page's
// initial JavaScript bundle: it only downloads the first time a user
// actually focuses an airport field, and every autocomplete after that
// reuses the same in-memory, already-parsed index for the rest of the
// session.
//
// Tuple layout: [iata, name, city, country, countryCode, continent, lat, lon]
type AirportTuple = [
  iata: string,
  name: string,
  city: string,
  country: string,
  countryCode: string,
  continent: string,
  lat: number | null,
  lon: number | null,
];

import type { AirportOption } from "@/lib/validations/flight-request";
export type { AirportOption };

type AirportIndex = {
  all: AirportTuple[];
  byIata: Map<string, AirportTuple>;
};

let indexPromise: Promise<AirportIndex> | null = null;

function buildIndex(rows: AirportTuple[]): AirportIndex {
  const byIata = new Map<string, AirportTuple>();
  for (const row of rows) byIata.set(row[0], row);
  return { all: rows, byIata };
}

// Memoized: the JSON module is only ever fetched/parsed once per page
// session, no matter how many times searchAirports/findAirportByIata are
// called — every caller after the first awaits the same already-resolved
// promise.
function loadIndex(): Promise<AirportIndex> {
  if (!indexPromise) {
    indexPromise = import("./airports.json").then((mod) => buildIndex(mod.default as unknown as AirportTuple[]));
  }
  return indexPromise;
}

function toOption(row: AirportTuple): AirportOption {
  return { iata: row[0], name: row[1], city: row[2], country: row[3] };
}

// Real-world queries don't always match a "starts with" prefix ("Heathrow",
// "New York" for JFK/LGA/EWR), so this checks IATA/city/name substrings —
// the same semantics the original DB-backed implementation used. The data
// file is pre-sorted large_airport → medium → small (see
// .tmp-airport-data/build-airports.mjs), so a bounded scan that stops once
// it has gathered a small multiple of `limit` candidates naturally reaches
// major hub airports well before it would ever need to walk the full
// 9,000+ entries, keeping this fast without a full-array scan on every
// keystroke.
export async function searchAirports(query: string, limit = 8): Promise<AirportOption[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const { all, byIata } = await loadIndex();
  const qUpper = trimmed.toUpperCase();
  const qLower = trimmed.toLowerCase();

  const exact = byIata.get(qUpper);
  const candidateCap = limit * 6;
  const candidates: AirportTuple[] = [];
  for (const row of all) {
    if (row === exact) continue;
    if (candidates.length >= candidateCap) break;
    if (row[0].startsWith(qUpper) || row[2].toLowerCase().includes(qLower) || row[1].toLowerCase().includes(qLower)) {
      candidates.push(row);
    }
  }

  candidates.sort((a, b) => {
    // Prefer a city that starts with the query over one that merely
    // contains it ("San" -> San Francisco before Ansan), then alphabetical.
    const aStarts = a[2].toLowerCase().startsWith(qLower) ? 0 : 1;
    const bStarts = b[2].toLowerCase().startsWith(qLower) ? 0 : 1;
    if (aStarts !== bStarts) return aStarts - bStarts;
    return a[2].localeCompare(b[2]);
  });

  const ranked = exact ? [exact, ...candidates] : candidates;
  return ranked.slice(0, limit).map(toOption);
}

// Fire-and-forget: starts the lazy chunk load without blocking anything or
// forcing an await at the call site. AirportAutocomplete calls this once,
// after an idle delay, on mount — so on a typical desktop/mobile visit the
// dataset is already downloaded and parsed by the time the user actually
// focuses the field and starts typing, while still never being part of the
// page's initial JavaScript bundle or blocking first paint/interactivity.
export function prefetchAirports(): void {
  void loadIndex();
}

// Authoritative single-airport lookup by IATA code. Used server-side
// (server/actions/submit-flight-request.ts) to validate a submitted airport
// against this application-owned dataset — the same dataset the
// autocomplete offered it from in the first place — rather than trusting
// whatever a client submitted, and to source the canonical name/city/
// country when upserting the CRM's own `Airport` row for that code.
export async function findAirportByIata(iata: string): Promise<AirportOption | null> {
  const { byIata } = await loadIndex();
  const row = byIata.get(iata.trim().toUpperCase());
  return row ? toOption(row) : null;
}
