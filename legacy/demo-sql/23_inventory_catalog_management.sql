-- Run once in the SolarFlow demo project's Supabase SQL Editor.
-- Items remain in inventory_items when archived; history and balances are preserved.
begin;

alter table public.inventory_items
  add column if not exists category text not null default 'General',
  add column if not exists archived_at timestamptz;

create index if not exists inventory_items_active_category_idx
  on public.inventory_items (category, product_name)
  where archived_at is null;

-- Keep existing row-level policies. The app uses the authenticated user's
-- existing SELECT, INSERT and UPDATE grants; it never deletes catalogue rows.
commit;
