import type { Metadata } from "next";
import { formatDistanceToNow } from "date-fns";
import "@/styles/article-content.css";
import { renderMarkdown } from "@/lib/markdown";
import { SITE_NAME, SITE_URL, resolveSeoTitle, buildAlternates } from "@/lib/seo";
import { getToolContent, type ToolContent, type ToolFaqEntry } from "@/lib/tools";
import { loadForgeArmorDataset } from "@/lib/forge/armors";
import { loadForgeOreDataset } from "@/lib/forge/ores";
import { loadForgeWeaponDataset } from "@/lib/forge/weapons";
import { ContentSlot } from "@/components/ContentSlot";
import { ForgeInventoryOptimizerClient } from "./ForgeInventoryOptimizerClient";
import { CommentsSection } from "@/components/comments/CommentsSection";
import { resolveModifiedAt, resolvePublishedAt } from "@/lib/content-dates";

export const revalidate = 3600;

const TOOL_CODE = "the-forge-inventory-optimizer";
const CANONICAL = `${SITE_URL.replace(/\/$/, "")}/tools/the-forge-inventory-optimizer`;
const FALLBACK_IMAGE = `${SITE_URL}/og-image.png`;
const TOOL_AD_SLOT = "3529946151";

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

async function buildToolContent(): Promise<{
    tool: ToolContent | null;
    introHtml: string;
    howHtml: string;
    descriptionHtml: Array<{ key: string; html: string }>;
    faqHtml: Array<{ q: string; a: string }>;
}> {
    const tool = (await getToolContent(TOOL_CODE)) ?? null;
    const introHtml = tool?.intro_md ? await renderMarkdown(tool.intro_md, { paragraphizeLineBreaks: true }) : "";
    const howHtml = tool?.how_it_works_md ? await renderMarkdown(tool.how_it_works_md, { paragraphizeLineBreaks: true }) : "";

    const descriptionEntries = sortDescriptionEntries(tool?.description_json ?? {});
    const descriptionHtml = await Promise.all(
        descriptionEntries.map(async ([key, value]) => ({
            key,
            html: await renderMarkdown(value ?? "", { paragraphizeLineBreaks: true })
        }))
    );

    const faqEntries: ToolFaqEntry[] = Array.isArray(tool?.faq_json) ? tool.faq_json : [];
    const faqHtml = await Promise.all(
        faqEntries.map(async (entry) => ({
            q: entry.q,
            a: await renderMarkdown(entry.a ?? "", { paragraphizeLineBreaks: true })
        }))
    );
    return { tool, introHtml, howHtml, descriptionHtml, faqHtml };
}

export async function generateMetadata(): Promise<Metadata> {
    const tool = await getToolContent(TOOL_CODE);
    if (!tool) {
        return {
            title: "The Forge Inventory Optimizer",
            description: "Optimize your ore inventory for The Forge. Get smart loadout suggestions, maximize damage or defense, and plan efficient batch crafting.",
            alternates: buildAlternates(CANONICAL)
        };
    }

    const title = resolveSeoTitle(tool.seo_title) ?? tool.title ?? undefined;
    const description = tool.meta_description ?? undefined;
    const image = tool.thumb_url || FALLBACK_IMAGE;
    const publishedTime = resolvePublishedAt(tool);
    const modifiedTime = resolveModifiedAt(tool);

    return {
        title,
        description,
        alternates: buildAlternates(CANONICAL),
        openGraph: {
            type: "article",
            url: CANONICAL,
            title,
            description,
            siteName: SITE_NAME,
            images: [image],
            publishedTime: publishedTime ? new Date(publishedTime).toISOString() : undefined,
            modifiedTime: modifiedTime ? new Date(modifiedTime).toISOString() : undefined
        },
        twitter: {
            card: "summary_large_image",
            title,
            description,
            images: [image]
        }
    };
}

