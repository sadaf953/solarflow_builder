// Pure functions that turn a client config into what the app runs on.
//
// No React, no icons, no imports from client.config.js: the builder website
// and the zip generator call these with a config of their own, and the
// runtime (config/index.js) calls them once with the shipped config.

import { FEATURE_REGISTRY } from './catalog/features.js';
import {
    BUILTIN_STAGES, BUILTIN_STAGE_IDS, STAGE_GROUP_DEFAULTS, RESERVED_STAGE_IDS, CUSTOM_STAGE_ID, STAGE_ICON_NAMES,
} from './catalog/stages.js';
import { DROPDOWN_CATALOG, METADATA_CATEGORIES, TAG_LISTS, CUSTOM_FIELD_TYPES, CUSTOM_FIELD_KEY } from './catalog/dropdowns.js';

export const CONFIG_SCHEMA_VERSION = 1;
export const LIMITS = Object.freeze({
    customStages: 20, customFields: 80, listItems: 100, label: 60, guidance: 300, option: 80,
});

const BUILTIN_BY_ID = Object.fromEntries(BUILTIN_STAGES.map(stage => [stage.id, stage]));
const text = value => (typeof value === 'string' ? value.trim() : '');
const lower = value => String(value ?? '').trim().toLowerCase();

// Line breaks (including U+2028 / U+2029) and other control characters. Names,
// labels and list items are one line of text; the validator rejects these.
const CONTROL_CHARS = /[\p{Cc}\u2028\u2029]/u;
export const hasControlChars = value => CONTROL_CHARS.test(text(value));

// ── Stage requirement rules ───────────────────────────────────────────────
// Requirements are data ([column, label, ruleName]) so the builder can show
// them; these are the rules they name.
const present = value => value != null && String(value).trim() !== '';
export const REQUIREMENT_RULES = Object.freeze({
    present,
    yes: value => ['yes', 'installed'].includes(lower(value)),
    positive: value => Number(String(value ?? '').replaceAll(',', '')) > 0,
    proceed: value => value === 'Proceed',
    paymentType: value => ['loan', 'cash'].includes(lower(value)),
    discomSubmitted: value => present(value?.submitted_by) && present(value?.date),
});

// A requirement column may be a dotted path such as custom_fields.site_survey_date.
export function readPath(record, path) {
    return String(path).split('.').reduce((value, key) => (value == null ? undefined : value[key]), record);
}

// Company details printed on quotations and feasibility reports, with the
// longest text each may have. All optional.
export const BRANDING_FIELDS = Object.freeze({
    address: { label: 'Address', max: 300 },
    gstin: { label: 'GSTIN', max: 15 },
    website: { label: 'Website', max: 200 },
    logoUrl: { label: 'Logo link', max: 500 },
    epcCode: { label: 'EPC code', max: 60 },
    bankAccountName: { label: 'Account name', max: 120 },
    bankAccountNumber: { label: 'Account number', max: 34 },
    bankName: { label: 'Bank name', max: 120 },
    bankBranch: { label: 'Branch', max: 120 },
    bankIfsc: { label: 'IFSC code', max: 11 },
});
export const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export function isHttpsUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && Boolean(url.hostname);
    } catch {
        return false;
    }
}

// What is wrong with the company details, by field; empty when nothing is.
export function brandingErrors(branding) {
    const source = branding && typeof branding === 'object' ? branding : {};
    const errors = {};
    for (const [key, value] of Object.entries(source)) {
        if (value != null && typeof value !== 'string') errors[key] = `${BRANDING_FIELDS[key]?.label || `Company detail "${key}"`} must be text.`;
    }
    for (const [key, { label, max }] of Object.entries(BRANDING_FIELDS)) {
        if (!errors[key] && text(source[key]).length > max) errors[key] = `${label} must be at most ${max} characters.`;
    }
    const logoUrl = text(source.logoUrl);
    if (!errors.logoUrl && logoUrl && !isHttpsUrl(logoUrl)) errors.logoUrl = 'The logo link must be a web address starting with https://.';
    const ifsc = text(source.bankIfsc);
    if (!errors.bankIfsc && ifsc && !IFSC_PATTERN.test(ifsc)) {
        errors.bankIfsc = 'The IFSC code must be 11 characters: 4 capital letters, a zero, then 6 letters or numbers (for example SBIN0001234).';
    }
    return errors;
}

