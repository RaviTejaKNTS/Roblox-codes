import "dotenv/config";

import { supabaseAdmin } from "@/lib/supabase-admin";

const CATALOG_ITEM_DETAILS_BATCH_API = "https://catalog.roblox.com/v1/catalog/items/details";
const THUMBNAILS_API = "https://thumbnails.roblox.com/v1/assets";
const USER_AGENT = "BloxodesCatalogBot/1.0";

const ENRICH_LIMIT = Math.max(1, Math.floor(Number(process.env.ROBLOX_CATALOG_ENRICH_LIMIT ?? "200")));
const ENRICH_MAX_TOTAL = Math.max(0, Math.floor(Number(process.env.ROBLOX_CATALOG_ENRICH_MAX_TOTAL ?? "0")));
const ENRICH_BATCH = Math.max(1, Math.floor(Number(process.env.ROBLOX_CATALOG_ENRICH_BATCH ?? "100")));
const DETAILS_BATCH = Math.max(1, Math.floor(Number(process.env.ROBLOX_CATALOG_DETAILS_BATCH ?? "10")));
const THUMBNAIL_BATCH = Math.max(1, Math.floor(Number(process.env.ROBLOX_CATALOG_THUMBNAIL_BATCH ?? "50")));
const THUMBNAIL_SIZE = process.env.ROBLOX_CATALOG_THUMBNAIL_SIZE ?? "420x420";
const THUMBNAIL_FORMAT = process.env.ROBLOX_CATALOG_THUMBNAIL_FORMAT ?? "Png";
const MAX_RETRIES = Math.max(0, Math.floor(Number(process.env.ROBLOX_CATALOG_ENRICH_MAX_RETRIES ?? "3")));
const REQUEST_MIN_INTERVAL_MS = Math.max(0, Math.floor(Number(process.env.ROBLOX_CATALOG_ENRICH_MIN_REQUEST_MS ?? "1000")));
const REQUEST_MAX_INTERVAL_MS = Math.max(
  REQUEST_MIN_INTERVAL_MS,
  Math.floor(Number(process.env.ROBLOX_CATALOG_ENRICH_MAX_REQUEST_MS ?? "5000"))
);
const BATCH_DELAY_MS = Math.max(0, Math.floor(Number(process.env.ROBLOX_CATALOG_ENRICH_BATCH_DELAY_MS ?? "500")));
const RETRY_BASE_MS = Math.max(100, Math.floor(Number(process.env.ROBLOX_CATALOG_ENRICH_RETRY_BASE_MS ?? "750")));
const RETRY_JITTER_MS = Math.max(0, Math.floor(Number(process.env.ROBLOX_CATALOG_ENRICH_RETRY_JITTER_MS ?? "250")));
const THUMBNAIL_DELAY_MS = Math.max(0, Math.floor(Number(process.env.ROBLOX_CATALOG_THUMBNAIL_DELAY_MS ?? "150")));
const RATE_LIMIT_COOLDOWN_MS = Math.max(
  0,
  Math.floor(Number(process.env.ROBLOX_CATALOG_ENRICH_RATE_LIMIT_COOLDOWN_MS ?? "5000"))
);
const RATE_LIMIT_MAX_COOLDOWN_MS = Math.max(
  RATE_LIMIT_COOLDOWN_MS,
  Math.floor(Number(process.env.ROBLOX_CATALOG_ENRICH_RATE_LIMIT_MAX_COOLDOWN_MS ?? "60000"))
);
const RATE_LIMIT_RETRY_LIMIT = Math.max(
  0,
  Math.floor(Number(process.env.ROBLOX_CATALOG_ENRICH_RATE_LIMIT_RETRY_LIMIT ?? "2"))
);
const RATE_LIMIT_REQUEUE_MINUTES = Math.max(
  1,
  Math.floor(Number(process.env.ROBLOX_CATALOG_ENRICH_RATE_LIMIT_REQUEUE_MINUTES ?? "15"))
);
const CLAIM_MINUTES = Math.max(
  1,
  Math.floor(Number(process.env.ROBLOX_CATALOG_ENRICH_CLAIM_MINUTES ?? "30"))
);
const LOG_LEVEL = (process.env.ROBLOX_CATALOG_ENRICH_LOG_LEVEL ?? "info").toLowerCase();
const MAX_ERROR_LOGS = Math.max(0, Math.floor(Number(process.env.ROBLOX_CATALOG_ENRICH_MAX_ERROR_LOGS ?? "5")));

