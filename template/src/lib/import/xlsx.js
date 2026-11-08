// A small .xlsx reader: cell text from every sheet, nothing else.
//
// An .xlsx file is a zip of XML parts. The zip's central directory is read
// here and entries are unpacked with the platform's DecompressionStream, so
// it runs in browsers and in Node without a library. XML is read with a
// linear scanner (indexOf and single passes, no backtracking regexes) because
// DOMParser does not exist in Node.

import { SpreadsheetError, LIMITS, SAVE_AS_HELP, tooManyRows } from './errors.js';
import { excelSerialText } from './values.js';

const DAMAGED = `This Excel file looks damaged and could not be read. ${SAVE_AS_HELP}`;
const MAX_ZIP_ENTRIES = 10000;

// ── Zip ───────────────────────────────────────────────────────────────────

/** Entries of a zip by lower-case name: { name, method, flags, size, compressedSize, dataStart }. */
export function zipEntries(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const u16 = at => view.getUint16(at, true);
    const u32 = at => view.getUint32(at, true);
    const inside = (at, length) => at >= 0 && length >= 0 && at + length <= bytes.length;

    let end = -1;
    for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 22 - 0xffff); at -= 1) {
        if (u32(at) === 0x06054b50) { end = at; break; }
    }
    if (end === -1) throw new SpreadsheetError(DAMAGED);
    const count = u16(end + 10);
    const directorySize = u32(end + 12);
    let at = u32(end + 16);
    if (count === 0xffff || at === 0xffffffff) throw new SpreadsheetError(`This Excel file is too large to read here. ${SAVE_AS_HELP}`);
    if (count > MAX_ZIP_ENTRIES || !inside(at, directorySize)) throw new SpreadsheetError(DAMAGED);

    const names = new TextDecoder('utf-8');
    const entries = new Map();
    for (let i = 0; i < count; i += 1) {
        if (!inside(at, 46) || u32(at) !== 0x02014b50) throw new SpreadsheetError(DAMAGED);
        const nameLength = u16(at + 28);
        const next = at + 46 + nameLength + u16(at + 30) + u16(at + 32);
        if (!inside(at + 46, nameLength)) throw new SpreadsheetError(DAMAGED);
        const name = names.decode(bytes.subarray(at + 46, at + 46 + nameLength));
        const local = u32(at + 42);
        if (!inside(local, 30) || u32(local) !== 0x04034b50) throw new SpreadsheetError(DAMAGED);
        const entry = {
            name,
            flags: u16(at + 8),
            method: u16(at + 10),
            compressedSize: u32(at + 20),
            size: u32(at + 24),
            dataStart: local + 30 + u16(local + 26) + u16(local + 28),
        };
        if (!inside(entry.dataStart, entry.compressedSize)) throw new SpreadsheetError(DAMAGED);
        entries.set(name.toLowerCase(), entry);
        at = next;
    }
    return entries;
}

const tooBig = () => new SpreadsheetError(`This Excel file holds more data than SolarFlow can import at once (over ${Math.round(LIMITS.inflatedBytes / 1024 / 1024)} MB once unpacked). Split it into smaller files, or remove pictures and extra sheets, then try again.`);

async function inflateRaw(data, max) {
    if (typeof DecompressionStream === 'undefined') {
        throw new SpreadsheetError('This browser cannot open Excel files. Update the browser, or save the file as CSV and import that.');
    }
    const reader = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
    const chunks = [];
    let total = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > max) throw tooBig();
            chunks.push(value);
        }
    } catch (error) {
        reader.cancel().catch(() => {});
        throw error instanceof SpreadsheetError ? error : new SpreadsheetError(DAMAGED);
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.byteLength; }
    return out;
}

/**
 * The unpacked bytes of one entry. `budget.left` is shared by every entry of
 * a file, so a zip bomb is stopped as soon as the total passes the limit.
 */
