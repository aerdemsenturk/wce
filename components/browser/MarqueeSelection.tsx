"use client";

import { useEffect, useRef, useState } from "react";
import { useBrowser } from "@/components/browser/BrowserProvider";

/**
 * Wraps the whole scrollable main content area (breadcrumb, category header,
 * grid) so a press-and-drag started anywhere on its empty background — not
 * just inside the grid's own narrow card gaps — draws a selection rectangle
 * over file cards. Interactive elements (buttons, links, inputs, the cards
 * themselves) opt out via tag/role, plus an explicit `data-no-marquee` for
 * non-interactive areas like the search banner that still shouldn't start one.
 */
export default function MarqueeSelection({
  children,
}: {
  children: React.ReactNode;
}) {
  const { selected, setSelectedTitles } = useBrowser();
  const containerRef = useRef<HTMLDivElement>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const baseSelectedRef = useRef<Set<string>>(new Set());
  const [rect, setRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const [active, setActive] = useState(false);

  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (
      target.closest(
        'button, a, input, select, textarea, [role="button"], [data-no-marquee], [data-file-title]',
      )
    ) {
      return;
    }
    origin.current = { x: e.clientX, y: e.clientY };
    baseSelectedRef.current = e.shiftKey ? new Set(selected) : new Set();
    setRect({ left: 0, top: 0, width: 0, height: 0 });
    setActive(true);
  };

  useEffect(() => {
    if (!active) return;

    const onMove = (e: MouseEvent) => {
      const container = containerRef.current;
      const o = origin.current;
      if (!container || !o) return;
      const containerRect = container.getBoundingClientRect();
      const x1 = Math.min(o.x, e.clientX);
      const y1 = Math.min(o.y, e.clientY);
      const x2 = Math.max(o.x, e.clientX);
      const y2 = Math.max(o.y, e.clientY);
      setRect({
        left: x1 - containerRect.left,
        top: y1 - containerRect.top,
        width: x2 - x1,
        height: y2 - y1,
      });

      const next = new Set(baseSelectedRef.current);
      container.querySelectorAll<HTMLElement>("[data-file-title]").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.left < x2 && r.right > x1 && r.top < y2 && r.bottom > y1) {
          next.add(el.dataset.fileTitle!);
        }
      });
      setSelectedTitles(next);
    };

    const onUp = () => {
      setActive(false);
      setRect(null);
      origin.current = null;
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [active, setSelectedTitles]);

  return (
    <div
      ref={containerRef}
      onMouseDown={onMouseDown}
      className={`relative min-h-full ${active ? "select-none" : ""}`}
    >
      {children}
      {rect && (
        <div
          className="pointer-events-none absolute z-20 border border-sky-500 bg-sky-500/10"
          style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
        />
      )}
    </div>
  );
}
