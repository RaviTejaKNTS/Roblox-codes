import { permanentRedirect } from "next/navigation";
import { buildFreeItemCategoryPath } from "../../page-data";

type PageProps = {
  params: Promise<{ category: string }>;
};

export default async function RobloxFreeItemsLegacyCategoryPage({ params }: PageProps) {
  const { category } = await params;
  permanentRedirect(buildFreeItemCategoryPath(category));
}
