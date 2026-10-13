import test from 'node:test';
import assert from 'node:assert/strict';
import { exactLike, monthFilterValue, scopeCustomers, stageDateFilters } from '../../template/src/dashboard/filters.js';
import { argsOf, callsOf, fakeClient, importTemplate, useFakeSupabase } from './fixtures/templateModules.mjs';

// Fixed instants, read in Asia/Kolkata (UTC+5:30).
const OCT_13_NOON_IST = new Date('2026-10-13T06:30:00Z');
const JAN_1_EARLY_IST = new Date('2025-12-31T19:00:00Z');   // 1 Jan 2026, 00:30 IST; still 31 Dec in UTC
const APR_1_EARLY_IST = new Date('2026-03-31T18:45:00Z');   // 1 Apr 2026, 00:15 IST; still 31 Mar in UTC

const builder = (table = 'admin') => fakeClient().from(table);

test('exactLike trims and escapes the ilike wildcards so a name only matches itself', () => {
    assert.equal(exactLike('  Sun Power  '), 'Sun Power');
    assert.equal(exactLike('100%_Solar'), '100\\%\\_Solar');
    assert.equal(exactLike('A\\B'), 'A\\\\B');
    assert.equal(exactLike("Shree Ganesh & Sons (Pune)"), "Shree Ganesh & Sons (Pune)");
    assert.equal(exactLike(42), '42');
});

test('scopeCustomers adds the header channel partner and dealer filters', () => {
    const scoped = scopeCustomers(builder(), { channelPartner: ' Sun_Power ', dealer: 'Ravi 50%' });
    assert.deepEqual(callsOf(scoped), [
        ['from', 'admin'],
        ['ilike', 'channel_partner', 'Sun\\_Power'],
        ['ilike', 'sub_channel_partner', 'Ravi 50\\%'],
    ]);

    assert.deepEqual(callsOf(scopeCustomers(builder(), { channelPartner: 'Sun Power' })), [
        ['from', 'admin'], ['ilike', 'channel_partner', 'Sun Power'],
    ]);
    assert.deepEqual(callsOf(scopeCustomers(builder('cpo_leads'), { dealer: 'Ravi' })), [
        ['from', 'cpo_leads'], ['ilike', 'sub_channel_partner', 'Ravi'],
    ]);
});

test('scopeCustomers leaves the query alone when no partner or dealer is chosen', () => {
    for (const scope of [undefined, {}, { channelPartner: '', dealer: '' }, { channelPartner: '   ', dealer: '\t' }, { channelPartner: null, dealer: undefined }]) {
        const query = builder();
        assert.equal(scopeCustomers(query, scope), query);
        assert.deepEqual(callsOf(query), [['from', 'admin']]);
    }
});

test('monthFilterValue reads this month and last month in IST', () => {
    assert.equal(monthFilterValue('this-month', '', OCT_13_NOON_IST), '2026-10');
    assert.equal(monthFilterValue('last-month', '', OCT_13_NOON_IST), '2026-09');

    // Just after midnight IST the UTC date is still the previous month.
    assert.equal(monthFilterValue('this-month', '', APR_1_EARLY_IST), '2026-04');
    assert.equal(monthFilterValue('last-month', '', APR_1_EARLY_IST), '2026-03');

    // January rolls back to December of the year before.
    assert.equal(monthFilterValue('this-month', '', JAN_1_EARLY_IST), '2026-01');
    assert.equal(monthFilterValue('last-month', '', JAN_1_EARLY_IST), '2025-12');
});

test('monthFilterValue puts a numbered month in the chosen year, else this IST year', () => {
    assert.equal(monthFilterValue('03', '2025', OCT_13_NOON_IST), '2025-03');
    assert.equal(monthFilterValue('12', '2024', OCT_13_NOON_IST), '2024-12');
    assert.equal(monthFilterValue('03', '', OCT_13_NOON_IST), '2026-03');
    assert.equal(monthFilterValue('03', undefined, JAN_1_EARLY_IST), '2026-03');
    // The shortcuts always mean the current month, whatever year is picked.
    assert.equal(monthFilterValue('this-month', '2024', OCT_13_NOON_IST), '2026-10');
});

test('monthFilterValue is empty for no month or a value it does not know', () => {
    for (const month of ['', undefined, null, 'all', 'March', '3', '003', 'next-month']) {
        assert.equal(monthFilterValue(month, '2026', OCT_13_NOON_IST), '', `month ${JSON.stringify(month)}`);
    }
});

test('monthFilterValue defaults to the current time', t => {
    t.mock.timers.enable({ apis: ['Date'], now: JAN_1_EARLY_IST });
    assert.equal(monthFilterValue('this-month'), '2026-01');
    assert.equal(monthFilterValue('last-month'), '2025-12');
    assert.equal(monthFilterValue('07'), '2026-07');
});

