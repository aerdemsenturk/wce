import { useTranslations } from "next-intl";
import CategoryTree from "@/components/category/CategoryTree";

export default function Sidebar() {
  const t = useTranslations("sidebar");

  return (
    <aside className="flex h-full w-full flex-col border-r border-border-base bg-panel">
      <div className="border-b border-border-base px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t("title")}
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <CategoryTree />
      </div>
    </aside>
  );
}
