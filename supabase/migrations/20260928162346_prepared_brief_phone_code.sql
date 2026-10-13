-- Each brief keeps its own UUID link. New links use the last four phone digits;
-- older 12-character codes remain valid for previously issued links.
begin;

alter table enquiry_private.prepared_briefs
    add column if not exists failed_attempts integer not null default 0,
    add column if not exists locked_until timestamptz;

create or replace function enquiry_private.unlock_prepared_brief(p_id uuid, p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare brief enquiry_private.prepared_briefs%rowtype; normalized_code text;
begin
    if auth.uid() is null then
        raise exception 'Sign in before opening a prepared form.' using errcode = '42501';
    end if;
    normalized_code := upper(regexp_replace(coalesce(p_code, ''), '[[:space:]-]', '', 'g'));
    if p_id is null or normalized_code !~ '^([0-9]{4}|[0-9A-F]{12})$' then return null; end if;
    select * into brief from enquiry_private.prepared_briefs
        where id = p_id and expires_at > now() for update;
    if not found or brief.locked_until > now() then return null; end if;
    if brief.code_hash <>
        encode(sha256(convert_to(p_id::text || normalized_code, 'UTF8')), 'hex') then
        update enquiry_private.prepared_briefs
            set failed_attempts = failed_attempts + 1,
                locked_until = case when failed_attempts + 1 >= 5
                    then now() + interval '15 minutes' else null end
            where id = p_id;
        return null;
    end if;
    update enquiry_private.prepared_briefs
        set failed_attempts = 0, locked_until = null where id = p_id;
    return brief.answers;
end;
$$;

commit;
