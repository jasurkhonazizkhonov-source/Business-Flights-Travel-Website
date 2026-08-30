import { Reveal } from "@/components/Reveal";
import { SITE_NAME } from "@/lib/constants";

const faqs = [
  {
    question: "How do I request a business-class flight?",
    answer:
      "Fill out the flight request form with your route, dates, cabin class, and contact details. There's no payment at this stage — a travel specialist reviews your request and follows up with options that actually fit what you asked for.",
  },
  {
    question: "Can you help with international business-class flights?",
    answer:
      "International and long-haul routes are what we focus on. Most requests we handle are business or first class to a destination outside the United States.",
  },
  {
    question: "Do you offer one-way and round-trip flights?",
    answer: "Yes — the request form supports one-way, round-trip, and multi-city itineraries.",
  },
  {
    question: "Can you help with multi-city itineraries?",
    answer:
      "Yes. Choose \"Multi-City\" on the request form and add each flight segment individually, so the full itinerary reaches your specialist in one request.",
  },
  {
    question: "Can I request First Class?",
    answer:
      "Yes, where the route and budget support it. First class is offered by a smaller number of airlines on select long-haul routes — your specialist will tell you what's realistically available.",
  },
  {
    question: "How quickly will someone respond to my request?",
    answer:
      "Requests are typically reviewed the same business day. Complex or last-minute itineraries can take a little longer while a specialist checks live availability across airlines.",
  },
  {
    question: "Can I request a specific airline?",
    answer:
      "Yes — there's a preferred-airline field on the request form. We'll search that carrier first and let you know if another option offers meaningfully better availability or value.",
  },
  {
    question: "Can I choose my preferred departure airport?",
    answer: "Yes. Enter your preferred departure airport on the request form, and your specialist searches from there.",
  },
  {
    question: "Are the prices shown guaranteed?",
    answer:
      "No — starting fares shown on the site are indicative and vary by departure city, travel dates, airline, routing, and fare availability. Your specialist confirms an actual, current fare before you book anything.",
  },
  {
    question: "Can you help with complex international itineraries?",
    answer:
      "Yes, that's a large part of what we do — multi-city routing, mixed cabins across segments, and connections through specific hubs are all things a specialist can work through with you.",
  },
  {
    question: "What information do I need to provide?",
    answer:
      "Your route, travel dates, cabin class, passenger count, and contact details. Anything else — a preferred airline, a budget, seat preferences — is optional but helps your specialist narrow down options faster.",
  },
  {
    question: "My travel dates are flexible — can you search around that?",
    answer:
      "Yes. Check \"My dates are flexible\" on the request form and mention your acceptable date range in the notes — a wider window often finds better business-class availability and pricing than a single fixed date.",
  },
  {
    question: "How does payment work?",
    answer:
      "Submitting a request never charges anything. Once your specialist confirms a fare you want to book, they'll walk you through the exact payment method, timing, and any applicable fees before you're asked to pay — you'll see the full fare and fare rules first.",
  },
  {
    question: "What if I need to change or cancel a booking?",
    answer:
      "Change and cancellation rules depend on the specific fare you buy — some business-class tickets allow free changes, others are more restricted. Your specialist explains the applicable rules before you book, and stays your point of contact if you need to change or cancel afterward.",
  },
  {
    question: "Do you handle corporate or business travel accounts?",
    answer:
      "Yes — corporate travel is one of our core focus areas, for both one-off trips and organizations that book internationally on a recurring basis. Select \"Corporate Travel\" on the contact form to reach the right specialist.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({
    "@type": "Question",
    name: f.question,
    acceptedAnswer: { "@type": "Answer", text: f.answer },
  })),
};

export function HomeFAQ() {
  return (
    <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <Reveal>
        <p className="text-xs font-semibold tracking-[0.25em] text-[var(--color-gold-600)]">QUESTIONS</p>
        <h2 className="mt-3 font-display text-2xl font-semibold text-[var(--color-navy-950)] sm:text-3xl">
          Frequently Asked Questions
        </h2>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-[var(--color-navy-950)]/70">
          Common questions about requesting a flight through {SITE_NAME}. Don&apos;t see yours?{" "}
          <a href="/contact" className="underline decoration-dotted underline-offset-2 hover:text-[var(--color-gold-600)]">
            Ask us directly
          </a>
          .
        </p>
      </Reveal>
      <div className="mt-8 space-y-3">
        {faqs.map((f, i) => (
          <Reveal key={f.question} delay={(i % 6) * 0.04}>
            <div className="rounded-xl bg-[var(--color-cream-100)] p-5">
              <h3 className="font-display text-base font-semibold text-[var(--color-navy-950)]">{f.question}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-navy-950)]/70">{f.answer}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
