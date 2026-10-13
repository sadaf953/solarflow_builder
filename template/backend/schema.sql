-- SolarFlow database setup.
--
-- Run in the Supabase SQL Editor of the client's own project. It is safe to
-- run again: it adds anything missing and replaces SolarFlow's own functions,
-- triggers and policies in place. It never removes data and leaves tables,
-- functions and policies you added yourself alone. It is not a migration
-- tool: a changed column type or a renamed column is not carried over. The
-- per-client settings (features, pipeline, dropdown lists, owner email)
-- follow from backend/seed.js.
--
-- No customers, staff or sample data are created here. The first login is
-- created in Authentication > Users and becomes the admin (see the
-- "Auth bootstrap" section at the end).

begin;

create schema if not exists solarflow_private;
revoke all on schema solarflow_private from public;
grant usage on schema solarflow_private to authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

-- ═══ Tables ═════════════════════════════════════════════════════════════

-- Login types. `enabled` is set from the client's features by the seed.
-- 'pending' is the placeholder for an account nobody set up (no access, no
-- portal); the seed never enables it.
create table if not exists public.app_roles (
  user_type text primary key,
  label text not null,
  role text not null,
  sort_order integer not null default 0,
  enabled boolean not null default false
);
insert into public.app_roles(user_type, label, role, sort_order, enabled) values
  ('admin', 'Admin', 'Admin', 1, true),
  ('sales', 'Office', 'Office', 2, true),
  ('channel_partner_office', 'Channel Partner Office', 'Channel Partner Office', 3, false),
  ('office2', 'Manager', 'Channel Partner Manager', 4, false),
  ('agent2', 'Dealer', 'Channel Partner', 5, false),
  ('agent', 'Channel Partners', 'Channel Partners', 6, false),
  ('vendor', 'Vendors', 'Vendors', 7, false),
  ('stamp', 'Stamp Maker', 'Stamp', 8, false),
  ('pending', 'Not set up', 'Not set up', 99, false)
on conflict (user_type) do nothing;

-- Keys: features, pipeline, owner_email, client.
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default 'null'::jsonb,
  updated_at timestamptz not null default now()
);

-- One row per login. Created by the auth.users trigger, never by the app.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text,
  phone_number text,
  user_type text not null default 'pending' references public.app_roles(user_type),
  role text not null default '',
  channel_partner text,
  status text not null default 'inactive' check (status in ('active', 'inactive')),
  parent_profile_id uuid references public.profiles(id) on delete set null,
  cpo_profile_id uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles alter column user_type set default 'pending';

-- Customers / projects.
create table if not exists public.admin (
  id uuid primary key default gen_random_uuid(),
  ac_cable numeric,
  adhaar_card_back boolean default false,
  adhaar_card_front boolean default false,
  application_acknowledgment boolean default false,
  application_done_by text,
  bank_branch text,
  bank_details boolean default false,
  bank_name text,
  bom_data jsonb,
  bom_stock_issued_at timestamptz,
  cash_details jsonb default '{}'::jsonb,
  channel_partner text,
  completed_at timestamptz,
  consumer_no text,
  created_at timestamptz not null default now(),
  custom_fields jsonb not null default '{}'::jsonb,
  customer_name text,
  dc_cable numeric,
  dcr_certificate boolean default false,
  deleted_at timestamptz,
  delivery_batch_id text,
  delivery_status text default 'PENDING',
  digital_certificate boolean default false,
  discom_inspection text,
  discom_submission jsonb default '{}'::jsonb,
  district text,
  driver_name text,
  driver_phone_number text,
  email_address text,
  extra_docs boolean default false,
  feasibility_no text,
  feasibilty_document boolean default false,
  file_status text,
  folder_no text,
  follow_ups jsonb default '[]'::jsonb,
  full_address text,
  geo_tag_image boolean default false,
  geo_tag_status text default 'Pending',
  google_drive_link text,
  hold_procurement jsonb default '{}'::jsonb,
  house_geo_tag_photo boolean default false,
  index_2 boolean default false,
  installation_date text,
  installation_note text,
  installation_status text default 'Pending',
  insurance_status boolean default false,
  internal_remarks text,
  inverter_make text,
  inverter_serial_no text,
  invoice_no text,
  invoice_value numeric,
  jansamarth_application_no text,
  lead_creator_profile_id uuid references public.profiles(id) on delete set null,
  light_bill boolean default false,
  loan_by text,
  loan_history jsonb default '[]'::jsonb,
  loan_registration_date text,
  loan_tag text,
  location_link text,
  material_delivery_date text,
  material_order_notes text,
  meter_installation text,
  meter_installation_photo boolean default false,
  module_brand text,
  module_wp numeric,
  no_of_modules numeric,
  pan_card boolean default false,
  panel text,
  panel_serial_no text,
  payment_type text,
  pcr_certificate boolean default false,
  phone_number text,
  pincode text,
  plant_commissioning_report boolean default false,
  pm_surya_ghar_stamp boolean default false,
  registration_by text,
  registration_date text,
  registration_no text,
  roof_shed text,
  sfdc_photo boolean default false,
  sfdc_photo_text text,
  signature_pic boolean default false,
  site_feasibility boolean default false,
  stage text not null default 'LEADS',
  stages_remarks jsonb default '{}'::jsonb,
  stamp boolean default false,
  structure_front_leg_height numeric,
  structure_rear_leg_height numeric,
  sub_channel_partner text,
  sub_divisions text,
  subsidy_history jsonb default '[]'::jsonb,
  subsidy_tag text,
  subsidy_token_photo boolean default false,
  system_capacity_kwp numeric,
  updated_at timestamptz not null default now(),
  vehicle_number text,
  vendor text,
  vendor_feasibility boolean default false,
  vendor_give_up_approved boolean default false,
  vendor_note text,
  vendor_paid_by text,
  vendor_paid_date text,
  vendor_payment_status text default 'Pending',
  vendor_quote numeric,
  villages text,
  warranty_card boolean default false,
  warranty_card_text text
);

-- Dropdown lists (Operations page). Load with is_active = true, order by sort_order.
create table if not exists public.metadata (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  label text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category, label)
);

