-- ============================================================================
-- 19_convert_to_shared_multiuser_database.sql
-- Converts SolarFlow to a single unified shared collaborative database:
--
-- 1. Completely DROPS demo_session_id from all tables.
-- 2. Deduplicates drivers, vendors, batches, inventory, and metadata.
-- 3. Cleans orphan records and creates clean foreign keys without demo_session_id.
-- 4. Replaces sandbox RLS with shared multi-user policies for all authenticated users.
-- 5. Automatically names anonymous logins "Admin 1", "Admin 2", etc., so
--    each person's actions are clearly tracked and attributed in the Activity Log.
-- 6. Updates storage and atomic batch functions for shared multi-user collaboration.
-- ============================================================================

begin;

-- ============================================================================
-- STEP 1: Drop demo_session_id column completely from all base tables
-- ============================================================================
do $$
declare
  tbl text;
begin
  for tbl in 
    select c.relname 
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'public' 
      and c.relkind in ('r', 'p') 
      and a.attname = 'demo_session_id'
      and not a.attisdropped
  loop
    execute format('alter table public.%I drop column if exists demo_session_id cascade', tbl);
  end loop;
end $$;

-- ============================================================================
-- STEP 2: Deduplicate Drivers: 1 shared set of Driver 1, 2, 3
-- ============================================================================
update public.admin set
  driver_name = case 
    when driver_name ~* 'driver.*2' then 'Driver 2'
    when driver_name ~* 'driver.*3' then 'Driver 3'
    when driver_name ~* 'driver' then 'Driver 1'
    else driver_name
  end
where driver_name ~* 'driver';

update public.delivery_batches set
  driver_name = case 
    when driver_name ~* 'driver.*2' then 'Driver 2'
    when driver_name ~* 'driver.*3' then 'Driver 3'
    when driver_name ~* 'driver' then 'Driver 1'
    else driver_name
  end
where driver_name ~* 'driver';

delete from public.drivers where name ~* 'demo driver' and name not in ('Driver 1', 'Driver 2', 'Driver 3');

delete from public.drivers where id not in (
  select distinct on (name) id
  from public.drivers
  order by name, created_at desc
);

alter table public.drivers drop constraint if exists drivers_name_key;
alter table public.drivers add constraint drivers_name_key unique (name);

insert into public.drivers (name, phone, vehicle_number)
values
  ('Driver 1', '0000000001', 'DEMO-VEHICLE-001'),
  ('Driver 2', '0000000002', 'DEMO-VEHICLE-002'),
  ('Driver 3', '0000000003', 'DEMO-VEHICLE-003')
on conflict (name) do update set
  phone = coalesce(nullif(drivers.phone, ''), excluded.phone),
  vehicle_number = coalesce(nullif(drivers.vehicle_number, ''), excluded.vehicle_number);

-- ============================================================================
-- STEP 3: Deduplicate Vendors: 1 shared set of Vendor 1, 2, 3
-- ============================================================================
update public.admin set
  vendor = case 
    when vendor ~* 'vendor.*2' then 'Vendor 2'
    when vendor ~* 'vendor.*3' then 'Vendor 3'
    when vendor ~* 'vendor' then 'Vendor 1'
    else vendor
  end
where vendor ~* 'vendor';

update public.delivery_batches set
  vendor = case 
    when vendor ~* 'vendor.*2' then 'Vendor 2'
    when vendor ~* 'vendor.*3' then 'Vendor 3'
    when vendor ~* 'vendor' then 'Vendor 1'
    else vendor
  end
where vendor ~* 'vendor';

delete from public.vendors where name ~* 'demo vendor' and name not in ('Vendor 1', 'Vendor 2', 'Vendor 3');

delete from public.vendors where id not in (
  select distinct on (name) id
  from public.vendors
  order by name, created_at desc
);

alter table public.vendors drop constraint if exists vendors_name_key;
alter table public.vendors add constraint vendors_name_key unique (name);

insert into public.vendors (name, email, phone)
values
  ('Vendor 1', 'vendor1@solarflow.example', '0000000001'),
  ('Vendor 2', 'vendor2@solarflow.example', '0000000002'),
  ('Vendor 3', 'vendor3@solarflow.example', '0000000003')
