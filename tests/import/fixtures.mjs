// Builds .xlsx files for the import tests with fflate (a root dependency;
// the template itself never ships it).
import { zipSync, strToU8 } from 'fflate';

const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const escape = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// 0-based column -> 'A', 'AB'.
export const letter = index => {
    let n = index + 1;
    let out = '';
    while (n > 0) { out = String.fromCharCode(65 + ((n - 1) % 26)) + out; n = Math.floor((n - 1) / 26); }
    return out;
};

/** <sheetData> for rows of plain strings (shared strings) and numbers. */
export function sheetXml(rows, shared) {
    const body = rows.map((row, r) => `<row r="${r + 1}">${row.map((value, c) => {
        if (value === null || value === undefined || value === '') return '';
        const ref = `${letter(c)}${r + 1}`;
        if (typeof value === 'number') return `<c r="${ref}"><v>${value}</v></c>`;
        let index = shared.indexOf(value);
        if (index === -1) index = shared.push(value) - 1;
        return `<c r="${ref}" t="s"><v>${index}</v></c>`;
    }).join('')}</row>`).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

/**
 * An .xlsx as bytes. sheets: [{ name, xml?, rows?, hidden? }] (rows are
 * turned into shared strings); `shared` adds raw <si> bodies; `styles` is the
 * whole styles.xml; `extra` adds or replaces zip entries; `level` 0 stores.
 */
export function workbook({ sheets, sharedXml, styles, date1904 = false, extra = {}, level = 6 }) {
    const shared = [];
    const parts = sheets.map((sheet, i) => ({ ...sheet, path: `worksheets/sheet${i + 1}.xml`, xml: sheet.xml ?? sheetXml(sheet.rows || [], shared) }));
    const sst = sharedXml ?? `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${shared.map(text => `<si><t xml:space="preserve">${escape(text)}</t></si>`).join('')}</sst>`;
    const files = {
        '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
        '_rels/.rels': strToU8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
        'xl/workbook.xml': strToU8(`<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${REL}">${date1904 ? '<workbookPr date1904="1"/>' : '<workbookPr/>'}<sheets>${parts.map((part, i) => `<sheet name="${escape(part.name)}" sheetId="${i + 1}"${part.hidden ? ' state="hidden"' : ''} r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`),
        'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${parts.map((part, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="${part.path}"/>`).join('')}<Relationship Id="rIdS" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/><Relationship Id="rIdT" Type="${REL}/styles" Target="styles.xml"/></Relationships>`),
        'xl/sharedStrings.xml': strToU8(sst),
        'xl/styles.xml': strToU8(styles ?? '<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cellXfs count="1"><xf numFmtId="0"/></cellXfs></styleSheet>'),
    };
    for (const part of parts) files[`xl/${part.path}`] = strToU8(part.xml);
    for (const [path, data] of Object.entries(extra)) files[path] = typeof data === 'string' ? strToU8(data) : data;
    return zipSync(files, { level });
}

/** Offsets of each central-directory entry, by name, so a test can tamper with them. */
export function centralEntries(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let end = bytes.length - 22;
    while (view.getUint32(end, true) !== 0x06054b50) end -= 1;
    const out = {};
    let at = view.getUint32(end + 16, true);
    for (let i = 0; i < view.getUint16(end + 10, true); i += 1) {
        const nameLength = view.getUint16(at + 28, true);
        const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
        out[name] = at;
        at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
    }
    return { view, entries: out };
}

export const utf8 = text => new TextEncoder().encode(text);
