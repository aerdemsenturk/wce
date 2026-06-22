"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { useBrowser } from "@/components/browser/BrowserProvider";
import CategoryNode from "./CategoryNode";

export default function CategoryTree() {
  const t = useTranslations("sidebar");
  const { root, setRoot, clearRoot } = useBrowser();
  const [input, setInput] = useState("");

  if (!root) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setRoot(input);
        }}
        className="space-y-2"
      >
        <label className="block text-sm text-slate-600">
          {t("rootPrompt")}
        </label>
        <input
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t("rootPlaceholder")}
          className="w-full rounded-md border border-border-base bg-background px-3 py-1.5 text-sm outline-none focus:border-slate-400"
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="w-full rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        >
          {t("load")}
        </button>
      </form>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={clearRoot}
        className="text-xs text-slate-400 hover:text-slate-700"
      >
        ← {t("rootPrompt")}
      </button>
      <ul>
        <CategoryNode
          name={root}
          path={[root]}
          subcats={null}
          files={null}
          level={0}
        />
      </ul>
    </div>
  );
}
