-- 15_auto_fill_admin_timestamps.sql
-- Ensures that if an INSERT to public.admin supplies NULL or empty for created_at or updated_at,
-- PostgreSQL automatically substitutes now() instead of throwing NOT NULL constraint violation.

create or replace function public.ensure_admin_timestamps()
returns trigger language plpgsql security definer as $$
begin
  if new.created_at is null then
    new.created_at := now();
  end if;
  if new.updated_at is null then
    new.updated_at := now();
  end if;
  return new;
end $$;

drop trigger if exists ensure_admin_timestamps on public.admin;
create trigger ensure_admin_timestamps
before insert on public.admin
for each row execute function public.ensure_admin_timestamps();