export async function readZipEntry(bytes, entry, budget) {
    if (entry.flags & 1) throw new SpreadsheetError('This workbook is password-protected. Open it in Excel, remove the password (File → Info → Protect Workbook), save it, then try again.');
    if (entry.size > budget.left) throw tooBig();
    const data = bytes.subarray(entry.dataStart, entry.dataStart + entry.compressedSize);
    let out;
    if (entry.method === 0) out = data;
    else if (entry.method === 8) out = await inflateRaw(data, budget.left);
    else throw new SpreadsheetError(DAMAGED);
    if (out.byteLength > budget.left) throw tooBig();
    budget.left -= out.byteLength;
    return out;
}

function bytesToText(bytes) {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
    return new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '');
}

// ── XML ───────────────────────────────────────────────────────────────────

const NAMED_ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

/** XML entities (&amp; &#233; &#x20AC;) to text. Unknown entities are kept as written. */
export function decodeEntities(text) {
    if (!text.includes('&')) return text;
    return text.replace(/&(#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[a-zA-Z]{2,8});/g, (whole, body) => {
        if (body[0] !== '#') return NAMED_ENTITIES[body] ?? whole;
        const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
        const valid = code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff);
        return valid ? String.fromCodePoint(code) : '\uFFFD';
    });
}

