// Approximate, IP-derived location — read from the geolocation headers the platform's edge adds to a request:
// Vercel's x-vercel-ip-* (readApproximateLocation) or, behind Cloudflare / a Cloudflare Tunnel, Cloudflare's cf-ip* headers
// (readCloudflareApproximateLocation). The caller decides which one applies (src/lib/submission-info.ts) from the trusted
// proxy mode; a header is never read unless the matching proxy is the one in front of the app.
//
// Why no external IP-intelligence provider: the platform already supplies the
// useful part (city, region, country, time zone) with no credentials, no
// extra network call, no added latency and no failure mode that could touch a
// submission — and it avoids sending every customer's IP address to a third
// party. What the platform does NOT supply is the network owner (ISP /
// organisation) or ASN; those are therefore not captured, not guessed. If
// that is ever wanted, it needs a vendor decision and its own privacy review.
//
// Everything here is an ESTIMATE of where the network is, never of where the
// person is: VPNs, proxies, mobile networks, corporate gateways, privacy
// relays and IPv6 all make it wrong or coarse. The values are kept as the
// platform gave them (validated for shape, never "improved"); anything absent
// or malformed is simply omitted. Precise coordinates and postal codes are
// deliberately not read — they would add precision this data does not have.

export type ApproximateLocation = {
  city?: string;
  /** ISO 3166-2 subdivision code exactly as supplied (e.g. "CA", "NSW"), kept for completeness. */
  regionCode?: string;
  /** Human-readable region where this app knows the name (US states, Canadian provinces, Australian states); otherwise undefined and only the code is shown. */
  region?: string;
  country?: string;
  /** ISO 3166-1 alpha-2, upper-case. */
  countryCode?: string;
  /** IANA zone, e.g. "America/Los_Angeles". */
  timeZone?: string;
};

export const GEO_SOURCE = "Vercel edge geolocation (approximate)";
export const CLOUDFLARE_GEO_SOURCE = "Cloudflare edge geolocation (approximate)";

const US_STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
  DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico",
  NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island",
  SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", PR: "Puerto Rico",
};
const CA_PROVINCES: Record<string, string> = {
  AB: "Alberta", BC: "British Columbia", MB: "Manitoba", NB: "New Brunswick", NL: "Newfoundland and Labrador", NS: "Nova Scotia",
  NT: "Northwest Territories", NU: "Nunavut", ON: "Ontario", PE: "Prince Edward Island", QC: "Quebec", SK: "Saskatchewan", YT: "Yukon",
};
const AU_STATES: Record<string, string> = {
  ACT: "Australian Capital Territory", NSW: "New South Wales", NT: "Northern Territory", QLD: "Queensland", SA: "South Australia",
  TAS: "Tasmania", VIC: "Victoria", WA: "Western Australia",
};
const REGION_NAMES: Record<string, Record<string, string>> = { US: US_STATES, CA: CA_PROVINCES, AU: AU_STATES };

function decode(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

function cleanText(value: string | null, max: number, decoder: (v: string) => string | undefined = decode): string | undefined {
  if (!value) return undefined;
  const decoded = decoder(value);
  if (!decoded) return undefined;
  // Printable text only — no control characters, bounded length: this ends up in
  // an email and in the CRM and must never carry markup-significant surprises.
  const trimmed = decoded.replace(/\p{Cc}+/gu, " ").trim();
  return trimmed && trimmed.length <= max ? trimmed : undefined;
}

/**
 * Cloudflare sends non-ASCII header values as raw UTF-8 bytes. Node exposes header values as latin-1 strings, so "São Paulo" arrives as
 * "SÃ£o Paulo"; re-reading the bytes as UTF-8 restores it. Pure ASCII is returned unchanged; bytes that are not valid UTF-8 are dropped.
 */
export function decodeUtf8Header(value: string): string | undefined {
  // Pure ASCII needs no re-reading (every code unit is below U+0080).
  if (![...value].some((ch) => ch.charCodeAt(0) > 0x7f)) return value;
  const text = Buffer.from(value, "latin1").toString("utf8");
  // U+FFFD is what the UTF-8 decoder substitutes for bytes that are not valid UTF-8.
  return text.includes(String.fromCharCode(0xfffd)) ? undefined : text;
}

function countryName(code: string): string | undefined {
  try {
    const name = new Intl.DisplayNames(["en"], { type: "region" }).of(code);
    // Intl echoes the code back for a region it doesn't know, and labels the
    // reserved "ZZ" code "Unknown Region" — both mean "unknown", not a name.
    return name && name !== code && name !== "Unknown Region" ? name : undefined;
  } catch {
    return undefined;
  }
}

function validTimeZone(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return value;
  } catch {
    return undefined;
  }
}

