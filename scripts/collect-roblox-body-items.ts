import "dotenv/config";

import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";

const CATALOG_DETAILS_API = "https://catalog.roblox.com/v1/search/items/details";
const CATALOG_CATEGORIES_API = "https://catalog.roblox.com/v1/categories";
const USER_AGENT = "BloxodesCatalogBot/1.0";

const DEFAULT_SORT_TYPES = [
  "MostFavorited",
  "BestSelling",
  "Sales",
  "RecentlyUpdated",
  "RecentlyCreated",
  "Relevance",
  "PriceAsc",
  "PriceDesc"
];
const DEFAULT_KEYWORDS = [..."abcdefghijklmnopqrstuvwxyz", ..."0123456789"];
const DEFAULT_KEYWORD_SORT_TYPES: string[] = [];
const ALLOWED_LIMITS = [10, 28, 30, 50, 60, 100, 120];

const CATEGORY = "Body";
const SUBCATEGORIES_RAW = process.env.ROBLOX_CATALOG_SUBCATEGORIES;
const SORT_TYPES_RAW = process.env.ROBLOX_CATALOG_SORT_TYPES;
const KEYWORDS_RAW = process.env.ROBLOX_CATALOG_KEYWORDS;
const KEYWORD_SPLITS_RAW = process.env.ROBLOX_CATALOG_KEYWORD_SPLITS;
const KEYWORD_SORT_TYPES_RAW = process.env.ROBLOX_CATALOG_KEYWORD_SORT_TYPES;

const INCLUDE_EMPTY_KEYWORD = toBoolean(process.env.ROBLOX_CATALOG_INCLUDE_EMPTY_KEYWORD, false);
const SYNC_TAXONOMY = toBoolean(process.env.ROBLOX_CATALOG_SYNC_TAXONOMY, true);
const SYNC_TAXONOMY_FORCE = toBoolean(process.env.ROBLOX_CATALOG_SYNC_TAXONOMY_FORCE, false);
const ENQUEUE_REFRESH = toBoolean(process.env.ROBLOX_CATALOG_ENQUEUE_REFRESH, true);
const DRY_RUN = toBoolean(process.env.ROBLOX_CATALOG_DRY_RUN, false);
const LOG_LEVEL = (process.env.ROBLOX_CATALOG_LOG_LEVEL ?? "info").toLowerCase();
const LOG_SAMPLE = toBoolean(process.env.ROBLOX_CATALOG_LOG_SAMPLE, true);
const LOG_SAMPLE_RAW = toBoolean(process.env.ROBLOX_CATALOG_LOG_SAMPLE_RAW, false);

const LIMIT = clampLimit(Number(process.env.ROBLOX_CATALOG_LIMIT ?? "30"));
const MAX_PAGES = Math.max(0, Math.floor(Number(process.env.ROBLOX_CATALOG_MAX_PAGES ?? "0")));
const MAX_ASSETS = Math.max(0, Math.floor(Number(process.env.ROBLOX_CATALOG_MAX_ASSETS ?? "0")));
const REQUEST_DELAY_MS = Math.max(0, Math.floor(Number(process.env.ROBLOX_CATALOG_DELAY_MS ?? "300")));
const QUERY_DELAY_MS = Math.max(0, Math.floor(Number(process.env.ROBLOX_CATALOG_QUERY_DELAY_MS ?? "600")));
const MIN_REQUEST_INTERVAL_MS = Math.max(0, Math.floor(Number(process.env.ROBLOX_CATALOG_MIN_REQUEST_MS ?? "400")));
const RETRY_BASE_MS = Math.max(100, Math.floor(Number(process.env.ROBLOX_CATALOG_RETRY_BASE_MS ?? "1000")));
const RETRY_JITTER_MS = Math.max(0, Math.floor(Number(process.env.ROBLOX_CATALOG_RETRY_JITTER_MS ?? "250")));
const RATE_LIMIT_RETRY_LIMIT = Math.max(0, Math.floor(Number(process.env.ROBLOX_CATALOG_RATE_LIMIT_RETRIES ?? "2")));
const RATE_LIMIT_COOLDOWN_MS = Math.max(0, Math.floor(Number(process.env.ROBLOX_CATALOG_RATE_LIMIT_COOLDOWN_MS ?? "5000")));
const MAX_RETRIES = Math.max(0, Math.floor(Number(process.env.ROBLOX_CATALOG_MAX_RETRIES ?? "3")));

