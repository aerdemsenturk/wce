"use client";

import { useTranslations } from "next-intl";
import type { FileStatus } from "@/lib/types";

type Field = keyof FileStatus;

const FIELDS: Field[] = [
  "description",
  "date",
  "author",
  "license",
  "location",
];

export default function StatusDots({
  status,
  size = "sm",
}: {
  status: FileStatus;
  size?: "sm" | "md";
}) {
  const t = useTranslations("file.status");
  const dot = size === "md" ? "h-2.5 w-2.5" : "h-2 w-2";

  return (
    <div className="flex items-center gap-1">
      {FIELDS.map((field) => {
        const present = status[field];
        // Location is "optional": yellow when missing instead of red.
        const color = present
          ? "bg-emerald-500"
          : field === "location"
            ? "bg-amber-400"
            : "bg-red-400";
        const stateLabel = present ? "✓" : "✗";
        return (
          <span
            key={field}
            className={`inline-block shrink-0 rounded-full ${dot} ${color}`}
            title={`${t(field)} ${stateLabel}`}
            aria-label={`${t(field)} ${stateLabel}`}
          />
        );
      })}
    </div>
  );
}
