"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { createCategoryFromSelection } from "@/lib/api";
import { useBrowser } from "@/components/browser/BrowserProvider";

export default function CreateCategoryModal({
  parentCategory,
  fileTitles,
  onClose,
}: {
  parentCategory: string;
  fileTitles: string[];
  onClose: () => void;
}) {
  const t = useTranslations("merge");
  const titleId = useId();
  const { path, selectPath, clearSelected, bumpVersion, showToast } = useBrowser();

  const [name, setName] = useState("");
  const [qid, setQid] = useState("");
  const [included, setIncluded] = useState<Set<string>>(new Set(fileTitles));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(title: string) {
    setIncluded((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }

  async function submit() {
    const cleanName = name.trim();
    if (!cleanName || included.size === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await createCategoryFromSelection(
        cleanName,
        parentCategory,
        [...included],
        qid.trim() || undefined,
      );
      bumpVersion();
      clearSelected();
      if (result.failed.length > 0) {
        showToast({
          message: t("partialSuccess", {
            moved: result.moved.length,
            failed: result.failed.length,
          }),
          tone: "error",
        });
      } else {
        showToast({ message: t("success", { name: cleanName }), tone: "success" });
      }
      selectPath([...path, cleanName]);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error"));
    } finally {
      setSubmitting(false);
    }
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
            {fileTitles.map((title) => (
              <li key={title} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={included.has(title)}
                  onChange={() => toggle(title)}
                  className="shrink-0"
                />
                <span className="truncate text-slate-700">
                  {title.replace(/^File:/i, "")}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting || !name.trim() || included.size === 0}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            {submitting ? t("creating") : t("create")}
          </button>
        </div>
      </div>
    </div>
  );
}
