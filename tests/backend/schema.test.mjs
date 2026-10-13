import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { SUPABASE_STUB } from './supabaseStub.mjs';
import { configSeedSql, setupSql, README_PLACEHOLDERS } from '../../template/backend/seed.js';
import { defaultClientConfig } from '../../template/src/config/resolve.js';
import { METADATA_CATEGORIES, DROPDOWN_CATALOG } from '../../template/src/config/catalog/dropdowns.js';

const schema = await readFile(new URL('../../template/backend/schema.sql', import.meta.url), 'utf8');

const OWNER = 'owner@client.test';
const customConfig = () => {
    const base = defaultClientConfig();
    return {
        ...base,
        client: { name: "Surya O'Brien Solar", slug: 'surya-obrien', ownerEmail: ' Owner@Client.test ' },
        features: {
            ...base.features,
            loanTracking: false, cashPayments: true, vendorLogin: true, inventory: true, deliveryBatches: true,
            cpos: true, branches: true, dealers: true, channelPartners: true,
        },
        pipeline: {
            ...base.pipeline,
            stages: [
                ...base.pipeline.stages.slice(0, 2),
                { id: 'SITE SURVEY', label: 'Site survey', custom: true, group: 'enquiry' },
                ...base.pipeline.stages.slice(2),
            ],
        },
        customFields: [{ key: 'survey_date', label: 'Survey date', type: 'date', stage: 'SITE SURVEY' }],
        dropdowns: { ...base.dropdowns, module_brand: ['ADANI', "Ravi's Panels", "x'); drop table public.admin; --"] },
    };
};

const newDb = async () => {
    const db = new PGlite();
    await db.exec(SUPABASE_STUB);
    return db;
};
const rows = async (tx, sql, params) => (await tx.query(sql, params)).rows;
const one = async (tx, sql, params) => (await rows(tx, sql, params))[0];

// Runs fn inside a transaction as a signed-in user (or anon when uid is null),
// the way PostgREST does: role switch plus request.jwt.claims.
const as = (db, uid, fn) => db.transaction(async tx => {
    await tx.query("select set_config('request.jwt.claims', $1, true)",
        [JSON.stringify(uid ? { sub: uid, role: 'authenticated' } : { role: 'anon' })]);
    await tx.exec(`set local role ${uid ? 'authenticated' : 'anon'}`);
    return fn(tx);
});

const addAuthUser = async (db, email, appMeta = {}, createdAt = new Date().toISOString()) => {
    const id = randomUUID();
    await db.query('insert into auth.users(id, email, raw_app_meta_data, created_at) values ($1, $2, $3, $4)',
        [id, email, JSON.stringify(appMeta), createdAt]);
    return id;
};
const viaAddUser = (userType, extra = {}) => ({ created_via: 'add_user', user_type: userType, ...extra });
const profile = async (db, id) => one(db, 'select * from public.profiles where id = $1', [id]);

// ── Fresh database with users that existed before setup, custom config ──
const db = await newDb();
const people = {};
people.stranger = await addAuthUser(db, 'early@client.test', {}, '2026-01-01T00:00:00Z');
people.owner = await addAuthUser(db, OWNER, {}, '2026-01-02T00:00:00Z');

test('schema.sql runs twice and waits for the seed before creating profiles', async () => {
    await db.exec(schema);
    await db.exec(schema);
    assert.equal((await one(db, 'select count(*)::int n from public.profiles')).n, 0);
    assert.equal((await one(db, "select count(*)::int n from storage.buckets where id = 'customer-documents' and not public")).n, 1);
    const published = (await rows(db, "select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1")).map(r => r.tablename);
    assert.deepEqual(published, ['activity_log', 'admin', 'calendar_events', 'delivery_batches', 'team_chat_messages']);
});

