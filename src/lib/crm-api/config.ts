// Configuration of the website's server-side calls to the Compass Tools CRM. Pure: it takes the environment as an argument so it can be tested
// without touching process.env; the server-only glue that actually reads process.env is src/server/crm-api.ts.
//
// Messages name VARIABLES and rules, never values: a problem string is safe to log and to show an operator.
//
//   CRM_API_URL         origin of the CRM on the private Docker network, e.g. http://compass-crm:3000   (required for every call)
//   CRM_API_KEY         bearer key for POST /api/v1/website/flight-inquiries, >= 32 characters           (required for flight requests)
//   CRM_COMPANY_ID      the CRM Company id for the CRM's PUBLIC endpoints (contact inquiry, newsletter)  (required for those two forms; also needed to sign flight requests)
//   LEAD_INGEST_SECRET  signs EVERY request (signing v2: method, path, company, exact body, one-time nonce, visitor IP / approximate location), >= 32 characters,
//                       identical on both sides. Optional here, but a CRM that has the secret REFUSES unsigned requests, so set both or neither.
//
// None of these is ever a NEXT_PUBLIC_* variable and none is read by client code.

export const MIN_SECRET_LENGTH = 32;

export type Env = Record<string, string | undefined>;

/** What a call needs: the authenticated flight-inquiry API, or the CRM's public (unauthenticated) inquiry/subscribe endpoints. */
export type CrmApiTarget = "flight-inquiry" | "public-inquiry";

export type CrmApiConfig = {
  /** Origin only (scheme + host + port), no trailing slash. */
  baseUrl: string;
  /** Present for "flight-inquiry". */
  apiKey?: string;
  /** Present for "public-inquiry". */
  companyId?: string;
  /** Present only when set AND long enough. */
  ingestSecret?: string;
};

export type CrmApiConfigResult = { ok: true; config: CrmApiConfig; warnings: string[] } | { ok: false; problems: string[] };

/** The origin of a CRM URL, or a reason (never the value) why it is unusable. */
export function parseCrmBaseUrl(raw: string | undefined): { ok: true; origin: string } | { ok: false; reason: string } {
  const value = raw?.trim();
  if (!value) return { ok: false, reason: "CRM_API_URL is not set" };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: "CRM_API_URL is not a valid URL" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, reason: "CRM_API_URL must start with http:// or https://" };
  if (url.username || url.password) return { ok: false, reason: "CRM_API_URL must not contain credentials" };
  if ((url.pathname !== "/" && url.pathname !== "") || url.search || url.hash) {
    return { ok: false, reason: "CRM_API_URL must be an origin only (scheme, host and port - no path, query or fragment)" };
  }
  return { ok: true, origin: url.origin };
}

export function resolveCrmApiConfig(env: Env, target: CrmApiTarget): CrmApiConfigResult {
  const problems: string[] = [];
  const warnings: string[] = [];

  const base = parseCrmBaseUrl(env.CRM_API_URL);
  if (!base.ok) problems.push(base.reason);

  let apiKey: string | undefined;
  let companyId: string | undefined;
  if (target === "flight-inquiry") {
    apiKey = env.CRM_API_KEY?.trim();
    if (!apiKey) problems.push("CRM_API_KEY is not set");
    else if (apiKey.length < MIN_SECRET_LENGTH) problems.push(`CRM_API_KEY must be at least ${MIN_SECRET_LENGTH} characters`);
  } else {
    companyId = env.CRM_COMPANY_ID?.trim();
    if (!companyId) problems.push("CRM_COMPANY_ID is not set");
  }

  let ingestSecret: string | undefined;
  const rawSecret = env.LEAD_INGEST_SECRET?.trim();
  // Every request to the CRM is signed (signing v2: method, path, company, exact body, one-time nonce) whenever a secret is configured: the flight request,
  // the contact inquiry and the newsletter sign-up. A secret that is too short is not used (a warning, nothing is signed): the CRM, which requires a signature
  // as soon as IT has a secret, then refuses the request and the visitor sees the generic failure.
  if (rawSecret) {
    if (rawSecret.length >= MIN_SECRET_LENGTH) ingestSecret = rawSecret;
    else warnings.push(`LEAD_INGEST_SECRET is shorter than ${MIN_SECRET_LENGTH} characters, so requests are not signed`);
  }
  // The signature binds the company. The public calls already carry it; the flight call's company is fixed by the CRM's credential, so signing it needs
  // the same CRM_COMPANY_ID (the CRM's WEBSITE_API_COMPANY_ID) to be configured here as well.
  if (target === "flight-inquiry" && ingestSecret) {
    companyId = env.CRM_COMPANY_ID?.trim();
    if (!companyId) problems.push("CRM_COMPANY_ID is not set (it is needed to sign flight requests)");
  }

  if (problems.length > 0 || !base.ok) return { ok: false, problems };
  return { ok: true, config: { baseUrl: base.origin, apiKey, companyId, ingestSecret }, warnings };
}
