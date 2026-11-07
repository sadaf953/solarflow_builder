import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, detectDelimiter } from '../../template/src/lib/import/csv.js';
import { readSpreadsheet, tidyRows, detectHeaderRow, columnNames, columnLetter } from '../../template/src/lib/import/sheet.js';
import { SpreadsheetError } from '../../template/src/lib/import/errors.js';
import { utf8 } from './fixtures.mjs';

test('quoted cells keep commas, line breaks and doubled quotes', () => {
    const rows = parseCsv('Name,Address,Note\r\n"Shah, Ravi","12, MG Road\nSurat","He said ""yes"""\r\n');
    assert.deepEqual(rows, [
        ['Name', 'Address', 'Note'],
        ['Shah, Ravi', '12, MG Road\nSurat', 'He said "yes"'],
    ]);
});

test('LF, CRLF and lone CR line ends; a BOM is dropped; empty cells are kept', () => {
    assert.deepEqual(parseCsv('\uFEFFa,b\nc,d'), [['a', 'b'], ['c', 'd']]);
    assert.deepEqual(parseCsv('a,b\r\nc,d\r\n'), [['a', 'b'], ['c', 'd']]);
    assert.deepEqual(parseCsv('a,b\rc,d\r'), [['a', 'b'], ['c', 'd']]);
    assert.deepEqual(parseCsv('a,,c\n,,\nx,'), [['a', '', 'c'], ['', '', ''], ['x', '']]);
    assert.deepEqual(parseCsv(''), []);
});

test('a quote inside a cell is plain text; text after a closing quote is kept', () => {
    assert.deepEqual(parseCsv('Panel,Size\n5" frame,"540"Wp'), [['Panel', 'Size'], ['5" frame', '540Wp']]);
});

test('the delimiter is detected: comma, semicolon (with decimal commas) or tab', () => {
    assert.equal(detectDelimiter('Name,Mobile\nRavi,98765'), ',');
    assert.equal(detectDelimiter('Name;Capacity;Amount\nRavi;5,5;"1,20,000"\nSita;3,3;2'), ';');
    assert.equal(detectDelimiter('Name\tMobile\nRavi\t98765'), '\t');
    // Commas inside quotes do not count.
    assert.equal(detectDelimiter('"Shah, Ravi";"a, b"\n"x, y";z'), ';');
    assert.deepEqual(parseCsv('Name;Capacity\nRavi;5,5'), [['Name', 'Capacity'], ['Ravi', '5,5']]);
    assert.deepEqual(parseCsv('Name\tMobile\nRavi\t98765'), [['Name', 'Mobile'], ['Ravi', '98765']]);
});

test('an unclosed quote is refused with the row it starts in', () => {
    assert.throws(() => parseCsv('Name,Note\nRavi,"never closed\nSita,ok'), error => {
        assert.ok(error instanceof SpreadsheetError);
        assert.match(error.message, /Row 2 has a quote mark/);
        return true;
    });
});

test('too many rows are refused, not half read', () => {
    const text = Array.from({ length: 12 }, (_, i) => `row ${i}`).join('\n');
    assert.throws(() => parseCsv(text, { maxRows: 10 }), /too many rows: SolarFlow imports up to 20,000 customers/);
    assert.equal(parseCsv(text, { maxRows: 12 }).length, 12);
});

test('tidyRows drops empty rows and columns but keeps spreadsheet row numbers and column letters', () => {
    const tidy = tidyRows([
        ['Customer list', '', '', ''],
        ['', '', '', ''],
        ['Name', '', ' Mobile ', ''],
        ['Ravi\u00A0', '', '9876543210', ''],
    ]);
    assert.deepEqual(tidy.rows, [['Customer list', ''], ['Name', 'Mobile'], ['Ravi', '9876543210']]);
    assert.deepEqual(tidy.rowNumbers, [1, 3, 4]);
    assert.deepEqual(tidy.columnLetters, ['A', 'C']);
    assert.equal(detectHeaderRow(tidy.rows), 1);
    assert.equal(detectHeaderRow([['only one'], ['still one']]), 0);
});

test('column names fall back to the letter and repeats are numbered', () => {
    assert.deepEqual(columnNames(['Name', '', 'Mobile', 'mobile'], ['A', 'C', 'D', 'F']), ['Name', 'Column C', 'Mobile', 'mobile (2)']);
    assert.deepEqual([0, 25, 26, 27, 701, 702].map(columnLetter), ['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
});

test('readSpreadsheet reads CSV as one sheet named after the file', async () => {
    const { sheets } = await readSpreadsheet({ name: 'old leads.csv', bytes: utf8('\uFEFFName,Mobile\r\n\r\nRavi,98765 43210\r\n') });
    assert.equal(sheets.length, 1);
    assert.equal(sheets[0].name, 'old leads');
    assert.deepEqual(sheets[0].rows, [['Name', 'Mobile'], ['Ravi', '98765 43210']]);
    assert.deepEqual(sheets[0].rowNumbers, [1, 3]);
});

test('CSV in the Windows encoding and Excel "Unicode text" (UTF-16, tabs) are read', async () => {
    const latin = new Uint8Array([...utf8('Name,City\nJos'), 0xe9, ...utf8(',Pune')]);
    assert.deepEqual((await readSpreadsheet({ name: 'a.csv', bytes: latin })).sheets[0].rows, [['Name', 'City'], ['José', 'Pune']]);

    const text = 'Name\tAmount\nRavi\t₹ 2,40,000';
    const utf16 = new Uint8Array(2 + text.length * 2);
    utf16.set([0xff, 0xfe]);
    for (let i = 0; i < text.length; i += 1) { utf16[2 + i * 2] = text.charCodeAt(i) & 0xff; utf16[3 + i * 2] = text.charCodeAt(i) >> 8; }
    assert.deepEqual((await readSpreadsheet({ name: 'a.txt', bytes: utf16 })).sheets[0].rows, [['Name', 'Amount'], ['Ravi', '₹ 2,40,000']]);
});

test('files SolarFlow cannot read get a message that says what to do', async () => {
    const read = (name, bytes) => readSpreadsheet({ name, bytes });
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
    await assert.rejects(read('old.xls', ole), error => {
        assert.ok(error instanceof SpreadsheetError);
        assert.match(error.message, /old Excel 97-2003 file \(\.xls\)/);
        assert.match(error.message, /Save As/);
        assert.match(error.message, /Google Sheets, choose File → Download/);
        return true;
    });
    await assert.rejects(read('locked.xlsx', ole), /password-protected/);
    await assert.rejects(read('web.xls', utf8('<html><table><tr><td>x</td></tr></table></html>')), /web page/);
    await assert.rejects(read('report.xls', utf8('<?xml version="1.0"?><Workbook/>')), /not a normal Excel workbook/);
    await assert.rejects(read('sheet.ods', new Uint8Array([0x50, 0x4b, 3, 4])), /OpenDocument/);
    await assert.rejects(read('photo.jpg', utf8('abc')), /not a spreadsheet/);
    await assert.rejects(read('empty.csv', new Uint8Array()), /This file is empty/);
    await assert.rejects(read('bin.csv', new Uint8Array([65, 0, 66, 0, 10])), /not a spreadsheet SolarFlow can read/);
});
