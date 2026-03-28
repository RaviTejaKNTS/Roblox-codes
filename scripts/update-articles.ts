import "dotenv/config";

import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { JSDOM } from "jsdom";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { tavilySearch } from "./lib/tavily";

type CliOptions = {
  articleId: string | null;
  universeId: number | null;
  dryRun: boolean;
  limit: number | null;
  help: boolean;
};

type ParsedArgs = {
  options: CliOptions;
  errors: string[];
};

type ArticleRow = {
  id: string;
  title: string;
  slug: string;
  content_md: string;
  meta_description: string | null;
  universe_id: number | null;
  tags: string[] | null;
};

type UpdatedArticle = {
  content_md: string;
  meta_description: string | null;
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
  host: string;
  images: SourceImage[];
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
const SUPABASE_MEDIA_BUCKET = process.env.SUPABASE_MEDIA_BUCKET;
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

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

function estimateWordCount(markdown: string): number {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/[#>*_\\-\\[\\]\\(\\)]/g, " ")
    .replace(/\\s+/g, " ")
    .trim();

  if (!text) return 0;
  return text.split(" ").length;
}

function replaceEmDashes(value: string): string {
  return value.replace(/\u2014\s*/g, ": ");
}

function stripSourceCitations(value: string): string {
  let cleaned = value.replace(/\[\d+(?:\s*,\s*\d+)*\]\([^)]+\)/g, "");
  cleaned = cleaned.replace(/\s*\[(\d+(?:\s*,\s*\d+)*)\]/g, "");
  cleaned = cleaned.replace(/\s*\((?:source|sources|citation|citations|reference|references)[^)]*\)/gi, "");
  cleaned = cleaned.replace(/^\s*(sources?|citations?|references?)\s*:\s*.*$/gim, "");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  return cleaned.trim();
}

function sanitizeOutput(value: string): string {
  return stripSourceCitations(replaceEmDashes(value));
}

function sanitizeUpdatedArticle(article: ArticleRow): ArticleRow {
  const meta = article.meta_description ? sanitizeOutput(article.meta_description) : article.meta_description;
  return {
    ...article,
    content_md: sanitizeOutput(article.content_md),
    meta_description: meta
  };
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
  const normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized.length ? normalized : "image";
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
    const isFiniteWidth = Number.isFinite(width);
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
  const cells = Array.from(row.querySelectorAll("th,td"))
    .map((cell) => cleanText(cell.textContent ?? ""))
    .filter(Boolean) as string[];
  if (!cells.length) return null;
  return cells.join(" | ");
}

function shouldSkipImageUrl(url: string): boolean {
  return (
    url.includes("sprite") ||
    url.includes("spacer") ||
    url.includes("blank.") ||
    url.includes("pixel") ||
    url.includes("favicon") ||
    url.includes("logo") ||
    url.includes("icon") ||
    url.includes("avatar")
  );
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
    if (shouldSkipImageUrl(lowerUrl)) continue;

    addImageFromElement(img, absoluteUrl, isTable);
  }

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
    if (shouldSkipImageUrl(lowerUrl)) continue;

    addImageFromElement(srcNode, absoluteUrl, isTable);
  }

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
    if (shouldSkipImageUrl(lowerUrl)) continue;

    addImageFromElement(el, absoluteUrl, isTable);
  }

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

function extractJsonCandidate(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return null;
  return trimmed.slice(first, last + 1);
}

function tryParseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    const candidate = extractJsonCandidate(raw);
    if (!candidate) return null;
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  }
}

async function repairJsonWithOpenAI(raw: string): Promise<string> {
  const prompt = `
Fix the JSON output so it is valid JSON only. Do not change the content; only fix escaping or formatting.

Broken JSON:
${raw}
`.trim();

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0.0,
    max_tokens: 7000,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "Return valid JSON only. Preserve the exact content; only fix JSON formatting."
      },
      { role: "user", content: prompt }
    ]
  });

  return completion.choices[0]?.message?.content?.trim() ?? "";
}

async function requestJsonObject(params: {
  messages: OpenAI.ChatCompletionMessageParam[];
  maxTokens: number;
  label: string;
  temperature?: number;
}): Promise<Record<string, unknown>> {
  const attempts = 3;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: params.temperature ?? 0,
      max_tokens: params.maxTokens,
      response_format: { type: "json_object" },
      messages: params.messages
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    let parsed = tryParseJson(raw);
    if (!parsed) {
      console.warn(`WARN ${params.label} JSON invalid on attempt ${attempt}. Attempting repair.`);
      const repaired = await repairJsonWithOpenAI(raw);
      parsed = tryParseJson(repaired);
    }

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  }

  throw new Error(`OpenAI did not return valid JSON for ${params.label} after ${attempts} attempts.`);
}

