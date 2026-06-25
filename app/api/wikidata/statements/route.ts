import { NextResponse, type NextRequest } from "next/server";
import {
  getWikidataItemStatements,
  addWikidataItemStatement,
  removeWikidataItemStatement,
} from "@/lib/mediawiki";
import { isLocale, defaultLocale } from "@/i18n/config";

// Read the curated statements off a category's Wikidata item.
// GET /api/wikidata/statements?qid=Q42&lang=tr
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const qid = searchParams.get("qid")?.trim();
  const langParam = searchParams.get("lang") ?? undefined;
  const lang = isLocale(langParam) ? langParam : defaultLocale;

  if (!qid || !/^Q\d+$/.test(qid)) {
    return NextResponse.json({ error: "Missing or invalid 'qid'" }, { status: 400 });
  }

  try {
    const data = await getWikidataItemStatements(qid, lang);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upstream error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

// v2 write path: add or remove an item-valued statement on a Wikidata item.
// PATCH /api/wikidata/statements  { op: "add", qid, property, valueQid }
// PATCH /api/wikidata/statements  { op: "remove", statementId }
export async function PATCH(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    op?: string;
    qid?: string;
    property?: string;
    valueQid?: string;
    statementId?: string;
  } | null;

  try {
    if (body?.op === "add") {
      const qid = body.qid?.trim();
      const property = body.property?.trim();
      const valueQid = body.valueQid?.trim();
      if (!qid || !property || !valueQid) {
        return NextResponse.json(
          { error: "Missing 'qid', 'property', or 'valueQid'" },
          { status: 400 },
        );
      }
      const result = await addWikidataItemStatement(qid, property, valueQid);
      return NextResponse.json(result);
    }

    if (body?.op === "remove") {
      const statementId = body.statementId?.trim();
      if (!statementId) {
        return NextResponse.json({ error: "Missing 'statementId'" }, { status: 400 });
      }
      await removeWikidataItemStatement(statementId);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: `Unknown op '${body?.op ?? ""}'` }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upstream error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