type CatalogCategory = {
  category?: string;
  name?: string;
  categoryId?: number;
  orderIndex?: number;
  isSearchable?: boolean;
  assetTypeIds?: number[];
  bundleTypeIds?: number[];
  subcategories?: CatalogSubcategory[];
};

type CatalogSubcategory = {
  subcategory?: string;
  name?: string;
  shortName?: string | null;
  subcategoryId?: number;
  assetTypeIds?: number[];
  bundleTypeIds?: number[];
};

type CatalogItem = {
  id?: number;
  itemType?: string;
  assetType?: number;
  name?: string;
  description?: string;
  price?: number;
  priceStatus?: string;
  lowestPrice?: number;
  lowestResalePrice?: number;
  creatorName?: string;
  creatorType?: string;
  creatorTargetId?: number;
  creatorHasVerifiedBadge?: boolean;
  creatorId?: number;
  productId?: number;
  collectibleItemId?: number;
  favoriteCount?: number;
  hasResellers?: boolean;
  totalQuantity?: number;
  unitsAvailableForConsumption?: number;
  quantityLimitPerUser?: number;
  saleLocationType?: string;
  offSaleDeadline?: string;
  itemStatus?: unknown;
  itemRestrictions?: unknown;
  bundledItems?: unknown;
  isLimited?: boolean;
  isLimitedUnique?: boolean;
  isForSale?: boolean;
  remaining?: number;
};

type CatalogSearchResponse = {
  data?: CatalogItem[];
  nextPageCursor?: string | null;
  previousPageCursor?: string | null;
  errors?: Array<{ message?: string; code?: number; field?: string }>;
};

type CatalogItemRow = {
  asset_id: number;
  item_type: string;
  asset_type_id: number | null;
  category: string | null;
  subcategory: string | null;
  name: string | null;
  description: string | null;
  price_robux: number | null;
  price_status: string | null;
  lowest_price_robux: number | null;
  lowest_resale_price_robux: number | null;
  is_for_sale: boolean | null;
  is_limited: boolean | null;
  is_limited_unique: boolean | null;
  remaining: number | null;
  creator_id: number | null;
  creator_target_id: number | null;
  creator_name: string | null;
  creator_type: string | null;
  creator_has_verified_badge: boolean | null;
  product_id: number | null;
  collectible_item_id: number | null;
  favorite_count: number | null;
  has_resellers: boolean | null;
  total_quantity: number | null;
  units_available_for_consumption: number | null;
  quantity_limit_per_user: number | null;
  sale_location_type: string | null;
  off_sale_deadline: string | null;
  item_status: unknown | null;
  item_restrictions: unknown | null;
  bundled_items: unknown | null;
  last_seen_at: string;
  is_deleted: boolean;
  raw_catalog_json: Record<string, unknown>;
};

type DiscoveryHitRow = {
  run_id: string;
  asset_id: number;
  query_hash: string;
  category: string | null;
  subcategory: string | null;
  keyword: string | null;
  sort_type: string | null;
  cursor_page: number;
  seen_at: string;
};

function toBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  if (value === "1") return true;
  if (value === "0") return false;
  const normalized = value.trim().toLowerCase();
  if (["true", "yes", "y"].includes(normalized)) return true;
  if (["false", "no", "n"].includes(normalized)) return false;
  return fallback;
}

