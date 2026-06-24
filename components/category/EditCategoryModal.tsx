"use client";

import { useEffect, useRef, useState } from "react";
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
  // Whether we actually know the category's current Wikidata link — false
  // while the lookup is in flight or if it failed. Commons can take a beat
  // to reflect a just-created sitelink (Wikibase Client job queue lag), so a
  // reopened modal can briefly read back "no link" even right after setting
  // one. Submitting that as the truth would silently clear the real link.
  const [wikidataLoaded, setWikidataLoaded] = useState(false);
  const wikidataTouched = useRef(false);

  useEffect(() => {
    let active = true;
    setWikidataLoaded(false);
    wikidataTouched.current = false;
    fetchCategoryWikidataNote(category)
      .then((qid) => {
        if (active) {
          setWikidata(qid ? { id: qid, label: null } : null);
          setWikidataLoaded(true);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [category]);

  function submit() {
    const newName = name.trim();
    if (!newName) return;
    // Only carry a Wikidata change when the user explicitly picked/cleared
    // one, or when the lookup actually loaded (so resubmitting an untouched,
    // successfully-loaded value is a harmless no-op). Otherwise omit it
    // entirely rather than submit an unknown state as "no link".
    const wikidataQid =
      wikidataTouched.current || wikidataLoaded ? wikidata?.id ?? "" : undefined;
    if (newName === category && wikidataQid === undefined) {
      onClose();
      return;
    }
    addChange({
      id: crypto.randomUUID(),
      type: "rename",
      oldName: category,
      newName,
      parentCategory,
      wikidataQid,
      label:
        newName === category
          ? t("wikidataOnlyLabel", { name: category })
          : t("renameLabel", { oldName: category, newName }),
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
        <WikidataPicker
          value={wikidata}
          onChange={(v) => {
            wikidataTouched.current = true;
            setWikidata(v);
          }}
        />
      </FormField>
    </Modal>
  );
}
