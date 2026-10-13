import test from 'node:test';
import assert from 'node:assert/strict';
import {createEmailWorker, emailMessage, ENQUIRY_RECIPIENT} from '../../supabase/functions/send-enquiry-email/worker.mjs';
const job={id:'job-id',enquiry_id:'contact-id',kind:'new',snapshot:{name:'Fictional QA',mobile_number:'0000000851',selected_interest:'Tools only — no CRM'}};
const request=token=>new Request('https://worker.example.invalid',{method:'POST',headers:{'x-enquiry-worker-token':token}});
const options={token:'private-worker-token',apiKey:'test-key',senderEmail:'sender@example.invalid'};

test('notification contains contact and selected interest, and recipient is fixed',()=>{
 const mail=emailMessage({...job,snapshot:{...job.snapshot,to:'attacker@example.invalid'}},options.senderEmail);
 assert.equal(mail.to[0].email,'enquiry@deeprootsystems.in'); assert.equal(ENQUIRY_RECIPIENT,mail.to[0].email);
 assert.match(mail.textContent,/0000000851/); assert.match(mail.textContent,/Tools only/);
 assert.equal(mail.headers.idempotencyKey,job.id);
 assert.doesNotMatch(emailMessage({...job,snapshot:{...job.snapshot,company_name:'PRIVATE COMPANY',notes:'PRIVATE NOTES'}},options.senderEmail).textContent,/PRIVATE/);
 assert.doesNotMatch(emailMessage({...job,snapshot:{...job.snapshot,name:'Name\r\nBcc: other'}},options.senderEmail).subject,/[\r\n]/);
 assert.equal(emailMessage({...job,id:'b699afe3-bac4-4ec8-80bd-dc14715058df'},options.senderEmail).headers.idempotencyKey.length,36);
});

test('completed enquiry email includes the optional answers and preferred call time',()=>{
 const completed=emailMessage({...job,kind:'details',snapshot:{...job.snapshot,company_name:'Fictional Solar',notes:'Website: Yes\nEmployees: 4–9\nInterested in: DISCOM submission document maker\nPreferred call time (Asia/Kolkata): 14:30'}},options.senderEmail);
 assert.match(completed.subject,/Completed SolarFlow enquiry/);
 assert.match(completed.textContent,/Company: Fictional Solar/);
 assert.match(completed.textContent,/DISCOM submission document maker/);
 assert.match(completed.textContent,/14:30/);
 assert.equal(completed.to[0].email,ENQUIRY_RECIPIENT);
});

test('unauthorized requests and missing credentials never claim contact data or send mail',async()=>{
 const storage={claim(){assert.fail('must not claim');}};
 const fetchImpl=()=>assert.fail('must not send');
 const handler=createEmailWorker({...options,storage,fetchImpl});
 assert.equal((await handler(request('wrong-token'))).status,401);
 assert.equal((await handler(new Request('https://worker.example.invalid'))).status,405);
 const notConfigured=createEmailWorker({...options,apiKey:'',storage,fetchImpl});
 assert.equal((await notConfigured(request(options.token))).status,503);
});

test('successful provider acknowledgement marks the queued message sent',async()=>{
 let claimed=false,sent=0;
 const storage={claim:async()=>claimed?null:(claimed=true,job),sent:async(id,providerId)=>{sent++;assert.equal(id,job.id);assert.equal(providerId,'provider-id');},retry:async()=>assert.fail('must not retry')};
 const handler=createEmailWorker({...options,storage,fetchImpl:async(url,init)=>{
  assert.equal(url,'https://api.brevo.com/v3/smtp/email');
  assert.equal(JSON.parse(init.body).to[0].email,ENQUIRY_RECIPIENT);
  return Response.json({messageId:'provider-id'},{status:201});
 }});
 assert.equal((await handler(request(options.token))).status,200);assert.equal(sent,1);
});

test('failed or unacknowledged delivery is queued for retry, never marked sent',async()=>{
 for(const response of [()=>Response.json({code:'unauthorized'},{status:401}),()=>Response.json({},{status:201}),()=>{throw new Error('timeout');}]) {
  let claimed=false,retries=0;
  const storage={claim:async()=>claimed?null:(claimed=true,job),sent:async()=>assert.fail('must not report sent'),retry:async id=>{assert.equal(id,job.id);retries++;}};
  const handler=createEmailWorker({...options,storage,fetchImpl:async()=>response()});
  assert.equal((await handler(request(options.token))).status,502);assert.equal(retries,1);
 }
});

test('a provider idempotency acknowledgement is not sent twice',async()=>{
 let claimed=false;
 const storage={claim:async()=>claimed?null:(claimed=true,job),sent:async(id,providerId)=>assert.equal(providerId,'idempotency_acknowledged'),retry:async()=>assert.fail('must not retry')};
 const handler=createEmailWorker({...options,storage,fetchImpl:async()=>Response.json({code:'duplicate_parameter',message:'Email for the idempotency key has already been processed'},{status:400})});
 assert.equal((await handler(request(options.token))).status,200);
});
