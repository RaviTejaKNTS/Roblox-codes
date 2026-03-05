import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import "@/styles/article-content.css";
import { AuthorCard } from "@/components/AuthorCard";
import { SocialShare } from "@/components/SocialShare";
import { CodeBlockEnhancer } from "@/components/CodeBlockEnhancer";
import { renderMarkdown, markdownToPlainText } from "@/lib/markdown";
import { processHtmlLinks } from "@/lib/link-utils";
import { buildImageGalleries } from "@/lib/article-galleries";
import { authorAvatarUrl } from "@/lib/avatar";
import { collectAuthorSocials } from "@/lib/author-socials";
import {
  ARTICLES_DESCRIPTION,
  CHECKLISTS_DESCRIPTION,
  EVENTS_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
  breadcrumbJsonLd,
  howToJsonLd,
  resolveSeoTitle,
  buildAlternates,
} from "@/lib/seo";
import {
  getArticleBySlug,
  getEventsPageByUniverseId,
  type ArticleWithRelations,
  type Author,
  listPublishedArticleSlugs,
  listPublishedArticlesByUniverseId,
  listPublishedArticlesPage,
  listPublishedChecklistsByUniverseId,
  listGamesWithActiveCountsByUniverseId
} from "@/lib/db";
import { extractHowToSteps } from "@/lib/how-to";
import { ChecklistCard } from "@/components/ChecklistCard";
import { GameCard } from "@/components/GameCard";
import { ArticleCard } from "@/components/ArticleCard";
import { ToolCard } from "@/components/ToolCard";
import { EventsPageCard, type EventsPageCardProps } from "@/components/EventsPageCard";
import { listPublishedToolsByUniverseId, type ToolListEntry } from "@/lib/tools";
import { ContentSlot } from "@/components/ContentSlot";
import { ArticleImageLightbox } from "@/components/ArticleImageLightbox";
import { CommentsSection } from "@/components/comments/CommentsSection";
import { formatUpdatedLabel } from "@/lib/updated-label";
import { getUniverseEventSummary } from "@/lib/events-summary";
import { resolveModifiedAt, resolvePublishedAt } from "@/lib/content-dates";

export const revalidate = 604800; // weekly
const MAX_STATIC_ARTICLE_SLUGS = 150;

type Params = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const slugs = await listPublishedArticleSlugs();
  return slugs.slice(0, MAX_STATIC_ARTICLE_SLUGS).map((slug) => ({ slug }));
}

function collectAuthorSameAs(author?: Author | null): string[] {
  if (!author) return [];
  const socials = collectAuthorSocials(author);
  return Array.from(new Set(socials.map((link) => link.url)));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article) return {};

  const canonicalUrl = `${SITE_URL}/articles/${article.slug}`;
  const coverImage = article.cover_image?.startsWith("http")
    ? article.cover_image
    : article.cover_image
    ? `${SITE_URL.replace(/\/$/, "")}/${article.cover_image.replace(/^\//, "")}`
    : `${SITE_URL}/og-image.png`;
  const description =
    (article.meta_description || markdownToPlainText(article.content_md)).trim() || ARTICLES_DESCRIPTION;
  const title = resolveSeoTitle(article.seo_title) ?? article.title;
  const universeName = article.universe?.display_name ?? article.universe?.name ?? null;
  const publishedAt = resolvePublishedAt(article);
  const modifiedAt = resolveModifiedAt(article);

  return {
    title,
    description,
    alternates: buildAlternates(canonicalUrl),
    category: universeName ?? "Gaming",
    openGraph: {
      type: "article",
      url: canonicalUrl,
      title,
      description,
      siteName: SITE_NAME,
      images: [coverImage],
      publishedTime: publishedAt ? new Date(publishedAt).toISOString() : undefined,
      modifiedTime: modifiedAt ? new Date(modifiedAt).toISOString() : undefined,
      authors: article.author ? [article.author.name] : undefined
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [coverImage]
    }
  };
}

export default async function ArticlePage({ params }: Params) {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article) {
    notFound();
  }
  return renderArticlePage(article);
}

