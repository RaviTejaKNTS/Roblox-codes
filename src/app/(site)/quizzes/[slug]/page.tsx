import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import "@/styles/article-content.css";
import { QuizRunner } from "@/components/QuizRunner";
import { GameCard } from "@/components/GameCard";
import { ArticleCard } from "@/components/ArticleCard";
import { ToolCard } from "@/components/ToolCard";
import { getQuizPageByCode, listPublishedQuizCodes, loadQuizData } from "@/lib/quizzes";
import { listGamesWithActiveCountsByUniverseId, listPublishedArticlesByUniverseId } from "@/lib/db";
import { listPublishedToolsByUniverseId } from "@/lib/tools";
import { listPublishedCatalogPagesByUniverseId } from "@/lib/catalog";
import { markdownToPlainText, renderMarkdown } from "@/lib/markdown";
import type { QuizData } from "@/lib/quiz-types";
import { QUIZZES_DESCRIPTION, SITE_NAME, SITE_URL, resolveSeoTitle, buildAlternates } from "@/lib/seo";

export const revalidate = 3600; // 1 hour

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  const slugs = await listPublishedQuizCodes();
  return slugs.map((slug) => ({ slug }));
}

function pickThumbnail(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry === "string" && entry.trim()) return entry;
      if (entry && typeof entry === "object" && "url" in entry) {
        const url = (entry as { url?: unknown }).url;
        if (typeof url === "string" && url.trim()) return url;
      }
    }
  }
  return null;
}

function summarize(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  const normalized = markdownToPlainText(value).replace(/\s+/g, " ").trim();
  if (!normalized) return fallback;
  if (normalized.length <= 140) return normalized;
  const slice = normalized.slice(0, 137);
  const lastSpace = slice.lastIndexOf(" ");
  return `${lastSpace > 80 ? slice.slice(0, lastSpace) : slice}…`;
}

function buildCatalogHref(code: string): string {
  const normalized = code
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `/catalog/${normalized}`;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = await getQuizPageByCode(slug);
  if (!page) return {};

  const titleBase = resolveSeoTitle(page.seo_title) ?? page.title;
  const description =
    page.seo_description ||
    (page.description_md ? markdownToPlainText(page.description_md).slice(0, 160) : QUIZZES_DESCRIPTION);
  const canonical = `${SITE_URL}/quizzes/${page.code}`;
  const thumb = pickThumbnail(page.universe?.thumbnail_urls);
  const image = thumb || page.universe?.icon_url || `${SITE_URL}/og-image.png`;

  return {
    title: `${titleBase} | ${SITE_NAME}`,
    description,
    alternates: buildAlternates(canonical),
    openGraph: {
      type: "website",
      url: canonical,
      title: titleBase,
      description,
      siteName: SITE_NAME,
      images: [image]
    },
    twitter: {
      card: "summary_large_image",
      title: titleBase,
      description,
      images: [image]
    }
  };
}

