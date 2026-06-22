import { NextResponse, type NextRequest } from "next/server";
import {
  getCategoryChildren,
  getCategoryFiles,
  getCategoryGrid,
} from "@/lib/mediawiki";
import { isLocale, defaultLocale } from "@/i18n/config";

// Server-side proxy for read-only Commons category calls.
// GET /api/commons/category?op=children&category=Lycian%20Way&lang=tr
// GET /api/commons/category?op=files&category=Lycian%20Way
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const op = searchParams.get("op") ?? "children";
  const category = searchParams.get("category")?.trim();
  const langParam = searchParams.get("lang") ?? undefined;
  const lang = isLocale(langParam) ? langParam : defaultLocale;

  if (!category) {
    return NextResponse.json(
      { error: "Missing 'category' parameter" },
      { status: 400 },
    );
  }

  try {
    if (op === "children") {
      const data = await getCategoryChildren(category, lang);
      return NextResponse.json(data);
    }
    if (op === "files") {
      const files = await getCategoryFiles(category);
      return NextResponse.json({ category, files });
    }
    if (op === "grid") {
      const files = await getCategoryGrid(category, lang);
      return NextResponse.json({ category, files });
    }
    return NextResponse.json({ error: `Unknown op '${op}'` }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upstream error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
