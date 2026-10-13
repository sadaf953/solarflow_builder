// ─── utils.jsx ────────────────────────────────────────────────────────────────
// Shared helpers: activity log, safe writes, number formatting and documents.
// ──────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { ADMIN_COLUMNS, ADMIN_NUMERIC_COLUMNS } from './constants';
import { fetchAllPages } from './lib/db.js';

export { lazyWithRetry } from './lib/lazy.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Activity Logging ─────────────────────────────────────────────────────────
export async function logActivity(
    userId,
    action,
    message,
    details = '',
    customerId = null
) {
    if (userId && !UUID.test(userId)) {
        console.warn('Skipping activity log: invalid user_id UUID');
        return;
    }
    if (customerId && !UUID.test(customerId)) {
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
// Active dropdown rows grouped by category, in sort order:
// { module_brand: ['ADANI', 'WAAREE'], inverter_make: [...], ... }
export function useMetadata() {
    const [meta, setMeta] = useState({});
    useEffect(() => {
        supabase.from('metadata').select('category, label').eq('is_active', true)
            .order('sort_order').order('label').then(({ data }) => {
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

    // sanitizePhoneNumber lets a lone '+' survive so +91 can be typed, but a
    // phone of only '+' (or '') is stored as NULL.
    ['phone_number', 'driver_phone_number'].forEach(field => {
        if (clean[field] === undefined) return;
        const v = String(clean[field] ?? '').trim();
        if (v === '' || v === '+') clean[field] = null;
    });

    return clean;
}

// Phone numbers, one rule for every entry point.
//
// Accepts a plain 10-digit local number OR an international form with a leading
// "+" (e.g. +910000000000). Everything that is not a digit or a leading + is
// stripped as you type, so spaces, dashes and brackets pasted from a contact
// list are cleaned rather than rejected.
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

// `meter_installation` is a plain 'Yes' / 'No' string; older rows stored an
// object ({ status, ... }). Normalising on read heals them on the next save.
export function normalizeMeterInstallation(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return value.status || '';
    const str = String(value).trim();
    if (str.startsWith('{')) {
        try { return (JSON.parse(str) || {}).status || ''; } catch { return ''; }
    }
    return str;
}

// ─── The write guard every table needs ────────────────────────────────────────
// supabase-js never throws, and an UPDATE/DELETE refused by RLS matches ZERO
// rows while returning `error: null`, so "no error" is not proof of a save.
// Pass a builder that already has .select(...) on it:
//
//     const res = await runWrite(
//         supabase.from('profiles').update({ name }).eq('id', id).select('id'),
//         { action: 'name change' }
//     );
//     if (!res.ok) throw res.error;
//
// `expectRows: false` is for writes where matching nothing is legitimate.
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

// The one safe way to write to `admin`. Returns { ok, error }; `ok: false`
// with no error means the row was not matched (refused by RLS, or deleted).
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
async function compressImage(file, { maxWidth = 1920, maxHeight = 1920, quality = 0.82 } = {}) {
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
        if (!customerId) throw new Error('Save the customer before attaching documents.');

        const isImage = file.type && file.type.startsWith('image/');
        const processedFile = isImage ? await compressImage(file) : file;
        const cleanName = processedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const uuidPrefix = (typeof crypto !== 'undefined' && crypto.randomUUID) 
            ? crypto.randomUUID() 
            : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        const filePath = `${customerId}/${uuidPrefix}_${cleanName}`;

        const isUUID = (str) => typeof str === 'string' && UUID.test(str);

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
    return fetchAllPages(() => supabase
        .from('documents')
        .select('*')
        .eq('customer_id', customerId)
        .order('uploaded_at', { ascending: false }), { onError: 'partial' });
};

export const getViewUrl = async (storagePath) => {
    if (!storagePath) return null;

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
    const signedUrlByPath = new Map();
    const { data: signedFiles, error: signedError } = await supabase.storage
        .from('customer-documents')
        .createSignedUrls(docs.map(doc => doc.storage_path), 3600);
    if (signedError) throw signedError;
    (signedFiles || []).forEach(file => {
        if (file?.path && file?.signedUrl) signedUrlByPath.set(file.path, file.signedUrl);
    });

    // Fetch three files at a time. This removes most of the network waiting of
    // a fully sequential download while bounding phone memory to one small batch.
    const batchSize = 3;
    for (let offset = 0; offset < docs.length; offset += batchSize) {
        const batch = docs.slice(offset, offset + batchSize);
        const fetched = await Promise.all(batch.map(async doc => {
            try {
                const url = signedUrlByPath.get(doc.storage_path);
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

// Names of the dealer logins under a partner office, for the Dealer dropdown.
// RLS limits which profiles each login can read.
export async function fetchAgent2SubAgents(branchName) {
    const clean = (branchName || '').trim();
    if (!clean) return [];
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('name')
            .eq('user_type', 'agent2')
            .ilike('channel_partner', clean.replace(/[\\%_]/g, ch => '\\' + ch));
        if (error || !data) return [];
        return [...new Set(data.map(p => (p.name || '').trim()).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b));
    } catch (err) {
        console.error('Error fetching dealers:', err);
        return [];
    }
}

export const normalizeInstallationStatus = (status) => {
    if (!status) return null;
    const s = String(status).trim().toLowerCase();
    if (s === 'give up' || s === 'giveup' || s === 'given up' || s === 'cancelled') return 'Give Up';
    if (s === 'yes' || s === 'completed' || s === 'done' || s === 'installed') return 'Yes';
    if (s === 'proceed' || s === 'process' || s === 'processing' || s === 'in progress' || s === 'wip') return 'Process';
    if (s === 'pending' || s === 'no' || s === 'waiting' || s === 'not started') return 'Pending';
    return 'Pending';
};
