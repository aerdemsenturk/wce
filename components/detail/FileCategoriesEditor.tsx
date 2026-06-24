"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useBrowser } from "@/components/browser/BrowserProvider";
import AddFileCategoryModal from "./AddFileCategoryModal";

/** Category chips for one file — add/remove, with pending-change badges.
 * Shared by the detail panel and the bulk-edit modal. */
export default function FileCategoriesEditor({
  title,
  name,
  categories,
  defaultParent,
  onSaved,
}: {
  title: string;
  name: string;
  categories: string[];
  defaultParent: string | null;
  onSaved: (next: string[]) => void;
}) {
  const t = useTranslations("detail");
  const { pendingChanges, addChange, removeChange, setRoot, selectFile } = useBrowser();
  const [addingCategory, setAddingCategory] = useState(false);
  // Maps category name -> the id of the queued removeCategory change, so a
  // second click can find and cancel that exact change.
  const [pendingRemovedCategories, setPendingRemovedCategories] = useState<
    Map<string, string>
  >(new Map());

  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {categories.map((cat) => {
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
                    label: t("removeCategoryLabel", { name, category: cat }),
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

      {addingCategory && (
        <AddFileCategoryModal
          fileTitle={title}
          fileName={name}
          existingCategories={categories}
          defaultParent={defaultParent}
          onAdded={(category) => onSaved([...categories, category])}
          onClose={() => setAddingCategory(false)}
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
