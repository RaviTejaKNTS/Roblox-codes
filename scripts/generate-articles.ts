import "dotenv/config";

import { Readability } from "@mozilla/readability";
import OpenAI from "openai";
import { JSDOM } from "jsdom";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

import { slugify } from "@/lib/slug";
import { tavilySearch } from "./lib/tavily";

type QueueRow = {
  id: string;
  article_title: string | null;
  sources: string | null;
  universe_id: number | null;
  status: "pending" | "completed" | "failed";
  attempts: number;
  last_attempted_at: string | null;
  last_error: string | null;
};

type SearchResult = {
  title: string;
  url: string;
  snippet?: string;
  rawContent?: string;
};

type SourceDocument = {
  title: string;
  url: string;
  content: string;
  host: string;
  isForum: boolean;
  verification?: "Yes" | "No";
  fromQueue?: boolean;
};

type DraftArticle = {
  title: string;
  content_md: string;
  meta_description: string;
};

type ArticleContext = {
  intent: string;
  mustCover: string[];
  readerQuestions: string[];
  coverageChecklist: string | null;
};

type SourceGatheringResult = {
  sources: SourceDocument[];
};

type RelatedUniversePage = {
  type: "article" | "codes" | "checklist" | "tool" | "catalog" | "events" | "quiz";
  title: string;
  url: string;
  description?: string | null;
  updatedAt?: string | null;
  gameName?: string | null;
};


const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const AUTHOR_ID = process.env.ARTICLE_AUTHOR_ID ?? "4fc99a58-83da-46f6-9621-7816e36b4088";
const SUPABASE_MEDIA_BUCKET = process.env.SUPABASE_MEDIA_BUCKET;
const SITE_URL = (process.env.SITE_URL ?? "https://bloxodes.com").replace(/\/$/, "");
const LOG_DRAFT_PROMPT = process.env.LOG_DRAFT_PROMPT === "true";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE.");
}

if (!TAVILY_API_KEY) {
  throw new Error("Missing TAVILY_API_KEY.");
}

if (!OPENAI_KEY) {
  throw new Error("Missing OPENAI_API_KEY.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
const openai = new OpenAI({ apiKey: OPENAI_KEY });

async function requestModelText(params: {
  system: string;
  prompt: string;
  maxTokens: number;
  temperature?: number;
}): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: params.temperature ?? 0.2,
    max_tokens: params.maxTokens,
    messages: [
      { role: "system", content: params.system },
      { role: "user", content: params.prompt }
    ]
  });

  return completion.choices[0]?.message?.content?.trim() ?? "";
}

const SOURCE_CHAR_LIMIT = 6500;
const MAX_RESULTS_PER_QUERY = 20;
const MAX_SOURCES = 10;

const MIN_SOURCES = 2;
const MAX_FORUM_SOURCES = 3;
const MAX_PER_HOST_DEFAULT = 3;
const MAX_PER_HOST_HIGH_QUALITY = 4;

const QUALITY_DOMAINS = [
  "roblox.com",
  "fandom.com",
  "fandomwiki.com",
  "pcgamesn.com",
  "pockettactics.com",
  "polygon.com",
  "ign.com",
  "gamespot.com",
  "thegamer.com",
  "screenrant.com",
  "dexerto.com",
  "beebom.com",
  "destructoid.com",
  "progameguides.com",
  "game8.co",
  "sportskeeda.com",
  "rockpapershotgun.com",
  "pcgamer.com",
  "digitaltrends.com",
  "gamingonphone.com"
];

let cachedAuthorIds: string[] | null = null;

async function pickAuthorId(): Promise<string | null> {
  if (!cachedAuthorIds) {
    const { data, error } = await supabase.from("authors").select("id");
    if (error) {
      console.warn("⚠️ Unable to load authors:", error.message);
      cachedAuthorIds = [];
    } else {
      cachedAuthorIds = (data ?? [])
        .map((author) => author.id)
        .filter((id): id is string => typeof id === "string" && id.length > 0);
    }
  }

  if (!cachedAuthorIds || cachedAuthorIds.length === 0) {
    console.warn("⚠️ No authors available; falling back to default author.");
    return null;
  }

  const index = Math.floor(Math.random() * cachedAuthorIds.length);
  return cachedAuthorIds[index] ?? null;
}

function isHighQualityHost(hostname: string): boolean {
  const base = hostname.replace(/^www\./i, "").toLowerCase();
  return QUALITY_DOMAINS.some((domain) => base === domain || base.endsWith(`.${domain}`));
}

function isForumHost(hostname: string): boolean {
  const base = hostname.replace(/^www\./i, "").toLowerCase();
  return (
    base.includes("reddit.com") ||
    base.includes("devforum.roblox.com") ||
    base.includes("forum") ||
    base.includes("stackexchange") ||
    base.includes("quora.com")
  );
}

function isVideoHost(hostname: string): boolean {
  const base = hostname.replace(/^www\./i, "").toLowerCase();
  return (
    base.includes("youtube.com") ||
    base.includes("youtu.be") ||
    base.includes("vimeo.com") ||
    base.includes("dailymotion.com") ||
    base.includes("tiktok.com") ||
    base.includes("instagram.com") ||
    base.includes("twitter.com") ||
    base.includes("x.com") ||
    base.includes("facebook.com")
  );
}

function cleanText(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length ? normalized : null;
}


function escapeForSvg(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizeOverlayTitle(value: string | null | undefined, limit = 70): string | null {
  if (!value) return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.length > limit ? `${cleaned.slice(0, limit - 1)}…` : cleaned;
}

function pickOverlayFontSize(lines: string[]): number {
  const longest = lines.reduce((max, line) => Math.max(max, line.length), 0);
  let base: number;
  if (longest <= 10) base = 104;
  else if (longest <= 16) base = 94;
  else if (longest <= 22) base = 82;
  else if (longest <= 28) base = 70;
  else if (longest <= 34) base = 62;
  else base = 52;

  const linePenalty = Math.max(0, lines.length - 2) * 6;
  return Math.max(44, base - linePenalty);
}

function wrapOverlayLines(text: string): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  const words = cleaned.split(" ");
  const length = cleaned.length;
  let maxLine = 16;
  if (length > 80) maxLine = 24;
  else if (length > 60) maxLine = 20;
  else if (length > 40) maxLine = 18;

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (!current.length) {
      current = word;
      continue;
    }

    const next = `${current} ${word}`;
    if (next.length <= maxLine) {
      current = next;
    } else {
      lines.push(current);
      current = word;
    }
  }

  if (current.length) {
    lines.push(current);
  }

  return lines;
}

function replaceEmDashes(value: string): string {
  return value.replace(/—\s*/g, ": ");
}

function injectCoverImageBeforeFirstH2(content: string, imageUrl: string, altText: string): string {
  const imageLine = `![${altText}](${imageUrl})`;
  const h2Index = content.search(/^## /m);
  if (h2Index === -1) {
    return `${content}\n\n${imageLine}`;
  }
  return `${content.slice(0, h2Index)}${imageLine}\n\n${content.slice(h2Index)}`;
}

function sanitizeInternalLinks(content: string, allowedUrls: Set<string>): string {
  const toPath = (url: string): string => {
    try {
      return new URL(url).pathname.replace(/\/$/, "") || "/";
    } catch {
      return url.replace(/\/$/, "");
    }
  };

  const allowedPaths = new Set(Array.from(allowedUrls).map(toPath));

  return content.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
    const trimmed = url.trim();
    // Already a correct relative path
    if (allowedUrls.has(trimmed)) return match;
    // Full URL whose path is in the allowed set — strip the domain, keep the path
    const path = toPath(trimmed);
    if (allowedPaths.has(path)) return `[${text}](${path})`;
    // Genuinely hallucinated — remove the link, keep anchor text
    return text;
  });
}

