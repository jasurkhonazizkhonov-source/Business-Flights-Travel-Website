import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { MAX_SUGGESTION_KM, distanceKm, isUsablePosition, nearestHub, type HubRow } from "../src/lib/airport-suggestion";
import { readFileSync } from "node:fs";
import { readVisitorHint } from "../src/lib/visitor-hint";
import hubsJson from "../src/data/airport-hubs.json";

// Picking the departure airport to SUGGEST from an approximate position: the nearest MAJOR commercial airport (the large class of the project's airport
// data), never a small airfield, and nothing at all when none is reasonably near. The coordinates below are real city-centre positions used only as
// test inputs; the expected airports are read from the project's own dataset, nothing is hard-coded as a "rule" for any city.

const hubs = hubsJson as unknown as HubRow[];
const root = path.resolve(__dirname, "..");

// The same two steps as suggestAirportNear (src/data/airports.ts): nearest hub, then its details from the full dataset. That function loads both JSON files
// with dynamic import(), which plain Node cannot do without import attributes, so it is exercised end to end through the real route in
// tests/visitor-hint-route.spec.ts; here the steps are repeated with the files read directly.
type Row = [iata: string, name: string, city: string, country: string, countryCode: string, continent: string, lat: number | null, lon: number | null];
const airports = JSON.parse(readFileSync(path.join(root, "src/data/airports.json"), "utf8")) as Row[];
async function suggestAirportNear(latitude: number, longitude: number) {
  const near = nearestHub(latitude, longitude, hubs);
  const row = near && airports.find((a) => a[0] === near.iata);
  return near && row ? { airport: { iata: row[0], name: row[1], city: row[2], country: row[3] }, distanceKm: near.distanceKm } : null;
}

// [label, latitude, longitude, expected IATA]
const CITIES: [string, number, number, string][] = [
  ["Frankfurt am Main", 50.11, 8.68, "FRA"],
  ["Munich", 48.14, 11.58, "MUC"],
  ["Hamburg", 53.55, 9.99, "HAM"],
  ["Berlin", 52.52, 13.4, "BER"],
  ["London (Westminster)", 51.5, -0.13, "LHR"],
  ["Paris (Notre-Dame)", 48.85, 2.35, "ORY"], // nearest large airport by distance; CDG is a few km further - the visitor can change it
  ["Dubai", 25.2, 55.27, "DXB"],
  ["Tashkent", 41.31, 69.28, "TAS"],
  ["Los Angeles (downtown)", 34.05, -118.24, "LAX"],
  // Nearest MAJOR airport by distance. Oakland is about 6 km nearer than San Francisco International to Union Square; the data has no passenger
  // volumes or route networks, so "the better-connected one" is not something this suggestion can know - the visitor can change it (documented limitation).
  ["San Francisco (Union Square)", 37.79, -122.41, "OAK"],
  ["Chicago (Loop)", 41.88, -87.63, "MDW"],
  ["Tokyo (Shinjuku)", 35.69, 139.7, "HND"],
  ["Sydney (CBD)", -33.87, 151.21, "SYD"],
];

