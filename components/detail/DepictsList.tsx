"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { Depict } from "@/lib/types";
import { useBrowser } from "@/components/browser/BrowserProvider";
import ExternalLink, { ExternalIcon } from "@/components/ui/ExternalLink";
import AddDepictModal from "./AddDepictModal";

export default function DepictsList({
  title,
  pageid,
  depicts,
  onSaved,
}: {
  title: string;
  pageid: number;
  depicts: Depict[];
  onSaved: (next: Depict[]) => void;
}) {
  const t = useTranslations("detail");
  const { pendingChanges, addChange, removeChange } = useBrowser();
  const [adding, setAdding] = useState(false);
  // Maps statement id -> the id of the queued removeDepict change, so a
  // second click can find and cancel that exact change.
  const [pendingRemovedIds, setPendingRemovedIds] = useState<Map<string, string>>(new Map());

  return (
    <>
      <ul className="flex flex-wrap items-center gap-1.5">
        {depicts.map((d) => {
          const changeId = pendingRemovedIds.get(d.statementId);
          const removed = changeId !== undefined;
          // Newly added depicts carry a synthetic "pending" statement id
          // (see overlayDepicts) until the change is published.
          const addedChangeId =
            d.statementId === "pending"
              ? pendingChanges.find(
                  (c) => c.type === "addDepict" && c.fileTitle === title && c.qid === d.id,
                )?.id
              : undefined;
          const pending = addedChangeId !== undefined;
          return (
            <li key={d.id}>
              <span
                title={pending ? t("pendingChange") : d.label ?? d.id}
                className={`group flex max-w-full items-center gap-1.5 rounded-full pl-2.5 pr-1 py-1 text-xs ${
                  removed
                    ? "bg-red-50 text-red-500"
                    : pending
                      ? "bg-amber-50 text-amber-700"
                      : "bg-sky-50 text-sky-700 hover:bg-sky-100"
                }`}
              >
                <ExternalLink
                  href={`https://www.wikidata.org/wiki/${d.id}`}
                  className="inline-flex min-w-0 items-center gap-1.5"
                >
                  <span className="min-w-0 truncate">{d.label ?? d.id}</span>
                  <span
                    className={`shrink-0 font-mono text-[10px] ${
                      removed ? "text-red-300" : pending ? "text-amber-400" : "text-sky-400"
                    }`}
                  >
                    {d.id}
                  </span>
                  <ExternalIcon className="shrink-0 opacity-60" />
                </ExternalLink>
                <button
                  type="button"
                  onClick={() => {
                    if (addedChangeId !== undefined) {
                      removeChange(addedChangeId);
                      onSaved(depicts.filter((dep) => dep.id !== d.id));
                      return;
                    }
                    if (changeId !== undefined) {
                      removeChange(changeId);
                      setPendingRemovedIds((prev) => {
                        const next = new Map(prev);
                        next.delete(d.statementId);
                        return next;
                      });
                      return;
                    }
                    const id = crypto.randomUUID();
                    setPendingRemovedIds((prev) => new Map(prev).set(d.statementId, id));
                    addChange({
                      id,
                      type: "removeDepict",
                      fileTitle: title,
                      statementId: d.statementId,
                      label: t("removeDepictLabel", {
                        name: title.replace(/^File:/i, ""),
                        depict: d.label ?? d.id,
                      }),
                    });
                  }}
                  aria-label={removed || pending ? t("undoChange") : t("removeDepict")}
                  title={removed || pending ? t("undoChange") : undefined}
                  className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full ${
                    removed
                      ? "text-red-400 hover:bg-red-200 hover:text-red-700"
                      : pending
                        ? "text-amber-400 hover:bg-amber-200 hover:text-amber-700"
                        : "text-sky-400 hover:bg-sky-200 hover:text-sky-700"
                  }`}
                >
                  {removed || pending ? <UndoIcon /> : <XIcon />}
                </button>
              </span>
            </li>
          );
        })}

        <li>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-xs text-slate-400 hover:border-slate-400 hover:text-slate-600"
          >
            {t("addDepict")}
          </button>
        </li>
      </ul>

      {adding && (
        <AddDepictModal
          existingIds={depicts.map((d) => d.id)}
          onAdd={(item) => {
            addChange({
              id: crypto.randomUUID(),
              type: "addDepict",
              fileTitle: title,
              pageid,
              qid: item.id,
              depictLabel: item.label,
              label: t("addDepictLabel", {
                name: title.replace(/^File:/i, ""),
                depict: item.label,
              }),
            });
            onSaved([...depicts, { id: item.id, label: item.label, statementId: "pending" }]);
          }}
          onClose={() => setAdding(false)}
        />
      )}
    </>
  );
}

function XIcon() {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden>
      <path d="M1 1l6 6M7 1l-6 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden>
      <polyline
        points="9 14 4 9 9 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20 20v-7a4 4 0 0 0-4-4H4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
