-- Client edits are drafts until the quotation is submitted. Draft writes do not
-- touch enquiries, so typing cannot queue repeated notification emails.
begin;

create table enquiry_private.client_form_drafts (
    kind text not null check (kind in ('prepared', 'enquiry')),
    form_id uuid not null,
    code_hash text not null,
    access_code text not null,
    answers jsonb not null,
    updated_at timestamptz not null default now(),
    primary key (kind, form_id)
);
alter table enquiry_private.client_form_drafts enable row level security;
revoke all on enquiry_private.client_form_drafts from public, anon, authenticated;

create or replace function enquiry_private.client_form_draft_access(
    p_kind text, p_id uuid, p_code text
) returns text language plpgsql security definer set search_path = '' as $$
declare expected_hash text; saved_hash text;
begin
    if auth.uid() is null then
        raise exception 'A form session is required.' using errcode = '42501';
    end if;
    if p_id is null or p_kind not in ('prepared', 'enquiry')
        or p_code is null or p_code !~ '^[0-9]{4}$' then
        raise exception 'Invalid form access.' using errcode = '22023';
    end if;
    expected_hash := encode(sha256(convert_to(p_id::text || p_code, 'UTF8')), 'hex');
    if p_kind = 'prepared' then
        if not exists (
            select 1 from enquiry_private.prepared_briefs b
            where b.id = p_id and b.code_hash = expected_hash
              and b.expires_at > now()
              and (b.locked_until is null or b.locked_until <= now())
        ) then
            raise exception 'This prepared form could not be opened.' using errcode = '42501';
        end if;
    else
        select d.code_hash into saved_hash from enquiry_private.client_form_drafts d
        where d.kind = 'enquiry' and d.form_id = p_id;
        if saved_hash is not null then
            if saved_hash <> expected_hash then
                raise exception 'This enquiry could not be opened.' using errcode = '42501';
            end if;
        elsif not exists (
            select 1 from public.enquiries e
            where e.id = p_id and right(e.mobile_number, 4) = p_code
        ) then
            raise exception 'This enquiry could not be opened.' using errcode = '42501';
        end if;
    end if;
    return expected_hash;
end;
$$;
revoke all on function enquiry_private.client_form_draft_access(text, uuid, text) from public, anon, authenticated;

