import type {
  CategoryChildren,
  CategoryFile,
  CategoryFileInfo,
  Coordinates,
  FileDetail,
  Subcategory,
} from "./types";

// Client-side helpers that call our own server proxy under /api/commons.

const MAX_CACHE_ENTRIES = 300;

/** Map-like cache that evicts the least-recently-used entry once it grows
 * past `maxSize`, so long browsing sessions don't grow these caches forever. */
class BoundedCache<V> {
  private map = new Map<string, V>();
  constructor(private maxSize = MAX_CACHE_ENTRIES) {}
  get(key: string): V | undefined {
    const value = this.map.get(key);
    if (value !== undefined) {
      this.map.delete(key);
      this.map.set(key, value); // refresh recency
    }
    return value;
  }
  set(key: string, value: V): void {
    this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.maxSize) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
  }
  delete(key: string): void {
    this.map.delete(key);
  }
  keys(): IterableIterator<string> {
    return this.map.keys();
  }
}

export async function fetchCategoryChildren(
  category: string,
  lang: string,
): Promise<CategoryChildren> {
  const params = new URLSearchParams({ op: "children", category, lang });
  const res = await fetch(`/api/commons/category?${params}`);
  if (!res.ok) throw new Error(`children ${res.status}`);
  return res.json();
}

export async function fetchCategoryParents(
  category: string,
  lang: string,
): Promise<Subcategory[]> {
  const params = new URLSearchParams({ op: "parents", category, lang });
  const res = await fetch(`/api/commons/category?${params}`);
  if (!res.ok) throw new Error(`parents ${res.status}`);
  const data = (await res.json()) as { parents: Subcategory[] };
  return data.parents;
}

const parentsCache = new BoundedCache<Promise<Subcategory[]>>();

export function getCategoryParentsCached(
  category: string,
  lang: string,
): Promise<Subcategory[]> {
  const key = `${lang}:${category}`;
  let entry = parentsCache.get(key);
  if (!entry) {
    entry = fetchCategoryParents(category, lang).catch((err) => {
      parentsCache.delete(key);
      throw err;
    });
    parentsCache.set(key, entry);
  }
  return entry;
}

export async function fetchCategoryFiles(
  category: string,
): Promise<CategoryFile[]> {
  const params = new URLSearchParams({ op: "files", category });
  const res = await fetch(`/api/commons/category?${params}`);
  if (!res.ok) throw new Error(`files ${res.status}`);
  const data = (await res.json()) as { files: CategoryFile[] };
  return data.files;
}

export async function fetchCategoryGrid(
  category: string,
  lang: string,
): Promise<CategoryFileInfo[]> {
  const params = new URLSearchParams({ op: "grid", category, lang });
  const res = await fetch(`/api/commons/category?${params}`);
  if (!res.ok) throw new Error(`grid ${res.status}`);
  const data = (await res.json()) as { files: CategoryFileInfo[] };
  return data.files;
}

export async function fetchCategoryPreviewThumbs(
  category: string,
): Promise<string[]> {
  const params = new URLSearchParams({ op: "preview", category });
  const res = await fetch(`/api/commons/category?${params}`);
  if (!res.ok) throw new Error(`preview ${res.status}`);
  const data = (await res.json()) as { thumbs: string[] };
  return data.thumbs;
}

const previewThumbsCache = new BoundedCache<Promise<string[]>>();

export function getCategoryPreviewThumbsCached(
  category: string,
): Promise<string[]> {
  let entry = previewThumbsCache.get(category);
  if (!entry) {
    entry = fetchCategoryPreviewThumbs(category).catch((err) => {
      previewThumbsCache.delete(category);
      throw err;
    });
    previewThumbsCache.set(category, entry);
  }
  return entry;
}

// Module-level cache so re-expanding a node or revisiting a category
// doesn't refetch within the same session.
const childrenCache = new BoundedCache<Promise<CategoryChildren>>();

export function getCategoryChildrenCached(
  category: string,
  lang: string,
): Promise<CategoryChildren> {
  const key = `${lang}:${category}`;
  let entry = childrenCache.get(key);
  if (!entry) {
    entry = fetchCategoryChildren(category, lang).catch((err) => {
      childrenCache.delete(key); // allow retry on failure
      throw err;
    });
    childrenCache.set(key, entry);
  }
  return entry;
}

export async function fetchFileDetail(
  title: string,
  lang: string,
): Promise<FileDetail> {
  const params = new URLSearchParams({ title, lang });
  const res = await fetch(`/api/commons/file?${params}`);
  if (!res.ok) throw new Error(`file ${res.status}`);
  return res.json();
}

const fileDetailCache = new BoundedCache<Promise<FileDetail>>();

export function getFileDetailCached(
  title: string,
  lang: string,
): Promise<FileDetail> {
  const key = `${lang}:${title}`;
  let entry = fileDetailCache.get(key);
  if (!entry) {
    entry = fetchFileDetail(title, lang).catch((err) => {
      fileDetailCache.delete(key);
      throw err;
    });
    fileDetailCache.set(key, entry);
  }
  return entry;
}

