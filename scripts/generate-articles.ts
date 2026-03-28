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
  verification?: "Yes" | "No";
  fromQueue?: boolean;
  fromNotes?: boolean;
};

type DraftArticle = {
  title: string;
  content_md: string;
  meta_description: string;
};

type ArticleContext = {
  intent: string;
  mustCover: string[];
  outline: string[];
  readerQuestions: string[];
};

type SourceGatheringResult = {
  sources: SourceDocument[];
  researchQuestions: string[];
};

type RelatedUniversePage = {
  type: "article" | "codes" | "checklist" | "tool" | "catalog" | "events";
  title: string;
  url: string;
  description?: string | null;
  updatedAt?: string | null;
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
const MAX_RESEARCH_QUESTIONS = 3;
const MAX_SEARCH_QUERIES = 5;
const MAX_REFINEMENT_PASSES = 3;

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

async function generateResearchQuestions(topic: string): Promise<string[]> {
  const fallback = [
    `What are the exact steps or requirements for ${topic}?`,
    `What items, currencies, or prerequisites are needed for ${topic}?`,
    `What are common mistakes or edge cases players should avoid for ${topic}?`
  ];

  const prompt = `
Create 3-5 specific research questions for a Roblox article. Focus on mechanics, requirements, steps, edge cases, and pitfalls. Avoid generic SEO fluff.

Topic: "${topic}"

Return JSON:
{
  "questions": ["question 1", "question 2", "question 3"]
}
  `.trim();

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.25,
      max_tokens: 250,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Return only valid JSON." },
        { role: "user", content: prompt }
      ]
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw) as { questions?: unknown };
    const normalized = normalizeStringArray(parsed.questions, MAX_RESEARCH_QUESTIONS);
    return normalized.length ? normalized : fallback;
  } catch (error) {
    console.warn("⚠️ Research question generation failed:", error instanceof Error ? error.message : String(error));
    return fallback;
  }
}

function buildSearchQueries(topic: string, questions: string[]): string[] {
  const baseQueries = [topic, `${topic} guide`, `${topic} requirements`, `${topic} steps`];
  const questionQueries = questions.map((question) => question.replace(/[?]+/g, "").trim()).filter(Boolean);
  const combined = [...baseQueries, ...questionQueries];
  const seen = new Set<string>();
  const queries: string[] = [];
  for (const query of combined) {
    const normalized = ensureRobloxKeyword(query.trim());
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    queries.push(normalized);
    if (queries.length >= MAX_SEARCH_QUERIES) break;
  }
  return queries;
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
    topic: "general"
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
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    let rawText = article?.textContent ?? "";
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
      host
    };
  } catch (error) {
    console.warn(`   • Failed to fetch ${url}:`, (error as Error).message);
    return null;
  }
}

async function collectFromResults(
  results: SearchResult[],
  collected: SourceDocument[],
  hostCounts: Map<string, number>,
  forumCount: { value: number },
  options: { seenUrls: Set<string>; excludeUrls?: Set<string>; excludeFandom?: boolean; requireFandom?: boolean }
): Promise<void> {
  for (const result of results) {
    if (collected.length >= MAX_SOURCES) break;
    if (!result.url) continue;
    const normalizedUrl = normalizeUrlForCompare(result.url);
    if (options.excludeUrls?.has(normalizedUrl)) continue;
    if (options.seenUrls.has(normalizedUrl)) continue;

    let parsed: URL;
    try {
      parsed = new URL(result.url);
    } catch {
      continue;
    }

    const host = parsed.hostname.toLowerCase();
    if (isVideoHost(host)) continue;

    const isFandom = isFandomHost(host);
    if (options.excludeFandom && isFandom) continue;
    if (options.requireFandom && !isFandom) continue;

    const isForum = isForumHost(host);
    if (isForum && forumCount.value >= MAX_FORUM_SOURCES) continue;

    const highQuality = isHighQualityHost(host);
    const hostLimit = highQuality ? MAX_PER_HOST_HIGH_QUALITY : MAX_PER_HOST_DEFAULT;
    const hostCount = hostCounts.get(host) ?? 0;
    if (hostCount >= hostLimit) continue;

    const parsedContent = await fetchArticleContent(result.url, {
      allowAllImages: false,
      allowImages: !isFandom,
      sourceHost: host
    });
    if (!parsedContent) continue;

    collected.push({
      title: result.title || parsedContent.title || result.url,
      url: result.url,
      content: parsedContent.content,
      host,
      isForum,
      images: parsedContent.images
    });

    options.seenUrls.add(normalizedUrl);
    hostCounts.set(host, hostCount + 1);
    if (isForum) forumCount.value += 1;
    console.log(`source_${collected.length}: ${host}${isForum ? " [forum]" : ""}`);
  }
}

