import fs from "node:fs/promises";
import path from "node:path";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import { CatalogAdSlot } from "@/components/CatalogAdSlot";
import { CopyCodeButton } from "@/components/CopyCodeButton";
import { CommentsSection } from "@/components/comments/CommentsSection";
import { breadcrumbJsonLd, CATALOG_DESCRIPTION, SITE_URL, webPageJsonLd } from "@/lib/seo";
import { processHtmlLinks } from "@/lib/link-utils";
import { renderHtmlAsReactNodes } from "@/lib/html-to-react";

const PAGE_SIZE = 24;

export const BASE_PATH = "/catalog/roblox-decal-ids";
export const CANONICAL = `${SITE_URL.replace(/\/$/, "")}${BASE_PATH}`;

export type DecalRow = {
    id: string;
    page: number;
    name?: string;
    description?: string;
    creator?: {
        id: number;
        name: string;
        type: string;
    };
    created?: string;
    updated?: string;
    isForSale?: boolean;
    priceInRobux?: number;
    sales?: number;
    thumbnail?: string;
    error?: string;
};

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

type PageData = {
    decals: DecalRow[];
    total: number;
    totalPages: number;
};

export type BreadcrumbItem = {
    label: string;
    href?: string | null;
};

const DECAL_DATA_FILE = path.join(process.cwd(), "data", "decal-ids", "enriched-decal-ids.json");

async function loadAllDecals(): Promise<DecalRow[]> {
    try {
        const fileContent = await fs.readFile(DECAL_DATA_FILE, "utf-8");
        const decals: DecalRow[] = JSON.parse(fileContent);
        // Filter out errors and entries without names
        return decals.filter(d => !d.error && d.name);
    } catch (error) {
        console.error("Failed to load decal data:", error);
        return [];
    }
}

export async function loadRobloxDecalIdsPageData(page: number): Promise<PageData> {
    const allDecals = await loadAllDecals();
    const safePage = Number.isFinite(page) && page > 0 ? page : 1;
    const offset = (safePage - 1) * PAGE_SIZE;
    const total = allDecals.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const decals = allDecals.slice(offset, offset + PAGE_SIZE);

    return { decals, total, totalPages };
}

function buildRobloxUrl(assetId: string): string {
    return `https://www.roblox.com/library/${assetId}`;
}

function buildThumbnailUrl(decal: DecalRow): string {
    if (decal.thumbnail) return decal.thumbnail;
    return `https://www.roblox.com/asset-thumbnail/image?assetId=${decal.id}&width=420&height=420&format=png`;
}

function formatDate(dateString: string | undefined): string | null {
    if (!dateString) return null;
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch {
        return null;
    }
}

