// Fake customers for trying out a client app.
//
//   node scripts/make-test-data.mjs <client.config.js> [--count 500] [--today 2026-10-14] [--out dir]
//
// Writes two SQL files to paste into that client's Supabase SQL Editor (after
// backend/setup.sql): <slug>-test-data.sql adds the customers, and
// <slug>-remove-test-data.sql takes every one of them out again.
//
// The data is made up and cannot reach a real person: phone numbers start
// with 5 (no Indian mobile does), emails use example.com, and every row is
// marked (custom_fields.test_seed, '[test data]' notes, TEST- SKUs) so the
// removal file deletes exactly what this file added. The output is the same
// on every run, and running it twice adds nothing new.

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveClientConfig, REQUIREMENT_RULES, readPath } from '../template/src/config/resolve.js';

export const TEST_SEED = 'v1';
const MARK = '[test data]';

const FIRST = ['Amit', 'Bhavesh', 'Chirag', 'Dhaval', 'Hardik', 'Jignesh', 'Kalpesh', 'Mehul', 'Nilesh', 'Paresh', 'Rakesh', 'Sanjay',
    'Tushar', 'Vipul', 'Yogesh', 'Asha', 'Bhavna', 'Daksha', 'Hetal', 'Jinal', 'Komal', 'Mital', 'Nisha', 'Priya', 'Riddhi', 'Sejal'];
const LAST = ['Patel', 'Shah', 'Desai', 'Mehta', 'Joshi', 'Parmar', 'Chauhan', 'Solanki', 'Trivedi', 'Pandya', 'Rathod', 'Bhatt',
    'Modi', 'Vyas', 'Thakkar', 'Prajapati'];
const PLACES = [
    ['Adajan', 'Surat', 'Surat City', '395009'], ['Vesu', 'Surat', 'Surat City', '395007'], ['Kamrej', 'Surat', 'Kamrej', '394185'],
    ['Bardoli', 'Surat', 'Bardoli', '394601'], ['Navsari', 'Navsari', 'Navsari', '396445'], ['Bilimora', 'Navsari', 'Gandevi', '396321'],
    ['Valsad', 'Valsad', 'Valsad', '396001'], ['Vapi', 'Valsad', 'Vapi', '396191'], ['Bharuch', 'Bharuch', 'Bharuch', '392001'],
    ['Ankleshwar', 'Bharuch', 'Ankleshwar', '393001'], ['Vadodara', 'Vadodara', 'Vadodara City', '390007'], ['Anand', 'Anand', 'Anand', '388001'],
];
const PARTNERS = ['SUNRISE SOLAR', 'GREEN ROOF ENERGY', 'SURYA POWER POINT', 'KIRAN SOLAR WORKS'];
const DEALERS = ['Ketan Dealer', 'Mansi Dealer', 'Rohit Dealer', 'Pooja Dealer', 'Imran Dealer', 'Neel Dealer'];
const VENDORS = ['Shree Installers (test)', 'Om Sai Solar Fitters (test)', 'Jay Ambe Electricals (test)', 'Rudra Rooftop Team (test)'];
const STOCK = [
    ['Solar Panel', 'Nos', 'Panels', 240, 40], ['Inverter', 'Nos', 'Inverters', 26, 5], ['ACDB', 'No.', 'Electrical', 30, 6],
    ['DCDB', 'No.', 'Electrical', 30, 6], ['Dc Cable', 'MTR', 'Cables', 2200, 300], ['Ac Cable', 'MTR', 'Cables', 1800, 300],
    ['Earthing Kit + LA', 'No.', 'Earthing', 60, 10], ['Mid Clamp', 'No.', 'Structure', 900, 150], ['End Clamp', 'No.', 'Structure', 500, 100],
    ['Cement', 'Bag', 'Civil', 80, 20],
];

const sqlText = value => `'${String(value).replace(/\0/g, '').replace(/'/g, "''")}'`;

