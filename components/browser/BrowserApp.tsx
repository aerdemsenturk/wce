import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import ResizablePanel from "@/components/layout/ResizablePanel";
import BrowserProvider from "@/components/browser/BrowserProvider";
import Breadcrumb from "@/components/category/Breadcrumb";
import WikidataBadge from "@/components/category/WikidataBadge";
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
          <ResizablePanel
            side="left"
            defaultWidth={288}
            minWidth={200}
            maxWidth={480}
            storageKey="wce:left-width"
            className="h-full"
          >
            <Sidebar />
          </ResizablePanel>

          <UploadDropZone>
            <main className="min-w-0 flex-1 overflow-y-auto">
              <div className="sticky top-0 z-20">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-base bg-panel px-6 py-3">
                  <Breadcrumb />
                  <WikidataBadge />
                </div>
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
