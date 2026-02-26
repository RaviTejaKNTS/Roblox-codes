-- Fix Supabase security warnings:
-- 1) function_search_path_mutable
-- 2) extension_in_public (pg_trgm)

-- Set an immutable search_path for every non-extension function in public.
do $$
declare
  fn record;
begin
  for fn in
    select
      format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and not exists (
        select 1
        from pg_depend d
        where d.classid = 'pg_proc'::regclass
          and d.objid = p.oid
          and d.deptype = 'e'
      )
  loop
    execute format('alter function %s set search_path = pg_catalog, public', fn.signature);
  end loop;
end;
$$;

-- Move pg_trgm out of public schema.
create schema if not exists extensions;
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_trgm') then
    execute 'alter extension pg_trgm set schema extensions';
  end if;
end;
$$;
