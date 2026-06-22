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
}: {
  title: string;
  pageid: number;
  depicts: Depict[];
}) {
  const t = useTranslations("detail");
  const { addChange } = useBrowser();
  const [adding, setAdding] = useState(false);

  return (
    <>
      <ul className="flex flex-wrap items-center gap-1.5">
        {depicts.map((d) => (
          <li key={d.id}>
            <span
              title={d.label ?? d.id}
              className="group flex max-w-full items-center gap-1.5 rounded-full bg-sky-50 pl-2.5 pr-1 py-1 text-xs text-sky-700 hover:bg-sky-100"
            >
              <ExternalLink
                href={`https://www.wikidata.org/wiki/${d.id}`}
                className="inline-flex min-w-0 items-center gap-1.5"
              >
                <span className="min-w-0 truncate">{d.label ?? d.id}</span>
                <span className="shrink-0 font-mono text-[10px] text-sky-400">{d.id}</span>
                <ExternalIcon className="shrink-0 opacity-60" />
              </ExternalLink>
              <button
                type="button"
                onClick={() =>
                  addChange({
                    id: crypto.randomUUID(),
                    type: "removeDepict",
                    fileTitle: title,
                    statementId: d.statementId,
                    label: t("removeDepictLabel", {
                      name: title.replace(/^File:/i, ""),
                      depict: d.label ?? d.id,
                    }),
                  })
                }
                aria-label={t("removeDepict")}
                className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full text-sky-400 hover:bg-sky-200 hover:text-sky-700"
              >
                <XIcon />
              </button>
            </span>
          </li>
        ))}

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
          onAdd={(item) =>
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
            })
          }
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
