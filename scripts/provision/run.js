// Runs the provisioning of one client: checks, then every step in order,
// saving the state after each, then the summary. Everything that talks to
// the outside world (fetch, npm, DNS, clock, output) is passed in, so
// tests/provision drives it against fakes.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { resolveGoLive } from '../../builder/src/catalog/goLive.js';
import { cloudflareApi } from './cloudflare.js';
import { clientSecretsPath, loadAgencyEnv, loadClientSecrets } from './env.js';
import { parseSubmissionJson } from '../../builder/src/zip/build.js';
import { buildClientZip } from './files.js';
import { createHttp } from './http.js';
import { netlifyApi } from './netlify.js';
import { loadState, saveState, statePath } from './state.js';
import { preflightNetwork, STEP_NAMES, STEPS } from './steps.js';
import { summaryLines } from './summary.js';
import { supabaseApi } from './supabase.js';

export const STEP_ORDER = ['preflight', ...STEP_NAMES];

export class ProvisionError extends Error {}

function parseStepList(value, flag) {
    if (!value) return null;
    const names = String(value).split(',').map(s => s.trim()).filter(Boolean);
    const unknown = names.filter(name => !STEP_NAMES.includes(name));
    if (unknown.length) throw new ProvisionError(`${flag}: unknown step ${unknown.join(', ')}. Steps: ${STEP_NAMES.join(', ')}.`);
    return new Set(names);
}

/**
 * runProvision({answersPath, options}, deps) -> {ok, state, lines}
 * options: {dryRun, only, skip, resendInvite, skipBuild, importFile, secretsPath, verbose}
 * deps: {repoRoot, root, env, fetch, runner, resolver, sleep, now, print,
 *        waitTimeoutMs, deployTimeoutMs, pollMs}
 */