test.describe("nearest suitable airport", () => {
  for (const [label, lat, lon, iata] of CITIES) {
    test(`${label} -> ${iata}`, async () => {
      const found = await suggestAirportNear(lat, lon);
      expect(found?.airport.iata).toBe(iata);
      // The airport's details come from the project's dataset: name, city and country are present and nothing is empty.
      expect(found?.airport.name.length).toBeGreaterThan(3);
      expect(found?.airport.city.length).toBeGreaterThan(1);
      expect(found?.airport.country.length).toBeGreaterThan(1);
      expect(found!.distanceKm).toBeLessThanOrEqual(MAX_SUGGESTION_KM);
    });
  }

  test("Würzburg (no major airport of its own): a suitable major airport by actual distance, not the Giebelstadt/Kitzingen airfields next door", async () => {
    // The two nearest airports in the whole dataset are military/small fields 16-19 km away; neither may be suggested. The nearest MAJOR one is
    // Nuremberg (about 87 km), then Frankfurt (about 103 km).
    const found = await suggestAirportNear(49.79, 9.95);
    expect(found?.airport.iata).toBe("NUE");
    expect(found!.distanceKm).toBeGreaterThan(70);
    expect(found!.distanceKm).toBeLessThan(110);
    for (const smallField of ["GHF", "KZG", "ILH"]) expect(hubs.some((h) => h[0] === smallField)).toBe(false);
  });

  test("a position between two cities gets whichever major airport is genuinely closer", () => {
    // Midway-ish between Frankfurt (FRA) and Köln/Bonn (CGN): just on the Frankfurt side, then just on the Köln side.
    expect(nearestHub(50.3, 8.2, hubs)?.iata).toBe("FRA");
    expect(nearestHub(50.6, 7.4, hubs)?.iata).toBe("CGN");
  });

  test("nothing is suggested when no major airport lies within the maximum distance, or the position is unusable", async () => {
    // Middle of the South Pacific, and the middle of the Sahara far from any large airport.
    expect(await suggestAirportNear(-30, -130)).toBeNull();
    expect(nearestHub(-30, -130, hubs)).toBeNull();
    // 0,0 ("null island") is a no-data placeholder, never a place.
    expect(await suggestAirportNear(0, 0)).toBeNull();
    for (const [lat, lon] of [[91, 0], [-91, 0], [0, 181], [0, -181], [Number.NaN, 5], [5, Number.NaN], [Number.POSITIVE_INFINITY, 0]] as [number, number][]) {
      expect(isUsablePosition(lat, lon)).toBe(false);
      expect(nearestHub(lat, lon, hubs)).toBeNull();
    }
    expect(isUsablePosition("50" as unknown, "8" as unknown)).toBe(false);
  });

  test("the limit is the documented 400 km and is applied to the distance", () => {
    expect(MAX_SUGGESTION_KM).toBe(400);
    const here: [number, number] = [50.0267, 8.5584]; // Frankfurt Airport itself
    expect(nearestHub(here[0], here[1], hubs)).toEqual({ iata: "FRA", distanceKm: 0 });
    // One hub only, 350 km and 450 km away: the nearer is suggested, the further is not.
    const oneHub: HubRow[] = [["ZZZ", 50.0267, 8.5584]];
    expect(nearestHub(50.0267 + 350 / 111.2, 8.5584, oneHub)?.iata).toBe("ZZZ");
    expect(nearestHub(50.0267 + 450 / 111.2, 8.5584, oneHub)).toBeNull();
  });

  test("distance is great-circle: a known pair (Frankfurt - Munich airports) is about 300 km", () => {
    const km = distanceKm(50.0267, 8.5584, 48.3538, 11.7861);
    expect(km).toBeGreaterThan(295);
    expect(km).toBeLessThan(310);
    expect(distanceKm(10, 10, 10, 10)).toBe(0);
    // Across the antimeridian: two points 2 degrees of longitude apart on either side of 180 are about 220 km apart, not 40,000.
    expect(distanceKm(0.5, 179, 0.5, -179)).toBeLessThan(230);
  });

  test("ties and order are deterministic (the earlier row wins)", () => {
    const twin: HubRow[] = [["AAA", 10, 10], ["BBB", 10, 10]];
    expect(nearestHub(10.1, 10, twin)?.iata).toBe("AAA");
  });
});

