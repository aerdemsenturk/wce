import BrowserApp from "@/components/browser/BrowserApp";
import { categoryFromSlug } from "@/lib/category";

// Commons-parallel deep link: /wiki/Category:Bithynia opens that category.
export default async function WikiCategoryPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  return <BrowserApp initialCategory={categoryFromSlug(slug)} />;
}
