// Data Exports: which projects a date range picks, and the file's columns.
// Pure, so they can be tested without a database.

import { CUSTOM_FIELDS, STAGE_IDS, isStageEnabled, stageLabel } from '../config/index.js';

// Projects are picked by registration date. Without a Registration stage
// nothing records one, so they are picked by the day they were added.
export const exportsByRegistration = () => isStageEnabled(STAGE_IDS.REGISTRATION);

const PREFERRED = ['registration_date', 'registration_no', 'customer_name', 'phone_number', 'consumer_no', 'stage', 'system_capacity_kwp', 'channel_partner', 'sub_channel_partner', 'village', 'district', 'created_at', 'updated_at'];
const SKIPPED = new Set(['deleted_at', 'custom_fields']);

const titleCase = key => key.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());

const nextDay = day => {
    const [year, month, date] = day.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, date + 1)).toISOString().slice(0, 10);
};

/** The first and last day ('YYYY-MM-DD') of a reporting period. */
export function exportRange(mode, { day, month, year, start, end }) {
    if (mode === 'daily') return { start: day, end: day };
    if (mode === 'monthly') {
        const [selectedYear, selectedMonth] = month.split('-').map(Number);
        const last = new Date(Date.UTC(selectedYear, selectedMonth, 0)).getUTCDate();
        return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, '0')}` };
    }
    if (mode === 'yearly') return { start: `${year}-01-01`, end: `${year}-12-31` };
    return { start, end };
}

const DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** True when both ends are full dates and the range runs forwards. */
export const isValidRange = range => DAY.test(range?.start || '') && DAY.test(range?.end || '') && range.start <= range.end;

/**
 * The column and bounds (start included, end excluded) that pick the projects
 * of the days `from` to `to`: registration dates, or, without a Registration
 * stage, the time they were added, read in IST.
 */
export function exportDateFilter(from, to) {
    if (exportsByRegistration()) return { field: 'registration_date', start: from, end: nextDay(to) };
    return { field: 'created_at', start: `${from}T00:00:00+05:30`, end: `${nextDay(to)}T00:00:00+05:30` };
}

/** Built-in columns in a useful order, then every extra field, labelled as the client named it. Stages show their names. */
export function exportColumns(rows) {
    const found = new Set(rows.flatMap(row => Object.keys(row)));
    const builtIn = [...PREFERRED.filter(key => found.has(key)), ...[...found].filter(key => !PREFERRED.includes(key) && !SKIPPED.has(key)).sort()];
    const customKeys = new Set(rows.flatMap(row => Object.keys(row.custom_fields || {})));
    const configured = CUSTOM_FIELDS.map(field => field.key);
    const custom = [...configured, ...[...customKeys].filter(key => !configured.includes(key)).sort()]
        .map(key => ({ key: `custom_fields.${key}`, label: CUSTOM_FIELDS.find(field => field.key === key)?.label || titleCase(key), get: row => row.custom_fields?.[key] }));
    return [
        ...builtIn.map(key => (key === 'stage' ? { key, label: 'Stage', get: row => stageLabel(row.stage) } : { key, label: titleCase(key) })),
        ...custom,
    ];
}
