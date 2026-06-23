"use client";

import { useId, type ReactNode } from "react";

/** Shared dialog chrome (backdrop + centered panel) for every modal-based
 * form in the app — see CLAUDE.md: edits are always confirmed via a modal,
 * never inline. */
export default function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  const titleId = useId();

  return (
    <div
      role="dialog"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-4 rounded-lg bg-panel p-5 shadow-xl"
      >
        <h2 id={titleId} className="text-sm font-semibold text-slate-800">
          {title}
        </h2>
        {children}
        <div className="flex justify-end gap-2 pt-1">{footer}</div>
      </div>
    </div>
  );
}

export function ModalActions({
  onCancel,
  cancelLabel,
  cancelDisabled,
  onConfirm,
  confirmLabel,
  confirmDisabled,
}: {
  onCancel: () => void;
  cancelLabel: string;
  cancelDisabled?: boolean;
  onConfirm: () => void;
  confirmLabel: string;
  confirmDisabled?: boolean;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onCancel}
        disabled={cancelDisabled}
        className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-40"
      >
        {cancelLabel}
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={confirmDisabled}
        className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
      >
        {confirmLabel}
      </button>
    </>
  );
}