// ── Defaults ──────────────────────────────────────────────────────────────
export function defaultClientConfig() {
    return {
        schemaVersion: CONFIG_SCHEMA_VERSION,
        client: { name: 'SolarFlow Client', slug: 'solarflow-client', ownerEmail: '' },
        branding: {
            appName: 'SolarFlow', companyName: 'SolarFlow Solar Energy', address: '', phone: '', email: '',
            gstin: '', state: 'Gujarat', discomName: 'DISCOM', chargesLabel: 'GEB / GEDA',
            logoUrl: '', website: '', epcCode: '',
            bankAccountName: '', bankAccountNumber: '', bankName: '', bankBranch: '', bankIfsc: '',
        },
        features: Object.fromEntries(Object.entries(FEATURE_REGISTRY)
            .filter(([, feature]) => feature.status === 'available')
            .map(([id, feature]) => [id, feature.default === true])),
        pipeline: {
            groups: STAGE_GROUP_DEFAULTS.map(group => ({ ...group })),
            stages: BUILTIN_STAGES.map(stage => ({ id: stage.id, label: stage.label, group: stage.group })),
        },
        dropdowns: Object.fromEntries(Object.entries(DROPDOWN_CATALOG).map(([id, list]) => [
            id, list.defaults.map(item => (typeof item === 'string' ? item : { ...item })),
        ])),
        customFields: [],
        workflowSource: { type: 'form', sheetUrl: '', note: '' },
    };
}

// ── Features + pipeline (resolved together) ──────────────────────────────
//
// Features and stages depend on each other: a stage can need a feature
// (LOAN needs loanTracking) and a feature can need stages (vendorLogin needs
// the three installer stages). Both are settled in one loop until nothing
// changes. `reasons` explains every feature that ended up off, and the one
// that is kept on against the config (checklists, see below).
export function resolveFeaturesAndPipeline(config = {}) {
    const requested = config.features || {};
    const on = {};
    const reasons = {};
    for (const [id, feature] of Object.entries(FEATURE_REGISTRY)) {
        if (feature.status === 'core') on[id] = true;
        else if (feature.status === 'available') on[id] = typeof requested[id] === 'boolean' ? requested[id] : feature.default === true;
        else { on[id] = false; reasons[id] = feature.status === 'removed' ? 'Switched off for every client for now.' : 'Not built yet.'; }
        if (!on[id] && feature.status === 'available') reasons[id] = 'Not chosen.';
    }

    const configuredStages = normalizeStageList(config.pipeline?.stages);
    let stages = [];
    for (let pass = 0; pass < 20; pass += 1) {
        stages = configuredStages.filter(stage => !stage.requiresFeature || on[stage.requiresFeature]);
        const stageIds = new Set(stages.map(stage => stage.id));
        let changed = false;
        for (const [id, feature] of Object.entries(FEATURE_REGISTRY)) {
            if (!on[id]) continue;
            const missingDep = (feature.dependsOn || []).find(dep => !on[dep]);
            const anyDep = feature.dependsOnAny?.length && !feature.dependsOnAny.some(dep => on[dep]);
            const missingStage = (feature.requiresStages || []).find(stageId => !stageIds.has(stageId));
            if (missingDep || anyDep || missingStage) {
                on[id] = false;
                reasons[id] = missingDep ? `Needs ${FEATURE_REGISTRY[missingDep].label}.`
                    : anyDep ? `Needs one of: ${feature.dependsOnAny.map(dep => FEATURE_REGISTRY[dep].label).join(', ')}.`
                        : `Needs the ${BUILTIN_BY_ID[missingStage]?.label || missingStage} stage.`;
                changed = true;
            }
        }
        if (!changed) break;
    }
    for (const id of Object.keys(on)) if (on[id]) delete reasons[id];
    // Projects always need one way to track customer documents.
    if (!on.documentUploads && !on.checklists) {
        on.checklists = true;
        reasons.checklists = 'Document uploads is off, and every project needs one way to track customer documents.';
    }
    return { features: Object.freeze(on), reasons: Object.freeze(reasons), stages: Object.freeze(stages) };
}

