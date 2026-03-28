import type { Metadata } from "next";
import "@/styles/article-content.css";
import { notFound } from "next/navigation";
import { getCatalogPageContentByCodesIncludingDrafts } from "@/lib/catalog";
import { CATALOG_DESCRIPTION, SITE_NAME, SITE_URL, buildAlternates } from "@/lib/seo";
import {
  BASE_PATH,
  appendItemCountToSeoTitle,
  buildFreeItemCatalogCodeCandidates,
  buildFreeItemsCatalogContentHtml,
  buildFreeItemCategoryPath,
  loadFreeItemCategories,
  loadFreeItemCategoryBySlug,
  loadFreeItemSubcategories,
  loadFreeItemSubcategoryBySlug,
  loadFreeItemsPageData,
  renderRobloxFreeItemsPage
} from "../../page-data";

export const revalidate = 2592000;

type PageProps = {
  params: Promise<{ category: string; subcategory: string }>;
};

const FREE_ITEMS_CONTENT_CODES = buildFreeItemCatalogCodeCandidates();

export async function generateStaticParams() {
  const categories = await loadFreeItemCategories();
  const paramsList: Array<{ category: string; subcategory: string }> = [];

  for (const category of categories) {
    const subcategories = await loadFreeItemSubcategories(category.label);
    for (const subcategory of subcategories) {
      paramsList.push({ category: category.slug, subcategory: subcategory.slug });
    }
  }

  return paramsList;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { category: categorySlug, subcategory: subcategorySlug } = await params;
  const category = await loadFreeItemCategoryBySlug(categorySlug);
  if (!category) {
    return {
      title: `Roblox free items | ${SITE_NAME}`,
      description: CATALOG_DESCRIPTION
    };
  }

  const subcategory = await loadFreeItemSubcategoryBySlug(category.label, subcategorySlug);
  if (!subcategory) {
    return {
      title: `Roblox free items | ${SITE_NAME}`,
      description: CATALOG_DESCRIPTION
    };
  }

  const title = appendItemCountToSeoTitle(`Free Roblox ${subcategory.label} items`, subcategory.count);
  const description = `Browse free Roblox ${subcategory.label} items in the ${category.label} category.`;
  const canonical = `${SITE_URL.replace(/\/$/, "")}${buildFreeItemCategoryPath(category.slug, subcategory.slug)}`;

  return {
    title: `${title} | ${SITE_NAME}`,
    description,
    alternates: buildAlternates(canonical),
    openGraph: {
      type: "website",
      url: canonical,
      title,
      description,
      siteName: SITE_NAME
    },
    twitter: {
      card: "summary_large_image",
      title,
      description
    }
  };
}

export default async function RobloxFreeItemsSubcategoryPage({ params }: PageProps) {
  const { category: categorySlug, subcategory: subcategorySlug } = await params;
  const category = await loadFreeItemCategoryBySlug(categorySlug);
  if (!category) {
    notFound();
  }

  const subcategory = await loadFreeItemSubcategoryBySlug(category.label, subcategorySlug);
  if (!subcategory) {
    notFound();
  }

  const [subcategories, pageData, catalog] = await Promise.all([
    loadFreeItemSubcategories(category.label),
    loadFreeItemsPageData(1, { category: category.label, subcategory: subcategory.label }),
    getCatalogPageContentByCodesIncludingDrafts(FREE_ITEMS_CONTENT_CODES)
  ]);
  const { items, total, totalPages } = pageData;
  const contentHtml = await buildFreeItemsCatalogContentHtml(catalog);

  const pageTitle = `Free Roblox ${subcategory.label} items`;
  const description = `Browse free Roblox ${subcategory.label} items in the ${category.label} category.`;
  const basePath = buildFreeItemCategoryPath(category.slug, subcategory.slug);

  return renderRobloxFreeItemsPage({
    items,
    total,
    totalPages,
    currentPage: 1,
    showHero: true,
    pageTitle,
    description,
    breadcrumbItems: [
      { label: "Home", href: "/" },
      { label: "Catalog", href: "/catalog" },
      { label: "Roblox free items", href: BASE_PATH },
      { label: category.label, href: buildFreeItemCategoryPath(category.slug) },
      { label: subcategory.label, href: null }
    ],
    basePath,
    navActive: category.slug,
    categorySlug: category.slug,
    categoryLabel: category.label,
    subcategories,
    activeSubcategorySlug: subcategory.slug,
    contentHtml
  });
}
