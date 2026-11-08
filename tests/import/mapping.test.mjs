import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { defaultClientConfig, resolveClientConfig } from '../../template/src/config/resolve.js';
import * as runtime from '../../template/src/config/index.js';
import {
    blankSheetHeaders, buildImport, distinctValues, guessMapping, guessStageMap, headerKey, importTargets, mappingProblem, paymentTypesFor,
} from '../../template/src/lib/import/mapping.js';
import {
    dateOrder, parseNumber, phoneKey, consumerKey, toDate, toNumber, toOption, toPaymentType, toPhone, toPincode, toTimestamp, toYesNo,
    toConsumerNumber, excelSerialText,
} from '../../template/src/lib/import/values.js';

// A client with partners, dealers, a custom stage and one extra field of each importable type.
function clientConfig(features = {}) {
    const base = defaultClientConfig();
    return resolveClientConfig({
        ...base,
        features: { ...base.features, channelPartners: true, dealers: true, loanTracking: true, cashPayments: true, ...features },
        pipeline: {
            ...base.pipeline,
            stages: [
                ...base.pipeline.stages.slice(0, 2),
                { id: 'SITE SURVEY', label: 'Site survey', custom: true, group: 'enquiry' },
                ...base.pipeline.stages.slice(2),
            ],
        },
        customFields: [
            { key: 'survey_date', label: 'Survey date', type: 'date', stage: 'SITE SURVEY' },
            { key: 'roof_type', label: 'Roof type', type: 'select', options: ['RCC', 'Tin shed'], stage: 'SITE SURVEY' },
            { key: 'net_meter', label: 'Net meter applied', type: 'yesno', stage: 'SITE SURVEY' },
            { key: 'sanctioned_load', label: 'Sanctioned load (kW)', type: 'number', stage: 'LEADS' },
            { key: 'advance', label: 'Advance paid', type: 'money', stage: 'LEADS' },
            { key: 'alt_mobile', label: 'Alternate mobile', type: 'phone', stage: 'LEADS' },
            { key: 'site_photo', label: 'Site photo', type: 'file', stage: 'SITE SURVEY' },
            { key: 'remarks', label: 'Remarks', type: 'textarea', stage: 'LEADS' },
        ],
    });
}
const CONFIG = clientConfig();
const TARGETS = importTargets(CONFIG);
const keysOf = targets => targets.map(target => target.key);
const NOW = new Date('2026-10-20T06:30:00Z');

// public.admin's columns and types, read from schema.sql.
const schema = await readFile(new URL('../../template/backend/schema.sql', import.meta.url), 'utf8');
const adminBlock = /create table if not exists public\.admin \(([\s\S]*?)\n\);/.exec(schema)[1];
const ADMIN = new Map(adminBlock.split('\n').map(line => /^\s+([a-z0-9_]+) ([a-z]+)/.exec(line)).filter(Boolean).map(([, name, type]) => [name, type]));

test('every built-in target is a real admin column of the right type', () => {
    const numeric = new Set(['kilowatts', 'number', 'money']);
    for (const target of TARGETS.filter(item => !item.custom)) {
        assert.ok(ADMIN.has(target.key), `${target.key} is not a column of public.admin`);
        const type = ADMIN.get(target.key);
        if (numeric.has(target.kind)) assert.equal(type, 'numeric', target.key);
        else if (target.kind === 'timestamp') assert.equal(type, 'timestamptz', target.key);
        else assert.equal(type, 'text', target.key);
    }
    // Head-office-only columns are never import targets.
    for (const reserved of ['vendor_quote', 'vendor_payment_status', 'vendor_paid_date', 'vendor_paid_by', 'bom_stock_issued_at', 'deleted_at', 'delivery_batch_id', 'lead_creator_profile_id']) {
        assert.ok(!keysOf(TARGETS).includes(reserved), reserved);
    }
});

