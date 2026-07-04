"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { getFileDetailsCached } from "@/lib/api";
import {
  overlayDescriptions,
  overlayCategories,
  overlayDepicts,
  overlayLocation,
} from "@/lib/pendingChanges";
import type { CategoryFileInfo, FileDetail } from "@/lib/types";
import { useBrowser } from "@/components/browser/BrowserProvider";
import ExternalLink from "@/components/ui/ExternalLink";
import DescriptionField from "@/components/detail/DescriptionField";
import LocationSection from "@/components/detail/LocationSection";
import DepictsList from "@/components/detail/DepictsList";
import FileCategoriesEditor from "@/components/detail/FileCategoriesEditor";

/** Bulk-edit modal: every selected file stacked in its own row, each reusing
 * the same description/categories/depicts/location editors as the detail
 * panel — every field change queues immediately into pendingChanges, exactly
 * like single-file editing, so there's no separate "submit" step here. */
export default function BulkEditModal({
  files,
  defaultParent,
  onClose,
}: {
  files: CategoryFileInfo[];
  defaultParent: string | null;
  onClose: () => void;
}) {
  const t = useTranslations("bulkEdit");
  const locale = useLocale();

  // One batched read for the whole selection (≤50 files per request) instead
  // of a detail fetch per row; rows look their file up in the map.
  const [details, setDetails] = useState<Map<string, FileDetail> | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset to loading state before refetching
    setLoadError(false);
    getFileDetailsCached(files.map((f) => f.title), locale)
      .then((map) => {
        if (active) setDetails(map);
      })
      .catch(() => {
        if (active) setLoadError(true);
      });
    return () => {
      active = false;
    };
  }, [files, locale]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-[min(90vh,1000px)] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-panel shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-border-base px-4 py-3">
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">
            {t("title", { count: files.length })}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100"
          >
            {t("close")}
          </button>
        </div>

        <p className="border-b border-border-base px-4 py-2 text-xs text-slate-400">
          {t("hint")}
        </p>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {files.map((file) => (
            <BulkEditRow
              key={file.pageid}
              file={file}
              defaultParent={defaultParent}
              fetched={details?.get(file.title) ?? null}
              error={loadError || (details != null && !details.has(file.title))}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function BulkEditRow({
  file,
  defaultParent,
  fetched,
  error,
}: {
  file: CategoryFileInfo;
  defaultParent: string | null;
  /** This row's detail from the modal-level batch, or null while loading. */
  fetched: FileDetail | null;
  error: boolean;
}) {
  const tc = useTranslations("common");
  const t = useTranslations("detail");
  const { pendingChanges } = useBrowser();

  const [detail, setDetail] = useState<FileDetail | null>(null);

  // Overlay queued-but-unpublished edits once the batch delivers this row's
  // detail; edits made in the row keep updating local state via onSaved.
  useEffect(() => {
    if (!fetched) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- state derived from the async batch result
    setDetail({
      ...fetched,
      descriptions: overlayDescriptions(file.title, fetched.descriptions, pendingChanges),
      categories: overlayCategories(file.title, fetched.categories, pendingChanges),
      depicts: overlayDepicts(file.title, fetched.depicts, pendingChanges),
      coordinates: overlayLocation(file.title, fetched.coordinates, pendingChanges),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pendingChanges read via closure
  }, [fetched, file.title]);

  return (
    <div className="flex gap-3 rounded-lg border border-border-base p-3">
      <ExternalLink href={file.descriptionUrl} className="block shrink-0">
        {file.thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={file.thumbUrl}
            alt={file.name}
            className="h-20 w-20 rounded-md object-cover"
          />
        ) : (
          <div className="h-20 w-20 rounded-md bg-slate-100" />
        )}
      </ExternalLink>

      <div className="min-w-0 flex-1 space-y-3">
        <p className="truncate text-sm font-medium text-slate-700" title={file.name}>
          {file.name}
        </p>

        {error && <p className="text-sm text-red-500">{tc("error")}</p>}

        {detail && (
          <>
            <Field label={t("description")}>
              <DescriptionField
                title={detail.title}
                descriptions={detail.descriptions}
                onSaved={(next) =>
                  setDetail((prev) => (prev ? { ...prev, descriptions: next } : prev))
                }
              />
            </Field>

            <Field label={t("categories")}>
              <FileCategoriesEditor
                title={detail.title}
                name={detail.name}
                categories={detail.categories}
                defaultParent={defaultParent}
                onSaved={(next) =>
                  setDetail((prev) => (prev ? { ...prev, categories: next } : prev))
                }
              />
            </Field>

            <Field label={t("depicts")}>
              <DepictsList
                title={detail.title}
                pageid={detail.pageid}
                depicts={detail.depicts}
                onSaved={(next) => setDetail((prev) => (prev ? { ...prev, depicts: next } : prev))}
              />
            </Field>

            <Field label={t("location")}>
              <LocationSection
                title={detail.title}
                coordinates={detail.coordinates}
                onSaved={(next) =>
                  setDetail((prev) => (prev ? { ...prev, coordinates: next } : prev))
                }
              />
            </Field>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold text-slate-400">{label}</p>
      {children}
    </div>
  );
}
