// Shared drag-and-drop payload for moving a file or subcategory into a
// different category (HTML5 DnD, used by FileCard, CategoryCard, CategoryNode).

const MIME = "application/x-wce-dnd";

export interface DragPayload {
  /** Full page title being moved, e.g. "File:Foo.jpg" or "Category:Bar". */
  pageTitle: string;
  /** The category it currently lives directly under. */
  fromCategory: string;
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
