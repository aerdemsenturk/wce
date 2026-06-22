import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import ResizablePanel from "@/components/layout/ResizablePanel";
import BrowserProvider from "@/components/browser/BrowserProvider";
import Breadcrumb from "@/components/category/Breadcrumb";
import WikidataBadge from "@/components/category/WikidataBadge";
import FileGrid from "@/components/files/FileGrid";
import DetailPanel from "@/components/detail/DetailPanel";

export default function Home() {
  return (
    <BrowserProvider>
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

          <main className="min-w-0 flex-1 overflow-y-auto">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-base bg-panel px-6 py-3">
              <Breadcrumb />
              <WikidataBadge />
            </div>
            <div className="p-6">
              <FileGrid />
            </div>
          </main>

          <DetailPanel />
        </div>
      </div>
    </BrowserProvider>
  );
}
