// Fill missing details on existing seeded projects; never create customer rows.
import fs from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {parseEnv,validateDemoEnv,DEMO_URL} from './demo-env.mjs';

const stages=['LEADS','REGISTRATION','LOAN','CASH','MATERIAL ORDER','MATERIAL INTEGRATION','MATERIAL DELIVERY','INSTALLATION STATUS','GEO TAG PHOTO','DISCOM SUBMISSION','METER INSTALLATION','DISCOM INSPECTION','SUBSIDY STATUS','FINAL REVIEW','COMPLETED'];
const dayMs=86400000;
const empty=value=>value==null||value==='';
const iso=day=>new Date(day*dayMs).toISOString().slice(0,10);
const day=value=>Math.floor(Date.parse(value)/dayMs);

export function enrichment(row,today=new Date().toISOString().slice(0,10)){
 if(!row.demo_seed_key||row.deleted_at)return {};
 const rank=stages.indexOf(row.stage);
 const patch={};
 const fill=(key,value)=>{if(empty(row[key])&&value!=null)patch[key]=value;};
 const n=Number(row.demo_seed_key.match(/(\d+)$/)?.[1]||1);
 const ref=`DEMO-${String(n).padStart(4,'0')}-${row.id.slice(0,8)}`;
 const todayDay=day(today);
 const created=Math.min(day(row.created_at)||todayDay,todayDay);
 const registered=empty(row.registration_date)?Math.min(created+1,todayDay):day(row.registration_date);
 // Compress later milestones into the available elapsed time without future dates.
 const at=step=>iso(Math.min(todayDay,registered+Math.floor(Math.max(0,todayDay-registered)*Math.min(step,Math.max(rank,1))/Math.max(rank,1))));
 fill('full_address',`Demo residence ${n}, ${row.villages||'Sample Village'}, ${row.district||'Demo District'}${row.pincode?` – ${row.pincode}`:''}`);
 fill('consumer_no',`${ref}-CONSUMER`);
 fill('folder_no',`${ref}-FILE`);
 if(!Array.isArray(row.follow_ups)||!row.follow_ups.length)patch.follow_ups=[{date:iso(created),remark:'Sample enquiry: rooftop survey and system requirements discussed.'}];
 if(rank>=1){
  fill('registration_date',iso(registered));
  fill('registration_no',`${ref}-REG`);
  fill('registration_by','Demo Office');
  fill('feasibility_no',`${ref}-FEAS`);
 }
 if(row.payment_type==='Loan'&&rank>=2){
  fill('loan_registration_date',at(2));
  fill('jansamarth_application_no',`${ref}-LOAN`);
  fill('bank_name','Demo Bank');fill('bank_branch',`${row.district||'Demo'} Sample Branch`);fill('loan_by','Demo Office');
  if(!row.loan_history?.length&&row.loan_tag)patch.loan_history=[{status:row.loan_tag,date:at(2),remark:`Sample loan file: ${row.loan_tag}. Follow up with the demo branch.`,created_at:`${at(2)}T10:00:00Z`}];
 }
 if(rank>=4){
  fill('roof_shed',n%4===0?'SHED':'ROOF');
  fill('dc_cable',30+n%3*5);fill('ac_cable',15+n%3*5);
  fill('structure_front_leg_height',3);fill('structure_rear_leg_height',5);
  fill('material_order_notes','Sample order: confirm roof measurements, cable routing and earthing points before dispatch.');
  fill('invoice_no',`${ref}-INV`);fill('inverter_make',n%2?'Goodwe':'Solaryaan');
 }
 if(rank>=6)fill('material_delivery_date',at(6));
 if(rank>=7&&['Installed','Yes'].includes(row.installation_status)){
  const installed=row.material_delivery_date?iso(Math.min(todayDay,Math.max(day(row.material_delivery_date),day(at(7))))):at(7);
  fill('installation_date',installed);
  fill('panel_serial_no',`${ref}-PV-01 to ${ref}-PV-${String(row.no_of_modules||6).padStart(2,'0')}`);
  fill('inverter_serial_no',`${ref}-INV-01`);
  fill('installation_note','Sample installation: module mounting, cable routing and earthing checked.');
  fill('vendor_note','Sample site visit: access and installation work reviewed with the customer.');
 }
 if(rank>=9){
  const submission={...(row.discom_submission||{})};
  for(const [key,value] of Object.entries({date:at(9),submitted_by:'Demo Office',first_party:row.customer_name,second_party:'SolarFlow Demo Energy',remark:'Sample utility submission: project file prepared for review.'}))if(empty(submission[key]))submission[key]=value;
  if(JSON.stringify(submission)!==JSON.stringify(row.discom_submission))patch.discom_submission=submission;
 }
 if(rank>=12&&!row.subsidy_history?.length&&row.subsidy_tag)patch.subsidy_history=[{status:row.subsidy_tag,date:at(12),remark:`Sample subsidy claim: ${row.subsidy_tag}. Track the application response.`,created_at:`${at(12)}T10:00:00Z`}];
 if(rank===14)fill('completed_at',`${at(14)}T12:00:00Z`);
 if(row.vendor_payment_status==='Paid'&&rank>=7){fill('vendor_paid_date',row.installation_date||patch.installation_date||at(7));fill('vendor_paid_by','Demo Office');}
 if(row.payment_type==='Cash'&&rank>=3&&!row.cash_details?.payments?.length&&Number(row.invoice_value)>0){
  const total=Number(row.invoice_value);
  patch.cash_details={...(row.cash_details||{}),total_amount:row.cash_details?.total_amount||total,payments:[{name:'1st Payment',amount:Math.round(total*0.3),type:'Cash',date:at(3),transaction_id:`${ref}-SAMPLE-ADVANCE`}]};
 }
 return patch;
}

if(process.argv[1]&&import.meta.url===new URL(process.argv[1],'file:').href){
 const env=parseEnv(fs.readFileSync('.env','utf8'));validateDemoEnv(env);
 const client=createClient(DEMO_URL,env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const session=JSON.parse(fs.readFileSync('/private/tmp/solarflow-enrich-session.json','utf8'));
 const auth=await client.auth.setSession(session);if(auth.error)throw auth.error;
 const read=await client.from('admin').select('*').is('deleted_at',null).order('id');if(read.error)throw read.error;
 const plan=read.data.map(row=>({id:row.id,patch:enrichment(row)})).filter(item=>Object.keys(item.patch).length);
 console.log(JSON.stringify({existing:read.data.length,toEnrich:plan.length,fields:[...new Set(plan.flatMap(item=>Object.keys(item.patch)))]}));
 if(process.argv.includes('--apply')){
  fs.writeFileSync('/private/tmp/solarflow-enrich-rollback.json',JSON.stringify(plan.map(item=>({id:item.id,patch:Object.fromEntries(Object.keys(item.patch).map(key=>[key,read.data.find(row=>row.id===item.id)[key]]))}))),{mode:0o600});
  let updated=0;
  for(const item of plan){const result=await client.from('admin').update(item.patch).eq('id',item.id).select('id');if(result.error)throw result.error;if(result.data.length!==1)throw new Error(`No update for ${item.id}`);updated++;}
  const verify=await client.from('admin').select('*').is('deleted_at',null).order('id');if(verify.error)throw verify.error;
  if(verify.data.length!==read.data.length)throw new Error('Customer count changed');
  const remaining=verify.data.filter(row=>Object.keys(enrichment(row)).length).length;
  console.log(JSON.stringify({updated,customerCount:verify.data.length,remaining}));
 }
 await client.auth.signOut();
}
