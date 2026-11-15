import type { SubmitFlightRequestResult } from "@/server/actions/submit-flight-request";
import type { SubmitContactMessageResult } from "@/server/actions/submit-contact-message";
import type { SubscribeNewsletterResult } from "@/server/actions/subscribe-newsletter";

// A Server Action can fail in two different ways. It can RETURN a failure ({ ok: false, error }): the forms already show that inline. Or the
// call itself can fail - a dropped connection, a timeout, the server crashing or restarting, a framework rejection (over the body limit, the
// origin check), a reply that is not the documented shape. Those arrive as a thrown error (or never arrive at all), and an unhandled throw inside
// a transition is rendered by the route error boundary: the visitor loses the whole form and everything they typed.
//
// callAction() turns every one of those outcomes into a plain value, so the form can keep its state, show an inline message and let the visitor
// try again. It never retries by itself: a Server Action that may already have been processed must not be repeated silently. (Repeating a
// submission is safe only because the server de-duplicates on the form's submission key; see the actions.)
//
// This module is imported by client components. It must not import server-only code (the imports above are types only and are erased).

export type ActionFailure = "network" | "timeout" | "invalid-response" | "exception";
export type ActionOutcome<T> = { ok: true; value: T } | { ok: false; reason: ActionFailure };

/** How long the visitor waits before the form gives up on a call. Longer than the server's own worst case (the flight request retries the CRM up to three times). */
export const ACTION_TIMEOUT_MS = { flightRequest: 45_000, contactMessage: 20_000, newsletter: 20_000 } as const;

/** What the visitor is told when the call itself failed. They never claim that anything was sent, and say that nothing typed was lost. */
export const ACTION_FAILURE_MESSAGES = {
  flightRequest: "We couldn't submit your flight request. Your information is still here. Please try again.",
  contactMessage: "Your message could not be sent. Please try again.",
  newsletter: "We couldn't complete your subscription. Please try again.",
} as const;

function classify(error: unknown): ActionFailure {
  // fetch() rejects with a TypeError when the network fails ("Failed to fetch", "NetworkError…", "Load failed" on Safari).
  return error instanceof TypeError ? "network" : "exception";
}

export async function callAction<T>(run: () => Promise<unknown>, isValid: (value: unknown) => value is T, timeoutMs: number): Promise<ActionOutcome<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
  });
  // The call's own rejection is converted here, so a call that fails AFTER the timeout has already won cannot become an unhandled rejection.
  let call: Promise<{ kind: "value"; value: unknown } | { kind: "error"; error: unknown }>;
  try {
    call = run().then(
      (value) => ({ kind: "value" as const, value }),
      (error: unknown) => ({ kind: "error" as const, error }),
    );
  } catch (error) {
    // run() itself threw synchronously.
    if (timer) clearTimeout(timer);
    return { ok: false, reason: classify(error) };
  }
  try {
    const first = await Promise.race([call, timeout]);
    if (first === "timeout") return { ok: false, reason: "timeout" };
    if (first.kind === "error") return { ok: false, reason: classify(first.error) };
    return isValid(first.value) ? { ok: true, value: first.value } : { ok: false, reason: "invalid-response" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ---- result-shape guards: a reply is trusted only if it has exactly the documented shape -----------------------------------------------------

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validFieldErrors(value: unknown): boolean {
  return value === undefined || (isObject(value) && Object.values(value).every((v) => typeof v === "string"));
}

export function isContactResult(value: unknown): value is SubmitContactMessageResult {
  if (!isObject(value)) return false;
  if (value.ok === true) return true;
  return value.ok === false && typeof value.error === "string" && validFieldErrors(value.fieldErrors);
}

export function isNewsletterResult(value: unknown): value is SubscribeNewsletterResult {
  if (!isObject(value)) return false;
  if (value.ok === true) return typeof value.alreadySubscribed === "boolean";
  return value.ok === false && typeof value.error === "string";
}

export function isFlightResult(value: unknown): value is SubmitFlightRequestResult {
  if (!isObject(value)) return false;
  if (value.ok === true) {
    const s = value.summary;
    return (
      isObject(s) &&
      typeof s.tripType === "string" &&
      typeof s.route === "string" &&
      typeof s.departureDate === "string" &&
      (s.returnDate === undefined || typeof s.returnDate === "string") &&
      typeof s.passengers === "number" &&
      typeof s.cabinClass === "string"
    );
  }
  return value.ok === false && typeof value.error === "string" && validFieldErrors(value.fieldErrors);
}
