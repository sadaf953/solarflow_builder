// Small pure helpers shared by the setup wizard and the admin pages.

import { emptySubmission, availableBuiltinStages, defaultStageList } from '../catalog/submission.js';
import { questionById } from '../catalog/questions.js';
import { FEATURE_REGISTRY } from '../../../template/src/config/catalog/features.js';
import { BUILTIN_STAGES } from '../../../template/src/config/catalog/stages.js';
import { downloadBlob } from '../../../template/src/lib/download.js';

// Only switchable features are ever shown; removed and unbuilt ones never are.
export const AVAILABLE_FEATURES = Object.keys(FEATURE_REGISTRY).filter(id => FEATURE_REGISTRY[id].status === 'available');
const CORE = Object.values(FEATURE_REGISTRY).filter(feature => feature.status === 'core');

/** `answersToFeatures` / `submissionFeatures` result -> what each column lists. */
export function featureLists({ features, reasons, discuss = [], unanswered = [] }) {
    return {
        on: AVAILABLE_FEATURES.filter(id => features[id]).map(id => ({ id, label: FEATURE_REGISTRY[id].label, reason: reasons[id] })),
        off: AVAILABLE_FEATURES.filter(id => !features[id]).map(id => ({ id, label: FEATURE_REGISTRY[id].label, description: FEATURE_REGISTRY[id].description })),
        discuss: [
            ...discuss.map(id => ({ id, text: questionById(id)?.question || id, note: 'Answered “Not sure”.' })),
            ...unanswered.map(id => ({ id, text: questionById(id)?.question || id, note: 'Not answered yet.' })),
        ],
        core: CORE.filter(feature => (feature.dependsOn || []).every(dep => features[dep])).map(feature => feature.label),
    };
}

export const summaryLine = lists => `You'll get ${lists.on.length} feature${lists.on.length === 1 ? '' : 's'} · ${lists.discuss.length} to discuss`;

export const BUILTIN_BY_ID = Object.fromEntries(BUILTIN_STAGES.map(stage => [stage.id, stage]));
export const isPinned = id => Boolean(BUILTIN_BY_ID[id]?.pin);

const isObject = value => value && typeof value === 'object' && !Array.isArray(value);

// A stored payload with every key the forms expect, whatever version saved it.
export function normalizeSubmission(raw, prefill) {
    const base = emptySubmission(prefill);
    if (!isObject(raw)) return base;
    return {
        ...base,
        ...raw,
        contact: { ...base.contact, ...(isObject(raw.contact) ? raw.contact : {}) },
        answers: isObject(raw.answers) ? { ...raw.answers } : {},
        featureOverrides: isObject(raw.featureOverrides) ? { ...raw.featureOverrides } : {},
        workflow: { ...base.workflow, ...(isObject(raw.workflow) ? raw.workflow : {}) },
    };
}

// The stage list the client is working with right now, in order. Built-in
// stages whose feature is off are left out (the app would drop them anyway).
export function currentStages(workflow, features) {
    if (workflow?.stagesMode !== 'custom' || !workflow.stages?.length) return defaultStageList(features);
    const available = new Set(availableBuiltinStages(features).map(stage => stage.id));
    return workflow.stages.filter(stage => stage.custom || available.has(stage.id));
}

export const stageName = stage => String(stage?.label || '').trim() || BUILTIN_BY_ID[stage?.id]?.label || stage?.id || '';

export const isEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

export function downloadJson(data, fileName) {
    downloadBlob(`${JSON.stringify(data, null, 2)}\n`, 'application/json', fileName);
}

// localStorage that never throws (private windows, blocked storage).
export const storage = {
    get(key) {
        try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
    },
    set(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
    },
    remove(key) {
        try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
    },
};
