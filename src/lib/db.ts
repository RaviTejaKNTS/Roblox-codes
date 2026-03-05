import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { DEFAULT_AUTHOR_ID } from "./constants";

export type Author = {
  id: string;
  name: string;
  slug: string;
  gravatar_email: string | null;
  avatar_url: string | null;
  bio_md: string | null;
  twitter: string | null;
  youtube: string | null;
  website: string | null;
  facebook: string | null;
  linkedin: string | null;
  instagram: string | null;
  roblox: string | null;
  discord: string | null;
  created_at: string;
  updated_at: string;
};

export type Game = {
  id: string;
  name: string;
  slug: string;
  author_id: string | null;
  source_url: string | null;
  source_url_2: string | null;
  source_url_3: string | null;
  roblox_link?: string | null;
  community_link?: string | null;
  discord_link?: string | null;
  twitter_link?: string | null;
  youtube_link?: string | null;
  expired_codes: string[] | null;
  cover_image: string | null;
  seo_title: string | null;
  seo_description: string | null;
  intro_md: string | null;
  redeem_md: string | null;
  find_codes_md: string | null;
  troubleshoot_md: string | null;
  rewards_md: string | null;
  about_game_md: string | null;
  description_md: string | null;
  universe_id: number | null;
  interlinking_ai_copy_md: string | null;
  is_published: boolean;
  published_at: string | null;
  re_rewritten_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type GameWithAuthor = Game & {
  author: Author | null;
};

export type RobloxUniverseInfo = {
  universe_id: number;
  name: string | null;
  display_name: string | null;
  creator_name: string | null;
  creator_id: number | null;
  creator_type: string | null;
  social_links: Record<string, unknown> | null;
  created_at_api?: string | null;
};

export type Article = {
  id: string;
  title: string;
  seo_title?: string | null;
  slug: string;
  content_md: string;
  cover_image: string | null;
  author_id: string | null;
  universe_id: number | null;
  is_published: boolean;
  published_at: string;
  created_at: string;
  updated_at: string;
  word_count: number | null;
  meta_description: string | null;
  sources: string[];
  tags: string[];
};

export type UniverseSummary = {
  universe_id: number;
  slug: string | null;
  display_name: string | null;
  name: string | null;
  icon_url?: string | null;
  genre_l1?: string | null;
  genre_l2?: string | null;
};

export type ArticleWithRelations = Article & {
  author: Author | null;
  universe: UniverseSummary | null;
};

function normalizePositivePage(page: number): number {
  if (!Number.isFinite(page) || page < 1) return 1;
  const floored = Math.floor(page);
  return Number.isSafeInteger(floored) ? floored : 1;
}

function isOutOfRangePaginationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const candidate = error as {
    code?: unknown;
    status?: unknown;
    message?: unknown;
    details?: unknown;
    hint?: unknown;
  };
  const code = typeof candidate.code === "string" ? candidate.code : "";
  if (code === "PGRST103") return true;

  const status =
    typeof candidate.status === "number"
      ? candidate.status
      : typeof candidate.status === "string"
      ? Number(candidate.status)
      : Number.NaN;
  if (status === 416) return true;

  const message = [candidate.message, candidate.details, candidate.hint]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  return message.includes("range not satisfiable") || (message.includes("invalid") && message.includes("range"));
}

function isOutOfRangePaginationFailure(status: unknown, error: unknown): boolean {
  if (status === 416 || status === "416") return true;
  return isOutOfRangePaginationError(error);
}

const ARTICLE_INDEX_FIELDS =
  `id,title,slug,cover_image,meta_description,published_at,created_at,updated_at,is_published,` +
  `author,universe`;

export type ListUniverseDetails = {
  universe_id: number;
  root_place_id: number | null;
  name: string;
  display_name: string | null;
  slug: string | null;
  icon_url: string | null;
  playing: number | null;
  visits: number | null;
  favorites: number | null;
  likes: number | null;
  dislikes: number | null;
  age_rating: string | null;
  desktop_enabled: boolean | null;
  mobile_enabled: boolean | null;
  tablet_enabled: boolean | null;
  console_enabled: boolean | null;
  vr_enabled: boolean | null;
  updated_at: string | null;
  description: string | null;
  game_description_md: string | null;
};

export type GameList = {
  id: string;
  slug: string;
  title: string;
  hero_md: string | null;
  intro_md: string | null;
  outro_md: string | null;
  meta_title: string | null;
  meta_description: string | null;
  display_name: string | null;
  primary_metric_key?: string | null;
  primary_metric_label?: string | null;
  cover_image: string | null;
  list_type: "sql" | "manual" | "hybrid";
  filter_config: Record<string, unknown> | null;
  limit_count: number;
  is_published: boolean;
  refreshed_at: string | null;
  created_at: string;
  updated_at: string;
  top_entry_image?: string | null;
  entries?: unknown[] | null;
};

export type GameListEntry = {
  list_id: string;
  universe_id: number;
  game_id: string | null;
  rank: number;
  metric_value: number | null;
  metric_key?: string | null;
  metric_label?: string | null;
  reason: string | null;
  extra: Record<string, unknown> | null;
};

type GamePreview = Pick<Game, "id" | "slug" | "name" | "universe_id"> & {
  active_count?: number | null;
};

export type GameListUniverseEntry = GameListEntry & {
  universe: ListUniverseDetails;
  game: GamePreview | null;
  badges?: UniverseListBadge[] | null;
};

export type GameListNavEntry = {
  universe_id: number;
  rank: number;
  metric_value: number | null;
  extra: Record<string, unknown> | null;
  universe: {
    universe_id: number;
    display_name: string | null;
    name: string | null;
  };
  game: { name: string | null } | null;
};

export type UniverseListBadge = {
  list_id: string;
  list_slug: string;
  list_title: string;
  rank: number;
};

export type ChecklistPage = {
  id: string;
  universe_id: number;
  slug: string;
  title: string;
  description_md: string | null;
  seo_title: string | null;
  seo_description: string | null;
  published_at: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  item_count?: number;
  content_updated_at?: string | null;
  universe?: UniverseSummary | null;
};

export type ChecklistItem = {
  id: string;
  page_id: string;
  section_code: string;
  title: string;
  description: string | null;
  is_required: boolean;
  created_at: string;
  updated_at: string;
};

export type Code = {
  id: string;
  game_id: string;
  code: string;
  status: "active"|"expired"|"check";
  rewards_text: string | null;
  level_requirement: number | null;
  is_new: boolean | null;
  posted_online: boolean;
  first_seen_at: string;
  last_seen_at: string;
};

