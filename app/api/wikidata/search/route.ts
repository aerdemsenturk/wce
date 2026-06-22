import { NextResponse, type NextRequest } from "next/server";
import { searchWikidataItems } from "@/lib/mediawiki";
import { isLocale, defaultLocale } from "@/i18n/config";

// Read-only proxy for Wikidata item search (add-depict autocomplete).
// GET /api/wikidata/search?q=cat&lang=tr
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const q = searchParams.get("q")?.trim();
  const langParam = searchParams.get("lang") ?? undefined;
  const lang = isLocale(langParam) ? langParam : defaultLocale;

  if (!q) {
    return NextResponse.json({ error: "Missing 'q' parameter" }, { status: 400 });
  }

  try {
    const results = await searchWikidataItems(q, lang);
    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upstream error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