const SAFE_MODE_STRIKES = Math.max(1, Math.floor(Number(process.env.ROBLOX_CATALOG_SAFE_MODE_STRIKES ?? "3")));
const SAFE_MODE_MIN_REQUEST_MS = Math.max(
  0,
  Math.floor(Number(process.env.ROBLOX_CATALOG_SAFE_MODE_MIN_REQUEST_MS ?? "1500"))
);
const SAFE_MODE_MAX_REQUEST_MS = Math.max(
  SAFE_MODE_MIN_REQUEST_MS,
  Math.floor(Number(process.env.ROBLOX_CATALOG_SAFE_MODE_MAX_REQUEST_MS ?? "5000"))
);
const SAFE_MODE_CONCURRENCY = Math.max(
  1,
  Math.floor(Number(process.env.ROBLOX_CATALOG_SAFE_MODE_CONCURRENCY ?? "1"))
);
const SAFE_MODE_BATCH_LIMIT = Math.max(
  1,
  Math.floor(Number(process.env.ROBLOX_CATALOG_SAFE_MODE_BATCH_LIMIT ?? "50"))
);
const SAFE_MODE_BATCH_DELAY_MS = Math.max(
  0,
  Math.floor(Number(process.env.ROBLOX_CATALOG_SAFE_MODE_BATCH_DELAY_MS ?? "1500"))
);

const REFRESH_HOURS = Math.max(1, Number(process.env.ROBLOX_CATALOG_REFRESH_HOURS ?? "168"));
const RETRY_HOURS = Math.max(1, Number(process.env.ROBLOX_CATALOG_RETRY_HOURS ?? "6"));
const MAX_RETRY_HOURS = Math.max(RETRY_HOURS, Number(process.env.ROBLOX_CATALOG_MAX_RETRY_HOURS ?? "72"));
const DELETE_RETRY_HOURS = Math.max(REFRESH_HOURS, Number(process.env.ROBLOX_CATALOG_DELETE_RETRY_HOURS ?? "720"));

const DRY_RUN = toBoolean(process.env.ROBLOX_CATALOG_DRY_RUN, false);
const ENABLE_METADATA_REFRESH = toBoolean(process.env.ROBLOX_CATALOG_ENABLE_METADATA_REFRESH, false);

type QueueRow = {
  asset_id: number;
  priority: string | null;
  attempts: number | null;
  next_run_at: string | null;
};

type ExistingItemRow = {
  asset_id: number;
  raw_catalog_json: Record<string, unknown> | null;
  rap: number | null;
  rap_sales: number | null;
  price_robux: number | null;
  is_for_sale: boolean | null;
  favorite_count: number | null;
};

type CatalogCreator = {
  Name?: string;
  CreatorType?: string;
  CreatorTargetId?: number;
  HasVerifiedBadge?: boolean;
};

type CatalogItemDetails = {
  id?: number;
  Name?: string;
  name?: string;
  Description?: string;
  description?: string;
  PriceInRobux?: number;
  price?: number;
  priceStatus?: string;
  IsForSale?: boolean;
  isForSale?: boolean;
  IsLimited?: boolean;
  isLimited?: boolean;
  IsLimitedUnique?: boolean;
  isLimitedUnique?: boolean;
  Remaining?: number;
  remaining?: number;
  AssetTypeId?: number;
  assetType?: number;
  ProductId?: number;
  productId?: number;
  Creator?: CatalogCreator;
  creatorName?: string;
  creatorType?: string;
  creatorTargetId?: number;
  creatorHasVerifiedBadge?: boolean;
  lowestPrice?: number;
  lowestResalePrice?: number;
  collectibleItemId?: string | number;
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
  [key: string]: unknown;
};

type ThumbnailEntry = {
  targetId?: number;
  state?: string;
  imageUrl?: string;
  version?: string;
};

