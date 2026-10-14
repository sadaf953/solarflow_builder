import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { SUPABASE_STUB } from '../backend/supabaseStub.mjs';

const builderSql = await readFile(new URL('../../builder/backend/builder.sql', import.meta.url), 'utf8');
const schemaSql = await readFile(new URL('../../template/backend/schema.sql', import.meta.url), 'utf8');

const ADMIN = { sub: randomUUID(), role: 'authenticated', email: 'Admin@CRM.com' };
const STRANGER = { sub: randomUUID(), role: 'authenticated', email: 'someone@else.test' };
const ANON_ADMIN = { ...ADMIN, is_anonymous: true };

// The admin login exists before builder.sql runs (README order), so the
// script binds admin@crm.com to its user id.
const addLogin = (db, { sub, email }) => db.query('insert into auth.users(id, email) values ($1, $2)', [sub, email]);
const newDb = async () => {
    const db = new PGlite({ extensions: { pgcrypto } });
    await db.exec(SUPABASE_STUB);
    await addLogin(db, ADMIN);
    await db.exec(builderSql);
    return db;
};

// Runs fn as PostgREST would for these JWT claims (null = anon key only).
const as = (db, claims, fn) => db.transaction(async tx => {
    await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims || { role: 'anon' })]);
    await tx.exec(`set local role ${claims ? 'authenticated' : 'anon'}`);
    return fn(tx);
});
const call = async (db, claims, sql, params) => (await as(db, claims, tx => tx.query(sql, params))).rows[0];
const fails = (promise, pattern) => assert.rejects(promise, pattern);

const payload = (extra = {}) => ({
    schemaVersion: 1, contact: { company: 'Surya Solar' }, answers: { quotations: 'yes' }, workflow: { source: 'form' }, ...extra,
});

const createInvite = async db => (await call(db, ADMIN, 'select public.setup_admin_create_invite($1, $2) as r',
    ['Surya Solar', { name: 'Asha', phone: '9800000000' }])).r;

test('invite -> open -> save (with conflict) -> submit -> admin list/get', async () => {
    const db = await newDb();
    const { id, token } = await createInvite(db);
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    const stored = (await db.query('select token_hash from setup_private.invites where id = $1', [id])).rows[0];
    assert.notEqual(stored.token_hash, token, 'only the hash is stored');

    const opened = (await call(db, null, 'select public.setup_open($1, $2) as r', [id, token])).r;
    assert.equal(opened.company, 'Surya Solar');
    assert.equal(opened.version, 0);
    assert.equal(opened.payload, null);
    assert.equal(opened.status, 'open');

    const v1 = (await call(db, null, 'select public.setup_save($1, $2, $3, $4) as r', [id, token, payload(), 0])).r;
    assert.equal(v1, 1);
    await fails(call(db, null, 'select public.setup_save($1, $2, $3, $4) as r', [id, token, payload(), 0]), /conflict/);
    const v2 = (await call(db, null, 'select public.setup_save($1, $2, $3, $4) as r', [id, token, payload({ notes: 'x' }), 1])).r;
    assert.equal(v2, 2);

    await fails(call(db, null, 'select public.setup_submit($1, $2, $3) as r', [id, token, 1]), /conflict/, 'a page that missed a save cannot send');
    const submittedAt = (await call(db, null, 'select public.setup_submit($1, $2, $3) as r', [id, token, 2])).r;
    assert.ok(submittedAt instanceof Date);
    const reopened = (await call(db, null, 'select public.setup_open($1, $2) as r', [id, token])).r;
    assert.equal(reopened.status, 'submitted');
    assert.equal(reopened.version, 2);
    assert.equal(reopened.payload.notes, 'x');

    const list = (await as(db, ADMIN, tx => tx.query('select * from public.setup_admin_list()'))).rows;
    assert.equal(list.length, 1);
    assert.equal(list[0].status, 'submitted');
    assert.equal(list[0].version, 2);
    assert.ok(list[0].submitted_at);

    const detail = (await call(db, ADMIN, 'select public.setup_admin_get($1) as r', [id])).r;
    assert.equal(detail.invite.company, 'Surya Solar');
    assert.equal(detail.draft.version, 2);
    assert.equal(detail.submissions.length, 1);
    assert.equal(detail.submissions[0].payload.notes, 'x');
    assert.ok(detail.events.some(event => event.kind === 'submitted'));

    await call(db, ADMIN, 'select public.setup_admin_mark_downloaded($1)', [id]);
    assert.equal((await call(db, ADMIN, 'select public.setup_admin_get($1) as r', [id])).r.invite.status, 'downloaded');
});