test('targets follow the client: features, stages and extra fields', () => {
    const keys = keysOf(TARGETS);
    for (const key of ['channel_partner', 'sub_channel_partner', 'bank_name', 'loan_by', 'jansamarth_application_no', 'registration_date']) assert.ok(keys.includes(key), key);
    assert.deepEqual(keys.filter(key => key.startsWith('custom_fields.')), [
        'custom_fields.survey_date', 'custom_fields.roof_type', 'custom_fields.net_meter', 'custom_fields.sanctioned_load',
        'custom_fields.advance', 'custom_fields.alt_mobile', 'custom_fields.remarks',
    ], 'file fields cannot be imported');
    const remarks = TARGETS.find(target => target.key === 'custom_fields.remarks');
    assert.equal(remarks.label, 'Remarks (extra field)');
    assert.deepEqual(guessMapping(['Remarks', 'Remarks (extra field)'], TARGETS), ['internal_remarks', 'custom_fields.remarks']);

    const bare = keysOf(importTargets(clientConfig({ channelPartners: false, cpos: false, dealers: false, loanTracking: false, cashPayments: false })));
    for (const key of ['channel_partner', 'sub_channel_partner', 'loan_by', 'jansamarth_application_no']) assert.ok(!bare.includes(key), key);
    assert.ok(bare.includes('bank_name'), 'loan payments are still offered without loan tracking');
    const cashOnly = keysOf(importTargets(clientConfig({ loanTracking: false, cashPayments: true })));
    assert.ok(!cashOnly.includes('bank_name'));

    const base = defaultClientConfig();
    const noRegistration = resolveClientConfig({ ...base, pipeline: { ...base.pipeline, stages: base.pipeline.stages.filter(stage => stage.id !== 'REGISTRATION') } });
    assert.ok(!keysOf(importTargets(noRegistration)).includes('registration_date'));
    assert.ok(keysOf(importTargets(noRegistration)).includes('registration_no'), 'the feasibility number is asked on other tabs too');
});

test('payment types follow the same rule as the app', () => {
    assert.deepEqual(paymentTypesFor(runtime.FEATURES), runtime.paymentTypeOptions());
    assert.deepEqual(paymentTypesFor({ loanTracking: false, cashPayments: true }), ['Cash']);
    assert.deepEqual(paymentTypesFor({ loanTracking: false, cashPayments: false }), ['Loan', 'Cash']);
});

test('headers are matched in English, office shorthand and Hinglish', () => {
    const headers = [
        'Sr. No.', 'Party Name', 'Mob. No.', 'WhatsApp No', 'E-mail ID', 'Gaon', 'Taluka', 'Jila', 'Pin Code', 'CA No',
        'KW', 'Panel Make', 'Wp', 'No. of Panels', 'Inverter', 'Loan/Cash', 'Bank Name', 'CP', 'Dealer Name', 'Status',
        'Lead Date', 'Reg. Date', 'Application No', 'File No', 'Installer', 'Installation Date', 'Drive Link', 'Google Map',
        'Remarks', 'Survey Date', 'Roof Type', 'Net meter applied', 'Amount',
    ];
    const mapping = guessMapping(headers, TARGETS);
    const got = Object.fromEntries(headers.map((header, i) => [header, mapping[i]]));
    assert.deepEqual(got, {
        'Sr. No.': null, 'Party Name': 'customer_name', 'Mob. No.': 'phone_number', 'WhatsApp No': null, 'E-mail ID': 'email_address',
        Gaon: 'villages', Taluka: 'sub_divisions', Jila: 'district', 'Pin Code': 'pincode', 'CA No': 'consumer_no',
        KW: 'system_capacity_kwp', 'Panel Make': 'module_brand', Wp: 'module_wp', 'No. of Panels': 'no_of_modules', Inverter: 'inverter_make',
        'Loan/Cash': 'payment_type', 'Bank Name': 'bank_name', CP: 'channel_partner', 'Dealer Name': 'sub_channel_partner', Status: 'stage',
        'Lead Date': 'created_at', 'Reg. Date': 'registration_date', 'Application No': 'registration_no', 'File No': 'folder_no',
        Installer: 'vendor', 'Installation Date': 'installation_date', 'Drive Link': 'google_drive_link', 'Google Map': 'location_link',
        Remarks: 'internal_remarks', 'Survey Date': 'custom_fields.survey_date', 'Roof Type': 'custom_fields.roof_type',
        'Net meter applied': 'custom_fields.net_meter', Amount: 'invoice_value',
    });
    assert.equal(new Set(mapping.filter(Boolean)).size, mapping.filter(Boolean).length, 'each target is used once');
});

