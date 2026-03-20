import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import type { ReactNode } from "react";
import { CatalogAdSlot } from "@/components/CatalogAdSlot";
import { CommentsSection } from "@/components/comments/CommentsSection";
import type { CatalogPageContent } from "@/lib/catalog";
import { getFreeItemCategories, getFreeItemSubcategories, listFreeItems, type FreeItem } from "@/lib/db";
import { renderMarkdown } from "@/lib/markdown";
import { breadcrumbJsonLd, SITE_URL, webPageJsonLd } from "@/lib/seo";
import { Suspense } from "react";
import { FreeItemsBrowser } from "./FreeItemsBrowser";
import { processHtmlLinks } from "@/lib/link-utils";
import { renderHtmlAsReactNodes } from "@/lib/html-to-react";

const PAGE_SIZE = 24;

export const BASE_PATH = "/catalog/roblox-free-items";
export const CANONICAL = `${SITE_URL.replace(/\/$/, "")}${BASE_PATH}`;

export function buildFreeItemCategoryPath(categorySlug: string, subcategorySlug?: string): string {
  return subcategorySlug ? `${BASE_PATH}/${categorySlug}/${subcategorySlug}` : `${BASE_PATH}/${categorySlug}`;
}

export type CatalogContentHtml = {
  id?: string | null;
  title?: string | null;
  introHtml?: string;
  howHtml?: string;
  descriptionHtml?: Array<{ key: string; html: string }>;
  faqHtml?: Array<{ q: string; a: string }>;
  updatedAt?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
};

function renderCatalogNodes(html: string, keyPrefix: string): ReactNode[] {
  return renderHtmlAsReactNodes(processHtmlLinks(html).__html, { keyPrefix });
}

function sortDescriptionEntries(description: Record<string, string> | null | undefined) {
  return Object.entries(description ?? {}).sort((a, b) => {
    const left = Number.parseInt(a[0], 10);
    const right = Number.parseInt(b[0], 10);
    if (Number.isNaN(left) && Number.isNaN(right)) return a[0].localeCompare(b[0]);
    if (Number.isNaN(left)) return 1;
    if (Number.isNaN(right)) return -1;
    return left - right;
  });
}

type PageData = {
  items: FreeItem[];
  total: number;
  totalPages: number;
};

export type CategoryOption = {
  slug: string;
  label: string;
  count: number;
};

export type SubcategoryOption = {
  slug: string;
  label: string;
  count: number;
};

export type BreadcrumbItem = {
  label: string;
  href?: string | null;
};

type FreeItemsPageFilters = {
  category?: string;
  subcategory?: string;
  search?: string;
  sort?: "featured" | "newest" | "popular" | "updated";
};

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function slugify(value: string): string {
  const normalized = normalizeKey(value);
  return normalized.replace(/\s+/g, "-");
}

function buildRobloxUrl(item: Pick<FreeItem, "asset_id" | "item_type" | "roblox_url">): string {
  if (item.roblox_url) {
    return item.roblox_url;
  }

  if (item.item_type === "Bundle") {
    return `https://www.roblox.com/bundles/${Math.abs(Math.trunc(item.asset_id))}`;
  }

  return `https://www.roblox.com/catalog/${item.asset_id}`;
}

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

export function appendItemCountToSeoTitle(title: string, count: number): string {
  return `${title} (${formatCount(count)} items)`;
}

export function resolveFreeItemsDescription(
  description: string | null | undefined,
  fallback: string
): string {
  const trimmed = description?.trim();
  if (!trimmed) {
    return fallback;
  }

  if (/^draft page for\b/i.test(trimmed)) {
    return fallback;
  }

  return trimmed;
}

