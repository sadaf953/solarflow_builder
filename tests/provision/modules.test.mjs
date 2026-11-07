import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { authSettings, redirectList } from '../../scripts/provision/auth.js';
import { checkDns, dnsRecordFor, isApex, probeHttps } from '../../scripts/provision/dns.js';
import { emailLink, escapeHtml, inviteEmail, recoveryEmail } from '../../scripts/provision/emails.js';
import { childEnv, loadAgencyEnv, loadClientSecrets, parseEnvFile } from '../../scripts/provision/env.js';
import { createHttp, keyHeaders, redactHeaders } from '../../scripts/provision/http.js';
import { siteNameFor } from '../../scripts/provision/netlify.js';
import { KEEPALIVE_JOB, keepaliveSql, ownerLookupSql } from '../../scripts/provision/sql.js';
import { saveState } from '../../scripts/provision/state.js';
import { isFreeProjectLimit, pickPublicKey, pickServiceKey } from '../../scripts/provision/supabase.js';
import { jwt, KEYS, REF, SMTP, TOKENS } from './world.mjs';

const tempDir = t => {
    const dir = mkdtempSync(join(tmpdir(), 'sf-provision-unit-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
};

test('email links are exactly the ones the app reads', () => {
    assert.equal(emailLink('invite'), '{{ .SiteURL }}/?token_hash={{ .TokenHash }}&type=invite');
    assert.equal(emailLink('recovery'), '{{ .SiteURL }}/?token_hash={{ .TokenHash }}&type=recovery');
    const invite = inviteEmail({ companyName: 'Acme Solar' });
    const recovery = recoveryEmail({ companyName: 'Acme Solar' });
    assert.equal(invite.html.split(emailLink('invite')).length - 1, 2, 'button and plain link');
    assert.equal(recovery.html.split(emailLink('recovery')).length - 1, 2);
    assert.ok(!invite.html.includes('type=recovery') && !recovery.html.includes('type=invite'));
    assert.ok(!/ConfirmationURL|RedirectTo/.test(invite.html + recovery.html), 'no PKCE ?code= links');
    assert.equal(invite.subject, 'Set your password for Acme Solar');
    assert.equal(recovery.subject, 'Reset your Acme Solar SolarFlow password');
    assert.match(invite.html, /24 hours/);
});

test('a company name cannot inject HTML or template actions', () => {
    const name = 'Ravi & Sons <b>"Solar"</b> {{ .Token }}\n';
    const { subject, html } = inviteEmail({ companyName: name });
    assert.ok(html.includes('Ravi &amp; Sons &lt;b&gt;&quot;Solar&quot;&lt;/b&gt; &#123;&#123; .Token &#125;&#125;'));
    assert.ok(!html.includes('{{ .Token }}') && !html.includes('<b>'));
    assert.equal(subject, 'Set your password for Ravi & Sons <b>"Solar"</b> .Token');
    assert.equal(escapeHtml(`O'Neil`), 'O&#39;Neil');
});

test('auth settings: README step 2, SMTP only with secrets', () => {
    const base = { siteUrl: 'https://acme.agency.in', urls: ['https://acme.agency.in', 'https://acme-solarflow.netlify.app'], companyName: 'Acme', senderEmail: 'crm@acme.in', senderName: 'Acme CRM' };
    const withSmtp = authSettings({ ...base, smtp: SMTP });
    assert.equal(withSmtp.uri_allow_list, 'https://acme.agency.in,https://acme.agency.in/**,https://acme-solarflow.netlify.app,https://acme-solarflow.netlify.app/**');
    assert.equal(withSmtp.smtp_port, '587');
    assert.equal(withSmtp.smtp_sender_name, 'Acme CRM');
    assert.equal(withSmtp.mailer_autoconfirm, false);
    const without = authSettings({ ...base, smtp: null });
    assert.equal(Object.keys(without).filter(k => k.startsWith('smtp_') || k === 'rate_limit_email_sent').length, 0);
    assert.equal(without.mailer_autoconfirm, true);
    assert.equal(authSettings({ ...base, smtp: null, smtpOn: true }).mailer_autoconfirm, false);
    assert.equal(authSettings({ ...base, smtp: null, templates: false }).mailer_templates_invite_content, undefined);
    assert.equal(redirectList(['https://a.in', 'https://a.in', '']), 'https://a.in,https://a.in/**');
});

test('keep-alive SQL: extensions as documented, one job, no injection', () => {
    const sql = keepaliveSql({ ref: REF, publicKey: KEYS.publishable });
    assert.match(sql, /^create extension if not exists pg_cron with schema pg_catalog;$/m);
    assert.match(sql, /^create extension if not exists pg_net with schema extensions;$/m);
    const unschedule = sql.indexOf(`select cron.unschedule(jobid) from cron.job where jobname = '${KEEPALIVE_JOB}';`);
    const schedule = sql.indexOf(`select cron.schedule('${KEEPALIVE_JOB}', '0 3 * * *', $job$`);
    assert.ok(unschedule > 0 && schedule > unschedule, 'unschedule, then schedule');
    assert.ok(sql.includes(`url := 'https://${REF}.supabase.co/rest/v1/rpc/keepalive'`));
    assert.ok(sql.includes(`'apikey', '${KEYS.publishable}'`));
    assert.ok(keepaliveSql({ ref: REF, publicKey: KEYS.anon }).includes(KEYS.anon));
    assert.throws(() => keepaliveSql({ ref: REF, publicKey: "sb_publishable_x'); drop table x; --" }), /publishable/);
    assert.throws(() => keepaliveSql({ ref: REF, publicKey: KEYS.secret }), /publishable/);
    assert.throws(() => keepaliveSql({ ref: "abc'", publicKey: KEYS.publishable }), /not a Supabase project ref/);
    assert.throws(() => ownerLookupSql("x'@y.z"), /not an email/);
    assert.match(ownerLookupSql('Owner@Acme.in'), /lower\('Owner@Acme\.in'\)/);
});

test('keys: publishable before legacy anon, secret before service_role', () => {
    const keys = [
        { name: 'anon', type: 'legacy', api_key: KEYS.anon }, { name: 'service_role', type: 'legacy', api_key: KEYS.service },
        { name: 'default', type: 'publishable', api_key: KEYS.publishable }, { name: 'default', type: 'secret', api_key: KEYS.secret },
    ];
    assert.equal(pickPublicKey(keys), KEYS.publishable);
    assert.equal(pickServiceKey(keys), KEYS.secret);
    assert.equal(pickPublicKey(keys.slice(0, 2)), KEYS.anon);
    assert.equal(pickServiceKey([...keys.slice(0, 2), { type: 'secret', api_key: 'sb_secret_abc····' }]), KEYS.service);
    assert.deepEqual(keyHeaders(KEYS.publishable), { apikey: KEYS.publishable });
    assert.deepEqual(keyHeaders(KEYS.anon), { apikey: KEYS.anon, Authorization: `Bearer ${KEYS.anon}` });
});

test('http: retries 429 and 5xx on idempotent calls only, with backoff', async () => {
    const waits = [];
    const replies = [429, 503, 200];
    const calls = [];
    const fetch = async (url, init) => {
        calls.push(init.method);
        const status = replies.shift();
        return new Response(JSON.stringify({ ok: status === 200 }), { status, headers: status === 429 ? { 'retry-after': '3' } : {} });
    };
    const request = createHttp({ fetch, sleep: async ms => { waits.push(ms); } });
    const res = await request({ service: 'Supabase', url: 'https://api.supabase.com/v1/x' });
    assert.equal(res.status, 200);
    assert.deepEqual(waits, [3000, 2000]);

    const posts = [];
    const failing = createHttp({ fetch: async (url, init) => { posts.push(init.method); return new Response('{"message":"boom"}', { status: 500 }); }, sleep: async () => {} });
    await assert.rejects(failing({ service: 'Supabase', method: 'POST', url: 'https://api.supabase.com/v1/projects', json: {}, idempotent: false, what: 'create the project' }),
        /Supabase refused to create the project \(HTTP 500: boom\)\. Supabase had a problem on its side/);
    assert.equal(posts.length, 1, 'a create is never sent twice');
});

test('http: errors say what to do and never contain a token', async () => {
    const token = TOKENS.supabase;
    const fetch = async () => new Response(JSON.stringify({ message: `bad token ${token}` }), { status: 401 });
    const request = createHttp({ fetch, redact: text => text.split(token).join('[redacted]') });
    const error = await request({ service: 'Supabase', url: 'https://api.supabase.com/v1/profile', headers: { Authorization: `Bearer ${token}` } }).catch(e => e);
    assert.equal(error.status, 401);
    assert.ok(!error.message.includes(token));
    assert.match(error.message, /SUPABASE_ACCESS_TOKEN was refused/);
    assert.deepEqual(redactHeaders({ Authorization: 'Bearer x', apikey: 'y', 'Content-Type': 'a' }), { Authorization: '[redacted]', apikey: '[redacted]', 'Content-Type': 'a' });

    const offline = createHttp({ fetch: async () => { throw new TypeError('fetch failed'); }, sleep: async () => {}, retries: 1 });
    await assert.rejects(offline({ service: 'Netlify', url: 'https://api.netlify.com/api/v1/user', what: 'read the user' }), /Could not reach Netlify to read the user \(fetch failed\)/);
});

test('free-project-limit errors are recognised', () => {
    const error = message => Object.assign(new Error(message), { service: 'Supabase', status: 400 });
    assert.ok(isFreeProjectLimit(error('The following organization members have reached their maximum limits for the number of active free projects')));
    assert.ok(isFreeProjectLimit(error('Free project limit reached')));
    assert.ok(!isFreeProjectLimit(error('Invalid region')));
});

test('env files: agency settings, client secrets, a clean environment for npm', t => {
    const dir = tempDir(t);
    assert.deepEqual(parseEnvFile('# c\nA=1\nexport B="two words"\nC=3 # note\nbad line\n'), { A: '1', B: 'two words', C: '3' });
    writeFileSync(join(dir, '.env.provision'), `SUPABASE_ACCESS_TOKEN=${TOKENS.supabase}\nNETLIFY_AUTH_TOKEN=from-file\n`);
    writeFileSync(join(dir, '.env.local'), 'VITE_AGENCY_DOMAIN=agency.in\n');
    const { values } = loadAgencyEnv({ repoRoot: dir, env: { NETLIFY_AUTH_TOKEN: 'from-shell' } });
    assert.deepEqual(values, { SUPABASE_ACCESS_TOKEN: TOKENS.supabase, NETLIFY_AUTH_TOKEN: 'from-shell', AGENCY_DOMAIN: 'agency.in' });

    assert.deepEqual(loadClientSecrets(join(dir, 'none.env')), { smtp: null, problems: [], warnings: [], path: join(dir, 'none.env'), found: false });
    writeFileSync(join(dir, 'ok.env'), `BREVO_SMTP_LOGIN=${SMTP.login}\nBREVO_SMTP_KEY=${SMTP.key}\n`);
    assert.deepEqual(loadClientSecrets(join(dir, 'ok.env')).smtp, SMTP);
    writeFileSync(join(dir, 'api.env'), `BREVO_SMTP_LOGIN=${SMTP.login}\nBREVO_SMTP_KEY=xkeysib-123\n`);
    assert.match(loadClientSecrets(join(dir, 'api.env')).problems[0], /Brevo API key/);
    assert.equal(loadClientSecrets(join(dir, 'api.env')).smtp, null);
    // Older Brevo SMTP passwords have no prefix: a warning, not a stop.
    writeFileSync(join(dir, 'old.env'), `BREVO_SMTP_LOGIN=${SMTP.login}\nBREVO_SMTP_KEY=Hk3x9QpLmZ2v\n`);
    const old = loadClientSecrets(join(dir, 'old.env'));
    assert.deepEqual([old.smtp, old.problems], [{ login: SMTP.login, key: 'Hk3x9QpLmZ2v' }, []]);
    assert.match(old.warnings[0], /does not start with xsmtpsib-/);

    const clean = childEnv({ PATH: '/bin', HOME: '/h', VITE_SUPABASE_URL: 'x', SF_ENV_DIR: '.', SUPABASE_ACCESS_TOKEN: 't', NETLIFY_AUTH_TOKEN: 't', BREVO_SMTP_KEY: 'k', CLOUDFLARE_API_TOKEN: 'c' });
    assert.deepEqual(clean, { PATH: '/bin', HOME: '/h' });
});

test('the state file refuses secrets', t => {
    const dir = tempDir(t);
    const path = join(dir, 'surya', 'provision-state.json');
    saveState(path, { slug: 'surya', supabase: { ref: REF } }, { secrets: [TOKENS.supabase] });
    assert.equal(JSON.parse(readFileSync(path, 'utf8')).supabase.ref, REF);
    assert.throws(() => saveState(path, { slug: 'surya', leaked: `x${TOKENS.netlify}` }, { secrets: [TOKENS.netlify] }), /Refusing to write a secret/);
    assert.throws(() => saveState(path, { slug: 'surya', key: jwt('service_role', REF) }), /service_role JWT/);
    assert.equal(JSON.parse(readFileSync(path, 'utf8')).leaked, undefined, 'the old file is untouched');
    assert.ok(!existsSync(`${path}.tmp`));
});

test('DNS records and checks', async () => {
    assert.deepEqual(dnsRecordFor('crm.acme.in', 'acme-solarflow.netlify.app'), { type: 'CNAME', name: 'crm.acme.in', value: 'acme-solarflow.netlify.app', apex: false });
    assert.equal(dnsRecordFor('acme.in', 'x.netlify.app').type, 'A');
    assert.ok(isApex('acme.co.in') && !isApex('crm.acme.co.in') && !isApex('acme.agency.com'));
    const resolver = answers => ({
        resolveCname: async host => answers.cname?.[host] || Promise.reject(new Error('ENODATA')),
        resolve4: async host => answers.a?.[host] || Promise.reject(new Error('ENOTFOUND')),
    });
    const target = 'acme-solarflow.netlify.app';
    assert.equal((await checkDns({ hostname: 'crm.acme.in', netlifyHost: target, resolver: resolver({ cname: { 'crm.acme.in': [`${target}.`] } }) })).ok, true);
    assert.equal((await checkDns({ hostname: 'crm.acme.in', netlifyHost: target, resolver: resolver({}) })).ok, false);
    assert.equal((await checkDns({ hostname: 'crm.acme.in', netlifyHost: target, resolver: resolver({ a: { 'crm.acme.in': ['1.2.3.4'] } }) })).answer, 'A 1.2.3.4 (not Netlify)');
    assert.equal((await checkDns({ hostname: 'acme.in', netlifyHost: target, resolver: resolver({ a: { 'acme.in': ['75.2.60.5'] } }) })).ok, true);
});

test('HTTPS probe: any answer counts, a TLS or DNS error does not', async () => {
    const seen = [];
    const answer = await probeHttps({ hostname: 'crm.acme.in', fetch: async (url, init) => { seen.push([url, init.method, init.redirect]); return new Response(null, { status: 404 }); } });
    assert.deepEqual(answer, { ok: true, status: 404 });
    assert.deepEqual(seen, [['https://crm.acme.in/', 'HEAD', 'manual']]);
    const tls = await probeHttps({ hostname: 'crm.acme.in', fetch: async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ERR_TLS_CERT_ALTNAME_INVALID' } }); } });
    assert.deepEqual(tls, { ok: false, reason: 'ERR_TLS_CERT_ALTNAME_INVALID' });
});

test('Netlify site names fit one DNS label', () => {
    assert.equal(siteNameFor('surya'), 'surya-solarflow');
    const long = siteNameFor(`${'a'.repeat(60)}-b`);
    assert.ok(long.length <= 63 && long.endsWith('-solarflow') && !long.includes('--'));
});
