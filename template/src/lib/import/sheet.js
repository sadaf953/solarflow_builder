// Any spreadsheet file the importer accepts -> sheets of tidy rows.

import { parseCsv } from './csv.js';
import { readXlsx } from './xlsx.js';
import { LIMITS, SAVE_AS_HELP, SpreadsheetError } from './errors.js';

const startsWith = (bytes, signature) => signature.every((byte, i) => bytes[i] === byte);
const ZIP = [0x50, 0x4b, 0x03, 0x04];
const EMPTY_ZIP = [0x50, 0x4b, 0x05, 0x06];
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const extensionOf = name => (/\.([a-z0-9]+)$/i.exec(String(name || ''))?.[1] || '').toLowerCase();
const baseName = name => String(name || 'Sheet').replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, '') || 'Sheet';

/** 'A', 'B', ... 'Z', 'AA' for a 0-based column. */
export function columnLetter(index) {
    let n = index + 1;
    let letters = '';
    while (n > 0) {
        const rest = (n - 1) % 26;
        letters = String.fromCharCode(65 + rest) + letters;
        n = Math.floor((n - 1) / 26);
    }
    return letters;
}

function decodeText(bytes) {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
        // Excel's plain "CSV" on Windows is saved in the old Windows encoding, not UTF-8.
        return new TextDecoder('windows-1252').decode(bytes);
    }
}

/**
 * Drops rows and columns with nothing in them and trims every cell. Keeps
 * each row's spreadsheet number and each column's letter, so messages can
 * say "row 57" and mean the row the user sees in Excel.
 */
export function tidyRows(rawRows, rawNumbers) {
    const rows = [];
    const rowNumbers = [];
    let width = 0;
    rawRows.forEach((row, index) => {
        const cells = row.map(cell => String(cell ?? '').replace(/\u00A0/g, ' ').trim());
        if (!cells.some(Boolean)) return;
        rows.push(cells);
        rowNumbers.push(rawNumbers ? rawNumbers[index] : index + 1);
        width = Math.max(width, cells.length);
    });
    const used = Array.from({ length: width }, (_, col) => rows.some(row => row[col]));
    const keep = used.flatMap((on, col) => (on ? [col] : []));
    return {
        rows: rows.map(row => keep.map(col => row[col] || '')),
        rowNumbers,
        columnLetters: keep.map(columnLetter),
    };
}

/** Index of the row with the column names: the first with at least two filled cells. */
export function detectHeaderRow(rows) {
    const index = rows.findIndex(row => row.filter(Boolean).length >= 2);
    return index === -1 ? 0 : index;
}

/** A name for each column: its header, or "Column C" when it has none; repeats get " (2)". */
export function columnNames(headerCells, columnLetters) {
    const seen = new Map();
    return columnLetters.map((letter, col) => {
        const base = String(headerCells[col] ?? '').replace(/\s+/g, ' ').trim() || `Column ${letter}`;
        const count = (seen.get(base.toLowerCase()) || 0) + 1;
        seen.set(base.toLowerCase(), count);
        return count === 1 ? base : `${base} (${count})`;
    });
}

function unsupported(bytes, ext) {
    if (startsWith(bytes, OLE)) {
        return ext === 'xls'
            ? `This is an old Excel 97-2003 file (.xls), which SolarFlow cannot read. ${SAVE_AS_HELP}`
            : `This file is password-protected or in an old Excel format. Remove the password (File → Info → Protect Workbook), then save it as .xlsx. ${SAVE_AS_HELP}`;
    }
    if (ext === 'xls') return `This .xls file is not a normal Excel workbook (it may be a web page saved with an Excel name). ${SAVE_AS_HELP}`;
    if (ext === 'ods') return `This is an OpenDocument (.ods) spreadsheet, which SolarFlow cannot read. In LibreOffice, choose File → Save As → Excel 2007-365 (.xlsx). ${SAVE_AS_HELP}`;
    if (ext === 'xlsb') return `This is a binary Excel workbook (.xlsb), which SolarFlow cannot read. ${SAVE_AS_HELP}`;
    if (ext === 'numbers') return 'This is an Apple Numbers file. In Numbers, choose File → Export To → Excel, then import that file.';
    if (['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png'].includes(ext)) return `This is not a spreadsheet. Choose an Excel (.xlsx) or CSV file. ${SAVE_AS_HELP}`;
    return '';
}

/**
 * Sheets of an .xlsx or CSV file: { sheets: [{ name, hidden, rows, rowNumbers, columnLetters }] }.
 * The kind is decided by the file's first bytes, then its extension.
 * Throws SpreadsheetError, worded for the user, for anything it cannot read.
 */
export async function readSpreadsheet({ name, bytes }) {
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const ext = extensionOf(name);
    if (!data.length) throw new SpreadsheetError('This file is empty.');
    if (data.length > LIMITS.fileBytes) {
        throw new SpreadsheetError(`This file is larger than ${Math.round(LIMITS.fileBytes / 1024 / 1024)} MB. Split it into smaller files, or remove pictures and extra sheets, then try again.`);
    }
    const problem = unsupported(data, ext);
    if (problem) throw new SpreadsheetError(problem);

    let sheets;
    if (startsWith(data, ZIP) || startsWith(data, EMPTY_ZIP)) {
        ({ sheets } = await readXlsx(data));
    } else {
        const text = decodeText(data);
        // A web page or XML saved with a spreadsheet name, not a CSV.
        if (/^\s*</.test(text) && !['csv', 'tsv', 'txt'].includes(ext)) {
            throw new SpreadsheetError(`This file is not an Excel workbook or a CSV file. ${SAVE_AS_HELP}`);
        }
        if (text.includes('\0')) throw new SpreadsheetError(`This file is not a spreadsheet SolarFlow can read. ${SAVE_AS_HELP}`);
        const rows = parseCsv(text, { delimiter: ext === 'tsv' ? '\t' : undefined });
        sheets = [{ name: baseName(name), hidden: false, rows, rowNumbers: null }];
    }
    return {
        sheets: sheets.map(sheet => ({ name: sheet.name, hidden: sheet.hidden, ...tidyRows(sheet.rows, sheet.rowNumbers) })),
    };
}