export function DecalBreadcrumb({ items, className }: { items: BreadcrumbItem[]; className?: string }) {
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

export function DecalIdGrid({ decals }: { decals: DecalRow[] }) {
    if (!decals.length) {
        return (
            <div className="rounded-2xl border border-dashed border-border/60 bg-surface/60 p-8 text-center text-muted">
                No decal IDs have been collected yet. Check back soon.
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {decals.map((decal) => {
                const uploadDate = formatDate(decal.created);
                return (
                    <article
                        key={decal.id}
                        className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border/60 bg-surface shadow-soft transition duration-300 hover:-translate-y-1 hover:border-accent hover:shadow-xl"
                    >
                        {/* Image Preview */}
                        <div className="relative aspect-square w-full overflow-hidden bg-background/60">
                            <Image
                                src={buildThumbnailUrl(decal)}
                                alt={decal.name || `Decal ${decal.id}`}
                                fill
                                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
                                className="object-cover transition duration-500 group-hover:scale-105"
                                unoptimized
                            />
                            {decal.isForSale && decal.priceInRobux ? (
                                <span className="absolute right-2 top-2 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white shadow-lg">
                                    {decal.priceInRobux} R$
                                </span>
                            ) : null}
                        </div>

                        <div className="flex flex-1 flex-col gap-3 p-4">
                            {/* Decal Name */}
                            <h2 className="text-lg font-semibold leading-snug text-foreground line-clamp-2">
                                {decal.name || `Decal ${decal.id}`}
                            </h2>

                            {/* Creator Info */}
                            {decal.creator?.name ? (
                                <div className="flex items-center gap-2 text-xs text-muted">
                                    <span className="text-[10px] font-semibold uppercase tracking-wide">Creator</span>
                                    <span className="font-semibold text-foreground line-clamp-1">{decal.creator.name}</span>
                                </div>
                            ) : null}

                            {/* Decal ID */}
                            <div className="flex items-center gap-1.5 rounded-full border border-border/50 bg-background px-3 py-1.5 text-xs font-semibold text-foreground">
                                <span>Decal ID</span>
                                <span className="font-mono text-[0.82rem]">{decal.id}</span>
                                <CopyCodeButton
                                    code={String(decal.id)}
                                    tone="surface"
                                    size="sm"
                                    analytics={{
                                        event: "decal_id_copy",
                                        params: {
                                            asset_id: decal.id,
                                            creator: decal.creator?.name ?? ""
                                        }
                                    }}
                                />
                            </div>

                            {/* Upload Date & Sales */}
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                                {uploadDate ? (
                                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/60 px-2.5 py-0.5">
                                        <span className="text-[9px] font-semibold uppercase tracking-wide">Uploaded</span>
                                        <span className="font-semibold text-foreground">{uploadDate}</span>
                                    </span>
                                ) : null}
                                {decal.sales && decal.sales > 0 ? (
                                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/60 px-2.5 py-0.5">
                                        <span className="text-[9px] font-semibold uppercase tracking-wide">Sales</span>
                                        <span className="font-semibold text-foreground">{decal.sales.toLocaleString()}</span>
                                    </span>
                                ) : null}
                            </div>

                            {/* Action Button */}
                            <div className="mt-auto">
                                <a
                                    href={buildRobloxUrl(decal.id)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-accent-dark dark:bg-accent-dark dark:hover:bg-accent"
                                >
                                    View on Roblox
                                </a>
                            </div>
                        </div>
                    </article>
                );
            })}
        </div>
    );
}

export function buildDecalItemListSchema({
    title,
    description,
    url,
    decals,
    total,
    startIndex
}: {
    title: string;
    description: string;
    url: string;
    decals: DecalRow[];
    total: number;
    startIndex: number;
}) {
    const itemListElement = decals.map((decal, index) => {
        const item: Record<string, unknown> = {
            "@type": "ImageObject",
            name: decal.name || `Decal ${decal.id}`,
            url: buildRobloxUrl(decal.id),
            contentUrl: buildThumbnailUrl(decal)
        };
        if (decal.creator?.name) {
            item.creator = { "@type": "Person", name: decal.creator.name };
        }
        if (decal.description) {
            item.description = decal.description;
        }
        return {
            "@type": "ListItem",
            position: startIndex + index + 1,
            item
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

type PaginationProps = {
    currentPage: number;
    totalPages: number;
    basePath: string;
};

export function Pagination({ currentPage, totalPages, basePath }: PaginationProps) {
    if (totalPages <= 1) return null;

    const pageNumbers: (number | string)[] = [];
    const maxVisible = 7;

    if (totalPages <= maxVisible) {
        for (let i = 1; i <= totalPages; i++) {
            pageNumbers.push(i);
        }
    } else {
        pageNumbers.push(1);
        if (currentPage > 3) pageNumbers.push("...");

        const start = Math.max(2, currentPage - 1);
        const end = Math.min(totalPages - 1, currentPage + 1);
        for (let i = start; i <= end; i++) {
            pageNumbers.push(i);
        }

        if (currentPage < totalPages - 2) pageNumbers.push("...");
        pageNumbers.push(totalPages);
    }

    return (
        <nav aria-label="Pagination" className="flex items-center justify-center gap-2">
            {/* Previous Button */}
            {currentPage > 1 ? (
                <Link
                    href={currentPage === 2 ? basePath : `${basePath}/page/${currentPage - 1}`}
                    className="rounded-xl border border-border/60 bg-surface px-4 py-2 text-sm font-semibold text-foreground transition hover:border-accent hover:bg-accent/10"
                >
                    Previous
                </Link>
            ) : (
                <span className="rounded-xl border border-border/30 bg-surface/50 px-4 py-2 text-sm font-semibold text-muted/50">
                    Previous
                </span>
            )}

            {/* Page Numbers */}
            <div className="flex items-center gap-1">
                {pageNumbers.map((page, index) => {
                    if (page === "...") {
                        return (
                            <span key={`ellipsis-${index}`} className="px-2 text-muted">
                                ...
                            </span>
                        );
                    }

                    const pageNum = page as number;
                    const isActive = pageNum === currentPage;
                    const href = pageNum === 1 ? basePath : `${basePath}/page/${pageNum}`;

                    return (
                        <Link
                            key={pageNum}
                            href={href}
                            aria-current={isActive ? "page" : undefined}
                            className={`min-w-[40px] rounded-xl border px-3 py-2 text-center text-sm font-semibold transition ${isActive
                                ? "border-accent bg-accent text-white"
                                : "border-border/60 bg-surface text-foreground hover:border-accent hover:bg-accent/10"
                                }`}
                        >
                            {pageNum}
                        </Link>
                    );
                })}
            </div>

            {/* Next Button */}
            {currentPage < totalPages ? (
                <Link
                    href={`${basePath}/page/${currentPage + 1}`}
                    className="rounded-xl border border-border/60 bg-surface px-4 py-2 text-sm font-semibold text-foreground transition hover:border-accent hover:bg-accent/10"
                >
                    Next
                </Link>
            ) : (
                <span className="rounded-xl border border-border/30 bg-surface/50 px-4 py-2 text-sm font-semibold text-muted/50">
                    Next
                </span>
            )}
        </nav>
    );
}

export function renderRobloxDecalIdsPage({
    decals,
    total,
    totalPages,
    currentPage,
    showHero,
    contentHtml
}: {
    decals: DecalRow[];
    total: number;
    totalPages: number;
    currentPage: number;
    showHero: boolean;
    contentHtml?: CatalogContentHtml | null;
}) {
    const introHtml = contentHtml?.introHtml?.trim() ? contentHtml?.introHtml : "";
    const descriptionHtml = contentHtml?.descriptionHtml ?? [];
    const howHtml = contentHtml?.howHtml?.trim() ? contentHtml?.howHtml : "";
    const faqHtml = contentHtml?.faqHtml ?? [];
    const baseTitle = contentHtml?.title?.trim() ? contentHtml.title.trim() : "Roblox Decal IDs";
    const updatedDate = contentHtml?.updatedAt ? new Date(contentHtml.updatedAt) : new Date();
    const formattedUpdated = updatedDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    const updatedRelativeLabel = formatDistanceToNow(updatedDate, { addSuffix: true });
    const canonicalPath = currentPage > 1 ? `${BASE_PATH}/page/${currentPage}` : BASE_PATH;
    const canonicalUrl = `${SITE_URL.replace(/\/$/, "")}${canonicalPath}`;
    const pageTitle = currentPage > 1 ? `${baseTitle} - Page ${currentPage}` : baseTitle;
    const description = CATALOG_DESCRIPTION;
    const image = `${SITE_URL}/og-image.png`;
    const updatedIso = updatedDate.toISOString();
    const startIndex = (currentPage - 1) * PAGE_SIZE;

    const breadcrumbNavItems: BreadcrumbItem[] = [
        { label: "Home", href: "/" },
        { label: "Catalog", href: "/catalog" },
        { label: "Roblox Decal IDs", href: currentPage > 1 ? BASE_PATH : null }
    ];
    if (currentPage > 1) {
        breadcrumbNavItems.push({ label: `Page ${currentPage}`, href: null });
    }

    const breadcrumbSchemaItems =
        currentPage > 1
            ? [
                { name: "Home", url: SITE_URL },
                { name: "Catalog", url: `${SITE_URL.replace(/\/$/, "")}/catalog` },
                { name: "Roblox Decal IDs", url: `${SITE_URL.replace(/\/$/, "")}${BASE_PATH}` },
                { name: `Page ${currentPage}`, url: canonicalUrl }
            ]
            : [
                { name: "Home", url: SITE_URL },
                { name: "Catalog", url: `${SITE_URL.replace(/\/$/, "")}/catalog` },
                { name: "Roblox Decal IDs", url: canonicalUrl }
            ];

    const hasDetails =
        Boolean(descriptionHtml.length) || Boolean(howHtml) || Boolean(faqHtml.length) ||
        Boolean(contentHtml?.ctaLabel && contentHtml?.ctaUrl);
    const introNodes = introHtml ? renderCatalogNodes(introHtml, "decal-intro") : null;
    const descriptionNodes = descriptionHtml.flatMap((entry) =>
        renderCatalogNodes(entry.html, `decal-description-${entry.key}`)
    );
    const howNodes = howHtml ? renderCatalogNodes(howHtml, "decal-how") : null;
    const faqNodes = faqHtml.map((faq, idx) => ({
        ...faq,
        nodes: renderCatalogNodes(faq.a, `decal-faq-${idx}`)
    }));

    const listSchema = buildDecalItemListSchema({
        title: pageTitle,
        description,
        url: canonicalUrl,
        decals,
        total,
        startIndex
    });

    const pageSchema = JSON.stringify(
        webPageJsonLd({
            siteUrl: SITE_URL,
            slug: canonicalPath.replace(/^\//, ""),
            title: pageTitle,
            description,
            image,
            author: null,
            publishedAt: updatedIso,
            updatedAt: updatedIso
        })
    );

    const breadcrumbSchema = JSON.stringify(breadcrumbJsonLd(breadcrumbSchemaItems));

    return (
        <div className="space-y-10">
            {showHero ? (
                <header className="space-y-4">
                    <DecalBreadcrumb items={breadcrumbNavItems} />
                    <h1 className="text-4xl font-semibold leading-tight text-foreground md:text-5xl">{baseTitle}</h1>
                    <p className="text-sm text-foreground/80">
                        Updated on <span className="font-semibold text-foreground">{formattedUpdated}</span>
                        {updatedRelativeLabel ? <span> ({updatedRelativeLabel})</span> : null}
                    </p>
                    <p className="text-lg text-muted">
                        Browse {total.toLocaleString()} verified Roblox decal IDs with visual previews. Copy any image ID instantly.
                    </p>
                </header>
            ) : (
                <header className="space-y-2">
                    <DecalBreadcrumb items={breadcrumbNavItems} />
                    <h1 className="text-3xl font-semibold text-foreground">{baseTitle}</h1>
                    <p className="text-sm text-muted">
                        Page {currentPage} of {totalPages}
                    </p>
                </header>
            )}

            <section id="article-body" itemProp="articleBody" className="article-content md-copy-scope copy-with-sidebar-space space-y-6">
                {introNodes && showHero ? introNodes : null}

                <CatalogAdSlot />

                <DecalIdGrid decals={decals} />

                {totalPages > 1 ? (
                    <Pagination currentPage={currentPage} totalPages={totalPages} basePath={BASE_PATH} />
                ) : null}

                <CatalogAdSlot />

                {showHero && hasDetails ? (
                    <>
                        {descriptionNodes.length ? descriptionNodes : null}

                        {howNodes ? howNodes : null}

                        {contentHtml?.ctaLabel && contentHtml?.ctaUrl ? (
                            <p data-md-copy className="md-copy-node md-copy-p">
                                {contentHtml.ctaLabel}{" "}
                                <a
                                    href={contentHtml.ctaUrl}
                                    className="rounded-full bg-accent px-6 py-2 text-sm font-semibold text-white transition hover:bg-accent-dark"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    Learn More
                                </a>
                            </p>
                        ) : null}

                        {faqNodes.length ? (
                            <>
                                <div className="space-y-4">
                                    <h2 className="text-2xl font-semibold text-foreground">Frequently Asked Questions</h2>
                                    <div className="space-y-4">
                                        {faqNodes.map((faq, index) => (
                                            <details
                                                key={index}
                                                className="group rounded-2xl border border-border/60 bg-surface p-5 transition hover:border-accent/60"
                                            >
                                                <summary className="cursor-pointer text-lg font-semibold text-foreground">
                                                    {faq.q}
                                                </summary>
                                                {faq.nodes}
                                            </details>
                                        ))}
                                    </div>
                                </div>
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

            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: listSchema }} />
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: pageSchema }} />
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: breadcrumbSchema }} />
        </div>
    );
}
