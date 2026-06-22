"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { searchWikidataItems } from "@/lib/api";
import Modal from "@/components/ui/Modal";
import { formFieldInputClassName } from "@/components/ui/FormField";

interface WikidataResult {
  id: string;
  label: string;
  description: string | null;
}

export default function AddDepictModal({
  existingIds,
  onAdd,
  onClose,
}: {
  existingIds: string[];
  onAdd: (item: WikidataResult) => void;
  onClose: () => void;
}) {
  const t = useTranslations("detail");
  const locale = useLocale();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WikidataResult[]>([]);
  const [loading, setLoading] = useState(false);

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

  return (
    <Modal
      title={t("addDepictTitle")}
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100"
        >
          {t("cancel")}
        </button>
      }
    >
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("depictSearchPlaceholder")}
        className={formFieldInputClassName}
      />

      <ul className="max-h-64 space-y-1 overflow-y-auto">
        {loading && (
          <li className="px-1 py-2 text-sm text-slate-400">{t("searching")}</li>
        )}
        {!loading &&
          results
            .filter((item) => !existingIds.includes(item.id))
            .map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    onAdd(item);
                    onClose();
                  }}
                  className="flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-100"
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
        {!loading && query.trim() && results.length === 0 && (
          <li className="px-1 py-2 text-sm text-slate-400">{t("noResults")}</li>
        )}
      </ul>
    </Modal>
  );
}
