"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useBrowser } from "@/components/browser/BrowserProvider";
import { getCategoryChildrenCached } from "@/lib/api";
import { resolveCategoryName, syntheticChildrenFor } from "@/lib/pendingChanges";
import { commonsCategoryUrl } from "@/lib/category";
import UploadModal from "@/components/upload/UploadModal";
import EditCategoryModal from "./EditCategoryModal";
import AddCategoryModal from "./AddCategoryModal";

/**
 * Prominent header for the category currently being viewed: a large title, its
 * Wikidata description (when available) and the per-category actions (rename,
 * add subcategory, favorite, open on Commons) lifted out of the breadcrumb.
 */
export default function CategoryHeader() {
  const t = useTranslations("rename");
  const tSidebar = useTranslations("sidebar");
  const locale = useLocale();
  const { path, current, version, pendingChanges, favoriteCategories, toggleFavorite } =
    useBrowser();
  const tUpload = useTranslations("upload");
  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [description, setDescription] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!current || syntheticChildrenFor(current, pendingChanges)) {
        setDescription(null);
        return;
      }
      try {
        const data = await getCategoryChildrenCached(
          resolveCategoryName(current, pendingChanges),
          locale,
        );
        if (active) setDescription(data.wikidata?.description ?? null);
      } catch {
        if (active) setDescription(null);
      }
    };
    void load();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pendingChanges read via closure; version bump (on publish) forces a refetch
  }, [current, locale, version]);

  if (!current) return null;

  const parent = path.length > 1 ? path[path.length - 2] : null;
  const isFavorite = favoriteCategories.some(
    (n) => n.toLowerCase() === current.toLowerCase(),
  );

  return (
    <>
      <div className="flex items-start justify-between gap-4 px-6 pb-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold leading-tight text-slate-900">
            {current}
          </h1>
          {description && (
            <p className="mt-1 line-clamp-2 text-sm text-slate-500">{description}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <IconButton onClick={() => setEditOpen(true)} label={t("edit")}>
            <PencilIcon />
          </IconButton>
          <IconButton onClick={() => setAddOpen(true)} label={tSidebar("addSubcategory")}>
            <FolderIcon />
          </IconButton>
          <IconButton onClick={() => setUploadOpen(true)} label={tUpload("addFilesTitle")}>
            <PlusIcon />
          </IconButton>
          <IconButton
            onClick={() => toggleFavorite(current)}
            label={tSidebar(isFavorite ? "unfavorite" : "favorite")}
            pressed={isFavorite}
            active={isFavorite}
          >
            <StarIcon filled={isFavorite} />
          </IconButton>
          <a
            href={commonsCategoryUrl(current)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={tSidebar("openOnCommons")}
            title={tSidebar("openOnCommons")}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <ExternalIcon />
          </a>
        </div>
      </div>

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

      {uploadOpen && (
        <UploadModal files={[]} onClose={() => setUploadOpen(false)} />
      )}
    </>
  );
}

function IconButton({
  onClick,
  label,
  pressed,
  active,
  children,
}: {
  onClick: () => void;
  label: string;
  pressed?: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={
        "inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-slate-100 " +
        (active
          ? "text-amber-400 hover:text-amber-500"
          : "text-slate-400 hover:text-slate-700")
      }
    >
      {children}
    </button>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M6 2.5V9.5M2.5 6H9.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2 4.5a1 1 0 0 1 1-1h3l1.2 1.5H13a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-7Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="15"
      height="15"
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
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
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

function ExternalIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M4.5 2H10V7.5M10 2L5 7M7 7v2.5a.5.5 0 0 1-.5.5H2.5a.5.5 0 0 1-.5-.5V5.5a.5.5 0 0 1 .5-.5H5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
