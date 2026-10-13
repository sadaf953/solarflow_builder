-- SOLARFLOW DEMO: run once in a NEW, EMPTY Supabase project's SQL Editor.
-- No database links, live endpoints, credentials, real customers or email calls.
-- Refuses to run if public already contains application tables.
-- After running: enable Auth > Anonymous Sign-Ins in the dashboard.
-- The frontend must signInAnonymously(), then call start_demo_session(p_role).
-- Each authenticated visitor owns a PRIVATE sandbox. Roles are demo personas,
-- not production authorization boundaries. All eight can edit their own sandbox.
-- SQL does not change the frontend, create GitHub repos, or send messages.

begin;

do $$
begin
  if exists (select 1 from pg_catalog.pg_tables where schemaname = 'public') then
    raise exception 'STOP: public contains tables. Use a NEW EMPTY demo project; nothing was changed.';
  end if;
end $$;

create schema solarflow_private;
revoke all on schema solarflow_private from public, anon, authenticated;
grant usage on schema public to anon, authenticated;

create table public.demo_roles (
  user_type text primary key,
  label text not null,
  role text not null,
  display_order integer not null unique
);
insert into public.demo_roles values
 ('admin','Admin','Admin',1),
 ('sales','Office','Office',2),
 ('channel_partner_office','Channel Partner Office','Channel Partner Office',3),
 ('office2','Manager','Channel Partner Manager',4),
 ('agent2','Dealer','Channel Partner',5),
 ('agent','Channel Partner','Channel Partners',6),
 ('vendor','Vendor','Vendors',7),
 ('stamp','Stamp','Stamp',8);
alter table public.demo_roles enable row level security;
revoke all on public.demo_roles from anon, authenticated;
grant select on public.demo_roles to anon, authenticated;
create policy role_catalog_read on public.demo_roles for select to anon, authenticated using (true);

-- Auth users are created by Supabase Auth, never by inserting passwords into SQL.
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 demo_session_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 name text not null,
 email text,
 phone text default '0000000000',
 phone_number text default '0000000000',
 user_type text not null references public.demo_roles(user_type),
 role text not null,
 channel_partner text default 'Demo Aurora Solar',
 status text not null default 'active' check (status in ('active','inactive')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(id, demo_session_id),
 check (id = demo_session_id)
);

create table public.admin (
 demo_session_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 ac_cable numeric,
 adhaar_card_back boolean default false,
 adhaar_card_front boolean default false,
 application_acknowledgment boolean default false,
 application_done_by text,
 bank_branch text,
 bank_details boolean default false,
 bank_name text,
 cash_details jsonb default '{}'::jsonb,
 channel_partner text,
 completed_at timestamptz,
 consumer_no text,
 created_at timestamptz not null default now(),
 customer_name text,
 dc_cable numeric,
 dcr_certificate boolean default false,
 deleted_at timestamptz,
 delivery_batch_id text,
 delivery_status text default 'PENDING',
 digital_certificate boolean default false,
 discom_inspection text,
 discom_submission jsonb default '{}'::jsonb,
 driver_name text,
 driver_phone_number text,
 email_address text,
 extra_docs boolean default false,
 feasibility_no text,
 feasibilty_document boolean default false,
 folder_no text,
 full_address text,
 follow_ups jsonb default '[]'::jsonb,
 geo_tag_image boolean default false,
 geo_tag_status text default 'Pending',
 hold_procurement jsonb default '{}'::jsonb,
 house_geo_tag_photo boolean default false,
 id uuid primary key default gen_random_uuid(),
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
 light_bill boolean default false,
 loan_history jsonb default '[]'::jsonb,
 loan_by text,
 loan_registration_date text,
 loan_tag text,
 material_delivery_date text,
 material_order_notes text,
 meter_installation text,
 meter_installation_photo boolean default false,
 module_brand text,
 module_wp numeric,
 no_of_modules numeric,
 pan_card boolean default false,
 pcr_certificate boolean default false,
 panel text,
 panel_serial_no text,
 payment_type text,
 plant_commissioning_report boolean default false,
 phone_number text,
 pincode text,
 pm_surya_ghar_stamp boolean default false,
 registration_by text,
 registration_date text,
 registration_no text,
 roof_shed text,
 sfdc_photo boolean default false,
 sfdc_photo_text text,
 warranty_card_text text,
 file_status text,
 signature_pic boolean default false,
 site_feasibility boolean default false,
 stage text not null default 'LEADS',
 stages_remarks jsonb default '{}'::jsonb,
 stamp boolean default false,
 structure_front_leg_height numeric,
 structure_rear_leg_height numeric,
 sub_channel_partner text,
 sub_divisions text,
 district text,
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
 unique(id, demo_session_id)
);

