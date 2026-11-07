import test from 'node:test';
import assert from 'node:assert/strict';
import { readSpreadsheet, usableSheets } from '../../template/src/lib/import/sheet.js';
import { decodeEntities, isDateFormat, readSheetXml, scanXml } from '../../template/src/lib/import/xlsx.js';
import { SpreadsheetError } from '../../template/src/lib/import/errors.js';
import { centralEntries, workbook } from './fixtures.mjs';

const read = bytes => readSpreadsheet({ name: 'customers.xlsx', bytes });
const MAIN = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';

test('shared strings, numbers and several sheets are read in workbook order', async () => {
    const bytes = workbook({
        sheets: [
            { name: 'Customers', rows: [['Name', 'Mobile', 'kW'], ['Ravi Patel', 9876543210, 5.5], ['Sita Shah', 9123456789, 3]] },
            { name: 'Old & closed', rows: [['Name'], ['Mohan']] },
            { name: 'Empty', rows: [] },
        ],
    });
    const { sheets } = await read(bytes);
    assert.deepEqual(sheets.map(sheet => sheet.name), ['Customers', 'Old & closed', 'Empty']);
    assert.deepEqual(sheets[0].rows, [['Name', 'Mobile', 'kW'], ['Ravi Patel', '9876543210', '5.5'], ['Sita Shah', '9123456789', '3']]);
    assert.deepEqual(sheets[1].rows, [['Name'], ['Mohan']]);
    assert.deepEqual(sheets[2].rows, []);
});

test('inline strings, formula results, booleans, errors and rich text', async () => {
    const sharedXml = `<sst ${MAIN}><si><r><rPr><b/></rPr><t>Ravi </t></r><r><t>Patel</t></r><rPh sb="0" eb="1"><t>ignored reading</t></rPh></si><si><t/></si><si><t>Mobile</t></si></sst>`;
    const xml = `<worksheet ${MAIN}><sheetData>
        <row r="1"><c r="A1" t="inlineStr"><is><t>Name</t></is></c><c r="B1" t="s"><v>2</v></c><c r="C1" t="inlineStr"><is><t>Done</t></is></c><c r="D1" t="inlineStr"><is><t>Total</t></is></c></row>
        <row r="2"><c r="A2" t="s"><v>0</v></c><c r="B2" t="str"><f>CONCAT("98765","43210")</f><v>9876543210</v></c><c r="C2" t="b"><v>1</v></c><c r="D2" t="e"><v>#DIV/0!</v></c></row>
        <row r="3"><c r="A3" t="inlineStr"><is><r><t>Sita</t></r><r><t xml:space="preserve"> Shah</t></r></is></c><c r="B3"><f>1+1</f><v>2</v></c><c r="C3" t="b"><v>0</v></c><c r="D3" t="s"><v>1</v></c></row>
    </sheetData></worksheet>`;
    const { sheets } = await read(workbook({ sheets: [{ name: 'S', xml }], sharedXml }));
    assert.deepEqual(sheets[0].rows, [
        ['Name', 'Mobile', 'Done', 'Total'],
        ['Ravi Patel', '9876543210', 'TRUE', ''],
        ['Sita Shah', '2', 'FALSE', ''],
    ]);
});

test('sparse cells land in their own column; rows keep their spreadsheet numbers', async () => {
    const xml = `<worksheet ${MAIN}><sheetData>
        <row r="2"><c r="B2" t="inlineStr"><is><t>Name</t></is></c><c r="E2" t="inlineStr"><is><t>Village</t></is></c></row>
        <row r="3" spans="1:5"/>
        <row r="5"><c r="E5" t="inlineStr"><is><t>Adajan</t></is></c></row>
        <row r="6"><c r="B6" t="inlineStr"><is><t>Ravi</t></is></c><c t="inlineStr"><is><t>next to B</t></is></c></row>
        <row><c r="B7" t="inlineStr"><is><t>No r on the row</t></is></c></row>
    </sheetData></worksheet>`;
    const [sheet] = (await read(workbook({ sheets: [{ name: 'S', xml }] }))).sheets;
    assert.deepEqual(sheet.rowNumbers, [2, 5, 6, 7]);
    assert.deepEqual(sheet.columnLetters, ['B', 'C', 'E']);
    assert.deepEqual(sheet.rows, [
        ['Name', '', 'Village'],
        ['', '', 'Adajan'],
        ['Ravi', 'next to B', ''],
        ['No r on the row', '', ''],
    ]);
});

test('XML entities are decoded, including numeric ones; bad ones become a replacement character', async () => {
    assert.equal(decodeEntities('A &amp; B &lt;5&gt; &quot;x&quot; &apos;y&apos; &#8377; &#x20B9; &#x1F600;'), 'A & B <5> "x" \'y\' ₹ ₹ 😀');
    assert.equal(decodeEntities('&#0; &#xD800; &#x110000; &nbsp; &bogus'), '\uFFFD \uFFFD \uFFFD &nbsp; &bogus');
    const xml = `<worksheet ${MAIN}><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Shah &amp; Sons &#8377;</t></is></c><c r="B1" t="inlineStr"><is><t>Line_x000D_
two _x005F_x</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t><![CDATA[<b>&amp;</b>]]></t></is></c></row></sheetData></worksheet>`;
    const [sheet] = (await read(workbook({ sheets: [{ name: 'Shah & Sons', xml }] }))).sheets;
    assert.equal(sheet.name, 'Shah & Sons');
    assert.deepEqual(sheet.rows, [['Shah & Sons ₹', 'Line\r\ntwo _x'], ['<b>&amp;</b>', '']]);
});

