import test from 'node:test';
import assert from 'node:assert/strict';
import { toCsv } from '../../template/src/lib/download.js';

const columns = [
    { key: 'name', label: 'Name' },
    { key: 'amount', label: 'Amount (₹)' },
    { key: 'tags', label: 'Tags' },
    { key: 'city', label: 'City', get: row => row.address?.city },
];

test('toCsv starts with a BOM, quotes every cell and uses CRLF', () => {
    const csv = toCsv([{ name: 'Ravi', amount: 1500, tags: ['a', 'b'], address: { city: 'Pune' } }], columns);
    assert.ok(csv.startsWith('﻿'));
    const lines = csv.slice(1).split('\r\n');
    assert.deepEqual(lines, [
        '"Name","Amount (₹)","Tags","City"',
        '"Ravi","1500","[""a"",""b""]","Pune"',
    ]);
});

test('toCsv escapes quotes, keeps commas and newlines inside one cell', () => {
    const csv = toCsv([{ name: 'Shah, "Solar"\nPvt Ltd', amount: null, tags: { a: 1 } }], columns);
    const body = csv.slice(1).split('\r\n').slice(1).join('\r\n');
    assert.equal(body, '"Shah, ""Solar""\nPvt Ltd","","{""a"":1}",""');
});

test('toCsv defuses spreadsheet formulas in text but not numbers', () => {
    const csv = toCsv([{ name: '=HYPERLINK("x")', amount: -500, tags: '+91 98765 43210' }], columns.slice(0, 3));
    assert.equal(csv.slice(1).split('\r\n')[1], `"'=HYPERLINK(""x"")","-500","'+91 98765 43210"`);
});

test('toCsv with no rows is just the header', () => {
    assert.equal(toCsv([], [{ key: 'a' }]), '﻿"a"');
    assert.equal(toCsv(null, [{ key: 'a', label: 'A' }]), '﻿"A"');
});
