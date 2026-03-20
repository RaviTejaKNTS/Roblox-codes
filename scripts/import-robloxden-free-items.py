#!/usr/bin/env python3

import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, Iterable, List, Optional, Tuple

SOURCE_URL = "https://robloxden.com/promo-codes/free-items"
USER_AGENT = "BloxodesCatalogBot/1.0"
ASSET_ECONOMY_DETAILS_API = "https://economy.roblox.com/v2/assets/{asset_id}/details"
ASSET_THUMBNAILS_API = "https://thumbnails.roblox.com/v1/assets"
BUNDLE_DETAILS_API = "https://catalog.roblox.com/v1/bundles/{bundle_id}/details"
BUNDLE_THUMBNAILS_API = "https://thumbnails.roblox.com/v1/bundles/thumbnails"
CATALOG_SEARCH_DETAILS_API = "https://catalog.roblox.com/v1/search/items/details"
THUMBNAIL_SIZE = "420x420"
THUMBNAIL_FORMAT = "Png"
THUMBNAIL_BATCH_SIZE = 50
SUPABASE_BATCH_SIZE = 100
SUPABASE_SCAN_BATCH = 1000
SEARCH_MATCH_LIMIT = 30

TOP_LEVEL_CATEGORY_MAP = {
    "Accessories": ("Accessories", "Accessories"),
    "Bodies": ("Body", "Bodies"),
    "Emotes": ("AvatarAnimations", "Emotes"),
    "Faces": ("Body", "Faces"),
    "Gear": ("Accessories", "Gear"),
    "HairStyles": ("Body", "Hairstyles"),
    "Hairstyles": ("Body", "Hairstyles"),
    "Hats": ("Accessories", "Hats"),
    "Heads": ("Body", "Heads"),
    "Pants": ("Clothing", "Pants"),
    "Shirts": ("Clothing", "Shirts"),
}

def load_env(path: str) -> Dict[str, str]:
    env: Dict[str, str] = {}
    with open(path, "r", encoding="utf-8") as handle:
        for raw_line in handle:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            env[key.strip()] = value.strip()
    return env


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def sleep_brief(seconds: float) -> None:
    if seconds > 0:
        time.sleep(seconds)


def normalize_bool(value: Any) -> Optional[bool]:
    if isinstance(value, bool):
        return value
    return None


def normalize_int(value: Any) -> Optional[int]:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        try:
            number = int(stripped)
            return number
        except ValueError:
            return None
    return None


def normalize_text(value: Any) -> Optional[str]:
    if not isinstance(value, str):
        return None
    cleaned = value.strip()
    return cleaned or None


def normalize_match_text(value: Any) -> Optional[str]:
    text = normalize_text(value)
    if not text:
        return None
    return re.sub(r"\s+", " ", text).strip().lower()


def canonical_roblox_url(url: str) -> str:
    match = re.search(r"https://(?:www\.)?roblox\.com/(catalog|bundles)/(\d+)", url)
    if not match:
      raise ValueError(f"Unsupported Roblox URL: {url}")
    kind, numeric_id = match.groups()
    return f"https://www.roblox.com/{kind}/{numeric_id}"


