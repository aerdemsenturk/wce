"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { updateFileDescription } from "@/lib/api";
import type { LangText } from "@/lib/types";

export default function DescriptionField({
  title,
  descriptions,
  onSaved,
}: {
  title: string;
  descriptions: LangText[];
  onSaved: (next: LangText[]) => void;
}) {
  const t = useTranslations("detail");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  if (descriptions.length === 0) {
    return <span className="text-sm text-slate-300">—</span>;
  }

  function startEdit(index: number) {
    setEditingIndex(index);
    setDraft(descriptions[index].value);
    setError(false);
  }

  async function save(index: number) {
    setSaving(true);
    setError(false);
    try {
      await updateFileDescription(title, descriptions[index].lang, draft);
      const next = descriptions.map((d, i) =>
        i === index ? { ...d, value: draft.trim() } : d,
      );
      onSaved(next);
      setEditingIndex(null);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ul className="space-y-1.5">
      {descriptions.map((d, i) => (
        <li key={`${d.lang}-${i}`} className="group flex gap-2 text-sm">
          {d.lang !== "und" && (
            <span className="mt-0.5 shrink-0 rounded bg-slate-100 px-1 text-[10px] font-semibold uppercase text-slate-500">
              {d.lang}
            </span>
          )}

          {editingIndex === i ? (
            <div className="flex-1 space-y-1.5">
              <textarea
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-border-base bg-background px-2 py-1.5 text-sm outline-none focus:border-slate-400"
              />
              {error && <p className="text-xs text-red-500">{t("saveError")}</p>}
              <div className="flex gap-1.5">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void save(i)}
                  className="rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
                >
                  {saving ? t("saving") : t("save")}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setEditingIndex(null)}
                  className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
                >
                  {t("cancel")}
                </button>
              </div>
            </div>
          ) : (
            <>
              <span className="flex-1 text-slate-700">{d.value}</span>
              <button
                type="button"
                onClick={() => startEdit(i)}
                aria-label={t("edit")}
                className="shrink-0 text-slate-300 hover:text-slate-600"
              >
                <PencilIcon />
              </button>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

function PencilIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M11 2l3 3-7.5 7.5L3 13l.5-3.5L11 2Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
