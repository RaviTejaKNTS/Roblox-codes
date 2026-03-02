import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type SearchItemType =
  | "codes"
  | "article"
  | "checklist"
  | "quiz"
  | "list"
  | "tool"
  | "catalog"
  | "event"
  | "author"
  | "music";

type SearchRow = {
  entity_type: string;
  entity_id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  url: string;
  updated_at: string | null;
  active_code_count: number | null;
};

type SearchItem = {
  id: string;
  title: string;
  subtitle: string | null;
  url: string;
  type: SearchItemType;
  updatedAt: string | null;
  badge: string | null;
};

const TYPE_MAP: Record<string, SearchItemType> = {
  code: "codes",
  article: "article",
  checklist: "checklist",
  quiz: "quiz",
  list: "list",
  tool: "tool",
  catalog: "catalog",
  event: "event",
  author: "author",
  music_hub: "music",
  music_genre: "music",
  music_artist: "music"
};

const DEFAULT_LIMIT = 120;
const MAX_LIMIT = 200;
const MIN_QUERY_LENGTH = 2;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeQuery(value: string | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

async function searchSiteFallback(query: string, limit: number): Promise<SearchRow[]> {
  const sb = supabaseAdmin();
  const pattern = `%${escapeLike(query)}%`;
  const { data, error } = await sb
    .from("search_index")
    .select("entity_type,entity_id,slug,title,subtitle,url,updated_at")
    .eq("is_published", true)
    .ilike("search_text", pattern)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) throw error;

  return ((data ?? []) as Omit<SearchRow, "active_code_count">[]).map((row) => ({
    ...row,
    active_code_count: null
  }));
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawQuery = normalizeQuery(searchParams.get("q"));
    const requestedLimit = Number.parseInt(searchParams.get("limit") ?? "", 10);
    const safeLimit = clamp(Number.isFinite(requestedLimit) ? requestedLimit : DEFAULT_LIMIT, 1, MAX_LIMIT);

    if (!rawQuery || rawQuery.length < MIN_QUERY_LENGTH) {
      return NextResponse.json({ items: [] });
    }

    const sb = supabaseAdmin();
    const { data, error } = await sb.rpc("search_site", {
      p_query: rawQuery,
      p_limit: safeLimit,
      p_offset: 0
    });

    const rows = error ? await searchSiteFallback(rawQuery, safeLimit) : ((data ?? []) as SearchRow[]);
    if (error) {
      console.warn("search_site RPC failed, using search_index fallback", error);
    }

    const items: SearchItem[] = rows.map((row) => {
      const type = TYPE_MAP[row.entity_type] ?? "article";
      const badge = row.entity_type === "code" && row.active_code_count != null ? `${row.active_code_count} active` : null;
      return {
        id: `${row.entity_type}-${row.entity_id}`,
        title: row.title,
        subtitle: row.subtitle ?? null,
        url: row.url,
        type,
        updatedAt: row.updated_at ?? null,
        badge
      };
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Failed to load search data", error);
    return NextResponse.json({ error: "Failed to load search data" }, { status: 500 });
  }
}
