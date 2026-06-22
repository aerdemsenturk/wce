"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useBrowser } from "@/components/browser/BrowserProvider";
import EditCategoryModal from "./EditCategoryModal";

export default function Breadcrumb() {
  const t = useTranslations("rename");
  const { path, selectPath } = useBrowser();
  const [editOpen, setEditOpen] = useState(false);

  if (path.length === 0) return null;
  const current = path[path.length - 1];
  const parent = path.length > 1 ? path[path.length - 2] : null;

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
    </>
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
