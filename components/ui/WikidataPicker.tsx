"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { searchWikidataItems } from "@/lib/api";
import { formFieldInputClassName } from "@/components/ui/FormField";

export interface WikidataPickerValue {
  id: string;
  label: string | null;
}

/** Instant-search Wikidata item picker — same search-as-you-type UX as
 * AddDepictModal, but embedded inline in a form instead of its own modal,
 * so it can be used as a form field (e.g. linking a category to an item). */
export default function WikidataPicker({
  value,
  onChange,
}: {
  value: WikidataPickerValue | null;
  onChange: (value: WikidataPickerValue | null) => void;
}) {
  const t = useTranslations("common");
  const locale = useLocale();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    { id: string; label: string; description: string | null }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }
    let active = true;
    setLoading(true);
    const timer = setTimeout(() => {
      searchWikidataItems(trimmed, locale)
        .then((items) => {
          if (active) setResults(items);
        })
        .catch(() => {
          if (active) setResults([]);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, locale]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border-base bg-background px-3 py-1.5 text-sm">
        <span className="flex-1 truncate text-slate-700">{value.label ?? value.id}</span>
        {value.label && (
          <span className="shrink-0 font-mono text-[11px] text-slate-400">{value.id}</span>
        )}
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label={t("clearSelection")}
          className="shrink-0 text-slate-400 hover:text-slate-700"
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={t("wikidataSearchPlaceholder")}
        className={formFieldInputClassName}
      />
      {open && query.trim() && (
        <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border-base bg-panel shadow-lg">
          {loading && (
            <li className="px-2 py-1.5 text-sm text-slate-400">{t("searching")}</li>
          )}
          {!loading &&
            results.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange({ id: item.id, label: item.label });
                    setQuery("");
                    setOpen(false);
                  }}
                  className="flex w-full items-baseline gap-2 px-2 py-1.5 text-left text-sm hover:bg-slate-100"
                >
                  <span className="text-slate-700">{item.label}</span>
                  {item.description && (
                    <span className="truncate text-xs text-slate-400">{item.description}</span>
                  )}
                  <span className="ml-auto shrink-0 font-mono text-[10px] text-slate-400">
                    {item.id}
                  </span>
                </button>
              </li>
            ))}
          {!loading && results.length === 0 && (
            <li className="px-2 py-1.5 text-sm text-slate-400">{t("noResults")}</li>
          )}
        </ul>
      )}
    </div>
  );
}