test('the common single-word headers from the spec all land', () => {
    const cases = {
        'Customer Name': 'customer_name', Name: 'customer_name', Client: 'customer_name', 'Party Name': 'customer_name', "Customer's Name": 'customer_name',
        'Name of Customer': 'customer_name', 'Grahak ka naam': 'customer_name',
        Mobile: 'phone_number', 'Mob No': 'phone_number', Contact: 'phone_number', Phone: 'phone_number', WhatsApp: 'phone_number',
        'Customer Mobile Number': 'phone_number', 'Mobile No (WhatsApp)': 'phone_number',
        kW: 'system_capacity_kwp', KW: 'system_capacity_kwp', Capacity: 'system_capacity_kwp', Load: 'system_capacity_kwp', 'System Size (kWp)': 'system_capacity_kwp',
        'Consumer No': 'consumer_no', 'CA No': 'consumer_no', 'Account No': 'consumer_no', 'Consumer Number': 'consumer_no',
        Village: 'villages', Gaon: 'villages', Taluka: 'sub_divisions', Status: 'stage', Stage: 'stage',
        Dealer: 'sub_channel_partner', 'Channel Partner': 'channel_partner', CP: 'channel_partner',
        Remarks: 'internal_remarks', Date: 'created_at', 'Lead Date': 'created_at', Timestamp: 'created_at',
    };
    const plain = importTargets(clientConfig({ cpos: false }));
    for (const [header, key] of Object.entries(cases)) {
        assert.equal(guessMapping([header], plain.filter(target => !target.custom))[0], key, header);
    }
});

test('headers about someone else, or vague ones, are left for the user', () => {
    const headers = ['Alternate Mobile No', 'Dealer Mobile', 'Father Name', 'Inverter Capacity', 'Address with Pincode', 'Client Code', 'Loan Status', 'Subsidy Status', 'Payment Status'];
    const builtIns = TARGETS.filter(target => !target.custom);
    assert.deepEqual(guessMapping(headers, builtIns), headers.map(() => null));
    // Exact matches win over the same target found inside a longer header.
    assert.deepEqual(guessMapping(['Mobile No (old)', 'Mobile'], builtIns), [null, 'phone_number']);
    assert.equal(headerKey('Mob. Number #'), 'mob no');
});

test('the dealer and partner columns are only matched when those features are on', () => {
    const off = importTargets(clientConfig({ channelPartners: false, cpos: false, dealers: false }));
    assert.deepEqual(guessMapping(['Name', 'Dealer', 'Channel Partner'], off), ['customer_name', null, null]);
});

test('the blank sheet\'s columns match straight back to their targets', () => {
    const headers = blankSheetHeaders(TARGETS);
    assert.equal(new Set(headers).size, headers.length, 'column names are unique');
    assert.deepEqual(guessMapping(headers, TARGETS), keysOf(TARGETS));
    for (const config of [clientConfig({ dealers: false, loanTracking: false }), resolveClientConfig(defaultClientConfig())]) {
        const targets = importTargets(config);
        assert.deepEqual(guessMapping(blankSheetHeaders(targets), targets), keysOf(targets));
    }
});

test('mappingProblem asks for a name column, known targets and no repeats', () => {
    assert.match(mappingProblem([null, 'phone_number'], TARGETS), /customer name/);
    assert.match(mappingProblem(['customer_name', 'deleted_at'], TARGETS), /not something/);
    assert.match(mappingProblem(['customer_name', 'phone_number', 'phone_number'], TARGETS), /Two columns are both set to "Mobile number"/);
    assert.equal(mappingProblem(['customer_name', null, 'stage'], TARGETS), '');
});

