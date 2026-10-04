import { resolveClientIp, trustedProxyMode, type ClientIpResult, type IpVersion } from "@/lib/client-ip";
import { GEO_SOURCE, readApproximateLocation, type ApproximateLocation } from "@/lib/ip-geo";

// What the SERVER learned about a request from its own trusted request path —
// never from a form field or anything the browser's JavaScript could supply.
//
//  Known:      the full IP address the server received (when it can be
//              determined reliably).
//  Estimated:  the location below, which is only the platform's guess at where
//              that network is.
// When either cannot be determined it is simply absent; nothing is invented.

export type SubmissionInfo = {
  ip?: { address: string; version: IpVersion };
  location?: ApproximateLocation;
  /** Where `location` came from — present only when `location` is. */
  locationSource?: string;
  capturedAt: Date;
};

/** Value-free reason an IP could not be determined — safe to log (never the address). */
export type IpUnavailableReason = Extract<ClientIpResult, { ok: false }>["reason"];

export function captureSubmissionInfo(headerList: Headers, now: Date = new Date()): { info: SubmissionInfo; ipUnavailable?: IpUnavailableReason } {
  const resolved = resolveClientIp(headerList);
  const info: SubmissionInfo = { capturedAt: now };
  if (resolved.ok) info.ip = { address: resolved.address, version: resolved.version };

  // The x-vercel-ip-* headers are only trustworthy where Vercel's edge itself
  // sets them; anywhere else a client could send them, so they are not read.
  if (trustedProxyMode() === "vercel") {
    const location = readApproximateLocation(headerList);
    if (location) {
      info.location = location;
      info.locationSource = GEO_SOURCE;
    }
  }
  return resolved.ok ? { info } : { info, ipUnavailable: resolved.reason };
}

/** True when there is anything worth persisting or showing. */
export function hasSubmissionDetails(info: SubmissionInfo | undefined): info is SubmissionInfo {
  return !!info && (!!info.ip || !!info.location);
}
