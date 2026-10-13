-- Repair inventory functions after the shared-database migration.
-- Replaces legacy inventory functions that still reference demo_session_id.

begin;

-- The shared database has one catalog. Keep it current when a BOM line is saved
-- instead of writing to the database every time someone opens the Inventory page.
create or replace function public.sync_inventory_catalog()
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.inventory_items(item_key, sku, product_name, uom)
  select distinct on (public.inventory_item_key(product_name, uom))
    public.inventory_item_key(product_name, uom),
    'BOM-' || substr(md5(public.inventory_item_key(product_name, uom)), 1, 12),
    product_name,
    case
      when lower(trim(uom)) in ('no.', 'nos', 'no', 'nos.') then 'Nos'
      else trim(uom)
    end
  from public.bom_items
  where nullif(trim(uom), '') is not null
    and product_name <> 'SolarFlow Demo Panel'
  order by public.inventory_item_key(product_name, uom), id
  on conflict (item_key) do nothing;
$$;

create or replace function public.sync_inventory_catalog_after_bom_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform public.sync_inventory_catalog();
  return null;
end;
$$;

drop trigger if exists sync_inventory_catalog_after_bom_change on public.bom_items;
create trigger sync_inventory_catalog_after_bom_change
after insert or update of product_name, uom on public.bom_items
for each statement execute function public.sync_inventory_catalog_after_bom_change();

-- Request IDs make retries safe. The old two-column uniqueness constraint was
-- removed together with demo_session_id, so restore it for the shared ledger.
create unique index if not exists inventory_movements_request_id_key
  on public.inventory_movements(request_id);

create index if not exists inventory_movements_customer
  on public.inventory_movements(customer_id);

create or replace function public.record_inventory_movement(
  p_item_id uuid,
  p_kind text,
  p_quantity numeric,
  p_note text,
  p_request_id uuid
)
returns public.inventory_items
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item public.inventory_items;
  previous public.inventory_movements;
begin
  if auth.uid() is null then
    raise exception 'Sign in first';
  end if;
  if p_kind not in ('receipt', 'issue')
    or p_kind is null
    or p_quantity is null
    or p_quantity <= 0
    or p_quantity::text in ('NaN', 'Infinity', '-Infinity')
    or p_quantity <> round(p_quantity, 3)
  then
    raise exception 'Use a positive quantity with at most three decimal places';
  end if;
  if nullif(trim(p_note), '') is null or length(p_note) > 500 or p_request_id is null then
    raise exception 'A note and request ID are required';
  end if;

  select * into item
  from public.inventory_items
  where id = p_item_id
  for update;
  if not found then
    raise exception 'Inventory item unavailable';
  end if;

  select * into previous
  from public.inventory_movements
  where request_id = p_request_id;
  if found then
    if previous.item_id <> p_item_id
      or previous.kind <> p_kind
      or previous.quantity <> p_quantity
      or previous.note <> trim(p_note)
    then
      raise exception 'Request ID already used for another movement';
    end if;
    return item;
  end if;

  if p_kind = 'issue' and item.stock_on_hand < p_quantity then
    raise exception 'Insufficient stock: % % available', item.stock_on_hand, item.uom;
  end if;

  update public.inventory_items
  set stock_on_hand = stock_on_hand + case when p_kind = 'issue' then -p_quantity else p_quantity end
  where id = item.id
  returning * into item;

  insert into public.inventory_movements(item_id, request_id, kind, quantity, note)
  values(item.id, p_request_id, p_kind, p_quantity, trim(p_note));

  return item;
end;
$$;

create or replace function public.bom_stock_document(p_customer_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  c public.admin;
  b public.bom;
  items jsonb;
  kind text;
begin
  select * into c
  from public.admin
  where id = p_customer_id and deleted_at is null;
  if not found then
    raise exception 'Project unavailable';
  end if;

  kind := case when upper(c.roof_shed) = 'SHED' then 'SHED' else 'ROOF' end;
  if jsonb_typeof(c.bom_data->'items') = 'array'
    and coalesce(c.bom_data->'bom'->>'bom_type', c.bom_data->>'bom_type', kind) = kind
  then
    return c.bom_data;
  end if;

  select * into b
  from public.bom
  where admin_id = c.id and bom_type = kind
  order by created_at desc
  limit 1;

  select coalesce(jsonb_agg(to_jsonb(i) order by sr_no, id), '[]'::jsonb)
  into items
  from public.bom_items i
  where bom_id = b.id;

  return jsonb_build_object('bom', to_jsonb(b), 'items', items);
end;
$$;

create or replace function public.get_inventory_bom_lines()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      line || jsonb_build_object(
        'customer_id', c.id,
        'customer_name', c.customer_name,
        'issued', c.bom_stock_issued_at is not null,
        'line_index', ordinality - 1
      )
      order by c.customer_name, ordinality
    ),
    '[]'::jsonb
  )
  from public.admin c
  cross join lateral jsonb_array_elements(public.bom_stock_document(c.id)->'items')
    with ordinality as l(line, ordinality)
  where c.deleted_at is null;
$$;