test('stageDateFilters dates Leads by when they were added, as IST timestamps', () => {
    assert.deepEqual(stageDateFilters('LEADS', { year: '2025' }, OCT_13_NOON_IST), [
        { field: 'created_at', start: '2025-01-01T00:00:00+05:30', end: '2026-01-01T00:00:00+05:30' },
    ]);
    assert.deepEqual(stageDateFilters('LEADS', { month: 'this-month' }, OCT_13_NOON_IST), [
        { field: 'created_at', start: '2026-10-01T00:00:00+05:30', end: '2026-11-01T00:00:00+05:30' },
    ]);
    assert.deepEqual(stageDateFilters('LEADS', { year: '2025', month: '12' }, OCT_13_NOON_IST), [
        { field: 'created_at', start: '2025-01-01T00:00:00+05:30', end: '2026-01-01T00:00:00+05:30' },
        { field: 'created_at', start: '2025-12-01T00:00:00+05:30', end: '2026-01-01T00:00:00+05:30' },
    ]);
    assert.deepEqual(stageDateFilters('LEADS', { month: 'last-month' }, JAN_1_EARLY_IST), [
        { field: 'created_at', start: '2025-12-01T00:00:00+05:30', end: '2026-01-01T00:00:00+05:30' },
    ]);
});

test('stageDateFilters dates Registration by its registration date', () => {
    assert.deepEqual(stageDateFilters('REGISTRATION', { year: '2026' }, OCT_13_NOON_IST), [
        { field: 'registration_date', start: '2026-01-01', end: '2027-01-01' },
    ]);
    assert.deepEqual(stageDateFilters('REGISTRATION', { year: '2028', month: '02' }, OCT_13_NOON_IST), [
        { field: 'registration_date', start: '2028-01-01', end: '2029-01-01' },
        { field: 'registration_date', start: '2028-02-01', end: '2028-03-01' },
    ]);
    assert.deepEqual(stageDateFilters('REGISTRATION', { month: 'this-month' }, APR_1_EARLY_IST), [
        { field: 'registration_date', start: '2026-04-01', end: '2026-05-01' },
    ]);
    assert.deepEqual(stageDateFilters('REGISTRATION', { month: '12' }, OCT_13_NOON_IST), [
        { field: 'registration_date', start: '2026-12-01', end: '2027-01-01' },
    ]);
});

test('stageDateFilters offers the month filter on Leads and Registration only', () => {
    for (const stage of ['LOAN', 'MATERIAL ORDER', 'COMPLETED', 'LOST PROJECT', 'SITE SURVEY']) {
        assert.deepEqual(stageDateFilters(stage, { month: '03' }, OCT_13_NOON_IST), [], stage);
        assert.deepEqual(stageDateFilters(stage, { year: '2025', month: 'this-month' }, OCT_13_NOON_IST), [
            { field: 'registration_date', start: '2025-01-01', end: '2026-01-01' },
        ], stage);
    }
});

test('stageDateFilters ignores empty or malformed filters', () => {
    assert.deepEqual(stageDateFilters('LEADS'), []);
    assert.deepEqual(stageDateFilters('REGISTRATION', {}, OCT_13_NOON_IST), []);
    for (const year of ['', 'all', '26', '20266', ' 2026']) {
        assert.deepEqual(stageDateFilters('REGISTRATION', { year }, OCT_13_NOON_IST), [], `year ${JSON.stringify(year)}`);
    }
    assert.deepEqual(stageDateFilters('LEADS', { month: 'March' }, OCT_13_NOON_IST), []);
});

// queries.js runs every Dashboard customer read through the same scope.

const queries = await importTemplate('dashboard/queries.js');
const SCOPE = { channelPartner: 'Sun_Power', dealer: 'Ravi' };
const SCOPED = [['ilike', 'channel_partner', 'Sun\\_Power'], ['ilike', 'sub_channel_partner', 'Ravi']];
const hasCall = (calls, call) => calls.some(made => JSON.stringify(made) === JSON.stringify(call));

test('queries.js re-exports the shared filters', () => {
    assert.deepEqual(callsOf(queries.scopeCustomers(builder(), SCOPE)), [['from', 'admin'], ...SCOPED]);
    assert.deepEqual(queries.stageDateFilters('REGISTRATION', { year: '2026' }, OCT_13_NOON_IST), stageDateFilters('REGISTRATION', { year: '2026' }, OCT_13_NOON_IST));
});

