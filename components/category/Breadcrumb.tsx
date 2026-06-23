"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useBrowser } from "@/components/browser/BrowserProvider";
import EditCategoryModal from "./EditCategoryModal";
import AddCategoryModal from "./AddCategoryModal";

export default function Breadcrumb() {
  const t = useTranslations("rename");
  const tSidebar = useTranslations("sidebar");
  const { path, selectPath, favoriteCategories, toggleFavorite } = useBrowser();
  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  if (path.length === 0) return null;
  const current = path[path.length - 1];
  const parent = path.length > 1 ? path[path.length - 2] : null;
  const isFavorite = favoriteCategories.some(
    (n) => n.toLowerCase() === current.toLowerCase(),
  );

  return (
    <>
      <nav aria-label="breadcrumb" className="flex flex-wrap items-center gap-1 text-sm">
        {path.map((name, i) => {
          const isLast = i === path.length - 1;
          return (
            <span key={`${name}-${i}`} className="flex items-center gap-1">
              {i > 0 && <span className="text-slate-300">/</span>}
              {isLast ? (
                <span className="group flex items-center gap-1">
                  <span className="font-semibold text-slate-900">{name}</span>
                  <button
                    type="button"
                    onClick={() => setEditOpen(true)}
                    aria-label={t("edit")}
                    className="text-slate-300 hover:text-slate-600"
                  >
                    <PencilIcon />
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddOpen(true)}
                    aria-label={tSidebar("addSubcategory")}
                    title={tSidebar("addSubcategory")}
                    className="text-slate-300 hover:text-slate-600"
                  >
                    <PlusIcon />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleFavorite(current)}
                    aria-label={tSidebar(isFavorite ? "unfavorite" : "favorite")}
                    title={tSidebar(isFavorite ? "unfavorite" : "favorite")}
                    aria-pressed={isFavorite}
                    className={
                      isFavorite
                        ? "text-amber-400 hover:text-amber-500"
                        : "text-slate-300 hover:text-slate-600"
                    }
                  >
                    <StarIcon filled={isFavorite} />
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => selectPath(path.slice(0, i + 1))}
                  className="text-slate-500 hover:text-slate-900 hover:underline"
                >
                  {name}
                </button>
              )}
            </span>
          );
        })}
      </nav>

      {editOpen && (
        <EditCategoryModal
          category={current}
          parentCategory={parent}
          onClose={() => setEditOpen(false)}
        />
      )}

      {addOpen && (
        <AddCategoryModal parentCategory={current} onClose={() => setAddOpen(false)} />
      )}
    </>
  );
}

function PlusIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M6 2.5V9.5M2.5 6H9.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill={filled ? "currentColor" : "none"}
      aria-hidden
    >
      <path
        d="M8 2l1.8 3.7 4 .6-2.9 2.8.7 4L8 11.8 4.4 13.2l.7-4L2.2 6.3l4-.6L8 2Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M11 2l3 3-7.5 7.5L3 13l.5-3.5L11 2Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
