#!/usr/bin/env bash
# ISOLATED Docker rehearsal of the website release candidate (project `bft-rehearsal`). Builds the image, starts a mock CRM, a throwaway PostgreSQL and a
# tunnel stand-in on throwaway networks, runs the checks below, and tears everything down. It touches NO production network, container, image or file.
#
#   bash deploy/rehearsal/run.sh            # needs Docker + the compose plugin; at least ~3 GB free memory for the image build
#   KEEP=1 bash deploy/rehearsal/run.sh     # leave the rehearsal running for inspection (remove with: docker compose -p bft-rehearsal -f deploy/rehearsal/compose.rehearsal.yaml down -v)
#
# STATUS: written and statically reviewed; it has NOT been run (Docker is not installed on the machine this was prepared on). Do not count it as passed
# until it has run and printed "ALL CHECKS PASSED".
set -u
cd "$(dirname "$0")/../.." || exit 1
F=deploy/rehearsal/compose.rehearsal.yaml
C="docker compose -p bft-rehearsal -f $F"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  PASS: $*"; }
bad()  { FAIL=$((FAIL+1)); echo "  FAIL: $*"; }
check() { local name="$1"; shift; if "$@" >/dev/null 2>&1; then ok "$name"; else bad "$name"; fi; }
web()   { $C exec -T bft-web "$@"; }
probe() { $C exec -T tunnel-probe "$@"; }
cid()   { $C ps -q "$1"; }

command -v docker >/dev/null || { echo "docker is not installed: nothing was run"; exit 2; }
docker compose version >/dev/null 2>&1 || { echo "the docker compose plugin is missing: nothing was run"; exit 2; }
cleanup() { [ "${KEEP:-}" = "1" ] || $C down -v --remove-orphans >/dev/null 2>&1; }
trap cleanup EXIT

echo "== 1. build and start"
$C build bft-web || { echo "IMAGE BUILD FAILED"; exit 1; }
ok "image build"
$C up -d || { echo "START FAILED"; exit 1; }
for i in $(seq 1 40); do [ "$(docker inspect -f '{{.State.Health.Status}}' "$(cid bft-web)" 2>/dev/null)" = "healthy" ] && break; sleep 3; done
check "container reports healthy (HEALTHCHECK -> /api/health)" test "$(docker inspect -f '{{.State.Health.Status}}' "$(cid bft-web)")" = "healthy"

echo "== 2. network: DNS, reachability, database isolation"
check "website resolves the CRM alias compass-crm" web node -e "require('dns').lookup('compass-crm',(e)=>process.exit(e?1:0))"
check "website reaches the mock CRM over HTTP (http://compass-crm:3000/api/health)" web node -e "fetch('http://compass-crm:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
$C exec -T compass-crm node -e "fetch('http://127.0.0.1:3000/db-check').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1 && ok "the CRM stand-in reaches PostgreSQL (db:5432)" || bad "the CRM stand-in reaches PostgreSQL (db:5432)"
web node -e "require('dns').lookup('db',(e)=>process.exit(e?0:1))" >/dev/null 2>&1 && ok "website CANNOT resolve the database name" || bad "website CAN resolve the database name"
web node -e "const s=require('net').connect({host:'db',port:5432,timeout:3000});s.on('connect',()=>process.exit(1));s.on('error',()=>process.exit(0));s.on('timeout',()=>process.exit(0))" >/dev/null 2>&1 && ok "website CANNOT connect to PostgreSQL (db:5432)" || bad "website can connect to PostgreSQL"
[ -z "$(web env | grep -E '^(DATABASE_|DIRECT_URL|POSTGRES)' )" ] && ok "website container holds no database variable" || bad "website container holds a database variable"
NETS="$(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$(cid bft-web)")"
case "$NETS" in *rh_data*) bad "website is attached to the data network ($NETS)";; *) ok "website networks: $NETS";; esac
case "$(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{if eq $k "bft-rehearsal_rh_tunnel"}}{{range $v.Aliases}}{{.}} {{end}}{{end}}{{end}}' "$(cid bft-web)")" in *bft-web*) ok "tunnel-network alias bft-web";; *) bad "tunnel-network alias bft-web missing";; esac
case "$(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{if eq $k "bft-rehearsal_rh_api"}}{{range $v.Aliases}}{{.}} {{end}}{{end}}{{end}}' "$(cid compass-crm)")" in *compass-crm*) ok "CRM alias compass-crm on the API network";; *) bad "CRM alias compass-crm missing";; esac