export async function runProvision({ answersPath, options = {} }, deps) {
    const print = deps.print || (line => console.log(line));
    const report = { warnings: [] };
    const out = {
        log: line => print(line),
        ok: line => print(`  ✓ ${line}`),
        note: line => print(line),
        warn: line => { report.warnings.push(line); print(`  ! ${line}`); },
        box: lines => print(['', '  ┌──────────────────────────────────────────────', ...lines.map(l => `  │ ${l}`), '  └──────────────────────────────────────────────'].join('\n')),
    };
    const only = parseStepList(options.only, '--only');
    const skip = parseStepList(options.skip, '--skip') || new Set();

    // ── the client, from the answers file ──
    const root = resolve(deps.root);
    let answersText;
    let answers;
    try {
        answersText = readFileSync(answersPath, 'utf8');
        // {submission, adminOverrides, slug, ownerEmail, branding, workflow, goLive, addOns, agencyDomain}
        answers = parseSubmissionJson(answersText);
    } catch (error) {
        throw new ProvisionError(`${answersPath}: ${error.code === 'ENOENT' ? 'no such file.' : error.message} Use the client page's "Download answers (JSON)" file.`);
    }
    let built;
    try {
        built = buildClientZip({ answersText, templateFiles: deps.templateFiles });
    } catch (error) {
        if (error.validation) {
            for (const message of error.validation.errors) print(`✗ ${message}`);
            throw new ProvisionError('The client settings do not validate. Fix them on the client page, download the answers again and re-run.');
        }
        throw error;
    }
    const { config } = built;
    const slug = config.client.slug;
    const { values: env, fileFound } = loadAgencyEnv({ repoRoot: deps.repoRoot, env: deps.env });
    // AGENCY_DOMAIN wins over the domain the admin page wrote into the export;
    // the export's is only a fallback.
    const exportedDomain = String(answers.agencyDomain || '').trim().toLowerCase();
    const agencyDomain = env.AGENCY_DOMAIN || exportedDomain;
    const agencyDomainNote = env.AGENCY_DOMAIN && exportedDomain && exportedDomain !== env.AGENCY_DOMAIN.toLowerCase()
        ? `The answers were exported with the agency domain ${exportedDomain}; AGENCY_DOMAIN (${env.AGENCY_DOMAIN}) is used instead.` : '';
    const companyName = config.branding?.companyName || config.client.name;
    const goLive = resolveGoLive({
        submission: answers.submission, settings: { goLive: answers.goLive }, slug, companyName, agencyDomain,
    });
    const paths = {
        state: statePath(root, slug),
        folder: join(root, `${slug}-solarflow`),
        zip: join(root, `${slug}-solarflow.zip`),
        secrets: options.secretsPath ? resolve(options.secretsPath) : clientSecretsPath(root, slug),
        importDefault: join(root, `${slug}-import-customers.sql`),
    };
    const clientSecrets = loadClientSecrets(paths.secrets);
    const state = loadState(paths.state, slug);
    const secrets = new Set([env.SUPABASE_ACCESS_TOKEN, env.NETLIFY_AUTH_TOKEN, env.CLOUDFLARE_API_TOKEN, clientSecrets.smtp?.key].filter(Boolean));
    const redact = text => [...secrets].reduce((acc, value) => (value.length >= 8 ? acc.split(value).join('[redacted]') : acc), String(text));
    const request = createHttp({
        fetch: deps.fetch, sleep: deps.sleep, redact,
        debug: options.verbose ? line => print(`    · ${redact(line)}`) : null,
    });
    const ctx = {
        ...out, report, options, root, paths, answersPath: resolve(answersPath), answersText, answers, built, config, slug, companyName,
        ownerEmail: String(config.client.ownerEmail || '').trim().toLowerCase(),
        ownerName: String(answers.submission?.contact?.name || '').trim(),
        goLive, env, clientSecrets, state, secrets, request, memo: { agencyDomainNote },
        names: { project: `${slug}-solarflow` },
        supabase: supabaseApi({ request, token: env.SUPABASE_ACCESS_TOKEN }),
        netlify: netlifyApi({ request, token: env.NETLIFY_AUTH_TOKEN, accountSlug: env.NETLIFY_ACCOUNT_SLUG }),
        cloudflare: env.CLOUDFLARE_API_TOKEN && env.CLOUDFLARE_ZONE_ID ? cloudflareApi({ request, token: env.CLOUDFLARE_API_TOKEN, zoneId: env.CLOUDFLARE_ZONE_ID }) : null,
        fetch: deps.fetch || globalThis.fetch, runner: deps.runner, resolver: deps.resolver, sleep: deps.sleep || (ms => new Promise(done => setTimeout(done, ms))),
        now: deps.now || (() => new Date()), processEnv: deps.env || process.env,
        waitTimeoutMs: deps.waitTimeoutMs ?? 15 * 60_000, deployTimeoutMs: deps.deployTimeoutMs ?? 10 * 60_000, pollMs: deps.pollMs ?? 10_000,
        httpsWaitMs: deps.httpsWaitMs ?? 3 * 60_000,
        forced: name => Boolean(only?.has(name)),
        save: () => saveState(paths.state, { ...state, updatedAt: ctx.now().toISOString() }, { secrets }),
    };

    print(`SolarFlow provisioning: ${companyName} (${slug})${options.dryRun ? ' — dry run, nothing is changed' : ''}`);
    print(`  Address ${goLive.hostname || '?'} · Supabase organization ${goLive.supabaseOrg || '?'} · owner ${ctx.ownerEmail || '?'}`);

    // ── 1. checks that need no network ──
    print('\n▸ Checks');
    const problems = localProblems(ctx, { fileFound });
    const selected = STEPS.filter(step => (only ? only.has(step.name) : true) && !skip.has(step.name));

    if (options.dryRun) {
        for (const problem of problems) print(`  ✗ ${problem}`);
        print('\nPlan:');
        selected.forEach((step, index) => print(`  ${index + 1}. ${step.title}: ${step.plan(ctx)}`));
        print(problems.length ? `\n✗ ${problems.length} problem(s) to fix before a real run.` : '\nNo problems found. Run again without --dry-run to do it.');
        return { ok: !problems.length, state, report, ctx };
    }
    if (!problems.length) problems.push(...await preflightNetwork(ctx));
    if (problems.length) {
        for (const problem of problems) print(`  ✗ ${problem}`);
        throw new ProvisionError('Nothing was changed. Fix the problems above and run the same command again.');
    }
    ctx.ok(`Supabase as ${ctx.memo.me?.primary_email || '?'} (${ctx.memo.role} in ${goLive.supabaseOrg}) · Netlify as ${ctx.memo.netlifyUser}`);

    // ── 2… the steps ──
    // The files step always runs: later steps read the client folder.
    const run = only && !only.has('files') ? [STEPS.find(s => s.name === 'files'), ...selected] : selected;
    for (const [index, step] of run.entries()) {
        print(`\n▸ ${index + 1}/${run.length} ${step.title}`);
        try {
            await step.run(ctx);
            state.steps[step.name] = { status: 'done', at: ctx.now().toISOString() };
            ctx.save();
        } catch (error) {
            state.steps[step.name] = { status: 'failed', at: ctx.now().toISOString(), error: redact(error.message).slice(0, 500) };
            print(`  ✗ ${redact(error.message)}`);
            // A failed save must not hide the step's own error.
            try { ctx.save(); } catch (saveError) { print(`  ✗ The state file was not updated: ${redact(saveError.message)}`); }
            const left = run.slice(index + 1).map(s => s.name);
            throw new ProvisionError(`Stopped at “${step.title}”.${left.length ? ` Not done yet: ${left.join(', ')}.` : ''} Fix the problem and run the same command again: finished steps are skipped or checked, not repeated.`);
        }
    }

    print('');
    for (const line of summaryLines(ctx)) print(line);
    return { ok: true, state, report, ctx };
}

