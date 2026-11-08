// public.keepalive(): the one function anon may call, used by the daily
// pg_cron job and scripts/keepalive.mjs to keep free projects awake.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupSql } from '../../template/backend/seed.js';
import { defaultClientConfig } from '../../template/src/config/resolve.js';
import { as, newDb, one, rows, schema } from './pg.mjs';

const db = await newDb();

test('schema.sql and setup.sql still run, twice', async () => {
    await db.exec(schema);
    await db.exec(setupSql({ schema, config: defaultClientConfig() }));
    await db.exec(setupSql({ schema, config: defaultClientConfig() }));
    assert.equal((await one(db, "select count(*)::int n from pg_proc where proname = 'keepalive'")).n, 1);
});

test('anon, authenticated and service_role can call keepalive()', async () => {
    const { at } = await as(db, null, tx => one(tx, 'select public.keepalive() as at'));
    assert.ok(at instanceof Date);
    assert.ok(Math.abs(at.getTime() - Date.now()) < 60_000);
    for (const role of ['anon', 'authenticated', 'service_role']) {
        assert.equal((await one(db, "select has_function_privilege($1, 'public.keepalive()', 'execute') as ok", [role])).ok, true, role);
    }
    assert.equal((await one(db, "select has_function_privilege('public', 'public.keepalive()', 'execute') as ok")).ok, false, 'not granted to PUBLIC');
});

test('keepalive() is stable, security invoker, with an empty search_path', async () => {
    const fn = await one(db, `select p.provolatile, p.prosecdef, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'keepalive'`);
    assert.deepEqual(fn, { provolatile: 's', prosecdef: false, proconfig: ['search_path=""'] });
});

test('anon still reaches nothing else', async () => {
    const anon = await rows(db, `select n.nspname || '.' || p.proname as fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public', 'solarflow_private') and has_function_privilege('anon', p.oid, 'execute')`);
    assert.deepEqual(anon, [{ fn: 'public.keepalive' }]);
    await assert.rejects(as(db, null, tx => tx.query('select * from public.app_settings')), /permission denied/);
});

test.after(() => db.close());
