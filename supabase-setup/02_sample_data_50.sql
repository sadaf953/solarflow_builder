-- SolarFlow: 50 synthetic rows per business table, per authenticated visitor.
-- Run AFTER 01_solarflow_demo.sql, only in the NEW SolarFlow project.
-- Does not create auth users/passwords, change credentials, or send email.
-- Keeps all existing records; reruns do not overwrite demo edits.
-- Documents use mock/ paths already supported by the app's demo SVG preview.
-- They are explicitly sample placeholders, not actual files uploaded to Storage.

begin;
do $$ begin
 if to_regnamespace('solarflow_private') is null or to_regclass('public.demo_roles') is null
    or to_regprocedure('public.start_demo_session(text)') is null then
  raise exception 'Run 01_solarflow_demo.sql in the new demo project first';
 end if;
 if (select count(*) from public.demo_roles) <> 8 then raise exception 'Unexpected demo role catalog'; end if;
end $$;

do $$ declare t text; begin
 foreach t in array array['admin','metadata','vendors','drivers','activity_log','documents','bom','bom_items','delivery_batches','quotations'] loop
  execute format('alter table public.%I add column if not exists demo_seed_key text',t);
  execute format('create unique index if not exists %I on public.%I(demo_session_id,demo_seed_key) where demo_seed_key is not null',t||'_demo_seed_unique',t);
 end loop;
end $$;

