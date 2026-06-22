"use client";

import { useTranslations } from "next-intl";
import type { PendingChange } from "@/lib/pendingChanges";
import Modal, { ModalActions } from "@/components/ui/Modal";

export default function PublishConfirmModal({
  changes,
  onConfirm,
  onClose,
}: {
  changes: PendingChange[];
  onConfirm: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("publish");

  return (
    <Modal
      title={t("confirmTitle", { count: changes.length })}
      onClose={onClose}
      footer={
        <ModalActions
          onCancel={onClose}
          cancelLabel={t("confirmCancel")}
          onConfirm={onConfirm}
          confirmLabel={t("confirmConfirm")}
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
