"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { moveCategoryMembership } from "@/lib/api";
import { readDragPayload, hasDragPayload } from "@/lib/dnd";
import { useBrowser } from "./BrowserProvider";

/** Makes any element a drop target that accepts a dragged file or
 * subcategory and moves it under `toCategory`. */
export function useCategoryDropTarget(toCategory: string) {
  const t = useTranslations("dnd");
  const { showToast, bumpVersion } = useBrowser();
  const [isOver, setIsOver] = useState(false);

  function onDragOver(e: React.DragEvent) {
    if (!hasDragPayload(e)) return;
    e.preventDefault();
    setIsOver(true);
  }

  function onDragLeave() {
    setIsOver(false);
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsOver(false);
    const payload = readDragPayload(e);
    if (!payload) return;
    if (payload.fromCategory === toCategory) return;

    try {
      await moveCategoryMembership(payload.pageTitle, payload.fromCategory, toCategory);
      bumpVersion();
      showToast({ message: t("moveSuccess", { target: toCategory }), tone: "success" });
    } catch (err) {
      showToast({
        message: err instanceof Error ? err.message : t("moveError"),
        tone: "error",
      });
    }
  }

  return { isOver, onDragOver, onDragLeave, onDrop };
}