create or replace function public.seed_demo_data_50()
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
 u uuid := auth.uid(); p public.profiles; i integer; customer uuid; bom_id_value uuid; batch_id_value uuid;
 seed_key text; vendor_name text; driver_name_value text; name_value text; category_value text; label_value text;
 stage_value text; status_value text; quote_form jsonb; quote_template jsonb := $template${"company":{"name":"SOLARFLOW","tagline":"SOLAR ENERGY","gstNo":"DEMO-GST-001","cinNo":"DEMO-CIN-001","email":"hello@solarflow.example"},"page1":{"customerName":"","customerPhone":"","quotationNo":"","date":"","capacityKw":"","yoursTrulyName":"","yoursTrulyPhone":"","introParagraph1":"SolarFlow is a fictional solar energy company created for this demonstration. This sample proposal illustrates a residential solar installation workflow.","introParagraph2":"All customer, company, banking and registration details shown here are synthetic. This document is for demonstration only and is not a payable quotation."},"page2":{"solarPanelMake":"","solarPanelQty":"","inverterOption":"","inverterBrand":"","gebGedaCharge":"Including","projectType":"Residential","projectSize":"","brandOptions":[{"brandName":"SolarFlow Essential","baseValue":0,"discount":0,"netPayableAmount":0,"subsidy":0,"netPriceAfterSubsidy":0},{"brandName":"SolarFlow Plus","baseValue":0,"discount":0,"netPayableAmount":0,"subsidy":0,"netPriceAfterSubsidy":0},{"brandName":"SolarFlow Premium","baseValue":0,"discount":0,"netPayableAmount":0,"subsidy":0,"netPriceAfterSubsidy":0}],"baseValue":0,"discount":0,"netPayableAmount":0,"subsidy":0,"netPriceAfterSubsidy":0,"notes":["All GST is inclusive","70% Solar Power System-(HSN CODE-8541)-5% @GST","30% Solar Power System-(HSN CODE-9954)-18% @GST","Owner Name:-Demo Owner","National Portal Empanelment Number -DEMO-PORTAL-001","Electrical Contractor Number -DEMO-CONTRACTOR-001"]},"page3":{"termsAndConditions":[{"sr":1,"parameter":"Rooftop area @10 Sq.Mtr./KWp to be provided","remarks":"Customer Scope"},{"sr":2,"parameter":"Civil works","remarks":"Included"},{"sr":3,"parameter":"Mounting, Erection, and Commissioning","remarks":"Included"},{"sr":4,"parameter":"Power evacuations (solar plant to mains)","remarks":"Included"},{"sr":5,"parameter":"Lightening arrester systems","remarks":"Included"},{"sr":6,"parameter":"Earthing systems","remarks":"Included"},{"sr":7,"parameter":"Free Operation & Maintenance (Cleaning has to be done by the customer)","remarks":"Included for 5 Years"},{"sr":8,"parameter":"Transport charges","remarks":"Included"},{"sr":9,"parameter":"Supply, Erection & Commissioning Period","remarks":"Generally, it is 1 month."},{"sr":10,"parameter":"Validity period for this quote","remarks":"15 days from the date of this offer"},{"sr":11,"parameter":"All extra and additional material/work","remarks":"As per the bill raised on actual expenditure"}],"warranties":[{"sr":1,"parameter":"SPV modules (for Manufacturing Defects)","remarks":"15 Years"},{"sr":2,"parameter":"SPV modules (for performance)","remarks":"90% Power output for the 1st 10 years\n80% power output for the 2nd 30 years"},{"sr":3,"parameter":"Inverter (for Manufacturing Defects) Back to Back","remarks":"10 Years"}],"bomItems":[{"sr":1,"description":"Solar modules","unit":"Nos","qty":"As Per the Above First Page","size":"As Per the Project","make":"As Per the Above First Page"},{"sr":2,"description":"Module mounting structure (GI)","unit":"Set","qty":"As per design","size":"(max up to 8 FT from Ground)","make":"SolarFlow Standard"},{"sr":3,"description":"String type Grid Tied Inverter","unit":"Nos","qty":"As per design","size":"As Per the Project","make":"SolarFlow Demo Inverter"},{"sr":4,"description":"AJB with accessories","unit":"Nos","qty":"As per design","size":"****","make":"DemoCable / DemoSwitch / Standard"},{"sr":5,"description":"ACDB","unit":"Nos","qty":"At actual","size":"As per design","make":"DemoCable / DemoSwitch / Standard"},{"sr":6,"description":"DC cable with UV protected","unit":"Mtr.","qty":"At actual","size":"As per design","make":"DemoCable / Equivalent"},{"sr":7,"description":"AC Cable","unit":"Mtr.","qty":"At actual","size":"As per design","make":"DemoCable / DemoWire / Equivalent"},{"sr":8,"description":"Earthing systems","unit":"Nos","qty":"At actual","size":"As per design","make":"Standard"},{"sr":9,"description":"Lightening arrester systems","unit":"Nos","qty":"At actual","size":"****","make":"Standard"},{"sr":10,"description":"LA Cable","unit":"MTR","qty":"At actual","size":"16 Sqmm Aluminium","make":"DemoFlex / DemoWire / DemoCable"}],"otherChargesText":"* 50% Advance includes discom registration charges of Rs.2000/- per KW. If any client refused to install solar plant after discom registration payment, then we shall refund the amount after deducting discom charges and receipt of same will be provided with A/C statement.","bankDetails":{"accountName":"SOLARFLOW DEMO ENERGY","accountNumber":"DEMO-ACCOUNT-0001","bankName":"Demo Bank (not payable)","branchName":"DEMO TOWN","ifscCode":"DEMO-IFSC"}},"footer":{"authorizedPartner":"SOLARFLOW Demo Aurora Solar","corporateOffice":"100 Demo Avenue, Sample City (fictional)","branchOffice":"Suite 2, Sample Plaza, Demo Town (fictional)"}}$template$::jsonb;
 stages text[] := array['LEADS','REGISTRATION','LOAN','CASH','MATERIAL ORDER','MATERIAL INTEGRATION','MATERIAL DELIVERY','INSTALLATION STATUS','GEO TAG PHOTO','DISCOM SUBMISSION','METER INSTALLATION','DISCOM INSPECTION','SUBSIDY STATUS','FINAL REVIEW','COMPLETED','LOST PROJECT'];
