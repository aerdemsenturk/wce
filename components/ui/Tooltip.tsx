"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Tooltip for icon-only buttons whose purpose isn't obvious from their icon
 * alone. Portals the bubble to `document.body` and positions it with
 * `getBoundingClientRect`, rather than the CSS-absolute approach this used
 * to take: an ancestor like `<main>` sets `overflow-y-auto` (needed so its
 * `sticky` children work), and per the CSS overflow spec a `visible`
 * `overflow-x` on the same element computes to `auto` too — so an
 * absolutely-positioned bubble popping out past that container's left edge
 * (e.g. over the sidebar) was silently clipped. Fixed positioning at the
 * body level escapes that entirely.
 */
export default function Tooltip({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const anchorRef = useRef<HTMLSpanElement>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  function reposition() {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({ top: rect.top, left: rect.left + rect.width / 2 });
  }

  function show() {
    clearTimeout(showTimer.current);
    showTimer.current = setTimeout(() => {
      reposition();
      setOpen(true);
    }, 200);
  }

  function hide() {
    clearTimeout(showTimer.current);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  useEffect(() => () => clearTimeout(showTimer.current), []);

  return (
    <span
      ref={anchorRef}
      className="inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {open &&
        createPortal(
          <span
            role="tooltip"
            className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white shadow-sm"
            style={{ top: pos.top - 6, left: pos.left }}
          >
            {label}
            <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
          </span>,
          document.body,
        )}
    </span>
  );
}
