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
import { parseInformation, stripHtml, withUpdatedDescription } from "./wikitext";

export { stripCategoryPrefix, withCategoryPrefix };

// MediaWiki Action API client. Runs server-side (inside route handlers) so we
// can send a proper User-Agent (Wikimedia requires it) and the OAuth bearer
// token for write calls.
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const WIKIDATA_API = "https://www.wikidata.org/w/api.php";

const USER_AGENT =
  "WikimediaCommonsEditor/0.1 (https://github.com/; read-only browser)";

type Params = Record<string, string | number | undefined>;

async function apiGet(base: string, params: Params): Promise<unknown> {
  const url = new URL(base);
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, "Api-User-Agent": USER_AGENT },
    // Cache upstream responses briefly to be polite to the API.
    next: { revalidate: 300 },
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

async function getCsrfToken(): Promise<string> {
  const data = (await apiPost(COMMONS_API, {
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
    const data = (await apiGet(COMMONS_API, {
      action: "query",
      list: "categorymembers",
      cmtitle: withCategoryPrefix(category),
      cmtype: "subcat",
      cmlimit: 500,
      cmcontinue,
    })) as {
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
  const data = (await apiGet(COMMONS_API, {
    action: "query",
    titles: withCategoryPrefix(category),
    prop: "categoryinfo|pageprops",
    ppprop: "wikibase_item",
  })) as { query?: { pages?: QueryPage[] } };

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

  const ids: string[] = [];
  for (const st of p180) {
    if (st.mainsnak?.snaktype !== "value") continue;
    const id = st.mainsnak.datavalue?.value?.id;
    if (id && !ids.includes(id)) ids.push(id);
  }
  if (ids.length === 0) return [];

  const labels = await fetchWikidataLabels(ids, lang);
  return ids.map((id) => ({ id, label: labels.get(id) ?? null }));
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
    const data = (await apiGet(COMMONS_API, {
      action: "query",
      generator: "categorymembers",
      gcmtitle: withCategoryPrefix(category),
      gcmtype: "file",
      gcmlimit: 50,
      ...IMAGEINFO_PROPS,
      iiextmetadatalanguage: lang,
      ...(cont ?? {}),
    })) as {
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

/** List files directly contained in a category. */
export async function getCategoryFiles(
  category: string,
): Promise<CategoryFile[]> {
  const files: CategoryFile[] = [];
  let cmcontinue: string | undefined;

  do {
    const data = (await apiGet(COMMONS_API, {
      action: "query",
      list: "categorymembers",
      cmtitle: withCategoryPrefix(category),
      cmtype: "file",
      cmprop: "title|timestamp|ids",
      cmlimit: 500,
      cmcontinue,
    })) as {
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

  const data = (await apiGet(COMMONS_API, {
    action: "query",
    titles: fileTitle,
    prop: "revisions",
    rvprop: "content|timestamp",
    rvslots: "main",
  })) as {
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
  if (page?.pageid == null || wikitext == null) {
    throw new Error("File not found");
  }

  const updated = withUpdatedDescription(wikitext, lang, value);
  if (updated == null) {
    throw new Error(
      "This page's description isn't in a format WCE can edit in place — use 'Edit on Commons'.",
    );
  }

  const token = await getCsrfToken();
  const result = (await apiPost(COMMONS_API, {
    action: "edit",
    title: fileTitle,
    text: updated,
    summary: "Update description via WCE",
    basetimestamp: revision?.timestamp,
    token,
  })) as EditResponse;

  if (result.error) {
    throw new Error(result.error.info ?? result.error.code ?? "Edit failed");
  }
  if (result.edit?.result !== "Success") {
    throw new Error("Edit failed");
  }
}
