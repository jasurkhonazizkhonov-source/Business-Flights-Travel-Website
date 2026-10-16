// Container health probe: succeeds only if the app answers GET /api/health with 200 {"status":"ok"} on loopback.
// Dependency-free so it runs in the minimal standalone image. Used by the Dockerfile HEALTHCHECK.
//
// The result is set with process.exitCode and the process is left to end by itself: calling process.exit() while the HTTP client
// still has a handle closing can abort the interpreter instead of returning the intended code.
const port = process.env.PORT || "3000";
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 4000);
let code = 1;
try {
  const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: controller.signal });
  const body = await res.json().catch(() => ({}));
  code = res.status === 200 && body.status === "ok" ? 0 : 1;
} catch {
  code = 1;
} finally {
  clearTimeout(timer);
}
process.exitCode = code;
