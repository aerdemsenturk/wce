import { NextResponse, type NextRequest } from "next/server";
import {
  addCategoryMembership,
  clearCategorySitelink,
  createCategoryFromSelection,
  getCategoryChildren,
  getCategoryParents,
  getCategoryFiles,
  getCategoryGrid,
  getCategoryCoverImage,
  getCategoryPreviewThumbs,
  getCategoryWikidataNote,
  moveCategoryMembership,
  removeCategoryMembership,
  renameCategory,
  searchCategories,
  setCategorySitelink,
} from "@/lib/mediawiki";
import { isLocale, defaultLocale } from "@/i18n/config";
import { isLoginConfigured, refreshSessionIfNeeded } from "@/lib/session";

// Server-side proxy for read-only Commons category calls.
// GET /api/commons/category?op=children&category=Lycian%20Way&lang=tr
// GET /api/commons/category?op=files&category=Lycian%20Way
// GET /api/commons/category?op=search&query=Istanbul
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const op = searchParams.get("op") ?? "children";

  if (op === "search") {
    const query = searchParams.get("query")?.trim();
    if (!query) return NextResponse.json({ results: [] });
    try {
      const results = await searchCategories(query);
      return NextResponse.json({ results });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upstream error";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

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
    if (op === "parents") {
      const parents = await getCategoryParents(category, lang);
      return NextResponse.json({ category, parents });
    }
    if (op === "files") {
      const files = await getCategoryFiles(category);
      return NextResponse.json({ category, files });
    }
    if (op === "grid") {
      const files = await getCategoryGrid(category, lang);
      return NextResponse.json({ category, files });
    }
    if (op === "preview") {
      const thumbs = await getCategoryPreviewThumbs(category);
      return NextResponse.json({ category, thumbs });
    }
    if (op === "cover") {
      const url = await getCategoryCoverImage(category);
      return NextResponse.json({ category, url });
    }
    if (op === "wikidataNote") {
      const qid = await getCategoryWikidataNote(category);
      return NextResponse.json({ category, qid });
    }
    return NextResponse.json({ error: `Unknown op '${op}'` }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upstream error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

// v2 write path: move a file/subcategory's parent category (drag-and-drop),
// or rename a category outright.
// PATCH /api/commons/category  { op: "move", pageTitle, fromCategory, toCategory }
// PATCH /api/commons/category  { op: "rename", oldName, newName }
export async function PATCH(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    op?: string;
    pageTitle?: string;
    fromCategory?: string;
    toCategory?: string;
    oldName?: string;
    newName?: string;
    category?: string;
    wikidataQid?: string | null;
  } | null;

  let token: string | undefined;
  if (isLoginConfigured()) {
    const session = await refreshSessionIfNeeded();
    if (!session) return NextResponse.json({ error: "auth_required" }, { status: 401 });
    token = session.accessToken;
  }

  try {
    if (body?.op === "removeCategory") {
      const pageTitle = body.pageTitle?.trim();
      const category = body.category?.trim();
      if (!pageTitle || !category) {
        return NextResponse.json(
          { error: "Missing 'pageTitle' or 'category'" },
          { status: 400 },
        );
      }
      await removeCategoryMembership(pageTitle, category, token);
      return NextResponse.json({ ok: true });
    }

    if (body?.op === "addCategory") {
      const pageTitle = body.pageTitle?.trim();
      const category = body.category?.trim();
      if (!pageTitle || !category) {
        return NextResponse.json(
          { error: "Missing 'pageTitle' or 'category'" },
          { status: 400 },
        );
      }
      await addCategoryMembership(pageTitle, category, token);
      return NextResponse.json({ ok: true });
    }

    if (body?.op === "rename") {
      const oldName = body.oldName?.trim();
      const newName = body.newName?.trim();
      if (!oldName || !newName) {
        return NextResponse.json(
          { error: "Missing 'oldName' or 'newName'" },
          { status: 400 },
        );
      }
      // A same-name "rename" can arrive when the edit modal is used purely to
      // set/change the Wikidata QID — skip the move (Commons rejects a
      // self-move, which would otherwise also block the Wikidata update below).
      const result =
        oldName === newName
          ? { moved: [], failed: [] }
          : await renameCategory(oldName, newName, token);

      let wikidataError: string | undefined;
      if (body.wikidataQid !== undefined) {
        const qid = body.wikidataQid?.trim() || null;
        try {
          if (qid) await setCategorySitelink(newName, qid, token);
          else await clearCategorySitelink(newName, token);
        } catch (err) {
          wikidataError = err instanceof Error ? err.message : "Wikidata update failed";
        }
      }

      return NextResponse.json({ ...result, wikidataError });
    }

    const pageTitle = body?.pageTitle?.trim();
    const fromCategory = body?.fromCategory?.trim();
    const toCategory = body?.toCategory?.trim();
    if (!pageTitle || !fromCategory || !toCategory) {
      return NextResponse.json(
        { error: "Missing 'pageTitle', 'fromCategory', or 'toCategory'" },
        { status: 400 },
      );
    }
    await moveCategoryMembership(pageTitle, fromCategory, toCategory, token);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upstream error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

// v2 write path: create a new category from a multi-selection (merge action).
// POST /api/commons/category  { name, parent, fileTitles, wikidataQid? }
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    name?: string;
    parent?: string;
    fileTitles?: string[];
    wikidataQid?: string;
  } | null;

  const name = body?.name?.trim();
  const parent = body?.parent?.trim();
  const fileTitles = Array.isArray(body?.fileTitles) ? body!.fileTitles : [];

  if (!name || !parent) {
    return NextResponse.json(
      { error: "Missing 'name' or 'parent'" },
      { status: 400 },
    );
  }

  let token: string | undefined;
  if (isLoginConfigured()) {
    const session = await refreshSessionIfNeeded();
    if (!session) return NextResponse.json({ error: "auth_required" }, { status: 401 });
    token = session.accessToken;
  }

  try {
    const result = await createCategoryFromSelection(
      name,
      parent,
      fileTitles,
      body?.wikidataQid?.trim() || null,
      token,
    );
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upstream error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
