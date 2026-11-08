// Cell text -> the value SolarFlow stores for it. Pure and shared by the
// in-app importer and the agency script. Each converter returns
// { value, warning?, note? }: value null means "leave empty", a warning is
// shown on the check step, and a note is kept in the customer's remarks.

import { todayIST } from '../format.js';

const DAY_MS = 86400000;
const EMPTY_WORDS = new Set(['-', '--', '---', '.', 'na', 'n/a', 'n.a.', 'nil', 'none', 'null', 'not available']);
// What Excel writes into a CSV for a long number in a narrow column.
const EXCEL_SHORTENED = /^\d(\.\d+)?e\+\d+$/i;

/** Trimmed text; the ' that toCsv() puts before =, +, - and @ is taken off again. */
export function cleanText(raw) {
    const text = String(raw ?? '').replace(/\u00A0/g, ' ').trim();
    return /^'[=+\-@\t\r]/.test(text) ? text.slice(1) : text;
}

const isEmptyWord = text => !text || EMPTY_WORDS.has(text.toLowerCase());
const shortenedWarning = text => `"${text}" was shortened by Excel, so the full number is lost. In Excel, format the column as Number with no decimals (or as Text), save, and import again.`;

// ── Phones ───────────────────────────────────────────────────────────────

/**
 * The 10-digit form of an Indian mobile number (+91, 91, 0 and 0091 prefixes
 * dropped), or '' when it is not one. Used to find the same customer twice;
 * the agency script's SQL applies the same rule in the database.
 */
export function phoneKey(value) {
    const digits = String(value ?? '').replace(/\D/g, '');
    if (digits.length === 10) return digits;
    if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
    if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
    if (digits.length === 14 && digits.startsWith('0091')) return digits.slice(4);
    return '';
}

// "98765 43210 / 91234 56789" -> each number written in the cell.
function splitPhones(text) {
    const out = [];
    for (const chunk of text.split(/[,;/|&\n]|\bor\b|\band\b/i).map(part => part.trim()).filter(Boolean)) {
        if (phoneKey(chunk) || !/\s/.test(chunk)) { out.push(chunk); continue; }
        let current = '';
        for (const token of chunk.split(/\s+/)) {
            current = current ? `${current} ${token}` : token;
            if (phoneKey(current)) { out.push(current); current = ''; }
        }
        if (current) out.push(current);
    }
    return out;
}

export function toPhone(raw, label = 'Mobile number') {
    const text = cleanText(raw);
    if (isEmptyWord(text)) return { value: null };
    if (EXCEL_SHORTENED.test(text)) return { value: null, warning: shortenedWarning(text) };
    const parts = splitPhones(text);
    const first = phoneKey(parts[0]);
    if (first && parts.length === 1) return { value: first };
    if (first) {
        const others = parts.slice(1).map(part => phoneKey(part) || part).join(', ');
        return {
            value: first,
            note: `Other ${label.toLowerCase()} from the import: ${others}`,
            warning: `"${text}" has more than one number. ${first} was saved; the others were added to the remarks.`,
        };
    }
    return { value: text, warning: `"${text}" is not a 10-digit mobile number. It was saved as written.` };
}

// ── Numbers and amounts ──────────────────────────────────────────────────

const MULTIPLIERS = { lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5, l: 1e5, cr: 1e7, crore: 1e7, crores: 1e7, k: 1e3 };
const COUNT_UNITS = new Set(['', 'kw', 'kwp', 'wp', 'w', 'watt', 'watts', 'no', 'nos', 'pc', 'pcs', 'piece', 'pieces', 'panel', 'panels', 'module', 'modules', 'units', 'unit']);
const WATT_UNITS = new Set(['w', 'wp', 'watt', 'watts']);

/**
 * '5 kW', '1,20,000', '₹ 2,40,000/-', '2.4 lakh', '5,5' -> a number.
 * `money` allows lakh / crore / k; `kilowatts` reads '3300 W' as 3.3.
 */
