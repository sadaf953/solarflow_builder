-- ==============================================================================
-- 12_staff_attendance.sql
-- Run this in Supabase SQL Editor to create the staff_attendance table
-- and seed initial attendance records for office users and team members.
-- ==============================================================================

begin;

create table if not exists public.staff_attendance (
    id uuid primary key default gen_random_uuid(),
    demo_session_id uuid default auth.uid(),
    user_id uuid references public.profiles(id) on delete set null,
    staff_name text not null,
    role text default 'Office Staff',
    date date not null,
    status text not null check (status in ('present', 'absent', 'half_day', 'leave', 'on_duty')),
    notes text default '',
    marked_by text default 'Admin',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Unique index to prevent duplicate attendance on the same day for a staff member
create unique index if not exists idx_staff_attendance_unique 
on public.staff_attendance (coalesce(demo_session_id, '00000000-0000-0000-0000-000000000000'::uuid), staff_name, date);

-- Index for date queries
create index if not exists idx_staff_attendance_date on public.staff_attendance (date);
create index if not exists idx_staff_attendance_staff on public.staff_attendance (staff_name);

-- Row Level Security
alter table public.staff_attendance enable row level security;

drop policy if exists "staff_attendance_all_access" on public.staff_attendance;
create policy "staff_attendance_all_access" on public.staff_attendance
    for all to authenticated, anon
    using (true)
    with check (true);

grant all on public.staff_attendance to authenticated, anon;

-- Seed initial attendance records for the current week (Sep 14 - Sep 20, 2026)
insert into public.staff_attendance (staff_name, role, date, status, notes)
values
    -- Monday 14 Sep 2026
    ('Admin User', 'Managing Director / Admin', '2026-09-14', 'present', 'On time'),
    ('Priya Sharma', 'Operations Lead', '2026-09-14', 'present', 'On time'),
    ('Rahul Verma', 'Field Sales Manager', '2026-09-14', 'present', 'On time'),
    ('Amit Trivedi', 'Technical Sales Executive', '2026-09-14', 'present', 'On time'),
    ('Ankit Patel', 'Discom & Govt Coordinator', '2026-09-14', 'present', 'On time'),
    ('Sneha Joshi', 'Customer Relationship Officer', '2026-09-14', 'present', 'On time'),
    ('Pooja Mehta', 'Finance & Accounts Officer', '2026-09-14', 'present', 'On time'),
    ('Vikram Solanki', 'Store & Inventory Incharge', '2026-09-14', 'present', 'On time'),
    ('Hardik Pandya', 'Site Survey Engineer', '2026-09-14', 'on_duty', 'Site survey Navsari'),
    ('Divya Shah', 'Quality & Safety Inspector', '2026-09-14', 'present', 'On time'),
    ('Rajesh Bhavsar', 'Solar CAD Designer', '2026-09-14', 'present', 'On time'),
    ('Manoj Rathod', 'Field Integration Supervisor', '2026-09-14', 'present', 'On time'),
    ('Kavita Nair', 'Billing & Subsidy Officer', '2026-09-14', 'present', 'On time'),
    ('Hiren Dave', 'Procurement Specialist', '2026-09-14', 'present', 'On time'),
    ('Demo Preparer', 'Material Assembler', '2026-09-14', 'present', 'Warehouse morning batch'),
    ('Demo Loader', 'Dispatch Coordinator', '2026-09-14', 'present', 'Dispatch shift'),

    -- Tuesday 15 Sep 2026
    ('Admin User', 'Managing Director / Admin', '2026-09-15', 'present', 'On time'),
    ('Priya Sharma', 'Operations Lead', '2026-09-15', 'present', 'On time'),
    ('Rahul Verma', 'Field Sales Manager', '2026-09-15', 'on_duty', 'Client site visits Surat'),
    ('Amit Trivedi', 'Technical Sales Executive', '2026-09-15', 'present', 'On time'),
    ('Ankit Patel', 'Discom & Govt Coordinator', '2026-09-15', 'present', 'On time'),
    ('Sneha Joshi', 'Customer Relationship Officer', '2026-09-15', 'half_day', 'Medical appointment afternoon'),
    ('Pooja Mehta', 'Finance & Accounts Officer', '2026-09-15', 'present', 'On time'),
    ('Vikram Solanki', 'Store & Inventory Incharge', '2026-09-15', 'present', 'On time'),
    ('Hardik Pandya', 'Site Survey Engineer', '2026-09-15', 'present', 'On time'),
    ('Divya Shah', 'Quality & Safety Inspector', '2026-09-15', 'on_duty', 'Site safety inspection Baroda'),
    ('Rajesh Bhavsar', 'Solar CAD Designer', '2026-09-15', 'present', 'On time'),
    ('Manoj Rathod', 'Field Integration Supervisor', '2026-09-15', 'present', 'On time'),
    ('Kavita Nair', 'Billing & Subsidy Officer', '2026-09-15', 'present', 'On time'),
    ('Hiren Dave', 'Procurement Specialist', '2026-09-15', 'present', 'On time'),
    ('Demo Preparer', 'Material Assembler', '2026-09-15', 'present', 'On time'),
    ('Demo Loader', 'Dispatch Coordinator', '2026-09-15', 'leave', 'Scheduled personal leave'),

    -- Wednesday 16 Sep 2026
    ('Admin User', 'Managing Director / Admin', '2026-09-16', 'present', 'On time'),
    ('Priya Sharma', 'Operations Lead', '2026-09-16', 'present', 'On time'),
    ('Rahul Verma', 'Field Sales Manager', '2026-09-16', 'present', 'On time'),
    ('Amit Trivedi', 'Technical Sales Executive', '2026-09-16', 'present', 'On time'),
    ('Ankit Patel', 'Discom & Govt Coordinator', '2026-09-16', 'on_duty', 'Discom circle office submission'),
    ('Sneha Joshi', 'Customer Relationship Officer', '2026-09-16', 'present', 'On time'),
    ('Pooja Mehta', 'Finance & Accounts Officer', '2026-09-16', 'present', 'On time'),
    ('Vikram Solanki', 'Store & Inventory Incharge', '2026-09-16', 'absent', 'Unplanned absence'),
    ('Hardik Pandya', 'Site Survey Engineer', '2026-09-16', 'present', 'On time'),
    ('Divya Shah', 'Quality & Safety Inspector', '2026-09-16', 'present', 'On time'),
    ('Rajesh Bhavsar', 'Solar CAD Designer', '2026-09-16', 'leave', 'Family event'),
    ('Manoj Rathod', 'Field Integration Supervisor', '2026-09-16', 'on_duty', 'Site commissioning check'),
    ('Kavita Nair', 'Billing & Subsidy Officer', '2026-09-16', 'present', 'On time'),
    ('Hiren Dave', 'Procurement Specialist', '2026-09-16', 'present', 'On time'),
    ('Demo Preparer', 'Material Assembler', '2026-09-16', 'present', 'On time'),
    ('Demo Loader', 'Dispatch Coordinator', '2026-09-16', 'present', 'On time'),

    -- Thursday 17 Sep 2026 (Today)
    ('Admin User', 'Managing Director / Admin', '2026-09-17', 'present', 'On time'),
    ('Priya Sharma', 'Operations Lead', '2026-09-17', 'present', 'On time'),
    ('Rahul Verma', 'Field Sales Manager', '2026-09-17', 'present', 'On time'),
    ('Amit Trivedi', 'Technical Sales Executive', '2026-09-17', 'present', 'On time'),
    ('Ankit Patel', 'Discom & Govt Coordinator', '2026-09-17', 'present', 'On time'),
    ('Sneha Joshi', 'Customer Relationship Officer', '2026-09-17', 'present', 'On time'),
    ('Pooja Mehta', 'Finance & Accounts Officer', '2026-09-17', 'present', 'On time'),
    ('Vikram Solanki', 'Store & Inventory Incharge', '2026-09-17', 'present', 'On time'),
    ('Hardik Pandya', 'Site Survey Engineer', '2026-09-17', 'on_duty', 'Roof inspection Surat'),
    ('Divya Shah', 'Quality & Safety Inspector', '2026-09-17', 'present', 'On time'),
    ('Rajesh Bhavsar', 'Solar CAD Designer', '2026-09-17', 'present', 'On time'),
    ('Manoj Rathod', 'Field Integration Supervisor', '2026-09-17', 'present', 'On time'),
    ('Kavita Nair', 'Billing & Subsidy Officer', '2026-09-17', 'present', 'On time'),
    ('Hiren Dave', 'Procurement Specialist', '2026-09-17', 'present', 'On time'),
    ('Demo Preparer', 'Material Assembler', '2026-09-17', 'present', 'On time'),
    ('Demo Loader', 'Dispatch Coordinator', '2026-09-17', 'present', 'On time')
on conflict (coalesce(demo_session_id, '00000000-0000-0000-0000-000000000000'::uuid), staff_name, date)
do update set 
    status = excluded.status,
    notes = excluded.notes,
    updated_at = now();

commit;
