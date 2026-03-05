import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { IconType } from "react-icons";
import { FaFacebook, FaTelegramPlane, FaTwitch, FaUsers, FaYoutube, FaDiscord } from "react-icons/fa";
import { RiTwitterXLine } from "react-icons/ri";
import { SiGooglechrome, SiGuilded, SiRoblox } from "react-icons/si";
import { formatDistanceToNow } from "date-fns";
import "@/styles/article-content.css";
import { renderMarkdown, markdownToPlainText } from "@/lib/markdown";
import { processHtmlLinks } from "@/lib/link-utils";
import { logger } from "@/lib/logger";
import { ActiveCodes } from "@/components/ActiveCodes";
import { ExpiredCodes } from "@/components/ExpiredCodes";
import { GameCard } from "@/components/GameCard";
import { ToolCard } from "@/components/ToolCard";
import { EventsPageCard, type EventsPageCardProps } from "@/components/EventsPageCard";
import { SocialShare } from "@/components/SocialShare";
import { ContentSlot } from "@/components/ContentSlot";
import { CodeBlockEnhancer } from "@/components/CodeBlockEnhancer";
import { monthYear } from "@/lib/date";
import { authorAvatarUrl } from "@/lib/avatar";
import { AuthorCard } from "@/components/AuthorCard";
import { collectAuthorSocials } from "@/lib/author-socials";
import { sortCodesByFirstSeenDesc } from "@/lib/code-utils";
import {
  getGameBySlug,
  getEventsPageByUniverseId,
  getRobloxUniverseById,
  listGamesWithActiveCounts,
  listGamesWithActiveCountsByUniverseId,
  listPublishedCodeSlugs,
  listPublishedArticlesByUniverseId,
  listPublishedChecklistsByUniverseId
} from "@/lib/db";
import type { Code, GameWithCounts } from "@/lib/db";
import { listPublishedToolsByUniverseId, type ToolListEntry } from "@/lib/tools";
import {
  CHECKLISTS_DESCRIPTION,
  CODES_DESCRIPTION,
  EVENTS_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
  breadcrumbJsonLd,
  resolveSeoTitle,
  buildAlternates,
} from "@/lib/seo";
import { replaceLinkPlaceholders } from "@/lib/link-placeholders";
import { extractHowToSteps } from "@/lib/how-to";
import { ChecklistCard } from "@/components/ChecklistCard";
import { ArticleCard } from "@/components/ArticleCard";
import { CommentsSection } from "@/components/comments/CommentsSection";
import { formatUpdatedLabel } from "@/lib/updated-label";
import { getUniverseEventSummary } from "@/lib/events-summary";
import { resolveModifiedAt, resolvePublishedAt } from "@/lib/content-dates";

export const revalidate = 86400; // daily
const MAX_STATIC_CODE_SLUGS = 150;

const CODES_IN_ARTICLE_AD_SLOT = "6147197177";

export type Params = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const slugs = await listPublishedCodeSlugs();
  return slugs.slice(0, MAX_STATIC_CODE_SLUGS).map((slug) => ({ slug }));
}

interface FaqEntry {
  question: string;
  answer: string;
}

