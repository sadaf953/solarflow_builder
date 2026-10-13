import { payload, fromRow, validate } from './model.js';

export const LIST_COLUMNS = 'id,quotation_no,owner_id,owner_name_snapshot,customer_name,customer_phone,quotation_date,capacity_kw,starting_price,status,source_lead_id,converted_lead_id,issued_at,created_at,updated_at';
export const PAGE_SIZE = 20;
// PostgreSQL jsonb reorders object keys; compare canonical values, not wire key order.
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k,canonical(value[k])])) : value;
const same = (a,b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const fail = error => { if (error) throw error; };
export const conflict = () => new Error('This quotation changed in another session. Reopen it to review the latest version. Your local recovery copy is retained.');
const event = (type, user, extra = {}) => ({ type, actor_id: user.id, at: new Date().toISOString(), ...extra });
const activityData = (row, entry) => ({ ...row.quotation_data, activity: [...(row.quotation_data?.activity || []), entry] });
export function createQuotationRepository(client) {
    const get = async id => {
        const { data, error } = await client.from('quotations').select('*').eq('id',id).single();
        fail(error); return data;
    };
    const update = async (row, changes) => {
        const { data, error } = await client.from('quotations').update(changes).eq('id',row.id).eq('updated_at',row.updated_at).select('*').maybeSingle();
        fail(error); if (!data) throw conflict(); return data;
    };
    return {
        get, update,
        async list({ search = '', status = 'all', page = 0 }) {
            let query = client.from('quotations').select(LIST_COLUMNS,{count:'exact'}).order('created_at',{ascending:false}).order('id',{ascending:false});
            if (status !== 'all') query = query.eq('status',status);
            // Never interpolate PostgREST filter punctuation or wildcards supplied by users.
            const term = search.replace(/[^\p{L}\p{N}\s+-]/gu,'').trim().slice(0,100);
            if (term) {
                const number = term.replace(/^quote-?/i,'').trim();
                const numberFilter = /^\d{1,15}$/.test(number) ? `,quotation_no.eq.${number}` : '';
                query = query.or(`customer_name.ilike.%${term}%,customer_phone.ilike.%${term}%${numberFilter}`);
            }
            const { data,error,count } = await query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
            fail(error); return { rows:data, count };
        },
        // Deferred lead integration: these helpers have no active UI entry point while
        // LEAD_INTEGRATION_ENABLED is false in QuotationModule.
        async leads(search, page = 0) {
            let query = client.from('admin').select('id,customer_name,phone_number,email_address,full_address,villages,sub_divisions,district,pincode,system_capacity_kwp,module_brand,no_of_modules,module_wp,stage').is('deleted_at',null).not('customer_name','is',null).neq('customer_name','').neq('customer_name','.').order('created_at',{ascending:false}).order('id',{ascending:false});
            const term = search.replace(/[^\p{L}\p{N}\s+-]/gu,'').trim().slice(0,100);
            if (term) query = query.or(`customer_name.ilike.%${term}%,phone_number.ilike.%${term}%`);
            const { data,error } = await query.range(page * PAGE_SIZE,(page + 1) * PAGE_SIZE - 1); fail(error); return data;
        },
        async save(id, previous, form, template, user) {
            const body = payload(form,template);
            body.quotation_data = { ...previous?.quotation_data, ...body.quotation_data };
            if (!previous) {
                body.quotation_data.activity = [event('created',user)];
                const { data,error } = await client.from('quotations').insert({ ...body,id,owner_id:user.id }).select('*').single();
                if (error?.code !== '23505') { fail(error); return data; }
                const existing = await get(id);
                if (same(existing.quotation_data.form,body.quotation_data.form)) return existing;
                throw conflict();
            }
            if (previous.issued_at && !same(previous.quotation_data.form,body.quotation_data.form)) {
                body.quotation_data.activity = [...(previous.quotation_data.activity || []),event('edited_after_issue',user)];
            }
            try { return await update(previous,body); }
            catch (error) {
                // A request can commit and then lose its response. Recognize a successful retry.
                const latest = await get(id);
                if (same(latest.quotation_data.form,body.quotation_data.form)) return latest;
                throw error;
            }
        },
        async generated(row, user) {
            const errors = validate(fromRow(row));
            if (errors.length) throw new Error(errors.join('\n'));
            const document = row.quotation_data;
            const entry = event(row.issued_at ? 'pdf_generated' : 'issued',user);
            const changes = { quotation_data: activityData(row,entry) };
            // Preserve a complete copy of each generated version, independent of later edits/templates.
            const revisions = document.issued_versions || [];
            const last = revisions.at(-1);
            if (!last || !same(last.form,document.form)) {
                changes.quotation_data.issued_versions = [...revisions,{ at:entry.at,actor_id:user.id,form:document.form,template:document.template,quotation_no:row.quotation_no }];
            }
            if (!row.issued_at) changes.issued_at = entry.at;
            if (row.status === 'draft') changes.status = 'issued';
            return update(row,changes);
        },
        async outcome(row, type, user, reason = '', remark = '') {
            if (row.converted_lead_id || row.status === 'converted') throw new Error('A converted quotation cannot be marked lost or reopened.');
            if (type === 'lost' && !reason.trim()) throw new Error('A lost reason is required.');
            const now = new Date().toISOString();
            return update(row,{ status:type === 'lost' ? 'lost' : row.issued_at ? 'issued' : 'draft',
                lost_at:type === 'lost' ? now : null, lost_reason:type === 'lost' ? reason.trim() : null,
                lost_remark:type === 'lost' ? remark.trim() : null,
                quotation_data:activityData(row,event(type,user,{ reason,remark })) });
        },
        async lead(id) {
            const { data,error } = await client.from('admin').select('*').eq('id',id).is('deleted_at',null).single(); fail(error); return data;
        },
        async link(row, leadId, user) {
            const fresh = await get(row.id);
            if (fresh.converted_lead_id) {
                if (fresh.converted_lead_id !== leadId) throw conflict();
                return fresh;
            }
            return update(fresh,{ status:'converted',converted_lead_id:leadId,converted_at:new Date().toISOString(),
                quotation_data:activityData(fresh,event('converted',user,{ lead_id:leadId })) });
        },
        // A stable lead UUID makes retries idempotent, including two devices converting together.
        async insertConversionLead(row, insertData, user) {
            const fresh = await get(row.id);
            if (fresh.status === 'lost') throw new Error('Reopen this lost quotation before converting it.');
            let leadId = fresh.converted_lead_id || fresh.id;
            let lead;
            if (!fresh.converted_lead_id) {
                const result = await client.from('admin').insert({ ...insertData,id:leadId }).select('*').single();
                if (result.error?.code !== '23505') fail(result.error);
                lead = result.data;
            }
            if (!lead) {
                const result = await client.from('admin').select('*').eq('id',leadId).is('deleted_at',null).single();
                fail(result.error); lead = result.data;
            }
            await this.link(fresh,leadId,user);
            return { data:lead,error:null };
        },
    };
}
