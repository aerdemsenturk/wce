"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import type { Subcategory } from "@/lib/types";
import { useBrowser } from "@/components/browser/BrowserProvider";
import { useCategoryDropTarget } from "@/components/browser/useCategoryDropTarget";
import { setDragPayload } from "@/lib/dnd";
import { withCategoryPrefix } from "@/lib/category";

// Deliberately image-free: a per-name pastel folder card. Fetching preview
// thumbnails per card was the single largest source of Commons API traffic
// (one request per visible card), and a lone thumbnail made category cards
// too easy to mistake for file cards.
export default function CategoryCard({ subcat }: { subcat: Subcategory }) {
  const t = useTranslations("sidebar");
  const { current, path, selectPath } = useBrowser();
  const { isOver, onDragOver, onDragLeave, onDrop } = useCategoryDropTarget(
    subcat.name,
  );
  const [dragging, setDragging] = useState(false);
  const color = pastelFolderColor(subcat.name);

  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => {
        if (!current) return;
        setDragging(true);
        setDragPayload(e, {
          pageTitle: withCategoryPrefix(subcat.name),
          fromCategory: current,
          kind: "category",
          subcat,
        });
      }}
      onDragEnd={() => setDragging(false)}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => selectPath([...path, subcat.name])}
      data-no-marquee
      className={`group relative flex cursor-grab flex-col overflow-hidden rounded-lg border text-left transition-shadow hover:shadow-md active:cursor-grabbing ${
        color.bg
      } ${dragging ? "opacity-50" : ""} ${
        isOver ? "border-slate-900 ring-2 ring-slate-900" : color.border
      }`}
    >
      {/* Same two-zone shape as FileCard (aspect-square media + info strip),
          so folder and file cards line up at identical heights in the grid. */}
      <div className="relative aspect-square w-full p-3">
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden
          className={`h-4 w-4 ${color.icon}`}
        >
          <path d="M19.5 21a3 3 0 0 0 3-3v-4.5a3 3 0 0 0-3-3h-15a3 3 0 0 0-3 3V18a3 3 0 0 0 3 3h15ZM1.5 10.146V6a3 3 0 0 1 3-3h5.379a2.25 2.25 0 0 1 1.59.659l2.122 2.121c.14.141.331.22.53.22H19.5a3 3 0 0 1 3 3v1.146A4.483 4.483 0 0 0 19.5 9h-15a4.483 4.483 0 0 0-3 1.146Z" />
        </svg>

        {subcat.wikidata && (
          <span
            title={subcat.wikidata.label ?? subcat.wikidata.id}
            className="absolute top-2 right-2 inline-flex items-center rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-mono font-medium text-sky-700 ring-1 ring-sky-200"
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
        <div className="mt-auto flex items-center justify-between gap-2 text-[11px] text-slate-500">
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

const PASTEL_FOLDER_COLORS = [
  { bg: "bg-rose-50", border: "border-rose-100", icon: "text-rose-300" },
  { bg: "bg-violet-50", border: "border-violet-100", icon: "text-violet-300" },
  { bg: "bg-sky-50", border: "border-sky-100", icon: "text-sky-300" },
  { bg: "bg-emerald-50", border: "border-emerald-100", icon: "text-emerald-300" },
  { bg: "bg-orange-50", border: "border-orange-100", icon: "text-orange-300" },
  { bg: "bg-teal-50", border: "border-teal-100", icon: "text-teal-300" },
  { bg: "bg-fuchsia-50", border: "border-fuchsia-100", icon: "text-fuchsia-300" },
  { bg: "bg-lime-50", border: "border-lime-100", icon: "text-lime-300" },
];

function pastelFolderColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return PASTEL_FOLDER_COLORS[Math.abs(hash) % PASTEL_FOLDER_COLORS.length];
}
