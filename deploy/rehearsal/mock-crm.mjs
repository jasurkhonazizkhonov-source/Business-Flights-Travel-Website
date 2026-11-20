// A MOCK of the Compass Tools CRM for the isolated Docker rehearsal (deploy/rehearsal/run.sh). Not the CRM and not a production component: fake data only,
// no database, no persistence. It answers the three website routes, verifies the website's signing v2 (the same canonical message as the real CRM), keeps nonces
// in memory, and offers GET /db-check, which proves THIS container (standing in for the CRM) can reach the rehearsal database while the website cannot.
import http from "node:http";
import net from "node:net";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const SECRET = process.env.LEAD_INGEST_SECRET ?? "";
const COMPANY = process.env.MOCK_COMPANY_ID ?? "rehearsal-company";
const DB_HOST = process.env.DB_HOST ?? "db";
const nonces = new Set();
const json = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
};

function verify(req, bodyText, companyId) {
  const context = req.headers["x-ct-visitor-context"];
  const signature = req.headers["x-ct-visitor-signature"];
  if (!context || !signature || SECRET.length < 32) return "missing";
  let payload;
  try { payload = JSON.parse(Buffer.from(context, "base64url").toString("utf8")); } catch { return "malformed"; }
  if (payload.v !== 2 || !Number.isInteger(payload.ts) || typeof payload.nonce !== "string") return "bad_payload";
  const bodyHash = createHash("sha256").update(Buffer.from(bodyText, "utf8")).digest("hex");
  const path = new URL(req.url, "http://x").pathname;
  const fields = [req.method.toUpperCase(), path, companyId, String(payload.ts), payload.nonce, bodyHash, context];
  const message = "CT-WEBSITE-REQUEST-V2\n" + fields.map((f) => `${Buffer.byteLength(f, "utf8")}:${f}`).join("\n");
  const expected = createHmac("sha256", SECRET).update(message).digest();
  const given = Buffer.from(signature, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return "bad_signature";
  const age = Date.now() / 1000 - payload.ts;
  if (age > 120 || -age > 30) return "stale";
  const key = `${companyId}:${payload.nonce}`;
  if (nonces.has(key)) return "replay";
  nonces.add(key);
  return "ok";
}

http
  .createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const path = new URL(req.url, "http://x").pathname;
      if (req.method === "GET" && path === "/api/health") return json(res, 200, { status: "ok" });
      if (req.method === "GET" && path === "/db-check") {
        const s = net.connect({ host: DB_HOST, port: 5432, timeout: 3000 });
        s.on("connect", () => { s.destroy(); json(res, 200, { db: "reachable" }); });
        s.on("error", () => json(res, 503, { db: "unreachable" }));
        s.on("timeout", () => { s.destroy(); json(res, 503, { db: "timeout" }); });
        return;
      }
      if (req.method !== "POST") return json(res, 405, { ok: false });
      const bodyText = Buffer.concat(chunks).toString("utf8");
      let body;
      try { body = JSON.parse(bodyText); } catch { return json(res, 400, { ok: false, error: "Invalid JSON body" }); }
      const isFlight = path === "/api/v1/website/flight-inquiries";
      const company = isFlight ? COMPANY : String(body.companyId);
      if (!isFlight && company !== COMPANY) return json(res, 400, { ok: false, error: "Unknown company" });
      if (!isFlight && path !== "/api/public/contact-inquiry" && path !== "/api/public/subscribe") return json(res, 404, { ok: false });
      if (isFlight && req.headers.authorization !== `Bearer ${process.env.WEBSITE_API_KEY}`) return json(res, 401, { ok: false, error: { code: "unauthorized" } });
      const sig = verify(req, bodyText, company);
      if (SECRET && sig !== "ok") return json(res, 401, isFlight ? { ok: false, error: { code: "invalid_signature" } } : { ok: false, error: "Invalid request signature." });
      if (isFlight) return json(res, 201, { ok: true, leadId: "c" + createHash("sha256").update(String(req.headers["idempotency-key"])).digest("hex").slice(0, 24), duplicate: false });
      return json(res, 200, { ok: true });
    });
  })
  .listen(3000, "0.0.0.0", () => console.log("mock CRM listening on 3000"));
