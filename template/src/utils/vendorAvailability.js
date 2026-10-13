// src/utils/vendorAvailability.js
// Tracks vendor unavailability (leaves, booked out dates, maintenance)
// Persisted across vendor portal and admin project assignment.

const STORAGE_KEY = 'solarflow_vendor_unavailability_v2';
const LEGACY_STORAGE_KEY = 'solarflow_vendor_unavailability';

// Default initial sample unavailabilities spread out realistically across the calendar
// Some entries have specific reasons, while others are marked unavailable with a blank reason
const DEFAULT_UNAVAILABILITY = {
    'Vendor 1': {
        '2026-09-22': { reason: 'All teams booked at Surat project', markedAt: '2026-09-15T09:30:00.000Z' },
        '2026-09-28': { reason: '', markedAt: '2026-09-16T14:15:00.000Z' }, // Blank reason
        '2026-10-05': { reason: 'Site vehicle maintenance day', markedAt: '2026-09-16T16:00:00.000Z' },
        '2026-10-18': { reason: 'Diwali festival break', markedAt: '2026-09-12T11:00:00.000Z' }
    },
    'Vendor 2': {
        '2026-09-21': { reason: '', markedAt: '2026-09-14T12:00:00.000Z' }, // Blank reason
        '2026-09-25': { reason: 'Full capacity on Vadodara industrial site', markedAt: '2026-09-15T15:45:00.000Z' },
        '2026-10-02': { reason: 'Gandhi Jayanti Holiday', markedAt: '2026-09-10T10:20:00.000Z' },
        '2026-10-12': { reason: '', markedAt: '2026-09-16T08:30:00.000Z' } // Blank reason
    },
    'Vendor 3': {
        '2026-09-20': { reason: 'Transport truck unavailable', markedAt: '2026-09-15T13:20:00.000Z' },
        '2026-09-26': { reason: '', markedAt: '2026-09-16T17:10:00.000Z' }, // Blank reason
        '2026-10-08': { reason: 'Site crew on scheduled leave', markedAt: '2026-09-14T18:00:00.000Z' },
        '2026-10-15': { reason: '', markedAt: '2026-09-16T19:40:00.000Z' } // Blank reason
    }
};

function normalizeEntry(entry) {
    if (!entry && entry !== '') return null;
    if (typeof entry === 'object') {
        return {
            reason: String(entry.reason || '').trim(),
            markedAt: entry.markedAt || new Date().toISOString()
        };
    }
    // String legacy fallback
    return {
        reason: String(entry || '').trim(),
        markedAt: '2026-09-15T10:00:00.000Z'
    };
}

export function getAllVendorUnavailabilities() {
    if (typeof window === 'undefined') return DEFAULT_UNAVAILABILITY;
    try {
        let stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) {
            // Check legacy key
            const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
            if (legacy) {
                try {
                    const parsedLegacy = JSON.parse(legacy);
                    const migrated = {};
                    Object.entries(parsedLegacy).forEach(([vendor, dates]) => {
                        migrated[vendor] = {};
                        Object.entries(dates || {}).forEach(([d, val]) => {
                            migrated[vendor][d] = normalizeEntry(val);
                        });
                    });
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
                    return migrated;
                } catch {
                    // ignore
                }
            }
            localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_UNAVAILABILITY));
            return DEFAULT_UNAVAILABILITY;
        }
        const parsed = JSON.parse(stored) || {};
        // Ensure default vendors exist
        ['Vendor 1', 'Vendor 2', 'Vendor 3'].forEach(v => {
            if (!parsed[v]) parsed[v] = DEFAULT_UNAVAILABILITY[v] || {};
        });
        return parsed;
    } catch {
        return DEFAULT_UNAVAILABILITY;
    }
}

export function getVendorUnavailability(vendorName) {
    const all = getAllVendorUnavailabilities();
    const clean = String(vendorName || '').trim();
    return all[clean] || {};
}

export function isVendorUnavailableOn(vendorName, dateStr) {
    if (!vendorName || !dateStr) return { unavailable: false, reason: '', markedAt: null };
    const dates = getVendorUnavailability(vendorName);
    const dateFormatted = String(dateStr).slice(0, 10);
    const raw = dates[dateFormatted];
    
    if (raw === undefined || raw === null) {
        return { unavailable: false, reason: '', markedAt: null };
    }

    const normalized = normalizeEntry(raw);
    return {
        unavailable: true,
        reason: normalized?.reason || '',
        markedAt: normalized?.markedAt || null
    };
}

export function getUnavailableVendorsForDate(dateStr) {
    if (!dateStr) return [];
    const all = getAllVendorUnavailabilities();
    const dateFormatted = String(dateStr).slice(0, 10);
    const result = [];

    Object.entries(all).forEach(([vendorName, dates]) => {
        if (dates && dates[dateFormatted] !== undefined && dates[dateFormatted] !== null) {
            const entry = normalizeEntry(dates[dateFormatted]);
            result.push({
                vendor: vendorName,
                date: dateFormatted,
                reason: entry?.reason || '',
                markedAt: entry?.markedAt || null
            });
        }
    });

    return result;
}

export function setVendorDateUnavailability(vendorName, dateStr, isUnavailable, reason = '') {
    if (!vendorName || !dateStr) return;
    const all = getAllVendorUnavailabilities();
    const clean = String(vendorName).trim();
    if (!all[clean]) all[clean] = {};
    
    const dateFormatted = String(dateStr).slice(0, 10);
    const markedAt = new Date().toISOString();

    if (isUnavailable) {
        all[clean][dateFormatted] = {
            reason: String(reason || '').trim(),
            markedAt: markedAt
        };
    } else {
        delete all[clean][dateFormatted];
    }

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
        window.dispatchEvent(new CustomEvent('solarflow-vendor-availability-changed', {
            detail: { 
                vendorName: clean, 
                dateStr: dateFormatted, 
                unavailable: isUnavailable, 
                reason: String(reason || '').trim(),
                markedAt: markedAt
            }
        }));
    } catch (e) {
        console.error('Failed to save vendor availability:', e);
    }
}
