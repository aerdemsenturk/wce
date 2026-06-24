"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
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
import BulkEditModal from "./BulkEditModal";
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
    setSelectedTitles,
    mergeModalOpen,
    setMergeModalOpen,
    bulkEditModalOpen,
    setBulkEditModalOpen,
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

  // Box (marquee) selection: mouse-down on the grid's empty background starts
  // a drag-to-select rectangle; cards whose bounding box intersects it get
  // checked, same as clicking each one's checkbox individually.
  const gridRef = useRef<HTMLDivElement>(null);
  const marqueeOrigin = useRef<{ x: number; y: number } | null>(null);
  const baseSelectedRef = useRef<Set<string>>(new Set());
  const [marqueeRect, setMarqueeRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const [boxSelecting, setBoxSelecting] = useState(false);

  const handleGridMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only start the marquee when the press lands on the grid background
    // itself, not on a card (cards handle their own click/drag).
    if (e.button !== 0 || e.target !== e.currentTarget) return;
    marqueeOrigin.current = { x: e.clientX, y: e.clientY };
    baseSelectedRef.current = e.shiftKey ? new Set(selected) : new Set();
    setMarqueeRect({ left: 0, top: 0, width: 0, height: 0 });
    setBoxSelecting(true);
  };

  useEffect(() => {
    if (!boxSelecting) return;

    const onMove = (e: MouseEvent) => {
      const container = gridRef.current;
      const origin = marqueeOrigin.current;
      if (!container || !origin) return;
      const rect = container.getBoundingClientRect();
      const x1 = Math.min(origin.x, e.clientX);
      const y1 = Math.min(origin.y, e.clientY);
      const x2 = Math.max(origin.x, e.clientX);
      const y2 = Math.max(origin.y, e.clientY);
      setMarqueeRect({
        left: x1 - rect.left,
        top: y1 - rect.top,
        width: x2 - x1,
        height: y2 - y1,
      });

      const next = new Set(baseSelectedRef.current);
      container.querySelectorAll<HTMLElement>("[data-file-title]").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.left < x2 && r.right > x1 && r.top < y2 && r.bottom > y1) {
          next.add(el.dataset.fileTitle!);
        }
      });
      setSelectedTitles(next);
    };

    const onUp = () => {
      setBoxSelecting(false);
      setMarqueeRect(null);
      marqueeOrigin.current = null;
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [boxSelecting, setSelectedTitles]);

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
          ref={gridRef}
          onMouseDown={handleGridMouseDown}
          className={`relative grid gap-3 ${boxSelecting ? "select-none" : ""}`}
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
          {marqueeRect && (
            <div
              className="pointer-events-none absolute z-20 border border-sky-500 bg-sky-500/10"
              style={{
                left: marqueeRect.left,
                top: marqueeRect.top,
                width: marqueeRect.width,
                height: marqueeRect.height,
              }}
            />
          )}
        </div>
      )}

      {mergeModalOpen && current && (
        <CreateCategoryModal
          parentCategory={current}
          files={selectedFiles}
          onClose={() => setMergeModalOpen(false)}
        />
      )}

      {bulkEditModalOpen && (
        <BulkEditModal
          files={selectedFiles}
          defaultParent={current}
          onClose={() => setBulkEditModalOpen(false)}
        />
      )}
    </div>
  );
}
