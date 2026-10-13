-- Add a two-step save API without changing existing enquiry-table permissions.
-- Edit keys live outside the exposed schema; only the original browser session
-- with its random token may add details to a request it created.
begin;
create schema if not exists enquiry_private;
revoke all on schema enquiry_private from public;
grant usage on schema enquiry_private to authenticated;
create table if not exists enquiry_private.edit_keys (
    enquiry_id uuid primary key references public.enquiries(id) on delete cascade,
    owner_id uuid not null,
    edit_token uuid not null
);
alter table enquiry_private.edit_keys enable row level security;
revoke all on enquiry_private.edit_keys from public, anon, authenticated;

create or replace function enquiry_private.save_enquiry(
    p_id uuid, p_edit_token uuid, p_name text, p_mobile text,
    p_company text, p_version text, p_notes text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare saved_id uuid; existing_key enquiry_private.edit_keys%rowtype;
begin
    if auth.uid() is null or p_id is null or p_edit_token is null then
        raise exception 'An enquiry session is required.' using errcode = '42501';
    end if;
    if nullif(trim(p_name), '') is null or p_mobile !~ '^[0-9]{10}$' or p_mobile is null then
        raise exception 'Name and a valid 10-digit phone number are required.' using errcode = '22023';
    end if;
    if p_version is null or p_version not in ('basic', 'advance', 'both') then
        raise exception 'Invalid enquiry option.' using errcode = '22023';
    end if;
    if length(p_name) > 200 or length(p_mobile) > 20 or length(p_company) > 300 or length(p_notes) > 10000 then
        raise exception 'Enquiry details are too long.' using errcode = '22023';
    end if;
    select * into existing_key from enquiry_private.edit_keys
        where enquiry_id = p_id for update;
    if found then
        if existing_key.owner_id <> auth.uid() or existing_key.edit_token <> p_edit_token then
            raise exception 'This enquiry cannot be edited by this session.' using errcode = '42501';
        end if;
        update public.enquiries set company_name = nullif(trim(p_company), ''),
            version_type = p_version, notes = p_notes, updated_at = now()
        where id = p_id and name = trim(p_name) and mobile_number = p_mobile
        returning id into saved_id;
    else
        insert into public.enquiries (id, name, mobile_number, company_name, version_type, notes, status)
        values (p_id, trim(p_name), p_mobile, nullif(trim(p_company), ''), p_version, p_notes, 'new')
        returning id into saved_id;
        insert into enquiry_private.edit_keys (enquiry_id, owner_id, edit_token)
        values (p_id, auth.uid(), p_edit_token);
    end if;
    if saved_id is null then
        raise exception 'This enquiry cannot be edited by this session.' using errcode = '42501';
    end if;
    return saved_id;
end;
$$;
revoke all on function enquiry_private.save_enquiry(uuid, uuid, text, text, text, text, text) from public, anon;
grant execute on function enquiry_private.save_enquiry(uuid, uuid, text, text, text, text, text) to authenticated;

create or replace function public.save_enquiry_details(
    p_id uuid, p_edit_token uuid, p_name text, p_mobile text,
    p_company text, p_version text, p_notes text
) returns uuid
language sql security invoker set search_path = '' as $$
    select enquiry_private.save_enquiry(p_id, p_edit_token, p_name, p_mobile, p_company, p_version, p_notes);
$$;
revoke all on function public.save_enquiry_details(uuid, uuid, text, text, text, text, text) from public, anon;
grant execute on function public.save_enquiry_details(uuid, uuid, text, text, text, text, text) to authenticated;
commit;
