import test from 'node:test';
import assert from 'node:assert/strict';
import {createQuotationRepository} from '../../src/quotations/repository.js';
import {newForm,freshTemplate} from '../../src/quotations/model.js';
import {memoryClient} from './memoryClient.mjs';
const user={id:'owner',name:'Agent',phone:'0000000000'};
async function setup(){const client=memoryClient();const repo=createQuotationRepository(client);const form={...newForm(user),customer_name:'Customer',customer_phone:'0000000001',capacity_kw:3.48,solar_panel_qty:6,panel_wattage:580,solar_panel_make:'SolarFlow',inverter_option:'Option 1',inverter_brand:'DemoVolt',options:['a','b','c'].map(brandName=>({brandName,baseValue:100000,discount:100,subsidy:1000}))};const row=await repo.save('quote',null,form,freshTemplate(),user);return{client,repo,form,row};}
test('repeated initial saves share one quotation identity',async()=>{const{repo,form,client}=await setup();await repo.save('quote',null,form,freshTemplate(),user);assert.equal(client.state.tables.quotations.length,1);});
test('concurrent edits cannot silently overwrite another session',async()=>{const{repo,row,form}=await setup();await repo.save('quote',row,{...form,customer_name:'Latest'},freshTemplate(),user);await assert.rejects(repo.save('quote',row,{...form,customer_name:'Stale'},freshTemplate(),user),/another session/);});
test('issue, loss, reopen and PDF generation preserve outcomes and snapshots',async()=>{const{repo,row}=await setup();const issued=await repo.generated(row,user);assert.equal(issued.status,'issued');const lost=await repo.outcome(issued,'lost',user,'Price');const downloaded=await repo.generated(lost,user);assert.equal(downloaded.status,'lost');assert.equal(downloaded.quotation_data.issued_versions.length,1);assert.equal((await repo.outcome(downloaded,'reopened',user)).status,'issued');});
test('incomplete documents cannot be issued',async()=>{const{repo,row}=await setup();row.quotation_data.form.customer_phone='';await assert.rejects(repo.generated(row,user),/mobile number/);});
test('deferred conversion retry inserts exactly one lead',async()=>{const{repo,row,client}=await setup();client.state.failLinkOnce=true;await assert.rejects(repo.insertConversionLead(row,{customer_name:'Lead'},user),/interrupted/);const result=await repo.insertConversionLead(row,{customer_name:'Lead'},user);assert.equal(result.data.id,row.id);assert.equal(client.state.tables.admin.length,1);assert.equal((await repo.get(row.id)).converted_lead_id,row.id);});
test('deferred simultaneous conversion attempts converge on the same lead',async()=>{const{repo,row,client}=await setup();const results=await Promise.allSettled([repo.insertConversionLead(row,{customer_name:'Lead'},user),repo.insertConversionLead(row,{customer_name:'Lead'},user)]);assert.equal(client.state.tables.admin.length,1);assert.ok(results.some(r=>r.status==='fulfilled'));const retry=await repo.insertConversionLead(row,{},user);assert.equal(retry.data.id,row.id);});
test('deferred conversion preserves the quotation document',async()=>{const{repo,row,client}=await setup();await repo.insertConversionLead(row,{customer_name:'Lead Customer'},user);assert.equal(client.state.tables.admin.length,1);assert.equal((await repo.get(row.id)).converted_lead_id,row.id);assert.deepEqual((await repo.get(row.id)).quotation_data.form,row.quotation_data.form);});
test('pagination and number search',async()=>{const{repo,row,client}=await setup();for(let i=0;i<25;i++)client.state.tables.quotations.push({...row,id:`extra${i}`,quotation_no:4000+i});assert.equal((await repo.list({page:0})).rows.length,20);assert.equal((await repo.list({page:1})).rows.length,6);assert.equal((await repo.list({search:'Quote-4003'})).rows[0].quotation_no,4003);});
test('lost quotation cannot create a lead until reopened, converted stays in both lists',async()=>{
 const {repo,row,client}=await setup();
 const lost=await repo.outcome(row,'lost',user,'Customer paused');
 await assert.rejects(repo.insertConversionLead(lost,{customer_name:'Lead'},user),/Reopen/);
 assert.equal(client.state.tables.admin.length,0);
 const reopened=await repo.outcome(lost,'reopened',user);
 await repo.insertConversionLead(reopened,{customer_name:'Lead',stage:'LEADS'},user);
 assert.equal(client.state.tables.admin.length,1);
 assert.equal((await repo.list({status:'converted'})).rows.length,1);
 await assert.rejects(repo.outcome(await repo.get(row.id),'lost',user,'Later'),/converted quotation/);
});