// Config stage entries -> full stage definitions in pipeline order, with
// LEADS first and COMPLETED, LOST PROJECT last whatever the config says.
function normalizeStageList(list) {
    const entries = Array.isArray(list) && list.length ? list : BUILTIN_STAGES.map(stage => ({ id: stage.id }));
    const seen = new Set();
    const middle = [];
    for (const entry of entries) {
        const id = text(entry?.id).toUpperCase();
        if (!id || seen.has(id)) continue;
        const builtin = BUILTIN_BY_ID[id];
        if (builtin?.pin) continue;
        if (!builtin && !(entry.custom && CUSTOM_STAGE_ID.test(id) && !RESERVED_STAGE_IDS.includes(id))) continue;
        seen.add(id);
        middle.push(stageDefinition(entry, builtin));
    }
    const byId = Object.fromEntries((entries || []).map(entry => [text(entry?.id).toUpperCase(), entry]));
    const pinned = id => stageDefinition(byId[id] || { id }, BUILTIN_BY_ID[id]);
    return [pinned('LEADS'), ...middle, pinned('COMPLETED'), pinned('LOST PROJECT')];
}

function stageDefinition(entry, builtin) {
    const label = text(entry.label).slice(0, LIMITS.label);
    if (builtin) {
        return {
            ...builtin,
            requirements: builtin.requirements.map(rule => [...rule]),
            label: label || builtin.label,
            group: text(entry.group) || builtin.group,
            guidance: text(entry.guidance).slice(0, LIMITS.guidance) || builtin.guidance,
            custom: false,
        };
    }
    return {
        id: text(entry.id).toUpperCase(),
        label: label || text(entry.id),
        icon: STAGE_ICON_NAMES.includes(entry.icon) ? entry.icon : 'ClipboardList',
        group: text(entry.group) || 'materials',
        guidance: text(entry.guidance).slice(0, LIMITS.guidance),
        removable: true,
        custom: true,
        requirements: [],
    };
}

// ── Groups ────────────────────────────────────────────────────────────────
export function resolveStageGroups(config, stages) {
    const groups = (Array.isArray(config.pipeline?.groups) && config.pipeline.groups.length ? config.pipeline.groups : STAGE_GROUP_DEFAULTS)
        .map(group => ({ id: text(group.id), label: text(group.label).slice(0, LIMITS.label) || text(group.id) }))
        .filter(group => group.id);
    if (!groups.some(group => group.id === 'closed')) groups.push({ id: 'closed', label: 'Closed projects' });
    const known = new Set(groups.map(group => group.id));
    const fallback = groups.find(group => group.id !== 'closed')?.id || 'closed';
    return groups.map(group => ({
        ...group,
        stages: stages.filter(stage => {
            const target = stage.terminal ? 'closed' : known.has(stage.group) ? stage.group : fallback;
            return target === group.id;
        }).map(stage => stage.id),
    })).filter(group => group.stages.length);
}

// ── Custom fields ────────────────────────────────────────────────────────
// Completed and Lost projects have no form, so fields there are dropped.
export function resolveCustomFields(config, stages) {
    const stageIds = new Set(stages.filter(stage => !stage.terminal).map(stage => stage.id));
    const seen = new Set();
    const fields = [];
    for (const raw of Array.isArray(config.customFields) ? config.customFields : []) {
        const key = text(raw?.key);
        const stage = text(raw?.stage).toUpperCase();
        if (!CUSTOM_FIELD_KEY.test(key) || seen.has(key) || !CUSTOM_FIELD_TYPES[raw.type] || !stageIds.has(stage)) continue;
        seen.add(key);
        fields.push({
            key,
            label: text(raw.label).slice(0, LIMITS.label) || key,
            type: raw.type,
            stage,
            options: raw.type === 'select' ? uniqueStrings(raw.options).slice(0, LIMITS.listItems) : undefined,
            required: raw.required === true && raw.type !== 'file',
            showInAddLead: raw.showInAddLead === true && stage === 'LEADS',
            help: text(raw.help).slice(0, LIMITS.guidance),
        });
    }
    return fields;
}

