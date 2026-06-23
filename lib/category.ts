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

/**
 * App-internal route path mirroring Commons' `/wiki/Category:Name` URL —
 * spaces become underscores, the `Category:` prefix and any `/` stay literal
 * for readability, everything else is percent-encoded.
 */
export function categoryToAppPath(name: string): string {
  const title = withCategoryPrefix(name).replace(/ /g, "_");
  const encoded = encodeURIComponent(title)
    .replace(/%3A/gi, ":")
    .replace(/%2F/gi, "/");
  return `/wiki/${encoded}`;
}

/** Parse a category name out of the `/wiki/[...slug]` route segments. Browsers
 * percent-encode the `:` in the address bar (e.g. `Category%3ABithynia`), so we
 * decode each segment ourselves rather than assume Next already did — decoding
 * is a no-op on an already-decoded segment. Returns null when the slug isn't a
 * category path. */
export function categoryFromSlug(slug: string[] | undefined): string | null {
  if (!slug || slug.length === 0) return null;
  const joined = slug
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .join("/");
  const name = stripCategoryPrefix(joined).replace(/_/g, " ").trim();
  return name || null;
}

/** Parse a category name out of a raw `window.location.pathname` (for the
 * back/forward popstate handler). */
export function categoryFromPath(pathname: string): string | null {
  const match = /^\/wiki\/(.+)$/.exec(pathname);
  if (!match) return null;
  let title = match[1];
  try {
    title = decodeURIComponent(title);
  } catch {
    // keep raw on malformed encoding
  }
  const name = stripCategoryPrefix(title).replace(/_/g, " ").trim();
  return name || null;
}

/** Wikidata "create new item" URL pre-filled with the Commons category as a sitelink. */
export function wikidataNewItemUrl(name: string): string {
  const title = withCategoryPrefix(name).replace(/ /g, "_");
  const params = new URLSearchParams({ site: "commonswiki", page: title });
  return `https://www.wikidata.org/wiki/Special:NewItem?${params.toString()}`;
}
