import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UpstreamReadCache, normalizeCategoryKey } from "./serverCache";

describe("normalizeCategoryKey", () => {
  it("strips the Category: prefix", () => {
    expect(normalizeCategoryKey("Category:Lycian Way")).toBe("Lycian Way");
  });

  it("treats underscores as spaces and collapses runs", () => {
    expect(normalizeCategoryKey("Lycian_Way")).toBe("Lycian Way");
    expect(normalizeCategoryKey("  Lycian   Way ")).toBe("Lycian Way");
  });
});

describe("UpstreamReadCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shares one in-flight fetch between concurrent callers", async () => {
    const cache = new UpstreamReadCache();
    const fetcher = vi.fn(async () => "value");

    const [a, b] = await Promise.all([
      cache.get("children", "Foo", ["tr"], fetcher),
      cache.get("children", "Foo", ["tr"], fetcher),
    ]);

    expect(a).toBe("value");
    expect(b).toBe("value");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("keys entries by scope and extra parts", async () => {
    const cache = new UpstreamReadCache();
    const fetcher = vi.fn(async () => "value");

    await cache.get("children", "Foo", ["tr"], fetcher);
    await cache.get("children", "Foo", ["en"], fetcher);
    await cache.get("parents", "Foo", ["tr"], fetcher);

    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("expires entries after the TTL", async () => {
    const cache = new UpstreamReadCache(1_000);
    const fetcher = vi.fn(async () => "value");

    await cache.get("children", "Foo", ["tr"], fetcher);
    vi.advanceTimersByTime(999);
    await cache.get("children", "Foo", ["tr"], fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2);
    await cache.get("children", "Foo", ["tr"], fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("evicts a rejected fetch so the next caller retries", async () => {
    const cache = new UpstreamReadCache();
    const fetcher = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce("value");

    await expect(cache.get("children", "Foo", ["tr"], fetcher)).rejects.toThrow(
      "boom",
    );
    await expect(cache.get("children", "Foo", ["tr"], fetcher)).resolves.toBe(
      "value",
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("drops every scope/language/page for an invalidated category", async () => {
    const cache = new UpstreamReadCache();
    const fetcher = vi.fn(async () => "value");

    await cache.get("children", "Foo", ["tr"], fetcher);
    await cache.get("children", "Foo", ["en"], fetcher);
    await cache.get("grid", "Foo", ["tr", "page2"], fetcher);
    await cache.get("children", "Bar", ["tr"], fetcher);
    expect(fetcher).toHaveBeenCalledTimes(4);

    // Prefixed/underscored spellings hit the same normalized entry set.
    cache.invalidateCategory("Category:Foo");

    await cache.get("children", "Foo", ["tr"], fetcher);
    await cache.get("children", "Foo", ["en"], fetcher);
    await cache.get("grid", "Foo", ["tr", "page2"], fetcher);
    expect(fetcher).toHaveBeenCalledTimes(7);

    // The unrelated category survived.
    await cache.get("children", "Bar", ["tr"], fetcher);
    expect(fetcher).toHaveBeenCalledTimes(7);
  });

  it("evicts the least-recently-used entry past maxEntries", async () => {
    const cache = new UpstreamReadCache(60_000, 2);
    const fetcher = vi.fn(async () => "value");

    await cache.get("children", "A", [], fetcher);
    await cache.get("children", "B", [], fetcher);
    await cache.get("children", "A", [], fetcher); // refresh A's recency
    await cache.get("children", "C", [], fetcher); // evicts B
    expect(fetcher).toHaveBeenCalledTimes(3);

    await cache.get("children", "A", [], fetcher); // still cached
    expect(fetcher).toHaveBeenCalledTimes(3);
    await cache.get("children", "B", [], fetcher); // was evicted
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
});
