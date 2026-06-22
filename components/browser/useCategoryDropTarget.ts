"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { readDragPayload, hasDragPayload } from "@/lib/dnd";
import { useBrowser } from "./BrowserProvider";

/** Makes any element a drop target that accepts a dragged file or
 * subcategory and queues a move into `toCategory` (not written to Commons
 * until the user hits Publish). */
export function useCategoryDropTarget(toCategory: string) {
  const t = useTranslations("dnd");
  const { showToast, addChange } = useBrowser();
  const [isOver, setIsOver] = useState(false);

  function onDragOver(e: React.DragEvent) {
    if (!hasDragPayload(e)) return;
    e.preventDefault();
    setIsOver(true);
  }

  function onDragLeave() {
    setIsOver(false);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsOver(false);
    const payload = readDragPayload(e);
    if (!payload) return;
    if (payload.fromCategory === toCategory) return;

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
