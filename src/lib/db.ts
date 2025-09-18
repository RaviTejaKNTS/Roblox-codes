import { supabaseAdmin } from "@/lib/supabase";

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
  created_at: string;
  updated_at: string;
};

export type Game = {
  id: string;
  name: string;
  slug: string;
  author_id: string | null;
  source_url: string | null;
  cover_image: string | null;
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: string | null;
  intro_md: string | null;
  redeem_md: string | null;
  description_md: string | null;
  reward_1: string | null;
  reward_2: string | null;
  reward_3: string | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
};

export type GameWithAuthor = Game & { author: Author | null };

export type Code = {
  id: string;
  game_id: string;
  code: string;
  status: "active"|"expired"|"check";
  rewards_text: string | null;
  level_requirement: number | null;
  is_new: boolean | null;
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
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("authors")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return data as Author[];
}

export type GameWithCounts = Game & { active_count: number };

export async function listAllGames(): Promise<Game[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("games")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return data as Game[];
}

export async function listGamesWithActiveCounts(): Promise<GameWithCounts[]> {
  const sb = supabaseAdmin();
  const { data: games, error: gamesError } = await sb
    .from("games")
    .select("*")
    .eq("is_published", true)
    .order("name", { ascending: true });
  if (gamesError) throw gamesError;

  const { data: activeCodes, error: codesError } = await sb
    .from("codes")
    .select("game_id")
    .eq("status", "active");
  if (codesError) throw codesError;

  const counts = new Map<string, number>();
  for (const row of activeCodes || []) {
    counts.set(row.game_id, (counts.get(row.game_id) || 0) + 1);
  }

  return (games || []).map((g) => ({
    ...g,
    active_count: counts.get(g.id) || 0,
  })) as GameWithCounts[];
}

export async function getGameBySlug(slug: string): Promise<GameWithAuthor | null> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("games")
    .select("*, author:authors(*)")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return data as GameWithAuthor;
}

export async function listCodesForGame(gameId: string): Promise<Code[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("codes")
    .select("*")
    .eq("game_id", gameId)
    .order("status", { ascending: true })  // active first if status sorted lexicographically by custom order handled in UI
    .order("last_seen_at", { ascending: false });
  if (error) throw error;
  return data as Code[];
}
