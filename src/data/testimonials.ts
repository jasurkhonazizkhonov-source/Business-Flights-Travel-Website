// Real customer testimonials go here once they exist — {quote, name,
// context} objects. Deliberately empty: no fabricated names, companies, job
// titles, star ratings, or quotes. See src/components/sections/Testimonials.tsx,
// which is built to render this array cleanly whenever it's populated and to
// point to Trustpilot in the meantime rather than inventing content to fill
// the space.
export type Testimonial = {
  quote: string;
  name: string;
  context: string; // e.g. "Business-class, London" — never a fabricated job title or company
};

export const testimonials: Testimonial[] = [];