function stripSourceCitations(value: string): string {
  let cleaned = value.replace(/\[\d+(?:\s*,\s*\d+)*\]\([^)]+\)/g, "");
  cleaned = cleaned.replace(/\s*\[(\d+(?:\s*,\s*\d+)*)\]/g, "");
  cleaned = cleaned.replace(/\s*\((?:source|sources|citation|citations|reference|references)[^)]*\)/gi, "");
  cleaned = cleaned.replace(/^\s*(sources?|citations?|references?)\s*:\s*.*$/gim, "");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  return cleaned.trim();
}

function sanitizeDraftArticle(article: DraftArticle): DraftArticle {
  return {
    ...article,
    title: stripSourceCitations(article.title),
    meta_description: stripSourceCitations(article.meta_description),
    content_md: stripSourceCitations(article.content_md)
  };
}

function finalizeDraftArticle(article: DraftArticle): DraftArticle {
  return {
    ...article,
    title: stripSourceCitations(replaceEmDashes(article.title)),
    meta_description: stripSourceCitations(replaceEmDashes(article.meta_description)),
    content_md: stripSourceCitations(replaceEmDashes(article.content_md))
  };
}

function truncateForPrompt(value: string | null | undefined, limit = 240): string | null {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  if (normalized.length > limit) return `${normalized.slice(0, limit)}…`;
  return normalized;
}

function estimateWordCount(markdown: string): number {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/[#>*_\-\[\]\(\)]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return 0;
  return text.split(" ").length;
}

async function ensureUniqueSlug(baseTitle: string): Promise<string> {
  const base = slugify(baseTitle);
  let slug = base || slugify(Date.now().toString());
  let counter = 2;

  while (true) {
    const { data, error } = await supabase.from("articles").select("id").eq("slug", slug).maybeSingle();
    if (error) throw new Error(`Slug check failed: ${error.message}`);
    if (!data) return slug;
    slug = `${base}-${counter}`;
    counter += 1;
  }
}

function parseQueueSources(raw: string | null): string[] {
  if (!raw) return [];
  const urls = raw
    .split(/[\n,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry) => /^https?:\/\//i.test(entry));

  return Array.from(new Set(urls));
}

function ensureRobloxKeyword(query: string): string {
  const normalized = query.toLowerCase();
  return normalized.includes("roblox") ? query : `${query} Roblox`;
}

function normalizeUrlForCompare(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    let pathname = parsed.pathname.replace(/\/+$/, "");
    if (!pathname) pathname = "/";
    return `${parsed.origin}${pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

function collectSourceUrls(sources: SourceDocument[]): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const source of sources) {
    const rawUrl = source.url?.trim();
    if (!rawUrl) continue;
    if (!/^https?:\/\//i.test(rawUrl)) continue;
    const normalized = normalizeUrlForCompare(rawUrl);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    urls.push(rawUrl);
  }
  return urls;
}

function normalizeStringArray(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const cleaned = entry.replace(/^\s*[-*\d.()]+\s*/, "").replace(/\s+/g, " ").trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    normalized.push(cleaned);
    seen.add(key);
    if (normalized.length >= limit) break;
  }
  return normalized;
}

function formatBulletList(items: string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}

function buildSearchQuery(topic: string): string {
  return ensureRobloxKeyword(topic.trim());
}

type RobloxUniverseMedia = {
  thumbnail_urls?: unknown;
  icon_url?: string | null;
  name?: string | null;
  display_name?: string | null;
};

function normalizeThumbnailUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry) return null;
      if (typeof entry === "string") return entry;
      if (typeof entry === "object" && "url" in entry) {
        const url = (entry as { url?: unknown }).url;
        return typeof url === "string" ? url : null;
      }
      return null;
    })
    .filter((url): url is string => typeof url === "string" && url.trim().length > 0);
}


function resolveAbsoluteUrl(url: string | null, base: string): string | null {
  if (!url) return null;
  try {
    return new URL(url, base).toString();
  } catch {
    return null;
  }
}


async function pickUniverseThumbnail(universeId: number): Promise<{ url: string; gameName?: string } | null> {
  const { data, error } = await supabase
    .from("roblox_universes")
    .select("thumbnail_urls, icon_url, name, display_name")
    .eq("universe_id", universeId)
    .maybeSingle();

  if (error) {
    console.warn(`⚠️ Failed to load universe ${universeId} media:`, error.message);
    return null;
  }

  if (!data) return null;

  const media = data as RobloxUniverseMedia;
  const thumbs = normalizeThumbnailUrls(media.thumbnail_urls);
  const candidates = thumbs.length
    ? thumbs
    : media.icon_url && typeof media.icon_url === "string"
      ? [media.icon_url]
      : [];

  if (!candidates.length) return null;

  const selected = candidates[Math.floor(Math.random() * candidates.length)];
  const rawName = media.display_name ?? media.name ?? null;
  const gameName = rawName?.trim();
  return { url: selected, gameName: gameName && gameName.length ? gameName : undefined };
}

async function downloadResizeAndUploadCover(params: {
  imageUrl: string;
  slug: string;
  fileBase?: string;
  overlayTitle?: string | null;
}): Promise<string | null> {
  if (!SUPABASE_MEDIA_BUCKET) {
    console.log("⚠️ SUPABASE_MEDIA_BUCKET not configured. Skipping cover image upload.");
    return null;
  }

  try {
    const response = await fetch(params.imageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8"
      }
    });

    if (!response.ok) {
      console.warn("⚠️ Failed to download universe thumbnail:", response.statusText);
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    const overlayText = normalizeOverlayTitle(params.overlayTitle ?? null);
    const overlayLines = overlayText ? wrapOverlayLines(overlayText) : [];
    const fontSize = overlayLines.length ? pickOverlayFontSize(overlayLines) : 0;
    const lineHeight = fontSize ? Math.round(fontSize * 1.2) : 0;
    const startY = fontSize ? Math.round(337.5 - ((overlayLines.length - 1) * lineHeight) / 2) : 0;

    const textBlock =
      overlayLines.length && fontSize
        ? `<text x="600" y="${startY}" text-anchor="middle" fill="#f8f9fb" font-size="${fontSize}" font-family="Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-weight="800" font-style="italic" letter-spacing="1.2" dominant-baseline="hanging">
            ${overlayLines
              .map((line, idx) => `<tspan x="600" dy="${idx === 0 ? 0 : lineHeight}">${escapeForSvg(line)}</tspan>`)
              .join("")}
          </text>`
        : "";

    const svgOverlay = Buffer.from(
      `<svg width="1200" height="675" xmlns="http://www.w3.org/2000/svg" role="presentation">
        <rect x="0" y="0" width="1200" height="675" fill="rgba(0,0,0,0.78)"/>
        ${textBlock}
      </svg>`.replace(/\s+/g, " ")
    );

    const resized = await sharp(buffer)
      .resize(1200, 675, { fit: "cover", position: "attention" })
      .composite([{ input: svgOverlay, blend: "over" }])
      .webp({ quality: 90, effort: 4 })
      .toBuffer();

    const fileBase =
      (params.fileBase ?? params.slug)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/-{2,}/g, "-")
        .replace(/(^-|-$)/g, "") || params.slug;

    const path = `articles/${params.slug}/${fileBase}-cover.webp`;
    const storageClient = supabase.storage.from(SUPABASE_MEDIA_BUCKET);

    const { error } = await storageClient.upload(path, resized, {
      contentType: "image/webp",
      upsert: true
    });

    if (error) {
      console.warn("⚠️ Failed to upload article cover image:", error.message);
      return null;
    }

    const publicUrl = storageClient.getPublicUrl(path);
    return publicUrl.data.publicUrl ?? null;
  } catch (error) {
    console.warn("⚠️ Could not process cover image:", error instanceof Error ? error.message : String(error));
    return null;
  }
}

async function uploadUniverseCoverImage(universeId: number, slug: string, overlayTitle?: string | null): Promise<string | null> {
  if (!SUPABASE_MEDIA_BUCKET) {
    console.log("⚠️ SUPABASE_MEDIA_BUCKET not configured. Skipping cover image upload.");
    return null;
  }

  const pick = await pickUniverseThumbnail(universeId);
  if (!pick) return null;
  return downloadResizeAndUploadCover({
    imageUrl: pick.url,
    slug,
    fileBase: pick.gameName ?? `universe-${universeId}`,
    overlayTitle: overlayTitle ?? pick.gameName ?? null
  });
}

async function getRandomQueueItem(): Promise<QueueRow | null> {
  const { count, error: countError } = await supabase
    .from("article_generation_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .or("event_id.is.null,event_id.eq.");

  if (countError) {
    throw new Error(`Failed to count queue items: ${countError.message}`);
  }

  const total = typeof count === "number" ? count : 0;
  if (total === 0) return null;

  const offset = Math.floor(Math.random() * total);
  const { data, error } = await supabase
    .from("article_generation_queue")
    .select("id, article_title, sources, status, attempts, last_attempted_at, last_error, universe_id")
    .eq("status", "pending")
    .or("event_id.is.null,event_id.eq.")
    .order("created_at", { ascending: true })
    .range(offset, offset)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch queue: ${error.message}`);
  }

  if (!data) return null;

  const rawUniverseId = (data as { universe_id?: unknown }).universe_id;
  const universeId =
    typeof rawUniverseId === "number"
      ? rawUniverseId
      : rawUniverseId !== null && rawUniverseId !== undefined && !Number.isNaN(Number(rawUniverseId))
        ? Number(rawUniverseId)
        : null;

  return {
    ...data,
    attempts: data.attempts ?? 0,
    status: (data.status as QueueRow["status"]) ?? "pending",
    last_attempted_at: data.last_attempted_at ?? null,
    last_error: data.last_error ?? null,
    sources: (data as { sources?: string | null }).sources ?? null,
    universe_id: Number.isFinite(universeId) ? universeId : null
  };
}

