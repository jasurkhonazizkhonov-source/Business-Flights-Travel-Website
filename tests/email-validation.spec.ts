import { test, expect } from "@playwright/test";
import { z } from "zod";
import { checkEmail, emailProblemMessage, isValidEmail, type EmailProblem } from "../src/lib/email-validation";
import { contactMessageSchema } from "../src/lib/validations/contact";
import { newsletterSchema } from "../src/lib/validations/newsletter";
import { createFlightRequestSchema } from "../src/lib/validations/flight-request";

// Email SYNTAX validation (src/lib/email-validation.ts). Syntax only: nothing here, or anywhere on the site, proves a mailbox exists or is
// owned by the visitor - there is no verification message. The rules are a subset of what the CRM accepts (it validates with zod's .email()),
// so a visitor is never told "sent" for an address the CRM would then refuse.

const VALID = [
  "name@example.com",
  "first.last@example.com",
  "first.last+travel@sub.example.co.uk",
  "o'brien@example.ie", // apostrophe is legitimate
  "user_name@example.org",
  "user-name@example-domain.com",
  "a@b.co",
  "x@y.travel", // a long, uncommon top-level domain
  "UPPER.case@Example.COM",
  "1234567890@example.com",
  "user+tag+more@example.com",
  "a.b.c.d@e.f.gh",
  "name@123.example.com",
  "very.long.but.fine.local.part.under.sixty.four.chars@example.com",
];

const INVALID: [string, EmailProblem][] = [
  ["", "empty"],
  ["   ", "empty"],
  ["plainaddress", "no_at"],
  ["name.example.com", "no_at"],
  ["@example.com", "no_local"],
  ["name@", "no_domain"],
  ["name@@example.com", "multiple_at"],
  ["na@me@example.com", "multiple_at"],
  ["name@example", "domain_no_dot"],
  ["name@example.", "domain_invalid"],
  ["name@.example.com", "domain_invalid"],
  ["name@example..com", "domain_invalid"],
  ["name@-example.com", "domain_invalid"],
  ["name@example-.com", "domain_invalid"],
  ["name@exa_mple.com", "domain_invalid"],
  ["name@example.c", "domain_tld"],
  ["name@example.123", "domain_tld"],
  ["name@example.c0m", "domain_tld"],
  ["john doe@example.com", "whitespace"],
  ["john@exam ple.com", "whitespace"],
  ["john\t@example.com", "whitespace"],
  ["john doe@example.com", "whitespace"], // no-break space inside
  ["john​@example.com", "whitespace"], // zero-width space (invisible)
  [".name@example.com", "local_dots"],
  ["name.@example.com", "local_dots"],
  ["na..me@example.com", "local_dots"],
  ["name'@example.com", "local_dots"],
  ["na,me@example.com", "local_characters"],
  ["na;me@example.com", "local_characters"],
  ["na(me)@example.com", "local_characters"],
  ["na<me>@example.com", "local_characters"],
  ["na\"me@example.com", "local_characters"],
  ["name@exam,ple.com", "domain_invalid"],
  ["name@example.com,other@example.com", "multiple_at"],
  ["name@example.com,other.example.com", "domain_invalid"],
  ["name@münchen.de", "non_ascii"],
  ["müller@example.de", "non_ascii"],
  ["名前@例え.jp", "non_ascii"],
  [`${"a".repeat(65)}@example.com`, "local_too_long"],
  [`name@${"a".repeat(64)}.com`, "domain_invalid"], // a 64-character label
  [`${"a".repeat(60)}@${"b".repeat(60)}.${"c".repeat(60)}.${"d".repeat(60)}.${"e".repeat(30)}.com`, "too_long"],
];

test.describe("checkEmail", () => {
  for (const address of VALID) {
    test(`accepts ${address.length > 40 ? `${address.slice(0, 37)}...` : address}`, () => {
      const result = checkEmail(address);
      expect(result).toEqual({ ok: true, value: address });
    });
  }

  for (const [address, problem] of INVALID) {
    test(`rejects ${JSON.stringify(address.length > 40 ? `${address.slice(0, 37)}...` : address)} as ${problem}`, () => {
      expect(checkEmail(address)).toEqual({ ok: false, problem });
    });
  }

  test("surrounding whitespace is trimmed and nothing else is changed (case, dots and plus tags survive)", () => {
    expect(checkEmail("  Name.Last+Tag@Example.com \n")).toEqual({ ok: true, value: "Name.Last+Tag@Example.com" });
    expect(checkEmail(" name@example.com ")).toEqual({ ok: true, value: "name@example.com" });
  });

  test("the address at the length limits: 64-character local part and a 254-character address are accepted, one more is not", () => {
    const local64 = "a".repeat(64);
    expect(isValidEmail(`${local64}@example.com`)).toBe(true);
    expect(checkEmail(`${"a".repeat(65)}@example.com`)).toEqual({ ok: false, problem: "local_too_long" });
    // 254 characters: local 64 + "@" + domain 189 (labels of 63 / 63 / 61 + ".com")
    const domain = `${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(55)}.com`;
    const exactly254 = `${"a".repeat(64)}@${domain}`;
    expect(exactly254.length).toBeLessThanOrEqual(254);
    expect(isValidEmail(exactly254)).toBe(true);
    expect(checkEmail(`${exactly254}.org`.padEnd(255, "x"))).toMatchObject({ ok: false });
  });
});

