// Which spreadsheet column goes where, and the rows SolarFlow will insert.
//
// Pure. `config` is a resolved client config ({ features, stages,
// customFields }): config/index.js in the app, resolveClientConfig() in the
// agency script.

import { todayIST } from '../format.js';
import {
    cleanText, consumerKey, dateOrder, matchKey, phoneKey, toConsumerNumber, toDate, toEmail, toNumber, toOption,
    toPaymentType, toPhone, toPincode, toText, toTimestamp, toYesNo,
} from './values.js';

export const STAGE_TARGET = 'stage';
export const NAME_TARGET = 'customer_name';
const LEADS = 'LEADS';
const COMPLETED = 'COMPLETED';

export const TARGET_GROUPS = Object.freeze([
    { id: 'customer', label: 'Customer' },
    { id: 'system', label: 'Solar system' },
    { id: 'money', label: 'Payment and partners' },
    { id: 'project', label: 'Project' },
    { id: 'extra', label: 'Your extra fields' },
]);

const stageOn = id => config => config.stages.some(stage => stage.id === id);
const loanPayments = config => paymentTypesFor(config.features).includes('Loan');

// Built-in admin columns an existing customer can bring along. Every key is
// a column of public.admin in backend/schema.sql; `kind` picks the converter
// (text columns unless said otherwise; numbers go to numeric columns).
// Synonyms are matched after headerKey(): lower case, punctuation as
// spaces, and "number"/"num" written as "no".
const BUILT_IN = [
    {
        key: 'customer_name', label: 'Customer name', kind: 'name', group: 'customer', required: true,
        synonyms: ['name', 'customer', 'customer name', 'client', 'client name', 'party', 'party name', 'consumer name', 'full name',
            'beneficiary', 'beneficiary name', 'applicant', 'applicant name', 'owner name', 'lead name', 'naam', 'grahak', 'grahak naam', 'customer naam', 'nam'],
    },
    {
        key: 'phone_number', label: 'Mobile number', kind: 'phone', group: 'customer',
        synonyms: ['mobile', 'mobile no', 'mob', 'mob no', 'mo no', 'm no', 'contact', 'contact no', 'phone', 'phone no', 'whatsapp', 'whatsapp no',
            'whats app', 'whats app no', 'cell', 'cell no', 'tel', 'telephone', 'telephone no', 'mobile phone', 'contact details', 'mobile whatsapp'],
    },
    { key: 'email_address', label: 'Email', kind: 'email', group: 'customer', synonyms: ['email', 'e mail', 'email id', 'e mail id', 'mail', 'mail id', 'email address', 'gmail'] },
    { key: 'full_address', label: 'Address', group: 'customer', synonyms: ['address', 'full address', 'addr', 'site address', 'installation address', 'residential address', 'pata'] },
    { key: 'villages', label: 'Village / city', group: 'customer', synonyms: ['village', 'villages', 'gaon', 'gam', 'gram', 'city', 'town', 'village city', 'city village', 'area', 'locality', 'shahar'] },
    { key: 'sub_divisions', label: 'Taluka / sub-division', group: 'customer', synonyms: ['taluka', 'taluk', 'tehsil', 'tahsil', 'sub division', 'subdivision', 'sub divisions', 'block', 'mandal', 'tehsil sub division'] },
    { key: 'district', label: 'District', group: 'customer', synonyms: ['district', 'dist', 'zilla', 'jilla', 'jila', 'zila'] },
    { key: 'pincode', label: 'Pincode', kind: 'pincode', group: 'customer', synonyms: ['pincode', 'pin', 'pin code', 'postal code', 'zip', 'zip code', 'post code'] },
    {
        key: 'consumer_no', label: 'Consumer number', kind: 'consumer', group: 'customer',
        synonyms: ['consumer no', 'ca no', 'ca', 'account no', 'acc no', 'a c no', 'consumer account no', 'k no', 'ivrs', 'ivrs no', 'service no',
            'service connection no', 'sc no', 'connection no', 'electricity no', 'light bill no', 'electricity account no', 'consumer id'],
    },
    {
        key: 'system_capacity_kwp', label: 'System size (kW)', kind: 'kilowatts', group: 'system',
        synonyms: ['kw', 'kwp', 'capacity', 'load', 'system size', 'system capacity', 'plant capacity', 'plant size', 'solar capacity', 'size',
            'capacity kw', 'capacity kwp', 'kw capacity', 'system kw', 'solar kw', 'project capacity', 'system size kw', 'system size kwp'],
    },
    { key: 'module_brand', label: 'Panel brand', group: 'system', synonyms: ['panel brand', 'module brand', 'panel make', 'module make', 'panel company', 'solar panel brand', 'panel name', 'module name', 'panel type'] },
    { key: 'module_wp', label: 'Panel wattage (Wp)', kind: 'number', group: 'system', synonyms: ['wp', 'panel wp', 'module wp', 'panel watt', 'panel wattage', 'module watt', 'module wattage', 'wattage', 'watt peak', 'panel capacity', 'module capacity'] },
    { key: 'no_of_modules', label: 'Number of panels', kind: 'number', group: 'system', synonyms: ['no of panels', 'no of modules', 'panels', 'modules', 'panel qty', 'panel quantity', 'module qty', 'module quantity', 'qty', 'quantity', 'panel count', 'total panels', 'no panels', 'nos of panels'] },
    { key: 'inverter_make', label: 'Inverter brand', group: 'system', synonyms: ['inverter', 'inverter make', 'inverter brand', 'inverter company', 'inverter name'] },
    { key: 'payment_type', label: 'Payment type (Loan / Cash)', kind: 'paymentType', group: 'money', synonyms: ['payment type', 'payment', 'payment mode', 'mode of payment', 'payment method', 'finance', 'finance type', 'loan cash', 'cash loan', 'loan or cash', 'cash or loan', 'funding'] },
    { key: 'bank_name', label: 'Loan bank', group: 'money', when: loanPayments, synonyms: ['bank', 'bank name', 'loan bank', 'financing bank', 'finance bank'] },
    { key: 'loan_by', label: 'Loan handled by', group: 'money', when: config => config.features.loanTracking === true, synonyms: ['loan by', 'loan done by', 'loan handled by'] },
    { key: 'jansamarth_application_no', label: 'Jansamarth application number', group: 'money', when: config => config.features.loanTracking === true, synonyms: ['jansamarth', 'jansamarth no', 'jansamarth application no', 'jan samarth', 'jan samarth no', 'loan application no'] },
    { key: 'invoice_no', label: 'Invoice number', group: 'money', synonyms: ['invoice no', 'invoice', 'bill no', 'inv no', 'tax invoice no'] },
    { key: 'invoice_value', label: 'Invoice value (₹)', kind: 'money', group: 'money', synonyms: ['invoice value', 'invoice amount', 'bill amount', 'amount', 'total amount', 'project cost', 'project value', 'order value', 'deal value', 'rakam', 'total value'] },
    {
        key: 'channel_partner', label: 'Channel partner', group: 'money', when: config => config.features.channelPartners === true || config.features.cpos === true,
        synonyms: ['channel partner', 'cp', 'cp name', 'partner', 'partner name', 'channel partner name', 'franchise', 'franchisee', 'branch', 'associate'],
    },
    { key: 'sub_channel_partner', label: 'Dealer', group: 'money', when: config => config.features.dealers === true, synonyms: ['dealer', 'dealer name', 'sub dealer', 'sub channel partner', 'sub cp', 'agent', 'agent name', 'sub agent'] },
    { key: STAGE_TARGET, label: 'Stage', kind: 'stage', group: 'project', synonyms: ['status', 'stage', 'current status', 'current stage', 'project status', 'lead status', 'work status', 'progress', 'sthiti'] },
    {
        key: 'created_at', label: 'Date added', kind: 'timestamp', group: 'project',
        synonyms: ['date', 'lead date', 'date added', 'added on', 'created', 'created on', 'created at', 'creation date', 'enquiry date', 'inquiry date',
            'entry date', 'timestamp', 'tarikh', 'tareekh', 'lead created', 'date of enquiry'],
    },
    { key: 'registration_no', label: 'Registration / feasibility number', group: 'project', synonyms: ['registration no', 'reg no', 'regn no', 'application no', 'app no', 'application id', 'registration id', 'feasibility no', 'portal application no', 'surya ghar application no', 'pm surya ghar application no'] },
    { key: 'registration_date', label: 'Registration date', kind: 'date', group: 'project', when: stageOn('REGISTRATION'), synonyms: ['registration date', 'reg date', 'regn date', 'application date', 'date of registration', 'registered on'] },
    { key: 'folder_no', label: 'File number', group: 'project', synonyms: ['file no', 'folder no', 'file', 'folder'] },
    { key: 'vendor', label: 'Installer', group: 'project', synonyms: ['installer', 'installer name', 'vendor', 'vendor name', 'installation team', 'fitter', 'contractor', 'installation vendor', 'installed by'] },
    { key: 'installation_date', label: 'Installation date', kind: 'date', group: 'project', synonyms: ['installation date', 'installed on', 'date of installation', 'install date', 'commissioning date', 'installation done date'] },
    { key: 'google_drive_link', label: 'Google Drive link', group: 'project', synonyms: ['google drive', 'google drive link', 'drive link', 'drive', 'documents link', 'docs link', 'folder link'] },
    { key: 'location_link', label: 'Location link', group: 'project', synonyms: ['location', 'location link', 'map', 'map link', 'maps link', 'google map', 'google maps', 'site location', 'gps', 'lat long', 'coordinates'] },
    { key: 'internal_remarks', label: 'Remarks', group: 'project', synonyms: ['remarks', 'remark', 'notes', 'note', 'comments', 'comment', 'internal remarks', 'details', 'description', 'follow up', 'followup', 'feedback', 'tippani'] },
];