async function renderArticlePage(article: ArticleWithRelations) {
  const canonicalUrl = `${SITE_URL}/articles/${article.slug}`;
  const coverImage = article.cover_image?.startsWith("http")
    ? article.cover_image
    : article.cover_image
    ? `${SITE_URL.replace(/\/$/, "")}/${article.cover_image.replace(/^\//, "")}`
    : null;
  const descriptionPlain = (article.meta_description || markdownToPlainText(article.content_md)).trim();
  const [articleHtml, authorBioHtml] = await Promise.all([
    renderMarkdown(article.content_md),
    article.author?.bio_md ? renderMarkdown(article.author.bio_md) : Promise.resolve("")
  ]);

  const universeId = (article as any).universe_id ?? null;
  const universeLabel = article.universe?.display_name ?? article.universe?.name ?? article.title;
  const relatedTools: ToolListEntry[] = universeId ? await listPublishedToolsByUniverseId(universeId, 3) : [];
  const relatedEventsPage = universeId ? await getEventsPageByUniverseId(universeId) : null;
  const eventSummary = universeId ? await getUniverseEventSummary(universeId) : null;

  // Prefer articles in the same universe; fall back to latest articles if none
  let relatedArticles: ArticleWithRelations[] = [];
  let relatedFromUniverse = false;
  if (universeId) {
    const sameUniverse = await listPublishedArticlesByUniverseId(universeId, 6, 0);
    relatedArticles = sameUniverse.filter((entry) => entry.id !== article.id).slice(0, 5);
    relatedFromUniverse = relatedArticles.length > 0;
  }
  if (!relatedArticles.length) {
    const { articles: latestArticles } = await listPublishedArticlesPage(1, 5);
    relatedArticles = latestArticles.filter((entry) => entry.id !== article.id).slice(0, 5);
  }
  const relatedHeading = relatedArticles.length
    ? relatedFromUniverse
      ? `${universeLabel} articles`
      : "Latest articles"
    : null;
  const authorAvatar = article.author ? authorAvatarUrl(article.author, 72) : null;
  const publishedAt = resolvePublishedAt(article) ?? article.created_at;
  const modifiedAt = resolveModifiedAt(article) ?? article.updated_at ?? publishedAt;
  const publishedDate = new Date(publishedAt);
  const updatedDate = new Date(modifiedAt);
  const formattedUpdated = updatedDate.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  });
  const updatedRelativeLabel = formatDistanceToNow(updatedDate, { addSuffix: true });
  const publishedIso = publishedDate.toISOString();
  const updatedIso = updatedDate.toISOString();
  const authorProfileUrl = article.author?.slug ? `${SITE_URL.replace(/\/$/, "")}/authors/${article.author.slug}` : null;
  const authorSameAs = collectAuthorSameAs(article.author);
  const authorBioPlain = article.author?.bio_md ? markdownToPlainText(article.author.bio_md) : null;
  const universeName = article.universe?.display_name ?? article.universe?.name ?? null;
  const breadcrumbLeaf = universeName ?? article.title;
  const breadcrumbItems = [
    { label: "Home", href: "/" },
    { label: "Articles", href: "/articles" },
    { label: breadcrumbLeaf, href: null }
  ];
  const breadcrumbData = JSON.stringify(
    breadcrumbJsonLd([
      { name: "Home", url: SITE_URL },
      { name: "Articles", url: `${SITE_URL}/articles` },
      { name: article.title, url: canonicalUrl }
    ])
  );
  const howToSteps = extractHowToSteps(article.content_md);
  const articleHowToData = howToSteps.length
    ? JSON.stringify(
        howToJsonLd({
          siteUrl: SITE_URL,
          subject: { name: article.title, slug: `articles/${article.slug}` },
          steps: howToSteps,
          title: article.title,
          description: `Step-by-step guide derived from "${article.title}".`
        })
      )
    : null;

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    mainEntityOfPage: canonicalUrl,
    headline: article.title,
    articleSection: universeName ?? undefined,
    description: descriptionPlain,
    datePublished: publishedIso,
    dateModified: updatedIso,
    image: coverImage ?? `${SITE_URL}/og-image.png`,
    author: article.author
      ? {
          '@type': 'Person',
          name: article.author.name,
          url: authorProfileUrl ?? undefined,
          sameAs: authorSameAs.length ? authorSameAs : undefined
        }
      : {
          '@type': 'Organization',
          name: SITE_NAME
        },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_URL,
      logo: {
        '@type': 'ImageObject',
        url: `${SITE_URL}/Bloxodes-dark.png`
      }
    }
  };

  const processedArticleHtml = processHtmlLinks(articleHtml);
  const articleHtmlWithGalleries = buildImageGalleries(processedArticleHtml.__html);
  const processedAuthorBioHtml = authorBioHtml ? processHtmlLinks(authorBioHtml) : null;

  const relatedChecklists = universeId ? await listPublishedChecklistsByUniverseId(universeId, 1) : [];
  const relatedCodes = universeId ? await listGamesWithActiveCountsByUniverseId(universeId, 1) : [];
  const relatedChecklistCards = relatedChecklists.map((row) => {
    const summaryPlain =
      markdownToPlainText(row.seo_description ?? row.description_md ?? "") || CHECKLISTS_DESCRIPTION;
    const itemsCount =
      typeof row.leaf_item_count === "number"
        ? row.leaf_item_count
        : typeof row.item_count === "number"
          ? row.item_count
          : null;
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      summary: summaryPlain,
      universeName: row.universe?.display_name ?? row.universe?.name ?? null,
      coverImage: row.universe?.icon_url ?? `${SITE_URL}/og-image.png`,
      updatedAt: row.updated_at || row.published_at || row.created_at || null,
      itemsCount
    };
  });
  const eventsSummary = relatedEventsPage?.meta_description?.trim() || EVENTS_DESCRIPTION;
  const eventsUpdatedLabel = relatedEventsPage
    ? formatUpdatedLabel(relatedEventsPage.updated_at || relatedEventsPage.published_at || relatedEventsPage.created_at)
    : null;
  const eventsCard: EventsPageCardProps | null =
    relatedEventsPage && relatedEventsPage.slug
      ? {
          slug: relatedEventsPage.slug,
          title: relatedEventsPage.title,
          summary: eventsSummary,
          universeName:
            relatedEventsPage.universe?.display_name ??
            relatedEventsPage.universe?.name ??
            universeLabel,
          coverImage: null,
          fallbackIcon: relatedEventsPage.universe?.icon_url ?? null,
          eventName: eventSummary?.featured?.name ?? null,
          eventTimeLabel: eventSummary?.featured?.timeLabel ?? null,
          status: (eventSummary?.featured?.status ?? "none") as EventsPageCardProps["status"],
          counts: eventSummary?.counts ?? { upcoming: 0, current: 0, past: 0 },
          updatedLabel: eventsUpdatedLabel
        }
      : null;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,1.25fr)]">
      <article className="min-w-0">
        <header className="mb-6 space-y-3">
          <nav aria-label="Breadcrumb" className="text-xs uppercase tracking-[0.25em] text-muted">
            <ol className="flex flex-wrap items-center gap-2">
              {breadcrumbItems.map((item, index) => (
                <li key={`${item.label}-${index}`} className="flex items-center gap-2">
                  {item.href ? (
                    <Link href={item.href} className="font-semibold text-muted transition hover:text-accent">
                      {item.label}
                    </Link>
                  ) : (
                    <span className="font-semibold text-foreground/80">{item.label}</span>
                  )}
                  {index < breadcrumbItems.length - 1 ? <span className="text-muted/60">&gt;</span> : null}
                </li>
              ))}
            </ol>
          </nav>
          <h1 className="text-4xl font-bold text-foreground md:text-5xl" itemProp="headline">
            {article.title}
          </h1>
          <div className="flex flex-col gap-3 text-sm text-muted">
            <div className="flex flex-wrap items-center gap-2">
              {article.author ? (
                <div className="flex items-center gap-2" itemProp="author" itemScope itemType="https://schema.org/Person">
                  {authorProfileUrl ? <link itemProp="url" href={authorProfileUrl} /> : null}
                  {authorBioPlain ? <meta itemProp="description" content={authorBioPlain} /> : null}
                  {authorSameAs.map((url) => (
                    <link key={url} itemProp="sameAs" href={url} />
                  ))}
                  <img
                    src={authorAvatar || "https://www.gravatar.com/avatar/?d=mp"}
                    alt={article.author.name}
                    className="h-9 w-9 rounded-full border border-border/40 object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                  <span>
                    Authored by {article.author.slug ? (
                      <Link
                        href={`/authors/${article.author.slug}`}
                        className="font-semibold text-foreground transition hover:text-accent"
                        itemProp="name"
                        data-analytics-event="author_click"
                        data-analytics-codes-url={canonicalUrl}
                        data-analytics-author-url={`/authors/${article.author.slug}`}
                      >
                        {article.author.name}
                      </Link>
                    ) : (
                      <span className="font-semibold text-foreground" itemProp="name">
                        {article.author.name}
                      </span>
                    )}
                  </span>
                </div>
              ) : (
                <span className="font-semibold text-foreground" itemProp="author">
                  Published by {SITE_NAME}
                </span>
              )}
              <span aria-hidden="true">•</span>
              <span className="text-foreground/80">
                Updated on <span className="font-semibold text-foreground">{formattedUpdated}</span>
                {updatedRelativeLabel ? <span>{' '}({updatedRelativeLabel})</span> : null}
              </span>
            </div>
          </div>
        </header>

        <section
          id="article-body"
          itemProp="articleBody"
          className="article-content prose dark:prose-invert max-w-none game-copy"
          dangerouslySetInnerHTML={{ __html: articleHtmlWithGalleries }}
        />
        <ArticleImageLightbox />

        {article.author ? (
          <AuthorCard author={article.author} bioHtml={processedAuthorBioHtml ?? ""} />
        ) : null}

        <div className="mt-10">
          <CommentsSection entityType="article" entityId={article.id} />
        </div>

        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
        {articleHowToData ? (
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: articleHowToData }} />
        ) : null}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: breadcrumbData }} />
      <CodeBlockEnhancer />
      </article>

      <aside className="space-y-4">
        <section className="space-y-3">
          <SocialShare
            url={canonicalUrl}
            title={article.title}
            heading="Share this article"
            analytics={{ contentType: "article", itemId: article.slug }}
          />
        </section>
        <ContentSlot
          slot="4767824441"
          className="w-full"
          adLayout={null}
          adFormat="auto"
          fullWidthResponsive
          minHeight="clamp(280px, 40vw, 600px)"
        />

        {relatedCodes.length ? (
          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-foreground">Codes for {universeLabel}</h3>
            <div className="grid gap-3">
              {relatedCodes.map((g) => (
                <div
                  key={g.id}
                  className="block"
                  data-analytics-event="related_content_click"
                  data-analytics-source-type="article_sidebar"
                  data-analytics-target-type="codes"
                  data-analytics-target-slug={g.slug}
                >
                  <GameCard game={g} titleAs="p" />
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {eventsCard ? (
          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-foreground">Events for {universeLabel}</h3>
            <div className="space-y-3">
              <div
                className="block"
                data-analytics-event="related_content_click"
                data-analytics-source-type="article_sidebar"
                data-analytics-target-type="event"
                data-analytics-target-slug={eventsCard.slug}
              >
                <EventsPageCard {...eventsCard} />
              </div>
            </div>
          </section>
        ) : null}

        {relatedChecklistCards.length ? (
          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-foreground">{universeLabel} checklist</h3>
            <div className="space-y-3">
              {relatedChecklistCards.map((card) => (
                <div
                  key={card.id}
                  className="block"
                  data-analytics-event="related_content_click"
                  data-analytics-source-type="article_sidebar"
                  data-analytics-target-type="checklist"
                  data-analytics-target-slug={card.slug}
                >
                  <ChecklistCard {...card} />
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {relatedArticles.length ? (
          <section className="space-y-3">
            {relatedHeading ? <h3 className="text-lg font-semibold text-foreground">{relatedHeading}</h3> : null}
            <div className="space-y-4">
              {relatedArticles.slice(0, 5).map((item) => (
                <div
                  key={item.id}
                  className="block"
                  data-analytics-event="related_content_click"
                  data-analytics-source-type="article_sidebar"
                  data-analytics-target-type="article"
                  data-analytics-target-slug={item.slug}
                >
                  <ArticleCard article={item} />
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {relatedTools.length ? (
          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-foreground">Tools for {universeLabel}</h3>
            <div className="space-y-4">
              {relatedTools.map((tool) => (
                <div
                  key={tool.id ?? tool.code}
                  className="block"
                  data-analytics-event="related_content_click"
                  data-analytics-source-type="article_sidebar"
                  data-analytics-target-type="tool"
                  data-analytics-target-slug={tool.code}
                >
                  <ToolCard tool={tool} />
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </aside>
    </div>
  );
}
