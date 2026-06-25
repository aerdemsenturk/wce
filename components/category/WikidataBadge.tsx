"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { getCategoryChildrenCached } from "@/lib/api";
import { syntheticChildrenFor, overlayWikidata, resolveCategoryName } from "@/lib/pendingChanges";
import type { CategoryWikidata } from "@/lib/types";
import { wikidataNewItemUrl, withCategoryPrefix } from "@/lib/category";
import { useBrowser } from "@/components/browser/BrowserProvider";
import WikidataQuickEditModal from "./WikidataQuickEditModal";

/** Hard cap on the Wikidata label shown in the badge; the full text stays in
 * the `title` tooltip. */
const MAX_LABEL_CHARS = 40;

export default function WikidataBadge({ onCover }: { onCover?: boolean }) {
  const t = useTranslations("sidebar");
  const locale = useLocale();
  const { current, pendingChanges, version, confirmedWikidata, clearConfirmedWikidata } =
    useBrowser();
  const [wikidata, setWikidata] = useState<CategoryWikidata | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!current) return;
      setLoaded(false);
      // A category queued for creation doesn't exist on Commons yet — skip
      // the network call rather than letting it 404.
      if (syntheticChildrenFor(current, pendingChanges)) {
        setWikidata(null);
        setLoaded(true);
        return;
      }
      try {
        const data = await getCategoryChildrenCached(
          resolveCategoryName(current, pendingChanges),
          locale,
        );
        if (!active) return;
        const overlaid = overlayWikidata(current, data.wikidata, pendingChanges);
        const serverId = data.wikidata?.id ?? null;
        // A pending rename already overrode the value — leave it. Otherwise, if
        // we recently published a sitelink that Commons' pageprops hasn't
        // mirrored yet, keep showing it until a fresh read agrees.
        const pendingOverrode = (overlaid?.id ?? null) !== serverId;
        const confirmed = confirmedWikidata.get(withCategoryPrefix(current));
        if (!pendingOverrode && confirmed !== undefined) {
          if (serverId === confirmed) {
            clearConfirmedWikidata(current); // Commons caught up
          } else {
            setWikidata(confirmed ? { id: confirmed, label: null } : null);
            setLoaded(true);
            return;
          }
        }
        setWikidata(overlaid);
        setLoaded(true);
      } catch {
        if (active) setLoaded(true);
      }
    };
    void load();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pendingChanges/confirmedWikidata read via closure; version bump (on publish) forces a refetch
  }, [current, locale, version]);

  if (!current || !loaded) return null;

  if (!wikidata) {
    return (
      <a
        href={wikidataNewItemUrl(current)}
        target="_blank"
        rel="noopener noreferrer"
        className={
          "inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed px-2.5 py-1 text-xs " +
          (onCover
            ? "border-white/40 text-white/70 hover:text-white"
            : "border-slate-300 text-slate-400 hover:text-slate-600")
        }
      >
        {t("noWikidata")}
        <ExternalIcon />
      </a>
    );
  }

  const label =
    wikidata.label && wikidata.label.length > MAX_LABEL_CHARS
      ? `${wikidata.label.slice(0, MAX_LABEL_CHARS).trimEnd()}…`
      : wikidata.label;
  return (
    <>
      <button
        type="button"
        onClick={() => setEditOpen(true)}
        title={t("editWikidata")}
        className={
          "inline-flex max-w-full shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium " +
          (onCover ? "bg-white/15 text-white hover:bg-white/25" : "bg-sky-50 text-sky-700 hover:bg-sky-100")
        }
      >
        <span className="shrink-0 font-mono">{wikidata.id}</span>
        {label && (
          <span
            className={
              "min-w-0 truncate border-l pl-1.5 " +
              (onCover ? "border-white/30" : "border-sky-200")
            }
          >
            {label}
          </span>
        )}
        <PencilIcon />
      </button>

      {editOpen && (
        <WikidataQuickEditModal
          qid={wikidata.id}
          category={current}
          onClose={() => setEditOpen(false)}
        />
      )}
    </>
  );
}

function PencilIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden>
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

function ExternalIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M4.5 2H10V7.5M10 2L5 7M7 7v2.5a.5.5 0 0 1-.5.5H2.5a.5.5 0 0 1-.5-.5V5.5a.5.5 0 0 1 .5-.5H5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