const CUSTOM_KINDS = { text: 'text', textarea: 'text', number: 'number', money: 'money', date: 'date', select: 'option', yesno: 'yesno', phone: 'phone' };

// Words that carry no meaning in a header ("Customer's Mobile No" is "mobile no").
const FILLERS = new Set(['customer', 'customers', 'client', 'clients', 'party', 'cust', 's', 'of', 'the', 'ka', 'ki', 'ke', 'grahak', 'in']);
// A header with one of these is about someone or something else ("Alternate mobile", "Dealer mobile").
const OTHER_PERSON = new Set(['alternate', 'alternative', 'alt', 'other', 'second', '2nd', 'secondary', 'father', 'husband', 'wife', 'guardian', 'reference', 'ref', 'office', 'landline']);
// One-word synonyms too vague to find inside a longer header.
const WEAK = new Set(['name', 'customer', 'client', 'party', 'date', 'no', 'status', 'size', 'load', 'file', 'folder', 'partner', 'location', 'area',
    'bank', 'payment', 'details', 'city', 'block', 'pin', 'mail', 'cell', 'tel', 'map', 'drive', 'amount', 'invoice', 'ca', 'cp', 'zip', 'contact',
    'agent', 'branch', 'note', 'notes', 'comment', 'comments', 'description', 'created', 'progress', 'qty', 'quantity', 'panels', 'modules', 'wp', 'kw', 'kwp']);

