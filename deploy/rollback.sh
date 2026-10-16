#!/usr/bin/env bash
# Return the website service to a previous image. Usage:   deploy/rollback.sh previous      |      deploy/rollback.sh <git short sha>
# Only the website container is recreated. The database and uploads are not involved (this site stores no files).
. "$(dirname "$0")/common.sh"
target="${1:-previous}"
docker image inspect "business-flights-web:${target}" >/dev/null 2>&1 || die "no image business-flights-web:${target}. Available: $(docker image ls business-flights-web --format '{{.Tag}}' | tr '\n' ' ')"
BEFORE="$(others_fingerprint)"
say "Rolling back the website to business-flights-web:${target}"
APP_VERSION="${target}" compose up -d --no-deps --no-build "${SERVICE}"
status="starting"
for i in $(seq 1 30); do
  status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "${CONTAINER}" 2>/dev/null || echo missing)"
  [ "${status}" = "healthy" ] && break
  sleep 5
done
[ "${status}" = "healthy" ] || die "container is '${status}' after rollback; inspect: docker logs ${CONTAINER}"
ok "rolled back and healthy"
"${DEPLOY_DIR}/verify.sh"
[ "$(others_fingerprint)" = "${BEFORE}" ] || die "a container other than the website changed during the rollback - investigate"
ok "no other container on the shared network was touched"