on conflict (name) do update set
  email = coalesce(nullif(vendors.email, ''), excluded.email),
  phone = coalesce(nullif(vendors.phone, ''), excluded.phone);

-- ============================================================================
-- STEP 4: Deduplicate Delivery Batches
-- ============================================================================
delete from public.delivery_batches where id not in (
  select distinct on (batch_no) id
  from public.delivery_batches
  order by batch_no, created_at desc
);

alter table public.delivery_batches drop constraint if exists delivery_batches_batch_no_key;
alter table public.delivery_batches add constraint delivery_batches_batch_no_key unique (batch_no);

-- ============================================================================
-- STEP 5: Deduplicate Metadata
-- ============================================================================
delete from public.metadata where id not in (
  select distinct on (category, label) id
  from public.metadata
  order by category, label, created_at desc
);

alter table public.metadata drop constraint if exists metadata_category_label_key;
alter table public.metadata add constraint metadata_category_label_key unique (category, label);

-- ============================================================================
-- STEP 6: Deduplicate Inventory Items & Safely Repoint Inventory Movements
-- ============================================================================
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'inventory_movements' and table_type = 'BASE TABLE') then
    with kept_items as (
      select distinct on (item_key) id, item_key
      from public.inventory_items
      order by item_key, created_at desc
    ),
    item_mapping as (
      select i.id as old_id, k.id as new_id
      from public.inventory_items i
      join kept_items k on i.item_key = k.item_key
      where i.id <> k.id
    )
    update public.inventory_movements m
    set item_id = map.new_id
    from item_mapping map
    where m.item_id = map.old_id;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'inventory_items' and table_type = 'BASE TABLE') then
    delete from public.inventory_items where id not in (
      select distinct on (item_key) id
      from public.inventory_items
      order by item_key, created_at desc
    );

    alter table public.inventory_items drop constraint if exists inventory_items_item_key_key;
    alter table public.inventory_items add constraint inventory_items_item_key_key unique (item_key);
  end if;
end $$;

-- ============================================================================
-- STEP 7: Repoint child records & Deduplicate Sample Admin Leads
-- ============================================================================
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'admin' and table_type = 'BASE TABLE') then
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'documents' and table_type = 'BASE TABLE') then
      with kept_admin as (
        select distinct on (coalesce(nullif(consumer_no, ''), id::text)) id, coalesce(nullif(consumer_no, ''), id::text) as cno
        from public.admin
        order by coalesce(nullif(consumer_no, ''), id::text), created_at desc
      ),
      admin_mapping as (
        select a.id as old_id, k.id as new_id
        from public.admin a
        join kept_admin k on coalesce(nullif(a.consumer_no, ''), a.id::text) = k.cno
        where a.id <> k.id
      )
      update public.documents d
      set customer_id = map.new_id
      from admin_mapping map
      where d.customer_id = map.old_id;
    end if;

    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'bom' and table_type = 'BASE TABLE') then
      delete from public.bom where id not in (
        select distinct on (admin_id, bom_type) id
        from public.bom
        order by admin_id, bom_type, created_at desc
      );

      with kept_admin as (
        select distinct on (coalesce(nullif(consumer_no, ''), id::text)) id, coalesce(nullif(consumer_no, ''), id::text) as cno
        from public.admin
        order by coalesce(nullif(consumer_no, ''), id::text), created_at desc
      ),
      admin_mapping as (
        select a.id as old_id, k.id as new_id
        from public.admin a
        join kept_admin k on coalesce(nullif(a.consumer_no, ''), a.id::text) = k.cno
        where a.id <> k.id
      )
      delete from public.bom b
      using admin_mapping map
      where b.admin_id = map.old_id;
    end if;

    delete from public.admin where id not in (
      select distinct on (coalesce(nullif(consumer_no, ''), id::text)) id
      from public.admin
      order by coalesce(nullif(consumer_no, ''), id::text), created_at desc
    );
  end if;
end $$;