test('wrong tokens return null and lock the invite after repeated failures', async () => {
    const db = await newDb();
    const { id, token } = await createInvite(db);
    assert.equal((await call(db, null, 'select public.setup_open($1, $2) as r', [id, 'wrong'])).r, null);
    assert.equal((await call(db, null, 'select public.setup_open($1, $2) as r', [randomUUID(), token])).r, null);
    assert.equal((await call(db, null, 'select public.setup_save($1, $2, $3, 0) as r', [id, 'wrong', payload()])).r, null);
    for (let i = 0; i < 8; i += 1) await call(db, null, 'select public.setup_open($1, $2) as r', [id, `wrong-${i}`]);
    await fails(call(db, null, 'select public.setup_open($1, $2) as r', [id, token]), /locked/);

    const { token: fresh } = (await call(db, ADMIN, 'select public.setup_admin_reset_token($1) as r', [id])).r;
    assert.equal((await call(db, null, 'select public.setup_open($1, $2) as r', [id, token])).r, null, 'old link stops working');
    assert.equal((await call(db, null, 'select public.setup_open($1, $2) as r', [id, fresh])).r.company, 'Surya Solar');
});

test('a per-invite rate limit stops floods', async () => {
    const db = await newDb();
    const { id, token } = await createInvite(db);
    await db.query("update setup_private.invites set rate_window_start = now(), rate_calls = 120 where id = $1", [id]);
    await fails(call(db, null, 'select public.setup_open($1, $2) as r', [id, token]), /rate_limited/);
    await db.query("update setup_private.invites set rate_window_start = now() - interval '2 minutes' where id = $1", [id]);
    assert.ok((await call(db, null, 'select public.setup_open($1, $2) as r', [id, token])).r);
});

test('archived and expired invites cannot be opened; reopen restores them', async () => {
    const db = await newDb();
    const { id, token } = await createInvite(db);
    assert.equal((await call(db, ADMIN, 'select public.setup_admin_set_status($1, $2) as r', [id, 'archived'])).r, 'archived');
    assert.equal((await call(db, null, 'select public.setup_open($1, $2) as r', [id, token])).r, null);
    assert.equal((await call(db, ADMIN, 'select public.setup_admin_set_status($1, $2) as r', [id, 'open'])).r, 'open');
    assert.ok((await call(db, null, 'select public.setup_open($1, $2) as r', [id, token])).r);
    await fails(call(db, ADMIN, 'select public.setup_admin_set_status($1, $2) as r', [id, 'downloaded']), /invalid_status/);
    await db.query("update setup_private.invites set expires_at = now() - interval '1 day' where id = $1", [id]);
    assert.equal((await call(db, null, 'select public.setup_open($1, $2) as r', [id, token])).r, null);
});

test('drafts are validated: size, schemaVersion and object sections', async () => {
    const db = await newDb();
    const { id, token } = await createInvite(db);
    const save = body => call(db, null, 'select public.setup_save($1, $2, $3, 0) as r', [id, token, body]);
    await fails(save({ ...payload(), notes: 'x'.repeat(300 * 1024) }), /too_large/);
    await fails(save({ ...payload(), schemaVersion: 2 }), /invalid_payload/);
    await fails(save({ ...payload(), answers: [] }), /invalid_payload/);
    await fails(save({ schemaVersion: 1, contact: {}, answers: {} }), /invalid_payload/);
    await fails(call(db, null, 'select public.setup_submit($1, $2, 0) as r', [id, token]), /nothing_to_submit/);
});

test('anon and signed-in users cannot read setup_private', async () => {
    const db = await newDb();
    await createInvite(db);
    for (const claims of [null, STRANGER, ADMIN]) {
        for (const table of ['invites', 'drafts', 'submissions', 'events', 'admins']) {
            await fails(call(db, claims, `select * from setup_private.${table}`), /permission denied/);
        }
        await fails(call(db, claims, "select setup_private.client_invite(gen_random_uuid(), 'x')"), /permission denied/);
    }
});