export function parseNumber(raw, { money = false, kilowatts = false } = {}) {
    const text = cleanText(raw);
    if (isEmptyWord(text)) return null;
    const bare = text.toLowerCase()
        .replace(/^(₹|rs\.?|inr)\s*/, '')
        .replace(/\s*(\/-|₹|rs\.?|inr|rupees)$/, '')
        .replace(/\s+/g, ' ')
        .trim();
    const match = /^([-+]?[\d,]*\.?\d+)\s*([a-z]*)\.?$/.exec(bare);
    if (!match) return NaN;
    const [, digits, unit] = match;
    const multiplier = money && MULTIPLIERS[unit] ? MULTIPLIERS[unit] : 1;
    if (multiplier === 1 && !COUNT_UNITS.has(unit)) return NaN;
    // One comma before 1-2 final digits is a decimal comma ('5,5'); other commas group digits.
    const plain = /^\d+,\d{1,2}$/.test(digits) ? digits.replace(',', '.') : digits.replace(/,/g, '');
    let value = Number(plain) * multiplier;
    if (!Number.isFinite(value)) return NaN;
    if (kilowatts && WATT_UNITS.has(unit) && value >= 100) value /= 1000;
    return Math.round(value * 1e6) / 1e6;
}

export function toNumber(raw, options = {}) {
    const value = parseNumber(raw, options);
    if (value === null) return { value: null };
    if (Number.isNaN(value)) return { value: null, warning: `"${cleanText(raw)}" is not a number, so it was left empty.` };
    return { value };
}

// ── Dates ────────────────────────────────────────────────────────────────

const MONTHS = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
    jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
    dec: 12, december: 12,
};
// Excel day numbers for 1950-01-01 and 2099-12-31: a bare number in that
// range in a date column is an Excel date, anything else is not.
const SERIAL_MIN = 18264;
const SERIAL_MAX = 73050;

const pad = (value, length = 2) => String(value).padStart(length, '0');
const isoDay = ({ y, m, d }) => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;

/** Calendar parts of an Excel day number (1900 or 1904 system). */
export function excelSerialParts(serial, { date1904 = false } = {}) {
    let days = Math.floor(serial);
    let seconds = Math.round((serial - days) * 86400);
    if (seconds >= 86400) { days += 1; seconds = 0; }
    // Excel counts a 29 Feb 1900 that never was, so serials from 61 on start a day earlier.
    const epoch = date1904 ? Date.UTC(1904, 0, 1) : days >= 61 ? Date.UTC(1899, 11, 30) : Date.UTC(1899, 11, 31);
    const date = new Date(epoch + days * DAY_MS);
    return {
        y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate(), whole: days,
        hh: Math.floor(seconds / 3600), mm: Math.floor((seconds % 3600) / 60), ss: seconds % 60,
    };
}

/** An Excel date cell as text: '2024-03-12', '2024-03-12 10:30', or '10:30' for a time alone. */
export function excelSerialText(serial, options) {
    const parts = excelSerialParts(serial, options);
    const time = parts.hh || parts.mm || parts.ss ? `${pad(parts.hh)}:${pad(parts.mm)}${parts.ss ? `:${pad(parts.ss)}` : ''}` : '';
    if (parts.whole === 0 && time) return time;
    return time ? `${isoDay(parts)} ${time}` : isoDay(parts);
}

const validDay = ({ y, m, d }) => y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1
    && d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
const fullYear = year => (year.length === 2 ? (Number(year) < 70 ? 2000 : 1900) + Number(year) : Number(year));

const TIME_AT_END = /[\sT,]+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(am|pm)?\s*(z|[+-]\d{2}:?\d{2})?$/i;
const NUMERIC_DATE = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/;
const ISO_DATE = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/;
const DAY_MONTH_YEAR = /^(\d{1,2})(?:st|nd|rd|th)?[\s\-/.,]*([a-z]{3,9})\.?[\s\-/.,]*(\d{2}|\d{4})$/i;
const MONTH_DAY_YEAR = /^([a-z]{3,9})\.?[\s\-/.,]*(\d{1,2})(?:st|nd|rd|th)?[\s\-/.,]+(\d{2}|\d{4})$/i;