test('setupSql with a customised config runs twice; values are stored verbatim', async () => {
    const sql = setupSql({ schema, config: customConfig() });
    await db.exec(sql);
    await db.exec(sql);

    const settings = Object.fromEntries((await rows(db, 'select key, value from public.app_settings')).map(r => [r.key, r.value]));
    assert.equal(settings.owner_email, OWNER);
    assert.deepEqual(settings.client, { name: "Surya O'Brien Solar", slug: 'surya-obrien' });
    assert.ok(settings.pipeline.stages.includes('SITE SURVEY'));
    assert.ok(!settings.pipeline.stages.includes('LOAN'));
    assert.deepEqual(settings.pipeline.terminal, ['COMPLETED', 'LOST PROJECT']);
    assert.equal(settings.features.inventory, true);
    assert.equal(settings.features.loanTracking, false);

    const enabled = (await rows(db, 'select user_type from public.app_roles where enabled order by sort_order')).map(r => r.user_type);
    assert.deepEqual(enabled, ['admin', 'sales', 'channel_partner_office', 'office2', 'agent2', 'agent', 'vendor']);

    const brands = (await rows(db, "select label, sort_order from public.metadata where category = 'module_brand' order by sort_order"));
    assert.deepEqual(brands.map(r => r.label), ['ADANI', "Ravi's Panels", "x'); drop table public.admin; --"]);
    assert.deepEqual(brands.map(r => r.sort_order), [1, 2, 3]);
    assert.ok(await one(db, "select to_regclass('public.admin') as t").then(r => r.t));
});

test('pre-existing users: the owner becomes admin, an earlier stranger stays inactive', async () => {
    assert.equal((await profile(db, people.owner)).user_type, 'admin');
    assert.equal((await profile(db, people.owner)).status, 'active');
    assert.equal((await profile(db, people.stranger)).status, 'inactive');
});

test('new users: add_user app_metadata sets the role; everyone else is inactive', async () => {
    people.sales = await addAuthUser(db, 'sales@client.test', viaAddUser('sales'));
    people.cpo = await addAuthUser(db, 'cpo@client.test', viaAddUser('channel_partner_office', { name: 'SUNRISE OFFICE', channel_partner: 'SUNRISE' }));
    people.manager = await addAuthUser(db, 'manager@client.test', viaAddUser('office2', { channel_partner: 'SUNRISE', parent_profile_id: people.cpo }));
    people.dealer = await addAuthUser(db, 'dealer@client.test', viaAddUser('agent2', { name: 'DEALER ONE', channel_partner: 'SUNRISE', parent_profile_id: people.cpo }));
    people.otherCpo = await addAuthUser(db, 'moon@client.test', viaAddUser('channel_partner_office', { channel_partner: 'MOON' }));
    people.otherDealer = await addAuthUser(db, 'moondealer@client.test', viaAddUser('agent2', { name: 'MOON DEALER', channel_partner: 'MOON', parent_profile_id: people.otherCpo }));
    people.agent = await addAuthUser(db, 'agent@client.test', viaAddUser('agent', { name: 'AGENT A' }));
    people.agent2 = await addAuthUser(db, 'agentb@client.test', viaAddUser('agent', { name: 'AGENT B' }));
    people.vendor = await addAuthUser(db, 'vendor1@client.test', viaAddUser('vendor', { name: 'VENDOR ONE' }));
    people.signup = await addAuthUser(db, 'someone@gmail.test');
    people.fakeAdmin = await addAuthUser(db, 'sneaky@client.test', viaAddUser('admin_typo'));
    people.stamp = await addAuthUser(db, 'stamp@client.test', viaAddUser('stamp'));

    assert.equal((await profile(db, people.sales)).user_type, 'sales');
    assert.equal((await profile(db, people.sales)).status, 'active');
    const manager = await profile(db, people.manager);
    assert.equal(manager.user_type, 'office2');
    assert.equal(manager.parent_profile_id, people.cpo);
    assert.equal(manager.cpo_profile_id, people.cpo);
    assert.equal((await profile(db, people.cpo)).cpo_profile_id, people.cpo);
    assert.equal((await profile(db, people.dealer)).name, 'DEALER ONE');
    for (const id of [people.signup, people.fakeAdmin, people.stamp]) {
        assert.equal((await profile(db, id)).status, 'inactive', 'unknown, invalid or disabled roles stay inactive');
    }
    assert.equal((await profile(db, people.signup)).user_type, 'sales');
});

