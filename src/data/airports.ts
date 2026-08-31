// Application-owned airport reference data — deliberately NOT sourced from
// PostgreSQL. The flight-request form's "departure"/"arrival" autocomplete
// used to query the CRM's shared `Airport` table directly
// (src/app/api/airports/search/route.ts, now removed). That table only
// happened to be populated in the specific Postgres instance used during
// development; the moment the site was pointed at a different/production
// database whose `Airport` table wasn't seeded the same way, every search
// silently returned zero results — no error, the dropdown just never
// appeared. See docs/ENVIRONMENT.md for the fuller explanation.
//
// This file exists so airport search works identically regardless of which
// PostgreSQL database `DATABASE_URL` points at, exactly like
// src/data/airlines.ts and src/data/destinations.ts already do for their
// own reference data. It's a curated list of major commercial/international
// airports — the ones a business-class traveler would actually search for —
// not an exhaustive world airport registry (tens of thousands of small
// regional/private airfields), which would be both unnecessary for this
// site's purpose and impractical to hand-maintain accurately.
//
// To add an airport: append an entry below, in the region it belongs to for
// readability. `iata` must be the real 3-letter IATA code, uppercase.
//
// `AirportOption` itself is re-exported from the Zod schema in
// lib/validations/flight-request.ts (the single source of truth for this
// shape, since that's also what validates form submissions server-side) —
// not redeclared here, to avoid two independent definitions drifting apart.
import type { AirportOption } from "@/lib/validations/flight-request";
export type { AirportOption };

