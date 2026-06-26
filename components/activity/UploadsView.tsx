"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { fetchUserUploads, fetchPublicUserUploads } from "@/lib/api";
import { useBrowser } from "@/components/browser/BrowserProvider";
import type { CategoryFileInfo } from "@/lib/types";
import FileCard from "@/components/files/FileCard";

/** Every file the given account has uploaded to Commons, global (not scoped
 * to the currently browsed category), with "load more" pagination. Renders
 * the same `FileCard` grid as a category — clicking a file opens the same
 * detail panel. With no `username`, shows the connected account's own
 * uploads (from the user menu); with one, shows an arbitrary account's
 * public uploads (from the header search → user profile view). */
export default function UploadsView({
  username,
  emptyLabel,
}: {
  username?: string;
  emptyLabel?: string;
}) {
  const t = useTranslations("activity");
  const tc = useTranslations("common");
  const locale = useLocale();
  const { selected } = useBrowser();
  const [items, setItems] = useState<CategoryFileInfo[] | null>(null);
  const [continueToken, setContinueToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  const fetchPage = (continueToken?: string) =>
    username
      ? fetchPublicUserUploads(username, continueToken, locale)
      : fetchUserUploads(continueToken, locale);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(false);
      try {
        const result = await fetchPage();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-fetch only when the target account or language changes
  }, [username, locale]);

  const loadMore = () => {
    if (!continueToken) return;
    setLoadingMore(true);
    fetchPage(continueToken)
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
    return (
      <p className="py-16 text-center text-sm text-slate-400">{emptyLabel ?? t("empty")}</p>
    );
  }

  const selectedFiles = items.filter((f) => selected.has(f.title));

  return (
    <div>
      <div
        className="grid gap-3"
        style={{
          gridTemplateColumns:
            "repeat(auto-fill, minmax(max(100% / 8, min(160px, 100% / 2)), 1fr))",
        }}
      >
        {items.map((file) => (
          <FileCard key={file.pageid} file={file} selectedFiles={selectedFiles} />
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
