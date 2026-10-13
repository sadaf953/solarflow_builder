import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeItem,numericQuantity,summarizeBomDemand} from '../../src/inventory/model.js';
const ref=JSON.parse(readFileSync(new URL('../../src/inventory/reference.json',import.meta.url)));
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
 const {dailyStock,stockDay}=await import('../../src/inventory/model.js');
 assert.equal(stockDay('2026-09-15T19:00:00Z'),'2026-09-16');
 const items=[{id:'a'},{id:'b'}];
 const moves=[{item_id:'a',kind:'opening',quantity:100,created_at:'2026-09-14T10:00:00Z'},{item_id:'a',kind:'issue',quantity:10,created_at:'2026-09-15T10:00:00Z'},{item_id:'a',kind:'receipt',quantity:5,created_at:'2026-09-15T19:00:00Z'},{item_id:'a',kind:'issue',quantity:2,created_at:'2026-09-16T10:00:00Z'},{item_id:'a',kind:'receipt',quantity:50,created_at:'2026-09-17T10:00:00Z'}];
 assert.deepEqual(dailyStock(items,moves,'2026-09-16'),[{id:'a',opening:90,incoming:5,outgoing:2,closing:93},{id:'b',opening:0,incoming:0,outgoing:0,closing:0}]);
 assert.equal(dailyStock(items,moves,'2026-09-14')[0].opening,100);
});
test('reference partner, staff and office labels are explicitly fictional or common names',()=>{
 const indianNames = new Set(['Ravi', 'Nikhil', 'Suresh', 'Amit', 'Priya']);
 for(const category of ['channel_partner','registration_by']){
  assert.ok(ref.metadata[category].length>0);
  for(const label of ref.metadata[category])assert.ok(label.startsWith('Demo '));
 }
 assert.ok(ref.metadata.integration_by.length>0);
 for(const label of ref.metadata.integration_by)assert.ok(label.startsWith('Demo ') || indianNames.has(label));
 for(const designs of Object.values(ref.scenarios))for(const design of designs){
  for(const field of ['paper_prepared_by','material_loaded_by'])if(design[field])assert.ok(design[field].startsWith('Demo ') || indianNames.has(design[field]));
  for(const line of design.items)if(line.integration_by)assert.ok(line.integration_by.startsWith('Demo ') || indianNames.has(line.integration_by));
 }
});
