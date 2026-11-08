// CSV text -> rows of cells (RFC 4180), as Excel, Google Sheets and
// LibreOffice write it. Pure: no DOM and no Node APIs.

import { SpreadsheetError, LIMITS, tooManyRows } from './errors.js';

const DELIMITERS = [',', ';', '\t'];
const SAMPLE_LINES = 20;

/**
 * The delimiter the file uses. Excel saves ';' in locales where ',' is the
 * decimal mark, and "Unicode text" is tab-separated. The header line decides:
 * of the candidates it contains, the one that splits the most of the next
 * lines into the same number of cells wins.
 */
export function detectDelimiter(text) {
    const lines = sampleLines(String(text ?? ''), SAMPLE_LINES);
    let best = ',';
    let bestScore = -1;
    for (const delimiter of DELIMITERS) {
        const counts = lines.map(line => countOutsideQuotes(line, delimiter));
        if (!counts.length || counts[0] === 0) continue;
        const score = counts.filter(count => count === counts[0]).length * 1000 + counts[0];
        if (score > bestScore) { best = delimiter; bestScore = score; }
    }
    return best;
}

// The first non-blank lines, keeping a quoted line break inside its line.
function sampleLines(text, max) {
    const lines = [];
    let start = 0;
    let quoted = false;
    for (let i = 0; i < text.length && lines.length < max; i += 1) {
        const ch = text[i];
        if (ch === '"') quoted = !quoted;
        else if ((ch === '\n' || ch === '\r') && !quoted) {
            if (text.slice(start, i).trim()) lines.push(text.slice(start, i));
            start = i + 1;
        }
    }
    if (lines.length < max && text.slice(start).trim()) lines.push(text.slice(start));
    return lines;
}

function countOutsideQuotes(line, delimiter) {
    let count = 0;
    let quoted = false;
    for (const ch of line) {
        if (ch === '"') quoted = !quoted;
        else if (ch === delimiter && !quoted) count += 1;
    }
    return count;
}

/**
 * Rows of cells. A cell that starts with a quote may hold the delimiter, line
 * breaks and "" (one quote); a quote anywhere else is plain text. Accepts
 * CRLF, LF or CR line ends and a leading BOM. Blank records (",,,," or an
 * empty line) are left out. A file with more than `maxRows` rows that hold a
 * value (room is left for title rows) is refused rather than half read.
 */
export function parseCsv(input, options) {
    return parseCsvRows(input, options).rows;
}

/**
 * parseCsv, plus the record number of each row kept (1 = the first record),
 * so messages can say "row 57" and mean line 57 even after blank lines.
 */
export function parseCsvRows(input, { delimiter, maxRows = LIMITS.rows + 20 } = {}) {
    const text = String(input ?? '').replace(/^\uFEFF/, '');
    const sep = delimiter || detectDelimiter(text);
    const n = text.length;
    const rows = [];
    const rowNumbers = [];
    let record = 0;
    let row = [];
    let i = 0;
    // Index of the next delimiter or line end at or after `from`.
    const cellEnd = from => {
        let k = from;
        while (k < n && text[k] !== sep && text[k] !== '\n' && text[k] !== '\r') k += 1;
        return k;
    };

    while (i < n) {
        let cell;
        if (text[i] === '"') {
            cell = '';
            let j = i + 1;
            for (;;) {
                const close = text.indexOf('"', j);
                if (close === -1) {
                    throw new SpreadsheetError(`Row ${record + 1} has a quote mark (") that is never closed, so the rest of the file cannot be read. Open the file in Excel and save it again as CSV.`);
                }
                cell += text.slice(j, close);
                if (text[close + 1] === '"') { cell += '"'; j = close + 2; continue; }
                j = close + 1;
                break;
            }
            // Text after the closing quote is kept, as spreadsheet apps do.
            const end = cellEnd(j);
            cell += text.slice(j, end);
            i = end;
        } else {
            const end = cellEnd(i);
            cell = text.slice(i, end);
            i = end;
        }
        row.push(cell);
        if (i < n && text[i] === sep) {
            i += 1;
            if (i === n) row.push('');
            else continue;
        }
        record += 1;
        // Excel saves rows it once formatted as ",,,,". They are not customers,
        // so they neither count toward the limit nor take memory (an .xlsx
        // likewise only lists rows with a value).
        if (row.some(cell => cell.trim())) {
            rows.push(row);
            rowNumbers.push(record);
            if (rows.length > maxRows) throw tooManyRows();
        }
        row = [];
        if (i < n) i += text[i] === '\r' && text[i + 1] === '\n' ? 2 : 1;
    }
    return { rows, rowNumbers };
}
