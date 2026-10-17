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
for key in DATABASE_URL GMAIL_SENDER_EMAIL GMAIL_APP_PASSWORD; do
  [ -n "$(env_value "${key}")" ] || die "${key} is not set in .env"
done
ok "required variables are present (values not shown)"

say "Database TLS is an explicit decision (preferred: verified)"
tls_ca="$(env_value DATABASE_SSL_CA)"; tls_verify="$(env_value DATABASE_SSL_VERIFY)"; tls_mode="$(env_value DATABASE_SSL_MODE)"
if [ -n "${tls_mode}" ] && { [ -n "${tls_ca}" ] || [ -n "${tls_verify}" ]; }; then
  die "DATABASE_SSL_MODE conflicts with DATABASE_SSL_CA / DATABASE_SSL_VERIFY in .env (the application would refuse to start). Keep one."
elif [ -n "${tls_ca}" ] || [ -n "${tls_verify}" ]; then
  ok "verified TLS is configured (certificate and host name are checked)"
elif [ "${tls_mode}" = "disable" ]; then
  warn "DATABASE_SSL_MODE=disable: PLAINTEXT to the database. Acceptable only as a recorded owner exception for the private Docker network (docs/DEPLOYMENT_VPS.md, 7.3)."
elif [ -n "${tls_mode}" ]; then
  die "DATABASE_SSL_MODE must be exactly 'disable' or unset (got a different value)."
else
  die ".env makes no database TLS decision. Set DATABASE_SSL_CA (preferred) or DATABASE_SSL_VERIFY=system, or - as a recorded exception - DATABASE_SSL_MODE=disable. An unset value would mean 'encrypted but the server is not verified'."
fi

say "Rendered compose configuration"
compose config -q || die "compose configuration is invalid"
if compose config | grep -qE '^\s+(ports|published):'; then die "the rendered configuration publishes a host port - it must not"; fi
ok "valid; no published host ports"
compose config --services | grep -qx "${SERVICE}" || die "service '${SERVICE}' not found"
[ "$(compose config --services | wc -l)" = "1" ] || die "this project must define exactly one service"
ok "exactly one service: ${SERVICE}"

say "External network (compose never creates it)"
NET="$(env_or_default CRM_NETWORK_NAME compass-tools_internal)"
docker network inspect "${NET}" >/dev/null 2>&1 || die "network '${NET}' does not exist. Read the CRM's real network name with: docker network ls   (then set CRM_NETWORK_NAME in .env)"
ok "CRM network '${NET}' exists"

# Aliases a container answers to on ${NET} (docker inspect, read-only).
aliases_of() { docker inspect -f "{{range \$k,\$v := .NetworkSettings.Networks}}{{if eq \$k \"${NET}\"}}{{range \$v.Aliases}}{{.}} {{end}}{{end}}{{end}}" "$1"; }

say "The CRM database is reachable by the name 'db' on '${NET}', and no name collides"
found=""; clash=""
for c in $(docker network inspect "${NET}" -f '{{range .Containers}}{{.Name}} {{end}}'); do
  a=" $(aliases_of "${c}") "
  case "${a}" in *" db "*) found="${c}";; esac
  # Docker DNS answers a name from every container that carries it. Another container (not ours) already called bft-web would
  # make the tunnel and the website's own health traffic land on the wrong place.
  if [ "${c}" != "${CONTAINER}" ]; then case "${a}" in *" bft-web "*) clash="${clash} ${c}";; esac; fi
done
[ -n "${found}" ] || die "no container on '${NET}' has the network alias 'db'. The website's DATABASE_URL host must be exactly 'db'."
ok "container '${found}' answers to 'db'"
[ -z "${clash}" ] || die "another container on '${NET}' already answers to 'bft-web':${clash}. Resolve this before deploying."
ok "no other container answers to 'bft-web'"
if docker port "${found}" 2>/dev/null | grep -q .; then warn "'${found}' publishes a host port - PostgreSQL must never be published"; else ok "PostgreSQL publishes no host port"; fi

say "Tunnel connector (informational - the owner adds the routes in the Cloudflare dashboard; see the guide)"
if docker network inspect "${NET}" -f '{{range .Containers}}{{.Name}} {{end}}' | grep -qi cloudflared; then
  ok "a cloudflared container is attached to '${NET}'"
else
  warn "no cloudflared container is attached to '${NET}' - the tunnel could not reach http://bft-web:3000 from there"
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