async function markAttempt(queue: QueueRow): Promise<void> {
  const { error } = await supabase
    .from("article_generation_queue")
    .update({
      attempts: queue.attempts + 1,
      last_attempted_at: new Date().toISOString()
    })
    .eq("id", queue.id)
    .eq("status", "pending");

  if (error) {
    throw new Error(`Failed to record attempt: ${error.message}`);
  }
}

async function updateQueueStatus(
  queueId: string,
  status: "completed" | "failed",
  lastError?: string | null
): Promise<void> {
  const { error } = await supabase
    .from("article_generation_queue")
    .update({
      status,
      last_error: lastError ? lastError.slice(0, 500) : null,
      last_attempted_at: new Date().toISOString()
    })
    .eq("id", queueId);

  if (error) {
    throw new Error(`Failed to update queue status: ${error.message}`);
  }
}

async function searchWeb(query: string, limit: number, options: { includeDomains?: string[]; exactMatch?: boolean } = {}): Promise<SearchResult[]> {
  const payload = await tavilySearch(query, {
    exactMatch: options.exactMatch ?? false,
    includeDomains: options.includeDomains,
    maxResults: limit,
    searchDepth: "advanced",
    topic: "general",
    includeRawContent: "markdown"
  });

  return (
    payload.results
      ?.map((item) => ({
        title: item.title ?? "",
        url: item.url ?? "",
        snippet: item.content,
        rawContent: item.raw_content ?? undefined
      }))
      .filter((entry) => entry.title && entry.url) ?? []
  );
}

type ParsedArticle = {
  content: string;
  title: string | null;
  html: string;
  host: string;
};

async function fetchArticleContent(
  url: string,
  options: { sourceHost?: string } = {}
): Promise<ParsedArticle | null> {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    host = options.sourceHost ?? "";
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
      },
      redirect: "follow"
    });

    if (!response.ok) {
      console.warn(`   • Skipping ${url}: HTTP ${response.status}`);
      return null;
    }

    const html = await response.text();
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    let rawText = "";
    if (article?.content) {
      // Extract text only from semantic block elements in Readability's cleaned HTML
      // This strips nav, ads, related-article lists, and other structural noise
      const cleanDom = new JSDOM(article.content);
      const blocks: string[] = [];
      cleanDom.window.document.querySelectorAll("p, h1, h2, h3, h4, h5, h6, td, th, li").forEach((el) => {
        if (el.querySelector("p, h1, h2, h3, h4, h5, h6")) return; // skip container elements
        const text = el.textContent?.replace(/\s+/g, " ").trim();
        if (text && text.length >= 20) blocks.push(text);
      });
      rawText = blocks.join(" ").replace(/\s+/g, " ").trim();
    }

    if (!rawText) {
      // Fallback to raw textContent if clean extraction yields nothing
      rawText = article?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    }

    if (!rawText) {
      const fallbackText = dom.window.document.body?.textContent ?? "";
      const normalizedFallback = fallbackText.replace(/\s+/g, " ").trim();
      if (!normalizedFallback) {
        console.warn(`   • Readability could not parse ${url}`);
        return null;
      }
      console.warn(`   • Readability failed for ${url}, using fallback text`);
      rawText = normalizedFallback;
    }

    const normalized = rawText.replace(/\s+/g, " ").trim();
    if (normalized.length < 250) {
      console.warn(`   • Content short for ${url} (length=${normalized.length}), keeping anyway`);
    }

    const derivedTitle = article?.title?.trim() || dom.window.document.title?.trim() || null;

    return {
      content: normalized.slice(0, SOURCE_CHAR_LIMIT),
      title: derivedTitle,
      html,
      host
    };
  } catch (error) {
    console.warn(`   • Failed to fetch ${url}:`, (error as Error).message);
    return null;
  }
}

type SourceCandidate = {
  url: string;
  resultTitle?: string;
  rawContent?: string;
  host: string;
  isForum: boolean;
  fromQueue: boolean;
};

function filterCandidate(
  url: string,
  hostCounts: Map<string, number>,
  forumCount: { value: number },
  seenUrls: Set<string>,
  excludeUrls?: Set<string>
): { host: string; isForum: boolean } | null {
  const normalizedUrl = normalizeUrlForCompare(url);
  if (excludeUrls?.has(normalizedUrl)) return null;
  if (seenUrls.has(normalizedUrl)) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  if (isVideoHost(host)) return null;
  const isForum = isForumHost(host);
  if (isForum && forumCount.value >= MAX_FORUM_SOURCES) return null;
  const hostLimit = isHighQualityHost(host) ? MAX_PER_HOST_HIGH_QUALITY : MAX_PER_HOST_DEFAULT;
  if ((hostCounts.get(host) ?? 0) >= hostLimit) return null;
  return { host, isForum };
}