function shouldLog(level: "info" | "debug") {
  const order = { debug: 0, info: 1 };
  const current = LOG_LEVEL in order ? LOG_LEVEL : "info";
  return order[level] >= order[current as keyof typeof order];
}

function logInfo(message: string) {
  if (shouldLog("info")) {
    console.log(message);
  }
}

function logDebug(message: string) {
  if (shouldLog("debug")) {
    console.log(message);
  }
}

function clampLimit(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 30;
  const rounded = Math.floor(value);
  if (ALLOWED_LIMITS.includes(rounded)) return rounded;
  const sorted = [...ALLOWED_LIMITS].sort((a, b) => a - b);
  for (const candidate of sorted) {
    if (rounded <= candidate) return candidate;
  }
  return sorted[sorted.length - 1];
}

function parseCsv(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function normalizeSortType(value: string) {
  return value.trim().toLowerCase();
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  return null;
}

function pickSampleItem(item: CatalogItem) {
  return {
    id: item.id ?? null,
    name: item.name ?? null,
    assetType: item.assetType ?? null,
    price: item.price ?? null,
    priceStatus: item.priceStatus ?? null,
    creatorName: item.creatorName ?? null,
    creatorType: item.creatorType ?? null,
    isLimited: item.isLimited ?? null,
    isLimitedUnique: item.isLimitedUnique ?? null,
    isForSale: item.isForSale ?? null
  };
}

function buildQueryHash(input: Record<string, unknown>) {
  return createHash("sha1").update(JSON.stringify(input)).digest("hex");
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function sleep(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function withJitter(ms: number, jitterMs: number) {
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  if (!Number.isFinite(jitterMs) || jitterMs <= 0) return ms;
  return ms + Math.floor(Math.random() * jitterMs);
}

let lastRequestAt = 0;

async function throttleRequest() {
  if (MIN_REQUEST_INTERVAL_MS <= 0) return;
  const now = Date.now();
  const elapsed = now - lastRequestAt;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await sleep(MIN_REQUEST_INTERVAL_MS - elapsed);
  }
  lastRequestAt = Date.now();
}

async function fetchCatalogCategories(): Promise<CatalogCategory[]> {
  await throttleRequest();
  const res = await fetch(CATALOG_CATEGORIES_API, {
    headers: {
      accept: "application/json",
      "user-agent": USER_AGENT
    }
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Catalog categories failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const payload = (await res.json()) as unknown;
  return Array.isArray(payload) ? payload : [];
}

async function syncTaxonomy(categories: CatalogCategory[]) {
  if (DRY_RUN) return;
  const sb = supabaseAdmin();
  const categoryRows = categories
    .map((entry) => ({
      category: entry.category ?? null,
      name: entry.name ?? null,
      category_id: normalizeNumber(entry.categoryId),
      order_index: normalizeNumber(entry.orderIndex),
      is_searchable: normalizeBoolean(entry.isSearchable),
      asset_type_ids: Array.isArray(entry.assetTypeIds) ? entry.assetTypeIds : [],
      bundle_type_ids: Array.isArray(entry.bundleTypeIds) ? entry.bundleTypeIds : []
    }))
    .filter((row) => row.category);

  const subcategoryRows = categories.flatMap((entry) => {
    const category = entry.category ?? null;
    const subcategories = Array.isArray(entry.subcategories) ? entry.subcategories : [];
    return subcategories
      .map((subcategory) => ({
        subcategory: subcategory.subcategory ?? null,
        category,
        name: subcategory.name ?? null,
        short_name: subcategory.shortName ?? null,
        subcategory_id: normalizeNumber(subcategory.subcategoryId),
        asset_type_ids: Array.isArray(subcategory.assetTypeIds) ? subcategory.assetTypeIds : [],
        bundle_type_ids: Array.isArray(subcategory.bundleTypeIds) ? subcategory.bundleTypeIds : []
      }))
      .filter((row) => row.subcategory && row.category);
  });

  if (categoryRows.length) {
    const { error } = await sb.from("roblox_catalog_categories").upsert(categoryRows, { onConflict: "category" });
    if (error) throw new Error(`Failed to upsert catalog categories: ${error.message}`);
  }
  if (subcategoryRows.length) {
    const { error } = await sb
      .from("roblox_catalog_subcategories")
      .upsert(subcategoryRows, { onConflict: "subcategory" });
    if (error) throw new Error(`Failed to upsert catalog subcategories: ${error.message}`);
  }
}

async function loadSubcategoriesFromDb(category: string): Promise<string[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("roblox_catalog_subcategories")
    .select("subcategory")
    .eq("category", category);
  if (error) {
    console.warn(`Failed to load subcategories from DB: ${error.message}`);
    return [];
  }
  return (data ?? []).map((row) => row.subcategory).filter((value) => typeof value === "string");
}

async function resolveSubcategories(category: string): Promise<string[]> {
  const manual = parseCsv(SUBCATEGORIES_RAW);
  if (manual.length) return manual;

  if (!SYNC_TAXONOMY_FORCE) {
    const existing = await loadSubcategoriesFromDb(category);
    if (existing.length) return existing;
  }

  const categories = await fetchCatalogCategories();
  const categoryEntry = categories.find((entry) => entry.category === category || entry.name === category) ?? null;

  if (SYNC_TAXONOMY) {
    await syncTaxonomy(categories);
  }

  const subcategories = categoryEntry?.subcategories ?? [];
  const list = subcategories
    .map((entry) => entry.subcategory)
    .filter((value): value is string => typeof value === "string" && value.length > 0);

  if (!list.length && !SYNC_TAXONOMY_FORCE) {
    const fallback = await loadSubcategoriesFromDb(category);
    return fallback.length ? fallback : [];
  }

  return list;
}

function resolveSortTypes(): string[] {
  const manual = parseCsv(SORT_TYPES_RAW);
  return manual.length ? manual : DEFAULT_SORT_TYPES;
}

function resolveKeywordSortTypes(): string[] {
  const manual = parseCsv(KEYWORD_SORT_TYPES_RAW);
  return manual.length ? manual : DEFAULT_KEYWORD_SORT_TYPES;
}

function resolveKeywords(): string[] {
  const manual = parseCsv(KEYWORDS_RAW);
  if (manual.length) return manual;
  const splits = parseCsv(KEYWORD_SPLITS_RAW);
  if (!splits.length) return DEFAULT_KEYWORDS;

  const expanded = new Set<string>(DEFAULT_KEYWORDS);
  for (const prefix of splits) {
    const normalized = prefix.trim().toLowerCase();
    if (!normalized) continue;
    for (const letter of "abcdefghijklmnopqrstuvwxyz") {
      expanded.add(`${normalized}${letter}`);
    }
  }
  return Array.from(expanded.values());
}

async function fetchCatalogPage(params: Record<string, string>) {
  const searchParams = new URLSearchParams(params);
  const url = `${CATALOG_DETAILS_API}?${searchParams.toString()}`;
  let attempt = 0;

  while (true) {
    await throttleRequest();
    const res = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": USER_AGENT
      }
    });

    if (res.ok) {
      const payload = (await res.json()) as CatalogSearchResponse;
      return payload;
    }

    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= MAX_RETRIES) {
      const body = await res.text().catch(() => "");
      throw new Error(`Catalog search failed (${res.status}): ${body.slice(0, 200)}`);
    }

    const retryAfter = res.headers.get("retry-after");
    const retryAfterSeconds = retryAfter ? Number(retryAfter) : NaN;
    const retryAfterMs = Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1000 : 0;
    const backoff = Math.max(RETRY_BASE_MS * Math.pow(2, attempt), retryAfterMs);
    attempt += 1;
    await sleep(withJitter(backoff, RETRY_JITTER_MS));
  }
}

