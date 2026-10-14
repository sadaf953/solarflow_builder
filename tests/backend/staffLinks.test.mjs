// add_user links an admin-created manager or dealer to the login it works
// under, or refuses with a clear error; login type names follow the setup
// wizard on new and existing installs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { schema, newDb, rows, one, as, addAuthUser, viaAddUser } from './pg.mjs';
import { loadAddUser } from './addUserHarness.mjs';
import { setupSql } from '../../template/backend/seed.js';
import { defaultClientConfig } from '../../template/src/config/resolve.js';
import { APP_ROLES } from '../../template/src/constants.js';

const OWNER = 'owner@client.test';
const config = () => {
    const base = defaultClientConfig();
    return {
        ...base,
        client: { name: 'Sunrise Solar', slug: 'sunrise-solar', ownerEmail: OWNER },
        features: { ...base.features, cpos: true, branches: true, dealers: true, channelPartners: true },
    };
};
const setup = setupSql({ schema, config: config() });

const db = await newDb();
await db.exec(setup);
const p = {};
p.owner = await addAuthUser(db, OWNER);
p.cpo = await addAuthUser(db, 'cpo@client.test', viaAddUser('channel_partner_office', { name: 'GREEN OFFICE', channel_partner: 'GREEN' }));
p.twin = await addAuthUser(db, 'twin@client.test', viaAddUser('channel_partner_office', { name: 'GREEN TWO', channel_partner: 'GREEN' }));
p.offline = await addAuthUser(db, 'off@client.test', viaAddUser('channel_partner_office', { name: 'OLD OFFICE', channel_partner: 'OLD' }));
p.agent = await addAuthUser(db, 'agent@client.test', viaAddUser('agent', { name: 'RAHUL' }));
await db.query("update public.profiles set status = 'inactive' where id = $1", [p.offline]);
// Renamed in Operations: the key no longer equals the agent's name.
await db.query("update public.profiles set channel_partner = 'RAHUL SOLAR' where id = $1", [p.agent]);

const addUser = await loadAddUser(db);
let n = 0;
const create = (body, caller = p.owner) => addUser.call(caller, { email: `new${++n}@x.test`, password: 'pw123456', ...body });
const profileOf = email => one(db, 'select user_type, channel_partner, parent_profile_id, cpo_profile_id from public.profiles where email = $1', [email]);
const lastEmail = () => `new${n}@x.test`;

test('add_user: a manager chosen under an office is linked to that office and takes its key', async () => {
    const res = await create({ user_type: 'office2', name: 'Manager', parent_profile_id: p.cpo });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(await profileOf(lastEmail()), { user_type: 'office2', channel_partner: 'GREEN', parent_profile_id: p.cpo, cpo_profile_id: p.cpo });
});

test("add_user: a dealer under a channel partner takes the partner's key, not its name", async () => {
    const res = await create({ user_type: 'agent2', name: 'Dealer R', parent_profile_id: p.agent, channel_partner: 'RAHUL' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(await profileOf(lastEmail()), { user_type: 'agent2', channel_partner: 'RAHUL SOLAR', parent_profile_id: null, cpo_profile_id: null });
    const { id } = await one(db, 'select id from public.profiles where email = $1', [lastEmail()]);
    const visible = await as(db, p.agent, tx => rows(tx, "select id from public.profiles where user_type = 'agent2'"));
    assert.deepEqual(visible.map(r => r.id), [id], 'the partner sees its dealer');
});

test('add_user: a login that cannot be linked is refused and nothing is created', async t => {
    const cases = [
        ['two offices share the name', { user_type: 'office2', channel_partner: 'green' }, /More than one partner office is named "green"/],
        ['no office has the name', { user_type: 'agent2', channel_partner: 'NOBODY' }, /not found or is switched off/],
        ['the office is switched off', { user_type: 'office2', parent_profile_id: p.offline }, /not found or is switched off/],
        ['a manager cannot work under a channel partner', { user_type: 'office2', parent_profile_id: p.agent }, /not found or is switched off/],
        ['nothing was chosen', { user_type: 'agent2' }, /Choose the partner office or channel partner/],
    ];
    for (const [label, body, message] of cases) {
        await t.test(label, async () => {
            const res = await create(body);
            assert.equal(res.status, 400, JSON.stringify(res.body));
            assert.match(res.body.error, message);
            assert.equal(await profileOf(lastEmail()), undefined);
        });
    }
});

test('add_user: an office name that matches exactly one office still links by name', async () => {
    await db.query("update public.profiles set status = 'inactive' where id = $1", [p.twin]);
    try {
        const res = await create({ user_type: 'agent2', name: 'By name', channel_partner: 'green' });
        assert.equal(res.status, 200, JSON.stringify(res.body));
        assert.deepEqual(await profileOf(lastEmail()), { user_type: 'agent2', channel_partner: 'GREEN', parent_profile_id: p.cpo, cpo_profile_id: p.cpo });
    } finally {
        await db.query("update public.profiles set status = 'active' where id = $1", [p.twin]);
    }
});

test('add_user: a partner office still creates logins under itself', async () => {
    const res = await create({ user_type: 'agent2', name: 'Office dealer', parent_profile_id: p.agent }, p.cpo);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(await profileOf(lastEmail()), { user_type: 'agent2', channel_partner: 'GREEN', parent_profile_id: p.cpo, cpo_profile_id: p.cpo });
});

// ── Login type names ────────────────────────────────────────────────────
const WIZARD_NAMES = {
    admin: 'Admin', sales: 'Office staff', channel_partner_office: 'Partner office', office2: 'Partner office manager',
    agent: 'Partner / agent', agent2: 'Dealer', vendor: 'Installer', stamp: 'Stamp maker',
};
const names = async target => Object.fromEntries((await rows(target, "select user_type, label, role from public.app_roles where user_type <> 'pending'"))
    .map(r => [r.user_type, [r.label, r.role]]));

test('login type names match the setup wizard in the app and the database', async () => {
    const expected = Object.fromEntries(Object.entries(WIZARD_NAMES).map(([type, name]) => [type, [name, name]]));
    assert.deepEqual(await names(db), expected);
    for (const role of APP_ROLES) assert.deepEqual([role.label, role.role], expected[role.user_type], role.user_type);
});

test('re-running setup renames the old default names and keeps names an admin changed', async () => {
    const old = await newDb();
    try {
        await old.exec(setup);
        await old.exec(`
            update public.app_roles set label = 'Office', role = 'Office' where user_type = 'sales';
            update public.app_roles set label = 'Dealer', role = 'Channel Partner' where user_type = 'agent2';
            update public.app_roles set label = 'Channel Partners', role = 'Channel Partners' where user_type = 'agent';
            update public.app_roles set label = 'Vendors', role = 'Vendors' where user_type = 'vendor';
            update public.app_roles set label = 'Our franchisees', role = 'Franchisee' where user_type = 'channel_partner_office';`);
        await old.exec(setup);
        await old.exec(setup);
        const after = await names(old);
        assert.deepEqual(after.sales, ['Office staff', 'Office staff']);
        assert.deepEqual(after.agent2, ['Dealer', 'Dealer']);
        assert.deepEqual(after.agent, ['Partner / agent', 'Partner / agent']);
        assert.deepEqual(after.vendor, ['Installer', 'Installer']);
        assert.deepEqual(after.channel_partner_office, ['Our franchisees', 'Franchisee']);
    } finally {
        await old.close();
    }
});