/** Reads Vercel's geolocation headers. Returns undefined when none of them yielded a usable value. */
export function readApproximateLocation(headerList: Headers): ApproximateLocation | undefined {
  const countryRaw = headerList.get("x-vercel-ip-country")?.trim().toUpperCase();
  const countryCode = countryRaw && /^[A-Z]{2}$/.test(countryRaw) ? countryRaw : undefined;
  const regionRaw = headerList.get("x-vercel-ip-country-region")?.trim().toUpperCase();
  const regionCode = regionRaw && /^[A-Z0-9]{1,4}$/.test(regionRaw) ? regionRaw : undefined;

  const location: ApproximateLocation = {
    city: cleanText(headerList.get("x-vercel-ip-city"), 80),
    regionCode,
    region: countryCode && regionCode ? REGION_NAMES[countryCode]?.[regionCode] : undefined,
    country: countryCode ? countryName(countryCode) : undefined,
    countryCode,
    timeZone: validTimeZone(cleanText(headerList.get("x-vercel-ip-timezone"), 64)),
  };
  const anyValue = Object.values(location).some((v) => v !== undefined);
  if (!anyValue) return undefined;
  // Drop undefined keys so a stored/serialised object only holds what was obtained.
  return Object.fromEntries(Object.entries(location).filter(([, v]) => v !== undefined)) as ApproximateLocation;
}

/**
 * Reads Cloudflare's geolocation request headers. `cf-ipcountry` is present whenever IP Geolocation (or the "Add visitor location
 * headers" Managed Transform) is on; city, region and time zone only with that Managed Transform (cloudflare docs, checked 2026-10-16).
 * `XX` (no data) and `T1` (Tor) mean "unknown", never a country. Coordinates, postal and metro codes are deliberately not read.
 */
export function readCloudflareApproximateLocation(headerList: Headers): ApproximateLocation | undefined {
  const countryRaw = headerList.get("cf-ipcountry")?.trim().toUpperCase();
  const countryCode = countryRaw && /^[A-Z]{2}$/.test(countryRaw) && countryRaw !== "XX" && countryRaw !== "T1" ? countryRaw : undefined;
  const regionRaw = headerList.get("cf-region-code")?.trim().toUpperCase();
  const regionCode = regionRaw && /^[A-Z0-9]{1,4}$/.test(regionRaw) ? regionRaw : undefined;
  const location: ApproximateLocation = {
    city: cleanText(headerList.get("cf-ipcity"), 80, decodeUtf8Header),
    regionCode,
    region: cleanText(headerList.get("cf-region"), 80, decodeUtf8Header) ?? (countryCode && regionCode ? REGION_NAMES[countryCode]?.[regionCode] : undefined),
    country: countryCode ? countryName(countryCode) : undefined,
    countryCode,
    timeZone: validTimeZone(cleanText(headerList.get("cf-timezone"), 64, decodeUtf8Header)),
  };
  const anyValue = Object.values(location).some((v) => v !== undefined);
  if (!anyValue) return undefined;
  return Object.fromEntries(Object.entries(location).filter(([, v]) => v !== undefined)) as ApproximateLocation;
}

/** "San Francisco, California, United States" — only the parts that exist, comma-joined. */
export function formatLocation(location: ApproximateLocation): string {
  return [location.city, location.region ?? location.regionCode, location.country ?? location.countryCode].filter(Boolean).join(", ");
}
