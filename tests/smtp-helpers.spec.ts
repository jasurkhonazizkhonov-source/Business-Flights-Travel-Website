import { test, expect } from "@playwright/test";
import { cleanEnvSecret, isTransientConnectionError } from "../src/lib/email/smtp-helpers";

test.describe("cleanEnvSecret", () => {
  test("strips leading/trailing whitespace (the classic 'pasted with a trailing newline' mistake)", () => {
    expect(cleanEnvSecret("  abcd1234  \n")).toBe("abcd1234");
  });

  test("strips INTERNAL whitespace too — the real Gmail App Password mistake: Google's own UI displays the password as 'abcd efgh ijkl mnop' for readability, and copying that selects the spaces along with it", () => {
    expect(cleanEnvSecret("abcd efgh ijkl mnop")).toBe("abcdefghijklmnop");
    expect(cleanEnvSecret(" abcd efgh ijkl mnop ")).toBe("abcdefghijklmnop");
  });

  test("a value with no whitespace at all is returned unchanged", () => {
    expect(cleanEnvSecret("alreadyclean@example.com")).toBe("alreadyclean@example.com");
  });

  test("undefined stays undefined (feature simply reads as unconfigured, not a crash)", () => {
    expect(cleanEnvSecret(undefined)).toBeUndefined();
  });
});

test.describe("isTransientConnectionError", () => {
  test("recognizes every connection-category Nodemailer/Node error code", () => {
    for (const code of ["ECONNECTION", "ESOCKET", "ETIMEDOUT", "EDNS", "ECONNRESET"]) {
      expect(isTransientConnectionError({ code })).toBe(true);
    }
  });

  test("does NOT treat an authentication or envelope rejection as transient/retryable", () => {
    for (const code of ["EAUTH", "EENVELOPE", "EMESSAGE"]) {
      expect(isTransientConnectionError({ code })).toBe(false);
    }
  });

  test("handles a non-Error, code-less, or null value safely", () => {
    expect(isTransientConnectionError(new Error("plain error, no code"))).toBe(false);
    expect(isTransientConnectionError(null)).toBe(false);
    expect(isTransientConnectionError("a string, not an error object")).toBe(false);
  });
});
