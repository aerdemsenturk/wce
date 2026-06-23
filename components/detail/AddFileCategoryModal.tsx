"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useBrowser } from "@/components/browser/BrowserProvider";
import Modal, { ModalActions } from "@/components/ui/Modal";
import FormField, { formFieldInputClassName } from "@/components/ui/FormField";
import CategoryPicker from "@/components/ui/CategoryPicker";
import WikidataPicker, { type WikidataPickerValue } from "@/components/ui/WikidataPicker";

export default function AddFileCategoryModal({
  fileTitle,
  fileName,
  existingCategories,
  defaultParent,
  onAdded,
  onClose,
}: {
  fileTitle: string;
  fileName: string;
  existingCategories: string[];
  defaultParent: string | null;
  onAdded: (category: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations("detail");
  const tn = useTranslations("newCategory");
  const { addChange } = useBrowser();

  const [mode, setMode] = useState<"search" | "create">("search");
  const [name, setName] = useState("");
  const [parent, setParent] = useState(defaultParent ?? "");
  const [wikidata, setWikidata] = useState<WikidataPickerValue | null>(null);

  function addExisting(category: string) {
    if (!existingCategories.includes(category)) {
      addChange({
        id: crypto.randomUUID(),
        type: "addCategory",
        fileTitle,
        category,
        label: t("addCategoryLabel", { name: fileName, category }),
      });
      onAdded(category);
    }
    onClose();
  }

  function createAndAdd() {
    const cleanName = name.trim();
    const cleanParent = parent.trim();
    if (!cleanName || !cleanParent) return;
    addChange({
      id: crypto.randomUUID(),
      type: "createCategory",
      name: cleanName,
      parentCategory: cleanParent,
      wikidataQid: wikidata?.id,
      files: [],
      label: tn("createLabel", { parent: cleanParent, name: cleanName }),
    });
    addChange({
      id: crypto.randomUUID(),
      type: "addCategory",
      fileTitle,
      category: cleanName,
      label: t("addCategoryLabel", { name: fileName, category: cleanName }),
    });
    onAdded(cleanName);
    onClose();
  }

  return (
    <Modal
      title={mode === "search" ? t("addCategoryTitle") : tn("modalTitle")}
      onClose={onClose}
      footer={
        mode === "search" ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100"
          >
            {t("cancel")}
          </button>
        ) : (
          <ModalActions
            onCancel={onClose}
            cancelLabel={tn("cancel")}
            onConfirm={createAndAdd}
            confirmLabel={tn("save")}
            confirmDisabled={!name.trim() || !parent.trim()}
          />
        )
      }
    >
      {mode === "search" ? (
        <>
          <CategoryPicker onSelect={addExisting} excluding={existingCategories} />
          <button
            type="button"
            onClick={() => setMode("create")}
            className="rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-xs text-slate-400 hover:border-slate-400 hover:text-slate-600"
          >
            {t("createNewCategory")}
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setMode("search")}
            className="text-xs text-slate-500 underline hover:text-slate-800"
          >
            {t("backToSearch")}
          </button>

          <FormField label={tn("nameLabel")}>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={tn("namePlaceholder")}
              className={formFieldInputClassName}
            />
          </FormField>

          <FormField label={t("parentCategoryLabel")}>
            <input
              value={parent}
              onChange={(e) => setParent(e.target.value)}
              className={formFieldInputClassName}
            />
          </FormField>

          <FormField label={tn("qidLabel")} note={tn("qidNote")}>
            <WikidataPicker value={wikidata} onChange={setWikidata} />
          </FormField>
        </>
      )}
    </Modal>
  );
}
