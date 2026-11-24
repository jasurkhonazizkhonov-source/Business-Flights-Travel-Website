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

**Back out at any time** without touching Cloudflare: `EDGE_PROOF_MODE=observe` (nothing refused) or empty `EDGE_PROOF_SECRET` (feature off), redeploy.

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
