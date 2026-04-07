import "dotenv/config";

import { Readability } from "@mozilla/readability";
import OpenAI from "openai";
import { JSDOM } from "jsdom";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { createHash } from "node:crypto";

import { slugify } from "@/lib/slug";
import { tavilySearch } from "./lib/tavily";

type QueueRow = {
  id: string;
  guide_title: string | null;
  universe_id: number | null;
  event_id: string | null;
  status: "pending" | "completed" | "failed";
  attempts: number;
  last_attempted_at: string | null;
  last_error: string | null;
  guide_slug?: string | null;
  article_id?: string | null;
};

type EventRow = {
  event_id: string;
  universe_id: number | null;
  title: string | null;
  display_title: string | null;
  event_status: string | null;
  event_visibility: string | null;
  start_utc: string | null;
  end_utc: string | null;
  guide_slug: string | null;
};

type UniverseNameRow = {
  display_name: string | null;
  name: string | null;
};

type EventThumbnailRow = {
  media_id: number | null;
  rank: number | null;
};

type RobloxThumbnailResponse = {
  data?: Array<{ targetId?: number; imageUrl?: string; state?: string }>;
};

type SearchResult = {
  title: string;
  url: string;
  snippet?: string;
  publishedAt?: string | null;
};

type SourceImage = {
  name: string;
  originalUrl: string;
  altText: string | null;
  caption: string | null;
  context: string | null;
  isTable: boolean;
  width: number | null;
  height: number | null;
  rowText?: string | null;
};

type SourceDocument = {
  title: string;
  url: string;
  content: string;
  host: string;
  isForum: boolean;
  images: SourceImage[];
  publishedAt?: string | null;
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

type EventGuideDetails = {
  eventId: string;
  eventLink: string;
  eventThumbnailUrl: string | null;
  eventName: string;
  gameName: string;
  startUtc: string;
  endUtc: string;
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

type ImagePlacement = {
  name: string;
  publicUrl: string;
  tableKey: string | null;
  context: string | null;
  uploadedPath?: string;
};

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const AUTHOR_ID = process.env.ARTICLE_AUTHOR_ID ?? "4fc99a58-83da-46f6-9621-7816e36b4088";
const SUPABASE_MEDIA_BUCKET = process.env.SUPABASE_MEDIA_BUCKET;
const SITE_URL = (process.env.SITE_URL ?? "https://bloxodes.com").replace(/\/$/, "");
const LOG_DRAFT_PROMPT = process.env.LOG_DRAFT_PROMPT === "true";
const EVENT_GUIDE_WAIT_HOURS = Number(process.env.EVENT_GUIDE_WAIT_HOURS ?? "6");
const EVENT_GUIDE_MIN_DURATION_HOURS = Number(process.env.EVENT_GUIDE_MIN_DURATION_HOURS ?? "24");
const EVENT_GUIDE_MAX_AGE_DAYS = Number(process.env.EVENT_GUIDE_MAX_AGE_DAYS ?? "5");
const EVENT_TIME_ZONE = "America/Los_Angeles";

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
const TARGET_SOURCES = 8;
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

const eventPageUniverseCache = new Map<number, boolean>();

async function hasEventPage(universeId: number): Promise<boolean> {
  if (eventPageUniverseCache.has(universeId)) {
    return eventPageUniverseCache.get(universeId) ?? false;
  }

  const { data, error } = await supabase
    .from("events_pages")
    .select("universe_id")
    .eq("universe_id", universeId)
    .maybeSingle();

  if (error) {
    console.warn("⚠️ Failed to check events page for universe:", error.message);
    eventPageUniverseCache.set(universeId, false);
    return false;
  }

  const hasPage = Boolean(data && typeof data.universe_id === "number");
  eventPageUniverseCache.set(universeId, hasPage);
  return hasPage;
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
  return base.includes("youtube.com") || base.includes("youtu.be") || base.includes("vimeo.com") || base.includes("dailymotion.com");
}

function isFandomHost(hostname: string): boolean {
  const base = hostname.replace(/^www\./i, "").toLowerCase();
  return base === "fandom.com" || base.endsWith(".fandom.com") || base.endsWith(".fandomwiki.com");
}

function cleanText(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length ? normalized : null;
}

function normalizeForCompare(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function titleIncludesEventName(title: string, eventName: string): boolean {
  const normalizedTitle = normalizeForCompare(title);
  const normalizedEvent = normalizeForCompare(eventName);
  return Boolean(normalizedEvent) && normalizedTitle.includes(normalizedEvent);
}

function normalizeDateValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isNaN(time) ? null : value.toISOString();
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    const ms = value > 1_000_000_000_000 ? value : value * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d{10,13}$/.test(trimmed)) {
      const numeric = Number(trimmed);
      if (!Number.isFinite(numeric)) return null;
      const ms = trimmed.length === 10 ? numeric * 1000 : numeric;
      const date = new Date(ms);
      return Number.isNaN(date.getTime()) ? null : date.toISOString();
    }
    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }
  return null;
}

function collectDatesFromJsonLd(value: unknown, dates: string[], depth = 0): void {
  if (!value || depth > 4) return;
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectDatesFromJsonLd(entry, dates, depth + 1);
    }
    return;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = ["dateModified", "dateUpdated", "updated", "lastUpdated"];
    for (const key of keys) {
      const parsed = normalizeDateValue(record[key]);
      if (parsed) dates.push(parsed);
    }
    if (record["@graph"]) {
      collectDatesFromJsonLd(record["@graph"], dates, depth + 1);
    }
    for (const key of Object.keys(record)) {
      if (key === "@graph") continue;
      const nested = record[key];
      if (typeof nested === "object") {
        collectDatesFromJsonLd(nested, dates, depth + 1);
      }
    }
  }
}

function pickLatestDate(candidates: string[]): string | null {
  let latest: { iso: string; ms: number } | null = null;
  for (const candidate of candidates) {
    const ms = Date.parse(candidate);
    if (Number.isNaN(ms)) continue;
    if (!latest || ms > latest.ms) {
      latest = { iso: candidate, ms };
    }
  }
  return latest?.iso ?? null;
}

function extractLastModifiedDate(document: Document): string | null {
  const candidates: string[] = [];
  const metaSelectors = [
    "meta[property='article:modified_time']",
    "meta[property='article:updated_time']",
    "meta[property='og:updated_time']",
    "meta[name='lastmod']",
    "meta[name='modified']",
    "meta[name='updated']",
    "meta[name='dcterms.modified']",
    "meta[name='dc.date.modified']",
    "meta[name='dateModified']",
    "meta[itemprop='dateModified']"
  ];

  for (const selector of metaSelectors) {
    const content = document.querySelector(selector)?.getAttribute("content");
    const parsed = normalizeDateValue(content);
    if (parsed) candidates.push(parsed);
  }

  const scripts = Array.from(document.querySelectorAll("script[type='application/ld+json']"));
  for (const script of scripts) {
    const raw = script.textContent?.trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      collectDatesFromJsonLd(parsed, candidates);
    } catch {
      // ignore JSON-LD parse errors
    }
  }

  return pickLatestDate(candidates);
}

function formatDateKey(ms: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(ms));

  const lookup: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      lookup[part.type] = part.value;
    }
  }

  if (!lookup.year || !lookup.month || !lookup.day) {
    return new Date(ms).toISOString().slice(0, 10);
  }

  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

function isUpdatedAfterStart(updatedAt: string | null | undefined, startMs: number): boolean {
  if (!updatedAt) return false;
  const parsed = Date.parse(updatedAt);
  if (Number.isNaN(parsed)) return false;
  if (parsed >= startMs) return true;
  return formatDateKey(parsed, EVENT_TIME_ZONE) === formatDateKey(startMs, EVENT_TIME_ZONE);
}

function formatEventStartPt(startUtc: string): string {
  const parsed = Date.parse(startUtc);
  if (Number.isNaN(parsed)) return startUtc;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: EVENT_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short"
  }).format(new Date(parsed));
}

function getEventDisplayName(event: EventRow): string | null {
  return cleanText(event.display_title) ?? cleanText(event.title);
}

function hashForPath(value: string): string {
  return createHash("md5").update(value).digest("hex").slice(0, 8);
}

