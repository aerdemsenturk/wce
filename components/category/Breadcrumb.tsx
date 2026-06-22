"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useBrowser } from "@/components/browser/BrowserProvider";
import { renameCategory } from "@/lib/api";

export default function Breadcrumb() {
  const t = useTranslations("rename");
  const { path, selectPath, renameCurrent, bumpVersion, showToast } = useBrowser();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  if (path.length === 0) return null;
  const current = path[path.length - 1];
  const parent = path.length > 1 ? path[path.length - 2] : null;

  function startEdit() {
    setDraft(current);
    setEditing(true);
  }

  async function save() {
    const newName = draft.trim();
    if (!newName || newName === current) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const result = await renameCategory(current, newName, parent);
      bumpVersion();
      renameCurrent(newName);
      setEditing(false);
      if (result.failed.length > 0) {
        showToast({
          message: t("partialSuccess", {
            moved: result.moved.length,
            failed: result.failed.length,
          }),
          tone: "error",
        });
      } else {
        showToast({ message: t("success", { name: newName }), tone: "success" });
      }
    } catch (err) {
      showToast({
        message: err instanceof Error ? err.message : t("error"),
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <nav aria-label="breadcrumb" className="flex flex-wrap items-center gap-1 text-sm">
      {path.map((name, i) => {
        const isLast = i === path.length - 1;
        return (
          <span key={`${name}-${i}`} className="flex items-center gap-1">
            {i > 0 && <span className="text-slate-300">/</span>}
            {isLast ? (
              editing ? (
                <span className="flex items-center gap-1.5">
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void save();
                      if (e.key === "Escape") setEditing(false);
                    }}
                    disabled={saving}
                    className="rounded-md border border-border-base bg-background px-2 py-0.5 text-sm font-semibold outline-none focus:border-slate-400"
                  />
                  <button
                    type="button"
                    onClick={() => void save()}
                    disabled={saving}
                    className="rounded-md bg-slate-900 px-2 py-0.5 text-xs font-medium text-white disabled:opacity-50"
                  >
                    {saving ? t("saving") : t("save")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    disabled={saving}
                    className="rounded-md px-2 py-0.5 text-xs font-medium text-slate-500 hover:bg-slate-100"
                  >
                    {t("cancel")}
                  </button>
                </span>
              ) : (
                <span className="group flex items-center gap-1">
                  <span className="font-semibold text-slate-900">{name}</span>
                  <button
                    type="button"
                    onClick={startEdit}
                    aria-label={t("edit")}
                    className="text-slate-300 hover:text-slate-600"
                  >
                    <PencilIcon />
                  </button>
                </span>
              )
            ) : (
              <button
                type="button"
                onClick={() => selectPath(path.slice(0, i + 1))}
                className="text-slate-500 hover:text-slate-900 hover:underline"
              >
                {name}
              </button>
            )}
          </span>
        );
      })}
    </nav>
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