function buildCatalogRows(
  items: CatalogItem[],
  nowIso: string,
  category: string,
  subcategory: string | null
): CatalogItemRow[] {
  const rows: CatalogItemRow[] = [];
  items.forEach((item) => {
    const assetId = normalizeNumber(item.id);
    if (!assetId) return;
    if (item.itemType && item.itemType !== "Asset") return;

    const creatorId = normalizeNumber(item.creatorId);
    const creatorTargetId = normalizeNumber(item.creatorTargetId) ?? creatorId;
    const priceStatus = normalizeText(item.priceStatus);
    const isForSale = normalizeBoolean(item.isForSale) ?? (priceStatus ? priceStatus.toLowerCase() === "onsale" : null);

    rows.push({
      asset_id: assetId,
      item_type: item.itemType ?? "Asset",
      asset_type_id: normalizeNumber(item.assetType),
      category,
      subcategory,
      name: normalizeText(item.name),
      description: normalizeText(item.description),
      price_robux: normalizeNumber(item.price),
      price_status: priceStatus,
      lowest_price_robux: normalizeNumber(item.lowestPrice),
      lowest_resale_price_robux: normalizeNumber(item.lowestResalePrice),
      is_for_sale: isForSale,
      is_limited: normalizeBoolean(item.isLimited),
      is_limited_unique: normalizeBoolean(item.isLimitedUnique),
      remaining: normalizeNumber(item.remaining),
      creator_id: creatorId,
      creator_target_id: creatorTargetId,
      creator_name: normalizeText(item.creatorName),
      creator_type: normalizeText(item.creatorType),
      creator_has_verified_badge: normalizeBoolean(item.creatorHasVerifiedBadge),
      product_id: normalizeNumber(item.productId),
      collectible_item_id: normalizeNumber(item.collectibleItemId),
      favorite_count: normalizeNumber(item.favoriteCount),
      has_resellers: normalizeBoolean(item.hasResellers),
      total_quantity: normalizeNumber(item.totalQuantity),
      units_available_for_consumption: normalizeNumber(item.unitsAvailableForConsumption),
      quantity_limit_per_user: normalizeNumber(item.quantityLimitPerUser),
      sale_location_type: normalizeText(item.saleLocationType),
      off_sale_deadline: normalizeText(item.offSaleDeadline),
      item_status: item.itemStatus ?? null,
      item_restrictions: item.itemRestrictions ?? null,
      bundled_items: item.bundledItems ?? null,
      last_seen_at: nowIso,
      is_deleted: false,
      raw_catalog_json: (item as Record<string, unknown>) ?? {}
    });
  });
  return rows;
}

