// Centralized, application-owned airline reference data — deliberately NOT
// sourced from the CRM's PostgreSQL Airline table. The website's visual
// rendering (the footer airline strip today; any future GDS/quote-itinerary
// display) must keep working even if the app is ever pointed at a
// different database that doesn't have this reference table pre-seeded, or
// has it seeded differently. Logo files live in public/airlines/*.png,
// alongside this data, so both the metadata and the asset itself are fully
// application-owned and deployable independent of any database.
//
// This intentionally covers the airlines this website actually displays —
// not a full mirror of the CRM's ~5,700-row Airline table, which would just
// reintroduce a database dependency in a different form. A code with no
// match here (e.g. a GDS/Apollo segment on a carrier not listed) falls back
// to AirlineLogo's generic icon rather than a hard error — see
// src/components/brand/AirlineLogo.tsx.
export type AirlineOption = {
  iata: string;
  icao: string | null;
  name: string;
  logoUrl: string | null;
};

export const AIRLINES: AirlineOption[] = [
  { iata: "QR", icao: "QTR", name: "Qatar Airways", logoUrl: "/airlines/qr.png" },
  { iata: "SQ", icao: "SIA", name: "Singapore Airlines", logoUrl: "/airlines/sq.png" },
  { iata: "EK", icao: "UAE", name: "Emirates", logoUrl: "/airlines/ek.png" },
  { iata: "AA", icao: "AAL", name: "American Airlines", logoUrl: "/airlines/aa.png" },
  { iata: "LH", icao: "DLH", name: "Lufthansa", logoUrl: "/airlines/lh.png" },
  { iata: "EY", icao: "ETD", name: "Etihad Airways", logoUrl: "/airlines/ey.png" },
  { iata: "QF", icao: "QFA", name: "Qantas", logoUrl: "/airlines/qf.png" },
  // Displayed as "ANA" (its common name) rather than the full legal name
  // "All Nippon Airways" — a short, recognizable label reads better in a
  // compact badge.
  { iata: "NH", icao: "ANA", name: "ANA", logoUrl: "/airlines/nh.png" },
  { iata: "TK", icao: "THY", name: "Turkish Airlines", logoUrl: "/airlines/tk.png" },
];

const BY_IATA = new Map(AIRLINES.map((a) => [a.iata, a]));

export function getAirlineByIata(code: string): AirlineOption | null {
  return BY_IATA.get(code.toUpperCase()) ?? null;
}

/** Preserves the caller's order/duplicates; codes with no match are dropped. */
export function getAirlinesByIata(codes: string[]): AirlineOption[] {
  return codes.map((c) => getAirlineByIata(c)).filter((a): a is AirlineOption => a !== null);
}