test.describe("compatibility with the CRM", () => {
  // The CRM validates with zod's .email(). Everything this module accepts must pass that too, over a broad generated corpus as well as the lists
  // above - otherwise the visitor would see success on the form and the CRM would then refuse the address.
  const crm = z.string().email();

  test("every address accepted here is accepted by zod's email check (listed cases)", () => {
    for (const address of VALID) expect(crm.safeParse(address).success, address).toBe(true);
  });

  test("... and over a generated corpus of 20,000 addresses built from awkward characters (no false accepts)", () => {
    const localChars = ["a", "Z", "7", ".", "-", "_", "+", "'", " ", ",", "!", "#", "%", "&", "*", "/", "=", "?", "^", "`", "{", "|", "}", "~", "é", "名", "x", "y", "."];
    const domainChars = ["a", "b", "Z", "7", "-", "_", ".", ".", ".", " ", ",", "é", "x", "y", "1", "@"];
    let seed = 20260115;
    const next = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const pick = (chars: string[], count: number) => Array.from({ length: count }, () => chars[Math.floor(next() * chars.length)]).join("");
    let accepted = 0;
    for (let i = 0; i < 20000; i++) {
      // local part and domain from awkward alphabets, with a real-looking ending half of the time so that a good share of candidates is valid
      const tld = next() < 0.5 ? ["com", "org", "co", "travel", "c0m", "x", "COM"][Math.floor(next() * 7)] : pick(domainChars, 2 + Math.floor(next() * 3));
      const candidate = `${pick(localChars, 1 + Math.floor(next() * 12))}@${pick(domainChars, 1 + Math.floor(next() * 10))}.${tld}`;
      if (isValidEmail(candidate)) {
        accepted++;
        expect(crm.safeParse(candidate.trim()).success, candidate).toBe(true);
      }
    }
    // Sanity: the corpus is not so hostile that nothing ever passed (it would make the property above vacuous).
    expect(accepted).toBeGreaterThan(10);
  });

  test("addresses zod accepts but this module is stricter about: trailing hyphen, over-long local part", () => {
    expect(crm.safeParse("name@example-.com").success).toBe(true);
    expect(isValidEmail("name@example-.com")).toBe(false);
  });
});

test.describe("messages", () => {
  test("the base sentence of the form is kept, with a specific hint after it", () => {
    expect(emailProblemMessage("empty")).toBe("Please enter a valid email address.");
    expect(emailProblemMessage("no_at")).toBe("Please enter a valid email address. The address needs an @ sign, like name@example.com.");
    expect(emailProblemMessage("domain_no_dot", "Please enter a valid email address so we can reply.")).toContain("Please enter a valid email address so we can reply. ");
  });

  test("every problem has a message that starts with the base sentence", () => {
    for (const [, problem] of INVALID) expect(emailProblemMessage(problem).startsWith("Please enter a valid email address.")).toBe(true);
  });
});

test.describe("the same rules on the server", () => {
  const airport = (iata: string) => ({ iata, city: "City", name: "Airport", country: "Country" });
  const flight = createFlightRequestSchema(() => new Date(Date.UTC(2026, 10, 15, 12)));
  const flightInput = (email: string) => ({
    tripType: "ONE_WAY" as const,
    segments: [{ from: airport("FRA"), to: airport("JFK"), departureDate: "2026-12-01" }],
    cabinClass: "BUSINESS" as const,
    adults: 1,
    children: 0,
    infants: 0,
    flexibleDates: false,
    firstName: "T",
    lastName: "P",
    email,
    phone: "+14155709267",
  });
  const contactInput = (email: string) => ({ firstName: "T", lastName: "P", email, phone: "+14155709267", subject: "GENERAL_INQUIRY" as const, message: "Hello there, this is a test." });

  test("flight request: valid passes (and is trimmed), invalid is refused on the email field with a specific hint", () => {
    const ok = flight.safeParse(flightInput("  name@example.com  "));
    expect(ok.success && ok.data.email).toBe("name@example.com");
    for (const [address, problem] of INVALID.filter(([, p]) => p !== "empty")) {
      const result = flight.safeParse(flightInput(address));
      expect(result.success, address).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) => i.path.join(".") === "email");
        expect(issue?.message, address).toContain("Please enter a valid email address");
        if (problem === "no_at") expect(issue?.message).toContain("@");
      }
    }
    expect(flight.safeParse(flightInput("")).success).toBe(false);
  });

  test("contact message: the email field uses the same rules", () => {
    const issues = (email: string) => {
      const result = contactMessageSchema.safeParse(contactInput(email));
      return result.success ? [] : result.error.issues.filter((i) => i.path.join(".") === "email");
    };
    expect(issues("name@example.com")).toHaveLength(0);
    expect(issues("name@example")[0]?.message).toContain("Please enter a valid email address.");
    expect(issues("a b@example.com")[0]?.message).toContain("Remove any spaces");
    expect(issues("")[0]?.message).toBe("Email address is required");
  });

  test("newsletter: the generic message is unchanged, and stricter cases are refused too", () => {
    expect(newsletterSchema.safeParse({ email: "name@example.com" }).success).toBe(true);
    expect(newsletterSchema.safeParse({ email: "name@example-.com" }).success).toBe(false);
    const bad = newsletterSchema.safeParse({ email: "nope" });
    expect(!bad.success && bad.error.issues[0].message).toBe("Enter a valid email address");
  });
});
