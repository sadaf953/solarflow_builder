-- Temporary four-digit recovery for submitted enquiries. The UI uses 0905
-- exclusively to prepare a new form; any other four digits may retrieve a
-- matching submitted enquiry. Replace this with verified admin access later.
begin;

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
        'id', enquiry.id, 'name', enquiry.name,
        'mobile', enquiry.mobile_number, 'company', enquiry.company_name,
        'version', enquiry.version_type, 'notes', enquiry.notes,
        'created_at', enquiry.created_at
    ) order by enquiry.created_at desc), '[]'::jsonb)
    into matches
    from (
        select id, name, mobile_number, company_name, version_type, notes, created_at
        from public.enquiries
        where right(mobile_number, 4) = p_phone_suffix
        order by created_at desc
        limit 100
    ) as enquiry;
    return matches;
end;
$$;
revoke all on function enquiry_private.find_submitted_enquiries(text) from public, anon;
grant execute on function enquiry_private.find_submitted_enquiries(text) to authenticated;

create or replace function public.find_submitted_enquiries(p_phone_suffix text)
returns jsonb language sql security invoker set search_path = '' as $$
    select enquiry_private.find_submitted_enquiries(p_phone_suffix);
$$;
revoke all on function public.find_submitted_enquiries(text) from public, anon;
grant execute on function public.find_submitted_enquiries(text) to authenticated;

create or replace function enquiry_private.update_submitted_enquiry(
    p_id uuid, p_phone_suffix text, p_company text, p_version text, p_notes text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare saved_id uuid;
begin
    if auth.uid() is null then
        raise exception 'An enquiry session is required.' using errcode = '42501';
    end if;
    if p_phone_suffix is null or p_phone_suffix !~ '^[0-9]{4}$'
        or p_id is null or p_version is null or p_version not in ('basic', 'advance', 'both')
        or p_notes is null or length(p_company) > 300 or length(p_notes) > 10000 then
        raise exception 'Invalid enquiry details.' using errcode = '22023';
    end if;
    update public.enquiries
       set company_name = nullif(trim(p_company), ''),
           version_type = p_version,
           notes = p_notes,
           updated_at = now()
     where id = p_id and right(mobile_number, 4) = p_phone_suffix
     returning id into saved_id;
    if saved_id is null then
        raise exception 'No enquiry matched that phone code.' using errcode = '22023';
    end if;
    return saved_id;
end;
$$;
revoke all on function enquiry_private.update_submitted_enquiry(uuid, text, text, text, text) from public, anon;
grant execute on function enquiry_private.update_submitted_enquiry(uuid, text, text, text, text) to authenticated;

create or replace function public.update_submitted_enquiry(
    p_id uuid, p_phone_suffix text, p_company text, p_version text, p_notes text
) returns uuid language sql security invoker set search_path = '' as $$
    select enquiry_private.update_submitted_enquiry(p_id, p_phone_suffix, p_company, p_version, p_notes);
$$;
revoke all on function public.update_submitted_enquiry(uuid, text, text, text, text) from public, anon;
grant execute on function public.update_submitted_enquiry(uuid, text, text, text, text) to authenticated;

commit;
