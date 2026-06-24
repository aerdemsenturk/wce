"use client";

import { useBrowser } from "@/components/browser/BrowserProvider";
import CategoryHeader from "@/components/category/CategoryHeader";
import FileGrid from "@/components/files/FileGrid";
import SelectionToolbar from "@/components/files/SelectionToolbar";
import ActivityViewHeader from "@/components/activity/ActivityViewHeader";
import ActivityFeed from "@/components/activity/ActivityFeed";
import UploadsView from "@/components/activity/UploadsView";

/** Switches the main content area between the normal category grid and the
 * connected account's activity-history / uploads view (opened from the
 * header's user menu). The cover image/title/description (CategoryHeader)
 * below the breadcrumb scroll away normally; only its own action-buttons row
 * stays sticky (see its `sticky top-11` row). */
export default function BrowserMainContent() {
  const { contentView, setContentView } = useBrowser();

  if (contentView === "category") {
    return (
      <>
        <CategoryHeader />
        <div className="sticky top-[5.5rem] z-20">
          <SelectionToolbar />
        </div>
        <div className="p-6">
          <FileGrid />
        </div>
      </>
    );
  }

  return (
    <div className="p-6">
      <ActivityViewHeader view={contentView} onBack={() => setContentView("category")} />
      {contentView === "activity" ? <ActivityFeed /> : <UploadsView />}
    </div>
  );
}
