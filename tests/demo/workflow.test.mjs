import test from 'node:test';
import assert from 'node:assert/strict';
import {demoLeadSchema} from '../../src/utils/validation.js';
import {missingStageRequirements,stageRequirements} from '../../src/demo/stageRequirements.js';
import {workflowTour,tourSteps} from '../../src/demo/tourSteps.js';
test('lead accepts only name and phone, retaining optional details and rejecting invalid supplied data',()=>{
 const base={customer_name:'Fictional Customer',phone_number:'+91 90000 00001'};
 assert.equal(demoLeadSchema.parse(base).phone_number,'9000000001');
 assert.equal(demoLeadSchema.parse({...base,email_address:'',consumer_no:'',payment_type:'',house_geo_tag_photo:false}).house_geo_tag_photo,false);
 assert.equal(demoLeadSchema.safeParse({...base,email_address:'bad'}).success,false);
 assert.equal(demoLeadSchema.safeParse({...base,phone_number:'1'}).success,false);
 assert.equal(demoLeadSchema.parse({...base,payment_type:'LOAN',vendor:'Demo Vendor 1'}).vendor,'Demo Vendor 1');
});
test('stages use at most two requirements, without photo or document flags',()=>{
 const complete={customer_name:'Fictional',phone_number:'9000000001',registration_date:'2026-09-16',registration_by:'Demo Staff Cedar',jansamarth_application_no:'DEMO-1001',payment_type:'Cash',roof_shed:'ROOF',invoice_value:'1,00,000',inverter_make:'Sample',inverter_serial_no:'DEMO001',vendor:'Demo Vendor 1',material_delivery_date:'2026-09-16',installation_status:'Installed',geo_tag_status:'Proceed',discom_submission:{submitted_by:'Demo Office',date:'2026-09-16'},meter_installation:'Yes',installation_date:'2026-09-16',discom_inspection:'Yes',subsidy_tag:'Inprocess'};
 for(const [stage,requirements] of Object.entries(stageRequirements)){
  assert.ok(requirements.length>=1 && requirements.length<=2,stage);
  assert.deepEqual(missingStageRequirements(stage,complete),[],stage);
  assert.ok(missingStageRequirements(stage,{}).length>0,stage);
 }
 assert.deepEqual(missingStageRequirements('GEO TAG PHOTO',{geo_tag_status:'Proceed',geo_tag_image:false}),[]);
 assert.equal(missingStageRequirements('MATERIAL ORDER',{roof_shed:'ROOF',invoice_value:'-3'}).length,1);
});
test('full tour orders role handoffs and finance followups; CPO stays scoped',()=>{
 const titleIndex=text=>workflowTour.findIndex(s=>s.title.includes(text));
 assert.ok(titleIndex('Agent fills') < titleIndex('Prepare the customer BOM'));
 assert.ok(titleIndex('Vendor completes installation') < titleIndex('Vendor work and installation payment'));
 assert.ok(titleIndex('Discom sends') < titleIndex('Stamp Maker uploads'));
 assert.ok(titleIndex('Stamp Maker uploads') < titleIndex('Returned stamp file'));
 assert.ok(titleIndex('First loan payment') < titleIndex('Second loan payment'));
 assert.ok(workflowTour.some(s=>s.view==='inventory' && s.tab==='daily'));
 assert.ok(workflowTour.every(s=>s.title && s.body && s.role && s.view));
 assert.ok(tourSteps('channel_partner_office').every(s=>s.role==='channel_partner_office'));
});