function extractFaqEntries(markdown?: string | null): FaqEntry[] {
  if (!markdown) return [];

  const lines = markdown.split(/\r?\n/);
  const entries: FaqEntry[] = [];
  let currentQuestion: string | null = null;
  let answerLines: string[] = [];

  function pushCurrent() {
    if (!currentQuestion) return;
    const question = markdownToPlainText(currentQuestion).trim();
    const answer = markdownToPlainText(answerLines.join("\n")).trim();
    if (question && answer) {
      entries.push({ question, answer });
    }
    currentQuestion = null;
    answerLines = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const headingMatch = line.match(/^##\s+(.+)$/);
    if (headingMatch) {
      pushCurrent();
      currentQuestion = headingMatch[1].trim();
      continue;
    }

    if (!currentQuestion) {
      continue;
    }

    if (/^#\s+/.test(line)) {
      pushCurrent();
      continue;
    }

    answerLines.push(rawLine);
  }

  pushCurrent();

  return entries.slice(0, 8);
}

/**
 * Validates if a string is a valid HTTP/HTTPS URL
 */
function isValidUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Normalizes and validates a URL string
 * - Trims whitespace
 * - Adds https:// if no protocol is present
 * - Validates the resulting URL
 * - Returns null for invalid URLs
 */
function normalizeUrl(value?: string | null): string | null {
  if (!value) return null;

  // Trim and check for empty string
  let trimmed = value.trim();
  if (!trimmed) return null;

  // Add https:// if no protocol is present
  if (!/^https?:\/\//i.test(trimmed)) {
    // Remove any leading slashes that might cause issues
    trimmed = `https://${trimmed.replace(/^[\s/]+/, '')}`;
  }

  // Validate the URL before returning
  return isValidUrl(trimmed) ? trimmed : null;
}

function summarize(text: string | null | undefined, fallback: string): string {
  if (!text) return fallback;
  const plain = markdownToPlainText(text).trim();
  if (!plain) return fallback;
  if (plain.length <= 160) return plain;
  const slice = plain.slice(0, 157);
  const lastSpace = slice.lastIndexOf(" ");
  return `${lastSpace > 120 ? slice.slice(0, lastSpace) : slice}…`;
}

function normalizeLinkForDedup(url: string): string | null {
  try {
    const parsed = new URL(url);
    // Remove hash and query params
    parsed.hash = "";
    parsed.search = "";
    // Normalize to lowercase
    let normalized = parsed.toString().toLowerCase();
    // Remove trailing slash for consistency
    normalized = normalized.replace(/\/$/, "");
    // Normalize www prefix
    normalized = normalized.replace(/^https?:\/\/www\./, "https://");
    return normalized;
  } catch {
    return null;
  }
}

function normalizeCategory(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed || null;
}

function pickSuggestedCodes(
  allGames: GameWithCounts[],
  currentGameId: string,
  genreL1: string | null,
  genreL2: string | null
): GameWithCounts[] {
  const pool = allGames.filter((g) => g.id !== currentGameId);
  const sorted = [...pool].sort((a, b) => {
    const aDate = a.content_updated_at || a.updated_at || a.created_at;
    const bDate = b.content_updated_at || b.updated_at || b.created_at;
    const aTime = aDate ? new Date(aDate).getTime() : 0;
    const bTime = bDate ? new Date(bDate).getTime() : 0;
    return bTime - aTime;
  });

  const result: GameWithCounts[] = [];
  const seen = new Set<string>();
  const add = (items: GameWithCounts[]) => {
    for (const item of items) {
      if (seen.has(item.id)) continue;
      result.push(item);
      seen.add(item.id);
      if (result.length >= 3) break;
    }
  };

  if (genreL2) {
    add(sorted.filter((g) => normalizeCategory((g as any).genre_l2 ?? null) === genreL2));
  }
  if (result.length < 3 && genreL1) {
    add(sorted.filter((g) => normalizeCategory((g as any).genre_l1 ?? null) === genreL1));
  }
  if (result.length < 3) {
    add(sorted);
  }

  return result.slice(0, 3);
}

type UniverseSocialLink = {
  platform: string;
  url: string;
  title?: string | null;
};

const UNIVERSE_SOCIAL_META: Record<string, { label: string; icon: IconType }> = {
  twitter: { label: "Twitter / X", icon: RiTwitterXLine },
  youtube: { label: "YouTube", icon: FaYoutube },
  discord: { label: "Discord", icon: FaDiscord },
  twitch: { label: "Twitch", icon: FaTwitch },
  facebook: { label: "Facebook", icon: FaFacebook },
  roblox_group: { label: "Roblox Group", icon: SiRoblox },
  guilded: { label: "Guilded", icon: SiGuilded }
};

const DEFAULT_SOCIAL_META: { label: string; icon: IconType } = {
  label: "Website",
  icon: SiGooglechrome
};

type SocialLinkButton = { key: string; url: string; label: string; Icon: IconType };

function buildCreatorSocialLink(universe?: {
  creator_id: number | null;
  creator_type: string | null;
  creator_name: string | null;
} | null): SocialLinkButton | null {
  if (!universe) return null;
  const { creator_id: creatorId, creator_type: creatorTypeRaw, creator_name: creatorNameRaw } = universe;
  if (creatorId == null) return null;
  const creatorType = creatorTypeRaw?.toLowerCase();
  const creatorName = creatorNameRaw?.trim();
  if (!creatorType || !creatorName) return null;

  if (creatorType === "user") {
    return {
      key: `creator-user-${creatorId}`,
      url: `https://www.roblox.com/users/${creatorId}/profile`,
      label: creatorName,
      Icon: SiRoblox
    };
  }
  if (creatorType === "group") {
    return {
      key: `creator-group-${creatorId}`,
      url: `https://www.roblox.com/communities/${creatorId}`,
      label: creatorName,
      Icon: FaUsers
    };
  }
  return null;
}

function extractUniverseSocialLinks(raw: unknown): UniverseSocialLink[] {
  if (!raw || typeof raw !== "object") return [];
  const record = raw as Record<string, unknown>;
  const entries: UniverseSocialLink[] = [];
  for (const [platform, value] of Object.entries(record)) {
    if (!Array.isArray(value)) continue;
    for (const entry of value) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as Record<string, unknown>;
      const rawUrl = record.url;
      const url = typeof rawUrl === "string" ? rawUrl.trim() : "";
      if (!url) continue;
      const title = typeof record.title === "string" ? record.title : null;
      entries.push({
        platform,
        url,
        title
      });
    }
  }
  return entries;
}

function extractHandleFromUrl(platform: string, url: string): string | null {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").map((part) => part.trim()).filter(Boolean);
    let handle = segments.length ? segments[segments.length - 1] : parsed.hostname;
    if (!handle) return null;
    if (handle.includes("?")) {
      handle = handle.split("?")[0];
    }
    handle = handle.replace(/\/+$/, "");
    if (!handle) return null;
    if (platform === "twitter") {
      handle = handle.replace(/^@/, "");
      return handle ? `@${handle}` : null;
    }
    if (platform === "youtube" && handle.startsWith("@")) {
      return handle;
    }
    return handle;
  } catch {
    return null;
  }
}

