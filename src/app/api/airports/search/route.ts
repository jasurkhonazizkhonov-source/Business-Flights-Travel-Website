import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

// Read-only typeahead against the CRM's existing, pre-seeded Airport table
// (~9k rows). No secrets involved, but still rate-limited per IP against
// scripted scraping of the whole table via many single-letter queries.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { allowed } = checkRateLimit(`airport-search:${ip}`, 120);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  if (q.length < 2 || q.length > 100) {
    return NextResponse.json({ results: [] });
  }

  try {
    const results = await prisma.airport.findMany({
      where: {
        OR: [
          { iata: { equals: q.toUpperCase() } },
          { city: { contains: q, mode: "insensitive" } },
          { name: { contains: q, mode: "insensitive" } },
        ],
      },
      select: { iata: true, name: true, city: true, country: true },
      take: 8,
      orderBy: [{ city: "asc" }],
    });

    // Exact IATA matches first, then everything else in the DB's own order.
    results.sort((a, b) => {
      const aExact = a.iata.toUpperCase() === q.toUpperCase() ? 0 : 1;
      const bExact = b.iata.toUpperCase() === q.toUpperCase() ? 0 : 1;
      return aExact - bExact;
    });

    return NextResponse.json({ results });
  } catch (err) {
    // Never leak DB/driver errors to the client — the autocomplete just
    // degrades to "no results" rather than surfacing anything technical.
    console.error("[airports/search] failed", err);
    return NextResponse.json({ results: [] }, { status: 503 });
  }
}