export async function buildFreeItemsCatalogContentHtml(
  catalog: CatalogPageContent | null
): Promise<CatalogContentHtml | null> {
  if (!catalog) {
    return null;
  }

  const introHtml = catalog.intro_md ? await renderMarkdown(catalog.intro_md, { paragraphizeLineBreaks: true }) : "";
  const howHtml = catalog.how_it_works_md
    ? await renderMarkdown(catalog.how_it_works_md, { paragraphizeLineBreaks: true })
    : "";

  const descriptionEntries = sortDescriptionEntries(catalog.description_json ?? {});
  const descriptionHtml = await Promise.all(
    descriptionEntries.map(async ([key, value]) => ({
      key,
      html: await renderMarkdown(value ?? "", { paragraphizeLineBreaks: true })
    }))
  );

  const faqEntries = Array.isArray(catalog.faq_json) ? catalog.faq_json : [];
  const faqHtml = await Promise.all(
    faqEntries.map(async (entry) => ({
      q: entry.q,
      a: await renderMarkdown(entry.a ?? "", { paragraphizeLineBreaks: true })
    }))
  );

  return {
    id: catalog.id ?? null,
    title: catalog.title ?? null,
    introHtml,
    howHtml,
    descriptionHtml,
    faqHtml,
    updatedAt: catalog.content_updated_at ?? catalog.updated_at ?? catalog.published_at ?? catalog.created_at ?? null,
    ctaLabel: catalog.cta_label ?? null,
    ctaUrl: catalog.cta_url ?? null
  };
}

export async function loadFreeItemsPageData(
  page: number,
  filters: FreeItemsPageFilters = {}
): Promise<PageData> {
  try {
    const { items, total } = await listFreeItems(page, PAGE_SIZE, filters);
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    return { items, total, totalPages };
  } catch (error) {
    console.error("Failed to load free items page data", error);
    return { items: [], total: 0, totalPages: 1 };
  }
}

export async function loadFreeItemCategories(): Promise<CategoryOption[]> {
  try {
    const categories = await getFreeItemCategories();
    return categories.map((entry) => ({
      slug: slugify(entry.category),
      label: entry.category,
      count: entry.count
    }));
  } catch (error) {
    console.error("Failed to load free item categories", error);
    return [];
  }
}

export async function loadFreeItemCategoryBySlug(slug: string): Promise<CategoryOption | null> {
  const categories = await loadFreeItemCategories();
  return categories.find((entry) => entry.slug === slug) ?? null;
}

export async function loadFreeItemSubcategories(category: string): Promise<SubcategoryOption[]> {
  if (!category) return [];
  try {
    const subcategories = await getFreeItemSubcategories(category);
    return subcategories.map((entry) => ({
      slug: slugify(entry.subcategory),
      label: entry.subcategory,
      count: entry.count
    }));
  } catch (error) {
    console.error("Failed to load free item subcategories", error);
    return [];
  }
}

export async function loadFreeItemSubcategoryBySlug(
  category: string,
  slug: string
): Promise<SubcategoryOption | null> {
  const subcategories = await loadFreeItemSubcategories(category);
  return subcategories.find((entry) => entry.slug === slug) ?? null;
}

export function FreeItemsNav({ active, categories }: { active: string; categories: CategoryOption[] }) {
  const navItems = [
    {
      id: "all",
      title: "All Free Items",
      description: "Every free Roblox catalog item we track.",
      href: BASE_PATH,
      count: null
    },
    ...categories.map((category) => ({
      id: category.slug,
      title: category.label,
      description: `${formatCount(category.count)} items`,
      href: buildFreeItemCategoryPath(category.slug),
      count: category.count
    }))
  ];

  return (
    <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      {navItems.map((item) => {
        const isActive = item.id === active;
        const cardClasses = `group relative overflow-hidden rounded-2xl border px-5 py-4 transition ${
          isActive
            ? "border-accent/70 bg-gradient-to-br from-accent/15 via-surface to-background shadow-soft"
            : "border-border/60 bg-surface/80 hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-soft"
        }`;
        const card = (
          <article className={cardClasses} aria-current={isActive ? "page" : undefined}>
            <span
              aria-hidden
              className={`absolute inset-x-0 top-0 h-1 ${
                isActive ? "bg-accent" : "bg-accent/30 group-hover:bg-accent/60"
              }`}
            />
            <div className="flex h-full flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-lg font-semibold text-foreground">{item.title}</p>
                {isActive ? (
                  <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                    Active
                  </span>
                ) : null}
              </div>
              <p className="text-sm text-muted">{item.description}</p>
            </div>
          </article>
        );

        if (isActive) {
          return (
            <div key={item.id} className="h-full" aria-current="page">
              {card}
            </div>
          );
        }

        return (
          <Link key={item.id} href={item.href} className="block h-full">
            {card}
          </Link>
        );
      })}
    </section>
  );
}

