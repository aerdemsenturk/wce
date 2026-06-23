"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useBrowser } from "@/components/browser/BrowserProvider";

export default function SearchBox() {
  const t = useTranslations("header");
  const { search, setSearch } = useBrowser();
  const [value, setValue] = useState("");

  // Keep the input in sync when the search is cleared elsewhere (e.g. by
  // navigating to a category).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync input when search is cleared elsewhere
    if (search === null) setValue("");
  }, [search]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setSearch(value);
      }}
      className="relative w-full"
    >
      <input
        type="search"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          if (e.target.value === "") setSearch(null);
        }}
        placeholder={t("searchPlaceholder")}
        className="w-full rounded-md border border-border-base bg-background py-1 pl-2.5 pr-7 text-xs outline-none focus:border-slate-400"
      />
      <button
        type="submit"
        aria-label={t("searchPlaceholder")}
        className="absolute right-0.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-slate-400 hover:text-slate-700"
      >
        <SearchIcon />
      </button>
    </form>
  );
}

function SearchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10.5 10.5L14 14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