type HistoryRow = {
  asset_id: number;
  recorded_at: string;
  rap: number | null;
  sales: number | null;
  price_robux: number | null;
  is_for_sale: boolean | null;
  favorite_count: number | null;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickValue(source: Record<string, unknown> | null | undefined, keys: string[]): unknown {
  if (!source) return null;
  for (const key of keys) {
    if (key in source) return source[key];
  }
  return null;
}

function pickText(source: Record<string, unknown> | null | undefined, keys: string[]): string | null {
  return normalizeText(pickValue(source, keys));
}

function pickNumber(source: Record<string, unknown> | null | undefined, keys: string[]): number | null {
  return normalizeNumber(pickValue(source, keys));
}

function pickBoolean(source: Record<string, unknown> | null | undefined, keys: string[]): boolean | null {
  return normalizeBoolean(pickValue(source, keys));
}

function pickJson(source: Record<string, unknown> | null | undefined, keys: string[]): unknown | null {
  const value = pickValue(source, keys);
  return value === undefined ? null : value;
}

function normalizeIdText(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  return null;
}

function derivePriceStatus(isForSale: boolean | null, fallback: string | null) {
  if (fallback) return fallback;
  if (isForSale === true) return "OnSale";
  if (isForSale === false) return "OffSale";
  return null;
}

function addHours(value: string, hours: number) {
  const date = new Date(value);
  date.setHours(date.getHours() + hours);
  return date.toISOString();
}

function addMinutes(value: string, minutes: number) {
  const date = new Date(value);
  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString();
}

function computeRetryHours(attempts: number) {
  const factor = Math.max(0, attempts - 1);
  return Math.min(MAX_RETRY_HOURS, RETRY_HOURS * Math.pow(2, factor));
}

function withJitter(ms: number, jitterMs: number) {
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  if (!Number.isFinite(jitterMs) || jitterMs <= 0) return ms;
  return ms + Math.floor(Math.random() * jitterMs);
}

let lastRequestAt = 0;
let requestGate: Promise<void> = Promise.resolve();
let rateLimitUntil = 0;
let rateLimitStrikes = 0;
let dynamicMinIntervalMs = REQUEST_MIN_INTERVAL_MS;
let safeMode = false;
let csrfToken: string | null = null;
let metadataRefreshDisabled = !ENABLE_METADATA_REFRESH;

function currentMinInterval() {
  return safeMode ? SAFE_MODE_MIN_REQUEST_MS : REQUEST_MIN_INTERVAL_MS;
}

function currentMaxInterval() {
  return safeMode ? SAFE_MODE_MAX_REQUEST_MS : REQUEST_MAX_INTERVAL_MS;
}

async function throttleRequest() {
  if (currentMinInterval() <= 0 && rateLimitUntil <= Date.now()) return;
  let release: () => void = () => undefined;
  const prev = requestGate;
  requestGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await prev;
  const now = Date.now();
  const rateLimitWait = Math.max(0, rateLimitUntil - now);
  if (rateLimitWait > 0) {
    logDebug(`Rate-limit cooldown active. Sleeping ${rateLimitWait}ms.`);
    await sleep(rateLimitWait);
  }
  const waitMs = Math.max(0, lastRequestAt + dynamicMinIntervalMs - Date.now());
  if (waitMs > 0) {
    await sleep(waitMs);
  }
  lastRequestAt = Date.now();
  release();
}

function enableSafeMode(reason: string) {
  if (safeMode) return;
  safeMode = true;
  dynamicMinIntervalMs = Math.max(dynamicMinIntervalMs, SAFE_MODE_MIN_REQUEST_MS);
  if (SAFE_MODE_MAX_REQUEST_MS > 0) {
    dynamicMinIntervalMs = Math.min(dynamicMinIntervalMs, SAFE_MODE_MAX_REQUEST_MS);
  }
  logInfo(
    `Safe mode enabled (${reason}). minInterval=${dynamicMinIntervalMs}ms, concurrency=${SAFE_MODE_CONCURRENCY}, batchLimit=${SAFE_MODE_BATCH_LIMIT}`
  );
}

function noteRateLimit(retryAfterMs?: number) {
  rateLimitStrikes = Math.min(rateLimitStrikes + 1, 10);
  const exponential = RATE_LIMIT_COOLDOWN_MS * Math.pow(2, rateLimitStrikes - 1);
  const cooldown = Math.min(RATE_LIMIT_MAX_COOLDOWN_MS, Math.max(exponential, retryAfterMs ?? 0));
  rateLimitUntil = Math.max(rateLimitUntil, Date.now() + cooldown);
  dynamicMinIntervalMs = Math.min(
    currentMaxInterval(),
    Math.max(dynamicMinIntervalMs * 2, currentMinInterval())
  );
  if (rateLimitStrikes >= SAFE_MODE_STRIKES) {
    enableSafeMode(`rate-limit strikes=${rateLimitStrikes}`);
  }
  logInfo(`Rate limit hit. Cooling down ${cooldown}ms. Min interval now ${dynamicMinIntervalMs}ms.`);
}

function noteRequestSuccess() {
  if (rateLimitStrikes > 0) {
    rateLimitStrikes -= 1;
  }
  if (dynamicMinIntervalMs > currentMinInterval()) {
    dynamicMinIntervalMs = Math.max(currentMinInterval(), Math.floor(dynamicMinIntervalMs * 0.9));
  }
}

async function sleep(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function postCatalogItemDetailsBatch(assetIds: number[]): Promise<Response> {
  const body = JSON.stringify({
    items: assetIds.map((id) => ({ itemType: "Asset", id }))
  });

  const headers: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/json",
    "user-agent": USER_AGENT
  };

  if (csrfToken) {
    headers["x-csrf-token"] = csrfToken;
  }

  let res = await fetch(CATALOG_ITEM_DETAILS_BATCH_API, {
    method: "POST",
    headers,
    body
  });

  if (res.status === 403) {
    const token = res.headers.get("x-csrf-token");
    if (token) {
      csrfToken = token;
      res = await fetch(CATALOG_ITEM_DETAILS_BATCH_API, {
        method: "POST",
        headers: {
          ...headers,
          "x-csrf-token": token
        },
        body
      });
    }
  }

  return res;
}

async function fetchCatalogItemDetailsBatch(assetIds: number[]): Promise<{
  ok: boolean;
  status: number;
  payload?: CatalogItemDetails[];
  error?: string;
}> {
  if (!assetIds.length) {
    return { ok: true, status: 200, payload: [] };
  }

  let attempt = 0;
  let rateLimitRetries = 0;

  while (true) {
    await throttleRequest();
    const res = await postCatalogItemDetailsBatch(assetIds);

    if (res.ok) {
      const payload = (await res.json().catch(() => null)) as { data?: CatalogItemDetails[] } | null;
      if (!payload) {
        return { ok: false, status: res.status, error: "Empty catalog payload" };
      }
      if (Array.isArray((payload as unknown as { errors?: unknown }).errors)) {
        return { ok: false, status: res.status, error: "Catalog response contained errors" };
      }
      noteRequestSuccess();
      return { ok: true, status: res.status, payload: Array.isArray(payload.data) ? payload.data : [] };
    }

    if (res.status === 404) {
      return { ok: false, status: 404, error: "Catalog asset not found" };
    }

    if (res.status === 429) {
      const retryAfter = res.headers.get("retry-after");
      const retryAfterSeconds = retryAfter ? Number(retryAfter) : NaN;
      const retryAfterMs = Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1000 : undefined;
      noteRateLimit(retryAfterMs);
      if (rateLimitRetries < RATE_LIMIT_RETRY_LIMIT) {
        rateLimitRetries += 1;
        await sleep(withJitter(RATE_LIMIT_COOLDOWN_MS, RETRY_JITTER_MS));
        continue;
      }
    }

    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= MAX_RETRIES) {
      const body = await res.text().catch(() => "");
      return { ok: false, status: res.status, error: body.slice(0, 200) || "Catalog request failed" };
    }

    const retryAfter = res.headers.get("retry-after");
    const retryAfterSeconds = retryAfter ? Number(retryAfter) : NaN;
    const retryAfterMs = Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1000 : 0;
    const backoff = Math.max(RETRY_BASE_MS * Math.pow(2, attempt), retryAfterMs);
    attempt += 1;
    await sleep(withJitter(backoff, RETRY_JITTER_MS));
  }
}

