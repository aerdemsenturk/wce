"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { fetchUserActivity } from "@/lib/api";
import { formatRelativeTime } from "@/lib/activity";
import type { ActivityItem } from "@/lib/types";

/** GitHub-commit-list-styled timeline of the connected account's real
 * Commons contribution history (list=usercontribs), with "load more"
 * pagination via the API's continuation token. */
export default function ActivityFeed() {
  const t = useTranslations("activity");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [items, setItems] = useState<ActivityItem[] | null>(null);
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
        const result = await fetchUserActivity();
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
    fetchUserActivity(continueToken)
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
      <ul className="relative">
        {items.map((item, i) => (
          <li key={item.id} className="relative flex gap-3 pb-5 pl-1 last:pb-0">
            {i < items.length - 1 && (
              <span className="absolute left-[11px] top-5 h-full w-px bg-border-base" />
            )}
            <span className="relative z-10 mt-1 grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border border-border-base bg-panel text-slate-500">
              {item.isNew ? <CreateIcon /> : <EditIcon />}
            </span>
            <div className="min-w-0 flex-1 rounded-md border border-border-base bg-panel px-3 py-2">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <a
                  href={item.pageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-sm font-medium text-slate-700 hover:underline"
                >
                  {item.title}
                </a>
                <time className="shrink-0 text-xs text-slate-400" dateTime={item.timestamp}>
                  {formatRelativeTime(item.timestamp, locale)}
                </time>
              </div>
              <p className="mt-0.5 truncate text-xs italic text-slate-400">
                {item.comment || t("noSummary")}
              </p>
            </div>
          </li>
        ))}
      </ul>

      {continueToken && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="mt-2 w-full rounded-md border border-border-base py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-50"
        >
          {loadingMore ? tc("loading") : t("loadMore")}
        </button>
      )}
    </div>
  );
}

function CreateIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 3v10M3 8h10"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M11 2.5 13.5 5 5 13.5H2.5V11L11 2.5Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}
