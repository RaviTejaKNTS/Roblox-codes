import type { Metadata } from "next";
import "@/styles/article-content.css";
import { notFound } from "next/navigation";
import { getCatalogPageContentByCodesIncludingDrafts } from "@/lib/catalog";
import { CATALOG_DESCRIPTION, SITE_NAME, SITE_URL, buildAlternates } from "@/lib/seo";
import {
  BASE_PATH,
  appendItemCountToSeoTitle,
  buildFreeItemCategoryPath,
  loadFreeItemCategories,
  loadFreeItemCategoryBySlug,
  loadFreeItemSubcategories,
  loadFreeItemsPageData,
  resolveFreeItemsDescription,
  renderRobloxFreeItemsPage
} from "../../../page-data";

export const revalidate = 2592000;

type PageProps = {
  params: Promise<{ category: string; page: string }>;
};

function getCatalogCodeCandidates(categorySlug: string) {
  return [`roblox-free-items/${categorySlug}`, "roblox-free-items"];
}

export async function generateStaticParams() {
  const categories = await loadFreeItemCategories();
  return categories.map((category) => ({ category: category.slug, page: "1" }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { category: categorySlug, page } = await params;
  const category = await loadFreeItemCategoryBySlug(categorySlug);
  if (!category) {
    return {
      title: `Roblox free items | ${SITE_NAME}`,
      description: CATALOG_DESCRIPTION
    };
  }

  const pageNumber = Number.parseInt(page, 10);
  const safePageNumber = Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : 1;
  const catalog = await getCatalogPageContentByCodesIncludingDrafts(getCatalogCodeCandidates(category.slug));
  const baseTitle = catalog?.seo_title?.trim() || catalog?.title?.trim() || `Free Roblox ${category.label} items`;
  const title = `${appendItemCountToSeoTitle(baseTitle, category.count)} - Page ${safePageNumber}`;
  const description = resolveFreeItemsDescription(
    catalog?.meta_description,
    `Browse free Roblox ${category.label} items (page ${safePageNumber}).`
  );
  const canonical = `${SITE_URL.replace(/\/$/, "")}${buildFreeItemCategoryPath(category.slug)}/page/${safePageNumber}`;

  return {
    title: `${title} | ${SITE_NAME}`,
    description,
    robots: {
      index: false,
      follow: true,
      nocache: false,
      googleBot: {
        index: false,
        follow: true
      }
    },
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

export default async function RobloxFreeItemsCategoryPaginatedPage({ params }: PageProps) {
  const { category: categorySlug, page } = await params;
  const category = await loadFreeItemCategoryBySlug(categorySlug);
  if (!category) {
    notFound();
  }

  const pageNumber = Number.parseInt(page, 10);
  const safePageNumber = Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : 1;

  const [subcategories, pageData, catalog] = await Promise.all([
    loadFreeItemSubcategories(category.label),
    loadFreeItemsPageData(safePageNumber, { category: category.label }),
    getCatalogPageContentByCodesIncludingDrafts(getCatalogCodeCandidates(category.slug))
  ]);
  const { items, total, totalPages } = pageData;

  const pageTitle = catalog?.title?.trim() || `Free Roblox ${category.label} items`;
  const basePath = buildFreeItemCategoryPath(category.slug);

  return renderRobloxFreeItemsPage({
    items,
    total,
    totalPages,
    currentPage: safePageNumber,
    showHero: false,
    pageTitle,
    description: `Browse free Roblox ${category.label} items.`,
    breadcrumbItems: [
      { label: "Home", href: "/" },
      { label: "Catalog", href: "/catalog" },
      { label: "Roblox free items", href: BASE_PATH },
      { label: category.label, href: basePath },
      { label: `Page ${safePageNumber}`, href: null }
    ],
    basePath,
    navActive: category.slug,
    categorySlug: category.slug,
    categoryLabel: category.label,
    subcategories,
    contentHtml: catalog
      ? {
          id: catalog.id ?? null,
          title: catalog.title ?? null
        }
      : null
  });
}
