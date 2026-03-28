-- Revalidate the free-items catalog when qualifying catalog items or their thumbnails change.

create or replace function public.qualifies_for_free_items_catalog(
  p_price_robux bigint,
  p_is_deleted boolean,
  p_raw_economy_json jsonb,
  p_has_resellers boolean,
  p_lowest_resale_price_robux bigint,
  p_name text,
  p_category text,
  p_subcategory text,
  p_favorite_count bigint
)
returns boolean
language sql
immutable
as $$
  select coalesce(
    p_price_robux = 0
    and p_is_deleted = false
    and coalesce(p_raw_economy_json ->> 'free_item_source', '') = 'robloxden'
    and p_has_resellers = false
    and p_lowest_resale_price_robux = 0
    and p_name is not null
    and p_category is not null
    and p_subcategory is not null
    and p_favorite_count is not null,
    false
  );
$$;

create or replace function public.trg_enqueue_revalidation_free_items_catalog()
returns trigger
language plpgsql
as $$
declare
  old_qualifies boolean := false;
  new_qualifies boolean := false;
begin
  if tg_op <> 'INSERT' then
    old_qualifies := public.qualifies_for_free_items_catalog(
      old.price_robux,
      old.is_deleted,
      old.raw_economy_json,
      old.has_resellers,
      old.lowest_resale_price_robux,
      old.name,
      old.category,
      old.subcategory,
      old.favorite_count
    );
  end if;

  if tg_op <> 'DELETE' then
    new_qualifies := public.qualifies_for_free_items_catalog(
      new.price_robux,
      new.is_deleted,
      new.raw_economy_json,
      new.has_resellers,
      new.lowest_resale_price_robux,
      new.name,
      new.category,
      new.subcategory,
      new.favorite_count
    );
  end if;

  if old_qualifies or new_qualifies then
    perform public.enqueue_revalidation('catalog', 'free-roblox-items', 'roblox_catalog_items_' || lower(tg_op));
  end if;

  return null;
end;
$$;

drop trigger if exists trg_enqueue_revalidation_free_items_catalog on public.roblox_catalog_items;
create trigger trg_enqueue_revalidation_free_items_catalog
after insert or update or delete on public.roblox_catalog_items
for each row execute function public.trg_enqueue_revalidation_free_items_catalog();

create or replace function public.trg_enqueue_revalidation_free_item_images()
returns trigger
language plpgsql
as $$
declare
  target_asset_id bigint;
  should_revalidate boolean := false;
begin
  target_asset_id := coalesce(new.asset_id, old.asset_id);
  if target_asset_id is null then
    return null;
  end if;

  select public.qualifies_for_free_items_catalog(
    item.price_robux,
    item.is_deleted,
    item.raw_economy_json,
    item.has_resellers,
    item.lowest_resale_price_robux,
    item.name,
    item.category,
    item.subcategory,
    item.favorite_count
  )
  into should_revalidate
  from public.roblox_catalog_items item
  where item.asset_id = target_asset_id;

  should_revalidate := coalesce(should_revalidate, false);

  if should_revalidate then
    perform public.enqueue_revalidation('catalog', 'free-roblox-items', 'roblox_catalog_item_images_' || lower(tg_op));
  end if;

  return null;
end;
$$;

drop trigger if exists trg_enqueue_revalidation_free_item_images on public.roblox_catalog_item_images;
create trigger trg_enqueue_revalidation_free_item_images
after insert or update or delete on public.roblox_catalog_item_images
for each row execute function public.trg_enqueue_revalidation_free_item_images();
