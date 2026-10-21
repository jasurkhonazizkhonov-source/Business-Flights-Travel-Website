import { z } from "zod";
import type { CrmApiConfig } from "./config";

// HTTP client for the Compass Tools CRM, used only by the website's SERVER ACTIONS (never imported by a client component; the one place that
// reads the environment is src/server/crm-api.ts). It takes its configuration and `fetch` as arguments so every outcome can be tested against
// a local stand-in server.
//
// Contracts (verified against the CRM at commit 4d33c29 and against the CRM pull-request build 01e809d, which this client was run against
// with fake data; see docs/CRM_API_INTEGRATION.md):
//   * POST /api/v1/website/flight-inquiries   authenticated (Bearer), REQUIRED Idempotency-Key, strict JSON body. Safe to retry with the SAME key.
//   * POST /api/public/contact-inquiry        the CRM's browser-facing, UNauthenticated endpoint (companyId in the body). NOT idempotent.
//   * POST /api/public/subscribe              the same kind of endpoint. Server-side an upsert, but the CRM notifies on a new subscriber.
//
// Rules this module enforces:
//   * the key is sent only to the authenticated endpoint, only as a Bearer header, and is never logged or put in a message;
//   * a non-idempotent write (the contact inquiry) is attempted exactly ONCE - a timeout leaves the outcome unknown and is reported as such;
//   * the flight inquiry is retried only for failures the contract marks retryable (network error, timeout, 429, 500, 502-504, an unreadable
//     success reply), always with the SAME key and the SAME body, so a retry cannot create a second lead;
//   * a redirect is an error (the Authorization header must never be replayed somewhere else);
//   * nothing is ever written to a log here and nothing from a response body except the documented error `code` / field `path`s is exposed -
//     never a value the visitor typed, never the CRM's message text.

export const DEFAULT_TIMEOUT_MS = 10_000;
export const DEFAULT_FLIGHT_ATTEMPTS = 3;
const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000];
const MAX_RETRY_AFTER_MS = 5_000;

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;
type Common = { fetchImpl?: FetchLike; timeoutMs?: number; sleep?: (ms: number) => Promise<void> };

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// ---- the flight inquiry --------------------------------------------------------------------------------------------------------------------

export type FlightInquiryOutcome =
  /** 201 (created) or 200 (this key was already received for the same request). Either way the CRM has the lead. */
  | { status: "created" | "duplicate"; leadId: string; attempts: number }
  /** 400 / 409 / 413 / 415: the CRM refused THIS request. Retrying cannot help. `fieldPaths` are rule paths only, never values. */
  | { status: "rejected"; httpStatus: number; code: string; fieldPaths: string[]; attempts: number }
  /** 401 / 404: the credential or the route is wrong (rotated key, public hostname). An operator problem; never retried. */
  | { status: "misconfigured"; httpStatus: number; attempts: number }
  /** Every attempt failed with something retryable. The outcome at the CRM is unknown only if the last failure was a timeout/network error. */
  | { status: "unavailable"; reason: "timeout" | "network" | "rate_limited" | "server_error" | "bad_response"; httpStatus?: number; attempts: number };

const successSchema = z.object({ ok: z.literal(true), leadId: z.string().min(1).max(100), duplicate: z.boolean() });
const errorSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.string().max(100),
    fields: z.array(z.object({ path: z.string().max(200) })).max(20).optional(),
  }),
});

async function readJson(res: Response): Promise<unknown> {
  try {
    return JSON.parse(await res.text());
  } catch {
    return undefined;
  }
}

function retryAfterMs(res: Response): number | undefined {
  const raw = res.headers.get("retry-after");
  if (!raw || !/^\d{1,4}$/.test(raw.trim())) return undefined;
  return Math.min(Number(raw.trim()) * 1000, MAX_RETRY_AFTER_MS);
}

