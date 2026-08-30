import { getAirlinesByIata } from "@/data/airlines";
import { AirlineLogo } from "@/components/brand/AirlineLogo";

// The specific airlines shown here are a curated editorial choice — the
// actual logo, name, and ICAO code for each come from the application's own
// static airline registry (src/data/airlines.ts), not a database query, so
// this list only needs to name which codes to feature. Add or remove a code
// here (and to that registry, if it's a new one) and the badge, logo, and
// name all follow automatically.
const FEATURED_AIRLINE_CODES = ["QR", "SQ", "EK", "AA", "LH", "EY", "QF", "NH", "TK"];

export function AirlineStrip() {
  const airlines = getAirlinesByIata(FEATURED_AIRLINE_CODES);
  if (airlines.length === 0) return null;

  return (
    <div className="border-b border-white/10 bg-[var(--color-navy-900)] py-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="text-center text-[0.65rem] font-semibold tracking-[0.2em] text-white/55">
          AIRLINES TRAVELERS MAY CONSIDER
        </p>
        <div className="mt-6 grid grid-cols-3 gap-x-4 gap-y-6 sm:grid-cols-5 lg:grid-cols-9 lg:gap-x-3">
          {airlines.map((airline) => (
            <div key={airline.iata} className="flex flex-col items-center gap-2 text-center">
              <AirlineLogo name={airline.name} logoUrl={airline.logoUrl} className="transition-transform duration-200 hover:scale-105" />
              <span className="text-xs leading-tight text-white/70">{airline.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
