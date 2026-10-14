// The client's extra fields in the portals. A partner, dealer or installer
// fills in the extra fields of the stages they work on, so a required field
// never leaves a customer stuck waiting for the office. Values are saved
// through merge_custom_fields; file fields stay with the office.

import { supabase } from '../../supabase';
import { customFieldsForStage } from '../../config/index.js';
import { formatFieldValue } from '../../lib/format.js';

const isBlank = value => value === undefined || value === null || value === '';

/** The extra fields of a stage a portal user can type into. */
export const portalCustomFields = stage => customFieldsForStage(stage).filter(field => field.type !== 'file');

/**
 * Changed values of a stage's extra fields, as merge_custom_fields takes them: null removes a value.
 * With `touched`, only fields the user edited count, so a value the office
 * changed after the portal opened the customer is never sent back stale.
 */
export function customFieldChanges(stage, draft, saved, touched) {
    const changes = {};
    for (const { key } of portalCustomFields(stage)) {
        if (touched && !touched.has(key)) continue;
        const next = draft?.[key];
        const before = saved?.[key];
        if (isBlank(next) && isBlank(before)) continue;
        if (JSON.stringify(next) !== JSON.stringify(before)) changes[key] = isBlank(next) ? null : next;
    }
    return changes;
}

/** `base` with `changes` applied, as the server stores it. */
export function withCustomFieldChanges(base, changes) {
    const merged = { ...(base && typeof base === 'object' ? base : {}) };
    Object.entries(changes || {}).forEach(([key, value]) => { if (value === null) delete merged[key]; else merged[key] = value; });
    return merged;
}

/** 'Label: old → new' lines for the activity log. */
export const customFieldChangeLines = (stage, changes, saved) => portalCustomFields(stage)
    .filter(field => field.key in changes)
    .map(field => `${field.label}: ${formatFieldValue(field, saved?.[field.key])} → ${formatFieldValue(field, changes[field.key])}`);

/** Saves `changes`; resolves to the customer's stored extra fields. */
export async function saveCustomFieldChanges(customerId, changes) {
    const { data, error } = await supabase.rpc('merge_custom_fields', { p_customer_id: customerId, p_values: changes });
    if (error) throw error;
    return data || {};
}
