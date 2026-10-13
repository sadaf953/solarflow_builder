import { INTEREST_OPTIONS, SOFTWARE_OPTIONS, verifyPreparationPin } from './brief.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHONE = /^\d{10}$/;

export function submittedEnquiryLink(baseUrl, id) {
  if (!UUID.test(id)) throw new Error('Invalid submitted enquiry reference.');
  return `${baseUrl.replace(/\/$/, '')}/#/quote?enquiry=${id}`;
}

export function readSubmittedEnquiryId(hash) {
  const id = new URLSearchParams(hash.split('?')[1] || '').get('enquiry');
  return id && UUID.test(id) ? id : null;
}

async function ensureSession(client) {
  const {data, error} = await client.auth.getSession();
  if (error) throw error;
  if (!data?.session) {
    const {error: signInError} = await client.auth.signInAnonymously();
    if (signInError) throw signInError;
  }
}

export async function listAdminEnquiries(client, pin) {
  if (!await verifyPreparationPin(client, pin)) throw new Error('Incorrect preparation code.');
  const {data, error} = await client.rpc('admin_enquiry_catalog', {p_pin:pin});
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Forms could not be loaded.');
  return data.filter(item => item && ['prepared', 'enquiry'].includes(item.kind)
    && UUID.test(item.id) && (item.kind === 'prepared' || typeof item.name === 'string'))
    .map(item => item.kind === 'prepared' ? {
      ...item,
      name:item.name || 'Older prepared form',
      mobile:PHONE.test(item.mobile) ? item.mobile : '',
      company:item.company || ''
    } : item);
}

export async function openSubmittedEnquiry(client, id, phoneCode) {
  if (!UUID.test(id)) throw new Error('This enquiry link is invalid.');
  if (!/^\d{4}$/.test(phoneCode)) throw new Error('Enter your four-digit access code.');
  await ensureSession(client);
  const {data, error} = await client.rpc('open_submitted_enquiry', {p_id:id, p_phone_code:phoneCode});
  if (error) throw error;
  if (!data || data.id !== id || !PHONE.test(data.mobile))
    throw new Error('That code did not open this enquiry. Check the access code sent with your link.');
  return data;
}

const NOTE_FIELDS = {
  'Selected option':'selectedInterest', 'Preferred call date':'callDate',
  'Preferred call time (Asia/Kolkata)':'callTime', 'Website':'hasWebsite',
  'Employees':'teamSize', 'Total customers':'customerCount',
  'Live customers':'liveCustomerCount', 'Other software':'otherSoftware',
  'Existing data':'dataStart', 'Branches':'branches',
  'Channel partner offices':'partnerOffices', 'Channel partners':'channelPartners',
  'Third-party or multiple installation teams':'installationTeams',
  'Stamp staff login':'stampStaffLogin', 'Technician logins':'technicianLogin',
  'Preferred storage provider':'storageProvider', 'Custom request':'remarks'
};

export function parseSubmittedEnquiryNotes(notes = '') {
  const fields = {interests:[], software:[], extraLines:[]};
  for (const line of String(notes).split('\n')) {
    if (!line.trim()) continue;
    const colon = line.indexOf(': ');
    if (colon < 0) { fields.extraLines.push(line); continue; }
    const label = line.slice(0, colon), value = line.slice(colon + 2);
    if (label === 'Interested in') {
      fields.interests = value.split(', ').filter(item => INTEREST_OPTIONS.includes(item));
    } else if (label === 'Current software') {
      fields.software = value.split(', ').filter(item => SOFTWARE_OPTIONS.includes(item));
    } else if (label === 'File storage') {
      fields.fileStorage = value.startsWith('Yes') ? 'Yes' : value.startsWith('No') ? 'No' : '';
    } else if (NOTE_FIELDS[label]) {
      fields[NOTE_FIELDS[label]] = value;
    } else {
      fields.extraLines.push(line);
    }
  }
  return fields;
}

export async function findSubmittedEnquiries(client, phoneSuffix) {
  if (!/^\d{4}$/.test(phoneSuffix)) throw new Error('Enter the four-digit client code.');
  const {data, error} = await client.rpc('find_submitted_enquiries', {p_phone_suffix:phoneSuffix});
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Submitted enquiries could not be loaded.');
  return data.filter(item => item && UUID.test(item.id) && typeof item.name === 'string'
    && typeof item.mobile === 'string' && item.access_code === phoneSuffix)
    .map(item => ({...item, kind:'enquiry'}));
}

export async function updateSubmittedEnquiry(client, enquiry, payload, extraLines = []) {
  if (!UUID.test(enquiry?.id) || !/^\d{4}$/.test(enquiry?.suffix)) throw new Error('This saved enquiry cannot be updated.');
  const notes = [payload.notes, ...extraLines].filter(Boolean).join('\n');
  const {data, error} = await client.rpc('finalize_client_enquiry', {
    p_id:enquiry.id, p_code:enquiry.suffix,
    p_name:payload.name, p_mobile:payload.mobile_number,
    p_company:payload.company_name, p_version:payload.version_type, p_notes:notes
  });
  if (error) throw error;
  if (data !== enquiry.id) throw new Error('The enquiry update was not confirmed.');
}
