// What may be written to the server log about a caught error: its kind, never its message or a stack. The text of an error from the mail library, the network or the CRM
// client can carry an address, a host name or a fragment of what was being sent; the log line says WHAT failed, and the kind is enough to find out why.
export function describeError(error: unknown): string {
  if (error && typeof error === "object") {
    const e = error as { name?: unknown; code?: unknown };
    const name = typeof e.name === "string" && /^[A-Za-z0-9_.-]{1,60}$/.test(e.name) ? e.name : "Error";
    const code = typeof e.code === "string" && /^[A-Za-z0-9_.-]{1,40}$/.test(e.code) ? e.code : undefined;
    return code ? `${name} (${code})` : name;
  }
  return "non-error value thrown";
}
