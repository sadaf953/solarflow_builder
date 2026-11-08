import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { newDb, schema, rows, one, as, addAuthUser } from '../backend/pg.mjs';
import { setupSql } from '../../template/backend/seed.js';
import { defaultClientConfig, resolveClientConfig } from '../../template/src/config/resolve.js';
import { clientConfigSource } from '../../template/src/config/serialize.js';
import { importCustomers, importSql } from '../../scripts/import-customers.mjs';
import { buildImport, detectHeaderRow, guessMapping, importTargets, readSpreadsheet } from '../../template/src/lib/import/index.js';
import { utf8, workbook } from './fixtures.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const run = promisify(execFile);
const OWNER = 'owner@surya.test';

function clientConfig() {
    const base = defaultClientConfig();
    return {
        ...base,
        client: { name: "Surya O'Brien Solar", slug: 'surya-obrien', ownerEmail: OWNER },
        features: { ...base.features, channelPartners: true, dealers: true, loanTracking: true, cashPayments: true },
        pipeline: {
            ...base.pipeline,
            stages: [...base.pipeline.stages.slice(0, 2), { id: 'SITE SURVEY', label: 'Site survey', custom: true, group: 'enquiry' }, ...base.pipeline.stages.slice(2)],
        },
        customFields: [
            { key: 'survey_date', label: 'Survey date', type: 'date', stage: 'SITE SURVEY' },
            { key: 'roof_type', label: 'Roof type', type: 'select', options: ['RCC', 'Tin shed'], stage: 'SITE SURVEY' },
            { key: 'net_meter', label: 'Net meter applied', type: 'yesno', stage: 'SITE SURVEY' },
            { key: 'sanctioned_load', label: 'Sanctioned load', type: 'number', stage: 'LEADS' },
        ],
    };
}
const CONFIG = clientConfig();

const HEADER = ['Sr No', 'Customer Name', 'Mob No', 'Consumer No', 'kW', 'Status', 'Lead Date', 'Installation Date', 'CP', 'Dealer', 'Panel Brand',
    'Survey Date', 'Roof Type', 'Net meter applied', 'Sanctioned load', 'Amount'];
const CUSTOMERS = [
    HEADER,
    [1, 'Ravi Patel', '+91 98765 43210', '', 5, 'New', '12/03/2024', '', '', '', 'adani', '', '', '', '', ''],
    [2, 'Sita Shah', 9123456789, '1234 5678 9012', 3.3, 'Done', '13/03/2024', '20/04/2024', 'Sun Power', 'Ravi Dealer', 'NewBrand', '', '', '', '', '₹ 2,40,000'],
    [3, 'Mohan Lal', '09000000001', '', '', 'Site survey', '14-03-24', '', 'SUN POWER', '', '', '15/03/2024', 'tin shed', 'haan', 7.5, ''],
    [4, 'Gita Ben', '', 'CA-55555', '', 'Cancelled', '', '', '', '', '', '', '', '', '', ''],
    [5, 'Hari Om', '9811111111', '', '', 'Something new', '', '', '', '', '', '', '', '', '', ''],
];

async function clientFolder(config = CONFIG) {
    const dir = await mkdtemp(join(tmpdir(), 'sf-import-'));
    await mkdir(join(dir, 'src/config'), { recursive: true });
    await writeFile(join(dir, 'src/config/client.config.js'), clientConfigSource(config, { generatedAt: '2026-10-20T00:00:00.000Z' }));
    return dir;
}

async function freshDb(config = CONFIG) {
    const db = await newDb();
    const owner = await addAuthUser(db, OWNER);
    await db.exec(setupSql({ schema, config }));
    // Already in SolarFlow: Ravi (same mobile, other spelling) and Mohan, who is in Trash.
    await db.query("insert into public.admin (customer_name, phone_number) values ('Ravi P', '919876543210')");
    await db.query("insert into public.admin (customer_name, phone_number, deleted_at) values ('Mohan (old)', '9000000001', now())");
    return { db, owner };
}

const names = async db => (await rows(db, 'select customer_name from public.admin where deleted_at is null order by customer_name')).map(row => row.customer_name);
const epoch = iso => Date.parse(iso) / 1000;

