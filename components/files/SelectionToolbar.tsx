"use client";

import { useTranslations } from "next-intl";
import { useBrowser } from "@/components/browser/BrowserProvider";

export default function SelectionToolbar() {
  const t = useTranslations("merge");
  const { selected, clearSelected, setMergeModalOpen } = useBrowser();

  if (selected.size === 0) return null;

  return (
    <div className="flex items-center justify-between gap-3 bg-slate-900 px-4 py-2 text-sm text-white">
      <span>{t("selectedCount", { count: selected.size })}</span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMergeModalOpen(true)}
          className="rounded-md bg-white px-3 py-1 text-xs font-medium text-slate-900 hover:bg-slate-100"
        >
          {t("mergeButton")}
        </button>
        <button
          type="button"
          onClick={clearSelected}
          className="rounded-md px-3 py-1 text-xs font-medium text-white/80 hover:bg-white/10"
        >
          {t("clearSelection")}
        </button>
      </div>
    </div>
  );
}
