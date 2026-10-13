-- Hosted verification fixtures are fictional and rolled back in this transaction.
begin;
select set_config('qa.enquiry_id', gen_random_uuid()::text, true),
       set_config('qa.edit_token', gen_random_uuid()::text, true),
       set_config('qa.owner_id', gen_random_uuid()::text, true),
       set_config('qa.other_id', gen_random_uuid()::text, true);
select set_config('request.jwt.claim.sub', current_setting('qa.owner_id'), true);
set local role authenticated;
select public.save_enquiry_details(current_setting('qa.enquiry_id')::uuid,
    current_setting('qa.edit_token')::uuid, 'Two-step QA fixture', '0000000851',
    null, 'basic', 'Selected option: Option 1: Small team setup');
select public.save_enquiry_details(current_setting('qa.enquiry_id')::uuid,
    current_setting('qa.edit_token')::uuid, 'Two-step QA fixture', '0000000851',
    'Fictional QA company', 'basic', 'Selected option: Option 1: Small team setup; Interested in: Quotation maker');
-- A retry must keep the same record.
select public.save_enquiry_details(current_setting('qa.enquiry_id')::uuid,
    current_setting('qa.edit_token')::uuid, 'Two-step QA fixture', '0000000851',
    'Fictional QA company', 'basic', 'Selected option: Option 1: Small team setup; Interested in: Quotation maker');
-- Edit keys are unreadable even to signed-in visitors.
do $$
begin
    begin
        perform count(*) from enquiry_private.edit_keys;
        raise exception 'FAIL: private keys were readable';
    exception when insufficient_privilege then null; end;
    begin
        perform public.save_enquiry_details(current_setting('qa.enquiry_id')::uuid,
            gen_random_uuid(), 'Two-step QA fixture', '0000000851', null, 'basic', 'Wrong token');
        raise exception 'FAIL: wrong token accepted';
    exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub', current_setting('qa.other_id'), true);
do $$
begin
    begin
        perform public.save_enquiry_details(current_setting('qa.enquiry_id')::uuid,
            current_setting('qa.edit_token')::uuid, 'Two-step QA fixture', '0000000851', null, 'basic', 'Other visitor');
        raise exception 'FAIL: other visitor accepted';
    exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$
begin
    begin
        perform public.save_enquiry_details(current_setting('qa.enquiry_id')::uuid,
            current_setting('qa.edit_token')::uuid, 'Two-step QA fixture', '0000000851', null, 'basic', 'Unauthenticated');
        raise exception 'FAIL: unauthenticated edit accepted';
    exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$
begin
    if (select count(*) from public.enquiries where id = current_setting('qa.enquiry_id')::uuid) <> 1 then
        raise exception 'FAIL: duplicate contact';
    end if;
    if not exists(select 1 from public.enquiries where id = current_setting('qa.enquiry_id')::uuid
        and company_name = 'Fictional QA company' and notes like '%Quotation maker%') then
        raise exception 'FAIL: optional details were not saved';
    end if;
end $$;
select 'PASS: contact saved, optional details update one record, retry creates no duplicate, private keys unreadable, wrong-token/cross-visitor/unauthenticated edits denied' as verification;
rollback;
