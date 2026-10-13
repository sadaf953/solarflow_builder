// Builds a client zip from a submission JSON file, without the website.
//
//   node scripts/make-client.mjs <submission.json> [--out dir] [--slug x] [--owner-email y]
//
// The file is the submission payload, or an export wrapping it as
// {payload, adminOverrides?, slug?, ownerEmail?}. The zip is identical to the
// one the admin page downloads for the same input.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { collectTemplateFiles, TEMPLATE_DIR } from './pack-template.mjs';
import { createClientZip, parseSubmissionJson } from '../builder/src/zip/build.js';

const USAGE = 'Usage: node scripts/make-client.mjs <submission.json> [--out dir] [--slug x] [--owner-email y]';

export function makeClient({ submissionPath, outDir = './client-zips', slug, ownerEmail, generatedAt }) {
    const parsed = parseSubmissionJson(readFileSync(submissionPath, 'utf8'));
    const result = createClientZip({
        templateFiles: collectTemplateFiles(),
        schemaSql: readFileSync(join(TEMPLATE_DIR, 'backend', 'schema.sql'), 'utf8'),
        submission: parsed.submission,
        adminOverrides: parsed.adminOverrides,
        branding: parsed.branding,
        slug: slug ?? parsed.slug,
        ownerEmail: ownerEmail ?? parsed.ownerEmail,
        generatedAt,
    });
    mkdirSync(outDir, { recursive: true });
    const path = join(outDir, result.fileName);
    writeFileSync(path, result.bytes);
    return { ...result, path };
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] || '')).href) {
    let args;
    try {
        args = parseArgs({
            allowPositionals: true,
            options: { out: { type: 'string' }, slug: { type: 'string' }, 'owner-email': { type: 'string' }, help: { type: 'boolean', short: 'h' } },
        });
    } catch (error) {
        console.error(`${error.message}\n${USAGE}`);
        process.exit(1);
    }
    if (args.values.help || args.positionals.length !== 1) {
        console.error(USAGE);
        process.exit(args.values.help ? 0 : 1);
    }
    try {
        const result = makeClient({
            submissionPath: args.positionals[0],
            outDir: args.values.out,
            slug: args.values.slug,
            ownerEmail: args.values['owner-email'],
        });
        for (const warning of result.validation.warnings) console.warn(`! ${warning}`);
        console.log(`✓ ${result.path} (${Math.round(result.bytes.length / 1024)} KB)`);
    } catch (error) {
        for (const message of error.validation?.errors || []) console.error(`✗ ${message}`);
        console.error(error.validation ? 'The zip was not written.' : `✗ ${error.message}`);
        process.exit(1);
    }
}
