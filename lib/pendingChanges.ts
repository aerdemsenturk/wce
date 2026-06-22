// Local change queue for the "batch, then publish" write flow: edits made
// through the UI are recorded here and only sent to Commons when the user
// hits Publish. The overlay functions below let the tree/grid/detail views
// show the queue's effect before anything is actually written.

import type { CategoryFileInfo, LangText, Subcategory } from "./types";
import { stripCategoryPrefix, withCategoryPrefix } from "./category";

export interface DescriptionChange {
  id: string;
  type: "description";
  fileTitle: string; // "File:Foo.jpg"
  lang: string;
  newValue: string;
  label: string;
}

export interface MoveChange {
  id: string;
  type: "move";
  pageTitle: string;
  fromCategory: string;
  toCategory: string;
  kind: "file" | "category";
  /** Snapshot of the moved item, used to render it in the target view
   * without a server round-trip. */
  file?: CategoryFileInfo;
  subcat?: Subcategory;
  label: string;
}

export interface CreateCategoryChange {
  id: string;
  type: "createCategory";
  name: string;
  parentCategory: string;
  wikidataQid?: string;
  /** Snapshot of the files to move into the new category. */
  files: CategoryFileInfo[];
  label: string;
}

export type PendingChange = DescriptionChange | MoveChange | CreateCategoryChange;

/** Subcategories listed under `category`, adjusted for not-yet-published
 * moves and category creations. */
export function overlaySubcategories(
  category: string,
  base: Subcategory[],
  changes: PendingChange[],
): Subcategory[] {
  let result = base;
  for (const change of changes) {
    if (change.type === "move" && change.kind === "category") {
      const movedName = stripCategoryPrefix(change.pageTitle);
      if (change.fromCategory === category) {
        result = result.filter((s) => s.name !== movedName);
      }
      if (change.toCategory === category && change.subcat) {
        result = [...result.filter((s) => s.name !== change.subcat!.name), change.subcat];
      }
    }
    if (change.type === "createCategory" && change.parentCategory === category) {
      const synthetic: Subcategory = {
        title: withCategoryPrefix(change.name),
        name: change.name,
        files: change.files.length,
        subcats: 0,
        wikidata: change.wikidataQid ? { id: change.wikidataQid, label: null } : null,
      };
      result = [...result.filter((s) => s.name !== change.name), synthetic];
    }
  }
  return result;
}

/** Files listed in `category`'s grid, adjusted for not-yet-published moves
 * and category creations. */
export function overlayFiles(
  category: string,
  base: CategoryFileInfo[],
  changes: PendingChange[],
): CategoryFileInfo[] {
  let result = base;
  for (const change of changes) {
    if (change.type === "move" && change.kind === "file") {
      if (change.fromCategory === category) {
        result = result.filter((f) => f.title !== change.pageTitle);
      }
      if (change.toCategory === category && change.file) {
        result = [...result.filter((f) => f.title !== change.file!.title), change.file];
      }
    }
    if (change.type === "createCategory") {
      if (change.parentCategory === category) {
        const movedTitles = new Set(change.files.map((f) => f.title));
        result = result.filter((f) => !movedTitles.has(f.title));
      }
      if (change.name === category) {
        const existing = new Set(result.map((f) => f.title));
        result = [...result, ...change.files.filter((f) => !existing.has(f.title))];
      }
    }
  }
  return result;
}

/** A brand-new category's subcategory listing — it doesn't exist on Commons
 * yet, so this lets callers skip the network fetch entirely. Null if
 * `category` isn't a pending creation. */
export function syntheticChildrenFor(
  category: string,
  changes: PendingChange[],
): Subcategory[] | null {
  const exists = changes.some(
    (c): c is CreateCategoryChange => c.type === "createCategory" && c.name === category,
  );
  return exists ? [] : null;
}

/** A brand-new category's file grid, sourced purely from the pending
 * creation's file snapshot. Null if `category` isn't a pending creation. */
export function syntheticFilesFor(
  category: string,
  changes: PendingChange[],
): CategoryFileInfo[] | null {
  const change = changes.find(
    (c): c is CreateCategoryChange => c.type === "createCategory" && c.name === category,
  );
  return change ? change.files : null;
}

/** Description text for `fileTitle`, adjusted for not-yet-published edits. */
export function overlayDescriptions(
  fileTitle: string,
  base: LangText[],
  changes: PendingChange[],
): LangText[] {
  let result = base;
  for (const change of changes) {
    if (change.type === "description" && change.fileTitle === fileTitle) {
      result = result.map((d) =>
        d.lang === change.lang ? { ...d, value: change.newValue } : d,
      );
    }
  }
  return result;
}

/** A file's visible category list, adjusted for not-yet-published moves. */
export function overlayCategories(
  fileTitle: string,
  base: string[],
  changes: PendingChange[],
): string[] {
  let result = base;
  for (const change of changes) {
    if (change.type === "move" && change.kind === "file" && change.pageTitle === fileTitle) {
      result = result.map((c) => (c === change.fromCategory ? change.toCategory : c));
    }
    if (change.type === "createCategory") {
      const moved = change.files.some((f) => f.title === fileTitle);
      if (moved) {
        result = result.map((c) => (c === change.parentCategory ? change.name : c));
      }
    }
  }
  return result;
}
