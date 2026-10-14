// Tag tracking lists, dropdown upkeep and permanent deletion.

import test from 'node:test';
import assert from 'node:assert/strict';
import { argsOf, callsOf, fakeClient, importTemplate, useFakeSupabase } from './fixtures/templateModules.mjs';

const queries = await importTemplate('dashboard/queries.js');
const files = await importTemplate('dashboard/customerFiles.js');

test('tracking lists match the partner and dealer on the whole name, as the sidebar counts do', () => {
    useFakeSupabase(fakeClient());
    const query = queries.liveCustomers(false, { channelPartner: ' SUN ', dealer: 'A_B' }, 'id', { count: 'exact', head: true });
    assert.deepEqual(callsOf(query), [
        ['from', 'admin'], ['select', 'id', { count: 'exact', head: true }], ['is', 'deleted_at', null],
        ['ilike', 'channel_partner', 'SUN'], ['ilike', 'sub_channel_partner', 'A\\_B'],
    ]);
    assert.deepEqual(callsOf(queries.liveCustomers(true, { channelPartner: '', dealer: '' }, '*')), [
        ['from', 'cpo_leads'], ['select', '*', undefined], ['is', 'deleted_at', null],
    ]);
});

test('only head office adds new names to the dropdown lists', async () => {
    for (const userType of ['channel_partner_office', 'office2', 'agent', 'agent2', 'vendor', undefined]) {
        const client = fakeClient();
        useFakeSupabase(client);
        assert.equal(await queries.addNewListLabels({ channel_partner: 'New Partner', module_brand: 'XYZ' }, userType), false);
        assert.deepEqual(client.reads, [], String(userType));
    }

    const client = fakeClient(calls => (argsOf(calls, 'insert')
        ? { data: null, error: null }
        : { data: argsOf(calls, 'eq')[1] === 'channel_partner' ? [{ label: ' new partner ' }] : [], error: null }));
    useFakeSupabase(client);
    assert.equal(await queries.addNewListLabels({ channel_partner: 'New Partner', module_brand: 'XYZ' }, 'sales'), true);
    const inserts = client.reads.map(calls => argsOf(calls, 'insert')).filter(Boolean);
    assert.deepEqual(inserts, [[{ category: 'module_brand', label: 'XYZ' }]]);
});

function storageClient({ pages, listError = null, refuse = [] }) {
    const calls = { list: [], remove: [] };
    let page = 0;
    return {
        calls,
        storage: {
            from: bucket => ({
                list: async (folder, options) => {
                    calls.list.push([bucket, folder, options]);
                    if (listError) return { data: null, error: listError };
                    return { data: pages[page++] || [], error: null };
                },
                remove: async paths => {
                    calls.remove.push([bucket, paths]);
                    return { data: paths.filter(path => !refuse.includes(path)).map(name => ({ name })), error: null };
                },
            }),
        },
    };
}

test("permanent delete removes every file in the customer's folder", async () => {
    const big = Array.from({ length: 1000 }, (_, i) => ({ id: `f${i}`, name: `${i}.jpg` }));
    const client = storageClient({ pages: [big, [{ id: 'x', name: 'last.pdf' }, { id: null, name: 'folder' }]], refuse: ['c1/7.jpg'] });
    useFakeSupabase(client);

    assert.deepEqual(await files.removeCustomerFiles('c1'), { removed: 1000, failed: 1 });
    assert.deepEqual(client.calls.list, [
        ['customer-documents', 'c1', { limit: 1000, offset: 0 }],
        ['customer-documents', 'c1', { limit: 1000, offset: 1000 }],
    ]);
    const removed = client.calls.remove.flatMap(([bucket, paths]) => { assert.equal(bucket, 'customer-documents'); return paths; });
    assert.equal(removed.length, 1001);
    assert.ok(removed.every(path => path.startsWith('c1/')));
    assert.ok(removed.includes('c1/last.pdf') && !removed.includes('c1/folder'));
    assert.ok(client.calls.remove.every(([, paths]) => paths.length <= 100));
});

test('permanent delete reports files it could not reach', async () => {
    useFakeSupabase(storageClient({ pages: [], listError: { message: 'Bucket not found' } }));
    assert.deepEqual(await files.removeCustomerFiles('c2'), { removed: 0, failed: -1 });

    const empty = storageClient({ pages: [[]] });
    useFakeSupabase(empty);
    assert.deepEqual(await files.removeCustomerFiles('c3'), { removed: 0, failed: 0 });
    assert.deepEqual(empty.calls.remove, []);
});
