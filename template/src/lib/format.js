// Display formatting shared by the app and the builder. Amounts use Indian
// grouping (1,23,456) and dates are read in Asia/Kolkata, whatever timezone
// the device is set to.

export const TIME_ZONE = 'Asia/Kolkata';
export const EMPTY = '–';
export const MONTH_NAMES = Object.freeze([
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
]);

const isBlank = value => value == null || String(value).trim() === '';
// Amounts are often stored as text with commas ('1,20,000').
const toNumber = value => (typeof value === 'number' ? value : Number(String(value ?? '').replace(/,/g, '').trim()));

/** Indian commas without the ₹ sign: 123456 → '1,23,456'. Empty or invalid → ''. */
export function toIndianCommas(val) {
    const n = Number(String(val).replace(/,/g, ''));
    if (isNaN(n) || val === '' || val == null) return '';
    const [intPart, decPart] = n.toString().split('.');
    const lastThree = intPart.slice(-3);
    const rest = intPart.slice(0, -3);
    const formatted = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + (rest ? ',' : '') + lastThree;
    return decPart !== undefined ? `${formatted}.${decPart}` : formatted;
}

/** '₹1,23,456'. Empty or invalid → '–'; zero → `zero` ('–' by default, or '₹0'). */
export function formatINR(value, { zero = EMPTY } = {}) {
    if (isBlank(value)) return EMPTY;
    const n = toNumber(value);
    if (!Number.isFinite(n)) return EMPTY;
    if (n === 0) return zero;
    return '₹' + toIndianCommas(n);
}

/** Whole-number counts with Indian grouping; anything invalid counts as 0. */
export function formatCount(value) {
    const n = toNumber(value);
    return (Number.isFinite(n) ? n : 0).toLocaleString('en-IN');
}

/** '3.24 kWp'. Empty, zero or invalid → '–'. */
export function formatKwp(value) {
    const n = isBlank(value) ? NaN : toNumber(value);
    if (!Number.isFinite(n) || n === 0) return EMPTY;
    return `${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })} kWp`;
}

const DATE_VARIANTS = {
    numeric: {},                                                    // 1/10/2026
    dmy: { day: '2-digit', month: '2-digit', year: 'numeric' },     // 01/10/2026
    short: { day: 'numeric', month: 'short', year: 'numeric' },     // 1 Oct 2026
    long: { day: 'numeric', month: 'long', year: 'numeric' },       // 1 October 2026
    datetime: { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }, // 01 Oct, 02:30 pm
};
const dateFormatters = {};
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function toDate(value) {
    if (value instanceof Date) return value;
    // A bare date is a calendar day in India, not midnight UTC.
    const text = String(value).trim();
    return new Date(DATE_ONLY.test(text) ? `${text}T00:00:00+05:30` : text);
}

/** Formats a date or timestamp in IST. Empty → ''; unparseable input is returned as text. */
export function formatDate(value, variant = 'numeric') {
    if (isBlank(value)) return '';
    const date = toDate(value);
    if (Number.isNaN(date.getTime())) return String(value);
    const key = DATE_VARIANTS[variant] ? variant : 'numeric';
    dateFormatters[key] ||= new Intl.DateTimeFormat('en-IN', { timeZone: TIME_ZONE, ...DATE_VARIANTS[key] });
    return dateFormatters[key].format(date);
}

/** Today (or `date`) as 'YYYY-MM-DD' in IST. Avoids the UTC date being a day behind before 5:30 AM. */
export function todayIST(date = new Date()) {
    try {
        return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(date);
    } catch {
        return date.toISOString().split('T')[0];
    }
}

/** 'YYYY-MM' for a date, timestamp or 'YYYY-MM-DD' string (IST). Invalid → ''. */
export function monthKey(value = new Date()) {
    if (isBlank(value)) return '';
    if (typeof value === 'string' && /^\d{4}-\d{2}(-\d{2})?$/.test(value.trim())) return value.trim().slice(0, 7);
    const date = toDate(value);
    return Number.isNaN(date.getTime()) ? '' : todayIST(date).slice(0, 7);
}

/**
 * Half-open range for a 'YYYY-MM' month: { start, end } where end is the first
 * day of the next month. With `timestamp`, both ends are IST midnights.
 */
export function getMonthBounds(monthValue, timestamp = false) {
    if (!/^\d{4}-\d{2}$/.test(monthValue || '')) return null;
    const [year, month] = monthValue.split('-').map(Number);
    const nextYear = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    const next = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
    return timestamp
        ? { start: `${monthValue}-01T00:00:00+05:30`, end: `${next}T00:00:00+05:30` }
        : { start: `${monthValue}-01`, end: next };
}

/** Indian mobile number as 10 digits; drops a +91 or leading 0 from pasted numbers. */
export function cleanPhone(value) {
    let digits = String(value ?? '').replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
    else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
    return digits.slice(0, 10);
}

/** Read-only text for a config field value ({key,label,type}). Empty → '–'. */
export function formatFieldValue(field, value) {
    if (value === true) return 'Yes';
    if (value === false) return 'No';
    if (isBlank(value)) return EMPTY;
    switch (field?.type) {
        case 'money': return formatINR(value, { zero: '₹0' });
        case 'number': return Number.isFinite(toNumber(value)) ? toNumber(value).toLocaleString('en-IN') : String(value);
        case 'date': return formatDate(value, 'short');
        case 'file': return typeof value === 'object' ? value.name || value.file_name || 'Uploaded' : String(value);
        default: return typeof value === 'object' ? JSON.stringify(value) : String(value);
    }
}
