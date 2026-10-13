-- Fictional enquiry and edits are rolled back; live enquiries are untouched.
begin;
select set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
select set_config('qa.enquiry_id', gen_random_uuid()::text, true),
       set_config('qa.edit_token', gen_random_uuid()::text, true);
set local role authenticated;
select public.save_enquiry_details(current_setting('qa.enquiry_id')::uuid,
    current_setting('qa.edit_token')::uuid, 'Reopen QA fixture', '0000000937',
    'Original company', 'basic', 'Interested in: Quotation maker');
do $$
begin
    if not public.find_submitted_enquiries('0937') @> jsonb_build_array(jsonb_build_object(
        'id', current_setting('qa.enquiry_id')::uuid, 'name', 'Reopen QA fixture'))
        or public.find_submitted_enquiries('invalid') <> '[]'::jsonb then
        raise exception 'FAIL: submitted enquiry lookup';
    end if;
    begin
        perform public.update_submitted_enquiry(current_setting('qa.enquiry_id')::uuid,
            '9999', 'Wrong company', 'basic', 'Wrong code');
        raise exception 'FAIL: wrong phone digits accepted';
    exception when invalid_parameter_value then null; end;
end $$;
select public.update_submitted_enquiry(current_setting('qa.enquiry_id')::uuid,
    '0937', 'Updated company', 'basic', 'Interested in: Quotation maker');
reset role;
do $$
begin
    if (select company_name from public.enquiries where id = current_setting('qa.enquiry_id')::uuid) <> 'Updated company'
        or (select count(*) from public.enquiries where id = current_setting('qa.enquiry_id')::uuid) <> 1 then
        raise exception 'FAIL: reopened enquiry did not update the same row';
    end if;
end $$;
set local role anon;
do $$
begin
    begin
        perform public.find_submitted_enquiries('0937');
        raise exception 'FAIL: unauthenticated lookup accepted';
    exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: lookup, update same row, wrong digits and unauthenticated access rejected' as verification;
rollback;
