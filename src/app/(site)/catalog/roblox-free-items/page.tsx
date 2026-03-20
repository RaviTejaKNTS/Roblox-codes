import type { Metadata } from "next";
import "@/styles/article-content.css";
import { getCatalogPageContentByCodesIncludingDrafts } from "@/lib/catalog";
import { CATALOG_DESCRIPTION, SITE_NAME, SITE_URL, resolveSeoTitle, buildAlternates } from "@/lib/seo";
import {
  BASE_PATH,
  CANONICAL,
  appendItemCountToSeoTitle,
  buildFreeItemsCatalogContentHtml,
  loadFreeItemsPageData,
  renderRobloxFreeItemsPage
} from "./page-data";

export const revalidate = 2592000;

const CATALOG_CODE_CANDIDATES = ["roblox-free-items"];
const FALLBACK_IMAGE = `${SITE_URL}/og-image.png`;
const PAGE_DESCRIPTION = "Browse free Roblox items and bundles.";

export async function generateMetadata(): Promise<Metadata> {
  const [{ total }, catalog] = await Promise.all([
    loadFreeItemsPageData(1),
    getCatalogPageContentByCodesIncludingDrafts(CATALOG_CODE_CANDIDATES)
  ]);
  if (!catalog) {
    const title = appendItemCountToSeoTitle("Roblox Free Items and Bundles", total);
    return {
      title: `${title} | ${SITE_NAME}`,
      description: CATALOG_DESCRIPTION,
      alternates: buildAlternates(CANONICAL)
    };
  }

  const baseTitle = resolveSeoTitle(catalog.seo_title) ?? catalog.title ?? "Roblox Free Items";
  const title = appendItemCountToSeoTitle(baseTitle, total);
  const description = catalog.meta_description ?? CATALOG_DESCRIPTION;
  const image = catalog.thumb_url || FALLBACK_IMAGE;

  return {
    title,
    description,
    alternates: buildAlternates(CANONICAL),
    openGraph: {
      type: "website",
      url: CANONICAL,
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

export default async function RobloxFreeItemsPage() {
  const [{ items, total, totalPages }, catalog] = await Promise.all([
    loadFreeItemsPageData(1),
    getCatalogPageContentByCodesIncludingDrafts(CATALOG_CODE_CANDIDATES)
  ]);
  const contentHtml = await buildFreeItemsCatalogContentHtml(catalog);

  const pageTitle = contentHtml?.title?.trim() ? contentHtml.title.trim() : "Roblox Free Items and Bundles";

  return renderRobloxFreeItemsPage({
    items,
    total,
    totalPages,
    currentPage: 1,
    showHero: true,
    contentHtml,
    pageTitle,
    description: PAGE_DESCRIPTION,
    breadcrumbItems: [
      { label: "Home", href: "/" },
      { label: "Catalog", href: "/catalog" },
      { label: "Roblox free items", href: null }
    ],
    basePath: BASE_PATH,
    navActive: "all"
  });
}
