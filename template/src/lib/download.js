// CSV building and browser downloads.

function csvCell(value) {
    if (value == null) return '""';
    let text = typeof value === 'object' ? JSON.stringify(value) : String(value);
    // Spreadsheet apps run text starting with these characters as a formula.
    if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
}

/**
 * CSV text for `rows`. Each column is { key, label, get? }; `get(row)` wins
 * over `row[key]`. Starts with a BOM so Excel reads ₹ and Hindi correctly.
 */
export function toCsv(rows, columns) {
    const header = columns.map(column => csvCell(column.label ?? column.key)).join(',');
    const lines = (rows || []).map(row => columns
        .map(column => csvCell(column.get ? column.get(row) : row?.[column.key]))
        .join(','));
    return '﻿' + [header, ...lines].join('\r\n');
}

/** Saves `content` (string, Blob or bytes) as `filename`. */
export function downloadBlob(content, type, filename) {
    const url = URL.createObjectURL(content instanceof Blob ? content : new Blob([content], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Revoking straight away can cancel the download in Safari and Firefox.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
