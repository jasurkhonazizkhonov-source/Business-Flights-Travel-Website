#!/usr/bin/env bash
# Read-only verification of the Cloudflare edge-proof rule (docs/EDGE_PROOF_ACTIVATION_RUNBOOK.md). It sends a few GET requests to /api/edge-check, which answers with
# the state of the request that asked: off | valid | missing | invalid. It never prints, sends or needs the secret, changes nothing, and is safe to run in production.
#
#   deploy/check-edge-proof.sh [PUBLIC_URL] [--origin CONTAINER]
#     PUBLIC_URL        default https://www.businessflights.travel
#     --origin NAME     also ask the container NAME directly (what another container on the Docker network could do), via `docker exec`
#
# Expected once the Cloudflare rule is in place (observe OR enforce mode):
#   through Cloudflare              valid     the rule adds the proof
#   through Cloudflare, with a forged x-bft-edge-proof header of our own      valid   the rule OVERWRITES a client-supplied value
#   straight at the container       missing   nothing adds it
#   straight at the container, with a wrong proof                              invalid
# Exit status 0 only when every expectation holds.
set -uo pipefail

PUBLIC="https://www.businessflights.travel"
ORIGIN=""
while [ $# -gt 0 ]; do
  case "$1" in
    --origin) ORIGIN="${2:-}"; shift 2 ;;
    http://*|https://*) PUBLIC="${1%/}"; shift ;;
    *) echo "usage: $0 [PUBLIC_URL] [--origin CONTAINER]" >&2; exit 2 ;;
  esac
done

fail=0
say() { printf '%s\n' "$*"; }
expect() { # description expected actual
  if [ "$3" = "$2" ]; then say "PASS  $1 -> $3"; else say "FAIL  $1 -> '$3' (expected '$2')"; fail=1; fi
}
state_of() { sed -n 's/.*"edgeProof"[[:space:]]*:[[:space:]]*"\([a-z]*\)".*/\1/p' | head -n1; }

say "Edge-proof check against ${PUBLIC}"
pub="$(curl -fsS --max-time 20 "${PUBLIC}/api/edge-check" 2>/dev/null | state_of)"
expect "through Cloudflare, nothing special sent" valid "${pub:-unreachable}"
forged="$(curl -fsS --max-time 20 -H 'x-bft-edge-proof: forged-by-the-visitor' "${PUBLIC}/api/edge-check" 2>/dev/null | state_of)"
expect "through Cloudflare, with a forged x-bft-edge-proof header (the rule must overwrite it)" valid "${forged:-unreachable}"

if [ -n "${ORIGIN}" ]; then
  direct="$(docker exec "${ORIGIN}" node -e 'fetch("http://127.0.0.1:3000/api/edge-check").then(r=>r.text()).then(t=>process.stdout.write(t))' 2>/dev/null | state_of)"
  expect "straight at the container (no proof)" missing "${direct:-unreachable}"
  wrong="$(docker exec "${ORIGIN}" node -e 'fetch("http://127.0.0.1:3000/api/edge-check",{headers:{"x-bft-edge-proof":"not-the-secret"}}).then(r=>r.text()).then(t=>process.stdout.write(t))' 2>/dev/null | state_of)"
  expect "straight at the container (a wrong proof)" invalid "${wrong:-unreachable}"
else
  say "NOTE  the origin-side checks were skipped (add --origin <container> on the VPS to run them)"
fi

if [ "$fail" -eq 0 ]; then say "RESULT  the edge proof behaves as designed"; else say "RESULT  NOT as designed: do not switch to enforce (see the runbook, section 5)"; fi
exit "$fail"
