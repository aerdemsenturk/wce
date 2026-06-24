"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { fetchUserUploads } from "@/lib/api";
import { formatRelativeTime } from "@/lib/activity";
import type { UploadItem } from "@/lib/types";

/** Every file the connected account has uploaded to Commons, global (not
 * scoped to the currently browsed category), with "load more" pagination. */
export default function UploadsView() {
  const t = useTranslations("activity");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [items, setItems] = useState<UploadItem[] | null>(null);
  const [continueToken, setContinueToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(false);
      try {
        const result = await fetchUserUploads();
        if (!active) return;
        setItems(result.items);
        setContinueToken(result.continueToken);
      } catch {
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const loadMore = () => {
    if (!continueToken) return;
    setLoadingMore(true);
    fetchUserUploads(continueToken)
      .then((result) => {
        setItems((prev) => [...(prev ?? []), ...result.items]);
        setContinueToken(result.continueToken);
      })
      .catch(() => setError(true))
      .finally(() => setLoadingMore(false));
  };

  if (loading) {
    return <p className="py-16 text-center text-sm text-slate-400">{tc("loading")}</p>;
  }
  if (error && !items) {
    return <p className="py-16 text-center text-sm text-red-500">{tc("error")}</p>;
  }
  if (!items || items.length === 0) {
    return <p className="py-16 text-center text-sm text-slate-400">{t("empty")}</p>;
  }

  return (
    <div>
      <div
        className="grid gap-3"
        style={{
          gridTemplateColumns:
            "repeat(auto-fill, minmax(max(100% / 8, min(160px, 100% / 2)), 1fr))",
        }}
      >
        {items.map((item) => (
          <a
            key={item.title}
            href={item.descriptionUrl}
            target="_blank"
            rel="noreferrer"
            className="group overflow-hidden rounded-md border border-border-base bg-panel"
          >
            <div className="aspect-square bg-slate-100">
              {item.thumbUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- thumbnail URLs are arbitrary Commons hosts, not worth an Image loader config for a low-traffic view
                <img
                  src={item.thumbUrl}
                  alt={item.name}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              )}
            </div>
            <div className="p-2">
              <p className="truncate text-xs font-medium text-slate-700 group-hover:underline">
                {item.name}
              </p>
              <p className="text-xs text-slate-400">
                {formatRelativeTime(item.timestamp, locale)}
              </p>
            </div>
          </a>
        ))}
      </div>

      {continueToken && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="mt-4 w-full rounded-md border border-border-base py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-50"
        >
          {loadingMore ? tc("loading") : t("loadMore")}
        </button>
      )}
    </div>
  );
}
