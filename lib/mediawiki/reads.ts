import type {
  CategoryChildren,
  CategoryFile,
  CategoryFileInfo,
  CategoryWikidata,
  Depict,
  FileDetail,
  FileStatus,
  Subcategory,
} from "../types";
import { stripCategoryPrefix, withCategoryPrefix } from "../category";
import { upstreamReadCache } from "../serverCache";
import { parseInformation, stripHtml } from "../wikitext";
import { apiGet, COMMONS_API, type Params } from "./client";
import {
  fetchWikidataLabelAndDescription,
  fetchWikidataLabels,
} from "./wikidata";

interface CategoryMember {
  pageid: number;
  title: string;
  timestamp?: string;
}

interface CategoryInfo {
  files?: number;
  subcats?: number;
  wikibaseItem?: string;
}

interface QueryPage {
  title: string;
  missing?: boolean;
  categoryinfo?: CategoryInfo;
  pageprops?: { wikibase_item?: string };
}

/**
 * Run a paginated `generator=...` query and collect each returned page's
 * categoryinfo (file/subcat counts) + Wikidata item. The generator delivers
 * the category listing and its per-page info in one request, replacing the
 * previous list-titles-then-batch-info round trips. Prop data can arrive
 * split across continuation batches, so pages are merged by title.
 */
async function collectCategoryInfoPages(
  params: Params,
): Promise<Map<string, CategoryInfo>> {
  const result = new Map<string, CategoryInfo>();
  let cont: Record<string, string> | undefined;

  do {
    const data = (await apiGet(
      COMMONS_API,
      {
        action: "query",
        prop: "categoryinfo|pageprops",
        ppprop: "wikibase_item",
        ...params,
        ...(cont ?? {}),
      },
      { noStore: true },
    )) as {
      query?: { pages?: QueryPage[] };
      continue?: Record<string, string>;
    };

    for (const page of data.query?.pages ?? []) {
      const existing = result.get(page.title);
      result.set(page.title, {
        ...existing,
        ...page.categoryinfo,
        wikibaseItem: page.pageprops?.wikibase_item ?? existing?.wikibaseItem,
      });
    }
    cont = data.continue;
  } while (cont);

  return result;
}

/** Resolve Wikidata labels for a collected info map and shape it into the
 * sorted `Subcategory[]` both the children and parents listings return. */
