"use client";

import { useEffect, useRef, useState } from "react";
import { useBrowser } from "@/components/browser/BrowserProvider";

export default function Breadcrumb() {
  const { path, selectPath } = useBrowser();
  const navRef = useRef<HTMLElement>(null);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startScroll: number; moved: boolean } | null>(null);

  // Keep the current (last) breadcrumb segment in view whenever the path
  // changes — navigating up/down a level should reveal where you landed
  // rather than leaving the trail scrolled to wherever it was before.
  useEffect(() => {
    const nav = navRef.current;
    if (nav) nav.scrollLeft = nav.scrollWidth;
  }, [path]);

  // Click-and-drag horizontal scrolling for the breadcrumb trail (in addition
  // to native touch/trackpad scroll) — a long trail can be dragged with the
  // mouse instead of only being scrollable via wheel/touch.
  function onPointerDown(e: React.PointerEvent<HTMLElement>) {
    const nav = e.currentTarget;
    dragRef.current = { startX: e.clientX, startScroll: nav.scrollLeft, moved: false };
    // Pointer capture is deliberately NOT taken here: capturing on every
    // pointerdown reroutes the click that follows to `nav` instead of the
    // breadcrumb button under the cursor, breaking plain (non-drag) clicks.
    // It's only taken once a real drag is detected, below.
  }
  function onPointerMove(e: React.PointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    if (!drag.moved && Math.abs(dx) > 3) {
      drag.moved = true;
      setDragging(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    if (drag.moved) e.currentTarget.scrollLeft = drag.startScroll - dx;
  }
  function onPointerUp(e: React.PointerEvent<HTMLElement>) {
    const nav = e.currentTarget;
    if (dragRef.current?.moved) {
      nav.releasePointerCapture(e.pointerId);
      // Swallow the click that follows a drag so releasing the mouse over a
      // breadcrumb segment doesn't also navigate to it.
      const suppressClick = (ev: MouseEvent) => ev.stopPropagation();
      nav.addEventListener("click", suppressClick, { capture: true, once: true });
    }
    dragRef.current = null;
    setDragging(false);
  }

  if (path.length === 0) return null;

  return (
    <div className="relative min-w-0 flex-1">
      <nav
        ref={navRef}
        aria-label="breadcrumb"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={
          "no-scrollbar flex items-center gap-1 overflow-x-auto whitespace-nowrap text-sm " +
          (dragging ? "cursor-grabbing select-none" : "cursor-grab")
        }
      >
        {path.map((name, i) => {
          const isLast = i === path.length - 1;
          return (
            <span key={`${name}-${i}`} className="flex shrink-0 items-center gap-1">
              {i > 0 && <span className="text-slate-300">/</span>}
              {isLast ? (
                <span className="font-semibold text-slate-900">{name}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => selectPath(path.slice(0, i + 1))}
                  className="text-slate-500 hover:text-slate-900 hover:underline"
                >
                  {name}
                </button>
              )}
            </span>
          );
        })}
      </nav>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-panel to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-panel to-transparent" />
    </div>
  );
}
