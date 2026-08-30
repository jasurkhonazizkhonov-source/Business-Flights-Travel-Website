export function formatFareUSD(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export const FARE_DISCLAIMER =
  "Displayed fares are indicative starting prices and may vary depending on departure city, travel dates, airline, availability, routing, and fare conditions. Your travel specialist will confirm an exact, bookable fare.";