export default async function QuizPage({ params }: PageProps) {
  const { slug } = await params;
  const page = await getQuizPageByCode(slug);
  if (!page) {
    notFound();
  }

  const quizData = await loadQuizData(page.code);
  if (!quizData) {
    notFound();
  }

  const description = page.description_md
    ? markdownToPlainText(page.description_md).replace(/\s+/g, " ").trim()
    : null;
  const descriptionHtml = page.description_md
    ? await renderMarkdown(page.description_md, { paragraphizeLineBreaks: true })
    : "";
  const aboutHtml = page.about_md
    ? await renderMarkdown(page.about_md, { paragraphizeLineBreaks: true })
    : "";
  const heroImage = pickThumbnail(page.universe?.thumbnail_urls) || page.universe?.icon_url || null;
  const gameName = page.universe?.display_name ?? page.universe?.name ?? page.title;
  const heroAlt = `${gameName} Quiz Thumbnail`;
  const canonical = `${SITE_URL}/quizzes/${page.code}`;
  const publishedTime = page.published_at || page.created_at || null;
  const modifiedTime = page.content_updated_at || page.updated_at || publishedTime || null;
  const updatedDateValue = modifiedTime;
  const updatedDate = updatedDateValue ? new Date(updatedDateValue) : null;
  const formattedUpdated = updatedDate
    ? updatedDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : null;
  const updatedRelativeLabel = updatedDate ? formatDistanceToNow(updatedDate, { addSuffix: true }) : null;
  const universeId = page.universe_id ?? null;
  const universeLabel = page.universe?.display_name ?? page.universe?.name ?? page.title;

  const [relatedCodes, relatedArticles, relatedTools, relatedCatalogPagesRaw] = universeId
    ? await Promise.all([
        listGamesWithActiveCountsByUniverseId(universeId, 2),
        listPublishedArticlesByUniverseId(universeId, 3, 0),
        listPublishedToolsByUniverseId(universeId, 2),
        listPublishedCatalogPagesByUniverseId(universeId, 2)
      ])
    : [[], [], [], []];

  const relatedCatalogPages = relatedCatalogPagesRaw
    .filter((entry) => typeof entry.code === "string" && entry.code.trim().length > 0)
    .slice(0, 2);
  const showRecommendations =
    relatedCodes.length > 0 ||
    relatedArticles.length > 0 ||
    relatedTools.length > 0 ||
    relatedCatalogPages.length > 0;

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        name: page.title,
        description: description ?? QUIZZES_DESCRIPTION,
        url: canonical,
        datePublished: publishedTime ? new Date(publishedTime).toISOString() : undefined,
        dateModified: modifiedTime ? new Date(modifiedTime).toISOString() : undefined,
        breadcrumb: {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
            { "@type": "ListItem", position: 2, name: "Quizzes", item: `${SITE_URL}/quizzes` },
            { "@type": "ListItem", position: 3, name: page.title }
          ]
        },
        mainEntity: { "@id": `${canonical}#quizapp` }
      },
      {
        "@type": "WebApplication",
        "@id": `${canonical}#quizapp`,
        name: page.title,
        description: description ?? QUIZZES_DESCRIPTION,
        url: canonical,
        applicationCategory: "EducationalApplication",
        operatingSystem: "Web",
        inLanguage: "en",
        image: heroImage ? [heroImage] : undefined,
        isPartOf: {
          "@type": "WebSite",
          name: SITE_NAME,
          url: SITE_URL
        }
      }
    ]
  };

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-6 text-xs uppercase tracking-[0.25em] text-muted">
        <ol className="flex flex-wrap items-center gap-2">
          <li className="flex items-center gap-2">
            <a href="/" className="font-semibold text-muted transition hover:text-accent">
              Home
            </a>
            <span className="text-muted/60">&gt;</span>
          </li>
          <li className="flex items-center gap-2">
            <a href="/quizzes" className="font-semibold text-muted transition hover:text-accent">
              Quizzes
            </a>
            <span className="text-muted/60">&gt;</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="font-semibold text-foreground/80">{page.title}</span>
          </li>
        </ol>
      </nav>
      <header className="mb-6 space-y-3">
        <h1 className="text-4xl font-semibold leading-tight text-foreground md:text-5xl">{page.title}</h1>
        {formattedUpdated ? (
          <p className="text-sm text-foreground/80">
            Updated on <span className="font-semibold text-foreground">{formattedUpdated}</span>
            {updatedRelativeLabel ? <span>{' '}({updatedRelativeLabel})</span> : null}
          </p>
        ) : null}
        {descriptionHtml ? (
          <div
            className="article-content prose dark:prose-invert game-copy max-w-3xl"
            dangerouslySetInnerHTML={{ __html: descriptionHtml }}
          />
        ) : description ? (
          <p className="max-w-3xl text-sm text-muted md:text-base">{description}</p>
        ) : null}
      </header>
      <QuizRunner
        quizCode={page.code}
        questions={quizData}
        heroImage={heroImage}
        heroAlt={heroAlt}
      />
      {aboutHtml ? (
        <section className="mt-10 border-t border-border/60 pt-6" id="about">
          <div
            className="article-content prose dark:prose-invert max-w-none game-copy"
            dangerouslySetInnerHTML={{ __html: aboutHtml }}
          />
        </section>
      ) : null}

      {showRecommendations ? (
        <section className="mt-16 border-t border-border/60 pt-10">
          <div className="space-y-8">
            <header className="space-y-2">
              <h2 className="text-2xl font-semibold text-foreground">More for {universeLabel}</h2>
            </header>

            {relatedCodes.length ? (
              <section className="space-y-3">
                <h3 className="text-lg font-semibold text-foreground">Codes pages</h3>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {relatedCodes.map((game) => (
                    <div
                      key={game.id}
                      className="block"
                      data-analytics-event="related_content_click"
                      data-analytics-source-type="quiz_recommendations"
                      data-analytics-target-type="codes"
                      data-analytics-target-slug={game.slug}
                    >
                      <GameCard game={game} titleAs="p" />
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {relatedArticles.length ? (
              <section className="space-y-3">
                <h3 className="text-lg font-semibold text-foreground">Articles</h3>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {relatedArticles.map((article) => (
                    <div
                      key={article.id}
                      className="block"
                      data-analytics-event="related_content_click"
                      data-analytics-source-type="quiz_recommendations"
                      data-analytics-target-type="article"
                      data-analytics-target-slug={article.slug}
                    >
                      <ArticleCard article={article} />
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {relatedTools.length ? (
              <section className="space-y-3">
                <h3 className="text-lg font-semibold text-foreground">Tools</h3>
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {relatedTools.map((tool) => (
                    <div
                      key={tool.id ?? tool.code}
                      className="block"
                      data-analytics-event="related_content_click"
                      data-analytics-source-type="quiz_recommendations"
                      data-analytics-target-type="tool"
                      data-analytics-target-slug={tool.code}
                    >
                      <ToolCard tool={tool} />
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {relatedCatalogPages.length ? (
              <section className="space-y-3">
                <h3 className="text-lg font-semibold text-foreground">Catalog pages</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {relatedCatalogPages.map((catalog) => (
                    <div
                      key={catalog.id ?? catalog.code}
                      data-analytics-event="related_content_click"
                      data-analytics-source-type="quiz_recommendations"
                      data-analytics-target-type="catalog"
                      data-analytics-target-slug={catalog.code}
                    >
                      <Link
                        href={buildCatalogHref(catalog.code)}
                        className="block rounded-xl border border-border/60 bg-surface/70 p-4 transition hover:border-accent/60 hover:bg-surface"
                      >
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent/80">Catalog</p>
                        <h4 className="mt-1 line-clamp-2 text-base font-semibold text-foreground">{catalog.title}</h4>
                        <p className="mt-1 line-clamp-2 text-sm text-muted">
                          {summarize(catalog.meta_description, "Explore this related Roblox catalog page.")}
                        </p>
                      </Link>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </section>
      ) : null}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
    </>
  );
}
