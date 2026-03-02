-- Keep search_site working after pg_trgm is moved to the extensions schema.
drop function if exists public.search_site(text, integer, integer);

create or replace function public.search_site(
  p_query text,
  p_limit integer default 120,
  p_offset integer default 0
)
returns table (
  entity_type text,
  entity_id text,
  slug text,
  title text,
  subtitle text,
  url text,
  updated_at timestamptz,
  active_code_count bigint
)
language plpgsql
stable
set search_path = pg_catalog, public
as $$
declare
  v_query text := trim(coalesce(p_query, ''));
  v_limit integer := greatest(1, least(coalesce(p_limit, 120), 200));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
begin
  if v_query = '' then
    return;
  end if;

  return query
  with q as (
    select websearch_to_tsquery('english', v_query) as tsq
  )
  select
    si.entity_type,
    si.entity_id,
    si.slug,
    si.title,
    si.subtitle,
    si.url,
    coalesce(g.content_updated_at, si.updated_at) as updated_at,
    case when si.entity_type = 'code' then g.active_code_count else null end as active_code_count
  from public.search_index si
  cross join q
  left join public.game_pages_index_view g
    on si.entity_type = 'code'
    and g.id::text = si.entity_id
  where si.is_published = true
    and (
      si.search_vector @@ q.tsq
      or si.search_text ilike '%' || v_query || '%'
    )
  order by
    greatest(
      ts_rank_cd(si.search_vector, q.tsq),
      extensions.similarity(si.search_text, v_query)
    ) desc,
    updated_at desc nulls last
  limit v_limit
  offset v_offset;
end;
$$;
