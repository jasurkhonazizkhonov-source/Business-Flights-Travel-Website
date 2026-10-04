// Server-side client IP resolution. Never trusts a client-submitted value:
// this module only reads the request's own headers, and only the ones the
// platform in front of the app is known to set itself.
//
// A port of the CRM's src/lib/request-ip.ts (the "Compass Tools" app that
// shares this database) so both apps resolve a client IP by the same rule.
//
// Forwarded-for style headers are only trustworthy when a proxy that sits in
// front of the app overwrites them. If the app were reachable directly, a
// client could send `X-Forwarded-For: 8.8.8.8` and nothing here could tell it
// from a real hop. So:
//   - On Vercel (VERCEL=1, which only the platform sets on its own
//     deployments, or an explicit TRUSTED_PROXY=vercel) ONLY the headers
//     Vercel's edge sets are read: x-vercel-forwarded-for, x-real-ip,
//     x-forwarded-for. The RFC 7239 `Forwarded` header and CF-Connecting-IP
//     are never read — Vercel passes a client-sent value for those through.
//   - TRUSTED_PROXY=cloudflare reads cf-connecting-ip only;
//     nginx/generic read Forwarded, X-Forwarded-For (first hop), X-Real-IP
//     for an operator who has asserted their proxy overwrites them.
//   - Anywhere else (local `next dev`, an unknown host) nothing is trusted
//     and the result is `undefined` — the secure default, and the correct
//     one in dev: there is no proxy hop to read.
// An explicit TRUSTED_PROXY (including "none") always wins.
//
// A resolved value that is not a valid IPv4/IPv6 address, or that is in a
// private/reserved range (a leaked internal hop, or a dev machine talking to
// itself — never a real customer), is treated as "could not be determined"
// rather than stored. Header values are never logged.

const IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

export type IpVersion = "v4" | "v6";

/** Strict syntactic check, delegated to the platform's own parser (node:net) so IPv6 edge cases (compression, embedded IPv4) are not hand-rolled. */
function isIpv6(value: string): boolean {
  if (!value.includes(":")) return false;
  try {
    // The URL parser accepts exactly the valid IPv6 literal forms and rejects the rest.
    const parsed = new URL(`http://[${value}]/`);
    return parsed.hostname.startsWith("[");
  } catch {
    return false;
  }
}

/**
 * Canonical string form for a valid address, or undefined if it is not one.
 *  - IPv4 is returned as-is.
 *  - IPv6 is lower-cased and zero-compressed by the URL parser ("2001:DB8:0:0:0:0:0:1" -> "2001:db8::1"),
 *    so the same address always becomes the same string.
 *  - An IPv4-mapped IPv6 address ("::ffff:203.0.113.9", emitted by some
 *    load balancers for an IPv4 peer) collapses to plain IPv4, otherwise one
 *    real client could be stored as two different strings.
 *  - An IPv6 zone id ("fe80::1%eth0") is not part of an address and is dropped.
 */
export function normalizeIp(raw: string): string | undefined {
  const value = raw.trim().replace(/%[0-9a-zA-Z._-]+$/, "");
  if (!value) return undefined;
  if (IPV4_RE.test(value)) return value;
  if (!isIpv6(value)) return undefined;
  const canonical = new URL(`http://[${value}]/`).hostname.slice(1, -1);
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(canonical);
  if (mapped) {
    // WHATWG URL rewrites an embedded IPv4 tail to hex groups; convert back.
    const hi = parseInt(mapped[1], 16);
    const lo = parseInt(mapped[2], 16);
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }
  return canonical;
}

export function ipVersionOf(ip: string): IpVersion {
  return ip.includes(":") ? "v6" : "v4";
}

function isPrivateOrReservedIpv4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 carrier-grade NAT
  if (a === 0) return true; // "this network"
  if (a >= 224) return true; // multicast + reserved (224.0.0.0/4, 240.0.0.0/4)
  return false;
}