function formatSocialLabel(platform: string, link: UniverseSocialLink, creatorName?: string | null): string {
  if (platform === "roblox_group") {
    return creatorName ? `${creatorName} Roblox Community` : "Roblox Community";
  }
  if (platform === "discord") {
    return "Discord";
  }
  const handle = extractHandleFromUrl(platform, link.url);
  if (handle) return handle;
  return link.title?.trim() || UNIVERSE_SOCIAL_META[platform]?.label || DEFAULT_SOCIAL_META.label;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const game = await getGameBySlug(slug);

  if (!game || !game.is_published) {
    notFound();
  }

  const codes = Array.isArray((game as any).codes) ? ((game as any).codes as Code[]) : [];
  const latestCodeFirstSeen = codes.reduce<string | null>((latest, code) => {
    if (code.status !== "active") return latest;
    if (!code.first_seen_at) return latest;
    if (!latest || code.first_seen_at > latest) return code.first_seen_at;
    return latest;
  }, null);
  const activeCount = codes.filter((code) => code.status === "active").length;
  const baselineUpdatedAt = resolveModifiedAt(game) ?? game.updated_at;
  const lastContentUpdate = latestCodeFirstSeen && baselineUpdatedAt && latestCodeFirstSeen > baselineUpdatedAt
    ? latestCodeFirstSeen
    : baselineUpdatedAt ?? game.updated_at;
  const when = monthYear();
  const title =
    resolveSeoTitle(game.seo_title) || `${game.name} Codes (${when}) - ${activeCount} Active Codes`;
  const descriptionRaw =
    game.seo_description ||
    `Get the latest ${game.name} codes for ${when} and redeem them for free in-game rewards. Updated daily with only active and working codes.`;
  const description = descriptionRaw?.trim() || CODES_DESCRIPTION;
  const canonicalUrl = `${SITE_URL}/codes/${game.slug}`;
  const coverImage = game.cover_image?.startsWith("http")
    ? game.cover_image
    : game.cover_image
      ? `${SITE_URL.replace(/\/$/, "")}/${game.cover_image.replace(/^\//, "")}`
      : `${SITE_URL}/og-image.png`;
  const publishedTimeRaw = resolvePublishedAt(game);
  const publishedTime = publishedTimeRaw ? new Date(publishedTimeRaw).toISOString() : undefined;
  const modifiedTime = new Date(lastContentUpdate).toISOString();
  const otherMeta: Record<string, string> = {};
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
    alternates: buildAlternates(canonicalUrl),
    authors: [{ name: SITE_NAME, url: SITE_URL }],
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
      authors: [SITE_NAME]
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      creator: "@bloxodes",
      site: "@bloxodes",
      images: [coverImage]
    },
    ...(Object.keys(otherMeta).length ? { other: otherMeta } : {})
  };
}

