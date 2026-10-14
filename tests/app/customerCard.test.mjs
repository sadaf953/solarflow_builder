import test from 'node:test';
import assert from 'node:assert/strict';
import { getChangedFields, mergeServerCopy } from '../../template/src/components/modal-tabs/customerDraft.js';
import { configWith, importTemplate } from '../dashboard/fixtures/templateModules.mjs';

// The customer card saves only getChangedFields(draft, baseline), and its
// conflict check compares the server row with the baseline.
const changed = (a, b) => [...getChangedFields(a, b)].sort();

const LOADED = {
    id: 'c1', updated_at: '2026-10-14T10:00:00Z', stage: 'MATERIAL INTEGRATION', phone_number: '9800000001',
    inverter_make: 'Growatt', inverter_serial_no: 'INV-1', custom_fields: { survey_date: '2026-10-01' },
};

test('a colleague\'s change read while the user edits another field is not sent back as the old value', () => {
    const draft = { ...LOADED, phone_number: '9800000002' };
    const server = { ...LOADED, inverter_make: 'Solis', updated_at: '2026-10-14T10:05:00Z' };
    const next = mergeServerCopy(draft, LOADED, server);
    assert.deepEqual(changed(next.draft, next.baseline), ['phone_number']);
    assert.equal(next.draft.inverter_make, 'Solis');
    assert.deepEqual(next.edited, ['phone_number']);
});

test('a field both people changed keeps the typed value and its old baseline, so Save sees the conflict', () => {
    const draft = { ...LOADED, inverter_make: 'Fronius' };
    const server = { ...LOADED, inverter_make: 'Solis', updated_at: '2026-10-14T10:05:00Z' };
    const next = mergeServerCopy(draft, LOADED, server);
    assert.equal(next.draft.inverter_make, 'Fronius');
    assert.equal(next.baseline.inverter_make, 'Growatt');
    assert.deepEqual(next.edited, ['inverter_make']);
    // The conflict check: changed on the server since the baseline, and changed by us.
    assert.ok(getChangedFields(server, next.baseline).has('inverter_make'));
    assert.ok(getChangedFields(next.draft, next.baseline).has('inverter_make'));
});

test('a list row with only some columns is merged into the full record, not swapped in', () => {
    const listRow = { id: 'c1', stage: 'MATERIAL INTEGRATION', phone_number: '9800000001', updated_at: LOADED.updated_at };
    const next = mergeServerCopy({ ...LOADED }, { ...LOADED }, listRow);
    assert.deepEqual(next.draft, LOADED);
    assert.deepEqual(next.baseline, LOADED);
    assert.equal(next.draft.inverter_serial_no, 'INV-1');
    assert.deepEqual(next.draft.custom_fields, { survey_date: '2026-10-01' });
});

test('the full record arriving after the user typed fills the missing columns and keeps the typing', () => {
    const listRow = { id: 'c1', stage: 'LEADS', phone_number: '9800000001', updated_at: LOADED.updated_at };
    const draft = { ...listRow, inverter_make: 'Typed' };
    const next = mergeServerCopy(draft, listRow, { ...LOADED, stage: 'LEADS' });
    assert.equal(next.draft.inverter_make, 'Typed');
    assert.equal(next.draft.inverter_serial_no, 'INV-1');
    assert.equal(next.baseline.inverter_make, 'Growatt');
    assert.deepEqual(changed(next.draft, next.baseline), ['inverter_make']);
});

const shippedPipeline = configWith().pipeline;
const withoutStages = (...removed) => configWith({
    pipeline: { ...shippedPipeline, stages: shippedPipeline.stages.filter(stage => !removed.includes(stage.id)) },
});
const feasibilityTab = report => report.getMissingFeasibilityFields(report.mapFeasibilityReport({}))
    .find(item => item.field.includes('Feasibility No')).tab;

test('the feasibility report asks for the Feasibility No in the Loan tab when there is no Registration stage', async () => {
    const shipped = await importTemplate('feasibilityReport.js');
    assert.equal(shipped.feasibilityNoStage(), 'REGISTRATION');
    assert.equal(feasibilityTab(shipped), 'Registration');

    const noRegistration = await importTemplate('feasibilityReport.js', { config: withoutStages('REGISTRATION') });
    assert.equal(noRegistration.feasibilityNoStage(), 'LOAN');
    assert.equal(feasibilityTab(noRegistration), 'Loan');
    const filled = noRegistration.mapFeasibilityReport({ registration_no: 'PMSG-1' });
    assert.ok(!noRegistration.getMissingFeasibilityFields(filled).some(item => item.field.includes('Feasibility No')));
});

test('the Registration tab asks for the Subsidy Token Photo only with subsidy tracking on', async () => {
    const fields = async config => (await importTemplate('components/modal-tabs/registrationDocuments.js', { config }))
        .REGISTRATION_DOCUMENTS.map(doc => doc.field);
    assert.ok((await fields(configWith())).includes('subsidy_token_photo'));
    assert.deepEqual(await fields(configWith({ features: { subsidyTracking: false } })), ['application_acknowledgment', 'feasibilty_document']);
});
