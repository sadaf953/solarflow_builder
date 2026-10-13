-- Temporary 0905 overview for the form preparer. Keep the code check in the
-- database; replace this with verified operator authentication later.
begin;

create or replace function enquiry_private.admin_enquiry_catalog(p_pin text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare items jsonb;
begin
    if auth.uid() is null or p_pin is distinct from '0905' then
        raise exception 'Incorrect preparation code.' using errcode = '42501';
    end if;
    select coalesce(jsonb_agg(item.data order by item.created_at desc), '[]'::jsonb)
      into items
      from (
        select e.created_at, jsonb_build_object(
            'kind', 'enquiry', 'id', e.id, 'name', e.name,
            'mobile', e.mobile_number, 'company', e.company_name,
            'notes', e.notes, 'version', e.version_type,
            'created_at', e.created_at
        ) as data
        from (select id, name, mobile_number, company_name, notes,
                     version_type, created_at from public.enquiries
              order by created_at desc) e
        union all
        select b.created_at, jsonb_build_object(
            'kind', 'prepared', 'id', b.id, 'name', b.answers->>'name',
            'mobile', b.answers->>'mobile', 'company', b.answers->>'company',
            'interests', b.answers->'interests', 'created_at', b.created_at,
            'expires_at', b.expires_at,
            'can_share', b.expires_at > now() and b.code_hash = encode(
                sha256(convert_to(b.id::text || right(b.answers->>'mobile', 4), 'UTF8')), 'hex')
        ) as data
        from (select id, answers, code_hash, created_at, expires_at
              from enquiry_private.prepared_briefs
              order by created_at desc) b
      ) item;
    return items;
end;
$$;
revoke all on function enquiry_private.admin_enquiry_catalog(text) from public, anon;
grant execute on function enquiry_private.admin_enquiry_catalog(text) to authenticated;

create or replace function public.admin_enquiry_catalog(p_pin text)
returns jsonb language sql security invoker set search_path = '' as $$
    select enquiry_private.admin_enquiry_catalog(p_pin);
$$;
revoke all on function public.admin_enquiry_catalog(text) from public, anon;
grant execute on function public.admin_enquiry_catalog(text) to authenticated;

create or replace function enquiry_private.open_submitted_enquiry(p_id uuid, p_phone_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare item jsonb;
begin
    if auth.uid() is null then
        raise exception 'An enquiry session is required.' using errcode = '42501';
    end if;
    if p_id is null or p_phone_code is null or p_phone_code !~ '^[0-9]{4}$' then
        return null;
    end if;
    select jsonb_build_object(
        'kind', 'enquiry', 'id', e.id, 'name', e.name,
        'mobile', e.mobile_number, 'company', e.company_name,
        'version', e.version_type, 'notes', e.notes, 'created_at', e.created_at
    ) into item
    from public.enquiries e
    where e.id = p_id and right(e.mobile_number, 4) = p_phone_code;
    return item;
end;
$$;
revoke all on function enquiry_private.open_submitted_enquiry(uuid, text) from public, anon;
grant execute on function enquiry_private.open_submitted_enquiry(uuid, text) to authenticated;

create or replace function public.open_submitted_enquiry(p_id uuid, p_phone_code text)
returns jsonb language sql security invoker set search_path = '' as $$
    select enquiry_private.open_submitted_enquiry(p_id, p_phone_code);
$$;
revoke all on function public.open_submitted_enquiry(uuid, text) from public, anon;
grant execute on function public.open_submitted_enquiry(uuid, text) to authenticated;

-- The preparation UI can save these additional optional answers. Earlier
-- validation rejected them even though the client form supported them.
create or replace function enquiry_private.create_prepared_brief(p_answers jsonb, p_prepare_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare brief_id uuid := gen_random_uuid(); access_code text;
begin
    if auth.uid() is null or p_prepare_code is distinct from '0905' then
        raise exception 'Incorrect preparation code.' using errcode = '42501';
    end if;
    if p_answers is null or jsonb_typeof(p_answers) <> 'object'
        or octet_length(p_answers::text) > 6000
        or jsonb_typeof(p_answers->'name') is distinct from 'string'
        or jsonb_typeof(p_answers->'mobile') is distinct from 'string'
        or jsonb_typeof(p_answers->'company') is distinct from 'string'
        or btrim(p_answers->>'name') = '' or length(p_answers->>'name') > 200
        or p_answers->>'mobile' !~ '^[0-9]{10}$'
        or btrim(p_answers->>'company') = '' or length(p_answers->>'company') > 300
        or exists (select 1 from jsonb_object_keys(p_answers) as answer_key
            where answer_key not in ('name','mobile','company','hasWebsite','teamSize',
                'customerCount','liveCustomerCount','software','otherSoftware','branches',
                'partnerOffices','channelPartners','interests','fileStorage','storageProvider',
                'dataStart','customRequest','installationTeams','stampStaffLogin','technicianLogin'))
        or (p_answers ? 'otherSoftware' and (
            jsonb_typeof(p_answers->'otherSoftware') <> 'string'
            or length(p_answers->>'otherSoftware') > 200
            or not coalesce(p_answers->'software' ? 'Other third-party software', false)))
        or (p_answers ? 'fileStorage' and p_answers->>'fileStorage' not in ('Yes','No'))
        or (p_answers ? 'storageProvider' and (
            p_answers->>'fileStorage' is distinct from 'Yes'
            or p_answers->>'storageProvider' not in
                ('Google personal account','Google Workspace business account','Supabase Storage')))
        or (p_answers ? 'dataStart' and p_answers->>'dataStart' not in
            ('Transfer existing data','Start fresh','Not sure'))
        or (p_answers ? 'customRequest' and (
            jsonb_typeof(p_answers->'customRequest') <> 'string'
            or length(p_answers->>'customRequest') > 2000))
        or exists (select 1 from (values ('installationTeams'),('stampStaffLogin'),('technicianLogin')) as key(name)
            where p_answers ? key.name and p_answers->>key.name not in ('Yes','No','Not sure')) then
        raise exception 'Enter valid client contact details and business answers.' using errcode = '22023';
    end if;
    if (select count(*) from enquiry_private.prepared_briefs
        where owner_id = auth.uid() and created_at > now() - interval '1 day') >= 50 then
        raise exception 'Daily prepared-form limit reached. Try again tomorrow.' using errcode = '22023';
    end if;
    access_code := right(p_answers->>'mobile', 4);
    insert into enquiry_private.prepared_briefs(id, owner_id, answers, code_hash)
    values(brief_id, auth.uid(), p_answers,
        encode(sha256(convert_to(brief_id::text || access_code, 'UTF8')), 'hex'));
    return jsonb_build_object('id', brief_id, 'code', access_code);
end;
$$;
revoke all on function enquiry_private.create_prepared_brief(jsonb, text) from public, anon;
grant execute on function enquiry_private.create_prepared_brief(jsonb, text) to authenticated;

commit;
