-- SolarFlow Client Builder backend.
--
-- Run once in the builder Supabase project: SQL Editor -> New query -> paste
-- this file -> Run. Safe to run again; it never deletes data.
--
-- Everything lives in schema setup_private. Browsers reach it only through
-- the public.setup_* wrappers below (security invoker), which call the
-- security definer functions in setup_private. The tables themselves are
-- never granted to anon or authenticated. Nothing here touches any other
-- public table, so this project can also host a test client CRM.
--
-- Add another builder admin (they sign in with Supabase Auth email + password):
--   insert into setup_private.admins(email) values ('someone@example.com') on conflict do nothing;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists setup_private;
revoke all on schema setup_private from public, anon, authenticated;
-- Usage only, so the public wrappers can call the granted functions below.
grant usage on schema setup_private to anon, authenticated;

-- ── Tables ───────────────────────────────────────────────────────────────

create table if not exists setup_private.admins (
  email text primary key check (email = lower(btrim(email)) and email <> '')
);

create table if not exists setup_private.invites (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null,
  company text not null default '',
  contact jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'submitted', 'downloaded', 'archived')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '90 days',
  failed_opens int not null default 0,
  locked_until timestamptz,
  rate_window_start timestamptz,
  rate_calls int not null default 0
);

create table if not exists setup_private.drafts (
  invite_id uuid primary key references setup_private.invites(id) on delete cascade,
  payload jsonb,
  version int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists setup_private.submissions (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references setup_private.invites(id) on delete cascade,
  version int not null,
  payload jsonb not null,
  submitted_at timestamptz not null default now(),
  unique (invite_id, version)
);
create index if not exists submissions_invite_idx on setup_private.submissions(invite_id, submitted_at desc);

create table if not exists setup_private.events (
  id bigint generated always as identity primary key,
  invite_id uuid references setup_private.invites(id) on delete cascade,
  kind text not null,
  at timestamptz not null default now(),
  actor text
);
create index if not exists events_invite_idx on setup_private.events(invite_id, at desc);

alter table setup_private.admins enable row level security;
alter table setup_private.invites enable row level security;
alter table setup_private.drafts enable row level security;
alter table setup_private.submissions enable row level security;
alter table setup_private.events enable row level security;
revoke all on all tables in schema setup_private from public, anon, authenticated;
revoke all on all sequences in schema setup_private from public, anon, authenticated;

insert into setup_private.admins(email) values ('admin@crm.com') on conflict do nothing;

-- ── Helpers ──────────────────────────────────────────────────────────────

-- True for a signed-in, non-anonymous user whose email is in admins.
create or replace function setup_private.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    and exists (select 1 from setup_private.admins a where a.email = lower(btrim(auth.jwt() ->> 'email')));
$$;

create or replace function setup_private.require_admin()
returns void
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not setup_private.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
end;
$$;

create or replace function setup_private.hash_token(p_token text)
returns text
language sql immutable
set search_path = ''
as $$
  select encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

-- 32 random bytes, base64url without padding (43 characters).
create or replace function setup_private.new_token()
returns text
language sql volatile
set search_path = ''
as $$
  select translate(encode(extensions.gen_random_bytes(32), 'base64'), E'+/=\n', '-_');
$$;

create or replace function setup_private.log_event(p_invite uuid, p_kind text, p_actor text)
returns void
language sql security definer
set search_path = ''
as $$
  insert into setup_private.events(invite_id, kind, actor) values (p_invite, p_kind, p_actor);
$$;

create or replace function setup_private.admin_actor()
returns text
language sql stable
set search_path = ''
as $$
  select coalesce(lower(auth.jwt() ->> 'email'), 'admin');
$$;

-- The invite behind a client link, locked for update, or null when the link
-- is wrong, expired or archived. Counts per-invite calls (rate limit) and
-- wrong tokens (lockout); both survive the null return because nothing is
-- raised on that path.
create or replace function setup_private.client_invite(p_invite uuid, p_token text)
returns setup_private.invites
language plpgsql security definer
set search_path = ''
as $$
declare
  v setup_private.invites;
  max_calls constant int := 120;          -- per invite per minute
  max_failures constant int := 10;
  lock_for constant interval := interval '15 minutes';
begin
  if p_invite is null then return null; end if;
  select * into v from setup_private.invites where id = p_invite for update;
  if not found then return null; end if;

  if v.locked_until is not null and v.locked_until > now() then
    raise exception 'locked' using errcode = 'P0001';
  end if;

  if v.rate_window_start is null or v.rate_window_start < now() - interval '1 minute' then
    v.rate_window_start := now();
    v.rate_calls := 1;
  elsif v.rate_calls >= max_calls then
    raise exception 'rate_limited' using errcode = 'P0001';
  else
    v.rate_calls := v.rate_calls + 1;
  end if;

  if p_token is null or length(p_token) > 200 or setup_private.hash_token(p_token) <> v.token_hash then
    v.failed_opens := v.failed_opens + 1;
    if v.failed_opens >= max_failures then
      v.failed_opens := 0;
      v.locked_until := now() + lock_for;
      perform setup_private.log_event(v.id, 'locked', 'client');
    end if;
    update setup_private.invites
       set rate_window_start = v.rate_window_start, rate_calls = v.rate_calls,
           failed_opens = v.failed_opens, locked_until = v.locked_until
     where id = v.id;
    return null;
  end if;

  update setup_private.invites
     set rate_window_start = v.rate_window_start, rate_calls = v.rate_calls, failed_opens = 0
   where id = v.id;
  if v.status = 'archived' or v.expires_at < now() then return null; end if;
  return v;
end;
$$;

-- ── Client RPCs ──────────────────────────────────────────────────────────

create or replace function setup_private.setup_open(p_invite uuid, p_token text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v setup_private.invites;
  d setup_private.drafts;
begin
  v := setup_private.client_invite(p_invite, p_token);
  if v.id is null then return null; end if;
  select * into d from setup_private.drafts where invite_id = v.id;
  perform setup_private.log_event(v.id, 'opened', 'client');
  return jsonb_build_object(
    'company', v.company,
    'contact', v.contact,
    'payload', d.payload,
    'version', coalesce(d.version, 0),
    'status', v.status,
    'submitted_at', (select max(s.submitted_at) from setup_private.submissions s where s.invite_id = v.id)
  );
end;
$$;

create or replace function setup_private.setup_save(p_invite uuid, p_token text, p_payload jsonb, p_base_version int)
returns int
language plpgsql security definer
set search_path = ''
as $$
declare
  v setup_private.invites;
  new_version int;
begin
  v := setup_private.client_invite(p_invite, p_token);
  if v.id is null then return null; end if;

  if octet_length(p_payload::text) > 262144 then
    raise exception 'too_large' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_payload) is distinct from 'object'
     or p_payload -> 'schemaVersion' is distinct from '1'::jsonb
     or jsonb_typeof(p_payload -> 'contact') is distinct from 'object'
     or jsonb_typeof(p_payload -> 'answers') is distinct from 'object'
     or jsonb_typeof(p_payload -> 'workflow') is distinct from 'object' then
    raise exception 'invalid_payload' using errcode = 'P0001';
  end if;

  insert into setup_private.drafts(invite_id) values (v.id) on conflict do nothing;
  update setup_private.drafts
     set payload = p_payload, version = version + 1, updated_at = now()
   where invite_id = v.id and version = p_base_version
  returning version into new_version;
  if new_version is null then
    raise exception 'conflict' using errcode = 'P0001';
  end if;
  update setup_private.invites set updated_at = now() where id = v.id;
  return new_version;
end;
$$;

create or replace function setup_private.setup_submit(p_invite uuid, p_token text)
returns timestamptz
language plpgsql security definer
set search_path = ''
as $$
declare
  v setup_private.invites;
  d setup_private.drafts;
  at_time timestamptz := now();
begin
  v := setup_private.client_invite(p_invite, p_token);
  if v.id is null then return null; end if;
  select * into d from setup_private.drafts where invite_id = v.id;
  if d.payload is null then
    raise exception 'nothing_to_submit' using errcode = 'P0001';
  end if;
  -- Submitting the same version twice keeps one snapshot.
  insert into setup_private.submissions(invite_id, version, payload, submitted_at)
  values (v.id, d.version, d.payload, at_time)
  on conflict (invite_id, version) do update set submitted_at = excluded.submitted_at;
  update setup_private.invites set status = 'submitted', updated_at = at_time where id = v.id;
  perform setup_private.log_event(v.id, 'submitted', 'client');
  return at_time;
end;
$$;

-- ── Admin RPCs ───────────────────────────────────────────────────────────

create or replace function setup_private.setup_admin_create_invite(p_company text, p_contact jsonb)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  token text := setup_private.new_token();
  new_id uuid;
begin
  perform setup_private.require_admin();
  if btrim(coalesce(p_company, '')) = '' or length(p_company) > 200 then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'Company name is required (at most 200 characters).';
  end if;
  if p_contact is not null and (jsonb_typeof(p_contact) <> 'object' or octet_length(p_contact::text) > 4096) then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'Contact details must be a small object.';
  end if;
  insert into setup_private.invites(token_hash, company, contact, created_by)
  values (setup_private.hash_token(token), btrim(p_company), coalesce(p_contact, '{}'::jsonb), auth.uid())
  returning id into new_id;
  insert into setup_private.drafts(invite_id) values (new_id);
  perform setup_private.log_event(new_id, 'created', setup_private.admin_actor());
  return jsonb_build_object('id', new_id, 'token', token);
end;
$$;

create or replace function setup_private.setup_admin_list()
returns table (
  id uuid, company text, contact jsonb, status text, created_at timestamptz, updated_at timestamptz,
  submitted_at timestamptz, version int, expires_at timestamptz
)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  perform setup_private.require_admin();
  return query
    select i.id, i.company, i.contact, i.status, i.created_at, i.updated_at,
           (select max(s.submitted_at) from setup_private.submissions s where s.invite_id = i.id),
           coalesce(d.version, 0), i.expires_at
      from setup_private.invites i
      left join setup_private.drafts d on d.invite_id = i.id
     order by i.updated_at desc;
end;
$$;

create or replace function setup_private.setup_admin_get(p_invite uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v setup_private.invites;
begin
  perform setup_private.require_admin();
  select * into v from setup_private.invites where id = p_invite;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'invite', jsonb_build_object(
      'id', v.id, 'company', v.company, 'contact', v.contact, 'status', v.status,
      'created_at', v.created_at, 'updated_at', v.updated_at, 'expires_at', v.expires_at,
      'locked_until', v.locked_until),
    'draft', (select jsonb_build_object('payload', d.payload, 'version', d.version, 'updated_at', d.updated_at)
                from setup_private.drafts d where d.invite_id = v.id),
    'submissions', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'version', s.version, 'payload', s.payload, 'submitted_at', s.submitted_at)
                                       order by s.submitted_at desc)
                               from setup_private.submissions s where s.invite_id = v.id), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('kind', e.kind, 'at', e.at, 'actor', e.actor) order by e.at desc)
                          from (select * from setup_private.events e where e.invite_id = v.id order by e.at desc limit 50) e), '[]'::jsonb)
  );
