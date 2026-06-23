"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useBrowser } from "@/components/browser/BrowserProvider";
import Modal, { ModalActions } from "@/components/ui/Modal";
import FormField, { formFieldInputClassName } from "@/components/ui/FormField";

export default function NominateDeletionModal({
  fileTitle,
  fileName,
  onClose,
}: {
  fileTitle: string;
  fileName: string;
  onClose: () => void;
}) {
  const t = useTranslations("detail");
  const { addChange } = useBrowser();
  const [reason, setReason] = useState("");

  function confirm() {
    const cleanReason = reason.trim();
    if (!cleanReason) return;
    addChange({
      id: crypto.randomUUID(),
      type: "nominateDeletion",
      fileTitle,
      reason: cleanReason,
      label: t("nominateDeletionLabel", { name: fileName }),
    });
    onClose();
  }

  return (
    <Modal
      title={t("nominateDeletionTitle")}
      onClose={onClose}
      footer={
        <ModalActions
          onCancel={onClose}
          cancelLabel={t("cancel")}
          onConfirm={confirm}
          confirmLabel={t("save")}
          confirmDisabled={!reason.trim()}
        />
      }
    >
      <FormField label={t("nominateDeletionReason")}>
        <input
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t("nominateDeletionReasonPlaceholder")}
          className={formFieldInputClassName}
        />
      </FormField>
    </Modal>
  );
}