create or replace function enquiry_private.read_client_form_draft(
    p_kind text, p_id uuid, p_code text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
    perform enquiry_private.client_form_draft_access(p_kind, p_id, p_code);
    select d.answers into result from enquiry_private.client_form_drafts d
    where d.kind = p_kind and d.form_id = p_id;
    return result;
end;
$$;
revoke all on function enquiry_private.read_client_form_draft(text, uuid, text) from public, anon;
grant execute on function enquiry_private.read_client_form_draft(text, uuid, text) to authenticated;

create or replace function enquiry_private.save_client_form_draft(
    p_kind text, p_id uuid, p_code text, p_answers jsonb
) returns timestamptz language plpgsql security definer set search_path = '' as $$
declare verified_hash text; saved_at timestamptz;
begin
    verified_hash := enquiry_private.client_form_draft_access(p_kind, p_id, p_code);
    if p_answers is null or jsonb_typeof(p_answers) <> 'object'
        or octet_length(p_answers::text) > 16000
        or exists (select 1 from jsonb_object_keys(p_answers) as field
            where field not in ('name','mobile','company','callDate','callTime','interests',
                'hasWebsite','teamSize','customerCount','liveCustomerCount','software',
                'otherSoftware','dataStart','fileStorage','storageProvider','branches',
                'partnerOffices','channelPartners','installationTeams','stampStaffLogin',
                'technicianLogin','customRequest'))
        or exists (select 1 from jsonb_each(p_answers) as field(key, value)
            where (field.key in ('interests','software') and jsonb_typeof(field.value) <> 'array')
               or (field.key not in ('interests','software') and jsonb_typeof(field.value) <> 'string'))
        or length(coalesce(p_answers->>'name','')) > 200
        or length(coalesce(p_answers->>'mobile','')) > 20
        or length(coalesce(p_answers->>'company','')) > 300
        or length(coalesce(p_answers->>'customRequest','')) > 5000
        or exists (select 1 from jsonb_each_text(p_answers) as field(key, value)
            where field.key not in ('interests','software','name','mobile','company','customRequest')
              and length(field.value) > 200)
        or jsonb_array_length(coalesce(p_answers->'interests', '[]'::jsonb)) > 50
        or jsonb_array_length(coalesce(p_answers->'software', '[]'::jsonb)) > 20
        or exists (select 1 from jsonb_array_elements(coalesce(p_answers->'interests', '[]'::jsonb)) as item
            where jsonb_typeof(item) <> 'string' or length(item #>> '{}') > 120)
        or exists (select 1 from jsonb_array_elements(coalesce(p_answers->'software', '[]'::jsonb)) as item
            where jsonb_typeof(item) <> 'string' or length(item #>> '{}') > 120) then
        raise exception 'Invalid draft answers.' using errcode = '22023';
    end if;
    insert into enquiry_private.client_form_drafts(kind, form_id, code_hash, access_code, answers)
    values (p_kind, p_id, verified_hash, p_code, p_answers)
    on conflict (kind, form_id) do update
      set answers = excluded.answers, updated_at = now()
      where enquiry_private.client_form_drafts.code_hash = excluded.code_hash
    returning updated_at into saved_at;
    if saved_at is null then
        raise exception 'This form could not be saved.' using errcode = '42501';
    end if;
    return saved_at;
end;
$$;
revoke all on function enquiry_private.save_client_form_draft(text, uuid, text, jsonb) from public, anon;
grant execute on function enquiry_private.save_client_form_draft(text, uuid, text, jsonb) to authenticated;

create or replace function public.read_client_form_draft(p_kind text, p_id uuid, p_code text)
returns jsonb language sql security invoker set search_path = '' as $$
    select enquiry_private.read_client_form_draft(p_kind, p_id, p_code);
$$;
revoke all on function public.read_client_form_draft(text, uuid, text) from public, anon;
grant execute on function public.read_client_form_draft(text, uuid, text) to authenticated;

create or replace function public.save_client_form_draft(p_kind text, p_id uuid, p_code text, p_answers jsonb)
returns timestamptz language sql security invoker set search_path = '' as $$
    select enquiry_private.save_client_form_draft(p_kind, p_id, p_code, p_answers);
$$;
revoke all on function public.save_client_form_draft(text, uuid, text, jsonb) from public, anon;
grant execute on function public.save_client_form_draft(text, uuid, text, jsonb) to authenticated;

-- A submitted enquiry may be edited after the client changes their phone
-- number. The original link code remains valid through the private draft hash.
create or replace function enquiry_private.finalize_client_enquiry(
    p_id uuid, p_code text, p_name text, p_mobile text,
    p_company text, p_version text, p_notes text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare saved_id uuid;
begin
    perform enquiry_private.client_form_draft_access('enquiry', p_id, p_code);
    if p_name is null or btrim(p_name) = '' or length(p_name) > 200
        or p_mobile is null or p_mobile !~ '^[0-9]{10}$'
        or length(coalesce(p_company,'')) > 300
        or p_version not in ('basic','advance','both')
        or p_notes is null or length(p_notes) > 10000 then
        raise exception 'Enter valid enquiry details.' using errcode = '22023';
    end if;
    update public.enquiries
       set name = btrim(p_name), mobile_number = p_mobile,
           company_name = nullif(btrim(p_company), ''),
           version_type = p_version, notes = p_notes, updated_at = now()
     where id = p_id returning id into saved_id;
    return saved_id;
end;
$$;
revoke all on function enquiry_private.finalize_client_enquiry(uuid, text, text, text, text, text, text) from public, anon;
grant execute on function enquiry_private.finalize_client_enquiry(uuid, text, text, text, text, text, text) to authenticated;

create or replace function public.finalize_client_enquiry(
    p_id uuid, p_code text, p_name text, p_mobile text,
    p_company text, p_version text, p_notes text
) returns uuid language sql security invoker set search_path = '' as $$
    select enquiry_private.finalize_client_enquiry(
        p_id, p_code, p_name, p_mobile, p_company, p_version, p_notes);
$$;
revoke all on function public.finalize_client_enquiry(uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.finalize_client_enquiry(uuid, text, text, text, text, text, text) to authenticated;

create or replace function enquiry_private.open_submitted_enquiry(p_id uuid, p_phone_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare item jsonb;
begin
    if p_id is null or p_phone_code is null or p_phone_code !~ '^[0-9]{4}$' then
        return null;
    end if;
    perform enquiry_private.client_form_draft_access('enquiry', p_id, p_phone_code);
    select jsonb_build_object(
        'kind', 'enquiry', 'id', e.id, 'name', e.name,
        'mobile', e.mobile_number, 'company', e.company_name,
        'version', e.version_type, 'notes', e.notes, 'created_at', e.created_at
    ) into item from public.enquiries e where e.id = p_id;
    return item;
end;
$$;

create or replace function enquiry_private.find_submitted_enquiries(p_phone_suffix text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare matches jsonb;
begin
    if auth.uid() is null then
        raise exception 'An enquiry session is required.' using errcode = '42501';
    end if;
    if p_phone_suffix is null or p_phone_suffix !~ '^[0-9]{4}$' then
        return '[]'::jsonb;
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', e.id, 'name', e.name, 'mobile', e.mobile_number,
        'company', e.company_name, 'version', e.version_type,
        'notes', e.notes, 'created_at', e.created_at,
        'access_code', coalesce(d.access_code, right(e.mobile_number, 4))
    ) order by e.created_at desc), '[]'::jsonb) into matches
    from public.enquiries e
    left join enquiry_private.client_form_drafts d
      on d.kind = 'enquiry' and d.form_id = e.id
    where coalesce(d.access_code, right(e.mobile_number, 4)) = p_phone_suffix;
    return matches;
end;
$$;

create or replace function enquiry_private.admin_enquiry_catalog(p_pin text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare items jsonb;
begin
    if auth.uid() is null or p_pin is distinct from '0905' then
        raise exception 'Incorrect preparation code.' using errcode = '42501';
    end if;
    select coalesce(jsonb_agg(item.data order by item.created_at desc), '[]'::jsonb)
      into items from (
        select e.created_at, jsonb_build_object(
            'kind', 'enquiry', 'id', e.id, 'name', coalesce(d.answers->>'name',e.name),
            'mobile', coalesce(d.answers->>'mobile',e.mobile_number),
            'company', coalesce(d.answers->>'company',e.company_name),
            'notes', e.notes, 'version', e.version_type,
            'created_at', e.created_at, 'draft_updated_at', d.updated_at,
            'access_code', coalesce(d.access_code, right(e.mobile_number, 4))
        ) as data from public.enquiries e
        left join enquiry_private.client_form_drafts d
          on d.kind = 'enquiry' and d.form_id = e.id
        union all
        select b.created_at, jsonb_build_object(
            'kind', 'prepared', 'id', b.id,
            'name', coalesce(d.answers->>'name',b.answers->>'name'),
            'mobile', coalesce(d.answers->>'mobile',b.answers->>'mobile'),
            'company', coalesce(d.answers->>'company',b.answers->>'company'),
            'interests', coalesce(d.answers->'interests',b.answers->'interests'),
            'created_at', b.created_at, 'expires_at', b.expires_at,
            'locked_until', b.locked_until, 'draft_updated_at', d.updated_at,
            'access_code', case when b.code_hash = encode(sha256(convert_to(
                b.id::text || right(b.answers->>'mobile',4), 'UTF8')), 'hex')
                then right(b.answers->>'mobile',4) else null end,
            'access_status', case
                when b.expires_at <= now() then 'expired'
                when b.code_hash <> encode(sha256(convert_to(
                    b.id::text || right(b.answers->>'mobile', 4), 'UTF8')), 'hex') then 'older_code'
                when b.locked_until > now() then 'paused'
                else 'ready' end,
            'can_share', b.expires_at > now()
                and (b.locked_until is null or b.locked_until <= now())
                and b.code_hash = encode(sha256(convert_to(
                    b.id::text || right(b.answers->>'mobile', 4), 'UTF8')), 'hex')
        ) as data from enquiry_private.prepared_briefs b
        left join enquiry_private.client_form_drafts d
          on d.kind = 'prepared' and d.form_id = b.id
    ) item;
    return items;
end;
$$;

commit;
