"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useBrowser } from "@/components/browser/BrowserProvider";
import PublishConfirmModal from "@/components/browser/PublishConfirmModal";
import PublishResultsModal from "@/components/browser/PublishResultsModal";
import UserMenu from "./UserMenu";
import CommonsCategorySearch from "./CommonsCategorySearch";

export default function Header() {
  const t = useTranslations("header");
  const tApp = useTranslations("app");
  const {
    pendingChanges,
    redoCount,
    undo,
    redo,
    publishing,
    publishAll,
    publishResults,
    clearPublishResults,
  } = useBrowser();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const showConfirm = confirmOpen && !publishResults;

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border-base bg-panel px-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-slate-700 sm:hidden">
          {tApp("name")}
        </span>
        <span className="hidden text-sm font-semibold text-slate-700 sm:inline">
          {tApp("fullName")}
        </span>
      </div>

      <div className="mx-auto w-full max-w-md">
        <CommonsCategorySearch />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={undo}
          disabled={pendingChanges.length === 0}
          aria-label={t("undo")}
          title={t("undo")}
          className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-30"
        >
          <UndoIcon />
        </button>
        <button
          type="button"
          onClick={redo}
          disabled={redoCount === 0}
          aria-label={t("redo")}
          title={t("redo")}
          className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-30"
        >
          <RedoIcon />
        </button>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={pendingChanges.length === 0 || publishing}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
        >
          {publishing ? t("publishing") : t("publish", { count: pendingChanges.length })}
        </button>
        <UserMenu />
      </div>

      {(showConfirm || publishing) && (
        <PublishConfirmModal
          changes={pendingChanges}
          publishing={publishing}
          onClose={() => setConfirmOpen(false)}
          onConfirm={() => {
            setConfirmOpen(false);
            void publishAll();
          }}
        />
      )}

      {publishResults && (
        <PublishResultsModal results={publishResults} onClose={clearPublishResults} />
      )}
    </header>
  );
}

function UndoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3 7h7a3.5 3.5 0 0 1 0 7H6M3 7l3-3M3 7l3 3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M13 7H6a3.5 3.5 0 0 0 0 7h4M13 7l-3-3M13 7l-3 3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
