import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";

// A stand-in for the parts of the Compass Tools CRM that the website calls, written from the CRM's published contract (its
// docs/WEBSITE_LEAD_API.md and the public routes /api/public/contact-inquiry and /api/public/subscribe at CRM commit 4d33c29), NOT from the
// website's own code - so a test against it can catch the website sending something the real CRM would refuse. It is local and loopback-only:
// nothing here can reach a real CRM, a database or the internet.
//
// What it enforces for POST /api/v1/website/flight-inquiries (the same order as the CRM's route):
//   401 unauthorized            missing / wrong Bearer key
//   415 unsupported_media_type  not application/json
//   400 idempotency_key_required Idempotency-Key missing or not 8-200 chars of [A-Za-z0-9._-]
//   400 invalid_json / validation_failed   STRICT body: unknown fields are rejected (including companyId and submissionId)
//   201 {ok,leadId,duplicate:false}  new key;   200 {..,duplicate:true}  same key + same request;   409 idempotency_key_reused  same key, different request
// The lead id is derived from the key exactly like the CRM's deriveWebsiteLeadId.
// It also verifies the signed visitor context (x-ct-visitor-context / x-ct-visitor-signature) with its own, independent HMAC code.

export const STUB_ALLOWED_FIELDS = [
  "firstName", "lastName", "phone", "email", "tripType", "departureAirportIata", "arrivalAirportIata", "departureDate", "returnDate", "segments",
  "cabinClass", "adults", "children", "infants", "datesFlexible", "preferredAirline", "approximateBudget", "budgetCurrency", "additionalNotes",
] as const;
const TRIP_TYPES = ["ONE_WAY", "ROUND_TRIP", "MULTI_CITY"];
const CABINS = ["ECONOMY", "PREMIUM_ECONOMY", "BUSINESS", "FIRST"];
const SUBJECTS = ["GENERAL_INQUIRY", "FLIGHT_REQUEST_HELP", "EXISTING_BOOKING", "CORPORATE_TRAVEL", "OTHER"];

export type VisitorContext = { state: "absent" | "invalid" | "verified"; ip?: string; city?: string; region?: string; country?: string; timezone?: string };

export type RecordedRequest = {
  method: string;
  path: string;
  headers: Record<string, string>;
  bodyText: string;
  json?: Record<string, unknown>;
  /** What the stub answered with. */
  status: number;
  /** v1 flight inquiries only. */
  visitor?: VisitorContext;
};

export type Scripted =
  | { status: number; body?: unknown; headers?: Record<string, string>; delayMs?: number }
  /** Accept the request and never answer. */
  | "hang"
  /** Drop the connection without an answer, BEFORE doing anything. */
  | "reset"
  /** Do the real work (the lead is stored), then drop the connection instead of answering - the reply is lost. */
  | "drop-after-store";

export type StubCrm = {
  /** Origin, e.g. http://127.0.0.1:41234 */
  url: string;
  requests: RecordedRequest[];
  /** Number of distinct leads created through the v1 endpoint. */
  leadCount: () => number;
  /** Answer the next `count` requests to `path` (any path when omitted) with `response` instead of the real behaviour. */
  script: (response: Scripted, options?: { count?: number; path?: string }) => void;
  clearScripts: () => void;
  reset: () => void;
  close: () => Promise<void>;
};

const derivedLeadId = (key: string) => "c" + createHash("sha256").update(`business-flights-travel:flight-request:${key}`).digest("hex").slice(0, 24);

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function verifyVisitor(headers: Record<string, string>, secret: string | undefined, nowMs: number): VisitorContext {
  const context = headers["x-ct-visitor-context"];
  const signature = headers["x-ct-visitor-signature"];
  if (!context && !signature) return { state: "absent" };
  if (!context || !signature || !secret) return { state: "invalid" };
  const expected = createHmac("sha256", secret).update(context).digest();
  const given = Buffer.from(signature, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { state: "invalid" };
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(Buffer.from(context, "base64url").toString("utf8"));
  } catch {
    return { state: "invalid" };
  }
  if (payload.v !== 1 || typeof payload.ts !== "number" || Math.abs(nowMs / 1000 - payload.ts) > 300) return { state: "invalid" };
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  const city = str(payload.city);
  return { state: "verified", ip: str(payload.ip), city: city === undefined ? undefined : decodeURIComponent(city), region: str(payload.region), country: str(payload.country), timezone: str(payload.timezone) };
}

type Issue = { path: string; message: string };

