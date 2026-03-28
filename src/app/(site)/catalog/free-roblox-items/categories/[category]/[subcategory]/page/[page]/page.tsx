import { permanentRedirect } from "next/navigation";
import { buildFreeItemCategoryPath } from "../../../../../page-data";

type PageProps = {
  params: Promise<{ category: string; subcategory: string; page: string }>;
};

export default async function RobloxFreeItemsLegacySubcategoryPaginatedPage({ params }: PageProps) {
  const { category, subcategory, page } = await params;
  const pageNumber = Number.parseInt(page, 10);
  const safePageNumber = Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : 1;
  permanentRedirect(`${buildFreeItemCategoryPath(category, subcategory)}/page/${safePageNumber}`);
}
