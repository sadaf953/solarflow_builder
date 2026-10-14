import test from 'node:test';
import assert from 'node:assert/strict';
import { applyServerCopy, draftAfterSave, getChangedFields } from '../../template/src/components/modal-tabs/customerDraft.js';

// The customer card's pure steps: taking a server copy in, and settling the
// draft once a save finishes.
const LOADED = {
    id: 'c1', updated_at: '2026-10-14T10:00:00Z', stage: 'LEADS', phone_number: '9800000001',
    inverter_make: 'Growatt', module_brand: 'Waaree', custom_fields: { survey_date: '2026-10-01', roof: 'RCC' },
};
const LATER = '2026-10-14T10:05:00Z';
const SAVED_AT = '2026-10-14T10:06:00Z';
const state = (draft, baseline = LOADED, loadedAt = LOADED.updated_at) => ({ draft, baseline, loadedAt });

test('applyServerCopy ignores a copy older than the row last read', () => {
    assert.equal(applyServerCopy(state({ ...LOADED }), { ...LOADED, updated_at: '2026-10-14T09:00:00Z' }, { full: true }), null);
});

test('applyServerCopy moves the loaded time for a full row only while nothing is edited', () => {
    const server = { ...LOADED, inverter_make: 'Solis', updated_at: LATER };
    assert.equal(applyServerCopy(state({ ...LOADED }), server, { full: true }).loadedAt, LATER);
    assert.equal(applyServerCopy(state({ ...LOADED }), server).loadedAt, LOADED.updated_at, 'a list row never moves it');
    const dirty = applyServerCopy(state({ ...LOADED, phone_number: '9800000002' }), server, { full: true });
    assert.equal(dirty.loadedAt, LOADED.updated_at);
    assert.equal(dirty.draft.inverter_make, 'Solis');
    assert.equal(dirty.baseline.phone_number, LOADED.phone_number);
    assert.equal(applyServerCopy(state({ ...LOADED, phone_number: '9800000002' }, LOADED, null), server, { full: true }).loadedAt, LATER,
        'the first full read sets it even while edited');
});

test('applyServerCopy keeps the conflict visible when a colleague saved the field being edited', () => {
    const draft = { ...LOADED, inverter_make: 'Fronius' };
    const server = { ...LOADED, inverter_make: 'Solis', updated_at: LATER };
    const next = applyServerCopy(state(draft), server, { full: true });
    assert.equal(next.loadedAt, LOADED.updated_at);
    assert.equal(next.draft.inverter_make, 'Fronius');
    assert.ok(getChangedFields(server, next.baseline).has('inverter_make'));
    // Pure: the same call twice gives the same answer and leaves its inputs alone.
    const input = state({ ...draft });
    assert.deepEqual(applyServerCopy(input, server, { full: true }), next);
    assert.deepEqual(input, state(draft));
});

test('draftAfterSave takes the stored row when nothing was typed during the save', () => {
    const sent = { ...LOADED, phone_number: '9800000002' };
    const stored = { ...sent, updated_at: SAVED_AT };
    const draft = draftAfterSave({ current: sent, sent, sentBaseline: LOADED, latestBaseline: LOADED, stored });
    assert.deepEqual(draft, stored);
    assert.equal(getChangedFields(draft, stored).size, 0);
});

test('draftAfterSave keeps fields typed while the save was in flight', () => {
    const sent = { ...LOADED, phone_number: '9800000002' };
    const current = { ...sent, phone_number: '9800000003', module_brand: 'Adani', custom_fields: { survey_date: '2026-10-02', roof: 'RCC' } };
    const stored = { ...sent, updated_at: SAVED_AT };
    const draft = draftAfterSave({ current, sent, sentBaseline: LOADED, latestBaseline: LOADED, stored });
    assert.equal(draft.phone_number, '9800000003', 'typed again over a saved field');
    assert.equal(draft.module_brand, 'Adani');
    assert.deepEqual(draft.custom_fields, { survey_date: '2026-10-02', roof: 'RCC' });
    assert.deepEqual([...getChangedFields(draft, stored)].sort(), ['custom_fields', 'module_brand', 'phone_number']);
});

test('draftAfterSave keeps a saved field put back to its old value during the save', () => {
    const sent = { ...LOADED, inverter_make: 'Solis' };
    const current = { ...LOADED };
    const stored = { ...sent, updated_at: SAVED_AT };
    const draft = draftAfterSave({ current, sent, sentBaseline: LOADED, latestBaseline: LOADED, stored });
    assert.equal(draft.inverter_make, 'Growatt');
    assert.ok(getChangedFields(draft, stored).has('inverter_make'));
});

test('draftAfterSave does not mistake a colleague\'s change that arrived during the save for typing', () => {
    const sent = { ...LOADED, phone_number: '9800000002' };
    // The realtime copy moved both the draft and the baseline of inverter_make.
    const latestBaseline = { ...LOADED, inverter_make: 'Solis' };
    const current = { ...sent, inverter_make: 'Solis' };
    const stored = { ...sent, inverter_make: 'Sungrow', updated_at: SAVED_AT };
    const draft = draftAfterSave({ current, sent, sentBaseline: LOADED, latestBaseline, stored });
    assert.equal(draft.inverter_make, 'Sungrow');
    assert.equal(getChangedFields(draft, stored).size, 0);
});

test('draftAfterSave compares extra fields one by one and drops one emptied during the save', () => {
    const sent = { ...LOADED, custom_fields: { survey_date: '2026-10-05', roof: 'RCC' } };
    const current = { ...LOADED, custom_fields: { survey_date: '2026-10-05' } };
    const stored = { ...LOADED, updated_at: SAVED_AT, custom_fields: { survey_date: '2026-10-05', roof: 'RCC', meter: 'Yes' } };
    const draft = draftAfterSave({ current, sent, sentBaseline: LOADED, latestBaseline: LOADED, stored });
    assert.deepEqual(draft.custom_fields, { survey_date: '2026-10-05', meter: 'Yes' });
});

test('draftAfterSave after a stage move takes the stored stage and remarks', () => {
    const sent = { ...LOADED, stages_remarks: { LEADS: 'call back' } };
    const stored = { ...LOADED, stage: 'REGISTRATION', stages_remarks: { LEADS: '' }, updated_at: SAVED_AT };
    const draft = draftAfterSave({ current: sent, sent, sentBaseline: LOADED, latestBaseline: LOADED, stored });
    assert.equal(draft.stage, 'REGISTRATION');
    assert.deepEqual(draft.stages_remarks, { LEADS: '' });
});