async function gatherSources(topic: string, queueSources?: string | null): Promise<SourceGatheringResult> {
  const hostCounts = new Map<string, number>();
  const forumCount = { value: 0 };
  const seenUrls = new Set<string>();
  const searchQuery = buildSearchQuery(topic);
  const manualUrls = parseQueueSources(queueSources ?? null);
  const queueUrlSet = new Set(manualUrls.map((url) => normalizeUrlForCompare(url)));

  // Phase 1: filter all candidate URLs (queue + search) — no fetching yet
  const candidates: SourceCandidate[] = [];

  for (const url of manualUrls) {
    if (candidates.length >= MAX_SOURCES) break;
    const match = filterCandidate(url, hostCounts, forumCount, seenUrls);
    if (!match) continue;
    seenUrls.add(normalizeUrlForCompare(url));
    hostCounts.set(match.host, (hostCounts.get(match.host) ?? 0) + 1);
    if (match.isForum) forumCount.value += 1;
    candidates.push({ url, host: match.host, isForum: match.isForum, fromQueue: true });
  }

  try {
    console.log(`🔎 tavily_search → ${searchQuery}`);
    const results = await searchWeb(searchQuery, MAX_RESULTS_PER_QUERY);
    for (const result of results) {
      if (candidates.length >= MAX_SOURCES) break;
      if (!result.url) continue;
      const match = filterCandidate(result.url, hostCounts, forumCount, seenUrls, queueUrlSet);
      if (!match) continue;
      seenUrls.add(normalizeUrlForCompare(result.url));
      hostCounts.set(match.host, (hostCounts.get(match.host) ?? 0) + 1);
      if (match.isForum) forumCount.value += 1;
      candidates.push({
        url: result.url,
        resultTitle: result.title,
        rawContent: result.rawContent,
        host: match.host,
        isForum: match.isForum,
        fromQueue: false
      });
    }
  } catch (error) {
    console.warn(`   • search_failed query="${searchQuery}" reason="${(error as Error).message}"`);
  }

  // Phase 2: fetch all candidates in parallel
  const fetched = await Promise.all(
    candidates.map(({ url, host }) => fetchArticleContent(url, { sourceHost: host }))
  );

  // Phase 3: build source list from parallel results
  const collected: SourceDocument[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const parsed = fetched[i];

    if (!parsed) {
      if (c.fromQueue) continue; // queue URLs must fetch successfully
      const raw = c.rawContent?.trim() ?? "";
      if (raw.length < 200) continue;
      collected.push({ title: c.resultTitle || c.url, url: c.url, content: raw.slice(0, SOURCE_CHAR_LIMIT), host: c.host, isForum: c.isForum });
    } else {
      collected.push({
        title: c.resultTitle || parsed.title || c.url,
        url: c.url,
        content: parsed.content,
        host: c.host,
        isForum: c.isForum,
        ...(c.fromQueue ? { fromQueue: true } : {})
      });
    }
    console.log(`source_${collected.length}: ${c.host}${c.fromQueue ? " [queue]" : ""}${c.isForum ? " [forum]" : ""}`);
  }

  if (collected.length < MIN_SOURCES) {
    console.warn(`   • low_source_count collected=${collected.length} min=${MIN_SOURCES}`);
  }

  return { sources: collected };
}

async function verifySources(topic: string, sources: SourceDocument[]): Promise<SourceDocument[]> {
  const queueSources = sources.filter((s) => s.fromQueue).map((s) => ({ ...s, verification: "Yes" as const }));
  const toVerify = sources.filter((s) => !s.fromQueue);

  if (!toVerify.length) {
    if (queueSources.length === 0) throw new Error("No usable sources after verification.");
    return queueSources;
  }

  const sourceBlock = toVerify
    .map((s, i) => `SOURCE ${i + 1}\nHost: ${s.host}\nTitle: ${s.title}\nContent:\n${s.content.slice(0, 1000)}`)
    .join("\n\n");

  const prompt = `
For the Roblox topic "${topic}", evaluate each source below:
- Verdict: "Yes" if accurate and relevant (minor outdated details are fine), "No" if it should not be used
- For approved sources, assign a rank (1 = most relevant and highest quality)

${sourceBlock}

Return JSON:
{
  "results": [
    { "index": 1, "verdict": "Yes", "rank": 1 },
    { "index": 2, "verdict": "No" }
  ]
}
`.trim();

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0,
      max_tokens: 400,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Evaluate and rank sources for Roblox articles. Return only valid JSON." },
        { role: "user", content: prompt }
      ]
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw) as { results?: Array<{ index?: number; verdict?: string; rank?: number }> };
    const results = parsed.results ?? [];

    const approved: Array<{ source: SourceDocument; rank: number }> = [];
    for (const result of results) {
      const idx = (result.index ?? 0) - 1;
      if (idx < 0 || idx >= toVerify.length) continue;
      const source = toVerify[idx];
      source.verification = result.verdict?.trim().toLowerCase().startsWith("yes") ? "Yes" : "No";
      console.log(`verify_source host=${source.host} verdict=${source.verification} rank=${result.rank ?? "-"}`);
      if (source.verification === "Yes") {
        approved.push({ source, rank: result.rank ?? 99 });
      }
    }

    approved.sort((a, b) => a.rank - b.rank);
    // Queue sources lead (already trusted), followed by ranked web sources
    const verified = [...queueSources, ...approved.map((a) => a.source)];

    if (verified.length === 0) throw new Error("No usable sources after verification.");
    if (verified.length < MIN_SOURCES) {
      console.warn(`   • low_verified_sources verified=${verified.length} min=${MIN_SOURCES}`);
    }
    return verified;
  } catch (error) {
    if (error instanceof Error && error.message === "No usable sources after verification.") throw error;
    console.warn("⚠️ Source verification failed, using all sources:", error instanceof Error ? error.message : String(error));
    return sources.map((s) => ({ ...s, verification: "Yes" as const }));
  }
}

function formatSourcesForPrompt(sources: SourceDocument[]): string {
  return sources
    .map(
      (source, index) =>
        `RESEARCH DOC ${index + 1}\nTITLE: ${source.title}\nURL: ${source.url}\nHOST: ${source.host}\nCONTENT:\n${source.content}\n`
    )
    .join("\n");
}


function formatContextBlock(context?: ArticleContext | null): string {
  if (!context) return "";
  const sections: string[] = [];
  if (context.intent) {
    sections.push(`Search intent:\n${context.intent}`);
  }
  if (context.mustCover.length) {
    sections.push(`Coverage checklist:\n${formatBulletList(context.mustCover)}`);
  }
  if (context.readerQuestions.length) {
    sections.push(`Reader questions to answer:\n${formatBulletList(context.readerQuestions)}`);
  }
  return sections.length ? `\n\n${sections.join("\n\n")}` : "";
}

function formatReviewContext(context?: ArticleContext | null): string {
  if (!context) return "";
  const sections: string[] = [];
  if (context.intent) {
    sections.push(`Search intent: ${context.intent}`);
  }
  if (context.mustCover.length) {
    sections.push(`Coverage checklist:\n${formatBulletList(context.mustCover)}`);
  }
  if (context.readerQuestions.length) {
    sections.push(`Reader questions:\n${formatBulletList(context.readerQuestions)}`);
  }
  return sections.length ? `\n\nContext to enforce:\n${sections.join("\n\n")}` : "";
}

