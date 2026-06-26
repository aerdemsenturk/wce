"use client";

import { useTranslations } from "next-intl";
import { useBrowser } from "@/components/browser/BrowserProvider";
import CategoryNode from "./CategoryNode";

export default function CategoryTree() {
  const t = useTranslations("sidebar");
  const { root, path } = useBrowser();
  const treeTop = path[0] ?? root;

  if (!root) {
    return <p className="text-sm text-slate-400">{t("empty")}</p>;
  }

  return (
    <ul>
      <CategoryNode
        key={treeTop}
        name={treeTop}
        path={[treeTop]}
        subcats={null}
        files={null}
        level={0}
      />
    </ul>
  );
}
