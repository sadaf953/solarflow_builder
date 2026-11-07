import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { runProvision } from '../../scripts/provision/run.js';
import { makeClient } from '../../scripts/make-client.mjs';
import { findSecrets } from '../../scripts/check-secrets.mjs';
import { collectTemplateFiles } from '../../scripts/pack-template.mjs';
import { emailLink } from '../../scripts/provision/emails.js';
import { depsFor, fakeWorld, KEYS, OWNER_EMAIL, REF, SMTP, TOKENS, workspace } from './world.mjs';

const templateFiles = collectTemplateFiles();
const run = (world, ws, options = {}, extra = {}) => {
    const { deps, lines } = depsFor(world, ws, extra);
    const promise = runProvision({ answersPath: ws.answersPath, options: { secretsPath: ws.secretsPath, ...options } }, { templateFiles, ...deps });
    return promise.then(result => ({ ...result, lines, text: lines.join('\n') }), error => Object.assign(error, { lines, text: lines.join('\n') }));
};
const stateOf = ws => JSON.parse(readFileSync(join(ws.root, 'surya', 'provision-state.json'), 'utf8'));
const mgmt = (world, method, path) => world.calls.filter(c => c.host === 'api.supabase.com' && c.method === method && (path instanceof RegExp ? path.test(c.path) : c.path === path));
const netlify = (world, method, path) => world.calls.filter(c => c.host === 'api.netlify.com' && c.method === method && path.test(c.path));

function* walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) yield* walk(path);
        else yield path;
    }
}