test('fetchDealerNames lists the active dealers under the chosen channel partner', async () => {
    const client = fakeClient(() => ({ data: [{ name: ' Ravi ' }, { name: 'Ravi' }, { name: '' }, { name: null }, { name: 'Meena' }], error: null }));
    useFakeSupabase(client);
    assert.deepEqual(await queries.fetchDealerNames({ user: { userType: 'admin' }, isCpo: false, channelPartner: ' Sun_Power ' }), ['Ravi', 'Meena']);
    assert.deepEqual(client.reads, [[
        ['from', 'profiles'], ['select', 'name'], ['eq', 'user_type', 'agent2'], ['eq', 'status', 'active'], ['order', 'name'],
        ['ilike', 'channel_partner', 'Sun\\_Power'],
    ]]);
});

test('fetchDealerNames reads nothing until a channel partner is chosen', async () => {
    const client = fakeClient();
    useFakeSupabase(client);
    assert.deepEqual(await queries.fetchDealerNames({ user: { userType: 'admin' }, isCpo: false, channelPartner: '  ' }), []);
    assert.deepEqual(await queries.fetchDealerNames({ user: { userType: 'sales' }, isCpo: false }), []);
    assert.deepEqual(client.reads, []);
});

test('fetchDealerNames scopes partner office logins to their own office', async () => {
    const client = fakeClient(() => ({ data: [{ name: 'Ravi' }], error: null }));
    useFakeSupabase(client);
    await queries.fetchDealerNames({ user: { id: 'office-1', userType: 'channel_partner_office' }, isCpo: true, channelPartner: 'ignored' });
    await queries.fetchDealerNames({ user: { id: 'manager-1', userType: 'office2', cpo_profile_id: 'office-2', parent_profile_id: 'office-3' }, isCpo: true });
    await queries.fetchDealerNames({ user: { id: 'manager-2', userType: 'office2', parent_profile_id: 'office-3' }, isCpo: true });
    assert.deepEqual(client.reads.map(calls => calls.at(-1)), [
        ['eq', 'cpo_profile_id', 'office-1'], ['eq', 'cpo_profile_id', 'office-2'], ['eq', 'cpo_profile_id', 'office-3'],
    ]);
    assert.ok(client.reads.every(calls => !hasCall(calls, ['ilike', 'channel_partner', 'ignored'])));

    const none = fakeClient();
    useFakeSupabase(none);
    assert.deepEqual(await queries.fetchDealerNames({ user: { id: 'manager-3', userType: 'office2' }, isCpo: true }), []);
    assert.deepEqual(none.reads, []);
});

test('fetchDealerNames passes a failed read on to the caller', async () => {
    const failure = { message: 'permission denied' };
    useFakeSupabase(fakeClient(() => ({ data: null, error: failure })));
    await assert.rejects(queries.fetchDealerNames({ user: {}, isCpo: false, channelPartner: 'Sun Power' }), error => error === failure);
});

const BATCHES = [
    { id: 'b1', project_ids: ['p1', 'p2'] },
    { id: 'b2', project_ids: ['p2', 'p3'] },
    { id: 'b3', project_ids: null },
];

function summaryClient({ visible = [] } = {}) {
    return fakeClient(calls => {
        if (argsOf(calls, 'from')[0] === 'delivery_batches') return { data: BATCHES, error: null };
        if (argsOf(calls, 'select')[1]?.head) {
            const eq = argsOf(calls, 'eq')?.[0];
            return { count: eq === 'registration_date' ? 4 : eq === 'installation_date' ? 2 : 7, error: null };
        }
        return { data: visible.map(id => ({ id })), error: null };
    });
}

test("fetchTodaySummary counts today's work in IST, scoped like the stage lists", async t => {
    // 01:30 IST on 13 Oct; the UTC date is still the 12th.
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T20:00:00Z') });
    const client = summaryClient({ visible: ['p1'] });
    useFakeSupabase(client);

    assert.deepEqual(await queries.fetchTodaySummary(false, SCOPE, true), {
        date: '2026-10-13', registeredToday: 4, installedToday: 2, installedLive: 7,
        deliveriesDueToday: 1, deliveryProjectsToday: 1, canViewDeliveries: true,
    });

    const customerReads = client.reads.filter(calls => argsOf(calls, 'from')[0] !== 'delivery_batches');
    assert.equal(customerReads.length, 4);
    for (const calls of customerReads) {
        assert.equal(argsOf(calls, 'from')[0], 'admin');
        assert.ok(hasCall(calls, ['is', 'deleted_at', null]));
        assert.ok(SCOPED.every(call => hasCall(calls, call)), JSON.stringify(calls));
    }
    assert.ok(customerReads.some(calls => hasCall(calls, ['eq', 'registration_date', '2026-10-13'])));
    assert.ok(customerReads.some(calls => hasCall(calls, ['eq', 'installation_date', '2026-10-13'])));
    assert.ok(customerReads.some(calls => hasCall(calls, ['not', 'stage', 'in', '("COMPLETED","LOST PROJECT")'])));
    assert.ok(customerReads.some(calls => hasCall(calls, ['in', 'id', ['p1', 'p2', 'p3']])));

    const [batchRead] = client.reads.filter(calls => argsOf(calls, 'from')[0] === 'delivery_batches');
    assert.ok(hasCall(batchRead, ['eq', 'dispatch_date', '2026-10-13']));
    assert.ok(hasCall(batchRead, ['neq', 'status', 'DELIVERED']));
});