export async function postFlightInquiry(
  options: Common & {
    config: CrmApiConfig;
    body: unknown;
    idempotencyKey: string;
    /** x-ct-visitor-context / x-ct-visitor-signature (src/lib/crm-api/visitor-context.ts), or {}. */
    visitorHeaders?: Record<string, string>;
    maxAttempts?: number;
  },
): Promise<FlightInquiryOutcome> {
  const { config, idempotencyKey } = options;
  const fetchImpl: FetchLike = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const sleep = options.sleep ?? defaultSleep;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_FLIGHT_ATTEMPTS);
  const url = `${config.baseUrl}/api/v1/website/flight-inquiries`;
  // Serialised ONCE: every attempt sends exactly the same bytes.
  const payload = JSON.stringify(options.body);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${config.apiKey ?? ""}`,
    "Idempotency-Key": idempotencyKey,
    ...(options.visitorHeaders ?? {}),
  };

  let last: Extract<FlightInquiryOutcome, { status: "unavailable" }>["reason"] = "network";
  let lastStatus: number | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let wait = BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)];
    let res: Response | undefined;
    try {
      res = await fetchImpl(url, { method: "POST", headers, body: payload, signal: AbortSignal.timeout(timeoutMs), redirect: "error", cache: "no-store" });
    } catch (err) {
      const name = (err as { name?: string } | null)?.name;
      last = name === "TimeoutError" || name === "AbortError" ? "timeout" : "network";
      lastStatus = undefined;
    }

    if (res) {
      const status = res.status;
      lastStatus = status;
      const json = await readJson(res).catch(() => undefined);
      if (status === 200 || status === 201) {
        const parsed = successSchema.safeParse(json);
        if (parsed.success) return { status: parsed.data.duplicate ? "duplicate" : "created", leadId: parsed.data.leadId, attempts: attempt };
        last = "bad_response"; // an unreadable success reply: the lead may exist - the SAME key makes asking again safe
      } else if (status === 429) {
        last = "rate_limited";
        wait = retryAfterMs(res) ?? wait;
      } else if (status === 500 || status === 502 || status === 503 || status === 504) {
        last = "server_error";
      } else if (status === 401 || status === 404) {
        return { status: "misconfigured", httpStatus: status, attempts: attempt };
      } else {
        const parsed = errorSchema.safeParse(json);
        return {
          status: "rejected",
          httpStatus: status,
          code: parsed.success ? parsed.data.error.code : "unrecognised",
          fieldPaths: parsed.success ? (parsed.data.error.fields ?? []).map((f) => f.path) : [],
          attempts: attempt,
        };
      }
    }
    if (attempt < maxAttempts) await sleep(wait);
  }
  return { status: "unavailable", reason: last, httpStatus: lastStatus, attempts: maxAttempts };
}

// ---- the public (unauthenticated) endpoints: contact inquiry and newsletter -------------------------------------------------------------------

export type PublicOutcome =
  | { status: "ok" }
  /** 400: the CRM refused this submission (invalid, or an unknown company). Not retried. */
  | { status: "rejected"; httpStatus: number }
  | { status: "rate_limited" }
  /** A single attempt failed (timeout, network, 5xx, unreadable reply). For a write that is not idempotent the outcome at the CRM is unknown. */
  | { status: "unavailable"; reason: "timeout" | "network" | "server_error" | "bad_response" | "unexpected_status"; httpStatus?: number };

const publicOkSchema = z.object({ ok: z.literal(true) });

async function postPublic(options: Common & { config: CrmApiConfig; path: string; body: unknown }): Promise<PublicOutcome> {
  const fetchImpl: FetchLike = options.fetchImpl ?? ((input, init) => fetch(input, init));
  let res: Response;
  try {
    res = await fetchImpl(`${options.config.baseUrl}${options.path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(options.body),
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      redirect: "error",
      cache: "no-store",
    });
  } catch (err) {
    const name = (err as { name?: string } | null)?.name;
    return { status: "unavailable", reason: name === "TimeoutError" || name === "AbortError" ? "timeout" : "network" };
  }
  const json = await readJson(res).catch(() => undefined);
  if (res.status >= 200 && res.status < 300) {
    return publicOkSchema.safeParse(json).success ? { status: "ok" } : { status: "unavailable", reason: "bad_response", httpStatus: res.status };
  }
  if (res.status === 429) return { status: "rate_limited" };
  if (res.status === 400) return { status: "rejected", httpStatus: 400 };
  if (res.status >= 500) return { status: "unavailable", reason: "server_error", httpStatus: res.status };
  return { status: "unavailable", reason: "unexpected_status", httpStatus: res.status };
}

/** POST /api/public/contact-inquiry. Exactly ONE attempt: the CRM has no duplicate guard on this route, so a retry could store the message twice. */
export function postContactInquiry(options: Common & { config: CrmApiConfig; body: { firstName: string; lastName: string; email: string; phone: string; subject: string; message: string } }): Promise<PublicOutcome> {
  return postPublic({ ...options, path: "/api/public/contact-inquiry", body: { companyId: options.config.companyId, ...options.body } });
}

/** POST /api/public/subscribe. One attempt. */
export function postNewsletterSubscription(options: Common & { config: CrmApiConfig; email: string; source: string }): Promise<PublicOutcome> {
  return postPublic({ ...options, path: "/api/public/subscribe", body: { companyId: options.config.companyId, email: options.email, source: options.source } });
}
