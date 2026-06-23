"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { getFileDetailCached } from "@/lib/api";
import {
  overlayDescriptions,
  overlayCategories,
  overlayDepicts,
  overlayLocation,
  overlayDeletionNomination,
} from "@/lib/pendingChanges";
import type { CategoryFileInfo, FileDetail } from "@/lib/types";
import { useBrowser } from "@/components/browser/BrowserProvider";
import ExternalLink from "@/components/ui/ExternalLink";
import LicenseBadge from "@/components/ui/LicenseBadge";
import DescriptionField from "./DescriptionField";
import LocationSection from "./LocationSection";
import DepictsList from "./DepictsList";
import AddFileCategoryModal from "./AddFileCategoryModal";
import NominateDeletionModal from "./NominateDeletionModal";

export default function DetailPanel() {
  const t = useTranslations("detail");
  const { selectedFile, selectFile, visibleFiles } = useBrowser();

  const index = selectedFile
    ? visibleFiles.findIndex((f) => f.pageid === selectedFile.pageid)
    : -1;
  const prevFile: CategoryFileInfo | null = index > 0 ? visibleFiles[index - 1] : null;
  const nextFile: CategoryFileInfo | null =
    index >= 0 && index < visibleFiles.length - 1 ? visibleFiles[index + 1] : null;

  useEffect(() => {
    if (!selectedFile) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        selectFile(null);
      } else if (e.key === "ArrowLeft" && prevFile) {
        selectFile(prevFile);
      } else if (e.key === "ArrowRight" && nextFile) {
        selectFile(nextFile);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedFile, prevFile, nextFile, selectFile]);

  if (!selectedFile) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => selectFile(null)}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (prevFile) selectFile(prevFile);
        }}
        disabled={!prevFile}
        aria-label={t("previous")}
        className="absolute left-2 top-1/2 z-10 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-slate-600 shadow-md hover:bg-white disabled:cursor-default disabled:opacity-0 sm:left-4"
      >
        <ChevronIcon direction="left" />
      </button>

      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-[min(94vh,1100px)] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-panel shadow-2xl lg:max-w-5xl xl:max-w-6xl"
      >
        <DetailContent key={selectedFile.pageid} title={selectedFile.title} />
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (nextFile) selectFile(nextFile);
        }}
        disabled={!nextFile}
        aria-label={t("next")}
        className="absolute right-2 top-1/2 z-10 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-slate-600 shadow-md hover:bg-white disabled:cursor-default disabled:opacity-0 sm:right-4"
      >
        <ChevronIcon direction="right" />
      </button>
    </div>
  );
}

function DetailContent({ title }: { title: string }) {
  const t = useTranslations("detail");
  const tc = useTranslations("common");
  const locale = useLocale();
  const { selectFile, setRoot, current, pendingChanges, addChange, removeChange } = useBrowser();

  const [detail, setDetail] = useState<FileDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false);
  const [nominatingDeletion, setNominatingDeletion] = useState(false);
  // Maps category name -> the id of the queued removeCategory change, so a
  // second click can find and cancel that exact change.
  const [pendingRemovedCategories, setPendingRemovedCategories] = useState<
    Map<string, string>
  >(new Map());

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
            coordinates: overlayLocation(title, data.coordinates, pendingChanges),
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

  const deletionReason = overlayDeletionNomination(title, pendingChanges);
  const deletionChangeId = pendingChanges.find(
    (c) => c.type === "nominateDeletion" && c.fileTitle === title,
  )?.id;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border-base px-4 py-3">
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">
          {detail?.name ?? title.replace(/^File:/i, "")}
        </h2>
        {deletionChangeId ? (
          <button
            type="button"
            onClick={() => removeChange(deletionChangeId)}
            title={deletionReason ?? undefined}
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-100"
          >
            <TrashIcon />
            {t("nominatedForDeletion")}
          </button>
        ) : (
          detail && (
            <button
              type="button"
              onClick={() => setNominatingDeletion(true)}
              title={t("nominateDeletion")}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600"
            >
              <TrashIcon />
            </button>
          )
        )}
        <button
          type="button"
          onClick={() => selectFile(null)}
          aria-label={t("close")}
          className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <CloseIcon />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
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
                className="block bg-black"
              >
                {/* Plain img: large external thumbnail, no optimization needed. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={detail.thumbUrl}
                  alt={detail.name}
                  className="mx-auto max-h-[min(60vh,650px)] w-full object-contain"
                />
              </ExternalLink>
            )}

            <div className="space-y-5 px-4 pb-4">
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
                  {detail.categories.map((cat) => {
                    const changeId = pendingRemovedCategories.get(cat);
                    const removed = changeId !== undefined;
                    const addedChangeId = pendingChanges.find(
                      (c) => c.type === "addCategory" && c.fileTitle === title && c.category === cat,
                    )?.id;
                    const pending = addedChangeId !== undefined;
                    return (
                      <span
                        key={cat}
                        title={pending ? t("pendingChange") : cat}
                        className={`group flex max-w-full items-center gap-1 rounded-full pl-2 pr-1 py-0.5 text-xs ${
                          removed
                            ? "bg-red-50 text-red-500"
                            : pending
                              ? "bg-amber-50 text-amber-700"
                              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        <button
                          type="button"
                          disabled={removed}
                          onClick={() => {
                            setRoot(cat);
                            selectFile(null);
                          }}
                          className="min-w-0 truncate disabled:cursor-default"
                        >
                          {cat}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (addedChangeId !== undefined) {
                              removeChange(addedChangeId);
                              return;
                            }
                            if (changeId !== undefined) {
                              removeChange(changeId);
                              setPendingRemovedCategories((prev) => {
                                const next = new Map(prev);
                                next.delete(cat);
                                return next;
                              });
                              return;
                            }
                            const id = crypto.randomUUID();
                            setPendingRemovedCategories((prev) => new Map(prev).set(cat, id));
                            addChange({
                              id,
                              type: "removeCategory",
                              fileTitle: title,
                              category: cat,
                              label: t("removeCategoryLabel", {
                                name: detail.name,
                                category: cat,
                              }),
                            });
                          }}
                          aria-label={removed || pending ? t("undoChange") : t("removeCategory")}
                          title={removed || pending ? t("undoChange") : undefined}
                          className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full ${
                            removed
                              ? "text-red-400 hover:bg-red-200 hover:text-red-700"
                              : pending
                                ? "text-amber-400 hover:bg-amber-200 hover:text-amber-700"
                                : "text-slate-400 hover:bg-slate-300 hover:text-slate-700"
                          }`}
                        >
                          {removed || pending ? <UndoIcon /> : <XIcon />}
                        </button>
                      </span>
                    );
                  })}

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
                  onAdded={(category) =>
                    setDetail((prev) =>
                      prev ? { ...prev, categories: [...prev.categories, category] } : prev,
                    )
                  }
                  onClose={() => setAddingCategory(false)}
                />
              )}

              {nominatingDeletion && (
                <NominateDeletionModal
                  fileTitle={title}
                  fileName={detail.name}
                  onClose={() => setNominatingDeletion(false)}
                />
              )}

              <Field label={t("depicts")}>
                <DepictsList
                  title={title}
                  pageid={detail.pageid}
                  depicts={detail.depicts}
                  onSaved={(next) =>
                    setDetail((prev) => (prev ? { ...prev, depicts: next } : prev))
                  }
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

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3 4h10M6.5 4V2.5h3V4M4.5 4l.5 9.5a1 1 0 0 0 1 .95h4a1 1 0 0 0 1-.95L11.5 4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
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

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d={direction === "left" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