-- ============================================================================
-- STEP 8: Clean orphan records & recreate clean single-column foreign keys
-- ============================================================================
do $$
begin
  -- 8a. Documents: remove any orphan records whose customer does not exist in admin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'documents' and table_type = 'BASE TABLE') then
    delete from public.documents where customer_id is null or customer_id not in (select id from public.admin);
    alter table public.documents drop constraint if exists documents_customer_id_fkey;
    alter table public.documents add constraint documents_customer_id_fkey foreign key (customer_id) references public.admin(id) on delete cascade;
  end if;

  -- 8b. BOM and BOM items: remove any records whose parent admin or bom does not exist
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'bom' and table_type = 'BASE TABLE') then
    delete from public.bom where admin_id is null or admin_id not in (select id from public.admin);
    alter table public.bom drop constraint if exists bom_admin_id_fkey;
    alter table public.bom add constraint bom_admin_id_fkey foreign key (admin_id) references public.admin(id) on delete cascade;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'bom_items' and table_type = 'BASE TABLE') then
    delete from public.bom_items where bom_id is null or bom_id not in (select id from public.bom);
    alter table public.bom_items drop constraint if exists bom_items_bom_id_fkey;
    alter table public.bom_items add constraint bom_items_bom_id_fkey foreign key (bom_id) references public.bom(id) on delete cascade;
  end if;

  -- 8c. Inventory movements: remove any movements referencing deleted inventory items
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'inventory_movements' and table_type = 'BASE TABLE') then
    delete from public.inventory_movements where item_id is null or item_id not in (select id from public.inventory_items);
    alter table public.inventory_movements drop constraint if exists inventory_movements_item_id_fkey;
    alter table public.inventory_movements add constraint inventory_movements_item_id_fkey foreign key (item_id) references public.inventory_items(id) on delete cascade;
  end if;

  -- 8d. Quotations: set owner_id to null if the owner profile no longer exists
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'quotations' and table_type = 'BASE TABLE') then
    update public.quotations set owner_id = null where owner_id is not null and owner_id not in (select id from public.profiles);
    alter table public.quotations drop constraint if exists quotations_owner_id_fkey;
    alter table public.quotations add constraint quotations_owner_id_fkey foreign key (owner_id) references public.profiles(id) on delete set null;
  end if;
end $$;

-- ============================================================================
-- STEP 9: Replace sandbox RLS policies with shared multi-user policies
-- ============================================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'admin', 'metadata', 'vendors', 'drivers', 'activity_log',
    'documents', 'bom', 'bom_items', 'delivery_batches', 'quotations',
    'inventory_items', 'inventory_movements', 'staff_attendance', 'enquiries'
  ] loop
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = t and table_type = 'BASE TABLE') then
      execute format('drop policy if exists sandbox_select on public.%I', t);
      execute format('drop policy if exists sandbox_insert on public.%I', t);
      execute format('drop policy if exists sandbox_update on public.%I', t);
      execute format('drop policy if exists sandbox_delete on public.%I', t);
      execute format('drop policy if exists inventory_sandbox on public.%I', t);
      execute format('drop policy if exists attendance_sandbox on public.%I', t);

      execute format('drop policy if exists shared_select on public.%I', t);
      execute format('drop policy if exists shared_insert on public.%I', t);
      execute format('drop policy if exists shared_update on public.%I', t);
      execute format('drop policy if exists shared_delete on public.%I', t);

      execute format('create policy shared_select on public.%I for select to authenticated using (true)', t);
      execute format('create policy shared_insert on public.%I for insert to authenticated with check (true)', t);
      execute format('create policy shared_update on public.%I for update to authenticated using (true) with check (true)', t);
      execute format('create policy shared_delete on public.%I for delete to authenticated using (true)', t);
    end if;
  end loop;
end $$;

