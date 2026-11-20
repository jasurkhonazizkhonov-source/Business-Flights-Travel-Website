// Picking the departure airport to SUGGEST from an approximate position. Pure functions only (no data loading here), so the same code runs on the
// server (position from Cloudflare's approximate-location headers) and in the browser (position from the device, when the visitor allows it).
//
// "Suitable" means: a major commercial passenger airport (the large class of the project's airport data, see scripts/build-airport-hubs.mjs),
// never the nearest small airfield, and not further away than MAX_SUGGESTION_KM - past that the "nearest" airport is not really near the visitor
// and no suggestion is better than a misleading one. The visitor can always change it.
//
// Distance is the great-circle (haversine) distance in kilometres. It is an estimate of closeness, not travel time: it knows nothing about
// roads, rail links, mountains or which airport has the better connections. That is why the result is only ever a suggestion.

/** [IATA code, latitude, longitude] - one row of src/data/airport-hubs.json. */
export type HubRow = readonly [iata: string, latitude: number, longitude: number];

/** Beyond this distance no airport is suggested. */
export const MAX_SUGGESTION_KM = 400;

const EARTH_RADIUS_KM = 6371.0088;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

export function isUsablePosition(latitude: unknown, longitude: unknown): latitude is number {
  return (
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180 &&
    !(latitude === 0 && longitude === 0) // "null island": a no-data placeholder, not a place
  );
}

export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export type NearestHub = { iata: string; distanceKm: number };

/** The closest hub to a position, or null when the position is unusable or no hub lies within `maxKm`. Ties go to the earlier row (deterministic). */
export function nearestHub(latitude: number, longitude: number, hubs: readonly HubRow[], maxKm: number = MAX_SUGGESTION_KM): NearestHub | null {
  if (!isUsablePosition(latitude, longitude)) return null;
  let best: NearestHub | null = null;
  for (const [iata, lat, lon] of hubs) {
    const km = distanceKm(latitude, longitude, lat, lon);
    if (!best || km < best.distanceKm) best = { iata, distanceKm: km };
  }
  return best && best.distanceKm <= maxKm ? { iata: best.iata, distanceKm: Math.round(best.distanceKm) } : null;
}