// Same value for the same index on every run, so a re-run never duplicates.
function stableId(name) {
    const hex = createHash('sha1').update(`solarflow-test-data:${name}`).digest('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${(8 + (parseInt(hex[16], 16) % 4)).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function random(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6D2B79F5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const addDays = (iso, days) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

// Columns sent for every customer. Each has the value the schema would give
// it by default, so customers that skip a column still look like new ones.
const DEFAULTS = {
    custom_fields: {}, stages_remarks: {}, discom_submission: {}, hold_procurement: {}, cash_details: {}, loan_history: [],
    subsidy_history: [], geo_tag_status: 'Pending', installation_status: 'Pending', delivery_status: 'PENDING',
    vendor_payment_status: 'Pending',
};

export function testDataSql(config, { count = 500, today = new Date().toISOString().slice(0, 10) } = {}) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error('today must be YYYY-MM-DD');
    const resolved = resolveClientConfig(config);
    const { features, stages, customFields, dropdowns } = resolved;
    const pick = (rand, list) => list[Math.floor(rand() * list.length)];
    const brands = dropdowns.metadata.module_brand.length ? dropdowns.metadata.module_brand : ['ADANI'];
    const wps = (dropdowns.metadata.module_wp.length ? dropdowns.metadata.module_wp : ['580']).map(Number);
    const inverters = dropdowns.metadata.inverter_make.length ? dropdowns.metadata.inverter_make : ['Goodwe'];
    const staff = dropdowns.metadata.registration_by.length ? dropdowns.metadata.registration_by : ['Office team'];
    const subsidyTags = dropdowns.tags.subsidy_tags;
    const loanTags = dropdowns.tags.loan_tags;
    const partnersOn = features.channelPartners || features.cpos;
    const dealersOn = features.dealers;
    const loanOn = stages.some(stage => stage.id === 'LOAN');
    const cashOn = stages.some(stage => stage.id === 'CASH');

    const flow = stages.filter(stage => !stage.terminal);
    // More customers in early stages, as in a real pipeline; about 1 in 7 completed, 1 in 20 lost.
    const weights = flow.map((_, index) => Math.max(1, flow.length - index * 0.6));
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    const chooseStage = rand => {
        const roll = rand();
        if (roll < 0.14 && stages.some(stage => stage.id === 'COMPLETED')) return 'COMPLETED';
        if (roll < 0.19 && stages.some(stage => stage.id === 'LOST PROJECT')) return 'LOST PROJECT';
        let left = rand() * totalWeight;
        for (let i = 0; i < flow.length; i += 1) { left -= weights[i]; if (left <= 0) return flow[i].id; }
        return flow[0].id;
    };

    const customValue = (field, rand, date) => {
        switch (field.type) {
            case 'date': return date;
            case 'yesno': return rand() < 0.85 ? 'Yes' : 'No';
            case 'select': return field.options?.length ? pick(rand, field.options) : null;
            case 'number': return Math.round(rand() * 100);
            case 'money': return Math.round(rand() * 50) * 1000;
            case 'phone': return `5${String(Math.floor(rand() * 1e9)).padStart(9, '0')}`;
            case 'file': return null;
            case 'textarea': return `Checked on site. ${MARK}`;
            default: return 'Done';
        }
    };

    const rows = [];
    const sites = [];
    for (let i = 0; i < count; i += 1) {
        const rand = random(i * 7919 + 17);
        const name = `${pick(rand, FIRST)} ${pick(rand, LAST)}`;
        const [village, district, subDivision, pincode] = pick(rand, PLACES);
        const ageDays = Math.floor(rand() * 270);
        const createdOn = addDays(today, -ageDays);
        const wp = pick(rand, wps);
        const modules = 4 + Math.floor(rand() * 9);
        const paymentType = loanOn && (!cashOn || rand() < 0.65) ? 'Loan' : 'Cash';
        const row = {
            ...structuredClone(DEFAULTS),
            id: stableId(`customer:${i}`),
            customer_name: name,
            phone_number: `5${String(1e8 + i * 9973).slice(-9)}`,
            email_address: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}.${i}@example.com`,
            consumer_no: String(31000000000 + i * 137),
            villages: village, district, sub_divisions: subDivision, pincode,
            full_address: `${10 + (i % 90)}, Test Society, ${village}`,
            module_brand: pick(rand, brands), module_wp: wp, no_of_modules: modules,
            system_capacity_kwp: Math.round((wp * modules) / 10) / 100,
            payment_type: paymentType,
            created_at: `${createdOn}T${String(9 + (i % 9)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00+05:30`,
            updated_at: `${createdOn}T18:00:00+05:30`,
        };
        if (partnersOn && rand() < 0.45) {
            row.channel_partner = pick(rand, PARTNERS);
            if (dealersOn && rand() < 0.6) row.sub_channel_partner = pick(rand, DEALERS);
        }
        let stage = chooseStage(rand);
        const target = stages.find(item => item.id === stage);
        if (target?.hideWhenPaymentType?.includes(paymentType.toLowerCase())) stage = flow[Math.max(0, flow.indexOf(target) - 1)].id;
        row.stage = stage;

        // Fill in what every stage before this one needs, as if the team had done it.
        const reached = stage === 'LOST PROJECT' ? flow.findIndex(item => item.id === flow[Math.floor(rand() * flow.length)].id) : stages.findIndex(item => item.id === stage);
        const passed = stages.slice(0, Math.max(0, reached)).filter(item => !item.terminal && !(item.hideWhenPaymentType || []).includes(paymentType.toLowerCase()));
        let day = 0;
        const stepDate = () => addDays(createdOn, Math.min(ageDays, (day += 3 + Math.floor(rand() * 6))));
        const vendor = pick(rand, VENDORS);
        for (const item of passed) {
            const date = stepDate();
            switch (item.id) {
                case 'REGISTRATION':
                    row.registration_date = date; row.registration_by = pick(rand, staff);
                    row.registration_no = `FS/${createdOn.slice(0, 4)}/${1000 + i}`; row.folder_no = String(500 + i); break;
                case 'LOAN':
                    row.jansamarth_application_no = `JSM${String(700000 + i * 31)}`; row.loan_registration_date = date;
                    row.bank_name = pick(rand, ['SBI', 'Bank of Baroda', 'Union Bank']); row.loan_tag = 'Total Loan Payment Received'; break;
                case 'CASH':
                    row.cash_details = { total_amount: modules * 32000, payments: [{ name: '1st Payment', amount: modules * 32000, type: 'Online / UPI', date }] }; break;
                case 'MATERIAL ORDER':
                    row.roof_shed = rand() < 0.8 ? 'Roof' : 'Shed'; row.invoice_value = modules * 30000; row.dc_cable = 30; row.ac_cable = 25; break;
                case 'MATERIAL INTEGRATION':
                    row.inverter_make = pick(rand, inverters); row.inverter_serial_no = `INV-T${String(100000 + i)}`; break;
                case 'MATERIAL DELIVERY':
                    row.vendor = vendor; row.material_delivery_date = date; row.delivery_status = 'DELIVERED';
                    row.vehicle_number = `GJ-05-TT-${String(1000 + (i % 9000))}`; break;
                case 'INSTALLATION STATUS':
                    row.installation_status = 'Installed'; row.installation_date = date; row.vendor ||= vendor; break;
                case 'GEO TAG PHOTO':
                    row.geo_tag_status = 'Proceed'; break;
                case 'DISCOM SUBMISSION':
                    row.discom_submission = { submitted_by: pick(rand, staff), date }; break;
                case 'METER INSTALLATION':
                    row.meter_installation = 'Yes'; row.installation_date ||= date; break;
                case 'DISCOM INSPECTION':
                    row.discom_inspection = 'Yes'; break;
                case 'SUBSIDY STATUS':
                    row.subsidy_tag = 'Received'; row.subsidy_history = [{ status: 'Received', date, remark: MARK }]; break;
                default: break;
            }
            // Extra fields of passed stages, and any requirement still unmet.
            for (const field of customFields.filter(f => f.stage === item.id)) {
                const value = customValue(field, rand, date);
                if (value !== null) row.custom_fields[field.key] = value;
            }
            for (const [path, , rule = 'present'] of item.requirements) {
                if ((REQUIREMENT_RULES[rule] || REQUIREMENT_RULES.present)(readPath(row, path))) continue;
                if (path.startsWith('custom_fields.')) row.custom_fields[path.slice(14)] = rule === 'yes' ? 'Yes' : date;
                else row[path] = rule === 'yes' ? 'Yes' : rule === 'positive' ? 100000 : rule === 'proceed' ? 'Proceed' : rule === 'paymentType' ? paymentType : date;
            }
        }
        // Work in progress in the current stage.
        if (stage === 'LOAN') row.loan_tag = pick(rand, loanTags.filter(tag => !tag.isFinal)).id;
        if (stage === 'SUBSIDY STATUS') row.subsidy_tag = pick(rand, subsidyTags.filter(tag => !tag.isFinal)).id;
        if (stage === 'INSTALLATION STATUS') { row.vendor ||= vendor; row.installation_status = rand() < 0.5 ? 'In process' : 'Pending'; }
        if (stage === 'MATERIAL DELIVERY' && rand() < 0.5) row.vendor = vendor;
        if (stage === 'COMPLETED') row.completed_at = `${addDays(createdOn, Math.min(ageDays, day + 5))}T17:00:00+05:30`;
        if (stage === 'LOST PROJECT') {
            const origin = (passed.at(-1) || flow[0]).id;
            row.hold_procurement = { previous_stage: origin, hold_date: stepDate(), hold_status: 'Project Lost', comment: `Customer postponed. ${MARK}` };
        }
        if (features.installationCommission && row.vendor && row.installation_status === 'Installed') {
            row.vendor_quote = Math.round(row.system_capacity_kwp * 2000);
            if (rand() < 0.5) { row.vendor_payment_status = 'Paid'; row.vendor_paid_date = row.installation_date; row.vendor_paid_by = 'Accounts (test)'; }
        }
        row.custom_fields.test_seed = TEST_SEED;
        rows.push(row);
        if (sites.length < 8 && ['LEADS', 'REGISTRATION', 'SITE SURVEY'].includes(stage)) sites.push(row);
    }

    const columns = [...new Set(rows.flatMap(Object.keys))].sort();
    for (const row of rows) for (const column of columns) if (!(column in row)) row[column] = null;
    // Columns the schema fills by default must keep that default, never null.
    for (const [column, value] of Object.entries(DEFAULTS)) for (const row of rows) if (row[column] === null) row[column] = structuredClone(value);

    const out = [];
    out.push(`-- ${count} made-up customers for ${resolved.client.name}. ${MARK}`);
    out.push('-- Run after backend/setup.sql, in the Supabase SQL Editor. Running it twice adds nothing new.');
    out.push('-- To take it all out again, run the matching remove-test-data file.');
    out.push('begin;');
    out.push('');
    out.push(`insert into public.vendors (name, phone) values ${VENDORS.map((name, i) => `(${sqlText(name)}, '55500000${i + 1}0')`).join(', ')} on conflict (name) do nothing;`);
    out.push('');
    for (let start = 0; start < rows.length; start += 50) {
        const batch = rows.slice(start, start + 50);
        out.push(`insert into public.admin (${columns.join(', ')})`);
        // Missing keys read as null, so null values are left out to keep the file small.
        const compact = batch.map(row => Object.fromEntries(Object.entries(row).filter(([, value]) => value !== null)));
        out.push(`select ${columns.join(', ')} from jsonb_populate_recordset(null::public.admin, ${sqlText(JSON.stringify(compact))}::jsonb)`);
        out.push('on conflict (id) do nothing;');
    }
    if (features.inventory) {
        out.push('');
        out.push('insert into public.inventory_items (item_key, sku, product_name, uom, category, stock_on_hand, reorder_level) values');
        out.push(STOCK.map(([product, uom, category, stock, reorder], i) => `  (public.inventory_item_key(${sqlText(product)}, ${sqlText(uom)}), 'TEST-${String(i + 1).padStart(3, '0')}', ${sqlText(product)}, ${sqlText(uom)}, ${sqlText(category)}, ${stock}, ${reorder})`).join(',\n'));
        out.push('on conflict do nothing;');
    }
    if (features.calendar) {
        const events = [
            ...sites.slice(0, 6).map((row, i) => ({ id: stableId(`event:site:${i}`), title: `Site visit: ${row.customer_name}`, kind: 'site_visit', starts_on: addDays(today, 1 + i), start_time: `${10 + i}:00`, customer_id: row.id, vendor_name: null })),
            { id: stableId('event:meeting'), title: 'Weekly team meeting', kind: 'meeting', starts_on: addDays(today, 2), start_time: '09:30', customer_id: null, vendor_name: null },
            { id: stableId('event:followup'), title: 'Call back loan customers', kind: 'follow_up', starts_on: addDays(today, 3), start_time: null, customer_id: null, vendor_name: null },
            { id: stableId('event:unavailable'), title: `${VENDORS[0]} not available`, kind: 'unavailable', starts_on: addDays(today, 4), start_time: null, customer_id: null, vendor_name: VENDORS[0] },
        ];
        out.push('');
        out.push('insert into public.calendar_events (id, title, kind, starts_on, start_time, notes, customer_id, vendor_name, created_by_name) values');
        out.push(events.map(event => `  ('${event.id}', ${sqlText(event.title)}, '${event.kind}', '${event.starts_on}', ${event.start_time ? `'${event.start_time}'` : 'null'}, ${sqlText(MARK)}, ${event.customer_id ? `'${event.customer_id}'` : 'null'}, ${event.vendor_name ? sqlText(event.vendor_name) : 'null'}, 'Test data')`).join(',\n'));
        out.push('on conflict (id) do nothing;');
    }
    out.push('');
    out.push('commit;');
    return `${out.join('\n')}\n`;
}

export function removeTestDataSql() {
    return [
        `-- Removes everything the test-data file added. ${MARK}`,
        'begin;',
        `delete from public.calendar_events where notes = ${sqlText(MARK)};`,
        "delete from public.admin where custom_fields ->> 'test_seed' is not null;",
        "delete from public.inventory_items i where i.sku like 'TEST-%' and not exists (select 1 from public.inventory_movements m where m.item_id = i.id);",
        `delete from public.vendors where name in (${VENDORS.map(sqlText).join(', ')});`,
        'commit;',
        '',
    ].join('\n');
}

async function main(argv) {
    const [configPath, ...rest] = argv;
    if (!configPath) throw new Error('Usage: node scripts/make-test-data.mjs <client.config.js> [--count 500] [--today YYYY-MM-DD] [--out dir]');
    const option = name => { const i = rest.indexOf(name); return i === -1 ? undefined : rest[i + 1]; };
    const { default: config } = await import(pathToFileURL(resolve(configPath)).href);
    const count = Number(option('--count') ?? 500);
    if (!Number.isInteger(count) || count < 1 || count > 5000) throw new Error('--count must be between 1 and 5000');
    const outDir = option('--out') ?? 'client-zips';
    const slug = config.client?.slug || 'client';
    mkdirSync(outDir, { recursive: true });
    const dataPath = join(outDir, `${slug}-test-data.sql`);
    const removePath = join(outDir, `${slug}-remove-test-data.sql`);
    writeFileSync(dataPath, testDataSql(config, { count, today: option('--today') }));
    writeFileSync(removePath, removeTestDataSql());
    console.log(`✓ ${dataPath}\n✓ ${removePath}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
    main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exit(1); });
}
