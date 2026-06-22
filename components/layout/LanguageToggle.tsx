"use client";

import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLocale } from "@/i18n/locale";
import { locales, type Locale } from "@/i18n/config";

export default function LanguageToggle() {
  const active = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function change(next: Locale) {
    if (next === active || pending) return;
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  }

  return (
    <div
      className="inline-flex items-center rounded-md border border-border-base bg-panel p-0.5 text-xs font-medium"
      role="group"
      aria-label="Language"
    >
      {locales.map((loc) => (
        <button
          key={loc}
          type="button"
          onClick={() => change(loc)}
          aria-pressed={active === loc}
          className={`rounded px-2 py-1 uppercase transition-colors ${
            active === loc
              ? "bg-slate-900 text-white"
              : "text-slate-500 hover:text-slate-900"
          }`}
        >
          {loc}
        </button>
      ))}
    </div>
  );
}
