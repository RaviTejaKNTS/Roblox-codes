import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GameListItem } from "@/components/GameListItem";
import { SocialShare } from "@/components/SocialShare";
import { ContentSlot } from "@/components/ContentSlot";
import { CommentsSection } from "@/components/comments/CommentsSection";
import {
  getGameListBySlug,
  getGameListMetadata,
  getGameListNavEntries,
  listOtherGameLists,
  type GameListUniverseEntry,
  type GameListNavEntry,
  type UniverseListBadge
} from "@/lib/db";
import { LISTS_DESCRIPTION, SITE_NAME, SITE_URL, breadcrumbJsonLd, webPageJsonLd, resolveSeoTitle, buildAlternates } from "@/lib/seo";
import { markdownToPlainText } from "@/lib/markdown";
import { formatDistanceToNow } from "date-fns";
import { ListCard } from "@/components/ListCard";

type GameListEntryWithBadges = GameListUniverseEntry & { badges?: UniverseListBadge[] };
type JumpListEntry = GameListNavEntry;
type OtherListLink = {
  id: string;
  slug: string;
  title: string;
  display_name?: string | null;
  cover_image?: string | null;
  top_entry_image?: string | null;
  refreshed_at?: string | null;
  updated_at?: string | null;
};

export const PAGE_SIZE = 10;

function isSupabasePoolTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
  const code = typeof candidate.code === "string" ? candidate.code : "";
  if (code === "PGRST003") return true;

  const message = [candidate.message, candidate.details, candidate.hint]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

  return message.includes("timed out acquiring connection from connection pool");
}

function isTransientUpstreamListError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const candidate = error as {
    code?: unknown;
    message?: unknown;
    details?: unknown;
    hint?: unknown;
    status?: unknown;
  };

  const code = typeof candidate.code === "string" ? candidate.code : "";
  const status = typeof candidate.status === "number" ? candidate.status : null;
  const message = [candidate.message, candidate.details, candidate.hint]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

  if (status !== null && status >= 500) return true;
  if (code === "57014") return true;

  return (
    message.includes("bad gateway") ||
    message.includes("error code 502") ||
    message.includes("cloudflare") ||
    message.includes("<!doctype html") ||
    message.includes("statement timeout") ||
    message.includes("canceling statement due to statement timeout")
  );
}

async function wait(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withPoolTimeoutRetry<T>(
  run: () => Promise<T>,
  label: string,
  maxAttempts = 4
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await run();
    } catch (error) {
      attempt += 1;
      const isRetryable = isSupabasePoolTimeoutError(error) || isTransientUpstreamListError(error);
      if (!isRetryable || attempt >= maxAttempts) {
        throw error;
      }
      const delayMs = Math.min(2000, 250 * Math.pow(2, attempt - 1));
      console.warn(
        `[lists:${label}] transient upstream error (attempt ${attempt}/${maxAttempts}), retrying in ${delayMs}ms`
      );
      await wait(delayMs);
    }
  }
}