function buildArticlePrompt(
  topic: string,
  sources: SourceDocument[],
  context?: ArticleContext | null
): string {
  const sourceBlock = formatSourcesForPrompt(sources);
  const contextBlock = formatContextBlock(context);
  const coverageBlock = context?.coverageChecklist ? `\n\nCoverage checklist:\n${context.coverageChecklist}` : "";

  return `
Use the research below to write a Roblox article.

Write an article in simple English that is easy for anyone to understand. Use a conversational tone like a professional Indian Roblox gaming writer sharing their Roblox knowledge/experience in US English. The article should feel like a friend talking to a friend while still being factual, helpful, and engaging.

Start with an intro that directly gets into the core topic of the article. No fluff, no generic statements, no clichéd phrases, no templates. Just get to the point and write in a way that is easy to understand and engaging.
 - The start of the article should be very engaging and hook the audience into reading the entire article.
 - Instead of just a generic question or statement like If you play the game. Get directly into the explaining or bringing the pain point of the core topic if possible.
 - Think about what type of intro serves the article best and use that.
 - No gnereic statements even if they are accurate. Instead you can bring out a interesting point, raise a question, tell an experience, highlight the pain point, break the misconception, put an bold opinion. (Should be accurate to the sources)
 - Keep it short, consise and easy to understand.
 - Stay strictly on the topic "${topic}". Do not broaden scope of article. If a related item appears in sources, only use it to clarify confusion and keep the focus on the topic.
 - Title must stay strictly about the topic (no extra targets like "X and Y").
Right after the intro, give the main answer upfront with no heading. Can start with something like "first things first" or "Here's a quick answer" or anything that flows naturally according to the topic. This should be just a small para only covering the most important aspect like in 2-3 lines long. You can also use 2-3 bullet points here if you think that will make it easier to scan. Keep this section conversational and easy to understand.

After that, start with a H2 heading and then write the main content following these rules:
 - The article should flow like a story from the start to the end. Every section should be connected and tell a clean explaination of the said topic.
 - Keep the article information dense, and communicate it in a way that is easy to understand.
 - Adjust depth based on the topic. If something is simple, keep it short. If something needs more explanation, expand it properly.
 - Use headings only when they are really important and drive the topic forward. Keep the structure simple to scan through. No headings for "Tips", "Why this matters", "Outro" or any other generic sections.
 - Headings should be conversational like a casual sentence talking to the user. Use Sentence case for all headings, capitalize the first letter of the first word only and for proper nouns.
 - Random tips can be said with small "Note:" or "Tip:" or anything that works instead of giving a full headings.
 - Use H2 headings for main sections and H3 headings for sub-sections. (As mentioned, only when really needed)
 - Do not include why this matters or is it worth it kind of headings, weave the info into other sections of the article.
 - Write in-depth and make sure everything is covered, but write in as less words as possible.
 - Use full sentences and explain things clearly without any repetations or useless information.
 - whereever possible and can be factually accurate, use personal anecdotes, opinionated language and show emotional variation according to the info. (Use this subtly)
 - Use tables and bullet points when it makes information easier to scan. Prefer paras to communitate tips, information, etc.
 - Use numbered steps when explaining a process.
 - When mentioning rewards, items or any list or table, include each and every item. Do not skip on anything. This has to be one stop guide that everything that user needs to know.
 - Before any tables, bullet points, or steps, write a short paragraph that sets the context. This helps the article to flow like a story.
 - Conclude the article with a short friendly takeaway that leaves the reader feeling guided and confident. No need for any cringe ending words like "Happy fishing and defending out there!". Just keep it real and helpful.


 Most importantly: Do not add emojis, sources, or new URLs. Keep any existing links/URLs exactly as they are (including internal links and YouTube embeds). No emdashes anywhere. (Never mention these anywhere in your output)
 Additional writing rules:
 - Keep any existing Markdown tables and image URLs exactly as they are. Do not remove or reorder them.
 - Keep any existing Markdown links/URLs exactly as they are. Do not remove or rewrite them.
 - Do not add new links or URLs. Keep any existing links unchanged.
 - Do not copy or quote sentences from the research. Paraphrase everything in fresh wording.
 - Never mention sources, research, URLs, or citations.
 - Never include bracketed citations like [1] or [2], or any references section.

${contextBlock}${coverageBlock}

Research (do not cite or mention):
${sourceBlock}

Return JSON:
{
  "title": "A small simple title that's easy to scan and understand. Keep it short and on-point and no key:value pairs",
  "meta_description": "Simple, specific summary with keywords (under 160 characters, no generic phrasing)",
  "content_md": "Full Markdown article"
  }
  `.trim();
}

async function buildArticleContext(
  topic: string,
  sources: SourceDocument[]
): Promise<ArticleContext> {
  const fallback: ArticleContext = {
    intent: "",
    mustCover: [],
    readerQuestions: [],
    coverageChecklist: null
  };
  const sourceBlock = formatSourcesForPrompt(sources);

  const prompt = `
Create a planning brief for a Roblox article. Use only the research below. Stay strictly on the topic.

Topic: "${topic}"

Research:
${sourceBlock}

Return JSON:
{
  "intent": "1-2 sentences describing what the reader is trying to accomplish",
  "must_cover": ["5-8 specific facts or points the article must include"],
  "reader_questions": ["3-5 questions the article must answer"],
  "coverage_checklist": "Concise bullet list of crucial points a writer must cover — no URLs, no fluff"
}
  `.trim();

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.2,
      max_tokens: 700,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Return only valid JSON." },
        { role: "user", content: prompt }
      ]
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw) as {
      intent?: unknown;
      must_cover?: unknown;
      reader_questions?: unknown;
      coverage_checklist?: unknown;
    };

    const intent = typeof parsed.intent === "string" ? parsed.intent.trim() : "";
    const mustCover = normalizeStringArray(parsed.must_cover, 8);
    const readerQuestions = normalizeStringArray(parsed.reader_questions, 5);
    const coverageChecklist =
      typeof parsed.coverage_checklist === "string" && parsed.coverage_checklist.trim()
        ? parsed.coverage_checklist.trim()
        : null;

    return { intent, mustCover, readerQuestions, coverageChecklist };
  } catch (error) {
    console.warn("⚠️ Article context generation failed:", error instanceof Error ? error.message : String(error));
    return fallback;
  }
}

async function draftArticle(prompt: string): Promise<DraftArticle> {
  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0.35,
    max_tokens: 4000,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are an expert Roblox writer. Always return valid JSON with title, content_md, and meta_description. Title must be very short, on-point, and include relevant keywords. Keep the title strictly about the given topic; do not broaden scope or add extra targets. Meta description must be a simple, specific summary with primary keywords, under 160 characters, and not generic. Never mention sources or citations, never include bracketed references like [1], and do not quote the research; paraphrase it in your own words."
      },
      { role: "user", content: prompt }
    ]
  });

  const raw = completion.choices[0]?.message?.content ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`OpenAI did not return valid JSON: ${(error as Error).message}`);
  }

  const { title, content_md, meta_description } = parsed as Partial<DraftArticle>;
  if (!title || !content_md || !meta_description) {
    throw new Error("Draft missing required fields.");
  }

  return sanitizeDraftArticle({
    title: title.trim(),
    content_md: content_md.trim(),
    meta_description: meta_description.trim()
  });
}

function isNoCoverageFeedback(feedback: string): boolean {
  const normalized = feedback.trim().toLowerCase();
  if (normalized === "no" || normalized === "no." || normalized === '"no"' || normalized === "'no'") {
    return true;
  }
  return (
    normalized.startsWith("no issues") ||
    normalized.startsWith("no missing") ||
    normalized.startsWith("no critical") ||
    normalized.startsWith("no major")
  );
}

function isYesFeedback(feedback: string): boolean {
  const normalized = feedback.trim().toLowerCase();
  if (normalized === "yes" || normalized === "yes." || normalized === '"yes"' || normalized === "'yes'") {
    return true;
  }
  return normalized.startsWith("yes") && normalized.length <= 8;
}

async function checkArticleCoverage(
  topic: string,
  article: DraftArticle,
  sources: SourceDocument[],
  context?: ArticleContext | null
): Promise<string> {
  const reviewContext = formatReviewContext(context);
  const prompt = `
Check if this Roblox article misses any crucial information that readers expect for the topic. Only consider topics that are very close to "${topic}" and crucial for the intent—skip tangents or nice-to-haves. If the article already covers everything important, reply exactly: No
If something critical is missing, list the missing pieces and the exact text to add so it can be inserted as-is. Keep it concise and actionable, and note where it should go (intro, quick answer, specific section).
Stay strictly on the topic; do not suggest covering adjacent items or expanding scope.

Topic: "${topic}"

Article Title: ${article.title}
Article Markdown:
${article.content_md}
${reviewContext}

 Relevant research:
${formatSourcesForPrompt(sources)}
`.trim();

  const feedback = await requestModelText({
    system:
      'You judge coverage completeness for Roblox articles. Only flag items that are very close to the topic and crucial to its intent. If nothing critical is missing, reply exactly "No". Otherwise, provide only the missing items with the information to add. Do not suggest tangential ideas.',
    prompt,
    maxTokens: 600,
    temperature: 0
  });
  if (!feedback) {
    throw new Error("Coverage check returned empty feedback.");
  }

  return feedback;
}

async function factCheckArticle(
  topic: string,
  article: DraftArticle,
  sources: SourceDocument[],
  context?: ArticleContext | null
): Promise<string> {
  const reviewContext = formatReviewContext(context);
  const prompt = `
Fact check this Roblox article. Search broadly. If everything is accurate, reply exactly: Yes
If anything is incorrect, missing, or misleading, reply starting with: No
Then give clear details of what is wrong and how to change it, including the correct information needed. Be explicit about what to fix and provide replacement wording where possible.
Keep corrections strictly on the topic; do not broaden scope. If the article drifts to another item, instruct to remove or correct it back to the topic.

Topic: "${topic}"

Article Title: ${article.title}
Meta Description: ${article.meta_description}
Article Markdown:
${article.content_md}
${reviewContext}

 Relevant research:
${formatSourcesForPrompt(sources)}
`.trim();

  const feedback = await requestModelText({
    system:
      "You are a strict fact checker. Always reply exactly 'Yes' if the article is accurate. Otherwise start with 'No' and provide detailed, actionable corrections with the right information.",
    prompt,
    maxTokens: 1200,
    temperature: 0
  });
  if (!feedback) {
    throw new Error("Fact check returned empty feedback.");
  }

  return feedback;
}