export const AIRPORTS: AirportOption[] = [
  // --- United States -----------------------------------------------------
  { iata: "JFK", name: "John F. Kennedy International Airport", city: "New York", country: "United States" },
  { iata: "LGA", name: "LaGuardia Airport", city: "New York", country: "United States" },
  { iata: "EWR", name: "Newark Liberty International Airport", city: "Newark", country: "United States" },
  { iata: "LAX", name: "Los Angeles International Airport", city: "Los Angeles", country: "United States" },
  { iata: "ORD", name: "O'Hare International Airport", city: "Chicago", country: "United States" },
  { iata: "MDW", name: "Chicago Midway International Airport", city: "Chicago", country: "United States" },
  { iata: "ATL", name: "Hartsfield-Jackson Atlanta International Airport", city: "Atlanta", country: "United States" },
  { iata: "DFW", name: "Dallas/Fort Worth International Airport", city: "Dallas", country: "United States" },
  { iata: "DAL", name: "Dallas Love Field", city: "Dallas", country: "United States" },
  { iata: "DEN", name: "Denver International Airport", city: "Denver", country: "United States" },
  { iata: "SFO", name: "San Francisco International Airport", city: "San Francisco", country: "United States" },
  { iata: "OAK", name: "Oakland International Airport", city: "Oakland", country: "United States" },
  { iata: "SJC", name: "San Jose International Airport", city: "San Jose", country: "United States" },
  { iata: "SEA", name: "Seattle-Tacoma International Airport", city: "Seattle", country: "United States" },
  { iata: "MIA", name: "Miami International Airport", city: "Miami", country: "United States" },
  { iata: "FLL", name: "Fort Lauderdale-Hollywood International Airport", city: "Fort Lauderdale", country: "United States" },
  { iata: "BOS", name: "Logan International Airport", city: "Boston", country: "United States" },
  { iata: "IAD", name: "Washington Dulles International Airport", city: "Washington", country: "United States" },
  { iata: "DCA", name: "Ronald Reagan Washington National Airport", city: "Washington", country: "United States" },
  { iata: "BWI", name: "Baltimore/Washington International Airport", city: "Baltimore", country: "United States" },
  { iata: "PHX", name: "Phoenix Sky Harbor International Airport", city: "Phoenix", country: "United States" },
  { iata: "IAH", name: "George Bush Intercontinental Airport", city: "Houston", country: "United States" },
  { iata: "HOU", name: "William P. Hobby Airport", city: "Houston", country: "United States" },
  { iata: "MSP", name: "Minneapolis-Saint Paul International Airport", city: "Minneapolis", country: "United States" },
  { iata: "DTW", name: "Detroit Metropolitan Airport", city: "Detroit", country: "United States" },
  { iata: "PHL", name: "Philadelphia International Airport", city: "Philadelphia", country: "United States" },
  { iata: "LAS", name: "Harry Reid International Airport", city: "Las Vegas", country: "United States" },
  { iata: "MCO", name: "Orlando International Airport", city: "Orlando", country: "United States" },
  { iata: "CLT", name: "Charlotte Douglas International Airport", city: "Charlotte", country: "United States" },
  { iata: "SAN", name: "San Diego International Airport", city: "San Diego", country: "United States" },
  { iata: "TPA", name: "Tampa International Airport", city: "Tampa", country: "United States" },
  { iata: "PDX", name: "Portland International Airport", city: "Portland", country: "United States" },
  { iata: "STL", name: "St. Louis Lambert International Airport", city: "St. Louis", country: "United States" },
  { iata: "SLC", name: "Salt Lake City International Airport", city: "Salt Lake City", country: "United States" },
  { iata: "AUS", name: "Austin-Bergstrom International Airport", city: "Austin", country: "United States" },
  { iata: "RDU", name: "Raleigh-Durham International Airport", city: "Raleigh", country: "United States" },
  { iata: "BNA", name: "Nashville International Airport", city: "Nashville", country: "United States" },
  { iata: "MSY", name: "Louis Armstrong New Orleans International Airport", city: "New Orleans", country: "United States" },
  { iata: "SMF", name: "Sacramento International Airport", city: "Sacramento", country: "United States" },
  { iata: "RSW", name: "Southwest Florida International Airport", city: "Fort Myers", country: "United States" },
  { iata: "CVG", name: "Cincinnati/Northern Kentucky International Airport", city: "Cincinnati", country: "United States" },
  { iata: "PIT", name: "Pittsburgh International Airport", city: "Pittsburgh", country: "United States" },
  { iata: "CLE", name: "Cleveland Hopkins International Airport", city: "Cleveland", country: "United States" },
  { iata: "IND", name: "Indianapolis International Airport", city: "Indianapolis", country: "United States" },
  { iata: "CMH", name: "John Glenn Columbus International Airport", city: "Columbus", country: "United States" },
  { iata: "KCI", name: "Kansas City International Airport", city: "Kansas City", country: "United States" },
  { iata: "MCI", name: "Kansas City International Airport", city: "Kansas City", country: "United States" },
  { iata: "SAT", name: "San Antonio International Airport", city: "San Antonio", country: "United States" },
  { iata: "JAX", name: "Jacksonville International Airport", city: "Jacksonville", country: "United States" },
  { iata: "MKE", name: "Milwaukee Mitchell International Airport", city: "Milwaukee", country: "United States" },
  { iata: "OMA", name: "Eppley Airfield", city: "Omaha", country: "United States" },
  { iata: "OGG", name: "Kahului Airport", city: "Maui", country: "United States" },
  { iata: "HNL", name: "Daniel K. Inouye International Airport", city: "Honolulu", country: "United States" },
  { iata: "ANC", name: "Ted Stevens Anchorage International Airport", city: "Anchorage", country: "United States" },
  { iata: "ABQ", name: "Albuquerque International Sunport", city: "Albuquerque", country: "United States" },
  { iata: "BUF", name: "Buffalo Niagara International Airport", city: "Buffalo", country: "United States" },

  // --- Canada --------------------------------------------------------------
  { iata: "YYZ", name: "Toronto Pearson International Airport", city: "Toronto", country: "Canada" },
  { iata: "YTZ", name: "Billy Bishop Toronto City Airport", city: "Toronto", country: "Canada" },
  { iata: "YVR", name: "Vancouver International Airport", city: "Vancouver", country: "Canada" },
  { iata: "YUL", name: "Montreal-Trudeau International Airport", city: "Montreal", country: "Canada" },
  { iata: "YYC", name: "Calgary International Airport", city: "Calgary", country: "Canada" },
  { iata: "YOW", name: "Ottawa Macdonald-Cartier International Airport", city: "Ottawa", country: "Canada" },
  { iata: "YEG", name: "Edmonton International Airport", city: "Edmonton", country: "Canada" },
  { iata: "YWG", name: "Winnipeg James Armstrong Richardson International Airport", city: "Winnipeg", country: "Canada" },
  { iata: "YHZ", name: "Halifax Stanfield International Airport", city: "Halifax", country: "Canada" },
  { iata: "YQB", name: "Quebec City Jean Lesage International Airport", city: "Quebec City", country: "Canada" },

  // --- Mexico, Central America & Caribbean ---------------------------------
  { iata: "MEX", name: "Mexico City International Airport", city: "Mexico City", country: "Mexico" },
  { iata: "NLU", name: "Felipe Ángeles International Airport", city: "Mexico City", country: "Mexico" },
  { iata: "CUN", name: "Cancún International Airport", city: "Cancún", country: "Mexico" },
  { iata: "GDL", name: "Guadalajara International Airport", city: "Guadalajara", country: "Mexico" },
  { iata: "MTY", name: "Monterrey International Airport", city: "Monterrey", country: "Mexico" },
  { iata: "PVR", name: "Puerto Vallarta International Airport", city: "Puerto Vallarta", country: "Mexico" },
  { iata: "SJD", name: "Los Cabos International Airport", city: "Los Cabos", country: "Mexico" },
  { iata: "SJO", name: "Juan Santamaría International Airport", city: "San José", country: "Costa Rica" },
  { iata: "PTY", name: "Tocumen International Airport", city: "Panama City", country: "Panama" },
  { iata: "GUA", name: "La Aurora International Airport", city: "Guatemala City", country: "Guatemala" },
  { iata: "SAL", name: "El Salvador International Airport", city: "San Salvador", country: "El Salvador" },
  { iata: "HAV", name: "José Martí International Airport", city: "Havana", country: "Cuba" },
  { iata: "NAS", name: "Lynden Pindling International Airport", city: "Nassau", country: "Bahamas" },
  { iata: "MBJ", name: "Sangster International Airport", city: "Montego Bay", country: "Jamaica" },
  { iata: "KIN", name: "Norman Manley International Airport", city: "Kingston", country: "Jamaica" },
  { iata: "PUJ", name: "Punta Cana International Airport", city: "Punta Cana", country: "Dominican Republic" },
  { iata: "SDQ", name: "Las Américas International Airport", city: "Santo Domingo", country: "Dominican Republic" },
  { iata: "SJU", name: "Luis Muñoz Marín International Airport", city: "San Juan", country: "Puerto Rico" },
  { iata: "AUA", name: "Queen Beatrix International Airport", city: "Aruba", country: "Aruba" },
  { iata: "BGI", name: "Grantley Adams International Airport", city: "Bridgetown", country: "Barbados" },

  // --- South America ---------------------------------------------------
  { iata: "GRU", name: "São Paulo/Guarulhos International Airport", city: "São Paulo", country: "Brazil" },
  { iata: "CGH", name: "Congonhas Airport", city: "São Paulo", country: "Brazil" },
  { iata: "GIG", name: "Rio de Janeiro/Galeão International Airport", city: "Rio de Janeiro", country: "Brazil" },
  { iata: "SDU", name: "Santos Dumont Airport", city: "Rio de Janeiro", country: "Brazil" },
  { iata: "BSB", name: "Brasília International Airport", city: "Brasília", country: "Brazil" },
  { iata: "CNF", name: "Belo Horizonte International Airport", city: "Belo Horizonte", country: "Brazil" },
  { iata: "SSA", name: "Salvador International Airport", city: "Salvador", country: "Brazil" },
  { iata: "REC", name: "Recife/Guararapes International Airport", city: "Recife", country: "Brazil" },
  { iata: "FOR", name: "Fortaleza Airport", city: "Fortaleza", country: "Brazil" },
  { iata: "EZE", name: "Ministro Pistarini International Airport", city: "Buenos Aires", country: "Argentina" },
  { iata: "AEP", name: "Jorge Newbery Airfield", city: "Buenos Aires", country: "Argentina" },
  { iata: "COR", name: "Córdoba International Airport", city: "Córdoba", country: "Argentina" },
  { iata: "SCL", name: "Arturo Merino Benítez International Airport", city: "Santiago", country: "Chile" },
  { iata: "LIM", name: "Jorge Chávez International Airport", city: "Lima", country: "Peru" },
  { iata: "CUZ", name: "Alejandro Velasco Astete International Airport", city: "Cusco", country: "Peru" },
  { iata: "BOG", name: "El Dorado International Airport", city: "Bogotá", country: "Colombia" },
  { iata: "MDE", name: "José María Córdova International Airport", city: "Medellín", country: "Colombia" },
  { iata: "CTG", name: "Rafael Núñez International Airport", city: "Cartagena", country: "Colombia" },
  { iata: "UIO", name: "Mariscal Sucre International Airport", city: "Quito", country: "Ecuador" },
  { iata: "GYE", name: "José Joaquín de Olmedo International Airport", city: "Guayaquil", country: "Ecuador" },
  { iata: "CCS", name: "Simón Bolívar International Airport", city: "Caracas", country: "Venezuela" },
  { iata: "MVD", name: "Carrasco International Airport", city: "Montevideo", country: "Uruguay" },
  { iata: "ASU", name: "Silvio Pettirossi International Airport", city: "Asunción", country: "Paraguay" },
  { iata: "LPB", name: "El Alto International Airport", city: "La Paz", country: "Bolivia" },
  { iata: "VVI", name: "Viru Viru International Airport", city: "Santa Cruz", country: "Bolivia" },

  // --- United Kingdom & Ireland --------------------------------------------
  { iata: "LHR", name: "Heathrow Airport", city: "London", country: "United Kingdom" },
  { iata: "LGW", name: "Gatwick Airport", city: "London", country: "United Kingdom" },
  { iata: "STN", name: "Stansted Airport", city: "London", country: "United Kingdom" },
  { iata: "LTN", name: "Luton Airport", city: "London", country: "United Kingdom" },
  { iata: "LCY", name: "London City Airport", city: "London", country: "United Kingdom" },
  { iata: "MAN", name: "Manchester Airport", city: "Manchester", country: "United Kingdom" },
  { iata: "EDI", name: "Edinburgh Airport", city: "Edinburgh", country: "United Kingdom" },
  { iata: "GLA", name: "Glasgow Airport", city: "Glasgow", country: "United Kingdom" },
  { iata: "BHX", name: "Birmingham Airport", city: "Birmingham", country: "United Kingdom" },
  { iata: "BRS", name: "Bristol Airport", city: "Bristol", country: "United Kingdom" },
  { iata: "LPL", name: "Liverpool John Lennon Airport", city: "Liverpool", country: "United Kingdom" },
  { iata: "NCL", name: "Newcastle International Airport", city: "Newcastle", country: "United Kingdom" },
  { iata: "BFS", name: "Belfast International Airport", city: "Belfast", country: "United Kingdom" },
  { iata: "DUB", name: "Dublin Airport", city: "Dublin", country: "Ireland" },
  { iata: "ORK", name: "Cork Airport", city: "Cork", country: "Ireland" },
  { iata: "SNN", name: "Shannon Airport", city: "Shannon", country: "Ireland" },

  // --- Western & Southern Europe -------------------------------------------
  { iata: "CDG", name: "Charles de Gaulle Airport", city: "Paris", country: "France" },
  { iata: "ORY", name: "Orly Airport", city: "Paris", country: "France" },
  { iata: "NCE", name: "Nice Côte d'Azur Airport", city: "Nice", country: "France" },
  { iata: "LYS", name: "Lyon-Saint Exupéry Airport", city: "Lyon", country: "France" },
  { iata: "MRS", name: "Marseille Provence Airport", city: "Marseille", country: "France" },
  { iata: "TLS", name: "Toulouse-Blagnac Airport", city: "Toulouse", country: "France" },
  { iata: "BOD", name: "Bordeaux-Mérignac Airport", city: "Bordeaux", country: "France" },
  { iata: "FRA", name: "Frankfurt Airport", city: "Frankfurt", country: "Germany" },
  { iata: "MUC", name: "Munich Airport", city: "Munich", country: "Germany" },
  { iata: "BER", name: "Berlin Brandenburg Airport", city: "Berlin", country: "Germany" },
  { iata: "HAM", name: "Hamburg Airport", city: "Hamburg", country: "Germany" },
  { iata: "DUS", name: "Düsseldorf Airport", city: "Düsseldorf", country: "Germany" },
  { iata: "CGN", name: "Cologne Bonn Airport", city: "Cologne", country: "Germany" },
  { iata: "STR", name: "Stuttgart Airport", city: "Stuttgart", country: "Germany" },
  { iata: "AMS", name: "Amsterdam Airport Schiphol", city: "Amsterdam", country: "Netherlands" },
  { iata: "RTM", name: "Rotterdam The Hague Airport", city: "Rotterdam", country: "Netherlands" },
  { iata: "BRU", name: "Brussels Airport", city: "Brussels", country: "Belgium" },
  { iata: "ANR", name: "Antwerp International Airport", city: "Antwerp", country: "Belgium" },
  { iata: "ZRH", name: "Zurich Airport", city: "Zurich", country: "Switzerland" },
  { iata: "GVA", name: "Geneva Airport", city: "Geneva", country: "Switzerland" },
  { iata: "BSL", name: "EuroAirport Basel-Mulhouse-Freiburg", city: "Basel", country: "Switzerland" },
  { iata: "VIE", name: "Vienna International Airport", city: "Vienna", country: "Austria" },
  { iata: "SZG", name: "Salzburg Airport", city: "Salzburg", country: "Austria" },
  { iata: "MXP", name: "Milan Malpensa Airport", city: "Milan", country: "Italy" },
  { iata: "LIN", name: "Milan Linate Airport", city: "Milan", country: "Italy" },
  { iata: "BGY", name: "Il Caravaggio International Airport", city: "Bergamo", country: "Italy" },
  { iata: "FCO", name: "Leonardo da Vinci-Fiumicino Airport", city: "Rome", country: "Italy" },
  { iata: "CIA", name: "Ciampino Airport", city: "Rome", country: "Italy" },
  { iata: "VCE", name: "Venice Marco Polo Airport", city: "Venice", country: "Italy" },
  { iata: "NAP", name: "Naples International Airport", city: "Naples", country: "Italy" },
  { iata: "BLQ", name: "Bologna Guglielmo Marconi Airport", city: "Bologna", country: "Italy" },
  { iata: "FLR", name: "Florence Airport", city: "Florence", country: "Italy" },
  { iata: "PSA", name: "Pisa International Airport", city: "Pisa", country: "Italy" },
  { iata: "TRN", name: "Turin Airport", city: "Turin", country: "Italy" },
  { iata: "CTA", name: "Catania-Fontanarossa Airport", city: "Catania", country: "Italy" },
  { iata: "PMO", name: "Palermo Airport", city: "Palermo", country: "Italy" },
  { iata: "MAD", name: "Adolfo Suárez Madrid-Barajas Airport", city: "Madrid", country: "Spain" },
  { iata: "BCN", name: "Barcelona-El Prat Airport", city: "Barcelona", country: "Spain" },
  { iata: "PMI", name: "Palma de Mallorca Airport", city: "Palma de Mallorca", country: "Spain" },
  { iata: "AGP", name: "Málaga-Costa del Sol Airport", city: "Málaga", country: "Spain" },
  { iata: "VLC", name: "Valencia Airport", city: "Valencia", country: "Spain" },
  { iata: "SVQ", name: "Seville Airport", city: "Seville", country: "Spain" },
  { iata: "BIO", name: "Bilbao Airport", city: "Bilbao", country: "Spain" },
  { iata: "IBZ", name: "Ibiza Airport", city: "Ibiza", country: "Spain" },
  { iata: "LPA", name: "Gran Canaria Airport", city: "Las Palmas", country: "Spain" },
  { iata: "TFS", name: "Tenerife South Airport", city: "Tenerife", country: "Spain" },
  { iata: "LIS", name: "Humberto Delgado Airport", city: "Lisbon", country: "Portugal" },
  { iata: "OPO", name: "Francisco Sá Carneiro Airport", city: "Porto", country: "Portugal" },
  { iata: "FAO", name: "Faro Airport", city: "Faro", country: "Portugal" },
  { iata: "FNC", name: "Madeira Airport", city: "Funchal", country: "Portugal" },
  { iata: "LUX", name: "Luxembourg Airport", city: "Luxembourg City", country: "Luxembourg" },
  { iata: "MLA", name: "Malta International Airport", city: "Valletta", country: "Malta" },
  { iata: "MC1", name: "Monaco Heliport", city: "Monaco", country: "Monaco" },

  // --- Nordics & Baltics ----------------------------------------------------
  { iata: "CPH", name: "Copenhagen Airport", city: "Copenhagen", country: "Denmark" },
  { iata: "ARN", name: "Stockholm Arlanda Airport", city: "Stockholm", country: "Sweden" },
  { iata: "BMA", name: "Stockholm Bromma Airport", city: "Stockholm", country: "Sweden" },
  { iata: "GOT", name: "Göteborg Landvetter Airport", city: "Gothenburg", country: "Sweden" },
  { iata: "OSL", name: "Oslo Airport, Gardermoen", city: "Oslo", country: "Norway" },
  { iata: "BGO", name: "Bergen Airport, Flesland", city: "Bergen", country: "Norway" },
  { iata: "TRD", name: "Trondheim Airport, Værnes", city: "Trondheim", country: "Norway" },
  { iata: "HEL", name: "Helsinki-Vantaa Airport", city: "Helsinki", country: "Finland" },
  { iata: "TLL", name: "Lennart Meri Tallinn Airport", city: "Tallinn", country: "Estonia" },
  { iata: "RIX", name: "Riga International Airport", city: "Riga", country: "Latvia" },
  { iata: "VNO", name: "Vilnius Airport", city: "Vilnius", country: "Lithuania" },
  { iata: "KEF", name: "Keflavík International Airport", city: "Reykjavík", country: "Iceland" },

  // --- Central & Eastern Europe ---------------------------------------------
  { iata: "WAW", name: "Warsaw Chopin Airport", city: "Warsaw", country: "Poland" },
  { iata: "KRK", name: "Kraków John Paul II International Airport", city: "Kraków", country: "Poland" },
  { iata: "GDN", name: "Gdańsk Lech Wałęsa Airport", city: "Gdańsk", country: "Poland" },
  { iata: "PRG", name: "Václav Havel Airport Prague", city: "Prague", country: "Czech Republic" },
  { iata: "BUD", name: "Budapest Ferenc Liszt International Airport", city: "Budapest", country: "Hungary" },
  { iata: "OTP", name: "Henri Coandă International Airport", city: "Bucharest", country: "Romania" },
  { iata: "SOF", name: "Sofia Airport", city: "Sofia", country: "Bulgaria" },
  { iata: "BEG", name: "Belgrade Nikola Tesla Airport", city: "Belgrade", country: "Serbia" },
  { iata: "ZAG", name: "Zagreb Airport", city: "Zagreb", country: "Croatia" },
  { iata: "SPU", name: "Split Airport", city: "Split", country: "Croatia" },
  { iata: "DBV", name: "Dubrovnik Airport", city: "Dubrovnik", country: "Croatia" },
  { iata: "LJU", name: "Ljubljana Jože Pučnik Airport", city: "Ljubljana", country: "Slovenia" },
  { iata: "BTS", name: "M. R. Štefánik Airport", city: "Bratislava", country: "Slovakia" },
  { iata: "ATH", name: "Athens International Airport", city: "Athens", country: "Greece" },
  { iata: "SKG", name: "Thessaloniki Airport", city: "Thessaloniki", country: "Greece" },
  { iata: "HER", name: "Heraklion International Airport", city: "Heraklion", country: "Greece" },
  { iata: "JTR", name: "Santorini (Thira) National Airport", city: "Santorini", country: "Greece" },
  { iata: "JMK", name: "Mykonos Airport", city: "Mykonos", country: "Greece" },
  { iata: "RHO", name: "Rhodes International Airport", city: "Rhodes", country: "Greece" },
  { iata: "LCA", name: "Larnaca International Airport", city: "Larnaca", country: "Cyprus" },
  { iata: "SVO", name: "Sheremetyevo International Airport", city: "Moscow", country: "Russia" },
  { iata: "DME", name: "Domodedovo International Airport", city: "Moscow", country: "Russia" },
  { iata: "VKO", name: "Vnukovo International Airport", city: "Moscow", country: "Russia" },
  { iata: "LED", name: "Pulkovo Airport", city: "St. Petersburg", country: "Russia" },

  // --- Middle East ----------------------------------------------------------
  { iata: "DXB", name: "Dubai International Airport", city: "Dubai", country: "United Arab Emirates" },
  { iata: "DWC", name: "Al Maktoum International Airport", city: "Dubai", country: "United Arab Emirates" },
  { iata: "AUH", name: "Zayed International Airport", city: "Abu Dhabi", country: "United Arab Emirates" },
  { iata: "SHJ", name: "Sharjah International Airport", city: "Sharjah", country: "United Arab Emirates" },
  { iata: "DOH", name: "Hamad International Airport", city: "Doha", country: "Qatar" },
  { iata: "KWI", name: "Kuwait International Airport", city: "Kuwait City", country: "Kuwait" },
  { iata: "BAH", name: "Bahrain International Airport", city: "Manama", country: "Bahrain" },
  { iata: "RUH", name: "King Khalid International Airport", city: "Riyadh", country: "Saudi Arabia" },
  { iata: "JED", name: "King Abdulaziz International Airport", city: "Jeddah", country: "Saudi Arabia" },
  { iata: "DMM", name: "King Fahd International Airport", city: "Dammam", country: "Saudi Arabia" },
  { iata: "MED", name: "Prince Mohammad Bin Abdulaziz Airport", city: "Medina", country: "Saudi Arabia" },
  { iata: "MCT", name: "Muscat International Airport", city: "Muscat", country: "Oman" },
  { iata: "AMM", name: "Queen Alia International Airport", city: "Amman", country: "Jordan" },
  { iata: "BEY", name: "Beirut-Rafic Hariri International Airport", city: "Beirut", country: "Lebanon" },
  { iata: "TLV", name: "Ben Gurion Airport", city: "Tel Aviv", country: "Israel" },
  { iata: "IST", name: "Istanbul Airport", city: "Istanbul", country: "Turkey" },
  { iata: "SAW", name: "Istanbul Sabiha Gökçen Airport", city: "Istanbul", country: "Turkey" },
  { iata: "AYT", name: "Antalya Airport", city: "Antalya", country: "Turkey" },
  { iata: "ESB", name: "Esenboğa International Airport", city: "Ankara", country: "Turkey" },
  { iata: "ADB", name: "Adnan Menderes Airport", city: "Izmir", country: "Turkey" },

  // --- Africa -----------------------------------------------------------
  { iata: "CAI", name: "Cairo International Airport", city: "Cairo", country: "Egypt" },
  { iata: "HRG", name: "Hurghada International Airport", city: "Hurghada", country: "Egypt" },
  { iata: "SSH", name: "Sharm El Sheikh International Airport", city: "Sharm El Sheikh", country: "Egypt" },
  { iata: "CMN", name: "Mohammed V International Airport", city: "Casablanca", country: "Morocco" },
  { iata: "RAK", name: "Marrakesh Menara Airport", city: "Marrakesh", country: "Morocco" },
  { iata: "RBA", name: "Rabat-Salé Airport", city: "Rabat", country: "Morocco" },
  { iata: "TUN", name: "Tunis-Carthage International Airport", city: "Tunis", country: "Tunisia" },
  { iata: "ALG", name: "Houari Boumediene Airport", city: "Algiers", country: "Algeria" },
  { iata: "LOS", name: "Murtala Muhammed International Airport", city: "Lagos", country: "Nigeria" },
  { iata: "ABV", name: "Nnamdi Azikiwe International Airport", city: "Abuja", country: "Nigeria" },
  { iata: "ACC", name: "Kotoka International Airport", city: "Accra", country: "Ghana" },
  { iata: "DKR", name: "Blaise Diagne International Airport", city: "Dakar", country: "Senegal" },
  { iata: "ABJ", name: "Félix-Houphouët-Boigny International Airport", city: "Abidjan", country: "Ivory Coast" },
  { iata: "NBO", name: "Jomo Kenyatta International Airport", city: "Nairobi", country: "Kenya" },
  { iata: "MBA", name: "Moi International Airport", city: "Mombasa", country: "Kenya" },
  { iata: "ADD", name: "Addis Ababa Bole International Airport", city: "Addis Ababa", country: "Ethiopia" },
  { iata: "DAR", name: "Julius Nyerere International Airport", city: "Dar es Salaam", country: "Tanzania" },
  { iata: "ZNZ", name: "Abeid Amani Karume International Airport", city: "Zanzibar City", country: "Tanzania" },
  { iata: "EBB", name: "Entebbe International Airport", city: "Entebbe", country: "Uganda" },
  { iata: "KGL", name: "Kigali International Airport", city: "Kigali", country: "Rwanda" },
  { iata: "JNB", name: "OR Tambo International Airport", city: "Johannesburg", country: "South Africa" },
  { iata: "CPT", name: "Cape Town International Airport", city: "Cape Town", country: "South Africa" },
  { iata: "DUR", name: "King Shaka International Airport", city: "Durban", country: "South Africa" },
  { iata: "WDH", name: "Hosea Kutako International Airport", city: "Windhoek", country: "Namibia" },
  { iata: "GBE", name: "Sir Seretse Khama International Airport", city: "Gaborone", country: "Botswana" },
  { iata: "HRE", name: "Robert Gabriel Mugabe International Airport", city: "Harare", country: "Zimbabwe" },
  { iata: "LUN", name: "Kenneth Kaunda International Airport", city: "Lusaka", country: "Zambia" },
  { iata: "MRU", name: "Sir Seewoosagur Ramgoolam International Airport", city: "Port Louis", country: "Mauritius" },
  { iata: "SEZ", name: "Seychelles International Airport", city: "Victoria", country: "Seychelles" },
  { iata: "TNR", name: "Ivato International Airport", city: "Antananarivo", country: "Madagascar" },
  { iata: "LAD", name: "Quatro de Fevereiro Airport", city: "Luanda", country: "Angola" },

  // --- South Asia -----------------------------------------------------------
  { iata: "DEL", name: "Indira Gandhi International Airport", city: "Delhi", country: "India" },
  { iata: "BOM", name: "Chhatrapati Shivaji Maharaj International Airport", city: "Mumbai", country: "India" },
  { iata: "BLR", name: "Kempegowda International Airport", city: "Bengaluru", country: "India" },
  { iata: "MAA", name: "Chennai International Airport", city: "Chennai", country: "India" },
  { iata: "CCU", name: "Netaji Subhas Chandra Bose International Airport", city: "Kolkata", country: "India" },
  { iata: "HYD", name: "Rajiv Gandhi International Airport", city: "Hyderabad", country: "India" },
  { iata: "AMD", name: "Sardar Vallabhbhai Patel International Airport", city: "Ahmedabad", country: "India" },
  { iata: "COK", name: "Cochin International Airport", city: "Kochi", country: "India" },
  { iata: "GOI", name: "Goa International Airport (Dabolim)", city: "Goa", country: "India" },
  { iata: "GOX", name: "Manohar International Airport", city: "Goa", country: "India" },
  { iata: "PNQ", name: "Pune Airport", city: "Pune", country: "India" },
  { iata: "JAI", name: "Jaipur International Airport", city: "Jaipur", country: "India" },
  { iata: "LKO", name: "Chaudhary Charan Singh International Airport", city: "Lucknow", country: "India" },
  { iata: "IXC", name: "Chandigarh International Airport", city: "Chandigarh", country: "India" },
  { iata: "ISB", name: "Islamabad International Airport", city: "Islamabad", country: "Pakistan" },
  { iata: "KHI", name: "Jinnah International Airport", city: "Karachi", country: "Pakistan" },
  { iata: "LHE", name: "Allama Iqbal International Airport", city: "Lahore", country: "Pakistan" },
  { iata: "DAC", name: "Hazrat Shahjalal International Airport", city: "Dhaka", country: "Bangladesh" },
  { iata: "CMB", name: "Bandaranaike International Airport", city: "Colombo", country: "Sri Lanka" },
  { iata: "KTM", name: "Tribhuvan International Airport", city: "Kathmandu", country: "Nepal" },
  { iata: "MLE", name: "Velana International Airport", city: "Malé", country: "Maldives" },

  // --- Southeast Asia --------------------------------------------------------
  { iata: "SIN", name: "Singapore Changi Airport", city: "Singapore", country: "Singapore" },
  { iata: "KUL", name: "Kuala Lumpur International Airport", city: "Kuala Lumpur", country: "Malaysia" },
  { iata: "PEN", name: "Penang International Airport", city: "Penang", country: "Malaysia" },
  { iata: "BKI", name: "Kota Kinabalu International Airport", city: "Kota Kinabalu", country: "Malaysia" },
  { iata: "CGK", name: "Soekarno-Hatta International Airport", city: "Jakarta", country: "Indonesia" },
  { iata: "DPS", name: "Ngurah Rai International Airport", city: "Bali (Denpasar)", country: "Indonesia" },
  { iata: "SUB", name: "Juanda International Airport", city: "Surabaya", country: "Indonesia" },
  { iata: "BKK", name: "Suvarnabhumi Airport", city: "Bangkok", country: "Thailand" },
  { iata: "DMK", name: "Don Mueang International Airport", city: "Bangkok", country: "Thailand" },
  { iata: "HKT", name: "Phuket International Airport", city: "Phuket", country: "Thailand" },
  { iata: "CNX", name: "Chiang Mai International Airport", city: "Chiang Mai", country: "Thailand" },
  { iata: "USM", name: "Samui Airport", city: "Koh Samui", country: "Thailand" },
  { iata: "MNL", name: "Ninoy Aquino International Airport", city: "Manila", country: "Philippines" },
  { iata: "CEB", name: "Mactan-Cebu International Airport", city: "Cebu", country: "Philippines" },
  { iata: "SGN", name: "Tan Son Nhat International Airport", city: "Ho Chi Minh City", country: "Vietnam" },
  { iata: "HAN", name: "Noi Bai International Airport", city: "Hanoi", country: "Vietnam" },
  { iata: "DAD", name: "Da Nang International Airport", city: "Da Nang", country: "Vietnam" },
  { iata: "RGN", name: "Yangon International Airport", city: "Yangon", country: "Myanmar" },
  { iata: "PNH", name: "Phnom Penh International Airport", city: "Phnom Penh", country: "Cambodia" },
  { iata: "REP", name: "Siem Reap Angkor International Airport", city: "Siem Reap", country: "Cambodia" },
  { iata: "VTE", name: "Wattay International Airport", city: "Vientiane", country: "Laos" },
  { iata: "BWN", name: "Brunei International Airport", city: "Bandar Seri Begawan", country: "Brunei" },

  // --- East Asia -----------------------------------------------------------
  { iata: "HKG", name: "Hong Kong International Airport", city: "Hong Kong", country: "Hong Kong" },
  { iata: "TPE", name: "Taiwan Taoyuan International Airport", city: "Taipei", country: "Taiwan" },
  { iata: "TSA", name: "Taipei Songshan Airport", city: "Taipei", country: "Taiwan" },
  { iata: "KHH", name: "Kaohsiung International Airport", city: "Kaohsiung", country: "Taiwan" },
  { iata: "NRT", name: "Narita International Airport", city: "Tokyo", country: "Japan" },
  { iata: "HND", name: "Haneda Airport", city: "Tokyo", country: "Japan" },
  { iata: "KIX", name: "Kansai International Airport", city: "Osaka", country: "Japan" },
  { iata: "ITM", name: "Osaka International Airport (Itami)", city: "Osaka", country: "Japan" },
  { iata: "NGO", name: "Chubu Centrair International Airport", city: "Nagoya", country: "Japan" },
  { iata: "CTS", name: "New Chitose Airport", city: "Sapporo", country: "Japan" },
  { iata: "FUK", name: "Fukuoka Airport", city: "Fukuoka", country: "Japan" },
  { iata: "OKA", name: "Naha Airport", city: "Okinawa", country: "Japan" },
  { iata: "ICN", name: "Incheon International Airport", city: "Seoul", country: "South Korea" },
  { iata: "GMP", name: "Gimpo International Airport", city: "Seoul", country: "South Korea" },
  { iata: "PUS", name: "Gimhae International Airport", city: "Busan", country: "South Korea" },
  { iata: "CJU", name: "Jeju International Airport", city: "Jeju", country: "South Korea" },
  { iata: "PEK", name: "Beijing Capital International Airport", city: "Beijing", country: "China" },
  { iata: "PKX", name: "Beijing Daxing International Airport", city: "Beijing", country: "China" },
  { iata: "PVG", name: "Shanghai Pudong International Airport", city: "Shanghai", country: "China" },
  { iata: "SHA", name: "Shanghai Hongqiao International Airport", city: "Shanghai", country: "China" },
  { iata: "CAN", name: "Guangzhou Baiyun International Airport", city: "Guangzhou", country: "China" },
  { iata: "SZX", name: "Shenzhen Bao'an International Airport", city: "Shenzhen", country: "China" },
  { iata: "CTU", name: "Chengdu Shuangliu International Airport", city: "Chengdu", country: "China" },
  { iata: "TFU", name: "Chengdu Tianfu International Airport", city: "Chengdu", country: "China" },
  { iata: "XIY", name: "Xi'an Xianyang International Airport", city: "Xi'an", country: "China" },
  { iata: "HGH", name: "Hangzhou Xiaoshan International Airport", city: "Hangzhou", country: "China" },
  { iata: "NKG", name: "Nanjing Lukou International Airport", city: "Nanjing", country: "China" },
  { iata: "XMN", name: "Xiamen Gaoqi International Airport", city: "Xiamen", country: "China" },
  { iata: "KMG", name: "Kunming Changshui International Airport", city: "Kunming", country: "China" },
  { iata: "WUH", name: "Wuhan Tianhe International Airport", city: "Wuhan", country: "China" },
  { iata: "CGO", name: "Zhengzhou Xinzheng International Airport", city: "Zhengzhou", country: "China" },
  { iata: "TAO", name: "Qingdao Jiaodong International Airport", city: "Qingdao", country: "China" },
  { iata: "MFM", name: "Macau International Airport", city: "Macau", country: "Macau" },
  { iata: "UB", name: "Chinggis Khaan International Airport", city: "Ulaanbaatar", country: "Mongolia" },

  // --- Central Asia & Caucasus ------------------------------------------------
  { iata: "TAS", name: "Islam Karimov Tashkent International Airport", city: "Tashkent", country: "Uzbekistan" },
  { iata: "ALA", name: "Almaty International Airport", city: "Almaty", country: "Kazakhstan" },
  { iata: "NQZ", name: "Astana International Airport", city: "Astana", country: "Kazakhstan" },
  { iata: "GYD", name: "Heydar Aliyev International Airport", city: "Baku", country: "Azerbaijan" },
  { iata: "TBS", name: "Tbilisi International Airport", city: "Tbilisi", country: "Georgia" },
  { iata: "EVN", name: "Zvartnots International Airport", city: "Yerevan", country: "Armenia" },

  // --- Oceania ---------------------------------------------------------------
  { iata: "SYD", name: "Sydney Kingsford Smith Airport", city: "Sydney", country: "Australia" },
  { iata: "MEL", name: "Melbourne Airport", city: "Melbourne", country: "Australia" },
  { iata: "BNE", name: "Brisbane Airport", city: "Brisbane", country: "Australia" },
  { iata: "PER", name: "Perth Airport", city: "Perth", country: "Australia" },
  { iata: "ADL", name: "Adelaide Airport", city: "Adelaide", country: "Australia" },
  { iata: "OOL", name: "Gold Coast Airport", city: "Gold Coast", country: "Australia" },
  { iata: "CNS", name: "Cairns Airport", city: "Cairns", country: "Australia" },
  { iata: "HBA", name: "Hobart Airport", city: "Hobart", country: "Australia" },
  { iata: "DRW", name: "Darwin International Airport", city: "Darwin", country: "Australia" },
  { iata: "CBR", name: "Canberra Airport", city: "Canberra", country: "Australia" },
  { iata: "AKL", name: "Auckland Airport", city: "Auckland", country: "New Zealand" },
  { iata: "WLG", name: "Wellington International Airport", city: "Wellington", country: "New Zealand" },
  { iata: "CHC", name: "Christchurch International Airport", city: "Christchurch", country: "New Zealand" },
  { iata: "ZQN", name: "Queenstown Airport", city: "Queenstown", country: "New Zealand" },
  { iata: "NAN", name: "Nadi International Airport", city: "Nadi", country: "Fiji" },
  { iata: "PPT", name: "Faa'a International Airport", city: "Papeete", country: "French Polynesia" },
  { iata: "NOU", name: "La Tontouta International Airport", city: "Nouméa", country: "New Caledonia" },
  { iata: "APW", name: "Faleolo International Airport", city: "Apia", country: "Samoa" },
  { iata: "POM", name: "Jacksons International Airport", city: "Port Moresby", country: "Papua New Guinea" },
  { iata: "GUM", name: "Antonio B. Won Pat International Airport", city: "Guam", country: "Guam" },
];