function isVideoHost(hostname: string): boolean {
  const base = hostname.replace(/^www\./i, "").toLowerCase();
  return base.includes("youtube.com") || base.includes("youtu.be") || base.includes("vimeo.com") || base.includes("dailymotion.com");
}

async function searchWeb(query: string, limit: number): Promise<SearchResult[]> {
  const payload = await tavilySearch(query, {
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

function pickSourceUrls(results: SearchResult[], limit: number): string[] {
  const urls: string[] = [];
  const seenHosts = new Set<string>();

  for (const result of results) {
    if (!result.url) continue;
    try {
      const parsed = new URL(result.url);
      const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
      if (isVideoHost(host)) continue;
      if (parsed.pathname.toLowerCase().endsWith(".pdf")) continue;
      if (seenHosts.has(host)) continue;
      seenHosts.add(host);
      urls.push(parsed.toString());
      if (urls.length >= limit) break;
    } catch {
      // ignore invalid URL
    }
  }

  return urls;
}

async function fetchSourceDocument(url: string): Promise<SourceDocument | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        Accept: "text/html,application/xhtml+xml"
      }
    });
    if (!response.ok) {
      console.warn(`WARN failed to fetch ${url}: ${response.status}`);
      return null;
    }
    const html = await response.text();
    const dom = new JSDOM(html, { url });
    const host = new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
    const title = cleanText(dom.window.document.querySelector("title")?.textContent ?? "") ?? host;
    const images = extractImagesFromDocument(dom.window.document, {
      sourceUrl: url,
      sourceHost: host,
      allowAllImages: true
    });

    return {
      title,
      url,
      host,
      images: images.slice(0, 20)
    };
  } catch (error) {
    console.warn(`WARN failed to parse ${url}:`, error instanceof Error ? error.message : String(error));
    return null;
  }
}

async function collectSourcesForArticle(title: string): Promise<SourceDocument[]> {
  const query = `"${title}" Roblox`;
  const results = await searchWeb(query, 6);
  const urls = pickSourceUrls(results, 2);
  if (urls.length === 0) {
    return [];
  }

  const sources: SourceDocument[] = [];
  for (const url of urls) {
    const doc = await fetchSourceDocument(url);
    if (doc) sources.push(doc);
  }
  return sources;
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
      console.warn(`WARN failed to download source image ${imageUrl}: ${response.statusText}`);
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
    console.warn(`WARN could not process source image ${imageUrl}:`, error instanceof Error ? error.message : String(error));
    return null;
  }
}