async function upsertCatalogItems(rows: CatalogItemRow[]) {
  if (!rows.length || DRY_RUN) return;
  const sb = supabaseAdmin();
  for (const chunk of chunkArray(rows, 200)) {
    const { error } = await sb.from("roblox_catalog_items").upsert(chunk, { onConflict: "asset_id" });
    if (error) throw new Error(`Failed to upsert catalog items: ${error.message}`);
    logInfo(`Upserted ${chunk.length} items into roblox_catalog_items.`);
  }
}

async function insertDiscoveryHits(rows: DiscoveryHitRow[]) {
  if (!rows.length || DRY_RUN) return;
  const sb = supabaseAdmin();
  for (const chunk of chunkArray(rows, 500)) {
    const { error } = await sb
      .from("roblox_catalog_discovery_hits")
      .upsert(chunk, { onConflict: "run_id,asset_id" });
    if (error) throw new Error(`Failed to upsert discovery hits: ${error.message}`);
    logDebug(`Upserted ${chunk.length} discovery hits.`);
  }
}

async function enqueueRefresh(assetIds: number[], nowIso: string) {
  if (!assetIds.length || DRY_RUN || !ENQUEUE_REFRESH) return;
  const sb = supabaseAdmin();
  const rows = assetIds.map((assetId) => ({
    asset_id: assetId,
    priority: "new",
    next_run_at: nowIso,
    attempts: 0,
    last_error: null
  }));
  const { error } = await sb
    .from("roblox_catalog_refresh_queue")
    .upsert(rows, { onConflict: "asset_id", ignoreDuplicates: true });
  if (error) throw new Error(`Failed to enqueue refresh items: ${error.message}`);
  logDebug(`Enqueued ${assetIds.length} assets for refresh.`);
}