-- ============================================================================
-- STEP 10: Update storage policies for customer documents
-- ============================================================================
do $$
begin
  drop policy if exists solarflow_document_read on storage.objects;
  drop policy if exists solarflow_document_insert on storage.objects;
  drop policy if exists solarflow_document_update on storage.objects;
  drop policy if exists solarflow_document_delete on storage.objects;

  create policy solarflow_document_read on storage.objects for select to authenticated
  using(bucket_id='customer-documents' and exists(
   select 1 from public.admin c where c.id::text=(storage.foldername(name))[1]));

  create policy solarflow_document_insert on storage.objects for insert to authenticated
  with check(bucket_id='customer-documents' and exists(
   select 1 from public.admin c where c.id::text=(storage.foldername(name))[1]));

  create policy solarflow_document_update on storage.objects for update to authenticated
  using(bucket_id='customer-documents' and exists(
   select 1 from public.admin c where c.id::text=(storage.foldername(name))[1]))
  with check(bucket_id='customer-documents' and exists(
   select 1 from public.admin c where c.id::text=(storage.foldername(name))[1]));

  create policy solarflow_document_delete on storage.objects for delete to authenticated
  using(bucket_id='customer-documents' and exists(
   select 1 from public.admin c where c.id::text=(storage.foldername(name))[1]));
exception when others then
  null;
end $$;

-- ============================================================================
-- STEP 11: Retain CPO privacy scoping (partner offices only see their leads)
-- ============================================================================
create or replace function public.current_demo_cpo()
returns uuid language sql stable security definer set search_path='' as $$
  select case when p.user_type='channel_partner_office' then p.demo_profile_id
  when p.user_type='office2' then d.parent_profile_id else null end
  from public.profiles p left join public.demo_profiles d on d.id=p.demo_profile_id
  where p.id=auth.uid();
$$;

