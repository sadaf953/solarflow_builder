// The provisioning steps, in order. Each one finds what already exists
// (from the state file or the service) before it creates anything, records
// what it did in the state, and can be run again on its own with --only.
// `plan` describes the step for --dry-run without any network call.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { supabaseEnvProblem } from '../../template/src/lib/env.js';
import { findSecrets } from '../check-secrets.mjs';
import { makeClient } from '../make-client.mjs';
import { authSettings } from './auth.js';
import { checkDns, describeRecord, dnsRecordFor, probeHttps } from './dns.js';
import { childEnv } from './env.js';
import { extractZip, sha256, textFiles, zipFolder } from './files.js';
import { isNameTaken, siteNameFor } from './netlify.js';
import { KEEPALIVE_JOB, KEEPALIVE_SCHEDULE, keepaliveSql, ownerLookupSql, profileSql } from './sql.js';
import { isFreeProjectLimit, pickPublicKey, pickServiceKey, projectApi, projectUrl } from './supabase.js';

// South Asia (Mumbai), as README.client.md asks.
export const REGION = 'ap-south-1';
export const FUNCTION_SLUG = 'add_user';
// "You are entitled to two active free projects" (platform/billing-faq).
export const FREE_PROJECT_LIMIT = 2;
const ADMIN_ROLE = /^(owner|admin)/i;
const NOT_COUNTED = new Set(['INACTIVE', 'REMOVED', 'PAUSING', 'GOING_DOWN', 'INIT_FAILED']);

const at = ctx => ctx.now().toISOString();
const shown = value => value || '(not set)';
const minutes = ms => `${Math.floor(ms / 60000)}m ${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}s`;

function requireRef(ctx) {
    const ref = ctx.state.supabase?.ref;
    if (!ref) throw new Error('There is no Supabase project for this client yet. Run the command without --only first.');
    return ref;
}
function requireSite(ctx) {
    const site = ctx.state.netlify;
    if (!site?.siteId) throw new Error('There is no Netlify site for this client yet. Run the command without --only first.');
    return site;
}
const netlifyUrl = ctx => (ctx.state.netlify?.netlifyHost ? `https://${ctx.state.netlify.netlifyHost}` : '');

/**
 * The address emails and Auth use right now: the custom address (agency
 * domain or the client's own) only once HTTPS really works there; until
 * then the site's netlify.app address, so a link sent today never opens on a
 * certificate error. A re-run switches over; both addresses keep working.
 */
export function liveUrl(ctx) {
    const httpsOk = ctx.state.dns?.https && ctx.state.dns.hostname === ctx.goLive.hostname;
    return httpsOk ? ctx.goLive.siteUrl : netlifyUrl(ctx) || ctx.goLive.siteUrl;
}

async function checkHttps(ctx) {
    const probe = await probeHttps({ fetch: ctx.fetch, hostname: ctx.goLive.hostname });
    ctx.state.dns = { ...ctx.state.dns, https: probe.ok, httpsCheckedAt: at(ctx) };
    return probe;
}

async function publicKey(ctx) {
    if (!ctx.memo.publicKey) {
        const key = pickPublicKey(await ctx.supabase.apiKeys(requireRef(ctx)));
        if (!key) throw new Error('The project has no publishable or anon key. Create a publishable key in Supabase → Project Settings → API Keys, then run again.');
        ctx.memo.publicKey = key;
    }
    return ctx.memo.publicKey;
}

// ── preflight (network part; the local checks are in run.js) ─────────────