test('app_metadata written after the insert (Supabase admin API order) still applies', async () => {
    const id = await addAuthUser(db, 'late@client.test');
    assert.equal((await profile(db, id)).status, 'inactive');
    await db.query('update auth.users set raw_app_meta_data = $2 where id = $1',
        [id, JSON.stringify({ provider: 'email', ...viaAddUser('vendor', { name: 'VENDOR TWO' }) })]);
    const p = await profile(db, id);
    assert.equal(p.user_type, 'vendor');
    assert.equal(p.status, 'active');
    people.vendor2 = id;
    // An active login is never changed by a later app_metadata update.
    await db.query("update auth.users set raw_app_meta_data = '{}' where id = $1", [people.owner]);
    await db.query('update auth.users set raw_app_meta_data = $2 where id = $1', [people.owner, JSON.stringify(viaAddUser('vendor'))]);
    assert.equal((await profile(db, people.owner)).user_type, 'admin');
});

const customers = {};
const insertCustomer = (uid, values) => as(db, uid, async tx => (await one(tx,
    'insert into public.admin(customer_name, vendor, channel_partner, sub_channel_partner) values ($1, $2, $3, $4) returning *',
    [values.name, values.vendor ?? null, values.channel_partner ?? null, values.sub_channel_partner ?? null])));

test('lead creation: partner logins always create leads as themselves', async () => {
    await as(db, people.owner, async tx => {
        await tx.query("insert into public.vendors(name, email, profile_id) values ('Vendor One', 'vendor1@client.test', $1)", [people.vendor]);
        await tx.query("insert into public.vendors(name, email) values ('Vendor Two', 'nobody@client.test')");
    });
    customers.admin = await insertCustomer(people.owner, { name: 'Head office lead', vendor: 'vendor one' });
    customers.vendor2 = await insertCustomer(people.owner, { name: 'Other vendor lead', vendor: 'Vendor Two' });
    customers.cpo = await insertCustomer(people.cpo, { name: 'CPO lead', channel_partner: 'MOON' });
    customers.manager = await insertCustomer(people.manager, { name: 'Manager lead' });
    customers.dealer = await insertCustomer(people.dealer, { name: 'Dealer lead', channel_partner: 'MOON', sub_channel_partner: 'MOON DEALER' });
    customers.otherDealer = await insertCustomer(people.otherDealer, { name: 'Moon dealer lead' });
    customers.agent = await insertCustomer(people.agent, { name: 'Agent lead', channel_partner: 'SUNRISE' });

    assert.equal(customers.admin.lead_creator_profile_id, people.owner);
    assert.equal(customers.cpo.lead_creator_profile_id, people.cpo);
    assert.equal(customers.cpo.channel_partner, 'SUNRISE');
    assert.equal(customers.manager.lead_creator_profile_id, people.cpo);
    assert.equal(customers.dealer.lead_creator_profile_id, people.dealer);
    assert.equal(customers.dealer.channel_partner, 'SUNRISE');
    assert.equal(customers.dealer.sub_channel_partner, 'DEALER ONE');
    assert.equal(customers.agent.lead_creator_profile_id, people.agent);
    assert.equal(customers.agent.channel_partner, 'AGENT A');

    await assert.rejects(insertCustomer(people.vendor, { name: 'Vendor lead', vendor: 'Vendor One' }), /row-level security/);
    await assert.rejects(insertCustomer(people.signup, { name: 'Inactive lead' }), /row-level security/);
    await assert.rejects(as(db, people.agent, tx => tx.query('update public.admin set lead_creator_profile_id = $2 where id = $1',
        [customers.agent.id, people.agent2])), /head office/);
});

const visibleNames = (uid, source = 'admin') => as(db, uid, async tx => (await rows(tx, `select customer_name from public.${source} order by customer_name`)).map(r => r.customer_name));

test('customer visibility follows the login type', async () => {
    const all = ['Agent lead', 'CPO lead', 'Dealer lead', 'Head office lead', 'Manager lead', 'Moon dealer lead', 'Other vendor lead'];
    assert.deepEqual(await visibleNames(people.owner), all);
    assert.deepEqual(await visibleNames(people.sales), all);
    assert.deepEqual(await visibleNames(people.cpo), ['CPO lead', 'Dealer lead', 'Manager lead']);
    assert.deepEqual(await visibleNames(people.manager), ['CPO lead', 'Dealer lead', 'Manager lead']);
    assert.deepEqual(await visibleNames(people.otherCpo), ['Moon dealer lead']);
    assert.deepEqual(await visibleNames(people.dealer), ['Dealer lead']);
    assert.deepEqual(await visibleNames(people.agent), ['Agent lead']);
    assert.deepEqual(await visibleNames(people.agent2), []);
    assert.deepEqual(await visibleNames(people.vendor), ['Head office lead']);
    // An unclaimed directory row matches a vendor login by email or name; a
    // row linked to another login never does.
    assert.deepEqual(await visibleNames(people.vendor2), ['Other vendor lead']);
    const impostor = await addAuthUser(db, 'impostor@client.test', viaAddUser('vendor', { name: 'Vendor One' }));
    assert.deepEqual(await visibleNames(impostor), []);
    assert.deepEqual(await visibleNames(people.signup), []);
    assert.deepEqual(await visibleNames(people.stranger), []);
});