// Excel writes characters XML cannot hold as _xHHHH_ (_x000D_ is a carriage
// return); _x005F_ escapes a literal underscore.
const decodeExcelEscapes = text => (text.includes('_x')
    ? text.replace(/_x([0-9a-fA-F]{4})_/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    : text);
const cellText = raw => decodeExcelEscapes(decodeEntities(raw));

const localName = name => name.slice(name.indexOf(':') + 1);

/** Attributes of a tag body ('c r="A1" t="s"') by name, values decoded. */
export function parseAttributes(body) {
    const attrs = {};
    const n = body.length;
    let i = 0;
    while (i < n && !/\s/.test(body[i])) i += 1;
    while (i < n) {
        while (i < n && /[\s/]/.test(body[i])) i += 1;
        const start = i;
        while (i < n && body[i] !== '=' && !/\s/.test(body[i])) i += 1;
        const name = body.slice(start, i);
        while (i < n && /\s/.test(body[i])) i += 1;
        if (body[i] !== '=') { i += 1; continue; }
        i += 1;
        while (i < n && /\s/.test(body[i])) i += 1;
        const quote = body[i];
        if (quote !== '"' && quote !== "'") break;
        const close = body.indexOf(quote, i + 1);
        if (close === -1) break;
        if (name) attrs[name] = decodeEntities(body.slice(i + 1, close));
        i = close + 1;
    }
    return attrs;
}

/**
 * Walks an XML document once. onTag(localName, body, kind) gets every
 * element tag (kind 'open' | 'close' | 'empty'; `body` is the raw text inside
 * < >, for parseAttributes). onText(raw, cdata) gets the text between tags,
 * not yet decoded (CDATA text needs no decoding).
 */
export function scanXml(xml, onTag, onText) {
    const n = xml.length;
    let i = 0;
    while (i < n) {
        const lt = xml.indexOf('<', i);
        if (lt === -1) { onText?.(xml.slice(i), false); break; }
        if (lt > i) onText?.(xml.slice(i, lt), false);
        if (xml.startsWith('<!--', lt)) {
            const end = xml.indexOf('-->', lt + 4);
            i = end === -1 ? n : end + 3;
            continue;
        }
        if (xml.startsWith('<![CDATA[', lt)) {
            const end = xml.indexOf(']]>', lt + 9);
            onText?.(xml.slice(lt + 9, end === -1 ? n : end), true);
            i = end === -1 ? n : end + 3;
            continue;
        }
        if (xml[lt + 1] === '?' || xml[lt + 1] === '!') {
            // Declarations and DOCTYPE carry no cell data; an internal subset ends with ]>.
            const subset = xml[lt + 1] === '!' ? xml.indexOf('[', lt) : -1;
            const close = xml.indexOf('>', lt);
            const end = subset !== -1 && subset < close ? xml.indexOf(']>', subset) : close;
            i = end === -1 ? n : end + (subset !== -1 && subset < close ? 2 : 1);
            continue;
        }
        let j = lt + 1;
        let quote = '';
        while (j < n) {
            const ch = xml[j];
            if (quote) { if (ch === quote) quote = ''; } else if (ch === '"' || ch === "'") quote = ch; else if (ch === '>') break;
            j += 1;
        }
        const body = xml.slice(lt + 1, j);
        i = j + 1;
        if (body[0] === '/') {
            onTag(localName(body.slice(1).trim()), '', 'close');
            continue;
        }
        const empty = body.endsWith('/');
        const nameEnd = body.search(/[\s/]|$/);
        onTag(localName(body.slice(0, nameEnd)), body, empty ? 'empty' : 'open');
    }
}

// ── Workbook parts ────────────────────────────────────────────────────────

function readRelationships(xml) {
    const rels = new Map();
    if (!xml) return rels;
    scanXml(xml, (name, body, kind) => {
        if (name !== 'Relationship' || kind === 'close') return;
        const attrs = parseAttributes(body);
        if (attrs.Id && attrs.Target && attrs.TargetMode !== 'External') rels.set(attrs.Id, { type: attrs.Type || '', target: attrs.Target });
    });
    return rels;
}

// A relationship target, relative to the folder of the part that names it.
function resolvePath(base, target) {
    const parts = target.startsWith('/') ? [] : base.split('/').slice(0, -1);
    for (const segment of target.replace(/^\/+/, '').split('/')) {
        if (segment === '..') parts.pop();
        else if (segment && segment !== '.') parts.push(segment);
    }
    return parts.join('/');
}

const relsPathFor = part => {
    const slash = part.lastIndexOf('/');
    return `${part.slice(0, slash + 1)}_rels/${part.slice(slash + 1)}.rels`;
};

function readWorkbook(xml) {
    const sheets = [];
    let date1904 = false;
    scanXml(xml, (name, body, kind) => {
        if (kind === 'close') return;
        if (name === 'workbookPr') {
            const value = parseAttributes(body).date1904;
            date1904 = value === '1' || value === 'true';
        } else if (name === 'sheet') {
            const attrs = parseAttributes(body);
            const idKey = Object.keys(attrs).find(key => key === 'r:id' || key.endsWith(':id'));
            sheets.push({ name: attrs.name || `Sheet ${sheets.length + 1}`, rid: attrs[idKey], hidden: attrs.state === 'hidden' || attrs.state === 'veryHidden' });
        }
    });
    return { sheets, date1904 };
}

function readSharedStrings(xml) {
    const strings = [];
    if (!xml) return strings;
    let parts = null;
    let inText = false;
    let phonetic = 0;
    scanXml(xml, (name, body, kind) => {
        if (name === 'si') {
            if (kind === 'open') parts = [];
            else if (kind === 'close') { strings.push(parts ? parts.join('') : ''); parts = null; } else strings.push('');
        } else if (name === 'rPh') {
            if (kind === 'open') phonetic += 1;
            else if (kind === 'close') phonetic = Math.max(0, phonetic - 1);
        } else if (name === 't') {
            inText = kind === 'open' && parts !== null && phonetic === 0;
        }
    }, (raw, cdata) => {
        if (inText) parts.push(cdata ? raw : cellText(raw));
    });
    return strings;
}

const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

/** True for a number format code that shows a date or time ('dd/mm/yyyy', 'h:mm AM/PM'). */
export function isDateFormat(code) {
    const bare = String(code || '')
        .replace(/"[^"]*"/g, '')
        .replace(/\\./g, '')
        .replace(/\[(?![hms]+\])[^\]]*\]/gi, '');
    return /[dmyhs]/i.test(bare);
}

