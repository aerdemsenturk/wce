import type { ReactNode } from "react";

/** Label + control + optional helper note, for the small forms inside
 * Modal-based dialogs. */
export default function FormField({
  label,
  note,
  children,
}: {
  label: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-slate-500">{label}</label>
      {children}
      {note && <p className="text-[11px] text-slate-400">{note}</p>}
    </div>
  );
}

export const formFieldInputClassName =
  "w-full rounded-md border border-border-base bg-background px-3 py-1.5 text-sm outline-none focus:border-slate-400";
