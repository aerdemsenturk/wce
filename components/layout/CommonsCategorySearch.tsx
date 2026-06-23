"use client";

import { useBrowser } from "@/components/browser/BrowserProvider";
import CategoryPicker from "@/components/ui/CategoryPicker";

/** Header-level instant search across all of Wikimedia Commons — picking a
 * result jumps the browser there via `setRoot`, distinct from `SearchBox`,
 * which searches files within the currently open category. */
export default function CommonsCategorySearch() {
  const { setRoot } = useBrowser();

  return <CategoryPicker onSelect={setRoot} autoFocus={false} />;
}