async function uploadSourceImagesForArticle(params: {
  articleId: string;
  slug: string;
  sources: SourceDocument[];
}): Promise<{ uploaded: number; images: ImagePlacement[]; newlyUploaded: ImagePlacement[] }> {
  if (!SUPABASE_MEDIA_BUCKET) {
    console.log("INFO SUPABASE_MEDIA_BUCKET not configured. Skipping source image uploads.");
    return { uploaded: 0, images: [], newlyUploaded: [] };
  }

  const storageClient = supabase.storage.from(SUPABASE_MEDIA_BUCKET);
  const seen = new Set<string>();
  const candidates: Array<{ source: SourceDocument; image: SourceImage }> = [];

  for (const source of params.sources) {
    const images = source.images ?? [];
    console.log(`source_images_found host=${source.host} count=${images.length} url=${source.url}`);
    if (!Array.isArray(images) || images.length === 0) continue;

    for (const image of images) {
      const dedupeKey = `${source.url}|${image.originalUrl}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      candidates.push({ source, image });
    }
  }

  if (candidates.length === 0) {
    console.log("source_image_upload_skipped reason=no_images_found");
    return { uploaded: 0, images: [], newlyUploaded: [] };
  }

  const originalUrls = candidates.map((entry) => entry.image.originalUrl);
  const existingMap = new Map<string, { public_url: string | null; name: string | null; table_key: string | null; context: string | null; uploaded_path: string | null }>();

  const { data: existingRows, error: existingError } = await supabase
    .from("article_source_images")
    .select("original_url, public_url, name, table_key, context, uploaded_path")
    .eq("article_id", params.articleId)
    .in("original_url", originalUrls);

  if (existingError) {
    console.warn("WARN failed to check existing article images:", existingError.message);
  } else {
    for (const row of existingRows ?? []) {
      if (row?.original_url) {
        existingMap.set(row.original_url, {
          public_url: row.public_url ?? null,
          name: row.name ?? null,
          table_key: row.table_key ?? null,
          context: (row as { context?: string | null }).context ?? null,
          uploaded_path: row.uploaded_path ?? null
        });
      }
    }
  }

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

  const imagesOut: ImagePlacement[] = [];
  const newlyUploaded: ImagePlacement[] = [];

  for (const entry of candidates) {
    const { source, image } = entry;
    const existing = existingMap.get(image.originalUrl);
    if (existing?.public_url) {
      imagesOut.push({
        name: existing.name ?? image.name,
        publicUrl: existing.public_url,
        tableKey: existing.table_key ?? null,
        context: existing.context ?? image.context ?? image.rowText ?? null,
        uploadedPath: existing.uploaded_path ?? undefined
      });
      continue;
    }

    const converted = await downloadAndConvertSourceImage(image.originalUrl);
    if (!converted) continue;

    if (
      converted.width !== null &&
      converted.height !== null &&
      (converted.width < 20 || converted.height < 20)
    ) {
      console.warn(`WARN skipping tiny source image ${image.originalUrl} (${converted.width}x${converted.height})`);
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
      console.warn(`WARN failed to upload source image ${image.originalUrl}:`, uploadResult.error.message);
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

    if (publicUrl) {
      const placement = {
        name: image.name,
        publicUrl,
        tableKey,
        context: image.context ?? image.rowText ?? null,
        uploadedPath: path
      };
      imagesOut.push(placement);
      newlyUploaded.push(placement);
    }
  }

  if (rows.length === 0) {
    console.log("source_image_upload_skipped reason=no_new_images");
    return { uploaded: 0, images: imagesOut, newlyUploaded };
  }

  const { error } = await supabase.from("article_source_images").insert(rows);
  if (error) {
    throw new Error(`Failed to save article source images: ${error.message}`);
  }

  return { uploaded: rows.length, images: imagesOut, newlyUploaded };
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
    console.warn("WARN failed to delete unused source images from storage:", storageError.message);
  }

  const { error: dbError } = await supabase
    .from("article_source_images")
    .delete()
    .eq("article_id", params.articleId)
    .in("uploaded_path", pathsToDelete);

  if (dbError) {
    console.warn("WARN failed to delete unused source image rows:", dbError.message);
  } else {
    console.log(`source_images_cleanup_deleted=${pathsToDelete.length}`);
  }
}

async function reviseArticleWithImages(contentMd: string, images: ImagePlacement[]): Promise<string> {
  if (!images.length) return contentMd;

  const imagesBlock = images
    .map(
      (img, idx) =>
        `IMAGE ${idx + 1}\nname: ${img.name}\nurl: ${img.publicUrl}\ntable_key: ${img.tableKey ?? "n/a"}\ncontext: ${img.context ?? "n/a"}`
    )
    .join("\n\n");

  const prompt = `
You will insert provided images into the article's Markdown. Rules:
- Use only the given image URLs. Do not invent or fetch anything else.
- Only add images where there is a clear match to an existing table row or section.
- Prefer adding images into existing tables, in a new column for the matching row.
- If no clear match exists, leave the content unchanged.
- Keep all existing text intact; do not rewrite or rephrase anything. Do not remove or shorten content.
- Use Markdown image syntax: ![Alt](URL)

Images:
${imagesBlock}

Article Markdown:
${contentMd}

Return JSON only:
{
  "content_md": "Updated Markdown"
}
`.trim();

  const parsed = await requestJsonObject({
    label: "image insertion",
    maxTokens: 7000,
    messages: [
      {
        role: "system",
        content: "Insert images with minimal changes. Return valid JSON only."
      },
      { role: "user", content: prompt }
    ]
  });

  const fallbackContent = typeof parsed.content_md === "string" ? parsed.content_md.trim() : "";
  const content = fallbackContent;
  if (!content) {
    throw new Error("Image insertion missing content_md.");
  }

  return content;
}

function usage(): string {
  return `
Usage:
  tsx scripts/update-articles.ts --article-id <uuid> [--dry-run]
  tsx scripts/update-articles.ts --universe-id <id> [--limit <n>] [--dry-run]
`.trim();
}

function parseArgs(argv: string[]): ParsedArgs {
  const options: CliOptions = {
    articleId: null,
    universeId: null,
    dryRun: false,
    limit: null,
    help: false
  };
  const errors: string[] = [];
  let universeIdProvided = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg) continue;

    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--article-id" || arg === "--article") {
      const next = argv[i + 1];
      if (!next) {
        errors.push("Missing value for --article-id.");
      } else {
        options.articleId = next.trim();
        i += 1;
      }
    } else if (arg.startsWith("--article-id=")) {
      const value = arg.split("=")[1];
      if (!value) {
        errors.push("Missing value for --article-id.");
      } else {
        options.articleId = value.trim();
      }
    } else if (arg === "--universe-id" || arg === "--universe") {
      universeIdProvided = true;
      const next = argv[i + 1];
      if (!next) {
        errors.push("Missing value for --universe-id.");
      } else {
        const parsed = Number(next);
        if (!Number.isFinite(parsed)) {
          errors.push(`Invalid universe id: ${next}`);
        } else {
          options.universeId = parsed;
        }
        i += 1;
      }
    } else if (arg.startsWith("--universe-id=")) {
      universeIdProvided = true;
      const value = arg.split("=")[1];
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) {
        errors.push(`Invalid universe id: ${value}`);
      } else {
        options.universeId = parsed;
      }
    } else if (arg === "--limit") {
      const next = argv[i + 1];
      if (!next) {
        errors.push("Missing value for --limit.");
      } else {
        const parsed = Number(next);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          errors.push(`Invalid limit: ${next}`);
        } else {
          options.limit = Math.floor(parsed);
        }
        i += 1;
      }
    } else if (arg.startsWith("--limit=")) {
      const value = arg.split("=")[1];
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        errors.push(`Invalid limit: ${value}`);
      } else {
        options.limit = Math.floor(parsed);
      }
    } else {
      errors.push(`Unknown argument: ${arg}`);
    }
  }

  if (universeIdProvided && options.universeId === null) {
    errors.push("Invalid --universe-id provided.");
  }

  return { options, errors };
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
    .filter((tag) => tag.length > 0);
}

function hasUpdateTag(tags: string[]): boolean {
  return tags.some((tag) => tag.toLowerCase() === "update");
}

function ensureUpdateTag(tags: string[]): { tags: string[]; added: boolean } {
  if (hasUpdateTag(tags)) return { tags, added: false };
  return { tags: [...tags, "update"], added: true };
}

function isNoUpdateResponse(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === "no" || normalized === "no." || normalized === '"no"' || normalized === "'no'";
}

async function fetchArticles(options: CliOptions): Promise<ArticleRow[]> {
  if (options.articleId) {
    const { data, error } = await supabase
      .from("articles")
      .select("id, title, slug, content_md, meta_description, universe_id, tags")
      .eq("id", options.articleId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load article ${options.articleId}: ${error.message}`);
    }

    if (!data) {
      throw new Error(`No article found for id ${options.articleId}.`);
    }

    return [data as ArticleRow];
  }

  if (options.universeId === null) {
    return [];
  }

  let query = supabase
    .from("articles")
    .select("id, title, slug, content_md, meta_description, universe_id, tags")
    .eq("universe_id", options.universeId)
    .contains("tags", ["update"])
    .order("updated_at", { ascending: true });

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load articles for universe ${options.universeId}: ${error.message}`);
  }

  const rows = (data as ArticleRow[]) ?? [];
  return rows.filter((row) => hasUpdateTag(normalizeTags(row.tags)));
}

async function auditArticleForUpdates(article: ArticleRow): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  const prompt = `
You are checking whether a Roblox article is still up to date as of ${today}.

