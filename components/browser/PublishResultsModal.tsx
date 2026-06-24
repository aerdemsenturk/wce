"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import type { PublishResult } from "@/components/browser/BrowserProvider";

export default function PublishResultsModal({
  results,
  onClose,
}: {
  results: PublishResult[];
  onClose: () => void;
}) {
  const t = useTranslations("publish");
  const titleId = useId();

  return (
    <div
      role="dialog"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-3 rounded-lg bg-panel p-5 shadow-xl"
      >
        <h2 id={titleId} className="text-sm font-semibold text-slate-800">
          {t("title")}
        </h2>

        <ul className="max-h-72 space-y-1.5 overflow-y-auto">
          {results.map((r) => (
            <li key={r.changeId} className="flex items-start gap-2 text-sm">
              <span
                className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
                  r.status === "success"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {r.status === "success" ? "✓" : "!"}
              </span>
              <span className="flex-1 text-slate-700">
                {r.label}
                {r.status === "skipped" && (
                  <span className="ml-1.5 text-amber-600">— {t("skipped")}</span>
                )}
                {r.status === "skipped" && r.message && (
                  <span className="mt-0.5 block text-xs text-slate-500">{r.message}</span>
                )}
              </span>
            </li>
          ))}
        </ul>

        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
          >
            {t("close")}
          </button>
        </div>
      </div>
    </div>
  );
}
