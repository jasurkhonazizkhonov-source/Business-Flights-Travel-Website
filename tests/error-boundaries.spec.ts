import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Regression guard for the App Router error-boundary files. These aren't
// wired up by an import anywhere — Next.js discovers error.tsx /
// global-error.tsx purely by file path convention — so nothing else in the
// codebase (a type error, a failed import) would catch one being
// accidentally deleted or emptied out. This exists specifically to catch
// that: without src/app/error.tsx, a render error under the root layout
// falls through to Next's generic unstyled default error page instead of
// the site's own "Something went wrong" recovery UI; without
// src/app/global-error.tsx, an error thrown by the root layout itself has
// no boundary at all.
const APP_DIR = path.resolve(__dirname, "../src/app");

test.describe("App Router error boundaries", () => {
  test("error.tsx exists and exports a default component with a reset control", () => {
    const filePath = path.join(APP_DIR, "error.tsx");
    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("export default function");
    // Must accept and use Next's `reset` callback — the boundary's whole
    // point is giving the visitor a real way to retry, not a dead end.
    expect(content).toMatch(/reset/);
  });

  test("global-error.tsx exists, exports a default component, and renders its own <html>/<body>", () => {
    const filePath = path.join(APP_DIR, "global-error.tsx");
    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("export default function");
    // This file replaces the entire document (the root layout itself
    // failed), so it must supply its own <html> and <body> rather than
    // relying on the layout it's a fallback for.
    expect(content).toMatch(/<html/);
    expect(content).toMatch(/<body/);
    expect(content).toMatch(/reset/);
  });
});
