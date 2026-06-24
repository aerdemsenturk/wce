"use client";

import { useTranslations } from "next-intl";
import { useBrowser } from "@/components/browser/BrowserProvider";
import CategoryTree from "@/components/category/CategoryTree";
import FavoriteCategories from "@/components/category/FavoriteCategories";
import RecentCategories from "@/components/category/RecentCategories";

export default function Sidebar() {
  const t = useTranslations("sidebar");
  const { toggleSidebar } = useBrowser();

  return (
    <aside className="flex h-full w-full flex-col border-r border-border-base bg-panel">
      <div className="flex h-11 items-center justify-between border-b border-border-base px-4">
        <h2 className="text-xs font-semibold text-slate-500">
          {t("title")}
        </h2>
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={t("collapseSidebar")}
          title={t("collapseSidebar")}
          className="text-slate-400 hover:text-slate-700"
        >
          <CollapseIcon />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <CategoryTree />
      </div>
      <FavoriteCategories />
      <RecentCategories />
    </aside>
  );
}

function CollapseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M7.5 2.5L3.5 6L7.5 9.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
