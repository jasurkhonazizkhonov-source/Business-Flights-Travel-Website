#!/usr/bin/env bash
# Shared helpers for the website's deployment scripts. Sourced, never run directly.
# Everything here is scoped to ONE compose project (business-flights-travel) and ONE service (web). Nothing in deploy/ touches the
# Compass Tools project, PostgreSQL or the tunnel connector, and nothing uses `down -v`, `prune` or volume commands.
set -euo pipefail

PROJECT="business-flights-travel"
SERVICE="web"
CONTAINER="${PROJECT}-${SERVICE}-1"
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${DEPLOY_DIR}/.." && pwd)"
cd "${ROOT}"

compose() { docker compose -p "${PROJECT}" -f "${ROOT}/compose.yaml" "$@"; }

say()  { printf '\n== %s\n' "$*"; }
ok()   { printf '  ok:   %s\n' "$*"; }
warn() { printf '  WARN: %s\n' "$*" >&2; }
die()  { printf '  FAIL: %s\n' "$*" >&2; exit 1; }

# Value of KEY from .env WITHOUT printing it anywhere or sourcing the file (it may contain characters the shell would interpret).
env_value() { grep -E "^$1=" "${ROOT}/.env" 2>/dev/null | head -n1 | cut -d= -f2- || true; }
env_or_default() { local v; v="$(env_value "$1")"; printf '%s' "${v:-$2}"; }
