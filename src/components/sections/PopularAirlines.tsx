import { Reveal } from "@/components/Reveal";

const airlines = [
  { name: "Emirates", region: "Middle East", note: "Dubai-based, extensive long-haul network to Europe, Asia, and Africa" },
  { name: "Qatar Airways", region: "Middle East", note: "Doha-based, wide route network via its Hamad International hub" },
  { name: "Singapore Airlines", region: "Asia", note: "Singapore-based, long-haul service across Asia, Europe, and Oceania" },
  { name: "Cathay Pacific", region: "Asia", note: "Hong Kong-based, strong connections between Asia, Europe, and North America" },
  { name: "Japan Airlines / ANA", region: "Asia", note: "Tokyo-based carriers with extensive Asia-Pacific and long-haul networks" },
  { name: "Turkish Airlines", region: "Europe / Middle East", note: "Istanbul-based, one of the widest international route networks of any carrier" },
  { name: "British Airways", region: "Europe", note: "London-based, extensive transatlantic and long-haul network via Heathrow" },
  { name: "Lufthansa / Air France", region: "Europe", note: "Frankfurt/Munich and Paris-based, broad European and long-haul coverage" },
  { name: "Qantas", region: "Oceania", note: "Australia-based, key carrier for flights to and from Australia and New Zealand" },
  { name: "Etihad Airways", region: "Middle East", note: "Abu Dhabi-based, long-haul network connecting the Gulf to Europe, Asia, and beyond" },
];

export function PopularAirlines() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
      <Reveal>
        <p className="text-xs font-semibold tracking-[0.25em] text-[var(--color-gold-600)]">AIRLINES</p>
        <h2 className="mt-3 font-display text-2xl font-semibold text-[var(--color-navy-950)] sm:text-3xl">
          Airlines You May Fly With
        </h2>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-[var(--color-navy-950)]/70">
          Depending on your route and dates, your specialist may search fares across any of these carriers, among others.
          Business Flights Travel is an independent travel agency and is not affiliated with, partnered with, or endorsed by
          any airline named here — these are simply carriers commonly available on international business-class routes.
        </p>
      </Reveal>
      <div className="mt-8 grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
        {airlines.map((a, i) => (
          <Reveal key={a.name} delay={(i % 5) * 0.04}>
            <div className="flex items-baseline justify-between gap-4 border-b border-[var(--color-navy-950)]/8 pb-3">
              <div>
                <p className="font-display text-sm font-semibold text-[var(--color-navy-950)]">{a.name}</p>
                <p className="mt-0.5 text-xs text-[var(--color-navy-950)]/55">{a.note}</p>
              </div>
              <span className="shrink-0 text-xs text-[var(--color-navy-950)]/65">{a.region}</span>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