export async function preflightNetwork(ctx) {
    const problems = [];
    const { supabase, netlify, cloudflare, goLive } = ctx;
    const org = goLive.supabaseOrg;

    const me = await supabase.profile();
    ctx.memo.me = me;
    const orgs = await supabase.organizations();
    const target = orgs.find(o => o.slug === org);
    if (!target) {
        problems.push(`The agency's Supabase account (${me?.primary_email || 'unknown'}) is not in the client's organization “${org}”. Ask the client to invite ${me?.primary_email || 'it'} as Administrator (Supabase → Organization settings → Team → Invite member), accept the invite, then run again.`);
    }

    // Who we are in every organization, and the active free projects that
    // count against the limit (Owner/Administrator in free organizations).
    const isMe = m => (me?.gotrue_id && m.user_id === me.gotrue_id) || (me?.primary_email && String(m.email || '').toLowerCase() === me.primary_email.toLowerCase());
    const usage = [];
    for (const o of orgs) {
        const members = await supabase.members(o.slug);
        const role = members?.find(isMe)?.role_name || '';
        if (o.slug === org) ctx.memo.role = role || 'unknown';
        if (!ADMIN_ROLE.test(role)) continue;
        const plan = (await supabase.organization(o.slug))?.plan || 'unknown';
        if (o.slug === org) ctx.memo.orgPlan = plan;
        if (plan !== 'free') continue;
        const active = (await supabase.orgProjects(o.slug)).filter(p => !p.is_branch && !NOT_COUNTED.has(p.status));
        if (active.length) usage.push({ org: o.slug, name: o.name, role, projects: active.map(p => p.name) });
    }
    ctx.memo.freeUsage = usage;
    const used = usage.reduce((sum, u) => sum + u.projects.length, 0);
    if (usage.length) {
        ctx.note(`The agency is Owner/Administrator with active free projects in ${usage.length} organization(s) (${used} project(s); Supabase allows ${FREE_PROJECT_LIMIT}):`);
        for (const u of usage) ctx.note(`    ${u.org} (${u.role}): ${u.projects.join(', ')}`);
    }

    if (target) {
        const role = ctx.memo.role;
        const hasProject = Boolean(ctx.state.supabase?.ref);
        if (!ADMIN_ROLE.test(role) && !hasProject) {
            problems.push(`The agency is “${role}” in ${org}. Creating the project needs Owner or Administrator: ask the client to change the role (Organization settings → Team), then run again.`);
        } else if (!ADMIN_ROLE.test(role)) {
            ctx.warn(`The agency is “${role}” in ${org}: the Auth settings and function secrets keep their earlier values (they need Administrator).`);
        }
        if (!hasProject && ctx.memo.orgPlan === 'free' && used >= FREE_PROJECT_LIMIT) {
            ctx.warn(`Creating ${ctx.names.project} will probably fail: the agency already counts ${used} active free project(s) as Owner/Administrator. Ask earlier clients to change the agency's role to Developer first (see docs/PROVISIONING.md).`);
        }
    }

    const user = await netlify.user();
    ctx.memo.netlifyUser = user?.email || user?.full_name || 'ok';
    if (ctx.env.NETLIFY_ACCOUNT_SLUG) {
        const teams = await netlify.accounts();
        if (!teams.some(t => t.slug === ctx.env.NETLIFY_ACCOUNT_SLUG)) problems.push(`NETLIFY_ACCOUNT_SLUG “${ctx.env.NETLIFY_ACCOUNT_SLUG}” is not one of this token's Netlify teams (${teams.map(t => t.slug).join(', ') || 'none'}).`);
    }
    if (cloudflare && goLive.domainMode === 'ours') {
        const zone = await cloudflare.zone();
        if (!zone?.name || !goLive.hostname.endsWith(`.${zone.name}`)) problems.push(`CLOUDFLARE_ZONE_ID is the zone “${zone?.name}”, which does not hold ${goLive.hostname}.`);
    }
    return problems;
}

// ── 2. client files ──────────────────────────────────────────────────────

async function files(ctx) {
    const answersSha = sha256(ctx.answersText);
    // The same generatedAt as last time while the answers are unchanged, so
    // the files (and the build hash) only change when something real did.
    const generatedAt = ctx.state.files?.answersSha === answersSha && ctx.state.files.generatedAt ? ctx.state.files.generatedAt : at(ctx);
    const result = makeClient({ submissionPath: ctx.answersPath, outDir: ctx.root, generatedAt });
    extractZip(result.bytes, ctx.root);
    ctx.state.files = { answersSha, generatedAt, zip: result.fileName, folder: result.fileName.replace(/\.zip$/, ''), zipSha: sha256(result.bytes), at: at(ctx) };
    ctx.ok(`${result.path} and ${ctx.paths.folder}`);
}

// ── 3. Supabase project ──────────────────────────────────────────────────

function freeLimitMessage(ctx, said) {
    const usage = ctx.memo.freeUsage || [];
    return [
        'Supabase would not create the project: the free-project limit was reached.',
        `Supabase allows ${FREE_PROJECT_LIMIT} active free projects per person, counted across every organization where that person is Owner or Administrator.`,
        'A free organization cannot start a project while any of its Owners or Administrators is at the limit. Paused projects do not count.',
        ...(usage.length ? ['The agency is Owner/Administrator with active free projects in:', ...usage.map(u => `  - ${u.org}: ${u.projects.join(', ')}`)] : []),
        'Fix one of these, then run the same command again:',
        '  - Ask the earlier clients to change the agency\'s role to Developer (Organization settings → Team).',
        '  - Pause or delete a free project the agency no longer needs.',
        `  - The client may also be at the limit: they pause one of their own free projects, or upgrade ${ctx.goLive.supabaseOrg} to a paid plan.`,
        `Supabase said: ${said}`,
    ].join('\n');
}

