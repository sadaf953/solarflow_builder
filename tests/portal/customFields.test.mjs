// Partner, dealer and installer portals: extra fields and the shared calendar.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { configWith, importTemplate, useFakeSupabase } from '../dashboard/fixtures/templateModules.mjs';

const config = configWith({
    customFields: [
        { key: 'meter_number', label: 'Meter number', type: 'text', stage: 'METER INSTALLATION', required: true },
        { key: 'earthing_done', label: 'Earthing done', type: 'yesno', stage: 'INSTALLATION STATUS', required: true },
        { key: 'meter_photo', label: 'Meter photo', type: 'file', stage: 'METER INSTALLATION' },
        { key: 'seal_count', label: 'Seal count', type: 'number', stage: 'METER INSTALLATION' },
    ],
});
const portal = await importTemplate('components/portal/customFields.js', { config });
const runtime = await importTemplate('config/index.js', { config });

test('portal users get inputs for the extra fields of their stage, except files', () => {
    assert.deepEqual(portal.portalCustomFields('METER INSTALLATION').map(field => field.key), ['meter_number', 'seal_count']);
    assert.deepEqual(portal.portalCustomFields('INSTALLATION STATUS').map(field => field.key), ['earthing_done']);
    assert.deepEqual(portal.portalCustomFields('LEADS'), []);
});

test("a required extra field filled in the portal clears the stage's requirement", () => {
    const record = { stage: 'METER INSTALLATION', custom_fields: { other: 'kept' } };
    assert.ok(runtime.missingStageRequirements('METER INSTALLATION', record).includes('Meter number'));

    const changes = portal.customFieldChanges('METER INSTALLATION', { other: 'kept', meter_number: 'MH-123' }, record.custom_fields);
    assert.deepEqual(changes, { meter_number: 'MH-123' });
    const merged = portal.withCustomFieldChanges(record.custom_fields, changes);
    assert.deepEqual(merged, { other: 'kept', meter_number: 'MH-123' });
    assert.ok(!runtime.missingStageRequirements('METER INSTALLATION', { ...record, custom_fields: merged }).includes('Meter number'));
});

test('only changed values of the stage are sent, and an emptied value is removed', () => {
    const saved = { meter_number: 'MH-1', seal_count: 2, earthing_done: 'Yes' };
    assert.deepEqual(portal.customFieldChanges('METER INSTALLATION', { ...saved }, saved), {});
    assert.deepEqual(portal.customFieldChanges('METER INSTALLATION', { meter_number: '', seal_count: 3, earthing_done: 'No' }, saved),
        { meter_number: null, seal_count: 3 });
    assert.deepEqual(portal.customFieldChanges('METER INSTALLATION', { meter_number: null }, {}), {});
    assert.deepEqual(portal.withCustomFieldChanges(saved, { meter_number: null }), { seal_count: 2, earthing_done: 'Yes' });
    assert.deepEqual(portal.withCustomFieldChanges(null, { seal_count: 1 }), { seal_count: 1 });
    assert.deepEqual(portal.customFieldChangeLines('METER INSTALLATION', { seal_count: 3 }, saved), ['Seal count: 2 → 3']);
});

test('extra fields are saved through merge_custom_fields', async () => {
    const calls = [];
    useFakeSupabase({ rpc: async (name, args) => { calls.push([name, args]); return { data: { meter_number: 'MH-9' }, error: null }; } });
    assert.deepEqual(await portal.saveCustomFieldChanges('c1', { meter_number: 'MH-9' }), { meter_number: 'MH-9' });
    assert.deepEqual(calls, [['merge_custom_fields', { p_customer_id: 'c1', p_values: { meter_number: 'MH-9' } }]]);

    const failure = { message: 'Record unavailable; refresh first' };
    useFakeSupabase({ rpc: async () => ({ data: null, error: failure }) });
    await assert.rejects(portal.saveCustomFieldChanges('c1', { meter_number: 'x' }), error => error === failure);
});

test('the portals offer the shared calendar only when the client has it', async () => {
    const on = await importTemplate('components/portal/calendar.js', { config: configWith({ features: { calendar: true } }) });
    const off = await importTemplate('components/portal/calendar.js', { config: configWith({ features: { calendar: false } }) });
    assert.ok(on.PortalCalendar);
    assert.equal(off.PortalCalendar, null);

    // Partner/dealer and installer portals both use it.
    for (const file of ['AgentPortal.jsx', 'VendorPortal.jsx']) {
        const source = readFileSync(new URL(`../../template/src/components/${file}`, import.meta.url), 'utf8');
        assert.match(source, /PortalCalendar/, file);
        assert.match(source, /currentUser=\{user\}/, file);
        assert.match(source, /PortalCustomFields/, file);
    }
});
