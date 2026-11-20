import { headers } from "next/headers";
import { readVisitorHint } from "@/lib/visitor-hint";
import { suggestAirportNear } from "@/data/airports";

// GET /api/visitor-hint - the visitor's OWN approximate location, reduced to what the forms need: a country code (for the phone field) and the
// nearest major airport (for the departure field). See src/lib/visitor-hint.ts for what is and is not read.
//
// Deliberately not cacheable: the answer is about the requester. `private, no-store` stops Cloudflare and any other cache from handing one
// visitor's answer to another. No IP address, no coordinates, no city name are in the response, and nothing is logged or stored.
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" } as const;

export async function GET() {
  const hint = readVisitorHint(await headers());
  const body: { countryCode?: string; airport?: { iata: string; city: string; name: string; country: string } } = {};
  if (hint.countryCode) body.countryCode = hint.countryCode;
  if (hint.latitude !== undefined && hint.longitude !== undefined) {
    try {
      const suggestion = await suggestAirportNear(hint.latitude, hint.longitude);
      if (suggestion) body.airport = suggestion.airport;
    } catch {
      // The airport suggestion is optional: if the dataset cannot be read the visitor simply gets no suggestion.
    }
  }
  return Response.json(body, { headers: NO_STORE });
}
