"use client";

import { useBrowser } from "@/components/browser/BrowserProvider";

export default function Breadcrumb() {
  const { path, selectPath } = useBrowser();
  if (path.length === 0) return null;

  return (
    <nav aria-label="breadcrumb" className="flex flex-wrap items-center gap-1 text-sm">
      {path.map((name, i) => {
        const isLast = i === path.length - 1;
        return (
          <span key={`${name}-${i}`} className="flex items-center gap-1">
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
  );
}