create or replace function public.can_view_demo_lead(p_creator uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select case when p.user_type in ('channel_partner_office','office2') then
    p_creator=public.current_demo_cpo() or exists(select 1 from public.demo_profiles d
      where d.id=p_creator and d.user_type='agent2' and d.parent_profile_id=public.current_demo_cpo())
  else true end from public.profiles p where p.id=auth.uid();
$$;

drop policy if exists cpo_lead_scope on public.admin;
create policy cpo_lead_scope on public.admin as restrictive for all to authenticated
  using (
    public.current_demo_cpo() is null
    or public.can_view_demo_lead(lead_creator_profile_id)
  )
  with check (
    public.current_demo_cpo() is null
    or public.can_view_demo_lead(lead_creator_profile_id)
  );

drop view if exists public.cpo_leads cascade;
create view public.cpo_leads with (security_invoker = true) as
select *
from public.admin
where public.current_demo_cpo() is not null
  and public.can_view_demo_lead(lead_creator_profile_id);

grant select on public.cpo_leads to authenticated;

-- ============================================================================
-- STEP 12: Anonymous login assigns distinct names (Admin 1, Admin 2, etc.)
-- so each person's edits are attributed individually in the Activity Log!
-- ============================================================================
drop function if exists public.start_demo_session(text);
drop function if exists public.start_demo_session(text, text);

create or replace function public.start_demo_session(p_role text default 'admin', p_name text default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  u uuid := auth.uid();
  p public.profiles;
  v_role_title text;
  v_num integer;
  v_assigned_name text;
  v_clean_name text;
begin
  if u is null then raise exception 'Call signInAnonymously() first'; end if;
  
  v_clean_name := nullif(trim(coalesce(p_name, '')), '');

  -- Assign name: use entered name if provided, otherwise assign sequential Admin 1, Admin 2...
  if p_role = 'admin' then
    v_role_title := 'Admin';
    if v_clean_name is null then
      select count(*) + 1 into v_num 
      from public.profiles 
      where user_type = 'admin' and name ~ '^Admin( [0-9]+)?$';
      v_assigned_name := 'Admin ' || v_num;
    else
      v_assigned_name := v_clean_name;
    end if;
  elsif p_role = 'sales' or p_role = 'office' then
    v_role_title := 'Office';
    if v_clean_name is null then
      select count(*) + 1 into v_num 
      from public.profiles 
      where user_type = 'sales' and name ~ '^Office( [0-9]+)?$';
      v_assigned_name := 'Office ' || v_num;
    else
      v_assigned_name := v_clean_name;
    end if;
  elsif p_role = 'channel_partner_office' then
    v_role_title := 'Channel Partner Office';
    v_assigned_name := coalesce(v_clean_name, 'Demo Aurora Solar (CPO)');
  elsif p_role = 'office2' then
    v_role_title := 'Channel Partner Manager';
    v_assigned_name := coalesce(v_clean_name, 'Demo Manager');
  elsif p_role = 'agent2' then
    v_role_title := 'Channel Partner';
    v_assigned_name := coalesce(v_clean_name, 'Demo Dealer');
  elsif p_role = 'agent' then
    v_role_title := 'Channel Partners';
    v_assigned_name := coalesce(v_clean_name, 'Demo Partner');
  elsif p_role = 'vendor' then
    v_role_title := 'Vendors';
    v_assigned_name := coalesce(v_clean_name, 'Vendor 1');
  elsif p_role = 'stamp' then
    v_role_title := 'Stamp';
    v_assigned_name := coalesce(v_clean_name, 'Demo Stamp');
  else
    v_role_title := 'Admin';
    v_assigned_name := coalesce(v_clean_name, 'Admin 1');
  end if;

  insert into public.profiles (
    id, name, email, user_type, role, channel_partner, status
  )
  values (
    u,
    v_assigned_name,
    'anon.' || substr(u::text, 1, 8) || '@solarflow.demo',
    coalesce(p_role, 'admin'),
    v_role_title,
    'Demo Aurora Solar',
    'active'
  )
  on conflict (id) do update set
    name = coalesce(v_clean_name, profiles.name, excluded.name),
    user_type = coalesce(excluded.user_type, profiles.user_type),
    role = coalesce(excluded.role, profiles.role),
    status = 'active',
    updated_at = now()
  returning * into p;

  return to_jsonb(p);
end $$;

grant execute on function public.start_demo_session(text, text) to authenticated;

-- ============================================================================
-- STEP 13: Atomic batch delivery functions for shared company data
-- ============================================================================
create or replace function public.save_delivery_batch_atomic(p_batch jsonb, p_selected_project_ids uuid[], p_removed_project_ids uuid[])
returns jsonb language plpgsql security invoker set search_path='' as $save_batch$
declare
  u uuid := auth.uid();
  b public.delivery_batches;
  bid uuid := (p_batch->>'id')::uuid;
  selected uuid[] := coalesce(p_selected_project_ids, '{}');
  removed uuid[] := coalesce(p_removed_project_ids, '{}');
  expected_removed uuid[];
  batch_number text := nullif(trim(p_batch->>'batch_no'), '');
  n integer;
begin
  if u is null then raise exception 'Sign in first'; end if;
  perform pg_advisory_xact_lock(hashtextextended('delivery_batches_lock', 0));
  if bid is null or batch_number is null then raise exception 'Batch ID and number are required'; end if;
  if cardinality(selected) = 0 or cardinality(selected) <> (select count(distinct id) from unnest(selected) id) then
    raise exception 'Choose at least one distinct project';
  end if;

  select * into b from public.delivery_batches where id = bid for update;
  if found then
    if b.batch_no <> batch_number then raise exception 'Batch number cannot change'; end if;
    if b.status = 'DELIVERED' then raise exception 'Delivered batches cannot be edited'; end if;
    select coalesce(array_agg(id order by id), '{}') into expected_removed
    from unnest(b.project_ids) id where not(id = any(selected));
  else
    expected_removed := '{}';
  end if;

  if expected_removed is distinct from array(select id from unnest(removed) id order by id) then
    raise exception 'Batch projects changed. Refresh and retry.';
  end if;

  if coalesce(p_batch->>'status', 'IN_TRANSIT') not in ('PENDING', 'IN_TRANSIT') then
    raise exception 'Save the batch before marking it Delivered';
  end if;

  perform id from public.admin where id = any(selected || removed) for update;
  select count(*) into n from public.admin
  where id = any(selected) and deleted_at is null
    and (nullif(delivery_batch_id, '') is null or delivery_batch_id = batch_number)
    and bom_stock_issued_at is null and delivery_status is distinct from 'DELIVERED';
  if n <> cardinality(selected) then
    raise exception 'A project is unavailable, assigned elsewhere, or already delivered. Refresh the project list.';
  end if;

  select count(*) into n from public.admin
  where id = any(removed) and deleted_at is null
    and delivery_batch_id = batch_number and bom_stock_issued_at is null;
  if n <> cardinality(removed) then
    raise exception 'A removed project changed. Refresh and retry.';
  end if;

  insert into public.delivery_batches(
    id, batch_no, dispatch_date, driver_name, driver_phone, vehicle_number,
    rent_amount, car_rent_paid, vendor, notes, status, project_ids
  )
  values(
    bid, batch_number, p_batch->>'dispatch_date', p_batch->>'driver_name',
    p_batch->>'driver_phone', p_batch->>'vehicle_number', p_batch->>'rent_amount',
    coalesce(p_batch->>'car_rent_paid', 'No'), p_batch->>'vendor', p_batch->>'notes',
    coalesce(p_batch->>'status', 'IN_TRANSIT'), selected
  )
  on conflict(id) do update set
    dispatch_date = excluded.dispatch_date,
    driver_name = excluded.driver_name,
    driver_phone = excluded.driver_phone,
    vehicle_number = excluded.vehicle_number,
    rent_amount = excluded.rent_amount,
    car_rent_paid = excluded.car_rent_paid,
    vendor = excluded.vendor,
    notes = excluded.notes,
    status = excluded.status,
    project_ids = excluded.project_ids,
    updated_at = now();

  update public.admin set
    delivery_batch_id = batch_number,
    material_delivery_date = p_batch->>'dispatch_date',
    driver_name = p_batch->>'driver_name',
    driver_phone_number = p_batch->>'driver_phone',
    vehicle_number = p_batch->>'vehicle_number',
    vendor = p_batch->>'vendor',
    delivery_status = coalesce(p_batch->>'status', 'IN_TRANSIT'),
    updated_at = now()
  where id = any(selected);

  update public.admin set
    delivery_batch_id = null,
    delivery_status = 'PENDING',
    updated_at = now()
  where id = any(removed) and delivery_batch_id = batch_number;

  return jsonb_build_object('success', true);
end $save_batch$;

create or replace function public.delete_delivery_batch_atomic(p_batch_id uuid, p_project_ids uuid[])
returns jsonb language plpgsql security invoker set search_path='' as $delete_batch$
declare
  u uuid := auth.uid();
  b public.delivery_batches;
  n integer;
begin
  if u is null then raise exception 'Sign in first'; end if;
  perform pg_advisory_xact_lock(hashtextextended('delivery_batches_lock', 0));
  select * into b from public.delivery_batches where id = p_batch_id for update;
  if not found then raise exception 'Batch unavailable. Refresh and retry.'; end if;
  if b.status = 'DELIVERED' then raise exception 'Delivered batches cannot be disbanded'; end if;
  if array(select unnest(coalesce(p_project_ids, '{}'::uuid[])) order by 1) is distinct from array(select unnest(b.project_ids) order by 1) then
    raise exception 'Batch projects changed. Refresh and retry.';
  end if;

  perform id from public.admin where id = any(b.project_ids) for update;
  select count(*) into n from public.admin
  where id = any(b.project_ids) and delivery_batch_id = b.batch_no and bom_stock_issued_at is null;
  if n <> cardinality(b.project_ids) then
    raise exception 'Batch links changed or stock was issued. Refresh and review the projects.';
  end if;

  update public.admin set
    delivery_batch_id = null,
    delivery_status = 'PENDING',
    updated_at = now()
  where id = any(b.project_ids) and delivery_batch_id = b.batch_no;

  delete from public.delivery_batches where id = b.id;
  return jsonb_build_object('success', true);
end $delete_batch$;

create or replace function public.update_delivery_batch_status_atomic(p_batch_id uuid, p_new_status text, p_project_ids uuid[])
returns jsonb language plpgsql security invoker set search_path='' as $update_delivery_batch_status_atomic$
declare
  b public.delivery_batches;
  n integer;
  expected integer;
begin
  if p_new_status not in ('PENDING', 'IN_TRANSIT', 'DELIVERED') or p_new_status is null then
    raise exception 'Invalid delivery status';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('delivery_batches_lock', 0));
  select * into b from public.delivery_batches where id = p_batch_id for update;
  if not found then raise exception 'Batch unavailable'; end if;
  if array(select unnest(coalesce(p_project_ids, '{}'::uuid[])) order by 1) is distinct from array(select unnest(b.project_ids) order by 1) then
    raise exception 'Batch projects changed. Refresh and retry.';
  end if;
  expected := coalesce(array_length(b.project_ids, 1), 0);

  update public.admin set
    delivery_status = p_new_status,
    updated_at = now()
  where id = any(b.project_ids) and deleted_at is null and delivery_batch_id = b.batch_no;
  get diagnostics n = row_count;
  if n <> expected then
    raise exception 'Some batch projects are unavailable or assigned elsewhere. Refresh and correct the batch.';
  end if;

  update public.delivery_batches set
    status = p_new_status,
    updated_at = now()
  where id = b.id;
  return jsonb_build_object('success', true, 'projects_expected', expected, 'projects_missing', 0);
end $update_delivery_batch_status_atomic$;

grant execute on function public.save_delivery_batch_atomic(jsonb, uuid[], uuid[]),
  public.delete_delivery_batch_atomic(uuid, uuid[]),
  public.update_delivery_batch_status_atomic(uuid, text, uuid[])
to authenticated;

-- ============================================================================
-- STEP 14: Shared Team Chat Messages table with Realtime
-- ============================================================================
create table if not exists public.team_chat_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references auth.users(id) on delete set null,
  sender_name text not null,
  sender_role text not null default 'Team Member',
  user_type text not null default 'admin',
  text text not null,
  tag text not null default 'General',
  created_at timestamptz not null default now()
);

