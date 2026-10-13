-- ==============================================================================
-- 13_add_drive_and_location_links.sql
-- Run this in Supabase SQL Editor to add google_drive_link and location_link
-- columns to public.admin table.
-- ==============================================================================

begin;

alter table public.admin
    add column if not exists google_drive_link text default null,
    add column if not exists location_link text default null;

comment on column public.admin.google_drive_link is 'Google Drive folder or document URL for customer files';
comment on column public.admin.location_link is 'Google Maps or GPS location URL for customer site installation';

commit;
