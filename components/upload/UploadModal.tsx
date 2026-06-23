"use client";

import { useId, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useBrowser } from "@/components/browser/BrowserProvider";
import { uploadFileToCommons } from "@/lib/api";
import { formFieldInputClassName } from "@/components/ui/FormField";
import FilePreview from "./FilePreview";

type RowStatus = "idle" | "uploading" | "done" | "error";

interface Row {
  id: string;
  file: File;
  filename: string;
  description: string;
  status: RowStatus;
  error?: string;
}

const LICENSE_OPTIONS = [
  { value: "cc-by-sa-4.0", labelKey: "licenseCcBySa4" },
  { value: "cc-by-4.0", labelKey: "licenseCcBy4" },
  { value: "cc0", labelKey: "licenseCc0" },
  { value: "pd-self", labelKey: "licensePdSelf" },
] as const;

/** Today (or the file's own modified date) as YYYY-MM-DD for the date field. */
function isoDate(ms?: number): string {
  const d = ms ? new Date(ms) : new Date();
  return Number.isNaN(d.getTime())
    ? new Date().toISOString().slice(0, 10)
    : d.toISOString().slice(0, 10);
}

export default function UploadModal({
  files,
  onClose,
}: {
  files: File[];
  onClose: () => void;
}) {
  const t = useTranslations("upload");
  const locale = useLocale();
  const titleId = useId();
  const { current, showToast, bumpVersion } = useBrowser();

  // Metadata shared across every file in this batch.
  const [author, setAuthor] = useState("");
  const [source, setSource] = useState("{{own}}");
  const [date, setDate] = useState(() => isoDate(files[0]?.lastModified));
  const [license, setLicense] = useState<string>(LICENSE_OPTIONS[0].value);
  const [categories, setCategories] = useState<string[]>(
    current ? [current] : [],
  );
  const [categoryInput, setCategoryInput] = useState("");

  const [rows, setRows] = useState<Row[]>(() =>
    files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      filename: file.name,
      description: "",
      status: "idle" as RowStatus,
    })),
  );
  const [uploading, setUploading] = useState(false);

  const pending = useMemo(
    () => rows.filter((r) => r.status !== "done"),
    [rows],
  );
  const allDone = rows.length > 0 && pending.length === 0;
  const canUpload =
    !uploading &&
    pending.length > 0 &&
    rows.every((r) => r.filename.trim().length > 0);

  function patchRow(id: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function removeRow(id: string) {
    // The previews effect revokes the dropped URL when the row set changes.
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  function addCategory() {
    const clean = categoryInput.trim().replace(/^Category:/i, "");
    if (!clean) return;
    setCategories((prev) =>
      prev.some((c) => c.toLowerCase() === clean.toLowerCase())
        ? prev
        : [...prev, clean],
    );
    setCategoryInput("");
  }

  async function uploadAll() {
    setUploading(true);
    let uploaded = 0;
    let anyFailed = false;
    // Sequential: gives per-file progress and is gentle on the API.
    for (const row of rows) {
      if (row.status === "done") continue;
      patchRow(row.id, { status: "uploading", error: undefined });
      try {
        await uploadFileToCommons(row.file, {
          filename: row.filename.trim(),
          description: row.description,
          descriptionLang: locale,
          date,
          author,
          source,
          license,
          categories,
        });
        patchRow(row.id, { status: "done" });
        uploaded += 1;
      } catch (err) {
        patchRow(row.id, {
          status: "error",
          error: err instanceof Error ? err.message : t("genericError"),
        });
        anyFailed = true;
      }
    }
    setUploading(false);

    if (uploaded > 0) {
      showToast({ message: t("success", { count: uploaded }), tone: "success" });
      bumpVersion(); // so the current category's grid picks up the new files
    }
    // Every attempted file succeeded (none were left failing) — close. On any
    // failure, stay open so the errors remain visible for a retry.
    if (!anyFailed) onClose();
  }

  return (
    <div
      role="dialog"
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onClick={uploading ? undefined : onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88vh] w-full max-w-2xl flex-col gap-4 rounded-lg bg-panel p-5 shadow-xl"
      >
        <div className="space-y-1">
          <h2 id={titleId} className="text-sm font-semibold text-slate-800">
            {t("title", { count: rows.length })}
          </h2>
          <p className="text-[11px] text-amber-600">{t("warnProduction")}</p>
        </div>

        {/* Shared metadata */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">
              {t("author")}
            </span>
            <input
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder={t("authorPlaceholder")}
              disabled={uploading}
              className={formFieldInputClassName}
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">
              {t("date")}
            </span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={uploading}
              className={formFieldInputClassName}
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">
              {t("source")}
            </span>
            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder={t("sourcePlaceholder")}
              disabled={uploading}
              className={formFieldInputClassName}
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">
              {t("license")}
            </span>
            <select
              value={license}
              onChange={(e) => setLicense(e.target.value)}
              disabled={uploading}
              className={formFieldInputClassName}
            >
              {LICENSE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t(opt.labelKey)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Shared categories */}
        <div className="space-y-1">
          <span className="text-xs font-medium text-slate-500">
            {t("categories")}
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {categories.map((c) => (
              <span
                key={c}
                className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700 ring-1 ring-amber-200"
              >
                {c}
                <button
                  type="button"
                  onClick={() => setCategories((p) => p.filter((x) => x !== c))}
                  disabled={uploading}
                  aria-label={t("removeCategory", { name: c })}
                  className="text-amber-400 hover:text-amber-700"
                >
                  ×
                </button>
              </span>
            ))}
            <input
              value={categoryInput}
              onChange={(e) => setCategoryInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCategory();
                }
              }}
              placeholder={t("categoriesPlaceholder")}
              disabled={uploading}
              className="min-w-[8rem] flex-1 rounded-md border border-border-base bg-background px-2 py-1 text-xs outline-none focus:border-slate-400"
            />
          </div>
        </div>

        {/* Per-file rows */}
        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-md border border-border-base p-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex gap-3 rounded-md border border-border-base p-2"
            >
              <FilePreview
                file={row.file}
                alt={row.filename}
                className="h-16 w-16 shrink-0 rounded bg-slate-100 object-cover"
              />

              <div className="min-w-0 flex-1 space-y-1.5">
                <input
                  value={row.filename}
                  onChange={(e) =>
                    patchRow(row.id, { filename: e.target.value })
                  }
                  disabled={uploading || row.status === "done"}
                  placeholder={t("filename")}
                  className="w-full rounded-md border border-border-base bg-background px-2 py-1 text-sm outline-none focus:border-slate-400"
                />
                <textarea
                  value={row.description}
                  onChange={(e) =>
                    patchRow(row.id, { description: e.target.value })
                  }
                  disabled={uploading || row.status === "done"}
                  rows={2}
                  placeholder={t("descriptionPlaceholder")}
                  className="w-full resize-none rounded-md border border-border-base bg-background px-2 py-1 text-xs outline-none focus:border-slate-400"
                />
                {row.status === "error" && row.error && (
                  <p className="text-[11px] text-red-500">{row.error}</p>
                )}
              </div>

              <div className="flex shrink-0 flex-col items-end justify-between">
                <StatusBadge status={row.status} t={t} />
                {row.status !== "done" && !uploading && (
                  <button
                    type="button"
                    onClick={() => removeRow(row.id)}
                    aria-label={t("removeFile")}
                    className="text-slate-300 hover:text-slate-600"
                  >
                    <TrashIcon />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-40"
          >
            {allDone ? t("close") : t("cancel")}
          </button>
          {!allDone && (
            <button
              type="button"
              onClick={uploadAll}
              disabled={!canUpload}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            >
              {uploading
                ? t("uploading")
                : t("uploadButton", { count: pending.length })}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({
  status,
  t,
}: {
  status: RowStatus;
  t: ReturnType<typeof useTranslations>;
}) {
  if (status === "done") {
    return (
      <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 ring-1 ring-emerald-200">
        {t("statusDone")}
      </span>
    );
  }
  if (status === "uploading") {
    return (
      <span className="rounded-full bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-600 ring-1 ring-sky-200">
        {t("statusUploading")}
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600 ring-1 ring-red-200">
        {t("statusError")}
      </span>
    );
  }
  return <span />;
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3 4.5h10M6.5 4.5V3.5a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1M5 4.5l.5 8a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1l.5-8"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
