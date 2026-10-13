-- Run after 02_sample_data_50.sql in the separate SolarFlow demo project.
-- Updates existing sample sandboxes and future role entries. No Auth users or passwords.
begin;
do $$ begin
 if to_regprocedure('public.seed_demo_data_50()') is null then
  raise exception 'Run 02_sample_data_50.sql first';
 end if;
end $$;

-- Stable fictional people. The Auth profile still identifies the real visitor.
create table if not exists public.demo_profiles (
 id uuid primary key default gen_random_uuid(),
 demo_session_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 demo_profile_key text not null,
 name text not null, email text, phone text default '0000000000', phone_number text default '0000000000',
 user_type text not null, role text not null, channel_partner text default 'Demo Aurora Solar',
 status text not null default 'active' check(status in ('active','inactive')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(demo_session_id,demo_profile_key), unique(id,demo_session_id)
);
alter table public.demo_profiles enable row level security;
revoke all on public.demo_profiles from anon;
grant select,insert,update,delete on public.demo_profiles to authenticated;
drop policy if exists sandbox_people on public.demo_profiles;
create policy sandbox_people on public.demo_profiles to authenticated
 using(demo_session_id=(select auth.uid())) with check(demo_session_id=(select auth.uid()));
alter table public.admin add column if not exists demo_scenario_version integer not null default 0;
alter table public.profiles add column if not exists demo_profile_id uuid;
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.profiles'::regclass and conname='profiles_demo_person_fk') then
  alter table public.profiles add constraint profiles_demo_person_fk
   foreign key(demo_profile_id,demo_session_id) references public.demo_profiles(id,demo_session_id);
 end if;
end $$;

create or replace function public.seed_demo_scenarios()
returns void language plpgsql security invoker set search_path='' as $$
declare u uuid:=auth.uid(); c public.admin;
 n integer; loan_status text; subsidy_status text;
 loan_tags text[]:=array['Inprocess','Sanctioned','Returned','Reject','1st Payment','2nd Payment','Total Loan Payment Received'];
 subsidy_tags text[]:=array['Inprocess','Redeemed','Returned','Approved','Received'];
begin
 if u is null then raise exception 'A demo session is required'; end if;
 insert into public.demo_profiles(demo_profile_key,name,email,user_type,role)
 select r.user_type,case r.user_type when 'agent' then 'Demo Aurora Solar' when 'agent2' then 'Demo Dealer'
  when 'vendor' then 'Demo Vendor' else 'Demo '||r.label end,
  'demo.'||r.user_type||'@solarflow.example',r.user_type,r.role from public.demo_roles r
 on conflict(demo_session_id,demo_profile_key) do nothing;
 insert into public.demo_profiles(demo_profile_key,name,email,user_type,role)
 values ('integration-preparer','Demo Preparer','preparer@solarflow.example','integration','Integration Staff'),
 ('integration-loader','Demo Loader','loader@solarflow.example','integration','Integration Staff'),
 ('integration-installer','Demo Installer','installer@solarflow.example','integration','Integration Staff')
 on conflict(demo_session_id,demo_profile_key) do nothing;
 perform public.seed_demo_data_50();
 -- Include existing integration directory staff, without creating Auth accounts.
 insert into public.demo_profiles(demo_profile_key,name,user_type,role)
 select 'metadata-'||m.id,m.label,'integration','Integration Staff' from public.metadata m
 where m.demo_session_id=u and m.category='integration_by' and not exists(
  select 1 from public.demo_profiles d where d.demo_session_id=u and d.user_type='integration' and d.name=m.label)
 on conflict(demo_session_id,demo_profile_key) do nothing;
 insert into public.metadata(category,label)
 select 'integration_by',name from public.demo_profiles where demo_session_id=u and user_type='integration'
 on conflict(demo_session_id,category,label) do nothing;
 insert into public.metadata(category,label)
 select 'subsidy_approval_status',unnest(subsidy_tags)
 on conflict(demo_session_id,category,label) do nothing;
 insert into public.metadata(category,label) values('inverter_make','DemoVolt'),('inverter_make','DemoGrid'),('inverter_make','DemoSun')
 on conflict(demo_session_id,category,label) do nothing;
 -- Match the vendor directory email to the stable Vendor persona.
 update public.vendors v set email=d.email from public.demo_profiles d
 where v.demo_session_id=u and d.demo_session_id=u and d.demo_profile_key='vendor' and v.name=d.name
 and v.email in ('vendor@solarflow.example','vendor.1@example.invalid');
 for c in select * from public.admin where demo_session_id=u and demo_seed_key like 'solarflow-50-v1-%' and demo_scenario_version<3 loop
  n:=split_part(c.demo_seed_key,'-',4)::integer;
  subsidy_status:=subsidy_tags[1+((n-1)%5)];
  loan_status:=case when c.payment_type='Loan' then loan_tags[1+((n/2-1)%7)] else null end;
  -- Fill untouched seed values only; retain manually entered tags/history.
  if coalesce(c.subsidy_tag,'') in ('','Inprocess') and coalesce(c.subsidy_history,'[]'::jsonb)='[]'::jsonb then
   update public.admin set subsidy_tag=subsidy_status,subsidy_history=jsonb_build_array(jsonb_build_object(
    'status',subsidy_status,'date',current_date-(n%14),'created_at',now(),
    'remark',case subsidy_status when 'Returned' then 'Sample: bank details need correction.' when 'Approved' then 'Sample: application approved; payment pending.'
     when 'Received' then 'Sample: subsidy credited to customer.' when 'Redeemed' then 'Sample: claim submitted for redemption.' else 'Sample: application under review.' end)) where id=c.id;
  end if;
  if coalesce(c.loan_tag,'') in ('','Inprocess') and coalesce(c.loan_history,'[]'::jsonb)='[]'::jsonb then
   update public.admin set loan_tag=loan_status,loan_history=case when loan_status is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object(
    'status',loan_status,'date',current_date-(n%10),'created_at',now(),'remark','Sample loan status: '||loan_status)) end where id=c.id;
  end if;
  update public.admin set demo_scenario_version=3 where id=c.id;
 end loop;
 -- Also cover databases that ran the earlier 02 seed before Stamp examples existed.
 update public.admin a set discom_submission=jsonb_build_object(
  'sent_to_stamp_maker',true,'assigned_stamp_maker',d.name,'assigned_stamp_maker_id',d.id,
  'first_party',a.customer_name,'second_party','SolarFlow Demo Energy','purchased_party',a.customer_name,
  'stamp_value','300','stamp_description','Sample rooftop solar installation agreement. Demonstration only.',
  'stamp_remark','Review the agreement details and add your own sample stamp image.',
  'stamp_sent',a.demo_seed_key='solarflow-50-v1-15',
  'stamp_completed_at',case when a.demo_seed_key='solarflow-50-v1-15' then now() else null end,
  'stamp_completed_by',case when a.demo_seed_key='solarflow-50-v1-15' then d.name else null end)
 from public.demo_profiles d where a.demo_session_id=u and d.demo_session_id=u and d.demo_profile_key='stamp'
 and a.demo_seed_key in ('solarflow-50-v1-10','solarflow-50-v1-26','solarflow-50-v1-42','solarflow-50-v1-15')
 and coalesce(a.discom_submission,'{}'::jsonb)='{}'::jsonb;
 -- Link office assignment IDs to the same stable person used by Stamp role entry.
 update public.admin a set discom_submission=a.discom_submission||jsonb_build_object('assigned_stamp_maker_id',d.id)
 from public.demo_profiles d where a.demo_session_id=u and d.demo_session_id=u and d.user_type='stamp'
 and a.discom_submission->>'assigned_stamp_maker'=d.name
 and (nullif(a.discom_submission->>'assigned_stamp_maker_id','') is null or a.discom_submission->>'assigned_stamp_maker_id'=u::text);
