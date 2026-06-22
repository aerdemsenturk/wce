"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useBrowser } from "@/components/browser/BrowserProvider";
import { fetchCategoryWikidataNote } from "@/lib/api";
import Modal, { ModalActions } from "@/components/ui/Modal";
import FormField, { formFieldInputClassName } from "@/components/ui/FormField";
import WikidataPicker, { type WikidataPickerValue } from "@/components/ui/WikidataPicker";

export default function EditCategoryModal({
  category,
  parentCategory,
  onClose,
}: {
  category: string;
  parentCategory: string | null;
  onClose: () => void;
}) {
  const t = useTranslations("rename");
  const { addChange, renameCurrent } = useBrowser();

  const [name, setName] = useState(category);
  const [wikidata, setWikidata] = useState<WikidataPickerValue | null>(null);

  useEffect(() => {
    let active = true;
    fetchCategoryWikidataNote(category)
      .then((qid) => {
        if (active) setWikidata(qid ? { id: qid, label: null } : null);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [category]);

  function submit() {
    const newName = name.trim();
    if (!newName) return;
    addChange({
      id: crypto.randomUUID(),
      type: "rename",
      oldName: category,
      newName,
      parentCategory,
      wikidataQid: wikidata?.id ?? "",
      label: t("renameLabel", { oldName: category, newName }),
    });
    if (newName !== category) renameCurrent(newName);
    onClose();
  }

  return (
    <Modal
      title={t("modalTitle")}
      onClose={onClose}
      footer={
        <ModalActions
          onCancel={onClose}
          cancelLabel={t("cancel")}
          onConfirm={submit}
          confirmLabel={t("save")}
          confirmDisabled={!name.trim()}
        />
      }
    >
      <FormField label={t("nameLabel")}>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={formFieldInputClassName}
        />
      </FormField>

      <FormField label={t("qidLabel")} note={t("qidNote")}>
        <WikidataPicker value={wikidata} onChange={setWikidata} />
      </FormField>
    </Modal>
  );
}