function localProblems(ctx, { fileFound }) {
    const { env, goLive, built, clientSecrets, options, state } = ctx;
    const problems = [];
    if (!env.SUPABASE_ACCESS_TOKEN) problems.push(`SUPABASE_ACCESS_TOKEN is not set. ${fileFound ? 'Add it to' : 'Copy .env.provision.example to'} .env.provision${fileFound ? '' : ' and fill it in'}.`);
    else if (!env.SUPABASE_ACCESS_TOKEN.startsWith('sbp_')) ctx.warn('SUPABASE_ACCESS_TOKEN does not start with sbp_; is it a personal access token?');
    if (!env.NETLIFY_AUTH_TOKEN) problems.push('NETLIFY_AUTH_TOKEN is not set in .env.provision.');
    if (Boolean(env.CLOUDFLARE_API_TOKEN) !== Boolean(env.CLOUDFLARE_ZONE_ID)) problems.push('Set both CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID in .env.provision, or neither.');
    problems.push(...goLive.problems);
    for (const warning of goLive.warnings) ctx.warn(warning);
    for (const warning of built.validation.warnings) ctx.warn(warning);
    if (!ctx.ownerEmail) problems.push('The client has no owner email, so there is nobody to invite. Set it on the client page and download the answers again.');
    if (ctx.memo.agencyDomainNote) ctx.warn(`${ctx.memo.agencyDomainNote} The app goes live on ${goLive.hostname}.`);
    problems.push(...clientSecrets.problems);
    for (const warning of clientSecrets.warnings) ctx.warn(warning);
    if (clientSecrets.smtp && !goLive.senderEmail) problems.push('There is a Brevo secrets file but no sender email. Add the sender (verified in the client\'s Brevo account) on the client page and download the answers again.');
    if (!clientSecrets.smtp && !clientSecrets.problems.length) {
        ctx.warn(`No Brevo SMTP secrets (${ctx.paths.secrets} ${clientSecrets.found ? 'is empty' : 'does not exist'}). Without them the invite and password emails only reach members of the client's Supabase organization, a few an hour.`);
    }
    if (options.importFile && !existsSync(options.importFile)) problems.push(`--import: ${options.importFile} does not exist.`);
    if (state.supabase?.org && goLive.supabaseOrg && state.supabase.org !== goLive.supabaseOrg) {
        problems.push(`This client's project ${state.supabase.ref} is in the organization ${state.supabase.org}, but the answers now say ${goLive.supabaseOrg}. Correct the answers, or remove the "supabase" part of ${ctx.paths.state} to start a new project.`);
    }
    return problems;
}
