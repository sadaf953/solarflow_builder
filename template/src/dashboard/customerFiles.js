// A customer's uploaded files, for permanent deletion. Files live under
// '<customer id>/' in the customer-documents bucket, and the storage policies
// only let the app reach them while the customer row exists, so they are
// removed before the row is deleted.

import { supabase } from '../supabase';

const BUCKET = 'customer-documents';
const LIST_PAGE = 1000;
const REMOVE_BATCH = 100;

/** Paths of every file stored under the customer's folder. */
export async function customerFilePaths(customerId) {
    const paths = [];
    for (let offset = 0; ; offset += LIST_PAGE) {
        const { data, error } = await supabase.storage.from(BUCKET).list(customerId, { limit: LIST_PAGE, offset });
        if (error) throw error;
        // Folders come back with no id; uploads are never nested.
        (data || []).filter(item => item.id).forEach(item => paths.push(`${customerId}/${item.name}`));
        if (!data || data.length < LIST_PAGE) return paths;
    }
}

/**
 * Removes every stored file of a customer. Never rejects: resolves
 * { removed, failed } with the number of files in each, and `failed` is -1
 * when the folder could not be read at all.
 */
export async function removeCustomerFiles(customerId) {
    let paths;
    try {
        paths = await customerFilePaths(customerId);
    } catch (error) {
        console.warn('Could not list the customer files:', error?.message);
        return { removed: 0, failed: -1 };
    }
    let removed = 0;
    let failed = 0;
    for (let start = 0; start < paths.length; start += REMOVE_BATCH) {
        const batch = paths.slice(start, start + REMOVE_BATCH);
        const { data, error } = await supabase.storage.from(BUCKET).remove(batch);
        if (error) {
            console.warn('Could not remove customer files:', error.message);
            failed += batch.length;
        } else {
            // A file the policies refused is simply missing from the result.
            const gone = Array.isArray(data) ? data.length : batch.length;
            removed += gone;
            failed += batch.length - gone;
        }
    }
    return { removed, failed };
}
