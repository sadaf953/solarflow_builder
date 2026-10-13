import test from 'node:test';
import assert from 'node:assert/strict';
import {demoLeadSchema} from '../../template/src/utils/validation.js';
import {PRIMARY_STAGES,getStageRequirements,missingStageRequirements} from '../../template/src/config/index.js';
test('lead accepts only name and phone, retaining optional details and rejecting invalid supplied data',()=>{
 const base={customer_name:'Test Customer',phone_number:'+91 90000 00001'};
 assert.equal(demoLeadSchema.parse(base).phone_number,'9000000001');
 assert.equal(demoLeadSchema.parse({...base,email_address:'',consumer_no:'',payment_type:'',house_geo_tag_photo:false}).house_geo_tag_photo,false);
 assert.equal(demoLeadSchema.safeParse({...base,email_address:'bad'}).success,false);
 assert.equal(demoLeadSchema.safeParse({...base,phone_number:'1'}).success,false);
 assert.equal(demoLeadSchema.parse({...base,payment_type:'LOAN',vendor:'Vendor A'}).vendor,'Vendor A');
});
test('a complete record clears every stage, an empty one clears none that has requirements',()=>{
 const complete={customer_name:'Test Customer',phone_number:'9000000001',registration_date:'2026-09-16',jansamarth_application_no:'APP-1001',payment_type:'Cash',roof_shed:'ROOF',invoice_value:'1,00,000',inverter_make:'Sample',inverter_serial_no:'INV001',vendor:'Vendor A',material_delivery_date:'2026-09-16',installation_status:'Installed',geo_tag_status:'Proceed',discom_submission:{submitted_by:'Office',date:'2026-09-16'},meter_installation:'Yes',installation_date:'2026-09-16',discom_inspection:'Yes',subsidy_tag:'Inprocess'};
 for(const {id} of PRIMARY_STAGES){
  assert.deepEqual(missingStageRequirements(id,complete),[],id);
  if(getStageRequirements(id).length)assert.ok(missingStageRequirements(id,{}).length>0,id);
 }
 assert.deepEqual(missingStageRequirements('GEO TAG PHOTO',{geo_tag_status:'Proceed',geo_tag_image:false}),[]);
 assert.equal(missingStageRequirements('MATERIAL ORDER',{roof_shed:'ROOF',invoice_value:'-3'}).length,1);
});
