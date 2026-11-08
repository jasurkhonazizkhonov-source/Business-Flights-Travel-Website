// Serialises structured data for an inline <script type="application/ld+json">.
//
// JSON.stringify leaves "<" as is, so any string value containing "</script>" (or "<!--") would end the script
// element early and turn the rest of the value into live markup. Every value rendered through here is first-party
// content today (src/data/*, src/lib/constants.ts) and none of it contains such a sequence, so this is a guard for
// future edits and for any later user- or CMS-supplied text, not a fix for a known exploit. "<" is a valid JSON
// escape, so search engines and JSON.parse read exactly the same data (Next.js documents this same replacement).
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
