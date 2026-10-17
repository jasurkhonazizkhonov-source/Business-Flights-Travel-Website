#!/usr/bin/env bash
# Build and (re)start ONLY the website service. Usage:   deploy/deploy.sh            (builds the checked-out commit)
# Run deploy/preflight.sh first and take the backups listed in docs/DEPLOYMENT_VPS.md. This script never touches PostgreSQL, the CRM
# or the tunnel, and never runs a database migration.
. "$(dirname "$0")/common.sh"

"${DEPLOY_DIR}/preflight.sh"

SHA="$(git -C "${ROOT}" rev-parse --short HEAD)"
[ -z "$(git -C "${ROOT}" status --porcelain)" ] || die "the working tree has uncommitted changes; deploy a clean, reviewed commit"
say "Deploying commit ${SHA}"

# Baseline of everything else on the shared network (CRM app, PostgreSQL, tunnel connector), compared again at the end.
BEFORE="$(others_fingerprint)"
printf '%s\n' "${BEFORE}" | sed 's/^/  before: /' | cut -c1-110

# Remember what is running now so rollback.sh can return to it.
# Only a HEALTHY running container becomes the rollback target. Otherwise a second attempt after a failed deploy would overwrite
# :previous with the broken image and "rollback.sh previous" would return to it.
if docker inspect "${CONTAINER}" >/dev/null 2>&1; then
  prev="$(docker inspect -f '{{.Config.Image}}' "${CONTAINER}")"
  running_health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "${CONTAINER}" 2>/dev/null || echo unknown)"
  if [ "${running_health}" = "healthy" ]; then
    docker tag "${prev}" business-flights-web:previous 2>/dev/null && ok "previous image kept as business-flights-web:previous (${prev})"
  else
    warn "the running website container is '${running_health}', not healthy: business-flights-web:previous was NOT updated (it still points at the last known-good image, if any)"
  fi
fi

say "Building image (no secrets are used or baked in)"
APP_VERSION="${SHA}" compose build "${SERVICE}"

say "Starting the website container only"
APP_VERSION="${SHA}" compose up -d --no-deps "${SERVICE}"

say "Waiting for the health check"
status="starting"
for i in $(seq 1 30); do
  status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "${CONTAINER}" 2>/dev/null || echo missing)"
  [ "${status}" = "healthy" ] && break
  [ "${status}" = "unhealthy" ] && break
  sleep 5
done
if [ "${status}" != "healthy" ]; then
  docker logs --tail 60 "${CONTAINER}" 2>&1 | sed -E 's/(PASSWORD|SECRET|TOKEN)=[^ ]+/\1=<hidden>/g'
  die "container is '${status}'. Roll back with: deploy/rollback.sh previous"
fi
ok "container healthy"

"${DEPLOY_DIR}/verify.sh"

say "Nothing else on the shared network was touched"
[ "$(others_fingerprint)" = "${BEFORE}" ] || die "a container other than the website changed (id or start time) during the deploy - investigate before continuing"
ok "the CRM, PostgreSQL and tunnel containers have the same ids and start times as before"
say "Deployed ${SHA}. Public routing (DNS / tunnel routes) is the owner's step: see docs/DEPLOYMENT_VPS.md"
