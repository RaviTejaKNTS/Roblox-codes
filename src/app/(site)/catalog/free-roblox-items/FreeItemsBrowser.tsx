"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PagePagination } from "@/components/PagePagination";
import { RobloxCatalogItemCard } from "@/components/RobloxCatalogItemCard";
import {
  DEFAULT_SORT,
  SORT_OPTIONS,
  buildSearchQueryString,
  normalizeSearchQuery,
  normalizeSortKey,
  type FreeItemsSortKey
} from "@/lib/free-items-search";

type FreeItem = {
  asset_id: number;
  item_type: string;
  name: string;
  description: string | null;
  category: string;
  subcategory: string;
  creator_name: string;
  creator_id: number | null;
  creator_type: string | null;
  favorite_count: number;
  price_robux: number;
  asset_type_id: number | null;
  last_seen_at: string;
  created_at: string;
  roblox_url: string;
  thumbnail_url: string | null;
};

type ApiResponse = {
  ok: boolean;
  items: FreeItem[];
  total: number;
  totalPages: number;
};

type Props = {
  initialItems: FreeItem[];
  initialTotalPages: number;
  currentPage: number;
  basePath: string;
  category?: string;
  subcategory?: string;
};

export function FreeItemsBrowser({
  initialItems,
  initialTotalPages,
  currentPage,
  basePath,
  category,
  subcategory
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [queryInput, setQueryInput] = useState("");
  const [sortInput, setSortInput] = useState<FreeItemsSortKey>(DEFAULT_SORT);
  const [items, setItems] = useState<FreeItem[]>(initialItems);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasFetchedRef = useRef(false);

  const urlQuery = normalizeSearchQuery(searchParams.get("q"));
  const urlSort = normalizeSortKey(searchParams.get("sort"));
  const searchQueryString = buildSearchQueryString({ query: urlQuery, sort: urlSort });
  const hasFilters = urlQuery.length > 0 || urlSort !== DEFAULT_SORT;
  const missingInitialThumbnails = initialItems.some((item) => !item.thumbnail_url);
  const hasInvalidBundleUrls = initialItems.some(
    (item) => item.item_type === "Bundle" && (!item.roblox_url || !item.roblox_url.includes("/bundles/"))
  );

  useEffect(() => {
    setQueryInput(urlQuery);
    setSortInput(urlSort);
  }, [urlQuery, urlSort]);

  useEffect(() => {
    const shouldFetch = hasFetchedRef.current || hasFilters || missingInitialThumbnails || hasInvalidBundleUrls;
    if (!shouldFetch) {
      setItems(initialItems);
      setTotalPages(initialTotalPages);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("page", String(currentPage));
    if (urlQuery) params.set("q", urlQuery);
    if (urlSort !== DEFAULT_SORT) params.set("sort", urlSort);
    if (category) params.set("category", category);
    if (subcategory) params.set("subcategory", subcategory);

    fetch(`/api/roblox-free-items?${params.toString()}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Failed to load results (${res.status})`);
        }
        return (await res.json()) as ApiResponse;
      })
      .then((payload) => {
        if (!payload.ok) {
          throw new Error("Request failed");
        }
        setItems(payload.items ?? []);
        setTotalPages(payload.totalPages ?? 1);
        hasFetchedRef.current = true;
      })
      .catch((err: Error) => {
        if (err.name === "AbortError") return;
        setError("Unable to load free items right now.");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [
    category,
    currentPage,
    hasFilters,
    hasInvalidBundleUrls,
    initialItems,
    initialTotalPages,
    missingInitialThumbnails,
    subcategory,
    urlQuery,
    urlSort
  ]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQuery = normalizeSearchQuery(queryInput);
    const nextSort = sortInput;
    const nextParams = buildSearchQueryString({ query: nextQuery, sort: nextSort });
    router.push(nextParams ? `${basePath}?${nextParams}` : basePath);
  }

  function handleClear() {
    setQueryInput("");
    setSortInput(DEFAULT_SORT);
    router.push(basePath);
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 md:flex-row md:items-end">
        <div className="flex-1 space-y-2">
          <label htmlFor="free-items-search" className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
            Search
          </label>
          <input
            id="free-items-search"
            name="q"
            type="search"
            value={queryInput}
            onChange={(event) => setQueryInput(event.target.value)}
            placeholder="Search item name, creator, or ID"
            className="w-full rounded-lg border-0 bg-surface/60 px-4 py-2 text-sm text-foreground placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>
        <div className="w-full space-y-2 md:w-56">
          <label htmlFor="free-items-sort" className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
            Sort
          </label>
          <select
            id="free-items-sort"
            name="sort"
            value={sortInput}
            onChange={(event) => setSortInput(event.target.value as FreeItemsSortKey)}
            className="w-full rounded-lg border-0 bg-surface/60 px-4 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-accent-dark dark:bg-accent-dark dark:hover:bg-accent"
          >
            Apply
          </button>
          {hasFilters ? (
            <button
              type="button"
              onClick={handleClear}
              className="text-sm font-semibold text-muted transition hover:text-accent"
            >
              Clear
            </button>
          ) : null}
        </div>
      </form>

      {loading ? <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Updating results...</p> : null}
      {error ? <p className="text-sm font-semibold text-rose-400">{error}</p> : null}

      {!items.length ? (
        <div className="rounded-2xl border border-dashed border-border/60 bg-surface/60 p-8 text-center text-muted">
          No free items match those filters right now.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item) => (
            <RobloxCatalogItemCard key={item.asset_id} item={item} />
          ))}
        </div>
      )}

      <PagePagination
        basePath={basePath}
        currentPage={currentPage}
        totalPages={totalPages}
        query={searchQueryString || undefined}
      />
    </div>
  );
}
