"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { searchCategories } from "@/lib/api";
import { formFieldInputClassName } from "@/components/ui/FormField";

/** Instant-search existing Commons categories, with a free-text fallback —
 * pressing Enter (or clicking a result) calls `onSelect` even if the typed
 * name doesn't appear in the search results, since a category page may
 * exist without matching `intitle:` search. */
export default function CategoryPicker({
  onSelect,
  excluding = [],
}: {
  onSelect: (name: string) => void;
  excluding?: string[];
}) {
  const t = useTranslations("common");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ name: string; files: number | null }[]>([]);
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
      searchCategories(trimmed)
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
  }, [query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const filtered = results.filter((r) => !excluding.includes(r.name));

  return (
    <div ref={containerRef} className="relative">
      <input
        autoFocus
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && query.trim()) {
            e.preventDefault();
            onSelect(query.trim());
          }
        }}
        placeholder={t("categorySearchPlaceholder")}
        className={formFieldInputClassName}
      />
      {open && query.trim() && (
        <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border-base bg-panel shadow-lg">
          {loading && (
            <li className="px-2 py-1.5 text-sm text-slate-400">{t("searching")}</li>
          )}
          {!loading &&
            filtered.map((item) => (
              <li key={item.name}>
                <button
                  type="button"
                  onClick={() => onSelect(item.name)}
                  className="flex w-full items-baseline gap-2 px-2 py-1.5 text-left text-sm hover:bg-slate-100"
                >
                  <span className="truncate text-slate-700">{item.name}</span>
                  {item.files != null && (
                    <span className="ml-auto shrink-0 text-xs text-slate-400">{item.files}</span>
                  )}
                </button>
              </li>
            ))}
          {!loading && filtered.length === 0 && (
            <li className="px-2 py-1.5 text-sm text-slate-400">{t("noResults")}</li>
          )}
        </ul>
      )}
    </div>
  );
}
