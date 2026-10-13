-- SolarFlow SQL 07 — complete script with explicit function boundaries.
-- Replace the entire old SQL 07 editor contents with this file, then run all.
-- Run after 06. Reuses inventory tables; no new tables. No retrospective deductions.
begin;
alter table public.bom_items add column if not exists stock_quantity numeric(14,3) check(stock_quantity>=0);
alter table public.admin add column if not exists bom_stock_issued_at timestamptz;
alter table public.inventory_movements add column if not exists customer_id uuid;
create index if not exists inventory_movements_customer on public.inventory_movements(demo_session_id,customer_id);
create or replace function public.bom_stock_document(p_customer_id uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $bom_stock_document$
declare c public.admin; b public.bom; items jsonb; kind text;
begin
 select * into c from public.admin where id=p_customer_id and demo_session_id=auth.uid() and deleted_at is null;
 if not found then raise exception 'Project unavailable';end if;
 kind:=case when upper(c.roof_shed)='SHED' then 'SHED' else 'ROOF' end;
 if jsonb_typeof(c.bom_data->'items')='array' and coalesce(c.bom_data->'bom'->>'bom_type',c.bom_data->>'bom_type',kind)=kind then return c.bom_data;end if;
 select * into b from public.bom where admin_id=c.id and demo_session_id=auth.uid() and bom_type=kind;
 select coalesce(jsonb_agg(to_jsonb(i) order by sr_no,id),'[]'::jsonb) into items from public.bom_items i where bom_id=b.id and demo_session_id=auth.uid();
 return jsonb_build_object('bom',to_jsonb(b),'items',items);
end $bom_stock_document$;
create or replace function public.get_inventory_bom_lines()
returns jsonb language sql stable security invoker set search_path='' as $get_inventory_bom_lines$
 select coalesce(jsonb_agg(line || jsonb_build_object('customer_id',c.id,'customer_name',c.customer_name,
 'issued',c.bom_stock_issued_at is not null,'line_index',ordinality-1) order by c.customer_name,ordinality),'[]'::jsonb)
 from public.admin c cross join lateral jsonb_array_elements(public.bom_stock_document(c.id)->'items') with ordinality as l(line,ordinality)
 where c.demo_session_id=auth.uid() and c.deleted_at is null;
$get_inventory_bom_lines$;
create or replace function public.set_bom_stock_quantity(p_customer_id uuid,p_line_index integer,p_quantity numeric,p_expected_line jsonb)
returns void language plpgsql security invoker set search_path='' as $set_bom_stock_quantity$
declare c public.admin; doc jsonb; line jsonb;
begin
 if p_quantity is null or p_quantity<0 or p_quantity::text in ('NaN','Infinity','-Infinity') or p_quantity<>round(p_quantity,3) then raise exception 'Enter zero or a positive quantity with at most three decimal places';end if;
 select * into c from public.admin where id=p_customer_id and demo_session_id=auth.uid() and deleted_at is null for update;
 if not found then raise exception 'Project unavailable';end if;
 if c.bom_stock_issued_at is not null then raise exception 'Stock already issued. Record a separate stock adjustment if needed.';end if;
 doc:=public.bom_stock_document(c.id);line:=doc->'items'->p_line_index;
 if p_line_index<0 or line is null or line is distinct from p_expected_line then raise exception 'BOM changed. Refresh and review the current line.';end if;
 doc:=jsonb_set(doc,array['items',p_line_index::text,'stock_quantity'],to_jsonb(p_quantity));
 update public.admin set bom_data=doc where id=c.id;
end $set_bom_stock_quantity$;
create or replace function public.issue_delivered_bom_stock()
returns trigger language plpgsql security invoker set search_path='' as $issue_delivered_bom_stock$
declare
 doc jsonb;
 line jsonb;
 amount numeric;
 item public.inventory_items;
 r record;
 demands jsonb := '{}'::jsonb;
 raw text;
 bom_kind text;
begin
 if new.delivery_status is distinct from 'DELIVERED' or old.delivery_status is not distinct from 'DELIVERED' or old.bom_stock_issued_at is not null then return new;end if;
 if new.demo_session_id is distinct from auth.uid() then raise exception 'Project unavailable';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 doc:=public.bom_stock_document(new.id);
 bom_kind := 'ROOF';
 if upper(new.roof_shed) = 'SHED' then
  bom_kind := 'SHED';
 end if;
 if jsonb_typeof(new.bom_data->'items') = 'array'
    and coalesce(
      new.bom_data->'bom'->>'bom_type',
      new.bom_data->>'bom_type',
      bom_kind
    ) = bom_kind
 then
  doc := new.bom_data;
 end if;
 if jsonb_array_length(doc->'items')=0 then raise exception 'Create and save a BOM for % before marking Delivered',new.customer_name;end if;
 perform public.sync_inventory_catalog();
 for line in select jsonb_array_elements(doc->'items') loop
  raw:=coalesce(line->>'stock_quantity',line->>'quantity','');
  if trim(raw) !~ '^(\d+(\.\d+)?|\.\d+)$' then raise exception 'Quantity needed for %: %. Open Godown → BOM Quantities.',new.customer_name,line->>'product_name';end if;
  amount:=trim(raw)::numeric;
  if amount<>round(amount,3) then raise exception 'Use at most three decimal places for %',line->>'product_name';end if;
  if amount=0 then continue;end if;
  select * into item from public.inventory_items where demo_session_id=auth.uid() and item_key=public.inventory_item_key(line->>'product_name',line->>'uom');
  if not found then raise exception 'Add a unit and save the BOM for %',line->>'product_name';end if;
  demands:=jsonb_set(demands,array[item.id::text],to_jsonb(coalesce((demands->>item.id::text)::numeric,0)+amount));
 end loop;
 for r in select key,value from jsonb_each_text(demands) order by key loop
  select * into item from public.inventory_items where id=r.key::uuid and demo_session_id=auth.uid() for update;
  if item.stock_on_hand<r.value::numeric then raise exception 'Insufficient % for %: need %, available % %. Add quantity in Godown.',item.product_name,new.customer_name,r.value,item.stock_on_hand,item.uom;end if;
  perform public.record_inventory_movement(item.id,'issue',r.value::numeric,'BOM delivery: '||new.customer_name||' ('||new.id||')',gen_random_uuid());
  -- Link the movement to the project without changing the existing ledger schema design.
  update public.inventory_movements set customer_id=new.id where demo_session_id=auth.uid() and item_id=item.id and customer_id is null and note='BOM delivery: '||new.customer_name||' ('||new.id||')';
 end loop;
 new.bom_stock_issued_at:=now();
 return new;
end $issue_delivered_bom_stock$;
drop trigger if exists issue_delivered_bom_stock on public.admin;
create trigger issue_delivered_bom_stock before update of delivery_status on public.admin for each row execute function public.issue_delivered_bom_stock();
create or replace function public.update_delivery_batch_status_atomic(p_batch_id uuid,p_new_status text,p_project_ids uuid[])
returns jsonb language plpgsql security invoker set search_path='' as $update_delivery_batch_status_atomic$
declare b public.delivery_batches; n integer; expected integer;
begin
 if p_new_status not in ('PENDING','IN_TRANSIT','DELIVERED') or p_new_status is null then raise exception 'Invalid delivery status';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select * into b from public.delivery_batches where id=p_batch_id and demo_session_id=auth.uid() for update;
 if not found then raise exception 'Batch unavailable';end if;
 if array(select unnest(coalesce(p_project_ids,'{}'::uuid[])) order by 1) is distinct from array(select unnest(coalesce(b.project_ids,'{}'::uuid[])) order by 1) then raise exception 'Batch projects changed. Refresh and retry.';end if;
 expected:=coalesce(array_length(b.project_ids,1),0);
 update public.admin set delivery_status=p_new_status where id=any(b.project_ids) and demo_session_id=auth.uid() and deleted_at is null and delivery_batch_id=b.batch_no;
 get diagnostics n=row_count;
 if n<>expected then raise exception 'Some batch projects are unavailable or assigned elsewhere. Refresh and correct the batch.';end if;
 update public.delivery_batches set status=p_new_status where id=b.id;
 return jsonb_build_object('success',true,'projects_expected',expected,'projects_missing',0);
end $update_delivery_batch_status_atomic$;
revoke all on function public.bom_stock_document(uuid),public.get_inventory_bom_lines(),public.set_bom_stock_quantity(uuid,integer,numeric,jsonb),public.issue_delivered_bom_stock(),public.update_delivery_batch_status_atomic(uuid,text,uuid[]) from public,anon;
grant execute on function public.bom_stock_document(uuid),public.get_inventory_bom_lines(),public.set_bom_stock_quantity(uuid,integer,numeric,jsonb),public.update_delivery_batch_status_atomic(uuid,text,uuid[]) to authenticated;
-- Save and disband are transactions too: never persist a batch without its links.
create or replace function public.save_delivery_batch_atomic(p_batch jsonb,p_selected_project_ids uuid[],p_removed_project_ids uuid[])
returns jsonb language plpgsql security invoker set search_path='' as $save_batch$
declare u uuid:=auth.uid(); b public.delivery_batches; bid uuid:=(p_batch->>'id')::uuid;
 selected uuid[]:=coalesce(p_selected_project_ids,'{}'); removed uuid[]:=coalesce(p_removed_project_ids,'{}');
 expected_removed uuid[]; batch_number text:=nullif(trim(p_batch->>'batch_no'),''); n integer;
begin
 if u is null then raise exception 'Sign in to the demo first';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 if bid is null or batch_number is null then raise exception 'Batch ID and number are required';end if;
 if cardinality(selected)=0 or cardinality(selected)<>(select count(distinct id) from unnest(selected) id) then raise exception 'Choose at least one distinct project';end if;
 select * into b from public.delivery_batches where id=bid and demo_session_id=u for update;
 if found then
  if b.batch_no<>batch_number then raise exception 'Batch number cannot change';end if;
  if b.status='DELIVERED' then raise exception 'Delivered batches cannot be edited';end if;
  select coalesce(array_agg(id order by id),'{}') into expected_removed from unnest(b.project_ids) id where not(id=any(selected));
 else expected_removed:='{}';end if;
 if expected_removed is distinct from array(select id from unnest(removed) id order by id) then raise exception 'Batch projects changed. Refresh and retry.';end if;
 if coalesce(p_batch->>'status','IN_TRANSIT') not in ('PENDING','IN_TRANSIT') then raise exception 'Save the batch before marking it Delivered';end if;
 -- Lock project rows before checking ownership, prior assignment and issued stock.
 perform id from public.admin where id=any(selected||removed) and demo_session_id=u for update;
 select count(*) into n from public.admin where id=any(selected) and demo_session_id=u and deleted_at is null
  and (nullif(delivery_batch_id,'') is null or delivery_batch_id=batch_number)
  and bom_stock_issued_at is null and delivery_status is distinct from 'DELIVERED';
 if n<>cardinality(selected) then raise exception 'A project is unavailable, assigned elsewhere, or already delivered. Refresh the project list.';end if;
 select count(*) into n from public.admin where id=any(removed) and demo_session_id=u and deleted_at is null
  and delivery_batch_id=batch_number and bom_stock_issued_at is null;
 if n<>cardinality(removed) then raise exception 'A removed project changed. Refresh and retry.';end if;
 insert into public.delivery_batches(id,demo_session_id,batch_no,dispatch_date,driver_name,driver_phone,vehicle_number,rent_amount,car_rent_paid,vendor,notes,status,project_ids)
 values(bid,u,batch_number,p_batch->>'dispatch_date',p_batch->>'driver_name',p_batch->>'driver_phone',p_batch->>'vehicle_number',p_batch->>'rent_amount',coalesce(p_batch->>'car_rent_paid','No'),p_batch->>'vendor',p_batch->>'notes',coalesce(p_batch->>'status','IN_TRANSIT'),selected)
 on conflict(id) do update set dispatch_date=excluded.dispatch_date,driver_name=excluded.driver_name,driver_phone=excluded.driver_phone,
 vehicle_number=excluded.vehicle_number,rent_amount=excluded.rent_amount,car_rent_paid=excluded.car_rent_paid,vendor=excluded.vendor,
 notes=excluded.notes,status=excluded.status,project_ids=excluded.project_ids,updated_at=now();
 update public.admin set delivery_batch_id=batch_number,material_delivery_date=p_batch->>'dispatch_date',driver_name=p_batch->>'driver_name',
 driver_phone_number=p_batch->>'driver_phone',vehicle_number=p_batch->>'vehicle_number',vendor=p_batch->>'vendor',delivery_status=coalesce(p_batch->>'status','IN_TRANSIT')
 where id=any(selected) and demo_session_id=u;
 update public.admin set delivery_batch_id=null,delivery_status='PENDING' where id=any(removed) and demo_session_id=u and delivery_batch_id=batch_number;
 return jsonb_build_object('success',true);
end $save_batch$;

create or replace function public.delete_delivery_batch_atomic(p_batch_id uuid,p_project_ids uuid[])
returns jsonb language plpgsql security invoker set search_path='' as $delete_batch$
declare u uuid:=auth.uid(); b public.delivery_batches; n integer;
begin
 if u is null then raise exception 'Sign in to the demo first';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 select * into b from public.delivery_batches where id=p_batch_id and demo_session_id=u for update;
 if not found then raise exception 'Batch unavailable. Refresh and retry.';end if;
 if b.status='DELIVERED' then raise exception 'Delivered batches cannot be disbanded';end if;
 if array(select unnest(coalesce(p_project_ids,'{}'::uuid[])) order by 1) is distinct from array(select unnest(b.project_ids) order by 1) then raise exception 'Batch projects changed. Refresh and retry.';end if;
 perform id from public.admin where id=any(b.project_ids) and demo_session_id=u for update;
 select count(*) into n from public.admin where id=any(b.project_ids) and demo_session_id=u and delivery_batch_id=b.batch_no and bom_stock_issued_at is null;
 if n<>cardinality(b.project_ids) then raise exception 'Batch links changed or stock was issued. Refresh and review the projects.';end if;
 update public.admin set delivery_batch_id=null,delivery_status='PENDING' where id=any(b.project_ids) and demo_session_id=u and delivery_batch_id=b.batch_no;
 delete from public.delivery_batches where id=b.id and demo_session_id=u;
 return jsonb_build_object('success',true);
end $delete_batch$;
revoke all on function public.save_delivery_batch_atomic(jsonb,uuid[],uuid[]),public.delete_delivery_batch_atomic(uuid,uuid[]) from public,anon;
grant execute on function public.save_delivery_batch_atomic(jsonb,uuid[],uuid[]),public.delete_delivery_batch_atomic(uuid,uuid[]) to authenticated;

commit;