async function buildResearchNotes(topic: string, sources: SourceDocument[], question?: string): Promise<string> {
  if (!sources.length) return "";

  const prompt = `
  Topic: "${topic}"
  ${question ? `Research question: "${question}"` : ""}
  Use only the provided research documents.
  Give full details related to this — key facts, mechanics, requirements, steps, edge cases, and common questions. Keep it tight, bullet-style notes with no filler. Do not include URLs.

  Research documents:
  ${formatSourcesForReview(sources)}
  `.trim();

  return requestModelText({
    system: "Return concise research notes. Do not include URLs. Use only the provided research documents.",
    prompt,
    maxTokens: 1000,
    temperature: 0.25
  });
}

async function gatherResearchNotes(topic: string, questions: string[], sources: SourceDocument[]): Promise<string> {
  const questionList = questions.length ? questions : [topic];
  const notes: string[] = [];

  for (const question of questionList) {
    try {
      const result = await buildResearchNotes(topic, sources, question);
      if (result) {
        notes.push(`Question: ${question}\n${result}`);
      }
    } catch (error) {
      console.warn(`   • research_notes_failed question="${question}" reason="${(error as Error).message}"`);
    }
  }

  return notes.join("\n\n").trim();
}

async function gatherSources(topic: string, queueSources?: string | null): Promise<SourceGatheringResult> {
  const collected: SourceDocument[] = [];
  const hostCounts = new Map<string, number>();
  const forumCount = { value: 0 };
  const seenUrls = new Set<string>();
  const researchQuestions = await generateResearchQuestions(topic);
  const searchQueries = buildSearchQueries(topic, researchQuestions);
  const manualUrls = parseQueueSources(queueSources ?? null);
  const queueUrlSet = new Set(manualUrls.map((url) => normalizeUrlForCompare(url)));
  for (const url of manualUrls) {
    if (collected.length >= MAX_SOURCES) break;
    const normalizedUrl = normalizeUrlForCompare(url);
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

    collected.push({
      title: parsedContent.title || url,
      url,
      content: parsedContent.content,
      host,
      isForum,
      images: parsedContent.images,
      fromQueue: true
    });

    seenUrls.add(normalizedUrl);
    hostCounts.set(host, hostCount + 1);
    if (isForum) forumCount.value += 1;
    console.log(`source_${collected.length}: ${host} [queue]${isForum ? " [forum]" : ""}`);
  }

  for (const query of searchQueries) {
    try {
      console.log(`🔎 tavily_search → ${query}`);
      const results = await searchWeb(query, MAX_RESULTS_PER_QUERY);
      await collectFromResults(results, collected, hostCounts, forumCount, {
        seenUrls,
        excludeUrls: queueUrlSet,
        excludeFandom: true
      });
      if (collected.filter((source) => !source.fromNotes).length >= TARGET_SOURCES) {
        break;
      }
    } catch (error) {
      console.warn(`   • search_failed query="${query}" reason="${(error as Error).message}"`);
    }
  }

  const fandomQuery = ensureRobloxKeyword(`${topic} fandom`);
  try {
    console.log(`🔎 tavily_search → ${fandomQuery}`);
    const results = await searchWeb(fandomQuery, MAX_RESULTS_PER_QUERY, {
      includeDomains: ["fandom.com", "fandomwiki.com"]
    });
    await collectFromResults(results, collected, hostCounts, forumCount, {
      seenUrls,
      excludeUrls: queueUrlSet,
      requireFandom: true
    });
  } catch (error) {
    console.warn(`   • fandom_search_failed query="${fandomQuery}" reason="${(error as Error).message}"`);
  }

  const notes = await gatherResearchNotes(
    topic,
    researchQuestions,
    collected.filter((source) => !source.fromNotes)
  );
  if (notes) {
    collected.push({
      title: "Research Notes",
      url: "notes:research-summary",
      content: notes.slice(0, SOURCE_CHAR_LIMIT),
      host: "internal-notes",
      isForum: false,
      images: [],
      fromNotes: true
    });
    console.log(`source_${collected.length}: internal-notes [research notes]`);
  }

  const webSources = collected.filter((source) => !source.fromNotes);
  if (webSources.length < MIN_SOURCES) {
    console.warn(`   • low_source_count collected=${webSources.length} min=${MIN_SOURCES}`);
  }

  return {
    sources: [...webSources.slice(0, MAX_SOURCES), ...collected.filter((source) => source.fromNotes)],
    researchQuestions
  };
}

