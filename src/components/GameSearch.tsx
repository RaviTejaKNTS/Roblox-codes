"use client";

import { useMemo, useState } from "react";
import type { GameWithCounts } from "@/lib/db";
import { GameCard } from "@/components/GameCard";

type GameSearchProps = {
  games: GameWithCounts[];
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(value: string): string {
  return normalize(value).replace(/\s+/g, "");
}

function sequentialMatchScore(base: string, query: string): number {
  let score = 0;
  let cursor = 0;

  for (const char of query) {
    const idx = base.indexOf(char, cursor);
    if (idx === -1) return 0;
    // reward dense matches more than sparse ones
    score += Math.max(4 - (idx - cursor), 1);
    cursor = idx + 1;
  }

  return score;
}

function scoreGame(game: GameWithCounts, query: string): number {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return 0;

  const name = normalize(game.name);
  const slug = normalize(game.slug);
  const compactName = compact(game.name);
  const compactQuery = compact(query);
  const tokens = normalizedQuery.split(" ");

  let score = 0;

  if (name === normalizedQuery) score += 200;
  if (slug === normalizedQuery) score += 160;

  if (name.startsWith(normalizedQuery)) score += 120;
  if (slug.startsWith(normalizedQuery)) score += 100;

  if (name.includes(normalizedQuery)) score += 80;
  if (slug.includes(normalizedQuery)) score += 60;

  const initials = game.name
    .split(/\s+/)
    .map((part) => part[0]?.toLowerCase() ?? "")
    .join("");
  if (initials && initials.startsWith(compactQuery)) score += 40;

  const sequentialScore = sequentialMatchScore(compactName, compactQuery);
  if (sequentialScore) {
    score += 30 + sequentialScore;
  }

  let tokenMatches = 0;
  for (const token of tokens) {
    if (token && name.includes(token)) {
      tokenMatches += 1;
    }
  }
  if (tokenMatches) {
    score += tokenMatches * 15 + (tokenMatches === tokens.length ? 20 : 0);
  }

  if (game.active_count > 0) {
    score += 5;
  }

  return score;
}

export function GameSearch({ games }: GameSearchProps) {
  const [query, setQuery] = useState("");

  const { results, normalizedQuery } = useMemo(() => {
    const trimmedQuery = query.trim();
    const normalized = normalize(trimmedQuery);

    if (!normalized) {
      return { results: games, normalizedQuery: "" };
    }

    const scored = games
      .map((game) => ({ game, score: scoreGame(game, trimmedQuery) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.game.name.localeCompare(b.game.name);
      });

    return { results: scored.map(({ game }) => game), normalizedQuery: trimmedQuery };
  }, [games, query]);

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
          placeholder="Search Roblox games (Blox Fruits, King Legacy, Doors...)"
          aria-label="Search games"
          className="w-full rounded-[var(--radius-lg)] border border-border/60 bg-surface px-5 py-3 pl-12 text-sm text-foreground placeholder:text-muted/60 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
      </div>

      {normalizedQuery ? (
        <p className="text-sm text-muted">
          {results.length > 0 ? (
            <>
              Found {results.length} {results.length === 1 ? "match" : "matches"} for "{normalizedQuery}"
            </>
          ) : (
            <>No games match "{normalizedQuery}". Try a different name or keyword.</>
          )}
        </p>
      ) : (
        <p className="text-sm text-muted">
          Browse curated Roblox titles or search by name to jump straight to rewards.
        </p>
      )}

      {results.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {results.map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
      ) : (
        <div className="rounded-[var(--radius-lg)] border border-border/60 bg-surface-muted p-6 text-center text-sm text-muted">
          We couldn&rsquo;t find any games for that search. Try popular keywords like &ldquo;Blox&rdquo; or &ldquo;Tycoon&rdquo;.
        </div>
      )}
    </div>
  );
}