test('only admins (non-anonymous, listed email) can call admin RPCs', async () => {
    const db = await newDb();
    const { id } = await createInvite(db);
    const adminCalls = [
        ['select public.setup_admin_create_invite($1, $2)', ['X', {}]],
        ['select * from public.setup_admin_list()', []],
        ['select public.setup_admin_get($1)', [id]],
        ['select public.setup_admin_reset_token($1)', [id]],
        ['select public.setup_admin_set_status($1, $2)', [id, 'archived']],
        ['select public.setup_admin_mark_downloaded($1)', [id]],
        ['select public.setup_admin_get_settings($1)', [id]],
        ['select public.setup_admin_save_settings($1, $2)', [id, {}]],
    ];
    for (const [sql, params] of adminCalls) {
        await fails(call(db, null, sql, params), /permission denied/);
        await fails(call(db, STRANGER, sql, params), /not_admin/);
        await fails(call(db, ANON_ADMIN, sql, params), /not_admin/);
    }
    // An email alone grants nothing: a stranger who signs up with a listed email is still refused.
    await db.query("insert into setup_private.admins(email) values ('someone@else.test')");
    await fails(call(db, STRANGER, 'select * from public.setup_admin_list()', []), /not_admin/);
    await db.query('update setup_private.admins set user_id = $1 where email = $2', [STRANGER.sub, 'someone@else.test']);
    assert.equal((await as(db, STRANGER, tx => tx.query('select * from public.setup_admin_list()'))).rows.length, 1);
});

test('the seeded admin is bound to the login that existed when the script ran', async () => {
    const db = new PGlite({ extensions: { pgcrypto } });
    await db.exec(SUPABASE_STUB);
    await db.exec(builderSql);
    // No login yet: nobody is admin, even someone who later signs up as admin@crm.com.
    const squatter = { sub: randomUUID(), role: 'authenticated', email: 'admin@crm.com' };
    await addLogin(db, squatter);
    await fails(call(db, squatter, 'select * from public.setup_admin_list()', []), /not_admin/);
    // Re-running after the real login exists binds it once; later runs never move it.
    await db.exec(builderSql);
    assert.equal((await db.query('select user_id from setup_private.admins where email = $1', ['admin@crm.com'])).rows[0].user_id, squatter.sub);
    await db.query('delete from auth.users where id = $1', [squatter.sub]);
    await addLogin(db, ADMIN);
    await db.exec(builderSql);
    assert.equal((await db.query('select user_id from setup_private.admins where email = $1', ['admin@crm.com'])).rows[0].user_id, squatter.sub);
});

test('builder.sql is idempotent and leaves the client CRM tables alone', async () => {
    const db = new PGlite({ extensions: { pgcrypto } });
    await db.exec(SUPABASE_STUB);
    await addLogin(db, ADMIN);
    await db.exec(schemaSql);
    const tables = async () => (await db.query("select table_name from information_schema.tables where table_schema = 'public' order by 1")).rows;
    const before = await tables();
    await db.exec(builderSql);
    await db.exec(builderSql);
    assert.deepEqual(await tables(), before);
    assert.equal((await db.query('select count(*)::int as n from setup_private.admins')).rows[0].n, 1);
});

test('admin settings are kept with the invite, validated and never shown to the client', async () => {
    const db = await newDb();
    const { id, token } = await createInvite(db);
    const get = () => call(db, ADMIN, 'select public.setup_admin_get_settings($1) as r', [id]);
    const save = settings => call(db, ADMIN, 'select public.setup_admin_save_settings($1, $2)', [id, settings]);
    assert.equal((await get()).r, null);

    const settings = {
        adminOverrides: { loanTracking: true }, slug: 'surya', ownerEmail: 'boss@surya.example',
        branding: { bankAccountNumber: '50100012345678' },
        workflow: { source: 'form', stagesMode: 'custom', stages: [{ id: 'LEADS' }], dropdowns: {}, customFields: [] },
    };
    await save(settings);
    assert.deepEqual((await get()).r, settings);
    await save({ ...settings, workflow: null });
    assert.equal((await get()).r.workflow, null);

    await fails(save([]), /invalid_input/);
    await fails(save({ ...settings, secret: 1 }), /invalid_input/);
    await fails(save({ ...settings, branding: 'x' }), /invalid_input/);
    await fails(save({ ...settings, workflow: [] }), /invalid_input/);
    await fails(save({ ...settings, slug: 4 }), /invalid_input/);
    await fails(save({ ...settings, branding: { address: 'x'.repeat(300 * 1024) } }), /too_large/);
    await fails(call(db, ADMIN, 'select public.setup_admin_save_settings($1, $2)', [randomUUID(), settings]), /not_found/);

    const opened = (await call(db, null, 'select public.setup_open($1, $2) as r', [id, token])).r;
    assert.ok(!JSON.stringify(opened).includes('50100012345678'), 'the client link never returns admin settings');
    const listed = (await as(db, ADMIN, tx => tx.query('select * from public.setup_admin_list()'))).rows[0];
    assert.ok(!('admin_settings' in listed));
});