Task:
- Decide if any details are outdated or inaccurate.
- If everything is up to date, reply with exactly: No
- If anything is outdated, list only the specific details that need to change and the updated information.
- Do not rewrite the article. Do not add suggestions. Do not include anything else.
- Keep the focus on minimal updates only; do not expand, condense, or reframe sections.

Article Title: ${article.title}

Meta Description:
${article.meta_description ?? ""}

Article Content (Markdown):
${article.content_md}
`.trim();

  return requestModelText({
    system:
      "Return only 'No' if fully up to date. Otherwise, provide only the exact changes and updated info needed. Never suggest rewrites or expansions; keep changes minimal.",
    prompt,
    maxTokens: 800,
    temperature: 0.2
  });
}

async function checkArticleCoverage(article: ArticleRow): Promise<string> {
  const prompt = `
Check if this Roblox article misses any crucial information readers expect for the topic. Search broadly. Only consider items that are very close to the topic and critical for the intent. If everything important is covered, reply exactly: No
If something critical is missing, list the missing pieces and the exact text to add so it can be inserted as-is. Keep it concise and note where to insert (intro, specific section). Do not rewrite the article or expand existing sections.

Topic: "${article.title}"

Article Title: ${article.title}

Meta Description:
${article.meta_description ?? ""}