test('switching a login type off removes its database access', async () => {
    await db.query("update public.app_roles set enabled = false where user_type = 'vendor'");
    assert.deepEqual(await visibleNames(people.vendor), []);
    assert.equal((await as(db, people.vendor, tx => rows(tx, 'select * from public.metadata'))).length, 0);
    await db.query("update public.app_roles set enabled = true where user_type = 'vendor'");
    assert.deepEqual(await visibleNames(people.vendor), ['Head office lead']);
});

test('cpo_leads shows only the CPO scope and exposes custom_fields', async () => {
    assert.deepEqual(await visibleNames(people.cpo, 'cpo_leads'), ['CPO lead', 'Dealer lead', 'Manager lead']);
    assert.deepEqual(await visibleNames(people.owner, 'cpo_leads'), []);
    const columns = (await rows(db, "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'cpo_leads'")).map(r => r.column_name);
    assert.ok(columns.includes('custom_fields'));
    assert.ok(columns.includes('lead_creator_profile_id'));
});

test('writes outside your scope change nothing', async () => {
    const changed = await as(db, people.dealer, async tx => (await tx.query("update public.admin set customer_name = 'hijacked' where id = $1", [customers.otherDealer.id])).affectedRows);
    assert.equal(changed, 0);
    const deleted = await as(db, people.sales, async tx => (await tx.query('delete from public.admin where id = $1', [customers.agent.id])).affectedRows);
    assert.equal(deleted, 0, 'only an admin deletes customers');
    const vendorEdit = await as(db, people.vendor, async tx => (await tx.query("update public.admin set installation_status = 'Installed' where id = $1", [customers.admin.id])).affectedRows);
    assert.equal(vendorEdit, 1);
    await assert.rejects(as(db, people.vendor, tx => tx.query("update public.admin set vendor = 'Vendor Two' where id = $1", [customers.admin.id])), /row-level security/);
    await assert.rejects(as(db, people.agent, tx => tx.query("insert into public.activity_log(user_id, action) values ($1, 'x')", [people.owner])), /row-level security/);
});

test('documents, BOMs and storage objects follow customer visibility', async () => {
    await as(db, people.owner, async tx => {
        await tx.query("insert into public.documents(customer_id, file_name, storage_path) values ($1, 'a.pdf', $2), ($3, 'b.pdf', $4)",
            [customers.admin.id, `${customers.admin.id}/a.pdf`, customers.agent.id, `${customers.agent.id}/b.pdf`]);
        await tx.query("insert into storage.objects(bucket_id, name) values ('customer-documents', $1), ('customer-documents', $2)",
            [`${customers.admin.id}/a.pdf`, `${customers.agent.id}/b.pdf`]);
    });
    const vendorDocs = await as(db, people.vendor, async tx => (await rows(tx, 'select file_name from public.documents')).map(r => r.file_name));
    assert.deepEqual(vendorDocs, ['a.pdf']);
    const vendorObjects = await as(db, people.vendor, async tx => (await rows(tx, 'select name from storage.objects')).map(r => r.name));
    assert.deepEqual(vendorObjects, [`${customers.admin.id}/a.pdf`]);
    await assert.rejects(as(db, people.vendor, tx => tx.query("insert into storage.objects(bucket_id, name) values ('customer-documents', $1)",
        [`${customers.agent.id}/c.pdf`])), /row-level security/);
});