/**
 * Which way round a column's 03/04/2024-style dates are: 'dmy' (Indian,
 * the default) unless some value only makes sense month-first (04/25/2024).
 */
export function dateOrder(values) {
    let dayFirst = false;
    let monthFirst = false;
    for (const raw of values) {
        const match = NUMERIC_DATE.exec(cleanText(raw).replace(TIME_AT_END, ''));
        if (!match) continue;
        if (Number(match[1]) > 12) dayFirst = true;
        else if (Number(match[2]) > 12) monthFirst = true;
    }
    return monthFirst && !dayFirst ? 'mdy' : 'dmy';
}

/** { y, m, d, hh, mm, ss } from a date written any common way, or null. */
export function parseDate(raw, order = 'dmy') {
    let text = cleanText(raw).replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+/i, '');
    if (!text) return null;
    const compact = /^(19|20)(\d{2})(\d{2})(\d{2})$/.exec(text);
    if (compact) {
        const parts = { y: Number(compact[1] + compact[2]), m: Number(compact[3]), d: Number(compact[4]) };
        return validDay(parts) ? { ...parts, hh: 0, mm: 0, ss: 0 } : null;
    }
    if (/^\d+(\.\d+)?$/.test(text)) {
        const serial = Number(text);
        return serial >= SERIAL_MIN && serial <= SERIAL_MAX ? excelSerialParts(serial) : null;
    }
    let time = { hh: 0, mm: 0, ss: 0 };
    const clock = TIME_AT_END.exec(text);
    if (clock) {
        let hh = Number(clock[1]);
        const meridiem = (clock[4] || '').toLowerCase();
        if (meridiem === 'pm' && hh < 12) hh += 12;
        if (meridiem === 'am' && hh === 12) hh = 0;
        time = { hh, mm: Number(clock[2]), ss: Number(clock[3] || 0) };
        if (hh > 23 || time.mm > 59 || time.ss > 59) return null;
        text = text.slice(0, clock.index).trim();
    }
    let parts = null;
    let match;
    if ((match = ISO_DATE.exec(text))) {
        parts = { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
    } else if ((match = NUMERIC_DATE.exec(text))) {
        const [first, second] = [Number(match[1]), Number(match[2])];
        parts = order === 'mdy' ? { y: fullYear(match[3]), m: first, d: second } : { y: fullYear(match[3]), m: second, d: first };
    } else if ((match = DAY_MONTH_YEAR.exec(text)) && MONTHS[match[2].toLowerCase()]) {
        parts = { y: fullYear(match[3]), m: MONTHS[match[2].toLowerCase()], d: Number(match[1]) };
    } else if ((match = MONTH_DAY_YEAR.exec(text)) && MONTHS[match[1].toLowerCase()]) {
        parts = { y: fullYear(match[3]), m: MONTHS[match[1].toLowerCase()], d: Number(match[2]) };
    }
    return parts && validDay(parts) ? { ...parts, ...time } : null;
}

const notADate = text => `"${text}" is not a date SolarFlow can read (use day/month/year, like 25/03/2024), so it was left empty.`;

/** A date column value as the app stores it: 'YYYY-MM-DD'. */
export function toDate(raw, order = 'dmy') {
    const text = cleanText(raw);
    if (isEmptyWord(text)) return { value: null };
    const parts = parseDate(text, order);
    return parts ? { value: isoDay(parts) } : { value: null, warning: notADate(text) };
}

/** A moment in India time for timestamp columns (created_at): '2024-03-12T10:30:00+05:30'. */
export function toTimestamp(raw, order = 'dmy', { today = todayIST() } = {}) {
    const text = cleanText(raw);
    if (isEmptyWord(text)) return { value: null };
    const parts = parseDate(text, order);
    if (!parts) return { value: null, warning: notADate(text) };
    const day = isoDay(parts);
    const value = `${day}T${pad(parts.hh)}:${pad(parts.mm)}:${pad(parts.ss)}+05:30`;
    return day > today ? { value, warning: `${day} is in the future. Check that the date was read the right way round.` } : { value };
}

