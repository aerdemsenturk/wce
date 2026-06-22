"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { getFileDetailCached } from "@/lib/api";
import type { FileDetail } from "@/lib/types";
import { useBrowser } from "@/components/browser/BrowserProvider";
import ResizablePanel from "@/components/layout/ResizablePanel";
import ExternalLink from "@/components/ui/ExternalLink";
import LicenseBadge from "@/components/ui/LicenseBadge";
import EditLinks from "./EditLinks";
import LocationSection from "./LocationSection";
import DepictsList from "./DepictsList";

export default function DetailPanel() {
  const { selectedFile } = useBrowser();
  if (!selectedFile) return null;

  return (
    <ResizablePanel
      side="right"
      defaultWidth={380}
      minWidth={300}
      maxWidth={620}
      storageKey="wce:right-width"
      className="h-full border-l border-border-base bg-panel"
    >
      <DetailContent key={selectedFile.pageid} title={selectedFile.title} />
    </ResizablePanel>
  );
}

function DetailContent({ title }: { title: string }) {
  const t = useTranslations("detail");
  const tc = useTranslations("common");
  const locale = useLocale();
  const { selectFile, setRoot } = useBrowser();

  const [detail, setDetail] = useState<FileDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(false);
      try {
        const data = await getFileDetailCached(title, locale);
        if (active) setDetail(data);
      } catch {
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [title, locale]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border-base px-4 py-3">
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">
          {detail?.name ?? title.replace(/^File:/i, "")}
        </h2>
        <button
          type="button"
          onClick={() => selectFile(null)}
          aria-label={t("close")}
          className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <CloseIcon />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {loading && (
          <p className="py-10 text-center text-sm text-slate-400">
            {tc("loading")}
          </p>
        )}
        {error && (
          <p className="py-10 text-center text-sm text-red-500">
            {tc("error")}
          </p>
        )}

        {detail && !loading && (
          <div className="space-y-5">
            {detail.thumbUrl && (
              <ExternalLink
                href={detail.descriptionUrl}
                className="block overflow-hidden rounded-lg border border-border-base bg-slate-50"
              >
                {/* Plain img: large external thumbnail, no optimization needed. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={detail.thumbUrl}
                  alt={detail.name}
                  className="mx-auto max-h-72 w-full object-contain"
                />
              </ExternalLink>
            )}

            <Field label={t("description")}>
              {detail.descriptions.length > 0 ? (
                <ul className="space-y-1.5">
                  {detail.descriptions.map((d, i) => (
                    <li key={`${d.lang}-${i}`} className="flex gap-2 text-sm">
                      {d.lang !== "und" && (
                        <span className="mt-0.5 shrink-0 rounded bg-slate-100 px-1 text-[10px] font-semibold uppercase text-slate-500">
                          {d.lang}
                        </span>
                      )}
                      <span className="text-slate-700">{d.value}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty />
              )}
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label={t("date")}>
                <Text value={detail.date} />
              </Field>
              <Field label={t("license")}>
                <LicenseBadge
                  short={detail.license.short}
                  url={detail.license.url}
                />
              </Field>
            </div>

            <Field label={t("author")}>
              <Text value={detail.author} />
            </Field>

            <Field label={t("categories")}>
              {detail.categories.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {detail.categories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        setRoot(cat);
                        selectFile(null);
                      }}
                      className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-200"
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              ) : (
                <Empty />
              )}
            </Field>

            <Field label={t("location")}>
              <LocationSection
                coordinates={detail.coordinates}
                commonsUrl={detail.descriptionUrl}
              />
            </Field>

            <Field label={t("depicts")}>
              <DepictsList
                depicts={detail.depicts}
                structuredDataUrl={`https://commons.wikimedia.org/wiki/Special:EntityPage/${detail.mediaId}`}
              />
            </Field>

            <div className="border-t border-border-base pt-4">
              <EditLinks file={detail} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      {children}
    </div>
  );
}

function Text({ value }: { value: string | null }) {
  if (!value) return <Empty />;
  return <p className="text-sm text-slate-700">{value}</p>;
}

function Empty() {
  return <span className="text-sm text-slate-300">—</span>;
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M4 4l8 8M12 4l-8 8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
