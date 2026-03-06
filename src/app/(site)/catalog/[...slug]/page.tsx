import type { Metadata } from "next";
import { formatDistanceToNow } from "date-fns";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import "@/styles/article-content.css";
import { renderMarkdown } from "@/lib/markdown";
import { processHtmlLinks } from "@/lib/link-utils";
import { renderHtmlAsReactNodes } from "@/lib/html-to-react";
import { getCatalogPageContentByCodes, listPublishedCatalogCodes, type CatalogFaqEntry } from "@/lib/catalog";
import { CATALOG_DESCRIPTION, SITE_NAME, SITE_URL, resolveSeoTitle, buildAlternates } from "@/lib/seo";
import { CommentsSection } from "@/components/comments/CommentsSection";
import { splitPathToSlug } from "@/lib/static-params";

export const revalidate = 86400;
const RESERVED_CATALOG_PREFIXES = ["admin-commands", "roblox-decal-ids", "roblox-free-items", "roblox-music-ids", "the-forge"];

type PageProps = {
  params: Promise<{ slug: string[] }>;
};

export async function generateStaticParams() {
  const codes = await listPublishedCatalogCodes();
  return codes
    .map((code) => code.trim().toLowerCase())
    .filter((code) => code.length > 0)
    .filter((code) => !RESERVED_CATALOG_PREFIXES.some((prefix) => code === prefix || code.startsWith(`${prefix}/`)))
    .map((code) => ({ slug: splitPathToSlug(code) }));
}

type CatalogContentHtml = {
  id?: string | null;
  title: string | null;
  introHtml: string;
  howHtml: string;
  descriptionHtml: Array<{ key: string; html: string }>;
  faqHtml: Array<{ q: string; a: string }>;
  updatedAt: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
};

function renderCatalogNodes(html: string, keyPrefix: string): ReactNode[] {
  return renderHtmlAsReactNodes(processHtmlLinks(html).__html, { keyPrefix });
}

