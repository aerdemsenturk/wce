"use client";

import { useTranslations } from "next-intl";
import type { Subcategory } from "@/lib/types";
import { useBrowser } from "@/components/browser/BrowserProvider";

export default function CategoryCard({ subcat }: { subcat: Subcategory }) {
  const t = useTranslations("sidebar");
  const { path, selectPath } = useBrowser();

  return (
    <button
      type="button"
      onClick={() => selectPath([...path, subcat.name])}
      className="group flex flex-col overflow-hidden rounded-lg border border-border-base bg-panel text-left transition-shadow hover:shadow-md"
    >
      <div className="relative flex aspect-square w-full items-center justify-center bg-amber-50">
        <FolderIcon />
        {subcat.wikidata && (
          <span
            title={subcat.wikidata.label ?? subcat.wikidata.id}
            className="absolute top-2 right-2 inline-flex items-center rounded-full bg-sky-50 px-1.5 py-0.5 text-[10px] font-mono font-medium text-sky-700 ring-1 ring-sky-200"
          >
            {subcat.wikidata.id}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-2.5">
        <p
          className="line-clamp-2 text-xs font-medium text-slate-700"
          title={subcat.name}
        >
          {subcat.name}
        </p>
        <div className="mt-auto flex items-center justify-between gap-2 text-[11px] text-slate-400">
          {subcat.files != null && (
            <span className="tabular-nums">
              {t("fileCount", { count: subcat.files })}
            </span>
          )}
          {subcat.subcats != null && (
            <span className="tabular-nums">
              {t("subcatCount", { count: subcat.subcats })}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function FolderIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="text-amber-400"
    >
      <path
        d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