test('profiles: limited directory, and only admins change role, status or partner', async () => {
    const seen = async uid => as(db, uid, async tx => (await rows(tx, 'select id from public.profiles')).map(r => r.id).sort());
    assert.deepEqual(await seen(people.vendor), [people.vendor]);
    assert.deepEqual(await seen(people.cpo), [people.cpo, people.manager, people.dealer].sort());
    assert.deepEqual(await seen(people.signup), [people.signup], 'inactive users still see their own row');
    assert.ok((await seen(people.sales)).length > 10);

    for (const [column, value] of [['user_type', 'admin'], ['status', 'inactive'], ['channel_partner', 'MOON'], ['parent_profile_id', people.otherCpo], ['role', 'Admin']]) {
        await assert.rejects(as(db, people.dealer, tx => tx.query(`update public.profiles set ${column} = $2 where id = $1`, [people.dealer, value])),
            /Only an admin/, `dealer must not change own ${column}`);
    }
    assert.equal((await profile(db, people.dealer)).user_type, 'agent2');
    await as(db, people.dealer, tx => tx.query("update public.profiles set name = 'DEALER 1', phone_number = '9999999999' where id = $1", [people.dealer]));
    assert.equal((await profile(db, people.dealer)).name, 'DEALER 1');
    const otherRow = await as(db, people.dealer, async tx => (await tx.query("update public.profiles set name = 'x' where id = $1", [people.agent])).affectedRows);
    assert.equal(otherRow, 0);
    const selfActivate = await as(db, people.signup, async tx => (await tx.query("update public.profiles set status = 'active' where id = $1", [people.signup])).affectedRows);
    assert.equal(selfActivate, 0);
    assert.equal((await profile(db, people.signup)).status, 'inactive');
    const cpoEditsChild = await as(db, people.cpo, async tx => (await tx.query("update public.profiles set phone_number = '1' where id = $1", [people.dealer])).affectedRows);
    assert.equal(cpoEditsChild, 1);
    await assert.rejects(as(db, people.cpo, tx => tx.query("update public.profiles set status = 'inactive' where id = $1", [people.dealer])), /Only an admin/);
    await assert.rejects(as(db, people.vendor, tx => tx.query("insert into public.profiles(id, name, user_type, status) values ($1, 'x', 'admin', 'active')", [randomUUID()])), /permission denied/);

    await as(db, people.owner, tx => tx.query("update public.profiles set status = 'inactive' where id = $1", [people.agent2]));
    assert.equal((await profile(db, people.agent2)).status, 'inactive');
    await as(db, people.owner, tx => tx.query("update public.profiles set status = 'active' where id = $1", [people.agent2]));
    await assert.rejects(as(db, people.owner, tx => tx.query("update public.profiles set status = 'inactive' where id = $1", [people.owner])), /at least one active admin/);
});

test('anon can read nothing', async () => {
    const tables = (await rows(db, "select table_name from information_schema.tables where table_schema = 'public'")).map(r => r.table_name);
    assert.ok(tables.length >= 19);
    for (const table of tables) {
        await assert.rejects(as(db, null, tx => tx.query(`select * from public.${table} limit 1`)), /permission denied/, table);
    }
    await assert.rejects(as(db, null, tx => tx.query("select public.move_stage($1, 'LEADS', 'LEADS')", [customers.admin.id])), /permission denied/);
    await assert.rejects(as(db, null, tx => tx.query('select * from storage.objects')), /permission denied/);
});

test('move_stage accepts configured stages (incl. custom) and rejects others', async () => {
    const move = (uid, id, to, from) => as(db, uid, tx => one(tx, 'select * from public.move_stage($1, $2, $3, $4)', [id, to, from, 'note']));
    const moved = await move(people.owner, customers.admin.id, 'SITE SURVEY', 'LEADS');
    assert.equal(moved.stage, 'SITE SURVEY');
    await assert.rejects(move(people.owner, customers.admin.id, 'LOAN', 'SITE SURVEY'), /Unknown stage/);
    await assert.rejects(move(people.owner, customers.admin.id, 'NOT A STAGE', 'SITE SURVEY'), /Unknown stage/);
    await assert.rejects(move(people.owner, customers.admin.id, 'CASH', 'LEADS'), /stage changed/);
    const done = await move(people.owner, customers.admin.id, 'COMPLETED', 'SITE SURVEY');
    assert.ok(done.completed_at);
    const reopened = await move(people.owner, customers.admin.id, 'LEADS', 'COMPLETED');
    assert.equal(reopened.completed_at, null);
    await assert.rejects(move(people.dealer, customers.otherDealer.id, 'CASH', 'LEADS'), /unavailable/);
    const log = await one(db, "select * from public.activity_log where customer_id = $1 and action = 'stage_change' order by created_at limit 1", [customers.admin.id]);
    assert.equal(log.message, 'LEADS → SITE SURVEY');
    assert.equal(log.user_id, people.owner);
    // A plain update to COMPLETED stamps completed_at too.
    await as(db, people.owner, tx => tx.query("update public.admin set stage = 'COMPLETED' where id = $1", [customers.vendor2.id]));
    assert.ok((await one(db, 'select completed_at from public.admin where id = $1', [customers.vendor2.id])).completed_at);
});

