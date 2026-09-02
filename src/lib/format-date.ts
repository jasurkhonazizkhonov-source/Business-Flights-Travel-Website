// `new Date("2026-08-11")` parses a bare "YYYY-MM-DD" string as UTC
// midnight, not local midnight. Formatting that Date back out via
// `toLocaleDateString` in any timezone behind UTC (the whole Western
// Hemisphere) then displays the day *before* the date that was actually
// stored — e.g. a post published "2026-08-11" shows as "August 10, 2026".
// This is the same class of bug already fixed once for date validation in
// lib/validations/flight-request.ts; forcing local-midnight parsing here
// (appending a time component) is the same fix applied to date *display*.
export function formatIsoDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}