test('phones become 10-digit mobiles; anything else is kept as written with a warning', () => {
    for (const raw of ['9876543210', '+91 98765 43210', '+91-98765-43210', '09876543210', '919876543210', '0091 9876543210', '98765 43210', ' (+91) 98765-43210 ']) {
        assert.deepEqual(toPhone(raw), { value: '9876543210' }, raw);
    }
    assert.deepEqual(toPhone(''), { value: null });
    assert.deepEqual(toPhone('-'), { value: null });
    const short = toPhone('98765');
    assert.equal(short.value, '98765');
    assert.match(short.warning, /not a 10-digit mobile number/);
    // A landline with its STD code reads as 10 digits, as the Add Lead form accepts it.
    assert.equal(toPhone('0261 2345678').value, '2612345678');
    const two = toPhone('98765 43210 / 91234 56789');
    assert.equal(two.value, '9876543210');
    assert.equal(two.note, 'Other mobile number from the import: 9123456789');
    assert.match(two.warning, /more than one number/);
    assert.equal(toPhone('9876543210, 9123456789').value, '9876543210');
    assert.equal(toPhone('98765 43210 91234 56789').note, 'Other mobile number from the import: 9123456789');
    const lost = toPhone('9.88E+09');
    assert.equal(lost.value, null);
    assert.match(lost.warning, /shortened by Excel/);
    assert.equal(phoneKey('+91 98765 43210'), '9876543210');
    assert.equal(phoneKey('12345'), '');
});

test('numbers and amounts read the way Indian offices write them', () => {
    const cases = [
        ['5', 5], ['5 kW', 5], ['5KW', 5], ['3.3 kWp', 3.3], ['1,20,000', 120000], ['₹ 2,40,000', 240000], ['Rs. 2,40,000/-', 240000],
        ['Rs 50000', 50000], ['INR 1,00,000', 100000], ['2,40,000.50', 240000.5], ['5,5', 5.5], ['540 Wp', 540], ['6 nos', 6], ['-3', -3],
    ];
    for (const [raw, value] of cases) assert.equal(parseNumber(raw), value, raw);
    assert.equal(parseNumber('2.4 lakh', { money: true }), 240000);
    assert.equal(parseNumber('1.2 Cr', { money: true }), 12000000);
    assert.equal(parseNumber('50k', { money: true }), 50000);
    assert.ok(Number.isNaN(parseNumber('2.4 lakh')), 'lakh is only for amounts');
    assert.equal(parseNumber('3300 W', { kilowatts: true }), 3.3);
    assert.equal(parseNumber('5 kW', { kilowatts: true }), 5);
    assert.equal(parseNumber('N/A'), null);
    assert.deepEqual(toNumber('about 5'), { value: null, warning: '"about 5" is not a number, so it was left empty.' });
    assert.deepEqual(toNumber(''), { value: null });
});

test('dates: Excel day numbers, Indian day-first, ISO and month names, stored as YYYY-MM-DD', () => {
    const cases = [
        ['45362', '2024-03-11'], ['12/03/2024', '2024-03-12'], ['12-03-24', '2024-03-12'], ['1.3.2024', '2024-03-01'], ['2024-03-12', '2024-03-12'],
        ['2024/3/5', '2024-03-05'], ['12 Mar 2024', '2024-03-12'], ['12-Mar-24', '2024-03-12'], ['12th March, 2024', '2024-03-12'],
        ['Mar 12, 2024', '2024-03-12'], ['March 12 2024', '2024-03-12'], ['Tue, 12 Mar 2024', '2024-03-12'], ['20240312', '2024-03-12'],
        ['12/03/2024 10:30', '2024-03-12'], ['2024-03-12T10:30:00.000Z', '2024-03-12'], ['2024-03-11 10:30', '2024-03-11'],
    ];
    for (const [raw, value] of cases) assert.deepEqual(toDate(raw), { value }, raw);
    for (const raw of ['31/02/2024', '2024', '13/13/2024', 'soon', '45362abc']) {
        const result = toDate(raw);
        assert.equal(result.value, null, raw);
        assert.match(result.warning, /not a date SolarFlow can read/, raw);
    }
    assert.equal(excelSerialText(45362.5), '2024-03-11 12:00');
});

test('a column that is clearly month-first is read month-first', () => {
    assert.equal(dateOrder(['03/04/2024', '25/04/2024']), 'dmy');
    assert.equal(dateOrder(['03/04/2024', '04/25/2024 10:15:00']), 'mdy');
    assert.equal(dateOrder(['03/04/2024', '04/05/2024']), 'dmy');
    assert.equal(toDate('03/04/2024', 'mdy').value, '2024-03-04');
    assert.equal(toDate('03/04/2024').value, '2024-04-03');
});

