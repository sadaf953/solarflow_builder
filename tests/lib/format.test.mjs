import test from 'node:test';
import assert from 'node:assert/strict';
import {
    toIndianCommas, formatINR, formatCount, formatKwp, formatDate, todayIST, MONTH_NAMES,
    monthKey, getMonthBounds, cleanPhone, formatFieldValue,
} from '../../template/src/lib/format.js';

test('formatINR groups the Indian way and keeps the old empty/zero output', () => {
    assert.equal(formatINR(123456), '₹1,23,456');
    assert.equal(formatINR('12345678'), '₹1,23,45,678');
    assert.equal(formatINR(1234.5), '₹1,234.5');
    assert.equal(formatINR(999), '₹999');
    assert.equal(formatINR('1,20,000'), '₹1,20,000');
    for (const empty of [null, undefined, '', '  ', 'abc', 0]) assert.equal(formatINR(empty), '–');
    assert.equal(formatINR(0, { zero: '₹0' }), '₹0');
    assert.equal(formatINR('0', { zero: '₹0' }), '₹0');
    assert.equal(formatINR(null, { zero: '₹0' }), '–');
});

test('toIndianCommas matches the existing helper', () => {
    assert.equal(toIndianCommas(100000), '1,00,000');
    assert.equal(toIndianCommas('1,00,000'), '1,00,000');
    assert.equal(toIndianCommas(''), '');
    assert.equal(toIndianCommas(null), '');
    assert.equal(toIndianCommas(-1234567), '-12,34,567');
});

test('formatCount and formatKwp', () => {
    assert.equal(formatCount(123456), '1,23,456');
    assert.equal(formatCount(null), '0');
    assert.equal(formatCount('x'), '0');
    assert.equal(formatKwp(3.24), '3.24 kWp');
    assert.equal(formatKwp('1234.567'), '1,234.57 kWp');
    assert.equal(formatKwp(''), '–');
    assert.equal(formatKwp(0), '–');
});

test('formatDate reads dates in IST', () => {
    assert.equal(formatDate('2026-10-01'), '1/10/2026');
    assert.equal(formatDate('2026-10-01', 'dmy'), '01/10/2026');
    assert.equal(formatDate('2026-10-01', 'short'), '1 Oct 2026');
    assert.equal(formatDate('2026-10-01', 'long'), '1 October 2026');
    // 20:00 UTC is already the next day in India.
    assert.equal(formatDate('2026-10-01T20:00:00Z', 'dmy'), '02/10/2026');
    assert.equal(formatDate('2026-10-13T09:00:00Z', 'datetime'), '13 Oct, 02:30 pm');
    assert.equal(formatDate(''), '');
    assert.equal(formatDate(null), '');
    assert.equal(formatDate('not a date'), 'not a date');
});

test('todayIST, monthKey and MONTH_NAMES', () => {
    assert.equal(todayIST(new Date('2026-03-31T19:00:00Z')), '2026-04-01');
    assert.equal(todayIST(new Date('2026-03-31T18:00:00Z')), '2026-03-31');
    assert.match(todayIST(), /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(monthKey('2026-10-31'), '2026-10');
    assert.equal(monthKey('2026-10'), '2026-10');
    assert.equal(monthKey('2026-10-31T20:00:00Z'), '2026-11');
    assert.equal(monthKey(new Date('2026-01-15T00:00:00Z')), '2026-01');
    assert.equal(monthKey(''), '');
    assert.equal(monthKey('garbage'), '');
    assert.equal(MONTH_NAMES.length, 12);
    assert.equal(MONTH_NAMES[9], 'October');
});

test('getMonthBounds is half-open and rolls over December', () => {
    assert.deepEqual(getMonthBounds('2026-02'), { start: '2026-02-01', end: '2026-03-01' });
    assert.deepEqual(getMonthBounds('2026-12'), { start: '2026-12-01', end: '2027-01-01' });
    assert.deepEqual(getMonthBounds('2026-12', true), { start: '2026-12-01T00:00:00+05:30', end: '2027-01-01T00:00:00+05:30' });
    assert.equal(getMonthBounds('2026-1'), null);
    assert.equal(getMonthBounds(''), null);
});

test('cleanPhone keeps 10 digits and drops +91 or a leading 0', () => {
    assert.equal(cleanPhone('+91 98765 43210'), '9876543210');
    assert.equal(cleanPhone('09876543210'), '9876543210');
    assert.equal(cleanPhone('98765-43210'), '9876543210');
    assert.equal(cleanPhone('98765432101'), '9876543210');
    assert.equal(cleanPhone('98a7'), '987');
    assert.equal(cleanPhone(null), '');
});

test('formatFieldValue formats each config field type', () => {
    assert.equal(formatFieldValue({ type: 'money' }, 150000), '₹1,50,000');
    assert.equal(formatFieldValue({ type: 'money' }, 0), '₹0');
    assert.equal(formatFieldValue({ type: 'number' }, 12345.5), '12,345.5');
    assert.equal(formatFieldValue({ type: 'date' }, '2026-10-01'), '1 Oct 2026');
    assert.equal(formatFieldValue({ type: 'yesno' }, 'Yes'), 'Yes');
    assert.equal(formatFieldValue({ type: 'yesno' }, false), 'No');
    assert.equal(formatFieldValue({ type: 'file' }, { name: 'bill.pdf' }), 'bill.pdf');
    assert.equal(formatFieldValue({ type: 'text' }, 'Roof'), 'Roof');
    for (const empty of [null, undefined, '', '   ']) assert.equal(formatFieldValue({ type: 'text' }, empty), '–');
});
