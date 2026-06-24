"use client";

import { useTranslations } from "next-intl";
import type { ContentView } from "@/components/browser/BrowserProvider";

export default function ActivityViewHeader({
  view,
  onBack,
}: {
  view: Exclude<ContentView, "category">;
  onBack: () => void;
}) {
  const t = useTranslations("activity");

  return (
    <div className="mb-4 flex items-center justify-between border-b border-border-base pb-3">
      <h1 className="text-base font-semibold text-slate-700">
        {view === "activity" ? t("historyTitle") : t("uploadsTitle")}
      </h1>
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100"
      >
        <BackIcon />
        {t("back")}
      </button>
    </div>
  );
}

function BackIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M9.5 3.5 4 8l5.5 4.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