-- Installers. profile_id links a vendor login to its directory row.
create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  email text,
  phone text,
  profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  phone text,
  vehicle_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  customer_id uuid references public.admin(id) on delete set null,
  action text,
  message text,
  old_value text,
  new_value text,
  details jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.admin(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  file_type text,
  doc_type text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  remark text,
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bom (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.admin(id) on delete cascade,
  bom_type text not null default 'ROOF',
  paper_prepared_by text,
  paper_prepared_date text,
  material_loaded_by text,
  material_loaded_date text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (admin_id, bom_type)
);

create table if not exists public.bom_items (
  id uuid primary key default gen_random_uuid(),
  bom_id uuid not null references public.bom(id) on delete cascade,
  product_name text not null,
  sr_no integer,
  quantity text,
  uom text,
  integration_by text,
  note text,
  stock_quantity numeric(14,3) check (stock_quantity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.delivery_batches (
  id uuid primary key default gen_random_uuid(),
  batch_no text not null unique,
  dispatch_date text,
  driver_name text,
  driver_phone text,
  vehicle_number text,
  rent_amount text,
  car_rent_paid text default 'No',
  car_rent_paid_by text,
  car_rent_paid_at text,
  vendor text,
  notes text,
  status text not null default 'PENDING',
  project_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quotations (
  id uuid primary key default gen_random_uuid(),
  quotation_no bigint generated by default as identity (start with 1001) unique,
  owner_id uuid default auth.uid() references public.profiles(id) on delete set null,
  owner_name_snapshot text,
  owner_phone_snapshot text,
  customer_name text,
  customer_phone text,
  customer_email text,
  full_address text,
  village text,
  taluka text,
  district text,
  pincode text,
  quotation_date date,
  valid_until date,
  capacity_kw numeric,
  project_type text,
  solar_panel_make text,
  solar_panel_qty integer,
  panel_wattage numeric,
  inverter_option text,
  inverter_brand text,
  geb_geda_charge text,
  source_lead_id uuid references public.admin(id) on delete set null,
  converted_lead_id uuid references public.admin(id) on delete set null,
  starting_price numeric,
  schema_version integer not null default 1 check (schema_version = 1),
  quotation_data jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'issued', 'lost', 'converted')),
  issued_at timestamptz,
  converted_at timestamptz,
  lost_at timestamptz,
  lost_reason text,
  lost_remark text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Godown stock. Items are archived, never deleted, so the ledger stays whole.
create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  item_key text not null unique,
  sku text not null unique,
  product_name text not null,
  uom text not null,
  category text not null default 'General',
  stock_on_hand numeric(14,3) not null default 0 check (stock_on_hand >= 0),
  reorder_level numeric(14,3) not null default 0 check (reorder_level >= 0),
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items(id) on delete restrict,
  request_id uuid not null unique,
  kind text not null check (kind in ('opening', 'receipt', 'issue')),
  quantity numeric(14,3) not null check (quantity > 0),
  note text not null,
  customer_id uuid references public.admin(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.staff_attendance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  staff_name text not null,
  role text,
  date date not null,
  status text not null check (status in (
    'present', 'absent', 'half_day', 'leave', 'on_duty', 'pending_present', 'holiday_request', 'holiday'
  )),
  notes text not null default '',
  marked_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_name, date)
);

create table if not exists public.team_chat_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid default auth.uid() references auth.users(id) on delete set null,
  sender_name text not null,
  sender_role text not null default 'Team Member',
  user_type text not null default 'admin',
  text text not null,
  tag text not null default 'General',
  created_at timestamptz not null default now()
);

-- Shared calendar. A vendor's `unavailable` entry blocks delivery on that day.
create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  kind text not null default 'event'
    check (kind in ('event', 'site_visit', 'meeting', 'follow_up', 'leave', 'unavailable')),
  starts_on date not null,
  ends_on date check (ends_on is null or ends_on >= starts_on),
  start_time time,
  end_time time,
  notes text,
  customer_id uuid references public.admin(id) on delete set null,
  vendor_name text,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ═══ Indexes ════════════════════════════════════════════════════════════

create index if not exists admin_stage_live_idx on public.admin(stage, updated_at desc, created_at desc) where deleted_at is null;
create index if not exists admin_lead_creator_idx on public.admin(lead_creator_profile_id);
create index if not exists profiles_parent_idx on public.profiles(parent_profile_id);
create index if not exists profiles_cpo_idx on public.profiles(cpo_profile_id);
create index if not exists profiles_user_type_idx on public.profiles(user_type);
create index if not exists vendors_profile_idx on public.vendors(profile_id);
create index if not exists quotations_list_idx on public.quotations(status, created_at desc);
create index if not exists quotations_owner_idx on public.quotations(owner_id);
create index if not exists documents_customer_idx on public.documents(customer_id);
create index if not exists bom_items_parent_idx on public.bom_items(bom_id);
create index if not exists activity_customer_idx on public.activity_log(customer_id, created_at desc);
create index if not exists activity_user_idx on public.activity_log(user_id);
create index if not exists inventory_movements_customer on public.inventory_movements(customer_id);
create index if not exists inventory_movements_item_idx on public.inventory_movements(item_id);
create index if not exists inventory_items_active_category_idx on public.inventory_items(category, product_name) where archived_at is null;
create index if not exists idx_staff_attendance_date on public.staff_attendance(date);
create index if not exists idx_staff_attendance_user on public.staff_attendance(user_id);
create index if not exists idx_team_chat_messages_created_at on public.team_chat_messages(created_at desc);
create index if not exists calendar_events_starts_idx on public.calendar_events(starts_on);
create index if not exists calendar_events_customer_idx on public.calendar_events(customer_id);

-- ═══ Access helpers (used by row-level security) ════════════════════════
-- SECURITY DEFINER so they can read profiles without recursing into its RLS.

-- The caller's profile while it is active and its login type is switched on;
-- otherwise no row, and every helper below denies access.
create or replace function solarflow_private.my_profile()
returns setof public.profiles language sql stable security definer set search_path = '' as $$
  select p.* from public.profiles p
  join public.app_roles r on r.user_type = p.user_type and r.enabled
  where p.id = auth.uid() and p.status = 'active' and p.user_type <> 'pending';
$$;

create or replace function solarflow_private.my_role()
returns text language sql stable security definer set search_path = '' as $$
  select p.user_type from solarflow_private.my_profile() p;
$$;

create or replace function solarflow_private.is_active()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from solarflow_private.my_profile());
$$;

create or replace function solarflow_private.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(solarflow_private.my_role() = 'admin', false);
$$;

create or replace function solarflow_private.is_head_office()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(solarflow_private.my_role() in ('admin', 'sales'), false);
$$;

-- The partner office (CPO) whose customers the caller may see: a CPO's own
-- id, a manager's parent CPO, otherwise null.
create or replace function solarflow_private.current_cpo()
returns uuid language sql stable security definer set search_path = '' as $$
  select case p.user_type
    when 'channel_partner_office' then p.id
    when 'office2' then p.parent_profile_id
  end
  from solarflow_private.my_profile() p;
$$;