/** Patch a single language's description on a file page (v2 write path). */
export async function updateFileDescription(
  title: string,
  lang: string,
  value: string,
): Promise<void> {
  const res = await fetch("/api/commons/file", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, lang, value }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `update ${res.status}`);
  }
  // Force a refetch next time this file is opened, across all locales.
  for (const key of fileDetailCache.keys()) {
    if (key.endsWith(`:${title}`)) fileDetailCache.delete(key);
  }
}

/** Add a P180 depicts statement to a file (queued write path). */
export async function addDepict(
  title: string,
  pageid: number,
  qid: string,
): Promise<{ statementId: string }> {
  const res = await fetch("/api/commons/file", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "addDepict", pageid, qid }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `addDepict ${res.status}`);
  }
  for (const key of fileDetailCache.keys()) {
    if (key.endsWith(`:${title}`)) fileDetailCache.delete(key);
  }
  return res.json();
}

/** Remove a depicts statement from a file by its claim GUID (queued write path). */
export async function removeDepict(title: string, statementId: string): Promise<void> {
  const res = await fetch("/api/commons/file", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "removeDepict", statementId }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `removeDepict ${res.status}`);
  }
  for (const key of fileDetailCache.keys()) {
    if (key.endsWith(`:${title}`)) fileDetailCache.delete(key);
  }
}

/** Set a file's {{Location}} coordinates (queued write path). */
export async function updateFileLocation(
  title: string,
  lat: number,
  lon: number,
): Promise<void> {
  const res = await fetch("/api/commons/file", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "location", title, lat, lon }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `location ${res.status}`);
  }
  for (const key of fileDetailCache.keys()) {
    if (key.endsWith(`:${title}`)) fileDetailCache.delete(key);
  }
}

export interface UploadFileMeta {
  filename: string;
  description: string;
  descriptionLang: string;
  date: string;
  author: string;
  source: string;
  license: string;
  categories: string[];
  /** GPS coordinates read from the photo's EXIF data, if present. */
  location?: Coordinates | null;
}

/** Upload one new file to Commons. Posts the binary plus metadata as
 * multipart form-data to our upload proxy; returns the created page title. */
export async function uploadFileToCommons(
  file: File,
  meta: UploadFileMeta,
): Promise<{ title: string }> {
  const form = new FormData();
  form.set("file", file, meta.filename);
  form.set("filename", meta.filename);
  form.set("description", meta.description);
  form.set("descriptionLang", meta.descriptionLang);
  form.set("date", meta.date);
  form.set("author", meta.author);
  form.set("source", meta.source);
  form.set("license", meta.license);
  for (const c of meta.categories) form.append("categories", c);
  if (meta.location) {
    form.set("lat", String(meta.location.lat));
    form.set("lon", String(meta.location.lon));
  }

  const res = await fetch("/api/commons/upload", { method: "POST", body: form });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `upload ${res.status}`);
  }
  for (const c of meta.categories) invalidateCategory(c);
  return res.json();
}

/** Remove a file's {{Location}} coordinates outright (queued write path). */
export async function removeFileLocation(title: string): Promise<void> {
  const res = await fetch("/api/commons/file", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "removeLocation", title }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `removeLocation ${res.status}`);
  }
  for (const key of fileDetailCache.keys()) {
    if (key.endsWith(`:${title}`)) fileDetailCache.delete(key);
  }
}

/** Tag a file with {{delete|reason}}, nominating it for deletion review on
 * Commons (queued write path). */
export async function nominateFileDeletion(title: string, reason: string): Promise<void> {
  const res = await fetch("/api/commons/file", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "nominateDeletion", title, reason }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `nominateDeletion ${res.status}`);
  }
  for (const key of fileDetailCache.keys()) {
    if (key.endsWith(`:${title}`)) fileDetailCache.delete(key);
  }
}

/** Search Wikidata items by label, for the add-depict autocomplete. */
export async function searchWikidataItems(
  query: string,
  lang: string,
): Promise<{ id: string; label: string; description: string | null }[]> {
  const params = new URLSearchParams({ q: query, lang });
  const res = await fetch(`/api/wikidata/search?${params}`);
  if (!res.ok) throw new Error(`wikidataSearch ${res.status}`);
  const data = (await res.json()) as {
    results: { id: string; label: string; description: string | null }[];
  };
  return data.results;
}

/** Move a file or subcategory's parent category (drag-and-drop write path). */
export async function moveCategoryMembership(
  pageTitle: string,
  fromCategory: string,
  toCategory: string,
): Promise<void> {
  const res = await fetch("/api/commons/category", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "move", pageTitle, fromCategory, toCategory }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `move ${res.status}`);
  }
  invalidateCategory(fromCategory);
  invalidateCategory(toCategory);
}

/** Remove a file's category link outright (queued write — see the
 * `removeCategory` pending-change type in lib/pendingChanges.ts). */