test('date cells become YYYY-MM-DD (built-in and custom formats, 1904 dates); other numbers stay numbers', async () => {
    const styles = `<styleSheet ${MAIN}><numFmts count="2"><numFmt numFmtId="164" formatCode="dd/mm/yyyy;@"/><numFmt numFmtId="165" formatCode="&quot;kW &quot;0.00"/></numFmts>
        <cellStyleXfs count="1"><xf numFmtId="14"/></cellStyleXfs>
        <cellXfs count="5"><xf numFmtId="0"/><xf numFmtId="14" applyNumberFormat="1"/><xf numFmtId="164"/><xf numFmtId="165"/><xf numFmtId="22"/></cellXfs></styleSheet>`;
    const xml = `<worksheet ${MAIN}><sheetData><row r="1">
        <c r="A1" s="1"><v>45362</v></c><c r="B1" s="2"><v>45000</v></c><c r="C1" s="3"><v>45362</v></c><c r="D1" s="4"><v>45362.4375</v></c><c r="E1"><v>0.30000000000000004</v></c><c r="F1"><v>1.23456789012E+11</v></c><c r="G1" t="d"><v>2024-03-12T00:00:00</v></c>
    </row></sheetData></worksheet>`;
    const [sheet] = (await read(workbook({ sheets: [{ name: 'S', xml }], styles }))).sheets;
    assert.deepEqual(sheet.rows[0], ['2024-03-11', '2023-03-15', '45362', '2024-03-11 10:30', '0.3', '123456789012', '2024-03-12']);

    const [old] = (await read(workbook({ sheets: [{ name: 'S', xml: `<worksheet ${MAIN}><sheetData><row r="1"><c r="A1" s="1"><v>43900</v></c></row></sheetData></worksheet>` }], styles, date1904: true }))).sheets;
    assert.deepEqual(old.rows[0], ['2024-03-11']);

    assert.equal(isDateFormat('dd/mm/yyyy'), true);
    assert.equal(isDateFormat('[$-409]d-mmm-yy;@'), true);
    assert.equal(isDateFormat('h:mm AM/PM'), true);
    assert.equal(isDateFormat('[h]:mm:ss'), true);
    assert.equal(isDateFormat('#,##0.00'), false);
    assert.equal(isDateFormat('"Days "0'), false);
    assert.equal(isDateFormat('[Red]0.00'), false);
    assert.equal(isDateFormat('0.00E+00'), false);
});

test('prefixed (x:) element names and a stored (uncompressed) zip are read', async () => {
    const xml = `<x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:sheetData><x:row r="1"><x:c r="A1" t="inlineStr"><x:is><x:t>Name</x:t></x:is></x:c><x:c r="B1" t="inlineStr"><x:is><x:t>kW</x:t></x:is></x:c></x:row><x:row r="2"><x:c r="A2" t="inlineStr"><x:is><x:t>Ravi</x:t></x:is></x:c><x:c r="B2"><x:v>5</x:v></x:c></x:row></x:sheetData></x:worksheet>`;
    const bytes = workbook({ sheets: [{ name: 'S', xml }], level: 0 });
    const { view, entries } = centralEntries(bytes);
    assert.equal(view.getUint16(entries['xl/worksheets/sheet1.xml'] + 10, true), 0, 'the entry is stored, not deflated');
    assert.deepEqual((await read(bytes)).sheets[0].rows, [['Name', 'kW'], ['Ravi', '5']]);
});

test('hidden sheets are marked and chart sheets are left out', async () => {
    const bytes = workbook({
        sheets: [{ name: 'Visible', rows: [['Name', 'Mobile']] }, { name: 'Lists', rows: [['a', 'b']], hidden: true }],
        extra: {
            'xl/workbook.xml': `<workbook ${MAIN} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Visible" sheetId="1" r:id="rId1"/><sheet name="Lists" sheetId="2" state="hidden" r:id="rId2"/><sheet name="Chart" sheetId="3" r:id="rIdC"/></sheets></workbook>`,
        },
    });
    const { sheets } = await read(bytes);
    assert.deepEqual(sheets.map(sheet => [sheet.name, sheet.hidden]), [['Visible', false], ['Lists', true]]);
});

test('a zip bomb is stopped once the unpacked total passes the limit, even when the zip lies about sizes', async () => {
    const huge = new Uint8Array(61 * 1024 * 1024);
    const bytes = workbook({ sheets: [{ name: 'S', rows: [['Name', 'Mobile']] }], extra: { 'xl/worksheets/sheet1.xml': huge }, level: 1 });
    assert.ok(bytes.length < 1024 * 1024, 'the file itself is small');
    await assert.rejects(read(bytes), error => {
        assert.ok(error instanceof SpreadsheetError);
        assert.match(error.message, /more data than SolarFlow can import at once/);
        return true;
    });
    // The central directory claims 100 bytes: the stream is cut off while unpacking instead.
    const { view, entries } = centralEntries(bytes);
    view.setUint32(entries['xl/worksheets/sheet1.xml'] + 24, 100, true);
    await assert.rejects(read(bytes), /more data than SolarFlow can import at once/);
});