test('timestamps are India time, with a warning for future dates', () => {
    assert.deepEqual(toTimestamp('12/03/2024', 'dmy', { today: '2026-10-20' }), { value: '2024-03-12T00:00:00+05:30' });
    assert.deepEqual(toTimestamp('12/03/2024 4:05 pm', 'dmy', { today: '2026-10-20' }), { value: '2024-03-12T16:05:00+05:30' });
    assert.equal(toTimestamp('12/03/2024 12:30 am', 'dmy', { today: '2026-10-20' }).value, '2024-03-12T00:30:00+05:30');
    const future = toTimestamp('01/01/2027', 'dmy', { today: '2026-10-20' });
    assert.equal(future.value, '2027-01-01T00:00:00+05:30');
    assert.match(future.warning, /in the future/);
});

test('yes/no, dropdown options, payment types, pincodes and consumer numbers', () => {
    for (const raw of ['Yes', 'y', 'TRUE', '1', 'haan', 'Done']) assert.equal(toYesNo(raw).value, 'Yes', raw);
    for (const raw of ['No', 'n', 'FALSE', '0', 'nahi']) assert.equal(toYesNo(raw).value, 'No', raw);
    assert.match(toYesNo('maybe').warning, /not Yes or No/);

    assert.deepEqual(toOption('tin  SHED', ['RCC', 'Tin shed'], 'Roof type'), { value: 'Tin shed' });
    const other = toOption('Asbestos', ['RCC', 'Tin shed'], 'Roof type');
    assert.equal(other.value, 'Asbestos');
    assert.match(other.warning, /not one of the choices for Roof type/);

    for (const raw of ['Loan', 'bank loan', 'Finance', 'EMI', 'SBI loan']) assert.equal(toPaymentType(raw).value, 'Loan', raw);
    for (const raw of ['Cash', 'self', 'UPI', 'Cheque', 'Full payment']) assert.equal(toPaymentType(raw).value, 'Cash', raw);
    assert.match(toPaymentType('maybe').warning, /not Loan or Cash/);
    const cashOnly = toPaymentType('Loan', ['Cash']);
    assert.equal(cashOnly.value, null);
    assert.match(cashOnly.warning, /only takes cash payments/);

    assert.deepEqual(toPincode('395 009'), { value: '395009' });
    assert.match(toPincode('3950').warning, /6-digit pincode/);
    assert.deepEqual(toConsumerNumber('1234 5678 9012'), { value: '123456789012' });
    assert.deepEqual(toConsumerNumber('MH-0123A'), { value: 'MH-0123A' });
    assert.equal(consumerKey(' 000123456 '), '123456');
    assert.equal(consumerKey('mh-0123a'), 'MH0123A');
    assert.equal(consumerKey('12'), '');
});

test('stage values match labels, ids, common wording and numbered lists; the rest go to Leads', () => {
    const header = ['Name', 'Status'];
    const values = ['Done', 'done', 'Installed', 'Cancelled', 'Lost', 'Site survey', 'REGISTRATION', '3. Registration', 'Loan sanctioned', 'Material Delivery', 'Something odd', '', 'In progress'];
    const rows = [header, ...values.map((value, i) => [`Customer ${i}`, value])];
    const found = distinctValues(rows, 0, 1);
    assert.deepEqual(found.find(value => value.key === 'done'), { key: 'done', value: 'Done', count: 2 });
    const map = guessStageMap(found, CONFIG.stages);
    assert.deepEqual(map, {
        done: 'COMPLETED', installed: 'COMPLETED', cancelled: 'LOST PROJECT', lost: 'LOST PROJECT', 'site survey': 'SITE SURVEY',
        registration: 'REGISTRATION', '3 registration': 'REGISTRATION', 'loan sanctioned': 'LOAN', 'material delivery': 'MATERIAL DELIVERY',
        'something odd': 'LEADS', '': 'LEADS', 'in progress': 'INSTALLATION STATUS',
    });
    // A stage the client does not have is never guessed.
    const noLoan = clientConfig({ loanTracking: false });
    assert.equal(guessStageMap([{ key: 'loan sanctioned' }], noLoan.stages)['loan sanctioned'], 'LEADS');
});

