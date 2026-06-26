"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { Subcategory } from "@/lib/types";
import { useBrowser } from "@/components/browser/BrowserProvider";
import { useCategoryDropTarget } from "@/components/browser/useCategoryDropTarget";
import { setDragPayload } from "@/lib/dnd";
import { withCategoryPrefix } from "@/lib/category";
import { getCategoryPreviewThumbsCached } from "@/lib/api";

export default function CategoryCard({ subcat }: { subcat: Subcategory }) {
  const t = useTranslations("sidebar");
  const { current, path, selectPath } = useBrowser();
  const { isOver, onDragOver, onDragLeave, onDrop } = useCategoryDropTarget(
    subcat.name,
  );
  const [previewThumbs, setPreviewThumbs] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let active = true;
    void getCategoryPreviewThumbsCached(subcat.name)
      .then((thumbs) => {
        if (active) setPreviewThumbs(thumbs);
      })
      .catch(() => {
        if (active) setPreviewThumbs([]);
      });

    return () => {
      active = false;
    };
  }, [subcat.name]);

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
      className={`group relative flex cursor-grab flex-col overflow-hidden rounded-lg border bg-panel text-left transition-shadow hover:shadow-md active:cursor-grabbing ${
        dragging ? "opacity-50" : ""
      } ${
        isOver ? "border-slate-900 ring-2 ring-slate-900" : "border-amber-200"
      }`}
    >
      <div className="grid aspect-square w-full grid-cols-2 gap-1 overflow-hidden rounded-t-lg bg-slate-100 p-1">
        {previewThumbs.length > 0 ? (
          previewThumbs.map((thumbUrl, index) => (
            <div
              key={index}
              className="relative overflow-hidden rounded-md bg-slate-200"
            >
              <Image
                src={thumbUrl}
                alt={`Preview ${index + 1}`}
                fill
                className="object-cover"
                unoptimized
              />
            </div>
          ))
        ) : (
          <div className="relative flex aspect-square w-full items-center justify-center rounded-md bg-amber-50">
            <FolderIcon className="text-amber-400" width={32} height={32} />
          </div>
        )}

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

function FolderIcon({
  width,
  height,
  className,
}: {
  width: number;
  height: number;
  className?: string;
}) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={className}
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
