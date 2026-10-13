-- SolarFlow: 200 realistic demo customers spanning Last Year (2025) and This Year (2026).
-- Run AFTER 09_cpo_lead_scope.sql in the demo Supabase project.
-- Ensures clean BOM remarks (''), consolidates vendors to Vendor 1-3 and drivers to Driver 1-3,
-- uses Indian names and staff names (Ravi, Nikhil, Staff 1, Staff 2), and supports historical year filtering.

begin;

do $$ begin
 if to_regnamespace('solarflow_private') is null or to_regclass('public.demo_roles') is null
    or to_regprocedure('public.start_demo_session(text)') is null then
  raise exception 'Run previous setup scripts (01 through 09) in the demo project first';
 end if;
end $$;

-- 1. Consolidate vendors to clean 'Vendor 1', 'Vendor 2', 'Vendor 3' (removing 'Demo Vendor' labels)
create or replace function public.consolidate_demo_vendors_v2()
returns void language plpgsql security invoker set search_path='' as $$
declare u uuid := auth.uid(); n integer; v record;
begin
 if u is null then raise exception 'Sign in first'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text, 0));
 for n in 1..3 loop
  insert into public.vendors(name, email, phone)
  values('Vendor '||n, case when n=1 then 'vendor1@solarflow.example' else 'vendor.'||n||'@solarflow.example' end, '000000000'||n)
  on conflict(demo_session_id, name) do nothing;
 end loop;

 for n in 1..3 loop
  update public.admin set vendor = 'Vendor '||n where demo_session_id = u and vendor in ('Demo Vendor '||n, 'Demo Vendor');
  update public.delivery_batches set vendor = 'Vendor '||n where demo_session_id = u and vendor in ('Demo Vendor '||n, 'Demo Vendor');
  update public.metadata set label = 'Vendor '||n where demo_session_id = u and category = 'vendor' and label in ('Demo Vendor '||n, 'Demo Vendor')
   and not exists (select 1 from public.metadata where demo_session_id = u and category = 'vendor' and label = 'Vendor '||n);
 end loop;

 update public.demo_profiles set name = 'Vendor 1' where demo_session_id = u and demo_profile_key = 'vendor';
 update public.profiles set name = 'Vendor 1' where id = u and user_type = 'vendor';
 delete from public.metadata where demo_session_id = u and category = 'vendor' and label ~ '^Demo Vendor';
 delete from public.vendors where demo_session_id = u and name ~ '^Demo Vendor';
end $$;

-- 2. Consolidate drivers to clean 'Driver 1', 'Driver 2', 'Driver 3'
create or replace function public.consolidate_demo_drivers_v2()
returns void language plpgsql security invoker set search_path='' as $$
declare u uuid := auth.uid(); n integer;
begin
 if u is null then raise exception 'Sign in first'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text, 0));
 for n in 1..3 loop
  insert into public.drivers(name, phone, vehicle_number)
  values('Driver '||n, '000000000'||n, 'VEHICLE-00'||n)
  on conflict(demo_session_id, name) do nothing;

  update public.admin set driver_name = 'Driver '||n, driver_phone_number = '000000000'||n
  where demo_session_id = u and driver_name in ('Demo Driver '||n, 'Demo Driver');
  update public.delivery_batches set driver_name = 'Driver '||n, driver_phone = '000000000'||n
  where demo_session_id = u and driver_name in ('Demo Driver '||n, 'Demo Driver');
 end loop;

 delete from public.drivers where demo_session_id = u and name ~ '^Demo Driver';
end $$;

-- 3. Clean existing BOM notes and staff labels
create or replace function public.clean_demo_boms_and_staff()
returns void language plpgsql security invoker set search_path='' as $$
declare u uuid := auth.uid();
begin
 if u is null then raise exception 'Sign in first'; end if;
 update public.bom_items set note = ''
 where demo_session_id = u and (note ilike '%synthetic%' or note ilike '%sample%' or note ilike '%demo%');

 update public.bom set paper_prepared_by = 'Ravi'
 where demo_session_id = u and (paper_prepared_by ilike '%demo%' or paper_prepared_by is null);

 update public.bom set material_loaded_by = 'Nikhil'
 where demo_session_id = u and (material_loaded_by ilike '%demo%' or material_loaded_by is null);

 update public.bom_items set integration_by = 'Staff 1'
 where demo_session_id = u and (integration_by ilike '%demo%' or integration_by is null);