export async function listPublishedGames(): Promise<Game[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("games")
    .select("*")
    .eq("is_published", true)
    .order("name", { ascending: true });
  if (error) throw error;
  return data as Game[];
}

export async function listAuthors(): Promise<Author[]> {
  const cached = unstable_cache(
    async () => {
      const sb = supabaseAdmin();
      const { data, error } = await sb
        .from("authors")
        .select("id, name, slug, avatar_url, gravatar_email, bio_md, twitter, youtube, website, facebook, linkedin, instagram, roblox, discord, created_at, updated_at")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Author[];
    },
    ["listAuthors"],
    {
      revalidate: 2592000, // 30 days
      tags: ["authors-index"]
    }
  );

  return cached();
}

export async function listAuthorSlugs(): Promise<string[]> {
  const cached = unstable_cache(
    async () => {
      const sb = supabaseAdmin();
      const { data, error } = await sb
        .from("authors")
        .select("slug")
        .not("slug", "is", null);
      if (error) throw error;
      return (data ?? [])
        .map((row) => (row as { slug: string | null }).slug)
        .filter((slug): slug is string => typeof slug === "string" && slug.length > 0);
    },
    ["listAuthorSlugs"],
    {
      revalidate: 2592000, // 30 days
      tags: ["authors-index"]
    }
  );

  return cached();
}

function articleSelectFields() {
  return `*, author:authors(id,name,slug,avatar_url,gravatar_email,bio_md,twitter,youtube,website,facebook,linkedin,instagram,roblox,discord,created_at,updated_at), universe:roblox_universes(universe_id,slug,display_name,name)`;
}

export async function getAuthorBySlug(slug: string): Promise<Author | null> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("authors")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return (data as Author) || null;
}

type GameSummaryFields = Pick<Game, "id" | "name" | "slug" | "cover_image" | "created_at" | "updated_at" | "universe_id">;

export type GameWithCounts = GameSummaryFields & {
  active_count: number;
  latest_code_first_seen_at: string | null;
  content_updated_at: string | null;
  genre_l1?: string | null;
  genre_l2?: string | null;
};


export async function listAllGames(): Promise<Game[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("games")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return data as Game[];
}

type CodePageSummary = GameSummaryFields & {
  active_code_count?: number | null;
  latest_code_first_seen_at?: string | null;
  content_updated_at?: string | null;
  genre_l1?: string | null;
  genre_l2?: string | null;
  universe?: { genre_l1?: string | null; genre_l2?: string | null } | null;
};

function mapCodePageRowToCounts(row: CodePageSummary): GameWithCounts {
  return {
    ...row,
    active_count: row.active_code_count ?? 0,
    latest_code_first_seen_at: row.latest_code_first_seen_at ?? null,
    content_updated_at: row.content_updated_at ?? row.updated_at ?? null,
    genre_l1: row.genre_l1 ?? row.universe?.genre_l1 ?? null,
    genre_l2: row.genre_l2 ?? row.universe?.genre_l2 ?? null
  };
}

async function fetchGamesWithActiveCounts(): Promise<GameWithCounts[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("game_pages_index_view")
    .select("id,name,slug,cover_image,created_at,updated_at,universe_id,genre_l1,genre_l2,active_code_count,latest_code_first_seen_at,content_updated_at")
    .eq("is_published", true)
    .order("content_updated_at", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row) => mapCodePageRowToCounts(row as CodePageSummary));
}

const cachedListGamesWithActiveCounts = unstable_cache(
  fetchGamesWithActiveCounts,
  ["listGamesWithActiveCounts"],
  {
    revalidate: 21600, // 6 hours
    tags: ["codes-index", "home"]
  }
);

export async function listGamesWithActiveCounts(): Promise<GameWithCounts[]> {
  return cachedListGamesWithActiveCounts();
}

