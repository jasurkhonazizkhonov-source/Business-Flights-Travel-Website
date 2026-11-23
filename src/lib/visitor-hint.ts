import { effectiveProxyMode } from "@/lib/client-ip";
import { readApproximateLocation, readCloudflareApproximateLocation } from "@/lib/ip-geo";

// What the server tells the visitor's OWN browser about where the platform in front of the app thinks the visitor is, so the forms can suggest a
// phone country code. It is the smallest useful answer:
//  - never the IP address (not read here at all, not returned);
//  - the country as an ISO code and nothing else: no city, no coordinates, and no airport (the departure airport is suggested only from the DEVICE's own
//    position, and only if the visitor allows it: src/hooks/useDeviceAirport.ts. A network-derived airport would be a suggestion the visitor had refused);
//  - nothing at all unless the proxy in front of the app is the trusted one (src/lib/client-ip.ts, TRUSTED_PROXY): the same rule that governs the
//    location captured for the CRM, so a client-supplied "cf-ipcountry" header sent straight to an exposed origin is never believed.
//
// Everything here is an ESTIMATE of where the visitor's network is: VPNs, mobile carriers, corporate gateways and privacy relays make it wrong or
// coarse. Callers present it as a suggestion the visitor can change, never as a fact about the visitor.

export type ServerVisitorHint = { countryCode?: string };

export function readVisitorHint(headerList: Headers): ServerVisitorHint {
  const mode = effectiveProxyMode(headerList);
  const location = mode === "cloudflare" ? readCloudflareApproximateLocation(headerList) : mode === "vercel" ? readApproximateLocation(headerList) : undefined;
  if (!location) return {};
  const hint: ServerVisitorHint = {};
  if (location.countryCode) hint.countryCode = location.countryCode;
  return hint;
}