test('merge_custom_fields merges and removes null keys', async () => {
    const merge = (uid, id, values) => as(db, uid, async tx => (await one(tx, 'select public.merge_custom_fields($1, $2) as v', [id, JSON.stringify(values)])).v);
    assert.deepEqual(await merge(people.cpo, customers.manager.id, { survey_date: '2026-10-01', roof: 'tin' }), { survey_date: '2026-10-01', roof: 'tin' });
    assert.deepEqual(await merge(people.cpo, customers.manager.id, { roof: null, panels: 6 }), { survey_date: '2026-10-01', panels: 6 });
    await assert.rejects(merge(people.cpo, customers.manager.id, { 'Bad Key': 1 }), /Invalid extra field key/);
    await assert.rejects(merge(people.cpo, customers.agent.id, { a1: 1 }), /unavailable/);
    const viaView = await as(db, people.cpo, tx => one(tx, 'select custom_fields from public.cpo_leads where id = $1', [customers.manager.id]));
    assert.deepEqual(viaView.custom_fields, { survey_date: '2026-10-01', panels: 6 });
});

test('calendar: everyone active reads and adds; only the creator or head office edits', async () => {
    const event = await as(db, people.vendor, tx => one(tx,
        "insert into public.calendar_events(title, kind, starts_on, vendor_name, created_by_name) values ('Away', 'unavailable', '2026-11-02', 'Vendor One', 'VENDOR ONE') returning *"));
    assert.equal(event.created_by, people.vendor);
    assert.equal((await as(db, people.dealer, tx => rows(tx, 'select id from public.calendar_events'))).length, 1);
    assert.equal((await as(db, people.signup, tx => rows(tx, 'select id from public.calendar_events'))).length, 0);
    const edit = (uid, sql) => as(db, uid, async tx => (await tx.query(sql, [event.id])).affectedRows);
    assert.equal(await edit(people.dealer, "update public.calendar_events set title = 'x' where id = $1"), 0);
    assert.equal(await edit(people.dealer, 'delete from public.calendar_events where id = $1'), 0);
    assert.equal(await edit(people.sales, "update public.calendar_events set notes = 'checked' where id = $1"), 1);
    await assert.rejects(as(db, people.dealer, tx => tx.query(
        "insert into public.calendar_events(title, starts_on, created_by) values ('x', '2026-11-03', $1)", [people.vendor])), /row-level security/);
    await assert.rejects(as(db, people.dealer, tx => tx.query(
        "insert into public.calendar_events(title, kind, starts_on) values ('x', 'party', '2026-11-03')")), /check constraint/);
    assert.equal(await edit(people.vendor, 'delete from public.calendar_events where id = $1'), 1);
});

test('staff_attendance: new statuses, and staff file only their own requests', async () => {
    await as(db, people.owner, async tx => {
        for (const [i, status] of ['pending_present', 'holiday_request', 'holiday', 'present'].entries()) {
            await tx.query('insert into public.staff_attendance(staff_name, date, status) values ($1, $2, $3)', [`STAFF ${i}`, '2026-10-12', status]);
        }
    });
    await assert.rejects(as(db, people.owner, tx => tx.query("insert into public.staff_attendance(staff_name, date, status) values ('x', '2026-10-12', 'vacation')")), /check constraint/);
    await as(db, people.dealer, tx => tx.query("insert into public.staff_attendance(user_id, staff_name, date, status) values ($1, 'DEALER 1', '2026-10-13', 'pending_present')", [people.dealer]));
    await assert.rejects(as(db, people.dealer, tx => tx.query("insert into public.staff_attendance(user_id, staff_name, date, status) values ($1, 'DEALER 1', '2026-10-14', 'present')", [people.dealer])), /row-level security/);
    await assert.rejects(as(db, people.dealer, tx => tx.query("update public.staff_attendance set status = 'present' where user_id = $1", [people.dealer])), /row-level security/);
    assert.equal((await as(db, people.dealer, tx => rows(tx, 'select * from public.staff_attendance'))).length, 1);
    assert.equal((await as(db, people.sales, tx => rows(tx, 'select * from public.staff_attendance'))).length, 5);
});

