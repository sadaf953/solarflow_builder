// Saving imported customers in batches. Kept apart from the view so the
// "was it saved after all?" logic can be tested without a database.

/**
 * Inserts `rows` in batches of `batchSize`, each row given a new `id` first.
 * The ids are made here, not by the database, because a batch can be saved
 * while its reply is lost (a dropped connection, a timeout): with the ids in
 * hand, `findSaved` asks which of them exist, so those rows are counted as
 * saved and can still be undone, instead of being reported "Not saved" and
 * imported a second time.
 *
 * insert(rowsWithIds) and findSaved(ids) resolve to { data: [{ id }], error }
 * (Supabase's shape). Stops at the first batch that is not wholly saved.
 * Returns { ids, savedIndexes, failure }: the saved ids, the indexes into
 * `rows` that were saved, and { index, message } for the first row that was
 * not, or null when every row was saved.
 */
export async function insertInBatches({ rows, insert, findSaved, batchSize = 100, newId = () => crypto.randomUUID(), onProgress = () => {} }) {
    const ids = [];
    const savedIndexes = [];
    for (let start = 0; start < rows.length; start += batchSize) {
        const batch = rows.slice(start, start + batchSize).map(row => ({ ...row, id: newId() }));
        const batchIds = batch.map(row => row.id);
        const response = await settle(() => insert(batch));
        let saved = new Set((response.data || []).map(row => row.id));
        let message = response.error?.message || '';
        let checked = true;
        if (response.error || saved.size !== batch.length) {
            const check = await settle(() => findSaved(batchIds));
            if (check.error) {
                checked = false;
                console.error('Could not check which customers were saved:', check.error);
            } else {
                saved = new Set((check.data || []).map(row => row.id));
            }
        }
        batchIds.forEach((id, offset) => {
            if (saved.has(id)) { ids.push(id); savedIndexes.push(start + offset); }
        });
        onProgress(ids.length);
        if (saved.size === batch.length) continue;

        const index = start + batchIds.findIndex(id => !saved.has(id));
        if (!message) message = 'The database did not confirm every customer in this batch.';
        if (!checked) message += ' SolarFlow could not check whether these rows were saved, so look for them in Customers before importing them again.';
        return { ids, savedIndexes, failure: { index, message } };
    }
    return { ids, savedIndexes, failure: null };
}

// A thrown error (no network) becomes { error }, like a refused request.
async function settle(call) {
    try {
        return (await call()) || {};
    } catch (error) {
        return { error };
    }
}
