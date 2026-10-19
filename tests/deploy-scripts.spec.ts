import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { cpSync, chmodSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// Dry-run of deploy/*.sh with a STUB `docker` (no Docker, no network, no host state): the scripts run for real under bash, in a throwaway
// copy of the repository, and every docker command they issue is recorded. This proves the scripts' own logic — preflight refusals,
// the alias-collision check, "the website has no route to the database", "nothing else on the shared networks changed", rollback — and that
// they only ever issue the commands the runbook documents. It does NOT prove that Docker, Compose or the real images behave as the stub
// assumes: see docs/DEPLOYMENT_VPS.md.
const repo = path.resolve(__dirname, "..");
// bash: PATH first (Linux/macOS CI), then Git for Windows. WSL's launcher is not a usable bash for these scripts.
const BASH =
  ["bash", "C:/Program Files/Git/bin/bash.exe", "C:/Program Files/Git/usr/bin/bash.exe"].find((b) => spawnSync(b, ["-c", "exit 0"]).status === 0) ?? "";
const bashAvailable = BASH !== "";

const PROJECT = "business-flights-travel";
const SITE = `${PROJECT}-bft-web-1`;
const API_NET = "compass-tools-website-api";
const TUN_NET = "compass-tools_web";

type C = { id: string; startedAt: string; aliases: string[]; ports?: string; image?: string; health?: string; networks?: string[] };
interface State {
  networks: string[];
  containers: Record<string, C>;
  images: string[];
  rendered: string;
  crmRestartOnUp: boolean;
  healthAfterUp: string;
  verifyFails: boolean;
  buildFails: boolean;
}

const FAKE_DOCKER = String.raw`
const fs = require("fs");
const dir = __dirname;
const args = process.argv.slice(2);
fs.appendFileSync(dir + "/calls.log", JSON.stringify(args) + "\n");
const S = JSON.parse(fs.readFileSync(dir + "/state.json", "utf8"));
const save = () => fs.writeFileSync(dir + "/state.json", JSON.stringify(S));
const out = (s) => process.stdout.write(s + "\n");
const SITE = "${SITE}";
const fail = (code, msg) => { if (msg) process.stderr.write(msg + "\n"); process.exit(code); };
const tpl = (a) => { const i = a.indexOf("-f"); return i >= 0 ? a[i + 1] : null; };
const names = () => Object.keys(S.containers);

const [cmd, ...rest] = args;
if (cmd === "--version") { out("Docker version 27.3.1, build fake"); process.exit(0); }
if (cmd === "compose") {
  if (rest[0] === "version") { out("Docker Compose version v2.29.0"); process.exit(0); }
  // compose -p PROJECT -f FILE <sub> ...
  const sub = rest.slice(4);
  if (sub[0] === "config" && sub[1] === "-q") process.exit(0);
  if (sub[0] === "config" && sub[1] === "--services") { out("bft-web"); process.exit(0); }
  if (sub[0] === "config") { out(S.rendered); process.exit(0); }
  if (sub[0] === "build") { if (S.buildFails) fail(1, "build failed"); process.exit(0); }
  if (sub[0] === "up") {
    const tag = process.env.APP_VERSION || "local";
    S.containers[SITE] = { id: "site" + Date.now(), startedAt: new Date().toISOString(), aliases: ["bft-web"], image: "business-flights-web:" + tag, health: S.healthAfterUp, networks: S.networks.slice() };
    if (!S.images.includes("business-flights-web:" + tag)) S.images.push("business-flights-web:" + tag);
    if (S.crmRestartOnUp) S.containers["compass-tools-app-1"].startedAt = "RESTARTED-" + Date.now();
    save();
    process.exit(0);
  }
  fail(97, "fake docker: unexpected compose subcommand " + JSON.stringify(sub));
}
if (cmd === "network" && rest[0] === "inspect") {
  const net = rest[1];
  if (!S.networks.includes(net)) fail(1, "Error: No such network");
  const t = tpl(rest);
  if (t && t.includes(".Containers")) { out(names().filter((n) => (S.containers[n].networks || []).includes(net)).map((n) => n + " ").join("")); process.exit(0); }
  out("[]"); process.exit(0);
}
if (cmd === "inspect") {
  const name = rest[rest.length - 1];
  const c = S.containers[name];
  if (!c) fail(1, "Error: No such object: " + name);
  const t = tpl(rest);
  if (!t) { out("[]"); process.exit(0); }
  if (t.includes("Aliases")) out(c.aliases.join(" ") + " ");
  else if (t.includes(".Id}}")) out("/" + name + " " + c.id + " " + c.startedAt);
  else if (t.includes(".Config.Image")) out(c.image || "x");
  else if (t.includes("Health")) out(c.health || "healthy");
  else if (t.includes(".State.Running")) out("true");
  else if (t.includes("RestartPolicy")) out("unless-stopped");
  else fail(96, "fake docker: unexpected inspect template " + t);
  process.exit(0);
}
if (cmd === "port") { out((S.containers[rest[0]] || {}).ports || ""); process.exit(0); }
if (cmd === "image" && rest[0] === "inspect") process.exit(S.images.includes(rest[1]) ? 0 : 1);
if (cmd === "image" && rest[0] === "ls") { out(S.images.map((i) => i.split(":")[1]).join("\n")); process.exit(0); }
if (cmd === "tag") { S.images.push(rest[1]); save(); process.exit(0); }
if (cmd === "exec") {
  if (rest[0] !== SITE) fail(95, "fake docker: exec on a container other than the website: " + rest[0]);
  if (rest[1] === "id") { out("1000"); process.exit(0); }
  if (rest[1] === "node") { out(S.verifyFails ? "  FAIL: 500 /api/health" : "  ok:   200 /api/health"); process.exit(S.verifyFails ? 1 : 0); }
}
if (cmd === "logs") { out("log line"); process.exit(0); }
fail(99, "fake docker: unexpected command " + JSON.stringify(args));
`;

// The CRM project as its own compose file lays it out (release commit 4d33c29): the app answers as `compass-crm` on the internal website-API
// network and sits behind the tunnel on `web`; PostgreSQL (`db`) is on a third, internal `data` network the website never joins.
const CRM: Record<string, C> = {
  "compass-tools-app-1": { id: "aaa111", startedAt: "2026-10-01T00:00:00Z", aliases: ["app", "compass-crm"], networks: [API_NET, TUN_NET] },
  "compass-tools-db-1": { id: "bbb222", startedAt: "2026-10-01T00:00:00Z", aliases: ["db"], networks: ["compass-tools_data"] },
  "compass-tools-cloudflared-1": { id: "ccc333", startedAt: "2026-10-01T00:00:00Z", aliases: ["cloudflared"], networks: [TUN_NET] },
};

function baseState(over: Partial<State> = {}): State {
  return {
    networks: [API_NET, TUN_NET, "compass-tools_data"],
    containers: JSON.parse(JSON.stringify(CRM)),
    images: [],
    rendered: "name: business-flights-travel\nservices:\n  bft-web:\n    expose:\n      - '3000'\n",
    crmRestartOnUp: false,
    healthAfterUp: "healthy",
    verifyFails: false,
    buildFails: false,
    ...over,
  };
}

// A valid .env for the API-only website. Values are fakes: 40 and 48 characters of filler.
const KEY40 = "k".repeat(40);
const ENV_OK = `CRM_API_KEY=${KEY40}\nCRM_COMPANY_ID=company-1\nGMAIL_SENDER_EMAIL=a@example.com\nGMAIL_APP_PASSWORD=not-a-real-password\n`;

/** A throwaway clean git checkout containing only what the scripts need, plus the stub docker. */
function sandbox(state: State, opts: { dirty?: boolean; env?: string } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), "bft-deploy-"));
  cpSync(path.join(repo, "deploy"), path.join(root, "deploy"), { recursive: true });
  cpSync(path.join(repo, "compose.yaml"), path.join(root, "compose.yaml"));
  writeFileSync(path.join(root, ".gitignore"), ".env\n");
  writeFileSync(path.join(root, ".env"), opts.env ?? ENV_OK);
  chmodSync(path.join(root, ".env"), 0o600);
  const git = (...a: string[]) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...a], { cwd: root, encoding: "utf8" });
  git("init", "-q");
  git("add", "-A");
  git("commit", "-q", "-m", "init");
  if (opts.dirty) writeFileSync(path.join(root, "deploy", "uncommitted.txt"), "x");
  const stub = path.join(root, "..", path.basename(root) + "-stub");
  mkdirSync(stub, { recursive: true });
  writeFileSync(path.join(stub, "fake-docker.js"), FAKE_DOCKER);
  writeFileSync(path.join(stub, "docker"), '#!/usr/bin/env bash\nexec node "$(dirname "$0")/fake-docker.js" "$@"\n');
  chmodSync(path.join(stub, "docker"), 0o755);
  writeFileSync(path.join(stub, "free"), '#!/usr/bin/env bash\necho "Mem: 16000 3000 8000 100 5000 10400"\n');
  chmodSync(path.join(stub, "free"), 0o755);
  writeFileSync(path.join(stub, "state.json"), JSON.stringify(state));
  writeFileSync(path.join(stub, "calls.log"), "");
  const run = (script: string, args: string[] = [], env: Record<string, string> = {}) => {
    const r = spawnSync(BASH, [path.join(root, "deploy", script), ...args], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, PATH: [stub, path.dirname(process.execPath), process.env.PATH].join(path.delimiter), ...env },
      timeout: 60_000,
    });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  };
  const calls = () =>
    readFileSync(path.join(stub, "calls.log"), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as string[]);
  const stateNow = () => JSON.parse(readFileSync(path.join(stub, "state.json"), "utf8")) as State;
  return { root, run, calls, stateNow };
}