end $$;

-- 4. 200 realistic demo customers spanning Last Year (2025) and This Year (2026)
create or replace function public.seed_demo_data_200()
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 u uuid := auth.uid();
 p public.profiles;
 i integer;
 is_last_year boolean;
 yr integer;
 mo integer;
 dy integer;
 date_str text;
 created_ts timestamptz;
 seed_key text;
 customer uuid;
 bom_id_val uuid;
 fn text;
 ln text;
 full_name text;
 city text;
 stage_val text;
 is_loan boolean;
 loan_tag_val text;
 subsidy_tag_val text;
 vendor_val text;
 cap_kwp numeric;
 mod_count integer;
 inv_val integer;
 phone text;
 email text;
 cpo uuid;
 dealer uuid;
 head uuid;
 other_cpo uuid;
 other_dealer uuid;
 creator_id uuid;
 cp_name text;
 sub_cp_name text;
 del_date text;
 inst_date text;
 quote_val numeric;
 pay_status text;
 paid_date text;

 first_names text[] := array[
  'Ramesh', 'Suresh', 'Rajesh', 'Amit', 'Priya', 'Nikhil', 'Sanjay', 'Sunita',
  'Dinesh', 'Manoj', 'Vijay', 'Anjali', 'Bhavin', 'Chetan', 'Divya', 'Gautam',
  'Harish', 'Ishwar', 'Jignesh', 'Kalpesh', 'Lalit', 'Mukesh', 'Naresh', 'Paresh',
  'Rohit', 'Sandeep', 'Tarun', 'Umesh', 'Vipul', 'Yogesh', 'Aarav', 'Deepak',
  'Ketan', 'Mahesh', 'Pradeep', 'Sachin', 'Tushar', 'Vinod', 'Ashok', 'Bhavesh', 'Ravi'
 ];
 last_names text[] := array[
  'Patel', 'Shah', 'Sharma', 'Mehta', 'Verma', 'Gupta', 'Joshi', 'Trivedi',
  'Prajapati', 'Solanki', 'Chauhan', 'Makwana', 'Vaghela', 'Soni', 'Dave', 'Panchal',
  'Rana', 'Bhatt', 'Vyas', 'Parmar', 'Desai', 'Pandey', 'Rawal', 'Kumar', 'Rao'
 ];
 cities text[] := array[
  'Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Bhavnagar', 'Jamnagar', 'Gandhinagar', 'Junagadh', 'Anand', 'Navsari'
 ];
 stages text[] := array[
  'LEADS', 'REGISTRATION', 'LOAN', 'CASH', 'MATERIAL ORDER', 'MATERIAL INTEGRATION',
  'MATERIAL DELIVERY', 'INSTALLATION STATUS', 'GEO TAG PHOTO', 'DISCOM SUBMISSION',
  'METER INSTALLATION', 'DISCOM INSPECTION', 'SUBSIDY STATUS', 'FINAL REVIEW', 'COMPLETED', 'LOST PROJECT'
 ];
 loan_tags text[] := array[
  'Inprocess', 'Sanctioned', 'Returned', 'Reject', '1st Payment', '2nd Payment', 'Total Loan Payment Received'
 ];
 subsidy_tags text[] := array[
  'Inprocess', 'Redeemed', 'Returned', 'Approved', 'Received'
 ];