async function reviseArticleWithFeedback(
  topic: string,
  article: DraftArticle,
  sources: SourceDocument[],
  feedback: string,
  feedbackLabel: string
): Promise<DraftArticle> {
  const sourceBlock = formatSourcesForPrompt(sources);
  const label = feedbackLabel || "feedback";
  const prompt = `
Revise the Roblox article based on the ${label} below. Apply only the flagged changes — keep everything else identical, including voice and structure. Do not invent new information; use only the research provided. Stay strictly on "${topic}".

Rules: No sources/citations/brackets ([1]). No new URLs. Keep existing links unchanged. Paraphrase any new text.

Topic: "${topic}"

${label}:
${feedback}

Research (do not cite):
${sourceBlock}

Original article:
Title: ${article.title}
Meta Description: ${article.meta_description}
Content:
${article.content_md}

Return JSON:
{
  "title": "Keep close to original unless feedback requires correction — short and scannable",
  "meta_description": "Specific summary with keywords, under 160 characters",
  "content_md": "Revised article with only the necessary changes applied"
}
`.trim();

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0.35,
    max_tokens: 4000,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are an expert Roblox writer. Return valid JSON with title, content_md, and meta_description. Apply only the feedback changes. Never mention sources or citations. Never add bracketed references. Keep existing links unchanged."
      },
      { role: "user", content: prompt }
    ]
  });

  const raw = completion.choices[0]?.message?.content ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Revision step did not return valid JSON: ${(error as Error).message}`);
  }

  const { title, content_md, meta_description } = parsed as Partial<DraftArticle>;
  if (!title || !content_md || !meta_description) {
    throw new Error("Revision missing required fields.");
  }

  return sanitizeDraftArticle({
    title: title.trim(),
    content_md: content_md.trim(),
    meta_description: meta_description.trim()
  });
}

async function refineArticleWithFeedbackLoop(
  topic: string,
  draft: DraftArticle,
  sources: SourceDocument[],
  context?: ArticleContext | null
): Promise<DraftArticle> {
  let current = draft;

  const coverageFeedback = await checkArticleCoverage(topic, current, sources, context);
  const coverageLog = coverageFeedback.replace(/\s+/g, " ").slice(0, 200);
  console.log(`coverage_check="${coverageLog}${coverageFeedback.length > 200 ? "..." : ""}"`);
  if (!isNoCoverageFeedback(coverageFeedback)) {
    current = await reviseArticleWithFeedback(topic, current, sources, coverageFeedback, "coverage feedback");
  }

  const factCheckFeedback = await factCheckArticle(topic, current, sources, context);
  const factCheckLog = factCheckFeedback.replace(/\s+/g, " ").slice(0, 200);
  console.log(`fact_check="${factCheckLog}${factCheckFeedback.length > 200 ? "..." : ""}"`);
  if (!isYesFeedback(factCheckFeedback)) {
    current = await reviseArticleWithFeedback(topic, current, sources, factCheckFeedback, "fact-check feedback");
  }

  return current;
}

async function fetchRelatedUniversePages(params: {
  universeId: number | null;
  excludeSlug?: string | null;
}): Promise<RelatedUniversePage[]> {
  const { universeId, excludeSlug } = params;
  if (!universeId) return [];

  const related: RelatedUniversePage[] = [];
  const seen = new Set<string>();
  const addPage = (page: RelatedUniversePage) => {
    if (!page.url || seen.has(page.url)) return;
    related.push(page);
    seen.add(page.url);
  };

  try {
    const { data, error } = await supabase
      .from("articles")
      .select("title, slug, meta_description, published_at, updated_at, tags")
      .eq("is_published", true)
      .eq("universe_id", universeId)
      .order("published_at", { ascending: false })
      .limit(20);

    if (error) {
      console.warn("⚠️ Failed to fetch related articles:", error.message);
    } else {
      for (const row of data ?? []) {
        if (!row?.slug || !row?.title) continue;
        if (excludeSlug && row.slug === excludeSlug) continue;
        const tags = (row as { tags?: string[] | null }).tags ?? null;
        if (Array.isArray(tags) && tags.includes("events")) continue;
        addPage({
          type: "article",
          title: row.title,
          url: `/articles/${row.slug}`,
          description: truncateForPrompt((row as any).meta_description),
          updatedAt: (row as any).published_at ?? (row as any).updated_at ?? null
        });
      }
    }
  } catch (error) {
    console.warn("⚠️ Related articles lookup failed:", error instanceof Error ? error.message : String(error));
  }

  try {
    const { data, error } = await supabase
      .from("games")
      .select("name, slug, seo_description, updated_at")
      .eq("universe_id", universeId)
      .eq("is_published", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn("⚠️ Failed to fetch codes page:", error.message);
    } else if (data?.slug) {
      addPage({
        type: "codes",
        title: `${data.name ?? "Game"} codes`,
        url: `/codes/${data.slug}`,
        description: truncateForPrompt((data as any).seo_description),
        updatedAt: (data as any).updated_at ?? null
      });
    }
  } catch (error) {
    console.warn("⚠️ Codes page lookup failed:", error instanceof Error ? error.message : String(error));
  }

  try {
    const { data, error } = await supabase
      .from("checklist_pages_view")
      .select("title, slug, description_md, content_updated_at")
      .eq("universe_id", universeId)
      .eq("is_public", true)
      .order("content_updated_at", { ascending: false })
      .limit(4);

    if (error) {
      console.warn("⚠️ Failed to fetch checklist pages:", error.message);
    } else {
      for (const row of data ?? []) {
        if (!row?.slug || !row?.title) continue;
        addPage({
          type: "checklist",
          title: row.title,
          url: `/checklists/${row.slug}`,
          description: truncateForPrompt((row as any).description_md),
          updatedAt: (row as any).content_updated_at ?? null
        });
      }
    }
  } catch (error) {
    console.warn("⚠️ Checklist lookup failed:", error instanceof Error ? error.message : String(error));
  }

  try {
    const { data, error } = await supabase
      .from("tools_view")
      .select("code, title, meta_description, content_updated_at")
      .eq("universe_id", universeId)
      .eq("is_published", true)
      .order("content_updated_at", { ascending: false })
      .limit(4);

    if (error) {
      console.warn("⚠️ Failed to fetch tools:", error.message);
    } else {
      for (const row of data ?? []) {
        if (!row?.code || !row?.title) continue;
        addPage({
          type: "tool",
          title: row.title,
          url: `/tools/${row.code}`,
          description: truncateForPrompt((row as any).meta_description),
          updatedAt: (row as any).content_updated_at ?? null
        });
      }
    }
  } catch (error) {
    console.warn("⚠️ Tools lookup failed:", error instanceof Error ? error.message : String(error));
  }

  try {
    const { data, error } = await supabase
      .from("catalog_pages_view")
      .select("code, title, meta_description, content_updated_at")
      .eq("universe_id", universeId)
      .eq("is_published", true)
      .order("content_updated_at", { ascending: false })
      .limit(4);

    if (error) {
      console.warn("⚠️ Failed to fetch catalog pages:", error.message);
    } else {
      for (const row of data ?? []) {
        if (!row?.code || !row?.title) continue;
        addPage({
          type: "catalog",
          title: row.title,
          url: `/catalog/${row.code}`,
          description: truncateForPrompt((row as any).meta_description),
          updatedAt: (row as any).content_updated_at ?? null
        });
      }
    }
  } catch (error) {
    console.warn("⚠️ Catalog lookup failed:", error instanceof Error ? error.message : String(error));
  }

  try {
    const { data, error } = await supabase
      .from("events_pages")
      .select("title, slug, meta_description, published_at, updated_at, is_published")
      .eq("universe_id", universeId)
      .eq("is_published", true)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn("⚠️ Failed to fetch events page:", error.message);
    } else if (data?.slug && data.title) {
      addPage({
        type: "events",
        title: data.title,
        url: `/events/${data.slug}`,
        description: truncateForPrompt((data as any).meta_description),
        updatedAt: (data as any).published_at ?? (data as any).updated_at ?? null
      });
    }
  } catch (error) {
    console.warn("⚠️ Events page lookup failed:", error instanceof Error ? error.message : String(error));
  }

  try {
    const { data, error } = await supabase
      .from("quiz_pages_view")
      .select("code, title, seo_description, content_updated_at, universe")
      .eq("universe_id", universeId)
      .eq("is_published", true)
      .order("content_updated_at", { ascending: false })
      .limit(2);

    if (error) {
      console.warn("⚠️ Failed to fetch quiz pages:", error.message);
    } else {
      for (const row of data ?? []) {
        if (!row?.code || !row?.title) continue;
        const universe = (row as any).universe as { display_name?: string; name?: string } | null;
        const gameName = universe?.display_name ?? universe?.name ?? null;
        addPage({
          type: "quiz",
          title: row.title,
          url: `/quiz/${row.code}`,
          description: truncateForPrompt((row as any).seo_description),
          updatedAt: (row as any).content_updated_at ?? null,
          gameName: gameName ?? null
        });
      }
    }
  } catch (error) {
    console.warn("⚠️ Quiz pages lookup failed:", error instanceof Error ? error.message : String(error));
  }

  return related;
}

async function insertRelatedLinksSection(params: {
  topic: string;
  article: DraftArticle;
  pages: RelatedUniversePage[];
}): Promise<DraftArticle> {
  const { topic, article, pages } = params;
  if (!pages.length) return article;

  const allowedUrls = new Set(pages.map((p) => p.url));

  const pageBlock = pages
    .map((page, idx) => {
      let pageContext = "";
      if (page.type === "tool") {
        pageContext = `What it is: An interactive tool we built for players. Use the description to understand what it does and link to it when the article is discussing something the tool helps with.`;
      } else if (page.type === "checklist") {
        pageContext = `What it is: A checklist we provide so players can track their progress in the game. Link to it when the article is talking about tasks, progression, or things to do/collect.`;
      } else if (page.type === "quiz") {
        const name = page.gameName ? page.gameName : "the game";
        pageContext = `What it is: A quiz we created about ${name}. It's a fun way for players to test their knowledge. Link to it when appropriate — it's optional and lighthearted, not essential.`;
      } else if (page.type === "codes") {
        pageContext = `What it is: A page with active codes and free rewards for the game. Link to it when the article touches on rewards, freebies, or getting ahead in the game.`;
      } else if (page.type === "article") {
        pageContext = `What it is: A related article on our site. Use the title and description to judge if there is a genuine thematic overlap with what the article is already discussing.`;
      } else if (page.type === "events") {
        pageContext = `What it is: Our events page for this game covering limited-time content and in-game events. Link to it only if the article already mentions events or time-limited content.`;
      } else if (page.type === "catalog") {
        pageContext = `What it is: A catalog page listing in-game items. Link to it if the article is discussing items, cosmetics, or things players can obtain.`;
      }
      return `PAGE ${idx + 1}\nType: ${page.type}\nTitle: ${page.title}\nURL: ${page.url}\nDescription: ${page.description ?? "n/a"}\n${pageContext}`;
    })
    .join("\n\n");

  const prompt = `
