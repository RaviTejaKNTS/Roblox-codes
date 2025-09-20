import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { marked } from "marked";
import { AuthorCard } from "@/components/AuthorCard";
import { CopyCodeButton } from "@/components/CopyCodeButton";
import { ExpiredCodes } from "@/components/ExpiredCodes";
import { GameCard } from "@/components/GameCard";
import { RedeemImageGallery } from "@/components/RedeemImageGallery";
import { authorAvatarUrl } from "@/lib/avatar";
import { monthYear } from "@/lib/date";
import { getGameBySlug, listCodesForGame, listGamesWithActiveCounts } from "@/lib/db";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
  breadcrumbJsonLd,
  codesItemListJsonLd,
  gameArticleJsonLd,
  gameJsonLd,
  webPageJsonLd,
  howToJsonLd
} from "@/lib/seo";

export const revalidate = 0;

type Params = { params: { slug: string } };

function cleanRewardsText(text?: string | null): string | null {
  if (!text) return null;
  let t = text.replace(/\s+/g, " ").trim();
  t = t.replace(/^New Code/i, "").trim();
  t = t.replace(/^Copy/i, "").trim();
  t = t.replace(/\s*(Active|Expired|Check)\s*$/i, "").trim();
  t = t.replace(/this code credits your account with/i, "This code gives you");
  return t || null;
}