end;
$$;

-- A new link: the old one stops working, the lockout is cleared and the
-- link is valid for another 90 days.
create or replace function setup_private.setup_admin_reset_token(p_invite uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  token text := setup_private.new_token();
begin
  perform setup_private.require_admin();
  update setup_private.invites
     set token_hash = setup_private.hash_token(token), failed_opens = 0, locked_until = null,
         expires_at = now() + interval '90 days', updated_at = now()
   where id = p_invite;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  perform setup_private.log_event(p_invite, 'token_reset', setup_private.admin_actor());
  return jsonb_build_object('token', token);
end;
$$;

-- 'archived' closes the link; 'open' reopens it (as 'submitted' when the
-- client has submitted before). Returns the new status.
create or replace function setup_private.setup_admin_set_status(p_invite uuid, p_status text)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  new_status text;
begin
  perform setup_private.require_admin();
  if p_status not in ('open', 'archived') then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  new_status := case
    when p_status = 'archived' then 'archived'
    when exists (select 1 from setup_private.submissions s where s.invite_id = p_invite) then 'submitted'
    else 'open' end;
  update setup_private.invites set status = new_status, updated_at = now() where id = p_invite;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  perform setup_private.log_event(p_invite, case when p_status = 'archived' then 'archived' else 'reopened' end, setup_private.admin_actor());
  return new_status;
end;
$$;

create or replace function setup_private.setup_admin_mark_downloaded(p_invite uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  perform setup_private.require_admin();
  update setup_private.invites
     set status = case when status = 'archived' then status else 'downloaded' end, updated_at = now()
   where id = p_invite;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  perform setup_private.log_event(p_invite, 'downloaded', setup_private.admin_actor());
end;
$$;

-- ── Grants on setup_private functions ────────────────────────────────────

revoke all on all functions in schema setup_private from public, anon, authenticated;
grant execute on function setup_private.setup_open(uuid, text) to anon, authenticated;
grant execute on function setup_private.setup_save(uuid, text, jsonb, int) to anon, authenticated;
grant execute on function setup_private.setup_submit(uuid, text) to anon, authenticated;
grant execute on function setup_private.setup_admin_create_invite(text, jsonb) to authenticated;
grant execute on function setup_private.setup_admin_list() to authenticated;
grant execute on function setup_private.setup_admin_get(uuid) to authenticated;
grant execute on function setup_private.setup_admin_reset_token(uuid) to authenticated;
grant execute on function setup_private.setup_admin_set_status(uuid, text) to authenticated;
grant execute on function setup_private.setup_admin_mark_downloaded(uuid) to authenticated;

-- ── Public wrappers (what supabase.rpc() calls) ──────────────────────────

create or replace function public.setup_open(p_invite uuid, p_token text)
returns jsonb language sql security invoker set search_path = ''
as $$ select setup_private.setup_open(p_invite, p_token) $$;

create or replace function public.setup_save(p_invite uuid, p_token text, p_payload jsonb, p_base_version int)
returns int language sql security invoker set search_path = ''
as $$ select setup_private.setup_save(p_invite, p_token, p_payload, p_base_version) $$;

create or replace function public.setup_submit(p_invite uuid, p_token text)
returns timestamptz language sql security invoker set search_path = ''
as $$ select setup_private.setup_submit(p_invite, p_token) $$;

create or replace function public.setup_admin_create_invite(p_company text, p_contact jsonb)
returns jsonb language sql security invoker set search_path = ''
as $$ select setup_private.setup_admin_create_invite(p_company, p_contact) $$;

create or replace function public.setup_admin_list()
returns table (
  id uuid, company text, contact jsonb, status text, created_at timestamptz, updated_at timestamptz,
  submitted_at timestamptz, version int, expires_at timestamptz
)
language sql security invoker set search_path = ''
as $$ select * from setup_private.setup_admin_list() $$;

create or replace function public.setup_admin_get(p_invite uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select setup_private.setup_admin_get(p_invite) $$;

create or replace function public.setup_admin_reset_token(p_invite uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select setup_private.setup_admin_reset_token(p_invite) $$;

create or replace function public.setup_admin_set_status(p_invite uuid, p_status text)
returns text language sql security invoker set search_path = ''
as $$ select setup_private.setup_admin_set_status(p_invite, p_status) $$;

create or replace function public.setup_admin_mark_downloaded(p_invite uuid)
returns void language sql security invoker set search_path = ''
as $$ select setup_private.setup_admin_mark_downloaded(p_invite) $$;

revoke all on function public.setup_open(uuid, text) from public;
revoke all on function public.setup_save(uuid, text, jsonb, int) from public;
revoke all on function public.setup_submit(uuid, text) from public;
revoke all on function public.setup_admin_create_invite(text, jsonb) from public, anon;
revoke all on function public.setup_admin_list() from public, anon;
revoke all on function public.setup_admin_get(uuid) from public, anon;
revoke all on function public.setup_admin_reset_token(uuid) from public, anon;
revoke all on function public.setup_admin_set_status(uuid, text) from public, anon;
revoke all on function public.setup_admin_mark_downloaded(uuid) from public, anon;
grant execute on function public.setup_open(uuid, text) to anon, authenticated;
grant execute on function public.setup_save(uuid, text, jsonb, int) to anon, authenticated;
grant execute on function public.setup_submit(uuid, text) to anon, authenticated;
grant execute on function public.setup_admin_create_invite(text, jsonb) to authenticated;
grant execute on function public.setup_admin_list() to authenticated;
grant execute on function public.setup_admin_get(uuid) to authenticated;
grant execute on function public.setup_admin_reset_token(uuid) to authenticated;
grant execute on function public.setup_admin_set_status(uuid, text) to authenticated;
grant execute on function public.setup_admin_mark_downloaded(uuid) to authenticated;

notify pgrst, 'reload schema';