-- A lead belongs to the caller's CPO scope when its creator is the CPO or a
-- login under it (cpo_profile_id is kept by the profiles trigger).
create or replace function solarflow_private.can_view_lead(p_creator uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(exists(
    select 1 from public.profiles c
    where c.id = p_creator and c.cpo_profile_id = solarflow_private.current_cpo()
  ), false);
$$;

-- Customer visibility per login type; mirrors the portal filters. Only
-- admin-set keys decide it: a channel partner's channel_partner, a dealer's
-- name (which only an admin or its office may change) within its partner,
-- and an installer's directory row linked to the login.
create or replace function solarflow_private.can_view_customer(
  p_creator uuid, p_channel_partner text, p_sub_channel_partner text, p_vendor text
)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case p.user_type
      when 'admin' then true
      when 'sales' then true
      when 'channel_partner_office' then solarflow_private.can_view_lead(p_creator)
      when 'office2' then solarflow_private.can_view_lead(p_creator)
      when 'agent' then p_creator = p.id
        or lower(trim(p_channel_partner)) = lower(trim(nullif(trim(p.channel_partner), '')))
      when 'agent2' then p_creator = p.id
        or (lower(trim(p_sub_channel_partner)) = lower(trim(p.name))
            and lower(trim(p_channel_partner)) = lower(trim(p.channel_partner)))
      when 'vendor' then exists(
        select 1 from public.vendors v
        where v.profile_id = p.id and lower(trim(v.name)) = lower(trim(p_vendor))
      )
      else false
    end
    from solarflow_private.my_profile() p
  ), false);
$$;

-- Directory visibility: head office sees everyone, a CPO/manager its own
-- office, an independent channel partner its dealers.
create or replace function solarflow_private.can_view_profile(
  p_id uuid, p_user_type text, p_parent uuid, p_cpo uuid, p_channel_partner text
)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case
      when p.id = p_id then true
      when p.user_type in ('admin', 'sales') then true
      when p.user_type in ('channel_partner_office', 'office2') then p_cpo = solarflow_private.current_cpo()
      when p.user_type = 'agent' then p_user_type = 'agent2'
        and (p_parent = p.id or lower(trim(p_channel_partner)) = lower(trim(nullif(trim(p.channel_partner), ''))))
      else false
    end
    from solarflow_private.my_profile() p
  ), false);
$$;

create or replace function solarflow_private.feature_on(p_feature text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select s.value ->> p_feature from public.app_settings s where s.key = 'features') = 'true', false);
$$;

-- ═══ Triggers ═══════════════════════════════════════════════════════════

create or replace function solarflow_private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'app_settings', 'profiles', 'admin', 'metadata', 'vendors', 'drivers', 'activity_log', 'documents',
    'bom', 'bom_items', 'delivery_batches', 'quotations', 'staff_attendance', 'calendar_events'
  ] loop
    execute format('drop trigger if exists touch_updated_at on public.%I', t);
    execute format('create trigger touch_updated_at before update on public.%I for each row execute function solarflow_private.touch_updated_at()', t);
  end loop;
end $$;

-- Inserts that send null timestamps get now() instead of a NOT NULL error.
create or replace function solarflow_private.ensure_admin_timestamps()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.created_at := coalesce(new.created_at, now());
  new.updated_at := coalesce(new.updated_at, now());
  return new;
end $$;
drop trigger if exists ensure_admin_timestamps on public.admin;
create trigger ensure_admin_timestamps before insert on public.admin
  for each row execute function solarflow_private.ensure_admin_timestamps();

-- completed_at follows the stage on every path, not only move_stage.
create or replace function solarflow_private.stamp_completed_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.stage = 'COMPLETED' then
    if tg_op = 'INSERT' or old.stage is distinct from 'COMPLETED' then
      new.completed_at := coalesce(case when tg_op = 'INSERT' then new.completed_at end, now());
    end if;
  else
    new.completed_at := null;
  end if;
  return new;
end $$;
drop trigger if exists stamp_completed_at on public.admin;
create trigger stamp_completed_at before insert or update of stage on public.admin
  for each row execute function solarflow_private.stamp_completed_at();

-- Lead ownership. Partner logins always create leads as themselves (a CPO or
-- manager as their office); admin_column_guard keeps reassignment with head office.
create or replace function solarflow_private.assign_lead_creator()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles;
  office public.profiles;
begin
  if auth.uid() is null then
    return new;
  end if;
  select * into p from solarflow_private.my_profile();
  if p.user_type in ('channel_partner_office', 'office2') then
    select * into office from public.profiles where id = solarflow_private.current_cpo();
    if office.id is null then
      raise exception 'Your partner office is not set up. Ask an admin to link your login.';
    end if;
    new.lead_creator_profile_id := office.id;
    new.channel_partner := office.channel_partner;
    new.sub_channel_partner := null;
  elsif p.user_type = 'agent2' then
    new.lead_creator_profile_id := p.id;
    new.channel_partner := p.channel_partner;
    new.sub_channel_partner := p.name;
  elsif p.user_type = 'agent' then
    new.lead_creator_profile_id := p.id;
    new.channel_partner := coalesce(nullif(trim(p.channel_partner), ''), p.name);
  else
    new.lead_creator_profile_id := coalesce(new.lead_creator_profile_id, p.id);
  end if;
  return new;
end $$;
drop trigger if exists assign_lead_creator on public.admin;
create trigger assign_lead_creator before insert on public.admin
  for each row execute function solarflow_private.assign_lead_creator();

-- cpo_profile_id: a CPO is its own office; managers and dealers belong to their parent.
create or replace function solarflow_private.profiles_set_cpo()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.cpo_profile_id := case
    when new.user_type = 'channel_partner_office' then new.id
    when new.user_type in ('office2', 'agent2') then new.parent_profile_id
  end;
  return new;
end $$;
drop trigger if exists profiles_set_cpo on public.profiles;
create trigger profiles_set_cpo before insert or update of user_type, parent_profile_id on public.profiles
  for each row execute function solarflow_private.profiles_set_cpo();

-- Signed-in users other than admins may edit the phone number only. The name
-- decides which leads a dealer sees, so only an admin, or a partner office
-- for the managers and dealers under it, may change it.
-- The service role and SQL Editor (not authenticated/anon) are trusted.
create or replace function solarflow_private.profiles_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') and not solarflow_private.is_admin() then
    if new.id is distinct from old.id
      or new.user_type is distinct from old.user_type
      or new.role is distinct from old.role
      or new.status is distinct from old.status
      or new.email is distinct from old.email
      or new.channel_partner is distinct from old.channel_partner
      or new.parent_profile_id is distinct from old.parent_profile_id
      or new.cpo_profile_id is distinct from old.cpo_profile_id
      or new.created_by is distinct from old.created_by
    then
      raise exception 'Only an admin can change login type, status, email or partner' using errcode = '42501';
    end if;
    if new.name is distinct from old.name and not (
      old.user_type in ('office2', 'agent2')
      and old.cpo_profile_id = auth.uid()
      and solarflow_private.my_role() = 'channel_partner_office'
    ) then
      raise exception 'Only an admin can change a login name' using errcode = '42501';
    end if;
  end if;
  if old.user_type = 'admin' and old.status = 'active'
    and (new.user_type <> 'admin' or new.status <> 'active')
    and not exists(select 1 from public.profiles p where p.user_type = 'admin' and p.status = 'active' and p.id <> old.id)
  then
    raise exception 'Keep at least one active admin';
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function solarflow_private.profiles_guard();