create index if not exists idx_team_chat_messages_created_at
  on public.team_chat_messages (created_at desc);

alter table public.team_chat_messages enable row level security;

drop policy if exists "shared_select_team_chat_messages" on public.team_chat_messages;
create policy "shared_select_team_chat_messages"
  on public.team_chat_messages for select
  to authenticated using (true);

drop policy if exists "shared_insert_team_chat_messages" on public.team_chat_messages;
create policy "shared_insert_team_chat_messages"
  on public.team_chat_messages for insert
  to authenticated with check (true);

drop policy if exists "shared_delete_team_chat_messages" on public.team_chat_messages;
create policy "shared_delete_team_chat_messages"
  on public.team_chat_messages for delete
  to authenticated using (true);

-- Seed initial starter announcements if table is empty
insert into public.team_chat_messages (sender_name, sender_role, user_type, text, tag, created_at)
select * from (values
  ('Operations Admin', 'Admin', 'admin', 'Welcome to the SolarFlow Operations channel. All dispatches, site installation updates, and DISCOM submissions can be announced here for full team visibility.', 'General', now() - interval '3 days'),
  ('Channel Partner Office', 'CPO', 'channel_partner_office', 'Submitted 12 new residential proposals for East cluster. 8 have opted for Jan Samarth bank loan financing.', 'General', now() - interval '1 day'),
  ('Godown & Logistics', 'Admin', 'admin', 'Warehouse stock of bifacial solar modules replenished in godown. Ready for delivery batch allocation.', 'Dispatch', now() - interval '3 hours'),
  ('Site Installation Lead', 'Vendor', 'vendor', 'Completed rooftop mounting structure and inverter wiring for consumer Ramesh Patel. Geo-tag photos submitted.', 'Installation', now() - interval '2 hours'),
  ('Document & Stamp Executive', 'Stamp Maker', 'stamp', 'Executed and uploaded stamped DISCOM agreements for batch 22. All returned to admin queue for final review.', 'Discom', now() - interval '1 hour')
) as v(sender_name, sender_role, user_type, text, tag, created_at)
where not exists (select 1 from public.team_chat_messages limit 1);

-- Add to supabase_realtime publication
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'team_chat_messages'
    ) then
      alter publication supabase_realtime add table public.team_chat_messages;
    end if;
  end if;
end $$;

commit;
