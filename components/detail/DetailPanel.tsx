"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { getFileDetailCached } from "@/lib/api";
import { overlayDescriptions, overlayCategories, overlayDepicts } from "@/lib/pendingChanges";
import type { FileDetail } from "@/lib/types";
import { useBrowser } from "@/components/browser/BrowserProvider";
import ResizablePanel from "@/components/layout/ResizablePanel";
import ExternalLink from "@/components/ui/ExternalLink";
import LicenseBadge from "@/components/ui/LicenseBadge";
import DescriptionField from "./DescriptionField";
import LocationSection from "./LocationSection";
import DepictsList from "./DepictsList";
import AddFileCategoryModal from "./AddFileCategoryModal";

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
  const { selectFile, setRoot, current, pendingChanges, addChange } = useBrowser();

  const [detail, setDetail] = useState<FileDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(false);
      try {
        const data = await getFileDetailCached(title, locale);
        if (active) {
          setDetail({
            ...data,
            descriptions: overlayDescriptions(title, data.descriptions, pendingChanges),
            categories: overlayCategories(title, data.categories, pendingChanges),
            depicts: overlayDepicts(title, data.depicts, pendingChanges),
          });
        }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pendingChanges read via closure
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
              <DescriptionField
                title={detail.title}
                descriptions={detail.descriptions}
                onSaved={(next) =>
                  setDetail((prev) => (prev ? { ...prev, descriptions: next } : prev))
                }
              />
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
              <div className="flex flex-wrap gap-1.5">
                {detail.categories.map((cat) => (
                  <span
                    key={cat}
                    className="group flex items-center gap-1 rounded-full bg-slate-100 pl-2 pr-1 py-0.5 text-xs text-slate-600 hover:bg-slate-200"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setRoot(cat);
                        selectFile(null);
                      }}
                    >
                      {cat}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        addChange({
                          id: crypto.randomUUID(),
                          type: "removeCategory",
                          fileTitle: title,
                          category: cat,
                          label: t("removeCategoryLabel", {
                            name: detail.name,
                            category: cat,
                          }),
                        })
                      }
                      aria-label={t("removeCategory")}
                      className="grid h-3.5 w-3.5 place-items-center rounded-full text-slate-400 hover:bg-slate-300 hover:text-slate-700"
                    >
                      <XIcon />
                    </button>
                  </span>
                ))}

                <button
                  type="button"
                  onClick={() => setAddingCategory(true)}
                  className="rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-xs text-slate-400 hover:border-slate-400 hover:text-slate-600"
                >
                  {t("addCategory")}
                </button>
              </div>
            </Field>

            {addingCategory && (
              <AddFileCategoryModal
                fileTitle={title}
                fileName={detail.name}
                existingCategories={detail.categories}
                defaultParent={current}
                onClose={() => setAddingCategory(false)}
              />
            )}

            <Field label={t("location")}>
              <LocationSection
                coordinates={detail.coordinates}
                commonsUrl={detail.descriptionUrl}
              />
            </Field>

            <Field label={t("depicts")}>
              <DepictsList
                title={title}
                pageid={detail.pageid}
                depicts={detail.depicts}
              />
            </Field>
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

function XIcon() {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden>
      <path
        d="M1 1l6 6M7 1l-6 6"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
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
