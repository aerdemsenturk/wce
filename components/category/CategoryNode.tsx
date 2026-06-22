"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { getCategoryChildrenCached } from "@/lib/api";
import type { Subcategory } from "@/lib/types";
import { useBrowser } from "@/components/browser/BrowserProvider";

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
  const { path: activePath, selectPath } = useBrowser();

  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [children, setChildren] = useState<Subcategory[] | null>(null);

  const isActive = activePath.join("/") === path.join("/");
  const expandable = subcats === null || subcats > 0;

  async function toggle() {
    if (!expandable) return;
    const next = !expanded;
    setExpanded(next);
    if (next && children === null && !loading) {
      setLoading(true);
      setError(false);
      try {
        const data = await getCategoryChildrenCached(name, locale);
        setChildren(data.subcategories);
      } catch {
        setError(true);
        setExpanded(false);
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <li>
      <div
        className={`group flex items-center gap-1 rounded-md pr-2 text-sm ${
          isActive ? "bg-slate-900 text-white" : "hover:bg-slate-100"
        }`}
        style={{ paddingLeft: `${level * 12 + 4}px` }}
      >
        <button
          type="button"
          onClick={toggle}
          aria-label={expanded ? "collapse" : "expand"}
          className={`grid h-5 w-5 shrink-0 place-items-center rounded ${
            expandable ? "" : "invisible"
          } ${isActive ? "hover:bg-white/20" : "hover:bg-slate-200"}`}
        >
          <Chevron open={expanded} />
        </button>

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