async function fetchThumbnails(assetIds: number[]): Promise<ThumbnailEntry[]> {
  if (!assetIds.length) return [];
  const params = new URLSearchParams({
    assetIds: assetIds.join(","),
    size: THUMBNAIL_SIZE,
    format: THUMBNAIL_FORMAT
  });
  const url = `${THUMBNAILS_API}?${params.toString()}`;
  let attempt = 0;
  let rateLimitRetries = 0;

  while (true) {
    await throttleRequest();
    const res = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": USER_AGENT
      }
    });

    if (res.ok) {
      const payload = (await res.json().catch(() => null)) as { data?: ThumbnailEntry[] } | null;
      if (!payload?.data) return [];
      noteRequestSuccess();
      return payload.data;
    }

    if (res.status === 429) {
      const retryAfter = res.headers.get("retry-after");
      const retryAfterSeconds = retryAfter ? Number(retryAfter) : NaN;
      const retryAfterMs = Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1000 : undefined;
      noteRateLimit(retryAfterMs);
      if (rateLimitRetries < RATE_LIMIT_RETRY_LIMIT) {
        rateLimitRetries += 1;
        await sleep(withJitter(RATE_LIMIT_COOLDOWN_MS, RETRY_JITTER_MS));
        continue;
      }
    }

    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= MAX_RETRIES) {
      const body = await res.text().catch(() => "");
      throw new Error(`Failed to fetch thumbnails (${res.status}): ${body.slice(0, 200)}`);
    }

    const retryAfter = res.headers.get("retry-after");
    const retryAfterSeconds = retryAfter ? Number(retryAfter) : NaN;
    const retryAfterMs = Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1000 : 0;
    const backoff = Math.max(RETRY_BASE_MS * Math.pow(2, attempt), retryAfterMs);
    attempt += 1;
    await sleep(withJitter(backoff, RETRY_JITTER_MS));
  }
}

async function pickQueueItems(limit: number): Promise<QueueRow[]> {
  const sb = supabaseAdmin();
  const nowIso = new Date().toISOString();
  const { data, error } = await sb
    .from("roblox_catalog_refresh_queue")
    .select("asset_id,priority,attempts,next_run_at")
    .lte("next_run_at", nowIso)
    .order("next_run_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to load catalog refresh queue: ${error.message}`);
  }
  return (data ?? []) as QueueRow[];
}

async function claimQueueItems(limit: number): Promise<QueueRow[]> {
  const queue = await pickQueueItems(limit);
  if (!queue.length || DRY_RUN) return queue;

  const sb = supabaseAdmin();
  const nowIso = new Date().toISOString();
  const claimUntilIso = addMinutes(nowIso, CLAIM_MINUTES);
  const assetIds = queue.map((row) => row.asset_id);

  const { error } = await sb
    .from("roblox_catalog_refresh_queue")
    .update({
      last_attempt_at: nowIso,
      next_run_at: claimUntilIso,
      last_error: null
    })
    .in("asset_id", assetIds)
    .lte("next_run_at", nowIso);

  if (error) {
    throw new Error(`Failed to claim catalog refresh queue: ${error.message}`);
  }

  return queue;
}

