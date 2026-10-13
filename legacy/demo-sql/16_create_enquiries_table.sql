-- ==============================================================================
-- 16_create_enquiries_table.sql
-- Creates the enquiries table to store lead/demo customization requests.
-- Captures contact mobile number, current software used (Excel, Tally, Zoho, etc.),
-- and interest in Basic vs Advance version.
-- ==============================================================================

create table if not exists public.enquiries (
    id uuid primary key default gen_random_uuid(),
    name text,
    company_name text,
    mobile_number text not null,
    email text,
    version_type text default 'both', -- 'basic', 'advance', 'both'
    current_softwares text[] default array[]::text[],
    notes text,
    status text default 'new', -- 'new', 'contacted', 'demo_scheduled', 'closed'
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Enable RLS
alter table public.enquiries enable row level security;

-- Allow public / anon users to submit enquiries
drop policy if exists "Allow public insert to enquiries" on public.enquiries;
create policy "Allow public insert to enquiries"
    on public.enquiries for insert
    to anon, authenticated
    with check (true);

-- Anonymous sign-ins also use the authenticated role. Visitors must never be
-- able to browse contact requests, even after choosing the demo Admin persona.
-- Enquiry review belongs in the project owner's database dashboard/server.
drop policy if exists "Allow authenticated read enquiries" on public.enquiries;
revoke select, update, delete on public.enquiries from public, anon, authenticated;
grant insert on public.enquiries to anon, authenticated;

-- Auto-update updated_at timestamp
create or replace function public.touch_enquiries_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists touch_enquiries_updated_at on public.enquiries;
create trigger touch_enquiries_updated_at
    before update on public.enquiries
    for each row execute function public.touch_enquiries_updated_at();
