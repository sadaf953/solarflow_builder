// A fake Supabase + Netlify + Cloudflare + DNS + npm for the provisioning
// tests. It keeps just enough state to answer the calls provisioning makes,
// records every call, and never touches the network.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const part = value => Buffer.from(JSON.stringify(value)).toString('base64url');
export const jwt = (role, ref) => `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ iss: 'supabase', ref, role })}.signature-not-checked`;

export const REF = 'qwertyuiopasdfghjklz';
export const TOKENS = Object.freeze({
    supabase: `sbp_${'a'.repeat(40)}`,
    netlify: `nfp_${'N'.repeat(36)}`,
    cloudflare: `cf-test-token-${'x'.repeat(24)}`,
});
export const KEYS = Object.freeze({
    publishable: `sb_publishable_${'P'.repeat(24)}`,
    secret: `sb_secret_${'S'.repeat(32)}`,
    anon: jwt('anon', REF),
    service: jwt('service_role', REF),
});
export const SMTP = Object.freeze({ login: '8a1b2c001@smtp-brevo.com', key: `xsmtpsib-${'b'.repeat(64)}-${'K'.repeat(16)}` });
export const AGENCY = Object.freeze({ id: 'agency-user', email: 'agency@ray2volt.test' });
export const OWNER_EMAIL = 'owner@surya-solar.example';

const fixture = JSON.parse(readFileSync(new URL('../builder/fixtures/submission.json', import.meta.url), 'utf8'));

/** A temp folder with the answers, .env.provision and the client's secrets file. */
export function workspace({ goLive = {}, adminGoLive, smtp = true, env = {} } = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'sf-provision-'));
    const repoRoot = join(dir, 'repo');
    const root = join(dir, 'client-zips');
    const inputs = join(dir, 'inputs');
    for (const folder of [repoRoot, root, inputs]) mkdirSync(folder, { recursive: true });
    const answers = {
        submission: {
            ...fixture,
            goLive: {
                domainMode: 'ours', ownDomain: '', supabaseOrg: 'surya-org', supabaseInvited: true,
                senderEmail: 'crm@surya-solar.example', senderName: '', brevoReady: true, ...goLive,
            },
        },
        slug: 'surya',
        ownerEmail: OWNER_EMAIL,
        ...(adminGoLive ? { goLive: adminGoLive } : {}),
    };
    const answersPath = join(inputs, 'surya-answers.json');
    writeFileSync(answersPath, JSON.stringify(answers, null, 2));
    const agencyEnv = {
        SUPABASE_ACCESS_TOKEN: TOKENS.supabase, NETLIFY_AUTH_TOKEN: TOKENS.netlify, AGENCY_DOMAIN: 'agency.test', ...env,
    };
    writeFileSync(join(repoRoot, '.env.provision'), Object.entries(agencyEnv).map(([k, v]) => `${k}=${v}`).join('\n'));
    const secretsPath = join(inputs, 'surya.secrets.env');
    if (smtp) writeFileSync(secretsPath, `BREVO_SMTP_LOGIN=${SMTP.login}\nBREVO_SMTP_KEY=${SMTP.key}\n`);
    return { dir, repoRoot, root, answersPath, secretsPath };
}

async function readBody(body) {
    if (body == null) return null;
    if (typeof body === 'string') {
        try { return JSON.parse(body); } catch { return body; }
    }
    if (body instanceof FormData) {
        const out = { files: [] };
        for (const [name, value] of body.entries()) {
            if (name === 'metadata') out.metadata = JSON.parse(value);
            else out.files.push({ field: name, name: value.name, text: await value.text() });
        }
        return out;
    }
    if (body instanceof Uint8Array) return { bytes: body.length };
    return String(body);
}