async function subcategoriesFromInfo(
  infoMap: Map<string, CategoryInfo>,
  lang: string,
): Promise<Subcategory[]> {
  const qids = [
    ...new Set(
      [...infoMap.values()]
        .map((info) => info.wikibaseItem)
        .filter((id): id is string => id != null),
    ),
  ];
  const labels = await fetchWikidataLabels(qids, lang);

  return [...infoMap.entries()]
    .map(([title, info]) => {
      const qid = info.wikibaseItem ?? null;
      return {
        title,
        name: stripCategoryPrefix(title),
        files: info.files ?? null,
        subcats: info.subcats ?? null,
        wikidata: qid ? { id: qid, label: labels.get(qid) ?? null } : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Wikidata item + file count for a single category. */
export async function fetchCategoryMeta(category: string): Promise<{
  files: number | null;
  wikibaseItem: string | null;
}> {
  const data = (await apiGet(
    COMMONS_API,
    {
      action: "query",
      titles: withCategoryPrefix(category),
      prop: "categoryinfo|pageprops",
      ppprop: "wikibase_item",
    },
    { noStore: true },
  )) as { query?: { pages?: QueryPage[] } };

  const page = data.query?.pages?.[0];
  return {
    files: page?.categoryinfo?.files ?? null,
    wikibaseItem: page?.pageprops?.wikibase_item ?? null,
  };
}

interface DepictSnak {
  snaktype?: string;
  datavalue?: { value?: { id?: string } };
}
interface DepictStatement {
  id?: string; // claim GUID
  mainsnak?: DepictSnak;
  rank?: string;
}

/** Read depicts (P180) statements for many files' Structured Data in one
 * claims read (wbgetentities takes up to 50 M-ids) plus one label pass over
 * the union of depicted items. Keyed by pageid; files without SDC get []. */
async function getDepictsBatch(
  pageids: number[],
  lang: string,
): Promise<Map<number, Depict[]>> {
  const out = new Map<number, Depict[]>();
  if (pageids.length === 0) return out;

  const data = (await apiGet(COMMONS_API, {
    action: "wbgetentities",
    ids: pageids.map((id) => `M${id}`).join("|"),
    props: "claims",
  })) as {
    entities?: Record<
      string,
      {
        statements?: Record<string, DepictStatement[]>;
        claims?: Record<string, DepictStatement[]>;
      }
    >;
  };

  const entriesByPage = new Map<number, { id: string; statementId: string }[]>();
  const allQids = new Set<string>();
  for (const pageid of pageids) {
    const entity = data.entities?.[`M${pageid}`];
    const statements = entity?.statements ?? entity?.claims;
    const p180 = statements?.P180 ?? [];

    const entries: { id: string; statementId: string }[] = [];
    for (const st of p180) {
      if (st.mainsnak?.snaktype !== "value") continue;
      const id = st.mainsnak.datavalue?.value?.id;
      if (id && st.id && !entries.some((e) => e.id === id)) {
        entries.push({ id, statementId: st.id });
        allQids.add(id);
      }
    }
    entriesByPage.set(pageid, entries);
  }

  const labels = await fetchWikidataLabels([...allQids], lang);
  for (const [pageid, entries] of entriesByPage) {
    out.set(
      pageid,
      entries.map((e) => ({
        id: e.id,
        label: labels.get(e.id) ?? null,
        statementId: e.statementId,
      })),
    );
  }
  return out;
}

/** Drop every cached upstream read (children/parents/grid pages, any
 * language) for a category. Exposed for route handlers that know about an
 * affected category the write function itself can't see — e.g. the parent
 * listing a rename happened under. */
export function invalidateCategoryCache(category: string): void {
  upstreamReadCache.invalidateCategory(category);
}

/** Everything the sidebar needs to render one category's children. Served
 * from the shared upstream cache; write paths invalidate their categories so
 * the next read is guaranteed fresh (the reason these reads used to bypass
 * caching entirely with noStore). */
export async function getCategoryChildren(
  category: string,
  lang: string,
): Promise<CategoryChildren> {
  return upstreamReadCache.get("children", category, [lang], () =>
    getCategoryChildrenUncached(category, lang),
  );
}

async function getCategoryChildrenUncached(
  category: string,
  lang: string,
): Promise<CategoryChildren> {
  const normalized = withCategoryPrefix(category);

  const [infoMap, meta] = await Promise.all([
    collectCategoryInfoPages({
      generator: "categorymembers",
      gcmtitle: normalized,
      gcmtype: "subcat",
      gcmlimit: 500,
    }),
    fetchCategoryMeta(normalized),
  ]);

  // The subcategory labels and the category's own label/description hit
  // different Wikidata entities — resolve them concurrently.
  const [subcategories, ownLabels] = await Promise.all([
    subcategoriesFromInfo(infoMap, lang),
    meta.wikibaseItem
      ? fetchWikidataLabelAndDescription(meta.wikibaseItem, lang)
      : Promise.resolve(null),
  ]);

  let wikidata: CategoryWikidata | null = null;
  if (meta.wikibaseItem && ownLabels) {
    wikidata = {
      id: meta.wikibaseItem,
      label: ownLabels.label,
      description: ownLabels.description,
    };
  }

  return {
    category: normalized,
    subcategories,
    files: meta.files,
    wikidata,
  };
}

/**
 * Parent categories a category page is itself filed under (its own visible
 * `[[Category:...]]` links), enriched with the same file/subcat counts and
 * Wikidata badge as subcategories. Used by the sidebar to show a category's
 * ancestors above the tree root.
 */
export async function getCategoryParents(
  category: string,
  lang: string,
): Promise<Subcategory[]> {
  return upstreamReadCache.get("parents", category, [lang], () =>
    getCategoryParentsUncached(category, lang),
  );
}

async function getCategoryParentsUncached(
  category: string,
  lang: string,
): Promise<Subcategory[]> {
  const infoMap = await collectCategoryInfoPages({
    generator: "categories",
    titles: withCategoryPrefix(category),
    gclshow: "!hidden",
    gcllimit: 500,
  });

  if (infoMap.size === 0) return [];
  return subcategoriesFromInfo(infoMap, lang);
}

interface ExtMetaValue {
  value?: string;
}
type ExtMetadata = Record<string, ExtMetaValue>;

interface ImageInfo {
  url?: string;
  descriptionurl?: string;
  thumburl?: string;
  thumbwidth?: number;
  thumbheight?: number;
  size?: number;
  mediatype?: string;
  timestamp?: string;
  extmetadata?: ExtMetadata;
}

export interface ImageInfoPage {
  pageid: number;
  title: string;
  index?: number; // relevance order in search results
  imageinfo?: ImageInfo[];
}

/** Non-empty trimmed extmetadata value, or undefined. */
function metaValue(ext: ExtMetadata | undefined, key: string): string | undefined {
  const raw = ext?.[key]?.value;
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function deriveStatus(ext: ExtMetadata | undefined): FileStatus {
  return {
    description: metaValue(ext, "ImageDescription") !== undefined,
    date:
      metaValue(ext, "DateTimeOriginal") !== undefined ||
      metaValue(ext, "DateTime") !== undefined,
    author:
      metaValue(ext, "Artist") !== undefined ||
      metaValue(ext, "Credit") !== undefined,
    license:
      metaValue(ext, "LicenseShortName") !== undefined ||
      metaValue(ext, "License") !== undefined ||
      metaValue(ext, "UsageTerms") !== undefined,
    location:
      metaValue(ext, "GPSLatitude") !== undefined &&
      metaValue(ext, "GPSLongitude") !== undefined,
  };
}

/** Map one imageinfo page (from a generator query) to a grid file. */
export function toCategoryFileInfo(page: ImageInfoPage): CategoryFileInfo {
  const info = page.imageinfo?.[0];
  const ext = info?.extmetadata;
  const status = deriveStatus(ext);
  const missingCount = Object.values(status).filter((v) => !v).length;
  const year = info?.timestamp
    ? new Date(info.timestamp).getUTCFullYear()
    : null;

  return {
    pageid: page.pageid,
    title: page.title,
    name: page.title.replace(/^File:/i, ""),
    descriptionUrl:
      info?.descriptionurl ??
      `https://commons.wikimedia.org/wiki/${encodeURIComponent(
        page.title.replace(/ /g, "_"),
      )}`,
    thumbUrl: info?.thumburl ?? null,
    thumbWidth: info?.thumbwidth ?? null,
    thumbHeight: info?.thumbheight ?? null,
    size: info?.size ?? null,
    mediatype: info?.mediatype ?? null,
    uploadYear: Number.isFinite(year as number) ? year : null,
    status,
    missingCount,
  };
}

export const IMAGEINFO_PROPS = {
  prop: "imageinfo",
  iiprop: "url|size|mediatype|timestamp|extmetadata",
  iiurlwidth: 320,
} as const;

export interface CategoryGridPage {
  files: CategoryFileInfo[];
  /** Opaque continuation token for the next page, null on the last one. */
  continueToken: string | null;
}

/**
 * One page of a category's grid listing — 50 files, the API's cap when
 * thumbnails are requested. The client walks the continuation itself (see
 * getCategoryGridCached in lib/api.ts) so the first page can render while
 * the rest load, instead of the server chaining every continuation upstream
 * before responding at all.
 */
export async function getCategoryGridPage(
  category: string,
  lang: string,
  continueToken?: string,
): Promise<CategoryGridPage> {
  return upstreamReadCache.get("grid", category, [lang, continueToken ?? ""], () =>
    getCategoryGridPageUncached(category, lang, continueToken),
  );
}

async function getCategoryGridPageUncached(
  category: string,
  lang: string,
  continueToken?: string,
): Promise<CategoryGridPage> {
  // MediaWiki's continue record must be echoed back verbatim on the next
  // request; the token is that whole record serialized, opaque to the client.
  let cont: Record<string, string> | undefined;
  if (continueToken) {
    try {
      const parsed: unknown = JSON.parse(continueToken);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        cont = parsed as Record<string, string>;
      }
    } catch {
      // Garbled/stale token — fall through to the first page.
    }
  }

  const data = (await apiGet(
    COMMONS_API,
    {
      action: "query",
      generator: "categorymembers",
      gcmtitle: withCategoryPrefix(category),
      gcmtype: "file",
      gcmlimit: 50,
      ...IMAGEINFO_PROPS,
      iiextmetadatalanguage: lang,
      ...(cont ?? {}),
    },
    { noStore: true },
  )) as {
    query?: { pages?: ImageInfoPage[] };
    continue?: Record<string, string>;
  };

  return {
    files: (data.query?.pages ?? []).map(toCategoryFileInfo),
    continueToken: data.continue ? JSON.stringify(data.continue) : null,
  };
}

/** Wide enough that a full-bleed banner stretched across a desktop viewport
 * doesn't visibly pixelate, without fetching a near-original-resolution file
 * just to crop most of it away. */
const COVER_IMAGE_WIDTH = 1200;

/** A single wide thumbnail for the category header's cover banner. */
export async function getCategoryCoverImage(
  category: string,
): Promise<string | null> {
  // Served from the 5-minute cache for the same reason as the preview
  // mosaic: a briefly stale banner is an acceptable trade for the traffic.
  const data = (await apiGet(COMMONS_API, {
    action: "query",
    generator: "categorymembers",
    gcmtitle: withCategoryPrefix(category),
    gcmtype: "file",
    gcmlimit: 1,
    prop: "imageinfo",
    iiprop: "url",
    iiurlwidth: COVER_IMAGE_WIDTH,
  })) as { query?: { pages?: ImageInfoPage[] } };

  return data.query?.pages?.[0]?.imageinfo?.[0]?.thumburl ?? null;
}

/**
 * Full-text file search (CirrusSearch), optionally scoped to a category via
 * the `incategory:` keyword. Returns the same shape as the category grid.
 */
export async function searchFiles(
  query: string,
  category: string | null,
  lang: string,
): Promise<CategoryFileInfo[]> {
  const scoped = category
    ? `${query} incategory:"${stripCategoryPrefix(category)}"`
    : query;

  const data = (await apiGet(COMMONS_API, {
    action: "query",
    generator: "search",
    gsrsearch: scoped,
    gsrnamespace: 6, // File namespace
    gsrlimit: 60,
    ...IMAGEINFO_PROPS,
    iiextmetadatalanguage: lang,
  })) as { query?: { pages?: ImageInfoPage[] } };

  // Search results carry an "index" for relevance ordering; preserve it.
  const pages = [...(data.query?.pages ?? [])].sort(
    (a, b) => (a.index ?? 0) - (b.index ?? 0),
  );
  return pages.map(toCategoryFileInfo);
}

interface CategorySearchPage {
  title: string;
  index?: number;
  categoryinfo?: CategoryInfo;
}

/** Instant-search existing Commons categories by title, for the
 * add-category autocomplete (file detail panel, "+ kategori"). */
export async function searchCategories(
  query: string,
): Promise<{ name: string; files: number | null }[]> {
  const data = (await apiGet(COMMONS_API, {
    action: "query",
    generator: "search",
    gsrsearch: `intitle:${query}`,
    gsrnamespace: 14, // Category namespace
    gsrlimit: 8,
    prop: "categoryinfo",
  })) as { query?: { pages?: CategorySearchPage[] } };

  const pages = [...(data.query?.pages ?? [])].sort(
    (a, b) => (a.index ?? 0) - (b.index ?? 0),
  );
  return pages.map((page) => ({
    name: stripCategoryPrefix(page.title),
    files: page.categoryinfo?.files ?? null,
  }));
}

/** List files directly contained in a category. */
export async function getCategoryFiles(
  category: string,
): Promise<CategoryFile[]> {
  const files: CategoryFile[] = [];
  let cmcontinue: string | undefined;

  do {
    const data = (await apiGet(
      COMMONS_API,
      {
        action: "query",
        list: "categorymembers",
        cmtitle: withCategoryPrefix(category),
        cmtype: "file",
        cmprop: "title|timestamp|ids",
        cmlimit: 500,
        cmcontinue,
      },
      { noStore: true },
    )) as {
      query?: { categorymembers?: CategoryMember[] };
      continue?: { cmcontinue?: string };
    };

    for (const m of data.query?.categorymembers ?? []) {
      files.push({
        pageid: m.pageid,
        title: m.title,
        name: m.title.replace(/^File:/i, ""),
        timestamp: m.timestamp ?? null,
      });
    }
    cmcontinue = data.continue?.cmcontinue;
  } while (cmcontinue);

  return files;
}

interface RevisionSlot {
  content?: string;
}
interface Revision {
  slots?: { main?: RevisionSlot };
}
interface FileCategory {
  title: string;
}
interface Coordinate {
  lat?: number;
  lon?: number;
}
interface FileDetailPage extends ImageInfoPage {
  revisions?: Revision[];
  categories?: FileCategory[];
  coordinates?: Coordinate[];
}

/** Full detail for one file: wikitext-parsed fields + extmetadata fallback. */
export async function getFileDetail(
  title: string,
  lang: string,
): Promise<FileDetail | null> {
  const details = await getFileDetails([title], lang);
  return details[0] ?? null;
}

/** Max titles per detail batch: MediaWiki caps both thumbnail-rendering
 * imageinfo queries and wbgetentities ids at 50. */
export const FILE_DETAIL_BATCH_LIMIT = 50;

/**
 * Full detail for up to 50 files in three upstream requests total (one page
 * query, one Structured-Data claims read, one label pass) instead of three
 * per file — the bulk-edit modal's read path. Titles that don't exist are
 * simply absent from the result; order follows the API response, so callers
 * needing lookups should key by title.
 */
export async function getFileDetails(
  titles: string[],
  lang: string,
): Promise<FileDetail[]> {
  if (titles.length === 0) return [];
  if (titles.length > FILE_DETAIL_BATCH_LIMIT) {
    throw new Error(`At most ${FILE_DETAIL_BATCH_LIMIT} titles per batch`);
  }

  const fileTitles = titles.map((t) => (/^File:/i.test(t) ? t : `File:${t}`));

  // In a multi-title query the categories/coordinates prop data can arrive
  // split across continuation batches; merge pages by pageid until exhausted.
  const merged = new Map<number, FileDetailPage>();
  let cont: Record<string, string> | undefined;
  do {
    const data = (await apiGet(
      COMMONS_API,
      {
        action: "query",
        titles: fileTitles.join("|"),
        prop: "revisions|imageinfo|categories|coordinates",
        rvprop: "content",
        rvslots: "main",
        iiprop: "url|size|extmetadata|mediatype",
        iiurlwidth: 800,
        iiextmetadatalanguage: lang,
        clshow: "!hidden",
        cllimit: 500,
        colimit: 100,
        ...(cont ?? {}),
      },
      // Bypass the 5-min server cache: a just-published description/location/
      // depict/category edit must be visible the next time the panel opens,
      // not after the TTL window. The client-side fileDetailCache
      // still dedupes within a session and is invalidated on writes.
      { noStore: true },
    )) as {
      query?: { pages?: FileDetailPage[] };
      continue?: Record<string, string>;
    };

    for (const page of data.query?.pages ?? []) {
      if (page.pageid == null) continue; // missing/invalid title
      const existing = merged.get(page.pageid);
      if (!existing) {
        merged.set(page.pageid, { ...page });
      } else {
        existing.revisions = existing.revisions ?? page.revisions;
        existing.imageinfo = existing.imageinfo ?? page.imageinfo;
        existing.coordinates = existing.coordinates ?? page.coordinates;
        if (page.categories) {
          const seen = new Set((existing.categories ?? []).map((c) => c.title));
          existing.categories = [
            ...(existing.categories ?? []),
            ...page.categories.filter((c) => !seen.has(c.title)),
          ];
        }
      }
    }
    cont = data.continue;
  } while (cont);

  const pages = [...merged.values()];
  const depictsByPage = await getDepictsBatch(
    pages.map((p) => p.pageid),
    lang,
  );

  return pages.map((page) =>
    buildFileDetail(page, lang, depictsByPage.get(page.pageid) ?? []),
  );
}

/** Shape one merged detail page into the FileDetail the panel renders. */
function buildFileDetail(
  page: FileDetailPage,
  lang: string,
  depicts: Depict[],
): FileDetail {
  const info = page.imageinfo?.[0];
  const ext = info?.extmetadata;
  const wikitext = page.revisions?.[0]?.slots?.main?.content ?? "";
  const parsed = parseInformation(wikitext);

  // Descriptions: prefer wikitext (multilingual); fall back to extmetadata.
  let descriptions = parsed.descriptions;
  if (descriptions.length === 0) {
    const extDesc = metaValue(ext, "ImageDescription");
    if (extDesc) descriptions = [{ lang, value: stripHtml(extDesc) }];
  }

  const date =
    parsed.date ??
    (metaValue(ext, "DateTimeOriginal")
      ? stripHtml(metaValue(ext, "DateTimeOriginal")!)
      : null);

  const author =
    parsed.author ??
    (metaValue(ext, "Artist") ? stripHtml(metaValue(ext, "Artist")!) : null);

  const licenseShort = metaValue(ext, "LicenseShortName");
  const licenseUrl = metaValue(ext, "LicenseUrl");

  const categories = (page.categories ?? []).map((c) =>
    stripCategoryPrefix(c.title),
  );

  // Coordinates: GeoData primary coordinate, else wikitext {{Location}}.
  let coordinates = parsed.coordinates;
  const geo = page.coordinates?.[0];
  if (geo?.lat != null && geo?.lon != null) {
    coordinates = { lat: geo.lat, lon: geo.lon };
  }

  return {
    pageid: page.pageid,
    title: page.title,
    name: page.title.replace(/^File:/i, ""),
    descriptionUrl:
      info?.descriptionurl ??
      `https://commons.wikimedia.org/wiki/${encodeURIComponent(
        page.title.replace(/ /g, "_"),
      )}`,
    mediaId: `M${page.pageid}`,
    thumbUrl: info?.thumburl ?? null,
    thumbWidth: info?.thumbwidth ?? null,
    thumbHeight: info?.thumbheight ?? null,
    size: info?.size ?? null,
    descriptions,
    date,
    author,
    license: { short: licenseShort ?? null, url: licenseUrl ?? null },
    categories,
    coordinates,
    depicts,
  };
}
