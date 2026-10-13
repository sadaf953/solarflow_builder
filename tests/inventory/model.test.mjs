import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeItem,numericQuantity,summarizeBomDemand} from '../../template/src/inventory/model.js';
const ref=JSON.parse(readFileSync(new URL('../../template/src/inventory/reference.json',import.meta.url)));
test('catalog covers all supplied BOM product aliases and keeps units distinct',()=>{
 assert.equal(ref.catalog.length,53);
 for(const template of Object.values(ref.templates))for(const item of template)assert.ok(ref.catalog.some(c=>normalizeItem(c.product_name)===normalizeItem(item.product_name)));
 assert.ok(!JSON.stringify(ref).includes('created_at'));assert.ok(!JSON.stringify(ref).includes('admin_id'));
});
test('compound dimensions and kit breakdowns are never silently summed',()=>{
 assert.equal(numericQuantity('12*4'),null);assert.equal(numericQuantity('3+1'),null);assert.equal(numericQuantity(''),null);assert.equal(numericQuantity('.50'),.5);assert.equal(numericQuantity('0'),0);
 const demand=summarizeBomDemand([{id:'a',product_name:'16sq MM LA Cable',uom:'MTR'}],[{product_name:'16sq MM LA cabel',uom:'MTR',quantity:'35'},{product_name:'16sq MM LA Cable',uom:'MTR',quantity:'3+1'},{product_name:'16sq MM LA Cable',uom:'Feet',quantity:'12'}]);
 assert.deepEqual(demand.get('a'),{quantity:35,unresolved:1,lines:2});
});

test('daily godown report uses India dates and preserves opening plus in minus out',async()=>{
 const {dailyStock,stockDay}=await import('../../template/src/inventory/model.js');
 assert.equal(stockDay('2026-09-15T19:00:00Z'),'2026-09-16');
 const items=[{id:'a'},{id:'b'}];
 const moves=[{item_id:'a',kind:'opening',quantity:100,created_at:'2026-09-14T10:00:00Z'},{item_id:'a',kind:'issue',quantity:10,created_at:'2026-09-15T10:00:00Z'},{item_id:'a',kind:'receipt',quantity:5,created_at:'2026-09-15T19:00:00Z'},{item_id:'a',kind:'issue',quantity:2,created_at:'2026-09-16T10:00:00Z'},{item_id:'a',kind:'receipt',quantity:50,created_at:'2026-09-17T10:00:00Z'}];
 assert.deepEqual(dailyStock(items,moves,'2026-09-16'),[{id:'a',opening:90,incoming:5,outgoing:2,closing:93},{id:'b',opening:0,incoming:0,outgoing:0,closing:0}]);
 assert.equal(dailyStock(items,moves,'2026-09-14')[0].opening,100);
});
test('reference BOMs keep only item columns: no dropdown rows or staff names',()=>{
 assert.equal(ref.metadata,undefined);
 for(const designs of Object.values(ref.scenarios))for(const design of designs){
  assert.deepEqual(Object.keys(design).sort(),['items','label','panel_count']);
  assert.ok(design.items.length>0);
  for(const line of design.items)assert.deepEqual(Object.keys(line).sort(),['product_name','quantity','sr_no','uom']);
 }
});
