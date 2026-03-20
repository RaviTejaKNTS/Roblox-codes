import type { Metadata } from "next";
import "@/styles/article-content.css";
import { getCatalogPageContentByCodesIncludingDrafts } from "@/lib/catalog";
import { CATALOG_DESCRIPTION, SITE_NAME, SITE_URL, resolveSeoTitle, buildAlternates } from "@/lib/seo";
import { appendItemCountToSeoTitle, BASE_PATH, loadFreeItemsPageData, renderRobloxFreeItemsPage } from "../../page-data";
import { buildPageParams } from "@/lib/static-params";

export const revalidate = 2592000;

const CATALOG_CODE_CANDIDATES = ["roblox-free-items"];
const FALLBACK_IMAGE = `${SITE_URL}/og-image.png`;
const MAX_STATIC_PAGES = 20;

type PageProps = {
  params: Promise<{ page: string }>;
};

export async function generateStaticParams() {
  const { totalPages } = await loadFreeItemsPageData(1);
  return buildPageParams(totalPages, 1, MAX_STATIC_PAGES);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { page } = await params;
  const pageNumber = Number.parseInt(page, 10);
  const safePageNumber = Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : 1;

  const [{ total }, catalog] = await Promise.all([
    loadFreeItemsPageData(safePageNumber),
    getCatalogPageContentByCodesIncludingDrafts(CATALOG_CODE_CANDIDATES)
  ]);
  const baseTitle = catalog?.title ?? "Roblox free items";
  const title = `${appendItemCountToSeoTitle(resolveSeoTitle(catalog?.seo_title) ?? baseTitle, total)} - Page ${safePageNumber}`;
  const description = catalog?.meta_description ?? CATALOG_DESCRIPTION;
  const image = catalog?.thumb_url || FALLBACK_IMAGE;
  const canonicalUrl = `${SITE_URL.replace(/\/$/, "")}${BASE_PATH}/page/${safePageNumber}`;

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
    alternates: buildAlternates(canonicalUrl),
    openGraph: {
      type: "website",
      url: canonicalUrl,
      title,
      description,
      siteName: SITE_NAME,
      images: [image]
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image]
    }
  };
}

export default async function RobloxFreeItemsPaginatedPage({ params }: PageProps) {
  const { page } = await params;
  const pageNumber = Number.parseInt(page, 10);
  const safePageNumber = Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : 1;

  const [pageData, catalog] = await Promise.all([
    loadFreeItemsPageData(safePageNumber),
    getCatalogPageContentByCodesIncludingDrafts(CATALOG_CODE_CANDIDATES)
  ]);
  const { items, total, totalPages } = pageData;

  return renderRobloxFreeItemsPage({
    items,
    total,
    totalPages,
    currentPage: safePageNumber,
    showHero: false,
    pageTitle: "Roblox free items",
    description: "Browse free Roblox catalog items.",
    breadcrumbItems: [
      { label: "Home", href: "/" },
      { label: "Catalog", href: "/catalog" },
      { label: "Roblox free items", href: BASE_PATH },
      { label: `Page ${safePageNumber}`, href: null }
    ],
    basePath: BASE_PATH,
    navActive: "all",
    contentHtml: catalog ? { id: catalog.id ?? null } : null
  });
}