// Required custom fields join their stage's requirements as dotted paths.
// Required means answered: a Yes/No field answered No is filled in.
export function withCustomRequirements(stages, customFields) {
    return stages.map(stage => {
        const extra = customFields.filter(field => field.stage === stage.id && field.required)
            .map(field => [`custom_fields.${field.key}`, field.label, 'present']);
        return extra.length ? { ...stage, requirements: [...stage.requirements, ...extra] } : stage;
    });
}

// A customer with no payment type is routed into LOAN. Registration normally
// asks for it; when no stage before the first LOAN / CASH stage does, the
// stage just before it asks instead.
export function withPaymentTypeRequirement(stages) {
    const first = stages.findIndex(stage => stage.hideWhenPaymentType?.length);
    if (first < 1) return stages;
    const asked = stages.slice(0, first)
        .some(stage => stage.requirements.some(([path, , rule]) => path === 'payment_type' && rule === 'paymentType'));
    if (asked) return stages;
    return stages.map((stage, index) => (index === first - 1
        ? { ...stage, requirements: [...stage.requirements, ['payment_type', 'Payment Type', 'paymentType']] }
        : stage));
}

// ── Dropdowns ────────────────────────────────────────────────────────────
function uniqueStrings(values) {
    const out = [];
    const seen = new Set();
    for (const value of Array.isArray(values) ? values : []) {
        const label = text(String(value ?? '')).slice(0, LIMITS.option);
        if (label && !seen.has(label.toLowerCase())) { seen.add(label.toLowerCase()); out.push(label); }
    }
    return out;
}

export function resolveDropdowns(config) {
    const source = config.dropdowns || {};
    const metadata = {};
    for (const id of METADATA_CATEGORIES) {
        const list = Array.isArray(source[id]) ? uniqueStrings(source[id]) : [...DROPDOWN_CATALOG[id].defaults];
        metadata[id] = (DROPDOWN_CATALOG[id].numeric ? list.filter(value => /^\d{2,5}$/.test(value)) : list).slice(0, LIMITS.listItems);
    }
    const tags = {};
    for (const id of TAG_LISTS) {
        const catalog = DROPDOWN_CATALOG[id];
        const defaults = Object.fromEntries(catalog.defaults.map(tag => [tag.id, tag]));
        const given = Array.isArray(source[id]) ? source[id] : catalog.defaults;
        const seen = new Set();
        const list = [];
        for (const raw of given) {
            const tagId = text(raw?.id) || text(raw?.label);
            if (!tagId || seen.has(tagId)) continue;
            if (!catalog.extendable && !defaults[tagId]) continue;
            seen.add(tagId);
            list.push({ id: tagId, label: text(raw?.label).slice(0, LIMITS.label) || defaults[tagId]?.label || tagId, ...(defaults[tagId]?.isFinal ? { isFinal: true } : {}) });
        }
        // Locked ids are compared in code; they come back even if a config dropped them.
        for (const lockedId of catalog.lockedIds) {
            if (!seen.has(lockedId)) list.push({ ...defaults[lockedId] });
        }
        // The final tag (money received / installed) always comes last.
        tags[id] = [...list.filter(tag => !tag.isFinal), ...list.filter(tag => tag.isFinal)].slice(0, LIMITS.listItems);
    }
    return { metadata, tags };
}

// ── Whole config ─────────────────────────────────────────────────────────
export function resolveClientConfig(config = defaultClientConfig()) {
    const { features, reasons, stages: baseStages } = resolveFeaturesAndPipeline(config);
    const customFields = resolveCustomFields(config, baseStages);
    const stages = withCustomRequirements(withPaymentTypeRequirement(baseStages), customFields);
    return {
        features,
        featureReasons: reasons,
        stages,
        groups: resolveStageGroups(config, stages),
        customFields,
        dropdowns: resolveDropdowns(config),
        branding: { ...defaultClientConfig().branding, ...(config.branding || {}) },
        client: { ...defaultClientConfig().client, ...(config.client || {}) },
    };
}

