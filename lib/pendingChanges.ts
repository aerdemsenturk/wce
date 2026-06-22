// Local change queue for the "batch, then publish" write flow: edits made
// through the UI are recorded here and only sent to Commons when the user
// hits Publish. The overlay functions below let the tree/grid/detail views
// show the queue's effect before anything is actually written.

import type {
  CategoryFileInfo,
  CategoryWikidata,
  Coordinates,
  Depict,
  LangText,
  Subcategory,
} from "./types";
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

export interface RemoveCategoryChange {
  id: string;
  type: "removeCategory";
  fileTitle: string; // "File:Foo.jpg"
  category: string;
  label: string;
}

export interface RenameChange {
  id: string;
  type: "rename";
  oldName: string;
  newName: string;
  parentCategory: string | null;
  wikidataQid?: string;
  label: string;
}

export interface AddCategoryChange {
  id: string;
  type: "addCategory";
  fileTitle: string; // "File:Foo.jpg"
  category: string;
  label: string;
}

export interface AddDepictChange {
  id: string;
  type: "addDepict";
  fileTitle: string; // "File:Foo.jpg"
  pageid: number;
  qid: string;
  depictLabel: string | null;
  label: string;
}

export interface RemoveDepictChange {
  id: string;
  type: "removeDepict";
  fileTitle: string; // "File:Foo.jpg"
  statementId: string;
  label: string;
}

export interface LocationChange {
  id: string;
  type: "location";
  fileTitle: string; // "File:Foo.jpg"
  lat: number;
  lon: number;
  label: string;
}

export type PendingChange =
  | DescriptionChange
  | MoveChange
  | CreateCategoryChange
  | RemoveCategoryChange
  | RenameChange
  | AddCategoryChange
  | AddDepictChange
  | RemoveDepictChange
  | LocationChange;

/** Walks pending renames back to the name the category still has on
 * Commons, so views can fetch/compare using a name that actually exists
 * server-side even after the user has renamed it locally. */
export function resolveCategoryName(category: string, changes: PendingChange[]): string {
  let result = category;
  let changed = true;
  while (changed) {
    changed = false;
    for (const change of changes) {
      if (change.type === "rename" && change.newName === result) {
        result = change.oldName;
        changed = true;
      }
    }
  }
  return result;
}

/** Subcategories listed under `category`, adjusted for not-yet-published
 * moves and category creations. */
export function overlaySubcategories(
  category: string,
  base: Subcategory[],
  changes: PendingChange[],
): Subcategory[] {
  const canon = (c: string) => resolveCategoryName(c, changes);
  let result = base;
  for (const change of changes) {
    if (change.type === "move" && change.kind === "category") {
      const movedName = stripCategoryPrefix(change.pageTitle);
      if (canon(change.fromCategory) === canon(category)) {
        result = result.filter((s) => s.name !== movedName);
      }
      if (canon(change.toCategory) === canon(category) && change.subcat) {
        result = [...result.filter((s) => s.name !== change.subcat!.name), change.subcat];
      }
    }
    if (change.type === "createCategory" && canon(change.parentCategory) === canon(category)) {
      const synthetic: Subcategory = {
        title: withCategoryPrefix(change.name),
        name: change.name,
        files: change.files.length,
        subcats: 0,
        wikidata: change.wikidataQid ? { id: change.wikidataQid, label: null } : null,
      };
      result = [...result.filter((s) => s.name !== change.name), synthetic];
    }
    if (change.type === "rename" && change.parentCategory && canon(change.parentCategory) === canon(category)) {
      result = result.map((s) =>
        s.name === change.oldName
          ? { ...s, name: change.newName, title: withCategoryPrefix(change.newName) }
          : s,
      );
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
  const canon = (c: string) => resolveCategoryName(c, changes);
  let result = base;
  for (const change of changes) {
    if (change.type === "move" && change.kind === "file") {
      if (canon(change.fromCategory) === canon(category)) {
        result = result.filter((f) => f.title !== change.pageTitle);
      }
      if (canon(change.toCategory) === canon(category) && change.file) {
        result = [...result.filter((f) => f.title !== change.file!.title), change.file];
      }
    }
    if (change.type === "createCategory") {
      if (canon(change.parentCategory) === canon(category)) {
        const movedTitles = new Set(change.files.map((f) => f.title));
        result = result.filter((f) => !movedTitles.has(f.title));
      }
      if (canon(change.name) === canon(category)) {
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
  const canon = (c: string) => resolveCategoryName(c, changes);
  const exists = changes.some(
    (c): c is CreateCategoryChange => c.type === "createCategory" && canon(c.name) === canon(category),
  );
  return exists ? [] : null;
}

/** A brand-new category's file grid, sourced purely from the pending
 * creation's file snapshot. Null if `category` isn't a pending creation. */
export function syntheticFilesFor(
  category: string,
  changes: PendingChange[],
): CategoryFileInfo[] | null {
  const canon = (c: string) => resolveCategoryName(c, changes);
  const change = changes.find(
    (c): c is CreateCategoryChange => c.type === "createCategory" && canon(c.name) === canon(category),
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

/** A file's coordinates, adjusted for a not-yet-published location edit. */
export function overlayLocation(
  fileTitle: string,
  base: Coordinates | null,
  changes: PendingChange[],
): Coordinates | null {
  let result = base;
  for (const change of changes) {
    if (change.type === "location" && change.fileTitle === fileTitle) {
      result = { lat: change.lat, lon: change.lon };
    }
  }
  return result;
}

/** A category's Wikidata note, adjusted for a not-yet-published rename that
 * also changed (or cleared) the note. */
export function overlayWikidata(
  category: string,
  base: CategoryWikidata | null,
  changes: PendingChange[],
): CategoryWikidata | null {
  const canon = (c: string) => resolveCategoryName(c, changes);
  let result = base;
  for (const change of changes) {
    if (
      change.type === "rename" &&
      change.wikidataQid !== undefined &&
      canon(change.newName) === canon(category)
    ) {
      result = change.wikidataQid ? { id: change.wikidataQid, label: null } : null;
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
    if (change.type === "removeCategory" && change.fileTitle === fileTitle) {
      result = result.filter((c) => c !== change.category);
    }
    if (change.type === "addCategory" && change.fileTitle === fileTitle) {
      if (!result.includes(change.category)) result = [...result, change.category];
    }
    if (change.type === "rename") {
      result = result.map((c) => (c === change.oldName ? change.newName : c));
    }
  }
  return result;
}

/** A file's visible depicts list, adjusted for not-yet-published add/remove
 * statements. Added depicts carry a synthetic "pending" statement id until
 * the change is published and the real claim GUID comes back from Commons. */
export function overlayDepicts(
  fileTitle: string,
  base: Depict[],
  changes: PendingChange[],
): Depict[] {
  let result = base;
  for (const change of changes) {
    if (change.type === "removeDepict" && change.fileTitle === fileTitle) {
      result = result.filter((d) => d.statementId !== change.statementId);
    }
    if (change.type === "addDepict" && change.fileTitle === fileTitle) {
      if (!result.some((d) => d.id === change.qid)) {
        result = [
          ...result,
          { id: change.qid, label: change.depictLabel, statementId: "pending" },
        ];
      }
    }
  }
  return result;
}
