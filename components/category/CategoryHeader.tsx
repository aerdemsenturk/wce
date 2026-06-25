"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { useBrowser } from "@/components/browser/BrowserProvider";
import { getCategoryChildrenCached, getCategoryCoverImageCached } from "@/lib/api";
import { resolveCategoryName, syntheticChildrenFor } from "@/lib/pendingChanges";
import { commonsCategoryUrl } from "@/lib/category";
import UploadModal from "@/components/upload/UploadModal";
import Tooltip from "@/components/ui/Tooltip";
import SearchBox from "@/components/layout/SearchBox";
import type { FilterKey, SortKey } from "@/components/files/filters";
import WikidataBadge from "./WikidataBadge";
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
  const tFilters = useTranslations("filters");
  const locale = useLocale();
  const {
    path,
    current,
    version,
    pendingChanges,
    favoriteCategories,
    toggleFavorite,
    filter,
    setFilter,
    sort,
    setSort,
    counts,
  } = useBrowser();
  const tUpload = useTranslations("upload");
  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [description, setDescription] = useState<string | null>(null);
  const [cover, setCover] = useState<{ key: string; url: string | null } | null>(null);

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

  const coverKey = `${current}:${version}`;

  useEffect(() => {
    let active = true;
    if (!current || syntheticChildrenFor(current, pendingChanges)) return;
    getCategoryCoverImageCached(resolveCategoryName(current, pendingChanges))
      .then((url) => {
        if (active) setCover({ key: coverKey, url });
      })
      .catch(() => {
        if (active) setCover({ key: coverKey, url: null });
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pendingChanges read via closure; version bump (on publish) forces a refetch
  }, [current, coverKey]);

  // A category/version change invalidates `coverKey`, so a result fetched for
  // a previous key is ignored automatically instead of being reset on every
  // change of `current`/`version`.
  const coverUrl = cover?.key === coverKey ? cover.url : null;

  if (!current) return null;

  const parent = path.length > 1 ? path[path.length - 2] : null;
  const isFavorite = favoriteCategories.some(
    (n) => n.toLowerCase() === current.toLowerCase(),
  );

  return (
    <>
      <div className="relative h-56 overflow-hidden">
        {coverUrl && (
          <>
            <Image
              src={coverUrl}
              alt=""
              fill
              sizes="100vw"
              quality={70}
              className="object-cover"
              aria-hidden
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/25 to-black/5" />
          </>
        )}

        <div className="relative flex h-full items-end justify-between gap-4 px-6 pb-4 pt-10">
          <div className="min-w-0">
            <h1
              className={
                "truncate text-xl font-semibold leading-tight " +
                (coverUrl ? "text-white drop-shadow-sm" : "text-slate-900")
              }
            >
              {current}
            </h1>
            {description && (
              <p
                className={
                  "mt-1 line-clamp-2 text-sm " +
                  (coverUrl ? "text-white/85 drop-shadow-sm" : "text-slate-500")
                }
              >
                {description}
              </p>
            )}
          </div>

          <div className="shrink-0">
            <WikidataBadge onCover={!!coverUrl} />
          </div>
        </div>
      </div>

      {/* Detaches from the cover banner above (which scrolls away with the
          page) and sticks just below the breadcrumb bar, so the actions
          stay reachable while browsing a long file grid. */}
      <div className="sticky top-11 z-20 flex h-11 items-center justify-between gap-4 border-b border-border-base bg-panel px-6">
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
          <Tooltip label={tSidebar("openOnCommons")}>
            <a
              href={commonsCategoryUrl(current)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={tSidebar("openOnCommons")}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <ExternalIcon />
            </a>
          </Tooltip>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as FilterKey)}
            aria-label={tFilters("filterLabel")}
            title={tFilters("filterLabel")}
            className="w-28 rounded-md border border-border-base bg-panel px-1.5 py-1 text-xs text-slate-700 outline-none focus:border-slate-400"
          >
            <option value="all">
              {tFilters("all")} ({counts.all})
            </option>
            <option value="description">
              {tFilters("missingDescription")} ({counts.description})
            </option>
            <option value="date">
              {tFilters("missingDate")} ({counts.date})
            </option>
            <option value="location">
              {tFilters("missingLocation")} ({counts.location})
            </option>
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label={tFilters("sortLabel")}
            title={tFilters("sortLabel")}
            className="w-24 rounded-md border border-border-base bg-panel px-1.5 py-1 text-xs text-slate-700 outline-none focus:border-slate-400"
          >
            <option value="name">{tFilters("sortName")}</option>
            <option value="date">{tFilters("sortDate")}</option>
            <option value="missing">{tFilters("sortMissing")}</option>
          </select>
          <div className="w-32">
            <SearchBox />
          </div>
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
    <Tooltip label={label}>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
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
    </Tooltip>
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
