import test from 'node:test';
import assert from 'node:assert/strict';
import {
    emptySubmission, submissionToClientConfig, stageLocks, defaultStageList, submissionFeatures, brandingOverrides,
    normalizePhone, restoredStages,
} from '../../builder/src/catalog/submission.js';
import { validateClientConfig, resolveClientConfig } from '../../template/src/config/resolve.js';
import { businessErrors, workflowErrors } from '../../builder/src/pages/wizard/checks.js';
import { checkClientConfig } from '../../builder/src/zip/build.js';

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

const customStagesFrom = submission => ({
    ...submission.workflow, stagesMode: 'custom', stages: defaultStageList(submissionFeatures(submission).features),
});
const stageIds = config => config.pipeline.stages.map(stage => stage.id);

test('a feature chosen after the stages were customised gets its stage back, and the client is told', () => {
    const submission = filled();
    submission.answers.subsidy = 'no';
    submission.workflow = customStagesFrom(submission);
    assert.ok(!submission.workflow.stages.some(stage => stage.id === 'SUBSIDY STATUS'));
    submission.answers.subsidy = 'yes';

    const config = submissionToClientConfig(submission);
    const ids = stageIds(config);
    assert.equal(ids.indexOf('SUBSIDY STATUS'), ids.indexOf('DISCOM INSPECTION') + 1, 'put back at its usual place');
    assert.deepEqual(ids.slice(-2), ['COMPLETED', 'LOST PROJECT']);
    assert.equal(resolveClientConfig(config).features.subsidyTracking, true);
    assert.deepEqual(validateClientConfig(config).warnings.filter(warning => /will be off/.test(warning)), []);
    assert.deepEqual(workflowErrors(submission), []);
    assert.deepEqual(restoredStages(submission), [{ id: 'SUBSIDY STATUS', label: 'Subsidy Status', reason: 'Needed for Subsidy tracking' }]);
    assert.deepEqual(restoredStages(filled()), [], 'nothing to tell with the standard stages');
});

test('an admin override that needs a stage is not undone by a custom stage list', () => {
    const submission = filled();
    submission.answers.payments = 'cash';
    submission.workflow = customStagesFrom(submission);
    submission.workflow.stages = submission.workflow.stages.filter(stage => stage.id !== 'GEO TAG PHOTO');
    const adminOverrides = { loanTracking: true };

    const config = submissionToClientConfig(submission, { adminOverrides });
    const ids = stageIds(config);
    assert.equal(ids.indexOf('LOAN'), ids.indexOf('REGISTRATION') + 1);
    assert.ok(ids.includes('GEO TAG PHOTO'), 'installer logins keep their stage too');
    const resolved = resolveClientConfig(config);
    assert.equal(resolved.features.loanTracking, true);
    assert.equal(resolved.features.vendorLogin, true);
    assert.deepEqual(restoredStages(submission, { adminOverrides }).map(stage => stage.id), ['LOAN', 'GEO TAG PHOTO']);
});

test('the admin workflow wins over the client workflow, also for a shared sheet', () => {
    const submission = filled();
    submission.workflow = { ...submission.workflow, source: 'sheet', sheetUrl: 'https://docs.google.com/spreadsheets/d/abc/view', sheetNote: 'Tab 2' };
    const workflow = {
        source: 'form', stagesMode: 'custom',
        stages: [{ id: 'LEADS', label: 'Enquiries' }, { id: 'SITE SURVEY', label: 'Site survey', custom: true, group: 'enquiry' }, { id: 'COMPLETED' }, { id: 'LOST PROJECT' }],
        dropdowns: { module_brand: ['Adani'] },
        customFields: [{ key: 'survey_date', label: 'Survey date', type: 'date', stage: 'SITE SURVEY' }],
    };
    const config = submissionToClientConfig(submission, { workflow });
    assert.deepEqual(validateClientConfig(config).errors, []);
    assert.equal(config.pipeline.stages[0].label, 'Enquiries');
    assert.ok(stageIds(config).includes('SITE SURVEY'));
    assert.ok(stageIds(config).includes('GEO TAG PHOTO'), 'stages the features need are added back');
    assert.deepEqual(config.dropdowns.module_brand, ['Adani']);
    assert.equal(config.customFields[0].key, 'survey_date');
    assert.equal(config.workflowSource.sheetUrl, 'https://docs.google.com/spreadsheets/d/abc/view', 'the client sheet is still recorded');
    assert.ok(checkClientConfig(submissionToClientConfig(submission)).warnings.some(warning => /shared a sheet/.test(warning)));
    assert.ok(!checkClientConfig(config, { adminWorkflow: workflow }).warnings.some(warning => /shared a sheet/.test(warning)));

    const clientForm = filled();
    clientForm.workflow = { ...clientForm.workflow, stagesMode: 'custom', stages: workflow.stages, customFields: [{ key: 'x_1', label: 'X', type: 'text', stage: 'LEADS' }] };
    assert.deepEqual(submissionToClientConfig(clientForm, { workflow: { ...workflow, customFields: [] } }).customFields, []);
});

test('the GEB / GEDA charges label is only the default in Gujarat; the admin can set it', () => {
    assert.equal(submissionToClientConfig(filled()).branding.chargesLabel, 'GEB / GEDA');
    const elsewhere = filled();
    elsewhere.contact.state = 'Maharashtra';
    assert.equal(submissionToClientConfig(elsewhere).branding.chargesLabel, '');
    const branding = { discomName: 'MSEDCL', chargesLabel: 'MSEDCL / MEDA' };
    const config = submissionToClientConfig(elsewhere, { branding });
    assert.equal(config.branding.discomName, 'MSEDCL');
    assert.equal(config.branding.chargesLabel, 'MSEDCL / MEDA');
    assert.deepEqual(validateClientConfig(config).errors, []);
});

test('phone numbers typed with +91, 0 or spaces are stored as 10 digits', () => {
    for (const typed of ['+91 98765 43210', '+919876543210', '098765 43210', ' 98765-43210 ']) assert.equal(normalizePhone(typed), '9876543210', typed);
    assert.equal(normalizePhone('+91 98765'), '+91 98765', 'a half-typed number is left as typed');
    for (const typed of ['91 98765 43210', '0091 98765 43210', '919876543210', '+91 098765 43210']) assert.equal(normalizePhone(typed), '9876543210', typed);
    for (const short of ['+91 98765 432', '+9198765432', '91 98765 432']) {
        assert.equal(normalizePhone(short), short, `${short}: the country code is not counted as part of the number`);
    }
    assert.equal(normalizePhone('9198765432'), '9198765432', 'ten digits starting with 91 are a number, not a code');
    assert.equal(normalizePhone('98765432101'), '98765432101', 'never cut to a wrong number');
    const contact = { company: 'A', name: 'B', email: 'a@b.example' };
    assert.ok(!businessErrors({ ...contact, phone: '+91 98765 43210' }).phone);
    assert.ok(businessErrors({ ...contact, phone: '98765432101' }).phone);
    assert.ok(businessErrors({ ...contact, phone: '+91 98765 432' }).phone, 'too short once +91 is removed');
    const submission = filled();
    submission.contact.phone = '+91 98000 00000';
    assert.equal(submissionToClientConfig(submission).branding.phone, '9800000000');
});
