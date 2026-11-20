import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

// Static checks of the intended Docker topology, written against the files themselves (no Docker needed): the production compose project joins exactly the two
// external networks, carries the tunnel alias `bft-web` on port 3000, publishes nothing, mounts nothing and holds no database setting; the rehearsal project
// (deploy/rehearsal, run later where Docker exists) mirrors that layout with throwaway networks and keeps the website OFF the data network.

const root = path.resolve(__dirname, "..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");
/** The text of one top-level service block of a compose file (from "  name:" to the next two-space-indented key). */
function service(compose: string, name: string): string {
  const m = compose.match(new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [A-Za-z0-9_-]+:\\n|^[a-z]+:|$(?![\\s\\S]))`, "m"));
  expect(m, `service ${name}`).toBeTruthy();
  return m![1];
}
const code = (s: string) => s.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");

test.describe("production compose (compose.yaml): website-only project", () => {
  const compose = code(read("compose.yaml"));

  test("one service, bft-web, in its own project; no published ports, no volumes, no container_name", () => {
    expect(compose).toMatch(/^services:\n {2}bft-web:/m);
    const services = compose.split(/^services:\n/m)[1].split(/^networks:\n/m)[0];
    expect([...services.matchAll(/^ {2}([A-Za-z0-9_-]+):\n/gm)].map((m) => m[1])).toEqual(["bft-web"]);
    expect(compose).not.toMatch(/^\s+ports:/m);
    expect(compose).toMatch(/expose:\n\s+- "3000"/);
    expect(compose).not.toMatch(/^\s+volumes:/m);
    expect(compose).not.toMatch(/container_name:/);
    expect(compose).toMatch(/restart: unless-stopped/);
  });

  test("it joins its own network plus the two EXTERNAL ones; the tunnel network carries the alias bft-web; the CRM network is the CRM's internal API network", () => {
    const web = service(compose, "bft-web");
    expect(web).toMatch(/networks:\n\s+default: \{\}\n\s+crm_api: \{\}\n\s+tunnel:\n\s+aliases: \[bft-web\]/);
    expect(compose).toMatch(/crm_api:\n\s+external: true\n\s+name: \$\{CRM_API_NETWORK_NAME:-compass-tools-website-api\}/);
    expect(compose).toMatch(/tunnel:\n\s+external: true\n\s+name: \$\{TUNNEL_NETWORK_NAME:-compass-tools_web\}/);
  });

  test("the CRM is addressed by a private in-network name, never a public URL; the port is 3000; no database variable is forwarded", () => {
    expect(compose).toMatch(/CRM_API_URL: \$\{CRM_API_URL:-http:\/\/compass-crm:3000\}/);
    expect(compose).not.toMatch(/https:\/\/(www\.)?(compass-tools|businessflights)/);
    expect(compose).toMatch(/PORT: "3000"/);
    expect(compose).toMatch(/TRUSTED_PROXY: cloudflare/);
    expect(compose).not.toMatch(/DATABASE_|DIRECT_URL|POSTGRES|postgres/i);
  });

  test("hardening: no-new-privileges, all capabilities dropped, memory and pid limits, a tmpfs /tmp", () => {
    const web = service(compose, "bft-web");
    for (const needle of [/no-new-privileges:true/, /cap_drop:\n\s+- ALL/, /mem_limit: 1g/, /pids_limit: 256/, /tmpfs:\n\s+- \/tmp/, /init: true/]) expect(web).toMatch(needle);
  });
});

test.describe("the image: health check, port, user, secrets", () => {
  const docker = code(read("Dockerfile"));
  test("HEALTHCHECK calls the app's own /api/health (not the CRM); the container listens on 3000 as the node user; start command is the standalone server", () => {
    expect(docker).toMatch(/HEALTHCHECK .*scripts\/healthcheck\.mjs/);
    expect(read("scripts/healthcheck.mjs")).toMatch(/\/api\/health/);
    expect(read("scripts/healthcheck.mjs")).not.toMatch(/CRM|compass-crm/i);
    expect(docker).toMatch(/PORT=3000/);
    expect(docker).toMatch(/USER node/);
    expect(docker).toMatch(/CMD \["node", "server\.js"\]/);
  });
  test("no ARG/ENV carries a secret, a CRM setting or a database setting into any layer", () => {
    expect(docker).not.toMatch(/^\s*(ARG|ENV)\s+(CRM_|LEAD_INGEST|GMAIL_|DATABASE|DIRECT_URL|POSTGRES)/m);
  });
});

test.describe("rehearsal project (deploy/rehearsal): isolated, mirrors the intended layout", () => {
  const compose = code(read("deploy/rehearsal/compose.rehearsal.yaml"));

  test("its own project name, only throwaway networks (nothing external), no published ports", () => {
    expect(compose).toMatch(/^name: bft-rehearsal/m);
    expect(compose).not.toMatch(/external:/);
    expect(compose).not.toMatch(/^\s+ports:/m);
    expect(compose).not.toMatch(/compass-tools|businessflights\.travel|compass-tools_web|compass-tools-website-api/);
  });

  test("the database is ONLY on the data network; the website is NOT on it; the CRM stand-in bridges data and api; the tunnel alias is bft-web", () => {
    expect(service(compose, "db")).toMatch(/networks: \[rh_data\]/);
    const web = service(compose, "bft-web");
    expect(web).not.toMatch(/rh_data/);
    expect(web).toMatch(/rh_api: \{\}/);
    expect(web).toMatch(/aliases: \[bft-web\]/);
    const crm = service(compose, "compass-crm");
    expect(crm).toMatch(/rh_data: \{\}/);
    expect(crm).toMatch(/aliases: \[compass-crm\]/);
    expect(compose).toMatch(/rh_data:\n\s+internal: true/);
    expect(compose).toMatch(/rh_api:\n\s+internal: true/);
  });

  test("the website service has no database variable and only fake values; the secrets in it are labelled rehearsal-only", () => {
    const web = service(compose, "bft-web");
    expect(web).not.toMatch(/DATABASE_|DIRECT_URL|POSTGRES/);
    expect(web).toMatch(/CRM_API_URL: http:\/\/compass-crm:3000/);
    expect(web).toMatch(/rehearsal/);
  });

  test("run.sh exists, is syntactically bash, never touches a non-rehearsal project, and declares its own status", () => {
    const run = read("deploy/rehearsal/run.sh");
    expect(run).toContain("-p bft-rehearsal");
    expect(run).not.toMatch(/docker (stop|rm|kill|network (rm|disconnect|connect)|system prune|volume rm)\b(?![^\n]*bft-rehearsal)/);
    expect(run).toContain("has NOT been run");
  });
});