function normalizeCatalogCode(slugParts: string[]): string {
  return slugParts
    .map((part) => part.trim())
    .filter(Boolean)
    .join("/")
    .toLowerCase();
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

async function buildCatalogContent(code: string): Promise<{ contentHtml: CatalogContentHtml | null }> {
  const catalog = await getCatalogPageContentByCodes([code]);
  if (!catalog) {
    return { contentHtml: null };
  }

  const introHtml = catalog.intro_md ? await renderMarkdown(catalog.intro_md, { paragraphizeLineBreaks: true }) : "";
  const howHtml = catalog.how_it_works_md ? await renderMarkdown(catalog.how_it_works_md, { paragraphizeLineBreaks: true }) : "";

  const descriptionEntries = sortDescriptionEntries(catalog.description_json ?? {});
  const descriptionHtml = await Promise.all(
    descriptionEntries.map(async ([key, value]) => ({
      key,
      html: await renderMarkdown(value ?? "", { paragraphizeLineBreaks: true })
    }))
  );

  const faqEntries: CatalogFaqEntry[] = Array.isArray(catalog.faq_json) ? catalog.faq_json : [];
  const faqHtml = await Promise.all(
    faqEntries.map(async (entry) => ({
      q: entry.q,
      a: await renderMarkdown(entry.a ?? "", { paragraphizeLineBreaks: true })
    }))
  );

  return {
    contentHtml: {
      id: catalog.id ?? null,
      title: catalog.title ?? null,
      introHtml,
      howHtml,
      descriptionHtml,
      faqHtml,
      updatedAt: catalog.content_updated_at ?? catalog.updated_at ?? catalog.published_at ?? catalog.created_at ?? null,
      ctaLabel: catalog.cta_label ?? null,
      ctaUrl: catalog.cta_url ?? null
    }
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const code = normalizeCatalogCode(slug ?? []);
  const canonical = `${SITE_URL.replace(/\/$/, "")}/catalog/${code}`;
  if (!code) {
    return {
      alternates: buildAlternates(`${SITE_URL.replace(/\/$/, "")}/catalog`)
    };
  }

  const catalog = await getCatalogPageContentByCodes([code]);
  if (!catalog) {
    return {
      alternates: buildAlternates(canonical)
    };
  }

  const title = resolveSeoTitle(catalog.seo_title) ?? catalog.title ?? `Roblox Catalogs | ${SITE_NAME}`;
  const description = catalog.meta_description ?? CATALOG_DESCRIPTION;
  const image = catalog.thumb_url || `${SITE_URL}/og-image.png`;

  return {
    title,
    description,
    alternates: buildAlternates(canonical),
    openGraph: {
      type: "website",
      url: canonical,
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

export default async function CatalogFallbackPage({ params }: PageProps) {
  const { slug } = await params;
  const code = normalizeCatalogCode(slug ?? []);
  if (!code) {
    notFound();
  }

  const { contentHtml } = await buildCatalogContent(code);
  if (!contentHtml) {
    notFound();
  }

  const title = contentHtml.title?.trim() ? contentHtml.title.trim() : "Roblox catalog";
  const introHtml = contentHtml.introHtml?.trim() ? contentHtml.introHtml : "";
  const howHtml = contentHtml.howHtml?.trim() ? contentHtml.howHtml : "";
  const descriptionHtml = contentHtml.descriptionHtml ?? [];
  const faqHtml = contentHtml.faqHtml ?? [];
  const introNodes = introHtml ? renderCatalogNodes(introHtml, "catalog-intro") : null;
  const descriptionNodes = descriptionHtml.map((entry) => ({
    key: entry.key,
    nodes: renderCatalogNodes(entry.html, `catalog-description-${entry.key}`)
  }));
  const howNodes = howHtml ? renderCatalogNodes(howHtml, "catalog-how") : null;
  const faqNodes = faqHtml.map((faq, idx) => ({
    ...faq,
    nodes: renderCatalogNodes(faq.a, `catalog-faq-${idx}`)
  }));
  const showCta = Boolean(contentHtml.ctaLabel && contentHtml.ctaUrl);
  const updatedDateValue = contentHtml.updatedAt ?? null;
  const updatedDate = updatedDateValue ? new Date(updatedDateValue) : null;
  const formattedUpdated = updatedDate
    ? updatedDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : null;
  const updatedRelativeLabel = updatedDate ? formatDistanceToNow(updatedDate, { addSuffix: true }) : null;

  return (
    <div className="space-y-10">
      <nav aria-label="Breadcrumb" className="text-xs uppercase tracking-[0.25em] text-muted">
        <ol className="flex flex-wrap items-center gap-2">
          <li className="flex items-center gap-2">
            <a href="/" className="font-semibold text-muted transition hover:text-accent">
              Home
            </a>
            <span className="text-muted/60">&gt;</span>
          </li>
          <li className="flex items-center gap-2">
            <a href="/catalog" className="font-semibold text-muted transition hover:text-accent">
              Catalog
            </a>
            <span className="text-muted/60">&gt;</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="font-semibold text-foreground/80">{title}</span>
          </li>
        </ol>
      </nav>
      <header className="space-y-3">
        <h1 className="text-4xl font-semibold leading-tight text-foreground md:text-5xl">{title}</h1>
        {formattedUpdated ? (
          <p className="text-sm text-foreground/80">
            Updated on <span className="font-semibold text-foreground">{formattedUpdated}</span>
            {updatedRelativeLabel ? <span>{' '}({updatedRelativeLabel})</span> : null}
          </p>
        ) : null}
      </header>

      <section id="article-body" itemProp="articleBody" className="article-content md-copy-scope copy-with-sidebar-space space-y-6">
        {introNodes ? introNodes : null}

        {descriptionNodes.length ? descriptionNodes.flatMap((entry) => entry.nodes) : null}

        {howNodes ? howNodes : null}

        {showCta ? (
          <p data-md-copy className="md-copy-node md-copy-p">
            <a
              href={contentHtml.ctaUrl ?? "#"}
              className="inline-flex items-center justify-center rounded-full bg-foreground px-5 py-2 text-sm font-semibold text-background transition hover:opacity-90"
            >
              {contentHtml.ctaLabel}
            </a>
          </p>
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
      </section>

      {contentHtml?.id ? (
        <div className="mt-10">
          <CommentsSection entityType="catalog" entityId={contentHtml.id} />
        </div>
      ) : null}
    </div>
  );
}