// Real-world queries a user actually types don't always match a "starts
// with" prefix (e.g. "Heathrow", "New York" for JFK/LGA/EWR) — the same
// `iata === query` / `city or name contains query` semantics the old
// DB-backed endpoint used, reimplemented as a plain in-memory filter.
// Exact IATA matches are sorted first, exactly matching prior behavior.
export function searchAirports(query: string, limit = 8): AirportOption[] {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const q = trimmed.toLowerCase();
  const qUpper = trimmed.toUpperCase();

  const matches = AIRPORTS.filter(
    (a) => a.iata === qUpper || a.city.toLowerCase().includes(q) || a.name.toLowerCase().includes(q),
  );

  matches.sort((a, b) => {
    const aExact = a.iata === qUpper ? 0 : 1;
    const bExact = b.iata === qUpper ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;
    return a.city.localeCompare(b.city);
  });

  return matches.slice(0, limit);
}

// Authoritative single-airport lookup by IATA code. Used server-side
// (server/actions/submit-flight-request.ts) to validate a submitted airport
// against this application-owned dataset — the same dataset the autocomplete
// offered it from in the first place — rather than trusting whatever a
// client submitted, and to source the canonical name/city/country when
// upserting the CRM's own `Airport` row for that code.
const airportsByIata = new Map(AIRPORTS.map((a) => [a.iata, a]));

export function findAirportByIata(iata: string): AirportOption | null {
  return airportsByIata.get(iata.toUpperCase()) ?? null;
}
