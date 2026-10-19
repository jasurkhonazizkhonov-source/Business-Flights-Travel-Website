import { spawn, type ChildProcess } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

// Starts the production (standalone) build of the website for an end-to-end test, in the layout the Docker image has (no .env, no sources),
// and makes sure the thing that answers on the port is THE SERVER THIS TEST STARTED before the test sends it a single request - the e2e
// specs POST real server actions and browser forms to it. An HTTP 200 alone says nothing about who sent it: another process may already hold
// the port, or the server we spawned may have failed to bind and exited.
//
// All of the following must hold before start() returns:
//   1. nothing accepts connections on 127.0.0.1:<port> or [::1]:<port> before the spawn (otherwise: refuse, spawn nothing);
//   2. the child is spawned bound to 127.0.0.1 (HOSTNAME), so a second listener on that address makes it exit instead of coexisting;
//   3. the child's OWN output (nothing else can write into it) says it is listening on this port and is ready;
//   4. /api/health answers 200 within a bounded time;
//   5. the child is still running afterwards. Specs call assertAlive() before every test.
// Nothing is ever printed from the child's output except by a spec that chooses to show a short tail of it on a failure.

export type StandaloneServer = {
  port: number;
  origin: string;
  /** Everything the child has written to stdout/stderr so far (for assertions such as "no credential was logged"). */
  logs: () => string;
  /** Throws unless the child this test started is still running. */
  assertAlive: () => void;
  /** Stops only the child this function started, and removes its temporary layout. */
  stop: () => Promise<void>;
  layout: string;
};

const repo = path.resolve(__dirname, "..", "..");
export const standaloneBuildPresent = () => existsSync(path.join(repo, ".next", "standalone", "server.js"));

function accepts(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    socket.setTimeout(1500, () => (socket.destroy(), resolve(false)));
    socket.once("connect", () => (socket.destroy(), resolve(true)));
    socket.once("error", () => resolve(false));
  });
}

export async function startStandalone(options: { label: string; port: number; env: Record<string, string>; withStaticAssets?: boolean; timeoutMs?: number }): Promise<StandaloneServer> {
  const { label, port } = options;
  if ((await accepts("127.0.0.1", port)) || (await accepts("::1", port))) {
    throw new Error(`${label}: port ${port} is already in use by another process, so nothing was started and nothing was sent. The tests never use a server they did not start.`);
  }

  const layout = mkdtempSync(path.join(os.tmpdir(), "bft-e2e-"));
  const cleanup = () => {
    try {
      rmSync(layout, { recursive: true, force: true });
    } catch {
      /* a leftover temp directory is harmless */
    }
  };
  // The layout the Dockerfile's runner stage produces. NO .env is ever copied.
  cpSync(path.join(repo, ".next", "standalone"), layout, { recursive: true, filter: (src) => !/[\\/]\.env($|\.)/.test(src) });
  if (options.withStaticAssets) {
    mkdirSync(path.join(layout, ".next"), { recursive: true });
    cpSync(path.join(repo, ".next", "static"), path.join(layout, ".next", "static"), { recursive: true });
    cpSync(path.join(repo, "public"), path.join(layout, "public"), { recursive: true });
    mkdirSync(path.join(layout, "scripts"), { recursive: true });
    cpSync(path.join(repo, "scripts", "healthcheck.mjs"), path.join(layout, "scripts", "healthcheck.mjs"));
  }

  // Only what the container receives. Nothing else from this machine's environment leaks in.
  const env = {
    PATH: process.env.PATH ?? "",
    SystemRoot: process.env.SystemRoot ?? "",
    NODE_ENV: "production",
    HOSTNAME: "127.0.0.1",
    PORT: String(port),
    ...options.env,
  } as NodeJS.ProcessEnv;
  const child: ChildProcess = spawn(process.execPath, ["server.js"], { cwd: layout, env, stdio: ["ignore", "pipe", "pipe"] });
  child.on("error", () => undefined);
  let logs = "";
  child.stdout?.on("data", (d) => (logs += d));
  child.stderr?.on("data", (d) => (logs += d));
  const gone = () => child.exitCode !== null || child.signalCode !== null || child.pid === undefined;
  const stop = async () => {
    if (!gone()) child.kill();
    await new Promise((resolve) => setTimeout(resolve, 1500)); // let the process release its working directory (Windows refuses to delete it otherwise)
    cleanup();
  };
  const fail = async (why: string): Promise<never> => {
    await stop();
    throw new Error(`${label}: ${why} Nothing was sent to it.`);
  };

  const deadline = Date.now() + (options.timeoutMs ?? 60_000);
  while (Date.now() < deadline) {
    if (gone()) return fail(`the server this test started exited (code ${child.exitCode ?? "?"}) before it was ready.`);
    if (logs.includes(`http://127.0.0.1:${port}`) && logs.includes("Ready")) {
      const answered = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(5_000) }).then((r) => r.status === 200, () => false);
      if (answered && !gone()) {
        return {
          port,
          origin: `http://127.0.0.1:${port}`,
          logs: () => logs,
          assertAlive: () => {
            if (gone()) throw new Error(`${label}: the server this test started is no longer running; anything answering on the port now is not it.`);
          },
          stop,
          layout,
        };
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return fail("the server did not report that it is listening and healthy in time.");
}
