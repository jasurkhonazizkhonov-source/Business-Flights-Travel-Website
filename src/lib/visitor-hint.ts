import { trustedProxyMode } from "@/lib/client-ip";
import { readApproximateLocation, readCloudflareApproximateLocation } from "@/lib/ip-geo";
import { isUsablePosition } from "@/lib/airport-suggestion";

// What the server tells the visitor's OWN browser about where the platform in front of the app thinks the visitor is, so the forms can suggest a
// phone country code and a departure airport. It is the smallest useful answer:
//  - never the IP address (not read here at all, not returned);
//  - the country as an ISO code, and - only when the platform supplies a valid latitude/longitude pair - the position, which the route turns into
//    an airport and then DROPS: the browser receives a country code and an airport, not coordinates;
//  - nothing at all unless the proxy in front of the app is the trusted one (src/lib/client-ip.ts, TRUSTED_PROXY): the same rule that governs the
//    location captured for the CRM, so a client-supplied "cf-ipcountry" header sent straight to an exposed origin is never believed.
//
// Everything here is an ESTIMATE of where the visitor's network is: VPNs, mobile carriers, corporate gateways and privacy relays make it wrong or
// coarse. Callers present it as a suggestion the visitor can change, never as a fact about the visitor.

export type ServerVisitorHint = { countryCode?: string; latitude?: number; longitude?: number };

export function readVisitorHint(headerList: Headers): ServerVisitorHint {
  const mode = trustedProxyMode();
  const location = mode === "cloudflare" ? readCloudflareApproximateLocation(headerList) : mode === "vercel" ? readApproximateLocation(headerList) : undefined;
  if (!location) return {};
  const hint: ServerVisitorHint = {};
  if (location.countryCode) hint.countryCode = location.countryCode;
  if (isUsablePosition(location.latitude, location.longitude)) {
    hint.latitude = location.latitude;
    hint.longitude = location.longitude;
  }
  return hint;
}