export function fakeWorld(options = {}) {
    const world = {
        calls: [],
        failures: [],               // [{match: 'POST /path', status, times, body}]
        createError: options.createError || null,
        role: options.role || 'Administrator',
        plan: options.plan || 'free',
        otherOrgs: options.otherOrgs || [],
        statusSequence: [...(options.statusSequence || ['COMING_UP', 'COMING_UP', 'ACTIVE_HEALTHY'])],
        projects: new Map(options.existingProjects || []),
        auth: {}, functions: {}, secrets: {}, users: [], jobs: [],
        sites: new Map(), deploys: new Map(), takenNames: new Set(options.takenNames || []),
        // The agency domain is on Netlify DNS unless a test says otherwise.
        dnsZones: options.dnsZones || [{ id: 'zone-agency', name: 'agency.test' }], dnsRecords: options.dnsRecords || {},
        cloudflareZone: options.cloudflareZone || 'agency.test', cloudflareRecords: [],
        cnames: { ...(options.cnames || {}) }, addresses: { ...(options.addresses || {}) },
        // HTTPS probes: host -> how many probes fail (certificate not issued
        // yet) before it answers. A host not listed never answers.
        https: { 'surya.agency.test': 0, ...(options.https || {}) },
    };
    const json = (status, body, headers = {}) => new Response(body === undefined ? '' : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

    async function supabaseMgmt(method, path, query, body) {
        const orgs = [{ id: 'o1', slug: 'surya-org', name: 'Surya Solar' }, ...world.otherOrgs.map((o, i) => ({ id: `x${i}`, slug: o.slug, name: o.slug }))];
        let m;
        if (method === 'GET' && path === '/v1/profile') return json(200, { gotrue_id: AGENCY.id, primary_email: AGENCY.email, username: 'agency' });
        if (method === 'GET' && path === '/v1/organizations') return json(200, orgs);
        if ((m = path.match(/^\/v1\/organizations\/([\w-]+)\/members$/))) {
            const other = world.otherOrgs.find(o => o.slug === m[1]);
            return json(200, [
                { user_id: AGENCY.id, user_name: 'agency', email: AGENCY.email, role_name: other ? other.role || 'Administrator' : world.role, mfa_enabled: false, avatar_url: null },
                { user_id: 'client-user', user_name: 'client', email: 'client@surya.test', role_name: 'Owner', mfa_enabled: false, avatar_url: null },
            ]);
        }
        if ((m = path.match(/^\/v1\/organizations\/([\w-]+)\/projects$/))) {
            const other = world.otherOrgs.find(o => o.slug === m[1]);
            let list = other ? (other.projects || []).map((name, i) => ({ ref: `other${i}`.padEnd(20, 'z'), name, status: 'ACTIVE_HEALTHY', is_branch: false, region: 'ap-south-1' }))
                : [...world.projects.values()].map(p => ({ ref: p.ref, name: p.name, status: p.status, is_branch: false, region: p.region }));
            if (query.get('search')) list = list.filter(p => p.name.includes(query.get('search')));
            return json(200, { projects: list, pagination: { count: list.length, limit: 100, offset: 0 } });
        }
        if ((m = path.match(/^\/v1\/organizations\/([\w-]+)$/))) {
            const other = world.otherOrgs.find(o => o.slug === m[1]);
            return json(200, { id: m[1], name: m[1], plan: other ? other.plan || 'free' : world.plan, opt_in_tags: [], allowed_release_channels: [] });
        }
        if (method === 'POST' && path === '/v1/projects') {
            if (world.createError) return json(world.createError.status, { message: world.createError.message });
            world.projects.set(REF, { ref: REF, name: body.name, organization_slug: body.organization_slug, region: body.region_selection.code, status: 'COMING_UP' });
            return json(201, { id: REF, ref: REF, organization_id: 'o1', organization_slug: body.organization_slug, name: body.name, region: body.region_selection.code, created_at: '2026-10-20T00:00:00Z', status: 'COMING_UP' });
        }
        if ((m = path.match(/^\/v1\/projects\/([a-z]{20})(\/.*)?$/))) {
            const p = world.projects.get(m[1]);
            if (!p) return json(404, { message: 'Project not found' });
            const rest = m[2] || '';
            if (method === 'GET' && rest === '') {
                if (p.status !== 'ACTIVE_HEALTHY' && p.status !== 'INACTIVE') p.status = world.statusSequence.shift() || 'ACTIVE_HEALTHY';
                return json(200, { ...p, organization_id: 'o1', created_at: '2026-10-20T00:00:00Z', database: {} });
            }
            if (rest === '/health') return json(200, ['db', 'auth', 'rest'].map(name => ({ name, healthy: true, status: 'ACTIVE_HEALTHY' })));
            if (rest === '/database/query') return json(201, runQuery(m[1], body.query));
            if (rest === '/api-keys') {
                const reveal = query.get('reveal') === 'true';
                return json(200, [
                    { name: 'anon', type: 'legacy', api_key: KEYS.anon },
                    { name: 'service_role', type: 'legacy', api_key: KEYS.service },
                    { name: 'default', type: 'publishable', api_key: KEYS.publishable },
                    { name: 'default', type: 'secret', api_key: reveal ? KEYS.secret : 'sb_secret_SSSS················' },
                ]);
            }
            if (rest === '/config/auth' && method === 'GET') return json(200, world.auth[m[1]] || { site_url: 'http://localhost:3000', smtp_host: null });
            if (rest === '/config/auth' && method === 'PATCH') {
                if (world.authForbidden) return json(403, { message: 'Forbidden' });
                world.auth[m[1]] = { ...(world.auth[m[1]] || {}), ...body };
                return json(200, world.auth[m[1]]);
            }
            if (rest === '/functions/deploy' && method === 'POST') {
                const slug = query.get('slug');
                const version = (world.functions[slug]?.version || 0) + 1;
                world.functions[slug] = { id: 'fn1', slug, name: slug, status: 'ACTIVE', version, verify_jwt: body.metadata.verify_jwt };
                return json(201, world.functions[slug]);
            }
            if ((m = rest.match(/^\/functions\/([\w-]+)$/))) {
                const fn = world.functions[m[1]];
                return fn ? json(200, fn) : json(404, { message: 'Function not found' });
            }
            if (rest === '/secrets' && method === 'POST') {
                if (world.authForbidden) return json(403, { message: 'Forbidden' });
                for (const { name, value } of body) world.secrets[name] = value;
                return json(201);
            }
        }
        return json(404, { message: `fake: no route ${method} ${path}` });
    }

    function runQuery(ref, sql) {
        let m;
        if ((m = sql.match(/from auth\.users where lower\(email\) = lower\('([^']+)'\)/))) {
            return world.users.filter(u => u.email.toLowerCase() === m[1].toLowerCase()).map(u => ({ id: u.id, email: u.email, invited_at: u.invited_at, email_confirmed_at: null, last_sign_in_at: u.last_sign_in_at || null }));
        }
        if ((m = sql.match(/from public\.profiles where id = '([^']+)'/))) {
            const user = world.users.find(u => u.id === m[1]);
            return user ? [{ user_type: user.email === OWNER_EMAIL ? 'admin' : 'pending', status: user.email === OWNER_EMAIL ? 'active' : 'inactive' }] : [];
        }
        if (/cron\.schedule/.test(sql)) {
            world.jobs = [{ jobid: 1, sql }];
            return [{ jobid: 1 }];
        }
        if (/from cron\.job j/.test(sql)) return world.jobs.length ? [{ jobid: 1, schedule: '0 3 * * *', active: true, status: 'succeeded', start_time: '2026-10-20T03:00:00Z', end_time: '2026-10-20T03:00:01Z', return_message: '1 row' }] : [];
        return [];
    }

    async function projectHost(ref, method, path, headers, body) {
        if (!world.projects.has(ref)) return json(404, {});
        if (path === '/auth/v1/invite' && method === 'POST') {
            if (![KEYS.secret, KEYS.service].includes(headers.apikey)) return json(401, { msg: 'admin only' });
            const user = { id: randomUUID(), email: body.email, invited_at: '2026-10-20T00:10:00Z', data: body.data };
            world.users.push(user);
            return json(200, user);
        }
        if (path === '/auth/v1/recover' && method === 'POST') return json(200, {});
        if (path === '/rest/v1/rpc/keepalive' && method === 'POST') {
            if (world.projects.get(ref).status === 'INACTIVE') return json(540, { message: 'project paused' });
            return json(200, '2026-10-20T03:00:00+00:00');
        }
        return json(404, {});
    }

    // Netlify DNS adds the record itself when a site in the team gets a
    // custom domain inside one of its zones.
    const netlifyRecord = site => {
        const zone = world.dnsZones.find(z => site.custom_domain?.endsWith(`.${z.name}`));
        if (!zone) return;
        const records = (world.dnsRecords[zone.id] ||= []);
        if (!records.some(r => r.hostname === site.custom_domain)) records.push({ id: `r${records.length}`, hostname: site.custom_domain, type: 'NETLIFY', value: `${site.name}.netlify.app` });
    };

    async function netlify(method, path, query, body) {
        let m;
        if (path === '/user') return json(200, { id: 'n1', email: 'agency@ray2volt.test' });
        if (path === '/accounts') return json(200, [{ id: 'a1', slug: 'ray2volt' }]);
        if (method === 'GET' && (m = path.match(/^(?:\/[\w-]+)?\/sites$/))) {
            const name = query.get('name') || '';
            return json(200, [...world.sites.values()].filter(s => s.name.includes(name)));
        }
        if (method === 'POST' && /^(?:\/[\w-]+)?\/sites$/.test(path)) {
            if (world.takenNames.has(body.name) || [...world.sites.values()].some(s => s.name === body.name)) {
                return json(422, { code: 422, message: 'Unprocessable Entity', errors: { subdomain: ['must be unique'] } });
            }
            const site = { id: `site-${world.sites.size + 1}`, name: body.name, custom_domain: body.custom_domain, admin_url: `https://app.netlify.com/sites/${body.name}`, published_deploy: null };
            world.sites.set(site.id, site);
            netlifyRecord(site);
            return json(201, site);
        }
        if ((m = path.match(/^\/sites\/([\w-]+)$/))) {
            const site = world.sites.get(m[1]);
            if (!site) return json(404, { message: 'Not Found' });
            if (method === 'PATCH') {
                Object.assign(site, body);
                netlifyRecord(site);
            }
            return json(200, site);
        }
        if ((m = path.match(/^\/sites\/([\w-]+)\/deploys$/)) && method === 'POST') {
            const deploy = { id: `deploy-${world.deploys.size + 1}`, site_id: m[1], state: 'uploaded', polls: 0 };
            world.deploys.set(deploy.id, deploy);
            return json(200, { id: deploy.id, state: deploy.state });
        }
        if ((m = path.match(/^\/deploys\/([\w-]+)$/))) {
            const deploy = world.deploys.get(m[1]);
            deploy.polls += 1;
            deploy.state = deploy.polls >= 2 ? 'ready' : 'processing';
            if (deploy.state === 'ready') world.sites.get(deploy.site_id).published_deploy = { id: deploy.id };
            return json(200, { id: deploy.id, state: deploy.state });
        }
        if ((m = path.match(/^\/sites\/([\w-]+)\/ssl$/))) {
            const site = world.sites.get(m[1]);
            return json(200, { state: 'pending', domains: [site.custom_domain] });
        }
        if (path === '/dns_zones') return json(200, world.dnsZones);
        if ((m = path.match(/^\/dns_zones\/([\w-]+)\/dns_records$/))) return json(200, world.dnsRecords[m[1]] || []);
        return json(404, { message: `fake: no route ${method} ${path}` });
    }

    async function cloudflare(method, path, query, body) {
        const cf = (status, result) => json(status, { success: status < 300, errors: [], messages: [], result });
        if (method === 'GET' && /^\/zones\/[\w-]+$/.test(path)) return cf(200, { id: 'zone1', name: world.cloudflareZone });
        if (method === 'GET' && /\/dns_records$/.test(path)) return cf(200, world.cloudflareRecords.filter(r => r.name === query.get('name.exact')));
        if (method === 'POST' && /\/dns_records$/.test(path)) {
            const record = { id: `rec${world.cloudflareRecords.length + 1}`, ...body };
            world.cloudflareRecords.push(record);
            return cf(200, record);
        }
        return cf(404, null);
    }

    world.fetch = async (url, init = {}) => {
        const u = new URL(url);
        const method = init.method || 'GET';
        const headers = { ...(init.headers || {}) };
        const body = await readBody(init.body);
        const call = { method, url: u.href, host: u.host, path: u.pathname, query: u.searchParams, headers, body };
        world.calls.push(call);
        if (method === 'HEAD' && u.pathname === '/') {
            const left = world.https[u.host];
            if (left === undefined || left > 0) {
                if (left !== undefined) world.https[u.host] = left - 1;
                throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ERR_TLS_CERT_ALTNAME_INVALID' } });
            }
            return new Response(null, { status: 200 });
        }
        const failure = world.failures.find(f => f.times > 0 && `${method} ${u.pathname}`.match(f.match));
        if (failure) {
            failure.times -= 1;
            return json(failure.status, failure.body || { message: 'fake failure' });
        }
        if (u.host === 'api.supabase.com') return supabaseMgmt(method, u.pathname, u.searchParams, body);
        if (u.host.endsWith('.supabase.co')) return projectHost(u.host.split('.')[0], method, u.pathname, headers, body);
        if (u.host === 'api.netlify.com') return netlify(method, u.pathname.replace(/^\/api\/v1/, ''), u.searchParams, body);
        if (u.host === 'api.cloudflare.com') return cloudflare(method, u.pathname.replace(/^\/client\/v4/, ''), u.searchParams, body);
        throw new Error(`fake: unexpected host ${u.host}`);
    };

    world.resolver = {
        resolveCname: async host => {
            if (world.cnames[host]) return [world.cnames[host]];
            throw Object.assign(new Error('ENODATA'), { code: 'ENODATA' });
        },
        resolve4: async host => {
            if (world.addresses[host]) return world.addresses[host];
            throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' });
        },
    };

    world.runs = [];
    // npm ci / npm run build: the build writes dist/ with the Supabase host
    // in the CSP and the public key in a bundle, as the real one does.
    world.runner = async (command, args, { cwd, env }) => {
        world.runs.push({ command, args, cwd, env });
        if (world.buildFails && args.join(' ') === 'run build') throw new Error('npm run build failed (exit code 1)');
        if (args.join(' ') !== 'run build') return;
        const dotenv = Object.fromEntries(readFileSync(join(cwd, '.env'), 'utf8').split('\n').filter(l => l.includes('=') && !l.startsWith('#')).map(l => l.split(/=(.*)/s).slice(0, 2)));
        mkdirSync(join(cwd, 'dist', 'assets'), { recursive: true });
        writeFileSync(join(cwd, 'dist', 'index.html'), `<meta http-equiv="Content-Security-Policy" content="connect-src 'self' ${new URL(dotenv.VITE_SUPABASE_URL).origin}"><div id="root"></div>`);
        writeFileSync(join(cwd, 'dist', 'assets', 'index.js'), `const url=${JSON.stringify(dotenv.VITE_SUPABASE_URL)},key=${JSON.stringify(dotenv.VITE_SUPABASE_ANON_KEY)};`);
    };

    let clock = Date.parse('2026-10-20T10:00:00Z');
    world.now = () => new Date(clock);
    world.sleep = async ms => { clock += ms; };

    world.find = (method, pattern) => world.calls.filter(c => c.method === method && (typeof pattern === 'string' ? c.path === pattern : pattern.test(c.path)));
    return world;
}

/** deps for runProvision against this world. */
export function depsFor(world, ws, extra = {}) {
    const lines = [];
    return {
        lines,
        deps: {
            repoRoot: ws.repoRoot, root: ws.root,
            env: { PATH: process.env.PATH, VITE_SUPABASE_URL: 'https://wrong-project.supabase.co', SF_ENV_DIR: '/elsewhere', ...extra.env },
            fetch: world.fetch, runner: world.runner, resolver: world.resolver, sleep: world.sleep, now: world.now,
            print: line => lines.push(line), pollMs: 5000, ...extra.deps,
        },
    };
}