async function project(ctx) {
    const { supabase, state, goLive } = ctx;
    const org = goLive.supabaseOrg;
    const name = ctx.names.project;
    if (state.supabase?.ref) {
        const existing = await supabase.project(state.supabase.ref);
        if (!existing) throw new Error(`The project ${state.supabase.ref} in ${ctx.paths.state} no longer exists. If it was deleted on purpose, remove the "supabase" part of that file and run again to create a new one.`);
        ctx.ok(`Project ${existing.name} (${existing.ref}), ${existing.status}`);
        return;
    }
    const findByName = async () => (await supabase.orgProjects(org, name)).filter(p => p.name === name && !p.is_branch);
    let found = await findByName();
    if (found.length > 1) throw new Error(`${org} has ${found.length} projects named ${name}. Put the right ref in ${ctx.paths.state} ("supabase": {"ref": "…"}) and run again.`);
    if (found.length === 1) {
        state.supabase = { ref: found[0].ref, name, org, region: found[0].region, foundAt: at(ctx) };
        ctx.ok(`Found the existing project ${name} (${found[0].ref})`);
        if (found[0].region && found[0].region !== REGION) ctx.warn(`That project is in ${found[0].region}, not Mumbai (${REGION}).`);
        return;
    }

    const dbPass = randomBytes(24).toString('base64url');
    ctx.secrets.add(dbPass);
    let created;
    try {
        created = await supabase.createProject({ name, organizationSlug: org, region: REGION, dbPass });
    } catch (error) {
        if (isFreeProjectLimit(error)) throw Object.assign(new Error(freeLimitMessage(ctx, error.message)), { code: 'free_project_limit' });
        // A create that timed out may still have happened: look before failing.
        if (error.code === 'network' || error.status >= 500) {
            found = await findByName();
            if (found.length === 1) created = found[0];
        }
        if (!created) throw error;
    }
    state.supabase = { ref: created.ref, name, org, region: created.region || REGION, createdAt: at(ctx) };
    ctx.memo.dbPassword = dbPass;
    ctx.save();
    ctx.ok(`Created ${name} (${created.ref}) in ${org}, Mumbai`);
    ctx.box([
        'Database password (shown now and in the summary, never saved):',
        `  ${dbPass}`,
        'Give it to the client. It can be reset in Supabase → Project Settings → Database.',
    ]);
}

// ── 4. wait until healthy ────────────────────────────────────────────────

const STARTING = new Set(['COMING_UP', 'UNKNOWN', 'RESTORING', 'UPGRADING', 'RESTARTING', 'RESIZING', 'ACTIVE_UNHEALTHY']);

async function waitHealthy(ctx) {
    const ref = requireRef(ctx);
    const started = ctx.now().getTime();
    let last = '';
    let lastPrint = started;
    for (;;) {
        const elapsed = ctx.now().getTime() - started;
        const info = await ctx.supabase.project(ref);
        const status = info?.status || 'UNKNOWN';
        let detail = status;
        if (status === 'INACTIVE') throw new Error(`The project ${ref} is paused. The client (or an Administrator) restores it in Supabase → the project → Restore project; then run again.`);
        if (!STARTING.has(status) && status !== 'ACTIVE_HEALTHY') throw new Error(`The project ${ref} is ${status}. Check it in the Supabase dashboard, then run again.`);
        if (status === 'ACTIVE_HEALTHY') {
            const services = await ctx.supabase.health(ref);
            const waiting = services ? services.filter(s => !(s.healthy || s.status === 'ACTIVE_HEALTHY')).map(s => s.name) : ['db', 'auth', 'rest'];
            if (!waiting.length) {
                ctx.ok(`Healthy after ${minutes(elapsed)}`);
                ctx.state.health = { ref, at: at(ctx) };
                return;
            }
            detail = `starting ${waiting.join(', ')}`;
        }
        if (elapsed > ctx.waitTimeoutMs) throw new Error(`The project was still ${detail} after ${minutes(elapsed)}. Run the same command again in a few minutes; finished steps are skipped.`);
        if (detail !== last || ctx.now().getTime() - lastPrint >= 60_000) {
            ctx.note(`  … ${detail} (${minutes(elapsed)})`);
            last = detail;
            lastPrint = ctx.now().getTime();
        }
        await ctx.sleep(ctx.pollMs);
    }
}

// ── 5. database ──────────────────────────────────────────────────────────

async function database(ctx) {
    const ref = requireRef(ctx);
    const sql = readFileSync(join(ctx.paths.folder, 'backend', 'setup.sql'), 'utf8');
    const setupSha = sha256(sql);
    const done = ctx.state.database;
    if (done?.ref === ref && done.setupSha === setupSha && !ctx.forced('database')) {
        ctx.ok('backend/setup.sql is unchanged since the last run');
    } else {
        await ctx.supabase.query(ref, sql, 'run backend/setup.sql');
        ctx.state.database = { ...done, ref, setupSha, at: at(ctx), imports: done?.ref === ref ? done.imports || [] : [] };
        ctx.save();
        ctx.ok('Ran backend/setup.sql');
    }

    const file = ctx.options.importFile;
    if (!file) {
        if (existsSync(ctx.paths.importDefault)) ctx.note(`  ${ctx.paths.importDefault} exists. To load those customers, run again with --import ${ctx.paths.importDefault}`);
        return;
    }
    const importSql = readFileSync(file, 'utf8');
    const importSha = sha256(importSql);
    const imports = ctx.state.database.imports || [];
    if (imports.some(i => i.sha256 === importSha) && !ctx.forced('database')) {
        ctx.ok(`${file} was imported before (${imports.find(i => i.sha256 === importSha).at}); not run again`);
        return;
    }
    await ctx.supabase.query(ref, importSql, `run ${file}`);
    ctx.state.database.imports = [...imports, { file, sha256: importSha, at: at(ctx) }];
    ctx.ok(`Imported ${file}`);
}

