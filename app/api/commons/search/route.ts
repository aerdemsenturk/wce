import { NextResponse, type NextRequest } from "next/server";
import { searchFiles } from "@/lib/mediawiki";
import { isLocale, defaultLocale } from "@/i18n/config";

// Read-only file search, optionally scoped to a category.
// GET /api/commons/search?q=goat&category=Lycian%20Way&lang=tr
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const q = searchParams.get("q")?.trim();
  const category = searchParams.get("category")?.trim() || null;
  const langParam = searchParams.get("lang") ?? undefined;
  const lang = isLocale(langParam) ? langParam : defaultLocale;

  if (!q) {
    return NextResponse.json(
      { error: "Missing 'q' parameter" },
      { status: 400 },
    );
  }

  try {
    const files = await searchFiles(q, category, lang);
    return NextResponse.json({ q, category, files });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upstream error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
