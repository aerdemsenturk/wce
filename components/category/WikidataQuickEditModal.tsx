"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { fetchWikidataStatements } from "@/lib/api";
import {
  overlayWikidataStatements,
  type AddWikidataStatementChange,
} from "@/lib/pendingChanges";
import type { WikidataPropertyStatements, WikidataStatementValue } from "@/lib/types";
import { CURATED_PROPERTIES } from "@/lib/wikidataProperties";
import { useBrowser } from "@/components/browser/BrowserProvider";
import Modal from "@/components/ui/Modal";
import WikidataPicker from "@/components/ui/WikidataPicker";
import ExternalLink, { ExternalIcon } from "@/components/ui/ExternalLink";

/**
 * Quick-edit panel for the curated set of statements on a category's Wikidata
 * item — opened from the Wikidata badge. Item-valued properties (P31, P131,
 * ...) can have values added/removed (queued like every other edit); the rest
 * are shown read-only with a link out to Wikidata. Empty properties are nudged
 * so the user is encouraged to fill them in.
 */
export default function WikidataQuickEditModal({
  qid,
  category,
  onClose,
}: {
  qid: string;
  category: string;
  onClose: () => void;
}) {
  const t = useTranslations("wikidata");
  const tProps = useTranslations("wikidata.props");
  const locale = useLocale();
  const { pendingChanges, addChange, removeChange } = useBrowser();

  const [result, setResult] = useState<{
    key: string;
    properties: WikidataPropertyStatements[];
  } | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  // Which property's inline value-picker is open, if any.
  const [addingProperty, setAddingProperty] = useState<string | null>(null);

  const requestKey = `${qid}:${locale}`;

  useEffect(() => {
    let active = true;
    fetchWikidataStatements(qid, locale)
      .then((data) => {
        if (active) setResult({ key: requestKey, properties: data.properties });
      })
      .catch(() => {
        if (active) setErrorKey(requestKey);
      });
    return () => {
      active = false;
    };
  }, [qid, locale, requestKey]);

  // Stale results/errors from a previous qid/locale are ignored — falling
  // back to the loading state until the in-flight request for `requestKey`
  // resolves, rather than resetting state imperatively in the effect above.
  const base = result?.key === requestKey ? result.properties : null;
  const error = errorKey === requestKey;

  const display = overlayWikidataStatements(qid, base ?? [], pendingChanges);
  const valuesFor = (property: string): WikidataStatementValue[] =>
    display.find((g) => g.property === property)?.values ?? [];

  const queueAdd = (property: string, value: { id: string; label: string | null }) => {
    // `display` already includes queued adds, so this also blocks a second
    // queue entry for the same value — which would create a duplicate claim.
    if (valuesFor(property).some((v) => v.itemId === value.id)) {
      setAddingProperty(null);
      return;
    }
    addChange({
      id: crypto.randomUUID(),
      type: "addWikidataStatement",
      qid,
      category,
      property,
      valueQid: value.id,
      valueLabel: value.label,
      label: t("addLabel", {
        property: tProps(curatedLabelKey(property)),
        value: value.label ?? value.id,
        category,
      }),
    });
    setAddingProperty(null);
  };

  const queueRemove = (property: string, value: WikidataStatementValue) => {
    addChange({
      id: crypto.randomUUID(),
      type: "removeWikidataStatement",
      qid,
      category,
      property,
      statementId: value.statementId,
      valueLabel: value.label,
      label: t("removeLabel", {
        property: tProps(curatedLabelKey(property)),
        value: value.label ?? value.itemId ?? value.statementId,
        category,
      }),
    });
  };

  // Cancel a not-yet-published add for this exact value (its chip is synthetic).
  const undoAdd = (property: string, itemId: string | null) => {
    const change = pendingChanges.find(
      (c): c is AddWikidataStatementChange =>
        c.type === "addWikidataStatement" &&
        c.qid === qid &&
        c.property === property &&
        c.valueQid === itemId,
    );
    if (change) removeChange(change.id);
  };

  return (
    <Modal
      title={t("title")}
      onClose={onClose}
      footer={
        <div className="flex w-full items-center justify-between">
          <ExternalLink
            href={`https://www.wikidata.org/wiki/${qid}`}
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
          >
            {t("openOnWikidata")} <span className="font-mono">{qid}</span>
            <ExternalIcon className="opacity-60" />
          </ExternalLink>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100"
          >
            {t("close")}
          </button>
        </div>
      }
    >
      {error && <p className="py-4 text-sm text-red-500">{t("loadError")}</p>}
      {!error && base === null && (
        <p className="py-4 text-sm text-slate-400">{t("loading")}</p>
      )}

      {!error && base !== null && (
        <ul className="space-y-3">
          {CURATED_PROPERTIES.map((def) => {
            const values = valuesFor(def.id);
            return (
              <li key={def.id} className="space-y-1.5">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-sm font-medium text-slate-700">
                    {tProps(def.labelKey)}
                  </span>
                  <span className="font-mono text-[10px] text-slate-400">{def.id}</span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {values.map((v) => {
                    const pending = v.statementId === "pending";
                    return (
                      <span
                        key={`${def.id}:${v.statementId}:${v.itemId ?? v.label}`}
                        className={`group flex max-w-full items-center gap-1.5 rounded-full py-1 pl-2.5 pr-1 text-xs ${
                          pending
                            ? "bg-amber-50 text-amber-700"
                            : "bg-sky-50 text-sky-700"
                        }`}
                      >
                        {v.kind === "item" && v.itemId ? (
                          <ExternalLink
                            href={`https://www.wikidata.org/wiki/${v.itemId}`}
                            className="inline-flex min-w-0 items-center gap-1.5"
                          >
                            <span className="min-w-0 truncate">{v.label ?? v.itemId}</span>
                            <span
                              className={`shrink-0 font-mono text-[10px] ${
                                pending ? "text-amber-400" : "text-sky-400"
                              }`}
                            >
                              {v.itemId}
                            </span>
                            <ExternalIcon className="shrink-0 opacity-60" />
                          </ExternalLink>
                        ) : (
                          <span className="min-w-0 truncate pr-1.5">{v.label}</span>
                        )}

                        {def.editable && (
                          <button
                            type="button"
                            onClick={() =>
                              pending ? undoAdd(def.id, v.itemId) : queueRemove(def.id, v)
                            }
                            aria-label={pending ? t("undo") : t("remove")}
                            title={pending ? t("undo") : t("remove")}
                            className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full ${
                              pending
                                ? "text-amber-400 hover:bg-amber-200 hover:text-amber-700"
                                : "text-sky-400 hover:bg-sky-200 hover:text-sky-700"
                            }`}
                          >
                            {pending ? <UndoIcon /> : <XIcon />}
                          </button>
                        )}
                      </span>
                    );
                  })}

                  {def.editable && addingProperty !== def.id && (
                    <button
                      type="button"
                      onClick={() => setAddingProperty(def.id)}
                      className="rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-xs text-slate-400 hover:border-slate-400 hover:text-slate-600"
                    >
                      {t("addValue")}
                    </button>
                  )}

                  {/* Non-item datatypes (coordinate/time/media) can't be edited
                      in-app — still surface them so they're encouraged to be
                      filled, just over on Wikidata. */}
                  {!def.editable && (
                    <ExternalLink
                      href={`https://www.wikidata.org/wiki/${qid}#${def.id}`}
                      className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-xs text-slate-400 hover:border-slate-400 hover:text-slate-600"
                    >
                      {values.length === 0 ? t("addOnWikidata") : t("editOnWikidata")}
                      <ExternalIcon className="opacity-60" />
                    </ExternalLink>
                  )}
                </div>

                {def.editable && addingProperty === def.id && (
                  <WikidataPicker
                    value={null}
                    onChange={(value) => {
                      if (value) queueAdd(def.id, value);
                      else setAddingProperty(null);
                    }}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}

function curatedLabelKey(property: string): string {
  return CURATED_PROPERTIES.find((p) => p.id === property)?.labelKey ?? property;
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