test('the SQL file adds the customers as the app would, and running it again adds nothing', async () => {
    const dir = await clientFolder();
    try {
        const file = join(dir, 'customers.xlsx');
        await writeFile(file, workbook({ sheets: [{ name: 'Customers', rows: CUSTOMERS }, { name: 'Notes', rows: [['a', 'b']] }] }));
        const out = join(dir, 'import.sql');
        const logged = [];
        const { written } = await importCustomers({ configInput: dir, filePath: file, out, log: (kind, text) => logged.push(`${kind}: ${text}`) });
        assert.equal(written, 5, 'the script cannot see the database, so every row is written');
        assert.ok(logged.some(line => line.includes('Using sheet "Customers"')));
        assert.ok(logged.some(line => /Customer Name\s+→ {2}Customer name/.test(line)));
        assert.ok(logged.some(line => /Done \(1\)\s+→ {2}Completed/.test(line)));
        const sql = await readFile(out, 'utf8');

        const { db, owner } = await freshDb();
        await db.exec(sql);
        assert.deepEqual(await names(db), ['Gita Ben', 'Hari Om', 'Mohan Lal', 'Ravi P', 'Sita Shah'], 'Ravi was already saved; Mohan only in Trash');

        const byName = Object.fromEntries((await rows(db, `select *, extract(epoch from created_at)::float8 as created_epoch, extract(epoch from completed_at)::float8 as completed_epoch
            from public.admin where customer_name in ('Sita Shah', 'Mohan Lal', 'Gita Ben', 'Hari Om')`)).map(row => [row.customer_name, row]));
        const sita = byName['Sita Shah'];
        assert.equal(sita.stage, 'COMPLETED');
        assert.equal(sita.phone_number, '9123456789');
        assert.equal(sita.consumer_no, '123456789012');
        assert.equal(Number(sita.system_capacity_kwp), 3.3);
        assert.equal(Number(sita.invoice_value), 240000);
        assert.equal(sita.channel_partner, 'Sun Power');
        assert.equal(sita.sub_channel_partner, 'Ravi Dealer');
        assert.equal(sita.installation_date, '2024-04-20');
        assert.equal(sita.created_epoch, epoch('2024-03-13T00:00:00+05:30'));
        assert.equal(sita.completed_epoch, epoch('2024-04-20T00:00:00+05:30'));
        assert.equal(sita.lead_creator_profile_id, null);
        assert.deepEqual(sita.custom_fields, {});
        // Schema defaults hold for columns the import did not set.
        assert.equal(sita.installation_status, 'Pending');
        assert.equal(sita.delivery_status, 'PENDING');

        const mohan = byName['Mohan Lal'];
        assert.equal(mohan.stage, 'SITE SURVEY');
        assert.deepEqual(mohan.custom_fields, { survey_date: '2024-03-15', roof_type: 'Tin shed', net_meter: 'Yes', sanctioned_load: 7.5 });
        assert.equal(mohan.created_epoch, epoch('2024-03-14T00:00:00+05:30'));
        assert.equal(byName['Gita Ben'].stage, 'LOST PROJECT');
        assert.equal(byName['Hari Om'].stage, 'LEADS');
        assert.ok(Math.abs(byName['Hari Om'].created_epoch - Date.now() / 1000) < 600, 'no date: the database stamps now()');

        const lists = await rows(db, "select category, label from public.metadata where category in ('channel_partner', 'module_brand') order by category, label");
        const partners = lists.filter(row => row.category === 'channel_partner').map(row => row.label.toLowerCase());
        assert.deepEqual(partners, ['sun power'], 'one entry for a name written in two cases');
        const brands = lists.filter(row => row.category === 'module_brand').map(row => row.label);
        assert.ok(brands.includes('NewBrand') && !brands.includes('adani'), 'a brand already listed in another case is not added twice');

        const log = await rows(db, "select message, user_id from public.activity_log where action = 'create'");
        assert.deepEqual(log, [{ message: 'Imported 4 customers from customers.xlsx (sheet "Customers")', user_id: null }]);

        await db.exec(sql);
        assert.equal((await one(db, 'select count(*)::int as n from public.admin')).n, 6);
        assert.equal((await one(db, "select count(*)::int as n from public.activity_log where action = 'create'")).n, 1, 'nothing new, nothing logged');
        assert.equal((await one(db, "select count(*)::int as n from public.metadata where category = 'channel_partner'")).n, 1);

        // Head office sees the imported customers through the normal rules, and stage moves work on them.
        assert.equal((await as(db, owner, tx => one(tx, 'select count(*)::int as n from public.admin where deleted_at is null'))).n, 5);
        await as(db, owner, tx => tx.query("select public.move_stage($1, 'REGISTRATION', 'LEADS')", [byName['Hari Om'].id]));
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test('--duplicates import keeps a customer who is already saved, and a re-run still adds nothing', async () => {
    const { db } = await freshDb();
    const { sheets } = await readSpreadsheet({ name: 'c.csv', bytes: utf8('Name,Mobile\nRavi Patel,9876543210\nRavi Patel,9876543210\n') });
    const [sheet] = sheets;
    const resolved = resolveClientConfig(CONFIG);
    const mapping = guessMapping(sheet.rows[0], importTargets(resolved));
    const result = buildImport({ rows: sheet.rows, mapping, config: resolved, now: null, duplicatePolicy: 'import' });
    assert.equal(result.ready.length, 2);
    const sql = importSql({ config: CONFIG, payloads: result.ready, duplicatePolicy: 'import', source: { file: 'c.csv' } });
    await db.exec(sql);
    await db.exec(sql);
    assert.equal((await one(db, "select count(*)::int as n from public.admin where phone_number = '9876543210'")).n, 2, 'two identical rows stay two customers, once');
});

test('cell values cannot break out of the SQL', async () => {
    const nasty = [
        "x'); drop table public.admin; --",
        '$$; drop table public.admin; $$',
        "back\\slash \\' and \\\\",
        'He said "hi" -- /* not a comment */',
        'Line one\nline two',
        `NUL\u0000here and a lone \uD800 surrogate`,
    ];
    const payloads = nasty.map((name, i) => ({ customer_name: name, phone_number: `98000000${String(i).padStart(2, '0')}`, custom_fields: { roof_type: name }, stage: 'LEADS' }));
    const sql = importSql({ config: CONFIG, payloads, source: { file: "evil';\n drop table public.admin; --.csv", sheet: "it's" } });
    assert.ok(!sql.includes('\u0000'));
    const { db } = await freshDb();
    await db.exec(sql);
    const saved = (await rows(db, "select customer_name, custom_fields ->> 'roof_type' as roof from public.admin where phone_number like '98000000%' order by phone_number"));
    const expected = nasty.map(name => name.replace('\u0000', '').toWellFormed());
    assert.deepEqual(saved.map(row => row.customer_name), expected);
    assert.deepEqual(saved.map(row => row.roof), expected);
    assert.equal(expected.at(-1), 'NULhere and a lone \uFFFD surrogate');
    const [entry] = await rows(db, "select message from public.activity_log where action = 'create'");
    assert.equal(entry.message, `Imported 6 customers from evil';  drop table public.admin; --.csv (sheet "it's")`, 'the line break became a space');

    // The same values typed into a CSV take the whole path.
    const csv = ['Name,Mobile', ...nasty.slice(0, 5).map((name, i) => `"${name.replaceAll('"', '""')}",97000000${i}0`)].join('\r\n');
    const { sheets } = await readSpreadsheet({ name: 'evil.csv', bytes: utf8(csv) });
    const resolved = resolveClientConfig(CONFIG);
    const result = buildImport({ rows: sheets[0].rows, headerRow: detectHeaderRow(sheets[0].rows), mapping: guessMapping(sheets[0].rows[0], importTargets(resolved)), config: resolved, now: null });
    await db.exec(importSql({ config: CONFIG, payloads: result.ready, source: { file: 'evil.csv' } }));
    // Names are one line of text, so the line break in the last one becomes a space.
    assert.deepEqual((await rows(db, "select customer_name from public.admin where phone_number like '97000000%' order by phone_number")).map(row => row.customer_name),
        nasty.slice(0, 5).map(name => name.replace(/\s+/g, ' ')));
});

test('what the app inserts passes row-level security for the admin, and undo moves exactly those rows to Trash', async () => {
    const { db, owner } = await freshDb();
    const resolved = resolveClientConfig(CONFIG);
    const sheet = CUSTOMERS.map(row => row.map(cell => String(cell)));
    const existing = await rows(db, 'select phone_number, consumer_no from public.admin where deleted_at is null');
    const result = buildImport({
        rows: sheet, mapping: guessMapping(sheet[0], importTargets(resolved)), config: resolved, existing,
        stageMap: { done: 'COMPLETED', 'site survey': 'SITE SURVEY', cancelled: 'LOST PROJECT' }, defaults: { lead_creator_profile_id: owner },
    });
    assert.deepEqual(result.skipped, [{ rowNumber: 2, reason: 'Already in SolarFlow (mobile 98765 43210)', duplicate: true }]);
    // The app sends batches through PostgREST: insert ... select from json_populate_recordset, as the signed-in admin.
    const columns = [...new Set(result.ready.flatMap(Object.keys))];
    const inserted = await as(db, owner, tx => rows(tx, `insert into public.admin (${columns.join(', ')})
        select ${columns.join(', ')} from jsonb_populate_recordset(null::public.admin, $1::jsonb) returning id`, [JSON.stringify(result.ready)]));
    assert.equal(inserted.length, 4);
    await as(db, owner, tx => tx.query("insert into public.activity_log (user_id, action, message) values ($1, 'create', 'Imported 4 customers from customers.xlsx')", [owner]));

    const ids = inserted.map(row => row.id);
    const moved = await as(db, owner, tx => rows(tx, 'update public.admin set deleted_at = now() where id = any($1::uuid[]) returning id', [ids]));
    assert.equal(moved.length, 4);
    assert.deepEqual(await names(db), ['Ravi P']);
    assert.equal((await one(db, 'select count(*)::int as n from public.admin where deleted_at is not null')).n, 5);
});

test('the command line: exit codes, messages and a mapping file round trip', async () => {
    const dir = await clientFolder();
    const script = join(ROOT, 'scripts/import-customers.mjs');
    const cli = args => run(process.execPath, [script, ...args], { cwd: dir });
    try {
        await writeFile(join(dir, 'leads.csv'), 'Name,Mobile,Status,Village\nRavi,9876543210,Done,Adajan\nSita,9123456789,New,Vesu\n');
        const first = await cli(['.', 'leads.csv', '--write-mapping', 'mapping.json']);
        assert.match(first.stdout, /✓ client-zips\/surya-obrien-import-customers\.sql \(2 customers\)/);
        const sql = await readFile(join(dir, 'client-zips/surya-obrien-import-customers.sql'), 'utf8');
        assert.match(sql, /^-- 2 customers for Surya O'Brien Solar, from leads\.csv\./);

        const mapping = JSON.parse(await readFile(join(dir, 'mapping.json'), 'utf8'));
        assert.deepEqual(mapping, {
            sheet: 'leads', headerRow: 1,
            columns: { Name: 'customer_name', Mobile: 'phone_number', Status: 'stage', Village: 'villages' },
            stages: { Done: 'COMPLETED', New: 'LEADS' },
            duplicates: 'skip',
        });
        mapping.columns.Village = null;
        mapping.stages.Done = 'Final Review';
        await writeFile(join(dir, 'mapping.json'), JSON.stringify(mapping));
        await cli(['src/config/client.config.js', 'leads.csv', '--mapping', 'mapping.json', '--out', 'again.sql']);
        const again = await readFile(join(dir, 'again.sql'), 'utf8');
        assert.match(again, /"stage":"FINAL REVIEW"/);
        assert.doesNotMatch(again, /Adajan/);

        mapping.columns.Mobile = 'vendor_quote';
        await writeFile(join(dir, 'bad.json'), JSON.stringify(mapping));
        await assert.rejects(cli(['.', 'leads.csv', '--mapping', 'bad.json']), error => {
            assert.equal(error.code, 1);
            assert.match(error.stderr, /✗ "vendor_quote" \(for column "Mobile"\) is not something/);
            assert.match(error.stderr, /The SQL file was not written/);
            return true;
        });

        await writeFile(join(dir, 'old.xls'), new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]));
        await assert.rejects(cli(['.', 'old.xls']), error => error.code === 1 && /old Excel 97-2003 file/.test(error.stderr));
        await writeFile(join(dir, 'nameless.csv'), 'Mobile,Village\n9876543210,Adajan\n');
        await assert.rejects(cli(['.', 'nameless.csv']), error => error.code === 1 && /customer name/.test(error.stderr) && /--write-mapping/.test(error.stderr));
        await assert.rejects(cli(['.', 'leads.csv', '--sheet', 'Nope']), error => error.code === 1 && /no sheet named "Nope"/.test(error.stderr));
        await assert.rejects(cli(['.']), error => error.code === 1 && /Usage:/.test(error.stderr));
        await assert.rejects(cli(['missing-folder', 'leads.csv']), error => error.code === 1 && /does not exist/.test(error.stderr));
        const help = await cli(['--help']).catch(error => error);
        assert.ok(!help.code, 'help exits 0');
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});