test('damaged, encrypted and non-Excel zips are refused with a plain message', async () => {
    const good = workbook({ sheets: [{ name: 'S', rows: [['Name', 'Mobile']] }] });
    await assert.rejects(read(good.slice(0, good.length - 30)), /looks damaged/);

    const encrypted = good.slice();
    const { view, entries } = centralEntries(encrypted);
    view.setUint16(entries['xl/workbook.xml'] + 8, 1, true);
    await assert.rejects(read(encrypted), /password-protected/);

    const corrupt = good.slice();
    const at = centralEntries(corrupt);
    const local = at.view.getUint32(at.entries['xl/worksheets/sheet1.xml'] + 42, true);
    const dataStart = local + 30 + at.view.getUint16(local + 26, true) + at.view.getUint16(local + 28, true);
    corrupt.fill(0xff, dataStart, dataStart + 8);
    await assert.rejects(read(corrupt), error => error instanceof SpreadsheetError);

    const { zipSync, strToU8 } = await import('fflate');
    await assert.rejects(read(zipSync({ 'word/document.xml': strToU8('<w/>') })), /not an Excel workbook/);
    await assert.rejects(read(zipSync({ 'content.xml': strToU8('<o/>'), mimetype: strToU8('application/vnd.oasis.opendocument.spreadsheet') })), /OpenDocument/);
});

test('data far to the right is refused instead of building a huge row', () => {
    const xml = `<worksheet ${MAIN}><sheetData><row r="1"><c r="XFD1" t="inlineStr"><is><t>x</t></is></c></row></sheetData></worksheet>`;
    assert.throws(() => readSheetXml(xml), /data beyond column 300/);
});

test('the XML scanner is linear on hostile input', () => {
    const started = Date.now();
    const nasty = `<a b="${'x'.repeat(200000)}`;
    let tags = 0;
    scanXml(nasty, () => { tags += 1; });
    scanXml('<'.repeat(200000), () => { tags += 1; });
    scanXml(`<!DOCTYPE x [${'<!ENTITY a "b">'.repeat(20000)}]><r/>`, () => { tags += 1; });
    assert.ok(Date.now() - started < 2000, 'scanning took too long');
    assert.equal(tags, 3, 'one tag for each input: the unclosed tag, the run of <, and <r/> after the DOCTYPE');
    assert.equal(decodeEntities('&'.repeat(100000) + 'amp;').length, 100000);
});

test('a hidden sheet that is too big does not block the customer sheet beside it', async () => {
    const big = `<worksheet ${MAIN}><sheetData>${Array.from({ length: 20030 }, (_, i) => `<row r="${i + 1}"><c r="A${i + 1}"><v>${380001 + i}</v></c></row>`).join('')}</sheetData></worksheet>`;
    const wide = `<worksheet ${MAIN}><sheetData><row r="1"><c r="KZ1" t="inlineStr"><is><t>x</t></is></c></row></sheetData></worksheet>`;
    const bytes = workbook({
        sheets: [
            { name: 'Pincode master', hidden: true, xml: big },
            { name: 'Customers', rows: [['Name', 'Mobile'], ['Ravi Patel', 9876543210]] },
            { name: 'Wide', xml: wide },
        ],
    });
    const { sheets } = await read(bytes);
    const [master, customers, tooWide] = sheets;
    assert.match(master.error, /too many rows/);
    assert.deepEqual(master.rows, []);
    assert.equal(customers.error, undefined);
    assert.deepEqual(customers.rows, [['Name', 'Mobile'], ['Ravi Patel', '9876543210']]);
    assert.match(tooWide.error, /beyond column 300/);
    // The default choice is a readable sheet; broken ones come last, still with their message.
    assert.deepEqual(usableSheets(sheets).map(sheet => sheet.name), ['Customers', 'Wide', 'Pincode master']);
});

test('a single sheet that is too big is still refused with its message', async () => {
    const wide = `<worksheet ${MAIN}><sheetData><row r="1"><c r="KZ1" t="inlineStr"><is><t>x</t></is></c></row></sheetData></worksheet>`;
    const { sheets } = await read(workbook({ sheets: [{ name: 'Only', xml: wide }] }));
    assert.deepEqual(usableSheets(sheets).map(sheet => [sheet.name, Boolean(sheet.error)]), [['Only', true]]);
});

test('a cell holding only spaces past column 300 is ignored', () => {
    const xml = `<worksheet ${MAIN}><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Ravi</t></is></c><c r="XFD1" t="inlineStr"><is><t xml:space="preserve">   </t></is></c></row></sheetData></worksheet>`;
    assert.deepEqual(readSheetXml(xml), { rows: [['Ravi']], rowNumbers: [1] });
});