async function verifySourceWithModel(topic: string, source: SourceDocument): Promise<"Yes" | "No"> {
  const prompt = `
  For the Roblox topic "${topic}", is the following source accurate and suitable to use? Minor mistakes or slightly outdated details are acceptable if the overall source is relevant and accurate. Respond with exactly "Yes" if the source is acceptable, or "No" if it should not be used. No other words.

Title: ${source.title}
URL: ${source.url}
Host: ${source.host}
Content:
  ${source.content}
  `.trim();

  const verdict = await requestModelText({
    system:
      'You judge whether a source is acceptable for the topic. Reply with exactly "Yes" to approve or "No" to reject. Minor outdated details are fine if the overall source is accurate and relevant.',
    prompt,
    maxTokens: 10,
    temperature: 0
  });
  const normalized = verdict.trim().toLowerCase();
  return normalized.startsWith("yes") ? "Yes" : "No";
}

async function verifySources(topic: string, sources: SourceDocument[]): Promise<SourceDocument[]> {
  const verified: SourceDocument[] = [];
  let verifiedPrimaryCount = 0;

  for (const source of sources) {
    if (source.fromQueue || source.fromNotes) {
      source.verification = "Yes";
      verified.push(source);
      if (!source.fromNotes) verifiedPrimaryCount += 1;
      continue;
    }

    const decision = await verifySourceWithModel(topic, source);
    source.verification = decision;
    console.log(`verify_source host=${source.host} verdict=${decision}`);
    if (decision === "Yes") {
      verified.push(source);
      verifiedPrimaryCount += 1;
    }
  }

  if (verifiedPrimaryCount < MIN_SOURCES) {
    console.warn(`   • low_verified_sources verified=${verifiedPrimaryCount} min=${MIN_SOURCES}`);
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
  const webSources = sources.filter((source) => !source.fromNotes).slice(0, 6);
  const notes = sources.filter((source) => source.fromNotes);
  return formatSourcesForPrompt([...webSources, ...notes]);
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
  if (context.outline.length) {
    sections.push(`Suggested outline:\n${formatBulletList(context.outline)}`);
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

async function preflightCoverageNotes(
  topic: string,
  sources: SourceDocument[],
  context?: ArticleContext | null
): Promise<string | null> {
  const reviewContext = formatReviewContext(context);
  const prompt = `
List the crucial information a Roblox article must cover for the topic. Keep it concise and actionable so a writer can include every key point.
Stay strictly on the topic; do not broaden scope or add adjacent topics.
Return a short bullet list. Do not add citations or URLs.

Topic: "${topic}"
${reviewContext}

Relevant research:
${formatSourcesForReview(sources)}
  `.trim();

  const notes = await requestModelText({
    system:
      "You produce concise coverage checklists for Roblox articles. Stay strictly on topic and list only crucial points readers expect.",
    prompt,
    maxTokens: 500,
    temperature: 0
  });
  return notes && notes.length > 0 ? notes : null;
}

function buildArticlePrompt(
  topic: string,
  sources: SourceDocument[],
  context?: ArticleContext | null,
  coverageNotes?: string | null
): string {
  const sourceBlock = formatSourcesForPrompt(sources);
  const contextBlock = formatContextBlock(context);
  const coverageBlock = coverageNotes ? `\n\nCoverage checklist:\n${coverageNotes}` : "";

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
  sources: SourceDocument[],
  researchQuestions: string[]
): Promise<ArticleContext> {
  const fallback: ArticleContext = {
    intent: "",
    mustCover: [],
    outline: [],
    readerQuestions: researchQuestions
  };
  const sourceBlock = formatSourcesForReview(sources);
  const questionBlock = researchQuestions.length ? formatBulletList(researchQuestions) : "n/a";

  const prompt = `
Create an SEO planning brief for a Roblox article. Ground it in the research below.

Topic: "${topic}"

Research questions (use or refine):
${questionBlock}

Research:
${sourceBlock}

Return JSON:
{
  "intent": "1-2 sentences about the search intent",
  "must_cover": ["5-8 specific coverage points", "..."],
  "outline": ["4-8 short section ideas", "..."],
  "reader_questions": ["3-5 questions the article must answer"]
}
  `.trim();

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.2,
      max_tokens: 500,
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
      outline?: unknown;
      reader_questions?: unknown;
    };

    const intent = typeof parsed.intent === "string" ? parsed.intent.trim() : "";
    const mustCover = normalizeStringArray(parsed.must_cover, 8);
    const outline = normalizeStringArray(parsed.outline, 8);
    const readerQuestions = normalizeStringArray(parsed.reader_questions, 5);

    return {
      intent,
      mustCover,
      outline,
      readerQuestions: readerQuestions.length ? readerQuestions : researchQuestions
    };
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
${formatSourcesForReview(sources)}
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
${formatSourcesForReview(sources)}
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
You are updating a Roblox article after ${label}. Keep the same friendly, conversational tone and overall structure.
- If feedback starts with "Yes", return the original article unchanged.
- If feedback starts with "No", only adjust the parts that were flagged. Keep everything else as close as possible to the original voice.
- Use the ${label} plus the provided research; do not invent new information.
- Make only the changes required by the feedback—no extra rewrites.
- Keep the article strictly about the topic; do not change or broaden it.
- Keep the title and content strictly focused on "${topic}". Do not add extra targets (no "X and Y"). Use related items only to correct confusion, then return focus to the topic.
- Do not mention sources, research, URLs, or citations.
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
  "title": "Keep this close to the original title unless feedback requires a correction. We need a small, scannable and clean title that is full sentence",
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
          "You are an expert Roblox writer. Always return valid JSON with title, content_md, and meta_description. Title must be very short, on-point, and include relevant keywords. Keep the title and content strictly about the given topic; do not broaden scope or add extra targets. Meta description must be a simple, specific summary with primary keywords, under 160 characters, and not generic. Never mention sources or citations, never include bracketed references like [1], and keep any new text paraphrased."
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
          url: `${SITE_URL}/articles/${row.slug}`,
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
        url: `${SITE_URL}/codes/${data.slug}`,
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
          url: `${SITE_URL}/checklists/${row.slug}`,
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
          url: `${SITE_URL}/tools/${row.code}`,
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
          url: `${SITE_URL}/catalog/${row.code}`,
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
        url: `${SITE_URL}/events/${data.slug}`,
        description: truncateForPrompt((data as any).meta_description),
        updatedAt: (data as any).published_at ?? (data as any).updated_at ?? null
      });
    }
  } catch (error) {
    console.warn("⚠️ Events page lookup failed:", error instanceof Error ? error.message : String(error));
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

  const pageBlock = pages
    .map(
      (page, idx) =>
        `PAGE ${idx + 1}\nType: ${page.type}\nTitle: ${page.title}\nURL: ${page.url}\nDescription: ${page.description ?? "n/a"}`
    )
    .join("\n\n");

  const prompt = `
You are adding a small related-links section to an existing Roblox article. Do not change any existing text, headings, tables, or links.
- Insert exactly one small section near the end (just above or just below the final takeaway/outro paragraph).
- The section should include only highly related links from the provided list.
- Use natural language anchor text; do NOT use exact page titles as anchor text.
- Provide a short, accurate description for each link that matches the destination page.
- Use inline Markdown links: [text](url).
- Include 3-6 links total; if fewer are truly relevant, include only those. If none fit, leave the article unchanged.
- Do not add any links not in the provided list.
- Keep the article strictly on topic: "${topic}".

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
  "content_md": "Same Markdown with only the related section inserted"
}
`.trim();

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0.2,
    max_tokens: 2000,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You add a small related-links section near the outro. Only insert the section; do not rewrite or reorder content. Return valid JSON with title, content_md, meta_description."
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
    content_md: content_md.trim(),
    meta_description: article.meta_description.trim()
  };
}

