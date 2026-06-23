"use client";

import { useTranslations } from "next-intl";
import type { PendingChange } from "@/lib/pendingChanges";
import Modal, { ModalActions } from "@/components/ui/Modal";

export default function PublishConfirmModal({
  changes,
  publishing,
  onConfirm,
  onClose,
}: {
  changes: PendingChange[];
  publishing: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("publish");

  return (
    <Modal
      title={t("confirmTitle", { count: changes.length })}
      onClose={publishing ? () => {} : onClose}
      footer={
        <ModalActions
          onCancel={onClose}
          cancelLabel={t("confirmCancel")}
          cancelDisabled={publishing}
          onConfirm={onConfirm}
          confirmLabel={publishing ? t("confirmPublishing") : t("confirmConfirm")}
          confirmDisabled={publishing}
        />
      }
    >
      <ul className="max-h-72 space-y-1.5 overflow-y-auto text-sm text-slate-700">
        {changes.map((c) => (
          <li key={c.id}>{c.label}</li>
        ))}
      </ul>
    </Modal>
  );
}
