/**
 * Lightweight CSS-only tooltip for icon-only buttons whose purpose isn't
 * obvious from their icon alone. Shows above the wrapped element on
 * hover/focus; purely visual, doesn't replace `aria-label` for a11y.
 */
export default function Tooltip({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute -top-1.5 left-1/2 z-50 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-sm transition-opacity delay-200 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {label}
        <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
      </span>
    </span>
  );
}