begin
 if u is null then raise exception 'An authenticated demo session is required'; end if;
 select * into p from public.profiles where id=u and demo_session_id=u;
 if not found then raise exception 'Call start_demo_session(role) first'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 for i in 1..50 loop
  seed_key := 'solarflow-50-v1-'||i;
  stage_value := stages[1+((i-1)%array_length(stages,1))];
  vendor_name := 'Demo Vendor '||(1+(i-1)%3);
  driver_name_value := 'Demo Driver '||(1+(i-1)%3);
  insert into public.vendors(name,email,phone)
  values(vendor_name,'vendor.'||(1+(i-1)%3)||'@solarflow.example','000000000'||(1+(i-1)%3))
  on conflict(demo_session_id,name) do nothing;
  insert into public.drivers(name,phone,vehicle_number)
  values(driver_name_value,'000000000'||(1+(i-1)%3),'DEMO-VEHICLE-00'||(1+(i-1)%3))
  on conflict(demo_session_id,name) do nothing;
  select x.category,x.label into category_value,label_value from (values
   (1,'channel_partner','Demo Aurora Solar'),(2,'sub_channel_partner','Demo Dealer'),(3,'company_branch','Demo Branch'),
   (4,'payment_type','Loan'),(5,'payment_type','Cash'),(6,'module_brand','SolarFlow Essential'),(7,'module_brand','SolarFlow Plus'),
   (8,'payment_method_modes','Demo Transfer'),(9,'registration_by','Demo Office'),(10,'subsidy_approval_status','Inprocess')
  )x(n,category,label) where x.n=i;
  if not found then category_value:='company_branch';label_value:='Demo Branch '||lpad(i::text,2,'0');end if;
  insert into public.metadata(demo_seed_key,category,label) values(seed_key,category_value,label_value)
  on conflict(demo_session_id,category,label) do update set demo_seed_key=coalesce(public.metadata.demo_seed_key,excluded.demo_seed_key);

  select id into customer from public.admin where demo_session_id=u and demo_seed_key=seed_key;
  if not found then
   -- Adopt unmodified-format sample rows from the original 8-row seed without deleting them.
   select id into customer from public.admin where demo_session_id=u and demo_seed_key is null
    and customer_name='Demo Customer '||i and email_address='customer.'||i||'@example.invalid' order by created_at limit 1;
   if found then update public.admin set demo_seed_key=seed_key where id=customer;
   else
    insert into public.admin(demo_seed_key,customer_name,phone_number,email_address,villages,full_address,sub_divisions,district,pincode,
     consumer_no,folder_no,channel_partner,sub_channel_partner,vendor,module_brand,module_wp,no_of_modules,system_capacity_kwp,
     invoice_value,payment_type,stage,loan_tag,subsidy_tag,installation_status,geo_tag_status,registration_date,registration_no,
     roof_shed,meter_installation,discom_inspection,completed_at,loan_history,subsidy_history,follow_ups,cash_details,stages_remarks)
    values(seed_key,'Demo Customer '||i,'000000'||lpad(i::text,4,'0'),'customer.'||i||'@example.invalid','Demo Village '||(1+i%5),
     'House '||i||', Sample Avenue (fictional)','Demo Town','Demo District','000000','DEMO-CONSUMER-'||i,i::text,
     'Demo Aurora Solar','Demo Dealer',vendor_name,
     'SolarFlow Essential',580,6+i%4,580*(6+i%4)/1000.0,189000+i*1000,
     case when i%2=0 then 'Loan' else 'Cash' end,stage_value,'Inprocess','Inprocess',
     case when stage_value='COMPLETED' then 'Completed' else 'Pending' end,'Pending',
     (current_date-i)::text,'DEMO-REG-'||i,case when i%2=0 then 'Roof' else 'Shed' end,'No','No',
     case when stage_value='COMPLETED' then now() else null end,
     '[]'::jsonb,'[]'::jsonb,jsonb_build_array(jsonb_build_object('date',current_date,'remark','Synthetic follow-up')),
     '{}'::jsonb,jsonb_build_object(stage_value,'Sample note for demonstration only')) returning id into customer;
   end if;
  end if;

  -- Fill previously empty Stamp examples, including existing 50-row sandboxes.
  -- Never replace a visitor's assignment, agreement text or completed work.
  if i in (10,26,42,15) then
   update public.admin set discom_submission=jsonb_build_object(
    'sent_to_stamp_maker',true,'assigned_stamp_maker','Demo Stamp',
    'first_party',customer_name,'second_party','SolarFlow Demo Energy',
    'purchased_party',customer_name,'stamp_value','300',
    'stamp_description','Sample rooftop solar installation agreement. Demonstration only.',
    'stamp_remark','Review the agreement details and add your own sample stamp image.',
    'stamp_sent',i=15,
    'stamp_completed_at',case when i=15 then now() else null end,
    'stamp_completed_by',case when i=15 then 'Demo Stamp' else null end)
   where id=customer and coalesce(discom_submission,'{}'::jsonb)='{}'::jsonb;
  end if;

  -- Sample truck groups are created by the demo app for delivery-stage projects.
  -- Do not create a truck for every customer.

  insert into public.bom(demo_seed_key,admin_id,bom_type,paper_prepared_by,paper_prepared_date,material_loaded_by,material_loaded_date)
  values(seed_key,customer,'ROOF','Demo Preparer',(current_date-i%20)::text,'Demo Loader',(current_date-i%10)::text)
  on conflict(admin_id,bom_type) do update set demo_seed_key=coalesce(public.bom.demo_seed_key,excluded.demo_seed_key)
  returning id into bom_id_value;
  insert into public.bom_items(demo_seed_key,bom_id,sr_no,product_name,quantity,uom,integration_by,note)
  values(seed_key,bom_id_value,1,'SolarFlow Demo Panel',(6+i%4)::text,'Nos','Demo Installer','Synthetic sample item')
  on conflict(demo_session_id,demo_seed_key) where demo_seed_key is not null do nothing;
  insert into public.documents(demo_seed_key,customer_id,file_name,storage_path,file_type,doc_type,uploaded_by,remark)
  values(seed_key,customer,'demo-document-'||i||'.svg','mock/demo-document-'||i||'.svg','image/svg+xml','extra_docs',u,
   'Synthetic placeholder rendered locally; no real identity or bank document, no storage upload')
  on conflict(demo_session_id,demo_seed_key) where demo_seed_key is not null do nothing;
  insert into public.activity_log(demo_seed_key,user_id,customer_id,action,message,new_value)
  values(seed_key,u,customer,'create','Created synthetic sample customer '||i,'Demo seed only')
  on conflict(demo_session_id,demo_seed_key) where demo_seed_key is not null do nothing;

  quote_form := jsonb_build_object(
   'customer_name','Demo Customer '||i,'customer_phone','000000'||lpad(i::text,4,'0'),'customer_email','customer.'||i||'@example.invalid',
   'full_address','House '||i||', Sample Avenue (fictional)','village','Demo Village','taluka','Demo Town','district','Demo District','pincode','000000',
   'quotation_date',current_date,'valid_until',current_date+15,'owner_name_snapshot',p.name,'owner_phone_snapshot','0000000000',
   'capacity_kw',3.48,'project_type','Residential','solar_panel_make','SolarFlow Essential','solar_panel_qty',6,'panel_wattage',580,
   'inverter_option','Option 1','inverter_brand','DemoVolt','geb_geda_charge','Including','source_lead_id',customer,
   'options',jsonb_build_array(
     jsonb_build_object('brandName','SolarFlow Essential','baseValue',189000+i*1000,'discount',1000,'subsidy',78000),
     jsonb_build_object('brandName','SolarFlow Plus','baseValue',197000+i*1000,'discount',1000,'subsidy',78000),
     jsonb_build_object('brandName','SolarFlow Premium','baseValue',205000+i*1000,'discount',1000,'subsidy',78000)),
   'custom_notes',jsonb_build_array('Demo only - not payable'));
  status_value := case when i%5=0 then 'lost' else 'draft' end;
  insert into public.quotations(demo_seed_key,owner_id,owner_name_snapshot,owner_phone_snapshot,customer_name,customer_phone,customer_email,
   full_address,village,taluka,district,pincode,quotation_date,valid_until,capacity_kw,project_type,solar_panel_make,solar_panel_qty,
   panel_wattage,inverter_option,inverter_brand,geb_geda_charge,source_lead_id,starting_price,status,lost_reason,quotation_data)
  values(seed_key,u,p.name,'0000000000','Demo Customer '||i,'000000'||lpad(i::text,4,'0'),'customer.'||i||'@example.invalid',
   'House '||i||', Sample Avenue (fictional)','Demo Village','Demo Town','Demo District','000000',current_date,current_date+15,
   3.48,'Residential','SolarFlow Essential',6,580,'Option 1','DemoVolt','Including',customer,188000+i*1000,status_value,
   case when status_value='lost' then 'Synthetic example: project deferred' else null end,
   jsonb_build_object('form',quote_form,'template',quote_template,'activity','[]'::jsonb))
  on conflict(demo_session_id,demo_seed_key) where demo_seed_key is not null do nothing;
 end loop;
 return jsonb_build_object('seeded_customers',(select count(*) from public.admin where demo_session_id=u and demo_seed_key like 'solarflow-50-v1-%'),
  'seed_version','solarflow-50-v1','document_mode','mock placeholders, no uploaded files');
