import { test, expect } from "@playwright/test";
import { jsonLd } from "../src/lib/json-ld";

// src/lib/json-ld.ts serialises every inline <script type="application/ld+json">. Plain JSON.stringify leaves
// "<" untouched, so a string value containing "</script>" would close the element early.
test.describe("jsonLd", () => {
  test("never emits a raw '<', so a value cannot close the script element or open a comment", () => {
    const out = jsonLd({ name: "</script><script>alert(1)</script>", note: "<!-- x -->" });
    expect(out).not.toContain("<");
    expect(out.toLowerCase()).not.toContain("</script");
  });

  test("round-trips: JSON.parse of the output equals the input", () => {
    const input = { "@context": "https://schema.org", "@type": "Question", name: "Is 5 < 7 & 7 > 5?", nested: { list: ["a<b", "c>d", "ü — “quoted”"] } };
    expect(JSON.parse(jsonLd(input))).toEqual(input);
  });

  test("leaves ordinary structured data byte-identical to JSON.stringify", () => {
    const input = { "@type": "TravelAgency", name: "Business Flights Travel", telephone: "+14155709267", url: "https://www.businessflights.travel" };
    expect(jsonLd(input)).toBe(JSON.stringify(input));
  });
});
