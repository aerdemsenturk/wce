import { stripCategoryPrefix } from "./category";

// Server-side caches for upstream MediaWiki reads. Two layers share one
// TTL+LRU promise-cache implementation:
//
//  - upstreamResponseCache: URL-keyed cache used by apiGet in
//    lib/mediawiki/client.ts for stable, slow-changing responses. This
//    replaces Next's `next: { revalidate: 300 }` fetch cache so
//    lib/mediawiki/* has no framework dependency; unlike Next's version it
//    is per-process and blocks on expiry instead of serving stale, which is
//    an acceptable trade for a cache this short-lived.
//
//  - upstreamReadCache: category-keyed cache for the hot read paths
//    (children/parents/grid pages), which bypass apiGet's cache entirely
//    (noStore) so the write paths in lib/mediawiki.ts can drop every entry
//    touching a category the moment they change it — a WCE write must make
//    the *next* read fresh, which a plain revalidate window can't guarantee.
//
// Module-level state is shared across route handlers within one server
// process — the same assumption lib/mediawiki.ts already makes for its token
// cache and upstream concurrency gate. A multi-instance deployment would
// degrade to per-instance caches (worst case: TTL-stale reads), never to an
// incorrect write.

const DEFAULT_TTL_MS = 5 * 60_000;
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
  /** Invalidation handle (e.g. a normalized category name); "" if unused. */
  tag: string;
}

/**
 * TTL + LRU cache of in-flight/settled promises. Concurrent callers of the
 * same key share one upstream request; a rejected fetch is evicted so the
 * next caller retries. Entries past `maxEntries` evict least-recently-used.
 */
export class TtlPromiseCache {
  private map = new Map<string, Entry>();

  constructor(
    private ttlMs = DEFAULT_TTL_MS,
    private maxEntries = DEFAULT_MAX_ENTRIES,
  ) {}

  get<V>(key: string, fetcher: () => Promise<V>, tag = ""): Promise<V> {
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
    this.map.set(key, { promise, expiresAt: now + this.ttlMs, tag });
    if (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    return promise;
  }

  /** Drop every entry carrying `tag`. */
  invalidateTag(tag: string): void {
    for (const [key, entry] of this.map) {
      if (entry.tag === tag) this.map.delete(key);
    }
  }
}

/** Category-keyed wrapper: entries are tagged with their normalized category
 * so a write can invalidate every read (any scope, language or page)
 * touching that category. */
export class UpstreamReadCache {
  private cache: TtlPromiseCache;

  constructor(ttlMs = DEFAULT_TTL_MS, maxEntries = DEFAULT_MAX_ENTRIES) {
    this.cache = new TtlPromiseCache(ttlMs, maxEntries);
  }

  get<V>(
    scope: string,
    category: string,
    extra: readonly string[],
    fetcher: () => Promise<V>,
  ): Promise<V> {
    const normalized = normalizeCategoryKey(category);
    const key = [scope, normalized, ...extra].join(KEY_SEPARATOR);
    return this.cache.get(key, fetcher, normalized);
  }

  /** Drop every entry (any scope, language or page) for one category. */
  invalidateCategory(category: string): void {
    this.cache.invalidateTag(normalizeCategoryKey(category));
  }
}

/** Shared instance used by lib/mediawiki.ts. */
export const upstreamReadCache = new UpstreamReadCache();

/** URL-keyed response cache behind apiGet — see the module comment. Sized
 * above the category cache since one navigation fans out into many distinct
 * API URLs (per language, per continue token). */
export const upstreamResponseCache = new TtlPromiseCache(DEFAULT_TTL_MS, 1_000);
