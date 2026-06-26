"use client";

import { useTranslations } from "next-intl";
import { useBrowser } from "@/components/browser/BrowserProvider";

export default function SearchBanner({
  query,
  category,
  count,
}: {
  query: string;
  category: string | null;
  count: number | null;
}) {
  const t = useTranslations("search");
  const { setSearch } = useBrowser();

  return (
    <div
      data-no-marquee
      className="flex flex-wrap items-center gap-2 rounded-md bg-slate-100 px-3 py-2 text-sm"
    >
      <span className="text-slate-700">{t("resultsFor", { query })}</span>
      {category && (
        <span className="text-slate-400">· {t("inCategory", { category })}</span>
      )}
      {count != null && (
        <span className="tabular-nums text-slate-400">({count})</span>
      )}
      <button
        type="button"
        onClick={() => setSearch(null)}
        className="ml-auto text-xs text-sky-600 hover:underline"
      >
        {t("clear")}
      </button>
    </div>
  );
}
