import test from 'node:test';
import assert from 'node:assert/strict';
import {listAdminEnquiries, openSubmittedEnquiry, parseSubmittedEnquiryNotes, readSubmittedEnquiryId, submittedEnquiryLink} from '../../src/enquiries/reopen.js';

const id = 'b391c08f-5c13-4b40-b73e-f1c7eec12205';

test('a submitted enquiry gets its own shareable client link', () => {
  const link = submittedEnquiryLink('https://example.com/', id);
  assert.equal(link, `https://example.com/#/quote?enquiry=${id}`);
  assert.equal(readSubmittedEnquiryId(new URL(link).hash), id);
  assert.equal(readSubmittedEnquiryId('#/quote?enquiry=bad'), null);
  assert.throws(() => submittedEnquiryLink('https://example.com', 'bad'));
});

test('the 0905 overview and client resume use separate database calls', async () => {
  const calls = [];
  const entry = {kind:'enquiry', id, name:'Client', mobile:'9000000683', company:'Solar', notes:''};
  const client = {auth:{getSession:async()=>({data:{session:{}}})}, rpc:async(name,args)=>{
    calls.push([name,args]);
    return {data:name==='verify_preparation_pin' ? args.p_pin==='0905'
      : name==='admin_enquiry_catalog' ? [entry] : entry, error:null};
  }};
  assert.deepEqual(await listAdminEnquiries(client,'0905'), [entry]);
  assert.deepEqual(await openSubmittedEnquiry(client,id,'0683'), entry);
  assert.deepEqual(calls.map(([name])=>name), ['verify_preparation_pin','admin_enquiry_catalog','open_submitted_enquiry']);
  await assert.rejects(listAdminEnquiries(client,'0000'),/Incorrect preparation code/);
  await assert.rejects(openSubmittedEnquiry(client,id,'9999'),/did not open/);
});

test('saved enquiry notes restore form selections and retain unfamiliar lines', () => {
  const fields = parseSubmittedEnquiryNotes([
    'Selected option: Option 1: Small team setup',
    'File storage: Yes',
    'Preferred storage provider: Google personal account',
    'Preferred call date: 2026-09-29',
    'Website: Yes',
    'Current software: Tally, Other third-party software',
    'Other software: Example ERP',
    'Interested in: Quotation maker, BOM maker',
    'Custom request: Need a call after lunch',
    'Legacy answer: keep this answer'
  ].join('\n'));
  assert.equal(fields.selectedInterest, 'Option 1: Small team setup');
  assert.equal(fields.fileStorage, 'Yes');
  assert.equal(fields.storageProvider, 'Google personal account');
  assert.equal(fields.callDate, '2026-09-29');
  assert.equal(fields.hasWebsite, 'Yes');
  assert.deepEqual(fields.software, ['Tally', 'Other third-party software']);
  assert.deepEqual(fields.interests, ['Quotation maker', 'BOM maker']);
  assert.equal(fields.otherSoftware, 'Example ERP');
  assert.equal(fields.remarks, 'Need a call after lunch');
  assert.deepEqual(fields.extraLines, ['Legacy answer: keep this answer']);
});
