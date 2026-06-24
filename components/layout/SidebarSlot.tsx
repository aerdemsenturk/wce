"use client";

import { useTranslations } from "next-intl";
import { useBrowser } from "@/components/browser/BrowserProvider";
import ResizablePanel from "@/components/layout/ResizablePanel";
import Sidebar from "@/components/layout/Sidebar";

/** Switches the left sidebar slot between its full resizable panel and a
 * slim collapsed rail — instant, no transition. */
export default function SidebarSlot() {
  const t = useTranslations("sidebar");
  const { sidebarCollapsed, toggleSidebar } = useBrowser();

  if (sidebarCollapsed) {
    return (
      <div className="flex h-full w-9 shrink-0 flex-col items-center border-r border-border-base bg-panel pt-3">
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={t("expandSidebar")}
          title={t("expandSidebar")}
          className="text-slate-400 hover:text-slate-700"
        >
          <ExpandIcon />
        </button>
      </div>
    );
  }

  return (
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
  );
}

function ExpandIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M4.5 2.5L8.5 6L4.5 9.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
