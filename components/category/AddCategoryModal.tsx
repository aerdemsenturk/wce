"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useBrowser } from "@/components/browser/BrowserProvider";
import { useToast } from "@/components/ui/ToastProvider";
import Modal, { ModalActions } from "@/components/ui/Modal";
import FormField from "@/components/ui/FormField";
import CategoryPicker from "@/components/ui/CategoryPicker";
import WikidataPicker, { type WikidataPickerValue } from "@/components/ui/WikidataPicker";

export default function AddCategoryModal({
  parentCategory,
  onClose,
}: {
  parentCategory: string;
  onClose: () => void;
}) {
  const t = useTranslations("newCategory");
  const { addChange } = useBrowser();
  const { showToast } = useToast();

  const [name, setName] = useState("");
  const [wikidata, setWikidata] = useState<WikidataPickerValue | null>(null);

  function submit() {
    const cleanName = name.trim();
    if (!cleanName) return;
    addChange({
      id: crypto.randomUUID(),
      type: "createCategory",
      name: cleanName,
      parentCategory,
      wikidataQid: wikidata?.id,
      files: [],
      label: t("createLabel", { parent: parentCategory, name: cleanName }),
    });
    showToast({ message: t("queued", { name: cleanName }), tone: "success" });
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
        <CategoryPicker value={name} onChange={setName} onSelect={setName} />
      </FormField>

      <FormField label={t("qidLabel")} note={t("qidNote")}>
        <WikidataPicker value={wikidata} onChange={setWikidata} />
      </FormField>
    </Modal>
  );
}