export function FreeItemsBreadcrumb({ items, className }: { items: BreadcrumbItem[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={className ?? "text-xs uppercase tracking-[0.25em] text-muted"}>
      <ol className="flex flex-wrap items-center gap-2">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex items-center gap-2">
            {item.href ? (
              <Link href={item.href} className="font-semibold text-muted transition hover:text-accent">
                {item.label}
              </Link>
            ) : (
              <span className="font-semibold text-foreground/80">{item.label}</span>
            )}
            {index < items.length - 1 ? <span className="text-muted/60">&gt;</span> : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function buildFreeItemsItemListSchema({
  title,
  description,
  url,
  items,
  total,
  startIndex
}: {
  title: string;
  description: string;
  url: string;
  items: FreeItem[];
  total: number;
  startIndex: number;
}) {
  const itemListElement = items.map((item, index) => {
    const schemaItem: {
      "@type": "Thing";
      name: string;
      url: string;
      image?: string;
    } = {
      "@type": "Thing",
      name: item.name ?? `Roblox item ${item.asset_id}`,
      url: buildRobloxUrl(item)
    };

    if (item.thumbnail_url) {
      schemaItem.image = item.thumbnail_url;
    }

    return {
      "@type": "ListItem",
      position: startIndex + index + 1,
      item: schemaItem
    };
  });

  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: title,
    description,
    url,
    numberOfItems: total,
    itemListElement
  });
}

export function buildSimpleItemListSchema({
  title,
  description,
  url,
  items,
  itemType = "Thing"
}: {
  title: string;
  description: string;
  url: string;
  items: Array<{ name: string; url: string }>;
  itemType?: string;
}) {
  const itemListElement = items.map((item, index) => ({
    "@type": "ListItem",
    position: index + 1,
    item: {
      "@type": itemType,
      name: item.name,
      url: item.url
    }
  }));

  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: title,
    description,
    url,
    numberOfItems: items.length,
    itemListElement
  });
}

export function buildCategoryCards(categories: CategoryOption[]) {
  if (!categories.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 bg-surface/60 p-8 text-center text-muted">
        No categories are available yet. Check back soon.
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {categories.map((category) => (
        <Link
          key={category.slug}
          href={buildFreeItemCategoryPath(category.slug)}
          className="group block h-full"
        >
          <article className="relative h-full overflow-hidden rounded-2xl border border-border/60 bg-surface p-5 shadow-soft transition hover:-translate-y-0.5 hover:border-accent/70">
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(255,255,255,0.3),transparent_55%)]"
            />
            <div className="relative space-y-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-muted">Category</div>
              <h2 className="text-xl font-semibold text-foreground">{category.label}</h2>
              <div className="flex items-center justify-between text-sm text-muted">
                <span>{formatCount(category.count)} items</span>
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-accent/80">Explore</span>
              </div>
            </div>
          </article>
        </Link>
      ))}
    </div>
  );
}

