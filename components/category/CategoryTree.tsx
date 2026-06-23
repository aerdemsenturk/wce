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
  const { root, setRoot, clearRoot, version } = useBrowser();
  const [input, setInput] = useState("");
  const [parents, setParents] = useState<Subcategory[] | null>(null);

  // When a root is opened, surface its parent categories (the ancestors it's
  // filed under on Commons) above the tree so the user can navigate upward.
  useEffect(() => {
    if (!root) {
      setParents(null);
      return;
    }
    let active = true;
    setParents(null);
    getCategoryParentsCached(root, locale)
      .then((data) => {
        if (active) setParents(data);
      })
      .catch(() => {
        if (active) setParents([]);
      });
    return () => {
      active = false;
    };
  }, [root, locale, version]);

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

      {parents && parents.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 border-b border-border-base pb-2">
          {parents.map((parent) => (
            <button
              key={parent.title}
              type="button"
              onClick={() => setRoot(parent.name)}
              title={t("goToParent", { name: parent.name })}
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
          key={root}
          name={root}
          path={[root]}
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