function validateFlightBody(body: Record<string, unknown>): Issue[] {
  const issues: Issue[] = [];
  for (const key of Object.keys(body)) if (!(STUB_ALLOWED_FIELDS as readonly string[]).includes(key)) issues.push({ path: key, message: "Unrecognized key" });
  const str = (k: string, min: number, max: number, required: boolean) => {
    const v = body[k];
    if (v === undefined) return required && issues.push({ path: k, message: "Required" });
    if (typeof v !== "string" || v.length < min || v.length > max) issues.push({ path: k, message: `Expected a string of ${min}-${max} characters` });
  };
  str("firstName", 1, 200, true);
  str("lastName", 1, 200, true);
  str("phone", 1, 50, true);
  if (typeof body.phone === "string" && body.phone.replace(/\D/g, "").length < 7) issues.push({ path: "phone", message: "That doesn't look like a valid phone number" });
  if (body.email !== undefined && (typeof body.email !== "string" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email))) issues.push({ path: "email", message: "Invalid email" });
  if (body.tripType !== undefined && !TRIP_TYPES.includes(body.tripType as string)) issues.push({ path: "tripType", message: "Invalid option" });
  if (body.cabinClass !== undefined && !CABINS.includes(body.cabinClass as string)) issues.push({ path: "cabinClass", message: "Invalid option" });
  for (const k of ["departureAirportIata", "arrivalAirportIata"]) if (body[k] !== undefined && (typeof body[k] !== "string" || (body[k] as string).length !== 3)) issues.push({ path: k, message: "Expected exactly 3 characters" });
  const int = (k: string, min: number, max: number) => {
    const v = body[k];
    if (v !== undefined && (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max)) issues.push({ path: k, message: `Expected a number between ${min} and ${max}` });
  };
  int("adults", 1, 20);
  int("children", 0, 20);
  int("infants", 0, 20);
  if (body.datesFlexible !== undefined && typeof body.datesFlexible !== "boolean") issues.push({ path: "datesFlexible", message: "Expected boolean" });
  str("preferredAirline", 0, 200, false);
  if (body.approximateBudget !== undefined && (typeof body.approximateBudget !== "number" || body.approximateBudget <= 0)) issues.push({ path: "approximateBudget", message: "Expected a positive number" });
  if (body.budgetCurrency !== undefined && !/^[A-Za-z]{3}$/.test(String(body.budgetCurrency))) issues.push({ path: "budgetCurrency", message: "Invalid" });
  str("additionalNotes", 0, 5000, false);
  if (body.segments !== undefined) {
    if (!Array.isArray(body.segments) || body.segments.length < 1 || body.segments.length > 20) issues.push({ path: "segments", message: "Expected 1-20 legs" });
    else {
      body.segments.forEach((leg, i) => {
        if (!leg || typeof leg !== "object") return void issues.push({ path: `segments.${i}`, message: "Expected object" });
        for (const k of Object.keys(leg)) if (!["departureAirportIata", "arrivalAirportIata", "departureDate"].includes(k)) issues.push({ path: `segments.${i}.${k}`, message: "Unrecognized key" });
        for (const k of ["departureAirportIata", "arrivalAirportIata"]) if (typeof (leg as Record<string, unknown>)[k] !== "string" || ((leg as Record<string, string>)[k] as string).length !== 3) issues.push({ path: `segments.${i}.${k}`, message: "Expected exactly 3 characters" });
      });
    }
  }
  return issues.slice(0, 10);
}

