"use client";

import { useTranslations } from "next-intl";
import ExternalLink, { ExternalIcon } from "@/components/ui/ExternalLink";
import type { FileDetail } from "@/lib/types";

export default function EditLinks({ file }: { file: FileDetail }) {
  const t = useTranslations("detail");
  const titleUrl = encodeURIComponent(file.title.replace(/ /g, "_"));
  const filePage = `https://commons.wikimedia.org/wiki/${titleUrl}`;
  const editPage = `https://commons.wikimedia.org/w/index.php?title=${titleUrl}&action=edit`;
  const sdcPage = `https://commons.wikimedia.org/wiki/Special:EntityPage/${file.mediaId}`;

  const item =
    "flex items-center justify-between gap-2 rounded-md border border-border-base px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50";

  return (
    <div className="space-y-1.5">
      <ExternalLink href={filePage} className={item}>
        {t("viewOnCommons")}
        <ExternalIcon className="opacity-50" />
      </ExternalLink>
      <ExternalLink href={editPage} className={item}>
        {t("editOnCommons")}
        <ExternalIcon className="opacity-50" />
      </ExternalLink>
      <ExternalLink href={sdcPage} className={item}>
        {t("editStructuredData")}
        <ExternalIcon className="opacity-50" />
      </ExternalLink>
      <p className="pt-1 text-[11px] text-slate-400">{t("externalLinkNote")}</p>
    </div>
  );
}