begin
 if u is null then raise exception 'An authenticated demo session is required'; end if;
 select * into p from public.profiles where id = u and demo_session_id = u;
 if not found then raise exception 'Call start_demo_session(role) first'; end if;

 perform pg_advisory_xact_lock(hashtextextended(u::text, 0));

 -- Lookup demo profiles for lead creator attribution
 select id into cpo from public.demo_profiles where demo_session_id = u and demo_profile_key = 'channel_partner_office';
 select id into dealer from public.demo_profiles where demo_session_id = u and demo_profile_key = 'agent2';
 select id into head from public.demo_profiles where demo_session_id = u and demo_profile_key = 'admin';
 select id into other_cpo from public.demo_profiles where demo_session_id = u and demo_profile_key = 'sample-cpo-cedar';
 select id into other_dealer from public.demo_profiles where demo_session_id = u and demo_profile_key = 'sample-dealer-cedar';

 for i in 1..200 loop
  seed_key := 'solarflow-200-v1-' || i;
  is_last_year := (i <= 100);
  yr := case when is_last_year then 2025 else 2026 end;
  if is_last_year then
   mo := 1 + (((i - 1) * 7 + 3) % 12);
   dy := 1 + (((i - 1) * 11 + 5) % 27);
  else
   -- For 2026: cap month to 1..9 (Jan to Sep 2026) and days in Sept to <= 17 so no records have future dates
   mo := 1 + (((i - 1) * 5 + 2) % 9);
   if mo = 9 then
    dy := 1 + (((i - 1) * 7 + 1) % 17);
   else
    dy := 1 + (((i - 1) * 11 + 5) % 27);
   end if;
  end if;
  date_str := to_char(yr, 'FM0000') || '-' || to_char(mo, 'FM00') || '-' || to_char(dy, 'FM00');
  created_ts := (date_str || ' 10:30:00+00')::timestamptz;

  fn := first_names[1 + ((i - 1) % array_length(first_names, 1))];
  ln := last_names[1 + (((i - 1) / array_length(first_names, 1)) % array_length(last_names, 1))];
  full_name := fn || ' ' || ln;
  city := cities[1 + ((i - 1) % array_length(cities, 1))];

  stage_val := stages[1 + ((i - 1) % array_length(stages, 1))];
  is_loan := (i % 2 = 1);
  loan_tag_val := case when is_loan then loan_tags[1 + (((i - 1) / 2) % array_length(loan_tags, 1))] else null end;
  subsidy_tag_val := subsidy_tags[1 + ((i - 1) % array_length(subsidy_tags, 1))];
  vendor_val := 'Vendor ' || (1 + ((i - 1) % 3));

  cap_kwp := round((3.0 + ((i - 1) % 8) * 0.55)::numeric, 2);
  mod_count := round((cap_kwp * 1000) / 580);
  inv_val := 145000 + (mod_count * 12000);
  phone := '98' || lpad((10000000 + (i * 137))::text, 8, '0');
  email := lower(fn) || '.' || lower(ln) || i || '@example.invalid';

  -- Scoped lead attribution across CPO, Dealer, and Head Office
  if i <= 40 then
   creator_id := cpo;
   cp_name := 'Demo Aurora Solar';
   sub_cp_name := null;
  elsif i <= 80 then
   creator_id := dealer;
   cp_name := 'Demo Aurora Solar';
   sub_cp_name := 'Demo Dealer';
  elsif i <= 140 then
   creator_id := other_dealer;
   cp_name := 'Demo Cedar Solar';
   sub_cp_name := 'Demo Cedar Dealer';
  else
   creator_id := head;
   cp_name := 'Demo Head Office';
   sub_cp_name := null;
  end if;

  -- Calculate realistic vendor delivery, installation, and commission
  del_date := to_char(created_ts + ((7 + (i % 5)) || ' days')::interval, 'YYYY-MM-DD');
  inst_date := to_char(created_ts + ((12 + (i % 7)) || ' days')::interval, 'YYYY-MM-DD');
  quote_val := round(cap_kwp * 2200);
  pay_status := case when is_last_year or (yr = 2026 and mo < 7) then 'Paid' else 'Pending' end;
  paid_date := case when pay_status = 'Paid' then to_char(created_ts + '35 days'::interval, 'YYYY-MM-DD') else null end;

  select id into customer from public.admin where demo_session_id = u and demo_seed_key = seed_key;
  if not found then
   insert into public.admin(
    demo_seed_key, customer_name, phone_number, email_address, villages, full_address, sub_divisions, district, pincode,
    consumer_no, folder_no, channel_partner, sub_channel_partner, lead_creator_profile_id, vendor,
    module_brand, module_wp, no_of_modules, system_capacity_kwp, invoice_value, payment_type, stage,
    loan_tag, subsidy_tag, installation_status, geo_tag_status, registration_date, registration_no,
    roof_shed, meter_installation, discom_inspection, completed_at, loan_history, subsidy_history,
    follow_ups, cash_details, stages_remarks, material_delivery_date, installation_date, vendor_quote,
    vendor_payment_status, vendor_paid_date, created_at
   )
   values(
    seed_key, full_name, phone, email, city || ' Rural Area',
    'Plot ' || i || ', Sector ' || (1 + (i % 20)) || ', ' || city,
    city || ' East Sub-Division', city, '38' || lpad((2000 + (i * 19))::text, 4, '0'),
    'CONS-' || yr || '-' || (1000 + i), 'FL-' || yr || '-' || (100 + i),
    cp_name, sub_cp_name, creator_id, vendor_val,
    case when i % 2 = 0 then 'ADANI' else 'WAAREE' end, 580, mod_count, cap_kwp,
    inv_val, case when is_loan then 'Loan' else 'Cash' end, stage_val,
    loan_tag_val, subsidy_tag_val,
    case when stage_val in ('COMPLETED', 'DISCOM SUBMISSION', 'METER INSTALLATION', 'DISCOM INSPECTION', 'SUBSIDY STATUS', 'FINAL REVIEW') then 'Installed' else 'Pending' end,
    case when stage_val in ('COMPLETED', 'DISCOM SUBMISSION', 'METER INSTALLATION', 'DISCOM INSPECTION', 'SUBSIDY STATUS', 'FINAL REVIEW') then 'Proceed' else 'Pending' end,
    date_str, 'REG-' || yr || '-' || (5000 + i),
    case when i % 4 = 0 then 'SHED' else 'ROOF' end,
    case when stage_val in ('COMPLETED', 'DISCOM INSPECTION', 'SUBSIDY STATUS', 'FINAL REVIEW') then 'Yes' else 'No' end,
    case when stage_val in ('COMPLETED', 'SUBSIDY STATUS', 'FINAL REVIEW') then 'Yes' else 'No' end,
    case when stage_val = 'COMPLETED' then created_ts + interval '30 days' else null end,
    '[]'::jsonb, '[]'::jsonb,
    jsonb_build_array(jsonb_build_object('date', date_str, 'remark', 'Initial project consultation and feasibility review')),
    '{}'::jsonb,
    jsonb_build_object(stage_val, 'Project status logged at ' || stage_val),
    case when stage_val in ('MATERIAL DELIVERY', 'INSTALLATION STATUS', 'GEO TAG PHOTO', 'COMPLETED', 'DISCOM SUBMISSION', 'METER INSTALLATION', 'DISCOM INSPECTION', 'SUBSIDY STATUS', 'FINAL REVIEW') then del_date else null end,
    case when stage_val in ('INSTALLATION STATUS', 'GEO TAG PHOTO', 'COMPLETED', 'DISCOM SUBMISSION', 'METER INSTALLATION', 'DISCOM INSPECTION', 'SUBSIDY STATUS', 'FINAL REVIEW') then inst_date else null end,
    quote_val,
    pay_status,
    paid_date,
    created_ts
   )
   returning id into customer;
  else
   update public.admin set
    material_delivery_date = coalesce(public.admin.material_delivery_date, case when stage_val in ('MATERIAL DELIVERY', 'INSTALLATION STATUS', 'GEO TAG PHOTO', 'COMPLETED', 'DISCOM SUBMISSION', 'METER INSTALLATION', 'DISCOM INSPECTION', 'SUBSIDY STATUS', 'FINAL REVIEW') then del_date else null end),
    installation_date = coalesce(public.admin.installation_date, case when stage_val in ('INSTALLATION STATUS', 'GEO TAG PHOTO', 'COMPLETED', 'DISCOM SUBMISSION', 'METER INSTALLATION', 'DISCOM INSPECTION', 'SUBSIDY STATUS', 'FINAL REVIEW') then inst_date else null end),
    vendor_quote = coalesce(public.admin.vendor_quote, quote_val),
    vendor_payment_status = coalesce(public.admin.vendor_payment_status, pay_status),
    vendor_paid_date = coalesce(public.admin.vendor_paid_date, paid_date)
   where id = customer;
  end if;

  -- Discom stamp agreement assignments
  if i in (10, 26, 42, 15, 65, 89, 120, 155) then
   update public.admin set discom_submission = jsonb_build_object(
    'sent_to_stamp_maker', true,
    'assigned_stamp_maker', 'Stamp Guy',
    'first_party', customer_name,
    'second_party', 'SolarFlow Energy',
    'purchased_party', customer_name,
    'stamp_value', '300',
    'stamp_description', 'Rooftop solar system installation agreement.',
    'stamp_remark', 'Executed stamp duty agreement.',
    'stamp_sent', i in (15, 65, 120),
    'stamp_completed_at', case when i in (15, 65, 120) then created_ts else null end,
    'stamp_completed_by', case when i in (15, 65, 120) then 'Stamp Guy' else null end
   )
   where id = customer and (discom_submission is null or discom_submission = '{}'::jsonb);
  end if;

  -- Customer BOM header & items with completely clean notes
  insert into public.bom(demo_seed_key, admin_id, bom_type, paper_prepared_by, paper_prepared_date, material_loaded_by, material_loaded_date)
  values(seed_key, customer, case when i % 4 = 0 then 'SHED' else 'ROOF' end, 'Ravi', date_str, 'Nikhil', date_str)
  on conflict(admin_id, bom_type) do update set demo_seed_key = coalesce(public.bom.demo_seed_key, excluded.demo_seed_key)
  returning id into bom_id_val;

  insert into public.bom_items(demo_seed_key, bom_id, sr_no, product_name, quantity, uom, integration_by, note)
  values(seed_key, bom_id_val, 1, 'Solar PV Modules (580W)', mod_count::text, 'Nos', 'Staff 1', '')
  on conflict(demo_session_id, demo_seed_key) where demo_seed_key is not null do nothing;

 end loop;

 return jsonb_build_object('success', true, 'customers_count', 200);
