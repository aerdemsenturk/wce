import Header from "@/components/layout/Header";
import SidebarSlot from "@/components/layout/SidebarSlot";
import BrowserProvider from "@/components/browser/BrowserProvider";
import Breadcrumb from "@/components/category/Breadcrumb";
import CategoryHeader from "@/components/category/CategoryHeader";
import FileGrid from "@/components/files/FileGrid";
import SelectionToolbar from "@/components/files/SelectionToolbar";
import DetailPanel from "@/components/detail/DetailPanel";
import UploadDropZone from "@/components/upload/UploadDropZone";
import Toast from "@/components/ui/Toast";

/**
 * The whole browser shell. Rendered by both the `/` route (no initial
 * category — restores the last root from localStorage) and the
 * `/wiki/Category:Name` route, which deep-links straight into a category.
 */
export default function BrowserApp({
  initialCategory = null,
}: {
  initialCategory?: string | null;
}) {
  return (
    <BrowserProvider initialCategory={initialCategory}>
      <div className="flex h-dvh flex-col">
        <Header />
        <div className="flex min-h-0 flex-1">
          <SidebarSlot />

          <UploadDropZone>
            <main className="min-w-0 flex-1 overflow-y-auto">
              <div className="sticky top-0 z-30 flex h-11 items-center gap-3 border-b border-border-base bg-panel px-6">
                <Breadcrumb />
              </div>
              {/* The cover image/title/description below scroll away normally;
                  only CategoryHeader's own action-buttons row stays sticky
                  (see its `sticky top-11` row), pinned right under the
                  breadcrumb bar above. */}
              <CategoryHeader />
              <div className="sticky top-[5.5rem] z-20">
                <SelectionToolbar />
              </div>
              <div className="p-6">
                <FileGrid />
              </div>
            </main>
          </UploadDropZone>

          <DetailPanel />
        </div>
      </div>
      <Toast />
    </BrowserProvider>
  );
}