const NUMBER_WORDS = new Set(['no', 'number', 'num', 'nbr', 'nr', 'numbers', 'nos']);

/** A header as compared with synonyms: 'Mob. Number' -> 'mob no'. */
export function headerKey(text) {
    return matchKey(text).split(' ').filter(Boolean).map(word => (NUMBER_WORDS.has(word) ? 'no' : word)).join(' ');
}

/** Same rule as paymentTypeOptions() in config/index.js, for a config passed in. */
export function paymentTypesFor(features = {}) {
    return features.loanTracking === true || features.cashPayments !== true ? ['Loan', 'Cash'] : ['Cash'];
}

/**
 * Everything a column can be saved as, for this client: the built-in
 * columns its features use, then each extra field (file uploads cannot come
 * from a spreadsheet). key is the admin column, or custom_fields.<key>.
 */
export function importTargets(config) {
    const builtIn = BUILT_IN.filter(target => !target.when || target.when(config)).map(({ when: _when, synonyms, ...target }) => ({
        ...target, kind: target.kind || 'text', custom: false,
        synonyms: [...new Set([headerKey(target.label), ...synonyms.map(headerKey)])],
    }));
    // An extra field named like a built-in column ("Remarks") is labelled
    // "Remarks (extra field)", and the plain name keeps meaning the built-in one.
    const taken = new Set(builtIn.map(target => headerKey(target.label)));
    const custom = (config.customFields || []).filter(field => CUSTOM_KINDS[field.type]).map(field => {
        const label = taken.has(headerKey(field.label)) ? `${field.label} (extra field)` : field.label;
        const synonyms = [headerKey(label), headerKey(field.label), headerKey(field.key)].filter(key => key && (key === headerKey(label) || !taken.has(key)));
        return {
            key: `custom_fields.${field.key}`, field: field.key, label, kind: CUSTOM_KINDS[field.type], group: 'extra', custom: true,
            options: field.type === 'select' ? [...(field.options || [])] : undefined,
            synonyms: [...new Set(synonyms)],
        };
    });
    return Object.freeze([...builtIn, ...custom].map(target => Object.freeze(target)));
}