// ── Choices ──────────────────────────────────────────────────────────────

const YES = new Set(['yes', 'y', 'true', '1', 'done', 'ok', 'okay', 'haan', 'han', 'ha', 'ji', 'ji haan', 'ho', 'hoy', '✓', '✔']);
const NO = new Set(['no', 'n', 'false', '0', 'nahi', 'nahin', 'nai', 'na hai', 'not done', '✗', '✘']);

/** 'Yes' or 'No', as yes/no extra fields store them. */
export function toYesNo(raw) {
    const text = cleanText(raw);
    if (isEmptyWord(text)) return { value: null };
    const word = text.toLowerCase().replace(/[.!]+$/, '');
    if (YES.has(word)) return { value: 'Yes' };
    if (NO.has(word)) return { value: 'No' };
    return { value: null, warning: `"${text}" is not Yes or No, so it was left empty.` };
}

export const matchKey = value => cleanText(value).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036F]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** One of a dropdown field's options (any case or spacing), or the text as written with a warning. */
export function toOption(raw, options, label) {
    const text = cleanText(raw);
    if (isEmptyWord(text)) return { value: null };
    const key = matchKey(text);
    const option = (options || []).find(item => matchKey(item) === key);
    if (option) return { value: option };
    return { value: text, warning: `"${text}" is not one of the choices for ${label}. It was saved as written; pick a choice later.` };
}

/** 'Loan' or 'Cash', limited to the payment types this client uses. */
export function toPaymentType(raw, allowed = ['Loan', 'Cash']) {
    const text = cleanText(raw);
    if (isEmptyWord(text)) return { value: null };
    const key = matchKey(text);
    const kind = /\b(loan|financ\w*|emi|bank)\b/.test(key) ? 'Loan'
        : /\b(cash|self|own|upi|online|cheque|check|neft|rtgs|imps|full payment|upfront|direct)\b/.test(key) ? 'Cash' : null;
    if (!kind) return { value: null, warning: `"${text}" is not Loan or Cash, so the payment type was left empty.` };
    if (!allowed.includes(kind)) return { value: null, warning: `"${text}" is a ${kind.toLowerCase()} payment, but this business only takes ${allowed.join(' and ').toLowerCase()} payments. The payment type was left empty.` };
    return { value: kind };
}

// ── Text-like columns ────────────────────────────────────────────────────

export function toText(raw, { max } = {}) {
    const text = cleanText(raw);
    if (!text) return { value: null };
    if (max && text.length > max) return { value: text.slice(0, max), warning: `This was longer than ${max} characters and was cut short.` };
    return { value: text };
}

export function toEmail(raw) {
    const text = cleanText(raw);
    if (isEmptyWord(text)) return { value: null };
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? { value: text } : { value: text, warning: `"${text}" does not look like an email address. It was saved as written.` };
}

export function toPincode(raw) {
    const text = cleanText(raw);
    if (isEmptyWord(text)) return { value: null };
    const digits = text.replace(/[\s-]/g, '');
    return /^\d{6}$/.test(digits) ? { value: digits } : { value: text, warning: `"${text}" is not a 6-digit pincode. It was saved as written.` };
}

/** Electricity consumer numbers keep letters some DISCOMs use; spaces and dashes in a number go. */
export function toConsumerNumber(raw) {
    const text = cleanText(raw);
    if (isEmptyWord(text)) return { value: null };
    if (EXCEL_SHORTENED.test(text)) return { value: null, warning: shortenedWarning(text) };
    return { value: /^[\d\s-]+$/.test(text) ? text.replace(/[\s-]/g, '') : text };
}

/** Consumer number as compared for duplicates (case, spacing and leading zeros ignored); '' when too short to trust. */
export function consumerKey(value) {
    const key = String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^0+/, '');
    return key.length >= 4 ? key : '';
}
