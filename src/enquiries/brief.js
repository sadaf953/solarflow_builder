export const DOCUMENT_OPTIONS = [
  'Quotation maker', 'Bill / invoice maker', 'BOM maker', 'Delivery challan maker',
  'Gate pass maker', 'DISCOM submission document maker', 'Delivery truck tally checklist',
  'Feasibility document maker'
];
export const CORE_DOCUMENT_OPTIONS = ['Feasibility document maker', 'DISCOM submission document maker', 'Quotation maker', 'BOM maker'];
export const OPTIONAL_DOCUMENT_OPTIONS = DOCUMENT_OPTIONS.filter(option => !CORE_DOCUMENT_OPTIONS.includes(option));
export const STORAGE_PROVIDER_OPTIONS = ['Google personal account', 'Google Workspace business account', 'Supabase Storage'];
export const SOFTWARE_OPTIONS = ['Tally', 'Google Sheets', 'Microsoft Excel', 'Zoho', 'Odoo', 'Other third-party software'];
export const TEAM_SIZE_OPTIONS = ['1–3', '4–9', '10–29', '30–49', '50+', 'Not sure'];
export const YES_NO_OPTIONS = ['Yes', 'No', 'Not sure'];
export const DATA_START_OPTIONS = ['Transfer existing data', 'Start fresh', 'Not sure'];
export const INTEREST_OPTIONS = [
  'Option 1: Small team setup', 'Option 2: Detailed operations', 'A mix of both options', 'Tools only — no CRM',
  'Customer tracking', ...DOCUMENT_OPTIONS, 'Inventory', 'Warranty tracking',
  'Vendor login', 'Stamp staff login', 'Technician login', 'Dealers',
  'Channel partner offices (CPOs)', 'Branches', 'Staff management',
  'Installation view', 'Installation commission view', 'Vendor commission page',
  'Channel partner commission view', 'Operations page', 'Dealer-based filtering',
  'Finance', 'Attendance', 'Calendar', 'MIS upload auto updater', 'Checklists', 'Document uploads'
];

const SINGLE_FIELDS = ['hasWebsite', 'teamSize', 'customerCount', 'liveCustomerCount', 'dataStart', 'branches', 'partnerOffices', 'channelPartners', 'installationTeams', 'stampStaffLogin', 'technicianLogin', 'fileStorage', 'storageProvider'];
const CHOICES = {hasWebsite:YES_NO_OPTIONS, teamSize:TEAM_SIZE_OPTIONS, branches:YES_NO_OPTIONS,
  dataStart:DATA_START_OPTIONS,
  partnerOffices:YES_NO_OPTIONS, channelPartners:YES_NO_OPTIONS, installationTeams:YES_NO_OPTIONS,
  stampStaffLogin:YES_NO_OPTIONS, technicianLogin:YES_NO_OPTIONS, fileStorage:['Yes', 'No'], storageProvider:STORAGE_PROVIDER_OPTIONS};

export function createPreparedBrief(draft) {
  const prepared = {};
  for (const [key, limit] of [['name', 200], ['company', 300]]) {
    const value = String(draft[key] || '').trim().replace(/[\r\n]+/g, ' ').slice(0, limit).trim();
    if (value) prepared[key] = value;
  }
  const mobile = String(draft.mobile || '').trim().replace(/[\s()-]/g, '').replace(/^\+91/, '');
  if (/^\d{10}$/.test(mobile)) prepared.mobile = mobile;
  for (const key of SINGLE_FIELDS) {
    const value = String(draft[key] || '').trim();
    if (!value) continue;
    if (CHOICES[key] ? CHOICES[key].includes(value) : /^\d{1,8}$/.test(value)) prepared[key] = value;
  }
  for (const [key, allowed] of [['software', SOFTWARE_OPTIONS], ['interests', INTEREST_OPTIONS]]) {
    const values = [...new Set((Array.isArray(draft[key]) ? draft[key] : []).filter(value => allowed.includes(value)))];
    if (values.length) prepared[key] = values;
  }
  if (prepared.fileStorage !== 'Yes') delete prepared.storageProvider;
  if (prepared.software?.includes('Other third-party software')) {
    const otherSoftware = String(draft.otherSoftware || '').trim().replace(/[\r\n]+/g, ' ').slice(0, 200).trim();
    if (otherSoftware) prepared.otherSoftware = otherSoftware;
  }
  const customRequest = String(draft.customRequest || '').trim().slice(0, 2000).trim();
  if (customRequest) prepared.customRequest = customRequest;
  return prepared;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function preparedBriefLink(baseUrl, id) {
  if (!UUID.test(id)) throw new Error('Invalid prepared form reference.');
  return `${baseUrl.replace(/\/$/, '')}/#/quote?brief=${id}`;
}

export function readPreparedBriefId(hash) {
  const id = new URLSearchParams(hash.split('?')[1] || '').get('brief');
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

export async function verifyPreparationPin(client, pin) {
  if (!/^\d{4}$/.test(pin)) return false;
  await ensureSession(client);
  const {data, error} = await client.rpc('verify_preparation_pin', {p_pin:pin});
  if (error) throw error;
  return data === true;
}

export async function findOwnedPreparedBriefs(client, phoneSuffix) {
  if (!/^\d{4}$/.test(phoneSuffix)) throw new Error('Enter the four-digit client code.');
  await ensureSession(client);
  const {data, error} = await client.rpc('find_owned_prepared_briefs', {p_phone_suffix:phoneSuffix});
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Saved forms could not be loaded. Please try again.');
  return data.filter(item => item && UUID.test(item.id) && typeof item.name === 'string' && typeof item.company === 'string');
}

export async function createSavedBrief(client, draft, preparationPin) {
  const prepared = createPreparedBrief(draft);
  if (!prepared.name || !prepared.mobile || !prepared.company) throw new Error('Enter the client name, a valid 10-digit phone number, and company name.');
  if (!/^\d{4}$/.test(preparationPin || '')) throw new Error('Enter the 4-digit preparation code.');
  await ensureSession(client);
  const {data, error} = await client.rpc('create_prepared_brief', {p_answers:prepared, p_prepare_code:preparationPin});
  if (error) throw error;
  if (!data || !UUID.test(data.id) || !/^\d{4}$/.test(data.code)) throw new Error('The prepared form was not confirmed. Please try again.');
  return data;
}

export async function unlockSavedBrief(client, id, code) {
  if (!UUID.test(id)) throw new Error('This prepared form link is invalid.');
  await ensureSession(client);
  const {data, error} = await client.rpc('unlock_prepared_brief', {p_id:id, p_code:code});
  if (error) throw error;
  if (!data) throw new Error('This link did not open. Ask the sender to check the saved phone number and link. After several incorrect attempts, access pauses for 15 minutes.');
  const prepared = createPreparedBrief(data);
  if (!Object.keys(prepared).length) throw new Error('The prepared form has no usable answers.');
  return prepared;
}
