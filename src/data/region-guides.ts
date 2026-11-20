import type { Region } from "@/data/destinations";

// Editorial introductions for the region hub pages (src/app/destinations/[region]/page.tsx). Deliberately general: they describe how flying from the United
// States to the region usually works, with hedges ("usually", "commonly") and nothing that can go stale - no schedules, no named nonstop routes, no
// prices, no lounge or product claims. Anything city-specific lives on the city pages, where it is either verified (with sources and a date) or absent.

export type RegionGuide = {
  /** Two short paragraphs shown under the hub's heading. */
  intro: [string, string];
  /** Slugs of articles that genuinely cover this region, shown as "planning guides" (the general guides are always added). */
  guideSlugs: string[];
};

export const REGION_GUIDES: Partial<Record<Region, RegionGuide>> = {
  europe: {
    intro: [
      "Europe is the region where a business-class traveller from the United States usually has the widest choice. Major European hubs are served by a mix of U.S., European and Gulf carriers, so there are often several routings and cabins to compare, and many cities can be reached with a single connection. Which routing is best depends on where you start and when you travel.",
      "Choose a country below to see its destinations. Each destination page covers the airport, the best time to visit and the carriers commonly operating there. Fares on those pages are indicative starting points; your specialist confirms real availability and prices when preparing your quote.",
    ],
    guideSlugs: ["planning-a-business-class-trip-to-europe"],
  },
  asia: {
    intro: [
      "Flights from the United States to Asia are long, so the cabin you fly in matters more than on shorter routes, and many itineraries connect at a hub in Asia, Europe or the Gulf rather than flying nonstop. The time-zone difference is large too, which makes arrival timing and jet lag part of the decision, not an afterthought.",
      "Choose a country below to see its destinations. Each destination page covers the airport, the best time to visit and the carriers commonly operating there; your specialist confirms current routings, cabins and prices when preparing your quote.",
    ],
    guideSlugs: ["business-class-flights-to-asia-planning", "business-class-flights-to-japan", "how-to-reduce-jet-lag-business-travel"],
  },
  africa: {
    intro: [
      "Long-haul connections between the United States and Africa are usually routed through a European or Gulf hub, with nonstop service to some cities only. Because the routing changes the journey more than the cabin does, the useful comparison is usually total travel time, the length of the connection and how baggage is handled at the connecting airport.",
      "Choose a country below to see its destinations. Each destination page covers the airport, the best time to visit and the carriers commonly operating there; your specialist confirms current routings and prices when preparing your quote.",
    ],
    guideSlugs: ["business-class-flights-to-africa"],
  },
  "middle-east": {
    intro: [
      "The Middle East is both a set of destinations in its own right and the home of the Gulf hubs that many travellers use to connect onward to Asia, Africa and the Indian Ocean. Several of the region's airlines are known for their business-class cabins, which is a reason some travellers choose a connection there even when a nonstop exists.",
      "Choose a country below to see its destinations. Each destination page covers the airport, the best time to visit and the carriers commonly operating there; your specialist confirms current routings, cabins and prices when preparing your quote.",
    ],
    guideSlugs: ["business-class-flights-to-the-middle-east", "business-class-flights-to-dubai"],
  },
  oceania: {
    intro: [
      "Flights between the United States and Australia or New Zealand are among the longest scheduled services in the world, so a lie-flat seat is often the main reason travellers pay for business class on these routes. Routings commonly use a U.S. West Coast or Pacific gateway, or a connection in Asia.",
      "Choose a country below to see its destinations. Each destination page covers the airport, the best time to visit and the carriers commonly operating there; your specialist confirms current routings, cabins and prices when preparing your quote.",
    ],
    guideSlugs: ["how-to-sleep-better-on-long-haul-business-class", "how-to-reduce-jet-lag-business-travel"],
  },
};

/** Articles every region hub offers as general reading, after the region's own guides. */
export const GENERAL_REGION_GUIDE_SLUGS = ["how-to-choose-the-right-business-class-flight", "when-to-book-international-business-class"];
