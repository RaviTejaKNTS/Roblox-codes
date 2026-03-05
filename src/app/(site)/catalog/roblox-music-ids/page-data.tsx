import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { CatalogAdSlot } from "@/components/CatalogAdSlot";
import { CopyCodeButton } from "@/components/CopyCodeButton";
import { MusicCoverImage } from "@/components/MusicCoverImage";
import { CommentsSection } from "@/components/comments/CommentsSection";
import { Suspense } from "react";
import { MusicIdsBrowser } from "./MusicIdsBrowser";
import { supabaseAdmin } from "@/lib/supabase";
import { breadcrumbJsonLd, CATALOG_DESCRIPTION, SITE_URL, webPageJsonLd } from "@/lib/seo";
import { DEFAULT_SORT, normalizeSearchQuery, type MusicSortKey } from "@/lib/music-ids-search";

const PAGE_SIZE = 24;
const OPTION_PAGE_SIZE = 24;
const IS_BUILD = process.env.NEXT_PHASE === "phase-production-build";

export const BASE_PATH = "/catalog/roblox-music-ids";
export const CANONICAL = `${SITE_URL.replace(/\/$/, "")}${BASE_PATH}`;

export type MusicRow = {
  asset_id: number;
  title: string;
  artist: string;
  album: string | null;
  genre: string | null;
  duration_seconds: number | null;
  album_art_asset_id: number | null;
  thumbnail_url: string | null;
  rank: number | null;
  source: string | null;
  last_seen_at: string | null;
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

type PageData = {
  songs: MusicRow[];
  total: number;
  totalPages: number;
};

export type MusicNavKey = "all" | "trending" | "genres" | "artists";

type MusicNavItem = {
  id: MusicNavKey;
  title: string;
  description: string;
  href: string;
};

type ValueOption = {
  slug: string;
  label: string;
  count: number;
};

export type BreadcrumbItem = {
  label: string;
  href?: string | null;
};

const MUSIC_NAV_ITEMS: MusicNavItem[] = [
  {
    id: "all",
    title: "All Music Codes",
    description: "Every Roblox music ID we track, updated throughout the day.",
    href: BASE_PATH
  },
  {
    id: "trending",
    title: "Trending Music IDs",
    description: "Ranked IDs pulled straight from the top charts.",
    href: `${BASE_PATH}/trending`
  },
  {
    id: "genres",
    title: "Genres",
    description: "Jump into genre collections and find the right vibe.",
    href: `${BASE_PATH}/genres`
  },
  {
    id: "artists",
    title: "Artists",
    description: "Browse every artist with music IDs in our catalog.",
    href: `${BASE_PATH}/artists`
  }
];

function formatLoadError(error: unknown) {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;
  if (typeof (error as { message?: unknown }).message === "string") {
    const message = (error as { message: string }).message;
    return message.length > 240 ? `${message.slice(0, 240)}…` : message;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

function reportLoadError(context: string, error: unknown) {
  if (IS_BUILD) return;
  console.error(context, formatLoadError(error));
}


function formatDuration(seconds: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

function buildThumbnailUrl(song: MusicRow): string {
  if (song.thumbnail_url) return song.thumbnail_url;
  if (!song.album_art_asset_id) return "";
  return `https://www.roblox.com/asset-thumbnail/image?assetId=${song.album_art_asset_id}&width=420&height=420&format=png`;
}

function buildRobloxUrl(assetId: number): string {
  return `https://www.roblox.com/library/${assetId}`;
}

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

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

function buildLoosePattern(value: string): string {
  const cleaned = value.replace(/[%_]/g, " ").trim();
  const pattern = cleaned.replace(/[^a-z0-9]+/gi, "%").replace(/%{2,}/g, "%");
  return `%${pattern}%`;
}

async function loadOptionPage(
  view: "roblox_music_genres_view" | "roblox_music_artists_view",
  pageNumber: number,
  pageSize: number
) {
  try {
    const safePage = Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : 1;
    const offset = (safePage - 1) * pageSize;
    const supabase = supabaseAdmin();
    const { data, error, count } = await supabase
      .from(view)
      .select("slug,label,item_count", { count: "exact" })
      .order("label", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) {
      reportLoadError(`Failed to load ${view} options`, error);
      return { options: [], total: 0, totalPages: 1 };
    }

    const options = (data ?? []).map((row) => ({
      slug: row.slug,
      label: row.label,
      count: row.item_count ?? 0
    }));
    const total = count ?? options.length ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    return { options, total, totalPages };
  } catch (error) {
    reportLoadError(`Failed to load ${view} options`, error);
    return { options: [], total: 0, totalPages: 1 };
  }
}

async function loadOptionBySlug(
  view: "roblox_music_genres_view" | "roblox_music_artists_view",
  slug: string
): Promise<ValueOption | null> {
  const normalized = slugify(slug);
  if (!normalized) return null;
  try {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from(view)
      .select("slug,label,item_count")
      .eq("slug", normalized)
      .maybeSingle();

    if (error) {
      reportLoadError(`Failed to load ${view} option`, error);
      return null;
    }

    if (!data) return null;
    return {
      slug: data.slug,
      label: data.label,
      count: data.item_count ?? 0
    };
  } catch (error) {
    reportLoadError(`Failed to load ${view} option`, error);
    return null;
  }
}

const MUSIC_SOURCE_VIEW = "roblox_music_ids_ranked_view";

async function loadMusicIdsPage(
  pageNumber: number,
  options?: { genre?: string; artist?: string; trending?: boolean; search?: string; sort?: MusicSortKey }
) {
  try {
    const safePage = Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : 1;
    const offset = (safePage - 1) * PAGE_SIZE;
    const supabase = supabaseAdmin();
    let query = supabase
      .from(MUSIC_SOURCE_VIEW)
      .select("asset_id, title, artist, album, genre, duration_seconds, album_art_asset_id, thumbnail_url, rank, source, last_seen_at", {
        count: "exact"
      });

    // Filter out songs without duration
    query = query.not("duration_seconds", "is", null).gt("duration_seconds", 0);

    if (options?.genre) {
      query = query.ilike("genre", buildLoosePattern(options.genre));
    }

    if (options?.artist) {
      query = query.ilike("artist", buildLoosePattern(options.artist));
    }

    const searchTerm = normalizeSearchQuery(options?.search);
    if (searchTerm) {
      const pattern = buildLoosePattern(searchTerm);
      const orParts = [
        `title.ilike.${pattern}`,
        `artist.ilike.${pattern}`,
        `album.ilike.${pattern}`,
        `genre.ilike.${pattern}`
      ];
      if (/^\d+$/.test(searchTerm)) {
        orParts.unshift(`asset_id.eq.${searchTerm}`);
      }
      query = query.or(orParts.join(","));
    }

    if (options?.trending) {
      query = query.not("rank", "is", null).order("rank", { ascending: true, nullsFirst: false });
    } else {
      const sort = options?.sort ?? DEFAULT_SORT;
      switch (sort) {
        case "popular":
          query = query
            .order("popularity_score", { ascending: false, nullsFirst: false })
            .order("last_seen_at", { ascending: false, nullsFirst: false });
          break;
        case "newest":
          query = query.order("last_seen_at", { ascending: false, nullsFirst: false });
          break;
        case "duration_desc":
          query = query
            .order("duration_seconds", { ascending: false, nullsFirst: false })
            .order("popularity_score", { ascending: false, nullsFirst: false });
          break;
        case "duration_asc":
          query = query
            .order("duration_seconds", { ascending: true, nullsFirst: false })
            .order("popularity_score", { ascending: false, nullsFirst: false });
          break;
        case "title_asc":
          query = query.order("title", { ascending: true, nullsFirst: false });
          break;
        case "artist_asc":
          query = query.order("artist", { ascending: true, nullsFirst: false });
          break;
        case "recommended":
        default:
          query = query
            .order("duration_bucket", { ascending: true, nullsFirst: false })
            .order("popularity_score", { ascending: false, nullsFirst: false })
            .order("duration_seconds", { ascending: false, nullsFirst: false })
            .order("rank", { ascending: true, nullsFirst: false })
            .order("last_seen_at", { ascending: false, nullsFirst: false });
      }
    }

    const { data, error, count } = await query.range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      reportLoadError("Failed to load Roblox music IDs", error);
      return { songs: [], total: 0, totalPages: 1 };
    }

    const total = count ?? data?.length ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    return { songs: (data ?? []) as MusicRow[], total, totalPages };
  } catch (error) {
    reportLoadError("Failed to load Roblox music IDs", error);
    return { songs: [], total: 0, totalPages: 1 };
  }
}

export async function loadRobloxMusicIdsPageData(
  page: number,
  options?: { search?: string; sort?: MusicSortKey }
): Promise<PageData> {
  return loadMusicIdsPage(page, { search: options?.search, sort: options?.sort });
}

export async function loadTrendingMusicIdsPageData(page: number): Promise<PageData> {
  return loadMusicIdsPage(page, { trending: true });
}

export async function loadGenreMusicIdsPageData(page: number, genre: string): Promise<PageData> {
  return loadMusicIdsPage(page, { genre });
}

export async function loadArtistMusicIdsPageData(page: number, artist: string): Promise<PageData> {
  return loadMusicIdsPage(page, { artist });
}

export async function loadPagedGenreOptions(page: number, pageSize = OPTION_PAGE_SIZE) {
  return loadOptionPage("roblox_music_genres_view", page, pageSize);
}

export async function loadPagedArtistOptions(page: number, pageSize = OPTION_PAGE_SIZE) {
  return loadOptionPage("roblox_music_artists_view", page, pageSize);
}

export async function loadGenreOptionBySlug(slug: string) {
  return loadOptionBySlug("roblox_music_genres_view", slug);
}

export async function loadArtistOptionBySlug(slug: string) {
  return loadOptionBySlug("roblox_music_artists_view", slug);
}

export function MusicCatalogNav({ active }: { active: MusicNavKey }) {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {MUSIC_NAV_ITEMS.map((item) => {
        const isActive = item.id === active;
        const cardClasses = `group relative overflow-hidden rounded-2xl border px-5 py-4 transition ${isActive
            ? "border-accent/70 bg-gradient-to-br from-accent/15 via-surface to-background shadow-soft"
            : "border-border/60 bg-surface/80 hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-soft"
          }`;
        const card = (
          <article className={cardClasses} aria-current={isActive ? "page" : undefined}>
            <span
              aria-hidden
              className={`absolute inset-x-0 top-0 h-1 ${isActive ? "bg-accent" : "bg-accent/30 group-hover:bg-accent/60"
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

export function MusicBreadcrumb({ items, className }: { items: BreadcrumbItem[]; className?: string }) {
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

export function buildMusicItemListSchema({
  title,
  description,
  url,
  songs,
  total,
  startIndex
}: {
  title: string;
  description: string;
  url: string;
  songs: MusicRow[];
  total: number;
  startIndex: number;
}) {
  const itemListElement = songs.map((song, index) => {
    const item: Record<string, unknown> = {
      "@type": "MusicRecording",
      name: song.title,
      url: buildRobloxUrl(song.asset_id)
    };
    if (song.artist) {
      item.byArtist = { "@type": "MusicGroup", name: song.artist };
    }
    if (song.genre) {
      item.genre = song.genre;
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

export function MusicIdGrid({ songs }: { songs: MusicRow[] }) {
  if (!songs.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 bg-surface/60 p-8 text-center text-muted">
        No music IDs have been collected yet. Check back soon.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
      {songs.map((song) => {
        const durationLabel = formatDuration(song.duration_seconds);
        return (
          <article
            key={song.asset_id}
            className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border/60 bg-surface shadow-soft transition duration-300 hover:-translate-y-1 hover:border-accent hover:shadow-xl"
          >
            <div className="flex flex-1 flex-col gap-4 p-4">
              <div className="flex items-start gap-4">
                <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl border border-border/60 bg-background/60 shadow-inner">
                  <MusicCoverImage
                    src={buildThumbnailUrl(song)}
                    alt={`${song.title} Roblox music`}
                    sizes="80px"
                    className="object-cover transition duration-500 group-hover:scale-105"
                  />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <h2 className="text-lg font-semibold leading-snug text-foreground line-clamp-2">{song.title}</h2>
                  <div className="space-y-1 text-xs text-muted">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Artist</span>
                      <span className="font-semibold text-foreground">{song.artist}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Album</span>
                      <span className="text-foreground">{song.album ?? "Single / Unknown"}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 rounded-full border border-border/50 bg-surface px-2.5 py-0.5 text-[11px] font-semibold text-foreground">
                  <span>Music ID</span>
                  <span className="font-mono text-[0.82rem]">{song.asset_id}</span>
                  <CopyCodeButton
                    code={String(song.asset_id)}
                    tone="surface"
                    size="sm"
                    analytics={{
                      event: "music_id_copy",
                      params: {
                        asset_id: song.asset_id,
                        artist: song.artist,
                        genre: song.genre ?? ""
                      }
                    }}
                  />
                </div>
                {song.rank ? (
                  <span className="inline-flex items-center rounded-full bg-accent/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-accent">
                    Top #{song.rank}
                  </span>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Duration</span>
                  <span className="font-semibold text-foreground">{durationLabel ?? "—"}</span>
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Genre</span>
                  <span className="font-semibold text-foreground">{song.genre ?? "—"}</span>
                </span>
              </div>

              <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
                <a
                  href={buildRobloxUrl(song.asset_id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-accent-dark dark:bg-accent-dark dark:hover:bg-accent"
                >
                  Play on Roblox
                </a>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function TrendingMusicList({ songs }: { songs: MusicRow[] }) {
  if (!songs.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 bg-surface/60 p-8 text-center text-muted">
        No trending music IDs are available yet. Check back soon.
      </div>
    );
  }

  return (
    <ol className="space-y-4">
      {songs.map((song, index) => {
        const durationLabel = formatDuration(song.duration_seconds);
        const rank = song.rank ?? index + 1;
        return (
          <li
            key={song.asset_id}
            className="group flex flex-col gap-4 rounded-2xl border border-border/60 bg-surface px-4 py-5 shadow-soft transition hover:-translate-y-0.5 hover:border-accent/70"
          >
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 text-xl font-semibold text-accent">
                #{rank}
              </div>
              <div className="relative h-14 w-14 overflow-hidden rounded-xl border border-border/60 bg-background/60 shadow-inner">
                <MusicCoverImage
                  src={buildThumbnailUrl(song)}
                  alt={`${song.title} Roblox music`}
                  sizes="56px"
                  className="object-cover transition duration-500 group-hover:scale-105"
                />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-lg font-semibold text-foreground line-clamp-2">{song.title}</p>
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                  <span className="font-semibold text-foreground">{song.artist}</span>
                  <span>{song.album ?? "Single / Unknown"}</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-xs text-muted">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Duration</span>
                  <span className="font-semibold text-foreground">{durationLabel ?? "—"}</span>
                </span>
                {song.genre ? (
                  <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-xs text-muted">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Genre</span>
                    <span className="font-semibold text-foreground">{song.genre}</span>
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 rounded-full border border-border/50 bg-surface px-3 py-1 text-xs font-semibold text-foreground">
                <span>Music ID</span>
                <span className="font-mono text-[0.85rem]">{song.asset_id}</span>
                <CopyCodeButton
                  code={String(song.asset_id)}
                  tone="surface"
                  size="sm"
                  analytics={{
                    event: "music_id_copy",
                    params: {
                      asset_id: song.asset_id,
                      artist: song.artist,
                      genre: song.genre ?? ""
                    }
                  }}
                />
              </div>
              <a
                href={buildRobloxUrl(song.asset_id)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-full bg-accent px-4 py-2 text-xs font-semibold text-white shadow-soft transition hover:bg-accent-dark dark:bg-accent-dark dark:hover:bg-accent"
              >
                Play on Roblox
              </a>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function renderRobloxMusicIdsPage({
  songs,
  total,
  totalPages,
  currentPage,
  showHero,
  contentHtml
}: {
  songs: MusicRow[];
  total: number;
  totalPages: number;
  currentPage: number;
  showHero: boolean;
  contentHtml?: CatalogContentHtml | null;
}) {
  const latest = songs.reduce<Date | null>((latestDate, song) => {
    if (!song.last_seen_at) return latestDate;
    const candidate = new Date(song.last_seen_at);
    if (!latestDate || candidate > latestDate) return candidate;
    return latestDate;
  }, null);
  const refreshedLabel = latest ? formatDistanceToNow(latest, { addSuffix: true }) : null;
  const introHtml = contentHtml?.introHtml?.trim() ? contentHtml?.introHtml : "";
  const descriptionHtml = contentHtml?.descriptionHtml ?? [];
  const howHtml = contentHtml?.howHtml?.trim() ? contentHtml?.howHtml : "";
  const faqHtml = contentHtml?.faqHtml ?? [];
  const baseTitle = contentHtml?.title?.trim() ? contentHtml.title.trim() : "Roblox music IDs";
  const updatedDate = contentHtml?.updatedAt ? new Date(contentHtml.updatedAt) : latest;
  const formattedUpdated = updatedDate
    ? updatedDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : null;
  const updatedRelativeLabel = updatedDate ? formatDistanceToNow(updatedDate, { addSuffix: true }) : null;
  const canonicalPath = currentPage > 1 ? `${BASE_PATH}/page/${currentPage}` : BASE_PATH;
  const canonicalUrl = `${SITE_URL.replace(/\/$/, "")}${canonicalPath}`;
  const pageTitle = currentPage > 1 ? `${baseTitle} - Page ${currentPage}` : baseTitle;
  const description = CATALOG_DESCRIPTION;
  const image = `${SITE_URL}/og-image.png`;
  const updatedIso = updatedDate ? updatedDate.toISOString() : new Date().toISOString();
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const breadcrumbNavItems: BreadcrumbItem[] = [
    { label: "Home", href: "/" },
    { label: "Catalog", href: "/catalog" },
    { label: "Roblox music IDs", href: currentPage > 1 ? BASE_PATH : null }
  ];
  if (currentPage > 1) {
    breadcrumbNavItems.push({ label: `Page ${currentPage}`, href: null });
  }
  const breadcrumbSchemaItems =
    currentPage > 1
      ? [
        { name: "Home", url: SITE_URL },
        { name: "Catalog", url: `${SITE_URL.replace(/\/$/, "")}/catalog` },
        { name: "Roblox music IDs", url: `${SITE_URL.replace(/\/$/, "")}${BASE_PATH}` },
        { name: `Page ${currentPage}`, url: canonicalUrl }
      ]
      : [
        { name: "Home", url: SITE_URL },
        { name: "Catalog", url: `${SITE_URL.replace(/\/$/, "")}/catalog` },
        { name: "Roblox music IDs", url: canonicalUrl }
      ];
  const hasDetails =
    Boolean(descriptionHtml.length) || Boolean(howHtml) || Boolean(faqHtml.length) ||
    Boolean(contentHtml?.ctaLabel && contentHtml?.ctaUrl);
  const listSchema = buildMusicItemListSchema({
    title: pageTitle,
    description,
    url: canonicalUrl,
    songs,
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
          <MusicBreadcrumb items={breadcrumbNavItems} />
          <h1 className="text-4xl font-semibold leading-tight text-foreground md:text-5xl">{baseTitle}</h1>
          {formattedUpdated ? (
            <p className="text-sm text-foreground/80">
              Updated on <span className="font-semibold text-foreground">{formattedUpdated}</span>
              {updatedRelativeLabel ? <span>{' '}({updatedRelativeLabel})</span> : null}
            </p>
          ) : null}
        </header>
      ) : (
        <header className="space-y-2">
          <MusicBreadcrumb items={breadcrumbNavItems} />
          <h1 className="text-3xl font-semibold text-foreground">{baseTitle}</h1>
          {formattedUpdated ? (
            <p className="text-sm text-foreground/80">
              Updated on <span className="font-semibold text-foreground">{formattedUpdated}</span>
              {updatedRelativeLabel ? <span>{' '}({updatedRelativeLabel})</span> : null}
            </p>
          ) : null}
          {refreshedLabel ? (
            <p className="text-sm text-muted">
              Updated {refreshedLabel} · Page {currentPage} of {totalPages}
            </p>
          ) : null}
        </header>
      )}

      {introHtml ? (
        <section className="article-content prose dark:prose-invert game-copy max-w-3xl" dangerouslySetInnerHTML={{ __html: introHtml }} />
      ) : null}

      <CatalogAdSlot />

      <MusicCatalogNav active="all" />

      <Suspense
        fallback={
          <div className="rounded-2xl border border-border/60 bg-surface/60 p-6 text-sm text-muted">
            Loading music IDs...
          </div>
        }
      >
        <MusicIdsBrowser
          initialSongs={songs}
          initialTotalPages={totalPages}
          currentPage={currentPage}
          basePath={BASE_PATH}
        />
      </Suspense>

      <CatalogAdSlot />

      {showHero && hasDetails ? (
        <section className="space-y-6">
          {descriptionHtml.length ? (
            <div className="article-content prose dark:prose-invert game-copy max-w-3xl">
              {descriptionHtml.map((entry) => (
                <div key={entry.key} dangerouslySetInnerHTML={{ __html: entry.html }} />
              ))}
            </div>
          ) : null}

          {howHtml ? (
            <div className="article-content prose dark:prose-invert game-copy max-w-3xl">
              <div dangerouslySetInnerHTML={{ __html: howHtml }} />
            </div>
          ) : null}

          {contentHtml?.ctaLabel && contentHtml?.ctaUrl ? (
            <div className="rounded-2xl border border-border/60 bg-surface/60 p-5 shadow-soft">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Next step</p>
                  <p className="text-lg font-semibold text-foreground">Keep exploring Roblox audio</p>
                </div>
                <a
                  href={contentHtml.ctaUrl}
                  className="inline-flex items-center justify-center rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-accent-dark dark:bg-accent-dark dark:hover:bg-accent"
                >
                  {contentHtml.ctaLabel}
                </a>
              </div>
            </div>
          ) : null}

          {faqHtml.length ? (
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
          ) : null}
        </section>
      ) : null}

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

export function buildGenreCards(genres: ValueOption[]) {
  if (!genres.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 bg-surface/60 p-8 text-center text-muted">
        No genre data is available yet. Check back soon.
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {genres.map((genre) => (
        <Link
          key={genre.slug}
          href={`${BASE_PATH}/genres/${genre.slug}`}
          className="group block h-full"
        >
          <article className="relative h-full overflow-hidden rounded-2xl border border-border/60 bg-surface p-5 shadow-soft transition hover:-translate-y-0.5 hover:border-accent/70">
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(255,255,255,0.3),transparent_55%)]"
            />
            <div className="relative space-y-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-muted">Genre</div>
              <h2 className="text-xl font-semibold text-foreground">{genre.label}</h2>
              <div className="flex items-center justify-between text-sm text-muted">
                <span>{formatCount(genre.count)} songs</span>
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-accent/80">Explore</span>
              </div>
            </div>
          </article>
        </Link>
      ))}
    </div>
  );
}

export function buildArtistCards(artists: ValueOption[]) {
  if (!artists.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 bg-surface/60 p-8 text-center text-muted">
        No artist data is available yet. Check back soon.
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {artists.map((artist) => (
        <Link
          key={artist.slug}
          href={`${BASE_PATH}/artists/${artist.slug}`}
          className="group block h-full"
        >
          <article className="relative h-full overflow-hidden rounded-2xl border border-border/60 bg-surface p-5 shadow-soft transition hover:-translate-y-0.5 hover:border-accent/70">
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(255,255,255,0.3),transparent_55%)]"
            />
            <div className="relative space-y-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-muted">Artist</div>
              <h2 className="text-xl font-semibold text-foreground">{artist.label}</h2>
              <div className="flex items-center justify-between text-sm text-muted">
                <span>{formatCount(artist.count)} songs</span>
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-accent/80">Browse</span>
              </div>
            </div>
          </article>
        </Link>
      ))}
    </div>
  );
}