// [{ target, score }] for one header: exact matches if any, else a single
// target whose synonym appears inside the header.
function headerCandidates(header, targets) {
    const key = headerKey(header);
    if (!key) return [];
    const reduced = key.split(' ').filter(word => !FILLERS.has(word)).join(' ');
    const exact = [];
    for (const target of targets) {
        if (target.synonyms.includes(key)) exact.push({ target, score: target.custom ? 105 : 100 });
        else if (reduced && target.synonyms.includes(reduced)) exact.push({ target, score: target.custom ? 95 : 90 });
    }
    if (exact.length) return exact;
    const words = key.split(' ');
    if (words.some(word => OTHER_PERSON.has(word))) return [];
    const padded = ` ${key} `;
    const found = new Map();
    for (const target of targets) {
        for (const synonym of target.synonyms) {
            if (WEAK.has(synonym) || !padded.includes(` ${synonym} `)) continue;
            found.set(target.key, Math.max(found.get(target.key) || 0, 50 + synonym.split(' ').length));
        }
    }
    if (found.size !== 1) return [];
    const [[targetKey, score]] = found;
    return [{ target: targets.find(target => target.key === targetKey), score }];
}

/**
 * A target key (or null) for each header. The best-scoring pairs are taken
 * first and each target is used once, so "Name" beats "Customer name (old)".
 */
export function guessMapping(headers, targets) {
    const pairs = [];
    headers.forEach((header, index) => {
        for (const { target, score } of headerCandidates(header, targets)) pairs.push({ index, key: target.key, score });
    });
    pairs.sort((a, b) => b.score - a.score || a.index - b.index);
    const mapping = headers.map(() => null);
    const used = new Set();
    for (const { index, key } of pairs) {
        if (mapping[index] || used.has(key)) continue;
        mapping[index] = key;
        used.add(key);
    }
    return mapping;
}

