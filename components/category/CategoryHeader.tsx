"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { useBrowser } from "@/components/browser/BrowserProvider";
import {
  getCategoryChildrenCached,
  getCategoryCoverImageCached,
  getCategoryParentsCached,
} from "@/lib/api";
import { resolveCategoryName, syntheticChildrenFor } from "@/lib/pendingChanges";
import { commonsCategoryUrl, withCategoryPrefix } from "@/lib/category";
import type { Subcategory } from "@/lib/types";
import UploadModal from "@/components/upload/UploadModal";
import Tooltip from "@/components/ui/Tooltip";
import SearchBox from "@/components/layout/SearchBox";
import type { FilterKey, SortKey } from "@/components/files/filters";
import WikidataBadge from "./WikidataBadge";
import EditCategoryModal from "./EditCategoryModal";
import AddCategoryModal from "./AddCategoryModal";
import AddParentCategoryModal from "./AddParentCategoryModal";

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
    root,
    path,
    current,
    version,
    pendingChanges,
    favoriteCategories,
    toggleFavorite,
    setRoot,
    setTreeParent,
    filter,
    setFilter,
    sort,
    setSort,
    counts,
  } = useBrowser();
  const tUpload = useTranslations("upload");
  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addParentOpen, setAddParentOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [description, setDescription] = useState<string | null>(null);
  const [cover, setCover] = useState<{ key: string; url: string | null } | null>(null);
  // Parents are tagged with the category they belong to: when the active
  // category changes the previous fetch's parents must not be reused for the
  // new one, or we'd show/promote the wrong parent.
  const [parentData, setParentData] = useState<{
    category: string;
    parents: Subcategory[];
  } | null>(null);

  // Fetch the parents the active category is filed under on Commons, shown
  // as badges below that navigate straight to one (a real `setRoot`, not a
  // tree re-anchor, so this is safe at any depth).
  useEffect(() => {
    if (!current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset to loading state before fetching
      setParentData(null);
      return;
    }
    let active = true;
    setParentData(null);
    getCategoryParentsCached(current, locale)
      .then((data) => {
        if (active) setParentData({ category: current, parents: data });
      })
      .catch(() => {
        if (active) setParentData({ category: current, parents: [] });
      });
    return () => {
      active = false;
    };
  }, [current, locale, version]);

  // Only trust parents that were fetched for the current active category.
  // Not-yet-published "add parent" changes are overlaid as synthetic entries
  // (no file/subcat counts yet) so they show up immediately, consistent with
  // the rest of the batch-then-publish model.
  const fetchedParents =
    parentData && parentData.category === current ? parentData.parents : null;
  const pendingParentNames = current
    ? pendingChanges
        .filter(
          (c): c is Extract<typeof c, { type: "addCategory" }> =>
            c.type === "addCategory" && c.fileTitle === withCategoryPrefix(current),
        )
        .map((c) => c.category)
    : [];
  const parents = useMemo(
    () =>
      fetchedParents
        ? [
            ...fetchedParents,
            ...pendingParentNames
              .filter((name) => !fetchedParents.some((p) => p.name === name))
              .map(
                (name): Subcategory => ({
                  title: withCategoryPrefix(name),
                  name,
                  files: null,
                  subcats: null,
                  wikidata: null,
                }),
              ),
          ]
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pendingParentNames is a new array each render but derived from pendingChanges, already covered
    [fetchedParents, pendingChanges],
  );

  // Auto-promote the first parent as the sidebar tree's level-1 node — only
  // while the entered root category is still the active (deepest) one.
  // Once the user navigates into a subcategory beneath root, root's
  // ancestors aren't necessarily ancestors of that deeper category, so
  // re-anchoring the tree on one would produce a path that doesn't reflect
  // real Commons containment.
  const atTreeTop = current === root;
  useEffect(() => {
    if (parents && parents.length > 0 && atTreeTop) {
      setTreeParent(parents[0].name);
    }
  }, [parents, atTreeTop, setTreeParent]);

  // Exclude the parent already visible immediately above the active category
  // in the sidebar tree (the one promoted to the top, or the one just
  // navigated through) — it'd be a redundant "go to parent" badge.
  const visibleParent = path.length > 1 ? path[path.length - 2] : null;
  const altParents = (parents ?? []).filter((p) => p.name !== visibleParent);

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
              loading="eager"
              className="object-cover"
              aria-hidden
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-black/40" />
          </>
        )}

        {altParents.length > 0 && (
          <div className="absolute left-6 top-3 z-10 flex max-w-[calc(100%-3rem)] flex-wrap items-center gap-1">
            {altParents.map((altParent) => (
              <button
                key={altParent.title}
                type="button"
                onClick={() => setRoot(altParent.name)}
                title={tSidebar("goToParent", { name: altParent.name })}
                className={
                  "inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-xs hover:bg-black/10 " +
                  (coverUrl
                    ? "text-white/85 drop-shadow-sm hover:text-white"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-800")
                }
              >
                <UpIcon />
                <span className="truncate">{altParent.name}</span>
              </button>
            ))}
          </div>
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
          stay reachable while browsing a long file grid. On narrow screens
          the bar scrolls horizontally itself (edge gradients hint at the
          overflow, same pattern as the breadcrumb) instead of widening the
          page. */}
      <div className="sticky top-11 z-20 border-b border-border-base bg-panel">
        <div className="no-scrollbar flex h-11 items-center justify-between gap-2 overflow-x-auto px-3 sm:gap-4 sm:px-6">
          <div className="flex shrink-0 items-center gap-0.5">
            <IconButton onClick={() => setEditOpen(true)} label={t("edit")}>
              <PencilIcon />
            </IconButton>
            <IconButton onClick={() => setAddOpen(true)} label={tSidebar("addSubcategory")}>
              <AddSubcategoryIcon />
            </IconButton>
            <IconButton
              onClick={() => setAddParentOpen(true)}
              label={tSidebar("addParentCategory")}
            >
              <AddParentIcon />
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
  
          <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
            <div className="relative h-7 w-7 sm:h-auto sm:w-28">
              <span
                aria-hidden
                className={
                  "pointer-events-none absolute inset-0 flex items-center justify-center sm:hidden " +
                  (filter !== "all" ? "text-amber-500" : "text-slate-400")
                }
              >
                <FilterIcon />
              </span>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as FilterKey)}
                aria-label={tFilters("filterLabel")}
                title={tFilters("filterLabel")}
                className="absolute inset-0 h-7 w-7 cursor-pointer opacity-0 sm:relative sm:inset-auto sm:h-auto sm:w-full sm:cursor-auto sm:rounded-md sm:border sm:border-border-base sm:bg-panel sm:px-1.5 sm:py-1 sm:text-xs sm:text-slate-700 sm:opacity-100 sm:outline-none sm:focus:border-slate-400"
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
            </div>
            <div className="relative h-7 w-7 sm:h-auto sm:w-24">
              <span
                aria-hidden
                className={
                  "pointer-events-none absolute inset-0 flex items-center justify-center sm:hidden " +
                  (sort !== "name" ? "text-amber-500" : "text-slate-400")
                }
              >
                <SortIcon />
              </span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                aria-label={tFilters("sortLabel")}
                title={tFilters("sortLabel")}
                className="absolute inset-0 h-7 w-7 cursor-pointer opacity-0 sm:relative sm:inset-auto sm:h-auto sm:w-full sm:cursor-auto sm:rounded-md sm:border sm:border-border-base sm:bg-panel sm:px-1.5 sm:py-1 sm:text-xs sm:text-slate-700 sm:opacity-100 sm:outline-none sm:focus:border-slate-400"
              >
                <option value="name">{tFilters("sortName")}</option>
                <option value="date">{tFilters("sortDate")}</option>
                <option value="missing">{tFilters("sortMissing")}</option>
              </select>
            </div>
            <SearchBox />
          </div>
        </div>
        <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-panel to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-panel to-transparent" />
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

      {addParentOpen && (
        <AddParentCategoryModal
          category={current}
          existingParents={(parents ?? []).map((p) => p.name)}
          onClose={() => setAddParentOpen(false)}
        />
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

function AddParentIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 13V3M4 7L8 3L12 7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Mirror image of AddParentIcon, so the two "add" actions read as a
 * matched pair. */
function AddSubcategoryIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 3V13M4 9L8 13L12 9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UpIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      <path
        d="M6 9.5V2.5M3 5.5L6 2.5L9 5.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2.5 3h11L9.5 8.2v4.3L6.5 14V8.2L2.5 3Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SortIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M4 6.5L7 3.5L10 6.5M4 9.5L7 12.5L10 9.5"
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
