import test from 'node:test';
import assert from 'node:assert/strict';
import {loadDeliveryBatches} from '../../src/delivery/load.js';

const client=result=>({from:()=>({select:()=>({order:()=>({abortSignal:async()=>result})})})});
test('delivery load distinguishes empty data from failed or incomplete responses',async()=>{
  assert.deepEqual(await loadDeliveryBatches(client({data:[]})),[]);
  const failure={message:'Network unavailable'};
  await assert.rejects(loadDeliveryBatches(client({error:failure})),error=>error===failure);
  await assert.rejects(loadDeliveryBatches(client({data:null})),/incomplete/);
  assert.deepEqual(await loadDeliveryBatches(client({data:[{id:'b'}]})),[{id:'b'}]);
});

test('delivery batches reports a stalled request instead of loading forever', async () => {
  const client={from:()=>({select:()=>({order:()=>({abortSignal:signal=>new Promise((resolve,reject)=>{
    signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')));
  })})})})};
  await assert.rejects(loadDeliveryBatches(client,{timeoutMs:5}),/too long to load/);
});
