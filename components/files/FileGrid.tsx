"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import {
  getCategoryGridCached,
  getCategoryChildrenCached,
  fetchSearchFiles,
} from "@/lib/api";
import { overlaySubcategories, overlayFiles, syntheticFilesFor } from "@/lib/pendingChanges";
import type { CategoryFileInfo, Subcategory } from "@/lib/types";
import { useBrowser } from "@/components/browser/BrowserProvider";
import CategoryCard from "./CategoryCard";
import CreateCategoryModal from "./CreateCategoryModal";
import FileCard from "./FileCard";
import FilterBar from "./FilterBar";
import SearchBanner from "./SearchBanner";
import {
  applyFilter,
  applySort,
  computeCounts,
  type FilterKey,
  type SortKey,
} from "./filters";

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
  } = useBrowser();

  const [files, setFiles] = useState<CategoryFileInfo[] | null>(null);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey>("name");

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
        const data = await getCategoryChildrenCached(current, locale);
        if (active) {
          setSubcategories(overlaySubcategories(current, data.subcategories, pendingChanges));
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
          data =
            synthetic ??
            overlayFiles(current!, await getCategoryGridCached(current!, locale), pendingChanges);
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
  const visible = useMemo(
    () => applySort(applyFilter(files ?? [], filter), sort),
    [files, filter, sort],
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
      <FilterBar
        counts={counts}
        filter={filter}
        onFilter={setFilter}
        sort={sort}
        onSort={setSort}
      />

      {visible.length === 0 && subcategories.length === 0 ? (
        <p className="py-16 text-center text-sm text-slate-400">
          {t("fileCount", { count: 0 })}
        </p>
      ) : (
        <div
          className="grid gap-3"
          style={{
            // Container-responsive: cards never shrink below 160px; instead the
            // column count drops (and items wrap) as the main area narrows.
            // Capped at 6 columns via the 100%/6 minimum-track trick.
            gridTemplateColumns:
              "repeat(auto-fill, minmax(max(160px, 100% / 6), 1fr))",
          }}
        >
          {subcategories.map((subcat) => (
            <CategoryCard key={subcat.title} subcat={subcat} />
          ))}
          {visible.map((file) => (
            <FileCard key={file.pageid} file={file} />
          ))}
        </div>
      )}

      {mergeModalOpen && current && (
        <CreateCategoryModal
          parentCategory={current}
          files={(files ?? []).filter((f) => selected.has(f.title))}
          onClose={() => setMergeModalOpen(false)}
        />
      )}
    </div>
  );
}
