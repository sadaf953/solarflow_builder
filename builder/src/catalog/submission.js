// What a client submits, and how it becomes their client.config.js.
//
// The two setup forms write one payload (stored as jsonb by the builder
// backend). The admin page and scripts/make-client.mjs turn it into a client
// config with submissionToClientConfig().

import { answersToFeatures } from './questions.js';
import { FEATURE_REGISTRY } from '../../../template/src/config/catalog/features.js';
import { BUILTIN_STAGES } from '../../../template/src/config/catalog/stages.js';
import { DROPDOWN_CATALOG } from '../../../template/src/config/catalog/dropdowns.js';
import { defaultClientConfig, slugify, CONFIG_SCHEMA_VERSION } from '../../../template/src/config/resolve.js';

export const SUBMISSION_SCHEMA_VERSION = 1;

export function emptySubmission(prefill = {}) {
    return {
        schemaVersion: SUBMISSION_SCHEMA_VERSION,
        contact: { company: '', name: '', phone: '', email: '', city: '', state: '', ...(prefill.contact || {}) },
        answers: { ...(prefill.answers || {}) },
        featureOverrides: {},
        workflow: {
            source: 'form',            // 'form' | 'sheet'
            sheetUrl: '',
            sheetNote: '',
            stagesMode: 'default',     // 'default' | 'custom'
            stages: [],                // ordered [{id,label,custom?,group?}] when custom
            dropdowns: {},             // category -> list (only lists the client changed)
            customFields: [],          // [{key,label,type,stage,options?,required?,showInAddLead?}]
        },
        notes: '',
    };
}

const BUILTIN_BY_ID = Object.fromEntries(BUILTIN_STAGES.map(stage => [stage.id, stage]));

// Stages a feature needs, so the workflow form can lock them on.
export function stageLocks(features) {
    const locks = {};
    for (const [id, feature] of Object.entries(FEATURE_REGISTRY)) {
        if (!features[id]) continue;
        for (const stageId of feature.requiresStages || []) locks[stageId] ||= `Needed for ${feature.label}`;
    }
    return locks;
}

// Built-in stages that exist for these features (LOAN only with loan tracking, ...).
export function availableBuiltinStages(features) {
    return BUILTIN_STAGES.filter(stage => !stage.requiresFeature || features[stage.requiresFeature]);
}

// The starting point of the stage editor: every available built-in stage.
export function defaultStageList(features) {
    return availableBuiltinStages(features).map(stage => ({ id: stage.id, label: stage.label, group: stage.group }));
}

// Feature map the client ends up with: answers, then the client's own
// review-step switches, then the admin's switches.
export function submissionFeatures(submission, adminOverrides = {}) {
    const { features, reasons, discuss, unanswered } = answersToFeatures(submission.answers, submission.featureOverrides);
    for (const [id, value] of Object.entries(adminOverrides || {})) {
        if (FEATURE_REGISTRY[id]?.status === 'available' && typeof value === 'boolean') {
            features[id] = value;
            reasons[id] = value ? 'Switched on by SolarFlow admin.' : 'Switched off by SolarFlow admin.';
        }
    }
    return { features, reasons, discuss, unanswered };
}

// Company details the admin adds for documents (address, bank, logo, ...).
// Only known branding keys with text are kept; a blank keeps what the
// submission gave.
export function brandingOverrides(branding) {
    const known = new Set(Object.keys(defaultClientConfig().branding));
    if (!branding || typeof branding !== 'object') return {};
    return Object.fromEntries(Object.entries(branding)
        .filter(([key, value]) => known.has(key) && typeof value === 'string' && value.trim())
        .map(([key, value]) => [key, value.trim()]));
}

// A typed country code: +91, 0091, or 91 followed by a space or dash.
const COUNTRY_CODE = /^(?:\+\s*91|0091|91(?=[\s-]))/;

