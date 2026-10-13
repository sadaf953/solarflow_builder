import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAllPages, customerSource } from '../../template/src/lib/db.js';

// Minimal stand-in for a Supabase query: records the ranges it was asked for.
function fakeTable(total, { failAt } = {}) {
    const calls = [];
    const buildQuery = () => ({
        range(from, to) {
            calls.push([from, to]);
            if (failAt !== undefined && from >= failAt) return Promise.resolve({ data: null, error: { message: 'boom' } });
            const data = Array.from({ length: Math.max(0, Math.min(to, total - 1) - from + 1) }, (_, i) => ({ id: from + i }));
            return Promise.resolve({ data, error: null });
        },
    });
    return { buildQuery, calls };
}

test('fetchAllPages reads every page and stops on a short page', async () => {
    const { buildQuery, calls } = fakeTable(2500);
    const rows = await fetchAllPages(buildQuery);
    assert.equal(rows.length, 2500);
    assert.equal(rows.at(-1).id, 2499);
    assert.deepEqual(calls, [[0, 999], [1000, 1999], [2000, 2999]]);
});

test('fetchAllPages asks once more after an exactly full last page', async () => {
    const { buildQuery, calls } = fakeTable(4, {});
    const rows = await fetchAllPages(buildQuery, { pageSize: 2 });
    assert.equal(rows.length, 4);
    assert.deepEqual(calls, [[0, 1], [2, 3], [4, 5]]);
});

test('fetchAllPages handles an empty table and a null data page', async () => {
    assert.deepEqual(await fetchAllPages(fakeTable(0).buildQuery), []);
    const rows = await fetchAllPages(() => ({ range: async () => ({ data: null, error: null }) }));
    assert.deepEqual(rows, []);
});

test('fetchAllPages throws by default and returns partial rows when asked', async () => {
    await assert.rejects(fetchAllPages(fakeTable(10, { failAt: 4 }).buildQuery, { pageSize: 2 }), { message: 'boom' });
    const originalError = console.error;
    console.error = () => {};
    try {
        const rows = await fetchAllPages(fakeTable(10, { failAt: 4 }).buildQuery, { pageSize: 2, onError: 'partial' });
        assert.deepEqual(rows.map(row => row.id), [0, 1, 2, 3]);
    } finally {
        console.error = originalError;
    }
});

test('customerSource picks the CPO view for CPO logins', () => {
    assert.equal(customerSource(true), 'cpo_leads');
    assert.equal(customerSource(false), 'admin');
    assert.equal(customerSource(undefined), 'admin');
});