/** What stops a mapping from being imported, in plain words, or ''. */
export function mappingProblem(mapping, targets) {
    if (!mapping.includes(NAME_TARGET)) return 'Choose the column that has the customer name. Every customer needs one.';
    const known = new Set(targets.map(target => target.key));
    const unknown = mapping.find(key => key && !known.has(key));
    if (unknown) return `"${unknown}" is not something this SolarFlow can store.`;
    const repeated = mapping.find((key, index) => key && mapping.indexOf(key) !== index);
    if (repeated) return `Two columns are both set to "${targets.find(target => target.key === repeated).label}". Choose one of them.`;
    return '';
}

// ── Stages ───────────────────────────────────────────────────────────────

// Spreadsheet wording for the built-in stages, after matchKey().
const STAGE_SYNONYMS = {
    LEADS: ['lead', 'leads', 'new', 'new lead', 'enquiry', 'inquiry', 'interested', 'prospect', 'follow up', 'followup', 'quotation', 'quotation sent', 'quote', 'site visit', 'open'],
    REGISTRATION: ['registration', 'registered', 'reg', 'registration done', 'application', 'applied', 'application submitted', 'portal registration', 'feasibility'],
    LOAN: ['loan', 'loan process', 'loan applied', 'loan pending', 'loan sanctioned', 'loan approved', 'bank process', 'loan in process'],
    CASH: ['cash', 'cash payment', 'payment pending', 'advance received'],
    'MATERIAL ORDER': ['material order', 'order', 'ordered', 'po', 'purchase order', 'material ordered', 'order placed'],
    'MATERIAL INTEGRATION': ['material integration', 'bom', 'material ready', 'integration', 'packing'],
    'MATERIAL DELIVERY': ['material delivery', 'delivery', 'delivered', 'dispatch', 'dispatched', 'material delivered', 'material dispatched'],
    'INSTALLATION STATUS': ['installation', 'installation pending', 'installation in progress', 'under installation', 'installing', 'in progress', 'work in progress', 'wip'],
    'GEO TAG PHOTO': ['geo tag', 'geotag', 'geo tag photo', 'geo tagging', 'geotagging'],
    'DISCOM SUBMISSION': ['discom submission', 'discom', 'submitted to discom', 'file submitted', 'submission', 'documents submitted'],
    'METER INSTALLATION': ['meter', 'meter installation', 'net meter', 'net metering', 'meter pending', 'meter installed', 'bidirectional meter'],
    'DISCOM INSPECTION': ['inspection', 'discom inspection', 'inspection done', 'inspection pending'],
    'SUBSIDY STATUS': ['subsidy', 'subsidy pending', 'subsidy applied', 'subsidy process', 'subsidy claimed', 'subsidy redeemed', 'subsidy in process'],
    'FINAL REVIEW': ['final review', 'review', 'final check'],
    COMPLETED: ['completed', 'complete', 'done', 'installed', 'installation done', 'installation completed', 'commissioned', 'finished', 'closed',
        'closed won', 'won', 'success', 'subsidy received', 'project completed', 'handed over', 'handover'],
    'LOST PROJECT': ['lost', 'lost project', 'cancelled', 'canceled', 'cancel', 'rejected', 'not interested', 'dropped', 'closed lost', 'dead', 'hold', 'on hold'],
};