create or replace function public.set_bom_stock_quantity(
  p_customer_id uuid,
  p_line_index integer,
  p_quantity numeric,
  p_expected_line jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  c public.admin;
  doc jsonb;
  line jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in first';
  end if;
  if p_quantity is null
    or p_quantity < 0
    or p_quantity::text in ('NaN', 'Infinity', '-Infinity')
    or p_quantity <> round(p_quantity, 3)
  then
    raise exception 'Enter zero or a positive quantity with at most three decimal places';
  end if;

  select * into c
  from public.admin
  where id = p_customer_id and deleted_at is null
  for update;
  if not found then
    raise exception 'Project unavailable';
  end if;
  if c.bom_stock_issued_at is not null then
    raise exception 'Stock already issued. Record a separate stock adjustment if needed.';
  end if;

  doc := public.bom_stock_document(c.id);
  line := doc->'items'->p_line_index;
  if p_line_index < 0 or line is null or line is distinct from p_expected_line then
    raise exception 'BOM changed. Refresh and review the current line.';
  end if;

  doc := jsonb_set(doc, array['items', p_line_index::text, 'stock_quantity'], to_jsonb(p_quantity));
  update public.admin set bom_data = doc where id = c.id;
end;
$$;

create or replace function public.issue_delivered_bom_stock()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  doc jsonb;
  line jsonb;
  amount numeric;
  item public.inventory_items;
  movement_request_id uuid;
  r record;
  demands jsonb := '{}'::jsonb;
  raw text;
  bom_kind text;
begin
  if new.delivery_status is distinct from 'DELIVERED'
    or old.delivery_status is not distinct from 'DELIVERED'
    or old.bom_stock_issued_at is not null
  then
    return new;
  end if;
  if auth.uid() is null then
    raise exception 'Sign in first';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('inventory_stock_lock', 0));
  doc := public.bom_stock_document(new.id);
  bom_kind := case when upper(new.roof_shed) = 'SHED' then 'SHED' else 'ROOF' end;
  if jsonb_typeof(new.bom_data->'items') = 'array'
    and coalesce(new.bom_data->'bom'->>'bom_type', new.bom_data->>'bom_type', bom_kind) = bom_kind
  then
    doc := new.bom_data;
  end if;

  if jsonb_array_length(doc->'items') = 0 then
    raise exception 'Create and save a BOM for % before marking Delivered', new.customer_name;
  end if;

  perform public.sync_inventory_catalog();
  for line in select jsonb_array_elements(doc->'items') loop
    raw := coalesce(line->>'stock_quantity', line->>'quantity', '');
    if trim(raw) !~ '^(\d+(\.\d+)?|\.\d+)$' then
      raise exception 'Quantity needed for %: %. Open Godown → BOM Quantities.', new.customer_name, line->>'product_name';
    end if;
    amount := trim(raw)::numeric;
    if amount <> round(amount, 3) then
      raise exception 'Use at most three decimal places for %', line->>'product_name';
    end if;
    if amount = 0 then
      continue;
    end if;

    select * into item
    from public.inventory_items
    where item_key = public.inventory_item_key(line->>'product_name', line->>'uom');
    if not found then
      raise exception 'Add a unit and save the BOM for %', line->>'product_name';
    end if;
    demands := jsonb_set(
      demands,
      array[item.id::text],
      to_jsonb(coalesce((demands->>item.id::text)::numeric, 0) + amount)
    );
  end loop;

  for r in select key, value from jsonb_each_text(demands) order by key loop
    select * into item
    from public.inventory_items
    where id = r.key::uuid
    for update;
    if item.stock_on_hand < r.value::numeric then
      raise exception 'Insufficient % for %: need %, available % %. Add quantity in Godown.',
        item.product_name, new.customer_name, r.value, item.stock_on_hand, item.uom;
    end if;

    movement_request_id := gen_random_uuid();
    perform public.record_inventory_movement(
      item.id,
      'issue',
      r.value::numeric,
      'BOM delivery: ' || new.customer_name || ' (' || new.id || ')',
      movement_request_id
    );
    update public.inventory_movements
    set customer_id = new.id
    where request_id = movement_request_id;
  end loop;

  new.bom_stock_issued_at := now();
  return new;
end;
$$;

drop trigger if exists issue_delivered_bom_stock on public.admin;
create trigger issue_delivered_bom_stock
before update of delivery_status on public.admin
for each row execute function public.issue_delivered_bom_stock();

revoke all on function public.sync_inventory_catalog(),
  public.sync_inventory_catalog_after_bom_change(),
  public.record_inventory_movement(uuid, text, numeric, text, uuid),
  public.bom_stock_document(uuid),
  public.get_inventory_bom_lines(),
  public.set_bom_stock_quantity(uuid, integer, numeric, jsonb),
  public.issue_delivered_bom_stock()
from public, anon;

grant execute on function public.sync_inventory_catalog(),
  public.record_inventory_movement(uuid, text, numeric, text, uuid),
  public.bom_stock_document(uuid),
  public.get_inventory_bom_lines(),
  public.set_bom_stock_quantity(uuid, integer, numeric, jsonb)
to authenticated;

-- Backfill any catalog entries saved since SQL 19 was run.
select public.sync_inventory_catalog();

commit;

notify pgrst, 'reload schema';