// ── 6. keep-alive ────────────────────────────────────────────────────────

async function keepalive(ctx) {
    const ref = requireRef(ctx);
    const key = await publicKey(ctx);
    await ctx.supabase.query(ref, keepaliveSql({ ref, publicKey: key }), 'schedule the keep-alive job');
    const res = await projectApi({ request: ctx.request, ref }).rpc(key, 'keepalive', { allow: [401, 403, 404] });
    const answered = res.status === 200;
    ctx.state.keepalive = { ref, job: KEEPALIVE_JOB, schedule: KEEPALIVE_SCHEDULE, key: key.startsWith('sb_publishable_') ? 'publishable' : 'legacy anon', rpcOk: answered, at: at(ctx) };
    if (answered) ctx.ok(`Daily job ${KEEPALIVE_JOB} (${KEEPALIVE_SCHEDULE} UTC); keepalive() answers`);
    else ctx.warn(`The daily job is scheduled, but keepalive() answered HTTP ${res.status}. Run the database step again (--only database) so setup.sql adds it.`);
}

// ── 7. Netlify site ──────────────────────────────────────────────────────

async function site(ctx) {
    const { netlify, state, goLive } = ctx;
    const hostname = goLive.hostname;
    const name = siteNameFor(ctx.slug);
    let current = state.netlify?.siteId ? await netlify.site(state.netlify.siteId) : null;
    if (state.netlify?.siteId && !current) ctx.warn(`The Netlify site ${state.netlify.siteName} was deleted; making a new one.`);
    if (!current) current = (await netlify.findSites(name) || []).find(s => s.name === name || s.custom_domain === hostname) || null;
    if (!current) {
        for (let attempt = 0; attempt < 4 && !current; attempt += 1) {
            const tryName = attempt === 0 ? name : `${name.slice(0, 58)}-${randomBytes(2).toString('hex')}`;
            const res = await netlify.createSite({ name: tryName, customDomain: hostname });
            if (res.status === 422 && isNameTaken(res)) {
                ctx.note(`  The Netlify name ${tryName} is taken; trying another.`);
                continue;
            }
            if (res.status === 422) throw new Error(`Netlify refused to create the site (${JSON.stringify(res.data?.errors || res.data?.message || res.data)}). If another site already uses ${hostname}, remove the address there and run again.`);
            current = res.data;
            ctx.ok(`Created the Netlify site ${current.name}`);
        }
        if (!current) throw new Error('Netlify refused every site name tried. Run again, or create the site by hand and put its id in the state file.');
    } else {
        ctx.ok(`Netlify site ${current.name}`);
    }
    if (current.custom_domain !== hostname) current = await netlify.updateSite(current.id, { custom_domain: hostname });
    state.netlify = {
        siteId: current.id, siteName: current.name, netlifyHost: `${current.name}.netlify.app`,
        adminUrl: current.admin_url || '', customDomain: hostname, at: at(ctx),
    };
}

// ── 8. DNS (and the HTTPS certificate once DNS is right) ─────────────────