def fetch_text(url: str) -> str:
    request = urllib.request.Request(url, headers={"user-agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read().decode("utf-8", "ignore")


def http_json(
    url: str,
    *,
    method: str = "GET",
    payload: Optional[Dict[str, Any]] = None,
    headers: Optional[Dict[str, str]] = None,
    retry_count: int = 6,
) -> Dict[str, Any]:
    body = None
    request_headers = {
        "accept": "application/json",
        "user-agent": USER_AGENT,
    }
    if headers:
        request_headers.update(headers)
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        request_headers["content-type"] = "application/json"

    for attempt in range(retry_count + 1):
        request = urllib.request.Request(url, data=body, headers=request_headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            status = error.code
            response_body = error.read().decode("utf-8", "ignore")
            if status in (429, 500, 502, 503, 504) and attempt < retry_count:
                retry_after = error.headers.get("retry-after")
                try:
                    wait_seconds = float(retry_after) if retry_after else max(10, (attempt + 1) * 8)
                except ValueError:
                    wait_seconds = max(10, (attempt + 1) * 8)
                sleep_brief(wait_seconds)
                continue
            raise RuntimeError(f"Request failed ({status}) for {url}: {response_body[:240]}")


def supabase_request(
    env: Dict[str, str],
    path: str,
    *,
    method: str = "GET",
    params: Optional[Dict[str, str]] = None,
    payload: Optional[Any] = None,
    prefer: Optional[str] = None,
) -> Any:
    base = env["SUPABASE_URL"].rstrip("/")
    key = env["SUPABASE_SERVICE_ROLE"]
    query = ""
    if params:
        query = "?" + urllib.parse.urlencode(params, doseq=True)

    body = None
    headers = {
        "apikey": key,
        "authorization": f"Bearer {key}",
        "accept": "application/json",
        "content-type": "application/json",
        "user-agent": USER_AGENT,
    }
    if prefer:
        headers["prefer"] = prefer
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")

    request = urllib.request.Request(f"{base}{path}{query}", data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            raw = response.read().decode("utf-8", "ignore")
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        response_body = error.read().decode("utf-8", "ignore")
        raise RuntimeError(f"Supabase request failed ({error.code}) for {path}: {response_body[:500]}")


def chunked(items: Iterable[Any], size: int) -> Iterable[List[Any]]:
    batch: List[Any] = []
    for item in items:
        batch.append(item)
        if len(batch) >= size:
            yield batch
            batch = []
    if batch:
        yield batch


def scrape_entries() -> List[Dict[str, Any]]:
    page_html = fetch_text(SOURCE_URL)
    pattern = re.compile(
        r'<li class="masonry__item item-card section__masonry-item--block"[^>]*data-asset-id="([0-9]+)"[^>]*>'
        r'.*?<a href="([^"]+)"><h2 class="item-card__title">(.*?)</h2></a>'
        r'.*?<li class="item-card__item">([^<]+)</li>'
        r'.*?<a class="btn btn--green btn--uppercase item-card__button" href="(https://[^"]+)"',
        re.S,
    )

    entries: List[Dict[str, Any]] = []
    for representative_asset_id, detail_path, raw_title, source_label, roblox_url in pattern.findall(page_html):
        canonical_url = canonical_roblox_url(roblox_url)
        catalog_match = re.search(r"/catalog/(\d+)$", canonical_url)
        bundle_match = re.search(r"/bundles/(\d+)$", canonical_url)
        entry_kind = "asset" if catalog_match else "bundle"
        external_id = int((catalog_match or bundle_match).group(1))
        top_level_category, subcategory = TOP_LEVEL_CATEGORY_MAP.get(
            source_label.strip(),
            ("Accessories", source_label.strip()),
        )
        entries.append(
            {
                "source_representative_asset_id": int(representative_asset_id),
                "source_detail_path": detail_path,
                "source_label": source_label.strip(),
                "source_title": re.sub(r"\s+", " ", html.unescape(raw_title)).strip(),
                "entry_kind": entry_kind,
                "external_id": external_id,
                "internal_id": external_id if entry_kind == "asset" else -external_id,
                "roblox_url": canonical_url,
                "category": top_level_category,
                "subcategory": subcategory,
            }
        )
    return entries


def fetch_asset_details(asset_ids: List[int]) -> Dict[int, Dict[str, Any]]:
    details_by_id: Dict[int, Dict[str, Any]] = {}
    unique_asset_ids = sorted({asset_id for asset_id in asset_ids if asset_id > 0})
    for asset_id in unique_asset_ids:
        try:
            details_by_id[asset_id] = http_json(
                ASSET_ECONOMY_DETAILS_API.format(asset_id=asset_id),
                retry_count=0,
            )
        except RuntimeError as error:
            print(f"Warning: failed to enrich asset {asset_id}: {error}", file=sys.stderr)
        sleep_brief(0.08)
    return details_by_id


def fetch_bundle_details(bundle_ids: List[int]) -> Dict[int, Dict[str, Any]]:
    bundle_details: Dict[int, Dict[str, Any]] = {}
    for bundle_id in sorted(set(bundle_ids)):
        detail = http_json(BUNDLE_DETAILS_API.format(bundle_id=bundle_id))
        bundle_details[bundle_id] = detail
        sleep_brief(0.1)
    return bundle_details


def fetch_asset_thumbnails(asset_ids: List[int]) -> Dict[int, Dict[str, Any]]:
    thumbnails: Dict[int, Dict[str, Any]] = {}
    unique_ids = sorted({asset_id for asset_id in asset_ids if asset_id > 0})
    for batch in chunked(unique_ids, THUMBNAIL_BATCH_SIZE):
        params = urllib.parse.urlencode(
            {
                "assetIds": ",".join(str(asset_id) for asset_id in batch),
                "size": THUMBNAIL_SIZE,
                "format": THUMBNAIL_FORMAT,
                "isCircular": "false",
            }
        )
        response = http_json(f"{ASSET_THUMBNAILS_API}?{params}")
        for row in response.get("data", []) or []:
            target_id = normalize_int(row.get("targetId"))
            if target_id is not None:
                thumbnails[target_id] = row
        sleep_brief(0.1)
    return thumbnails


def fetch_bundle_thumbnails(bundle_ids: List[int]) -> Dict[int, Dict[str, Any]]:
    thumbnails: Dict[int, Dict[str, Any]] = {}
    unique_ids = sorted(set(bundle_ids))
    for batch in chunked(unique_ids, THUMBNAIL_BATCH_SIZE):
        params = urllib.parse.urlencode(
            {
                "bundleIds": ",".join(str(bundle_id) for bundle_id in batch),
                "size": THUMBNAIL_SIZE,
                "format": THUMBNAIL_FORMAT,
                "isCircular": "false",
            }
        )
        response = http_json(f"{BUNDLE_THUMBNAILS_API}?{params}")
        for row in response.get("data", []) or []:
            target_id = normalize_int(row.get("targetId"))
            if target_id is not None:
                thumbnails[target_id] = row
        sleep_brief(0.1)
    return thumbnails


def fetch_catalog_search_rows(keyword: str, creator_name: Optional[str], cache: Dict[Tuple[str, str], List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    normalized_keyword = normalize_text(keyword)
    if not normalized_keyword:
        return []

    cache_key = (normalized_keyword.lower(), (creator_name or "").strip().lower())
    if cache_key in cache:
        return cache[cache_key]

    attempts: List[Optional[str]] = [normalize_text(creator_name), None]
    seen_creator_tokens = set()

    for creator in attempts:
        creator_token = (creator or "").strip().lower()
        if creator_token in seen_creator_tokens:
            continue
        seen_creator_tokens.add(creator_token)

        params = {
            "Category": "1",
            "Limit": str(SEARCH_MATCH_LIMIT),
            "Keyword": normalized_keyword,
        }
        if creator:
            params["CreatorName"] = creator

        query = urllib.parse.urlencode(params)
        try:
            payload = http_json(f"{CATALOG_SEARCH_DETAILS_API}?{query}", retry_count=3)
        except RuntimeError as error:
            print(
                f"Warning: failed to search Roblox catalog for favorites ({normalized_keyword!r}, creator={creator!r}): {error}",
                file=sys.stderr,
            )
            sleep_brief(0.2)
            continue

        rows = payload.get("data") if isinstance(payload, dict) and isinstance(payload.get("data"), list) else []
        cache[cache_key] = rows
        sleep_brief(0.15)
        return rows

    cache[cache_key] = []
    return []


def derive_price_status(is_for_sale: Optional[bool], explicit: Optional[str]) -> Optional[str]:
    if explicit:
        return explicit
    if is_for_sale is True:
        return "OnSale"
    if is_for_sale is False:
        return "OffSale"
    return None


def build_source_metadata(entry: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "free_item_source": "robloxden",
        "free_item_source_url": SOURCE_URL,
        "roblox_url": entry["roblox_url"],
        "source_detail_path": entry["source_detail_path"],
        "source_label": entry["source_label"],
        "source_title": entry["source_title"],
        "source_representative_asset_id": entry["source_representative_asset_id"],
        "entry_kind": entry["entry_kind"],
        "external_id": entry["external_id"],
    }


def build_asset_row(
    entry: Dict[str, Any],
    detail: Optional[Dict[str, Any]],
    existing_row: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    detail = detail or {}
    existing_row = existing_row or {}
    creator = detail.get("Creator") if isinstance(detail.get("Creator"), dict) else {}
    collectible = detail.get("CollectiblesItemDetails") if isinstance(detail.get("CollectiblesItemDetails"), dict) else {}
    sale_location = detail.get("SaleLocation") if isinstance(detail.get("SaleLocation"), dict) else {}

    creator_target_id = (
        normalize_int(creator.get("CreatorTargetId"))
        or normalize_int(creator.get("Id"))
        or normalize_int(existing_row.get("creator_target_id"))
        or normalize_int(existing_row.get("creator_id"))
    )
    creator_name = (
        normalize_text(creator.get("Name"))
        or normalize_text(existing_row.get("creator_name"))
        or "Unknown"
    )
    is_for_sale = normalize_bool(detail.get("IsForSale"))
    if is_for_sale is None:
        is_for_sale = normalize_bool(existing_row.get("is_for_sale"))
    lowest_resale_price = (
        normalize_int(collectible.get("CollectibleLowestResalePrice"))
        or normalize_int(existing_row.get("lowest_resale_price_robux"))
        or 0
    )
    favorite_count = normalize_int(existing_row.get("favorite_count")) or 0
    sale_location_type = normalize_text(existing_row.get("sale_location_type"))
    sale_location_type_id = normalize_int(sale_location.get("SaleLocationType"))
    if not sale_location_type and sale_location_type_id is not None:
        sale_location_type = str(sale_location_type_id)

    return {
        "asset_id": entry["internal_id"],
        "item_type": "Asset",
        "asset_type_id": normalize_int(detail.get("AssetTypeId")) or normalize_int(existing_row.get("asset_type_id")),
        "category": entry["category"],
        "subcategory": entry["subcategory"],
        "name": normalize_text(detail.get("Name")) or normalize_text(existing_row.get("name")) or entry["source_title"],
        "description": normalize_text(detail.get("Description")) or normalize_text(existing_row.get("description")),
        "price_robux": normalize_int(detail.get("PriceInRobux")) or normalize_int(existing_row.get("price_robux")) or 0,
        "price_status": derive_price_status(is_for_sale, normalize_text(existing_row.get("price_status"))),
        "lowest_price_robux": normalize_int(detail.get("LowestPrice")) or normalize_int(existing_row.get("lowest_price_robux")) or 0,
        "lowest_resale_price_robux": lowest_resale_price,
        "is_for_sale": is_for_sale if is_for_sale is not None else True,
        "is_limited": normalize_bool(detail.get("IsLimited")) or normalize_bool(collectible.get("IsLimited")) or normalize_bool(existing_row.get("is_limited")) or False,
        "is_limited_unique": normalize_bool(detail.get("IsLimitedUnique")) or normalize_bool(existing_row.get("is_limited_unique")) or False,
        "remaining": normalize_int(detail.get("Remaining")) or normalize_int(existing_row.get("remaining")),
        "creator_id": creator_target_id,
        "creator_target_id": creator_target_id,
        "creator_name": creator_name,
        "creator_type": normalize_text(creator.get("CreatorType")) or normalize_text(existing_row.get("creator_type")),
        "creator_has_verified_badge": normalize_bool(creator.get("HasVerifiedBadge")) or normalize_bool(existing_row.get("creator_has_verified_badge")) or False,
        "product_id": normalize_int(detail.get("ProductId")) or normalize_int(existing_row.get("product_id")),
        "collectible_item_id": normalize_int(detail.get("CollectibleItemId")) or normalize_int(existing_row.get("collectible_item_id")),
        "favorite_count": favorite_count,
        "has_resellers": lowest_resale_price > 0 or normalize_bool(existing_row.get("has_resellers")) or False,
        "total_quantity": normalize_int(collectible.get("TotalQuantity")) or normalize_int(existing_row.get("total_quantity")),
        "units_available_for_consumption": normalize_int(existing_row.get("units_available_for_consumption")),
        "quantity_limit_per_user": normalize_int(collectible.get("CollectibleQuantityLimitPerUser")) or normalize_int(existing_row.get("quantity_limit_per_user")),
        "sale_location_type": sale_location_type,
        "off_sale_deadline": normalize_text(existing_row.get("off_sale_deadline")),
        "item_status": existing_row.get("item_status"),
        "item_restrictions": existing_row.get("item_restrictions"),
        "bundled_items": existing_row.get("bundled_items"),
        "last_seen_at": now_iso(),
        "last_enriched_at": now_iso(),
        "is_deleted": False,
        "raw_catalog_json": detail,
        "raw_economy_json": build_source_metadata(entry),
    }


def build_bundle_row(
    entry: Dict[str, Any],
    detail: Optional[Dict[str, Any]],
    representative_asset_row: Optional[Dict[str, Any]],
    existing_bundle_row: Optional[Dict[str, Any]],
    child_asset_rows: Dict[int, Dict[str, Any]],
) -> Dict[str, Any]:
    detail = detail or {}
    representative_asset_row = representative_asset_row or {}
    existing_bundle_row = existing_bundle_row or {}
    creator = detail.get("creator") if isinstance(detail.get("creator"), dict) else {}
    product = detail.get("product") if isinstance(detail.get("product"), dict) else {}
    collectible = detail.get("collectibleItemDetail") if isinstance(detail.get("collectibleItemDetail"), dict) else {}
    sale_location = collectible.get("saleLocation") if isinstance(collectible.get("saleLocation"), dict) else {}

    creator_id = normalize_int(creator.get("id"))
    creator_name = normalize_text(creator.get("name")) or "Unknown"
    child_favorites: List[int] = []
    for item in detail.get("items") or []:
        if not isinstance(item, dict):
            continue
        if normalize_text(item.get("type")) != "Asset":
            continue
        child_asset_id = normalize_int(item.get("id"))
        if child_asset_id is None:
            continue
        child_row = child_asset_rows.get(child_asset_id) or {}
        child_favorite = normalize_int(child_row.get("favorite_count"))
        if child_favorite and child_favorite > 0:
            child_favorites.append(child_favorite)

    favorite_count = max(
        [
            normalize_int(existing_bundle_row.get("favorite_count")) or 0,
            normalize_int(representative_asset_row.get("favorite_count")) or 0,
            *child_favorites,
        ],
        default=0,
    )
    price_robux = normalize_int(product.get("priceInRobux")) or normalize_int(collectible.get("price")) or 0
    is_for_sale = normalize_bool(product.get("isForSale"))
    sale_status = normalize_text(collectible.get("saleStatus"))
    collectible_item_type = normalize_text(collectible.get("collectibleItemType")) or ""

    source_metadata = build_source_metadata(entry)
    source_metadata["bundle_id"] = entry["external_id"]

    return {
        "asset_id": entry["internal_id"],
        "item_type": "Bundle",
        "asset_type_id": None,
        "category": entry["category"],
        "subcategory": entry["subcategory"],
        "name": normalize_text(detail.get("name")) or entry["source_title"],
        "description": normalize_text(detail.get("description")),
        "price_robux": price_robux,
        "price_status": derive_price_status(is_for_sale, sale_status),
        "lowest_price_robux": normalize_int(collectible.get("lowestPrice")) or price_robux,
        "lowest_resale_price_robux": normalize_int(collectible.get("lowestResalePrice")) or 0,
        "is_for_sale": is_for_sale if is_for_sale is not None else True,
        "is_limited": collectible_item_type not in ("", "NonLimited"),
        "is_limited_unique": False,
        "remaining": None,
        "creator_id": creator_id,
        "creator_target_id": creator_id,
        "creator_name": creator_name,
        "creator_type": normalize_text(creator.get("type")),
        "creator_has_verified_badge": normalize_bool(creator.get("hasVerifiedBadge")) or False,
        "product_id": normalize_int(product.get("id")),
        "collectible_item_id": normalize_int(collectible.get("collectibleItemId")),
        "favorite_count": favorite_count,
        "has_resellers": normalize_bool(collectible.get("hasResellers")) or False,
        "total_quantity": normalize_int(collectible.get("totalQuantity")),
        "units_available_for_consumption": normalize_int(collectible.get("unitsAvailable")),
        "quantity_limit_per_user": normalize_int(collectible.get("quantityLimitPerUser")),
        "sale_location_type": normalize_text(sale_location.get("saleLocationType")),
        "off_sale_deadline": normalize_text(collectible.get("offSaleDeadline")),
        "item_status": None,
        "item_restrictions": detail.get("itemRestrictions"),
        "bundled_items": detail.get("items"),
        "last_seen_at": now_iso(),
        "last_enriched_at": now_iso(),
        "is_deleted": False,
        "raw_catalog_json": detail,
        "raw_economy_json": source_metadata,
    }


def backfill_missing_favorites(rows: List[Dict[str, Any]]) -> int:
    cache: Dict[Tuple[str, str], List[Dict[str, Any]]] = {}
    updated = 0

    for row in rows:
        current_favorite_count = normalize_int(row.get("favorite_count")) or 0
        if current_favorite_count > 0:
            continue

        source_meta = row.get("raw_economy_json") if isinstance(row.get("raw_economy_json"), dict) else {}
        external_id = normalize_int(source_meta.get("external_id")) or abs(normalize_int(row.get("asset_id")) or 0)
        expected_type = normalize_match_text(row.get("item_type"))
        creator_name = normalize_text(row.get("creator_name"))

        keyword_candidates: List[str] = []
        for value in (row.get("name"), source_meta.get("source_title")):
            text = normalize_text(value)
            if text and text not in keyword_candidates:
                keyword_candidates.append(text)

        matched_favorite: Optional[int] = None

        for keyword in keyword_candidates:
            results = fetch_catalog_search_rows(keyword, creator_name, cache)
            for candidate in results:
                candidate_id = normalize_int(candidate.get("id"))
                candidate_type = normalize_match_text(candidate.get("itemType"))
                if candidate_id != external_id:
                    continue
                if expected_type == "bundle" and candidate_type != "bundle":
                    continue
                if expected_type == "asset" and candidate_type != "asset":
                    continue
                matched_favorite = normalize_int(candidate.get("favoriteCount"))
                if matched_favorite is not None:
                    break
            if matched_favorite is not None:
                break

        if matched_favorite is None or matched_favorite <= 0:
            continue

        row["favorite_count"] = matched_favorite
        raw_catalog_json = row.get("raw_catalog_json")
        if isinstance(raw_catalog_json, dict):
            next_catalog_json = dict(raw_catalog_json)
            next_catalog_json["favoriteCount"] = matched_favorite
            row["raw_catalog_json"] = next_catalog_json
        updated += 1

    return updated


def build_thumbnail_row(internal_id: int, thumbnail: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not thumbnail:
        return None
    image_url = normalize_text(thumbnail.get("imageUrl"))
    if not image_url:
        return None
    return {
        "asset_id": internal_id,
        "size": THUMBNAIL_SIZE,
        "format": THUMBNAIL_FORMAT,
        "image_url": image_url,
        "state": normalize_text(thumbnail.get("state")) or "Completed",
        "version": normalize_text(thumbnail.get("version")),
        "last_checked_at": now_iso(),
    }


def fetch_existing_source_rows(env: Dict[str, str]) -> Dict[int, Dict[str, Any]]:
    offset = 0
    rows_by_id: Dict[int, Dict[str, Any]] = {}
    while True:
        params = {
            "select": "asset_id,raw_economy_json,is_deleted",
            "order": "asset_id.asc",
            "limit": str(SUPABASE_SCAN_BATCH),
            "offset": str(offset),
        }
        batch = supabase_request(env, "/rest/v1/roblox_catalog_items", params=params)
        if not batch:
            break
        for row in batch:
            raw_meta = row.get("raw_economy_json")
            if isinstance(raw_meta, dict) and raw_meta.get("free_item_source") == "robloxden":
                asset_id = normalize_int(row.get("asset_id"))
                if asset_id is not None:
                    rows_by_id[asset_id] = row
        if len(batch) < SUPABASE_SCAN_BATCH:
            break
        offset += SUPABASE_SCAN_BATCH
    return rows_by_id


def fetch_existing_asset_rows(env: Dict[str, str], asset_ids: List[int]) -> Dict[int, Dict[str, Any]]:
    rows_by_id: Dict[int, Dict[str, Any]] = {}
    unique_ids = sorted({asset_id for asset_id in asset_ids if asset_id > 0})
    for batch in chunked(unique_ids, SUPABASE_BATCH_SIZE):
        params = {
            "select": ",".join(
                [
                    "asset_id",
                    "asset_type_id",
                    "name",
                    "description",
                    "price_robux",
                    "price_status",
                    "lowest_price_robux",
                    "lowest_resale_price_robux",
                    "is_for_sale",
                    "is_limited",
                    "is_limited_unique",
                    "remaining",
                    "creator_id",
                    "creator_target_id",
                    "creator_name",
                    "creator_type",
                    "creator_has_verified_badge",
                    "product_id",
                    "collectible_item_id",
                    "favorite_count",
                    "has_resellers",
                    "total_quantity",
                    "units_available_for_consumption",
                    "quantity_limit_per_user",
                    "sale_location_type",
                    "off_sale_deadline",
                    "item_status",
                    "item_restrictions",
                    "bundled_items",
                ]
            ),
            "asset_id": f"in.({','.join(str(asset_id) for asset_id in batch)})",
        }
        batch_rows = supabase_request(env, "/rest/v1/roblox_catalog_items", params=params) or []
        for row in batch_rows:
            asset_id = normalize_int(row.get("asset_id"))
            if asset_id is not None:
                rows_by_id[asset_id] = row
    return rows_by_id


def upsert_rows(env: Dict[str, str], table_path: str, rows: List[Dict[str, Any]], conflict: str) -> None:
    for batch in chunked(rows, SUPABASE_BATCH_SIZE):
        supabase_request(
            env,
            table_path,
            method="POST",
            params={"on_conflict": conflict},
            payload=batch,
            prefer="resolution=merge-duplicates",
        )


def soft_delete_rows(env: Dict[str, str], asset_ids: List[int]) -> None:
    if not asset_ids:
        return
    for batch in chunked(asset_ids, SUPABASE_BATCH_SIZE):
        params = {
            "asset_id": f"in.({','.join(str(asset_id) for asset_id in batch)})",
        }
        payload = {
            "is_deleted": True,
            "last_seen_at": now_iso(),
        }
        supabase_request(env, "/rest/v1/roblox_catalog_items", method="PATCH", params=params, payload=payload)


def print_summary(rows: List[Dict[str, Any]], stale_count: int) -> None:
    counts: Dict[str, int] = {}
    kinds: Dict[str, int] = {}
    for row in rows:
        category = row["category"]
        counts[category] = counts.get(category, 0) + 1
        item_type = row["item_type"]
        kinds[item_type] = kinds.get(item_type, 0) + 1

    print(f"Imported/updated {len(rows)} RobloxDen free-item rows.")
    print(f"Soft-deleted {stale_count} stale RobloxDen rows.")
    print("Category breakdown:")
    for category, count in sorted(counts.items(), key=lambda pair: (-pair[1], pair[0])):
        print(f"  {category}: {count}")
    print("Type breakdown:")
    for kind, count in sorted(kinds.items(), key=lambda pair: (-pair[1], pair[0])):
        print(f"  {kind}: {count}")


def main() -> int:
    env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
    env = load_env(os.path.abspath(env_path))
    if "SUPABASE_URL" not in env or "SUPABASE_SERVICE_ROLE" not in env:
        print("Missing Supabase credentials in .env", file=sys.stderr)
        return 1

    entries = scrape_entries()
    if not entries:
        print("No RobloxDen entries found.", file=sys.stderr)
        return 1

    representative_asset_ids = [entry["source_representative_asset_id"] for entry in entries]
    asset_entry_ids = [entry["external_id"] for entry in entries if entry["entry_kind"] == "asset"]
    bundle_ids = [entry["external_id"] for entry in entries if entry["entry_kind"] == "bundle"]

    existing_asset_rows = fetch_existing_asset_rows(env, sorted(set(asset_entry_ids + representative_asset_ids)))
    missing_asset_entry_ids = sorted({asset_id for asset_id in asset_entry_ids if asset_id not in existing_asset_rows})
    asset_details = fetch_asset_details(missing_asset_entry_ids)
    bundle_details = fetch_bundle_details(bundle_ids)
    bundle_child_asset_ids: List[int] = []
    for detail in bundle_details.values():
        items = detail.get("items") if isinstance(detail, dict) else None
        if not isinstance(items, list):
            continue
        for item in items:
            if not isinstance(item, dict):
                continue
            if normalize_text(item.get("type")) != "Asset":
                continue
            asset_id = normalize_int(item.get("id"))
            if asset_id is not None:
                bundle_child_asset_ids.append(asset_id)
    if bundle_child_asset_ids:
        existing_asset_rows.update(fetch_existing_asset_rows(env, sorted(set(bundle_child_asset_ids))))
    asset_thumbnails = fetch_asset_thumbnails(asset_entry_ids)
    bundle_thumbnails = fetch_bundle_thumbnails(bundle_ids)
    existing_source_rows = fetch_existing_source_rows(env)

    rows: List[Dict[str, Any]] = []
    thumbnails: List[Dict[str, Any]] = []

    for entry in entries:
        if entry["entry_kind"] == "asset":
            detail = asset_details.get(entry["external_id"])
            existing_row = existing_asset_rows.get(entry["external_id"])
            row = build_asset_row(entry, detail, existing_row)
            thumbnail = build_thumbnail_row(entry["internal_id"], asset_thumbnails.get(entry["external_id"]))
        else:
            detail = bundle_details.get(entry["external_id"])
            representative_detail = existing_asset_rows.get(entry["source_representative_asset_id"])
            existing_bundle_row = existing_source_rows.get(entry["internal_id"])
            row = build_bundle_row(entry, detail, representative_detail, existing_bundle_row, existing_asset_rows)
            thumbnail = build_thumbnail_row(entry["internal_id"], bundle_thumbnails.get(entry["external_id"]))

        rows.append(row)
        if thumbnail:
            thumbnails.append(thumbnail)

    favorite_backfills = backfill_missing_favorites(rows)

    imported_ids = {row["asset_id"] for row in rows}
    stale_ids = sorted(set(existing_source_rows.keys()) - imported_ids)

    upsert_rows(env, "/rest/v1/roblox_catalog_items", rows, "asset_id")
    if thumbnails:
        upsert_rows(env, "/rest/v1/roblox_catalog_item_images", thumbnails, "asset_id,size,format")
    soft_delete_rows(env, stale_ids)

    if favorite_backfills:
        print(f"Backfilled favorites for {favorite_backfills} items via Roblox search.")
    print_summary(rows, len(stale_ids))
    return 0


if __name__ == "__main__":
    sys.exit(main())
