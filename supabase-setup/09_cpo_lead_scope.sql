-- Run after 08. CPO visibility follows lead creator and dealer-parent IDs, not name substrings.
begin;
alter table public.demo_profiles add column if not exists parent_profile_id uuid;
alter table public.profiles add column if not exists cpo_profile_id uuid;
alter table public.admin add column if not exists lead_creator_profile_id uuid;
do $$ begin
 if not exists(select 1 from pg_constraint where conname='demo_dealer_parent_fk' and conrelid='public.demo_profiles'::regclass) then
  alter table public.demo_profiles add constraint demo_dealer_parent_fk foreign key(parent_profile_id,demo_session_id) references public.demo_profiles(id,demo_session_id);
 end if;
 if not exists(select 1 from pg_constraint where conname='demo_lead_creator_fk' and conrelid='public.admin'::regclass) then
  alter table public.admin add constraint demo_lead_creator_fk foreign key(lead_creator_profile_id,demo_session_id) references public.demo_profiles(id,demo_session_id);
 end if;
end $$;
create index if not exists admin_lead_creator on public.admin(demo_session_id,lead_creator_profile_id);
create index if not exists demo_profiles_parent on public.demo_profiles(demo_session_id,parent_profile_id);
create or replace function public.current_demo_cpo()
returns uuid language sql stable security definer set search_path='' as $$
 select case when p.user_type='channel_partner_office' then p.demo_profile_id
 when p.user_type='office2' then d.parent_profile_id else null end
 from public.profiles p left join public.demo_profiles d on d.id=p.demo_profile_id and d.demo_session_id=auth.uid()
 where p.id=auth.uid() and p.demo_session_id=auth.uid();