test('team chat: own messages only; admins may remove any', async () => {
    const msg = await as(db, people.dealer, tx => one(tx, "insert into public.team_chat_messages(sender_name, text) values ('DEALER 1', 'hello') returning id"));
    await assert.rejects(as(db, people.dealer, tx => tx.query("insert into public.team_chat_messages(sender_id, sender_name, text) values ($1, 'x', 'y')", [people.owner])), /row-level security/);
    assert.equal(await as(db, people.vendor, async tx => (await tx.query('delete from public.team_chat_messages where id = $1', [msg.id])).affectedRows), 0);
    assert.equal(await as(db, people.owner, async tx => (await tx.query('delete from public.team_chat_messages where id = $1', [msg.id])).affectedRows), 1);
});

const addBom = (customerId, quantity) => as(db, people.owner, async tx => {
    const bom = await one(tx, 'insert into public.bom(admin_id) values ($1) returning id', [customerId]);
    await tx.query("insert into public.bom_items(bom_id, product_name, quantity, uom, sr_no) values ($1, 'Solar Panel 550', $2, 'No.', 1)", [bom.id, quantity]);
});
const stock = async () => Number((await one(db, "select stock_on_hand from public.inventory_items where item_key = 'solar panel 550|Nos'")).stock_on_hand);

test('delivered BOM deducts stock when inventory is on, even when an installer marks it', async () => {
    await addBom(customers.admin.id, '6');
    const item = await one(db, "select id from public.inventory_items where item_key = 'solar panel 550|Nos'");
    assert.ok(item, 'saving a BOM line adds it to the catalogue');
    await as(db, people.owner, tx => tx.query("select public.record_inventory_movement($1, 'receipt', 10, 'Opening load', $2)", [item.id, randomUUID()]));
    assert.equal(await stock(), 10);
    assert.equal((await as(db, people.vendor, tx => rows(tx, 'select * from public.inventory_items'))).length, 0);

    await as(db, people.vendor, tx => tx.query("update public.admin set delivery_status = 'DELIVERED' where id = $1", [customers.admin.id]));
    assert.equal(await stock(), 4);
    const issued = await one(db, 'select bom_stock_issued_at from public.admin where id = $1', [customers.admin.id]);
    assert.ok(issued.bom_stock_issued_at);
    const movement = await one(db, "select * from public.inventory_movements where kind = 'issue'");
    assert.equal(movement.customer_id, customers.admin.id);
    await assert.rejects(db.query('delete from public.inventory_items where id = $1', [item.id]), /foreign key/);
});

test('delivered BOM is a no-op while the inventory feature is off', async () => {
    await db.query("update public.app_settings set value = value || '{\"inventory\": false}' where key = 'features'");
    await addBom(customers.cpo.id, '3');
    await as(db, people.owner, tx => tx.query("update public.admin set delivery_status = 'DELIVERED' where id = any($1)", [[customers.cpo.id, customers.manager.id]]));
    assert.equal(await stock(), 4);
    assert.equal((await one(db, 'select count(*)::int n from public.admin where bom_stock_issued_at is not null')).n, 1);
    await db.query("update public.app_settings set value = value || '{\"inventory\": true}' where key = 'features'");
});

test('delivery batch RPCs work for head office and are refused to partners', async () => {
    const batch = { id: randomUUID(), batch_no: 'T-1', status: 'IN_TRANSIT', vendor: 'Vendor One' };
    await as(db, people.sales, tx => tx.query('select public.save_delivery_batch_atomic($1, $2, $3)', [JSON.stringify(batch), [customers.agent.id], []]));
    assert.equal((await one(db, 'select delivery_batch_id from public.admin where id = $1', [customers.agent.id])).delivery_batch_id, 'T-1');
    await assert.rejects(as(db, people.agent, tx => tx.query('select public.delete_delivery_batch_atomic($1, $2)', [batch.id, [customers.agent.id]])), /unavailable/);
    await as(db, people.sales, tx => tx.query('select public.delete_delivery_batch_atomic($1, $2)', [batch.id, [customers.agent.id]]));
});