test('happy path: every endpoint, method and body', async t => {
    const ws = workspace();
    t.after(() => rmSync(ws.dir, { recursive: true, force: true }));
    const world = fakeWorld();
    const result = await run(world, ws);
    assert.equal(result.ok, true, result.text);

    // Every Management API call carries the agency token, every Netlify call its token.
    for (const call of world.calls.filter(c => c.host === 'api.supabase.com')) assert.equal(call.headers.Authorization, `Bearer ${TOKENS.supabase}`);
    for (const call of world.calls.filter(c => c.host === 'api.netlify.com')) assert.equal(call.headers.Authorization, `Bearer ${TOKENS.netlify}`);

    // Project: organization_slug + region_selection (organization_id and region are deprecated).
    const [create] = mgmt(world, 'POST', '/v1/projects');
    const dbPass = create.body.db_pass;
    assert.deepEqual(Object.keys(create.body).sort(), ['db_pass', 'name', 'organization_slug', 'region_selection']);
    assert.equal(create.body.name, 'surya-solarflow');
    assert.equal(create.body.organization_slug, 'surya-org');
    assert.deepEqual(create.body.region_selection, { type: 'specific', code: 'ap-south-1' });
    assert.match(dbPass, /^[A-Za-z0-9_-]{32}$/);
    assert.ok(result.text.includes(dbPass), 'the password is printed once for the agency');

    // Database: setup.sql exactly as in the client folder, then the keep-alive SQL.
    const queries = mgmt(world, 'POST', `/v1/projects/${REF}/database/query`).map(c => c.body.query);
    const setupSql = readFileSync(join(ws.root, 'surya-solarflow', 'backend', 'setup.sql'), 'utf8');
    assert.equal(queries[0], setupSql);
    assert.match(queries[1], /create extension if not exists pg_cron with schema pg_catalog;/);
    assert.ok(queries[1].includes(`https://${REF}.supabase.co/rest/v1/rpc/keepalive`));
    assert.ok(queries[1].includes(`'apikey', '${KEYS.publishable}'`), 'the job uses the publishable key');

    // Auth settings.
    const [patch] = mgmt(world, 'PATCH', `/v1/projects/${REF}/config/auth`);
    const auth = patch.body;
    assert.equal(auth.site_url, 'https://surya.agency.test');
    assert.equal(auth.uri_allow_list, 'https://surya.agency.test,https://surya.agency.test/**,https://surya-solarflow.netlify.app,https://surya-solarflow.netlify.app/**');
    assert.equal(auth.disable_signup, true);
    assert.equal(auth.external_anonymous_users_enabled, false);
    assert.equal(auth.external_email_enabled, true);
    assert.equal(auth.password_min_length, 8);
    assert.equal(auth.mailer_otp_exp, 86400);
    assert.equal(auth.smtp_host, 'smtp-relay.brevo.com');
    assert.equal(auth.smtp_port, '587');
    assert.equal(auth.smtp_user, SMTP.login);
    assert.equal(auth.smtp_pass, SMTP.key);
    assert.equal(auth.smtp_admin_email, 'crm@surya-solar.example');
    assert.equal(auth.smtp_sender_name, "Surya O'Neil Solar");
    assert.equal(auth.rate_limit_email_sent, 30);
    assert.ok(auth.mailer_templates_invite_content.includes('href="{{ .SiteURL }}/?token_hash={{ .TokenHash }}&type=invite"'));
    assert.ok(auth.mailer_templates_recovery_content.includes('href="{{ .SiteURL }}/?token_hash={{ .TokenHash }}&type=recovery"'));
    assert.equal(emailLink('invite'), '{{ .SiteURL }}/?token_hash={{ .TokenHash }}&type=invite');
    assert.ok(auth.mailer_templates_invite_content.includes('Surya O&#39;Neil Solar'));
    assert.match(auth.mailer_subjects_invite, /Surya O'Neil Solar/);

    // add_user: multipart metadata + file, same JWT check as a dashboard deploy.
    const [deployFn] = mgmt(world, 'POST', `/v1/projects/${REF}/functions/deploy`);
    assert.equal(deployFn.query.get('slug'), 'add_user');
    assert.deepEqual(deployFn.body.metadata, { name: 'add_user', entrypoint_path: 'index.ts', verify_jwt: true });
    assert.deepEqual(deployFn.body.files.map(f => [f.field, f.name]), [['file', 'index.ts']]);
    assert.equal(deployFn.body.files[0].text, readFileSync(new URL('../../template/backend/functions/add_user/index.ts', import.meta.url), 'utf8'));
    const [secrets] = mgmt(world, 'POST', `/v1/projects/${REF}/secrets`);
    assert.deepEqual(secrets.body, [{ name: 'ALLOWED_ORIGIN', value: 'https://surya.agency.test,https://surya-solarflow.netlify.app' }]);

    // Build: .env with the public key only; the agency's shell variables never reach npm.
    const folder = join(ws.root, 'surya-solarflow');
    const dotenv = readFileSync(join(folder, '.env'), 'utf8');
    assert.match(dotenv, new RegExp(`^VITE_SUPABASE_URL=https://${REF}\\.supabase\\.co$`, 'm'));
    assert.match(dotenv, new RegExp(`^VITE_SUPABASE_ANON_KEY=${KEYS.publishable}$`, 'm'));
    assert.deepEqual(world.runs.map(r => [r.command, ...r.args]), [['npm', 'ci'], ['npm', 'run', 'build']]);
    for (const r of world.runs) {
        assert.equal(r.cwd, folder);
        assert.ok(!('VITE_SUPABASE_URL' in r.env) && !('SF_ENV_DIR' in r.env) && !('SUPABASE_ACCESS_TOKEN' in r.env));
        assert.equal(r.env.PATH, process.env.PATH);
    }

    // Netlify: site with the custom domain, zip deploy, HTTPS request.
    const [site] = netlify(world, 'POST', /^\/api\/v1\/sites$/);
    assert.deepEqual(site.body, { name: 'surya-solarflow', custom_domain: 'surya.agency.test' });
    const [upload] = netlify(world, 'POST', /\/sites\/site-1\/deploys$/);
    assert.equal(upload.headers['Content-Type'], 'application/zip');
    assert.ok(upload.body.bytes > 0);
    assert.ok(world.calls.some(c => c.method === 'HEAD' && c.url === 'https://surya.agency.test/'), 'HTTPS is probed');
    assert.equal(netlify(world, 'POST', /\/sites\/site-1\/ssl$/).length, 0, 'no certificate request once HTTPS works');

    // Invite: secret key in the apikey header only, the owner's name as metadata.
    const invite = world.calls.find(c => c.url === `https://${REF}.supabase.co/auth/v1/invite`);
    assert.equal(invite.method, 'POST');
    assert.equal(invite.headers.apikey, KEYS.secret);
    assert.equal(invite.headers.Authorization, undefined);
    assert.deepEqual(invite.body, { email: OWNER_EMAIL, data: { name: 'Asha Patel' } });
    assert.ok(mgmt(world, 'GET', `/v1/projects/${REF}/api-keys`).some(c => c.query.get('reveal') === 'true'));

    // Summary.
    assert.match(result.text, /App: {12}https:\/\/surya\.agency\.test/);
    assert.match(result.text, /on its way/);
    assert.match(result.text, /Developer/);
    assert.match(result.text, /Email \(SMTP\): {3}on \(Brevo/);

    // State: what a re-run needs, nothing secret.
    const state = stateOf(ws);
    assert.equal(state.supabase.ref, REF);
    assert.equal(state.netlify.siteId, 'site-1');
    assert.equal(state.dns.ok, true);
    assert.equal(state.dns.https, true);
    assert.ok(Object.values(state.steps).every(s => s.status === 'done'));

    // No secret anywhere under client-zips (the inputs live elsewhere).
    const forbidden = [dbPass, KEYS.secret, KEYS.service, SMTP.key, TOKENS.supabase, TOKENS.netlify];
    for (const path of walk(ws.root)) {
        const text = readFileSync(path, 'latin1');
        for (const value of forbidden) assert.ok(!text.includes(value), `${path} contains a secret`);
        if (!path.endsWith('.zip')) assert.deepEqual(findSecrets(readFileSync(path, 'utf8')), [], path);
    }
    // Nor in what was printed, apart from the database password.
    for (const value of forbidden.slice(1)) assert.ok(!result.text.includes(value), 'printed a secret');

    // The zip is byte-for-byte what make-client writes with the same inputs.
    const again = makeClient({ submissionPath: ws.answersPath, outDir: join(ws.dir, 'compare'), generatedAt: state.files.generatedAt });
    assert.deepEqual(readFileSync(join(ws.root, 'surya-solarflow.zip')), Buffer.from(again.bytes));

    // ── a second run finds everything and creates nothing ──
    const before = world.calls.length;
    const second = await run(world, ws);
    assert.equal(second.ok, true, second.text);
    const calls = world.calls.slice(before);
    const count = (method, re) => calls.filter(c => c.method === method && re.test(c.url)).length;
    assert.equal(count('POST', /\/v1\/projects$/), 0, 'no second project');
    assert.equal(count('POST', /\/api\/v1\/sites$/), 0, 'no second site');
    assert.equal(count('POST', /\/functions\/deploy/), 0, 'function unchanged');
    assert.equal(count('POST', /\/deploys$/), 0, 'build unchanged');
    assert.equal(count('POST', /\/auth\/v1\/(invite|recover)/), 0, 'no second email');
    assert.ok(!calls.some(c => c.path.endsWith('/database/query') && c.body.query === setupSql), 'setup.sql not run again');
    assert.equal(world.runs.length, 2, 'no second npm ci / build');
    assert.equal(world.jobs.length, 1, 'still one keep-alive job');
    assert.match(second.text, /has not signed in yet/);
    assert.ok(!second.text.includes(dbPass));
    assert.equal(stateOf(ws).supabase.ref, REF);
});

test('--resend-invite sends a recovery email to an owner who never signed in', async t => {
    const ws = workspace();
    t.after(() => rmSync(ws.dir, { recursive: true, force: true }));
    const world = fakeWorld();
    await run(world, ws);
    const before = world.calls.length;
    const result = await run(world, ws, { resendInvite: true, only: 'invite' });
    assert.equal(result.ok, true, result.text);
    const recover = world.calls.slice(before).filter(c => c.path === '/auth/v1/recover');
    assert.equal(recover.length, 1);
    assert.deepEqual(recover[0].body, { email: OWNER_EMAIL });
    assert.equal(recover[0].headers.apikey, KEYS.publishable);
    assert.equal(world.calls.slice(before).filter(c => c.path === '/auth/v1/invite').length, 0);
});

test('dry run makes no network call and writes nothing', async t => {
    const ws = workspace();
    t.after(() => rmSync(ws.dir, { recursive: true, force: true }));
    const world = fakeWorld();
    const result = await run(world, ws, { dryRun: true });
    assert.equal(world.calls.length, 0);
    assert.equal(world.runs.length, 0);
    assert.deepEqual(readdirSync(ws.root), []);
    assert.equal(result.ok, true, result.text);
    assert.match(result.text, /Plan:/);
    assert.match(result.text, /find or create surya-solarflow in the organization surya-org \(Mumbai, ap-south-1\)/);
});

test('a dry run reports missing tokens and go-live problems', async t => {
    const ws = workspace({ goLive: { supabaseOrg: '' }, env: { SUPABASE_ACCESS_TOKEN: '' } });
    t.after(() => rmSync(ws.dir, { recursive: true, force: true }));
    const world = fakeWorld();
    const result = await run(world, ws, { dryRun: true });
    assert.equal(result.ok, false);
    assert.match(result.text, /SUPABASE_ACCESS_TOKEN is not set/);
    assert.match(result.text, /Supabase organization is not known yet/);
    assert.equal(world.calls.length, 0);
});

test('resumes after a failure without repeating finished steps', async t => {
    const ws = workspace();
    t.after(() => rmSync(ws.dir, { recursive: true, force: true }));
    const world = fakeWorld();
    world.failures.push({ match: /^POST \/v1\/projects\/[a-z]+\/functions\/deploy$/, status: 500, times: 10 });
    const failed = await run(world, ws);
    assert.ok(failed instanceof Error);
    assert.match(failed.message, /Stopped at “Staff-login function”/);
    assert.match(failed.message, /run the same command again/);
    const state = stateOf(ws);
    assert.equal(state.steps.function.status, 'failed');
    assert.equal(state.steps.database.status, 'done');
    assert.equal(state.supabase.ref, REF);
    assert.ok(!JSON.stringify(state).includes(TOKENS.supabase));

    world.failures.length = 0;
    const before = world.calls.length;
    const result = await run(world, ws);
    assert.equal(result.ok, true, result.text);
    const calls = world.calls.slice(before);
    assert.equal(calls.filter(c => c.method === 'POST' && c.path === '/v1/projects').length, 0);
    assert.equal(calls.filter(c => c.path.endsWith('/database/query') && /create table if not exists public\.app_roles/.test(c.body.query)).length, 0);
    assert.equal(calls.filter(c => c.path.endsWith('/functions/deploy')).length, 1);
    assert.equal(calls.filter(c => c.path === '/auth/v1/invite').length, 1);
    assert.equal(stateOf(ws).steps.function.status, 'done');
});

test('the free-project limit is explained, with the organizations that count', async t => {
    const ws = workspace();
    t.after(() => rmSync(ws.dir, { recursive: true, force: true }));
    const world = fakeWorld({
        otherOrgs: [{ slug: 'old-client-1', projects: ['old1-solarflow'] }, { slug: 'old-client-2', projects: ['old2-solarflow'] }, { slug: 'paid-client', plan: 'pro', projects: ['big'] }],
        createError: { status: 400, message: 'The following organization members have reached their maximum limits for the number of active free projects within organizations where they are an administrator or owner: agency@ray2volt.test' },
    });
    const failed = await run(world, ws);
    assert.ok(failed instanceof Error);
    assert.match(failed.text, /Owner\/Administrator with active free projects in 2 organization/);
    assert.match(failed.text, /will probably fail/);
    assert.match(failed.text, /free-project limit was reached/);
    assert.match(failed.text, /old-client-1: old1-solarflow/);
    assert.match(failed.text, /change the agency's role to Developer/);
    assert.ok(!/paid-client/.test(failed.text), 'paid organizations do not count');
    assert.equal(stateOf(ws).steps.project.status, 'failed');
    assert.equal(stateOf(ws).supabase, undefined);
});

test('the client\'s own domain: prints the CNAME, uses netlify.app until DNS is in, then switches', async t => {
    const ws = workspace({ goLive: { domainMode: 'own', ownDomain: 'https://CRM.Surya.in/' } });
    t.after(() => rmSync(ws.dir, { recursive: true, force: true }));
    const world = fakeWorld();
    const first = await run(world, ws);
    assert.equal(first.ok, true, first.text);
    assert.match(first.text, /CNAME {2}crm\.surya\.in {2}→ {2}surya-solarflow\.netlify\.app/);
    assert.match(first.text, /"Name" \/ "Host" field is just "crm"/);
    const [site] = netlify(world, 'POST', /^\/api\/v1\/sites$/);
    assert.equal(site.body.custom_domain, 'crm.surya.in');
    const [auth] = mgmt(world, 'PATCH', `/v1/projects/${REF}/config/auth`);
    assert.equal(auth.body.site_url, 'https://surya-solarflow.netlify.app', 'the day-1 invite links to an address that works');
    assert.ok(auth.body.uri_allow_list.includes('https://crm.surya.in'));
    assert.equal(netlify(world, 'POST', /\/ssl$/).length, 0, 'no certificate before DNS');
    assert.equal(world.calls.filter(c => c.path === '/auth/v1/invite').length, 1);
    assert.equal(stateOf(ws).dns.ok, false);

    // The client adds the record; the certificate is not issued yet.
    world.cnames['crm.surya.in'] = 'surya-solarflow.netlify.app';
    let before = world.calls.length;
    const second = await run(world, ws);
    assert.equal(second.ok, true, second.text);
    assert.equal(world.calls.slice(before).filter(c => c.method === 'POST' && /\/ssl$/.test(c.path)).length, 1, 'certificate requested');
    assert.equal(world.calls.slice(before).find(c => c.method === 'PATCH').body.site_url, 'https://surya-solarflow.netlify.app');
    assert.deepEqual([stateOf(ws).dns.ok, stateOf(ws).dns.https], [true, false]);
    assert.match(second.text, /once its HTTPS certificate is ready/);

    // Once HTTPS works, the next run moves the Site URL.
    world.https['crm.surya.in'] = 0;
    before = world.calls.length;
    const third = await run(world, ws);
    assert.equal(third.ok, true, third.text);
    assert.equal(world.calls.slice(before).find(c => c.method === 'PATCH').body.site_url, 'https://crm.surya.in');
    assert.equal(stateOf(ws).auth.siteUrl, 'https://crm.surya.in');
    assert.match(third.text, /App: {12}https:\/\/crm\.surya\.in/);
    assert.equal(world.calls.filter(c => c.path === '/auth/v1/invite').length, 1, 'still one invite');
});

test('DNS is right but no certificate yet: the invite waits ~3 minutes, then uses netlify.app', async t => {
    const ws = workspace();
    t.after(() => rmSync(ws.dir, { recursive: true, force: true }));
    const world = fakeWorld({ https: { 'surya.agency.test': Infinity } });
    const result = await run(world, ws);
    assert.equal(result.ok, true, result.text);
    const patches = world.calls.filter(c => c.method === 'PATCH' && c.path.endsWith('/config/auth'));
    assert.deepEqual(patches.map(c => c.body.site_url), ['https://surya-solarflow.netlify.app']);
    assert.equal(world.calls.filter(c => c.method === 'POST' && /\/ssl$/.test(c.path)).length, 1);
    const probes = world.calls.filter(c => c.method === 'HEAD');
    assert.ok(probes.length >= 12, `kept probing (${probes.length})`);
    assert.match(result.text, /waiting up to 3 minutes/);
    assert.match(result.text, /The owner's link uses https:\/\/surya-solarflow\.netlify\.app; run the same command again later to switch the Site URL to https:\/\/surya\.agency\.test\. Both keep working\./);
    assert.equal(stateOf(ws).invite.siteUrl, 'https://surya-solarflow.netlify.app');

    // A later run, once the certificate is issued, switches the Site URL.
    world.https['surya.agency.test'] = 0;
    await run(world, ws);
    assert.equal(world.calls.filter(c => c.method === 'PATCH').at(-1).body.site_url, 'https://surya.agency.test');
    assert.equal(world.calls.filter(c => c.path === '/auth/v1/invite').length, 1);
});

test('the certificate arrives while the invite waits: Site URL moves first, then the invite', async t => {
    const ws = workspace();
    t.after(() => rmSync(ws.dir, { recursive: true, force: true }));
    const world = fakeWorld({ https: { 'surya.agency.test': 4 } });
    const result = await run(world, ws);
    assert.equal(result.ok, true, result.text);
    const patches = world.calls.map((c, i) => [c, i]).filter(([c]) => c.method === 'PATCH' && c.path.endsWith('/config/auth'));
    assert.deepEqual(patches.map(([c]) => c.body.site_url), ['https://surya-solarflow.netlify.app', 'https://surya.agency.test']);
    const inviteAt = world.calls.findIndex(c => c.path === '/auth/v1/invite');
    assert.ok(inviteAt > patches[1][1], 'the invite goes out after the switch');
    assert.match(result.text, /HTTPS works on surya\.agency\.test \(after/);
    assert.ok(!/The owner's link uses/.test(result.text));
    assert.equal(stateOf(ws).invite.siteUrl, 'https://surya.agency.test');
    assert.equal(stateOf(ws).dns.https, true);
});

test('Cloudflare: adds the CNAME for the agency domain, unproxied', async t => {
    const ws = workspace({ env: { CLOUDFLARE_API_TOKEN: `cf-test-token-${'x'.repeat(24)}`, CLOUDFLARE_ZONE_ID: 'zone1' } });
    t.after(() => rmSync(ws.dir, { recursive: true, force: true }));
    const world = fakeWorld();
    const result = await run(world, ws);
    assert.equal(result.ok, true, result.text);
    const create = world.calls.find(c => c.host === 'api.cloudflare.com' && c.method === 'POST');
    assert.equal(create.path, '/client/v4/zones/zone1/dns_records');
    assert.deepEqual({ ...create.body, comment: undefined }, { type: 'CNAME', name: 'surya.agency.test', content: 'surya-solarflow.netlify.app', ttl: 1, proxied: false, comment: undefined });
    assert.ok(create.headers.Authorization.startsWith('Bearer cf-test-token-'));
    assert.equal(stateOf(ws).dns.via, 'cloudflare');

    await run(world, ws);
    assert.equal(world.calls.filter(c => c.host === 'api.cloudflare.com' && c.method === 'POST').length, 1, 'no duplicate record');
});

test('a taken Netlify name gets a suffix; no SMTP secrets skips SMTP loudly', async t => {
    const ws = workspace({ smtp: false });
    t.after(() => rmSync(ws.dir, { recursive: true, force: true }));
    const world = fakeWorld({ takenNames: ['surya-solarflow'] });
    const result = await run(world, ws);
    assert.equal(result.ok, true, result.text);
    const names = netlify(world, 'POST', /^\/api\/v1\/sites$/).map(c => c.body.name);
    assert.equal(names[0], 'surya-solarflow');
    assert.match(names[1], /^surya-solarflow-[0-9a-f]{4}$/);
    const [auth] = mgmt(world, 'PATCH', `/v1/projects/${REF}/config/auth`);
    assert.equal(auth.body.smtp_host, undefined);
    assert.equal(auth.body.smtp_pass, undefined);
    assert.equal(auth.body.mailer_autoconfirm, true);
    assert.match(result.text, /No SMTP: emails use Supabase's test mailer/);
    assert.match(result.text, /Email \(SMTP\): {3}OFF/);
    assert.ok(stateOf(ws).netlify.netlifyHost.startsWith(`${names[1]}.`));
});

test('a Brevo API key in the secrets file stops the run before any change', async t => {
    const ws = workspace({ smtp: false });
    t.after(() => rmSync(ws.dir, { recursive: true, force: true }));
    const { writeFileSync } = await import('node:fs');
    writeFileSync(ws.secretsPath, `BREVO_SMTP_LOGIN=${SMTP.login}\nBREVO_SMTP_KEY=xkeysib-${'c'.repeat(64)}\n`);
    const world = fakeWorld();
    const failed = await run(world, ws);
    assert.ok(failed instanceof Error);
    assert.match(failed.text, /is a Brevo API key/);
    assert.equal(world.calls.length, 0);
    assert.ok(!existsSync(join(ws.root, 'surya')));
});

test('--import runs the customer file once', async t => {
    const ws = workspace();
    t.after(() => rmSync(ws.dir, { recursive: true, force: true }));
    const { writeFileSync } = await import('node:fs');
    const importFile = join(ws.dir, 'inputs', 'surya-import-customers.sql');
    writeFileSync(importFile, "begin; insert into public.admin(customer_name) values ('Imported'); commit;\n");
    const world = fakeWorld();
    await run(world, ws, { importFile });
    await run(world, ws, { importFile });
    const imports = world.calls.filter(c => c.path.endsWith('/database/query') && c.body.query.includes("'Imported'"));
    assert.equal(imports.length, 1);
    assert.equal(stateOf(ws).database.imports.length, 1);
    assert.ok(statSync(importFile).size > 0);
});

test('after the client makes the agency Developer, a re-run still works', async t => {
    const ws = workspace();
    t.after(() => rmSync(ws.dir, { recursive: true, force: true }));
    const world = fakeWorld();
    await run(world, ws);
    world.role = 'Developer';
    world.authForbidden = true;
    const result = await run(world, ws, { resendInvite: true });
    assert.equal(result.ok, true, result.text);
    assert.match(result.text, /“Developer” in surya-org/);
    assert.match(result.text, /stay as set on the last run/);
    assert.ok(!/change the agency's role in surya-org to Developer/.test(result.text), 'no reminder once it is done');
    assert.equal(stateOf(ws).auth.siteUrl, 'https://surya.agency.test');
});

test('a Developer cannot start a new client', async t => {
    const ws = workspace();
    t.after(() => rmSync(ws.dir, { recursive: true, force: true }));
    const world = fakeWorld({ role: 'Developer' });
    const failed = await run(world, ws);
    assert.ok(failed instanceof Error);
    assert.match(failed.text, /Creating the project needs Owner or Administrator/);
    assert.equal(world.calls.filter(c => c.method !== 'GET').length, 0, 'nothing was changed');
});

test('the client\'s org must have invited the agency', async t => {
    const ws = workspace({ goLive: { supabaseOrg: 'someone-else' } });
    t.after(() => rmSync(ws.dir, { recursive: true, force: true }));
    const world = fakeWorld();
    const failed = await run(world, ws);
    assert.ok(failed instanceof Error);
    assert.match(failed.text, /is not in the client's organization “someone-else”\. Ask the client to invite agency@ray2volt\.test as Administrator/);
});