test('sending is rate-limited and only the latest 20 snapshots are kept', async () => {
    const db = await newDb();
    const { id, token } = await createInvite(db);
    let version = 0;
    const saveAndSend = async () => {
        version = (await call(db, null, 'select public.setup_save($1, $2, $3, $4) as r', [id, token, payload({ notes: `v${version + 1}` }), version])).r;
        return call(db, null, 'select public.setup_submit($1, $2, $3) as r', [id, token, version]);
    };
    for (let i = 0; i < 10; i += 1) await saveAndSend();
    await fails(saveAndSend(), /submit_limited/);

    // An hour later the client can send again; old snapshots are pruned.
    for (let round = 0; round < 2; round += 1) {
        await db.query("update setup_private.events set at = at - interval '2 hours' where invite_id = $1", [id]);
        await db.query("update setup_private.submissions set submitted_at = submitted_at - interval '2 hours' where invite_id = $1", [id]);
        for (let i = 0; i < 10; i += 1) await saveAndSend();
    }
    const detail = (await call(db, ADMIN, 'select public.setup_admin_get($1) as r', [id])).r;
    assert.equal(detail.submissions.length, 20);
    assert.equal(detail.submissions[0].payload.notes, `v${version}`, 'the newest snapshot is kept');
    assert.ok(detail.submissions.every(item => item.version > version - 20));
});

test('opening the link over and over logs one "opened" entry an hour', async () => {
    const db = await newDb();
    const { id, token } = await createInvite(db);
    const open = () => call(db, null, 'select public.setup_open($1, $2) as r', [id, token]);
    const opened = async () => (await db.query("select count(*)::int as n from setup_private.events where invite_id = $1 and kind = 'opened'", [id])).rows[0].n;
    for (let i = 0; i < 25; i += 1) await open();
    assert.equal(await opened(), 1);
    await db.query("update setup_private.events set at = at - interval '61 minutes' where invite_id = $1", [id]);
    await open();
    await open();
    assert.equal(await opened(), 2);
});

test('re-running builder.sql over the older version replaces setup_submit(uuid, text)', async () => {
    const db = new PGlite({ extensions: { pgcrypto } });
    await db.exec(SUPABASE_STUB);
    await addLogin(db, ADMIN);
    await db.exec(builderSql);
    // What the older file left behind: the two-argument function and its wrapper.
    await db.exec(`
        drop function public.setup_submit(uuid, text, int);
        drop function setup_private.setup_submit(uuid, text, int);
        create function setup_private.setup_submit(p_invite uuid, p_token text) returns timestamptz
          language sql security definer set search_path = '' as $$ select now() $$;
        create function public.setup_submit(p_invite uuid, p_token text) returns timestamptz
          language sql security invoker set search_path = '' as $$ select setup_private.setup_submit(p_invite, p_token) $$;
        grant execute on function public.setup_submit(uuid, text) to anon, authenticated;
    `);
    await db.exec(builderSql);
    await db.exec(builderSql);
    const overloads = (await db.query(`
        select n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as f
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where p.proname = 'setup_submit' order by 1`)).rows.map(row => row.f);
    assert.deepEqual(overloads, [
        'public.setup_submit(p_invite uuid, p_token text, p_version integer)',
        'setup_private.setup_submit(p_invite uuid, p_token text, p_version integer)',
    ]);
    const { id, token } = await createInvite(db);
    await fails(call(db, null, 'select public.setup_submit($1, $2) as r', [id, token]), /does not exist/);
    assert.match(builderSql, /^-- Re-run this whole file after every update of the builder website\.$/m);
});
