-- A four-digit shared code opens the preparation flow and is checked again
-- when creating a brief. Existing client links continue to unlock normally.
begin;

drop function if exists public.create_prepared_brief(jsonb);
drop function if exists enquiry_private.create_prepared_brief(jsonb);

create or replace function public.verify_preparation_pin(p_pin text)
returns boolean language sql security invoker set search_path = '' as $$
    select auth.uid() is not null and p_pin = '0905';
$$;
revoke all on function public.verify_preparation_pin(text) from public, anon;
grant execute on function public.verify_preparation_pin(text) to authenticated;

create or replace function enquiry_private.create_prepared_brief(p_answers jsonb, p_prepare_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare brief_id uuid := gen_random_uuid(); access_code text;
begin
    if auth.uid() is null then
        raise exception 'Sign in before preparing a client form.' using errcode = '42501';
    end if;
    if p_prepare_code is distinct from '0905' then
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
                'partnerOffices','channelPartners','interests','fileStorage','storageProvider'))
        or (p_answers ? 'otherSoftware' and (
            jsonb_typeof(p_answers->'otherSoftware') <> 'string'
            or length(p_answers->>'otherSoftware') > 200
            or not coalesce(p_answers->'software' ? 'Other third-party software', false)))
        or (p_answers ? 'fileStorage' and p_answers->>'fileStorage' not in ('Yes','No'))
        or (p_answers ? 'storageProvider' and (
            p_answers->>'fileStorage' is distinct from 'Yes'
            or p_answers->>'storageProvider' not in
                ('Google personal account','Google Workspace business account','Supabase Storage'))) then
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

create or replace function public.create_prepared_brief(p_answers jsonb, p_prepare_code text)
returns jsonb language sql security invoker set search_path = '' as $$
    select enquiry_private.create_prepared_brief(p_answers, p_prepare_code);
$$;
revoke all on function public.create_prepared_brief(jsonb, text) from public, anon;
grant execute on function public.create_prepared_brief(jsonb, text) to authenticated;

commit;
