// ─── utils.jsx ────────────────────────────────────────────────────────────────
// Pure utility functions - no UI, no React state.
// ──────────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase';
import { PRIMARY_STAGES, SUBSIDY_TAGS, LOAN_TAGS, ADMIN_COLUMNS, ADMIN_NUMERIC_COLUMNS } from './constants';

// ─── Activity Logging ─────────────────────────────────────────────────────────
export async function logActivity(
    userId,
    action,
    message,
    details = '',
    customerId = null
) {
    if (customerId && String(customerId).startsWith('demo-')) return;
    
    // UUID validation regex
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (userId && !uuidRegex.test(userId)) {
        console.warn('Skipping activity log: invalid user_id UUID (likely a fake test login)');
        return;
    }
    if (customerId && !uuidRegex.test(customerId)) {
        console.warn('Skipping activity log: invalid customer_id UUID');
        return;
    }

    try {
        const { error } = await supabase
            .from('activity_log')
            .insert({
                user_id: userId,
                customer_id: customerId,
                action,
                message,
                new_value: details,
                created_at: new Date().toISOString(),
            });

        if (error) {
            console.error('Activity log error:', error);
        }
    } catch (e) {
        console.error('Activity log error:', e);
    }
}

// ─── Metadata Hook ────────────────────────────────────────────────────────────
// Fetches the 'metadata' table once and returns a grouped object like:
// { company_branch: ['Delhi', 'Mumbai'], poc: ['Alice', 'Bob'], ... }
import { useState, useEffect } from 'react';

export function useMetadata() {
    const [meta, setMeta] = useState({});
    useEffect(() => {
        supabase.from('metadata').select('category, label').then(({ data }) => {
            if (!data) return;
            const grouped = {};
            data.forEach(({ category, label }) => {
                if (!grouped[category]) grouped[category] = [];
                grouped[category].push(label);
            });
            setMeta(grouped);
        });
    }, []);
    return meta;
}

// ─── Safe writes to the `admin` table ────────────────────────────────────────

// Drop any key that is not a real `admin` column. One unknown key makes
// PostgREST reject the whole update (42703), so a single stale field used to
// break every save on the record rather than just that field.
export function sanitizeAdminUpdate(updates) {
    const clean = {};
    const dropped = [];
    Object.keys(updates || {}).forEach(key => {
        if (ADMIN_COLUMNS.has(key)) clean[key] = updates[key];
        else dropped.push(key);
    });
    if (dropped.length > 0) {
        console.warn(
            '[sanitizeAdminUpdate] Dropped key(s) that are not columns on `admin`:',
            dropped,
            '- if one of these is a NEW column, add it to ADMIN_COLUMNS in constants.js.'
        );
    }
    return clean;
}

// Only the fields that actually changed, so a stage advance writes 2 columns
// instead of re-writing all ~89. Objects/arrays are compared by value.
export function diffAdminUpdates(original, edited) {
    const patch = {};
    Object.keys(edited || {}).forEach(key => {
        const before = original ? original[key] : undefined;
        const after = edited[key];
        const changed = (before && typeof before === 'object') || (after && typeof after === 'object')
            ? JSON.stringify(before ?? null) !== JSON.stringify(after ?? null)
            : before !== after;
        if (changed) patch[key] = after;
    });
    return patch;
}

// Normalise values that Postgres rejects as empty strings. Numeric and date
// columns both reject '', and one bad value fails the WHOLE update - losing
// every other field in the same save.
export function normalizeAdminValues(updates) {
    const clean = { ...updates };
    Object.keys(clean).forEach(key => {
        if ((key === 'date' || key.endsWith('_date')) && clean[key] === '') clean[key] = null;
    });
    ADMIN_NUMERIC_COLUMNS.forEach(field => {
        if (clean[field] === undefined) return;
        if (clean[field] === '' || clean[field] === null) { clean[field] = null; return; }
        // parseIndianNumber returns '' (not NaN) for unparseable input.
        const parsed = parseIndianNumber(clean[field]);
        clean[field] = (parsed === '' || Number.isNaN(parsed)) ? null : parsed;
    });

    // A phone field holding only '+' or '' is not a number - store NULL.
    // sanitizePhoneNumber deliberately lets a lone '+' survive so it can be
    // TYPED (a controlled input that erased it would make +91 impossible to
    // enter), but it must never reach the column: the CHECK constraint
    // admin_phone_number_format requires at least one digit after the +.
    ['phone_number', 'driver_phone_number'].forEach(field => {
        if (clean[field] === undefined) return;
        const v = String(clean[field] ?? '').trim();
        if (v === '' || v === '+') clean[field] = null;
    });

    return clean;
}

