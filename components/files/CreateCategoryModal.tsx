"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import type { CategoryFileInfo } from "@/lib/types";
import { useBrowser } from "@/components/browser/BrowserProvider";

export default function CreateCategoryModal({
  parentCategory,
  files,
  onClose,
}: {
  parentCategory: string;
  files: CategoryFileInfo[];
  onClose: () => void;
}) {
  const t = useTranslations("merge");
  const titleId = useId();
  const { path, selectPath, clearSelected, addChange, showToast } = useBrowser();

  const [name, setName] = useState("");
  const [qid, setQid] = useState("");
  const [included, setIncluded] = useState<Set<string>>(
    new Set(files.map((f) => f.title)),
  );

  function toggle(title: string) {
    setIncluded((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }

  function submit() {
    const cleanName = name.trim();
    if (!cleanName || included.size === 0) return;
    addChange({
      id: crypto.randomUUID(),
      type: "createCategory",
      name: cleanName,
      parentCategory,
      wikidataQid: qid.trim() || undefined,
      files: files.filter((f) => included.has(f.title)),
      label: t("createLabel", { name: cleanName, count: included.size }),
    });
    clearSelected();
    showToast({ message: t("queued", { name: cleanName }), tone: "success" });
    selectPath([...path, cleanName]);
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-4 rounded-lg bg-panel p-5 shadow-xl"
      >
        <h2 id={titleId} className="text-sm font-semibold text-slate-800">
          {t("title")}
        </h2>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-500">
            {t("nameLabel")}
          </label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("namePlaceholder")}
            className="w-full rounded-md border border-border-base bg-background px-3 py-1.5 text-sm outline-none focus:border-slate-400"
          />
          <p className="text-[11px] text-slate-400">
            {t("parentNote", { parent: parentCategory })}
          </p>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-500">
            {t("qidLabel")}
          </label>
          <input
            value={qid}
            onChange={(e) => setQid(e.target.value)}
            placeholder={t("qidPlaceholder")}
            className="w-full rounded-md border border-border-base bg-background px-3 py-1.5 text-sm outline-none focus:border-slate-400"
          />
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-500">
            {t("itemsLabel", { count: included.size })}
          </p>
          <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border-base p-2">
            {files.map((f) => (
              <li key={f.title} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={included.has(f.title)}
                  onChange={() => toggle(f.title)}
                  className="shrink-0"
                />
                <span className="truncate text-slate-700">{f.name}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!name.trim() || included.size === 0}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            {t("create")}
          </button>
        </div>
      </div>
    </div>
  );
}
