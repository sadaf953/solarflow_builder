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

export function submissionToClientConfig(submission, { adminOverrides = {}, slug, ownerEmail } = {}) {
    const base = defaultClientConfig();
    const contact = submission.contact || {};
    const company = String(contact.company || '').trim() || 'SolarFlow Client';
    const { features } = submissionFeatures(submission, adminOverrides);
    const workflow = submission.workflow || {};

    const custom = workflow.source === 'form' && workflow.stagesMode === 'custom' && Array.isArray(workflow.stages) && workflow.stages.length;
    const stages = custom
        ? workflow.stages.map(stage => (BUILTIN_BY_ID[stage.id]
            ? { id: stage.id, label: stage.label || BUILTIN_BY_ID[stage.id].label, group: stage.group || BUILTIN_BY_ID[stage.id].group }
            : { id: stage.id, label: stage.label, group: stage.group || 'materials', custom: true, ...(stage.icon ? { icon: stage.icon } : {}) }))
        : defaultStageList(features);

    const dropdowns = { ...base.dropdowns };
    for (const [id, list] of Object.entries(workflow.dropdowns || {})) {
        if (DROPDOWN_CATALOG[id] && Array.isArray(list)) dropdowns[id] = list;
    }

    return {
        schemaVersion: CONFIG_SCHEMA_VERSION,
        client: { name: company, slug: slug || slugify(company), ownerEmail: String(ownerEmail ?? contact.email ?? '').trim() },
        branding: {
            ...base.branding,
            appName: company,
            companyName: company,
            phone: String(contact.phone || '').trim(),
            email: String(contact.email || '').trim(),
            state: String(contact.state || '').trim() || base.branding.state,
        },
        features,
        pipeline: { groups: base.pipeline.groups, stages },
        dropdowns,
        customFields: workflow.source === 'form' && Array.isArray(workflow.customFields) ? workflow.customFields : [],
        workflowSource: {
            type: workflow.source === 'sheet' ? 'sheet' : 'form',
            sheetUrl: workflow.source === 'sheet' ? String(workflow.sheetUrl || '').trim() : '',
            note: String(workflow.sheetNote || '').trim(),
        },
    };
}
