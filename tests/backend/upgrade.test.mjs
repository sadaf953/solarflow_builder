// Re-running setup.sql on a project set up by an earlier version: columns
// added since, sign-ups stored the old way, and the README's one-off SQL.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { schema, newDb, rows, one, as, addAuthUser, viaAddUser } from './pg.mjs';
import { setupSql, README_PLACEHOLDERS } from '../../template/backend/seed.js';
import { defaultClientConfig } from '../../template/src/config/resolve.js';

const OWNER = 'owner@client.test';
const config = () => {
    const base = defaultClientConfig();
    return {
        ...base,
        client: { name: 'Sunrise Solar', slug: 'sunrise-solar', ownerEmail: OWNER },
        features: { ...base.features, channelPartners: true },
    };
};
const setup = setupSql({ schema, config: config() });

const db = await newDb();
await db.exec(setup);
const owner = await addAuthUser(db, OWNER);
const profile = id => one(db, 'select user_type, role, status from public.profiles where id = $1', [id]);

// A profile exactly as earlier versions wrote a sign-up: a switched-off Office login.
const oldSignup = async (email, appMeta) => {
    const id = await addAuthUser(db, email, appMeta);
    await db.query('delete from public.profiles where id = $1', [id]);
    await db.query("insert into public.profiles(id, name, email, user_type, role, status) values ($1, $2, $2, 'sales', 'Office', 'inactive')", [id, email]);
    return id;
};

test('a re-run adds discom_agreement to an older admin table', async () => {
    const lead = await as(db, owner, tx => one(tx, "insert into public.admin(customer_name) values ('Old lead') returning id"));
    await db.exec('drop view public.cpo_leads; alter table public.admin drop column discom_agreement;');
    await db.exec(setup);
    assert.equal((await one(db, 'select discom_agreement from public.admin where id = $1', [lead.id])).discom_agreement, false);
    await as(db, owner, tx => tx.query('update public.admin set discom_agreement = true where id = $1', [lead.id]));
    await assert.rejects(db.query('update public.admin set discom_agreement = null where id = $1', [lead.id]), /null value/);
    const viewColumns = (await rows(db, "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'cpo_leads'")).map(r => r.column_name);
    assert.ok(viewColumns.includes('discom_agreement'));
    await db.exec(setup);
    assert.equal((await one(db, 'select discom_agreement from public.admin where id = $1', [lead.id])).discom_agreement, true);
});

test('a re-run moves untouched old sign-ups to waiting for approval and leaves real logins alone', async () => {
    const signup = await oldSignup('walkin@client.test');
    const edited = await oldSignup('renamed@client.test');
    await db.query("update public.profiles set name = 'RENAMED' where id = $1", [edited]);
    const viaAddUserButInactive = await oldSignup('made@client.test', viaAddUser('sales'));
    const switchedOff = await addAuthUser(db, 'office@client.test', viaAddUser('sales'));
    await as(db, owner, tx => tx.query("update public.profiles set status = 'inactive' where id = $1", [switchedOff]));

    await db.exec(setup);
    assert.deepEqual(await profile(signup), { user_type: 'pending', role: 'Not set up', status: 'inactive' });
    for (const id of [edited, viaAddUserButInactive, switchedOff]) {
        assert.deepEqual(await profile(id), { user_type: 'sales', role: 'Office', status: 'inactive' });
    }
    assert.deepEqual(await profile(owner), { user_type: 'admin', role: 'Admin', status: 'active' });

    await db.exec(setup);
    assert.deepEqual(await profile(signup), { user_type: 'pending', role: 'Not set up', status: 'inactive' });
});

test("the README's SQL runs against the schema and does what it says", async () => {
    const readme = await readFile(new URL('../../template/README.client.md', import.meta.url), 'utf8');
    const filled = Object.entries(README_PLACEHOLDERS).reduce((text, [name, value]) => text.replaceAll(`{{${name}}}`, value(config())), readme);
    const statements = [
        ...[...filled.matchAll(/```sql\n([\s\S]*?)```/g)].map(m => m[1]),
        ...[...filled.matchAll(/`((?:update|select|insert)\b[^`]*;)`/gi)].map(m => m[1]),
    ];
    assert.ok(statements.length >= 2);

    const partner = await addAuthUser(db, 'cp@client.test', viaAddUser('agent', { name: 'STAR SOLAR' }));
    const named = await addAuthUser(db, 'named@client.test', viaAddUser('agent', { name: 'MOON', channel_partner: 'MOON KEY' }));
    await db.query('update public.profiles set channel_partner = null where id = $1', [partner]);
    // The owner fix, for an owner login that was made after another admin.
    await addAuthUser(db, 'second-admin@client.test', viaAddUser('admin'));
    await db.query("update public.profiles set user_type = 'pending', role = 'Not set up', status = 'inactive' where id = $1", [owner]);
    for (const sql of statements) await db.exec(sql);

    const key = async id => (await one(db, 'select channel_partner from public.profiles where id = $1', [id])).channel_partner;
    assert.equal(await key(partner), 'STAR SOLAR');
    assert.equal(await key(named), 'MOON KEY');
    assert.deepEqual(await profile(owner), { user_type: 'admin', role: 'Admin', status: 'active' });
});

test.after(() => db.close());
