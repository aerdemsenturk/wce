import { useTranslations } from "next-intl";
import LanguageToggle from "./LanguageToggle";
import SearchBox from "./SearchBox";

export default function Header() {
  const t = useTranslations("header");
  const tApp = useTranslations("app");

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border-base bg-panel px-4">
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-md bg-slate-900 text-sm font-bold text-white">
          {tApp("name")}
        </span>
        <span className="hidden text-sm font-semibold text-slate-700 sm:inline">
          {tApp("fullName")}
        </span>
      </div>

      <div className="mx-auto w-full max-w-md">
        <SearchBox />
      </div>

      <div className="flex items-center gap-3">
        <span
          title={t("v2Tooltip")}
          className="hidden rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 md:inline"
        >
          {t("v2Badge")}
        </span>
        <LanguageToggle />
      </div>
    </header>
  );
}
