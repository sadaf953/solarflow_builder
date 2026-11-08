// Sets up one client end to end: their Supabase project (in the client's own
// organization), database, keep-alive job, Auth settings and emails, the
// add_user function, the built app on Netlify, DNS, and the owner's invite.
// What README.client.md asks a client to do by hand, in one command.
//
//   npm run provision -- <answers.json> [options]      (see --help)
//
// Agency tokens come from .env.provision; the client's Brevo SMTP key from
// client-zips/<slug>.secrets.env. Progress is kept in
// client-zips/<slug>/provision-state.json (no secrets), so the same command
// can be run again at any time: it finds what exists and does the rest.
// docs/PROVISIONING.md explains the whole process.
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { publicResolver } from './provision/dns.js';
import { ProvisionError, runProvision } from './provision/run.js';
import { STEP_NAMES } from './provision/steps.js';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

export const HELP = `Usage: npm run provision -- <answers.json> [options]

<answers.json> is the client page's "Download answers (JSON)" file.

Options:
  --dry-run           Check everything that needs no network and print the plan.
                      Makes no network call and changes nothing.
  --only <steps>      Run only these steps (comma-separated), even when they
                      look up to date. The checks and the client files always run.
  --skip <steps>      Leave these steps out.
  --resend-invite     If the owner never signed in, send them a new
                      "Choose a password" email.
  --skip-build        Publish the existing dist/ instead of building again.
  --import <file.sql> After setup.sql, run this file once (e.g. the output of
                      npm run import-customers). The same file is never run twice.
  --secrets <file>    The client's Brevo SMTP secrets
                      (default: client-zips/<slug>.secrets.env).
  --verbose           Print every API request (tokens redacted).
  -h, --help          Show this help.

Steps, in order: ${STEP_NAMES.join(', ')}.
Run the same command again after a failure or a change: finished steps are
found and skipped, nothing is created twice.`;

// Runs a command with the output shown, rejecting on a non-zero exit.
export function spawnRunner(command, args, { cwd, env }) {
    return new Promise((done, fail) => {
        const child = spawn(command, args, { cwd, env, stdio: 'inherit', shell: process.platform === 'win32' });
        child.on('error', error => fail(new Error(`Could not run ${command}: ${error.message}`)));
        child.on('exit', code => (code === 0 ? done() : fail(new Error(`${command} ${args.join(' ')} failed (exit code ${code}) in ${cwd}. Its output is above.`))));
    });
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] || '')).href) {
    let args;
    try {
        args = parseArgs({
            allowPositionals: true,
            options: {
                'dry-run': { type: 'boolean' },
                only: { type: 'string' },
                skip: { type: 'string' },
                'resend-invite': { type: 'boolean' },
                'skip-build': { type: 'boolean' },
                import: { type: 'string' },
                secrets: { type: 'string' },
                verbose: { type: 'boolean' },
                help: { type: 'boolean', short: 'h' },
            },
        });
    } catch (error) {
        console.error(`${error.message}\n\n${HELP}`);
        process.exit(1);
    }
    if (args.values.help || args.positionals.length !== 1) {
        (args.values.help ? console.log : console.error)(HELP);
        process.exit(args.values.help ? 0 : 1);
    }
    try {
        const { ok } = await runProvision({
            answersPath: args.positionals[0],
            options: {
                dryRun: args.values['dry-run'],
                only: args.values.only,
                skip: args.values.skip,
                resendInvite: args.values['resend-invite'],
                skipBuild: args.values['skip-build'],
                importFile: args.values.import ? resolve(args.values.import) : undefined,
                secretsPath: args.values.secrets,
                verbose: args.values.verbose,
            },
        }, {
            repoRoot,
            root: resolve(repoRoot, 'client-zips'),
            env: process.env,
            fetch: globalThis.fetch,
            runner: spawnRunner,
            resolver: publicResolver(),
        });
        process.exit(ok ? 0 : 1);
    } catch (error) {
        // Our own errors say what to do; anything else is a bug, so show where.
        const known = error instanceof ProvisionError || error?.name === 'ApiError';
        console.error(`\n✗ ${known ? error.message : error?.stack || error}`);
        process.exit(1);
    }
}
