import test from 'node:test';
import assert from 'node:assert/strict';
import { insertInBatches } from '../../template/src/lib/import/save.js';

// A fake table: `insert` saves rows, then may lose the reply or refuse.
function fakeTable({ loseReplyOn = -1, refuseOn = -1, checkFails = false } = {}) {
    const saved = new Map();
    let call = 0;
    return {
        saved,
        insert: async batch => {
            const n = call++;
            if (n === refuseOn) return { error: { message: 'duplicate key value' } };
            for (const row of batch) saved.set(row.id, row);
            if (n === loseReplyOn) throw new TypeError('Failed to fetch');
            return { data: batch.map(row => ({ id: row.id })) };
        },
        findSaved: async ids => (checkFails ? { error: { message: 'offline' } } : { data: ids.filter(id => saved.has(id)).map(id => ({ id })) }),
    };
}
const counter = () => { let n = 0; return () => `id-${(n += 1)}`; };
const rows = Array.from({ length: 5 }, (_, i) => ({ name: `Customer ${i + 1}` }));

test('every row gets an id from the browser and is saved', async () => {
    const table = fakeTable();
    const progress = [];
    const result = await insertInBatches({ rows, batchSize: 2, newId: counter(), onProgress: n => progress.push(n), ...table });
    assert.deepEqual(result, { ids: ['id-1', 'id-2', 'id-3', 'id-4', 'id-5'], savedIndexes: [0, 1, 2, 3, 4], failure: null });
    assert.deepEqual(progress, [2, 4, 5]);
    assert.equal(table.saved.get('id-3').name, 'Customer 3');
});

test('a batch saved but with its reply lost is found, counted and kept for Undo', async () => {
    const table = fakeTable({ loseReplyOn: 1 });
    const result = await insertInBatches({ rows, batchSize: 2, newId: counter(), ...table });
    assert.equal(result.failure, null);
    assert.deepEqual(result.ids, ['id-1', 'id-2', 'id-3', 'id-4', 'id-5']);
});

test('a refused batch stops the import at its first row', async () => {
    const table = fakeTable({ refuseOn: 1 });
    const result = await insertInBatches({ rows, batchSize: 2, newId: counter(), ...table });
    assert.deepEqual(result.ids, ['id-1', 'id-2']);
    assert.deepEqual(result.savedIndexes, [0, 1]);
    assert.deepEqual(result.failure, { index: 2, message: 'duplicate key value' });
});

test('when the check fails too, the rows are reported with a warning to look before importing again', async () => {
    const table = fakeTable({ loseReplyOn: 0, checkFails: true });
    const result = await insertInBatches({ rows, batchSize: 2, newId: counter(), ...table });
    assert.deepEqual(result.ids, []);
    assert.equal(result.failure.index, 0);
    assert.match(result.failure.message, /Failed to fetch.*look for them in Customers/);
});