function formatMetric(value?: number | null) {
  if (value == null || Number.isNaN(value)) return null;
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function listEntryUrl(entry: GameListUniverseEntry): string {
  if (entry.game?.slug) {
    return `${SITE_URL}/codes/${entry.game.slug}`;
  }
  const placeId = entry.universe.root_place_id ?? entry.universe.universe_id;
  return `https://www.roblox.com/games/${placeId}`;
}

function listEntryName(entry: { game?: { name: string | null } | null; universe: { display_name: string | null; name: string | null } }): string {
  return entry.game?.name ?? entry.universe.display_name ?? entry.universe.name ?? "Roblox game";
}

function mapJumpEntry(entry: GameListUniverseEntry): JumpListEntry {
  return {
    universe_id: entry.universe_id,
    rank: entry.rank,
    metric_value: entry.metric_value ?? null,
    extra: entry.extra ?? null,
    universe: {
      universe_id: entry.universe?.universe_id ?? entry.universe_id,
      display_name: entry.universe?.display_name ?? null,
      name: entry.universe?.name ?? null
    },
    game: entry.game ? { name: entry.game.name ?? null } : null
  };
}

export async function buildListData(slug: string, page: number) {
  const pageNumber = Number.isFinite(page) && page > 0 ? page : 1;
  const data = await withPoolTimeoutRetry(
    () => getGameListBySlug(slug, pageNumber, PAGE_SIZE),
    `buildListData:getGameListBySlug:${slug}`
  );
  if (!data) {
    notFound();
  }

  const { list, entries, total } = data;
  const entriesWithBadges: GameListEntryWithBadges[] = entries.map((entry) => ({
    ...entry,
    badges: (entry as any).badges ? ((entry as any).badges as UniverseListBadge[]) : []
  }));

  const otherLists = await withPoolTimeoutRetry(
    () => listOtherGameLists(slug, 6),
    `buildListData:listOtherGameLists:${slug}`
  );
  const jumpEntries =
    total > PAGE_SIZE
      ? await withPoolTimeoutRetry(
          () => getGameListNavEntries(list.id),
          `buildListData:getGameListNavEntries:${list.id}`
        )
      : entriesWithBadges.map(mapJumpEntry);

  return {
    list: { ...list, other_lists: otherLists },
    entries: entriesWithBadges,
    jumpEntries,
    totalEntries: total
  };
}

export async function buildMetadata(slug: string, page: number): Promise<Metadata> {
  const list = await withPoolTimeoutRetry(
    () => getGameListMetadata(slug),
    `buildMetadata:getGameListMetadata:${slug}`
  );
  if (!list) return {};

  const description = list.meta_description
    ? list.meta_description
    : list.intro_md
    ? markdownToPlainText(list.intro_md).slice(0, 160)
    : LISTS_DESCRIPTION;

  const titleBase = resolveSeoTitle(list.meta_title) ?? list.title;
  const title = page > 1 ? `${titleBase} - Page ${page} | ${SITE_NAME}` : `${titleBase} | ${SITE_NAME}`;
  const canonicalPath = page > 1 ? `/lists/${slug}/page/${page}` : `/lists/${slug}`;
  const canonical = `${SITE_URL}${canonicalPath}`;
  const publishedTime = list.created_at ? new Date(list.created_at).toISOString() : undefined;
  const updatedTime = (list.updated_at ?? list.refreshed_at ?? list.created_at)
    ? new Date(list.updated_at ?? list.refreshed_at ?? list.created_at).toISOString()
    : undefined;

  return {
    title,
    description,
    robots: page > 1 ? { index: false, follow: true } : undefined,
    alternates: buildAlternates(canonical),
    openGraph: {
      type: "article",
      url: canonical,
      title,
      description,
      siteName: SITE_NAME,
      publishedTime,
      modifiedTime: updatedTime
    },
    twitter: {
      card: "summary_large_image",
      title,
      description
    }
  };
}

function buildPagination(totalPages: number, currentPage: number): Array<number | "ellipsis"> {
  if (totalPages <= 6) {
    return Array.from({ length: totalPages }, (_, idx) => idx + 1);
  }
  const pages = new Set<number>([1, totalPages, currentPage, currentPage - 1, currentPage + 1]);
  const filtered = Array.from(pages).filter((p) => p >= 1 && p <= totalPages);
  const sorted = filtered.sort((a, b) => a - b);

  const result: Array<number | "ellipsis"> = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const value = sorted[i];
    const prev = sorted[i - 1];
    if (prev !== undefined && value - prev > 1) {
      result.push("ellipsis");
    }
    result.push(value);
  }
  return result;
}

