# Edge proof: Cloudflare rule and coordinated activation (runbook)

**Status of this document:** prepared 2026-11-24. **Nothing in it has been applied.** No Cloudflare rule was created or changed, no secret was generated, rotated or stored, and no production environment variable was touched: none of the required access (a Cloudflare API token or dashboard, the VPS, the production `.env`) was available to this work, and each of those is a change that needs your explicit approval. What exists is the application side (merged in code, tested), the exact rule to create, a two-step activation that cannot lock visitors out, and a read-only verification script.

## 1. What the mechanism is (so nothing new has to be invented)

* `TRUSTED_PROXY=cloudflare` (fixed in `compose.yaml`) means the website believes Cloudflare's `CF-Connecting-IP`, `CF-IPCountry` and `CF-IPCity` headers because the origin is reachable only through the Cloudflare tunnel. That is a statement about the **network**: another container that can open `http://bft-web:3000` directly could send any value.
* `EDGE_PROOF_SECRET` (24+ characters, unset by default) adds a statement about the **request**: Cloudflare adds the request header **`x-bft-edge-proof`** carrying that secret, and the website then believes the Cloudflare headers only on a request that carries exactly that value (constant-time comparison; a repeated header, a wrong value, or a secret shorter than 24 characters all count as "not proven"). A caller that can reach the origin directly does not know the secret.
* **`EDGE_PROOF_MODE`** (new): `observe` = believe the headers exactly as before but count and log whether each request carries the proof; `enforce` (the default when a secret is set) = refuse to believe them without it. **This is what makes activation safe**: the rule is verified in `observe` first, where nothing can be refused.
* **`GET /api/edge-check`** (new, read-only): answers `{"edgeProof":"off|valid|missing|invalid"}` about the request that asked, revealing no secret, mode or address. `deploy/check-edge-proof.sh` uses it.
* What an unproven request gets in `enforce`: no trusted IP, no location, no country hint; it shares **one** rate-limit bucket with every other unproven request (a larger allowance than a single client, so a temporary loss of attribution slows the site down instead of locking it out); the CRM receives it as unattributed (and applies its own, database-backed, shared limit to that bucket).

## 2. The Cloudflare rule (exactly what to create)

