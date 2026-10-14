import test from 'node:test';
import assert from 'node:assert/strict';
import { listStore } from '../../template/src/components/operationsLists.js';

// A tiny in-memory stand-in for the Supabase client: select / update with
// eq, ilike (no wildcards, as exactLike sends), in, order and range.
function memoryDb(tables, { failUpdate = () => false } = {}) {
    const read = (row, column) => {
        const [col, key] = column.split('->>');
        return key ? row[col]?.[key] : row[col];
    };
    const unescape = pattern => pattern.replace(/\\(.)/g, '$1');
    return {
        from(table) {
            const filters = [];
            let op = 'select';
            let values = null;
            let head = false;
            let range = null;
            const query = {
                select(_columns, options = {}) { head = Boolean(options.head); return query; },
                update(next) { op = 'update'; values = next; return query; },
                eq(column, value) { filters.push(row => read(row, column) === value); return query; },
                ilike(column, pattern) {
                    filters.push(row => String(read(row, column) ?? '').toLowerCase() === unescape(pattern).toLowerCase());
                    return query;
                },
                in(column, list) { filters.push(row => list.includes(read(row, column))); return query; },
                order() { return query; },
                range(from, to) { range = [from, to]; return query; },
                then(resolve, reject) {
                    const run = () => {
                        let hits = tables[table].filter(row => filters.every(match => match(row)));
                        if (op === 'update') {
                            if (failUpdate(table, values)) return { data: null, error: new Error(`${table} refused`) };
                            hits.forEach(row => Object.assign(row, structuredClone(values)));
                        }
                        if (range) hits = hits.slice(range[0], range[1] + 1);
                        return { data: head ? null : structuredClone(hits), count: hits.length, error: null };
                    };
                    return Promise.resolve().then(run).then(resolve, reject);
                },
            };
            return query;
        },
    };
}

const write = async (query) => {
    const { data, error } = await query;
    if (error) return { ok: false, rows: [], error };
    return data?.length ? { ok: true, rows: data, error: null } : { ok: false, rows: [], error: new Error('nothing saved') };
};

const PARTNERS = { id: 'channel_partner', renames: [['admin', 'channel_partner'], ['profiles', 'channel_partner']] };
const SUBMITTED = { id: 'registration_by', renames: [['admin', 'registration_by']], jsonRenames: [['admin', 'discom_submission', 'submitted_by']] };

const seed = () => ({
    admin: [
        { id: 1, channel_partner: 'SUNRISE SOLAR', registration_by: 'Asha', discom_submission: { submitted_by: 'asha', date: 'x' } },
        { id: 2, channel_partner: 'Sunrise Solar', registration_by: 'ASHA', discom_submission: null },
        { id: 3, channel_partner: 'sunrise solar ', registration_by: 'Ravi', discom_submission: { submitted_by: 'Ravi' } },
        { id: 4, channel_partner: 'SUNRISE SOLAR PUNE', registration_by: null, discom_submission: null },
    ],
    profiles: [
        { id: 'a1', channel_partner: 'Sunrise Solar' },
        { id: 'a2', channel_partner: 'OTHER' },
    ],
});

test('usage counts a label in any case, but only the whole name', async () => {
    const store = listStore(memoryDb(seed()), write);
    assert.equal(await store.countRows('admin', 'channel_partner', 'SUNRISE SOLAR'), 2);
    assert.equal(await store.usageOf(PARTNERS, 'sunrise solar'), 3);
    assert.equal(await store.usageOf(SUBMITTED, 'Asha'), 3);
    assert.equal(await store.usageOf(PARTNERS, 'SUNRISE'), 0);
});

test('a rename reaches records and logins stored in another case', async () => {
    const tables = seed();
    await listStore(memoryDb(tables), write).renameEverywhere(PARTNERS, 'SUNRISE SOLAR', 'SUNRISE ENERGY');
    assert.deepEqual(tables.admin.map(r => r.channel_partner), ['SUNRISE ENERGY', 'SUNRISE ENERGY', 'sunrise solar ', 'SUNRISE SOLAR PUNE']);
    assert.deepEqual(tables.profiles.map(r => r.channel_partner), ['SUNRISE ENERGY', 'OTHER']);

    const json = seed();
    await listStore(memoryDb(json), write).renameEverywhere(SUBMITTED, 'Asha', 'Asha K');
    assert.deepEqual(json.admin.map(r => r.registration_by), ['Asha K', 'Asha K', 'Ravi', null]);
    assert.deepEqual(json.admin[0].discom_submission, { submitted_by: 'Asha K', date: 'x' });
});

test('a failed rename puts every record back in its own case', async () => {
    const tables = seed();
    const db = memoryDb(tables, { failUpdate: table => table === 'profiles' });
    await assert.rejects(listStore(db, write).renameEverywhere(PARTNERS, 'SUNRISE SOLAR', 'SUNRISE ENERGY'), error => {
        assert.deepEqual(error.stuck, []);
        return true;
    });
    assert.deepEqual(tables, seed());
});
