"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useBrowser } from "../browser/BrowserProvider";
import UploadModal from "./UploadModal";

const MAX_UPLOAD_FILES = 25;

/** True when the drag carries OS files (an external upload), not one of our
 * internal card/category drags (which use a custom MIME, see lib/dnd.ts). */
function hasFiles(e: React.DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes("Files");
}

/**
 * Wraps the main content area and turns it into a drop target for files
 * dragged in from the desktop. Dropping one or more images opens the upload
 * modal pre-loaded with them. Internal drags (moving cards between categories)
 * pass straight through, since they don't carry "Files".
 */
export default function UploadDropZone({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = useTranslations("upload");
  const { showToast } = useBrowser();
  const [over, setOver] = useState(false);
  const [files, setFiles] = useState<File[] | null>(null);
  // dragenter/leave fire for every child crossing; count depth so the overlay
  // only clears when the pointer truly leaves the area.
  const depth = useRef(0);

  return (
    <div
      className="relative flex min-w-0 flex-1"
      onDragEnter={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth.current += 1;
        setOver(true);
      }}
      onDragOver={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(e) => {
        if (!hasFiles(e)) return;
        depth.current -= 1;
        if (depth.current <= 0) {
          depth.current = 0;
          setOver(false);
        }
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth.current = 0;
        setOver(false);
        const dropped = Array.from(e.dataTransfer.files).filter((f) =>
          f.type.startsWith("image/"),
        );
        if (dropped.length > MAX_UPLOAD_FILES) {
          showToast({
            message: t("tooManyFilesError", { max: MAX_UPLOAD_FILES }),
            tone: "error",
          });
          return;
        }
        if (dropped.length > 0) setFiles(dropped);
      }}
    >
      {children}

      {over && (
        <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center rounded-lg border-2 border-dashed border-slate-900 bg-white/70 backdrop-blur-[1px]">
          <p className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg">
            {t("dropHint")}
          </p>
        </div>
      )}

      {files && (
        <UploadModal files={files} onClose={() => setFiles(null)} />
      )}
    </div>
  );
}
