// Attempts to break the client backend: scope escapes, privilege escalation
// through profiles / app_roles / add_user, anon access, seed escaping and
// re-running the setup on a database that already holds data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { schema, newDb, rows, one, as, addAuthUser, viaAddUser } from './pg.mjs';
import { loadAddUser } from './addUserHarness.mjs';
import { setupSql } from '../../template/backend/seed.js';
import { defaultClientConfig } from '../../template/src/config/resolve.js';

const OWNER = 'owner@client.test';
const config = () => {
    const base = defaultClientConfig();
    return {
        ...base,
        client: { name: 'Sunrise Solar', slug: 'sunrise-solar', ownerEmail: OWNER },
        features: { ...base.features, cpos: true, branches: true, dealers: true, channelPartners: true, vendorLogin: true, inventory: true },
    };
};

const db = await newDb();
await db.exec(setupSql({ schema, config: config() }));

const p = {};
p.owner = await addAuthUser(db, OWNER);
p.sales = await addAuthUser(db, 'sales@client.test', viaAddUser('sales'));
p.cpo = await addAuthUser(db, 'cpo@client.test', viaAddUser('channel_partner_office', { name: 'SUNRISE OFFICE', channel_partner: 'SUNRISE' }));
p.dealerA = await addAuthUser(db, 'a@client.test', viaAddUser('agent2', { name: 'DEALER A', channel_partner: 'SUNRISE', parent_profile_id: p.cpo }));
p.dealerB = await addAuthUser(db, 'b@client.test', viaAddUser('agent2', { name: 'DEALER B', channel_partner: 'SUNRISE', parent_profile_id: p.cpo }));
p.agent = await addAuthUser(db, 'agent@client.test', viaAddUser('agent', { name: 'AGENT A' }));
p.vendor = await addAuthUser(db, 'v1@client.test', viaAddUser('vendor', { name: 'VENDOR ONE' }));
p.signup = await addAuthUser(db, 'someone@gmail.test');

const insertCustomer = (uid, name, vendor = null) => as(db, uid, tx =>
    one(tx, 'insert into public.admin(customer_name, vendor) values ($1, $2) returning *', [name, vendor]));
await as(db, p.owner, async tx => {
    await tx.query("insert into public.vendors(name, email, profile_id) values ('Vendor One', 'v1@client.test', $1)", [p.vendor]);
    await tx.query("insert into public.vendors(name, email) values ('Vendor Two', 'two@client.test')");
});
const c = {
    office: await insertCustomer(p.owner, 'Office lead', 'Vendor One'),
    vendorTwo: await insertCustomer(p.owner, 'Vendor two job', 'Vendor Two'),
    cpo: await insertCustomer(p.cpo, 'CPO lead'),
    dealerA: await insertCustomer(p.dealerA, 'Dealer A lead'),
    dealerB: await insertCustomer(p.dealerB, 'Dealer B lead'),
    agent: await insertCustomer(p.agent, 'Agent lead'),
};

const visibleNames = uid => as(db, uid, async tx => (await rows(tx, 'select customer_name from public.admin order by 1')).map(r => r.customer_name));
const visibleProfiles = uid => as(db, uid, async tx => (await rows(tx, 'select id from public.profiles order by 1')).map(r => r.id));
const stored = async (id, column) => (await one(db, `select ${column}::text as v from public.admin where id = $1`, [id])).v;

test('setup: every partner starts with its own scope', async () => {
    assert.deepEqual(await visibleNames(p.agent), ['Agent lead']);
    assert.deepEqual(await visibleNames(p.vendor), ['Office lead']);
    assert.deepEqual(await visibleNames(p.dealerA), ['Dealer A lead']);
    assert.deepEqual(await visibleNames(p.cpo), ['CPO lead', 'Dealer A lead', 'Dealer B lead']);
});

// profiles.name is self-editable, so it must not decide what a login can see.
test('renaming your own profile never widens what you can see', async t => {
    const attempts = [
        ['agent renamed to a partner office key', p.agent, 'SUNRISE', 'AGENT A'],
        ['vendor renamed to an unclaimed installer', p.vendor, 'Vendor Two', 'VENDOR ONE'],
        ['dealer renamed to another dealer', p.dealerA, 'DEALER B', 'DEALER A'],
    ];
    for (const [label, uid, name, original] of attempts) {
        await t.test(label, async () => {
            const before = [await visibleNames(uid), await visibleProfiles(uid)];
            await as(db, uid, tx => tx.query('update public.profiles set name = $2 where id = $1', [uid, name])).catch(() => {});
            const after = [await visibleNames(uid), await visibleProfiles(uid)];
            await db.query('update public.profiles set name = $2 where id = $1', [uid, original]);
            assert.deepEqual(after, before);
        });
    }
});

