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

say "Rendered compose configuration"
compose config -q || die "compose configuration is invalid"
if compose config | grep -qE '^\s+(ports|published):'; then die "the rendered configuration publishes a host port - it must not"; fi
ok "valid; no published host ports"
compose config --services | grep -qx "${SERVICE}" || die "service '${SERVICE}' not found"
[ "$(compose config --services | wc -l)" = "1" ] || die "this project must define exactly one service"
ok "exactly one service: ${SERVICE}"

say "External networks (compose never creates these)"
EDGE="$(env_or_default EDGE_NETWORK_NAME bft-edge)"
DATA="$(env_or_default CRM_DATA_NETWORK_NAME compass-tools_data)"
docker network inspect "${EDGE}" >/dev/null 2>&1 || die "network '${EDGE}' does not exist. Create it once: docker network create ${EDGE}   (see docs/DEPLOYMENT_VPS.md, 'Networking')"
ok "edge network '${EDGE}' exists"
docker network inspect "${DATA}" >/dev/null 2>&1 || die "network '${DATA}' does not exist. Read the CRM's real network names with: docker network ls"
ok "CRM data network '${DATA}' exists"

say "The CRM database is reachable by the name 'db' on '${DATA}'"
found=""
for c in $(docker network inspect "${DATA}" -f '{{range .Containers}}{{.Name}} {{end}}'); do
  aliases="$(docker inspect -f "{{range \$k,\$v := .NetworkSettings.Networks}}{{if eq \$k \"${DATA}\"}}{{range \$v.Aliases}}{{.}} {{end}}{{end}}{{end}}" "${c}")"
  case " ${aliases} " in *" db "*) found="${c}";; esac
done
[ -n "${found}" ] || die "no container on '${DATA}' has the network alias 'db'. The website's DATABASE_URL host must be exactly 'db'."
ok "container '${found}' answers to 'db'"
if docker port "${found}" 2>/dev/null | grep -q .; then warn "'${found}' publishes a host port - PostgreSQL must never be published"; else ok "PostgreSQL publishes no host port"; fi

say "Tunnel connector (informational - the owner wires this up; see the guide)"
if docker network inspect "${EDGE}" -f '{{range .Containers}}{{.Name}} {{end}}' | grep -qi cloudflared; then
  ok "a cloudflared container is attached to '${EDGE}'"
else
  warn "no cloudflared container is attached to '${EDGE}' yet - the site will not be reachable until the owner attaches it and adds the tunnel routes"
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