// ── Validation (builder + zip generator) ─────────────────────────────────
// Errors block a download; warnings are shown to the admin.
export function validateClientConfig(config) {
    const errors = [];
    const warnings = [];
    if (!config || typeof config !== 'object') return { errors: ['Config is missing.'], warnings };
    if (config.schemaVersion !== CONFIG_SCHEMA_VERSION) errors.push(`schemaVersion must be ${CONFIG_SCHEMA_VERSION}.`);
    // Client text ends up in generated files, so one-line text must stay one line.
    const oneLine = (value, what) => {
        if (hasControlChars(value)) errors.push(`${what} has a line break or hidden character; remove it.`);
    };
    if (!text(config.client?.name)) errors.push('Client name is required.');
    oneLine(config.client?.name, 'The client name');
    if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(text(config.client?.slug))) errors.push('Client slug must be lowercase letters, numbers and dashes.');
    const ownerEmail = text(config.client?.ownerEmail);
    if (ownerEmail && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail) || /[\p{Cc};\\"`<>()[\],:]/u.test(ownerEmail))) {
        errors.push('Owner email is not a valid email address.');
    }

    const branding = config.branding && typeof config.branding === 'object' ? config.branding : {};
    errors.push(...Object.values(brandingErrors(branding)));
    for (const [key, value] of Object.entries(branding)) {
        if (key !== 'address') oneLine(value, `Company detail "${BRANDING_FIELDS[key]?.label || key}"`);
    }
    if (!text(branding.bankAccountNumber) && ['bankAccountName', 'bankName', 'bankBranch', 'bankIfsc'].some(key => text(branding[key]))) {
        warnings.push('Bank details are left off quotations until the account number is filled in.');
    }

    for (const [id, value] of Object.entries(config.features || {})) {
        const feature = FEATURE_REGISTRY[id];
        if (!feature) errors.push(`Unknown feature "${id}".`);
        else if (value && feature.status !== 'available' && feature.status !== 'core') warnings.push(`${feature.label} is switched off for every client for now; it will stay off.`);
    }

    const stageEntries = Array.isArray(config.pipeline?.stages) ? config.pipeline.stages : [];
    const stageIds = new Set();
    let customStages = 0;
    for (const entry of stageEntries) {
        const id = text(entry?.id).toUpperCase();
        if (!id) { errors.push('A stage has no id.'); continue; }
        if (stageIds.has(id)) errors.push(`Stage "${id}" is listed twice.`);
        stageIds.add(id);
        if (entry.custom) {
            customStages += 1;
            if (!CUSTOM_STAGE_ID.test(id)) errors.push(`Custom stage id "${id}" must be 2-40 capital letters, numbers or spaces.`);
            if (RESERVED_STAGE_IDS.includes(id)) errors.push(`"${id}" is already used by SolarFlow; pick another stage name.`);
            if (!text(entry.label)) errors.push(`Custom stage "${id}" needs a name.`);
        } else if (!BUILTIN_BY_ID[id]) {
            errors.push(`Unknown built-in stage "${id}". Mark it custom: true to add it.`);
        }
        oneLine(entry.label, `The name of stage "${id}"`);
    }
    for (const group of Array.isArray(config.pipeline?.groups) ? config.pipeline.groups : []) {
        oneLine(group?.label, `The name of stage group "${text(group?.id)}"`);
    }
    if (customStages > LIMITS.customStages) errors.push(`At most ${LIMITS.customStages} custom stages.`);
    for (const id of BUILTIN_STAGE_IDS) {
        const stage = BUILTIN_BY_ID[id];
        if (stageEntries.length && !stage.pin && !stageIds.has(id) && !stage.removable) errors.push(`The ${stage.label} stage cannot be removed.`);
    }

    const resolved = resolveClientConfig(config);
    for (const [id, reason] of Object.entries(resolved.featureReasons)) {
        if (resolved.features[id] && config.features?.[id] === false) warnings.push(`${FEATURE_REGISTRY[id].label} will stay on: ${reason}`);
        else if (config.features?.[id] === true && FEATURE_REGISTRY[id]?.status === 'available') warnings.push(`${FEATURE_REGISTRY[id].label} will be off: ${reason}`);
    }

    const fields = Array.isArray(config.customFields) ? config.customFields : [];
    if (fields.length > LIMITS.customFields) errors.push(`At most ${LIMITS.customFields} extra fields.`);
    const keys = new Set();
    const resolvedStageIds = new Set(resolved.stages.map(stage => stage.id));
    const terminalStages = Object.fromEntries(BUILTIN_STAGES.filter(stage => stage.terminal).map(stage => [stage.id, stage.label]));
    for (const field of fields) {
        const key = text(field?.key);
        if (!CUSTOM_FIELD_KEY.test(key)) errors.push(`Extra field key "${key}" must start with a letter and use only lowercase letters, numbers and _.`);
        if (keys.has(key)) errors.push(`Extra field key "${key}" is used twice.`);
        keys.add(key);
        if (!text(field?.label)) errors.push(`Extra field "${key}" needs a label.`);
        if (!CUSTOM_FIELD_TYPES[field?.type]) errors.push(`Extra field "${key}" has an unknown type.`);
        if (field?.type === 'select' && !uniqueStrings(field.options).length) errors.push(`Dropdown field "${field.label || key}" needs at least one option.`);
        oneLine(field?.label, `The label of extra field "${key}"`);
        if (Array.isArray(field?.options) && field.options.some(hasControlChars)) {
            errors.push(`An option of dropdown field "${key}" has a line break or hidden character; remove it.`);
        }
        const stage = text(field?.stage).toUpperCase();
        if (terminalStages[stage]) errors.push(`Extra field "${field?.label || key}" cannot be on the ${terminalStages[stage]} stage: finished projects have no form to fill in.`);
        else if (!resolvedStageIds.has(stage)) warnings.push(`Extra field "${field?.label || key}" is on a stage that is not in the pipeline; it will be hidden.`);
    }

    for (const id of Object.keys(config.dropdowns || {})) {
        if (!DROPDOWN_CATALOG[id]) errors.push(`Unknown dropdown list "${id}".`);
        else if (!Array.isArray(config.dropdowns[id])) errors.push(`Dropdown list "${id}" must be a list.`);
        else if (config.dropdowns[id].length > LIMITS.listItems) errors.push(`Dropdown list "${DROPDOWN_CATALOG[id].label}" has more than ${LIMITS.listItems} items.`);
        else if (config.dropdowns[id].some(item => [item, item?.id, item?.label].some(hasControlChars))) {
            errors.push(`An item in the list "${DROPDOWN_CATALOG[id].label}" has a line break or hidden character; remove it.`);
        }
    }
    const sheetUrl = text(config.workflowSource?.sheetUrl);
    if (sheetUrl && !isAllowedSheetUrl(sheetUrl)) errors.push('The sheet link must be a Google Sheets, OneDrive or SharePoint link.');
    return { errors, warnings };
}

export function isAllowedSheetUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && (
            (url.hostname === 'docs.google.com' && url.pathname.startsWith('/spreadsheets/'))
            || url.hostname === 'drive.google.com'
            || url.hostname === '1drv.ms'
            || url.hostname === 'onedrive.live.com'
            || url.hostname.endsWith('.sharepoint.com')
        );
    } catch {
        return false;
    }
}

// Lowercase, dash-separated, safe for folder and file names.
export function slugify(value) {
    return String(value || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'solarflow-client';
}

// A stable key for a custom stage or field built from a label.
export function keyFromLabel(label, { stage = false } = {}) {
    const base = String(label || '').normalize('NFKD').replace(/[̀-ͯ]/g, '');
    if (stage) return base.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim().slice(0, 40);
    const key = base.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
    return /^[a-z]/.test(key) ? key : `f_${key}`.slice(0, 40);
}
