import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import "@/styles/article-content.css";
import { AuthorCard } from "@/components/AuthorCard";
import { ArticleCard } from "@/components/ArticleCard";
import { ChecklistCard } from "@/components/ChecklistCard";
import { ContentSlot } from "@/components/ContentSlot";
import { GameCard } from "@/components/GameCard";
import { SocialShare } from "@/components/SocialShare";
import { ToolCard } from "@/components/ToolCard";
import { CommentsSection } from "@/components/comments/CommentsSection";
import {
  listPublishedArticlesByUniverseId,
  listPublishedChecklistsByUniverseId,
  listGamesWithActiveCountsByUniverseId,
  type Author
} from "@/lib/db";
import { collectAuthorSocials } from "@/lib/author-socials";
import { renderMarkdown, markdownToPlainText } from "@/lib/markdown";
import { processHtmlLinks } from "@/lib/link-utils";
import { authorAvatarUrl } from "@/lib/avatar";
import { supabaseAdmin } from "@/lib/supabase";
import { CHECKLISTS_DESCRIPTION, SITE_NAME, SITE_URL, breadcrumbJsonLd, resolveSeoTitle, buildAlternates } from "@/lib/seo";
import { listPublishedToolsByUniverseId, type ToolListEntry } from "@/lib/tools";
import { EventTimePanel } from "./EventTimePanel";
import { EventEndCountdown } from "./EventEndCountdown";
import { buildEndCountdown, formatDateTimeLabel, formatDuration } from "./eventTimeFormat";

export const EVENTS_REVALIDATE_SECONDS = 3600;

type PageProps = {
  params: Promise<{ slug: string }>;
};

type UniverseSummary = {
  universe_id: number;
  display_name: string | null;
  name: string | null;
  icon_url: string | null;
  creator_name: string | null;
  creator_type: string | null;
};

type EventsPageRow = {
  id: string;
  universe_id: number;
  slug: string | null;
  title: string;
  content_md: string | null;
  seo_title: string | null;
  meta_description: string | null;
  author_id: string | null;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  author?: Author | null;
  universe?: UniverseSummary | null;
};

type EventsPageRowRaw = Omit<EventsPageRow, "universe" | "author"> & {
  universe?: UniverseSummary | UniverseSummary[] | null;
  author?: Author | Author[] | null;
};

type EventCategory = {
  category: string | null;
  rank: number | null;
};

type EventThumbnail = {
  media_id: number | null;
  rank: number | null;
};

type VirtualEvent = {
  event_id: string;
  universe_id: number;
  place_id: number | null;
  title: string | null;
  display_title: string | null;
  start_utc: string | null;
  end_utc: string | null;
  created_utc: string | null;
  updated_utc: string | null;
  event_status: string | null;
  event_visibility: string | null;
  featuring_status: string | null;
  all_thumbnails_created: boolean | null;
  host_name: string | null;
  host_has_verified_badge: boolean | null;
  host_type: string | null;
  host_id: number | null;
  event_summary_md: string | null;
  event_details_md: string | null;
  guide_slug: string | null;
  categories?: EventCategory[] | null;
  thumbnails?: EventThumbnail[] | null;
};

type EventWithThumbnail = VirtualEvent & {
  primary_thumbnail_url: string | null;
};

type UpcomingEventView = EventWithThumbnail & {
  summary_html: string | null;
  details_html: string | null;
};

type CurrentEventView = EventWithThumbnail & {
  summary_html: string | null;
};

const PT_TIME_ZONE = "America/Los_Angeles";
const PT_FORMATTER = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: PT_TIME_ZONE,
  timeZoneName: "short"
});
const EVENTS_IN_ARTICLE_AD_SLOT = "5764053793";

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function normalizeUniverse(value: UniverseSummary | UniverseSummary[] | null | undefined): UniverseSummary | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function normalizeAuthor(value: Author | Author[] | null | undefined): Author | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function formatPtDateTime(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return PT_FORMATTER.format(date);
}