async function loadExistingItems(assetIds: number[]): Promise<Map<number, ExistingItemRow>> {
  if (!assetIds.length) return new Map();

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("roblox_catalog_items")
    .select("asset_id,raw_catalog_json,rap,rap_sales,price_robux,is_for_sale,favorite_count")
    .in("asset_id", assetIds);

  if (error) {
    throw new Error(`Failed to load existing catalog items: ${error.message}`);
  }

  const map = new Map<number, ExistingItemRow>();
  for (const row of (data ?? []) as ExistingItemRow[]) {
    map.set(row.asset_id, row);
  }
  return map;
}

async function upsertCatalogItems(rows: Record<string, unknown>[]) {
  if (!rows.length || DRY_RUN) return;
  const sb = supabaseAdmin();
  for (const chunk of chunkArray(rows, ENRICH_BATCH)) {
    const { error } = await sb.from("roblox_catalog_items").upsert(chunk, { onConflict: "asset_id" });
    if (error) throw new Error(`Failed to upsert catalog items: ${error.message}`);
  }
}

async function upsertQueue(rows: Record<string, unknown>[]) {
  if (!rows.length || DRY_RUN) return;
  const sb = supabaseAdmin();
  for (const chunk of chunkArray(rows, ENRICH_BATCH)) {
    const { error } = await sb.from("roblox_catalog_refresh_queue").upsert(chunk, { onConflict: "asset_id" });
    if (error) throw new Error(`Failed to update refresh queue: ${error.message}`);
  }
}

async function upsertThumbnails(rows: Record<string, unknown>[]) {
  if (!rows.length || DRY_RUN) return;
  const sb = supabaseAdmin();
  for (const chunk of chunkArray(rows, ENRICH_BATCH)) {
    const { error } = await sb
      .from("roblox_catalog_item_images")
      .upsert(chunk, { onConflict: "asset_id,size,format" });
    if (error) throw new Error(`Failed to upsert catalog thumbnails: ${error.message}`);
  }
}

