import test from 'node:test';
import assert from 'node:assert/strict';
import { emptySubmission, submissionToClientConfig, stageLocks, defaultStageList, submissionFeatures, brandingOverrides } from '../../builder/src/catalog/submission.js';
import { validateClientConfig, resolveClientConfig } from '../../template/src/config/resolve.js';

const filled = () => {
    const submission = emptySubmission({ contact: { company: 'Ray2Volt Solar', name: 'Asha', phone: '9800000000', email: 'owner@ray2volt.example', state: 'Gujarat' } });
    submission.answers = {
        partners: 'no', partnerOffices: 'no', quotations: 'yes', payments: 'both', subsidy: 'yes', bom: 'yes', trucks: 'no',
        godown: 'yes', documents: 'both', installerLogins: 'yes', installerPayouts: 'no', installationPayments: 'yes',
        installationPage: 'yes', calendar: 'yes', attendance: 'no', chat: 'no', exports: 'yes',
    };
    return submission;
};

test('a default-workflow submission becomes a valid config', () => {
    const config = submissionToClientConfig(filled());
    assert.deepEqual(validateClientConfig(config).errors, []);
    assert.equal(config.client.slug, 'ray2volt-solar');
    assert.equal(config.client.ownerEmail, 'owner@ray2volt.example');
    assert.equal(config.features.vendorLogin, true);
    assert.equal(config.features.inventory, true);
    const resolved = resolveClientConfig(config);
    assert.equal(resolved.features.vendorLogin, true, 'default stages keep the installer stages');
    assert.ok(resolved.stages.some(stage => stage.id === 'LOAN'));
});

test('cash-only clients get no LOAN stage', () => {
    const submission = filled();
    submission.answers.payments = 'cash';
    const stages = submissionToClientConfig(submission).pipeline.stages.map(stage => stage.id);
    assert.ok(!stages.includes('LOAN'));
    assert.ok(stages.includes('CASH'));
});

test('a custom workflow keeps the client stages, labels, fields and lists', () => {
    const submission = filled();
    submission.workflow = {
        ...submission.workflow,
        stagesMode: 'custom',
        stages: [
            { id: 'LEADS', label: 'Enquiries' },
            { id: 'SITE SURVEY', label: 'Site survey', custom: true, group: 'enquiry' },
            { id: 'REGISTRATION' }, { id: 'LOAN' }, { id: 'CASH' }, { id: 'MATERIAL ORDER' }, { id: 'MATERIAL INTEGRATION' },
            { id: 'MATERIAL DELIVERY' }, { id: 'INSTALLATION STATUS' }, { id: 'GEO TAG PHOTO' }, { id: 'SUBSIDY STATUS' },
            { id: 'COMPLETED' }, { id: 'LOST PROJECT' },
        ],
        dropdowns: { module_brand: ['WAAREE', 'Adani'], not_a_list: ['x'] },
        customFields: [{ key: 'survey_date', label: 'Survey date', type: 'date', stage: 'SITE SURVEY', required: true }],
    };
    const config = submissionToClientConfig(submission);
    assert.deepEqual(validateClientConfig(config).errors, []);
    const resolved = resolveClientConfig(config);
    assert.equal(resolved.stages[0].label, 'Enquiries');
    assert.equal(resolved.stages[1].id, 'SITE SURVEY');
    assert.deepEqual(resolved.dropdowns.metadata.module_brand, ['WAAREE', 'Adani']);
    assert.ok(!('not_a_list' in config.dropdowns));
    assert.deepEqual(resolved.stages[1].requirements, [['custom_fields.survey_date', 'Survey date', 'present']]);
});

test('a sheet-link submission keeps the link and the default stages', () => {
    const submission = filled();
    submission.workflow = { ...submission.workflow, source: 'sheet', sheetUrl: 'https://docs.google.com/spreadsheets/d/abc/view', stagesMode: 'custom', stages: [{ id: 'LEADS' }], customFields: [{ key: 'x1', label: 'X', type: 'text', stage: 'LEADS' }] };
    const config = submissionToClientConfig(submission);
    assert.equal(config.workflowSource.type, 'sheet');
    assert.equal(config.workflowSource.sheetUrl, 'https://docs.google.com/spreadsheets/d/abc/view');
    assert.ok(config.pipeline.stages.length > 5, 'stages come from defaults until the admin builds them from the sheet');
    assert.deepEqual(config.customFields, []);
});

test('admin overrides win and stage locks explain themselves', () => {
    const { features } = submissionFeatures(filled(), { attendance: true, stampLogin: true });
    assert.equal(features.attendance, true);
    assert.ok(!('stampLogin' in features));
    const locks = stageLocks(features);
    assert.equal(locks['GEO TAG PHOTO'], 'Needed for Installer (vendor) logins');
    assert.ok(defaultStageList({ loanTracking: false, cashPayments: true, subsidyTracking: true }).every(stage => stage.id !== 'LOAN'));
});

test('admin company details are merged over the submission: known keys with text only', () => {
    const branding = {
        address: '  12 Ring Road,\nSurat 395002  ', gstin: '24ABCDE1234F1Z5', website: 'www.ray2volt.example', logoUrl: 'https://cdn.example.com/logo.png',
        epcCode: 'EPC-77', bankAccountName: 'Ray2Volt Solar', bankAccountNumber: '001234567890', bankName: 'State Bank of India',
        bankBranch: 'Surat', bankIfsc: 'SBIN0001234',
        phone: '   ', email: 42, notAField: 'dropped', state: 'Maharashtra',
    };
    const config = submissionToClientConfig(filled(), { branding });
    assert.deepEqual(validateClientConfig(config).errors, []);
    assert.equal(config.branding.address, '12 Ring Road,\nSurat 395002');
    assert.equal(config.branding.bankIfsc, 'SBIN0001234');
    assert.equal(config.branding.logoUrl, 'https://cdn.example.com/logo.png');
    assert.equal(config.branding.state, 'Maharashtra', 'known keys may be overridden');
    assert.equal(config.branding.phone, '9800000000', 'a blank keeps what the client gave');
    assert.equal(config.branding.email, 'owner@ray2volt.example', 'non-text values are ignored');
    assert.equal(config.branding.companyName, 'Ray2Volt Solar');
    assert.ok(!('notAField' in config.branding));
    assert.deepEqual(Object.keys(config.branding).sort(), Object.keys(submissionToClientConfig(filled()).branding).sort());

    assert.deepEqual(brandingOverrides(null), {});
    assert.deepEqual(brandingOverrides('nope'), {});
    assert.deepEqual(submissionToClientConfig(filled(), { branding: {} }), submissionToClientConfig(filled()));

    const bad = submissionToClientConfig(filled(), { branding: { bankIfsc: 'sbin0001234', logoUrl: 'http://example.com/logo.png' } });
    assert.equal(validateClientConfig(bad).errors.length, 2);
});
