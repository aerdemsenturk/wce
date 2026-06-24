"use client";

import { useTranslations } from "next-intl";
import { useBrowser } from "@/components/browser/BrowserProvider";
import Tooltip from "@/components/ui/Tooltip";

/** The user's pinned categories, shown in the sidebar above the recently
 * visited list. Click to open; the star removes from favorites. */
export default function FavoriteCategories() {
  const t = useTranslations("sidebar");
  const { favoriteCategories, toggleFavorite, setRoot } = useBrowser();

  if (favoriteCategories.length === 0) return null;

  return (
    <div className="border-t border-border-base px-4 py-3">
      <h3 className="mb-1.5 text-[11px] font-semibold text-slate-400">
        {t("favorites")}
      </h3>
      <ul className="space-y-0.5">
        {favoriteCategories.map((name) => (
          <li
            key={name}
            className="group flex items-center gap-1 rounded-md hover:bg-slate-100"
          >
            <button
              type="button"
              onClick={() => setRoot(name)}
              title={name}
              className="flex min-w-0 flex-1 items-center gap-1.5 px-1.5 py-1 text-left text-xs text-slate-600 hover:text-slate-900"
            >
              <StarIcon />
              <span className="truncate">{name}</span>
            </button>
            <Tooltip label={t("unfavorite")}>
              <button
                type="button"
                onClick={() => toggleFavorite(name)}
                aria-label={t("unfavorite")}
                className="shrink-0 px-1.5 text-slate-300 opacity-0 hover:text-slate-600 group-hover:opacity-100"
              >
                <RemoveIcon />
              </button>
            </Tooltip>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StarIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
      className="shrink-0 text-amber-400"
    >
      <path d="M8 2l1.8 3.7 4 .6-2.9 2.8.7 4L8 11.8 4.4 13.2l.7-4L2.2 6.3l4-.6L8 2Z" />
    </svg>
  );
}

function RemoveIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M3 3l6 6M9 3l-6 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
