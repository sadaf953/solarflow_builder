begin;
-- Email the first name-and-phone form only. No optional notes, company data
-- or later updates are exported, and historical enquiries are not backfilled.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
create table if not exists enquiry_private.email_settings (
    singleton boolean primary key default true check (singleton),
    worker_token text not null
);
create table if not exists enquiry_private.email_outbox (
    id uuid primary key default gen_random_uuid(),
    enquiry_id uuid not null references public.enquiries(id) on delete cascade,
    fingerprint text not null,
    kind text not null default 'new' check (kind = 'new'),
    snapshot jsonb not null,
    status text not null default 'pending' check (status in ('pending','sent','failed')),
    attempts integer not null default 0,
    created_at timestamptz not null default now(),
    next_attempt_at timestamptz not null default now(),
    sent_at timestamptz,
    provider_id text,
    last_error text,
    unique (enquiry_id, fingerprint)
);
create index if not exists enquiry_email_pending on enquiry_private.email_outbox(next_attempt_at) where status = 'pending';
alter table enquiry_private.email_settings enable row level security;
alter table enquiry_private.email_outbox enable row level security;
revoke all on enquiry_private.email_settings, enquiry_private.email_outbox from public, anon, authenticated;

create or replace function enquiry_private.kick_email_worker() returns void
language plpgsql security definer set search_path = '' as $$
declare worker_token text;
begin
    if not exists(select 1 from enquiry_private.email_outbox where status='pending' and next_attempt_at <= now()) then return; end if;
    select s.worker_token into worker_token from enquiry_private.email_settings s where singleton;
    if worker_token is null then return; end if;
    perform net.http_post(
        url := 'https://qduonewmquwayrnwyzvc.supabase.co/functions/v1/send-enquiry-email',
        body := '{}'::jsonb,
        headers := jsonb_build_object('Content-Type','application/json','x-enquiry-worker-token',worker_token),
        timeout_milliseconds := 15000
    );
exception when others then
    -- Email delivery must never discard a successfully saved contact.
    raise warning 'Enquiry email scheduling deferred; queued notification retained.';
end;
$$;
revoke all on function enquiry_private.kick_email_worker() from public, anon, authenticated;

create or replace function enquiry_private.queue_enquiry_email() returns trigger
language plpgsql security definer set search_path = '' as $$
declare snapshot jsonb; queued_id uuid; selected_interest text;
begin
    selected_interest := substring(new.notes from '^Selected option: ([^\n]+)');
    if selected_interest is null or selected_interest not in
        ('Option 1: Small team setup','Option 2: Detailed operations','A mix of both options','Tools only — no CRM') then
        selected_interest := 'Not specified';
    end if;
    snapshot := jsonb_build_object('name',new.name,'mobile_number',new.mobile_number,
        'selected_interest',selected_interest);
    insert into enquiry_private.email_outbox(enquiry_id,fingerprint,kind,snapshot)
    values(new.id,md5(snapshot::text),'new',snapshot)
    on conflict (enquiry_id,fingerprint) do nothing returning id into queued_id;
    if queued_id is not null then perform enquiry_private.kick_email_worker(); end if;
    return new;
end;
$$;
revoke all on function enquiry_private.queue_enquiry_email() from public, anon, authenticated;
create or replace trigger enquiry_email_after_save
    after insert on public.enquiries
    for each row execute function enquiry_private.queue_enquiry_email();
-- One job wakes the worker only when a pending notification is due.
select cron.schedule('solarflow-enquiry-email-retry','* * * * *','select enquiry_private.kick_email_worker();');
commit;
