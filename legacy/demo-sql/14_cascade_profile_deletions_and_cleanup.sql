-- 14_cascade_profile_deletions_and_cleanup.sql
-- Fixes foreign key constraints so deleting profiles from public.profiles 
-- (or deleting auth users) automatically cascades instead of blocking with FK error.

-- 1. Fix foreign key constraints on public.quotations
-- The original table had no ON DELETE CASCADE on owner_id, causing the Supabase deletion error:
-- "DETAIL: Key (id)=(...) is still referenced from table quotations."

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='quotations') then
    alter table public.quotations 
      drop constraint if exists quotations_owner_id_fkey,
      add constraint quotations_owner_id_fkey 
        foreign key (owner_id) references public.profiles(id) on delete cascade;

    alter table public.quotations 
      drop constraint if exists quotations_owner_id_demo_session_id_fkey,
      add constraint quotations_owner_id_demo_session_id_fkey 
        foreign key (owner_id, demo_session_id) references public.profiles(id, demo_session_id) on delete cascade;

    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='quotations' and column_name='last_edited_by') then
      alter table public.quotations
        drop constraint if exists quotations_last_edited_by_fkey,
        add constraint quotations_last_edited_by_fkey
          foreign key (last_edited_by) references public.profiles(id) on delete set null;
    end if;
  end if;
end $$;

-- 2. Safely fix foreign keys on optional tables if they exist
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='activity_log') then
    alter table public.activity_log 
      drop constraint if exists activity_log_user_id_fkey,
      add constraint activity_log_user_id_fkey 
        foreign key (user_id) references public.profiles(id) on delete set null;
  end if;

  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='documents') then
    alter table public.documents 
      drop constraint if exists documents_uploaded_by_fkey,
      add constraint documents_uploaded_by_fkey 
        foreign key (uploaded_by) references public.profiles(id) on delete set null;
  end if;
end $$;

-- 3. Delete the duplicate / fake Demo Admin profiles
-- This cleanly removes the 3 duplicate Demo Admin rows and cascades their test quotations
delete from public.profiles 
where name = 'Demo Admin' or email = 'demo.admin@solarflow.example';

-- Also delete the corresponding anonymous auth users so Auth and Profiles stay 100% clean:
delete from auth.users 
where id in (
  '29a9d7c6-cd86-4234-a5c4-9f3019313ecc',
  '5abf78df-c41b-4a5b-b751-5b820a40232b',
  'dcbadf2c-6d43-4930-ac41-1823eb526715'
);
