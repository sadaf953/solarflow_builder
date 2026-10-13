import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { unzipSync, strFromU8 } from 'fflate';
import { PGlite } from '@electric-sql/pglite';
import { SUPABASE_STUB } from '../backend/supabaseStub.mjs';
import { makeClient } from '../../scripts/make-client.mjs';
import { collectTemplateFiles } from '../../scripts/pack-template.mjs';
import { createClientZip, buildClientFiles, makeZip, parseSubmissionJson } from '../../builder/src/zip/build.js';
import { submissionToClientConfig } from '../../builder/src/catalog/submission.js';
import { validateClientConfig, defaultClientConfig } from '../../template/src/config/resolve.js';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const fixturePath = fileURLToPath(new URL('./fixtures/submission.json', import.meta.url));
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
const SLUG = 'surya-o-neil-solar';
const ROOT = `${SLUG}-solarflow/`;
const GENERATED_AT = '2026-10-01T10:00:00.000Z';
const tmp = () => mkdtempSync(join(tmpdir(), 'sf-zip-'));

const cli = (...args) => spawnSync(process.execPath, [join(repoRoot, 'scripts/make-client.mjs'), ...args], { encoding: 'utf8' });

test('make-client writes a complete client zip', async () => {
    const out = tmp();
    const run = cli(fixturePath, '--out', out);
    assert.equal(run.status, 0, run.stderr);
    const zipPath = join(out, `${SLUG}-solarflow.zip`);
    assert.ok(existsSync(zipPath));
    const entries = unzipSync(readFileSync(zipPath));
    const paths = Object.keys(entries);
    const text = path => strFromU8(entries[ROOT + path]);

    assert.ok(paths.every(path => path.startsWith(ROOT)), 'one root folder');
    for (const path of ['src/App.jsx', 'index.html', 'vite.config.js', 'backend/setup.sql', 'backend/functions/add_user/index.ts', 'README.md', 'SETUP-SUMMARY.md', '.env.example']) {
        assert.ok(entries[ROOT + path], `${path} is in the zip`);
    }
    for (const path of paths.map(path => path.slice(ROOT.length))) {
        assert.ok(!/(^|\/)(node_modules|dist|tests)\//.test(path), `${path} should not ship`);
        assert.ok(!/(^|\/)\.env(?!\.example$)/.test(path), `${path} should not ship`);
        assert.notEqual(path, 'README.client.md');
    }

    const pkg = JSON.parse(text('package.json'));
    assert.equal(pkg.name, SLUG);
    assert.deepEqual(pkg.dependencies, JSON.parse(readFileSync(join(repoRoot, 'template/package.json'), 'utf8')).dependencies);

    const readme = text('README.md');
    assert.doesNotMatch(readme, /\{\{[A-Z_]+\}\}/);
    assert.match(readme, /SolarFlow for Surya O'Neil Solar/);
    assert.match(readme, /owner@surya-solar\.example/);

    const configDir = tmp();
    writeFileSync(join(configDir, 'client.config.mjs'), text('src/config/client.config.js'));
    const shipped = (await import(pathToFileURL(join(configDir, 'client.config.mjs')).href)).default;
    assert.deepEqual(validateClientConfig(shipped).errors, []);
    assert.deepEqual(shipped, submissionToClientConfig(fixture));
    assert.equal(shipped.features.teamChat, true, 'the client override is kept');
    assert.equal(shipped.pipeline.stages[1].id, 'SITE SURVEY');

    const banner = readFileSync(join(repoRoot, 'template/public/banner.png'));
    assert.ok(Buffer.from(entries[`${ROOT}public/banner.png`]).equals(banner), 'binary files survive');
    const logo = readFileSync(join(repoRoot, 'template/src/assets/solarflow-logo-blue.svg'));
    assert.ok(Buffer.from(entries[`${ROOT}src/assets/solarflow-logo-blue.svg`]).equals(logo));

    const summary = text('SETUP-SUMMARY.md');
    assert.match(summary, /## To discuss[\s\S]*dealers or sub-agents/);
    assert.match(summary, /\*\*Survey date\*\* \(`survey_date`\)/);
});

test('setup.sql from the zip runs on a fresh database, twice', async () => {
    const { bytes } = makeClient({ submissionPath: fixturePath, outDir: tmp(), generatedAt: GENERATED_AT });
    const sql = strFromU8(unzipSync(bytes)[`${ROOT}backend/setup.sql`]);
    const db = new PGlite();
    await db.exec(SUPABASE_STUB);
    await db.exec(sql);
    await db.exec(sql);
    const settings = Object.fromEntries((await db.query('select key, value from public.app_settings')).rows.map(row => [row.key, row.value]));
    assert.equal(settings.owner_email, 'owner@surya-solar.example');
    assert.deepEqual(settings.client, { name: "Surya O'Neil Solar", slug: SLUG });
    assert.ok(settings.pipeline.stages.includes('SITE SURVEY'));
    const brands = (await db.query("select label from public.metadata where category = 'module_brand' order by sort_order")).rows.map(row => row.label);
    assert.deepEqual(brands, ['WAAREE', 'Adani', "Ravi's Panels"]);
});

test('the zip is reproducible and matches what the website builds from the packed template', () => {
    const first = makeClient({ submissionPath: fixturePath, outDir: tmp(), generatedAt: GENERATED_AT });
    const second = makeClient({ submissionPath: fixturePath, outDir: tmp(), generatedAt: GENERATED_AT });
    assert.ok(Buffer.from(first.bytes).equals(Buffer.from(second.bytes)));

    // The website gets the template as JSON (client-template.json).
    const packed = JSON.parse(JSON.stringify(collectTemplateFiles()));
    assert.equal(packed['public/banner.png'].encoding, 'base64');
    assert.equal(packed['src/assets/solarflow-logo-blue.svg'].encoding, 'utf8');
    assert.ok(packed['README.client.md'], 'the readme template is packed for buildClientFiles');
    assert.ok(!packed['src/config/client.config.js'] && !Object.keys(packed).some(path => path.startsWith('node_modules/')));
    const web = createClientZip({
        templateFiles: packed,
        schemaSql: readFileSync(join(repoRoot, 'template/backend/schema.sql'), 'utf8'),
        submission: fixture,
        generatedAt: GENERATED_AT,
    });
    assert.ok(Buffer.from(web.bytes).equals(Buffer.from(first.bytes)));
    assert.equal(web.fileName, `${SLUG}-solarflow.zip`);
});

test('--slug and --owner-email override the submission; wrapped exports keep admin overrides', () => {
    const out = tmp();
    const run = cli(fixturePath, '--out', out, '--slug', 'surya-test', '--owner-email', 'boss@surya.example');
    assert.equal(run.status, 0, run.stderr);
    const entries = unzipSync(readFileSync(join(out, 'surya-test-solarflow.zip')));
    assert.match(strFromU8(entries['surya-test-solarflow/README.md']), /boss@surya\.example/);
    assert.equal(JSON.parse(strFromU8(entries['surya-test-solarflow/package.json'])).name, 'surya-test');

    const wrapped = parseSubmissionJson(JSON.stringify({ payload: fixture, adminOverrides: { attendance: true }, slug: 'wrapped' }));
    assert.deepEqual(wrapped.adminOverrides, { attendance: true });
    assert.equal(wrapped.slug, 'wrapped');
    assert.throws(() => parseSubmissionJson('{"hello": 1}'), /not a SolarFlow setup submission/);
});

test('invalid configs are refused with the reasons', () => {
    const out = tmp();
    const run = cli(fixturePath, '--out', out, '--slug', 'Not A Slug');
    assert.equal(run.status, 1);
    assert.match(run.stderr, /slug must be lowercase/);
    assert.ok(!existsSync(join(out, 'Not A Slug-solarflow.zip')));
    assert.throws(() => createClientZip({ templateFiles: {}, schemaSql: '', submission: fixture, slug: '-' }),
        error => error.code === 'invalid_config' && error.validation.errors.length > 0);
});

test('buildClientFiles and makeZip work on their own', () => {
    const config = { ...defaultClientConfig(), client: { name: 'Acme', slug: 'acme', ownerEmail: '' } };
    const templateFiles = {
        'package.json': '{"name":"solarflow-client","version":"1.0.0"}',
        'README.client.md': '# {{CLIENT_NAME}} / {{OWNER_EMAIL}}',
        '.env.local': 'SECRET=1',
        'node_modules/x/index.js': '',
        'src/config/client.config.js': 'old',
    };
    const files = buildClientFiles({ templateFiles, config, schemaSql: '-- schema', generatedAt: GENERATED_AT });
    assert.equal(files['README.md'], '# Acme / your own email address');
    assert.match(files['src/config/client.config.js'], /Generated by SolarFlow Client Builder on 2026-10-01/);
    assert.ok(files['backend/setup.sql'].startsWith('-- schema'));
    const entries = unzipSync(makeZip({ templateFiles, files, rootFolder: 'acme-solarflow' }));
    assert.deepEqual(Object.keys(entries).sort(), [
        'acme-solarflow/.env.example', 'acme-solarflow/README.md', 'acme-solarflow/SETUP-SUMMARY.md',
        'acme-solarflow/backend/setup.sql', 'acme-solarflow/package.json', 'acme-solarflow/src/config/client.config.js',
    ]);
    assert.throws(() => buildClientFiles({ templateFiles: { ...templateFiles, 'README.client.md': '{{NEW_THING}}' }, config, schemaSql: '' }), /NEW_THING/);
});