create table public.metadata (
 id uuid primary key default gen_random_uuid(),
 demo_session_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 category text not null, label text not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(demo_session_id, category, label)
);
create table public.vendors (
 id uuid primary key default gen_random_uuid(),
 demo_session_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 name text not null, email text, phone text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(demo_session_id, name)
);
create table public.drivers (
 id uuid primary key default gen_random_uuid(),
 demo_session_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 name text not null, phone text, vehicle_number text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(demo_session_id, name)
);
create table public.activity_log (
 id uuid primary key default gen_random_uuid(),
 demo_session_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 user_id uuid references public.profiles(id) on delete set null,
 customer_id uuid references public.admin(id) on delete set null,
 action text, message text, old_value text, new_value text, details jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.documents (
 id uuid primary key default gen_random_uuid(),
 demo_session_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 customer_id uuid not null,
 file_name text not null, storage_path text not null, file_type text, doc_type text,
 uploaded_by uuid references public.profiles(id) on delete set null,
 remark text, uploaded_at timestamptz not null default now(),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(customer_id,demo_session_id) references public.admin(id,demo_session_id) on delete cascade
);
create table public.bom (
 id uuid primary key default gen_random_uuid(),
 demo_session_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 admin_id uuid not null, bom_type text not null default 'ROOF',
 paper_prepared_by text, paper_prepared_date text,
 material_loaded_by text, material_loaded_date text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(id,demo_session_id), unique(admin_id,bom_type),
 foreign key(admin_id,demo_session_id) references public.admin(id,demo_session_id) on delete cascade
);
create table public.bom_items (
 id uuid primary key default gen_random_uuid(),
 demo_session_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 bom_id uuid not null, product_name text not null,
 sr_no integer, quantity text, uom text, integration_by text, note text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(bom_id,demo_session_id) references public.bom(id,demo_session_id) on delete cascade
);
create table public.delivery_batches (
 id uuid primary key default gen_random_uuid(),
 demo_session_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 batch_no text not null, dispatch_date text, driver_name text, driver_phone text,
 vehicle_number text, rent_amount text, car_rent_paid text default 'No',
 car_rent_paid_by text, car_rent_paid_at text, vendor text, notes text,
 status text not null default 'PENDING', project_ids uuid[] not null default '{}',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(demo_session_id,batch_no)
);
create table public.quotations (
 id uuid primary key default gen_random_uuid(),
 demo_session_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 quotation_no bigint generated by default as identity (start with 1001) unique,
 owner_id uuid not null references public.profiles(id),
 owner_name_snapshot text, owner_phone_snapshot text,
 customer_name text, customer_phone text, customer_email text,
 full_address text, village text, taluka text, district text, pincode text,
 quotation_date date, valid_until date, capacity_kw numeric, project_type text,
 solar_panel_make text, solar_panel_qty integer, panel_wattage numeric,
 inverter_option text, inverter_brand text, geb_geda_charge text,
 source_lead_id uuid references public.admin(id) on delete set null,
 converted_lead_id uuid references public.admin(id) on delete set null,
 starting_price numeric, schema_version integer not null default 1 check(schema_version=1),
 quotation_data jsonb not null default '{}',
 status text not null default 'draft' check(status in ('draft','issued','lost','converted')),
 issued_at timestamptz, converted_at timestamptz, lost_at timestamptz, lost_reason text, lost_remark text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(owner_id,demo_session_id) references public.profiles(id,demo_session_id)
);

-- API grants and policies are explicit: the public key alone gets no customer data.
-- Every visitor can exercise all demo personas, but cannot read/write another visitor's sandbox.
create function solarflow_private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
 new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
 return new;
end $$;
revoke all on function solarflow_private.touch_updated_at() from public;

do $$
declare t text;
begin
 foreach t in array array['profiles','admin','metadata','vendors','drivers','activity_log','documents','bom','bom_items','delivery_batches','quotations'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  execute format('grant select, insert, update, delete on public.%I to authenticated',t);
  execute format('create policy sandbox_select on public.%I for select to authenticated using (demo_session_id = (select auth.uid()))',t);
  execute format('create policy sandbox_insert on public.%I for insert to authenticated with check (demo_session_id = (select auth.uid()))',t);
  execute format('create policy sandbox_update on public.%I for update to authenticated using (demo_session_id = (select auth.uid())) with check (demo_session_id = (select auth.uid()))',t);
  execute format('create policy sandbox_delete on public.%I for delete to authenticated using (demo_session_id = (select auth.uid()))',t);
  execute format('create index %I on public.%I(demo_session_id)',t||'_sandbox_idx',t);
  execute format('create trigger touch_updated_at before update on public.%I for each row execute function solarflow_private.touch_updated_at()',t);
 end loop;
end $$;
grant usage, select on sequence public.quotations_quotation_no_seq to authenticated;
create index admin_stage_idx on public.admin(demo_session_id,stage,created_at desc) where deleted_at is null;
create index quotations_list_idx on public.quotations(demo_session_id,status,created_at desc);
create index documents_customer_idx on public.documents(customer_id);
create index bom_items_parent_idx on public.bom_items(bom_id);
create index activity_customer_idx on public.activity_log(customer_id,created_at desc);
create index activity_user_idx on public.activity_log(user_id);

-- No SECURITY DEFINER: the signed-in visitor's RLS applies inside every RPC.
create function public.start_demo_session(p_role text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare u uuid := auth.uid(); r public.demo_roles; p public.profiles; i integer;
 stages text[] := array['LEADS','REGISTRATION','LOAN','MATERIAL ORDER','MATERIAL DELIVERY','INSTALLATION STATUS','DISCOM SUBMISSION','COMPLETED'];
begin
 if u is null then raise exception 'Call signInAnonymously() first'; end if;
 select * into r from public.demo_roles where user_type=p_role;
 if not found then raise exception 'Unknown demo role'; end if;
 -- Serialize concurrent initialization for this visitor.
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 insert into public.profiles(id,demo_session_id,name,email,user_type,role,channel_partner)
 values(u,u,case p_role when 'vendor' then 'Demo Vendor' when 'agent' then 'Demo Aurora Solar' when 'agent2' then 'Demo Dealer' else 'Demo '||r.label end,
 'demo.'||p_role||'@solarflow.example',p_role,r.role,'Demo Aurora Solar')
 on conflict(id) do update set name=excluded.name,email=excluded.email,user_type=excluded.user_type,role=excluded.role,status='active'
 returning * into p;
 if not exists(select 1 from public.admin where demo_session_id=u) then
  for i in 1..8 loop
   insert into public.admin(demo_session_id,customer_name,phone_number,email_address,villages,full_address,sub_divisions,district,pincode,
    consumer_no,folder_no,channel_partner,sub_channel_partner,vendor,module_brand,module_wp,no_of_modules,system_capacity_kwp,
    invoice_value,payment_type,stage,installation_status,geo_tag_status,meter_installation,discom_inspection,completed_at)
   values(u,'Demo Customer '||i,'000000000'||i,'customer.'||i||'@example.invalid','Demo Village','House '||i||', Sample Avenue (fictional)',
    'Demo Town','Demo District','000000','DEMO-CONSUMER-'||i,i::text,'Demo Aurora Solar','Demo Dealer','Demo Vendor','SolarFlow Essential',580,6,3480,
    189000,case when i%2=0 then 'Loan' else 'Cash' end,stages[i],case when i=8 then 'Completed' else 'Pending' end,
    'Pending','No','No',case when i=8 then now() else null end);
  end loop;
 end if;
 insert into public.metadata(demo_session_id,category,label)
 select u,v.category,v.label from (values
 ('channel_partner','Demo Aurora Solar'),('sub_channel_partner','Demo Dealer'),('company_branch','Demo Branch'),
 ('payment_type','Loan'),('payment_type','Cash'),('module_brand','SolarFlow Essential'),('module_brand','SolarFlow Plus'),
 ('payment_method_modes','Demo Transfer'),('registration_by','Demo Office'),('subsidy_approval_status','Inprocess')
 ) as v(category,label) on conflict(demo_session_id,category,label) do nothing;
 insert into public.vendors(demo_session_id,name,email,phone) values(u,'Demo Vendor','vendor@solarflow.example','0000000000')
 on conflict(demo_session_id,name) do nothing;
 insert into public.drivers(demo_session_id,name,phone,vehicle_number) values(u,'Demo Driver','0000000000','DEMO-VEHICLE-001')
 on conflict(demo_session_id,name) do nothing;
 return to_jsonb(p) || jsonb_build_object('userType',p.user_type,'isDemo',true);
end $$;

create function public.get_dashboard_metrics_scoped(p_channel_partner text default null,p_dealer text default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
 with rows as (
  select * from public.admin where deleted_at is null
  and (nullif(p_channel_partner,'') is null or channel_partner=p_channel_partner)
  and (nullif(p_dealer,'') is null or sub_channel_partner=p_dealer)
 ), counts as (select stage,count(*) as n from rows group by stage)
 select jsonb_build_object(
  'totalProjects',count(*),'completedCount',count(*) filter(where stage='COMPLETED'),
  'liveProjects',count(*) filter(where stage not in ('COMPLETED','LOST PROJECT')),
  'loanCount',count(*) filter(where lower(payment_type)='loan'),'cashCount',count(*) filter(where lower(payment_type)='cash'),
  'loanTagCount',count(*) filter(where nullif(loan_tag,'') is not null),
  'subsidyTagCount',count(*) filter(where nullif(subsidy_tag,'') is not null),
  'installationTagCount',count(*) filter(where stage='INSTALLATION STATUS'),
  'stageCounts',coalesce((select jsonb_object_agg(stage,n) from counts),'{}'::jsonb)) from rows;
$$;
create function public.get_dashboard_metrics(p_channel_partner text default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
 select public.get_dashboard_metrics_scoped(p_channel_partner,null);
$$;

create function public.move_stage(p_customer_id uuid,p_new_stage text,p_old_stage text,p_remark text default '')
returns public.admin language plpgsql security invoker set search_path = '' as $$
declare row public.admin;
begin
 if p_new_stage is null or not (p_new_stage = any(array['LEADS','REGISTRATION','LOAN','CASH','MATERIAL ORDER','MATERIAL INTEGRATION','MATERIAL DELIVERY','INSTALLATION STATUS','GEO TAG PHOTO','DISCOM SUBMISSION','METER INSTALLATION','DISCOM INSPECTION','SUBSIDY STATUS','FINAL REVIEW','COMPLETED','LOST PROJECT'])) then
  raise exception 'Unknown stage';
 end if;
 update public.admin set stage=p_new_stage,
 stages_remarks=coalesce(stages_remarks,'{}')||jsonb_build_object(p_old_stage,''),
 completed_at=case when p_new_stage='COMPLETED' then now() else null end
 where id=p_customer_id and stage=p_old_stage and deleted_at is null returning * into row;
 if not found then raise exception 'Record unavailable or stage changed; refresh first'; end if;
 insert into public.activity_log(user_id,customer_id,action,message,new_value)
 values(auth.uid(),p_customer_id,'update',p_old_stage||' → '||p_new_stage,coalesce(p_remark,''));
 return row;
end $$;

-- PRIVATE documents; path format matches the app: CUSTOMER_UUID/filename.
insert into storage.buckets(id,name,public,file_size_limit)
values('customer-documents','customer-documents',false,20971520);
create policy solarflow_document_read on storage.objects for select to authenticated
using(bucket_id='customer-documents' and exists(
 select 1 from public.admin c where c.id::text=(storage.foldername(name))[1] and c.demo_session_id=(select auth.uid())));
create policy solarflow_document_insert on storage.objects for insert to authenticated
with check(bucket_id='customer-documents' and exists(
 select 1 from public.admin c where c.id::text=(storage.foldername(name))[1] and c.demo_session_id=(select auth.uid())));
create policy solarflow_document_update on storage.objects for update to authenticated
using(bucket_id='customer-documents' and exists(
 select 1 from public.admin c where c.id::text=(storage.foldername(name))[1] and c.demo_session_id=(select auth.uid())))
with check(bucket_id='customer-documents' and exists(
 select 1 from public.admin c where c.id::text=(storage.foldername(name))[1] and c.demo_session_id=(select auth.uid())));
create policy solarflow_document_delete on storage.objects for delete to authenticated
using(bucket_id='customer-documents' and exists(
 select 1 from public.admin c where c.id::text=(storage.foldername(name))[1] and c.demo_session_id=(select auth.uid())));

revoke all on function public.start_demo_session(text) from public,anon;
revoke all on function public.get_dashboard_metrics_scoped(text,text) from public,anon;
revoke all on function public.get_dashboard_metrics(text) from public,anon;
revoke all on function public.move_stage(uuid,text,text,text) from public,anon;
grant execute on function public.start_demo_session(text), public.get_dashboard_metrics_scoped(text,text),
 public.get_dashboard_metrics(text),public.move_stage(uuid,text,text,text) to authenticated;

-- Realtime respects table RLS. Do not expose private storage objects publicly.
do $$
declare t text;
begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  foreach t in array array['admin','profiles','delivery_batches'] loop
   execute format('alter publication supabase_realtime add table public.%I',t);
  end loop;
 end if;
end $$;

commit;

-- Expected: eight role rows. Customer rows are seeded on the FIRST demo sign-in,
-- not during SQL Editor execution (SQL Editor has no visitor auth.uid()).
select user_type,label,role from public.demo_roles order by display_order;