-- Linking an installer row to a login decides which jobs that login sees, so
-- only an admin (or add_user) may set or change vendors.profile_id.
create or replace function solarflow_private.vendors_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (tg_op = 'INSERT' and new.profile_id is not null)
    or (tg_op = 'UPDATE' and new.profile_id is distinct from old.profile_id)
  then
    if current_user in ('authenticated', 'anon') and not solarflow_private.is_admin() then
      raise exception 'Only an admin can link an installer to a login' using errcode = '42501';
    end if;
    if new.profile_id is not null
      and not exists(select 1 from public.profiles p where p.id = new.profile_id and p.user_type = 'vendor')
    then
      raise exception 'An installer can only be linked to a vendor login';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists vendors_guard on public.vendors;
create trigger vendors_guard before insert or update on public.vendors
  for each row execute function solarflow_private.vendors_guard();

-- Partner and installer logins may edit project details, but payments, stock,
-- delivery batches, ownership and Trash stay with head office. Installers may
-- also set the delivery status. Named to run before the other admin triggers,
-- so the stock stamp written by issue_delivered_bom_stock is not refused.
create or replace function solarflow_private.admin_column_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user not in ('authenticated', 'anon') or solarflow_private.is_head_office() then
    return new;
  end if;
  if new.vendor_payment_status is distinct from old.vendor_payment_status
    or new.vendor_quote is distinct from old.vendor_quote
    or new.vendor_paid_date is distinct from old.vendor_paid_date
    or new.vendor_paid_by is distinct from old.vendor_paid_by
    or new.bom_stock_issued_at is distinct from old.bom_stock_issued_at
    or new.deleted_at is distinct from old.deleted_at
    or new.delivery_batch_id is distinct from old.delivery_batch_id
    or new.lead_creator_profile_id is distinct from old.lead_creator_profile_id
  then
    raise exception 'Only head office can change payments, stock, delivery batches, lead ownership or Trash'
      using errcode = '42501';
  end if;
  if new.delivery_status is distinct from old.delivery_status
    and solarflow_private.my_role() is distinct from 'vendor'
  then
    raise exception 'Only head office or the installer can change the delivery status' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists admin_column_guard on public.admin;
create trigger admin_column_guard before update on public.admin
  for each row execute function solarflow_private.admin_column_guard();

-- Who wrote a calendar entry or chat message comes from the writer's profile,
-- never from the request. A linked customer must be one the writer can see.
-- Inactive callers pass through untouched; row-level security refuses them.
create or replace function solarflow_private.calendar_attribution()
returns trigger language plpgsql set search_path = '' as $$
declare
  me public.profiles;
  own_vendor text;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  select * into me from solarflow_private.my_profile();
  if me.id is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.created_by_name := me.name;
  else
    new.created_by := old.created_by;
    new.created_by_name := old.created_by_name;
  end if;

  if me.user_type = 'vendor' then
    new.vendor_name := null;
    if new.kind = 'unavailable' then
      select v.name into own_vendor from public.vendors v where v.profile_id = me.id order by v.name limit 1;
      if own_vendor is null then
        raise exception 'Your login is not linked to an installer yet. Ask an admin to link it in Operations.';
      end if;
      new.vendor_name := own_vendor;
    end if;
  elsif me.user_type not in ('admin', 'sales') then
    new.vendor_name := case when tg_op = 'UPDATE' then old.vendor_name end;
  end if;

  if new.customer_id is not null
    and (tg_op = 'INSERT' or new.customer_id is distinct from old.customer_id)
    and not exists(select 1 from public.admin a where a.id = new.customer_id)
  then
    raise exception 'You can only link a customer you can see' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists calendar_attribution on public.calendar_events;
create trigger calendar_attribution before insert or update on public.calendar_events
  for each row execute function solarflow_private.calendar_attribution();

create or replace function solarflow_private.chat_attribution()
returns trigger language plpgsql set search_path = '' as $$
declare me public.profiles;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  select * into me from solarflow_private.my_profile();
  if me.id is not null then
    new.sender_name := me.name;
    new.sender_role := coalesce(nullif(trim(me.role), ''), 'Team Member');
    new.user_type := me.user_type;
  end if;
  return new;
end $$;
drop trigger if exists chat_attribution on public.team_chat_messages;
create trigger chat_attribution before insert on public.team_chat_messages
  for each row execute function solarflow_private.chat_attribution();

create or replace function solarflow_private.quotation_links_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user not in ('authenticated', 'anon') or not solarflow_private.is_active() then
    return new;
  end if;
  if (new.source_lead_id is not null
      and (tg_op = 'INSERT' or new.source_lead_id is distinct from old.source_lead_id)
      and not exists(select 1 from public.admin a where a.id = new.source_lead_id))
    or (new.converted_lead_id is not null
      and (tg_op = 'INSERT' or new.converted_lead_id is distinct from old.converted_lead_id)
      and not exists(select 1 from public.admin a where a.id = new.converted_lead_id))
  then
    raise exception 'You can only link a quotation to a customer you can see' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists quotation_links_guard on public.quotations;
create trigger quotation_links_guard before insert or update on public.quotations
  for each row execute function solarflow_private.quotation_links_guard();

-- ═══ Inventory (stock follows BOMs; deducted when a delivery is marked Delivered) ═══

create or replace function public.inventory_item_key(p_name text, p_unit text)
returns text language sql immutable set search_path = '' as $$
  select (case regexp_replace(lower(trim(p_name)), '\s+', ' ', 'g')
            when '16sq mm la cabel' then '16sq mm la cable'
            when 'condute pipe' then 'conduite pipe'
            else regexp_replace(lower(trim(p_name)), '\s+', ' ', 'g') end)
    || '|' || (case when lower(trim(p_unit)) in ('no.', 'nos', 'no', 'nos.') then 'Nos' else trim(p_unit) end);
$$;

create or replace function public.sync_inventory_catalog()
returns void language sql security invoker set search_path = '' as $$
  insert into public.inventory_items(item_key, sku, product_name, uom)
  select distinct on (public.inventory_item_key(product_name, uom))
    public.inventory_item_key(product_name, uom),
    'BOM-' || substr(md5(public.inventory_item_key(product_name, uom)), 1, 12),
    product_name,
    case when lower(trim(uom)) in ('no.', 'nos', 'no', 'nos.') then 'Nos' else trim(uom) end
  from public.bom_items
  where nullif(trim(uom), '') is not null
  order by public.inventory_item_key(product_name, uom), id
  on conflict (item_key) do nothing;
