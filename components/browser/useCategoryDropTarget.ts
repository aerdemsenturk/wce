"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { readDragPayload, hasDragPayload } from "@/lib/dnd";
import { stripCategoryPrefix } from "@/lib/category";
import { useBrowser } from "./BrowserProvider";

/** Makes any element a drop target that accepts a dragged file or
 * subcategory and queues a move into `toCategory` (not written to Commons
 * until the user hits Publish). */
export function useCategoryDropTarget(toCategory: string) {
  const t = useTranslations("dnd");
  const { showToast, addChange, clearSelected } = useBrowser();
  const [isOver, setIsOver] = useState(false);

  function onDragOver(e: React.DragEvent) {
    if (!hasDragPayload(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setIsOver(true);
  }

  function onDragLeave(e: React.DragEvent) {
    // dragleave also fires when the pointer crosses into a child element;
    // only clear the highlight when it has actually left this drop target,
    // otherwise the highlight flickers as the cursor moves across the card.
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setIsOver(false);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsOver(false);
    const payload = readDragPayload(e);
    if (!payload) return;
    // Already lives here, or it's a category being dropped onto itself.
    if (payload.fromCategory === toCategory) return;
    if (payload.kind === "category" && stripCategoryPrefix(payload.pageTitle) === toCategory) return;

    // Batch move: a multi-selection drag queues one move per selected file.
    const batch =
      payload.kind === "file" && payload.files && payload.files.length > 1
        ? payload.files
        : null;
    if (batch) {
      for (const file of batch) {
        addChange({
          id: crypto.randomUUID(),
          type: "move",
          pageTitle: file.title,
          fromCategory: payload.fromCategory,
          toCategory,
          kind: "file",
          file,
          label: t("moveLabel", { name: file.name, target: toCategory }),
        });
      }
      showToast({
        message: t("moveQueuedMany", { count: batch.length, target: toCategory }),
        tone: "success",
      });
      clearSelected();
      return;
    }

    const name = payload.kind === "file" ? payload.file?.name : payload.subcat?.name;
    addChange({
      id: crypto.randomUUID(),
      type: "move",
      pageTitle: payload.pageTitle,
      fromCategory: payload.fromCategory,
      toCategory,
      kind: payload.kind,
      file: payload.file,
      subcat: payload.subcat,
      label: t("moveLabel", { name: name ?? payload.pageTitle, target: toCategory }),
    });
    showToast({ message: t("moveQueued", { target: toCategory }), tone: "success" });
  }

  return { isOver, onDragOver, onDragLeave, onDrop };
}