// Every docker invocation any scenario produced, to assert the global allow-list at the end.
const allCalls: string[][] = [];

test.describe("deploy scripts, dry-run against a stub docker", () => {
  test.skip(!bashAvailable, "bash is not available");

  test("bash -n: every script parses; they are LF files and executable in git", () => {
    for (const f of ["common.sh", "preflight.sh", "deploy.sh", "rollback.sh", "verify.sh"]) {
      const p = path.join(repo, "deploy", f);
      expect(spawnSync(BASH, ["-n", p], { encoding: "utf8" }).status, f).toBe(0);
      expect(readFileSync(p, "utf8").includes("\r"), `${f} has CRLF`).toBe(false);
    }
    const mode = spawnSync("git", ["ls-files", "-s", "deploy/deploy.sh", "deploy/preflight.sh", "deploy/rollback.sh", "deploy/verify.sh"], { cwd: repo, encoding: "utf8" }).stdout;
    const lines = mode.trim().split("\n");
    // The scripts are executed with `bash deploy/x.sh` in the runbook, but the documented `deploy/deploy.sh` form needs the bit.
    for (const l of lines) expect(l.startsWith("100755"), l).toBe(true);
    expect(lines).toHaveLength(4);
  });

  test("preflight passes on the CRM's networks, proves the website has no route to the database, and changes nothing", () => {
    const s = sandbox(baseState());
    const r = s.run("preflight.sh");
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain(`CRM API network '${API_NET}' exists`);
    expect(r.out).toContain(`tunnel network '${TUN_NET}' exists`);
    expect(r.out).toContain("container 'compass-tools-app-1' answers to 'compass-crm'");
    expect(r.out).toContain("no database container on either network");
    expect(r.out).toContain("no other container answers to 'bft-web'");
    expect(r.out).toContain("a cloudflared container is attached");
    expect(r.out).toContain("no database variables in .env");
    expect(r.out).not.toContain("FAIL");
    allCalls.push(...s.calls());
    // read-only: nothing that builds, starts, stops, tags or removes
    for (const c of s.calls()) expect(["--version", "compose", "network", "inspect", "port"], JSON.stringify(c)).toContain(c[0]);
    expect(s.calls().filter((c) => c[0] === "compose" && !["version", "-p"].includes(c[1]))).toHaveLength(0);
    expect(s.calls().some((c) => c.includes("up") || c.includes("build"))).toBe(false);
  });

  test("preflight refuses: another container already answers to bft-web", () => {
    const st = baseState();
    st.containers["rogue-1"] = { id: "r", startedAt: "x", aliases: ["bft-web"], networks: [TUN_NET] };
    const s = sandbox(st);
    const r = s.run("preflight.sh");
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/already answers to 'bft-web': rogue-1/);
    allCalls.push(...s.calls());
  });

  test("preflight refuses: a network missing, no 'compass-crm' on the API network, a database container on a shared network, a published port", () => {
    let s = sandbox(baseState({ networks: [TUN_NET] }));
    let r = s.run("preflight.sh");
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(new RegExp(`network '${API_NET}' does not exist`));
    allCalls.push(...s.calls());

    s = sandbox(baseState({ networks: [API_NET] }));
    r = s.run("preflight.sh");
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(new RegExp(`network '${TUN_NET}' does not exist`));
    allCalls.push(...s.calls());

    const noCrm = baseState();
    noCrm.containers["compass-tools-app-1"].aliases = ["app"];
    s = sandbox(noCrm);
    r = s.run("preflight.sh");
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(new RegExp(`no container on '${API_NET}' answers to 'compass-crm'`));
    allCalls.push(...s.calls());

    // The old layout: the tunnel network also carries PostgreSQL. The website must not join a network with a route to the database.
    const dbShared = baseState();
    dbShared.containers["compass-tools-db-1"].networks = [TUN_NET];
    s = sandbox(dbShared);
    r = s.run("preflight.sh");
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/a container answering to 'db' shares a network with the website: compass-tools-db-1@compass-tools_web/);
    expect(r.out).not.toContain("FAIL: network");
    allCalls.push(...s.calls());

    s = sandbox(baseState({ rendered: "services:\n  bft-web:\n    ports:\n      - 3000:3000\n" }));
    r = s.run("preflight.sh");
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/publishes a host port/);
    allCalls.push(...s.calls());
  });

  test("preflight refuses a .env that is missing a required variable, without echoing any value", () => {
    for (const missing of ["CRM_API_KEY", "CRM_COMPANY_ID", "GMAIL_SENDER_EMAIL", "GMAIL_APP_PASSWORD"]) {
      const env = ENV_OK.split("\n").filter((l) => !l.startsWith(`${missing}=`)).join("\n");
      const s = sandbox(baseState(), { env });
      const r = s.run("preflight.sh");
      expect(r.code, missing).not.toBe(0);
      expect(r.out).toContain(`${missing} is not set in .env`);
      expect(r.out).not.toContain("not-a-real-password");
      expect(r.out).not.toContain(KEY40);
      allCalls.push(...s.calls());
    }
    const s = sandbox(baseState());
    writeFileSync(path.join(s.root, ".env"), "GMAIL_SENDER_EMAIL=a@example.com\n"); // nearly everything is missing
    const r = s.run("preflight.sh");
    expect(r.code).not.toBe(0);
    expect(r.out).not.toContain("not-a-real-password");
    allCalls.push(...s.calls());
  });

  test("preflight checks the CRM settings: a key under 32 characters, a short or valid LEAD_INGEST_SECRET, a malformed CRM_API_URL", () => {
    const run = (extra: string, base = ENV_OK) => {
      const s = sandbox(baseState(), { env: base + extra });
      const r = s.run("preflight.sh");
      allCalls.push(...s.calls());
      return r;
    };
    let r = run("", ENV_OK.replace(KEY40, "k".repeat(31)));
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/CRM_API_KEY is shorter than 32 characters/);
    expect(r.out).not.toContain("k".repeat(31));
    r = run("", ENV_OK.replace(KEY40, "k".repeat(32)));
    expect(r.code, r.out).toBe(0);
    r = run("");
    expect(r.code, r.out).toBe(0);
    expect(r.out).toMatch(/WARN: LEAD_INGEST_SECRET is not set: leads are created WITHOUT the visitor's IP/);
    r = run("LEAD_INGEST_SECRET=short\n");
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/LEAD_INGEST_SECRET is shorter than 32 characters/);
    r = run(`LEAD_INGEST_SECRET=${"s".repeat(40)}\n`);
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain("LEAD_INGEST_SECRET is set");
    expect(r.out).not.toContain("s".repeat(40));
    r = run("CRM_API_URL=ftp://compass-crm\n");
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/CRM_API_URL must start with http:\/\/ or https:\/\//);
    r = run("CRM_API_URL=http://compass-crm:3000\n");
    expect(r.code, r.out).toBe(0);
  });

  test("preflight REFUSES any database setting in .env: the website must not hold database configuration at all", () => {
    for (const line of ["DATABASE_URL=postgresql://x:y@db:5432/z", "DIRECT_URL=postgresql://x:y@db:5432/z", "DATABASE_SSL_MODE=disable", "DATABASE_SSL_CA=abc", "DATABASE_SSL_VERIFY=system", "DATABASE_AUTO_INIT=true"]) {
      const s = sandbox(baseState(), { env: `${ENV_OK}${line}\n` });
      const r = s.run("preflight.sh");
      const name = line.split("=")[0];
      expect(r.code, line).not.toBe(0);
      expect(r.out).toContain(`${name} is set in .env. The website does not use a database`);
      expect(r.out).not.toContain("postgresql://x:y");
      allCalls.push(...s.calls());
    }
  });

  test("preflight warns (does not fail) when no cloudflared is on the tunnel network; the network names are overridable", () => {
    const st = baseState();
    delete st.containers["compass-tools-cloudflared-1"];
    const s = sandbox(st);
    const r = s.run("preflight.sh");
    expect(r.code, r.out).toBe(0);
    expect(r.out).toMatch(/WARN: no cloudflared container is attached/);
    allCalls.push(...s.calls());

    const renamed = baseState({ networks: ["crm-api-x", "tunnel-x"] });
    for (const c of Object.values(renamed.containers)) c.networks = (c.networks ?? []).map((n) => (n === API_NET ? "crm-api-x" : n === TUN_NET ? "tunnel-x" : n));
    const s2 = sandbox(renamed, { env: `${ENV_OK}CRM_API_NETWORK_NAME=crm-api-x\nTUNNEL_NETWORK_NAME=tunnel-x\n` });
    const r2 = s2.run("preflight.sh");
    expect(r2.code, r2.out).toBe(0);
    expect(r2.out).toContain("CRM API network 'crm-api-x' exists");
    allCalls.push(...s2.calls());
  });

  test("deploy.sh: preflight, build and start ONLY bft-web, wait healthy, verify, and prove no other container changed", () => {
    const s = sandbox(baseState());
    const r = s.run("deploy.sh");
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain("container healthy");
    expect(r.out).toContain("have the same ids and start times as before");
    expect(r.out).toContain("Verification passed");
    const calls = s.calls();
    allCalls.push(...calls);
    const compose = calls.filter((c) => c[0] === "compose" && !["version"].includes(c[1]));
    expect(compose.length).toBeGreaterThan(0);
    for (const c of compose) {
      expect(c.slice(0, 4), JSON.stringify(c)).toEqual(["compose", "-p", PROJECT, "-f"]);
    }
    const build = compose.find((c) => c[5] === "build")!;
    const up = compose.find((c) => c[5] === "up")!;
    expect(build.slice(5)).toEqual(["build", "bft-web"]);
    expect(up.slice(5)).toEqual(["up", "-d", "--no-deps", "bft-web"]);
    expect(s.stateNow().containers[SITE].image).toMatch(/^business-flights-web:[0-9a-f]{7,}$/);
  });

  test("deploy.sh: tags the running image as :previous before replacing it", () => {
    const st = baseState();
    st.containers[SITE] = { id: "old", startedAt: "2026-10-10T00:00:00Z", aliases: ["bft-web"], image: "business-flights-web:abc1234", networks: [API_NET, TUN_NET] };
    st.images = ["business-flights-web:abc1234"];
    const s = sandbox(st);
    const r = s.run("deploy.sh");
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain("previous image kept as business-flights-web:previous (business-flights-web:abc1234)");
    expect(s.calls().some((c) => c[0] === "tag" && c[1] === "business-flights-web:abc1234" && c[2] === "business-flights-web:previous")).toBe(true);
    allCalls.push(...s.calls());
  });

  test("deploy.sh does NOT retag :previous from an unhealthy running container (a second attempt after a failed deploy must not poison the rollback target)", () => {
    const st = baseState();
    st.containers[SITE] = { id: "broken", startedAt: "2026-10-11T00:00:00Z", aliases: ["bft-web"], image: "business-flights-web:badbad1", health: "unhealthy", networks: [API_NET, TUN_NET] };
    st.images = ["business-flights-web:badbad1", "business-flights-web:previous"];
    const s = sandbox(st);
    const r = s.run("deploy.sh");
    expect(r.out).toMatch(/not healthy: business-flights-web:previous was NOT updated/);
    expect(s.calls().some((c) => c[0] === "tag")).toBe(false);
    allCalls.push(...s.calls());
  });

  test("deploy.sh FAILS (does not report success) if any other container on the shared networks was restarted", () => {
    const s = sandbox(baseState({ crmRestartOnUp: true }));
    const r = s.run("deploy.sh");
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/a container other than the website changed/);
    expect(r.out).not.toContain("Deployed ");
    allCalls.push(...s.calls());
  });

  test("deploy.sh: an unhealthy container stops the deploy, shows logs and names the rollback; the CRM is untouched", () => {
    const s = sandbox(baseState({ healthAfterUp: "unhealthy" }));
    const r = s.run("deploy.sh");
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/container is 'unhealthy'. Roll back with: deploy\/rollback\.sh previous/);
    expect(s.calls().every((c) => c[0] !== "exec" || c[1] === SITE)).toBe(true);
    for (const n of Object.keys(CRM)) expect(s.stateNow().containers[n].startedAt).toBe(CRM[n].startedAt);
    allCalls.push(...s.calls());
  });

  test("deploy.sh: a failed build leaves the running container alone; a dirty working tree is refused before anything is built", () => {
    const st = baseState({ buildFails: true });
    st.containers[SITE] = { id: "old", startedAt: "2026-10-10T00:00:00Z", aliases: ["bft-web"], image: "business-flights-web:abc1234", networks: [API_NET, TUN_NET] };
    let s = sandbox(st);
    let r = s.run("deploy.sh");
    expect(r.code).not.toBe(0);
    expect(s.calls().some((c) => c[0] === "compose" && c.includes("up"))).toBe(false);
    expect(s.stateNow().containers[SITE].id).toBe("old");
    allCalls.push(...s.calls());

    s = sandbox(baseState(), { dirty: true });
    r = s.run("deploy.sh");
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/uncommitted changes/);
    expect(s.calls().some((c) => c[0] === "compose" && (c.includes("build") || c.includes("up")))).toBe(false);
    allCalls.push(...s.calls());
  });

  test("rollback.sh: recreates only bft-web from an existing image with --no-build; refuses an unknown tag without touching anything", () => {
    const st = baseState();
    st.containers[SITE] = { id: "new", startedAt: "2026-10-11T00:00:00Z", aliases: ["bft-web"], image: "business-flights-web:def5678", networks: [API_NET, TUN_NET] };
    st.images = ["business-flights-web:previous", "business-flights-web:def5678"];
    let s = sandbox(st);
    let r = s.run("rollback.sh", ["previous"]);
    expect(r.code, r.out).toBe(0);
    const up = s.calls().find((c) => c[0] === "compose" && c.includes("up"))!;
    expect(up.slice(5)).toEqual(["up", "-d", "--no-deps", "--no-build", "bft-web"]);
    expect(s.stateNow().containers[SITE].image).toBe("business-flights-web:previous");
    expect(r.out).toContain("no other container on the shared network was touched");
    allCalls.push(...s.calls());

    s = sandbox(baseState());
    r = s.run("rollback.sh", ["nonexistent"]);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/no image business-flights-web:nonexistent/);
    expect(s.calls().some((c) => c[0] === "compose" && c.includes("up"))).toBe(false);
    allCalls.push(...s.calls());
  });

  test("across every scenario, docker was only ever asked for the documented, non-destructive commands on this project", () => {
    expect(allCalls.length).toBeGreaterThan(30);
    const FORBIDDEN = /^(rm|stop|kill|restart|start|pause|prune|system|volume|run|create|cp|commit|save|load|push|login|rmi|pull)$/;
    for (const c of allCalls) {
      const flat = c.join(" ");
      expect(FORBIDDEN.test(c[0]), flat).toBe(false);
      if (c[0] === "network") expect(c[1], flat).toBe("inspect"); // never create/connect/disconnect/rm/prune
      if (c[0] === "image") expect(["inspect", "ls"], flat).toContain(c[1]);
      if (c[0] === "compose" && c[1] === "-p") {
        expect(c[2], flat).toBe(PROJECT);
        const sub = c[5];
        expect(["config", "build", "up"], flat).toContain(sub);
        expect(flat).not.toMatch(/\b(down|rm|stop|kill|restart|pull|-v|--volumes|--remove-orphans|--force-recreate)\b/);
        if (sub === "build" || sub === "up") expect(c[c.length - 1], flat).toBe("bft-web");
        if (sub === "up") expect(c, flat).toContain("--no-deps");
      }
      if (c[0] === "exec") expect(c[1], flat).toBe(SITE);
      if (c[0] === "inspect" || c[0] === "port" || c[0] === "logs") expect(flat, flat).toMatch(/compass-tools|business-flights-travel-bft-web-1|rogue-1/);
      expect(flat).not.toMatch(/--privileged|-v\s|--volume|--network host|--pid|docker\.sock/);
    }
    // nothing ever read an environment file's values through docker
    expect(allCalls.flat().join(" ")).not.toContain("not-a-real-password");
    expect(allCalls.flat().join(" ")).not.toContain(KEY40);
  });

  test("no script prints secrets, and none contains a destructive or database command", () => {
    for (const f of ["common.sh", "preflight.sh", "deploy.sh", "rollback.sh", "verify.sh"]) {
      const code = readFileSync(path.join(repo, "deploy", f), "utf8").split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
      expect(code, f).not.toMatch(/\bcat\b[^|\n]*\.env|echo[^\n]*(PASSWORD|CRM_API_KEY|LEAD_INGEST_SECRET)|printenv|\benv\b\s*\|/);
      expect(code, f).not.toMatch(/psql|pg_dump|pg_restore|prisma|migrate|DROP |TRUNCATE|DELETE FROM|GRANT |docker\s+(rm|stop|kill|restart|system|volume|network\s+(create|rm|connect|disconnect|prune))/);
    }
  });
});
