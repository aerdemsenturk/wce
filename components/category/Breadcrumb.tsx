"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useBrowser } from "@/components/browser/BrowserProvider";
import { getCategoryParentsCached } from "@/lib/api";
import type { Subcategory } from "@/lib/types";

export default function Breadcrumb() {
  const tSidebar = useTranslations("sidebar");
  const locale = useLocale();
  const { root, path, selectPath, setTreeParent, version } = useBrowser();
  const [parentMenuOpen, setParentMenuOpen] = useState(false);
  // Tagged with the category it was fetched for, same guard as CategoryTree's
  // copy of this fetch — avoids flashing the previous root's parents while the
  // new root's request is still in flight.
  const [parentData, setParentData] = useState<{
    root: string;
    parents: Subcategory[];
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!root) {
      setParentData(null);
      return;
    }
    let active = true;
    getCategoryParentsCached(root, locale)
      .then((data) => {
        if (active) setParentData({ root, parents: data });
      })
      .catch(() => {
        if (active) setParentData({ root, parents: [] });
      });
    return () => {
      active = false;
    };
  }, [root, locale, version]);

  useEffect(() => {
    if (!parentMenuOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setParentMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [parentMenuOpen]);

  if (path.length === 0) return null;

  const promoted = path.length > 1 ? path[0] : null;
  const altParents =
    parentData && parentData.root === root
      ? parentData.parents.filter((p) => p.name !== promoted)
      : [];

  return (
    <>
      <nav aria-label="breadcrumb" className="flex flex-wrap items-center gap-1 text-sm">
        {path.map((name, i) => {
          const isLast = i === path.length - 1;
          // The switcher controls which name appears at the very start of the
          // trail (`path[0]`), so it belongs right after that first segment —
          // not next to the entered category, which may sit deeper in `path`.
          const showParentSwitcher = i === 0 && altParents.length > 0;
          return (
            <span key={`${name}-${i}`} className="flex items-center gap-1">
              {i > 0 && <span className="text-slate-300">/</span>}
              {isLast ? (
                <span className="font-semibold text-slate-900">{name}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => selectPath(path.slice(0, i + 1))}
                  className="text-slate-500 hover:text-slate-900 hover:underline"
                >
                  {name}
                </button>
              )}
              {showParentSwitcher && (
                <span ref={menuRef} className="relative flex items-center">
                  <button
                    type="button"
                    onClick={() => setParentMenuOpen((open) => !open)}
                    aria-label={tSidebar("otherParents", { count: altParents.length })}
                    title={tSidebar("otherParents", { count: altParents.length })}
                    aria-expanded={parentMenuOpen}
                    className="text-slate-300 hover:text-slate-600"
                  >
                    <ChevronIcon />
                  </button>
                  {parentMenuOpen && (
                    <div className="absolute left-0 top-full z-10 mt-1 min-w-[10rem] rounded-md border border-border-base bg-background py-1 shadow-md">
                      {altParents.map((p) => (
                        <button
                          key={p.title}
                          type="button"
                          onClick={() => {
                            setTreeParent(p.name);
                            setParentMenuOpen(false);
                          }}
                          title={tSidebar("useAsParent", { name: p.name })}
                          className="block w-full truncate px-3 py-1 text-left text-xs text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  )}
                </span>
              )}
            </span>
          );
        })}
      </nav>
    </>
  );
}

function ChevronIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M3 4.5L6 7.5L9 4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
