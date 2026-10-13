-- ==============================================================================
-- 18_refresh_cpo_leads_view.sql
-- Recreate public.cpo_leads view with all latest columns from public.admin
-- (including google_drive_link, location_link, etc.) to fix 400 errors for CPO
-- and Manager roles.
-- ==============================================================================

begin;

-- In Postgres, CREATE OR REPLACE VIEW cannot add columns if the column order changes,
-- so we drop and recreate the view with security_invoker = true.
drop view if exists public.cpo_leads cascade;

create view public.cpo_leads with (security_invoker = true) as
select *
from public.admin
where public.current_demo_cpo() is not null
  and public.can_view_demo_lead(lead_creator_profile_id);

grant select on public.cpo_leads to authenticated;

commit;
