// Client-side "favorite categories" list, persisted to localStorage so the
// user's pinned categories survive reloads and feed the sidebar.

const FAVORITES_KEY = "wce:favorite-categories";

export function getFavoriteCategories(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

export function isFavoriteCategory(name: string): boolean {
  const clean = name.trim().toLowerCase();
  return getFavoriteCategories().some((n) => n.toLowerCase() === clean);
}

/** Add `name` to (front of) the favorites if absent, remove it if present.
 * Returns the new list. */
export function toggleFavoriteCategory(name: string): string[] {
  const clean = name.trim();
  if (typeof window === "undefined" || !clean) return getFavoriteCategories();
  const existing = getFavoriteCategories();
  const without = existing.filter((n) => n.toLowerCase() !== clean.toLowerCase());
  const next = without.length === existing.length ? [clean, ...existing] : without;
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
  } catch {
    // ignore quota / unavailable storage
  }
  return next;
}
