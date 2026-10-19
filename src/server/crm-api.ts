import "server-only";
import { resolveCrmApiConfig, type CrmApiConfig, type CrmApiTarget } from "@/lib/crm-api/config";

// The ONLY place the website's CRM credentials are read from the environment. "server-only" makes the build fail if a client component ever
// imports this module (directly or through another module), so CRM_API_KEY / LEAD_INGEST_SECRET cannot reach browser JavaScript.
//
// A missing or malformed setting is not an exception: it comes back as a value the action turns into the visitor's friendly error, and it is
// logged ONCE per process as variable names and rules only (never a value) so the operator can fix .env. The website has no other way to
// store a submission - there is deliberately no database fallback.

const reported = new Set<string>();

function report(scope: string, messages: string[], level: "error" | "warn"): void {
  for (const message of messages) {
    const key = `${scope}|${message}`;
    if (reported.has(key)) continue;
    reported.add(key);
    (level === "error" ? console.error : console.warn)(`[crm-api] ${scope}: ${message}`);
  }
}

export function crmApiConfig(target: CrmApiTarget, scope: string): { ok: true; config: CrmApiConfig } | { ok: false } {
  const resolved = resolveCrmApiConfig(process.env, target);
  if (!resolved.ok) {
    report(scope, resolved.problems, "error");
    return { ok: false };
  }
  report(scope, resolved.warnings, "warn");
  return { ok: true, config: resolved.config };
}