function normalizeImageFileBase(name: string): string {
  const normalized = slugify(name);
  return normalized && normalized.length > 0 ? normalized : "image";
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
    if (allowedUrls.has(trimmed)) return match;
    const path = toPath(trimmed);
    if (allowedPaths.has(path)) return `[${text}](${path})`;
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

function extractUrlsFromText(raw: string | null): string[] {
  if (!raw) return [];
  const matches = raw.match(/https?:\/\/[^\s)]+/gi) ?? [];
  const cleaned = matches.map((url) =>
    url.replace(/[),.]+$/g, "").replace(/\[\d+\]$/g, "")
  );
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const url of cleaned) {
    if (!/^https?:\/\//i.test(url)) continue;
    const key = normalizeUrlForCompare(url);
    if (seen.has(key)) continue;
    seen.add(key);
    urls.push(url);
  }
  return urls;
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

function pickFromSrcset(value: string | null): string | null {
  if (!value) return null;
  const candidates = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  let best: { url: string; width: number } | null = null;
  for (const candidate of candidates) {
    const [maybeUrl, size] = candidate.split(/\s+/);
    const width = size?.endsWith("w") ? Number.parseInt(size.replace(/[^\d]/g, ""), 10) : Number.NaN;
    const normalizedUrl = maybeUrl?.trim();
    if (!normalizedUrl) continue;
    const isFiniteWidth: boolean = Number.isFinite(width);
    if (!best || (isFiniteWidth && width > best.width)) {
      const fallbackWidth: number = best ? best.width : 0;
      best = { url: normalizedUrl, width: isFiniteWidth ? width : fallbackWidth };
    }
  }

  if (best?.url) return best.url;
  const firstUrl = candidates[0]?.split(/\s+/)[0];
  return firstUrl ?? null;
}

function resolveAbsoluteUrl(url: string | null, base: string): string | null {
  if (!url) return null;
  try {
    return new URL(url, base).toString();
  } catch {
    return null;
  }
}

function deriveImageNameForRecord(alt: string | null, caption: string | null, imageUrl: string): string {
  const fromAlt = cleanText(alt);
  const fromCaption = cleanText(caption);

  if (fromAlt) return fromAlt.slice(0, 200);
  if (fromCaption) return fromCaption.slice(0, 200);

  try {
    const parsed = new URL(imageUrl);
    const last = parsed.pathname.split("/").filter(Boolean).pop() ?? "image";
    const withoutExt = last.replace(/\.[a-z0-9]+$/i, "");
    const decoded = decodeURIComponent(withoutExt);
    const cleaned = cleanText(decoded);
    if (cleaned) return cleaned.slice(0, 200);
  } catch {
    // ignore
  }

  return "image";
}

function parseBackgroundUrl(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/url\((['"]?)(.*?)\1\)/i);
  if (match && match[2]) {
    return match[2].trim();
  }
  return null;
}

function isTableContext(el: Element | null): boolean {
  if (!el) return false;
  if (el.closest("table")) return true;
  const tableLikes = [".table", ".table-responsive", ".wp-block-table", ".wikitable", ".infobox", "[role='table']"];
  return tableLikes.some((selector) => Boolean(el.closest(selector)));
}

function resolveImageAttribute(el: Element, baseUrl: string): string | null {
  const attributeCandidates = [
    "data-srcset",
    "srcset",
    "data-src",
    "data-original",
    "data-image-src",
    "data-url",
    "data-lazy-src",
    "data-lazyload",
    "data-lazy",
    "data-llsrc",
    "data-ll-src",
    "data-img",
    "data-cfsrc",
    "src"
  ];

  for (const attr of attributeCandidates) {
    const raw = el.getAttribute(attr);
    if (!raw) continue;
    const fromSrcset = attr.includes("srcset") ? pickFromSrcset(raw) : raw;
    const absolute = resolveAbsoluteUrl(fromSrcset, baseUrl);
    if (absolute) return absolute;
  }

  return null;
}

function buildTableRowText(el: Element | null): string | null {
  if (!el) return null;
  const row = el.closest("tr");
  if (!row) return null;
  const cells = Array.from(row.querySelectorAll("th,td")).map((cell) => cleanText(cell.textContent ?? "")).filter(Boolean) as string[];
  if (!cells.length) return null;
  return cells.join(" | ");
}

function extractImagesFromDocument(
  document: Document,
  options: { sourceUrl: string; sourceHost: string; allowAllImages: boolean }
): SourceImage[] {
  const images: SourceImage[] = [];
  const seen = new Set<string>();

  const addImageFromElement = (el: Element, absoluteUrl: string, isTable: boolean) => {
    if (seen.has(absoluteUrl)) return;
    seen.add(absoluteUrl);

    const alt =
      cleanText(el.getAttribute("alt")) ??
      cleanText(el.getAttribute("aria-label")) ??
      cleanText(el.getAttribute("title"));

    const tableAncestor = el.closest("table");
    const caption = tableAncestor
      ? cleanText(tableAncestor.querySelector("caption")?.textContent ?? "")
      : cleanText(el.closest("figure")?.querySelector("figcaption")?.textContent ?? "");

    const name = deriveImageNameForRecord(alt, caption, absoluteUrl);

    let context: string | null = null;
    if (isTable) {
      const cell = el.closest("td,th");
      const row = el.closest("tr");
      const header = row ? cleanText(row.querySelector("th")?.textContent ?? "") : null;
      const dataLabel = cell ? cleanText(cell.getAttribute("data-label")) : null;
      const cellText = cell ? cleanText(cell.textContent ?? "") : null;
      const parts = [caption, dataLabel, header, cellText].filter(Boolean) as string[];
      context = parts.length ? parts.join(" | ").slice(0, 500) : null;
    } else if (options.allowAllImages) {
      context = caption;
    }

    const widthAttr = Number.parseInt((el as HTMLElement).getAttribute?.("width") ?? "", 10);
    const heightAttr = Number.parseInt((el as HTMLElement).getAttribute?.("height") ?? "", 10);
    const width = Number.isFinite(widthAttr) ? widthAttr : null;
    const height = Number.isFinite(heightAttr) ? heightAttr : null;
    const rowText = buildTableRowText(el);

    images.push({
      name,
      originalUrl: absoluteUrl,
      altText: alt,
      caption,
      context,
      isTable,
      width,
      height,
      rowText
    });
  };

  const shouldKeep = (el: Element, isTable: boolean) => isTable || options.allowAllImages;

  // Regular <img> tags
  const imgNodes = Array.from(document.querySelectorAll("img"));
  for (const node of imgNodes) {
    const img = node as HTMLImageElement;
    const isTable = isTableContext(img);
    if (!shouldKeep(img, isTable)) continue;

    const absoluteUrl = resolveImageAttribute(img, options.sourceUrl);
    if (!absoluteUrl) continue;

    const lowerUrl = absoluteUrl.toLowerCase();
    if (!lowerUrl.startsWith("http://") && !lowerUrl.startsWith("https://")) continue;
    if (lowerUrl.startsWith("data:") || lowerUrl.startsWith("blob:")) continue;
    if (lowerUrl.includes("sprite") || lowerUrl.includes("spacer") || lowerUrl.includes("blank.") || lowerUrl.includes("pixel")) continue;

    addImageFromElement(img, absoluteUrl, isTable);
  }

  // <source> tags (e.g., inside <picture>) so we don't miss table images without an <img> tag
  const sourceNodes = Array.from(document.querySelectorAll("source"));
  for (const srcNode of sourceNodes) {
    const isTable = isTableContext(srcNode);
    if (!shouldKeep(srcNode, isTable)) continue;

    const rawSrc = pickFromSrcset(srcNode.getAttribute("data-srcset") ?? srcNode.getAttribute("srcset"));
    const absoluteUrl = resolveAbsoluteUrl(rawSrc, options.sourceUrl);
    if (!absoluteUrl) continue;

    const lowerUrl = absoluteUrl.toLowerCase();
    if (!lowerUrl.startsWith("http://") && !lowerUrl.startsWith("https://")) continue;
    if (lowerUrl.startsWith("data:") || lowerUrl.startsWith("blob:")) continue;
    if (lowerUrl.includes("sprite") || lowerUrl.includes("spacer") || lowerUrl.includes("blank.") || lowerUrl.includes("pixel")) continue;

    addImageFromElement(srcNode, absoluteUrl, isTable);
  }

  // Background images inside tables (or anywhere if allowAllImages)
  const bgSelector = options.allowAllImages
    ? "[style*='background-image'],[data-bg],[data-background],[data-bg-src],[data-lazy-bg]"
    : "table [style*='background-image'],table [data-bg],table [data-background],table [data-bg-src],table [data-lazy-bg], .table [style*='background-image'], .wp-block-table [style*='background-image']";
  const bgNodes = Array.from(document.querySelectorAll(bgSelector));

  for (const node of bgNodes) {
    const el = node as HTMLElement;
    const isTable = isTableContext(el);
    if (!shouldKeep(el, isTable)) continue;

    const styleUrl = parseBackgroundUrl(el.getAttribute("style"));
    const dataUrl =
      el.getAttribute("data-bg") ||
      el.getAttribute("data-background") ||
      el.getAttribute("data-bg-src") ||
      el.getAttribute("data-lazy-bg");

    const absoluteUrl = resolveAbsoluteUrl(styleUrl ?? dataUrl, options.sourceUrl);
    if (!absoluteUrl) continue;

    const lowerUrl = absoluteUrl.toLowerCase();
    if (!lowerUrl.startsWith("http://") && !lowerUrl.startsWith("https://")) continue;
    if (lowerUrl.startsWith("data:") || lowerUrl.startsWith("blob:")) continue;
    if (lowerUrl.includes("sprite") || lowerUrl.includes("spacer") || lowerUrl.includes("blank.") || lowerUrl.includes("pixel")) continue;

    addImageFromElement(el, absoluteUrl, isTable);
  }

  // AMP images and lazy noscript fallbacks inside table contexts
  const ampNodes = Array.from(document.querySelectorAll("amp-img"));
  for (const amp of ampNodes) {
    const isTable = isTableContext(amp);
    if (!shouldKeep(amp, isTable)) continue;
    const absoluteUrl = resolveImageAttribute(amp, options.sourceUrl);
    if (!absoluteUrl) continue;
    addImageFromElement(amp, absoluteUrl, isTable);
  }

  const noscripts = Array.from(document.querySelectorAll("noscript"));
  for (const ns of noscripts) {
    if (!isTableContext(ns)) continue;
    const html = ns.innerHTML;
    if (!html || !html.includes("<img")) continue;
    try {
      const fragDom = new JSDOM(html, { url: options.sourceUrl });
      const fragImgs = Array.from(fragDom.window.document.querySelectorAll("img"));
      for (const img of fragImgs) {
        const absoluteUrl = resolveImageAttribute(img, options.sourceUrl);
        if (!absoluteUrl) continue;
        addImageFromElement(img, absoluteUrl, true);
      }
    } catch {
      // ignore parse errors
    }
  }

  return images;
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

async function downloadResizeAndUploadEventCover(params: {
  imageUrl: string;
  slug: string;
  fileBase?: string;
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
      console.warn("⚠️ Failed to download event thumbnail:", response.statusText);
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const resized = await sharp(buffer)
      .resize(1200, 675, { fit: "cover", position: "attention" })
      .webp({ quality: 90, effort: 4 })
      .toBuffer();

    const fileBase = normalizeImageFileBase(params.fileBase ?? params.slug);
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
    console.warn("⚠️ Could not process event cover image:", error instanceof Error ? error.message : String(error));
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

async function uploadEventCoverImage(eventId: string, slug: string, coverTitle: string): Promise<string | null> {
  if (!SUPABASE_MEDIA_BUCKET) {
    console.log("⚠️ SUPABASE_MEDIA_BUCKET not configured. Skipping cover image upload.");
    return null;
  }

  const url = await pickEventThumbnailUrl(eventId);
  if (!url) {
    console.warn(`⚠️ No event thumbnail available for ${eventId}.`);
    return null;
  }

  return downloadResizeAndUploadEventCover({
    imageUrl: url,
    slug,
    fileBase: coverTitle
  });
}

async function getRandomQueueItem(): Promise<QueueRow | null> {
  const countQuery = supabase
    .from("event_guide_generation_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  const { count, error: countError } = await countQuery;

  if (countError) {
    throw new Error(`Failed to count queue items: ${countError.message}`);
  }

  const total = typeof count === "number" ? count : 0;
  if (total === 0) return null;

  const offset = Math.floor(Math.random() * total);
  const itemQuery = supabase
    .from("event_guide_generation_queue")
    .select("id, guide_title, status, attempts, last_attempted_at, last_error, universe_id, event_id, guide_slug, article_id")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const { data, error } = await itemQuery.range(offset, offset).maybeSingle();

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
    universe_id: Number.isFinite(universeId) ? universeId : null,
    event_id: (data as { event_id?: string | null }).event_id ?? null,
    guide_title: (data as { guide_title?: string | null }).guide_title ?? null,
    guide_slug: (data as { guide_slug?: string | null }).guide_slug ?? null,
    article_id: (data as { article_id?: string | null }).article_id ?? null
  };
}

async function fetchEventById(eventId: string): Promise<EventRow | null> {
  const { data, error } = await supabase
    .from("roblox_virtual_events")
    .select("event_id, universe_id, title, display_title, event_status, event_visibility, start_utc, end_utc, guide_slug")
    .eq("event_id", eventId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load event ${eventId}: ${error.message}`);
  }

  return (data as EventRow | null) ?? null;
}

async function fetchUniverseName(universeId: number): Promise<string | null> {
  const { data, error } = await supabase
    .from("roblox_universes")
    .select("display_name, name")
    .eq("universe_id", universeId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load universe ${universeId}: ${error.message}`);
  }

  const row = data as UniverseNameRow | null;
  return cleanText(row?.display_name) ?? cleanText(row?.name);
}

async function fetchEventThumbnailMediaIds(eventId: string): Promise<number[]> {
  const { data, error } = await supabase
    .from("roblox_virtual_event_thumbnails")
    .select("media_id, rank")
    .eq("event_id", eventId)
    .order("rank", { ascending: true });

  if (error) {
    console.warn(`⚠️ Failed to load event thumbnails for ${eventId}:`, error.message);
    return [];
  }

  return (data ?? [])
    .map((row) => (row as EventThumbnailRow).media_id)
    .filter((id): id is number => typeof id === "number");
}

async function fetchThumbnailUrls(mediaIds: number[]): Promise<Map<number, string>> {
  if (!mediaIds.length) return new Map();
  const params = new URLSearchParams({
    assetIds: mediaIds.join(","),
    size: "768x432",
    format: "Png",
    isCircular: "false"
  });

  try {
    const res = await fetch(`https://thumbnails.roblox.com/v1/assets?${params.toString()}`);
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

async function pickEventThumbnailUrl(eventId: string): Promise<string | null> {
  const mediaIds = await fetchEventThumbnailMediaIds(eventId);
  if (!mediaIds.length) return null;
  const urlMap = await fetchThumbnailUrls(mediaIds);
  for (const mediaId of mediaIds) {
    const url = urlMap.get(mediaId);
    if (url) return url;
  }
  return null;
}

async function markAttempt(queue: QueueRow): Promise<void> {
  const { error } = await supabase
    .from("event_guide_generation_queue")
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
    .from("event_guide_generation_queue")
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

async function attachGuideToEvent(eventId: string, slug: string): Promise<boolean> {
  const { data: currentRows, error: currentError } = await supabase
    .from("roblox_virtual_events")
    .select("guide_slug")
    .eq("event_id", eventId)
    .limit(1);

  if (currentError) {
    throw new Error(`Failed to load event ${eventId} before linking: ${currentError.message}`);
  }

  const current = (currentRows ?? [])[0] as { guide_slug?: string | null } | undefined;
  if (!current) {
    return false;
  }

  if (current.guide_slug && current.guide_slug !== slug) {
    return false;
  }

  const { data, error } = await supabase
    .from("roblox_virtual_events")
    .update({ guide_slug: slug })
    .eq("event_id", eventId)
    .select("event_id");

  if (error) {
    throw new Error(`Failed to link guide to event ${eventId}: ${error.message}`);
  }

  return (data ?? []).length > 0;
}

async function attachGuideToQueue(queueId: string, articleId: string, slug: string): Promise<void> {
  const { error } = await supabase
    .from("event_guide_generation_queue")
    .update({
      guide_slug: slug,
      article_id: articleId
    })
    .eq("id", queueId);

  if (error) {
    throw new Error(`Failed to link guide to queue ${queueId}: ${error.message}`);
  }
}

async function searchWeb(query: string, limit: number, options: {
  includeDomains?: string[];
  startDate?: string;
  topic?: "general" | "news";
} = {}): Promise<SearchResult[]> {
  const payload = await tavilySearch(query, {
    includeDomains: options.includeDomains,
    maxResults: limit,
    searchDepth: "advanced",
    startDate: options.startDate,
    topic: options.topic ?? "general"
  });

  return (
    payload.results
      ?.map((item) => ({
        title: item.title ?? "",
        url: item.url ?? "",
        snippet: item.content
      }))
      .filter((entry) => entry.title && entry.url) ?? []
  );
}

type ParsedArticle = {
  content: string;
  title: string | null;
  html: string;
  images: SourceImage[];
  host: string;
  publishedAt: string | null;
};

async function fetchArticleContent(
  url: string,
  options: { allowAllImages?: boolean; allowImages?: boolean; sourceHost?: string } = {}
): Promise<ParsedArticle | null> {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    host = options.sourceHost ?? "";
  }

  const allowImages = options.allowImages ?? true;
  const allowAllImages = allowImages && (options.allowAllImages ?? false);

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

    const headerModifiedAt = normalizeDateValue(response.headers.get("last-modified"));
    const html = await response.text();
    const dom = new JSDOM(html, { url });
    // Extract images before Readability mutates the DOM
    const images = allowImages
      ? extractImagesFromDocument(dom.window.document, {
          sourceUrl: url,
          sourceHost: host || options.sourceHost || "",
          allowAllImages
        })
      : [];
    const domModifiedAt = extractLastModifiedDate(dom.window.document);
    const publishedAt = pickLatestDate(
      [domModifiedAt, headerModifiedAt].filter((value): value is string => Boolean(value))
    );
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    let rawText = "";
    if (article?.content) {
      const cleanDom = new JSDOM(article.content);
      const blocks: string[] = [];
      cleanDom.window.document.querySelectorAll("p, h1, h2, h3, h4, h5, h6, td, th, li").forEach((el) => {
        if (el.querySelector("p, h1, h2, h3, h4, h5, h6")) return;
        const text = el.textContent?.replace(/\s+/g, " ").trim();
        if (text && text.length >= 20) blocks.push(text);
      });
      rawText = blocks.join(" ").replace(/\s+/g, " ").trim();
    }

    if (!rawText) {
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
      images,
      host,
      publishedAt
    };
  } catch (error) {
    console.warn(`   • Failed to fetch ${url}:`, (error as Error).message);
    return null;
  }
}


async function searchEventSourceLinks(params: { event: EventGuideDetails; limit?: number }): Promise<string[]> {
  const limit = params.limit ?? 7;
  const startDate = params.event.startUtc.slice(0, 10);
  const queries = [
    ensureRobloxKeyword(`${params.event.eventName} ${params.event.gameName} event`),
    ensureRobloxKeyword(`${params.event.eventName} ${params.event.gameName} guide`),
    ensureRobloxKeyword(`${params.event.eventName} ${params.event.gameName} rewards`)
  ];
  const urls: string[] = [];
  const seen = new Set<string>();

  for (const query of queries) {
    const results = await searchWeb(query, limit, { startDate, topic: "general" });
    for (const result of results) {
      if (!result.url) continue;
      const normalizedUrl = normalizeUrlForCompare(result.url);
      if (seen.has(normalizedUrl)) continue;
      seen.add(normalizedUrl);
      urls.push(result.url);
      if (urls.length >= limit) {
        return urls;
      }
    }
  }

  return urls;
}

async function gatherSources(params: {
  topic: string;
  queueSources?: string | null;
  eventStartMs?: number;
  eventDetails: EventGuideDetails;
}): Promise<SourceGatheringResult> {
  const { topic, queueSources, eventStartMs, eventDetails } = params;
  const collected: SourceDocument[] = [];
  const hostCounts = new Map<string, number>();
  const forumCount = { value: 0 };
  const seenUrls = new Set<string>();
  const manualUrls = parseQueueSources(queueSources ?? null);
  const manualUrlSet = new Set(manualUrls.map((url) => normalizeUrlForCompare(url)));
  let discoveredUrls: string[] = [];
  try {
    console.log(`🔎 tavily_sources → ${topic}`);
    discoveredUrls = await searchEventSourceLinks({ event: eventDetails, limit: 7 });
    if (!discoveredUrls.length) {
      console.warn("   • tavily_sources_empty");
    }
  } catch (error) {
    console.warn(`   • tavily_sources_failed reason="${(error as Error).message}"`);
  }

  const candidateUrls = [...manualUrls, ...discoveredUrls];
  const candidateSeen = new Set<string>();
  for (const url of candidateUrls) {
    const normalizedUrl = normalizeUrlForCompare(url);
    if (candidateSeen.has(normalizedUrl)) continue;
    candidateSeen.add(normalizedUrl);

    if (collected.length >= MAX_SOURCES) break;
    if (seenUrls.has(normalizedUrl)) continue;

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      continue;
    }

    const host = parsed.hostname.toLowerCase();
    if (isVideoHost(host)) continue;

    const isForum = isForumHost(host);
    if (isForum && forumCount.value >= MAX_FORUM_SOURCES) continue;

    const isFandom = isFandomHost(host);
    const highQuality = isHighQualityHost(host);
    const hostLimit = highQuality ? MAX_PER_HOST_HIGH_QUALITY : MAX_PER_HOST_DEFAULT;
    const hostCount = hostCounts.get(host) ?? 0;
    if (hostCount >= hostLimit) continue;

    const parsedContent = await fetchArticleContent(url, {
      allowAllImages: false,
      allowImages: !isFandom,
      sourceHost: host
    });
    if (!parsedContent) continue;
    if (eventStartMs && !isUpdatedAfterStart(parsedContent.publishedAt, eventStartMs)) {
      console.log(`   • Skipping ${url}: missing or pre-event last-modified date.`);
      continue;
    }

    const fromQueue = manualUrlSet.has(normalizedUrl);

    collected.push({
      title: parsedContent.title || url,
      url,
      content: parsedContent.content,
      host,
      isForum,
      images: parsedContent.images,
      publishedAt: parsedContent.publishedAt,
      fromQueue
    });

    seenUrls.add(normalizedUrl);
    hostCounts.set(host, hostCount + 1);
    if (isForum) forumCount.value += 1;
    console.log(`source_${collected.length}: ${host}${fromQueue ? " [queue]" : ""}${isForum ? " [forum]" : ""}`);
  }

  if (collected.length < MIN_SOURCES) {
    console.warn(`   • low_source_count collected=${collected.length} min=${MIN_SOURCES}`);
  }

  return { sources: collected.slice(0, MAX_SOURCES) };
}

async function verifySources(topic: string, sources: SourceDocument[]): Promise<SourceDocument[]> {
  const queueSources = sources.filter((s) => s.fromQueue);
  const toVerify = sources.filter((s) => !s.fromQueue);

  for (const s of queueSources) {
    s.verification = "Yes";
  }

  let verified = [...queueSources];

  if (toVerify.length > 0) {
    const block = toVerify
      .map(
        (s, i) =>
          `SOURCE ${i + 1}\nTitle: ${s.title}\nURL: ${s.url}\nHost: ${s.host}\nContent:\n${s.content}`
      )
      .join("\n\n");

    const prompt = `
For the Roblox topic "${topic}", review each source below and decide whether it is accurate and relevant enough to use. Minor outdated details are fine if the overall source is relevant and accurate.

Return a JSON array of verdicts in the same order as the sources:
{ "verdicts": ["Yes", "No", ...] }

${block}
    `.trim();

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        temperature: 0,
        max_tokens: 200,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: 'Return only valid JSON with a "verdicts" array. Each entry is "Yes" or "No".' },
          { role: "user", content: prompt }
        ]
      });

      const raw = completion.choices[0]?.message?.content ?? "";
      const parsed = JSON.parse(raw) as { verdicts?: unknown };
      const verdicts = Array.isArray(parsed.verdicts) ? parsed.verdicts : [];

      for (let i = 0; i < toVerify.length; i++) {
        const verdict = typeof verdicts[i] === "string" && verdicts[i].trim().toLowerCase().startsWith("yes") ? "Yes" : "No";
        toVerify[i].verification = verdict;
        console.log(`verify_source host=${toVerify[i].host} verdict=${verdict}`);
        if (verdict === "Yes") verified.push(toVerify[i]);
      }
    } catch (error) {
      console.warn("⚠️ Batch source verification failed, accepting all:", error instanceof Error ? error.message : String(error));
      for (const s of toVerify) {
        s.verification = "Yes";
        verified.push(s);
      }
    }
  }

  const primaryCount = verified.length;
  if (primaryCount < MIN_SOURCES) {
    console.warn(`   • low_verified_sources verified=${primaryCount} min=${MIN_SOURCES}`);
  }
  if (verified.length === 0) {
    throw new Error("No usable sources after verification.");
  }

  return verified;
}

function formatSourcesForPrompt(sources: SourceDocument[]): string {
  return sources
    .map(
      (source, index) =>
        `RESEARCH DOC ${index + 1}\nTITLE: ${source.title}\nURL: ${source.url}\nHOST: ${source.host}\nCONTENT:\n${source.content}\n`
    )
    .join("\n");
}

function formatSourcesForReview(sources: SourceDocument[]): string {
  return formatSourcesForPrompt(sources.slice(0, 6));
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
  if (context.coverageChecklist) {
    sections.push(`Preflight coverage notes:\n${context.coverageChecklist}`);
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


function formatEventDetailsForPrompt(details: EventGuideDetails): string {
  const thumbnailLine = details.eventThumbnailUrl
    ? `- Event thumbnail image URL: ${details.eventThumbnailUrl}`
    : "- Event thumbnail image URL: n/a";
  return [
    "Event details (authoritative):",
    `- Event name: ${details.eventName}`,
    `- Game: ${details.gameName}`,
    `- Start time (UTC): ${details.startUtc}`,
    `- End time (UTC): ${details.endUtc}`,
    `- Official Roblox event link: ${details.eventLink}`,
    thumbnailLine
  ].join("\n");
}

function buildArticlePrompt(params: {
  topic: string;
  guideTitle: string;
  sources: SourceDocument[];
  context?: ArticleContext | null;
  event: EventGuideDetails;
}): string {
  const { topic, guideTitle, sources, context, event } = params;
  const sourceBlock = formatSourcesForPrompt(sources);
  const contextBlock = formatContextBlock(context);
  const eventBlock = formatEventDetailsForPrompt(event);
  const primaryKeyword = `${event.eventName} guide`;

  return `

Write a detailed Roblox event guide for "${event.eventName}" in "${event.gameName}".
The guide should be detailed and provides all the needed for the players waiting for the event. 
Write in simple english and make the article flow like a story from start to the end. 
Write an article in simple English that is easy for anyone to understand. Use a conversational tone like a professional Indian Roblox gaming writer sharing their Roblox knowledge/experience in US English. The article should feel like a friend talking to a friend while still being factual, helpful, and engaging.
Use event name with context as per details available from the sources.

${eventBlock}
Topic focus: "${topic}"

Writing requirements:

Start with an intro that directly gets into the core topic of the article. No fluff, no generic statements, no clichéd phrases, no templates. Just get to the point and write in a way that is easy to understand and engaging.
 - The start of the article should be very engaging and hook the audience into reading the entire article.
 - Instead of just a generic question or statement like If you play the game. Get directly into the explaining or bringing the pain point of the core topic if possible. 
 - Think about what type of intro serves the article best and use that.
 - No gnereic statements even if they are accurate. Instead you can bring out a interesting point, raise a question, tell an experience, highlight the pain point, break the misconception, put an bold opinion. (Should be accurate to the sources)
 - Keep it short, consise and easy to understand.
 - Stay strictly on the event topic "${topic}". Do not broaden scope to other events, items, or unrelated guides. Use related info only to clarify confusion and then return focus to the event.
 - Title must stay strictly about this event guide (no extra targets like "X and Y").

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
 - Conclude the article with a short friendly takeaway that leaves the reader feeling guided and confident. No need for any cringe ending words like "Happy fishing and defending out there!". Just keep it real and helpful. Don't need any heading for this section.
 - Include the official Roblox event link exactly once. Use the exact URL from the event details and explicitly say it is the official Roblox event page so readers can open it directly.
 - Do not add any images to the article — the cover image will be inserted separately.
 - Do not include any other external URLs.

 Most importantly: Do not add emojis, sources, or reference numbers. The only external URL allowed is the official Roblox event link. Do not add any images. No emdashes anywhere. (Never mention these anywhere in your output)
 Additional writing rules:
 - Do not copy or quote sentences from the research. Paraphrase everything in fresh wording.
 - Never mention sources, research, or citations. Do not add any external URLs other than the official Roblox event link and the event thumbnail image URL.
 - Never include bracketed citations like [1] or [2], or any references section.

${contextBlock}

Research (do not cite or mention):
${sourceBlock}

Return JSON:
{
  "title": "${guideTitle}",
  "meta_description": "Simple, specific summary with keywords (under 160 characters, no generic phrasing)",
  "content_md": "Full Markdown article"
}
  `.trim();
}

async function buildArticleContext(
  topic: string,
  sources: SourceDocument[],
  event: EventGuideDetails,
  guideTitle: string
): Promise<ArticleContext> {
  const fallback: ArticleContext = {
    intent: "",
    mustCover: [],
    readerQuestions: [],
    coverageChecklist: null
  };
  const sourceBlock = formatSourcesForReview(sources);
  const eventBlock = formatEventDetailsForPrompt(event);

  const prompt = `
Create an SEO planning brief AND a coverage checklist for a Roblox event guide. Ground everything in the research below.

Topic: "${topic}"
Guide title: "${guideTitle}"
${eventBlock}

Research:
${sourceBlock}

Return JSON:
{
  "intent": "1-2 sentences about the search intent",
  "must_cover": ["5-8 specific coverage points the guide must address"],
  "reader_questions": ["3-5 questions the article must answer"],
  "coverage_checklist": "Short bullet list of crucial information a reader expects — stays strictly on this event, no tangents"
}
  `.trim();

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.2,
      max_tokens: 600,
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
    const coverageChecklist = typeof parsed.coverage_checklist === "string" && parsed.coverage_checklist.trim()
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
          "You are an expert Roblox event guide writer. Always return valid JSON with title, content_md, and meta_description. Title must be very short, on-point, and include relevant keywords. Keep the title and content strictly about the given event topic; do not broaden scope or add extra targets. Meta description must be a simple, specific summary with primary keywords, under 160 characters, and not generic. Never mention sources or citations, never include bracketed references like [1], and do not quote the research; paraphrase it in your own words."
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
Check if this Roblox event guide misses any crucial information that readers expect for the topic. Only consider topics that are very close to "${topic}" and crucial for the intent—skip tangents or nice-to-haves. If the guide already covers everything important, reply exactly: No
If something critical is missing, list the missing pieces and the exact text to add so it can be inserted as-is. Keep it concise and actionable, and note where it should go (intro, quick answer, specific section).
Stay strictly on the event topic; do not suggest covering adjacent events or expanding scope.

Topic: "${topic}"

Article Title: ${article.title}
Article Markdown:
${article.content_md}
${reviewContext}

 Relevant research:
${formatSourcesForReview(sources)}
`.trim();

  const feedback = await requestModelText({
    system:
      'You judge coverage completeness for Roblox event guides. Only flag items that are very close to the topic and crucial to its intent. If nothing critical is missing, reply exactly "No". Otherwise, provide only the missing items with the information to add. Do not suggest tangential ideas.',
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
Fact check this Roblox event guide. Search broadly. If everything is accurate, reply exactly: Yes
If anything is incorrect, missing, or misleading, reply starting with: No
Then give clear details of what is wrong and how to change it, including the correct information needed. Be explicit about what to fix and provide replacement wording where possible.
Keep corrections strictly on the event topic; do not broaden scope. If the guide drifts to another event or unrelated content, instruct to remove or correct it back to this event.

Topic: "${topic}"

Article Title: ${article.title}
Meta Description: ${article.meta_description}
Article Markdown:
${article.content_md}
${reviewContext}

 Relevant research:
${formatSourcesForReview(sources)}
`.trim();

  const feedback = await requestModelText({
    system:
      "You are a strict fact checker. Always reply exactly 'Yes' if the guide is accurate. Otherwise start with 'No' and provide detailed, actionable corrections with the right information.",
    prompt,
    maxTokens: 1200,
    temperature: 0
  });
  if (!feedback) {
    throw new Error("Fact check returned empty feedback.");
  }

  return feedback;
}

async function checkTopicAdherence(
  topic: string,
  article: DraftArticle,
  event: EventGuideDetails,
  context?: ArticleContext | null
): Promise<string> {
  const reviewContext = formatReviewContext(context);
  const eventBlock = formatEventDetailsForPrompt(event);
  const prompt = `
Check if this Roblox event guide stays strictly on the topic: "${topic}".
If it stays focused only on this event, reply exactly: Yes
If it drifts to other events, generic guides, or unrelated items, reply starting with: No
Then provide clear, minimal corrections and replacement text to remove off-topic content and restore focus to this event. Do not introduce new URLs.

Topic: "${topic}"
${eventBlock}

Article Title: ${article.title}
Meta Description: ${article.meta_description}
Article Markdown:
${article.content_md}
${reviewContext}
`.trim();

  const feedback = await requestModelText({
    system:
      "You enforce topic adherence for Roblox event guides. Reply exactly 'Yes' if the guide stays strictly on the event topic; otherwise start with 'No' and give precise corrections to remove scope drift.",
    prompt,
    maxTokens: 600,
    temperature: 0
  });
  if (!feedback) {
    throw new Error("Topic adherence check returned empty feedback.");
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
You are updating a Roblox event guide after ${label}. Keep the same friendly, conversational tone and overall structure.
- If feedback starts with "Yes", return the original article unchanged.
- If feedback starts with "No", only adjust the parts that were flagged. Keep everything else as close as possible to the original voice.
- Use the ${label} plus the provided research; do not invent new information.
- Make only the changes required by the feedback—no extra rewrites.
- Keep the guide strictly about the topic; do not change or broaden it.
- Keep the title and content strictly focused on "${topic}". Do not add extra targets (no "X and Y"). Use related items only to correct confusion, then return focus to the event.
- Do not mention sources, research, or citations. Do not add any external URLs other than the official Roblox event link and event thumbnail image already present in the article.
- Keep the official Roblox event link if it already exists in the article; do not remove it.
- Do not add bracketed references like [1] or [2]. Paraphrase any new text you add.

Topic: "${topic}"

${label}:
${feedback}

Research (do not cite or mention):
${sourceBlock}

Original article:
Title: ${article.title}
Meta Description: ${article.meta_description}
Content:
${article.content_md}

Return JSON:
{
  "title": "Keep this close to the original title unless feedback requires a correction",
  "meta_description": "Simple, specific summary with keywords (under 160 characters, no generic phrasing)",
  "content_md": "Updated Markdown article with only the necessary corrections"
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
          "You are an expert Roblox writer. Always return valid JSON with title, content_md, and meta_description. Title must be very short, on-point, and include relevant keywords. Keep the title and content strictly about the given event topic; do not broaden scope or add extra targets. Meta description must be a simple, specific summary with primary keywords, under 160 characters, and not generic. Never mention sources or citations, never include bracketed references like [1], and keep any new text paraphrased."
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

  const coverageFeedback1 = await checkArticleCoverage(topic, current, sources, context);
  const coverageLog1 = coverageFeedback1.replace(/\s+/g, " ").slice(0, 200);
  console.log(`coverage_check_initial="${coverageLog1}${coverageFeedback1.length > 200 ? "..." : ""}"`);
  if (!isNoCoverageFeedback(coverageFeedback1)) {
    current = await reviseArticleWithFeedback(topic, current, sources, coverageFeedback1, "coverage feedback initial");
  }

  const factCheckFeedback1 = await factCheckArticle(topic, current, sources, context);
  const factCheckLog1 = factCheckFeedback1.replace(/\s+/g, " ").slice(0, 200);
  console.log(`fact_check_initial="${factCheckLog1}${factCheckFeedback1.length > 200 ? "..." : ""}"`);
  if (!isYesFeedback(factCheckFeedback1)) {
    current = await reviseArticleWithFeedback(topic, current, sources, factCheckFeedback1, "fact-check feedback initial");
  }

  const coverageFeedback2 = await checkArticleCoverage(topic, current, sources, context);
  const coverageLog2 = coverageFeedback2.replace(/\s+/g, " ").slice(0, 200);
  console.log(`coverage_check_second="${coverageLog2}${coverageFeedback2.length > 200 ? "..." : ""}"`);
  if (!isNoCoverageFeedback(coverageFeedback2)) {
    current = await reviseArticleWithFeedback(topic, current, sources, coverageFeedback2, "coverage feedback second");
  }

  const factCheckFeedback2 = await factCheckArticle(topic, current, sources, context);
  const factCheckLog2 = factCheckFeedback2.replace(/\s+/g, " ").slice(0, 200);
  console.log(`fact_check_final="${factCheckLog2}${factCheckFeedback2.length > 200 ? "..." : ""}"`);
  if (!isYesFeedback(factCheckFeedback2)) {
    current = await reviseArticleWithFeedback(topic, current, sources, factCheckFeedback2, "fact-check feedback final");
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
    const universeRow = await supabase
      .from("roblox_universes")
      .select("name, display_name")
      .eq("universe_id", universeId)
      .maybeSingle();
    const gameName = (universeRow.data as UniverseNameRow | null)
      ? cleanText((universeRow.data as UniverseNameRow).display_name ?? (universeRow.data as UniverseNameRow).name)
      : null;

    const { data, error } = await supabase
      .from("quiz_pages_view")
      .select("code, title, seo_description, content_updated_at")
      .eq("universe_id", universeId)
      .eq("is_published", true)
      .order("content_updated_at", { ascending: false })
      .limit(2);

    if (error) {
      console.warn("⚠️ Failed to fetch quiz pages:", error.message);
    } else {
      for (const row of data ?? []) {
        if (!row?.code || !row?.title) continue;
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
  event: EventGuideDetails;
}): Promise<DraftArticle> {
  const { topic, article, pages, event } = params;
  if (!pages.length) return article;

  const allowedUrls = new Set(pages.map((p) => p.url));

  const pageBlock = pages
    .map((page, idx) => {
      let pageContext = "";
      if (page.type === "tool") {
        pageContext = `What it is: An interactive tool we built for players. Use the description to understand what it does and link to it when the guide is discussing something the tool helps with.`;
      } else if (page.type === "checklist") {
        pageContext = `What it is: A checklist we provide so players can track their progress in the game. Link to it when the guide is talking about tasks, progression, or things to do/collect.`;
      } else if (page.type === "quiz") {
        const name = page.gameName ? page.gameName : "the game";
        pageContext = `What it is: A quiz we created about ${name}. It's a fun way for players to test their knowledge. Link to it when appropriate — it's optional and lighthearted, not essential.`;
      } else if (page.type === "codes") {
        pageContext = `What it is: A page with active codes and free rewards for the game. Link to it when the guide touches on rewards, freebies, or getting ahead in the game.`;
      } else if (page.type === "article") {
        pageContext = `What it is: A related article on our site. Use the title and description to judge if there is a genuine thematic overlap with what the guide is already discussing.`;
      } else if (page.type === "events") {
        pageContext = `What it is: Our events page for this game covering all limited-time content and in-game events. Link to it when the guide already mentions other events or time-limited content.`;
      } else if (page.type === "catalog") {
        pageContext = `What it is: A catalog page listing in-game items. Link to it if the guide is discussing items, cosmetics, or things players can obtain.`;
      }
      return `PAGE ${idx + 1}\nType: ${page.type}\nTitle: ${page.title}\nURL: ${page.url}\nDescription: ${page.description ?? "n/a"}\n${pageContext}`;
    })
    .join("\n\n");

  const prompt = `
You are adding internal links to an existing Roblox event guide. Your goal is to genuinely help the reader — not to stuff links in wherever possible.

How to decide where to link:
- Read the guide fully. For each related page, judge whether the guide is already discussing something that page is directly relevant to. Use the page title, description, and type context to make that call.
- If there is a clear match, add one short sentence at that point in the guide body that leads the reader to the page naturally. Write the sentence yourself — it should fit the surrounding text, sound like the same author, and make it obvious what the reader will find there.
- The link MUST be written as a proper Markdown link: [descriptive anchor text](URL from the page list). Use the exact URL as provided — it will be a relative path like /articles/slug or /codes/slug. Do NOT convert it to a full URL with a domain. Do NOT write https://bloxodes.com/... or https://roblox.com/... — just use the path as-is. The anchor text should describe what the reader will find, not the page title verbatim.
- Do NOT wrap existing words into links. The link must live inside a new sentence you write.
- Spread links through the guide — never cluster them together or put them all near the top.

Fallback — if a page has no matching spot in the body but is still genuinely useful to someone reading this guide:
- Add it as a standalone sentence at the very end, after the final paragraph. Write it naturally with a proper Markdown link [anchor text](url). Skip any page that is not relevant enough to deserve a mention even at the end.

Limits:
- 2–4 links total across body and fallback combined.
- No heading or list for the links.
- Every single link must be formatted as [anchor text](url) — plain text mentions with no link are not acceptable.
- Keep the official Roblox event link exactly as it appears — do not remove or change it. Do not add images.
- Stay strictly on topic: "${topic}".

Event details (authoritative):
- Event name: ${event.eventName}
- Game: ${event.gameName}
- Official Roblox event link: ${event.eventLink}

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
  "content_md": "Guide markdown with the link sentences added"
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
          "You add contextual internal links to Roblox event guides. Every link must be a Markdown link [anchor text](url) using the exact URL from the page list — these are relative paths like /articles/slug or /codes/slug. NEVER prepend a domain — do not write https://bloxodes.com/... or https://roblox.com/... or any other domain. Use the path exactly as given. Never write plain text mentions without a link. Never wrap existing words as links. Never force a link where context does not exist. Keep the official Roblox event link and event thumbnail unchanged. Return valid JSON with title, content_md, meta_description."
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

async function buildEventGuideTitle(params: {
  eventName: string;
  gameName: string;
  guideTitle?: string | null;
}): Promise<string> {
  const fallbackTitle = `${params.gameName} ${params.eventName} Guide`;
  const hintTitle = cleanText(params.guideTitle);

  const prompt = `
Write a short Roblox event guide title.
Write a simple event guide title that's easily tells to the reader which exact event it is. Make it more descriptive, so any event with same name from the same game should not get confused. Make sure the event name is contextual and accurate to something people search and understand easily.
- Include the event name that is contextual
- Do not include any emojis, brackets or anything in the title. Use a simple event name that users search and understand. 
- Try include the words "Guide" and "Event"
- Use the game name "${params.gameName}"
- Keep it concise and scannable, in as less words as possible.
- Avoid colons, quotes, and em dashes
${hintTitle ? `Existing title hint: "${hintTitle}"` : ""}
Return only the title text.
`.trim();

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.2,
      max_tokens: 60,
      messages: [
        { role: "system", content: "Return only the title text, no quotes or labels." },
        { role: "user", content: prompt }
      ]
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    const cleaned = cleanText(replaceEmDashes(raw).replace(/"+/g, "")) ?? "";
    if (!cleaned) {
      return hintTitle && titleIncludesEventName(hintTitle, params.eventName) ? hintTitle : fallbackTitle;
    }

    let title = cleaned.replace(/\s+/g, " ").trim();
    if (!titleIncludesEventName(title, params.eventName)) {
      return hintTitle && titleIncludesEventName(hintTitle, params.eventName) ? hintTitle : fallbackTitle;
    }

    if (!/\bguide\b/i.test(title)) {
      title = `${title} Guide`;
    }

    if (!titleIncludesEventName(title, params.eventName)) {
      return hintTitle && titleIncludesEventName(hintTitle, params.eventName) ? hintTitle : fallbackTitle;
    }

    return title;
  } catch (error) {
    console.warn("⚠️ Guide title generation failed:", error instanceof Error ? error.message : String(error));
    return hintTitle && titleIncludesEventName(hintTitle, params.eventName) ? hintTitle : fallbackTitle;
  }
}

async function finalPolishArticle(topic: string, article: DraftArticle): Promise<DraftArticle> {
  const prompt = `
Give this Roblox event guide a final polish before publishing. Your job is light editing only — do not rewrite, restructure, or change the voice. Keep every sentence as close to the original as possible.

What to check and fix:
- Intro: make sure it hooks immediately with no generic openers, clichéd phrases, or filler. It should get straight into the event topic.
- Headings: sentence case only (capitalize first word and proper nouns only). No "Tips", "Why this matters", "Outro", or other generic section headers. Headings should read like a casual sentence to the reader.
- Internal links: every link must be a proper Markdown link [anchor text](url) — never a bare URL or plain text mention. Make sure every existing link has clear context around it so the reader knows exactly what they will find before clicking. If any link feels random or has no surrounding context, either tighten the sentence around it or remove the link entirely. Do not add new links. Do not modify any existing URLs.
- Keep the official Roblox event link exactly as it appears — do not remove or change it. Do not add images.
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
  "content_md": "Polished guide — minimal changes, same voice"
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
          "You are a copy editor for a Roblox gaming site. Your job is light final polish only — fix formatting issues, clean up links, remove em-dashes, tighten the intro and outro. Do not rewrite or restructure. Keep the original voice. Keep the official Roblox event link and event thumbnail unchanged. Return valid JSON with title, content_md, meta_description."
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
      tags: ["events"],
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

async function downloadAndConvertSourceImage(
  imageUrl: string
): Promise<{ buffer: Buffer; width: number | null; height: number | null } | null> {
  try {
    const response = await fetch(imageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8"
      },
      redirect: "follow"
    });

    if (!response.ok) {
      console.warn(`⚠️ Failed to download source image ${imageUrl}: ${response.statusText}`);
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const metadata = await sharp(buffer).metadata();
    const webpBuffer = await sharp(buffer)
      .webp({ quality: 90, effort: 4 })
      .toBuffer();

    return {
      buffer: webpBuffer,
      width: metadata.width ?? null,
      height: metadata.height ?? null
    };
  } catch (error) {
    console.warn(`⚠️ Could not process source image ${imageUrl}:`, error instanceof Error ? error.message : String(error));
    return null;
  }
}

async function uploadSourceImagesForArticle(params: {
  articleId: string;
  slug: string;
  sources: SourceDocument[];
}): Promise<{ uploaded: number; images: ImagePlacement[] }> {
  if (!SUPABASE_MEDIA_BUCKET) {
    console.log("⚠️ SUPABASE_MEDIA_BUCKET not configured. Skipping source image uploads.");
    return { uploaded: 0, images: [] };
  }

  const storageClient = supabase.storage.from(SUPABASE_MEDIA_BUCKET);
  const seen = new Set<string>();
  const rows: {
    article_id: string;
    source_url: string;
    source_host: string;
    name: string;
    original_url: string;
    uploaded_path: string;
    public_url: string | null;
    table_key: string | null;
    row_text: string | null;
    alt_text: string | null;
    caption: string | null;
    context: string | null;
    is_table: boolean;
    width: number | null;
    height: number | null;
  }[] = [];

  for (const source of params.sources) {
    const images = source.images ?? [];
    console.log(`source_images_found host=${source.host} count=${images.length} url=${source.url}`);
    if (!Array.isArray(images) || images.length === 0) continue;

    for (const image of images) {
      const dedupeKey = `${source.url}|${image.originalUrl}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const converted = await downloadAndConvertSourceImage(image.originalUrl);
      if (!converted) continue;

      if (
        converted.width !== null &&
        converted.height !== null &&
        (converted.width < 20 || converted.height < 20)
      ) {
        console.warn(`⚠️ Skipping tiny source image ${image.originalUrl} (${converted.width}x${converted.height})`);
        continue;
      }

      const fileBase = normalizeImageFileBase(image.name);
      const suffix = hashForPath(`${source.url}-${image.originalUrl}`);
      const path = `articles/${params.slug}/sources/${fileBase}-${suffix}.webp`;

      const uploadResult = await storageClient.upload(path, converted.buffer, {
        contentType: "image/webp",
        upsert: true
      });

      if (uploadResult.error) {
        console.warn(`⚠️ Failed to upload source image ${image.originalUrl}:`, uploadResult.error.message);
        continue;
      }

      const publicUrl = storageClient.getPublicUrl(path).data.publicUrl ?? null;
      const tableKey = image.isTable ? normalizeImageFileBase(image.name) : null;

      rows.push({
        article_id: params.articleId,
        source_url: source.url,
        source_host: source.host,
        name: image.name,
        original_url: image.originalUrl,
        uploaded_path: path,
        public_url: publicUrl,
        table_key: tableKey,
        row_text: image.rowText ?? null,
        alt_text: image.altText,
        caption: image.caption,
        context: image.context ?? image.rowText ?? null,
        is_table: image.isTable,
        width: converted.width ?? image.width ?? null,
        height: converted.height ?? image.height ?? null
      });
    }
  }

  if (rows.length === 0) {
    console.log("source_image_upload_skipped reason=no_images_found");
    return { uploaded: 0, images: [] };
  }

  const { error } = await supabase.from("article_source_images").insert(rows);
  if (error) {
    throw new Error(`Failed to save article source images: ${error.message}`);
  }

  const imagesOut: ImagePlacement[] = rows
    .filter((row) => row.public_url)
    .map((row) => ({
      name: row.name,
      publicUrl: row.public_url as string,
      tableKey: row.table_key,
      context: row.context ?? row.row_text ?? null,
      uploadedPath: row.uploaded_path
    }));

  return { uploaded: rows.length, images: imagesOut };
}

async function reviseArticleWithImages(article: DraftArticle, images: ImagePlacement[]): Promise<DraftArticle> {
  if (!images.length) return article;

  const imagesBlock = images
    .map(
      (img, idx) =>
        `IMAGE ${idx + 1}\nname: ${img.name}\nurl: ${img.publicUrl}\ntable_key: ${img.tableKey ?? "n/a"}\ncontext: ${img.context ?? "n/a"}`
    )
    .join("\n\n");

  const prompt = `
You will insert provided images into the article's Markdown tables. Rules:
- Use only the given image URLs. Do not invent or fetch anything else.
- Match images to table rows by name/table_key/context. If you can't confidently place an image, leave the table as-is.
- Always place the image in a new column of the matching row.
- To add images you can convert the existing info to table and add the images. 
- Prefer putting the image in the first column of the matching row using Markdown image syntax: ![Alt](URL)
- Keep all existing text; add images, do not delete content. Maintain table structure.
- Do not add a new section; only modify existing tables where a match is clear.
- If multiple images match a row, pick one.

Images:
${imagesBlock}

Article Markdown:
${article.content_md}

Return JSON:
{
  "title": "${article.title}",
  "meta_description": "${article.meta_description}",
  "content_md": "Updated Markdown with images inserted into the appropriate table rows"
}
`.trim();

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0.2,
    max_tokens: 3000,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are an expert Roblox content editor. Always return valid JSON with title, content_md, and meta_description. Title must be very short, on-point, and include relevant keywords. Meta description must be a simple, specific summary with primary keywords, under 160 characters, and not generic."
      },
      { role: "user", content: prompt }
    ]
  });

  const raw = completion.choices[0]?.message?.content ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Image insertion step did not return valid JSON: ${(error as Error).message}`);
  }

  const { title, content_md, meta_description } = parsed as Partial<DraftArticle>;
  if (!title || !content_md || !meta_description) {
    throw new Error("Image insertion missing required fields.");
  }

  return sanitizeDraftArticle({
    title: title.trim(),
    content_md: content_md.trim(),
    meta_description: meta_description.trim()
  });
}

async function cleanupUnusedArticleImages(params: {
  articleId: string;
  contentMd: string;
  images: ImagePlacement[];
}): Promise<void> {
  if (!SUPABASE_MEDIA_BUCKET || !params.images.length) return;

  const usedUrls = new Set(
    params.images
      .filter((img) => typeof img.publicUrl === "string" && params.contentMd.includes(img.publicUrl))
      .map((img) => img.publicUrl)
  );

  const pathsToDelete = Array.from(
    new Set(
      params.images
        .filter((img) => !usedUrls.has(img.publicUrl))
        .map((img) => img.uploadedPath)
        .filter((path): path is string => Boolean(path))
    )
  );

  if (!pathsToDelete.length) {
    console.log("source_images_cleanup_skipped reason=all_used");
    return;
  }

  const storageClient = supabase.storage.from(SUPABASE_MEDIA_BUCKET);
  const { error: storageError } = await storageClient.remove(pathsToDelete);
  if (storageError) {
    console.warn("⚠️ Failed to delete unused source images from storage:", storageError.message);
  }

  const { error: dbError } = await supabase
    .from("article_source_images")
    .delete()
    .eq("article_id", params.articleId)
    .in("uploaded_path", pathsToDelete);

  if (dbError) {
    console.warn("⚠️ Failed to delete unused source image rows:", dbError.message);
  } else {
    console.log(`source_images_cleanup_deleted=${pathsToDelete.length}`);
  }
}

async function main() {
  let queueEntry: QueueRow | null = null;

  try {
    queueEntry = await getRandomQueueItem();
    if (!queueEntry) {
      console.log("No pending article tasks found.");
      return;
    }

    if (!queueEntry.event_id) {
      throw new Error("Queue item missing event_id.");
    }

    const event = await fetchEventById(queueEntry.event_id);
    if (!event) {
      throw new Error(`Event ${queueEntry.event_id} not found.`);
    }

    const eventName = getEventDisplayName(event);
    if (!eventName) {
      throw new Error(`Event ${queueEntry.event_id} is missing a display title.`);
    }

    const universeId = queueEntry.universe_id ?? event.universe_id;
    if (!universeId) {
      throw new Error(`Event ${queueEntry.event_id} is missing universe_id.`);
    }
    const hasPage = await hasEventPage(universeId);
    if (!hasPage) {
      throw new Error(`Universe ${universeId} does not have an events page.`);
    }

    const status = cleanText(event.event_status)?.toLowerCase();
    const visibility = cleanText(event.event_visibility)?.toLowerCase();
    if (status !== "active" || visibility !== "public") {
      throw new Error(`Event ${queueEntry.event_id} is not active/public.`);
    }

    if (!event.start_utc) {
      throw new Error(`Event ${queueEntry.event_id} is missing start_utc.`);
    }

    if (!event.end_utc) {
      throw new Error(`Event ${queueEntry.event_id} is missing end_utc.`);
    }

    const now = Date.now();
    const startTime = Date.parse(event.start_utc);
    if (Number.isNaN(startTime)) {
      throw new Error(`Event ${queueEntry.event_id} has invalid start_utc.`);
    }

    const endTime = Date.parse(event.end_utc);
    if (Number.isNaN(endTime)) {
      throw new Error(`Event ${queueEntry.event_id} has invalid end_utc.`);
    }

    const waitMs = EVENT_GUIDE_WAIT_HOURS * 60 * 60 * 1000;
    if (startTime > now - waitMs) {
      throw new Error(`Event ${queueEntry.event_id} has not been live for ${EVENT_GUIDE_WAIT_HOURS} hours yet.`);
    }

    const minDurationMs = EVENT_GUIDE_MIN_DURATION_HOURS * 60 * 60 * 1000;
    if (endTime - startTime < minDurationMs) {
      throw new Error(`Event ${queueEntry.event_id} is shorter than ${EVENT_GUIDE_MIN_DURATION_HOURS} hours.`);
    }

    const maxAgeMs = EVENT_GUIDE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
    if (startTime < now - maxAgeMs) {
      throw new Error(`Event ${queueEntry.event_id} is older than ${EVENT_GUIDE_MAX_AGE_DAYS} days.`);
    }

    if (endTime <= now) {
      throw new Error(`Event ${queueEntry.event_id} already ended.`);
    }

    const gameName = (await fetchUniverseName(universeId)) ?? `Universe ${universeId}`;
    const guideTitle = await buildEventGuideTitle({
      eventName,
      gameName,
      guideTitle: queueEntry.guide_title ?? null
    });
    const topic = `${gameName} ${eventName} event guide`;
    const eventLink = `https://www.roblox.com/events/${event.event_id}`;
    const eventThumbnailUrl = await pickEventThumbnailUrl(event.event_id);
    const eventDetails: EventGuideDetails = {
      eventId: event.event_id,
      eventLink,
      eventThumbnailUrl,
      eventName,
      gameName,
      startUtc: event.start_utc,
      endUtc: event.end_utc
    };

    console.log(`✏️  Generating event guide for "${guideTitle}" (${queueEntry.id})`);
    await markAttempt(queueEntry);

    const { sources: collectedSources } = await gatherSources({
      topic,
      eventStartMs: startTime,
      eventDetails
    });
    console.log(`sources_collected=${collectedSources.length}`);
    const sourceUrls = collectSourceUrls(collectedSources);

    const verifiedSources = await verifySources(topic, collectedSources);
    console.log(`sources_verified=${verifiedSources.length}`);

    const articleContext = await buildArticleContext(topic, verifiedSources, eventDetails, guideTitle);
    console.log(`context_ready checklist=${articleContext.coverageChecklist ? "yes" : "no"}`);

    const prompt = buildArticlePrompt({
      topic,
      guideTitle,
      sources: verifiedSources,
      context: articleContext,
      event: eventDetails
    });
    if (LOG_DRAFT_PROMPT) {
      console.log(`draft_prompt=\n${prompt}`);
    } else {
      console.log(`draft_prompt_ready chars=${prompt.length} sources=${verifiedSources.length}`);
    }
    const draft = await draftArticle(prompt);
    console.log(`draft_title="${draft.title}" word_count=${estimateWordCount(draft.content_md)}`);

    const refinedDraft = await refineArticleWithFeedbackLoop(topic, draft, verifiedSources, articleContext);
    console.log(`refined_title="${refinedDraft.title}" word_count=${estimateWordCount(refinedDraft.content_md)}`);

    let currentDraft = { ...refinedDraft, title: guideTitle };
    console.log(`final_title="${currentDraft.title}" word_count=${estimateWordCount(currentDraft.content_md)}`);

    if (currentDraft.content_md.length < 400) {
      throw new Error("Draft content is too short after revision.");
    }

    const slug = await ensureUniqueSlug(currentDraft.title);

    let coverImage: string | null = null;
    if (queueEntry.event_id) {
      console.log(`🖼️ Attaching event cover from ${queueEntry.event_id}...`);
      coverImage = await uploadEventCoverImage(queueEntry.event_id, slug, guideTitle);
    }

    const article = await insertArticleDraft(currentDraft, {
      slug,
      universeId,
      coverImage,
      sources: sourceUrls
    });

    console.log(`article_saved id=${article.id} slug=${article.slug} cover=${coverImage ?? "none"}`);

    try {
      await attachGuideToQueue(queueEntry.id, article.id, article.slug);
    } catch (queueLinkError) {
      console.warn(
        "⚠️ Failed to link guide to queue:",
        queueLinkError instanceof Error ? queueLinkError.message : String(queueLinkError)
      );
    }

    let articleContentForCleanup = currentDraft.content_md;
    const imageUploadResult = await uploadSourceImagesForArticle({
      articleId: article.id,
      slug,
      sources: verifiedSources
    });
    console.log(`source_images_uploaded=${imageUploadResult.uploaded}`);

    if (imageUploadResult.images.length > 0) {
      try {
        const withImages = await reviseArticleWithImages(currentDraft, imageUploadResult.images);
        const updated = await updateArticleContent(article.id, withImages);
        console.log(`images_injected word_count=${estimateWordCount(withImages.content_md)} updated=${updated}`);
        if (updated) {
          currentDraft = { ...withImages, title: guideTitle };
          articleContentForCleanup = withImages.content_md;
        }
      } catch (imageError) {
        console.warn("⚠️ Failed to inject images into article:", imageError instanceof Error ? imageError.message : String(imageError));
      }

      await cleanupUnusedArticleImages({
        articleId: article.id,
        contentMd: articleContentForCleanup,
        images: imageUploadResult.images
      });
    }

    const relatedPages = await fetchRelatedUniversePages({
      universeId,
      excludeSlug: article.slug
    });
    console.log(`related_pages_candidates=${relatedPages.length}`);
    if (relatedPages.length > 0) {
      try {
        currentDraft = await insertRelatedLinksSection({
          topic,
          article: currentDraft,
          pages: relatedPages,
          event: eventDetails
        });
        currentDraft = { ...currentDraft, title: guideTitle };
        console.log(`related_links_inserted word_count=${estimateWordCount(currentDraft.content_md)}`);
      } catch (relatedError) {
        console.warn("⚠️ Failed to insert related links:", relatedError instanceof Error ? relatedError.message : String(relatedError));
      }
    } else {
      console.log("related_links_skipped=no_candidates");
    }

    const topicGuardFeedback = await checkTopicAdherence(topic, currentDraft, eventDetails, articleContext);
    const topicGuardLog = topicGuardFeedback.replace(/\s+/g, " ").slice(0, 200);
    console.log(`topic_guard="${topicGuardLog}${topicGuardFeedback.length > 200 ? "..." : ""}"`);
    if (!isYesFeedback(topicGuardFeedback)) {
      const guarded = await reviseArticleWithFeedback(topic, currentDraft, verifiedSources, topicGuardFeedback, "topic adherence check");
      currentDraft = { ...guarded, title: guideTitle };
      console.log(`topic_guard_revised word_count=${estimateWordCount(currentDraft.content_md)}`);
    }

    try {
      currentDraft = await finalPolishArticle(topic, currentDraft);
      currentDraft = { ...currentDraft, title: guideTitle };
      console.log(`final_polish_done word_count=${estimateWordCount(currentDraft.content_md)}`);
    } catch (polishError) {
      console.warn("⚠️ Final polish failed, continuing with unpolished draft:", polishError instanceof Error ? polishError.message : String(polishError));
    }

    currentDraft = { ...finalizeDraftArticle(currentDraft), title: guideTitle };

    // Inject cover image last — after all AI steps so it can't be stripped
    if (coverImage) {
      currentDraft = {
        ...currentDraft,
        content_md: injectCoverImageBeforeFirstH2(currentDraft.content_md, coverImage, guideTitle)
      };
    }

    // Single DB write for all post-image changes
    const finalUpdated = await updateArticleContent(article.id, currentDraft);
    console.log(`article_finalized word_count=${estimateWordCount(currentDraft.content_md)} updated=${finalUpdated}`);

    await updateQueueStatus(queueEntry.id, "completed", null);

    if (queueEntry.event_id) {
      try {
        const linked = await attachGuideToEvent(queueEntry.event_id, article.slug);
        console.log(`event_guide_linked=${linked}`);
      } catch (eventError) {
        console.warn(
          "⚠️ Failed to link guide to event:",
          eventError instanceof Error ? eventError.message : String(eventError)
        );
      }
    }
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
