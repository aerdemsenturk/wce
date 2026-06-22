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

/** Wikidata "create new item" URL pre-filled with the Commons category as a sitelink. */
export function wikidataNewItemUrl(name: string): string {
  const title = withCategoryPrefix(name).replace(/ /g, "_");
  const params = new URLSearchParams({ site: "commonswiki", page: title });
  return `https://www.wikidata.org/wiki/Special:NewItem?${params.toString()}`;
}
