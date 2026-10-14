import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultClientConfig, resolveClientConfig, resolveFeaturesAndPipeline, validateClientConfig } from '../../template/src/config/resolve.js';
import { configWith, importTemplate } from '../dashboard/fixtures/templateModules.mjs';

const PAYMENT_RULE = ['payment_type', 'Payment Type', 'paymentType'];
const withoutStages = (config, ...ids) => ({ ...config, pipeline: { ...config.pipeline, stages: config.pipeline.stages.filter(stage => !ids.includes(stage.id)) } });
const requirementsOf = (resolved, id) => resolved.stages.find(stage => stage.id === id)?.requirements || [];

test('a required Yes/No extra field is met by either answer, not only by Yes', async () => {
    const config = configWith({ customFields: [{ key: 'roof_ok', label: 'Roof checked?', type: 'yesno', stage: 'LEADS', required: true, showInAddLead: true }] });
    const runtime = await importTemplate('config/index.js', { config });
    const lead = { customer_name: 'Asha', phone_number: '9876543210' };
    for (const answer of ['Yes', 'No', true, false]) {
        assert.deepEqual(runtime.missingStageRequirements('LEADS', { ...lead, custom_fields: { roof_ok: answer } }), [], String(answer));
    }
    for (const custom_fields of [{}, { roof_ok: null }, { roof_ok: ' ' }]) {
        assert.deepEqual(runtime.missingStageRequirements('LEADS', { ...lead, custom_fields }), ['Roof checked?']);
    }
});

test('without Registration, the stage before Loan / Cash asks for the payment type', async () => {
    const resolved = resolveClientConfig(withoutStages(defaultClientConfig(), 'REGISTRATION'));
    assert.deepEqual(requirementsOf(resolved, 'LEADS').at(-1), PAYMENT_RULE);

    // With Registration in place, Leads asks only for name and phone.
    assert.ok(!requirementsOf(resolveClientConfig(defaultClientConfig()), 'LEADS').some(([path]) => path === 'payment_type'));
    // Only cash tracking, no Registration: still asked, so nobody lands in a stage they skip.
    const cashOnly = withoutStages({ ...defaultClientConfig(), features: { ...defaultClientConfig().features, loanTracking: false } }, 'REGISTRATION');
    assert.deepEqual(requirementsOf(resolveClientConfig(cashOnly), 'LEADS').at(-1), PAYMENT_RULE);
    // Neither Loan nor Cash: nothing to route, nothing asked.
    const neither = withoutStages(defaultClientConfig(), 'REGISTRATION', 'LOAN', 'CASH');
    assert.ok(!resolveClientConfig(neither).stages.some(stage => stage.requirements.some(([path]) => path === 'payment_type')));

    // A custom stage between Leads and Loan is the one that asks.
    const custom = withoutStages(defaultClientConfig(), 'REGISTRATION');
    custom.pipeline.stages.splice(1, 0, { id: 'SITE SURVEY', custom: true, label: 'Site survey', group: 'enquiry' });
    const resolvedCustom = resolveClientConfig(custom);
    assert.deepEqual(requirementsOf(resolvedCustom, 'SITE SURVEY'), [PAYMENT_RULE]);
    assert.ok(!requirementsOf(resolvedCustom, 'LEADS').some(([path]) => path === 'payment_type'));

    const base = configWith();
    const runtime = await importTemplate('config/index.js', { config: withoutStages(base, 'REGISTRATION') });
    const lead = { stage: 'LEADS', customer_name: 'Asha', phone_number: '9876543210' };
    assert.deepEqual(runtime.missingStageRequirements('LEADS', lead), ['Payment Type']);
    assert.deepEqual(runtime.missingStageRequirements('LEADS', { ...lead, payment_type: 'Cash' }), []);
    assert.equal(runtime.getNextStageId({ ...lead, payment_type: 'Cash' }), 'CASH');
});

test('payment types: Cash is always offered; Loan is hidden only for cash-only businesses', async () => {
    const options = async features => (await importTemplate('config/index.js', { config: configWith({ features }) })).paymentTypeOptions();
    assert.deepEqual(await options({ loanTracking: true, cashPayments: true }), ['Loan', 'Cash']);
    assert.deepEqual(await options({ loanTracking: true, cashPayments: false }), ['Loan', 'Cash'], 'a mostly-loan client can still record a cash customer');
    assert.deepEqual(await options({ loanTracking: false, cashPayments: true }), ['Cash']);
    assert.deepEqual(await options({ loanTracking: false, cashPayments: false }), ['Loan', 'Cash'], 'nothing tracked: either can be recorded');

    // A cash customer with no Cash stage skips Loan.
    const runtime = await importTemplate('config/index.js', { config: configWith({ features: { cashPayments: false } }) });
    assert.equal(runtime.getNextStageId({ stage: 'REGISTRATION', payment_type: 'Cash' }), 'MATERIAL ORDER');
});

test('with both document features off, checklists stay on with a reason', async () => {
    const config = { ...defaultClientConfig(), features: { ...defaultClientConfig().features, documentUploads: false, checklists: false } };
    const { features, reasons } = resolveFeaturesAndPipeline(config);
    assert.equal(features.checklists, true);
    assert.equal(features.documentUploads, false);
    assert.match(reasons.checklists, /Document uploads is off/);
    assert.ok(validateClientConfig(config).warnings.some(warning => /^Document checklists will stay on/.test(warning)));
    assert.ok(!validateClientConfig(defaultClientConfig()).warnings.some(warning => /stay on/.test(warning)));

    const runtime = await importTemplate('config/index.js', { config: configWith({ features: { documentUploads: false, checklists: false } }) });
    assert.equal(runtime.documentMode(), 'checklist');
    assert.equal(runtime.isOn('checklists'), true);
    const filesOnly = await importTemplate('config/index.js', { config: configWith({ features: { documentUploads: true, checklists: false } }) });
    assert.equal(filesOnly.documentMode(), 'files');
});

test('extra fields on Completed or Lost Project are rejected and ignored', () => {
    const config = defaultClientConfig();
    config.customFields = [
        { key: 'handover_note', label: 'Handover note', type: 'text', stage: 'COMPLETED', required: true },
        { key: 'lost_reason', label: 'Lost reason', type: 'text', stage: 'lost project' },
        { key: 'roof_type', label: 'Roof type', type: 'text', stage: 'FINAL REVIEW' },
    ];
    const resolved = resolveClientConfig(config);
    assert.deepEqual(resolved.customFields.map(field => field.key), ['roof_type']);
    assert.deepEqual(requirementsOf(resolved, 'COMPLETED'), []);
    const { errors } = validateClientConfig(config);
    assert.ok(errors.some(error => /"Handover note" cannot be on the Completed stage/.test(error)));
    assert.ok(errors.some(error => /"Lost reason" cannot be on the Lost Project stage/.test(error)));
    assert.ok(!errors.some(error => /Roof type/.test(error)));
});