end $$;
revoke all on function public.seed_demo_data_50() from public,anon;
grant execute on function public.seed_demo_data_50() to authenticated;

create or replace function public.start_demo_session(p_role text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare u uuid := auth.uid(); r public.demo_roles; p public.profiles; i integer;
 stages text[] := array['LEADS','REGISTRATION','LOAN','MATERIAL ORDER','MATERIAL DELIVERY','INSTALLATION STATUS','DISCOM SUBMISSION','COMPLETED'];
begin
 if u is null then raise exception 'Call signInAnonymously() first'; end if;
 select * into r from public.demo_roles where user_type=p_role;
 if not found then raise exception 'Unknown demo role'; end if;
 -- Serialize concurrent initialization for this visitor.
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 insert into public.profiles(id,demo_session_id,name,email,user_type,role,channel_partner)
 values(u,u,case p_role when 'vendor' then 'Demo Vendor' when 'agent' then 'Demo Aurora Solar' when 'agent2' then 'Demo Dealer' else 'Demo '||r.label end,
 'demo.'||p_role||'@solarflow.example',p_role,r.role,'Demo Aurora Solar')
 on conflict(id) do update set name=excluded.name,email=excluded.email,user_type=excluded.user_type,role=excluded.role,status='active'
 returning * into p;
 perform public.seed_demo_data_50();
 return to_jsonb(p) || jsonb_build_object('userType',p.user_type,'isDemo',true);
end $$;


-- Seed any EXISTING demo profiles now; do not create users directly in auth.users.
-- This SQL Editor block runs as the database owner. Browser calls always use RLS.
do $$ declare p record; old_uid text:=current_setting('request.jwt.claim.sub',true); begin
 for p in select id from public.profiles where id=demo_session_id loop
  perform set_config('request.jwt.claim.sub',p.id::text,true);
  perform public.seed_demo_data_50();
 end loop;
 perform set_config('request.jwt.claim.sub',coalesce(old_uid,''),true);
end $$;
commit;

-- With no signed-in users yet, these counts are zero until first demo login.
select 'admin' as table_name,count(*) from public.admin union all
select 'metadata',count(*) from public.metadata union all select 'vendors',count(*) from public.vendors union all
select 'drivers',count(*) from public.drivers union all select 'activity_log',count(*) from public.activity_log union all
select 'documents',count(*) from public.documents union all select 'bom',count(*) from public.bom union all
select 'bom_items',count(*) from public.bom_items union all select 'delivery_batches',count(*) from public.delivery_batches union all
select 'quotations',count(*) from public.quotations union all select 'profiles',count(*) from public.profiles union all
select 'demo_roles',count(*) from public.demo_roles;
