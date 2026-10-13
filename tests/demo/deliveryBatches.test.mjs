import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureGroupedDemoBatches} from '../../src/demo/deliveryBatches.js';
function fixture(){
 const admin=Array.from({length:50},(_,i)=>({id:`p${i+1}`,demo_seed_key:`solarflow-50-v1-${i+1}`,delivery_batch_id:`DEMO-BATCH-${String(i+1).padStart(3,'0')}`,delivery_status:'PENDING',deleted_at:null,stage:i<9?['MATERIAL ORDER','MATERIAL INTEGRATION','MATERIAL DELIVERY'][i%3]:'LEADS'}));
 const tables={admin,delivery_batches:admin.map(p=>({id:`b${p.id}`,batch_no:p.delivery_batch_id,demo_seed_key:p.demo_seed_key,project_ids:[p.id],status:'PENDING',rent_amount:'1500',notes:'Synthetic batch; no shipment scheduled'}))};let fail=false;
 const client={tables,setFail(v){fail=v;},from(table){let action='read',body,offset=0,end=99999;const filters=[];const q={select(){return q;},order(){return q;},range(a,b){offset=a;end=b;return q;},in(k,v){filters.push(r=>v.includes(r[k]));return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},update(v){action='update';body=v;return q;},upsert(v){action='insert';body=v;return q;},delete(){action='delete';return q;},then(resolve,reject){return Promise.resolve().then(()=>{
  if(fail&&action==='delete')return {error:{message:'Delete interrupted'}};
  let rows=tables[table].filter(r=>filters.every(f=>f(r)));
  if(action==='insert'&&!tables[table].some(r=>r.batch_no===body.batch_no))tables[table].push({id:body.batch_no,...structuredClone(body)});
  if(action==='update')rows.forEach(r=>Object.assign(r,structuredClone(body)));
  if(action==='delete')tables[table]=tables[table].filter(r=>!rows.includes(r));
  return {data:structuredClone(rows.slice(offset,end+1)),error:null};
 }).then(resolve,reject);}};return q;}};return client;
}
test('50 placeholder trucks become three groups with delivery-stage projects only',async()=>{
 const c=fixture();await ensureGroupedDemoBatches(c);assert.equal(c.tables.delivery_batches.length,3);
 for(const b of c.tables.delivery_batches){assert.equal(b.project_ids.length,3);for(const id of b.project_ids)assert.equal(c.tables.admin.find(p=>p.id===id).delivery_batch_id,b.batch_no);}
 assert.ok(c.tables.admin.slice(9).every(p=>p.delivery_batch_id===null));assert.ok(c.tables.admin.every(p=>p.delivery_status==='PENDING'));
 c.tables.admin[0].delivery_batch_id=null;for(const b of c.tables.delivery_batches)b.project_ids=b.project_ids.filter(id=>id!==c.tables.admin[0].id);
 await ensureGroupedDemoBatches(c);assert.equal(c.tables.delivery_batches.length,3);assert.equal(c.tables.admin[0].delivery_batch_id,null);
});
test('retry after interrupted cleanup does not duplicate project memberships',async()=>{
 const c=fixture();c.setFail(true);await assert.rejects(()=>ensureGroupedDemoBatches(c),{message:'Delete interrupted'});
 c.setFail(false);await ensureGroupedDemoBatches(c);assert.equal(c.tables.delivery_batches.length,3);
 assert.equal(new Set(c.tables.delivery_batches.flatMap(b=>b.project_ids)).size,9);assert.equal(c.tables.delivery_batches.flatMap(b=>b.project_ids).length,9);
});
test('custom and dispatched trips remain intact',async()=>{
 const c=fixture();c.tables.delivery_batches[0].status='IN_TRANSIT';c.tables.admin[0].delivery_status='IN_TRANSIT';c.tables.delivery_batches[1].notes='My edited trip';
 await ensureGroupedDemoBatches(c);assert.equal(c.tables.delivery_batches.find(b=>b.id==='bp1').status,'IN_TRANSIT');assert.equal(c.tables.delivery_batches.find(b=>b.id==='bp2').notes,'My edited trip');assert.equal(c.tables.admin[0].delivery_batch_id,'DEMO-BATCH-001');
});