export default async function ForgeInventoryOptimizerPage() {
    const { tool, introHtml, howHtml, descriptionHtml, faqHtml } = await buildToolContent();
    const oreDataset = await loadForgeOreDataset();
    const weaponDataset = await loadForgeWeaponDataset();
    const armorDataset = await loadForgeArmorDataset();
    const publishedTime = tool ? resolvePublishedAt(tool) : null;
    const modifiedTime = tool ? resolveModifiedAt(tool) : null;
    const updatedDateValue = modifiedTime;
    const updatedDate = updatedDateValue ? new Date(updatedDateValue) : null;
    const formattedUpdated = updatedDate
        ? updatedDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
        : null;
    const updatedRelativeLabel = updatedDate ? formatDistanceToNow(updatedDate, { addSuffix: true }) : null;
    const fallbackIntro =
        "Optimize your ore inventory for The Forge. Input your available ores and get smart loadout suggestions to maximize damage, defense, or resource efficiency. Plan multiple crafts and make the most of your inventory.";

    const structuredData = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "WebPage",
                name: tool?.title ?? "The Forge Inventory Optimizer",
                description: tool?.meta_description ?? "Optimize ore inventory and get smart loadout suggestions for The Forge.",
                url: CANONICAL,
                datePublished: publishedTime ? new Date(publishedTime).toISOString() : undefined,
                dateModified: modifiedTime ? new Date(modifiedTime).toISOString() : undefined,
                breadcrumb: {
                    "@type": "BreadcrumbList",
                    itemListElement: [
                        { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
                        { "@type": "ListItem", position: 2, name: "Tools", item: `${SITE_URL.replace(/\/$/, "")}/tools` },
                        { "@type": "ListItem", position: 3, name: tool?.title ?? "The Forge Inventory Optimizer" }
                    ]
                },
                mainEntity: {
                    "@type": "WebApplication",
                    name: tool?.title ?? "The Forge Inventory Optimizer",
                    description: tool?.meta_description ?? "Inventory optimizer with loadout suggestions and batch planning.",
                    applicationCategory: "Utility",
                    operatingSystem: "Web",
                    url: CANONICAL
                }
            }
        ]
    };

    return (
        <>
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
            <nav aria-label="Breadcrumb" className="mb-6 text-xs uppercase tracking-[0.25em] text-muted">
                <ol className="flex flex-wrap items-center gap-2">
                    <li className="flex items-center gap-2">
                        <a href="/" className="font-semibold text-muted transition hover:text-accent">
                            Home
                        </a>
                        <span className="text-muted/60">&gt;</span>
                    </li>
                    <li className="flex items-center gap-2">
                        <a href="/tools" className="font-semibold text-muted transition hover:text-accent">
                            Tools
                        </a>
                        <span className="text-muted/60">&gt;</span>
                    </li>
                    <li className="flex items-center gap-2">
                        <span className="font-semibold text-foreground/80">{tool?.title ?? "The Forge Inventory Optimizer"}</span>
                    </li>
                </ol>
            </nav>

            <header className="space-y-3">
                <h1 className="text-4xl font-semibold leading-tight text-foreground md:text-5xl">
                    {tool?.title ?? "The Forge Inventory Optimizer"}
                </h1>
                {formattedUpdated ? (
                    <p className="text-sm text-foreground/80">
                        Updated on <span className="font-semibold text-foreground">{formattedUpdated}</span>
                        {updatedRelativeLabel ? <span>{' '}({updatedRelativeLabel})</span> : null}
                    </p>
                ) : null}
                {introHtml ? (
                    <div className="article-content prose dark:prose-invert game-copy max-w-3xl" dangerouslySetInnerHTML={{ __html: introHtml }} />
                ) : (
                    <p className="max-w-3xl text-base text-muted md:text-lg">{fallbackIntro}</p>
                )}
            </header>

            <ContentSlot
                slot={TOOL_AD_SLOT}
                className="mt-8 w-full"
                adLayout={null}
                adFormat="auto"
                fullWidthResponsive
            />
            <div className="mt-8">
                <ForgeInventoryOptimizerClient
                    ores={oreDataset.ores}
                    weapons={weaponDataset.weapons}
                    armorPieces={armorDataset.armorPieces}
                />
            </div>
            <ContentSlot
                slot={TOOL_AD_SLOT}
                className="my-8 w-full"
                adLayout={null}
                adFormat="auto"
                fullWidthResponsive
            />

            {(descriptionHtml.length || howHtml || faqHtml.length) ? (
                <div className="space-y-6">
                    {descriptionHtml.length ? (
                        <section className="article-content prose dark:prose-invert game-copy max-w-3xl">
                            {descriptionHtml.map((entry) => (
                                <div key={entry.key} dangerouslySetInnerHTML={{ __html: entry.html }} />
                            ))}
                        </section>
                    ) : null}

                    {howHtml ? (
                        <section className="article-content prose dark:prose-invert game-copy max-w-3xl">
                            <div dangerouslySetInnerHTML={{ __html: howHtml }} />
                        </section>
                    ) : null}

                    {faqHtml.length ? (
                        <>
                            <ContentSlot
                                slot={TOOL_AD_SLOT}
                                className="w-full"
                                adLayout={null}
                                adFormat="auto"
                                fullWidthResponsive
                            />
                            <section className="rounded-2xl border border-border/60 bg-surface/40 p-6 shadow-sm">
                                <h2 className="text-lg font-semibold text-foreground">FAQ</h2>
                                <div className="mt-3 space-y-4">
                                    {faqHtml.map((faq, idx) => (
                                        <div key={`${faq.q}-${idx}`} className="rounded-xl border border-border/40 bg-background/60 p-4">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-semibold uppercase tracking-[0.18em] text-muted">Q.</span>
                                                <p className="text-base font-semibold text-foreground">{faq.q}</p>
                                            </div>
                                            <div
                                                className="prose mt-2"
                                                dangerouslySetInnerHTML={{ __html: faq.a }}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </section>
                        </>
                    ) : null}
                </div>
            ) : null}

            {tool?.id ? (
                <div className="mt-10">
                    <CommentsSection entityType="tool" entityId={tool.id} />
                </div>
            ) : null}

            <ContentSlot
                slot={TOOL_AD_SLOT}
                className="mt-8 w-full"
                adLayout={null}
                adFormat="auto"
                fullWidthResponsive
            />
        </>
    );
}