// The one safe way to write to `admin`.
//
// Vendor and Stamp portals wrote directly with none of the protections the main
// portal has, so they were still exposed to every bug class already fixed
// elsewhere: unknown columns rejecting the whole update, '' reaching a numeric
// or date column, and an RLS-refused write returning 0 rows with no error and
// reporting success.
//
// Returns { ok, error }. `ok: false` with no error means the row was not
// matched - refused by RLS, or it no longer exists.
// ─── The write guard every table needs ────────────────────────────────────────
// supabase-js never throws, and an UPDATE/DELETE refused by RLS matches ZERO
// rows while returning `error: null`. "No error" has never been proof of a save.
// `admin` had this covered by updateAdminRecord; every other table - profiles,
// vendors, drivers, metadata, delivery_batches, bom_items, documents - was
// checking `error` alone and reporting success over writes the database
// silently declined.
//
// Pass a builder that ALREADY has .select(...) on it, so the row count exists
// to be checked:
//
//     const res = await runWrite(
//         supabase.from('demo_profiles').update({ name }).eq('id', id).select('id'),
//         { action: 'name change' }
//     );
//     if (!res.ok) throw res.error;
//
// `expectRows: false` is for INSERTs where matching nothing is legitimate.
// `meter_installation` is a plain 'Yes' / 'No' string. One stage-advance path
// used to seed it as { status, no_date, yes_date } instead, and the three places
// that READ it all compare against the string - so on arrival at Meter
// Installation neither button rendered as selected, the mandatory date field
// never appeared, and the stage could not be completed. 2 rows are stored in the
// object form; normalising on read lets them heal on the next save.
// Phone numbers, one rule for every entry point.
//
// Accepts a plain 10-digit local number OR an international form with a leading
// "+" (e.g. +910000000000). Everything that is not a digit or a leading + is
// stripped as you type, so spaces, dashes and brackets pasted from a contact
// list are cleaned rather than rejected.
//
// Kept in sync with the database CHECK constraint admin_phone_number_format:
//     phone_number IS NULL OR phone_number ~ '^\+?[0-9]{1,15}$'
// If you loosen one, loosen the other, or a user gets a database error for
// something the form let them type.
export function sanitizePhoneNumber(value) {
    const raw = String(value ?? '');
    const hasPlus = raw.trim().startsWith('+');
    const digits = raw.replace(/\D/g, '');

    if (hasPlus) {
        // International: keep up to the E.164 maximum of 15 digits.
        return digits.length ? `+${digits.slice(0, 15)}` : '+';
    }

    // Local: a leading 0 on an 11-digit entry is the trunk prefix - drop it.
    if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
    return digits.slice(0, 10);
}

export function getTelephoneHref(value) {
    const raw = String(value ?? '').trim();
    const normalized = raw.replace(/[^\d+]/g, '');
    return normalized && /\d/.test(normalized) ? `tel:${normalized}` : null;
}

export function normalizeMeterInstallation(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return value.status || '';
    const str = String(value).trim();
    if (str.startsWith('{')) {
        try { return (JSON.parse(str) || {}).status || ''; } catch { return ''; }
    }
    return str;
}

export async function runWrite(builder, { action = 'change', expectRows = true } = {}) {
    const { data, error } = await builder;

    if (error) return { ok: false, rows: [], error };

    if (expectRows && (!data || (Array.isArray(data) && data.length === 0))) {
        return {
            ok: false,
            rows: [],
            error: new Error(
                `The database did not accept the ${action} - nothing was saved. `
                + 'Your account may not have permission, or the record no longer exists.'
            ),
        };
    }

    return { ok: true, rows: Array.isArray(data) ? data : [data].filter(Boolean), error: null };
}

export async function updateAdminRecord(id, updates) {
    const clean = normalizeAdminValues(sanitizeAdminUpdate(updates));
    delete clean.id; delete clean.created_at; delete clean.updated_at;

    if (Object.keys(clean).length === 0) return { ok: true, error: null, skipped: true };

    const { data, error } = await supabase
        .from('admin').update(clean).eq('id', id).select('id');

    if (error) return { ok: false, error };
    if (!data || data.length === 0) {
        return {
            ok: false,
            error: new Error('The database did not accept the change - your account may not have permission to edit this record, or it no longer exists.'),
        };
    }
    return { ok: true, error: null };
}