export async function removeCategoryMembership(
  pageTitle: string,
  category: string,
): Promise<void> {
  const res = await fetch("/api/commons/category", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "removeCategory", pageTitle, category }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `removeCategory ${res.status}`);
  }
  invalidateCategory(category);
}

/** Add a file's category link (queued write — see the `addCategory`
 * pending-change type in lib/pendingChanges.ts). */
export async function addCategoryMembership(
  pageTitle: string,
  category: string,
): Promise<void> {
  const res = await fetch("/api/commons/category", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "addCategory", pageTitle, category }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `addCategory ${res.status}`);
  }
  invalidateCategory(category);
  for (const key of fileDetailCache.keys()) {
    if (key.endsWith(`:${pageTitle}`)) fileDetailCache.delete(key);
  }
}

export interface RenameCategoryResult {
  moved: string[];
  failed: { title: string; error: string }[];
  wikidataError?: string;
}

/** Rename a category page and recategorize its direct files, optionally
 * setting/clearing its real Wikidata sitelink in the same request
 * (edit-category modal). Pass `wikidataQid: null` to remove the sitelink, or
 * omit it to leave it untouched. */
export async function renameCategory(
  oldName: string,
  newName: string,
  options?: { wikidataQid?: string | null; parentCategory?: string | null },
): Promise<RenameCategoryResult> {
  const res = await fetch("/api/commons/category", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      op: "rename",
      oldName,
      newName,
      wikidataQid: options?.wikidataQid,
    }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `rename ${res.status}`);
  }
  invalidateCategory(oldName);
  invalidateCategory(newName);
  if (options?.parentCategory) invalidateCategory(options.parentCategory);
  return res.json();
}

/** Read a category's linked Wikidata item — the real sitelink if one
 * exists, otherwise a legacy `{{Wikidata Infobox}}` note — for prefilling
 * the edit-category modal. */
export async function fetchCategoryWikidataNote(
  category: string,
): Promise<string | null> {
  const params = new URLSearchParams({ op: "wikidataNote", category });
  const res = await fetch(`/api/commons/category?${params}`);
  if (!res.ok) throw new Error(`wikidataNote ${res.status}`);
  const data = (await res.json()) as { qid: string | null };
  return data.qid;
}

/** Instant-search existing Commons categories by title, for the
 * add-category autocomplete in the file detail panel. */
export async function searchCategories(
  query: string,
): Promise<{ name: string; files: number | null }[]> {
  const params = new URLSearchParams({ op: "search", query });
  const res = await fetch(`/api/commons/category?${params}`);
  if (!res.ok) throw new Error(`categorySearch ${res.status}`);
  const data = (await res.json()) as {
    results: { name: string; files: number | null }[];
  };
  return data.results;
}

export interface CreateCategoryResult {
  moved: string[];
  failed: { title: string; error: string }[];
  wikidataError?: string;
}

/** Create a new category under `parent` and recategorize the given files into
 * it (merge-selection write path). */
export async function createCategoryFromSelection(
  name: string,
  parent: string,
  fileTitles: string[],
  wikidataQid?: string,
): Promise<CreateCategoryResult> {
  const res = await fetch("/api/commons/category", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, parent, fileTitles, wikidataQid }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `create ${res.status}`);
  }
  invalidateCategory(parent);
  invalidateCategory(name);
  for (const title of fileTitles) {
    for (const key of fileDetailCache.keys()) {
      if (key.endsWith(`:${title}`)) fileDetailCache.delete(key);
    }
  }
  return res.json();
}

/** Drop every cached entry (any locale) for a category — children listing
 * and grid — so the next read reflects a just-written move/create. */
export function invalidateCategory(category: string): void {
  for (const key of childrenCache.keys()) {
    if (key.endsWith(`:${category}`)) childrenCache.delete(key);
  }
  for (const key of gridCache.keys()) {
    if (key.endsWith(`:${category}`)) gridCache.delete(key);
  }
  for (const key of parentsCache.keys()) {
    if (key.endsWith(`:${category}`)) parentsCache.delete(key);
  }
  previewThumbsCache.delete(category);
}

export async function fetchSearchFiles(
  query: string,
  category: string | null,
  lang: string,
): Promise<CategoryFileInfo[]> {
  const params = new URLSearchParams({ q: query, lang });
  if (category) params.set("category", category);
  const res = await fetch(`/api/commons/search?${params}`);
  if (!res.ok) throw new Error(`search ${res.status}`);
  const data = (await res.json()) as { files: CategoryFileInfo[] };
  return data.files;
}

const gridCache = new BoundedCache<Promise<CategoryFileInfo[]>>();

export function getCategoryGridCached(
  category: string,
  lang: string,
): Promise<CategoryFileInfo[]> {
  const key = `${lang}:${category}`;
  let entry = gridCache.get(key);
  if (!entry) {
    entry = fetchCategoryGrid(category, lang).catch((err) => {
      gridCache.delete(key);
      throw err;
    });
    gridCache.set(key, entry);
  }
  return entry;
}
