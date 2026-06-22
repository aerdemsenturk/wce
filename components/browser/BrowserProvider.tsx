"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const ROOT_STORAGE_KEY = "wce:root-category";

import type { CategoryFileInfo } from "@/lib/types";

interface BrowserState {
  /** Root category the user started from (without "Category:" prefix). */
  root: string | null;
  /** Path of category names from root to the active category. */
  path: string[];
  /** Active category name (last segment of path), or null. */
  current: string | null;
  setRoot: (name: string) => void;
  clearRoot: () => void;
  /** Select a category by its full path from root. */
  selectPath: (path: string[]) => void;
  /** File open in the detail panel, or null. */
  selectedFile: CategoryFileInfo | null;
  selectFile: (file: CategoryFileInfo | null) => void;
  /** Active search query (scoped to the current category), or null. */
  search: string | null;
  setSearch: (query: string | null) => void;
}

const Ctx = createContext<BrowserState | null>(null);

export function useBrowser(): BrowserState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useBrowser must be used within BrowserProvider");
  return ctx;
}

export default function BrowserProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [root, setRootState] = useState<string | null>(null);
  const [path, setPath] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<CategoryFileInfo | null>(
    null,
  );
  const [search, setSearchState] = useState<string | null>(null);

  // Restore the last root from localStorage on first mount. This must run in
  // an effect (not a lazy initializer) so server and client render the same
  // initial HTML and avoid a hydration mismatch; the one-time setState here is
  // intentional.
  useEffect(() => {
    const saved = localStorage.getItem(ROOT_STORAGE_KEY);
    if (saved) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client hydration read
      setRootState(saved);
      setPath([saved]);
    }
  }, []);

  const setRoot = useCallback((name: string) => {
    const clean = name.trim().replace(/^Category:/i, "");
    if (!clean) return;
    localStorage.setItem(ROOT_STORAGE_KEY, clean);
    setRootState(clean);
    setPath([clean]);
    setSelectedFile(null);
    setSearchState(null);
  }, []);

  const clearRoot = useCallback(() => {
    localStorage.removeItem(ROOT_STORAGE_KEY);
    setRootState(null);
    setPath([]);
    setSelectedFile(null);
    setSearchState(null);
  }, []);

  const selectPath = useCallback((next: string[]) => {
    setPath(next);
    setSelectedFile(null);
    setSearchState(null);
  }, []);

  const selectFile = useCallback((file: CategoryFileInfo | null) => {
    setSelectedFile(file);
  }, []);

  const setSearch = useCallback((query: string | null) => {
    const clean = query?.trim();
    setSearchState(clean ? clean : null);
    setSelectedFile(null);
  }, []);

  const value = useMemo<BrowserState>(
    () => ({
      root,
      path,
      current: path.length > 0 ? path[path.length - 1] : null,
      setRoot,
      clearRoot,
      selectPath,
      selectedFile,
      selectFile,
      search,
      setSearch,
    }),
    [
      root,
      path,
      setRoot,
      clearRoot,
      selectPath,
      selectedFile,
      selectFile,
      search,
      setSearch,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
