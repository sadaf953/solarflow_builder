-- Let the preparing browser find only its own active client drafts by the
-- four phone digits. The client-facing link still requires its UUID and code.
begin;

create or replace function enquiry_private.find_owned_prepared_briefs(p_phone_suffix text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare matches jsonb;
begin
    if auth.uid() is null then
        raise exception 'Sign in before finding prepared forms.' using errcode = '42501';
    end if;
    if p_phone_suffix is null or p_phone_suffix !~ '^[0-9]{4}$' then
        return '[]'::jsonb;
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', draft.id, 'name', draft.answers->>'name',
        'company', draft.answers->>'company', 'created_at', draft.created_at
    ) order by draft.created_at desc), '[]'::jsonb)
    into matches
    from (
        select id, answers, created_at
        from enquiry_private.prepared_briefs
        where owner_id = auth.uid()
          and expires_at > now()
          and right(answers->>'mobile', 4) = p_phone_suffix
          and code_hash = encode(sha256(convert_to(id::text || p_phone_suffix, 'UTF8')), 'hex')
        order by created_at desc
        limit 100
    ) as draft;
    return matches;
end;
$$;
revoke all on function enquiry_private.find_owned_prepared_briefs(text) from public, anon;
grant execute on function enquiry_private.find_owned_prepared_briefs(text) to authenticated;

create or replace function public.find_owned_prepared_briefs(p_phone_suffix text)
returns jsonb language sql security invoker set search_path = '' as $$
    select enquiry_private.find_owned_prepared_briefs(p_phone_suffix);
$$;
revoke all on function public.find_owned_prepared_briefs(text) from public, anon;
grant execute on function public.find_owned_prepared_briefs(text) to authenticated;

commit;
