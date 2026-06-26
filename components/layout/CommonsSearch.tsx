"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { searchCategories, searchUsers } from "@/lib/api";
import { useBrowser } from "@/components/browser/BrowserProvider";
import { formFieldInputClassName } from "@/components/ui/FormField";

type Result =
  | { type: "category"; name: string; files: number | null }
  | { type: "user"; username: string };

/** Header-level instant search across all of Wikimedia Commons — picking a
 * category jumps the browser there via `setRoot`, picking a user opens the
 * profile view via `setProfileUser`. Distinct from `SearchBox`, which
 * searches files within the currently open category. */
export default function CommonsSearch() {
  const t = useTranslations("common");
  const { setRoot, setProfileUser } = useBrowser();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing stale results when the query is emptied, not deriving render state
      setResults([]);
      return;
    }
    let active = true;
    setLoading(true);
    const timer = setTimeout(() => {
      Promise.all([searchCategories(trimmed), searchUsers(trimmed)])
        .then(([categories, users]) => {
          if (!active) return;
          setResults([
            ...categories.map((c): Result => ({ type: "category", name: c.name, files: c.files })),
            ...users.map((u): Result => ({ type: "user", username: u.username })),
          ]);
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

  const select = (result: Result) => {
    if (result.type === "category") setRoot(result.name);
    else setProfileUser(result.username);
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && query.trim() && results.length > 0) {
            e.preventDefault();
            select(results[0]);
          }
        }}
        placeholder={t("commonsSearchPlaceholder")}
        className={formFieldInputClassName}
      />
      {open && query.trim() && (
        <ul className="absolute z-40 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border-base bg-panel shadow-lg">
          {loading && (
            <li className="px-2 py-1.5 text-sm text-slate-400">{t("searching")}</li>
          )}
          {!loading &&
            results.map((result) => (
              <li key={result.type === "category" ? `c:${result.name}` : `u:${result.username}`}>
                <button
                  type="button"
                  onClick={() => select(result)}
                  className="flex w-full items-baseline gap-2 px-2 py-1.5 text-left text-sm hover:bg-slate-100"
                >
                  {result.type === "category" ? (
                    <>
                      <span className="truncate text-slate-700">{result.name}</span>
                      {result.files != null && (
                        <span className="ml-auto shrink-0 text-xs text-slate-400">
                          {result.files}
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="truncate text-slate-700">{result.username}</span>
                      <span className="ml-auto shrink-0 text-xs text-slate-400">
                        {t("userResult")}
                      </span>
                    </>
                  )}
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