// ── buildImport ──────────────────────────────────────────────────────────

const HEADER = ['Name', 'Mobile', 'Consumer No', 'kW', 'Amount', 'Status', 'Lead Date', 'Installation Date', 'Loan/Cash', 'Survey Date', 'Roof Type', 'Net meter applied', 'Sanctioned load (kW)', 'Remarks', 'Village'];
const sheet = (...rows) => [HEADER, ...rows];
const build = (rows, options = {}) => {
    const mapping = guessMapping(rows[0], TARGETS);
    const stageColumn = mapping.indexOf('stage');
    return buildImport({
        rows, mapping, config: CONFIG, now: NOW,
        stageMap: stageColumn === -1 ? {} : guessStageMap(distinctValues(rows, 0, stageColumn), CONFIG.stages),
        ...options,
    });
};

test('ready rows look like what the app inserts', () => {
    const result = build(sheet(
        ['Ravi Patel', '+91 98765 43210', '1234 5678 9012', '5 kW', '₹ 2,40,000', 'Done', '12/03/2024', '20/04/2024', 'Loan', '15-03-24', 'rcc', 'haan', '7.5', 'Good roof', 'Adajan'],
        ['Sita  Shah', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ));
    assert.deepEqual(result.counts, { rows: 2, ready: 2, duplicates: 0, skipped: 0, warnings: 0 });
    assert.deepEqual(result.readyRowNumbers, [2, 3]);
    assert.deepEqual(result.ready[0], {
        customer_name: 'Ravi Patel',
        phone_number: '9876543210',
        consumer_no: '123456789012',
        system_capacity_kwp: 5,
        invoice_value: 240000,
        created_at: '2024-03-12T00:00:00+05:30',
        installation_date: '2024-04-20',
        payment_type: 'Loan',
        villages: 'Adajan',
        internal_remarks: 'Good roof',
        custom_fields: { survey_date: '2024-03-15', roof_type: 'RCC', net_meter: 'Yes', sanctioned_load: 7.5 },
        stage: 'COMPLETED',
        completed_at: '2024-04-20T00:00:00+05:30',
        updated_at: NOW.toISOString(),
    });
    assert.deepEqual(result.ready[1], { customer_name: 'Sita Shah', custom_fields: {}, stage: 'LEADS', created_at: NOW.toISOString(), updated_at: NOW.toISOString() });
    for (const payload of result.ready) {
        for (const [key, value] of Object.entries(payload)) {
            assert.notEqual(value, '', `${key} is an empty string`);
            assert.notEqual(value, undefined, key);
            if (ADMIN.get(key) === 'numeric') assert.equal(typeof value, 'number', key);
        }
        assert.ok(Object.keys(payload).every(key => ADMIN.has(key)), 'only real columns');
    }
});

test('rows without a name, total rows and repeated headers are skipped with a reason', () => {
    const result = build(sheet(
        ['', '9876543210'],
        ['Total', '', '', '13.3'],
        ['Name', 'Mobile'],
        ['Mohan', '9123456789'],
        ['', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ));
    assert.deepEqual(result.skipped, [
        { rowNumber: 2, reason: 'No customer name' },
        { rowNumber: 3, reason: 'Looks like a total row, not a customer' },
        { rowNumber: 4, reason: 'Repeats the column names' },
    ]);
    assert.equal(result.counts.rows, 4, 'a fully empty row is not counted');
    assert.deepEqual(result.ready.map(row => row.customer_name), ['Mohan']);
});

test('duplicates in the file and in SolarFlow are skipped, or kept with a warning', () => {
    const rows = sheet(
        ['Ravi', '9876543210', '1111222233'],
        ['Ravi again', '+91 98765 43210', ''],
        ['Sita', '9123456789', '0001111222233'],
        ['Mohan', '9000000001', ''],
        ['Gita', '', 'CA-55555'],
    );
    const existing = [{ phone_number: '090000 00001', consumer_no: null }, { phone_number: null, consumer_no: 'ca 55555' }];
    const skip = build(rows, { existing });
    assert.deepEqual(skip.ready.map(row => row.customer_name), ['Ravi']);
    assert.deepEqual(skip.skipped, [
        { rowNumber: 3, reason: 'Same mobile number as row 2', duplicate: true },
        { rowNumber: 4, reason: 'Same consumer number as row 2', duplicate: true },
        { rowNumber: 5, reason: 'Already in SolarFlow (mobile 90000 00001)', duplicate: true },
        { rowNumber: 6, reason: 'Already in SolarFlow (consumer number CA-55555)', duplicate: true },
    ]);
    assert.equal(skip.counts.duplicates, 4);

    const keep = build(rows, { existing, duplicatePolicy: 'import' });
    assert.equal(keep.ready.length, 5);
    assert.equal(keep.counts.duplicates, 4);
    assert.deepEqual(keep.warnings.filter(item => item.column === 'Duplicate').map(item => item.rowNumber), [3, 4, 5, 6]);
    assert.match(keep.warnings[0].message, /^Possible duplicate: Same mobile number as row 2/);
});

test('only stages in the pipeline are ever written', () => {
    const rows = sheet(['Ravi', '', '', '', '', 'Weird'], ['Sita', '', '', '', '', 'Done'], ['Mohan', '', '', '', '', '']);
    const mapping = guessMapping(rows[0], TARGETS);
    const result = buildImport({ rows, mapping, config: CONFIG, now: NOW, stageMap: { weird: 'DROP TABLE', done: 'COMPLETED' } });
    assert.deepEqual(result.ready.map(row => row.stage), ['LEADS', 'COMPLETED', 'LEADS']);
    assert.match(result.warnings[0].message, /not a stage in this pipeline/);
    assert.ok(!('completed_at' in result.ready[1]), 'without an installation date the database stamps it');
});

test('warnings carry the row and column; a second phone number goes to the remarks', () => {
    const result = build(sheet(
        ['Ravi', '98765 / 9123456789', '', 'big', '', '', '31/02/2024', '', 'Loan', '', 'Asbestos', 'maybe', '', 'Call after 5', ''],
        ['Sita', '9876543210 / 9123456780', '', '', '', 'Cash', '', '', 'Loan'],
    ));
    assert.deepEqual(result.warnings.map(({ rowNumber, column }) => [rowNumber, column]), [
        [2, 'Mobile number'], [2, 'System size (kW)'], [2, 'Date added'], [2, 'Roof type'], [2, 'Net meter applied'], [3, 'Mobile number'], [3, 'Stage'],
    ]);
    assert.equal(result.ready[0].phone_number, '98765 / 9123456789');
    assert.equal(result.ready[1].phone_number, '9876543210');
    assert.equal(result.ready[1].internal_remarks, 'Other mobile number from the import: 9123456780');
    assert.match(result.warnings.at(-1).message, /Cash is not used for loan customers/);
    assert.equal(result.ready[0].custom_fields.roof_type, 'Asbestos');
    assert.ok(!('net_meter' in result.ready[0].custom_fields));
});

test('defaults are added, and now: null leaves the timestamps to the database', () => {
    const rows = sheet(['Ravi']);
    const mapping = guessMapping(rows[0], TARGETS);
    const withUser = buildImport({ rows, mapping, config: CONFIG, now: NOW, defaults: { lead_creator_profile_id: '6f1c2b8e-0000-4000-8000-000000000001' } });
    assert.equal(withUser.ready[0].lead_creator_profile_id, '6f1c2b8e-0000-4000-8000-000000000001');
    const script = buildImport({ rows, mapping, config: CONFIG, now: null });
    assert.deepEqual(script.ready[0], { customer_name: 'Ravi', custom_fields: {}, stage: 'LEADS' });
    assert.throws(() => buildImport({ rows, mapping: [null], config: CONFIG }), /customer name/);
});

test('a header row below a title row, with spreadsheet row numbers', () => {
    const rows = [['ABC Solar customer list'], HEADER, ['Ravi', '9876543210'], ['', '']];
    const mapping = guessMapping(HEADER, TARGETS);
    const result = buildImport({ rows, headerRow: 1, rowNumbers: [1, 3, 4, 9], mapping, config: CONFIG, now: NOW });
    assert.deepEqual(result.readyRowNumbers, [4]);
    assert.equal(result.counts.rows, 1);
});
