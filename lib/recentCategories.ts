// Client-side "recently visited categories" list, persisted to localStorage so
// the last gallery reopens on the next launch and the sidebar can show history.

const RECENTS_KEY = "wce:recent-categories";
const MAX_RECENTS = 10;

export function getRecentCategories(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

/** Move `name` to the front (most recent), de-duplicated case-insensitively and
 * capped at MAX_RECENTS. Returns the new list. */
export function pushRecentCategory(name: string): string[] {
  const clean = name.trim();
  if (typeof window === "undefined" || !clean) return getRecentCategories();
  const rest = getRecentCategories().filter(
    (n) => n.toLowerCase() !== clean.toLowerCase(),
  );
  const next = [clean, ...rest].slice(0, MAX_RECENTS);
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    // ignore quota / unavailable storage
  }
  return next;
}

/** Drop a single entry (e.g. after a rename makes the old name stale). */
export function removeRecentCategory(name: string): string[] {
  if (typeof window === "undefined") return [];
  const next = getRecentCategories().filter(
    (n) => n.toLowerCase() !== name.trim().toLowerCase(),
  );
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}