test('activity can only be logged against customers you can see', async () => {
    await as(db, p.agent, tx => tx.query("insert into public.activity_log(user_id, customer_id, action) values ($1, $2, 'note')", [p.agent, c.agent.id]));
    await assert.rejects(as(db, p.agent, tx => tx.query(
        "insert into public.activity_log(user_id, customer_id, action, message) values ($1, $2, 'stage_change', 'LEADS → COMPLETED')",
        [p.agent, c.office.id])), /row-level security/);
});

test('installers and partners cannot change payment or stock bookkeeping', async t => {
    await as(db, p.vendor, tx => tx.query("update public.admin set installation_status = 'Installed' where id = $1", [c.office.id]));
    assert.equal(await stored(c.office.id, 'installation_status'), 'Installed');

    const attempts = [
        [p.vendor, c.office.id, 'vendor_payment_status', 'Paid'],
        [p.vendor, c.office.id, 'vendor_quote', '999999'],
        [p.vendor, c.office.id, 'bom_stock_issued_at', '2026-10-13T00:00:00Z'],
        [p.agent, c.agent.id, 'bom_stock_issued_at', '2026-10-13T00:00:00Z'],
    ];
    for (const [uid, id, column, value] of attempts) {
        await t.test(`${uid === p.vendor ? 'vendor' : 'agent'} sets ${column}`, async () => {
            const before = await stored(id, column);
            await as(db, uid, tx => tx.query(`update public.admin set ${column} = $2 where id = $1`, [id, value])).catch(() => {});
            assert.equal(await stored(id, column), before);
        });
    }
});

test('raw_user_meta_data (user-editable) never grants a role', async () => {
    const id = '00000000-0000-4000-8000-0000000000aa';
    await db.query('insert into auth.users(id, email, raw_user_meta_data) values ($1, $2, $3)',
        [id, 'meta@client.test', JSON.stringify({ created_via: 'add_user', user_type: 'admin', name: 'SUNRISE' })]);
    const profile = await one(db, 'select user_type, status from public.profiles where id = $1', [id]);
    assert.deepEqual(profile, { user_type: 'pending', status: 'inactive' });
    assert.deepEqual(await visibleNames(id), []);
});

test('inactive logins and anon cannot write anything', async () => {
    const writes = [
        "insert into public.admin(customer_name) values ('x')",
        "insert into public.calendar_events(title, starts_on) values ('x', '2026-11-01')",
        "insert into public.team_chat_messages(sender_name, text) values ('x', 'y')",
        "insert into public.quotations(customer_name) values ('x')",
    ];
    for (const sql of writes) {
        await assert.rejects(as(db, p.signup, tx => tx.query(sql)), /row-level security/, sql);
        await assert.rejects(as(db, null, tx => tx.query(sql)), /permission denied/, sql);
    }
});

test('settings, login types and private helpers are out of reach', async () => {
    for (const sql of [
        "update public.app_roles set enabled = true where user_type = 'stamp'",
        "insert into public.app_settings(key, value) values ('owner_email', '\"me@x.test\"')",
        "update public.app_settings set value = '{}' where key = 'features'",
        "select solarflow_private.provision_profile(auth.uid(), 'x@x.test', '{\"created_via\":\"add_user\",\"user_type\":\"admin\"}', '{}')",
        'select solarflow_private.backfill_profiles()',
    ]) {
        await assert.rejects(as(db, p.owner, tx => tx.query(sql)), /permission denied/, sql);
    }
    await assert.rejects(as(db, null, tx => tx.query('select solarflow_private.is_admin()')), /permission denied/);

    const unsafe = await rows(db, `select n.nspname || '.' || p.proname as fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public', 'solarflow_private') and p.prosecdef
          and not exists(select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg = 'search_path=""')`);
    assert.deepEqual(unsafe, [], 'security definer functions pin an empty search_path');
    const anonCallable = await rows(db, `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public', 'solarflow_private') and has_function_privilege('anon', p.oid, 'execute')`);
    assert.deepEqual(anonCallable, []);
});

// ── add_user ────────────────────────────────────────────────────────────
const addUser = await loadAddUser(db);
const profileOf = async email => one(db, 'select * from public.profiles where email = $1', [email]);

test('add_user: callers must be an active admin or a CPO', async () => {
    assert.equal((await addUser.call(null, { email: 'x@x.test', password: 'pw123456' })).status, 401);
    assert.equal((await addUser.call('not-a-token', { email: 'x@x.test', password: 'pw123456' })).status, 401);
    for (const uid of [p.sales, p.dealerA, p.agent, p.vendor, p.signup]) {
        const res = await addUser.call(uid, { email: `by-${uid}@x.test`, password: 'pw123456', user_type: 'admin' });
        assert.equal(res.status, 403, `caller ${uid}`);
    }
    assert.equal(await profileOf(`by-${p.sales}@x.test`), undefined);
});

