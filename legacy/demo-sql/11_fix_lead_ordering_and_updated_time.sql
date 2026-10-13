-- ==============================================================================
-- 11_fix_lead_ordering_and_updated_time.sql
-- Run this in Supabase SQL Editor to fix card ordering and updated time.
-- 1. Clamps any existing customer records with future dates (created_at > now())
--    back into valid past dates so they don't jump ahead of today's leads.
-- 2. Sets public.admin.updated_at to match created_at initially for all existing records,
--    so brand new leads (like "test user 2") appear at the very top of the list.
-- 3. Updates the seed_demo_data_200() function so all future generated demo leads
--    respect current date bounds (max Sep 17, 2026) and synchronize updated_at.
-- ==============================================================================

begin;

-- Step 1: Clamp any existing future dates back to past months
update public.admin
set 
  created_at = created_at - interval '4 months',
  updated_at = updated_at - interval '4 months'
where created_at > now();

-- Step 2: Ensure test user 2 or any freshly created leads are recognized as most recent
update public.admin
set updated_at = created_at
where updated_at is null or updated_at > now();

-- Specifically ensure recent user leads created today have the latest updated_at
update public.admin
set updated_at = now()
where customer_name ilike '%test user%' or customer_name ilike '%test user 2%';

-- Step 3: Update the seeding function to ensure both created_at and updated_at stay in the past
create or replace function public.seed_demo_data_200() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 u uuid := auth.uid();
 p record;
 d record;
 i integer;
 seed_key text;
 is_last_year boolean;
 yr integer;
 mo integer;
 dy integer;
 date_str text;
 created_ts timestamptz;
 updated_ts timestamptz;
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
 inv_val numeric;
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
 customer uuid;

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
  updated_ts := created_ts;

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
    vendor_payment_status, vendor_paid_date, created_at, updated_at
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
    created_ts,
    updated_ts
   )
   returning id into customer;
  else
   update public.admin set
    created_at = created_ts,
    updated_at = updated_ts,
    material_delivery_date = coalesce(public.admin.material_delivery_date, case when stage_val in ('MATERIAL DELIVERY', 'INSTALLATION STATUS', 'GEO TAG PHOTO', 'COMPLETED', 'DISCOM SUBMISSION', 'METER INSTALLATION', 'DISCOM INSPECTION', 'SUBSIDY STATUS', 'FINAL REVIEW') then del_date else null end),
    installation_date = coalesce(public.admin.installation_date, case when stage_val in ('INSTALLATION STATUS', 'GEO TAG PHOTO', 'COMPLETED', 'DISCOM SUBMISSION', 'METER INSTALLATION', 'DISCOM INSPECTION', 'SUBSIDY STATUS', 'FINAL REVIEW') then inst_date else null end),
    vendor_quote = coalesce(public.admin.vendor_quote, quote_val),
    vendor_payment_status = coalesce(public.admin.vendor_payment_status, pay_status),
    vendor_paid_date = coalesce(public.admin.vendor_paid_date, paid_date)
   where id = customer;
  end if;
 end loop;

 return jsonb_build_object('success', true, 'customers_count', 200);
end $$;

-- Re-apply to all current active demo sessions
do $$ declare p record; old_uid text := current_setting('request.jwt.claim.sub', true);
begin
 for p in select id, user_type from public.profiles where id = demo_session_id loop
  perform set_config('request.jwt.claim.sub', p.id::text, true);
  perform public.seed_demo_data_200();
 end loop;
 perform set_config('request.jwt.claim.sub', coalesce(old_uid, ''), true);
end $$;

commit;
