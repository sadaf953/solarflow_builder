// The running app's view of client.config.js.
//
// Everything that varies per client is read from here: which features are
// on, the pipeline, extra fields, dropdown defaults and branding. Resolved
// once at startup; the results are frozen.

import { Clock, Banknote, CheckCircle2, AlertTriangle, Tag } from 'lucide-react';
import clientConfig from './client.config.js';
import { resolveClientConfig, REQUIREMENT_RULES, readPath } from './resolve.js';
import { ROLE_FEATURE, VIEW_FEATURE } from './catalog/features.js';
import { STAGE_IDS } from './catalog/stages.js';
import { stageIcon } from './icons.js';

const resolved = resolveClientConfig(clientConfig);

export { clientConfig, STAGE_IDS, readPath };
export const CLIENT = Object.freeze(resolved.client);
export const BRANDING = Object.freeze(resolved.branding);

// ── Features ─────────────────────────────────────────────────────────────
export const FEATURES = resolved.features;
export const FEATURE_REASONS = resolved.featureReasons;
export const isOn = id => FEATURES[id] === true;
// Views and roles that no feature owns are always available.
export const isViewOn = view => !VIEW_FEATURE[view] || isOn(VIEW_FEATURE[view]);
export const isRoleEnabled = userType => !ROLE_FEATURE[userType] || isOn(ROLE_FEATURE[userType]);
// 'both' shows the checklist/upload toggle; otherwise the one mode is forced.
export const documentMode = () => (isOn('documentUploads') && isOn('checklists') ? 'both' : isOn('documentUploads') ? 'files' : 'checklist');

// Payment types a customer can have. Cash is always offered (without cash
// tracking a cash customer simply skips the Loan stage). Loan is hidden only
// for a cash-only business: cash tracked, loans not.
export const paymentTypeOptions = () => (isOn('loanTracking') || !isOn('cashPayments') ? ['Loan', 'Cash'] : ['Cash']);

// ── Pipeline ─────────────────────────────────────────────────────────────
export const PRIMARY_STAGES = Object.freeze(resolved.stages.map(stage => Object.freeze({ ...stage, iconName: stage.icon, icon: stageIcon(stage.icon) })));
export const STAGE_BY_ID = Object.freeze(Object.fromEntries(PRIMARY_STAGES.map(stage => [stage.id, stage])));
export const STAGE_GROUPS = Object.freeze(resolved.groups.map(group => Object.freeze(group)));
export const STAGE_GUIDANCE = Object.freeze(Object.fromEntries(PRIMARY_STAGES.filter(stage => stage.guidance).map(stage => [stage.id, stage.guidance])));

export const isStageEnabled = id => Boolean(STAGE_BY_ID[id]);
export const stageLabel = id => STAGE_BY_ID[id]?.label || (id ? String(id).toLowerCase().replace(/\b\w/g, ch => ch.toUpperCase()) : '');

// LOAN is skipped for cash customers and CASH for loan customers.
export function isStageApplicable(stage, record) {
    const def = typeof stage === 'string' ? STAGE_BY_ID[stage] : stage;
    if (!def) return false;
    return !(def.hideWhenPaymentType || []).includes(String(record?.payment_type || '').trim().toLowerCase());
}

// The stage a customer moves to next, or null at the end of the pipeline.
// LOST PROJECT is never a "next" stage; COMPLETED is the last step.
export function getNextStageId(record) {
    const current = record?.stage;
    if (!current || current === STAGE_IDS.COMPLETED || current === STAGE_IDS.LOST_PROJECT) return null;
    const index = PRIMARY_STAGES.findIndex(stage => stage.id === current);
    if (index === -1) return null;
    for (const stage of PRIMARY_STAGES.slice(index + 1)) {
        if (stage.parking) continue;
        if (isStageApplicable(stage, record)) return stage.id;
    }
    return null;
}

// Stages a customer actually passes through, in order (for tabs and timelines).
export const applicableStages = record => PRIMARY_STAGES.filter(stage => !stage.parking && isStageApplicable(stage, record));

export const getStageRequirements = stageId => STAGE_BY_ID[stageId]?.requirements || [];

// Labels of the requirements a record does not meet for leaving `stageId`.
export function missingStageRequirements(stageId, data) {
    return getStageRequirements(stageId)
        .filter(([path, , rule = 'present']) => !(REQUIREMENT_RULES[rule] || REQUIREMENT_RULES.present)(readPath(data || {}, path)))
        .map(([, label]) => label);
}

// ── Extra fields ─────────────────────────────────────────────────────────
// Values live in admin.custom_fields[key].
export const CUSTOM_FIELDS = Object.freeze(resolved.customFields.map(field => Object.freeze(field)));
export const customFieldsForStage = stageId => CUSTOM_FIELDS.filter(field => field.stage === stageId);
export const addLeadCustomFields = () => CUSTOM_FIELDS.filter(field => field.showInAddLead);
export const customFieldValue = (record, key) => record?.custom_fields?.[key];

// ── Dropdowns ────────────────────────────────────────────────────────────
// Options come from the metadata table; the client's configured list is the
// fallback before the table has rows.
export const METADATA_DEFAULTS = Object.freeze(resolved.dropdowns.metadata);
export function dropdownOptions(category, meta) {
    const live = meta?.[category];
    return Array.isArray(live) && live.length ? live : (METADATA_DEFAULTS[category] || []);
}

const TAG_ICONS = {
    Inprocess: Clock, Returned: Clock, Sanctioned: CheckCircle2, Reject: AlertTriangle, Redeemed: Banknote,
    Approved: CheckCircle2, Received: CheckCircle2, '1st Payment': Banknote, '2nd Payment': Banknote,
    'Total Loan Payment Received': CheckCircle2,
};
const withIcons = tags => Object.freeze(tags.map(tag => Object.freeze({ ...tag, icon: TAG_ICONS[tag.id] || Tag })));

const HOLD_STYLES = {
    'Project Win': 'bg-emerald-600 text-white border-emerald-600 ring-2 ring-emerald-500 ring-offset-2 shadow-md shadow-emerald-600/25 font-bold scale-[1.02]',
    'Project Lost': 'bg-rose-600 text-white border-rose-600 ring-2 ring-rose-500 ring-offset-2 shadow-md shadow-rose-600/25 font-bold scale-[1.02]',
    'Project Return Win': 'bg-amber-500 text-white border-amber-500 ring-2 ring-amber-400 ring-offset-2 shadow-md shadow-amber-500/25 font-bold scale-[1.02]',
};
const HOLD_FALLBACK = 'bg-stone-800 text-white border-stone-800 ring-2 ring-stone-600 ring-offset-2 shadow-md font-bold scale-[1.02]';

export const LOAN_TAGS = withIcons(resolved.dropdowns.tags.loan_tags);
export const SUBSIDY_TAGS = withIcons(resolved.dropdowns.tags.subsidy_tags);
export const INSTALLATION_TAGS = Object.freeze(resolved.dropdowns.tags.installation_tags.map(tag => Object.freeze({ ...tag })));
export const HOLD_STATUS_TAGS = Object.freeze(resolved.dropdowns.tags.hold_status_tags.map(tag => Object.freeze({
    ...tag, activeClass: HOLD_STYLES[tag.id] || HOLD_FALLBACK, dotClass: 'bg-white shadow-xs',
})));
export const tagLabel = (tags, id) => tags.find(tag => tag.id === id)?.label || id || '';
