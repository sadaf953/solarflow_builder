import test from 'node:test';
import assert from 'node:assert/strict';
import {enquiryPayload, submitEnquiry} from '../../src/enquiries/submit.js';
const draft={name:'Demo',company:'Sample',mobile:'+91 90000 00001',modelType:'advance',storeFiles:'no',remarks:'Demo only'};
test('payload uses the existing enquiry schema and normalizes phone',()=>{
 const result=enquiryPayload(draft);
 assert.equal(result.mobile_number,'9000000001');
 assert.equal(result.version_type,'advance');
 assert.equal(result.notes,'File storage: No — simple checklists\nInterested in: Not specified — discuss on call\nCustom request: Demo only');
 assert.equal('model_type' in result,false);
 for(const mobile of ['abc9000000001','123','999999999999999']) assert.throws(()=>enquiryPayload({...draft,mobile}));
});
test('only an acknowledged insert succeeds; errors and missing responses fail',async()=>{
 for(const result of [{error:null,status:201},{error:{message:'denied'},status:403},{error:null,status:0},{error:null},null]) {
  const client={from(table){assert.equal(table,'enquiries');return {insert:async rows=>{assert.equal(rows.length,1);return result;}};}};
  if(result?.status===201) await submitEnquiry(client,enquiryPayload(draft));
  else await assert.rejects(submitEnquiry(client,enquiryPayload(draft)));
 }
 await assert.rejects(submitEnquiry({from(){return {insert(){throw new Error('offline');}};}},enquiryPayload(draft)));
});

test('optional interests and call preferences are saved in existing notes', () => {
 const payload = enquiryPayload({...draft, callDate:'2026-09-29', callTime:'14:30', interests:['Quotation maker', 'Branches'], storeFiles:'unspecified'});
 assert.match(payload.notes, /Preferred call date: 2026-09-29/);
 assert.match(payload.notes, /Preferred call time \(Asia\/Kolkata\): 14:30/);
 assert.match(payload.notes, /Interested in: Quotation maker, Branches/);
 assert.match(payload.notes, /File storage: Discuss on call/);
 const skipped = enquiryPayload({...draft, interests:[], callDate:'', callTime:''});
 assert.match(skipped.notes, /Interested in: Not specified/);
 assert.doesNotMatch(skipped.notes, /Preferred call/);
});

test('guided business answers are saved with the same enquiry', () => {
 const payload=enquiryPayload({...draft,businessDetails:{hasWebsite:'Yes',teamSize:'4–9',customerCount:'420',liveCustomerCount:'67',software:['Tally','Google Sheets'],branches:'No',partnerOffices:'Yes',channelPartners:'Not sure',installationTeams:'Yes',stampStaffLogin:'No',technicianLogin:'Yes'}});
 for(const detail of ['Website: Yes','Employees: 4–9','Total customers: 420','Live customers: 67','Current software: Tally, Google Sheets','Branches: No','Channel partner offices: Yes','Channel partners: Not sure','Third-party or multiple installation teams: Yes','Stamp staff login: No','Technician logins: Yes']) assert.ok(payload.notes.includes(detail));
});

test('existing-data choice and custom request are included in the enquiry', () => {
 const payload=enquiryPayload({...draft,businessDetails:{dataStart:'Transfer existing data'},remarks:'Import our live customers first'});
 assert.match(payload.notes,/Existing data: Transfer existing data/);
 assert.match(payload.notes,/Custom request: Import our live customers first/);
});

test('named third-party software is included only when selected', () => {
 const businessDetails={software:['Other third-party software'],otherSoftware:'Example ERP'};
 assert.match(enquiryPayload({...draft,businessDetails}).notes,/Other software: Example ERP/);
 assert.doesNotMatch(enquiryPayload({...draft,businessDetails:{...businessDetails,software:['Tally']}}).notes,/Other software:/);
});

test('storage provider is included when files are chosen', () => {
 const payload=enquiryPayload({...draft,storeFiles:'yes',storageProvider:'Supabase Storage'});
 assert.match(payload.notes,/File storage: Yes\nPreferred storage provider: Supabase Storage/);
 assert.doesNotMatch(enquiryPayload({...draft,storeFiles:'no',storageProvider:'Supabase Storage'}).notes,/Preferred storage provider/);
});

test('quick enquiries retain the selected plan or tools interest in notes', () => {
 for (const selectedInterest of ['Option 1: Small team setup', 'Option 2: Detailed operations', 'Tools only — no CRM']) {
  const result = enquiryPayload({...draft, company:'', remarks:'', selectedInterest, interests:[selectedInterest]});
  assert.ok(result.notes.includes(`Selected option: ${selectedInterest}`));
  assert.ok(result.notes.includes(`Interested in: ${selectedInterest}`));
  assert.equal(result.company_name,null);
 }
});

test('both steps use one identity and require acknowledgement; retries reuse it', async () => {
 const {saveEnquiryStep} = await import('../../src/enquiries/submit.js');
 const identity={id:'saved-id',editToken:'edit-token'};
 const calls=[];
 const client={auth:{getSession:async()=>({data:{session:{}}})},rpc:async(name,args)=>{
  assert.equal(name,'save_enquiry_details'); calls.push(args); return {data:identity.id,error:null};
 }};
 await saveEnquiryStep(client,enquiryPayload({...draft,company:'',remarks:''}),identity,{contactOnly:true});
 await saveEnquiryStep(client,enquiryPayload({...draft,interests:['Quotation maker'],callTime:'14:00'}),identity);
 assert.equal(calls.length,2);
 assert.equal(calls[0].p_id,calls[1].p_id);
 assert.equal(calls[0].p_edit_token,calls[1].p_edit_token);
 assert.equal(calls[0].p_company,null);
 assert.match(calls[1].p_notes,/Quotation maker/);
 client.rpc=async()=>({data:null,error:null});
 await assert.rejects(saveEnquiryStep(client,enquiryPayload(draft),identity),/confirmation/);
});

test('legacy backend captures the contact only and never duplicates it for optional details', async () => {
 const {saveEnquiryStep} = await import('../../src/enquiries/submit.js');
 let inserts=0,signIns=0;
 const client={
  auth:{getSession:async()=>({data:{session:null}}),signInAnonymously:async()=>{signIns++;return {error:null};}},
  rpc:async()=>({error:{code:'PGRST202'}}),
  from:()=>({insert:async rows=>{inserts++;assert.equal(rows[0].id,'quick-id');return {status:201,error:null};}})
 };
 const identity={id:'quick-id',editToken:'token'};
 await saveEnquiryStep(client,enquiryPayload(draft),identity,{contactOnly:true});
 assert.equal(inserts,1); assert.equal(signIns,1);
 await assert.rejects(saveEnquiryStep(client,enquiryPayload(draft),identity),/contact details are saved/);
 assert.equal(inserts,1);
});

test('permission and auth errors are never treated as successful contact saves', async () => {
 const {saveEnquiryStep}=await import('../../src/enquiries/submit.js');
 const client={auth:{getSession:async()=>({data:{session:{}},error:null})},rpc:async()=>({error:{code:'42501',message:'denied'}}),from(){assert.fail('must not fall back on access errors');}};
 await assert.rejects(saveEnquiryStep(client,enquiryPayload(draft),{id:'id',editToken:'token'},{contactOnly:true}));
 client.auth.getSession=async()=>({error:new Error('offline')});
 await assert.rejects(saveEnquiryStep(client,enquiryPayload(draft),{id:'id',editToken:'token'}),/offline/);
});
