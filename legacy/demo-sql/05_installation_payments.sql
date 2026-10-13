-- Run after 04. Uses the existing inventory tables; creates NO tables.
-- Sample installation costs/statuses only. No actual payment is sent.
begin;
alter table public.profiles add column if not exists installation_payment_seed_version integer not null default 0;
create or replace function public.seed_demo_installation_payments()
returns void language plpgsql security invoker set search_path='' as $$
declare u uuid:=auth.uid(); c record; n integer:=0; delivered date;
begin
 if u is null then raise exception 'Sign in first'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 if exists(select 1 from public.profiles where id=u and installation_payment_seed_version>=5) then return;end if;
 for c in select * from public.admin where demo_session_id=u and deleted_at is null
  and demo_seed_key like 'solarflow-50-v1-%' and vendor_quote is null
  and coalesce(vendor_payment_status,'Pending')='Pending' and vendor_paid_date is null
  and nullif(vendor,'') is not null and installation_status in ('Pending','Completed')
  and stage in ('GEO TAG PHOTO','DISCOM SUBMISSION','METER INSTALLATION','DISCOM INSPECTION','SUBSIDY STATUS','FINAL REVIEW','COMPLETED')
  and nullif(material_delivery_date,'') is null and nullif(installation_date,'') is null
  order by demo_seed_key limit 12 loop
  n:=n+1;
  delivered:=current_date-(case when n%3=0 then 8 else 45 end)-n;
  update public.admin set installation_status='Yes',vendor_quote=round(coalesce(system_capacity_kwp,3)*2200+n*125),
   material_delivery_date=delivered::text,installation_date=(delivered+3)::text,
   vendor_payment_status=case when n%3=1 then 'Paid' else 'Pending' end,
   vendor_paid_date=case when n%3=1 then (date_trunc('month',delivered)+interval '1 month')::date::text else null end
   where id=c.id;
 end loop;
 update public.profiles set installation_payment_seed_version=5 where id=u;
end $$;
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
 perform public.seed_demo_inventory();
 perform public.seed_demo_installation_payments();
 select * into d from public.demo_profiles where demo_session_id=u and demo_profile_key=p_role and status='active';
 if not found then raise exception 'This demo role is inactive'; end if;
 update public.profiles set name=d.name,email=d.email,user_type=d.user_type,role=d.role,channel_partner=d.channel_partner,
 status=d.status,demo_profile_id=d.id where id=u returning * into p;
 return to_jsonb(p)||jsonb_build_object('userType',p.user_type,'isDemo',true);
end $$;
revoke all on function public.seed_demo_installation_payments() from public,anon;
grant execute on function public.seed_demo_installation_payments() to authenticated;
do $$ declare p record; old_uid text:=current_setting('request.jwt.claim.sub',true);begin
 for p in select id,user_type from public.profiles where id=demo_session_id loop
  perform set_config('request.jwt.claim.sub',p.id::text,true);perform public.start_demo_session(p.user_type);
 end loop;
 perform set_config('request.jwt.claim.sub',coalesce(old_uid,''),true);
end $$;
commit;
