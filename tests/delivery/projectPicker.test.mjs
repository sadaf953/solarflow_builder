import test from 'node:test';
import assert from 'node:assert/strict';
import {filterDeliveryProjects,projectAssignedElsewhere} from '../../src/delivery/projectPicker.js';
const rows=[{id:'1',stage:'LEADS',customer_name:'Selected'},{id:'2',stage:'MATERIAL DELIVERY',delivery_batch_id:'TRUCK-2',customer_name:'Assigned'},{id:'3',stage:'MATERIAL DELIVERY',customer_name:'Available'},{id:'4',stage:'MATERIAL DELIVERY',deleted_at:'2026-09-16'}];
test('material delivery includes assigned records and selected records from another stage',()=>{
 assert.deepEqual(filterDeliveryProjects(rows,{selectedIds:['1']}).map(r=>r.id),['1','2','3']);
 assert.equal(projectAssignedElsewhere(rows[1],{batch_no:'TRUCK-1'}),true);
 assert.equal(projectAssignedElsewhere(rows[1],{batch_no:'TRUCK-2'}),false);
 assert.equal(projectAssignedElsewhere(rows[2],null),false);
});
test('selected records remain visible under search, and deleted records remain excluded',()=>{
 assert.deepEqual(filterDeliveryProjects(rows,{selectedIds:['1','4'],query:'available'}).map(r=>r.id),['1','3']);
 assert.equal(filterDeliveryProjects(rows,{query:'missing'}).length,0);
});
