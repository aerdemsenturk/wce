"use client";

import Image from "next/image";
import type { CategoryFileInfo } from "@/lib/types";
import { formatBytes } from "@/lib/format";
import { useBrowser } from "@/components/browser/BrowserProvider";
import StatusDots from "@/components/ui/StatusDots";

export default function FileCard({ file }: { file: CategoryFileInfo }) {
  const { selectedFile, selectFile } = useBrowser();
  const active = selectedFile?.pageid === file.pageid;

  return (
    <button
      type="button"
      onClick={() => selectFile(file)}
      className={`group flex flex-col overflow-hidden rounded-lg border bg-panel text-left transition-shadow hover:shadow-md ${
        active ? "border-slate-900 ring-1 ring-slate-900" : "border-border-base"
      }`}
    >
      <div className="relative aspect-square w-full bg-slate-100">
        {file.thumbUrl ? (
          <Image
            src={file.thumbUrl}
            alt={file.name}
            fill
            sizes="(max-width: 768px) 50vw, 25vw"
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="grid h-full place-items-center text-slate-300">
            <FileIcon />
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-2.5">
        <p
          className="line-clamp-2 text-xs font-medium text-slate-700"
          title={file.name}
        >
          {file.name}
        </p>
        <div className="mt-auto flex items-center justify-between gap-2 text-[11px] text-slate-400">
          <span className="tabular-nums">{formatBytes(file.size)}</span>
          {file.uploadYear != null && (
            <span className="tabular-nums">{file.uploadYear}</span>
          )}
        </div>
        <StatusDots status={file.status} />
      </div>
    </button>
  );
}

function FileIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M14 3v4a1 1 0 0 0 1 1h4M5 21V5a2 2 0 0 1 2-2h7l5 5v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
