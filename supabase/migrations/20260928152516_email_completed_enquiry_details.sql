-- Send a second notification when a prospect adds optional enquiry details.
-- The first contact notification still fires immediately on insert.
begin;

alter table enquiry_private.email_outbox drop constraint if exists email_outbox_kind_check;
alter table enquiry_private.email_outbox add constraint email_outbox_kind_check
    check (kind in ('new', 'details'));

create or replace function enquiry_private.queue_enquiry_email() returns trigger
language plpgsql security definer set search_path = '' as $$
declare snapshot jsonb; queued_id uuid; selected_interest text; message_kind text;
begin
    if tg_op = 'UPDATE' then
        if new.notes is not distinct from old.notes
            and new.company_name is not distinct from old.company_name then
            return new;
        end if;
    end if;

    message_kind := case when tg_op = 'INSERT' then 'new' else 'details' end;
    if message_kind = 'new' then
        selected_interest := substring(new.notes from '^Selected option: ([^\n]+)');
        if selected_interest is null or selected_interest not in
            ('Option 1: Small team setup','Option 2: Detailed operations','A mix of both options','Tools only — no CRM') then
            selected_interest := 'Not specified';
        end if;
        snapshot := jsonb_build_object('name',new.name,'mobile_number',new.mobile_number,
            'selected_interest',selected_interest);
    else
        selected_interest := substring(new.notes from 'Interested in: ([^\n]+)');
        snapshot := jsonb_build_object('name',new.name,'mobile_number',new.mobile_number,
            'company_name',new.company_name,'notes',new.notes,
            'selected_interest',coalesce(selected_interest,'Not specified'));
    end if;

    insert into enquiry_private.email_outbox(enquiry_id,fingerprint,kind,snapshot)
    values(new.id,md5(message_kind || snapshot::text),message_kind,snapshot)
    on conflict (enquiry_id,fingerprint) do nothing returning id into queued_id;
    if queued_id is not null then perform enquiry_private.kick_email_worker(); end if;
    return new;
end;
$$;

drop trigger if exists enquiry_email_after_save on public.enquiries;
create trigger enquiry_email_after_save
    after insert or update of company_name, notes on public.enquiries
    for each row execute function enquiry_private.queue_enquiry_email();

commit;
