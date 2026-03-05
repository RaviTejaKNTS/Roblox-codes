create table if not exists public.user_code_progress (
  user_id uuid not null references public.app_users(user_id) on delete cascade,
  game_slug text not null,
  used_code_ids text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, game_slug)
);

create index if not exists idx_user_code_progress_slug
  on public.user_code_progress (game_slug);

alter table public.user_code_progress enable row level security;

drop policy if exists "user_code_progress_select_own" on public.user_code_progress;
create policy "user_code_progress_select_own" on public.user_code_progress
  for select using (auth.uid() = user_id);

drop policy if exists "user_code_progress_insert_own" on public.user_code_progress;
create policy "user_code_progress_insert_own" on public.user_code_progress
  for insert with check (auth.uid() = user_id);

drop policy if exists "user_code_progress_update_own" on public.user_code_progress;
create policy "user_code_progress_update_own" on public.user_code_progress
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "user_code_progress_delete_own" on public.user_code_progress;
create policy "user_code_progress_delete_own" on public.user_code_progress
  for delete using (auth.uid() = user_id);

drop trigger if exists trg_user_code_progress_updated_at on public.user_code_progress;
create trigger trg_user_code_progress_updated_at
before update on public.user_code_progress
for each row execute function public.set_updated_at();