$$;

-- Definer: a BOM may be saved by a login that cannot write the catalogue.
create or replace function solarflow_private.sync_inventory_catalog_after_bom_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.sync_inventory_catalog();
  return null;
end $$;
drop trigger if exists sync_inventory_catalog_after_bom_change on public.bom_items;
create trigger sync_inventory_catalog_after_bom_change
  after insert or update of product_name, uom on public.bom_items
  for each statement execute function solarflow_private.sync_inventory_catalog_after_bom_change();

create or replace function public.record_inventory_movement(
  p_item_id uuid, p_kind text, p_quantity numeric, p_note text, p_request_id uuid
)
returns public.inventory_items language plpgsql security invoker set search_path = '' as $$
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

  select * into item from public.inventory_items where id = p_item_id for update;
  if not found then
    raise exception 'Inventory item unavailable';
  end if;

  select * into previous from public.inventory_movements where request_id = p_request_id;
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
  values (item.id, p_request_id, p_kind, p_quantity, trim(p_note));

  return item;
end $$;

create or replace function public.bom_stock_document(p_customer_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  c public.admin;
  b public.bom;
  items jsonb;
  kind text;
begin
  select * into c from public.admin where id = p_customer_id and deleted_at is null;
  if not found then
    raise exception 'Project unavailable';
  end if;

  kind := case when upper(c.roof_shed) = 'SHED' then 'SHED' else 'ROOF' end;
  if jsonb_typeof(c.bom_data->'items') = 'array'
    and coalesce(c.bom_data->'bom'->>'bom_type', c.bom_data->>'bom_type', kind) = kind
  then
    return c.bom_data;
  end if;

  select * into b from public.bom where admin_id = c.id and bom_type = kind order by created_at desc limit 1;

  select coalesce(jsonb_agg(to_jsonb(i) order by sr_no, id), '[]'::jsonb) into items
  from public.bom_items i where bom_id = b.id;

  return jsonb_build_object('bom', to_jsonb(b), 'items', items);
end $$;

create or replace function public.get_inventory_bom_lines()
returns jsonb language sql stable security invoker set search_path = '' as $$
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
  cross join lateral jsonb_array_elements(public.bom_stock_document(c.id)->'items') with ordinality as l(line, ordinality)
  where c.deleted_at is null;
$$;

create or replace function public.set_bom_stock_quantity(
  p_customer_id uuid, p_line_index integer, p_quantity numeric, p_expected_line jsonb
)
returns void language plpgsql security invoker set search_path = '' as $$
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

  select * into c from public.admin where id = p_customer_id and deleted_at is null for update;
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
end $$;

-- Definer so an installer marking Delivered still deducts stock; the admin
-- row itself was already checked by RLS. Does nothing while inventory is off.
create or replace function solarflow_private.issue_delivered_bom_stock()
returns trigger language plpgsql security definer set search_path = '' as $$
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
    or not solarflow_private.feature_on('inventory')
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

    select * into item from public.inventory_items
    where item_key = public.inventory_item_key(line->>'product_name', line->>'uom');
    if not found then
      raise exception 'Add a unit and save the BOM for %', line->>'product_name';
    end if;
    demands := jsonb_set(demands, array[item.id::text], to_jsonb(coalesce((demands->>item.id::text)::numeric, 0) + amount));
  end loop;

  for r in select key, value from jsonb_each_text(demands) order by key loop
    select * into item from public.inventory_items where id = r.key::uuid for update;
    if item.stock_on_hand < r.value::numeric then
      raise exception 'Insufficient % for %: need %, available % %. Add quantity in Godown.',
        item.product_name, new.customer_name, r.value, item.stock_on_hand, item.uom;
    end if;

    movement_request_id := gen_random_uuid();
    perform public.record_inventory_movement(
      item.id, 'issue', r.value::numeric,
      'BOM delivery: ' || new.customer_name || ' (' || new.id || ')',
      movement_request_id
    );
    update public.inventory_movements set customer_id = new.id where request_id = movement_request_id;
  end loop;

  new.bom_stock_issued_at := now();
  return new;
end $$;
drop trigger if exists issue_delivered_bom_stock on public.admin;
create trigger issue_delivered_bom_stock before update of delivery_status on public.admin
  for each row execute function solarflow_private.issue_delivered_bom_stock();

-- ═══ Delivery batches (one transaction per save / disband / status change) ═══

create or replace function public.save_delivery_batch_atomic(p_batch jsonb, p_selected_project_ids uuid[], p_removed_project_ids uuid[])
returns jsonb language plpgsql security invoker set search_path = '' as $$
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
    from unnest(b.project_ids) id where not (id = any(selected));
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
  values (
    bid, batch_number, p_batch->>'dispatch_date', p_batch->>'driver_name',
    p_batch->>'driver_phone', p_batch->>'vehicle_number', p_batch->>'rent_amount',
    coalesce(p_batch->>'car_rent_paid', 'No'), p_batch->>'vendor', p_batch->>'notes',
    coalesce(p_batch->>'status', 'IN_TRANSIT'), selected
  )
  on conflict (id) do update set
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
end $$;

create or replace function public.delete_delivery_batch_atomic(p_batch_id uuid, p_project_ids uuid[])
returns jsonb language plpgsql security invoker set search_path = '' as $$
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
end $$;

create or replace function public.update_delivery_batch_status_atomic(p_batch_id uuid, p_new_status text, p_project_ids uuid[])
returns jsonb language plpgsql security invoker set search_path = '' as $$
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

  update public.delivery_batches set status = p_new_status, updated_at = now() where id = b.id;
  return jsonb_build_object('success', true, 'projects_expected', expected, 'projects_missing', 0);
end $$;

-- ═══ Dashboard metrics and stage moves ══════════════════════════════════
-- COMPLETED, LOST PROJECT and INSTALLATION STATUS are fixed stage ids.

create or replace function public.get_dashboard_metrics_scoped(p_channel_partner text default null, p_dealer text default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with rows as (
    select * from public.admin where deleted_at is null
      and (nullif(p_channel_partner, '') is null or channel_partner = p_channel_partner)
      and (nullif(p_dealer, '') is null or sub_channel_partner = p_dealer)
  ), counts as (select stage, count(*) as n from rows group by stage)
  select jsonb_build_object(
    'totalProjects', count(*),
    'completedCount', count(*) filter (where stage = 'COMPLETED'),
    'liveProjects', count(*) filter (where stage not in ('COMPLETED', 'LOST PROJECT')),
    'loanCount', count(*) filter (where lower(payment_type) = 'loan'),
    'cashCount', count(*) filter (where lower(payment_type) = 'cash'),
    'loanTagCount', count(*) filter (where nullif(loan_tag, '') is not null),
    'subsidyTagCount', count(*) filter (where nullif(subsidy_tag, '') is not null),
    'installationTagCount', count(*) filter (where stage = 'INSTALLATION STATUS'),
    'stageCounts', coalesce((select jsonb_object_agg(stage, n) from counts), '{}'::jsonb)
  ) from rows;
$$;

create or replace function public.get_dashboard_metrics(p_channel_partner text default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select public.get_dashboard_metrics_scoped(p_channel_partner, null);
$$;

create or replace function public.get_cpo_dashboard_metrics(p_dealer text default null)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if solarflow_private.current_cpo() is null then
    raise exception 'Only a partner office login can view these totals';
  end if;
  return public.get_dashboard_metrics_scoped(null, p_dealer);
end $$;

-- The new stage must be in app_settings.pipeline (built-in or custom). Before
-- the seed has run, any well-formed stage id is accepted.
create or replace function public.move_stage(p_customer_id uuid, p_new_stage text, p_old_stage text, p_remark text default '')
returns public.admin language plpgsql security invoker set search_path = '' as $$
declare
  pipeline jsonb := (select value from public.app_settings where key = 'pipeline');
  moved public.admin;
begin
  if p_new_stage is null or p_old_stage is null then
    raise exception 'Unknown stage';
  end if;
  if jsonb_typeof(pipeline->'stages') = 'array' and jsonb_array_length(pipeline->'stages') > 0 then
    if not ((pipeline->'stages') ? p_new_stage or coalesce(pipeline->'terminal', '[]'::jsonb) ? p_new_stage) then
      raise exception 'Unknown stage: %', p_new_stage;
    end if;
  elsif p_new_stage !~ '^[A-Z][A-Z0-9 ]{1,39}$' then
    raise exception 'Unknown stage: %', p_new_stage;
  end if;

  update public.admin set
    stage = p_new_stage,
    stages_remarks = coalesce(stages_remarks, '{}'::jsonb) || jsonb_build_object(p_old_stage, '')
  where id = p_customer_id and stage = p_old_stage and deleted_at is null
  returning * into moved;
  if not found then
    raise exception 'Record unavailable or stage changed; refresh first';
  end if;

  insert into public.activity_log(user_id, customer_id, action, message, new_value)
  values (auth.uid(), p_customer_id, 'stage_change', p_old_stage || ' → ' || p_new_stage, coalesce(p_remark, ''));
  return moved;
end $$;

-- Merges extra-field values into admin.custom_fields; a null value removes the key.
create or replace function public.merge_custom_fields(p_customer_id uuid, p_values jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  bad_key text;
  merged jsonb;
begin
  if p_values is null or jsonb_typeof(p_values) <> 'object' then
    raise exception 'Extra field values must be an object';
  end if;
  select k into bad_key from jsonb_object_keys(p_values) k where k !~ '^[a-z][a-z0-9_]{1,39}$' limit 1;
  if bad_key is not null then
    raise exception 'Invalid extra field key: %', bad_key;
  end if;

  update public.admin set custom_fields = (coalesce(custom_fields, '{}'::jsonb) || p_values)
    - coalesce((select array_agg(e.key) from jsonb_each(p_values) e where jsonb_typeof(e.value) = 'null'), '{}'::text[])
  where id = p_customer_id and deleted_at is null
  returning custom_fields into merged;
  if not found then
    raise exception 'Record unavailable; refresh first';
  end if;
  return merged;
end $$;

-- ═══ Row-level security ═════════════════════════════════════════════════
-- SolarFlow's own tables. Policies on these are rebuilt on every run, so the
-- set below is always the whole set (a policy left over from an older version
-- could otherwise widen access). Other tables in the project are not touched.

create or replace function solarflow_private.own_tables()
returns text[] language sql immutable set search_path = '' as $$
  select array[
    'app_roles', 'app_settings', 'profiles', 'admin', 'metadata', 'vendors', 'drivers', 'activity_log',
    'documents', 'bom', 'bom_items', 'delivery_batches', 'quotations', 'inventory_items',
    'inventory_movements', 'staff_attendance', 'team_chat_messages', 'calendar_events'
  ];
$$;

do $$
declare
  t text;
  pol record;
begin
  foreach t in array solarflow_private.own_tables() loop
    execute format('alter table public.%I enable row level security', t);
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', pol.policyname, t);
    end loop;
  end loop;
end $$;

create policy app_roles_read on public.app_roles for select to authenticated using (true);
create policy app_settings_read on public.app_settings for select to authenticated
  using ((select solarflow_private.is_active()));

create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid())
         or solarflow_private.can_view_profile(id, user_type, parent_profile_id, cpo_profile_id, channel_partner));
create policy profiles_update on public.profiles for update to authenticated
  using ((select solarflow_private.is_admin())
         or (id = (select auth.uid()) and (select solarflow_private.is_active()))
         or (user_type in ('office2', 'agent2') and cpo_profile_id = (select auth.uid())
             and (select solarflow_private.my_role()) = 'channel_partner_office'))
  with check ((select solarflow_private.is_admin())
         or (id = (select auth.uid()) and (select solarflow_private.is_active()))
         or (user_type in ('office2', 'agent2') and cpo_profile_id = (select auth.uid())
             and (select solarflow_private.my_role()) = 'channel_partner_office'));
create policy profiles_delete on public.profiles for delete to authenticated
  using ((select solarflow_private.is_admin()) and id <> (select auth.uid()));

create policy admin_read on public.admin for select to authenticated
  using ((select solarflow_private.is_head_office())
         or solarflow_private.can_view_customer(lead_creator_profile_id, channel_partner, sub_channel_partner, vendor));
create policy admin_insert on public.admin for insert to authenticated
  with check ((select solarflow_private.my_role()) in ('admin', 'sales', 'channel_partner_office', 'office2', 'agent', 'agent2')
         and solarflow_private.can_view_customer(lead_creator_profile_id, channel_partner, sub_channel_partner, vendor));
create policy admin_update on public.admin for update to authenticated
  using ((select solarflow_private.is_head_office())
         or solarflow_private.can_view_customer(lead_creator_profile_id, channel_partner, sub_channel_partner, vendor))
  with check ((select solarflow_private.is_head_office())
         or solarflow_private.can_view_customer(lead_creator_profile_id, channel_partner, sub_channel_partner, vendor));
create policy admin_delete on public.admin for delete to authenticated
  using ((select solarflow_private.is_admin()));

-- Documents and BOMs follow the visibility of their customer.
create policy documents_by_customer on public.documents for all to authenticated
  using (exists(select 1 from public.admin a where a.id = customer_id))
  with check (exists(select 1 from public.admin a where a.id = customer_id));
create policy bom_by_customer on public.bom for all to authenticated
  using (exists(select 1 from public.admin a where a.id = admin_id))
  with check (exists(select 1 from public.admin a where a.id = admin_id));
create policy bom_items_by_bom on public.bom_items for all to authenticated
  using (exists(select 1 from public.bom b where b.id = bom_id))
  with check (exists(select 1 from public.bom b where b.id = bom_id));

do $$
declare t text;
begin
  foreach t in array array['metadata', 'vendors', 'drivers'] loop
    execute format('create policy %I on public.%I for select to authenticated using ((select solarflow_private.is_active()))', t || '_read', t);
    execute format('create policy %I on public.%I for all to authenticated using ((select solarflow_private.is_head_office())) with check ((select solarflow_private.is_head_office()))', t || '_write', t);
  end loop;
  foreach t in array array['delivery_batches', 'inventory_items', 'inventory_movements'] loop
    execute format('create policy %I on public.%I for all to authenticated using ((select solarflow_private.is_head_office())) with check ((select solarflow_private.is_head_office()))', t || '_head_office', t);
  end loop;
end $$;

create policy activity_read on public.activity_log for select to authenticated
  using ((select solarflow_private.is_head_office())
         or (user_id = (select auth.uid()) and (select solarflow_private.is_active()))
         or (customer_id is not null and exists(select 1 from public.admin a where a.id = customer_id)));
create policy activity_insert on public.activity_log for insert to authenticated
  with check (user_id = (select auth.uid()) and (select solarflow_private.is_active())
              and (customer_id is null or exists(select 1 from public.admin a where a.id = customer_id)));

create policy quotations_access on public.quotations for all to authenticated
  using ((owner_id = (select auth.uid()) and (select solarflow_private.is_active()))
         or (select solarflow_private.is_head_office())
         or solarflow_private.can_view_lead(owner_id))
  with check ((owner_id = (select auth.uid()) and (select solarflow_private.is_active()))
         or (select solarflow_private.is_head_office())
         or solarflow_private.can_view_lead(owner_id));

-- Head office marks anyone; staff may only file their own pending requests.
create policy attendance_read on public.staff_attendance for select to authenticated
  using ((select solarflow_private.is_head_office())
         or (user_id = (select auth.uid()) and (select solarflow_private.is_active())));
create policy attendance_head_office on public.staff_attendance for all to authenticated
  using ((select solarflow_private.is_head_office()))
  with check ((select solarflow_private.is_head_office()));
create policy attendance_own_request on public.staff_attendance for all to authenticated
  using (user_id = (select auth.uid()) and (select solarflow_private.is_active())
         and status in ('pending_present', 'holiday_request'))
  with check (user_id = (select auth.uid()) and (select solarflow_private.is_active())
              and status in ('pending_present', 'holiday_request'));

create policy chat_read on public.team_chat_messages for select to authenticated
  using ((select solarflow_private.is_active()));
create policy chat_insert on public.team_chat_messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and (select solarflow_private.is_active()));
create policy chat_delete on public.team_chat_messages for delete to authenticated
  using ((sender_id = (select auth.uid()) and (select solarflow_private.is_active()))
         or (select solarflow_private.is_admin()));

create policy calendar_read on public.calendar_events for select to authenticated
  using ((select solarflow_private.is_active()));
create policy calendar_insert on public.calendar_events for insert to authenticated
  with check (created_by = (select auth.uid()) and (select solarflow_private.is_active()));
create policy calendar_update on public.calendar_events for update to authenticated
  using ((created_by = (select auth.uid()) and (select solarflow_private.is_active()))
         or (select solarflow_private.is_head_office()))
  with check ((created_by = (select auth.uid()) and (select solarflow_private.is_active()))
         or (select solarflow_private.is_head_office()));
create policy calendar_delete on public.calendar_events for delete to authenticated
  using ((created_by = (select auth.uid()) and (select solarflow_private.is_active()))
         or (select solarflow_private.is_head_office()));

-- ═══ Storage: private customer documents (<customer id>/<file>) ══════════

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema not found; skipped the customer-documents bucket';
    return;
  end if;
  insert into storage.buckets(id, name, public, file_size_limit)
  values ('customer-documents', 'customer-documents', false, 20971520)
  on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

  drop policy if exists solarflow_document_read on storage.objects;
  drop policy if exists solarflow_document_insert on storage.objects;
  drop policy if exists solarflow_document_update on storage.objects;
  drop policy if exists solarflow_document_delete on storage.objects;
  create policy solarflow_document_read on storage.objects for select to authenticated
    using (bucket_id = 'customer-documents'
           and exists(select 1 from public.admin c where c.id::text = (storage.foldername(name))[1]));
  create policy solarflow_document_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'customer-documents'
                and exists(select 1 from public.admin c where c.id::text = (storage.foldername(name))[1]));
  create policy solarflow_document_update on storage.objects for update to authenticated
    using (bucket_id = 'customer-documents'
           and exists(select 1 from public.admin c where c.id::text = (storage.foldername(name))[1]))
    with check (bucket_id = 'customer-documents'
                and exists(select 1 from public.admin c where c.id::text = (storage.foldername(name))[1]));
  create policy solarflow_document_delete on storage.objects for delete to authenticated
    using (bucket_id = 'customer-documents'
           and exists(select 1 from public.admin c where c.id::text = (storage.foldername(name))[1]));
