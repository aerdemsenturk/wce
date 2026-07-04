import { stripCategoryPrefix } from "./category";

// Server-side cache for upstream MediaWiki category reads, replacing the
// blanket `noStore` on the hot read paths (children/parents/grid pages).
// Next's own data cache can't be used there: its on-demand invalidation is
// stale-while-revalidate (revalidateTag) or Server-Action-only (updateTag),
// while a WCE write must make the *next* read fresh. This cache gets both:
// entries live for a short TTL, and the write paths in lib/mediawiki.ts drop
// every entry touching a category the moment they change it — so visitors
// share cached reads without waiting out a revalidate window after an edit.
//
// Module-level state is shared across route handlers within one server
// process — the same assumption lib/mediawiki.ts already makes for its token
// cache and upstream concurrency gate. A multi-instance deployment would
// degrade to per-instance caches (worst case: TTL-stale reads), never to an
// incorrect write.

const DEFAULT_TTL_MS = 5 * 60_000; // matches apiGet's revalidate window
const DEFAULT_MAX_ENTRIES = 500;

/** Can't occur in a MediaWiki title or a language code, so joined key parts
 * can't collide. */
const KEY_SEPARATOR = "\u0000";

/** Canonical form of a category name for cache keys: prefix-less,
 * underscores as spaces, single-spaced. MediaWiki treats these variants as
 * the same page, so caching and invalidation must agree on one spelling. */
export function normalizeCategoryKey(category: string): string {
  return stripCategoryPrefix(category)
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface Entry {
  promise: Promise<unknown>;
  expiresAt: number;
  /** Normalized category the entry belongs to, for invalidation. */
  category: string;
}

export class UpstreamReadCache {
  private map = new Map<string, Entry>();

  constructor(
    private ttlMs = DEFAULT_TTL_MS,
    private maxEntries = DEFAULT_MAX_ENTRIES,
  ) {}

  /**
   * The cached promise for (scope, category, extra), or `fetcher`'s promise,
   * cached immediately so concurrent callers share one in-flight upstream
   * request. A rejected fetch is evicted so the next caller retries. Entries
   * past `maxEntries` evict least-recently-used.
   */
  get<V>(
    scope: string,
    category: string,
    extra: readonly string[],
    fetcher: () => Promise<V>,
  ): Promise<V> {
    const normalized = normalizeCategoryKey(category);
    const key = [scope, normalized, ...extra].join(KEY_SEPARATOR);
    const now = Date.now();

    const entry = this.map.get(key);
    if (entry && entry.expiresAt > now) {
      this.map.delete(key);
      this.map.set(key, entry); // refresh recency
      return entry.promise as Promise<V>;
    }

    const promise = fetcher();
    promise.catch(() => {
      if (this.map.get(key)?.promise === promise) this.map.delete(key);
    });
    this.map.delete(key);
    this.map.set(key, { promise, expiresAt: now + this.ttlMs, category: normalized });
    if (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    return promise;
  }

  /** Drop every entry (any scope, language or page) for one category. */
  invalidateCategory(category: string): void {
    const normalized = normalizeCategoryKey(category);
    for (const [key, entry] of this.map) {
      if (entry.category === normalized) this.map.delete(key);
    }
  }
}

/** Shared instance used by lib/mediawiki.ts. */
export const upstreamReadCache = new UpstreamReadCache();
