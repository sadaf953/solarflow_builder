// Limits and the error the importer shows to the user as it is.

export const LIMITS = Object.freeze({
    // Customer rows in one import (the header row is not counted).
    rows: 20000,
    columns: 300,
    // Bytes of the file itself, and of everything unzipped from an .xlsx.
    fileBytes: 60 * 1024 * 1024,
    inflatedBytes: 60 * 1024 * 1024,
});

/** A problem with the file, worded for the person who chose it. */
export class SpreadsheetError extends Error {
    constructor(message) {
        super(message);
        this.name = 'SpreadsheetError';
    }
}

export const tooManyRows = () => new SpreadsheetError(
    `This file has too many rows: SolarFlow imports up to ${LIMITS.rows.toLocaleString('en-IN')} customers at a time. Split it into smaller files and import them one after another.`,
);

export const SAVE_AS_HELP = 'Open it in Excel and choose File → Save As → Excel Workbook (.xlsx), or CSV. In Google Sheets, choose File → Download → Microsoft Excel (.xlsx).';