function Pagination({
  slug,
  currentPage,
  totalPages
}: {
  slug: string;
  currentPage: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;
  const sequence = buildPagination(totalPages, currentPage);
  const pageHref = (page: number) => (page === 1 ? `/lists/${slug}` : `/lists/${slug}/page/${page}`);

  return (
    <nav className="flex flex-wrap items-center gap-2" aria-label="Pagination">
      <a
        href={pageHref(Math.max(1, currentPage - 1))}
        rel="prev"
        className="rounded-lg border border-border/60 px-3 py-2 text-sm font-semibold text-foreground transition hover:border-accent hover:text-accent"
        aria-disabled={currentPage === 1}
      >
        Prev
      </a>
      {sequence.map((item, idx) =>
        item === "ellipsis" ? (
          <span key={`ellipsis-${idx}`} className="px-2 text-sm text-muted">
            …
          </span>
        ) : (
          <a
            key={item}
            href={pageHref(item)}
            className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
              item === currentPage
                ? "border-accent bg-accent/10 text-foreground"
                : "border-border/60 text-foreground hover:border-accent hover:text-accent"
            }`}
            aria-current={item === currentPage ? "page" : undefined}
          >
            {item}
          </a>
        )
      )}
      <a
        href={pageHref(Math.min(totalPages, currentPage + 1))}
        rel="next"
        className="rounded-lg border border-border/60 px-3 py-2 text-sm font-semibold text-foreground transition hover:border-accent hover:text-accent"
        aria-disabled={currentPage === totalPages}
      >
        Next
      </a>
    </nav>
  );
}

function SidebarNav({
  slug,
  entries,
  totalEntries,
  metricLabel
}: {
  slug: string;
  entries: JumpListEntry[];
  totalEntries: number;
  metricLabel?: string | null;
}) {
  if (!entries.length) return null;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.2em] text-muted">
        <span>Jump to game</span>
        <span>Top {totalEntries}</span>
      </div>
      <div className="flex flex-col gap-2">
        {entries.map((entry, index) => {
          const pageForEntry = Math.floor(index / PAGE_SIZE) + 1;
          const base = pageForEntry === 1 ? `/lists/${slug}` : `/lists/${slug}/page/${pageForEntry}`;
          const href = `${base}#list-entry-${entry.universe.universe_id}`;
          const extra = (entry?.extra ?? null) as { metric?: string; metric_label?: string } | null;
          const resolvedMetricLabel = extra?.metric_label ?? extra?.metric ?? metricLabel ?? null;
          const metricValue = formatMetric(entry.metric_value);
          const metricText = metricValue ? `${metricValue}${resolvedMetricLabel ? ` ${resolvedMetricLabel}` : ""}` : null;
          return (
            <a
              key={entry.universe.universe_id}
              href={href}
              className="flex items-center justify-between rounded-xl border border-border/40 bg-surface/50 px-3 py-2 text-sm font-semibold text-foreground transition hover:border-accent hover:bg-accent/5 hover:text-accent"
            >
              <span className="flex items-center gap-3 min-w-0">
                <span className="text-xs font-bold text-accent">#{index + 1}</span>
                <span className="truncate">{listEntryName(entry)}</span>
              </span>
              {metricText ? <span className="ml-2 text-xs font-semibold text-muted whitespace-nowrap">{metricText}</span> : null}
            </a>
          );
        })}
      </div>
    </div>
  );
}

