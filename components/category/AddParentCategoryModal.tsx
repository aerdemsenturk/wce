"use client";

import { useTranslations } from "next-intl";
import { useBrowser } from "@/components/browser/BrowserProvider";
import Modal from "@/components/ui/Modal";
import CategoryPicker from "@/components/ui/CategoryPicker";
import { withCategoryPrefix } from "@/lib/category";

export default function AddParentCategoryModal({
  category,
  existingParents,
  onClose,
}: {
  category: string;
  existingParents: string[];
  onClose: () => void;
}) {
  const t = useTranslations("sidebar");
  const { addChange } = useBrowser();

  function addParent(parent: string) {
    if (!existingParents.includes(parent) && parent !== category) {
      addChange({
        id: crypto.randomUUID(),
        type: "addCategory",
        fileTitle: withCategoryPrefix(category),
        category: parent,
        label: t("addParentCategoryLabel", { name: category, category: parent }),
      });
    }
    onClose();
  }

  return (
    <Modal
      title={t("addParentCategoryTitle")}
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100"
        >
          {t("cancel")}
        </button>
      }
    >
      <CategoryPicker onSelect={addParent} excluding={[...existingParents, category]} />
    </Modal>
  );
}
