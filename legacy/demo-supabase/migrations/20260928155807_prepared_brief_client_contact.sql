-- Optional contact details remain in the private brief until the client opens
-- the link with its separate access code.
begin;
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
            where answer_key not in ('name','mobile','company','hasWebsite','teamSize',
                'customerCount','liveCustomerCount','software','otherSoftware','branches',
                'partnerOffices','channelPartners','interests','fileStorage','storageProvider'))
        or (p_answers ? 'name' and (jsonb_typeof(p_answers->'name') <> 'string'
            or length(p_answers->>'name') > 200 or btrim(p_answers->>'name') = ''))
        or (p_answers ? 'mobile' and (jsonb_typeof(p_answers->'mobile') <> 'string'
            or p_answers->>'mobile' !~ '^[0-9]{10}$'))
        or (p_answers ? 'company' and (jsonb_typeof(p_answers->'company') <> 'string'
            or length(p_answers->>'company') > 300 or btrim(p_answers->>'company') = ''))
        or (p_answers ? 'otherSoftware' and (
            jsonb_typeof(p_answers->'otherSoftware') <> 'string'
            or length(p_answers->>'otherSoftware') > 200
            or not coalesce(p_answers->'software' ? 'Other third-party software', false)))
        or (p_answers ? 'fileStorage' and p_answers->>'fileStorage' not in ('Yes','No'))
        or (p_answers ? 'storageProvider' and (
            p_answers->>'fileStorage' is distinct from 'Yes'
            or p_answers->>'storageProvider' not in
                ('Google personal account','Google Workspace business account','Supabase Storage'))) then
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
commit;