// Indexes into cellXfs (a cell's s="..") whose number format is a date.
function readDateStyles(xml) {
    const dates = new Set();
    if (!xml) return dates;
    const custom = new Map();
    let inCellXfs = false;
    let index = 0;
    scanXml(xml, (name, body, kind) => {
        if (name === 'numFmt' && kind !== 'close') {
            const attrs = parseAttributes(body);
            custom.set(Number(attrs.numFmtId), attrs.formatCode);
        } else if (name === 'cellXfs') {
            inCellXfs = kind === 'open';
        } else if (name === 'xf' && inCellXfs && kind !== 'close') {
            const id = Number(parseAttributes(body).numFmtId || 0);
            if (BUILTIN_DATE_FORMATS.has(id) || (custom.has(id) && isDateFormat(custom.get(id)))) dates.add(index);
            index += 1;
        }
    });
    return dates;
}

// 'AB12' -> 27 (0-based column); -1 when there is no column part.
function columnIndex(ref) {
    let col = 0;
    let i = 0;
    while (i < ref.length && i < 4) {
        const code = ref.charCodeAt(i) & ~32;
        if (code < 65 || code > 90) break;
        col = col * 26 + (code - 64);
        i += 1;
    }
    return i === 0 ? -1 : col - 1;
}

const normalizeNumber = text => {
    const value = Number(text);
    if (!Number.isFinite(value)) return text.trim();
    // Excel shows 15 significant digits; the stored binary noise is dropped.
    const rounded = Number(value.toPrecision(15));
    return Number.isInteger(rounded) && Math.abs(rounded) < 1e21 ? rounded.toFixed(0) : String(rounded);
};

const isoDateTimeText = text => {
    const match = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2})(?::(\d{2}))?)?/.exec(text.trim());
    if (!match) return text.trim();
    const [, day, time, seconds] = match;
    if (!time || (time === '00:00' && (!seconds || seconds === '00'))) return day;
    return `${day} ${time}${seconds && seconds !== '00' ? `:${seconds}` : ''}`;
};

/** Rows of one worksheet: { rows: string[][], rowNumbers: number[] } with only rows that hold a value. */
export function readSheetXml(xml, { shared = [], dateStyles = new Set(), date1904 = false } = {}) {
    const rows = [];
    const rowNumbers = [];
    let inData = false;
    let rowNumber = 0;
    let cells = null;
    let hasValue = false;
    let nextCol = 0;
    let cell = null;
    let collecting = '';
    let phonetic = 0;

    const finishCell = () => {
        const { type, style, value, inline } = cell;
        let text;
        if (type === 's') text = shared[parseInt(value, 10)] ?? '';
        else if (type === 'inlineStr') text = inline;
        else if (type === 'str') text = value;
        else if (type === 'b') text = value.trim() === '1' || value.trim() === 'true' ? 'TRUE' : value.trim() ? 'FALSE' : '';
        else if (type === 'e') text = '';
        else if (type === 'd') text = isoDateTimeText(value);
        else if (value.trim() === '') text = '';
        else if (dateStyles.has(style) && Number.isFinite(Number(value))) text = excelSerialText(Number(value), { date1904 });
        else text = normalizeNumber(value);
        if (text !== '') {
            if (cell.col < LIMITS.columns) {
                cells[cell.col] = text;
                if (text.trim()) hasValue = true;
            } else if (text.trim()) {
                throw new SpreadsheetError(`Row ${rowNumber} has data beyond column ${LIMITS.columns}. Delete the extra columns, save the file and try again.`);
            }
            // A stray space far to the right is dropped: it holds nothing to import.
        }
        cell = null;
    };

    scanXml(xml, (name, body, kind) => {
        if (name === 'sheetData') { inData = kind === 'open'; return; }
        if (!inData) return;
        if (name === 'row') {
            if (kind === 'close') {
                if (hasValue) {
                    rows.push(Array.from(cells, value => value ?? ''));
                    rowNumbers.push(rowNumber);
                    if (rows.length > LIMITS.rows + 20) throw tooManyRows();
                }
                cells = null;
                return;
            }
            const r = parseInt(parseAttributes(body).r, 10);
            rowNumber = r > rowNumber ? r : rowNumber + 1;
            cells = kind === 'open' ? [] : null;
            hasValue = false;
            nextCol = 0;
            return;
        }
        if (!cells) return;
        if (name === 'c') {
            if (kind === 'close') { if (cell) finishCell(); return; }
            const attrs = parseAttributes(body);
            const fromRef = attrs.r ? columnIndex(attrs.r) : -1;
            const col = fromRef >= 0 ? fromRef : nextCol;
            nextCol = col + 1;
            if (kind === 'empty') return;
            cell = { col, type: attrs.t || 'n', style: Number(attrs.s || 0), value: '', inline: '' };
            return;
        }
        if (!cell) return;
        if (name === 'rPh') {
            if (kind === 'open') phonetic += 1;
            else if (kind === 'close') phonetic = Math.max(0, phonetic - 1);
            return;
        }
        if (name === 'v' || (name === 't' && phonetic === 0)) collecting = kind === 'open' ? name : '';
    }, (raw, cdata) => {
        if (!cell || !collecting) return;
        const text = cdata ? raw : cellText(raw);
        if (collecting === 'v') cell.value += text;
        else cell.inline += text;
    });
    return { rows, rowNumbers };
}

