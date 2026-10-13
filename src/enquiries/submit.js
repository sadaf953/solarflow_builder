export function enquiryPayload({name, company, mobile, modelType, storeFiles, storageProvider = '', remarks, callDate = '', callTime = '', interests = [], selectedInterest = '', businessDetails = {}}) {
 const phone = mobile.trim().replace(/[\s()-]/g, '').replace(/^\+91/, '');
 if (!/^\d{10}$/.test(phone)) throw new Error('Please enter a valid 10-digit mobile number.');
 const detailLines = [
  ['Website', businessDetails.hasWebsite], ['Employees', businessDetails.teamSize],
  ['Total customers', businessDetails.customerCount], ['Live customers', businessDetails.liveCustomerCount],
  ['Current software', businessDetails.software?.join(', ')],
  ['Other software', businessDetails.software?.includes('Other third-party software') ? businessDetails.otherSoftware?.trim().replace(/[\r\n]+/g, ' ').slice(0, 200) : ''],
  ['Existing data', businessDetails.dataStart],
  ['Branches', businessDetails.branches],
  ['Channel partner offices', businessDetails.partnerOffices], ['Channel partners', businessDetails.channelPartners],
  ['Third-party or multiple installation teams', businessDetails.installationTeams],
  ['Stamp staff login', businessDetails.stampStaffLogin], ['Technician logins', businessDetails.technicianLogin]
 ].filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`);
 return {
  name: name.trim() || 'Prospective Client', company_name: company.trim() || null,
  mobile_number: phone, version_type: modelType,
  notes: [selectedInterest && `Selected option: ${selectedInterest}`, `File storage: ${storeFiles === 'yes' ? 'Yes' : storeFiles === 'no' ? 'No — simple checklists' : 'Discuss on call'}`, storeFiles === 'yes' && storageProvider && `Preferred storage provider: ${storageProvider}`, callDate && `Preferred call date: ${callDate}`, callTime && `Preferred call time (Asia/Kolkata): ${callTime}`, ...detailLines, `Interested in: ${interests.length ? interests.join(', ') : 'Not specified — discuss on call'}`, remarks.trim() && `Custom request: ${remarks.trim()}`].filter(Boolean).join('\n'),
  status: 'new'
 };
}
export async function submitEnquiry(client, payload) {
 const result = await client.from('enquiries').insert([payload]);
 if (result?.error) throw result.error;
 if (!result || result.status < 200 || result.status >= 300 || !Number.isInteger(result.status)) {
  throw new Error('Save confirmation was not received.');
 }
}


// The identity stays stable across both steps and retries. No enquiry SELECT
// or general UPDATE permission is required by the public form.
export async function saveEnquiryStep(client, payload, identity, {contactOnly = false} = {}) {
 const {data: sessionData, error: sessionError} = await client.auth.getSession();
 if (sessionError) throw sessionError;
 if (!sessionData?.session) {
  const {error} = await client.auth.signInAnonymously();
  if (error) throw error;
 }
 const result = await client.rpc('save_enquiry_details', {
  p_id: identity.id, p_edit_token: identity.editToken,
  p_name: payload.name, p_mobile: payload.mobile_number,
  p_company: payload.company_name, p_version: payload.version_type, p_notes: payload.notes
 });
 const missingFunction = ['PGRST202', '42883'].includes(result?.error?.code);
 if (missingFunction && contactOnly) {
  // The existing insert-only database can still capture the quick enquiry.
  // Optional updates never create a second contact record.
  await submitEnquiry(client, {...payload, id:identity.id});
  return;
 }
 if (missingFunction) throw new Error('Your contact details are saved. Saving extra details is not available yet. You can skip this step and discuss them on the call.');
 if (result?.error) throw result.error;
 if (result?.data !== identity.id) throw new Error('Save confirmation was not received.');
}