export async function startStubCrm(options: { apiKey: string; companyId?: string; ingestSecret?: string }): Promise<StubCrm> {
  const requests: RecordedRequest[] = [];
  const leads = new Map<string, { hash: string; leadId: string }>();
  const scripts: Array<{ response: Scripted; remaining: number; path?: string }> = [];
  const sockets = new Set<import("node:net").Socket>();

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers)) headers[k] = Array.isArray(v) ? v.join(", ") : (v ?? "");
      const path = (req.url ?? "").split("?")[0];
      const bodyText = Buffer.concat(chunks).toString("utf8");
      const record: RecordedRequest = { method: req.method ?? "", path, headers, bodyText, status: 0 };
      requests.push(record);

      let dropReply = false;
      const send = (status: number, body: unknown, extra: Record<string, string> = {}) => {
        record.status = status;
        if (dropReply) return void req.socket.destroy(); // the work was done; the answer never arrives
        res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra });
        res.end(JSON.stringify(body));
      };
      const fail = (status: number, code: string, message: string, fields?: Issue[], extra: Record<string, string> = {}) => send(status, { ok: false, error: { code, message, ...(fields ? { fields } : {}) } }, extra);

      const scripted = scripts.find((s) => s.remaining > 0 && (s.path === undefined || s.path === path));
      if (scripted) {
        scripted.remaining--;
        const r = scripted.response;
        if (r === "hang") return void (record.status = 0); // never answers; the socket stays open until the test closes the stub
        if (r === "reset") return void ((record.status = 0), req.socket.destroy());
        if (r === "drop-after-store") dropReply = true; // falls through to the real behaviour below
        else {
          const respond = () => send(r.status, r.body ?? { ok: false, error: { code: "scripted", message: "scripted" } }, r.headers);
          return r.delayMs ? void setTimeout(respond, r.delayMs) : respond();
        }
      }

      if (req.method !== "POST") return fail(405, "method_not_allowed", "POST only");

      // ---- POST /api/v1/website/flight-inquiries -------------------------------------------------------------------------------
      if (path === "/api/v1/website/flight-inquiries") {
        const auth = headers.authorization ?? "";
        if (auth !== `Bearer ${options.apiKey}`) return fail(401, "unauthorized", "Missing or invalid credentials.", undefined, { "WWW-Authenticate": "Bearer" });
        if (!/^application\/json(\s*;.*)?$/i.test(headers["content-type"] ?? "")) return fail(415, "unsupported_media_type", "Content-Type must be application/json.");
        const key = (headers["idempotency-key"] ?? "").trim();
        if (!/^[A-Za-z0-9._-]{8,200}$/.test(key)) return fail(400, "idempotency_key_required", "Send an Idempotency-Key header.");
        let json: unknown;
        try {
          json = JSON.parse(bodyText);
        } catch {
          return fail(400, "invalid_json", "The body is not valid JSON.");
        }
        if (json === null || typeof json !== "object" || Array.isArray(json)) return fail(400, "invalid_json", "The body must be a JSON object.");
        record.json = json as Record<string, unknown>;
        const issues = validateFlightBody(record.json);
        if (issues.length) return fail(400, "validation_failed", "The request did not pass validation.", issues);
        record.visitor = verifyVisitor(headers, options.ingestSecret, Date.now());
        const hash = createHash("sha256").update(canonical(record.json)).digest("hex");
        const existing = leads.get(key);
        if (!existing) {
          const leadId = derivedLeadId(key);
          leads.set(key, { hash, leadId });
          return send(201, { ok: true, leadId, duplicate: false });
        }
        if (existing.hash !== hash) return fail(409, "idempotency_key_reused", "This Idempotency-Key was already used for a different request.");
        return send(200, { ok: true, leadId: existing.leadId, duplicate: true });
      }

      // ---- the CRM's public (unauthenticated) endpoints -------------------------------------------------------------------------
      let json: Record<string, unknown> | undefined;
      try {
        json = JSON.parse(bodyText);
      } catch {
        return send(400, { ok: false, error: "Invalid JSON body" });
      }
      record.json = json;
      if (path === "/api/public/contact-inquiry") {
        const ok =
          json?.companyId === (options.companyId ?? "test-company") &&
          typeof json.firstName === "string" && json.firstName.length > 0 &&
          typeof json.lastName === "string" && json.lastName.length > 0 &&
          typeof json.email === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(json.email) &&
          SUBJECTS.includes(json.subject as string) &&
          typeof json.message === "string" && json.message.length >= 1 && json.message.length <= 5000;
        if (!ok) return send(400, { ok: false, error: "Invalid submission" });
        return send(200, { ok: true, id: "inq_" + createHash("sha256").update(bodyText).digest("hex").slice(0, 12) });
      }
      if (path === "/api/public/subscribe") {
        const ok = json?.companyId === (options.companyId ?? "test-company") && typeof json.email === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(json.email);
        if (!ok) return send(400, { ok: false, error: "Invalid submission" });
        return send(200, { ok: true });
      }
      return fail(404, "not_found", "Not found.");
    });
  });
  server.on("connection", (s) => {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;

  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    leadCount: () => leads.size,
    script: (response, o = {}) => void scripts.push({ response, remaining: o.count ?? 1, path: o.path }),
    clearScripts: () => void (scripts.length = 0),
    reset: () => {
      requests.length = 0;
      leads.clear();
      scripts.length = 0;
    },
    close: () =>
      new Promise<void>((resolve) => {
        for (const s of sockets) s.destroy();
        server.close(() => resolve());
      }),
  };
}
