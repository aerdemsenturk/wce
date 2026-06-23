import type {
  CategoryChildren,
  CategoryFile,
  CategoryFileInfo,
  CategoryWikidata,
  Depict,
  FileDetail,
  FileStatus,
  Subcategory,
} from "./types";
import { stripCategoryPrefix, withCategoryPrefix } from "./category";
import {
  parseInformation,
  stripHtml,
  withUpdatedDescription,
  withUpdatedLocation,
  withMovedCategory,
  withRemovedCategory,
  withAddedCategory,
  buildNewCategoryWikitext,
  parseWikidataQid,
} from "./wikitext";

export { stripCategoryPrefix, withCategoryPrefix };

// MediaWiki Action API client. Runs server-side (inside route handlers) so we
// can send a proper User-Agent (Wikimedia requires it) and the OAuth bearer
// token for write calls.
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const WIKIDATA_API = "https://www.wikidata.org/w/api.php";

const USER_AGENT =
  "WikimediaCommonsEditor/0.1 (https://github.com/; read-only browser)";

type Params = Record<string, string | number | undefined>;

interface ApiGetOptions {
  /**
   * Skip Next's fetch cache entirely. Required for:
   *  - any read-modify-write (the true latest revision is needed, or
   *    MediaWiki's own edit-conflict check using a stale basetimestamp
   *    will misfire);
   *  - category membership/info reads, so a move/rename/create is visible
   *    immediately instead of waiting out the revalidate window. Next 16's
   *    on-demand revalidateTag() is stale-while-revalidate (still serves one
   *    stale response after invalidation) and its instant variant,
   *    updateTag(), only works inside Server Actions — neither fits a
   *    Route Handler that needs the *next* read to be guaranteed fresh.
   */
  noStore?: boolean;
}

