"use client";

import { useTranslations } from "next-intl";
import type { FilterCounts, FilterKey, SortKey } from "./filters";

const FILTERS: { key: FilterKey; label: keyof Messages }[] = [
  { key: "all", label: "all" },
  { key: "description", label: "missingDescription" },
  { key: "date", label: "missingDate" },
  { key: "location", label: "missingLocation" },
];

type Messages = {
  all: string;
  missingDescription: string;
  missingDate: string;
  missingLocation: string;
};

export default function FilterBar({
  counts,
  filter,
  onFilter,
  sort,
  onSort,
}: {
  counts: FilterCounts;
  filter: FilterKey;
  onFilter: (f: FilterKey) => void;
  sort: SortKey;
  onSort: (s: SortKey) => void;
}) {
  const t = useTranslations("filters");

  function countFor(key: FilterKey): number {
    return key === "all" ? counts.all : counts[key];
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map(({ key, label }) => {
          const isActive = filter === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onFilter(key)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                isActive
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {t(label)}
              <span
                className={`ml-1.5 tabular-nums ${
                  isActive ? "text-white/70" : "text-slate-400"
                }`}
              >
                {countFor(key)}
              </span>
            </button>
          );
        })}
      </div>

      <label className="flex items-center gap-2 text-xs text-slate-500">
        {t("sortLabel")}
        <select
          value={sort}
          onChange={(e) => onSort(e.target.value as SortKey)}
          className="rounded-md border border-border-base bg-panel px-2 py-1 text-xs text-slate-700 outline-none focus:border-slate-400"
        >
          <option value="name">{t("sortName")}</option>
          <option value="date">{t("sortDate")}</option>
          <option value="missing">{t("sortMissing")}</option>
        </select>
      </label>
    </div>
  );
}
