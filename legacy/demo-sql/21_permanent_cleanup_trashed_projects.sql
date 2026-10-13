-- Permanently remove the 300 projects already in Trash.
-- Guardrails: this transaction only runs when there are exactly 500 active
-- projects and exactly 300 trashed projects.

begin;

lock table public.admin in share row exclusive mode;
lock table public.delivery_batches in share row exclusive mode;

create temporary table doomed_projects on commit drop as
select id
from public.admin
where deleted_at is not null;

do $$
declare
  active_count integer;
  trashed_count integer;
begin
  select count(*) into active_count
  from public.admin
  where deleted_at is null;

  select count(*) into trashed_count
  from doomed_projects;

  if active_count <> 500 or trashed_count <> 300 then
    raise exception
      'Cleanup cancelled: expected 500 active and 300 trashed projects, found % active and % trashed.',
      active_count,
      trashed_count;
  end if;
end
$$;

-- Delivery batches store project IDs in an array rather than a foreign key.
-- Remove the deleted IDs while preserving the order of the remaining IDs.
update public.delivery_batches as batch
set project_ids = (
  select coalesce(array_agg(item.project_id order by item.position), '{}'::uuid[])
  from unnest(batch.project_ids) with ordinality as item(project_id, position)
  where not exists (
    select 1
    from doomed_projects as doomed
    where doomed.id = item.project_id
  )
)
where batch.project_ids && array(select id from doomed_projects);

-- Remove batches that no longer contain any projects.
delete from public.delivery_batches
where cardinality(project_ids) = 0;

-- Activity rows use ON DELETE SET NULL. Remove the five linked demo entries
-- explicitly so the permanent cleanup does not leave anonymous history rows.
delete from public.activity_log as activity
using doomed_projects as doomed
where activity.customer_id = doomed.id;

-- Documents and BOM rows cascade through their foreign keys. BOM items then
-- cascade from BOM. Quotation lead references are set to NULL by their FKs.
delete from public.admin as project
using doomed_projects as doomed
where project.id = doomed.id;

do $$
declare
  remaining_count integer;
  trashed_count integer;
  stale_batch_references integer;
begin
  select count(*) into remaining_count from public.admin;
  select count(*) into trashed_count from public.admin where deleted_at is not null;

  select count(*) into stale_batch_references
  from public.delivery_batches as batch
  cross join lateral unnest(batch.project_ids) as item(project_id)
  join doomed_projects as doomed on doomed.id = item.project_id;

  if remaining_count <> 500 or trashed_count <> 0 or stale_batch_references <> 0 then
    raise exception
      'Verification failed: % total, % trashed, % stale delivery references.',
      remaining_count,
      trashed_count,
      stale_batch_references;
  end if;
end
$$;

commit;

select
  count(*) as backend_projects,
  count(*) filter (where deleted_at is null) as active_projects,
  count(*) filter (where deleted_at is not null) as trashed_projects
from public.admin;
