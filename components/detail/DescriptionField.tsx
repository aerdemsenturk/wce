"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { LangText } from "@/lib/types";
import { useBrowser } from "@/components/browser/BrowserProvider";
import EditDescriptionModal from "./EditDescriptionModal";

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
  const { pendingChanges, addChange } = useBrowser();
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  if (descriptions.length === 0) {
    return <span className="text-sm text-slate-300">—</span>;
  }

  function save(index: number, value: string) {
    addChange({
      id: crypto.randomUUID(),
      type: "description",
      fileTitle: title,
      lang: descriptions[index].lang,
      newValue: value,
      label: t("descriptionChangeLabel", { name: title.replace(/^File:/i, "") }),
    });
    const next = descriptions.map((d, i) => (i === index ? { ...d, value } : d));
    onSaved(next);
  }

  return (
    <>
      <ul className="space-y-1.5">
        {descriptions.map((d, i) => {
          const pendingId = [...pendingChanges]
            .reverse()
            .find((c) => c.type === "description" && c.fileTitle === title && c.lang === d.lang)
            ?.id;
          return (
            <li
              key={`${d.lang}-${i}`}
              className={`group flex items-center gap-2 rounded-md px-1.5 py-1 text-sm ${
                pendingId ? "bg-amber-50" : ""
              }`}
            >
              {d.lang !== "und" && (
                <span className="shrink-0 rounded bg-slate-100 px-1 text-[10px] font-semibold uppercase text-slate-500">
                  {d.lang}
                </span>
              )}
              <span className="flex-1 text-slate-700">{d.value}</span>
              {pendingId && (
                <span
                  title={t("pendingChange")}
                  className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
                >
                  {t("pendingChange")}
                </span>
              )}
              <button
                type="button"
                onClick={() => setEditingIndex(i)}
                aria-label={t("edit")}
                className="shrink-0 text-slate-300 hover:text-slate-600"
              >
                <PencilIcon />
              </button>
            </li>
          );
        })}
      </ul>

      {editingIndex != null && (
        <EditDescriptionModal
          lang={descriptions[editingIndex].lang}
          value={descriptions[editingIndex].value}
          onSave={(value) => save(editingIndex, value)}
          onClose={() => setEditingIndex(null)}
        />
      )}
    </>
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
