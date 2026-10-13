// "Not available" days that vendors add to the shared calendar (calendar_events
// rows with kind 'unavailable'), used to warn before a delivery is booked.
import { supabase } from '../supabase';

// ilike without wildcards: a case-insensitive exact match on the name.
const exactName = name => String(name || '').trim().replace(/[\\%_]/g, ch => `\\${ch}`);

/** Unavailable entries for `vendorName` that overlap fromISO..toISO ('YYYY-MM-DD'), oldest first. */
export async function vendorUnavailableInRange(vendorName, fromISO, toISO = fromISO) {
    const name = exactName(vendorName);
    const from = String(fromISO || '').slice(0, 10);
    const to = String(toISO || from).slice(0, 10);
    if (!name || !from) return [];
    const { data, error } = await supabase
        .from('calendar_events')
        .select('id, title, notes, starts_on, ends_on, created_at')
        .eq('kind', 'unavailable')
        .ilike('vendor_name', name)
        .lte('starts_on', to)
        .or(`ends_on.gte.${from},and(ends_on.is.null,starts_on.gte.${from})`)
        .order('starts_on');
    if (error) throw error;
    return data || [];
}

/** { unavailable, reason, markedAt } for one vendor on one day. A failed lookup counts as available. */
export async function isVendorUnavailableOn(vendorName, dateISO) {
    try {
        const [entry] = await vendorUnavailableInRange(vendorName, dateISO);
        if (!entry) return { unavailable: false, reason: '', markedAt: null };
        return { unavailable: true, reason: entry.notes || entry.title || '', markedAt: entry.created_at };
    } catch (error) {
        console.error('Could not check vendor availability:', error);
        return { unavailable: false, reason: '', markedAt: null };
    }
}
