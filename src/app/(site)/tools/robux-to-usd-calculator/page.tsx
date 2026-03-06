import type { Metadata } from "next";
import { formatDistanceToNow } from "date-fns";
import type { ReactNode } from "react";
import "@/styles/article-content.css";
import { renderMarkdown } from "@/lib/markdown";
import { processHtmlLinks } from "@/lib/link-utils";
import { renderHtmlAsReactNodes } from "@/lib/html-to-react";
import { SITE_NAME, SITE_URL, resolveSeoTitle, buildAlternates } from "@/lib/seo";
import { getToolContent, type ToolContent, type ToolFaqEntry } from "@/lib/tools";
import { ContentSlot } from "@/components/ContentSlot";
import { fetchRobuxBundles } from "./robux-bundles";
import { RobuxPurchaseClient } from "./RobuxPurchaseClient";
import { CommentsSection } from "@/components/comments/CommentsSection";
import { resolveModifiedAt, resolvePublishedAt } from "@/lib/content-dates";
import {
  DEFAULT_HAS_PREMIUM,
  DEFAULT_TARGET_ROBUX,
  DEFAULT_TARGET_USD,
  buildBudgetPlan,
  buildRobuxPlan,
  buildValueBundlePlan,
  selectBestRobuxPlan
} from "./robux-plans";

export const revalidate = 3600; // revalidate every hour to keep SSR/CSR snapshots aligned

const TOOL_CODE = "robux-to-usd-calculator";
const CANONICAL = `${SITE_URL.replace(/\/$/, "")}/tools/robux-to-usd-calculator`;
const FALLBACK_IMAGE = `${SITE_URL}/og-image.png`;
const TOOL_AD_SLOT = "3529946151";

