alter table if exists public.catalog_pages
  alter column intro_md drop not null,
  alter column how_it_works_md drop not null;