$$;
create or replace function public.can_view_demo_lead(p_creator uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select case when p.user_type in ('channel_partner_office','office2') then
  p_creator=public.current_demo_cpo() or exists(select 1 from public.demo_profiles d
   where d.demo_session_id=auth.uid() and d.id=p_creator and d.user_type='agent2' and d.parent_profile_id=public.current_demo_cpo())
 else true end from public.profiles p where p.id=auth.uid() and p.demo_session_id=auth.uid();
$$;
create or replace function public.assign_demo_lead_creator()
returns trigger language plpgsql security invoker set search_path='' as $$
declare p public.profiles; d public.demo_profiles; parent public.demo_profiles;
begin
 select * into p from public.profiles where id=auth.uid();
 if tg_op='UPDATE' then
  if p.user_type not in ('admin','sales') and new.lead_creator_profile_id is distinct from old.lead_creator_profile_id then raise exception 'Lead ownership can only be changed by head office';end if;
  return new;
 end if;
 if p.user_type in ('channel_partner_office','office2') then
  new.lead_creator_profile_id:=public.current_demo_cpo();
  select * into parent from public.demo_profiles where id=new.lead_creator_profile_id and demo_session_id=auth.uid();
  if parent.id is null then raise exception 'CPO hierarchy unavailable';end if;
  new.channel_partner:=parent.channel_partner;new.sub_channel_partner:=null;
 elsif p.user_type='agent2' then
  select * into d from public.demo_profiles where id=p.demo_profile_id and demo_session_id=auth.uid();
  new.lead_creator_profile_id:=d.id;new.channel_partner:=d.channel_partner;new.sub_channel_partner:=d.name;
 elsif p.user_type='admin' and new.demo_seed_key ~ '^solarflow-50-v1-[0-9]+$' then new.lead_creator_profile_id:=null;
 else new.lead_creator_profile_id:=coalesce(new.lead_creator_profile_id,p.demo_profile_id);
 end if;
 return new;
end $$;
drop trigger if exists assign_demo_lead_creator on public.admin;
create trigger assign_demo_lead_creator before insert or update of lead_creator_profile_id on public.admin for each row execute function public.assign_demo_lead_creator();
create or replace function public.seed_demo_cpo_hierarchy()
returns void language plpgsql security invoker set search_path='' as $$
declare cpo uuid; dealer uuid; head uuid; other_cpo uuid; other_dealer uuid; c record; n integer;
begin
 select id into cpo from public.demo_profiles where demo_session_id=auth.uid() and demo_profile_key='channel_partner_office';
 select id into dealer from public.demo_profiles where demo_session_id=auth.uid() and demo_profile_key='agent2';
 select id into head from public.demo_profiles where demo_session_id=auth.uid() and demo_profile_key='admin';
 update public.demo_profiles set parent_profile_id=cpo where demo_session_id=auth.uid() and demo_profile_key in ('agent2','office2') and parent_profile_id is null;
 insert into public.demo_profiles(demo_profile_key,name,user_type,role,channel_partner)
 values('sample-cpo-cedar','Demo Cedar Office','channel_partner_office','Channel Partner Office','Demo Cedar Solar')
 on conflict(demo_session_id,demo_profile_key) do nothing;
 select id into other_cpo from public.demo_profiles where demo_session_id=auth.uid() and demo_profile_key='sample-cpo-cedar';
 insert into public.demo_profiles(demo_profile_key,name,user_type,role,channel_partner,parent_profile_id)
 values('sample-dealer-cedar','Demo Cedar Dealer','agent2','Dealer','Demo Cedar Solar',other_cpo)
 on conflict(demo_session_id,demo_profile_key) do nothing;
 select id into other_dealer from public.demo_profiles where demo_session_id=auth.uid() and demo_profile_key='sample-dealer-cedar';
 for c in select * from public.admin where demo_session_id=auth.uid() and lead_creator_profile_id is null loop
  if c.demo_seed_key ~ '^solarflow-50-v1-[0-9]+$' and c.channel_partner='Demo Aurora Solar' and c.sub_channel_partner='Demo Dealer' then
   n:=split_part(c.demo_seed_key,'-',4)::integer;
   update public.admin set lead_creator_profile_id=case when n<=10 then cpo when n<=20 then dealer when n<=35 then other_dealer else head end,
    channel_partner=case when n<=20 then 'Demo Aurora Solar' when n<=35 then 'Demo Cedar Solar' else 'Demo Head Office' end,
    sub_channel_partner=case when n<=10 or n>35 then null when n<=20 then 'Demo Dealer' else 'Demo Cedar Dealer' end where id=c.id;
  else
   -- Older leads have no creator ID. Adopt their existing dealer assignment or direct CPO branch.
   update public.admin set lead_creator_profile_id=coalesce(
    (select id from public.demo_profiles where demo_session_id=auth.uid() and user_type='agent2' and name=c.sub_channel_partner and channel_partner=c.channel_partner limit 1),
    (select id from public.demo_profiles where demo_session_id=auth.uid() and user_type='channel_partner_office' and channel_partner=c.channel_partner and nullif(c.sub_channel_partner,'') is null limit 1),head) where id=c.id;
  end if;
 end loop;
end $$;
-- Seed as head office within this transaction, then activate the chosen persona.
-- The shared visitor may choose any demo role; this is not a production login boundary.
create or replace function public.start_demo_session(p_role text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare u uuid:=auth.uid(); r public.demo_roles; p public.profiles; d public.demo_profiles;
begin
 if u is null then raise exception 'Call signInAnonymously() first';end if;
 select * into r from public.demo_roles where user_type=p_role;if not found then raise exception 'Unknown demo role';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 insert into public.profiles(id,demo_session_id,name,email,user_type,role,channel_partner)
 values(u,u,'Demo Admin','demo.admin@solarflow.example','admin','Admin','Demo Aurora Solar')
 on conflict(id) do update set user_type='admin',role='Admin';
 perform public.anonymize_demo_labels();perform public.seed_demo_inventory();perform public.anonymize_demo_labels();
 perform public.seed_demo_installation_payments();perform public.consolidate_demo_vendors();
 perform public.seed_demo_cpo_hierarchy();
 select * into d from public.demo_profiles where demo_session_id=u and demo_profile_key=p_role and status='active';
 if not found then raise exception 'This demo role is inactive';end if;
 update public.profiles set name=d.name,email=d.email,user_type=d.user_type,role=d.role,channel_partner=d.channel_partner,status=d.status,demo_profile_id=d.id,
 cpo_profile_id=case when d.user_type='channel_partner_office' then d.id when d.user_type='office2' then d.parent_profile_id else null end where id=u returning * into p;
 return to_jsonb(p)||jsonb_build_object('userType',p.user_type,'isDemo',true);
end $$;
-- Apply ownership to existing sandboxes before enabling the restriction.
do $$ declare p record; old_uid text:=current_setting('request.jwt.claim.sub',true);begin
 for p in select id,user_type from public.profiles where id=demo_session_id loop
  perform set_config('request.jwt.claim.sub',p.id::text,true);perform public.start_demo_session(p.user_type);
 end loop;
 perform set_config('request.jwt.claim.sub',coalesce(old_uid,''),true);
end $$;
drop policy if exists cpo_lead_scope on public.admin;
create policy cpo_lead_scope on public.admin as restrictive for all to authenticated
 using(public.can_view_demo_lead(lead_creator_profile_id)) with check(public.can_view_demo_lead(lead_creator_profile_id));
create or replace view public.cpo_leads with (security_invoker=true) as select * from public.admin where public.current_demo_cpo() is not null and public.can_view_demo_lead(lead_creator_profile_id);
grant select on public.cpo_leads to authenticated;
-- Related lead documents and BOMs follow the same lead visibility.
drop policy if exists cpo_document_scope on public.documents;
create policy cpo_document_scope on public.documents as restrictive for all to authenticated using(exists(select 1 from public.admin where id=customer_id)) with check(exists(select 1 from public.admin where id=customer_id));
drop policy if exists cpo_bom_scope on public.bom;
create policy cpo_bom_scope on public.bom as restrictive for all to authenticated using(exists(select 1 from public.admin where id=admin_id)) with check(exists(select 1 from public.admin where id=admin_id));
drop policy if exists cpo_bom_item_scope on public.bom_items;
create policy cpo_bom_item_scope on public.bom_items as restrictive for all to authenticated using(exists(select 1 from public.bom where id=bom_id)) with check(exists(select 1 from public.bom where id=bom_id));
create or replace function public.get_cpo_dashboard_metrics(p_dealer text default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if public.current_demo_cpo() is null then raise exception 'Select the CPO role again to view these leads';end if;
 return public.get_dashboard_metrics_scoped(null,p_dealer);
end $$;
revoke all on function public.current_demo_cpo(),public.can_view_demo_lead(uuid),public.assign_demo_lead_creator(),public.seed_demo_cpo_hierarchy(),public.get_cpo_dashboard_metrics(text) from public,anon;
grant execute on function public.current_demo_cpo(),public.can_view_demo_lead(uuid),public.seed_demo_cpo_hierarchy(),public.get_cpo_dashboard_metrics(text) to authenticated;
commit;