test('add_user: a CPO only creates dealers and managers under itself', async () => {
    for (const userType of ['admin', 'sales', 'agent', 'vendor', 'channel_partner_office']) {
        assert.equal((await addUser.call(p.cpo, { email: `cpo-${userType}@x.test`, password: 'pw123456', user_type: userType })).status, 403, userType);
    }
    const res = await addUser.call(p.cpo, {
        email: 'newdealer@x.test', password: 'pw123456', user_type: 'agent2', name: 'New dealer',
        channel_partner: 'MOON', parent_profile_id: p.owner,
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const dealer = await profileOf('newdealer@x.test');
    assert.equal(dealer.user_type, 'agent2');
    assert.equal(dealer.status, 'active');
    assert.equal(dealer.channel_partner, 'SUNRISE');
    assert.equal(dealer.parent_profile_id, p.cpo);
    assert.equal(dealer.cpo_profile_id, p.cpo);
    assert.equal(dealer.created_by, p.cpo);

    assert.equal((await addUser.call(p.cpo, { action: 'set_status', user_id: p.agent, status: 'inactive' })).status, 403);
    assert.equal((await addUser.call(p.cpo, { action: 'update_password', user_id: p.owner, new_password: 'x12345678' })).status, 403);
    assert.equal((await addUser.call(p.cpo, { action: 'delete', user_id: p.sales })).status, 403);
    assert.equal((await addUser.call(p.cpo, { action: 'set_status', user_id: dealer.id, status: 'inactive' })).status, 200);
    assert.equal(addUser.bans.get(dealer.id), '876000h');
});

test('add_user: a CPO cannot pick the role label of the logins it creates', async () => {
    const res = await addUser.call(p.cpo, { email: 'labelled@x.test', password: 'pw123456', user_type: 'agent2', role: 'Admin Office' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal((await profileOf('labelled@x.test')).role, 'Dealer');
});

test('add_user: a CPO whose login type is switched off can no longer manage logins', async () => {
    await db.query("update public.app_roles set enabled = false where user_type = 'channel_partner_office'");
    try {
        const res = await addUser.call(p.cpo, { email: 'afteroff@x.test', password: 'pw123456', user_type: 'agent2' });
        assert.equal(res.status, 403, JSON.stringify(res.body));
        assert.equal(await profileOf('afteroff@x.test'), undefined);
    } finally {
        await db.query("update public.app_roles set enabled = true where user_type = 'channel_partner_office'");
    }
});

test('add_user: disabled roles stay disabled and deactivated admins lose access', async () => {
    await db.query("update public.app_roles set enabled = false where user_type = 'vendor'");
    try {
        assert.equal((await addUser.call(p.owner, { email: 'v9@x.test', password: 'pw123456', user_type: 'vendor' })).status, 400);
        assert.equal((await addUser.call(p.owner, { email: 'st@x.test', password: 'pw123456', user_type: 'stamp' })).status, 400);
        assert.equal((await addUser.call(p.owner, { email: 'typo@x.test', password: 'pw123456', user_type: 'superadmin' })).status, 400);
    } finally {
        await db.query("update public.app_roles set enabled = true where user_type = 'vendor'");
    }

    assert.equal((await addUser.call(p.owner, { email: 'admin2@x.test', password: 'pw123456', user_type: 'admin' })).status, 200);
    const admin2 = await profileOf('admin2@x.test');
    assert.equal(admin2.user_type, 'admin');
    assert.equal((await addUser.call(p.owner, { action: 'set_status', user_id: admin2.id, status: 'inactive' })).status, 200);
    assert.equal((await addUser.call(admin2.id, { email: 'revenge@x.test', password: 'pw123456', user_type: 'admin' })).status, 403);
    assert.equal((await addUser.call(p.owner, { action: 'set_status', user_id: p.owner, status: 'inactive' })).status, 400);
});

test('add_user: an unknown sign-up needs a login type before it can be activated', async () => {
    const id = await addAuthUser(db, 'walkin@client.test');
    assert.deepEqual(await one(db, 'select user_type, status from public.profiles where id = $1', [id]), { user_type: 'pending', status: 'inactive' });
    assert.equal((await addUser.call(p.owner, { email: 'p@x.test', password: 'pw123456', user_type: 'pending' })).status, 400);
    assert.equal((await addUser.call(p.owner, { action: 'set_status', user_id: id, status: 'active' })).status, 400);
    await db.query("update public.app_roles set enabled = true where user_type = 'pending'");
    await db.query("update public.profiles set status = 'active' where id = $1", [id]);
    try {
        assert.deepEqual(await visibleNames(id), [], 'a pending login never has access, even if switched on by hand');
    } finally {
        await db.query("update public.app_roles set enabled = false where user_type = 'pending'");
    }
    await as(db, p.owner, tx => tx.query("update public.profiles set user_type = 'sales', role = 'Office', status = 'inactive' where id = $1", [id]));
    assert.equal((await addUser.call(p.owner, { action: 'set_status', user_id: id, status: 'active' })).status, 200);
    await db.query('delete from auth.users where id = $1', [id]);
});

test('add_user: a channel partner gets its name as its fixed partner key', async () => {
    assert.equal((await addUser.call(p.owner, { email: 'cp@x.test', password: 'pw123456', user_type: 'agent', name: 'Star Solar' })).status, 200);
    assert.equal((await profileOf('cp@x.test')).channel_partner, 'STAR SOLAR');
});

test('add_user: ALLOWED_ORIGIN refuses other sites', async () => {
    const pinned = await loadAddUser(db, { ALLOWED_ORIGIN: 'https://crm.client.test' });
    const body = { email: 'origin@x.test', password: 'pw123456', user_type: 'sales' };
    assert.equal((await pinned.call(p.owner, body, { origin: 'https://evil.test' })).status, 403);
    assert.equal(await profileOf('origin@x.test'), undefined);
    assert.equal((await pinned.call(p.owner, body, { origin: 'https://crm.client.test' })).status, 200);
});

// ── Seed escaping and re-runs ───────────────────────────────────────────
const seededClient = async cfg => {
    const fresh = await newDb();
    try {
        await fresh.exec(setupSql({ schema, config: cfg })).catch(error => { throw new Error(`setup.sql failed: ${error.message}`); });
        const client = (await one(fresh, "select value from public.app_settings where key = 'client'")).value;
        const brands = (await rows(fresh, "select label from public.metadata where category = 'module_brand' order by sort_order")).map(r => r.label);
        return { client, brands };
    } finally {
        await fresh.close();
    }
};

test('seed stores names with quotes, $$, backslashes and emoji exactly as typed', async () => {
    const name = "Ravi's $$ Solar \\ C:\\new\\ \"quoted\" ☀️ ગુજરાત $body$";
    const labels = ['$$; drop table public.admin; $$', "a\\'); drop table public.admin; --", 'Back\\slash\\', '☀️ Panels'];
    const cfg = { ...config(), client: { ...config().client, name }, dropdowns: { ...config().dropdowns, module_brand: labels } };
    const { client, brands } = await seededClient(cfg);
    assert.equal(client.name, name);
    assert.deepEqual(brands, labels);
});

test('seed stores a client name containing the text \\u0000 as typed', async () => {
    const name = 'Solar \\u0000 Works';
    const { client } = await seededClient({ ...config(), client: { ...config().client, name } });
    assert.equal(client.name, name);
});

test('re-running the full setup keeps data, logins and admin edits', async () => {
    await as(db, p.owner, async tx => {
        await tx.query("update public.metadata set is_active = false where category = 'module_brand' and sort_order = 1");
        await tx.query("insert into public.calendar_events(title, starts_on) values ('Board meeting', '2026-11-05')");
    });
    const snapshot = async () => ({
        customers: await rows(db, 'select id, customer_name, lead_creator_profile_id from public.admin order by id'),
        profiles: await rows(db, 'select id, user_type, status, name, parent_profile_id from public.profiles order by id'),
        vendors: await rows(db, 'select name, profile_id from public.vendors order by name'),
        inactive: await rows(db, 'select category, label from public.metadata where not is_active order by 1, 2'),
        events: await rows(db, 'select title from public.calendar_events order by 1'),
    });
    // Objects the client added itself are left alone by a re-run.
    await db.exec(`create table public.client_notes(id int primary key, body text);
        alter table public.client_notes enable row level security;
        create policy client_notes_read on public.client_notes for select to authenticated using (true);
        grant select on public.client_notes to authenticated;
        create function public.client_hello() returns text language sql as $$ select 'hi' $$;
        grant execute on function public.client_hello() to authenticated;`);
    const clientObjects = () => one(db, `select has_table_privilege('authenticated', 'public.client_notes', 'select') as t,
        has_function_privilege('authenticated', 'public.client_hello()', 'execute') as f,
        (select count(*)::int from pg_policies where tablename = 'client_notes') as policies`);
    const before = await snapshot();
    await db.exec(setupSql({ schema, config: config() }));
    assert.deepEqual(await snapshot(), before);
    assert.deepEqual(await clientObjects(), { t: true, f: true, policies: 1 });
    await db.exec('drop function public.client_hello(); drop table public.client_notes;');
    assert.deepEqual(await visibleNames(p.agent), ['Agent lead']);
    assert.ok(!/\b(drop\s+table|truncate)\b/i.test(schema), 'schema.sql never drops or truncates a table');
});

test.after(() => db.close());
