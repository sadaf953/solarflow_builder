// The fixed customization menu: everything a client can change as part of
// the launch, without code, through the setup forms and the admin page.
// Anything else is a paid add-on: quoted separately, built on its own
// timeline, and never part of the launch.
//
// The setup form, the admin page and SETUP-SUMMARY.md read the menu from
// here; docs/CUSTOMIZATION-MENU.md describes the same menu for people.
//
// Pure: no browser or Node APIs.

import { FEATURE_GROUPS, FEATURE_REGISTRY } from '../../../template/src/config/catalog/features.js';
import { CUSTOM_FIELD_TYPES, DROPDOWN_CATALOG } from '../../../template/src/config/catalog/dropdowns.js';
import { BUILTIN_STAGES } from '../../../template/src/config/catalog/stages.js';
import { LIMITS } from '../../../template/src/config/resolve.js';

/** How long a launch takes. Paid add-ons are never part of it. */
export const LAUNCH_DAYS = '3–5 working days';

export const ADD_ON_RULE = `Things outside this form are built separately as paid add-ons, with their own price and timeline, so your app still goes live in ${LAUNCH_DAYS}.`;

export const ADD_ON_EXAMPLES = Object.freeze([
    'a new document template',
    'a custom report',
    'WhatsApp messages from the app',
    'a new portal or login type',
    'moving old data beyond what the customer importer maps',
]);

// The payment tabs are feature switches too; they get their own line because
// clients ask about them by name.
export const PAYMENT_TAB_FEATURES = Object.freeze(['loanTracking', 'cashPayments', 'installationCommission', 'vendorCommission']);

const switchable = groupId => Object.entries(FEATURE_REGISTRY)
    .filter(([, feature]) => feature.group === groupId && feature.status === 'available')
    .map(([id]) => id);
const PINNED = BUILTIN_STAGES.filter(stage => stage.pin).map(stage => stage.label);
const PINNED_TEXT = PINNED.length > 1 ? `${PINNED.slice(0, -1).join(', ')} and ${PINNED.at(-1)}` : PINNED.join('');

/**
 * The menu, one section per kind of change:
 * {id, title, text, items?: string[], features?: id[], groups?: [{id, label, features: id[]}]}.
 * Feature labels come from FEATURE_REGISTRY.
 */
export const CUSTOMIZATION_MENU = Object.freeze([
    {
        id: 'features',
        title: 'Feature switches',
        text: 'Turn any of these on or off with the questions in this form.',
        groups: FEATURE_GROUPS
            .map(group => ({ id: group.id, label: group.label, features: switchable(group.id) }))
            .filter(group => group.features.length),
    },
    {
        id: 'stages',
        title: 'Pipeline stages',
        text: 'The steps every customer moves through.',
        items: [
            'Rename any stage',
            'Put the stages in your own order',
            `Remove the stages you do not use (${PINNED_TEXT} always stay, and so do the stages your features need)`,
            `Add up to ${LIMITS.customStages} stages of your own`,
        ],
    },
    {
        id: 'lists',
        title: 'Dropdown lists',
        text: `Change the choices in each list, up to ${LIMITS.listItems} per list.`,
        items: Object.values(DROPDOWN_CATALOG).map(list => list.label),
    },
    {
        id: 'fields',
        title: 'Extra fields',
        text: `Up to ${LIMITS.customFields} fields of your own, each on the stage where your team fills it in.`,
        items: [
            `Types: ${Object.values(CUSTOM_FIELD_TYPES).join(', ')}`,
            'Must be filled before moving on, or asked when adding a lead',
        ],
    },
    {
        id: 'payments',
        title: 'Payment tabs',
        text: 'Switched on or off by your answers about payments and installers.',
        features: PAYMENT_TAB_FEATURES,
    },
    {
        id: 'documents',
        title: 'Your details on documents',
        text: 'Printed on quotations and feasibility reports.',
        items: ['Company name, address, GSTIN, website and logo', 'Bank account details', 'DISCOM name and the registration charges label'],
    },
]);

export const featureLabel = id => FEATURE_REGISTRY[id]?.label || id;

// ── Add-on requests ──────────────────────────────────────────────────────
// The client lists what they need outside the menu (submission.addOnRequests,
// [{id, text}]). The admin decides on each and can add their own items
// (settings.addOns, [{id, from, text, decision, price, timeline, note}]).

export const ADD_ON_LIMITS = Object.freeze({ requests: 20, text: 500, adminItems: 20, entries: 100, timeline: 100, note: 500, priceDigits: 9 });

export const ADD_ON_DECISIONS = Object.freeze([
    { value: '', label: 'Not decided yet' },
    { value: 'menu', label: 'In the menu — no charge' },
    { value: 'addon', label: 'Paid add-on' },
    { value: 'declined', label: 'Not doing' },
]);
const DECISIONS = new Set(ADD_ON_DECISIONS.map(option => option.value));
const SOURCES = new Set(['client', 'admin']);
const ID = /^[A-Za-z0-9_-]{1,40}$/;

