"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";

interface ResizablePanelProps {
  /** Which side of the layout the panel sits on (determines drag direction). */
  side: "left" | "right";
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  storageKey: string;
  className?: string;
  children: React.ReactNode;
}

export default function ResizablePanel({
  side,
  defaultWidth,
  minWidth,
  maxWidth,
  storageKey,
  className,
  children,
}: ResizablePanelProps) {
  const [width, setWidth] = useState(defaultWidth);
  const dragging = useRef(false);
  const start = useRef({ x: 0, w: defaultWidth });
  const latest = useRef(defaultWidth);

  const clamp = (w: number) => Math.min(maxWidth, Math.max(minWidth, w));

  // Restore the persisted width on first mount (client-only to avoid an SSR
  // hydration mismatch).
  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const n = Number.parseInt(saved, 10);
      if (!Number.isNaN(n)) {
        const w = Math.min(maxWidth, Math.max(minWidth, n));
        latest.current = w;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client restore
        setWidth(w);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    dragging.current = true;
    start.current = { x: e.clientX, w: width };
    e.currentTarget.setPointerCapture(e.pointerId);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return;
    const delta = e.clientX - start.current.x;
    const next = clamp(
      side === "left" ? start.current.w + delta : start.current.w - delta,
    );
    latest.current = next;
    setWidth(next);
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return;
    dragging.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    localStorage.setItem(storageKey, String(latest.current));
  }

  return (
    <div
      className={`relative shrink-0 ${className ?? ""}`}
      style={{ width }}
    >
      {children}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={() => {
          const w = clamp(defaultWidth);
          latest.current = w;
          setWidth(w);
          localStorage.setItem(storageKey, String(w));
        }}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panel"
        title="Drag to resize · double-click to reset"
        className="group absolute top-0 z-10 flex h-full w-2 cursor-col-resize items-stretch justify-center"
        style={side === "left" ? { right: -4 } : { left: -4 }}
      >
        <span className="h-full w-px bg-transparent transition-colors group-hover:bg-slate-400" />
      </div>
    </div>
  );
}
