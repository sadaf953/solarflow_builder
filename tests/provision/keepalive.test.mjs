import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runKeepalive } from '../../scripts/keepalive.mjs';
import { KEYS, TOKENS } from './world.mjs';

const AWAKE = 'awakeawakeawakeawake';
const PAUSED = 'pausedpausedpausedpa';
const STALE = 'stalestalestalestale';

// Three provisioned clients: one fine, one paused, one whose job stopped.
function clients(t) {
    const root = mkdtempSync(join(tmpdir(), 'sf-keepalive-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    for (const [slug, ref] of [['awake', AWAKE], ['paused', PAUSED], ['stale', STALE]]) {
        mkdirSync(join(root, slug), { recursive: true });
        writeFileSync(join(root, slug, 'provision-state.json'), JSON.stringify({ slug, supabase: { ref }, files: { folder: `${slug}-solarflow` } }));
        mkdirSync(join(root, `${slug}-solarflow`), { recursive: true });
        writeFileSync(join(root, `${slug}-solarflow`, '.env'), `VITE_SUPABASE_URL=https://${ref}.supabase.co\nVITE_SUPABASE_ANON_KEY=${KEYS.publishable}\n`);
    }
    mkdirSync(join(root, 'not-yet'), { recursive: true });
    writeFileSync(join(root, 'not-yet', 'provision-state.json'), JSON.stringify({ slug: 'not-yet', steps: {} }));
    return root;
}

function fakeSupabase() {
    const calls = [];
    const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    const fetch = async (url, init = {}) => {
        const u = new URL(url);
        calls.push({ method: init.method || 'GET', url: u.href, headers: init.headers || {}, body: init.body ? JSON.parse(init.body) : null });
        const ref = u.host.endsWith('.supabase.co') ? u.host.split('.')[0] : u.pathname.split('/')[3];
        if (u.host.endsWith('.supabase.co')) return ref === PAUSED ? json(540, { message: 'paused' }) : json(200, '2026-10-20T00:00:00Z');
        if (u.pathname === '/v1/projects') return json(200, [{ ref: AWAKE, name: 'awake-solarflow' }, { ref: 'otherotherotherother', name: 'unrelated' }]);
        if (u.pathname.endsWith('/database/query')) {
            const start = ref === STALE ? '2026-10-10T03:00:00Z' : '2026-10-20T03:00:00Z';
            return json(201, [{ jobid: 1, active: true, status: 'succeeded', start_time: start, return_message: '1 row' }]);
        }
        if (u.pathname.endsWith('/api-keys')) return json(200, [{ name: 'default', type: 'publishable', api_key: KEYS.publishable }]);
        return json(200, { ref, status: ref === PAUSED ? 'INACTIVE' : 'ACTIVE_HEALTHY' });
    };
    return { calls, fetch };
}

const now = () => new Date('2026-10-20T12:00:00Z');

test('keepalive: calls every client and reports paused projects and stale jobs', async t => {
    const root = clients(t);
    const { calls, fetch } = fakeSupabase();
    const lines = [];
    const result = await runKeepalive({ root, env: { SUPABASE_ACCESS_TOKEN: TOKENS.supabase }, fetch, now, print: line => lines.push(line), sleep: async () => {} });
    assert.equal(result.ok, false);
    const byName = Object.fromEntries(result.results.map(r => [r.name, r]));
    assert.equal(byName.awake.ok, true);
    assert.equal(byName.paused.ok, false);
    assert.equal(byName.stale.ok, false);
    assert.match(byName.paused.lines.join('\n'), /PAUSED/);
    assert.match(byName.stale.lines.join('\n'), /last ran 249 hours ago/);
    const rpc = calls.filter(c => c.url === `https://${AWAKE}.supabase.co/rest/v1/rpc/keepalive`);
    assert.equal(rpc.length, 1);
    assert.equal(rpc[0].method, 'POST');
    assert.deepEqual(rpc[0].headers, { apikey: KEYS.publishable, 'Content-Type': 'application/json' });
    assert.ok(calls.filter(c => c.url.endsWith('/database/query')).every(c => /cron\.job_run_details/.test(c.body.query)));
    assert.match(lines.join('\n'), /2 of 4 client\(s\) need attention/);
    assert.ok(!lines.join('\n').includes(TOKENS.supabase));
});

test('keepalive without a token only calls keepalive()', async t => {
    const root = clients(t);
    const { calls, fetch } = fakeSupabase();
    const lines = [];
    const result = await runKeepalive({ root, env: {}, fetch, now, print: line => lines.push(line), sleep: async () => {} });
    assert.ok(calls.every(c => c.url.endsWith('/rest/v1/rpc/keepalive')));
    assert.equal(result.results.find(r => r.name === 'awake').ok, true);
    assert.equal(result.results.find(r => r.name === 'stale').ok, true, 'the job is only checked with a token');
    assert.equal(result.results.find(r => r.name === 'paused').ok, false);
    assert.match(lines.join('\n'), /SUPABASE_ACCESS_TOKEN is not set/);
});

test('keepalive --from-api finds <slug>-solarflow projects without state files', async () => {
    const { calls, fetch } = fakeSupabase();
    const result = await runKeepalive({ root: '/nonexistent', env: { SUPABASE_ACCESS_TOKEN: TOKENS.supabase }, fetch, now, print: () => {}, fromApi: true, sleep: async () => {} });
    assert.equal(result.ok, true);
    assert.deepEqual(result.results.map(r => r.name), ['awake']);
    assert.ok(calls.some(c => c.url.endsWith(`/v1/projects/${AWAKE}/api-keys`)));
    await assert.rejects(runKeepalive({ root: '/x', env: {}, fetch, fromApi: true, print: () => {} }), /needs SUPABASE_ACCESS_TOKEN/);
});