async function fetchGameData(slug: string) {
  try {
    const game = await getGameBySlug(slug);
    if (!game || !game.is_published) return { error: 'NOT_FOUND' as const };

    const codes = Array.isArray((game as any).codes) ? ((game as any).codes as Code[]) : [];
    const universe = (game as any).universe ?? null;

    return { game, codes, universe };
  } catch (error) {
    logger.error('Failed to fetch game data', {
      slug,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return { error: 'FETCH_ERROR' as const };
  }
}

export default async function GamePage({ params }: Params) {
  const { slug } = await params;
  const result = await fetchGameData(slug);

  if (result.error === 'NOT_FOUND') {
    notFound();
  }

  if (result.error === 'FETCH_ERROR') {
    // Consider redirecting to an error page or showing a custom error component
    throw new Error('Failed to load game data. Please try again later.');
  }

  const { game, codes, universe } = result;
  const active = codes.filter(c => c.status === "active");
  const nowMs = Date.now();
  const sortedActive = sortCodesByFirstSeenDesc(active);

  // Get expired codes from codes table (tracked with timestamps)
  const expiredFromCodesTable = codes
    .filter(c => c.status === "expired")
    .sort((a, b) => {
      // Sort by last_seen_at descending (most recent first)
      const aTime = a.last_seen_at ? new Date(a.last_seen_at).getTime() : 0;
      const bTime = b.last_seen_at ? new Date(b.last_seen_at).getTime() : 0;
      return bTime - aTime;
    })
    .map(c => c.code);

  // Get legacy expired codes from games.expired_codes (no timestamps)
  const legacyExpiredCodes = Array.isArray(game.expired_codes) ? game.expired_codes : [];
  const legacyExpiredWithoutSpaces = legacyExpiredCodes.filter(code =>
    typeof code === "string" && !/\s/.test(code)
  );

  // Create a Set of codes from the codes table to avoid duplicates
  const expiredCodesSet = new Set(expiredFromCodesTable.map(code => code.toUpperCase()));

  // Filter out legacy codes that are already in the codes table
  const uniqueLegacyExpired = legacyExpiredWithoutSpaces.filter(code =>
    !expiredCodesSet.has(code.toUpperCase())
  );

  // Merge: recent expired codes first, then legacy codes
  const expiredWithoutSpaces = [...expiredFromCodesTable, ...uniqueLegacyExpired];
  const latestCodeFirstSeen = codes.reduce<string | null>((latest, code) => {
    if (code.status !== "active") return latest;
    if (!code.first_seen_at) return latest;
    if (!latest || code.first_seen_at > latest) return code.first_seen_at;
    return latest;
  }, null);

  const baselineUpdatedAt = resolveModifiedAt(game) ?? game.updated_at;
  const lastContentUpdate = latestCodeFirstSeen && baselineUpdatedAt && latestCodeFirstSeen > baselineUpdatedAt
    ? latestCodeFirstSeen
    : baselineUpdatedAt ?? game.updated_at;

  const lastUpdatedFormatted = new Date(lastContentUpdate).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

  const lastChecked = codes.reduce((acc, c) => (acc > c.last_seen_at ? acc : c.last_seen_at), game.updated_at);
  const allCodePages = await listGamesWithActiveCounts();
  const currentGenreL2 = normalizeCategory(universe?.genre_l2 ?? (game as any).genre_l2 ?? null);
  const currentGenreL1 = normalizeCategory(universe?.genre_l1 ?? (game as any).genre_l1 ?? null);
  const suggestedCodes = pickSuggestedCodes(allCodePages, game.id, currentGenreL1, currentGenreL2);

  const lastCheckedDate = new Date(lastChecked);
  const lastCheckedDatePart = lastCheckedDate.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const lastCheckedFormatted = lastCheckedDatePart;

  const lastCheckedRelativeLabel = (() => {
    const now = new Date();
    const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const checkedUtc = Date.UTC(
      lastCheckedDate.getUTCFullYear(),
      lastCheckedDate.getUTCMonth(),
      lastCheckedDate.getUTCDate()
    );
    const diffDays = Math.round((todayUtc - checkedUtc) / (24 * 60 * 60 * 1000));
    switch (diffDays) {
      case 0:
        return "Today";
      case 1:
        return "Yesterday";
      case 2:
        return "2 days ago";
      default:
        return null;
    }
  })();

  const universeDeveloperName = universe?.creator_name ? universe.creator_name.trim() : null;
  const universeSocialLinks = extractUniverseSocialLinks(universe?.social_links ?? null);

  const linkMap = {
    roblox_link: normalizeUrl(game.roblox_link) ?? normalizeUrl(game.source_url),
    community_link: normalizeUrl(game.community_link),
    discord_link: normalizeUrl(game.discord_link),
    twitter_link: normalizeUrl(game.twitter_link),
    youtube_link: normalizeUrl(game.youtube_link),
  } as const;

  const creatorProfileLink = buildCreatorSocialLink(universe);

  const normalizedUniverseSocialLinks: SocialLinkButton[] = universeSocialLinks
    .map((link) => {
      const url = normalizeUrl(link.url);
      if (!url) return null;
      const meta = UNIVERSE_SOCIAL_META[link.platform] ?? DEFAULT_SOCIAL_META;
      return {
        key: `${link.platform}-${url}`,
        url,
        label: formatSocialLabel(link.platform, link, universeDeveloperName),
        Icon: meta.icon
      };
    })
    .filter((link): link is SocialLinkButton => Boolean(link));

  const robloxSocialButtons: SocialLinkButton[] = [
    ...(creatorProfileLink ? [creatorProfileLink] : []),
    ...normalizedUniverseSocialLinks
  ];

  const fallbackSocialLinks: SocialLinkButton[] = [
    linkMap.community_link
      ? { key: "community", url: linkMap.community_link, label: "Community", Icon: FaUsers }
      : null,
    linkMap.discord_link
      ? { key: "discord", url: linkMap.discord_link, label: "Discord", Icon: FaDiscord }
      : null,
    linkMap.twitter_link
      ? { key: "twitter", url: linkMap.twitter_link, label: "Twitter / X", Icon: RiTwitterXLine }
      : null,
    linkMap.youtube_link
      ? { key: "youtube", url: linkMap.youtube_link, label: "YouTube", Icon: FaYoutube }
      : null
  ].filter((link): link is SocialLinkButton => Boolean(link));

  const dedupedLinks = (() => {
    const ordered = [
      ...normalizedUniverseSocialLinks,
      ...(creatorProfileLink ? [creatorProfileLink] : []),
      ...fallbackSocialLinks
    ];
    const map = new Map<string, SocialLinkButton>();
    for (const link of ordered) {
      const key = normalizeLinkForDedup(link.url);
      if (!key) continue;
      if (map.has(key)) continue;
      map.set(key, link);
    }
    return Array.from(map.values());
  })();

  const socialLinksToDisplay = dedupedLinks;
  const shouldShowSocialSection = Boolean(universe || socialLinksToDisplay.length);

  const introMarkdown = game.intro_md ? replaceLinkPlaceholders(game.intro_md, linkMap) : "";
  const redeemMarkdown = game.redeem_md ? replaceLinkPlaceholders(game.redeem_md, linkMap) : "";
  const troubleshootMarkdown = game.troubleshoot_md ? replaceLinkPlaceholders(game.troubleshoot_md, linkMap) : "";
  const rewardsMarkdown = game.rewards_md ? replaceLinkPlaceholders(game.rewards_md, linkMap) : "";
  const descriptionMarkdown = game.description_md ? replaceLinkPlaceholders(game.description_md, linkMap) : "";
  const aboutMarkdown = game.about_game_md ? replaceLinkPlaceholders(game.about_game_md, linkMap) : "";
  const findCodesMarkdown = game.find_codes_md ? replaceLinkPlaceholders(game.find_codes_md, linkMap) : "";
  const interlinkMarkdown = game.interlinking_ai_copy_md ?? "";

  const redeemSteps = extractHowToSteps(redeemMarkdown || game.redeem_md);

  const [introHtml, redeemHtml, interlinkHtml, troubleshootHtml, rewardsHtml, descriptionHtml, aboutHtml, findCodesHtml] = await Promise.all([
    introMarkdown ? renderMarkdown(introMarkdown) : "",
    redeemMarkdown ? renderMarkdown(redeemMarkdown) : "",
    interlinkMarkdown ? renderMarkdown(interlinkMarkdown) : "",
    troubleshootMarkdown ? renderMarkdown(troubleshootMarkdown) : "",
    rewardsMarkdown ? renderMarkdown(rewardsMarkdown) : "",
    descriptionMarkdown ? renderMarkdown(descriptionMarkdown) : "",
    aboutMarkdown ? renderMarkdown(aboutMarkdown) : "",
    findCodesMarkdown ? renderMarkdown(findCodesMarkdown) : ""
  ]);
  const hasSupplemental = Boolean(troubleshootHtml || rewardsHtml || aboutHtml);

  const canonicalUrl = `${SITE_URL}/codes/${game.slug}`;
  const coverImage = game.cover_image?.startsWith("http")
    ? game.cover_image
    : game.cover_image
      ? `${SITE_URL.replace(/\/$/, "")}/${game.cover_image.replace(/^\//, "")}`
      : `${SITE_URL}/og-image.png`;
  const metaDescriptionRaw = markdownToPlainText(
    game.seo_description ||
    `Get the latest ${game.name} codes for ${monthYear()} and redeem them for free in-game rewards. Updated daily with only active and working codes.`
  );
  const metaDescription = metaDescriptionRaw?.trim() || CODES_DESCRIPTION;
  const authorMeta =
    game.author && game.author.name
      ? {
        name: game.author.name,
        url: game.author.slug ? `${SITE_URL}/authors/${game.author.slug}` : undefined
      }
      : null;
  const publishedAt = resolvePublishedAt(game) ?? game.created_at;
  const publishedIso = new Date(publishedAt).toISOString();
  const updatedIso = new Date(lastContentUpdate).toISOString();
  const lastCheckedIso = new Date(lastChecked).toISOString();
  const siteBaseUrl = SITE_URL.replace(/\/$/, "");
  const breadcrumbs = [
    { name: "Home", url: SITE_URL },
    { name: "Codes", url: `${SITE_URL.replace(/\/$/, "")}/codes` },
    { name: game.name ?? "Roblox", url: canonicalUrl }
  ];
  const breadcrumbData = JSON.stringify(breadcrumbJsonLd(breadcrumbs));
  const breadcrumbNavItems = [
    { label: "Home", href: "/" },
    { label: "Codes", href: "/codes" },
    { label: game.name ?? "Roblox", href: null }
  ];
  const authorBioHtml = game.author?.bio_md ? await renderMarkdown(game.author.bio_md) : "";
  const authorAvatar = game.author ? authorAvatarUrl(game.author, 72) : null;
  const authorProfileUrl = game.author?.slug ? `/authors/${game.author.slug}` : null;
  const authorSameAs = game.author ? Array.from(new Set(collectAuthorSocials(game.author).map((link) => link.url))) : [];
  const authorBioPlain = game.author?.bio_md ? markdownToPlainText(game.author.bio_md) : null;
  const activeCodesItemList = sortedActive.map((code, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: code.code,
    item: {
      "@type": "Thing",
      name: `${game.name} code ${code.code}`,
      description: code.rewards_text ?? undefined,
      url: canonicalUrl
    }
  }));
  const faqEntries: { question: string; answer: string }[] = [];
  if (hasSupplemental) {
    if (troubleshootMarkdown) {
      const answer = markdownToPlainText(troubleshootMarkdown).trim();
      if (answer) faqEntries.push({ question: "Why codes might fail", answer });
    }
    if (rewardsMarkdown) {
      const answer = markdownToPlainText(rewardsMarkdown).trim();
      if (answer) faqEntries.push({ question: "Rewards from these codes", answer });
    }
    if (aboutMarkdown) {
      const answer = markdownToPlainText(aboutMarkdown).trim();
      if (answer) faqEntries.push({ question: `About ${game.name}`, answer });
    }
    if (findCodesMarkdown) {
      const answer = markdownToPlainText(findCodesMarkdown).trim();
      if (answer) {
        faqEntries.push({ question: "How to get new codes fast?", answer });
      }
    }
  } else if (descriptionMarkdown) {
    const answer = markdownToPlainText(descriptionMarkdown).trim();
    if (answer) faqEntries.push({ question: `About ${game.name}`, answer });
  }

  const universeLabel = universe?.display_name ?? universe?.name ?? game.name;
  const universeId = game.universe_id ?? null;
  const universeMeta = universeId ? await getRobloxUniverseById(universeId) : null;
  const relatedChecklists = universeId ? await listPublishedChecklistsByUniverseId(universeId, 1) : [];
  const relatedArticles = universeId ? await listPublishedArticlesByUniverseId(universeId, 3) : [];
  const relatedTools: ToolListEntry[] = universeId ? await listPublishedToolsByUniverseId(universeId, 3) : [];
  const relatedEventsPage = universeId ? await getEventsPageByUniverseId(universeId) : null;
  const eventSummary = universeId ? await getUniverseEventSummary(universeId) : null;
  const relatedGame = universeId ? await listGamesWithActiveCountsByUniverseId(universeId, 1) : [];
  const gameCreatedOnLabel = universeMeta?.created_at_api
    ? new Date(universeMeta.created_at_api).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC"
      })
    : null;
  const gameDetailRows = [
    universe?.creator_name
      ? { label: "Developer", value: universe.creator_name }
      : null,
    gameCreatedOnLabel
      ? { label: "Game created on", value: gameCreatedOnLabel }
      : null,
    universe?.genre_l1 || universe?.genre_l2
      ? { label: "Genre", value: [universe.genre_l1, universe.genre_l2].filter(Boolean).join(", ") }
      : null,
    (universe?.desktop_enabled || universe?.mobile_enabled || universe?.tablet_enabled ||
      universe?.console_enabled || universe?.vr_enabled)
      ? {
          label: "Platforms",
          value: [
            universe.desktop_enabled && "Desktop",
            universe.mobile_enabled && "Mobile",
            universe.tablet_enabled && "Tablet",
            universe.console_enabled && "Console",
            universe.vr_enabled && "VR"
          ].filter(Boolean).join(", ")
        }
      : null
  ].filter((row): row is { label: string; value: string } => Boolean(row));
  const hasGameAboutDescription = Boolean(universe?.game_description_md);

  const relatedChecklistCards = relatedChecklists.map((row) => {
    const summary = summarize(row.seo_description ?? row.description_md ?? null, CHECKLISTS_DESCRIPTION);
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
      summary,
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
        <nav aria-label="Breadcrumb" className="mb-4 text-xs uppercase tracking-[0.25em] text-muted">
          <ol className="flex flex-wrap items-center gap-2">
            {breadcrumbNavItems.map((item, index) => (
              <li key={`${item.label}-${index}`} className="flex items-center gap-2">
                {item.href ? (
                  <Link href={item.href} className="font-semibold text-muted transition hover:text-accent">
                    {item.label}
                  </Link>
                ) : (
                  <span className="font-semibold text-foreground/80">{item.label}</span>
                )}
                {index < breadcrumbNavItems.length - 1 ? <span className="text-muted/60">&gt;</span> : null}
              </li>
            ))}
          </ol>
        </nav>
        <header className="mb-6">
          <h1 className="text-4xl font-bold text-foreground md:text-5xl" itemProp="headline">
            {game.name} Codes ({monthYear()})
          </h1>
          <div className="mt-4 flex flex-col gap-3 text-sm text-muted">
            <div className="flex flex-wrap items-center gap-2">
              {game.author ? (
                <div className="flex items-center gap-2" itemProp="author" itemScope itemType="https://schema.org/Person">
                  {authorProfileUrl ? <link itemProp="url" href={authorProfileUrl} /> : null}
                  {authorBioPlain ? <meta itemProp="description" content={authorBioPlain} /> : null}
                  {authorSameAs.map((url) => (
                    <link key={url} itemProp="sameAs" href={url} />
                  ))}
                  <img
                    src={authorAvatar || "https://www.gravatar.com/avatar/?d=mp"}
                    alt={game.author.name}
                    className="h-9 w-9 rounded-full border border-border/40 object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                  <span>
                    Authored by {game.author.slug ? (
                      <Link
                        href={`/authors/${game.author.slug}`}
                        className="font-semibold text-foreground transition hover:text-accent"
                        itemProp="name"
                        data-analytics-event="author_click"
                        data-analytics-codes-url={canonicalUrl}
                        data-analytics-author-url={`/authors/${game.author.slug}`}
                      >
                        {game.author.name}
                      </Link>
                    ) : (
                      <span className="font-semibold text-foreground" itemProp="name">
                        {game.author.name}
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
                Updated on <span className="font-semibold text-foreground">{lastUpdatedFormatted}</span>
              </span>
            </div>
          </div>
        </header>

        <div id="article-body" itemProp="articleBody" className="article-content">
        {introHtml ? (
          <div
            className="article-content prose dark:prose-invert mb-8 max-w-none game-copy"
            dangerouslySetInnerHTML={processHtmlLinks(introHtml)}
          />
        ) : null}

        <div className="mb-8">
          <ActiveCodes
            codes={sortedActive}
            gameName={game.name}
            gameSlug={game.slug}
            lastUpdatedLabel={lastUpdatedFormatted}
            lastCheckedLabel={lastCheckedFormatted}
            lastCheckedRelativeLabel={lastCheckedRelativeLabel}
            coverImage={game.cover_image}
            nowMs={nowMs}
          />
        </div>

        <ContentSlot slot={CODES_IN_ARTICLE_AD_SLOT} className="mb-8" />

        {redeemHtml ? (
          <>
            <div
              className="article-content prose dark:prose-invert mb-8 max-w-none game-copy"
              dangerouslySetInnerHTML={processHtmlLinks(redeemHtml)}
            />
            <ContentSlot slot={CODES_IN_ARTICLE_AD_SLOT} className="mb-8" />
          </>
        ) : null}
        {interlinkHtml ? (
          <div
            className="article-content prose dark:prose-invert mb-8 max-w-none game-copy"
            dangerouslySetInnerHTML={processHtmlLinks(interlinkHtml)}
          />
        ) : null}
        <div className="panel mb-8 space-y-3 px-5 pb-5 pt-0" id="expired-codes">
          <ExpiredCodes codes={expiredWithoutSpaces} gameName={game.name} gameSlug={game.slug} />
        </div>

        {hasSupplemental ? (
          <>
            {troubleshootHtml ? (
              <>
                <div
                  className="article-content prose dark:prose-invert mb-8 max-w-none game-copy"
                  dangerouslySetInnerHTML={processHtmlLinks(troubleshootHtml)}
                />
                <ContentSlot slot={CODES_IN_ARTICLE_AD_SLOT} className="mb-8" />
              </>
            ) : null}

            {rewardsHtml ? (
              <div
                className="article-content prose dark:prose-invert mb-8 max-w-none game-copy"
                dangerouslySetInnerHTML={processHtmlLinks(rewardsHtml)}
              />
            ) : null}

            {shouldShowSocialSection ? (
              <div className="mb-8 space-y-4" id={`more-${game.slug}-codes`}>
                {findCodesHtml ? (
                  <div
                    className="article-content prose dark:prose-invert max-w-none game-copy"
                    dangerouslySetInnerHTML={processHtmlLinks(findCodesHtml)}
                  />
                ) : null}
                {socialLinksToDisplay.length ? (
                  <div className="mt-4 flex flex-wrap gap-3">
                    {socialLinksToDisplay.map(({ key, url, label, Icon }) => (
                      <a
                        key={key}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-analytics-event="social_follow_click"
                        data-analytics-platform={key}
                        data-analytics-game-slug={game.slug}
                        className="inline-flex items-center gap-2 rounded-full border border-border/60 px-4 py-2 text-sm font-semibold text-foreground transition hover:border-accent hover:text-accent"
                      >
                        <Icon className="h-4 w-4" aria-hidden />
                        <span>{label}</span>
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted">We haven't found any official social media links yet.</p>
                )}
                <p className="article-content prose dark:prose-invert max-w-none game-copy">
                  We keep track of these sources and update this page as soon as new codes drop. Bookmark this page or follow our channels to get the codes right away.
                </p>
                <div className="flex flex-wrap gap-3">
                  <a
                    href="https://t.me/bloxodes"
                    target="_blank"
                    rel="noopener noreferrer"
                    data-analytics-event="social_follow_click"
                    data-analytics-platform="telegram"
                    data-analytics-game-slug={game.slug}
                    className="inline-flex items-center gap-2 rounded-full border border-border/60 px-4 py-2 text-sm font-semibold text-foreground transition hover:border-accent hover:text-accent"
                  >
                    <FaTelegramPlane className="h-4 w-4" aria-hidden />
                    <span>@bloxodes</span>
                  </a>
                  <a
                    href="https://twitter.com/bloxodes"
                    target="_blank"
                    rel="noopener noreferrer"
                    data-analytics-event="social_follow_click"
                    data-analytics-platform="x"
                    data-analytics-game-slug={game.slug}
                    className="inline-flex items-center gap-2 rounded-full border border-border/60 px-4 py-2 text-sm font-semibold text-foreground transition hover:border-accent hover:text-accent"
                  >
                    <RiTwitterXLine className="h-4 w-4" aria-hidden />
                    <span>@bloxodes</span>
                  </a>
                  <a
                    href="https://chromewebstore.google.com/detail/bloxodes-%E2%80%93-roblox-game-co/mammkedlehmpechknaicfakljaogcmhc"
                    target="_blank"
                    rel="noopener noreferrer"
                    data-analytics-event="social_follow_click"
                    data-analytics-platform="chrome_extension"
                    data-analytics-game-slug={game.slug}
                    className="inline-flex items-center gap-2 rounded-full border border-border/60 px-4 py-2 text-sm font-semibold text-foreground transition hover:border-accent hover:text-accent"
                  >
                    <SiGooglechrome className="h-4 w-4" aria-hidden />
                    <span>Install Chrome Extension</span>
                  </a>
                </div>
              </div>
            ) : null}

          </>
        ) : descriptionHtml ? (
          <div
            className="article-content prose dark:prose-invert mb-8 max-w-none game-copy"
            dangerouslySetInnerHTML={processHtmlLinks(descriptionHtml)}
          />
        ) : null}

        {universe ? (
          <div className="mb-8" id="game-details">
            <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border/65 shadow-soft">
              <div className="border-b border-border/60 px-5 py-4 sm:px-6">
                <h2 className="text-2xl font-bold leading-tight text-foreground">
                  About {universe.display_name || universe.name || game.name}
                </h2>
              </div>

              {gameDetailRows.length ? (
                <div className="grid gap-3 border-b border-border/60 px-5 py-5 sm:grid-cols-2 sm:px-6 xl:grid-cols-4">
                  {gameDetailRows.map((row) => (
                    <div
                      key={row.label}
                      className="rounded-[var(--radius-sm)] border border-border/60 px-4 py-3"
                    >
                      <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-muted">
                        {row.label}
                      </dt>
                      <dd className="mt-1 text-sm font-semibold leading-6 text-foreground">{row.value}</dd>
                    </div>
                  ))}
                </div>
              ) : null}

              {hasGameAboutDescription ? (
                <div className="px-5 py-5 sm:px-6">
                  <div
                    className="article-content prose dark:prose-invert max-w-none game-copy text-foreground"
                    dangerouslySetInnerHTML={processHtmlLinks(universe.game_description_md || "")}
                  />
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        </div>

        {game.author ? (
          <div className="mt-10">
            <AuthorCard author={game.author} bioHtml={authorBioHtml} />
          </div>
        ) : null}

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                breadcrumbJsonLd(breadcrumbs),
                {
                  "@type": "BlogPosting",
                  url: canonicalUrl,
                  mainEntityOfPage: {
                    "@type": "WebPage",
                    "@id": canonicalUrl
                  },
                  headline: `${game.name} Codes (${monthYear()})`,
                  datePublished: publishedIso,
                  dateModified: updatedIso,
                  image: {
                    "@type": "ImageObject",
                    url: coverImage,
                    thumbnailUrl: coverImage
                  },
                  author: game.author
                    ? {
                      "@type": "Person",
                      name: game.author.name,
                      ...(authorProfileUrl ? { url: `${SITE_URL.replace(/\/$/, "")}${authorProfileUrl}` } : {}),
                      ...(authorBioPlain ? { description: authorBioPlain } : {}),
                      ...(authorSameAs.length ? { sameAs: authorSameAs } : {})
                    }
                    : {
                      "@type": "Organization",
                      name: SITE_NAME,
                      url: SITE_URL
                    },
                  publisher: { "@id": `${SITE_URL.replace(/\/$/, "")}/#organization` },
                  about: {
                    "@type": "VideoGame",
                    name: game.name,
                    operatingSystem: "Roblox"
                  },
                  mainEntity: [
                    ...(redeemSteps.length
                      ? [
                        {
                          "@type": "HowTo",
                          name: `How to redeem ${game.name} codes`,
                          step: redeemSteps.map((text, idx) => ({
                            "@type": "HowToStep",
                            position: idx + 1,
                            text
                          }))
                        }
                      ]
                      : []),
                    ...(faqEntries.length
                      ? [
                        {
                          "@type": "FAQPage",
                          mainEntity: faqEntries.map(({ question, answer }) => ({
                            "@type": "Question",
                            name: question,
                            acceptedAnswer: { "@type": "Answer", text: answer }
                          }))
                        }
                      ]
                      : []),
                    ...(activeCodesItemList.length
                      ? [
                        {
                          "@type": "ItemList",
                          name: `${game.name} active codes`,
                          numberOfItems: activeCodesItemList.length,
                          itemListElement: activeCodesItemList
                        }
                      ]
                      : [])
                  ]
                }
              ]
            })
          }}
        />
        <div className="mt-10">
          <CommentsSection entityType="code" entityId={game.id} />
        </div>
        <CodeBlockEnhancer />
      </article>

      {(suggestedCodes.length > 0 || relatedChecklistCards.length > 0 || relatedArticles.length > 0 || relatedTools.length > 0 || Boolean(eventsCard)) ? (
        <aside className="space-y-4">
          <SocialShare
            url={canonicalUrl}
            title={`${game.name} Codes (${monthYear()})`}
            analytics={{ contentType: "code_page", itemId: game.slug }}
          />
          <ContentSlot
            slot="4767824441"
            className="w-full"
            adLayout={null}
            adFormat="auto"
            fullWidthResponsive
            minHeight="clamp(280px, 40vw, 600px)"
          />

          {eventsCard ? (
            <section className="space-y-3">
              <h3 className="text-lg font-semibold text-foreground">Events for {universeLabel}</h3>
              <div className="space-y-3">
                <div
                  className="block"
                  data-analytics-event="related_content_click"
                  data-analytics-source-type="codes_sidebar"
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
              <div className="space-y-4">
                {relatedChecklistCards.map((card) => (
                  <div
                    key={card.id}
                    className="block"
                    data-analytics-event="related_content_click"
                    data-analytics-source-type="codes_sidebar"
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
              <h3 className="text-lg font-semibold text-foreground">Articles on {universeLabel}</h3>
              <div className="space-y-4">
                {relatedArticles.slice(0, 3).map((item) => (
                  <div
                    key={item.id}
                    className="block"
                    data-analytics-event="related_content_click"
                    data-analytics-source-type="codes_sidebar"
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
                    data-analytics-source-type="codes_sidebar"
                    data-analytics-target-type="tool"
                    data-analytics-target-slug={tool.code}
                  >
                    <ToolCard tool={tool} />
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {suggestedCodes.length > 0 ? (
            <>
              <section className="panel space-y-3 px-4 py-5">
                <h3 className="text-lg font-semibold text-foreground">Get Roblox codes directly on</h3>
                <div className="space-y-2 text-sm">
                  <Link
                    href="https://t.me/bloxodes"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-4 rounded-md border border-border px-4 py-3 font-medium text-foreground transition hover:bg-accent hover:text-accent-foreground"
                  >
                    <span className="flex items-center gap-2">
                      <FaTelegramPlane className="h-4 w-4" aria-hidden />
                      Telegram
                    </span>
                    <span className="text-xs text-muted">@bloxodes</span>
                  </Link>
                  <Link
                    href="https://x.com/bloxodes"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-4 rounded-md border border-border px-4 py-3 font-medium text-foreground transition hover:bg-accent hover:text-accent-foreground"
                  >
                    <span className="flex items-center gap-2">
                      <RiTwitterXLine className="h-4 w-4" aria-hidden />
                      X (Twitter)
                    </span>
                    <span className="text-xs text-muted">@bloxodes</span>
                  </Link>
                  <Link
                    href="https://chromewebstore.google.com/detail/bloxodes-%E2%80%93-roblox-game-co/mammkedlehmpechknaicfakljaogcmhc?authuser=0&hl=en"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-4 rounded-md border border-border px-4 py-3 font-medium text-foreground transition hover:bg-accent hover:text-accent-foreground"
                  >
                    <span className="flex items-center gap-2">
                      <SiGooglechrome className="h-4 w-4" aria-hidden />
                      Chrome Extension
                    </span>
                    <span className="text-xs text-muted">Add to Chrome</span>
                  </Link>
                </div>
              </section>

              <div className="space-y-2 p-2">
                <h3 className="text-lg font-semibold text-foreground">More games with codes</h3>
                <p className="text-sm text-muted">Discover other Roblox games that currently have active rewards.</p>
              </div>
              <div className="grid gap-4">
                {suggestedCodes.map((g) => (
                  <div
                    key={g.id}
                    className="block"
                    data-analytics-event="related_content_click"
                    data-analytics-source-type="codes_sidebar"
                    data-analytics-target-type="codes"
                    data-analytics-target-slug={g.slug}
                  >
                    <GameCard game={g} titleAs="p" articleUpdatedAt={g.content_updated_at} />
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </aside>
      ) : null}
    </div>
  );
}
