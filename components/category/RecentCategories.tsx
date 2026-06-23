"use client";

import { useTranslations } from "next-intl";
import { useBrowser } from "@/components/browser/BrowserProvider";

/** The last few categories the user opened, pinned at the bottom of the
 * sidebar for quick return. Excludes the one currently open. */
export default function RecentCategories() {
  const t = useTranslations("sidebar");
  const { recentCategories, current, setRoot } = useBrowser();

  const items = recentCategories.filter((name) => name !== current).slice(0, 5);
  if (items.length === 0) return null;

  return (
    <div className="border-t border-border-base px-4 py-3">
      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {t("recent")}
      </h3>
      <ul className="space-y-0.5">
        {items.map((name) => (
          <li key={name}>
            <button
              type="button"
              onClick={() => setRoot(name)}
              title={name}
              className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              <ClockIcon />
              <span className="truncate">{name}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ClockIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden
      className="shrink-0 text-slate-400"
    >
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M6 3.5V6L7.5 7.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
