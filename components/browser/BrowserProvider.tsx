"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const ROOT_STORAGE_KEY = "wce:root-category";

import type { CategoryFileInfo } from "@/lib/types";

export interface Toast {
  message: string;
  tone: "error" | "success";
}

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
  /** Update the active category's name in place after a rename (keeps the
   * rest of the path, and updates the saved root if it was the root). */
  renameCurrent: (newName: string) => void;
  /** File open in the detail panel, or null. */
  selectedFile: CategoryFileInfo | null;
  selectFile: (file: CategoryFileInfo | null) => void;
  /** Active search query (scoped to the current category), or null. */
  search: string | null;
  setSearch: (query: string | null) => void;
  /** File titles checked for the "merge into new category" action. */
  selected: Set<string>;
  toggleSelected: (title: string) => void;
  clearSelected: () => void;
  /** Bumped after a successful drag-drop move / category creation so views
   * relying on cached category data know to refetch. */
  version: number;
  bumpVersion: () => void;
  toast: Toast | null;
  showToast: (toast: Toast) => void;
  /** Whether the "merge selection into new category" modal is open. */
  mergeModalOpen: boolean;
  setMergeModalOpen: (open: boolean) => void;
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [version, setVersion] = useState(0);
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    setSelected(new Set());
  }, []);

  const clearRoot = useCallback(() => {
    localStorage.removeItem(ROOT_STORAGE_KEY);
    setRootState(null);
    setPath([]);
    setSelectedFile(null);
    setSearchState(null);
    setSelected(new Set());
  }, []);

  const selectPath = useCallback((next: string[]) => {
    setPath(next);
    setSelectedFile(null);
    setSearchState(null);
    setSelected(new Set());
  }, []);

  const renameCurrent = useCallback((newName: string) => {
    setPath((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      next[next.length - 1] = newName;
      if (next.length === 1) {
        localStorage.setItem(ROOT_STORAGE_KEY, newName);
        setRootState(newName);
      }
      return next;
    });
  }, []);

  const selectFile = useCallback((file: CategoryFileInfo | null) => {
    setSelectedFile(file);
  }, []);

  const setSearch = useCallback((query: string | null) => {
    const clean = query?.trim();
    setSearchState(clean ? clean : null);
    setSelectedFile(null);
  }, []);

  const toggleSelected = useCallback((title: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }, []);

  const clearSelected = useCallback(() => setSelected(new Set()), []);

  const bumpVersion = useCallback(() => setVersion((v) => v + 1), []);

  const showToast = useCallback((next: Toast) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(next);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const value = useMemo<BrowserState>(
    () => ({
      root,
      path,
      current: path.length > 0 ? path[path.length - 1] : null,
      setRoot,
      clearRoot,
      selectPath,
      renameCurrent,
      selectedFile,
      selectFile,
      search,
      setSearch,
      selected,
      toggleSelected,
      clearSelected,
      version,
      bumpVersion,
      toast,
      showToast,
      mergeModalOpen,
      setMergeModalOpen,
    }),
    [
      root,
      path,
      setRoot,
      clearRoot,
      selectPath,
      renameCurrent,
      selectedFile,
      selectFile,
      search,
      setSearch,
      selected,
      toggleSelected,
      clearSelected,
      version,
      bumpVersion,
      toast,
      showToast,
      mergeModalOpen,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