function renderToolNodes(html: string, keyPrefix: string): ReactNode[] {
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

async function buildToolContent(): Promise<{
  tool: ToolContent | null;
  introHtml: string;
  howHtml: string;
  descriptionHtml: Array<{ key: string; html: string }>;
  faqHtml: Array<{ q: string; a: string }>;
}> {
  const tool = (await getToolContent(TOOL_CODE)) ?? null;
  const introHtmlRaw = tool?.intro_md ? await renderMarkdown(tool.intro_md, { paragraphizeLineBreaks: true }) : "";
  const introHtml = introHtmlRaw.replace(/<h[12][^>]*>.*?<\/h[12]>/gis, "");
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

  return {
    tool,
    introHtml,
    howHtml,
    descriptionHtml,
    faqHtml
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const tool = await getToolContent(TOOL_CODE);
  if (!tool) {
    return {
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

export default async function RobloxPurchasePage() {
  const { tool, introHtml, howHtml, descriptionHtml, faqHtml } = await buildToolContent();
  const introNodes = introHtml ? renderToolNodes(introHtml, "tool-intro") : null;
  const descriptionNodes = descriptionHtml.map((entry) => ({
    key: entry.key,
    nodes: renderToolNodes(entry.html, `tool-description-${entry.key}`)
  }));
  const howNodes = howHtml ? renderToolNodes(howHtml, "tool-how") : null;
  const faqNodes = faqHtml.map((faq, idx) => ({
    ...faq,
    nodes: renderToolNodes(faq.a, `tool-faq-${idx}`)
  }));
  const publishedTime = tool ? resolvePublishedAt(tool) : null;
  const modifiedTime = tool ? resolveModifiedAt(tool) : null;
  const updatedDateValue = modifiedTime;
  const updatedDate = updatedDateValue ? new Date(updatedDateValue) : null;
  const formattedUpdated = updatedDate
    ? updatedDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : null;
  const updatedRelativeLabel = updatedDate ? formatDistanceToNow(updatedDate, { addSuffix: true }) : null;
  const bundles = await fetchRobuxBundles();
  const initialRobuxPlanPc = buildRobuxPlan(DEFAULT_TARGET_ROBUX, "pc_web", DEFAULT_HAS_PREMIUM, bundles);
  const initialRobuxPlanMobile = buildRobuxPlan(DEFAULT_TARGET_ROBUX, "mobile", DEFAULT_HAS_PREMIUM, bundles);
  const initialRobuxPlan = selectBestRobuxPlan(initialRobuxPlanPc, initialRobuxPlanMobile);
  const initialValuePlan = buildValueBundlePlan(DEFAULT_TARGET_ROBUX, DEFAULT_HAS_PREMIUM, bundles);
  const initialBudgetPlan = buildBudgetPlan(DEFAULT_TARGET_USD, DEFAULT_HAS_PREMIUM, bundles);

  const faqSchema =
    (tool?.faq_json?.length ?? 0) > 0
      ? tool!.faq_json.map((entry) => ({
          "@type": "Question",
          name: entry.q,
          acceptedAnswer: {
            "@type": "Answer",
            text: entry.a
          }
        }))
      : [];

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        name: tool?.title ?? undefined,
        description: tool?.meta_description ?? undefined,
        url: CANONICAL,
        datePublished: publishedTime ? new Date(publishedTime).toISOString() : undefined,
        dateModified: modifiedTime ? new Date(modifiedTime).toISOString() : undefined,
        breadcrumb: {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
            { "@type": "ListItem", position: 2, name: "Tools", item: `${SITE_URL.replace(/\/$/, "")}/tools` },
            { "@type": "ListItem", position: 3, name: tool?.title ?? "Tool" }
          ]
        },
        mainEntity: {
          "@type": "WebApplication",
          name: tool?.title ?? undefined,
          description: tool?.meta_description ?? undefined,
          applicationCategory: "Calculator",
          operatingSystem: "Web",
          url: CANONICAL
        }
      },
      ...(faqSchema.length
        ? [
            {
              "@type": "FAQPage",
              mainEntity: faqSchema
            }
          ]
        : [])
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
            <span className="font-semibold text-foreground/80">{tool?.title ?? "Tool"}</span>
          </li>
        </ol>
      </nav>
      <header className="space-y-3">
        <h1 className="text-4xl font-semibold leading-tight text-foreground md:text-5xl">
          {tool?.title ?? "Robux to USD Calculator"}
        </h1>
        {formattedUpdated ? (
          <p className="text-sm text-foreground/80">
            Updated on <span className="font-semibold text-foreground">{formattedUpdated}</span>
            {updatedRelativeLabel ? <span>{' '}({updatedRelativeLabel})</span> : null}
          </p>
        ) : null}
      </header>

      <section id="article-body" itemProp="articleBody" className="article-content md-copy-scope copy-with-sidebar-space mt-8 space-y-6">
        {introNodes ? introNodes : null}
        <ContentSlot
          slot={TOOL_AD_SLOT}
          className="mt-8 w-full"
          adLayout={null}
          adFormat="auto"
          fullWidthResponsive
        />
        <div className="mt-8">
          <RobuxPurchaseClient
            bundles={bundles}
            initialRobuxTarget={DEFAULT_TARGET_ROBUX}
            initialUsdTarget={DEFAULT_TARGET_USD}
            initialHasPremium={DEFAULT_HAS_PREMIUM}
            initialRobuxPlan={initialRobuxPlan}
            initialValuePlan={initialValuePlan}
            initialBudgetPlan={initialBudgetPlan}
          />
        </div>
        <ContentSlot
          slot={TOOL_AD_SLOT}
          className="my-8 w-full"
          adLayout={null}
          adFormat="auto"
          fullWidthResponsive
        />
        {(descriptionNodes.length || howNodes || faqNodes.length) ? (
          <>
          {descriptionNodes.length ? descriptionNodes.flatMap((entry) => entry.nodes) : null}
          {howNodes ? howNodes : null}

          {faqNodes.length ? (
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
                  {faqNodes.map((faq, idx) => (
                    <div key={`${faq.q}-${idx}`} className="rounded-xl border border-border/40 bg-background/60 p-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold uppercase tracking-[0.18em] text-muted">Q.</span>
                        <p className="text-base font-semibold text-foreground">{faq.q}</p>
                      </div>
                      <div className="md-copy-scope mt-2">{faq.nodes}</div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          ) : null}
          </>
        ) : null}
      </section>

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
