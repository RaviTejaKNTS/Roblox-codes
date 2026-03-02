"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatUpdatedLabel } from "@/lib/updated-label";
import { trackEvent } from "@/lib/analytics";

export type SearchItem = {
  id: string;
  title: string;
  subtitle?: string | null;
  url: string;
  type: "codes" | "article" | "checklist" | "list" | "tool" | "catalog" | "event" | "author" | "music";
  updatedAt?: string | null;
  badge?: string | null;
};

type Props = {
  autoFocus?: boolean;
};

const MIN_QUERY_LENGTH = 2;
const SEARCH_LIMIT = 120;
const DEBOUNCE_MS = 250;

export function UnifiedSearch({ autoFocus = false }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchItem[]>([]);
  const [visibleCount, setVisibleCount] = useState(15);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastTrackedQuery = useRef<string | null>(null);

  const trimmedQuery = query.trim();
  const canSearch = trimmedQuery.length >= MIN_QUERY_LENGTH;

  useEffect(() => {
    setVisibleCount(15);
  }, [trimmedQuery]);

  useEffect(() => {
    if (!canSearch) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    setResults([]);
    setError(null);

    let cancelled = false;
    let controller: AbortController | null = null;
    const timeout = setTimeout(async () => {
      try {
        setLoading(true);
        controller = new AbortController();
        const params = new URLSearchParams({
          q: trimmedQuery,
          limit: String(SEARCH_LIMIT)
        });
        const response = await fetch(`/api/search/all?${params.toString()}`, {
          signal: controller.signal
        });
        if (!response.ok) throw new Error(`Request failed: ${response.status}`);
        const payload = (await response.json()) as { items?: SearchItem[] };
        if (!cancelled) {
          setResults(payload.items ?? []);
        }
      } catch (error) {
        if ((error as { name?: string }).name === "AbortError") return;
        if (!cancelled) {
          console.error("Failed to load search results", error);
          setResults([]);
          setError("Search is unavailable right now. Try again in a moment.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      if (controller && !controller.signal.aborted) {
        controller.abort("Unified search request was replaced");
      }
    };
  }, [canSearch, trimmedQuery]);

  useEffect(() => {
    if (!canSearch || loading) return;
    if (lastTrackedQuery.current === trimmedQuery) return;
    lastTrackedQuery.current = trimmedQuery;
    trackEvent("search", {
      search_term: trimmedQuery,
      results_count: results.length,
      content_type: "all"
    });
  }, [canSearch, loading, results.length, trimmedQuery]);

  const limitedResults = results.slice(0, visibleCount);
  const hasMore = results.length > visibleCount;

  const placeholder = "Search articles, codes, checklists, tools, and lists";

  return (
    <div className="space-y-6">
      <div className="relative flex items-center">
        <span className="pointer-events-none absolute left-4 text-muted">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="m21 21-4.35-4.35" />
            <circle cx="11" cy="11" r="6" />
          </svg>
        </span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          aria-label="Search site"
          className="w-full rounded-[var(--radius-lg)] border border-border/60 bg-surface px-5 py-3 pl-12 text-sm text-foreground placeholder:text-muted/60 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
          autoFocus={autoFocus}
        />
      </div>

      {canSearch ? (
        error ? (
          <p className="text-sm text-muted">{error}</p>
        ) : loading && results.length === 0 ? (
          <p className="text-sm text-muted">Searching...</p>
        ) : (
          <p className="text-sm text-muted">
            {results.length > 0 ? (
              <>
                Found {results.length} {results.length === 1 ? "match" : "matches"} for "{trimmedQuery}"
              </>
            ) : (
              <>No results for "{trimmedQuery}". Try a different keyword.</>
            )}
          </p>
        )
      ) : (
        <p className="text-sm text-muted">Start typing to search articles, codes, checklists, quizzes, tools, and lists.</p>
      )}

      {canSearch && loading && results.length === 0 ? (
        <div className="space-y-3">
          <div className="h-10 rounded-[var(--radius-lg)] border border-border/60 bg-surface-muted animate-pulse" />
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-12 rounded-[var(--radius-lg)] border border-border/60 bg-surface-muted animate-pulse" />
            ))}
          </div>
        </div>
      ) : null}

      {canSearch && results.length > 0 ? (
        <>
          <ul className="space-y-3">
            {limitedResults.map((item, index) => {
              const updatedLabel = item.updatedAt ? formatUpdatedLabel(item.updatedAt) : null;
              return (
                <li key={item.id}>
                  <Link
                    href={item.url}
                    className="flex items-center justify-between gap-4 rounded-[var(--radius-lg)] border border-border/60 bg-surface px-4 py-3 text-sm text-foreground transition hover:border-accent hover:text-accent"
                    onClick={() =>
                      trackEvent("search_result_click", {
                        search_term: trimmedQuery,
                        results_count: results.length,
                        content_type: item.type,
                        position: index + 1
                      })
                    }
                  >
                    <div className="flex flex-col gap-1">
                      <span className="font-semibold">{item.title}</span>
                      <span className="text-xs text-muted">
                        {item.subtitle ?? item.type}
                        {item.badge ? ` • ${item.badge}` : ""}
                      </span>
                    </div>
                    {updatedLabel ? <span className="text-xs text-muted whitespace-nowrap">{updatedLabel}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
          {hasMore ? (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setVisibleCount((count) => count + 15)}
                className="w-full rounded-full border border-border/60 bg-surface px-4 py-2 text-sm font-medium text-foreground transition hover:border-accent hover:text-accent"
              >
                Show more results
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
