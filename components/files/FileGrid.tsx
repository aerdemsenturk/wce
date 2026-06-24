"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import {
  getCategoryGridCached,
  getCategoryChildrenCached,
  fetchSearchFiles,
} from "@/lib/api";
import {
  overlaySubcategories,
  overlayFiles,
  syntheticFilesFor,
  resolveCategoryName,
} from "@/lib/pendingChanges";
import type { CategoryFileInfo, Subcategory } from "@/lib/types";
import { useBrowser } from "@/components/browser/BrowserProvider";
import CategoryCard from "./CategoryCard";
import CreateCategoryModal from "./CreateCategoryModal";
import FileCard from "./FileCard";
import SearchBanner from "./SearchBanner";
import { applyFilter, applySort, computeCounts } from "./filters";

export default function FileGrid() {
  const t = useTranslations("sidebar");
  const tc = useTranslations("common");
  const locale = useLocale();
  const {
    current,
    search,
    selected,
    mergeModalOpen,
    setMergeModalOpen,
    version,
    pendingChanges,
    confirmedCreations,
    setVisibleFiles,
    filter,
    setFilter,
    sort,
    setCounts,
  } = useBrowser();

  const [files, setFiles] = useState<CategoryFileInfo[] | null>(null);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  // Subcategories are shown as items alongside files, but aren't subject to
  // the file filter/sort bar — load them separately, skipped during search.
  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!current || search) {
        setSubcategories([]);
        return;
      }
      try {
        const data = await getCategoryChildrenCached(
          resolveCategoryName(current, pendingChanges),
          locale,
        );
        if (active) {
          setSubcategories(
            overlaySubcategories(current, data.subcategories, pendingChanges, confirmedCreations),
          );
        }
      } catch {
        if (active) setSubcategories([]);
      }
    };
    void load();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pendingChanges read via closure, re-runs on version bump
  }, [current, search, locale, version]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!current && !search) {
        setFiles(null);
        return;
      }
      setLoading(true);
      setError(false);
      setFilter("all");
      try {
        let data: CategoryFileInfo[];
        if (search) {
          data = await fetchSearchFiles(search, current, locale);
        } else {
          const synthetic = syntheticFilesFor(current!, pendingChanges);
          const fetchName = resolveCategoryName(current!, pendingChanges);
          data =
            synthetic ??
            overlayFiles(current!, await getCategoryGridCached(fetchName, locale), pendingChanges);
        }
        if (active) setFiles(data);
      } catch {
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pendingChanges read via closure, re-runs on version bump
  }, [current, search, locale, version]);

  const counts = useMemo(
    () => computeCounts(files ?? []),
    [files],
  );
  // Mirrored into context so CategoryHeader's filter control (which doesn't
  // have its own copy of the file list) can show per-option counts.
  useEffect(() => {
    setCounts(counts);
  }, [counts, setCounts]);
  const visible = useMemo(
    () => applySort(applyFilter(files ?? [], filter), sort),
    [files, filter, sort],
  );
  // Keep the detail modal's prev/next navigation in sync with whatever the
  // grid is actually showing (filtered/sorted), not the raw fetch result.
  useEffect(() => {
    setVisibleFiles(visible);
  }, [visible, setVisibleFiles]);
  // Full info for every checked file, so a drag starting on a checked card can
  // carry the whole selection, and the merge modal can reuse the same list.
  const selectedFiles = useMemo(
    () => (files ?? []).filter((f) => selected.has(f.title)),
    [files, selected],
  );

  if (!current && !search) {
    return (
      <p className="py-20 text-center text-sm text-slate-400">{t("empty")}</p>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {search && <SearchBanner query={search} category={current} count={null} />}
        <p className="py-20 text-center text-sm text-slate-400">
          {tc("loading")}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <p className="py-20 text-center text-sm text-red-500">{tc("error")}</p>
    );
  }

  return (
    <div className="space-y-4">
      {search && (
        <SearchBanner
          query={search}
          category={current}
          count={files?.length ?? 0}
        />
      )}

      {visible.length === 0 && subcategories.length === 0 ? (
        <p className="py-16 text-center text-sm text-slate-400">
          {t("fileCount", { count: 0 })}
        </p>
      ) : (
        <div
          className="grid gap-3"
          style={{
            // Container-responsive: at most 8 columns (100%/8 floor keeps
            // each track from exceeding 1/8 width), stepping down through
            // 160px-wide cards as the main area narrows, but never below 2
            // columns (the 100%/2 ceiling keeps a track from ever exceeding
            // half the container, so two always fit).
            gridTemplateColumns:
              "repeat(auto-fill, minmax(max(100% / 8, min(160px, 100% / 2)), 1fr))",
          }}
        >
          {subcategories.map((subcat) => (
            <CategoryCard key={subcat.title} subcat={subcat} />
          ))}
          {visible.map((file) => (
            <FileCard key={file.pageid} file={file} selectedFiles={selectedFiles} />
          ))}
        </div>
      )}

      {mergeModalOpen && current && (
        <CreateCategoryModal
          parentCategory={current}
          files={selectedFiles}
          onClose={() => setMergeModalOpen(false)}
        />
      )}
    </div>
  );
}
