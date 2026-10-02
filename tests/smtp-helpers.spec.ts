import { test, expect } from "@playwright/test";
import { cleanEnvValue, isPlausibleEmail, isTransientConnectionError } from "../src/lib/email/smtp-helpers";

test.describe("cleanEnvValue", () => {
  test("strips leading/trailing whitespace (the classic 'pasted with a trailing newline' mistake)", () => {
    expect(cleanEnvValue("  abcd1234  \n")).toBe("abcd1234");
  });

  test("strips INTERNAL whitespace too — the real Gmail App Password mistake: Google's own UI displays the password as 'abcd efgh ijkl mnop' for readability, and copying that selects the spaces along with it", () => {
    expect(cleanEnvValue("abcd efgh ijkl mnop")).toBe("abcdefghijklmnop");
    expect(cleanEnvValue(" abcd efgh ijkl mnop ")).toBe("abcdefghijklmnop");
  });

  test("a value with no whitespace at all is returned unchanged", () => {
    expect(cleanEnvValue("alreadyclean@example.com")).toBe("alreadyclean@example.com");
  });

  test("undefined stays undefined (feature simply reads as unconfigured, not a crash)", () => {
    expect(cleanEnvValue(undefined)).toBeUndefined();
  });

  test("strips surrounding straight quotes — a common habit from shell `export KEY=\"value\"` or a JSON config pasted into a value field", () => {
    expect(cleanEnvValue('"ops@businessflights.travel"')).toBe("ops@businessflights.travel");
    expect(cleanEnvValue("'ops@businessflights.travel'")).toBe("ops@businessflights.travel");
  });

  test("strips smart/curly quotes too — the kind a word processor or some dashboard inputs auto-substitute", () => {
    expect(cleanEnvValue("“abcd1234”")).toBe("abcd1234");
    expect(cleanEnvValue("‘abcd1234’")).toBe("abcd1234");
  });

  test("handles quotes AND internal whitespace together — e.g. a whole Gmail App Password copied from a JSON file as \"abcd efgh ijkl mnop\"", () => {
    expect(cleanEnvValue('"abcd efgh ijkl mnop"')).toBe("abcdefghijklmnop");
  });
});

test.describe("isPlausibleEmail", () => {
  test("accepts an ordinary email address", () => {
    expect(isPlausibleEmail("ops@businessflights.travel")).toBe(true);
  });

  test("rejects undefined, empty string, and values with no '@' or no domain dot", () => {
    expect(isPlausibleEmail(undefined)).toBe(false);
    expect(isPlausibleEmail("")).toBe(false);
    expect(isPlausibleEmail("not-an-email")).toBe(false);
    expect(isPlausibleEmail("missing-domain-dot@localhost")).toBe(false);
  });

  test("rejects a value that still contains whitespace or a stray quote character (i.e. this is meant to run AFTER cleanEnvValue, not instead of it)", () => {
    expect(isPlausibleEmail("ops @businessflights.travel")).toBe(false);
    expect(isPlausibleEmail('"ops@businessflights.travel"')).toBe(false);
  });

  test("rejects anything an address-list parser would split or interpret — comma/semicolon lists, comments, brackets, backslash, CR/LF (Nodemailer passes a comma list through as multiple addresses)", () => {
    for (const bad of ["a@b.com,c@d.com", "a@b.com;c@d.com", "a(comment)@b.com", "a@b.com\r\nBcc: x@y.com", "a[1]@b.com", "a\\b@c.com", "<a@b.com>"]) {
      expect(isPlausibleEmail(bad), bad).toBe(false);
    }
    expect(isPlausibleEmail("first.last+tag@sub.example.co.uk")).toBe(true);
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
