// Shared drag-and-drop payload for moving a file or subcategory into a
// different category (HTML5 DnD, used by FileCard, CategoryCard, CategoryNode).

import type { CategoryFileInfo, Subcategory } from "./types";

const MIME = "application/x-wce-dnd";

export interface DragPayload {
  /** Full page title being moved, e.g. "File:Foo.jpg" or "Category:Bar". */
  pageTitle: string;
  /** The category it currently lives directly under. */
  fromCategory: string;
  kind: "file" | "category";
  /** Snapshot of the dragged item, so the drop target can show it in its
   * pending-move overlay without a server round-trip. */
  file?: CategoryFileInfo;
  subcat?: Subcategory;
  /** When the dragged file is part of a multi-selection, the full set being
   * moved together (includes `file`). Length > 1 signals a batch move. */
  files?: CategoryFileInfo[];
}

export function setDragPayload(e: React.DragEvent, payload: DragPayload): void {
  e.dataTransfer.setData(MIME, JSON.stringify(payload));
  e.dataTransfer.effectAllowed = "move";
}

export function readDragPayload(e: React.DragEvent): DragPayload | null {
  const raw = e.dataTransfer.getData(MIME);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DragPayload;
  } catch {
    return null;
  }
}

export function hasDragPayload(e: React.DragEvent): boolean {
  return e.dataTransfer.types.includes(MIME);
}

/** Replaces the default single-card drag ghost with a small count pill, so a
 * multi-selection drag reads as "moving N items" rather than just the one card
 * the pointer grabbed. The transient node is removed once the browser has
 * snapshotted it (next tick). */
export function setMultiDragImage(e: React.DragEvent, count: number): void {
  const node = document.createElement("div");
  node.className = "wce-drag-count";
  node.textContent = String(count);
  document.body.appendChild(node);
  e.dataTransfer.setDragImage(node, 16, 16);
  setTimeout(() => node.remove(), 0);
}
