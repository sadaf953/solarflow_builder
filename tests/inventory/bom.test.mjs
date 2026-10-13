import test from 'node:test';
import assert from 'node:assert/strict';
import {supabase} from '../../src/supabase.js';
import {loadBomForCustomer,getBomTemplateForType} from '../../src/utils/bom.js';
import {memoryClient} from '../quotations/memoryClient.mjs';
test('roof and shed load their own records; saved blanks and zero are preserved',async()=>{
 const original=supabase.from;
 const client=memoryClient({bom:[{id:'roof',admin_id:'customer',bom_type:'ROOF'},{id:'shed',admin_id:'customer',bom_type:'SHED'}],bom_items:[{id:'1',bom_id:'roof',product_name:'Solar Panel',quantity:'8',uom:'Nos'},{id:'2',bom_id:'shed',product_name:'Solar Panel',quantity:'6',uom:'Nos'},{id:'3',bom_id:'shed',product_name:'Dc Cable',quantity:'',uom:'MTR'},{id:'4',bom_id:'shed',product_name:'Earthing Cable',quantity:'0',uom:'MTR'}]});
 supabase.from=client.from;
 try{const result=await loadBomForCustomer({id:'customer',bom_data:{bom:{bom_type:'ROOF'},items:[]}},'SHED');assert.equal(result.bom.id,'shed');assert.equal(result.items.find(i=>i.product_name==='Solar Panel').quantity,'6');assert.equal(result.items.find(i=>i.product_name==='Dc Cable').quantity,'');assert.equal(result.items.find(i=>i.product_name==='Earthing Cable').quantity,'0');assert.equal(result.items.length,35);}finally{supabase.from=original;}
});
test('reference templates use supplied quantities and preserve compound lengths',()=>{
 assert.equal(getBomTemplateForType('ROOF').length,45);assert.equal(getBomTemplateForType('SHED').length,35);
 assert.match(getBomTemplateForType('ROOF').find(i=>i.product_name==='40*40 Pipe Perlin').quantity,/\*/);
});

test('reviewed stock quantities survive loading without changing the reference dimensions',async()=>{
 const customer={id:'inline',bom_data:{bom:{bom_type:'ROOF'},items:[{product_name:'40*40 Pipe Perlin',quantity:'12*4',stock_quantity:48,uom:'Feet'},{product_name:'Solar Panel',quantity:'6',stock_quantity:0,uom:'Nos'}]}};
 const result=await loadBomForCustomer(customer,'ROOF');
 const pipe=result.items.find(i=>i.product_name==='40*40 Pipe Perlin');assert.equal(pipe.quantity,'12*4');assert.equal(pipe.stock_quantity,48);
 assert.equal(result.items.find(i=>i.product_name==='Solar Panel').stock_quantity,0);
});