async function refineArticleAfterImages(topic: string, article: DraftArticle): Promise<DraftArticle> {
  const prompt = `
You are rewriting a Roblox article after fact checks and coverage checks. Use the article below as the source of truth: keep every important detail, remove repetition, and improve clarity. 

Write an article in simple English that is easy for anyone to understand. Use a conversational tone like a professional Indian Roblox gaming writer sharing their Roblox knowledge/experience in US English. The article should feel like a friend talking to a friend while still being factual, helpful, and engaging.

Start with an intro that directly gets into the core topic of the article. No fluff, no generic statements, no clichéd phrases, no templates. Just get to the point and write in a way that is easy to understand and engaging.
 - The start of the article should be very engaging and hook the audience into reading the entire article.
 - Instead of just a generic question or statement like If you play the game. Get directly into the explaining or bringing the pain point of the core topic if possible. 
 - Think about what type of intro serves the article best and use that.
 - No gnereic statements even if they are accurate. Instead you can bring out a interesting point, raise a question, tell an experience, highlight the pain point, break the misconception, put an bold opinion. (Should be accurate to the sources)
 - Keep it short, consise and easy to understand.
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
 - Before any tables, bullet points, or steps, write a short paragraph that sets the context. This helps the article to flow like a story. This is important and never forget it.
 - Conclude the article with a short friendly takeaway that leaves the reader feeling guided and confident. No need for any cringe ending words like "Happy fishing and defending out there!". Just keep it real and helpful.

 Most importantly: Do not add emojis, sources, or new URLs. Keep any existing links/URLs exactly as they are (including internal links and YouTube embeds). No emdashes anywhere. (Never mention these anywhere in your output)
 Additional writing rules:
 - Keep any existing Markdown tables and image URLs exactly as they are. Do not remove or reorder them.
 - Keep any existing Markdown links/URLs exactly as they are. Do not remove or rewrite them.
 - Do not copy or quote sentences from the research. Paraphrase everything in fresh wording.
 - Never mention sources, research, or citations.
 - Never include bracketed citations like [1] or [2], or any references section.

Topic: "${topic}"

Original article (do not lose details):
${article.content_md}

Return JSON:
{
  "title": "${article.title}",
  "meta_description": "Simple, specific summary with keywords (under 160 characters, no generic phrasing)",
  "content_md": "Full Markdown article"
}
`.trim();

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0.3,
    max_tokens: 4500,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are an expert Roblox writer. Always return valid JSON with title, content_md, and meta_description. Never mention sources or citations. Do not add new external URLs; keep any existing links unchanged."
      },
      { role: "user", content: prompt }
    ]
  });

  const raw = completion.choices[0]?.message?.content ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Final refinement step did not return valid JSON: ${(error as Error).message}`);
  }

  const { content_md, meta_description } = parsed as Partial<DraftArticle>;
  if (!content_md || !meta_description) {
    throw new Error("Final refinement step missing required fields.");
  }

  return {
    title: article.title,
    content_md: content_md.trim(),
    meta_description: meta_description.trim()
  };
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

    const topic = queueEntry.article_title?.trim();
    if (!topic) {
      throw new Error("Queue item missing article_title.");
    }

    console.log(`✏️  Generating article for "${topic}" (${queueEntry.id})`);
    await markAttempt(queueEntry);

    const { sources: collectedSources, researchQuestions } = await gatherSources(topic, queueEntry.sources);
    console.log(`sources_collected=${collectedSources.length}`);
    const sourceUrls = collectSourceUrls(collectedSources);

    const verifiedSources = await verifySources(topic, collectedSources);
    console.log(`sources_verified=${verifiedSources.length}`);

    const articleContext = await buildArticleContext(topic, verifiedSources, researchQuestions);
    const coverageNotes = await preflightCoverageNotes(topic, verifiedSources, articleContext);
    if (coverageNotes) {
      console.log(`coverage_preflight_ready chars=${coverageNotes.length}`);
    } else {
      console.log("coverage_preflight_skipped=empty");
    }

    const prompt = buildArticlePrompt(topic, verifiedSources, articleContext, coverageNotes);
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
          currentDraft = withImages;
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
      universeId: queueEntry.universe_id,
      excludeSlug: article.slug
    });
    console.log(`related_pages_candidates=${relatedPages.length}`);
    if (relatedPages.length > 0) {
      try {
        const withRelated = await insertRelatedLinksSection({
          topic,
          article: currentDraft,
          pages: relatedPages
        });
        const relatedUpdated = await updateArticleContent(article.id, withRelated);
        console.log(
          `related_links_inserted word_count=${estimateWordCount(withRelated.content_md)} updated=${relatedUpdated}`
        );
        if (relatedUpdated) {
          currentDraft = withRelated;
        }
      } catch (relatedError) {
        console.warn("⚠️ Failed to insert related links section:", relatedError instanceof Error ? relatedError.message : String(relatedError));
      }
    } else {
      console.log("related_links_skipped=no_candidates");
    }

    const cleanedDraft = finalizeDraftArticle(currentDraft);
    const cleanedUpdated = await updateArticleContent(article.id, cleanedDraft);
    console.log(`emdash_cleanup word_count=${estimateWordCount(cleanedDraft.content_md)} updated=${cleanedUpdated}`);
    currentDraft = cleanedDraft;

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