export function ListPageView({
  slug,
  list,
  entries,
  jumpEntries,
  allLists,
  currentPage,
  totalEntries,
  heroHtml,
  introHtml,
  outroHtml
}: {
  slug: string;
  list: NonNullable<Awaited<ReturnType<typeof getGameListMetadata>>>;
  entries: GameListEntryWithBadges[];
  jumpEntries: JumpListEntry[];
  allLists: OtherListLink[];
  currentPage: number;
  totalEntries: number;
  heroHtml: string;
  introHtml: string;
  outroHtml: string;
}) {
  const totalPages = Math.max(1, Math.ceil(totalEntries / PAGE_SIZE));
  const page = Math.min(Math.max(1, currentPage), totalPages);
  const start = (page - 1) * PAGE_SIZE;
  const pageEntries = entries;
  const adInsertPositions = new Set<number>();
  const addAdPosition = (index: number) => {
    if (index >= 0 && index < pageEntries.length) {
      adInsertPositions.add(index);
    }
  };
  addAdPosition(1);
  addAdPosition(5);
  addAdPosition(pageEntries.length - 1);

  const showIntroOutro = page === 1;
  const pageTitle = page === 1 ? list.title : `${list.title} - Page ${page}`;
  const canonicalPath = page === 1 ? `/lists/${slug}` : `/lists/${slug}/page/${page}`;
  const canonicalUrl = `${SITE_URL}${canonicalPath}`;
  const otherLists = allLists.filter((item) => item.slug !== slug).slice(0, 6);
  const listMetricLabel = list.primary_metric_label ?? list.primary_metric_key ?? null;
  const navEntries = jumpEntries.length ? jumpEntries : entries.map(mapJumpEntry);
  const otherListCards = otherLists.map((other) => ({
    displayName: other.display_name ?? other.title,
    title: other.title,
    slug: other.slug,
    coverImage:
      (other.cover_image && other.cover_image.trim()) ||
      (other.top_entry_image && other.top_entry_image.trim()) ||
      `${SITE_URL}/og-image.png`,
    updatedAt: other.updated_at ?? other.refreshed_at ?? null
  }));

  const listDescription =
    list.meta_description ??
    (list.intro_md ? markdownToPlainText(list.intro_md).slice(0, 160) : LISTS_DESCRIPTION);

  const listSchema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: pageTitle,
    description: listDescription,
    url: canonicalUrl,
    numberOfItems: totalEntries,
    itemListElement: entries.map((entry, index) => ({
      "@type": "ListItem",
      position: start + index + 1,
      item: {
        "@type": "VideoGame",
        name: listEntryName(entry),
        url: listEntryUrl(entry),
        image: entry.universe.icon_url ?? undefined
      }
    }))
  });

  const pageSchema = JSON.stringify(
    webPageJsonLd({
      siteUrl: SITE_URL,
      slug: canonicalPath.replace(/^\//, ""),
      title: pageTitle,
      description: listDescription,
      image: list.cover_image ?? `${SITE_URL}/og-image.png`,
      author: null,
      publishedAt: new Date(list.created_at).toISOString(),
      updatedAt: new Date(list.updated_at ?? list.refreshed_at ?? list.created_at).toISOString()
    })
  );
  const breadcrumbs = [
    { name: "Home", url: SITE_URL },
    { name: "Lists", url: `${SITE_URL.replace(/\/$/, "")}/lists` },
    { name: list.title, url: canonicalUrl }
  ];
  const breadcrumbData = JSON.stringify(breadcrumbJsonLd(breadcrumbs));
  const breadcrumbNavItems = [
    { label: "Home", href: "/" },
    { label: "Lists", href: "/lists" },
    { label: list.title, href: null }
  ];

  const updatedDateValue = list.refreshed_at ?? list.updated_at ?? list.created_at;
  const updatedDate = updatedDateValue ? new Date(updatedDateValue) : null;
  const formattedUpdated = updatedDate
    ? updatedDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : null;
  const updatedRelativeLabel = updatedDate ? formatDistanceToNow(updatedDate, { addSuffix: true }) : null;

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-6 text-xs uppercase tracking-[0.25em] text-muted">
        <ol className="flex flex-wrap items-center gap-2">
          {breadcrumbNavItems.map((item, index) => (
            <li key={`${item.label}-${index}`} className="flex items-center gap-2">
              {item.href ? (
                <a href={item.href} className="font-semibold text-muted transition hover:text-accent">
                  {item.label}
                </a>
              ) : (
                <span className="font-semibold text-foreground/80">{item.label}</span>
              )}
              {index < breadcrumbNavItems.length - 1 ? <span className="text-muted/60">&gt;</span> : null}
            </li>
          ))}
        </ol>
      </nav>

      <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:gap-12 lg:min-h-0">
        <div className="space-y-10 min-w-0 flex-1">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="mt-2 text-3xl font-bold text-foreground sm:text-4xl">{pageTitle}</h1>
              </div>
              {formattedUpdated ? (
                <p className="text-sm text-foreground/80">
                  Updated on <span className="font-semibold text-foreground">{formattedUpdated}</span>
                  {updatedRelativeLabel ? <span>{' '}({updatedRelativeLabel})</span> : null}
                </p>
              ) : null}
            </div>
            <div className="lg:hidden">
              <details className="rounded-xl border border-border/60 bg-surface/70 px-4 py-3">
                <summary className="flex items-center justify-between text-sm font-semibold text-foreground cursor-pointer">
                  <span>Jump to game</span>
                  <span className="text-xs text-muted">Top {totalEntries}</span>
                </summary>
                <div className="mt-3 flex flex-col gap-2">
                  {navEntries.map((entry, index) => {
                    const pageForEntry = Math.floor(index / PAGE_SIZE) + 1;
                    const base = pageForEntry === 1 ? `/lists/${slug}` : `/lists/${slug}/page/${pageForEntry}`;
                    const href = `${base}#list-entry-${entry.universe.universe_id}`;
                    const extra = (entry?.extra ?? null) as { metric?: string; metric_label?: string } | null;
                    const resolvedMetricLabel = extra?.metric_label ?? extra?.metric ?? listMetricLabel ?? null;
                    const metricValue = formatMetric(entry.metric_value);
                    const metricText = metricValue ? `${metricValue}${resolvedMetricLabel ? ` ${resolvedMetricLabel}` : ""}` : null;
                    return (
                      <a
                        key={entry.universe.universe_id}
                        href={href}
                        className="flex items-center justify-between rounded-xl border border-border/40 bg-surface/50 px-3 py-2 text-sm font-semibold text-foreground transition hover:border-accent hover:bg-accent/5 hover:text-accent"
                      >
                        <span className="flex items-center gap-3 min-w-0">
                          <span className="text-xs font-bold text-accent">#{index + 1}</span>
                          <span className="truncate">{listEntryName(entry)}</span>
                        </span>
                        {metricText ? (
                          <span className="ml-2 text-xs font-semibold text-muted whitespace-nowrap">{metricText}</span>
                        ) : null}
                      </a>
                    );
                  })}
                </div>
              </details>
            </div>
            {showIntroOutro ? (
              <section className="space-y-6">
                {heroHtml ? (
                  <div className="article-content prose dark:prose-invert max-w-none game-copy" dangerouslySetInnerHTML={{ __html: heroHtml }} />
                ) : null}
                {introHtml ? (
                  <div className="article-content prose dark:prose-invert max-w-none game-copy" dangerouslySetInnerHTML={{ __html: introHtml }} />
                ) : null}
              </section>
            ) : null}
          </div>

          {pageEntries.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/60 bg-surface/60 p-8 text-center text-muted">
              No Roblox experiences matched this list yet. Check back soon.
            </div>
          ) : (
            <div className="space-y-6">
              {pageEntries.flatMap((entry, index) => {
                const extra = (entry?.extra ?? null) as { metric?: string } | null;
                const rank = start + index + 1;
                const metricLabel = extra?.metric;
                const nodes = [
                  <div
                    id={`list-entry-${entry.universe.universe_id}`}
                    key={entry.universe.universe_id}
                    className="scroll-mt-32"
                  >
                    <GameListItem entry={entry} rank={rank} metricLabel={metricLabel} listSlug={slug} />
                  </div>
                ];
                if (adInsertPositions.has(index)) {
                  nodes.push(
                    <ContentSlot
                      key={`list-ad-${entry.universe.universe_id}-${index}`}
                      slot="3782879982"
                      className="w-full"
                      adLayout={null}
                      adLayoutKey="-cc+6e-70-he+1wy"
                      adFormat="fluid"
                      minHeight={120}
                    />
                  );
                }
                return nodes;
              })}
            </div>
          )}

          {showIntroOutro && outroHtml ? (
            <section className="space-y-4 text-muted">
              <div
                className="article-content prose dark:prose-invert max-w-none game-copy"
                dangerouslySetInnerHTML={{ __html: outroHtml }}
              />
            </section>
          ) : null}

          <Pagination slug={slug} currentPage={page} totalPages={totalPages} />

          <div className="pt-10">
            <CommentsSection entityType="list" entityId={list.id} />
          </div>
        </div>

        <div className="mt-0 space-y-6 lg:w-[320px]">
          <div className="hidden lg:block">
            <SidebarNav
              slug={slug}
              entries={navEntries}
              totalEntries={totalEntries}
              metricLabel={listMetricLabel}
            />
          </div>
          <ContentSlot
            slot="4767824441"
            className="w-full"
            adLayout={null}
            adFormat="auto"
            fullWidthResponsive
            minHeight="clamp(280px, 40vw, 600px)"
          />
          {otherListCards.length ? (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">Lists library</h2>
              <div className="space-y-3">
                {otherListCards.map((card) => (
                  <ListCard
                    key={card.slug}
                    displayName={card.displayName}
                    title={card.title}
                    slug={card.slug}
                    coverImage={card.coverImage}
                    updatedAt={card.updatedAt}
                  />
                ))}
              </div>
            </section>
          ) : null}
          <SocialShare url={canonicalUrl} title={pageTitle} heading="Share this list with your friends" />
        </div>
      </div>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: pageSchema }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: listSchema }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: breadcrumbData }} />
    </>
  );
}