function formatPtLongDateTime(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${formatDateTimeLabel(date, PT_TIME_ZONE)} PT`;
}

function parseDate(value: string | null): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

function eventUpdateTimestamp(event: VirtualEvent): number | null {
  const updated = parseDate(event.updated_utc);
  const created = parseDate(event.created_utc);
  if (updated === null && created === null) return null;
  if (updated === null) return created;
  if (created === null) return updated;
  return Math.max(updated, created);
}

function latestTimestamp(values: Array<number | null>): number | null {
  let latest: number | null = null;
  for (const value of values) {
    if (typeof value !== "number") continue;
    if (latest === null || value > latest) {
      latest = value;
    }
  }
  return latest;
}

function formatLabel(value: string | null): string | null {
  if (!value) return null;
  const cleaned = value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.replace(/\b\w/g, (char) => char.toUpperCase());
}

function resolveImageUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith("http")) return value;
  return `${SITE_URL.replace(/\/$/, "")}/${value.replace(/^\//, "")}`;
}

function toIsoString(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function mapEventStatusToSchema(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "cancelled" || normalized === "canceled") return "https://schema.org/EventCancelled";
  if (normalized === "postponed") return "https://schema.org/EventPostponed";
  if (normalized === "rescheduled") return "https://schema.org/EventRescheduled";
  if (normalized === "movedonline" || normalized === "moved_online" || normalized === "moved-online") {
    return "https://schema.org/EventMovedOnline";
  }
  if (normalized === "scheduled") return "https://schema.org/EventScheduled";
  return null;
}

function buildEventDescription(event: VirtualEvent): string | null {
  const summary = normalizeText(event.event_summary_md);
  if (summary) return markdownToPlainText(summary).slice(0, 200);
  const details = normalizeText(event.event_details_md);
  if (details) return markdownToPlainText(details).slice(0, 200);
  return null;
}

function getPrimaryThumbnailUrl(event: VirtualEvent | EventWithThumbnail): string | null {
  if (!("primary_thumbnail_url" in event)) return null;
  return typeof event.primary_thumbnail_url === "string" ? event.primary_thumbnail_url : null;
}

function getEventDisplayName(event: VirtualEvent): string {
  return normalizeText(event.display_title) ?? normalizeText(event.title) ?? "Upcoming event";
}

function getEventNameForTitle(event: VirtualEvent): string | null {
  return normalizeText(event.display_title) ?? normalizeText(event.title);
}

function buildDynamicTitle(gameName: string, upcomingEventName: string | null): string {
  if (upcomingEventName) {
    return `When is Next ${gameName} Update? [${upcomingEventName}]`;
  }
  return `When is Next ${gameName} Update?`;
}

function sortByRank<T extends { rank?: number | null }>(items: T[] = []): T[] {
  return [...items].sort((a, b) => {
    const aRank = a.rank ?? Number.POSITIVE_INFINITY;
    const bRank = b.rank ?? Number.POSITIVE_INFINITY;
    return aRank - bRank;
  });
}

type RobloxThumbnailResponse = {
  data?: Array<{ targetId?: number; imageUrl?: string; state?: string }>;
};

async function fetchThumbnailUrls(mediaIds: number[]): Promise<Map<number, string>> {
  if (!mediaIds.length) return new Map();
  const params = new URLSearchParams({
    assetIds: mediaIds.join(","),
    size: "768x432",
    format: "Png",
    isCircular: "false"
  });

  try {
    const res = await fetch(`https://thumbnails.roblox.com/v1/assets?${params.toString()}`, {
      next: { revalidate: EVENTS_REVALIDATE_SECONDS }
    });
    if (!res.ok) return new Map();
    const payload = (await res.json()) as RobloxThumbnailResponse;
    const map = new Map<number, string>();
    for (const item of payload.data ?? []) {
      if (typeof item.targetId === "number" && typeof item.imageUrl === "string") {
        map.set(item.targetId, item.imageUrl);
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

function classifyEvents(events: VirtualEvent[]) {
  const now = Date.now();
  const current: VirtualEvent[] = [];
  const upcoming: VirtualEvent[] = [];
  const past: VirtualEvent[] = [];

  for (const event of events) {
    const startTime = parseDate(event.start_utc);
    const endTime = parseDate(event.end_utc);
    const status = event.event_status?.toLowerCase() ?? "";

    let bucket: "current" | "upcoming" | "past";
    if (status === "ended" || status === "cancelled") {
      bucket = "past";
    } else if (startTime !== null && startTime > now) {
      bucket = "upcoming";
    } else if (endTime !== null && endTime < now) {
      bucket = "past";
    } else {
      bucket = "current";
    }

    if (bucket === "current") current.push(event);
    if (bucket === "upcoming") upcoming.push(event);
    if (bucket === "past") past.push(event);
  }

  const sortByStartAsc = (a: VirtualEvent, b: VirtualEvent) => {
    const aStart = parseDate(a.start_utc) ?? Number.POSITIVE_INFINITY;
    const bStart = parseDate(b.start_utc) ?? Number.POSITIVE_INFINITY;
    return aStart - bStart;
  };
  const sortByStartDesc = (a: VirtualEvent, b: VirtualEvent) => {
    const aStart = parseDate(a.start_utc) ?? 0;
    const bStart = parseDate(b.start_utc) ?? 0;
    return bStart - aStart;
  };

  current.sort(sortByStartDesc);
  upcoming.sort(sortByStartAsc);
  past.sort(sortByStartDesc);

  return { current, upcoming, past };
}

export async function loadEventsPage(slug: string): Promise<EventsPageRow | null> {
  const sb = supabaseAdmin();
  const normalized = slug.trim().toLowerCase();
  const { data, error } = await sb
    .from("events_pages")
    .select(
      "id, universe_id, slug, title, content_md, seo_title, meta_description, author_id, is_published, published_at, created_at, updated_at, author:authors(id,name,slug,avatar_url,gravatar_email,bio_md,twitter,youtube,website,facebook,linkedin,instagram,roblox,discord,created_at,updated_at), universe:roblox_universes(universe_id, display_name, name, icon_url, creator_name, creator_type)"
    )
    .eq("slug", normalized)
    .eq("is_published", true)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const raw = data as EventsPageRowRaw;
  return {
    ...raw,
    universe: normalizeUniverse(raw.universe),
    author: normalizeAuthor(raw.author)
  };
}

async function loadEvents(universeId: number): Promise<VirtualEvent[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("roblox_virtual_events")
    .select(
      "event_id, universe_id, place_id, title, display_title, start_utc, end_utc, created_utc, updated_utc, event_status, event_visibility, featuring_status, all_thumbnails_created, host_name, host_has_verified_badge, host_type, host_id, event_summary_md, event_details_md, guide_slug, categories:roblox_virtual_event_categories(category, rank), thumbnails:roblox_virtual_event_thumbnails(media_id, rank)"
    )
    .eq("universe_id", universeId)
    .order("start_utc", { ascending: true });

  if (error) throw error;
  return (data ?? []) as VirtualEvent[];
}

async function loadEventsForMetadata(universeId: number): Promise<VirtualEvent[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("roblox_virtual_events")
    .select("event_id, title, display_title, start_utc, end_utc, event_status")
    .eq("universe_id", universeId);

  if (error) throw error;
  return (data ?? []) as VirtualEvent[];
}

function getPrimaryMediaId(event: VirtualEvent): number | null {
  const mediaIds = sortByRank(event.thumbnails ?? [])
    .map((entry) => entry.media_id)
    .filter((entry): entry is number => typeof entry === "number");
  return mediaIds[0] ?? null;
}

async function attachPrimaryThumbnails(events: VirtualEvent[]): Promise<EventWithThumbnail[]> {
  if (!events.length) return [];
  const entries = events.map((event) => ({
    event,
    primaryMediaId: getPrimaryMediaId(event)
  }));
  const mediaIds = Array.from(
    new Set(entries.map((entry) => entry.primaryMediaId).filter((entry): entry is number => typeof entry === "number"))
  );
  const urlMap = await fetchThumbnailUrls(mediaIds);

  return entries.map(({ event, primaryMediaId }) => ({
    ...event,
    primary_thumbnail_url: typeof primaryMediaId === "number" ? urlMap.get(primaryMediaId) ?? null : null
  }));
}

async function hydrateUpcoming(events: VirtualEvent[]): Promise<UpcomingEventView[]> {
  const withThumbnails = await attachPrimaryThumbnails(events);
  const hydrated = await Promise.all(
    withThumbnails.map(async (event) => {
      const summary_md = normalizeText(event.event_summary_md);
      const details_md = normalizeText(event.event_details_md);
      const summary_html = summary_md ? await renderMarkdown(summary_md) : null;
      const details_html = details_md ? await renderMarkdown(details_md) : null;
      return {
        ...event,
        summary_html,
        details_html
      };
    })
  );
  return hydrated;
}

async function hydrateCurrent(events: VirtualEvent[]): Promise<CurrentEventView[]> {
  const withThumbnails = await attachPrimaryThumbnails(events);
  return Promise.all(
    withThumbnails.map(async (event) => {
      const summary_md = normalizeText(event.event_summary_md);
      const summary_html = summary_md ? await renderMarkdown(summary_md) : null;
      return {
        ...event,
        summary_html
      };
    })
  );
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = await loadEventsPage(slug);
  if (!page) return {};

  const universeName = page.universe?.display_name ?? page.universe?.name ?? "this game";
  const metadataEvents = await loadEventsForMetadata(page.universe_id);
  const metadataUpcoming = classifyEvents(metadataEvents).upcoming;
  const metadataFirstUpcoming = metadataUpcoming[0] ? getEventNameForTitle(metadataUpcoming[0]) : null;
  const dynamicTitle = buildDynamicTitle(universeName, metadataFirstUpcoming);
  const seoTitle = normalizeText(page.seo_title) ? resolveSeoTitle(page.seo_title) ?? page.seo_title : dynamicTitle;
  const description =
    normalizeText(page.meta_description) ||
    (page.content_md ? markdownToPlainText(page.content_md).slice(0, 160) : `Current, upcoming, and past events for ${universeName}.`);
  const canonical = `${SITE_URL}/events/${page.slug}`;
  const pageUpdated = parseDate(page.updated_at ?? page.published_at ?? page.created_at);
  const eventsUpdated = latestTimestamp(metadataEvents.map(eventUpdateTimestamp));
  const updatedTimestamp = latestTimestamp([pageUpdated, eventsUpdated]);
  const publishedIso = new Date(page.published_at ?? page.created_at).toISOString();
  const updatedIso = typeof updatedTimestamp === "number" ? new Date(updatedTimestamp).toISOString() : publishedIso;

  return {
    title: seoTitle ? `${seoTitle} | ${SITE_NAME}` : SITE_NAME,
    description,
    alternates: buildAlternates(canonical),
    openGraph: {
      type: "article",
      url: canonical,
      title: seoTitle ?? SITE_NAME,
      description,
      siteName: SITE_NAME,
      publishedTime: publishedIso,
      modifiedTime: updatedIso
    },
    twitter: {
      card: "summary_large_image",
      title: seoTitle ?? SITE_NAME,
      description
    }
  };
}

function EventFacts({ event }: { event: VirtualEvent }) {
  const featuringLabel = formatLabel(event.featuring_status);
  const hostLabel = event.host_name ? `${event.host_name}${event.host_type ? ` (${event.host_type})` : ""}` : null;
  const startLabel = formatPtDateTime(event.start_utc) ?? "TBA";
  const endLabel = formatPtDateTime(event.end_utc) ?? "TBA";
  const createdLabel = formatPtDateTime(event.created_utc);
  const updatedLabel = formatPtDateTime(event.updated_utc);

  return (
    <dl className="grid gap-3 text-xs text-muted sm:grid-cols-2 lg:grid-cols-3">
      <div>
        <dt className="font-semibold uppercase tracking-wide text-foreground/70">Starts (PT)</dt>
        <dd className="mt-1 text-foreground">{startLabel}</dd>
      </div>
      <div>
        <dt className="font-semibold uppercase tracking-wide text-foreground/70">Ends (PT)</dt>
        <dd className="mt-1 text-foreground">{endLabel}</dd>
      </div>
      {featuringLabel ? (
        <div>
          <dt className="font-semibold uppercase tracking-wide text-foreground/70">Featuring</dt>
          <dd className="mt-1 text-foreground">{featuringLabel}</dd>
        </div>
      ) : null}
      {hostLabel ? (
        <div>
          <dt className="font-semibold uppercase tracking-wide text-foreground/70">Host</dt>
          <dd className="mt-1 text-foreground">{hostLabel}</dd>
        </div>
      ) : null}
      {typeof event.place_id === "number" ? (
        <div>
          <dt className="font-semibold uppercase tracking-wide text-foreground/70">Place ID</dt>
          <dd className="mt-1 text-foreground">{event.place_id}</dd>
        </div>
      ) : null}
      <div>
        <dt className="font-semibold uppercase tracking-wide text-foreground/70">Event ID</dt>
        <dd className="mt-1 text-foreground">{event.event_id}</dd>
      </div>
      {createdLabel ? (
        <div>
          <dt className="font-semibold uppercase tracking-wide text-foreground/70">Created (PT)</dt>
          <dd className="mt-1 text-foreground">{createdLabel}</dd>
        </div>
      ) : null}
      {updatedLabel ? (
        <div>
          <dt className="font-semibold uppercase tracking-wide text-foreground/70">Updated (PT)</dt>
          <dd className="mt-1 text-foreground">{updatedLabel}</dd>
        </div>
      ) : null}
    </dl>
  );
}

async function ThumbnailGrid({ event, limit = 4 }: { event: VirtualEvent; limit?: number }) {
  const mediaIds = sortByRank(event.thumbnails ?? [])
    .map((entry) => entry.media_id)
    .filter((entry): entry is number => typeof entry === "number")
    .slice(0, limit);

  if (!mediaIds.length) return null;

  const urlMap = await fetchThumbnailUrls(mediaIds);
  const thumbnails = mediaIds
    .map((mediaId) => ({ mediaId, url: urlMap.get(mediaId) }))
    .filter((entry): entry is { mediaId: number; url: string } => typeof entry.url === "string");

  if (!thumbnails.length) return null;

  return (
    <div className="grid grid-cols-2 gap-3">
      {thumbnails.map(({ mediaId, url }) => (
        <div
          key={mediaId}
          className="relative aspect-[4/3] overflow-hidden rounded-xl border border-border/60 bg-surface-muted"
        >
          <Image
            src={url}
            alt="Event media"
            fill
            sizes="(max-width: 768px) 50vw, 320px"
            className="object-cover"
            loading="lazy"
          />
        </div>
      ))}
    </div>
  );
}

function EventGuideLink({ guideSlug, eventId }: { guideSlug: string | null; eventId: string }) {
  if (!guideSlug) return null;
  return (
    <Link
      href={`/articles/${guideSlug}`}
      className="text-xs font-semibold uppercase tracking-wide text-accent underline-offset-4 hover:underline"
      data-analytics-event="event_guide_click"
      data-analytics-event-id={eventId}
      data-analytics-guide-slug={guideSlug}
    >
      Event guide
    </Link>
  );
}

function UpcomingEventBlock({ event }: { event: UpcomingEventView }) {
  const eventName = getEventDisplayName(event);

  return (
    <section className="space-y-8">
      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-[2rem] font-semibold leading-[1.15] text-foreground">
            {eventName} Event: Release Date and Time, Countdown and What to Expect
          </h2>
          <EventGuideLink guideSlug={event.guide_slug} eventId={event.event_id} />
        </div>
        {event.summary_html ? (
          <div
            className="article-content prose dark:prose-invert max-w-none game-copy"
            dangerouslySetInnerHTML={{ __html: event.summary_html }}
          />
        ) : null}
      </header>

      <div className="space-y-4">
        <h3 className="text-[1.6rem] font-semibold leading-[1.2] text-foreground">
          When is the {eventName} start time
        </h3>
        <EventTimePanel
          startUtc={event.start_utc}
          endUtc={event.end_utc}
          eventName={eventName}
          thumbnailUrl={event.primary_thumbnail_url}
        />
      </div>


      {event.details_html ? (
        <div className="space-y-4">
          <div
            className="article-content prose dark:prose-invert max-w-none game-copy"
            dangerouslySetInnerHTML={{ __html: event.details_html }}
          />
          <div>
            <a
              href={`https://www.roblox.com/events/${event.event_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-border/60 px-4 py-2 text-sm font-semibold text-foreground transition hover:border-accent hover:text-accent"
            >
              View event on Roblox
            </a>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function CurrentEventCard({ event }: { event: CurrentEventView }) {
  const eventName = getEventDisplayName(event);
  const startLabel = formatPtLongDateTime(event.start_utc);
  const endLabel = formatPtLongDateTime(event.end_utc);
  const startTime = parseDate(event.start_utc);
  const endTime = parseDate(event.end_utc);
  const durationLabel =
    typeof startTime === "number" && typeof endTime === "number" ? formatDuration(endTime - startTime) : null;
  const initialCountdown = typeof endTime === "number" ? buildEndCountdown(endTime, Date.now()) : null;
  const backgroundImage = resolveImageUrl(event.primary_thumbnail_url);
  const startIso = toIsoString(event.start_utc);
  const endIso = toIsoString(event.end_utc);

  return (
    <article className="relative overflow-hidden rounded-2xl border border-border/60 bg-surface/60 shadow-soft">
      {backgroundImage ? (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${backgroundImage})` }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/40" />
      )}
      <div className="absolute inset-0 bg-white/85 dark:bg-black/75" />
      <div className="relative z-10 grid gap-6 p-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)] lg:items-start">
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted">Live now</p>
            <h3 className="text-xl font-semibold text-foreground">{eventName}</h3>
          </div>
          {event.summary_html ? (
            <div
              className="article-content prose dark:prose-invert game-copy max-w-none"
              dangerouslySetInnerHTML={{ __html: event.summary_html }}
            />
          ) : null}
          <div className="text-sm text-foreground/90">
            {startLabel ? (
              <p>
                The event started on{" "}
                <time dateTime={startIso ?? undefined} className="font-semibold text-foreground">
                  {startLabel}
                </time>
                {durationLabel && endLabel ? (
                  <>
                    . It runs for {durationLabel} and ends on{" "}
                    <time dateTime={endIso ?? undefined} className="font-semibold text-foreground">
                      {endLabel}
                    </time>
                    .
                  </>
                ) : endLabel ? (
                  <>
                    . It ends on{" "}
                    <time dateTime={endIso ?? undefined} className="font-semibold text-foreground">
                      {endLabel}
                    </time>
                    .
                  </>
                ) : (
                  "."
                )}
              </p>
            ) : (
              <p>Start time not announced yet.</p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted">Time left</p>
            <EventEndCountdown endUtc={event.end_utc} initialLabel={initialCountdown} />
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={`https://www.roblox.com/events/${event.event_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-white/90 px-4 py-2 text-sm font-semibold text-foreground transition hover:border-accent hover:text-accent dark:bg-black/60"
            >
              Open on Roblox
            </a>
            {event.guide_slug ? (
              <Link
                href={`/articles/${event.guide_slug}`}
                className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-white/90 px-4 py-2 text-sm font-semibold text-foreground transition hover:border-accent hover:text-accent dark:bg-black/60"
                data-analytics-event="event_guide_click"
                data-analytics-event-id={event.event_id}
                data-analytics-guide-slug={event.guide_slug}
              >
                Read event guide
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

function PastEventsTable({ events }: { events: VirtualEvent[] }) {
  if (!events.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border/70 bg-surface-muted/60 p-6">
        <div className="article-content prose dark:prose-invert game-copy max-w-none">
          <p>No past events listed yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="table-scroll-wrapper">
      <div className="table-scroll-inner game-copy">
        <table>
          <thead>
            <tr>
              <th>Event</th>
              <th className="table-col-compact">Starts (PT)</th>
              <th className="table-col-compact">Ends (PT)</th>
              <th className="table-col-compact">Guide</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => {
              const eventName = getEventDisplayName(event);
              const startLabel = formatPtDateTime(event.start_utc) ?? "TBA";
              const endLabel = formatPtDateTime(event.end_utc) ?? "TBA";
              return (
                <tr key={event.event_id}>
                  <td className="font-semibold text-foreground">{eventName}</td>
                  <td>{startLabel}</td>
                  <td>{endLabel}</td>
                  <td>
                    {event.guide_slug ? (
                      <Link
                        href={`/articles/${event.guide_slug}`}
                        className="text-xs font-semibold uppercase tracking-wide text-accent underline-offset-4 hover:underline"
                        data-analytics-event="event_guide_click"
                        data-analytics-event-id={event.event_id}
                        data-analytics-guide-slug={event.guide_slug}
                      >
                        Guide
                      </Link>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export async function renderEventsPage({ slug }: { slug: string }) {
  const page = await loadEventsPage(slug);
  if (!page) {
    notFound();
  }

  const universeName = page.universe?.display_name ?? page.universe?.name ?? "this game";
  const events = await loadEvents(page.universe_id);
  const grouped = classifyEvents(events);
  const pastEvents = grouped.past;
  const currentEvents = await hydrateCurrent(grouped.current);
  const upcomingEvents = await hydrateUpcoming(grouped.upcoming);
  const firstUpcomingName = upcomingEvents[0] ? getEventNameForTitle(upcomingEvents[0]) : null;
  const dynamicTitle = buildDynamicTitle(universeName, firstUpcomingName);
  const headingTitle = normalizeText(page.title) ?? dynamicTitle;
  const [introHtmlRaw, authorBioHtml] = await Promise.all([
    page.content_md ? renderMarkdown(page.content_md) : Promise.resolve(""),
    page.author?.bio_md ? renderMarkdown(page.author.bio_md) : Promise.resolve("")
  ]);
  const introHtml = introHtmlRaw?.trim() ? introHtmlRaw : null;
  const processedAuthorBioHtml = authorBioHtml ? processHtmlLinks(authorBioHtml) : null;
  const universeId = page.universe_id;
  const universeLabel = page.universe?.display_name ?? page.universe?.name ?? universeName;
  const canonicalSlug = page.slug ?? slug;
  const canonicalUrl = `${SITE_URL}/events/${canonicalSlug}`;
  const pageUpdated = parseDate(page.updated_at ?? page.published_at ?? page.created_at);
  const eventsUpdated = latestTimestamp(events.map(eventUpdateTimestamp));
  const updatedTimestamp = latestTimestamp([pageUpdated, eventsUpdated]);
  const updatedDate = typeof updatedTimestamp === "number" ? new Date(updatedTimestamp) : null;
  const formattedUpdated = updatedDate
    ? updatedDate.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: PT_TIME_ZONE
    })
    : null;
  const updatedRelativeLabel = updatedDate ? formatDistanceToNow(updatedDate, { addSuffix: true }) : null;
  const authorAvatar = page.author ? authorAvatarUrl(page.author, 72) : null;
  const authorProfileUrl = page.author?.slug ? `${SITE_URL.replace(/\/$/, "")}/authors/${page.author.slug}` : null;
  const authorSameAs = page.author ? Array.from(new Set(collectAuthorSocials(page.author).map((link) => link.url))) : [];
  const authorBioPlain = page.author?.bio_md ? markdownToPlainText(page.author.bio_md) : null;
  const descriptionPlain =
    normalizeText(page.meta_description) ??
    (page.content_md
      ? markdownToPlainText(page.content_md).slice(0, 180)
      : `Current, upcoming, and past events for ${universeName}.`);
  const publishedIso = new Date(page.published_at ?? page.created_at).toISOString();
  const updatedIso = typeof updatedTimestamp === "number" ? new Date(updatedTimestamp).toISOString() : publishedIso;
  const heroImageCandidate =
    upcomingEvents.find((event) => event.primary_thumbnail_url)?.primary_thumbnail_url ?? page.universe?.icon_url ?? null;
  const coverImage = resolveImageUrl(heroImageCandidate) ?? `${SITE_URL}/og-image.png`;

  const relatedChecklists = universeId ? await listPublishedChecklistsByUniverseId(universeId, 1) : [];
  const relatedCodes = universeId ? await listGamesWithActiveCountsByUniverseId(universeId, 1) : [];
  const relatedArticles = universeId ? await listPublishedArticlesByUniverseId(universeId, 5, 0) : [];
  const relatedTools: ToolListEntry[] = universeId ? await listPublishedToolsByUniverseId(universeId, 3) : [];
  const relatedHeading = relatedArticles.length ? `${universeLabel} articles` : null;
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

  const schemaEvents = [...upcomingEvents, ...currentEvents, ...pastEvents]
    .map((event) => {
      const name = getEventDisplayName(event);
      const startDate = toIsoString(event.start_utc);
      const endDate = toIsoString(event.end_utc);
      const eventStatus = mapEventStatusToSchema(event.event_status);
      const description = buildEventDescription(event);
      const categories = sortByRank(event.categories ?? [])
        .map((entry) => normalizeText(entry.category))
        .filter((entry): entry is string => Boolean(entry));
      const hostName = normalizeText(event.host_name);
      const hostType = normalizeText(event.host_type)?.toLowerCase();
      const isOrgHost = hostType ? ["group", "studio", "organization"].some((value) => hostType.includes(value)) : false;
      const organizer = hostName
        ? {
          "@type": isOrgHost ? "Organization" : "Person",
          name: hostName,
          ...(event.host_id ? { identifier: event.host_id } : {})
        }
        : null;
      const imageCandidate = getPrimaryThumbnailUrl(event) ?? coverImage;
      const imageUrl = resolveImageUrl(imageCandidate) ?? coverImage;

      return {
        "@type": "Event",
        "@id": `${canonicalUrl}#event-${event.event_id}`,
        name,
        ...(startDate ? { startDate } : {}),
        ...(endDate ? { endDate } : {}),
        ...(eventStatus ? { eventStatus } : {}),
        ...(description ? { description } : {}),
        ...(categories.length ? { category: categories } : {}),
        ...(imageUrl ? { image: [imageUrl] } : {}),
        ...(organizer ? { organizer } : {}),
        eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
        isAccessibleForFree: true,
        location: { "@type": "VirtualLocation", url: canonicalUrl },
        about: { "@type": "VideoGame", name: universeLabel, operatingSystem: "Roblox" },
        identifier: event.event_id
      };
    })
    .filter((entry) => Boolean(entry));

  const blogPostingSchema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    url: canonicalUrl,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": canonicalUrl
    },
    headline: headingTitle,
    description: descriptionPlain,
    datePublished: publishedIso,
    dateModified: updatedIso,
    image: {
      "@type": "ImageObject",
      url: coverImage
    },
    author: page.author
      ? {
        "@type": "Person",
        name: page.author.name,
        ...(authorProfileUrl ? { url: authorProfileUrl } : {}),
        ...(authorBioPlain ? { description: authorBioPlain } : {}),
        ...(authorSameAs.length ? { sameAs: authorSameAs } : {})
      }
      : {
        "@type": "Organization",
        name: SITE_NAME,
        url: SITE_URL
      },
    publisher: {
      "@id": `${SITE_URL.replace(/\/$/, "")}/#organization`
    },
    articleSection: "Roblox Events",
    inLanguage: "en-US",
    isAccessibleForFree: true,
    about: { "@type": "VideoGame", name: universeLabel, operatingSystem: "Roblox" }
  });

  const eventListSchema = schemaEvents.length
    ? JSON.stringify({
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: `${universeLabel} events`,
      numberOfItems: schemaEvents.length,
      itemListElement: schemaEvents.map((event, index) => ({
        "@type": "ListItem",
        position: index + 1,
        item: event
      }))
    })
    : null;

  const breadcrumbData = JSON.stringify(
    breadcrumbJsonLd([
      { name: "Home", url: SITE_URL },
      { name: "Events", url: `${SITE_URL.replace(/\/$/, "")}/events` },
      { name: universeLabel, url: canonicalUrl }
    ])
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,1.25fr)]">
      <article className="min-w-0">
        <header className="mb-6 space-y-3">
          <nav aria-label="Breadcrumb" className="text-xs uppercase tracking-[0.25em] text-muted">
            <ol className="flex flex-wrap items-center gap-2">
              {[
                { label: "Home", href: "/" },
                { label: "Events", href: null },
                { label: universeName, href: null }
              ].map((item, index, items) => (
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
          <h1 className="text-4xl font-bold text-foreground md:text-5xl">{headingTitle}</h1>
          {page.author || formattedUpdated ? (
            <div className="flex flex-col gap-3 text-sm text-muted">
              <div className="flex flex-wrap items-center gap-2">
                {page.author ? (
                  <div className="flex items-center gap-2">
                    <img
                      src={authorAvatar || "https://www.gravatar.com/avatar/?d=mp"}
                      alt={page.author.name}
                      className="h-9 w-9 rounded-full border border-border/40 object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                    <span>
                      Authored by {authorProfileUrl ? (
                        <Link
                          href={`/authors/${page.author.slug}`}
                          className="font-semibold text-foreground transition hover:text-accent"
                          data-analytics-event="author_click"
                          data-analytics-codes-url={canonicalUrl}
                          data-analytics-author-url={`/authors/${page.author.slug}`}
                        >
                          {page.author.name}
                        </Link>
                      ) : (
                        <span className="font-semibold text-foreground">{page.author.name}</span>
                      )}
                    </span>
                  </div>
                ) : (
                  <span className="font-semibold text-foreground">Published by {SITE_NAME}</span>
                )}
                {formattedUpdated ? (
                  <>
                    <span aria-hidden="true">•</span>
                    <span className="text-foreground/80">
                      Updated on <span className="font-semibold text-foreground">{formattedUpdated}</span>
                      {updatedRelativeLabel ? <span>{' '}({updatedRelativeLabel})</span> : null}
                    </span>
                  </>
                ) : null}
              </div>
            </div>
          ) : null}
        </header>
        {introHtml ? (
          <article
            className="article-content prose dark:prose-invert max-w-none game-copy mb-10"
            dangerouslySetInnerHTML={{ __html: introHtml }}
          />
        ) : null}
        {upcomingEvents.length > 0 ? (
          <div className="article-content prose dark:prose-invert max-w-none game-copy mb-8">
            <p>
              {upcomingEvents.length === 1
                ? `Right now, there is 1 upcoming event for ${universeName}.`
                : `Right now, there are ${upcomingEvents.length} upcoming events for ${universeName}.`}
            </p>
          </div>
        ) : null}

        <ContentSlot slot={EVENTS_IN_ARTICLE_AD_SLOT} className="my-8" />

        <div className="space-y-10">
          <section className="space-y-6">
            {upcomingEvents.length ? (
              <div className="space-y-10">
                {upcomingEvents.map((event) => (
                  <UpcomingEventBlock key={event.event_id} event={event} />
                ))}
              </div>
            ) : (
              <div className="article-content prose dark:prose-invert game-copy max-w-none">
                {(() => {
                  // Get the last known event (current or most recent past event)
                  const lastEvent = currentEvents.length > 0
                    ? currentEvents[0]
                    : pastEvents.length > 0
                      ? pastEvents[0]
                      : null;

                  // Get developer name from universe creator
                  const creatorName = page.universe?.creator_name;
                  const creatorType = page.universe?.creator_type?.toLowerCase();
                  const developerName = creatorName
                    ? (creatorType === 'group' ? `${creatorName} group` : creatorName)
                    : "the developer";

                  if (!lastEvent) {
                    return (
                      <p>
                        However, {developerName} has not announced any new details on upcoming events yet.
                        We update this page as soon as the developer announces a new event. So stay updated.
                      </p>
                    );
                  }

                  const eventName = getEventDisplayName(lastEvent);
                  const isCurrentlyRunning = currentEvents.length > 0;

                  if (isCurrentlyRunning) {
                    const startDatePT = formatPtLongDateTime(lastEvent.start_utc);
                    return (
                      <p>
                        However, {developerName} has not announced any new details on upcoming events.
                        The last known event was <strong>{eventName}</strong> which started on{' '}
                        {startDatePT ? <strong>{startDatePT}</strong> : <strong>an unspecified date</strong>} and is still running.
                        You can check the details below.
                      </p>
                    );
                  } else {
                    const endDatePT = formatPtLongDateTime(lastEvent.end_utc);
                    return (
                      <p>
                        However, {developerName} has not announced any new details on upcoming events.
                        The last known event was <strong>{eventName}</strong> which ended on{' '}
                        {endDatePT ? <strong>{endDatePT}</strong> : <strong>an unspecified date</strong>}.
                        We update this page as soon as the developer announces a new event. So stay updated.
                      </p>
                    );
                  }
                })()}
              </div>
            )}
          </section>

          {currentEvents.length > 0 ? (
            <section className="space-y-6">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted">Live now</p>
                  <h2 className="text-[2rem] font-semibold leading-[1.15] text-foreground">Current events</h2>
                </div>
                <span className="text-xs text-muted">{currentEvents.length} active</span>
              </div>
              <div className="space-y-6">
                {currentEvents.map((event) => (
                  <CurrentEventCard key={event.event_id} event={event} />
                ))}
              </div>
            </section>
          ) : null}

          <section className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted">Archive</p>
                <h2 className="text-[2rem] font-semibold leading-[1.15] text-foreground">Past events</h2>
              </div>
              <span className="text-xs text-muted">{grouped.past.length} events</span>
            </div>
            <PastEventsTable events={pastEvents} />
          </section>
        </div>

        {page.author ? <AuthorCard author={page.author} bioHtml={processedAuthorBioHtml ?? ""} /> : null}

        <div className="mt-10">
          <CommentsSection entityType="event" entityId={page.id} />
        </div>

        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: blogPostingSchema }} />
        {eventListSchema ? (
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: eventListSchema }} />
        ) : null}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: breadcrumbData }} />
      </article>

      <aside className="space-y-4">
        <section className="space-y-3">
          <SocialShare
            url={canonicalUrl}
            title={headingTitle}
            heading="Share this page"
            analytics={{ contentType: "event", itemId: canonicalSlug }}
          />
        </section>

        {relatedCodes.length ? (
          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-foreground">Codes for {universeLabel}</h3>
            <div className="grid gap-3">
              {relatedCodes.map((g) => (
                <div
                  key={g.id}
                  className="block"
                  data-analytics-event="related_content_click"
                  data-analytics-source-type="events_sidebar"
                  data-analytics-target-type="codes"
                  data-analytics-target-slug={g.slug}
                >
                  <GameCard game={g} titleAs="p" />
                </div>
              ))}
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
                  data-analytics-source-type="events_sidebar"
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
              {relatedArticles.map((item) => (
                <div
                  key={item.id}
                  className="block"
                  data-analytics-event="related_content_click"
                  data-analytics-source-type="events_sidebar"
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
                  data-analytics-source-type="events_sidebar"
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
