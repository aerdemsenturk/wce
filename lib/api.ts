import type {
  CategoryChildren,
  CategoryFile,
  CategoryFileInfo,
  FileDetail,
} from "./types";

// Client-side helpers that call our own server proxy under /api/commons.

export async function fetchCategoryChildren(
  category: string,
  lang: string,
): Promise<CategoryChildren> {
  const params = new URLSearchParams({ op: "children", category, lang });
  const res = await fetch(`/api/commons/category?${params}`);
  if (!res.ok) throw new Error(`children ${res.status}`);
  return res.json();
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

// Module-level cache so re-expanding a node or revisiting a category
// doesn't refetch within the same session.
const childrenCache = new Map<string, Promise<CategoryChildren>>();

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

const fileDetailCache = new Map<string, Promise<FileDetail>>();

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

export interface RenameCategoryResult {
  moved: string[];
  failed: { title: string; error: string }[];
}

/** Rename a category page and recategorize its direct files (breadcrumb edit). */
export async function renameCategory(
  oldName: string,
  newName: string,
  parentCategory?: string | null,
): Promise<RenameCategoryResult> {
  const res = await fetch("/api/commons/category", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "rename", oldName, newName }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `rename ${res.status}`);
  }
  invalidateCategory(oldName);
  invalidateCategory(newName);
  if (parentCategory) invalidateCategory(parentCategory);
  return res.json();
}

export interface CreateCategoryResult {
  moved: string[];
  failed: { title: string; error: string }[];
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

const gridCache = new Map<string, Promise<CategoryFileInfo[]>>();

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