async function dns(ctx) {
    const { goLive, netlify, cloudflare } = ctx;
    const siteState = requireSite(ctx);
    const hostname = goLive.hostname;
    const target = siteState.netlifyHost;
    const record = dnsRecordFor(hostname, target);
    let via = 'manual';
    let recordId = ctx.state.dns?.cloudflareRecordId;

    if (goLive.domainMode === 'ours' && cloudflare) {
        const records = (await cloudflare.records(hostname) || []).filter(r => r.name === hostname);
        const cname = records.find(r => r.type === 'CNAME');
        const other = records.find(r => r.type !== 'CNAME');
        if (other) throw new Error(`Cloudflare already has a ${other.type} record for ${hostname}. Remove it (it blocks the CNAME), then run again.`);
        if (!cname) {
            recordId = (await cloudflare.createCname(hostname, target))?.id;
            ctx.ok(`Added CNAME ${hostname} → ${target} in Cloudflare`);
        } else if (cname.content !== target) {
            if (cname.id !== recordId) throw new Error(`Cloudflare has CNAME ${hostname} → ${cname.content}, which provisioning did not create. Check it is not used by something else, delete it, and run again.`);
            await cloudflare.updateCname(cname.id, hostname, target);
            ctx.ok(`Updated CNAME ${hostname} → ${target} in Cloudflare`);
        } else {
            recordId = cname.id;
            ctx.ok(`Cloudflare has CNAME ${hostname} → ${target}`);
        }
        via = 'cloudflare';
    } else if (goLive.domainMode === 'ours') {
        // On Netlify DNS, setting the custom domain on a site in the same
        // team adds the record by itself; check that it did.
        const zones = await netlify.dnsZones() || [];
        const zone = zones.find(z => hostname.endsWith(`.${z.name}`));
        if (zone) {
            // Netlify may add the record a few seconds after the domain was set.
            let records = [];
            for (let tries = 0; tries < 3; tries += 1) {
                records = await netlify.dnsRecords(zone.id) || [];
                if (records.some(r => r.hostname === hostname)) break;
                if (tries < 2) await ctx.sleep(5000);
            }
            if (records.some(r => r.hostname === hostname)) {
                via = 'netlify';
                ctx.ok(`Netlify DNS has a record for ${hostname}`);
            } else {
                ctx.warn(`Netlify DNS (zone ${zone.name}) has no record for ${hostname} yet. Add it in Netlify → Domains → ${zone.name}:`);
                for (const line of describeRecord(record)) ctx.note(`    ${line}`);
            }
        } else {
            ctx.warn(`${goLive.hostname}: the agency domain is neither on Netlify DNS (in this team) nor on Cloudflare (CLOUDFLARE_* not set). Add this record at its DNS host:`);
            for (const line of describeRecord(record)) ctx.note(`    ${line}`);
        }
    }

    const check = await checkDns({ hostname, netlifyHost: target, resolver: ctx.resolver });
    const ok = check.ok || via !== 'manual';
    ctx.state.dns = {
        mode: goLive.domainMode, hostname, record: { type: record.type, name: record.name, value: record.value }, via,
        ...(recordId ? { cloudflareRecordId: recordId } : {}), ok, answer: check.answer, checkedAt: at(ctx),
    };
    let https = await checkHttps(ctx);
    // Netlify issues the certificate by itself once DNS points at it; asking
    // again only speeds that up. Its answer is not trusted: the probe decides.
    if (ok && !https.ok) {
        await netlify.provisionTls(siteState.siteId);
        https = await checkHttps(ctx);
    }
    if (check.ok) ctx.ok(`${hostname} → ${check.answer}`);
    else if (ok) ctx.note(`  ${hostname} does not resolve yet (${check.answer}); new records can take a few minutes.`);
    else if (goLive.domainMode === 'own') ctx.warn(`${hostname} does not point at Netlify yet (${check.answer}).`);
    if (https.ok) ctx.ok(`HTTPS works on ${hostname}`);
    else ctx.note(`  HTTPS on ${hostname} is not ready yet (${https.reason}). Until it is, the app and its emails use ${netlifyUrl(ctx)}.`);
}

// ── 9. Auth settings ─────────────────────────────────────────────────────

async function auth(ctx) {
    const ref = requireRef(ctx);
    requireSite(ctx);
    const { goLive, supabase } = ctx;
    const live = liveUrl(ctx);
    const smtp = ctx.clientSecrets.smtp && goLive.senderEmail ? ctx.clientSecrets.smtp : null;
    let current = null;
    try { current = await supabase.authConfig(ref); } catch { /* only used to see whether SMTP is set */ }
    const smtpOn = Boolean(smtp) || Boolean(current?.smtp_host);
    const settings = templates => authSettings({
        siteUrl: live, urls: [goLive.siteUrl, netlifyUrl(ctx)], companyName: ctx.companyName,
        smtp, smtpOn, senderEmail: goLive.senderEmail, senderName: goLive.senderName, templates,
    });
    let templates = true;
    let res;
    try {
        res = await supabase.updateAuthConfig(ref, settings(true));
    } catch (error) {
        // Supabase may refuse custom templates while the project has no SMTP of its own.
        if (smtpOn || error.status !== 400 || !/template|smtp/i.test(error.message)) throw error;
        templates = false;
        res = await supabase.updateAuthConfig(ref, settings(false));
        ctx.warn('Supabase refused the branded emails without the client\'s own SMTP. Add the Brevo secrets file and run again.');
    }
    if (res.status === 403) {
        if (ctx.state.auth?.ref === ref) {
            ctx.warn('The agency may no longer change the Auth settings (not Administrator); they stay as set on the last run.');
            return;
        }
        throw new Error('Supabase refused to change the Auth settings (HTTP 403). The agency must be Owner or Administrator in the client\'s organization for the first run.');
    }
    ctx.state.auth = { ref, siteUrl: live, smtp: smtpOn, senderEmail: smtpOn ? goLive.senderEmail : '', templates, at: at(ctx) };
    ctx.report.smtp = smtp ? 'set' : smtpOn ? 'kept' : 'off';
    ctx.ok(`Sign-ups off, anonymous off, email on, passwords ≥ 8; site ${live}`);
    if (smtp) ctx.ok(`SMTP: Brevo, from ${goLive.senderName} <${goLive.senderEmail}>`);
    else if (smtpOn) ctx.ok('SMTP: kept as set on an earlier run (no secrets file this time)');
    else ctx.warn(`No SMTP: emails use Supabase's test mailer, which only delivers to members of the client's Supabase organization and only a few an hour. Put BREVO_SMTP_LOGIN and BREVO_SMTP_KEY in ${ctx.paths.secrets} and run again.`);
}

