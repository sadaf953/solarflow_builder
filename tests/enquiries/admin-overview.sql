-- All fictional rows are rolled back. No enquiry or email is committed.
begin;
select set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
select set_config('qa.enquiry_id', gen_random_uuid()::text, true),
       set_config('qa.edit_token', gen_random_uuid()::text, true);
set local role authenticated;
with draft as (
    select public.create_prepared_brief(jsonb_build_object(
        'name', 'Overview QA prepared', 'mobile', '0000000682',
        'company', 'QA Solar', 'dataStart', 'Start fresh',
        'installationTeams', 'Yes', 'stampStaffLogin', 'No',
        'technicianLogin', 'Not sure', 'customRequest', 'Need a simple setup'), '0905') as value
)
select set_config('qa.brief_id', value->>'id', true) from draft;
select public.save_enquiry_details(current_setting('qa.enquiry_id')::uuid,
    current_setting('qa.edit_token')::uuid, 'Overview QA submitted',
    '0000000683', 'QA Solar', 'basic', 'Interested in: Quotation maker');
do $$
declare catalog jsonb := public.admin_enquiry_catalog('0905');
begin
    if not catalog @> jsonb_build_array(jsonb_build_object(
        'kind', 'prepared', 'id', current_setting('qa.brief_id')::uuid))
        or not catalog @> jsonb_build_array(jsonb_build_object(
        'kind', 'enquiry', 'id', current_setting('qa.enquiry_id')::uuid)) then
        raise exception 'FAIL: overview omitted prepared or submitted form';
    end if;
    if public.open_submitted_enquiry(current_setting('qa.enquiry_id')::uuid, '0683')->>'name'
        <> 'Overview QA submitted'
        or public.open_submitted_enquiry(current_setting('qa.enquiry_id')::uuid, '0000') is not null then
        raise exception 'FAIL: client resume link did not check form ID and phone digits';
    end if;
    if public.unlock_prepared_brief(current_setting('qa.brief_id')::uuid, '0682')->>'customRequest'
        <> 'Need a simple setup' then
        raise exception 'FAIL: optional prepared answers were not saved';
    end if;
    begin
        perform public.admin_enquiry_catalog('0000');
        raise exception 'FAIL: wrong preparation code opened overview';
    exception when insufficient_privilege then null; end;
end $$;
reset role;
update enquiry_private.prepared_briefs
   set locked_until = now() + interval '15 minutes'
 where id = current_setting('qa.brief_id')::uuid;
set local role authenticated;
do $$
declare paused jsonb;
begin
    select item into paused
      from jsonb_array_elements(public.admin_enquiry_catalog('0905')) item
     where item->>'id' = current_setting('qa.brief_id');
    if paused->>'access_status' <> 'paused' or paused->>'can_share' <> 'false' then
        raise exception 'FAIL: paused prepared form was shown as shareable';
    end if;
end $$;
reset role;
update enquiry_private.prepared_briefs
   set locked_until = null
 where id = current_setting('qa.brief_id')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
do $$
begin
    if public.open_submitted_enquiry(current_setting('qa.enquiry_id')::uuid, '0683')->>'name'
        <> 'Overview QA submitted' then
        raise exception 'FAIL: client in another session could not resume';
    end if;
end $$;
set local role anon;
do $$
begin
    begin
        perform public.admin_enquiry_catalog('0905');
        raise exception 'FAIL: unauthenticated overview accepted';
    exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: overview lists both kinds, wrong PIN denied, unique client link resumes across sessions' as verification;
rollback;
