import test from 'node:test';
import assert from 'node:assert/strict';
import {updateDeliveryStatus} from '../../src/delivery/status.js';
test('delivery failures never fall back to non-transactional writes', async () => {
 for(const failure of [{code:'P0001',message:'Insufficient stock'},{code:'PGRST202',message:'Missing function'}]) {
  const client={rpc:async()=>({error:failure}),from:()=>{assert.fail('must not write tables separately');}};
  await assert.rejects(updateDeliveryStatus(client,'batch','DELIVERED',['project']),error=>error===failure);
 }
});
test('delivery needs an acknowledged atomic result', async () => {
 await assert.rejects(updateDeliveryStatus({rpc:async()=>({data:null})},'batch','DELIVERED',[]),/not confirmed/);
 let args;
 await updateDeliveryStatus({rpc:async(name,payload)=>{args={name,payload};return {data:{success:true}};}},'batch','DELIVERED',['project']);
 assert.equal(args.name,'update_delivery_batch_status_atomic');assert.deepEqual(args.payload.p_project_ids,['project']);
});

test('save and delete never fall back when transaction functions are absent or fail', async () => {
 const {saveDeliveryBatch,deleteDeliveryBatch}=await import('../../src/delivery/status.js');
 const client={rpc:async()=>({error:{code:'PGRST202'}}),from:()=>assert.fail('separate writes forbidden')};
 await assert.rejects(saveDeliveryBatch(client,{id:'b'},['p'],[]),/SQL 07/);
 await assert.rejects(deleteDeliveryBatch(client,'b',['p']),/SQL 07/);
 const failed={rpc:async()=>({error:{message:'Project assigned elsewhere'}})};
 await assert.rejects(saveDeliveryBatch(failed,{id:'b'},['p'],[]),error=>error.message==='Project assigned elsewhere');
});

test('project removal uses one transaction and disbands only the last project', async () => {
 const {removeDeliveryProject}=await import('../../src/delivery/status.js');
 const calls=[];
 const client={rpc:async(name,args)=>{calls.push({name,args});return {data:{success:true}};},from:()=>assert.fail('separate writes forbidden')};
 await removeDeliveryProject(client,{id:'b',project_ids:['p','q']},'p');
 assert.equal(calls[0].name,'save_delivery_batch_atomic');
 assert.deepEqual(calls[0].args.p_selected_project_ids,['q']);
 assert.deepEqual(calls[0].args.p_removed_project_ids,['p']);
 await removeDeliveryProject(client,{id:'b',project_ids:['q']},'q');
 assert.equal(calls[1].name,'delete_delivery_batch_atomic');
 await assert.rejects(removeDeliveryProject(client,{id:'b',project_ids:['q']},'missing'),/changed/);
 assert.equal(calls.length,2);
 const failure={message:'Stock already issued'};
 await assert.rejects(removeDeliveryProject({rpc:async()=>({error:failure})},{id:'b',project_ids:['p','q']},'p'),error=>error===failure);
});