export async function renderRobloxFreeItemsPage({
  items,
  total,
  totalPages,
  currentPage,
  showHero,
  contentHtml,
  pageTitle,
  description,
  breadcrumbItems,
  basePath = BASE_PATH,
  navActive = "all",
  categorySlug,
  categoryLabel,
  subcategories,
  activeSubcategorySlug
}: {
  items: FreeItem[];
  total: number;
  totalPages: number;
  currentPage: number;
  showHero: boolean;
  contentHtml?: CatalogContentHtml | null;
  pageTitle: string;
  description: string;
  breadcrumbItems: BreadcrumbItem[];
  basePath?: string;
  navActive?: string;
  categorySlug?: string;
  categoryLabel?: string;
  subcategories?: SubcategoryOption[];
  activeSubcategorySlug?: string;
}) {
  const navCategories = await loadFreeItemCategories();
  const introHtml = contentHtml?.introHtml?.trim() ? contentHtml.introHtml : "";
  const descriptionHtml = contentHtml?.descriptionHtml ?? [];
  const howHtml = contentHtml?.howHtml?.trim() ? contentHtml.howHtml : "";
  const faqHtml = contentHtml?.faqHtml ?? [];
  const updatedDate = contentHtml?.updatedAt ? new Date(contentHtml.updatedAt) : null;
  const formattedUpdated = updatedDate
    ? updatedDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : null;
  const updatedRelativeLabel = updatedDate ? formatDistanceToNow(updatedDate, { addSuffix: true }) : null;
  const canonicalPath = currentPage > 1 ? `${basePath}/page/${currentPage}` : basePath;
  const canonicalUrl = `${SITE_URL.replace(/\/$/, "")}${canonicalPath}`;
  const updatedIso = updatedDate ? updatedDate.toISOString() : new Date().toISOString();
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const hasDetails =
    Boolean(descriptionHtml.length) || Boolean(howHtml) || Boolean(faqHtml.length) ||
    Boolean(contentHtml?.ctaLabel && contentHtml?.ctaUrl);
  const listSchema = buildFreeItemsItemListSchema({
    title: pageTitle,
    description,
    url: canonicalUrl,
    items,
    total,
    startIndex
  });
  const pageSchema = JSON.stringify(
    webPageJsonLd({
      siteUrl: SITE_URL,
      slug: canonicalPath.replace(/^\//, ""),
      title: pageTitle,
      description,
      image: `${SITE_URL}/og-image.png`,
      author: null,
      publishedAt: updatedIso,
      updatedAt: updatedIso
    })
  );
  const breadcrumbSchema = JSON.stringify(
    breadcrumbJsonLd(
      breadcrumbItems.map((item) => ({
        name: item.label,
        url: item.href ? `${SITE_URL.replace(/\/$/, "")}${item.href}` : canonicalUrl
      }))
    )
  );
  const introNodes = introHtml ? renderCatalogNodes(introHtml, "free-items-intro") : null;
  const descriptionNodes = descriptionHtml.flatMap((entry) =>
    renderCatalogNodes(entry.html, `free-items-description-${entry.key}`)
  );
  const howNodes = howHtml ? renderCatalogNodes(howHtml, "free-items-how") : null;
  const faqNodes = faqHtml.map((faq, idx) => ({
    ...faq,
    nodes: renderCatalogNodes(faq.a, `free-items-faq-${idx}`)
  }));

  return (
    <div className="space-y-10">
      {showHero ? (
        <header className="space-y-4">
          <FreeItemsBreadcrumb items={breadcrumbItems} />
          <h1 className="text-4xl font-semibold leading-tight text-foreground md:text-5xl">{pageTitle}</h1>
          {formattedUpdated ? (
            <p className="text-sm text-foreground/80">
              Updated on <span className="font-semibold text-foreground">{formattedUpdated}</span>
              {updatedRelativeLabel ? <span>{' '}({updatedRelativeLabel})</span> : null}
            </p>
          ) : null}
        </header>
      ) : (
        <header className="space-y-2">
          <FreeItemsBreadcrumb items={breadcrumbItems} />
          <h1 className="text-3xl font-semibold text-foreground">{pageTitle}</h1>
          <p className="text-sm text-muted">
            Page {currentPage} of {totalPages}
          </p>
        </header>
      )}

      <section id="article-body" itemProp="articleBody" className="article-content md-copy-scope copy-with-sidebar-space space-y-6">
        {introNodes && showHero ? introNodes : null}

        <CatalogAdSlot />

        <FreeItemsNav active={navActive} categories={navCategories} />

        {subcategories?.length && categorySlug ? (
          <section className="flex flex-wrap gap-2">
            <Link
              href={buildFreeItemCategoryPath(categorySlug)}
              className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition ${
                activeSubcategorySlug
                  ? "border-border/70 bg-background/70 text-muted hover:border-accent/70 hover:text-accent"
                  : "border-accent/70 bg-accent/10 text-accent"
              }`}
            >
              {categoryLabel ? `All ${categoryLabel}` : "All"}
            </Link>
            {subcategories.map((subcategory) => {
              const isActive = subcategory.slug === activeSubcategorySlug;
              return (
                <Link
                  key={subcategory.slug}
                  href={buildFreeItemCategoryPath(categorySlug, subcategory.slug)}
                  className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition ${
                    isActive
                      ? "border-accent/70 bg-accent/10 text-accent"
                      : "border-border/70 bg-background/70 text-muted hover:border-accent/70 hover:text-accent"
                  }`}
                >
                  {subcategory.label}
                </Link>
              );
            })}
          </section>
        ) : null}

        <Suspense
          fallback={
            <div className="rounded-2xl border border-border/60 bg-surface/60 p-6 text-sm text-muted">
              Loading free items...
            </div>
          }
        >
          <FreeItemsBrowser
            initialItems={items}
            initialTotalPages={totalPages}
            currentPage={currentPage}
            basePath={basePath}
            category={categoryLabel}
            subcategory={
              subcategories?.find((subcategory) => subcategory.slug === activeSubcategorySlug)?.label ?? undefined
            }
          />
        </Suspense>

        <CatalogAdSlot />

        {showHero && hasDetails ? (
          <>
            {descriptionNodes.length ? descriptionNodes : null}

            {howNodes ? howNodes : null}

            {contentHtml?.ctaLabel && contentHtml?.ctaUrl ? (
              <>
                <h3 data-md-copy className="md-copy-node md-copy-heading md-copy-h3">Next step</h3>
                <p data-md-copy className="md-copy-node md-copy-p">Keep exploring free Roblox items.</p>
                <p data-md-copy className="md-copy-node md-copy-p">
                  <a
                    href={contentHtml.ctaUrl}
                    className="inline-flex items-center justify-center rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-accent-dark dark:bg-accent-dark dark:hover:bg-accent"
                  >
                    {contentHtml.ctaLabel}
                  </a>
                </p>
              </>
            ) : null}

            {faqNodes.length ? (
              <>
                <section className="rounded-2xl border border-border/60 bg-surface/40 p-6 shadow-sm">
                  <h2 className="text-lg font-semibold text-foreground">FAQ</h2>
                  <div className="mt-3 space-y-4">
                    {faqNodes.map((faq, idx) => (
                      <div key={`${faq.q}-${idx}`} className="rounded-xl border border-border/40 bg-background/60 p-4">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold uppercase tracking-[0.18em] text-muted">Q.</span>
                          <p className="text-base font-semibold text-foreground">{faq.q}</p>
                        </div>
                        {faq.nodes}
                      </div>
                    ))}
                  </div>
                </section>
              </>
            ) : null}
          </>
        ) : null}
      </section>

      {contentHtml?.id ? (
        <div className="mt-10">
          <CommentsSection entityType="catalog" entityId={contentHtml.id} />
        </div>
      ) : null}

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: pageSchema }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: listSchema }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: breadcrumbSchema }} />
    </div>
  );
}

export { buildRobloxUrl };
