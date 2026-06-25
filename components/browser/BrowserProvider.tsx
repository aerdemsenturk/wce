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
const SIDEBAR_COLLAPSED_KEY = "wce:sidebar-collapsed";

import type { CategoryFileInfo } from "@/lib/types";
import type { PendingChange, ConfirmedCreation } from "@/lib/pendingChanges";
import type { FilterCounts, FilterKey, SortKey } from "@/components/files/filters";
import { categoryToAppPath, categoryFromPath, withCategoryPrefix } from "@/lib/category";
import { getRecentCategories, pushRecentCategory } from "@/lib/recentCategories";
import {
  getFavoriteCategories,
  toggleFavoriteCategory,
} from "@/lib/favoriteCategories";
import {
  updateFileDescription,
  moveCategoryMembership,
  removeCategoryMembership,
  addCategoryMembership,
  addDepict,
  removeDepict,
  updateFileLocation,
  removeFileLocation,
  nominateFileDeletion,
  createCategoryFromSelection,
  renameCategory,
  invalidateCategory,
  addWikidataStatement,
  removeWikidataStatement,
} from "@/lib/api";

export interface PublishResult {
  changeId: string;
  label: string;
  status: "success" | "skipped";
  message?: string;
}

interface BrowserState {
  /** Root category the user started from (without "Category:" prefix). */
  root: string | null;
  /** Path of category names from root to the active category. */
  path: string[];
  /** Active category name (last segment of path), or null. */
  current: string | null;
  /** Recently visited category names, most recent first (for the sidebar). */
  recentCategories: string[];
  /** Favorited (pinned) category names (for the sidebar). */
  favoriteCategories: string[];
  /** Add/remove a category from favorites. */
  toggleFavorite: (name: string) => void;
  /** Whether the left sidebar (category tree) is collapsed. */
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setRoot: (name: string) => void;
  /** Select a category by its full path from root. */
  selectPath: (path: string[]) => void;
  /** Promote one of the entered category's parents to the top of the tree (or
   * pass null to drop it), keeping the entered category active beneath it.
   * Drives the sidebar's "parent as level-1 root" behaviour. */
  setTreeParent: (parent: string | null) => void;
  /** Update the active category's name in place after a rename (keeps the
   * rest of the path, and updates the saved root if it was the root). */
  renameCurrent: (newName: string) => void;
  /** File open in the detail modal, or null. */
  selectedFile: CategoryFileInfo | null;
  selectFile: (file: CategoryFileInfo | null) => void;
  /** The files currently shown in the grid (after filter/sort), in display
   * order — lets the detail modal step to the previous/next file. */
  visibleFiles: CategoryFileInfo[];
  setVisibleFiles: (files: CategoryFileInfo[]) => void;
  /** Active search query (scoped to the current category), or null. */
  search: string | null;
  setSearch: (query: string | null) => void;
  /** Grid filter/sort — lifted out of FileGrid so CategoryHeader's sticky
   * actions row can host the filter/sort controls alongside the search box. */
  filter: FilterKey;
  setFilter: (filter: FilterKey) => void;
  sort: SortKey;
  setSort: (sort: SortKey) => void;
  /** Missing-field counts for the current grid, for the filter control's
   * option labels — computed by FileGrid (it owns the file list). */
  counts: FilterCounts;
  setCounts: (counts: FilterCounts) => void;
  /** File titles checked for the "merge into new category" action. */
  selected: Set<string>;
  toggleSelected: (title: string) => void;
  /** Replace the full set of checked titles at once (box/marquee selection). */
  setSelectedTitles: (titles: Set<string>) => void;
  clearSelected: () => void;
  /** Bumped after a successful drag-drop move / category creation so views
   * relying on cached category data know to refetch. */
  version: number;
  bumpVersion: () => void;
  /** Whether the "merge selection into new category" modal is open. */
  mergeModalOpen: boolean;
  setMergeModalOpen: (open: boolean) => void;
  /** Whether the "bulk edit selection" modal is open. */
  bulkEditModalOpen: boolean;
  setBulkEditModalOpen: (open: boolean) => void;
  /** Changes queued locally but not yet written to Commons. */
  pendingChanges: PendingChange[];
  addChange: (change: PendingChange) => void;
  /** Remove a single queued change by id, regardless of its position in the
   * queue (unlike `undo`, which only pops the most recent one). */
  removeChange: (id: string) => void;
  undo: () => void;
  redo: () => void;
  redoCount: number;
  publishing: boolean;
  /** Writes every pending change to Commons in order. Changes that succeed are
   * dropped from the queue; a change that hits a real edit conflict (or other
   * failure) is kept in the queue so the user can fix the issue and re-publish
   * just the failed ones. */
  publishAll: () => Promise<void>;
  publishResults: PublishResult[] | null;
  clearPublishResults: () => void;
  /** Wikidata sitelinks just published but not yet mirrored into Commons'
   * `pageprops` (Wikibase Client job-queue lag), keyed by "Category:Name" →
   * QID (or null when the link was cleared). Lets the badge / edit modal keep
   * showing the freshly-set link instead of flashing back to "no link" while
   * Commons catches up. */
  confirmedWikidata: Map<string, string | null>;
  /** Forget a confirmed-Wikidata override once a fresh read shows Commons has
   * caught up. */
  clearConfirmedWikidata: (category: string) => void;
  /** Categories created+published this session, kept in their parent's
   * subcategory listing until Commons' categorymembers index catches up. */
  confirmedCreations: ConfirmedCreation[];
  /** What the main content area shows: the normal category grid, or the
   * connected account's activity history / uploads (from the user menu).
   * Resets to "category" on any navigation (pick a category, search, back/
   * forward) so it's a transient overlay, not a navigable route. */
  contentView: ContentView;
  setContentView: (view: ContentView) => void;
}

