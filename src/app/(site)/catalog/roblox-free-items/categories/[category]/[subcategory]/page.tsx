import { permanentRedirect } from "next/navigation";
import { buildFreeItemCategoryPath } from "../../../page-data";

type PageProps = {
  params: Promise<{ category: string; subcategory: string }>;
};

export default async function RobloxFreeItemsLegacySubcategoryPage({ params }: PageProps) {
  const { category, subcategory } = await params;
  permanentRedirect(buildFreeItemCategoryPath(category, subcategory));
}
