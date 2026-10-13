const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validate(kind, id, code) {
  if (!['prepared', 'enquiry'].includes(kind) || !UUID.test(id || '') || !/^\d{4}$/.test(code || '')) {
    throw new Error('This form link or access code is invalid.');
  }
}

export async function readClientFormDraft(client, kind, id, code) {
  validate(kind, id, code);
  const {data, error} = await client.rpc('read_client_form_draft', {p_kind:kind, p_id:id, p_code:code});
  if (error) throw error;
  return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
}

export async function saveClientFormDraft(client, kind, id, code, answers) {
  validate(kind, id, code);
  const {data, error} = await client.rpc('save_client_form_draft', {
    p_kind:kind, p_id:id, p_code:code, p_answers:answers
  });
  if (error) throw error;
  if (!data) throw new Error('Your changes were not confirmed as saved.');
  return data;
}