export type ContentView = "category" | "activity" | "uploads";

const Ctx = createContext<BrowserState | null>(null);

export function useBrowser(): BrowserState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useBrowser must be used within BrowserProvider");
  return ctx;
}

export default function BrowserProvider({
  children,
  initialCategory = null,
}: {
  children: React.ReactNode;
  /** Category to open on load, from the `/wiki/Category:Name` route. When set
   * it takes precedence over the last root saved in localStorage. */
  initialCategory?: string | null;
}) {
  // Derived from a server-provided route param, so the initial server and
  // client render agree (no hydration mismatch) and the category is shown
  // immediately on a deep link instead of after a client effect.
  const initialClean =
    (initialCategory?.trim().replace(/^Category:/i, "") || null) ?? null;

  const [root, setRootState] = useState<string | null>(initialClean);
  const [path, setPath] = useState<string[]>(
    initialClean ? [initialClean] : [],
  );
  const [selectedFile, setSelectedFile] = useState<CategoryFileInfo | null>(
    null,
  );
  const [visibleFiles, setVisibleFiles] = useState<CategoryFileInfo[]>([]);
  const [search, setSearchState] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey>("name");
  const [counts, setCounts] = useState<FilterCounts>({
    all: 0,
    description: 0,
    date: 0,
    location: 0,
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [version, setVersion] = useState(0);
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [bulkEditModalOpen, setBulkEditModalOpen] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);
  const [redoStack, setRedoStack] = useState<PendingChange[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [publishResults, setPublishResults] = useState<PublishResult[] | null>(null);
  const [confirmedWikidata, setConfirmedWikidata] = useState<Map<string, string | null>>(
    new Map(),
  );
  const [confirmedCreations, setConfirmedCreations] = useState<ConfirmedCreation[]>([]);
  const [recentCategories, setRecentCategories] = useState<string[]>([]);
  const [favoriteCategories, setFavoriteCategories] = useState<string[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [contentView, setContentView] = useState<ContentView>("category");

  // On first mount: load the recently-visited list, then restore the last
  // visited gallery — the most recent entry (or, on a deep link, the linked
  // category). Runs in an effect (not a lazy initializer) so server and client
  // render the same initial HTML — the one-time setState here is intentional.
  useEffect(() => {
    const stored = getRecentCategories();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client hydration read
    setRecentCategories(stored);
    setFavoriteCategories(getFavoriteCategories());
    setSidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");

    if (initialClean) {
      localStorage.setItem(ROOT_STORAGE_KEY, initialClean);
      return;
    }
    const last = stored[0] ?? localStorage.getItem(ROOT_STORAGE_KEY);
    if (last) {
      setRootState(last);
      setPath([last]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only; initialClean is stable per page load
  }, []);

  const current = path.length > 0 ? path[path.length - 1] : null;

  // Record every visited category (most recent first) so it survives reloads
  // and feeds the sidebar's "recently visited" list.
  useEffect(() => {
    if (!current) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- record visit when the active category changes
    setRecentCategories(pushRecentCategory(current));
  }, [current]);

  // Keep the active category and the URL in sync, Commons-parallel
  // (/wiki/Category:Name). State → URL uses the History API (shallow routing,
  // no reload, integrates with the Next router). `suppressUrlSync` skips the
  // echo when the change itself came from a back/forward popstate.
  const suppressUrlSync = useRef(false);
  const urlSyncReady = useRef(false);

  useEffect(() => {
    if (suppressUrlSync.current) {
      suppressUrlSync.current = false;
      urlSyncReady.current = true;
      return;
    }
    const target = current ? categoryToAppPath(current) : "/";
    if (window.location.pathname === target) {
      urlSyncReady.current = true;
      return;
    }
    if (!urlSyncReady.current) {
      urlSyncReady.current = true;
      window.history.replaceState(null, "", target);
    } else {
      window.history.pushState(null, "", target);
    }
  }, [current]);

  // URL → state for browser back/forward: re-open whatever category the URL
  // now points at (or the empty "new search" state at "/").
  useEffect(() => {
    function onPopState() {
      suppressUrlSync.current = true;
      const name = categoryFromPath(window.location.pathname);
      if (name) {
        localStorage.setItem(ROOT_STORAGE_KEY, name);
        setRootState(name);
        setPath([name]);
      } else {
        setRootState(null);
        setPath([]);
      }
      setSelectedFile(null);
      setSearchState(null);
      setSelected(new Set());
      setContentView("category");
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const toggleFavorite = useCallback((name: string) => {
    setFavoriteCategories(toggleFavoriteCategory(name));
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
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
    setContentView("category");
  }, []);

  const selectPath = useCallback((next: string[]) => {
    setPath(next);
    setSelectedFile(null);
    setSearchState(null);
    setSelected(new Set());
    setContentView("category");
  }, []);

  // Re-root the tree under `parent` while keeping the entered category (and any
  // descent below it) active — `root` stays the entered category, only the
  // path's prefix above it changes, so the gallery (keyed on `current`) doesn't
  // reload.
  const setTreeParent = useCallback(
    (parent: string | null) => {
      if (!root) return;
      setPath((prev) => {
        const anchorIndex = prev.indexOf(root);
        const fromAnchor = anchorIndex >= 0 ? prev.slice(anchorIndex) : [root];
        return parent ? [parent, ...fromAnchor] : fromAnchor;
      });
    },
    [root],
  );

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

  const setVisibleFilesCb = useCallback((files: CategoryFileInfo[]) => {
    setVisibleFiles(files);
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

  const setSelectedTitles = useCallback((titles: Set<string>) => setSelected(titles), []);

  const clearSelected = useCallback(() => setSelected(new Set()), []);

  const bumpVersion = useCallback(() => setVersion((v) => v + 1), []);

  const addChange = useCallback(
    (change: PendingChange) => {
      setPendingChanges((prev) => [...prev, change]);
      setRedoStack([]);
      bumpVersion();
    },
    [bumpVersion],
  );

  const removeChange = useCallback(
    (id: string) => {
      setPendingChanges((prev) => prev.filter((c) => c.id !== id));
      bumpVersion();
    },
    [bumpVersion],
  );

  const undo = useCallback(() => {
    setPendingChanges((prev) => {
      if (prev.length === 0) return prev;
      setRedoStack((redo) => [...redo, prev[prev.length - 1]]);
      return prev.slice(0, -1);
    });
    bumpVersion();
  }, [bumpVersion]);

  const redo = useCallback(() => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const next = prev[prev.length - 1];
      setPendingChanges((changes) => [...changes, next]);
      return prev.slice(0, -1);
    });
    bumpVersion();
  }, [bumpVersion]);

  const clearConfirmedWikidata = useCallback((category: string) => {
    const key = withCategoryPrefix(category);
    setConfirmedWikidata((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const publishAll = useCallback(async () => {
    setPublishing(true);
    const results: PublishResult[] = [];
    // Wikidata links we set this run, to keep showing until Commons' pageprops
    // mirror catches up with the sitelink (job-queue lag).
    const recordWikidata = (name: string, qid: string | null) =>
      setConfirmedWikidata((prev) => new Map(prev).set(withCategoryPrefix(name), qid));
    for (const change of pendingChanges) {
      try {
        if (change.type === "description") {
          await updateFileDescription(change.fileTitle, change.lang, change.newValue);
        } else if (change.type === "move") {
          await moveCategoryMembership(change.pageTitle, change.fromCategory, change.toCategory);
        } else if (change.type === "removeCategory") {
          await removeCategoryMembership(change.fileTitle, change.category);
        } else if (change.type === "addCategory") {
          await addCategoryMembership(change.fileTitle, change.category);
        } else if (change.type === "addDepict") {
          await addDepict(change.fileTitle, change.pageid, change.qid);
        } else if (change.type === "removeDepict") {
          await removeDepict(change.fileTitle, change.statementId);
        } else if (change.type === "location") {
          await updateFileLocation(change.fileTitle, change.lat, change.lon);
        } else if (change.type === "removeLocation") {
          await removeFileLocation(change.fileTitle);
        } else if (change.type === "nominateDeletion") {
          await nominateFileDeletion(change.fileTitle, change.reason);
        } else if (change.type === "addWikidataStatement") {
          await addWikidataStatement(change.qid, change.property, change.valueQid);
        } else if (change.type === "removeWikidataStatement") {
          await removeWikidataStatement(change.statementId);
        } else if (change.type === "rename") {
          const result = await renameCategory(change.oldName, change.newName, {
            wikidataQid: change.wikidataQid,
            parentCategory: change.parentCategory,
          });
          if (result.failed.length > 0 || result.wikidataError) {
            results.push({
              changeId: change.id,
              label: change.label,
              status: "skipped",
              message: result.wikidataError ?? result.failed.map((f) => f.title).join(", "),
            });
            continue;
          }
          // Sitelink is set on Wikidata now; remember it (or its removal) so
          // the badge doesn't read back the still-lagging Commons pageprops.
          if (change.wikidataQid !== undefined) {
            recordWikidata(change.newName, change.wikidataQid || null);
          }
        } else {
          const result = await createCategoryFromSelection(
            change.name,
            change.parentCategory,
            change.files.map((f) => f.title),
            change.wikidataQid,
          );
          if (result.failed.length > 0 || result.wikidataError) {
            results.push({
              changeId: change.id,
              label: change.label,
              status: "skipped",
              message: result.wikidataError ?? result.failed.map((f) => f.title).join(", "),
            });
            continue;
          }
          if (change.wikidataQid) recordWikidata(change.name, change.wikidataQid);
          // Keep it nested under its parent until Commons indexes the new
          // subcategory (categorymembers lags behind the page creation).
          setConfirmedCreations((prev) => [
            ...prev.filter((c) => c.name !== change.name),
            { name: change.name, parentCategory: change.parentCategory },
          ]);
        }
        results.push({ changeId: change.id, label: change.label, status: "success" });
      } catch (err) {
        results.push({
          changeId: change.id,
          label: change.label,
          status: "skipped",
          message: err instanceof Error ? err.message : undefined,
        });
      }
    }
    // Drop only the changes that published cleanly; keep the failed ones queued
    // so the user can resolve the issue and re-publish just those.
    const failedIds = new Set(
      results.filter((r) => r.status !== "success").map((r) => r.changeId),
    );
    setPendingChanges((prev) => prev.filter((c) => failedIds.has(c.id)));
    setRedoStack([]);
    setPublishResults(results);
    setPublishing(false);
    // Drop the viewed category's cached grid/children so the version bump below
    // refetches it fresh — file-field edits (description, location, ...) change
    // a card's status but aren't reflected by the pending-change overlays, and
    // their API helpers only invalidate the file-detail cache, not the grid.
    if (current) invalidateCategory(current);
    setVersion((v) => v + 1);
  }, [pendingChanges, current]);

  const clearPublishResults = useCallback(() => setPublishResults(null), []);

  const value = useMemo<BrowserState>(
    () => ({
      root,
      path,
      current,
      recentCategories,
      favoriteCategories,
      toggleFavorite,
      sidebarCollapsed,
      toggleSidebar,
      setRoot,
      selectPath,
      setTreeParent,
      renameCurrent,
      selectedFile,
      selectFile,
      visibleFiles,
      setVisibleFiles: setVisibleFilesCb,
      search,
      setSearch,
      filter,
      setFilter,
      sort,
      setSort,
      counts,
      setCounts,
      selected,
      toggleSelected,
      setSelectedTitles,
      clearSelected,
      version,
      bumpVersion,
      mergeModalOpen,
      setMergeModalOpen,
      bulkEditModalOpen,
      setBulkEditModalOpen,
      pendingChanges,
      addChange,
      removeChange,
      undo,
      redo,
      redoCount: redoStack.length,
      publishing,
      publishAll,
      publishResults,
      clearPublishResults,
      confirmedWikidata,
      clearConfirmedWikidata,
      confirmedCreations,
      contentView,
      setContentView,
    }),
    [
      root,
      path,
      current,
      recentCategories,
      favoriteCategories,
      toggleFavorite,
      sidebarCollapsed,
      toggleSidebar,
      setRoot,
      selectPath,
      setTreeParent,
      renameCurrent,
      selectedFile,
      selectFile,
      visibleFiles,
      setVisibleFilesCb,
      search,
      setSearch,
      filter,
      setFilter,
      sort,
      setSort,
      counts,
      setCounts,
      selected,
      toggleSelected,
      setSelectedTitles,
      clearSelected,
      version,
      bumpVersion,
      mergeModalOpen,
      bulkEditModalOpen,
      pendingChanges,
      addChange,
      removeChange,
      undo,
      redo,
      redoStack,
      publishing,
      publishAll,
      publishResults,
      clearPublishResults,
      confirmedWikidata,
      clearConfirmedWikidata,
      confirmedCreations,
      contentView,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
