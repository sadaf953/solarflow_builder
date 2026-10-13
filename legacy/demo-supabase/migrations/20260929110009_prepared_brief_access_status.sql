-- Show the preparer when a valid link is temporarily paused after wrong codes.
begin;

create or replace function enquiry_private.admin_enquiry_catalog(p_pin text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare items jsonb;
begin
    if auth.uid() is null or p_pin is distinct from '0905' then
        raise exception 'Incorrect preparation code.' using errcode = '42501';
    end if;
    select coalesce(jsonb_agg(item.data order by item.created_at desc), '[]'::jsonb)
      into items
      from (
        select e.created_at, jsonb_build_object(
            'kind', 'enquiry', 'id', e.id, 'name', e.name,
            'mobile', e.mobile_number, 'company', e.company_name,
            'notes', e.notes, 'version', e.version_type,
            'created_at', e.created_at
        ) as data
        from public.enquiries e
        union all
        select b.created_at, jsonb_build_object(
            'kind', 'prepared', 'id', b.id, 'name', b.answers->>'name',
            'mobile', b.answers->>'mobile', 'company', b.answers->>'company',
            'interests', b.answers->'interests', 'created_at', b.created_at,
            'expires_at', b.expires_at, 'locked_until', b.locked_until,
            'access_status', case
                when b.expires_at <= now() then 'expired'
                when b.code_hash <> encode(sha256(convert_to(
                    b.id::text || right(b.answers->>'mobile', 4), 'UTF8')), 'hex') then 'older_code'
                when b.locked_until > now() then 'paused'
                else 'ready'
            end,
            'can_share', b.expires_at > now()
                and (b.locked_until is null or b.locked_until <= now())
                and b.code_hash = encode(sha256(convert_to(
                    b.id::text || right(b.answers->>'mobile', 4), 'UTF8')), 'hex')
        ) as data
        from enquiry_private.prepared_briefs b
      ) item;
    return items;
end;
$$;
revoke all on function enquiry_private.admin_enquiry_catalog(text) from public, anon;
grant execute on function enquiry_private.admin_enquiry_catalog(text) to authenticated;

commit;
