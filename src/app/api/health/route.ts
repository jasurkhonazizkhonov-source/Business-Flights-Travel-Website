// Liveness probe for the container health check (docker HEALTHCHECK / compose) and the deployment runbook's verify step.
//
// Deliberately NOT a check of the Compass Tools CRM: if the CRM is briefly unavailable the website must keep serving its (static) pages and
// must not be restarted in a loop by its own health check — a form submission already reports a CRM problem to the visitor safely. It exposes nothing about the environment: no version, no host names, no configuration.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { status: "ok" },
    // Not cached anywhere, and never an indexable page.
    { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } },
  );
}
