-- Fix Supabase lint errors:
-- 1) SECURITY DEFINER views in public schema
-- 2) RLS disabled on public.quiz_pages

-- Switch flagged views to run with the querying user's privileges.
alter view if exists public.limited_items_trading_view set (security_invoker = true);
alter view if exists public.roblox_music_artists_view set (security_invoker = true);
alter view if exists public.checklist_pages_view set (security_invoker = true);
alter view if exists public.tools_view set (security_invoker = true);
alter view if exists public.game_pages_index_view set (security_invoker = true);
alter view if exists public.game_lists_view set (security_invoker = true);
alter view if exists public.game_code_stats set (security_invoker = true);
alter view if exists public.catalog_pages_view set (security_invoker = true);
alter view if exists public.quiz_pages_view set (security_invoker = true);
alter view if exists public.code_pages_view set (security_invoker = true);
alter view if exists public.roblox_music_ids_ranked_view set (security_invoker = true);
alter view if exists public.article_pages_index_view set (security_invoker = true);
alter view if exists public.article_pages_view set (security_invoker = true);
alter view if exists public.roblox_music_genres_view set (security_invoker = true);
alter view if exists public.game_lists_index_view set (security_invoker = true);
alter view if exists public.roblox_music_ids_boombox_view set (security_invoker = true);

-- Enable RLS for quiz_pages and keep public published reads + admin management.
alter table public.quiz_pages enable row level security;

drop policy if exists "quiz_pages_public_read" on public.quiz_pages;
create policy "quiz_pages_public_read"
  on public.quiz_pages
  for select
  to anon, authenticated
  using (is_published = true);

drop policy if exists "quiz_pages_admin_full_access" on public.quiz_pages;
create policy "quiz_pages_admin_full_access"
  on public.quiz_pages
  for all
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
