"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Modal, { ModalActions } from "@/components/ui/Modal";
import { formFieldInputClassName } from "@/components/ui/FormField";

export default function EditDescriptionModal({
  lang,
  value,
  onSave,
  onClose,
}: {
  lang: string;
  value: string;
  onSave: (value: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations("detail");
  const [draft, setDraft] = useState(value);

  function submit() {
    onSave(draft.trim());
    onClose();
  }

  return (
    <Modal
      title={
        lang !== "und"
          ? t("editDescriptionTitleLang", { lang: lang.toUpperCase() })
          : t("editDescriptionTitle")
      }
      onClose={onClose}
      footer={
        <ModalActions
          onCancel={onClose}
          cancelLabel={t("cancel")}
          onConfirm={submit}
          confirmLabel={t("save")}
        />
      }
    >
      <textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={5}
        className={`${formFieldInputClassName} resize-none`}
      />
    </Modal>
  );
}
