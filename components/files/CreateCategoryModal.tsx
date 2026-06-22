"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { CategoryFileInfo } from "@/lib/types";
import { useBrowser } from "@/components/browser/BrowserProvider";
import Modal, { ModalActions } from "@/components/ui/Modal";
import FormField, { formFieldInputClassName } from "@/components/ui/FormField";

export default function CreateCategoryModal({
  parentCategory,
  files,
  onClose,
}: {
  parentCategory: string;
  files: CategoryFileInfo[];
  onClose: () => void;
}) {
  const t = useTranslations("merge");
  const { path, selectPath, clearSelected, addChange, showToast } = useBrowser();

  const [name, setName] = useState("");
  const [qid, setQid] = useState("");
  const [included, setIncluded] = useState<Set<string>>(
    new Set(files.map((f) => f.title)),
  );

  function toggle(title: string) {
    setIncluded((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }

  function submit() {
    const cleanName = name.trim();
    if (!cleanName || included.size === 0) return;
    addChange({
      id: crypto.randomUUID(),
      type: "createCategory",
      name: cleanName,
      parentCategory,
      wikidataQid: qid.trim() || undefined,
      files: files.filter((f) => included.has(f.title)),
      label: t("createLabel", { name: cleanName, count: included.size }),
    });
    clearSelected();
    showToast({ message: t("queued", { name: cleanName }), tone: "success" });
    selectPath([...path, cleanName]);
    onClose();
  }

  return (
    <Modal
      title={t("title")}
      onClose={onClose}
      footer={
        <ModalActions
          onCancel={onClose}
          cancelLabel={t("cancel")}
          onConfirm={submit}
          confirmLabel={t("create")}
          confirmDisabled={!name.trim() || included.size === 0}
        />
      }
    >
      <FormField
        label={t("nameLabel")}
        note={t("parentNote", { parent: parentCategory })}
      >
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("namePlaceholder")}
          className={formFieldInputClassName}
        />
      </FormField>

      <FormField label={t("qidLabel")}>
        <input
          value={qid}
          onChange={(e) => setQid(e.target.value)}
          placeholder={t("qidPlaceholder")}
          className={formFieldInputClassName}
        />
      </FormField>

      <div className="space-y-1">
        <p className="text-xs font-medium text-slate-500">
          {t("itemsLabel", { count: included.size })}
        </p>
        <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border-base p-2">
          {files.map((f) => (
            <li key={f.title} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={included.has(f.title)}
                onChange={() => toggle(f.title)}
                className="shrink-0"
              />
              <span className="truncate text-slate-700">{f.name}</span>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
