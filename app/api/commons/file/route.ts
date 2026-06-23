import { NextResponse, type NextRequest } from "next/server";
import {
  addDepict,
  editFileDescription,
  editFileLocation,
  removeFileLocation,
  getFileDetail,
  removeDepict,
} from "@/lib/mediawiki";
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

// v2 write path: patch a single language's description in place, add/remove
// a depicts (P180) statement on the file's Structured Data, or set the
// {{Location}} coordinates.
// PATCH /api/commons/file  { title, lang, value }
// PATCH /api/commons/file  { op: "addDepict", pageid, qid }
// PATCH /api/commons/file  { op: "removeDepict", statementId }
// PATCH /api/commons/file  { op: "location", title, lat, lon }
// PATCH /api/commons/file  { op: "removeLocation", title }
export async function PATCH(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    op?: string;
    title?: string;
    lang?: string;
    value?: string;
    pageid?: number;
    qid?: string;
    statementId?: string;
    lat?: number;
    lon?: number;
  } | null;

  try {
    if (body?.op === "addDepict") {
      if (typeof body.pageid !== "number" || !body.qid?.trim()) {
        return NextResponse.json(
          { error: "Missing 'pageid' or 'qid'" },
          { status: 400 },
        );
      }
      const result = await addDepict(body.pageid, body.qid.trim());
      return NextResponse.json(result);
    }

    if (body?.op === "removeDepict") {
      const statementId = body.statementId?.trim();
      if (!statementId) {
        return NextResponse.json(
          { error: "Missing 'statementId'" },
          { status: 400 },
        );
      }
      await removeDepict(statementId);
      return NextResponse.json({ ok: true });
    }

    if (body?.op === "location") {
      const locationTitle = body.title?.trim();
      if (
        !locationTitle ||
        typeof body.lat !== "number" ||
        typeof body.lon !== "number"
      ) {
        return NextResponse.json(
          { error: "Missing 'title', 'lat', or 'lon'" },
          { status: 400 },
        );
      }
      await editFileLocation(locationTitle, body.lat, body.lon);
      return NextResponse.json({ ok: true });
    }

    if (body?.op === "removeLocation") {
      const locationTitle = body.title?.trim();
      if (!locationTitle) {
        return NextResponse.json({ error: "Missing 'title'" }, { status: 400 });
      }
      await removeFileLocation(locationTitle);
      return NextResponse.json({ ok: true });
    }

    const title = body?.title?.trim();
    const lang = body?.lang?.trim();
    const value = body?.value;
    if (!title || !lang || typeof value !== "string") {
      return NextResponse.json(
        { error: "Missing 'title', 'lang', or 'value'" },
        { status: 400 },
      );
    }
    await editFileDescription(title, lang, value);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upstream error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