end $$;

-- 5. Updated start_demo_session to run 200 seed, clean boms, and clean vendors/drivers
create or replace function public.start_demo_session(p_role text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 u uuid := auth.uid();
 r public.demo_roles;
 p public.profiles;
 d public.demo_profiles;
begin
 if u is null then raise exception 'Call signInAnonymously() first'; end if;
 select * into r from public.demo_roles where user_type = p_role;
 if not found then raise exception 'Unknown demo role'; end if;

 perform pg_advisory_xact_lock(hashtextextended(u::text, 0));

 insert into public.profiles(id, demo_session_id, name, email, user_type, role, channel_partner)
 values(u, u, 'Demo Admin', 'demo.admin@solarflow.example', 'admin', 'Admin', 'Demo Aurora Solar')
 on conflict(id) do update set user_type = 'admin', role = 'Admin';

 perform public.anonymize_demo_labels();
 perform public.seed_demo_inventory();
 perform public.anonymize_demo_labels();
 perform public.seed_demo_installation_payments();
 perform public.consolidate_demo_vendors_v2();
 perform public.consolidate_demo_drivers_v2();
 perform public.seed_demo_cpo_hierarchy();
 perform public.seed_demo_data_200();
 perform public.clean_demo_boms_and_staff();

 select * into d from public.demo_profiles where demo_session_id = u and demo_profile_key = p_role and status = 'active';
 if not found then raise exception 'This demo role is inactive'; end if;

 update public.profiles set
  name = d.name, email = d.email, user_type = d.user_type, role = d.role,
  channel_partner = d.channel_partner, status = d.status, demo_profile_id = d.id,
  cpo_profile_id = case when d.user_type = 'channel_partner_office' then d.id when d.user_type = 'office2' then d.parent_profile_id else null end
 where id = u returning * into p;

 return to_jsonb(p) || jsonb_build_object('userType', p.user_type, 'isDemo', true);
end $$;

revoke all on function public.consolidate_demo_vendors_v2(), public.consolidate_demo_drivers_v2(), public.clean_demo_boms_and_staff(), public.seed_demo_data_200() from public, anon;
grant execute on function public.consolidate_demo_vendors_v2(), public.consolidate_demo_drivers_v2(), public.clean_demo_boms_and_staff(), public.seed_demo_data_200() to authenticated;

-- Apply 200-row seed and cleanup to all existing visitor sessions
do $$ declare p record; old_uid text := current_setting('request.jwt.claim.sub', true);
begin
 for p in select id, user_type from public.profiles where id = demo_session_id loop
  perform set_config('request.jwt.claim.sub', p.id::text, true);
  perform public.start_demo_session(p.user_type);
 end loop;
 perform set_config('request.jwt.claim.sub', coalesce(old_uid, ''), true);
end $$;

commit;
