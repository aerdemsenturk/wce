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
  const { root, path, setRoot, clearRoot, setTreeParent, version } = useBrowser();
  const [input, setInput] = useState("");
  // Parents are tagged with the category they belong to: when the root changes
  // (e.g. clicking another favorite) the previous fetch's parents must not be
  // reused for the new root, or we'd promote the wrong parent onto the tree.
  const [parentData, setParentData] = useState<{
    root: string;
    parents: Subcategory[];
  } | null>(null);

  // When a category is entered, fetch the parents it's filed under on Commons.
  // One of them is promoted to the top of the tree (below); the rest stay as
  // badges the user can click to swap which parent sits at the top.
  useEffect(() => {
    if (!root) {
      setParentData(null);
      return;
    }
    let active = true;
    setParentData(null);
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

  // Only trust parents that were fetched for the current root.
  const parents =
    parentData && parentData.root === root ? parentData.parents : null;

  // Auto-promote the first parent as the tree's level-1 node while the entered
  // category is still the top of the tree (path === [root]). Once promoted the
  // path grows, so this no-ops and won't fight downward navigation.
  useEffect(() => {
    if (parents && parents.length > 0 && path.length === 1 && path[0] === root) {
      setTreeParent(parents[0].name);
    }
  }, [parents, path, root, setTreeParent]);

  // The parent currently sitting at the top of the tree (if any), and the
  // remaining "alternative" parents still shown as badges.
  const promoted = path.length > 1 ? path[0] : null;
  const altParents = (parents ?? []).filter((p) => p.name !== promoted);
  const treeTop = path[0] ?? root;

  if (!root) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setRoot(input);
        }}
        className="space-y-2"
      >
        <label className="block text-sm text-slate-600">
          {t("rootPrompt")}
        </label>
        <input
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t("rootPlaceholder")}
          className="w-full rounded-md border border-border-base bg-background px-3 py-1.5 text-sm outline-none focus:border-slate-400"
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="w-full rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        >
          {t("load")}
        </button>
      </form>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={clearRoot}
        className="inline-flex items-center gap-1.5 rounded-md border border-border-base bg-background px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      >
        <SearchIcon />
        {t("changeRoot")}
      </button>

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

function SearchIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      <circle cx="5" cy="5" r="3" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M7.5 7.5L10 10"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
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