test.describe("the suggestion dataset", () => {
  test("it is current with the project's airport data (scripts/build-airport-hubs.mjs --check)", () => {
    const output = execFileSync(process.execPath, [path.join(root, "scripts/build-airport-hubs.mjs"), "--check"], { encoding: "utf8" });
    expect(output).toMatch(/is current/);
  });

  test("it holds large commercial airports, with real codes and coordinates taken from the project's dataset, and no small airfields", async () => {
    expect(hubs.length).toBeGreaterThan(1000);
    expect(hubs.length).toBeLessThan(1300);
    const seen = new Set<string>();
    for (const [iata, lat, lon] of hubs) {
      expect(iata).toMatch(/^[A-Z]{3}$/);
      expect(isUsablePosition(lat, lon)).toBe(true);
      expect(seen.has(iata), `duplicate ${iata}`).toBe(false);
      seen.add(iata);
    }
    for (const major of ["FRA", "MUC", "LHR", "JFK", "LAX", "DXB", "SIN", "HND", "CDG", "TAS", "SYD"]) expect(seen.has(major), major).toBe(true);
    for (const small of ["GHF", "KZG", "ILH", "AGB", "BFE", "LCY"]) expect(seen.has(small), small).toBe(false);
  });

  test("military-only air bases are excluded; civil airports that share a base keep their entry", async () => {
    const names = new Map(airports.map((a) => [a[0], a[1]]));
    for (const [iata] of hubs) {
      const name = names.get(iata)!;
      expect(/air ?base/i.test(name) && !/airport/i.test(name), `${iata} ${name}`).toBe(false);
    }
    expect(hubs.some((h) => h[0] === "DNA")).toBe(false); // Kadena Air Base
    expect(hubs.some((h) => h[0] === "BGW")).toBe(true); // Baghdad International Airport / New Al Muthana Air Base
  });
});

test.describe("what the server reads for the suggestion (src/lib/visitor-hint.ts)", () => {
  const withEnv = async <T>(proxy: string | undefined, run: () => T | Promise<T>): Promise<T> => {
    const before = process.env.TRUSTED_PROXY;
    if (proxy === undefined) delete process.env.TRUSTED_PROXY;
    else process.env.TRUSTED_PROXY = proxy;
    try {
      return await run();
    } finally {
      if (before === undefined) delete process.env.TRUSTED_PROXY;
      else process.env.TRUSTED_PROXY = before;
    }
  };
  const cfHeaders = () =>
    new Headers({ "cf-ipcountry": "DE", "cf-iplatitude": "50.1109", "cf-iplongitude": "8.6821", "cf-ipcity": "Frankfurt am Main", "cf-connecting-ip": "203.0.113.9" });

  test("behind Cloudflare: only the country is read; the IP address, city and position are not part of the result (the departure airport comes from the device, never from the network)", async () => {
    const hint = await withEnv("cloudflare", () => readVisitorHint(cfHeaders()));
    expect(hint).toEqual({ countryCode: "DE" });
    expect(JSON.stringify(hint)).not.toMatch(/203\.0\.113|Frankfurt|50\.1|8\.6|latitude|longitude/);
  });

  test("with no trusted proxy the Cloudflare headers are NOT believed (anyone could send them to an exposed origin)", async () => {
    expect(await withEnv(undefined, () => readVisitorHint(cfHeaders()))).toEqual({});
    expect(await withEnv("none", () => readVisitorHint(cfHeaders()))).toEqual({});
    expect(await withEnv("nginx", () => readVisitorHint(cfHeaders()))).toEqual({});
  });

  test("a country without a position gives no airport; junk and placeholder values are dropped", async () => {
    expect(await withEnv("cloudflare", () => readVisitorHint(new Headers({ "cf-ipcountry": "DE" })))).toEqual({ countryCode: "DE" });
    expect(await withEnv("cloudflare", () => readVisitorHint(new Headers({ "cf-ipcountry": "XX", "cf-iplatitude": "0", "cf-iplongitude": "0" })))).toEqual({});
    expect(await withEnv("cloudflare", () => readVisitorHint(new Headers({ "cf-ipcountry": "T1" })))).toEqual({});
    expect(await withEnv("cloudflare", () => readVisitorHint(new Headers({ "cf-ipcountry": "DE", "cf-iplatitude": "abc", "cf-iplongitude": "8.6" })))).toEqual({ countryCode: "DE" });
    expect(await withEnv("cloudflare", () => readVisitorHint(new Headers({ "cf-ipcountry": "DE", "cf-iplatitude": "95", "cf-iplongitude": "8.6" })))).toEqual({ countryCode: "DE" });
    expect(await withEnv("cloudflare", () => readVisitorHint(new Headers()))).toEqual({});
  });
});