async function apiGet(
  base: string,
  params: Params,
  options?: ApiGetOptions,
): Promise<unknown> {
  const url = new URL(base);
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, "Api-User-Agent": USER_AGENT },
    // Cache stable, slow-changing upstream responses briefly to be polite to
    // the API; bypass entirely where freshness matters (see ApiGetOptions).
    cache: options?.noStore ? "no-store" : undefined,
    next: options?.noStore ? undefined : { revalidate: 300 },
  });
  if (!res.ok) {
    throw new Error(`MediaWiki API ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/**
 * Authenticated POST for write calls (action=edit, tokens, ...). Uses the
 * owner-only OAuth 2.0 access token configured in the environment — there is
 * no interactive login/callback flow because that consumer is pre-authorized
 * for a single Wikimedia account.
 */
async function apiPost(base: string, params: Params): Promise<unknown> {
  const token = process.env.WIKIMEDIA_OAUTH_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      "WIKIMEDIA_OAUTH_ACCESS_TOKEN is not configured — writes are disabled.",
    );
  }

  const body = new URLSearchParams();
  body.set("format", "json");
  body.set("formatversion", "2");
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) body.set(key, String(value));
  }

  const res = await fetch(base, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Api-User-Agent": USER_AGENT,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`MediaWiki API ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/**
 * CSRF tokens are per-wiki, not global — a token minted on Commons can't be
 * used to edit Wikidata, even though the OAuth bearer token itself is valid
 * across the whole Wikimedia cluster. Pass WIKIDATA_API when writing there
 * (e.g. wbsetsitelink).
 */
async function getCsrfToken(base: string = COMMONS_API): Promise<string> {
  const data = (await apiPost(base, {
    action: "query",
    meta: "tokens",
    type: "csrf",
  })) as { query?: { tokens?: { csrftoken?: string } } };

  const token = data.query?.tokens?.csrftoken;
  if (!token) throw new Error("Could not obtain a CSRF token");
  return token;
}

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

/** List direct subcategories of a category (titles only). */
async function listSubcategoryTitles(category: string): Promise<string[]> {
  const titles: string[] = [];
  let cmcontinue: string | undefined;

  do {
    const data = (await apiGet(
      COMMONS_API,
      {
        action: "query",
        list: "categorymembers",
        cmtitle: withCategoryPrefix(category),
        cmtype: "subcat",
        cmlimit: 500,
        cmcontinue,
      },
      { noStore: true },
    )) as {
      query?: { categorymembers?: CategoryMember[] };
      continue?: { cmcontinue?: string };
    };

    for (const m of data.query?.categorymembers ?? []) titles.push(m.title);
    cmcontinue = data.continue?.cmcontinue;
  } while (cmcontinue);

  return titles;
}

/** Fetch categoryinfo (file/subcat counts) + Wikidata item for up to 50 category titles. */
async function fetchCategoryInfo(
  titles: string[],
): Promise<Map<string, CategoryInfo>> {
  const result = new Map<string, CategoryInfo>();
  if (titles.length === 0) return result;

  // The API accepts up to 50 titles per request.
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const data = (await apiGet(COMMONS_API, {
      action: "query",
      titles: batch.join("|"),
      prop: "categoryinfo|pageprops",
      ppprop: "wikibase_item",
    })) as { query?: { pages?: QueryPage[] } };

    for (const page of data.query?.pages ?? []) {
      result.set(page.title, {
        ...page.categoryinfo,
        wikibaseItem: page.pageprops?.wikibase_item,
      });
    }
  }
  return result;
}

/** Wikidata item + file count for a single category. */
async function fetchCategoryMeta(category: string): Promise<{
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

/** Resolve a Wikidata item's label, preferring the requested language. */
async function fetchWikidataLabel(
  qid: string,
  lang: string,
): Promise<string | null> {
  const data = (await apiGet(WIKIDATA_API, {
    action: "wbgetentities",
    ids: qid,
    props: "labels",
    languages: `${lang}|en`,
  })) as {
    entities?: Record<string, { labels?: Record<string, { value: string }> }>;
  };

  const labels = data.entities?.[qid]?.labels;
  return labels?.[lang]?.value ?? labels?.en?.value ?? null;
}

/** Batch-resolve Wikidata labels (up to 50 ids per request). */
async function fetchWikidataLabels(
  ids: string[],
  lang: string,
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const data = (await apiGet(WIKIDATA_API, {
      action: "wbgetentities",
      ids: batch.join("|"),
      props: "labels",
      languages: `${lang}|en`,
    })) as {
      entities?: Record<
        string,
        { labels?: Record<string, { value: string }> }
      >;
    };
    for (const id of batch) {
      const labels = data.entities?.[id]?.labels;
      out.set(id, labels?.[lang]?.value ?? labels?.en?.value ?? null);
    }
  }
  return out;
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

/** Read depicts (P180) statements from a file's Structured Data (M-id). */
async function getDepicts(pageid: number, lang: string): Promise<Depict[]> {
  const mid = `M${pageid}`;
  const data = (await apiGet(COMMONS_API, {
    action: "wbgetentities",
    ids: mid,
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

  const entity = data.entities?.[mid];
  const statements = entity?.statements ?? entity?.claims;
  const p180 = statements?.P180 ?? [];

  const entries: { id: string; statementId: string }[] = [];
  for (const st of p180) {
    if (st.mainsnak?.snaktype !== "value") continue;
    const id = st.mainsnak.datavalue?.value?.id;
    if (id && st.id && !entries.some((e) => e.id === id)) {
      entries.push({ id, statementId: st.id });
    }
  }
  if (entries.length === 0) return [];

  const labels = await fetchWikidataLabels(entries.map((e) => e.id), lang);
  return entries.map((e) => ({
    id: e.id,
    label: labels.get(e.id) ?? null,
    statementId: e.statementId,
  }));
}

/** Add a P180 (depicts) claim to a file's Structured Data (M-id). */
export async function addDepict(
  pageid: number,
  qid: string,
): Promise<{ statementId: string }> {
  const token = await getCsrfToken();
  const value = JSON.stringify({
    "entity-type": "item",
    "numeric-id": Number(qid.slice(1)),
    id: qid,
  });
  const data = (await apiPost(COMMONS_API, {
    action: "wbcreateclaim",
    entity: `M${pageid}`,
    property: "P180",
    snaktype: "value",
    value,
    token,
  })) as { error?: { code?: string; info?: string }; claim?: { id?: string } };

  if (data.error) {
    throw new Error(data.error.info ?? data.error.code ?? "Could not add depicts statement");
  }
  const statementId = data.claim?.id;
  if (!statementId) throw new Error("Could not add depicts statement");
  return { statementId };
}

/** Remove a depicts (or any) Wikibase claim by its statement GUID. */
export async function removeDepict(statementId: string): Promise<void> {
  const token = await getCsrfToken();
  const data = (await apiPost(COMMONS_API, {
    action: "wbremoveclaims",
    claim: statementId,
    token,
  })) as { error?: { code?: string; info?: string } };

  if (data.error) {
    throw new Error(data.error.info ?? data.error.code ?? "Could not remove depicts statement");
  }
}

/** Search Wikidata items by label, for the add-depict autocomplete. */
export async function searchWikidataItems(
  query: string,
  lang: string,
): Promise<{ id: string; label: string; description: string | null }[]> {
  const data = (await apiGet(WIKIDATA_API, {
    action: "wbsearchentities",
    search: query,
    language: lang,
    type: "item",
    limit: 8,
  })) as {
    search?: { id: string; label?: string; description?: string }[];
  };

  return (data.search ?? []).map((r) => ({
    id: r.id,
    label: r.label ?? r.id,
    description: r.description ?? null,
  }));
}

/** Everything the sidebar needs to render one category's children. */
export async function getCategoryChildren(
  category: string,
  lang: string,
): Promise<CategoryChildren> {
  const normalized = withCategoryPrefix(category);

  const [subcatTitles, meta] = await Promise.all([
    listSubcategoryTitles(normalized),
    fetchCategoryMeta(normalized),
  ]);

  const infoMap = await fetchCategoryInfo(subcatTitles);

  const subcatQids = [
    ...new Set(
      [...infoMap.values()]
        .map((info) => info.wikibaseItem)
        .filter((id): id is string => id != null),
    ),
  ];
  const subcatLabels = await fetchWikidataLabels(subcatQids, lang);

  const subcategories: Subcategory[] = subcatTitles
    .map((title) => {
      const info = infoMap.get(title);
      const qid = info?.wikibaseItem ?? null;
      return {
        title,
        name: stripCategoryPrefix(title),
        files: info?.files ?? null,
        subcats: info?.subcats ?? null,
        wikidata: qid ? { id: qid, label: subcatLabels.get(qid) ?? null } : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  let wikidata: CategoryWikidata | null = null;
  if (meta.wikibaseItem) {
    const label = await fetchWikidataLabel(meta.wikibaseItem, lang);
    wikidata = { id: meta.wikibaseItem, label };
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
  const titles: string[] = [];
  let clcontinue: string | undefined;

  do {
    const data = (await apiGet(
      COMMONS_API,
      {
        action: "query",
        titles: withCategoryPrefix(category),
        prop: "categories",
        clshow: "!hidden",
        cllimit: 500,
        clcontinue,
      },
      { noStore: true },
    )) as {
      query?: { pages?: { categories?: { title: string }[] }[] };
      continue?: { clcontinue?: string };
    };

    const page = data.query?.pages?.[0];
    for (const c of page?.categories ?? []) titles.push(c.title);
    clcontinue = data.continue?.clcontinue;
  } while (clcontinue);

  if (titles.length === 0) return [];

  const infoMap = await fetchCategoryInfo(titles);
  const qids = [
    ...new Set(
      [...infoMap.values()]
        .map((info) => info.wikibaseItem)
        .filter((id): id is string => id != null),
    ),
  ];
  const labels = await fetchWikidataLabels(qids, lang);

  return titles
    .map((title) => {
      const info = infoMap.get(title);
      const qid = info?.wikibaseItem ?? null;
      return {
        title,
        name: stripCategoryPrefix(title),
        files: info?.files ?? null,
        subcats: info?.subcats ?? null,
        wikidata: qid ? { id: qid, label: labels.get(qid) ?? null } : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
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

interface ImageInfoPage {
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

const GRID_MAX_FILES = 600; // cap per category to keep the grid responsive

/** Map one imageinfo page (from a generator query) to a grid file. */
function toCategoryFileInfo(page: ImageInfoPage): CategoryFileInfo {
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

const IMAGEINFO_PROPS = {
  prop: "imageinfo",
  iiprop: "url|size|mediatype|timestamp|extmetadata",
  iiurlwidth: 320,
} as const;

/**
 * Files in a category with enough metadata to render the grid (thumbnail,
 * size, upload year, status dots). Uses a generator so file listing and
 * imageinfo come back together, paginated.
 */
export async function getCategoryGrid(
  category: string,
  lang: string,
): Promise<CategoryFileInfo[]> {
  const files: CategoryFileInfo[] = [];
  let cont: Record<string, string> | undefined;

  do {
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

    for (const page of data.query?.pages ?? []) {
      files.push(toCategoryFileInfo(page));
    }
    cont = data.continue;
  } while (cont && files.length < GRID_MAX_FILES);

  return files;
}

const PREVIEW_THUMB_LIMIT = 4;

/**
 * Thumbnail URLs only, for the small preview grid on a category card.
 * Deliberately skips extmetadata (descriptions/license/etc.) — the full
 * `getCategoryGrid` payload is overkill when only `thumbUrl` is shown.
 */
export async function getCategoryPreviewThumbs(
  category: string,
): Promise<string[]> {
  const data = (await apiGet(
    COMMONS_API,
    {
      action: "query",
      generator: "categorymembers",
      gcmtitle: withCategoryPrefix(category),
      gcmtype: "file",
      gcmlimit: PREVIEW_THUMB_LIMIT,
      prop: "imageinfo",
      iiprop: "url",
      iiurlwidth: 320,
    },
    { noStore: true },
  )) as { query?: { pages?: ImageInfoPage[] } };

  return (data.query?.pages ?? [])
    .map((page) => page.imageinfo?.[0]?.thumburl)
    .filter((url): url is string => Boolean(url));
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
  const fileTitle = /^File:/i.test(title) ? title : `File:${title}`;

  const data = (await apiGet(COMMONS_API, {
    action: "query",
    titles: fileTitle,
    prop: "revisions|imageinfo|categories|coordinates",
    rvprop: "content",
    rvslots: "main",
    iiprop: "url|size|extmetadata|mediatype",
    iiurlwidth: 800,
    iiextmetadatalanguage: lang,
    clshow: "!hidden",
    cllimit: 50,
    colimit: 10,
  })) as { query?: { pages?: FileDetailPage[] } };

  const page = data.query?.pages?.[0];
  if (!page || page.pageid == null) return null;

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

  const depicts = await getDepicts(page.pageid, lang);

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

interface EditResponse {
  edit?: { result?: string; nochange?: boolean };
  error?: { code?: string; info?: string };
}

interface PageWikitext {
  pageid: number;
  wikitext: string;
  timestamp: string | undefined;
}

/** Fetch a page's current wikitext + revision timestamp (for basetimestamp,
 * which guards against clobbering a concurrent edit). */
async function fetchPageWikitext(title: string): Promise<PageWikitext | null> {
  const data = (await apiGet(
    COMMONS_API,
    {
      action: "query",
      titles: title,
      prop: "revisions",
      rvprop: "content|timestamp",
      rvslots: "main",
    },
    { noStore: true },
  )) as {
    query?: {
      pages?: {
        pageid?: number;
        revisions?: { timestamp?: string; slots?: { main?: { content?: string } } }[];
      }[];
    };
  };

  const page = data.query?.pages?.[0];
  const revision = page?.revisions?.[0];
  const wikitext = revision?.slots?.main?.content;
  if (page?.pageid == null || wikitext == null) return null;
  return { pageid: page.pageid, wikitext, timestamp: revision?.timestamp };
}

async function postEdit(
  title: string,
  text: string,
  summary: string,
  basetimestamp: string | undefined,
  extra?: Params,
): Promise<void> {
  const token = await getCsrfToken();
  const result = (await apiPost(COMMONS_API, {
    action: "edit",
    title,
    text,
    summary,
    basetimestamp,
    token,
    ...extra,
  })) as EditResponse;

  if (result.error) {
    throw new Error(result.error.info ?? result.error.code ?? "Edit failed");
  }
  if (result.edit?.result !== "Success") {
    throw new Error("Edit failed");
  }
}

/**
 * Patch a single language's description in the {{Information}} template on
 * a file page. Throws if the page doesn't have that template/param in the
 * expected shape — callers should fall back to "edit on Commons" in that
 * case rather than guessing at a rewrite.
 */
export async function editFileDescription(
  title: string,
  lang: string,
  value: string,
): Promise<void> {
  const fileTitle = /^File:/i.test(title) ? title : `File:${title}`;

  const page = await fetchPageWikitext(fileTitle);
  if (!page) {
    throw new Error("File not found");
  }

  const updated = withUpdatedDescription(page.wikitext, lang, value);
  if (updated == null) {
    throw new Error(
      "This page's description isn't in a format WCE can edit in place — use 'Edit on Commons'.",
    );
  }

  await postEdit(fileTitle, updated, "Update description via WCE", page.timestamp);
}

/**
 * Set a file's {{Location dec|lat|lon}} coordinates, replacing any existing
 * location template or inserting a new one.
 */
export async function editFileLocation(
  title: string,
  lat: number,
  lon: number,
): Promise<void> {
  const fileTitle = /^File:/i.test(title) ? title : `File:${title}`;

  const page = await fetchPageWikitext(fileTitle);
  if (!page) {
    throw new Error("File not found");
  }

  const updated = withUpdatedLocation(page.wikitext, lat, lon);
  await postEdit(fileTitle, updated, "Add location via WCE", page.timestamp);
}

/**
 * Move a page's category membership: replace `[[Category:from]]` with
 * `[[Category:to]]` on `pageTitle`'s own wikitext. Works for both file
 * pages (`File:...`) and category pages (`Category:...`, i.e. re-parenting
 * a subcategory) — both link to their categories the same way.
 */
export async function moveCategoryMembership(
  pageTitle: string,
  fromCategory: string,
  toCategory: string,
): Promise<void> {
  const page = await fetchPageWikitext(pageTitle);
  if (!page) throw new Error("Page not found");

  const updated = withMovedCategory(page.wikitext, fromCategory, toCategory);
  if (updated == null) {
    throw new Error(`Page isn't categorized under "${fromCategory}"`);
  }

  await postEdit(
    pageTitle,
    updated,
    `Move from Category:${fromCategory} to Category:${toCategory} via WCE`,
    page.timestamp,
  );
}

/** Add a `[[Category:X]]` link to a page that isn't already categorized
 * under it. Throws if the link is already present. */
export async function addCategoryMembership(
  pageTitle: string,
  category: string,
): Promise<void> {
  const page = await fetchPageWikitext(pageTitle);
  if (!page) throw new Error("Page not found");

  if (withRemovedCategory(page.wikitext, category) != null) {
    throw new Error(`Page is already categorized under "${category}"`);
  }

  const updated = withAddedCategory(page.wikitext, category);
  await postEdit(pageTitle, updated, `Add to Category:${category} via WCE`, page.timestamp);
}

/** Remove a page's `[[Category:X]]` link outright (rather than moving it to
 * another category, as moveCategoryMembership does). */
export async function removeCategoryMembership(
  pageTitle: string,
  category: string,
): Promise<void> {
  const page = await fetchPageWikitext(pageTitle);
  if (!page) throw new Error("Page not found");

  const updated = withRemovedCategory(page.wikitext, category);
  if (updated == null) {
    throw new Error(`Page isn't categorized under "${category}"`);
  }

  await postEdit(
    pageTitle,
    updated,
    `Remove from Category:${category} via WCE`,
    page.timestamp,
  );
}

export interface CreateCategoryResult {
  moved: string[];
  failed: { title: string; error: string }[];
  wikidataError?: string;
}

/**
 * Create a new Commons category page under `parentCategory`, optionally
 * linking it to an existing Wikidata item via a real sitelink, then
 * recategorize each selected file into it (removing the old
 * `parentCategory` link from each, mirroring drag-and-drop "move"
 * semantics). Individual file failures don't abort the whole operation —
 * they're reported back so the caller can show which ones need a manual
 * retry.
 */
export async function createCategoryFromSelection(
  name: string,
  parentCategory: string,
  fileTitles: string[],
  wikidataQid?: string | null,
): Promise<CreateCategoryResult> {
  const categoryTitle = withCategoryPrefix(name);

  const token = await getCsrfToken();
  const createResult = (await apiPost(COMMONS_API, {
    action: "edit",
    title: categoryTitle,
    text: buildNewCategoryWikitext(parentCategory),
    summary: "Create category via WCE",
    createonly: 1,
    token,
  })) as EditResponse;

  if (createResult.error) {
    throw new Error(
      createResult.error.info ?? createResult.error.code ?? "Could not create category",
    );
  }

  let wikidataError: string | undefined;
  if (wikidataQid) {
    try {
      await setCategorySitelink(name, wikidataQid);
    } catch (err) {
      wikidataError = err instanceof Error ? err.message : "Wikidata link failed";
    }
  }

  const moved: string[] = [];
  const failed: { title: string; error: string }[] = [];
  for (const title of fileTitles) {
    try {
      await moveCategoryMembership(title, parentCategory, name);
      moved.push(title);
    } catch (err) {
      failed.push({
        title,
        error: err instanceof Error ? err.message : "Edit failed",
      });
    }
  }

  return { moved, failed, wikidataError };
}

/** Resolve the Wikidata id to prefill in the edit-category modal: prefer the
 * real sitelink (pageprops `wikibase_item`, same source as the sidebar's
 * WikidataBadge) and fall back to the informational `{{Wikidata Infobox}}`
 * note in the page's wikitext, which older category pages may carry from
 * before WCE could create real sitelinks. */
export async function getCategoryWikidataNote(
  category: string,
): Promise<string | null> {
  const title = withCategoryPrefix(category);
  const [meta, page] = await Promise.all([
    fetchCategoryMeta(title),
    fetchPageWikitext(title),
  ]);
  if (meta.wikibaseItem) return meta.wikibaseItem;
  return page ? parseWikidataQid(page.wikitext) : null;
}

interface SitelinkResponse {
  error?: { code?: string; info?: string };
}

/** Create or repoint the `commonswiki` sitelink on a Wikidata item to point
 * at this category page — the real bidirectional link, as opposed to the
 * informational `{{Wikidata Infobox}}` note. Fails if that item already has
 * a commonswiki sitelink pointing elsewhere (Wikidata enforces one sitelink
 * per wiki per item) or if `qid` doesn't exist. */
export async function setCategorySitelink(
  category: string,
  qid: string,
): Promise<void> {
  const title = withCategoryPrefix(category);
  const token = await getCsrfToken(WIKIDATA_API);
  const data = (await apiPost(WIKIDATA_API, {
    action: "wbsetsitelink",
    id: qid,
    linksite: "commonswiki",
    linktitle: title,
    summary: "Link via WCE",
    token,
  })) as SitelinkResponse;

  if (data.error) {
    throw new Error(
      data.error.info ?? data.error.code ?? "Could not set Wikidata sitelink",
    );
  }
}

/** Remove the `commonswiki` sitelink from whichever Wikidata item currently
 * points at this category, if any. */
export async function clearCategorySitelink(category: string): Promise<void> {
  const title = withCategoryPrefix(category);
  const meta = await fetchCategoryMeta(title);
  if (!meta.wikibaseItem) return;

  const token = await getCsrfToken(WIKIDATA_API);
  const data = (await apiPost(WIKIDATA_API, {
    action: "wbsetsitelink",
    id: meta.wikibaseItem,
    linksite: "commonswiki",
    summary: "Unlink via WCE",
    token,
  })) as SitelinkResponse;

  if (data.error) {
    throw new Error(
      data.error.info ?? data.error.code ?? "Could not remove Wikidata sitelink",
    );
  }
}

interface MoveResponse {
  move?: { from?: string; to?: string };
  error?: { code?: string; info?: string };
}

export interface RenameCategoryResult {
  moved: string[];
  failed: { title: string; error: string }[];
}

/**
 * Rename a category: moves the `Category:` page itself (Commons leaves a
 * redirect at the old title automatically), then recategorizes every file
 * directly in it from the old name to the new one — without this, the
 * files would still display under the old title via the redirect, which is
 * considered poor practice on Commons. Subcategories are intentionally left
 * untouched (out of scope — see the limited blast radius of a single
 * rename action).
 */
export async function renameCategory(
  oldName: string,
  newName: string,
): Promise<RenameCategoryResult> {
  const token = await getCsrfToken();
  const moveResult = (await apiPost(COMMONS_API, {
    action: "move",
    from: withCategoryPrefix(oldName),
    to: withCategoryPrefix(newName),
    reason: "Rename via WCE",
    token,
  })) as MoveResponse;

  if (moveResult.error) {
    throw new Error(
      moveResult.error.info ?? moveResult.error.code ?? "Could not rename category",
    );
  }

  const files = await getCategoryFiles(oldName);
  const moved: string[] = [];
  const failed: { title: string; error: string }[] = [];
  for (const file of files) {
    try {
      await moveCategoryMembership(file.title, oldName, newName);
      moved.push(file.title);
    } catch (err) {
      failed.push({
        title: file.title,
        error: err instanceof Error ? err.message : "Edit failed",
      });
    }
  }

  return { moved, failed };
}
