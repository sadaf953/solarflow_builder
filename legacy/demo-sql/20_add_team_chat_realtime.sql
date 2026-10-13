-- ============================================================================
-- 20_add_team_chat_realtime.sql
-- Adds persistent multi-user Team Chat with Supabase Realtime synchronization
-- ============================================================================

create table if not exists public.team_chat_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references auth.users(id) on delete set null,
  sender_name text not null,
  sender_role text not null default 'Team Member',
  user_type text not null default 'admin',
  text text not null,
  tag text not null default 'General',
  created_at timestamptz not null default now()
);

create index if not exists idx_team_chat_messages_created_at
  on public.team_chat_messages (created_at desc);

alter table public.team_chat_messages enable row level security;

drop policy if exists "shared_select_team_chat_messages" on public.team_chat_messages;
create policy "shared_select_team_chat_messages"
  on public.team_chat_messages for select
  to authenticated using (true);

drop policy if exists "shared_insert_team_chat_messages" on public.team_chat_messages;
create policy "shared_insert_team_chat_messages"
  on public.team_chat_messages for insert
  to authenticated with check (true);

drop policy if exists "shared_delete_team_chat_messages" on public.team_chat_messages;
create policy "shared_delete_team_chat_messages"
  on public.team_chat_messages for delete
  to authenticated using (true);

-- Seed initial starter announcements if table is empty
insert into public.team_chat_messages (sender_name, sender_role, user_type, text, tag, created_at)
select * from (values
  ('Operations Admin', 'Admin', 'admin', 'Welcome to the SolarFlow Operations channel. All dispatches, site installation updates, and DISCOM submissions can be announced here for full team visibility.', 'General', now() - interval '3 days'),
  ('Channel Partner Office', 'CPO', 'channel_partner_office', 'Submitted 12 new residential proposals for East cluster. 8 have opted for Jan Samarth bank loan financing.', 'General', now() - interval '1 day'),
  ('Godown & Logistics', 'Admin', 'admin', 'Warehouse stock of bifacial solar modules replenished in godown. Ready for delivery batch allocation.', 'Dispatch', now() - interval '3 hours'),
  ('Site Installation Lead', 'Vendor', 'vendor', 'Completed rooftop mounting structure and inverter wiring for consumer Ramesh Patel. Geo-tag photos submitted.', 'Installation', now() - interval '2 hours'),
  ('Document & Stamp Executive', 'Stamp Maker', 'stamp', 'Executed and uploaded stamped DISCOM agreements for batch 22. All returned to admin queue for final review.', 'Discom', now() - interval '1 hour')
) as v(sender_name, sender_role, user_type, text, tag, created_at)
where not exists (select 1 from public.team_chat_messages limit 1);

-- Add to supabase_realtime publication for live instant messaging across browsers
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'team_chat_messages'
    ) then
      alter publication supabase_realtime add table public.team_chat_messages;
    end if;
  end if;
end $$;
