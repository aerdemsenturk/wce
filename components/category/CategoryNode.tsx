"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { getCategoryChildrenCached } from "@/lib/api";
import { overlaySubcategories, syntheticChildrenFor, resolveCategoryName } from "@/lib/pendingChanges";
import type { Subcategory } from "@/lib/types";
import { useBrowser } from "@/components/browser/BrowserProvider";
import { useCategoryDropTarget } from "@/components/browser/useCategoryDropTarget";
import { setDragPayload } from "@/lib/dnd";
import { withCategoryPrefix } from "@/lib/category";
import Tooltip from "@/components/ui/Tooltip";

interface CategoryNodeProps {
  name: string;
  /** Full path of names from root to this node, inclusive. */
  path: string[];
  /** Known subcategory count, or null if unknown (root). */
  subcats: number | null;
  /** Known file count, or null if unknown. */
  files: number | null;
  level: number;
}

export default function CategoryNode({
  name,
  path,
  subcats,
  files,
  level,
}: CategoryNodeProps) {
  const t = useTranslations("sidebar");
  const locale = useLocale();
  const { path: activePath, selectPath, version, pendingChanges, confirmedCreations } =
    useBrowser();
  const { isOver, onDragOver, onDragLeave, onDrop } = useCategoryDropTarget(name);

  const isActive = activePath.join("/") === path.join("/");
  const isAncestorOfActive =
    activePath.length > path.length &&
    path.every((segment, i) => activePath[i] === segment);
  const expandable = subcats === null || subcats > 0;
  const parent = path.length > 1 ? path[path.length - 2] : null;

  // Start expanded when this node already sits on the path to the active
  // category at mount time, so entering a category (e.g. via a favorite, which
  // remounts the tree top under its parent) reveals the active category's place
  // in the tree without a manual click.
  const [expanded, setExpanded] = useState(isAncestorOfActive);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [children, setChildren] = useState<Subcategory[] | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  // Follow navigation from the main content area: auto-expand this node when
  // it sits on the path to the newly active category. Adjusted during render
  // (React's documented pattern for state derived from a changing prop)
  // instead of in an effect, so it doesn't trigger an extra cascading render.
  const [prevIsAncestorOfActive, setPrevIsAncestorOfActive] = useState(isAncestorOfActive);
  if (isAncestorOfActive !== prevIsAncestorOfActive) {
    setPrevIsAncestorOfActive(isAncestorOfActive);
    if (isAncestorOfActive && !expanded) {
      setExpanded(true);
    }
  }

  // After a drag-drop move elsewhere invalidates the shared cache, refetch
  // this node's already-expanded children so it reflects the new state.
  useEffect(() => {
    if (!expanded) return;
    let active = true;
    const synthetic = syntheticChildrenFor(name, pendingChanges);
    if (synthetic) {
      Promise.resolve().then(() => active && setChildren(synthetic));
      return;
    }
    getCategoryChildrenCached(resolveCategoryName(name, pendingChanges), locale).then((data) => {
      if (active)
        setChildren(
          overlaySubcategories(name, data.subcategories, pendingChanges, confirmedCreations),
        );
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only refetch on external version bump
  }, [version]);

  function toggle() {
    if (!expandable) return;
    setExpanded((prev) => !prev);
  }

  // Fetch children whenever the node is expanded but hasn't loaded yet —
  // covers both manual toggle() and the render-phase auto-expand above.
  useEffect(() => {
    if (!(expanded && children === null && !loading)) return;
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(false);
      try {
        const synthetic = syntheticChildrenFor(name, pendingChanges);
        if (synthetic) {
          if (active) setChildren(synthetic);
          return;
        }
        const data = await getCategoryChildrenCached(resolveCategoryName(name, pendingChanges), locale);
        if (active)
          setChildren(
            overlaySubcategories(name, data.subcategories, pendingChanges, confirmedCreations),
          );
      } catch {
        if (active) {
          setError(true);
          setExpanded(false);
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when expanded flips; load() reads latest closures
  }, [expanded]);

  // Scroll the active node into view when it becomes selected via the
  // main content area (clicking into a subcategory, breadcrumb, etc.).
  useEffect(() => {
    if (isActive) {
      rowRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [isActive]);

  // Spring-loaded folder: hovering a dragged item over a collapsed, expandable
  // node auto-expands it after a short pause, so the user can drill down and
  // drop into a nested category without letting go.
  useEffect(() => {
    if (!(isOver && expandable && !expanded)) return;
    const timer = setTimeout(() => setExpanded(true), 600);
    return () => clearTimeout(timer);
  }, [isOver, expandable, expanded]);

  return (
    <li>
      <div
        ref={rowRef}
        draggable={parent != null}
        onDragStart={(e) => {
          if (!parent) return;
          setDragging(true);
          setDragPayload(e, {
            pageTitle: withCategoryPrefix(name),
            fromCategory: parent,
            kind: "category",
            subcat: {
              title: withCategoryPrefix(name),
              name,
              files,
              subcats,
              wikidata: null,
            },
          });
        }}
        onDragEnd={() => setDragging(false)}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`group flex items-center gap-1 rounded-md pr-2 text-sm ${
          parent != null ? "cursor-grab active:cursor-grabbing" : ""
        } ${dragging ? "opacity-50" : ""} ${
          isActive ? "bg-slate-900 text-white" : "hover:bg-slate-100"
        } ${isOver ? "ring-2 ring-inset ring-slate-900" : ""}`}
        style={{ paddingLeft: `${level * 12 + 4}px` }}
      >
        <Tooltip label={expanded ? t("collapse") : t("expand")}>
          <button
            type="button"
            onClick={toggle}
            aria-label={expanded ? t("collapse") : t("expand")}
            className={`grid h-5 w-5 shrink-0 place-items-center rounded ${
              expandable ? "" : "invisible"
            } ${isActive ? "hover:bg-white/20" : "hover:bg-slate-200"}`}
          >
            <Chevron open={expanded} />
          </button>
        </Tooltip>

        <button
          type="button"
          onClick={() => selectPath(path)}
          className="flex min-w-0 flex-1 items-center justify-between gap-2 py-1 text-left"
        >
          <span className="truncate">{name}</span>
          {files != null && files > 0 && (
            <span
              className={`shrink-0 rounded-full px-1.5 text-[11px] tabular-nums ${
                isActive
                  ? "bg-white/20 text-white"
                  : "bg-slate-100 text-slate-500 group-hover:bg-slate-200"
              }`}
            >
              {files}
            </span>
          )}
        </button>
      </div>

      {expanded && (
        <ul>
          {loading && (
            <li
              className="py-1 text-xs text-slate-400"
              style={{ paddingLeft: `${(level + 1) * 12 + 24}px` }}
            >
              {t("loading")}
            </li>
          )}
          {error && (
            <li
              className="py-1 text-xs text-red-500"
              style={{ paddingLeft: `${(level + 1) * 12 + 24}px` }}
            >
              {t("loading")}
            </li>
          )}
          {children?.map((child) => (
            <CategoryNode
              key={child.title}
              name={child.name}
              path={[...path, child.name]}
              subcats={child.subcats}
              files={child.files}
              level={level + 1}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      className={`transition-transform ${open ? "rotate-90" : ""}`}
      aria-hidden
    >
      <path
        d="M4 2.5L7.5 6L4 9.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
