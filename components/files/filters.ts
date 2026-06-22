import type { CategoryFileInfo } from "@/lib/types";

export type FilterKey = "all" | "description" | "date" | "location";
export type SortKey = "name" | "date" | "missing";

export interface FilterCounts {
  all: number;
  description: number; // missing description
  date: number; // missing date
  location: number; // missing location
}

export function computeCounts(files: CategoryFileInfo[]): FilterCounts {
  return {
    all: files.length,
    description: files.filter((f) => !f.status.description).length,
    date: files.filter((f) => !f.status.date).length,
    location: files.filter((f) => !f.status.location).length,
  };
}

export function applyFilter(
  files: CategoryFileInfo[],
  filter: FilterKey,
): CategoryFileInfo[] {
  switch (filter) {
    case "description":
      return files.filter((f) => !f.status.description);
    case "date":
      return files.filter((f) => !f.status.date);
    case "location":
      return files.filter((f) => !f.status.location);
    default:
      return files;
  }
}

export function applySort(
  files: CategoryFileInfo[],
  sort: SortKey,
): CategoryFileInfo[] {
  const copy = [...files];
  switch (sort) {
    case "date":
      // Newest upload first; unknown years sink to the bottom.
      return copy.sort(
        (a, b) => (b.uploadYear ?? -Infinity) - (a.uploadYear ?? -Infinity),
      );
    case "missing":
      return copy.sort((a, b) => b.missingCount - a.missingCount);
    case "name":
    default:
      return copy.sort((a, b) => a.name.localeCompare(b.name));
  }
}
