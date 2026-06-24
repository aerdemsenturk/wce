"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useBrowser } from "@/components/browser/BrowserProvider";
import { getCategoryParentsCached } from "@/lib/api";
import type { Subcategory } from "@/lib/types";
import CategoryNode from "./CategoryNode";

export default function CategoryTree() {
  const t = useTranslations("sidebar");
  const locale = useLocale();
  const { root, path, setTreeParent, version } = useBrowser();
  const current = path[path.length - 1] ?? root;
  // Parents are tagged with the category they belong to: when the active
  // category changes (navigating the tree) the previous fetch's parents must
  // not be reused for the new one, or we'd show/promote the wrong parent.
  const [parentData, setParentData] = useState<{
    category: string;
    parents: Subcategory[];
  } | null>(null);

  // Whenever the active category changes, fetch the parents it's filed under
  // on Commons. While still at the root (no drill-down yet) one of them is
  // promoted to the top of the tree (below); the rest stay as badges the
  // user can click to swap which parent sits at the top.
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
  const parents =
    parentData && parentData.category === current ? parentData.parents : null;

  // Auto-promote the first parent as the tree's level-1 node while the entered
  // category is still the top of the tree (path === [root]). Once promoted the
  // path grows, so this no-ops and won't fight downward navigation.
  useEffect(() => {
    if (parents && parents.length > 0 && path.length === 1 && path[0] === root) {
      setTreeParent(parents[0].name);
    }
  }, [parents, path, root, setTreeParent]);

  // Exclude the parent already visible immediately above the active category
  // in the tree (the one promoted to the top, or the one just navigated
  // through) from the badge list — it'd be a redundant "go to parent" badge.
  const visibleParent = path.length > 1 ? path[path.length - 2] : null;
  const altParents = (parents ?? []).filter((p) => p.name !== visibleParent);
  const treeTop = path[0] ?? root;

  if (!root) {
    return <p className="text-sm text-slate-400">{t("empty")}</p>;
  }

  return (
    <div className="space-y-2">
      {altParents.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 border-b border-border-base pb-2">
          {altParents.map((parent) => (
            <button
              key={parent.title}
              type="button"
              onClick={() => setTreeParent(parent.name)}
              title={t("useAsParent", { name: parent.name })}
              className="inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            >
              <UpIcon />
              <span className="truncate">{parent.name}</span>
            </button>
          ))}
        </div>
      )}

      <ul>
        <CategoryNode
          key={treeTop}
          name={treeTop}
          path={[treeTop]}
          subcats={null}
          files={null}
          level={0}
        />
      </ul>
    </div>
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
