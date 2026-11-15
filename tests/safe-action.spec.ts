import { test, expect } from "@playwright/test";
import { callAction, isContactResult, isFlightResult, isNewsletterResult } from "../src/lib/safe-action";

// callAction() is what keeps a visitor on the page with their input intact when a Server Action FAILS AS A WHOLE (dropped connection, timeout, thrown
// action, a reply that is not the documented shape). These tests pin every outcome class, plus the guards that decide whether a reply is trusted.

const ok = (v: unknown): v is { ok: true } => typeof v === "object" && v !== null && (v as { ok?: unknown }).ok === true;

test.describe("callAction", () => {
  test("a valid reply is returned unchanged", async () => {
    const r = await callAction(async () => ({ ok: true }), ok, 1000);
    expect(r).toEqual({ ok: true, value: { ok: true } });
  });

  test("a fetch failure (TypeError) is a network failure", async () => {
    const r = await callAction(async () => { throw new TypeError("Failed to fetch"); }, ok, 1000);
    expect(r).toEqual({ ok: false, reason: "network" });
  });

  test("any other thrown error is an exception, and its message is never exposed", async () => {
    const r = await callAction(async () => { throw new Error("secret stack detail"); }, ok, 1000);
    expect(r).toEqual({ ok: false, reason: "exception" });
    expect(JSON.stringify(r)).not.toContain("secret");
  });

  test("a synchronous throw is handled too", async () => {
    const r = await callAction(() => { throw new Error("sync"); }, ok, 1000);
    expect(r).toEqual({ ok: false, reason: "exception" });
  });

  test("a reply of the wrong shape is rejected (invalid-response), including null, strings and arrays", async () => {
    for (const bad of [null, undefined, "ok", 7, [], { ok: "yes" }, { status: "ok" }]) {
      const r = await callAction(async () => bad, ok, 1000);
      expect(r, JSON.stringify(bad)).toEqual({ ok: false, reason: "invalid-response" });
    }
  });

  test("a call that never answers times out and the form is released", async () => {
    const t0 = Date.now();
    const r = await callAction(() => new Promise<never>(() => undefined), ok, 60);
    expect(r).toEqual({ ok: false, reason: "timeout" });
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  test("a call that fails AFTER the timeout cannot become an unhandled rejection", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (e: unknown) => unhandled.push(e);
    process.on("unhandledRejection", onUnhandled);
    try {
      const r = await callAction(() => new Promise<never>((_, reject) => setTimeout(() => reject(new TypeError("late")), 120)), ok, 30);
      expect(r).toEqual({ ok: false, reason: "timeout" });
      await new Promise((resolve) => setTimeout(resolve, 250)); // let the late rejection happen
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  test("a call that answers just before the timeout still wins", async () => {
    const r = await callAction(() => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 20)), ok, 500);
    expect(r.ok).toBe(true);
  });

  test("it never calls the action a second time (no automatic retry)", async () => {
    let calls = 0;
    await callAction(async () => { calls++; throw new TypeError("Failed to fetch"); }, ok, 1000);
    await callAction(() => { calls++; return new Promise<never>(() => undefined); }, ok, 30);
    expect(calls).toBe(2);
  });
});

test.describe("result-shape guards", () => {
  const flightSummary = { tripType: "ONE_WAY", route: "Paris (CDG) → Rome (FCO)", departureDate: "2027-03-01", passengers: 1, cabinClass: "BUSINESS" };

  test("contact: accepts the two documented shapes only", () => {
    expect(isContactResult({ ok: true })).toBe(true);
    expect(isContactResult({ ok: false, error: "x" })).toBe(true);
    expect(isContactResult({ ok: false, error: "x", fieldErrors: { phone: "bad" } })).toBe(true);
    for (const bad of [null, {}, { ok: false }, { ok: false, error: 3 }, { ok: false, error: "x", fieldErrors: { phone: 3 } }, { ok: "true" }, "x"]) expect(isContactResult(bad), JSON.stringify(bad)).toBe(false);
  });

  test("newsletter: success needs the boolean, failure needs the message", () => {
    expect(isNewsletterResult({ ok: true, alreadySubscribed: false })).toBe(true);
    expect(isNewsletterResult({ ok: false, error: "x" })).toBe(true);
    for (const bad of [null, { ok: true }, { ok: true, alreadySubscribed: "no" }, { ok: false }, {}]) expect(isNewsletterResult(bad), JSON.stringify(bad)).toBe(false);
  });

  test("flight: success needs a complete summary; failure needs the message", () => {
    expect(isFlightResult({ ok: true, summary: flightSummary })).toBe(true);
    expect(isFlightResult({ ok: true, summary: { ...flightSummary, returnDate: "2027-03-08" } })).toBe(true);
    expect(isFlightResult({ ok: false, error: "x", fieldErrors: { email: "bad" } })).toBe(true);
    for (const bad of [null, { ok: true }, { ok: true, summary: {} }, { ok: true, summary: { ...flightSummary, passengers: "1" } }, { ok: false }, { ok: false, error: "x", fieldErrors: "no" }]) expect(isFlightResult(bad), JSON.stringify(bad)).toBe(false);
  });
});