echo "== 3. tunnel origin and published ports"
check "tunnel stand-in reaches the Cloudflare Tunnel origin http://bft-web:3000" probe node -e "fetch('http://bft-web:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
[ -z "$(docker inspect -f '{{json .NetworkSettings.Ports}}' "$(cid bft-web)" | grep -E 'HostPort')" ] && ok "no host port published by the website" || bad "the website publishes a host port"

echo "== 4. runtime, filesystem, secrets"
check "runs as the unprivileged user (uid != 0)" test "$(web id -u | tr -d '\r')" != "0"
check "application files are not writable by the runtime user" sh -c "! $C exec -T bft-web sh -c 'touch /app/server.js'"
check "start command is the standalone server (node server.js)" test "$(docker inspect -f '{{json .Config.Cmd}}' "$(cid bft-web)")" = '["node","server.js"]'
check "runtime variables reached the process (CRM_API_URL set, value not printed)" web node -e "process.exit(process.env.CRM_API_URL?0:1)"
if docker history --no-trunc business-flights-web:rehearsal | grep -Eq 'rehearsal-(api-key|ingest-secret)|LEAD_INGEST_SECRET=|CRM_API_KEY='; then bad "a secret or secret variable appears in the image history"; else ok "no secret in the image history"; fi
if docker image inspect business-flights-web:rehearsal -f '{{json .Config.Env}}' | grep -Eq 'CRM_API_KEY|LEAD_INGEST_SECRET|GMAIL_APP_PASSWORD|DATABASE'; then bad "image environment carries a secret variable"; else ok "image environment carries no secret variable"; fi

echo "== 5. public routes and static assets (from the tunnel stand-in, i.e. through the intended origin)"
get() { probe node -e "fetch('http://bft-web:3000$1').then(r=>process.exit(r.status===$2?0:1)).catch(()=>process.exit(1))"; }
for r in "/ 200" "/flights 200" "/contact 200" "/about 200" "/privacy-policy 200" "/terms-of-service 200" "/cookie-policy 200" "/blog 200" "/destinations 200" "/robots.txt 200" "/sitemap.xml 200" "/manifest.webmanifest 200" "/icon-192.png 200" "/api/health 200" "/no-such-page-xyz 404"; do
  set -- $r; check "GET $1 -> $2" get "$1" "$2"