// ── 10. add_user function and ALLOWED_ORIGIN ─────────────────────────────

async function edgeFunction(ctx) {
    const ref = requireRef(ctx);
    requireSite(ctx);
    const { supabase } = ctx;
    const source = readFileSync(join(ctx.paths.folder, 'backend', 'functions', FUNCTION_SLUG, 'index.ts'), 'utf8');
    const sha = sha256(source);
    const deployed = await supabase.getFunction(ref, FUNCTION_SLUG);
    const done = ctx.state.function;
    let version = done?.version;
    if (deployed && done?.ref === ref && done.sha === sha && !ctx.forced('function')) {
        ctx.ok(`${FUNCTION_SLUG} is up to date (version ${deployed.version ?? version ?? '?'})`);
    } else {
        // verify_jwt as the dashboard's default for a new function; add_user
        // checks the caller's session itself as well.
        const result = await supabase.deployFunction(ref, FUNCTION_SLUG, {
            metadata: { name: FUNCTION_SLUG, entrypoint_path: 'index.ts', verify_jwt: true },
            files: { 'index.ts': source },
        });
        version = result?.version;
        ctx.ok(`Deployed ${FUNCTION_SLUG}${version ? ` (version ${version})` : ''}`);
    }
    const origins = [...new Set([ctx.goLive.siteUrl, netlifyUrl(ctx)].filter(Boolean))].join(',');
    const res = await supabase.setSecrets(ref, [{ name: 'ALLOWED_ORIGIN', value: origins }]);
    if (res.status === 403) {
        if (done?.allowedOrigin !== origins) ctx.warn(`Could not set ALLOWED_ORIGIN to ${origins} (not Administrator). Ask the client to set it under Edge Functions → Secrets.`);
    } else {
        ctx.ok(`ALLOWED_ORIGIN = ${origins}`);
    }
    ctx.state.function = { ref, slug: FUNCTION_SLUG, sha, version, verifyJwt: true, allowedOrigin: res.status === 403 ? done?.allowedOrigin || '' : origins, at: at(ctx) };
}

// ── 11. build ────────────────────────────────────────────────────────────

async function build(ctx) {
    const ref = requireRef(ctx);
    const folder = ctx.paths.folder;
    const dist = join(folder, 'dist', 'index.html');
    if (ctx.options.skipBuild) {
        if (!existsSync(dist)) throw new Error(`--skip-build needs an earlier build, but ${dist} does not exist.`);
        ctx.ok('Using the existing dist/ (--skip-build)');
        return;
    }
    const key = await publicKey(ctx);
    const url = projectUrl(ref);
    const problem = supabaseEnvProblem(url, key);
    if (problem) throw new Error(`Refusing to build: ${problem}`);
    const envText = [
        '# Written by npm run provision. Public values only: everything here ends up in the browser.',
        `VITE_SUPABASE_URL=${url}`,
        `VITE_SUPABASE_ANON_KEY=${key}`,
        '',
    ].join('\n');
    const envPath = join(folder, '.env');
    if (!existsSync(envPath) || readFileSync(envPath, 'utf8') !== envText) writeFileSync(envPath, envText);
    const sourceSha = sha256(`${ctx.state.files?.zipSha}\n${envText}`);
    if (ctx.state.build?.sourceSha === sourceSha && existsSync(dist) && !ctx.forced('build')) {
        ctx.ok('The app is already built from these files');
        return;
    }
    const env = childEnv(ctx.processEnv);
    ctx.note('  npm ci …');
    await ctx.runner('npm', ['ci'], { cwd: folder, env });
    ctx.note('  npm run build …');
    await ctx.runner('npm', ['run', 'build'], { cwd: folder, env });
    if (!existsSync(dist)) throw new Error(`The build finished without ${dist}.`);
    if (!readFileSync(dist, 'utf8').includes(new URL(url).host)) throw new Error(`dist/index.html does not allow ${new URL(url).host}: the build did not use ${envPath}.`);
    ctx.state.build = { ref, sourceSha, at: at(ctx) };
    ctx.ok('Built dist/');
}

// ── 12. deploy to Netlify ────────────────────────────────────────────────

