import test from 'node:test';
import assert from 'node:assert/strict';
import {createPreparedBrief, createSavedBrief, findOwnedPreparedBriefs, preparedBriefLink, readPreparedBriefId, unlockSavedBrief, verifyPreparationPin} from '../../src/enquiries/brief.js';

const id='b391c08f-5c13-4b40-b73e-f1c7eec12205';
const code='0001';
const draft={name:'Private Name',mobile:'9000000001',company:'Example Solar',hasWebsite:'Yes',teamSize:'4–9',
 customerCount:'420',liveCustomerCount:'67',software:['Tally','Google Sheets','Unknown'],
 branches:'No',interests:['DISCOM submission document maker','Quotation maker','Unknown']};

test('client link contains only the backend draft ID; supported answers stay in the private payload', () => {
 const link=preparedBriefLink('https://example.com/',id);
 assert.equal(link,`https://example.com/#/quote?brief=${id}`);
 assert.equal(readPreparedBriefId(new URL(link).hash),id);
 assert.equal(readPreparedBriefId(`#/plans?brief=${id}`),id);
 assert.doesNotMatch(link,/Private Name|9000000001|Example Solar|Tally|Website/);
 assert.equal(createPreparedBrief(draft).name,'Private Name');
 assert.equal(createPreparedBrief(draft).mobile,'9000000001');
 assert.equal(createPreparedBrief(draft).company,'Example Solar');
 assert.deepEqual(createPreparedBrief(draft).software,['Tally','Google Sheets']);
 assert.deepEqual(createPreparedBrief(draft).interests,['DISCOM submission document maker','Quotation maker']);
 assert.equal(readPreparedBriefId('#/plans?brief=not-a-uuid'),null);
 assert.throws(()=>preparedBriefLink('https://example.com','bad'),/Invalid/);
});

test('preparing and unlocking use authenticated RPCs and sanitize returned answers', async () => {
 const calls=[];
 const client={auth:{getSession:async()=>({data:{session:null}}),signInAnonymously:async()=>({error:null})},
  rpc:async(name,args)=>{calls.push({name,args});return name==='create_prepared_brief'
   ? {data:{id,code},error:null} : {data:{...draft,unknown:'discard'},error:null};}};
 const created=await createSavedBrief(client,draft,'0905');
 assert.deepEqual(created,{id,code});
 assert.equal(code,draft.mobile.slice(-4));
 assert.deepEqual(calls[0].args.p_answers,createPreparedBrief(draft));
 assert.equal(calls[0].args.p_prepare_code,'0905');
 const opened=await unlockSavedBrief(client,id,code);
 assert.deepEqual(opened,createPreparedBrief(draft));
 assert.deepEqual(calls.map(call=>call.name),['create_prepared_brief','unlock_prepared_brief']);
 client.rpc=async()=>({data:null,error:null});
 await assert.rejects(unlockSavedBrief(client,id,'WRONG'),/saved phone number and link/);
});

test('empty prepared forms cannot be saved',async()=>{
 await assert.rejects(createSavedBrief({auth:{getSession(){assert.fail('must not authenticate');}}}, {}, '0905'),/client name.*phone number.*company name/);
});

test('preparation code is checked by the backend, and contact fields are required',async()=>{
 const calls=[];
 const client={auth:{getSession:async()=>({data:{session:{}}})},rpc:async(name,args)=>{calls.push({name,args});return {data:args.p_pin==='0905',error:null};}};
 assert.equal(await verifyPreparationPin(client,'0000'),false);
 assert.equal(await verifyPreparationPin(client,'0905'),true);
 assert.deepEqual(calls.map(call=>call.name),['verify_preparation_pin','verify_preparation_pin']);
 await assert.rejects(createSavedBrief(client,{...draft,company:''},'0905'),/company name/);
 await assert.rejects(createSavedBrief(client,draft,''),/4-digit preparation code/);
});

test('saved-form lookup uses the browser session and returns only valid matches',async()=>{
 const calls=[];
 const client={auth:{getSession:async()=>({data:{session:{}}})},rpc:async(name,args)=>{
  calls.push({name,args}); return {data:[{id,name:'Private Name',company:'Example Solar'}, {id:'bad',name:'Other',company:'Other'}],error:null};
 }};
 assert.deepEqual(await findOwnedPreparedBriefs(client,'0001'),[{id,name:'Private Name',company:'Example Solar'}]);
 assert.deepEqual(calls,[{name:'find_owned_prepared_briefs',args:{p_phone_suffix:'0001'}}]);
 await assert.rejects(findOwnedPreparedBriefs(client,'1'),/four-digit client code/);
});

test('other software name is kept only with the selected checkbox', () => {
 const withOther={...draft,software:['Other third-party software'],otherSoftware:'  Example ERP  '};
 assert.equal(createPreparedBrief(withOther).otherSoftware,'Example ERP');
 assert.equal(createPreparedBrief({...withOther,software:['Tally']}).otherSoftware,undefined);
 assert.equal(createPreparedBrief({...withOther,otherSoftware:'x'.repeat(250)}).otherSoftware.length,200);
});

test('storage provider stays only when file storage is selected', () => {
 const choice={fileStorage:'Yes',storageProvider:'Google Workspace business account'};
 assert.deepEqual(createPreparedBrief(choice),choice);
 assert.deepEqual(createPreparedBrief({...choice,fileStorage:'No'}),{fileStorage:'No'});
 assert.deepEqual(createPreparedBrief({...choice,storageProvider:'Unknown'}),{fileStorage:'Yes'});
});

test('optional installation and login answers survive a prepared client link', () => {
 const prepared=createPreparedBrief({...draft,installationTeams:'Yes',stampStaffLogin:'No',technicianLogin:'Not sure'});
 assert.equal(prepared.installationTeams,'Yes');
 assert.equal(prepared.stampStaffLogin,'No');
 assert.equal(prepared.technicianLogin,'Not sure');
 assert.equal(createPreparedBrief({...draft,installationTeams:'Unknown'}).installationTeams,undefined);
});

test('data transfer choice and custom request survive a prepared client link', () => {
 const prepared=createPreparedBrief({...draft,dataStart:'Start fresh',customRequest:'  Build a custom approval step  '});
 assert.equal(prepared.dataStart,'Start fresh');
 assert.equal(prepared.customRequest,'Build a custom approval step');
 assert.equal(createPreparedBrief({...draft,dataStart:'Invalid'}).dataStart,undefined);
 assert.equal(createPreparedBrief({...draft,customRequest:'x'.repeat(2100)}).customRequest.length,2000);
});

test('prepared client contact is trimmed, phone-normalized, and invalid phones are omitted', () => {
 const prepared=createPreparedBrief({name:'  A Client  ',mobile:'+91 90000 00001',company:'  Solar Co  '});
 assert.deepEqual(prepared,{name:'A Client',company:'Solar Co',mobile:'9000000001'});
 assert.equal(createPreparedBrief({mobile:'123'}).mobile,undefined);
});