// ─── CSV Export ───────────────────────────────────────────────────────────────
export function exportAllToCSV(customers) {
    if (!customers || customers.length === 0) {
        alert('No customer records available to export.');
        return;
    }

    const currentDateStr = new Date().toISOString().split('T')[0];
    const currentTimestampStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    // Sort numerically by File / Folder Number (with unassigned at the end)
    const sortedCustomers = [...customers].sort((a, b) => {
        const parseNo = (val) => {
            if (val === null || val === undefined || val === '') return Infinity;
            const n = Number(String(val).replace(/[^0-9.]/g, ''));
            return isNaN(n) ? Infinity : n;
        };
        const numA = parseNo(a.folder_no);
        const numB = parseNo(b.folder_no);
        if (numA !== numB) return numA - numB;
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });

    const escapeCSV = (val) => {
        if (val === null || val === undefined) return '""';
        let str = typeof val === 'object' ? JSON.stringify(val) : String(val);
        // Prevent CSV Formula Injection
        if (/^[=+\-@]/.test(str)) {
            str = "'" + str;
        }
        // Escape double quotes and wrap in quotes
        return `"${str.replace(/"/g, '""')}"`;
    };

    const yn = (val) => val === true ? 'Yes' : val === false ? 'No' : (val || '');

    const asObj = (val) => {
        if (!val) return {};
        if (typeof val === 'object') return val;
        try { return JSON.parse(val) || {}; } catch { return {}; }
    };
    const asArr = (val) => {
        if (!val) return [];
        if (Array.isArray(val)) return val;
        if (typeof val === 'string') {
            try { const parsed = JSON.parse(val); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
        }
        return [];
    };
    // stages_remarks is a { STAGE_ID: 'remark' } map - flatten to one cell
    const flattenStageRemarks = (val) => Object.entries(asObj(val))
        .filter(([key, text]) => key !== 'discom_agreement_date' && String(text || '').trim())
        .map(([key, text]) => `${PRIMARY_STAGES.find(st => st.id === key)?.label || key}: ${text}`)
        .join(' | ');
    // loan_history / subsidy_history are [{ status, date, remark }] - flatten to one cell
    const flattenHistory = (val) => asArr(val)
        .map(e => [e?.date, e?.status, e?.remark].filter(Boolean).join(' - '))
        .filter(Boolean)
        .join(' | ');

    const headers = [
        'Export Date',
        'File No (Folder No)',
        'Customer Name',
        'Phone Number',
        'Email Address',
        'Consumer No',
        'Villages / Address',
        'Sub Division',
        'Channel Partner',
        'Dealer',
        'Current Stage',
        'Payment Type',
        'System Capacity (kWp)',
        'Module Brand',
        'Module Wp',
        'Number of Modules',
        'Registration Date',
        'Registration By',
        'Registration No',
        'Feasibility No',
        'Jansamarth Application No',
        'Aadhaar Card Front',
        'Aadhaar Card Back',
        'PAN Card',
        'Index-2',
        'Light Bill',
        'Bank Details',
        'House Geo Tag Photo',
        'Extra Docs',
        'Feasibility Document',
        'Subsidy Token Photo',
        'Application Acknowledgment',
        'Vendor Feasibility',
        'Site Feasibility',
        'Digital Certificate',
        'Loan Tag',
        'Cash Total Amount (₹)',
        'Roof / Shed',
        'DC Cable (m)',
        'AC Cable (m)',
        'Structure Front Leg Height',
        'Structure Rear Leg Height',
        'Invoice No',
        'Invoice Value (₹)',
        'Material Order Notes',
        'Inverter Make',
        'Inverter Serial No',
        'Panel Serial Numbers',
        'Vendor',
        'Driver Name',
        'Driver Phone Number',
        'Vehicle Number',
        'Material Delivery Date',
        'Delivery Status',
        'Vendor Payment Status',
        'Vendor Quote (₹)',
        'Vendor Paid Date',
        'Installation Status',
        'Installation Date',
        'Installation Note',
        'Geo Tag Status',
        'Meter Installation',
        'Discom Inspection',
        'PM Surya Ghar Stamp',
        'Subsidy Tag',
        'Warranty Card',
        'Insurance Status',
        'Lost Project',
        'Internal Remarks',
        'Stage Remarks',
        'Created At',
        'Updated At',
        // ── Previously missing columns ──────────────────────────────────
        'Vendor Note / Give-up Reason',
        'Vendor Give-Up Approved',
        'Vendor Paid By',
        'Delivery Batch No',
        'DCR Certificate',
        'Signature Pic',
        'Stamp',
        'SFDC Photo',
        'Meter Installation Photo',
        'Geo Tag Image',
        'Discom Submitted By',
        'Discom Submission Date',
        'Agreement First Party',
        'Agreement Second Party',
        'Agreement Purchased Party',
        'Agreement Execution Date',
        'Stamp Value',
        'Stamp Description',
        'Sent to Stamp Maker',
        'Sent to Stamp Maker By',
        'Stamp Sent',
        'Stamp Approved',
        'Stamp Approved By',
        'Stamp Completed At',
        'Stamp Completed By',
        'Stamp Remark',
        'Stamp Send-back Remark',
        'Stamp Send-back By',
        'Loan History',
        'Subsidy History'
    ];

    const rows = sortedCustomers.map(c => {
        const stageLabel = PRIMARY_STAGES.find(s => s.id === c.stage)?.label || c.stage || '';
        const subsidyLabel = SUBSIDY_TAGS.find(f => f.id === c.subsidy_tag)?.label || c.subsidy_tag || '';
        const loanLabel = LOAN_TAGS.find(f => f.id === c.loan_tag)?.label || c.loan_tag || '';
        const panelSerials = Array.isArray(c.panel_serial_no)
            ? c.panel_serial_no.filter(Boolean).join('; ')
            : (c.panel_serial_no || '');
        const ds = asObj(c.discom_submission);
        const sr = asObj(c.stages_remarks);

        return [
            currentTimestampStr,
            c.folder_no || '',
            c.customer_name || '',
            c.phone_number || '',
            c.email_address || '',
            c.consumer_no || '',
            c.villages || '',
            c.sub_divisions || '',
            c.channel_partner || '',
            c.sub_channel_partner || '',
            stageLabel,
            c.payment_type || '',
            c.system_capacity_kwp || '',
            c.module_brand || '',
            c.module_wp || '',
            c.no_of_modules || '',
            c.registration_date || '',
            c.registration_by || '',
            c.registration_no || '',
            c.feasibility_no || '',
            c.jansamarth_application_no || '',
            yn(c.adhaar_card_front),
            yn(c.adhaar_card_back),
            yn(c.pan_card),
            yn(c.index_2),
            yn(c.light_bill),
            yn(c.bank_details),
            yn(c.house_geo_tag_photo),
            yn(c.extra_docs),
            yn(c.feasibilty_document),
            yn(c.subsidy_token_photo),
            yn(c.application_acknowledgment),
            yn(c.vendor_feasibility),
            yn(c.site_feasibility),
            yn(c.digital_certificate),
            loanLabel,
            c.cash_details?.total_amount || '',
            c.roof_shed || '',
            c.dc_cable || '',
            c.ac_cable || '',
            c.structure_front_leg_height || '',
            c.structure_rear_leg_height || '',
            c.invoice_no || '',
            c.invoice_value || '',
            c.material_order_notes || '',
            c.inverter_make || '',
            c.inverter_serial_no || '',
            panelSerials,
            c.vendor || '',
            c.driver_name || '',
            c.driver_phone_number || '',
            c.vehicle_number || '',
            c.material_delivery_date || '',
            c.delivery_status || '',
            c.vendor_payment_status || '',
            c.vendor_quote || '',
            c.vendor_paid_date || '',
            c.installation_status || '',
            c.installation_date || '',
            c.installation_note || '',
            c.geo_tag_status || '',
            c.meter_installation || '',
            c.discom_inspection || '',
            yn(c.pm_surya_ghar_stamp),
            subsidyLabel,
            yn(c.warranty_card),
            yn(c.insurance_status),
            c.hold_procurement || '',
            c.internal_remarks || '',
            flattenStageRemarks(c.stages_remarks),
            c.created_at ? new Date(c.created_at).toLocaleDateString('en-IN') : '',
            c.updated_at ? new Date(c.updated_at).toLocaleDateString('en-IN') : '',
            // ── Previously missing columns ──────────────────────────────
            c.vendor_note || '',
            yn(c.vendor_give_up_approved),
            c.vendor_paid_by || '',
            c.delivery_batch_id || '',
            yn(c.dcr_certificate),
            yn(c.signature_pic),
            yn(c.stamp),
            yn(c.sfdc_photo),
            yn(c.meter_installation_photo),
            yn(c.geo_tag_image),
            ds.submitted_by || '',
            ds.date || '',
            ds.first_party || '',
            ds.second_party || '',
            ds.purchased_party || '',
            sr.discom_agreement_date || '',
            ds.stamp_value || '',
            ds.stamp_description || '',
            yn(ds.sent_to_stamp_maker),
            ds.sent_to_stamp_maker_by || '',
            yn(ds.stamp_sent),
            yn(ds.stamp_approved),
            ds.stamp_approved_by || '',
            ds.stamp_completed_at || '',
            ds.stamp_completed_by || '',
            ds.stamp_remark || '',
            ds.stamp_sendback_remark || '',
            ds.stamp_sendback_by || '',
            flattenHistory(c.loan_history),
            flattenHistory(c.subsidy_history)
        ].map(escapeCSV).join(',');
    });

    const csvContent = '\uFEFF' + [headers.map(escapeCSV).join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    downloadFileWithSaveAs(url, `solarflow_crm_export_${currentDateStr}.csv`).finally(() => {
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    });
}

// ─── Indian Number System Formatters ──────────────────────────────────────────
// Indian comma system: 1,00,000  (lakhs), 1,00,00,000 (crores)

/** Format a number with Indian commas (no ₹ symbol). e.g. 123456 → "1,23,456" */
export function toIndianCommas(val) {
    const n = Number(String(val).replace(/,/g, ''));
    if (isNaN(n) || val === '' || val == null) return '';
    const [intPart, decPart] = n.toString().split('.');
    // Indian grouping: last 3 digits, then groups of 2
    const lastThree = intPart.slice(-3);
    const rest = intPart.slice(0, -3);
    const formatted = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + (rest ? ',' : '') + lastThree;
    return decPart !== undefined ? `${formatted}.${decPart}` : formatted;
}

/** Format as ₹ with Indian commas. e.g. 123456 → "₹1,23,456". Returns '–' for empty. */
export function formatINR(val) {
    const n = Number(val);
    if (!val || isNaN(n)) return '–';
    return '₹' + toIndianCommas(n);
}

/** Compact Indian format: ₹1.23L, ₹2.50Cr. Falls back to full ₹ format for < 1L. */
export function formatINRCompact(val) {
    const n = Number(val) || 0;
    if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} Cr`;
    if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(2)} L`;
    if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)}k`;
    return '₹' + toIndianCommas(n);
}

/** Strip commas from an Indian-formatted string → raw number for DB storage. */
export function parseIndianNumber(str) {
    if (str === '' || str == null) return '';
    const cleaned = String(str).replace(/,/g, '');
    const n = Number(cleaned);
    return isNaN(n) ? '' : n;
}

/** Live-format a typed value with Indian commas. Used in onChange for money inputs. */
export function formatInputValue(val) {
    const str = String(val).replace(/[^0-9.]/g, '');
    if (str === '' || str === '.') return str;
    // Don't format if user is still typing decimals
    if (str.endsWith('.')) return toIndianCommas(str.split('.')[0]) + '.';
    return toIndianCommas(str);
}

// ─── Date / Number Formatters ─────────────────────────────────────────────────
export function formatLogDate(dateStr) {
    return new Date(dateStr).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
    });
}

export function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('en-IN');
}

/**
 * Returns today's date formatted as 'YYYY-MM-DD' in Indian Standard Time (IST, UTC+5:30).
 * Avoids the UTC-boundary bug of `toISOString().split('T')[0]` between 12:00 AM - 5:30 AM IST.
 */
export function getTodayISTDateString(date = new Date()) {
    try {
        return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date);
    } catch {
        return date.toISOString().split('T')[0];
    }
}


export function formatDateToDDMMYYYY(dateStr) {
    if (!dateStr) return "";
    const str = String(dateStr);
    const datePart = str.includes("T") ? str.split("T")[0] : str;
    const parts = datePart.split("-");
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return str;
}

/**
 * High-speed client-side image compression
 * Automatically downscales large phone/camera images (5-15MB) to ~200-400KB
 * Keeps PDFs and non-image files untouched.
 */
export async function compressImage(file, { maxWidth = 1920, maxHeight = 1920, quality = 0.82 } = {}) {
    if (!file || !file.type || !file.type.startsWith('image/')) {
        return file;
    }

    // Skip SVGs or tiny images
    if (file.type === 'image/svg+xml' || file.size < 300 * 1024) {
        return file;
    }

    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                if (width <= maxWidth && height <= maxHeight && file.size < 800 * 1024) {
                    return resolve(file);
                }

                if (width > height) {
                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob(
                    (blob) => {
                        if (!blob || blob.size >= file.size) {
                            return resolve(file);
                        }
                        const cleanExt = file.name.replace(/\.[^/.]+$/, '.jpg');
                        const compressedFile = new File([blob], cleanExt, {
                            type: 'image/jpeg',
                            lastModified: Date.now(),
                        });
                        resolve(compressedFile);
                    },
                    'image/jpeg',
                    quality
                );
            };
            img.onerror = () => resolve(file);
        };
        reader.onerror = () => resolve(file);
    });
}

export const uploadDocument = async (file, customerId, docType = null, passedUserId = null) => {
    try {
        if (!customerId || String(customerId).startsWith('demo-')) {
            return {
                id: 'demo-doc-' + Date.now(),
                customer_id: customerId,
                file_name: file.name,
                storage_path: 'mock/' + file.name,
                file_type: file.type || 'application/pdf',
                doc_type: docType,
                uploaded_by: passedUserId || 'demo-user',
                uploaded_at: new Date().toISOString()
            };
        }

        const isImage = file.type && file.type.startsWith('image/');
        const processedFile = isImage ? await compressImage(file) : file;
        const cleanName = processedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const uuidPrefix = (typeof crypto !== 'undefined' && crypto.randomUUID) 
            ? crypto.randomUUID() 
            : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        const filePath = `${customerId}/${uuidPrefix}_${cleanName}`;

        // Validate UUID for uploaded_by column
        const isUUID = (str) => typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
        
        let sessionPromise = null;
        if (!isUUID(passedUserId)) {
            sessionPromise = supabase.auth.getSession().catch(() => null);
        }

        let contentType = processedFile.type || 'application/octet-stream';
        if (cleanName.endsWith('.png') && (!contentType || contentType === 'image/svg+xml')) {
            contentType = 'image/png';
        } else if (/\.(jpe?g)$/i.test(cleanName) && (!contentType || contentType === 'image/svg+xml')) {
            contentType = 'image/jpeg';
        }

        const uploadPromise = supabase.storage
            .from('customer-documents')
            .upload(filePath, processedFile, {
                cacheControl: '3600',
                upsert: true,
                contentType: contentType
            });

        const [uploadRes, sessionData] = await Promise.all([uploadPromise, sessionPromise]);
        
        if (uploadRes.error) {
            console.error('Storage upload failed:', uploadRes.error);
            throw new Error(uploadRes.error.message || 'Storage upload failed');
        }

        let validUserId = isUUID(passedUserId) ? passedUserId : null;
        if (!validUserId && sessionData) {
            const sessionUserId = sessionData?.data?.session?.user?.id;
            if (isUUID(sessionUserId)) {
                validUserId = sessionUserId;
            }
        }

        const insertPayload = {
            customer_id: customerId,
            file_name: processedFile.name,
            storage_path: filePath,
            file_type: contentType,
            doc_type: docType,
            uploaded_by: validUserId
        };

        let { data, error } = await supabase
            .from('documents')
            .insert(insertPayload)
            .select()
            .single();

        // Fallback retry without uploaded_by if schema constraint error occurs
        if (error && validUserId) {
            console.warn('Retrying document insert without uploaded_by:', error);
            delete insertPayload.uploaded_by;
            const retryRes = await supabase
                .from('documents')
                .insert(insertPayload)
                .select()
                .single();
            data = retryRes.data;
            error = retryRes.error;
        }

        if (error) {
            console.error('Failed to record document in DB:', error);
            throw new Error(error.message || 'Database insert failed');
        }
        return data;
    } catch (err) {
        console.error('Error in uploadDocument:', err);
        throw err;
    }
};

export const getCustomerDocuments = async (customerId) => {
    if (!customerId) return [];
    if (String(customerId).startsWith('demo-')) {
        return [
            { id: 'demo-doc-1', doc_type: 'adhaar_card_front', file_name: 'adhaar_card_front.pdf', file_type: 'application/pdf', storage_path: 'mock/adhaar_front.pdf' },
            { id: 'demo-doc-2', doc_type: 'adhaar_card_back', file_name: 'adhaar_card_back.pdf', file_type: 'application/pdf', storage_path: 'mock/adhaar_back.pdf' },
            { id: 'demo-doc-3', doc_type: 'electricity_bill', file_name: 'electricity_bill.pdf', file_type: 'application/pdf', storage_path: 'mock/electricity_bill.pdf' },
            { id: 'demo-doc-4', doc_type: 'passport_photo', file_name: 'passport_photo.pdf', file_type: 'application/pdf', storage_path: 'mock/passport_photo.pdf' },
            { id: 'demo-doc-5', doc_type: 'cancelled_cheque', file_name: 'cancelled_cheque.pdf', file_type: 'application/pdf', storage_path: 'mock/cancelled_cheque.pdf' },
            { id: 'demo-doc-6', doc_type: 'geo_tag_photo', file_name: 'geo_tag_photo.jpg', file_type: 'image/jpeg', storage_path: 'mock/geo_tag_photo.jpg' },
            { id: 'demo-doc-7', doc_type: 'meter_photo', file_name: 'meter_installation_photo.jpg', file_type: 'image/jpeg', storage_path: 'mock/meter_photo.jpg' },
        ];
    }
    const allDocuments = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
            .from('documents')
            .select('*')
            .eq('customer_id', customerId)
            .order('uploaded_at', { ascending: false })
            .range(from, from + pageSize - 1);

        if (error) {
            console.error('Failed to fetch documents:', error);
            break;
        }
        const page = data || [];
        allDocuments.push(...page);
        if (page.length < pageSize) break;
    }
    return allDocuments;
};

export const getViewUrl = async (storagePath) => {
    if (!storagePath) return null;
    if (storagePath.startsWith('mock/') || storagePath.startsWith('http')) {
        return '/demo-document.svg';
    }

    try {
        const { data: blob, error: dlErr } = await supabase.storage
            .from('customer-documents')
            .download(storagePath);

        if (!dlErr && blob) {
            const ext = storagePath.split('.').pop()?.toLowerCase();
            let correctType = blob.type;
            if (ext === 'png' && blob.type !== 'image/png') correctType = 'image/png';
            if (['jpg', 'jpeg'].includes(ext) && blob.type !== 'image/jpeg') correctType = 'image/jpeg';
            if (ext === 'webp' && blob.type !== 'image/webp') correctType = 'image/webp';
            if (ext === 'pdf' && blob.type !== 'application/pdf') correctType = 'application/pdf';

            const finalBlob = correctType !== blob.type ? new Blob([blob], { type: correctType }) : blob;
            return URL.createObjectURL(finalBlob);
        }
    } catch (e) {
        console.warn('Direct blob preview notice:', e);
    }

    const { data, error } = await supabase.storage
        .from('customer-documents')
        .createSignedUrl(storagePath, 3600);

    if (error) console.error('Failed to get view URL:', error);
    return data?.signedUrl || null;
};

export const getDownloadUrl = async (storagePath, fileName) => {
    if (!storagePath) return null;
    if (storagePath.startsWith('mock/') || storagePath.startsWith('http')) {
        return '/demo-document.svg';
    }

    try {
        const { data: blob } = await supabase.storage
            .from('customer-documents')
            .download(storagePath);

        if (blob) {
            return URL.createObjectURL(blob);
        }
    } catch (e) {
        console.warn('Direct blob download notice:', e);
    }

    const { data, error } = await supabase.storage
        .from('customer-documents')
        .createSignedUrl(storagePath, 3600, { download: fileName || true });

    if (error) console.error('Failed to get download URL:', error);
    return data?.signedUrl || null;
};

const announceCompletedDownload = (file, fileName) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('solarflow:download-complete', {
        detail: { file: file || null, fileName: file?.name || fileName || 'document' }
    }));
};

/**
 * Downloads a file, prompting the user with the native OS "Save As" location dialog
 * when supported (Chrome, Edge, Opera, Desktop), with standard fallback.
 */
export const downloadFileWithSaveAs = async (url, fileName) => {
    if (!url) return;

    if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error('Network response was not ok');
            const blob = await response.blob();

            const ext = (fileName || '').split('.').pop()?.toLowerCase();
            const fileHandle = await window.showSaveFilePicker({
                suggestedName: fileName || 'document',
                types: ext ? [{
                    description: `${ext.toUpperCase()} File`,
                    accept: { [blob.type || 'application/octet-stream']: [`.${ext}`] }
                }] : undefined
            });

            const writableStream = await fileHandle.createWritable();
            await writableStream.write(blob);
            await writableStream.close();
            announceCompletedDownload(new File([blob], fileName || 'document', {
                type: blob.type || 'application/octet-stream'
            }), fileName);
            return;
        } catch (err) {
            if (err.name === 'AbortError') {
                // User cancelled the Save dialog
                return;
            }
            console.warn('showSaveFilePicker fallback to anchor download:', err);
        }
    }

    // Standard browser download. Fetching the file first also lets mobile
    // browsers pass the real file to the native share sheet after download.
    let downloadUrl = url;
    let downloadedFile = null;
    let objectUrl = null;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Network response was not ok');
        const blob = await response.blob();
        downloadedFile = new File([blob], fileName || 'document', {
            type: blob.type || 'application/octet-stream'
        });
        objectUrl = URL.createObjectURL(blob);
        downloadUrl = objectUrl;
    } catch (error) {
        // Cross-origin URLs can still be downloaded even when JavaScript is not
        // allowed to read their bytes; sharing is simply unavailable in that case.
        console.warn('File could not be prepared for native sharing:', error);
    }

    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = fileName || 'download';
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    announceCompletedDownload(downloadedFile, fileName);
};

const safeDownloadName = (value, fallback = 'file') => {
    const cleaned = String(value || '').replace(/[\\/:*?"<>|]+/g, '_').trim();
    return cleaned || fallback;
};

const BULK_DOWNLOAD_EXCLUDED_TYPES = new Set([
    'signature_pic', 'signature', 'firstPartySignature', 'customer_signature',
    // Meter Installation Photo was removed from the workflow. Keep legacy
    // rows/storage intact, but never include either historical alias in the
    // combined customer-document PDF.
    'meter_installation_photo', 'meter_photo'
]);

const isBulkDownloadExcluded = (doc) => {
    if (BULK_DOWNLOAD_EXCLUDED_TYPES.has(doc?.doc_type)) return true;
    // Covers older/imported rows whose type was blank or inconsistent but whose
    // filename clearly identifies the retired meter-installation photograph.
    const fileName = String(doc?.file_name || '').toLowerCase().replace(/[\s-]+/g, '_');
    return fileName.includes('meter_installation_photo') || fileName.includes('meter_photo');
};

const blobToOptimizedJpeg = async (blob) => {
    const objectUrl = URL.createObjectURL(blob);
    try {
        const image = await new Promise((resolve, reject) => {
            const element = new Image();
            element.onload = () => resolve(element);
            element.onerror = () => reject(new Error('The image could not be decoded.'));
            element.src = objectUrl;
        });
        // Phone photos can be 12-50 MP. Resize before embedding so PDF creation
        // does not exhaust a mobile browser's memory.
        const maxSide = 1800;
        const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) throw new Error('Image conversion is unavailable in this browser.');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        const jpegBlob = await new Promise((resolve, reject) => {
            canvas.toBlob(
                result => result ? resolve(result) : reject(new Error('The image could not be converted.')),
                'image/jpeg',
                0.82
            );
        });
        return { bytes: await jpegBlob.arrayBuffer(), width, height };
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
};

// Combines PDFs and images into one phone-friendly PDF. Source files are fetched
// sequentially to cap peak memory. It never changes Storage or document rows.
export const downloadDocumentsAsPdf = async (documents, customerName) => {
    const docs = (documents || []).filter(doc =>
        doc?.storage_path && !isBulkDownloadExcluded(doc)
    );
    if (docs.length === 0) throw new Error('This client has no documents to download.');

    const pdfName = `${safeDownloadName(customerName, 'client')}-documents.pdf`;
    let saveHandle = null;
    // Ask where to save immediately while the click still counts as a direct
    // user gesture. Waiting until every document is downloaded can cause the
    // browser to suppress the native picker.
    if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
        try {
            saveHandle = await window.showSaveFilePicker({
                suggestedName: pdfName,
                types: [{
                    description: 'PDF document',
                    accept: { 'application/pdf': ['.pdf'] }
                }]
            });
        } catch (error) {
            if (error?.name === 'AbortError') return { downloaded: 0, failed: [], cancelled: true };
            console.warn('PDF Save As picker unavailable; using browser download:', error);
        }
    }

    // Loaded only when Download All is tapped, keeping the normal CRM bundle fast.
    const { PDFDocument } = await import('pdf-lib');
    const outputPdf = await PDFDocument.create();
    const failures = [];
    let included = 0;

    // Supabase can sign every private object in one request. The previous code
    // made one signing request per document before downloading the files.
    const storedDocs = docs.filter(doc => !doc.storage_path.startsWith('mock/') && !doc.storage_path.startsWith('http'));
    const signedUrlByPath = new Map();
    if (storedDocs.length > 0) {
        const { data: signedFiles, error: signedError } = await supabase.storage
            .from('customer-documents')
            .createSignedUrls(storedDocs.map(doc => doc.storage_path), 3600);
        if (signedError) throw signedError;
        (signedFiles || []).forEach(file => {
            if (file?.path && file?.signedUrl) signedUrlByPath.set(file.path, file.signedUrl);
        });
    }

    // Fetch three files at a time. This removes most of the network waiting of
    // a fully sequential download while bounding phone memory to one small batch.
    const batchSize = 3;
    for (let offset = 0; offset < docs.length; offset += batchSize) {
        const batch = docs.slice(offset, offset + batchSize);
        const fetched = await Promise.all(batch.map(async doc => {
            try {
                const url = doc.storage_path.startsWith('mock/') || doc.storage_path.startsWith('http')
                    ? await getDownloadUrl(doc.storage_path, doc.file_name)
                    : signedUrlByPath.get(doc.storage_path);
                if (!url) throw new Error('No download URL returned');
                const response = await fetch(url);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return { doc, blob: await response.blob(), error: null };
            } catch (error) {
                return { doc, blob: null, error };
            }
        }));

        for (const { doc, blob, error: fetchError } of fetched) {
            if (fetchError) {
                console.error('Document PDF item failed:', doc.file_name, fetchError);
                failures.push(doc.file_name || 'unnamed document');
                continue;
            }
            try {
                const fileName = String(doc.file_name || '').toLowerCase();
                const isPdf = blob.type === 'application/pdf' || fileName.endsWith('.pdf');
                const isImage = blob.type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(fileName);
                if (isPdf) {
                    const sourcePdf = await PDFDocument.load(await blob.arrayBuffer(), { ignoreEncryption: true });
                    const pages = await outputPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
                    pages.forEach(page => outputPdf.addPage(page));
                } else if (isImage) {
                    const optimized = await blobToOptimizedJpeg(blob);
                    const embedded = await outputPdf.embedJpg(optimized.bytes);
                    const pageSize = optimized.height >= optimized.width
                        ? [595.28, 841.89]
                        : [841.89, 595.28];
                    const page = outputPdf.addPage(pageSize);
                    const margin = 24;
                    const fit = Math.min(
                        (pageSize[0] - margin * 2) / embedded.width,
                        (pageSize[1] - margin * 2) / embedded.height
                    );
                    const width = embedded.width * fit;
                    const height = embedded.height * fit;
                    page.drawImage(embedded, {
                        x: (pageSize[0] - width) / 2,
                        y: (pageSize[1] - height) / 2,
                        width,
                        height,
                    });
                } else {
                    throw new Error('Unsupported file type');
                }
                included += 1;
            } catch (error) {
                console.error('Document PDF item failed:', doc.file_name, error);
                failures.push(doc.file_name || 'unnamed document');
            }
        }
    }

    if (included === 0 || outputPdf.getPageCount() === 0) {
        throw new Error('None of the client documents could be converted to PDF.');
    }
    const pdfBlob = new Blob([await outputPdf.save({ useObjectStreams: true })], { type: 'application/pdf' });
    if (saveHandle) {
        const writable = await saveHandle.createWritable();
        await writable.write(pdfBlob);
        await writable.close();
        announceCompletedDownload(new File([pdfBlob], pdfName, { type: 'application/pdf' }), pdfName);
        return { downloaded: included, failed: failures, cancelled: false };
    }

    const objectUrl = URL.createObjectURL(pdfBlob);
    try {
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = pdfName;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
    } finally {
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    }
    announceCompletedDownload(new File([pdfBlob], pdfName, { type: 'application/pdf' }), pdfName);
    return { downloaded: included, failed: failures, cancelled: false };
};

// Returns { ok, error }. Previously swallowed every failure with console.error,
// so an RLS-refused delete removed the row from the list, wrote a "Deleted
// document" audit entry, and the file reappeared on refresh.
export const deleteDocument = async (documentId, storagePath) => {
    const id = typeof documentId === 'object' && documentId !== null ? documentId.id : documentId;
    const path = typeof documentId === 'object' && documentId !== null ? documentId.storage_path : storagePath;

    if (id) {
        // Delete the row FIRST. If it fails we still have the storage object,
        // so nothing is orphaned; the reverse order loses the file for good.
        const res = await runWrite(
            supabase.from('documents').delete().eq('id', id).select('id'),
            { action: 'document deletion' }
        );
        if (!res.ok) return res;
    }

    if (path) {
        const { error: storageErr } = await supabase.storage.from('customer-documents').remove([path]);
        if (storageErr) {
            // The record is gone, which is what the user asked for. The stored
            // file is now orphaned - worth logging, not worth failing over.
            console.warn('Document row deleted but the stored file remains:', storageErr.message);
        }
    }

    return { ok: true, error: null };
};

// Returns { ok, error }. Callers MUST check `ok` - this used to return the row
// (undefined on failure) and log to the console, so every "Saved!" badge and
// every "[RETURNED]" flag was reported whether or not the write landed.
export const updateDocumentRemark = async (documentId, remark) => {
    if (!documentId) return { ok: false, error: new Error('No document was specified.') };

    return runWrite(
        supabase.from('documents').update({ remark: remark || '' }).eq('id', documentId).select('id'),
        { action: 'remark' }
    );
};

export async function fetchAgent2SubAgents(branchName) {
    const clean = (branchName || '').trim();
    if (!clean) return [];
    try {
        const { data, error } = await supabase
            .from('demo_profiles')
            .select('name')
            // New Channel Partners use agent2. Older accounts used agent,
            // so include both while the saved profiles are being aligned.
            .in('user_type', ['agent2', 'agent'])
            .ilike('channel_partner', clean);
        if (error || !data) return [];
        return [...new Set(data.map(p => (p.name || '').trim()).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b));
    } catch (err) {
        console.error('Error fetching sub-agents:', err);
        return [];
    }
}

// ─── Tag Normalizers ──────────────────────────────────────────────────────────
export const normalizeLoanTag = (tag) => {
    if (!tag) return null;
    const s = String(tag).trim().toLowerCase();
    if (s === 'all clear' || s === 'all_clear' || s === 'allclear' || s === 'clear') return 'All Clear';
    if (s === 'in progress' || s === 'in_progress' || s === 'inprogress' || s === 'pending') return 'In Progress';
    if (s === 'processed' || s.includes('process')) return 'Processed';
    if (s.includes('1st') || s.includes('first')) return '1st Payment';
    if (s.includes('2nd') || s.includes('second')) return '2nd Payment';
    if (s.includes('sanc') || s.includes('approved')) return 'Sanctioned';
    if (s.includes('return')) return 'Returned';
    if (s.includes('reject') || s.includes('decline')) return 'Rejected';
    return tag.trim();
};

export const normalizeSubsidyTag = (tag) => {
    if (!tag) return null;
    const s = String(tag).trim().toLowerCase();
    if (s === 'received' || s.includes('receiv') || s.includes('claim') || s.includes('credit')) return 'Received';
    if (s === 'in process' || s === 'in_process' || s === 'inprocess' || s.includes('process')) return 'In Process';
    if (s === 'redeemed' || s.includes('redeem')) return 'Redeemed';
    if (s === 'return' || s === 'returned' || s.includes('return')) return 'Returned';
    if (s === 'approved' || s.includes('approv')) return 'Approved';
    if (s === 'rejected' || s.includes('reject')) return 'Rejected';
    return tag.trim();
};

export const normalizeInstallationStatus = (status) => {
    if (!status) return null;
    const s = String(status).trim().toLowerCase();
    if (s === 'give up' || s === 'giveup' || s === 'given up' || s === 'cancelled') return 'Give Up';
    if (s === 'yes' || s === 'completed' || s === 'done' || s === 'installed') return 'Yes';
    if (s === 'proceed' || s === 'process' || s === 'processing' || s === 'in progress' || s === 'wip') return 'Process';
    if (s === 'pending' || s === 'no' || s === 'waiting' || s === 'not started') return 'Pending';
    return 'Pending';
};

// ─── Dynamic Import with Auto-Reload on Stale Chunks ─────────────────────────
import { lazy } from 'react';

export function lazyWithRetry(componentImport) {
    return lazy(async () => {
        const pageHasBeenForceRefreshed = window.sessionStorage.getItem('retry-lazy-refreshed') === 'true';
        try {
            const component = await componentImport();
            window.sessionStorage.setItem('retry-lazy-refreshed', 'false');
            return component;
        } catch (error) {
            console.warn('Dynamic import failed (likely stale build chunk after new deploy), reloading latest bundle...', error);
            if (!pageHasBeenForceRefreshed) {
                window.sessionStorage.setItem('retry-lazy-refreshed', 'true');
                window.location.reload();
                return { default: () => null };
            }
            throw error;
        }
    });
}