function isPrivateOrReservedIpv6(ip: string): boolean {
  if (ip === "::1" || ip === "::") return true; // loopback / unspecified
  if (/^f[cd][0-9a-f]{2}:/.test(ip)) return true; // fc00::/7 unique local
  if (/^fe[89ab][0-9a-f]:/.test(ip)) return true; // fe80::/10 link-local
  if (/^ff[0-9a-f]{2}:/.test(ip)) return true; // ff00::/8 multicast
  if (/^2001:0?db8:/.test(ip)) return true; // 2001:db8::/32 documentation
  return false;
}

/** Private, loopback, link-local, shared (CGNAT), documentation, multicast or reserved — never a genuine customer's public address. */
export function isPrivateOrReservedIp(ip: string): boolean {
  return ip.includes(":") ? isPrivateOrReservedIpv6(ip) : isPrivateOrReservedIpv4(ip);
}

export type TrustedProxyMode = "none" | "vercel" | "cloudflare" | "nginx" | "generic";
const VALID_MODES: ReadonlySet<string> = new Set(["vercel", "cloudflare", "nginx", "generic"]);

export function trustedProxyMode(): TrustedProxyMode {
  const raw = process.env.TRUSTED_PROXY?.trim().toLowerCase();
  if (raw === "none") return "none";
  if (raw && VALID_MODES.has(raw)) return raw as TrustedProxyMode;
  if (process.env.VERCEL === "1") return "vercel";
  return "none";
}

/** Strips an optional port suffix and IPv6 brackets: "[2001:db8::1]:4711" -> "2001:db8::1", "203.0.113.9:51820" -> "203.0.113.9". */
function stripPort(candidate: string): string {
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(candidate);
  if (bracketed) return bracketed[1];
  const ipv4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(candidate);
  if (ipv4WithPort) return ipv4WithPort[1];
  return candidate;
}

function parseForwardedHeader(value: string): string | undefined {
  const firstElement = value.split(",")[0];
  const match = /for="?([^;,"]+)"?/i.exec(firstElement ?? "");
  return match ? stripPort(match[1].trim()) : undefined;
}

function candidateHeaderValues(mode: Exclude<TrustedProxyMode, "none">, headerList: Headers): string[] {
  const out: string[] = [];
  const push = (v: string | null | undefined) => {
    const cleaned = stripPort((v ?? "").trim());
    if (cleaned) out.push(cleaned);
  };
  const firstOf = (v: string | null) => v?.split(",")[0];

  if (mode === "vercel") {
    push(firstOf(headerList.get("x-vercel-forwarded-for")));
    push(headerList.get("x-real-ip"));
    push(firstOf(headerList.get("x-forwarded-for")));
  } else if (mode === "cloudflare") {
    push(headerList.get("cf-connecting-ip"));
  } else {
    const forwarded = headerList.get("forwarded");
    if (forwarded) push(parseForwardedHeader(forwarded));
    push(firstOf(headerList.get("x-forwarded-for")));
    push(headerList.get("x-real-ip"));
  }
  return out;
}

export type ClientIpResult =
  | { ok: true; address: string; version: IpVersion }
  | { ok: false; reason: "no_trusted_proxy" | "no_header" | "invalid" | "private_or_reserved" };

/**
 * The originating client IP from trusted request headers, with the reason
 * when it cannot be determined (a stable, value-free category that is safe to
 * log). Never guesses: an unknown IP is reported as unknown.
 */
export function resolveClientIp(headerList: Headers): ClientIpResult {
  const mode = trustedProxyMode();
  if (mode === "none") return { ok: false, reason: "no_trusted_proxy" };

  const candidates = candidateHeaderValues(mode, headerList);
  if (candidates.length === 0) return { ok: false, reason: "no_header" };

  let sawPrivate = false;
  for (const raw of candidates) {
    const address = normalizeIp(raw);
    if (!address) continue;
    if (isPrivateOrReservedIp(address)) {
      sawPrivate = true;
      continue;
    }
    return { ok: true, address, version: ipVersionOf(address) };
  }
  return { ok: false, reason: sawPrivate ? "private_or_reserved" : "invalid" };
}