/**
 * Every worksheet of an .xlsx file: { sheets: [{ name, hidden, rows, rowNumbers, error? }] }.
 * A sheet that cannot be read on its own has no rows and its message in `error`.
 */
export async function readXlsx(bytes) {
    const entries = zipEntries(bytes);
    const budget = { left: LIMITS.inflatedBytes };
    const text = async path => {
        const entry = entries.get(path.toLowerCase());
        return entry ? bytesToText(await readZipEntry(bytes, entry, budget)) : null;
    };

    const rootRels = readRelationships(await text('_rels/.rels'));
    const office = [...rootRels.values()].find(rel => rel.type.endsWith('/officeDocument'));
    const workbookPath = office ? resolvePath('', office.target) : 'xl/workbook.xml';
    const workbookXml = await text(workbookPath);
    if (!workbookXml) {
        if (entries.has('content.xml')) throw new SpreadsheetError(`This is an OpenDocument (.ods) spreadsheet, which SolarFlow cannot read. ${SAVE_AS_HELP}`);
        throw new SpreadsheetError(`This file is not an Excel workbook. ${SAVE_AS_HELP}`);
    }
    const { sheets, date1904 } = readWorkbook(workbookXml);
    const rels = readRelationships(await text(relsPathFor(workbookPath)));
    const partOf = suffix => [...rels.values()].find(rel => rel.type.endsWith(suffix));
    const sharedRel = partOf('/sharedStrings');
    const stylesRel = partOf('/styles');
    const shared = readSharedStrings(await text(sharedRel ? resolvePath(workbookPath, sharedRel.target) : 'xl/sharedStrings.xml'));
    const dateStyles = readDateStyles(await text(stylesRel ? resolvePath(workbookPath, stylesRel.target) : 'xl/styles.xml'));

    const result = [];
    for (const sheet of sheets) {
        const rel = rels.get(sheet.rid);
        if (!rel || !rel.type.endsWith('/worksheet')) continue;
        const xml = await text(resolvePath(workbookPath, rel.target));
        if (xml == null) continue;
        try {
            result.push({ name: sheet.name, hidden: sheet.hidden, ...readSheetXml(xml, { shared, dateStyles, date1904 }) });
        } catch (error) {
            // One sheet too big (often a hidden lookup list) must not block the
            // customer sheet beside it; the error shows only if this sheet is picked.
            if (!(error instanceof SpreadsheetError)) throw error;
            result.push({ name: sheet.name, hidden: sheet.hidden, rows: [], rowNumbers: [], error: error.message });
        }
    }
    return { sheets: result };
}
