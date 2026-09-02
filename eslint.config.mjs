import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored third-party skill/agent tooling (gitignored, not part of the
    // deployable app) — linting it just surfaces hundreds of warnings from
    // code this project doesn't own or ship.
    ".claude/**",
    ".agents/**",
    // Playwright's own run output.
    "test-results/**",
    "playwright-report/**",
  ]),
]);

export default eslintConfig;