// A mobile number as typed (+91 98765 43210, 098765 43210, ...) as its 10
// digits. The country code is removed before the digits are counted, so
// "+91 98765 432" stays invalid. Anything else is kept as typed, so a
// half-typed number is never turned into a wrong one.
export function normalizePhone(value) {
    const text = String(value ?? '').trim();
    const withCode = COUNTRY_CODE.test(text);
    let digits = text.replace(COUNTRY_CODE, '').replace(/\D/g, '');
    if (!withCode && digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
    if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
    return digits.length === 10 ? digits : text;
}

const ORDER = Object.fromEntries(BUILTIN_STAGES.map((stage, index) => [stage.id, index]));

// A custom stage list with the built-in stages the features need put back at
// their usual place (after the last built-in stage that normally comes
// before them). `added` lists them with the reason, for the client and admin.
export function restoreLockedStages(stages, features) {
    const locks = stageLocks(features);
    const list = [...stages];
    const added = [];
    for (const stage of BUILTIN_STAGES) {
        if (!locks[stage.id] || list.some(item => item.id === stage.id)) continue;
        let at = 0;
        list.forEach((item, index) => { if (ORDER[item.id] < ORDER[stage.id]) at = index + 1; });
        list.splice(at, 0, { id: stage.id, label: stage.label, group: stage.group });
        added.push({ id: stage.id, label: stage.label, reason: locks[stage.id] });
    }
    return { stages: list, added };
}

const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

// The workflow the app is built from: the admin's, when they set one up on
// the client page (for example from the client's sheet), else the client's.
export function effectiveWorkflow(submission, adminWorkflow) {
    return isObject(adminWorkflow) ? { ...adminWorkflow, source: 'form' } : submission?.workflow || {};
}

// Stages of a workflow before locked stages are put back.
function workflowStages(workflow, features) {
    const custom = workflow.source === 'form' && workflow.stagesMode === 'custom' && Array.isArray(workflow.stages) && workflow.stages.length;
    if (!custom) return null;
    return workflow.stages.map(stage => (BUILTIN_BY_ID[stage.id]
        ? { id: stage.id, label: stage.label || BUILTIN_BY_ID[stage.id].label, group: stage.group || BUILTIN_BY_ID[stage.id].group }
        : { id: stage.id, label: stage.label, group: stage.group || 'materials', custom: true, ...(stage.icon ? { icon: stage.icon } : {}) }));
}

// Built-in stages put back because the final features need them (an empty
// list when the standard stages are used).
export function restoredStages(submission, { adminOverrides = {}, workflow } = {}) {
    const { features } = submissionFeatures(submission, adminOverrides);
    const stages = workflowStages(effectiveWorkflow(submission, workflow), features);
    return stages ? restoreLockedStages(stages, features).added : [];
}

export function submissionToClientConfig(submission, { adminOverrides = {}, slug, ownerEmail, branding, workflow: adminWorkflow } = {}) {
    const base = defaultClientConfig();
    const contact = submission.contact || {};
    const company = String(contact.company || '').trim() || 'SolarFlow Client';
    const { features } = submissionFeatures(submission, adminOverrides);
    const clientWorkflow = submission.workflow || {};
    const workflow = effectiveWorkflow(submission, adminWorkflow);

    const custom = workflowStages(workflow, features);
    const stages = custom ? restoreLockedStages(custom, features).stages : defaultStageList(features);

    const dropdowns = { ...base.dropdowns };
    for (const [id, list] of Object.entries(workflow.dropdowns || {})) {
        if (DROPDOWN_CATALOG[id] && Array.isArray(list)) dropdowns[id] = list;
    }

    const state = String(contact.state || '').trim() || base.branding.state;
    return {
        schemaVersion: CONFIG_SCHEMA_VERSION,
        client: { name: company, slug: slug || slugify(company), ownerEmail: String(ownerEmail ?? contact.email ?? '').trim() },
        branding: {
            ...base.branding,
            appName: company,
            companyName: company,
            phone: normalizePhone(contact.phone),
            email: String(contact.email || '').trim(),
            state,
            // GEB / GEDA are Gujarat's; elsewhere quotations print "<DISCOM> registration".
            chargesLabel: /gujarat/i.test(state) ? base.branding.chargesLabel : '',
            ...brandingOverrides(branding),
        },
        features,
        pipeline: { groups: base.pipeline.groups, stages },
        dropdowns,
        customFields: workflow.source === 'form' && Array.isArray(workflow.customFields) ? workflow.customFields : [],
        workflowSource: {
            type: clientWorkflow.source === 'sheet' ? 'sheet' : 'form',
            sheetUrl: clientWorkflow.source === 'sheet' ? String(clientWorkflow.sheetUrl || '').trim() : '',
            note: String(clientWorkflow.sheetNote || '').trim(),
        },
    };
}
