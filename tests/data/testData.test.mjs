import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { newDb, schema, rows, one, as, addAuthUser } from '../backend/pg.mjs';
import { setupSql } from '../../template/backend/seed.js';
import { resolveClientConfig, REQUIREMENT_RULES, readPath } from '../../template/src/config/resolve.js';
import { submissionToClientConfig } from '../../builder/src/catalog/submission.js';
import { testDataSql, removeTestDataSql } from '../../scripts/make-test-data.mjs';

const answers = JSON.parse(await readFile(new URL('../../client-zips/test-client-answers.json', import.meta.url), 'utf8').catch(() => 'null'));
const fixture = JSON.parse(await readFile(new URL('../builder/fixtures/submission.json', import.meta.url), 'utf8'));
const config = submissionToClientConfig((answers || fixture).submission || answers || fixture);
const resolved = resolveClientConfig(config);
const TODAY = '2026-10-14';

const setUp = async () => {
    const db = await newDb();
    const owner = await addAuthUser(db, config.client.ownerEmail || 'owner@example.com');
    await db.exec(setupSql({ schema, config }));
    return { db, owner };
};

test('the same input gives the same file, and there is nothing real in it', () => {
    const sql = testDataSql(config, { count: 120, today: TODAY });
    assert.equal(sql, testDataSql(config, { count: 120, today: TODAY }));
    const phones = [...sql.matchAll(/"phone_number":"(\d+)"/g)].map(match => match[1]);
    assert.equal(phones.length, 120);
    assert.ok(phones.every(phone => /^5\d{9}$/.test(phone)), 'no phone number can belong to a real Indian mobile');
    const emails = [...sql.matchAll(/"email_address":"([^"]+)"/g)].map(match => match[1]);
    assert.ok(emails.every(email => email.endsWith('@example.com')));
});

test('500 customers load (twice adds nothing), every stage gets some, and each has what its earlier stages need', async () => {
    const { db, owner } = await setUp();
    const sql = testDataSql(config, { count: 500, today: TODAY });
    await db.exec(sql);
    await db.exec(sql);
    const customers = await rows(db, 'select * from public.admin');
    assert.equal(customers.length, 500);
    assert.ok(customers.every(customer => customer.custom_fields.test_seed === 'v1'));

    const byStage = Object.groupBy(customers, customer => customer.stage);
    for (const stage of resolved.stages) assert.ok(byStage[stage.id]?.length, `no customers in ${stage.id}`);

    for (const customer of customers) {
        const index = resolved.stages.findIndex(stage => stage.id === customer.stage);
        if (customer.stage === 'LOST PROJECT') {
            assert.ok(customer.hold_procurement.previous_stage);
            continue;
        }
        for (const stage of resolved.stages.slice(0, index)) {
            if (stage.terminal || (stage.hideWhenPaymentType || []).includes(String(customer.payment_type).toLowerCase())) continue;
            for (const [path, label, rule = 'present'] of stage.requirements) {
                assert.ok((REQUIREMENT_RULES[rule] || REQUIREMENT_RULES.present)(readPath(customer, path)),
                    `${customer.customer_name} (${customer.stage}) is missing ${label} from ${stage.id}`);
            }
        }
    }
    // Schema defaults still hold for columns a customer did not set.
    assert.equal((await one(db, "select count(*)::int as n from public.admin where geo_tag_status is null or delivery_status is null or discom_agreement is null")).n, 0);

    // The owner (head office) sees every test customer through the normal rules.
    const seen = await as(db, owner, tx => one(tx, 'select count(*)::int as n from public.admin'));
    assert.equal(seen.n, 500);
    // Stage moves work on the loaded data.
    const lead = customers.find(customer => customer.stage === 'LEADS');
    await as(db, owner, tx => tx.query('select public.move_stage($1, $2, $3)', [lead.id, resolved.stages[1].id, 'LEADS']));
});

test('the remove file takes out exactly what was added', async () => {
    const { db } = await setUp();
    await db.query("insert into public.admin (customer_name, phone_number) values ('Real customer', '9800000000')");
    await db.query("insert into public.vendors (name) values ('Real installer')");
    await db.exec(testDataSql(config, { count: 50, today: TODAY }));
    await db.exec(removeTestDataSql());
    assert.deepEqual((await rows(db, 'select customer_name from public.admin')).map(row => row.customer_name), ['Real customer']);
    assert.deepEqual((await rows(db, 'select name from public.vendors')).map(row => row.name), ['Real installer']);
    assert.equal((await one(db, "select count(*)::int as n from public.calendar_events")).n, 0);
    assert.equal((await one(db, "select count(*)::int as n from public.inventory_items where sku like 'TEST-%'")).n, 0);
});