const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const clip = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');
const isId = value => typeof value === 'string' && ID.test(value);

export const newAddOnId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** submission.addOnRequests as stored: [{id, text}], unique ids, within the limits. */
export function normalizeAddOnRequests(raw) {
    if (!Array.isArray(raw)) return [];
    const seen = new Set();
    const requests = [];
    for (const item of raw) {
        if (!isObject(item) || !isId(item.id) || seen.has(item.id) || typeof item.text !== 'string') continue;
        seen.add(item.id);
        requests.push({ id: item.id, text: clip(item.text, ADD_ON_LIMITS.text) });
        if (requests.length === ADD_ON_LIMITS.requests) break;
    }
    return requests;
}

// Rupees as digits only: '₹1,50,000' -> '150000'.
const priceDigits = value => (typeof value === 'string' || typeof value === 'number' ? String(value) : '')
    .replace(/\.\d*$/, '').replace(/\D/g, '').slice(0, ADD_ON_LIMITS.priceDigits);

// One settings.addOns entry as stored. Client entries hold only the admin's
// decision; their text always comes from the submission.
const storedEntry = item => ({
    id: item.id,
    from: item.from,
    text: item.from === 'admin' ? clip(item.text, ADD_ON_LIMITS.text) : '',
    decision: DECISIONS.has(item.decision) ? item.decision : '',
    price: priceDigits(item.price),
    timeline: clip(item.timeline, ADD_ON_LIMITS.timeline),
    note: clip(item.note, ADD_ON_LIMITS.note),
});

// Valid entries, one per source and id, in order, with no cap.
function storedEntries(raw) {
    if (!Array.isArray(raw)) return [];
    const seen = new Set();
    const entries = [];
    for (const item of raw) {
        if (!isObject(item) || !isId(item.id) || !SOURCES.has(item.from) || seen.has(`${item.from}:${item.id}`)) continue;
        seen.add(`${item.from}:${item.id}`);
        entries.push(storedEntry(item));
    }
    return entries;
}

/**
 * settings.addOns as stored. Entries for requests the client later removed
 * may still be here (withAddOn drops them once nothing was decided on them).
 */
export const normalizeAddOns = raw => storedEntries(raw).slice(0, ADD_ON_LIMITS.entries);

const UNDECIDED = { decision: '', price: '', timeline: '', note: '' };
const isUndecided = entry => Object.keys(UNDECIDED).every(key => !entry[key]);

/**
 * Everything on one client's add-on list: their requests (blank ones left
 * out) with the admin's decision on each, then the admin's own items.
 */
export function addOnList(submission, addOns) {
    const saved = normalizeAddOns(addOns);
    const decided = new Map(saved.filter(entry => entry.from === 'client').map(entry => [entry.id, entry]));
    const requests = normalizeAddOnRequests(submission?.addOnRequests)
        .filter(request => request.text.trim())
        .map(request => ({ ...UNDECIDED, ...decided.get(request.id), id: request.id, from: 'client', text: request.text.trim() }));
    return [...requests, ...saved.filter(entry => entry.from === 'admin')];
}

/**
 * `addOns` with one entry's admin fields saved (added when it is new).
 * Pass the client's `submission` so entries for requests they removed can be
 * tidied: builder.sql refuses more than ADD_ON_LIMITS.entries, and every save
 * would fail once the list grew past that.
 */
export function withAddOn(addOns, entry, submission) {
    const saved = storedEntry(entry);
    const list = storedEntries(addOns);
    const index = list.findIndex(item => item.from === saved.from && item.id === saved.id);
    const merged = index < 0 ? [...list, saved] : list.map((item, i) => (i === index ? saved : item));

    const live = submission ? new Set(normalizeAddOnRequests(submission.addOnRequests).map(request => request.id)) : null;
    const removed = item => item !== saved && item.from === 'client' && live !== null && !live.has(item.id);
    // Nothing was decided on these, so nothing is lost.
    const entries = merged.filter(item => !(removed(item) && isUndecided(item)));
    // Still too many: drop the oldest entries for removed requests first,
    // then the oldest of the rest. The entry being saved always stays.
    while (entries.length > ADD_ON_LIMITS.entries) {
        const oldRemoved = entries.findIndex(removed);
        entries.splice(oldRemoved >= 0 ? oldRemoved : entries.findIndex(item => item !== saved), 1);
    }
    return entries;
}

export const withoutAddOn = (addOns, entry) => (Array.isArray(addOns) ? addOns : [])
    .filter(item => !(item?.from === entry.from && item?.id === entry.id));