test('fetchTodaySummary counts every batch due today when nothing is filtered', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: OCT_13_NOON_IST });
    const client = summaryClient();
    useFakeSupabase(client);

    const summary = await queries.fetchTodaySummary(false, { channelPartner: '', dealer: '' }, true);
    assert.equal(summary.deliveriesDueToday, 3);
    assert.equal(summary.deliveryProjectsToday, 3);
    assert.ok(client.reads.every(calls => !calls.some(([name]) => name === 'ilike')));
    assert.ok(!client.reads.some(calls => hasCall(calls, ['select', 'id'])), 'no visibility check without a filter');
});

test('fetchTodaySummary skips deliveries for logins that cannot see them, and reads partner offices from cpo_leads', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: OCT_13_NOON_IST });
    const client = summaryClient();
    useFakeSupabase(client);

    const summary = await queries.fetchTodaySummary(true, { channelPartner: '', dealer: 'Ravi' }, false);
    assert.equal(summary.date, '2026-10-13');
    assert.equal(summary.deliveriesDueToday, 0);
    assert.equal(summary.deliveryProjectsToday, 0);
    assert.equal(summary.canViewDeliveries, false);
    assert.equal(client.reads.length, 3);
    assert.ok(client.reads.every(calls => argsOf(calls, 'from')[0] === 'cpo_leads'));
    assert.ok(client.reads.every(calls => hasCall(calls, ['ilike', 'sub_channel_partner', 'Ravi'])));
});

test('fetchTodaySummary passes a failed count on to the caller', async () => {
    const failure = { message: 'timeout' };
    useFakeSupabase(fakeClient(() => ({ count: null, error: failure })));
    await assert.rejects(queries.fetchTodaySummary(false, {}, false), error => error === failure);
});

test('fetchSolarEquipmentStats reads every scoped page before summarising', async () => {
    const client = fakeClient(() => ({
        data: [
            { stage: 'COMPLETED', module_brand: 'BrightPanel', no_of_modules: '8', inverter_make: 'SunVolt', system_capacity_kwp: '4.64' },
            { stage: 'LOST PROJECT', module_brand: 'Ignored', no_of_modules: 100, inverter_make: 'Ignored', system_capacity_kwp: 50 },
        ],
        error: null,
    }));
    useFakeSupabase(client);

    const stats = await queries.fetchSolarEquipmentStats(true, SCOPE);
    assert.equal(stats.panelsAcrossProjects, 8);
    assert.equal(stats.installedCapacityKwp, 4.64);
    assert.equal(client.reads.length, 1);
    const [calls] = client.reads;
    assert.equal(argsOf(calls, 'from')[0], 'cpo_leads');
    assert.ok(hasCall(calls, ['is', 'deleted_at', null]));
    assert.ok(hasCall(calls, ['range', 0, 999]));
    assert.ok(SCOPED.every(call => hasCall(calls, call)));
});

test('fetchMetadataLists groups the active dropdown rows by category, in sort order', async () => {
    const client = fakeClient(() => ({
        data: [
            { category: 'module_brand', label: 'BrightPanel' },
            { category: 'inverter_make', label: 'SunVolt' },
            { category: 'module_brand', label: 'EcoRay' },
        ],
        error: null,
    }));
    useFakeSupabase(client);

    assert.deepEqual(await queries.fetchMetadataLists(), { module_brand: ['BrightPanel', 'EcoRay'], inverter_make: ['SunVolt'] });
    assert.deepEqual(client.reads, [[['from', 'metadata'], ['select', 'category, label'], ['eq', 'is_active', true], ['order', 'sort_order']]]);

    const failure = { message: 'offline' };
    useFakeSupabase(fakeClient(() => ({ data: null, error: failure })));
    await assert.rejects(queries.fetchMetadataLists(), error => error === failure);
});

test('only real months are accepted, and the month shortcuts ignore the year filter', () => {
    assert.equal(monthFilterValue('13', '2026'), '');
    assert.equal(monthFilterValue('00', '2026'), '');
    assert.equal(monthFilterValue('12', '2026'), '2026-12');
    const ranges = stageDateFilters('REGISTRATION', { year: '2025', month: 'this-month' }, OCT_13_NOON_IST);
    assert.deepEqual(ranges, [{ field: 'registration_date', start: '2026-10-01', end: '2026-11-01' }]);
    assert.equal(stageDateFilters('REGISTRATION', { year: '2025', month: '03' }, OCT_13_NOON_IST).length, 2);
});
