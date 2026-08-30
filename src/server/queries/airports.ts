import { destinations } from "@/data/destinations";
import type { AirportOption } from "@/lib/validations/flight-request";

/**
 * Resolves a destination-page IATA code into the same shape the flight
 * form's airport picker uses, so a "Get a Flight Quote to Paris" link can
 * pre-fill the "To" field. Sourced from the application's own destinations
 * registry (src/data/destinations.ts) rather than the CRM's Airport table —
 * every code this ever receives in practice originates from that same
 * registry (see the `quoteHref` on the destination detail page), so there's
 * no need to round-trip through the database for it. Not `async` anymore,
 * but kept as a function (not a bare export) so call sites don't need to
 * change if this ever needs to become async again.
 */
export function resolveAirportByIata(iata: string | undefined | null): AirportOption | null {
  if (!iata) return null;
  const code = iata.toUpperCase();
  const destination = destinations.find((d) => d.iata === code);
  if (!destination) return null;
  return { iata: destination.iata, city: destination.city, name: destination.city, country: destination.country };
}