async function insertHistoryRows(rows: HistoryRow[]) {
  if (!rows.length || DRY_RUN) return;
  const sb = supabaseAdmin();
  for (const chunk of chunkArray(rows, ENRICH_BATCH)) {
    const { error } = await sb.from("roblox_catalog_items_history").insert(chunk);
    if (error) throw new Error(`Failed to insert catalog item history: ${error.message}`);
  }
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function assignDefined(target: Record<string, unknown>, key: string, value: unknown) {
  if (value === null || value === undefined) return;
  target[key] = value;
}

async function run() {
  let totalProcessed = 0;
  let totalUpdated = 0;
  let totalThumbnails = 0;
  let batchIndex = 0;

  while (true) {
    if (ENRICH_MAX_TOTAL > 0 && totalProcessed >= ENRICH_MAX_TOTAL) {
      break;
    }

    const baseLimit = safeMode ? SAFE_MODE_BATCH_LIMIT : ENRICH_LIMIT;
    const batchLimit =
      ENRICH_MAX_TOTAL > 0 ? Math.min(baseLimit, ENRICH_MAX_TOTAL - totalProcessed) : baseLimit;
    const queue = await claimQueueItems(batchLimit);
    if (!queue.length) {
      if (batchIndex === 0) {
        logInfo("No catalog items ready for enrichment.");
      }
      break;
    }

    batchIndex += 1;
    logInfo(
      `Starting enrichment batch ${batchIndex}: ${queue.length} items (processed ${totalProcessed} so far, minInterval=${dynamicMinIntervalMs}ms, mode=${safeMode ? "safe" : "normal"}, detailsBatch=${DETAILS_BATCH}).`
    );
    if (batchIndex === 1 && metadataRefreshDisabled) {
      logInfo("Catalog metadata refresh is disabled. This run will use thumbnails/history/bookkeeping only. Set ROBLOX_CATALOG_ENABLE_METADATA_REFRESH=true to try metadata refresh.");
    }

    const itemUpdates: Record<string, unknown>[] = [];
    const queueUpdates: Record<string, unknown>[] = [];
    const historyRows: HistoryRow[] = [];
    const thumbnailTargets: number[] = [];
    const errorStats = new Map<string, number>();
    let loggedErrors = 0;
    const existingItems = await loadExistingItems(queue.map((row) => row.asset_id));

    for (const detailBatch of chunkArray(queue, safeMode ? Math.min(DETAILS_BATCH, SAFE_MODE_BATCH_LIMIT) : DETAILS_BATCH)) {
      const nowIso = new Date().toISOString();
      let details: Awaited<ReturnType<typeof fetchCatalogItemDetailsBatch>>;

      if (metadataRefreshDisabled) {
        for (const entry of detailBatch) {
          const assetId = entry.asset_id;
          const priority = entry.priority ?? "new";
          const existing = existingItems.get(assetId);

          itemUpdates.push({
            asset_id: assetId,
            last_enriched_at: nowIso,
            is_deleted: false
          });
          historyRows.push({
            asset_id: assetId,
            recorded_at: nowIso,
            rap: existing?.rap ?? null,
            sales: existing?.rap_sales ?? null,
            price_robux: existing?.price_robux ?? null,
            is_for_sale: existing?.is_for_sale ?? null,
            favorite_count: existing?.favorite_count ?? null
          });
          thumbnailTargets.push(assetId);
          queueUpdates.push({
            asset_id: assetId,
            priority,
            attempts: 0,
            last_attempt_at: nowIso,
            last_error: "Metadata refresh disabled for this run due to Roblox rate limits",
            next_run_at: addHours(nowIso, REFRESH_HOURS)
          });
        }
        await sleep(withJitter(BATCH_DELAY_MS, RETRY_JITTER_MS));
        continue;
      }

      try {
        details = await fetchCatalogItemDetailsBatch(detailBatch.map((entry) => entry.asset_id));
      } catch (error) {
        const message = (error as Error).message ?? "Catalog batch fetch failed";
        const key = `fetch_error:${message.slice(0, 80)}`;
        errorStats.set(key, (errorStats.get(key) ?? 0) + 1);
        if (loggedErrors < MAX_ERROR_LOGS) {
          logInfo(`Catalog batch fetch error for ${detailBatch.length} items: ${message}`);
          loggedErrors += 1;
        }
        for (const entry of detailBatch) {
          const attempts = entry.attempts ?? 0;
          const priority = entry.priority ?? "new";
          queueUpdates.push({
            asset_id: entry.asset_id,
            priority,
            attempts: attempts + 1,
            last_attempt_at: nowIso,
            last_error: message,
            next_run_at: addHours(nowIso, computeRetryHours(attempts + 1))
          });
        }
        continue;
      }

      if (!details.ok || !details.payload) {
        const errorMessage = details.error ?? "Catalog batch request failed";
        const errorKey = details.status ? `${details.status}` : "error";
        errorStats.set(errorKey, (errorStats.get(errorKey) ?? 0) + 1);
        if (loggedErrors < MAX_ERROR_LOGS) {
          logInfo(`Catalog batch error for ${detailBatch.length} items (${errorKey}): ${errorMessage}`);
          loggedErrors += 1;
        }

        if (details.status === 429) {
          metadataRefreshDisabled = true;
          logInfo("Catalog metadata refresh disabled for the rest of this run due to immediate rate limiting. Continuing with thumbnails/history only.");
          for (const entry of detailBatch) {
            const assetId = entry.asset_id;
            const priority = entry.priority ?? "new";
            const existing = existingItems.get(assetId);
            itemUpdates.push({
              asset_id: assetId,
              last_enriched_at: nowIso,
              is_deleted: false
            });
            historyRows.push({
              asset_id: assetId,
              recorded_at: nowIso,
              rap: existing?.rap ?? null,
              sales: existing?.rap_sales ?? null,
              price_robux: existing?.price_robux ?? null,
              is_for_sale: existing?.is_for_sale ?? null,
              favorite_count: existing?.favorite_count ?? null
            });
            thumbnailTargets.push(assetId);
            queueUpdates.push({
              asset_id: assetId,
              priority,
              attempts: 0,
              last_attempt_at: nowIso,
              last_error: "Metadata refresh disabled for this run due to Roblox rate limits",
              next_run_at: addHours(nowIso, REFRESH_HOURS)
            });
          }
          continue;
        }

        for (const entry of detailBatch) {
          const attempts = entry.attempts ?? 0;
          const priority = entry.priority ?? "new";
          queueUpdates.push({
            asset_id: entry.asset_id,
            priority,
            attempts: attempts + 1,
            last_attempt_at: nowIso,
            last_error: errorMessage,
            next_run_at:
              details.status === 429
                ? addMinutes(nowIso, RATE_LIMIT_REQUEUE_MINUTES)
                : addHours(nowIso, computeRetryHours(attempts + 1))
          });
        }
        continue;
      }

      const payloadById = new Map<number, CatalogItemDetails>();
      for (const payload of details.payload) {
        const id = normalizeNumber(payload.id);
        if (id) payloadById.set(id, payload);
      }

      for (const entry of detailBatch) {
        const assetId = entry.asset_id;
        const attempts = entry.attempts ?? 0;
        const priority = entry.priority ?? "new";
        const existing = existingItems.get(assetId);
        const catalogData = isRecord(existing?.raw_catalog_json) ? existing.raw_catalog_json : null;
        const payload = payloadById.get(assetId);

        if (payload) {
        const creator = isRecord(payload.Creator) ? payload.Creator : null;
        const priceRobux =
          normalizeNumber(payload.PriceInRobux) ??
          normalizeNumber(payload.price) ??
          pickNumber(catalogData, ["price"]);
        const isForSale =
          normalizeBoolean(payload.IsForSale) ??
          normalizeBoolean(payload.isForSale) ??
          pickBoolean(catalogData, ["isForSale"]) ??
          existing?.is_for_sale ??
          null;
        const favoriteCount =
          normalizeNumber(payload.favoriteCount) ??
          pickNumber(catalogData, ["favoriteCount"]) ??
          existing?.favorite_count ??
          null;
        const priceStatus = derivePriceStatus(
          isForSale,
          normalizeText(payload.priceStatus) ?? pickText(catalogData, ["priceStatus"])
        );
        const update: Record<string, unknown> = {
          asset_id: assetId,
          last_enriched_at: nowIso,
          raw_catalog_json: payload,
          is_deleted: false
        };

        assignDefined(update, "name", normalizeText(payload.Name) ?? normalizeText(payload.name) ?? pickText(catalogData, ["name"]));
        assignDefined(
          update,
          "description",
          normalizeText(payload.Description) ?? normalizeText(payload.description) ?? pickText(catalogData, ["description"])
        );
        assignDefined(update, "price_robux", priceRobux);
        assignDefined(update, "price_status", priceStatus);
        assignDefined(update, "lowest_price_robux", normalizeNumber(payload.lowestPrice) ?? pickNumber(catalogData, ["lowestPrice"]));
        assignDefined(
          update,
          "lowest_resale_price_robux",
          normalizeNumber(payload.lowestResalePrice) ?? pickNumber(catalogData, ["lowestResalePrice"])
        );
        assignDefined(update, "is_for_sale", isForSale);
        assignDefined(
          update,
          "is_limited",
          normalizeBoolean(payload.IsLimited) ?? normalizeBoolean(payload.isLimited) ?? pickBoolean(catalogData, ["isLimited"])
        );
        assignDefined(
          update,
          "is_limited_unique",
          normalizeBoolean(payload.IsLimitedUnique) ??
            normalizeBoolean(payload.isLimitedUnique) ??
            pickBoolean(catalogData, ["isLimitedUnique"])
        );
        assignDefined(
          update,
          "remaining",
          normalizeNumber(payload.Remaining) ?? normalizeNumber(payload.remaining) ?? pickNumber(catalogData, ["remaining"])
        );
        assignDefined(
          update,
          "asset_type_id",
          normalizeNumber(payload.AssetTypeId) ?? normalizeNumber(payload.assetType) ?? pickNumber(catalogData, ["assetType"])
        );
        assignDefined(
          update,
          "product_id",
          normalizeNumber(payload.ProductId) ?? normalizeNumber(payload.productId) ?? pickNumber(catalogData, ["productId"])
        );
        assignDefined(
          update,
          "collectible_item_id",
          normalizeIdText(payload.collectibleItemId) ?? normalizeIdText(pickValue(catalogData, ["collectibleItemId"]))
        );
        assignDefined(update, "favorite_count", favoriteCount);
        assignDefined(update, "has_resellers", normalizeBoolean(payload.hasResellers) ?? pickBoolean(catalogData, ["hasResellers"]));
        assignDefined(update, "total_quantity", normalizeNumber(payload.totalQuantity) ?? pickNumber(catalogData, ["totalQuantity"]));
        assignDefined(
          update,
          "units_available_for_consumption",
          normalizeNumber(payload.unitsAvailableForConsumption) ?? pickNumber(catalogData, ["unitsAvailableForConsumption"])
        );
        assignDefined(
          update,
          "quantity_limit_per_user",
          normalizeNumber(payload.quantityLimitPerUser) ?? pickNumber(catalogData, ["quantityLimitPerUser"])
        );
        assignDefined(update, "sale_location_type", normalizeText(payload.saleLocationType) ?? pickText(catalogData, ["saleLocationType"]));
        assignDefined(update, "off_sale_deadline", normalizeText(payload.offSaleDeadline) ?? pickText(catalogData, ["offSaleDeadline"]));
        assignDefined(update, "item_status", payload.itemStatus ?? pickJson(catalogData, ["itemStatus"]));
        assignDefined(update, "item_restrictions", payload.itemRestrictions ?? pickJson(catalogData, ["itemRestrictions"]));
        assignDefined(update, "bundled_items", payload.bundledItems ?? pickJson(catalogData, ["bundledItems"]));

        if (creator) {
          assignDefined(
            update,
            "creator_id",
            normalizeNumber(creator.CreatorTargetId) ??
              normalizeNumber(payload.creatorTargetId) ??
              pickNumber(catalogData, ["creatorTargetId", "creatorId"])
          );
          assignDefined(
            update,
            "creator_target_id",
            normalizeNumber(creator.CreatorTargetId) ??
              pickNumber(catalogData, ["creatorTargetId"]) ??
              normalizeNumber(payload.creatorTargetId)
          );
          assignDefined(
            update,
            "creator_name",
            normalizeText(creator.Name) ?? normalizeText(payload.creatorName) ?? pickText(catalogData, ["creatorName"])
          );
          assignDefined(
            update,
            "creator_type",
            normalizeText(creator.CreatorType) ?? normalizeText(payload.creatorType) ?? pickText(catalogData, ["creatorType"])
          );
          assignDefined(
            update,
            "creator_has_verified_badge",
            normalizeBoolean(creator.HasVerifiedBadge) ??
              normalizeBoolean(payload.creatorHasVerifiedBadge) ??
              pickBoolean(catalogData, ["creatorHasVerifiedBadge"])
          );
        } else {
          assignDefined(update, "creator_id", normalizeNumber(payload.creatorTargetId) ?? pickNumber(catalogData, ["creatorTargetId", "creatorId"]));
          assignDefined(
            update,
            "creator_target_id",
            normalizeNumber(payload.creatorTargetId) ?? pickNumber(catalogData, ["creatorTargetId", "creatorId"])
          );
          assignDefined(update, "creator_name", normalizeText(payload.creatorName) ?? pickText(catalogData, ["creatorName"]));
          assignDefined(update, "creator_type", normalizeText(payload.creatorType) ?? pickText(catalogData, ["creatorType"]));
          assignDefined(
            update,
            "creator_has_verified_badge",
            normalizeBoolean(payload.creatorHasVerifiedBadge) ?? pickBoolean(catalogData, ["creatorHasVerifiedBadge"])
          );
        }

        itemUpdates.push(update);
        historyRows.push({
          asset_id: assetId,
          recorded_at: nowIso,
          rap: existing?.rap ?? null,
          sales: existing?.rap_sales ?? null,
          price_robux: priceRobux,
          is_for_sale: isForSale,
          favorite_count: favoriteCount
        });
        thumbnailTargets.push(assetId);

        queueUpdates.push({
          asset_id: assetId,
          priority,
          attempts: 0,
          last_attempt_at: nowIso,
          last_error: null,
          next_run_at: addHours(nowIso, REFRESH_HOURS)
        });
          continue;
        }

        const nextAttempts = attempts + 1;
        const errorMessage = "Asset missing from catalog details response";
        errorStats.set("missing", (errorStats.get("missing") ?? 0) + 1);
        if (loggedErrors < MAX_ERROR_LOGS) {
          logInfo(`Catalog details missing for ${assetId}. Will retry later.`);
          loggedErrors += 1;
        }
        queueUpdates.push({
          asset_id: assetId,
          priority,
          attempts: nextAttempts,
          last_attempt_at: nowIso,
          last_error: errorMessage,
          next_run_at: addHours(nowIso, computeRetryHours(nextAttempts))
        });
      }
      await sleep(withJitter(BATCH_DELAY_MS, RETRY_JITTER_MS));
    }

    if (itemUpdates.length) {
      await upsertCatalogItems(itemUpdates);
    }

    if (historyRows.length) {
      await insertHistoryRows(historyRows);
    }

    if (queueUpdates.length) {
      await upsertQueue(queueUpdates);
    }

    if (thumbnailTargets.length) {
      const thumbnailRows: Record<string, unknown>[] = [];
      for (const batch of chunkArray(thumbnailTargets, THUMBNAIL_BATCH)) {
        try {
          const entries = await fetchThumbnails(batch);
          entries.forEach((entry) => {
            const targetId = normalizeNumber(entry.targetId);
            if (!targetId) return;
            thumbnailRows.push({
              asset_id: targetId,
              size: THUMBNAIL_SIZE,
              format: THUMBNAIL_FORMAT,
              image_url: normalizeText(entry.imageUrl),
              state: normalizeText(entry.state),
              version: normalizeText(entry.version),
              last_checked_at: new Date().toISOString()
            });
          });
        } catch (error) {
          const message = (error as Error).message ?? "Thumbnail fetch failed";
          logInfo(`Thumbnail batch failed (${batch.length} items): ${message}`);
        }
        await sleep(withJitter(THUMBNAIL_DELAY_MS, RETRY_JITTER_MS));
      }
      if (thumbnailRows.length) {
        await upsertThumbnails(thumbnailRows);
      }
    }

    totalProcessed += queue.length;
    totalUpdated += itemUpdates.length;
    totalThumbnails += thumbnailTargets.length;

    if (errorStats.size) {
      const summary = Array.from(errorStats.entries())
        .map(([key, count]) => `${key}:${count}`)
        .join(", ");
      logInfo(`Batch ${batchIndex} errors: ${summary}`);
    }

    logInfo(
      `Batch ${batchIndex} complete. Items: ${queue.length}, updates: ${itemUpdates.length}, thumbnails: ${thumbnailTargets.length}.`
    );

    await sleep(withJitter(safeMode ? SAFE_MODE_BATCH_DELAY_MS : BATCH_DELAY_MS, RETRY_JITTER_MS));
  }

  logInfo(
    `Catalog enrichment complete. Processed: ${totalProcessed}, updates: ${totalUpdated}, thumbnails: ${totalThumbnails}`
  );
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
