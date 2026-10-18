#!/usr/bin/env bash
# READ-ONLY preflight. Changes nothing. Run before every deploy:   deploy/preflight.sh
# Exits non-zero if the host is not ready; the messages say exactly what to fix.
. "$(dirname "$0")/common.sh"

say "Docker"
command -v docker >/dev/null || die "docker is not installed or not on PATH"
docker compose version >/dev/null 2>&1 || die "the docker compose plugin is not available"
ok "docker $(docker --version | cut -d' ' -f3 | tr -d ,)"

say "Environment file"
[ -f "${ROOT}/.env" ] || die ".env is missing next to compose.yaml (copy .env.vps.example and fill it in; chmod 600)"
perm="$(stat -c '%a' "${ROOT}/.env" 2>/dev/null || echo unknown)"
[ "${perm}" = "600" ] || warn ".env permissions are ${perm}; run: chmod 600 .env"
for key in CRM_API_KEY CRM_COMPANY_ID GMAIL_SENDER_EMAIL GMAIL_APP_PASSWORD; do
  [ -n "$(env_value "${key}")" ] || die "${key} is not set in .env"
done
ok "required variables are present (values not shown)"
[ "$(env_value CRM_API_KEY | wc -c)" -gt 32 ] || die "CRM_API_KEY is shorter than 32 characters (the CRM treats a shorter key as 'not configured')"
ok "CRM_API_KEY has at least 32 characters"
ingest="$(env_value LEAD_INGEST_SECRET)"
if [ -z "${ingest}" ]; then
  warn "LEAD_INGEST_SECRET is not set: leads are created WITHOUT the visitor's IP and approximate location (set it, identical to the CRM's, to record them)"
elif [ "$(printf '%s' "${ingest}" | wc -c)" -lt 32 ]; then
  die "LEAD_INGEST_SECRET is shorter than 32 characters"
else
  ok "LEAD_INGEST_SECRET is set (visitor IP / location will be sent, signed)"
fi
case "$(env_or_default CRM_API_URL http://compass-crm:3000)" in
  http://*|https://*) ok "CRM_API_URL is an http(s) URL" ;;
  *) die "CRM_API_URL must start with http:// or https:// (default http://compass-crm:3000)" ;;
esac

say "The website must have NO database configuration"
# The architecture is website -> authenticated CRM API -> CRM database. Database credentials in the website's .env would be unused AND a risk.
for key in DATABASE_URL DIRECT_URL DATABASE_SSL_MODE DATABASE_SSL_CA DATABASE_SSL_VERIFY DATABASE_AUTO_INIT; do
  [ -z "$(env_value "${key}")" ] || die "${key} is set in .env. The website does not use a database: remove it (and never give the website the CRM database's credentials)."
done
ok "no database variables in .env"

say "Rendered compose configuration"
compose config -q || die "compose configuration is invalid"
if compose config | grep -qE '^\s+(ports|published):'; then die "the rendered configuration publishes a host port - it must not"; fi
ok "valid; no published host ports"
compose config --services | grep -qx "${SERVICE}" || die "service '${SERVICE}' not found"
[ "$(compose config --services | wc -l)" = "1" ] || die "this project must define exactly one service"
ok "exactly one service: ${SERVICE}"

say "External networks (compose never creates them)"
API_NET="$(crm_api_network)"; TUN_NET="$(tunnel_network)"
docker network inspect "${API_NET}" >/dev/null 2>&1 || die "network '${API_NET}' does not exist. It is created by the CRM's own compose project (network 'compass-tools-website-api'); start the CRM first, or read the real name with: docker network ls   (then set CRM_API_NETWORK_NAME in .env)"
ok "CRM API network '${API_NET}' exists"
docker network inspect "${TUN_NET}" >/dev/null 2>&1 || die "network '${TUN_NET}' does not exist. It must be the network the Cloudflare Tunnel connector is on. Read the real name with: docker network ls   (then set TUNNEL_NETWORK_NAME in .env)"
ok "tunnel network '${TUN_NET}' exists"

# Aliases a container answers to on a network (docker inspect, read-only).
aliases_of() { docker inspect -f "{{range \$k,\$v := .NetworkSettings.Networks}}{{if eq \$k \"$2\"}}{{range \$v.Aliases}}{{.}} {{end}}{{end}}{{end}}" "$1"; }

say "The CRM API is reachable by the name 'compass-crm', the database is NOT reachable, and no name collides"
crm=""; dbfound=""; clash=""
for NET in "${API_NET}" "${TUN_NET}"; do
  for c in $(docker network inspect "${NET}" -f '{{range .Containers}}{{.Name}} {{end}}'); do
    a=" $(aliases_of "${c}" "${NET}") "
    if [ "${NET}" = "${API_NET}" ]; then case "${a}" in *" compass-crm "*) crm="${c}";; esac; fi
    # The website has no database and must have no network path to one: a container answering to 'db' on either network is a layout error.
    case "${a}" in *" db "*) dbfound="${dbfound} ${c}@${NET}";; esac
    # Docker DNS answers a name from every container that carries it. Another container (not ours) already called bft-web would make the
    # tunnel and the website's own health traffic land on the wrong place.
    if [ "${c}" != "${CONTAINER}" ]; then case "${a}" in *" bft-web "*) clash="${clash} ${c}";; esac; fi
  done
done
[ -n "${crm}" ] || die "no container on '${API_NET}' answers to 'compass-crm'. The CRM must be up with its website API network, and CRM_API_URL must use that name (default http://compass-crm:3000)."
ok "container '${crm}' answers to 'compass-crm' on '${API_NET}'"
[ -z "${dbfound}" ] || die "a container answering to 'db' shares a network with the website:${dbfound}. The website must not have any route to the database. Use the CRM's separate tunnel network (TUNNEL_NETWORK_NAME), not one that carries PostgreSQL."
ok "no database container on either network"
[ -z "${clash}" ] || die "another container already answers to 'bft-web':${clash}. Resolve this before deploying."
ok "no other container answers to 'bft-web'"

say "Tunnel connector (informational - the owner adds the routes in the Cloudflare dashboard; see the guide)"
if docker network inspect "${TUN_NET}" -f '{{range .Containers}}{{.Name}} {{end}}' | grep -qi cloudflared; then
  ok "a cloudflared container is attached to '${TUN_NET}'"
else
  warn "no cloudflared container is attached to '${TUN_NET}' - the tunnel could not reach http://bft-web:3000 from there"
fi

say "Host resources"
df -h "${ROOT}" | tail -n1 | awk '{printf "  disk free: %s of %s (%s used)\n", $4, $2, $5}'
free -m | awk '/^Mem:/ {printf "  memory: %s MB free of %s MB\n", $7, $2}'

say "Existing website container (if any)"
if docker inspect "${CONTAINER}" >/dev/null 2>&1; then
  ok "running image: $(docker inspect -f '{{.Config.Image}}' "${CONTAINER}")  health: $(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}n/a{{end}}' "${CONTAINER}")"
else
  ok "none yet (first deploy)"
fi
say "Preflight passed"
