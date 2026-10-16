import type { Destination } from "@/data/destinations";

// Many destination records were generated from a template: the `overview` is the
// tagline plus the first two "why visit" bullets joined together, and the routing
// paragraphs are one shared sentence with the city and airport code swapped in.
// Showing those as separate sections repeats the same sentence two or three times on
// ONE page (tagline in the hero, again in the overview, again as a bullet) and the
// same routing paragraph across ~100 pages. These helpers recognise exactly that
// pattern — nothing else — so the page can show each piece of information once and
// leave out text that adds nothing. They never invent or rewrite content.

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** True when `overview` is exactly tagline + bullet 1 + ", and " + bullet 2 — i.e. no information beyond the hero tagline and the bullet list. */
export function overviewIsRedundant(d: Pick<Destination, "tagline" | "overview" | "whyVisit">): boolean {
  const [first, second] = d.whyVisit;
  if (!first || !second) return false;
  const tagline = d.tagline.trim();
  if (!d.overview.startsWith(tagline)) return false;
  const rest = d.overview.slice(tagline.length).trim().replace(/\.$/, "");
  return rest === `${first}, and ${lowerFirst(second)}`;
}

/** The shared "Routing from the United States to X (CODE) typically connects through a major …" paragraph. */
export function isGenericFlyingFromUS(d: Pick<Destination, "city" | "iata" | "flyingFromUS">): boolean {
  return d.flyingFromUS.startsWith(`Routing from the United States to ${d.city} (${d.iata}) typically connects through a major`);
}

/** The shared "Total travel time to CODE depends on your departure city …" paragraph. */
export function isGenericWhatToExpect(d: Pick<Destination, "iata" | "whatToExpect">): boolean {
  return d.whatToExpect.startsWith(`Total travel time to ${d.iata} depends on your departure city`);
}

/** Sentence shown ONCE, in place of the two shared paragraphs, when both are the template text. */
export const SHARED_ROUTING_NOTE =
  "Routing and total travel time depend on your departure city and dates. Once you tell us where you are starting from, your specialist compares nonstop and connecting options, and the cabin on each segment.";
