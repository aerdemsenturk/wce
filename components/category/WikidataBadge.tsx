"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { getCategoryChildrenCached } from "@/lib/api";
import type { CategoryWikidata } from "@/lib/types";
import { commonsCategoryUrl } from "@/lib/category";
import { useBrowser } from "@/components/browser/BrowserProvider";

export default function WikidataBadge() {
  const t = useTranslations("sidebar");
  const locale = useLocale();
  const { current } = useBrowser();
  const [wikidata, setWikidata] = useState<CategoryWikidata | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!current) return;
      setLoaded(false);
      try {
        const data = await getCategoryChildrenCached(current, locale);
        if (active) {
          setWikidata(data.wikidata);
          setLoaded(true);
        }
      } catch {
        if (active) setLoaded(true);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [current, locale]);

  if (!current || !loaded) return null;

  if (!wikidata) {
    return (
      <a
        href={commonsCategoryUrl(current)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-xs text-slate-400 hover:text-slate-600"
      >
        {t("noWikidata")}
        <ExternalIcon />
      </a>
    );
  }

  const wikidataUrl = `https://www.wikidata.org/wiki/${wikidata.id}`;
  return (
    <a
      href={wikidataUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 hover:bg-sky-100"
    >
      <span className="font-mono">{wikidata.id}</span>
      {wikidata.label && (
        <span className="border-l border-sky-200 pl-1.5">{wikidata.label}</span>
      )}
      <ExternalIcon />
    </a>
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
