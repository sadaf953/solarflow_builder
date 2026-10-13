-- The fictional draft and code are rolled back; no real enquiry is created.
begin;
select set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
select set_config('qa.owner_id', current_setting('request.jwt.claim.sub'), true);
set local role authenticated;
do $$
begin
    if not public.verify_preparation_pin('0905') or public.verify_preparation_pin('0000') then
        raise exception 'FAIL: preparation PIN check did not enforce the configured code';
    end if;
    if to_regprocedure('public.create_prepared_brief(jsonb)') is not null then
        raise exception 'FAIL: old creation endpoint still bypasses the PIN';
    end if;
    begin
        perform public.create_prepared_brief(jsonb_build_object(
            'name','Test Client','mobile','9000000001','company','Example Solar'), '0000');
        raise exception 'FAIL: wrong PIN created a prepared form';
    exception when insufficient_privilege then null; end;
    begin
        perform public.create_prepared_brief(jsonb_build_object(
            'name','Test Client','mobile','9000000001'), '0905');
        raise exception 'FAIL: missing company created a prepared form';
    exception when invalid_parameter_value then null; end;
    begin
        perform public.create_prepared_brief(jsonb_build_object(
            'name','Test Client','mobile','9000000001','company','Example Solar',
            'installationTeams','Sometimes'), '0905');
        raise exception 'FAIL: invalid installation answer was accepted';
    exception when invalid_parameter_value then null; end;
    begin
        perform public.create_prepared_brief(jsonb_build_object(
            'name','Test Client','mobile','9000000001','company','Example Solar',
            'dataStart','Import everything'), '0905');
        raise exception 'FAIL: invalid transfer choice was accepted';
    exception when invalid_parameter_value then null; end;
end $$;
with created as (
    select public.create_prepared_brief(jsonb_build_object(
        'name','Test Client','mobile','9000000001','company','Example Solar',
        'hasWebsite','Yes','teamSize','4–9','software',jsonb_build_array('Tally','Other third-party software'),
        'otherSoftware','Example ERP',
        'fileStorage','Yes','storageProvider','Google Workspace business account',
        'installationTeams','Yes','stampStaffLogin','No','technicianLogin','Not sure',
        'dataStart','Transfer existing data','customRequest','Please import our current customers',
        'interests',jsonb_build_array('DISCOM submission document maker')), '0905') as result
)
select set_config('qa.brief_id',result->>'id',true),
       set_config('qa.brief_code',result->>'code',true) from created;

with created as (
    select public.create_prepared_brief(jsonb_build_object(
        'name','Second Client','mobile','8000000001','company','Second Solar'), '0905') as result
)
select set_config('qa.second_id',result->>'id',true) from created;