test('metrics RPCs are scoped by row-level security', async () => {
    const metrics = (uid, fn = 'get_dashboard_metrics_scoped') => as(db, uid, async tx => (await one(tx, `select public.${fn}() as m`)).m);
    assert.equal((await metrics(people.owner)).totalProjects, 7);
    assert.equal((await metrics(people.dealer)).totalProjects, 1);
    assert.equal((await metrics(people.cpo, 'get_cpo_dashboard_metrics')).totalProjects, 3);
    await assert.rejects(metrics(people.dealer, 'get_cpo_dashboard_metrics'), /partner office/);
});

test('deleting a login keeps its quotations and customers', async () => {
    await as(db, people.agent, tx => tx.query("insert into public.quotations(customer_name) values ('Quote for X')"));
    assert.equal((await as(db, people.dealer, tx => rows(tx, 'select id from public.quotations'))).length, 0);
    await db.query('delete from auth.users where id = $1', [people.agent]);
    const quote = await one(db, "select owner_id from public.quotations where customer_name = 'Quote for X'");
    assert.equal(quote.owner_id, null);
    assert.equal((await one(db, 'select lead_creator_profile_id from public.admin where id = $1', [customers.agent.id])).lead_creator_profile_id, null);
});

// ── Default config, blank owner email ─────────────────────────────────────
test('default config: setupSql runs twice; first user becomes admin when no owner email is set', async () => {
    const fresh = await newDb();
    const sql = setupSql({ schema, config: defaultClientConfig() });
    await fresh.exec(sql);
    await fresh.exec(sql);
    const pipeline = (await one(fresh, "select value from public.app_settings where key = 'pipeline'")).value;
    assert.equal(pipeline.stages.length, 16);
    assert.equal((await one(fresh, "select enabled from public.app_roles where user_type = 'vendor'")).enabled, false);
    const metadataCount = METADATA_CATEGORIES.reduce((n, id) => n + DROPDOWN_CATALOG[id].defaults.length, 0);
    assert.equal((await one(fresh, 'select count(*)::int n from public.metadata')).n, metadataCount);

    const first = await addAuthUser(fresh, 'boss@x.test');
    const second = await addAuthUser(fresh, 'next@x.test');
    const vendor = await addAuthUser(fresh, 'vendor@x.test', viaAddUser('vendor'));
    const office = await addAuthUser(fresh, 'office@x.test', viaAddUser('sales'));
    assert.equal((await profile(fresh, first)).user_type, 'admin');
    assert.equal((await profile(fresh, second)).status, 'inactive');
    assert.equal((await profile(fresh, vendor)).status, 'inactive', 'vendor logins are off in the default config');
    assert.equal((await profile(fresh, office)).status, 'active');

    // Stage ids are validated by format until a pipeline is configured.
    await fresh.query("delete from public.app_settings where key = 'pipeline'");
    const lead = await as(fresh, first, tx => one(tx, "insert into public.admin(customer_name) values ('x') returning id"));
    await as(fresh, first, tx => tx.query("select public.move_stage($1, 'ANY STAGE 2', 'LEADS')", [lead.id]));
    await assert.rejects(as(fresh, first, tx => tx.query("select public.move_stage($1, 'lower case', 'ANY STAGE 2')", [lead.id])), /Unknown stage/);
    await fresh.close();
});

test('seed SQL escapes every value from the client form', async () => {
    const config = customConfig();
    config.client = { ...config.client, name: "A'; drop table x; --\nB", ownerEmail: "o'neil@x.test" };
    const sql = configSeedSql(config);
    assert.ok(sql.includes(`('owner_email', '"o''neil@x.test"'::jsonb)`));
    assert.ok(sql.includes(`"name":"A''; drop table x; --\\nB"`));
    assert.equal(sql.split('\n')[0], "-- Settings for A'; drop table x; -- B. Safe to run again.");
    assert.equal(README_PLACEHOLDERS.OWNER_EMAIL(defaultClientConfig()), 'your own email address');
    const readme = await readFile(new URL('../../template/README.client.md', import.meta.url), 'utf8');
    const used = [...new Set([...readme.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]))].sort();
    assert.deepEqual(used, Object.keys(README_PLACEHOLDERS).sort());
    assert.equal(README_PLACEHOLDERS.CLIENT_NAME(config), "A'; drop table x; --\nB");
});

test.after(() => db.close());
