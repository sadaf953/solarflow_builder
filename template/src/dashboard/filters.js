// Filters shared by every Dashboard customer read. Pure, so they can be tested
// without a database.

import { getMonthBounds, monthKey } from '../lib/format.js';
import { STAGE_IDS } from '../config/index.js';

// ilike without wildcards: an exact match that ignores case.
export const exactLike = value => String(value).trim().replace(/[\\%_]/g, ch => `\\${ch}`);

/** Adds the header's channel partner and dealer filters to a customer query. */
export function scopeCustomers(query, { channelPartner, dealer } = {}) {
    let scoped = query;
    if (channelPartner?.trim()) scoped = scoped.ilike('channel_partner', exactLike(channelPartner));
    if (dealer?.trim()) scoped = scoped.ilike('sub_channel_partner', exactLike(dealer));
    return scoped;
}

/** 'YYYY-MM' for a month filter value: 'this-month', 'last-month' or '01'…'12' (in `year`, else this year). */
export function monthFilterValue(month, year, now = new Date()) {
    if (!month) return '';
    const current = monthKey(now);
    if (month === 'this-month') return current;
    if (month === 'last-month') {
        const [y, m] = current.split('-').map(Number);
        return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
    }
    return /^\d{2}$/.test(month) ? `${year || current.slice(0, 4)}-${month}` : '';
}

/**
 * Date filters for a stage list. Leads are dated by when they were added
 * (a timestamp, read in IST); every other stage by its registration date.
 * The month filter is offered on Leads and Registration only.
 */
export function stageDateFilters(stageId, { year = '', month = '' } = {}, now = new Date()) {
    const isLeads = stageId === STAGE_IDS.LEADS;
    const field = isLeads ? 'created_at' : 'registration_date';
    const ranges = [];
    if (/^\d{4}$/.test(year)) {
        const next = Number(year) + 1;
        ranges.push(isLeads
            ? { start: `${year}-01-01T00:00:00+05:30`, end: `${next}-01-01T00:00:00+05:30` }
            : { start: `${year}-01-01`, end: `${next}-01-01` });
    }
    if (month && (isLeads || stageId === STAGE_IDS.REGISTRATION)) {
        const bounds = getMonthBounds(monthFilterValue(month, year, now), isLeads);
        if (bounds) ranges.push(bounds);
    }
    return ranges.map(range => ({ field, ...range }));
}