async function deploy(ctx) {
    const siteState = requireSite(ctx);
    const { netlify } = ctx;
    const dist = join(ctx.paths.folder, 'dist');
    if (!existsSync(join(dist, 'index.html'))) throw new Error(`${dist} has no index.html. Run the build step first.`);
    for (const { path, text } of textFiles(dist)) {
        const hits = findSecrets(text);
        if (hits.length || [...ctx.secrets].some(value => value.length >= 8 && text.includes(value))) {
            throw new Error(`Refusing to upload: ${path} contains a secret${hits.length ? ` (${hits.map(([kind]) => kind).join(', ')})` : ''}. Check ${ctx.paths.folder}/.env and rebuild.`);
        }
    }
    const bytes = zipFolder(dist);
    const distSha = sha256(bytes);
    const live = await netlify.site(siteState.siteId);
    if (!live) throw new Error(`The Netlify site ${siteState.siteName} no longer exists. Run the command again without --only to make a new one.`);
    if (ctx.state.deploy?.distSha === distSha && live.published_deploy?.id === ctx.state.deploy.deployId && !ctx.forced('deploy')) {
        ctx.ok('This build is already live');
        return;
    }
    let current = await netlify.deployZip(siteState.siteId, bytes);
    const started = ctx.now().getTime();
    while (current?.state !== 'ready') {
        if (current?.state === 'error') throw new Error(`Netlify could not publish the deploy: ${current.error_message || 'no details'}. Run again.`);
        if (ctx.now().getTime() - started > ctx.deployTimeoutMs) throw new Error(`The Netlify deploy was still “${current?.state}” after ${minutes(ctx.now().getTime() - started)}. Check it in Netlify, then run again.`);
        await ctx.sleep(ctx.pollMs);
        current = await netlify.deploy(current.id);
    }
    ctx.state.deploy = { siteId: siteState.siteId, deployId: current.id, distSha, at: at(ctx) };
    ctx.ok(`Live at ${liveUrl(ctx)}`);
}

// ── 13. invite the owner ─────────────────────────────────────────────────

// Before an email goes out: if DNS is right but the certificate is still
// being issued, wait a little (up to ctx.httpsWaitMs) so the link can use the
// custom address, and move Auth's Site URL there once it works.
async function waitForCustomAddress(ctx) {
    const { goLive } = ctx;
    const dns = ctx.state.dns;
    if (liveUrl(ctx) === goLive.siteUrl || !dns?.ok || dns.hostname !== goLive.hostname) return;
    ctx.note(`  HTTPS on ${goLive.hostname} is not ready yet; waiting up to ${Math.round(ctx.httpsWaitMs / 60000)} minutes so the owner's link can use it …`);
    const started = ctx.now().getTime();
    for (;;) {
        const probe = await checkHttps(ctx);
        const elapsed = ctx.now().getTime() - started;
        if (probe.ok) {
            ctx.ok(`HTTPS works on ${goLive.hostname} (after ${minutes(elapsed)}); moving the Site URL there`);
            await auth(ctx);
            return;
        }
        if (elapsed >= ctx.httpsWaitMs) {
            ctx.warn(`HTTPS on ${goLive.hostname} is still not ready (${probe.reason}), so the owner's link uses ${liveUrl(ctx)}. It keeps working after the switch.`);
            return;
        }
        ctx.note(`  … not yet (${probe.reason}, ${minutes(elapsed)})`);
        await ctx.sleep(15_000);
    }
}