done
# The form-suggestion route: reachable through the origin, never cacheable, and (no trusted Cloudflare headers are sent by this probe) empty, not an error.
check "GET /api/visitor-hint -> 200, JSON, private no-store, no IP in the body" probe node -e "fetch('http://bft-web:3000/api/visitor-hint').then(async r=>{const t=await r.text();process.exit(r.status===200&&r.headers.get('cache-control')==='private, no-store'&&/^\{.*\}\$/.test(t)&&!/[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/.test(t)?0:1)}).catch(()=>process.exit(1))"
check "Permissions-Policy allows geolocation for the site itself only" probe node -e "fetch('http://bft-web:3000/flights').then(r=>{const p=r.headers.get('permissions-policy')||'';process.exit(p.includes('geolocation=(self)')&&p.includes('camera=()')?0:1)}).catch(()=>process.exit(1))"
ASSET="$(probe node -e "fetch('http://bft-web:3000/').then(r=>r.text()).then(h=>{const m=h.match(/\/_next\/static\/[^\"']+\.(js|css)/);process.stdout.write(m?m[0]:'')})" 2>/dev/null)"
[ -n "$ASSET" ] && check "static asset $ASSET" get "$ASSET" 200 || bad "no /_next/static asset found in the home page"

echo "== 6. website -> mock CRM with signing v2 (a real server action, then a replay)"
# The browser-less server-action call is covered by the Playwright suites against a stand-in CRM; here the question is only network + environment: a signed request
# from the website container must be ACCEPTED by the mock, and the same envelope replayed must be refused.
web node -e "
const {createHash,createHmac,randomBytes}=require('crypto');
const secret=process.env.LEAD_INGEST_SECRET, company=process.env.CRM_COMPANY_ID, path='/api/public/subscribe';
const body=JSON.stringify({companyId:company,email:'rehearsal@example.invalid',source:'rehearsal'});
const ctx=Buffer.from(JSON.stringify({v:2,ts:Math.floor(Date.now()/1000),nonce:randomBytes(16).toString('base64url')})).toString('base64url');
const p=JSON.parse(Buffer.from(ctx,'base64url').toString());
const f=['POST',path,company,String(p.ts),p.nonce,createHash('sha256').update(body).digest('hex'),ctx];
const sig=createHmac('sha256',secret).update('CT-WEBSITE-REQUEST-V2\n'+f.map(x=>Buffer.byteLength(x)+':'+x).join('\n')).digest('hex');
const h={'content-type':'application/json','x-ct-visitor-context':ctx,'x-ct-visitor-signature':sig};
(async()=>{const a=await fetch('http://compass-crm:3000'+path,{method:'POST',headers:h,body});const b=await fetch('http://compass-crm:3000'+path,{method:'POST',headers:h,body});
process.exit(a.status===200&&b.status===401?0:1)})().catch(()=>process.exit(1))" >/dev/null 2>&1 && ok "signed request accepted, the identical replay refused (401)" || bad "signed request / replay behaviour"

echo "== 7. restart, resources, graceful stop"
docker restart "$(cid bft-web)" >/dev/null 2>&1
for i in $(seq 1 40); do [ "$(docker inspect -f '{{.State.Health.Status}}' "$(cid bft-web)" 2>/dev/null)" = "healthy" ] && break; sleep 3; done
check "healthy again after a container restart" test "$(docker inspect -f '{{.State.Health.Status}}' "$(cid bft-web)")" = "healthy"
echo "  info: $(docker stats --no-stream --format 'memory {{.MemUsage}}  cpu {{.CPUPerc}}' "$(cid bft-web)")"
T0=$(date +%s); $C stop -t 20 bft-web >/dev/null 2>&1; T1=$(date +%s)
[ $((T1-T0)) -lt 20 ] && ok "graceful stop in $((T1-T0))s (SIGTERM handled, no SIGKILL)" || bad "stop took the full grace period"
$C start bft-web >/dev/null 2>&1

echo "== 8. rollback rehearsal (website service only; the CRM stand-in and the database must not be touched)"
docker tag business-flights-web:rehearsal business-flights-web:rehearsal-previous
CRM_STARTED="$(docker inspect -f '{{.State.StartedAt}}' "$(cid compass-crm)")"; DB_STARTED="$(docker inspect -f '{{.State.StartedAt}}' "$(cid db)")"
APP_IMAGE_BEFORE="$(docker inspect -f '{{.Image}}' "$(cid bft-web)")"
$C up -d --no-deps --force-recreate bft-web >/dev/null 2>&1
for i in $(seq 1 40); do [ "$(docker inspect -f '{{.State.Health.Status}}' "$(cid bft-web)" 2>/dev/null)" = "healthy" ] && break; sleep 3; done
check "website recreated alone and healthy" test "$(docker inspect -f '{{.State.Health.Status}}' "$(cid bft-web)")" = "healthy"
[ "$CRM_STARTED" = "$(docker inspect -f '{{.State.StartedAt}}' "$(cid compass-crm)")" ] && ok "CRM stand-in untouched (same StartedAt)" || bad "CRM stand-in was restarted"
[ "$DB_STARTED" = "$(docker inspect -f '{{.State.StartedAt}}' "$(cid db)")" ] && ok "database untouched (same StartedAt)" || bad "database was restarted"
echo "  info: image before $APP_IMAGE_BEFORE; previous image kept as business-flights-web:rehearsal-previous"

echo
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" = "0" ] && echo "ALL CHECKS PASSED" || { echo "SOME CHECKS FAILED"; exit 1; }
