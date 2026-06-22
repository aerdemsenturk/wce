"use client";

import { useTranslations } from "next-intl";
import type { Depict } from "@/lib/types";
import ExternalLink, { ExternalIcon } from "@/components/ui/ExternalLink";

export default function DepictsList({
  depicts,
  structuredDataUrl,
}: {
  depicts: Depict[];
  structuredDataUrl: string;
}) {
  const t = useTranslations("detail");

  if (depicts.length === 0) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-400">{t("noDepicts")}</span>
        <ExternalLink
          href={structuredDataUrl}
          className="inline-flex items-center gap-1 text-xs text-sky-600 hover:underline"
        >
          {t("addOnCommons")}
          <ExternalIcon />
        </ExternalLink>
      </div>
    );
  }

  return (
    <ul className="flex flex-wrap gap-1.5">
      {depicts.map((d) => (
        <li key={d.id}>
          <ExternalLink
            href={`https://www.wikidata.org/wiki/${d.id}`}
            className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-1 text-xs text-sky-700 hover:bg-sky-100"
          >
            <span>{d.label ?? d.id}</span>
            <span className="font-mono text-[10px] text-sky-400">{d.id}</span>
            <ExternalIcon className="opacity-60" />
          </ExternalLink>
        </li>
      ))}
    </ul>
  );
}