async function invite(ctx) {
    const ref = requireRef(ctx);
    if (ctx.state.auth?.ref !== ref) throw new Error('Set the Auth settings first (run without --only): the invite email links to the Site URL set there.');
    const { supabase } = ctx;
    const email = ctx.ownerEmail;
    const project = projectApi({ request: ctx.request, ref });
    const user = (await supabase.query(ref, ownerLookupSql(email), 'look up the owner login'))?.[0];
    let userId = user?.id;
    if (!user || (!user.last_sign_in_at && ctx.options.resendInvite)) await waitForCustomAddress(ctx);
    if (!user) {
        const keys = await supabase.apiKeys(ref, { reveal: true });
        const serviceKey = pickServiceKey(keys);
        if (!serviceKey) throw new Error('The project has no secret or service_role key to send the invite with. Create a secret key in Supabase → Project Settings → API Keys, then run again.');
        ctx.secrets.add(serviceKey);
        const res = await project.invite(serviceKey, email, ctx.ownerName ? { name: ctx.ownerName } : undefined);
        userId = res.data?.id;
        ctx.state.invite = { ref, email, userId, kind: 'invite', sentAt: at(ctx), siteUrl: ctx.state.auth.siteUrl };
        ctx.report.invite = 'sent';
        ctx.report.inviteUrl = ctx.state.auth.siteUrl;
        ctx.ok(`Invited ${email}: a “Set your password” email is on its way`);
    } else if (user.last_sign_in_at) {
        ctx.state.invite = { ...ctx.state.invite, ref, email, userId, signedInAt: user.last_sign_in_at };
        ctx.report.invite = 'signed-in';
        ctx.ok(`${email} has signed in already (${user.last_sign_in_at}); nothing sent`);
    } else if (ctx.options.resendInvite) {
        await project.recover(await publicKey(ctx), email);
        ctx.state.invite = { ...ctx.state.invite, ref, email, userId, kind: 'recovery', sentAt: at(ctx), siteUrl: ctx.state.auth.siteUrl };
        ctx.report.invite = 'resent';
        ctx.report.inviteUrl = ctx.state.auth.siteUrl;
        ctx.ok(`Sent ${email} a new “Choose a password” email`);
    } else {
        ctx.report.invite = 'pending';
        ctx.ok(`${email} was invited ${user.invited_at || ctx.state.invite?.sentAt || 'earlier'} and has not signed in yet. Run with --resend-invite to send a new email.`);
    }
    const profile = userId ? (await supabase.query(ref, profileSql(userId), 'check the owner profile'))?.[0] : null;
    if (profile?.user_type === 'admin' && profile.status === 'active') ctx.ok(`${email} is the active admin`);
    else {
        ctx.warn(`${email} is not the active admin (${profile ? `${profile.user_type}, ${profile.status}` : 'no profile'}). Run this in the client's SQL Editor:`);
        ctx.note(`    update public.profiles set user_type = 'admin', role = 'Admin', status = 'active' where lower(email) = lower('${email.replaceAll("'", "''")}');`);
    }
}

// ── the list ─────────────────────────────────────────────────────────────

export const STEPS = Object.freeze([
    {
        name: 'files', title: 'Client files', run: files,
        plan: ctx => `write ${ctx.paths.zip} (as make-client does) and unzip it to ${ctx.paths.folder}`,
    },
    {
        name: 'project', title: 'Supabase project', run: project,
        plan: ctx => (ctx.state.supabase?.ref ? `use the project ${ctx.state.supabase.ref}` : `find or create ${ctx.names.project} in the organization ${shown(ctx.goLive.supabaseOrg)} (Mumbai, ${REGION}) with a new database password`),
    },
    { name: 'wait', title: 'Wait until healthy', run: waitHealthy, plan: () => 'wait until the database, Auth and REST are healthy' },
    {
        name: 'database', title: 'Database', run: database,
        plan: ctx => `run backend/setup.sql${ctx.options.importFile ? `, then ${ctx.options.importFile}` : ''} (skipped when unchanged)`,
    },
    { name: 'keepalive', title: 'Keep-alive', run: keepalive, plan: () => `enable pg_cron + pg_net and schedule ${KEEPALIVE_JOB} (${KEEPALIVE_SCHEDULE} UTC) to call keepalive()` },
    {
        name: 'site', title: 'Netlify site', run: site,
        plan: ctx => `${ctx.state.netlify?.siteId ? `use the site ${ctx.state.netlify.siteName}` : `find or create the site ${siteNameFor(ctx.slug)}`} with the address ${shown(ctx.goLive.hostname)}`,
    },
    {
        name: 'dns', title: 'DNS and HTTPS', run: dns,
        plan: ctx => (ctx.goLive.domainMode === 'own'
            ? `check that ${shown(ctx.goLive.hostname)} has a CNAME to the site (the client adds it), then request HTTPS`
            : `${ctx.cloudflare ? 'add the CNAME in Cloudflare' : 'check the record on Netlify DNS'} for ${shown(ctx.goLive.hostname)}, then request HTTPS`),
    },
    {
        name: 'auth', title: 'Auth settings', run: auth,
        plan: ctx => `sign-ups off, anonymous off, passwords ≥ 8, site URL, redirect URLs, branded invite and reset emails, ${ctx.clientSecrets.smtp ? `Brevo SMTP from ${ctx.goLive.senderEmail}` : 'no SMTP (no secrets file)'}`,
    },
    { name: 'function', title: 'Staff-login function', run: edgeFunction, plan: ctx => `deploy ${FUNCTION_SLUG} and set ALLOWED_ORIGIN to ${shown(ctx.goLive.siteUrl)} and the netlify.app address` },
    { name: 'build', title: 'Build the app', run: build, plan: ctx => (ctx.options.skipBuild ? 'use the existing dist/' : 'write .env with the public key, npm ci, npm run build') },
    { name: 'deploy', title: 'Publish', run: deploy, plan: () => 'upload dist/ to Netlify (skipped when unchanged)' },
    {
        name: 'invite', title: 'Owner invite', run: invite,
        plan: ctx => `invite ${ctx.ownerEmail || '(no owner email)'}${ctx.options.resendInvite ? ', or send a new password email' : ''} unless they exist already`,
    },
]);

export const STEP_NAMES = STEPS.map(step => step.name);
export { siteNameFor };