async function createDiscoveryRun(): Promise<string | null> {
  if (DRY_RUN) return null;
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("roblox_catalog_discovery_runs")
    .insert({
      strategy: "catalog_search_details",
      category: CATEGORY,
      status: "running",
      started_at: new Date().toISOString()
    })
    .select("run_id")
    .single();

  if (error) throw new Error(`Failed to create discovery run: ${error.message}`);
  if (!data?.run_id) throw new Error("Discovery run did not return a run_id.");
  return data.run_id;
}

async function finishDiscoveryRun(runId: string | null, status: "completed" | "failed", notes?: string) {
  if (DRY_RUN || !runId) return;
  const sb = supabaseAdmin();
  const { error } = await sb
    .from("roblox_catalog_discovery_runs")
    .update({
      status,
      finished_at: new Date().toISOString(),
      notes: notes ?? null
    })
    .eq("run_id", runId);
  if (error) throw new Error(`Failed to update discovery run: ${error.message}`);
}

async function run() {
  const subcategories = await resolveSubcategories(CATEGORY);
  if (!subcategories.length) {
    throw new Error(`No subcategories resolved for category ${CATEGORY}.`);
  }

  const sortTypes = resolveSortTypes();
  const keywordSortTypes = resolveKeywordSortTypes();
  const keywordSortSet = new Set(keywordSortTypes.map(normalizeSortType));
  const keywords = resolveKeywords();
  const keywordList = INCLUDE_EMPTY_KEYWORD ? ["", ...keywords] : keywords;
  const runId = await createDiscoveryRun();
  const seenQueryHashes = new Set<string>();

  let totalAssets = 0;
  let totalQueries = 0;
  logInfo(
    `Catalog discovery config: category=${CATEGORY}, subcategories=${subcategories.length}, sortTypes=${sortTypes.length}, keywordSortTypes=${keywordSortTypes.join(
      ","
    )}, keywords=${keywordList.length}, includeEmptyKeyword=${INCLUDE_EMPTY_KEYWORD}, limit=${LIMIT}, dryRun=${DRY_RUN}`
  );

  try {
    for (const subcategory of subcategories) {
      for (const sortType of sortTypes) {
        const keywordEnabled = keywordSortSet.has(normalizeSortType(sortType));
        const sortKeywords = keywordEnabled ? keywordList : [""];
        logInfo(
          `Keyword mode for ${subcategory}/${sortType}: ${keywordEnabled ? "partitioned" : "no-keyword"}`
        );
        for (const keyword of sortKeywords) {
          if (MAX_ASSETS > 0 && totalAssets >= MAX_ASSETS) break;
          const queryHash = buildQueryHash({ category: CATEGORY, subcategory, sortType, keyword, limit: LIMIT });
          if (seenQueryHashes.has(queryHash)) continue;
          seenQueryHashes.add(queryHash);

          totalQueries += 1;
          const label = keyword ? `${subcategory}/${sortType}/${keyword}` : `${subcategory}/${sortType}/(no-keyword)`;
          console.log(`Starting query ${totalQueries}: ${label}`);

          let cursor: string | null = null;
          let page = 0;
          let rateLimitRetries = 0;
          const seenCursors = new Set<string>();

          while (true) {
            if (MAX_PAGES > 0 && page >= MAX_PAGES) break;
            if (MAX_ASSETS > 0 && totalAssets >= MAX_ASSETS) break;

            const pageNumber = page + 1;
            const params: Record<string, string> = {
              category: CATEGORY,
              subcategory,
              sortType,
              limit: String(LIMIT)
            };
            if (keyword) params.keyword = keyword;
            if (cursor) params.cursor = cursor;

            let payload: CatalogSearchResponse;
            try {
              payload = await fetchCatalogPage(params);
            } catch (error) {
              const message = (error as Error).message ?? String(error);
              if (message.includes("429") || message.toLowerCase().includes("too many requests")) {
                if (rateLimitRetries < RATE_LIMIT_RETRY_LIMIT) {
                  rateLimitRetries += 1;
                  console.warn(
                    `Rate limited (${label}, page ${pageNumber}). Cooling down (${rateLimitRetries}/${RATE_LIMIT_RETRY_LIMIT})...`
                  );
                  await sleep(withJitter(RATE_LIMIT_COOLDOWN_MS, RETRY_JITTER_MS));
                  continue;
                }
              }
              console.warn(`Query failed (${label}, page ${pageNumber}): ${message}`);
              break;
            }

            if (payload.errors?.length) {
              const message = payload.errors.map((err) => err.message).filter(Boolean).join("; ");
              if (message.toLowerCase().includes("too many requests")) {
                if (rateLimitRetries < RATE_LIMIT_RETRY_LIMIT) {
                  rateLimitRetries += 1;
                  console.warn(
                    `Rate limited (${label}, page ${pageNumber}). Cooling down (${rateLimitRetries}/${RATE_LIMIT_RETRY_LIMIT})...`
                  );
                  await sleep(withJitter(RATE_LIMIT_COOLDOWN_MS, RETRY_JITTER_MS));
                  continue;
                }
              }
              console.warn(`Query error (${label}): ${message}`);
              break;
            }

            const items = Array.isArray(payload.data) ? payload.data : [];
            logInfo(
              `Fetched ${label} page ${pageNumber}: items=${items.length}, nextCursor=${payload.nextPageCursor ?? "null"}`
            );
            if (items.length && LOG_SAMPLE) {
              logInfo(`Sample item: ${JSON.stringify(pickSampleItem(items[0]))}`);
              if (LOG_SAMPLE_RAW) {
                logDebug(`Sample item raw: ${JSON.stringify(items[0])}`);
              }
            }
            if (!items.length) break;
            page = pageNumber;
            rateLimitRetries = 0;

            const nowIso = new Date().toISOString();
            const rows = buildCatalogRows(items, nowIso, CATEGORY, subcategory);
            logInfo(`Prepared ${rows.length} catalog rows for ${label} page ${pageNumber}.`);
            if (!rows.length) {
              cursor = payload.nextPageCursor ?? null;
              if (!cursor) break;
              continue;
            }

            totalAssets += rows.length;
            await upsertCatalogItems(rows);
            await insertDiscoveryHits(
              rows.map((row) => ({
                run_id: runId ?? "",
                asset_id: row.asset_id,
                query_hash: queryHash,
                category: CATEGORY,
                subcategory,
                keyword: keyword || null,
                sort_type: sortType,
                cursor_page: pageNumber,
                seen_at: nowIso
              }))
            );
            await enqueueRefresh(
              rows.map((row) => row.asset_id),
              nowIso
            );

            cursor = payload.nextPageCursor ?? null;
            if (!cursor) break;
            if (seenCursors.has(cursor)) break;
            seenCursors.add(cursor);

            await sleep(withJitter(REQUEST_DELAY_MS, RETRY_JITTER_MS));
          }

          await sleep(withJitter(QUERY_DELAY_MS, RETRY_JITTER_MS));
        }
      }
    }

    await finishDiscoveryRun(runId, "completed");
    console.log(`Catalog discovery complete. Queries: ${totalQueries}, items: ${totalAssets}`);
  } catch (error) {
    await finishDiscoveryRun(runId, "failed", (error as Error).message);
    throw error;
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