Article Content (Markdown):
${article.content_md}
`.trim();

  return requestModelText({
    system:
      'You judge coverage completeness for Roblox articles. Only flag items that are very close to the topic and crucial to its intent. If nothing critical is missing, reply exactly "No". Otherwise, provide only the missing items with the exact information to add. Keep changes minimal and avoid rewrites.',
    prompt,
    maxTokens: 800,
    temperature: 0
  });
}

async function applyUpdatesWithOpenAI(article: ArticleRow, updateNotes: string): Promise<UpdatedArticle> {
  const prompt = `
You are editing an existing Roblox article with minimal changes.

Rules:
- Keep the article as close to the original as possible.
- Only apply the specific updates listed below.
- Preserve Markdown structure and tone.
- Only update meta_description if an update requires it; otherwise set meta_description to UNCHANGED.
- Do not rewrite, re-order, or trim sections. Avoid adding new sections unless explicitly required by the update notes.

Updates to apply:
${updateNotes}

Current meta_description:
${article.meta_description ?? ""}

Current content_md:
${article.content_md}

Return JSON only:
{
  "content_md": "...",
  "meta_description": "UNCHANGED or updated text"
}
`.trim();

  const parsed = await requestJsonObject({
    label: "article update",
    maxTokens: 7000,
    messages: [
      {
        role: "system",
        content:
          "You are a careful editor. Apply only the requested updates with minimal changes. Keep the article close to the original and avoid rewrites. Return valid JSON only."
      },
      { role: "user", content: prompt }
    ]
  });

  const content = typeof parsed.content_md === "string" ? parsed.content_md.trim() : "";
  const metaRaw = typeof parsed.meta_description === "string" ? parsed.meta_description.trim() : "";

  if (!content) {
    throw new Error("Updated content_md is missing or empty.");
  }

  return {
    content_md: content,
    meta_description: metaRaw && metaRaw.toUpperCase() !== "UNCHANGED" ? metaRaw : article.meta_description
  };
}

async function updateSingleArticle(article: ArticleRow, options: CliOptions): Promise<void> {
  const title = article.title?.trim();
  if (!title) {
    console.warn(`WARN skipping article ${article.id} (missing title).`);
    return;
  }

  const tags = normalizeTags(article.tags);
  const { tags: nextTags, added: addedUpdateTag } = ensureUpdateTag(tags);
  if (!hasUpdateTag(tags) && !options.articleId) {
    console.log(`SKIP ${article.slug} (missing update tag).`);
    return;
  }

  let currentArticle: ArticleRow = { ...article };

  console.log(`Auditing article "${title}" (${article.id})`);
  const initialAudit = await auditArticleForUpdates(currentArticle);
  if (!initialAudit) {
    console.warn(`WARN empty audit response for ${article.slug}.`);
    return;
  }

  console.log(`Audit response (${article.slug}):\n${initialAudit}`);
  console.log(`Word count before update (${article.slug}): ${estimateWordCount(currentArticle.content_md)}`);

  if (isNoUpdateResponse(initialAudit)) {
    console.log(`OK up to date ${article.slug}`);
    return;
  } else {
    console.log(`Applying updates for ${article.slug}`);
    const updated = await applyUpdatesWithOpenAI(currentArticle, initialAudit);
    currentArticle = {
      ...currentArticle,
      content_md: updated.content_md,
      meta_description: updated.meta_description
    };
    console.log(`Word count after update (${article.slug}): ${estimateWordCount(currentArticle.content_md)}`);
  }

  console.log(`Coverage check ${article.slug}`);
  const coverageFeedback = await checkArticleCoverage(currentArticle);
  if (!coverageFeedback) {
    console.warn(`WARN empty coverage response for ${article.slug}.`);
  } else if (!isNoUpdateResponse(coverageFeedback)) {
    console.log(`Coverage response (${article.slug}):\n${coverageFeedback}`);
    console.log(`Applying coverage updates for ${article.slug}`);
    const updated = await applyUpdatesWithOpenAI(currentArticle, coverageFeedback);
    currentArticle = {
      ...currentArticle,
      content_md: updated.content_md,
      meta_description: updated.meta_description
    };
    console.log(`Word count after coverage update (${article.slug}): ${estimateWordCount(currentArticle.content_md)}`);
  } else {
    console.log(`Coverage response (${article.slug}):\n${coverageFeedback}`);
    console.log(`OK coverage clean ${article.slug}`);
  }

  console.log(`Searching sources for images ${article.slug}`);
  let sources: SourceDocument[] = [];
  try {
    sources = await collectSourcesForArticle(title);
  } catch (error) {
    console.warn(
      `WARN source search failed for ${article.slug}:`,
      error instanceof Error ? error.message : String(error)
    );
  }
  console.log(`sources_collected=${sources.length}`);

  if (sources.length > 0) {
    const sourceList = sources.map((source) => source.url).join(", ");
    console.log(`sources_used=${sourceList}`);
  }

  if (options.dryRun) {
    console.log(`DRY RUN skipping image uploads for ${article.slug}.`);
  } else if (sources.length > 0) {
    const imageResult = await uploadSourceImagesForArticle({
      articleId: article.id,
      slug: article.slug,
      sources
    });
    console.log(
      `source_images_uploaded=${imageResult.uploaded} source_images_total=${imageResult.images.length}`
    );

    if (imageResult.images.length > 0) {
      const withImages = await reviseArticleWithImages(currentArticle.content_md, imageResult.images);
      if (withImages.trim() !== currentArticle.content_md.trim()) {
        currentArticle = {
          ...currentArticle,
          content_md: withImages
        };
        console.log(`Word count after image update (${article.slug}): ${estimateWordCount(currentArticle.content_md)}`);
      } else {
        console.log(`INFO no image changes for ${article.slug}`);
      }

      await cleanupUnusedArticleImages({
        articleId: article.id,
        contentMd: currentArticle.content_md,
        images: imageResult.newlyUploaded
      });
    }
  }

  const sanitizedArticle = sanitizeUpdatedArticle(currentArticle);
  if (
    sanitizedArticle.content_md.trim() !== currentArticle.content_md.trim() ||
    (sanitizedArticle.meta_description ?? "") !== (currentArticle.meta_description ?? "")
  ) {
    console.log(`INFO sanitized output for ${article.slug}`);
  }
  currentArticle = sanitizedArticle;

  const originalMeta = article.meta_description ?? "";
  const nextMeta = currentArticle.meta_description ?? "";
  const changed =
    currentArticle.content_md.trim() !== article.content_md.trim() ||
    nextMeta.trim() !== originalMeta.trim() ||
    addedUpdateTag;

  if (!changed) {
    console.log(`SKIP no changes for ${article.slug}`);
    return;
  }

  if (options.dryRun) {
    console.log(`DRY RUN only for ${article.slug}.`);
    return;
  }

  const updatePayload: Record<string, unknown> = {
    content_md: currentArticle.content_md,
    meta_description: currentArticle.meta_description
  };

  if (addedUpdateTag) {
    updatePayload.tags = nextTags;
  }

  const { error } = await supabase
    .from("articles")
    .update(updatePayload)
    .eq("id", article.id);

  if (error) {
    throw new Error(`Failed to update article ${article.slug}: ${error.message}`);
  }

  console.log(`OK updated ${article.slug}`);
}

async function main() {
  const { options, errors } = parseArgs(process.argv.slice(2));

  if (options.help) {
    console.log(usage());
    return;
  }

  if (errors.length) {
    console.error(errors.join("\n"));
    console.error(usage());
    process.exitCode = 1;
    return;
  }

  if (options.articleId && options.universeId !== null) {
    console.error("Provide either --article-id or --universe-id, not both.");
    console.error(usage());
    process.exitCode = 1;
    return;
  }

  if (!options.articleId && options.universeId === null) {
    console.error("Missing --article-id or --universe-id.");
    console.error(usage());
    process.exitCode = 1;
    return;
  }

  const articles = await fetchArticles(options);
  if (articles.length === 0) {
    console.log("No matching articles found.");
    return;
  }

  let success = 0;
  let failed = 0;

  for (const article of articles) {
    try {
      await updateSingleArticle(article, options);
      success += 1;
    } catch (error) {
      failed += 1;
      console.error(
        `ERROR failed to update ${article.slug}:`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  console.log(`done updated=${success} failed=${failed}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