Cloudflare documents the feature as a **Request Header Transform Rule** with the operation **Set static**: it "overrides the value of an existing header with the same name or adds a new header if it does not exist", so a visitor who sends their own `x-bft-edge-proof` is overwritten, never trusted ([create in the dashboard](https://developers.cloudflare.com/rules/transform/request-header-modification/create-dashboard/), [static-value example](https://developers.cloudflare.com/rules/transform/examples/add-request-header-static-value/), [API](https://developers.cloudflare.com/rules/transform/request-header-modification/create-api/)).

| Field | Value |
|---|---|
| Where | the zone that serves `businessflights.travel` > Rules > Transform Rules > **Modify Request Header** > Create rule |
| Rule name | `bft: edge proof for the origin` |
| Match (custom filter expression) | `(http.host eq "www.businessflights.travel") or (http.host eq "businessflights.travel")` |
| Action | **Set static** |
| Header name | `x-bft-edge-proof` |
| Value | the secret (the **same** value as `EDGE_PROOF_SECRET` in the website's `.env`; 24 characters or more) |
| Placement | any position; it only touches this one header |

Why it is scoped this way:

* **Only the intended site:** matching the hostnames keeps it off every other hostname in the zone. The rule changes only the request that Cloudflare sends **to the origin**; it never appears in a response, in HTML, in a JavaScript bundle or to a browser.
* **Visitors cannot forge it:** "Set static" overwrites a client-supplied value, and `deploy/check-edge-proof.sh` proves that on the live site (it sends a forged header of its own through Cloudflare and expects `valid`).
* **Normal and crawler traffic is unaffected:** the rule adds a header; it does not block, challenge or redirect anything, so Googlebot and every other legitimate client reach the site exactly as before. (The Docker health check and the tunnel health probes use the origin directly, not Cloudflare, and never need the header: `/api/health` does not read it.)
* **DNS and the tunnel are untouched.**
* **Who can see the value:** members of the Cloudflare account who can open the rule, and (if enabled) request-header logging such as Logpush. Do not enable header logging for this header. The website never logs it.

**If you apply it by API instead of the dashboard**, add the rule to the zone's existing `http_request_late_transform` entry-point ruleset; do **not** use a `PUT` to `.../rulesets/phases/http_request_late_transform/entrypoint` on a zone that already has transform rules, because that call **replaces every rule in the phase**. Shape of the rule (the value is a placeholder: take it from your secret store, never from a shell history):

```json
{
  "description": "bft: edge proof for the origin",
  "expression": "(http.host eq \"www.businessflights.travel\") or (http.host eq \"businessflights.travel\")",
  "action": "rewrite",
  "action_parameters": { "headers": { "x-bft-edge-proof": { "operation": "set", "value": "<the secret>" } } }
}
```

## 3. Choosing the secret

No secret was generated here. There is no existing one to reuse: the feature has never been enabled. Generate one **on your side**, at least 32 random characters, for example `openssl rand -base64 36`, put it in the password manager, and use that one value in the two places (the Cloudflare rule and the website `.env`). Never paste it into a chat, a ticket or a commit. Do not rotate or reuse an existing credential for this.

## 4. Activation: two steps, never a lock-out

**Step 0, before anything:** the website is deployed against a CRM that already has the date-flexibility change (`docs/DATE_FLEXIBILITY.md` section 5). That is unrelated to the edge proof but is the first thing to confirm.

**Step 1: observe.**

1. Create the Cloudflare rule (section 2). Nothing changes for visitors.
2. In the website's `.env` set `EDGE_PROOF_SECRET=<the same value>` and `EDGE_PROOF_MODE=observe`. `deploy/preflight.sh` checks the length and the mode word. Deploy as usual (a separately approved deployment).
3. In observe mode **nothing is refused**: forms, location hints and rate limits behave exactly as before. The website only counts and logs.

**Step 2: verify (read-only).**

1. `deploy/check-edge-proof.sh` (from anywhere): through Cloudflare it must report `valid`, and `valid` again with a forged `x-bft-edge-proof` header of its own. On the VPS add `--origin bft-web` to also check that a request straight at the container is `missing` and a wrong proof `invalid`.
2. `docker logs bft-web | grep '\[edge-proof\]'`: a line every five minutes of the form `mode=observe checks in the last 300s: valid=N missing=M invalid=K`. Ordinary visitor traffic must be all `valid`; `missing` or `invalid` above zero means some request path does not go through the rule (find it before enforcing; the check script's origin test will itself add one `missing`).
3. With your approval, one real test enquiry through the public site: the lead in the CRM must show the visitor IP and location (the proof is working end to end).

**Step 3: enforce.** Only when step 2 is clean for the traffic you care about: set `EDGE_PROOF_MODE=enforce` (or delete the line: enforce is the default) and redeploy. Re-run `deploy/check-edge-proof.sh`, and submit a test enquiry.

**Back out at any time** without touching Cloudflare: `EDGE_PROOF_MODE=observe` (nothing refused), or empty **both** `EDGE_PROOF_SECRET` and `EDGE_PROOF_MODE` (feature off), redeploy. Emptying only the secret while the mode still says `enforce` does **not** switch the feature off: since 2026-11-25 that combination believes no Cloudflare header at all (a missing or misspelt secret must not quietly disable the proof), and `deploy/preflight.sh` refuses it.

**Never** set the secret without the mode while the rule is absent or unverified: with no mode, a secret means `enforce`, and without the rule every visitor would be unproven (they would share one bucket and, after its allowance, be refused). `deploy/preflight.sh` refuses an unknown mode word, and a mode without a secret.

**Rotation** (only if the secret is ever exposed): switch to `observe`, change the value in Cloudflare and `.env` together, run the check script, switch back to `enforce`.

## 5. If the check fails

| Symptom | Meaning | Action |
|---|---|---|
| through Cloudflare: `missing` | the rule is not matching this hostname/request, or is not deployed | check the expression (apex and www), the rule is enabled, and the request really goes through the zone (not a different hostname) |
| through Cloudflare: `invalid` | the value in the rule differs from `EDGE_PROOF_SECRET` (a stray space, a different copy) | re-enter the same value in both places |
| forged header through Cloudflare: not `valid` | the rule does not overwrite (it was created as "Add" or another operation) | use **Set static** |
| through Cloudflare: `off` | the website has no secret, or `TRUSTED_PROXY` is not `cloudflare` | check `.env` and that the new container is the one serving |
| straight at the container: `valid` | something adds the proof on the internal path | stop: the proof would then prove nothing |

## 6. What this does not protect

It does not replace network isolation: the best defence in depth is that no other container is on the tunnel network (`compass-tools_web`). It protects only the trust placed in Cloudflare's headers; it does not authenticate visitors, stop distributed abuse from real addresses, or hide anything from someone who can read the Cloudflare rule or the origin's environment. Tested on real servers in `tests/edge-proof.spec.ts` (including the verification script against a stand-in edge that overwrites a forged header) and `tests/rate-limit-topology.spec.ts`.

## 7. Optional, separate from the proof: block `TRACE` at the edge

The application refuses every method except GET, HEAD and POST on pages (and never echoes a request), but the framework answers `TRACE` with a generic HTTP 500 because it cannot build a request object for that method. It leaks nothing; it only adds a 500 per probe to the logs. If you want it stopped before it reaches the container, add a Cloudflare WAF custom rule (Security > WAF > Custom rules): expression `http.request.method eq "TRACE"`, action Block. This is independent of the edge-proof rule and of its activation, and it has not been created or tested against the real zone.

## 8. Design review (2026-11-24): what the proof is, and what it is not

Written from the code (`src/lib/client-ip.ts`, `src/app/api/edge-check/route.ts`, `deploy/check-edge-proof.sh`) and the tests, not from the Cloudflare dashboard (no access).

| Question | Answer |
|---|---|
| What is it? | A **static shared secret** that a Cloudflare Request Header Transform Rule sets, as `x-bft-edge-proof`, on every request it forwards (overwriting anything the client sent). It is **not** a signature. Cloudflare Transform Rules cannot compute a per-request HMAC, so a signed, expiring proof is not possible at this layer. |
| Compared how? | SHA-256 of both values, then `timingSafeEqual` (constant time, no length leak). Minimum 24 characters, otherwise the state is `invalid` and nothing is believed (fails closed). Never logged, never returned (`/api/edge-check` returns only `valid`, `missing`, `invalid` or `off`). |
| Signature, expiry, replay protection? | **None, by design.** The value does not change per request, has no timestamp and can be replayed by anyone who knows it. That is acceptable only because it is a *path* credential (it proves "this request came through the edge that holds the secret"), not a *request* credential. |
| Tied to the request or the security context? | No: not to the URL, body, client or time. |
| What if it leaks? | Anyone who can reach the origin directly **and** knows the value can forge `CF-Connecting-IP`, country and city. The origin is not reachable that way in the intended deployment (no published port, only the Cloudflare Tunnel network; `deploy/preflight.sh` refuses a published port), so the proof is **defence in depth behind network isolation**, not a replacement. Rotation: put the new value in the Cloudflare rule and `.env` together (observe mode makes a mismatch visible without refusing anything), restart the container. |
| Can the app tell Cloudflare from a direct request? | **Only with the proof.** Without it the app can see headers but not who set them; `TRUSTED_PROXY=cloudflare` alone trusts the network. That is the gap the proof closes. A stronger alternative if the origin were ever internet-reachable: Cloudflare Access service tokens or a Worker that signs per request; neither is needed while the tunnel is the only path. |
| Missing or invalid proof, `observe` | Nothing changes for the request: its Cloudflare headers are believed as before; the check is counted (`valid`/`missing`/`invalid`) and a value-free summary line is logged every five minutes. |
| Missing or invalid proof, `enforce` (the default for an empty `EDGE_PROOF_MODE`) | Its Cloudflare headers are **not** believed: no trusted IP, no location. Visitors then share the "unresolved client" rate-limit bucket (5x allowance) and the CRM receives no visitor IP for the lead. Forms keep working. |
| No `EDGE_PROOF_SECRET`, mode empty or `observe` | The feature is off; behaviour is as before it existed. |
| No `EDGE_PROOF_SECRET`, mode `enforce` (or any other word) | Misconfiguration, fails closed (since 2026-11-25): no Cloudflare header is believed, `/api/edge-check` answers `invalid`, the `[edge-proof]` log counts it. `deploy/preflight.sh` refuses it before a deploy. |
| Can a lock-out still happen by omission? | Not any more: `deploy/preflight.sh` now **refuses a secret without an explicit `EDGE_PROOF_MODE`** (an empty mode means enforce). Write `observe` first. |

Evidence required before recommending `enforce` (all must hold): `deploy/check-edge-proof.sh` against the public URL prints PASS for "nothing special sent" and "forged header is overwritten" **and** (with `--origin bft-web` on the VPS) PASS for "straight at the container: missing" and "wrong proof: invalid"; the `[edge-proof]` log shows `missing=0 invalid=0` over at least one full day of real traffic; a real test submission shows the visitor IP in the CRM lead. **Rollback**: set `EDGE_PROOF_MODE=observe` (or remove both variables) and restart `bft-web`; nothing else changes. **Status today: no Cloudflare rule exists, nothing is activated, and nothing in this review changed Cloudflare.**

The exact rule (Cloudflare dashboard, Rules > Transform Rules > Modify Request Header > Create rule): *When incoming requests match* "All incoming requests" for the hostname `www.businessflights.travel` (and the apex if it also serves traffic) > *Then* **Set static** header name `x-bft-edge-proof`, value = the secret. Place it so no earlier rule short-circuits it; "Set static" overwrites a client-supplied value, which the verification script checks.

## 9. Which path reaches the origin, and what the proof adds (from the repository files, 2026-11-25)

```
Visitor --HTTPS--> Cloudflare edge --Cloudflare Tunnel (outbound connection from the VPS)--> cloudflared (CRM compose project)
        --http://bft-web:3000 on the shared tunnel network--> website container
Website container --http://compass-crm:3000 on the internal website-API network--> CRM
```

| Question | Answer from the files | Verified on the live system? |
|---|---|---|
| Is a port published on the host? | No: `compose.yaml` has no `ports:`; `deploy/preflight.sh` and `deploy/verify.sh` refuse one | **No** |
| Who can open the origin directly? | Only a container on the `tunnel` network (the connector and, in the release layout, the CRM app), a container on the website-API network, or someone with Docker or root access on the VPS | **No** |
| What protects the origin? | Network isolation (no published port, tunnel only) | **No** |
| What does the proof add? | It stops a container on those networks from inventing a visitor IP or location | not activated |
| What does it **not** protect? | It blocks no request. Pages and forms stay reachable to any caller that reaches the origin; an unproven request only loses attribution and shares one rate-limit bucket | |
| Health checks and internal traffic | The Docker health check calls `/api/health`, which reads no visitor header: unaffected in every mode. The website's calls to the CRM do not pass through Cloudflare and do not carry the proof; they are authenticated by the API key and the request signature | tested locally |
| Is the rule, tunnel route or DNS record in place? | No rule is confirmed to exist. DNS, tunnel routes and zone settings have not been read from the dashboard | **No** |

**Is the static secret sufficient?** For this architecture, yes as defence in depth, **provided** the two isolation facts in the first two rows are confirmed on the VPS (`deploy/preflight.sh`, then `ss -ltn` and `docker ps` showing no published website port). If the origin were ever reachable from the internet, the isolation must be restored; a stronger proof at the application would not by itself make a published origin safe.

## 10. Staging activation checklist (ten checks)

No staging environment was available to this work: the local equivalents below ran against real production-build servers with a stand-in edge, **not** against Cloudflare or a VPS. Repeat each on staging before production.

| # | Check | Local test (`tests/edge-proof.spec.ts`, `tests/rate-limit-topology.spec.ts`) | On staging / production |
|---|---|---|---|
| 1 | Edge traffic with a valid proof is attributed | yes (stand-in edge) | `deploy/check-edge-proof.sh` prints `valid` |
| 2 | Missing proof | yes | `--origin bft-web`: `missing` |
| 3 | Invalid proof | yes | `--origin bft-web`: `invalid` |
| 4 | Direct-origin bypass with forged visitor headers is not believed (enforce) | yes | from another container on the tunnel network |
| 5 | Legitimate pages and form submissions work in observe and enforce | yes (stand-in CRM) | one approved test submission per form |
| 6 | API routes (`/api/visitor-hint`, `/api/edge-check`) | yes | same requests through the edge |
| 7 | Health checks | yes | container stays healthy after the switch |
| 8 | Website-to-CRM traffic | signed requests, stand-in CRM | the CRM receives the lead with the visitor IP |
| 9 | Unexpected proxy behaviour: repeated header, appended value, forged `X-Forwarded-For` | yes | the forged-header line of the check script |
| 10 | Rollback to observe, and to off | yes (mode and configuration tests) | switch, redeploy, re-run the script |

