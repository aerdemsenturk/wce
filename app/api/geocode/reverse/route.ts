import { NextResponse, type NextRequest } from "next/server";
import { isLocale, defaultLocale } from "@/i18n/config";

const USER_AGENT =
  "WikimediaCommonsEditor/0.1 (https://github.com/; read-only browser)";

// Server-side proxy for Nominatim reverse geocoding so we can send a proper
// User-Agent (required by the Nominatim usage policy) and an Accept-Language.
// GET /api/geocode/reverse?lat=36.5&lon=29.1&lang=tr
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const lat = searchParams.get("lat");
  const lon = searchParams.get("lon");
  const langParam = searchParams.get("lang") ?? undefined;
  const lang = isLocale(langParam) ? langParam : defaultLocale;

  if (!lat || !lon) {
    return NextResponse.json(
      { error: "Missing 'lat'/'lon' parameter" },
      { status: 400 },
    );
  }

  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("lat", lat);
    url.searchParams.set("lon", lon);
    url.searchParams.set("format", "json");
    url.searchParams.set("zoom", "14");
    url.searchParams.set("addressdetails", "0");

    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": lang },
      next: { revalidate: 86400 }, // place names are stable; cache a day
    });
    if (!res.ok) {
      return NextResponse.json({ name: null });
    }
    const data = (await res.json()) as { display_name?: string };
    return NextResponse.json({ name: data.display_name ?? null });
  } catch {
    return NextResponse.json({ name: null });
  }
}
