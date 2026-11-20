// Email-address SYNTAX validation shared by the browser (instant feedback) and the server (the authoritative check). Dependency-free on purpose:
// the contact, flight and newsletter forms are on pages across the site and must not pull zod into their client bundle just to test an address.
//
// What this proves, and what it does not: that the text is a well-formed address of the kind mail systems accept. It does NOT prove that the
// mailbox exists, that it can receive mail, or that the visitor owns it - the website sends no verification message, so none of that is
// checked or claimed anywhere.
//
// Rules (deliberately a SUBSET of what the Compass Tools CRM accepts, which validates with zod's `.email()`; every address passing here also
// passes there, so a visitor is never told "sent" for an address the CRM would then refuse - tests/email-validation.spec.ts pins that property):
//  - the only change ever made to the visitor's text is trimming accidental whitespace at both ends; an address is stored exactly as typed;
//  - exactly one "@"; a local part of up to 64 characters and a domain; at most 254 characters in all (RFC 5321);
//  - local part: letters, digits and _ ' + - . only; no leading, trailing or consecutive dots;
//  - domain: two or more dot-separated labels of letters, digits and hyphens (1-63 characters, not starting or ending with a hyphen), the last
//    one letters only (2+). Standard (ASCII) domains only: internationalised addresses (non-ASCII letters, "xn--" top-level domains) are
//    refused, because the CRM and the mail path behind it do not accept them either. Local parts containing other characters that RFC 5322
//    technically allows (! # $ % & * / = ? ^ ` { | } ~) or a quoted local part are likewise refused, for the same reason.

export type EmailProblem =
  | "empty"
  | "whitespace"
  | "no_at"
  | "multiple_at"
  | "no_local"
  | "no_domain"
  | "local_too_long"
  | "too_long"
  | "local_characters"
  | "local_dots"
  | "domain_no_dot"
  | "domain_invalid"
  | "domain_tld"
  | "non_ascii";

export type EmailCheck = { ok: true; value: string } | { ok: false; problem: EmailProblem };

const LOCAL_RE = /^[A-Za-z0-9_'+\-.]+$/;
const LABEL_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
const TLD_RE = /^[A-Za-z]{2,63}$/;

export function checkEmail(raw: string): EmailCheck {
  const value = raw.trim();
  if (!value) return { ok: false, problem: "empty" };
  if (/[\s\p{Cc}\p{Cf}]/u.test(value)) return { ok: false, problem: "whitespace" };
  const parts = value.split("@");
  if (parts.length === 1) return { ok: false, problem: "no_at" };
  if (parts.length > 2) return { ok: false, problem: "multiple_at" };
  const [local, domain] = parts;
  if (!local) return { ok: false, problem: "no_local" };
  if (!domain) return { ok: false, problem: "no_domain" };
  if (value.length > 254) return { ok: false, problem: "too_long" };
  if (local.length > 64) return { ok: false, problem: "local_too_long" };
  if (/[^\x00-\x7f]/.test(value)) return { ok: false, problem: "non_ascii" };
  if (!LOCAL_RE.test(local)) return { ok: false, problem: "local_characters" };
  // The last character before "@" must be a letter, digit, "_", "+" or "-" (zod's rule): not a dot, not an apostrophe.
  if (local.startsWith(".") || local.includes("..") || !/[A-Za-z0-9_+-]$/.test(local)) return { ok: false, problem: "local_dots" };
  const labels = domain.split(".");
  if (labels.length < 2) return { ok: false, problem: "domain_no_dot" };
  if (!labels.every((label) => LABEL_RE.test(label))) return { ok: false, problem: "domain_invalid" };
  if (!TLD_RE.test(labels[labels.length - 1])) return { ok: false, problem: "domain_tld" };
  return { ok: true, value };
}

export function isValidEmail(raw: string): boolean {
  return checkEmail(raw).ok;
}

const HINTS: Record<EmailProblem, string> = {
  empty: "",
  whitespace: "Remove any spaces from the address.",
  no_at: "The address needs an @ sign, like name@example.com.",
  multiple_at: "The address can only contain one @ sign.",
  no_local: "Add the part before the @, like name@example.com.",
  no_domain: "Add the part after the @, like name@example.com.",
  local_too_long: "The part before the @ is too long.",
  too_long: "The address is too long.",
  local_characters: "The part before the @ contains a character we can't accept.",
  local_dots: "The part before the @ can't start with a dot, end with a dot or apostrophe, or contain two dots in a row.",
  domain_no_dot: "The part after the @ needs a dot, like name@example.com.",
  domain_invalid: "Check the part after the @ for typos, extra dots or misplaced hyphens.",
  domain_tld: "Check the ending of the address (for example .com).",
  non_ascii: "Please use an address written with standard letters and digits.",
};

/** The visitor-facing text: the form's own base sentence (it differs per form), then a short, specific hint when there is one. */
export function emailProblemMessage(problem: EmailProblem, base = "Please enter a valid email address."): string {
  const hint = HINTS[problem];
  return hint ? `${base} ${hint}` : base;
}