You are adding internal links to an existing Roblox article. Your goal is to genuinely help the reader — not to stuff links in wherever possible.

How to decide where to link:
- Read the article fully. For each related page, judge whether the article is already discussing something that page is directly relevant to. Use the page title, description, and type context to make that call.
- If there is a clear match, add one short sentence at that point in the article body that leads the reader to the page naturally. Write the sentence yourself — it should fit the surrounding text, sound like the same author, and make it obvious what the reader will find there.
- The link MUST be written as a proper Markdown link: [descriptive anchor text](URL from the page list). Use the exact URL as provided — it will be a relative path like /articles/slug or /codes/slug. Do NOT convert it to a full URL with a domain. Do NOT write https://bloxodes.com/... or https://roblox.com/... — just use the path as-is. The anchor text should describe what the reader will find, not the page title verbatim.
- Do NOT wrap existing words into links. The link must live inside a new sentence you write.
- Spread links through the article — never cluster them together or put them all near the top.

Fallback — if a page has no matching spot in the body but is still genuinely useful to someone reading this article:
- Add it as a standalone sentence at the very end, after the final paragraph. Write it naturally with a proper Markdown link [anchor text](url). Skip any page that is not relevant enough to deserve a mention even at the end.

Limits:
- 2–4 links total across body and fallback combined.
- No heading or list for the links.
- Every single link must be formatted as [anchor text](url) — plain text mentions with no link are not acceptable.
- Stay strictly on topic: "${topic}".

Related pages:
${pageBlock}

Article title: ${article.title}
Meta description: ${article.meta_description}
Article markdown:
${article.content_md}

Return JSON:
{
  "title": "${article.title}",
  "meta_description": "${article.meta_description}",
  "content_md": "Article markdown with the link sentences added"
}
`.trim();

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0.2,
    max_tokens: 4500,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You add contextual internal links to Roblox articles. Every link must be a Markdown link [anchor text](url) using the exact URL from the page list — these are relative paths like /articles/slug or /codes/slug. NEVER prepend a domain — do not write https://bloxodes.com/... or https://roblox.com/... or any other domain. Use the path exactly as given. Never write plain text mentions without a link. Never wrap existing words as links. Never force a link where context does not exist. Return valid JSON with title, content_md, meta_description."
      },
      { role: "user", content: prompt }
    ]
  });

  const raw = completion.choices[0]?.message?.content ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Related links step did not return valid JSON: ${(error as Error).message}`);
  }

  const { content_md } = parsed as Partial<DraftArticle>;
  if (!content_md) {
    throw new Error("Related links step missing required fields.");
  }

  return {
    title: article.title,
    content_md: sanitizeInternalLinks(content_md.trim(), allowedUrls),
    meta_description: article.meta_description.trim()
  };
}

async function finalPolishArticle(topic: string, article: DraftArticle): Promise<DraftArticle> {
  const prompt = `
Give this Roblox article a final polish before publishing. Your job is light editing only — do not rewrite, restructure, or change the voice. Keep every sentence as close to the original as possible.

What to check and fix:
- Intro: make sure it hooks immediately with no generic openers, clichéd phrases, or filler. It should get straight into the topic.
- Quick answer: should be right after the intro with no heading, just a seamless transition sentence into quick answer, 2–3 lines covering the core answer. If it's missing, do not add it — flag it only. 
- Headings: sentence case only (capitalize first word and proper nouns only). No "Tips", "Why this matters", "Outro", or other generic section headers. Headings should read like a casual sentence to the reader.
- Internal links: every link must be a proper Markdown link [anchor text](url) — never a bare URL or plain text mention. Make sure every existing link has clear context around it so the reader knows exactly what they will find before clicking. If any link feels random or has no surrounding context, either tighten the sentence around it or remove the link entirely. Do not add new links. Do not modify any existing URLs.
- No em-dashes anywhere — replace any with a colon or restructure the sentence.
- No emojis, no bracketed citations like [1], no mention of sources or research.
- No new external URLs. Keep all existing Markdown links, image URLs, and tables exactly as they are.
- The outro should leave the reader feeling confident and guided. No catchphrases or cringe sign-offs.
- Clean up any obvious repetition or awkward phrasing, but only where it reads poorly — do not rewrite for the sake of it.
- MOST Importantly: The article should feel like one clean story from top to bottom.

Topic: "${topic}"

Article:
Title: ${article.title}
Meta description: ${article.meta_description}
Content:
${article.content_md}

Return JSON:
{
  "title": "Keep the original title unless it clearly violates the topic rule — short, scannable, on-point",
  "meta_description": "Specific summary with keywords, under 160 characters, no generic phrasing",
  "content_md": "Polished article — minimal changes, same voice"
}
`.trim();

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0.2,
    max_tokens: 4500,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are a copy editor for a Roblox gaming site. Your job is light final polish only — fix formatting issues, clean up links, remove em-dashes, tighten the intro and outro. Do not rewrite or restructure. Keep the original voice. Return valid JSON with title, content_md, meta_description."
      },
      { role: "user", content: prompt }
    ]
  });

  const raw = completion.choices[0]?.message?.content ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Final polish step did not return valid JSON: ${(error as Error).message}`);
  }

  const { title, content_md, meta_description } = parsed as Partial<DraftArticle>;
  if (!title || !content_md || !meta_description) {
    throw new Error("Final polish step missing required fields.");
  }

  return sanitizeDraftArticle({
    title: title.trim(),
    content_md: content_md.trim(),
    meta_description: meta_description.trim()
  });
}

async function buildShortCoverTitle(title: string, topic: string): Promise<string> {
  const prompt = `
