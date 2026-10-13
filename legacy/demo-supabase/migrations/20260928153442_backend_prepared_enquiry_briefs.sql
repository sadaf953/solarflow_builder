-- Prepared business answers stay in a private table. A client needs both the
-- unguessable link ID and a separate access code to retrieve them.
begin;

create table if not exists enquiry_private.prepared_briefs (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null,
    answers jsonb not null,
    code_hash text not null,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null default (now() + interval '30 days')
);
create index if not exists prepared_briefs_owner_created
    on enquiry_private.prepared_briefs(owner_id, created_at desc);
alter table enquiry_private.prepared_briefs enable row level security;
revoke all on enquiry_private.prepared_briefs from public, anon, authenticated;

create or replace function enquiry_private.create_prepared_brief(p_answers jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare brief_id uuid := gen_random_uuid(); access_code text;
begin
    if auth.uid() is null then
        raise exception 'Sign in before preparing a client form.' using errcode = '42501';
    end if;
    if p_answers is null or jsonb_typeof(p_answers) <> 'object'
        or p_answers = '{}'::jsonb or octet_length(p_answers::text) > 6000
        or exists (select 1 from jsonb_object_keys(p_answers) as answer_key
            where answer_key not in ('hasWebsite','teamSize','customerCount','liveCustomerCount',
                'software','branches','partnerOffices','channelPartners','interests')) then
        raise exception 'Choose valid business answers before creating a link.' using errcode = '22023';
    end if;
    if (select count(*) from enquiry_private.prepared_briefs
        where owner_id = auth.uid() and created_at > now() - interval '1 day') >= 50 then
        raise exception 'Daily prepared-form limit reached. Try again tomorrow.' using errcode = '22023';
    end if;
    access_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    insert into enquiry_private.prepared_briefs(id, owner_id, answers, code_hash)
    values(brief_id, auth.uid(), p_answers,
        encode(sha256(convert_to(brief_id::text || access_code, 'UTF8')), 'hex'));
    return jsonb_build_object('id', brief_id, 'code', access_code);
end;
$$;
revoke all on function enquiry_private.create_prepared_brief(jsonb) from public, anon;
grant execute on function enquiry_private.create_prepared_brief(jsonb) to authenticated;

create or replace function enquiry_private.unlock_prepared_brief(p_id uuid, p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare brief enquiry_private.prepared_briefs%rowtype; normalized_code text;
begin
    if auth.uid() is null then
        raise exception 'Sign in before opening a prepared form.' using errcode = '42501';
    end if;
    normalized_code := upper(regexp_replace(coalesce(p_code, ''), '[[:space:]-]', '', 'g'));
    if p_id is null or normalized_code !~ '^[0-9A-F]{12}$' then return null; end if;
    select * into brief from enquiry_private.prepared_briefs
        where id = p_id and expires_at > now();
    if not found or brief.code_hash <>
        encode(sha256(convert_to(p_id::text || normalized_code, 'UTF8')), 'hex') then
        return null;
    end if;
    return brief.answers;
end;
$$;
revoke all on function enquiry_private.unlock_prepared_brief(uuid, text) from public, anon;
grant execute on function enquiry_private.unlock_prepared_brief(uuid, text) to authenticated;

create or replace function public.create_prepared_brief(p_answers jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
    select enquiry_private.create_prepared_brief(p_answers);
$$;
revoke all on function public.create_prepared_brief(jsonb) from public, anon;
grant execute on function public.create_prepared_brief(jsonb) to authenticated;

create or replace function public.unlock_prepared_brief(p_id uuid, p_code text)
returns jsonb language sql security invoker set search_path = '' as $$
    select enquiry_private.unlock_prepared_brief(p_id, p_code);
$$;
revoke all on function public.unlock_prepared_brief(uuid, text) from public, anon;
grant execute on function public.unlock_prepared_brief(uuid, text) to authenticated;

commit;