export async function listPublishedCodeSlugs(): Promise<string[]> {
  const cached = unstable_cache(
    async () => {
      const sb = supabaseAdmin();
      const { data, error } = await sb
        .from("game_pages_index_view")
        .select("slug")
        .eq("is_published", true)
        .not("slug", "is", null)
        .order("content_updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? [])
        .map((row) => (row as { slug: string | null }).slug)
        .filter((slug): slug is string => typeof slug === "string" && slug.length > 0);
    },
    ["listPublishedCodeSlugs"],
    {
      revalidate: 21600, // 6 hours
      tags: ["codes-index", "home"]
    }
  );

  return cached();
}

export async function listGamesWithActiveCountsPage(page: number, pageSize: number): Promise<{ games: GameWithCounts[]; total: number }> {
  const safePage = normalizePositivePage(page);
  const safePageSize = Math.max(1, pageSize);
  const offset = (safePage - 1) * safePageSize;

  const cached = unstable_cache(
    async () => {
      const sb = supabaseAdmin();
      try {
        const { data, count, error, status } = await sb
          .from("game_pages_index_view")
          .select(
            "id,name,slug,cover_image,created_at,updated_at,universe_id,genre_l1,genre_l2,active_code_count,latest_code_first_seen_at,content_updated_at",
            { count: "exact" }
          )
          .eq("is_published", true)
          .order("content_updated_at", { ascending: false })
          .range(offset, offset + safePageSize - 1);

        if (error) {
          if (!isOutOfRangePaginationFailure(status, error)) throw error;
          const { count, error: countError } = await sb
            .from("game_pages_index_view")
            .select("id", { count: "exact", head: true })
            .eq("is_published", true);
          if (countError) throw countError;
          return { games: [], total: count ?? 0 };
        }
        const games = (data ?? []).map((row) => mapCodePageRowToCounts(row as CodePageSummary));
        return { games, total: count ?? games.length };
      } catch (error) {
        if (!isOutOfRangePaginationError(error)) throw error;
        const { count, error: countError } = await sb
          .from("game_pages_index_view")
          .select("id", { count: "exact", head: true })
          .eq("is_published", true);
        if (countError) throw countError;
        return { games: [], total: count ?? 0 };
      }
    },
    [`listGamesWithActiveCountsPage:${safePage}:${safePageSize}`],
    {
      revalidate: 21600, // 6 hours
      tags: ["codes-index", "home"]
    }
  );

  return cached();
}

export async function listGamesWithActiveCountsForIds(gameIds: string[]): Promise<GameWithCounts[]> {
  if (!gameIds.length) {
    return [];
  }

  const uniqueIds = Array.from(new Set(gameIds));
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("game_pages_index_view")
    .select("id,name,slug,cover_image,created_at,updated_at,universe_id,genre_l1,genre_l2,active_code_count,latest_code_first_seen_at,content_updated_at")
    .eq("is_published", true)
    .in("id", uniqueIds);
  if (error) throw error;

  const gameList = (data ?? []) as CodePageSummary[];
  if (!gameList.length) {
    return [];
  }

  const withCounts = gameList.map((row) => mapCodePageRowToCounts(row));
  const map = new Map(withCounts.map((game) => [game.id, game]));

  return gameIds.map((id) => map.get(id)).filter((game): game is GameWithCounts => Boolean(game));
}

export async function listGamesWithActiveCountsByUniverseId(universeId: number, limit = 1): Promise<GameWithCounts[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("game_pages_index_view")
    .select(
      "id,name,slug,cover_image,created_at,updated_at,universe_id,genre_l1,genre_l2,active_code_count,latest_code_first_seen_at,content_updated_at"
    )
    .eq("is_published", true)
    .eq("universe_id", universeId)
    .order("content_updated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => mapCodePageRowToCounts(row as CodePageSummary));
}

export async function listPublishedGameLists(): Promise<GameList[]> {
  const cached = unstable_cache(
    async () => {
      const sb = supabaseAdmin();
      try {
        const { data, error } = await sb
          .from("game_lists_index_view")
          .select("id, slug, title, display_name, cover_image, top_entry_image, limit_count, refreshed_at, updated_at, created_at")
          .eq("is_published", true)
          .order("updated_at", { ascending: false });
        if (error) throw error;
        return (data ?? []) as GameList[];
      } catch (error: any) {
        // fall through to base table on missing column/view issues
      }

      const { data: fallback, error: fallbackError } = await sb
        .from("game_lists")
        .select("id, slug, title, display_name, cover_image, limit_count, refreshed_at, updated_at, created_at")
        .eq("is_published", true)
        .order("updated_at", { ascending: false });
      if (fallbackError) throw fallbackError;
      return (fallback ?? []) as GameList[];
    },
    ["listPublishedGameLists"],
    {
      revalidate: 21600, // 6 hours
      tags: ["lists-index"]
    }
  );

  return cached();
}

export async function listPublishedGameListSlugs(): Promise<string[]> {
  const cached = unstable_cache(
    async () => {
      const sb = supabaseAdmin();
      const { data, error } = await sb
        .from("game_lists")
        .select("slug")
        .eq("is_published", true)
        .not("slug", "is", null);
      if (error) throw error;
      return (data ?? [])
        .map((row) => (row as { slug: string | null }).slug)
        .filter((slug): slug is string => typeof slug === "string" && slug.length > 0);
    },
    ["listPublishedGameListSlugs"],
    {
      revalidate: 21600, // 6 hours
      tags: ["lists-index"]
    }
  );

  return cached();
}

export async function listPublishedGameListsPage(
  page: number,
  pageSize: number
): Promise<{ lists: GameList[]; total: number }> {
  const safePage = normalizePositivePage(page);
  const safePageSize = Math.max(1, pageSize);
  const offset = (safePage - 1) * safePageSize;

  const cached = unstable_cache(
    async () => {
      const sb = supabaseAdmin();
      try {
        const { data, count, error, status } = await sb
          .from("game_lists_index_view")
          .select("id, slug, title, display_name, cover_image, top_entry_image, updated_at, created_at", { count: "exact" })
          .eq("is_published", true)
          .order("updated_at", { ascending: false })
          .range(offset, offset + safePageSize - 1);

        if (error) {
          if (!isOutOfRangePaginationFailure(status, error)) throw error;
          const { count, error: countError } = await sb
            .from("game_lists_index_view")
            .select("id", { count: "exact", head: true })
            .eq("is_published", true);
          if (countError) throw countError;
          return { lists: [], total: count ?? 0 };
        }
        const lists = (data ?? []) as GameList[];
        return { lists, total: count ?? lists.length };
      } catch (err: any) {
        if (isOutOfRangePaginationError(err)) {
          const { count, error: countError } = await sb
            .from("game_lists_index_view")
            .select("id", { count: "exact", head: true })
            .eq("is_published", true);
          if (countError) throw countError;
          return { lists: [], total: count ?? 0 };
        }

        if (err?.code !== "42703") {
          // non-column errors should still bubble
          throw err;
        }
        const { data, count, error, status } = await sb
          .from("game_lists")
          .select("id, slug, title, display_name, cover_image, updated_at, created_at", { count: "exact" })
          .eq("is_published", true)
          .order("updated_at", { ascending: false })
          .range(offset, offset + safePageSize - 1);

        if (error) {
          if (!isOutOfRangePaginationFailure(status, error)) throw error;
          const { count: fallbackCount, error: countError } = await sb
            .from("game_lists")
            .select("id", { count: "exact", head: true })
            .eq("is_published", true);
          if (countError) throw countError;
          return { lists: [], total: fallbackCount ?? 0 };
        }
        const lists = (data ?? []) as GameList[];
        return { lists, total: count ?? lists.length };
      }
    },
    [`listPublishedGameListsPage:${safePage}:${safePageSize}`],
    {
      revalidate: 21600, // 6 hours
      tags: ["lists-index"]
    }
  );

  return cached();
}

export async function getGameListMetadata(slug: string): Promise<GameList | null> {
  const normalizedSlug = slug.trim().toLowerCase();
  const cached = unstable_cache(
    async () => {
      const sb = supabaseAdmin();
      const { data, error } = await sb
        .from("game_lists")
        .select(
          `
            id,
            slug,
            title,
            display_name,
            hero_md,
            intro_md,
            outro_md,
            meta_title,
            meta_description,
            cover_image,
            primary_metric_key,
            primary_metric_label,
            list_type,
            filter_config,
            limit_count,
            is_published,
            refreshed_at,
            created_at,
            updated_at
          `
        )
        .eq("slug", normalizedSlug)
        .eq("is_published", true)
        .maybeSingle();
      if (error) throw error;
      return (data as GameList) ?? null;
    },
    [`getGameListMetadata:${normalizedSlug}`],
    {
      revalidate: 86400, // 1 day
      tags: ["lists-index", `list:${normalizedSlug}`]
    }
  );

  return cached();
}

export async function listOtherGameLists(excludeSlug: string, limit = 6): Promise<GameList[]> {
  const sb = supabaseAdmin();
  try {
    const { data, error } = await sb
      .from("game_lists_index_view")
      .select("id, slug, title, display_name, cover_image, top_entry_image, refreshed_at, updated_at, created_at, is_published")
      .eq("is_published", true)
      .neq("slug", excludeSlug)
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data ?? []) as GameList[];
  } catch (error: any) {
    // fall through to base table
  }

  // Fallback to base table if the view is missing columns (42703) or unavailable
  const { data: fallback, error: fallbackError } = await sb
    .from("game_lists")
    .select("id, slug, title, display_name, cover_image, refreshed_at, updated_at, created_at, is_published")
    .eq("is_published", true)
    .neq("slug", excludeSlug)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (fallbackError) throw fallbackError;
  return (fallback ?? []) as GameList[];
}

export async function getGameListEntriesPage(
  listId: string,
  page: number,
  pageSize: number
): Promise<{ entries: GameListUniverseEntry[]; total: number }> {
  const sb = supabaseAdmin();
  const safePage = normalizePositivePage(page);
  const safePageSize = Math.max(1, pageSize);
  const offset = Math.max(0, (safePage - 1) * safePageSize);

  const getTotalEntriesCount = async (): Promise<number> => {
    const { count, error } = await sb
      .from("game_list_entries")
      .select("list_id", { count: "exact", head: true })
      .eq("list_id", listId);
    if (error) throw error;
    return count ?? 0;
  };

  try {
    const { data, count, error, status } = await sb
      .from("game_list_entries")
      .select(
        `
          list_id,
          universe_id,
          game_id,
          rank,
          metric_value,
          reason,
          extra,
          universe:roblox_universes(
            universe_id,
            root_place_id,
            name,
          display_name,
          slug,
          icon_url,
          playing,
          visits,
          favorites,
          likes,
          dislikes,
          age_rating,
          desktop_enabled,
          mobile_enabled,
          tablet_enabled,
          console_enabled,
          vr_enabled,
          updated_at,
          description,
          game_description_md
        ),
        game:games(
            id,
            slug,
            name,
            universe_id
          )
        `,
        { count: "exact" }
      )
      .eq("list_id", listId)
      .order("rank", { ascending: true })
      .range(offset, offset + safePageSize - 1);

    if (error) {
      if (!isOutOfRangePaginationFailure(status, error)) throw error;
      return { entries: [], total: await getTotalEntriesCount() };
    }
    return {
      entries: ((data ?? []) as unknown as GameListUniverseEntry[]).filter((entry) => Boolean((entry as any).universe)),
      total: count ?? 0
    };
  } catch (error: any) {
    if (isOutOfRangePaginationError(error)) {
      return { entries: [], total: await getTotalEntriesCount() };
    }
    if (error?.code !== "42703") throw error;
    // Fallback for environments missing some universe columns
    try {
      const { data, count, error: fallbackError, status: fallbackStatus } = await sb
        .from("game_list_entries")
        .select(
          `
            list_id,
            universe_id,
            game_id,
            rank,
            metric_value,
            reason,
            extra,
            universe:roblox_universes(
              universe_id,
              name,
              display_name,
              slug,
              icon_url,
              playing,
              visits,
              favorites,
              likes,
              dislikes,
              age_rating,
              desktop_enabled,
              mobile_enabled,
              tablet_enabled,
              console_enabled,
              vr_enabled,
              updated_at,
              description,
              game_description_md
            ),
            game:games(
              id,
              slug,
              name,
              universe_id
            )
          `,
          { count: "exact" }
        )
        .eq("list_id", listId)
        .order("rank", { ascending: true })
        .range(offset, offset + safePageSize - 1);
      if (fallbackError) {
        if (!isOutOfRangePaginationFailure(fallbackStatus, fallbackError)) throw fallbackError;
        return { entries: [], total: await getTotalEntriesCount() };
      }
      return {
        entries: ((data ?? []) as unknown as GameListUniverseEntry[]).filter((entry) => Boolean((entry as any).universe)),
        total: count ?? 0
      };
    } catch (fallbackError) {
      if (!isOutOfRangePaginationError(fallbackError)) throw fallbackError;
      return { entries: [], total: await getTotalEntriesCount() };
    }
  }
}

export async function getGameListBySlug(
  slug: string,
  page = 1,
  pageSize = 10
): Promise<{ list: GameList; entries: GameListUniverseEntry[]; total: number } | null> {
  const list = await getGameListMetadata(slug);
  if (!list) {
    return null;
  }

  const { entries, total } = await getGameListEntriesPage(list.id, page, pageSize);

  const missingGameIds = entries
    .map((entry) => entry.game?.id)
    .filter((id): id is string => Boolean(id))
    .filter((id, idx, arr) => arr.indexOf(id) === idx)
    .filter((id) => {
      const game = entries.find((e) => e.game?.id === id)?.game;
      return game && (game.active_count === null || game.active_count === undefined);
    });

  if (missingGameIds.length) {
    const withCounts = await listGamesWithActiveCountsForIds(missingGameIds);
    const map = new Map(withCounts.map((g) => [g.id, g]));
    for (const entry of entries) {
      const gid = entry.game?.id;
      if (gid && map.has(gid)) {
        entry.game = { ...entry.game, ...map.get(gid)! };
      }
    }
  }

  const universeIds = entries.map((entry) => entry.universe_id).filter((id, idx, arr) => arr.indexOf(id) === idx);
  if (universeIds.length) {
    const badgeMap = await listRanksForUniverses(universeIds, list.id);
    for (const entry of entries) {
      const badges = badgeMap.get(entry.universe_id) ?? null;
      if (badges?.length) {
        entry.badges = badges;
      }
    }
  }

  return { list, entries, total };
}

export async function getGameListNavEntries(listId: string): Promise<GameListNavEntry[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("game_list_entries")
    .select(
      `
        universe_id,
        rank,
        metric_value,
        extra,
        universe:roblox_universes(
          universe_id,
          display_name,
          name
        ),
        game:games(
          name
        )
      `
    )
    .eq("list_id", listId)
    .order("rank", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as unknown as GameListNavEntry[]).filter((entry) => Boolean((entry as any).universe));
}

export async function listRanksForUniverses(
  universeIds: number[],
  excludeListId?: string
): Promise<Map<number, UniverseListBadge[]>> {
  if (!universeIds.length) {
    return new Map();
  }

  const sb = supabaseAdmin();
  const query = sb
    .from("game_list_entries")
    .select("universe_id, rank, list_id, game_lists!inner(id, slug, title, is_published)")
    .in("universe_id", universeIds);

  if (excludeListId) {
    query.neq("list_id", excludeListId);
  }

  const { data, error } = await query;
  if (error) throw error;

  const map = new Map<number, UniverseListBadge[]>();
  for (const row of data ?? []) {
    const list = (row as any).game_lists;
    if (!list || !list.is_published) continue;
    if (row.rank > 3) continue;
    const badge: UniverseListBadge = {
      list_id: list.id,
      list_slug: list.slug,
      list_title: list.title,
      rank: row.rank
    };
    const existing = map.get(row.universe_id) ?? [];
    existing.push(badge);
    map.set(row.universe_id, existing);
  }

  for (const [key, badges] of map.entries()) {
    const filtered = badges.filter((badge) => badge.rank >= 1 && badge.rank <= 3).sort((a, b) => a.rank - b.rank);
    map.set(key, filtered.slice(0, 3));
  }

  return map;
}

const cachedListPublishedArticles = unstable_cache(
  async (limit: number, offset: number) => {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from('article_pages_index_view')
      .select(ARTICLE_INDEX_FIELDS)
      .eq('is_published', true)
      .order('published_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
    const mapped = rows.map((row) => ({
      ...row,
      content_md: "",
      tags: [],
      word_count: null,
      author: (row as any).author ?? null,
      universe: (row as any).universe ?? null
    })) as unknown as ArticleWithRelations[];
    return mapped;
  },
  ["listPublishedArticles"],
  {
    revalidate: 21600, // 6 hours
    tags: ["articles-index", "home"]
  }
);

export async function listPublishedArticles(limit = 20, offset = 0): Promise<ArticleWithRelations[]> {
  return cachedListPublishedArticles(limit, offset);
}

export async function listPublishedArticleSlugs(): Promise<string[]> {
  const cached = unstable_cache(
    async () => {
      const sb = supabaseAdmin();
      const { data, error } = await sb
        .from("article_pages_index_view")
        .select("slug")
        .eq("is_published", true)
        .not("slug", "is", null)
        .order("published_at", { ascending: false });
      if (error) throw error;
      return (data ?? [])
        .map((row) => (row as { slug: string | null }).slug)
        .filter((slug): slug is string => typeof slug === "string" && slug.length > 0);
    },
    ["listPublishedArticleSlugs"],
    {
      revalidate: 21600, // 6 hours
      tags: ["articles-index"]
    }
  );

  return cached();
}

export async function listPublishedArticlesPage(
  page: number,
  pageSize: number
): Promise<{ articles: ArticleWithRelations[]; total: number }> {
  const safePage = normalizePositivePage(page);
  const safePageSize = Math.max(1, pageSize);
  const offset = (safePage - 1) * safePageSize;

  const cached = unstable_cache(
    async () => {
      const sb = supabaseAdmin();
      try {
        const { data, count, error, status } = await sb
          .from("article_pages_index_view")
          .select(ARTICLE_INDEX_FIELDS, { count: "exact" })
          .eq("is_published", true)
          .order("published_at", { ascending: false })
          .range(offset, offset + safePageSize - 1);

        if (error) {
          if (!isOutOfRangePaginationFailure(status, error)) throw error;
          const { count, error: countError } = await sb
            .from("article_pages_index_view")
            .select("id", { count: "exact", head: true })
            .eq("is_published", true);
          if (countError) throw countError;
          return { articles: [], total: count ?? 0 };
        }
        const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
        const mapped = rows.map((row) => ({
          ...row,
          content_md: "",
          tags: [],
          word_count: null,
          author: (row as any).author ?? null,
          universe: (row as any).universe ?? null
        })) as unknown as ArticleWithRelations[];
        return { articles: mapped, total: count ?? mapped.length };
      } catch (error) {
        if (!isOutOfRangePaginationError(error)) throw error;
        const { count, error: countError } = await sb
          .from("article_pages_index_view")
          .select("id", { count: "exact", head: true })
          .eq("is_published", true);
        if (countError) throw countError;
        return { articles: [], total: count ?? 0 };
      }
    },
    [`listPublishedArticlesPage:${safePage}:${safePageSize}`],
    {
      revalidate: 21600, // 6 hours
      tags: ["articles-index"]
    }
  );

  return cached();
}

export async function listPublishedArticlesByUniverseId(
  universeId: number,
  limit = 3,
  offset = 0
): Promise<ArticleWithRelations[]> {
  const cacheKey = `listPublishedArticlesByUniverseId:${universeId}:${limit}:${offset}`;
  const cached = unstable_cache(
    async () => {
      const sb = supabaseAdmin();
      const { data, error } = await sb
        .from("article_pages_index_view")
        .select(ARTICLE_INDEX_FIELDS)
        .eq("is_published", true)
        .eq("universe_id", universeId)
        .order("published_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;
      const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
      const mapped = rows.map((row) => ({
        ...row,
        content_md: "",
        tags: [],
        word_count: null,
        author: (row as any).author ?? null,
        universe: (row as any).universe ?? null
      })) as unknown as ArticleWithRelations[];
      return mapped;
    },
    [cacheKey],
    {
      revalidate: 21600, // 6 hours
      tags: ["articles-index"]
    }
  );

  return cached();
}

export async function getArticleBySlug(slug: string): Promise<ArticleWithRelations | null> {
  const normalizedSlug = slug.trim().toLowerCase();
  const cached = unstable_cache(
    async () => {
      const sb = supabaseAdmin();
      const { data, error } = await sb
        .from('article_pages_view')
        .select(
          `*, author:authors(id,name,slug,avatar_url,gravatar_email,bio_md,twitter,youtube,website,facebook,linkedin,instagram,roblox,discord,created_at,updated_at), universe:roblox_universes(universe_id,slug,display_name,name,icon_url,genre_l1,genre_l2)`
        )
        .eq('slug', normalizedSlug)
        .eq('is_published', true)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;
      return data as unknown as ArticleWithRelations;
    },
    [`getArticleBySlug:${normalizedSlug}`],
    {
      revalidate: 604800, // 7 days to align with article ISR
      tags: ["articles-index", `article:${normalizedSlug}`]
    }
  );

  return cached();
}

export async function listRecentArticlesForSitemap(): Promise<ArticleWithRelations[]> {
  return listPublishedArticles(200, 0);
}

export async function listPublishedArticlesByAuthor(
  authorId: string,
  limit = 12,
  offset = 0,
  authorSlug?: string | null
): Promise<ArticleWithRelations[]> {
  const tagSlug = authorSlug?.trim().toLowerCase() ?? null;
  const cacheKey = `listPublishedArticlesByAuthor:${authorId}:${limit}:${offset}`;
  const cached = unstable_cache(
    async () => {
      const sb = supabaseAdmin();
      const { data, error } = await sb
        .from("article_pages_view")
        .select("id,title,slug,cover_image,meta_description,published_at,created_at,updated_at,is_published,author,universe,author_id")
        .eq("is_published", true)
        .eq("author_id", authorId)
        .order("published_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;
      const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
      return rows.map((row) => ({
        ...row,
        content_md: "",
        tags: [],
        word_count: null,
        author: (row as any).author ?? null,
        universe: (row as any).universe ?? null
      })) as unknown as ArticleWithRelations[];
    },
    [cacheKey],
    {
      revalidate: 21600, // 6 hours
      tags: ["articles-index", tagSlug ? `author:${tagSlug}` : null].filter(Boolean) as string[]
    }
  );

  return cached();
}

export async function listPublishedGamesByAuthorWithActiveCounts(
  authorId: string,
  authorSlug?: string | null
): Promise<GameWithCounts[]> {
  const tagSlug = authorSlug?.trim().toLowerCase() ?? null;
  const cached = unstable_cache(
    async () => {
      const sb = supabaseAdmin();
      const { data, error } = await sb
        .from("game_pages_index_view")
        .select("id,name,slug,cover_image,created_at,updated_at,universe_id,genre_l1,genre_l2,active_code_count,latest_code_first_seen_at,content_updated_at")
        .eq("is_published", true)
        .eq("author_id", authorId)
        .order("name", { ascending: true });
      if (error) throw error;

      return (data ?? []).map((row) => mapCodePageRowToCounts(row as CodePageSummary));
    },
    [`listPublishedGamesByAuthorWithActiveCounts:${authorId}`],
    {
      revalidate: 21600, // 6 hours
      tags: ["authors-index", tagSlug ? `author:${tagSlug}` : null].filter(Boolean) as string[]
    }
  );

  return cached();
}

const cachedGetChecklistPageBySlug = unstable_cache(
  async (slug: string) => {
    const normalizedSlug = slug.trim().toLowerCase();
    const sb = supabaseAdmin();

    let page: ChecklistPage | null = null;

    // Prefer the view; fall back to the base table if needed
    const { data: viewPage, error: viewError } = await sb
      .from("checklist_pages_view")
      .select("*")
      .eq("slug", normalizedSlug)
      .eq("is_public", true)
      .maybeSingle();

    if (!viewError && viewPage) {
      page = viewPage as ChecklistPage;
    } else {
      const { data: tablePage, error: tableError } = await sb
        .from("checklist_pages")
        .select("*")
        .eq("slug", normalizedSlug)
        .eq("is_public", true)
        .maybeSingle();
      if (tableError) throw tableError;
      page = (tablePage as ChecklistPage) ?? null;
    }

    if (!page) return null;

    const { data: items, error: itemsError } = await sb
      .from("checklist_items")
      .select("*")
      .eq("page_id", (page as any).id)
      .order("section_code", { ascending: true });

    if (itemsError) throw itemsError;

    return {
      page,
      items: (items ?? []) as ChecklistItem[]
    };
  },
  ["getChecklistPageBySlug"],
  {
    revalidate: 1800,
    tags: ["checklists-index"]
  }
);

export async function getChecklistPageBySlug(
  slug: string
): Promise<{ page: ChecklistPage; items: ChecklistItem[] } | null> {
  return cachedGetChecklistPageBySlug(slug.trim().toLowerCase());
}

export async function listPublishedChecklistSlugs(): Promise<string[]> {
  const cached = unstable_cache(
    async () => {
      const sb = supabaseAdmin();
      const { data, error } = await sb
        .from("checklist_pages")
        .select("slug")
        .eq("is_public", true);
      if (error) throw error;
      return (data ?? []).map((row) => (row as { slug: string }).slug);
    },
    ["listPublishedChecklistSlugs"],
    {
      revalidate: 1800,
      tags: ["checklists-index"]
    }
  );

  return cached();
}

export type ChecklistSummaryRow = {
  id: string;
  slug: string;
  title: string;
  description_md?: string | null;
  seo_description?: string | null;
  published_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  content_updated_at?: string | null;
  universe_id?: number | null;
  item_count?: number;
  leaf_item_count?: number;
  universe?: {
    display_name?: string | null;
    name?: string | null;
    icon_url?: string | null;
    thumbnail_urls?: unknown;
  } | null;
  items?: Array<{ count?: number }>;
};

export type EventsPageSummary = {
  id: string;
  universe_id: number;
  slug: string;
  title: string;
  meta_description?: string | null;
  published_at?: string | null;
  created_at: string;
  updated_at: string;
  universe?: {
    display_name?: string | null;
    name?: string | null;
    icon_url?: string | null;
  } | null;
};

const cachedListPublishedChecklists = unstable_cache(
  async (limit: number, offset: number) => {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("checklist_pages_view")
      .select(
        "id, slug, title, description_md, seo_description, published_at, updated_at, created_at, content_updated_at, item_count, leaf_item_count, universe, universe_id"
      )
      .eq("is_public", true)
      .order("content_updated_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (!error && data) {
      return (data ?? []) as ChecklistSummaryRow[];
    }

    const { data: fallback, error: fallbackError } = await sb
      .from("checklist_pages")
      .select(
        `
          id,
          slug,
          title,
          description_md,
          seo_description,
          published_at,
          updated_at,
          created_at
        `
      )
      .eq("is_public", true)
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (fallbackError) throw fallbackError;

    return (fallback ?? []) as ChecklistSummaryRow[];
  },
  ["listPublishedChecklists"],
  {
    revalidate: 1800,
    tags: ["checklists-index"]
  }
);

export async function listPublishedChecklists(limit = 120, offset = 0): Promise<ChecklistSummaryRow[]> {
  const safeLimit = Math.max(1, limit);
  const safeOffset = Math.max(0, offset);
  return cachedListPublishedChecklists(safeLimit, safeOffset);
}

export async function listPublishedChecklistsPage(
  page: number,
  pageSize: number
): Promise<{ checklists: ChecklistSummaryRow[]; total: number }> {
  const safePage = normalizePositivePage(page);
  const safePageSize = Math.max(1, pageSize);
  const offset = (safePage - 1) * safePageSize;

  const cached = unstable_cache(
    async () => {
      const sb = supabaseAdmin();
      try {
        const { data, count, error, status } = await sb
          .from("checklist_pages_view")
          .select(
            "id, slug, title, description_md, seo_description, cover_image, published_at, updated_at, created_at, item_count, leaf_item_count, universe, universe_id",
            { count: "exact" }
          )
          .eq("is_public", true)
          .order("updated_at", { ascending: false })
          .range(offset, offset + safePageSize - 1);

        if (error) {
          if (!isOutOfRangePaginationFailure(status, error)) throw error;
          const { count, error: countError } = await sb
            .from("checklist_pages_view")
            .select("id", { count: "exact", head: true })
            .eq("is_public", true);
          if (countError) throw countError;
          return { checklists: [], total: count ?? 0 };
        }
        const rows = (data ?? []) as ChecklistSummaryRow[];
        return { checklists: rows, total: count ?? rows.length };
      } catch (error: any) {
        if (isOutOfRangePaginationError(error)) {
          const { count, error: countError } = await sb
            .from("checklist_pages_view")
            .select("id", { count: "exact", head: true })
            .eq("is_public", true);
          if (countError) throw countError;
          return { checklists: [], total: count ?? 0 };
        }

        if (error?.code !== "42703") throw error;
        const { data: viewData, count: viewCount, error: viewError, status: viewStatus } = await sb
          .from("checklist_pages_view")
          .select(
            "id, slug, title, description_md, seo_description, published_at, updated_at, created_at, item_count, leaf_item_count, universe, universe_id",
            { count: "exact" }
          )
          .eq("is_public", true)
          .order("updated_at", { ascending: false })
          .range(offset, offset + safePageSize - 1);

        if (!viewError) {
          const rows = (viewData ?? []) as ChecklistSummaryRow[];
          return { checklists: rows, total: viewCount ?? rows.length };
        }

        if (isOutOfRangePaginationFailure(viewStatus, viewError)) {
          const { count, error: countError } = await sb
            .from("checklist_pages_view")
            .select("id", { count: "exact", head: true })
            .eq("is_public", true);
          if (countError) throw countError;
          return { checklists: [], total: count ?? 0 };
        }

        if (viewError?.code !== "42703") throw viewError;
        // Fallback for schemas missing view columns: include universe icon via join
        const { data, count, error: fallbackError, status: fallbackStatus } = await sb
          .from("checklist_pages")
          .select(
            `
              id,
              slug,
              title,
              published_at,
              updated_at,
              created_at,
              universe:roblox_universes(icon_url, thumbnail_urls, display_name, name),
              universe_id
            `,
            { count: "exact" }
          )
          .eq("is_public", true)
          .order("updated_at", { ascending: false })
          .range(offset, offset + safePageSize - 1);

        if (fallbackError) {
          if (!isOutOfRangePaginationFailure(fallbackStatus, fallbackError)) throw fallbackError;
          const { count: fallbackCount, error: countError } = await sb
            .from("checklist_pages")
            .select("id", { count: "exact", head: true })
            .eq("is_public", true);
          if (countError) throw countError;
          return { checklists: [], total: fallbackCount ?? 0 };
        }
        const rows = (data ?? []) as ChecklistSummaryRow[];
        return { checklists: rows, total: count ?? rows.length };
      }
    },
    [`listPublishedChecklistsPage:${safePage}:${safePageSize}`],
    {
      revalidate: 1800,
      tags: ["checklists-index"]
    }
  );

  return cached();
}

export async function listPublishedChecklistsByUniverseId(universeId: number, limit = 1): Promise<ChecklistSummaryRow[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("checklist_pages_view")
    .select("id, slug, title, description_md, seo_description, published_at, updated_at, created_at, content_updated_at, item_count, leaf_item_count, universe, universe_id")
    .eq("is_public", true)
    .eq("universe_id", universeId)
    .order("content_updated_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as ChecklistSummaryRow[];
}

export async function getEventsPageByUniverseId(universeId: number): Promise<EventsPageSummary | null> {
  const cached = unstable_cache(
    async () => {
      const sb = supabaseAdmin();
      const { data, error } = await sb
        .from("events_pages")
        .select(
          "id, universe_id, slug, title, meta_description, published_at, created_at, updated_at, universe:roblox_universes(universe_id, display_name, name, icon_url)"
        )
        .eq("is_published", true)
        .eq("universe_id", universeId)
        .not("slug", "is", null)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!data || !(data as { slug?: string | null }).slug) return null;
      const raw = data as EventsPageSummary & { universe?: EventsPageSummary["universe"] | EventsPageSummary["universe"][] };
      const universe = Array.isArray(raw.universe) ? raw.universe[0] ?? null : raw.universe ?? null;
      return { ...raw, universe };
    },
    [`eventsPageByUniverse:${universeId}`],
    {
      revalidate: 3600,
      tags: ["events-pages"]
    }
  );

  return cached();
}

export async function listPublishedEventsPageSlugs(): Promise<string[]> {
  const cached = unstable_cache(
    async () => {
      const sb = supabaseAdmin();
      const { data, error } = await sb
        .from("events_pages")
        .select("slug")
        .eq("is_published", true)
        .not("slug", "is", null);
      if (error) throw error;
      return (data ?? [])
        .map((row) => (row as { slug: string | null }).slug)
        .filter((slug): slug is string => typeof slug === "string" && slug.length > 0);
    },
    ["listPublishedEventsPageSlugs"],
    {
      revalidate: 3600,
      tags: ["events-pages"]
    }
  );

  return cached();
}

export async function getGameBySlug(slug: string): Promise<GameWithAuthor | null> {
  const normalizedSlug = slug.trim().toLowerCase();
  const cached = unstable_cache(
    async () => {
      const sb = supabaseAdmin();
      const { data, error } = await sb
        .from("code_pages_view")
        .select("*")
        .eq("slug", normalizedSlug)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      if (!(data as any).author && DEFAULT_AUTHOR_ID) {
        const { data: fallback } = await sb
          .from("authors")
          .select("*")
          .eq("id", DEFAULT_AUTHOR_ID)
          .maybeSingle();
        if (fallback) {
          (data as any).author = fallback;
        }
      }

      return data as GameWithAuthor;
    },
    [`getGameBySlug:${normalizedSlug}`],
    {
      revalidate: 21600, // 6 hours
      tags: ["codes-index", `code:${normalizedSlug}`]
    }
  );

  return cached();
}

const cachedGetRobloxUniverseById = unstable_cache(
  async (universeId: number) => {
    const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("roblox_universes")
    .select("universe_id, name, display_name, creator_name, creator_id, creator_type, social_links, created_at_api")
    .eq("universe_id", universeId)
    .maybeSingle();

    if (error) throw error;
    return (data as RobloxUniverseInfo) || null;
  },
  ["getRobloxUniverseById"],
  {
    revalidate: 21600, // 6 hours
    tags: ["codes-index"]
  }
);

export async function getRobloxUniverseById(universeId: number): Promise<RobloxUniverseInfo | null> {
  return cachedGetRobloxUniverseById(universeId);
}

const cachedListCodesForGame = unstable_cache(
  async (gameId: string) => {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("code_pages_view")
      .select("codes")
      .eq("id", gameId)
      .maybeSingle();
    if (error) throw error;
    const codes = (data as { codes?: unknown })?.codes;
    if (!Array.isArray(codes)) return [];
    return codes as Code[];
  },
  ["listCodesForGame"],
  {
    revalidate: 21600, // 6 hours
    tags: ["codes-index"]
  }
);

export async function listCodesForGame(gameId: string): Promise<Code[]> {
  return cachedListCodesForGame(gameId);
}
// ========================================
// Free Roblox Items Catalog
// ========================================

export type FreeItem = {
  asset_id: number;
  name: string | null;
  description: string | null;
  category: string | null;
  subcategory: string | null;
  creator_name: string | null;
  creator_id: number | null;
  creator_type: string | null;
  asset_type_id: number | null;
  favorite_count: number | null;
  last_seen_at: string;
  created_at: string;
};

export type FreeItemsFilters = {
  category?: string;
  subcategory?: string;
  search?: string;
  sort?: 'newest' | 'popular' | 'updated';
};

function buildFreeItemsSearchPattern(value: string): string {
  const cleaned = value.replace(/[%_]/g, " ").trim();
  const pattern = cleaned.replace(/[^a-z0-9]+/gi, "%").replace(/%{2,}/g, "%");
  return `%${pattern}%`;
}

async function fetchFreeItems(
  page: number,
  limit: number,
  filters: FreeItemsFilters = {}
): Promise<{ items: FreeItem[]; total: number }> {
  const sb = supabaseAdmin();
  const offset = Math.max(0, (page - 1) * limit);

  let query = sb
    .from('roblox_catalog_items')
    .select('asset_id, name, description, category, subcategory, creator_name, creator_id, creator_type, asset_type_id, favorite_count, last_seen_at, created_at', { count: 'exact' })
    .eq('price_robux', 0)
    .eq('is_deleted', false)
    .not('name', 'is', null);

  if (filters.category) {
    query = query.eq('category', filters.category);
  }

  if (filters.subcategory) {
    query = query.eq('subcategory', filters.subcategory);
  }

  const searchTerm = (filters.search ?? "").trim();
  if (searchTerm) {
    const pattern = buildFreeItemsSearchPattern(searchTerm);
    const orParts = [
      `name.ilike.${pattern}`,
      `description.ilike.${pattern}`,
      `creator_name.ilike.${pattern}`
    ];
    if (/^\d+$/.test(searchTerm)) {
      orParts.unshift(`asset_id.eq.${searchTerm}`);
    }
    query = query.or(orParts.join(","));
  }

  // Apply sorting
  switch (filters.sort) {
    case 'popular':
      query = query.order('favorite_count', { ascending: false, nullsFirst: false });
      break;
    case 'updated':
      query = query.order('last_seen_at', { ascending: false });
      break;
    case 'newest':
    default:
      query = query.order('created_at', { ascending: false });
      break;
  }

  query = query.range(offset, offset + limit - 1);

  const { data, count, error } = await query;

  if (error) throw error;

  return {
    items: (data ?? []) as FreeItem[],
    total: count ?? 0
  };
}

export async function listFreeItems(
  page: number = 1,
  limit: number = 24,
  filters: FreeItemsFilters = {}
): Promise<{ items: FreeItem[]; total: number }> {
  const safePage = Math.max(1, page);
  const safeLimit = Math.max(1, Math.min(100, limit));

  const cached = unstable_cache(
    () => fetchFreeItems(safePage, safeLimit, filters),
    [`listFreeItems:${safePage}:${safeLimit}:${JSON.stringify(filters)}`],
    {
      revalidate: 3600, // 1 hour
      tags: ['free-items-catalog']
    }
  );

  return cached();
}

export async function getFreeItemsCount(filters: FreeItemsFilters = {}): Promise<number> {
  const cached = unstable_cache(
    async () => {
      const sb = supabaseAdmin();
      let query = sb
        .from('roblox_catalog_items')
        .select('asset_id', { count: 'exact', head: true })
        .eq('price_robux', 0)
        .eq('is_deleted', false)
        .not('name', 'is', null);

      if (filters.category) {
        query = query.eq('category', filters.category);
      }

      if (filters.subcategory) {
        query = query.eq('subcategory', filters.subcategory);
      }

      const searchTerm = (filters.search ?? "").trim();
      if (searchTerm) {
        const pattern = buildFreeItemsSearchPattern(searchTerm);
        const orParts = [
          `name.ilike.${pattern}`,
          `description.ilike.${pattern}`,
          `creator_name.ilike.${pattern}`
        ];
        if (/^\d+$/.test(searchTerm)) {
          orParts.unshift(`asset_id.eq.${searchTerm}`);
        }
        query = query.or(orParts.join(","));
      }

      const { count, error } = await query;
      if (error) throw error;
      return count ?? 0;
    },
    [`getFreeItemsCount:${JSON.stringify(filters)}`],
    {
      revalidate: 3600, // 1 hour
      tags: ['free-items-catalog']
    }
  );

  return cached();
}

export async function getFreeItemCategories(): Promise<Array<{ category: string; count: number }>> {
  const cached = unstable_cache(
    async () => {
      const sb = supabaseAdmin();
      const { data, error } = await sb
        .from('roblox_catalog_items')
        .select('category')
        .eq('price_robux', 0)
        .eq('is_deleted', false)
        .not('name', 'is', null)
        .not('category', 'is', null);

      if (error) throw error;

      // Count occurrences
      const counts = new Map<string, number>();
      for (const item of data ?? []) {
        if (item.category) {
          counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
        }
      }

      return Array.from(counts.entries())
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count);
    },
    ['getFreeItemCategories'],
    {
      revalidate: 7200, // 2 hours
      tags: ['free-items-catalog']
    }
  );

  return cached();
}

export async function getFreeItemSubcategories(category?: string): Promise<Array<{ subcategory: string; count: number }>> {
  const cached = unstable_cache(
    async () => {
      const sb = supabaseAdmin();
      let query = sb
        .from('roblox_catalog_items')
        .select('subcategory')
        .eq('price_robux', 0)
        .eq('is_deleted', false)
        .not('name', 'is', null)
        .not('subcategory', 'is', null);

      if (category) {
        query = query.eq('category', category);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Count occurrences
      const counts = new Map<string, number>();
      for (const item of data ?? []) {
        if (item.subcategory) {
          counts.set(item.subcategory, (counts.get(item.subcategory) ?? 0) + 1);
        }
      }

      return Array.from(counts.entries())
        .map(([subcategory, count]) => ({ subcategory, count }))
        .sort((a, b) => b.count - a.count);
    },
    [`getFreeItemSubcategories:${category ?? 'all'}`],
    {
      revalidate: 7200, // 2 hours
      tags: ['free-items-catalog']
    }
  );

  return cached();
}
