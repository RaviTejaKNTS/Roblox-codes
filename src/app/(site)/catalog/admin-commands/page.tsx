import type { Metadata } from "next";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import type { ReactNode } from "react";
import "@/styles/article-content.css";
import { renderMarkdown } from "@/lib/markdown";
import { processHtmlLinks } from "@/lib/link-utils";
import { renderHtmlAsReactNodes } from "@/lib/html-to-react";
import { getCatalogPageContentByCodes } from "@/lib/catalog";
import { ADMIN_COMMANDS_DESCRIPTION, resolveSeoTitle, SITE_NAME, SITE_URL, buildAlternates } from "@/lib/seo";
import { loadAdminCommandDatasets } from "@/lib/admin-commands";
import { CommentsSection } from "@/components/comments/CommentsSection";

export const revalidate = 86400;

const CANONICAL = `${SITE_URL.replace(/\/$/, "")}/catalog/admin-commands`;
const CATALOG_CODE_CANDIDATES = ["admin-commands"];

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

async function buildCatalogContent(): Promise<{ contentHtml: CatalogContentHtml | null }> {
  const catalog = await getCatalogPageContentByCodes(CATALOG_CODE_CANDIDATES);
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

  const faqEntries = Array.isArray(catalog.faq_json) ? catalog.faq_json : [];
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

export async function generateMetadata(): Promise<Metadata> {
  const catalog = await getCatalogPageContentByCodes(CATALOG_CODE_CANDIDATES);
  const title =
    resolveSeoTitle(catalog?.seo_title) ??
    catalog?.title ??
    `Roblox Admin Commands | ${SITE_NAME}`;
  const description = catalog?.meta_description ?? ADMIN_COMMANDS_DESCRIPTION;

  return {
    title,
    description,
    alternates: buildAlternates(CANONICAL),
    openGraph: {
      type: "website",
      url: CANONICAL,
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

export default async function AdminCommandsHubPage() {
  const [{ contentHtml }, datasets] = await Promise.all([
    buildCatalogContent(),
    loadAdminCommandDatasets()
  ]);
  const title = contentHtml?.title?.trim() ? contentHtml.title.trim() : "Roblox admin commands";
  const introHtml = contentHtml?.introHtml?.trim() ? contentHtml.introHtml : "";
  const howHtml = contentHtml?.howHtml?.trim() ? contentHtml.howHtml : "";
  const descriptionHtml = contentHtml?.descriptionHtml ?? [];
  const faqHtml = contentHtml?.faqHtml ?? [];
  const introNodes = introHtml ? renderCatalogNodes(introHtml, "admin-intro") : null;
  const descriptionNodes = descriptionHtml.flatMap((entry) =>
    renderCatalogNodes(entry.html, `admin-description-${entry.key}`)
  );
  const howNodes = howHtml ? renderCatalogNodes(howHtml, "admin-how") : null;
  const faqNodes = faqHtml.map((faq, idx) => ({
    ...faq,
    nodes: renderCatalogNodes(faq.a, `admin-faq-${idx}`)
  }));
  const showCta = Boolean(contentHtml?.ctaLabel && contentHtml?.ctaUrl);
  const updatedDateValue = contentHtml?.updatedAt ?? null;
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
            <Link href="/" className="font-semibold text-muted transition hover:text-accent">
              Home
            </Link>
            <span className="text-muted/60">&gt;</span>
          </li>
          <li className="flex items-center gap-2">
            <Link href="/catalog" className="font-semibold text-muted transition hover:text-accent">
              Catalog
            </Link>
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

        {datasets.length ? (
          <section className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {datasets.map((dataset) => (
                <Link
                  key={dataset.system.slug}
                  href={`/catalog/admin-commands/${dataset.system.slug}`}
                  aria-label={`${dataset.system.name} commands`}
                  className="block h-full"
                >
                  <article className="group relative overflow-hidden rounded-2xl border border-border/60 bg-surface/80 px-5 py-4 transition hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-soft">
                    <span
                      aria-hidden
                      className="absolute inset-x-0 top-0 h-1 bg-accent/30 transition group-hover:bg-accent/60"
                    />
                    <div className="flex h-full flex-col gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-lg font-semibold text-foreground">{dataset.system.name}</p>
                      </div>
                      <p className="text-sm text-muted">{dataset.system.cardDescription}</p>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                        {dataset.commandCount.toLocaleString("en-US")} commands
                      </p>
                    </div>
                  </article>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {descriptionNodes.length ? descriptionNodes : null}

        {howNodes ? howNodes : null}

        {showCta ? (
          <p data-md-copy className="md-copy-node md-copy-p">
            <a
              href={contentHtml?.ctaUrl ?? "#"}
              className="inline-flex items-center justify-center rounded-full bg-foreground px-5 py-2 text-sm font-semibold text-background transition hover:opacity-90"
            >
              {contentHtml?.ctaLabel}
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
