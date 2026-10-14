// Puts every SQL file you need to run into one folder, numbered in order:
//
//   npm run sql-files [-- <answers.json>] [--count 500]
//
// scripts/sql/1-builder.sql                    builder forms + admin page
// scripts/sql/2-test-client-setup.sql          the test client's CRM (from the answers file)
// scripts/sql/3-test-client-customers.sql      made-up customers for trying it out
// scripts/sql/4-remove-test-customers.sql      only when you want them gone
//
// The folder is rebuilt from the sources each time, so it is always current.

import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupSql } from '../template/backend/seed.js';
import { parseSubmissionJson, buildOptions } from '../builder/src/zip/build.js';
import { submissionToClientConfig } from '../builder/src/catalog/submission.js';
import { testDataSql, removeTestDataSql } from './make-test-data.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'scripts', 'sql');

const args = process.argv.slice(2);
const option = name => { const i = args.indexOf(name); return i === -1 ? undefined : args[i + 1]; };
const answersPath = args.find(arg => arg.endsWith('.json')) || join(ROOT, 'client-zips', 'test-client-answers.json');
const count = Number(option('--count') ?? 500);

const parsed = parseSubmissionJson(readFileSync(answersPath, 'utf8'));
const config = submissionToClientConfig(parsed.submission, buildOptions(parsed));
const schema = readFileSync(join(ROOT, 'template', 'backend', 'schema.sql'), 'utf8');
const today = new Date().toISOString().slice(0, 10);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
copyFileSync(join(ROOT, 'builder', 'backend', 'builder.sql'), join(OUT, '1-builder.sql'));
writeFileSync(join(OUT, '2-test-client-setup.sql'), setupSql({ schema, config }));
writeFileSync(join(OUT, '3-test-client-customers.sql'), testDataSql(config, { count, today }));
writeFileSync(join(OUT, '4-remove-test-customers.sql'), removeTestDataSql());
writeFileSync(join(OUT, 'READ-ME-FIRST.txt'), [
    `SQL files for the builder Supabase project, made ${today}.`,
    '',
    'Run them in the Supabase SQL Editor, one at a time, in this order:',
    '  1-builder.sql                  the setup forms and your admin page',
    `  2-test-client-setup.sql        the test client's CRM (${config.client.name}); ${config.client.ownerEmail || 'the first login'} becomes its admin`,
    `  3-test-client-customers.sql    ${count} made-up customers to try it out`,
    '  4-remove-test-customers.sql    ONLY when you want the made-up customers gone',
    '',
    'Each file is safe to run again. Re-run 1 and 2 after updates.',
    '',
].join('\n'));
console.log(`✓ ${OUT}\n  1-builder.sql\n  2-test-client-setup.sql\n  3-test-client-customers.sql\n  4-remove-test-customers.sql\n  READ-ME-FIRST.txt`);
