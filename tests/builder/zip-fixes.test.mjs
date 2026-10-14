import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { unzipSync, strFromU8 } from 'fflate';
import { createClientZip, fillReadme, parseSubmissionJson } from '../../builder/src/zip/build.js';
import { setupSummaryMarkdown } from '../../builder/src/zip/summary.js';
import { submissionToClientConfig } from '../../builder/src/catalog/submission.js';
import { defaultClientConfig } from '../../template/src/config/resolve.js';

const fixture = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/submission.json', import.meta.url)), 'utf8'));
const GENERATED_AT = '2026-10-01T10:00:00.000Z';

test('README placeholders take company names with $ patterns literally', () => {
    for (const name of ['Sun $& Power', "Sun $' Power", 'Sun $` Power', 'Sun $$ Power']) {
        const config = { ...defaultClientConfig(), client: { name, slug: 'sun', ownerEmail: 'a$&b@sun.example' } };
        assert.equal(fillReadme('# SolarFlow for {{CLIENT_NAME}} ({{OWNER_EMAIL}}) end', config), `# SolarFlow for ${name} (a$&b@sun.example) end`);
    }
});

test('README placeholders are filled in one pass; inserted values are never read as placeholders', () => {
    for (const name of ['{{FOO}}', '{{OWNER_EMAIL_SQL}}', 'Sun {{CLIENT_NAME}} $& Power', '$1 {{OWNER_EMAIL}}']) {
        const config = { ...defaultClientConfig(), client: { name, slug: 'sun', ownerEmail: "o'neil@sun.example" } };
        assert.equal(fillReadme('# {{CLIENT_NAME}} | {{OWNER_EMAIL}} | {{OWNER_EMAIL_SQL}} | {{CLIENT_NAME}}', config),
            `# ${name} | o'neil@sun.example | o''neil@sun.example | ${name}`, name);
    }
    assert.throws(() => fillReadme('{{CLIENT_NAME}} {{NEW_THING}} {{NEW_THING}}', defaultClientConfig()), /no value: \{\{NEW_THING\}\}\.$/);
    assert.equal(fillReadme('No placeholders {{lower}} {single}', defaultClientConfig()), 'No placeholders {{lower}} {single}');
});

test('a company name that looks like a placeholder never stops the download', () => {
    const templateFiles = { 'package.json': '{"name":"x"}', 'README.client.md': '# SolarFlow for {{CLIENT_NAME}}\nSign in as {{OWNER_EMAIL}}.' };
    for (const company of ['{{FOO}} Solar', 'A$&B {{OWNER_EMAIL_SQL}} Solar']) {
        const submission = { ...fixture, contact: { ...fixture.contact, company } };
        const result = createClientZip({ templateFiles, schemaSql: '-- schema', submission, generatedAt: GENERATED_AT });
        const readme = strFromU8(unzipSync(result.bytes)[`${result.config.client.slug}-solarflow/README.md`]);
        assert.equal(readme.split('\n')[0], `# SolarFlow for ${company}`);
    }
});

test('SETUP-SUMMARY lists only the core features the client really gets', () => {
    const config = submissionToClientConfig(fixture);
    assert.equal(config.features.dealers, false);
    const summary = setupSummaryMarkdown({ submission: fixture, config, generatedAt: GENERATED_AT });
    const always = summary.match(/Always included: (.*)\./)[1];
    assert.match(always, /Customer pipeline/);
    assert.doesNotMatch(always, /Filter by dealer/);

    const withDealers = submissionToClientConfig(fixture, { adminOverrides: { dealers: true } });
    assert.match(setupSummaryMarkdown({ submission: fixture, adminOverrides: { dealers: true }, config: withDealers }), /Always included: .*Filter by dealer/);
});

test('the admin workflow reaches the zip, the summary and saved exports', () => {
    const workflow = {
        source: 'form', stagesMode: 'custom',
        stages: [{ id: 'LEADS' }, { id: 'ROOF CHECK', label: 'Roof check', custom: true, group: 'enquiry' }, { id: 'COMPLETED' }, { id: 'LOST PROJECT' }],
        dropdowns: {}, customFields: [{ key: 'roof_type', label: 'Roof type', type: 'text', stage: 'ROOF CHECK' }],
    };
    const templateFiles = { 'package.json': '{"name":"x"}', 'README.client.md': '# {{CLIENT_NAME}}' };
    const result = createClientZip({ templateFiles, schemaSql: '-- schema', submission: fixture, workflow, generatedAt: GENERATED_AT });
    assert.ok(result.config.pipeline.stages.some(stage => stage.id === 'ROOF CHECK'));
    assert.equal(result.config.customFields[0].key, 'roof_type');
    const summary = strFromU8(unzipSync(result.bytes)[`${result.config.client.slug}-solarflow/SETUP-SUMMARY.md`]);
    assert.match(summary, /SolarFlow team set up the stages/);
    assert.match(summary, /\*\*Roof type\*\* \(`roof_type`\)/);
    assert.match(summary, /stage added back: Needed for/);

    const parsed = parseSubmissionJson(JSON.stringify({ payload: fixture, workflow }));
    assert.deepEqual(parsed.workflow, workflow);
    assert.equal(parseSubmissionJson(JSON.stringify({ payload: fixture, workflow: [] })).workflow, undefined);
    assert.equal(parseSubmissionJson(JSON.stringify(fixture)).workflow, undefined);
});

test('SETUP-SUMMARY says why a feature is kept on against the answers', () => {
    const adminOverrides = { documentUploads: false, checklists: false };
    const config = submissionToClientConfig(fixture, { adminOverrides });
    assert.equal(config.features.checklists, false);
    const summary = setupSummaryMarkdown({ submission: fixture, adminOverrides, config, generatedAt: GENERATED_AT });
    const on = summary.split('## Features off')[0];
    assert.match(on, /- \*\*Document checklists\*\* \([^)]*\): Document uploads is off, and every project needs one way to track customer documents\./);
});

test('a hidden character in the company or contact name is caught on the business step', async () => {
    const { businessErrors } = await import('../../builder/src/pages/wizard/checks.js');
    const base = { company: 'Sun Power', name: 'Asha', phone: '9800000000', email: 'a@b.co' };
    assert.deepEqual(businessErrors(base), {});
    assert.match(businessErrors({ ...base, company: 'Sun Power' }).company, /hidden character/);
    assert.match(businessErrors({ ...base, name: 'Asha\nX' }).name, /hidden character/);
});
