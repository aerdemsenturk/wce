import { NextResponse, type NextRequest } from "next/server";
import { getFileDetail } from "@/lib/mediawiki";
import { isLocale, defaultLocale } from "@/i18n/config";

// Server-side proxy for read-only Commons file detail.
// GET /api/commons/file?title=File:Foo.jpg&lang=tr
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const title = searchParams.get("title")?.trim();
  const langParam = searchParams.get("lang") ?? undefined;
  const lang = isLocale(langParam) ? langParam : defaultLocale;

  if (!title) {
    return NextResponse.json(
      { error: "Missing 'title' parameter" },
      { status: 400 },
    );
  }

  try {
    const detail = await getFileDetail(title, lang);
    if (!detail) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upstream error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
