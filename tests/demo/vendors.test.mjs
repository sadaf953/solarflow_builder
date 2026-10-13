import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureThreeDemoVendors} from '../../src/demo/vendors.js';
function fixture(){
 const names=Array.from({length:50},(_,i)=>i===0?'Demo Vendor':`Demo Vendor ${String(i+1).padStart(2,'0')}`);
 const tables={vendors:names.map((name,i)=>({id:String(i),name})),admin:names.map((vendor,i)=>({id:String(i),vendor})),delivery_batches:names.map((vendor,i)=>({id:String(i),vendor})),profiles:[{id:'p',user_type:'vendor',name:'Demo Vendor'}],demo_profiles:[{id:'d',user_type:'vendor',name:'Demo Vendor'}]};
 let fail=false;
 return {tables,setFail(value){fail=value;},rpc:async()=>{throw new Error('Legacy vendor RPC must not run');},from(table){let action='read',body;const filters=[];const q={select(){return q;},in(k,values){filters.push(r=>values.includes(r[k]));return q;},eq(k,value){filters.push(r=>r[k]===value);return q;},update(data){action='update';body=data;return q;},upsert(data){action='upsert';body=data;return q;},delete(){action='delete';return q;},then(resolve,reject){return Promise.resolve().then(()=>{
  if(fail&&table==='delivery_batches'&&action==='update')return {error:{message:'Connection failed'}};
  let rows=tables[table].filter(r=>filters.every(f=>f(r)));
  if(action==='upsert'){if(!tables[table].some(r=>r.name===body.name))tables[table].push({id:body.name,...body});}
  if(action==='update')rows.forEach(r=>Object.assign(r,body));
  if(action==='delete')tables[table]=tables[table].filter(r=>!rows.includes(r));
  return {data:structuredClone(rows),error:null};
 }).then(resolve,reject);}};return q;}};
}
test('50 legacy vendors become three; projects, trucks and login stay linked; retries preserve result',async()=>{
 const client=fixture();await ensureThreeDemoVendors(client);
 const allowed=['Vendor 1','Vendor 2','Vendor 3'];
 assert.deepEqual(client.tables.vendors.map(v=>v.name).sort(),allowed);
 for(const table of ['admin','delivery_batches'])assert.ok(client.tables[table].every(r=>allowed.includes(r.vendor)));
 assert.equal(client.tables.profiles[0].name,'Vendor 1');assert.equal(client.tables.demo_profiles[0].name,'Vendor 1');
 await ensureThreeDemoVendors(client);assert.equal(client.tables.vendors.length,3);
});
test('a relinking failure stops deletions and a retry finishes safely',async()=>{
 const client=fixture();client.setFail(true);await assert.rejects(()=>ensureThreeDemoVendors(client),{message:'Connection failed'});
 assert.equal(client.tables.vendors.filter(v=>/^\d+$/.test(v.id)).length,50);
 client.setFail(false);await ensureThreeDemoVendors(client);assert.equal(client.tables.vendors.length,3);
});
