// A pipeline without the Registration stage: nothing writes registration_date,
// so lists, today's summary and Data Exports date projects by when they were added.

import test from 'node:test';
import assert from 'node:assert/strict';
import { argsOf, configWith, fakeClient, importTemplate, useFakeSupabase } from './fixtures/templateModules.mjs';

const OCT_13_NOON_IST = new Date('2026-10-13T06:30:00Z');
const shipped = configWith();
const noRegistration = configWith({
    pipeline: { ...shipped.pipeline, stages: shipped.pipeline.stages.filter(stage => stage.id !== 'REGISTRATION') },
});
const renamed = configWith({
    pipeline: {
        ...shipped.pipeline,
        stages: shipped.pipeline.stages.map(stage => (stage.id === 'MATERIAL DELIVERY' ? { ...stage, label: 'Dispatch' } : stage.id === 'LEADS' ? { ...stage, label: 'Enquiries' } : stage)),
    },
});

const filtersOff = await importTemplate('dashboard/filters.js', { config: noRegistration });
const queriesOff = await importTemplate('dashboard/queries.js', { config: noRegistration });
const exportsOn = await importTemplate('dashboard/exports.js');
const exportsOff = await importTemplate('dashboard/exports.js', { config: noRegistration });
const exportsRenamed = await importTemplate('dashboard/exports.js', { config: renamed });

test('without Registration, the year filter dates every stage list by when it was added, in IST', () => {
    for (const stage of ['SITE SURVEY', 'MATERIAL ORDER', 'COMPLETED', 'LEADS']) {
        assert.deepEqual(filtersOff.stageDateFilters(stage, { year: '2026' }, OCT_13_NOON_IST), [
            { field: 'created_at', start: '2026-01-01T00:00:00+05:30', end: '2027-01-01T00:00:00+05:30' },
        ], stage);
    }
    // The month filter still belongs to Leads only.
    assert.deepEqual(filtersOff.stageDateFilters('MATERIAL ORDER', { month: '03' }, OCT_13_NOON_IST), []);
    assert.deepEqual(filtersOff.stageDateFilters('LEADS', { month: '03' }, OCT_13_NOON_IST), [
        { field: 'created_at', start: '2026-03-01T00:00:00+05:30', end: '2026-04-01T00:00:00+05:30' },
    ]);
});

test("without Registration, today's summary does not count registrations", async t => {
    t.mock.timers.enable({ apis: ['Date'], now: OCT_13_NOON_IST });
    const client = fakeClient(() => ({ count: 3, error: null }));
    useFakeSupabase(client);
    const summary = await queriesOff.fetchTodaySummary(false, {}, false);
    assert.equal(summary.registeredToday, null);
    assert.equal(summary.installedToday, 3);
    assert.equal(client.reads.length, 2);
    assert.ok(client.reads.every(calls => argsOf(calls, 'eq')?.[0] !== 'registration_date'));
});

test('Data Exports picks projects by registration date while the stage is in the pipeline', () => {
    assert.equal(exportsOn.exportsByRegistration(), true);
    assert.deepEqual(exportsOn.exportDateFilter('2026-02-01', '2026-02-28'), { field: 'registration_date', start: '2026-02-01', end: '2026-03-01' });
    assert.deepEqual(exportsOn.exportDateFilter('2024-12-31', '2024-12-31'), { field: 'registration_date', start: '2024-12-31', end: '2025-01-01' });
});

test('without Registration, Data Exports picks projects by the IST day they were added', () => {
    assert.equal(exportsOff.exportsByRegistration(), false);
    assert.deepEqual(exportsOff.exportDateFilter('2028-02-01', '2028-02-29'), {
        field: 'created_at', start: '2028-02-01T00:00:00+05:30', end: '2028-03-01T00:00:00+05:30',
    });
    assert.deepEqual(exportsOff.exportDateFilter('2026-10-13', '2026-10-13'), {
        field: 'created_at', start: '2026-10-13T00:00:00+05:30', end: '2026-10-14T00:00:00+05:30',
    });
});

test('export periods are whole days and only full, forward ranges are accepted', () => {
    const { exportRange, isValidRange } = exportsOn;
    assert.deepEqual(exportRange('daily', { day: '2026-10-13' }), { start: '2026-10-13', end: '2026-10-13' });
    assert.deepEqual(exportRange('monthly', { month: '2028-02' }), { start: '2028-02-01', end: '2028-02-29' });
    assert.deepEqual(exportRange('yearly', { year: '2025' }), { start: '2025-01-01', end: '2025-12-31' });
    assert.deepEqual(exportRange('custom', { start: '2026-01-01', end: '2026-03-31' }), { start: '2026-01-01', end: '2026-03-31' });
    assert.equal(isValidRange({ start: '2026-01-01', end: '2026-03-31' }), true);
    for (const range of [{ start: '2026-04-01', end: '2026-03-31' }, { start: '', end: '2026-03-31' }, { start: '-01-01', end: '-12-31' }, { start: '20-01-01', end: '20-12-31' }, null]) {
        assert.equal(isValidRange(range), false, JSON.stringify(range));
    }
});

test("exports show the client's stage names, not the stored ids", () => {
    const rows = [{ id: 1, customer_name: 'Asha', stage: 'MATERIAL DELIVERY' }, { id: 2, customer_name: 'Ravi', stage: 'LEADS' }, { id: 3, stage: 'OLD STAGE' }];
    const columns = exportsRenamed.exportColumns(rows);
    const stage = columns.find(column => column.key === 'stage');
    assert.equal(stage.label, 'Stage');
    assert.deepEqual(rows.map(stage.get), ['Dispatch', 'Enquiries', 'Old Stage']);
    assert.equal(columns.find(column => column.key === 'customer_name').get, undefined);
});