Create a short, punchy 3-6 word version of this Roblox article title to overlay on a cover image. Keep it clear and scannable. Avoid quotes or extra punctuation.

Title: ${title}
Topic: ${topic}
Return only the shortened title text.
`.trim();

  try {
    const shortText = await requestModelText({
      system: "Return only the shortened title text, no quotes or labels.",
      prompt,
      maxTokens: 50,
      temperature: 0.2
    });
    const normalized = normalizeOverlayTitle(shortText);
    if (normalized) return normalized;
  } catch (error) {
    console.warn("⚠️ Short title generation failed:", error instanceof Error ? error.message : String(error));
  }

  return normalizeOverlayTitle(title) ?? "Roblox";
}

async function insertArticleDraft(
  article: DraftArticle,
  options: { slug?: string; universeId?: number | null; coverImage?: string | null; sources?: string[] } = {}
): Promise<{ id: string; slug: string }> {
  const slug = options.slug ?? (await ensureUniqueSlug(article.title));
  const wordCount = estimateWordCount(article.content_md);
  const authorId = (await pickAuthorId()) ?? AUTHOR_ID;

  const { data, error } = await supabase
    .from("articles")
    .insert({
      title: article.title,
      slug,
      content_md: article.content_md,
      meta_description: article.meta_description,
      author_id: authorId,
      universe_id: options.universeId ?? null,
      cover_image: options.coverImage ?? null,
      is_published: false,
      sources: options.sources ?? [],
      word_count: wordCount
    })
    .select("id, slug")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to insert article draft: ${error.message}`);
  }

  if (!data?.id || !data.slug) {
    throw new Error("Article insert did not return expected data.");
  }

  return { id: data.id as string, slug: data.slug as string };
}

async function updateArticleContent(articleId: string, article: DraftArticle): Promise<boolean> {
  const wordCount = estimateWordCount(article.content_md);
  const { error } = await supabase
    .from("articles")
    .update({
      title: article.title,
      meta_description: article.meta_description,
      content_md: article.content_md,
      word_count: wordCount
    })
    .eq("id", articleId);

  if (error) {
    console.warn("⚠️ Failed to update article with images:", error.message);
    return false;
  }
  return true;
}


async function main() {
  let queueEntry: QueueRow | null = null;

  try {
    queueEntry = await getRandomQueueItem();
    if (!queueEntry) {
      console.log("No pending article tasks found.");
      return;
    }

    const topic = queueEntry.article_title?.trim();
    if (!topic) {
      throw new Error("Queue item missing article_title.");
    }

    console.log(`✏️  Generating article for "${topic}" (${queueEntry.id})`);
    await markAttempt(queueEntry);

    const { sources: collectedSources } = await gatherSources(topic, queueEntry.sources);
    console.log(`sources_collected=${collectedSources.length}`);
    const sourceUrls = collectSourceUrls(collectedSources);

    const verifiedSources = await verifySources(topic, collectedSources);
    console.log(`sources_verified=${verifiedSources.length}`);

    const articleContext = await buildArticleContext(topic, verifiedSources);
    console.log(`context_ready checklist=${articleContext.coverageChecklist ? "yes" : "no"}`);

    const prompt = buildArticlePrompt(topic, verifiedSources, articleContext);
    if (LOG_DRAFT_PROMPT) {
      console.log(`draft_prompt=\n${prompt}`);
    } else {
      console.log(`draft_prompt_ready chars=${prompt.length} sources=${verifiedSources.length}`);
    }
    const draft = await draftArticle(prompt);
    console.log(`draft_title="${draft.title}" word_count=${estimateWordCount(draft.content_md)}`);

    const refinedDraft = await refineArticleWithFeedbackLoop(topic, draft, verifiedSources, articleContext);
    console.log(`refined_title="${refinedDraft.title}" word_count=${estimateWordCount(refinedDraft.content_md)}`);

    let currentDraft = refinedDraft;
    console.log(`final_title="${currentDraft.title}" word_count=${estimateWordCount(currentDraft.content_md)}`);

    if (currentDraft.content_md.length < 400) {
      throw new Error("Draft content is too short after revision.");
    }

    const slug = await ensureUniqueSlug(currentDraft.title);

    let coverImage: string | null = null;
    if (queueEntry.universe_id) {
      console.log(`🖼️ Attaching universe cover from ${queueEntry.universe_id}...`);
      let coverTitle: string | null = null;
      try {
        coverTitle = await buildShortCoverTitle(currentDraft.title, topic);
      } catch (titleError) {
        console.warn("⚠️ Cover title generation failed:", titleError instanceof Error ? titleError.message : String(titleError));
      }
      coverImage = await uploadUniverseCoverImage(queueEntry.universe_id, slug, coverTitle);
    }

    const article = await insertArticleDraft(currentDraft, {
      slug,
      universeId: queueEntry.universe_id,
      coverImage,
      sources: sourceUrls
    });

    console.log(`article_saved id=${article.id} slug=${article.slug} cover=${coverImage ?? "none"}`);

    // Apply related links and em-dash cleanup locally before a single DB write
    const relatedPages = await fetchRelatedUniversePages({
      universeId: queueEntry.universe_id,
      excludeSlug: article.slug
    });
    console.log(`related_pages_candidates=${relatedPages.length}`);
    if (relatedPages.length > 0) {
      try {
        currentDraft = await insertRelatedLinksSection({ topic, article: currentDraft, pages: relatedPages });
        console.log(`related_links_inserted word_count=${estimateWordCount(currentDraft.content_md)}`);
      } catch (relatedError) {
        console.warn("⚠️ Failed to insert related links:", relatedError instanceof Error ? relatedError.message : String(relatedError));
      }
    } else {
      console.log("related_links_skipped=no_candidates");
    }

    try {
      currentDraft = await finalPolishArticle(topic, currentDraft);
      console.log(`final_polish_done word_count=${estimateWordCount(currentDraft.content_md)}`);
    } catch (polishError) {
      console.warn("⚠️ Final polish failed, continuing with unpolished draft:", polishError instanceof Error ? polishError.message : String(polishError));
    }

    currentDraft = finalizeDraftArticle(currentDraft);

    // Inject cover image last — after all AI steps so it can't be stripped
    if (coverImage) {
      currentDraft = {
        ...currentDraft,
        content_md: injectCoverImageBeforeFirstH2(currentDraft.content_md, coverImage, currentDraft.title)
      };
    }

    // Single DB update for all post-insert changes
    const finalUpdated = await updateArticleContent(article.id, currentDraft);
    console.log(`article_finalized word_count=${estimateWordCount(currentDraft.content_md)} updated=${finalUpdated}`);

    await updateQueueStatus(queueEntry.id, "completed", null);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("❌ Article generation failed:", message);
    if (queueEntry) {
      try {
        await updateQueueStatus(queueEntry.id, "failed", message);
      } catch (innerError) {
        console.error("⚠️ Additionally failed to update queue status:", innerError);
      }
    }
    process.exitCode = 1;
  }
}

main();
