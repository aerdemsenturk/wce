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
