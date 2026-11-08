// The agency's weekly health check, and a second keep-alive layer: free
// Supabase projects pause after 7 days without activity, and each client's
// daily pg_cron job (set up by provisioning) is the first layer.
//
//   npm run keepalive                 every client in client-zips/*/provision-state.json
//   npm run keepalive -- --from-api   every project named <slug>-solarflow that
//                                     SUPABASE_ACCESS_TOKEN can see (for CI, where
//                                     there are no state files)
//
// For each client it calls keepalive() with the public key and, with
// SUPABASE_ACCESS_TOKEN (from the environment or .env.provision), reports the
// project status and the daily job's last run. Exits 1 when any client is
// paused, unhealthy or its job is failing. docs/PROVISIONING.md has cron,
// launchd and GitHub Actions examples.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { loadAgencyEnv, parseEnvFile } from './provision/env.js';
import { createHttp } from './provision/http.js';
import { lastKeepaliveRunSql, KEEPALIVE_JOB } from './provision/sql.js';
import { listStates } from './provision/state.js';
import { pickPublicKey, projectApi, supabaseApi } from './provision/supabase.js';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const USAGE = 'Usage: npm run keepalive [-- --from-api] [--root client-zips]';

// The daily job may run late or skip a day; older than this is a failure.
export const STALE_HOURS = 36;

function targetsFromStates(root) {
    return listStates(root).map(({ path, state }) => {
        if (!state?.supabase?.ref) return { name: path, problem: 'no Supabase project in this state file yet' };
        const envPath = state.files?.folder ? join(root, state.files.folder, '.env') : '';
        const env = envPath && existsSync(envPath) ? parseEnvFile(readFileSync(envPath, 'utf8')) : {};
        return { name: state.slug, ref: state.supabase.ref, publicKey: env.VITE_SUPABASE_ANON_KEY || null };
    });
}

/** -> {ok, results: [{name, ref, ok, lines}]} */
export async function runKeepalive({ root, env = {}, fetch = globalThis.fetch, print = console.log, now = () => new Date(), fromApi = false, sleep }) {
    const token = env.SUPABASE_ACCESS_TOKEN;
    const redact = text => (token ? String(text).split(token).join('[redacted]') : String(text));
    const request = createHttp({ fetch, sleep, redact, retries: 2 });
    const api = token ? supabaseApi({ request, token }) : null;
    if (fromApi && !api) throw new Error('--from-api needs SUPABASE_ACCESS_TOKEN.');

    const targets = fromApi
        ? (await request({ service: 'Supabase', url: 'https://api.supabase.com/v1/projects', headers: { Authorization: `Bearer ${token}` }, what: 'list projects' })).data
            .filter(p => /-solarflow$/.test(p.name)).map(p => ({ name: p.name.replace(/-solarflow$/, ''), ref: p.ref, publicKey: null }))
        : targetsFromStates(root);
    if (!targets.length) {
        print(fromApi ? 'No projects named <slug>-solarflow are visible to this token.' : `No provisioned clients in ${root}.`);
        return { ok: true, results: [] };
    }
    if (!api) print('(SUPABASE_ACCESS_TOKEN is not set: only calling keepalive(), not checking project status or the daily job.)');

    const results = [];
    for (const target of targets) {
        const lines = [];
        let ok = true;
        const fail = line => { ok = false; lines.push(`✗ ${line}`); };
        if (target.problem) {
            results.push({ name: target.name, ok: true, lines: [`- skipped: ${target.problem}`] });
            continue;
        }
        try {
            if (api) {
                const info = await api.project(target.ref);
                if (!info) fail('the project no longer exists');
                else if (info.status === 'INACTIVE') fail('PAUSED. Ask the client to restore it (Supabase → the project → Restore project); a Developer cannot.');
                else if (info.status !== 'ACTIVE_HEALTHY') fail(`status ${info.status}`);
                else lines.push('✓ project healthy');
            }
            let key = target.publicKey;
            if (!key && api) key = pickPublicKey(await api.apiKeys(target.ref));
            if (!key) fail('no public key (no client folder .env and no SUPABASE_ACCESS_TOKEN)');
            else {
                const res = await projectApi({ request, ref: target.ref }).rpc(key, 'keepalive', { allow: [400, 401, 403, 404, 500, 502, 503, 504, 540, 544] });
                if (res.status === 200) lines.push('✓ keepalive() answered');
                else fail(`keepalive() answered HTTP ${res.status}${res.status === 404 ? ' (setup.sql predates it: run provision --only database)' : ''}`);
            }
            if (api && ok) {
                const run = (await api.query(target.ref, lastKeepaliveRunSql(), 'read the keep-alive job'))?.[0];
                const ageHours = run?.start_time ? (now().getTime() - new Date(run.start_time).getTime()) / 3_600_000 : null;
                if (!run) fail(`no ${KEEPALIVE_JOB} job: run npm run provision -- <answers.json> --only keepalive`);
                else if (run.active === false) fail(`the ${KEEPALIVE_JOB} job is switched off`);
                else if (!run.status) fail(`the ${KEEPALIVE_JOB} job has not run yet`);
                else if (run.status !== 'succeeded') fail(`the last daily run ${run.status}: ${run.return_message || 'no message'}`);
                else if (ageHours > STALE_HOURS) fail(`the daily job last ran ${Math.round(ageHours)} hours ago`);
                else lines.push(`✓ daily job ran ${run.start_time}`);
            }
        } catch (error) {
            fail(redact(error.message));
        }
        results.push({ name: target.name, ref: target.ref, ok, lines });
    }

    for (const result of results) {
        print(`${result.ok ? '✓' : '✗'} ${result.name}${result.ref ? ` (${result.ref})` : ''}`);
        for (const line of result.lines) print(`    ${line}`);
    }
    const failing = results.filter(r => !r.ok);
    print(failing.length ? `\n✗ ${failing.length} of ${results.length} client(s) need attention.` : `\n✓ All ${results.length} client(s) are awake.`);
    return { ok: !failing.length, results };
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] || '')).href) {
    let args;
    try {
        args = parseArgs({ options: { 'from-api': { type: 'boolean' }, root: { type: 'string' }, help: { type: 'boolean', short: 'h' } } });
    } catch (error) {
        console.error(`${error.message}\n${USAGE}`);
        process.exit(1);
    }
    if (args.values.help) {
        console.log(USAGE);
        process.exit(0);
    }
    try {
        const { values } = loadAgencyEnv({ repoRoot, env: process.env });
        const { ok } = await runKeepalive({
            root: resolve(repoRoot, args.values.root || 'client-zips'),
            env: values,
            fromApi: args.values['from-api'],
        });
        process.exit(ok ? 0 : 1);
    } catch (error) {
        console.error(`✗ ${error.message}`);
        process.exit(1);
    }
}
