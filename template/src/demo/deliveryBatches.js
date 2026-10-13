const stages=new Set(['MATERIAL ORDER','MATERIAL INTEGRATION','MATERIAL DELIVERY']);
const sampleKey=value=>/^solarflow-50-v1-\d+$/.test(value||'');
const truckNote='Grouped sample delivery; no shipment scheduled';
export async function ensureGroupedDemoBatches(client){
 const checked=async query=>{const r=await query;if(r.error)throw r.error;return r.data;};
 const batches=await checked(client.from('delivery_batches').select('*'));
 const candidateObsolete=batches.filter(b=>sampleKey(b.demo_seed_key)&&/^DEMO-BATCH-\d+$/.test(b.batch_no)&&b.status==='PENDING'&&b.notes==='Synthetic batch; no shipment scheduled'&&String(b.rent_amount)==='1500'&&(b.project_ids||[]).length===1&&!(b.car_rent_paid==='Yes'));
 if(!candidateObsolete.length&&batches.some(b=>/^DEMO-TRUCK-00[123]$/.test(b.batch_no)))return;
 const readAll=async (table,columns='*')=>{const rows=[];for(let offset=0;;offset+=1000){const page=await checked(client.from(table).select(columns).order('id').range(offset,offset+999));rows.push(...page);if(page.length<1000)return rows;}};
 const projects=await readAll('admin','id,demo_seed_key,deleted_at,delivery_status,delivery_batch_id,stage');
 const obsolete=candidateObsolete.filter(b=>!projects.some(p=>p.delivery_batch_id===b.batch_no&&(p.delivery_status!=='PENDING'||!sampleKey(p.demo_seed_key))));
 if(!obsolete.length&&batches.some(b=>/^DEMO-TRUCK-00[123]$/.test(b.batch_no)))return;
 const oldNames=obsolete.map(b=>b.batch_no);
 const available=projects.filter(p=>sampleKey(p.demo_seed_key)&&!p.deleted_at&&p.delivery_status==='PENDING'&&(!p.delivery_batch_id||oldNames.includes(p.delivery_batch_id)));
 const eligible=available.filter(p=>stages.has(p.stage));
 for(let n=1;n<=3;n++){
  const batchNo=`DEMO-TRUCK-00${n}`;
  const existing=batches.find(b=>b.batch_no===batchNo);
  // Keep trips that the user has changed or dispatched intact.
  if(existing&&(existing.status!=='PENDING'||existing.notes!==truckNote))continue;
  const assigned=eligible.filter(p=>1+(Number(p.demo_seed_key.split('-').at(-1))-1)%3===n);
  if(!assigned.length)continue;
  const payload={batch_no:batchNo,dispatch_date:new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'}),driver_name:`Demo Driver ${n}`,driver_phone:`000000000${n}`,vehicle_number:`DEMO-VEHICLE-00${n}`,rent_amount:'1500',status:'PENDING',notes:truckNote,project_ids:[]};
  if(!existing)await checked(client.from('delivery_batches').upsert(payload,{onConflict:'batch_no',ignoreDuplicates:true}));
  const current=await checked(client.from('delivery_batches').select('*').eq('batch_no',batchNo));
  if(current.length!==1)throw new Error('Could not load the sample truck batch. Refresh to retry.');
  const ids=Array.from(new Set([...(current[0].project_ids||[]),...assigned.map(p=>p.id)]));
  await checked(client.from('delivery_batches').update({project_ids:ids}).eq('id',current[0].id).select('id'));
  const moved=await checked(client.from('admin').update({delivery_batch_id:batchNo,driver_name:current[0].driver_name,driver_phone_number:current[0].driver_phone,vehicle_number:current[0].vehicle_number}).in('id',assigned.map(p=>p.id)).select('id'));
  if(moved.length!==assigned.length)throw new Error('Some sample projects could not be regrouped. Refresh to retry.');
 }
 // Release early-stage/finished sample records from placeholder trucks.
 if(oldNames.length){
  await checked(client.from('admin').update({delivery_batch_id:null}).in('delivery_batch_id',oldNames).select('id'));
  const remaining=await checked(client.from('admin').select('id').in('delivery_batch_id',oldNames));
  if(remaining.length)throw new Error('Some projects still reference old sample batches. Refresh to retry.');
  const deleted=await checked(client.from('delivery_batches').delete().in('id',obsolete.map(b=>b.id)).select('id'));
  if(deleted.length!==obsolete.length)throw new Error('Some old sample batches could not be removed. Refresh to retry.');
 }
}
