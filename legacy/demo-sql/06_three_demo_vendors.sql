-- Run after 05. Keep exactly three seeded demo vendors; preserve custom vendors.
begin;
create or replace function public.consolidate_demo_vendors()
returns void language plpgsql security invoker set search_path='' as $$
declare u uuid:=auth.uid(); v record; n integer;
begin
 if u is null then raise exception 'Sign in first'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 for n in 1..3 loop
  insert into public.vendors(name,email,phone) values('Demo Vendor '||n,
   case when n=1 then 'demo.vendor@solarflow.example' else 'vendor.'||n||'@solarflow.example' end,
   '000000000'||n) on conflict(demo_session_id,name) do nothing;
 end loop;
 -- Distribute the formerly unnumbered sample vendor across the three vendors.
 update public.admin set vendor='Demo Vendor '||(1+(split_part(demo_seed_key,'-',4)::integer-1)%3)
 where demo_session_id=u and vendor='Demo Vendor' and demo_seed_key ~ '^solarflow-50-v1-[0-9]+$';
 for v in select name from public.vendors where demo_session_id=u
  and name ~ '^Demo Vendor( [0-9]+)?$' and name not in ('Demo Vendor 1','Demo Vendor 2','Demo Vendor 3') loop
  n:=case when v.name='Demo Vendor' then 1 else 1+(substring(v.name from '[0-9]+$')::integer-1)%3 end;
  update public.admin set vendor='Demo Vendor '||n where demo_session_id=u and vendor=v.name;
  update public.delivery_batches set vendor='Demo Vendor '||n where demo_session_id=u and vendor=v.name;
  update public.metadata set label='Demo Vendor '||n where demo_session_id=u and category='vendor' and label=v.name
   and not exists(select 1 from public.metadata where demo_session_id=u and category='vendor' and label='Demo Vendor '||n);
  delete from public.metadata where demo_session_id=u and category='vendor' and label=v.name;
  delete from public.vendors where demo_session_id=u and name=v.name;
 end loop;
 update public.demo_profiles set name='Demo Vendor 1' where demo_session_id=u and demo_profile_key='vendor';
 update public.profiles set name='Demo Vendor 1' where id=u and user_type='vendor';
 update public.vendors set email=d.email from public.demo_profiles d
 where public.vendors.demo_session_id=u and public.vendors.name='Demo Vendor 1' and d.demo_session_id=u and d.demo_profile_key='vendor';
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
 perform public.consolidate_demo_vendors();
 select * into d from public.demo_profiles where demo_session_id=u and demo_profile_key=p_role and status='active';
 if not found then raise exception 'This demo role is inactive'; end if;
 update public.profiles set name=d.name,email=d.email,user_type=d.user_type,role=d.role,channel_partner=d.channel_partner,
 status=d.status,demo_profile_id=d.id where id=u returning * into p;
 return to_jsonb(p)||jsonb_build_object('userType',p.user_type,'isDemo',true);
end $$;
revoke all on function public.consolidate_demo_vendors() from public,anon;
grant execute on function public.consolidate_demo_vendors() to authenticated;
do $$ declare p record; old_uid text:=current_setting('request.jwt.claim.sub',true);begin
 for p in select id,user_type from public.profiles where id=demo_session_id loop
  perform set_config('request.jwt.claim.sub',p.id::text,true);perform public.start_demo_session(p.user_type);
 end loop;
 perform set_config('request.jwt.claim.sub',coalesce(old_uid,''),true);
end $$;
commit;