do $$
begin
    if current_setting('qa.brief_code') <> '0001'
        or current_setting('qa.brief_id') = current_setting('qa.second_id') then
        raise exception 'FAIL: phone suffix or per-client links are incorrect';
    end if;
    if jsonb_array_length(public.find_owned_prepared_briefs('0001')) <> 2
        or public.find_owned_prepared_briefs('0001') @> jsonb_build_array(jsonb_build_object(
            'id', current_setting('qa.brief_id')::uuid, 'name', 'Test Client')) is false
        or jsonb_array_length(public.find_owned_prepared_briefs('9999')) <> 0 then
        raise exception 'FAIL: owner lookup did not return only matching client drafts';
    end if;
    if public.unlock_prepared_brief(current_setting('qa.second_id')::uuid,
        current_setting('qa.brief_code'))->>'company' <> 'Second Solar' then
        raise exception 'FAIL: second client link loaded the wrong answers';
    end if;
    if public.unlock_prepared_brief(current_setting('qa.brief_id')::uuid, 'WRONG-CODE') is not null then
        raise exception 'FAIL: wrong code opened prepared form';
    end if;
    if public.unlock_prepared_brief(current_setting('qa.brief_id')::uuid,
        current_setting('qa.brief_code'))->>'hasWebsite' <> 'Yes' then
        raise exception 'FAIL: correct code did not restore prepared answers';
    end if;
    if public.unlock_prepared_brief(current_setting('qa.brief_id')::uuid,
        current_setting('qa.brief_code'))->>'company' <> 'Example Solar' then
        raise exception 'FAIL: prepared contact details did not restore';
    end if;
    if public.unlock_prepared_brief(current_setting('qa.brief_id')::uuid,
        current_setting('qa.brief_code'))->>'otherSoftware' <> 'Example ERP' then
        raise exception 'FAIL: other software name did not restore';
    end if;
    if public.unlock_prepared_brief(current_setting('qa.brief_id')::uuid,
        current_setting('qa.brief_code'))->>'storageProvider' <> 'Google Workspace business account' then
        raise exception 'FAIL: storage preference did not restore';
    end if;
    if public.unlock_prepared_brief(current_setting('qa.brief_id')::uuid,
        current_setting('qa.brief_code'))->>'installationTeams' <> 'Yes'
        or public.unlock_prepared_brief(current_setting('qa.brief_id')::uuid,
        current_setting('qa.brief_code'))->>'stampStaffLogin' <> 'No'
        or public.unlock_prepared_brief(current_setting('qa.brief_id')::uuid,
        current_setting('qa.brief_code'))->>'technicianLogin' <> 'Not sure' then
        raise exception 'FAIL: optional installation and login answers did not restore';
    end if;
    if public.unlock_prepared_brief(current_setting('qa.brief_id')::uuid,
        current_setting('qa.brief_code'))->>'dataStart' <> 'Transfer existing data'
        or public.unlock_prepared_brief(current_setting('qa.brief_id')::uuid,
        current_setting('qa.brief_code'))->>'customRequest' <> 'Please import our current customers' then
        raise exception 'FAIL: data-transfer choice or custom request did not restore';
    end if;
    for attempt in 1..5 loop
        if public.unlock_prepared_brief(current_setting('qa.second_id')::uuid, '0000') is not null then
            raise exception 'FAIL: wrong phone suffix opened second client form';
        end if;
    end loop;
    if public.unlock_prepared_brief(current_setting('qa.second_id')::uuid, '0001') is not null then
        raise exception 'FAIL: repeated wrong codes did not temporarily lock the form';
    end if;
    begin
        perform count(*) from enquiry_private.prepared_briefs;
        raise exception 'FAIL: signed-in visitor could read private drafts';
    exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
do $$
begin
    if jsonb_array_length(public.find_owned_prepared_briefs('0001')) <> 0 then
        raise exception 'FAIL: another browser session could find the prepared forms';
    end if;
end $$;
select set_config('request.jwt.claim.sub', current_setting('qa.owner_id'), true);

set local role anon;
do $$
begin
    begin
        perform public.unlock_prepared_brief(current_setting('qa.brief_id')::uuid,
            current_setting('qa.brief_code'));
        raise exception 'FAIL: unauthenticated visitor could open a draft';
    exception when insufficient_privilege then null; end;
end $$;
reset role;
with legacy as (select gen_random_uuid() as id), inserted as (
    insert into enquiry_private.prepared_briefs(id, owner_id, answers, code_hash)
    select id, current_setting('request.jwt.claim.sub')::uuid,
        '{"hasWebsite":"No"}'::jsonb,
        encode(sha256(convert_to(id::text || 'A1B2C3D4E5F6', 'UTF8')), 'hex')
    from legacy returning id
)
select set_config('qa.legacy_id',id::text,true) from inserted;
do $$
begin
    if exists(select 1 from enquiry_private.prepared_briefs
        where id=current_setting('qa.brief_id')::uuid
          and code_hash=current_setting('qa.brief_code')) then
        raise exception 'FAIL: access code stored in plaintext';
    end if;
end $$;
update enquiry_private.prepared_briefs set expires_at=now()-interval '1 minute'
    where id=current_setting('qa.brief_id')::uuid;
set local role authenticated;
do $$
begin
    if public.unlock_prepared_brief(current_setting('qa.legacy_id')::uuid,
        'A1B2C3D4E5F6')->>'hasWebsite' <> 'No' then
        raise exception 'FAIL: older 12-character access code stopped working';
    end if;
    if public.unlock_prepared_brief(current_setting('qa.brief_id')::uuid,
        current_setting('qa.brief_code')) is not null then
        raise exception 'FAIL: expired draft still opens';
    end if;
end $$;
reset role;
select 'PASS: link and separate code restore answers; wrong code, direct reads, anonymous access and expiry are denied' as verification;
rollback;