end $$;
revoke all on function public.seed_demo_scenarios() from public,anon;
grant execute on function public.seed_demo_scenarios() to authenticated;

create or replace function public.start_demo_session(p_role text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare u uuid:=auth.uid(); r public.demo_roles; p public.profiles; d public.demo_profiles;
begin
 if u is null then raise exception 'Call signInAnonymously() first'; end if;
 select * into r from public.demo_roles where user_type=p_role;
 if not found then raise exception 'Unknown demo role'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 insert into public.profiles(id,demo_session_id,name,email,user_type,role,channel_partner)
 values(u,u,'Demo '||r.label,'demo.'||p_role||'@solarflow.example',p_role,r.role,'Demo Aurora Solar')
 on conflict(id) do update set user_type=excluded.user_type,role=excluded.role;
 perform public.seed_demo_scenarios();
 select * into d from public.demo_profiles where demo_session_id=u and demo_profile_key=p_role and status='active';
 if not found then raise exception 'This demo role is inactive'; end if;
 update public.profiles set name=d.name,email=d.email,user_type=d.user_type,role=d.role,channel_partner=d.channel_partner,
 status=d.status,demo_profile_id=d.id where id=u returning * into p;
 return to_jsonb(p)||jsonb_build_object('userType',p.user_type,'isDemo',true);
end $$;
revoke all on function public.start_demo_session(text) from public,anon;
grant execute on function public.start_demo_session(text) to authenticated;

-- Keep integration directory edits and existing BOM assignments connected.
create or replace function solarflow_private.sync_demo_integration_staff()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='DELETE' then
  if old.category='integration_by' then
   if exists(select 1 from public.bom where demo_session_id=old.demo_session_id and (paper_prepared_by=old.label or material_loaded_by=old.label))
    or exists(select 1 from public.bom_items where demo_session_id=old.demo_session_id and integration_by=old.label) then
    raise exception 'Reassign this staff member in existing BOMs before deleting';
   end if;
   delete from public.demo_profiles where demo_session_id=old.demo_session_id and user_type='integration' and name=old.label;
  end if;
  return old;
 end if;
 if new.category='integration_by' then
  if tg_op='UPDATE' and old.label is distinct from new.label then
   update public.demo_profiles set name=new.label where demo_session_id=new.demo_session_id and user_type='integration' and name=old.label;
   update public.bom set paper_prepared_by=new.label where demo_session_id=new.demo_session_id and paper_prepared_by=old.label;
   update public.bom set material_loaded_by=new.label where demo_session_id=new.demo_session_id and material_loaded_by=old.label;
   update public.bom_items set integration_by=new.label where demo_session_id=new.demo_session_id and integration_by=old.label;
  end if;
  insert into public.demo_profiles(demo_session_id,demo_profile_key,name,user_type,role)
  select new.demo_session_id,'metadata-'||new.id,new.label,'integration','Integration Staff'
  where not exists(select 1 from public.demo_profiles where demo_session_id=new.demo_session_id and user_type='integration' and name=new.label)
  on conflict(demo_session_id,demo_profile_key) do nothing;
 end if;
 return new;
end $$;
drop trigger if exists demo_integration_staff on public.metadata;
create trigger demo_integration_staff after insert or update or delete on public.metadata
 for each row execute function solarflow_private.sync_demo_integration_staff();

-- Upgrade all existing visitors without signing in to another account.
do $$ declare p record; old_uid text:=current_setting('request.jwt.claim.sub',true); begin
 for p in select id,user_type from public.profiles where id=demo_session_id loop
  perform set_config('request.jwt.claim.sub',p.id::text,true);
  perform public.start_demo_session(p.user_type);
 end loop;
 perform set_config('request.jwt.claim.sub',coalesce(old_uid,''),true);
end $$;
commit;
select demo_session_id,subsidy_tag,count(*) from public.admin where demo_seed_key like 'solarflow-50-v1-%' group by 1,2 order by 1,2;
select demo_session_id,loan_tag,count(*) from public.admin where demo_seed_key like 'solarflow-50-v1-%' group by 1,2 order by 1,2;
select demo_session_id,name,user_type from public.demo_profiles order by demo_session_id,name;