exception when insufficient_privilege then
  raise warning 'Could not create the storage policies for customer-documents (%). Document uploads stay blocked until they exist.', sqlerrm;
end $$;

-- ═══ Realtime ═══════════════════════════════════════════════════════════

do $$
declare t text;
begin
  if not exists(select 1 from pg_publication where pubname = 'supabase_realtime' and not puballtables) then
    return;
  end if;
  foreach t in array array['admin', 'delivery_batches', 'activity_log', 'team_chat_messages', 'calendar_events'] loop
    if not exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ═══ Auth bootstrap ═════════════════════════════════════════════════════
-- Every auth user gets a profile:
-- 1. while no active admin exists, the owner email (or, if no owner email is
--    set, the first user) becomes the active admin;
-- 2. users made by the add_user function take their login type from
--    app_metadata, which only the service role can write;
-- 3. anyone else is an inactive 'pending' placeholder with no access until an
--    admin gives it a login type and activates it.

create or replace function solarflow_private.provision_profile(p_id uuid, p_email text, p_app jsonb, p_user jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_owner text := lower(trim(coalesce((select s.value #>> '{}' from public.app_settings s where s.key = 'owner_email'), '')));
  v_email text := lower(trim(coalesce(p_email, '')));
  display_name text := coalesce(nullif(trim(p_app->>'name'), ''), nullif(trim(p_user->>'name'), ''),
                                nullif(split_part(v_email, '@', 1), ''), 'User');
  granted public.app_roles;
  parent uuid;
  creator uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('solarflow_profile_bootstrap', 0));

  if not exists(select 1 from public.profiles where user_type = 'admin' and status = 'active')
    and (v_owner = '' or v_email = v_owner)
  then
    insert into public.profiles(id, name, email, user_type, role, status)
    values (p_id, display_name, nullif(v_email, ''), 'admin', 'Admin', 'active')
    on conflict (id) do update set user_type = 'admin', role = 'Admin', status = 'active';
    return;
  end if;

  if p_app->>'created_via' = 'add_user' then
    select * into granted from public.app_roles where user_type = p_app->>'user_type' and enabled;
  end if;
  if granted.user_type is not null then
    if p_app->>'parent_profile_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select id into parent from public.profiles where id = (p_app->>'parent_profile_id')::uuid;
    end if;
    if p_app->>'created_by' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select id into creator from public.profiles where id = (p_app->>'created_by')::uuid;
    end if;
    -- A channel partner's key defaults to its name, as in add_user.
    insert into public.profiles(id, name, email, user_type, role, channel_partner, parent_profile_id, created_by, status)
    values (p_id, display_name, nullif(v_email, ''), granted.user_type, coalesce(nullif(trim(p_app->>'role'), ''), granted.role),
            coalesce(nullif(trim(p_app->>'channel_partner'), ''), case when granted.user_type = 'agent' then display_name end),
            parent, creator, 'active')
    -- Only an inactive placeholder is upgraded; an existing login is never changed here.
    on conflict (id) do update set
      name = excluded.name, user_type = excluded.user_type, role = excluded.role,
      channel_partner = excluded.channel_partner, parent_profile_id = excluded.parent_profile_id,
      created_by = excluded.created_by, status = 'active'
    where public.profiles.status = 'inactive' and public.profiles.user_type <> 'admin';
    return;
  end if;

  insert into public.profiles(id, name, email, user_type, role, status)
  values (p_id, display_name, nullif(v_email, ''), 'pending', 'Not set up', 'inactive')
  on conflict (id) do nothing;
end $$;

create or replace function solarflow_private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform solarflow_private.provision_profile(new.id, new.email, new.raw_app_meta_data, new.raw_user_meta_data);
  return new;
end $$;

-- Supabase may write app_metadata just after the insert, so a later
-- created_via = 'add_user' is applied too.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function solarflow_private.handle_new_user();
drop trigger if exists on_auth_user_app_metadata on auth.users;
create trigger on_auth_user_app_metadata after update of raw_app_meta_data on auth.users
  for each row
  when (new.raw_app_meta_data->>'created_via' = 'add_user'
        and old.raw_app_meta_data->>'created_via' is distinct from 'add_user')
  execute function solarflow_private.handle_new_user();

-- Users that existed before this script ran, oldest first. Waits for the
-- seed on a first run so the owner email is known.
create or replace function solarflow_private.backfill_profiles()
returns void language plpgsql security definer set search_path = '' as $$
declare u record;
begin
  for u in
    select au.id, au.email, au.raw_app_meta_data, au.raw_user_meta_data from auth.users au
    where not exists(select 1 from public.profiles p where p.id = au.id)
    order by au.created_at, au.id
  loop
    perform solarflow_private.provision_profile(u.id, u.email, u.raw_app_meta_data, u.raw_user_meta_data);
  end loop;
end $$;

do $$
begin
  if exists(select 1 from public.app_settings where key = 'owner_email') then
    perform solarflow_private.backfill_profiles();
  end if;
end $$;

-- ═══ CPO view (last: `select *` freezes the admin column list) ══════════

drop view if exists public.cpo_leads;
create view public.cpo_leads with (security_invoker = true) as
  select * from public.admin
  where solarflow_private.current_cpo() is not null
    and solarflow_private.can_view_lead(lead_creator_profile_id);

-- ═══ Grants ═════════════════════════════════════════════════════════════
-- Reset on SolarFlow's own tables and functions only, then granted below.

do $$
declare
  t text;
  f regprocedure;
begin
  foreach t in array solarflow_private.own_tables() || array['cpo_leads'] loop
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any(array[
      'move_stage', 'merge_custom_fields', 'get_dashboard_metrics_scoped', 'get_dashboard_metrics',
      'get_cpo_dashboard_metrics', 'inventory_item_key', 'sync_inventory_catalog', 'record_inventory_movement',
      'bom_stock_document', 'get_inventory_bom_lines', 'set_bom_stock_quantity', 'save_delivery_batch_atomic',
      'delete_delivery_batch_atomic', 'update_delivery_batch_status_atomic'
    ])
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;
revoke all on sequence public.quotations_quotation_no_seq from anon, authenticated;
grant all on sequence public.quotations_quotation_no_seq to service_role;

grant select on public.app_roles, public.app_settings, public.cpo_leads to authenticated;
grant select, update, delete on public.profiles to authenticated;
grant select, insert on public.activity_log, public.inventory_movements to authenticated;
grant select, insert, update on public.inventory_items to authenticated;
grant select, insert, delete on public.team_chat_messages to authenticated;
grant select, insert, update, delete on
  public.admin, public.metadata, public.vendors, public.drivers, public.documents, public.bom, public.bom_items,
  public.delivery_batches, public.quotations, public.staff_attendance, public.calendar_events
to authenticated;
grant usage, select on sequence public.quotations_quotation_no_seq to authenticated;

revoke all on all functions in schema solarflow_private from public, anon, authenticated;
grant execute on function
  public.move_stage(uuid, text, text, text),
  public.merge_custom_fields(uuid, jsonb),
  public.get_dashboard_metrics_scoped(text, text),
  public.get_dashboard_metrics(text),
  public.get_cpo_dashboard_metrics(text),
  public.inventory_item_key(text, text),
  public.sync_inventory_catalog(),
  public.record_inventory_movement(uuid, text, numeric, text, uuid),
  public.bom_stock_document(uuid),
  public.get_inventory_bom_lines(),
  public.set_bom_stock_quantity(uuid, integer, numeric, jsonb),
  public.save_delivery_batch_atomic(jsonb, uuid[], uuid[]),
  public.delete_delivery_batch_atomic(uuid, uuid[]),
  public.update_delivery_batch_status_atomic(uuid, text, uuid[])
to authenticated, service_role;
grant execute on function
  solarflow_private.my_profile(),
  solarflow_private.my_role(),
  solarflow_private.is_active(),
  solarflow_private.is_admin(),
  solarflow_private.is_head_office(),
  solarflow_private.current_cpo(),
  solarflow_private.can_view_lead(uuid),
  solarflow_private.can_view_customer(uuid, text, text, text),
  solarflow_private.can_view_profile(uuid, text, uuid, uuid, text),
  solarflow_private.feature_on(text)
to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
