// Pure category-name helpers, safe to import from both client and server.

/** Ensure a category name carries the "Category:" prefix. */
export function withCategoryPrefix(name: string): string {
  const trimmed = name.trim().replace(/^Category:/i, "");
  return `Category:${trimmed}`;
}

/** Strip the "Category:" prefix for display. */
export function stripCategoryPrefix(title: string): string {
  return title.replace(/^Category:/i, "");
}

/** Commons web URL for a category page. */
export function commonsCategoryUrl(name: string): string {
  const title = withCategoryPrefix(name).replace(/ /g, "_");
  return `https://commons.wikimedia.org/wiki/${encodeURIComponent(title)}`;
}