function extractHowToSteps(markdown?: string | null): string[] {
  if (!markdown) return [];
  const steps: string[] = [];
  const seen = new Set<string>();
  const lines = markdown.split(/\r?\n/);
  for (const raw of lines) {
    const stripped = raw
      .replace(/^[-*+]\s+/, "")
      .replace(/^\d+[).]\s+/, "")
      .replace(/^#+\s+/, "")
      .replace(/[`*_]/g, "")
      .trim();
    if (!stripped) continue;
    if (/^\s*<.+>\s*$/.test(stripped)) continue;
    const normalized = stripped.replace(/\s+/g, " ");
    if (normalized.length < 8) continue;
    if (seen.has(normalized.toLowerCase())) continue;
    seen.add(normalized.toLowerCase());
    steps.push(normalized);
    if (steps.length >= 10) break;
  }
  return steps;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const game = await getGameBySlug(params.slug);
  if (!game) return {};
  const codes = await listCodesForGame(game.id);
  const latestCodeFirstSeen = codes.reduce<string | null>((latest, code) => {
    if (!code.first_seen_at) return latest;
    if (!latest || code.first_seen_at > latest) return code.first_seen_at;
    return latest;
  }, null);
  const lastContentUpdate = latestCodeFirstSeen && latestCodeFirstSeen > game.updated_at
    ? latestCodeFirstSeen
    : game.updated_at;
  const when = monthYear();
  const title = game.seo_title || `${game.name} Codes (${when})`;
  const descriptionRaw =
    game.seo_description ||
    `Get the latest ${game.name} codes for ${when} and redeem them for free in-game rewards. Updated daily with only active and working codes.`;
  const description = descriptionRaw?.trim() || SITE_DESCRIPTION;
  const canonicalUrl = `${SITE_URL}/${game.slug}`;
  const coverImage = game.cover_image?.startsWith("http")
    ? game.cover_image
    : game.cover_image
    ? `${SITE_URL.replace(/\/$/, "")}/${game.cover_image.replace(/^\//, "")}`
    : `${SITE_URL}/og-image.png`;
  const publishedTime = new Date(game.created_at).toISOString();
  const modifiedTime = new Date(lastContentUpdate).toISOString();
  const authorUrl = game.author?.slug
    ? `${SITE_URL.replace(/\/$/, "")}/authors/${game.author.slug}`
    : undefined;
  const authors = game.author ? [{ name: game.author.name, url: authorUrl }] : undefined;
  return {
    title,
    description,
    keywords: [
      `${game.name} codes`,
      "Roblox codes",
      "Roblox promo codes",
      "gaming rewards",
      "Bloxodes"
    ],
    category: "Gaming",
    alternates: { canonical: canonicalUrl },
    authors,
    publisher: SITE_NAME,
    openGraph: {
      type: "article",
      title,
      description,
      url: canonicalUrl,
      siteName: SITE_NAME,
      images: [coverImage],
      publishedTime,
      modifiedTime,
      locale: "en_US",
      authors: authors?.map((author) => author.name) ?? [SITE_NAME]
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      creator: "@bloxodes",
      site: "@bloxodes",
      images: [coverImage]
    }
  };
}

export default async function GamePage({ params }: Params) {
  const game = await getGameBySlug(params.slug);
  if (!game || !game.is_published) return notFound();
  const codes = await listCodesForGame(game.id);
  const allGames = await listGamesWithActiveCounts();
  const author = game.author;
  const authorAvatar = author ? authorAvatarUrl(author, 72) : null;
  const redeemImages = [game.redeem_img_1, game.redeem_img_2, game.redeem_img_3]
    .map((src) => src?.trim())
    .filter((src): src is string => !!src);
  const redeemSteps = extractHowToSteps(game.redeem_md);

  const active = codes.filter(c => c.status === "active");
  const needsCheck = codes.filter(c => c.status === "check");
  const expired = codes.filter(c => c.status === "expired");
  const latestCodeFirstSeen = codes.reduce<string | null>((latest, code) => {
    if (!code.first_seen_at) return latest;
    if (!latest || code.first_seen_at > latest) return code.first_seen_at;
    return latest;
  }, null);

  const lastContentUpdate = latestCodeFirstSeen && latestCodeFirstSeen > game.updated_at
    ? latestCodeFirstSeen
    : game.updated_at;

  const lastChecked = codes.reduce((acc, c) => (acc > c.last_seen_at ? acc : c.last_seen_at), game.updated_at);
  const recommended = allGames
    .filter((g) => g.id !== game.id)
    .sort((a, b) => {
      if (b.active_count !== a.active_count) return b.active_count - a.active_count;
      return a.name.localeCompare(b.name);
    })
    .slice(0, 6);

  const lastCheckedFormatted = new Date(lastChecked).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const [introHtml, redeemHtml, descriptionHtml, authorBioHtml] = await Promise.all([
    game.intro_md ? marked.parse(game.intro_md) : "",
    game.redeem_md ? marked.parse(game.redeem_md) : "",
    game.description_md ? marked.parse(game.description_md) : "",
    author?.bio_md ? marked.parse(author.bio_md) : "",
  ]);

  const canonicalUrl = `${SITE_URL}/${game.slug}`;
  const coverImage = game.cover_image?.startsWith("http")
    ? game.cover_image
    : game.cover_image
    ? `${SITE_URL.replace(/\/$/, "")}/${game.cover_image.replace(/^\//, "")}`
    : `${SITE_URL}/og-image.png`;
  const metaDescriptionRaw =
    game.seo_description ||
    `Get the latest ${game.name} codes for ${monthYear()} and redeem them for free in-game rewards. Updated daily with only active and working codes.`;
  const metaDescription = metaDescriptionRaw?.trim() || SITE_DESCRIPTION;
  const publishedIso = new Date(game.created_at).toISOString();
  const updatedIso = new Date(lastContentUpdate).toISOString();
  const lastCheckedIso = new Date(lastChecked).toISOString();
  const structuredAuthor = author?.slug
    ? {
        name: author.name,
        url: `${SITE_URL.replace(/\/$/, "")}/authors/${author.slug}`
      }
    : author
    ? { name: author.name, url: null }
    : null;
  const breadcrumbData = JSON.stringify(
    breadcrumbJsonLd([
      { name: "Home", url: SITE_URL },
      { name: `${game.name} Codes`, url: canonicalUrl }
    ])
  );
  const videoGameData = JSON.stringify(
    gameJsonLd({ siteUrl: SITE_URL, game: { name: game.name, slug: game.slug, image: coverImage } })
  );
  const codesItemListData = JSON.stringify(
    codesItemListJsonLd({
      siteUrl: SITE_URL,
      game: { name: game.name, slug: game.slug },
      codes: codes.map((code) => ({
        code: code.code,
        status: code.status,
        reward: cleanRewardsText(code.rewards_text)
      }))
    })
  );
  const articleData = JSON.stringify(
    gameArticleJsonLd({
      siteUrl: SITE_URL,
      game: { name: game.name, slug: game.slug },
      author: structuredAuthor,
      description: metaDescription,
      coverImage,
      publishedAt: publishedIso,
      updatedAt: updatedIso
    })
  );
  const howToData = redeemSteps.length
    ? JSON.stringify(
        howToJsonLd({
          siteUrl: SITE_URL,
          game: { name: game.name, slug: game.slug },
          steps: redeemSteps,
          images: redeemImages
        })
      )
    : null;
  const webPageData = JSON.stringify(
    webPageJsonLd({
      siteUrl: SITE_URL,
      slug: game.slug,
      title: `${game.name} Codes (${monthYear()})`,
      description: metaDescription,
      image: coverImage,
      author: structuredAuthor,
      publishedAt: publishedIso,
      updatedAt: updatedIso
    })
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,1.25fr)]">
      <article itemScope itemType="https://schema.org/Article">
        <meta itemProp="mainEntityOfPage" content={canonicalUrl} />
        <meta itemProp="datePublished" content={publishedIso} />
        <meta itemProp="dateModified" content={updatedIso} />
        <meta itemProp="description" content={metaDescription} />
        <meta itemProp="image" content={coverImage} />
        {!author ? <meta itemProp="author" content={SITE_NAME} /> : null}
        <header className="mb-6">
          <h1 className="text-5xl font-bold text-foreground" itemProp="headline">
            {game.name} Codes ({monthYear()})
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted">
            {author ? (
              <div className="flex items-center gap-2" itemProp="author" itemScope itemType="https://schema.org/Person">
                <img
                  src={authorAvatar || "https://www.gravatar.com/avatar/?d=mp"}
                  alt={author.name}
                  className="h-9 w-9 rounded-full border border-border/40 object-cover"
                />
                <span>
                  Authored by {author.slug ? (
                    <Link
                      href={`/authors/${author.slug}`}
                      className="font-semibold text-foreground transition hover:text-accent"
                      itemProp="name"
                    >
                      {author.name}
                    </Link>
                  ) : (
                    <span className="font-semibold text-foreground" itemProp="name">{author.name}</span>
                  )}
                </span>
              </div>
            ) : (
              <span className="font-semibold text-foreground" itemProp="author">
                Published by {SITE_NAME}
              </span>
            )}
            {author ? <span aria-hidden="true">•</span> : null}
            <div className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-4 py-2 font-medium text-accent">
              <time dateTime={lastCheckedIso}>
                Last checked for {game.name} codes on {lastCheckedFormatted}
              </time>
            </div>
          </div>
        </header>

        {introHtml ? (
          <section className="mb-8" id="intro" itemProp="articleBody">
            <div className="prose dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: introHtml }} />
          </section>
        ) : null}

        <section className="panel mb-8 space-y-3 px-5 pb-5 pt-0" id="active-codes">
          <div className="prose prose-headings:mt-0 prose-headings:mb-2 prose-p:mt-2 dark:prose-invert max-w-none">
            <h2>Active {game.name} Codes</h2>
            <p className="text-muted">
              Right now, there are {active.length} active {active.length === 1 ? "code" : "codes"} you can use in {game.name}. Remember, these codes are case-sensitive, so copy/paste or enter them exactly as shown.
            </p>
          </div>
          {active.length === 0 ? (
            <p className="text-muted">
              We haven't confirmed any working codes right now{needsCheck.length ? ", but try the unverified ones below." : ". Check back soon."}
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {[...active].reverse().map(c => {
                const rewards = cleanRewardsText(c.rewards_text);
                return (
                  <article
                    key={c.id}
                    className="rounded-[var(--radius-sm)] border border-accent/25 bg-surface px-5 py-4 shadow-soft transition hover:-translate-y-[1px] hover:border-accent/40 hover:shadow-lg"
                  >
                    <div className="flex flex-wrap gap-4 md:grid md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] md:items-start md:gap-6">
                      <div className="basis-full flex flex-col gap-3 md:basis-auto">
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="relative inline-flex">
                            <code
                              id={c.code}
                              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-accent to-accent-dark px-4 py-2 text-sm font-semibold tracking-wide text-white shadow-soft"
                            >
                              {c.code}
                            </code>
                            {c.is_new ? (
                              <span className="pointer-events-none absolute -top-2 -right-2 inline-flex items-center rounded-full bg-[#0f1121] px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-white shadow-[0_18px_28px_-16px_rgba(72,92,255,0.55)] ring-2 ring-accent/25 rotate-2 md:-top-2 md:-right-2 dark:bg-white dark:text-accent">
                                New
                              </span>
                            ) : null}
                          </div>
                          <CopyCodeButton code={c.code} tone="accent" />
                          {c.level_requirement != null ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent">
                              Level {c.level_requirement}+
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="basis-full rounded-[var(--radius-sm)] bg-surface-muted/60 pl-1 pr-4 py-3 text-sm leading-relaxed text-foreground/90 md:basis-auto md:rounded-none md:border-l md:border-border/40 md:bg-transparent md:px-0 md:py-0 md:pl-6">
                        {rewards ? rewards : <span className="text-muted">No reward listed</span>}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="panel mb-8 space-y-3 px-5 pb-5 pt-0" id="needs-check">
          <div className="prose prose-headings:mt-0 prose-headings:mb-2 prose-p:mt-2 dark:prose-invert max-w-none">
            <h2>Codes To Double-Check</h2>
            {needsCheck.length === 0 ? (
              <p className="text-muted">We haven't seen any uncertain codes reported today.</p>
            ) : null}
          </div>
          {needsCheck.length === 0 ? null : (
            <div className="flex flex-col gap-4">
              {[...needsCheck].reverse().map(c => {
                const rewards = cleanRewardsText(c.rewards_text);
                return (
                  <article
                    key={c.id}
                    className="rounded-[var(--radius-sm)] border border-amber-200/70 bg-surface px-5 py-4 shadow-soft transition hover:-translate-y-[1px] hover:border-amber-300 dark:border-amber-500/40"
                  >
                    <div className="flex flex-wrap gap-4 md:grid md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] md:items-start md:gap-6">
                      <div className="basis-full flex flex-col gap-3 md:basis-auto">
                        <div className="flex flex-wrap items-center gap-3">
                          <code className="inline-flex items-center gap-2 rounded-full bg-surface-muted px-4 py-2 text-sm font-semibold tracking-wide text-foreground shadow-soft">
                            {c.code}
                          </code>
                          <CopyCodeButton code={c.code} />
                          {c.level_requirement != null ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/80 bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-900 dark:border-amber-400/70 dark:bg-amber-500/10 dark:text-amber-100">
                              Level {c.level_requirement}+
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="basis-full rounded-[var(--radius-sm)] bg-surface-muted/60 pl-0 pr-4 py-3 text-sm leading-relaxed text-foreground/90 md:basis-auto md:rounded-none md:border-l md:border-border/40 md:bg-transparent md:px-0 md:py-0 md:pl-6">
                        {rewards ? rewards : <span className="text-muted">No reward listed</span>}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="panel mb-8 space-y-3 px-5 pb-5 pt-0" id="expired-codes">
          <div className="prose prose-headings:mt-0 prose-headings:mb-2 prose-p:mt-2 dark:prose-invert max-w-none">
            <h2>Expired {game.name} Codes</h2>
            {expired.length === 0 ? (
              <p className="text-muted">We haven't tracked any expired codes yet.</p>
            ) : null}
          </div>
          {expired.length === 0 ? null : <ExpiredCodes codes={expired} />}
        </section>

        {redeemHtml ? (
          <section className="mb-8" id="redeem" itemProp="articleBody">
            <div className="prose dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: redeemHtml }} />
            {redeemImages.length ? (
              <RedeemImageGallery images={redeemImages} gameName={game.name} />
            ) : null}
          </section>
        ) : null}

        <section className="mb-10" id="description" itemProp="articleBody">
          {descriptionHtml ? (
            <div className="prose dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: descriptionHtml }} />
          ) : (
            <p className="text-muted">This section will explain the game and how to redeem codes.</p>
          )}
        </section>

        {author ? <AuthorCard author={author} bioHtml={authorBioHtml} /> : null}

        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: breadcrumbData }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: videoGameData }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: codesItemListData }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: articleData }} />
        {howToData ? (
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: howToData }} />
        ) : null}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: webPageData }} />
      </article>

      {recommended.length > 0 ? (
        <aside className="space-y-4">
          <div className="panel space-y-2 p-5">
            <h2 className="text-lg font-semibold text-foreground">More games with codes</h2>
            <p className="text-sm text-muted">Discover other Roblox games that currently have active rewards.</p>
          </div>
          <div className="grid gap-4">
            {recommended.map((g) => (
              <GameCard key={g.id} game={g} />
            ))}
          </div>
        </aside>
      ) : null}
    </div>
  );
}