/** Each distinct value of a column below the header, with how many rows have it, most common first. */
export function distinctValues(rows, headerRow, column) {
    const byKey = new Map();
    for (const row of rows.slice(headerRow + 1)) {
        const value = cleanText(row[column]);
        const key = matchKey(value);
        const entry = byKey.get(key);
        if (entry) entry.count += 1;
        else byKey.set(key, { key, value, count: 1 });
    }
    return [...byKey.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/** A stage id for each value key: the stage of that name, a common wording of it, or Leads. */
export function guessStageMap(values, stages) {
    const map = {};
    for (const { key } of values) {
        const bare = key.replace(/^\d+ /, '');
        const stage = stages.find(item => [matchKey(item.label), matchKey(item.id)].includes(bare))
            || stages.find(item => (STAGE_SYNONYMS[item.id] || []).includes(bare));
        map[key] = stage ? stage.id : LEADS;
    }
    return map;
}

// ── Rows to insert ───────────────────────────────────────────────────────

const FOOTER_NAMES = /^(grand )?(sub ?)?totals?$|^sum$/i;

function convert(target, raw, context) {
    switch (target.kind) {
        case 'name': return toText(cleanText(raw).replace(/\s+/g, ' '), { max: 100 });
        case 'phone': return toPhone(raw, target.label);
        case 'email': return toEmail(raw);
        case 'pincode': return toPincode(raw);
        case 'consumer': return toConsumerNumber(raw);
        case 'kilowatts': return toNumber(raw, { kilowatts: true });
        case 'number': return toNumber(raw);
        case 'money': return toNumber(raw, { money: true });
        case 'date': return toDate(raw, context.order);
        case 'timestamp': return toTimestamp(raw, context.order, { today: context.today });
        case 'paymentType': return toPaymentType(raw, context.paymentTypes);
        case 'yesno': return toYesNo(raw);
        case 'option': return toOption(raw, target.options, target.label);
        default: return toText(raw);
    }
}

const prettyPhone = key => `${key.slice(0, 5)} ${key.slice(5)}`;

/**
 * The customers a spreadsheet becomes.
 *
 *   rows, headerRow   cells as read; headerRow is the index of the column names
 *   rowNumbers        the spreadsheet row number of each row (default index + 1)
 *   mapping           target key or null per column (see importTargets)
 *   stageMap          stage id per matchKey() of a stage cell (see guessStageMap)
 *   existing          customers already saved: [{ phone_number, consumer_no }]
 *   duplicatePolicy   'skip' (default) or 'import'
 *   now               the time stamped on new rows; null leaves created_at and
 *                     updated_at to the database
 *   defaults          columns set on every row (lead_creator_profile_id)
 *
 * Returns { ready, readyRowNumbers, skipped: [{ rowNumber, reason, duplicate? }],
 * warnings: [{ rowNumber, column, message }], counts }. Each ready payload
 * is what the app itself would insert: no '' in number or date columns,
 * custom_fields always an object, a stage from this client's pipeline.
 */
export function buildImport({
    rows, headerRow = 0, rowNumbers, mapping, stageMap = {}, existing = [], duplicatePolicy = 'skip', config, now = new Date(), defaults = {},
}) {
    const targets = importTargets(config);
    const problem = mappingProblem(mapping, targets);
    if (problem) throw new Error(problem);
    const byKey = new Map(targets.map(target => [target.key, target]));
    const stageIds = new Set(config.stages.map(stage => stage.id));
    const stageById = new Map(config.stages.map(stage => [stage.id, stage]));
    const paymentTypes = paymentTypesFor(config.features);
    const today = todayIST(now || new Date());
    const stamp = now ? now.toISOString() : null;

    const header = rows[headerRow] || [];
    const body = rows.slice(headerRow + 1);
    const numbers = (rowNumbers || rows.map((_, index) => index + 1)).slice(headerRow + 1);
    const columns = mapping.flatMap((key, col) => (key ? [{ col, target: byKey.get(key) }] : []));
    const nameColumn = mapping.indexOf(NAME_TARGET);
    const orders = new Map(columns.filter(({ target }) => target.kind === 'date' || target.kind === 'timestamp')
        .map(({ col }) => [col, dateOrder(body.map(row => row[col]))]));

    const knownPhones = new Set(existing.map(row => phoneKey(row.phone_number)).filter(Boolean));
    const knownConsumers = new Set(existing.map(row => consumerKey(row.consumer_no)).filter(Boolean));
    const seenPhones = new Map();
    const seenConsumers = new Map();

    const ready = [];
    const readyRowNumbers = [];
    const skipped = [];
    const warnings = [];
    let duplicates = 0;
    let rowCount = 0;

    body.forEach((row, index) => {
        if (!row.some(cell => cleanText(cell))) return;
        rowCount += 1;
        const rowNumber = numbers[index];
        const name = cleanText(row[nameColumn]);
        if (!name) { skipped.push({ rowNumber, reason: 'No customer name' }); return; }
        if (FOOTER_NAMES.test(name)) { skipped.push({ rowNumber, reason: 'Looks like a total row, not a customer' }); return; }
        if (headerKey(name) === headerKey(header[nameColumn])) { skipped.push({ rowNumber, reason: 'Repeats the column names' }); return; }

        const payload = {};
        const custom = {};
        const notes = [];
        const rowWarnings = [];
        let stage = LEADS;
        for (const { col, target } of columns) {
            const raw = row[col];
            if (target.kind === 'stage') {
                const key = matchKey(raw);
                if (!key) continue;
                const chosen = stageMap[key] || LEADS;
                if (stageIds.has(chosen)) stage = chosen;
                else rowWarnings.push({ column: target.label, message: `"${cleanText(raw)}" is not a stage in this pipeline, so the customer starts in Leads.` });
                continue;
            }
            const { value, warning, note } = convert(target, raw, { order: orders.get(col), today, paymentTypes });
            if (warning) rowWarnings.push({ column: target.label, message: warning });
            if (note) notes.push(note);
            if (value == null) continue;
            if (target.custom) custom[target.field] = value;
            else payload[target.key] = value;
        }

        const paymentType = String(payload.payment_type || '').toLowerCase();
        if (paymentType && (stageById.get(stage)?.hideWhenPaymentType || []).includes(paymentType)) {
            rowWarnings.push({ column: 'Stage', message: `${stageById.get(stage).label} is not used for ${paymentType} customers. Move this customer to the right stage after importing.` });
        }
        if (notes.length) payload.internal_remarks = [payload.internal_remarks, ...notes].filter(Boolean).join('\n');

        const phone = phoneKey(payload.phone_number);
        const consumer = consumerKey(payload.consumer_no);
        const duplicate = (phone && knownPhones.has(phone) && `Already in SolarFlow (mobile ${prettyPhone(phone)})`)
            || (consumer && knownConsumers.has(consumer) && `Already in SolarFlow (consumer number ${payload.consumer_no})`)
            || (phone && seenPhones.has(phone) && `Same mobile number as row ${seenPhones.get(phone)}`)
            || (consumer && seenConsumers.has(consumer) && `Same consumer number as row ${seenConsumers.get(consumer)}`);
        if (duplicate) {
            duplicates += 1;
            if (duplicatePolicy !== 'import') { skipped.push({ rowNumber, reason: duplicate, duplicate: true }); return; }
            rowWarnings.push({ column: 'Duplicate', message: `Possible duplicate: ${duplicate}. Imported anyway.` });
        }
        if (phone && !seenPhones.has(phone)) seenPhones.set(phone, rowNumber);
        if (consumer && !seenConsumers.has(consumer)) seenConsumers.set(consumer, rowNumber);

        payload.custom_fields = custom;
        payload.stage = stage;
        // The trigger stamps a new Completed customer with now(); the installation date is closer to the truth.
        if (stage === COMPLETED && payload.installation_date) payload.completed_at = `${payload.installation_date}T00:00:00+05:30`;
        if (!payload.created_at && stamp) payload.created_at = stamp;
        if (stamp) payload.updated_at = stamp;
        for (const [key, value] of Object.entries(defaults)) if (value != null) payload[key] = value;

        ready.push(payload);
        readyRowNumbers.push(rowNumber);
        for (const warning of rowWarnings) warnings.push({ rowNumber, ...warning });
    });

    return {
        ready,
        readyRowNumbers,
        skipped,
        warnings,
        counts: {
            rows: rowCount,
            ready: ready.length,
            duplicates,
            skipped: skipped.length,
            warnings: warnings.length,
        },
    };
}

/** Column names for a blank sheet a client can fill in: one per target, matched back by guessMapping. */
export const blankSheetHeaders = targets => targets.map(target => target.label);
