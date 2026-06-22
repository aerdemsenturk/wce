// Shared domain types for the read-only v1 browser.

export interface Subcategory {
  /** Full title incl. "Category:" prefix, e.g. "Category:Lycian Way" */
  title: string;
  /** Display name without the "Category:" prefix */
  name: string;
  /** Number of files directly in this category (null if unknown) */
  files: number | null;
  /** Number of subcategories (null if unknown) */
  subcats: number | null;
  /** Linked Wikidata item, if any (null if none or not yet resolved) */
  wikidata: CategoryWikidata | null;
}

export interface CategoryWikidata {
  id: string; // Q-id
  label: string | null;
}

export interface CategoryChildren {
  category: string; // requested title (normalized, with prefix)
  subcategories: Subcategory[];
  files: number | null; // file count of the category itself
  wikidata: CategoryWikidata | null;
}

export interface CategoryFile {
  pageid: number;
  title: string; // "File:Foo.jpg"
  name: string; // "Foo.jpg"
  timestamp: string | null; // upload timestamp (ISO)
}

export interface LangText {
  lang: string;
  value: string;
}

export interface Coordinates {
  lat: number;
  lon: number;
}

/** A depicted entity (Commons Structured Data, P180). */
export interface Depict {
  id: string; // Q-id
  label: string | null;
  statementId: string; // Wikibase claim GUID, e.g. "M123$xxxxxxxx-..."
}

export interface FileDetail {
  pageid: number;
  title: string; // "File:Foo.jpg"
  name: string; // "Foo.jpg"
  descriptionUrl: string; // Commons file page
  mediaId: string; // "M{pageid}" — structured data entity id
  thumbUrl: string | null;
  thumbWidth: number | null;
  thumbHeight: number | null;
  size: number | null;
  descriptions: LangText[];
  date: string | null;
  author: string | null;
  license: { short: string | null; url: string | null };
  categories: string[]; // visible category names (no "Category:" prefix)
  coordinates: Coordinates | null;
  depicts: Depict[];
}

/** Presence of each metadata field, derived from imageinfo extmetadata. */
export interface FileStatus {
  description: boolean;
  date: boolean;
  author: boolean;
  license: boolean;
  location: boolean;
}

export interface CategoryFileInfo {
  pageid: number;
  title: string; // "File:Foo.jpg"
  name: string; // "Foo.jpg"
  descriptionUrl: string; // Commons file page
  thumbUrl: string | null;
  thumbWidth: number | null;
  thumbHeight: number | null;
  size: number | null; // bytes
  mediatype: string | null;
  uploadYear: number | null;
  status: FileStatus;
  /** How many of the 5 status fields are missing (used for sort/filter). */
  missingCount: number;
}
