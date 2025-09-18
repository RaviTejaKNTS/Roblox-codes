-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- games table
create table if not exists public.games (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text not null unique,
  source_url text,
  cover_image text,
  seo_title text,
  seo_description text,
  seo_keywords text,
  description_md text,
  reward_1 text,
  reward_2 text,
  reward_3 text,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- codes table
create table if not exists public.codes (
  id uuid primary key default uuid_generate_v4(),
  game_id uuid not null references public.games(id) on delete cascade,
  code text not null,
  status text not null check (status in ('active','expired','check')),
  rewards_text text,
  level_requirement int,
  is_new boolean,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (game_id, code)
);

create index if not exists idx_codes_game_status on public.codes (game_id, status);
create index if not exists idx_games_published on public.games (is_published);

-- trigger to update updated_at
create or replace function public.set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_games_updated_at on public.games;
create trigger trg_games_updated_at before update on public.games
for each row execute function public.set_updated_at();

-- RLS
alter table public.games enable row level security;
alter table public.codes enable row level security;

-- Policy: allow read of published games and their codes to anon
drop policy if exists "read_published_games" on public.games;
create policy "read_published_games" on public.games
  for select using (is_published = true);

drop policy if exists "read_codes_of_published_games" on public.codes;
create policy "read_codes_of_published_games" on public.codes
  for select using (
    exists (select 1 from public.games g where g.id = codes.game_id and g.is_published = true)
  );

-- Admin insert/update via service role (bypass RLS)
-- Upsert helper for codes (ensures last_seen_at is bumped; first_seen_at preserved)
create or replace function public.upsert_code(
  p_game_id uuid,
  p_code text,
  p_status text,
  p_rewards_text text,
  p_level_requirement int,
  p_is_new boolean
) returns void as $$
begin
  insert into public.codes (game_id, code, status, rewards_text, level_requirement, is_new)
  values (p_game_id, p_code, p_status, p_rewards_text, p_level_requirement, p_is_new)
  on conflict (game_id, code) do update
    set status = excluded.status,
        rewards_text = excluded.rewards_text,
        level_requirement = excluded.level_requirement,
        is_new = excluded.is_new,
        last_seen_at = now();
end;
$$ language plpgsql;
