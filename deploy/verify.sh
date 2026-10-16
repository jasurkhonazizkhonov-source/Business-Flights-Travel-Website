#!/usr/bin/env bash
# Verifies the RUNNING website container from the inside (no public DNS needed). Read-only. Usage:   deploy/verify.sh
. "$(dirname "$0")/common.sh"

say "Container"
docker inspect "${CONTAINER}" >/dev/null 2>&1 || die "container ${CONTAINER} does not exist"
[ "$(docker inspect -f '{{.State.Running}}' "${CONTAINER}")" = "true" ] || die "container is not running"
ok "running; restart policy: $(docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' "${CONTAINER}")"
[ "$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "${CONTAINER}")" = "healthy" ] || die "health check is not 'healthy'"
ok "health check healthy"

say "No published ports; non-root"
if [ -n "$(docker port "${CONTAINER}" 2>/dev/null)" ]; then die "the container publishes a host port: $(docker port "${CONTAINER}")"; fi
ok "no host ports published"
[ "$(docker exec "${CONTAINER}" id -u)" != "0" ] || die "the container runs as root"
ok "runs as uid $(docker exec "${CONTAINER}" id -u)"

say "Responses (from inside the container, loopback)"
docker exec "${CONTAINER}" node -e "$(cat "${DEPLOY_DIR}/verify-responses.mjs")" || die "one or more responses were wrong"
say "Verification passed"
