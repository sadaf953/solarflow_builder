import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureThreeDemoDrivers} from '../../src/demo/drivers.js';
function fixture(){
 const names=Array.from({length:50},(_,i)=>i===0?'Demo Driver':`Demo Driver ${String(i+1).padStart(2,'0')}`);
 const tables={drivers:names.map((name,i)=>({id:String(i),name})),admin:names.map((driver_name,i)=>({id:String(i),driver_name,vehicle_number:`TRUCK-${i}`})),delivery_batches:names.map((driver_name,i)=>({id:String(i),driver_name,vehicle_number:`TRUCK-${i}`})),profiles:[{id:'p',user_type:'driver_name',name:'Demo Driver'}],demo_profiles:[{id:'d',user_type:'driver_name',name:'Demo Driver'}]};
 let fail=false;
 return {tables,setFail(value){fail=value;},rpc:async()=>({error:{code:'PGRST202'}}),from(table){let action='read',body;const filters=[];const q={select(){return q;},in(k,values){filters.push(r=>values.includes(r[k]));return q;},eq(k,value){filters.push(r=>r[k]===value);return q;},update(data){action='update';body=data;return q;},upsert(data){action='upsert';body=data;return q;},delete(){action='delete';return q;},then(resolve,reject){return Promise.resolve().then(()=>{
  if(fail&&table==='delivery_batches'&&action==='update')return {error:{message:'Connection failed'}};
  let rows=tables[table].filter(r=>filters.every(f=>f(r)));
  if(action==='upsert'){if(!tables[table].some(r=>r.name===body.name))tables[table].push({id:body.name,...body});}
  if(action==='update')rows.forEach(r=>Object.assign(r,body));
  if(action==='delete')tables[table]=tables[table].filter(r=>!rows.includes(r));
  return {data:structuredClone(rows),error:null};
 }).then(resolve,reject);}};return q;}};
}
test('50 legacy drivers become three; projects, trucks and login stay linked; retries preserve result',async()=>{
 const client=fixture();await ensureThreeDemoDrivers(client);
 const allowed=['Driver 1','Driver 2','Driver 3'];
 assert.deepEqual(client.tables.drivers.map(v=>v.name).sort(),allowed);
 for(const table of ['admin','delivery_batches'])assert.ok(client.tables[table].every(r=>allowed.includes(r.driver_name)));
 assert.equal(client.tables.admin[0].driver_phone_number,'0000000001');assert.equal(client.tables.delivery_batches[0].driver_phone,'0000000001');assert.equal(client.tables.delivery_batches[0].vehicle_number,'TRUCK-0');
 await ensureThreeDemoDrivers(client);assert.equal(client.tables.drivers.length,3);
});
test('a relinking failure stops deletions and a retry finishes safely',async()=>{
 const client=fixture();client.setFail(true);await assert.rejects(()=>ensureThreeDemoDrivers(client),{message:'Connection failed'});
 assert.equal(client.tables.drivers.filter(v=>/^\d+$/.test(v.id)).length,50);
 client.setFail(false);await ensureThreeDemoDrivers(client);assert.equal(client.tables.drivers.length,3);
});
